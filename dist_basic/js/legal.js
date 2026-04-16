import { initLanguage, getCurrentLang } from "./i18n.js?v=1.3.1";
import { initSidebar } from "./sidebar.js?v=1.3.1";
import { translations } from "./translations.js?v=1.3.1";
import { CONFIG } from "./config.js?v=1.3.1";
import { getRankData } from "./ranks.js?v=1.3.1";
import { initBasicEdition } from "./basic-edition.js?v=1.3.1";

// Initialize Basic Edition rules
initBasicEdition();

// Initialize Sidebar
initSidebar();

// Initialize language support
initLanguage();

// Populate Header Data
updateHeaderInfo();

// Listen for language changes to update header
window.addEventListener("languageChanged", updateHeaderInfo);

// Sidebar Navigation Support for Static Pages
const sidebar = document.getElementById("side-sidebar");
if (sidebar) {
  const navHome = document.getElementById("nav-home");
  const navHistory = document.getElementById("nav-history");
  const navHowTo = document.getElementById("nav-how-to");
  const navChangelog = document.getElementById("nav-changelog");

  if (navHome) navHome.addEventListener("click", () => (window.location.href = "../#home"));
  if (navHistory) navHistory.addEventListener("click", () => (window.location.href = "../#history"));
  if (navHowTo) navHowTo.addEventListener("click", () => (window.location.href = "../#guide"));
  if (navChangelog) navChangelog.addEventListener("click", () => (window.location.href = "../#changelog"));
}

// Theme Switching Logic
initThemeSwitcher();

// Settings Toggles Logic
initSettingsToggles();

// Populate Stats
populateMenuStats();

/**
 * Theme Switcher logic for static pages
 */
function initThemeSwitcher() {
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  const savedTheme = localStorage.getItem("jigsudo_theme") || "auto";
  themeRadios.forEach((radio) => {
    if (radio.value === savedTheme) radio.checked = true;
    radio.addEventListener("change", (e) => {
      const newTheme = e.target.value;
      localStorage.setItem("jigsudo_theme", newTheme);
      applyTheme(newTheme);
    });
  });
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  let isDark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  document.body.classList.toggle("dark-mode", isDark);
}

/**
 * Sound and Vibration toggles logic (Disconnected from functional audio)
 */
function initSettingsToggles() {
  const soundToggle = document.getElementById("sound-toggle");
  const soundContainer = document.getElementById("setting-sound-container-modal");
  const vibrationToggle = document.getElementById("vibration-toggle");
  const vibrationContainer = document.getElementById("setting-vibration-container");
  const confirmClearToggle = document.getElementById("confirm-clear-toggle");

  if (soundContainer) soundContainer.style.display = "flex";
  if (soundToggle) {
    soundToggle.checked = false;
    localStorage.setItem("jigsudo_sound", "false");
  }

  const hasVibration = "vibrate" in navigator;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  if (vibrationContainer && !(hasVibration && isTouchDevice)) {
    vibrationContainer.style.display = "none";
  }

  if (vibrationToggle) {
    vibrationToggle.checked = localStorage.getItem("jigsudo_vibration") !== "false";
    vibrationToggle.addEventListener("change", (e) => {
      localStorage.setItem("jigsudo_vibration", e.target.checked);
    });
  }

  if (confirmClearToggle) {
    const isSkipping = localStorage.getItem("jigsudo_skip_clear_confirm") === "true";
    confirmClearToggle.checked = !isSkipping;
    confirmClearToggle.addEventListener("change", (e) => {
      localStorage.setItem("jigsudo_skip_clear_confirm", (!e.target.checked).toString());
    });
  }
}

/**
 * Populate Sidebar Menu Stats from LocalStorage (Demo Mode)
 */
function populateMenuStats() {
  const statsStr = localStorage.getItem("jigsudo_user_stats");
  if (!statsStr) return;
  try {
    const stats = JSON.parse(statsStr);
    const currentRP = stats.totalRP || 0;
    const rankData = getRankData(currentRP);
    const mRankIcon = document.getElementById("menu-rank-icon");
    const mRankName = document.getElementById("menu-rank-name");
    const mRankLevel = document.getElementById("menu-rank-level");
    const mRpCurrent = document.getElementById("menu-rp-current");
    const mRpNext = document.getElementById("menu-rp-next");
    const mRpProgress = document.getElementById("menu-rp-progress");
    const mStreak = document.getElementById("menu-stat-streak");
    const mDailyPoints = document.getElementById("menu-stat-daily");

    const fmtNumber = (num, decimals) => {
        const lang = getCurrentLang() || "es";
        return new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-US', { 
            minimumFractionDigits: decimals, 
            maximumFractionDigits: decimals 
        }).format(num);
    };

    if (mRankIcon) mRankIcon.textContent = rankData.rank.icon;
    if (mRankName) {
      let lang = getCurrentLang() || "es";
      const nameKey = rankData.rank.nameKey;
      mRankName.textContent = translations[lang]?.[nameKey] || nameKey;
    }
    if (mRankLevel) {
      const lang = getCurrentLang() || "es";
      mRankLevel.textContent = `${translations[lang]?.rank_level_prefix || "Nvl."} ${rankData.level}`;
    }
    if (mRpCurrent) mRpCurrent.textContent = fmtNumber(currentRP, 2);
    if (mRpNext) mRpNext.textContent = typeof rankData.nextRank?.minRP === "number" ? fmtNumber(rankData.nextRank.minRP, 0) : "MAX";
    if (mRpProgress) mRpProgress.style.width = `${rankData.progress}%`;
    if (mStreak) mStreak.textContent = stats.currentStreak || 0;
    if (mDailyPoints) mDailyPoints.textContent = fmtNumber(stats.dailyRP || 0, 2);
  } catch (e) {}
}

/**
 * Share App functionality (Demo link)
 */
window.shareApp = async () => {
  const lang = getCurrentLang();
  const t = translations[lang] || translations["es"];
  const shareData = {
    title: "Jigsudo Demo",
    text: t.share_msg || "¡Desafía tu mente con Jigsudo!",
    url: "https://corolado.itch.io/jigsudo",
  };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      alert(t.share_copied || "Enlace copiado");
    }
  } catch (err) {}
};

/**
 * Header Date Info (Fixed for Demo)
 */
function updateHeaderInfo() {
  const dateEl = document.getElementById("current-date");
  const challengeEl = document.getElementById("challenge-num");
  if (!dateEl || !challengeEl) return;

  const now = new Date(); // Fixed date logic normally handled by time.js, but visual update needs this
  const lang = getCurrentLang();
  const t = translations[lang];
  const locale = t ? t.date_locale : "es-ES";

  const dateStr = now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  let formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
    return word === "de" || word === "en" || word === "del" ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
  dateEl.textContent = formattedDate;
  challengeEl.textContent = "#001 (DEMO)";
}
