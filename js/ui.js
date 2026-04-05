import { translations } from "./translations.js";
import { getCurrentLang, updateTexts } from "./i18n.js";
import { getCurrentUser } from "./auth.js";
import { getRankData } from "./ranks.js";
import { formatJigsudoDate } from "./utils/time.js";

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

  const totalSeconds = Math.floor(ms / 1000);
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
  const timeEl = document.getElementById("victory-total-time");
  const streakEl = document.getElementById("victory-streak");
  const errorsEl = document.getElementById("victory-errors");
  const scoreEl = document.getElementById("victory-score");
  const stageTimesContainer = document.getElementById("victory-stage-times");
  const btnHome = document.getElementById("btn-victory-home");

  if (!modal) return;

  const lang = getCurrentLang();

  // Update button text based on mode
  if (btnHome) {
    let btnKey = isHome ? "btn_close" : "btn_back_home";
    if (!isHome && stats.isReplay) {
      btnKey = "btn_back_history";
    }
    btnHome.dataset.i18n = btnKey;
    btnHome.textContent =
      translations[lang][btnKey] || (isHome ? "Cerrar" : "Volver al Inicio");
  }

  // Update description text based on whether it's a replay
  const descEl = modal.querySelector(".modal-desc");
  if (descEl) {
    descEl.dataset.isReplay = stats.isReplay || "false";
    descEl.dataset.date = stats.date || "";
    descEl.dataset.i18n = "victory_desc";
    
    // Call updateTexts to apply localized formatting immediately
    const { updateTexts } = await import("./i18n.js");
    updateTexts();
  }

  // Populating main stats
  const scoreFormat = new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  if (timeEl) timeEl.textContent = formatTime(stats.totalTime);
  if (streakEl) streakEl.textContent = stats.streak || "1";
  if (errorsEl) errorsEl.textContent = stats.errors || "0";
  if (scoreEl) scoreEl.textContent = `+${scoreFormat.format(stats.score)}`;

  // Populating breakdown
  if (stageTimesContainer) {
    stageTimesContainer.innerHTML = "";

    // Ordered categories for display
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
          const { clearRankingCache } = await import("./ranking.js");
          clearRankingCache();
        } catch (err) {
          console.warn("Failed to clear ranking cache:", err);
        }

        // 2. Navigate based on mode
        const { router } = await import("./router.js");
        if (stats.isReplay && stats.date) {
          // stats.date is YYYY-MM-DD
          const [y, m] = stats.date.split("-");
          router.navigateTo(`#history/${y}/${m}`);
        } else {
          router.navigateTo("#home");
        }

        // 3. Force global events to let Home.js know it should refresh UI
        window.dispatchEvent(new CustomEvent("gameCompleted"));
      }
    };
  }

  // Show Modal
  toggleModal(modal, true);
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

  // 2. Remove Flying Digits Container
  const victoryContainer = document.querySelector(".victory-code-container");
  if (victoryContainer) {
    victoryContainer.remove();
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

  // 0. Check for html2canvas (Loaded via CDN in index.html)
  if (typeof window.html2canvas === "undefined") {
    console.error("html2canvas not loaded");
    showToast("Error: html2canvas no está cargado ❌", 4000, "error");
    return;
  }

  try {
    showToast("Generando imagen... ⏳", 2000);

    // Ensure everything is translated for the card
    updateTexts();

    const lang = getCurrentLang();
    const t = translations[lang] || translations["es"];
    const user = getCurrentUser();

    // 1. Populate Header
    const logoContainer = document.getElementById("vsc-logo-container");
    const usernameEl = document.getElementById("vsc-username");
    const rankEl = document.getElementById("vsc-rank");
    const dateEl = document.getElementById("vsc-date");

    if (logoContainer) {
      const isDarkMode = document.body.classList.contains("dark-mode");
      const svgLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="216.831" y="128.255">1</text><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="166.576" y1="-1.106" x2="166.718" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="333.588" y1="-1.106" x2="333.436" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="0" y1="167.339" x2="500.154" y2="166.718"/><line style="fill: none; stroke-width: 30px; stroke: rgb(30, 35, 41);" x1="0" y1="333.479" x2="500.154" y2="333.436"/><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="49.191" y="125.381">J</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="381.02" y="125.859">6</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="31.317" y="302.394">5</text><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="204.759" y="302.394">U</text><text style="fill: rgb(24, 91, 147); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="198.205" y="479.26">D</text><text style="fill: rgb(252, 116, 44); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="381.95" y="479.26">0</text></svg>`;
      const svgDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="216.831" y="128.255">1</text><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="166.576" y1="-1.106" x2="166.718" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="333.588" y1="-1.106" x2="333.436" y2="500.154"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="0" y1="167.339" x2="500.154" y2="166.718"/><line style="fill: none; stroke-width: 30px; stroke: rgb(238, 238, 238);" x1="0" y1="333.479" x2="500.154" y2="333.436"/><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="49.191" y="125.381">J</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="381.02" y="125.859">6</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="31.317" y="302.394">5</text><text style="fill: rgb(58, 136, 201); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; white-space: pre;" x="204.759" y="302.394">U</text><text style="fill: rgb(58, 136, 201); font-family: ' Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="198.205" y="479.26">D</text><text style="fill: rgb(255, 167, 38); font-family: 'Century Gothic'; font-size: 140px; font-weight: 700; stroke-width: 2px; white-space: pre;" x="381.95" y="479.26">0</text></svg>`;
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
    showToast("Error al generar la imagen ❌");
  }
}

function downloadFallback(canvas, fileName = "jigsudo-result.png") {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}
