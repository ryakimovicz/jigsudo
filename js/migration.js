import { CONFIG } from "./config.js?v=1.3.0";
import { performSeasonReset } from "./db.js?v=1.3.0";
import { getCurrentUser } from "./auth.js?v=1.3.0";
import { updateTexts, setLanguage } from "./i18n.js?v=1.3.0";

export async function checkSeasonMigration() {
  const stats = JSON.parse(localStorage.getItem("jigsudo_user_stats") || "{}");
  const localSchema = stats.schemaVersion || 0;
  
  // If local is already up to date, we are safe.
  if (localSchema >= CONFIG.schemaVersion) return;

  // v1.3.4: IMMEDIATE FREEZE to prevent any sync logic from running
  // while we decide whether to show the modal or wipe silently.
  window._jigsudo_migration_freeze = true;
  console.warn("[Migration] System frozen for safety check.");

  // Wait for Auth to settle before blocking the UI.
  console.log("[Migration] Checking cloud schema...");
  const user = await waitForUser();
  
  if (user && !user.isAnonymous) {
     const { fetchLatestUserData } = await import("./db.js?v=1.3.0");
     const cloudData = await fetchLatestUserData(user.uid);
     const cloudSchema = cloudData?.schemaVersion || 0;
     console.log(`[Migration] Cloud Schema: ${cloudSchema} | Local Schema: ${localSchema}`);
  }

  // If local is old, we ALWAYS show the modal (user likes the announcement)
  console.warn(`[Season Migration] Showing Season Modal for Local: ${localSchema}`);
  
  // Inject styles
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/migration.css?v=1.3.0";
  document.head.appendChild(link);
  
  showSeasonOverlay();
}

/**
 * Helper to wait for Firebase Auth to initialize before proceeding with remote cleanup.
 * @returns {Promise<Object|null>}
 */
async function waitForUser() {
  const { auth } = await import("./firebase-config.js?v=1.2.2");
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

function showSeasonOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "season-migration-overlay";
  overlay.className = "migration-overlay";
  
  // All text uses data-i18n / data-i18n-html so updateTexts() handles both
  // the initial render and any real-time language switches.
  overlay.innerHTML = `
    <div class="migration-card">
      <div class="migration-icon">🏆</div>
      <h1 class="migration-title" data-i18n="migration_title">Temporada 1</h1>
      <p class="migration-date" data-i18n="migration_launch_date">14 de abril de 2026</p>
      <div class="migration-divider"></div>
      <p class="migration-text" data-i18n-html="migration_body_html">
        Gracias por jugar en la <strong>Temporada 0</strong>.<br><br>
        Ahora empieza la <strong>Temporada 1</strong>, se resetearán todos los stats para dar paso a un nuevo comienzo.<br><br>
        Disculpa las molestias. Tu identidad y cuenta permanecen protegidas.
      </p>
      <button id="btn-update-season" class="migration-btn" data-i18n="btn_update_season">ACTUALIZAR</button>
      <div id="migration-loader" class="migration-loader hidden">
         <div class="spinner"></div>
         <p data-i18n="migration_syncing">Sincronizando temporada...</p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Lock scroll on both html and body (required for iOS Safari)
  const scrollY = window.scrollY;
  document.documentElement.classList.add("migration-active");
  document.body.classList.add("migration-active", "no-scroll");
  document.body.style.top = `-${scrollY}px`;

  // The migration modal can appear BEFORE initLanguage() runs in main.js.
  // So we manually read and apply the stored language preference here.
  const storedLang = localStorage.getItem("jigsudo_lang");
  if (storedLang) setLanguage(storedLang);
  else updateTexts(); // fallback: apply default (es)

  // Re-translate in real time if user switches language while overlay is open
  const onLangChange = () => updateTexts();
  window.addEventListener("languageChanged", onLangChange);

  const btn = document.getElementById("btn-update-season");
  btn.onclick = async () => {
    btn.disabled = true;
    btn.classList.add("hidden");
    document.getElementById("migration-loader").classList.remove("hidden");

    try {
      console.log("[Migration] Awaiting Auth state...");
      const user = await waitForUser();
      
      // Safety: Clear local storage FIRST (except identity)
      const lang = localStorage.getItem("jigsudo_lang");
      const theme = localStorage.getItem("jigsudo_theme");
      const uid = localStorage.getItem("jigsudo_uid"); 
      
      console.log("[Migration] Executing local wipe...");
      localStorage.clear();
      
      if (lang) localStorage.setItem("jigsudo_lang", lang);
      if (theme) localStorage.setItem("jigsudo_theme", theme);
      if (uid) localStorage.setItem("jigsudo_uid", uid);

      // v1.3.5: MARK LOCAL AS MIGRATED (prevents infinite loop on reload)
      localStorage.setItem("jigsudo_user_stats", JSON.stringify({ schemaVersion: CONFIG.schemaVersion }));

      if (user && !user.isAnonymous) {
        console.log(`[Migration] Executing remote wipe for ${user.uid}...`);
        await performSeasonReset(user.uid);
      } else {
        console.log("[Migration] No authenticated user detected, skipped remote wipe.");
      }

      // Final lock
      localStorage.setItem("jigsudo_last_wipe_ack", Date.now().toString());

      console.log("[Migration] Success. Reloading...");
      window.location.reload();
    } catch (err) {
      console.error("[Migration] Error during reset:", err);
      alert("Hubo un error al actualizar la temporada. Por favor, intenta recargar la página.");
      btn.disabled = false;
      btn.classList.remove("hidden");
      document.getElementById("migration-loader").classList.add("hidden");
    }
  };
}
