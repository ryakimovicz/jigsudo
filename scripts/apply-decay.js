import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getJigsudoDateString, getJigsudoDayDiff } from "../js/utils/time.js?v=1.4.5"; // Uses Jigsudo offset handling
import { getRankData } from "../js/ranks.js?v=1.4.5"; // Uses dynamic bounds for decay penalty
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
      const lastCheckDates = [stats.lastDecayCheck, stats.lastIntentDate, stats.lastPlayedDate].filter(Boolean);
      lastCheckDates.sort();
      const lastCheck = lastCheckDates.length > 0 ? lastCheckDates[lastCheckDates.length - 1] : null;

      if (!lastCheck) return;

      const diffDays = getJigsudoDayDiff(lastCheck, todayStr);
      if (diffDays < 1) return;

      // Simulation State
      let currentTotalRP = data.totalRP || 0;
      let currentMonthlyRP = data.monthlyRP || 0;
      let lastProcessedMonth = lastCheck.substring(0, 7);
      const datesToConsider = [stats.lastPenaltyDate, stats.lastIntentDate, stats.lastPlayedDate].filter(Boolean);
      datesToConsider.sort();
      const lastIntent = datesToConsider.length > 0 ? datesToConsider[datesToConsider.length - 1] : null;
      
      const updateObj = {
        "stats.lastDecayCheck": todayStr,
        lastUpdated: FieldValue.serverTimestamp(),
      };

      // 1. Daily Reset (Always happens if diffDays >= 1)
      updateObj.lastDayRP = data.dailyRP || 0;
      updateObj["stats.lastDayRP"] = data.dailyRP || 0;
      updateObj.dailyRP = 0;
      updateObj["stats.dailyRP"] = 0;

      // 2. Sequential Simulation (Transition Integrity)
      let totalPenaltyAccumulatedThisRun = 0;
      let monthlyPenaltyAccumulatedThisRun = stats.monthlyPenaltyAccumulated || 0;

      for (let i = 1; i <= diffDays; i++) {
        const dObj = new Date(lastCheck + "T12:00:00Z");
        dObj.setUTCDate(dObj.getUTCDate() + i);
        const dStr = dObj.toISOString().substring(0, 10);
        const dMonth = dStr.substring(0, 7);
        const dayBeforeStr = new Date(dObj.getTime() - 86400000).toISOString().substring(0, 10);

        // A. Decay Calculation
        if (lastIntent && dayBeforeStr > lastIntent) {
          const rankInfo = getRankData(currentTotalRP);
          const penalty = 5 + rankInfo.level;
          const realizedPenalty = Math.min(currentTotalRP, penalty);
          
          currentTotalRP = Number((currentTotalRP - realizedPenalty).toFixed(3));
          currentMonthlyRP = Number((currentMonthlyRP - realizedPenalty).toFixed(3));
          totalPenaltyAccumulatedThisRun += realizedPenalty;
          monthlyPenaltyAccumulatedThisRun = Number((monthlyPenaltyAccumulatedThisRun + realizedPenalty).toFixed(3));
          
          // v1.4.3: Record the anchor for this penalty (the day of inactivity)
          updateObj["stats.lastPenaltyDate"] = dayBeforeStr;
        }

        // B. Month Transition (Reset AFTER penalty)
        if (dMonth !== lastProcessedMonth) {
          // Archive the previous month'S FINAL count
          updateObj.lastMonthRP = currentMonthlyRP;
          updateObj["stats.lastMonthRP"] = currentMonthlyRP;
          updateObj.lastMonthlyUpdate = lastProcessedMonth;
          
          currentMonthlyRP = 0;
          monthlyPenaltyAccumulatedThisRun = 0; // Reset monthly accumulator on transition
          lastProcessedMonth = dMonth;
        }
      }

      // Final Application
      updateObj.totalRP = currentTotalRP;
      updateObj.monthlyRP = currentMonthlyRP;
      updateObj["stats.totalPenaltyAccumulated"] = FieldValue.increment(Number(totalPenaltyAccumulatedThisRun.toFixed(3)));
      updateObj["stats.monthlyPenaltyAccumulated"] = monthlyPenaltyAccumulatedThisRun;
      
      // v1.4.3: REMOVED unconditional update. Anchors are now handled by lastDecayCheck 
      // and lastPenaltyDate is only set inside the loop when points are lost.

      // 3. Streak Reset (Win anchor)
      const lastWin = stats.lastPlayedDate || data.lastDailyUpdate; 
      if (lastWin && lastWin !== todayStr) {
        const streakDiff = getJigsudoDayDiff(lastWin, todayStr);
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
