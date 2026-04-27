import { searchPublicUsers } from "./db.js?v=1.4.10";
import { getI18n } from "./i18n.js?v=1.4.10";
import { router } from "./router.js?v=1.4.10";
import { getCurrentUser } from "./auth.js?v=1.4.10";

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

    if (!input || input.dataset.initialized) return;

    input.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        
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
        
        card.innerHTML = `
            <div class="user-card-header">
                <div class="user-avatar-placeholder user-avatar">${user.username.charAt(0).toUpperCase()}</div>
                <div class="user-id-info">
                    <strong class="user-name">${user.username}</strong>
                    ${user.isVerified ? '<span class="verified-badge" title="Verificado">✅</span>' : ''}
                </div>
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
