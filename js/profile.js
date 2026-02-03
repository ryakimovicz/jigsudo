import { getCurrentUser, logoutUser } from "./auth.js";
import { getCurrentLang } from "./i18n.js";
import { gameManager } from "./game-manager.js";

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
    // Guest View
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

  // Stats
  const state = gameManager.state;
  if (state && state.progress) {
    const solvedCount = state.progress.stagesCompleted
      ? state.progress.stagesCompleted.length
      : 0;

    const streakEl = document.getElementById("stat-streak");
    const daysEl = document.getElementById("stat-days");

    if (daysEl) daysEl.textContent = solvedCount;
    // Streak placeholder
  }
}
