// WebAudio beeps for timers.

// ─── AUDIO ENGINE ────────────────────────────────────────────────────────────

export function playBeep(freq=880, duration=0.08, vol=0.3) {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

export function playDone() {
  // Three ascending tones
  setTimeout(()=>playBeep(523, 0.15, 0.4), 0);
  setTimeout(()=>playBeep(659, 0.15, 0.4), 160);
  setTimeout(()=>playBeep(784, 0.35, 0.5), 320);
}

