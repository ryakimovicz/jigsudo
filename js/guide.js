/* Guide and Tutorial Module for Jigsudo */
import { translations } from "./translations.js";
import { getCurrentLang } from "./i18n.js";

let currentTutorialStage = 1;
let tutorialState = null;

// Drag & Drop State
let selectedPieceElement = null;
let dragClone = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let potentialDragTarget = null;
let dragStartX = 0;
let dragStartY = 0;
const DRAG_THRESHOLD = 5;

// Sudoku Tutorial State
let selectedCell = null;
let tutorialPencilMode = false;
let undoStack = [];
let lockedNumber = null;

export function initGuide() {
  setupRouting();
  setupTutorialListeners();
  setupSidebarConnection();
  initTutorialDragAndDrop();
}

function setupSidebarConnection() {
  const btnHowTo = document.getElementById("nav-how-to");
  if (btnHowTo) {
    btnHowTo.addEventListener("click", () => {
      window.location.hash = "#guide";
    });
  }
}

// function setupTabSwitching() { ... } // Removed

function setupRouting() {
  window.addEventListener("hashchange", handleGuideRouting);
  handleGuideRouting();

  // Physical Keyboard Support for Tutorial
  document.addEventListener("keydown", (e) => {
    if (window.location.hash !== "#guide") return;
    if (currentTutorialStage !== 3) return; // Only for Sudoku stage

    const key = e.key;

    // Numbers 1-9
    if (key >= "1" && key <= "9") {
      handleTutorialNumberInput(key);
      return;
    }

    // Backspace / Delete
    if (key === "Backspace" || key === "Delete") {
      clearTutorialSelectedCell();
      return;
    }

    // Escape -> Deselect
    if (key === "Escape") {
      deselectTutorialCell();
      return;
    }

    // Shortcuts
    const lowerKey = key.toLowerCase();
    if (lowerKey === "w" || lowerKey === "p" || lowerKey === "n") {
      toggleTutorialPencilMode();
    } else if (lowerKey === "q") {
      handleTutorialUndo();
    } else if (lowerKey === "e") {
      clearTutorialSelectedCell();
    }
  });

  // Global Click Listener for Tutorial Deselection (Parity)
  document.addEventListener("click", (e) => {
    if (window.location.hash !== "#guide") return;
    if (currentTutorialStage !== 3) return;

    const isControl = e.target.closest(".tutorial-sudoku-controls");
    const isBoard = e.target.closest("#tutorial-sudoku-grid");
    const isGenericNav = e.target.closest(".tutorial-nav");

    if (!isControl && !isBoard && !isGenericNav) {
      if (lockedNumber) unlockTutorialNumber();
      deselectTutorialCell();
      highlightSimilarTutorialCells(null);
    }
  });
}

function handleGuideRouting() {
  if (window.location.hash === "#guide") {
    showGuide();
  } else {
    // Hide guide if we are moving to any other state
    const guideSection = document.getElementById("guide-section");
    if (guideSection && !guideSection.classList.contains("hidden")) {
      hideGuide();
    }
  }
}

function showGuide() {
  // Hide other MAIN functional sections and the menu container
  // We avoid hiding ALL sections because some (like rankings) are nested inside the menu
  const sectionsToHide = [
    "#game-section",
    "#profile-section",
    "#history-section",
  ];
  sectionsToHide.forEach((selector) => {
    document.querySelector(selector)?.classList.add("hidden");
  });
  document.getElementById("menu-content")?.classList.add("hidden");

  const guideSection = document.getElementById("guide-section");
  if (guideSection) {
    guideSection.classList.remove("hidden");
  }
  document.body.classList.add("guide-active");
  document.body.classList.remove("home-active");

  updateGuideSidebarStatus();
  startTutorial();
}

function hideGuide() {
  const guideSection = document.getElementById("guide-section");
  if (guideSection) guideSection.classList.add("hidden");
  document.body.classList.remove("guide-active");

  const hash = window.location.hash;
  const isInternalRouting =
    hash === "#profile" || hash === "#history" || hash === "#game";

  // Only restore home if we're not heading to another section
  if (!isInternalRouting) {
    document.body.classList.add("home-active");
    const menuContent = document.getElementById("menu-content");
    if (menuContent) menuContent.classList.remove("hidden");
  }

  updateGuideSidebarStatus();
}

function updateGuideSidebarStatus() {
  const isGuide = window.location.hash === "#guide";
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.remove("active");
    if (isGuide && btn.id === "nav-how-to") btn.classList.add("active");
  });
}

function setupTutorialListeners() {
  const btnClose = document.getElementById("btn-guide-close");
  if (btnClose) btnClose.addEventListener("click", hideGuide);

  const btnStart = document.getElementById("btn-start-tutorial");
  if (btnStart) btnStart.addEventListener("click", startTutorial);

  const btnPrev = document.getElementById("btn-tutorial-prev");
  if (btnPrev) {
    btnPrev.onclick = () => {
      if (currentTutorialStage > 1) loadStage(currentTutorialStage - 1);
    };
  }

  const btnNext = document.getElementById("btn-tutorial-next");
  if (btnNext) {
    btnNext.onclick = () => {
      if (currentTutorialStage < 6) loadStage(currentTutorialStage + 1);
    };
  }
}

function startTutorial() {
  document.getElementById("tutorial-game-area").classList.remove("hidden");

  currentTutorialStage = 1;
  initTutorialState();
  loadStage(1);
}

function initTutorialState() {
  const board = [
    [8, 9, 5, 6, 3, 1, 2, 4, 7],
    [1, 4, 3, 2, 5, 7, 9, 6, 8],
    [7, 6, 2, 4, 9, 8, 3, 1, 5],
    [2, 3, 6, 9, 1, 5, 7, 8, 4],
    [4, 7, 1, 3, 8, 2, 5, 9, 6],
    [9, 5, 8, 7, 4, 6, 1, 2, 3],
    [3, 8, 7, 1, 2, 4, 6, 5, 9],
    [6, 1, 4, 5, 7, 9, 8, 3, 2],
    [5, 2, 9, 8, 6, 3, 4, 7, 1],
  ];

  tutorialState = {
    solution: board,
    emptyCells: [
      { r: 7, c: 1, val: 1 },
      { r: 2, c: 7, val: 1 },
      { r: 3, c: 0, val: 2 },
      { r: 4, c: 5, val: 2 },
      { r: 3, c: 1, val: 3 },
      { r: 8, c: 5, val: 3 },
      { r: 6, c: 5, val: 4 },
      { r: 1, c: 1, val: 4 },
      { r: 1, c: 4, val: 5 },
      { r: 8, c: 0, val: 5 },
      { r: 7, c: 0, val: 6 },
      { r: 4, c: 8, val: 6 },
      { r: 0, c: 8, val: 7 },
      { r: 7, c: 4, val: 7 },
      { r: 7, c: 6, val: 8 },
      { r: 1, c: 8, val: 8 },
      { r: 8, c: 2, val: 9 },
      { r: 1, c: 6, val: 9 },
    ],
  };

  // Memory & Jigsaw configuration (4 specific pieces to find: 1, 3, 5, 7)
  tutorialState.memoryPairsSelected = [1, 3, 5, 7];
  tutorialState.matchesFound = 0;

  // Jigsaw Slots (Fix corners/center, leave others null)
  tutorialState.jigsawSlots = [0, null, 2, null, 4, null, 6, null, 8];

  // Remaining pieces to place (Indices of the 9 blocks: 0-8)
  // Initially we show the ones NOT in jigsawSlots (1, 3, 5, 7)
  tutorialState.piecesToPlace = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  // Peaks & Valleys (Calculated once for this board)
  const allP = [
    { r: 0, c: 1, val: 9 },
    { r: 0, c: 3, val: 6 },
    { r: 1, c: 6, val: 9 },
    { r: 1, c: 8, val: 8 },
    { r: 2, c: 0, val: 7 },
    { r: 4, c: 7, val: 9 },
    { r: 5, c: 0, val: 9 },
    { r: 6, c: 8, val: 9 },
    { r: 7, c: 5, val: 9 },
    { r: 8, c: 2, val: 9 },
  ];
  const allV = [
    { r: 0, c: 5, val: 1 },
    { r: 1, c: 0, val: 1 },
    { r: 2, c: 7, val: 1 },
    { r: 3, c: 0, val: 2 },
    { r: 3, c: 4, val: 1 },
    { r: 4, c: 2, val: 1 },
    { r: 5, c: 6, val: 1 },
    { r: 6, c: 3, val: 1 },
    { r: 7, c: 1, val: 1 },
    { r: 8, c: 5, val: 3 },
    { r: 8, c: 8, val: 1 },
  ];

  tutorialState.allPeaks = allP;
  tutorialState.allValleys = allV;

  // The 5 Specific Targets requested by user: Peak 9, 8, 7 | Valley 2, 3
  tutorialState.peaksRemaining = [
    { r: 0, c: 1, val: 9 },
    { r: 1, c: 8, val: 8 },
    { r: 2, c: 0, val: 7 },
  ];
  tutorialState.valleysRemaining = [
    { r: 3, c: 0, val: 2 },
    { r: 8, c: 5, val: 3 },
  ];
  tutorialState.peaksErrors = 0; // Initialize error counter
  tutorialState.searchSequences = [
    {
      path: [
        { r: 0, c: 0 },
        { r: 0, c: 1 },
        { r: 0, c: 2 },
      ],
      found: false,
    },
    {
      path: [
        { r: 5, c: 0 },
        { r: 6, c: 1 },
        { r: 7, c: 2 },
        { r: 8, c: 3 },
      ],
      found: false,
    },
    {
      path: [
        { r: 2, c: 2 },
        { r: 3, c: 2 },
        { r: 4, c: 2 },
        { r: 5, c: 2 },
        { r: 6, c: 2 },
      ],
      found: false,
    },
  ];
  tutorialState.codeTarget = [3, 1, 9, 5, 4];
}

function loadStage(stage) {
  const container = document.getElementById("tutorial-board-container");
  const titleEl = document.getElementById("tutorial-step-title");
  const descEl = document.getElementById("tutorial-step-desc");
  const stageDescEl = document.getElementById("tutorial-stage-description");
  const nameEl = document.getElementById("tutorial-stage-name");
  const fill = document.getElementById("tutorial-progress-fill");

  container.innerHTML = "";
  fill.style.width = `${((stage - 1) / 6) * 100}%`;

  const lang = getCurrentLang();
  const t = translations[lang];

  const title = t[`tutorial_stage_${stage}_title`] || `Etapa ${stage}`;
  const desc = t[`tutorial_stage_${stage}_desc`] || `Descripción`;

  if (titleEl) titleEl.innerHTML = title;
  if (descEl) descEl.innerHTML = desc;
  if (stageDescEl) stageDescEl.innerHTML = desc;

  // Fix redundant titles: Only show "Etapa X: [Goal]"
  nameEl.textContent = title;

  // Update Nav Buttons
  const btnPrev = document.getElementById("btn-tutorial-prev");
  const btnNext = document.getElementById("btn-tutorial-next");
  if (btnPrev) btnPrev.disabled = stage === 1;
  if (btnNext) btnNext.disabled = stage === 6;

  currentTutorialStage = stage;

  switch (stage) {
    case 1:
      renderTutorialMemory();
      break;
    case 2:
      renderTutorialJigsaw();
      break;
    case 3:
      renderTutorialSudoku();
      break;
    case 4:
      renderTutorialPeaks();
      break;
    case 5:
      renderTutorialSearch();
      break;
    case 6:
      renderTutorialCode();
      break;
  }
}

function getStageKey(s) {
  return ["memory", "jigsaw", "sudoku", "peaks", "search", "code"][s - 1];
}

// --- STAGE 1: MEMORY ---
function renderTutorialMemory() {
  const container = document.getElementById("tutorial-board-container");
  container.innerHTML = "";

  const memoryWrapper = document.createElement("div");
  memoryWrapper.className = "memory-tutorial-wrapper";
  memoryWrapper.style.width = "100%";
  memoryWrapper.style.textAlign = "center";

  const btnMemorize = document.createElement("button");
  btnMemorize.className = "btn-primary memorize-btn";
  const lang = getCurrentLang();
  btnMemorize.textContent = (
    translations[lang].btn_memorize || "MEMORIZAR"
  ).toUpperCase();
  btnMemorize.style.marginBottom = "20px";

  const grid = document.createElement("div");
  grid.className = "memory-grid tutorial-memory";
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(4, 1fr)";
  grid.style.gap = "15px";
  grid.style.justifyContent = "center";

  let cards = [];
  const pairIndices = [
    ...tutorialState.memoryPairsSelected,
    ...tutorialState.memoryPairsSelected,
  ];
  // Initial shuffle
  pairIndices.sort(() => Math.random() - 0.5);

  pairIndices.forEach((pairIdx) => {
    const card = document.createElement("div");
    card.className = "memory-card glass-panel";
    card.dataset.index = pairIdx;
    card.innerHTML = `<div class="memory-card-inner">
      <div class="memory-card-front">?</div>
      <div class="memory-card-back">${getBlockTable(pairIdx)}</div>
    </div>`;
    cards.push(card);
    grid.appendChild(card);
  });

  let canClick = false;
  let isAnimating = false;
  let firstCard = null;
  let matches = 0;

  btnMemorize.onclick = () => {
    if (isAnimating) return;
    isAnimating = true;
    canClick = false;

    // Reset any flipped non-matched cards
    cards.forEach((c) => {
      if (!c.classList.contains("matched")) c.classList.remove("flipped");
    });

    // Short delay before peek to ensure users see them flip back if they were open
    setTimeout(() => {
      // Staggered Flip UP (Ripple)
      cards.forEach((c, i) => {
        if (!c.classList.contains("matched")) {
          setTimeout(() => c.classList.add("flipped"), i * 30);
        }
      });

      setTimeout(() => {
        // Staggered Flip DOWN (Ripple)
        cards.forEach((c, i) => {
          if (!c.classList.contains("matched")) {
            setTimeout(() => c.classList.remove("flipped"), i * 30);
          }
        });

        // Shuffle Animation (Daily style: Staggered FLIP)
        setTimeout(
          () => {
            // 1. First: Record start positions
            const firstRects = new Map();
            cards.forEach((c) => {
              if (!c.classList.contains("matched")) {
                firstRects.set(c, c.getBoundingClientRect());
              }
            });

            // 2. Last: Reorder DOM
            const nonMatched = cards.filter(
              (c) => !c.classList.contains("matched"),
            );
            const matched = cards.filter((c) =>
              c.classList.contains("matched"),
            );
            nonMatched.sort(() => Math.random() - 0.5);

            grid.innerHTML = "";
            cards = [...nonMatched, ...matched];
            cards.forEach((c) => grid.appendChild(c));

            // 3. Invert (Immediate)
            cards.forEach((c) => {
              if (c.classList.contains("matched")) return;
              const first = firstRects.get(c);
              const last = c.getBoundingClientRect();
              const dx = first.left - last.left;
              const dy = first.top - last.top;

              c.style.transition = "none";
              c.style.transform = `translate(${dx}px, ${dy}px)`;
            });

            // Force reflow
            grid.offsetHeight;

            // 4. Play (Chaotic Stagger)
            cards.forEach((c) => {
              if (c.classList.contains("matched")) return;
              const randomDelay = Math.random() * 300;
              setTimeout(() => {
                requestAnimationFrame(() => {
                  c.style.transition =
                    "transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1)";
                  c.style.transform = "";
                });
              }, 50 + randomDelay);
            });

            // Cleanup transitions after animation
            setTimeout(() => {
              cards.forEach((c) => {
                c.style.transition = "";
                c.style.transform = "";
              });
              isAnimating = false;
              canClick = true;
            }, 700 + 350);
          },
          500 + cards.length * 30,
        ); // Wait for sequence + buffer
      }, 3000); // 3 Seconds Preview
    }, 200);
  };

  cards.forEach((card) => {
    card.onclick = () => {
      if (
        !canClick ||
        card.classList.contains("flipped") ||
        card.classList.contains("matched") ||
        isAnimating
      )
        return;

      card.classList.add("flipped");

      if (!firstCard) {
        firstCard = card;
      } else {
        if (firstCard.dataset.index === card.dataset.index) {
          firstCard.classList.add("matched");
          card.classList.add("matched");
          matches++;
          firstCard = null;
          if (matches === 4) setTimeout(() => nextTutorialStage(), 1000);
        } else {
          canClick = false;
          setTimeout(() => {
            firstCard.classList.remove("flipped");
            card.classList.remove("flipped");
            firstCard = null;
            canClick = true;
          }, 1000);
        }
      }
    };
  });

  memoryWrapper.appendChild(btnMemorize);
  memoryWrapper.appendChild(grid);
  container.appendChild(memoryWrapper);
}

function getBlockTable(pieceIdx, slotIdx = null, conflicts = null) {
  const rOffset = Math.floor(pieceIdx / 3) * 3;
  const cOffset = (pieceIdx % 3) * 3;

  // If slotIdx is provided, numbers in this piece represent absolute Sudoku coords
  const slotRowOffset = slotIdx !== null ? Math.floor(slotIdx / 3) * 3 : null;
  const slotColOffset = slotIdx !== null ? (slotIdx % 3) * 3 : null;

  let html = `<div class="mini-sudoku-grid">`;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const row = rOffset + r;
      const col = cOffset + c;
      const val = tutorialState.solution[row][col];
      const isEmpty = tutorialState.emptyCells.some(
        (cell) => cell.r === row && cell.c === col,
      );

      let cellClass = "mini-cell";
      if (slotIdx !== null && conflicts) {
        const absR = slotRowOffset + r;
        const absC = slotColOffset + c;
        if (conflicts.has(`${absR},${absC}`)) {
          cellClass += " error-number";
        }
      }

      html += `<div class="${cellClass}">${isEmpty ? "" : val}</div>`;
    }
  }
  return html + "</div>";
}

// --- STAGE 2: JIGSAW ---
function renderTutorialJigsaw() {
  const container = document.getElementById("tutorial-board-container");
  container.innerHTML = "";

  const jigsawWrapper = document.createElement("div");
  jigsawWrapper.className = "jigsaw-tutorial-wrapper";

  const board = document.createElement("div");
  board.className = "tutorial-jigsaw-board";

  const conflicts = checkJigsawBoardConflicts();

  for (let i = 0; i < 9; i++) {
    const slot = document.createElement("div");
    slot.className = "jigsaw-slot glass-panel";
    slot.dataset.index = i;

    const pieceIdx = tutorialState.jigsawSlots[i];
    if (pieceIdx !== null) {
      slot.innerHTML = getBlockTable(pieceIdx, i, conflicts);
      slot.classList.add("filled");

      // Fixed pieces: Corners (0, 2, 6, 8) and Center (4)
      const isFixed = [0, 2, 4, 6, 8].includes(i);
      if (isFixed) {
        slot.classList.add("locked");
      }
    } else {
      slot.innerHTML = '<div class="slot-placeholder"></div>';
    }

    slot.onclick = () => {
      // Locked pieces cannot be selected or interact with selection
      if (slot.classList.contains("locked")) return;

      const selected = document.querySelector(
        ".jigsaw-piece.selected, .jigsaw-slot.selected",
      );
      if (!selected) {
        if (slot.classList.contains("filled")) {
          deselectGeneric();
          slot.classList.add("selected");
        }
        return;
      }

      handleDrop(selected, slot);
    };

    board.appendChild(slot);
  }

  const panel = document.createElement("div");
  panel.className = "tutorial-jigsaw-panel";

  // Only show pieces that are NOT on the board
  const placedPieceIndices = tutorialState.jigsawSlots.filter(
    (idx) => idx !== null,
  );

  // Use 4 fixed slots for pieces to find: 1, 3, 5, 7
  const piecesToFind = [1, 3, 5, 7];
  piecesToFind.forEach((pieceIdx) => {
    const slot = document.createElement("div");
    slot.className = "jigsaw-panel-slot";
    slot.dataset.pieceIdx = pieceIdx;

    if (!placedPieceIndices.includes(pieceIdx)) {
      const piece = document.createElement("div");
      piece.className = "jigsaw-piece glass-panel";
      piece.innerHTML = getBlockTable(pieceIdx);
      piece.dataset.pieceIdx = pieceIdx;

      piece.onclick = (e) => {
        e.stopPropagation(); // prevent slot click
        deselectGeneric();
        piece.classList.add("selected");
        const gameArea = document.getElementById("tutorial-game-area");
        if (gameArea) gameArea.classList.add("selection-active");
      };
      slot.appendChild(piece);
    } else {
      slot.classList.add("empty");
    }

    slot.onclick = () => {
      const selected = document.querySelector(
        ".jigsaw-piece.selected, .jigsaw-slot.selected",
      );
      if (selected) {
        handleDrop(selected, slot);
      }
    };

    panel.appendChild(slot);
  });

  jigsawWrapper.appendChild(board);
  jigsawWrapper.appendChild(panel);
  container.appendChild(jigsawWrapper);
}

// --- STAGE 3: SUDOKU ---
function renderTutorialSudoku() {
  const container = document.getElementById("tutorial-board-container");
  container.innerHTML = "";

  const sudokuWrapper = document.createElement("div");
  sudokuWrapper.className = "sudoku-tutorial-wrapper";

  const board = document.createElement("div");
  board.className = "tutorial-sudoku-board sudoku-mode";
  board.id = "tutorial-sudoku-grid";

  // Create 9 slots (3x3 grid of 3x3 grids)
  for (let sIdx = 0; sIdx < 9; sIdx++) {
    const slot = document.createElement("div");
    slot.className = "sudoku-chunk-slot";
    slot.dataset.slotIndex = sIdx;

    const miniGrid = document.createElement("div");
    miniGrid.className = "mini-sudoku-grid";

    for (let cIdx = 0; cIdx < 9; cIdx++) {
      const cell = document.createElement("div");
      cell.className = "mini-cell";

      const r = Math.floor(sIdx / 3) * 3 + Math.floor(cIdx / 3);
      const c = (sIdx % 3) * 3 + (cIdx % 3);
      const val = tutorialState.solution[r][c];
      const isEmpty = tutorialState.emptyCells.some(
        (cell) => cell.r === r && cell.c === c,
      );

      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.dataset.correct = val;

      if (isEmpty) {
        cell.classList.add("empty", "user-filled"); // user-filled so we can edit it
      } else {
        cell.classList.add("given", "has-number");
        cell.textContent = val;
      }

      cell.onclick = (e) => {
        e.stopPropagation();
        selectTutorialCell(cell);
      };

      miniGrid.appendChild(cell);
    }
    slot.appendChild(miniGrid);
    board.appendChild(slot);
  }

  const keypad = document.createElement("div");
  keypad.className = "tutorial-sudoku-controls";

  // Actions Row (Undo, Pencil, Clear)
  const actionsRow = document.createElement("div");
  actionsRow.className = "control-row secondary";

  const btnUndo = document.createElement("button");
  btnUndo.className = "btn-sudoku-action";
  btnUndo.innerHTML = '<span class="icon">↩️</span>';
  btnUndo.onclick = handleTutorialUndo;

  const btnPencil = document.createElement("button");
  btnPencil.id = "tutorial-pencil";
  btnPencil.className = "btn-sudoku-action";
  btnPencil.innerHTML = '<span class="icon">✏️</span>';
  btnPencil.onclick = toggleTutorialPencilMode;

  const btnClear = document.createElement("button");
  btnClear.className = "btn-sudoku-action";
  btnClear.innerHTML = '<span class="icon">🗑️</span>';
  btnClear.onclick = clearTutorialSelectedCell;

  actionsRow.appendChild(btnUndo);
  actionsRow.appendChild(btnPencil);
  actionsRow.appendChild(btnClear);

  // Numbers Row
  const numbersRow = document.createElement("div");
  numbersRow.className = "control-row primary numbers";

  for (let i = 1; i <= 9; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "sudoku-num";
    btn.dataset.value = i;

    btn.onclick = () => {
      if (lockedNumber) {
        if (lockedNumber === i.toString()) unlockTutorialNumber();
        else lockTutorialNumber(i.toString());
      } else {
        handleTutorialNumberInput(i.toString());
      }
    };

    // Long Press to Lock
    let pressTimer;
    const startPress = () => {
      pressTimer = setTimeout(() => lockTutorialNumber(i.toString()), 600);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    btn.onmousedown = startPress;
    btn.ontouchstart = startPress;
    btn.onmouseup = cancelPress;
    btn.onmouseleave = cancelPress;
    btn.ontouchend = cancelPress;

    numbersRow.appendChild(btn);
  }

  keypad.appendChild(actionsRow);
  keypad.appendChild(numbersRow);

  board.onclick = () => {
    deselectTutorialCell();
  };

  sudokuWrapper.appendChild(board);
  sudokuWrapper.appendChild(keypad);
  container.appendChild(sudokuWrapper);

  // Initial UI sync
  updateTutorialKeypadHighlights();
}

// --- STAGE 4: PEAKS & VALLEYS ---
function renderTutorialPeaks() {
  const container = document.getElementById("tutorial-board-container");
  container.innerHTML = "";

  const board = document.createElement("div");
  board.className = "tutorial-sudoku-board"; // Uses grid layout

  // Render 9 chunks
  for (let chunkIndex = 0; chunkIndex < 9; chunkIndex++) {
    const chunk = document.createElement("div");
    chunk.className = "sudoku-chunk-slot";
    chunk.dataset.slotIndex = chunkIndex;

    const chunkGrid = document.createElement("div");
    chunkGrid.className = "mini-sudoku-grid";

    // 9 cells per chunk
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(chunkIndex / 3) * 3 + Math.floor(i / 3);
      const c = (chunkIndex % 3) * 3 + (i % 3);
      const val = tutorialState.solution[r][c];

      const cell = document.createElement("div");
      cell.className = "mini-cell user-filled"; // Always filled in Peaks mode
      cell.dataset.r = r;
      cell.dataset.c = c;

      // Wrap number in span for animation (matches daily game)
      const numSpan = document.createElement("span");
      numSpan.className = "curr-number";
      numSpan.textContent = val;
      cell.appendChild(numSpan);

      const isPendingPeak = tutorialState.peaksRemaining.some(
        (p) => p.r === r && p.c === c,
      );
      const isPendingValley = tutorialState.valleysRemaining.some(
        (v) => v.r === r && v.c === c,
      );

      // Check if it should be pre-marked (Found)
      // It is found if it is in allPeaks/allValleys BUT NOT in Remaining
      const isPeak = tutorialState.allPeaks.some((p) => p.r === r && p.c === c);
      const isValley = tutorialState.allValleys.some(
        (v) => v.r === r && v.c === c,
      );

      if (isPeak && !isPendingPeak) {
        cell.classList.add("peak-found");
        cell.title = "Pico";
      } else if (isValley && !isPendingValley) {
        cell.classList.add("valley-found");
        cell.title = "Valle";
      }

      // Add click listener
      cell.onclick = () => handleTutorialPeakClick(cell, r, c);

      chunkGrid.appendChild(cell);
    }
    chunk.appendChild(chunkGrid);
    board.appendChild(chunk);
  }

  container.appendChild(board);

  // Add Stats Counter (Matches Daily Game)
  const statsDiv = document.createElement("div");
  statsDiv.className = "peaks-stats";
  statsDiv.id = "tutorial-peaks-stats";
  statsDiv.innerHTML = `
    <span class="remaining-label">Faltan:</span>
    <span id="tutorial-peaks-remaining">0</span>
    <span class="separator">|</span>
    <span class="error-label">Errores:</span>
    <span id="tutorial-peaks-errors">0</span>
  `;
  container.appendChild(statsDiv);

  updateTutorialPeaksCounters();
}

function updateTutorialPeaksCounters() {
  const remEl = document.getElementById("tutorial-peaks-remaining");
  const errEl = document.getElementById("tutorial-peaks-errors");

  if (remEl) {
    const remaining =
      tutorialState.peaksRemaining.length +
      tutorialState.valleysRemaining.length;
    remEl.textContent = remaining;
  }

  if (errEl) {
    errEl.textContent = tutorialState.peaksErrors || 0;
  }
}

function handleTutorialPeakClick(cell, r, c) {
  // Check if it's a pending target
  const pIdx = tutorialState.peaksRemaining.findIndex(
    (p) => p.r === r && p.c === c,
  );
  const vIdx = tutorialState.valleysRemaining.findIndex(
    (v) => v.r === r && v.c === c,
  );

  let found = false;

  if (pIdx !== -1) {
    cell.classList.add("peak-found");
    tutorialState.peaksRemaining.splice(pIdx, 1);
    found = true;
  } else if (vIdx !== -1) {
    cell.classList.add("valley-found");
    tutorialState.valleysRemaining.splice(vIdx, 1);
    found = true;
  } else {
    // Error shake if clicking a non-target or already found one
    if (
      !cell.classList.contains("peak-found") &&
      !cell.classList.contains("valley-found")
    ) {
      if (!tutorialState.peaksErrors) tutorialState.peaksErrors = 0;
      tutorialState.peaksErrors++;
      updateTutorialPeaksCounters();

      const numSpan = cell.querySelector(".curr-number");
      if (numSpan) {
        numSpan.classList.add("error-shake");
        setTimeout(() => numSpan.classList.remove("error-shake"), 500);
      }
    }
  }

  if (found) {
    updateTutorialPeaksCounters();
    if (
      tutorialState.peaksRemaining.length === 0 &&
      tutorialState.valleysRemaining.length === 0
    ) {
      setTimeout(() => nextTutorialStage(), 1000);
    }
  }
}

// --- STAGE 5: SEARCH ---
function renderTutorialSearch() {
  const container = document.getElementById("tutorial-board-container");
  container.innerHTML = "";

  const board = document.createElement("div");
  board.className = "tutorial-sudoku-board";
  let html = `<table class="sudoku-table tutorial search">`;

  for (let r = 0; r < 9; r++) {
    html += "<tr>";
    for (let c = 0; c < 9; c++) {
      const val = tutorialState.solution[r][c];

      // Check if this cell is part of a sequence
      const isTarget = tutorialState.searchSequences.some((seq) =>
        seq.path.some((p) => p.r === r && p.c === c),
      );

      // Pre-mark some OTHER cells as "found" sequences to show progression
      const isDummy = !isTarget && (r === c || r + c === 8);

      html += `<td class="${isDummy ? "correct" : ""}" data-r="${r}" data-c="${c}">${val}</td>`;
    }
    html += "</tr>";
  }
  board.innerHTML = html + "</table>";

  board.querySelectorAll("td").forEach((td) => {
    td.onclick = () => {
      const r = parseInt(td.dataset.r);
      const c = parseInt(td.dataset.c);

      tutorialState.searchSequences.forEach((seq) => {
        if (seq.path.some((p) => p.r === r && p.c === c)) {
          seq.path.forEach((p) => {
            const cell = board.querySelector(
              `td[data-r="${p.r}"][data-c="${p.c}"]`,
            );
            if (cell) cell.classList.add("correct");
          });
          seq.found = true;
        }
      });

      if (tutorialState.searchSequences.every((s) => s.found)) {
        setTimeout(() => nextTutorialStage(), 1000);
      }
    };
  });

  container.appendChild(board);
}

// --- STAGE 6: CODE ---
function renderTutorialCode() {
  const container = document.getElementById("tutorial-board-container");
  container.innerHTML = "";

  const codeWrapper = document.createElement("div");
  codeWrapper.className = "code-tutorial-wrapper";
  codeWrapper.style.textAlign = "center";

  const display = document.createElement("div");
  display.className = "code-display glass-panel";
  display.style.fontSize = "2.5rem";
  display.style.padding = "20px";
  display.style.marginBottom = "30px";
  display.style.fontFamily = "monospace";
  display.style.letterSpacing = "10px";
  display.textContent = "_ _ _ _ _";
  codeWrapper.appendChild(display);

  const keypad = document.createElement("div");
  keypad.className = "tutorial-keypad";
  keypad.style.display = "grid";
  keypad.style.gridTemplateColumns = "repeat(3, 1fr)";
  keypad.style.gap = "10px";
  keypad.style.maxWidth = "250px";
  keypad.style.margin = "0 auto";

  let userSeq = [];
  const target = tutorialState.codeTarget;

  for (let i = 1; i <= 9; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "keypad-btn glass-panel";
    btn.onclick = () => {
      const nextNum = target[userSeq.length];
      if (i === nextNum) {
        userSeq.push(i);
        display.textContent =
          userSeq.join(" ") + " " + "_ ".repeat(5 - userSeq.length);
        display.style.color = "var(--primary-color)";
        if (userSeq.length === 5) {
          setTimeout(() => finishTutorial(), 1000);
        }
      } else {
        // Reset on error
        userSeq = [];
        display.textContent = "_ _ _ _ _";
        display.style.color = "#ff5555";
        setTimeout(() => {
          display.style.color = "";
        }, 300);
      }
    };
    keypad.appendChild(btn);
  }

  codeWrapper.appendChild(keypad);
  container.appendChild(codeWrapper);

  // Initial Hint after 2s
  setTimeout(() => {
    if (userSeq.length === 0) {
      const hint = document.createElement("p");
      hint.style.marginTop = "20px";
      hint.style.opacity = "0.7";
      hint.textContent = `HINT: ${target.slice(0, 3).join(" ")} ...`;
      codeWrapper.appendChild(hint);
    }
  }, 2000);
}

function nextTutorialStage() {
  currentTutorialStage++;
  loadStage(currentTutorialStage);
}

function finishTutorial() {
  document.getElementById("tutorial-progress-fill").style.width = "100%";
  const lang = getCurrentLang(),
    t = translations[lang];
  document.getElementById("tutorial-board-container").innerHTML = `
        <div class="tutorial-finish glass-panel">
            <h2>🏆 ${t.tutorial_finish_title}</h2>
            <p>${t.tutorial_finish_desc}</p>
            <button id="btn-tutorial-home" class="btn-primary">${t.btn_finish_tutorial}</button>
        </div>
    `;
  document.getElementById("btn-tutorial-home").onclick = hideGuide;
}
// --- DRAG & DROP ENGINE ---
function initTutorialDragAndDrop() {
  document.addEventListener("pointerdown", handlePointerDown, {
    passive: false,
  });
  document.addEventListener("pointermove", handlePointerMove, {
    passive: false,
  });
  document.addEventListener("pointerup", handlePointerUp, { passive: false });
}

function handlePointerDown(e) {
  // Only Mouse or Pen
  if (e.pointerType === "touch") return;

  // Only if in Jigsaw Stage
  if (currentTutorialStage !== 2) return;

  const target = e.target.closest(".jigsaw-piece, .jigsaw-slot");
  if (!target) return;

  // If slot is empty, ignore
  if (
    target.classList.contains("jigsaw-slot") &&
    !target.classList.contains("filled")
  )
    return;

  // Prevent dragging locked pieces
  if (target.classList.contains("locked")) return;

  potentialDragTarget = target;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
}

function handlePointerMove(e) {
  if (potentialDragTarget && !dragClone) {
    const dx = Math.abs(e.clientX - dragStartX);
    const dy = Math.abs(e.clientY - dragStartY);

    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      startDragging(e);
    }
  }

  if (!dragClone) return;
  e.preventDefault();

  updateDragPosition(e.clientX, e.clientY);

  // Highlight targets
  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  const dropTarget = elements.find(
    (el) =>
      el.classList.contains("jigsaw-slot") ||
      el.classList.contains("jigsaw-piece") ||
      el.classList.contains("jigsaw-panel-slot") ||
      el.classList.contains("tutorial-jigsaw-panel"),
  );

  document
    .querySelectorAll(".drop-hover")
    .forEach((el) => el.classList.remove("drop-hover"));
  if (dropTarget) {
    dropTarget.classList.add("drop-hover");
  }
}

function startDragging(e) {
  const target = potentialDragTarget;
  deselectGeneric();

  selectedPieceElement = target;
  selectedPieceElement.classList.add("dragging-source");

  const content = target.querySelector(".mini-sudoku-grid");
  if (!content) {
    potentialDragTarget = null;
    return;
  }

  // Wrap the clone in a container to maintain Container Query context
  const dragWrapper = document.createElement("div");
  dragWrapper.className = "dragging-clone";

  dragClone = content.cloneNode(true);
  dragClone.classList.add("mini-sudoku-grid"); // Keep original grid class
  dragWrapper.appendChild(dragClone);

  const rect = target.getBoundingClientRect();
  dragWrapper.style.width = `${rect.width}px`;
  dragWrapper.style.height = `${rect.height}px`;
  dragWrapper.style.left = `${rect.left}px`;
  dragWrapper.style.top = `${rect.top}px`;

  document.body.appendChild(dragWrapper);

  dragOffsetX = rect.width / 2;
  dragOffsetY = rect.height / 2;

  // Assign to global dragClone for position updates
  dragClone = dragWrapper;

  content.style.opacity = "0";
  updateDragPosition(e.clientX, e.clientY);
}

function handlePointerUp(e) {
  potentialDragTarget = null;

  if (!dragClone) return;
  e.preventDefault();

  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  const dropTarget = elements.find(
    (el) =>
      el.classList.contains("jigsaw-slot") ||
      el.classList.contains("jigsaw-piece") ||
      el.classList.contains("jigsaw-panel-slot") ||
      el.classList.contains("tutorial-jigsaw-panel"),
  );

  const sourceContent = selectedPieceElement.querySelector(".mini-sudoku-grid");

  if (dropTarget) {
    handleDrop(selectedPieceElement, dropTarget);
  } else {
    // Return to source
    if (sourceContent) sourceContent.style.opacity = "1";
  }

  // Cleanup
  if (dragClone) {
    dragClone.remove();
    dragClone = null;
  }
  if (selectedPieceElement) {
    selectedPieceElement.classList.remove("dragging-source");
    selectedPieceElement = null;
  }
  document
    .querySelectorAll(".drop-hover")
    .forEach((el) => el.classList.remove("drop-hover"));
}

function updateDragPosition(x, y) {
  if (!dragClone) return;
  dragClone.style.left = `${x - dragOffsetX}px`;
  dragClone.style.top = `${y - dragOffsetY}px`;
}

function deselectGeneric() {
  document
    .querySelectorAll(".selected")
    .forEach((el) => el.classList.remove("selected"));
  const gameArea = document.getElementById("tutorial-game-area");
  if (gameArea) gameArea.classList.remove("selection-active");
}

function handleDrop(source, target) {
  if (source === target) {
    const content = source.querySelector(".mini-sudoku-grid");
    if (content) content.style.opacity = "1";
    return;
  }

  const isSourceBoard = source.classList.contains("jigsaw-slot");
  const isTargetBoard = target.classList.contains("jigsaw-slot");

  const sourceIdx = parseInt(
    isSourceBoard ? source.dataset.index : source.dataset.pieceIdx,
  );
  const targetIdx = parseInt(target.dataset.index); // Slot index

  const pieceIdx = isSourceBoard
    ? tutorialState.jigsawSlots[sourceIdx]
    : sourceIdx;

  if (isTargetBoard) {
    // Prevent dropping into locked slots
    if (target.classList.contains("locked")) {
      const content = source.querySelector(".mini-sudoku-grid");
      if (content) content.style.opacity = "1";
      deselectGeneric();
      return;
    }

    const targetPieceIdx = tutorialState.jigsawSlots[targetIdx];

    // Swap or Move
    tutorialState.jigsawSlots[targetIdx] = pieceIdx;
    if (isSourceBoard) {
      tutorialState.jigsawSlots[sourceIdx] = targetPieceIdx;
    }
  } else {
    // Drop back to panel (anywhere in panel or specific slot)
    if (isSourceBoard) {
      tutorialState.jigsawSlots[sourceIdx] = null;
    }
  }

  deselectGeneric();
  renderTutorialJigsaw();

  // Win condition: Slots match piece indices (Identity map)
  const isWin = tutorialState.jigsawSlots.every(
    (idx, slotIdx) => idx === slotIdx,
  );
  if (isWin) {
    setTimeout(() => nextTutorialStage(), 1000);
  }
}

function checkJigsawBoardConflicts() {
  const conflicts = new Set();
  const fullBoard = Array.from({ length: 9 }, () => Array(9).fill(0));

  // 1. Reconstruct full Board
  for (let slotIdx = 0; slotIdx < 9; slotIdx++) {
    const pieceIdx = tutorialState.jigsawSlots[slotIdx];
    if (pieceIdx === null) continue;

    const pieceStartR = Math.floor(pieceIdx / 3) * 3;
    const pieceStartC = (pieceIdx % 3) * 3;
    const slotStartR = Math.floor(slotIdx / 3) * 3;
    const slotStartC = (slotIdx % 3) * 3;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const pieceR = pieceStartR + r;
        const pieceC = pieceStartC + c;
        const isCellEmpty = tutorialState.emptyCells.some(
          (cell) => cell.r === pieceR && cell.c === pieceC,
        );

        if (!isCellEmpty) {
          fullBoard[slotStartR + r][slotStartC + c] =
            tutorialState.solution[pieceR][pieceC];
        } else {
          fullBoard[slotStartR + r][slotStartC + c] = 0;
        }
      }
    }
  }

  // 2. Check Rows
  for (let r = 0; r < 9; r++) {
    const seen = new Map();
    for (let c = 0; c < 9; c++) {
      const val = fullBoard[r][c];
      if (val === 0) continue;
      if (!seen.has(val)) seen.set(val, []);
      seen.get(val).push(c);
    }
    seen.forEach((cols) => {
      if (cols.length > 1) {
        cols.forEach((c) => conflicts.add(`${r},${c}`));
      }
    });
  }

  // 3. Check Columns
  for (let c = 0; c < 9; c++) {
    const seen = new Map();
    for (let r = 0; r < 9; r++) {
      const val = fullBoard[r][c];
      if (val === 0) continue;
      if (!seen.has(val)) seen.set(val, []);
      seen.get(val).push(r);
    }
    seen.forEach((rows) => {
      if (rows.length > 1) {
        rows.forEach((r) => conflicts.add(`${r},${c}`));
      }
    });
  }

  return conflicts;
}

// --- SUDOKU TUTORIAL HELPERS ---
function selectTutorialCell(cell, skipPaint = false) {
  // If clicking a 'given' number, deselect but highlight matches
  if (cell.classList.contains("given")) {
    deselectTutorialCell();
    const val = cell.textContent.trim();
    highlightSimilarTutorialCells(val);
    return;
  }

  if (selectedCell) selectedCell.classList.remove("selected-cell");

  // PAINT MODE: If we have a locked number, apply it immediately!
  if (lockedNumber && !skipPaint) {
    if (selectedCell) selectedCell.classList.remove("selected-cell");
    selectedCell = cell;
    selectedCell.classList.add("selected-cell");
    handleTutorialNumberInput(lockedNumber);
    return;
  }

  if (selectedCell) {
    selectedCell.classList.remove("selected-cell");
  }

  selectedCell = cell;
  selectedCell.classList.add("selected-cell");
  updateTutorialKeypadHighlights();

  // Highlight similar numbers
  const val = cell.textContent.trim();
  if (val && !cell.classList.contains("has-notes")) {
    highlightSimilarTutorialCells(val);
  } else {
    highlightSimilarTutorialCells(null);
  }
}

function deselectTutorialCell() {
  if (selectedCell) {
    selectedCell.classList.remove("selected-cell");
    selectedCell = null;
    updateTutorialKeypadHighlights();
    highlightSimilarTutorialCells(null);
  }
}

function handleTutorialNumberInput(num) {
  if (!selectedCell) return;
  if (selectedCell.classList.contains("given")) return;

  // KEY DISABLED CHECK (Note Constraint)
  if (!tutorialPencilMode && selectedCell.classList.contains("has-notes")) {
    const notesGrid = selectedCell.querySelector(".notes-grid");
    if (notesGrid) {
      const slot = notesGrid.querySelector(`[data-note="${num}"]`);
      const allNoteSlots = Array.from(notesGrid.querySelectorAll(".note-slot"));
      const visibleNotesCount = allNoteSlots.filter(
        (n) => n.textContent,
      ).length;

      // Enforce constraint only if there are visible notes
      if (visibleNotesCount > 0 && (!slot || !slot.textContent)) {
        return; // Block input
      }
    }
  }

  pushTutorialAction(selectedCell);

  if (tutorialPencilMode) {
    toggleTutorialNote(selectedCell, num);
  } else {
    // If clicking a number that is already there, clear it? Or just replace.
    // Daily game: Replaces or Clears? Replaces.
    selectedCell.textContent = num;
    selectedCell.classList.add("user-filled");
    selectedCell.classList.remove("has-notes", "error");

    // Clear notes grid if any
    const notesGrid = selectedCell.querySelector(".notes-grid");
    if (notesGrid) notesGrid.remove();

    updateTutorialKeypadHighlights();
    highlightSimilarTutorialCells(num);
    validateTutorialBoard();
  }
}

function toggleTutorialPencilMode() {
  tutorialPencilMode = !tutorialPencilMode;
  const btn = document.getElementById("tutorial-pencil");
  if (btn) btn.classList.toggle("active", tutorialPencilMode);
  updateTutorialKeypadHighlights();
}

function clearTutorialSelectedCell() {
  if (!selectedCell || selectedCell.classList.contains("given")) return;
  pushTutorialAction(selectedCell);
  selectedCell.textContent = "";
  selectedCell.classList.remove("user-filled", "has-notes", "error");
  const notesGrid = selectedCell.querySelector(".notes-grid");
  if (notesGrid) notesGrid.remove();

  updateTutorialKeypadHighlights();
  highlightSimilarTutorialCells(null);
  validateTutorialBoard();
}

function pushTutorialAction(cell) {
  const hasNotes = !!cell.querySelector(".notes-grid");
  undoStack.push({
    cell,
    previousText: hasNotes ? "" : cell.textContent,
    previousClasses: [...cell.classList],
    previousNotes: cell.querySelector(".notes-grid")?.cloneNode(true),
  });
}

function handleTutorialUndo() {
  if (undoStack.length === 0) return;
  const action = undoStack.pop();
  const cell = action.cell;

  cell.textContent = action.previousText;
  cell.className = "mini-cell";
  action.previousClasses.forEach((c) => {
    if (c !== "selected-cell") cell.classList.add(c);
  });

  const existingNotes = cell.querySelector(".notes-grid");
  if (existingNotes) existingNotes.remove();
  if (action.previousNotes) cell.appendChild(action.previousNotes);

  selectTutorialCell(cell, true);
  validateTutorialBoard();
}

function lockTutorialNumber(num) {
  lockedNumber = num;
  document
    .querySelectorAll(".tutorial-sudoku-controls .sudoku-num")
    .forEach((btn) => {
      btn.classList.toggle("locked-num", btn.dataset.value === num);
    });
  highlightSimilarTutorialCells(num);

  if (selectedCell && !selectedCell.classList.contains("given")) {
    handleTutorialNumberInput(num);
  }
}

function unlockTutorialNumber() {
  lockedNumber = null;
  document
    .querySelectorAll(".tutorial-sudoku-controls .sudoku-num")
    .forEach((btn) => {
      btn.classList.remove("locked-num");
    });
  if (selectedCell) {
    const val = selectedCell.textContent.trim();
    highlightSimilarTutorialCells(
      val && !selectedCell.classList.contains("has-notes") ? val : null,
    );
  } else {
    highlightSimilarTutorialCells(null);
  }
}

function updateTutorialKeypadHighlights() {
  const board = document.getElementById("tutorial-sudoku-grid");
  if (!board) return;

  const lang = getCurrentLang();
  const t = translations[lang];

  const globalCounts = {};
  board.querySelectorAll(".mini-cell").forEach((c) => {
    const v = c.textContent.trim();
    if (v && !c.classList.contains("has-notes")) {
      globalCounts[v] = (globalCounts[v] || 0) + 1;
    }
  });

  document
    .querySelectorAll(".tutorial-sudoku-controls .sudoku-num")
    .forEach((btn) => {
      const val = btn.dataset.value;
      btn.classList.remove("key-completed", "key-present", "key-disabled");
      btn.title = ""; // Reset tooltip

      if (globalCounts[val] >= 9) {
        btn.classList.add("key-completed");
        btn.title = t.sudoku_key_completed || "Number completed!";
      }

      if (selectedCell) {
        const cellVal = selectedCell.textContent.trim();
        const hasNotes = selectedCell.classList.contains("has-notes");

        if (!hasNotes && cellVal === val) {
          btn.classList.add("key-present");
        }

        // Note presence check
        const notesGrid = selectedCell.querySelector(".notes-grid");
        let noteExists = false;
        let visibleNotesCount = 0;

        if (notesGrid) {
          const slot = notesGrid.querySelector(`[data-note="${val}"]`);
          if (slot && slot.textContent) noteExists = true;

          visibleNotesCount = Array.from(
            notesGrid.querySelectorAll(".note-slot"),
          ).filter((n) => n.textContent).length;
        }

        if (noteExists) btn.classList.add("key-present");

        // KEY DISABLED LOGIC: If cell has notes and this num is NOT among them (and notes are visible)
        if (
          !tutorialPencilMode &&
          hasNotes &&
          !noteExists &&
          visibleNotesCount > 0
        ) {
          btn.classList.add("key-disabled");
        }
      }
    });
}

function highlightSimilarTutorialCells(val) {
  const board = document.getElementById("tutorial-sudoku-grid");
  if (!board) return;
  board
    .querySelectorAll(".highlight-match")
    .forEach((el) => el.classList.remove("highlight-match"));
  if (!val) return;
  board.querySelectorAll(".mini-cell").forEach((cell) => {
    if (cell.textContent === val && !cell.classList.contains("has-notes")) {
      cell.classList.add("highlight-match");
    }
  });
}

function toggleTutorialNote(cell, num) {
  const wasUserFilled = cell.classList.contains("user-filled");
  const existingVal = wasUserFilled ? cell.textContent.trim() : "";
  const hasNotes = cell.classList.contains("has-notes");

  // Parity Change: capture main number transition BEFORE clearing content
  cell.classList.add("has-notes");
  cell.classList.remove("user-filled", "error");

  let notesGrid = cell.querySelector(".notes-grid");
  if (!notesGrid) {
    cell.textContent = ""; // Clear main ONLY if no grid exists yet
    notesGrid = document.createElement("div");
    notesGrid.className = "notes-grid";
    for (let i = 1; i <= 9; i++) {
      const slot = document.createElement("div");
      slot.classList.add("note-slot");
      slot.dataset.note = i;
      slot.dataset.userActive = "false";
      notesGrid.appendChild(slot);
    }
    cell.appendChild(notesGrid);
  }

  // Conversion logic (High Fidelity Parity)
  let convertedThisTurn = false;
  if (wasUserFilled && existingVal && !hasNotes) {
    const oldSlot = notesGrid.querySelector(`[data-note="${existingVal}"]`);
    if (oldSlot) {
      oldSlot.dataset.userActive = "true";
      oldSlot.textContent = existingVal;
      if (existingVal === num) convertedThisTurn = true;
    }
  }

  const slot = notesGrid.querySelector(`[data-note="${num}"]`);
  if (slot) {
    if (convertedThisTurn) {
      // Keep it active
    } else {
      const isVisible = !!slot.textContent;
      const shouldBeVisible = !isVisible;
      slot.dataset.userActive = shouldBeVisible ? "true" : "false";

      if (shouldBeVisible) {
        const coords = getTutorialCellCoordinates(cell);
        const conflictCount = getTutorialConflictCount(coords, num);
        slot.dataset.pinnedConflictCount =
          conflictCount > 0 ? conflictCount : "0";
      } else {
        slot.dataset.pinnedConflictCount = "0";
      }
      slot.textContent = shouldBeVisible ? num : "";

      // Fidelity Logic: Only promote if we REMOVED a note (matches Daily Jigsudo)
      if (!shouldBeVisible) {
        promoteTutorialSingleCandidatesGlobal();
      }
    }
  }

  updateTutorialKeypadHighlights();
  // REMOVED updateTutorialNoteVisibility() to prevent premature suppression/promotion
}

let isTutorialPromoting = false;
function promoteTutorialSingleCandidatesGlobal() {
  if (isTutorialPromoting) return;
  isTutorialPromoting = true;

  const board = document.getElementById("tutorial-sudoku-grid");
  if (!board) {
    isTutorialPromoting = false;
    return;
  }

  const cellsToPromote = [];
  board.querySelectorAll(".mini-cell").forEach((cell) => {
    if (!cell.classList.contains("has-notes")) return;

    const notesGrid = cell.querySelector(".notes-grid");
    if (!notesGrid) return;

    const allNoteSlots = Array.from(notesGrid.querySelectorAll(".note-slot"));
    const visibleNotes = allNoteSlots.filter((n) => n.textContent !== "");
    const userActiveNotes = allNoteSlots.filter(
      (n) => n.dataset.userActive === "true",
    );

    // Promote ONLY if it was reduced from multiple candidates to one by board logic.
    if (visibleNotes.length === 1 && userActiveNotes.length > 1) {
      cellsToPromote.push({
        cell: cell,
        num: visibleNotes[0].dataset.note,
      });
    }
  });

  cellsToPromote.forEach((action) => {
    if (action.cell.classList.contains("has-notes")) {
      selectTutorialCell(action.cell, true);
      const wasPencil = tutorialPencilMode;
      tutorialPencilMode = false;
      handleTutorialNumberInput(action.num);
      tutorialPencilMode = wasPencil;
    }
  });

  isTutorialPromoting = false;
}

function getTutorialCellCoordinates(cell) {
  const slot = cell.closest(".sudoku-chunk-slot");
  const slotIndex = parseInt(slot.dataset.slotIndex);
  const cells = Array.from(slot.querySelectorAll(".mini-cell"));
  const localIndex = cells.indexOf(cell);

  const row = Math.floor(slotIndex / 3) * 3 + Math.floor(localIndex / 3);
  const col = (slotIndex % 3) * 3 + (localIndex % 3);

  return { slotIndex, row, col };
}

function getTutorialConflictCount(coords, num) {
  const board = document.getElementById("tutorial-sudoku-grid");
  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));
  let count = 0;

  slots.forEach((slot, sIdx) => {
    const cells = slot.querySelectorAll(".mini-cell");
    cells.forEach((cell, lIdx) => {
      const val = cell.textContent.trim();
      if (!val || cell.classList.contains("has-notes")) return;

      if (val === num) {
        const r = Math.floor(sIdx / 3) * 3 + Math.floor(lIdx / 3);
        const c = (sIdx % 3) * 3 + (lIdx % 3);

        if (r === coords.row || c === coords.col || sIdx === coords.slotIndex) {
          count++;
        }
      }
    });
  });
  return count;
}

function updateTutorialNoteVisibility() {
  const board = document.getElementById("tutorial-sudoku-grid");
  if (!board) return;

  const slots = Array.from(board.querySelectorAll(".sudoku-chunk-slot"));
  slots.forEach((slot, slotIndex) => {
    const cells = slot.querySelectorAll(".mini-cell");
    cells.forEach((cell, localIndex) => {
      if (!cell.classList.contains("has-notes")) return;

      const notesGrid = cell.querySelector(".notes-grid");
      if (!notesGrid) return;

      const r = Math.floor(slotIndex / 3) * 3 + Math.floor(localIndex / 3);
      const c = (slotIndex % 3) * 3 + (localIndex % 3);
      const coords = { slotIndex, row: r, col: c };

      const noteSlots = notesGrid.querySelectorAll(".note-slot");
      noteSlots.forEach((nSlot) => {
        const num = nSlot.dataset.note;
        const userWants = nSlot.dataset.userActive === "true";

        if (!userWants) {
          nSlot.textContent = "";
          return;
        }

        const currentConflictCount = getTutorialConflictCount(coords, num);
        if (currentConflictCount > 0) {
          const pinnedCount = parseInt(nSlot.dataset.pinnedConflictCount) || 0;
          if (currentConflictCount <= pinnedCount) {
            nSlot.textContent = num;
          } else {
            nSlot.textContent = "";
            nSlot.dataset.pinnedConflictCount = "0";
          }
        } else {
          nSlot.dataset.pinnedConflictCount = "0";
          nSlot.textContent = num;
        }
      });
    });
  });

  // Fidelity Logic: Trigger Promotion after note visibility pass
  promoteTutorialSingleCandidatesGlobal();
}

function validateTutorialBoard() {
  const board = document.getElementById("tutorial-sudoku-grid");
  if (!board) return;

  const cells = Array.from(board.querySelectorAll(".mini-cell"));
  cells.forEach((c) => c.classList.remove("error"));

  // Check if Full
  let isFull = true;
  cells.forEach((cell) => {
    if (
      cell.textContent.trim() === "" ||
      cell.classList.contains("has-notes")
    ) {
      isFull = false;
    }
  });

  if (!isFull) {
    updateTutorialNoteVisibility();
    return;
  }

  // Board is FULL: Check against solution (High-parity daily logic)
  let errorCount = 0;
  cells.forEach((cell) => {
    const val = cell.textContent.trim();
    const correct = cell.dataset.correct;
    // Given numbers are in dataset too but they can't be wrong (unless logic failed)
    if (val !== correct) {
      if (cell.classList.contains("user-filled")) {
        cell.classList.add("error");
      }
      errorCount++;
    }
  });

  if (errorCount === 0) {
    setTimeout(() => nextTutorialStage(), 1000);
  }
}
