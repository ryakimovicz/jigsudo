import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Import Logic Modules
import { generateDailyGame } from "../js/sudoku-logic.js";
import { getAllTargets } from "../js/peaks-logic.js";
import { generateSearchSequences } from "../js/search-gen.js";

// Setup Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUZZLES_DIR = path.join(__dirname, "../public/puzzles");

if (!fs.existsSync(PUZZLES_DIR)) {
  fs.mkdirSync(PUZZLES_DIR, { recursive: true });
}

async function generateDailyPuzzle() {
  console.log("🧩 Starting Daily Puzzle Generation (Subtractive Strategy)...");

  // 1. Determine Seed
  let seed = process.argv[2];
  let dateStr = "";
  let seedInt;

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
    console.log(`📅 Target Date: ${dateStr} (Tomorrow), Seed: ${seed}`);
  } else {
    // Custom Seed parsing logic
    if (/^\d{8}$/.test(seed)) {
      const y = seed.substring(0, 4);
      const m = seed.substring(4, 6);
      const d = seed.substring(6, 8);
      dateStr = `${y}-${m}-${d}`;
    } else {
      dateStr = "custom-" + seed;
    }
    console.log(`🔧 Custom Seed: ${seed} -> Date: ${dateStr}`);
    seedInt = parseInt(seed, 10) || 12345;
  }

  try {
    const baseSeed = seedInt;
    let gameData;
    let attempts = 0;
    const MAX_SUDOKU_RETRIES = 200;

    // --- STEP 1: GENERATE SUDOKU BASE ---
    while (true) {
      if (attempts > 0) seedInt = baseSeed * 1000 + attempts;
      else seedInt = baseSeed;

      gameData = generateDailyGame(seedInt);

      // Check for visual uniqueness (optional but good)
      const blocks = [];
      for (let r = 0; r < 9; r += 3) {
        for (let c = 0; c < 9; c += 3) {
          const block = [];
          for (let i = 0; i < 3; i++)
            block.push(gameData.solution[r + i].slice(c, c + 3));
          blocks.push(JSON.stringify(block));
        }
      }

      if (new Set(blocks).size === 9) {
        if (attempts > 0)
          console.log(
            `\n     ✅ Unique Sudoku found after ${attempts} retries.`,
          );
        break;
      }
      attempts++;
      if (attempts > MAX_SUDOKU_RETRIES)
        throw new Error("Max Sudoku retries reached.");
    }

    // --- STEP 2: MULTIVERSE GENERATION (SUBTRACTIVE) ---

    let globalAttempts = 0;
    let success = false;
    let finalSearchTargets = {};
    let finalSimonValues = [];

    // Main Loop: Try different Topologies until one works
    while (!success && globalAttempts < 50) {
      globalAttempts++;
      process.stdout.write(`   > Attempt ${globalAttempts}: `);

      // A. Setup Variations
      let variations = {
        0: { board: JSON.parse(JSON.stringify(gameData.solution)) },
        LR: { board: swapStacks(gameData.solution) },
        TB: { board: swapBands(gameData.solution) },
        HV: { board: swapBands(swapStacks(gameData.solution)) },
      };

      // B. Generate Topology (Walls) & FULL FILL Snakes
      let allVariationsFilled = true;

      for (let key in variations) {
        // 1. Calculate Walls
        const { targetMap } = getAllTargets(variations[key].board);
        variations[key].peaksValleys = targetMap;

        // 2. Generate FULL COVER (0 Holes)
        // We pass [] as reserved because we want to fill EVERYTHING first.
        const fillResult = generateFullCover(
          variations[key].board,
          variations[key].peaksValleys,
          seedInt + globalAttempts * 100,
        );

        if (!fillResult.success) {
          process.stdout.write(`Failed to fill var [${key}]. Retry.\r`);
          allVariationsFilled = false;
          break;
        }
        variations[key].fullSnakes = fillResult.sequences;
      }

      if (!allVariationsFilled) continue; // Try next global attempt

      // C. THE CARVER: Pick 3 numbers and try to remove them from ALL variations
      // We try 50 different combinations of 3 numbers for this board configuration
      let carverAttempts = 0;
      let carverSuccess = false;

      while (!carverSuccess && carverAttempts < 50) {
        carverAttempts++;

        // 1. Pick 3 random numbers (1-9)
        const targets = [1, 2, 3, 4, 5, 6, 7, 8, 9]
          .sort(() => 0.5 - Math.random())
          .slice(0, 3);

        let tempSearchTargets = {};
        let allVarsCarved = true;

        // 2. Try to carve these numbers from EACH variation
        for (let key in variations) {
          const carveResult = carveHoles(
            JSON.parse(JSON.stringify(variations[key].fullSnakes)), // Work on copy
            variations[key].board,
            targets,
          );

          if (!carveResult.success) {
            allVarsCarved = false;
            break;
          }

          tempSearchTargets[key] = {
            targets: carveResult.sequences,
            simon: carveResult.removedCoords, // These are the holes we made
          };
        }

        if (allVarsCarved) {
          console.log(
            `\n     ✅ SUCCESS! Carved values: ${targets.join(", ")}`,
          );
          finalSearchTargets = tempSearchTargets;
          finalSimonValues = targets;
          carverSuccess = true;
          success = true;
        }
      }

      if (!carverSuccess) {
        process.stdout.write(
          `Could not carve valid holes in this topology. Retry.\r`,
        );
      }
    }

    if (!success) throw new Error("Could not generate valid puzzle.");

    // --- SAVE ---
    const dailyPuzzle = {
      meta: { version: "3.1-subtractive", date: dateStr, seed: seedInt },
      data: {
        solution: gameData.solution,
        puzzle: gameData.puzzle,
        simonValues: finalSimonValues,
        searchTargets: finalSearchTargets,
      },
      chunks: gameData.chunks,
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

// --- HELPER 1: FULL COVER GENERATOR ---
function generateFullCover(grid, pvMap, seed) {
  // Generate with NO reserved cells. We want to cover everything.
  // Allow up to 40 holes initially because we have a strong cleaner.
  const result = generateSearchSequences(grid, seed, 800, []);

  if (result && result.holes <= 40) {
    // Aggressive cleanup: Merge orphans into neighbors
    absorbOrphans(result.sequences, grid, [], pvMap);

    // Final check: Holes MUST be 0
    const holes = countHoles(result.sequences, 0, pvMap);
    if (holes === 0) {
      return { success: true, sequences: result.sequences };
    }
  }
  return { success: false };
}

// --- HELPER 2: THE CARVER (The Logic You Asked For) ---
function carveHoles(sequences, grid, targetValues) {
  // sequences: Array of arrays of coords [{r,c}, {r,c}...]
  // targetValues: [A, B, C] (e.g. [5, 2, 9])

  let removedCoords = [];

  // Process each target number one by one
  for (let target of targetValues) {
    let carved = false;

    // Find all candidates for this target in the snakes
    // Candidates must be removable (rules below)
    let candidates = [];

    for (let sIdx = 0; sIdx < sequences.length; sIdx++) {
      const seq = sequences[sIdx];
      for (let cIdx = 0; cIdx < seq.length; cIdx++) {
        const cell = seq[cIdx];
        if (grid[cell.r][cell.c] === target) {
          candidates.push({ sIdx, cIdx, r: cell.r, c: cell.c });
        }
      }
    }

    // Shuffle candidates to try random ones
    candidates.sort(() => 0.5 - Math.random());

    // Try to remove one
    for (let cand of candidates) {
      const seq = sequences[cand.sIdx];

      // LOGIC: Can we remove this cell?
      // Min length allowed for a snake is 3.

      // Case 1: Head (Index 0)
      if (cand.cIdx === 0) {
        if (seq.length - 1 >= 3) {
          seq.shift(); // Remove head
          removedCoords.push({ r: cand.r, c: cand.c });
          carved = true;
          break;
        }
      }
      // Case 2: Tail (Index length-1)
      else if (cand.cIdx === seq.length - 1) {
        if (seq.length - 1 >= 3) {
          seq.pop(); // Remove tail
          removedCoords.push({ r: cand.r, c: cand.c });
          carved = true;
          break;
        }
      }
      // Case 3: Middle (Split)
      else {
        const leftPart = seq.slice(0, cand.cIdx);
        const rightPart = seq.slice(cand.cIdx + 1);

        if (leftPart.length >= 3 && rightPart.length >= 3) {
          // Split the snake!
          // Modify original sequence to be Left Part
          sequences[cand.sIdx] = leftPart;
          // Add Right Part as new sequence
          sequences.push(rightPart);

          removedCoords.push({ r: cand.r, c: cand.c });
          carved = true;
          break;
        }
      }
    }

    if (!carved) return { success: false }; // Could not find a valid removal for this number
  }

  return { success: true, sequences, removedCoords };
}

// --- STANDARD HELPERS ---
function absorbOrphans(sequences, grid, reservedArr, topographyMap) {
  // This is the aggressive cleaner that makes sure NO holes are left.
  // Note: reservedArr is empty in Phase 1.
  const reservedSet = new Set(reservedArr.map((p) => `${p.r},${p.c}`));
  let changed = true;
  while (changed) {
    changed = false;
    const orphans = [];

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const key = `${r},${c}`;
        const isUsed = sequences.some((seq) =>
          seq.some((s) => s.r === r && s.c === c),
        );
        const isWall = topographyMap.has(key);
        const isReserved = reservedSet.has(key);
        if (!isUsed && !isWall && !isReserved) orphans.push({ r, c });
      }
    }
    if (orphans.length === 0) return true;

    for (let i = 0; i < orphans.length; i++) {
      let orphan = orphans[i];
      if (!orphan) continue;
      for (let seq of sequences) {
        const head = seq[0];
        const tail = seq[seq.length - 1];
        if (dist(head, orphan) === 1) {
          seq.unshift(orphan);
          orphans[i] = null;
          changed = true;
          break;
        }
        if (dist(tail, orphan) === 1) {
          seq.push(orphan);
          orphans[i] = null;
          changed = true;
          break;
        }
      }
    }

    // Force merge remaining orphans into NEW snakes if > 1 (Nuclear Option lite)
    const rem = orphans.filter((o) => o !== null);
    if (!changed && rem.length >= 2) {
      // Find neighbors
      for (let i = 0; i < rem.length; i++) {
        for (let j = i + 1; j < rem.length; j++) {
          if (dist(rem[i], rem[j]) === 1) {
            sequences.push([rem[i], rem[j]]);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
  }
  return false;
}

function dist(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}
function countHoles(sequences, reservedCount, pvMap) {
  let used = sequences.reduce((acc, s) => acc + s.length, 0);
  return 81 - (used + pvMap.size + reservedCount);
}
function pickRandom(arr, n) {
  return [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
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
