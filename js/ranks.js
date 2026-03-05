export const RANKS = [
  { id: 0, nameKey: "rank_0", minRP: 0, icon: "🌱" },
  { id: 1, nameKey: "rank_1", minRP: 15, icon: "🥚" }, // ~1 día perfecto
  { id: 2, nameKey: "rank_2", minRP: 45, icon: "🔨" }, // ~3 días
  { id: 3, nameKey: "rank_3", minRP: 100, icon: "📚" }, // ~1 semana
  { id: 4, nameKey: "rank_4", minRP: 160, icon: "📈" }, // ~11 días
  { id: 5, nameKey: "rank_5", minRP: 250, icon: "🧩" }, // ~16 días
  { id: 6, nameKey: "rank_6", minRP: 400, icon: "♟️" }, // ~1 mes
  { id: 7, nameKey: "rank_7", minRP: 650, icon: "🎖️" }, // ~1.5 meses
  { id: 8, nameKey: "rank_8", minRP: 1000, icon: "🎓" }, // ~2.2 meses
  { id: 9, nameKey: "rank_9", minRP: 1500, icon: "🥋" }, // ~3.3 meses
  { id: 10, nameKey: "rank_10", minRP: 2100, icon: "🦉" }, // ~4.6 meses
  { id: 11, nameKey: "rank_11", minRP: 2800, icon: "📜" }, // ~6 meses
  { id: 12, nameKey: "rank_12", minRP: 3700, icon: "👁️" }, // ~8 meses
  { id: 13, nameKey: "rank_13", minRP: 5000, icon: "✨" }, // ~11 meses
  { id: 14, nameKey: "rank_14", minRP: 6500, icon: "🔮" }, // ~1.4 años
  { id: 15, nameKey: "rank_15", minRP: 8000, icon: "🌌" }, // ~1.8 años
];

export const SCORING = {
  BONUS_DECAY_SECONDS: 3600, // 1 hour (60 * 60)
  MAX_BONUS: 10.0,
  ERROR_PENALTY_RP: 1.0,
  MISSED_DAY_RP: 10.0,

  PARTIAL_RP: {
    memory: 1.0,
    jigsaw: 1.0,
    sudoku: 1.0,
    peaks: 1.0,
    search: 1.0,
    code: 1.0,
  },
};

/**
 * Calculates Time Bonus: Linear decay from 6.0 to 0 over 6 hours.
 */
export function calculateTimeBonus(totalSeconds) {
  const decayPerSecond = SCORING.MAX_BONUS / SCORING.BONUS_DECAY_SECONDS;
  const penalty = totalSeconds * decayPerSecond;
  const bonus = SCORING.MAX_BONUS - penalty;
  // Return raw precision for Leaderboard sorting (e.g. 5.123414)
  return Math.max(0, Math.min(SCORING.MAX_BONUS, bonus));
}

/**
 * Helper to ensure float precision
 */
export function calculateRP(score) {
  return Number(score.toFixed(3));
}

/**
 * Get Rank Info based on Total RP
 * @param {number} currentRP
 * @returns {object} { rank, nextRank, progress, currentLevel }
 */
export function getRankData(currentRP) {
  // 1. Find Current Rank
  let rankIndex = RANKS.findIndex((r) => currentRP < r.minRP) - 1;
  // If undefined (too low? impossible with minRP 0) or max rank
  if (rankIndex < 0) rankIndex = RANKS.length - 1; // Highest rank if not found "below"

  // Correction: findIndex returns -1 if NO item matches (e.g. currentRP 9999999 > all minRPs)
  // Logic: "Find the first one I am NOT smaller than"? No.
  // "Find the last one where currentRP >= minRP"
  // Safer loop:
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (currentRP >= RANKS[i].minRP) {
      idx = i;
    } else {
      break;
    }
  }

  const current = RANKS[idx];
  const next = RANKS[idx + 1] || null;

  // 2. Progress Percentage
  let progress = 0;
  if (next) {
    const range = next.minRP - current.minRP;
    const gained = currentRP - current.minRP;
    progress = Math.min(100, Math.floor((gained / range) * 100));
  } else {
    progress = 100; // Max Rank
  }

  // 3. "Level" (Matches Rank ID for consistent progression)
  // "Level 1" means student is at "Principiante" rank, etc.
  const level = current.id;

  return {
    rank: current,
    nextRank: next,
    progress: progress,
    level: level,
  };
}
