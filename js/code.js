/* El Código (The Code) Logic */
import { gameManager } from "./game-manager.js";
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";
import { getDailySeed } from "./utils/random.js";
import { stopTimer } from "./timer.js";

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

// ... (In initCode or reset)
export function initCode() {
  console.log("Initializing Code Stage...");
  penaltyMode = false; // Reset penalty mode
  // ...
  // ...
  // 4. Start Game Loop
  currentLevel = 3;
  maxUnlockedLevel = 3; // Reset max
  updateStatusDisplay();

  setTimeout(() => {
    playSequence();
  }, 100);

  attachCodeListeners();
}

// ...

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

function winGame() {
  console.log("CODE CRACKED! Starting Victory Animation...");

  // 1. STOP TIMER IMMEDIATELY
  stopTimer();

  // 2. HIDE HEADER UI (Title & Info)
  const gameHeader = document.querySelector(".game-header");
  if (gameHeader) {
    // Fade out for smoothness or immediate? "desaparecer".
    // Let's hide the title container specifically as requested.
    const titleContainer = gameHeader.querySelector(".header-title-container");
    if (titleContainer) titleContainer.style.display = "none";
  }

  const values = sequence.slice(0, 7); // Use up to 7, or all
  const gameSection = document.getElementById("memory-game");
  const board = document.getElementById("memory-board");

  // Create Animation Container (Centered)
  const animContainer = document.createElement("div");
  animContainer.className = "victory-code-container";
  gameSection.appendChild(animContainer);

  // We need to map each SEQUENCE value to a physical board cell.
  // simonData holds { value, element }.
  // There might be duplicates in sequence. We need to pick available cells.
  // Strategy: For each digit in sequence, pick a matching cell from simonData.
  // Reuse cells if we have to (creates overlapping flying clones).

  // Create 5 digit cells first to establish final layout
  const digitEls = values.map((val) => {
    const el = document.createElement("div");
    el.className = "victory-code-cell";
    el.textContent = val;
    // Hide initially until we position it
    el.style.opacity = "0";
    animContainer.appendChild(el);
    return el;
  });

  // Force Layout to ensure everything is positioned correctly
  const _forceLayout = animContainer.offsetHeight;

  // Now calculate positions based on STABLE layout
  digitEls.forEach((el, index) => {
    const val = values[index];

    // Robustly find matching cell
    const matchingData = simonData.find((d) => d.value === val);
    let sourceEl = matchingData ? matchingData.element : null;

    // Fallback search
    if (!sourceEl) {
      const allCells = Array.from(board.querySelectorAll(".mini-cell"));
      const fallback = allCells.find(
        (c) =>
          parseInt(c.textContent.trim()) === val &&
          !c.classList.contains("victory-code-cell"),
      );
      if (fallback) sourceEl = fallback;
    }

    if (sourceEl) {
      // 1. Get positions
      const sourceRect = sourceEl.getBoundingClientRect();
      const targetRect = el.getBoundingClientRect(); // Stable final position

      // 2. Calculate Delta (Center to Center)
      const sourceCenterX = sourceRect.left + sourceRect.width / 2;
      const sourceCenterY = sourceRect.top + sourceRect.height / 2;

      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;

      const deltaX = sourceCenterX - targetCenterX;
      const deltaY = sourceCenterY - targetCenterY;

      // 3. Apply Transform to put it back at source
      el.style.transition = "none"; // IMPORTANT: Disable CSS transition for instant placement
      el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      el.style.opacity = "1"; // Make visible now that it's in source pos

      // 4. Force Reflow per element to ensure transition works
      // (Or we can do a global reflow, but per-element is safer for transition trigger)
      el.offsetHeight;

      // 5. Animate to Center (0,0)
      el.style.transition = "transform 1.0s cubic-bezier(0.16, 1, 0.3, 1)";
      el.style.transform = "translate(0, 0)";
    } else {
      el.style.opacity = "1";
    }
  });

  // 2. Disintegrate Board
  if (board) {
    // Delay disintegration slightly so we see the lift off
    setTimeout(() => {
      board.classList.add("disintegrate");
    }, 200);
  }

  // 3. Glitch Effect Loop begins after flight arrives (1.0s)
  setTimeout(() => {
    startGlitchEffect(digitEls);
  }, 1200);
}

function startGlitchEffect(elements) {
  const lang = getCurrentLang();
  const targetWord = lang === "es" ? "VICTORIA" : "VICTORY";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";

  // 1. Start glitching the EXISTING 5 digits first (chaotic phase)
  elements.forEach((el) => el.classList.add("glitching"));

  // 2. Wait a moment, THEN Spawn the extra characters needed, INTERSPERSED
  setTimeout(() => {
    // We have 5 elements. We need 7 or 8 total.
    // Target: [E, N, E, N, E, N, E, E] (Example)
    // Strategy: Insert 3 times at odd indices (1, 3, 5) or spread them out.
    // Simpler: Just random insertion in the middle range.

    let needed = targetWord.length - elements.length;
    const container = elements[0].parentNode;

    while (needed > 0) {
      // Pick a random index between 1 and elements.length (avoid 0 and end if possible for style)
      // Or just distributed.
      // Let's deterministically insert at indices 1, 3, 5 to look balanced.
      // Current Length starts at 5.
      // Insert at 1 -> Length 6.
      // Insert at 3 -> Length 7.
      // Insert at 5 -> Length 8.

      // We need to pick index based on CURRENT elements array state.
      // Use a modulo or simply random in range [1, length-1].
      const insertIndex = 1 + Math.floor(Math.random() * (elements.length - 1));

      const el = document.createElement("div");
      el.className = "victory-code-cell glitching spawn-in";
      el.textContent = chars[Math.floor(Math.random() * chars.length)];

      // Insert into DOM
      const refNode = elements[insertIndex];
      container.insertBefore(el, refNode);

      // Update Array
      elements.splice(insertIndex, 0, el);

      needed--;
    }

    // 3. Start resolving sequence shortly after spawn
    startResolving(elements, targetWord, chars);
  }, 800);
}

function startResolving(elements, targetWord, chars) {
  let iterations = 0;

  const interval = setInterval(() => {
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

        el.textContent = targetWord[indexToResolve];
        el.setAttribute("data-content", targetWord[indexToResolve]); // For CSS Glow Overlay

        // Mobile vibration for impact
        navigator.vibrate?.(50);
      } else {
        // Done!
        clearInterval(interval);
        finalizeVictory();
      }
    }

    iterations++;
  }, 50); // Slightly faster scramble
}

function finalizeVictory() {
  console.log("Victory Animation Complete");
  // Ensure "Game Complete" state is saved
  gameManager.updateProgress("code", { completed: true });
}

function updateStatusDisplay() {
  // Optional: Update some UI to show "Level X"
  // Reusing the header or subtitle
}
