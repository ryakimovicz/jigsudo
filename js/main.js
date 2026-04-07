/* Main Entry Point */

import { initHome } from "./home.js";
import { initLanguage } from "./i18n.js";
import { initSudoku } from "./sudoku.js";
import { initHistory } from "./history.js";
import { initGuide, openTutorialModal } from "./guide.js"; // Guide & Tutorial Import
import { gameManager } from "./game-manager.js";
import {
  initAuth,
  loginUser,
  registerUser,
  logoutUser,
  loginWithGoogle,
} from "./auth.js"; // Auth Import
import { initProfile, showProfile } from "./profile.js"; // Profile Import
import { CONFIG } from "./config.js"; // Keep CONFIG for displayVersion
import { router } from "./router.js"; // Router Import
import { closeSidebar, initSidebar } from "./sidebar.js";
import { toggleModal } from "./ui.js";

// Boot Sequence
// Capture native logging before suppression
const systemLog = console.log;

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

    if (serverVersion && serverVersion !== localVersion) {
      console.warn(
        `[Updater] New version available: ${serverVersion} (Current: ${localVersion})`,
      );
      
      const { showUpdateAlert, showUpdateToast } = await import("./ui.js");
      
      // 2. Aggressive Update Strategy
      const attempts = Number(sessionStorage.getItem("jigsudo_update_attempts") || 0);

      if (attempts < 1) {
        // --- FIRST TRY: Silent Auto-Reload ---
        sessionStorage.setItem("jigsudo_update_attempts", "1");
        sessionStorage.setItem("jigsudo_last_update_attempt", Date.now()); // Cooldown trigger
        
        await showUpdateToast();
        
        // Wait 3 seconds to let the user see the toast, then force reload
        setTimeout(() => {
          const url = new URL(window.location.href);
          url.searchParams.set("u", Date.now());
          window.location.replace(url.toString());
        }, 3000);
      } else {
        // --- SECOND TRY: Sticky Cache! Show Recovery Modal ---
        showUpdateAlert(true); // true = Show sticky cache warning
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
    const debugBtn = document.getElementById("debug-help-btn");

    // Listener handling delegated to memory.js (debugAutoMatch) to avoid double-firing
    // and "No solver for this state" warnings.
  }

  console.log("Jigsudo App Starting...");

  console.log("Jigsudo App Starting...");

  // Wait for Game Manager to fetch static puzzle or generate local
  try {
    await gameManager.ready;
  } catch (err) {
    console.error("[Main] Game Manager failed to initialize:", err);
    // Ensure we don't block the UI entirely
  }

  initLanguage();
  initSidebar();
  initHome();
  initSudoku();
  initAuth(); // Initialize Firebase Auth listener
  initProfile(); // Profile Module
  initHistory(); // History Module
  initGuide(); // Guide Module

  // Initialize Router LAST to handle initial hash
  router.init();

  attachAuthListeners();

  // FIRST VISIT TUTORIAL POPUP - Only for new, unauthenticated users
  window.addEventListener("authReady", (e) => {
    const user = e.detail.user;
    const tutorialDone = localStorage.getItem("jigsudo_tutorial_done");
    
    // If user is authenticated (not anonymous), they've played before
    if (user && !user.isAnonymous) {
      if (!tutorialDone) localStorage.setItem("jigsudo_tutorial_done", "true");
      return;
    }

    // Only show if not done, and we are at Home
    const isHome = !window.location.hash || window.location.hash === "#home" || window.location.hash === "#";
    
    if (!tutorialDone && isHome) {
      // Set the flag IMMEDIATELY so it doesn't show again on reloads
      localStorage.setItem("jigsudo_tutorial_done", "true");

      // Small delay to ensure everything is rendered before opening the modal
      setTimeout(() => {
        // Re-check hash in case user navigated away during the delay
        const currentHash = window.location.hash;
        if (!currentHash || currentHash === "#home" || currentHash === "#") {
          router.navigateTo("#home/tutorial");
        }
      }, 500);
    }
  }, { once: true });

  // Background update check
  checkForUpdates();

  // DEBUG TOOLS: Exposed only in Debug Mode
  if (CONFIG.debugMode) {
    window.resetToday = () => gameManager.resetCurrentGame();

    window.resetAccount = async () => {
      const { getCurrentUser } = await import("./auth.js");
      const { wipeUserData } = await import("./db.js");
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
      const { debugAutoMatch } = await import("./memory.js");
      debugAutoMatch();
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
    // Initial state: login
    window.history.pushState({ authModal: true, view: "login" }, "");
    updateAuthView("login");

    // UI Cleanup
    document.getElementById("profile-dropdown")?.classList.add("hidden");
    document.getElementById("auth-dropdown")?.classList.add("hidden");
    if (window.innerWidth <= 768) {
      document.body.classList.add("header-condensed");
      closeSidebar(false); // Close visually but keep state in history for restoration
    }
  };

  const closeAuthModal = (shouldGoBack = true) => {
    if (!loginModal || loginModal.classList.contains("hidden")) return;
    toggleModal(loginModal, false);

    // If we closed manually, we need to "pop" all auth states from history.
    // We might have one (login) or two (login -> register).
    // We go back until the state no longer has authModal.
    if (shouldGoBack && window.history.state?.authModal) {
      window.history.back();
    }
  };

  // Open Modal (Home, Sidebar, or Profile)
  const loginTriggers = ["btn-login-trigger", "btn-profile-login-guest"];
  loginTriggers.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener("click", openAuthModal);
    }
  });

  // Close Modal
  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeAuthModal());
  }

  // Handle Back Button for Auth Modal
  window.addEventListener("popstate", (e) => {
    const isAuthModalOpen = !loginModal.classList.contains("hidden");

    if (e.state && e.state.authModal) {
      // We are in an auth state
      if (!isAuthModalOpen) toggleModal(loginModal, true);
      updateAuthView(e.state.view);
    } else if (isAuthModalOpen) {
      // State no longer auth, but modal is open -> Close it
      closeAuthModal(false);
    }
  });

  // Profile Navigation (Logged In)

  // Profile Navigation (Logged In)
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

  // Profile Navigation (Guest)
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

  // Switch Forms
  const linkRegister = document.getElementById("switch-to-register");
  const linkLogin = document.getElementById("switch-to-login");
  const formLogin = document.getElementById("login-form");
  const formRegister = document.getElementById("register-form");

  if (linkRegister) {
    linkRegister.addEventListener("click", (e) => {
      e.preventDefault();
      // Push Register state
      window.history.pushState({ authModal: true, view: "register" }, "");
      updateAuthView("register");
    });
  }

  if (linkLogin) {
    linkLogin.addEventListener("click", (e) => {
      e.preventDefault();
      // Going back to login: If we are in register state, just go back.
      if (window.history.state?.view === "register") {
        window.history.back();
      } else {
        // Fallback
        updateAuthView("login");
      }
    });
  }

  // Logout - Removed from Menu
  // Profile logout handled in profile.js

  // Toggle Password Visibility
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      // Find the input associated with this button
      const wrapper = e.currentTarget.closest(".password-wrapper"); // Use currentTarget for button
      const input = wrapper.querySelector("input");

      const newType = input.type === "password" ? "text" : "password";

      // Update this input
      input.type = newType;
      e.currentTarget.textContent = newType === "text" ? "🙈" : "👁️";

      // If this is the Register Password field, also toggle the Confirm field
      if (input.id === "register-password") {
        const confirmInput = document.getElementById(
          "register-password-confirm",
        );
        if (confirmInput) {
          confirmInput.type = newType;
        }
      }
    });
  });

  // Google Login Buttons
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

  // Submit Handlers
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
    const confirmPass = document.getElementById(
      "register-password-confirm",
    ).value;
    const errBox = document.getElementById("auth-error-msg");

    errBox.classList.add("hidden");

    if (pass !== confirmPass) {
      const { translations } = await import("./translations.js");
      const { getCurrentLang } = await import("./i18n.js");
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

  // --- SOCIAL SHARE LOGIC ---
  window.shareApp = async function () {
    const { translations } = await import("./translations.js");
    const { getCurrentLang } = await import("./i18n.js");
    const lang = getCurrentLang();
    const t = translations[lang];

    const shareData = {
      title: "Jigsudo",
      text: t.share_text,
      url: window.location.href, // Or hardcoded 'https://jigsudo.com'
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        console.log("Shared successfully");
      } else {
        // Fallback for Desktop
        await navigator.clipboard.writeText(
          `${shareData.text} Juega gratis aquí: ${shareData.url}`,
        );
        const { showToast } = await import("./ui.js");
        showToast(t.toast_share_success);
      }
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };
}

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}

console.log("Main Loaded. Daily Seed:", gameManager.currentSeed);

// Display Version
// Display Version
function displayVersion() {
  const footerBottom = document.querySelector(".footer-bottom");
  if (footerBottom) {
    // Separator
    footerBottom.appendChild(document.createTextNode(" | "));

    // Version Tag
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
