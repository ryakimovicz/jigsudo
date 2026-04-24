import { db, functions } from "./firebase-config.js?v=1.4.2";
import {
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  deleteDoc,
  serverTimestamp,
  deleteField,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  getCountFromServer,
  updateDoc,
  writeBatch,
  increment,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-functions.js";
import { gameManager } from "./game-manager.js?v=1.4.2";
import { getCurrentUser } from "./auth.js?v=1.4.2";
import { showAlertModal } from "./ui.js?v=1.4.2";
import {
  getJigsudoDateString,
  getJigsudoYearMonth,
} from "./utils/time.js?v=1.4.2";

/**
 * Helper to call a Jigsudo Cloud Function (Referee)
 */
export async function callJigsudoFunction(name, data) {
  try {
    const fn = httpsCallable(functions, name);
    const result = await fn(data);

    // v1.5.16: Cross-check server time to avoid clock drift issues
    if (result.data && result.data.serverTime) {
      gameManager.updateServerOffset(result.data.serverTime);
    }

    return result.data;
  } catch (error) {
    console.error(`[Functions] Error calling ${name}:`, error);
    throw error;
  }
}

// Real-time listener unsubscribe functions
let unsubscribeProgress = null;
let unsubscribeHistory = null;

/**
 * v1.5.12: Unified Stats Scavenger.
 * Reconstructs a flat stats object from all possible cloud locations (Root, legacy maps, etc).
 */
export function reconstructStats(data) {
  if (!data) return {};
  const s = data.stats || {};

  // v1.3.6: Exhaustive scavenger for all 17 fields including legacy names
  const scavengeNum = (key, fallback) => {
    const ghostKey = `stats.${key}`;
    const val = parseFloat(
      data[key] ?? s[key] ?? data[ghostKey] ?? fallback ?? 0,
    );
    return isNaN(val) ? 0 : val;
  };

  const scavengeStr = (key, fallback) => {
    const ghostKey = `stats.${key}`;
    return data[key] || s[key] || data[ghostKey] || fallback || null;
  };

  const stats = {
    // 1-6. Root Level / Identity
    username: scavengeStr("username", data.username || s.username || "Jugador"),
    username_lc: scavengeStr(
      "username_lc",
      data.username_lc ||
        s.username_lc ||
        data.username?.toLowerCase() ||
        "jugador",
    ),
    lastDailyUpdate: scavengeStr(
      "lastDailyUpdate",
      s.lastDailyUpdate || data.lastDailyUpdate || null,
    ),
    lastMonthlyUpdate: scavengeStr(
      "lastMonthlyUpdate",
      s.lastMonthlyUpdate || data.lastMonthlyUpdate || null,
    ),
    dailyRP: scavengeNum("dailyRP", s.dailyRP || data.dailyRP || 0),
    monthlyRP: scavengeNum("monthlyRP", s.monthlyRP || data.monthlyRP || 0),
    lastDayRP: scavengeNum("lastDayRP", s.lastDayRP || data.lastDayRP || 0),
    lastMonthRP: scavengeNum(
      "lastMonthRP",
      s.lastMonthRP || data.lastMonthRP || 0,
    ),
    careerRP: scavengeNum("careerRP", s.careerRP || data.careerRP || 0),

    // 7-17. Competitive / Metadata
    totalRP: (() => {
      const rawT = scavengeNum(
        "totalRP",
        Math.max(s.totalRP || 0, s.currentRP || 0, data.totalRP || 0),
      );
      const score = scavengeNum(
        "totalScoreAccumulated",
        s.totalScoreAccumulated || 0,
      );
      const penalty = scavengeNum(
        "totalPenaltyAccumulated",
        s.totalPenaltyAccumulated || 0,
      );

      // v1.6.0: Trust the root totalRP field (rawT) if it is explicitly defined
      // or if it's already higher than the calculated net balance.
      // This prevents "Ghost Healing" from corrupted atoms.
      return data.totalRP !== undefined || s.totalRP !== undefined
        ? rawT
        : Math.max(0, score - penalty);
    })(),
    wins: scavengeNum("wins", s.wins || 0),
    currentStreak: scavengeNum("currentStreak", s.currentStreak || 0),
    maxStreak: scavengeNum("maxStreak", s.maxStreak || 0),
    totalPlayed: scavengeNum(
      "totalPlayed",
      Math.max(s.totalPlayed || s.played || 0, data.totalPlayed || 0),
    ),
    bestScore: scavengeNum("bestScore", s.bestScore || 0),
    bestTime: scavengeNum("bestTime", s.bestTime || 0),

    // Maintenance / Decay
    lastDecayCheck: scavengeStr("lastDecayCheck", s.lastDecayCheck || null),
    lastPenaltyDate: scavengeStr("lastPenaltyDate", s.lastPenaltyDate || null),
    lastPlayedDate: scavengeStr("lastPlayedDate", s.lastPlayedDate || null),
    manualRPAdjustment: scavengeNum(
      "manualRPAdjustment",
      s.manualRPAdjustment || 0,
    ),
    lastPenalty: scavengeNum("lastPenalty", s.lastPenalty || 0), // Added explicit scavenge for the counter

    // v1.4.1: Accumulation fields recovery (Targeting Hybrid v7.1)
    totalTimeAccumulated: scavengeNum(
      "totalTimeAccumulated",
      s.totalTimeAccumulated || 0,
    ),
    totalScoreAccumulated: scavengeNum(
      "totalScoreAccumulated",
      s.totalScoreAccumulated || 0,
    ),
    totalBonusesAccumulated: scavengeNum(
      "totalBonusesAccumulated",
      s.totalBonusesAccumulated || 0,
    ), // v1.5.56: Missing Bonus Fix
    totalPeaksErrorsAccumulated: scavengeNum(
      "totalPeaksErrorsAccumulated",
      s.totalPeaksErrorsAccumulated || 0,
    ),
    totalPenaltyAccumulated: scavengeNum(
      "totalPenaltyAccumulated",
      s.totalPenaltyAccumulated || 0,
    ), // v1.5.61: Decay Tracking

    // v1.5.56: Periodic Atoms (Ensures unified scoring across all ranking tables)
    dailyWinsAccumulated: scavengeNum(
      "dailyWinsAccumulated",
      s.dailyWinsAccumulated || 0,
    ),
    monthlyWinsAccumulated: scavengeNum(
      "monthlyWinsAccumulated",
      s.monthlyWinsAccumulated || 0,
    ),
    dailyPeaksErrorsAccumulated: scavengeNum(
      "dailyPeaksErrorsAccumulated",
      s.dailyPeaksErrorsAccumulated || 0,
    ),
    monthlyPeaksErrorsAccumulated: scavengeNum(
      "monthlyPeaksErrorsAccumulated",
      s.monthlyPeaksErrorsAccumulated || 0,
    ),
    dailyBonusesAccumulated: scavengeNum(
      "dailyBonusesAccumulated",
      s.dailyBonusesAccumulated || 0,
    ),
    monthlyBonusesAccumulated: scavengeNum(
      "monthlyBonusesAccumulated",
      s.monthlyBonusesAccumulated || 0,
    ),

    weekdayStatsAccumulated:
      s.weekdayStatsAccumulated || data.weekdayStatsAccumulated || {},

    // Stage specific summaries
    stageWinsAccumulated:
      s.stageWinsAccumulated || data.stageWinsAccumulated || {},
    stageTimesAccumulated:
      s.stageTimesAccumulated || data.stageTimesAccumulated || {},

    history: s.history || data.history || {},
    activeSessionId: scavengeStr("activeSessionId", s.activeSessionId || null),
    isPublic:
      data.isPublic !== undefined
        ? data.isPublic
        : s.isPublic !== undefined
          ? s.isPublic
          : true,
    lastLocalUpdate: scavengeNum("lastLocalUpdate", s.lastLocalUpdate || 0),
    forceWipeAt: scavengeNum(
      "forceWipeAt",
      s.forceWipeAt || data.forceWipeAt || 0,
    ),
    schemaVersion: data.schemaVersion || 0,
    integrityChecked: "1.5.62",
  };

  return stats;
}

export function listenToUserProgress(userId) {
  if (!userId) return;

  // Unsubscribe previous if exists
  if (unsubscribeProgress) {
    unsubscribeProgress();
    unsubscribeProgress = null;
  }

  const userRef = doc(db, "users", userId);

  console.log(`[DB] Starting real-time listener for ${userId}`);
  unsubscribeProgress = onSnapshot(userRef, (docSnap) => {
    // Break infinite sync loops: Ignore snapshots triggered by our own local writes
    if (docSnap.metadata.hasPendingWrites) return;

    if (docSnap.exists()) {
      const data = docSnap.data();
      const remoteStats = reconstructStats(data);

      // Pass data to GameManager for conflict checking
      gameManager.handleCloudSync(
        data.progress,
        remoteStats,
        data.forceSaveRequest,
        data.settings,
      );
    }
  });

  // v1.4.6: Dedicated listener for the history sub-collection
  // Sub-collections are NOT included in the main document snapshot.
  const historyRef = collection(db, "users", userId, "history");
  console.log(`[DB] Starting history listener for ${userId}`);

  unsubscribeHistory = onSnapshot(historyRef, (querySnap) => {
    if (querySnap.metadata.hasPendingWrites) return;

    const cloudHistoryMap = {};
    querySnap.forEach((docSnap) => {
      const seedKey = docSnap.id; // YYYYMMDD string
      if (seedKey.length === 8) {
        // Translate format: 20260411 -> 2026-04-11
        const dateStr = `${seedKey.substring(0, 4)}-${seedKey.substring(4, 6)}-${seedKey.substring(6, 8)}`;
        cloudHistoryMap[dateStr] = docSnap.data();
      }
    });

    console.log(
      `[DB] History sub-collection synced for ${userId}. Translated items: ${Object.keys(cloudHistoryMap).length}`,
    );

    // v1.4.6: Merge logic is now inside gameManager to protect local wins
    gameManager.updateCloudHistory(cloudHistoryMap);
  });
}

export async function triggerRemoteSave(userId) {
  if (!userId || window._jigsudo_migration_freeze) return;
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(
      userRef,
      { forceSaveRequest: serverTimestamp() },
      { merge: true },
    );
    console.log("[DB] Remote save requested.");
  } catch (e) {
    console.error("Error triggering remote save:", e);
  }
}

/**
 * v1.6.0: Automated Fraud Reporting.
 * Persists a referee report document to a centralized collection for administrative review.
 */
export async function sendRefereeReport(details) {
  try {
    const reportsRef = collection(db, "referee_reports");
    const reportData = {
      ...details,
      timestamp: serverTimestamp(),
      resolved: false, // For future admin panel management
    };

    const docRef = await addDoc(reportsRef, reportData);
    console.log(`[Referee] Report persisted: ${docRef.id}`);
    return { success: true, id: docRef.id };
  } catch (e) {
    console.error("[Referee] Failed to send report:", e);
    return { success: false, error: e.message };
  }
}

export function stopListeningAndCleanup() {
  if (unsubscribeProgress) {
    unsubscribeProgress();
    unsubscribeProgress = null;
    console.log("[DB] Real-time Progress listener stopped.");
  }
  if (unsubscribeHistory) {
    unsubscribeHistory();
    unsubscribeHistory = null;
    console.log("[DB] Real-time History listener stopped.");
  }
}

export async function cleanupLegacyStats(userId) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(
      userRef,
      {
        currentStreak: deleteField(),
        distribution: deleteField(),
        // history: deleteField(), // CAREFUL: Make sure we migrated history first?
        // User said "history (map)" at root likely legacy if new stats has its own history.
        // But to be safe, I'll only delete if I am sure.
        // User's dump shows 'stats.history' is the new one. Root 'history' is old.
        // Yes, delete root history.
        history: deleteField(),
        sudoku: deleteField(),
      },
      { merge: true },
    );
    console.log("Legacy fields cleaned up.");
  } catch (e) {
    console.error("Cleanup failed:", e);
  }
}

export async function checkUsernameAvailability(
  username,
  excludeUserId = null,
) {
  if (!username) return false;
  try {
    const lookName = username.toLowerCase();
    console.log(
      `[DB] Checking availability for: "${username}" (lc: "${lookName}"), excluding: ${excludeUserId}`,
    );

    // CALL CLOUD FUNCTION:
    // This solves the 'Missing Permissions' error for guests
    const response = await callJigsudoFunction("checkUsernameAvailability", {
      username,
    });

    if (response && response.available === false) {
      console.log(`[DB] Conflict found via Cloud Function.`);
      return false;
    }

    console.log(`[DB] Username "${username}" is available.`);
    return true;
  } catch (error) {
    console.error("[DB] Availability check failed:", error);
    // FAIL CLOSED: Block registration if we can't verify availability
    return false;
  }
}

export async function saveUserStats(
  userId,
  statsData,
  username = null,
  options = {},
) {
  // Support legacy boolean call: if options is boolean, treat as metadataOnly
  const metadataOnly =
    typeof options === "boolean" ? options : options.metadataOnly || false;
  const isIntentionalPenalty = options._isIntentionalPenalty || false;
  const isConfirmedWin = options._isConfirmedWin || false;
  const isIntentionalReset = options._isIntentionalReset || false; // v1.6.9

  if (!userId || window._jigsudo_migration_freeze) return;

  try {
    const userRef = doc(db, "users", userId);

    // v1.3.4: Atomic RP management (Authority is the Server/Functions)
    const { setDoc, updateDoc, serverTimestamp, getDoc, deleteField } =
      await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");

    const { auth } = await import("./firebase-config.js?v=1.4.2");
    const currentUser = auth.currentUser;

    const updateData = {
      lastUpdated: serverTimestamp(),
      schemaVersion: 7.2, // v1.4.4: Default to latest hybrid schema
    };

    // Propagate options to updateData for internal logic visibility
    if (isConfirmedWin) updateData._isConfirmedWin = true;
    if (isIntentionalReset) updateData._isIntentionalReset = true; // v1.6.9

    // v1.5.30: Set isPublic ONLY if provided in statsData or if the document is new.
    if (statsData && statsData.isPublic !== undefined) {
      updateData.isPublic = statsData.isPublic;
    }

    if (username) {
      updateData.username = username;
      updateData.username_lc = username.toLowerCase();
    }

    // v1.5.30: Sync verification status
    if (currentUser) {
      updateData.isVerified = currentUser.emailVerified || false;
    }

    let statsMap = {};

    if (statsData && !metadataOnly) {
      const s = statsData;

      // --- ANTI-REGRESSION VALVE (v1.2.11) ---
      // Before saving, verify we aren't overwriting real points with 0 due to a local wipe.
      try {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          const cloudData = docSnap.data();
          const cloudStats = cloudData.stats || {};

          // v1.3.5: Robust comparison with safety margin for float precision
          const cloudDaily = Math.max(
            cloudData.dailyRP || 0,
            cloudStats.dailyRP || 0,
          );
          const cloudTotal = Math.max(
            cloudData.totalRP || 0,
            cloudStats.totalRP || 0,
          );
          const cloudMonth = Math.max(
            cloudData.monthlyRP || 0,
            cloudStats.monthlyRP || 0,
          );

          const localDaily = s.dailyRP || 0;
          const localTotal = s.totalRP || 0;
          const localCareer = s.careerRP || 0;

          // Reconstruct stats for proper reset detection
          const remoteStats = reconstructStats(cloudData);
          const cloudCareer = remoteStats.careerRP || 0;

          // --- ANTI-REGRESSION 2.0 (v1.5.4) ---
          // 1. Virgin State Lock: Protect cloud profile from being wiped by local 'localStorage.clear()'
          const isLocalVirgin = localTotal === 0 && (s.wins || 0) === 0 && localCareer === 0;
          const isCloudPopulated = cloudTotal > 0 || (cloudStats.wins || 0) > 0 || cloudCareer > 0;

          if (
            isLocalVirgin &&
            isCloudPopulated &&
            !updateData._isIntentionalReset &&
            !isIntentionalPenalty
          ) {
            // v1.9.0: ALLOW reset if cloud has an active forceWipeAt that is newer than what we processed
            const remoteWipe = remoteStats.forceWipeAt || 0;
            if (remoteWipe > 0) {
              console.log(
                "[DB] Reset in progress... allowing local virgin state.",
              );
            } else {
              console.error(
                "[DB] VIRGIN LOCK: Preventing empty local state from wiping cloud profile.",
              );
              return; // ABORT
            }
          }

          // v1.4.1: Protect careerRP from being overwritten by 0 if remote has value
          if (localCareer === 0 && cloudCareer > 0 && !updateData._isIntentionalReset) {
            console.warn(`[DB] Protection: Preventing overwrite of CareerRP (${cloudCareer}) with local 0.`);
            s.careerRP = cloudCareer;
          }

          // v1.9.0: RESET GUARD (Legacy/Ghost Protection)
          // If the cloud has a forceWipeAt that we haven't acknowledged yet, we MUST block any up-sync.
          // This prevents old client versions from 'undoing' a reset by pushing their high local RP.
          const cloudWipeTS = remoteStats.forceWipeAt || 0;
          const localWipeAck = parseInt(
            localStorage.getItem("jigsudo_last_wipe_ack") || "0",
          );
          if (cloudWipeTS > localWipeAck) {
            console.warn(
              `[DB] RESET GUARD: Cloud reset (${cloudWipeTS}) is newer than local ACK (${localWipeAck}). Blocking up-sync.`,
            );

            // Force adoption of empty cloud state to trigger local wipe in GameManager
            if (gameManager && gameManager.handleCloudSync) {
              const emptyStats = {
                ...cloudData.stats,
                dailyRP: 0,
                totalRP: 0,
                monthlyRP: 0,
                forceWipeAt: cloudWipeTS,
              };
              gameManager.handleCloudSync(
                cloudData.progress,
                emptyStats,
                false,
                cloudData.settings,
              );
            }
            return; // ABORT THE SAVE
          }

          const isTotalRegression = localTotal < cloudTotal - 0.01;
          // v1.5.56: If this is a confirmed victory or an intentional penalty, we usually trust the client truth.
          // BUT: We NEVER trust a 'Virgin State' (zeros) if the cloud is already populated.
          if (isConfirmedWin || isIntentionalPenalty || isIntentionalReset) {
            if (isLocalVirgin && isCloudPopulated && !isIntentionalReset) {
              console.error(
                "[DB] BYPASS REJECTED: Preventing uninitialized local state from wiping cloud during victory anchor.",
              );
              return; // ABORT
            }
            console.log(
              `[DB] Bypass Guard: win=${isConfirmedWin}, penalty=${isIntentionalPenalty}, reset=${isIntentionalReset}`,
            );
          } else if (isTotalRegression) {
            // Normal safety check for periodic saves
            console.warn(
              `[DB] ANTI-REGRESSION TRIGGERED: Cloud(T:${cloudTotal.toFixed(1)}, D:${cloudDaily.toFixed(1)}) > Local(T:${localTotal.toFixed(1)}, D:${localDaily.toFixed(1)})`,
            );

            // Force Adoption of Remote Truth to heal local state
            if (gameManager && gameManager.handleCloudSync) {
              gameManager.handleCloudSync(
                cloudData.progress,
                remoteStats,
                false,
                cloudData.settings,
              );
              return false; // ABORT THE SAVE
            }
          }
        }
      } catch (err) {
        console.warn(
          "[DB] Anti-regression check failed (Network?), proceeding with caution.",
          err,
        );
      }

      const nowDoc = getJigsudoDateString();
      const nowMonth = getJigsudoYearMonth();

      // v1.5.30: LEGACY DELTA CALCULATION REMOVED.
      // The Referee (Cloud Functions) is now the sole authority for incremental RP updates.
      // v1.5.30: ROBUST RP PROPAGATION
      // The client now writes all three RP levels to the root document to ensure
      // session continuity and backup the cloud functions' authority.
      updateData.dailyRP = s.dailyRP || 0;
      updateData.monthlyRP = s.monthlyRP || 0;
      updateData.totalRP = s.totalRP || 0;
      updateData.careerRP = s.careerRP || 0;
      updateData.lastDayRP = s.lastDayRP || 0;
      updateData.lastMonthRP = s.lastMonthRP || 0;

      updateData.lastDailyUpdate = s.lastDailyUpdate || nowDoc;
      updateData.lastMonthlyUpdate = s.lastMonthlyUpdate || nowMonth;
      updateData.lastLocalUpdate = Date.now();
      updateData.schemaVersion = 7.2;

      // Ensure activeSessionId is also synced at the root (allowed by rules)
      if (gameManager?.localSessionId) {
        updateData.activeSessionId = gameManager.localSessionId;
      }

      // 2. Map Stats (Encapsulated technical data)
      // v1.4.5+: Surgical DOT NOTATION to avoid wiping cloud history/subcollections
      // v1.5.30: REMOVED all RP/Ranking fields from here to ensure Single Truth in Root.
      statsMap = {
        wins: s.wins || 0,
        totalPlayed: s.totalPlayed || 0,
        currentStreak: s.currentStreak || 0,
        maxStreak: s.maxStreak || 0,
        bestScore: s.bestScore || 0,
        bestTime: s.bestTime || 0,
        totalTimeAccumulated: s.totalTimeAccumulated || 0,
        totalScoreAccumulated: s.totalScoreAccumulated || 0,
        totalPeaksErrorsAccumulated: s.totalPeaksErrorsAccumulated || 0,
        totalBonusesAccumulated: s.totalBonusesAccumulated || 0,
        monthlyWinsAccumulated: s.monthlyWinsAccumulated || 0,
        monthlyPeaksErrorsAccumulated: s.monthlyPeaksErrorsAccumulated || 0,
        monthlyBonusesAccumulated: s.monthlyBonusesAccumulated || 0,
        dailyWinsAccumulated: s.dailyWinsAccumulated || 0,
        dailyBonusesAccumulated: s.dailyBonusesAccumulated || 0,
        dailyPeaksErrorsAccumulated: s.dailyPeaksErrorsAccumulated || 0,
        lastBonus: s.lastBonus || 0,
        lastPenalty: s.lastPenalty || 0,
        lastDecayCheck: s.lastDecayCheck || null,
        lastPenaltyDate: s.lastPenaltyDate || null,
        lastPlayedDate: s.lastPlayedDate || null,
        totalPenaltyAccumulated: s.totalPenaltyAccumulated || 0,
        stageWinsAccumulated: s.stageWinsAccumulated || {},
        stageTimesAccumulated: s.stageTimesAccumulated || {},
        weekdayStatsAccumulated: s.weekdayStatsAccumulated || {},
      };

      // Perform atomic update of the stats map if it's a confirmed win to avoid hollow snaps
      if (isConfirmedWin) {
        updateData.stats = statsMap;
      } else {
        // Surgical update for periodic saves to keep Firestore throughput low
        Object.keys(statsMap).forEach((key) => {
          updateData[`stats.${key}`] = statsMap[key];
        });

        // v2.2.3: Support for nuclear reset of specific history days
        if (options._historyKeyToDelete) {
          updateData[`stats.history.${options._historyKeyToDelete}`] =
            deleteField();
        }
      }

      // v1.5.30: EXORCISM - Force-delete ghost fields from the map
      const exorcismKeys = [
        "totalRP",
        "monthlyRP",
        "dailyRP",
        "currentRP",
        "score",
        "lastDayRP",
        "lastMonthRP",
        "careerRP",
      ];
      exorcismKeys.forEach((k) => {
        updateData[`stats.${k}`] = deleteField();
      });

      // v1.2.17: Sync Verification bit ONLY if Auth confirms it.
      if (currentUser && currentUser.emailVerified) {
        updateData.isVerified = true;
      }
    }

    if (gameManager.isWiping) {
      console.log("[DB] Update blocked: GM is wiping.");
      return;
    }

    // v1.9.5: NUCLEAR ROOT EXORCISM - Cleanup legacy root fields authorized by rules
    updateData.totalPenaltyAccumulated = deleteField();
    updateData.monthlyPenaltyAccumulated = deleteField();
    updateData.currentRP = deleteField();

    // v1.5.30: METADATA PURGE
    // Firestore rules (affectedKeys().hasOnly) are strict.
    // We must remove all internal control keys (starting with _) before sending.
    Object.keys(updateData).forEach((key) => {
      if (key.startsWith("_")) {
        delete updateData[key];
      }
    });

    // Surgical Execution Flow
    try {
      // 1. Try updateDoc (Fastest, respects all non-mentioned fields in maps)
      await updateDoc(userRef, updateData);
      console.log(
        "[DB] Metadata and Ranking RP updated surgically (updateDoc).",
      );
    } catch (e) {
      // 2. Fallback: If document doesn't exist or lacks root permission due to missing profile
      if (e.code === "not-found" || e.code === "permission-denied") {
        console.log(
          `[DB] Profile initialization required (${e.code}). Executing setDoc...`,
        );

        // v1.5.0: For initial creation, we must ensure the 'stats' map exists
        const initialData = { ...updateData };
        initialData.stats = statsMap;

        // Ensure critical fields for new users are present
        if (initialData.schemaVersion === undefined)
          initialData.schemaVersion = 7.2;
        if (initialData.isPublic === undefined) initialData.isPublic = true;

        // Remove surgical dot-keys as they are redundant for a setDoc(merge:true) with the full map
        Object.keys(initialData).forEach((k) => {
          if (k.includes(".")) delete initialData[k];
        });

        await setDoc(userRef, initialData, { merge: true });
        console.log("[DB] Profile created/initialized successfully (setDoc).");
      } else {
        throw e;
      }
    }
  } catch (error) {
    console.error("Error saving stats:", error);
  }
}

export async function saveUserProgress(userId, progressData, options = {}) {
  if (!userId) return;

  try {
    const userRef = doc(db, "users", userId);
    const isIntentionalReset = options._isIntentionalReset || false;
    if (
      (gameManager.isWiping && !isIntentionalReset) ||
      window._jigsudo_migration_freeze
    ) {
      console.log(
        "[DB] Update blocked: GM is wiping or Migration Freeze active.",
      );
      return;
    }

    // v1.9.4: Root Sanitization.
    // If progressData already has a 'progress' key, it means it's a full state object.
    // We want to flatten it before saving to the 'progress' field in Firestore
    // to match the expected structure: progress.currentStage (not progress.progress.currentStage)
    let pClean = { ...progressData };
    if (pClean.progress && pClean.memory && pClean.data) {
      const { progress, ...rest } = pClean;
      pClean = { ...progress, ...rest };
    }

    const { updateDoc, setDoc, serverTimestamp, deleteField } =
      await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
    try {
      if (isIntentionalReset) {
        // v1.9.5: Nuclear Option - Wipe the field first to ensure ghost data is killed
        await updateDoc(userRef, { progress: deleteField() });
      }

      await updateDoc(userRef, {
        progress: pClean,
        lastUpdated: serverTimestamp(),
        schemaVersion: 7.2,
      });
    } catch (e) {
      if (e.code === "not-found") {
        await setDoc(
          userRef,
          {
            progress: pClean,
            lastUpdated: serverTimestamp(),
            schemaVersion: 7.2,
          },
          { merge: true },
        );
      } else {
        throw e;
      }
    }

    const stageName =
      progressData.progress?.currentStage ||
      progressData.currentStage ||
      "unknown";
    console.log(
      `[DB] Progress saved to cloud for ${userId}. Stage: ${stageName}`,
    );
    showSaveIndicatorWithMessage("Guardado en nube");
  } catch (error) {
    console.error("Error saving progress:", error);
  }
}

export async function loadUserProgress(userId) {
  if (!userId) return;

  try {
    const userRef = doc(db, "users", userId);

    // v1.3.8: Reset migration loop counter if we are moving forward
    if (sessionStorage.getItem("jigsudo_migration_reloads") === "3") {
      console.log("[DB] Manual reset of migration counter triggered.");
      sessionStorage.removeItem("jigsudo_migration_reloads");
    }

    // FORCE fetch from server to avoid infinite reload loop caused by stale cache
    let docSnap;
    try {
      docSnap = await getDocFromServer(userRef);
    } catch (e) {
      console.warn("[DB] Server fetch failed, falling back to cache...", e);
      docSnap = await getDoc(userRef);
    }

    if (docSnap.exists()) {
      const data = docSnap.data();
      const remoteProgress = data.progress;
      let remoteStats = reconstructStats(data);

      const updates = {};
      const todayStr = getJigsudoDateString();
      const nowMonth = getJigsudoYearMonth();

      const cloudSchema = data.schemaVersion || 0;

      // v1.4.5 Limpieza Reactiva v7.1: Si persiste progress.stats incluso en v7.1, lo borramos quirúrgicamente
      if (cloudSchema >= 7.1 && data.progress && data.progress.stats) {
        console.warn(
          "[DB] Residuo 'progress.stats' detectado en v7.1. Lanzando limpieza atómica...",
        );
        try {
          const { updateDoc, deleteField: delF } =
            await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
          await updateDoc(userRef, { "progress.stats": delF() });
        } catch (e) {
          console.error("[DB] Fallo en limpieza reactiva:", e);
        }
      }

      if (cloudSchema < 7.1 && userId) {
        console.warn(
          `[DB] EXECUTING SCHEMA v7.1 HYBRID REFACTOR for ${userId}...`,
        );

        // 1. ATOMIC RECONSTRUCTION: Capture all 17 fields
        const recoveredStats = reconstructStats(data);

        // Safety check for every critical field
        const safe = (val, def) =>
          val === undefined || val === null ? def : val;

        const rootUpdate = {
          // 1. Identity & RP (ROOT)
          username: safe(recoveredStats.username, "Jugador"),
          username_lc: safe(recoveredStats.username_lc, "jugador"),
          totalRP: safe(recoveredStats.totalRP, 0),
          monthlyRP: safe(recoveredStats.monthlyRP, 0),
          dailyRP: safe(recoveredStats.dailyRP, 0),
          lastDailyUpdate: safe(recoveredStats.lastDailyUpdate, todayStr),
          lastMonthlyUpdate: safe(recoveredStats.lastMonthlyUpdate, nowMonth),

          registeredAt: data.registeredAt || serverTimestamp(),
          isPublic: true,
          schemaVersion: 7.2,

          // 2. Consolidated Competitive Stats (MAP)
          stats: {
            wins: safe(recoveredStats.wins, 0),
            totalPlayed: safe(recoveredStats.totalPlayed, 0),
            currentStreak: safe(recoveredStats.currentStreak, 0),
            maxStreak: safe(recoveredStats.maxStreak, 0),
            bestScore: safe(recoveredStats.bestScore, 0),
            bestTime: safe(recoveredStats.bestTime, 0),
            totalTimeAccumulated: safe(recoveredStats.totalTimeAccumulated, 0),
            totalScoreAccumulated: safe(
              recoveredStats.totalScoreAccumulated,
              0,
            ),
            totalPeaksErrorsAccumulated: safe(
              recoveredStats.totalPeaksErrorsAccumulated,
              0,
            ),
            stageWinsAccumulated: recoveredStats.stageWinsAccumulated || {},
            stageTimesAccumulated: recoveredStats.stageTimesAccumulated || {},
            weekdayStatsAccumulated:
              recoveredStats.weekdayStatsAccumulated || {},
            activeSessionId: gameManager.localSessionId,
          },
        };

        // 3. Purge redundant/ghost fields
        rootUpdate["progress.stats"] = deleteField();

        // Clean up any loose root fields that should be in stats map
        const rootToPurge = [
          "wins",
          "totalPlayed",
          "currentStreak",
          "maxStreak",
          "bestScore",
          "bestTime",
          "totalTimeAccumulated",
          "totalScoreAccumulated",
          "totalPeaksErrorsAccumulated",
          "stageWinsAccumulated",
          "stageTimesAccumulated",
          "weekdayStatsAccumulated",
          "activeSessionId",
          "lastDecayCheck",
          "lastPenaltyDate",
          "lastPlayedDate",
          "manualRPAdjustment",
        ];
        rootToPurge.forEach((k) => {
          if (data[k] !== undefined) rootUpdate[k] = deleteField();
        });

        // 4. History Migration (Move to sub-collection)
        const oldHistory = recoveredStats.history || {};
        const {
          writeBatch,
          collection,
          doc: fireDoc,
          deleteField: delF,
          getDocs,
        } = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
        const migBatch = writeBatch(db);

        for (const [date, entry] of Object.entries(oldHistory)) {
          const seedStr = date.replace(/-/g, "");
          const histDocRef = fireDoc(collection(userRef, "history"), seedStr);
          migBatch.set(
            histDocRef,
            {
              seed: parseInt(seedStr),
              original: {
                score: entry.score || 0,
                totalTime: entry.totalTime || entry.time || 0,
                stageTimes: entry.stageTimes || {},
                errors:
                  entry.errors !== undefined
                    ? entry.errors
                    : entry.peaksErrors || 0,
                timestamp: entry.timestamp || serverTimestamp(),
              },
              best: {
                score: entry.score || 0,
                totalTime: entry.totalTime || entry.time || 0,
                stageTimes: entry.stageTimes || {},
                errors:
                  entry.errors !== undefined
                    ? entry.errors
                    : entry.peaksErrors || 0,
                timestamp: entry.timestamp || serverTimestamp(),
              },
              attempts: entry.attempts || 1,
              lastPlayed: entry.timestamp || serverTimestamp(),
            },
            { merge: true },
          );
        }

        // 5. Cleanup Obsolete Sessions Collection
        try {
          const sessionsRef = collection(userRef, "sessions");
          const sessSnap = await getDocs(sessionsRef);
          sessSnap.forEach((sDoc) => migBatch.delete(sDoc.ref));
        } catch (e) {
          console.warn("[DB] Cleanup sessions failed:", e);
        }

        // 6. Clean up previous ghost fields (dots in names)
        const ghostFields = [
          "stats.dailyRP",
          "stats.monthlyRP",
          "stats.totalRP",
          "stats.currentStreak",
          "stats.wins",
          "stats.lastDailyUpdate",
          "stats.lastMonthlyUpdate",
          "stats.lastLocalUpdate",
          "stats.history",
          "stats.registeredAt",
          "stats.currentRP",
          "stats.totalScoreAccumulated",
          "stats.totalTimeAccumulated",
          "stats.stageWinsAccumulated",
          "stats.stageTimesAccumulated",
          "stats.activeSessionId",
        ];
        ghostFields.forEach((k) => {
          if (data[k] !== undefined) rootUpdate[k] = deleteField();
        });

        migBatch.set(userRef, rootUpdate, { merge: true });
        await migBatch.commit();
        console.log(
          "[DB] Schema v7.1 Hybrid Refactor SUCCESSFUL. Restarting application...",
        );

        // Safeguard against infinite reloads
        const reloadCount = parseInt(
          sessionStorage.getItem("jigsudo_migration_reloads") || "0",
        );
        if (reloadCount < 3) {
          sessionStorage.setItem(
            "jigsudo_migration_reloads",
            (reloadCount + 1).toString(),
          );
          sessionStorage.setItem(
            "jigsudo_active_session_id",
            rootUpdate.stats.activeSessionId,
          );
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } else {
          console.error(
            "[DB] Migration loop detected. Please refresh manually.",
          );
          sessionStorage.removeItem("jigsudo_migration_reloads");
        }
        return;
      }

      // If we reach here, we are on Schema v7+. Clear the loop counter.
      sessionStorage.removeItem("jigsudo_migration_reloads");

      // Post-migration or already v5
      await gameManager.handleCloudSync(
        data.progress,
        remoteStats,
        null,
        null, // v1.3.0: Settings are now local only
      );
    } else {
      console.log("No remote progress found. Creating new entry on next save.");
    }
  } catch (error) {
    console.error("Error loading progress:", error);
  }
}

export async function fetchLatestUserData(userId) {
  if (!userId) return null;
  try {
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (error) {
    console.error("Error fetching latest user data:", error);
    return null;
  }
}

/**
 * v1.3.0: Season Transition 1 Hard Reset.
 * Performs a deep remote wipe of history and stats while preserving identity.
 */
export async function performSeasonReset(userId) {
  if (!userId) return { success: false, error: "No user ID provided" };
  console.log(`[DB] performSeasonReset STARTED for ${userId}`);

  try {
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
      console.log(
        "[DB] performSeasonReset: Profile doesn't exist. Creating fresh Season 1 profile...",
      );
      const { setDoc, serverTimestamp } =
        await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
      await setDoc(userRef, {
        schemaVersion: 7.2,
        stats: {
          wins: 0,
          totalRP: 0,
          dailyRP: 0,
          monthlyRP: 0,
          registeredAt: serverTimestamp(),
        },
        lastUpdated: serverTimestamp(),
      });
      return { success: true };
    }

    const oldData = docSnap.data();
    console.warn(`[Season Migration] Wiping remote data for ${userId}...`);

    // 1. Delete History Sub-collection (Batch)
    const historyRef = collection(db, "users", userId, "history");
    const historySnap = await getDocs(historyRef);

    if (!historySnap.empty) {
      const batch = writeBatch(db);
      historySnap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(
        `[Season Migration] Deleted ${historySnap.size} history records.`,
      );
    }

    // 2. Perform Surgical Hard Reset (Respecting Security Rules)
    const { updateDoc, deleteField } =
      await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");

    const resetUpdate = {
      // RESET STATS (Root)
      totalRP: 0,
      monthlyRP: 0,
      dailyRP: 0,
      lastDayRP: 0,
      lastMonthRP: 0,
      lastDailyUpdate: getJigsudoDateString(),
      lastMonthlyUpdate: getJigsudoYearMonth(),

      // VERSION & SYNC
      schemaVersion: 7.2,
      lastUpdated: serverTimestamp(),
      lastLocalUpdate: Date.now(),
      forceWipeAt: Date.now(),

      // PURGE PROGRESS & GHOSTS
      progress: deleteField(),

      // RESET STATS MAP
      stats: {
        wins: 0,
        totalPlayed: 0,
        currentStreak: 0,
        maxStreak: 0,
        bestScore: 0,
        bestTime: 0,
        totalTimeAccumulated: 0,
        totalScoreAccumulated: 0,
        totalPeaksErrorsAccumulated: 0,
        totalPenaltyAccumulated: 0,
        stageWinsAccumulated: {},
        stageTimesAccumulated: {},
        weekdayStatsAccumulated: {},
      },
    };

    await updateDoc(userRef, resetUpdate);

    // 3. Reset Progress Document (If needed)
    // The main document contains progress in v7+, we already cleared it by calling setDoc without merge.

    console.log("[Season Migration] Remote wipe complete.");
    return { success: true };
  } catch (e) {
    console.error(`[DB] performSeasonReset FAILED for ${userId}:`, e);
    return { success: false, error: e.message };
  }
}

export async function getPublicUserByUsername(username) {
  if (!username) return null;
  try {
    const usersRef = collection(db, "users");
    const lookName = username.toLowerCase();

    // Check case-insensitive index and satisfy security rules
    const q = query(
      usersRef,
      where("username_lc", "==", lookName),
      where("isPublic", "==", true),
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      return null;
    }

    // There should only be one match due to availability checks, but we take the first
    const publicProfileData = snap.docs[0].data();

    const isPublic = publicProfileData.isPublic !== false;

    if (!isPublic) {
      return {
        username: publicProfileData.username,
        isPrivate: true,
      };
    }

    // Return a sanitized version of the user document (do NOT return email, progress, etc.)
    return {
      username: publicProfileData.username,
      username_lc: publicProfileData.username_lc,
      stats: publicProfileData.stats || {},
      isVerified: publicProfileData.isVerified || false,
      totalRP: publicProfileData.totalRP || 0,
      careerRP: publicProfileData.careerRP || 0,
      monthlyRP: publicProfileData.monthlyRP || 0,
      dailyRP: publicProfileData.dailyRP || 0,
      lastUpdated: publicProfileData.lastUpdated,
      uid: snap.docs[0].id,
    };
  } catch (error) {
    console.error("[DB] Error fetching public profile:", error);
    return null;
  }
}

/**
 * v1.7.5: Fetches public history records for a given user UID.
 */
export async function getPublicUserHistory(uid) {
  if (!uid) return {};
  try {
    const { collection, getDocs } =
      await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
    const historyRef = collection(db, "users", uid, "history");
    const snap = await getDocs(historyRef);
    const history = {};
    snap.docs.forEach((doc) => {
      const data = doc.data();
      // v1.7.6: Convert seed ID (YYYYMMDD) to date string (YYYY-MM-DD) for the calendar
      const seedStr = doc.id;
      if (seedStr.length === 8) {
        const y = seedStr.substring(0, 4);
        const m = seedStr.substring(4, 6);
        const d = seedStr.substring(6, 8);
        const dateKey = `${y}-${m}-${d}`;
        history[dateKey] = data;
      } else {
        history[doc.id] = data;
      }
    });
    return history;
  } catch (error) {
    console.error("[DB] Error fetching public history:", error);
    return {};
  }
}

/**
 * v1.7.0: User Search (Prefix-based)
 * Returns a list of public users whose username starts with the query.
 */
export async function searchPublicUsers(queryText, limitCount = 20) {
  if (!queryText || queryText.length < 2) return [];
  try {
    const { collection, query, where, getDocs, limit, orderBy } =
      await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
    const usersRef = collection(db, "users");
    const lookName = queryText.toLowerCase();

    // Prefix search strategy: [query] to [query + \uf8ff]
    const q = query(
      usersRef,
      where("username_lc", ">=", lookName),
      where("username_lc", "<=", lookName + "\uf8ff"),
      where("isPublic", "==", true),
      limit(limitCount),
    );

    const snap = await getDocs(q);
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        username: data.username,
        username_lc: data.username_lc,
        totalRP: data.totalRP || 0,
        careerRP: data.careerRP || 0,
        monthlyRP: data.monthlyRP || 0,
        stats: data.stats || {},
        isVerified: data.isVerified || false,
      };
    });
  } catch (error) {
    console.error("[DB] User search failed:", error);
    return [];
  }
}

export async function updateProfilePrivacy(userId, isPublic) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, { isPublic }, { merge: true });
    console.log(
      `[DB] Profile privacy updated: ${isPublic ? "Public" : "Private"}`,
    );
  } catch (error) {
    console.error("[DB] Error updating profile privacy:", error);
  }
}

/**
 * v1.4.6: Proactively initializes a history record for a given seed.
 * Sets 'played: true' at the document root and increments attempt counter.
 * Schema v7.1 Compliance: No 'best.played' or 'lastPlayed' here.
 */
export async function initializeHistoryDocument(userId, seed) {
  if (!userId || !seed) return;
  try {
    const historyRef = doc(db, "users", userId, "history", seed.toString());
    const historySnap = await getDoc(historyRef);

    const updateData = {
      seed: seed,
      status: historySnap.exists()
        ? historySnap.data().status || "played"
        : "played",
    };

    if (!historySnap.exists()) {
      updateData.original = { won: false };
      await setDoc(historyRef, updateData);
    } else {
      await updateDoc(historyRef, updateData);
    }
    console.log(
      `[DB] History record initialized for ${seed} (played=true, attempts++)`,
    );
  } catch (error) {
    console.error("[DB] Error initializing history record:", error);
  }
}

export async function updateUserPreference(userId, key, value) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(
      userRef,
      {
        settings: {
          [key]: value,
        },
      },
      { merge: true },
    );
    console.log(`[DB] Preference ${key} saved to cloud: ${value}`);
  } catch (error) {
    console.error(`[DB] Error saving preference ${key}:`, error);
  }
}

function showSaveIndicatorWithMessage(msg) {
  // Reuse existing save indicator logic or create one

  const indicator = document.getElementById("save-indicator");
  if (indicator) {
    indicator.textContent = msg;
    indicator.classList.add("visible");
    setTimeout(() => {
      indicator.classList.remove("visible");
      // Reset text
      setTimeout(() => (indicator.textContent = "Guardando..."), 300);
    }, 2000);
  }
}

export async function wipeUserData(userId) {
  if (!userId) {
    console.error("No user ID provided for wipe.");
    return;
  }
  try {
    const userRef = doc(db, "users", userId);

    // 1. Recursive cleanup: Delete sessions subcollection
    try {
      const sessionsRef = collection(db, "users", userId, "sessions");
      const sessionsSnap = await getDocs(sessionsRef);
      if (!sessionsSnap.empty) {
        console.log(
          `[DB] Deleting ${sessionsSnap.size} orphan sessions for ${userId}...`,
        );
        const deletePromises = sessionsSnap.docs.map((sessionDoc) =>
          deleteDoc(sessionDoc.ref),
        );
        await Promise.all(deletePromises);
      }
    } catch (e) {
      console.error("[DB] Failed to wipe sessions:", e);
    }

    // 2. Recursive cleanup: Delete history subcollection (v1.4.5: FIX)
    try {
      const historyRef = collection(db, "users", userId, "history");
      const historySnap = await getDocs(historyRef);
      if (!historySnap.empty) {
        console.log(
          `[DB] Deleting ${historySnap.size} orphan history records for ${userId}...`,
        );
        const deletePromises = historySnap.docs.map((histDoc) =>
          deleteDoc(histDoc.ref),
        );
        await Promise.all(deletePromises);
      }
    } catch (e) {
      console.error("[DB] Failed to wipe history:", e);
    }

    // 3. Delete the main user document (v1.4.5: Always last to keep rules-auth valid)
    await deleteDoc(userRef);

    console.warn(
      `🔥 User and all associated data (Sessions & History) Wiped for ${userId}`,
    );
  } catch (error) {
    console.error("Critical error during user data wipe:", error);
  }
}

/**
 * v1.4.6: Saves a detailed history record for a given seed.
 * Stores times, score, and original win status in the subcollection.
 * userId/history/seed
 */
export async function saveHistoryEntry(userId, seed, historyData) {
  if (!userId || !seed) return;
  try {
    const historyRef = doc(db, "users", userId, "history", seed.toString());

    // Cleanup high-precision numbers or complex objects if necessary
    const cleanData = {
      ...historyData,
      lastUpdated: serverTimestamp(),
    };

    await setDoc(historyRef, cleanData, { merge: true });
    console.log(`[DB] Detailed history record saved for ${seed}`);

    // v1.9.0: Dispatch event to notify history UI
    window.dispatchEvent(
      new CustomEvent("jigsudoHistoryUpdated", {
        detail: { seed, data: cleanData },
      }),
    );
  } catch (error) {
    console.error("[DB] Error saving detailed history record:", error);
  }
}

/**
 * v2.2.1: Nuclear Reset Support.
 * Deletes a history record for a given seed.
 */
export async function deleteHistoryEntry(userId, seed) {
  if (!userId || !seed) return;
  try {
    const { deleteDoc } =
      await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
    const historyRef = doc(db, "users", userId, "history", seed.toString());
    await deleteDoc(historyRef);
    console.log(`[DB] History record DELETED for ${seed}`);
    window.dispatchEvent(
      new CustomEvent("jigsudoHistoryUpdated", {
        detail: { seed, deleted: true },
      }),
    );
  } catch (error) {
    console.error("[DB] Error deleting history record:", error);
  }
}

/**
 * Efficiently calculates the rank of a user by counting documents with a higher score.
 * Cost: 1 document read.
 */
export async function getUserRank(
  fieldName,
  score,
  onlyVerified = false,
  filterField = null,
  filterValue = null,
) {
  if (score === undefined || score === null) return null;
  try {
    const usersRef = collection(db, "users");
    // Rank = (Number of users with score > current score) + 1
    let q;
    let conditions = [
      where(fieldName, ">", score),
      where("isPublic", "==", true),
    ];

    if (onlyVerified) conditions.push(where("isVerified", "==", true));
    if (filterField && filterValue)
      conditions.push(where(filterField, "==", filterValue));

    q = query(usersRef, ...conditions);
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count + 1;
  } catch (error) {
    return null;
  }
}

/**
 * v1.9.6: Secure Profile Initialization
 * Ensures a clean, rule-compliant profile exists before saving progress or calling Cloud Functions.
 * This resolves permission-denied errors that occur after a nuclear account reset.
 */
export async function ensureUserProfileExists(userId, userDisplayName) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      console.log("[DB] Perfil no encontrado. Inicializando perfil limpio...");
      const { serverTimestamp } =
        await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
      await setDoc(userRef, {
        schemaVersion: 7.2,
        lastUpdated: serverTimestamp(),
        registeredAt: serverTimestamp(),
        isPublic: true,
        username: userDisplayName || "Usuario",
        username_lc: (userDisplayName || "Usuario").toLowerCase(),
        stats: {},
      });
      console.log("[DB] Perfil inicializado correctamente.");
    }
  } catch (e) {
    console.error("[DB] Error al inicializar perfil:", e);
  }
}
