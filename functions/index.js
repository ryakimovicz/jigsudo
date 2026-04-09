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
  }
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
      completed: false
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

  const serverDurationMs = now - sessionData.startTime;

  // 3. Validation
  for (const [stage, minMs] of Object.entries(SCORING.MIN_TIME_THRESHOLDS)) {
    if ((stageTimes[stage] || 0) < minMs) {
      throw new HttpsError("out-of-range", `Stage ${stage} too fast.`);
    }
  }

  // 4. Calculate Score
  const totalSeconds = serverDurationMs / 1000;
  const decayPerSecond = SCORING.MAX_BONUS / SCORING.BONUS_DECAY_SECONDS;
  const timeBonus = Math.max(0, SCORING.MAX_BONUS - (totalSeconds * decayPerSecond));
  const finalRP = Number((SCORING.BASE_WIN_RP + timeBonus - (peaksErrors * SCORING.ERROR_PENALTY_RP)).toFixed(3));
  const finalScore = Math.max(0, finalRP);

  // 5. ATOMIC UPDATE (Read before write for streak logic)
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const stats = userData.stats || {};

  const lastUpdate = userData.lastDailyUpdate || "";
  const lastMonth = userData.lastMonthlyUpdate || "";
  const nowMonth = today.substring(0, 7); // YYYY-MM
  const isNewMonth = lastMonth !== nowMonth;

  // Streak Calculation
  let newStreak = 1;
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().split("T")[0];

  if (lastUpdate === yesterday) {
    newStreak = (stats.currentStreak || 0) + 1;
  } else if (lastUpdate === today) {
    newStreak = stats.currentStreak || 1; // Already won today, keep streak
  }

  const newMaxStreak = Math.max(stats.maxStreak || 0, newStreak);
  const newWins = (stats.wins || 0) + 1;

  const batch = db.batch();

  // Root fields maintenance + Self-healing (isPublic and isVerified)
  const rootUpdate = {
    totalRP: admin.firestore.FieldValue.increment(finalScore),
    monthlyRP: isNewMonth ? finalScore : admin.firestore.FieldValue.increment(finalScore),
    dailyRP: finalScore,
    lastDailyUpdate: today,
    lastMonthlyUpdate: nowMonth,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    isVerified: !!request.auth.token.email_verified,
    isPublic: userData.isPublic !== false // Preserve or default to true
  };

  batch.set(userRef, rootUpdate, { merge: true });

  // Stats nested update (Dot notation for surgical precision)
  batch.update(userRef, {
    "stats.dailyRP": finalScore,
    "stats.monthlyRP": isNewMonth ? finalScore : admin.firestore.FieldValue.increment(finalScore),
    "stats.totalRP": admin.firestore.FieldValue.increment(finalScore),
    "stats.totalScoreAccumulated": admin.firestore.FieldValue.increment(finalScore),
    "stats.currentRP": finalScore,
    "stats.currentStreak": newStreak,
    "stats.maxStreak": newMaxStreak,
    "stats.wins": newWins,
    "stats.lastDailyUpdate": today,
    "stats.lastMonthlyUpdate": nowMonth,
    [`stats.history.${today}`]: {
        status: "won",
        score: finalScore,
        totalTime: serverDurationMs,
        peaksErrors: peaksErrors || 0,
        stageTimes: stageTimes,
        timestamp: now,
        originalWin: true
    }
  });

  batch.update(sessionRef, { completed: true, score: finalScore, durationMs: serverDurationMs });

  await batch.commit();
  console.log(`[Referee] Points awarded to ${uid}: ${finalScore}`);

  return { 
    status: "success", 
    score: finalScore, 
    durationMs: serverDurationMs,
    streak: newStreak,
    maxStreak: newMaxStreak,
    wins: newWins
  };
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
