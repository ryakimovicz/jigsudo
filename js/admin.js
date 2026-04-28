import { isAdmin } from "./auth.js?v=1.4.10";
import { getCurrentLang, updateTexts } from "./i18n.js?v=1.4.10";
import { formatTime } from "./ui.js?v=1.4.10";
import { db } from "./firebase-config.js?v=1.4.10";
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  getCountFromServer,
  where,
  updateDoc,
  doc,
  deleteField,
  writeBatch,
  getDoc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

/**
 * v1.6.0: Administrative Dashboard Module
 * Handles the logic for managing reports and admin views.
 */
let reportsData = [];
let usersData = [];
let sortConfig = { key: "timestamp", direction: "desc" };
let currentEditingUserId = null;

export async function initAdmin() {
  console.log("[Admin] Module Loaded");

  // Initial stats fetch
  updateAdminBadges();

  // Navigation: Back from detail
  const detailBack = document.querySelectorAll(".back-to-dashboard");
  detailBack.forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".admin-detail-view").forEach(v => v.classList.add("hidden"));
      document.querySelector(".admin-dashboard-grid").classList.remove("hidden");
    };
  });

  // Back to users list
  const backToUsers = document.querySelectorAll(".back-to-users");
  backToUsers.forEach(btn => {
    btn.onclick = () => {
      document.getElementById("admin-user-edit").classList.add("hidden");
      document.getElementById("admin-users-list").classList.remove("hidden");
    };
  });

  // Module Card: Open Referee Audit
  const refereeCard = document.getElementById("admin-module-referee");
  if (refereeCard) {
    refereeCard.onclick = () => {
      document.getElementById("admin-referee-detail").classList.remove("hidden");
      document.querySelector(".admin-dashboard-grid").classList.add("hidden");
      loadRefereeReports();
    };
  }

  // Module Card: Open User Management
  const usersCard = document.getElementById("admin-module-users");
  if (usersCard) {
    usersCard.onclick = () => {
      document.getElementById("admin-users-list").classList.remove("hidden");
      document.querySelector(".admin-dashboard-grid").classList.add("hidden");
      loadUsers();
    };
  }

  // Back to Home
  const adminBack = document.getElementById("admin-back-btn");
  if (adminBack) {
    adminBack.onclick = () => {
       window.location.hash = "";
    };
  }

  // Refresh Button
  const refreshBtn = document.getElementById("btn-refresh-reports");
  if (refreshBtn) {
    refreshBtn.onclick = () => loadRefereeReports();
  }

  // Sorting Listeners
  const headerDate = document.getElementById("header-sort-date");
  if (headerDate) headerDate.onclick = () => handleSort("timestamp");
  
  const headerUser = document.getElementById("header-sort-user");
  if (headerUser) headerUser.onclick = () => handleSort("username");

  // User Search
  const userSearch = document.getElementById("admin-user-search");
  if (userSearch) {
    userSearch.oninput = (e) => filterUsers(e.target.value);
  }

  // Save User
  const btnSave = document.getElementById("btn-save-user");
  if (btnSave) {
    btnSave.onclick = () => saveUserChanges();
  }

  // Reset User (v1.8.0)
  const btnReset = document.getElementById("btn-reset-user");
  if (btnReset) {
    btnReset.onclick = () => {
      if (currentEditingUserId) resetUser(currentEditingUserId);
    };
  }
  // Delete All Button
  const btnDeleteAll = document.getElementById("btn-delete-all-reports");
  if (btnDeleteAll) {
    btnDeleteAll.onclick = () => deleteAllReports();
  }
}

function parseTimeToMs(str) {
  if (!str) return 0;
  if (typeof str !== "string") return parseInt(str) || 0;
  
  // If it's a plain number, assume it's already ms
  if (!isNaN(str) && !str.includes(":")) return parseInt(str);

  const parts = str.split(":").map(p => parseInt(p) || 0);
  let seconds = 0;

  if (parts.length === 3) {
    // hh:mm:ss
    seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  } else if (parts.length === 2) {
    // mm:ss
    seconds = (parts[0] * 60) + parts[1];
  } else {
    seconds = parts[0] || 0;
  }

  return seconds * 1000;
}

function handleSort(key) {
  if (sortConfig.key === key) {
    sortConfig.direction = sortConfig.direction === "asc" ? "desc" : "asc";
  } else {
    sortConfig.key = key;
    sortConfig.direction = "asc";
  }
  renderReports();
  updateSortUI();
}

async function loadRefereeReports() {
  const tbody = document.getElementById("admin-reports-tbody");
  const loader = document.getElementById("admin-reports-loader");
  const empty = document.getElementById("admin-reports-empty");

  if (!tbody) return;

  tbody.innerHTML = "";
  loader.classList.remove("hidden");
  empty.classList.add("hidden");

  try {
    const reportsRef = collection(db, "referee_reports");
    const q = query(reportsRef, orderBy("timestamp", "desc"), limit(50));
    const querySnapshot = await getDocs(q);

    loader.classList.add("hidden");

    reportsData = [];
    querySnapshot.forEach((docSnap) => {
      reportsData.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (reportsData.length === 0) {
      empty.classList.remove("hidden");
      return;
    }

    renderReports();
  } catch (e) {
    console.error("[Admin] Error loading reports:", e);
    loader.classList.add("hidden");
    empty.textContent = "Error al cargar reportes.";
    empty.classList.remove("hidden");
  }
}

function renderReports() {
  const tbody = document.getElementById("admin-reports-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const sorted = [...reportsData].sort((a, b) => {
    let valA = a[sortConfig.key];
    let valB = b[sortConfig.key];

    // Timestamp special handling
    if (sortConfig.key === "timestamp") {
      valA = valA?.toMillis ? valA.toMillis() : 0;
      valB = valB?.toMillis ? valB.toMillis() : 0;
    } else {
      // String handling (fallback to ID if username missing)
      valA = (valA || a.userId || "").toLowerCase();
      valB = (valB || b.userId || "").toLowerCase();
    }

    if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
    if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  sorted.forEach(data => {
    tbody.appendChild(createReportRow(data));
  });
}

function updateSortUI() {
  document.querySelectorAll(".admin-table th").forEach(th => th.classList.remove("sort-asc", "sort-desc"));
  const activeHeader = sortConfig.key === "timestamp" ? "header-sort-date" : "header-sort-user";
  const el = document.getElementById(activeHeader);
  if (el) el.classList.add(sortConfig.direction === "asc" ? "sort-asc" : "sort-desc");
}

function createReportRow(data) {
  const tr = document.createElement("tr");
  
  const ts = data.timestamp ? data.timestamp.toDate() : new Date();
  const dateStr = ts.toISOString().replace("T", " ").substring(0, 19);
  
  const userDisplay = data.username ? `${data.username} (${data.userId.substring(0, 5)}...)` : data.userId;
  const timeStr = data.timeMs ? formatTime(data.timeMs) : "N/A";

  tr.innerHTML = `
    <td>${dateStr}</td>
    <td title="${data.userId}">${userDisplay}</td>
    <td>${data.seed || "---"}</td>
    <td>${data.stage || "---"}</td>
    <td>${timeStr}</td>
    <td class="reason-cell">${data.reason || "Sospechoso"}</td>
    <td>
      <button class="btn-delete-report" data-id="${data.id}" title="Eliminar reporte">🗑️</button>
    </td>
  `;

  const deleteBtn = tr.querySelector(".btn-delete-report");
  if (deleteBtn) {
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteReport(data.id);
    };
  }

  return tr;
}

async function deleteReport(reportId) {
  if (!confirm("¿Seguro que quieres eliminar este reporte?")) return;

  try {
    const reportRef = doc(db, "referee_reports", reportId);
    await deleteDoc(reportRef);
    
    // Update local data and UI
    reportsData = reportsData.filter(r => r.id !== reportId);
    renderReports();
    updateAdminBadges();
  } catch (e) {
    console.error("[Admin] Error deleting report:", e);
    alert("Error al eliminar el reporte.");
  }
}

async function deleteAllReports() {
  const count = reportsData.length;
  if (count === 0) return;
  if (!confirm(`⚠️ ¿ESTÁS SEGURO? Se eliminarán los ${count} reportes visibles permanentemente.`)) return;

  const btn = document.getElementById("btn-delete-all-reports");
  const originalText = btn.innerHTML;
  btn.innerHTML = "Borrando...";
  btn.disabled = true;

  try {
    const batch = writeBatch(db);
    // Firestore batch limit is 500, we are loading 50, so it's safe.
    reportsData.forEach(r => {
      const ref = doc(db, "referee_reports", r.id);
      batch.delete(ref);
    });

    await batch.commit();
    
    reportsData = [];
    renderReports();
    updateAdminBadges();
    alert("¡Todos los reportes han sido eliminados!");
  } catch (e) {
    console.error("[Admin] Error deleting all reports:", e);
    alert("Error al eliminar los reportes.");
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

/**
 * USER MANAGEMENT LOGIC
 */
async function loadUsers() {
  const tbody = document.getElementById("admin-users-tbody");
  const loader = document.getElementById("admin-users-loader");
  const empty = document.getElementById("admin-users-empty");

  if (!tbody) return;

  tbody.innerHTML = "";
  loader.classList.remove("hidden");
  empty.classList.add("hidden");

  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy("lastUpdated", "desc"), limit(100));
    const querySnapshot = await getDocs(q);

    loader.classList.add("hidden");
    usersData = [];
    querySnapshot.forEach((docSnap) => {
      usersData.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderUsers(usersData);
    if (usersData.length === 0) empty.classList.remove("hidden");

  } catch (e) {
    console.error("[Admin] Error loading users:", e);
    loader.classList.add("hidden");
  }
}

function getRelativeTime(timestamp) {
  if (!timestamp) return "---";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return "Hace momentos";
  if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)}m`;
  if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)}h`;
  if (diffInSeconds < 604800) return `Hace ${Math.floor(diffInSeconds / 86400)}d`;
  
  return date.toLocaleDateString();
}

function renderUsers(list) {
  const tbody = document.getElementById("admin-users-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  list.forEach(user => {
    const tr = document.createElement("tr");
    const name = user.username || "Guest";
    const rp = (user.totalRP || 0).toFixed(3);
    const date = user.registeredAt ? (user.registeredAt.toDate ? user.registeredAt.toDate().toLocaleDateString() : "---") : "---";
    const activity = getRelativeTime(user.lastUpdated);
    const activityClass = (activity.includes("m") || activity.includes("momentos")) ? "activity-online" : "";
    
    tr.innerHTML = `
      <td>
        <div style="font-weight: 600">${name}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted)">${user.id}</div>
      </td>
      <td>${rp}</td>
      <td>${date}</td>
      <td class="activity-tag ${activityClass}">${activity}</td>
      <td>
        <button class="detail-back-btn edit-user-btn" data-id="${user.id}">Editar</button>
      </td>
    `;

    const editBtn = tr.querySelector(".edit-user-btn");
    editBtn.onclick = () => openUserEditor(user);
    
    tbody.appendChild(tr);
  });
}

function filterUsers(queryStr) {
  const q = queryStr.toLowerCase().trim();
  const filtered = usersData.filter(u => 
    (u.username || "").toLowerCase().includes(q) || 
    u.id.toLowerCase().includes(q)
  );
  renderUsers(filtered);
}

function openUserEditor(user) {
  currentEditingUserId = user.id;
  document.getElementById("admin-users-list").classList.add("hidden");
  document.getElementById("admin-user-edit").classList.remove("hidden");

  // Fill form
  document.getElementById("edit-user-name").value = user.username || "";
  document.getElementById("edit-user-uid").value = user.id;
  document.getElementById("edit-user-public").value = user.isPublic !== false ? "true" : "false";
  document.getElementById("edit-user-verified").value = user.isVerified ? "true" : "false";
  
  const regDate = user.registeredAt ? (user.registeredAt.toDate ? user.registeredAt.toDate().toLocaleString() : "---") : "---";
  document.getElementById("edit-user-reg-date").value = regDate;

  document.getElementById("edit-user-total-rp").value = user.totalRP || 0;
  document.getElementById("edit-user-monthly-rp").value = user.monthlyRP || 0;
  document.getElementById("edit-user-daily-rp").value = user.dailyRP || 0;
  document.getElementById("edit-user-last-day-rp").value = user.lastDayRP || 0;
  document.getElementById("edit-user-last-month-rp").value = user.lastMonthRP || 0;
  
  const stats = user.stats || {};
  document.getElementById("edit-user-streak").value = stats.currentStreak || 0;
  document.getElementById("edit-user-max-streak").value = stats.maxStreak || 0;
  document.getElementById("edit-user-wins").value = stats.wins || 0;

  // v1.7.0 Saneamiento v7.1: El progreso local ya no debe contener 'stats' map
  document.getElementById("edit-user-best-score").value = stats.bestScore || user.bestScore || 0;
  document.getElementById("edit-user-best-time").value = formatTime(stats.bestTime || user.bestTime || 0);

  document.getElementById("edit-user-last-played").value = stats.lastPlayedDate || user.lastPlayedDate || "";
  
  document.getElementById("edit-user-total-played").value = stats.totalPlayed || user.totalPlayed || 0;
  document.getElementById("edit-user-total-score").value = stats.totalScoreAccumulated || user.totalScoreAccumulated || 0;
  
  document.getElementById("edit-user-total-time").value = formatTime(stats.totalTimeAccumulated || user.totalTimeAccumulated || 0);
  document.getElementById("edit-user-total-peaks").value = stats.totalPeaksErrorsAccumulated || user.totalPeaksErrorsAccumulated || 0;
  document.getElementById("edit-user-total-penalty").value = stats.totalPenaltyAccumulated || user.totalPenaltyAccumulated || 0;

  // JSON Maps (Corrected to check inside 'stats' map)
  document.getElementById("edit-user-stage-times").value = JSON.stringify(stats.stageTimesAccumulated || user.stageTimesAccumulated || {}, null, 2);
  document.getElementById("edit-user-stage-wins").value = JSON.stringify(stats.stageWinsAccumulated || user.stageWinsAccumulated || {}, null, 2);
  document.getElementById("edit-user-weekday-stats").value = JSON.stringify(stats.weekdayStatsAccumulated || user.weekdayStatsAccumulated || {}, null, 2);

  document.getElementById("user-last-online").textContent = `Última conexión: ${getRelativeTime(user.lastUpdated)}`;

  // Load History
  loadUserHistory(user.id);
}

async function loadUserHistory(userId) {
  const tbody = document.getElementById("admin-user-history-tbody");
  const loader = document.getElementById("admin-history-loader");
  const empty = document.getElementById("admin-history-empty");

  if (!tbody) return;
  tbody.innerHTML = "";
  loader.classList.remove("hidden");
  empty.classList.add("hidden");

  try {
    const historyRef = collection(db, "users", userId, "history");
    const q = query(historyRef, orderBy("seed", "desc"), limit(15));
    const snap = await getDocs(q);

    loader.classList.add("hidden");
    if (snap.empty) {
      empty.classList.remove("hidden");
      return;
    }

    snap.forEach(docSnap => {
      const data = docSnap.id.length === 8 ? { ...docSnap.data(), date: docSnap.id } : docSnap.data();
      tbody.appendChild(createHistoryRow(data));
    });

  } catch (e) {
    console.error("[Admin] Error loading history:", e);
    loader.classList.add("hidden");
    empty.textContent = "Error al cargar historial.";
    empty.classList.add("hidden");
  }
}

function createHistoryRow(data) {
  const tr = document.createElement("tr");
  const orig = data.original || {};
  
  // Format Date: Use 'played' timestamp if available, else parse seed
  let dateDisplay = "---";
  if (data.played) {
     const pDate = data.played.toDate ? data.played.toDate() : new Date(data.played);
     dateDisplay = `${pDate.getDate().toString().padStart(2, '0')}/${(pDate.getMonth()+1).toString().padStart(2, '0')}`;
  } else if (data.date) {
     dateDisplay = `${data.date.substring(6,8)}/${data.date.substring(4,6)}`;
  }

  const score = (orig.score || 0).toFixed(2);
  const errors = orig.errors !== undefined ? orig.errors : "---";
  const time = orig.totalTime ? formatTime(orig.totalTime) : "---";
  const status = orig.won ? `<span class="status-pill status-verified">Ganada</span>` : `<span class="activity-tag">Perdida</span>`;

  tr.innerHTML = `
    <td>${dateDisplay}</td>
    <td style="font-family: monospace">${data.seed}</td>
    <td style="font-weight: 600">${score}</td>
    <td>${errors}</td>
    <td>${time}</td>
    <td>${status}</td>
  `;
  return tr;
}

async function saveUserChanges() {
  if (!currentEditingUserId) return;
  
  const btn = document.getElementById("btn-save-user");
  const originalText = btn.textContent;
  btn.textContent = "Guardando...";
  btn.disabled = true;

  const updates = {
    username: document.getElementById("edit-user-name").value,
    username_lc: document.getElementById("edit-user-name").value.toLowerCase(),
    isPublic: document.getElementById("edit-user-public").value === "true",
    isVerified: document.getElementById("edit-user-verified").value === "true",
    totalRP: parseFloat(document.getElementById("edit-user-total-rp").value) || 0,
    monthlyRP: parseFloat(document.getElementById("edit-user-monthly-rp").value) || 0,
    dailyRP: parseFloat(document.getElementById("edit-user-daily-rp").value) || 0,
    lastDayRP: parseFloat(document.getElementById("edit-user-last-day-rp").value) || 0,
    lastMonthRP: parseFloat(document.getElementById("edit-user-last-month-rp").value) || 0,
    
    // v1.4.5: Robust Hybrid Detection. Root fields (v7.1) vs Inner Map (Legacy/Partial)
    "stats.currentStreak": parseInt(document.getElementById("edit-user-streak").value) || 0,
    "stats.maxStreak": parseInt(document.getElementById("edit-user-max-streak").value) || 0,
    "stats.wins": parseInt(document.getElementById("edit-user-wins").value) || 0,
    "stats.bestScore": parseFloat(document.getElementById("edit-user-best-score").value) || 0,
    "stats.bestTime": parseTimeToMs(document.getElementById("edit-user-best-time").value),
    "stats.lastPlayedDate": document.getElementById("edit-user-last-played").value,
    "stats.totalPlayed": parseInt(document.getElementById("edit-user-total-played").value) || 0,
    "stats.totalScoreAccumulated": parseFloat(document.getElementById("edit-user-total-score").value) || 0,
    "stats.totalTimeAccumulated": parseTimeToMs(document.getElementById("edit-user-total-time").value),
    "stats.totalPeaksErrorsAccumulated": parseInt(document.getElementById("edit-user-total-peaks").value) || 0,
    "stats.totalPenaltyAccumulated": parseInt(document.getElementById("edit-user-total-penalty").value) || 0,

    lastUpdated: new Date(),
    lastLocalUpdate: Date.now()
  };

  // Parse JSON Maps (Saved into 'stats' map)
  try {
    updates["stats.stageTimesAccumulated"] = JSON.parse(document.getElementById("edit-user-stage-times").value || "{}");
    updates["stats.stageWinsAccumulated"] = JSON.parse(document.getElementById("edit-user-stage-wins").value || "{}");
    updates["stats.weekdayStatsAccumulated"] = JSON.parse(document.getElementById("edit-user-weekday-stats").value || "{}");
  } catch (e) {
    alert("Error en el formato JSON de los mapas. Por favor, revisa la sintaxis.");
    btn.textContent = originalText;
    btn.disabled = false;
    return;
  }

  try {
    const userRef = doc(db, "users", currentEditingUserId);
    await updateDoc(userRef, updates);
    
    // Refresh local list
    const idx = usersData.findIndex(u => u.id === currentEditingUserId);
    if (idx !== -1) usersData[idx] = { ...usersData[idx], ...updates };
    
    alert("¡Usuario actualizado correctamente!");
    
    document.getElementById("admin-user-edit").classList.add("hidden");
    document.getElementById("admin-users-list").classList.remove("hidden");
    renderUsers(usersData);

  } catch (e) {
    console.error("[Admin] Error saving user:", e);
    alert("Error al guardar los cambios.");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function resetUser(userId) {
  const confirm1 = confirm("⚠️ ¿ESTÁS SEGURO? Esta acción borrará TODOS los récords, estadísticas e historial del usuario permanentemente.");
  if (!confirm1) return;

  const confirm2 = confirm("🚨 ULTIMA ADVERTENCIA: Se borrarán todas las partidas jugadas. Esta acción no se puede deshacer. ¿Continuar?");
  if (!confirm2) return;

  const btn = document.getElementById("btn-reset-user");
  const originalText = btn.textContent;
  btn.textContent = "Reseteando...";
  btn.disabled = true;

  try {
    // 0. Get current data to preserve keepers
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      alert("Error: El usuario ya no existe.");
      return;
    }
    const oldData = userSnap.data();

    // 1. Delete History Sub-collection
    const historyRef = collection(db, "users", userId, "history");
    const snapshot = await getDocs(historyRef);
    
    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
      console.log(`[Admin] Deleted ${snapshot.size} history records.`);
    }

    // 2. Perform TRUE Hard Reset (Overwrite document)
    const cleanData = {
      // KEEPERS: Identity & Versioning
      username: oldData.username || "Usuario",
      username_lc: oldData.username_lc || (oldData.username ? oldData.username.toLowerCase() : "usuario"),
      registeredAt: oldData.registeredAt || new Date(),
      schemaVersion: oldData.schemaVersion || 7.1,
      
      // DEFAULTS: Resetted stats
      totalRP: 0,
      monthlyRP: 0,
      dailyRP: 0,
      lastDayRP: 0,
      lastMonthRP: 0,
      isPublic: true,
      isVerified: oldData.isVerified || false,
      
      // SYNC: Forcing client pull and local cache self-destruction
      lastUpdated: new Date(),
      lastLocalUpdate: Date.now(),
      forceWipeAt: Date.now()
    };

    // This completely REPLACES the document, purging any legacy fields
    await setDoc(userRef, cleanData);
    alert("Usuario reseteado con éxito (Limpieza Total).");

    // Close and refresh
    document.getElementById("admin-user-edit").classList.add("hidden");
    document.getElementById("admin-users-list").classList.remove("hidden");
    loadUsers();

  } catch (e) {
    console.error("[Admin] Error resetting user:", e);
    alert("Error al resetear el usuario.");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

export function showAdminPanel() {
  const section = document.getElementById("admin-section");
  const menu = document.getElementById("menu-content");
  const profile = document.getElementById("profile-section");
  const footer = document.querySelector(".main-footer");

  if (section) section.classList.remove("hidden");

  // v1.9.4: Reset view to main dashboard
  document.querySelectorAll(".admin-detail-view").forEach(v => v.classList.add("hidden"));
  const dashboard = document.querySelector(".admin-dashboard-grid");
  if (dashboard) dashboard.classList.remove("hidden");

  document.body.classList.add("admin-active");
  document.body.classList.remove("home-active", "profile-active");

  updateTexts();
  
  // Highlight Sidebar
  import("./sidebar.js?v=1.4.10").then((mod) => {
    if (mod.updateSidebarActiveState) mod.updateSidebarActiveState("nav-admin");
  });
}

async function updateAdminBadges(retries = 1) {
  const badge = document.getElementById("referee-alert-count");
  if (!badge) return;

  try {
    const reportsRef = collection(db, "referee_reports");
    const snapshot = await getCountFromServer(reportsRef);
    badge.textContent = snapshot.data().count;

    const usersBadge = document.getElementById("admin-user-count");
    if (usersBadge) {
      const usersRef = collection(db, "users");
      const userCountSnap = await getCountFromServer(usersRef);
      usersBadge.textContent = userCountSnap.data().count;
    }
  } catch (e) {
    console.warn("[Admin] Failed to update badges (will retry?):", e);
    if (retries > 0) {
      console.log(`[Admin] Retrying badge update in 3s... (Remaining retries: ${retries - 1})`);
      setTimeout(() => updateAdminBadges(retries - 1), 3000);
    }
  }
}

export function hideAdminPanel() {
  const section = document.getElementById("admin-section");
  if (section) section.classList.add("hidden");
  document.body.classList.remove("admin-active");
}
