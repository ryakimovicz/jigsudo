import { CONFIG } from "./config.js";

class SoundManager {
  constructor() {
    this.enabled = CONFIG.ENABLE_SOUND;
    this.muted = localStorage.getItem("jigsudo_sound_muted") === "true";
    this.vibration = localStorage.getItem("jigsudo_vibration_on") !== "false"; // Default true

    this.sounds = {};

    // Preload sounds if enabled (Placeholder for future)
    if (this.enabled) {
      this.loadSounds();
    }
  }

  loadSounds() {
    // TODO: Load actual sound files here
    // this.sounds['click'] = new Audio('assets/sounds/click.mp3');
    console.log("[SoundManager] Sounds loading initialized (empty).");
  }

  play(soundName) {
    if (!this.enabled || this.muted) return;

    const sound = this.sounds[soundName];
    if (sound) {
      // Clone node to allow overlapping sounds
      // const clone = sound.cloneNode();
      // clone.play().catch(e => console.warn("Audio play failed:", e));
      console.log(`[SoundManager] Playing: ${soundName}`);
    } else {
      // console.warn(`[SoundManager] Sound not found: ${soundName}`);
    }
  }

  toggleMute(state) {
    this.muted = state;
    localStorage.setItem("jigsudo_sound_muted", state);
    console.log(`[SoundManager] Mute set to: ${state}`);
  }

  toggleVibration(state) {
    this.vibration = state;
    localStorage.setItem("jigsudo_vibration_on", state);
    console.log(`[SoundManager] Vibration set to: ${state}`);

    if (state && navigator.vibrate) {
      navigator.vibrate(50); // Feedback
    }
  }

  vibrate(pattern) {
    if (this.enabled && this.vibration && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }
}

export const soundManager = new SoundManager();
