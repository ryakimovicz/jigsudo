/**
 * Centralized Router Module
 * Handles specific views based on URL Hash.
 * Replaces scattered `hashchange` listeners in home.js, guide.js, etc.
 */
export const router = {
  // Map Hash -> Section ID
  routes: {
    // Empty/Root defaults to home (menu-content)
    "": "menu-content",
    "#": "menu-content",
    "#home": "menu-content",

    // Main Sections
    "#guide": "guide-section",
    "#info": "info-section",
    "#history": "history-section",
    "#profile": "profile-section",

    // Game is special. It usually has no hash or a specific hash if we want deep linking.
    // For now, let's map #game to game-section to allow explicit navigation.
    "#game": "game-section",
    "#privacy": "privacy-section",

    // Future Routes
    "#terms": "terms-section",
  },

  // Map Section ID -> Body Class
  routeClasses: {
    "menu-content": "home-active",
    "guide-section": "guide-active",
    "info-section": "info-active",
    "history-section": "history-active",
    "profile-section": "profile-active",
    "game-section": "game-active",
    "privacy-section": "privacy-active",
  },

  init() {
    window.addEventListener("hashchange", () => this.handleRoute());
    // We call handleRoute immediately to ensure the initial view is correct
    this.handleRoute();
    console.log("[Router] Initialized and Route Handled");
  },

  handleRoute() {
    let hash = window.location.hash || "";
    // Normalize
    if (hash === "#") hash = "";

    // Default to empty string key if hash is empty
    let sectionId = this.routes[hash];

    if (!sectionId) {
      console.warn(`[Router] Unknown route: ${hash}. Defaulting to Home.`);
      // If unknown, clear hash and show home?
      // Or just show home without clearing?
      // Let's go safe: Show Home.
      sectionId = "menu-content";
    }

    console.log(`[Router] Routing to: ${hash || "Home"} -> ${sectionId}`);
    this.updateView(sectionId);
  },

  updateView(activeId) {
    // 1. Hide ALL registered sections
    const allSectionIds = Object.values(this.routes);
    const uniqueIds = [...new Set(allSectionIds)]; // dedup

    uniqueIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el && id !== activeId) {
        el.classList.add("hidden");
        // console.log(`[Router] Hiding ${id}`); // Debug
      } else if (!el) {
        console.warn(`[Router] Element not found: ${id}`);
      }
    });

    // Explicitly hide menu-content if not active (Safety check)
    if (activeId !== "menu-content") {
      const menu = document.getElementById("menu-content");
      if (menu) menu.classList.add("hidden");
    }

    // 2. Show the Target Section
    const targetEl = document.getElementById(activeId);
    if (targetEl) {
      targetEl.classList.remove("hidden");

      // Footer Handling
      const footer = document.querySelector(".main-footer");
      if (footer) {
        // Rule: Hide footer ONLY on Game Section. Show on everything else.
        if (activeId === "game-section") {
          footer.classList.add("hidden");
        } else {
          footer.classList.remove("hidden");
        }
      }

      // Specific Section Logic (Restoring sub-elements if needed)
      if (activeId === "menu-content") {
        // Ensure sidebar state
        // home.js updates sidebar? Router shouldn't know about sidebar internals ideally.
        // But home.js listens to "home-active" class? No.
        // Let's leave sidebar logic to specific modules listening to class changes or observing visibility?
        // better: simple dispatch event?
        // For now, just ensuring visibility is enough.
        document
          .getElementById("ranking-container")
          ?.classList.remove("hidden");
      }
    }

    // 3. Update Body Classes
    const allBodyClasses = Object.values(this.routeClasses);
    document.body.classList.remove(...allBodyClasses);

    const activeClass = this.routeClasses[activeId];
    if (activeClass) {
      document.body.classList.add(activeClass);
    }

    // 4. Update Sidebar
    // ... (sidebar logic matches existing) ...

    // Dispatch Event for modules to update content
    const event = new CustomEvent("routeChanged", {
      detail: { route: activeId, hash: window.location.hash },
    });
    window.dispatchEvent(event);

    // 4. Update Sidebar
    // Map section IDs to sidebar item IDs
    const sidebarMap = {
      "menu-content": "nav-home",
      "guide-section": "nav-how-to",
      "info-section": "nav-info",
      "history-section": "nav-history",
      "profile-section": "btn-auth", // Map profile to auth button
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
    return hash && hash !== "#";
  },
};
