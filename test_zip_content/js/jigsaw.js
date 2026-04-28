import { CONFIG } from "./config.js?v=1.4.10";
import { gameManager } from "./game-manager.js?v=1.4.10";
import { translations } from "./translations.js?v=1.4.10";
import { transitionToSudoku } from "./sudoku.js?v=1.4.10";
import { getChunksFromBoard, createMiniGrid } from "./memory.js?v=1.4.10";
import { getConflicts } from "./sudoku-logic.js?v=1.4.10";
import { getCurrentLang } from "./i18n.js?v=1.4.10";
import { showToast, updateLevelTitle, updateGameHelp } from "./ui.js?v=1.4.10";
import { isAtGameRoute } from "./utils/route-utils.js?v=1.4.10";

// DOM Elements Reference
let boardContainer;
let collectedLeft;
let collectedRight;
let memorySection;

// State
let selectedPieceElement = null;
let dragClone = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
// Deferred Drag State
let potentialDragTarget = null;
let dragStartX = 0;
let dragStartY = 0;
let isDragging = false; // v1.6.8: Protect click handlers after drag
const DRAG_THRESHOLD = 5; // px
let undoStack = [];
let redoStack = [];
let initialJigsawState = null;
let isJigsawInitialized = false;

// Long Press for Locking
let longPressTimer = null;
const LONG_PRESS_DURATION = 600; // ms

export function initJigsaw(elements) {
  if (isJigsawInitialized) return;
  isJigsawInitialized = true;

  boardContainer = elements.boardContainer;
  collectedLeft = elements.collectedLeft;
  collectedRight = elements.collectedRight;
  memorySection = elements.memorySection;

  // Initialize Drag & Drop
  initDragAndDrop();

  // Initialize Reset Button
  const btnReset = document.getElementById("btn-jigsaw-reset");
  if (btnReset) {
    btnReset.addEventListener("click", (e) => {
      if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;
      e.preventDefault();
      e.stopPropagation();
      resetJigsaw();
    });
  }

  const btnUndo = document.getElementById("btn-jigsaw-undo");
  if (btnUndo) {
    btnUndo.addEventListener("click", (e) => {
      if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;
      e.preventDefault();
      e.stopPropagation();
      undo();
    });
  }

  const btnRedo = document.getElementById("btn-jigsaw-redo");
  if (btnRedo) {
    btnRedo.addEventListener("click", () => {
      if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;
      redo();
    });
  }

  // Initialize resizing listener for Jigsaw pieces
  window.addEventListener("resize", () => {
    fitCollectedPieces();
  });

  // Global click listener for deselection
  document.addEventListener("click", (e) => {
    if (!selectedPieceElement) return;

    // Check if we clicked "empty" space (not a piece or board slot)
    const isGameElement = e.target.closest(
      ".collected-piece, .sudoku-chunk-slot",
    );
    if (!isGameElement) {
      deselectPiece();
    }
  });
}

// =========================================
// Animation Utilities (FLIP Technique)
// =========================================
/**
 * Animates an element from a starting position (rect) to its current DOM position.
 */
function animateMove(element, fromRect, duration = 300) {
  if (!element || !fromRect) return;

  const toRect = element.getBoundingClientRect();
  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top - toRect.top;

  // Only animate if there is a significant move
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

  // Invert
  element.style.transition = "none";
  element.style.transform = `translate(${dx}px, ${dy}px)`;
  element.style.zIndex = "2000"; // Ensure it stays on top during animation

  // Force reflow
  void element.offsetWidth;

  // Play
  element.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
  element.style.transform = "translate(0, 0)";

  // Cleanup
  setTimeout(() => {
    element.style.transition = "";
    element.style.transform = "";
    element.style.zIndex = "";
  }, duration);
}

// =========================================
// Jigsaw Logic
// =========================================

export function createPanelPlaceholders() {
  if (!collectedLeft || !collectedRight) return;

  collectedLeft.innerHTML = "";
  collectedRight.innerHTML = "";

  // Left Panel: Generic Placeholders
  for (let i = 0; i < 4; i++) {
    createPlaceholder(collectedLeft, null);
  }

  // Right Panel: Generic Placeholders
  for (let i = 0; i < 4; i++) {
    createPlaceholder(collectedRight, null);
  }

  fitCollectedPieces();
}

function createPlaceholder(container, index) {
  const p = document.createElement("div");
  p.classList.add("collected-piece", "placeholder");

  // Attach selection listener immediately
  p.addEventListener("click", () => handlePieceSelect(p));

  container.appendChild(p);
}

export function placeInPanel(chunkIndex) {
  // v1.9.9: Resilience Guard
  if (isNaN(parseInt(chunkIndex))) {
    console.warn(
      `[Jigsaw] Attempted to place invalid chunkIndex: ${chunkIndex}. Aborting.`,
    );
    return;
  }

  const allPlaceholders = document.querySelectorAll(
    ".collected-piece.placeholder",
  );

  // IDEMPOTENCY CHECK: Don't spawn if already exists in panel or board
  // We use a more specific selector to avoid matching pieces currently visible on Memory Cards
  const exists = Array.from(
    document.querySelectorAll(
      ".sudoku-chunk-slot .mini-sudoku-grid, .collected-piece .mini-sudoku-grid",
    ),
  ).some((el) => el.dataset.chunkIndex == chunkIndex);

  if (exists) {
    console.log(`[Jigsaw] Piece ${chunkIndex} already exists. Skipping spawn.`);
    return;
  }

  const available = Array.from(allPlaceholders).find((p) => !p.hasChildNodes());

  if (!available) {
    console.error(`No available placeholder for chunk ${chunkIndex}!`);
    return;
  }

  // Assign Identity NOW
  const placeholder = available;
  placeholder.dataset.chunkIndex = chunkIndex;

  const state = gameManager.getState();
  const chunkData = state.data.chunks[chunkIndex];

  // "Hydrate" the placeholder
  placeholder.innerHTML = "";
  placeholder.appendChild(createMiniGrid(chunkData, chunkIndex));

  placeholder.classList.remove("placeholder");
  placeholder.classList.add("spawn-anim");

  fitCollectedPieces();
}

export function fitCollectedPieces() {
  if (!memorySection || memorySection.classList.contains("hidden")) return;
  const wrapper = document.querySelector(".collected-wrapper");
  const pieces = document.querySelectorAll(".collected-piece");
  if (!wrapper || !collectedLeft || !collectedRight) return;

  // DESKTOP RESET: Trust CSS > 768px (except for laptop specific override handled in CSS)
  if (window.innerWidth > 768) {
    // Preserve critical transition styles during mode switch
    const preserveStyles = (el) => {
      if (!el) return null;
      return {
        vt: el.style.viewTransitionName,
        tr: el.style.transition,
      };
    };

    const restoreStyles = (el, saved) => {
      if (!el || !saved) return;
      if (saved.vt) el.style.viewTransitionName = saved.vt;
      if (saved.tr) el.style.transition = saved.tr;
    };

    const wrapperSaved = preserveStyles(wrapper);
    const leftSaved = preserveStyles(collectedLeft);
    const rightSaved = preserveStyles(collectedRight);

    wrapper.style.cssText = "";
    collectedLeft.style.cssText = "";
    collectedRight.style.cssText = "";

    restoreStyles(wrapper, wrapperSaved);
    restoreStyles(collectedLeft, leftSaved);
    restoreStyles(collectedRight, rightSaved);

    pieces.forEach((p) => {
      const vtName = p.style.viewTransitionName;
      const trNorm = p.style.transition;
      p.style.cssText = "";
      if (vtName) p.style.viewTransitionName = vtName;
      if (trNorm) p.style.transition = trNorm;
    });
    return;
  }

  const isJigsaw =
    memorySection && memorySection.classList.contains("jigsaw-mode");
  const config = getCollectedPieceSize(isJigsaw);
  if (!config) return;

  const { size, isOneRow, gap } = config;

  // Apply Element Styles in a micro-task or next frame to ensure layout stabilizes
  // This prevents pieces from "flying in" from the container origin (0,0)
  const applyStyles = () => {
    pieces.forEach((p) => {
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.fontSize = `${size * 0.5}px`;
      p.style.margin = `${gap / 2}px`;
    });
  };

  // Immediate call to ensure sync with Jigsaw Mode class addition
  applyStyles();

  // Apply Container Layout
  // Use the same height factor as getCollectedPieceSize for layout consistency
  // Apply Container Layout
  // Use the exact same dimensioning as the CSS (--v-budget: 50vw) for stability
  let zoneHeight;
  if (isJigsaw) {
    zoneHeight = window.innerWidth * 0.5; /* 50vw */
  } else {
    zoneHeight =
      (window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight) * 0.13;
  }
  const rowWidth = (size + gap) * 4;

  if (isOneRow) {
    wrapper.style.flexDirection = "row";
    wrapper.style.height = `${zoneHeight}px`;
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";

    collectedLeft.style.width = `${rowWidth}px`;
    collectedLeft.style.height = "100%";
    collectedLeft.style.flexDirection = "row"; // FORCE horizontal
    collectedLeft.style.flexWrap = "nowrap";
    collectedLeft.style.justifyContent = "flex-start";
    collectedLeft.style.display = "flex";

    collectedRight.style.width = `${rowWidth}px`;
    collectedRight.style.height = "100%";
    collectedRight.style.flexDirection = "row"; // FORCE horizontal
    collectedRight.style.flexWrap = "nowrap";
    collectedRight.style.justifyContent = "flex-start";
    collectedRight.style.display = "flex";
  } else {
    wrapper.style.flexDirection = "column";
    wrapper.style.height = `${zoneHeight}px`;
    wrapper.style.justifyContent = "center";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "2px"; // Keep rows close

    collectedLeft.style.width = `${rowWidth}px`;
    collectedLeft.style.height = "auto";
    collectedLeft.style.flexDirection = "row"; // FORCE horizontal
    collectedLeft.style.flexWrap = "nowrap";
    collectedLeft.style.justifyContent = "flex-start";
    collectedLeft.style.display = "flex";

    collectedRight.style.width = `${rowWidth}px`;
    collectedRight.style.height = "auto";
    collectedRight.style.flexDirection = "row"; // FORCE horizontal
    collectedRight.style.flexWrap = "nowrap";
    collectedRight.style.justifyContent = "flex-start";
    collectedRight.style.display = "flex";
  }
}

function getCollectedPieceSize(isJigsaw = false) {
  if (window.innerWidth > 768) return null;

  // Increase height factor in Jigsaw mode to use card space
  // Increase height factor in Jigsaw mode to use card space matching CSS limits
  const containerWidth = window.innerWidth;
  let zoneHeight;
  if (isJigsaw) {
    zoneHeight = containerWidth * 0.5; // Sync with CSS 50vw
  } else {
    zoneHeight =
      (window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight) * 0.13;
  }
  const gap = isJigsaw ? 12 : 4;
  const padding = 10;

  // OPTION A: 2 Rows -> Add safety buffer (-4px)
  const hSizeA = zoneHeight / 2 - 2 * gap - 2;
  const wSizeA = (containerWidth - padding - 5 * gap) / 4;
  const sizeA = Math.min(hSizeA, wSizeA);

  // OPTION B: 1 Row -> Add safety buffer (-4px)
  const hSizeB = zoneHeight - 2 * gap - 4;
  const wSizeB = (containerWidth / 2 - padding - 5 * gap) / 4;
  const sizeB = Math.min(hSizeB, wSizeB);

  // Pick Winner
  let finalSize, isOneRow;
  if (sizeB >= sizeA) {
    finalSize = sizeB;
    isOneRow = true;
  } else {
    finalSize = sizeA;
    isOneRow = false;
  }

  return { size: finalSize, isOneRow, gap };
}

export function handlePieceSelect(pieceElement) {
  // v1.6.8: Guard against ghost clicks after drag
  if (isDragging) return;

  // GUARD: Only in Jigsaw Mode
  if (!memorySection || !memorySection.classList.contains("jigsaw-mode")) return;

  // v1.9.9c: Lock interaction if transitioning or complete
  if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;

  // If we click the same piece, deselect
  if (selectedPieceElement === pieceElement) {
    deselectPiece();
    return;
  }

  // If a piece is already selected, try to Interact (Move/Swap)
  if (selectedPieceElement) {
    const source = selectedPieceElement;
    const target = pieceElement;
    const isTargetEmpty = target.classList.contains("placeholder");
    const isSourceBoard = source.classList.contains("sudoku-chunk-slot");
    const isTargetBoard = target.classList.contains("sudoku-chunk-slot");

    // --- CASE: Panel to Panel -> Change Selection OR Move to Empty ---
    if (!isSourceBoard && !isTargetBoard) {
      if (!isTargetEmpty) {
        // Target is an occupied slot in panel -> Just switch selection
        deselectPiece();
        handlePieceSelect(target);
        return;
      }
      // Target is an empty placeholder in panel -> Proceed to MOVE logic below
    }

    // v1.6.8: Protect locked pieces
    if (
      source.classList.contains("user-locked") ||
      target.classList.contains("user-locked")
    ) {
      console.log("[Jigsaw] Interaction blocked: Piece is locked.");
      deselectPiece();
      return;
    }

    // --- CASE: Interactions involving the board (Source or Target) ---
    // Or Panel to Empty Panel slot (continues here)
    const sourceContent = source.querySelector(".mini-sudoku-grid");
    const targetContent = target.querySelector(".mini-sudoku-grid"); // may be null

    if (!sourceContent) {
      // Should not happen if selected, but safe fail
      deselectPiece();
      return;
    }

    // --- LOGIC: SWAP or MOVE ---
    const sourceRect = sourceContent.getBoundingClientRect();
    const targetRect = targetContent
      ? targetContent.getBoundingClientRect()
      : target.getBoundingClientRect();

    // If Target is Occupied -> SWAP
    if (!isTargetEmpty && targetContent) {
      // SWAP
      saveStateToUndo();
      // Move Target Content -> Source
      source.innerHTML = "";
      source.appendChild(targetContent);

      // Update Source State
      if (isSourceBoard) {
        source.classList.add("filled");
        targetContent.style.width = "100%";
        targetContent.style.height = "100%";
      } else {
        // Source is Panel
        source.classList.remove("placeholder", "filled");
        source.classList.add("collected-piece");
        source.dataset.chunkIndex = targetContent.dataset.chunkIndex; // ID Transfer
      }

      // Move Source Content -> Target
      target.innerHTML = "";
      target.appendChild(sourceContent);
      // Target is Panel
      target.classList.remove("placeholder");
      target.classList.add("collected-piece");
      target.dataset.chunkIndex = sourceContent.dataset.chunkIndex; // ID Transfer

      // Resize if needed
      fitCollectedPieces();

      // ANIMATE
      animateMove(sourceContent, sourceRect);
      animateMove(targetContent, targetRect);

      checkBoardCompletion(); // Validate board (clear errors if any)
      deselectPiece();
      return;
    }
    // If Target is Empty -> MOVE
    else {
      saveStateToUndo();
      target.appendChild(sourceContent);

      // Update Target State (Panel)
      target.classList.remove("placeholder");
      target.classList.add("collected-piece");
      target.dataset.chunkIndex = sourceContent.dataset.chunkIndex;

      // Update Source State (Empty it)
      source.innerHTML = "";
      if (isSourceBoard) {
        source.classList.remove("filled");
      } else {
        source.classList.add("placeholder");
        delete source.dataset.chunkIndex;
      }

      fitCollectedPieces();

      // ANIMATE
      animateMove(sourceContent, sourceRect);

      checkBoardCompletion(); // Validate board (clear errors if any)
      deselectPiece();
      return;
    }
  }

  // Select new (Only if nothing selected previously fell through, or first selection)
  // If we click a placeholder without a selected source, ignore it.
  if (pieceElement.classList.contains("placeholder")) return;

  selectedPieceElement = pieceElement;
  selectedPieceElement.classList.add("selected");
  if (memorySection) memorySection.classList.add("selection-active");
}

function deselectPiece() {
  if (selectedPieceElement) {
    selectedPieceElement.classList.remove("selected");
    selectedPieceElement = null;
  }
  if (memorySection) memorySection.classList.remove("selection-active");
}

// Updated V2: Handles Panel Pieces AND Board Pieces
export function handleSlotClick_v2(slotIndex) {
  // v1.6.8: Guard against ghost clicks after drag
  if (isDragging) return;

  // GUARD: Only in Jigsaw Mode
  if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;

  const slot = boardContainer.querySelector(`[data-slot-index="${slotIndex}"]`);
  if (!slot) return;

  // CASE 1: Interact with Selected Piece (Move or Swap)
  if (selectedPieceElement) {
    // Ignore locked center piece interaction as Target
    if (slotIndex === 4) {
      // Allow selecting it? No, users can't select locked piece.
      // Allow dropping on it? No.
      console.warn("Center piece is locked.");
      return;
    }

    // Ignore self-click
    if (selectedPieceElement === slot) {
      deselectPiece();
      return;
    }

    // v1.6.8: Protect locked pieces
    if (
      selectedPieceElement.classList.contains("user-locked") ||
      slot.classList.contains("user-locked")
    ) {
      console.log("[Jigsaw] Interaction blocked: Piece is locked.");
      deselectPiece();
      return;
    }

    const source = selectedPieceElement;
    const target = slot;
    const isTargetFilled = target.classList.contains("filled");
    const isSourceBoard = source.classList.contains("sudoku-chunk-slot");

    const sourceContent = source.querySelector(".mini-sudoku-grid");
    const targetContent = target.querySelector(".mini-sudoku-grid"); // may be null

    if (!sourceContent) {
      deselectPiece();
      return;
    }

    // Safety check for Panel Source chunks
    if (
      !isSourceBoard &&
      !source.dataset.chunkIndex &&
      source.dataset.chunkIndex !== "0"
    ) {
      // Invalid panel source?
      // console.warn("Panel source missing ID");
      // might be just empty placeholder selected by accident logic?
    }

    // --- LOGIC: SWAP or MOVE ---
    const sourceRect = sourceContent.getBoundingClientRect();
    const targetRect = targetContent
      ? targetContent.getBoundingClientRect()
      : target.getBoundingClientRect();

    if (isTargetFilled && targetContent) {
      // SWAP
      saveStateToUndo();
      // Move Target -> Source
      source.innerHTML = "";
      source.appendChild(targetContent);

      if (isSourceBoard) {
        source.classList.add("filled");
      } else {
        // Source is Panel
        source.classList.remove("placeholder", "filled");
        source.classList.add("collected-piece");
        source.dataset.chunkIndex = targetContent.dataset.chunkIndex; // ID Transfer
        // Reset Style for Panel
        targetContent.style.width = "";
        targetContent.style.height = "";
      }

      // Move Source -> Target
      target.innerHTML = "";
      target.appendChild(sourceContent);
      target.classList.add("filled");
      // Reset Style for Board (Fill Slot)
      sourceContent.style.width = "100%";
      sourceContent.style.height = "100%";

      fitCollectedPieces(); // Update Panel

      // ANIMATE
      animateMove(sourceContent, sourceRect);
      animateMove(targetContent, targetRect);

      deselectPiece();
    } else {
      // MOVE (Target Empty)
      saveStateToUndo();
      target.innerHTML = "";
      target.appendChild(sourceContent);
      target.classList.add("filled");
      // Reset Style for Board
      sourceContent.style.width = "100%";
      sourceContent.style.height = "100%";

      // Clear Source
      source.innerHTML = "";
      if (isSourceBoard) {
        source.classList.remove("filled");
      } else {
        // Panel
        source.classList.add("placeholder");
        delete source.dataset.chunkIndex;
      }

      fitCollectedPieces();

      // ANIMATE
      animateMove(sourceContent, sourceRect);

      deselectPiece();
    }

    // Check Board State after move/swap
    checkBoardCompletion();

    return;
  }

  // CASE 2: No piece selected -> Select this slot if it has content
  else {
    if (slot.classList.contains("filled")) {
      // Ignore locked center piece
      if (slotIndex === 4) return;

      handlePieceSelect(slot);
    }
  }
}

export function transitionToJigsaw() {
  // CRITICAL GUARD: Do not proceed if user navigated away from #game
  if (!memorySection || memorySection.classList.contains("hidden")) return;
  if (!isAtGameRoute()) return;

  // Reset history stacks for the new session
  undoStack = [];
  redoStack = [];
  updateHistoryButtons();

  console.log("Transitioning to Jigsaw Stage...");
  const lang = getCurrentLang();
  const t = translations[lang];

  updateLevelTitle(t.game_jigsaw || "Rompecabezas");

  // 2. Add Jigsaw Mode Class
  if (memorySection) {
    if (document.startViewTransition) {
      const leftPieces = collectedLeft.querySelectorAll(".collected-piece");
      const rightPieces = collectedRight.querySelectorAll(".collected-piece");

      // RESTORED: Assign unique VT names to track pieces during the morph
      leftPieces.forEach((p, i) => {
        p.style.viewTransitionName = `piece-left-${i}`;
      });
      rightPieces.forEach((p, i) => {
        p.style.viewTransitionName = `piece-right-${i}`;
      });

      const board = document.querySelector(".memory-board");
      if (board) board.style.viewTransitionName = "board-main";

      // OPTIMIZATION: Do not transition the layout wrapper.
      // Nesting VTs is expensive (hole punching).
      // Let the browser cross-fade the container while we morph the board/pieces.
      const gridLayout = document.querySelector(".memory-grid-layout");
      // if (gridLayout) gridLayout.style.viewTransitionName = "main-layout";

      // Animate the wrapper, not individual pieces
      const wrapper = document.querySelector(".collected-wrapper");
      // if (wrapper) wrapper.style.viewTransitionName = "wrapper-main"; // Optional, might look better without

      const transition = document.startViewTransition(() => {
        const start = performance.now();
        if (CONFIG.debugMode)
          console.log("[Perf] Start ViewTransition Callback");

        // PERFORMANCE: Reduce rendering quality during heavy transition
        document.body.classList.add("perf-optimization-active");

        // CRITICAL: Disable all CSS transitions during the DOM update phase.
        if (board) board.style.transition = "none";
        // if (gridLayout) gridLayout.style.transition = "none"; // Optimization: gridLayout VT disabled
        if (wrapper) wrapper.style.transition = "none";
        collectedLeft.style.transition = "none";
        collectedRight.style.transition = "none";

        // We still need to disable CSS transitions on pieces so they snap to new positions
        // inside the container immediately (for the VT snapshot to work right if we animated containers)
        // But since we aren't VT-animating them, standard CSS transition might be better?
        // No, let's keep them snappy for the layout change.
        document
          .querySelectorAll(".collected-piece")
          .forEach((p) => (p.style.transition = "none"));

        memorySection.classList.add("jigsaw-mode");

        // UI/Layout updates MUST happen inside the transition callback
        // v1.3.2: Use silent update during VT to avoid I/O blocking the main thread
        gameManager.updateProgress(
          "progress",
          { currentStage: "jigsaw" },
          true,
        );
        deselectPiece();

        if (CONFIG.debugMode) console.time("[Perf] fitCollectedPieces");
        fitCollectedPieces();
        if (CONFIG.debugMode) console.timeEnd("[Perf] fitCollectedPieces");

        if (CONFIG.debugMode)
          console.log(
            `[Perf] Callback Duration: ${(performance.now() - start).toFixed(2)}ms`,
          );
      });

      transition.finished.finally(() => {
        // v1.3.2: Save the state AFTER the transition is complete
        gameManager.save();
        // Restore rendering quality
        document.body.classList.remove("perf-optimization-active");

        // Clean up names and restore transition capabilities
        leftPieces.forEach((p) => (p.style.viewTransitionName = ""));
        rightPieces.forEach((p) => (p.style.viewTransitionName = ""));

        const cleanup = (el) => {
          if (el) {
            el.style.viewTransitionName = "";
            el.style.transition = "";
          }
        };

        cleanup(board);
        cleanup(gridLayout);
        // cleanup(wrapper);

        document
          .querySelectorAll(".collected-piece")
          .forEach((p) => (p.style.transition = ""));

        // v1.7.8: Initialize Jigsaw History AFTER transition completes
        undoStack = [];
        redoStack = [];
        saveStateToUndo();
        initialJigsawState = undoStack[0];
      });
    } else {
      memorySection.classList.add("jigsaw-mode");
      // Fallback update
      gameManager.updateProgress("progress", { currentStage: "jigsaw" });
      deselectPiece(); // Ensure clear state
      fitCollectedPieces(); // Force layout update
    }
  }

  // 3. Update Tooltip Info
  updateGameHelp("jigsaw");

  // v1.7.8: Initialize History Stack moved to transition/resume
}

// =========================================
// Drag & Drop
// =========================================
export function initDragAndDrop() {
  document.addEventListener("pointerdown", handlePointerDown, {
    passive: false,
  });
  document.addEventListener("pointermove", handlePointerMove, {
    passive: false,
  });
  document.addEventListener("pointerup", handlePointerUp, { passive: false });
}

export function handlePointerDown(e) {
  // Allow Mouse, Pen, and Touch (v1.8.0: Touch enabled for long-press locking)

  // GUARD: Only allow interaction in Jigsaw Mode
  if (!memorySection || !memorySection.classList.contains("jigsaw-mode"))
    return;

  // v1.9.9c: Lock interaction if transitioning or complete
  if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;

  const target = e.target.closest(".collected-piece, .sudoku-chunk-slot");
  if (!target) return;
  // Center locked
  if (target.dataset.slotIndex === "4") return;

  // v1.6.8: Start Long Press Timer for Locking (only on Board pieces)
  if (
    target.classList.contains("sudoku-chunk-slot") &&
    target.classList.contains("filled")
  ) {
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      togglePieceLock(target);
    }, LONG_PRESS_DURATION);
  }

  // Store Potential Drag (Only if it has content to avoid selecting empty slots)
  const isFilledBoard = target.classList.contains("sudoku-chunk-slot") && target.classList.contains("filled");
  const isFilledPanel = target.classList.contains("collected-piece") && !target.classList.contains("placeholder");

  if (isFilledBoard || isFilledPanel) {
    potentialDragTarget = target;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  }

  // Do NOT select immediately. Wait for Click (handled by click listeners) OR Drag (handled by pointermove).
}

export function handlePointerMove(e) {
  // 1. Check if we need to START dragging
  if (potentialDragTarget && !dragClone) {
    const dx = Math.abs(e.clientX - dragStartX);
    const dy = Math.abs(e.clientY - dragStartY);

    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      // START DRAG
      clearTimeout(longPressTimer); // Cancel lock if moving

      // v1.8.3: Only Mouse or Pen can drag in Jigsaw (Touch is for scroll/long-press only)
      if (e.pointerType === "touch") {
        potentialDragTarget = null;
        return;
      }

      // Protect locked pieces from dragging
      if (potentialDragTarget.classList.contains("user-locked")) {
        potentialDragTarget = null;
        return;
      }

      isDragging = true;
      const target = potentialDragTarget;

      // Now we take over interactions
      // e.preventDefault(); (Will do in next frame or now)

      // Deselect previous (Drag overrides Click-Swap intent)
      deselectPiece();
      selectedPieceElement = target;
      selectedPieceElement.classList.add("selected");
      if (memorySection) memorySection.classList.add("selection-active");
      selectedPieceElement.classList.add("dragging-source");

      // Init Clone
      const content = target.querySelector(".mini-sudoku-grid");
      if (!content) {
        potentialDragTarget = null;
        return;
      }

      // Wrap the clone in a container to maintain Container Query context
      const dragWrapper = document.createElement("div");
      dragWrapper.className = "dragging-clone";

      dragClone = content.cloneNode(true);
      dragClone.classList.add("mini-sudoku-grid"); // Keep original class for styles
      dragWrapper.appendChild(dragClone);

      // Normalize Size: Always use the size of a Panel Piece
      const referencePiece =
        document.querySelector(".collected-piece") || target;
      const refRect = referencePiece.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      // 1. Start with ORIGINAL size
      dragWrapper.style.width = `${targetRect.width}px`;
      dragWrapper.style.height = `${targetRect.height}px`;
      dragWrapper.style.left = `${targetRect.left}px`;
      dragWrapper.style.top = `${targetRect.top}px`;

      document.body.appendChild(dragWrapper);

      // 2. Force DOM Reflow
      void dragWrapper.offsetWidth;

      // 3. Set FINAL size (animates due to CSS transition)
      dragWrapper.style.width = `${refRect.width}px`;
      dragWrapper.style.height = `${refRect.height}px`;

      // Assign to global dragClone for position updates (but it's the wrapper now)
      dragClone = dragWrapper;

      // Hide the original content to mimic "lifting"
      content.style.opacity = "0";

      // Center the clone on the cursor for better feel when resizing
      dragOffsetX = refRect.width / 2;
      dragOffsetY = refRect.height / 2;

      updateDragPosition(e.clientX, e.clientY);
    }
  }

  // 2. Handle Active Drag
  if (!dragClone) return;

  e.preventDefault(); // Stop native selection/scrolling
  updateDragPosition(e.clientX, e.clientY);

  // Highlight drop targets
  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  const dropTarget = elements.find(
    (el) =>
      (el.classList.contains("sudoku-chunk-slot") ||
        el.classList.contains("collected-piece")) &&
      el.dataset.slotIndex !== "4" &&
      !el.classList.contains("user-locked"), // v1.7.4: No hover on locked slots
  );

  document
    .querySelectorAll(".drop-hover")
    .forEach((el) => el.classList.remove("drop-hover"));
  if (dropTarget) {
    dropTarget.classList.add("drop-hover");
  }
}

export function handlePointerUp(e) {
  clearTimeout(longPressTimer); // Cancel lock timer

  // Clear Potential
  potentialDragTarget = null;

  if (!dragClone) {
    // It was a Click!
    // Allow native click event to fire.
    return;
  }

  // It was a Drag!
  e.preventDefault(); // Stop click from firing on drop target (optional, but good practice)

  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  const dropTarget = elements.find(
    (el) =>
      (el.classList.contains("sudoku-chunk-slot") ||
        el.classList.contains("collected-piece")) &&
      el.dataset.slotIndex !== "4" &&
      !el.classList.contains("user-locked"), // v1.7.4: Cannot drop on locked slots
  );

  // Restore Opacity (Always)
  const sourceContent = selectedPieceElement.querySelector(".mini-sudoku-grid");
  if (sourceContent) sourceContent.style.opacity = "";

  if (dropTarget && dropTarget !== selectedPieceElement) {
    // Execute Move/Swap
    saveStateToUndo();
    // 1. Get Source Content (from dragClone or source)
    // Source is `selectedPieceElement`

    // sourceContent is already defined above
    const targetContent = dropTarget.querySelector(".mini-sudoku-grid"); // Might be null
    const targetRect = targetContent
      ? targetContent.getBoundingClientRect()
      : null;

    if (sourceContent) {
      // Move Source -> Target
      dropTarget.innerHTML = "";
      dropTarget.appendChild(sourceContent);
      dropTarget.classList.remove("placeholder", "filled");
      dropTarget.classList.add("filled"); // It has content now

      if (targetContent) {
        // Swap: Target Content -> Source
        selectedPieceElement.innerHTML = "";
        selectedPieceElement.appendChild(targetContent);
        selectedPieceElement.classList.add("filled");
        selectedPieceElement.classList.remove("placeholder");

        // ANIMATE ONLY the piece that was NOT being dragged
        animateMove(targetContent, targetRect);
      } else {
        // Target empty: Source becomes empty
        if (selectedPieceElement.classList.contains("sudoku-chunk-slot")) {
          selectedPieceElement.classList.remove("filled");
        } else {
          selectedPieceElement.classList.add("placeholder");
          delete selectedPieceElement.dataset.chunkIndex; // Remove ID
        }
      }

      // If dropping INTO Panel
      if (dropTarget.classList.contains("collected-piece")) {
        const newContent = dropTarget.querySelector(".mini-sudoku-grid");
        if (newContent && newContent.dataset.chunkIndex) {
          dropTarget.dataset.chunkIndex = newContent.dataset.chunkIndex;
        }
      }

      fitCollectedPieces();
    }

    // Check Board State after drop
    checkBoardCompletion();
  } else {
    // FAILED DROP (Locked Slot or Outside)
    // Check if we were over a LOCKED slot specifically
    const anySlot = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find(
        (el) =>
          (el.classList.contains("sudoku-chunk-slot") ||
            el.classList.contains("collected-piece")) &&
          el.dataset.slotIndex !== "4",
      );

    if (
      anySlot &&
      (anySlot.classList.contains("user-locked") ||
        anySlot === selectedPieceElement ||
        anySlot.dataset.slotIndex === "4")
    ) {
      // Case A: Dropped on self, locked slot, or center piece -> Return to Origin
      console.log(
        "[Jigsaw] Dropped on self, locked, or center. Returning to origin.",
      );
    } else {
      // Check if drop occurred within the board's bounding box
      const boardRect = boardContainer.getBoundingClientRect();
      const isInsideBoard =
        e.clientX >= boardRect.left &&
        e.clientX <= boardRect.right &&
        e.clientY >= boardRect.top &&
        e.clientY <= boardRect.bottom;

      if (isInsideBoard) {
        // Case B: Dropped on board dividers/lines -> Return to Origin
        console.log("[Jigsaw] Dropped on board dividers. Returning to origin.");
      } else if (dragClone) {
        // Case C: Dropped truly outside -> Send to Panel (if not already there)
        console.log("[Jigsaw] Dropped outside board. Sending to panel.");
        const allPlaceholders = document.querySelectorAll(
          ".collected-piece.placeholder",
        );
        const available = Array.from(allPlaceholders).find(
          (p) => !p.hasChildNodes(),
        );

        if (
          available &&
          sourceContent &&
          !selectedPieceElement.classList.contains("collected-piece")
        ) {
          saveStateToUndo();
          available.innerHTML = "";
          available.appendChild(sourceContent);
          available.classList.remove("placeholder");
          available.classList.add("filled");
          available.dataset.chunkIndex = sourceContent.dataset.chunkIndex;

          // Clear Board Slot
          selectedPieceElement.innerHTML = "";
          selectedPieceElement.classList.remove("filled");

          fitCollectedPieces();
          checkBoardCompletion();
        }
      }
    }
  }

  // Cleanup
  if (dragClone) {
    dragClone.remove();
    dragClone = null;
  }
  if (selectedPieceElement)
    selectedPieceElement.classList.remove("dragging-source");
  document
    .querySelectorAll(".drop-hover")
    .forEach((el) => el.classList.remove("drop-hover"));
  deselectPiece();

  // Reset dragging state with a small delay to catch subsequent click events
  setTimeout(() => {
    isDragging = false;
  }, 100);
}

function togglePieceLock(slot) {
  if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;
  if (
    !slot ||
    !slot.classList.contains("sudoku-chunk-slot") ||
    !slot.classList.contains("filled")
  )
    return;

  // v1.7.6: Save state BEFORE toggling so we can undo the lock/unlock
  saveStateToUndo();

  const isLocked = slot.classList.toggle("user-locked");
  console.log(
    `[Jigsaw] Piece at slot ${slot.dataset.slotIndex} is now ${isLocked ? "LOCKED" : "UNLOCKED"}`,
  );

  // Feedback
  if (isLocked) {
    // Subtle vibration or flash
    slot.style.transition = "transform 0.1s";
    slot.style.transform = "scale(0.95)";
    setTimeout(() => {
      slot.style.transform = "";
      slot.style.transition = "";
    }, 100);
  }

  // Clear any active selection to prevent conflicts
  deselectPiece();
}

function updateDragPosition(x, y) {
  if (dragClone) {
    dragClone.style.left = `${x - dragOffsetX}px`;
    dragClone.style.top = `${y - dragOffsetY}px`;
  }
}

// Debug Support
export function debugJigsawPlace() {
  const chunks = 9; // 0-8
  for (let i = 0; i < chunks; i++) {
    if (i === 4) continue; // Locked center

    const slot = boardContainer.querySelector(`[data-slot-index="${i}"]`);
    if (!slot) continue;

    const currentPiece = slot.firstChild;
    let isCorrect = false;

    // Check if correct piece is already here
    if (currentPiece && currentPiece.dataset.chunkIndex == i) {
      isCorrect = true;
    }

    if (!isCorrect) {
      console.log(`Debug: Fixing slot ${i}...`);

      // 1. Find the Correct Piece
      const correctGrid = Array.from(
        document.querySelectorAll(".mini-sudoku-grid"),
      ).find((el) => el.dataset.chunkIndex == i);

      if (!correctGrid) {
        console.error("Debug: Correct piece not found!");
        return;
      }

      const correctPieceParent = correctGrid.parentElement;

      // 2. Clear destination slot if occupied
      if (slot.hasChildNodes()) {
        const wrongGrid = slot.firstChild;

        // SWAP
        correctPieceParent.appendChild(wrongGrid);
        slot.appendChild(correctGrid);

        // Fix classes for Source
        if (correctPieceParent.closest(".collected-piece")) {
          if (correctPieceParent.classList.contains("sudoku-chunk-slot")) {
            // Just swapped, all good
          } else {
            // Panel
            correctPieceParent.classList.remove("placeholder");
            correctPieceParent.classList.add("collected-piece");
            correctPieceParent.style.opacity = "";
            correctPieceParent.style.pointerEvents = "";
            correctPieceParent.style.border = "";
          }
        }
      } else {
        // Destination Empty: Just Move
        slot.appendChild(correctGrid);
        slot.classList.add("filled");

        // Fix Source
        if (correctPieceParent.classList.contains("sudoku-chunk-slot")) {
          correctPieceParent.classList.remove("filled");
        } else {
          // Panel
          correctPieceParent.classList.add("placeholder");
          correctPieceParent.style.pointerEvents = "auto";
        }
      }
      // Validate immediately and Stop (Piece by Piece)
      checkBoardCompletion();
      return;
    }
  }
  console.log("Debug: All pieces checked/fixed.");
  checkBoardCompletion();
}

// Validation Logic
export async function checkBoardCompletion() {
  // Guard 0: Prevent double-trigger logic
  const state = gameManager.getState();
  // v1.9.7: Resilience Guard
  const currentStage =
    state?.progress?.currentStage || state?.currentStage || "memory";
  if (currentStage !== "jigsaw") return;
  if (
    document
      .querySelector(".memory-board")
      ?.classList.contains("board-complete")
  )
    return;
  if (window.isGameTransitioning) return;

  // 1. Clear previous errors first
  clearBoardErrors();
  document
    .querySelectorAll(".error-slot")
    .forEach((el) => el.classList.remove("error-slot"));

  const slots = document.querySelectorAll(".sudoku-chunk-slot");
  const filledCount = document.querySelectorAll(
    ".sudoku-chunk-slot.filled",
  ).length;

  // 2. Reconstruct 9x9 Grid from DOM
  // We need to map the slots 0-8 to the grid rows/cols
  const currentBoard = Array.from({ length: 9 }, () => Array(9).fill(0));
  let reconstructionFailed = false;

  slots.forEach((slot) => {
    const sIndex = parseInt(slot.dataset.slotIndex);
    const content = slot.querySelector(".mini-sudoku-grid");

    // If empty slot, just leave 0s
    if (!content) return;

    // Identify which chunk of numbers this is.
    const chunkId = parseInt(content.dataset.chunkIndex);
    const state = gameManager.getState();
    const chunkData = state.data.chunks[chunkId]; // Use pre-calculated untransformed chunks

    if (!chunkData) {
      console.error(`[Jigsaw] Chunk data not found for ID ${chunkId}`);
      reconstructionFailed = true;
      return;
    }

    // Map this 3x3 chunk to the 9x9 board based on `sIndex` (Position)
    const startRow = Math.floor(sIndex / 3) * 3;
    const startCol = (sIndex % 3) * 3;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const val = chunkData[r][c];
        currentBoard[startRow + r][startCol + c] = val;
      }
    }
  });

  if (reconstructionFailed) return;

  // 3. Check for Conflicts (Real-time)
  const conflicts = getConflicts(currentBoard); // Returns Set of "row,col" strings

  // 4. Highlight Errors
  if (conflicts.size > 0) {
    // We need to map back from (row, col) to the DOM element (chunk -> cell)
    // There isn't a direct link, so we have to calculate it.

    // Iterate over slots again to find the cells corresponding to conflicts
    slots.forEach((slot) => {
      const sIndex = parseInt(slot.dataset.slotIndex);
      const startRow = Math.floor(sIndex / 3) * 3;
      const startCol = (sIndex % 3) * 3;

      // Check each cell in this 3x3 slot
      const miniCells = slot.querySelectorAll(".mini-cell");
      // The mini-cells are usually strictly ordered 0..8 in DOM?
      // Yes, createMiniGrid builds them in row-major order.

      miniCells.forEach((cell, idx) => {
        const rOffset = Math.floor(idx / 3);
        const cOffset = idx % 3;
        const absoluteRow = startRow + rOffset;
        const absoluteCol = startCol + cOffset;

        if (conflicts.has(`${absoluteRow},${absoluteCol}`)) {
          cell.classList.add("error-number");
        }
      });
    });

    if (boardContainer) {
      boardContainer.classList.remove("board-error");
      void boardContainer.offsetWidth;
      boardContainer.classList.add("board-error");
    }
  }

  // 5. Check Victory (Full Board AND No Conflicts)
  if (filledCount === 9 && conflicts.size === 0) {
    console.log("Jigsaw Solved! Valid Sudoku formed.");

    // Detect Variation to ensure Sudoku Phase uses correct map
    const currentChunks = [];
    slots.forEach((slot, i) => {
      const content = slot.querySelector(".mini-sudoku-grid");
      if (content) {
        currentChunks[i] = parseInt(content.dataset.chunkIndex);
      } else {
        currentChunks[i] = -1;
      }
    });

    const targets = {
      0: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      LR: [2, 1, 0, 5, 4, 3, 8, 7, 6],
      TB: [6, 7, 8, 3, 4, 5, 0, 1, 2],
      HV: [8, 7, 6, 5, 4, 3, 2, 1, 0],
    };

    let bestMatchKey = "0";
    let maxMatches = -1;

    for (const [key, target] of Object.entries(targets)) {
      let matches = 0;
      for (let i = 0; i < 9; i++) {
        if (currentChunks[i] === target[i]) matches++;
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatchKey = key;
      }
    }

    console.log(
      `Detected Variation: [${bestMatchKey}] (${maxMatches}/9 matches)`,
    );
    await gameManager.setJigsawVariation(bestMatchKey);

    // Clean errors and Add Victory Animation
    clearBoardErrors();
    if (boardContainer) {
      boardContainer.classList.add("board-complete");
    } else {
      document.querySelector(".memory-board")?.classList.add("board-complete");
    }

    // Delay advance
    window.isGameTransitioning = true;
    setTimeout(async () => {
      // Timer Transition
      gameManager.stopStageTimer();
      // v2.1.0: Atomic Advance - Advance stage (which awards points and forces cloud save)
      await gameManager.advanceStage();
      gameManager.startStageTimer("sudoku");

      transitionToSudoku();
      // release flag is handled in transitionToSudoku or after animation?
      // better to keep it true until next stage is ready.
      // But transitionToSudoku has 500ms animation.
      setTimeout(() => {
        window.isGameTransitioning = false;
      }, 1000);
    }, 600);
  }

  // SYNC STATE: Collect current board for persistence
  syncJigsawState();
  gameManager.save();
}

/**
 * Reads the Jigsaw board and updates GameManager state
 */
export function syncJigsawState() {
  const slots = Array.from(
    boardContainer.querySelectorAll(".sudoku-chunk-slot"),
  );
  const placedChunks = slots.map((slot) => {
    const content = slot.querySelector(".mini-sudoku-grid");
    return content ? parseInt(content.dataset.chunkIndex) : -1;
  });

  gameManager.updateProgress("jigsaw", { placedChunks });
}

/**
 * Resets the Jigsaw board, moving all pieces from slots back to the panel.
 */
export function resetJigsaw() {
  if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;
  if (!initialJigsawState) {
    console.warn("[Jigsaw] No initial state captured. Resetting manually.");
    // Fallback to old reset logic if needed, but initialJigsawState should be there
    return;
  }

  // First, save current state to undo stack before resetting
  saveStateToUndo();

  // Apply the initial state
  applyHistoryState(initialJigsawState);

  // Optional: show a subtle toast
  // const { translations } = await import("./translations.js?v=1.4.10");
  // const lang = getCurrentLang();
  // showToast(translations[lang].toast_jigsaw_reset || "Tablero reiniciado");
}

/**
 * Hydrates pieces into the board slots from saved state.
 */
export function resumeJigsawState() {
  if (!boardContainer) {
    console.warn(
      "[Jigsaw] boardContainer was undefined in resumeJigsawState. Attempting recovery...",
    );
    boardContainer = document.getElementById("memory-board");
  }

  // Reset history stacks when resuming
  undoStack = [];
  redoStack = [];
  updateHistoryButtons();

  const state = gameManager.getState();
  const placedChunks = state.jigsaw?.placedChunks || [];

  console.log(
    `[Jigsaw] Hydrating ${placedChunks.filter((id) => id !== -1).length} placed pieces.`,
  );

  placedChunks.forEach((chunkIndex, slotIndex) => {
    if (chunkIndex === -1) return;
    if (chunkIndex === 4) return; // Handled by Memory (Center piece)

    const slot = boardContainer.querySelector(
      `[data-slot-index="${slotIndex}"]`,
    );
    const panelItem = Array.from(
      document.querySelectorAll(".mini-sudoku-grid"),
    ).find((el) => parseInt(el.dataset.chunkIndex) === chunkIndex);

    if (slot && panelItem) {
      // Move from panel to slot
      const sourceParent = panelItem.parentElement;
      slot.innerHTML = "";
      slot.appendChild(panelItem);
      slot.classList.add("filled");

      if (sourceParent && sourceParent.classList.contains("collected-piece")) {
        sourceParent.classList.add("placeholder");
        delete sourceParent.dataset.chunkIndex;
      }
    }
  });

  // v1.9.9: Auto-Advance Protection
  // If the board is already solved upon hydration, trigger the next stage transition.
  // We use a small delay to ensure DOM is settled.
  const filledCount = document.querySelectorAll(
    ".sudoku-chunk-slot.filled",
  ).length;
  if (filledCount === 9) {
    console.log("[Jigsaw] Auto-advance triggered: Board already full.");
    setTimeout(() => {
      checkBoardCompletion();
    }, 500);
  }

  // v1.7.8: Initialize History Stack on Resume
  undoStack = [];
  redoStack = [];
  saveStateToUndo();
  initialJigsawState = undoStack[0];
  updateHistoryButtons();
}

function clearBoardErrors() {
  if (boardContainer) boardContainer.classList.remove("board-error");
  document
    .querySelectorAll(".error-number")
    .forEach((el) => el.classList.remove("error-number"));
}

// =========================================
// History Management (Undo/Redo)
// =========================================

function captureCurrentState() {
  const slots = Array.from(
    boardContainer.querySelectorAll(".sudoku-chunk-slot"),
  );
  const board = slots.map((slot) => {
    const content = slot.querySelector(".mini-sudoku-grid");
    return content ? parseInt(content.dataset.chunkIndex) : -1;
  });

  // v1.7.5: Capture locked slots indices
  const locked = slots
    .filter((slot) => slot.classList.contains("user-locked"))
    .map((slot) => parseInt(slot.dataset.slotIndex));

  const panelSlots = Array.from(document.querySelectorAll(".collected-piece"));
  const panel = panelSlots.map((slot) => {
    const content = slot.querySelector(".mini-sudoku-grid");
    return content ? parseInt(content.dataset.chunkIndex) : -1;
  });

  return { board, panel, locked };
}

let lastUndoSaveTime = 0;

function saveStateToUndo() {
  const current = captureCurrentState();
  // Avoid duplicate states
  if (
    undoStack.length > 0 &&
    JSON.stringify(undoStack[undoStack.length - 1]) === JSON.stringify(current)
  ) {
    return;
  }
  undoStack.push(current);
  // Cap history at 50 moves
  if (undoStack.length > 50) undoStack.shift();

  redoStack = []; // New action clears redo
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const btnUndo = document.getElementById("btn-jigsaw-undo");
  const btnRedo = document.getElementById("btn-jigsaw-redo");
  if (btnUndo) btnUndo.disabled = undoStack.length === 0;
  if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

function undo() {
  if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;
  if (undoStack.length === 0) return;
  const current = captureCurrentState();
  redoStack.push(current);
  const previous = undoStack.pop();
  applyHistoryState(previous);
  updateHistoryButtons();
}

function redo() {
  if (window.isGameTransitioning || boardContainer?.classList.contains("board-complete")) return;
  if (redoStack.length === 0) return;
  const current = captureCurrentState();
  undoStack.push(current);
  const next = redoStack.pop();
  applyHistoryState(next);
  updateHistoryButtons();
}

function applyHistoryState(state) {
  // v1.6.3: Non-Destructive Reconstruction
  let board = [];
  let panel = [];
  let locked = [];

  if (Array.isArray(state)) {
    board = state;
    console.warn("[Jigsaw] Legacy array state detected in history.");
  } else if (state && state.board) {
    board = state.board;
    panel = state.panel || [];
    locked = state.locked || [];
  } else {
    console.error("[Jigsaw] Invalid state format:", state);
    return;
  }

  // v1.7.9: Concurrent Execution Guard
  if (window._isApplyingHistory) return;
  window._isApplyingHistory = true;

  try {
    const lockedIndices = new Set(locked);
    const boardSlots = boardContainer.querySelectorAll(".sudoku-chunk-slot");
    const panelSlots = document.querySelectorAll(".collected-piece");
    const currentState = captureCurrentState();

    console.log("[Jigsaw] Applying history state...", { board, panel, locked });

    // v1.7.7: OPTIMIZATION - If no pieces moved, just sync the locks to avoid flicker
    const boardChanged =
      JSON.stringify(currentState.board) !== JSON.stringify(board);
    const panelChanged =
      JSON.stringify(currentState.panel) !== JSON.stringify(panel);

    if (!boardChanged && !panelChanged) {
      console.log("[Jigsaw] Quick sync: Only locks changed.");
      boardSlots.forEach((slot) => {
        const sIndex = parseInt(slot.dataset.slotIndex);
        if (lockedIndices.has(sIndex)) {
          slot.classList.add("user-locked");
        } else {
          slot.classList.remove("user-locked");
        }
      });
      return;
    }

    // v1.7.5: Sync DOM locks with state BEFORE redistribution
    boardSlots.forEach((slot) => {
      const sIndex = parseInt(slot.dataset.slotIndex);
      if (lockedIndices.has(sIndex)) {
        slot.classList.add("user-locked");
      } else {
        slot.classList.remove("user-locked");
      }
    });

    // 1. Identify what needs to move and capture positions
    const piecesToMove = new Map();
    const rectsMap = new Map();

    // Map of chunkIndex -> current parent element
    const currentPositions = new Map();
    document.querySelectorAll(".mini-sudoku-grid").forEach((p) => {
      const idx = parseInt(p.dataset.chunkIndex);
      if (idx === 4) return; // Center piece is static
      currentPositions.set(idx, p.parentElement);
    });

    // Decide what needs to change
    // We check board first
    board.forEach((targetChunkIndex, slotIndex) => {
      if (targetChunkIndex === -1 || targetChunkIndex === 4 || slotIndex === 4)
        return;

      const targetSlot = boardSlots[slotIndex];
      const currentParent = currentPositions.get(targetChunkIndex);

      if (currentParent !== targetSlot) {
        const piece = document.querySelector(
          `.mini-sudoku-grid[data-chunk-index="${targetChunkIndex}"]`,
        );
        if (piece) {
          rectsMap.set(targetChunkIndex, piece.getBoundingClientRect());
          piecesToMove.set(targetChunkIndex, { piece, target: targetSlot });
        }
      }
    });

    // Then check panel
    panel.forEach((targetChunkIndex, panelIdx) => {
      if (targetChunkIndex === -1 || targetChunkIndex === 4) return;

      const targetSlot = panelSlots[panelIdx];
      const currentParent = currentPositions.get(targetChunkIndex);

      if (currentParent !== targetSlot) {
        const piece = document.querySelector(
          `.mini-sudoku-grid[data-chunk-index="${targetChunkIndex}"]`,
        );
        if (piece) {
          rectsMap.set(targetChunkIndex, piece.getBoundingClientRect());
          piecesToMove.set(targetChunkIndex, { piece, target: targetSlot });
        }
      }
    });

    // 2. Perform the moves
    piecesToMove.forEach(({ piece, target }, chunkIndex) => {
      // Surgical Move
      if (target.classList.contains("sudoku-chunk-slot")) {
        target.innerHTML = "";
        target.appendChild(piece);
        target.classList.add("filled");
        piece.style.width = "100%";
        piece.style.height = "100%";
      } else {
        target.innerHTML = "";
        target.appendChild(piece);
        target.classList.remove("placeholder");
        target.classList.add("filled");
        target.dataset.chunkIndex = chunkIndex;
        piece.style.width = "";
        piece.style.height = "";
      }

      // Animate
      animateMove(piece, rectsMap.get(chunkIndex));
    });

    // 3. Cleanup placeholders for slots that became empty
    boardSlots.forEach((slot) => {
      const sIndex = parseInt(slot.dataset.slotIndex);
      if (sIndex === 4 || lockedIndices.has(sIndex)) return;
      if (!slot.querySelector(".mini-sudoku-grid")) {
        slot.classList.remove("filled");
      }
    });

    panelSlots.forEach((slot) => {
      if (!slot.querySelector(".mini-sudoku-grid")) {
        slot.classList.add("placeholder");
        delete slot.dataset.chunkIndex;
      }
    });

    fitCollectedPieces();
    checkBoardCompletion();
    syncJigsawState();
    gameManager.save();
  } finally {
    window._isApplyingHistory = false;
  }
}
