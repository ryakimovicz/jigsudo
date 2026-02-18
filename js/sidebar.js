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
  const toggleBtn = document.getElementById("sidebar-toggle");
  const overlay = document.getElementById("sidebar-overlay");

  if (toggleBtn && sidebar) {
    function toggleSidebar() {
      const isExpanded = sidebar.classList.toggle("expanded");
      document.body.classList.toggle("sidebar-expanded", isExpanded);

      if (overlay) {
        overlay.classList.toggle("hidden", !isExpanded);
      }
    }

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSidebar();
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

      if (
        sidebar.classList.contains("expanded") &&
        !sidebar.contains(e.target) &&
        !toggleBtn.contains(e.target)
      ) {
        closeSidebar();
      }
    });
  }
});
