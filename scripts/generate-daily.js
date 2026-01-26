import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Import Logic Modules directly from /js/
// Note: We need to use relative paths from this script location
import { generateDailyGame } from "../js/sudoku-logic.js";
import { getAllTargets } from "../js/peaks-logic.js";
import { generateSearchSequences } from "../js/search-gen.js";
import { getDailySeed } from "../js/utils/random.js";

// Setup Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUZZLES_DIR = path.join(__dirname, "../public/puzzles");

// Ensure output directory exists
if (!fs.existsSync(PUZZLES_DIR)) {
  fs.mkdirSync(PUZZLES_DIR, { recursive: true });
}

async function generateDailyPuzzle() {
  console.log("🧩 Starting Daily Puzzle Generation...");

  // 1. Determine Seed (Argument or Today)
  let seed = process.argv[2];
  let dateStr = "";

  if (!seed) {
    // Generate for "Tomorrow" by default if running at 00:00?
    // Or generate for "Today" (UTC).
    // Standard wordle behavior: Generate for the current date index.
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    dateStr = `${yyyy}-${mm}-${dd}`;

    // Convert to integer seed like getDailySeed does
    seed = getDailySeed(); // This uses local time of the machine running it
    // Ideally we want explicit control, but for now this matches client logic.
    console.log(`📅 Date: ${dateStr}, Seed: ${seed}`);
  } else {
    dateStr = "custom-" + seed;
    console.log(`🔧 Custom Seed: ${seed}`);
  }

  try {
    const seedInt = parseInt(seed, 10);

    // 2. Generate Sudoku & Jigsaw (Base)
    console.log("   > Generating Sudoku & Jigsaw Layers...");
    const gameData = generateDailyGame(seedInt);

    // 3. Generate Peaks & Valleys
    console.log("   > Calculating Peaks & Valleys...");
    const { targetMap, peakCount, valleyCount } = getAllTargets(
      gameData.solution,
    );

    // 4. Generate Search Sequences (The Heavy Calculation)
    console.log("   > Generating Search Sequences (timeout: 60s)...");
    // We use a longer timeout for server generation to ensure perfection
    const searchSequences = generateSearchSequences(
      gameData.solution,
      seedInt,
      60000,
    );

    if (!searchSequences || searchSequences.length === 0) {
      throw new Error("Failed to generate valid search sequences.");
    }

    console.log(`     -> Found ${searchSequences.length} sequences.`);

    // 5. Construct Final JSON Overlay
    const dailyPuzzle = {
      meta: {
        version: "1.0",
        date: dateStr,
        seed: seedInt,
        generatedAt: new Date().toISOString(),
      },
      data: {
        // We store the 'solution' and 'puzzle' (holes)
        // The client can reconstruct 'chunks' from 'puzzle' logic if needed,
        // OR we can save everything to be purely static and fast.
        // Saving everything is safer for 'Static' philosophy.
        solution: gameData.solution,
        puzzle: gameData.puzzle,
        chunks: gameData.chunks,
        searchTargets: searchSequences,
      },
    };

    // 6. Save to File
    const filename = `daily-${dateStr}.json`;
    const filePath = path.join(PUZZLES_DIR, filename);

    fs.writeFileSync(filePath, JSON.stringify(dailyPuzzle, null, 2));
    console.log(`✅ Success! Puzzle saved to: ${filePath}`);
  } catch (error) {
    console.error("❌ Fatal Error during generation:", error);
    process.exit(1);
  }
}

// Run
generateDailyPuzzle();
