/**
 * sound.js
 * --------
 * Short error tone generated with the Web Audio API - no external audio
 * file, so nothing to host or fail to load. AudioContext is only created
 * lazily on first user interaction, respecting browser autoplay policies.
 */

import { Store } from "./store.js";

let ctx = null;
let unlocked = false;

function ensureContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  return ctx;
}

// Call this from any early user gesture (e.g. first click anywhere) to
// satisfy autoplay restrictions before we ever need to play a real sound.
export function primeAudioOnFirstGesture() {
  const unlock = () => {
    const c = ensureContext();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function playErrorSound() {
  if (!Store.state.settings.errorSoundEnabled) return;
  const c = ensureContext();
  if (!c) return; // Web Audio unsupported - fail silently, no crash
  if (c.state === "suspended") {
    // Browser blocked autoplay because there was no user gesture yet.
    // We simply skip the sound rather than throwing.
    c.resume().catch(() => {});
    if (c.state === "suspended") return;
  }

  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}
