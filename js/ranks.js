export const RANKS = [
  { id: 0, name: "Novato", minRP: 0, icon: "🌱" },
  { id: 1, name: "Principiante", minRP: 20, icon: "🥚" }, // ~2 días (2x10)
  { id: 2, name: "Aficionado", minRP: 70, icon: "🔨" }, // ~1 semana (7x10)
  { id: 3, name: "Estudiante", minRP: 180, icon: "📚" }, // ~2.5 semanas
  { id: 4, name: "Analista", minRP: 350, icon: "📈" }, // ~1.5 meses
  { id: 5, name: "Lógico", minRP: 600, icon: "🧩" }, // ~2 meses
  { id: 6, name: "Estratega", minRP: 900, icon: "♟️" }, // ~3 meses
  { id: 7, name: "Veterano", minRP: 1200, icon: "🎖️" }, // ~4 meses
  { id: 8, name: "Experto", minRP: 1500, icon: "🎓" }, // ~5 meses
  { id: 9, name: "Maestro", minRP: 1800, icon: "🥋" }, // ~6 meses
  { id: 10, name: "Sabio", minRP: 2100, icon: "🦉" }, // ~7 meses
  { id: 11, name: "Erudito", minRP: 2400, icon: "📜" },
  { id: 12, name: "Visionario", minRP: 2700, icon: "👁️" },
  { id: 13, name: "Iluminado", minRP: 3000, icon: "✨" },
  { id: 14, name: "Oráculo", minRP: 3300, icon: "🔮" },
  { id: 15, name: "Eterno", minRP: 3650, icon: "🌌" }, // ~1 año (365x10)
];

export const SCORING = {
  BASE_SCORE: 100000,
  ERROR_PENALTY: 300,
  TIME_PENALTY: 1, // per second
  RP_DIVISOR: 10000, // Factor 10k -> 0-10 Scale
  MISSED_DAY_RP: 3, // ~30% of a win (was 500/1600)
  PARTIAL_RP: {
    memory: 0.5,
    jigsaw: 0.5,
    sudoku: 1,
    peaks: 1,
  },
};

/**
 * Calculates the Daily Score (0 - 100,000)
 * This is the RAW score.
 */
export function calculateDailyScore(totalSeconds, errors = 0) {
  let score = SCORING.BASE_SCORE;
  score -= totalSeconds * SCORING.TIME_PENALTY;
  score -= errors * SCORING.ERROR_PENALTY;
  return Math.max(0, score); // Floor at 0
}

/**
 * Converts Daily Score to Unified Points (0-10 Scale)
 * @param {number} score
 * @returns {number} Points earned (2 decimals)
 */
export function calculateRP(score) {
  const points = score / SCORING.RP_DIVISOR;
  return Number(points.toFixed(2)); // Return float for precision (e.g. 9.85)
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

  // 3. "Level" (Vanity Metric: Total RP / 1000 or just raw wins?)
  // Let's use RP / 1000 as "Level" for cleaner display
  // "Level 42" means 42,000 RP
  const level = Math.floor(currentRP / 1000);

  return {
    rank: current,
    nextRank: next,
    progress: progress,
    level: level,
  };
}
