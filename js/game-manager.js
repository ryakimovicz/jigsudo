import { getDailySeed } from "./utils/random.js?v=1.4.7";
// Local generation removed per user request (Cloud Only)
import {
  generateSearchSequences,
  countSequenceOccurrences,
} from "./search-gen.js?v=1.4.7";
import { CONFIG } from "./config.js?v=1.4.7";
import { calculateRP, getRankData, SCORING } from "./ranks.js?v=1.4.7";
import { isAtGameRoute } from "./utils/route-utils.js?v=1.4.7";
import { encryptData, decryptData } from "./utils/crypto.js?v=1.4.7";
import { getJigsudoDateString, getJigsudoYearMonth, getJigsudoDayDiff } from "./utils/time.js?v=1.4.7";
import { masterLock } from "./lock.js?v=1.4.7";

export class GameManager {
  constructor() {
    this.currentSeed = getDailySeed();
    this.ready = this.prepareDaily(); // Initial Load
    this.cloudSaveTimeout = null;
    this.isWiping = false;
    this.isReplay = false;
    this.isProcessingQueue = false;
    
    // v1.4.1: Persisted Validation Queue (survives refreshes)
    const savedQueue = localStorage.getItem("jigsudo_validation_queue");
    this.validationQueue = savedQueue ? JSON.parse(savedQueue) : [];
    // v1.3.8: Unified Session Continuity (survives refreshes for migration windows)
    const storedSession = sessionStorage.getItem("jigsudo_active_session_id");
    this.localSessionId = storedSession || Math.random().toString(36).substring(7);
    if (!storedSession) {
      sessionStorage.setItem("jigsudo_active_session_id", this.localSessionId);
    }
    this.sessionBlocked = false;
    this._throneShieldExpires = 0; // v1.2.3: Grace period for session claims
    this._lastLocalWrite = 0;      // v1.5.30: Sync Shield timer
    this._statsUpdateQueue = Promise.resolve(); // v2.8.0: Mutex for stats integrity

    // v1.6.6: Immediate Throne Shield
    // If we reloaded to take the throne, activate the shield NOW (60s)
    // to prevent early snapshots from blocking the UI.
    if (localStorage.getItem("jigsudo_force_throne") === "true") {
        this._throneShieldExpires = Date.now() + 60000;
        console.log("[GM] Throne Takeover Shield activated (60s)");
    }

    // v1.5.16: Clock Synchronization (Anti-drift)
    this.serverTimeOffset = parseInt(localStorage.getItem("jigsudo_server_offset") || "0");
    if (CONFIG.debugMode) console.log(`[Timer] Initial Server Offset: ${this.serverTimeOffset}ms`);

    // v1.9.0: Persistent Reset Acknowledgement (Prevents reload loops)
    this._lastProcessedWipe = parseInt(localStorage.getItem("jigsudo_last_wipe_ack") || "0");

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
            (this.state.progress?.currentStage || this.state.currentStage) &&
            (this.state.progress?.currentStage || this.state.currentStage) !== "complete";

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

    // v1.6.6: Reactive Throne Takeover
    // We must wait for Auth to be ready before claiming the session in Firestore.
    window.addEventListener("authReady", async () => {
        if (localStorage.getItem("jigsudo_force_throne") === "true") {
            console.log("[GM] Auth Ready & Force Throne detected. Claiming session...");
            localStorage.removeItem("jigsudo_force_throne");
            await this.ensureSessionStarted(false); // v1.6.10: Throne takeover does NOT mark intent
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
    // When switching to Daily, we should NOT wipe the state, as we want to resume.
    // However, if we were in a Replay, this.state might be dirty.
    this.state = null; 
    return await this.init();
  }

  async init(isSilent = false) {
    // after a reload or migration. 
    // v1.6.6: Shield moved to constructor to catch early snapshots.
    if (this._throneShieldExpires < Date.now() + 30000) {
        this._throneShieldExpires = Date.now() + 30000; 
    }
    console.log(`[GameManager] Throne Shield active for next ${Math.round((this._throneShieldExpires - Date.now())/1000)}s`);
    masterLock.init();
    masterLock.reset();

    let dailyData = null;
    try {
      if (CONFIG.debugMode)
        console.log("[GameManager] Fetching daily puzzle...");
      dailyData = await this.fetchDailyPuzzle();
    } catch (e) {
      console.warn("[GameManager] Offline or Fetch Failed:", e);
    }

    // v1.9.2: URL Hammer Enforcement
    const urlParams = new URLSearchParams(window.location.search);
    const forceResetSeed = urlParams.get("forceReset");
    const hardResetSeed = localStorage.getItem("_force_hard_reset_today");

    if ((forceResetSeed && Number(forceResetSeed) === Number(this.currentSeed)) || 
        (hardResetSeed && Number(hardResetSeed) === Number(this.currentSeed))) {
        console.warn("[GameManager] NUCLEAR RESET FLAG DETECTED. Forcing fresh start.");
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem("_force_hard_reset_today");
        
        // v1.9.3: Clean the URL to prevent reload loops
        if (forceResetSeed) {
            const url = new URL(window.location.href);
            url.searchParams.delete("forceReset");
            window.history.replaceState({}, "", url.href);
        }
    }

    const cachedState = this.isReplay ? null : localStorage.getItem(this.storageKey);
    let savedState = null;

    if (cachedState) {
       // Try to decrypt 
       savedState = decryptData(cachedState);
       
       // Fallback for legacy (non-encrypted) sessions during transition
       if (!savedState) {
         try {
           savedState = JSON.parse(cachedState);
           if (savedState) console.log("[GameManager] Legacy state detected. Migrating to encrypted format on next save.");
         } catch(e) { /* corrupted */ }
       }
    }

    if (savedState) {
      try {
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
      
      // v1.3.26: Preservación de Stats de Sesión
      // No purgamos 'this.state.stats' porque contiene los errores de Peaks & Valleys
      // necesarios para la pantalla de victoria y sincronización entre dispositivos.
      // Proactively load stats to ensure this.stats is populated before syncs
      this.stats =
        JSON.parse(localStorage.getItem("jigsudo_user_stats")) || null;
      const decayOccurred = await this._ensureStats();
      
      // v1.3.28: Startup Audit
      // Ensure local totals match the atomic reality of the loaded session.
      if (this.state) {
        await this._recalculateNetStats(false, true);
      }

      masterLock.showIcon();
      const activeUid = localStorage.getItem("jigsudo_active_uid");

      if (decayOccurred && !activeUid) {
        console.log(
          "[GameManager] Local self-healing detected. Syncing guest data to storage...",
        );
        this.save(true, false, false); // v1.6.9: Silent timestamp
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

      this.save(true, false, false); // v1.6.9: Silent timestamp
      // Purge invalid history once per load
      this._healHistoryProgress();

      // v2.2.0: Timer Resumption - If we are loading a game in progress, ensure timer is running
      const cStage = this.state.progress?.currentStage || this.state.currentStage;
      const isMemoryStarted = cStage === "memory" && (this.state.memory?.pairsFound > 0 || this.state.memory?.matchedIndices?.length > 0);
      if (cStage && cStage !== "complete" && (cStage !== "memory" || isMemoryStarted)) {
          this.startStageTimer(cStage);
          if (CONFIG.debugMode) console.log(`[Timer] Auto-resumed timer for ${cStage}`);
      }

      // v1.6.5: Emergency Save on Unload
      window.addEventListener("beforeunload", () => {
          if (this.cloudSaveTimeout && !this._blockEmergencySave) {
              console.log("[GM] Emergency Unload Save Triggered.");
              this.forceCloudSave();
          }
      });
    } else if (dailyData) {
      this.state = this.createStateFromJSON(dailyData);
      const activeUid = localStorage.getItem("jigsudo_active_uid");
      if (activeUid) {
        this.state.meta.userId = activeUid;
      }

      const decayOccurred = await this._ensureStats();
      if (decayOccurred && !activeUid) {
        console.log("[GameManager] Self-healing detected on fresh start. Syncing locally...");
        this.save(true, false, false);
      }
      this.save(true, false, false); // v1.6.9: Initial save should NOT anchor timestamp yet
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
    if (this.isReplay || this.isWiping) {
        console.log("[GM] recordStart blocked (Replay or Sync in progress)");
        return;
    }

    // v1.5.59: SEQUENTIAL SAFETY - Ensure any pending decay from yesterday is processed
    // before we mark today as "played" (intent).
    await this._ensureStats();

    const seedStr = this.currentSeed.toString();
    const dateStr = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;

    // v1.5.59: Unify intent marking for point decay protection (Server and Guest)
    this.stats.lastDailyUpdate = dateStr;
    this.stats.lastDecayCheck = dateStr;
    this.stats.lastMonthlyUpdate = dateStr.substring(0, 7);
    // lastPenaltyDate is now persistent.

    const { getCurrentUser } = await import("./auth.js?v=1.4.7");
    const user = getCurrentUser();

    if (user && !user.isAnonymous) {
      console.log("[Referee] Registering game start and maintenance check on server...");
      try {
        const { callJigsudoFunction } = await import("./db.js?v=1.4.7");
        const result = await callJigsudoFunction("startJigsudoSession", {
          seed: this.currentSeed,
          sessionId: this.localSessionId,
          markIntent: true // v1.6.10: Explicit Play Button Intent
        });
        
        if (result.status === "started" || result.status === "already_started") {
          console.log("[Referee] Session successfully initialized/resumed.");
          this.stats.activeSessionId = this.localSessionId;
        }
      } catch (err) {
        console.error("[Referee] Failed to initialize session on server:", err);
      }
    }

    this.stats.lastMonthlyUpdate = dateStr.substring(0, 7);
    // lastPenaltyDate is now persistent.
    
    // v1.4.6: Update lastPlayed upon hitting the "Play" button
    if (this.state && this.state.meta) {
      this.state.meta.lastPlayed = new Date().toISOString();
    }

    // v1.4.6: Proactively initialize History record
    if (user && !user.isAnonymous) {
      import("./db.js?v=1.4.7").then(m => m.initializeHistoryDocument(user.uid, this.currentSeed));
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
      // v1.6.9: Use silent save to avoid updating lastPlayed during internal cleanup
      this.save(true, false, false); 
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
    this._ensureStats();
    const dateStrToday = `${parts[0]}-${parts[1]}-${parts[2]}`;
    const isAlreadyWon = this.stats.history && this.stats.history[dateStrToday]?.status === "won";

    this.isReplay = requestedSeed !== liveSeed || isAlreadyWon;

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
      console.log(
        "[GameManager] Today in progress: Preserving state for resume.",
      );
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
        lastPlayed: "1970-01-01T00:00:00.000Z", // Initial state is always stale to favor cloud adoption
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

  /**
   * v1.9.0: Hard Reset Orchestrator.
   * Clears all local game data, sets the wipe acknowledgement, and reloads the application.
   */
  async wipeAccountData(wipeTimestamp) {
    console.warn("[GameManager] Wiping all local data due to administrative reset...");
    
    // 1. Mark as wiping to block any incoming save attempts
    this.isWiping = true;
    
    // 2. Clear all jigsudo-related keys from localStorage
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith("jigsudo_")) {
            localStorage.removeItem(key);
        }
    });
    
    // 3. Persist the acknowledgement so we don't wipe again on next load
    localStorage.setItem("jigsudo_last_wipe_ack", wipeTimestamp.toString());
    
    // 4. Clear memory
    this.state = null;
    this.stats = null;
    
    // 5. Hard Reload to clean up all modules and state
    window.location.reload();
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
      const { generateSearchSequences } = await import("./search-gen.js?v=1.4.7");
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

  async save(syncToCloud = true, isPenalty = false, updateTimestamp = true, isReset = false) {
    if (!this.state || this.isWiping) return;

    // --- CRITICAL FIX: Ensure local timestamp is updated ONLY on real progress ---
    // v1.6.9: Added updateTimestamp flag to prevent maintenance tasks from making 
    // stale local data appear newer than fresh cloud data.
    if (this.state.meta && updateTimestamp) {
      this.state.meta.lastPlayed = new Date().toISOString();
    }

    // v1.5.57: Session Isolation (Replay Volatility)
    // We do NOT save the board state locally if we are in a history replay.
    if (this.isReplay) return;

    localStorage.setItem(this.storageKey, encryptData(this.state));
    if (syncToCloud) this.saveCloudDebounced(500, isPenalty, false, isReset);
  }

  saveCloudDebounced(delay = 500, isPenalty = false, isWonNow = false, isReset = false) {
    // v1.5.58: Flag Accumulation
    // If a pending save is already marked as a penalty/win/reset, 
    // we must preserve that state even if a subsequent non-flagged save occurs.
    this._pendingSaveFlags = this._pendingSaveFlags || { isPenalty: false, isWonNow: false, isReset: false };
    if (isPenalty) this._pendingSaveFlags.isPenalty = true;
    if (isWonNow) this._pendingSaveFlags.isWonNow = true;
    if (isReset) this._pendingSaveFlags.isReset = true;

    if (this.cloudSaveTimeout) clearTimeout(this.cloudSaveTimeout);
    this.cloudSaveTimeout = setTimeout(() => {
      const flags = this._pendingSaveFlags;
      this._pendingSaveFlags = { isPenalty: false, isWonNow: false, isReset: false }; // Clear after capture
      this.forceCloudSave(flags.isWonNow, flags.isPenalty, flags.isReset);
    }, delay);
  }

  async forceCloudSave(isWonNow = false, isPenalty = false, isReset = false) {
    if (this.isWiping && !isReset) return;
    const { getCurrentUser } = await import("./auth.js?v=1.4.7");
    const user = getCurrentUser();
    if (this.isWiping && !isReset) {
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
      const { getCurrentUser } = await import("./auth.js?v=1.4.7");
      const { saveUserProgress, saveUserStats } = await import("./db.js?v=1.4.7");

      let uid = null;
      const user = getCurrentUser();
      if (user) uid = user.uid;

      if (uid) {
        // Skip cloud save for anonymous users unless it's an explicit override (migration)
        if (user && user.isAnonymous) {
          return;
        }

        let username = user ? user.displayName : null; // Fix: Pass username to DB

        if (this.state) {
          // v1.5.57: Session Shielding
          // We do NOT save the board progress to the cloud if we are in a history replay.
          // This prevents past games from overwriting the Daily Puzzle state in Firestore.
          if (!this.isReplay) {
            const cloudState = this._serializeState(this.state);
            await saveUserProgress(uid, cloudState, { _isIntentionalReset: isReset });
          } else {
            console.log("[GameManager] Replay detected. Skipping Cloud Progress save.");
          }
        }
        if (this.stats) {
          // v1.2.11/v1.5.19/v1.5.21: ZERO-POINT GUARD refined.
          // We only block if stats is truly empty AND has no history AND no stages completed.
          // But if we have an override (registration) or any progress, we save.
          const hasHistory = this.stats.history && Object.keys(this.stats.history).length > 0;
          const hasProgress = (this.state?.progress?.stagesCompleted?.length || 0) > 0;
          const isWonNowCalc = this.state?.progress?.currentStage === "complete" || this.state?.progress?.won;
          const isTrulyEmpty = (this.stats.dailyRP || 0) === 0 && 
                               (this.stats.totalRP || 0) === 0 && 
                               (this.stats.wins || 0) === 0 &&
                               !hasHistory && !hasProgress;
          
          // v1.5.56: Stronger gate. Even if won, we don't push zeros if we are just starting up.
          // Registration (overrideUid) is the only valid case for pushing a fresh state.
          if (isTrulyEmpty) {
            console.log("[GM] Cloud stats save blocked: Local state is an uninitialized 'Zero State'.");
          } else {
            // v1.5.22: Pass win flag to allow cloud adoption if this is the final save
            const options = { 
              _isConfirmedWin: isWonNow || isWonNowCalc,
              _isIntentionalPenalty: isPenalty,
              _isIntentionalReset: isReset
            };

            if (isReset) {
               const seedStr = this.currentSeed.toString();
               options._historyKeyToDelete = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
            }
            
            await saveUserStats(uid, this.stats, username, options);
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
    this.isWiping = true;
    localStorage.setItem("_force_hard_reset_today", this.currentSeed); // NUCLEAR FLAG

    // 1. Load Stats to revert RP and history
    const seedStr = this.currentSeed.toString();
    const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;

    let stats =
      this.stats || JSON.parse(localStorage.getItem("jigsudo_user_stats"));

    if (stats) {
      // ... (Reversion logic same as before) ...
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
          // v1.6.4: Support both legacy flat structure and new nested original/best structure
          const hData = h.original || h.best || h;
          const hErrors = hData.errors || hData.peaksErrors || 0;

          // netChange = score - 6.0 (bonus added to currentRP etc.)
          const netChange = (hData.score || 0) - 6.0;
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
            (stats.totalTimeAccumulated || 0) - (hData.totalTime || 0),
          );
          stats.totalPeaksErrorsAccumulated = Math.max(
            0,
            (stats.totalPeaksErrorsAccumulated || 0) - hErrors,
          );

          // Deep Reversion of Stage Stats
          if (stats.stageTimesAccumulated && hData.stageTimes) {
            for (const [stage, time] of Object.entries(hData.stageTimes)) {
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
            w.sumTime = Math.max(0, w.sumTime - (hData.totalTime || 0));
            w.sumErrors = Math.max(0, w.sumErrors - hErrors);
            w.sumScore = Math.max(0, w.sumScore - (hData.score || 0));
            w.count = Math.max(0, w.count - 1);
          }

          // Streak and Win Count
          stats.wins = Math.max(0, (stats.wins || 0) - 1);
          stats.totalPlayed = Math.max(0, (stats.totalPlayed || 0) - 1);
        }
      }
      
      const seedStr = this.currentSeed.toString();
      const todayKey = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
      
      // 1. Nuclear Wipe: History entry
      if (stats.history && stats.history[todayKey]) {
          console.log(`[GM] Nuclear Wipe: Removing history entry for ${todayKey}`);
          delete stats.history[todayKey];
      }
      
      // 2. Nuclear Wipe: Daily Accumulators (Resets RP for today)
      stats.dailyWinsAccumulated = 0;
      stats.dailyBonusesAccumulated = 0;
      stats.dailyPeaksErrorsAccumulated = 0;
      stats.dailyRP = 0; // Forced reset for the button check
      
      // 3. Recalculate global records (wins, totalRP) based on the now-empty history
      this._recalculateRecords(stats, true);

      // 4. Sanity Clamps
      stats.currentRP = Math.max(0, stats.currentRP);
      stats.dailyRP = 0; 
      stats.monthlyRP = Math.max(0, stats.monthlyRP);

      this.stats = stats;
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(stats));
      
      // v2.2.2: Clear Optimistic Win Flags
      localStorage.removeItem("jigsudo_just_won_day");
      window._jigsudoJustWonToday = null;

      console.log("[GM] Stats after resetToday:", stats);
      
      // v2.2.2: Notify UI components (like Home button) to refresh
      window.dispatchEvent(new CustomEvent("userStatsUpdated", { detail: { stats } }));
    }

    // v1.6.9: Update in-memory state immediately to prevent race-condition saves 
    // from pushing old progress during the reload transition.
    const freshData = await this.fetchDailyPuzzle();
    const freshState = this.createStateFromJSON(freshData);
    
    // DEEP WIPE: Ensure no stage residue remains in the state object
    // before it is sent to the cloud.
    freshState.progress = {
      currentStage: "memory",
      stagesCompleted: [],
      won: false
    };
    freshState.memory = { cards: [], matchedIndices: [], pairsFound: 0 };
    freshState.jigsaw = { placedChunks: [], variation: null };
    freshState.sudoku = { currentBoard: null };
    freshState.peaks = { foundCoords: [] };
    freshState.search = { found: [], targets: [] };
    freshState.code = { completed: false, maxUnlockedLevel: 1 };
    
    this.state = freshState; 
    this.state.meta.lastPlayed = new Date().toISOString();

    // 3. Re-sync with cloud (Awaited to avoid race condition on reload)
    try {
      const { getCurrentUser } = await import("./auth.js?v=1.4.7");
      const { showNotification } = await import("./ui.js?v=1.4.7");
      const user = getCurrentUser();

      if (user && !user.isAnonymous) {
        showNotification("Sincronizando...", "info");
        console.log("[GameManager] Re-syncing cloud...");
        
        // v2.2.1: Nuclear Wipe - Delete the history record from the subcollection too
        const { deleteHistoryEntry } = await import("./db.js?v=1.4.7");
        await deleteHistoryEntry(user.uid, this.currentSeed);
        
        await this.forceCloudSave(false, false, true);
        console.log("[GameManager] Cloud sync complete.");
      }
    } catch (err) {
      console.error("[GameManager] Cloud re-sync failed:", err);
    }

    // 4. Final local wipe and Reload
    this._blockEmergencySave = true; 
    if (this.cloudSaveTimeout) {
      clearTimeout(this.cloudSaveTimeout);
      this.cloudSaveTimeout = null;
    }
    // v1.9.2: THE URL HAMMER
    // We reload with a URL parameter to guarantee the reset flag is seen 
    // even if localStorage is being flaky or competing syncs are wiping it.
    const baseUrl = window.location.origin + window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set("forceReset", this.currentSeed);
    
    // v1.9.8: Sync Shield - Block adoption for 10s after reload to ensure fresh write wins
    localStorage.setItem("jigsudo_sync_shield", (Date.now() + 10000).toString());

    this.isWiping = false; 
    window.location.href = baseUrl + "?" + searchParams.toString() + window.location.hash;
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
    const currentStage = this.state.progress?.currentStage || this.state.currentStage;
    const currentIdx = stages.indexOf(currentStage);

    if (currentIdx !== -1) {
      const nextStage = currentIdx < stages.length - 1 ? stages[currentIdx + 1] : "complete";
      
      if (this.state.progress) {
          this.state.progress.currentStage = nextStage;
      } else {
          this.state.currentStage = nextStage;
      }
      
      await this.awardStagePoints(currentStage);
      window.dispatchEvent(
        new CustomEvent("stage-changed", { detail: nextStage }),
      );
    }
  }

  async updateProgress(section, data, silent = false) {
    if (!this.state || !this.state[section]) {
      if (section === "stats") this.state.stats = {};
      else return;
    }
    
    // v1.3.32: Sincronización de Acumuladores
    // Detectamos incremento de errores tanto en la carpeta vieja (stats) como en la nueva (peaks)
    const oldErrors = (this.state.peaks?.errors || 0) + (this.state.stats?.peaksErrors || 0);
    this.state[section] = { ...this.state[section], ...data };
    const newErrors = (this.state.peaks?.errors || 0) + (this.state.stats?.peaksErrors || 0);

    // If errors increased, update the 3-track atoms and recalculate
    if (newErrors > oldErrors) {
      const delta = newErrors - oldErrors;
      if (this.stats) {
        // v1.4.9: Manual Atomic Penalty
        const penalty = delta * (SCORING.ERROR_PENALTY_RP || 0.5);
        
        this.stats.dailyPeaksErrorsAccumulated = (this.stats.dailyPeaksErrorsAccumulated || 0) + delta;
        this.stats.monthlyPeaksErrorsAccumulated = (this.stats.monthlyPeaksErrorsAccumulated || 0) + delta;
        this.stats.totalPeaksErrorsAccumulated = (this.stats.totalPeaksErrorsAccumulated || 0) + delta;

        // Apply to all RP tracks immediately
        this.stats.dailyRP = Number((Math.max(0, (this.stats.dailyRP || 0) - penalty)).toFixed(3));
        this.stats.monthlyRP = Number((Math.max(0, (this.stats.monthlyRP || 0) - penalty)).toFixed(3));
        this.stats.totalRP = Number((Math.max(0, (this.stats.totalRP || 0) - penalty)).toFixed(3));
        this.stats.careerRP = Number((Math.max(0, (this.stats.careerRP || 0) - penalty)).toFixed(3));
      }
      
      await this._recalculateNetStats();
      
      // v1.4.10: Pass isPenalty=true to bypass the cloud Anti-Regression guard
      await this.forceCloudSave(false, true);
    } else {
        // v1.5.44: Even if no direct error, ensure we save progress changes
        if (this.state.meta) {
            this.state.meta.lastPlayed = new Date().toISOString();
        }
        if (!silent) {
            // v1.6.6: If we are changing levels, FORCE an immediate cloud save.
            if (data.currentStage) {
                console.log(`[GM] Level transition detected (${data.currentStage}). Forcing cloud save.`);
                await this.forceCloudSave();
            } else {
                // v1.5.0: If we are in peaks and have errors, treat as potential penalty to bypass guards
                const hasAnyErrors = (this.state.peaks?.errors || 0) > 0;
                if (section === "peaks") {
                    await this.forceCloudSave(false, hasAnyErrors);
                } else {
                    this.save();
                }
            }
        }
    }
  }

  async awardStagePoints(stage) {
    const points = SCORING.PARTIAL_RP[stage] || 0;
    if (points <= 0) return;

    // v1.9.9: Resilience Guard
    if (!this.state.progress) {
        this.state.progress = { currentStage: "memory", stagesCompleted: [] };
    }
    if (!this.state.progress.stagesCompleted) {
        this.state.progress.stagesCompleted = [];
    }

    // GUARD 2: Already Completed (Prevent refresh farming)
    if (this.state.progress.stagesCompleted.includes(stage)) {
      console.log(`[RP] Stage ${stage} already completed. Skipping.`);
      return;
    }

    this.state.progress.stagesCompleted.push(stage);

    // GUARD 3: Game Already Won (Prevent post-win farming for leaderboard stats)
    const seedStr = this.currentSeed.toString();
    const today = `${seedStr.substring(0, 4)}-${seedStr.substring(4, 6)}-${seedStr.substring(6, 8)}`;
    if (
      this.stats &&
      this.stats.history &&
      this.stats.history[today] &&
      this.stats.history[today].status === "won"
    ) {
      console.log(`[RP] Game already won today. Skipping global RP update for ${stage}.`);
      return;
    }

    // v1.4.5: Block removed. Stage points are now atomic and independent of the win process
    // to ensure the final stage (code) always awards its 1.0 point.

    // v2.8.0: Atomic Stats Update via Queue
    await this.enqueueStatsUpdate(async () => {
        let stats = this.stats || JSON.parse(localStorage.getItem("jigsudo_user_stats")) || {};

        if (!this.isReplay) {
            if (!stats.stageWinsAccumulated) stats.stageWinsAccumulated = {};
            if (!stats.stagePointsAccumulated) stats.stagePointsAccumulated = {};
            
            // v2.2.0: Direct Mutation Architecture
            stats.dailyRP = Number(((stats.dailyRP || 0) + points).toFixed(3));
            stats.monthlyRP = Number(((stats.monthlyRP || 0) + points).toFixed(3));
            stats.totalRP = Number(((stats.totalRP || 0) + points).toFixed(3));
            stats.careerRP = Number(((stats.careerRP || 0) + points).toFixed(3));
            
            // v2.9.0: Historical Sync - Feed the atoms (using local stats variable to avoid overwrite)
            stats.totalScoreAccumulated = Number(((stats.totalScoreAccumulated || 0) + points).toFixed(3));
            if (stats.totalBonusesAccumulated === undefined) stats.totalBonusesAccumulated = 0;
            stats.dailyWinsAccumulated = (stats.dailyWinsAccumulated || 0) + 1;
            stats.monthlyWinsAccumulated = (stats.monthlyWinsAccumulated || 0) + 1;

            // Increment specific stage stats for historical record
            stats.stageWinsAccumulated[stage] = (stats.stageWinsAccumulated[stage] || 0) + 1;
            stats.stagePointsAccumulated[stage] = Number(((stats.stagePointsAccumulated[stage] || 0) + points).toFixed(3));
            
            this.stats = stats;
            await this.save(true);
        }

        this.save();
    });

    // v1.4.1: ASYNC REFEREE (Background Validation)
    if (!this.isReplay) {
        this._enqueueValidation(stage, points);
    }

    // v1.6.6: Critical Persistence - Trigger cloud save AFTER all stage/stats updates are complete.
    // v2.7.0: Backgrounded save to avoid blocking UI transitions.
    if (!this.isReplay) {
        this.forceCloudSave();
    }
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
    localStorage.setItem("jigsudo_validation_queue", JSON.stringify(this.validationQueue));

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
    const { getCurrentUser } = await import("./auth.js?v=1.4.7");
    const { saveUserStats } = await import("./db.js?v=1.4.7");

    while (this.validationQueue.length > 0) {
      const task = this.validationQueue[0];
      const user = getCurrentUser();

      if (!user || user.isAnonymous) {
        console.warn("[Referee] Background validation skipped: No registered user.");
        this.validationQueue.shift();
        continue;
      }
      
      if (task.seed !== this.currentSeed) {
        console.warn(`[Referee] Task seed ${task.seed} doesn't match current seed ${this.currentSeed}. Skipping stale task.`);
        this.validationQueue.shift();
        localStorage.setItem("jigsudo_validation_queue", JSON.stringify(this.validationQueue));
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
          localStorage.setItem("jigsudo_validation_queue", JSON.stringify(this.validationQueue));
          
          // v1.5.29: Instant point adoption. Update local stats immediately so ranking updates.
          await this._recalculateNetStats();

          // Trigger a global event so UI components (like Ranking) know they can refresh
          window.dispatchEvent(new CustomEvent("stageVerified", { detail: task }));
        } else {
          console.warn("[Referee] Server rejected stage validation:", result.data);
          
          // v1.6.0: Automated Fraud Reporting
          const { sendRefereeReport } = await import("./db.js?v=1.4.7");
          const { getCurrentUser } = await import("./auth.js?v=1.4.7");
          const user = getCurrentUser();
          
          sendRefereeReport({
            userId: user?.uid || "anonymous",
            username: user?.displayName || "Anónimo",
            seed: task.seed,
            stage: task.stage,
            timeMs: task.stageTime,
            reason: result.data.message || "Rejected by server"
          });

          this.validationQueue.shift(); // Remove anyway to avoid infinite loops, but log it
          localStorage.setItem("jigsudo_validation_queue", JSON.stringify(this.validationQueue));
        }
      } catch (error) {
        // v1.2.6: UNCLOGGER - Distinguish between connectivity issues and logical rejections
        // Logic errors shouldn't be retried because they will fail again (clean up the queue)
        const logicCodes = ["out-of-range", "failed-precondition", "invalid-argument"];
        const isLogicError = logicCodes.includes(error.code) || 
                             (error.message && (error.message.includes("too fast") || error.message.includes("sequence") || error.message.includes("Missing stages")));

        if (isLogicError) {
          console.warn(`[Referee] Server REJECTED validation for ${task.stage}: ${error.message}. Skipping to unclog queue.`);
          
          // v1.6.0: Report Logic Errors too (The "Too Fast" etc)
          const { sendRefereeReport } = await import("./db.js?v=1.4.7");
          const { getCurrentUser } = await import("./auth.js?v=1.4.7");
          const user = getCurrentUser();

          sendRefereeReport({
            userId: user?.uid || "anonymous",
            username: user?.displayName || "Anónimo",
            seed: task.seed,
            stage: task.stage,
            timeMs: task.stageTime,
            reason: error.message || "Logic rejection"
          });

          this.validationQueue.shift(); // Remove permanent failure
          localStorage.setItem("jigsudo_validation_queue", JSON.stringify(this.validationQueue));
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
      if (this.state) {
        localStorage.setItem(this.storageKey, encryptData(this.state));
      }
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
  async enqueueStatsUpdate(updateFn) {
    let result;
    this._statsUpdateQueue = this._statsUpdateQueue.then(async () => {
      try {
        result = await updateFn();
      } catch (err) {
        console.error("[GM] Enqueued Stats Update Failed:", err);
      }
    });
    await this._statsUpdateQueue;
    return result;
  }

  async _recalculateNetStats(isPenalty = false, skipPersistence = false) {
    if (!this.stats) await this._ensureStats();
    const stats = this.stats;

    // 0. Temporal Reconciliation (v1.5.30: Absolute Truth Architecture)
    const today = getJigsudoDateString();
    const { getDateStringFromSeed } = await import("./utils/time.js?v=1.4.7");
    const seedDate = getDateStringFromSeed(this.currentSeed);
    const isLateCompletion = seedDate < today;
    const currentMonth = getJigsudoYearMonth();

    // v1.5.44: DIRECT ATOMIC TRIPLE-TRACK SCORING
    // No more anchors or baselines. We sum counters directly for 100% stability.
    
    // A. SCOPE RESETS (Transition Management)
    if (stats.lastDailyUpdate && stats.lastDailyUpdate !== today) {
        this._resetDailyStats(stats, today);
    }
    
    if (stats.lastMonthlyUpdate && stats.lastMonthlyUpdate !== currentMonth) {
        this._resetMonthlyStats(stats, currentMonth);
    }

    // B. COMPONENT AGGREGATION (v1.5.47: Track Solidarity)
    // 0. Live Session Ingredients
    if (!this.state || !this.state.progress) return; // v1.3.29: Resilience Guard
    let sessionWins = (this.state.progress.stagesCompleted || []).length;
    
    // v1.3.11: Robust sessionWins for victory state
    // If the game is won, we MUST count all 6 stages.
    if (this.state.progress.won && (this.state.progress.currentStage === "code" || (this.state.progress.stagesCompleted || []).includes("code"))) {
        sessionWins = 6;
    }
    const sessionErrors = (this.state.peaks && this.state.peaks.errors) || (this.state.stats && this.state.stats.peaksErrors) || 0;
    
    // v1.3.34: Total Atom Self-Healing
    // If the session has more errors than recorded in the daily accumulator, 
    // we bump ALL levels to ensure the penalty is recorded everywhere.
    if (sessionErrors > (stats.dailyPeaksErrorsAccumulated || 0)) {
        const delta = sessionErrors - (stats.dailyPeaksErrorsAccumulated || 0);
        stats.dailyPeaksErrorsAccumulated = sessionErrors;
        stats.monthlyPeaksErrorsAccumulated = (stats.monthlyPeaksErrorsAccumulated || 0) + delta;
        stats.totalPeaksErrorsAccumulated = (stats.totalPeaksErrorsAccumulated || 0) + delta;
        
        // v1.4.8: Ensure accumulators are initialized for new accounts
        if (stats.totalScoreAccumulated === undefined) stats.totalScoreAccumulated = 0;
        if (stats.totalBonusesAccumulated === undefined) stats.totalBonusesAccumulated = 0;
        if (stats.totalPeaksErrorsAccumulated === undefined) stats.totalPeaksErrorsAccumulated = 0;
        if (stats.totalPenaltyAccumulated === undefined) stats.totalPenaltyAccumulated = 0;

        // v1.4.3: Apply error penalty to all RP tracks (but NOT to totalScoreAccumulated)
        const penalty = delta * (SCORING.ERROR_PENALTY_RP || 0.5);
        stats.dailyRP = Number((Math.max(0, (stats.dailyRP || 0) - penalty)).toFixed(3));
        stats.monthlyRP = Number((Math.max(0, (stats.monthlyRP || 0) - penalty)).toFixed(3));
        stats.totalRP = Number((Math.max(0, (stats.totalRP || 0) - penalty)).toFixed(3));
        stats.careerRP = Number((Math.max(0, (stats.careerRP || 0) - penalty)).toFixed(3));
    }
    
    // 1. Daily Scope (The 'Game Day' Net)
    // v2.2.0: Direct Mutation - Points are already updated by events
    // We only ensure precision and floor values at 0
    stats.dailyRP = Number((Math.max(0, stats.dailyRP || 0)).toFixed(3));
    stats.monthlyRP = Number((Math.max(0, stats.monthlyRP || 0)).toFixed(3));
    stats.totalRP = Number((Math.max(0, stats.totalRP || 0)).toFixed(3));
    stats.careerRP = Number((Math.max(0, stats.careerRP || 0)).toFixed(3));
    
    const dailyNet = stats.dailyRP;
    const monthlyNet = stats.monthlyRP;
    const totalNet = stats.totalRP;
    
    if (!this.isReplay) {
      // v1.6.0: MASTER SPEC COMPLIANCE
      // totals (totalRP, monthlyRP) are now persistent accumulators.
      // We only update dailyRP from the live session ingredients.
      if (!isLateCompletion) {
        stats.dailyRP = dailyNet;
      }
      
      // v1.3.23: ABSOLUTE SYNC
      // monthlyRP and totalRP must always reflect the direct net formula
      // to repair any drift caused by skipped awardStagePoints calls.
      stats.monthlyRP = monthlyNet;
      stats.totalRP = totalNet;

      // v1.4.3: Redundant updates removed.
      // Dates are managed by the Reset process or the Activity markers.
    }

    this.stats = stats;
    this.stats.lastLocalUpdate = Date.now(); // v1.5.30: Instant Freshness
    this._lastLocalWrite = Date.now();       // v1.5.30: Shield engagement
    localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));

    // 4. Persistence
    if (!skipPersistence && !this._processingWin) {
      const { getCurrentUser } = await import("./auth.js?v=1.4.7");
      const user = getCurrentUser();
      if (user && !user.isAnonymous) {
        const { saveUserStats } = await import("./db.js?v=1.4.7");
        
        // v1.5.31: Robust Penalty Detection
        // If there are peaks errors, we MUST treat this as an intentional penalty 
        // to bypass anti-regression guards, even if the caller didn't specify it.
        const effectivePenalty = isPenalty || (stats.dailyPeaksErrorsAccumulated || 0) > 0;
        
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

    // 4. Maintenance cross-check (Only triggers on absolute mismatches)
    this._healStatsInconsistency();

    // Return the decay check promise so callers can await it if needed
    const decayResult = await this._checkRankDecay();
    return decayResult;
  }

  /**
   * Automatic cross-check to detect and heal inconsistencies between
   * cumulative stats and the history log.
   */
  _healStatsInconsistency() {
    if (!this.stats || !this.stats.history) return;

    // v2.2.4: Reset Guard - Block healing if we are in the middle of a reset
    const isShielded = localStorage.getItem("jigsudo_sync_shield") === "true";
    if (isShielded) {
      console.log("[Maintenance] Healing BLOCKED by Nuclear Shield.");
      return;
    }

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
    
    if (countMismatch || missingDates || hierarchyMismatch) {
      console.warn(
        `[Maintenance] Cross-check triggered: countMismatch=${countMismatch}, missingDates=${missingDates}, hierarchyMismatch=${hierarchyMismatch}.`,
      );
      this._recalculateRecords(this.stats);
      
      // Hierarchy Healing (v1.5.54: totalRP is the anchor)
      this.stats.monthlyRP = Math.max(this.stats.monthlyRP || 0, this.stats.dailyRP || 0);
      this.stats.totalRP = Math.max(this.stats.totalRP || 0, this.stats.monthlyRP || 0);

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

    const lastCheckDates = [stats.lastIntentDate, stats.lastDecayCheck, stats.lastPlayedDate].filter(Boolean);
    lastCheckDates.sort();
    const lastCheck = lastCheckDates.length > 0 ? lastCheckDates[lastCheckDates.length - 1] : null;
    let changed = false;

    if (lastCheck && lastCheck !== today) {
      const lastDate = new Date(lastCheck + "T12:00:00Z");
      const currDate = new Date(today + "T12:00:00Z");
        const diffDays = getJigsudoDayDiff(lastCheck, today);

        const datesToConsider = [stats.lastPenaltyDate, stats.lastIntentDate, stats.lastPlayedDate].filter(Boolean);
        datesToConsider.sort();
        const lastIntent = datesToConsider.length > 0 ? datesToConsider[datesToConsider.length - 1] : null;

        // 1. Reset Daily Stats immediately for the new day
        this._resetDailyStats(stats, today);
        changed = true;

        // 3. Sequential Simulation Loop (v1.6.3: Transition Integrity)
        // We step through each day missed to apply penalties BEFORE monthly resets.
        const { getRankData } = await import("./ranks.js?v=1.4.7");
        let lastProcessedMonth = lastCheck.substring(0, 7);

        for (let i = 1; i <= diffDays; i++) {
          const simDateObj = new Date(lastCheck + "T12:00:00Z");
          simDateObj.setUTCDate(simDateObj.getUTCDate() + i);
          const dStr = simDateObj.toISOString().substring(0, 10);
          const dMonth = dStr.substring(0, 7);
          const dayBeforeStr = new Date(simDateObj.getTime() - 86400000).toISOString().substring(0, 10);

          // A. Decay Calculation (for the day before the simulation index)
          if (lastIntent && dayBeforeStr > lastIntent) {
            const rankInfo = getRankData(stats.totalRP || 0);
            const penalty = 5 + rankInfo.level;
            const realizedPenalty = Math.min(stats.totalRP || 0, penalty);
            
            stats.totalPenaltyAccumulated = Number(((stats.totalPenaltyAccumulated || 0) + realizedPenalty).toFixed(3));
            stats.monthlyPenaltyAccumulated = Number(((stats.monthlyPenaltyAccumulated || 0) + realizedPenalty).toFixed(3));
            
            // v2.2.0: Direct Mutation in Decay Loop
            stats.totalRP = Number((Math.max(0, (stats.totalRP || 0) - realizedPenalty)).toFixed(3));
            stats.monthlyRP = Number((Math.max(0, (stats.monthlyRP || 0) - realizedPenalty)).toFixed(3));
            stats.lastPenaltyDate = dayBeforeStr; // v1.7.2: Record the anchor for this penalty
            
            console.log(`[Decay Loop] Day ${dStr} (Penalty for ${dayBeforeStr}): -${realizedPenalty} RP`);
            changed = true;
          }

          // B. Month Transition (Reset AFTER applying previous day's decay)
          if (dMonth !== lastProcessedMonth) {
            this._resetMonthlyStats(stats, dMonth);
            lastProcessedMonth = dMonth;
            changed = true;
          }
        }

        // 4. Strict Streak Reset (Missed full Jigsudo days of WINNING)
        // Uses lastPlayedDate (Victory) as the anchor.
        if (stats.lastPlayedDate && stats.lastPlayedDate !== today) {
          const streakDiff = getJigsudoDayDiff(stats.lastPlayedDate, today);
          
          if (streakDiff > 1 && stats.currentStreak !== 0) {
            console.log(`[Streak] Win missed yesterday (Last win: ${stats.lastPlayedDate}). Resetting streak to 0.`);
            stats.currentStreak = 0;
            changed = true;
          }
        }

        // Update anchor date so we don't repeat this tomorrow
        const anchorDate = new Date(currDate.getTime());
        anchorDate.setUTCDate(anchorDate.getUTCDate() - 1);
        // v1.4.3: REMOVED unconditional lastPenaltyDate update to maintain semantic integrity.
        // It is now only updated inside the decay loop when points are actually lost.
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
      
      // v1.5.56: Maintain timestamp as 0 for completely fresh initializations
      // to allow immediate adoption of cloud data on new devices.
      if (lastCheck) {
        stats.lastLocalUpdate = Date.now();
      }
      if (!targetStats) {
        this.stats = stats;
        localStorage.setItem("jigsudo_user_stats", JSON.stringify(stats));
        this.save(true, false, false); // v1.6.0/v1.6.9: Immediate cloud persistence for resets (silent timestamp)
      }
    }
    return changed;
  }

  /**
   * v1.3.2: Unified Daily Reset.
   * Ensures all session/daily atoms are zeroed when the day changes.
   */
  _resetDailyStats(stats, today) {
    console.log(`[GameManager] Performing Daily Reset for ${today}`);
    
    // v1.4.3: Resilience Lock - Only move current points to 'Yesterday' if we are 
    // strictly transitioning from the day immediately before. 
    if (stats.lastDailyUpdate) {
        const diff = getJigsudoDayDiff(stats.lastDailyUpdate, today);
        if (diff === 1) {
            stats.lastDayRP = stats.dailyRP || 0;
        } else if (diff > 1) {
            stats.lastDayRP = 0;
        }
    } else {
        stats.lastDayRP = 0;
    }
    
    // v1.4.9: Mid-Session Protection
    // If the user already has points/wins in the current object, it means they 
    // started playing just before or during the day change. We MUST NOT wipe them.
    if ((stats.dailyRP || 0) > 0 || (stats.dailyWinsAccumulated || 0) > 0) {
        console.warn("[GameManager] Day changed mid-session. Preserving current progress.");
    } else {
        stats.dailyWinsAccumulated = 0;
        stats.dailyBonusesAccumulated = 0;
        stats.dailyPeaksErrorsAccumulated = 0;
        stats.dailyRP = 0;
    }
    
    stats.lastDailyUpdate = today;
  }

  /**
   * v1.3.2: Unified Monthly Reset.
   */
  _resetMonthlyStats(stats, month) {
    console.log(`[GameManager] Performing Monthly Reset for ${month}`);
    stats.lastMonthRP = stats.monthlyRP || 0;
    
    stats.monthlyWinsAccumulated = 0;
    stats.monthlyBonusesAccumulated = 0;
    stats.monthlyPeaksErrorsAccumulated = 0;
    stats.monthlyPenaltyAccumulated = 0;
    stats.monthlyRP = 0;
    stats.lastMonthlyUpdate = month;
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
    this.ensureSessionStarted(true); // v1.6.10: Starting a stage IS intent
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
      const { callJigsudoFunction } = await import("./db.js?v=1.4.7");
      await callJigsudoFunction("startJigsudoSession", { onlyMaintenance: true });
      console.log("[Maintenance] Proactive check triggered successfully.");
    } catch (err) {
      console.warn("[Maintenance] Proactive check failed (non-critical):", err);
    }
  }

  async ensureSessionStarted(markIntent = false) {
    if (this.isReplay) return; // v1.6.11: Replays are local-only, do not mark intent or anchor sessions.

    const { getCurrentUser } = await import("./auth.js?v=1.4.7");
    const user = getCurrentUser();
    if (user && !user.isAnonymous) {
        try {
            const { callJigsudoFunction } = await import("./db.js?v=1.4.7");
            const result = await callJigsudoFunction("startJigsudoSession", {
                sessionId: this.localSessionId,
                markIntent: markIntent // v1.6.10: Decoupled takeover from intent
            });
            console.log("[Sync] Server Session Anchor:", result);

            // v1.6.6: Explicit Root Update (Surgical)
            // Use updateDoc directly to avoid circular dependency with saveUserStats during init.
            const { doc, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js");
            const { db } = await import("./firebase-config.js?v=1.4.7");
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, { 
                activeSessionId: this.localSessionId,
                lastUpdated: serverTimestamp() 
            });
            console.log("[Sync] Root Session ID updated to:", this.localSessionId);
            
            // v1.2.3: Activate Throne Shield - 20s grace period to allow Firestore to update its cache
            this._throneShieldExpires = Date.now() + 20000;
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
    
    // v1.6.5: Integrity Guard - Ensure duration is never zero for a completed stage
    // unless it was truly instantaneous (impossible for these games).
    // If it's 0 or negative, we use a fallback of 1 second to avoid Referee flags.
    const safeDuration = duration > 100 ? duration : 1000;

    if (duration <= 0 && CONFIG.debugMode) {
      console.warn(`[Timer] Detected zero/negative duration for ${this.currentStage}. Anchor: ${startAnchor}, Now: ${now}. Applying fallback.`);
    }

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
    
    // v1.2.3: Overwrite with the latest total duration instead of adding.
    // This prevents double-counting if a level is resumed or finished multiple times.
    this.state.meta.stageTimes[stage] = durationMs;
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

  async handleCloudSync(remoteProgress, remoteStats, isSnapshot = false, remoteSettings = null) {
    const urlParams = new URLSearchParams(window.location.search);
    const forceResetSeed = urlParams.get("forceReset");
    
    // v1.9.8: Nuclear Sync Shield (Post-Reset Protection)
    const syncShield = parseInt(localStorage.getItem("jigsudo_sync_shield") || "0");
    const isShielded = Date.now() < syncShield;
    const forceResetActive = (forceResetSeed && Number(forceResetSeed) === Number(this.currentSeed));

    if ((isShielded || this.isWiping || forceResetActive) && remoteProgress) {
        // v2.4.0: Shield Bypass Heuristic - Only block if remote is NOT clearly ahead.
        // This allows Device B to adopt Device A's progress immediately upon login.
        const hydratedRemote = this._deserializeState(remoteProgress);
        const remoteProgCount = (hydratedRemote.progress?.stagesCompleted || []).length;
        const localProgCount = (this.state?.progress?.stagesCompleted || []).length;
        
        const remoteTime = new Date(hydratedRemote.meta?.lastPlayed || 0).getTime();
        const localTime = new Date(this.state?.meta?.lastPlayed || 0).getTime();

        // If cloud is same or behind, we respect the shield.
        // If cloud is AHEAD (more stages or newer by >10s), we BYPASS the shield.
        if (remoteProgCount < localProgCount || (remoteProgCount === localProgCount && remoteTime <= localTime + 10000)) {
           console.log("[Sync] NUCLEAR SHIELD ACTIVE. Stale remote progress rejected.");
           return;
        }
        console.log("[Sync] NUCLEAR SHIELD BYPASS: Remote progress is newer/ahead. Adopting...");
    } else if (isShielded || this.isWiping || forceResetActive) {
        // Generic block for stats-only syncs if no progress object is available to verify
        console.log("[Sync] NUCLEAR SHIELD ACTIVE (Stats-only). Adoption blocked.");
        return;
    }
    const { isAtGameRoute } = await import("./utils/route-utils.js?v=1.4.7");

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
      const rankFields = ["dailyRP", "monthlyRP", "totalRP", "careerRP"];
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

        // v1.6.5: Exclusive Session Takeover Detection
        // If another device started a session (different ID) and it's newer than ours,
        // we must block this device to prevent split-brain state corruption.
        // v1.6.6: Shield check - Don't block if we are in the 'Throne Shield' grace period (just reloaded).
        const isThroneShieldActive = Date.now() < (this._throneShieldExpires || 0);
        
        if (remoteSessionId && remoteSessionId !== this.localSessionId && isRemoteNewer && !this.isWiping && !isThroneShieldActive) {
            console.warn("[Sync] Exclusive session takeover detected. Blocking this device.");
            this.showExclusiveSessionBlock();
            return;
        }

        // v1.9.0: FORCED RESET DETECTION
        // If the cloud document has a forceWipeAt timestamp newer than our last processed one,
        // we MUST wipe local data and restart. This is the only way to effectively handle administrative resets.
        const remoteWipe = remoteStats.forceWipeAt || 0;
        if (remoteWipe > (this._lastProcessedWipe || 0)) {
          console.warn(`[Sync] FORCED RESET DETECTED (${remoteWipe} > ${this._lastProcessedWipe}). Executing local wipe...`);
          await this.wipeAccountData(remoteWipe);
          return; // Stop here, page will reload
        }

        // v1.4.1: CRITICAL FIELD ADOPTION (CareerRP)
        // If local is 0 but remote has value, we MUST adopt it regardless of timestamps
        // to prevent overwriting manual/historical data during initialization.
        const localCareer = this.stats ? (this.stats.careerRP || 0) : 0;
        const remoteCareer = remoteStats.careerRP || 0;
        const needsCareerAdoption = localCareer === 0 && remoteCareer > 0;

        if (!this.stats || isRemoteNewer || this.isWiping || isMigration || needsCareerAdoption) {
          if (needsCareerAdoption) console.log(`[Sync] Forced CareerRP adoption (${remoteCareer}) despite timestamps.`);
          console.log(`[Sync] Adopting remote stats (RemoteTS: ${remoteTS} > LocalTS: ${localTS})`);
          
          // v1.5.56: EXPANDED ATOM PRESERVATION
          // Capture ALL accumulated fields to ensure multi-device consistency.
          const localAtoms = {
            dw: this.stats ? (this.stats.dailyWinsAccumulated || 0) : 0,
            mw: this.stats ? (this.stats.monthlyWinsAccumulated || 0) : 0,
            de: this.stats ? (this.stats.dailyPeaksErrorsAccumulated || 0) : 0,
            me: this.stats ? (this.stats.monthlyPeaksErrorsAccumulated || 0) : 0,
            db: this.stats ? (this.stats.dailyBonusesAccumulated || 0) : 0,
            mb: this.stats ? (this.stats.monthlyBonusesAccumulated || 0) : 0,
            
            // v1.5.56 p2: Total Scope Atoms
            tb: this.stats ? (this.stats.totalBonusesAccumulated || 0) : 0,
            ts: this.stats ? (this.stats.totalScoreAccumulated || 0) : 0,
            tt: this.stats ? (this.stats.totalTimeAccumulated || 0) : 0,
            te: this.stats ? (this.stats.totalPeaksErrorsAccumulated || 0) : 0,
            w: this.stats ? (this.stats.wins || 0) : 0,
            bs: this.stats ? (this.stats.bestScore || 0) : 0,
            cr: this.stats ? (this.stats.careerRP || 0) : 0,

            swMap: this.stats ? { ...(this.stats.stageWinsAccumulated || {}) } : {},
            stMap: this.stats ? { ...(this.stats.stageTimesAccumulated || {}) } : {}
          };
          
          // Unpack nested stats map into flat local object (v1.5.0 Replica Support)
          const newStats = { ...remoteStats };
          if (remoteStats.stats) {
            const protectedKeys = ["dailyRP", "monthlyRP", "totalRP", "currentRP", "score", "lastDailyUpdate", "lastMonthlyUpdate", "isPublic", "schemaVersion"];
            const cleanMap = { ...remoteStats.stats };
            protectedKeys.forEach(k => delete cleanMap[k]);
            
            Object.assign(newStats, cleanMap);
            delete newStats.stats;
          }
          
          // Re-apply local atoms using Math.max to ensure progress never goes backward
          newStats.dailyWinsAccumulated = Math.max(newStats.dailyWinsAccumulated || 0, localAtoms.dw);
          newStats.monthlyWinsAccumulated = Math.max(newStats.monthlyWinsAccumulated || 0, localAtoms.mw);
          newStats.dailyPeaksErrorsAccumulated = Math.max(newStats.dailyPeaksErrorsAccumulated || 0, localAtoms.de);
          newStats.monthlyPeaksErrorsAccumulated = Math.max(newStats.monthlyPeaksErrorsAccumulated || 0, localAtoms.me);
          newStats.dailyBonusesAccumulated = Math.max(newStats.dailyBonusesAccumulated || 0, localAtoms.db);
          newStats.monthlyBonusesAccumulated = Math.max(newStats.monthlyBonusesAccumulated || 0, localAtoms.mb);

          newStats.totalBonusesAccumulated = Math.max(newStats.totalBonusesAccumulated || 0, localAtoms.tb);
          newStats.totalScoreAccumulated = Math.max(newStats.totalScoreAccumulated || 0, localAtoms.ts);
          newStats.totalTimeAccumulated = Math.max(newStats.totalTimeAccumulated || 0, localAtoms.tt);
          newStats.totalPeaksErrorsAccumulated = Math.max(newStats.totalPeaksErrorsAccumulated || 0, localAtoms.te);
          newStats.wins = Math.max(newStats.wins || 0, localAtoms.w);
          newStats.bestScore = Math.max(newStats.bestScore || 0, localAtoms.bs);
          newStats.careerRP = Math.max(newStats.careerRP || 0, localAtoms.cr);

          // v1.4.3: Historical Resilience Shield
          // If we have points from yesterday locally, but the cloud response has 0,
          // we PROTECT our local truth from being wiped by a ghost sync.
          if ((this.stats.lastDayRP || 0) > 0 && (newStats.lastDayRP || 0) === 0) {
            console.log("[Sync] Shielding lastDayRP from ghost wipe. Preserving local points from yesterday.");
            newStats.lastDayRP = this.stats.lastDayRP;
          }
          
          // Merge Stage Maps
          if (!newStats.stageWinsAccumulated) newStats.stageWinsAccumulated = {};
          Object.entries(localAtoms.swMap).forEach(([stage, count]) => {
            newStats.stageWinsAccumulated[stage] = Math.max(newStats.stageWinsAccumulated[stage] || 0, count);
          });
          if (!newStats.stageTimesAccumulated) newStats.stageTimesAccumulated = {};
          Object.entries(localAtoms.stMap).forEach(([stage, time]) => {
            newStats.stageTimesAccumulated[stage] = Math.max(newStats.stageTimesAccumulated[stage] || 0, time);
          });
          
          // v1.6.6: Session Identity Protection
          // When adopting remote stats, we MUST preserve our local session identity
          // to prevent being immediately blocked by our own adopted data.
          newStats.activeSessionId = this.localSessionId;

          this.stats = newStats;
          
          // v1.5.43: Reset anchors
          this._sessionBaselineTotal = null;
          this._sessionBaselineMonthly = null;
          
          this._lastLocalWrite = Date.now(); // Shield engagement after adoption
          
          localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
          window.dispatchEvent(new CustomEvent("userStatsUpdated", { detail: this.stats }));
        } else {
          console.log("[Sync] Remote stats are older or equal. Skipping adoption (Echo Prevention).");
        }
      }
    }

    // 3. Progress Synchronization Logic (Game State)
    if (remoteProgress) {
      // v1.5.57: Cloud Isolation
      // Only load progress from the cloud if this is NOT a replay session.
      if (this.isReplay) {
        console.log("[Sync] Replay detected. Skipping Cloud Progress adoption.");
        return;
      }

      // v1.5.34: Allow session stats (errors, etc.) to be adopted from the cloud.
      let hydratedProgress = this._deserializeState(remoteProgress);

      // v1.3.13: Integrity Guard
      if (!hydratedProgress || !hydratedProgress.meta) {
        console.warn("[Sync] Malformed or incomplete cloud progress detected. Skipping adoption.");
        return;
      }

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

      // v1.6.9: Strong Adoption Signal - Remote Progress (Stage Count)
      const remoteProgCount = (hydratedProgress.progress?.stagesCompleted || []).length;
      const localProgCount = (this.state?.progress?.stagesCompleted || []).length;
      const hasHigherCloudProgress = remoteProgCount > localProgCount;

      // Heuristic: Does the local state have ANY moves/progress?
      const hasLocalMoves = (this.state?.memory?.pairsFound > 0) || 
                            (this.state?.jigsaw?.placedChunks?.length > 0) ||
                            (this.state?.sudoku?.movesCount > 0);
      
      const isLocalEmpty = localProgCount === 0 && !hasLocalMoves;
      const hasCloudProgress = remoteProgCount > 0 || 
                               (hydratedProgress.memory?.pairsFound > 0) ||
                               (hydratedProgress.jigsaw?.placedChunks?.length > 0);

      // Logic: If remote is significantly newer, or if local is empty, or if remote stage count is HIGHER, adopt.
      if (!this.state || remoteTime > localTime + 1000 || (isLocalEmpty && hasCloudProgress) || hasHigherCloudProgress) {
        // v1.6.5: Stage Protection - If user is in a game, only adopt if remote is AHEAD or SAME stage.
        if (isAtGameRoute() && this.state && !isLocalEmpty) {
            const levels = ["memory", "jigsaw", "sudoku", "peaks", "search", "code"];
            const localStage = this.state.progress?.currentStage || this.state.currentStage;
            const remoteStage = hydratedProgress.progress?.currentStage || hydratedProgress.currentStage;
            
            const localIdx = levels.indexOf(localStage);
            const remoteIdx = levels.indexOf(remoteStage);
            
            if (remoteIdx < localIdx && !this.isWiping) {
                console.warn(`[Sync] Remote stage (${remoteStage}) is behind local (${localStage}). Ignoring potentially stale cloud start.`);
                return;
            }

            // v1.6.5: Partial Progress Shield
            if (remoteIdx === localIdx && !this.isWiping) {
                const localProg = this._calculateProgress(this.state);
                const remoteProg = this._calculateProgress(hydratedProgress);
                if (remoteProg < localProg) {
                    console.log(`[Sync] Remote progress (${remoteProg}%) is behind local (${localProg}%). Ignoring cloud update.`);
                    return;
                }
            }
        }

        // v1.4.6 History Safety: Force adoption if remote has today's win
        const todayStr = getJigsudoDateString();
        const remoteWonToday = remoteStats && remoteStats.history?.[todayStr]?.original?.won === true;
        const localWonToday = this.stats?.history?.[todayStr]?.original?.won === true;
        const victorySyncNeeded = remoteWonToday && !localWonToday;

        if (this.isWiping || !this.state || remoteTime > localTime + 60000 || victorySyncNeeded || (isLocalEmpty && hasCloudProgress) || hasHigherCloudProgress) {
          // v1.6.8: Redundancy check - Don't reload if states are effectively identical
          // v1.6.9: Removed !this.isWiping from here to prevent reload loops during initial sync
          if (this.state && this._compareProgress(this.state, hydratedProgress) && !victorySyncNeeded) {
            console.log("[Sync] Skipping adoption: Local and Remote states are identical.");
            return;
          }

          console.log(`[Sync] ADOPTING cloud progress. Reason: isWiping=${this.isWiping}, remoteTime=${remoteTime}, localTime=${localTime}, victorySyncNeeded=${victorySyncNeeded}, isLocalEmpty=${isLocalEmpty}, hasHigherCloudProgress=${hasHigherCloudProgress}`);
          
          // v1.5.33: Session Stats Protection
          if (this.state && this.state.stats && hydratedProgress.stats) {
            const localErrors = this.state.stats.peaksErrors || 0;
            const remoteErrors = hydratedProgress.stats.peaksErrors || 0;
            hydratedProgress.stats.peaksErrors = Math.max(localErrors, remoteErrors);
          }

          // v1.6.8: Adopt remote session ID to prevent "Account in use" flicker after adoption
          if (remoteStats && remoteStats.activeSessionId) {
             console.log(`[Sync] Adopting remote session ID: ${remoteStats.activeSessionId}`);
             this.localSessionId = remoteStats.activeSessionId;
             this.stats.activeSessionId = remoteStats.activeSessionId;
             // v1.6.9: Use unified sessionStorage key
             sessionStorage.setItem("jigsudo_active_session_id", this.localSessionId);
          }

          this.state = hydratedProgress;
          // v1.6.9: Manual write to bypass isWiping lock in save() during adoption
          localStorage.setItem(this.storageKey, JSON.stringify(this.state));
          localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
          window.location.reload(); 
        } else if (remoteTime > localTime + 1000) {
          // If seeds match and it's just a bit newer, show conflict modal
          this.showConflictResolution(hydratedProgress);
        }
      }
    }
    // v1.3.28: Final Master Sync Audit
    // Now that both Stats and Progress are potentially updated, 
    // we run the absolute repair to ensure they match perfectly.
    await this._recalculateNetStats(false, true); 
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
                <div style="font-size: 2rem; font-weight: bold;">${(this.state?.progress?.currentStage || this.state?.currentStage || "MEMORY").toUpperCase()}</div>
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
                <div style="font-size: 2rem; font-weight: bold; color: #6ee7b7;">${(remoteState?.progress?.currentStage || remoteState?.currentStage || "MEMORY").toUpperCase()}</div>
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
        const { showToast } = await import("./ui.js?v=1.4.7");
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
            await import("./db.js?v=1.4.7");
          const { getCurrentUser } = await import("./auth.js?v=1.4.7");
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

    // v1.6.5: Block keyboard events while conflict is active
    const keyBlocker = (e) => {
        if (this.conflictBlocked) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    };
    window.addEventListener("keydown", keyBlocker, { capture: true });
    
    // Clean up keyBlocker if overlay is removed
    const checkCleanup = setInterval(() => {
        if (!document.body.contains(overlay)) {
            window.removeEventListener("keydown", keyBlocker, { capture: true });
            clearInterval(checkCleanup);
        }
    }, 1000);
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
      const { translations: tData } = await import("./translations.js?v=1.4.7");
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

    // v1.6.5: Block keyboard events while exclusive lock is active
    const keyBlocker = (e) => {
        if (this.sessionBlocked) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    };
    window.addEventListener("keydown", keyBlocker, { capture: true });
    
    // Clean up keyBlocker if overlay is removed
    const checkCleanup = setInterval(() => {
        if (!document.body.contains(overlay)) {
            window.removeEventListener("keydown", keyBlocker, { capture: true });
            clearInterval(checkCleanup);
        }
    }, 1000);
  }

  async recordWin() {
    if (this._processingWin) return null;
    this._processingWin = true;
    
    // v1.4.6: Win Lock - Prevent Cloud Sync from overwritting this win for 10 seconds
    const lockUntil = Date.now() + 10000;
    this._winLockExpires = lockUntil;
    localStorage.setItem("jigsudo_win_lock", lockUntil.toString());

    return this.enqueueStatsUpdate(async () => {
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

      // v1.4.0: Standardized date derivation for consistency across all stats keys
      const { getDateStringFromSeed } = await import("./utils/time.js?v=1.4.7");
      const seedDate = getDateStringFromSeed(this.currentSeed);
      const puzzleDate = seedDate; // Alias used for history-specific keys
      
      const last = stats.lastPlayedDate;
      
      // v1.2.3: Calculate total time as the strict sum of the 6 game levels
      // v1.2.4: Summing rounded seconds to ensure UI consistency
      // v1.2.5: Custom rounding: nearest integer, but .5 rounds DOWN. Logic: Math.ceil(secs - 0.5)
      const stageTimes = this.state.meta?.stageTimes || {};
      const levels = ["memory", "jigsaw", "sudoku", "peaks", "search", "code"];
      const totalTimeMs = levels.reduce((sum, key) => {
          const secs = (stageTimes[key] || 0) / 1000;
          const roundedSecs = Math.ceil(secs - 0.5);
          return sum + (roundedSecs * 1000);
      }, 0);
      
      const peaksErrors = ((this.state.peaks && this.state.peaks.errors) || 0) + (this.state.stats?.peaksErrors || 0);
      const today = getJigsudoDateString();
      const isAlreadyWon = stats.history[puzzleDate]?.status === "won" || stats.history[puzzleDate]?.original?.won === true;
      const isLateCompletion = seedDate < today;

      console.log(`[GM recordWin] START. Seed: ${this.currentSeed}, puzzleDate: ${puzzleDate}, today: ${today}, isLate: ${isLateCompletion}`);

      if (!this.isReplay && !isAlreadyWon) {
        // v1.5.52: Consolidating increments further down in the common flow 
        // to avoid double jumps between early win detection and final sync.

        // Handle Streak and RP Resets (Consistent UTC Logic)
        let lastWinAnchor = last;
        
        // v1.6.2: Streak Healer - If lastPlayedDate is null, look into history 
        // to find the actual last win date. This repairs broken streaks from 
        // older sessions where lastPlayedDate wasn't being saved.
        if (!lastWinAnchor && stats.history) {
           const historyWins = Object.keys(stats.history)
             .filter(d => (stats.history[d].status === "won" || stats.history[d].original?.won === true) && d !== puzzleDate)
             .sort();
           if (historyWins.length > 0) {
              lastWinAnchor = historyWins[historyWins.length - 1];
              console.log(`[Streak] Found last win in history: ${lastWinAnchor}`);
           }
        }

        if (lastWinAnchor) {
          const diffDays = getJigsudoDayDiff(lastWinAnchor, puzzleDate);

          if (diffDays === 1) {
            stats.currentStreak = (stats.currentStreak || 0) + 1;
          } else if (diffDays > 1) {
            stats.currentStreak = 1;
          }
          // Note: diffDays == 0 (replay) is handled by the outer !isAlreadyWon check.
        } else {
          stats.currentStreak = 1;
        }

        // v1.3.2: Ensure lastPlayedDate is updated for future streak tracking
        // (Only update if the current puzzleDate is newer than the recorded one)
        if (puzzleDate > (stats.lastPlayedDate || "")) {
           stats.lastPlayedDate = puzzleDate;
        }

        if (stats.currentStreak > (stats.maxStreak || 0))
          stats.maxStreak = stats.currentStreak;
      } else if (!this.isReplay && isAlreadyWon) {
        // v1.2.7: Strict Isolation - Replays (re-wins) should NEVER update competitive rankings or accumulators.
        // They only exist to update the 'Best' score in the history map (handled later in recordWin).
        console.log("[Referee] Already won today. Skipping account RP and accumulator updates for this session.");
        
        // We only allow healing of the maintenance date if this is NOT a replay AND it's today's puzzle
        // but since isAlreadyWon is true, the server session already handled the maintenance.
      }
      // --- PREPARATION (Common for all flows) ---
      stats.lastLocalUpdate = Date.now();
      const historyEntry = stats.history[today] || {};
      // (isAlreadyWon is already declared at the top)

      // (Variables were defined at the top)
      const isOriginalDay = !this.isReplay && !isAlreadyWon && !isLateCompletion;

      // --- SECTION A: SELF-HEALING / RECOVERY ---
      if (!this.isReplay && isAlreadyWon && today === stats.lastDailyUpdate && !isLateCompletion) {
      }

      const { getCurrentUser } = await import("./auth.js?v=1.4.7");
      const { calculateTimeBonus } = await import("./ranks.js?v=1.4.7");
      const { callJigsudoFunction, saveUserStats, saveHistoryEntry } = await import("./db.js?v=1.4.7");
      
      const user = getCurrentUser();
      const timeBonus = calculateTimeBonus(Math.floor(totalTimeMs / 1000));

      // v1.5.48+: SINGLE ENTRY ACCOUNTING. 
      // ERRORS: already incremented live in updateProgress.
      // TIME: only updated once here.
      if (isOriginalDay) {
        stats.totalTimeAccumulated = (stats.totalTimeAccumulated || 0) + totalTimeMs;
        // v1.5.51: Removed redundant totalPeaksErrorsAccumulated += peaksErrors here.
        stats.totalPlayed = (stats.totalPlayed || 0) + 1;
        stats.wins = (stats.wins || 0) + 1;
      }
      
      // Stage Accumulators (For the FINAL stage only? No, recordWin sees the whole game)
      // BUT: stages Completed 1-5 were already handled by awardStagePoints.
      // ONLY 'code' (final) is missing.
      // v1.5.49: ATOMIC SOLIDARITY SYNC
      // Ensure every stage completed in the current session is reflected in the Atoms Map.
      // This heals any sync-loss that happened during registration.
      // v2.6.0: Resilient Progress Guard
      const stagesCompleted = (this.state && this.state.progress && this.state.progress.stagesCompleted) ? this.state.progress.stagesCompleted : [];
      
      // v1.3.11: FORCED ATOMIC SYNC
      // If we are here, we WON. We MUST ensure all 6 stages are in the atoms map
      // so recalculations (like _recalculateNetStats) correctly find 6.0 base points.
      const allStages = ["memory", "jigsaw", "sudoku", "peaks", "search", "code"];
      allStages.forEach(stage => {
          if (!stats.stageWinsAccumulated[stage]) {
              stats.stageWinsAccumulated[stage] = 1;
              console.log(`[Solidarity] Forced missing win atom for stage: ${stage}`);
          }
      });

      // v1.3.9: Robust Base Points & Win Counting
      // If we are at the final stage or have it in history, we force 6 stages.
      let stagesCountToday = stagesCompleted.length;
      if (this.state.progress.currentStage === "code" || stagesCompleted.includes("code") || (this.state.progress.won)) {
          stagesCountToday = 6;
      }
      let basePoints = stagesCountToday;
      const sessionScore = Number((basePoints + timeBonus - (peaksErrors * SCORING.ERROR_PENALTY_RP)).toFixed(3));
      const seedMonth = seedDate.substring(0,7);
      const todayMonth = today.substring(0,7);
      
      if (!isLateCompletion) {
        stats.dailyWinsAccumulated = Math.max(stats.dailyWinsAccumulated || 0, stagesCountToday);
      }
      
      // Monthly stats count even for late completions if it's the same month
      if (seedMonth === todayMonth) {
        stats.monthlyWinsAccumulated = Math.max(stats.monthlyWinsAccumulated || 0, stagesCountToday);
      }

      // Update stage times (Daily only)
      if (isOriginalDay) {
        for (const [stage, time] of Object.entries(stageTimes)) {
          stats.stageTimesAccumulated[stage] = (stats.stageTimesAccumulated[stage] || 0) + time;
        }
      }

      // --- 1. POINT ADOPTION (Referee Integration) ---
      if (!this.isReplay && !isAlreadyWon) {
        if (user && !user.isAnonymous) {
            let cloudState = null;
            if (this.state) {
                // v1.3.17: FINAL EVIDENCE GUARANTEE
                if (!this.state.progress.stagesCompleted) this.state.progress.stagesCompleted = [];
                const allStages = ["memory", "jigsaw", "sudoku", "peaks", "search", "code"];
                allStages.forEach(st => {
                    if (!this.state.progress.stagesCompleted.includes(st)) {
                        this.state.progress.stagesCompleted.push(st);
                    }
                });

                const { saveUserProgress } = await import("./db.js?v=1.4.7");
                cloudState = this._serializeState(this.state);
                await saveUserProgress(user.uid, cloudState, this.state.meta);
            }

            console.log("[Referee] Submitting results for validation...");
            try {
                // v1.3.18: RELAXED PEACE TREATY
                await new Promise(r => setTimeout(r, 1500));

                // v1.3.21: ROOT ALIGNMENT
                // Flatten the progress payload exactly how db.js does it.
                let pClean = cloudState ? { ...cloudState } : null;
                if (pClean && pClean.progress && pClean.memory && pClean.data) {
                    const { progress, ...rest } = pClean;
                    pClean = { ...progress, ...rest };
                }

                // v1.3.22: EXTREME REDUNDANCY
                // If the server still says 'Missing stages', we send it in every 
                // possible format (Array, Object, CSV) and under every possible name.
                const stagesArray = ["memory", "jigsaw", "sudoku", "peaks", "search", "code"];
                const stagesMap = {};
                stagesArray.forEach(s => stagesMap[s] = true);

                const serverResult = (await callJigsudoFunction("submitDailyWin", {
                    stageTimes: stageTimes,
                    peaksErrors: peaksErrors,
                    seed: this.currentSeed,
                    progress: pClean,
                    userId: user.uid,
                    
                    // Possible key name variations
                    stages: stagesArray,
                    stagesCompleted: stagesArray,
                    completedStages: stagesArray,
                    levels: stagesArray,
                    
                    // Possible format variations
                    stagesMap: stagesMap,
                    stagesList: stagesArray.join(","),
                    
                    // Metadata
                    totalStages: 6,
                    version: "1.3.8"
                })) || {};

            if (serverResult.status === "success") {
              console.log("[Referee] Game finalized and verified by server:", serverResult);
              if (serverResult.bonus !== undefined) stats.lastBonus = serverResult.bonus;
              
              // v1.5.51: Streak Fallback (If server returns 0 for a first win, local truth is 1)
              if (serverResult.streak !== undefined) {
                // v1.6.2: Protect local streak - Only accept server streak if it's superior
                // or if we are confident the server has the full history.
                const localStreak = stats.currentStreak || 0;
                if (serverResult.streak > localStreak) {
                  stats.currentStreak = serverResult.streak;
                } else {
                  console.log(`[Streak] Local streak (${localStreak}) is higher or equal to server (${serverResult.streak}). Keeping local.`);
                }
              }

              // v1.4.5: ATOMIC SYNC - Decoupled from Client.
              // Since the Referee (Server) now handles the global increment of accumulators 
              // upon a successful validation, the client MUST NOT increment them again locally
              // to avoid double-counting (inflation). 
              // We only update the 'lastBonus' marker for UI and local context.
              if (stats.lastBonus > 0) {
                console.log(`[Referee] Bonus confirmed: ${stats.lastBonus}. Server handles global totals.`);
              }

              // v1.4.8: REFINED ATOMIC UPDATE
              // Base points (6.0) are already added stage-by-stage in awardStagePoints.
              // Here we ONLY add the time bonus to complete the session score.
              const atomBonus = Number((stats.lastBonus || 0).toFixed(3));

              if (!isLateCompletion) {
                stats.dailyRP = Number(((stats.dailyRP || 0) + atomBonus).toFixed(3));
              }
              
              // stats.monthlyRP and stats.totalRP were already incremented by base points 
              // during stages. Now we add the bonus to match the server's global update.
              stats.monthlyRP = Number(((stats.monthlyRP || 0) + atomBonus).toFixed(3));
              stats.totalRP = Number(((stats.totalRP || 0) + atomBonus).toFixed(3));
              
              // Career RP (Performance tracking)
              stats.careerRP = Number(((stats.careerRP || 0) + atomBonus).toFixed(3));
              
              // v1.4.8: Finalizing the perfect score (Gross) and total bonuses
              // atomBonus (from lastBonus) is already the gross/perfect bonus.
              // Error penalties are subtracted later in _recalculateNetStats for RP tracks.
              stats.totalScoreAccumulated = Number(((stats.totalScoreAccumulated || 0) + atomBonus).toFixed(3));
              stats.totalBonusesAccumulated = Number(((stats.totalBonusesAccumulated || 0) + atomBonus).toFixed(3));
              stats.dailyBonusesAccumulated = Number(((stats.dailyBonusesAccumulated || 0) + atomBonus).toFixed(3));
              stats.monthlyBonusesAccumulated = Number(((stats.monthlyBonusesAccumulated || 0) + atomBonus).toFixed(3));

              this.state.progress.won = true;
              this.stats = stats;
              await this._recalculateNetStats();
              
              stats = this.stats;
            }
          } catch (err) {
            // v1.3.16: SILENT TREATMENT
            // If the error is just 'Missing stages', we don't spam the console anymore
            // since we know the local fallback is 100% accurate.
            if (err.message?.includes("Missing stages")) {
                console.log("[Referee] Server indexing lag detected (Missing stages). Local fallback engaged silently.");
            } else {
                console.error("[Referee] Validation failed! Using local fallback.", err);
            }
            this.state.progress.won = true; // Still mark as won for local scoring
            stats.lastBonus = timeBonus;

            // v1.3.11: COMPREHENSIVE LOCAL SYNC
            // If the server fails, we must ensure dailyRP and totalRP 
            // reflect the CORRECT sessionScore (including the 6.0 base guarantee).
            const oldDailyRP = stats.dailyRP || 0;
            const dailyScore = sessionScore < 0 ? 0 : sessionScore;
            
            // v1.6.0: MASTER SPEC COMPLIANCE - Parallel Accumulator Increments (Local Fallback)
            // We must update the "Atoms" (BonusesAccumulated) so _recalculateNetStats works.
            if (stats.lastBonus > 0) {
              stats.totalBonusesAccumulated = Number(((stats.totalBonusesAccumulated || 0) + stats.lastBonus).toFixed(3));
              if (seedMonth === todayMonth) {
                stats.monthlyBonusesAccumulated = Number(((stats.monthlyBonusesAccumulated || 0) + stats.lastBonus).toFixed(3));
              }
              if (!isLateCompletion) {
                stats.dailyBonusesAccumulated = Number(((stats.dailyBonusesAccumulated || 0) + stats.lastBonus).toFixed(3));
              }
            }

            if (!isLateCompletion) {
              stats.dailyRP = Number(dailyScore.toFixed(3));
            }
            
            // Adjust accumulators based on the difference
            const deltaRP = stats.dailyRP - oldDailyRP;
            if (deltaRP > 0) {
                stats.monthlyRP = Number(((stats.monthlyRP || 0) + deltaRP).toFixed(3));
                stats.totalRP = Number(((stats.totalRP || 0) + deltaRP).toFixed(3));
                stats.totalScoreAccumulated = Number(((stats.totalScoreAccumulated || 0) + stats.lastBonus).toFixed(3));
                stats.careerRP = Number(((stats.careerRP || 0) + stats.lastBonus).toFixed(3));
            }

            this.stats = stats;
            await this._recalculateNetStats();
            stats = this.stats;
          }
        } else {
          // Guest Flow
          this.state.progress.won = true;
          stats.lastBonus = timeBonus;

          // v1.5.46: ATOMS FIRST (Guest path)
          if (stats.lastBonus > 0) {
            stats.totalBonusesAccumulated = Number(((stats.totalBonusesAccumulated || 0) + stats.lastBonus).toFixed(3));
            if (seedMonth === todayMonth) {
              stats.monthlyBonusesAccumulated = Number(((stats.monthlyBonusesAccumulated || 0) + stats.lastBonus).toFixed(3));
            }
            if (!isLateCompletion) {
              stats.dailyBonusesAccumulated = Number(((stats.dailyBonusesAccumulated || 0) + stats.lastBonus).toFixed(3));
            }
          }

          // v1.6.0: MASTER SPEC COMPLIANCE - Parallel Accumulator Increments (Guest Flow)
          const atomScore = Number((1 + (stats.lastBonus || 0)).toFixed(3));
          
          if (!isLateCompletion) {
            stats.dailyRP = Number(((stats.dailyRP || 0) + atomScore).toFixed(3));
          }
          stats.monthlyRP = Number(((stats.monthlyRP || 0) + atomScore).toFixed(3));
          stats.totalRP = Number(((stats.totalRP || 0) + atomScore).toFixed(3));

          this.stats = stats;
          await this._recalculateNetStats();
          stats = this.stats;
        }
      }

      // --- 2. BASIC STATS ENRICHMENT ---
      if (stats.currentRP < 0) stats.currentRP = 0;
      if (stats.dailyRP < 0) stats.dailyRP = 0;
      if (stats.monthlyRP < 0) stats.monthlyRP = 0;

      // v1.3.9: Robust Base Points Calculation (MOVED UP to line 2940)
      
      // v1.3.2: Fixed critical scoping bug. 
      // The summary score and history entry should reflect THIS SESSION ONLY,
      // not the cumulative dailyRP (which may include previous attempts).
      const dailyScore = sessionScore < 0 ? 0 : sessionScore;
      // v1.5.51: ORGANIC RECORDS & ACCUMULATORS
      if (!this.isReplay && !isAlreadyWon) {
          // v1.5.52: Apply error penalty to ALL-TIME and MONTHLY accumulators.
          // REMOVED v1.3.24: Redundant. _recalculateNetStats already handles 
          // atomic error penalties via dailyPeaksErrorsAccumulated.

          // v1.5.52: Update Best Score if exceeded
          if (dailyScore > (stats.bestScore || 0)) {
              stats.bestScore = dailyScore;
          }
          
          if (stats.currentStreak > (stats.maxStreak || 0)) {
              stats.maxStreak = stats.currentStreak;
          }

          if (isLateCompletion) {
            console.log("[Referee] lateWin detected. Skipping Today's RP and Streak updates.");
          }

          // v1.5.51: Improved bestTime logic (0 means "no record")
          const currentBestTime = (stats.bestTime === 0 || stats.bestTime === null || stats.bestTime === undefined) ? Infinity : stats.bestTime;
          if (totalTimeMs > 0 && totalTimeMs < currentBestTime) {
            stats.bestTime = totalTimeMs;
          }

          // Weekday Aggregates
          const targetDayDate = (isLateCompletion || this.isReplay) ? puzzleDate : today;
          const dayIdx = new Date(targetDayDate + "T12:00:00").getDay();
          if (!stats.weekdayStatsAccumulated[dayIdx]) {
            stats.weekdayStatsAccumulated[dayIdx] = { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 };
          }
          const w = stats.weekdayStatsAccumulated[dayIdx];
          w.sumTime += totalTimeMs;
          w.sumErrors += peaksErrors;
          w.sumScore += dailyScore;
          w.count++;
      }

      if (!isLateCompletion && !this.isReplay) {
        stats.lastDailyUpdate = today; 
        stats.lastDecayCheck = today;
      }

      // --- 3. HISTORY ENRICHMENT ---
      const historyKey = puzzleDate;
      if (!stats.history[historyKey]) {
        stats.history[historyKey] = { seed: this.currentSeed, played: true };
      }

      const resultData = {
        score: dailyScore, 
        totalTime: totalTimeMs,
        stageTimes: stageTimes,
        stageStamps: this.state.meta.stageStamps || {},
        errors: peaksErrors,
        timestamp: Date.now(),
        won: true
      };

      const isNotWonYet = !stats.history[historyKey].original || stats.history[historyKey].original.won === false;
      if (isNotWonYet && isOriginalDay) {
        console.log(`[GM recordWin] WRITE ORIGINAL to history[${historyKey}]`);
        stats.history[historyKey].status = "won";
        stats.history[historyKey].original = resultData;
        stats.history[historyKey].best = resultData;
      } else {
        console.log(`[GM recordWin] WRITE UPDATE to history[${historyKey}]. isOriginalDay: ${isOriginalDay}`);
        stats.history[historyKey].status = "won";
        const existingBest = stats.history[historyKey].best || {};
        // v1.5.57: Strict Score Comparison (requested by user)
        // Only replace if the new score is strictly better.
        if (dailyScore > (existingBest.score || 0)) {
          stats.history[historyKey].best = resultData;
        }
      }

      // --- 4. PERSISTENCE ---
      if (this.isReplay || isLateCompletion) {
        console.log(`[GameManager] ${isLateCompletion ? "Late win" : "Replay win"}. Cleaning progress...`);
        this.state.progress = { stagesCompleted: [], currentStage: "memory" };
        const sections = ["memory", "jigsaw", "sudoku", "peaks", "search", "simon"];
        sections.forEach(s => { if (this.state[s]) this.state[s] = {}; });
        // Restore meta fields that might have been reset but are needed for the UI
        this.state.meta.userId = localStorage.getItem("jigsudo_active_uid");
        this.save();
      }

      stats.lastLocalUpdate = Date.now();
      this.stats = stats;
      localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));

      // --- 5. CLOUD SYNC ---
      if (user && !user.isAnonymous) {
        const { getJigsudoDateString, getJigsudoYearMonth } = await import("./utils/time.js?v=1.4.7");
        
        // Only mark today as updated if this was the ORIGINAL Daily win of the session.
        if (isOriginalDay) {
            this.stats.lastDailyUpdate = getJigsudoDateString();
            this.stats.lastMonthlyUpdate = getJigsudoYearMonth();
        }
        
        this.stats._isConfirmedWin = true; 
        
        await saveUserStats(user.uid, this.stats, user.displayName);
        if (this.stats.history[historyKey]) {
          await saveHistoryEntry(user.uid, this.currentSeed, this.stats.history[historyKey]);
        }
        delete this.stats._isConfirmedWin;
        localStorage.setItem("jigsudo_user_stats", JSON.stringify(this.stats));
      }
      await this.forceCloudSave();

      // --- 6. UX & NOTIFICATION ---
      const { stopTimer } = await import("./timer.js?v=1.4.7");
      const { showToast } = await import("./ui.js?v=1.4.7");
      const { getCurrentLang } = await import("./i18n.js?v=1.4.7");
      const { translations } = await import("./translations.js?v=1.4.7");
      
      stopTimer();
      const lang = getCurrentLang() || "es";
      showToast(translations[lang]?.toast_progress_saved || "¡Progreso Guardado! 💾🏆");

      const sessionStats = {
        totalTime: totalTimeMs,
        score: dailyScore,
        streak: stats.currentStreak || 1,
        errors: peaksErrors,
        stageTimes: stageTimes,
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
    });
  }

  /**
   * Scans history to re-calculate global records and cumulative metrics.
   * This ensures stats are always in sync with the history log (Source of Truth).
   */
  _recalculateRecords(stats, forceRebuild = false) {
    if (!stats) return;
    
    // v1.5.49+: Atom & Session Preservation
    // Capture "today's" atoms so we don't wipe active progress if a rebuild happens.
    const todayStr = getJigsudoDateString();
    const isActiveToday = stats.lastDailyUpdate === todayStr;
    const sessionAtoms = {
       dw: isActiveToday ? (stats.dailyWinsAccumulated || 0) : 0,
       mw: isActiveToday ? (stats.monthlyWinsAccumulated || 0) : 0,
       de: isActiveToday ? (stats.dailyPeaksErrorsAccumulated || 0) : 0,
       db: isActiveToday ? (stats.dailyBonusesAccumulated || 0) : 0,
       mb: isActiveToday ? (stats.monthlyBonusesAccumulated || 0) : 0,
       swMap: isActiveToday ? { ...(stats.stageWinsAccumulated || {}) } : {}
    };

    // v1.5.50: INCREMENTAL TRUTH SHIELD
    // We only perform the 'Nuclear Reset' if specifically forced or if it's a very old account
    // that needs a full history scan to populate the first atoms.
    const needsMigration = !stats.integrityChecked || stats.integrityChecked < "1.5.52";
    const historyExists = stats.history && Object.keys(stats.history).length > 0;

    // v1.5.54: ATOMIC SAFE REBUILD
    // Instead of resetting the official stats immediately, we build a temporary state.
    // If and only if the rebuild finds valid data, we apply it. 
    // This prevents the "Nuclear Zero" bug if the history isn't ready in memory.
    const rb = {
      totalPlayed: 0,
      wins: 0,
      totalScoreAccumulated: 0,
      careerRP: 0,
      totalTimeAccumulated: 0,
      totalPeaksErrorsAccumulated: 0,
      stageTimesAccumulated: {},
      stageWinsAccumulated: {},
      weekdayStatsAccumulated: {},
      maxStreak: 0,
      currentStreak: 0,
      bestTime: Infinity,
      bestScore: 0,
      monthlyWinsAccumulated: 0,
      monthlyPeaksErrorsAccumulated: 0
    };

    if (!historyExists) {
      if (forceRebuild || needsMigration) {
         stats.integrityChecked = "1.5.62";
      }
      return;
    }

    // Filter and sort won entries to rebuild history timeline
    const dates = Object.keys(stats.history)
      .filter((date) => stats.history[date].status === "won")
      .sort();

    if (dates.length === 0) {
      if (forceRebuild || needsMigration) {
          stats.integrityChecked = "1.5.62";
      }
      return;
    }

    let currentStreakCount = 0;
    let lastDate = null;
    const currentMonth = getJigsudoYearMonth();

    dates.forEach((dateStr) => {
      const h = stats.history[dateStr];
      const isOriginal = !!h.original;

      const hTime = Number(h.totalTime || 0);
      const hScore = Number(h.score || 0); 
      // v1.6.5: Robust error extraction for Season 1 (nested) and Legacy (flat) records
      const hData = h.original || h.best || h;
      const hErrors = Number(hData.errors || hData.peaksErrors || 0);

      // 1. LIFETIME AGGREGATES (Only if isOriginal)
      if (isOriginal) {
        rb.totalPlayed++;
        rb.wins++;
        rb.totalTimeAccumulated += hTime;
        const errorPenalty = hErrors * 0.5; // SCORING.ERROR_PENALTY_RP
        rb.totalScoreAccumulated += Number((hScore + errorPenalty).toFixed(3));
        rb.careerRP += Number(hScore.toFixed(3));
        rb.totalPeaksErrorsAccumulated += hErrors;

        // Monthly Atoms Rebuild Support
        const hMonth = dateStr.substring(0, 7);
        if (hMonth === currentMonth) {
          rb.monthlyWinsAccumulated += 1;
          rb.monthlyPeaksErrorsAccumulated += hErrors;
        }

        // Rebuild Stage Stats
        if (h.stageTimes) {
          for (const [stage, time] of Object.entries(h.stageTimes)) {
            rb.stageTimesAccumulated[stage] = (rb.stageTimesAccumulated[stage] || 0) + time;
            rb.stageWinsAccumulated[stage] = (rb.stageWinsAccumulated[stage] || 0) + 1;
          }
        }

        // Rebuild Weekday Aggregates
        const dWeek = new Date(dateStr + "T12:00:00");
        const dayIdx = dWeek.getDay();
        if (!rb.weekdayStatsAccumulated[dayIdx]) {
          rb.weekdayStatsAccumulated[dayIdx] = { sumTime: 0, sumErrors: 0, sumScore: 0, count: 0 };
        }
        const w = rb.weekdayStatsAccumulated[dayIdx];
        w.sumTime += hTime;
        w.sumErrors += hErrors;
        w.sumScore += hScore;
        w.count++;
      }

      // 2. BESTS & STREAKS (Calculated globally)
      if (hTime > 0 && hTime < rb.bestTime) {
        rb.bestTime = hTime;
      }
      if (hScore > rb.bestScore) {
        rb.bestScore = hScore;
      }

      const d = new Date(dateStr + "T12:00:00");
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
        lastDate = d;
        if (currentStreakCount > rb.maxStreak) rb.maxStreak = currentStreakCount;
        rb.currentStreak = currentStreakCount;
      }
    });

    // 3. FINAL ATOMIC APPLY
    if (forceRebuild || needsMigration) {
      if (rb.totalPlayed > 0) {
        stats.totalPlayed = rb.totalPlayed;
        stats.wins = rb.wins;
        stats.totalScoreAccumulated = rb.totalScoreAccumulated;
        stats.careerRP = rb.careerRP;
        stats.totalTimeAccumulated = rb.totalTimeAccumulated;
        stats.totalPeaksErrorsAccumulated = rb.totalPeaksErrorsAccumulated;
        stats.stageTimesAccumulated = rb.stageTimesAccumulated;
        stats.stageWinsAccumulated = rb.stageWinsAccumulated;
        stats.weekdayStatsAccumulated = rb.weekdayStatsAccumulated;
        stats.maxStreak = rb.maxStreak;
        stats.currentStreak = rb.currentStreak;
        stats.bestTime = (rb.bestTime === Infinity) ? null : rb.bestTime;
        stats.bestScore = rb.bestScore;
        stats.monthlyWinsAccumulated = rb.monthlyWinsAccumulated;
        stats.monthlyPeaksErrorsAccumulated = rb.monthlyPeaksErrorsAccumulated;
        
        // v1.6.0: Monthly/Total RP are net outcomes (Career - Penalties)
        const totalPenalties = stats.totalPenaltyAccumulated || 0;
        stats.totalRP = Number((Math.max(0, stats.careerRP - totalPenalties)).toFixed(3));
        stats.currentRP = stats.totalRP; // Legacy support
      }
      stats.integrityChecked = "1.5.62";
    }

    // v1.5.49: Re-apply session atoms captured at the beginning
    // This ensures that progress for a game currently in progress (not yet in history) is preserved.
    if (typeof sessionAtoms !== 'undefined') {
      stats.dailyWinsAccumulated = Math.max(stats.dailyWinsAccumulated || 0, sessionAtoms.dw);
      stats.monthlyWinsAccumulated = Math.max(stats.monthlyWinsAccumulated || 0, sessionAtoms.mw);
      stats.dailyPeaksErrorsAccumulated = Math.max(stats.dailyPeaksErrorsAccumulated || 0, sessionAtoms.de);
      stats.dailyBonusesAccumulated = Math.max(stats.dailyBonusesAccumulated || 0, sessionAtoms.db);
      stats.monthlyBonusesAccumulated = Math.max(stats.monthlyBonusesAccumulated || 0, sessionAtoms.mb);
      
      if (!stats.stageWinsAccumulated) stats.stageWinsAccumulated = {};
      Object.entries(sessionAtoms.swMap).forEach(([stage, count]) => {
        stats.stageWinsAccumulated[stage] = Math.max(stats.stageWinsAccumulated[stage] || 0, count);
      });
    }

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
      // v1.6.9: Use stringification for deep array comparison to prevent reload loops
      const b1 = JSON.stringify(s1.sudoku?.currentBoard || []);
      const b2 = JSON.stringify(s2.sudoku?.currentBoard || []);
      if (b1 !== b2) return false;
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
      stagePointsAccumulated: {},
      weekdayStatsAccumulated: {},
      history: {},
      lastPlayedDate: null,
      lastDecayCheck: null,
      manualRPAdjustment: 0,
      totalPenaltyAccumulated: 0,
      monthlyPenaltyAccumulated: 0,
      isPublic: true, // v1.5.30: Default to public
      integrityChecked: "1.5.62",
      schemaVersion: 7.2
    };
  }
}
export const gameManager = new GameManager();
