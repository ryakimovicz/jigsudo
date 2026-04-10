import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getJigsudoDateString } from "../js/utils/time.js?v=1.2.0"; // Uses Jigsudo offset handling
import { getRankData } from "../js/ranks.js?v=1.2.0"; // Uses dynamic bounds for decay penalty
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
      const lastIntent = stats.lastIntentDate || data.lastDailyUpdate || data.lastPlayedDate;
      const lastUpdate = data.lastDailyUpdate || "";
      const lastMonth = data.lastMonthlyUpdate || "";
      const nowMonth = todayStr.substring(0, 7);
      const isNewMonth = lastMonth !== nowMonth;

      if (!lastIntent) return; 

      const updateObj = {
        "stats.lastDecayCheck": todayStr,
        lastUpdated: FieldValue.serverTimestamp(),
      };

      // 1. Reset Daily Points for the new day
      if (lastUpdate !== todayStr) {
        updateObj.dailyRP = 0;
        updateObj["stats.dailyRP"] = 0;
      }

      // 2. Reset Monthly Points if Month changed
      if (isNewMonth) {
        updateObj.monthlyRP = 0;
        updateObj["stats.monthlyRP"] = 0;
      }

      // 3. Dynamic Decay Penalty (5 + Level)
      const lastIntentDate = new Date(lastIntent + "T12:00:00Z");
      const todayDate = new Date(todayStr + "T12:00:00Z");
      const intentDiff = Math.round((todayDate - lastIntentDate) / (1000 * 60 * 60 * 24));

      if (intentDiff > 1) {
        const missedCount = intentDiff - 1;
        let currentTempRP = data.totalRP || 0;
        let totalPenalty = 0;

        for (let i = 0; i < missedCount; i++) {
          const rankInfo = getRankData(currentTempRP);
          const penalty = 5 + rankInfo.level;
          currentTempRP = Math.max(0, currentTempRP - penalty);
          totalPenalty += penalty;
          if (currentTempRP === 0) break;
        }

        if (totalPenalty > 0) {
          const negPenalty = -Number(totalPenalty.toFixed(3));
          console.log(`📉 Penalty for ${data.username || doc.id}: -${totalPenalty} RP (Missed ${missedCount} days)`);
          
          updateObj.totalRP = FieldValue.increment(negPenalty);
          updateObj.monthlyRP = FieldValue.increment(negPenalty);
          updateObj["stats.currentRP"] = FieldValue.increment(negPenalty);
          updateObj["stats.totalRP"] = FieldValue.increment(negPenalty);
          updateObj["stats.monthlyRP"] = FieldValue.increment(negPenalty);
          updateObj["stats.manualRPAdjustment"] = FieldValue.increment(negPenalty);
          
          const yesterdayDate = new Date(todayDate.getTime());
          yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
          updateObj["stats.lastPenaltyDate"] = yesterdayDate.toISOString().substring(0, 10);
        }
      }

      // 4. Streak Reset
      const lastWin = data.lastDailyUpdate;
      if (lastWin) {
        const lastWinDate = new Date(lastWin + "T12:00:00Z");
        const streakDiff = Math.round((todayDate - lastWinDate) / (1000 * 60 * 60 * 24));
        if (streakDiff > 1 && (stats.currentStreak || 0) !== 0) {
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
