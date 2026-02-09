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

export function initGuide() {
  setupTabSwitching();
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

function setupTabSwitching() {
  const tabs = document.querySelectorAll(".guide-selector .seg-btn");
  const contents = document.querySelectorAll(".guide-tab-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-target");
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      contents.forEach((c) => {
        c.classList.add("hidden");
        if (c.id === target) {
          c.classList.remove("hidden");
          // If switching to tutorial, start it immediately
          if (target === "guide-tutorial") {
            startTutorial();
          }
        }
      });
    });
  });
}

function setupRouting() {
  window.addEventListener("hashchange", handleGuideRouting);
  handleGuideRouting();
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
  document.getElementById("tutorial-step-info").classList.add("hidden");
  document.getElementById("tutorial-game-area").classList.remove("hidden");

  currentTutorialStage = 1;
  initTutorialState();
  loadStage(1);
}

function initTutorialState() {
  const board = [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9],
  ];

  tutorialState = {
    solution: board,
    emptyCells: [
      { r: 0, c: 7, val: 1 },
      { r: 6, c: 2, val: 1 },
      { r: 1, c: 2, val: 2 },
      { r: 7, c: 0, val: 2 },
      { r: 0, c: 1, val: 3 },
      { r: 8, c: 0, val: 3 },
      { r: 2, c: 4, val: 4 },
      { r: 8, c: 1, val: 4 },
      { r: 0, c: 0, val: 5 },
      { r: 1, c: 5, val: 5 },
      { r: 4, c: 2, val: 6 },
      { r: 5, c: 8, val: 6 },
      { r: 1, c: 1, val: 7 },
      { r: 2, c: 8, val: 7 },
      { r: 4, c: 3, val: 8 },
      { r: 7, c: 1, val: 8 },
      { r: 0, c: 6, val: 9 },
      { r: 7, c: 5, val: 9 },
    ],
  };

  tutorialState.memoryPairsSelected = [1, 3, 5, 7]; // 4 side pairs
  tutorialState.matchesFound = 0;

  // Track pieces in board slots (0-8)
  // Initially center and corners are fixed
  tutorialState.jigsawSlots = [0, null, 2, null, 4, null, 6, null, 8];

  tutorialState.piecesToPlace = [1, 3, 5, 7]; // 4 side pieces
  tutorialState.peaksRemaining = [
    { r: 0, c: 5 },
    { r: 2, c: 1 },
    { r: 4, c: 7 },
  ];
  tutorialState.valleysRemaining = [
    { r: 1, c: 7 },
    { r: 6, c: 4 },
  ];
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
    } else {
      slot.innerHTML = '<div class="slot-placeholder"></div>';
    }

    slot.onclick = () => {
      // Locked center (4)
      if (i === 4) return;

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

  tutorialState.piecesToPlace.forEach((pieceIdx) => {
    if (placedPieceIndices.includes(pieceIdx)) return;

    const piece = document.createElement("div");
    piece.className = "jigsaw-piece glass-panel";
    piece.innerHTML = getBlockTable(pieceIdx);
    piece.dataset.pieceIdx = pieceIdx;

    piece.onclick = () => {
      deselectGeneric();
      piece.classList.add("selected");
      const gameArea = document.getElementById("tutorial-game-area");
      if (gameArea) gameArea.classList.add("selection-active");
    };

    panel.appendChild(piece);
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
  board.className = "tutorial-sudoku-board";
  let html = `<table class="sudoku-table tutorial">`;
  for (let r = 0; r < 9; r++) {
    html += "<tr>";
    for (let c = 0; c < 9; c++) {
      const val = tutorialState.solution[r][c];
      const isEmpty = tutorialState.emptyCells.some(
        (cell) => cell.r === r && cell.c === c,
      );
      if (isEmpty) {
        html += `<td class="empty" data-r="${r}" data-c="${c}" data-correct="${val}"></td>`;
      } else {
        html += `<td class="given">${val}</td>`;
      }
    }
    html += "</tr>";
  }
  board.innerHTML = html + "</table>";

  const keypad = document.createElement("div");
  keypad.className = "tutorial-keypad";
  keypad.style.marginTop = "20px";
  for (let i = 1; i <= 9; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "keypad-btn glass-panel";
    btn.onclick = () => {
      const sel = board.querySelector(".selected");
      if (!sel) return;

      const correctVal = parseInt(sel.dataset.correct);
      if (i === correctVal) {
        sel.textContent = i;
        sel.classList.remove("selected", "empty");
        sel.classList.add("correct");
        if (board.querySelectorAll(".empty").length === 0) {
          setTimeout(() => nextTutorialStage(), 1000);
        }
      } else {
        sel.classList.add("error-blink");
        setTimeout(() => sel.classList.remove("error-blink"), 500);
      }
    };
    keypad.appendChild(btn);
  }

  board.querySelectorAll("td.empty").forEach((td) => {
    td.onclick = () => {
      board
        .querySelectorAll("td")
        .forEach((t) => t.classList.remove("selected"));
      td.classList.add("selected");
    };
  });

  sudokuWrapper.appendChild(board);
  sudokuWrapper.appendChild(keypad);
  container.appendChild(sudokuWrapper);
}

// --- STAGE 4: PEAKS ---
function renderTutorialPeaks() {
  const container = document.getElementById("tutorial-board-container");
  container.innerHTML = "";

  const board = document.createElement("div");
  board.className = "tutorial-sudoku-board";
  let html = `<table class="sudoku-table tutorial peaks">`;

  for (let r = 0; r < 9; r++) {
    html += "<tr>";
    for (let c = 0; c < 9; c++) {
      const val = tutorialState.solution[r][c];
      const isPendingPeak = tutorialState.peaksRemaining.some(
        (p) => p.r === r && p.c === c,
      );
      const isPendingValley = tutorialState.valleysRemaining.some(
        (v) => v.r === r && v.c === c,
      );

      // Mark all OTHER peaks and valleys automatically
      let cls = "";
      if (!isPendingPeak && !isPendingValley) {
        // Simple logic for dummy peaks/valleys to show "pre-marked" state
        if ((r + c) % 5 === 0) cls = "cell-peak";
        else if ((r + c) % 7 === 0) cls = "cell-valley";
      }

      html += `<td class="${cls}" data-r="${r}" data-c="${c}">${val}</td>`;
    }
    html += "</tr>";
  }
  board.innerHTML = html + "</table>";

  board.querySelectorAll("td").forEach((td) => {
    td.onclick = () => {
      const r = parseInt(td.dataset.r);
      const c = parseInt(td.dataset.c);

      const pIdx = tutorialState.peaksRemaining.findIndex(
        (p) => p.r === r && p.c === c,
      );
      const vIdx = tutorialState.valleysRemaining.findIndex(
        (v) => v.r === r && v.c === c,
      );

      if (pIdx !== -1) {
        td.classList.add("cell-peak");
        tutorialState.peaksRemaining.splice(pIdx, 1);
      } else if (vIdx !== -1) {
        td.classList.add("cell-valley");
        tutorialState.valleysRemaining.splice(vIdx, 1);
      }

      if (
        tutorialState.peaksRemaining.length === 0 &&
        tutorialState.valleysRemaining.length === 0
      ) {
        setTimeout(() => nextTutorialStage(), 1000);
      }
    };
  });

  container.appendChild(board);
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
      el.classList.contains("jigsaw-piece"),
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

  dragClone = content.cloneNode(true);
  dragClone.classList.add("dragging-clone");

  const rect = target.getBoundingClientRect();
  dragClone.style.width = `${rect.width}px`;
  dragClone.style.height = `${rect.height}px`;
  dragClone.style.left = `${rect.left}px`;
  dragClone.style.top = `${rect.top}px`;

  document.body.appendChild(dragClone);

  dragOffsetX = rect.width / 2;
  dragOffsetY = rect.height / 2;

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
      el.classList.contains("jigsaw-piece"),
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
    const targetPieceIdx = tutorialState.jigsawSlots[targetIdx];

    // Swap or Move
    tutorialState.jigsawSlots[targetIdx] = pieceIdx;
    if (isSourceBoard) {
      tutorialState.jigsawSlots[sourceIdx] = targetPieceIdx;
    }
  } else {
    // Drop back to panel (only if source was board)
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
