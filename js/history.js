import { getCurrentLang, updateTexts } from "./i18n.js?v=1.1.18";
import { translations } from "./translations.js?v=1.1.18";
import { gameManager } from "./game-manager.js?v=1.1.18";
import { startDailyGame } from "./home.js?v=1.1.18";
import { updateSidebarActiveState } from "./sidebar.js?v=1.1.18";
import { router } from "./router.js?v=1.1.18";

import { getJigsudoDate } from "./utils/time.js?v=1.1.18";
import { isAtGameRoute } from "./utils/route-utils.js?v=1.1.18";

export let histViewDate = getJigsudoDate();
let puzzleExistsCache = {};
let minNavMonth = null; // Store as Date(Y, M, 1)
let maxNavMonth = null; // Store as Date(Y, M, 1)

async function checkPuzzleExists(dateStr) {
  if (puzzleExistsCache[dateStr] !== undefined)
    return puzzleExistsCache[dateStr];
  
  // We now rely on the pre-fetched index in updateHistoryUI
  // If it's not in the cache by now, it doesn't exist.
  return false;
}

export async function fetchPuzzleIndex() {
  try {
    const response = await fetch("public/puzzles/index.json");
    if (!response.ok) return [];
    return await response.json();
  } catch (e) {
    console.warn("[History] Could not fetch puzzle index, falling back to empty.");
    return [];
  }
}

export function isPuzzleAvailable(dateStr) {
  return !!puzzleExistsCache[dateStr];
}

export function initHistory() {
  console.log("[History] Initializing...");

  const prevBtn = document.getElementById("hist-prev-btn");
  const nextBtn = document.getElementById("hist-next-btn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (minNavMonth) {
        const prevDate = new Date(histViewDate);
        prevDate.setMonth(prevDate.getMonth() - 1);
        if (prevDate >= minNavMonth) {
          changeHistMonth(-1);
        }
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (maxNavMonth) {
        const nextDate = new Date(histViewDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
        if (nextDate <= maxNavMonth) {
          changeHistMonth(1);
        }
      }
    });
  }

  // Handle Initial Hash - handled by router.js
  // Listen for Router Changes
  window.addEventListener("routeChanged", ({ detail }) => {
    if (detail.baseRoute === "#history") {
      // If we have exactly 3 params (YYYY/MM/DD), skip calendar normalization as it's a deep-link to a game.
      if (detail.params.length === 3) return;

      const [yearStr, monthStr] = detail.params || [];
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1; // 0-indexed internally

      const now = getJigsudoDate();
      let isValidDate = false;

      if (!isNaN(year) && !isNaN(month) && month >= 0 && month <= 11) {
        const reqDate = new Date(year, month, 1);
        
        // If limits aren't loaded yet, we can't fully validate. 
        // But we'll let it slide and let updateHistoryUI normalize it later.
        if (!minNavMonth || (reqDate >= minNavMonth && reqDate <= maxNavMonth)) {
          histViewDate = reqDate;
          isValidDate = true;
        }
      }

      if (!isValidDate) {
        histViewDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentY = histViewDate.getFullYear();
        const currentM = String(histViewDate.getMonth() + 1).padStart(2, "0");
        history.replaceState(null, null, `/#history/${currentY}/${currentM}`);
      }

      updateHistoryUI(); // Refresh list
    }
  });

  // Listen for Language Changes
  window.addEventListener("languageChanged", () => {
    updateHistoryUI();
  });

  // Sidebar link listener (if not already handled by hash)
  const navHistory = document.getElementById("nav-history");
  if (navHistory) {
    navHistory.addEventListener("click", () => {
      router.navigateTo("#history");
    });
  }
}

export function showHistoryUI() {
  const section = document.getElementById("history-section");
  const homeContent = document.getElementById("menu-content");
  const gameSection = document.getElementById("game-section");
  const profileSection = document.getElementById("profile-section");

  if (section) section.classList.remove("hidden");
  if (homeContent) homeContent.classList.add("hidden");
  if (gameSection) gameSection.classList.add("hidden");
  if (profileSection) profileSection.classList.add("hidden");
  document.getElementById("info-section")?.classList.add("hidden");

  document.body.classList.add("history-active");
  updateSidebarActiveState("nav-history");
  updateHistoryUI();
}

export function hideHistoryUI() {
  const section = document.getElementById("history-section");
  if (section) section.classList.add("hidden");
  document.body.classList.remove("history-active");

  const hash = window.location.hash;
  const isInternalRouting =
    hash === "#profile" ||
    hash === "#guide" ||
    isAtGameRoute() ||
    hash === "#info";

  if (!isInternalRouting) {
    document.body.classList.add("home-active");
    document.getElementById("menu-content")?.classList.remove("hidden");
  }
}

export async function updateHistoryUI() {
  const stats = gameManager.stats ||
    JSON.parse(localStorage.getItem("jigsudo_user_stats")) || { history: {} };

  const year = histViewDate.getUTCFullYear();
  const month = histViewDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const now = getJigsudoDate();

  // Pre-fetch the exact list of available puzzles to avoid 404 errors in console
  const availableDates = await fetchPuzzleIndex();
  puzzleExistsCache = {}; // Reset for current view
  
  if (availableDates.length > 0) {
    // Determine Limits using UTC consistently
    const sorted = availableDates.map(d => new Date(d + "T00:00:00Z")).sort((a,b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    
    minNavMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    maxNavMonth = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
    
    availableDates.forEach(date => {
      puzzleExistsCache[date] = true;
    });

    // Normalize current view if it's now out of bounds
    if (histViewDate < minNavMonth) histViewDate = new Date(minNavMonth);
    if (histViewDate > maxNavMonth) histViewDate = new Date(maxNavMonth);
  } else {
    // Full fallback
    const n = getJigsudoDate();
    minNavMonth = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
    maxNavMonth = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
  }

  updateNavButtonsState();
  renderHistoryCalendar(stats.history);
}

function updateNavButtonsState() {
  const prevBtn = document.getElementById("hist-prev-btn");
  const nextBtn = document.getElementById("hist-next-btn");
  if (!prevBtn || !nextBtn) return;

  const year = histViewDate.getUTCFullYear();
  const month = histViewDate.getUTCMonth();

  // Min limit: First month with puzzles (using UTC comparison)
  const isMinMonth = minNavMonth && (year === minNavMonth.getUTCFullYear() && month === minNavMonth.getUTCMonth());
  prevBtn.classList.toggle("disabled", isMinMonth);

  // Max limit: Last month with puzzles
  const isMaxMonth = maxNavMonth && (year === maxNavMonth.getUTCFullYear() && month === maxNavMonth.getUTCMonth());
  nextBtn.classList.toggle("disabled", isMaxMonth);
}

function changeHistMonth(delta) {
  // Guard against navigating past limits if clicked despite CSS disabled
  const year = histViewDate.getUTCFullYear();
  const month = histViewDate.getUTCMonth();

  if (delta === -1 && minNavMonth && (year === minNavMonth.getUTCFullYear() && month === minNavMonth.getUTCMonth())) return;
  if (delta === 1 && maxNavMonth && (year === maxNavMonth.getUTCFullYear() && month === maxNavMonth.getUTCMonth())) return;

  const targetDate = new Date(histViewDate);
  targetDate.setUTCMonth(targetDate.getUTCMonth() + delta);

  const targetY = targetDate.getUTCFullYear();
  const targetM = String(targetDate.getUTCMonth() + 1).padStart(2, "0");

  // Update URL to trigger routeChange
  window.location.hash = `#history/${targetY}/${targetM}`;
}

function renderHistoryCalendar(history = {}) {
  const grid = document.getElementById("history-grid-container");
  const label = document.getElementById("hist-month-label");
  if (!grid) return;

  grid.innerHTML = "";

  const year = histViewDate.getUTCFullYear();
  const month = histViewDate.getUTCMonth();
  const locale = getCurrentLang() || "es-ES";

  // Month Label
  const monthName = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC", // Crucial: ensure label reflects UTC month/year
  }).format(histViewDate);
  if (label) {
    label.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  }

  // Headers
  const isEnglish = locale.startsWith("en");
  const formatterHeaders = new Intl.DateTimeFormat(locale, {
    weekday: isEnglish ? "short" : "narrow",
  });

  for (let i = 0; i < 7; i++) {
    const d = new Date(2025, 0, 5 + i);
    let dayName = formatterHeaders.format(d).toUpperCase();
    if (isEnglish) dayName = dayName.slice(0, 2);
    const el = document.createElement("div");
    el.className = "calendar-day header-day";
    el.innerText = dayName;
    grid.appendChild(el);
  }

  // Logic for dates (using UTC midnight for cells)
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();

  // Padding
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    grid.appendChild(empty);
  }

  // Today for limit (using UTC methods)
  const now = getJigsudoDate();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateObj = new Date(Date.UTC(year, month, d));

    const dayEl = document.createElement("div");
    dayEl.className = "calendar-day";
    dayEl.textContent = d;

    // Use UTC timestamps for accurate "Future" comparison
    const isFuture = dateObj.getTime() > now.getTime();
    const exists = puzzleExistsCache[dateStr];

    if (isFuture || !exists) {
      dayEl.classList.add("disabled");
      dayEl.style.opacity = "0.3";
      dayEl.style.pointerEvents = "none";
    } else {
      // Check History Status
      const dayData = history[dateStr];
      if (dayData) {
        // BACKGROUND COLORS (Original performance)
        if (dayData.originalWin) {
          dayEl.classList.add("win");
        } else if (dayData.status === "won") {
          // If it's a win but NOT original, it stays neutral background
        } else if (dayData.status === "played") {
          dayEl.classList.add("loss");
        }

        // DOT MARKER (Any completion)
        if (dayData.status === "won") {
          const dot = document.createElement("span");
          dot.className = "completed-dot";
          dot.textContent = "👑"; // Use crown emoji instead of dot
          dayEl.appendChild(dot);
        }
      }

      dayEl.addEventListener("click", () => {
        const isToday = dateStr === todayStr;
        const isCompleted = dayData && dayData.status === "won";

        // Per user request:
        // game should be #game only if it is today AND not completed.
        // Otherwise, use deep-link with date.
        if (isToday && !isCompleted) {
          window.location.hash = "#game";
        } else {
          const y = dateObj.getUTCFullYear();
          const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
          const dStr = String(dateObj.getUTCDate()).padStart(2, "0");
          window.location.hash = `#history/${y}/${m}/${dStr}`;
        }
      });
    }

    grid.appendChild(dayEl);
  }
}
