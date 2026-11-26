// TRADEWIND RUN — synthesised sound.
// One job: every sound the game makes, built from WebAudio oscillators and noise.
// No audio files, no network. Audio starts only after a user gesture (browser rule).

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      // Engine hum: two detuned sawtooths through a low-pass filter.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 70;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 71.5;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Keep the second oscillator reachable so the garbage collector cannot eat it.
      engineOsc._mate = engineOsc2;

      // Wind: looped white noise through a band-pass filter.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0.0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();
    } catch {
      ctx = null; // audio unavailable: the game plays silent, never crashes
    }
  }

  // Call every frame while flying: engine pitch follows throttle, wind follows speed.
  function update(throttle, speedKt, stalled) {
    if (!ctx || !engineOsc) return;
    const t = ctx.currentTime;
    const target = 55 + throttle * 1.1 + (stalled ? -14 : 0);
    engineOsc.frequency.setTargetAtTime(target, t, 0.08);
    engineOsc._mate.frequency.setTargetAtTime(target * 1.02, t, 0.08);
    engineGain.gain.setTargetAtTime(0.05 + (throttle / 100) * 0.075, t, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.14, (speedKt / 185) * 0.14), t, 0.15);
  }

  function blip(freq, dur, type = 'sine', vol = 0.25) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur);
  }

  return {
    ensure,
    update,
    ring: () => { blip(880, 0.18); setTimeout(() => blip(1318, 0.28), 90); },
    centre: () => { blip(880, 0.14); setTimeout(() => blip(1108, 0.14), 70); setTimeout(() => blip(1568, 0.3), 140); },
    stall: () => blip(220, 0.4, 'square', 0.12),
    thud: () => blip(70, 0.3, 'triangle', 0.4),
    crash: () => { blip(160, 0.5, 'sawtooth', 0.3); setTimeout(() => blip(60, 0.8, 'sawtooth', 0.3), 120); },
    fanfare: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.35), i * 130)); },
    click: () => blip(660, 0.06, 'sine', 0.15),
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
  };
}
