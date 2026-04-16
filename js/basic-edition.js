/**
 * Jigsudo Basic Edition Controller
 * Handles UI suppression and promotion for the Standalone Demo.
 */
import { CONFIG } from "./config.js?v=1.3.1";
import { translations } from "./translations.js?v=1.3.1";
import { getCurrentLang } from "./i18n.js?v=1.3.1";

export function initBasicEdition() {
  if (!CONFIG.isBasicEdition) return;

  console.log("[BasicEdition] Initializing Standalone Demo UI...");

  // 1. Hide unwanted elements (General & Global)
  const elementsToHide = [
    "#ranking-container",
    "#support-container",
    ".auth-wrapper",
    "#nav-changelog",
    "#nav-admin",
    "#changelog-section",
    "#admin-section",
    ".home-tabs",
    "#panel-custom",
    "#login-modal",
    "#password-confirm-modal",
    "#password-reset-modal",
    "#logout-confirm-modal",
  ];

  elementsToHide.forEach((selector) => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        el.classList.add("hidden-basic");
        // Force hide non-essential sections to prevent white space/layout shift
        if (selector.includes("-section")) {
          el.style.display = "none";
        }
      });
    } catch (e) {
      console.warn(`[BasicEdition] Failed to hide element: ${selector}`, e);
    }
  });

  // 2. Inject Promotion Banners
  injectPromotionBanners();

  // 3. Inject CSS fixes
  injectStyles();

  // 4. Update Header branding (Optional)
  const headerLogo = document.querySelector(".header-logo span");
  if (headerLogo) {
     // headerLogo.textContent = "Jigsudo Basic";
  }

  // 5. Landing text adjustments
  const homeTitle = document.querySelector(".home-title");
  if (homeTitle) {
      // homeTitle.textContent = "Jigsudo: Basic Edition";
  }

  // 6. Disable Sidebar buttons that point to hidden sections
  const sidebarLinks = document.querySelectorAll(".nav-item");
  sidebarLinks.forEach(link => {
      if (link.id === "nav-changelog" || link.id === "nav-admin") {
          link.style.display = "none";
      }
  });

  // 7. Update localized strings for Basic Edition specific UI (e.g. FAQ)
  updateTexts();

  // 8. Swap FAQ containers
  const faqGeneric = document.getElementById("faq-generic-container");
  const faqDemo = document.getElementById("faq-demo-container");
  if (faqGeneric && faqDemo) {
      faqGeneric.classList.add("hidden");
      faqDemo.classList.remove("hidden");
  }

  console.log("[BasicEdition] UI transformation complete.");
}

function updateTexts() {
    const lang = getCurrentLang() || "es";
    const t = translations[lang];
    if (!t) return;

    // Update footer promotion button
    const footerLink = document.querySelector('.footer-links a[href="https://jigsudo.com"]');
    if (footerLink) {
        footerLink.innerHTML = `<span class="promo-badge">${t.promo_full_version_badge || "Full Version"}</span> ${t.nav_home || "Ir a Jigsudo.com"}`;
    }
}

/**
 * Injects a promotion banner into specific sections (History, Guide, etc.)
 * to nudge users towards the full version.
 */
function injectPromotionBanners() {
    const lang = getCurrentLang() || "es";
    const t = translations[lang];
    if (!t) return;

    const createBanner = () => {
        const div = document.createElement("div");
        div.className = "basic-promo-banner";
        div.innerHTML = `
            <h3 class="promo-title">${t.promo_banner_title || "¡Juega la Experiencia Completa!"}</h3>
            <p class="promo-desc">${t.promo_banner_desc || "Disfruta de perfiles, ranking global, historial completo y desafíos ilimitados."}</p>
            <a href="https://jigsudo.com" target="_blank" class="promo-link-btn">
                ${t.btn_view_full_version || "Ver Versión Completa"}
            </a>
        `;
        return div;
    };

    // 1. HOME: Below the start button area
    const homeContent = document.getElementById("menu-content");
    if (homeContent) {
        // We inject it before the footer links
        const footerLinks = homeContent.querySelector(".footer-links");
        if (footerLinks) {
            footerLinks.before(createBanner());
        }
    }

    // 2. HISTORY: Below the legend card
    const historyLegend = document.querySelector("#history-section .history-legend-card");
    if (historyLegend) {
        historyLegend.after(createBanner());
    }

    // 3. GUIDE: Below the tutorial intro
    const guideIntro = document.querySelector(".guide-intro-section");
    if (guideIntro) {
        guideIntro.after(createBanner());
    }
}

function injectStyles() {
    const style = document.createElement("style");
    style.id = "basic-edition-styles";
    style.textContent = `
        .hidden-basic { display: none !important; }
        .basic-promo-banner {
            padding: 24px 16px;
            margin: 24px 0;
            background: rgba(var(--accent-rgb), 0.05);
            border: 1px solid rgba(var(--accent-rgb), 0.2);
            border-radius: 20px;
            text-align: center;
            animation: fadeInPromo 0.5s ease-out;
        }
        @keyframes fadeInPromo {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .promo-title {
            font-size: 1.25rem;
            font-weight: 700;
            margin-bottom: 12px;
            color: var(--text-color);
        }
        .promo-desc {
            font-size: 0.95rem;
            color: var(--text-color);
            opacity: 0.85;
            margin-bottom: 20px;
            line-height: 1.5;
        }
        .promo-link-btn {
            display: inline-block;
            padding: 12px 24px;
            background: var(--accent-color, var(--primary));
            color: white !important;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            border: none;
            cursor: pointer;
        }
        .promo-link-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.3);
            opacity: 0.95;
        }
    `;
    document.head.appendChild(style);
}

// ---------------------------------------------------------
// AUTO-INITIALIZATION
// ---------------------------------------------------------
window.addEventListener("DOMContentLoaded", initBasicEdition);
