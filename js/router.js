import { CONFIG } from "./config.js";
/**
 * Centralized Router Module
 * Handles specific views based on URL Hash.
 * Replaces scattered `hashchange` listeners in home.js, guide.js, etc.
 */
export const router = {
  // Map Base Hash -> Section ID
  routes: {
    "#home": "menu-content",
    "#guide": "guide-section",
    "#history": "history-section",
    "#profile": "profile-section",
    "#game": "game-section",
    "#changelog": "changelog-section",
    "#admin": "admin-section",
    "#about": "about-section",
    "#privacy": "privacy-section",
    "#terms": "terms-section",
    "#support": "support-section",
    "#search-users": "search-users-section",
  },

  // Map Section ID -> Body Class
  routeClasses: {
    "menu-content": "home-active",
    "history-section": "history-active",
    "guide-section": "guide-active",
    "profile-section": "profile-active",
    "changelog-section": "changelog-active",
    "admin-section": "admin-active",
    "about-section": "about-active",
    "privacy-section": "privacy-active",
    "terms-section": "terms-active",
    "support-section": "support-active",
    "search-users-section": "search-users-active",
  },

  init() {
    window.addEventListener("hashchange", () => this.handleRoute());
    // v1.6.0: Refresh admin UI when auth completes
    window.addEventListener("authReady", () => {
      if (window.location.hash === "#admin") this.handleRoute();
    });
    // We call handleRoute immediately to ensure the initial view is correct
    this.handleRoute();
    console.log("[Router] Initialized and Route Handled");
  },

  async handleRoute() {
    let hash = window.location.hash || "";

    // Normalize empty or root to canonical #home
    if (hash === "" || hash === "#") {
      history.replaceState(null, null, "#home");
      hash = "#home";
    }

    // Always normalize base hash to lowercase for consistency
    if (hash.toLowerCase() !== hash) {
      const parts = hash.split("/");
      parts[0] = parts[0].toLowerCase();
      const normalizedHash = parts.join("/");
      history.replaceState(null, null, normalizedHash);
      hash = normalizedHash;
    }

    // Parse base route and parameters
    const parts = hash.split("/");
    const baseRoute = parts[0];
    const params = parts.slice(1);

    // v1.6.0: ADMIN PROTECTION
    if (baseRoute === "#admin") {
      const { isAdmin } = await import("./auth.js");
      if (!isAdmin()) {
        console.warn("[Router] Unprivileged access to #admin. Redirecting...");
        history.replaceState(null, null, "#home");
        this.handleRoute();
        return;
      }
    }

    // v1.9.9d: DEMO MODE PROTECTION
    if (CONFIG.isDemo) {
      const restrictedRoutes = ["#search-users", "#changelog", "#profile"];
      if (restrictedRoutes.includes(baseRoute)) {
        console.warn(`[Router] Access to ${baseRoute} is blocked in Demo Mode. Redirecting...`);
        history.replaceState(null, null, "#home");
        this.handleRoute();
        return;
      }
    }

    // Canonicalize Profile URLs to Lowercase
    if (baseRoute.toLowerCase() === "#profile" && params.length > 0) {
      const lowerParams = params.map((p) =>
        decodeURIComponent(p).toLowerCase(),
      );
      const canonicalHash = `${baseRoute}/${lowerParams.join("/")}`;
      if (hash !== canonicalHash) {
        history.replaceState(null, null, canonicalHash);
        hash = canonicalHash;
      }
    }

    let sectionId = this.routes[baseRoute];

    // Special Case: History Deep Links for Replay (/#history/YYYY/MM/DD)
    if (baseRoute === "#history" && params.length === 3) {
      sectionId = "game-section";
    }

    if (!sectionId) {
      console.warn(`[Router] Unknown route: ${baseRoute}. Defaulting to Home.`);
      history.replaceState(null, null, "#home");
      sectionId = "menu-content";
    }

    console.log(
      `[Router] Routing tracking: ${hash} -> Base: ${baseRoute}, Params: [${params.join(",")}] -> Section: ${sectionId}`,
    );
    this.updateView(sectionId, baseRoute, params);
  },

  async updateView(activeId, baseRoute, params) {
    console.log(`[Router] updateView -> Target: ${activeId}`);

    // 1. Hide ALL registered sections
    const allSectionIds = Object.values(this.routes);
    const uniqueIds = [...new Set(allSectionIds)]; // dedup

    uniqueIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        // v1.7.9: Support deferred navigation for Foreign Profiles
        // If we are going to a foreign profile, don't hide the previous section yet
        const isForeignProfile = baseRoute === "#profile" && params.length > 0;
        
        if (id !== activeId) {
          if (!isForeignProfile) {
            el.classList.add("hidden");
          }
          console.log(`[Router] Hiding ${id}. Classes: ${el.className}`);
        } else {
          // If deferred, don't show yet either, Profile module will handle it
          if (!isForeignProfile) {
            el.classList.remove("hidden");
          }
          console.log(`[Router] Showing ${id}. Classes: ${el.className}`);
        }
      } else if (id) {
        console.warn(`[Router] Section element not found: ${id}`);
      }
    });

    // Explicitly hide menu-content & game-section if not active (Safety check)
    if (activeId !== "menu-content") {
      const menu = document.getElementById("menu-content");
      if (menu) {
        menu.classList.add("hidden");
        console.log(
          `[Router] FORCE HIDING menu-content. Classes: ${menu.className}`,
        );
      }
    }
    if (activeId !== "game-section") {
      const game = document.getElementById("game-section");
      if (game) {
        game.classList.add("hidden");
        game.style.display = "none"; // Hard-enforce hidden state beyond CSS specificity
        console.log(
          `[Router] FORCE HIDING game-section. Classes: ${game.className}`,
        );
      }
    } else {
      const game = document.getElementById("game-section");
      if (game) {
        game.style.display = ""; // Restore to CSS default (flex)
      }
    }

    // 2. Footer & In-Game Body Class Handling
    const footer = document.querySelector(".main-footer");
    const isGame = this.isGameRoute();
    const isAdmin = activeId === "admin-section";
    const hideFooter = isGame || isAdmin;

    document.body.classList.toggle("in-game", isGame);
    document.documentElement.classList.toggle("in-game", isGame);

    if (footer) {
      if (hideFooter) {
        footer.classList.add("hidden");
        console.log("[Router] Footer hidden");
      } else {
        footer.classList.remove("hidden");
        console.log("[Router] Footer shown");

        // CLEANUP VICTORY UI ON NAVIGATION
        // If we are navigating AWAY from a game (or landed on a menu),
        // ensure any victory modal/animation is removed.
        const cleanup = async () => {
          const { cleanupVictoryUI } = await import("./ui.js");
          const { stopVictoryAnimations } = await import("./code.js");
          cleanupVictoryUI();
          stopVictoryAnimations();
        };
        cleanup();
      }
    }

    // 3. Update Body Classes
    const allBodyClasses = Object.values(this.routeClasses || {});
    document.body.classList.remove(...allBodyClasses);
    const activeClass = this.routeClasses[activeId];
    if (activeClass) {
      document.body.classList.add(activeClass);
    }

    // 4. Dispatch Event for modules to update content
    const event = new CustomEvent("routeChanged", {
      detail: {
        route: activeId,
        hash: window.location.hash,
        baseRoute,
        params,
      },
    });
    window.dispatchEvent(event);

    // v1.6.0: Admin Init
    if (activeId === "admin-section") {
      import("./admin.js").then((mod) => {
        mod.initAdmin();
        mod.showAdminPanel();
      });
    } else {
      import("./admin.js").then((mod) => mod.hideAdminPanel());
    }

    // 4. Update Sidebar
    // Map section IDs to sidebar item IDs
    const sidebarMap = {
      "menu-content": "nav-home",
      "guide-section": "nav-how-to",
      "history-section": "nav-history",
      "profile-section": "btn-auth", // Map profile to auth button
      "changelog-section": "nav-changelog",
      "search-users-section": "nav-search-users",
    };

    let sidebarId = sidebarMap[activeId];

    // v1.7.9: Sidebar Profile state should ONLY show active if it is OUR profile
    if (activeId === "profile-section" && baseRoute === "#profile" && params.length > 0) {
      try {
        const { getCurrentUser } = await import("./auth.js");
        const user = getCurrentUser();
        const ownName = (user && user.displayName) || "";
        const targetName = decodeURIComponent(params[0]).toLowerCase();

        if (ownName.toLowerCase() !== targetName) {
           sidebarId = null; // Foreign profile: do NOT mark "Account"
        }
      } catch (e) {
        console.warn("[Router] Sidebar check failed:", e);
      }
    }

    if (sidebarId) {
      const navItems = document.querySelectorAll(".nav-item");
      navItems.forEach((item) => {
        if (item.id === sidebarId) {
          item.classList.add("active");
        } else {
          item.classList.remove("active");
        }
      });
    } else {
      // Clear all if no match (e.g. Game)
      const navItems = document.querySelectorAll(".nav-item");
      navItems.forEach((item) => item.classList.remove("active"));
    }

    // 5. Scroll support
    window.scrollTo(0, 0);
  },

  navigateTo(hash) {
    if (window.location.hash === hash) {
      this.handleRoute(); // Force refresh
    } else {
      window.location.hash = hash;
    }
  },

  // Helper for Auth to know if it should redirect to Home or stay put
  isNavigating() {
    const hash = window.location.hash;
    return hash && hash !== "#" && hash !== "#home";
  },

  /**
   * Returns true if the current route corresponds to a game session
   * (either the main #game or a history replay).
   */
  isGameRoute() {
    const hash = window.location.hash;
    const parts = hash.split("/");
    const baseRoute = parts[0];
    const params = parts.slice(1);

    if (baseRoute === "#game") return true;
    if (baseRoute === "#history" && params.length === 3) return true;
    
    return false;
  },
};
