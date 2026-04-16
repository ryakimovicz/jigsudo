import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getJigsudoDateString } from "../js/utils/time.js?v=1.3.2"; // Uses Jigsudo offset handling
import { getRankData } from "../js/ranks.js?v=1.3.2"; // Uses dynamic bounds for decay penalty
const todayStr = getJigsudoDateString();

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
      // v1.5.59: Normalized Intent Anchors for Point Decay
      const lastIntent = stats.lastPenaltyDate || data.lastDailyUpdate || stats.lastPlayedDate;
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
        // v1.2.2: Archive previous day points before reset
        updateObj.lastDayRP = data.dailyRP || 0;
        updateObj["stats.lastDayRP"] = data.dailyRP || 0;
        
        updateObj.dailyRP = 0;
        updateObj["stats.dailyRP"] = 0;
      }

      // 2. Reset Monthly Points if Month changed
      if (isNewMonth) {
        // v1.2.2: Archive previous month points before reset
        updateObj.lastMonthRP = data.monthlyRP || 0;
        updateObj["stats.lastMonthRP"] = data.monthlyRP || 0;

        updateObj.monthlyRP = 0;
        updateObj["stats.monthlyRP"] = 0;
      }

      // 3. Dynamic Decay Penalty (5 + Level)
      const lastIntentDate = new Date(lastIntent + "T12:00:00Z");
      const todayDate = new Date(todayStr + "T12:00:00Z");
      const intentDiff = Math.round((todayDate - lastIntentDate) / (1000 * 60 * 60 * 24));

      if (intentDiff > 1) {
        const missedCount = intentDiff - 1;
        const originalRP = data.totalRP || 0; // v1.5.62: Anchor for realized loss
        let currentTempRP = originalRP;
        let totalPenalty = 0;

        for (let i = 0; i < missedCount; i++) {
          const rankInfo = getRankData(currentTempRP);
          const penalty = 5 + rankInfo.level;
          currentTempRP = Math.max(0, currentTempRP - penalty);
          if (currentTempRP === 0) break;
        }

        // v1.5.62: Precise Realized Loss Calculation
        totalPenalty = originalRP - currentTempRP;

        if (totalPenalty > 0) {
          const negPenalty = -Number(totalPenalty.toFixed(3));
          
          // v1.5.62: Monthly Floor Shield
          const realizedMonthlyLoss = Math.min(data.monthlyRP || 0, totalPenalty);
          const negMonthlyPenalty = -Number(realizedMonthlyLoss.toFixed(3));
          
          console.log(`📉 Penalty for ${data.username || doc.id}: -${totalPenalty} RP (Missed ${missedCount} days)`);
          
          updateObj.totalRP = FieldValue.increment(negPenalty);
          updateObj.monthlyRP = FieldValue.increment(negMonthlyPenalty);
          updateObj["stats.manualRPAdjustment"] = FieldValue.increment(negPenalty);
          updateObj["stats.lastPenalty"] = totalPenalty; 
          updateObj["stats.totalPenaltyAccumulated"] = FieldValue.increment(totalPenalty); // v1.5.61
          
          const yesterdayDate = new Date(todayDate.getTime());
          yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
          updateObj["stats.lastPenaltyDate"] = yesterdayDate.toISOString().substring(0, 10);
        }
      }

      // 4. Streak Reset (Based on last WINning date)
      const lastWin = stats.lastPlayedDate || data.lastDailyUpdate; 
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
