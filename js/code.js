/* El Código (The Code) Logic */
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";
import { getDailySeed } from "./utils/random.js";

let sequence = []; // The full 5-digit code
let currentLevel = 3; // Starts at 3
let stepInLevel = 0; // Current step player is entering
let isInputBlocked = true;
let simonCells = []; // DOM Elements
let simonData = []; // { value, r, c, element }
// Duplicate declarations removed
let idleTimer = null; // Timer to repeat sequence
let activeTimeouts = []; // Track animation timeouts to cancel them on interrupt

export function initCode() {
  console.log("Initializing Code Stage...");

  const state = gameManager.getState();
  const simonCoords = state.simon.coordinates;
  const board = document.getElementById("memory-board");

  if (!simonCoords || simonCoords.length !== 3) {
    console.error("Critical: Invalid Simon Coordinates", simonCoords);
    return;
  }

  // 1. Identify Cells and Values
  simonData = simonCoords.map((pos) => {
    const slotIndex = Math.floor(pos.r / 3) * 3 + Math.floor(pos.c / 3);
    const cellIndex = (pos.r % 3) * 3 + (pos.c % 3);
    const slot = board.querySelector(
      `.sudoku-chunk-slot[data-slot-index="${slotIndex}"]`,
    );
    const cell = slot.querySelectorAll(".mini-cell")[cellIndex];
    const value = parseInt(cell.textContent.trim());

    return { r: pos.r, c: pos.c, element: cell, value: value };
  });

  // 2. Clear previous styles / listeners
  simonCells = simonData.map((d) => d.element);
  simonCells.forEach((cell) => {
    cell.classList.remove("search-found-cell"); // Clean from previous stage
    cell.classList.add("code-cell");
    // Ensure value is visible
    cell.style.opacity = "1";
    cell.style.transform = "scale(1)";
  });

  // 3. Generate Sequence (Seeded Random)
  generateSequence();

  // 4. Start Game Loop
  currentLevel = 3;
  updateStatusDisplay();

  // Brief delay before starting first sequence
  setTimeout(() => {
    playSequence();
  }, 100);

  attachCodeListeners();
}

function generateSequence() {
  // Use daily seed to ensure same code for everyone
  const seed = getDailySeed();
  // Simple LCG or just use Math.sin with seed (local helper)
  // We need 5 digits, generated from available values in simonData

  // Available numbers
  const availableValues = simonData.map((d) => d.value);

  // Pseudo-random based on seed
  let localSeed = seed + 12345;
  const random = () => {
    const x = Math.sin(localSeed++) * 10000;
    return x - Math.floor(x);
  };

  sequence = [];

  // Rule: "tienen que estar los 3 al menos una vez" (All 3 must appear at least once)
  // We have 5 slots. Let's place the 3 unique values first, shuffle, then fill remaining 2.

  // 1. Base Pool
  let pool = [...availableValues]; // [A, B, C]

  // 2. Add 2 more randoms from available
  for (let i = 0; i < 2; i++) {
    const idx = Math.floor(random() * availableValues.length);
    pool.push(availableValues[idx]);
  }

  // 3. Shuffle Pool to get Final Sequence
  // Fisher-Yates with seeded random
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  sequence = pool;
  console.log(`[Code] Sequence Generated: ${sequence.join("-")}`);
}

function playSequence() {
  stopAnimation(); // ensuring clean slate
  isInputBlocked = true;
  clearIdleTimer(); // Stop timer while playing
  stepInLevel = 0;

  // Extract substep: first 'currentLevel' digits
  const currentSequence = sequence.slice(0, currentLevel);
  console.log(
    `[Code] Playing sequence for level ${currentLevel}:`,
    currentSequence,
  );

  let delay = 500;
  const flashDuration = 600;
  const gap = 300;

  currentSequence.forEach((val, index) => {
    // Find all cells matching this value
    const matchData = simonData.filter((d) => d.value === val);

    const tId = setTimeout(() => {
      matchData.forEach((d) => highlightCell(d.element, 500)); // Slow for sequence
    }, delay);
    activeTimeouts.push(tId);

    delay += flashDuration + gap;
  });

  // Unlock input after sequence
  const tEnd = setTimeout(() => {
    isInputBlocked = false;
    showInputHint();
    startIdleTimer(); // Start waiting for user interaction
  }, delay);
  activeTimeouts.push(tEnd);
}

function stopAnimation() {
  // Clear all pending animation steps
  activeTimeouts.forEach((id) => clearTimeout(id));
  activeTimeouts = [];

  // Remove active class from all cells immediately
  simonCells.forEach((c) => c.classList.remove("simon-active"));

  // Improve responsiveness: Unblock input immediately
  isInputBlocked = false;
}

function startIdleTimer() {
  clearIdleTimer();
  // Repeat sequence after 4 seconds of inactivity
  idleTimer = setTimeout(() => {
    console.log("[Code] Idle timeout. Replaying sequence...");
    playSequence();
  }, 4000);
}

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function highlightCell(cell, duration = 500) {
  cell.classList.add("simon-active");
  setTimeout(() => {
    cell.classList.remove("simon-active");
  }, duration);
}

function showInputHint() {
  // Optional: cursor change or slight glow to indicate "Your turn"
}

function attachCodeListeners() {
  const board = document.getElementById("memory-board");
  // Use delegation but specific to code-cell
  board.addEventListener("click", handleCodeClick);
  board.addEventListener(
    "touchstart",
    function (e) {
      if (e.target.closest(".code-cell")) {
        e.preventDefault();
        handleCodeClick(e);
      }
    },
    { passive: false },
  );
}

function handleCodeClick(e) {
  const cell = e.target.closest(".code-cell");
  if (!cell) return;

  // Interruption Logic: If clicking during animation (isInputBlocked but activeTimeouts exist), stop it.
  if (isInputBlocked && activeTimeouts.length > 0) {
    stopAnimation();
    // Proceed to handle the click naturally below
  }

  if (isInputBlocked) return;

  // Click Effect
  highlightCell(cell, 200); // Fast for interaction
  clearIdleTimer(); // Stop timer on interaction (first interaction stops loop until next idle or new level)

  // Note: We might want to restart idle timer if they stop mid-input?
  // User asked: "repetirlo, y así hasta que el usuario empiece a resolverlo."
  // "empiece a resolverlo" -> Once they click, we stop repeating?
  // Or if they stall mid-sequence?
  // Let's assume once they start typing, they are "solving".
  // If they timeout MID-typing, should we replay? Usually Simon doesn't.
  // We'll leave it cleared. If they make a mistake, error handles it.

  const val = parseInt(cell.textContent.trim());

  // Validate
  const expectedVal = sequence[stepInLevel];

  if (val === expectedVal) {
    // Correct!
    stepInLevel++;

    // Check if Level Complete
    if (stepInLevel >= currentLevel) {
      if (currentLevel === 5) {
        // GAME WIN!
        isInputBlocked = true;
        setTimeout(winGame, 500);
      } else {
        // Level Up
        currentLevel++;
        isInputBlocked = true;
        setTimeout(() => {
          playSequence();
        }, 1000);
      }
    }
  } else {
    // WRONG!
    handleError(cell);
  }
}

function handleError(cell) {
  isInputBlocked = true;
  cell.classList.add("simon-error");
  navigator.vibrate?.(200); // Mobile vibe

  setTimeout(() => {
    cell.classList.remove("simon-error");
    // Restart current level sequence
    // "Si el usuario le erra, marca error y vuelve a empezar desde el principio."
    // Interpreting "principio" as "principio de la secuencia actual" or "reset level to 3"?
    // "start repeating the sequence again".
    // Usually Simon doesn't reset level. Just replays.
    // "vuelve a empezar desde el principio" COULD mean level 3.
    // Let's implement Soft Fail (Replay current level) first. Ideally Hard Fail (Level 3) is too punishing.
    // Wait, request says: "Si el usuario lo hace bien... agregandole un digito mas. Si el usuario le erra... vuelve a empezar desde el principio."
    // "Desde el principio" strongly suggests Level 3 reset.
    // I Will reset to Level 3 for strict adherence to "principio".

    currentLevel = 3;
    updateStatusDisplay();

    setTimeout(() => {
      playSequence();
    }, 1000);
  }, 1000);
}

function winGame() {
  console.log("CODE CRACKED!");
  const state = gameManager.getState();

  // Update State
  // gameManager.completeStage("code"); // If we had it

  // Victory Animation
  const lang = getCurrentLang();
  const t = translations[lang];

  const titleEl = document.querySelector(".header-title-container h2");
  if (titleEl) {
    titleEl.textContent = t.code_win || "¡CÓDIGO DESCIFRADO!";
    titleEl.classList.add("text-success");
  }

  simonCells.forEach((c) => c.classList.add("simon-win"));

  // Confetti or global win here
}

function updateStatusDisplay() {
  // Optional: Update some UI to show "Level X"
  // Reusing the header or subtitle
}
