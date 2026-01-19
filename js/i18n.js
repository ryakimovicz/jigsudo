import { translations } from "./translations.js";

export let currentLang = "es"; // Default

export function getCurrentLang() {
  return currentLang;
}

// Internal: Updates state and UI without persisting
function applyLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang;
    updateTexts();
    updateLanguageSelector(lang);

    // Dispatch event
    window.dispatchEvent(
      new CustomEvent("languageChanged", { detail: { lang } }),
    );
  }
}

// Public: Changes language AND saves preference (User Intent)
export function setLanguage(lang) {
  if (translations[lang]) {
    localStorage.setItem("jigsudo_lang", lang);
    applyLanguage(lang);
  }
}

export function initLanguage() {
  // 1. Check LocalStorage (User Override)
  const savedLang = localStorage.getItem("jigsudo_lang");

  if (savedLang && translations[savedLang]) {
    // If user previously chose a language, respect it
    applyLanguage(savedLang);
  } else {
    // 2. No override? Check Browser (Auto)
    const browserLang = navigator.language.split("-")[0]; // 'es-ES' -> 'es'
    const supportedLang = translations[browserLang] ? browserLang : "es";

    // Apply detection, but DO NOT save to localStorage yet.
    // This allows the user to change browser lang later and see the change
    // until they explicitly lock it via the dropdown.
    applyLanguage(supportedLang);
  }

  setupLanguageSelectorListener();
}

function updateTexts() {
  const t = translations[currentLang];

  // 1. Text Content
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (t[key]) el.textContent = t[key];
  });

  // 2. Inner HTML (for rich text)
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (t[key]) el.innerHTML = t[key];
  });

  // 3. Aria Labels (for icon buttons)
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (t[key]) el.setAttribute("aria-label", t[key]);
  });
}

function updateLanguageSelector(lang) {
  const select = document.getElementById("language-select");
  if (select) {
    select.value = lang;
  }
}

function setupLanguageSelectorListener() {
  const select = document.getElementById("language-select");
  if (select) {
    select.addEventListener("change", (e) => {
      setLanguage(e.target.value);
    });
    // Prevent closing dropdown when clicking select
    select.addEventListener("click", (e) => e.stopPropagation());
  }
}
