import { translations } from "./translations.js?v=1.3.1";
import { getCurrentLang, updateTexts } from "./i18n.js?v=1.3.1";
import { getRankData } from "./ranks.js?v=1.3.1";
import { formatJigsudoDate } from "./utils/time.js?v=1.3.1";
import { masterLock } from "./lock.js?v=1.3.1";
 
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
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });
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
  const totalSeconds = Math.ceil(ms / 1000 - 0.5);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

export function toggleModal(elementOrId, show) {
  const modal = typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;
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
      const otherModals = document.querySelectorAll(".modal-overlay:not(.hidden)");
      if (otherModals.length === 0) {
        document.body.classList.remove("no-scroll");
        document.documentElement.classList.remove("no-scroll");
      }
    }
  }
}

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

export async function showUpdateAlert() {
  // Updates disabled for standalone demo
  console.log("[UI] showUpdateAlert called, ignoring in demo.");
}

export async function showUpdateToast() {
  // Updates disabled for standalone demo
  console.log("[UI] showUpdateToast called, ignoring in demo.");
}

export async function showVictorySummary(stats, isHome = false) {
  if (!stats) return;
  const modal = document.getElementById("victory-summary-modal");
  const btnHome = document.getElementById("btn-victory-home");
  if (!modal) return;
  lastVictoryStats = stats;
  lastVictoryIsHome = isHome;
  await refreshVictorySummaryUI(stats, isHome);
  const shareBtn = document.getElementById("btn-victory-share");
  if (shareBtn) {
    shareBtn.onclick = () => handleShareVictory(stats);
  }
  if (btnHome) {
    btnHome.onclick = async () => {
      toggleModal(modal, false);
      if (!isHome) {
        const { router } = await import("./router.js?v=1.3.1");
        if (stats.isReplay && stats.date) {
          const [y, m] = stats.date.split("-");
          router.navigateTo(`#history/${y}/${m}`);
        } else {
          router.navigateTo("#home");
        }
      }
    };
  }
  toggleModal(modal, true);
}

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
  const scoreFormat = new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (scoreEl) scoreEl.textContent = `+${scoreFormat.format(stats.score)}`;
  if (btnHome) {
    let btnKey = isHome ? "btn_close" : "btn_back_home";
    if (!isHome && stats.isReplay) {
      btnKey = "btn_back_history";
    }
    btnHome.dataset.i18n = btnKey;
    btnHome.textContent = translations[lang][btnKey] || (isHome ? "Cerrar" : "Volver al Inicio");
  }
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
  const modal = document.getElementById("victory-summary-modal");
  const descEl = modal?.querySelector(".modal-desc");
  if (descEl) {
    descEl.dataset.isReplay = stats.isReplay || "false";
    descEl.dataset.date = stats.date || "";
    descEl.dataset.i18n = "victory_desc";
  }
  updateTexts();
}

export function cleanupVictoryUI() {
  console.log("[UI] Cleaning up victory elements...");
  const victoryModal = document.getElementById("victory-summary-modal");
  if (victoryModal) {
    toggleModal(victoryModal, false);
  }
  try {
    masterLock.reset();
  } catch (e) {
    console.warn("[UI] Could not reset masterLock:", e);
  }
  const tray = document.querySelector(".victory-tray");
  if (tray) tray.remove();
  const legacyContainer = document.querySelector(".victory-code-container");
  if (legacyContainer) legacyContainer.remove();
  const titleContainer = document.querySelector(".header-title-container");
  if (titleContainer) titleContainer.style.display = "";
}

async function handleShareVictory(stats) {
  const card = document.getElementById("victory-social-card");
  if (!card) return;
  const lang = getCurrentLang() || "es";
  const t = translations[lang] || translations["es"];
  if (typeof window.html2canvas === "undefined") {
    console.error("html2canvas not loaded");
    showToast(t.err_html2canvas || "Error: html2canvas no está cargado ❌", 4000, "error");
    return;
  }
  try {
    showToast(t.toast_generating_image || "Generando imagen... ⏳", 2000);
    updateTexts();

    // 1. Populate Header
    const logoContainer = document.getElementById("vsc-logo-container");
    const usernameEl = document.getElementById("vsc-username");
    const rankEl = document.getElementById("vsc-rank");
    const dateEl = document.getElementById("vsc-date");

    if (logoContainer) {
      const isDarkMode = document.body.classList.contains("dark-mode");
      const svgLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><line x1="170.6" y1="20" x2="170.6" y2="492" stroke="#1e293b" stroke-width="24" stroke-linecap="round" /><line x1="341.3" y1="20" x2="341.3" y2="492" stroke="#1e293b" stroke-width="24" stroke-linecap="round" /><line x1="20" y1="170.6" x2="492" y2="170.6" stroke="#1e293b" stroke-width="24" stroke-linecap="round" /><line x1="20" y1="341.3" x2="492" y2="341.3" stroke="#1e293b" stroke-width="24" stroke-linecap="round" /><text x="85.3" y="105" text-anchor="middle" dominant-baseline="middle" fill="#185b93" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">J</text><text x="256" y="105" text-anchor="middle" dominant-baseline="middle" fill="#f97316" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">1</text><text x="426.6" y="105" text-anchor="middle" dominant-baseline="middle" fill="#f97316" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">6</text><text x="85.3" y="275" text-anchor="middle" dominant-baseline="middle" fill="#f97316" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">5</text><text x="256" y="275" text-anchor="middle" dominant-baseline="middle" fill="#185b93" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">U</text><text x="256" y="445" text-anchor="middle" dominant-baseline="middle" fill="#185b93" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">D</text><text x="426.6" y="445" text-anchor="middle" dominant-baseline="middle" fill="#f97316" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">0</text></svg>`;
      const svgDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><line x1="170.6" y1="20" x2="170.6" y2="492" stroke="#cdd9e5" stroke-width="24" stroke-linecap="round" /><line x1="341.3" y1="20" x2="341.3" y2="492" stroke="#cdd9e5" stroke-width="24" stroke-linecap="round" /><line x1="20" y1="170.6" x2="492" y2="170.6" stroke="#cdd9e5" stroke-width="24" stroke-linecap="round" /><line x1="20" y1="341.3" x2="492" y2="341.3" stroke="#cdd9e5" stroke-width="24" stroke-linecap="round" /><text x="85.3" y="105" text-anchor="middle" dominant-baseline="middle" fill="#60a5fa" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">J</text><text x="256" y="105" text-anchor="middle" dominant-baseline="middle" fill="#ffa726" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">1</text><text x="426.6" y="105" text-anchor="middle" dominant-baseline="middle" fill="#ffa726" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">6</text><text x="85.3" y="275" text-anchor="middle" dominant-baseline="middle" fill="#ffa726" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">5</text><text x="256" y="275" text-anchor="middle" dominant-baseline="middle" fill="#60a5fa" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">U</text><text x="256" y="445" text-anchor="middle" dominant-baseline="middle" fill="#60a5fa" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">D</text><text x="426.6" y="445" text-anchor="middle" dominant-baseline="middle" fill="#ffa726" font-family="'Outfit', sans-serif" font-size="160" font-weight="700">0</text></svg>`;
      logoContainer.innerHTML = isDarkMode ? svgDark : svgLight;
    }

    if (usernameEl) usernameEl.textContent = t.guest || "Anónimo";

    if (rankEl) {
      const statsStr = localStorage.getItem("jigsudo_user_stats");
      const currentRP = statsStr ? JSON.parse(statsStr).currentRP || 0 : 0;
      const rankData = getRankData(currentRP);
      const rankKey = rankData.rank.nameKey;
      rankEl.textContent = t[rankKey] || rankKey;
    }

    if (dateEl) {
      dateEl.textContent = t.basic_edition_label || "Basic Edition";
    }

    // 2. Populate Session Stats
    const sessionScoreFormat = new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    document.getElementById("vsc-stat-time").textContent = formatTime(stats.totalTime);
    document.getElementById("vsc-stat-streak").textContent = stats.streak || "1";
    document.getElementById("vsc-stat-errors").textContent = stats.errors || "0";
    document.getElementById("vsc-stat-score").textContent = sessionScoreFormat.format(stats.score);

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
        const scard = document.createElement("div");
        scard.className = "sc-stage-item";
        scard.innerHTML = `
          <span class="sc-item-label">${label}</span>
          <div class="sc-item-stats">
            <div class="sc-mini-stat">
              <span class="sc-mini-icon">⏱️</span>
              <span class="sc-mini-val">${formatTime(timeMs)}</span>
            </div>
          </div>
        `;
        stageList.appendChild(scard);
      });
    }

    // 4. Capture
    await new Promise((r) => setTimeout(r, 500));
    card.style.display = "flex";
    const canvas = await window.html2canvas(card, {
      backgroundColor: getComputedStyle(document.body).getPropertyValue("--bg-paper") || "#f8fafc",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: 1080,
    });
    card.style.display = "";

    // 5. Filename & Download
    const dateStr = new Date().toISOString().split("T")[0];
    const fileName = `jigsudo-victory-demo-${dateStr}.png`;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], fileName, { type: "image/png" });
      const shareUrl = "https://corolado.itch.io/jigsudo";
      const shareData = {
        title: "¡DESAFÍO COMPLETADO EN JIGSUDO DEMO!",
        text: (t.share_stats_msg || "¡Mira mi progreso en Jigsudo! 🧩✨") + `\n\n${shareUrl}`,
        files: [file],
      };
      if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share(shareData);
        } catch (err) {
          if (err.name !== "AbortError") downloadFallback(canvas, fileName);
        }
      } else {
        downloadFallback(canvas, fileName);
      }
    }, "image/png");
  } catch (err) {
    console.error("Failed to generate victory card:", err);
    showToast(t.err_generating_image || "Error al generar la imagen ❌");
  }
}

function downloadFallback(canvas, fileName) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  link.click();
}
