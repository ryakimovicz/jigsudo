const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// --- SCORING CONFIG (Aligned with ranks.js) ---
const SCORING = {
  MAX_BONUS: 10.0,
  BONUS_DECAY_SECONDS: 3600,
  ERROR_PENALTY_RP: 0.5,
  BASE_WIN_RP: 6.0,
  JIGSUDO_OFFSET_HOURS: 6,
  MIN_TIME_THRESHOLDS: {
    memory: 5000,   // 5s
    jigsaw: 3000,   // 3s
    sudoku: 20000,  // 20s
    peaks: 5000,    // 5s
    search: 10000,  // 10s
    code: 3000      // 3s
  }
};

/**
 * Helper to get Jigsudo Date String (YYYY-MM-DD) synced with server time
 */
function getJigsudoDateString() {
  const d = new Date(Date.now() - SCORING.JIGSUDO_OFFSET_HOURS * 3600 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 1. startJigsudoSession
 * Called when the user clicks "PLAY" for the daily puzzle.
 * Anchors the start time for the Referee.
 */
exports.startJigsudoSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  }

  const uid = context.auth.uid;
  const today = getJigsudoDateString();
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(today);

  const doc = await sessionRef.get();
  if (doc.exists) {
    return { status: "already_started", startTime: doc.data().startTime };
  }

  const startTime = Date.now();
  await sessionRef.set({
    startTime: startTime,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { status: "started", startTime: startTime };
});

/**
 * 2. submitDailyWin
 * Called when the user finishes all stages.
 * Only the server can AWARD points and update the STREAK.
 */
exports.submitDailyWin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  }

  const uid = context.auth.uid;
  const { stageTimes, peaksErrors, seed } = data;
  const today = getJigsudoDateString();

  // 1. Verify Seed matches Today
  const serverSeed = parseInt(today.replace(/-/g, ""), 10);
  if (seed !== serverSeed) {
    throw new functions.https.HttpsError("invalid-argument", "Date mismatch. You can only submit the current daily puzzle.");
  }

  // 2. Fetch Session Anchor
  const sessionRef = db.collection("users").doc(uid).collection("sessions").doc(today);
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    throw new functions.https.HttpsError("failed-precondition", "Session not initialized. Please refresh and try again.");
  }

  const sessionData = sessionDoc.data();
  if (sessionData.completed) {
    throw new functions.https.HttpsError("already-exists", "Victory already recorded for today.");
  }

  const now = Date.now();
  const serverDurationMs = now - sessionData.startTime;

  // 3. Validation: Minimum thresholds (anti-speed-hack)
  for (const [stage, minMs] of Object.entries(SCORING.MIN_TIME_THRESHOLDS)) {
    const stageTime = stageTimes[stage] || 0;
    if (stageTime < minMs) {
      throw new functions.https.HttpsError("out-of-range", `Stage ${stage} completed too fast. Possible script detected.`);
    }
  }

  // 4. Calculate Score
  const totalSeconds = serverDurationMs / 1000;
  const decayPerSecond = SCORING.MAX_BONUS / SCORING.BONUS_DECAY_SECONDS;
  const timeBonus = Math.max(0, SCORING.MAX_BONUS - (totalSeconds * decayPerSecond));
  const penalty = (peaksErrors || 0) * SCORING.ERROR_PENALTY_RP;
  
  const finalRP = Number((SCORING.BASE_WIN_RP + timeBonus - penalty).toFixed(3));
  const finalScore = Math.max(0, finalRP);

  // 5. ATOMIC UPDATE: Stats and History
  const userRef = db.collection("users").doc(uid);
  const batch = db.batch();

  // Update root mirrored fields
  batch.set(userRef, {
    totalRP: admin.firestore.FieldValue.increment(finalScore),
    monthlyRP: admin.firestore.FieldValue.increment(finalScore),
    dailyRP: finalScore,
    lastDailyUpdate: today,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    // Stats nested map (for app consumption)
    stats: {
        currentRP: admin.firestore.FieldValue.increment(finalScore),
        monthlyRP: admin.firestore.FieldValue.increment(finalScore),
        totalRP: admin.firestore.FieldValue.increment(finalScore),
        totalScoreAccumulated: admin.firestore.FieldValue.increment(finalScore),
        // We'll trust the provided stageTimes for the history log entry (it's purely for display)
        history: {
            [today]: {
                status: "won",
                score: finalScore,
                totalTime: serverDurationMs,
                peaksErrors: peaksErrors || 0,
                stageTimes: stageTimes,
                timestamp: now,
                originalWin: true
            }
        }
    }
  }, { merge: true });

  // Mark session as completed
  batch.update(sessionRef, { completed: true, score: finalScore, durationMs: serverDurationMs });

  await batch.commit();

  return {
    status: "success",
    score: finalScore,
    durationMs: serverDurationMs,
    totalRP_claimed: finalScore
  };
});
