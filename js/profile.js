import { getCurrentUser, logoutUser } from "./auth.js";
import { getCurrentLang, updateTexts } from "./i18n.js";
import { translations } from "./translations.js";
import { gameManager } from "./game-manager.js";
import { getRankData, calculateRP } from "./ranks.js";
import { formatTime } from "./ui.js";
import { getJigsudoDate, formatJigsudoDate, getJigsudoDateString } from "./utils/time.js";
import { fetchPuzzleIndex } from "./history.js";
import { CONFIG } from "./config.js";

export let currentViewDate = getJigsudoDate();
let minNavMonth = null;
let maxNavMonth = null;
let activeProfileName = null;
let comparisonEnabled = false;

export function initProfile() {
  console.log("Profile Module Loaded");

  // Calendar Listeners
  const prevBtn = document.getElementById("cal-prev-btn");
  const nextBtn = document.getElementById("cal-next-btn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => changeMonth(-1));
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => changeMonth(1));
  }

  // Handle Initial Hash - handled by router.js
  // handleRouting(); // Removed
  // window.addEventListener("hashchange", handleRouting); // Removed

  // Listen for Language Changes to re-render Profile & Menu Stats (Rank, etc.)
  window.addEventListener("languageChanged", () => {
    updateProfileData(activeProfileName);
  });

  // Back Button
  const backBtn = document.getElementById("profile-back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // Go back in history (simulating native back), or force home if no history
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.hash = "";
      }
    });
  }

  // Logout Button handled in auth.js via onclick/modal overrides

  // Share Stats Button
  const shareBtn = document.getElementById("btn-share-stats");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => handleShareStats());
  }

  // Real-time Cloud Sync Listener: Refresh UI when stats update in background
  window.addEventListener("userStatsUpdated", () => {
    console.log("[Profile] Stats updated from cloud. Refreshing UI...");
    updateProfileData(activeProfileName);
  });

  window.addEventListener("authReady", () => {
    if (window.location.hash.startsWith("#profile")) {
      console.log("[Profile] Auth ready. Triggering UI update...");
      updateProfileData(activeProfileName);
    }
  });
}

// Routing handled by router.js

// Public method now just sets the hash
export function showProfile() {
  window.location.hash = "profile";
}

let verificationInterval = null;

// Listen for Router Changes to trigger polling/updates
window.addEventListener("routeChanged", async ({ detail }) => {
  if (detail.baseRoute === "#profile") {
    const { getCurrentUser } = await import("./auth.js");
    const user = getCurrentUser();
    const requestedUsername = detail.params?.[0];

    // v1.7.9: Smooth Pre-fetching for Foreign Profiles
    if (requestedUsername) {
      const decodedTarget = decodeURIComponent(requestedUsername).toLowerCase();
      const isOwn = user && user.displayName && user.displayName.toLowerCase() === decodedTarget;

      if (!isOwn) {
        console.log("[Profile] Pre-fetching data for:", decodedTarget);
        // Show a subtle loading indicator on the search results if possible
        const searchInput = document.getElementById("user-search-input");
        if (searchInput) searchInput.style.opacity = "0.5";

        // Fetch everything BEFORE showing UI
        await updateProfileData(requestedUsername);
        
        // Data is ready, now show the UI
        if (searchInput) searchInput.style.opacity = "1";
        _showProfileUI(requestedUsername, true); // skipInitialUpdate = true
        
        // Hide other sections now that we are ready
        document.querySelectorAll(".nav-section, .menu-content").forEach(el => {
            if (el.id !== "profile-section") el.classList.add("hidden");
        });
        
        return; // Done
      }
    }

    if (!requestedUsername && user && !user.isAnonymous && user.displayName) {
      // Auto-redirect to their own profile URL
      const encodedName = encodeURIComponent(user.displayName);
      history.replaceState(null, null, `/#profile/${encodedName}`);
    }

    _showProfileUI(requestedUsername); // Own profile is immediate
  } else {
    _hideProfileUI();
  }
});

// Router Handler (Removed)

// Internal UI Manipulation
function _showProfileUI(requestedUsername, skipInitialUpdate = false) {
  activeProfileName = requestedUsername;
  const section = document.getElementById("profile-section");
  const menu = document.getElementById("menu-content"); // Main Home Content
  // We might need to hide specific sections depending on what's active (home vs game)
  const gameSection = document.getElementById("game-section");
  // const appHeader = document.querySelector(".main-header"); // Corrected Selector

  if (section) section.classList.remove("hidden");
  document.body.classList.add("profile-active");
  document.body.classList.remove("home-active"); // Ensure mutually exclusive if needed

  // Try to refresh verification status if needed (Efficiently: only if not verified)
  const startPolling = async () => {
    if (verificationInterval) return;
    verificationInterval = setInterval(async () => {
      const { refreshUserStatus } = await import("./auth.js");
      const result = await refreshUserStatus();
      if (result.success && result.user && result.user.emailVerified) {
        clearInterval(verificationInterval);
        verificationInterval = null;
        updateProfileData(activeProfileName); // refresh to hide banner
      }
    }, 5000); // Check every 5s while profile is open
  };

  import("./auth.js").then((mod) => {
    const user = mod.getCurrentUser();
    if (user && !user.isAnonymous && !user.emailVerified) {
      startPolling();
    }
    // ensure sidebar syncs safely
    if (typeof mod.updateSidebarActiveState === "function") {
      mod.updateSidebarActiveState("btn-auth");
    }
  });

  // Hide everything else
  if (menu) menu.classList.add("hidden");
  if (gameSection) gameSection.classList.add("hidden");
  const historySection = document.getElementById("history-section");
  if (historySection) historySection.classList.add("hidden");
  document.getElementById("info-section")?.classList.add("hidden");
  // if (appHeader) appHeader.classList.add("hidden");

  // Show Footer on Profile
  const footer = document.querySelector(".main-footer");
  if (footer) footer.classList.remove("hidden");

  // Highlight Sidebar Button (Cuenta) handled by router.js

  if (!skipInitialUpdate) {
    updateProfileData(activeProfileName);
  }

  // Update Header Button to Close Icon
  const btnStats = document.getElementById("btn-stats");
  if (btnStats) btnStats.textContent = "✕"; // Close Cross
}

function _hideProfileUI() {
  activeProfileName = null;
  // Stop any active polling when leaving profile
  if (verificationInterval) {
    clearInterval(verificationInterval);
    verificationInterval = null;
  }
  const section = document.getElementById("profile-section");
  const menu = document.getElementById("menu-content");

  if (section) section.classList.add("hidden");
  document.body.classList.remove("profile-active");

  // ONLY restore home and class if we are actually going "home" (no hash)
  // REMOVED: Router handles this exclusively now.
  // if (!isInternalRouting) { ... }

  // REMOVED: Router handles this exclusively now.

  // Restore Header Button to Stats Icon
  const btnStats = document.getElementById("btn-stats");
  if (btnStats) btnStats.textContent = "📊";
}

export async function updateProfileData(targetUsername = activeProfileName) {
  const { getCurrentUser } = await import("./auth.js");
  const user = getCurrentUser();
  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];

  const decodedTarget = targetUsername
    ? decodeURIComponent(targetUsername).toLowerCase()
    : null;
  const isOwnProfile =
    !decodedTarget ||
    (user &&
      user.displayName &&
      user.displayName.toLowerCase() === decodedTarget);

  // If sync is in progress, show it on the share button if exists
  const shareBtn = document.getElementById("btn-share-stats");
  if (shareBtn) {
    if (
      gameManager.isWiping ||
      document.body.classList.contains("syncing-account")
    ) {
      const lang = getCurrentLang() || "es";
      shareBtn.textContent =
        translations[lang]?.btn_syncing || "(Sincronizando...)";
      shareBtn.disabled = true;
    } else {
      const lang = getCurrentLang() || "es";
      shareBtn.textContent =
        translations[lang]?.btn_share_stats || "Compartir Estadísticas";
      shareBtn.disabled = false;
    }

    // Completely hide share button for foreign profiles as requested
    if (!isOwnProfile) {
      shareBtn.style.display = "none";
    } else {
      shareBtn.style.display = "";
    }
  }

  const avatarEl = document.getElementById("profile-avatar");
  const nameEl = document.getElementById("profile-username");
  const emailEl = document.getElementById("profile-email");

  if (!isOwnProfile) {
    // FOREIGN PUBLIC PROFILE
    // v1.7.9: Only CLEAR if it's a NEW target (prevents flicker on language change)
    const currentName = nameEl?.textContent || "";
    if (currentName.toLowerCase() !== decodedTarget.toLowerCase()) {
        renderProfileStats(null);
    }
    
    if (nameEl) nameEl.textContent = decodedTarget;
    if (avatarEl) {
      avatarEl.textContent = decodedTarget.charAt(0).toUpperCase();
      avatarEl.style.backgroundColor = "";
    }

    // Fetch public stats from DB
    try {
      const { getPublicUserByUsername } = await import("./db.js");
      const publicData = await getPublicUserByUsername(decodedTarget);

      if (publicData) {
        if (publicData.isPrivate) {
          // PRIVATE PROFILE
          if (emailEl) {
            emailEl.textContent =
              t.profile_private_msg || "Este perfil es privado";
            emailEl.style.color = "var(--text-muted)";
          }
          renderProfileStats(null); // Hide/Clear stats
        } else {
          // PUBLIC PROFILE - Proceed to render
          // v1.7.5: Fetch history for public profiles to show calendar
          const { getPublicUserHistory } = await import("./db.js");
          const publicHistory = await getPublicUserHistory(publicData.uid);
          
          // Merge history into the data object
          const fullPublicData = {
             ...publicData,
             history: publicHistory
          };

          const ownHistory = gameManager.stats?.history || null;
          renderProfileStats(fullPublicData, false);
          renderCalendar(publicHistory, ownHistory, publicData.username);

          // v1.7.6: Enable Comparison Mode
          comparisonEnabled = true;
          attachComparisonListeners(fullPublicData);

          // v1.7.9: FORCE Sidebar Cleanliness (Ensure "Account" is NOT marked)
          const authBtn = document.getElementById("btn-auth");
          if (authBtn) authBtn.classList.remove("active");

          // Fix Email missing label visually
          if (emailEl) {
            emailEl.textContent = publicData.isVerified
              ? "Usuario Verificado"
              : "Perfil Público";
            emailEl.style.color = publicData.isVerified
              ? "var(--accent-color)"
              : "var(--text-muted)";
          }

          // v1.7.9: Final Cleanup for Deferred Navigation
          const sectionsToHide = ["menu-content", "search-users-section", "history-section", "guide-section", "changelog-section"];
          sectionsToHide.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add("hidden");
          });
          
          const profileSec = document.getElementById("profile-section");
          if (profileSec) profileSec.classList.remove("hidden");
        }
      } else {
        if (nameEl)
          nameEl.textContent = t.user_not_found || "Usuario no encontrado";
        if (emailEl) emailEl.textContent = "";
        renderProfileStats(null); // Clear stats
      }
    } catch (e) {
      console.error("Error loading public profile:", e);
      if (emailEl) emailEl.textContent = "Error al cargar perfil";
      renderProfileStats(null);
    }
  } else if (user && !user.isAnonymous) {
    // OWN LOGGED-IN PROFILE
    let displayName = user.displayName || t.user_default || "Usuario";
    // Sanitize if it contains server error message
    if (displayName.includes("Cannot GET")) displayName = t.user_default || "Usuario";
    const initial = displayName.charAt(0).toUpperCase();

    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = user.email;
    if (avatarEl) {
      avatarEl.textContent = initial;
      avatarEl.style.backgroundColor = ""; // Reset
    }

    // Dynamic URL Replacement: Force /#profile/username (lowercase)
    const expectedHash = `#profile/${displayName.toLowerCase()}`;
    if (window.location.hash.startsWith("#profile") && window.location.hash !== expectedHash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search + expectedHash,
      );
    }
  } else {
    // GUEST (Anonymous)
    const lang = getCurrentLang() || "es";
    const t = translations[lang] || translations["es"];

    if (nameEl) nameEl.textContent = t.guest || "Anónimo";
    if (emailEl) emailEl.textContent = t.auth_no_account || "Sin cuenta";

    // Guest Avatar
    if (avatarEl) {
      avatarEl.textContent = (t.guest || "Anónimo").charAt(0).toUpperCase();
      avatarEl.style.backgroundColor = "#94a3b8";
    }
  }

  // --- Visibility & Actions Management ---
  const profileActions = document.querySelector(".profile-actions");
  const guestActions = document.querySelector(".guest-actions");
  const isLoggedIn = user && !user.isAnonymous;
  const isGoogleUser = user?.providerData?.some((p) => p.providerId === "google.com");

  // Main containers
  if (profileActions) {
    // Only show profile settings if it's our own profile and we're logged in
    profileActions.classList.toggle("hidden", !isOwnProfile || !isLoggedIn);
  }
  if (guestActions) {
    // Only show guest login nag if it's our own profile and we're NOT logged in
    guestActions.classList.toggle("hidden", !isOwnProfile || isLoggedIn);
  }

  // Individual buttons within profileActions (managed if profileActions is shown)
  const sensitiveButtons = {
    "btn-profile-change-name": true, // Always show if own/logged-in
    "btn-profile-change-pw": !isGoogleUser, // Password change not for Google users
    "btn-profile-change-email": !isGoogleUser, // Email change not for Google users
    "btn-profile-logout": true,
    "btn-profile-delete": true,
  };

  Object.entries(sensitiveButtons).forEach(([id, shouldShow]) => {
    const btn = document.getElementById(id);
    if (btn) {
      // Button hidden if logged out OR foreign profile OR specifically excluded (e.g. Google)
      const forceHide = !isOwnProfile || !isLoggedIn || !shouldShow;
      btn.classList.toggle("hidden", forceHide);
    }
  });

  // Email Verification Banner Logic
  const verificationBanner = document.getElementById("profile-verification-banner");
  if (verificationBanner) {
    const isEmailUser = user && !user.isAnonymous && !isGoogleUser;
    const showBanner = isEmailUser && !user.emailVerified && isOwnProfile;
    verificationBanner.classList.toggle("hidden", !showBanner);

      const resendBtn = document.getElementById("btn-resend-verification");
      if (resendBtn && !resendBtn.dataset.listenerAttached) {
        resendBtn.onclick = async () => {
          const { resendVerification } = await import("./auth.js");
          const { showToast } = await import("./ui.js");
          const lang = getCurrentLang() || "es";
          const t = translations[lang] || translations["es"];

          resendBtn.disabled = true;
          const originalText = resendBtn.textContent;
          resendBtn.textContent = "...";

          const result = await resendVerification();

          resendBtn.disabled = false;
          resendBtn.textContent = originalText;

          if (result.success) {
            showToast(t.toast_verification_sent, 4000, "success");
          } else if (result.errorCode === "auth/too-many-requests") {
            showToast(t.toast_verification_too_many, 5000, "error");
          } else {
            showToast("Error: " + result.error, 4000, "error");
          }
        };
        resendBtn.dataset.listenerAttached = "true";
    }
  }

  // Stats logic delegated to renderProfileStats
  if (isOwnProfile) {
    const statsStr = localStorage.getItem("jigsudo_user_stats");
    const localStats = statsStr ? JSON.parse(statsStr) : null;

    // Fetch bounds once to set navigation limits
    if (!minNavMonth) {
      try {
        const availableDates = await fetchPuzzleIndex();
        if (availableDates.length > 0) {
          const sorted = availableDates.map((d) => new Date(d)).sort((a, b) => a - b);
          const first = sorted[0];
          const last = sorted[sorted.length - 1];
          minNavMonth = new Date(first.getFullYear(), first.getMonth(), 1);
          maxNavMonth = new Date(last.getFullYear(), last.getMonth(), 1);

          // Update current view if out of bounds
          if (currentViewDate < minNavMonth)
            currentViewDate = new Date(minNavMonth);
          if (currentViewDate > maxNavMonth)
            currentViewDate = new Date(maxNavMonth);
        }
      } catch (e) {
        console.warn("[Profile] Could not load navigation limits:", e);
      }
    }

    // Render own stats from GameManager source of truth to avoid wipe limbo
    renderProfileStats(gameManager.stats || localStats, true);
    
    // Use GameManager stats if available (more fresh), otherwise localStats
    renderCalendar((gameManager.stats || localStats)?.history || {}, null, null);
    comparisonEnabled = false; 
    document.querySelectorAll("#profile-section [style*='cursor: help']").forEach(el => el.style.cursor = "default");
  }
}

function renderProfileStats(stats, isOwn = true) {
  const statsContainers = document.querySelectorAll(
    "#profile-section .section-title, #profile-section .stats-grid, #profile-section .calendar-heatmap, #profile-section .daily-time-report, #profile-section .profile-share-actions, #profile-section .rank-display",
  );

  if (!stats) {
    // HIDE ALL STATS UI
    statsContainers.forEach((el) => el.classList.add("hidden"));
    return;
  }

  // SHOW ALL STATS UI
  statsContainers.forEach((el) => {
      if (CONFIG.isDemo && el.classList.contains("rank-display")) {
          el.classList.add("hidden");
          return;
      }
      el.classList.remove("hidden");
  });

  // v1.4.5: Robust Hybrid Detection. Root fields (v7.1) vs Inner Map (Legacy/Partial)
  // We prefer the values at the root if available, otherwise look into the 'stats' map.
  const s = stats;
  const i = stats.stats || {}; // Inner map if exists
  
  // 1. Basic Stats (Prefer inner map for competitive, root for identity)
  if (document.getElementById("stat-played"))
    document.getElementById("stat-played").textContent = i.totalPlayed || s.totalPlayed || 0;
  if (document.getElementById("stat-streak"))
    document.getElementById("stat-streak").textContent = i.currentStreak || s.currentStreak || 0;
  if (document.getElementById("stat-max-streak"))
    document.getElementById("stat-max-streak").textContent = i.maxStreak || s.maxStreak || 0;

  // 2. Aggregate History Stats
  let maxScore = 0;
  let bestTime = Infinity;
  let totalTime = 0;
  let wonCount = 0;

  // Stage Accumulators
  const stageSums = {
    memory: 0,
    jigsaw: 0,
    sudoku: 0,
    peaks: 0,
    search: 0,
    code: 0,
  };
  const stageCounts = {
    memory: 0,
    jigsaw: 0,
    sudoku: 0,
    peaks: 0,
    search: 0,
    code: 0,
  };
  let totalPeaksErrors = 0;
  let peaksErrorCount = 0;

  // Optimized Cache Strategy (v1.3.0)
  // We now use the Server-calculated aggregates for O(1) performance.
  bestTime = i.bestTime || s.bestTime || Infinity;
  totalTime = i.totalTimeAccumulated || s.totalTimeAccumulated || 0;
  wonCount = i.wins || s.wins || 0;
  totalPeaksErrors = i.totalPeaksErrorsAccumulated || s.totalPeaksErrorsAccumulated || 0;
  peaksErrorCount = i.wins || s.wins || 0;
  maxScore = i.bestScore || s.bestScore || 0;

  const st = i.stageTimesAccumulated || s.stageTimesAccumulated;
  const sw = i.stageWinsAccumulated || s.stageWinsAccumulated;
  
  if (st) {
    for (const [stage, time] of Object.entries(st)) {
      if (stageSums[stage] !== undefined) {
        stageSums[stage] = time;
        stageCounts[stage] = sw?.[stage] || 0;
      }
    }
  }

  const fmtTime = (ms) => formatTime(ms);

  // Helper for consistent localized numbers (e.g. 9,50 in AR vs 9.50 in US)
  const fmtNumber = (num, decimals = 2) => {
    if (num === undefined || num === null) return "0";
    // Sync with Game Language (es -> es-ES, en -> en-US)
    const lang = getCurrentLang() || "es";
    return num.toLocaleString(lang, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  console.log("[Profile] Stage Sums:", stageSums);
  console.log("[Profile] Stage Counts:", stageCounts);

  // Set Values
  if (document.getElementById("stat-max-score")) {
    const bScore = stats.bestScore;
    document.getElementById("stat-max-score").textContent =
      bScore !== undefined && bScore > 0
        ? fmtNumber(bScore, 2)
        : fmtNumber(calculateRP(maxScore), 2);
  }

  if (document.getElementById("stat-best-time"))
    document.getElementById("stat-best-time").textContent =
      wonCount > 0 && bestTime !== Infinity && bestTime !== null
        ? fmtTime(bestTime)
        : "--:--";

  if (document.getElementById("stat-avg-time"))
    document.getElementById("stat-avg-time").textContent =
      wonCount > 0 ? fmtTime(totalTime / wonCount) : "--:--";

  // Stage Averages
  if (document.getElementById("stat-avg-memory"))
    document.getElementById("stat-avg-memory").innerHTML = stageCounts.memory
      ? fmtTime(stageSums.memory / stageCounts.memory)
      : "--:--";
  if (document.getElementById("stat-avg-jigsaw"))
    document.getElementById("stat-avg-jigsaw").innerHTML = stageCounts.jigsaw
      ? fmtTime(stageSums.jigsaw / stageCounts.jigsaw)
      : "--:--";
  if (document.getElementById("stat-avg-sudoku"))
    document.getElementById("stat-avg-sudoku").innerHTML = stageCounts.sudoku
      ? fmtTime(stageSums.sudoku / stageCounts.sudoku)
      : "--:--";
  if (document.getElementById("stat-avg-search"))
    document.getElementById("stat-avg-search").innerHTML = stageCounts.search
      ? fmtTime(stageSums.search / stageCounts.search)
      : "--:--";
  if (document.getElementById("stat-avg-code"))
    document.getElementById("stat-avg-code").innerHTML = stageCounts.code
      ? fmtTime(stageSums.code / stageCounts.code)
      : "--:--";

  if (document.getElementById("stat-avg-peaks")) {
    const avgPeaksTime = stageCounts.peaks
      ? fmtTime(stageSums.peaks / stageCounts.peaks)
      : "--:--";
    const avgPeaksErr = peaksErrorCount
      ? (totalPeaksErrors / peaksErrorCount).toFixed(1)
      : "0";
    document.getElementById("stat-avg-peaks").innerHTML = `<strong>${avgPeaksTime}</strong>`;
    if (document.getElementById("stat-avg-peaks-err"))
      document.getElementById("stat-avg-peaks-err").textContent =
        `(${avgPeaksErr} err)`;
  }

  // Rank UI (v1.5.30: Unified TotalRP Source of Truth)
  const currentRP = s.totalRP || 0;
  const rankData = getRankData(currentRP);

  const rankIconEl = document.getElementById("profile-rank-icon");
  const rankNameEl = document.getElementById("profile-rank-name");
  const rankLevelEl = document.getElementById("profile-rank-level");
  const progressFill = document.getElementById("profile-rank-progress");
  const rpCurrentEl = document.getElementById("profile-rp-current");
  const rpNextEl = document.getElementById("profile-rp-next");

  if (rankIconEl) rankIconEl.textContent = rankData.rank.icon;
  if (rankNameEl) {
    let lang = getCurrentLang() || "es";
    // Safety: Ensure we use 'es' if 'es-ES' is passed and not found
    if (!translations[lang]) lang = lang.split("-")[0];

    // Safety: Ensure we use 'es' if 'es-ES' is passed and not found
    if (!translations[lang]) lang = lang.split("-")[0];

    if (translations[lang] && translations[lang][rankData.rank.nameKey]) {
      rankNameEl.textContent = translations[lang][rankData.rank.nameKey];
    } else {
      rankNameEl.textContent = rankData.rank.nameKey;
    }
  }

  if (rankLevelEl) {
    const lang = getCurrentLang() || "es";
    const prefix = translations[lang]?.rank_level_prefix || "Nvl.";
    rankLevelEl.textContent = `${prefix} ${rankData.level}`;
  }

  if (progressFill) progressFill.style.width = `${rankData.progress}%`;
  if (rpCurrentEl) rpCurrentEl.textContent = fmtNumber(currentRP, 2);
  if (rpNextEl) {
    const nextGoal = rankData.nextRank ? rankData.nextRank.minRP : "MAX";
    rpNextEl.textContent =
      typeof nextGoal === "number" ? fmtNumber(nextGoal, 0) : nextGoal;
  }

  const careerRpEl = document.getElementById("profile-career-rp");
  if (careerRpEl) {
    careerRpEl.textContent = fmtNumber(s.careerRP || 0, 2);
  }

  // --- Dynamic Stats for Account Dropdown Menu (Quick Stats) ---
  // v1.7.5: ONLY update sidebar elements if viewing OWN profile
  if (isOwn) {
    const mRankIcon = document.getElementById("menu-rank-icon");
    const mRankName = document.getElementById("menu-rank-name");
    const mRankLevel = document.getElementById("menu-rank-level");
    const mRpCurrent = document.getElementById("menu-rp-current");
    const mRpNext = document.getElementById("menu-rp-next");
    const mRpProgress = document.getElementById("menu-rp-progress");
    const mStreak = document.getElementById("menu-stat-streak");
    const mDailyPoints = document.getElementById("menu-stat-daily");

    if (mRankIcon) mRankIcon.textContent = rankData.rank.icon;
    if (mRankName) {
      let lang = getCurrentLang() || "es";
      if (!translations[lang]) lang = lang.split("-")[0];
      const nameKey = rankData.rank.nameKey;
      mRankName.textContent = translations[lang]?.[nameKey] || nameKey;
    }
    if (mRankLevel) {
      const lang = getCurrentLang() || "es";
      const prefix = translations[lang]?.rank_level_prefix || "Nvl.";
      mRankLevel.textContent = `${prefix} ${rankData.level}`;
    }
    if (mRpCurrent) mRpCurrent.textContent = fmtNumber(currentRP, 2);
    if (mRpNext) {
      const nextGoal = rankData.nextRank ? rankData.nextRank.minRP : "MAX";
      mRpNext.textContent =
        typeof nextGoal === "number" ? fmtNumber(nextGoal, 0) : nextGoal;
    }
    if (mRpProgress) mRpProgress.style.width = `${rankData.progress}%`;
    if (mStreak) mStreak.textContent = s.currentStreak || i.currentStreak || 0;
    if (mDailyPoints) mDailyPoints.textContent = fmtNumber(s.dailyRP || i.dailyRP || 0, 2);
  }

  // 3. Render Calendar
  // Handled by updateProfileData to ensure history is ready

  // 4. Render Weekday Stats
  try {
    renderWeekdayStats(stats);
  } catch (e) {
    console.error("Weekday Stats Render Error:", e);
  }

  // 5. Force UI Text Update (for static translations like Buttons/Headers)
  updateTexts();
}

function renderWeekdayStats(stats) {
  const container = document.getElementById("daily-time-chart");
  if (!container) return;

  container.innerHTML = "";

  const history = stats.history || {};
  // v1.7.6: Support nested stats for foreign profiles
  const i = stats.stats || {};
  const cache = i.weekdayStatsAccumulated || stats.weekdayStatsAccumulated;

  // Dynamic Day Labels based on Locale
  const lang = getCurrentLang() || "es";
  // Generate [Mon, Tue, ...] letters
  // Start from Sunday? Existing logic assumes 0=Sun (Date.getDay)
  // Let's generate standard week starting Sunday?
  // We need 7 days starting from a known Sunday.
  // Jan 5 2025 is a Sunday.
  const formatter = new Intl.DateTimeFormat(lang, { weekday: "narrow" });

  let days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2025, 0, 5 + i); // Sun, Mon...
    const label = formatter.format(d).toUpperCase();
    days.push({ label, sum: 0, count: 0, sumErrors: 0, sumScore: 0 });
  }

  let hasData = false;

  if (cache) {
    // Use Optimization Cache
    for (let i = 0; i < 7; i++) {
      if (cache[i] && cache[i].count > 0) {
        days[i].sum = cache[i].sumTime;
        days[i].sumErrors = cache[i].sumErrors;
        days[i].sumScore = cache[i].sumScore;
        days[i].count = cache[i].count;
        hasData = true;
      }
    }
  } else {
    // Fallback to History Iteration
    Object.entries(history).forEach(([dateStr, data]) => {
      // Changed to >= 0 to include debug/instant wins
      if (data.status === "won" && data.totalTime >= 0 && data.originalWin) {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          const [y, m, d] = parts.map(Number);
          const date = new Date(y, m - 1, d);
          const dayIdx = date.getDay(); // 0-6

          if (!isNaN(dayIdx)) {
            days[dayIdx].sum += data.totalTime;
            const errors = (data.original && data.original.errors) || data.errors || data.peaksErrors || 0;
            days[dayIdx].sumErrors += errors;
            days[dayIdx].sumScore += data.score || 0;
            days[dayIdx].count++;
            hasData = true;
          }
        }
      }
    });
  }

  if (!hasData) {
    const lang = getCurrentLang() || "es";
    const msg = translations[lang]?.no_data || "Sin datos suficientes";
    container.innerHTML = `<div style="color: #888; padding: 20px; text-align: center; grid-column: 1/-1;">${msg}</div>`;
    return;
  }

  // Render Cards
  // Generate Day Names dynamically (Sunday...Saturday)
  const formatterLong = new Intl.DateTimeFormat(lang, { weekday: "long" });
  const dayNames = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2025, 0, 5 + i); // Sun...Sat
    let name = formatterLong.format(d);
    name = name.charAt(0).toUpperCase() + name.slice(1);
    dayNames.push(name);
  }

  days.forEach((d, i) => {
    const card = document.createElement("div");
    card.className = "daily-stat-card";

    // 1. Title (Day Name)
    const lbl = document.createElement("div");
    lbl.className = "daily-stat-label";
    lbl.textContent = dayNames[i];
    card.appendChild(lbl);

    // 2. Metrics Grid (3 Cols)
    const metricsGrid = document.createElement("div");
    metricsGrid.className = "daily-metrics-grid";

    // A. Time
    const avgTime = d.count > 0 ? d.sum / d.count : 0;
    let timeStr = formatTime(avgTime);
    const timeCol = createMetricCol("⏱️", timeStr, translations[lang]?.stat_avg_time || "Tiempo Promedio");

    // B. Errors
    const avgErrors = d.count > 0 ? d.sumErrors / d.count : 0;
    const errorStr = d.count > 0 ? avgErrors.toFixed(1) : "--";
    const errorCol = createMetricCol("❌", errorStr, translations[lang]?.stat_avg_errors || "Errores Promedio");

    // C. Score
    // Calculate raw avg first, then convert to RP scale? Or convert each?
    // Conversion is linear, so avg(RP) == convert(avg(Score))
    const avgScoreRaw = d.count > 0 ? d.sumScore / d.count : 0;
    const avgScoreRP = d.count > 0 ? calculateRP(avgScoreRaw).toFixed(2) : "--";
    const scoreCol = createMetricCol("⭐", avgScoreRP, translations[lang]?.stat_avg_score || "Puntaje Promedio");

    metricsGrid.appendChild(scoreCol);
    metricsGrid.appendChild(timeCol);
    metricsGrid.appendChild(errorCol);

    card.appendChild(metricsGrid);
    container.appendChild(card);
  });
}

function createMetricCol(icon, value, title) {
  const el = document.createElement("div");
  el.className = "metric-col";
  el.title = title;
  el.innerHTML = `
        <span class="metric-icon">${icon}</span>
        <span class="metric-val">${value}</span>
    `;
  return el;
}

function updateNavButtonsState() {
  const prevBtn = document.getElementById("cal-prev-btn");
  const nextBtn = document.getElementById("cal-next-btn");
  if (!prevBtn || !nextBtn) return;

  const year = currentViewDate.getFullYear();
  const month = currentViewDate.getMonth();

  // Min limit: First month with puzzles
  const isMinMonth = minNavMonth && (year === minNavMonth.getFullYear() && month === minNavMonth.getMonth());
  prevBtn.classList.toggle("disabled", !!isMinMonth);

  // Max limit: Last month with puzzles
  const isMaxMonth = maxNavMonth && (year === maxNavMonth.getFullYear() && month === maxNavMonth.getMonth());
  nextBtn.classList.toggle("disabled", !!isMaxMonth);
}

function changeMonth(delta) {
  const target = new Date(
    currentViewDate.getFullYear(),
    currentViewDate.getMonth() + delta,
    1,
  );
  
  // NAVIGATION LIMITS
  if (delta === -1 && minNavMonth && target < minNavMonth) {
    return; // Block past
  }
  if (delta === 1 && maxNavMonth && target > maxNavMonth) {
    return; // Block future
  }

  currentViewDate = target;
  updateNavButtonsState();
  updateProfileData(activeProfileName);
}

function renderCalendar(history = {}, ownHistory = null, fName = "Ellos") {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("cal-month-label");
  if (!grid) {
    console.error("Calendar Grid Element NOT FOUND");
    return;
  }

  // Ensure we are not stacking
  while (grid.firstChild) {
    grid.removeChild(grid.firstChild);
  }

  // Fallback dates
  if (!currentViewDate || isNaN(currentViewDate.getTime())) {
    console.warn("Recovering currentViewDate");
    currentViewDate = new Date();
  }

  console.log(
    "Rendering Calendar ->",
    currentViewDate.toLocaleDateString(),
    "History Keys:",
    history ? Object.keys(history).length : 0,
  );

  try {
    // Validate Date
    if (isNaN(currentViewDate.getTime())) {
      console.error("Invalid View Date, resetting");
      currentViewDate = new Date();
    }

    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();

    // Update Label (Safe Locale)
    let locale = "es-ES";
    try {
      locale = getCurrentLang() || "es-ES";
    } catch (e) {
      console.warn("Locale fetch failed", e);
    }

    let monthName = "Mes";
    try {
      monthName = new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(currentViewDate);
    } catch (err) {
      monthName = currentViewDate.toDateString(); // Extreme fallback
    }

    // Days in Month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    if (label) {
      label.textContent =
        monthName.charAt(0).toUpperCase() + monthName.slice(1);
    }

    // Headers (D L M X J V S)
    const headers = [];
    const isEnglish = locale.startsWith("en");
    // EN: "short" -> "Sun", "Mon" -> Slice(0,2) -> "Su", "Mo"
    // ES: "narrow" -> "D", "L", "M"
    const formatterHeaders = new Intl.DateTimeFormat(locale, {
      weekday: isEnglish ? "short" : "narrow",
    });

    for (let i = 0; i < 7; i++) {
      // Start from Sunday (Jan 5 2025)
      const d = new Date(2025, 0, 5 + i);
      let dayName = formatterHeaders.format(d).toUpperCase();
      if (isEnglish) dayName = dayName.slice(0, 2);
      headers.push(dayName);
    }

    headers.forEach((h) => {
      const el = document.createElement("div");
      el.className = "calendar-day header-day";
      el.innerText = h; // Use innerText to ensuring rendering
      grid.appendChild(el);
    });

    // Padding Days
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement("div");
      empty.className = "calendar-day empty";
      grid.appendChild(empty);
    }

    // Today for limit (using UTC methods)
    const now = getJigsudoDate();
    const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

    // Real Days
    for (let d = 1; d <= daysInMonth; d++) {
      const dayEl = document.createElement("div");
      dayEl.className = "calendar-day";
      dayEl.textContent = d;

      // Check Status
      // Format YYYY-MM-DD
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayData = history[dateStr];
      const isCompleted = dayData?.status === "won";
      const isToday = dateStr === todayStr;

      if (isToday && !isCompleted) {
        // v1.9.5: Look "dimmed/off" because it is unclickable, but show color if played
        dayEl.style.opacity = "0.6"; 
        dayEl.style.filter = "saturate(0.6)";
        dayEl.style.cursor = "default";
      }
      
      if (dayData) {
        // Rules: Green if won on day 1, Yellow if started on day 1 but not won.
        if (dayData.original && dayData.original.won === true) {
          dayEl.classList.add("win");
        } else if (dayData.original && dayData.original.won !== true) {
          dayEl.classList.add("loss");
        }
      }

      // v1.5.62: Attach dynamic tooltips
      import("./history.js").then(mod => {
          const ownDayData = ownHistory ? ownHistory[dateStr] : null;
          mod.attachCalendarTooltip(dayEl, dayData, dateStr, ownDayData, fName);
      });

      grid.appendChild(dayEl);
    }
    
    updateNavButtonsState();
  } catch (e) {
    console.error("Calendar Error:", e);
    grid.innerHTML =
      "<div style='color:red; grid-column: 1/-1;'>Error cargando calendario</div>";
  }
}

async function handleShareStats() {
  const card = document.getElementById("stats-social-card");
  if (!card) return;

  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];

  // html2canvas is loaded via CDN in index.html, it should be global
  if (typeof html2canvas === "undefined") {
    console.error("html2canvas not loaded");
    const { showToast } = await import("./ui.js");
    showToast(t.err_html2canvas || "Error: html2canvas no está cargado ❌");
    return;
  }

  try {
    const { showToast } = await import("./ui.js");
    showToast(t.toast_generating_image || "Generando imagen... ⏳", 2000);

    // Ensure everything is translated for the card (in case it was hidden)
    updateTexts();

    const user = getCurrentUser();

    // Determine Share URL (Direct profile if public)
    let shareUrl = "https://jigsudo.com";
    if (user && !user.isAnonymous) {
      try {
        const { fetchLatestUserData } = await import("./db.js");
        const userData = await fetchLatestUserData(user.uid);
        if (userData && userData.isPublic !== false && userData.username) {
          const encodedName = encodeURIComponent(userData.username);
          shareUrl = `https://jigsudo.com/#profile/${encodedName}`;
        }
      } catch (e) {
        console.warn("[Profile] Failed to fetch privacy for share link:", e);
      }
    }

    // 1. Populate Header & Basic Stats
    const logoContainer = document.getElementById("sc-logo-container");
    const usernameEl = document.getElementById("sc-username");
    const rankEl = document.getElementById("sc-rank");
    const dateEl = document.getElementById("sc-date");
    const playedEl = document.getElementById("sc-stat-played");
    const rpEl = document.getElementById("sc-stat-rp");
    const streakEl = document.getElementById("sc-stat-streak");

    // Handle Logo Injection (Inlined for reliability)
    if (logoContainer) {
      const isDarkMode = document.body.classList.contains("dark-mode");
      const svgLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="216.831" y="128.255">1</text><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="166.576" y1="-1.106" x2="166.718" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="333.588" y1="-1.106" x2="333.436" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="0" y1="167.339" x2="500.154" y2="166.718"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="0" y1="333.479" x2="500.154" y2="333.436"/><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="49.191" y="125.381">J</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="381.02" y="125.859">6</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="31.317" y="302.394">5</text><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="204.759" y="302.394">U</text><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="198.205" y="479.26">D</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="381.95" y="479.26">0</text></svg>`;
      const svgDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="216.831" y="128.255">1</text><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="166.576" y1="-1.106" x2="166.718" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="333.588" y1="-1.106" x2="333.436" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="0" y1="167.339" x2="500.154" y2="166.718"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="0" y1="333.479" x2="500.154" y2="333.436"/><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="49.191" y="125.381">J</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="381.02" y="125.859">6</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="31.317" y="302.394">5</text><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="204.759" y="302.394">U</text><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="198.205" y="479.26">D</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="381.95" y="479.26">0</text></svg>`;
      logoContainer.innerHTML = isDarkMode ? svgDark : svgLight;
    }

    if (usernameEl)
      usernameEl.textContent = user
        ? user.displayName || t.user_default || "Usuario"
        : t.guest || "Invitado";

    const statsStr = localStorage.getItem("jigsudo_user_stats");
    const stats = statsStr
      ? JSON.parse(statsStr)
      : { history: {}, totalPlayed: 0, currentStreak: 0, currentRP: 0 };

    // RECALCULATE averages usingaggregates (v1.3.0)
    const stageSums = stats.stageTimesAccumulated || {};
    const stageCounts = stats.stageWinsAccumulated || {};
    
    stats.avgTimesPerStage = {};
    for (const s in stageSums) {
      stats.avgTimesPerStage[s] = {
        sumTime: stageSums[s],
        count: stageCounts[s] || 0,
      };
    }
    
    if (stats.avgTimesPerStage.peaks) {
      stats.avgTimesPerStage.peaks.sumErrors = stats.totalPeaksErrorsAccumulated || 0;
    }

    if (rankEl) {
      const rankData = getRankData(stats.currentRP || 0);
      const rankKey = rankData.rank.nameKey;
      rankEl.textContent = t[rankKey] || rankKey;
    }

    if (dateEl) {
      const locale = t.date_locale || "es-ES";
      dateEl.textContent = formatJigsudoDate(locale);
    }

    if (playedEl) playedEl.textContent = stats.totalPlayed || 0;
    if (rpEl) {
      const rpFormat = new Intl.NumberFormat(
        lang === "es" ? "es-ES" : "en-US",
        {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        },
      );
      rpEl.textContent = rpFormat.format(stats.currentRP || 0);
    }
    if (streakEl) streakEl.textContent = stats.currentStreak || 0;

    // Set Global Average Time (calculated from history)
    const avgTimeEl = document.getElementById("sc-stat-avg-time-all");
    if (avgTimeEl) {
      let totalTime = 0;
      let wonCount = 0;
      if (stats.history) {
        Object.values(stats.history).forEach((h) => {
          if (h.status === "won" && h.totalTime > 0) {
            totalTime += h.totalTime;
            wonCount++;
          }
        });
      }
      avgTimeEl.textContent =
        wonCount > 0 ? formatTime(totalTime / wonCount) : "--:--";
    }

    // 2. Populate Stage Times (Average) - REDESIGNED as Cards
    const stageList = document.getElementById("sc-stage-list");
    if (stageList) {
      stageList.innerHTML = "";
      const lang = getCurrentLang() || "es";

      const stages = [
        { id: "p_game_memory", key: "memory" },
        { id: "p_game_jigsaw", key: "jigsaw" },
        { id: "p_game_sudoku", key: "sudoku" },
        { id: "p_game_peaks", key: "peaks" },
        { id: "p_game_search", key: "search" },
        { id: "p_game_code", key: "code" },
      ];

      stages.forEach((st) => {
        const d = stats.avgTimesPerStage && stats.avgTimesPerStage[st.key];
        const label = translations[lang][st.id] || st.id;
        const card = document.createElement("div");
        card.className = "sc-stage-item";

        let statsHtml = "";
        if (d && d.count > 0) {
          const avgTime = d.sumTime / d.count;
          statsHtml = `
            <div class="sc-mini-stat">
              <span class="sc-mini-icon">⏱️</span>
              <span class="sc-mini-val">${formatTime(avgTime)}</span>
            </div>
          `;
          // Add Errors for Picos y Valles
          if (st.key === "peaks") {
            const avgErrors =
              d.sumErrors !== undefined ? d.sumErrors / d.count : 0;
            statsHtml += `
              <div class="sc-mini-stat">
                <span class="sc-mini-icon">❌</span>
                <span class="sc-mini-val">${avgErrors.toFixed(1)}</span>
              </div>
            `;
          }
        } else {
          statsHtml = `<span class="sc-mini-val">--:--</span>`;
        }

        card.innerHTML = `
          <span class="sc-item-label">${label}</span>
          <div class="sc-item-stats">${statsHtml}</div>
        `;
        stageList.appendChild(card);
      });
    }

    // 3. Populate Weekday Stats Chart - REDESIGNED as Cards
    renderSocialWeekdayStats(stats);

    // 4. Capture
    // Increased delay to 500ms to ensure all assets (logos) and layouts settle
    await new Promise((r) => setTimeout(r, 500));

    // TEMPORARILY FORCE DISPLAY (JUST IN CASE CSS IS BLOCKED OR OVERRIDDEN)
    card.style.display = "flex";

    const canvas = await window.html2canvas(card, {
      backgroundColor:
        getComputedStyle(document.body).getPropertyValue("--bg-paper") ||
        "#f8fafc",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: 1080,
    });

    card.style.display = ""; // REVERT

    // 6. Share or Download
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const dateStr = getJigsudoDateString();
      const fallbackName = user
        ? t.user_default || "Usuario"
        : t.guest || "Invitado";
      const nameClean = (user ? user.displayName || fallbackName : fallbackName)
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      const fileName = `jigsudo-stats-${nameClean}-${dateStr}.png`;

      const file = new File([blob], fileName, { type: "image/png" });
      const shareData = {
        title: "Resumen Jigsudo",
        text:
          (t.share_stats_msg || "¡Mira mi progreso en Jigsudo! 🧩✨") +
          `\n\n${shareUrl}`,
        files: [file],
      };

      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );

      if (
        isMobile &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share(shareData);
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("Share failed:", err);
            downloadFallback(canvas, fileName);
          }
        }
      } else {
        // Desktop or unsupported: Direct download
        downloadFallback(canvas, fileName);
      }
    }, "image/png");
  } catch (err) {
    console.error("Failed to generate social card:", err);
    const { showToast } = await import("./ui.js");
    showToast("Error al generar la imagen ❌");
  }
}

function renderSocialWeekdayStats(stats) {
  const container = document.getElementById("sc-weekday-chart");
  if (!container) return;
  container.innerHTML = "";

  const lang = getCurrentLang() || "es";
  const formatter = new Intl.DateTimeFormat(lang, { weekday: "long" });
  const cache = stats.weekdayStatsAccumulated;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2025, 0, 5 + i);
    let label = formatter.format(d);
    label = label.charAt(0).toUpperCase() + label.slice(1);
    days.push({ label, sumTime: 0, sumScore: 0, sumErrors: 0, count: 0 });
  }

  if (cache) {
    for (let i = 0; i < 7; i++) {
      if (cache[i] && cache[i].count > 0) {
        days[i].sumTime = cache[i].sumTime || 0;
        days[i].sumScore = cache[i].sumScore || 0;
        days[i].sumErrors = cache[i].sumErrors || 0;
        days[i].count = cache[i].count;
      }
    }
  }

  days.forEach((d) => {
    const card = document.createElement("div");
    card.className = "sc-weekday-item";

    const avgTime = d.count > 0 ? d.sumTime / d.count : 0;
    const avgErrors = d.count > 0 ? d.sumErrors / d.count : 0;
    const avgScoreRaw = d.count > 0 ? d.sumScore / d.count : 0;
    const avgScoreRP = d.count > 0 ? calculateRP(avgScoreRaw) : 0;

    card.innerHTML = `
      <span class="sc-item-label">${d.label}</span>
      <div class="sc-item-stats">
        <div class="sc-mini-stat">
          <span class="sc-mini-icon">⏱️</span>
          <span class="sc-mini-val">${formatTime(avgTime)}</span>
        </div>
        <div class="sc-mini-stat">
          <span class="sc-mini-icon">❌</span>
          <span class="sc-mini-val">${d.count > 0 ? avgErrors.toFixed(1) : "0"}</span>
        </div>
        <div class="sc-mini-stat">
          <span class="sc-mini-icon">⭐</span>
          <span class="sc-mini-rp">${avgScoreRP.toLocaleString(lang, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function downloadFallback(canvas, fileName = "jigsudo-stats.png") {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}

// --- Comparison Mode Tooltip Logic (v1.7.6) ---

let compTooltip = null;

function attachComparisonListeners(foreignData) {
  const ownStats = gameManager.stats;
  if (!ownStats) return;

  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];
  const fName = foreignData.username || "Ellos";

  // 1. Header (RP & Level) - Expanded area to the whole identity card
  const header = document.querySelector("#profile-section .identity-card");
  if (header) {
    const ownRank = getRankData(ownStats.totalRP || 0);
    const foreignRank = getRankData(foreignData.totalRP || 0);
    
    setupComp(header, {
      title: t.comp_rank_title || "Comparativa de Rango",
      foreign: { 
        name: fName, 
        val: foreignData.totalRP, 
        careerVal: foreignData.careerRP || 0,
        rankName: (foreignRank.rank.icon || "") + " " + (t[foreignRank.rank.nameKey] || foreignRank.rank.nameKey),
        level: foreignRank.level
      },
      own: { 
        name: t.comp_you || "Tú", 
        val: ownStats.totalRP, 
        careerVal: ownStats.careerRP || 0,
        rankName: (ownRank.rank.icon || "") + " " + (t[ownRank.rank.nameKey] || ownRank.rank.nameKey),
        level: ownRank.level
      },
      type: "rp"
    });
  }

  // 2. Overview Stats (stat-box)
  const statBoxes = document.querySelectorAll("#profile-section .stat-box");
  statBoxes.forEach(card => {
    const numberEl = card.querySelector(".stat-number");
    const labelEl = card.querySelector(".stat-label");
    if (!numberEl || !labelEl) return;
    
    const id = numberEl.id;
    let key = "";
    if (id === "stat-played") key = "wins";
    else if (id === "stat-streak") key = "currentStreak";
    else if (id === "stat-max-streak") key = "maxStreak";
    else if (id === "stat-max-score") key = "bestScore";
    else if (id === "stat-best-time") key = "bestTime";
    else if (id === "stat-avg-time") key = "avgTime";

    if (!key) return;

    console.log(`[Comparison] Attaching to: ${id} (${key})`);

    let foreignVal = 0, ownVal = 0, type = "number", suffix = "";
    
    if (key === "avgTime") {
        // Calculate average time dynamically if not in stats
        const getAvg = (d) => {
            if (!d) return 0;
            // s can be d.stats (foreign) or d itself (own)
            const s = (d.stats && d.stats.wins !== undefined) ? d.stats : d;
            
            if (s.avgTime) return s.avgTime;
            const wins = s.wins || 0;
            const time = s.totalTimeAccumulated || 0;
            return wins > 0 ? time / wins : 0;
        };
        foreignVal = getAvg(foreignData);
        ownVal = getAvg(ownStats);
        type = "time";
    } else if (key === "bestTime") {
        foreignVal = foreignData.stats?.bestTime || 0;
        ownVal = ownStats.bestTime || 0;
        type = "time";
    } else {
        const fS = (foreignData.stats && foreignData.stats.wins !== undefined) ? foreignData.stats : foreignData;
        const oS = (ownStats && ownStats.stats && ownStats.stats.wins !== undefined) ? ownStats.stats : ownStats;

        foreignVal = fS[key] || 0;
        ownVal = oS ? (oS[key] || 0) : 0;
        
        if (key === "bestScore") suffix = " RP";
    }

    setupComp(card, {
      title: labelEl.textContent,
      foreign: { name: fName, val: foreignVal, label: formatCompValue(foreignVal, type, suffix) },
      own: { name: t.comp_you || "Tú", val: ownVal, label: formatCompValue(ownVal, type, suffix) },
      type: type
    });
  });

  // 3. Average Times per Level
  const stageCards = document.querySelectorAll("#profile-section .stat-detail-box");
  stageCards.forEach(card => {
    const nameEl = card.querySelector(".detail-label");
    if (!nameEl) return;
    const stageName = nameEl.textContent.trim();
    
    const stageKeys = {
        "Juego de Memoria": "memory", "Memory Game": "memory",
        "Rompecabezas": "jigsaw", "Jigsaw Puzzle": "jigsaw",
        "Sudoku": "sudoku",
        "Picos y Valles": "peaks", "Peaks and Valleys": "peaks",
        "Sopa de Números": "search", "Number Search": "search",
        "El Código": "code", "The Code": "code"
    };
    const key = stageKeys[stageName];
    if (!key) return;

    const getStageAvg = (s) => {
        const i = s.stats || s;
        const time = i.stageTimesAccumulated?.[key] || 0;
        const count = i.stageWinsAccumulated?.[key] || 0;
        return count > 0 ? time / count : 0;
    };

    const fVal = getStageAvg(foreignData);
    const oVal = getStageAvg(ownStats);

    // v1.7.9: Special case for Peaks & Valleys (Include Errors)
    if (key === "peaks") {
        const getPeaksExt = (d) => {
            const s = (d.stats && d.stats.wins !== undefined) ? d.stats : d;
            const wins = s.wins || 0;
            const errs = s.totalPeaksErrorsAccumulated || 0;
            return wins > 0 ? errs / wins : 0;
        };
        const fErr = getPeaksExt(foreignData);
        const oErr = getPeaksExt(ownStats);

        setupComp(card, {
            title: stageName,
            foreign: { name: fName, time: fVal, errs: fErr },
            own: { name: t.comp_you || "Tú", time: oVal, errs: oErr },
            type: "peaks"
        });
        return;
    }

    setupComp(card, {
      title: stageName,
      foreign: { name: fName, val: fVal, label: formatCompValue(fVal, "time") },
      own: { name: t.comp_you || "Tú", val: oVal, label: formatCompValue(oVal, "time") },
      type: "time"
    });
  });

  // v1.7.9: Unified Daily Average Comparison (Triple metric tooltip)
  const dailyChart = document.getElementById("daily-time-chart");
  if (dailyChart) {
      const lang = getCurrentLang() || "es";
      const formatterLong = new Intl.DateTimeFormat(lang, { weekday: "long" });
      
      dailyChart.querySelectorAll(".daily-stat-card").forEach((card, i) => {
          const getDayData = (d, idx) => {
              const s = (d.stats && d.stats.wins !== undefined) ? d.stats : d;
              const cache = s.weekdayStatsAccumulated;
              if (cache && cache[idx] && cache[idx].count > 0) {
                  const c = cache[idx];
                  return {
                      time: c.sumTime / c.count,
                      errs: c.sumErrors / c.count,
                      rp: calculateRP(c.sumScore / c.count)
                  };
              }
              return { time: null, errs: null, rp: null };
          };

          const fD = getDayData(foreignData, i);
          const oD = getDayData(ownStats, i);
          
          const dateObj = new Date(2025, 0, 5 + i); // Sun...
          let dayName = formatterLong.format(dateObj);
          dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);

          setupComp(card, {
              title: dayName,
              foreign: { name: fName, time: fD.time, errs: fD.errs, rp: fD.rp },
              own: { name: t.comp_you || "Tú", time: oD.time, errs: oD.errs, rp: oD.rp },
              type: "daily-avg"
          });
      });
  }
}

function formatCompValue(val, type, suffix = "") {
    if (val === null || val === undefined) return "--";
    if (type === "time") {
        if (val <= 0) return "--";
        const totalSec = Math.floor(val / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        
        if (h > 0) {
            return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
        }
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    const num = Number(val);
    return (isNaN(num) ? "0" : num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })) + suffix;
}

function setupComp(el, data) {
  // Desktop hover
  el.addEventListener("mouseenter", (e) => {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    showCompTooltip(e, data);
  });
  el.addEventListener("mousemove", (e) => {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    updateCompTooltipPosition(e);
  });
  el.addEventListener("mouseleave", () => {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    hideCompTooltip();
  });

  // Mobile Long Press
  let touchTimer = null;
  el.addEventListener("touchstart", (e) => {
    touchTimer = setTimeout(() => {
      showCompTooltip(e, data, true);
    }, 500);
  }, { passive: true });

  el.addEventListener("touchend", () => {
    if (touchTimer) clearTimeout(touchTimer);
  });

  el.addEventListener("touchmove", () => {
    if (touchTimer) clearTimeout(touchTimer);
  });
}

function showCompTooltip(e, data, isMobile = false) {
  if (!comparisonEnabled) return;
  const container = document.getElementById("comp-tooltip-container");

  if (!compTooltip) {
    compTooltip = document.createElement("div");
    compTooltip.className = "comp-tooltip";
    document.body.appendChild(compTooltip);
  }

  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];

  const fVal = data.foreign.val;
  const oVal = data.own.val;

  let trendIcon = "";
  let trendClass = "";

  if (fVal > 0 && oVal > 0) {
      const isBetter = data.type === "time" ? (oVal < fVal) : (oVal > fVal);
      const isWorse = data.type === "time" ? (oVal > fVal) : (oVal < fVal);
      if (isBetter) { trendIcon = "▲"; trendClass = "trend-up"; }
      else if (isWorse) { trendIcon = "▼"; trendClass = "trend-down"; }
  }

  let fHtml = "";
  let oHtml = "";

  if (data.type === "rp") {
      const f = data.foreign;
      const o = data.own;
      const fRP = Number(f.val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const oRP = Number(o.val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fCareer = Number(f.careerVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const oCareer = Number(o.careerVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const careerLabel = t.rank_tab_gross || "Carrera";
      const lvlPrefix = t.rank_level_prefix || "Nvl.";
      
      const cTrend = o.careerVal > f.careerVal ? "trend-up" : (o.careerVal < f.careerVal ? "trend-down" : "");
      const cIcon = cTrend === "trend-up" ? "▲" : (cTrend === "trend-down" ? "▼" : "");

      fHtml = `
        <div class="comp-value-stack">
            <span class="comp-rank-name">${f.rankName}</span>
            <span class="comp-rank-level">${lvlPrefix} ${f.level}</span>
            <span class="comp-rank-rp">${fRP} RP</span>
            <span class="comp-rank-career" style="font-size: 0.75rem; opacity: 0.7;">${fCareer} (${careerLabel})</span>
        </div>`;
      
      oHtml = `
        <div class="comp-value-stack">
            <span class="comp-rank-name">${o.rankName}</span>
            <span class="comp-rank-level">${lvlPrefix} ${o.level}</span>
            <span class="comp-rank-rp">${oRP} RP <span class="${trendClass}">${trendIcon}</span></span>
            <span class="comp-rank-career" style="font-size: 0.75rem; opacity: 0.7;">${oCareer} (${careerLabel}) <span class="${cTrend}">${cIcon}</span></span>
        </div>`;
  } else if (data.type === "peaks") {
      const f = data.foreign;
      const o = data.own;
      const tTrend = o.time < f.time ? "trend-up" : (o.time > f.time ? "trend-down" : "trend-equal");
      const tIcon = tTrend === "trend-up" ? "▲" : (tTrend === "trend-down" ? "▼" : "");
      const eTrend = o.errs < f.errs ? "trend-up" : (o.errs > f.errs ? "trend-down" : "trend-equal");
      const eIcon = eTrend === "trend-up" ? "▲" : (eTrend === "trend-down" ? "▼" : "");
      const fTime = formatCompValue(f.time, "time");
      const oTime = formatCompValue(o.time, "time");
      const fErr = f.errs.toFixed(1);
      const oErr = o.errs.toFixed(1);

      fHtml = `
        <div class="comp-value-stack">
            <span class="comp-value">${fTime}</span>
            <span class="comp-value" style="font-size: 0.8rem; opacity: 0.8;">${fErr} err.</span>
        </div>`;
      oHtml = `
        <div class="comp-value-stack">
            <span class="comp-value">${oTime} <span class="${tTrend}">${tIcon}</span></span>
            <span class="comp-value" style="font-size: 0.8rem; opacity: 0.8;">${oErr} err. <span class="${eTrend}">${eIcon}</span></span>
        </div>`;
  } else if (data.type === "daily-avg") {
      const f = data.foreign;
      const o = data.own;
      const getTrendData = (fV, oV, type) => {
          if (fV === undefined || oV === undefined || fV === null || oV === null) return { icon: "", class: "trend-equal" };
          const isBetter = (type === "time" || type === "errs") ? (oV < fV) : (oV > fV);
          const isWorse = (type === "time" || type === "errs") ? (oV > fV) : (oV < fV);
          if (isBetter) return { icon: "▲", class: "trend-up" };
          if (isWorse) return { icon: "▼", class: "trend-down" };
          return { icon: "", class: "trend-equal" };
      };
      const tT = getTrendData(f.time, o.time, "time");
      const eT = getTrendData(f.errs, o.errs, "errs");
      const rT = getTrendData(f.rp, o.rp, "rp");
      const fTime = formatCompValue(f.time, "time");
      const oTime = formatCompValue(o.time, "time");
      const fErr = formatCompValue(f.errs, "num");
      const oErr = formatCompValue(o.errs, "num");
      const fRP = formatCompValue(f.rp, "num");
      const oRP = formatCompValue(o.rp, "num");

      fHtml = `
        <div class="comp-value-stack" style="gap: 2px;">
            <span class="comp-value">${fRP} RP ⭐</span>
            <span class="comp-value" style="font-size: 0.8rem; opacity: 0.8;">${fTime} ⏱️</span>
            <span class="comp-value" style="font-size: 0.8rem; opacity: 0.8;">${fErr} err. ❌</span>
        </div>`;
      oHtml = `
        <div class="comp-value-stack" style="gap: 2px;">
            <span class="comp-value">${oRP} <span class="${rT.class}">${rT.icon}</span></span>
            <span class="comp-value" style="font-size: 0.8rem; opacity: 0.8;">${oTime} <span class="${tT.class}">${tT.icon}</span></span>
            <span class="comp-value" style="font-size: 0.8rem; opacity: 0.8;">${oErr} <span class="${eT.class}">${eT.icon}</span></span>
        </div>`;
  } else {
      fHtml = `<span class="comp-value">${data.foreign.label}</span>`;
      oHtml = `<span class="comp-value">${data.own.label} <span class="${trendClass}">${trendIcon}</span></span>`;
  }

  let closeBtnHtml = isMobile ? `<button class="tooltip-close">×</button>` : "";

  compTooltip.innerHTML = `
    ${closeBtnHtml}
    <div class="comp-tooltip-title">${data.title}</div>
    <div class="comp-grid">
        <div class="comp-column">
            <span class="comp-label">${data.foreign.name}</span>
            ${fHtml}
        </div>
        <div class="comp-vs">vs</div>
        <div class="comp-column">
            <span class="comp-label">${data.own.name}</span>
            ${oHtml}
        </div>
    </div>
  `;

  if (isMobile) {
      compTooltip.style.left = "";
      compTooltip.style.top = "";
      compTooltip.classList.add("mobile-mode");
      if (container) {
          container.classList.add("visible");
          // Use pointerdown to ensure a NEW touch is required to close
          container.onpointerdown = () => hideCompTooltip(true);
      }
      document.documentElement.classList.add("no-scroll");
      document.body.classList.add("no-scroll");
      window.history.pushState({ compTooltipOpen: true }, "");

      const closeBtn = compTooltip.querySelector(".tooltip-close");
      if (closeBtn) {
          closeBtn.onclick = (ev) => {
              ev.stopPropagation();
              hideCompTooltip(true);
          };
      }
  } else {
      compTooltip.classList.remove("mobile-mode");
      if (container) container.classList.remove("visible");
      updateCompTooltipPosition(e);
  }

  compTooltip.classList.add("visible");
}

function updateCompTooltipPosition(e) {
  if (!compTooltip || compTooltip.classList.contains("mobile-mode")) return;
  const x = e.clientX + 15;
  const y = e.clientY + 15;
  const width = compTooltip.offsetWidth;
  const height = compTooltip.offsetHeight;
  const maxX = window.innerWidth - width - 20;
  const maxY = window.innerHeight - height - 20;
  compTooltip.style.left = `${Math.min(x, maxX)}px`;
  compTooltip.style.top = `${Math.min(y, maxY)}px`;
}

function hideCompTooltip(isExplicitClose = false) {
  if (compTooltip) {
      compTooltip.classList.remove("visible");
      // v1.7.9: Delay removal of mobile-mode to allow fade-out animation to finish in place
      setTimeout(() => {
          if (compTooltip && !compTooltip.classList.contains("visible")) {
              compTooltip.classList.remove("mobile-mode");
          }
      }, 300);
  }
  const container = document.getElementById("comp-tooltip-container");
  if (container) container.classList.remove("visible");
  
  document.documentElement.classList.remove("no-scroll");
  document.body.classList.remove("no-scroll");

  if (isExplicitClose && window.history.state?.compTooltipOpen) {
      window.history.back();
  }
}

// Global popstate listener for comparison tooltip
window.addEventListener("popstate", () => {
    if (compTooltip && compTooltip.classList.contains("visible") && compTooltip.classList.contains("mobile-mode")) {
        hideCompTooltip(false);
    }
});
