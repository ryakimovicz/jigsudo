import { auth } from "./firebase-config.js?v=1.4.3";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import { initLanguage, getCurrentLang } from "./i18n.js?v=1.4.3";
import { initSidebar, closeSidebar } from "./sidebar.js?v=1.4.3";
import { translations } from "./translations.js?v=1.4.3";
import { CONFIG } from "./config.js?v=1.4.3";
import { toggleModal, showToast } from "./ui.js?v=1.4.3";
import { getRankData } from "./ranks.js?v=1.4.3";
import { loginUser, registerUser, loginWithGoogle, initForgotPasswordUI } from "./auth.js?v=1.4.3";


// Initialize Sidebar
initSidebar();

// Inject necessary modals for auth/parity before other logic
injectModals();
attachAuthListeners();
// Note: initForgotPasswordUI is self-invoked by auth.js on import, 
// but we call it here again to ensure it catches the freshly injected modals.
initForgotPasswordUI();

// Initialize language support
initLanguage();

// Populate Header Data
updateHeaderInfo();


// Listen for language changes to update header
window.addEventListener("languageChanged", updateHeaderInfo);

const sidebar = document.getElementById("side-sidebar");
if (sidebar) {
  // Handle sidebar navigation
  const navHome = document.getElementById("nav-home");
  const navHistory = document.getElementById("nav-history");
  const navHowTo = document.getElementById("nav-how-to");
  const navChangelog = document.getElementById("nav-changelog");

  if (navHome)
    navHome.addEventListener("click", () => (window.location.href = "../#home"));
  if (navHistory)
    navHistory.addEventListener("click", () => (window.location.href = "../#history"));
  if (navHowTo)
    navHowTo.addEventListener("click", () => (window.location.href = "../#guide"));
  if (navChangelog)
    navChangelog.addEventListener("click", () => (window.location.href = "../#changelog"));

  // Handle Account and Settings dropdowns
  const btnAuth = document.getElementById("btn-auth");
  const authDropdown = document.getElementById("auth-dropdown");
  const btnProfile = document.getElementById("btn-profile");
  const profileDropdown = document.getElementById("profile-dropdown");

  if (btnAuth && authDropdown) {
    btnAuth.addEventListener("click", (e) => {
      e.stopPropagation();
      authDropdown.classList.toggle("hidden");
      if (profileDropdown) profileDropdown.classList.add("hidden");
    });
  }

  if (btnProfile && profileDropdown) {
    btnProfile.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("hidden");
      if (authDropdown) authDropdown.classList.add("hidden");
    });
  }

  // Close dropdowns on click outside
  document.addEventListener("click", (e) => {
    if (authDropdown && !authDropdown.contains(e.target) && e.target !== btnAuth) {
      authDropdown.classList.add("hidden");
    }
    if (profileDropdown && !profileDropdown.contains(e.target) && e.target !== btnProfile) {
      profileDropdown.classList.add("hidden");
    }
  });
}

// Theme Switching Logic
initThemeSwitcher();

// Settings Toggles Logic
initSettingsToggles();

// Auth State Listener
initAuthListener();

/**
 * Theme Switcher logic for static pages
 */
function initThemeSwitcher() {
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  const savedTheme = localStorage.getItem("jigsudo_theme") || "auto";

  // Set initial state
  themeRadios.forEach((radio) => {
    if (radio.value === savedTheme) radio.checked = true;
    radio.addEventListener("change", (e) => {
      const newTheme = e.target.value;
      localStorage.setItem("jigsudo_theme", newTheme);
      applyTheme(newTheme);
    });
  });

  // Apply initially
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  let isDark = false;
  if (theme === "dark") {
    isDark = true;
  } else if (theme === "light") {
    isDark = false;
  } else {
    // Auto
    isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  document.body.classList.toggle("dark-mode", isDark);
}

/**
 * Sound and Vibration toggles logic
 */
function initSettingsToggles() {
  const soundToggle = document.getElementById("sound-toggle");
  const soundContainer = document.getElementById("setting-sound-container-modal");
  const vibrationToggle = document.getElementById("vibration-toggle");
  const vibrationContainer = document.getElementById("setting-vibration-container");
  const confirmClearToggle = document.getElementById("confirm-clear-toggle");

  // Sound Visibility: Always show but as disabled/unchecked
  if (soundContainer) {
    soundContainer.style.display = "flex";
  }

  if (soundToggle) {
    // Force sound OFF and remove interactive logic
    soundToggle.checked = false;
    localStorage.setItem("jigsudo_sound", "false");
  }

  // Vibration Visibility based on Device capabilities
  const hasVibration = "vibrate" in navigator;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  const showVibration = hasVibration && isTouchDevice;

  if (vibrationContainer && !showVibration) {
    vibrationContainer.style.display = "none";
  }

  if (vibrationToggle) {
    vibrationToggle.checked = localStorage.getItem("jigsudo_vibration") !== "false";
    vibrationToggle.addEventListener("change", (e) => {
      localStorage.setItem("jigsudo_vibration", e.target.checked);
      if (e.target.checked && navigator.vibrate) {
        try { navigator.vibrate(20); } catch (e) {}
      }
    });
  }

  if (confirmClearToggle) {
    // Note: main app uses jigsudo_skip_clear_confirm with inverted logic
    const isSkipping = localStorage.getItem("jigsudo_skip_clear_confirm") === "true";
    confirmClearToggle.checked = !isSkipping;
    
    confirmClearToggle.addEventListener("change", (e) => {
      localStorage.setItem("jigsudo_skip_clear_confirm", (!e.target.checked).toString());
    });
  }
}

/**
 * Minimal Auth Listener to update sidebar footer
 */
function initAuthListener() {
  const loginWrapper = document.getElementById("login-wrapper");
  const loggedInView = document.getElementById("logged-in-view");
  const userDisplayNameEl = document.getElementById("user-display-name");
  const btnLoginTrigger = document.getElementById("btn-login-trigger");
  const btnGuestProfile = document.getElementById("btn-guest-profile");
  const btnViewProfile = document.getElementById("btn-view-profile");
  const quickStats = document.querySelector(".player-quick-stats");

  const goHome = () => (window.location.href = "../#home");

  if (btnLoginTrigger) {
    btnLoginTrigger.addEventListener("click", () => {
      const loginModal = document.getElementById("login-modal");
      if (loginModal) {
        toggleModal(loginModal, true);
        // Ensure dropdowns are closed
        const aDrop = document.getElementById("auth-dropdown");
        const pDrop = document.getElementById("profile-dropdown");
        if (aDrop) aDrop.classList.add("hidden");
        if (pDrop) pDrop.classList.add("hidden");
      } else {
        // Fallback if modal injection fails (unlikely)
        window.location.href = "../#home";
      }
    });
  }

  if (btnGuestProfile) {
    btnGuestProfile.addEventListener("click", () => {
      window.location.href = "../#profile";
    });
  }

  if (btnViewProfile) {
    btnViewProfile.addEventListener("click", () => {
      const user = auth.currentUser;
      const username = user && user.displayName ? encodeURIComponent(user.displayName.toLowerCase()) : "";
      window.location.href = username ? `../#profile/${username}` : "../#profile";
    });
  }

  onAuthStateChanged(auth, (user) => {
    const isGuest = !user || user.isAnonymous;
    
    if (!isGuest) {
      if (loginWrapper) loginWrapper.classList.add("hidden");
      if (loggedInView) loggedInView.classList.remove("hidden");
      if (userDisplayNameEl) userDisplayNameEl.textContent = user.displayName || "Usuario";
    } else {
      if (loginWrapper) loginWrapper.classList.remove("hidden");
      if (loggedInView) loggedInView.classList.add("hidden");
    }
    
    // Always show quick stats, even for guests (matches main app parity)
    if (quickStats) quickStats.classList.remove("hidden");
    
    // v1.5.2: Proactive maintenance for data consistency on legal pages
    // We use onlyMaintenance: true to avoid claiming the "throne" (Exclusive Session)
    if (!isGuest && user) {
        import("./db.js?v=1.4.3").then(({ callJigsudoFunction }) => {
            callJigsudoFunction("startJigsudoSession", { onlyMaintenance: true })
                .then(() => console.log("[Maintenance] Proactive check (legal) complete."))
                .catch(e => console.warn("[Maintenance] check failed:", e));
        });
    }

    // Populate stats data
    populateMenuStats();
  });
}

/**
 * Populate Sidebar Menu Stats from LocalStorage
 */
function populateMenuStats() {
  const statsStr = localStorage.getItem("jigsudo_user_stats");
  if (!statsStr) return;

  try {
    const stats = JSON.parse(statsStr);
    const currentRP = stats.totalRP || 0;
    const rankData = getRankData(currentRP);

    // Elements
    const mRankIcon = document.getElementById("menu-rank-icon");
    const mRankName = document.getElementById("menu-rank-name");
    const mRankLevel = document.getElementById("menu-rank-level");
    const mRpCurrent = document.getElementById("menu-rp-current");
    const mRpNext = document.getElementById("menu-rp-next");
    const mRpProgress = document.getElementById("menu-rp-progress");
    const mStreak = document.getElementById("menu-stat-streak");
    const mDailyPoints = document.getElementById("menu-stat-daily");

    const fmtNumber = (num, decimals) => 
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);

    if (mRankIcon) mRankIcon.textContent = rankData.rank.icon;
    if (mRankName) {
      let lang = getCurrentLang() || "es";
      const nameKey = rankData.rank.nameKey;
      mRankName.textContent = translations[lang]?.[nameKey] || nameKey;
    }
    if (mRankLevel) {
      const lang = getCurrentLang() || "es";
      const prefix = translations[lang]?.rank_level_prefix || "Nvl.";
      mRankLevel.textContent = `${prefix} ${rankData.level}`;
    }
    if (mRpCurrent) mRpCurrent.textContent = fmtNumber(currentRP, 3);
    if (mRpNext) {
      const nextGoal = rankData.nextRank ? rankData.nextRank.minRP : "MAX";
      mRpNext.textContent = typeof nextGoal === "number" ? fmtNumber(nextGoal, 0) : nextGoal;
    }
    if (mRpProgress) mRpProgress.style.width = `${rankData.progress}%`;
    if (mStreak) mStreak.textContent = stats.currentStreak || 0;
    if (mDailyPoints) mDailyPoints.textContent = fmtNumber(stats.dailyRP || 0, 3);

  } catch (e) {
    console.error("Error populating menu stats:", e);
  }
}

/**
 * Share App functionality
 */
window.shareApp = async () => {
  const lang = getCurrentLang();
  const t = translations[lang] || translations["es"];
  const shareData = {
    title: "Jigsudo",
    text: t.share_msg || "¡Desafía tu mente con Jigsudo!",
    url: "https://jigsudo.com",
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      // Fallback: Copy to clipboard
      await navigator.clipboard.writeText(shareData.url);
      alert(t.share_copied || "Enlace copiado al portapapeles");
    }
  } catch (err) {
    console.error("Error sharing:", err);
  }
};

/**
 * Ported from home.js to keep static pages in sync with main app header
 */
function updateHeaderInfo() {
  const dateEl = document.getElementById("current-date");
  const challengeEl = document.getElementById("challenge-num");

  if (!dateEl || !challengeEl) return;

  const now = new Date();
  const lang = getCurrentLang();
  const t = translations[lang];
  const locale = t ? t.date_locale : "es-ES";

  // Date
  const dateStr = now.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  let formattedDate = dateStr;

  if (lang === "es") {
    formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
      return word === "de" || word === "en" || word === "del"
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  } else {
    formattedDate = dateStr.replace(/[a-zA-Z\u00C0-\u00FF]+/g, (word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  dateEl.textContent = formattedDate;

  // Challenge #: Days since Jan 18, 2026 (Launch Day = #001)
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startZero = new Date(2026, 3, 5); // April 5, 2026 (Launch Day Shift/Reset #1)

  const diffTime = todayZero - startZero;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

  challengeEl.textContent = `#${String(diffDays).padStart(3, "0")}`;
}

/**
 * Inject Modals HTML to ensure parity without redirection
 */
function injectModals() {
  if (document.getElementById("login-modal")) return;

  const modalOverlay = document.createElement("div");
  modalOverlay.id = "login-modal";
  modalOverlay.className = "modal-overlay hidden";
  modalOverlay.innerHTML = `
    <div class="modal-content login-content glass-panel">
      <span class="close-modal" id="login-modal-cancel">&times;</span>
      <h2 data-i18n="login_title">Cuenta Jigsudo</h2>

      <div class="auth-forms">
        <!-- Login Form -->
        <form id="login-form" class="auth-form active">
          <input
            type="email"
            id="login-email"
            data-i18n-placeholder="auth_email_placeholder"
            placeholder="Email"
            required
            autocomplete="email"
            class="auth-input"
          />
          <div class="password-wrapper">
            <input
              type="password"
              id="login-password"
              data-i18n-placeholder="auth_password_placeholder"
              placeholder="Contraseña"
              required
              autocomplete="current-password"
              class="auth-input"
            />
            <button
              type="button"
              class="toggle-password"
              data-i18n-aria="aria_show_password"
              aria-label="Mostrar contraseña"
            >
              👁️
            </button>
          </div>
          <p class="auth-forgot-pw">
            <a
              href="#"
              id="link-forgot-password"
              data-i18n="auth_forgot_password"
              >¿Olvidaste tu contraseña?</a
            >
          </p>
          <button
            type="submit"
            class="btn-primary auth-submit"
            data-i18n="btn_login"
          >
            Iniciar Sesión
          </button>
          <div class="auth-divider" data-i18n="auth_or">o</div>
          <button type="button" class="btn-google btn-login-google">
            <svg
              class="google-icon"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.95v2.32A9 9 0 0 0 9 18z"
                fill="#34A853"
              />
              <path
                d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.97H.95a9 9 0 0 0 0 8.06l3.01-2.32z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.47A9 9 0 0 0 .95 4.97l3.01 2.32c.71-2.13 2.7-3.71 5.04-3.71z"
                fill="#EA4335"
              />
            </svg>
            <span data-i18n="btn_google_login">Continuar con Google</span>
          </button>
          <p class="auth-switch">
            <span data-i18n="auth_no_account">¿No tienes cuenta?</span>
            <a href="#" id="switch-to-register" data-i18n="link_register"
              >Regístrate</a
            >
          </p>
        </form>

        <!-- Register Form -->
        <form id="register-form" class="auth-form hidden">
          <input
            type="text"
            id="register-username"
            data-i18n-placeholder="auth_username_placeholder"
            placeholder="Nombre de usuario"
            required
            autocomplete="username"
            class="auth-input"
          />
          <input
            type="email"
            id="register-email"
            data-i18n-placeholder="auth_email_placeholder"
            placeholder="Email"
            required
            autocomplete="email"
            class="auth-input"
          />
          <div class="password-wrapper">
            <input
              type="password"
              id="register-password"
              data-i18n-placeholder="auth_password_hint_placeholder"
              placeholder="Contraseña (min 6 chars)"
              required
              minlength="6"
              autocomplete="new-password"
              class="auth-input"
            />
            <button
              type="button"
              class="toggle-password"
              data-i18n-aria="aria_show_password"
              aria-label="Mostrar contraseña"
            >
              👁️
            </button>
          </div>
          <div class="password-wrapper">
            <input
              type="password"
              id="register-password-confirm"
              data-i18n-placeholder="auth_repeat_password_placeholder"
              placeholder="Repetir Contraseña"
              required
              minlength="6"
              autocomplete="new-password"
              class="auth-input"
            />
          </div>
          <button
            type="submit"
            class="btn-primary auth-submit"
            data-i18n="btn_register"
          >
            Crear Cuenta
          </button>
          <div class="auth-divider" data-i18n="auth_or">o</div>
          <button type="button" class="btn-google btn-login-google">
            <svg
              class="google-icon"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
                fill="#4285F4"
              />
              <path
                d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.95v2.32A9 9 0 0 0 9 18z"
                fill="#34A853"
              />
              <path
                d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.97H.95a9 9 0 0 0 0 8.06l3.01-2.32z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.47A9 9 0 0 0 .95 4.97l3.01 2.32c.71-2.13 2.7-3.71 5.04-3.71z"
                fill="#EA4335"
              />
            </svg>
            <span data-i18n="btn_google_login">Continuar con Google</span>
          </button>
          <p class="auth-switch">
            <span data-i18n="auth_have_account">¿Ya tienes cuenta?</span>
            <a href="#" id="switch-to-login" data-i18n="link_login"
              >Inicia Sesión</a
            >
          </p>
        </form>
      </div>
      <div id="auth-error-msg" class="error-msg hidden"></div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  // Also inject Password Reset Modal
  if (!document.getElementById("password-reset-modal")) {
    const resetModal = document.createElement("div");
    resetModal.id = "password-reset-modal";
    resetModal.className = "modal-overlay hidden";
    resetModal.innerHTML = `
      <div class="modal-content small-modal glass-panel">
        <h3 data-i18n="auth_reset_pw_title">Recuperar Contraseña</h3>
        <p
          data-i18n="auth_reset_pw_desc"
          style="margin-bottom: 15px; font-size: 0.9rem; color: var(--text-secondary);"
        >
          Ingresa tu correo para recibir un enlace de recuperación.
        </p>
        <input
          type="email"
          id="reset-email-input"
          class="auth-input"
          data-i18n-placeholder="auth_email_placeholder"
          placeholder="Email"
          style="margin-bottom: 15px"
        />
        <div class="modal-actions">
          <button id="btn-cancel-reset" class="btn-secondary" data-i18n="btn_cancel">
            Cancelar
          </button>
          <button id="btn-confirm-reset" class="btn-primary" data-i18n="btn_confirm">
            Confirmar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(resetModal);
  }
}

/**
 * Ported from main.js to handle auth modal logic on subpages
 */
function attachAuthListeners() {
  const loginModal = document.getElementById("login-modal");
  const closeBtn = document.getElementById("login-modal-cancel");
  const formLogin = document.getElementById("login-form");
  const formRegister = document.getElementById("register-form");
  const linkRegister = document.getElementById("switch-to-register");
  const linkLogin = document.getElementById("switch-to-login");

  if (closeBtn) {
    closeBtn.addEventListener("click", () => toggleModal(loginModal, false));
  }

  if (linkRegister) {
    linkRegister.addEventListener("click", (e) => {
      e.preventDefault();
      formLogin.classList.add("hidden");
      formLogin.classList.remove("active");
      formRegister.classList.remove("hidden");
      setTimeout(() => formRegister.classList.add("active"), 10);
    });
  }

  if (linkLogin) {
    linkLogin.addEventListener("click", (e) => {
      e.preventDefault();
      formRegister.classList.add("hidden");
      formRegister.classList.remove("active");
      formLogin.classList.remove("hidden");
      setTimeout(() => formLogin.classList.add("active"), 10);
    });
  }

  // Google Login Buttons
  document.querySelectorAll(".btn-google").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const errBox = document.getElementById("auth-error-msg");
      if (errBox) errBox.classList.add("hidden");

      const res = await loginWithGoogle();
      if (!res.success && errBox) {
        errBox.textContent = res.error;
        errBox.classList.remove("hidden");
      } else {
        toggleModal(loginModal, false);
      }
    });
  });

  // Submit Handlers
  formLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-password").value;
    const errBox = document.getElementById("auth-error-msg");

    if (errBox) errBox.classList.add("hidden");

    const res = await loginUser(email, pass);
    if (!res.success && errBox) {
      errBox.textContent = res.error;
      errBox.classList.remove("hidden");
    } else {
      toggleModal(loginModal, false);
    }
  });

  formRegister?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const pass = document.getElementById("register-password").value;
    const confirmPass = document.getElementById("register-password-confirm").value;
    const errBox = document.getElementById("auth-error-msg");

    if (errBox) errBox.classList.add("hidden");

    if (pass !== confirmPass) {
      const t = translations[getCurrentLang()] || translations["es"];
      if (errBox) {
        errBox.textContent = t.toast_pw_mismatch || "Passwords do not match.";
        errBox.classList.remove("hidden");
      }
      return;
    }

    const res = await registerUser(email, pass, user);
    if (!res.success && errBox) {
      errBox.textContent = res.error;
      errBox.classList.remove("hidden");
    } else {
      toggleModal(loginModal, false);
    }
  });

  // Password toggles ( ported from global window.toggleAuthPassword helper )
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const wrapper = e.currentTarget.closest(".password-wrapper");
      const input = wrapper ? wrapper.querySelector("input") : null;
      if (!input) return;

      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      e.currentTarget.textContent = isPassword ? "🙈" : "👁️";
    });
  });
}
