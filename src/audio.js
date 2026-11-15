// All sound is synthesised with the Web Audio API. Nothing here may throw: the game must
// keep working when audio is unavailable or has not been allowed to start yet.

const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0;

export function createAudio(makeContext = () => new AudioContext()) {
  let ctx = null, master = null, noise = null, cricketTimer = null;
  let tried = false, night = 0;
  const api = {
    muted: false,
    started: false,
    start() {
      if (tried) return;
      tried = true;
      try {
        ctx = makeContext();
        master = ctx.createGain();
        master.gain.value = api.muted ? 0 : 0.6;
        master.connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        startAmbience();
        api.started = true;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      } catch {
        ctx = null; master = null; api.started = false;
      }
    },
    toggleMute() {
      api.muted = !api.muted;
      try {
        if (master) master.gain.setTargetAtTime(api.muted ? 0 : 0.6, ctx.currentTime, 0.03);
      } catch { /* audio is optional */ }
      return api.muted;
    },
    setNight(f) { night = f; },
    play(name) {
      if (!api.started || !ctx) return;
      const sound = SOUNDS[name];
      if (!sound) return;
      try { sound(); } catch { /* audio is optional */ }
    },
  };

  function noiseSource(loop = false) {
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = loop;
    return src;
  }

  function startAmbience() {
    // Waves: low filtered noise that swells slowly.
    const waves = noiseSource(true);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480;
    const swell = ctx.createGain(); swell.gain.value = 0.11;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain).connect(swell.gain);
    waves.connect(lp).connect(swell).connect(master);
    waves.start(); lfo.start();

    // Wind: a thin band of noise, quieter still.
    const wind = noiseSource(true);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 0.6;
    const windGain = ctx.createGain(); windGain.gain.value = 0.02;
    const windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.07;
    const windLfoGain = ctx.createGain(); windLfoGain.gain.value = 0.012;
    windLfo.connect(windLfoGain).connect(windGain.gain);
    wind.connect(bp).connect(windGain).connect(master);
    wind.start(0, 0.7); windLfo.start();

    // Crickets come out at night.
    cricketTimer = setInterval(() => {
      if (!ctx || night < 0.5 || Math.random() > 0.3) return;
      try {
        const f = 3900 + Math.random() * 700;
        for (let i = 0; i < 3; i++) tone(f, { type: 'sine', dur: 0.05, gain: 0.012, delay: i * 0.075, attack: 0.005 });
      } catch { /* audio is optional */ }
    }, 320);
  }

  // A short note with a soft attack and a fading tail.
  function tone(freq, { type = 'triangle', dur = 0.4, gain = 0.12, delay = 0, attack = 0.008, to = null } = {}) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // A burst of filtered noise.
  function hiss({ type = 'bandpass', freq = 2000, q = 0.8, dur = 0.2, gain = 0.05, delay = 0 } = {}) {
    const t = ctx.currentTime + delay;
    const src = noiseSource();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  const SOUNDS = {
    lantern() { tone(E5, { dur: 0.5, gain: 0.09 }); tone(A5, { dur: 0.6, gain: 0.07, delay: 0.09 }); },
    door() { tone(170, { type: 'sine', dur: 0.16, gain: 0.16, to: 110 }); hiss({ type: 'lowpass', freq: 900, dur: 0.08, gain: 0.05 }); },
    bell() {
      for (const [mult, gain, dur] of [[1, 0.13, 2.4], [2.01, 0.06, 1.8], [2.76, 0.04, 1.3], [5.4, 0.02, 0.8]]) {
        tone(C5 * mult, { type: 'sine', dur, gain, attack: 0.004 });
        tone(C5 * mult, { type: 'sine', dur: dur * 0.7, gain: gain * 0.6, delay: 0.75, attack: 0.004 });
      }
    },
    sit() { tone(G5 / 2, { dur: 0.35, gain: 0.08 }); },
    rustle() { hiss({ freq: 3200, q: 0.5, dur: 0.35, gain: 0.05 }); hiss({ freq: 2400, q: 0.5, dur: 0.3, gain: 0.04, delay: 0.14 }); },
    fire() { hiss({ type: 'lowpass', freq: 700, dur: 0.6, gain: 0.09 }); tone(G5 / 2, { dur: 0.5, gain: 0.07 }); tone(D5, { dur: 0.5, gain: 0.05, delay: 0.1 }); },
    squeak() { tone(680, { type: 'sine', dur: 0.14, gain: 0.1, to: 1150 }); tone(D5 * 2, { type: 'sine', dur: 0.2, gain: 0.04, delay: 0.1 }); },
    cluck() { for (let i = 0; i < 3; i++) tone(520 + Math.random() * 180, { type: 'triangle', dur: 0.07, gain: 0.07, delay: i * 0.1 + Math.random() * 0.03, to: 380 }); },
    purr() { for (let i = 0; i < 9; i++) tone(92, { type: 'triangle', dur: 0.07, gain: 0.09, delay: i * 0.075 }); tone(A5, { type: 'sine', dur: 0.4, gain: 0.03, delay: 0.1 }); },
    step() { hiss({ type: 'lowpass', freq: 650, dur: 0.06, gain: 0.035 }); },
    splash() { hiss({ freq: 1500, q: 0.6, dur: 0.22, gain: 0.06 }); },
  };

  return api;
}
