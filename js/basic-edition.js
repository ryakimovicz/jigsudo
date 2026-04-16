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
    // Hide Privacy/Terms in footer
    '[data-i18n="footer_privacy"]',
    '[data-i18n="footer_terms"]',
    // Targeted suppression for the guide ranks section
    '.info-card:has([data-i18n="guide_ranks_title"])' 
  ];

  elementsToHide.forEach((selector) => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        el.classList.add("hidden-basic");
        el.style.display = "none";

        // Hide the separator after Privacy/Terms if it exists
        if (selector.includes("footer_privacy") || selector.includes("footer_terms")) {
            const separator = el.nextElementSibling;
            if (separator && separator.classList.contains("footer-sep")) {
                separator.style.display = "none";
            }
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

  // 4. Disable Sidebar buttons that point to hidden sections
  document.querySelectorAll(".nav-item").forEach(link => {
      if (link.id === "nav-changelog" || link.id === "nav-admin") {
          link.style.display = "none";
      }
  });

  // 5. Update localized strings
  updateTexts();

  // 6. Swap FAQ containers and ensure visibility
  const faqGeneric = document.getElementById("faq-generic-container");
  const faqDemo = document.getElementById("faq-demo-container");
  if (faqGeneric && faqDemo) {
      faqGeneric.classList.add("hidden");
      faqDemo.classList.remove("hidden", "hidden-basic");
      faqDemo.style.display = "block"; // Force override
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
 */
function injectPromotionBanners() {
    const lang = getCurrentLang() || "es";
    const t = translations[lang];
    if (!t) return;

    const createBanner = (isHome = false) => {
        const div = document.createElement("div");
        div.className = "basic-promo-banner" + (isHome ? " home-promo" : "");
        div.innerHTML = `
            <h3 class="promo-title">${t.promo_banner_title || "¡Juega la Experiencia Completa!"}</h3>
            <p class="promo-desc">${t.promo_banner_desc || "Disfruta de perfiles, ranking global, historial completo y desafíos ilimitados."}</p>
            <a href="https://jigsudo.com" target="_blank" class="promo-link-btn">
                ${t.btn_view_full_version || "Ver Versión Completa"}
            </a>
        `;
        return div;
    };

    // 1. HOME: Below the SEO content article
    const seoContent = document.getElementById("seo-home-content");
    if (seoContent && !document.querySelector(".home-promo")) {
        seoContent.after(createBanner(true));
    }

    // 2. HISTORY: Below the legend card
    const historyLegend = document.querySelector("#history-section .history-legend-card");
    if (historyLegend && !historyLegend.nextElementSibling?.classList.contains("basic-promo-banner")) {
        historyLegend.after(createBanner());
    }

    // 3. GUIDE: Below the tutorial intro
    const guideIntro = document.querySelector(".guide-intro-section");
    if (guideIntro && !guideIntro.nextElementSibling?.classList.contains("basic-promo-banner")) {
        guideIntro.after(createBanner());
    }
}

function injectStyles() {
    if (document.getElementById("basic-edition-styles")) return;

    const style = document.createElement("style");
    style.id = "basic-edition-styles";
    style.textContent = `
        .hidden-basic { display: none !important; }
        
        .basic-promo-banner {
            padding: 32px 20px;
            margin: 24px 0;
            background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.1), rgba(var(--accent-rgb), 0.05));
            border: 1px solid rgba(var(--accent-rgb), 0.2);
            border-radius: 24px;
            text-align: center;
            animation: fadeInPromo 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .home-promo {
            margin-top: 40px;
            margin-bottom: 40px;
        }

        @keyframes fadeInPromo {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .promo-title {
            font-size: 1.4rem;
            font-weight: 700;
            margin-bottom: 12px;
            color: var(--text-color);
        }

        .promo-desc {
            font-size: 1rem;
            color: var(--text-color);
            opacity: 0.8;
            margin-bottom: 24px;
            line-height: 1.6;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
        }

        .promo-link-btn {
            display: inline-block;
            padding: 14px 28px;
            background: var(--accent-color, #2a9d8f);
            color: white !important;
            text-decoration: none;
            border-radius: 14px;
            font-weight: 700;
            font-size: 1.05rem;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(var(--accent-rgb, 42, 157, 143), 0.3);
        }

        .promo-link-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(var(--accent-rgb, 42, 157, 143), 0.4);
            filter: brightness(1.1);
        }

        /* Ensure FAQ is visible in Basic */
        #faq-demo-container { 
            display: block !important; 
            margin-bottom: 24px;
        }
    `;
    document.head.appendChild(style);
}

// ---------------------------------------------------------
// AUTO-INITIALIZATION REMOVED - Handled by main.js
// ---------------------------------------------------------
