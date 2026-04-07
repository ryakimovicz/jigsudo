import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getJigsudoDateString } from "../js/utils/time.js?v=1.1.2"; // Uses Jigsudo offset handling
import { getRankData } from "../js/ranks.js?v=1.1.2"; // Uses dynamic bounds for decay penalty
const MISSED_DAY_PENALTY = 10.0;

async function runDecay() {
  console.log("📉 [Decay Service] Starting automated decay execution...");

  // Initialize Firebase Admin using Service Account from Environment Variable
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) {
    console.error(
      "❌ Fatal: FIREBASE_SERVICE_ACCOUNT environment variable not set or empty.",
    );
    console.error(
      "👉 Ensure you have added the 'FIREBASE_SERVICE_ACCOUNT' secret in your GitHub repository settings.",
    );
    process.exit(1);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountRaw);
  } catch (err) {
    console.error(
      "❌ Fatal: Failed to parse FIREBASE_SERVICE_ACCOUNT. Must be valid JSON.",
      err,
    );
    process.exit(1);
  }

  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const todayStr = getJigsudoDateString();
  console.log(`🕒 Jigsudo Target Date: ${todayStr}`);

  try {
    const usersRef = db.collection("users");

    // Optimization: Only fetch users whose last update was BEFORE today.
    // If a user already self-healed via the client, they will be skipped here.
    const snapshot = await usersRef.where("lastDailyUpdate", "<", todayStr).get();

    if (snapshot.empty) {
      console.log("✅ No eligible users found for decay.");
      process.exit(0);
    }

    const batch = db.batch();
    let penalizedCount = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const lastUpdate = data.lastDailyUpdate;

      if (!lastUpdate) return; // Never played, skip decay logic

      // Strict day difference calculation using Jigsudo dates
      const lastDate = new Date(lastUpdate + "T12:00:00Z");
      const todayDate = new Date(todayStr + "T12:00:00Z");
      const diffDays = Math.round(
        (todayDate - lastDate) / (1000 * 60 * 60 * 24),
      );

      if (diffDays >= 1) {
        // Prepare update object with mandatory resets for a new day
        const updateObj = {
          dailyRP: 0,
          "stats.dailyRP": 0,
          "stats.lastDecayCheck": todayStr,
          lastDailyUpdate: todayStr, // Mark maintenance as done for today
          lastUpdated: FieldValue.serverTimestamp(),
        };

        // Monthly Reset
        const lastMonth = lastUpdate.substring(0, 7);
        const currentMonth = todayStr.substring(0, 7);
        if (lastMonth !== currentMonth) {
          updateObj.monthlyRP = 0;
          updateObj["stats.monthlyRP"] = 0;
        }

        // Penalty & Streak Reset (Only if user MISSED a full day)
        // If diffDays is 1, it means they played yesterday and it's simply a new day.
        // If diffDays > 1, it means they skipped at least one full Jigsudo day.
        if (diffDays > 1) {
          const missedCount = diffDays - 1;
          const currentTotalRP = data.totalRP || 0;
          
          let currentSimulatedRP = currentTotalRP;

          for (let i = 0; i < missedCount; i++) {
            const rankInfo = getRankData(currentSimulatedRP);
            const penaltyForDay = 5 + rankInfo.level;
            
            currentSimulatedRP = Math.max(0, currentSimulatedRP - penaltyForDay);
            if (currentSimulatedRP === 0) break;
          }

          let newRP = Number(currentSimulatedRP.toFixed(3)); // Ensure precision matches client

          updateObj.totalRP = newRP;
          updateObj["stats.currentRP"] = newRP;
          updateObj["stats.currentStreak"] = 0; // Fix: streak resets to 0

          console.log(
            `📉 Dynamic Penalty for ${data.username || doc.id}: Started with ${currentTotalRP}, dropped to ${newRP} over ${missedCount} days. Streak Reset to 0`,
          );
        } else {
          console.log(
            `🌅 New day reset for ${data.username || doc.id} (Daily stats cleared)`,
          );
        }

        batch.update(doc.ref, updateObj);
        penalizedCount++;
      }
    });

    if (penalizedCount > 0) {
      console.log(
        `⏳ Committing updates/penalties for ${penalizedCount} user(s)...`,
      );
      await batch.commit();
      console.log("✅ Maintenance successfully applied.");
    } else {
      console.log("✅ No users required maintenance updates today.");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error executing decay:", error);
    process.exit(1);
  }
}

runDecay();
