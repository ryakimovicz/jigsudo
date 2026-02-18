import { RANKS } from "./ranks.js";
import { CONFIG } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  initInfoPage();
});

function initInfoPage() {
  const ranksContainer = document.getElementById("ranks-table-container");
  if (!ranksContainer) return;

  renderRanksTable(ranksContainer);

  // Set Version
  const versionEl = document.getElementById("app-version");
  if (versionEl && CONFIG.version) {
    versionEl.textContent = CONFIG.version;
  }

  // Sidebar Navigation Handler
  const navInfo = document.getElementById("nav-info");
  if (navInfo) {
    navInfo.addEventListener("click", () => {
      showInfoSection();
      const sidebarBtn = document.getElementById("sidebar-toggle");
      // Mobile: Close sidebar on click
      if (window.innerWidth <= 768 && sidebarBtn) {
        // Trigger close via existing sidebar logic (assumes sidebar-overlay click or toggle)
        document.getElementById("sidebar-overlay").click();
      }
    });
  }

  // Check Hash on Load
  if (window.location.hash === "#info") {
    showInfoSection();
  }
}

function showInfoSection() {
  // Hide all main sections explicitly
  const sectionsToHide = [
    "menu-content",
    "game-section",
    "profile-section",
    "history-section",
    "guide-section",
  ];

  sectionsToHide.forEach((id) => {
    document.getElementById(id)?.classList.add("hidden");
  });

  // Also hide main direct children as fallback
  document.querySelectorAll("main > section").forEach((el) => {
    if (el.id !== "info-section") el.classList.add("hidden");
  });

  // Show Info Section
  const infoSection = document.getElementById("info-section");
  if (infoSection) {
    infoSection.classList.remove("hidden");
    // Update URL without reload
    history.pushState(null, null, "#info");
  }
}

function renderRanksTable(container) {
  container.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "ranks-grid";

  // Get current user RP to highlight (optional, needs user state)
  // For now, static list.

  RANKS.forEach((rank) => {
    const row = document.createElement("div");
    row.className = "rank-row glass-panel"; // Reuse glass style if needed, or custom class

    row.innerHTML = `
            <div class="rank-icon">${rank.icon}</div>
            <div class="rank-details">
                <span class="rank-name" data-i18n="${rank.nameKey}">${rank.nameKey}</span>
                <span class="rank-level">Nivel ${rank.id}</span>
            </div>
            <div class="rank-req">${rank.minRP} RP</div>
        `;

    // Translate name if i18n available (using existing system)
    /* 
           Note: The system seems to use data-i18n attributes handled by a translation manager.
           We'll rely on that system picking up the new elements or manually translate if needed.
           Given `ranks.js` has `nameKey`, we should ensure those keys exist in translations.
           For now, we'll display the nameKey as fallback or mapped name.
           Actually, `ranks.js` has `nameKey` like "rank_0". 
           Let's map them to Spanish names directly for now or use the key.
        */

    // Map keys to Spanish names manually for this view if translation keys aren't in config
    // Or better: Use the key and let the translation system handle it if it runs periodically.
    // The `nameKey` in `ranks.js` maps to `translations` object.

    grid.appendChild(row);
  });

  container.appendChild(grid);
}

// Export for external use if needed
export { showInfoSection };
