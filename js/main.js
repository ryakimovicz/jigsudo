/* Main Entry Point */

import { initHome } from "./home.js?v=1.3.6";
import { initLanguage } from "./i18n.js?v=1.3.6";
import { initSudoku } from "./sudoku.js?v=1.3.6";
import { initHistory } from "./history.js?v=1.3.6";
import { initGuide, openTutorialModal } from "./guide.js?v=1.3.6"; // Guide & Tutorial Import
import { gameManager } from "./game-manager.js?v=1.3.6";
import {
  initAuth,
  loginUser,
  registerUser,
  logoutUser,
  loginWithGoogle,
} from "./auth.js?v=1.3.6"; // Auth Import
import { initProfile, showProfile } from "./profile.js?v=1.3.6"; // Profile Import
import { CONFIG } from "./config.js?v=1.3.6"; // Keep CONFIG for displayVersion
import { router } from "./router.js?v=1.3.6"; // Router Import
import { closeSidebar, initSidebar } from "./sidebar.js?v=1.3.6";
import { initChangelog } from "./changelog.js?v=1.3.6";
import { toggleModal } from "./ui.js?v=1.3.6";
import { isAtGameRoute } from "./utils/route-utils.js?v=1.3.6";
import { checkSeasonMigration } from "./migration.js?v=1.3.6";

// v1.3.0: Season Transition Barrier (Absolute Blocking)
// We check this at the top level BEFORE ANY initialization to prevent 
// "Cloud Echo" saves from background modules like GameManager.
await checkSeasonMigration();

// Boot Sequence
// Capture native logging before suppression
const systemLog = console.log;

/**
 * Helper to compare version strings (v1.1.0 vs v1.1.1)
 * Returns true only if A > B semantically.
 */
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

/**
 * Checks the server for a newer version by fetching config.js with a cache-buster.
 */
async function checkForUpdates() {
  try {
    // 1. Prevent update-loop-spam (10s cooldown)
    const lastAttempt = sessionStorage.getItem("jigsudo_last_update_attempt");
    if (lastAttempt && Date.now() - Number(lastAttempt) < 10000) {
      console.log("[Updater] In cooldown, skipping check.");
      return;
    }

    const res = await fetch(`./js/config.js?t=${Date.now()}`);
    if (!res.ok) return;
    const text = await res.text();

    const match = text.match(/version:\s*["']v?([\d\.]+)["']/);
    const serverVersion = match ? match[1] : null;

    // Clean version strings for comparison (e.g. "1.0.3" vs "v1.0.3")
    const localVersion = CONFIG.version.replace("v", "");

    if (serverVersion && isNewerVersion(serverVersion, localVersion)) {
      // PROTECTION: If user is in a game or history detail, don't even prompt yet
      const isAtGame = isAtGameRoute();
      const isAtHistoryDetail = window.location.hash.startsWith("#history/") && window.location.hash.split("/").length > 1; // Keeping more detailed check for history menu vs game
      
      if (isAtGame || isAtHistoryDetail) {
        console.log("[Updater] New version detected, but delaying prompt until user leaves session.");
        return;
      }
      
      console.warn(
        `[Updater] New version available: ${serverVersion} (Current: ${localVersion})`,
      );
      
      const { showUpdateToast } = await import("./ui.js?v=1.3.6");
      
      // 2. Aggressive Update Strategy
      const attempts = Number(sessionStorage.getItem("jigsudo_update_attempts") || 0);

      if (attempts < 1) {
        // --- FIRST TRY: Silent Auto-Reload ---
        sessionStorage.setItem("jigsudo_update_attempts", "1");
        sessionStorage.setItem("jigsudo_last_update_attempt", Date.now()); // Cooldown trigger
        
        await showUpdateToast();
        
        // Wait 3 seconds to let the user see the toast, then force reload
        setTimeout(() => {
          // PROTECTION: If user entered a game during the 3s delay, don't reload
          const isAtGame = isAtGameRoute();
          const isAtHistoryDetail = window.location.hash.startsWith("#history/") && window.location.hash.split("/").length > 1;
          
          if (isAtGame || isAtHistoryDetail) {
            console.log("[Updater] User is active in a session. Skipping auto-reload to prevent progress loss.");
            return;
          }

          const url = new URL(window.location.href);
          url.searchParams.set("u", Date.now());
          window.location.replace(url.toString());
        }, 3000);
      } else {
        // If it already failed once, do nothing more to avoid being annoying
        console.log("[Updater] Update already attempted once. Silent fail to avoid annoyance.");
      }
    }
  } catch (err) {
    // Silent fail
  }
}

async function startApp() {
  // Handle Debug Mode
  if (CONFIG.debugMode) {
    document.body.classList.add("debug-mode");
    systemLog("DEBUG MODE ACTIVE");
  } else {
    // Suppress console.log in production/non-debug
    console.log = function () {};
  }

  // Handle Beta Mode (Help Button)
  if (CONFIG.betaMode) {
    document.body.classList.add("beta-mode");
  }

  console.log("Jigsudo App Starting...");

  // Wait for Game Manager to fetch static puzzle or generate local
  try {
    await gameManager.ready;
  } catch (err) {
    console.error("[Main] Game Manager failed to initialize:", err);
  }

  initLanguage();
  initSidebar();
  initHome();
  initSudoku();
  initAuth(); // Initialize Firebase Auth listener
  initProfile(); // Profile Module
  initHistory(); // History Module
  initGuide(); // Guide Module
  initChangelog(); // Changelog Module

  // Initialize Router LAST to handle initial hash
  router.init();

  attachAuthListeners();

  // FIRST VISIT TUTORIAL POPUP - Only for new, unauthenticated users
  window.addEventListener("authReady", (e) => {
    const user = e.detail.user;
    const tutorialDone = localStorage.getItem("jigsudo_tutorial_done");
    
    if (user && !user.isAnonymous) {
      if (!tutorialDone) localStorage.setItem("jigsudo_tutorial_done", "true");
      return;
    }

    const isHome = !window.location.hash || window.location.hash === "#home" || window.location.hash === "#";
    
    if (!tutorialDone && isHome) {
      localStorage.setItem("jigsudo_tutorial_done", "true");

      setTimeout(() => {
        const currentHash = window.location.hash;
        if (!currentHash || currentHash === "#home" || currentHash === "#") {
          router.navigateTo("#home/tutorial");
        }
      }, 500);
    }
  }, { once: true });

  checkForUpdates();

  // DEBUG TOOLS: Exposed only in Debug Mode
  if (CONFIG.debugMode) {
    window.resetToday = () => gameManager.resetCurrentGame();

    window.resetAccount = async () => {
      const { getCurrentUser } = await import("./auth.js?v=1.3.6");
      const { wipeUserData } = await import("./db.js?v=1.3.6");
      const user = getCurrentUser();

      if (
        confirm(
          "¿Seguro que quieres borrar TODA TU CUENTA y progreso? Esto no se puede deshacer.",
        )
      ) {
        if (user) {
          console.log("Wiping remote data...");
          await wipeUserData(user.uid);
        }
        console.log("Clearing local storage...");
        localStorage.clear();
        console.log("Reloading...");
        window.location.reload();
      }
    };

    window.magicWand = async () => {
      const { debugAutoMatch } = await import("./memory.js?v=1.3.6");
      // v1.3.3: Artificial delay to prevent anti-cheat "too fast" errors on server
      setTimeout(() => {
        debugAutoMatch();
      }, 150);
    };

    console.log("🛠️ Debug Commands Available:");
    console.log("- resetToday(): Resets only current puzzle progress.");
    console.log("- resetAccount(): Wipes entire account and local data.");
    console.log("- magicWand(): Automagically solves the current step.");
  }
}

function attachAuthListeners() {
  const loginModal = document.getElementById("login-modal");
  const btnLoginTrigger = document.getElementById("btn-login-trigger");
  const btnLogout = document.getElementById("btn-logout");
  const closeBtn = document.getElementById("login-modal-cancel");

  // --- Auth Modal Management (History Aware) ---
  const updateAuthView = (view) => {
    if (view === "login") {
      formRegister.classList.add("hidden");
      formRegister.classList.remove("active");
      formLogin.classList.remove("hidden");
      setTimeout(() => formLogin.classList.add("active"), 10);
    } else {
      formLogin.classList.add("hidden");
      formLogin.classList.remove("active");
      formRegister.classList.remove("hidden");
      setTimeout(() => formRegister.classList.add("active"), 10);
    }
  };

  const openAuthModal = () => {
    toggleModal(loginModal, true);
    window.history.pushState({ authModal: true, view: "login" }, "");
    updateAuthView("login");

    document.getElementById("profile-dropdown")?.classList.add("hidden");
    document.getElementById("auth-dropdown")?.classList.add("hidden");
    if (window.innerWidth <= 768) {
      document.body.classList.add("header-condensed");
      closeSidebar(false);
    }
  };

  const closeAuthModal = (shouldGoBack = true) => {
    if (!loginModal || loginModal.classList.contains("hidden")) return;
    toggleModal(loginModal, false);
    if (shouldGoBack && window.history.state?.authModal) {
      window.history.back();
    }
  };

  const loginTriggers = ["btn-login-trigger", "btn-profile-login-guest"];
  loginTriggers.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", openAuthModal);
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeAuthModal());
  }

  window.addEventListener("popstate", (e) => {
    const isAuthModalOpen = !loginModal.classList.contains("hidden");

    if (e.state && e.state.authModal) {
      if (!isAuthModalOpen) toggleModal(loginModal, true);
      updateAuthView(e.state.view);
    } else if (isAuthModalOpen) {
      closeAuthModal(false);
    }
  });

  const btnViewProfile = document.getElementById("btn-view-profile");
  if (btnViewProfile) {
    btnViewProfile.addEventListener("click", () => {
      showProfile();
      document.getElementById("profile-dropdown")?.classList.add("hidden");
      const authDropdown = document.getElementById("auth-dropdown");
      if (authDropdown) authDropdown.classList.add("hidden");
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  }

  const btnGuestProfile = document.getElementById("btn-guest-profile");
  if (btnGuestProfile) {
    btnGuestProfile.addEventListener("click", () => {
      showProfile();
      document.getElementById("profile-dropdown")?.classList.add("hidden");
      const authDropdown = document.getElementById("auth-dropdown");
      if (authDropdown) authDropdown.classList.add("hidden");
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  }

  const linkRegister = document.getElementById("switch-to-register");
  const linkLogin = document.getElementById("switch-to-login");
  const formLogin = document.getElementById("login-form");
  const formRegister = document.getElementById("register-form");

  if (linkRegister) {
    linkRegister.addEventListener("click", (e) => {
      e.preventDefault();
      window.history.pushState({ authModal: true, view: "register" }, "");
      updateAuthView("register");
    });
  }

  if (linkLogin) {
    linkLogin.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.history.state?.view === "register") {
        window.history.back();
      } else {
        updateAuthView("login");
      }
    });
  }

  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const wrapper = e.currentTarget.closest(".password-wrapper");
      const input = wrapper.querySelector("input");
      const newType = input.type === "password" ? "text" : "password";
      input.type = newType;
      e.currentTarget.textContent = newType === "text" ? "🙈" : "👁️";

      if (input.id === "register-password") {
        const confirmInput = document.getElementById("register-password-confirm");
        if (confirmInput) confirmInput.type = newType;
      }
    });
  });

  document.querySelectorAll(".btn-login-google").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const errBox = document.getElementById("auth-error-msg");
      if (errBox) errBox.classList.add("hidden");

      const res = await loginWithGoogle();
      if (!res.success) {
        if (errBox) {
          errBox.textContent = res.error;
          errBox.classList.remove("hidden");
        }
      } else {
        loginModal.classList.add("hidden");
      }
    });
  });

  formLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;
    const errBox = document.getElementById("auth-error-msg");
    errBox.classList.add("hidden");
    const res = await loginUser(email, pass);
    if (!res.success) {
      errBox.textContent = res.error;
      errBox.classList.remove("hidden");
    } else {
      loginModal.classList.add("hidden");
    }
  });

  formRegister?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const pass = document.getElementById("register-password").value;
    const confirmPass = document.getElementById("register-password-confirm").value;
    const errBox = document.getElementById("auth-error-msg");

    errBox.classList.add("hidden");

    if (pass !== confirmPass) {
      const { translations } = await import("./translations.js?v=1.3.6");
      const { getCurrentLang } = await import("./i18n.js?v=1.3.6");
      const lang = getCurrentLang();
      const t = translations[lang];
      errBox.textContent = t.toast_pw_mismatch || "Passwords do not match.";
      errBox.classList.remove("hidden");
      return;
    }

    const res = await registerUser(email, pass, user);
    if (!res.success) {
      errBox.textContent = res.error;
      errBox.classList.remove("hidden");
    } else {
      loginModal.classList.add("hidden");
    }
  });

  window.shareApp = async function () {
    const { translations } = await import("./translations.js?v=1.3.6");
    const { getCurrentLang } = await import("./i18n.js?v=1.3.6");
    const lang = getCurrentLang();
    const t = translations[lang];

    const shareData = {
      title: "Jigsudo",
      text: t.share_text,
      url: "https://jigsudo.com",
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} Juega gratis aquí: ${shareData.url}`);
        const { showToast } = await import("./ui.js?v=1.3.6");
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
  const footerBottom = document.querySelector(".footer-bottom");
  if (footerBottom) {
    footerBottom.appendChild(document.createTextNode(" | "));
    const versionSpan = document.createElement("span");
    versionSpan.className = "version-tag";
    versionSpan.innerText = CONFIG.version;
    footerBottom.appendChild(versionSpan);
  }
  systemLog(
    `%c JIGSUDO ${CONFIG.version} cargado correctamente`,
    "background: #F37825; color: white; padding: 2px 5px; border-radius: 3px;",
  );
}

displayVersion();
