import { translations } from "./translations.js?v=1.3.1";
import { getCurrentLang } from "./i18n.js?v=1.3.1";
import { getDailySeed } from "./utils/random.js?v=1.3.1";
import { gameManager } from "./game-manager.js?v=1.3.1";
import { CONFIG } from "./config.js?v=1.3.1";
import { updateSidebarActiveState } from "./sidebar.js?v=1.3.1";
import { router } from "./router.js?v=1.3.1";
import { isPuzzleAvailable } from "./history.js?v=1.3.1";
import { showAlertModal } from "./ui.js?v=1.3.1";
import { getJigsudoDate, getJigsudoDateString } from "./utils/time.js?v=1.3.1";
import { isAtGameRoute } from "./utils/route-utils.js?v=1.3.1";

// Global UI Helpers - Removed password toggle as auth is gone

export function initHome() {
  console.log("Jigsudo Home Module Loaded");

  // Enforce Home State Class for CSS overrides
  document.body.classList.add("home-active");

  const startBtn = document.getElementById("start-btn");

  // Show sound settings by default (will be disabled/unchecked via HTML and logic)
  const soundModalRow = document.getElementById("setting-sound-container-modal");
  if (soundModalRow) {
    soundModalRow.style.display = "flex";
  }

  // --- Theme Logic (Segmented Control) ---
  const themeInputs = document.querySelectorAll('input[name="theme"]');
  const body = document.body;
  const THEME_KEY = "jigsudo_theme";

  function applyVisualTheme(theme) {
    if (theme === "auto") {
      const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      body.classList.toggle("dark-mode", systemPrefersDark);
    } else {
      body.classList.toggle("dark-mode", theme === "dark");
    }
  }

  const savedTheme = localStorage.getItem(THEME_KEY) || "auto";
  applyVisualTheme(savedTheme);

  const activeInput = document.querySelector(`input[name="theme"][value="${savedTheme}"]`);
  if (activeInput) activeInput.checked = true;

  themeInputs.forEach((input) => {
    input.addEventListener("change", (e) => {
      if (e.target.checked) {
        const newTheme = e.target.value;
        localStorage.setItem(THEME_KEY, newTheme);
        applyVisualTheme(newTheme);
      }
    });
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (localStorage.getItem(THEME_KEY) === "auto") {
      applyVisualTheme("auto");
    }
  });

  // --- Gameplay Settings ---
  const confirmToggle = document.getElementById("confirm-clear-toggle");
  if (confirmToggle) {
    const updateToggleFromStorage = () => {
      const isSkipping = localStorage.getItem("jigsudo_skip_clear_confirm") === "true";
      confirmToggle.checked = !isSkipping;
    };
    updateToggleFromStorage();
    confirmToggle.addEventListener("change", () => {
      localStorage.setItem("jigsudo_skip_clear_confirm", confirmToggle.checked ? "false" : "true");
    });
  }

  const soundToggle = document.getElementById("sound-toggle");
  if (soundToggle) {
    soundToggle.checked = false;
    localStorage.setItem("jigsudo_sound", "false");
  }

  const vibToggle = document.getElementById("vibration-toggle");
  const vibContainer = document.getElementById("setting-vibration-container");
  const hasVibration = "vibrate" in navigator;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  if (vibContainer) {
    if (!(hasVibration && isTouchDevice)) {
      vibContainer.style.display = "none";
    } else if (vibToggle) {
      vibToggle.checked = true;
      localStorage.setItem("jigsudo_vibration", "true");
    }
  }

  // --- Header Info (Date & Challenge #) ---
  function updateHeaderInfo() {
    if (CONFIG.isBasicEdition) return;
    const dateEl = document.getElementById("current-date");
    const challengeEl = document.getElementById("challenge-num");
    if (!dateEl || !challengeEl) return;

    const now = getJigsudoDate();
    const lang = getCurrentLang();
    const t = translations[lang];
    const locale = t ? t.date_locale : "es-ES";

    const dateStr = now.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });

    let formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
      if (lang === "es" && (word === "de" || word === "en" || word === "del")) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });

    if (CONFIG.isBasicEdition) {
      dateEl.textContent = lang === "en" ? "Basic Edition" : "Edición Básica";
    } else {
      dateEl.textContent = formattedDate;
    }

    const todayZero = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startZero = new Date(Date.UTC(2026, 3, 5));
    const diffDays = Math.floor((todayZero - startZero) / (1000 * 60 * 60 * 24)) + 1;
    challengeEl.textContent = `#${String(diffDays).padStart(3, "0")}`;
  }

  updateHeaderInfo();

  window.addEventListener("languageChanged", () => {
    updateHeaderInfo();
    refreshStartButton();
  });

  // --- Gameplay Button Logic ---
  const handleStart = async () => {
    console.log("Preparing Daily Game...");
    if (startBtn) {
      startBtn.textContent = "Cargando...";
      startBtn.disabled = true;
    }

    try {
      if (gameManager.isWiping) {
        console.warn("[Home] Sync in progress. Blocking start.");
        return;
      }
      await gameManager.prepareDaily();
      await gameManager.recordStart();
      await startDailyGame();

      if (startBtn) {
        startBtn.textContent = translations[getCurrentLang()]?.btn_start || "EMPEZAR";
        startBtn.disabled = false;
      }
    } catch (err) {
      console.error("Failed to start Daily Game", err);
      if (startBtn) {
        startBtn.textContent = "Error";
        startBtn.disabled = false;
      }
    }
  };

  const handleViewResults = async () => {
    try {
      const stats = JSON.parse(localStorage.getItem("jigsudo_user_stats") || "{}");
      const seedStr = getDailySeed().toString();
      const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      const todayStats = stats.history?.[today];

      if (todayStats) {
        const source = todayStats.original || todayStats.best || todayStats;
        const sessionStats = {
          totalTime: source.totalTime,
          score: source.score,
          streak: stats.currentStreak,
          errors: source.errors || source.peaksErrors || 0,
          stageTimes: source.stageTimes || {},
          date: today,
          isReplay: false
        };
        const { showVictorySummary } = await import("./ui.js?v=1.3.1");
        showVictorySummary(sessionStats, true);
      }
    } catch (e) {
      console.error("Failed to view results:", e);
    }
  };

  const checkDailyWin = () => {
    try {
      const stats = JSON.parse(localStorage.getItem("jigsudo_user_stats") || "{}");
      const seedStr = getDailySeed().toString();
      const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      const historyEntry = stats.history?.[today];
      const isWon = historyEntry?.original?.won === true || historyEntry?.status === "won";
      const optimisticWon = localStorage.getItem("jigsudo_just_won_day");
      const isOptimisticWon = optimisticWon === today || window._jigsudoJustWonToday === today;

      return !!(isWon || isOptimisticWon);
    } catch (e) {
      return false;
    }
  };

  const refreshStartButton = () => {
    if (!startBtn) return;
    const lang = getCurrentLang() || "es";
    const isWon = checkDailyWin();
    if (isWon) {
      startBtn.dataset.i18n = "btn_view_results";
      startBtn.textContent = translations[lang]?.btn_view_results || "Ver Resultado";
      startBtn.disabled = false;
      startBtn.classList.add("btn-won");
      startBtn.onclick = handleViewResults;
    } else {
      startBtn.dataset.i18n = "btn_start";
      startBtn.textContent = translations[lang]?.btn_start || "EMPEZAR";
      startBtn.disabled = false;
      startBtn.classList.remove("btn-won");
      startBtn.onclick = handleStart;
    }
  };

  const refreshAllDayData = () => {
    updateHeaderInfo();
    refreshStartButton();
  };

  window.addEventListener("jigsudoDayChanged", refreshAllDayData);

  const setupJigsudoDayTimer = () => {
    if (window.jigsudoDayTimer) clearTimeout(window.jigsudoDayTimer);
    const now = new Date();
    const nextReset = new Date(now);
    nextReset.setUTCHours(6, 0, 0, 0);
    if (nextReset <= now) nextReset.setUTCDate(nextReset.getUTCDate() + 1);

    const msUntilReset = nextReset.getTime() - now.getTime();
    window.jigsudoDayTimer = setTimeout(async () => {
      if (isAtGameRoute()) {
        setupJigsudoDayTimer();
        return;
      }
      await gameManager.prepareDaily();
      refreshAllDayData();
      setupJigsudoDayTimer();
    }, msUntilReset + 500);
  };
  setupJigsudoDayTimer();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshStartButton();
      setupJigsudoDayTimer();
    }
  });

  const navHome = document.getElementById("nav-home");
  if (navHome) {
    navHome.addEventListener("click", async () => {
      const { router } = await import("./router.js?v=1.3.1");
      router.navigateTo("#home");
    });
  }

  const appTitle = document.querySelector(".app-title");
  if (appTitle) appTitle.style.cursor = "default";

  window.addEventListener("routeChanged", ({ detail }) => {
    if (detail.hash === "" || detail.hash === "#" || detail.hash === "#home") {
      updateHeaderInfo();
      refreshStartButton();
      if (gameManager.currentSeed !== getDailySeed() && !gameManager.isReplay) {
        gameManager.prepareDaily().then(() => refreshAllDayData());
      }
    }

    if (detail.baseRoute === "#game" || (detail.baseRoute === "#history" && detail.params.length === 3)) {
      if (window.matchMedia("(max-width: 768px)").matches) {
        window.scrollTo(0, 0);
        document.body.classList.add("no-scroll");
      }
      
      // Forces condensed header on ALL screen sizes when in-game
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("header-condensed")));

      if (detail.baseRoute === "#history" && detail.params.length === 3) {
        const [y, m, d] = detail.params;
        const dateStr = `${y}-${m}-${d}`;
        gameManager.loadSpecificDay(dateStr).then(success => {
          if (success) startDailyGame();
          else {
            const lang = getCurrentLang();
            const t = translations[lang] || translations["es"];
            showAlertModal(t.sidebar_history || "Historial", (t.error_missing_puzzle_day || "Error").replace("{day}", d));
            window.location.hash = `#history/${y}/${m}`;
          }
        });
      } else {
        gameManager.prepareDaily().then(() => {
          gameManager.recordStart();
          startDailyGame();
        });
      }
    } else {
      document.body.classList.remove("no-scroll");
    }
  });

  window.addEventListener("gameCompleted", async (e) => {
    const dailySeed = getDailySeed();
    const targetSeed = e.detail?.seed;
    if (targetSeed && targetSeed === dailySeed) {
      const seedStr = targetSeed.toString();
      const todayStr = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      window._jigsudoJustWonToday = todayStr;
      localStorage.setItem("jigsudo_just_won_day", todayStr);
    }
    refreshStartButton();
    window._jigsudoLockHomeRefreshes = true;
    localStorage.setItem("jigsudo_home_lock", "true");
    setTimeout(() => {
      window._jigsudoLockHomeRefreshes = false;
      localStorage.removeItem("jigsudo_home_lock");
      localStorage.removeItem("jigsudo_just_won_day");
    }, 4000);
  });
}

let isStarting = false;
export async function startDailyGame() {
  if (isStarting) return;
  isStarting = true;
  try {
    if (gameManager.isWiping) return;
    if (CONFIG.betaMode) document.body.classList.add("beta-mode");

    const currentHash = window.location.hash;
    const isHistoryDeepLink = currentHash.startsWith("#history/") && currentHash.split("/").length === 4;
    if (!isHistoryDeepLink && currentHash !== "#game") {
      window.location.hash = "#game";
    }

    updateSidebarActiveState(null);
    const footer = document.querySelector(".main-footer");
    if (footer) footer.classList.add("hidden");

    const state = gameManager.getState();
    const currentStage = state.progress.currentStage || "memory";
    
    // v1.3.1: Use unified resumption logic from memory.js to ensure board setup
    const { resumeToStage } = await import(`./memory.js?v=1.3.1`);
    await resumeToStage(currentStage);
  } catch (err) {
    console.error("Failed to start game", err);
  } finally {
    isStarting = false;
  }
}
