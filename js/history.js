import { getCurrentLang, updateTexts } from "./i18n.js";
import { translations } from "./translations.js";
import { gameManager } from "./game-manager.js";
import { startDailyGame } from "./home.js";
import { updateSidebarActiveState } from "./sidebar.js";
import { router } from "./router.js";

import { getJigsudoDate } from "./utils/time.js";
import { isAtGameRoute } from "./utils/route-utils.js";
import { formatTime } from "./ui.js";
import { CONFIG } from "./config.js";

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
  // v1.9.9m: Skip fetch in Demo mode to avoid 403 console noise on Itch.io
  if (CONFIG.isDemo) {
    console.log("[History] Demo mode detected. Using local puzzle index directly.");
    try {
      const { default: index } = await import("./puzzles_index.js");
      return index;
    } catch (err) {
      return [];
    }
  }

  try {
    const response = await fetch("public/puzzles/index.json");
    if (!response.ok) throw new Error("Fetch failed");
    return await response.json();
  } catch (e) {
    console.warn("[History] Could not fetch puzzle index, using ES module fallback.");
    try {
      const { default: index } = await import("./puzzles_index.js");
      return index;
    } catch (err) {
      console.error("[History] Fatal: No puzzle index available.", err);
      return [];
    }
  }
}

export function isPuzzleAvailable(dateStr) {
  if (CONFIG.isDemo) {
    return dateStr === CONFIG.demoDate;
  }
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

  // v1.9.0: Listen for history-specific updates (e.g., winning a game from history)
  window.addEventListener("jigsudoHistoryUpdated", () => {
    console.log("[History] History record updated. Refreshing...");
    historyCache = {}; 
    if (window.location.hash.startsWith("#history")) {
      updateHistoryUI();
    }
  });

  // Handle Initial Hash - handled by router.js
  // Listen for Router Changes
  window.addEventListener("routeChanged", ({ detail }) => {
    if (detail.baseRoute === "#history") {
      // If we have exactly 3 params (YYYY/MM/DD), skip calendar normalization as it's a deep-link to a game.
      if (detail.params.length === 3) return;

      const now = getJigsudoDate();
      if (CONFIG.isDemo) {
        // Force April 2026
        histViewDate = new Date(2026, 3, 1); // 3 is April (0-indexed)
        const currentY = histViewDate.getFullYear();
        const currentM = String(histViewDate.getMonth() + 1).padStart(2, "0");
        history.replaceState(null, null, `/#history/${currentY}/${currentM}`);
        updateHistoryUI();
        return;
      }
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
  let availableDates = await fetchPuzzleIndex();
  
  if (CONFIG.isDemo) {
      // Force only April 5, 2026
      availableDates = ["2026-04-05"];
  }

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

    // 2. Fetch History for the current month
    let monthHistory = historyCache[monthKey];
    if (!monthHistory) {
        monthHistory = {};
        const { auth } = await import("./firebase-config.js");
        const user = auth.currentUser;
        
        if (user) {
            console.log(`[History] Fetching history for ${monthKey} from Firestore...`);
            const { getFirestore, collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
            const db = getFirestore();
            const startSeed = parseInt(monthKey.replace(/-/g, "") + "01");
            const endSeed = parseInt(monthKey.replace(/-/g, "") + "31");
            
            const q = query(
                collection(db, "users", user.uid, "history"),
                where("seed", ">=", startSeed),
                where("seed", "<=", endSeed)
            );
            
            const snap = await getDocs(q);
            snap.forEach(d => {
                const data = d.data();
                const s = data.seed.toString();
                const dateStr = `${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}`;
                
                monthHistory[dateStr] = {
                    status: data.status || "played",
                    originalWon: data.original?.won === true,
                    hasOriginal: (!!data.original || data.played === true),
                    score: data.best?.score || 0,
                    totalTime: data.best?.totalTime || 0,
                    original: data.original || null,
                    best: data.best || null
                };
            });
        }

        // v1.6.6: HYBRID MERGE. Use local data (crucial for Demo/Guest mode)
        const localHistory = gameManager.stats?.history || {};
        Object.keys(localHistory).forEach(dateStr => {
            if (dateStr.startsWith(monthKey)) {
                const localEntry = localHistory[dateStr];
                const cloudEntry = monthHistory[dateStr];
                
                if (!cloudEntry) {
                    monthHistory[dateStr] = {
                        status: localEntry.status || "played",
                        originalWon: localEntry.original?.won === true,
                        hasOriginal: (!!localEntry.original || localEntry.played === true),
                        score: localEntry.best?.score || 0,
                        totalTime: localEntry.best?.totalTime || 0,
                        original: localEntry.original || null,
                        best: localEntry.best || null
                    };
                } else {
                    if (localEntry.original) {
                        if (!cloudEntry.original) cloudEntry.original = localEntry.original;
                        else {
                            const localOErr = localEntry.original.errors || localEntry.original.peaksErrors || 0;
                            const cloudOErr = cloudEntry.original.errors || cloudEntry.original.peaksErrors || 0;
                            if (localOErr > cloudOErr) cloudEntry.original.errors = localOErr;
                        }
                    }
                    if (localEntry.best) {
                        if (!cloudEntry.best) cloudEntry.best = localEntry.best;
                        else {
                            const localBErr = localEntry.best.errors || localEntry.best.peaksErrors || 0;
                            const cloudBErr = cloudEntry.best.errors || cloudEntry.best.peaksErrors || 0;
                            if (localBErr > cloudBErr) cloudEntry.best.errors = localBErr;
                        }
                    }
                }
            }
        });
        historyCache[monthKey] = monthHistory;
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
      // Today restriction: Only allow clicking Today if already won or if we want to allow re-entry
      if (isToday && !isCompleted) {
        // v1.9.5: Look "dimmed/off" because it is unclickable, but show color
        dayEl.style.opacity = "0.6"; 
        dayEl.style.filter = "saturate(0.6)";
        dayEl.style.cursor = "default";
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
        if (dayData.status === "won" && !CONFIG.isDemo) {
          const dot = document.createElement("span");
          dot.className = "completed-dot";
          dot.textContent = "👑"; // Use crown emoji instead of dot
          dayEl.appendChild(dot);
        }
      }

      // v1.5.62: Attach dynamic tooltips
      attachCalendarTooltip(dayEl, dayData, dateStr, null, null);

      dayEl.addEventListener("click", () => {
        const isToday = dateStr === todayStr;
        const isCompleted = dayData && dayData.status === "won";

        // Today is NOT clickable from history until won.
        if (isToday && !isCompleted) {
          return;
        }
        
        // Otherwise, use deep-link with date.
        const y = dateObj.getUTCFullYear();
        const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
        const dStr = String(dateObj.getUTCDate()).padStart(2, "0");
        window.location.hash = `#history/${y}/${m}/${dStr}`;
      });
    }

    grid.appendChild(dayEl);
  }
}

/**
 * v1.5.62: Floating Tooltip Logic
 * v1.7.6: Added support for comparison (ownDayData)
 */
export function attachCalendarTooltip(el, dayData, dateStr, ownDayData = null, fName = null) {
  // Desktop hover
  el.addEventListener("mouseenter", (e) => {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    showHistoryTooltip(e, dayData, dateStr, false, ownDayData, fName);
  });

  el.addEventListener("mousemove", (e) => {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    updateHistoryTooltipPosition(e);
  });

  el.addEventListener("mouseleave", () => {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    hideHistoryTooltip();
  });

  // Mobile Long Press
  let touchTimer = null;
  el.addEventListener("touchstart", (e) => {
    touchTimer = setTimeout(() => {
        showHistoryTooltip(e, dayData, dateStr, true, ownDayData, fName);
    }, 500);
  }, { passive: true });

  el.addEventListener("touchend", () => {
    if (touchTimer) clearTimeout(touchTimer);
  });

  el.addEventListener("touchmove", () => {
    if (touchTimer) clearTimeout(touchTimer);
  });
}

function hideHistoryTooltip(isExplicitClose = false) {
  const tooltip = document.getElementById("history-tooltip");
  const container = document.getElementById("history-tooltip-container");
  if (!tooltip) return;

  tooltip.classList.add("hidden");
  tooltip.classList.remove("mobile-mode");
  if (container) container.classList.remove("visible");
  
  // v1.9.0: Restore scroll
  document.documentElement.classList.remove("no-scroll");
  document.body.classList.remove("no-scroll");

  // If this was an explicit close (button or back), we might need to handle history
  if (isExplicitClose && window.history.state?.tooltipOpen) {
      window.history.back();
  }
}

// v1.9.0: Global listener for Back Button
window.addEventListener("popstate", (e) => {
    const tooltip = document.getElementById("history-tooltip");
    if (tooltip && !tooltip.classList.contains("hidden")) {
        // Close it quietly (don't call history.back again)
        hideHistoryTooltip(false);
    }
});

function showHistoryTooltip(e, data, dateStr, isMobile = false, ownData = null, fName = "Ellos") {
  const tooltip = document.getElementById("history-tooltip");
  const container = document.getElementById("history-tooltip-container");
  if (!tooltip) return;

  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];

  // Format Date for Title
  const dateObj = new Date(dateStr + "T12:00:00Z");
  const dateTitle = dateObj.toLocaleDateString(lang, { day: "numeric", month: "long" });

  let titleColor = "var(--text-muted)";
  if (data) {
    if (data.originalWon) titleColor = "#22c55e";
    else if (data.hasOriginal) titleColor = "#eab308";
  }

  let html = "";
  
  if (isMobile) {
      html += `<button class="tooltip-close" id="hist-tooltip-close">×</button>`;
  }

  const isComparison = fName && fName !== "Tú";

  html += `<div class="tooltip-title" style="color: ${titleColor}; border-bottom-color: ${titleColor}22">
    <span>${dateTitle}</span>
    ${(!isComparison && data?.status === "won" && !CONFIG.isDemo) ? "<span>👑</span>" : ""}
  </div>`;

  const fmt = (ms) => formatTime(ms);

  const getTrend = (f, o, type) => {
      if (f === undefined || o === undefined || f === null || o === null) return "";
      const isBetter = (type === "time" || type === "errors" || type === "errs") ? (o < f) : (o > f);
      const isWorse = (type === "time" || type === "errors" || type === "errs") ? (o > f) : (o < f);
      if (isBetter) return '<span class="trend-up">▲</span>';
      if (isWorse) return '<span class="trend-down">▼</span>';
      return "";
  };

  if (!isComparison) {
      // STANDARD SINGLE VIEW (Own profile)
      if (!data || (!data.original && !data.best)) {
        html += `<div style="color: var(--text-muted); font-size: 0.8rem; padding: 10px 0; text-align: center;">
          ${t.history_no_stat || "Sin estadísticas registradas"}
        </div>`;
      } else {
        if (data.original) {
          const o = data.original;
          html += `<div class="tooltip-section">
            <span class="tooltip-section-title">${t.stats_original || "Desempeño Original"}</span>
            <div class="tooltip-grid">
              <span class="tooltip-label">${lang === 'es' ? 'Puntaje' : 'Score'}:</span>
              <span class="tooltip-value highlight">${(o.score || 0).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RP</span>
              <span class="tooltip-label">${lang === 'es' ? 'Tiempo' : 'Time'}:</span>
              <span class="tooltip-value">${fmt(o.totalTime)}</span>
              <span class="tooltip-label">${lang === 'es' ? 'Errores' : 'Errors'}:</span>
              <span class="tooltip-value">${o.peaksErrors || o.errors || 0}</span>
            </div>
          </div>`;
        }
        if (data.best) {
          const b = data.best;
          html += `<div class="tooltip-section">
            <span class="tooltip-section-title">${t.stats_best || "Mejor Histórico"}</span>
            <div class="tooltip-grid">
              <span class="tooltip-label">${lang === 'es' ? 'Puntaje' : 'Score'}:</span>
              <span class="tooltip-value highlight">${(b.score || 0).toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RP</span>
              <span class="tooltip-label">${lang === 'es' ? 'Tiempo' : 'Time'}:</span>
              <span class="tooltip-value">${fmt(b.totalTime)}</span>
              <span class="tooltip-label">${lang === 'es' ? 'Errores' : 'Errors'}:</span>
              <span class="tooltip-value">${b.peaksErrors || b.errors || 0}</span>
            </div>
          </div>`;
        }
      }
  } else {
      // COMPARISON MODE (Two Columns)
      const f = data || {};
      const o = ownData || {};
      
      // Comparison Mode Logic
      const checkHasData = (d) => {
          if (!d) return false;
          const o = d.original || {};
          const b = d.best || {};
          return !!(o.score || o.totalTime || b.score || b.totalTime);
      };

      const hasF = checkHasData(data);
      const hasO = checkHasData(ownData);

      if (!hasF && !hasO) {
          html += `<div style="color: var(--text-muted); font-size: 0.8rem; padding: 10px 0; text-align: center;">
            ${t.history_no_stat || "Sin estadísticas registradas"}
          </div>`;
      } else {
          const fO = f.original || {};
          const oO = o.original || {};
          const fB = f.best || {};
          const oB = o.best || {};
          
          const renderColumn = (name, orig, best, otherOrig, otherBest, color, showTrends = false, isWon = false) => {
              const hasData = orig.score || best.score || orig.totalTime || best.totalTime;
              
              let colHtml = `
                <div class="history-comp-col">
                    <div class="history-comp-header" style="color: ${color}; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #ffffff11; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                        <span>${name}</span>
                        ${(isWon && !CONFIG.isDemo) ? '<span style="font-size: 0.9rem;">👑</span>' : ''}
                    </div>`;
              
              if (!hasData) {
                  colHtml += `<div style="color: var(--text-muted); font-size: 0.8rem; padding: 20px 0; text-align: center; font-style: italic;">
                    ${t.not_played || "No jugado"}
                  </div>`;
              } else {
                  colHtml += `
                    <div class="comp-sub-label" style="font-size: 0.7rem; opacity: 0.6; text-transform: uppercase; margin-bottom: 4px;">${t.stats_original || "Original"}</div>
                    ${renderMiniGrid(orig, otherOrig, showTrends)}
                    <div class="comp-sub-label" style="font-size: 0.7rem; opacity: 0.6; text-transform: uppercase; margin-bottom: 4px;">${t.stats_best || "Mejor"}</div>
                    ${renderMiniGrid(best, otherBest, showTrends)}`;
              }
              
              colHtml += `</div>`;
              return colHtml;
          };

          const renderMiniGrid = (s, os, showTrends) => {
              if (!s || (!s.score && !s.totalTime)) return `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px; font-style: italic;">---</div>`;
              
              const sErr = s.peaksErrors !== undefined ? s.peaksErrors : (s.errors !== undefined ? s.errors : 0);
              const osErr = os?.peaksErrors !== undefined ? os.peaksErrors : (os?.errors !== undefined ? os.errors : (os ? 0 : null));
              const sScore = s.score || 0;
              const osScore = os?.score !== undefined ? os.score : (os ? 0 : null);
              const sTime = s.totalTime || 0;
              const osTime = os?.totalTime !== undefined ? os.totalTime : (os ? 0 : null);

              return `
                <div class="tooltip-grid" style="font-size: 0.75rem; gap: 2px 8px; margin-bottom: 8px;">
                    <span class="tooltip-label">RP:</span>
                    <span class="tooltip-value highlight">${sScore.toFixed(2)}${showTrends && osScore !== null ? ' ' + getTrend(osScore, sScore, "rp") : ''}</span>
                    <span class="tooltip-label">${lang === 'es' ? 'Tiempo' : 'Time'}:</span>
                    <span class="tooltip-value">${fmt(sTime)}${showTrends && osTime !== null ? ' ' + getTrend(osTime, sTime, "time") : ''}</span>
                    <span class="tooltip-label">Err:</span>
                    <span class="tooltip-value">${sErr}${showTrends && osErr !== null ? ' ' + getTrend(osErr, sErr, "errors") : ''}</span>
                </div>`;
          };

          html += `
            <div class="history-comp-grid" style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: start;">
                ${renderColumn(fName, fO, fB, oO, oB, "var(--accent-color)", false, f.status === "won")}
                <div class="comp-vs" style="align-self: center; opacity: 0.3; font-style: italic; font-size: 0.8rem;">vs</div>
                ${renderColumn(t.comp_you || "Tú", oO, oB, fO, fB, "#22c55e", true, o.status === "won")}
            </div>`;
      }
  }

  tooltip.innerHTML = html;
  tooltip.classList.remove("hidden");

  if (isMobile) {
      // v1.9.0: Clear any manual styles from hovering to avoid conflicts
      tooltip.style.left = "";
      tooltip.style.top = "";
      
      tooltip.classList.add("mobile-mode");
      if (container) container.classList.add("visible");
      
      // v1.9.0: Block scroll
      document.documentElement.classList.add("no-scroll");
      document.body.classList.add("no-scroll");

      // Navigation support
      window.history.pushState({ tooltipOpen: true }, "");

      // Event for close button
      const closeBtn = document.getElementById("hist-tooltip-close");
      if (closeBtn) {
          closeBtn.onclick = (ev) => {
              ev.stopPropagation();
              hideHistoryTooltip(true);
          };
      }
      
      // Close on backdrop click
      if (container) {
          // Use pointerdown to ensure a NEW touch is required to close
          container.onpointerdown = () => hideHistoryTooltip(true);
      }
  } else {
      updateHistoryTooltipPosition(e);
  }
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


