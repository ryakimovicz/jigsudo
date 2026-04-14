import { getCurrentLang, updateTexts } from "./i18n.js?v=1.5.55";
import { translations } from "./translations.js?v=1.5.55";
import { gameManager } from "./game-manager.js?v=1.5.55";
import { startDailyGame } from "./home.js?v=1.5.55";
import { updateSidebarActiveState } from "./sidebar.js?v=1.5.55";
import { router } from "./router.js?v=1.5.55";

import { getJigsudoDate } from "./utils/time.js?v=1.5.55";
import { isAtGameRoute } from "./utils/route-utils.js?v=1.5.55";

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

  // v1.4.7: Real-time Sync & Initialization Listeners
  window.addEventListener("authReady", () => {
    if (window.location.hash.startsWith("#history")) {
      console.log("[History] Auth ready. Triggering UI update...");
      updateHistoryUI();
    }
  });

  window.addEventListener("userStatsUpdated", () => {
    if (window.location.hash.startsWith("#history")) {
      console.log("[History] Stats updated from cloud. Refreshing calendar...");
      historyCache = {}; // Invalidate cache to force fresh Firestore fetch
      updateHistoryUI();
    }
  });

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

let historyCache = {}; // { "YYYY-MM": { date: data } }

export async function updateHistoryUI() {
  const year = histViewDate.getUTCFullYear();
  const month = histViewDate.getUTCMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  
  const now = getJigsudoDate();

  // 1. Fetch available puzzles index
  const availableDates = await fetchPuzzleIndex();
  puzzleExistsCache = {};
  
  if (availableDates.length > 0) {
    const sorted = availableDates.map(d => new Date(d + "T00:00:00Z")).sort((a,b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    minNavMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    maxNavMonth = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
    
    availableDates.forEach(date => {
      puzzleExistsCache[date] = true;
    });

    if (histViewDate < minNavMonth) histViewDate = new Date(minNavMonth);
    if (histViewDate > maxNavMonth) histViewDate = new Date(maxNavMonth);
  }

  // 2. Fetch History for the current month from Sub-collection
  let monthHistory = historyCache[monthKey];
  if (!monthHistory) {
      console.log(`[History] Fetching history for ${monthKey} from Firestore...`);
      const { auth } = await import("./firebase-config.js?v=1.5.55");
      const { getFirestore, collection, query, where, getDocs, doc } = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
      
      const user = auth.currentUser;
      if (user) {
          const db = getFirestore();
          // Seed range for the month: YYYYMM01 to YYYYMM31
          const startSeed = parseInt(monthKey.replace(/-/g, "") + "01");
          const endSeed = parseInt(monthKey.replace(/-/g, "") + "31");
          
          const q = query(
              collection(db, "users", user.uid, "history"),
              where("seed", ">=", startSeed),
              where("seed", "<=", endSeed)
          );
          
          const snap = await getDocs(q);
          monthHistory = {};
          snap.forEach(d => {
              const data = d.data();
              const s = data.seed.toString();
              const dateStr = `${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}`;
              
              monthHistory[dateStr] = {
                  status: data.status || "played",
                  originalWon: data.original?.won === true,
                  hasOriginal: !!data.original,
                  score: data.best?.score || 0,
                  totalTime: data.best?.totalTime || 0,
                  original: data.original || null,
                  best: data.best || null
              };
          });
          historyCache[monthKey] = monthHistory;
      } else {
          monthHistory = {};
      }
  }

  updateNavButtonsState();
  renderHistoryCalendar(monthHistory);
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

    // Today restriction: Only allow Today if already won
    const isToday = dateStr === todayStr;
    const dayData = history[dateStr];
    const isCompleted = dayData?.status === "won";

    if (isFuture || !exists) {
      dayEl.classList.add("disabled");
      dayEl.style.opacity = "0.3";
      dayEl.style.pointerEvents = "none";
    } else {
      // Past or Today (Available puzzles)
      if (isToday && !isCompleted) {
        dayEl.classList.add("disabled");
        dayEl.style.opacity = "0.3";
        // REMOVED pointerEvents = "none" to allow today's tooltip
      }
      // Check History Status
      if (dayData) {
        // 1. BACKGROUND COLORS (Original performance anchor)
        if (dayData.originalWon) {
          // Green: Won on the original day
          dayEl.classList.add("win");
        } else if (dayData.hasOriginal && !dayData.originalWon) {
          // Yellow: Started but not finished on the original day
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

      // v1.5.62: Attach dynamic tooltips
      attachCalendarTooltip(dayEl, dayData, dateStr);

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

/**
 * v1.5.62: Floating Tooltip Logic
 */
export function attachCalendarTooltip(el, dayData, dateStr) {
  // Always attach if day existed in the past

  el.addEventListener("mouseenter", (e) => {
    showHistoryTooltip(e, dayData, dateStr);
  });

  el.addEventListener("mousemove", (e) => {
    updateHistoryTooltipPosition(e);
  });

  el.addEventListener("mouseleave", () => {
    hideHistoryTooltip();
  });
}

function showHistoryTooltip(e, data, dateStr) {
  const tooltip = document.getElementById("history-tooltip");
  if (!tooltip) return;

  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];

  // Format Date for Title
  const dateObj = new Date(dateStr + "T12:00:00Z");
  const dateTitle = dateObj.toLocaleDateString(lang, { day: "numeric", month: "long" });

  // v1.5.62: Dynamic title color matching the day status
  let titleColor = "#94a3b8"; // Gray (Sin jugar)
  if (data) {
    if (data.originalWon) titleColor = "#22c55e"; // Green
    else if (data.hasOriginal) titleColor = "#eab308"; // Yellow
    else if (data.status === "won") titleColor = "#4ade80"; // Aqua/Crown
  }

  let html = `<div class="tooltip-title" style="color: ${titleColor}; border-bottom-color: ${titleColor}22">
    <span>${dateTitle}</span>
    ${data?.status === "won" ? "<span>👑</span>" : ""}
  </div>`;

  // Helper for formatting time
  const fmt = (ms) => {
    if (!ms || ms < 0) return "--:--";
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // 0. Empty Fallback
  if (!data || (!data.original && !data.best)) {
    html += `<div style="color: var(--text-muted); font-size: 0.8rem; padding: 10px 0; text-align: center;">
      ${t.history_no_stat || "Sin estadísticas registradas"}
    </div>`;
  } else {
    // 1. Original Section
    if (data.original) {
      const o = data.original;
      html += `<div class="tooltip-section">
        <span class="tooltip-section-title">${t.stats_original || "Desempeño Original"}</span>
        <div class="tooltip-grid">
          <span class="tooltip-label">${lang === 'es' ? 'Puntaje' : 'Score'}:</span>
          <span class="tooltip-value highlight">${(o.score || 0).toFixed(3)} RP</span>
          <span class="tooltip-label">${lang === 'es' ? 'Tiempo' : 'Time'}:</span>
          <span class="tooltip-value">${fmt(o.totalTime)}</span>
          <span class="tooltip-label">${lang === 'es' ? 'Errores' : 'Errors'}:</span>
          <span class="tooltip-value">${o.peaksErrors || 0}</span>
        </div>
      </div>`;
    }

    // 2. Best Section
    if (data.best) {
      const b = data.best;
      html += `<div class="tooltip-section">
        <span class="tooltip-section-title">${t.stats_best || "Mejor Histórico"}</span>
        <div class="tooltip-grid">
          <span class="tooltip-label">${lang === 'es' ? 'Puntaje' : 'Score'}:</span>
          <span class="tooltip-value highlight">${(b.score || 0).toFixed(3)} RP</span>
          <span class="tooltip-label">${lang === 'es' ? 'Tiempo' : 'Time'}:</span>
          <span class="tooltip-value">${fmt(b.totalTime)}</span>
        </div>
      </div>`;
    }
  }

  tooltip.innerHTML = html;
  tooltip.classList.remove("hidden");
  updateHistoryTooltipPosition(e);
}

function updateHistoryTooltipPosition(e) {
  const tooltip = document.getElementById("history-tooltip");
  if (!tooltip || tooltip.classList.contains("hidden")) return;

  const xOffset = 20;
  const yOffset = 20;
  let left = e.clientX + xOffset;
  let top = e.clientY + yOffset;

  // Screen overflow protection
  const rect = tooltip.getBoundingClientRect();
  if (left + rect.width > window.innerWidth) {
    left = e.clientX - rect.width - xOffset;
  }
  if (top + rect.height > window.innerHeight) {
    top = e.clientY - rect.height - yOffset;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideHistoryTooltip() {
  const tooltip = document.getElementById("history-tooltip");
  if (tooltip) tooltip.classList.add("hidden");
}
