/**
 * Jigsudo Cookie Manager
 * Handles user consent for technical and analytical cookies.
 */

const STORAGE_KEY = "jigsudo_cookie_consent";

export const initCookieConsent = () => {
  const banner = document.getElementById("cookie-banner");
  const btnAccept = document.getElementById("cookie-accept");
  const btnDeny = document.getElementById("cookie-deny");

  if (!banner || !btnAccept || !btnDeny) return;

  // Check if consent already given
  const consent = localStorage.getItem(STORAGE_KEY);

  if (!consent) {
    // Show banner with a small delay for better entrance
    setTimeout(() => {
      banner.classList.add("show");
    }, 1000);
  } else {
    // Apply existing consent
    applyConsent(consent);
  }

  btnAccept.addEventListener("click", () => {
    saveConsent("all");
    banner.classList.remove("show");
  });

  btnDeny.addEventListener("click", () => {
    saveConsent("technical");
    banner.classList.remove("show");
  });
};

const saveConsent = (type) => {
  localStorage.setItem(STORAGE_KEY, type);
  applyConsent(type);
};

const applyConsent = (type) => {
  console.log(`[CookieManager] Applying consent: ${type}`);
  
  // Official GTM/Google Analytics Consent Update
  if (typeof window.gtag === "function") {
    if (type === "all") {
      window.gtag('consent', 'update', {
        'analytics_storage': 'granted'
      });
    } else {
      window.gtag('consent', 'update', {
        'analytics_storage': 'denied'
      });
    }
  }

  // Also push a custom event for other tags that might not use Consent Mode
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    'event': 'jigsudo_consent_applied',
    'consent_level': type
  });
};
