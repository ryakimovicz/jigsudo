/* Search Logic (Sopa de Números) */
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";

// State could go here (e.g., words to find, numbers to highlighting)

export function initSearch() {
  console.log("Initializing Search Stage...");
  // Logic to initialize the number search game
  // e.g., finding patterns in the sudoku grid
}

export function transitionToSearch() {
  console.log("Transitioning to Number Search...");

  const gameSection = document.getElementById("memory-game");
  if (!gameSection) return;

  // 1. Switch Mode Classes
  gameSection.classList.remove("peaks-mode");
  gameSection.classList.add("search-mode");

  // 2. Update Title
  const lang = getCurrentLang();
  const t = translations[lang];
  const titleEl = document.querySelector(".header-title-container h2");

  if (titleEl) {
    titleEl.style.transition = "opacity 0.5s ease";
    titleEl.style.opacity = "0";
    setTimeout(() => {
      titleEl.textContent = t.game_search || "Sopa de Números";
      titleEl.style.opacity = "1";
    }, 500);
  }

  // 3. Update Tooltip
  const tooltipTitle = document.querySelector(".info-tooltip h3");
  const tooltipDesc = document.querySelector(".info-tooltip p");

  if (tooltipTitle && tooltipDesc) {
    tooltipTitle.style.transition = "opacity 0.5s ease";
    tooltipDesc.style.opacity = "0";
    setTimeout(() => {
      tooltipTitle.textContent = t.search_help_title || "Sopa de Números";
      tooltipDesc.innerHTML =
        t.search_help_desc || "Encuentra las secuencias numéricas ocultas.";
      tooltipTitle.style.opacity = "1";
      tooltipDesc.style.opacity = "1";
    }, 500);
  }

  // 4. Update Game Manager Logic if not already updated
  if (gameManager.getState().progress.currentStage !== "search") {
    // gameManager.advanceStage("search"); // handled by caller
  }

  // 5. Hide Peaks Stats
  const statsEl = document.getElementById("peaks-stats");
  if (statsEl) statsEl.classList.add("hidden");

  // 6. Initialize Search Logic
  initSearch();
}
