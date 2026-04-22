/* El Código (The Code) Logic */
import { gameManager } from "./game-manager.js?v=1.3.10";
import { translations } from "./translations.js?v=1.3.10";
import { getCurrentLang } from "./i18n.js?v=1.3.10";
import { getDailySeed } from "./utils/random.js?v=1.3.10";
import { stopTimer } from "./timer.js?v=1.3.10";
import { masterLock } from "./lock.js?v=1.3.10";

let sequence = []; // The full 5-digit code
let currentLevel = 3; // Starts at 3
let stepInLevel = 0; // Current step player is entering
let isInputBlocked = true;
let simonCells = []; // DOM Elements
let simonData = []; // { value, r, c, element }
// Duplicate declarations removed
let idleTimer = null; // Timer to repeat sequence
let activeTimeouts = []; // Track animation timeouts to cancel them on interrupt

let penaltyMode = false; // New state
let maxUnlockedLevel = 3; // Tracks the highest level shown to player
let isMultipressBlocked = false; // Prevent debug overlapping
let glitchInterval = null; // Track victory glitch interval
let victoryPromise = null; // v1.2.6: Track background saving

// ... (In initCode or reset)
export function initCode() {
  console.log("Initializing Code Stage...");
  penaltyMode = false; // Reset penalty mode
  isMultipressBlocked = false;

  const state = gameManager.getState();
  const simonCoords = state?.simon?.coordinates;
  const board = document.getElementById("memory-board");

  if (!simonCoords || simonCoords.length < 3) {
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

  // 3. Load Sequence from Game State (Server Generated)
  if (state.data.codeSequence && state.data.codeSequence.length > 0) {
    sequence = state.data.codeSequence;
    console.log(`[Code] Loaded Global Sequence: ${sequence.join("-")}`);
  } else {
    // Fallback if not present (e.g. old save or old generator)
    console.warn("[Code] No global sequence found, generating local fallback.");
    generateFallbackSequence();
  }

  // 4. Start Game Loop
  // Respect hydrated state if available
  if (!currentLevel || currentLevel < 3) currentLevel = 3;
  if (!maxUnlockedLevel || maxUnlockedLevel < 3) maxUnlockedLevel = 3;
  updateStatusDisplay();

  setTimeout(() => {
    playSequence();
  }, 100);

  attachCodeListeners();

  // Mark section for Debug Button detection
  const memSection = document.getElementById("game-section");
  if (memSection) memSection.classList.add("code-mode");
}

/**
 * Hydrates progress from saved state.
 */
export function resumeCodeState() {
  const state = gameManager.getState();
  maxUnlockedLevel = state?.code?.maxUnlockedLevel || 3;
  const currentStage = state?.progress?.currentStage || state?.currentStage || "memory";
  currentLevel = currentStage === "code" ? maxUnlockedLevel : 3;

  console.log(`[Code] Hydrated max unlocked level: ${maxUnlockedLevel}`);
}

function generateFallbackSequence() {
  // Use daily seed to ensure same code for everyone
  const seed = getDailySeed();
  const availableValues = simonData.map((d) => d.value);

  // Pseudo-random based on seed
  let localSeed = seed + 12345;
  const random = () => {
    const x = Math.sin(localSeed++) * 10000;
    return x - Math.floor(x);
  };

  sequence = [];
  let pool = [...availableValues];

  for (let i = 0; i < 2; i++) {
    const idx = Math.floor(random() * availableValues.length);
    pool.push(availableValues[idx]);
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  sequence = pool;
  console.log(`[Code] Fallback Sequence: ${sequence.join("-")}`);
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
  // Duration: 2s if in penalty mode (quick assist), 4s otherwise (standard replay)
  const delay = penaltyMode ? 2000 : 4000;

  idleTimer = setTimeout(() => {
    console.log(`[Code] Idle timeout (${delay}ms). Replaying sequence...`);
    // If user stopped in penalty mode, assume they want to see the next level they unlocked
    if (penaltyMode) {
      console.log("[Code] Idle in Penalty Mode. Exiting to show progression.");
      penaltyMode = false;
    }
    playSequence();
  }, delay);
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

function playSequence() {
  stopAnimation(); // ensuring clean slate
  isInputBlocked = true;
  clearIdleTimer(); // Stop timer while playing
  stepInLevel = 0;

  // Extract substep:
  // Standard: currentLevel.
  // Penalty Mode: Always 3 (visual reset).
  const visualLevel = penaltyMode ? 3 : currentLevel;

  // Ensure we don't exceed sequence length (though visualLevel is usually low)
  const validLevel = Math.min(visualLevel, sequence.length);
  const currentSequence = sequence.slice(0, validLevel);
  console.log(
    `[Code] Playing sequence (Level ${currentLevel}, Visual ${validLevel}):`,
    currentSequence,
  );

  // Debug: Check simonData
  console.log(
    "[Code] Simon Data available:",
    simonData.map((d) => ({ val: d.value, el: !!d.element })),
  );

  let delay = 500;
  const flashDuration = 600;
  const gap = 300;

  currentSequence.forEach((val, index) => {
    // Find all cells matching this value
    const matchData = simonData.filter((d) => d.value === val);

    if (matchData.length === 0) {
      console.error(
        `[Code] ERROR: No cells found with value ${val}! Board might be empty.`,
      );
    }

    console.log(
      `[Code] Step ${index}: Value ${val}, Matches Found: ${matchData.length}`,
    );

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

// ...

function handleCodeClick(e) {
  const cell = e.target.closest(".code-cell");
  if (!cell) return;

  if (isInputBlocked && activeTimeouts.length > 0) {
    stopAnimation();
  }

  if (isInputBlocked) return;

  highlightCell(cell, 200);
  clearIdleTimer();

  const val = parseInt(cell.textContent.trim());
  const expectedVal = sequence[stepInLevel];

  if (val === expectedVal) {
    stepInLevel++;

    // SYNC STATE: Save progress
    const state = gameManager.getState();
    state.code.maxUnlockedLevel = Math.max(
      state.code.maxUnlockedLevel || 3,
      currentLevel,
    );
    gameManager.save();

    // Check if we hit the limit of the CURRENT TARGET level
    if (stepInLevel >= currentLevel) {
      // Check absolute victory (Level 7 / Sequence Max)
      if (currentLevel >= sequence.length) {
        isInputBlocked = true;
        setTimeout(winGame, 500);
        return;
      }

      // Logic Decision: Silent Advance OR Standard Advance?

      // If we are in penalty mode AND NOT YET at the max level we saw before...
      if (penaltyMode && currentLevel < maxUnlockedLevel) {
        // Silent Advance (Catching up)
        currentLevel++;
        console.log(
          `[Code] Penalty Catch-up: Silent advance to Level ${currentLevel}`,
        );
        startIdleTimer();
      } else {
        // Standard Advance (New Territory OR Just Caught Up)
        // If we just caught up (currentLevel === maxUnlockedLevel), exit penalty mode
        if (penaltyMode) {
          console.log(
            "[Code] Caught up to max unlocked level. Exiting Penalty Mode.",
          );
          penaltyMode = false;
        }

        currentLevel++;
        maxUnlockedLevel = Math.max(maxUnlockedLevel, currentLevel);

        isInputBlocked = true;
        setTimeout(() => {
          playSequence(); // Show the new level
        }, 1000);
      }
    } else {
      // In the middle of a sequence, restart idle timer
      startIdleTimer();
    }
  } else {
    // WRONG!
    handleError(cell);
  }
}

function handleError(cell) {
  isInputBlocked = true;
  cell.classList.add("simon-error");
  navigator.vibrate?.(200);

  setTimeout(() => {
    cell.classList.remove("simon-error");

    // ENTER PENALTY MODE
    // If not already in penalty mode, we mark it
    if (!penaltyMode) {
      console.log("[Code] Error! Entering Penalty Mode.");
      penaltyMode = true;
    }

    // Always reset current input requirement to 3
    // But we keep maxUnlockedLevel as is, so they can climb back up silenty
    currentLevel = 3;

    updateStatusDisplay();
    console.log(
      `[Code] Resetting to Level 3. Max Unlocked is ${maxUnlockedLevel}.`,
    );

    setTimeout(() => {
      playSequence(); // Will play 3 (visual)
    }, 1000);
  }, 1000);
}

async function winGame() {
  console.log("CODE CRACKED! Starting Victory Animation...");

  // 1. STOP TIMER & ANIMATIONS IMMEDIATELY
  stopTimer(); // Global Wall Clock
  gameManager.stopStageTimer(); // End Code Stage
  stopAnimation();
  clearIdleTimer();
  
  // v1.2.6: PRE-SAVING (Parallel to animation)
  // We trigger the compute-heavy recordWin now so it doesn't block the UI later.
  victoryPromise = (async () => {
    // v2.1.0: Atomic Advance - Advance stage (which awards points and forces cloud save)
    await gameManager.advanceStage(); 
    return await gameManager.recordWin();
  })();

  // v1.2.7: IMPROVEMENT: Instantly hide Timer and Sudoku board background
  // to focus on the spinning number wheels animation.
  const timer = document.getElementById("memory-timer");
  if (timer) timer.style.display = "none";
  
  // Hide the entire game grid (board + collected pieces)
  const grid = document.querySelector(".memory-grid-layout");
  if (grid) grid.style.opacity = "0";

  // 2. HIDE HEADER UI (Title & Info)
  const gameHeader = document.querySelector(".game-header");
  if (gameHeader) {
    // Fade out for smoothness or immediate? "desaparecer".
    // Let's hide the title container specifically as requested.
    const titleContainer = gameHeader.querySelector(".header-title-container");
    if (titleContainer) titleContainer.style.display = "none";
  }

  // DISABLE DEBUG BUTTON
  const debugBtn = document.getElementById("debug-help-btn");
  if (debugBtn) {
    debugBtn.style.pointerEvents = "none";
    debugBtn.style.opacity = "0.5";
    debugBtn.onclick = null;
  }

  // v1.2.7: Use 7 digits for Bypass (Match cracked code length)
  const values = [];
  for (let i = 0; i < 7; i++) {
    // Take from sequence (cracked code)
    values.push(sequence[i] !== undefined ? sequence[i] : Math.floor(Math.random() * 9) + 1);
  }

  // v1.2.7: Master Lock Sequence (returns the actual wheel digit elements)
  const digitEls = await masterLock.showVictorySequence(values);
  // v1.2.7: NEW: Unified Victory Tray
  // We move the digits from their individual wheels into a shared container
  // to avoid DOM parenting crashes and fix the "panel" layout issues.
  const mechanism = document.querySelector(".safe-mechanism");
  const tray = document.createElement("div");
  tray.className = "victory-tray";
  
  // Convert NodeList to Array to safely migrate elements
  const finalDigits = [];
  digitEls.forEach(el => {
      // Clone text content into a clean new cell to avoid wheel-strip styles
      const cell = document.createElement("div");
      cell.className = "victory-code-cell victory-digit glitching";
      cell.textContent = el.textContent;
      cell.setAttribute('data-content', el.textContent);
      tray.appendChild(cell);
      finalDigits.push(cell);
  });
  
  if (mechanism) mechanism.appendChild(tray);

  // v1.2.7: NEW: Disintegrate the Lock Mechanism UI (Physical wheels)
  masterLock.disintegrate();

  // 2. Disintegrate Board
  const board = document.getElementById("memory-board");
  if (board) {
    // v1.2.7: Disintegrate effect still runs but starts at 0 opacity
    board.classList.add("disintegrate");
  }

  // 3. Glitch Effect Loop starts using the UNIFIED elements
  // v1.2.9: Adjusted to 0.5s total (100ms here + 400ms in startGlitchEffect)
  setTimeout(() => {
    startGlitchEffect(finalDigits, tray);
  }, 100);
}

function startGlitchEffect(elements, container) {
  const lang = getCurrentLang();
  const targetWord = lang === "es" ? "VICTORIA" : "VICTORY";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";

  // v1.2.9: 0.4s of intense vibration before spawning/resolving
  setTimeout(() => {
    let needed = targetWord.length - elements.length;
    
    if (needed > 0 && container) {
      while (needed > 0) {
        // v1.2.8: INSERT in the middle to expand from center (e.g. for VICTORIA)
        const middleIndex = Math.floor(elements.length / 2);
        const el = document.createElement("div");
        el.className = "victory-code-cell victory-digit glitching spawn-in";
        el.textContent = chars[Math.floor(Math.random() * chars.length)];
        
        // Insert in middle of DOM and array to maintain resolve order
        container.insertBefore(el, container.children[middleIndex + 1] || null);
        elements.splice(middleIndex + 1, 0, el);
        
        needed--;
      }
    }

    // 2. Start resolving sequence shortly after spawn
    startResolving(elements, targetWord, chars);
  }, 100);
}

/**
 * Centralized cleanup for victory animations and board states.
 * Called when starting a new game or resetting UI.
 */
export function stopVictoryAnimations() {
  console.log("[Code] Stopping victory animations...");

  // 1. Clear glitch interval
  if (glitchInterval) {
    clearInterval(glitchInterval);
    glitchInterval = null;
  }

  // 2. Clear all active timeouts
  stopAnimation();
  clearIdleTimer();

  // 3. Restore visibility of game elements
  const grid = document.querySelector(".memory-grid-layout");
  if (grid) grid.style.opacity = "";

  const board = document.getElementById("memory-board");
  if (board) {
    board.classList.remove("disintegrate");
    board.style.opacity = ""; 
  }

  const timer = document.getElementById("memory-timer");
  if (timer) timer.style.display = ""; 

  // v1.2.7: Reset Master Lock state
  masterLock.reset();
  masterLock.showIcon();
}

function startResolving(elements, targetWord, chars) {
  let iterations = 0;

  glitchInterval = setInterval(() => {
    // Scramble all UNRESOLVED letters
    elements.forEach((el, idx) => {
      if (!el.classList.contains("victory-final")) {
        el.textContent = chars[Math.floor(Math.random() * chars.length)];
      }
    });

    // Every X ticks, resolve one letter from left to right
    if (iterations % 3 === 0) {
      const indexToResolve = Math.floor(iterations / 3);
      if (indexToResolve < targetWord.length) {
        const el = elements[indexToResolve];
        el.classList.remove("glitching");
        el.classList.add("victory-final");
        // Trigger Flash/Lock-in animation in next frame to ensure style recalc?
        // Or just add 'locked' now.
        requestAnimationFrame(() => el.classList.add("locked"));

        // v1.2.7: STABILIZE - Mark this letter as finished/golden
        el.classList.remove("glitching");
        el.classList.add("locked");

        el.textContent = targetWord[indexToResolve];
        el.setAttribute("data-content", targetWord[indexToResolve]); // For CSS Glow Overlay

        // Mobile vibration for impact
        navigator.vibrate?.(50);
      } else {
        // Done!
        clearInterval(glitchInterval);
        glitchInterval = null;
        finalizeVictory();
      }
    }

    iterations++;
  }, 50); // Slightly faster scramble
}

async function finalizeVictory() {
  console.log("Victory Animation Complete");

  // 1. Wait for the background save started in winGame
  // While we wait, "VICTORIA" stays on screen in its golden state.
  let sessionStats = await victoryPromise;

  // v2.6.0: Resilient Victory UI - If recordWin failed (null), provide emergency fallback
  if (!sessionStats) {
    console.warn("[Code] sessionStats was null. Providing emergency fallback for UI.");
    const allStageTimes = gameManager.state?.meta?.stageTimes || {};
    const totalTimeMs = Object.values(allStageTimes).reduce((acc, val) => acc + (val || 0), 0);
    
    sessionStats = {
      totalTime: totalTimeMs,
      streak: gameManager.stats?.currentStreak || 1,
      errors: 0,
      score: gameManager.stats?.dailyRP || 1.0,
      stageTimes: allStageTimes,
      isReplay: gameManager.isReplay,
      date: new Date().toISOString().split('T')[0]
    };
  }

  // 2. Ensure "Game Complete" state is saved
  gameManager.updateProgress("code", { completed: true });

  // 3. Show Summary after a small delay (v1.2.7: Added 1s per user request)
  setTimeout(async () => {
    const { showVictorySummary } = await import("./ui.js?v=1.3.10");
    showVictorySummary(sessionStats, false);
  }, 1000);

  // 4. Close the master lock now that the results are showing
  // Increased delay to 1300ms to stay behind the result modal
  setTimeout(() => {
    masterLock.close();
  }, 1300);
}

function updateStatusDisplay() {
  // Optional: Update some UI to show "Level X"
  // Reusing the header or subtitle
}

export function debugSolveCode() {
  if (isMultipressBlocked || window.isGameTransitioning) return;
  console.log("[Code] Debug Solve Triggered");
  isMultipressBlocked = true;

  if (isInputBlocked && activeTimeouts.length > 0) {
    stopAnimation();
  }

  isInputBlocked = true;
  let delay = 0;
  const stepDelay = 300; // Fast but visible

  // Simulate pressing each correct button
  sequence.forEach((val, index) => {
    setTimeout(() => {
      // Find a cell with this value
      // We use simonData to find the element
      const data = simonData.find((d) => d.value === val);
      if (data && data.element) {
        highlightCell(data.element, 200);
        // Optional: Play sound if we had it
      }
    }, delay);
    delay += stepDelay;
  });

  // Trigger Win after full sequence
  setTimeout(() => {
    winGame();
  }, delay + 500);
}
