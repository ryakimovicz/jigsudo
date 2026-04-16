import { CONFIG } from "../config.js?v=1.3.1";

/**
 * Jigsudo Global Time Utility
 * Centralizes date/time calculations so the entire game operates on the same "Jigsudo Day".
 * A Jigsudo Day resets at 06:00 UTC (03:00 AM Argentina).
 */

export const JIGSUDO_OFFSET_HOURS = 6;

/**
 * Returns a Date object shifted back by the offset so that calling getUTCDate()
 * returns the "Jigsudo Date".
 * Meaning, if it's 05:00 UTC (still yesterday for Jigsudo), this will return a date
 * from the previous calendar day in UTC.
 * @returns {Date} Shifted Jigsudo Date object
 */
export function getJigsudoDate() {
  if (CONFIG.isBasicEdition) {
    // Return April 15, 2026 at a neutral time (e.g. 12:00 UTC)
    return new Date("2026-04-15T12:00:00Z");
  }
  return new Date(Date.now() - JIGSUDO_OFFSET_HOURS * 3600 * 1000);
}

/**
 * Generates the daily seed based on the Global Jigsudo Date.
 * @returns {number} Integer representing YYYYMMDD (e.g., 20260305)
 */
export function getJigsudoSeedInt() {
  // v1.3.2: Fixed seed for Basic Edition (itch.io)
  if (CONFIG.isBasicEdition) return 20260415;

  const d = getJigsudoDate();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return parseInt(`${yyyy}${mm}${dd}`, 10);
}

/**
 * Formats the Jigsudo Date for UI display (e.g., Header, Social Card).
 * @param {string} locale e.g., 'es-ES'
 * @param {object} options Intl.DateTimeFormat options
 * @returns {string} Localized string based solely on the Jigsudo UTC Day.
 */
export function formatJigsudoDate(locale = "es-ES", options = {}) {
  const d = getJigsudoDate();
  const defaultOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC", // Crucial: evaluate the shifted date as UTC
  };
  return d.toLocaleDateString(locale, { ...defaultOptions, ...options });
}

/**
 * Helper to get YYYY-MM formatting for database/history logic based on the Jigsudo Date.
 * @returns {string} YYYY-MM
 */
export function getJigsudoYearMonth() {
  if (CONFIG.isBasicEdition) return "2026-04";
  const d = getJigsudoDate();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/**
 * Helper to get YYYY-MM-DD formatting for database/history logic based on the Jigsudo Date.
 * @returns {string} YYYY-MM-DD
 */
export function getJigsudoDateString() {
  if (CONFIG.isBasicEdition) return "2026-04-15";
  const d = getJigsudoDate();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
/**
 * Converts a numeric Jigsudo Seed (YYYYMMDD) into a canonical date string (YYYY-MM-DD).
 * @param {number|string} seed 
 * @returns {string} YYYY-MM-DD
 */
export function getDateStringFromSeed(seed) {
  if (!seed) return getJigsudoDateString();
  const s = String(seed);
  if (s.length !== 8) return getJigsudoDateString();
  return `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}`;
}
