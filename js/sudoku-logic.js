import { createGenerator } from "./utils/random.js";

// Constants
const GRID_SIZE = 9;
const SUBGRID_SIZE = 3;

/**
 * Checks if placing num at board[row][col] is valid
 */
function isValid(board, row, col, num) {
  // Check Row
  for (let x = 0; x < GRID_SIZE; x++) {
    if (board[row][x] === num) return false;
  }

  // Check Column
  for (let x = 0; x < GRID_SIZE; x++) {
    if (board[x][col] === num) return false;
  }

  // Check 3x3 Subgrid
  const startRow = row - (row % SUBGRID_SIZE);
  const startCol = col - (col % SUBGRID_SIZE);
  for (let i = 0; i < SUBGRID_SIZE; i++) {
    for (let j = 0; j < SUBGRID_SIZE; j++) {
      if (board[i + startRow][j + startCol] === num) return false;
    }
  }

  return true;
}

/**
 * Solves the board using backtracking.
 * randomness: if provided (function), shuffles candidates for generation.
 * countSolutions: if true, returns the number of solutions found (capped at 2 for efficiency).
 */
function solveSudoku(board, randomGenerator = null, countSolutions = false) {
  let solutions = 0;

  function solve() {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (board[row][col] === 0) {
          let nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];

          // Shuffle if generating
          if (randomGenerator) {
            for (let i = nums.length - 1; i > 0; i--) {
              const j = Math.floor(randomGenerator() * (i + 1));
              [nums[i], nums[j]] = [nums[j], nums[i]];
            }
          }

          for (let num of nums) {
            if (isValid(board, row, col, num)) {
              board[row][col] = num;

              if (solve()) {
                if (!countSolutions) return true; // Found one, keep going?
                // If counting, we essentially backtrack implicitly by successful return logic differences
                // But standard backtracking returns true on success.
                // For counting, we need to continue searching.
              }

              // Backtrack
              if (countSolutions) {
                // If we are in counting mode, we don't return true immediately
                // We check if we completed the board
              } else {
                board[row][col] = 0;
              }
            }
          }
          if (countSolutions) return false; // Should have returned already if solved
          return false;
        }
      }
    }

    // Board completed
    if (countSolutions) {
      solutions++;
      return solutions < 2; // Keep searching if we haven't found 2 yet
    }
    return true;
  }

  // Specialized Counter for strict checking
  function countSol() {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (board[row][col] === 0) {
          for (let num = 1; num <= 9; num++) {
            if (isValid(board, row, col, num)) {
              board[row][col] = num;
              if (countSol()) {
                if (solutions >= 2) return true; // Stop early
              }
              board[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    solutions++;
    return false; // Continue searching
  }

  if (countSolutions) {
    countSol();
    return solutions;
  } else {
    return solve();
  }
}

/**
 * Generates a full valid Sudoku board
 */
function generateFullBoard(prng) {
  const board = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill(0),
  );
  solveSudoku(board, prng);
  return board;
}

/**
 * Removes numbers to create a puzzle with a unique solution
 */
function createPuzzle(fullBoard, prng, holesToRemove = 45) {
  const puzzle = fullBoard.map((row) => [...row]); // Deep copy
  const positions = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      positions.push([r, c]);
    }
  }

  // Shuffle positions
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  let attempts = holesToRemove;

  for (let [r, c] of positions) {
    if (attempts <= 0) break;

    const removed = puzzle[r][c];
    puzzle[r][c] = 0;

    // Check if unique solution exists
    // We pass a COPY of the puzzle because solver mutates it
    const copyForCheck = puzzle.map((row) => [...row]);
    const solutionsCount = solveSudoku(copyForCheck, null, true);

    if (solutionsCount !== 1) {
      // Not unique or no solution (shouldn't happen), put it back
      puzzle[r][c] = removed;
    } else {
      attempts--;
    }
  }

  return puzzle;
}

/**
 * Splits the full board into 9 3x3 chunks for the Jigsaw phase
 */
function getChunks(board) {
  const chunks = [];
  for (let tr = 0; tr < 3; tr++) {
    // Top Row of chunks
    for (let tc = 0; tc < 3; tc++) {
      // Top Col of chunks
      const chunk = [];
      for (let r = 0; r < 3; r++) {
        const row = [];
        for (let c = 0; c < 3; c++) {
          row.push(board[tr * 3 + r][tc * 3 + c]);
        }
        chunk.push(row);
      }
      chunks.push(chunk);
    }
  }
  return chunks;
}

export function generateDailyGame(seed, dayIndex = null) {
  const prng = createGenerator(seed);

  // Progressive Difficulty Calculation
  // If no dayIndex provided, fallback to current day (legacy)
  if (dayIndex === null) {
    dayIndex = new Date().getDay(); // 0 (Sun) - 6 (Sat)
  }

  const baseHoles = 40;
  const holesToRemove = baseHoles + dayIndex;
  // Result: Sun=40, Mon=41 ... Sat=46

  let solution, puzzle;
  let attempts = 0;

  // Retry loop to ensure Jigsaw Uniqueness (max 4 symmetries)
  // No limit as requested
  while (true) {
    solution = generateFullBoard(prng);
    puzzle = createPuzzle(solution, prng, holesToRemove);

    if (checkBlockAmbiguity(puzzle)) {
      break;
    }
    attempts++;
    if (attempts % 100 === 0) console.log(`Search attempt ${attempts}...`);
  }

  const chunks = getChunks(puzzle);

  return {
    seed,
    solution,
    puzzle,
    chunks,
    difficulty: {
      dayIndex,
      holes: holesToRemove,
    },
  };
}

/**
 * Validates a full 9x9 board and returns all conflicting cells
 * Returns a Set of strings "row,col"
 */
export function getConflicts(board) {
  const conflicts = new Set();
  const SIZE = 9;

  // Check Rows
  for (let r = 0; r < SIZE; r++) {
    const seen = new Map(); // number -> col index(es)
    for (let c = 0; c < SIZE; c++) {
      const num = board[r][c];
      if (num === 0) continue;
      if (!seen.has(num)) seen.set(num, []);
      seen.get(num).push(c);
    }
    // identify duplicates
    seen.forEach((cols, num) => {
      if (cols.length > 1) {
        cols.forEach((c) => conflicts.add(`${r},${c}`));
      }
    });
  }

  // Check Cols
  for (let c = 0; c < SIZE; c++) {
    const seen = new Map(); // number -> row index(es)
    for (let r = 0; r < SIZE; r++) {
      const num = board[r][c];
      if (num === 0) continue;
      if (!seen.has(num)) seen.set(num, []);
      seen.get(num).push(r);
    }
    seen.forEach((rows, num) => {
      if (rows.length > 1) {
        rows.forEach((r) => conflicts.add(`${r},${c}`));
      }
    });
  }

  return conflicts;
}

/**
 * Checks if the board has a unique block arrangement.
 * It permutes the 8 peripheral 3x3 blocks (keeping center fixed)
 * and verifies if any other arrangement forms a valid Sudoku.
 * Returns true if ONLY the original arrangement is valid.
 */
export function checkBlockAmbiguity(board) {
  // 1. Extract 9 blocks (3x3)
  const blocks = [];
  for (let b = 0; b < 9; b++) {
    const block = [];
    const startR = Math.floor(b / 3) * 3;
    const startC = (b % 3) * 3;
    for (let r = 0; r < 3; r++) {
      const row = [];
      for (let c = 0; c < 3; c++) {
        row.push(board[startR + r][startC + c]);
      }
      block.push(row);
    }
    blocks.push(block);
  }

  // Indices to permute: 0, 1, 2, 3, 5, 6, 7, 8 (4 is fixed)
  const mobileIndices = [0, 1, 2, 3, 5, 6, 7, 8];
  let validCount = 0;

  // Heap's Algorithm (Iterative)
  const n = mobileIndices.length;
  const p = [...mobileIndices];
  const c = new Array(n).fill(0);

  // Check initial (Identity)
  if (isValidArrangement(blocks, p)) validCount++;

  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      if (i % 2 === 0) {
        [p[0], p[i]] = [p[i], p[0]];
      } else {
        [p[c[i]], p[i]] = [p[i], p[c[i]]];
      }

      // Check new permutation
      if (isValidArrangement(blocks, p)) {
        validCount++;
        // Allow up to 4 valid variations (Original, Swap Rows, Swap Cols, Swap Both)
        if (validCount > 4) return false;
      }

      c[i] += 1;
      i = 0;
    } else {
      c[i] = 0;
      i += 1;
    }
  }

  return validCount <= 4;
}

function isValidArrangement(blocks, mobileIndices) {
  // Map current slot (0..8) to Block Index
  // 4 is fixed in the middle
  const slotMap = [
    mobileIndices[0],
    mobileIndices[1],
    mobileIndices[2],
    mobileIndices[3],
    4,
    mobileIndices[4],
    mobileIndices[5],
    mobileIndices[6],
    mobileIndices[7],
  ];

  // Check Rows
  for (let r = 0; r < 9; r++) {
    const seen = new Set();
    const slotRow = Math.floor(r / 3);
    const localR = r % 3;

    for (let slotCol = 0; slotCol < 3; slotCol++) {
      const slotIdx = slotRow * 3 + slotCol;
      const blockIdx = slotMap[slotIdx];

      // Optimization: access directly without loop
      const rowVals = blocks[blockIdx][localR];
      for (let k = 0; k < 3; k++) {
        const val = rowVals[k];
        if (val !== 0) {
          if (seen.has(val)) return false;
          seen.add(val);
        }
      }
    }
  }

  // Check Cols
  for (let c = 0; c < 9; c++) {
    const seen = new Set();
    const slotCol = Math.floor(c / 3);
    const localC = c % 3;

    for (let slotRow = 0; slotRow < 3; slotRow++) {
      const slotIdx = slotRow * 3 + slotCol;
      const blockIdx = slotMap[slotIdx];

      const block = blocks[blockIdx];
      for (let k = 0; k < 3; k++) {
        const val = block[k][localC];
        if (val !== 0) {
          if (seen.has(val)) return false;
          seen.add(val);
        }
      }
    }
  }

  return true;
}
