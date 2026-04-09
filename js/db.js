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
      // Pass data to GameManager for conflict checking
      gameManager.handleCloudSync(
        data.progress,
        data.stats,
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
    const usersRef = collection(db, "users");
    const lookName = username.toLowerCase();

    console.log(
      `[DB] Checking availability for: "${username}" (lc: "${lookName}"), excluding: ${excludeUserId}`,
    );

    // 1. Check case-insensitive index (New System)
    const q1 = query(usersRef, where("username_lc", "==", lookName));
    const snap1 = await getDocs(q1);

    if (!snap1.empty) {
      // Check if any match is NOT the current user
      const conflict = snap1.docs.some((doc) => doc.id !== excludeUserId);
      if (conflict) {
        console.log(`[DB] Conflict found in username_lc index.`);
        return false;
      }
    }

    // 2. Fallback: Check case-sensitive exact match (Legacy Protection)
    // This is vital for users who haven't logged in since the 'username_lc' system was added.
    const q2 = query(usersRef, where("username", "==", username));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      const conflict = snap2.docs.some((doc) => doc.id !== excludeUserId);
      if (conflict) {
        console.log(`[DB] Conflict found in legacy username field.`);
        return false;
      }
    }

    // 3. Extra Safety: Check for case-insensitive matches in legacy 'username' field
    // Since we can't do case-insensitive queries in Firestore without a normalized field,
    // and we hit this point only if 'username_lc' was missing, we can't do much more
    // without a full collection scan (expensive). However, the 'username_lc' field
    // will be populated as soon as those legacy users log in.

    console.log(`[DB] Username "${username}" is available.`);
    return true;
  } catch (error) {
    console.error("[DB] Availability check failed:", error);
    return true; // Fail open to avoid blocking UI, but ideally would handle better
  }
}

export async function saveUserStats(userId, statsData, username = null, metadataOnly = false) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);

    const { auth } = await import("./firebase-config.js?v=1.1.19");
    const currentUser = auth.currentUser;
    const { setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");

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
      // Internal stats map (Source of truth for logic)
      const nowDoc = new Date().toISOString().split('T')[0];
      const nowMonth = nowDoc.substring(0, 7);

      updateData["stats.dailyRP"] = s.dailyRP || 0;
      updateData["stats.monthlyRP"] = s.monthlyRP || 0;
      updateData["stats.totalRP"] = s.totalRP || 0;
      updateData["stats.lastDailyUpdate"] = s.lastDailyUpdate || nowDoc;
      updateData["stats.lastMonthlyUpdate"] = s.lastMonthlyUpdate || nowMonth;
      updateData["stats.lastLocalUpdate"] = Date.now();
      
      // Root level fields (Indexed for Ranking queries)
      updateData.dailyRP = s.dailyRP || 0;
      updateData.monthlyRP = s.monthlyRP || 0;
      updateData.totalRP = s.totalRP || 0;
      updateData.lastDailyUpdate = s.lastDailyUpdate || nowDoc;
      updateData.lastMonthlyUpdate = s.lastMonthlyUpdate || nowMonth;
    }

    if (gameManager.isWiping) {
      console.log("[DB] Update blocked: GM is wiping.");
      return;
    }

    await setDoc(userRef, updateData, { merge: true });
    console.log("[DB] Metadata and Ranking RP updated surgicaly.");
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
      const remoteStats = data.stats; // New field

      // SELF-HEALING: If user has a username but not the lowercase version, fix it now.
      const updates = {};
      if (data.username && !data.username_lc) {
        console.log("[DB] Migrating legacy username to lowercase index...");
        updates.username_lc = data.username.toLowerCase();
      }

      // SELF-HEALING: If registeredAt is missing (Legacy users), fix it now.
      if (!data.registeredAt) {
        console.log("[DB] Healing missing registeredAt for legacy user...");
        let firstDateStr = "2026-04-05T00:00:00.000Z"; // Default launch day
        if (data.stats && data.stats.history) {
          const historyDates = Object.keys(data.stats.history).sort();
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
    // Instead of deleting the whole doc, just delete game data
    await deleteDoc(userRef);

    console.warn(`🔥 User Game Data Wiped for ${userId}`);
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
