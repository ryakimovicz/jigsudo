import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Import Logic Modules
import { generateDailyGame } from "../js/sudoku-logic.js";
import { getAllTargets } from "../js/peaks-logic.js";

// Setup Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUZZLES_DIR = path.join(__dirname, "../public/puzzles");

if (!fs.existsSync(PUZZLES_DIR)) {
  fs.mkdirSync(PUZZLES_DIR, { recursive: true });
}

async function generateDailyPuzzle() {
  console.log(
    "🧩 Starting Daily Puzzle Generation (Strict Island Handling)...",
  );

  let seed = process.argv[2];
  let dateStr = "";
  let seedInt;

  // Fecha y Semilla
  if (!seed) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    dateStr = `${yyyy}-${mm}-${dd}`;
    seedInt = parseInt(`${yyyy}${mm}${dd}`, 10);
    seed = seedInt.toString();
  } else {
    if (/^\d{8}$/.test(seed)) {
      const y = seed.substring(0, 4);
      const m = seed.substring(4, 6);
      const d = seed.substring(6, 8);
      dateStr = `${y}-${m}-${d}`;
    } else {
      dateStr = "custom-" + seed;
    }
    seedInt = parseInt(seed, 10) || 12345;
  }
  console.log(`🔧 Target Date: ${dateStr}, Seed: ${seed}`);

  try {
    const baseSeed = seedInt;
    let attemptsGlobal = 0;
    let success = false;

    let finalGameData = null;
    let finalSearchTargets = {};
    let finalSimonValues = [];

    // --- BUCLE PRINCIPAL ---
    while (!success && attemptsGlobal < 200) {
      attemptsGlobal++;
      const currentSeed = baseSeed * 1000 + attemptsGlobal;

      // 1. Generar Sudoku
      let gameData = generateDailyGame(currentSeed);

      process.stdout.write(`   > Attempt ${attemptsGlobal}: `);

      // 2. Definir Variantes
      let variations = {
        0: { board: JSON.parse(JSON.stringify(gameData.solution)) },
        LR: { board: swapStacks(gameData.solution) },
        TB: { board: swapBands(gameData.solution) },
        HV: { board: swapBands(swapStacks(gameData.solution)) },
      };

      let validTopology = true;
      let allCandidates = [];
      let globalForcedValues = new Set(); // Union of all islands across all vars

      // 3. Procesar cada variante
      for (let key in variations) {
        // A. Topology
        const { targetMap } = getAllTargets(variations[key].board);
        variations[key].peaksValleys = targetMap;

        // B. Generar Cobertura "Greedy"
        const rawPaths = generateGreedyCoverage(
          variations[key].board,
          variations[key].peaksValleys,
        );

        // C. Verificar Islas (Forced Holes)
        const islands = getIslands(rawPaths, variations[key].peaksValleys);
        // Si hay muchas islas en UNA variante, ya es malo.
        if (islands.length > 3) {
          process.stdout.write(
            `Too many islands in [${key}] (${islands.length}). Next.\r`,
          );
          validTopology = false;
          break;
        }
        variations[key].islands = islands;

        // Track Forced Values
        islands.forEach((isl) =>
          globalForcedValues.add(variations[key].board[isl.r][isl.c]),
        );

        // D. Smart Segmentation
        const snakes = segmentPathsSmart(
          rawPaths,
          variations[key].board,
          variations[key].peaksValleys,
        );
        variations[key].snakes = snakes;

        // E. Unique Analysis
        const uniqueSnakes = identifyUniqueSnakes(
          snakes,
          variations[key].board,
          variations[key].peaksValleys,
        );
        variations[key].uniqueSnakes = uniqueSnakes;

        // F. Candidates (Unique Snake Ends + Islands)
        const candidates = new Set();
        islands.forEach((isl) =>
          candidates.add(variations[key].board[isl.r][isl.c]),
        );
        uniqueSnakes.forEach((snake) => {
          candidates.add(variations[key].board[snake[0].r][snake[0].c]);
          candidates.add(
            variations[key].board[snake[snake.length - 1].r][
              snake[snake.length - 1].c
            ],
          );
        });

        variations[key].candidates = candidates;
        allCandidates.push(candidates);
      }

      if (!validTopology) continue;

      // --- CRITICAL CHECK: FORCED VALUES ---
      // 1. We cannot have more than 3 distinct forced values across all variations.
      if (globalForcedValues.size > 3) {
        process.stdout.write(
          `Too many disparate islands (Union=${globalForcedValues.size}). Next.\r`,
        );
        continue;
      }

      // 2. All forced values MUST be available candidates in ALL variations.
      // (i.e. if '5' is an island in Var0, '5' must be carve-able in VarLR)
      let forcedCompatible = true;
      for (let forced of globalForcedValues) {
        for (let candidates of allCandidates) {
          if (!candidates.has(forced)) {
            forcedCompatible = false;
            break;
          }
        }
        if (!forcedCompatible) break;
      }
      if (!forcedCompatible) {
        process.stdout.write(
          `Forced island value incompatible with other variants. Next.\r`,
        );
        continue;
      }

      // 4. Buscar Intersección
      let commonValues = [...allCandidates[0]];
      for (let i = 1; i < allCandidates.length; i++) {
        commonValues = commonValues.filter((val) => allCandidates[i].has(val));
      }

      // Remove Forced from Common (to avoid double picking if we rely on random fill)
      // Actually, let's build the final target set directly.
      let targets = Array.from(globalForcedValues);

      // Determine how many more we need
      let slotsNeeded = 3 - targets.length;

      // Filter potential fillers: Common Values that are NOT in targets already
      let potentialFillers = commonValues.filter(
        (v) => !globalForcedValues.has(v),
      );

      if (potentialFillers.length < slotsNeeded) {
        process.stdout.write(`Not enough fillers to reach 3 targets. Next.\r`);
        continue;
      }

      // 5. ÉXITO: Seleccionar fillers
      let fillers = potentialFillers
        .sort(() => 0.5 - Math.random())
        .slice(0, slotsNeeded);
      let finalTargets = [...targets, ...fillers];

      console.log(
        `\n     💎 Match! Targets: [${finalTargets.join(", ")}] (Forced: [${targets.join(", ")}])`,
      );

      let tempSearchTargets = {};
      let carvingSuccess = true;

      for (let key in variations) {
        const res = applyCarving(
          variations[key].snakes,
          variations[key].islands,
          variations[key].board,
          finalTargets,
        );

        if (!res.success) {
          console.error("Critical: Failed to carve. Retry.");
          carvingSuccess = false;
          break;
        }

        tempSearchTargets[key] = {
          targets: res.snakes,
          simon: res.simonCoords,
        };
      }

      if (carvingSuccess) {
        finalSearchTargets = tempSearchTargets;
        finalSimonValues = finalTargets;
        finalGameData = gameData;
        success = true;
      }
    }

    if (!success)
      throw new Error("Could not generate valid puzzle after 200 attempts.");

    // --- SAVE ---
    const dailyPuzzle = {
      meta: { version: "4.5-strict-islands", date: dateStr, seed: seedInt },
      data: {
        solution: finalGameData.solution,
        puzzle: finalGameData.puzzle,
        simonValues: finalSimonValues,
        searchTargets: finalSearchTargets,
      },
      chunks: finalGameData.chunks,
    };

    const filename = `daily-${dateStr}.json`;
    fs.writeFileSync(
      path.join(PUZZLES_DIR, filename),
      JSON.stringify(dailyPuzzle, null, 2),
    );
    console.log(`✅ Puzzle saved: ${filename}`);
  } catch (error) {
    console.error("❌ Fatal Error:", error);
    process.exit(1);
  }
}

// ==========================================
// 🧠 LOGIC: GREEDY PATH GENERATOR
// ==========================================
function generateGreedyCoverage(grid, pvMap) {
  let visited = Array(9)
    .fill()
    .map(() => Array(9).fill(false));
  let unvisitedCount = 81 - pvMap.size;
  pvMap.forEach((_, key) => {
    const [r, c] = key.split(",").map(Number);
    visited[r][c] = true;
  });

  let paths = [];
  const getDirs = () =>
    [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ].sort(() => 0.5 - Math.random());

  while (unvisitedCount > 0) {
    let candidates = [];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (!visited[r][c]) candidates.push({ r, c });
      }
    if (candidates.length === 0) break;

    let start = candidates[Math.floor(Math.random() * candidates.length)];
    let currentPath = [start];
    visited[start.r][start.c] = true;
    unvisitedCount--;

    let curr = start;
    let stuck = false;

    while (!stuck) {
      let moved = false;
      const dirs = getDirs();
      for (let d of dirs) {
        const nr = curr.r + d[0];
        const nc = curr.c + d[1];
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && !visited[nr][nc]) {
          visited[nr][nc] = true;
          const nextNode = { r: nr, c: nc };
          currentPath.push(nextNode);
          curr = nextNode;
          unvisitedCount--;
          moved = true;
          break;
        }
      }
      if (!moved) stuck = true;
    }
    paths.push(currentPath);
  }
  return paths;
}

// ==========================================
// 🪚 LOGIC: SMART SEGMENTATION
// ==========================================
function segmentPathsSmart(rawPaths, grid, pvMap) {
  let finalSnakes = [];

  for (let path of rawPaths) {
    let remaining = [...path];
    while (remaining.length > 0) {
      const len = remaining.length;
      if (len <= 6) {
        if (len >= 3) finalSnakes.push(remaining);
        break;
      }
      // Smart uniqueness check logic
      let bestCut = -1;
      for (let cut = 6; cut >= 3; cut--) {
        let remSize = len - cut;
        if (remSize > 0 && remSize < 3) continue;
        const candidateChunk = remaining.slice(0, cut);
        const seqValues = candidateChunk.map((p) => grid[p.r][p.c]);
        if (countOccurrences(grid, pvMap, seqValues) === 1) {
          bestCut = cut;
          break;
        }
      }
      // Fallback
      if (bestCut === -1) {
        let cut = 6;
        while (cut >= 3) {
          if (len - cut === 0 || len - cut >= 3) break;
          cut--;
        }
        if (cut < 3) cut = 3;
        bestCut = cut;
      }
      finalSnakes.push(remaining.slice(0, bestCut));
      remaining = remaining.slice(bestCut);
    }
  }
  return finalSnakes;
}

// ==========================================
// 🔎 UNIQUENESS IDENTIFIER
// ==========================================
function identifyUniqueSnakes(snakes, grid, pvMap) {
  let uniqueOnes = [];
  for (let snake of snakes) {
    const seqValues = snake.map((p) => grid[p.r][p.c]);
    if (countOccurrences(grid, pvMap, seqValues) === 1) {
      uniqueOnes.push(snake);
    }
  }
  return uniqueOnes;
}

// 🌍 GLOBAL SCANNER
function countOccurrences(grid, pvMap, targetSeq) {
  let count = 0;
  const startVal = targetSeq[0];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (pvMap.has(`${r},${c}`)) continue;
      if (grid[r][c] === startVal) {
        count += searchPath(
          grid,
          pvMap,
          r,
          c,
          targetSeq,
          1,
          new Set([`${r},${c}`]),
        );
        if (count > 1) return count;
      }
    }
  }
  return count;
}

function searchPath(grid, pvMap, r, c, targetSeq, index, visited) {
  if (index >= targetSeq.length) return 1;
  let found = 0;
  const nextVal = targetSeq[index];
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  for (let d of dirs) {
    const nr = r + d[0];
    const nc = c + d[1];
    const key = `${nr},${nc}`;
    if (
      nr >= 0 &&
      nr < 9 &&
      nc >= 0 &&
      nc < 9 &&
      !pvMap.has(key) &&
      !visited.has(key) &&
      grid[nr][nc] === nextVal
    ) {
      const newVisited = new Set(visited);
      newVisited.add(key);
      found += searchPath(
        grid,
        pvMap,
        nr,
        nc,
        targetSeq,
        index + 1,
        newVisited,
      );
      if (found > 1) return found;
    }
  }
  return found;
}

// ==========================================
// 🎨 LOGIC: CARVING
// ==========================================
function applyCarving(snakes, islands, grid, targets) {
  let finalSnakes = JSON.parse(JSON.stringify(snakes));
  let simonCoords = islands.map((i) => ({ r: i.r, c: i.c }));

  // We must ensure that ALL 'targets' are carved or satisfied.
  // 'satisfiedValues' are what we ALREADY HAVE as islands.
  let satisfiedValues = new Set(simonCoords.map((p) => grid[p.r][p.c]));
  let toCarve = targets.filter((t) => !satisfiedValues.has(t));

  // Sort toCarve to prioritize? No order needed if we just find ANY match.

  for (let val of toCarve) {
    let carved = false;
    for (let i = 0; i < finalSnakes.length; i++) {
      let s = finalSnakes[i];

      // Head
      if (grid[s[0].r][s[0].c] === val) {
        if (s.length > 3) {
          simonCoords.push(s.shift());
          carved = true;
          break;
        }
      }
      // Tail
      let tailIdx = s.length - 1;
      if (grid[s[tailIdx].r][s[tailIdx].c] === val) {
        if (s.length > 3) {
          simonCoords.push(s.pop());
          carved = true;
          break;
        }
      }
    }
    if (!carved) {
      // If we failed to carve a "Forced Value", it's a critical error for this seed variant pairing.
      // But wait, our pre-check said it was in possible candidates.
      return { success: false };
    }
  }
  return { success: true, snakes: finalSnakes, simonCoords };
}

// ==========================================
// 🛠️ HELPERS
// ==========================================
function getIslands(paths, pvMap) {
  let visitedCount = paths.reduce((acc, p) => acc + p.length, 0);
  let wallCount = pvMap.size;
  let expected = 81;
  let islands = [];
  if (visitedCount + wallCount < expected) {
    let visitedMap = new Set();
    paths.flat().forEach((p) => visitedMap.add(`${p.r},${p.c}`));
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (!pvMap.has(`${r},${c}`) && !visitedMap.has(`${r},${c}`)) {
          islands.push({ r, c });
        }
      }
  }
  return islands;
}

function swapStacks(board) {
  const newBoard = board.map((r) => [...r]);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 3; c++) {
      [newBoard[r][c], newBoard[r][c + 6]] = [
        newBoard[r][c + 6],
        newBoard[r][c],
      ];
    }
  return newBoard;
}
function swapBands(board) {
  const newBoard = board.map((r) => [...r]);
  for (let r = 0; r < 3; r++)
    [newBoard[r], newBoard[r + 6]] = [newBoard[r + 6], newBoard[r]];
  return newBoard;
}

generateDailyPuzzle();
