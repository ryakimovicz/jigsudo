/* Main Menu Logic */
import { translations } from "./translations.js?v=1.1.15";
import { getCurrentLang } from "./i18n.js?v=1.1.15";
import { showProfile } from "./profile.js?v=1.1.15";
import { getDailySeed } from "./utils/random.js?v=1.1.15";
import { gameManager } from "./game-manager.js?v=1.1.15";
import { fetchRankings, renderRankings, clearRankingCache } from "./ranking.js?v=1.1.15";
import { getCurrentUser } from "./auth.js?v=1.1.15";
import { CONFIG } from "./config.js?v=1.1.15";
import { updateSidebarActiveState } from "./sidebar.js?v=1.1.15";
import { router } from "./router.js?v=1.1.15";
import { isPuzzleAvailable } from "./history.js?v=1.1.15";
import { showAlertModal } from "./ui.js?v=1.1.15";
import { getJigsudoDate } from "./utils/time.js?v=1.1.15";
import { isAtGameRoute } from "./utils/route-utils.js?v=1.1.15";

// Global UI Helpers
window.toggleAuthPassword = function (btn) {
  if (!btn) return;
  try {
    const wrapper = btn.closest(".password-wrapper");
    const input = wrapper ? wrapper.querySelector("input") : null;
    if (!input) return;

    const isPassword = input.type === "password";

    // Toggle Type
    input.type = isPassword ? "text" : "password";

    // Toggle Icon (👁️ = Show, 🙈 = Hide/Monkey)
    btn.textContent = isPassword ? "🙈" : "👁️";

    // Sync Logic for New Password -> Verify Password
    if (input.id === "new-password-input") {
      const verifyInput = document.getElementById("verify-password-input");
      if (verifyInput) verifyInput.type = input.type;
    }
  } catch (e) {
    console.error("Toggle error:", e);
  }
};

export function initHome() {
  console.log("Jigsudo Home Module Loaded");

  // Enforce Home State Class for CSS overrides
  document.body.classList.add("home-active");

  // Footer logic moved to showHome to prevent overlap
  const footer = document.querySelector(".main-footer");

  // ... (existing constants) ...

  // Sidebar elements removed
  const startBtn = document.getElementById("start-btn");

  // Sidebar Interactions - REMOVED per user request
  // (Sidebar and menu-toggle elements have been removed from HTML)

  // Start Game - Logic moved to end of function to support tabs

  // Profile & Auth Dropdown Logic
  const btnProfile = document.getElementById("btn-profile");
  const profileDropdown = document.getElementById("profile-dropdown");
  const btnAuth = document.getElementById("btn-auth");
  const authDropdown = document.getElementById("auth-dropdown");

  // Show sound settings by default (will be disabled/unchecked via HTML and logic)
  const soundModalRow = document.getElementById("setting-sound-container-modal");
  if (soundModalRow) {
    soundModalRow.style.display = "flex";
  }

  // --- Dropdown Management (History Aware) ---
  const openDropdown = (el) => {
    if (!el) return;
    el.classList.remove("hidden");
    // Add history state for back button to close
    window.history.pushState({ modalOpen: true, modalId: el.id }, "");
  };

  const closeDropdown = (el, shouldGoBack = true) => {
    if (!el || el.classList.contains("hidden")) return;
    el.classList.add("hidden");
    // If we closed manually, pop the state from history
    if (
      shouldGoBack &&
      window.history.state?.modalOpen &&
      window.history.state?.modalId === el.id
    ) {
      window.history.back();
    }
  };

  if (btnProfile && profileDropdown) {
    btnProfile.addEventListener("click", (e) => {
      e.stopPropagation();
      if (profileDropdown.classList.contains("hidden")) {
        // If other is open, close it FIRST without going back to keep state clean
        if (authDropdown) closeDropdown(authDropdown, false);
        openDropdown(profileDropdown);
      } else {
        closeDropdown(profileDropdown);
      }
    });
  }

  if (btnAuth && authDropdown) {
    btnAuth.addEventListener("click", (e) => {
      e.stopPropagation();
      if (authDropdown.classList.contains("hidden")) {
        // If other is open, close it FIRST
        if (profileDropdown) closeDropdown(profileDropdown, false);
        openDropdown(authDropdown);
      } else {
        closeDropdown(authDropdown);
      }
    });
  }

  // Handle "X" buttons in HTML (Replacing inline onclick for history support)
  document.querySelectorAll(".dropdown-close-btn").forEach((btn) => {
    btn.removeAttribute("onclick"); // Remove legacy inline handler
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeDropdown(btn.parentElement);
    });
  });

  // Handle Back Button for Dropdowns
  window.addEventListener("popstate", (e) => {
    [authDropdown, profileDropdown].forEach((dropdown) => {
      if (dropdown && !dropdown.classList.contains("hidden")) {
        // If the current history state is NOT the one that opened this modal, close it
        if (!e.state || !e.state.modalOpen || e.state.modalId !== dropdown.id) {
          closeDropdown(dropdown, false); // Don't call back() again
        }
      }
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (profileDropdown && !profileDropdown.classList.contains("hidden")) {
      if (!profileDropdown.contains(e.target) && e.target !== btnProfile) {
        closeDropdown(profileDropdown);
      }
    }
    if (authDropdown && !authDropdown.classList.contains("hidden")) {
      if (!authDropdown.contains(e.target) && e.target !== btnAuth) {
        closeDropdown(authDropdown);
      }
    }
  });

  // Prevent closing when clicking inside the dropdowns
  [profileDropdown, authDropdown].forEach((dropdown) => {
    if (dropdown) {
      dropdown.addEventListener("click", (e) => e.stopPropagation());
    }
  });

  // --- Theme Logic (Segmented Control) ---
  const themeInputs = document.querySelectorAll('input[name="theme"]');
  const body = document.body;
  const THEME_KEY = "jigsudo_theme";

  // Helper: Apply visual theme
  function applyVisualTheme(theme) {
    if (theme === "auto") {
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      if (systemPrefersDark) {
        body.classList.add("dark-mode");
      } else {
        body.classList.remove("dark-mode");
      }
    } else {
      if (theme === "dark") {
        body.classList.add("dark-mode");
      } else {
        body.classList.remove("dark-mode");
      }
    }
  }

  // 1. Initialize Theme on Load
  const savedTheme = localStorage.getItem(THEME_KEY) || "auto";
  applyVisualTheme(savedTheme);

  // Set UI State (Radio Buttons)
  const activeInput = document.querySelector(
    `input[name="theme"][value="${savedTheme}"]`,
  );
  if (activeInput) activeInput.checked = true;

  // 2. Listen for Changes
  themeInputs.forEach((input) => {
    input.addEventListener("change", (e) => {
      if (e.target.checked) {
        const newTheme = e.target.value;
        localStorage.setItem(THEME_KEY, newTheme);
        applyVisualTheme(newTheme);
      }
    });
  });

  // 3. System Preference Listener (for Auto mode)
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (localStorage.getItem(THEME_KEY) === "auto") {
        applyVisualTheme("auto");
      }
    });

  // --- Gameplay Settings ---

  // 1. Confirm Clear (Positive Logic: Checked = Ask)
  const confirmToggle = document.getElementById("confirm-clear-toggle");
  if (confirmToggle) {
    const updateToggleFromStorage = () => {
      // Stored as "jigsudo_skip_clear_confirm": "true" (Skip) or "false" (Ask)
      // Default: "false" (Ask) if missing
      const isSkipping = localStorage.getItem("jigsudo_skip_clear_confirm") === "true";
      confirmToggle.checked = !isSkipping;
    };

    updateToggleFromStorage();

    confirmToggle.addEventListener("change", async () => {
      const wantConfirmation = confirmToggle.checked;
      const shouldSkip = !wantConfirmation;
      localStorage.setItem("jigsudo_skip_clear_confirm", shouldSkip ? "true" : "false");

      // Sync to cloud if possible
      const { getCurrentUser } = await import("./auth.js?v=1.1.15");
      const { updateUserPreference } = await import("./db.js?v=1.1.15");
      const user = getCurrentUser();
      if (user && !user.isAnonymous) {
        // DB key: confirmClear (true = Ask, false = Skip)
        updateUserPreference(user.uid, "confirmClear", !shouldSkip);
      }
    });

    // Listen for cloud updates
    window.addEventListener("jigsudoSettingsUpdated", (e) => {
      if (e.detail.key === "confirmClear") {
        updateToggleFromStorage();
      }
    });
  }

  // 2. Sound Toggle
  const soundToggle = document.getElementById("sound-toggle");
  if (soundToggle) {
    // Force sound OFF and remove interactive logic
    soundToggle.checked = false;
    localStorage.setItem("jigsudo_sound", "false");
  }

  // 3. Vibration Toggle (Mobile Only)
  const vibToggle = document.getElementById("vibration-toggle");
  const vibContainer = document.getElementById("setting-vibration-container");

  // Strict check: API exists AND device is primarily touch (excludes Desktop)
  const hasVibration = "vibrate" in navigator;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  const showVibration = hasVibration && isTouchDevice;

  if (vibContainer) {
    if (!showVibration) {
      // Hide on non-mobile devices
      vibContainer.style.display = "none";
    } else {
      // Force vibration ON for mobile users, but keep the toggle disabled (via HTML)
      vibToggle.checked = true;
      localStorage.setItem("jigsudo_vibration", "true");
    }
  }
  // --- Header Info (Date & Challenge #) ---
  function updateHeaderInfo() {
    const dateEl = document.getElementById("current-date");
    const challengeEl = document.getElementById("challenge-num");

    if (!dateEl || !challengeEl) return;

    // Use Jigsudo Day (06:00 UTC Cutoff)
    const now = getJigsudoDate();
    const lang = getCurrentLang();
    const t = translations[lang];
    const locale = t ? t.date_locale : "es-ES";

    // Date - Evaluate shifted date as UTC to get consistent Jigsudo Day
    const dateStr = now.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
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
    // We use UTC components because 'now' (Jigsudo Date) was shifted to be UTC-aligned.
    const todayZero = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startZero = new Date(Date.UTC(2026, 3, 5)); // April 5, 2026 (Launch Day Shift/Reset #1)

    const diffTime = todayZero - startZero;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

    challengeEl.textContent = `#${String(diffDays).padStart(3, "0")}`;
  }

  updateHeaderInfo();

  // Listen for Language Changes to re-render date and rankings
  window.addEventListener("languageChanged", () => {
    updateHeaderInfo();
    refreshStartButton();
    // Re-render rankings to update localized decimal formatting
    if (typeof loadAndRenderAllRankings === "function") {
      loadAndRenderAllRankings();
    }
  });

  // Placeholders for other buttons
  // --- Home Tabs Logic ---
  const tabs = document.querySelectorAll(".tab-btn");
  const panelDaily = document.getElementById("panel-daily");
  const panelCustom = document.getElementById("panel-custom");
  // startBtn is already defined at line 11
  let currentMode = "daily"; // 'daily' | 'custom'

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab; // 'daily' or 'custom'

      // 1. Update Tabs styling
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // 2. Update Panels (Deck Logic)
      if (target === "daily") {
        currentMode = "daily";
        panelDaily.classList.add("active");
        panelCustom.classList.remove("active");
      } else {
        currentMode = "custom";
        panelCustom.classList.add("active");
        panelDaily.classList.remove("active");
      }

      // Update Start Button state based on the new mode and win status
      refreshStartButton();
    });
  });

  // --- Custom Mode: Difficulty Control ---
  const diffBtns = document.querySelectorAll(".seg-btn");
  diffBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      diffBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      console.log(`Difficulty set to: ${btn.dataset.diff}`);
    });
  });

  // Start Game Button Logic Update
  if (startBtn) {
    // Remove old listener (clone node trick or just use a flag if we can't remove anonymous)
    // Since we are inside initHome which runs once, we can just replace the logic
    // BUT startBtn already has a listener from lines 17-22.
    // Let's modify the existing listener or handling there.
    // For now, I'll assume I can just add a new one that checks logic,
    // but better to replace the previous block or use the variable.
  }

  // Re-implementing Start Button logic cleanly:
  // Using direct onclick assignment to avoid listener stacking/loss

  // Define handler
  const handleStart = async () => {
    if (currentMode === "daily") {
      console.log("Preparing Daily Game...");

      // Visual Feedback
      if (startBtn) {
        startBtn.textContent = "Cargando...";
        startBtn.disabled = true; // Prevent double-clicks
      }

      try {
        // Safety guard: if isWiping has been stuck for more than 10 seconds, force clear it
        if (gameManager.isWiping) {
          if (!gameManager._wipingStartTime) {
            gameManager._wipingStartTime = Date.now();
          } else if (Date.now() - gameManager._wipingStartTime > 10000) {
            console.error(
              "[Home] isWiping stuck for >10s, force clearing. This may indicate a bug.",
            );
            gameManager.isWiping = false;
            gameManager._wipingStartTime = null;
          }
        } else {
          gameManager._wipingStartTime = null;
        }

        if (gameManager.isWiping) {
          console.warn("[Home] Sync in progress. Blocking start.");
          return;
        }
        // 1. Refresh Seed & State (Ensures fresh date if tab was open)
        await gameManager.prepareDaily();

        // 2. Execute Start
        await gameManager.recordStart();
        await startDailyGame();

        // Note: startDailyGame hides home, so button state reset isn't strictly needed immediately,
        // but good practice if user comes back.
        if (startBtn) {
          startBtn.textContent =
            translations[getCurrentLang()]?.btn_start || "EMPEZAR";
          startBtn.disabled = false;
        }
      } catch (err) {
        console.error("Failed to start Daily Game", err);
        if (startBtn) {
          startBtn.textContent = "Error";
          startBtn.disabled = false;
        }
      }
    } else {
      console.log("Starting Custom Game...");
      alert("Modo Personalizado: ¡Configura tu juego! (Próximamente)");
    }
  };

  const handleViewResults = async () => {
    try {
      const stats = JSON.parse(
        localStorage.getItem("jigsudo_user_stats") || "{}",
      );
      const seedStr = getDailySeed().toString();
      const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      const todayStats = stats.history?.[today];

      if (todayStats) {
        // Adapt saved history stats to the format expected by showVictorySummary
        const sessionStats = {
          totalTime: todayStats.totalTime,
          score: todayStats.score,
          streak: stats.currentStreak,
          errors: todayStats.peaksErrors || 0,
          stageTimes: todayStats.stageTimes || {},
        };

        const { showVictorySummary } = await import("./ui.js?v=1.1.15");
        showVictorySummary(sessionStats, true);
      }
    } catch (e) {
      console.error("Failed to view results:", e);
    }
  };

  // Check if daily puzzle is already won
  const checkDailyWin = () => {
    try {
      const stats = JSON.parse(
        localStorage.getItem("jigsudo_user_stats") || "{}",
      );
      // ALWAYS use the actual today's seed for the button state
      const realTodaySeed = getDailySeed();
      const seedStr = realTodaySeed.toString();
      const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;

      const isWon = stats.history?.[today]?.status === "won";
      console.log(`[Home Debug] Checking Daily Win for ${today}:`, {
        isWon,
        historyEntry: stats.history?.[today],
        seed: realTodaySeed,
      });
      return isWon;
    } catch (e) {
      console.error("[Home Debug] Error checking daily win", e);
      return false;
    }
  };

  const refreshStartButton = () => {
    if (!startBtn) return;
    const isWon = checkDailyWin();
    console.log(
      `[Home Debug] refreshStartButton called. isWon=${isWon}, mode=${currentMode}`,
    );
    const lang = getCurrentLang();

    if (isWon && currentMode === "daily") {
      startBtn.dataset.i18n = "btn_view_results";
      startBtn.textContent =
        translations[lang]?.btn_view_results || "Ver Resultado";
      startBtn.disabled = false;
      startBtn.classList.add("btn-won");
      startBtn.onclick = handleViewResults;
    } else {
      startBtn.dataset.i18n =
        currentMode === "daily" ? "btn_start" : "btn_coming_soon";
      startBtn.textContent = translations[lang]
        ? translations[lang][startBtn.dataset.i18n]
        : currentMode === "daily"
          ? "EMPEZAR"
          : "PRÓXIMAMENTE";
      startBtn.disabled = currentMode !== "daily";
      startBtn.classList.remove("btn-won");
      startBtn.onclick = handleStart;
    }
  };

  // Initial State
  refreshStartButton();

  // --- Day Transition Logic ---
  const refreshAllDayData = () => {
    console.log("[Home] Day transition detected. Refreshing UI elements...");
    updateHeaderInfo();
    refreshStartButton();
    loadAndRenderAllRankings(true);
  };

  // 1. Listen for GameManager detection (Visibility change / Refocus)
  window.addEventListener("jigsudoDayChanged", refreshAllDayData);

  // 2. Real-time timer: Unlock exactly at 06:00 UTC if user stays on page
  const setupJigsudoDayTimer = () => {
    const now = new Date();
    const nextReset = new Date(now);
    // Find next 06:00 UTC
    nextReset.setUTCHours(6, 0, 0, 0);
    if (nextReset <= now) {
      nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    }

    const msUntilReset = nextReset.getTime() - now.getTime();
    console.log(`[Home] Next Jigsudo Day in ${Math.round(msUntilReset / 1000 / 60)} minutes.`);

    setTimeout(async () => {
      console.log("Jigsudo Day Cutoff reached! Refreshing state.");

      // Mid-game Safety: Don't auto-refresh the manager if the user is in a game
      const isAtGame = isAtGameRoute();
      if (isAtGame) {
        console.log(
          "[Home] 06:00 UTC reached, but user is playing. Refreshing only after return to home.",
        );
        // We still schedule the next one, but we don't call prepareDaily yet
        setupJigsudoDayTimer();
        return;
      }

      // Trigger Manager to fetch new puzzle
      await gameManager.prepareDaily();
      refreshAllDayData();
      // Schedule the next one
      setupJigsudoDayTimer();
    }, msUntilReset + 1000); // 1s buffer
  };
  setupJigsudoDayTimer();

  // Home Navigation (Inicio Button)
  const navHome = document.getElementById("nav-home");
  if (navHome) {
    navHome.addEventListener("click", async () => {
      // Use Router instead of reload to preserve cache and go to canonical #home
      const { router } = await import("./router.js?v=1.1.15");
      router.navigateTo("#home");
    });
  }

  // Remove Home Navigation from Title
  const appTitle = document.querySelector(".app-title text, .app-title");
  if (appTitle) {
    appTitle.style.cursor = "default";
  }

  // --- Ranking Logic ---
  const containerDaily = document.getElementById("ranking-daily-wrapper");
  const containerMonthly = document.getElementById("ranking-monthly-wrapper");
  const containerAllTime = document.getElementById("ranking-alltime-wrapper");
  const refreshBtn = document.getElementById("btn-refresh-ranking");

  let currentRankings = null;

  // Helper to toggle spinner on headers
  const toggleHeaderSpinner = (wrapper, isLoading) => {
    if (!wrapper) return;
    const header = wrapper.previousElementSibling; // The <h4>
    if (header && header.tagName === "H4") {
      if (isLoading) header.classList.add("ranking-loading");
      else header.classList.remove("ranking-loading");
    }
  };

  let rankingLoading = false;
  async function loadAndRenderAllRankings(force = false) {
    if (rankingLoading) return;
    rankingLoading = true;
    // Update Monthly Rank Label dynamically (at the start to avoid "Mes/Month" flash)
    const monthHeader = document.getElementById("ranking-month-header");
    if (monthHeader) {
      const lang = getCurrentLang() || "es";
      const monthName = new Date().toLocaleDateString(lang, {
        month: "long",
      });
      const capitalized =
        monthName.charAt(0).toUpperCase() + monthName.slice(1);
      monthHeader.textContent = capitalized;
    }

    // Only clear if empty (first load)
    if (containerDaily && !containerDaily.hasChildNodes())
      containerDaily.innerHTML = '<div class="loader-small"></div>';
    else toggleHeaderSpinner(containerDaily, true);

    if (containerMonthly && !containerMonthly.hasChildNodes())
      containerMonthly.innerHTML = '<div class="loader-small"></div>';
    else toggleHeaderSpinner(containerMonthly, true);

    if (containerAllTime && !containerAllTime.hasChildNodes())
      containerAllTime.innerHTML = '<div class="loader-small"></div>';
    else toggleHeaderSpinner(containerAllTime, true);

    // Also spin the main refresh button
    if (refreshBtn) refreshBtn.classList.add("spinning");

    try {
      currentRankings = await fetchRankings(force);

      // Verify that we still want to render this version (prevent race conditions)
      // Actually, since we use await, they run sequentially if not careful.
      // But multiple calls can overlap.
      renderRankings(containerDaily, currentRankings, "daily");
      renderRankings(containerMonthly, currentRankings, "monthly");
      renderRankings(containerAllTime, currentRankings, "allTime");
    } catch (err) {
      console.error("[Home] Error loading rankings:", err);
    } finally {
      // Create artificial delay if it was too fast, just to show the spinner?
      // No, fast is good. Just cleanup.
      toggleHeaderSpinner(containerDaily, false);
      toggleHeaderSpinner(containerMonthly, false);
      toggleHeaderSpinner(containerAllTime, false);
      if (refreshBtn) refreshBtn.classList.remove("spinning");
      rankingLoading = false;
    }
  }

  // --- Lazy Loading Rankings ---
  let rankingsInitialized = false;

  const observerOptions = {
    root: null,
    rootMargin: "0px 0px 200px 0px", // Pre-load when 200px from viewport
    threshold: 0.1,
  };

  const rankingObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !rankingsInitialized) {
        console.log("[Home] Ranking area visible, initializing load...");
        rankingsInitialized = true;
        loadAndRenderAllRankings(false);
        // We can stop observing after first load if we want, 
        // but keeping it doesn't hurt much.
        rankingObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  if (containerDaily) {
    rankingObserver.observe(containerDaily);
  }

  // Refresh Listener
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadAndRenderAllRankings(true);
    });
  }

  // Listen for auth state initialization to re-render rankings with user highlighting
  // This ensures the current user's row is highlighted from the first load
  // Listen for auth state initialization to re-render rankings with user highlighting
  // Cache is smart enough to invalidate if user changed, so we don't need to force true blindly.
  window.addEventListener("authReady", () => {
    if (rankingsInitialized) {
      console.log(
        "[Home] Auth ready, re-rendering rankings (checking cache user match)",
      );
      loadAndRenderAllRankings(false);
    }
  });

  // Listen for Language Changes to refresh rankings & button state
  window.addEventListener("languageChanged", () => {
    if (rankingsInitialized) {
      console.log("[Home] Language changed, refreshing UI...");
      refreshStartButton();
      loadAndRenderAllRankings(false); // Refreshes tables with new lang formatting
    } else {
      refreshStartButton(); // Always refresh button text
    }
  });

  // --- Router & Game Events (Moved out of showHome) ---

  // Listen for Router Changes
  window.addEventListener("routeChanged", ({ detail }) => {
    if (detail.hash === "" || detail.hash === "#" || detail.hash === "#home") {
      updateHeaderInfo();
      refreshStartButton();

      // Day Transition Safety: If the user returns from a game that crossed the cutoff boundary,
      // refresh the manager now.
      const actualSeed = getDailySeed();
      if (gameManager.currentSeed !== actualSeed && !gameManager.isReplay) {
        console.log("[Home] Day transition detected upon returning to menu.");
        gameManager.prepareDaily().then(() => {
          refreshAllDayData();
        });
      } else {
        // Normal refresh
        if (rankingsInitialized) {
          loadAndRenderAllRankings();
        }
      }

      const debugBtn = document.getElementById("debug-help-btn");
      if (debugBtn) debugBtn.style.display = "none";
    }

    // Explicitly handle #game route to initialize game logic if needed
    if (detail.baseRoute === "#game" || (detail.baseRoute === "#history" && detail.params.length === 3)) {
      // Auto-condense header on mobile to maximize game space
      if (window.matchMedia("(max-width: 768px)").matches) {
        window.scrollTo(0, 0);
        document.body.classList.add("no-scroll");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document.body.classList.add("header-condensed");
          });
        });
      }

      if (detail.baseRoute === "#history" && detail.params.length === 3) {
        // Replay/History Mode
        const [y, m, d] = detail.params;
        const dateStr = `${y}-${m}-${d}`;
        
        // Puzzle existence validation
        if (!isPuzzleAvailable(dateStr)) {
          // If the index isn't loaded yet, it might be a direct entry.
          // For now, we assume history module will handle the index, 
          // but we can add a fallback alert if we know it's missing.
          console.warn(`[Home] Checking puzzle existence for ${dateStr}...`);
          // We can't easily wait for history.js index here if not yet fetched.
          // But usually by the time routeChanged fires for a deep link, 
          // history module has already run its init and update.
        }

        gameManager.loadSpecificDay(dateStr).then(success => {
          if (success) {
            startDailyGame();
          } else {
            const lang = getCurrentLang();
            const t = translations[lang] || translations["es"];
            // Specific message with day
            const errorMsg = (t.error_missing_puzzle_day || "No hay partida disponible para el día {day}.").replace("{day}", d);
            showAlertModal(t.sidebar_history || "Historial", errorMsg);
            
            // Redirect to month view instead of generic history
            window.location.hash = `#history/${y}/${m}`;
          }
        });
      } else {
        // Normal Daily
        gameManager.prepareDaily().then(() => {
          startDailyGame();
        });
      }
    } else {
      // Cleanup game-specific mobile classes
      document.body.classList.remove("no-scroll");
    }
  });

  // Listen for Game Completion to force refresh ranking even if cache is fresh
  window.addEventListener("gameCompleted", async () => {
    console.log("[Home] Game completed. Refreshing rankings & button state.");
    rankingsInitialized = true; // Mark as initialized so it keeps updating
    
    // REDUNDANCY: Ensure cache is dead
    const { clearRankingCache } = await import("./ranking.js?v=1.1.15");
    clearRankingCache();
    
    // Add micro-delay to let Firestore settle (optional but safer for eventual consistency)
    setTimeout(() => {
      loadAndRenderAllRankings(true);
      refreshStartButton(); // Force button update immediately
    }, 500);
  });
}

let isStarting = false;

/**
 * Universal function to start/resume a daily game
 * (Can be called from Home or History)
 */
export async function startDailyGame() {
  if (isStarting) return;
  isStarting = true;

  try {
    if (gameManager.isWiping) {
      console.warn("[Home] Sync in progress. Blocking start.");
      return;
    }

    if (CONFIG.betaMode) document.body.classList.add("beta-mode");

    // 2. Set Hash for robust routing (let Router toggle visibility)
    // ONLY if we aren't already in a history deep link
    const currentHash = window.location.hash;
    const isHistoryDeepLink = currentHash.startsWith("#history/") && currentHash.split("/").length === 4;

    if (!isHistoryDeepLink && currentHash !== "#game") {
      window.location.hash = "#game";
    }

    // 3. Optional: Reset Sidebar active state
    updateSidebarActiveState(null);

    // 4. Hide Footer in game
    const footer = document.querySelector(".main-footer");
    if (footer) footer.classList.add("hidden");

    // 3. Load Memory/Stage logic
    const state = gameManager.getState();
    const currentStage = state.progress.currentStage || "memory";
    const module = await import("./memory.js?v=1.1.15");

    if (currentStage === "memory") {
      module.initMemoryGame();
    } else {
      console.log(`[Home] Resuming session at stage: ${currentStage}`);
      if (module.resumeToStage) {
        module.resumeToStage(currentStage);
      } else {
        module.initMemoryGame();
      }
    }
  } catch (err) {
    console.error("[Home] Failed to start Daily Game:", err);
  } finally {
    isStarting = false;
  }
}

// Auto-init Home Logic
// Auto-init removed. main.js handles this.
// initHome();
