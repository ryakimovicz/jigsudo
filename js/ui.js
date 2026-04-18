import { translations } from "./translations.js?v=1.3.3";
import { getCurrentLang, updateTexts } from "./i18n.js?v=1.3.3";
import { getCurrentUser } from "./auth.js?v=1.3.3";
import { getRankData } from "./ranks.js?v=1.3.3";
import { formatJigsudoDate } from "./utils/time.js?v=1.3.3";
import { masterLock } from "./lock.js?v=1.3.3";
 
let lastVictoryStats = null;
let lastVictoryIsHome = false;
 
window.addEventListener("languageChanged", () => {
  const modal = document.getElementById("victory-summary-modal");
  if (modal && !modal.classList.contains("hidden") && lastVictoryStats) {
    refreshVictorySummaryUI(lastVictoryStats, lastVictoryIsHome);
  }
});

export function showToast(message, duration = 3000, type = "info") {
  let container = document.getElementById("toast-container");

  // Create container if missing
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  // Create Toast Element
  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Animate In
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  // Remove after duration
  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", () => {
      toast.remove();
    });
  }, duration);
}

export function formatTime(ms) {
  if (ms === undefined || ms === null || isNaN(ms) || ms === Infinity) {
    return "--:--";
  }

  // v1.2.5: Rounding to nearest integer, but 0.5 rounds DOWN. Logic: Math.ceil(secs - 0.5)
  const totalSeconds = Math.ceil(ms / 1000 - 0.5);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
}

/**
 * Toggles a modal's visibility and manages body scroll locking.
 * @param {string|HTMLElement} elementOrId - The modal element or its ID.
 * @param {boolean} show - Whether to show (true) or hide (false).
 */
export function toggleModal(elementOrId, show) {
  const modal =
    typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;
  if (!modal) return;

  if (show) {
    if (modal.classList.contains("hidden")) {
      modal.classList.remove("hidden");
      document.body.classList.add("no-scroll");
      document.documentElement.classList.add("no-scroll");
    }
  } else {
    if (!modal.classList.contains("hidden")) {
      modal.classList.add("hidden");
      
      // Only remove no-scroll if no other modals are visible
      const otherModals = document.querySelectorAll(
        ".modal-overlay:not(.hidden)",
      );
      if (otherModals.length === 0) {
        document.body.classList.remove("no-scroll");
        document.documentElement.classList.remove("no-scroll");
      }
    }
  }
}

/**
 * Shows a simple alert modal with a title and message.
 * @param {string} title 
 * @param {string} message 
 */
export function showAlertModal(title, message) {
  const modal = document.getElementById("generic-alert-modal");
  const titleEl = document.getElementById("generic-alert-title");
  const msgEl = document.getElementById("generic-alert-msg");
  const closeBtn = document.getElementById("btn-close-generic-alert");

  if (!modal || !titleEl || !msgEl || !closeBtn) return;

  titleEl.textContent = title;
  msgEl.textContent = message;

  closeBtn.onclick = () => toggleModal(modal, false);

  toggleModal(modal, true);
}

/**
 * Shows a specialized alert when a new version is detected.
 */
export async function showUpdateAlert(isSticky = false) {
  const modal = document.getElementById("generic-alert-modal");
  const titleEl = document.getElementById("generic-alert-title");
  const msgEl = document.getElementById("generic-alert-msg");
  const closeBtn = document.getElementById("btn-close-generic-alert");

  if (!modal || !titleEl || !msgEl || !closeBtn) return;

  const { translations } = await import("./translations.js?v=1.3.3");
  const { getCurrentLang } = await import("./i18n.js?v=1.3.3");
  const lang = getCurrentLang();
  const t = translations[lang] || translations["es"];

  titleEl.textContent = t.update_available_title || "Actualización";

  // High-visibility warning if automatic reload failed
  const stickyWarning = isSticky
    ? `<div style="color: #ff4d4d; font-weight: bold; margin-bottom: 15px; border: 1px solid #ff4d4d; padding: 10px; border-radius: 5px; background: rgba(255,0,0,0.1);">
      ${t.update_sticky_warning || "¡Caché bloqueada! El navegador sigue cargando la versión antigua."}
    </div>`
    : "";

  msgEl.innerHTML = `
    ${stickyWarning}
    <p>${t.update_available_msg || "Hay una nueva versión disponible."}</p>
    <div style="background: rgba(var(--primary-rgb), 0.1); padding: 10px; border-radius: 8px; margin-top: 15px; font-size: 0.9em; border: 1px solid var(--primary);">
        <p><strong>${t.update_cache_hint || "Si los cambios no aparecen después de actualizar, presiona Ctrl+F5 (o Command+Shift+R en Mac)."}</strong></p>
    </div>
  `;

  closeBtn.textContent = t.btn_update_now || "Actualizar Ahora";
  closeBtn.classList.add("btn-primary"); // Highlight it
  closeBtn.onclick = () => {
    // 1. Visual Feedback
    closeBtn.textContent = t.btn_processing || "Procesando...";
    closeBtn.disabled = true;

    // 2. Force aggressive cache-bust via URL parameter
    const url = new URL(window.location.href);
    url.searchParams.set("u", Date.now()); // Hard break from cache

    // Store attempt to prevent immediate re-pop during sync
    sessionStorage.setItem("jigsudo_last_update_attempt", Date.now());

    window.location.replace(url.toString());
  };

  toggleModal(modal, true);
}

/**
 * Stage 1: Non-intrusive Toast for initial update attempt
 */
export async function showUpdateToast() {
  const { translations } = await import("./translations.js?v=1.3.3");
  const { getCurrentLang } = await import("./i18n.js?v=1.3.3");
  const lang = getCurrentLang();
  const t = translations[lang] || translations["es"];

  showToast(
    t.toast_updating || "Actualización disponible. Aplicando cambios...",
  );
}

// Mobile Scrollbar Logic: Show thumb only when scrolling
let scrollTimeout;
function handleScroll() {
  document.body.classList.add("is-scrolling");
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    document.body.classList.remove("is-scrolling");
  }, 1000);
}

// Listen for global and modal-specific scrolling
window.addEventListener("scroll", handleScroll, { passive: true });
document.addEventListener(
  "scroll",
  (e) => {
    if (
      e.target &&
      e.target.classList &&
      e.target.classList.contains("modal-overlay")
    ) {
      handleScroll();
    }
  },
  { passive: true, capture: true },
);

export async function showVictorySummary(stats, isHome = false) {
  if (!stats) return;

  const modal = document.getElementById("victory-summary-modal");
  const btnHome = document.getElementById("btn-victory-home");
  if (!modal) return;

  lastVictoryStats = stats;
  lastVictoryIsHome = isHome;
  
  await refreshVictorySummaryUI(stats, isHome);

  // Share Button Logic
  const shareBtn = document.getElementById("btn-victory-share");
  if (shareBtn) {
    shareBtn.onclick = () => handleShareVictory(stats);
  }

  // Home Button Logic
  if (btnHome) {
    btnHome.onclick = async () => {
      toggleModal(modal, false);

      if (!isHome) {
        // 1. Refresh Rankings immediately if possible (via home logic listener)
        try {
          const { clearRankingCache } = await import("./ranking.js?v=1.3.3");
          clearRankingCache();
        } catch (err) {
          console.warn("Failed to clear ranking cache:", err);
        }

        // 2. Navigate based on mode
        const { router } = await import("./router.js?v=1.3.3");
        if (stats.isReplay && stats.date) {
          // stats.date is YYYY-MM-DD
          const [y, m] = stats.date.split("-");
          router.navigateTo(`#history/${y}/${m}`);
        } else {
          router.navigateTo("#home");
        }

      }
    };
  }

  // Show Modal
  toggleModal(modal, true);
}

// Private helper to populate localized summary fields
async function refreshVictorySummaryUI(stats, isHome) {
  const lang = getCurrentLang();
  const timeEl = document.getElementById("victory-total-time");
  const streakEl = document.getElementById("victory-streak");
  const errorsEl = document.getElementById("victory-errors");
  const scoreEl = document.getElementById("victory-score");
  const stageTimesContainer = document.getElementById("victory-stage-times");
  const btnHome = document.getElementById("btn-victory-home");

  if (timeEl) timeEl.textContent = formatTime(stats.totalTime);
  if (streakEl) streakEl.textContent = stats.streak || "1";
  if (errorsEl) errorsEl.textContent = stats.errors || "0";

  // Formatted score
  const scoreFormat = new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (scoreEl) scoreEl.textContent = `+${scoreFormat.format(stats.score)}`;

  // Button labels
  if (btnHome) {
    let btnKey = isHome ? "btn_close" : "btn_back_home";
    if (!isHome && stats.isReplay) {
      btnKey = "btn_back_history";
    }
    btnHome.dataset.i18n = btnKey;
    btnHome.textContent =
      translations[lang][btnKey] || (isHome ? "Cerrar" : "Volver al Inicio");
  }

  // Breakdown
  if (stageTimesContainer) {
    stageTimesContainer.innerHTML = "";
    const stages = [
      { key: "memory", icon: "🧠" },
      { key: "jigsaw", icon: "🧩" },
      { key: "sudoku", icon: "🔢" },
      { key: "peaks", icon: "⛰️" },
      { key: "search", icon: "🔍" },
      { key: "code", icon: "📟" },
    ];

    stages.forEach((stage) => {
      const timeMs = stats.stageTimes[stage.key] || 0;
      const stageName = translations[lang].stage_names[stage.key] || stage.key;

      const row = document.createElement("div");
      row.className = "stage-time-row";
      row.innerHTML = `
        <span class="stage-name">${stage.icon} ${stageName}</span>
        <span class="stage-val">${formatTime(timeMs)}</span>
      `;
      stageTimesContainer.appendChild(row);
    });
  }

  // Ensure victory_desc and others update
  const modal = document.getElementById("victory-summary-modal");
  const descEl = modal?.querySelector(".modal-desc");
  if (descEl) {
    descEl.dataset.isReplay = stats.isReplay || "false";
    descEl.dataset.date = stats.date || "";
    descEl.dataset.i18n = "victory_desc";
  }

  const { updateTexts } = await import("./i18n.js?v=1.3.3");
  updateTexts();
}

/**
 * Centralized cleanup for victory-related UI elements.
 * Called when starting a new game to ensure a clean state.
 */
export function cleanupVictoryUI() {
  console.log("[UI] Cleaning up victory elements...");

  // 1. Hide Summary Modal
  const victoryModal = document.getElementById("victory-summary-modal");
  if (victoryModal) {
    toggleModal(victoryModal, false);
  }

  // v1.2.7: Restoration of Master Lock State
  try {
    masterLock.reset();
  } catch (e) {
    console.warn("[UI] Could not reset masterLock:", e);
  }

  // 2. Remove New Victory Tray (Labels)
  const tray = document.querySelector(".victory-tray");
  if (tray) {
    tray.remove();
  }

  // Legacy Cleanup (Still looking for floating digits just in case)
  const legacyContainer = document.querySelector(".victory-code-container");
  if (legacyContainer) {
    legacyContainer.remove();
  }

  // 3. Restore Header Title
  const titleContainer = document.querySelector(".header-title-container");
  if (titleContainer) {
    titleContainer.style.display = "";
  }

  // 4. Restore Debug Button
  const debugBtn = document.getElementById("debug-help-btn");
  if (debugBtn) {
    debugBtn.style.pointerEvents = "";
    debugBtn.style.opacity = "";
  }
}

async function handleShareVictory(stats) {
  const card = document.getElementById("victory-social-card");
  if (!card) return;

  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];

  // 0. Check for html2canvas (Loaded via CDN in index.html)
  if (typeof window.html2canvas === "undefined") {
    console.error("html2canvas not loaded");
    showToast(t.err_html2canvas || "Error: html2canvas no está cargado ❌", 4000, "error");
    return;
  }

  try {
    showToast(t.toast_generating_image || "Generando imagen... ⏳", 2000);

    // Ensure everything is translated for the card
    updateTexts();

    const user = getCurrentUser();

    // 1. Populate Header
    const logoContainer = document.getElementById("vsc-logo-container");
    const usernameEl = document.getElementById("vsc-username");
    const rankEl = document.getElementById("vsc-rank");
    const dateEl = document.getElementById("vsc-date");

    if (logoContainer) {
      const isDarkMode = document.body.classList.contains("dark-mode");
      const svgLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <line x1="170.6" y1="20" x2="170.6" y2="492" stroke="#1e293b" stroke-width="24" stroke-linecap="round" />
        <line x1="341.3" y1="20" x2="341.3" y2="492" stroke="#1e293b" stroke-width="24" stroke-linecap="round" />
        <line x1="20" y1="170.6" x2="492" y2="170.6" stroke="#1e293b" stroke-width="24" stroke-linecap="round" />
        <line x1="20" y1="341.3" x2="492" y2="341.3" stroke="#1e293b" stroke-width="24" stroke-linecap="round" />
        <text x="85.3" y="105" text-anchor="middle" dominant-baseline="middle" fill="#185b93" font-family="Outfit, sans-serif" font-size="160" font-weight="700">J</text>
        <text x="256" y="105" text-anchor="middle" dominant-baseline="middle" fill="#f97316" font-family="Outfit, sans-serif" font-size="160" font-weight="700">1</text>
        <text x="426.6" y="105" text-anchor="middle" dominant-baseline="middle" fill="#f97316" font-family="Outfit, sans-serif" font-size="160" font-weight="700">6</text>
        <text x="85.3" y="275" text-anchor="middle" dominant-baseline="middle" fill="#f97316" font-family="Outfit, sans-serif" font-size="160" font-weight="700">5</text>
        <text x="256" y="275" text-anchor="middle" dominant-baseline="middle" fill="#185b93" font-family="Outfit, sans-serif" font-size="160" font-weight="700">U</text>
        <text x="256" y="445" text-anchor="middle" dominant-baseline="middle" fill="#185b93" font-family="Outfit, sans-serif" font-size="160" font-weight="700">D</text>
        <text x="426.6" y="445" text-anchor="middle" dominant-baseline="middle" fill="#f97316" font-family="Outfit, sans-serif" font-size="160" font-weight="700">0</text>
      </svg>`;
      const svgDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <line x1="170.6" y1="20" x2="170.6" y2="492" stroke="#cdd9e5" stroke-width="24" stroke-linecap="round" />
        <line x1="341.3" y1="20" x2="341.3" y2="492" stroke="#cdd9e5" stroke-width="24" stroke-linecap="round" />
        <line x1="20" y1="170.6" x2="492" y2="170.6" stroke="#cdd9e5" stroke-width="24" stroke-linecap="round" />
        <line x1="20" y1="341.3" x2="492" y2="341.3" stroke="#cdd9e5" stroke-width="24" stroke-linecap="round" />
        <text x="85.3" y="105" text-anchor="middle" dominant-baseline="middle" fill="#60a5fa" font-family="Outfit, sans-serif" font-size="160" font-weight="700">J</text>
        <text x="256" y="105" text-anchor="middle" dominant-baseline="middle" fill="#ffa726" font-family="Outfit, sans-serif" font-size="160" font-weight="700">1</text>
        <text x="426.6" y="105" text-anchor="middle" dominant-baseline="middle" fill="#ffa726" font-family="Outfit, sans-serif" font-size="160" font-weight="700">6</text>
        <text x="85.3" y="275" text-anchor="middle" dominant-baseline="middle" fill="#ffa726" font-family="Outfit, sans-serif" font-size="160" font-weight="700">5</text>
        <text x="256" y="275" text-anchor="middle" dominant-baseline="middle" fill="#185b93" font-family="Outfit, sans-serif" font-size="160" font-weight="700">U</text>
        <text x="256" y="445" text-anchor="middle" dominant-baseline="middle" fill="#185b93" font-family="Outfit, sans-serif" font-size="160" font-weight="700">D</text>
        <text x="426.6" y="445" text-anchor="middle" dominant-baseline="middle" fill="#ffa726" font-family="Outfit, sans-serif" font-size="160" font-weight="700">0</text>
      </svg>`;
      logoContainer.innerHTML = isDarkMode ? svgDark : svgLight;
    }

    if (usernameEl)
      usernameEl.textContent = user
        ? user.displayName || t.user_default || "Usuario"
        : t.guest || "Anónimo";

    if (rankEl) {
      // Get current RP from localstorage to show rank
      const statsStr = localStorage.getItem("jigsudo_user_stats");
      const currentRP = statsStr ? JSON.parse(statsStr).currentRP || 0 : 0;
      const rankData = getRankData(currentRP);
      const rankKey = rankData.rank.nameKey;
      rankEl.textContent = t[rankKey] || rankKey;
    }

    if (dateEl) {
      dateEl.textContent = formatJigsudoDate(t.date_locale || "es-ES");
    }

    // 2. Populate Session Stats
    const sessionScoreFormat = new Intl.NumberFormat(
      lang === "es" ? "es-ES" : "en-US",
      {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      },
    );
    document.getElementById("vsc-stat-time").textContent = formatTime(
      stats.totalTime,
    );
    document.getElementById("vsc-stat-streak").textContent =
      stats.streak || "1";
    document.getElementById("vsc-stat-errors").textContent =
      stats.errors || "0";
    document.getElementById("vsc-stat-score").textContent =
      sessionScoreFormat.format(stats.score);

    // 3. Populate Breakdown Grid
    const stageList = document.getElementById("vsc-stage-list");
    if (stageList) {
      stageList.innerHTML = "";
      const stages = [
        { id: "p_game_memory", key: "memory" },
        { id: "p_game_jigsaw", key: "jigsaw" },
        { id: "p_game_sudoku", key: "sudoku" },
        { id: "p_game_peaks", key: "peaks" },
        { id: "p_game_search", key: "search" },
        { id: "p_game_code", key: "code" },
      ];

      stages.forEach((st) => {
        const timeMs = stats.stageTimes[st.key] || 0;
        const label = translations[lang][st.id] || st.id;
        const card = document.createElement("div");
        card.className = "sc-stage-item";

        let statsHtml = `
          <div class="sc-mini-stat">
            <span class="sc-mini-icon">⏱️</span>
            <span class="sc-mini-val">${formatTime(timeMs)}</span>
          </div>
        `;

        card.innerHTML = `
          <span class="sc-item-label">${label}</span>
          <div class="sc-item-stats">${statsHtml}</div>
        `;
        stageList.appendChild(card);
      });
    }

    // 4. Capture
    await new Promise((r) => setTimeout(r, 500));

    // TEMPORARILY FORCE DISPLAY (JUST IN CASE CSS IS BLOCKED OR OVERRIDDEN)
    card.style.display = "flex";

    const canvas = await window.html2canvas(card, {
      backgroundColor:
        getComputedStyle(document.body).getPropertyValue("--bg-paper") ||
        "#f8fafc",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: 1080,
    });

    card.style.display = ""; // REVERT

    // 5. Filename Generation
    const dateStr = new Date().toISOString().split("T")[0];
    const fallbackName = user
      ? t.user_default || "Usuario"
      : t.guest || "Invitado";
    const nameClean = (user ? user.displayName || fallbackName : fallbackName)
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const fileName = `jigsudo-victory-${nameClean}-${dateStr}.png`;

    // 6. Share or Download
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const file = new File([blob], fileName, { type: "image/png" });
      const shareUrl = "https://jigsudo.com";
      const shareData = {
        title: t.victory_share_title || "DESAFÍO COMPLETADO",
        text:
          (t.share_stats_msg || "¡Mira mi progreso en Jigsudo! 🧩✨") +
          `\n\n${shareUrl}`,
        files: [file],
      };

      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );

      if (
        isMobile &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share(shareData);
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("Share failed:", err);
            downloadFallback(canvas, fileName);
          }
        }
      } else {
        downloadFallback(canvas, fileName);
      }
    }, "image/png");
  } catch (err) {
    console.error("Failed to generate victory card:", err);
    const lang = getCurrentLang() || "es";
    const t = translations[lang] || translations["es"];
    showToast(t.err_generating_image || "Error al generar la imagen ❌");
  }
}

function downloadFallback(canvas, fileName = "jigsudo-result.png") {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}
