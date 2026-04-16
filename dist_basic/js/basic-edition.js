import { CONFIG } from "./config.js?v=1.3.1";
import { updateTexts } from "./i18n.js?v=1.3.1";
import { translations } from "./translations.js?v=1.3.1";

/**
 * Jigsudo Basic Edition Controller
 * Handles UI isolation and promotional links for the itch.io standalone version.
 */
export function initBasicEdition() {
  if (!CONFIG.isBasicEdition) return;

  console.log("[BasicEdition] Initializing Standalone Demo UI...");

  // 1. Hide unwanted elements (General & Global)
  const elementsToHide = [
    "#ranking-container",
    "#support-container",
    ".auth-wrapper",
    "#nav-admin",
    "#admin-section",  // Now that we don't purge HTML
    ".home-tabs",      // Hide "Custom" tab, keep only daily
    "#panel-custom",   // Ensure custom panel is gone

    // Auth Modals (Now that we don't purge HTML)
    "#login-modal",
    "#password-confirm-modal",
    "#password-reset-modal",
    "#logout-confirm-modal",
    "#delete-account-confirm-modal",

    // History navigation
    "#hist-prev-btn",
    "#hist-next-btn",
    
    // Hide Ranking, Streaks, and RP mentions in SEO/Faq on HOME
    '[data-i18n="seo_ranking"]',
    '[data-i18n="seo_ranking_text"]',
    '.seo-faq-item:has([data-i18n="seo_faq_1_q"])', // Updates/RP
    '.seo-faq-item:has([data-i18n="seo_faq_4_q"])', // Account advantages (Cloud/Ranking)
    '.seo-faq-item:has([data-i18n="seo_faq_5_q"])', // Streaks
    '.seo-faq-item:has([data-i18n="seo_faq_6_q"])', // How RP is calculated
    
    // Support & Donations
    ".victory-support",

    // Streaks (Rachas) Removal
    ".stat-box:has([data-i18n='stat_streak'])",
    ".stat-box:has([data-i18n='stat_max_streak'])",
    ".victory-stat-card:has([data-i18n='victory_stat_streak'])",
    ".sc-stat-item:has([data-i18n='victory_stat_streak'])",
    ".sc-stat-item:has([data-i18n='stat_streak'])",
    
    // Legal Links & Profiles
    ".sc-user-box",
    '[data-i18n="footer_privacy"]',
    '[data-i18n="footer_terms"]',
    '.footer-sep'
  ];

  elementsToHide.forEach(selector => {
     try {
         const elements = document.querySelectorAll(selector);
         elements.forEach(el => el.classList.add("hidden-basic"));
     } catch(e) {}
  });

  // 2. Specialized Guide Hiding (if :has isn't fully supported or selectors differ)
  hideGuideIrrelevantSections();

  // 3. Inject Promotion Banners
  injectPromotionBanners();

  // 4. Inject global Basic Edition styles
  injectStyles();
  
  // 5. Force Daily tab if somehow not active
  const dailyTab = document.querySelector('[data-tab="daily"]');
  if (dailyTab) dailyTab.click();

  // 6. Header Override: Show "Basic Edition" and hide the puzzle number
  overrideHeader();

  // 7. Update Tagline for Demo
  const tagline = document.querySelector('.tagline');
  if (tagline) {
      tagline.dataset.i18n = "menu_tagline_demo";
  }
  
  updateTexts();

  // 8. Swap FAQ containers
  const faqGeneric = document.getElementById("faq-generic-container");
  const faqDemo = document.getElementById("faq-demo-container");
  if (faqGeneric) faqGeneric.style.display = "none";
  if (faqDemo) faqDemo.classList.remove("hidden-basic");

  console.log("[BasicEdition] UI transformation complete.");
}

function overrideHeader() {
    const dateEl = document.getElementById("current-date");
    const numEl = document.getElementById("challenge-num");
    
    if (dateEl) {
        dateEl.dataset.i18n = "header_basic_edition";
    }
    
    if (numEl) {
        numEl.style.display = "none";
    }
}

function hideGuideIrrelevantSections() {
    // Specifically target the Scoring and Ranks sections in the Guide
    const guideHeaders = document.querySelectorAll('#guide-section h3');
    guideHeaders.forEach(h => {
        const key = h.dataset.i18n;
        // Restore Scoring section visibility, keep only Ranks hidden
        if (key === 'guide_ranks_title' || h.textContent.includes('Rank') || h.textContent.includes('Rango')) {
            const card = h.closest('.info-card') || h.parentElement;
            if (card) card.classList.add("hidden-basic");
        }
    });
}

function injectPromotionBanners() {
    // Shared Banner Template - REORDERED: Text first, then Link/Button
    const createBanner = () => {
        const wrapper = document.createElement("div");
        wrapper.className = "basic-promo-banner";
        wrapper.innerHTML = `
            <p class="promo-text" data-i18n="basic_edition_invite">
                Disfruta el puzzle de hoy. ¡Juega la experiencia completa en Jigsudo.com!
            </p>
            <a href="https://jigsudo.com" target="_blank" class="promo-link-btn">
                <span class="promo-label" data-i18n="sidebar_play_full">Jugar Versión Completa</span>
            </a>
        `;
        return wrapper;
    };

    // 1. HOME: Below the start button
    const startBtn = document.getElementById("start-btn");
    if (startBtn) {
        startBtn.after(createBanner());
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
    style.textContent = `
        .hidden-basic { display: none !important; }
        .basic-promo-banner {
            padding: 24px 16px;
            margin: 24px 0;
            background: rgba(var(--primary-rgb), 0.05);
            border: 1px solid rgba(var(--primary-rgb), 0.2);
            border-radius: 20px;
            text-align: center;
            animation: fadeInPromo 0.5s ease-out;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
        }
        @keyframes fadeInPromo {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .promo-link-btn {
            text-decoration: none;
            background: linear-gradient(135deg, var(--primary), #a855f7);
            color: white !important;
            padding: 12px 28px;
            border-radius: 50px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            gap: 12px;
            font-size: 1.05rem;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-shadow: 0 4px 15px rgba(var(--primary-rgb), 0.3);
        }
        
        .promo-link-btn:hover {
            transform: translateY(-3px) scale(1.02);
            box-shadow: 0 8px 25px rgba(var(--primary-rgb), 0.4);
            filter: brightness(1.1);
        }
        
        .promo-link-btn:active {
            transform: translateY(-1px);
        }

        .promo-text {
            font-size: 1rem;
            line-height: 1.6;
            color: var(--text-color);
            margin: 0;
            max-width: 480px;
            opacity: 0.9;
        }
        
        /* Specific tweaks to clean up after hiding */
        #history-section .history-page-wrapper {
            padding-bottom: 40px;
        }
    `;
    document.head.appendChild(style);
}
