export const RANKS = [
  { id: 0, name: "Novato", minRP: 0, icon: "🌱" },
  { id: 1, name: "Principiante", minRP: 15000, icon: "🥚" },
  { id: 2, name: "Aficionado", minRP: 37500, icon: "🔨" },
  { id: 3, name: "Estudiante", minRP: 75000, icon: "📚" },
  { id: 4, name: "Analista", minRP: 120000, icon: "📈" },
  { id: 5, name: "Lógico", minRP: 180000, icon: "🧩" },
  { id: 6, name: "Estratega", minRP: 240000, icon: "♟️" },
  { id: 7, name: "Veterano", minRP: 300000, icon: "🎖️" },
  { id: 8, name: "Experto", minRP: 375000, icon: "🎓" },
  { id: 9, name: "Maestro", minRP: 450000, icon: "🥋" },
  { id: 10, name: "Sabio", minRP: 550000, icon: "🦉" },
  { id: 11, name: "Erudito", minRP: 675000, icon: "📜" },
  { id: 12, name: "Visionario", minRP: 825000, icon: "👁️" },
  { id: 13, name: "Iluminado", minRP: 1050000, icon: "✨" },
  { id: 14, name: "Oráculo", minRP: 1275000, icon: "🔮" },
  { id: 15, name: "Eterno", minRP: 1500000, icon: "🌌" },
];

export const SCORING = {
  BASE_SCORE: 100000,
  ERROR_PENALTY: 300,
  TIME_PENALTY: 1, // per second
  RP_DIVISOR: 60,
  MISSED_DAY_RP: 500,
  PARTIAL_RP: {
    memory: 100,
    jigsaw: 100,
    sudoku: 200,
    peaks: 200,
  },
};

/**
 * Calculates the Daily Score (0 - 100,000)
 * @param {number} totalSeconds - Total Play Time
 * @param {number} errors - Total Errors (Peaks mainly)
 * @returns {number} The calculated score
 */
export function calculateDailyScore(totalSeconds, errors = 0) {
  let score = SCORING.BASE_SCORE;
  score -= totalSeconds * SCORING.TIME_PENALTY;
  score -= errors * SCORING.ERROR_PENALTY;
  return Math.max(0, score); // Floor at 0
}

/**
 * Converts Daily Score to Rank Points
 * @param {number} score
 * @returns {number} RP earned
 */
export function calculateRP(score) {
  return Math.floor(score / SCORING.RP_DIVISOR);
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
