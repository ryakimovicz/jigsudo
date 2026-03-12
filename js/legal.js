import { initLanguage } from "./i18n.js";
import { closeSidebar } from "./sidebar.js";

/**
 * Lightweight script for static legal pages (/about, /contact, etc.)
 * Handles sidebar navigation back to the SPA and basic UI interactions.
 */
document.addEventListener("DOMContentLoaded", () => {
  // Initialize language support
  initLanguage();

  const sidebar = document.getElementById("side-sidebar");
  if (!sidebar) return;

  // Handle sidebar navigation - since we are in a subdirectory (/about/), 
  // we need to go up one level to reach the SPA hashes.
  const navHome = document.getElementById("nav-home");
  const navHistory = document.getElementById("nav-history");
  const navHowTo = document.getElementById("nav-how-to");

  if (navHome) {
    navHome.addEventListener("click", () => {
      window.location.href = "../#home";
    });
  }

  if (navHistory) {
    navHistory.addEventListener("click", () => {
      window.location.href = "../#history";
    });
  }

  if (navHowTo) {
    navHowTo.addEventListener("click", () => {
      window.location.href = "../#guide";
    });
  }

  // Handle Account and Settings dropdowns (UI only)
  const btnAuth = document.getElementById("btn-auth");
  const authDropdown = document.getElementById("auth-dropdown");
  const btnProfile = document.getElementById("btn-profile");
  const profileDropdown = document.getElementById("profile-dropdown");

  if (btnAuth && authDropdown) {
    btnAuth.addEventListener("click", (e) => {
      e.stopPropagation();
      authDropdown.classList.toggle("hidden");
      if (profileDropdown) profileDropdown.classList.add("hidden");
    });
  }

  if (btnProfile && profileDropdown) {
    btnProfile.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("hidden");
      if (authDropdown) authDropdown.classList.add("hidden");
    });
  }

  // Close dropdowns on click outside
  document.addEventListener("click", (e) => {
    if (authDropdown && !authDropdown.contains(e.target) && e.target !== btnAuth) {
      authDropdown.classList.add("hidden");
    }
    if (profileDropdown && !profileDropdown.contains(e.target) && e.target !== btnProfile) {
      profileDropdown.classList.add("hidden");
    }
  });

  // Re-enable sidebar toggle logic (it's in sidebar.js which is imported in legal.js if we decide to bundle or just run side-effects)
  // Actually, sidebar.js exports functions and has its own DOMContentLoaded listener.
  // We just need to make sure sidebar.js is loaded.
});
