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

document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("side-sidebar");
  const toggleBtns = document.querySelectorAll(".sidebar-toggle");
  const overlay = document.getElementById("sidebar-overlay");

  if (toggleBtns.length > 0 && sidebar) {
    function toggleSidebar() {
      const isExpanded = sidebar.classList.toggle("expanded");
      document.body.classList.toggle("sidebar-expanded", isExpanded);

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

    toggleBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleSidebar();
      });
    });

    // Close when clicking overlay or outside
    const closeSidebar = () => {
      sidebar.classList.remove("expanded");
      document.body.classList.remove("sidebar-expanded");
      if (overlay) overlay.classList.add("hidden");
    };

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
  }
});
