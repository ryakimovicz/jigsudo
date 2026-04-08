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
  },

  // Map Section ID -> Body Class
  routeClasses: {
    "menu-content": "home-active",
    "history-section": "history-active",
    "guide-section": "guide-active",
    "profile-section": "profile-active",
    "changelog-section": "changelog-active",
  },

  init() {
    window.addEventListener("hashchange", () => this.handleRoute());
    // We call handleRoute immediately to ensure the initial view is correct
    this.handleRoute();
    console.log("[Router] Initialized and Route Handled");
  },

  handleRoute() {
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

  updateView(activeId, baseRoute, params) {
    console.log(`[Router] updateView -> Target: ${activeId}`);

    // 1. Hide ALL registered sections
    const allSectionIds = Object.values(this.routes);
    const uniqueIds = [...new Set(allSectionIds)]; // dedup

    uniqueIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        if (id !== activeId) {
          el.classList.add("hidden");
          console.log(`[Router] Hiding ${id}. Classes: ${el.className}`);
        } else {
          el.classList.remove("hidden");
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
    const isGame = activeId === "game-section";

    document.body.classList.toggle("in-game", isGame);
    document.documentElement.classList.toggle("in-game", isGame);

    if (footer) {
      if (isGame) {
        footer.classList.add("hidden");
        console.log("[Router] Footer hidden");
      } else {
        footer.classList.remove("hidden");
        console.log("[Router] Footer shown");

        // CLEANUP VICTORY UI ON NAVIGATION
        // If we are navigating AWAY from a game (or landed on a menu),
        // ensure any victory modal/animation is removed.
        const cleanup = async () => {
          const { cleanupVictoryUI } = await import("./ui.js?v=1.1.11");
          const { stopVictoryAnimations } = await import("./code.js?v=1.1.11");
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

    // 4. Update Sidebar
    // Map section IDs to sidebar item IDs
    const sidebarMap = {
      "menu-content": "nav-home",
      "guide-section": "nav-how-to",
      "history-section": "nav-history",
      "profile-section": "btn-auth", // Map profile to auth button
      "changelog-section": "nav-changelog",
    };

    const sidebarId = sidebarMap[activeId];
    // We need to import updateSidebarActiveState or reimplement it?
    // Reimplementing is safer to avoid circular deps if sidebar imports router.
    // Sidebar.js is simple.
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
};
