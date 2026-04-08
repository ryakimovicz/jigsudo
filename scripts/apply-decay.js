import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getJigsudoDateString } from "../js/utils/time.js?v=1.1.12"; // Uses Jigsudo offset handling
import { getRankData } from "../js/ranks.js?v=1.1.12"; // Uses dynamic bounds for decay penalty
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

    // Optimization: Only fetch users whose maintenance hasn't run today.
    const snapshot = await usersRef.where("stats.lastDecayCheck", "<", todayStr).get();

    if (snapshot.empty) {
      console.log("✅ No users required maintenance today.");
      process.exit(0);
    }

    const batch = db.batch();
    let penalizedCount = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const stats = data.stats || {};
      const lastIntent = stats.lastDailyUpdate || stats.lastDecayCheck || stats.lastPlayedDate;

      if (!lastIntent) return; // New user without any markers yet

      // Prepare update object with mandatory resets for a new day
      const updateObj = {
        dailyRP: 0,
        "stats.dailyRP": 0,
        "stats.lastDecayCheck": todayStr,
        lastUpdated: FieldValue.serverTimestamp(),
      };

      // Strict day difference calculation
      const lastIntentDate = new Date(lastIntent + "T12:00:00Z");
      const todayDate = new Date(todayStr + "T12:00:00Z");
      const intentDiff = Math.round((todayDate - lastIntentDate) / (1000 * 60 * 60 * 24));

      // 1. Monthly Reset
      const lastMonth = lastIntent.substring(0, 7);
      const currentMonth = todayStr.substring(0, 7);
      if (lastMonth !== currentMonth) {
        updateObj.monthlyRP = 0;
        updateObj["stats.monthlyRP"] = 0;
      }

      // 2. Penalty Reset (Only if user MISSED a full day of INTENTIONAL activity)
      if (intentDiff > 1) {
        const missedCount = intentDiff - 1;
        const currentTotalRP = data.totalRP || 0;
        let currentSimulatedRP = currentTotalRP;

        for (let i = 0; i < missedCount; i++) {
          const rankInfo = getRankData(currentSimulatedRP);
          const penaltyForDay = 5 + rankInfo.level;
          currentSimulatedRP = Math.max(0, currentSimulatedRP - penaltyForDay);
          if (currentSimulatedRP === 0) break;
        }

        let newRP = Number(currentSimulatedRP.toFixed(3));
        updateObj.totalRP = newRP;
        updateObj["stats.currentRP"] = newRP;

        console.log(
          `📉 Dynamic Penalty for ${data.username || doc.id}: Missed ${missedCount} days. RP: ${currentTotalRP} -> ${newRP}`,
        );
      }

      // 3. Strict Streak Reset (Missed full Jigsudo days of WINNING)
      const lastWin = stats.lastPlayedDate;
      if (lastWin && lastWin !== todayStr) {
        const lastWinDate = new Date(lastWin + "T12:00:00Z");
        const streakDiff = Math.round((todayDate - lastWinDate) / (1000 * 60 * 60 * 24));
        
        if (streakDiff > 1 && stats.currentStreak !== 0) {
          console.log(`[Streak] Win missed for ${data.username || doc.id}. Resetting streak to 0.`);
          updateObj["stats.currentStreak"] = 0;
        }
      }

      batch.update(doc.ref, updateObj);
      penalizedCount++;
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
