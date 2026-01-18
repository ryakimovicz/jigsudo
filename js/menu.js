/* Main Menu Logic */

document.addEventListener("DOMContentLoaded", () => {
  console.log("Jigsudo Menu Module Loaded");

  const menuToggle = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("sidebar");
  const closeSidebar = document.getElementById("close-sidebar");
  const startBtn = document.getElementById("start-btn");

  // Sidebar Interactions
  if (menuToggle && sidebar && closeSidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.remove("hidden");
    });

    closeSidebar.addEventListener("click", () => {
      sidebar.classList.add("hidden");
    });

    // Close on backdrop click
    sidebar.addEventListener("click", (e) => {
      if (e.target === sidebar) {
        sidebar.classList.add("hidden");
      }
    });
  }

  // Start Game
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      console.log("Start Game Clicked!");
      // Future logic: Transition to Memory Game Stage
      alert("¡Empezando el juego! (Siguiente integración: Juego de Memoria)");
    });
  }

  // Placeholders for other buttons
  document.getElementById("btn-stats")?.addEventListener("click", () => {
    alert("Estadísticas: Próximamente");
  });

  document.getElementById("btn-settings")?.addEventListener("click", () => {
    alert("Ajustes: Próximamente");
  });

  document.getElementById("btn-profile")?.addEventListener("click", () => {
    alert("Perfil: Próximamente");
  });
});
