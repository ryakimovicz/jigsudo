import { getDailySeed } from "./utils/random.js?v=1.5.30";
// Local generation removed per user request (Cloud Only)
import {
  generateSearchSequences,
  countSequenceOccurrences,
} from "./search-gen.js?v=1.5.30";
import { CONFIG } from "./config.js?v=1.5.30";
import { calculateRP, SCORING } from "./ranks.js?v=1.5.30";
import { isAtGameRoute } from "./utils/route-utils.js?v=1.5.30";
import { getJigsudoDateString, getJigsudoYearMonth } from "./utils/time.js?v=1.5.30";

export class GameManager {
  constructor() {
    this.currentSeed = getDailySeed();
    this.ready = this.prepareDaily(); // Initial Load
    this.cloudSaveTimeout = null;
    this.isWiping = false;
    this.isReplay = false;
    this.validationQueue = [];
    this.isProcessingQueue = false;
    // v1.3.8: Unified Session Continuity (survives refreshes for migration windows)
    const storedSession = sessionStorage.getItem("jigsudo_active_session_id");
    this.localSessionId = storedSession || Math.random().toString(36).substring(7);
    if (!storedSession) {
      sessionStorage.setItem("jigsudo_active_session_id", this.localSessionId);
    }
    this.sessionBlocked = false;
    this._throneShieldExpires = 0; // v1.2.3: Grace period for session claims
    this._lastLocalWrite = 0;      // v1.5.30: Sync Shield timer

    // v1.5.16: Clock Synchronization (Anti-drift)
    this.serverTimeOffset = parseInt(localStorage.getItem("jigsudo_server_offset") || "0");
    if (CONFIG.debugMode) console.log(`[Timer] Initial Server Offset: ${this.serverTimeOffset}ms`);

    // Listen for tab focus/visibility to force save or handle day transitions
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "hidden") {
        this.forceCloudSave();
      } else if (document.visibilityState === "visible") {
        // Handle Day Transition: Check if the puzzle has expired while the tab was backgrounded
        const newSeed = getDailySeed();
        if (this.currentSeed !== newSeed && !this.isReplay) {
          // Mid-game Safety: Don't auto-refresh if the user is currently in a game session
          const isAtGame = isAtGameRoute();
          const hasActiveProgress =
            this.state &&
            this.state.progress &&
            this.state.progress.currentStage !== "complete";

          if (isAtGame && hasActiveProgress) {
            console.log(
              "[GameManager] Day transition detected, but user is in a game. Delaying refresh.",
            );
            return;
          }

          console.log("[GameManager] Day transition detected. Refreshing puzzle...");
          const success = await this.prepareDaily();
          if (success) {
            window.dispatchEvent(
              new CustomEvent("jigsudoDayChanged", {
                detail: { oldSeed: this.currentSeed, newSeed: newSeed },
              }),
            );
          }
        }
      }
    });
  }

  async prepareDaily() {
    const newSeed = getDailySeed();
    const newStorageKey = `jigsudo_state_${newSeed}`;

    if (this.currentSeed === newSeed && this.state) {
      console.log("[GameManager] Same seed, keeping existing state.");
      return true;
    }

    this.currentSeed = newSeed;
    this.storageKey = newStorageKey;
    this.isReplay = false; // Normal start is never a replay
    this.state = null;
    return await this.init();
  }

  async init(isSilent = false) {
    // v1.4.0: Throne Shield - Grace period to claim the session without conflict 
    // after a reload or migration. 
    this._throneShieldExpires = Date.now() + 45000; 
    console.log("[GameManager] Throne Shield activated for 45s.");

    let dailyData = null;
    try {
      if (CONFIG.debugMode)
        console.log("[GameManager] Fetching daily puzzle...");
      dailyData = await this.fetchDailyPuzzle();
    } catch (e) {
      console.warn("[GameManager] Offline or Fetch Failed:", e);
    }

    const savedStateStr = localStorage.getItem(this.storageKey);
    let savedState = null;

    if (savedStateStr) {
      try {
        savedState = JSON.parse(savedStateStr);
        if (dailyData && savedState) {
          const savedVer = savedState.meta?.version || "unknown";
          const newVer = dailyData.meta?.version || "unknown";

          if (savedVer !== newVer) {
            console.warn(
              `Version mismatch! Saved: ${savedVer} vs New: ${newVer}. Wiping old save.`,
            );
            localStorage.removeItem(this.storageKey);
            savedState = null;
          }
        }
      } catch (err) {
        console.error("Error parsing save, wiping:", err);
        localStorage.removeItem(this.storageKey);
        savedState = null;
      }
    }

    if (savedState) {
      this.state = savedState;
      
      // v1.4.5 Saneamiento v7.1: El progreso local ya no debe contener 'stats'
      if (this.state && this.state.stats) {
        delete this.state.stats;
        if (CONFIG.debugMode) console.log("[GameManager] Residuo local 'progress.stats' purgado.");
      }
      // Proactively load stats to ensure this.stats is populated before syncs
      this.stats =
        JSON.parse(localStorage.getItem("jigsudo_user_stats")) || null;
      const decayOccurred = await this._ensureStats();
      const activeUid = localStorage.getItem("jigsudo_active_uid");

      if (decayOccurred && !activeUid) {
        console.log(
          "[GameManager] Local self-healing detected. Syncing guest data to storage...",
        );
        this.save(); // Save locally, but don't forceCloudSave yet if we are logged in
      }
      if (activeUid && !this.state.meta.userId) {
        this.state.meta.userId = activeUid;
      }

      // v1.5.15: Safe initialization for persistent timer fields
      if (!this.state.meta.stageStamps) this.state.meta.stageStamps = {};
      
      // If we have a persisted stageStartAt from a previous session, restore it to memory
      if (this.state.meta.stageStartAt && !this.stageStartTime) {
        this.stageStartTime = this.state.meta.stageStartAt;
        if (CONFIG.debugMode) console.log(`[Timer] Restored stageStartTime from persistence: ${this.stageStartTime}`);
      }
      
      // v1.3.0: Removed proactive ensureSessionStarted on load
      // This solves the 'Ghost Session' bug. Session only anchors on Play or Stage Start.
      if (activeUid) {
        if (CONFIG.debugMode) console.log("[GameManager] Session resumed, waiting for intent to anchor.");
      }
      if (CONFIG.debugMode)
        console.log(
          `[GameManager] Loading existing game for seed ${this.currentSeed}`,
        );

      // --- SELF-HEALING: Ensure 'data' branch exists even if local save was corrupted ---
      if (dailyData && (!this.state.data || !this.state.data.chunks)) {
        console.warn("[GameManager] Saved state missing 'data' (puzzle definition). Self-healing from Daily data...");
        
        // Re-inject static puzzle data from the server while preserving user progress
        this.state.data = {
          solution: dailyData.solution,
          initialPuzzle: dailyData.puzzle,
          chunks: dailyData.chunks,
          searchTargetsMap: dailyData.searchTargets,
          simonValues: dailyData.simonValues || [],
          codeSequence: dailyData.codeSequence || [],
        };
      }

      this.save();
      // Purge invalid history once per load
      this._healHistoryProgress();
    } else if (dailyData) {
      this.state = this.createStateFromJSON(dailyData);
      const activeUid = localStorage.getItem("jigsudo_active_uid");
      if (activeUid) {
        this.state.meta.userId = activeUid;
        // Anchor the server session for victory validation
        this.ensureSessionStarted();
      }

      // Record as played in history ONLY if it's the original day
      const seedStr = this.currentSeed.toString();
      const dateStr = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      const decayOccurred = await this._ensureStats();
      if (decayOccurred && !activeUid) {
        console.log("[GameManager] Self-healing detected on fresh start. Syncing locally...");
        this.save();
      }
      this.save();
    } else {
      console.error("[GameManager] CRITICAL: No Save & No Network.");
      if (!isSilent) {
        this.showCriticalError(
          "Error loading daily puzzle. Check connection & refresh.",
        );
      }
      return false;
    }

    if (CONFIG.debugMode) {
      console.log("Game Initialized:", this.state);
    }

    // SELF-HEALING: Ensure search targets are populated if variation exists
    if (
      this.state.jigsaw.variation &&
      (!this.state.search.targets || this.state.search.targets.length === 0)
    ) {
      console.warn(
        "[GameManager] Variation exists but search targets empty. Healing...",
      );
      await this._populateSearchTargets(this.state.jigsaw.variation);
    }

    // DEBUG: Check loaded state
    if (CONFIG.debugMode) {
      console.log(
        `[GameManager] Loaded Variation: ${this.state.jigsaw.variation}`,
      );
      console.log(
        `[GameManager] Loaded InitialPuzzle Row 0:`,
        JSON.stringify(this.state.data.initialPuzzle[0]),
      );
    }

    return true;
  }

  /**
   * Explicitly record that the user has started the current daily puzzle.
   * This is called when the user clicks the "EMPEZAR" (START) button.
   */



  async recordStart() {
    if (this.isReplay) return;

    const seedStr = this.currentSeed.toString();
    const dateStr = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;

    // v1.4.2: SERVER AUTHORITY START
    const { getCurrentUser } = await import("./auth.js?v=1.5.30");
    const user = getCurrentUser();

    if (user && !user.isAnonymous) {
      console.log("[Referee] Registering game start and maintenance check on server...");
      try {
        const { callJigsudoFunction } = await import("./db.js?v=1.5.30");
        const result = await callJigsudoFunction("startJigsudoSession", {
          seed: this.currentSeed,
          sessionId: this.localSessionId // v1.5.0: Claim server throne
        });
        
        if (result.status === "started" || result.status === "already_started") {
          console.log("[Referee] Session successfully initialized/resumed.");
          // We trust server applied decay. Local update for UI:
          this.stats.lastIntentDate = dateStr;
          this.stats.lastDecayCheck = dateStr;
          this.stats.activeSessionId = this.localSessionId;
        }
      } catch (err) {
        console.error("[Referee] Failed to initialize session on server:", err);
        // Fallback or Alert?
      }
    } else {
      // Guest/Anonymous Flow: Keep client-side decay logic
      await this._checkRankDecay();
      this.stats.lastDailyUpdate = dateStr;
      this.stats.lastDecayCheck = dateStr;
    }

    this.stats.lastMonthlyUpdate = dateStr.substring(0, 7);
    delete this.stats.lastPenaltyDate; // Clear penalty anchor when actively playing
    
    // v1.4.6: Update lastPlayed upon hitting the "Play" button
    if (this.state && this.state.meta) {
      this.state.meta.lastPlayed = new Date().toISOString();
    }

    // v1.4.6: Proactively initialize History record
    if (user && !user.isAnonymous) {
      import("./db.js?v=1.5.30").then(m => m.initializeHistoryDocument(user.uid, this.currentSeed));
    } else {
      // Local Guest History
      if (!this.stats.history) this.stats.history = {};
      if (!this.stats.history[dateStr]) {
        this.stats.history[dateStr] = { seed: this.currentSeed, played: true };
      } else {
        this.stats.history[dateStr].played = true;
      }
    }
    
    this.save(); 

    if (user && !user.isAnonymous) {
      console.log(`[GameManager] Game started for ${dateStr} (Session active).`);
      this.forceCloudSave();
    }
  }

  // _ensureHistoryRecord removed in favor of proactive initialization in recordStart.

  /**
   * Internal migration/cleanup: Distinguish between "fake" yellow days (bug)
   * and real unfinished games. Permanently DELETE fake ones from the account.
   */
  _healHistoryProgress() {
    if (!this.stats || !this.stats.history) return;

    let changed = false;
    for (const [dateStr, entry] of Object.entries(this.stats.history)) {
      if (entry.status === "played") {
        // Check if we have a saved state for this day
        const parts = dateStr.split("-");
        const seed = parseInt(parts[0] + parts[1] + parts[2]);
        const stateStr = localStorage.getItem(`jigsudo_state_${seed}`);

        let shouldPurge = false;
        if (stateStr) {
          try {
            const state = JSON.parse(stateStr);
            const stagesCount = state.progress?.stagesCompleted?.length || 0;
            const moves = (state.memory?.pairsFound > 0) || 
                          (state.jigsaw?.placedChunks?.length > 0) ||
                          (state.sudoku?.movesCount > 0);

            if (stagesCount === 0 && !moves) {
              shouldPurge = true;
            }
          } catch (e) {
            // If it's corrupted, we also purge it (unlikely to be a real game)
            shouldPurge = true; 
          }
        }

        // If it's confirmed empty (but exists!), PURGE it.
        // If stateStr is null, we DON'T purge (it might be a new device or device B).
        if (shouldPurge) {
          console.log(`[GameManager] Purging invalid history entry: ${dateStr}`);
          delete this.stats.history[dateStr];
          changed = true;
        }
      }
    }

    if (changed) {
      console.log("[GameManager] Account History Purged (Invalid entries removed).");
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
      // Sincronizar inmediatamente para limpiar otros dispositivos
      this.forceCloudSave();
    }
  }

  /**
   * Internal migration/cleanup: Purge ALL history entries and statistics
   * from before the v1.0.0 launch (2026-04-05).
   */
  _runLaunchCleanup() {
    if (!this.stats) return false;
    
    // Explicit Launch Date: April 5th, 2026
    const LAUNCH_DATE = "2026-04-05";
    
    // If we've already done this (on this device), skip.
    if (this.stats.launchCleanupV1) return false;

    if (!this.stats.history) {
      this.stats.launchCleanupV1 = true;
      return true; 
    }

    let hasBetaData = false;
    for (const dateStr of Object.keys(this.stats.history)) {
      if (dateStr < LAUNCH_DATE) {
        hasBetaData = true;
        delete this.stats.history[dateStr];
      }
    }

    if (hasBetaData) {
      console.warn("[LaunchCleanup] Beta data detected! Purging and resetting counters for v1.0.0...");
      
      this.stats.totalRP = 0;
      this.stats.monthlyRP = 0;
      this.stats.dailyRP = 0;
      this.stats.totalScoreAccumulated = 0;
      this.stats.totalTimeAccumulated = 0;
      this.stats.totalPeaksErrorsAccumulated = 0;
      
      // Reset nested counters
      this.stats.stageTimesAccumulated = {};
      this.stats.stageWinsAccumulated = {};
      this.stats.weekdayStatsAccumulated = {};

      // Rebuild what's left (e.g. if they already played on launch day)
      this._recalculateRecords(this.stats);
      
      this.stats.launchCleanupV1 = true;
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
      return true;
    }

    // No beta data, just mark as checked
    this.stats.launchCleanupV1 = true;
    localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
    return false;
  }

  async loadSpecificDay(dateStr) {
    // Check if this is the current live day
    const liveSeed = getDailySeed(); // Real Today Seed
    const parts = dateStr.split("-");
    const requestedSeed = parseInt(parts[0] + parts[1] + parts[2]);

    console.log(
      `[GameManager] Loading specific day: ${dateStr}, seed: ${requestedSeed}`,
    );

    this.storageKey = `jigsudo_state_${requestedSeed}`;
    this.currentSeed = requestedSeed;
    this.isReplay = requestedSeed !== liveSeed;

    if (this.isReplay) {
      console.log(
        "[GameManager] Replay Mode Active: Stats and RP will NOT be updated.",
      );
      // User requested that History games always start from 0
      console.log(
        "[GameManager] Replay detected: Wiping local progress for a fresh start.",
      );
      localStorage.removeItem(this.storageKey);
    } else {
      // Current live day logic
      this._ensureStats();
      const dateStrToday = `${parts[0]}-${parts[1]}-${parts[2]}`;
      const isAlreadyWon = this.stats.history[dateStrToday]?.status === "won";

      if (isAlreadyWon) {
        console.log(
          "[GameManager] Today already won: Wiping progress for a fresh replay.",
        );
        localStorage.removeItem(this.storageKey);
      } else {
        console.log(
          "[GameManager] Today in progress: Preserving state for resume.",
        );
      }
    }

    this.ready = this.init(true); // Silent re-init for history/replay
    const success = await this.ready;

    if (success) {
      // Return to home view ONLY if we are not already in a specific route (like history deep link)
      const currentHash = window.location.hash;
      const isHistoryDeepLink = currentHash.startsWith("#history/") && currentHash.split("/").length === 4;
      
      if (!isHistoryDeepLink) {
        window.location.hash = ""; 
      }
      window.scrollTo(0, 0);
    }
    return success;
  }

  async fetchDailyPuzzle() {
    const seed = this.currentSeed;
    const year = Math.floor(seed / 10000);
    const month = Math.floor((seed % 10000) / 100);
    const day = seed % 100;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    
    // Check if we are in a subfolder (like /about/)
    let prefix = "";
    const subpages = ["/about", "/contact", "/privacy", "/terms"];
    const currentPath = window.location.pathname.toLowerCase();
    if (subpages.some(p => currentPath.includes(p))) {
      prefix = "../";
    }
    
    const url = `${prefix}public/puzzles/daily-${dateStr}.json`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      return null;
    }
  }

  createStateFromJSON(json) {
    const { meta } = json;
    let data;

    // Decrypt Payload if present, otherwise fallback to legacy plaintext data
    if (json.payload) {
      try {
        const payloadStr = atob(json.payload);
        const key = String(meta.seed || this.currentSeed);
        let decrypted = "";
        for (let i = 0; i < payloadStr.length; i++) {
          decrypted += String.fromCharCode(
            payloadStr.charCodeAt(i) ^ key.charCodeAt(i % key.length),
          );
        }
        data = JSON.parse(decrypted);
      } catch (err) {
        console.error("Failed to decrypt puzzle payload:", err);
        data = {}; // Fallback empty state
      }
    } else {
      data = json.data || {};
    }

    return {
      meta: {
        seed: meta.seed || this.currentSeed,
        version: meta.version || "unknown",
        startedAt: null,
        stageStartAt: null, // v1.5.15: Persist current stage start timestamp
        stageStamps: {},    // v1.5.15: Log of start/end times per stage
        lastPlayed: "1970-01-01T00:00:00.000Z", // Initial state is always stale
        generatedBy: "static-server",
      },
      progress: {
        currentStage: "memory",
        stagesCompleted: [],
      },
      data: {
        solution: data.solution,
        initialPuzzle: data.puzzle,
        chunks: data.chunks,
        searchTargetsMap: data.searchTargets,
        simonValues: data.simonValues || [],
        codeSequence: data.codeSequence || [],
      },
      memory: {
        pairsFound: 0,
        matchedIndices: [],
        cards: [],
      },
      jigsaw: {
        placedChunks: [],
        variation: null,
      },
      sudoku: {
        currentBoard: data.puzzle,
      },
      search: {
        targets: [],
        found: [],
        version: 14,
      },
      simon: {
        values: data.simonValues || [],
        coordinates: [],
      },
      peaks: {
        foundCoords: [],
      },
      code: {
        completed: false,
        maxUnlockedLevel: 3,
      },
    };
  }

  async setJigsawVariation(variationKey) {
    if (!this.state) return;

    const oldVariation = this.state.jigsaw.variation || "0";
    const newVariation = variationKey || "0";

    // GUARD: If same variation AND targets exist, do nothing
    if (
      oldVariation === newVariation &&
      this.state.search.targets &&
      this.state.search.targets.length > 0
    )
      return;

    console.log(`[GM] Switch Variation: ${oldVariation} -> ${newVariation}`);
    if (this.state.data && this.state.data.initialPuzzle) {
      console.log(
        `[GM] Pre-Transform InitialPuzzle (0,0): ${this.state.data.initialPuzzle[0][0]}`,
      );
    }

    // 1. REVERT OLD (Inverse of Mirror is Mirror)
    if (oldVariation !== "0") {
      this.state.data.initialPuzzle = this._transformMatrix(
        this.state.data.initialPuzzle,
        oldVariation,
      );
      this.state.data.solution = this._transformMatrix(
        this.state.data.solution,
        oldVariation,
      );

      // Ensure Sudoku State Exists
      if (!this.state.sudoku) this.state.sudoku = {};

      if (!this.state.sudoku.currentBoard) {
        // Init from ALREADY REVERTED initialPuzzle -> No need to transform
        console.warn(
          "[GM] CurrentBoard missing during revert. Initializing from reverted puzzle.",
        );
        this.state.sudoku.currentBoard = JSON.parse(
          JSON.stringify(this.state.data.initialPuzzle),
        );
      } else {
        // Transform existing board
        this.state.sudoku.currentBoard = this._transformMatrix(
          this.state.sudoku.currentBoard,
          oldVariation,
        );
      }
    }

    // 2. APPLY NEW
    if (newVariation !== "0") {
      this.state.data.initialPuzzle = this._transformMatrix(
        this.state.data.initialPuzzle,
        newVariation,
      );
      this.state.data.solution = this._transformMatrix(
        this.state.data.solution,
        newVariation,
      );

      // Ensure Sudoku State Exists
      if (!this.state.sudoku) this.state.sudoku = {};

      if (!this.state.sudoku.currentBoard) {
        // Init from ALREADY TRANSFORMED initialPuzzle -> No need to transform
        console.warn(
          "[GM] CurrentBoard missing during apply. Initializing from transformed puzzle.",
        );
        this.state.sudoku.currentBoard = JSON.parse(
          JSON.stringify(this.state.data.initialPuzzle),
        );
      } else {
        // Transform existing board
        this.state.sudoku.currentBoard = this._transformMatrix(
          this.state.sudoku.currentBoard,
          newVariation,
        );
      }
    }

    this.state.jigsaw.variation = newVariation;
    await this._populateSearchTargets(newVariation);

    if (this.state.data && this.state.data.initialPuzzle) {
      console.log(
        `[GM] Post-Transform InitialPuzzle Row 0:`,
        JSON.stringify(this.state.data.initialPuzzle[0]),
      );
    }
    if (this.state.sudoku && this.state.sudoku.currentBoard) {
      console.log(
        `[GM] Post-Transform CurrentBoard Row 0:`,
        JSON.stringify(this.state.sudoku.currentBoard[0]),
      );
    }

    this.save();
  }

  /**
   * Internal helper to populate search targets based on the current variation and map.
   */
  async _populateSearchTargets(variationKey) {
    const map = this.state.data.searchTargetsMap;
    let variationData = null;

    if (map && !Array.isArray(map)) {
      variationData = map[variationKey];
    } else if (Array.isArray(map)) {
      variationData = { targets: map, simon: [] };
    }

    if (variationData) {
      // getTargetSolution now returns the already transformed solution
      const solvedBoard = this.getTargetSolution();
      this.state.search.targets = variationData.targets.map((snake, idx) => {
        if (!Array.isArray(snake) && snake.path && snake.numbers) return snake;
        if (!Array.isArray(snake)) return { id: idx, numbers: [], path: [] };
        const numbers = snake.map((pos) => solvedBoard[pos.r][pos.c]);
        return { id: idx, path: snake, numbers: numbers };
      });
      this.state.simon.coordinates = variationData.simon || [];
    } else {
      // FALLBACK: Local Generation (Async)
      await this.ensureSearchTargets();
    }
  }

  /**
   * Fallback to generate search targets locally if missing from the puzzle data.
   */
  async ensureSearchTargets() {
    if (this.state.search.targets && this.state.search.targets.length > 0)
      return;

    console.log("[GameManager] Fallback: Generating Search Targets locally...");
    try {
      const solution = this.getTargetSolution();
      const seed = this.currentSeed;

      // Dynamic import to avoid circular dependencies if any
      const { generateSearchSequences } = await import("./search-gen.js?v=1.5.30");
      const sequences = generateSearchSequences(solution, seed);

      if (sequences && sequences.length > 0) {
        this.state.search.targets = sequences;
        console.log(
          `[GameManager] Generated ${sequences.length} targets locally.`,
        );
        this.save();
        // Dispatch event to notify UI if it's already in search mode
        window.dispatchEvent(new CustomEvent("search-targets-ready"));
      }
    } catch (err) {
      console.error("[GameManager] Local Generation failed:", err);
    }
  }

  // Internal helper to transform a 9x9 matrix based on variation
  _transformMatrix(matrix, variation) {
    if (!matrix || variation === "0") return matrix;

    // Deep clone to avoid mutating original unintendedly (though here we want mutation)
    const newBoard = JSON.parse(JSON.stringify(matrix));

    if (variation === "LR" || variation === "HV") {
      // Mirror Horizontal (Left-Right)
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 3; c++) {
          const temp = newBoard[r][c];
          newBoard[r][c] = newBoard[r][c + 6];
          newBoard[r][c + 6] = temp;
        }
      }
    }

    if (variation === "TB" || variation === "HV") {
      // Mirror Vertical (Top-Bottom)
      for (let offset = 0; offset < 3; offset++) {
        const tempRow = newBoard[offset];
        newBoard[offset] = newBoard[offset + 6];
        newBoard[offset + 6] = tempRow;
      }
    }

    return newBoard;
  }

  getTargetSolution() {
    return this.state?.data?.solution || [];
  }

  // DEPRECATED: Variations are now handled by transforming the base matrices in setJigsawVariation
  getTargetSolutionWithVariation(variationKey) {
    return this.getTargetSolution();
  }

  async save(syncToCloud = true, isPenalty = false) {
    if (!this.state || this.isWiping) return;

    // --- CRITICAL FIX: Ensure local timestamp is ALWAYS updated before persistence ---
    // This marks the local progress as newer than the cloud, preventing 'Cloud Echo' loops.
    if (this.state.meta) {
      this.state.meta.lastPlayed = new Date().toISOString();
    }

    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    if (syncToCloud) this.saveCloudDebounced(5000, isPenalty);
  }

  saveCloudDebounced(delay = 5000, isPenalty = false) {
    if (this.cloudSaveTimeout) clearTimeout(this.cloudSaveTimeout);
    this.cloudSaveTimeout = setTimeout(() => {
      this.forceCloudSave(null, isPenalty);
    }, delay);
  }

  async forceCloudSave(overrideUid = null, isPenalty = false) {
    const { getCurrentUser } = await import("./auth.js?v=1.5.30");
    const user = getCurrentUser();
    if (this.isWiping) {
      console.log("[GM] Wiping in progress. Save blocked.");
      return;
    }
    if (this.cloudSaveTimeout) {
      clearTimeout(this.cloudSaveTimeout);
      this.cloudSaveTimeout = null;
    }
    if (this.conflictBlocked) return;
    if (this._processingWin) {
      console.log("[GM] Victory in progress. Debounced save blocked to prevent stale data wipe.");
      return;
    }
    try {
      const { getCurrentUser } = await import("./auth.js?v=1.5.30");
      const { saveUserProgress, saveUserStats } = await import("./db.js?v=1.5.30");

      let uid = overrideUid;
      if (!uid) {
        const user = getCurrentUser();
        if (user) uid = user.uid;
      }

      if (uid) {
        const user = getCurrentUser();
        // Skip cloud save for anonymous users unless it's an explicit override (migration)
        if (user && user.isAnonymous && !overrideUid) {
          return;
        }

        let username = user ? user.displayName : null; // Fix: Pass username to DB

        if (this.state) {
          const cloudState = this._serializeState(this.state);
          await saveUserProgress(uid, cloudState);
        }
        if (this.stats) {
          // v1.2.11/v1.5.19/v1.5.21: ZERO-POINT GUARD refined.
          // We only block if stats is truly empty AND has no history AND no stages completed.
          // But if we have an override (registration) or any progress, we save.
          const hasHistory = this.stats.history && Object.keys(this.stats.history).length > 0;
          const hasProgress = (this.state?.progress?.stagesCompleted?.length || 0) > 0;
          
          const isWonNow = this.state?.progress?.currentStage === "complete" || this.state?.progress?.won;
          const isTrulyEmpty = (this.stats.dailyRP || 0) === 0 && (this.stats.totalRP || 0) === 0 && !hasHistory && !hasProgress;
          
          if (isTrulyEmpty && !overrideUid && !isWonNow) {
            console.log("[GM] Cloud stats save skipped: Truly virgin state.");
          } else {
            // v1.5.22: Pass win flag to allow cloud adoption if this is the final save
            await saveUserStats(uid, this.stats, username, { 
              _isConfirmedWin: isWonNow,
              _isIntentionalPenalty: isPenalty 
            });
          }
        }
      }
    } catch (e) {
      console.warn("Cloud save failed", e);
    }
  }

  async clearAllData(autoReinit = true) {
    const activeUid = localStorage.getItem("jigsudo_active_uid");
    const reason = autoReinit ? "Manual Logout" : "Auth Context Switch (Login)";
    console.warn(
      `[GameManager] Wiping local data! Reason: ${reason}, Previous UID: ${activeUid}`,
    );

    this.isWiping = true;

    if (this.cloudSaveTimeout) {
      clearTimeout(this.cloudSaveTimeout);
      this.cloudSaveTimeout = null;
    }

    // Direct removals
    localStorage.removeItem("jigsudo_user_stats");
    localStorage.removeItem("jigsudo_active_uid");
    localStorage.removeItem("jigsudo_active_username");
    localStorage.removeItem("jigsudo_ranking_cache_v3");
    
    // Safety: Reset to default stats instead of null to prevent downstream crashes
    this.stats = this._getDefaultStats();

    // Pattern-based removals (clear private state/history/toggles, preserve settings)
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (
        key.startsWith("jigsudo_state_") ||
        key.startsWith("jigsudo_isPublic_") ||
        key.startsWith("jigsudo_history_")
      ) {
        localStorage.removeItem(key);
      }
    });

    this.state = null;
    if (autoReinit) {
      this.ready = this.prepareDaily();
      const res = await this.ready;
      this.isWiping = false;
      return res;
    }
    // Note: if !autoReinit, we leave isWiping=true so the auth flow
    // can finish its sync before releasing the lock.
  }

  /**
   * Surgical Reset: Only wipes progress for the current day/seed.
   * Preserves global stats, rank, and history from previous days.
   */
  async resetCurrentGame() {
    console.warn(`[GameManager] Surgical Reset for seed: ${this.currentSeed}`);

    // 1. Load Stats to revert RP and history
    const seedStr = this.currentSeed.toString();
    const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;

    let stats =
      this.stats || JSON.parse(localStorage.getItem("jigsudo_user_stats"));

    if (stats) {
      // A. Revert PARTIAL RP earned during this session (awardStagePoints)
      if (
        this.state &&
        this.state.progress &&
        this.state.progress.stagesCompleted
      ) {
        this.state.progress.stagesCompleted.forEach((stage) => {
          const p = SCORING.PARTIAL_RP[stage] || 0;
          stats.currentRP = Math.max(0, (stats.currentRP || 0) - p);
          stats.dailyRP = Math.max(0, (stats.dailyRP || 0) - p);
          stats.monthlyRP = Math.max(0, (stats.monthlyRP || 0) - p);
          stats.totalScoreAccumulated = Math.max(
            0,
            (stats.totalScoreAccumulated || 0) - p,
          );
        });
      }

      // B. Revert records from recordWin (if already won)
      if (stats.history && stats.history[today]) {
        const h = stats.history[today];
        if (h.status === "won") {
          // netChange = score - 6.0 (bonus added to currentRP etc.)
          const netChange = (h.score || 0) - 6.0;
          stats.currentRP = Math.max(0, (stats.currentRP || 0) - netChange);
          stats.dailyRP = Math.max(0, (stats.dailyRP || 0) - netChange);
          stats.monthlyRP = Math.max(0, (stats.monthlyRP || 0) - netChange);
          stats.totalScoreAccumulated = Math.max(
            0,
            (stats.totalScoreAccumulated || 0) - netChange,
          );

          // Cumulative stats
          stats.totalTimeAccumulated = Math.max(
            0,
            (stats.totalTimeAccumulated || 0) - (h.totalTime || 0),
          );
          stats.totalPeaksErrorsAccumulated = Math.max(
            0,
            (stats.totalPeaksErrorsAccumulated || 0) - (h.peaksErrors || 0),
          );

          // Deep Reversion of Stage Stats
          if (stats.stageTimesAccumulated && h.stageTimes) {
            for (const [stage, time] of Object.entries(h.stageTimes)) {
              stats.stageTimesAccumulated[stage] = Math.max(
                0,
                (stats.stageTimesAccumulated[stage] || 0) - time,
              );
              if (stats.stageWinsAccumulated) {
                stats.stageWinsAccumulated[stage] = Math.max(
                  0,
                  (stats.stageWinsAccumulated[stage] || 0) - 1,
                );
              }
            }
          }

          // Weekday Stats Reversion
          const dayIdx = new Date(today + "T12:00:00").getDay();
          if (
            stats.weekdayStatsAccumulated &&
            stats.weekdayStatsAccumulated[dayIdx]
          ) {
            const w = stats.weekdayStatsAccumulated[dayIdx];
            w.sumTime = Math.max(0, w.sumTime - (h.totalTime || 0));
            w.sumErrors = Math.max(0, w.sumErrors - (h.peaksErrors || 0));
            w.sumScore = Math.max(0, w.sumScore - (h.score || 0));
            w.count = Math.max(0, w.count - 1);
          }

          // Streak and Win Count
          stats.wins = Math.max(0, (stats.wins || 0) - 1);
          stats.totalPlayed = Math.max(0, (stats.totalPlayed || 0) - 1);
        }


        // ALWAYS delete the history entry for today on reset,
        // whether it was "won" or just "played".
        delete stats.history[today];
      }

      // AGGRESSIVE: Always recalculate records to ensure consistency
      // This is now OUTSIDE the history check to ensure ghost records are cleared even if history is empty
      this._recalculateRecords(stats);

      // Final Sanity Clamps
      stats.currentRP = Math.max(0, stats.currentRP);
      stats.dailyRP = Math.max(0, stats.dailyRP);
      stats.monthlyRP = Math.max(0, stats.monthlyRP);

      this.stats = stats;
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(stats));
      console.log("[GM] Stats after resetToday:", stats);
    }

    // 2. Wipe local execution state for this seed
    localStorage.removeItem(this.storageKey);

    // 3. Re-sync with cloud (Awaited to avoid race condition on reload)
    try {
      const { getCurrentUser } = await import("./auth.js?v=1.5.30");
      const { showNotification } = await import("./ui.js?v=1.5.30");
      const user = getCurrentUser();

      if (user && !user.isAnonymous) {
        showNotification("Sincronizando...", "info");
        console.log("[GameManager] Re-syncing cloud...");
        const freshData = await this.fetchDailyPuzzle();
        const freshState = this.createStateFromJSON(freshData);
        // We await both to ensure they are on the wire before reload
        const { saveUserProgress, saveUserStats } = await import("./db.js?v=1.5.30");
        await Promise.all([
          saveUserProgress(user.uid, this._serializeState(freshState)),
          saveUserStats(user.uid, this.stats, user.displayName),
        ]);
        console.log("[GameManager] Cloud sync complete.");
      }
    } catch (err) {
      console.error("[GameManager] Cloud re-sync failed:", err);
    }

    // 4. Reload
    console.log("Reset complete. Reloading...");
    window.location.reload();
  }

  _serializeState(state) {
    const clone = JSON.parse(JSON.stringify(state));
    if (clone.data) {
      if (Array.isArray(clone.data.solution))
        clone.data.solution = JSON.stringify(clone.data.solution);
      if (Array.isArray(clone.data.initialPuzzle))
        clone.data.initialPuzzle = JSON.stringify(clone.data.initialPuzzle);
      if (Array.isArray(clone.data.chunks))
        clone.data.chunks = JSON.stringify(clone.data.chunks);
      if (clone.data.searchTargetsMap)
        clone.data.searchTargetsMap = JSON.stringify(
          clone.data.searchTargetsMap,
        );
    }
    if (clone.sudoku && Array.isArray(clone.sudoku.currentBoard))
      clone.sudoku.currentBoard = JSON.stringify(clone.sudoku.currentBoard);
    return clone;
  }

  _deserializeState(cloudState) {
    const clone = JSON.parse(JSON.stringify(cloudState));
    if (clone.data) {
      if (typeof clone.data.solution === "string")
        clone.data.solution = JSON.parse(clone.data.solution);
      if (typeof clone.data.initialPuzzle === "string")
        clone.data.initialPuzzle = JSON.parse(clone.data.initialPuzzle);
      if (typeof clone.data.chunks === "string")
        clone.data.chunks = JSON.parse(clone.data.chunks);
      if (typeof clone.data.searchTargetsMap === "string")
        clone.data.searchTargetsMap = JSON.parse(clone.data.searchTargetsMap);
    }
    if (clone.sudoku && typeof clone.sudoku.currentBoard === "string")
      clone.sudoku.currentBoard = JSON.parse(clone.sudoku.currentBoard);
    return clone;
  }

  getState() {
    return this.state;
  }

  getUserId() {
    if (this.state?.meta?.userId) return this.state.meta.userId;
    return localStorage.getItem("jigsudo_active_uid");
  }

  setUserId(uid) {
    if (uid) localStorage.setItem("jigsudo_active_uid", uid);
    else localStorage.removeItem("jigsudo_active_uid");
    
    // Pattern: During a wipe/login transition, we update the UID in memory
    // but we MUST NOT save yet, as the cloud sync will fulfill the state.
    if (this.state && this.state.meta) {
      this.state.meta.userId = uid;
      if (!this.isWiping) this.save();
      else console.log("[GameManager] setUserId: Wipe lock active, skipping save.");
    }
  }

  async advanceStage() {
    const stages = ["memory", "jigsaw", "sudoku", "peaks", "search", "code"];
    const currentIdx = stages.indexOf(this.state.progress.currentStage);
    if (currentIdx >= 0 && currentIdx < stages.length - 1) {
      const nextStage = stages[currentIdx + 1];
      const currentStage = this.state.progress.currentStage;
      this.state.progress.currentStage = nextStage;
      if (!this.state.progress.stagesCompleted.includes(currentStage)) {
        this.state.progress.stagesCompleted.push(currentStage);
        await this.awardStagePoints(currentStage);
      }
      this.forceCloudSave();
      window.dispatchEvent(
        new CustomEvent("stage-changed", { detail: nextStage }),
      );
    }
  }

  updateProgress(section, data) {
    if (!this.state || !this.state[section]) {
      if (section === "stats") this.state.stats = {};
      else return;
    }
    
    // v1.2.16: Detect error increment for live penalty
    const oldErrors = this.state.stats?.peaksErrors || 0;
    this.state[section] = { ...this.state[section], ...data };
    const newErrors = this.state.stats?.peaksErrors || 0;

    // Ensure timestamp is refreshed for any progress change
    if (this.state.meta) {
      this.state.meta.lastPlayed = new Date().toISOString();
    }

    this.save();

    // If errors increased, recalculate and sync to cloud immediately
    if (section === "stats" && newErrors > oldErrors) {
      this._recalculateNetStats(true);
    }
  }

  async awardStagePoints(stage) {
    const points = SCORING.PARTIAL_RP[stage] || 0;
    if (points <= 0) return;

    // GUARD 1: Replay Mode (Never award points for non-current games)
    if (this.isReplay) {
      console.log(`[RP] Replay mode active. No points for ${stage}.`);
      return;
    }

    // GUARD 2: Already Completed (Prevent refresh farming)
    if (this.state.progress.stagesCompleted.includes(stage)) {
      console.log(`[RP] Stage ${stage} already completed. Skipping points.`);
      return;
    }

    // GUARD 3: Game Already Won (Prevent post-win farming)
    const seedStr = this.currentSeed.toString();
    const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
    if (
      this.stats &&
      this.stats.history &&
      this.stats.history[today] &&
      this.stats.history[today].status === "won"
    ) {
      console.log(`[RP] Game already won today. No extra points for ${stage}.`);
      return;
    }

    if (this._processingWin) return;

    let stats =
      this.stats ||
      JSON.parse(localStorage.getItem("jigsudo_user_stats")) ||
      {};

    // v1.5.18: Consolidate scoring into _recalculateNetStats. 
    // We only update the raw accumulated counter for technical history, 
    // but the displayed RP will be derived from session progress.
    stats.totalScoreAccumulated = (stats.totalScoreAccumulated || 0) + points;

    if (!this._processingWin) {
      if (!this.state.progress.stagesCompleted.includes(stage)) {
        this.state.progress.stagesCompleted.push(stage);
        
        // History record is now proactively initialized in recordStart


        // CRITICAL: Persist stage completion immediately to local storage
        this.save();
      }
    }
    
    // v1.3.5/v1.4.1/v1.5.18/v1.5.21: Internal UI/Stats update
    this.stats = stats;
    await this._recalculateNetStats(); // v1.5.21: Ensure points are ready before background syncs

    // v1.4.1: ASYNC REFEREE (Background Validation)
    this._enqueueValidation(stage, points);
  }

  /**
   * Adds a stage result to the background processing queue.
   */
  _enqueueValidation(stage, points) {
    // v1.2.6: Fix stageTime retrieval (pull from meta.stageTimes converted to seconds)
    const stageTimeMs = this.state.meta?.stageTimes?.[stage] || 0;
    const stageTime = Math.floor(stageTimeMs / 1000);
    
    // Safety check for peaksErrors (ensure we pull from the live session)
    const peaksErrors = (this.state.stats && this.state.stats.peaksErrors) || 0;
    
    this.validationQueue.push({
      stage,
      points,
      stageTime,
      stamps: this.state.meta?.stageStamps?.[stage] || {}, // v1.5.17: Absolute proof for Referee
      peaksErrors,
      seed: this.currentSeed
    });

    console.log(`[Referee] Stage ${stage} queued for background validation.`);
    this._processValidationQueue();
  }

  /**
   * Background processor for the validation queue.
   * Ensures sequential delivery to the server to avoid race conditions.
   */
  async _processValidationQueue() {
    if (this.isProcessingQueue || this.validationQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-functions.js");
    const functions = getFunctions();
    const submitStageResult = httpsCallable(functions, "submitStageResult");
    const { getCurrentUser } = await import("./auth.js?v=1.5.30");
    const { saveUserStats } = await import("./db.js?v=1.5.30");

    while (this.validationQueue.length > 0) {
      const task = this.validationQueue[0];
      const user = getCurrentUser();

      if (!user || user.isAnonymous) {
        console.warn("[Referee] Background validation skipped: No registered user.");
        this.validationQueue.shift();
        continue;
      }

      try {
        console.log(`[Referee] Validating stage ${task.stage} (Asynchronous)...`);
        
        const result = await submitStageResult({
          stage: task.stage,
          seed: task.seed,
          stageTime: task.stageTime,
          peaksErrors: task.peaksErrors
        });

        if (result.data.status === "success" || result.data.status === "already_verified") {
          console.log(`[Referee] Stage ${task.stage} verified by server! Points awarded.`);
          this.validationQueue.shift(); // Remove from queue only on success
          
          // v1.5.29: Instant point adoption. Update local stats immediately so ranking updates.
          await this._recalculateNetStats();

          // Trigger a global event so UI components (like Ranking) know they can refresh
          window.dispatchEvent(new CustomEvent("stageVerified", { detail: task }));
        } else {
          console.warn("[Referee] Server rejected stage validation:", result.data);
          this.validationQueue.shift(); // Remove anyway to avoid infinite loops, but log it
        }
      } catch (error) {
        // v1.2.6: UNCLOGGER - Distinguish between connectivity issues and logical rejections
        // Logic errors shouldn't be retried because they will fail again (clean up the queue)
        const logicCodes = ["out-of-range", "failed-precondition", "invalid-argument"];
        const isLogicError = logicCodes.includes(error.code) || 
                             (error.message && error.message.includes("too fast"));

        if (isLogicError) {
          console.warn(`[Referee] Server REJECTED validation for ${task.stage}: ${error.message}. Skipping to unclog queue.`);
          this.validationQueue.shift(); // Remove permanent failure
          continue; // Proceed with next item
        }

        console.error(`[Referee] Connection error during stage ${task.stage} validation. Retrying later...`, error);
        // On network error, stop processing this turn to allow retries later
        this.isProcessingQueue = false;
        break; 
      }

      // v1.5.31: REDUNDANT SAVE REMOVED. 
      // RP updates are now handled exclusively by _recalculateNetStats() above.
      // progressMap updates are handled by standard save() calls during gameplay.
    }

    this.isProcessingQueue = false;
  }

  /**
   * Updates bestScore immediately if current partial progress exceeds it.
   * Does NOT include Time Bonus (only applied on Win).
   */
  _updateBestScore() {
    // 1. Sum Points from Completed Stages
    let currentScore = 0;
    this.state.progress.stagesCompleted.forEach((stage) => {
      currentScore += SCORING.PARTIAL_RP[stage] || 0;
    });

    // 2. Subtract Penalties (Peaks Errors)
    const peaksErrors = this.state.stats?.peaksErrors || 0;
    currentScore -= peaksErrors * SCORING.ERROR_PENALTY_RP;

    // 3. Update Best Score if exceeded
    currentScore = Math.max(0, currentScore); // No negative scores

    if (!this.stats) this._ensureStats();

    if (currentScore > (this.stats.bestScore || 0)) {
      console.log(`[Score] New Best Score (Partial): ${currentScore}`);
      this.stats.bestScore = currentScore;
      this.save();
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
    }
  }
  /**
   * Recalculates Daily, Monthly and Total RP based on the current session progress 
   * and the historic baseline found in the stats object.
   * v1.5.30: Consolidated Level-End logic.
   * 
   * @param {boolean} isPenalty - Force cloud save even if score drops
   * @param {boolean} skipPersistence - Skip writing back to the cloud (Sync reconciliation)
   */
  async _recalculateNetStats(isPenalty = false, skipPersistence = false) {
    if (!this.stats) await this._ensureStats();
    const stats = this.stats;

    // 0. Temporal Reconciliation (v1.5.30: Absolute Truth Architecture)
    const today = getJigsudoDateString();
    const currentMonth = getJigsudoYearMonth();

    console.log(`[RP-DEBUG] Recalculating. Today: ${today}, stagesCompleted: ${this.state.progress.stagesCompleted.length}`);

    // If day changed, consolidate previous daily points into the historic baseline
    if (stats.lastDailyUpdate && stats.lastDailyUpdate !== today) {
      console.log(`[Timer] Daily transition: ${stats.lastDailyUpdate} -> ${today}. Consolidating points.`);
      stats.dailyRP = 0; // Reset today's points
      stats.lastDailyUpdate = today;
    }
    
    // If month changed, reset monthly points
    if (stats.lastMonthlyUpdate && stats.lastMonthlyUpdate !== currentMonth) {
       console.log(`[Timer] Monthly transition: ${stats.lastMonthlyUpdate} -> ${currentMonth}.`);
       stats.monthlyRP = 0;
       stats.lastMonthlyUpdate = currentMonth;
    }

    // 1. Calculate Session Components (Today's Achievement)
    const completedStagesToday = this.state.progress.stagesCompleted || [];
    const baseAchievementToday = completedStagesToday.length * 1.0;
    
    // v1.5.39: Anti-regression for Session Errors
    const errorsToday = (this.state.stats && this.state.stats.peaksErrors) || 0;
    let penaltyPointsToday = Math.max(this._lastPenaltyPoints || 0, errorsToday * SCORING.ERROR_PENALTY_RP);
    this._lastPenaltyPoints = penaltyPointsToday;

    let winBonusToday = 0;
    if (this.state.progress.currentStage === "complete" || this.state.progress.won) {
       winBonusToday = stats.lastBonus || 0;
    }

    // 2. SESSION ANCHORING: Fixed delta-based math for stability (v1.5.42)
    // The "Baseline" is everything that happened before TODAY.
    // We anchor it once per browser session to ensure totalRP = Baseline + dailyNet.
    
    const cloudTotal = stats.totalRP || 0;
    const cloudMonthly = stats.monthlyRP || 0;
    const cloudDaily = stats.dailyRP || 0;

    // Reset baseline if day changed significantly or if we haven't anchored yet
    if (this._sessionBaselineTotal === undefined || this._sessionBaselineTotal === null || (stats.lastDailyUpdate && stats.lastDailyUpdate !== today)) {
        // v1.5.42: Surgical Baseline Extraction
        // If it's a new day, current daily points are 0, so Baseline = Total.
        // If we are resumed mid-day, Baseline = Total - Daily.
        const currentDailyPoints = stats.lastDailyUpdate === today ? cloudDaily : 0;
        this._sessionBaselineTotal = Number((cloudTotal - currentDailyPoints).toFixed(3));
        this._sessionBaselineMonthly = Number((cloudMonthly - currentDailyPoints).toFixed(3));
        console.log(`[RP-DEBUG] Session Anchored. BaselineTotal: ${this._sessionBaselineTotal}, BaselineMonthly: ${this._sessionBaselineMonthly}`);
    }

    // THE UNIFIED INCREMENTAL FORMULA (Authority: Session Base + Current Day Net)
    const dailyNet = Math.max(0, baseAchievementToday + winBonusToday - penaltyPointsToday);
    const totalNet = Number((this._sessionBaselineTotal + dailyNet).toFixed(3));
    const monthlyNet = Number((this._sessionBaselineMonthly + dailyNet).toFixed(3));

    console.log(`[RP-DEBUG] Anchored Trace -> Total RP: ${totalNet} (Base: ${this._sessionBaselineTotal}, Today: ${dailyNet}), Daily: ${dailyNet}`);
    
    if (!this.isReplay) {
      stats.dailyRP = dailyNet;
      stats.monthlyRP = monthlyNet;
      stats.totalRP = totalNet;
      
      stats.lastDailyUpdate = today;
      stats.lastMonthlyUpdate = currentMonth;
    }

    this.stats = stats;
    this.stats.lastLocalUpdate = Date.now(); // v1.5.30: Instant Freshness
    this._lastLocalWrite = Date.now();       // v1.5.30: Shield engagement
    localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));

    // 4. Persistence
    if (!skipPersistence && !this._processingWin) {
      const { getCurrentUser } = await import("./auth.js?v=1.5.30");
      const user = getCurrentUser();
      if (user && !user.isAnonymous) {
        const { saveUserStats } = await import("./db.js?v=1.5.30");
        
        // v1.5.31: Robust Penalty Detection
        // If there are peaks errors, we MUST treat this as an intentional penalty 
        // to bypass anti-regression guards, even if the caller didn't specify it.
        const effectivePenalty = isPenalty || penaltyPointsToday > 0;
        
        await saveUserStats(user.uid, this.stats, user.displayName, { 
          _isIntentionalPenalty: effectivePenalty 
        });
      }
    }

    // Notify UI
    window.dispatchEvent(new CustomEvent("userStatsUpdated", { detail: this.stats }));
  }



  showCriticalError(message) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.9)";
    overlay.style.color = "white";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "9999";
    overlay.style.fontFamily = "sans-serif";
    overlay.style.textAlign = "center";
    overlay.style.padding = "20px";
    overlay.innerHTML = `
        <h2 style="color: #ff5555; margin-bottom: 20px;">!! Status Error detected</h2>
        <p style="font-size: 1.2rem; margin-bottom: 30px;">${message}</p>
        <button onclick="window.location.reload()" style="background: #4a90e2; color: white; border: none; padding: 12px 24px; font-size: 1rem; border-radius: 8px; cursor: pointer;">Reload App</button>
      `;
    document.body.appendChild(overlay);
  }

  async _ensureStats() {
    // Ensure stats object exists
    if (!this.stats) {
      this.stats = JSON.parse(localStorage.getItem("jigsudo_user_stats"));
    }

    // Initialize stats if null or missing critical fields
    if (!this.stats) {
      this.stats = this._getDefaultStats();
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
    }

    // Ensure critical nested objects exist
    if (!this.stats.history) this.stats.history = {};
    if (!this.stats.stageTimesAccumulated)
      this.stats.stageTimesAccumulated = {};
    if (!this.stats.stageWinsAccumulated) this.stats.stageWinsAccumulated = {};
    if (!this.stats.weekdayStatsAccumulated)
      this.stats.weekdayStatsAccumulated = {};
    if (this.stats.manualRPAdjustment === undefined)
      this.stats.manualRPAdjustment = 0;

    if (this.state && !this.state.meta.stageTimes)
      this.state.meta.stageTimes = {};
    
    // 3. Launch Cleanup (Purge pre-production beta data)
    const cleanupDone = this._runLaunchCleanup();
    if (cleanupDone) {
      console.log("[LaunchCleanup] Beta data purged. Syncing to cloud...");
      this.forceCloudSave();
    }

    // 4. Automated Stats Healer: Fix discrepancies between history and accumulated stats
    const healerChanged = this._healStatsInconsistency();

    // Return the decay check promise so callers can await it if needed
    const decayResult = await this._checkRankDecay();
    return healerChanged || decayResult;
  }

  /**
   * Automatic cross-check to detect and heal inconsistencies between
   * cumulative stats and the history log.
   */
  _healStatsInconsistency() {
    if (!this.stats || !this.stats.history) return;

    const wonHistoryCount = Object.values(this.stats.history).filter(
      (h) => h.status === "won",
    ).length;
    const currentWins = this.stats.wins || 0;

    // Advanced Triggers:
    // 1. Fundamental win count mismatch
    const countMismatch = wonHistoryCount !== currentWins;
    // 2. Missing date markers while history has entries (fixes new users/sync gaps)
    const missingDates = wonHistoryCount > 0 && !this.stats.lastDailyUpdate;
    // 3. Hierarchy paradox (Hoy > Mes or Mes > Siempre) - v1.3.0
    const dailyRP = this.stats.dailyRP || 0;
    const monthlyRP = this.stats.monthlyRP || 0;
    const totalRP = this.stats.totalRP || 0;
    const hierarchyMismatch = (monthlyRP < dailyRP) || (totalRP < monthlyRP);
    
    // 4. One-time forced maintenance for the current version (RP reconstruction fix)
    const needsMaintenance = this.stats.integrityChecked !== "1.3.0";

    if (countMismatch || missingDates || needsMaintenance || hierarchyMismatch) {
      console.warn(
        `[Healer] Integrity check triggered: countMismatch=${countMismatch}, missingDates=${missingDates}, hierarchyMismatch=${hierarchyMismatch}, needsMaintenance=${needsMaintenance}. Reconstructing...`,
      );
      this._recalculateRecords(this.stats);
      
      // Hierarchy Healing (v1.5.30: totalRP is the anchor)
      this.stats.monthlyRP = Math.max(this.stats.monthlyRP || 0, this.stats.dailyRP || 0);
      this.stats.totalRP = Math.max(this.stats.totalRP || 0, this.stats.monthlyRP || 0);

      this.stats.integrityChecked = "1.5.30"; // Prevent repeated reconstruction
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
      
      // v1.2.11: DECOUPLED CLOUD SAVE.
      // We no longer push healed stats immediately to avoid racing with account transitions.
      // Persistence will happen during the next natural save event.
      
      return true; // Indicate changes made
    }
    return false;
  }

  async _checkRankDecay(targetStats = null) {
    let stats =
      targetStats ||
      this.stats ||
      JSON.parse(localStorage.getItem("jigsudo_user_stats"));
    if (!stats) return false;

    const seedStr = this.currentSeed.toString();
    const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
    const currentMonth = today.substring(0, 7); // "YYYY-MM"

    // Use lastDailyUpdate if available (more reliable for daily sync)
    const lastCheck =
      stats.lastDailyUpdate || stats.lastDecayCheck || stats.lastPlayedDate;
    let changed = false;

    if (lastCheck && lastCheck !== today) {
      const lastDate = new Date(lastCheck + "T12:00:00Z");
      const currDate = new Date(today + "T12:00:00Z");
      const diffDays = Math.round((currDate - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays >= 1) {
        // 1. Reset Daily RP
        if (stats.dailyRP !== 0) {
          stats.dailyRP = 0;
          changed = true;
        }

        // 2. Reset Monthly RP
        const lastMonth = lastCheck.substring(0, 7);
        if (currentMonth !== lastMonth && stats.monthlyRP !== 0) {
          stats.monthlyRP = 0;
          stats.monthlyWinsAccumulated = 0;
          stats.monthlyPeaksErrorsAccumulated = 0;
          stats.monthlyBonusesAccumulated = 0;
          changed = true;
        }

        // 3. Decay Penalty (Missed full Jigsudo days of INTENTIAL play)
        // Uses lastPenaltyDate (if exists) or lastDailyUpdate as the specific anchor for "Safe vs Unsafe"
        const lastIntent = stats.lastPenaltyDate || stats.lastDailyUpdate || stats.lastPlayedDate;
        if (lastIntent && lastIntent !== today) {
          const lastIntentDate = new Date(lastIntent + "T12:00:00Z");
          const intentDiff = Math.round((currDate - lastIntentDate) / (1000 * 60 * 60 * 24));
          
          if (intentDiff > 1) {
            const missed = intentDiff - 1;
            const { getRankData } = await import("./ranks.js?v=1.5.30");
            let currentSimulatedRP = stats.totalRP || 0;
            
            for (let i = 0; i < missed; i++) {
              const rankInfo = getRankData(currentSimulatedRP);
              const penaltyForDay = 5 + rankInfo.level;
              currentSimulatedRP = Math.max(0, currentSimulatedRP - penaltyForDay);
              if (currentSimulatedRP === 0) break;
            }
            
            if ((stats.totalRP || 0) !== currentSimulatedRP) {
               console.warn(`[Decay] Applied penalty for ${missed} days. RP: ${stats.totalRP} -> ${currentSimulatedRP}`);
               stats.totalRP = currentSimulatedRP;
               stats.monthlyRP = Math.min(stats.monthlyRP || 0, stats.totalRP);
               changed = true;
            }
            
            // Advance the penalty anchor to "yesterday" so we don't penalize these same days again tomorrow
            const anchorDate = new Date(currDate.getTime());
            anchorDate.setUTCDate(anchorDate.getUTCDate() - 1);
            stats.lastPenaltyDate = anchorDate.toISOString().substring(0, 10);
          }
        }

        // 4. Strict Streak Reset (Missed full Jigsudo days of WINNING)
        // Uses lastPlayedDate (Victory) as the anchor.
        if (stats.lastPlayedDate && stats.lastPlayedDate !== today) {
          const lastWinDate = new Date(stats.lastPlayedDate + "T12:00:00Z");
          const streakDiff = Math.round((currDate - lastWinDate) / (1000 * 60 * 60 * 24));
          
          if (streakDiff > 1 && stats.currentStreak !== 0) {
            console.log(`[Streak] Win missed yesterday (Last win: ${stats.lastPlayedDate}). Resetting streak to 0.`);
            stats.currentStreak = 0;
            changed = true;
          }
        }
      }
    } else if (!lastCheck) {
      // NEW USER: Fundamental initialization of date markers
      console.log("[Decay] Initializing date markers for new user.");
      // We explicitly DO NOT set lastDailyUpdate / lastMonthlyUpdate here. 
      // They should only be set when the user actively clicks "EMPEZAR".
      stats.lastDecayCheck = today;
      changed = true;
    }

    if (changed) {
      stats.lastDecayCheck = today;
      stats.lastLocalUpdate = Date.now();
      if (!targetStats) {
        this.stats = stats;
        localStorage.setItem("jigsudo_user_stats", JSON.stringify(stats));
      }
    }
    return changed;
  }

  /**
   * v1.5.16: Returns the current time normalized with the server clock.
   */
  _getServerNow() {
    return Date.now() + (this.serverTimeOffset || 0);
  }

  updateServerOffset(serverTimeMs) {
    if (!serverTimeMs) return;
    const now = Date.now();
    const newOffset = serverTimeMs - now;
    
    // Smooth update: if the difference is significant (> 1s), we update
    if (Math.abs(newOffset - this.serverTimeOffset) > 1000) {
      this.serverTimeOffset = newOffset;
      localStorage.setItem("jigsudo_server_offset", newOffset.toString());
      if (CONFIG.debugMode) console.log(`[Timer] Synchronized Clock Drift. New Offset: ${newOffset}ms`);
    }
  }

  startStageTimer(stage) {
    this.currentStage = stage;
    const now = this._getServerNow(); // Normalized

    // v1.5.16: ABSOLUTE STICKY LOGIC
    // If we already have a START stamp for this stage in meta, WE DO NOT OVERWRITE IT.
    // This allows the timer to keep running from the original start across devices.
    if (this.state && this.state.meta) {
      if (!this.state.meta.stageStamps) this.state.meta.stageStamps = {};
      
      const existingStamp = this.state.meta.stageStamps[stage]?.start;
      
      if (!existingStamp) {
        // First time starting this level
        this.state.meta.stageStamps[stage] = {
           start: new Date(now).toISOString(),
           startMs: now // Source of truth for duration math
        };
        if (CONFIG.debugMode) console.log(`[Timer] Stage ${stage} started (New): ${this.state.meta.stageStamps[stage].start}`);
        this.save();
      } else {
        // Resuming level
        if (CONFIG.debugMode) console.log(`[Timer] Stage ${stage} resumed from original start: ${existingStamp}`);
      }
      
      // Memory hook for live duration calculation
      this.stageStartTime = this.state.meta.stageStamps[stage].startMs || new Date(existingStamp).getTime();
    } else {
      // Fallback (redundant)
      this.stageStartTime = now;
    }
    
    // Safety: Ensure server knows we are playing today if logged in
    this.ensureSessionStarted();
  }

  /**
   * Calls the Cloud Function to anchor the start time on the server.
   */
  /**
   * Proactive Maintenance Check (v1.5.2)
   * Calls the server logic to check for decay without claiming a session or shield.
   */
  async checkMaintenance() {
    try {
      const { callJigsudoFunction } = await import("./db.js?v=1.5.30");
      await callJigsudoFunction("startJigsudoSession", { onlyMaintenance: true });
      console.log("[Maintenance] Proactive check triggered successfully.");
    } catch (err) {
      console.warn("[Maintenance] Proactive check failed (non-critical):", err);
    }
  }

  async ensureSessionStarted() {
    const { getCurrentUser } = await import("./auth.js?v=1.5.30");
    const user = getCurrentUser();
    if (user && !user.isAnonymous) {
        try {
            const { callJigsudoFunction } = await import("./db.js?v=1.5.30");
            const result = await callJigsudoFunction("startJigsudoSession", {
                sessionId: this.localSessionId
            });
            console.log("[Sync] Server Session Anchor:", result);
            
            // v1.2.3: Activate Throne Shield - 10s grace period to allow Firestore to update its cache
            this._throneShieldExpires = Date.now() + 10000;
        } catch (err) {
            console.warn("[Sync] Failed to anchor server session:", err);
        }
    }
  }

  stopStageTimer() {
    // v1.5.16: ELAPSED TIME CALCULATION (End - Sticky Start)
    if (!this.currentStage) return;

    const startAnchor = (this.state?.meta?.stageStamps?.[this.currentStage]?.startMs) 
                     || (this.state?.meta?.stageStamps?.[this.currentStage]?.start ? new Date(this.state.meta.stageStamps[this.currentStage].start).getTime() : null)
                     || this.stageStartTime;

    if (!startAnchor) {
      console.warn(`[Timer] Cannot stop stage ${this.currentStage}: No start anchor found.`);
      return;
    }

    const now = this._getServerNow();
    const duration = now - startAnchor;
    
    // Ensure duration is never negative
    const safeDuration = Math.max(0, duration);

    // Record end stamp and finalize level persistence
    if (this.state && this.state.meta) {
        if (!this.state.meta.stageStamps) this.state.meta.stageStamps = {};
        if (!this.state.meta.stageStamps[this.currentStage]) this.state.meta.stageStamps[this.currentStage] = {};
        
        this.state.meta.stageStamps[this.currentStage].end = new Date(now).toISOString();
        this.state.meta.stageStamps[this.currentStage].endMs = now;
        
        // Remove the live session anchor to prepare for the next stage
        this.state.meta.stageStartAt = null; 
        this.save();
    }

    if (CONFIG.debugMode) console.log(`[Timer] Stage ${this.currentStage} finished. Total Elapsed: ${Math.floor(safeDuration/1000)}s`);

    this.recordStageTime(this.currentStage, safeDuration);
    this.currentStage = null;
    this.stageStartTime = null;
  }

  recordStageTime(stage, durationMs) {
    if (!this.state) return;
    if (!this.state.meta.stageTimes) this.state.meta.stageTimes = {};
    const current = this.state.meta.stageTimes[stage] || 0;
    this.state.meta.stageTimes[stage] = current + durationMs;
    this.save();
  }

  updateCloudHistory(cloudHistoryMap) {
    if (!cloudHistoryMap || !this.stats) return;

    // v1.4.6/7: Win Lock Protection (storage-aware)
    const winLock = parseInt(localStorage.getItem("jigsudo_win_lock") || "0");
    if (Date.now() < winLock) {
        console.log("[Sync] History win-lock active (storage). Skipping sub-collection merge.");
        return;
    }
    
    let changed = false;
    if (!this.stats.history) {
      this.stats.history = {};
      changed = true;
    }
    
    // Merge logic: Add missing or check if cloud has a win that local doesn't
    Object.keys(cloudHistoryMap).forEach(dateKey => {
      const cloudItem = cloudHistoryMap[dateKey];
      const localItem = this.stats.history[dateKey];
      
      const cloudWon = cloudItem.original?.won === true || cloudItem.best?.won === true;
      
      if (!localItem) {
        this.stats.history[dateKey] = cloudItem;
        changed = true;
      } else {
        const localWon = localItem.original?.won === true || localItem.best?.won === true;
        
        if (cloudWon && !localWon) {
          this.stats.history[dateKey] = cloudItem;
          changed = true;
        }
      }
    });
    
    if (changed) {
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
      window.dispatchEvent(new CustomEvent("userStatsUpdated"));
    }
  }

  async handleCloudSync(remoteProgress, remoteStats, remoteRequest, remoteSettings) {
    if (this._isRestoring) return;

    // 1. Victory Lock Protection
    const winLock = parseInt(localStorage.getItem("jigsudo_win_lock") || "0");
    if (Date.now() < winLock) {
      console.log("[Sync] Victory in progress. Delaying sync to prevent state wipe.");
      return;
    }

    // 2. Stats Synchronization Logic
    if (remoteStats) {
      // v1.5.0: ECHO INHIBITION
      const remoteSessionId = remoteStats.stats ? remoteStats.stats.activeSessionId : remoteStats.activeSessionId;
      
      // v1.5.7: Allow echo adoption IF ranking points differ (Root priority)
      const rankFields = ["dailyRP", "monthlyRP", "totalRP"];
      const hasRankDiscrepancy = rankFields.some(f => (remoteStats[f] || 0) !== (this.stats ? (this.stats[f] || 0) : 0));
      
      if (remoteSessionId === this.localSessionId && !hasRankDiscrepancy) {
        console.log("[Sync] Skipping echo (Scores match, Session match).");
      } else {
        const localTS = this.stats ? (this.stats.lastLocalUpdate || 0) : 0;
        const remoteTS = remoteStats.lastLocalUpdate || 0;
        
        // Adoption Criteria (v1.5.19: Local Priority)
        const isMigration = (remoteStats.schemaVersion || 0) >= 7 && (this.stats?.schemaVersion || 0) < 7;
        const isRemoteNewer = remoteTS > localTS;
        
        // v1.5.30: Sync Shield (Grace Period)
        // If we just wrote to the cloud, ignore slightly newer snapshots from the same session
        // that still have the old score. 8s is usually enough for Firestore propagation.
        const isWithinGracePeriod = Date.now() - (this._lastLocalWrite || 0) < 8000;
        const isProtectedSession = remoteSessionId === this.localSessionId;
        
        if (isProtectedSession && hasRankDiscrepancy && isWithinGracePeriod) {
          console.log("[Sync] Shield Active: Ignoring potentially stale cloud snapshot during grace period.");
          return;
        }

        if (!this.stats || isRemoteNewer || this.isWiping || isMigration) {
          console.log(`[Sync] Adopting remote stats (RemoteTS: ${remoteTS} > LocalTS: ${localTS})`);
          
          // Unpack nested stats map into flat local object (v1.5.0 Replica Support)
          const newStats = { ...remoteStats };
          if (remoteStats.stats) {
            // v1.5.30 Protection: Do not let nested stats shadow root ranking fields
            // v1.5.30+: Expanded to include all potential aliases like currentRP and score
            const protectedKeys = ["dailyRP", "monthlyRP", "totalRP", "currentRP", "score", "lastDailyUpdate", "lastMonthlyUpdate", "isPublic", "schemaVersion"];
            const cleanMap = { ...remoteStats.stats };
            protectedKeys.forEach(k => delete cleanMap[k]);
            
            Object.assign(newStats, cleanMap);
            delete newStats.stats;
          }
          
          this.stats = newStats;
          
          // v1.5.32 Reconciliation: Re-apply current session achievements on top of cloud baseline
          // We MUST write back the correction (e.g. 2.5) to the cloud if the server 
          // naive integer score (e.g. 4.0) differs from our local penalized truth.
          await this._recalculateNetStats(false, false); 
          
          this._recalculateRecords(this.stats);
          localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
          window.dispatchEvent(new CustomEvent("userStatsUpdated", { detail: this.stats }));
        } else {
          console.log("[Sync] Remote stats are older or equal. Skipping adoption (Echo Prevention).");
        }
      }
    }

    // 3. Progress Synchronization Logic (Game State)
    if (remoteProgress) {
      // v1.5.34: Allow session stats (errors, etc.) to be adopted from the cloud.
      let hydratedProgress = this._deserializeState(remoteProgress);

      const remoteSeed = Number(hydratedProgress.meta.seed);
      const localSeed = Number(this.currentSeed);

      if (this.currentSeed === null) {
        this.currentSeed = remoteSeed;
        this.storageKey = `jigsudo_state_${this.currentSeed}`;
      } else if (remoteSeed !== localSeed) {
        console.warn(`[Sync] Seed mismatch (Remote: ${remoteSeed}, Local: ${localSeed}). Ignoring remote.`);
        return;
      }

      const remoteTime = new Date(hydratedProgress.meta.lastPlayed).getTime();
      const localTime = this.state ? new Date(this.state.meta.lastPlayed).getTime() : 0;

      // Logic: If remote is significantly newer ( > 1s ), handle adoption
      if (!this.state || remoteTime > localTime + 1000 || this.isWiping) {
        // v1.4.6 History Safety: Force adoption if remote has today's win
        const todayStr = getJigsudoDateString();
        const remoteWonToday = remoteStats && remoteStats.history?.[todayStr]?.original?.won === true;
        const localWonToday = this.stats?.history?.[todayStr]?.original?.won === true;
        const victorySyncNeeded = remoteWonToday && !localWonToday;

        if (this.isWiping || !this.state || remoteTime > localTime + 60000 || victorySyncNeeded) {
          console.log(`[Sync] FORCE ADOPTING cloud progress (Victory Needed: ${victorySyncNeeded}).`);
          
          // v1.5.33: Session Stats Protection
          // Preserve local errors/peaks progress to avoid RP rebounds during sync.
          if (this.state && this.state.stats && hydratedProgress.stats) {
            const localErrors = this.state.stats.peaksErrors || 0;
            const remoteErrors = hydratedProgress.stats.peaksErrors || 0;
            hydratedProgress.stats.peaksErrors = Math.max(localErrors, remoteErrors);
            console.log(`[Sync] Merged Peaks Errors: local=${localErrors}, remote=${remoteErrors} -> Final: ${hydratedProgress.stats.peaksErrors}`);
          }

          this.state = hydratedProgress;
          this.save(false); // Silent save
          window.location.reload(); 
        } else if (remoteTime > localTime + 1000) {
          // If seeds match and it's just a bit newer, show conflict modal
          this.showConflictResolution(hydratedProgress);
        }
      }
    }
  }

  showConflictResolution(remoteState) {
    // 1. Remove any existing overlays to prevent stacking/ID conflicts
    const existingOverlay = document.getElementById("conflict-overlay");
    if (existingOverlay) {
      document.body.removeChild(existingOverlay);
    }

    this.conflictBlocked = true;

    // Format Dates
    const localTime = new Date(this.state.meta.lastPlayed);
    const remoteTime = new Date(remoteState.meta.lastPlayed);

    const timeFormat = {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    const localTimeStr = localTime.toLocaleTimeString([], timeFormat);
    const remoteTimeStr = remoteTime.toLocaleTimeString([], timeFormat);

    // Calculate "Ago"
    const now = Date.now();
    const localAgo = Math.floor((now - localTime.getTime()) / 1000);
    const remoteAgo = Math.floor((now - remoteTime.getTime()) / 1000);

    // Calculate Progress
    const localProg = this._calculateProgress(this.state);
    const remoteProg = this._calculateProgress(remoteState);

    const overlay = document.createElement("div");
    overlay.id = "conflict-overlay"; // Give it an ID for cleanup
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(15, 23, 42, 0.95)", // Slate-900 with opacity
      color: "white",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "99999",
      fontFamily: "'Outfit', sans-serif",
      backdropFilter: "blur(5px)",
    });

    overlay.innerHTML = `
        <h2 style="margin-bottom: 20px; font-size: 1.8rem;">⚠️ Conflicto de Sincronización</h2>
        <p style="margin-bottom: 30px; opacity: 0.8;">Se ha detectado una versión más reciente en la nube.</p>
        
        <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; width: 100%; max-width: 800px;">
            
            <!-- LOCAL CARD -->
            <div style="
                background: rgba(255,255,255,0.05); 
                border: 1px solid rgba(255,255,255,0.1); 
                padding: 20px; border-radius: 16px; 
                flex: 1; min-width: 280px; text-align: center;
                display: flex; flex-direction: column; gap: 10px;
            ">
                <h3 style="color: #94a3b8; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px;">Este Dispositivo</h3>
                <div style="font-size: 2rem; font-weight: bold;">${this.state.progress.currentStage.toUpperCase()}</div>
                <div style="color: ${localProg >= remoteProg ? "#4ade80" : "#cbd5e1"}; font-weight: bold; font-size: 1.2rem;">
                    Progreso: ${localProg}%
                </div>
                <div style="color: #cbd5e1;">Hace ${localAgo} seg</div>
                <div style="font-size: 0.9rem; opacity: 0.6;">(${localTimeStr})</div>
                
                <button class="btn-keep-local" style="
                    margin-top: 15px; padding: 12px; border-radius: 8px; border: none;
                    background: #3b82f6; color: white; font-weight: bold; cursor: pointer;
                    transition: all 0.2s;
                ">Mantener Mío 🏠</button>
            </div>

            <!-- CLOUD CARD -->
            <div style="
                background: rgba(16, 185, 129, 0.1); 
                border: 1px solid rgba(16, 185, 129, 0.3); 
                padding: 20px; border-radius: 16px; 
                flex: 1; min-width: 280px; text-align: center;
                display: flex; flex-direction: column; gap: 10px;
            ">
                <h3 style="color: #6ee7b7; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px;">Nube (Reciente)</h3>
                <div style="font-size: 2rem; font-weight: bold; color: #6ee7b7;">${remoteState.progress.currentStage.toUpperCase()}</div>
                 <div style="color: ${remoteProg > localProg ? "#4ade80" : "#d1fae5"}; font-weight: bold; font-size: 1.2rem;">
                    Progreso: ${remoteProg}%
                </div>
                <div style="color: #d1fae5;">Hace ${remoteAgo} seg</div>
                <div style="font-size: 0.9rem; opacity: 0.6; color: #6ee7b7;">(${remoteTimeStr})</div>

                <button class="btn-use-cloud" style="
                    margin-top: 15px; padding: 12px; border-radius: 8px; border: none;
                    background: #10b981; color: white; font-weight: bold; cursor: pointer;
                    transition: all 0.2s;
                ">Usar Nube ☁️</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    // Use querySelector on the OVERLAY to ensure we attach to the created elements
    // Also use clean class selectors (removed IDs to avoid potential caching issues)
    const btnKeep = overlay.querySelector(".btn-keep-local");
    const btnCloud = overlay.querySelector(".btn-use-cloud");

    // ACTION: KEEP LOCAL
    if (btnKeep) {
      btnKeep.onclick = async () => {
        console.log("[Conflict] Keeping Local...");
        if (this.state && this.state.meta) {
          this.state.meta.lastPlayed = new Date().toISOString();
        }
        // 2. Unblock UI
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
        this.conflictBlocked = false;
        // 3. Force Push to Cloud
        await this.forceCloudSave();
        // 4. (Optional) Toast
        const { showToast } = await import("./ui.js?v=1.5.30");
        showToast("Versión local conservada y subida.");
      };
    }

    // ACTION: USE CLOUD
    if (btnCloud) {
      btnCloud.onclick = async () => {
        console.log("[Conflict] Using Cloud... Triggering remote save.");

        const icon = btnCloud.innerText;
        btnCloud.innerText = "⏳ Solicitando...";
        btnCloud.disabled = true;

        try {
          const { fetchLatestUserData, triggerRemoteSave } =
            await import("./db.js?v=1.5.30");
          const { getCurrentUser } = await import("./auth.js?v=1.5.30");
          const user = getCurrentUser();

          if (user) {
            // 1. SIGNAL: Tell other devices to save NOW
            await triggerRemoteSave(user.uid);

            // 2. WAIT: Give the other device time to process the signal and save
            btnCloud.innerText = "⏳ Sincronizando...";
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }

          // 3. FETCH: Get the fresh data (which should now include the forced save)
          btnCloud.innerText = "⏳ Descargando...";

          let finalState = remoteState; // Fallback

          if (user) {
            const latestData = await fetchLatestUserData(user.uid);
            if (latestData && latestData.progress) {
              console.log("[Conflict] Fresh cloud data received.");
              finalState = this._deserializeState(latestData.progress);

              if (latestData.stats) {
                this.stats = latestData.stats;
                localStorage.setItem(
                  "jigsudo_user_stats",
                  JSON.stringify(this.stats),
                );
              }
            }
          }

          // --- CRITICAL FIX: Preserve static puzzle 'data' before final assignment ---
          if (this.state && this.state.data && !finalState.data) {
            if (Number(this.state.meta.seed) === Number(finalState.meta.seed)) {
              console.log("[Conflict] Injecting local static puzzle data into resolved state.");
              finalState.data = this.state.data;
            }
          }

          this.conflictBlocked = false;
          this.state = finalState;
          this.save(false);
          window.location.reload();
        } catch (e) {
          console.error("Error applying cloud data:", e);
          btnCloud.innerText = icon;
          btnCloud.disabled = false;
          alert("Error al descargar. Intenta de nuevo.");
        }
      };
    }
  }

  _calculateProgress(state) {
    if (!state || !state.progress) return 0;

    // Base: 15 points per completed stage (Max 90 for 6 stages)
    let points = (state.progress.stagesCompleted || []).length * 15;

    // Partial for CURRENT stage
    try {
      const current = state.progress.currentStage;
      let partial = 0;

      switch (current) {
        case "memory":
          if (
            state.memory &&
            state.memory.cards &&
            state.memory.cards.length > 0
          ) {
            partial =
              (state.memory.pairsFound || 0) / (state.memory.cards.length / 2);
          }
          break;
        case "jigsaw":
          if (state.data && state.data.chunks) {
            const totalChunks = state.data.chunks.length;
            const placed = state.jigsaw
              ? (state.jigsaw.placedChunks || []).length
              : 0;
            if (totalChunks > 0) partial = placed / totalChunks;
          }
          break;
        case "sudoku":
          if (state.sudoku && state.sudoku.currentBoard) {
            let filled = 0;
            state.sudoku.currentBoard.forEach((row) => {
              row.forEach((cell) => {
                if (cell !== 0) filled++;
              });
            });
            // Simple heuristic: filled / 81
            partial = filled / 81;
          }
          break;
        case "peaks":
          // 81 cells max (roughly)
          if (state.peaks && state.peaks.foundCoords) {
            partial = state.peaks.foundCoords.length / 81;
          }
          break;
        case "search":
          if (state.search && state.search.targets) {
            const total = state.search.targets.length;
            const found = (state.search.found || []).length;
            if (total > 0) partial = found / total;
          }
          break;
      }

      if (partial > 1) partial = 1;
      points += partial * 15;
    } catch (err) {
      console.warn("Error calculating partial progress", err);
    }

    // Cap at 100
    return Math.min(100, Math.round(points));
  }

  /**
   * Exclusive Session Block (v1.5.0)
   * Prevents multi-device conflicts by forcing a single active origin.
   */
  async showExclusiveSessionBlock() {
    if (this.sessionBlocked) return;
    this.sessionBlocked = true;

    // Remove any existing sync overlays
    const existingSync = document.getElementById("conflict-overlay");
    if (existingSync) document.body.removeChild(existingSync);

    const overlay = document.createElement("div");
    overlay.id = "exclusive-session-overlay";
    Object.assign(overlay.style, {
      position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
      background: "rgba(10, 15, 30, 0.98)", color: "white",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      zIndex: "100000", fontFamily: "'Outfit', sans-serif", backdropFilter: "blur(12px)",
      textAlign: "center", padding: "20px"
    });

    const lang = localStorage.getItem("jigsudo_lang") || "es";
    // We already have translations imported from top if available, 
    // but in case of dynamic load issues, we fallback.
    let t = {
      sync_exclusive_title: "Cuenta en uso",
      sync_exclusive_desc: "Jigsudo se ha abierto en otro dispositivo o pestaña. Solo puedes tener una sesión activa para evitar pérdida de datos.",
      sync_btn_continue: "Continuar aquí 🔄"
    };

    try {
      // v1.2.2: Access dynamic translations correctly
      const { translations: tData } = await import("./translations.js?v=1.5.30");
      if (tData && tData[lang]) {
        t = { ...t, ...tData[lang] };
      }
    } catch (e) { console.warn("Fallback translations used for block screen."); }

    overlay.innerHTML = `
      <div style="font-size: 4rem; margin-bottom: 20px;">🔒</div>
      <h2 style="font-size: 2rem; margin-bottom: 15px;">${t.sync_exclusive_title || "Cuenta en uso"}</h2>
      <p style="font-size: 1.1rem; opacity: 0.8; max-width: 500px; line-height: 1.6; margin-bottom: 40px;">
        ${t.sync_exclusive_desc || "Jigsudo se ha abierto en otro dispositivo. Solo puedes tener una sesión activa."}
      </p>
      <button class="btn-resume-here" style="
        padding: 16px 40px; border-radius: 50px; border: none;
        background: linear-gradient(135deg, #3b82f6, #6366f1);
        color: white; font-size: 1.1rem; font-weight: bold; cursor: pointer;
        box-shadow: 0 10px 20px rgba(59, 130, 246, 0.3);
        transition: transform 0.2s, background 0.2s;
      ">${t.sync_btn_continue || "Continuar aquí 🔄"}</button>
    `;

    document.body.appendChild(overlay);

    const btn = overlay.querySelector(".btn-resume-here");
    if (btn) {
      btn.onmouseover = () => btn.style.transform = "scale(1.05)";
      btn.onmouseout = () => btn.style.transform = "scale(1)";
      btn.onclick = () => {
        // v1.2.2: Signal that on reload, this tab MUST take the throne immediately
        localStorage.setItem("jigsudo_force_throne", "true");
        window.location.reload();
      };
    }
  }

  async recordWin() {
    if (this._processingWin) return null;
    this._processingWin = true;
    
    // v1.4.6: Win Lock - Prevent Cloud Sync from overwritting this win for 10 seconds
    const lockUntil = Date.now() + 10000;
    this._winLockExpires = lockUntil;
    localStorage.setItem("jigsudo_win_lock", lockUntil.toString());

    try {
      // 1. Ensure RP reset logic (daily/monthly) runs BEFORE loading stats into local variable
      await this._ensureStats();

      // RE-FETCH stats after ensureStats in case the healer replaced the object reference
      let stats = this.stats;
      if (!stats.history) stats.history = {};
      if (!stats.stageTimesAccumulated) stats.stageTimesAccumulated = {};
      if (!stats.stageWinsAccumulated) stats.stageWinsAccumulated = {};
      if (!stats.weekdayStatsAccumulated) stats.weekdayStatsAccumulated = {};

      const seedStr = this.currentSeed.toString();
      const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;

      const last = stats.lastPlayedDate;
      const isAlreadyWon = stats.history[today]?.status === "won" || stats.history[today]?.original?.won === true;

      if (!this.isReplay && !isAlreadyWon) {
        stats.totalPlayed = (stats.totalPlayed || 0) + 1;
        stats.wins = (stats.wins || 0) + 1;

        // Handle Streak and RP Resets (Consistent UTC Logic)
        if (last) {
          const lastDate = new Date(last + "T12:00:00Z");
          const currDate = new Date(today + "T12:00:00Z");
          const diffDays = Math.round(
            (currDate - lastDate) / (1000 * 60 * 60 * 24),
          );

          if (diffDays === 1) {
            stats.currentStreak = (stats.currentStreak || 0) + 1;
          } else if (diffDays > 1) {
            stats.currentStreak = 1;
          }
        } else {
          stats.currentStreak = 1;
        }

        if (stats.currentStreak > (stats.maxStreak || 0))
          stats.maxStreak = stats.currentStreak;
      } else if (!this.isReplay && isAlreadyWon) {
        // SELF-HEALING: Check if we have a discrepancy (Local stats missed the win update)
        // If dailyRP is significantly less than the calculated score, forcefully apply the difference.
        // This handles race conditions where 'status: won' was saved but RP failed.
        const startMs = this.state.meta.startedAt
          ? new Date(this.state.meta.startedAt).getTime()
          : Date.now();
        const totalTimeMs = Date.now() - startMs;
        const peaksErrors = this.state.stats?.peaksErrors || 0;
        const { calculateTimeBonus } = await import("./ranks.js?v=1.5.30");
        const timeBonus = calculateTimeBonus(Math.floor(totalTimeMs / 1000));
        let netChange = timeBonus - peaksErrors * SCORING.ERROR_PENALTY_RP;
        const potentialDailyScore = Math.max(0, 6.0 + netChange);

        const currentDaily = stats.dailyRP || 0;
        // Tolerance of 0.1 rp
        if (currentDaily < potentialDailyScore - 0.1) {
          console.warn(
            `[RP] Discrepancy detected! Stored: ${currentDaily}, Actual: ${potentialDailyScore}. Healing...`,
          );
          const diff = potentialDailyScore - currentDaily;
          stats.dailyRP = (stats.dailyRP || 0) + diff;
          stats.currentRP = (stats.currentRP || 0) + diff;
          stats.monthlyRP = (stats.monthlyRP || 0) + diff;
          stats.totalScoreAccumulated =
            (stats.totalScoreAccumulated || 0) + diff;

          // Force update lastPlayedDate to ensure streaks work tomorrow
          stats.lastPlayedDate = today;

          // Also heal Weekday Stats if missing count
          const dayIdx = new Date(today + "T12:00:00").getDay();
          if (!stats.weekdayStatsAccumulated[dayIdx])
            stats.weekdayStatsAccumulated[dayIdx] = {
              sumTime: 0,
              sumErrors: 0,
              sumScore: 0,
              count: 0,
            };
          const w = stats.weekdayStatsAccumulated[dayIdx];
          // If count is 0 but we won, add stats
          if (w.count === 0) {
            w.sumTime += totalTimeMs;
            w.sumErrors += peaksErrors;
            w.sumScore += potentialDailyScore;
            w.count++;
          }
          stats.lastLocalUpdate = Date.now(); // Ensure healing is treated as new
        }
      }

      // --- PREPARATION (Common for all flows) ---
      const startMs = this.state.meta.stageStamps?.memory?.startMs || this.state.meta.startedAt;
      const totalTimeMs = Date.now() - new Date(startMs).getTime();
      const peaksErrors = this.state.stats?.peaksErrors || 0;
      const st = this.state.meta.stageTimes || {};
      const isOriginalDay = !this.isReplay;

      const { getCurrentUser } = await import("./auth.js?v=1.5.30");
      const { calculateTimeBonus } = await import("./ranks.js?v=1.5.30");
      const { callJigsudoFunction, saveUserStats, saveHistoryEntry } = await import("./db.js?v=1.5.30");
      
      const user = getCurrentUser();
      const timeBonus = calculateTimeBonus(Math.floor(totalTimeMs / 1000));

      // v1.5.41: ATOM UPDATE (Counters must be updated BEFORE RP reconstruction)
      stats.totalTimeAccumulated = (stats.totalTimeAccumulated || 0) + totalTimeMs;
      stats.totalPeaksErrorsAccumulated = (stats.totalPeaksErrorsAccumulated || 0) + peaksErrors;
      
      stats.monthlyWinsAccumulated = (stats.monthlyWinsAccumulated || 0) + 1;
      stats.monthlyPeaksErrorsAccumulated = (stats.monthlyPeaksErrorsAccumulated || 0) + peaksErrors;
      
      // Stage Accumulators
      for (const [stage, time] of Object.entries(st)) {
        stats.stageTimesAccumulated[stage] = (stats.stageTimesAccumulated[stage] || 0) + time;
        stats.stageWinsAccumulated[stage] = (stats.stageWinsAccumulated[stage] || 0) + 1;
      }

      // --- 1. POINT ADOPTION (Referee Integration) ---
      if (!this.isReplay && !isAlreadyWon) {
        if (user && !user.isAnonymous) {
          console.log("[Referee] Submitting results for validation...");
          try {
            // Wait for queue if necessary
            if (this.isProcessingQueue || this.validationQueue.length > 0) {
              let attempts = 0;
              while ((this.isProcessingQueue || this.validationQueue.length > 0) && attempts < 50) {
                await new Promise(r => setTimeout(r, 100));
                attempts++;
              }
            }

            const serverResult = (await callJigsudoFunction("submitDailyWin", {
              stageTimes: st,
              peaksErrors: peaksErrors,
              seed: this.currentSeed
            })) || {};

            if (serverResult.status === "success") {
              console.log("[Referee] Game finalized and verified by server:", serverResult);
              if (serverResult.bonus !== undefined) stats.lastBonus = serverResult.bonus;
              if (serverResult.streak !== undefined) stats.currentStreak = serverResult.streak;

              // v1.5.29: Force win state BEFORE recalculating to ensure bonus is picked up
              this.state.progress.won = true;
              this.stats = stats;
              await this._recalculateNetStats();
              
              // v1.5.29: If server provided a definitive final score, trust it over local calculation
              if (serverResult.finalScore !== undefined) {
                 this.stats.dailyRP = serverResult.finalScore;
                 // Sync siblings to maintain hierarchy
                 this.stats.monthlyRP = Math.max(this.stats.monthlyRP || 0, this.stats.dailyRP);
                 this.stats.totalRP = Math.max(this.stats.totalRP || 0, this.stats.monthlyRP);
              }
              
              stats = this.stats;
            }
          } catch (err) {
            console.error("[Referee] Validation failed! Using local fallback.", err);
            this.state.progress.won = true; // Still mark as won for local scoring
            stats.lastBonus = timeBonus;
            this.stats = stats;
            await this._recalculateNetStats();
            stats = this.stats;
          }
        } else {
          // Guest Flow
          this.state.progress.won = true;
          stats.lastBonus = timeBonus;
          this.stats = stats;
          await this._recalculateNetStats();
          stats = this.stats;
        }
      }

      // --- 2. BASIC STATS ENRICHMENT ---
      if (stats.currentRP < 0) stats.currentRP = 0;
      if (stats.dailyRP < 0) stats.dailyRP = 0;
      if (stats.monthlyRP < 0) stats.monthlyRP = 0;

      if (stats.bestTime === undefined) stats.bestTime = null;
      if (totalTimeMs > 0 && (stats.bestTime === null || stats.bestTime === Infinity || totalTimeMs < stats.bestTime)) {
        stats.bestTime = totalTimeMs;
      }

      const dailyScore = this.stats.dailyRP || 0;
      stats.totalScoreAccumulated = (stats.totalScoreAccumulated || 0) + dailyScore;
      
      // Bonus counters
      if (stats.lastBonus > 0) {
        stats.totalBonusesAccumulated = (stats.totalBonusesAccumulated || 0) + stats.lastBonus;
        stats.monthlyBonusesAccumulated = (stats.monthlyBonusesAccumulated || 0) + stats.lastBonus;
      }

      // Weekday Aggregates
      const dayIdx = new Date(today + "T12:00:00").getDay();
      if (!stats.weekdayStatsAccumulated[dayIdx]) {
        stats.weekdayStatsAccumulated[dayIdx] = { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 };
      }
      const w = stats.weekdayStatsAccumulated[dayIdx];
      w.sumTime += totalTimeMs;
      w.sumErrors += peaksErrors;
      w.sumScore += dailyScore;
      w.count++;

      stats.lastDailyUpdate = today; 
      stats.lastDecayCheck = today;

      // --- 3. HISTORY ENRICHMENT ---
      if (!stats.history[today]) {
        stats.history[today] = { seed: this.currentSeed, played: true };
      }

      const resultData = {
        score: dailyScore, 
        totalTime: totalTimeMs,
        stageTimes: st,
        stageStamps: this.state.meta.stageStamps || {},
        errors: peaksErrors,
        timestamp: Date.now(),
        won: true
      };

      if (!stats.history[today].original && isOriginalDay) {
        stats.history[today].status = "won";
        stats.history[today].original = resultData;
        stats.history[today].best = resultData;
      } else {
        stats.history[today].status = "won";
        const existingBest = stats.history[today].best || {};
        if (dailyScore > (existingBest.score || 0) || 
           (dailyScore === existingBest.score && totalTimeMs < (existingBest.totalTime || Infinity))) {
          stats.history[today].best = resultData;
        }
      }

      // --- 4. PERSISTENCE ---
      if (this.isReplay) {
        console.log("[GameManager] Replay win. Cleaning progress...");
        this.state.progress = { stagesCompleted: [], currentStage: "memory" };
        const sections = ["memory", "jigsaw", "sudoku", "peaks", "search", "simon"];
        sections.forEach(s => { if (this.state[s]) this.state[s] = {}; });
        this.save();
      }

      stats.lastLocalUpdate = Date.now();
      this.stats = stats;
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));

      // --- 5. CLOUD SYNC ---
      if (user && !user.isAnonymous) {
        const { getJigsudoDateString, getJigsudoYearMonth } = await import("./utils/time.js?v=1.5.30");
        this.stats.lastDailyUpdate = getJigsudoDateString();
        this.stats.lastMonthlyUpdate = getJigsudoYearMonth();
        this.stats._isConfirmedWin = true; 
        
        await saveUserStats(user.uid, this.stats, user.displayName);
        if (this.stats.history[today]) {
          await saveHistoryEntry(user.uid, this.currentSeed, this.stats.history[today]);
        }
        delete this.stats._isConfirmedWin;
        localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
      }
      await this.forceCloudSave();

      // --- 6. UX & NOTIFICATION ---
      const { stopTimer } = await import("./timer.js?v=1.5.30");
      const { showToast } = await import("./ui.js?v=1.5.30");
      const { getCurrentLang } = await import("./i18n.js?v=1.5.30");
      const { translations } = await import("./translations.js?v=1.5.30");
      
      stopTimer();
      const lang = getCurrentLang() || "es";
      showToast(translations[lang]?.toast_progress_saved || "¡Progreso Guardado! 💾🏆");

      const sessionStats = {
        totalTime: totalTimeMs,
        score: dailyScore,
        streak: stats.currentStreak || 1,
        errors: peaksErrors,
        stageTimes: st,
        date: today,
        isReplay: this.isReplay,
      };

      window.dispatchEvent(new CustomEvent("gameCompleted", { 
        detail: { ...sessionStats, seed: this.currentSeed } 
      }));

      return sessionStats;
 // v1.5.22: UI receives official stats through this object
    } catch (err) {
      console.error("Error saving stats:", err);
      return null;
    } finally {
      this._processingWin = false;
    }
  }

  /**
   * Scans history to re-calculate global records and cumulative metrics.
   * This ensures stats are always in sync with the history log (Source of Truth).
   */
  _recalculateRecords(stats) {
    if (!stats) return;

    // 1. Nuclear Reset of cumulative metrics (preserve configuration but reset counters)
    stats.maxStreak = 0;
    stats.currentStreak = 0;
    stats.bestTime = null;
    stats.bestScore = 0;
    stats.totalPlayed = 0;
    stats.wins = 0;
    stats.totalScoreAccumulated = 0;
    stats.totalTimeAccumulated = 0;
    stats.totalPeaksErrorsAccumulated = 0;
    stats.stageTimesAccumulated = {};
    stats.stageWinsAccumulated = {};
    stats.weekdayStatsAccumulated = {};
    stats.played = 0; // Reset stale played counter
    
    // 2. RE-INITIALIZE Secondary Stats (Ranking Points are now primary/incremental)
    // v1.5.36: Decoupled Daily/Monthly/Total RP from history reconstruction.
    // They are managed incrementally by recalculateNetStats and sync adoption.
    stats.currentRP = 0; // currentRP remains as a career accumulator, but won't shadow totalRP

    if (!stats.history) return;

    // 2. Filter and sort won entries to rebuild history timeline
    const dates = Object.keys(stats.history)
      .filter((date) => stats.history[date].status === "won")
      .sort();

    if (dates.length === 0) {
      stats.lastPlayedDate = null;
      return;
    }

    let currentStreakCount = 0;
    let lastDate = null;

    dates.forEach((dateStr) => {
      const h = stats.history[dateStr];
      const isOriginal = h.originalWin === true;

      // Metric Extraction
      const hTime = Number(h.totalTime || 0);
      const hScore = Number(h.score || 0); // This reflects the 6.0 base + bonus/penalty
      const hErrors = Number(h.peaksErrors || 0);

      // ONLY sum into official ranking and lifetime stats if it was the ORIGINAL day
      if (isOriginal) {
        stats.totalPlayed++;
        stats.wins++;
        stats.totalTimeAccumulated += hTime;
        // Total Score = Win Points (hScore)
        stats.totalScoreAccumulated += hScore;
        stats.totalPeaksErrorsAccumulated += hErrors;

        // Rebuild Stage Stats (Wins & Times)
        if (h.stageTimes) {
          for (const [stage, time] of Object.entries(h.stageTimes)) {
            stats.stageTimesAccumulated[stage] =
              (stats.stageTimesAccumulated[stage] || 0) + time;
            stats.stageWinsAccumulated[stage] =
              (stats.stageWinsAccumulated[stage] || 0) + 1;
          }
        }

        // Rebuild Weekday Aggregates
        const d = new Date(dateStr + "T12:00:00");
        const dayIdx = d.getDay();
        if (!stats.weekdayStatsAccumulated[dayIdx]) {
          stats.weekdayStatsAccumulated[dayIdx] = {
            sumTime: 0,
            sumErrors: 0,
            sumScore: 0,
            count: 0,
          };
        }
        const w = stats.weekdayStatsAccumulated[dayIdx];
        w.sumTime += hTime;
        w.sumErrors += hErrors;
        w.sumScore += hScore;
        w.count++;

        // REBUILD Career Accumulator (currentRP)
        // v1.5.36: Ranking Points (daily/monthly/total) are no longer touched here.
        stats.currentRP = Number((stats.currentRP + hScore).toFixed(3));
      }

      const d = new Date(dateStr + "T12:00:00");

      // Update Bests (Even for History)
      if (hTime > 0 && (stats.bestTime === null || hTime < stats.bestTime)) {
        stats.bestTime = hTime;
      }
      if (hScore > stats.bestScore) {
        stats.bestScore = hScore;
      }

      // Rebuild Streak Logic (History wins contribute to streak continuity if played on time)
      if (isOriginal) {
        if (lastDate) {
          const diff = Math.ceil((d - lastDate) / (1000 * 60 * 60 * 24));
          if (diff === 1) {
            currentStreakCount++;
          } else {
            currentStreakCount = 1;
          }
        } else {
          currentStreakCount = 1;
        }

        if (currentStreakCount > stats.maxStreak) {
          stats.maxStreak = currentStreakCount;
        }
        lastDate = d;
      }
    });

    stats.lastPlayedDate = dates[dates.length - 1];

    // Rebuild date markers based on the last historical win
    if (stats.lastPlayedDate) {
      // SAFETY: Only update markers if history provides a NEWER or missing anchor.
      // We don't want a recalculation to wipe a "Play Intent" (lastDailyUpdate) from today.
      const lastPlayedTime = new Date(stats.lastPlayedDate + "T12:00:00Z").getTime();
      const currentUpdateDate = stats.lastDailyUpdate || "2026-04-05";
      const currentUpdateTime = new Date(currentUpdateDate + "T12:00:00Z").getTime();

      if (lastPlayedTime >= currentUpdateTime) {
        stats.lastDailyUpdate = stats.lastPlayedDate;
      }
      
      stats.lastMonthlyUpdate = stats.lastPlayedDate.substring(0, 7);
      stats.lastDecayCheck = stats.lastPlayedDate;
    }

    // 3. Streak Validity Validation (relative to the active puzzle)
    try {
      const seedStr = this.currentSeed.toString();
      const todayStr = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      const todayObj = new Date(todayStr + "T12:00:00");
      const lastWinObj = new Date(stats.lastPlayedDate + "T12:00:00");
      const dayGap = Math.ceil((todayObj - lastWinObj) / (1000 * 60 * 60 * 24));

      if (dayGap > 1) {
        stats.currentStreak = 0;
      } else {
        stats.currentStreak = currentStreakCount;
      }
    } catch (err) {
      console.warn("[Recalc] Failed to validate streak gap:", err);
      stats.currentStreak = 0;
    }

    // --- ADMINISTRATIVE SHIELD: Apply manual adjustments (admin penalties/bonuses) ---
    stats.currentRP = Number((stats.currentRP + (stats.manualRPAdjustment || 0)).toFixed(3));
    // v1.5.36: REMOVED totalRP = currentRP overwrite to prevent history-based score rebounds.
    
    if (stats.currentRP < 0) stats.currentRP = 0;
    if (stats.totalRP < 0) stats.totalRP = 0;
  }

  _compareProgress(s1, s2) {
    if (!s1 || !s2) return false;
    
    // 1. Compare Stage and Completion
    if (s1.progress?.currentStage !== s2.progress?.currentStage) return false;
    if ((s1.progress?.stagesCompleted || []).length !== (s2.progress?.stagesCompleted || []).length) return false;

    // 2. Compare Specific Sub-stage Progress
    const stage = s1.progress?.currentStage;
    if (stage === "memory") {
      if ((s1.memory?.pairsFound || 0) !== (s2.memory?.pairsFound || 0)) return false;
    } else if (stage === "jigsaw") {
      if ((s1.jigsaw?.placedChunks || []).length !== (s2.jigsaw?.placedChunks || []).length) return false;
    } else if (stage === "sudoku") {
      if ((s1.sudoku?.currentBoard || "") !== (s2.sudoku?.currentBoard || "")) return false;
    }

    return true;
  }

  _getDefaultStats() {
    return {
      totalPlayed: 0,
      currentStreak: 0,
      maxStreak: 0,
      currentRP: 0,
      totalRP: 0,
      dailyRP: 0,
      monthlyRP: 0,
      bestScore: 0,
      bestTime: null,
      totalTimeAccumulated: 0,
      totalScoreAccumulated: 0,
      totalPeaksErrorsAccumulated: 0,
      stageTimesAccumulated: {},
      stageWinsAccumulated: {},
      weekdayStatsAccumulated: {},
      history: {},
      lastPlayedDate: null,
      lastDecayCheck: null,
      manualRPAdjustment: 0,
      isPublic: true, // v1.5.30: Default to public
      integrityChecked: "1.5.30"
    };
  }
}
export const gameManager = new GameManager();
