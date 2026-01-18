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

  // Settings Dropdown Logic
  const btnSettings = document.getElementById("btn-settings");
  const settingsDropdown = document.getElementById("settings-dropdown");

  if (btnSettings && settingsDropdown) {
    btnSettings.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent closing immediately
      settingsDropdown.classList.toggle("hidden");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (
        !settingsDropdown.classList.contains("hidden") &&
        !settingsDropdown.contains(e.target) &&
        e.target !== btnSettings
      ) {
        settingsDropdown.classList.add("hidden");
      }
    });

    // Prevent closing when clicking inside the dropdown
    settingsDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Theme Logic
  const themeToggle = document.getElementById("theme-toggle");
  const autoThemeToggle = document.getElementById("auto-theme-toggle");
  const manualOption = document.querySelector(".option-manual");
  const body = document.body;

  // Helper: Apply Theme
  function applyTheme(isDark) {
    if (isDark) {
      body.classList.add("dark-mode");
      if (themeToggle) themeToggle.checked = true;
    } else {
      body.classList.remove("dark-mode");
      if (themeToggle) themeToggle.checked = false;
    }
  }

  // Helper: Handle Auto State
  function handleAutoTheme(isAuto) {
    if (isAuto) {
      manualOption.classList.add("disabled");
      if (themeToggle) themeToggle.disabled = true;

      // Check System Preference
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      applyTheme(systemPrefersDark);
    } else {
      manualOption.classList.remove("disabled");
      if (themeToggle) themeToggle.disabled = false;

      // Revert to manual saved preference
      const manualTheme = localStorage.getItem("theme") || "light";
      applyTheme(manualTheme === "dark");
    }
  }

  // 1. Initialize
  const savedAuto = localStorage.getItem("autoTheme") === "true";
  if (autoThemeToggle) autoThemeToggle.checked = savedAuto;

  if (savedAuto) {
    handleAutoTheme(true);
  } else {
    const savedTheme = localStorage.getItem("theme");
    applyTheme(savedTheme === "dark");
    handleAutoTheme(false);
  }

  // 2. Auto Toggle Listener
  if (autoThemeToggle) {
    autoThemeToggle.addEventListener("change", () => {
      const isAuto = autoThemeToggle.checked;
      localStorage.setItem("autoTheme", isAuto);
      handleAutoTheme(isAuto);
    });
  }

  // 3. Manual Toggle Listener
  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      if (!autoThemeToggle.checked) {
        const isDark = themeToggle.checked;
        applyTheme(isDark);
        localStorage.setItem("theme", isDark ? "dark" : "light");
      }
    });
  }

  // 4. System Preference Listener
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (autoThemeToggle.checked) {
        applyTheme(e.matches);
      }
    });

  // Placeholders for other buttons
  document.getElementById("btn-stats")?.addEventListener("click", () => {
    alert("Estadísticas: Próximamente");
  });

  document.getElementById("btn-profile")?.addEventListener("click", () => {
    alert("Perfil: Próximamente");
  });
});
