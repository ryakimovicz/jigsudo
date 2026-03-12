import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { initLanguage, getCurrentLang } from "./i18n.js";
import { closeSidebar } from "./sidebar.js";
import { translations } from "./translations.js";
import { CONFIG } from "./config.js";


// Initialize language support
initLanguage();

// Populate Header Data
updateHeaderInfo();

// Listen for language changes to update header
window.addEventListener("languageChanged", updateHeaderInfo);

const sidebar = document.getElementById("side-sidebar");
if (sidebar) {
  // Handle sidebar navigation
  const navHome = document.getElementById("nav-home");
  const navHistory = document.getElementById("nav-history");
  const navHowTo = document.getElementById("nav-how-to");

  if (navHome)
    navHome.addEventListener("click", () => (window.location.href = "../#home"));
  if (navHistory)
    navHistory.addEventListener("click", () => (window.location.href = "../#history"));
  if (navHowTo)
    navHowTo.addEventListener("click", () => (window.location.href = "../#guide"));

  // Handle Account and Settings dropdowns
  const btnAuth = document.getElementById("btn-auth");
  const authDropdown = document.getElementById("auth-dropdown");
  const btnProfile = document.getElementById("btn-profile");
  const profileDropdown = document.getElementById("profile-dropdown");

  if (btnAuth && authDropdown) {
    btnAuth.addEventListener("click", (e) => {
      e.stopPropagation();
      authDropdown.classList.toggle("hidden");
      if (profileDropdown) profileDropdown.classList.add("hidden");
    });
  }

  if (btnProfile && profileDropdown) {
    btnProfile.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("hidden");
      if (authDropdown) authDropdown.classList.add("hidden");
    });
  }

  // Close dropdowns on click outside
  document.addEventListener("click", (e) => {
    if (authDropdown && !authDropdown.contains(e.target) && e.target !== btnAuth) {
      authDropdown.classList.add("hidden");
    }
    if (profileDropdown && !profileDropdown.contains(e.target) && e.target !== btnProfile) {
      profileDropdown.classList.add("hidden");
    }
  });
}

// Theme Switching Logic
initThemeSwitcher();

// Settings Toggles Logic
initSettingsToggles();

// Auth State Listener
initAuthListener();

/**
 * Theme Switcher logic for static pages
 */
function initThemeSwitcher() {
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  const savedTheme = localStorage.getItem("jigsudo_theme") || "auto";

  // Set initial state
  themeRadios.forEach((radio) => {
    if (radio.value === savedTheme) radio.checked = true;
    radio.addEventListener("change", (e) => {
      const newTheme = e.target.value;
      localStorage.setItem("jigsudo_theme", newTheme);
      applyTheme(newTheme);
    });
  });

  // Apply initially
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  let isDark = false;
  if (theme === "dark") {
    isDark = true;
  } else if (theme === "light") {
    isDark = false;
  } else {
    // Auto
    isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  document.body.classList.toggle("dark-mode", isDark);
}

/**
 * Sound and Vibration toggles logic
 */
function initSettingsToggles() {
  const soundToggle = document.getElementById("sound-toggle");
  const soundContainer = document.getElementById("setting-sound-container-modal");
  const vibrationToggle = document.getElementById("vibration-toggle");
  const vibrationContainer = document.getElementById("setting-vibration-container");
  const confirmClearToggle = document.getElementById("confirm-clear-toggle");

  // Sound Visibility based on CONFIG
  if (soundContainer && !CONFIG.ENABLE_SOUND) {
    soundContainer.style.display = "none";
  }

  if (soundToggle) {
    soundToggle.checked = localStorage.getItem("jigsudo_sound") !== "false";
    soundToggle.addEventListener("change", (e) => {
      localStorage.setItem("jigsudo_sound", e.target.checked);
    });
  }

  // Vibration Visibility based on Device capabilities
  const hasVibration = "vibrate" in navigator;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  const showVibration = hasVibration && isTouchDevice;

  if (vibrationContainer && !showVibration) {
    vibrationContainer.style.display = "none";
  }

  if (vibrationToggle) {
    vibrationToggle.checked = localStorage.getItem("jigsudo_vibration") !== "false";
    vibrationToggle.addEventListener("change", (e) => {
      localStorage.setItem("jigsudo_vibration", e.target.checked);
      if (e.target.checked && navigator.vibrate) {
        try { navigator.vibrate(20); } catch (e) {}
      }
    });
  }

  if (confirmClearToggle) {
    // Note: main app uses jigsudo_skip_clear_confirm with inverted logic
    const isSkipping = localStorage.getItem("jigsudo_skip_clear_confirm") === "true";
    confirmClearToggle.checked = !isSkipping;
    
    confirmClearToggle.addEventListener("change", (e) => {
      localStorage.setItem("jigsudo_skip_clear_confirm", (!e.target.checked).toString());
    });
  }
}

/**
 * Minimal Auth Listener to update sidebar footer
 */
function initAuthListener() {
  const loginWrapper = document.getElementById("login-wrapper");
  const loggedInView = document.getElementById("logged-in-view");
  const userDisplayNameEl = document.getElementById("user-display-name");
  const btnLoginTrigger = document.getElementById("btn-login-trigger");
  const btnGuestProfile = document.getElementById("btn-guest-profile");
  const btnViewProfile = document.getElementById("btn-view-profile");
  const quickStats = document.querySelector(".player-quick-stats");

  const goHome = () => (window.location.href = "../#home");

  if (btnLoginTrigger) btnLoginTrigger.addEventListener("click", goHome);
  if (btnGuestProfile) btnGuestProfile.addEventListener("click", goHome);
  if (btnViewProfile) btnViewProfile.addEventListener("click", goHome);

  onAuthStateChanged(auth, (user) => {
    const isGuest = !user || user.isAnonymous;
    
    if (!isGuest) {
      if (loginWrapper) loginWrapper.classList.add("hidden");
      if (loggedInView) loggedInView.classList.remove("hidden");
      if (userDisplayNameEl) userDisplayNameEl.textContent = user.displayName || "Usuario";
    } else {
      if (loginWrapper) loginWrapper.classList.remove("hidden");
      if (loggedInView) loggedInView.classList.add("hidden");
    }
    
    // Always show quick stats, even for guests (matches main app parity)
    if (quickStats) quickStats.classList.remove("hidden");
  });
}

/**
 * Share App functionality
 */
window.shareApp = async () => {
  const lang = getCurrentLang();
  const t = translations[lang] || translations["es"];
  const shareData = {
    title: "Jigsudo",
    text: t.share_msg || "¡Desafía tu mente con Jigsudo!",
    url: window.location.origin,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      // Fallback: Copy to clipboard
      await navigator.clipboard.writeText(shareData.url);
      alert(t.share_copied || "Enlace copiado al portapapeles");
    }
  } catch (err) {
    console.error("Error sharing:", err);
  }
};

/**
 * Ported from home.js to keep static pages in sync with main app header
 */
function updateHeaderInfo() {
  const dateEl = document.getElementById("current-date");
  const challengeEl = document.getElementById("challenge-num");

  if (!dateEl || !challengeEl) return;

  const now = new Date();
  const lang = getCurrentLang();
  const t = translations[lang];
  const locale = t ? t.date_locale : "es-ES";

  // Date
  const dateStr = now.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  let formattedDate = dateStr;

  if (lang === "es") {
    formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
      return word === "de" || word === "en" || word === "del"
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  } else {
    formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  dateEl.textContent = formattedDate;

  // Challenge #: Days since Jan 18, 2026 (Launch Day = #001)
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startZero = new Date(2026, 0, 18); // Jan 18, 2026

  const diffTime = todayZero - startZero;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

  challengeEl.textContent = `#${String(diffDays).padStart(3, "0")}`;
}
