import { searchPublicUsers, toggleFavorite } from "./db.js?v=1.4.23";
import { getI18n } from "./i18n.js?v=1.4.23";
import { router } from "./router.js?v=1.4.23";
import { getCurrentUser } from "./auth.js?v=1.4.23";
import { gameManager } from "./game-manager.js?v=1.4.23";

let searchTimeout = null;

/**
 * Initializes the Search Users page logic.
 * Called by the router when navigating to #search-users.
 */
export function initSearchUsers() {
    const input = document.getElementById("user-search-input");
    const resultsContainer = document.getElementById("search-results-container");
    const emptyState = document.getElementById("search-empty-state");
    const loader = document.getElementById("search-loader");
    const message = document.getElementById("search-message");
    
    // v1.7.9: Reset any stuck loading buttons from previous navigation
    document.querySelectorAll(".btn-loading").forEach(btn => btn.classList.remove("btn-loading"));

    // Sidebar link listener (More robust attachment)
    const navSearch = document.getElementById("nav-search-users");
    if (navSearch && !navSearch.dataset.listenerAttached) {
        navSearch.style.cursor = "pointer";
        navSearch.addEventListener("click", (e) => {
            e.preventDefault();
            console.log("[Search] Navigating to search...");
            window.location.hash = "#search-users";
        });
        navSearch.dataset.listenerAttached = "true";
    }

    if (!input) return;

    // v1.4.14: Render favorites ALWAYS on entry, even if already initialized
    renderFavorites();

    if (input.dataset.initialized) return;

    input.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        
        // v1.4.14: Contract favorites when searching (after 2 chars)
        const favContainer = document.getElementById("favorites-container");
        const toggleBtn = document.getElementById("btn-favorites-toggle");
        const favGrid = document.getElementById("favorites-grid");
        
        if (favContainer && favGrid) {
            if (query.length >= 2) {
                favContainer.classList.add("contracted");
                
                // v1.4.14: Responsive check: does the grid wrap into multiple lines?
                const items = favGrid.querySelectorAll(".favorite-pill");
                if (items.length > 1 && toggleBtn) {
                    const firstTop = items[0].offsetTop;
                    const lastTop = items[items.length - 1].offsetTop;
                    // If the last item is on a different vertical level than the first, it has wrapped
                    toggleBtn.style.display = (lastTop > firstTop) ? "flex" : "none";
                } else if (toggleBtn) {
                    toggleBtn.style.display = "none";
                }
            } else {
                favContainer.classList.remove("contracted");
                favContainer.classList.remove("expanded"); // Also reset manual expansion
                if (toggleBtn) toggleBtn.style.display = "none";
            }
        }

        clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            resultsContainer.innerHTML = "";
            emptyState.classList.remove("hidden");
            message.setAttribute("data-i18n", "search_users_min_chars");
            message.textContent = getI18n("search_users_min_chars");
            return;
        }

        searchTimeout = setTimeout(async () => {
            loader.classList.remove("hidden");
            emptyState.classList.add("hidden");
            
            console.log(`[Search] Querying Firestore for: "${query}"`);
            const results = await searchPublicUsers(query);
            
            // v1.7.2: Verify if the query is still valid before rendering to prevent stale results
            const currentQuery = input.value.trim();
            if (currentQuery !== query) {
                console.log(`[Search] Stale results for "${query}" ignored (Current: "${currentQuery}")`);
                return;
            }

            loader.classList.add("hidden");
            renderResults(results);
        }, 400); 
    });

    input.dataset.initialized = "true";
    console.log("[Search] Page Logic Initialized");

    // v1.4.14: Refresh favorites when stats update globally
    window.addEventListener("userStatsUpdated", () => {
        if (window.location.hash.startsWith("#search-users")) {
            renderFavorites();
        }
    });

    // v1.4.14: Update titles when language changes
    window.addEventListener("languageChanged", () => {
        if (window.location.hash.startsWith("#search-users")) {
            const starBtns = document.querySelectorAll(".btn-star");
            starBtns.forEach(btn => {
                const isFav = btn.classList.contains("active");
                btn.title = isFav ? getI18n('fav_remove') : getI18n('fav_add');
            });
        }
    });

    // v1.4.14: Toggle favorites expansion manually
    const toggleBtn = document.getElementById("btn-favorites-toggle");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const container = document.getElementById("favorites-container");
            if (container) {
                container.classList.toggle("expanded");
            }
        });
    }
}

/**
 * v1.4.14: Renders the favorites quick-access list.
 */
function renderFavorites() {
    const container = document.getElementById("favorites-container");
    const grid = document.getElementById("favorites-grid");
    if (!container || !grid) return;

    const favs = gameManager.stats?.favorites || {};
    const uids = Object.keys(favs);

    if (uids.length === 0) {
        container.classList.add("hidden");
        return;
    }

    container.classList.remove("hidden");
    grid.innerHTML = "";

    uids.forEach(uid => {
        const username = favs[uid];
        const item = document.createElement("div");
        item.className = "favorite-pill animate-fade-in";
        item.innerHTML = `
            <span class="fav-avatar">${username.charAt(0).toUpperCase()}</span>
            <span class="fav-name">${username}</span>
        `;
        item.onclick = () => {
            window.location.hash = `profile/${encodeURIComponent(username.toLowerCase())}`;
        };
        grid.appendChild(item);
    });

    // v1.4.14: Re-evaluate toggle button visibility
    const input = document.getElementById("user-search-input");
    const toggleBtn = document.getElementById("btn-favorites-toggle");
    if (input && toggleBtn) {
        const query = input.value.trim();
        if (query.length >= 2) {
            const items = grid.querySelectorAll(".favorite-pill");
            if (items.length > 1) {
                const firstTop = items[0].offsetTop;
                const lastTop = items[items.length - 1].offsetTop;
                toggleBtn.style.display = (lastTop > firstTop) ? "flex" : "none";
            } else {
                toggleBtn.style.display = "none";
            }
        } else {
            toggleBtn.style.display = "none";
        }
    }
}

function renderResults(users) {
    const resultsContainer = document.getElementById("search-results-container");
    const emptyState = document.getElementById("search-empty-state");
    const message = document.getElementById("search-message");

    resultsContainer.innerHTML = "";

    // v1.7.1: Filter out the current user from results
    const currentUser = getCurrentUser();
    const currentName = currentUser ? currentUser.displayName : null;
    
    const filteredUsers = users.filter(user => {
        if (!currentName) return true;
        return user.username !== currentName;
    });

    if (filteredUsers.length === 0) {
        if (users.length > 0) {
            // If we had users but they were all the current user
            message.setAttribute("data-i18n", "search_users_empty");
            message.textContent = getI18n("search_users_empty");
        } else {
            emptyState.classList.remove("hidden");
            message.setAttribute("data-i18n", "search_users_empty");
            message.textContent = getI18n("search_users_empty");
        }
        emptyState.classList.remove("hidden");
        return;
    }

    filteredUsers.forEach(user => {
        const card = document.createElement("div");
        card.className = "user-search-card glass-panel animate-fade-in";
        
        // Calculate Level/Rank display (Simple estimation if needed, or just show RP)
        const rp = user.totalRP || 0;
        const isFav = gameManager.stats?.favorites && gameManager.stats.favorites[user.uid];
        
        card.innerHTML = `
            <div class="user-card-header">
                <div class="user-avatar-placeholder user-avatar">${user.username.charAt(0).toUpperCase()}</div>
                <div class="user-id-info">
                    <strong class="user-name">${user.username}</strong>
                    ${user.isVerified ? '<span class="verified-badge" title="Verificado">✅</span>' : ''}
                </div>
                <button class="btn-star ${isFav ? 'active' : ''}" title="${isFav ? getI18n('fav_remove') : getI18n('fav_add')}" data-uid="${user.uid}" data-username="${user.username}">
                    <span class="star-icon">⭐</span>
                </button>
            </div>
            <div class="user-card-stats">
                <div class="stat-item">
                    <span class="stat-val">${rp.toFixed(2)}</span>
                    <span class="stat-lbl">Total RP</span>
                </div>
                <div class="stat-item">
                    <span class="stat-val">${user.stats.wins || 0}</span>
                    <span class="stat-lbl">${getI18n('sidebar_history')}</span>
                </div>
            </div>
            <button class="btn-view-profile-search btn-secondary" data-username="${user.username}">
                <span>👤</span> ${getI18n('header_profile_label')}
            </button>
        `;

        card.querySelector(".btn-star").addEventListener("click", async (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const uid = btn.dataset.uid;
            const username = btn.dataset.username;
            
            btn.classList.add("btn-loading-star");
            const result = await toggleFavorite(uid, username);
            btn.classList.remove("btn-loading-star");
            
            if (result.success) {
                btn.classList.toggle("active", !result.isRemoved);
                // v1.4.14: Local state is already updated via handleCloudSync usually,
                // but for immediate feedback we can refresh the list
                renderFavorites();
            }
        });

        card.querySelector(".btn-view-profile-search").addEventListener("click", (e) => {
            const btn = e.currentTarget;
            btn.classList.add("btn-loading");
            window.location.hash = `profile/${encodeURIComponent(user.username.toLowerCase())}`;
        });

        resultsContainer.appendChild(card);
    });
}

// Global Listener for Route Change (Integrated with router.js dispatch)
window.addEventListener("routeChanged", (e) => {
    if (e.detail.route === "search-users-section") {
        initSearchUsers();
    }
});
