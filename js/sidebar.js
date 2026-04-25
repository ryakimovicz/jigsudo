export function updateSidebarActiveState(activeId) {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => {
    if (item.id === activeId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

const lockBodyScroll = () => {
  if (window.innerWidth <= 768) {
    document.documentElement.classList.add("no-scroll");
    document.body.classList.add("no-scroll");
  }
};

const unlockBodyScroll = () => {
  document.documentElement.classList.remove("no-scroll");
  document.body.classList.remove("no-scroll");
};

export const closeSidebar = (shouldGoBack = true) => {
  const sidebar = document.getElementById("side-sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  
  // Only proceed if it was actually expanded
  if (!sidebar || !sidebar.classList.contains("expanded")) return;
  
  sidebar.classList.remove("expanded");
  document.body.classList.remove("sidebar-expanded");
  if (overlay) overlay.classList.add("hidden");
  unlockBodyScroll();

  // If we closed via UI (click overlay, link, etc.), 
  // and there is a sidebar state in history, we "consume" it by going back.
  if (shouldGoBack && window.history.state?.sidebarOpen) {
    window.history.back();
  }
};

export function initSidebar() {
  const sidebar = document.getElementById("side-sidebar");
  const toggleBtns = document.querySelectorAll(".sidebar-toggle");
  const overlay = document.getElementById("sidebar-overlay");

  if (toggleBtns.length > 0 && sidebar) {
    function applySidebarUI(isExpanded) {
      sidebar.classList.toggle("expanded", isExpanded);
      document.body.classList.toggle("sidebar-expanded", isExpanded);

      if (isExpanded) {
        lockBodyScroll();
      } else {
        unlockBodyScroll();
      }

      // manage tooltips
      const navItems = sidebar.querySelectorAll(".nav-item");
      if (isExpanded) {
        // Hide tooltips (remove title attribute)
        navItems.forEach((item) => {
          if (item.hasAttribute("title")) {
            item.setAttribute("data-temp-title", item.getAttribute("title"));
            item.removeAttribute("title");
          }
        });
      } else {
        // Restore tooltips
        navItems.forEach((item) => {
          if (item.hasAttribute("data-temp-title")) {
            item.setAttribute("title", item.getAttribute("data-temp-title"));
            item.removeAttribute("data-temp-title");
          }
        });
      }

      if (overlay) {
        overlay.classList.toggle("hidden", !isExpanded);
      }
    }

    function toggleSidebar() {
      const isExpanded = !sidebar.classList.contains("expanded");
      applySidebarUI(isExpanded);

      if (isExpanded) {
        // Add a virtual state for the back button to close
        window.history.pushState({ sidebarOpen: true }, "");
      } else {
        // If we toggled OFF manually, and state exists, pop it
        if (window.history.state?.sidebarOpen) {
          window.history.back();
        }
      }
    }

    toggleBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSidebar();
      });
    });

    // Close when clicking overlay or outside
    if (overlay) {
      overlay.addEventListener("click", closeSidebar);
    }

    document.addEventListener("click", (e) => {
      // Only close on click-outside if we are on mobile (collapsed overlay state)
      if (window.innerWidth > 768) return;

      const clickedOnToggle = Array.from(toggleBtns).some((btn) =>
        btn.contains(e.target),
      );

      if (
        sidebar.classList.contains("expanded") &&
        !sidebar.contains(e.target) &&
        !clickedOnToggle
      ) {
        closeSidebar();
      }
    });

    // Auto-close on global route change (for footer links, etc.)
    window.addEventListener("routeChanged", () => {
      if (window.innerWidth <= 768) {
        // Important: Use false to avoid double-back if the route change already added an entry
        closeSidebar(false);
      }
    });

    // Handle Back Button navigation to close/open sidebar
    window.addEventListener("popstate", (e) => {
      if (window.innerWidth <= 768) {
        const shouldBeExpanded = !!(e.state && e.state.sidebarOpen);
        const isCurrentlyExpanded = sidebar.classList.contains("expanded");

        if (shouldBeExpanded !== isCurrentlyExpanded) {
          // Sync UI without pushing/popping history
          applySidebarUI(shouldBeExpanded);
        }
      }
    });
  }

  // v1.6.0: Reactive Admin Access
  window.addEventListener("authReady", async ({ detail }) => {
    const { isAdmin } = await import("./auth.js?v=1.4.7");
    const adminNavItem = document.getElementById("nav-admin");
    if (adminNavItem) {
      const show = isAdmin(detail.user);
      adminNavItem.classList.toggle("hidden", !show);
      
      if (show && !adminNavItem.dataset.listenerAttached) {
        adminNavItem.addEventListener("click", () => {
          window.location.hash = "admin";
        });
        adminNavItem.dataset.listenerAttached = "true";
      }
    }
  });
}
