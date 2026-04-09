/* Ranking Module for Jigsudo */
import { db } from "./firebase-config.js?v=1.1.19";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocsFromServer,
  where,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { translations } from "./translations.js?v=1.1.19";
import { getCurrentLang } from "./i18n.js?v=1.1.19";
import { getCurrentUser } from "./auth.js?v=1.1.19";
import { getRankData, SCORING } from "./ranks.js?v=1.1.19";
import { gameManager } from "./game-manager.js?v=1.1.19";
import { getDailySeed } from "./utils/random.js?v=1.1.19";

const CACHE_KEY = "jigsudo_ranking_cache_v3";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function getCachedRankings() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached).data;
    } catch (e) {
      return null;
    }
  }
  return null;
}

export async function fetchRankings(forceRefresh = false) {
  // Ensure gameManager is ready so local stats are up to date for score comparison
  await gameManager.ready;

  const now = Date.now();
  const cached = localStorage.getItem(CACHE_KEY);

  const user = getCurrentUser();
  // Use stored UID as hints if auth not ready, to prevent cache mismatch on reload
  const currentUid = user
    ? user.uid
    : localStorage.getItem("jigsudo_active_uid") || "guest";

  const seedStr = getDailySeed().toString();
  const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;

  if (!forceRefresh && cached) {
    const { timestamp, data, userId, cachedToday, isAuthenticated } =
      JSON.parse(cached);

    const stats = gameManager.stats;
    const isStaleByScore =
      (stats.dailyRP || 0) > (data.daily?.personal?.score ?? -0.001) ||
      (stats.monthlyRP || 0) > (data.monthly?.personal?.score ?? -0.001);

    // PARADOX DETECTION: If cache says user is OUT of top, but local score is GREATER than top people, it's stale!
    let isParadox = false;
    const categories = ["daily", "monthly", "allTime"];
    categories.forEach((cat) => {
      const catData = data[cat];
      if (catData && catData.personal && !catData.personal.inTop) {
        const myScore = catData.personal.score;
        const topList = catData.top || [];
        if (topList.length > 0) {
          const lastTopScore = topList[topList.length - 1].score;
          if (myScore > lastTopScore) {
            isParadox = true;
            console.warn(`[Ranking] Paradox detected in ${cat}: My score ${myScore} > Last top score ${lastTopScore}. Forcing refresh.`);
          }
        } else if (myScore > 0) {
          // Table is empty in cache but I have points? Paradox!
          isParadox = true;
        }
      }
    });

    const needsAuthUpgrade = (user && !isAuthenticated) || isStaleByScore || isParadox;

    if (
      !needsAuthUpgrade &&
      now - timestamp < CACHE_TTL &&
      userId === currentUid &&
      cachedToday === today
    ) {
      console.log("[Ranking] Using cached data (User and Day verified)");
      return data;
    }
    if (needsAuthUpgrade)
      console.log(
        `[Ranking] Cache invalidated (Auth: ${!!user}, Stale: ${isStaleByScore}, Paradox: ${isParadox})`,
      );
  }

  const currentMonth = today.substring(0, 7);

  const rankings = {
    daily: await getTopRankings(
      "dailyRP",
      10,
      user,
      (await import("./db.js?v=1.1.19")).getUserRank,
      "lastDailyUpdate",
      today,
    ),
    monthly: await getTopRankings(
      "monthlyRP",
      10,
      user,
      (await import("./db.js?v=1.1.19")).getUserRank,
      "lastMonthlyUpdate",
      currentMonth,
    ),
    allTime: await getTopRankings(
      "totalRP",
      10,
      user,
      (await import("./db.js?v=1.1.19")).getUserRank,
    ),
  };

  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      timestamp: now,
      data: rankings,
      userId: currentUid,
      cachedToday: today,
      isAuthenticated: !!user,
    }),
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

  // Robust Personal Row logic: Try with hint if full user isn't here yet
  const activeUid = user ? user.uid : localStorage.getItem("jigsudo_active_uid");
  const activeUsername = user
    ? user.displayName
    : localStorage.getItem("jigsudo_active_username");

  if (activeUid) {
    // 1. Check if user is in top 10 from DB data
    const topEntry = top10.find((u) => u.id === activeUid);
    let inTop10 = top10.findIndex((u) => u.id === activeUid);

    // UI Robustness: Use gameManager.stats (Source of truth)
    const stats = gameManager.stats;
    let userScore = (stats && stats[fieldName]) || 0;

    // Trust DB score over local if discrepancy exists while in Top 10
    if (topEntry) {
      userScore = Math.max(userScore, topEntry.score || 0);
    }

    // If we have a filter (Daily/Monthly) and the local stats date doesn't match the target period,
    // it means the maintenance script hasn't run or we haven't played yet -> Show 0.
    if (filterField && stats[filterField] !== filterValue && !topEntry) {
      userScore = 0;
    }

    // NEW ROBUST INJECTION: If user is missing from DB list due to latency/cache, inject them!
    if (inTop10 === -1 && userScore > 0) {
      const injectEntry = {
        id: activeUid,
        username: activeUsername || "Usuario",
        score: userScore,
        totalRP: stats.totalScoreAccumulated || stats.currentRP || 0, // Fallback for correct rank level
      };

      // Find where they belong
      let insertIndex = top10.findIndex((u) => userScore > u.score);
      
      if (insertIndex !== -1) {
        top10.splice(insertIndex, 0, injectEntry);
        if (top10.length > 10) top10.pop(); // Keep it strictly Top 10
      } else if (top10.length < 10) {
        top10.push(injectEntry);
      }
      
      // Re-evaluate their position after injection
      inTop10 = top10.findIndex((u) => u.id === activeUid);
    }

    if (inTop10 !== -1) {
      result.personal = {
        id: activeUid,
        rank: inTop10 + 1,
        score: userScore,
        username: activeUsername || "Usuario",
        inTop: true,
      };
    } else {
      // 2. Fetch actual rank
      let actualRank = "-";
      // We can only fetch real rank if we have a full verified user or we are brave
      if (user && user.emailVerified) {
        actualRank = await getUserRankFn(fieldName, userScore, true, filterField, filterValue) || "-";
      }

      result.personal = {
        id: activeUid,
        rank: actualRank,
        score: userScore,
        username: activeUsername || "Usuario",
        totalRP: stats.totalScoreAccumulated || stats.currentRP || 0,
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
      console.log(`[Ranking] Fetching fresh ranking data for ${fieldName} (${filterField}=${filterValue})...`);
      q = query(
        usersRef,
        where(filterField, "==", filterValue),
        where("isVerified", "==", true),
        where("isPublic", "==", true),
        where(fieldName, ">", 0),
        orderBy(fieldName, "desc"),
        limit(25),
      );
    } else {
      console.log(`[Ranking] Fetching fresh all-time ranking data for ${fieldName}...`);
      q = query(
        usersRef,
        where("isVerified", "==", true),
        where("isPublic", "==", true),
        where(fieldName, ">", 0),
        orderBy(fieldName, "desc"),
        limit(25),
      );
    }
    let querySnapshot = await getDocsFromServer(q);

    if (retryOnEmpty && querySnapshot.empty) {
      console.log(`[Ranking] ${fieldName} empty, retrying in 1.5s...`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      querySnapshot = await getDocsFromServer(q);
    }

    const activeUid = localStorage.getItem("jigsudo_active_uid");

    return querySnapshot.docs
      .map((doc) => ({
        id: doc.id,
        username: doc.data().username || "Anonymous",
        score: doc.data()[fieldName] || 0,
        totalRP: doc.data().totalRP || 0, // Fetch totalRP for rank calculation
        isPublic: doc.data().isPublic !== false
      }))
      .filter((u) => u.isPublic || u.id === activeUid)
      .slice(0, 10);
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
  // Ensure headers are translated
  const userColHeader = container.querySelector("thead .user-col");
  const scoreColHeader = container.querySelector("thead .score-col");
  if (userColHeader) {
    userColHeader.textContent = t.ranking_col_user || "Usuario";
    userColHeader.setAttribute("data-i18n", "ranking_col_user");
  }
  if (scoreColHeader) {
    scoreColHeader.textContent = t.ranking_col_points || "Puntos";
    scoreColHeader.setAttribute("data-i18n", "ranking_col_points");
  }

  const tbody = container.querySelector("tbody");

  // Handle Empty State during Smart Update
  const emptyRow = tbody.querySelector(".empty-row");
  if (data.length === 0) {
    if (emptyRow) {
      emptyRow.textContent = t.rank_empty || "No hay datos todavía";
      emptyRow.setAttribute("data-i18n", "rank_empty");
    } else {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-row" data-i18n="rank_empty">${t.rank_empty || "No hay datos todavía"}</td></tr>`;
    }
    return;
  } else if (emptyRow) {
    tbody.innerHTML = ""; // Clear empty message to make room for rows
  }

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

  // Handle Personal Row (Only if NOT in top 10)
  if (personal && !personal.inTop) {
    newDataMap.set(personal.id || "personal_row", {
      entry: personal,
      index: 999,
      type: "personal",
    });
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
    tr.dataset.uid = entry.id || (isPersonal ? "personal_row" : "guest");
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

    const newClass = `ranking-row ${isTop3 ? "top-player" : ""} ${isCurrentUser ? "current-user-row" : ""} ${isPersonalRow ? "personal-rank-row" : ""}`;
    if (tr.className !== newClass) {
      tr.className = newClass;
    }

    // Safety check for entry values
    const safeUsername = entry.username || "Anónimo";
    const safeScore = scoreFormat.format(entry.score || 0);
    const safeRank = isPersonal ? `${entry.rank}` : medal || index + 1;

    // Rank details for each user
    const rankData = getRankData(entry.totalRP || 0);
    const rankName = t[rankData.rank.nameKey] || rankData.rank.nameKey;
    const rankLevel = `${t.rank_level_prefix || "Nvl."} ${rankData.level}`;

    const newHtml = `
      <td class="rank-col">${safeRank}</td>
      <td class="user-col">
        <div class="user-info-group">
          <span class="username-text">${safeUsername} ${isCurrentUser ? t.ranking_you || "(Tú)" : ""}</span>
          <span class="user-rank-subtext">${rankLevel} • ${rankName}</span>
        </div>
      </td>
      <td class="score-col">${safeScore}</td>
    `;

    // Only update DOM if content changed (prevents blinking on re-renders)
    if (tr.innerHTML !== newHtml) {
      tr.innerHTML = newHtml;
    }
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
  if (personal && !personal.inTop) {
    // Add Separator
    const sep = document.createElement("tr");
    sep.className = "ranking-separator";
    sep.innerHTML = `<td colspan="3">...</td>`;
    newRowNodes.push(sep);

    let pRow = tbody.querySelector(`tr[data-uid='${personal.id || "personal_row"}']`);
    if (pRow) {
      if (pRow.classList.contains("exiting")) {
        pRow.classList.remove("exiting");
        pRow.style.transform = "";
      }
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

  // 5. FLIP: Invert (Synchronous) & Play (Async)
  // We MUST calculate new positions and apply transforms IMMEDIATELY after DOM change
  // to prevent a frame where rows jump to their new positions without offset.

  const validRows = newRowNodes.filter(
    (n) => n.nodeType === 1 && !n.classList.contains("ranking-separator"),
  );

  validRows.forEach((row) => {
    // If it's a separator, skip
    if (!row.dataset.uid) return;

    const uid = row.dataset.uid;

    // 1. New Position (Force Layout)
    const newRect = row.getBoundingClientRect();

    // 2. Old Position?
    if (oldPositions.has(uid)) {
      const oldTop = oldPositions.get(uid);
      const deltaY = oldTop - newRect.top;

      if (Math.abs(deltaY) > 0) {
        // INVERT (Immediately apply transform)
        row.style.transform = `translateY(${deltaY}px)`;
        row.style.transition = "none";

        // PLAY (Next Frame)
        requestAnimationFrame(() => {
          // Force reflow to ensure the 'none' transition is applied
          // void row.offsetHeight;
          // actually rAF is enough usually, but nested rAF is safer for some browsers
          requestAnimationFrame(() => {
            row.style.transform = ""; // Release to natural 0
            row.style.transition =
              "transform 0.6s cubic-bezier(0.2, 1, 0.3, 1)";
          });
        });
      }
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
  // Wait slightly longer than animation to be safe?
  // Or match the transition time.
  setTimeout(() => {
    validRows.forEach((r) => r.classList.remove("entering"));
  }, 600);
}

function generateTableHtml(data, user, t, scoreFormat, personal) {
  let html = `
    <table class="ranking-table">
      <thead>
        <tr>
          <th class="rank-col">#</th>
          <th class="user-col" data-i18n="ranking_col_user">${t.ranking_col_user || "Usuario"}</th>
          <th class="score-col" data-i18n="ranking_col_points">${t.ranking_col_points || "Puntos"}</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (data.length === 0) {
    html += `<tr><td colspan="3" class="empty-row" data-i18n="rank_empty">${t.rank_empty || "No hay datos todavía"}</td></tr>`;
  } else {
    data.forEach((entry, index) => {
      const isTop3 = index < 3;
      const isCurrentUser = user && entry.id === user.uid;
      const medal =
        index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";

      const rankData = getRankData(entry.totalRP || 0);
      const rankName = t[rankData.rank.nameKey] || rankData.rank.nameKey;
      const rankLevel = `${t.rank_level_prefix || "Nvl."} ${rankData.level}`;

      // ADD data-uid
      html += `
        <tr class="ranking-row ${isTop3 ? "top-player" : ""} ${isCurrentUser ? "current-user-row" : ""}" data-uid="${entry.id}">
          <td class="rank-col">${medal || index + 1}</td>
          <td class="user-col">
            <div class="user-info-group">
              <span class="username-text">${entry.username} ${isCurrentUser ? t.ranking_you || "(Tú)" : ""}</span>
              <span class="user-rank-subtext">${rankLevel} • ${rankName}</span>
            </div>
          </td>
          <td class="score-col">${scoreFormat.format(entry.score)}</td>
        </tr>
      `;
    });
  }

  if (personal && !personal.inTop) {
    const pRankData = getRankData(personal.totalRP || personal.score || 0); // fallback if personal doesn't have totalRP yet in this call
    const pRankName = t[pRankData.rank.nameKey] || pRankData.rank.nameKey;
    const pRankLevel = `${t.rank_level_prefix || "Nvl."} ${pRankData.level}`;

    html += `
      <tr class="ranking-separator">
        <td colspan="3">...</td>
      </tr>
      <tr class="ranking-row current-user-row personal-rank-row" data-uid="${(personal.id || personal.username) + "_p"}">
        <td class="rank-col">${personal.rank}</td>
        <td class="user-col">
          <div class="user-info-group">
            <span class="username-text">${personal.username} ${t.ranking_you || "(Tú)"}</span>
            <span class="user-rank-subtext">${pRankLevel} • ${pRankName}</span>
          </div>
        </td>
        <td class="score-col">${scoreFormat.format(personal.score)}</td>
      </tr>
    `;
  }

  html += `</tbody></table>`;
  return html;
}

export function clearRankingCache() {
  localStorage.removeItem(CACHE_KEY);
}
