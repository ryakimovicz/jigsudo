import { getCurrentUser, logoutUser } from "./auth.js";
import { getCurrentLang } from "./i18n.js";
import { gameManager } from "./game-manager.js";
import { getRankData } from "./ranks.js";

export function initProfile() {
  console.log("Profile Module Loaded");

  // Handle Initial Hash
  handleRouting();

  // Listen for Hash Changes
  window.addEventListener("hashchange", handleRouting);

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

  // Logout Button
  const logoutBtn = document.getElementById("btn-profile-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (confirm("¿Cerrar sesión?")) {
        await logoutUser();
        // Redirect to home/login after logout
        window.location.hash = "";
      }
    });
  }
}

// Router Handler
function handleRouting() {
  const hash = window.location.hash;

  if (hash === "#profile") {
    _showProfileUI();
  } else {
    _hideProfileUI();
  }
}

// Public method now just sets the hash
export function showProfile() {
  window.location.hash = "profile";
}

// Public method now just clears hash
export function hideProfile() {
  window.location.hash = "";
}

// Internal UI Manipulation
function _showProfileUI() {
  const section = document.getElementById("profile-section");
  const menu = document.getElementById("menu-content"); // Main Home Content
  // We might need to hide specific sections depending on what's active (home vs game)
  const gameSection = document.getElementById("game-section");
  // const appHeader = document.querySelector(".main-header"); // Corrected Selector

  if (section) section.classList.remove("hidden");

  // Hide everything else
  if (menu) menu.classList.add("hidden");
  if (gameSection) gameSection.classList.add("hidden");
  // if (appHeader) appHeader.classList.add("hidden");

  updateProfileData();
}

function _hideProfileUI() {
  const section = document.getElementById("profile-section");
  const menu = document.getElementById("menu-content");
  // const appHeader = document.querySelector(".main-header");

  if (section) section.classList.add("hidden");

  // Restore Home (Or Game? Simple state for now: return to Home)
  // Ideally we track previous state, but Home is safe default.
  if (menu) menu.classList.remove("hidden");
  // if (appHeader) appHeader.classList.remove("hidden");
}

function updateProfileData() {
  const user = getCurrentUser();

  // If no user, maybe redirect? For now, show "Guest"
  const avatarEl = document.getElementById("profile-avatar");
  const nameEl = document.getElementById("profile-username");
  const emailEl = document.getElementById("profile-email");

  if (!user) {
    if (nameEl) nameEl.textContent = "Invitado";
    if (emailEl) emailEl.textContent = "";
    if (avatarEl) avatarEl.textContent = "?";
    return;
  }

  const displayName = user.displayName || "Usuario";
  const initial = displayName.charAt(0).toUpperCase();

  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = user.email;
  if (avatarEl) avatarEl.textContent = initial;

  // Stats from Global Storage
  const statsStr = localStorage.getItem("jigsudo_user_stats");
  const stats = statsStr
    ? JSON.parse(statsStr)
    : {
        totalPlayed: 0,
        wins: 0,
        currentStreak: 0,
        maxStreak: 0,
        currentRP: 0,
      };

  // 1. Basic Stats
  const streakEl = document.getElementById("stat-streak");
  const maxStreakEl = document.getElementById("stat-max-streak");
  const playedEl = document.getElementById("stat-played");
  const winRateEl = document.getElementById("stat-winrate");

  if (streakEl) streakEl.textContent = stats.currentStreak;
  if (maxStreakEl) maxStreakEl.textContent = stats.maxStreak;
  if (playedEl) playedEl.textContent = stats.totalPlayed;

  if (winRateEl) {
    const rate =
      stats.totalPlayed > 0
        ? ((stats.wins / stats.totalPlayed) * 100).toFixed(0)
        : 0;
    winRateEl.textContent = `${rate}%`;
  }

  // 2. Rank UI
  const currentRP = stats.currentRP || 0;
  const rankData = getRankData(currentRP);

  const rankIconEl = document.getElementById("profile-rank-icon");
  const rankNameEl = document.getElementById("profile-rank-name");
  const rankLevelEl = document.getElementById("profile-rank-level");
  const progressFill = document.getElementById("profile-rank-progress");
  const rpCurrentEl = document.getElementById("profile-rp-current");
  const rpNextEl = document.getElementById("profile-rp-next");

  if (rankIconEl) rankIconEl.textContent = rankData.rank.icon;
  if (rankNameEl) rankNameEl.textContent = rankData.rank.name;
  if (rankLevelEl) rankLevelEl.textContent = `Nvl. ${rankData.level}`;

  if (progressFill) progressFill.style.width = `${rankData.progress}%`;

  if (rpCurrentEl) rpCurrentEl.textContent = currentRP.toLocaleString();
  if (rpNextEl) {
    // If max rank, show infinite or current
    const nextGoal = rankData.nextRank ? rankData.nextRank.minRP : "MAX";
    rpNextEl.textContent =
      typeof nextGoal === "number" ? nextGoal.toLocaleString() : nextGoal;
  }
}
