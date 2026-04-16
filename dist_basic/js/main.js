/* Main Entry Point */

import { initHome } from "./home.js?v=1.3.1";
import { initLanguage } from "./i18n.js?v=1.3.1";
import { initSudoku } from "./sudoku.js?v=1.3.1";
import { initHistory } from "./history.js?v=1.3.1";
import { initGuide } from "./guide.js?v=1.3.1"; 
import { gameManager } from "./game-manager.js?v=1.3.1";
import { CONFIG } from "./config.js?v=1.3.1"; 
import { router } from "./router.js?v=1.3.1"; 
import { initSidebar } from "./sidebar.js?v=1.3.1";
import { initChangelog } from "./changelog.js?v=1.3.1";
import { initBasicEdition } from "./basic-edition.js?v=1.3.1";

// Boot Sequence
const systemLog = console.log;

function isNewerVersion(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return true;
    if (numA < numB) return false;
  }
  return false;
}

async function startApp() {
  if (CONFIG.debugMode) {
    document.body.classList.add("debug-mode");
    systemLog("DEBUG MODE ACTIVE");
  } else {
    console.log = function () {};
  }

  if (CONFIG.betaMode) {
    document.body.classList.add("beta-mode");
  }

  console.log("Jigsudo App Starting...");

  try {
    await gameManager.ready;
  } catch (err) {
    console.error("[Main] Game Manager failed to initialize:", err);
  }

  initLanguage();
  initSidebar();
  initHome();
  initSudoku();
  initHistory(); 
  initGuide(); 
  initChangelog(); 
  initBasicEdition(); 

  router.init();

  // First Visit Tutorial Setup (Simplified for Demo)
  const tutorialDone = localStorage.getItem("jigsudo_tutorial_done");
  const isHome = !window.location.hash || window.location.hash === "#home" || window.location.hash === "#";
  if (!tutorialDone && isHome) {
    localStorage.setItem("jigsudo_tutorial_done", "true");
    setTimeout(() => {
      if (!window.location.hash || window.location.hash === "#home" || window.location.hash === "#") {
        router.navigateTo("#home/tutorial");
      }
    }, 500);
  }

  // DEBUG TOOLS: Exposed only in Debug Mode
  if (CONFIG.debugMode) {
    window.resetToday = () => gameManager.resetCurrentGame();

    window.magicWand = async () => {
      const { debugAutoMatch } = await import("./memory.js?v=1.3.1");
      setTimeout(() => {
        debugAutoMatch();
      }, 150);
    };

    console.log("🛠️ Debug Commands Available:");
    console.log("- resetToday(): Resets only current puzzle progress.");
    console.log("- magicWand(): Automagically solves the current step.");
  }

  // Global Share Function (Legacy support/Footer)
  window.shareApp = async function () {
    const { translations } = await import("./translations.js?v=1.3.1");
    const { getCurrentLang } = await import("./i18n.js?v=1.3.1");
    const lang = getCurrentLang();
    const t = translations[lang];

    const shareData = {
      title: "Jigsudo Demo",
      text: t.share_text,
      url: "https://corolado.itch.io/jigsudo",
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} Juega la demo aquí: ${shareData.url}`);
        const { showToast } = await import("./ui.js?v=1.3.1");
        showToast(t.toast_share_success);
      }
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}

console.log("Main Loaded. Daily Seed:", gameManager.currentSeed);

function displayVersion() {
  if (CONFIG.isBasicEdition) return;
  const footerBottom = document.querySelector(".footer-bottom");
  if (footerBottom) {
    footerBottom.appendChild(document.createTextNode(" | "));
    const versionSpan = document.createElement("span");
    versionSpan.className = "version-tag";
    versionSpan.innerText = CONFIG.version;
    footerBottom.appendChild(versionSpan);
  }
}

displayVersion();
