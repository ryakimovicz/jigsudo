/**
 * Route Utilities
 * Helpers for consistent URL hash parsing across modules.
 */

/**
 * Checks if the current URL hash corresponds to an active game session.
 * Detects both the canonical Daily puzzle (#game) and History replays (#history/YYYY/MM/DD).
 * @returns {boolean}
 */
export function isAtGameRoute() {
  const hash = window.location.hash;
  if (!hash) return false;

  // 1. Check Canonical Daily Game
  if (hash.startsWith("#game")) return true;

  // 2. Check History Replay
  // Format: #history/YYYY/MM/DD (4 parts total when split by '/')
  if (hash.startsWith("#history/")) {
    const parts = hash.split("/");
    return parts.length === 4;
  }

  return false;
}
