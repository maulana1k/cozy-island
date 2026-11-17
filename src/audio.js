// All sound is synthesised with the Web Audio API. Nothing here may throw: the game must
// keep working when audio is unavailable or has not been allowed to start yet.

const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0;

export function createAudio(makeContext = () => new AudioContext()) {
  let ctx = null, master = null, noise = null, cricketTimer = null;
  let tried = false, night = 0, fireLevel = 0, fireGain = null, seaGain = null;
  let rainLevel = 0, rainIndoor = false, rainGain = null, rainOut = 0;
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
    // How close you are to a burning fire, 0 to 1: a low roar and random cracks and pops.
    setFire(level) {
      fireLevel = level;
      try { if (fireGain) fireGain.gain.setTargetAtTime(level * level * 0.035, ctx.currentTime, 0.2); } catch { /* audio is optional */ }
    },
    // How close the sea is, 0 to 1: the waves are loud on the beach and all but gone in the middle of camp.
    setSea(level) {
      try { if (seaGain) seaGain.gain.setTargetAtTime(0.12 + level * 0.88, ctx.currentTime, 0.6); } catch { /* audio is optional */ }
    },
    // Rain 0..1 (from the weather blend); indoors it is muffled by the walls. Fades smoothly, follows mute through master.
    setRain(level, indoor = false) {
      rainLevel = Math.min(1, Math.max(0, level || 0)); rainIndoor = !!indoor;
      rainOut = rainLevel * (rainIndoor ? 0.3 : 1);
      try { if (rainGain) rainGain.gain.setTargetAtTime(rainOut * rainOut * 0.5 + rainOut * 0.5 * 0.5, ctx.currentTime, 0.7); } catch { /* audio is optional */ }
    },
    // A distant rumble `delay` s from now (the flash comes first); strength 0..1. Gentle on purpose.
    thunder(delay = 3, strength = 0.7) {
      if (!api.started || !ctx) return;
      try { rumble(delay, strength); } catch { /* audio is optional */ }
    },
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
    seaGain = ctx.createGain(); seaGain.gain.value = 0.3;
    waves.connect(lp).connect(swell).connect(seaGain).connect(master);
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

    // Fire: a soft roar that swells as you come near, and sharp cracks from the burning wood.
    const roar = noiseSource(true);
    const roarBand = ctx.createBiquadFilter(); roarBand.type = 'bandpass'; roarBand.frequency.value = 420; roarBand.Q.value = 0.5;
    roarBand.frequency.value = 950; roarBand.Q.value = 0.35;
    fireGain = ctx.createGain(); fireGain.gain.value = 0;
    roar.connect(roarBand).connect(fireGain).connect(master); roar.start(0, 1.1);
    setInterval(() => {
      if (!ctx || fireLevel < 0.04 || Math.random() > 0.25 + fireLevel * 0.45) return;
      try {
        // Dry wood snapping: a sharp tick, now and then a deeper pop with a little shower of ticks after it.
        const loud = fireLevel * (0.35 + Math.random() * 0.65);
        hiss({ type: 'bandpass', freq: 2600 + Math.random() * 2200, q: 3, dur: 0.012 + Math.random() * 0.02, gain: 0.16 * loud });
        if (Math.random() < 0.18) { tone(150 + Math.random() * 70, { type: 'sine', dur: 0.06, gain: 0.07 * loud, to: 70, attack: 0.002 }); for (let k = 1; k <= 3; k++) hiss({ type: 'bandpass', freq: 3200 + Math.random() * 1500, q: 4, dur: 0.01, gain: 0.08 * loud, delay: 0.04 * k + Math.random() * 0.03 }); }
      } catch { /* audio is optional */ }
    }, 70);

    // Rain: a soft bed of band-shaped noise, a low hush under it, and a thin patter of tiny drop ticks on top.
    rainGain = ctx.createGain(); rainGain.gain.value = 0; rainGain.connect(master);
    const bed = noiseSource(true), bedBand = ctx.createBiquadFilter(); bedBand.type = 'bandpass'; bedBand.frequency.value = 1500; bedBand.Q.value = 0.35;
    const bedLow = ctx.createBiquadFilter(); bedLow.type = 'lowpass'; bedLow.frequency.value = 4200;
    const bedGain = ctx.createGain(); bedGain.gain.value = 0.16;
    bed.connect(bedBand).connect(bedLow).connect(bedGain).connect(rainGain); bed.start(0, 0.4);
    const hush = noiseSource(true), hushLp = ctx.createBiquadFilter(); hushLp.type = 'lowpass'; hushLp.frequency.value = 380;
    const hushGain = ctx.createGain(); hushGain.gain.value = 0.18;
    hush.connect(hushLp).connect(hushGain).connect(rainGain); hush.start(0, 1.3);
    const patter = noiseSource(true), patHp = ctx.createBiquadFilter(); patHp.type = 'highpass'; patHp.frequency.value = 5200;
    const patGain = ctx.createGain(); patGain.gain.value = 0.035;
    const patLfo = ctx.createOscillator(); patLfo.frequency.value = 0.23; const patLfoG = ctx.createGain(); patLfoG.gain.value = 0.015;
    patLfo.connect(patLfoG).connect(patGain.gain);
    patter.connect(patHp).connect(patGain).connect(rainGain); patter.start(0, 0.9); patLfo.start();
    rainGain.gain.value = rainOut * rainOut * 0.5 + rainOut * 0.25;
    setInterval(() => {
      if (!ctx || rainOut < 0.05) return;
      try {
        const n = 1 + (Math.random() * 3 * rainOut) | 0;
        for (let i = 0; i < n; i++) hiss({ type: 'bandpass', freq: 4200 + Math.random() * 4500, q: 4, dur: 0.008 + Math.random() * 0.012, gain: (0.01 + Math.random() * 0.02) * rainOut, delay: Math.random() * 0.06 });
      } catch { /* audio is optional */ }
    }, 70);

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

  // Thunder: low-passed noise that swells slowly and rolls away; now and then a soft crack comes first.
  function rumble(delay, strength) {
    const k = Math.min(1, Math.max(0.15, strength)) * (rainIndoor ? 0.45 : 1);
    const t0 = ctx.currentTime + Math.max(0, delay);
    const crack = Math.random() < 0.55;
    if (crack) hiss({ type: 'bandpass', freq: 900 + Math.random() * 700, q: 0.7, dur: 0.22, gain: 0.05 * k, delay: Math.max(0, delay) });
    const lead = crack ? 0.35 + Math.random() * 0.3 : 0, rise = 1.2 + Math.random() * 1.2, roll = 4.5 + Math.random() * 4;
    const src = noiseSource(true), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    const f0 = 170 + Math.random() * 90;
    lp.frequency.setValueAtTime(f0, t0 + lead); lp.frequency.exponentialRampToValueAtTime(65, t0 + lead + rise + roll);
    const g = ctx.createGain(), peak = 0.7 * k, a = t0 + lead;
    g.gain.setValueAtTime(0.0001, a);
    g.gain.linearRampToValueAtTime(peak, a + rise);
    g.gain.linearRampToValueAtTime(peak * 0.55, a + rise + roll * 0.3);
    g.gain.linearRampToValueAtTime(peak * (0.75 + Math.random() * 0.2), a + rise + roll * 0.42); // a second roll
    g.gain.exponentialRampToValueAtTime(0.0001, a + rise + roll);
    src.connect(lp).connect(g).connect(master);
    src.start(a, Math.random() * 1.5); src.stop(a + rise + roll + 0.1);
  }

  const SOUNDS = {
    lantern() { tone(E5, { dur: 0.5, gain: 0.09 }); tone(A5, { dur: 0.6, gain: 0.07, delay: 0.09 }); },
    zip() { hiss({ type: 'highpass', freq: 3400, dur: 0.75, gain: 0.035 }); },
    door() { tone(170, { type: 'sine', dur: 0.16, gain: 0.16, to: 110 }); hiss({ type: 'lowpass', freq: 900, dur: 0.08, gain: 0.05 }); },
    bell() {
      for (const [mult, gain, dur] of [[1, 0.13, 2.4], [2.01, 0.06, 1.8], [2.76, 0.04, 1.3], [5.4, 0.02, 0.8]]) {
        tone(C5 * mult, { type: 'sine', dur, gain, attack: 0.004 });
        tone(C5 * mult, { type: 'sine', dur: dur * 0.7, gain: gain * 0.6, delay: 0.75, attack: 0.004 });
      }
    },
    sit() { tone(G5 / 2, { dur: 0.35, gain: 0.08 }); },
    rustle() { hiss({ freq: 3200, q: 0.5, dur: 0.35, gain: 0.05 }); hiss({ freq: 2400, q: 0.5, dur: 0.3, gain: 0.04, delay: 0.14 }); },
    // Leaves brushing past the legs: a soft, quiet swish (src/world/react.js).
    brush() { hiss({ freq: 2600 + Math.random() * 900, q: 0.6, dur: 0.22, gain: 0.016 }); hiss({ freq: 1900 + Math.random() * 600, q: 0.6, dur: 0.18, gain: 0.011, delay: 0.09 }); },
    // Something small knocked along the ground: a little dry tick.
    knock() { hiss({ type: 'highpass', freq: 3800, q: 0.7, dur: 0.05, gain: 0.02 }); },
    fire() { hiss({ type: 'lowpass', freq: 700, dur: 0.6, gain: 0.09 }); tone(G5 / 2, { dur: 0.5, gain: 0.07 }); tone(D5, { dur: 0.5, gain: 0.05, delay: 0.1 }); },
    squeak() { tone(680, { type: 'sine', dur: 0.14, gain: 0.1, to: 1150 }); tone(D5 * 2, { type: 'sine', dur: 0.2, gain: 0.04, delay: 0.1 }); },
    cluck() { for (let i = 0; i < 3; i++) tone(520 + Math.random() * 180, { type: 'triangle', dur: 0.07, gain: 0.07, delay: i * 0.1 + Math.random() * 0.03, to: 380 }); },
    purr() { for (let i = 0; i < 9; i++) tone(92, { type: 'triangle', dur: 0.07, gain: 0.09, delay: i * 0.075 }); tone(A5, { type: 'sine', dur: 0.4, gain: 0.03, delay: 0.1 }); },
    baa() { tone(340, { type: 'sawtooth', dur: 0.5, gain: 0.035, to: 300 }); tone(345, { type: 'triangle', dur: 0.5, gain: 0.06, to: 296 }); },
    step() { hiss({ type: 'lowpass', freq: 650, dur: 0.06, gain: 0.035 }); },
    // Footsteps sound different on each kind of ground.
    'step:dirt'() { hiss({ type: 'lowpass', freq: 700, dur: 0.06, gain: 0.04 }); },
    'step:grass'() { hiss({ freq: 3400, q: 0.5, dur: 0.09, gain: 0.03 }); },
    'step:meadow'() { hiss({ freq: 2800, q: 0.5, dur: 0.12, gain: 0.034 }); },
    'step:forest'() { hiss({ freq: 4200, q: 0.7, dur: 0.07, gain: 0.03 }); hiss({ freq: 1600, q: 0.6, dur: 0.1, gain: 0.02, delay: 0.02 }); },
    'step:sand'() { hiss({ freq: 1700, q: 0.3, dur: 0.14, gain: 0.03 }); },
    'step:mud'() { tone(150, { type: 'sine', dur: 0.13, gain: 0.07, to: 80 }); hiss({ type: 'lowpass', freq: 420, dur: 0.12, gain: 0.05, delay: 0.03 }); },
    'step:wood'() { tone(190 + Math.random() * 40, { type: 'triangle', dur: 0.09, gain: 0.07, to: 130 }); hiss({ type: 'lowpass', freq: 900, dur: 0.04, gain: 0.03 }); },
    'step:floor'() { hiss({ type: 'lowpass', freq: 500, dur: 0.05, gain: 0.03 }); },
    'step:rock'() { hiss({ freq: 2600, q: 1.5, dur: 0.04, gain: 0.04 }); },
    'step:water'() { hiss({ freq: 1500, q: 0.6, dur: 0.22, gain: 0.06 }); tone(420, { type: 'sine', dur: 0.12, gain: 0.03, to: 700 }); },
    // Interface sounds
    discover() { [E5, G5, C5 * 2].forEach((f, i) => tone(f, { dur: 0.5, gain: 0.08, delay: i * 0.09 })); },
    rank() { [C5, E5, G5, C5 * 2, E5 * 2].forEach((f, i) => tone(f, { dur: 0.7, gain: 0.09, delay: i * 0.11 })); tone(C5 / 2, { type: 'sine', dur: 1.2, gain: 0.07 }); },
    ui() { tone(A5, { type: 'sine', dur: 0.08, gain: 0.04 }); },
    // The flying fox trolley whirring down the cable.
    zip() { hiss({ freq: 2200, q: 2.5, dur: 8.2, gain: 0.05 }); tone(220, { type: 'sawtooth', dur: 8, gain: 0.016, to: 560 }); },
    whistle() { tone(2300, { type: 'sine', dur: 0.16, gain: 0.05 }); tone(2300, { type: 'sine', dur: 0.4, gain: 0.05, delay: 0.22 }); },
    laugh() { for (let i = 0; i < 5; i++) tone(700 + i * 60 + Math.random() * 80, { type: 'triangle', dur: 0.09, gain: 0.05, delay: i * 0.1, to: 560 }); },
    cheer() { tone(D5, { dur: 0.2, gain: 0.06 }); tone(G5, { dur: 0.3, gain: 0.06, delay: 0.1 }); },
    alarm() { for (let i = 0; i < 3; i++) { tone(620, { type: 'square', dur: 0.16, gain: 0.035, delay: i * 0.34 }); tone(465, { type: 'square', dur: 0.16, gain: 0.035, delay: i * 0.34 + 0.17 }); } },
    growl() { tone(62, { type: 'sawtooth', dur: 1.3, gain: 0.07, to: 48 }); tone(93, { type: 'sawtooth', dur: 1.1, gain: 0.03, to: 70, delay: 0.1 }); hiss({ type: 'lowpass', freq: 300, dur: 1.2, gain: 0.05 }); },
    song() { [C5, C5, G5, G5, A5, A5, G5, 0, E5 * 1.0, E5, D5, D5, C5].forEach((f, i) => { if (f) { tone(f, { dur: 0.42, gain: 0.05, delay: i * 0.36 }); tone(f / 2, { type: 'sine', dur: 0.42, gain: 0.035, delay: i * 0.36 }); } }); },
    pickup() { tone(G5, { dur: 0.12, gain: 0.07 }); tone(C5 * 2, { dur: 0.22, gain: 0.07, delay: 0.07 }); },
    munch() { for (let i = 0; i < 4; i++) hiss({ type: 'bandpass', freq: 1300 + Math.random() * 500, q: 1.2, dur: 0.07, gain: 0.07, delay: i * 0.17 }); },
    gulp() { for (let i = 0; i < 3; i++) tone(240, { type: 'sine', dur: 0.12, gain: 0.09, delay: i * 0.22, to: 420 }); },
    pour() { hiss({ freq: 1800, q: 0.5, dur: 0.9, gain: 0.05 }); tone(300, { type: 'sine', dur: 0.9, gain: 0.03, to: 760 }); },
    rumble() { tone(70, { type: 'sine', dur: 0.5, gain: 0.12, to: 95 }); tone(88, { type: 'triangle', dur: 0.35, gain: 0.06, delay: 0.3, to: 60 }); },
    bugle() { [[G5 / 2, 0], [C5, 0.16], [E5, 0.32], [G5, 0.48]].forEach(([f, d]) => { tone(f, { type: 'sawtooth', dur: d > 0.4 ? 0.6 : 0.16, gain: 0.035, delay: d }); tone(f, { type: 'triangle', dur: d > 0.4 ? 0.6 : 0.16, gain: 0.06, delay: d }); }); },
    sizzle() { hiss({ type: 'highpass', freq: 3200, dur: 1.0, gain: 0.05 }); },
    click() { tone(900, { type: 'square', dur: 0.03, gain: 0.03 }); },
    // The telescope: a soft detent click as the zoom ring passes each step, and a small motor whirr as it turns.
    scopeTick() { hiss({ type: 'bandpass', freq: 2600, q: 7, dur: 0.016, gain: 0.05 }); tone(520, { type: 'square', dur: 0.018, gain: 0.01 }); },
    scopeWhirr() { tone(170, { type: 'sawtooth', dur: 0.35, gain: 0.01, to: 260, attack: 0.04 }); hiss({ type: 'bandpass', freq: 1100, q: 3, dur: 0.35, gain: 0.018 }); },
    scopeIn() { hiss({ type: 'lowpass', freq: 700, dur: 0.5, gain: 0.03 }); tone(330, { type: 'sine', dur: 0.12, gain: 0.025, delay: 0.55, to: 300 }); },
    nope() { tone(220, { type: 'triangle', dur: 0.12, gain: 0.06 }); tone(180, { type: 'triangle', dur: 0.16, gain: 0.06, delay: 0.1 }); },
    splash() { hiss({ freq: 1500, q: 0.6, dur: 0.22, gain: 0.06 }); },
  };

  return api;
}
