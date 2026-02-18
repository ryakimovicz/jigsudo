import { getDailySeed } from "./utils/random.js";
// Local generation removed per user request (Cloud Only)
import {
  generateSearchSequences,
  countSequenceOccurrences,
} from "./search-gen.js";
import { CONFIG } from "./config.js";
import { calculateRP, SCORING } from "./ranks.js";

export class GameManager {
  constructor() {
    this.currentSeed = getDailySeed();
    this.ready = this.prepareDaily(); // Initial Load
    this.cloudSaveTimeout = null;
    this.isWiping = false;
    this.isReplay = false;

    // Listen for tab focus/visibility to force save
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.forceCloudSave();
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

  async init() {
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
      // Proactively load stats to ensure this.stats is populated before syncs
      this.stats =
        JSON.parse(localStorage.getItem("jigsudo_user_stats")) || null;
      this._ensureStats();
      const activeUid = localStorage.getItem("jigsudo_active_uid");
      if (activeUid && !this.state.meta.userId) {
        this.state.meta.userId = activeUid;
      }
      if (CONFIG.debugMode)
        console.log(
          `[GameManager] Loading existing game for seed ${this.currentSeed}`,
        );
    } else if (dailyData) {
      console.log("[GameManager] Starting Fresh Daily Puzzle!");
      this.state = this.createStateFromJSON(dailyData);
      const activeUid = localStorage.getItem("jigsudo_active_uid");
      if (activeUid) this.state.meta.userId = activeUid;

      // Record as played in history ONLY if it's the original day
      const seedStr = this.currentSeed.toString();
      const dateStr = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      this._ensureStats();
      if (!this.isReplay && !this.stats.history[dateStr]) {
        this.stats.history[dateStr] = {
          status: "played",
          timestamp: Date.now(),
        };
        localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
      }

      this.save();
    } else {
      console.error("[GameManager] CRITICAL: No Save & No Network.");
      this.showCriticalError(
        "Error loading daily puzzle. Check connection & refresh.",
      );
      return false;
    }

    if (CONFIG.betaMode && this.state) {
      if (this.state.search && this.state.search.found.length > 0) {
        this.state.search.found = [];
        this.save();
      }
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

    this.ready = this.init(); // Re-initialize with new seed
    const success = await this.ready;

    if (success) {
      window.location.hash = ""; // Return to home view (which will now show the loaded game)
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
    const url = `public/puzzles/daily-${dateStr}.json`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      return null;
    }
  }

  createStateFromJSON(json) {
    const { data, meta } = json;
    return {
      meta: {
        seed: meta.seed || this.currentSeed,
        version: meta.version || "unknown",
        startedAt: null,
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
      stats: {
        totalPlayed: 0,
        wins: 0,
        currentStreak: 0,
        maxStreak: 0,
        peaksErrors: 0,
        history: {},
        distribution: { "<2m": 0, "2-5m": 0, "+5m": 0 },
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
      const { generateSearchSequences } = await import("./search-gen.js");
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

  async save(syncToCloud = true) {
    if (this.conflictBlocked || !this.state || this.isWiping) return;
    this.state.meta.lastPlayed = new Date().toISOString();
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    if (syncToCloud) this.saveCloudDebounced();
  }

  saveCloudDebounced(delay = 5000) {
    if (this.cloudSaveTimeout) clearTimeout(this.cloudSaveTimeout);
    this.cloudSaveTimeout = setTimeout(() => {
      this.forceCloudSave();
    }, delay);
  }

  async forceCloudSave(overrideUid = null) {
    const { getCurrentUser } = await import("./auth.js");
    const user = getCurrentUser();
    if (user && !user.isAnonymous) {
      const isGoogleUser = user.providerData.some(
        (p) => p.providerId === "google.com",
      );
      if (!user.emailVerified && !isGoogleUser) {
        console.log("[Sync] Guard: Cloud save blocked (email not verified).");
        return;
      }
    }

    if (this.isWiping) {
      console.log("[GM] Wiping in progress. Save blocked.");
      return;
    }
    if (this.cloudSaveTimeout) {
      clearTimeout(this.cloudSaveTimeout);
      this.cloudSaveTimeout = null;
    }
    if (this.conflictBlocked) return;
    try {
      const { getCurrentUser } = await import("./auth.js");
      const { saveUserProgress, saveUserStats } = await import("./db.js");

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

        let username = user.displayName || null; // Fix: Pass username to DB

        if (this.state) {
          const cloudState = this._serializeState(this.state);
          await saveUserProgress(uid, cloudState);
        }
        if (this.stats) await saveUserStats(uid, this.stats, username);
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
    localStorage.removeItem("jigsudo_user_stats");
    this.stats = null;
    localStorage.removeItem("jigsudo_active_uid");

    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith("jigsudo_state_")) localStorage.removeItem(key);
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
          // netChange = score - 4.0 (bonus added to currentRP etc.)
          const netChange = (h.score || 0) - 4.0;
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
          delete stats.history[today];
        }
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
      const { getCurrentUser } = await import("./auth.js");
      const { saveUserProgress, saveUserStats } = await import("./db.js");
      const { showNotification } = await import("./ui.js");
      const user = getCurrentUser();

      if (user && !user.isAnonymous) {
        showNotification("Sincronizando...", "info");
        console.log("[GameManager] Re-syncing cloud...");
        const freshState = this.createStateFromJSON(
          await this.fetchDailyPuzzle(),
        );
        // We await both to ensure they are on the wire before reload
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

  showConflictModal() {
    this.conflictBlocked = true;
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.95)";
    overlay.style.color = "white";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "99999";
    overlay.style.fontFamily = "outfit, sans-serif";
    overlay.style.textAlign = "center";
    overlay.style.padding = "20px";

    overlay.innerHTML = `
        <h1 style="color: #ff5555; margin-bottom: 20px; font-size: 3rem;">!!</h1>
        <h2 style="margin-bottom: 10px;">Partida activa en otro dispositivo</h2>
        <p style="font-size: 1.1rem; margin-bottom: 30px; max-width: 400px; color: #ccc;">
            Se ha detectado progreso mas reciente desde otra ubicacion.
            Por seguridad, esta sesion se ha detenido.
        </p>
        <button id="btn-conflict-reload" style="
            background: #ff5555;
            color: white;
            border: none;
            padding: 16px 32px;
            font-size: 1.2rem;
            font-weight: bold;
            border-radius: 12px;
            cursor: pointer;
            transition: transform 0.2s;
        ">
            Recargar Datos
        </button>
    `;
    document.body.appendChild(overlay);
    document.getElementById("btn-conflict-reload").onclick = () => {
      window.location.reload();
    };
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
    if (this.state && this.state.meta) {
      this.state.meta.userId = uid;
      this.save();
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
    this.state[section] = { ...this.state[section], ...data };
    this.save();
  }

  async awardStagePoints(stage) {
    const points = SCORING.PARTIAL_RP[stage] || 0;
    if (points <= 0) return;

    // GUARD 1: Replay Mode (Never award points for non-current games)
    if (this.isReplay) {
      console.log(`[RP] Replay mode active. No points for ${stage}.`);
      return;
    }

    // Ensure RP reset logic (daily/monthly) runs before awarding partial points
    await this._checkRankDecay();

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

    // Synchronize points across all ranking categories
    stats.currentRP = (stats.currentRP || 0) + points;
    stats.dailyRP = (stats.dailyRP || 0) + points;
    stats.monthlyRP = (stats.monthlyRP || 0) + points;

    stats.totalScoreAccumulated = (stats.totalScoreAccumulated || 0) + points;

    if (!this._processingWin) {
      if (!this.state.progress.stagesCompleted.includes(stage)) {
        this.state.progress.stagesCompleted.push(stage);
        // CRITICAL: Persist stage completion immediately to local storage
        this.save();
      }
    }
    stats.lastLocalUpdate = Date.now(); // Timestamp for conflict resolution
    this.stats = stats;
    localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));

    const { saveUserStats } = await import("./db.js");
    const { getCurrentUser } = await import("./auth.js");
    const user = getCurrentUser();
    if (user && !user.isAnonymous) {
      const currentMonth = today.substring(0, 7);

      const statsWithDates = {
        ...stats,
        lastDailyUpdate: today,
        lastMonthlyUpdate: currentMonth,
      };
      saveUserStats(user.uid, statsWithDates);
    }
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

  _ensureStats() {
    // Ensure stats object exists
    if (!this.stats) {
      this.stats = JSON.parse(localStorage.getItem("jigsudo_user_stats"));
    }

    // Initialize stats if null or missing critical fields
    if (!this.stats) {
      this.stats = {
        played: 0,
        currentStreak: 0,
        maxStreak: 0,
        currentRP: 0,
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
      };
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
    }

    // Ensure critical nested objects exist
    if (!this.stats.history) this.stats.history = {};
    if (!this.stats.stageTimesAccumulated)
      this.stats.stageTimesAccumulated = {};
    if (!this.stats.stageWinsAccumulated) this.stats.stageWinsAccumulated = {};
    if (!this.stats.weekdayStatsAccumulated)
      this.stats.weekdayStatsAccumulated = {};

    if (this.state && !this.state.meta.stageTimes)
      this.state.meta.stageTimes = {};
    this._checkRankDecay();
    import("./db.js").then(({ cleanupLegacyStats }) => {
      import("./auth.js").then(({ getCurrentUser }) => {
        const u = getCurrentUser();
        if (u) cleanupLegacyStats(u.uid);
      });
    });
  }

  async _checkRankDecay() {
    let stats =
      this.stats || JSON.parse(localStorage.getItem("jigsudo_user_stats"));
    if (!stats) return;

    const seedStr = this.currentSeed.toString();
    const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
    const currentMonth = today.substring(0, 7); // "YYYY-MM"

    const lastCheck = stats.lastDecayCheck || stats.lastPlayedDate;

    if (lastCheck && lastCheck !== today) {
      const lastDate = new Date(lastCheck);
      const currDate = new Date(today);
      lastDate.setHours(0, 0, 0, 0);
      currDate.setHours(0, 0, 0, 0);
      const diffTime = currDate - lastDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // 1. Decay Penalty (Missed days)
      if (diffDays > 1) {
        const missed = diffDays - 1;
        const penalty = missed * SCORING.MISSED_DAY_RP;
        if (penalty > 0) {
          stats.currentRP = Math.max(0, (stats.currentRP || 0) - penalty);
        }
      }

      // 2. Reset Daily RP
      if (diffDays >= 1) {
        stats.dailyRP = 0;
      }

      // 3. Reset Monthly RP
      const lastMonth = lastCheck.substring(0, 7);
      if (currentMonth !== lastMonth) {
        stats.monthlyRP = 0;
      }

      stats.lastDecayCheck = today;
      this.stats = stats;
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(stats));
    }
  }

  startStageTimer(stage) {
    this.currentStage = stage;
    this.stageStartTime = Date.now();
  }

  stopStageTimer() {
    if (!this.currentStage || !this.stageStartTime) return;
    const duration = Date.now() - this.stageStartTime;
    this.recordStageTime(this.currentStage, duration);
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

  async handleCloudSync(remoteProgress, remoteStats) {
    console.log("[Sync] handleCloudSync triggered", {
      hasProgress: !!remoteProgress,
      hasStats: !!remoteStats,
      local: !!this.state,
    });
    if (remoteStats) {
      // Conflict Resolution for Stats: Prevent "Cloud Echo" overwrites
      // If local has a newer or equal update timestamp, ignore the echo.
      const localTS = this.stats ? this.stats.lastLocalUpdate || 0 : 0;
      const remoteTS = remoteStats.lastLocalUpdate || 0;

      // Acceptance Criteria:
      // 1. No local stats exist.
      // 2. Remote is newer than local.
      // 3. Remote has significantly higher totalPlayed (merged from another device)
      if (
        !this.stats ||
        remoteTS > localTS ||
        (remoteStats.totalPlayed || 0) > (this.stats.totalPlayed || 0)
      ) {
        console.log(
          `[Sync] Accepting remote stats. (Local: ${localTS}, Remote: ${remoteTS})`,
        );
        this.stats = remoteStats;
        localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
      } else {
        console.log(
          `[Sync] Ignoring stale remote stats (Echo). (Local: ${localTS} >= Remote: ${remoteTS})`,
        );
      }
    }
    if (remoteProgress) {
      let hydratedProgress = this._deserializeState(remoteProgress);

      // --- SELF-HEALING: Fix nested progress corruption ---
      if (hydratedProgress.progress && hydratedProgress.progress.progress) {
        console.warn("[Sync] Detected nested progress corruption. Healing...");
        hydratedProgress.progress = hydratedProgress.progress.progress;
      }

      const remoteSeed = Number(hydratedProgress.meta.seed);
      const localSeed = Number(this.currentSeed);

      console.log(
        `[Sync] Comparing seeds: remote=${remoteSeed}, local=${localSeed}`,
      );

      if (this.currentSeed === null) {
        this.currentSeed = remoteSeed;
        this.storageKey = `jigsudo_state_${this.currentSeed}`;
      } else if (remoteSeed !== localSeed) {
        console.warn(
          `[Sync] Seed mismatch (Remote: ${remoteSeed}, Local: ${localSeed}). Progress ignored.`,
        );
        return;
      }
      const remoteTime = new Date(hydratedProgress.meta.lastPlayed).getTime();
      const localTime = this.state
        ? new Date(this.state.meta.lastPlayed).getTime()
        : 0;
      if (this.state) {
        const localUid = this.state.meta.userId || null;
        const remoteUid = hydratedProgress.meta.userId || null;

        // FORCE ADOPTION:
        // 1. Guest -> Account transition (UID empty -> UID present)
        // 2. Already Wiping (Lock active during login process)
        if ((!localUid && remoteUid) || this.isWiping) {
          console.log(
            `[Sync] ${this.isWiping ? "LOCK ACTIVE" : "Guest -> Account"}. FORCE ADOPTING cloud progress.`,
          );
        } else if (localUid && !remoteUid) {
          console.warn(
            "[Sync] Account -> Guest transition? This shouldn't happen during load. Ignoring remote.",
          );
          return;
        } else if (localUid !== remoteUid) {
          console.warn(
            `[Sync] UID Mismatch: Local=${localUid}, Remote=${remoteUid}. Ignoring remote.`,
          );
          return;
        } else {
          // Normal sync logic: check for significant remote update or local priority
          if (remoteTime > localTime + 10000) {
            console.warn(
              "[Sync] Conflict detected! Remote is significantly newer.",
            );
            this.showConflictModal();
            return;
          }
          // If localTime is 0 (1970), we are in a fresh/stale state and MUST adopt remote.
          // If local >= remote, we already have this data or newer.
          if (localTime > 0 && localTime >= remoteTime) {
            console.log(
              "[Sync] Local is newer or equal to remote. Skipping sync.",
            );
            return;
          }
        }
      }

      const remoteStage = hydratedProgress.progress?.currentStage || "unknown";
      console.log(`[Sync] Applying Cloud Progress. Stage: ${remoteStage}`);
      this.state = hydratedProgress;
      this.save(false); // Silent save: update localStorage but don't re-push to cloud
    }
  }

  async recordWin() {
    if (this._processingWin) return null;
    this._processingWin = true;

    try {
      // 1. Ensure RP reset logic (daily/monthly) runs BEFORE loading stats into local variable
      await this._checkRankDecay();
      this._ensureStats();

      let stats = this.stats;
      if (!stats.history) stats.history = {};
      if (!stats.stageTimesAccumulated) stats.stageTimesAccumulated = {};
      if (!stats.stageWinsAccumulated) stats.stageWinsAccumulated = {};
      if (!stats.weekdayStatsAccumulated) stats.weekdayStatsAccumulated = {};

      const seedStr = this.currentSeed.toString();
      const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      const currentMonth = today.substring(0, 7); // "YYYY-MM"

      const last = stats.lastPlayedDate;
      const isAlreadyWon = stats.history[today]?.status === "won";

      if (!this.isReplay && !isAlreadyWon) {
        stats.totalPlayed = (stats.totalPlayed || 0) + 1;
        stats.wins = (stats.wins || 0) + 1;

        // Handle Streak and RP Resets
        if (last) {
          const lastDate = new Date(last);
          const currDate = new Date(today);
          lastDate.setHours(0, 0, 0, 0);
          currDate.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil(
            (currDate - lastDate) / (1000 * 60 * 60 * 24),
          );

          if (diffDays === 1) {
            stats.currentStreak = (stats.currentStreak || 0) + 1;
          } else if (diffDays > 0) {
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
        const { calculateTimeBonus } = await import("./ranks.js");
        const timeBonus = calculateTimeBonus(Math.floor(totalTimeMs / 1000));
        let netChange = timeBonus - peaksErrors * SCORING.ERROR_PENALTY_RP;
        if (4.0 + netChange < 0) netChange = -4.0;
        const potentialDailyScore = Math.max(0, 4.0 + netChange);

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

      const startMs = this.state.meta.startedAt
        ? new Date(this.state.meta.startedAt).getTime()
        : Date.now();
      const totalTimeMs = Date.now() - startMs;
      const peaksErrors = this.state.stats?.peaksErrors || 0;
      const { calculateTimeBonus } = await import("./ranks.js");
      const timeBonus = calculateTimeBonus(Math.floor(totalTimeMs / 1000));
      let netChange = timeBonus - peaksErrors * SCORING.ERROR_PENALTY_RP;
      if (4.0 + netChange < 0) netChange = -4.0;

      const dailyScore = Math.max(0, 4.0 + netChange);

      if (!this.isReplay && !isAlreadyWon) {
        stats.currentRP = (stats.currentRP || 0) + netChange;
        stats.dailyRP = (stats.dailyRP || 0) + netChange;
        stats.monthlyRP = (stats.monthlyRP || 0) + netChange;

        if (stats.currentRP < 0) stats.currentRP = 0;
        if (stats.dailyRP < 0) stats.dailyRP = 0;
        if (stats.monthlyRP < 0) stats.monthlyRP = 0;

        if (stats.bestTime === undefined) stats.bestTime = null;
        if (
          totalTimeMs > 0 &&
          (stats.bestTime === null ||
            stats.bestTime === Infinity ||
            totalTimeMs < stats.bestTime)
        ) {
          stats.bestTime = totalTimeMs;
        }
        if (dailyScore > (stats.bestScore || 0)) stats.bestScore = dailyScore;
        stats.totalTimeAccumulated =
          (stats.totalTimeAccumulated || 0) + totalTimeMs;
        stats.totalScoreAccumulated =
          (stats.totalScoreAccumulated || 0) + netChange;
        stats.totalPeaksErrorsAccumulated =
          (stats.totalPeaksErrorsAccumulated || 0) + peaksErrors;

        const st = this.state.meta.stageTimes || {};
        for (const [stage, time] of Object.entries(st)) {
          stats.stageTimesAccumulated[stage] =
            (stats.stageTimesAccumulated[stage] || 0) + time;
          stats.stageWinsAccumulated[stage] =
            (stats.stageWinsAccumulated[stage] || 0) + 1;
        }

        const dayIdx = new Date(today + "T12:00:00").getDay();
        if (!stats.weekdayStatsAccumulated[dayIdx])
          stats.weekdayStatsAccumulated[dayIdx] = {
            sumTime: 0,
            sumErrors: 0,
            sumScore: 0,
            count: 0,
          };
        const w = stats.weekdayStatsAccumulated[dayIdx];
        w.sumTime += totalTimeMs;
        w.sumErrors += peaksErrors;
        w.sumScore += dailyScore;
        w.count++;

        stats.lastPlayedDate = today; // Only update lastPlayedDate if it was a real win
        stats.lastDecayCheck = today;
      }

      const st = this.state.meta.stageTimes || {};

      // Check if this win is on its original day
      const isOriginalDay = !this.isReplay;

      if (!stats.history[today]) stats.history[today] = {};

      stats.history[today] = {
        status: "won",
        originalWin:
          isOriginalDay || stats.history[today]?.originalWin || false,
        totalTime: totalTimeMs,
        stageTimes: st,
        timestamp: Date.now(),
        score: dailyScore,
        peaksErrors,
      };

      const sessionStats = {
        totalTime: totalTimeMs,
        score: dailyScore,
        streak: stats.currentStreak,
        errors: peaksErrors,
        stageTimes: st,
      };

      stats.lastLocalUpdate = Date.now(); // Timestamp for conflict resolution
      this.stats = stats;
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));

      const { saveUserStats } = await import("./db.js");
      const { stopTimer } = await import("./timer.js");
      stopTimer();
      const { getDailySeed } = await import("./utils/random.js");
      const user = await import("./auth.js").then((m) => m.getCurrentUser());
      if (user && !user.isAnonymous) {
        const seedStr = this.currentSeed.toString();
        const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
        const currentMonth = today.substring(0, 7);

        // Update permanent stats with these dates so future saves (like forceCloudSave) don't overwrite them with null
        this.stats.lastDailyUpdate = today;
        this.stats.lastMonthlyUpdate = currentMonth;
        localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));

        await saveUserStats(user.uid, this.stats, user.displayName);
      }
      await this.forceCloudSave();

      const { showToast } = await import("./ui.js");
      showToast("¡Progreso Guardado! 💾🏆");
      return sessionStats;
    } catch (err) {
      console.error("Error saving stats:", err);
      return null;
    } finally {
      this._processingWin = false;
    }
  }

  /**
   * Scans history to re-calculate global records (streaks, best time, etc.)
   */
  _recalculateRecords(stats) {
    if (!stats) return;

    // Nuclear Reset: Always start from defaults to avoid ghost records
    stats.maxStreak = 0;
    stats.currentStreak = 0;
    stats.bestTime = null; // JSON safe
    stats.bestScore = 0;
    stats.lastPlayedDate = stats.lastPlayedDate || null;

    if (!stats.history) return;

    const dates = Object.keys(stats.history)
      .filter((date) => stats.history[date].status === "won")
      .sort();

    if (dates.length === 0) {
      stats.lastPlayedDate = null;
      return;
    }

    let maxStreak = 0;
    let currentStreakCount = 0;
    let lastDate = null;

    let bestTime = null;
    let bestScore = 0;

    dates.forEach((dateStr) => {
      const h = stats.history[dateStr];
      const hTime = Number(h.totalTime || 0);
      const hScore = Number(h.score || 0);

      if (hTime > 0 && (bestTime === null || hTime < bestTime))
        bestTime = hTime;
      if (hScore > bestScore) bestScore = hScore;

      const d = new Date(dateStr + "T12:00:00");
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
      if (currentStreakCount > maxStreak) maxStreak = currentStreakCount;
      lastDate = d;
    });

    stats.maxStreak = maxStreak;
    stats.bestTime = bestTime;
    stats.bestScore = bestScore;
    stats.lastPlayedDate = dates[dates.length - 1];

    // Final current streak is the one active on the last recorded date
    stats.currentStreak = currentStreakCount;
  }
}
export const gameManager = new GameManager();
