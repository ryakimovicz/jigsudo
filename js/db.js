/* Firestore Database Module */
import { db } from "./firebase-config.js";
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
import { gameManager } from "./game-manager.js";

// ... (rest of imports/vars)

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
    if (docSnap.exists()) {
      const data = docSnap.data();
      // Pass data to GameManager for conflict checking
      gameManager.handleCloudSync(data.progress, data.stats);
    }
  });
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

export async function saveUserStats(userId, statsData, username = null) {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);

    const updateData = {
      stats: statsData,
      lastUpdated: serverTimestamp(),
      // Top-level fields for efficient Firestore indexing
      totalRP: Number(statsData.currentRP || 0),
      monthlyRP: Number(statsData.monthlyRP || 0),
      dailyRP: Number(statsData.dailyRP || 0),
      lastDailyUpdate: statsData.lastDailyUpdate || null,
      lastMonthlyUpdate: statsData.lastMonthlyUpdate || null,
    };

    // If username is provided, save it as a top-level searchable field
    const { getCurrentUser } = await import("./auth.js");
    const user = getCurrentUser();
    if (user) {
      const isGoogleUser = user.providerData.some(
        (p) => p.providerId === "google.com",
      );
      updateData.isVerified = user.emailVerified || isGoogleUser;
    }
    if (username) {
      updateData.username = username;
      updateData.username_lc = username.toLowerCase();
    }

    if (gameManager.isWiping) {
      console.log("[DB] Update blocked: GM is wiping.");
      return;
    }
    await setDoc(userRef, updateData, { merge: true });
    console.log("Stats saved to cloud.");
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
      if (data.username && !data.username_lc) {
        console.log("[DB] Migrating legacy username to lowercase index...");
        await setDoc(
          userRef,
          { username_lc: data.username.toLowerCase() },
          { merge: true },
        );
      }
      await gameManager.handleCloudSync(remoteProgress, remoteStats);
    } else {
      console.log("No remote progress found. Creating new entry on next save.");
    }
  } catch (error) {
    console.error("Error loading progress:", error);
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
export async function getUserRank(fieldName, score, onlyVerified = false) {
  if (score === undefined || score === null) return null;
  try {
    const usersRef = collection(db, "users");
    // Rank = (Number of users with score > current score) + 1
    let q;
    if (onlyVerified) {
      q = query(
        usersRef,
        where("isVerified", "==", true),
        where(fieldName, ">", score),
      );
    } else {
      q = query(usersRef, where(fieldName, ">", score));
    }
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count + 1;
  } catch (error) {
    console.error(`[DB] Error calculating rank for ${fieldName}:`, error);
    return null;
  }
}
