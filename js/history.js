import { getCurrentLang, updateTexts } from "./i18n.js";
import { translations } from "./translations.js";
import { gameManager } from "./game-manager.js";
import { startDailyGame } from "./home.js";
import { updateSidebarActiveState } from "./sidebar.js";

export let histViewDate = new Date();
let puzzleExistsCache = {};

async function checkPuzzleExists(dateStr) {
  if (puzzleExistsCache[dateStr] !== undefined)
    return puzzleExistsCache[dateStr];
  try {
    const url = `public/puzzles/daily-${dateStr}.json`;
    const response = await fetch(url, { method: "HEAD" });
    puzzleExistsCache[dateStr] = response.ok;
    return response.ok;
  } catch (e) {
    puzzleExistsCache[dateStr] = false;
    return false;
  }
}

export function initHistory() {
  console.log("[History] Initializing...");

  const prevBtn = document.getElementById("hist-prev-btn");
  const nextBtn = document.getElementById("hist-next-btn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      const minDate = new Date(2026, 1, 1); // Feb 2026
      const prevDate = new Date(histViewDate);
      prevDate.setMonth(prevDate.getMonth() - 1);
      if (prevDate >= minDate) {
        changeHistMonth(-1);
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextDate = new Date(histViewDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
      if (nextDate <= currentMonth) {
        changeHistMonth(1);
      }
    });
  }

  // Handle Initial Hash - handled by router.js
  // Listen for Router Changes
  window.addEventListener("routeChanged", ({ detail }) => {
    if (detail.hash === "#history") {
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
      window.location.hash = "history";
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
    hash === "#game" ||
    hash === "#info" ||
    hash === "#privacy" ||
    hash === "#terms";

  if (!isInternalRouting) {
    document.body.classList.add("home-active");
    document.getElementById("menu-content")?.classList.remove("hidden");
  }
}

export async function updateHistoryUI() {
  const stats = gameManager.stats ||
    JSON.parse(localStorage.getItem("jigsudo_user_stats")) || { history: {} };

  const year = histViewDate.getFullYear();
  const month = histViewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now = new Date();

  // First puzzle was generated on Feb 5, 2026 - skip earlier dates
  const FIRST_PUZZLE_DATE = new Date(2026, 1, 5); // Month is 0-indexed

  // Probe current month puzzles (only for dates where puzzles exist)
  const probes = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    if (dateObj > now) continue; // Skip future dates
    if (dateObj < FIRST_PUZZLE_DATE) continue; // Skip dates before first puzzle
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    probes.push(checkPuzzleExists(dateStr));
  }
  await Promise.all(probes);

  renderHistoryCalendar(stats.history);
}

function changeHistMonth(delta) {
  histViewDate.setMonth(histViewDate.getMonth() + delta);
  updateHistoryUI();
}

function renderHistoryCalendar(history = {}) {
  const grid = document.getElementById("history-grid-container");
  const label = document.getElementById("hist-month-label");
  if (!grid) return;

  grid.innerHTML = "";

  const year = histViewDate.getFullYear();
  const month = histViewDate.getMonth();
  const locale = getCurrentLang() || "es-ES";

  // Month Label
  const monthName = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
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

  // Logic for dates
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  // Padding
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    grid.appendChild(empty);
  }

  // Today for limit
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dateObj = new Date(year, month, d);

    const dayEl = document.createElement("div");
    dayEl.className = "calendar-day";
    dayEl.textContent = d;

    const isFuture = dateObj > now;
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
          // If it's a win but NOT original, it stays neutral background (or we could add a light style)
          // But per user: "color original"
        } else {
          dayEl.classList.add("loss");
        }

        // DOT MARKER (Any completion)
        if (dayData.status === "won") {
          const dot = document.createElement("span");
          dot.className = "completed-dot";
          dayEl.appendChild(dot);
        }
      }

      dayEl.addEventListener("click", async () => {
        await gameManager.loadSpecificDay(dateStr);
        await startDailyGame();
      });
    }

    grid.appendChild(dayEl);
  }
}
