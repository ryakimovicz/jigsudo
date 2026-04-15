import { CONFIG } from "./config.js?v=1.3.0";
import { performSeasonReset } from "./db.js?v=1.3.0";
import { getCurrentUser } from "./auth.js?v=1.3.0";
import { updateTexts, setLanguage } from "./i18n.js?v=1.3.0";

export async function checkSeasonMigration() {
  // v1.3.4: IMMEDIATE FREEZE to prevent any sync logic from running
  // while we decide whether to show the modal or wipe silently.
  window._jigsudo_migration_freeze = true;

  const stats = JSON.parse(localStorage.getItem("jigsudo_user_stats") || "{}");
  const localSchema = stats.schemaVersion || 0;
  
  // Wait for Auth to settle before blocking the UI.
  console.log("[Migration] Checking auth state...");
  const user = await waitForUser();
  const isGuest = !user || user.isAnonymous;

  // v1.3.10: Fresh Guest Auto-Migration
  // If this is a new device (localSchema 0) and it's a guest with 0 RP,
  // we silently promote them to 7.2 to avoid showing the modal to new players.
  // CRITICAL: Only do this if we ARE a guest AFTER auth settles.
  const isFreshGuest = isGuest && localSchema === 0 && (stats.totalRP || 0) === 0 && (stats.wins || 0) === 0;
  if (isFreshGuest) {
     console.log("[Migration] Fresh guest detected. Auto-migrating local schema to Season 1.");
     localStorage.setItem("jigsudo_user_stats", JSON.stringify({ ...stats, schemaVersion: CONFIG.schemaVersion }));
     window._jigsudo_migration_freeze = false;
     return;
  }

  // If NO user (Guest) and local is already up to date, we are safe.
  if (isGuest && localSchema >= CONFIG.schemaVersion) {
     window._jigsudo_migration_freeze = false;
     return;
  }

  // If there IS a user, checking cloud schema...
  let cloudSchema = 0;
  if (user && !user.isAnonymous) {
     const { fetchLatestUserData } = await import("./db.js?v=1.3.0");
     const cloudData = await fetchLatestUserData(user.uid);
     cloudSchema = cloudData?.schemaVersion || 0;
     console.log(`[Migration] Cloud Schema: ${cloudSchema} | Local Schema: ${localSchema}`);

     // v1.3.9: SILENT MIGRATE for already updated accounts
     // If the cloud is already 7.2, this user has already migrated on some device.
     // We just need to mark this local device as 7.2 too and proceed.
     if (cloudSchema >= CONFIG.schemaVersion) {
        if (localSchema < CONFIG.schemaVersion) {
           console.log("[Migration] Cloud is 7.2. Silently updating local schema...");
           localStorage.setItem("jigsudo_user_stats", JSON.stringify({ ...stats, schemaVersion: CONFIG.schemaVersion }));
        }
        window._jigsudo_migration_freeze = false;
        return;
     }
  }

  // v1.3.9: FINAL CHECK - Show modal only if ACTUAL migration is needed
  // For guests: localSchema < 7.2
  // For users: cloudSchema < 7.2 (checked above)
  const needsMigration = isGuest ? (localSchema < CONFIG.schemaVersion) : (cloudSchema < CONFIG.schemaVersion);
  
  if (!needsMigration) {
     window._jigsudo_migration_freeze = false;
     return;
  }

  // If we reach here, we REALLY need to show the modal
  console.warn(`[Season Migration] Showing Season Modal. Local: ${localSchema}, Cloud: ${cloudSchema}`);
  
  // Inject styles
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./css/migration.css?v=1.3.0";
  document.head.appendChild(link);
  
  showSeasonOverlay();

  // v1.3.8: SYSTEM HALT - Return a promise that never resolves.
  // This effectively blocks 'main.js' or 'auth.js' from continuing app boot
  // while the migration modal is visible.
  return new Promise(() => {
     console.log("[Migration] Promise yielded - Application boot frozen by modal.");
  });
}

/**
 * Helper to wait for Firebase Auth to initialize before proceeding with remote cleanup.
 * @returns {Promise<Object|null>}
 */
async function waitForUser() {
  const { auth } = await import("./firebase-config.js?v=1.3.0");
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
    try {
      console.log("[Migration] BUTTON CLICKED: Starting migration sequence...");
      btn.disabled = true;
      btn.classList.add("hidden");
      document.getElementById("migration-loader").classList.remove("hidden");

      console.log("[Migration] Awaiting Auth state...");
      const user = await waitForUser();
      
      const dbPath = "./db.js?v=1.3.0";
      console.log(`[Migration] Importing DB logic from ${dbPath}...`);
      const { performSeasonReset } = await import(dbPath);
      
      const lang = localStorage.getItem("jigsudo_lang");
      const theme = localStorage.getItem("jigsudo_theme");
      const uid = localStorage.getItem("jigsudo_uid"); 
      
      console.log("[Migration] Executing local wipe...");
      localStorage.clear();
      
      if (lang) localStorage.setItem("jigsudo_lang", lang);
      if (theme) localStorage.setItem("jigsudo_theme", theme);
      if (uid) localStorage.setItem("jigsudo_uid", uid);

      localStorage.setItem("jigsudo_user_stats", JSON.stringify({ schemaVersion: CONFIG.schemaVersion }));

      if (user && !user.isAnonymous) {
        console.log(`[Migration] Calling performSeasonReset for ${user.uid}...`);
        const result = await performSeasonReset(user.uid);
        if (result && result.success) {
           console.log("[Migration] Cloud remote wipe logic finished successfully.");
        } else {
           throw new Error(result ? result.error : "Unknown error in performSeasonReset");
        }
      }

      localStorage.setItem("jigsudo_last_wipe_ack", Date.now().toString());
      console.log("[Migration] ALL SUCCESSFUL. Reloading page now.");
      window.location.reload();
    } catch (err) {
      console.error("[Migration] CRITICAL ERROR IN BUTTON HANDLER:", err);
      alert("Error al actualizar la temporada: " + err.message);
      btn.disabled = false;
      btn.classList.remove("hidden");
      document.getElementById("migration-loader").classList.add("hidden");
    }
  };
}
