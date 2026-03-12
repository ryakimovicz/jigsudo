import { initLanguage, getCurrentLang } from "./i18n.js";
import { closeSidebar } from "./sidebar.js";
import { translations } from "./translations.js";
import { getDailySeed } from "./utils/random.js";

/**
 * Lightweight script for static legal pages (/about, /contact, etc.)
 * Handles sidebar navigation back to the SPA and basic UI interactions.
 */
document.addEventListener("DOMContentLoaded", () => {
  // Initialize language support
  initLanguage();

  // Populate Header Data
  updateHeaderInfo();

  // Listen for language changes to update header
  window.addEventListener("languageChanged", updateHeaderInfo);

  const sidebar = document.getElementById("side-sidebar");
  if (!sidebar) return;

  // Handle sidebar navigation - since we are in a subdirectory (/about/), 
  // we need to go up one level to reach the SPA hashes.
  const navHome = document.getElementById("nav-home");
  const navHistory = document.getElementById("nav-history");
  const navHowTo = document.getElementById("nav-how-to");

  if (navHome) {
    navHome.addEventListener("click", () => {
      window.location.href = "../#home";
    });
  }

  if (navHistory) {
    navHistory.addEventListener("click", () => {
      window.location.href = "../#history";
    });
  }

  if (navHowTo) {
    navHowTo.addEventListener("click", () => {
      window.location.href = "../#guide";
    });
  }

  // Handle Account and Settings dropdowns (UI only)
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
});

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
    // Regex accepts accents (Latin-1 Supplement block \u00C0-\u00FF)
    formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
      return word === "de" || word === "en" || word === "del"
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  } else {
    // English / Generic Title Case
    formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  dateEl.textContent = formattedDate;

  // Challenge #: Days since Jan 18, 2026 (Launch Day = #001)
  const todayZero = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startZero = new Date(2026, 0, 18); // Jan 18, 2026

  const diffTime = todayZero - startZero;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

  challengeEl.textContent = `#${String(diffDays).padStart(3, "0")}`;
}
