const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Set global options to ensure all functions use us-central1
setGlobalOptions({ region: "us-central1" });

const SCORING = {
  MAX_BONUS: 10.0,
  BONUS_DECAY_SECONDS: 3600,
  ERROR_PENALTY_RP: 0.5,
  BASE_WIN_RP: 6.0,
  JIGSUDO_OFFSET_HOURS: 6,
  MIN_TIME_THRESHOLDS: {
    memory: 10,
    jigsaw: 10,
    sudoku: 10,
    peaks: 10,
    search: 10,
    code: 10
  },
  PARTIAL_RP: {
    memory: 1.0,
    jigsaw: 1.0,
    sudoku: 1.0,
    peaks: 1.0,
    search: 1.0,
    code: 1.0
  },
  STAGE_ORDER: ["memory", "jigsaw", "sudoku", "peaks", "search", "code"]
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
exports.startJigsudoSession = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  const uid = request.auth.uid;
  const today = getJigsudoDateString();
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(today);

  try {
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
    throw new HttpsError("internal", error.message);
  }
});

/**
 * 2. submitDailyWin (v2)
 */
exports.submitDailyWin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const { seed, peaksErrors, stageTimes } = request.data;
  if (!seed || typeof peaksErrors !== "number" || !stageTimes) {
    throw new HttpsError("invalid-argument", "Missing win data.");
  }

  const uid = request.auth.uid;
  const today = getJigsudoDateString();
  const now = Date.now();

  // 1. Verify Seed
  const serverSeed = parseInt(today.replace(/-/g, ""), 10);
  if (seed !== serverSeed) {
    throw new HttpsError("invalid-argument", "Date mismatch.");
  }

  // 2. Fetch Session
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(today);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    throw new HttpsError("failed-precondition", "Session not initialized.");
  }

  const sessionData = sessionDoc.data();
  if (sessionData.completed) {
    throw new HttpsError("already-exists", "Victory already recorded.");
  }

/**
 * 2. submitStageResult (v1.4.1)
 * Progressive verification of each level.
 */
exports.submitStageResult = onCall(async (request) => {
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

  // 4. Score Calculation
  const basePoints = SCORING.PARTIAL_RP[stage] || 0;
  const penalty = (peaksErrors || 0) * SCORING.ERROR_PENALTY_RP;
  const stagePoints = Math.max(0, basePoints - penalty);

  // 5. Atomic Update
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const lastMonth = userData.lastMonthlyUpdate || "";
  const nowMonth = today.substring(0, 7);
  const isNewMonth = lastMonth !== nowMonth;

  const batch = db.batch();
  
  // Root update (Official Ranking)
  batch.set(userRef, {
    totalRP: admin.firestore.FieldValue.increment(stagePoints),
    monthlyRP: isNewMonth ? admin.firestore.FieldValue.increment(stagePoints) : admin.firestore.FieldValue.increment(stagePoints),
    dailyRP: admin.firestore.FieldValue.increment(stagePoints),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // Stats nested update
  batch.update(userRef, {
    "stats.dailyRP": admin.firestore.FieldValue.increment(stagePoints),
    "stats.totalRP": admin.firestore.FieldValue.increment(stagePoints),
    "stats.monthlyRP": admin.firestore.FieldValue.increment(stagePoints),
    "stats.totalScoreAccumulated": admin.firestore.FieldValue.increment(stagePoints)
  });

  // Session update
  batch.update(sessionRef, {
    stagesCompleted: admin.firestore.FieldValue.arrayUnion(stage),
    [`results.${stage}`]: { time: stageTime, points: stagePoints, timestamp: now }
  });

  await batch.commit();

  return { status: "success", awarded: stagePoints };
});

/**
 * 3. submitDailyWin (v1.4.1)
 * Finalizes the game, adds Time Bonus and updates history.
 */
exports.submitDailyWin = onCall(async (request) => {
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

  // Calculate Time Bonus
  const serverDurationMs = now - sessionData.startTime;
  const totalSeconds = serverDurationMs / 1000;
  const decayPerSecond = SCORING.MAX_BONUS / SCORING.BONUS_DECAY_SECONDS;
  const timeBonus = Math.max(0, SCORING.MAX_BONUS - (totalSeconds * decayPerSecond));
  const finalBonus = Number(timeBonus.toFixed(3));

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const stats = userData.stats || {};
  const lastUpdate = userData.lastDailyUpdate || "";
  const nowMonth = today.substring(0, 7);

  // Streak Calculation
  let newStreak = 1;
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().split("T")[0];

  if (lastUpdate === yesterday) {
    newStreak = (stats.currentStreak || 0) + 1;
  } else if (lastUpdate === today) {
    newStreak = stats.currentStreak || 1;
  }

  const newMaxStreak = Math.max(stats.maxStreak || 0, newStreak);
  const newWins = (stats.wins || 0) + 1;

  // We need to know the CURRENT dailyRP to save it in history correctly
  // But wait, it's safer to just add the bonus.
  // The final score in history should be Total Stage Points + Time Bonus.
  const baseScore = (userData.dailyRP || 0); // Already includes stage points
  const finalScoreResult = Number((baseScore + finalBonus).toFixed(3));

  const batch = db.batch();

  batch.set(userRef, {
    totalRP: admin.firestore.FieldValue.increment(finalBonus),
    monthlyRP: admin.firestore.FieldValue.increment(finalBonus),
    dailyRP: finalScoreResult, // Set final absolute dailyRP
    lastDailyUpdate: today,
    lastMonthlyUpdate: nowMonth,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  batch.update(userRef, {
    "stats.dailyRP": finalScoreResult,
    "stats.monthlyRP": admin.firestore.FieldValue.increment(finalBonus),
    "stats.totalRP": admin.firestore.FieldValue.increment(finalBonus),
    "stats.totalScoreAccumulated": admin.firestore.FieldValue.increment(finalBonus),
    "stats.currentRP": finalScoreResult,
    "stats.currentStreak": newStreak,
    "stats.maxStreak": newMaxStreak,
    "stats.wins": newWins,
    "stats.lastDailyUpdate": today,
    "stats.lastMonthlyUpdate": nowMonth,
    [`stats.history.${today}`]: {
        status: "won",
        score: finalScoreResult,
        totalTime: serverDurationMs,
        stageTimes: stageTimes,
        timestamp: now,
        originalWin: true
    }
  });

  batch.update(sessionRef, { 
    completed: true, 
    score: finalScoreResult, 
    timeBonus: finalBonus,
    durationMs: serverDurationMs 
  });

  await batch.commit();

  return { status: "success", bonus: finalBonus, finalScore: finalScoreResult, streak: newStreak };
});

/**
 * 3. checkUsernameAvailability (v2)
 * Allows guests to check if a name is taken without broad collection access.
 */
exports.checkUsernameAvailability = onCall(async (request) => {
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
