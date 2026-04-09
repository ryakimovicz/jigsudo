import { db, functions } from "./firebase-config.js?v=1.1.19";
import {
  doc,
  setDoc,
  getDoc,
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
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-functions.js";
import { gameManager } from "./game-manager.js?v=1.1.19";
import { getJigsudoDateString, getJigsudoYearMonth } from "./utils/time.js?v=1.1.19";

/**
 * Helper to call a Jigsudo Cloud Function (Referee)
 */
export async function callJigsudoFunction(name, data) {
  try {
    const fn = httpsCallable(functions, name);
    const result = await fn(data);
    return result.data;
  } catch (error) {
    console.error(`[Functions] Error calling ${name}:`, error);
    throw error;
  }
}

// Real-time listener unsubscribe function
let unsubscribeProgress = null;

/**
 * Internal helper to unify legacy stats reconstruction (v1.2.9)
 */
function _reconstructStats(data) {
  // If no stats at all, return null
  if (!data.stats && data.dailyRP === undefined && data.totalRP === undefined) return null;

  const s = data.stats || {};
  
  // v1.2.13: Ghost-Field Scavenging
  // We check BOTH the proper map AND those literal keys with dots (ghost fields)
  // because previous versions created them incorrectly.
  const scavenge = (key, fallback) => {
    const ghostKey = `stats.${key}`;
    return Math.max(fallback || 0, data[ghostKey] || 0);
  };

  // Compare Map vs Root vs Ghost and pick the highest value for each field
  const stats = {
    totalPlayed: scavenge("totalPlayed", Math.max(s.totalPlayed || s.played || 0, data.totalPlayed || data.played || 0)),
    currentStreak: scavenge("currentStreak", Math.max(s.currentStreak || 0, data.currentStreak || 0)),
    maxStreak: scavenge("maxStreak", Math.max(s.maxStreak || 0, data.maxStreak || 0)),
    currentRP: scavenge("currentRP", Math.max(s.currentRP || s.totalRP || 0, data.currentRP || data.totalRP || 0)),
    totalRP: scavenge("totalRP", Math.max(s.totalRP || 0, data.totalRP || 0)),
    dailyRP: scavenge("dailyRP", Math.max(s.dailyRP || 0, data.dailyRP || 0)),
    monthlyRP: scavenge("monthlyRP", Math.max(s.monthlyRP || 0, data.monthlyRP || 0)),
    bestScore: scavenge("bestScore", Math.max(s.bestScore || 0, data.bestScore || 0)),
    lastDailyUpdate: s.lastDailyUpdate || data.lastDailyUpdate || data["stats.lastDailyUpdate"] || null,
    lastMonthlyUpdate: s.lastMonthlyUpdate || data.lastMonthlyUpdate || data["stats.lastMonthlyUpdate"] || null,
    history: s.history || data.history || {},
    integrityChecked: "1.3.0"
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
      const remoteStats = _reconstructStats(data);

      // Pass data to GameManager for conflict checking
      gameManager.handleCloudSync(
        data.progress,
        remoteStats,
        data.forceSaveRequest,
        data.settings,
      );
    }
  });
}

export async function triggerRemoteSave(userId) {
  if (!userId) return;
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

export function stopListeningAndCleanup() {
  if (unsubscribeProgress) {
    unsubscribeProgress();
    unsubscribeProgress = null;
    console.log("[DB] Real-time listener stopped.");
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
      username 
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


export async function saveUserStats(userId, statsData, username = null, metadataOnly = false) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);

    const { auth } = await import("./firebase-config.js?v=1.1.19");
    const currentUser = auth.currentUser;
    // v1.3.4: Atomic RP management (Authority is the Server/Functions)
    const { setDoc, updateDoc, serverTimestamp, getDoc } = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");

    const updateData = {
      lastUpdated: serverTimestamp(),
      isPublic: true, // Self-healing: Ensure visibility for ranking
    };

    if (username) {
      updateData.username = username;
      updateData.username_lc = username.toLowerCase();
    }

    if (statsData && !metadataOnly) {
      const s = statsData;
      
      // --- ANTI-REGRESSION VALVE (v1.2.11) ---
      // Before saving, verify we aren't overwriting real points with 0 due to a local wipe.
      try {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          const cloudData = docSnap.data();
          const cloudStats = cloudData.stats || {};
          
          // Compare local against the BEST of either ROOT or MAP
          const cloudDaily = Math.max(cloudData.dailyRP || 0, cloudStats.dailyRP || 0);
          const cloudTotal = Math.max(cloudData.totalRP || 0, cloudStats.totalRP || 0);
          
          const localDaily = s.dailyRP || 0;
          const localTotal = s.totalRP || 0;

          // If cloud has more points and it's THE SAME DAY, REJECT the save.
          const currentDayStr = s.lastDailyUpdate || new Date().toISOString().split('T')[0];
          const cloudDayStr = cloudData.lastDailyUpdate || (cloudStats.lastDailyUpdate || "");
          const isSameDay = cloudDayStr === currentDayStr;
          
          if (isSameDay && (cloudDaily > localDaily || cloudTotal > localTotal)) {
            console.error(
              `[DB] ANTI-REGRESSION TRIGGERED: Aborting save. Cloud has more points (${cloudDaily}p) than local (${localDaily}p).`,
            );
            return; // ABORT THE SAVE
          }
        }
      } catch (err) {
        console.warn("[DB] Anti-regression check failed (Network?), proceeding with caution.", err);
      }

      // Internal stats map (Source of truth for logic)
      const nowDoc = getJigsudoDateString();
      const nowMonth = getJigsudoYearMonth();

      // v1.3.4/v1.4.1: CLIENT NO LONGER OVERWRITES STATS OR RP.
      // These are managed exclusively by the Cloud Function (Referee).
      updateData["stats.lastDailyUpdate"] = s.lastDailyUpdate || nowDoc;
      updateData["stats.lastLocalUpdate"] = Date.now();
      
      // Root level fields: We keep only non-competitive maintenance fields
      updateData.lastDailyUpdate = s.lastDailyUpdate || nowDoc;

      // v1.2.17: Sync Verification bit ONLY if Auth confirms it.
      if (currentUser && currentUser.emailVerified) {
        updateData.isVerified = true;
      }
    }

    if (gameManager.isWiping) {
      console.log("[DB] Update blocked: GM is wiping.");
      return;
    }

    // Surgical Execution Flow
    try {
      // 1. Try updateDoc (Fastest, respects all non-mentioned fields in maps)
      await updateDoc(userRef, updateData);
      console.log("[DB] Metadata and Ranking RP updated surgically (updateDoc).");
    } catch (e) {
      // 2. Fallback: If document doesn't exist, we must use setDoc
      if (e.code === "not-found") {
        console.log("[DB] Profile not found, creating with initial stats...");
        
        // Convert surgical dots back to nested for initial creation if necessary
        // or just use a clean creation object.
        const initialData = { ...updateData };
        // Clean creation: No competitive fields in initial data from client
        Object.keys(initialData).forEach(k => { if (k.includes(".")) delete initialData[k]; });
        
        await setDoc(userRef, initialData, { merge: true });
        console.log("[DB] Profile created successfully (setDoc).");
      } else {
        throw e;
      }
    }
  } catch (error) {
    console.error("Error saving stats:", error);
  }
}

export async function saveUserProgress(userId, progressData) {
  if (!userId) return;

  try {
    const userRef = doc(db, "users", userId);
    if (gameManager.isWiping) {
      console.log("[DB] Update blocked: GM is wiping.");
      return;
    }
    await setDoc(
      userRef,
      {
        progress: progressData,
        lastUpdated: serverTimestamp(),
      },
      { merge: true },
    );

    console.log(
      `[DB] Progress saved to cloud for ${userId}. Stage: ${progressData.progress?.currentStage}`,
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
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const remoteProgress = data.progress;
      let remoteStats = _reconstructStats(data);

      const updates = {};
      const todayStr = getJigsudoDateString();
      const nowMonth = getJigsudoYearMonth();
      
      // --- CONSOLIDATION & DUAL-SYNC (v1.2.12) ---
      // 1. If 'stats' map is missing but root fields exist, create the map.
      // 2. If 'stats' map exists but root fields are missing/stale, update root.
      if (remoteStats) {
        const cloudDaily = data.dailyRP || 0;
        const cloudMonthly = data.monthlyRP || 0;
        const cloudTotal = data.totalRP || 0;

        // v1.3.5: Proactive Legacy Seeding. 
        // If Root fields are missing OR inconsistent with the Stats map, we HEAL immediately.
        if (!data.stats || (remoteStats.dailyRP > cloudDaily) || (remoteStats.monthlyRP > cloudMonthly) || (remoteStats.totalRP > cloudTotal)) {
          console.log("[DB] Healing Legacy/Inconsistent Root fields (v1.3.5)...");
          updates.stats = remoteStats;
          updates.dailyRP = remoteStats.dailyRP;
          updates.monthlyRP = remoteStats.monthlyRP;
          updates.totalRP = remoteStats.totalRP;
          updates.lastDailyUpdate = remoteStats.lastDailyUpdate || todayStr;
          updates.lastMonthlyUpdate = remoteStats.lastMonthlyUpdate || nowMonth;
          
          // GHOST CLEANUP: Delete fields with literal dots in their names
          const { deleteField } = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
          const ghostKeys = ["stats.dailyRP", "stats.monthlyRP", "stats.totalRP", "stats.lastDailyUpdate", "stats.lastMonthlyUpdate", "stats.lastLocalUpdate"];
          ghostKeys.forEach(k => {
            if (data[k] !== undefined) updates[k] = deleteField();
          });
        }
      }

      // SELF-HEALING: If user has a username but not the lowercase version, fix it now.
      if (data.username && !data.username_lc) {
        console.log("[DB] Migrating legacy username to lowercase index...");
        updates.username_lc = data.username.toLowerCase();
      }

      // SELF-HEALING: If registeredAt is missing (Legacy users), fix it now.
      if (!data.registeredAt) {
        console.log("[DB] Healing missing registeredAt for legacy user...");
        let firstDateStr = "2026-04-05T00:00:00.000Z"; // Default launch day
        if (remoteStats && remoteStats.history) {
          const historyDates = Object.keys(remoteStats.history).sort();
          if (historyDates.length > 0) {
            firstDateStr = historyDates[0] + "T09:00:00.000Z"; // Proxy registration date
          }
        }
        updates.registeredAt = new Date(firstDateStr);
      }

      if (Object.keys(updates).length > 0) {
        await setDoc(userRef, updates, { merge: true });
      }
      
      await gameManager.handleCloudSync(
        remoteProgress,
        remoteStats,
        null,
        data.settings,
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

export async function getPublicUserByUsername(username) {
  if (!username) return null;
  try {
    const usersRef = collection(db, "users");
    const lookName = username.toLowerCase();

    // Check case-insensitive index and satisfy security rules
    const q = query(usersRef, where("username_lc", "==", lookName), where("isPublic", "==", true));
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
      monthlyRP: publicProfileData.monthlyRP || 0,
      dailyRP: publicProfileData.dailyRP || 0,
      lastUpdated: publicProfileData.lastUpdated,
    };
  } catch (error) {
    console.error("[DB] Error fetching public profile:", error);
    return null;
  }
}

export async function updateProfilePrivacy(userId, isPublic) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, { isPublic }, { merge: true });
    showSaveIndicatorWithMessage("Ajuste guardado");
  } catch (error) {
    console.error("[DB] Error updating profile privacy:", error);
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
    // Firestore deleteDoc does NOT delete subcollections automatically.
    const sessionsRef = collection(db, "users", userId, "sessions");
    const sessionsSnap = await getDocs(sessionsRef);
    
    if (!sessionsSnap.empty) {
      console.log(`[DB] Deleting ${sessionsSnap.size} orphan sessions for ${userId}...`);
      const deletePromises = sessionsSnap.docs.map(sessionDoc => deleteDoc(sessionDoc.ref));
      await Promise.all(deletePromises);
    }

    // 2. Delete the main user document
    await deleteDoc(userRef);

    console.warn(`🔥 User and all associated data Wiped for ${userId}`);
  } catch (error) {
    console.error("Error wiping user data:", error);
  }
}

/**
 * Efficiently calculates the rank of a user by counting documents with a higher score.
 * Cost: 1 document read.
 */
export async function getUserRank(fieldName, score, onlyVerified = false, filterField = null, filterValue = null) {
  if (score === undefined || score === null) return null;
  try {
    const usersRef = collection(db, "users");
    // Rank = (Number of users with score > current score) + 1
    let q;
    let conditions = [
      where(fieldName, ">", score),
      where("isPublic", "==", true)
    ];
    
    if (onlyVerified) conditions.push(where("isVerified", "==", true));
    if (filterField && filterValue) conditions.push(where(filterField, "==", filterValue));

    q = query(usersRef, ...conditions);
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count + 1;
  } catch (error) {
    console.error(`[DB] Error calculating rank for ${fieldName}:`, error);
    return null;
  }
}
