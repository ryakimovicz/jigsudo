/* Ranking Module for Jigsudo */
import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";
import { getCurrentUser } from "./auth.js";

const CACHE_KEY = "jigsudo_ranking_cache";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetchRankings(forceRefresh = false) {
  const now = Date.now();
  const cached = localStorage.getItem(CACHE_KEY);

  const user = getCurrentUser();
  // Use stored UID as hints if auth not ready, to prevent cache mismatch on reload
  const currentUid = user
    ? user.uid
    : localStorage.getItem("jigsudo_active_uid") || "guest";

  if (!forceRefresh && cached) {
    const { timestamp, data, userId } = JSON.parse(cached);
    // Check TTL AND User Match
    if (now - timestamp < CACHE_TTL && userId === currentUid) {
      console.log("[Ranking] Using cached data (User verified)");
      return data;
    }
  }

  console.log("[Ranking] Fetching fresh data from Firestore");
  const { getUserRank } = await import("./db.js");

  const { getDailySeed } = await import("./utils/random.js");
  const seedStr = getDailySeed().toString();
  const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
  const currentMonth = today.substring(0, 7);

  const rankings = {
    daily: await getTopRankings(
      "dailyRP",
      10,
      user,
      getUserRank,
      "lastDailyUpdate",
      today,
    ),
    monthly: await getTopRankings(
      "monthlyRP",
      10,
      user,
      getUserRank,
      "lastMonthlyUpdate",
      currentMonth,
    ),
    allTime: await getTopRankings("totalRP", 10, user, getUserRank),
  };

  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ timestamp: now, data: rankings, userId: currentUid }),
  );
  return rankings;
}

async function getTopRankings(
  fieldName,
  limitCount,
  user,
  getUserRankFn,
  filterField = null,
  filterValue = null,
) {
  const top10 = await getTop10(fieldName, true, filterField, filterValue);

  const result = {
    top: top10,
    personal: null,
  };

  if (user) {
    // 1. Check if user is in top 10
    const inTop10 = top10.findIndex((u) => u.id === user.uid);
    const userScore = user.stats ? user.stats[fieldName] || 0 : 0;

    if (inTop10 !== -1) {
      result.personal = {
        rank: inTop10 + 1,
        score: userScore,
        username: user.displayName || "Usuario",
        inTop: true,
      };
    } else {
      // 2. Fetch actual rank using aggregation query (1 read)
      // Only verify rank for VERIFIED users to avoid index errors on unverified accounts
      let actualRank = "-";
      if (user.emailVerified) {
        actualRank = await getUserRankFn(fieldName, userScore, true);
      }

      result.personal = {
        rank: actualRank,
        score: userScore,
        username: user.displayName || "Usuario",
        inTop: false,
      };
    }
  }

  return result;
}

async function getTop10(
  fieldName,
  retryOnEmpty = false,
  filterField = null,
  filterValue = null,
) {
  try {
    const usersRef = collection(db, "users");
    let q;
    if (filterField && filterValue) {
      q = query(
        usersRef,
        where(filterField, "==", filterValue),
        where("isVerified", "==", true),
        orderBy(fieldName, "desc"),
        limit(10),
      );
    } else {
      q = query(
        usersRef,
        where("isVerified", "==", true),
        orderBy(fieldName, "desc"),
        limit(10),
      );
    }
    let querySnapshot = await getDocs(q);

    if (retryOnEmpty && querySnapshot.empty) {
      console.log(`[Ranking] ${fieldName} empty, retrying in 1.5s...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      querySnapshot = await getDocs(q);
    }

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      username: doc.data().username || "Anonymous",
      score: doc.data()[fieldName] || 0,
    }));
  } catch (error) {
    console.error(`[Ranking] Error fetching ${fieldName}:`, error);
    return [];
  }
}

// ----------------------------------------------------------------------------
// Render Rankings (FLIP Animated)
// ----------------------------------------------------------------------------
export function renderRankings(container, rankings, currentCategory = "daily") {
  if (!container) return;

  const categoryData = rankings[currentCategory] || { top: [], personal: null };
  const data = categoryData.top || [];
  const personal = categoryData.personal;
  const user = getCurrentUser();
  const lang = getCurrentLang();
  const t = translations[lang] || translations["es"];

  // Format options for locale score
  const scoreFormat = new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  // Initial Render (First Load)
  if (!container.querySelector("table")) {
    container.innerHTML = generateTableHtml(
      data,
      user,
      t,
      scoreFormat,
      personal,
    );
    return;
  }

  // Smart Update (FLIP Animation)
  const tbody = container.querySelector("tbody");
  const oldRows = Array.from(tbody.querySelectorAll("tr[data-uid]"));
  const oldPositions = new Map();

  // 1. Snapshot Old Positions
  oldRows.forEach((row) => {
    const rect = row.getBoundingClientRect();
    oldPositions.set(row.dataset.uid, rect.top);
  });

  // 2. Prepare Data Map
  const newDataMap = new Map();
  data.forEach((entry, index) => {
    newDataMap.set(entry.id, { entry, index, type: "top" });
  });

  // Handle Personal Row (if separated)
  if (personal && !personal.inTop && personal.rank > 10) {
    newDataMap.set(personal.username + "_p", {
      entry: personal,
      index: 999,
      type: "personal",
    }); // Pseudo-ID for personal
  }

  // 3. Identify Exiting Rows
  const exitingRows = oldRows.filter((row) => !newDataMap.has(row.dataset.uid));
  exitingRows.forEach((row) => {
    row.classList.add("exiting");
    row.style.transform = "scale(0.9) translateX(-20px)"; // Visual "slide out" aside from collapse
  });

  // 4. Build New DOM Structure (Off-screen fragment to sort?)
  // Actually, we must manipulate 'tbody' directly to get the final layout for measurement.
  // We will re-use existing rows to preserve them, and insert new ones.

  const currentUid = user ? user.uid : null;

  // Clear separator if it exists (simplification: rebuild separator/personal if needed)
  const separators = tbody.querySelectorAll(".ranking-separator");
  separators.forEach((s) => s.remove());

  // Function to create a row
  const createRow = (entry, index, isPersonal = false) => {
    const tr = document.createElement("tr");
    tr.className = "ranking-row";
    tr.dataset.uid = isPersonal ? entry.username + "_p" : entry.id; // Consistent ID
    updateRowContent(tr, entry, index, isPersonal, t, scoreFormat, currentUid);
    return tr;
  };

  const updateRowContent = (
    tr,
    entry,
    index,
    isPersonal,
    t,
    scoreFormat,
    currentUid,
  ) => {
    const isTop3 = index < 3 && !isPersonal;
    const isCurrentUser = currentUid && entry.id === currentUid;
    const isPersonalRow = isPersonal; // Explicit flag
    const medal =
      !isPersonal && index === 0
        ? "🥇"
        : index === 1
          ? "🥈"
          : index === 2
            ? "🥉"
            : "";

    tr.className = `ranking-row ${isTop3 ? "top-player" : ""} ${isCurrentUser ? "current-user-row" : ""} ${isPersonalRow ? "personal-rank-row" : ""}`;

    // Safety check for entry values
    const safeUsername = entry.username || "Anónimo";
    const safeScore = scoreFormat.format(entry.score || 0);
    const safeRank = isPersonal ? `#${entry.rank}` : medal || index + 1;

    tr.innerHTML = `
      <td class="rank-col">${safeRank}</td>
      <td class="user-col">${safeUsername} ${isCurrentUser ? t.ranking_you || "(Tú)" : ""}</td>
      <td class="score-col">${safeScore}</td>
    `;
  };

  // Rebuild the list
  // Strategy: We want the table to contain exactly the items in 'data' + optional personal.
  // But we want to KEEP exiting rows for a moment.
  // We can leave exiting rows in DOM (they are collapsing). We just need to put valid rows in correct order.

  // Let's create a list of nodes to insert/append
  const newRowNodes = [];

  // Top 10
  data.forEach((entry, index) => {
    let tr = tbody.querySelector(`tr[data-uid='${entry.id}']`);
    if (tr) {
      if (tr.classList.contains("exiting")) {
        // Should not happen if logic is correct, but safety:
        tr.classList.remove("exiting");
        tr.style.transform = "";
      }
      updateRowContent(tr, entry, index, false, t, scoreFormat, currentUid);
    } else {
      tr = createRow(entry, index, false);
      tr.classList.add("entering"); // For CSS animation
    }
    newRowNodes.push(tr);
  });

  // Personal
  if (personal && !personal.inTop && personal.rank > 10) {
    // Add Separator
    const sep = document.createElement("tr");
    sep.className = "ranking-separator";
    sep.innerHTML = `<td colspan="3">...</td>`;
    newRowNodes.push(sep);

    let pRow = tbody.querySelector(`tr[data-uid='${personal.username}_p']`);
    if (pRow) {
      updateRowContent(pRow, personal, 999, true, t, scoreFormat, currentUid);
    } else {
      pRow = createRow(personal, 999, true);
      pRow.classList.add("entering");
    }
    newRowNodes.push(pRow);
  }

  // REORDERING DOM
  // We append them in order. Existing nodes moving position is fine.
  // Exiting rows: We move them to the BOTTOM to get them out of the way of index calculations?
  // No, if we append newRows, they will naturally be at the bottom or top.
  // If we utilize `.prepend` or `.appendChild`, existing nodes move.
  // Exiting nodes stay where they are? No, they might block indices.
  // Best bet: Append everything we WANT to proper place. Exiting rows will be leftovers?
  // No, if I append `row1` which is already child 5, it moves to end.
  // I need to insert them in correct order.

  // Reference for insertion: We can adhere to the index.
  // But exiting rows screw up the `nth-child`.
  // Solution: Move exiting rows to the end of opacity? Or simply ignore their space?
  // User asked for "slide down disappearing". Collapsing CSS handles space.
  // To ensure the FLIP target math works, we need the layout to settle with exiting rows present-but-shrinking.

  // Let's just append everything that SHOULD be there in order.
  // Leaving exiting rows in DOM as orphans? No, if I don't touch them, they might stay in old positions (e.g. top).
  // I must move valid rows to their new correct sequence.
  const referenceNode = tbody.firstChild; // Insertion point?
  // Actually, standard `appendChild` sequence works.

  newRowNodes.forEach((node) => {
    tbody.appendChild(node);
  });

  // Now all valid rows are at the bottom of the tbody in order.
  // The exiting rows are at the TOP (because valid ones moved after them).
  // Wait, if I appendChild an existing node, it moves to end.
  // So Exiting rows (which I didn't touch) remain at the TOP.
  // This is bad visually. #1 exits, stays at top, while #2 (now #1) is below it.

  // Fix: Move exiting rows to the very bottom?
  // Or simpler: Re-insert them at the bottom?
  // If I move them, they jump.
  // SCENARIO: User is #2. Updates to #1.
  // Old #1 exits.
  // If I append New #1 (User), it goes to bottom. Old #1 stays at top.
  // New #1 is below Old #1.
  // Visual: Old #1 collapses. New #1 slides UP to fill gap.
  // This works! The "jump" to bottom is handled by FLIP.

  // 5. FLIP: Invert & Play
  requestAnimationFrame(() => {
    const validRows = newRowNodes.filter(
      (n) => n.nodeType === 1 && !n.classList.contains("ranking-separator"),
    );

    validRows.forEach((row) => {
      // If it's a separator, skip
      if (!row.dataset.uid) return;

      const uid = row.dataset.uid;

      // 1. New Position
      const newRect = row.getBoundingClientRect();

      // 2. Old Position?
      if (oldPositions.has(uid)) {
        const oldTop = oldPositions.get(uid);
        const deltaY = oldTop - newRect.top;

        if (Math.abs(deltaY) > 0) {
          // INVERT
          row.style.transform = `translateY(${deltaY}px)`;
          row.style.transition = "none";

          // PLAY
          requestAnimationFrame(() => {
            row.style.transform = ""; // Release to natural 0
            row.style.transition =
              "transform 0.6s cubic-bezier(0.2, 1, 0.3, 1)"; // "Diabolic" fluid easing
          });
        }
      } else {
        // ENTERING (Already check via class, but ensure smooth entry)
        // It's handled by CSS animation .ranking-row.entering?
        // Better to do JS entry to match the physics?
        // Let's stick to CSS for entering for simplicity as per existing logic.
      }
    });

    // Clean up exiting rows
    exitingRows.forEach((row) => {
      // Trigger CSS collapse
      // They are currently at the "top" (visually) because valid rows moved after them?
      // Wait, if `exiting` is at index 0, and `valid` moved to index 1...
      // Exiting collapses, Valid slides up. Perfect.
      // Just ensure they are removed later.
      setTimeout(() => row.remove(), 600);
    });

    // Clean up entering class
    setTimeout(() => {
      validRows.forEach((r) => r.classList.remove("entering"));
    }, 600);
  });
}

function generateTableHtml(data, user, t, scoreFormat, personal) {
  let html = `
    <table class="ranking-table">
      <thead>
        <tr>
          <th class="rank-col">#</th>
          <th class="user-col">${t.ranking_col_user || "Usuario"}</th>
          <th class="score-col">${t.ranking_col_points || "Puntos"}</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (data.length === 0) {
    html += `<tr><td colspan="3" class="empty-row">${t.rank_empty || "No hay datos todavía"}</td></tr>`;
  } else {
    data.forEach((entry, index) => {
      const isTop3 = index < 3;
      const isCurrentUser = user && entry.id === user.uid;
      const medal =
        index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";

      // ADD data-uid
      html += `
        <tr class="ranking-row ${isTop3 ? "top-player" : ""} ${isCurrentUser ? "current-user-row" : ""}" data-uid="${entry.id}">
          <td class="rank-col">${medal || index + 1}</td>
          <td class="user-col">${entry.username} ${isCurrentUser ? t.ranking_you || "(Tú)" : ""}</td>
          <td class="score-col">${scoreFormat.format(entry.score)}</td>
        </tr>
      `;
    });

    if (personal && !personal.inTop && personal.rank > 10) {
      html += `
        <tr class="ranking-separator">
          <td colspan="3">...</td>
        </tr>
        <tr class="ranking-row current-user-row personal-rank-row" data-uid="${personal.username}_p">
          <td class="rank-col">#${personal.rank}</td>
          <td class="user-col">${personal.username} ${t.ranking_you || "(Tú)"}</td>
          <td class="score-col">${scoreFormat.format(personal.score)}</td>
        </tr>
      `;
    }
  }

  html += `</tbody></table>`;
  return html;
}

export function clearRankingCache() {
  localStorage.removeItem(CACHE_KEY);
}
