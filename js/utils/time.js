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
  return new Date(Date.now() - JIGSUDO_OFFSET_HOURS * 3600 * 1000);
}

/**
 * Generates the daily seed based on the Global Jigsudo Date.
 * @returns {number} Integer representing YYYYMMDD (e.g., 20260305)
 */
export function getJigsudoSeedInt() {
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
/**
 * Calculates the integer difference in days between two Jigsudo Date strings (YYYY-MM-DD).
 * It uses a 12:00:00 UTC anchor to ensure that floating point drift or DST doesn't
 * affect the integer result.
 * @param {string} date1 YYYY-MM-DD
 * @param {string} date2 YYYY-MM-DD
 * @returns {number} Integer difference (date2 - date1)
 */
export function getJigsudoDayDiff(date1, date2) {
  if (!date1 || !date2) return 0;
  const d1 = new Date(date1 + "T12:00:00Z");
  const d2 = new Date(date2 + "T12:00:00Z");
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}
