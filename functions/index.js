const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = require("firebase-admin/firestore");

// v1.5.30: EXORCISM & SYNC SHIELD - Unified Scoring Referee
setGlobalOptions({ region: "us-central1" });

const SCORING = {
  MAX_BONUS: 10.0,
  BONUS_DECAY_SECONDS: 3600,
  ERROR_PENALTY_RP: 0.5,
  BASE_WIN_RP: 6.0,
  JIGSUDO_OFFSET_HOURS: 6,
  MIN_TIME_THRESHOLDS: {
    memory: 5,
    jigsaw: 5,
    sudoku: 5,
    peaks: 5,
    search: 5,
    code: 5
  },
  PARTIAL_RP: {
    memory: 1.0,
    jigsaw: 1.0,
    sudoku: 1.0,
    peaks: 1.0,
    search: 1.0,
    code: 1.0
  },
  STAGE_ORDER: ["memory", "jigsaw", "sudoku", "peaks", "search", "code"],
  RANK_THRESHOLDS: [0, 15, 45, 100, 160, 250, 400, 650, 1000, 1500, 2100, 2800, 3700, 5000, 6500, 8000]
};

function getJigsudoDateString() {
  const d = new Date(Date.now() - SCORING.JIGSUDO_OFFSET_HOURS * 3600 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 1. startJigsudoSession (v2)
 */
exports.startJigsudoSession = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  const uid = request.auth.uid;
  const today = getJigsudoDateString();
  const userRef = db.collection("users").doc(uid);
  const sessionRef = userRef.collection("sessions").doc(today);

  try {
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new HttpsError("not-found", "User profile not found.");
    const userData = userSnap.data();
    const sessionId = request.data.sessionId || null;
    const onlyMaintenance = request.data.onlyMaintenance || false;

    // 1. PERFORM MAINTENANCE (v1.4.2 / v1.5.2)
    // If the cron script hasn't run yet, apply decay before anything else
    const stats = userData.stats || {};
    if ((stats.lastDecayCheck || "") < today) {
      await _performUserMaintenance(userRef, userData, today);
    }

    // NEW (v1.5.2): If only maintenance requested, stop here.
    // Do NOT update lastIntentDate (No shield).
    if (onlyMaintenance) {
       return { status: "maintenance_complete" };
    }

    // 2. MARK INTENT (THE SHIELD) & SESSION LOCK (v1.5.0)
    // Full Play Button click: user gets the shield and takes control of the session.
    const updateData = {
      "stats.lastIntentDate": today,
      "stats.lastDecayCheck": today
    };
    
    if (sessionId) {
      updateData["stats.activeSessionId"] = sessionId;
    }

    await userRef.update(updateData);

    const sessionDoc = await sessionRef.get();
    if (sessionDoc.exists) {
      return { status: "already_started", startTime: sessionDoc.data().startTime };
    }

    const startTime = Date.now();
    await sessionRef.set({
      startTime: startTime,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      uid: uid,
      date: today,
      completed: false,
      stagesCompleted: []
    });

    return { status: "started", startTime: startTime };
  } catch (error) {
    console.error("[startJigsudoSession] Error:", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * Internal Maintenance Logic (v1.4.2)
 * Shared with GitHub Actions script logic.
 */
async function _performUserMaintenance(userRef, userData, today) {
  const stats = userData.stats || {};
  
  // v1.9.1: Correcting anchor dates
  // lastDecayCheck: The last date we successfully processed.
  // lastIntentDate: The last date the user actually played (safe date).
  let lastDecay = stats.lastDecayCheck || userData.lastDailyUpdate || userData.lastPlayedDate || today;
  const lastIntent = stats.lastIntentDate || userData.lastDailyUpdate || userData.lastPlayedDate || today;

  // Convert to Date objects (Safe comparison)
  let simDate = new Date(lastDecay + "T12:00:00Z");
  const todayDate = new Date(today + "T12:00:00Z");
  const lastIntentDate = new Date(lastIntent + "T12:00:00Z");

  // Local state for the simulation
  let currentTotalRP = userData.totalRP || 0;
  let currentMonthlyRP = userData.monthlyRP || 0;
  let currentDailyRP = userData.dailyRP || 0;
  let currentPenaltyAcc = userData.totalPenaltyAccumulated || 0;
  let currentStreak = stats.currentStreak || 0;

  let totalSimulatedDays = 0;
  let lastProcessedMonth = lastDecay.substring(0, 7);

  // Iterative Simulation: Step through each day missing between lastDecay and Today
  let safetyBreak = 365; // Prevent hanging on massive gaps
  while (simDate < todayDate && safetyBreak > 0) {
    safetyBreak--;
    totalSimulatedDays++;
    
    // Move to next day
    simDate.setUTCDate(simDate.getUTCDate() + 1);
    const dStr = simDate.toISOString().substring(0, 10);
    const dMonth = dStr.substring(0, 7);

    // 1. MONTHLY TRANSITION (Borrón y cuenta nueva)
    // If this simulated day is a new month, reset monthly counter
    if (dMonth !== lastProcessedMonth) {
      console.log(`[Maintenance] Month transition detected at ${dStr}. Resetting MonthlyRP.`);
      currentMonthlyRP = 0;
      lastProcessedMonth = dMonth;
    }

    // 2. DAILY RESET
    currentDailyRP = 0;

    // 3. DECAY CALCULATION
    // A day is a "missed day" if the day BEFORE it was already > lastIntentDate
    // (Jigsudo gives 24h grace: if you play Mon, Tues is safe, Wed is the first penalty)
    const dayBeforeSim = new Date(simDate.getTime());
    dayBeforeSim.setUTCDate(dayBeforeSim.getUTCDate() - 1);

    if (dayBeforeSim > lastIntentDate) {
      // Find Rank Level
      let level = 0;
      for (let j = 0; j < SCORING.RANK_THRESHOLDS.length; j++) {
        if (currentTotalRP >= SCORING.RANK_THRESHOLDS[j]) level = j;
        else break;
      }
      
      const penalty = 5 + level;
      currentTotalRP = Math.max(0, currentTotalRP - penalty);
      currentMonthlyRP = Math.max(0, currentMonthlyRP - penalty);
      currentPenaltyAcc += penalty;
      
      // Streak Reset
      currentStreak = 0;
      
      console.log(`[Maintenance] Day ${dStr}: Applied -${penalty} RP penalty (Inactivity).`);
    }
  }

  if (totalSimulatedDays > 0) {
    const updates = {
      totalRP: Number(currentTotalRP.toFixed(3)),
      monthlyRP: Number(currentMonthlyRP.toFixed(3)),
      dailyRP: currentDailyRP,
      totalPenaltyAccumulated: Number(currentPenaltyAcc.toFixed(3)),
      "stats.currentStreak": currentStreak,
      "stats.lastDecayCheck": today,
      "stats.lastPenaltyDate": currentStreak === 0 ? today : (stats.lastPenaltyDate || null),
      lastUpdated: FieldValue.serverTimestamp()
    };

    // Cleanup legacy fields if they exist
    updates["stats.totalRP"] = FieldValue.delete();
    updates["stats.monthlyRP"] = FieldValue.delete();
    updates["stats.dailyRP"] = FieldValue.delete();
    updates["stats.currentRP"] = FieldValue.delete();
    updates["stats.manualRPAdjustment"] = FieldValue.delete();

    console.log(`[Maintenance] Finalizing update for ${userData.username || userRef.id}. Simulated days: ${totalSimulatedDays}`);
    await userRef.update(updates);
  }
}


exports.submitStageResult = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
  
  const { stage, seed, stageTime, peaksErrors } = request.data;
  const uid = request.auth.uid;
  const today = getJigsudoDateString();
  const now = Date.now();

  // 1. Fetch Session
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(today);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) throw new HttpsError("failed-precondition", "Session not initialized.");
  
  const sessionData = sessionDoc.data();
  if (sessionData.completed) throw new HttpsError("already-exists", "Victory already recorded.");
  
  const stagesDone = sessionData.stagesCompleted || [];
  if (stagesDone.includes(stage)) return { status: "already_verified" };

  // 2. Validate Sequence
  const stageIndex = SCORING.STAGE_ORDER.indexOf(stage);
  if (stageIndex === -1) throw new HttpsError("invalid-argument", "Invalid stage.");
  if (stagesDone.length !== stageIndex) throw new HttpsError("failed-precondition", "Out of sequence.");

  // 3. Validate Time
  const minTime = SCORING.MIN_TIME_THRESHOLDS[stage] || 0;
  if (stageTime < minTime) throw new HttpsError("out-of-range", "Stage too fast.");

  // 4. Score Calculation (Debt System v1.5.23)
  // We track the total potential points and total errors to calculate the running DailyRP correctly.
  const stagesDoneCount = (sessionData.stagesCompleted || []).length + 1;
  const basePointsTotal = stagesDoneCount * 1.0;
  
  // Sum errors from previous stages stored in session + current peaksErrors
  let totalErrorsAccumulated = peaksErrors || 0;
  if (sessionData.results) {
    Object.values(sessionData.results).forEach(r => {
      if (r.errors) totalErrorsAccumulated += r.errors;
    });
  }

  const penaltyTotal = totalErrorsAccumulated * SCORING.ERROR_PENALTY_RP;
  const newDailyRP = Math.max(0, basePointsTotal - penaltyTotal);
  
  // 5. Atomic Update
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};

  // Calculate Delta for incremental updates (User Doc & Monthly)
  const currentDailyRP = userData.dailyRP || 0;
  const stagePoints = Number((newDailyRP - currentDailyRP).toFixed(3));

  const lastMonth = userData.lastMonthlyUpdate || "";
  const nowMonth = today.substring(0, 7);
  const isNewMonth = lastMonth !== nowMonth;

  const batch = db.batch();
  
  // Root update (Official Ranking & Metadata v1.4.5: Atomic Monthly Reset)
  // v1.5.30: DailyRP is now an absolute SET to prevent drift, while Total/Monthly remain incremental.
  const rootUpdate = {
    totalRP: FieldValue.increment(stagePoints),
    dailyRP: newDailyRP, // v1.5.30: Absolute Truth
    lastUpdated: FieldValue.serverTimestamp(),
    lastLocalUpdate: Date.now(), // v1.5.30: Trigger client sync
    schemaVersion: 7.1
  };
  
  if (isNewMonth) {
    rootUpdate.monthlyRP = stagePoints; // Start month fresh
    rootUpdate.lastMonthlyUpdate = nowMonth;
  } else {
    rootUpdate.monthlyRP = FieldValue.increment(stagePoints);
  }
  
  batch.set(userRef, rootUpdate, { merge: true });

  // Stats Aggregators (No RP duplicates here anymore)
  const statsUpdate = {
    "stats.totalScoreAccumulated": FieldValue.increment(stagePoints),
    [`stats.stageWinsAccumulated.${stage}`]: FieldValue.increment(1),
    [`stats.stageTimesAccumulated.${stage}`]: FieldValue.increment(stageTime),
  };
  
  if (peaksErrors > 0) {
    statsUpdate["stats.totalPeaksErrorsAccumulated"] = FieldValue.increment(peaksErrors);
  }

  batch.update(userRef, statsUpdate);

  // Session update (v1.5.23: Store errors explicitly for debt calculation)
  batch.update(sessionRef, {
    stagesCompleted: FieldValue.arrayUnion(stage),
    [`results.${stage}`]: { time: stageTime, points: stagePoints, errors: peaksErrors || 0, timestamp: now }
  });

  await batch.commit();

  return { status: "success", awarded: stagePoints };
});

/**
 * 3. submitDailyWin (v1.4.1)
 * Finalizes the game, adds Time Bonus and updates history.
 */
exports.submitDailyWin = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const { seed, peaksErrors, stageTimes } = request.data;
  const uid = request.auth.uid;
  const today = getJigsudoDateString();
  const now = Date.now();

  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(today);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) throw new HttpsError("failed-precondition", "Session not initialized.");

  const sessionData = sessionDoc.data();
  if (sessionData.completed) throw new HttpsError("already-exists", "Victory already recorded.");

  const stagesDone = sessionData.stagesCompleted || [];
  if (stagesDone.length < SCORING.STAGE_ORDER.length) {
    throw new HttpsError("failed-precondition", "Missing stages.");
  }

  // Calculate Active Time Bonus
  const activeDurationMs = Object.values(stageTimes || {}).reduce((a, b) => a + b, 0);
  const totalSeconds = activeDurationMs / 1000;
  const decayPerSecond = SCORING.MAX_BONUS / SCORING.BONUS_DECAY_SECONDS;
  const timeBonus = Math.max(0, SCORING.MAX_BONUS - (totalSeconds * decayPerSecond));
  const finalBonus = Number(timeBonus.toFixed(3));

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const stats = userData.stats || {};
  const lastUpdate = userData.lastDailyUpdate || "";
  const nowMonth = today.substring(0, 7);

  // 1. Victory & Streak Logic (Original Day Only)
  const isOriginalDay = seed.toString() === today.replace(/-/g, "");
  let newStreak = stats.currentStreak || 0;
  let newWins = stats.wins || 0;

  if (isOriginalDay) {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    const yesterday = d.toISOString().split("T")[0];

    if (lastUpdate === yesterday) {
      newStreak += 1;
    } else if (lastUpdate !== today) {
      newStreak = 1;
    }
    
    if (lastUpdate !== today) {
        newWins += 1;
    }
  }

  const newMaxStreak = Math.max(stats.maxStreak || 0, newStreak);
  
  /**
   * v1.5.23: DEBT SYSTEM IMPLEMENTATION
   * Calculation: Max(0, 6.0 (Levels) + Bonus - TotalErrors * 0.5)
   * This ensures the score shown in the UI matches the server truth perfectly.
   */
  const totalErrors = peaksErrors || 0;
  const finalScoreResult = Math.max(0, Number((6.0 + finalBonus - (totalErrors * SCORING.ERROR_PENALTY_RP)).toFixed(3)));

  // Calculate the final incremental change for Total/Monthly RP
  const currentDailyRP = userData.dailyRP || 0;
  const finalDelta = Number((finalScoreResult - currentDailyRP).toFixed(3));

  const batch = db.batch();

  // 2. Root Update (RP & Meta)
  const rootUpdate = {
    totalRP: FieldValue.increment(finalDelta),
    monthlyRP: FieldValue.increment(finalDelta),
    dailyRP: finalScoreResult,
    lastDailyUpdate: today,
    lastUpdated: FieldValue.serverTimestamp(),
    lastLocalUpdate: Date.now(), // v1.5.30: Trigger client sync
    schemaVersion: 7.1
  };
  
  // Set registeredAt if missing (v5 Transition)
  if (!userData.registeredAt) {
      rootUpdate.registeredAt = FieldValue.serverTimestamp();
  }

  batch.set(userRef, rootUpdate, { merge: true });

  // 3. Stats Global Aggregators
  const dayOfWeek = new Date(today + "T12:00:00Z").getUTCDay(); // 0-6
  // totalErrors already declared on line 362

  batch.update(userRef, {
    "stats.totalScoreAccumulated": FieldValue.increment(finalDelta),
    "stats.currentStreak": newStreak,
    "stats.maxStreak": newMaxStreak,
    "stats.wins": newWins,
    "stats.totalTimeAccumulated": FieldValue.increment(activeDurationMs),
    [`stats.weekdayStatsAccumulated.${dayOfWeek}.count`]: FieldValue.increment(1),
    [`stats.weekdayStatsAccumulated.${dayOfWeek}.sumScore`]: FieldValue.increment(finalScoreResult),
    [`stats.weekdayStatsAccumulated.${dayOfWeek}.sumTime`]: FieldValue.increment(activeDurationMs),
    [`stats.weekdayStatsAccumulated.${dayOfWeek}.sumErrors`]: FieldValue.increment(totalErrors),
  });

  // 4. History Sub-collection (Original vs Best)
  const historyRef = userRef.collection("history").doc(seed.toString());
  const historySnap = await historyRef.get();
  
  const historyEntry = {
    seed: seed,
    played: true
  };

  const resultData = {
    score: finalScoreResult,
    totalTime: activeDurationMs,
    stageTimes: stageTimes,
    errors: totalErrors,
    timestamp: now,
    won: true
  };

  if ((!historySnap.exists || !historySnap.data().original) && isOriginalDay) {
    historyEntry.original = resultData;
    historyEntry.best = resultData;
  } else if (historySnap.exists) {
    const existingBest = historySnap.data().best || {};
    // Compare and update Personal Best
    if (finalScoreResult > (existingBest.score || 0) || 
        (finalScoreResult === existingBest.score && activeDurationMs < (existingBest.totalTime || Infinity))) {
      historyEntry.best = resultData;
    }
  } else {
    // Replay of a day that was never won on its original date
    historyEntry.best = resultData;
  }

  batch.set(historyRef, historyEntry, { merge: true });

  // 5. Update All-Time Bests (stats.bestScore, stats.bestTime)
  if (finalScoreResult > (stats.bestScore || 0)) {
      batch.update(userRef, { "stats.bestScore": finalScoreResult });
  }
  if (activeDurationMs < (stats.bestTime || Infinity) && activeDurationMs > 0) {
      batch.update(userRef, { "stats.bestTime": activeDurationMs });
  }

  // 6. Session Close (v1.4.5: DELETE session after successful history migration)
  batch.delete(sessionRef);

  await batch.commit();

  return { status: "success", bonus: finalBonus, finalScore: finalScoreResult, streak: newStreak };
});

/**
 * 3. checkUsernameAvailability (v2)
 * Allows guests to check if a name is taken without broad collection access.
 */
exports.checkUsernameAvailability = onCall({ cors: true }, async (request) => {
  const { username } = request.data;
  if (!username) {
    throw new HttpsError("invalid-argument", "Username is required.");
  }

  const lookName = username.toLowerCase();
  const usersRef = db.collection("users");
  const q = usersRef.where("username_lc", "==", lookName).limit(1);
  const snap = await q.get();

  return { available: snap.empty };
});
