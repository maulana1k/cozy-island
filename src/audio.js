// All sound is synthesised with the Web Audio API. Nothing here may throw: the game must
// keep working when audio is unavailable or has not been allowed to start yet.

const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.0;

export function createAudio(makeContext = () => new AudioContext()) {
  let ctx = null, master = null, noise = null, cricketTimer = null;
  let tried = false, night = 0, fireLevel = 0, fireGain = null, seaGain = null;
  let rainLevel = 0, rainIndoor = false, rainGain = null, rainOut = 0;
  // Ambience and music (see ambience(), call() and cue() below, and src/ambience.js).
  let ambBus = null, ambLp = null, musicBus = null, windGain = null, windLfoGain = null, voices = 0;
  const mix = { camp: 0, jungle: 0, water: 0, fall: 0, beach: 0, village: 0, hill: 0, night: 0, dawn: 0, rain: 0, wind: 0, murmur: 0, kids: 0 };
  const lis = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
  const beds = {};
  let cueUntil = 0, cuePrio = 0, lastDiscover = -99, queued = null;
  const lastVariant = {};
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
        // Ambience runs through its own bus (muffled indoors, dipped under music); music has a soft echo.
        ambBus = ctx.createGain(); ambLp = ctx.createBiquadFilter(); ambLp.type = 'lowpass'; ambLp.frequency.value = 18000;
        ambBus.connect(ambLp).connect(master);
        musicBus = ctx.createGain(); musicBus.gain.value = 0.8; musicBus.connect(master);
        const echo = ctx.createDelay(1); echo.delayTime.value = 0.34;
        const fb = ctx.createGain(); fb.gain.value = 0.3; const wet = ctx.createGain(); wet.gain.value = 0.22;
        const echoLp = ctx.createBiquadFilter(); echoLp.type = 'lowpass'; echoLp.frequency.value = 2400;
        musicBus.connect(echo); echo.connect(echoLp).connect(fb).connect(echo); echoLp.connect(wet).connect(master);
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        startAmbience();
        api.started = true;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        setTimeout(() => api.cue('title'), 700); // a soft theme as the game opens
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
    // The area beds, once a frame or on a change of place. `area` is an area id ('camp', 'jungle',
    // 'water', 'beach', 'village', 'hill') or a { id: weight 0..1 } blend (src/ambience.js makes one);
    // opts: night, dawn, rain, wind 0..1, inside (muffled), murmur and kids 0..1 (camp chatter).
    // Beds crossfade over a few seconds and stop altogether while they cannot be heard.
    ambience(area, opts = {}) {
      if (!ctx || !ambBus) return;
      const w = typeof area === 'string' ? { [area]: 1 } : area || {};
      for (const k of ['camp', 'jungle', 'water', 'fall', 'beach', 'village', 'hill']) mix[k] = Math.min(1, Math.max(0, w[k] || 0));
      for (const k of ['night', 'dawn', 'rain', 'wind', 'murmur', 'kids']) mix[k] = Math.min(1, Math.max(0, opts[k] || 0));
      try {
        const now = ctx.currentTime, day = 1 - mix.night, dry = 1 - Math.min(1, mix.rain * 1.3);
        ambLp.frequency.setTargetAtTime(opts.inside ? 900 : 18000, now, 0.25);
        setBed('murmur', mix.camp * mix.murmur * (1 - 0.6 * mix.rain) * 0.05);
        setBed('insects', (mix.jungle * 0.9 + mix.camp * 0.15 + mix.village * 0.2) * day * dry * 0.014);
        setBed('water', Math.min(1, mix.water + mix.fall) * (0.05 + 0.05 * mix.fall));
        setBed('night', mix.night * dry * Math.min(1, 0.3 + mix.jungle + mix.camp * 0.6 + mix.water * 0.5 + mix.village * 0.5) * (1 - 0.6 * mix.beach) * 0.012);
        // The weather's wind and high ground share the one wind bed (no second wind).
        const wl = 0.014 + 0.04 * mix.wind + 0.05 * mix.hill * (0.45 + 0.55 * mix.wind);
        windGain.gain.setTargetAtTime(wl, now, 1.5); windLfoGain.gain.setTargetAtTime(wl * 0.6, now, 1.5);
      } catch { /* audio is optional */ }
    },
    // Where the ears are (the player) and which way the camera looks (fx, fz on the ground).
    listen(x, y, z, fx, fz) {
      const l = Math.hypot(fx, fz) || 1;
      lis.x = x; lis.y = y; lis.z = z; lis.fx = fx / l; lis.fz = fz / l;
    },
    // A call from a real thing in the world at x, y, z: 'bird' (variant = species 0..4), 'gull', 'cluck', 'flutter'.
    call(kind, x, y, z, variant = 0) {
      if (!api.started || !ctx || api.muted || voices > 18) return;
      try {
        const s = spot(x, y, z);
        if (!s) return;
        const life = CALLS[kind] ? CALLS[kind](s.out, variant) : 0;
        if (life) hold(life, s.nodes);
      } catch { /* audio is optional */ }
    },
    // A short piece of music for a moment: 'quest', 'discover', 'badge', 'dawn', 'evening', 'title'.
    cue(name) {
      if (!api.started || !ctx || !musicBus || api.muted) return;
      try { playCue(name); } catch { /* audio is optional */ }
    },
    play(name) {
      if (!api.started || !ctx) return;
      if (CUE_FOR[name]) { api.cue(CUE_FOR[name]); return; }
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
    windGain = ctx.createGain(); windGain.gain.value = 0.02; // ambience() raises it with the weather's wind and on high ground
    const windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.07;
    windLfoGain = ctx.createGain(); windLfoGain.gain.value = 0.012;
    windLfo.connect(windLfoGain).connect(windGain.gain);
    wind.connect(bp).connect(windGain).connect(ambBus);
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
      const where = 0.35 + 0.65 * Math.min(1, mix.camp + mix.jungle + mix.village + mix.water) - 0.5 * mix.beach;
      if (!ctx || api.muted || night < 0.5 || Math.random() > 0.3 * where * (1 - Math.min(1, mix.rain * 1.6))) return;
      try {
        const f = 3900 + Math.random() * 700, pan = Math.random() * 1.6 - 0.8, out = far(pan, 1, 9000, 0.4);
        for (let i = 0; i < 3; i++) tone(f, { type: 'sine', dur: 0.05, gain: 0.012, delay: i * 0.075, attack: 0.005, out });
      } catch { /* audio is optional */ }
    }, 320);
    // Everything else in the soundscape: calls and murmurs chosen by where you are (see ambienceTick).
    setInterval(ambienceTick, 200);
  }

  // A short note with a soft attack and a fading tail.
  function tone(freq, { type = 'triangle', dur = 0.4, gain = 0.12, delay = 0, attack = 0.008, to = null, out = master } = {}) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // A burst of filtered noise.
  function hiss({ type = 'bandpass', freq = 2000, q = 0.8, dur = 0.2, gain = 0.05, delay = 0, out = master } = {}) {
    const t = ctx.currentTime + delay;
    const src = noiseSource();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
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

  // ---- Ambience: area beds ---------------------------------------------------------------------
  // A bed is built the first time it is wanted, faded with its gain, and stopped after it has been
  // silent for a while, so only the beds you can hear cost anything.
  function setBed(id, level) {
    let b = beds[id];
    const now = ctx.currentTime;
    if (level > 0.0005) {
      if (!b) b = beds[id] = BEDS[id]();
      b.quiet = 0;
      b.out.gain.setTargetAtTime(level, now, 1.6);
    } else if (b) {
      b.out.gain.setTargetAtTime(0, now, 1.2);
      if (!b.quiet) b.quiet = now;
      else if (now - b.quiet > 8) { b.stop(); delete beds[id]; }
    }
  }
  function filter(type, freq, q = 0.7) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
  function amp(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  // A wobble on a parameter: an oscillator at `freq` Hz adding +-depth.
  function wobble(param, freq, depth, srcs) { const o = ctx.createOscillator(); o.frequency.value = freq; const g = amp(depth); o.connect(g).connect(param); o.start(); srcs.push(o); }
  function makeBed(build) {
    const out = amp(0), srcs = [];
    out.connect(ambBus);
    build(out, srcs, (chainIn) => { const n = noiseSource(true); n.connect(chainIn); n.start(0, Math.random() * 1.8); srcs.push(n); });
    return { out, stop() { for (const s of srcs) try { s.stop(); } catch { /* already stopped */ } try { out.disconnect(); } catch { /* fine */ } } };
  }
  const BEDS = {
    // Camp chatter: two bands of noise that come and go like voices across the field.
    murmur: () => makeBed((out, srcs, noiseTo) => {
      const low = amp(0.5), lowBp = filter('bandpass', 430, 1.1); lowBp.connect(low).connect(out); noiseTo(lowBp);
      wobble(low.gain, 2.6 + Math.random() * 0.5, 0.22, srcs); wobble(low.gain, 4.1 + Math.random() * 0.6, 0.15, srcs); wobble(low.gain, 0.31, 0.15, srcs);
      const hi = amp(0.25), hiBp = filter('bandpass', 1500, 2.2); hiBp.connect(hi).connect(out); noiseTo(hiBp);
      wobble(hi.gain, 5.7, 0.22, srcs);
    }),
    // Cicadas and katydids by day: a high buzz pulsing fast, swelling slowly.
    insects: () => makeBed((out, srcs, noiseTo) => {
      const swell = amp(0.6); swell.connect(out); wobble(swell.gain, 0.08, 0.4, srcs);
      const a = amp(1), aBp = filter('bandpass', 6300, 5); aBp.connect(a).connect(swell); noiseTo(aBp); wobble(a.gain, 31, 0.9, srcs);
      const b = amp(0.8), bBp = filter('bandpass', 4700, 7); bBp.connect(b).connect(swell); noiseTo(bBp); wobble(b.gain, 23, 0.7, srcs);
    }),
    // Running water: a low rush, a mid wash and a bubbling band that wanders.
    water: () => makeBed((out, srcs, noiseTo) => {
      const low = filter('lowpass', 320), lowG = amp(1.1); low.connect(lowG).connect(out); noiseTo(low);
      const mid = filter('bandpass', 900, 0.6), midG = amp(0.5); mid.connect(midG).connect(out); noiseTo(mid);
      const bub = filter('bandpass', 2100, 1.6), bubG = amp(0.35); bub.connect(bubG).connect(out); noiseTo(bub);
      wobble(bub.frequency, 0.7, 500, srcs); wobble(bubG.gain, 0.23, 0.15, srcs);
    }),
    // The night chorus: two cricket bands trilling at slightly different rates.
    night: () => makeBed((out, srcs, noiseTo) => {
      const a = amp(2.2), aBp = filter('bandpass', 4500, 14); aBp.connect(a).connect(out); noiseTo(aBp); wobble(a.gain, 36, 2, srcs);
      const b = amp(1.8), bBp = filter('bandpass', 3800, 14); bBp.connect(b).connect(out); noiseTo(bBp); wobble(b.gain, 44, 1.6, srcs);
    }),
  };

  // ---- Ambience: single calls ------------------------------------------------------------------
  // A short-lived path into the ambience: gain, a low-pass for distance, a stereo position.
  function chain(pan, gain, cut) {
    const g = amp(gain), lp = filter('lowpass', cut);
    let p = null;
    if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); }
    g.connect(lp); if (p) lp.connect(p).connect(ambBus); else lp.connect(ambBus);
    return { out: g, nodes: [g, lp, p] };
  }
  // Keeps count of the calls sounding, and lets go of their path when they are done.
  function hold(life, nodes) {
    voices++;
    setTimeout(() => { voices--; for (const n of nodes) if (n) try { n.disconnect(); } catch { /* fine */ } }, life * 1000 + 300);
  }
  // Somewhere off in the distance, in no particular place.
  function far(pan, gain, cut, life) { const c = chain(pan, gain, cut); hold(life, c.nodes); return c.out; }
  // A real place in the world, heard from the player, panned by where the camera looks.
  function spot(x, y, z) {
    const dx = x - lis.x, dz = z - lis.z, d = Math.hypot(dx, dz, (y - lis.y) * 0.6);
    if (d > 70) return null;
    const side = d > 0.5 ? (dx * -lis.fz + dz * lis.fx) / d : 0, front = d > 0.5 ? (dx * lis.fx + dz * lis.fz) / d : 1;
    const gain = 1 / (1 + Math.pow(d / 7, 1.4)), cut = Math.min(16000, 14000 / (1 + d / 18)) * (front < -0.2 ? 0.55 : 1);
    return chain(side * 0.85, gain, cut);
  }
  // Birdsong by species (0..4), so each flock always sings the same song. Returns how long it lasts.
  function song(out, sp, g) {
    const r = Math.random;
    switch (sp % 5) {
      case 0: { // "tee-chu", two or three times
        const n = 2 + (r() * 2 | 0), hi = 4300 + r() * 500;
        for (let i = 0; i < n; i++) {
          tone(hi, { type: 'sine', dur: 0.1, gain: g, delay: i * 0.3, to: hi * 0.9, attack: 0.01, out });
          tone(hi * 0.72, { type: 'sine', dur: 0.09, gain: g * 0.8, delay: i * 0.3 + 0.13, to: hi * 0.68, attack: 0.01, out });
        }
        return n * 0.3 + 0.3;
      }
      case 1: { // a quick trill
        const n = 7 + (r() * 6 | 0), f = 3300 + r() * 600;
        for (let i = 0; i < n; i++) tone(f * (i % 2 ? 0.92 : 1) * (1 + i * 0.006), { type: 'sine', dur: 0.04, gain: g * 0.7, delay: i * 0.055, attack: 0.004, to: f * 1.08, out });
        return n * 0.055 + 0.2;
      }
      case 2: { // a wandering warble
        const n = 4 + (r() * 3 | 0); let t = 0;
        for (let i = 0; i < n; i++) { const f = 2300 + r() * 2300, d = 0.09 + r() * 0.12; tone(f, { type: 'sine', dur: d, gain: g * (0.6 + r() * 0.4), delay: t, to: f * (0.8 + r() * 0.5), attack: 0.01, out }); t += d + 0.04 + r() * 0.06; }
        return t + 0.2;
      }
      case 3: // a dove's soft coo
        tone(560, { type: 'sine', dur: 0.28, gain: g * 1.1, to: 520, attack: 0.04, out });
        tone(520, { type: 'sine', dur: 0.55, gain: g * 1.2, delay: 0.36, to: 470, attack: 0.06, out });
        tone(500, { type: 'sine', dur: 0.3, gain: g * 0.9, delay: 1.0, to: 460, attack: 0.04, out });
        return 1.5;
      default: { // sparrow chips
        const n = 2 + (r() * 3 | 0);
        for (let i = 0; i < n; i++) tone(5000 + r() * 600, { type: 'sine', dur: 0.035, gain: g * 0.8, delay: i * 0.13 + r() * 0.03, to: 3900, attack: 0.003, out });
        return n * 0.15 + 0.2;
      }
    }
  }
  const CALLS = {
    bird: (out, sp) => song(out, sp, 0.06),
    gull(out) {
      tone(1500, { type: 'sawtooth', dur: 0.38, gain: 0.01, to: 1000, attack: 0.03, out });
      tone(1500, { type: 'triangle', dur: 0.38, gain: 0.03, to: 1000, attack: 0.03, out });
      for (let i = 0; i < 2; i++) tone(1350, { type: 'triangle', dur: 0.1, gain: 0.022, delay: 0.5 + i * 0.18, to: 1150, out });
      return 1.2;
    },
    cluck(out) {
      for (let i = 0; i < 3; i++) tone(520 + Math.random() * 180, { type: 'triangle', dur: 0.07, gain: 0.05, delay: i * 0.12 + Math.random() * 0.03, to: 380, out });
      if (Math.random() < 0.3) tone(600, { type: 'triangle', dur: 0.25, gain: 0.04, delay: 0.45, to: 820, out });
      return 0.8;
    },
    // A flock taking off: a burst of wingbeats and a couple of alarm chips.
    flutter(out) {
      for (let i = 0; i < 10; i++) hiss({ freq: 1300 + Math.random() * 800, q: 0.9, dur: 0.03, gain: 0.05 * (1 - i / 12), delay: i * 0.045 + Math.random() * 0.01, out });
      for (let i = 0; i < 2; i++) tone(4800, { type: 'sine', dur: 0.04, gain: 0.035, delay: 0.05 + i * 0.16, to: 3800, attack: 0.003, out });
      return 0.9;
    },
  };
  function exotic(out) {
    if (Math.random() < 0.5) for (let i = 0; i < 3; i++) tone(750, { type: 'sine', dur: 0.25, gain: 0.05, delay: i * 0.42, to: 1250, attack: 0.03, out });
    else for (let i = 0; i < 3; i++) { const k = 1 + i * 0.08; tone(700 * k, { type: 'sine', dur: 0.18, gain: 0.045, delay: i * 0.6, attack: 0.02, out }); tone(1000 * k, { type: 'sine', dur: 0.3, gain: 0.05, delay: i * 0.6 + 0.2, to: 1100 * k, attack: 0.02, out }); }
  }
  function kid(out) {
    if (Math.random() < 0.5) for (let i = 0; i < 5; i++) tone(650 + Math.random() * 300, { type: 'triangle', dur: 0.08, gain: 0.03, delay: i * 0.09, to: 560, out });
    else { tone(520, { type: 'triangle', dur: 0.3, gain: 0.028, to: 760, attack: 0.03, out }); tone(760, { type: 'triangle', dur: 0.35, gain: 0.028, delay: 0.28, to: 600, out }); }
  }
  function frog(out) {
    if (Math.random() < 0.6) { const n = 3 + (Math.random() * 3 | 0), f = 150 + Math.random() * 70; for (let i = 0; i < n; i++) tone(f, { type: 'square', dur: 0.028, gain: 0.025, delay: i * 0.042, to: f * 0.8, attack: 0.003, out }); }
    else for (let i = 0; i < 2; i++) { const f = 2600 + Math.random() * 400; tone(f, { type: 'sine', dur: 0.08, gain: 0.03, delay: i * 0.3, to: f * 1.15, attack: 0.01, out }); }
  }
  function rooster(out) {
    const t = ctx.currentTime, o = ctx.createOscillator(), bp = filter('bandpass', 1100, 1.2), g = amp(0);
    o.type = 'sawtooth'; const f = o.frequency, k = 0.9 + Math.random() * 0.2;
    f.setValueAtTime(560 * k, t); f.linearRampToValueAtTime(640 * k, t + 0.14); f.setValueAtTime(700 * k, t + 0.28);
    f.linearRampToValueAtTime(780 * k, t + 0.5); f.setValueAtTime(860 * k, t + 0.6); f.linearRampToValueAtTime(560 * k, t + 1.35);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.03); g.gain.setValueAtTime(0.03, t + 0.12); g.gain.linearRampToValueAtTime(0.008, t + 0.15);
    g.gain.linearRampToValueAtTime(0.035, t + 0.3); g.gain.setValueAtTime(0.035, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(bp).connect(g).connect(out); o.start(t); o.stop(t + 1.5);
  }
  const CHIME = [1046.5, 1174.66, 1318.51, 1567.98, 1760];
  function chimes(out) {
    const n = 2 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) { const f = CHIME[Math.random() * CHIME.length | 0], d = Math.random() * 1.4; tone(f, { type: 'sine', dur: 2.5, gain: 0.014, delay: d, attack: 0.002, out }); tone(f * 2.76, { type: 'sine', dur: 0.9, gain: 0.004, delay: d, attack: 0.002, out }); }
  }
  function owl(out) {
    tone(400, { type: 'sine', dur: 0.45, gain: 0.05, to: 380, attack: 0.08, out });
    tone(390, { type: 'sine', dur: 0.2, gain: 0.035, delay: 0.95, to: 370, attack: 0.04, out });
    tone(400, { type: 'sine', dur: 0.65, gain: 0.045, delay: 1.25, to: 355, attack: 0.06, out });
  }
  function gust(out) {
    const t = ctx.currentTime, src = noiseSource(), bp = filter('bandpass', 450 + Math.random() * 300, 0.8), g = amp(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 1.5); g.gain.linearRampToValueAtTime(0, t + 4);
    src.connect(bp).connect(g).connect(out); src.start(t, Math.random() * 1.5); src.stop(t + 4.1);
  }
  // Five times a second: maybe a call somewhere, chosen by the area mix, time and weather.
  // Calls near the player come from real birds (call(), driven by src/ambience.js); these are the distance.
  function ambienceTick() {
    if (!ctx || api.muted || ctx.state !== 'running' || voices > 14) return;
    try {
      const m = mix, day = 1 - m.night, dry = 1 - Math.min(1, m.rain * 1.4), r = Math.random;
      const odds = (perSecond) => r() < perSecond * 0.2, pan = () => r() * 1.8 - 0.9;
      if (odds(((0.25 * m.camp + 1.0 * m.jungle + 0.35 * m.village + 0.3 * m.water + 0.12 * m.hill + 0.08 * m.beach) * day + 1.5 * m.dawn) * dry)) song(far(pan(), 0.3 + r() * 0.2, 3200 + r() * 2000, 3), [0, 1, 2, 4][r() * 4 | 0], 0.06);
      if (odds(0.12 * m.jungle * day * dry)) exotic(far(pan(), 0.35, 3000, 3));
      if (odds(m.kids * m.camp * day * 0.18)) kid(far(pan(), 0.4, 1600, 2));
      if (odds(Math.min(1, m.water + m.fall * 0.5) * (0.12 + 0.9 * m.night) * (0.6 + 0.6 * m.rain))) frog(far(pan(), 0.5 + r() * 0.4, 3500, 2));
      if (odds(m.village * (0.012 + 0.2 * m.dawn) * dry)) rooster(far(pan(), 0.35, 2200, 2));
      if (odds(m.village * day * 0.1 * dry)) CALLS.cluck(far(pan(), 0.35, 2500, 1));
      if (odds(m.village * (0.05 + 0.35 * m.wind))) chimes(far(pan() * 0.6, 0.8, 9000, 4));
      if (odds(m.night * (m.camp * 0.6 + m.jungle + m.village * 0.4 + m.water * 0.4) * 0.045 * dry)) owl(far(pan(), 0.6, 1400, 3));
      if (odds(m.hill * (0.05 + 0.15 * m.wind))) gust(far(pan() * 0.5, 1, 3000, 4.5));
    } catch { /* audio is optional */ }
  }

  // ---- Music cues ------------------------------------------------------------------------------
  // Short, soft and pentatonic: a marimba-like mallet, a plucked string and a warm pad. Each cue has a
  // few variants and a random key, so it is never quite the same twice.
  const PENTA = [0, 2, 4, 7, 9], ROOTS = [261.63, 293.66, 329.63, 349.23];
  const nf = (root, d) => root * Math.pow(2, (PENTA[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5)) / 12);
  function partial(f, t, g, dur, type = 'sine', attack = 0.004) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + attack); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e).connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function mallet(f, t, g) { partial(f, t, g, 1.5); partial(f * 4, t, g * 0.16, 0.22); partial(f * 10, t, g * 0.03, 0.05); }
  function pluck(f, t, g) {
    const lp = filter('lowpass', 3200), e = ctx.createGain();
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.8);
    e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    lp.connect(e).connect(musicBus);
    for (const [m, type, k] of [[1, 'triangle', 1], [2, 'sine', 0.3]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * m; const og = amp(k); o.connect(og).connect(lp); o.start(t); o.stop(t + 1.7); }
  }
  function pad(fs, t, dur, g) {
    const lp = filter('lowpass', 1000), e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + dur * 0.35); e.gain.setValueAtTime(g, t + dur * 0.6); e.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(e).connect(musicBus);
    for (const f of fs) for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }
  }
  // n: [time s, scale step, 'p' for pluck], pad: [time s, [scale steps], length s]. Step 0 is the root, 5 an octave up.
  const CUES = {
    discover: { prio: 2, dur: 3, v: [
      { n: [[0, 5], [0.16, 7], [0.32, 9], [0.62, 10]], pad: [[0, [-5, -3, -2], 2.6]] },
      { n: [[0, 7], [0.18, 9], [0.36, 8], [0.7, 12]], pad: [[0, [-5, -2, 0], 2.6]] },
      { n: [[0, 4], [0.14, 5], [0.28, 7], [0.42, 9], [0.8, 11]], pad: [[0, [-5, -3, -1], 2.6]] },
      { n: [[0, 9], [0.2, 7], [0.4, 10], [0.75, 12]], pad: [[0, [-4, -2, 0], 2.6]] },
    ] },
    quest: { prio: 3, dur: 5, v: [
      { n: [[0, 5], [0.25, 6], [0.5, 7], [0.75, 9], [1.0, 10], [1.5, 9], [1.75, 10], [2.2, 12]], pad: [[0, [-2, 0, 1], 1.6], [1.5, [-5, -3, -2], 3.2]] },
      { n: [[0, 3], [0.22, 5], [0.44, 7], [0.66, 8], [1.1, 7], [1.32, 9], [1.54, 10], [2.1, 10, 'p'], [2.1, 12]], pad: [[0, [-3, -1, 1], 1.5], [1.4, [-5, -3, -2], 3.4]] },
    ] },
    badge: { prio: 3, dur: 5, v: [
      { n: [[0, 5], [0.1, 7], [0.2, 8], [0.3, 10], [0.4, 12], [0.5, 13], [0.6, 15], [1.0, 14], [1.3, 15]], pad: [[0, [-5, -3, -2, 0], 4]] },
      { n: [[0, 10], [0.12, 9], [0.24, 7], [0.36, 8], [0.48, 10], [0.6, 12], [0.9, 13], [1.2, 15]], pad: [[0, [-5, -2, 0], 4]] },
    ] },
    dawn: { prio: 1, dur: 7, gain: 0.7, v: [
      { n: [[1.2, 12], [2.3, 10], [3.2, 13], [4.6, 12]], pad: [[0, [-5, -2, 0], 6.5]] },
      { n: [[1.0, 14], [2.0, 12], [3.4, 11], [4.4, 12]], pad: [[0, [-3, 0, 2], 6.5]] },
    ] },
    evening: { prio: 1, dur: 7, gain: 0.85, v: [
      { n: [[0, 0, 'p'], [0.35, 2, 'p'], [0.7, 3, 'p'], [1.05, 5, 'p'], [1.6, 4, 'p'], [1.95, 3, 'p'], [2.6, 2, 'p'], [3.3, 0, 'p']], pad: [[0, [-5, -3, -2], 5.5]] },
      { n: [[0, -2, 'p'], [0.4, 0, 'p'], [0.8, 2, 'p'], [1.2, 3, 'p'], [1.8, 2, 'p'], [2.2, 0, 'p'], [2.9, 1, 'p'], [3.6, 0, 'p']], pad: [[0, [-7, -5, -3], 5.5]] },
    ] },
    title: { prio: 1, dur: 8, gain: 0.8, v: [
      { n: [[0, 5], [0.4, 7], [0.8, 8], [1.2, 7], [1.6, 5], [2.4, 4], [2.8, 5], [3.2, 7], [4.0, 9], [4.4, 8], [5.2, 7]], pad: [[0, [-5, -3, -2], 3.2], [3.0, [-4, -2, 0], 3.2], [5.6, [-5, -3, -2], 2.4]] },
      { n: [[0, 7], [0.4, 8], [0.8, 10], [1.6, 9], [2.0, 7], [2.8, 8], [3.2, 7], [3.6, 5], [4.4, 7], [5.2, 5]], pad: [[0, [-5, -2, 0], 3.2], [3.0, [-3, 0, 2], 3.2], [5.6, [-5, -3, -2], 2.4]] },
    ] },
  };
  function playCue(name) {
    const c = CUES[name];
    if (!c) return;
    const now = ctx.currentTime;
    // Finds can come thick and fast: the full motif at most every 8 s, the old chime in between.
    if (name === 'discover' && now - lastDiscover < 8) { SOUNDS.discover(); return; }
    if (now < cueUntil && c.prio <= cuePrio) {
      if (c.prio >= 3 && !queued) { queued = name; setTimeout(() => { queued = null; api.cue(name); }, (cueUntil - now) * 1000 + 150); }
      else if (name === 'discover') SOUNDS.discover();
      return;
    }
    let i = Math.random() * c.v.length | 0;
    if (c.v.length > 1 && i === lastVariant[name]) i = (i + 1) % c.v.length;
    lastVariant[name] = i;
    const v = c.v[i], root = ROOTS[Math.random() * ROOTS.length | 0], t0 = now + 0.05, k = c.gain || 1;
    for (const [t, d, inst] of v.n) {
      const at = t0 + t + (Math.random() - 0.5) * 0.02, g = (0.85 + Math.random() * 0.3) * k;
      if (inst === 'p') pluck(nf(root, d), at, 0.07 * g); else mallet(nf(root, d), at, 0.055 * g);
    }
    for (const [t, ds, dur] of v.pad || []) pad(ds.map((d) => nf(root, d)), t0 + t, dur, 0.016 * k);
    if (name === 'discover') lastDiscover = now;
    cueUntil = now + c.dur; cuePrio = c.prio;
    // The ambience steps back a little while the music plays.
    ambBus.gain.cancelScheduledValues(now); ambBus.gain.setTargetAtTime(0.65, now, 0.3); ambBus.gain.setTargetAtTime(1, now + c.dur, 1.2);
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
    // ---- Things to use with E (src/world/play.js)
    // Wind chimes: a few hollow tubes, each a bright pure tone with a long tail.
    chime() { const n = [C5 * 2, D5 * 2, E5 * 2, G5 * 2, A5 * 2]; for (let i = 0; i < 4; i++) { const f = n[Math.random() * n.length | 0]; tone(f, { type: 'sine', dur: 2.2, gain: 0.035, delay: i * 0.13 + Math.random() * 0.08, attack: 0.003 }); tone(f * 2.76, { type: 'sine', dur: 0.8, gain: 0.008, delay: i * 0.13, attack: 0.003 }); } },
    chimeSoft() { const n = [C5 * 2, E5 * 2, G5 * 2]; tone(n[Math.random() * 3 | 0], { type: 'sine', dur: 1.8, gain: 0.014, attack: 0.003 }); },
    // The guard tower siren: two slow wails up and down.
    siren() { for (let k = 0; k < 2; k++) { tone(320, { type: 'sawtooth', dur: 0.9, gain: 0.02, to: 760, delay: k * 1.7, attack: 0.25 }); tone(760, { type: 'sawtooth', dur: 0.8, gain: 0.02, to: 330, delay: k * 1.7 + 0.9, attack: 0.02 }); tone(322, { type: 'triangle', dur: 0.9, gain: 0.04, to: 765, delay: k * 1.7, attack: 0.25 }); tone(765, { type: 'triangle', dur: 0.8, gain: 0.04, to: 332, delay: k * 1.7 + 0.9, attack: 0.02 }); } },
    // A wooden lid or a rope creaking.
    creak() { tone(150, { type: 'sawtooth', dur: 0.45, gain: 0.02, to: 230, attack: 0.05 }); tone(310, { type: 'sawtooth', dur: 0.3, gain: 0.012, to: 260, delay: 0.15, attack: 0.04 }); hiss({ freq: 900, q: 4, dur: 0.4, gain: 0.02 }); },
    thud() { tone(120, { type: 'sine', dur: 0.14, gain: 0.12, to: 70 }); hiss({ type: 'lowpass', freq: 600, dur: 0.06, gain: 0.04 }); },
    // Water filling a flask: bubbles climbing in pitch as it fills.
    glug() { for (let i = 0; i < 6; i++) tone(170 + i * 45, { type: 'sine', dur: 0.1, gain: 0.08, delay: i * 0.15, to: 260 + i * 50 }); hiss({ freq: 1600, q: 0.5, dur: 1.0, gain: 0.03 }); },
    // Fresh wood on a fire: pops and crackles.
    crackle() { for (let i = 0; i < 7; i++) hiss({ type: 'highpass', freq: 2500 + Math.random() * 2500, q: 0.7, dur: 0.03 + Math.random() * 0.04, gain: 0.05 + Math.random() * 0.04, delay: Math.random() * 0.9 }); hiss({ type: 'lowpass', freq: 500, dur: 0.6, gain: 0.06 }); },
    // A stone skipping off the water, and a stone sinking.
    plink() { tone(1100 + Math.random() * 300, { type: 'sine', dur: 0.08, gain: 0.05, to: 650 }); hiss({ freq: 2200, q: 0.8, dur: 0.08, gain: 0.035 }); },
    plop() { tone(420, { type: 'sine', dur: 0.16, gain: 0.08, to: 180 }); hiss({ freq: 1200, q: 0.6, dur: 0.18, gain: 0.04 }); },
    // Jumping into the water.
    bigSplash() { hiss({ type: 'lowpass', freq: 1400, dur: 0.7, gain: 0.12 }); hiss({ freq: 2600, q: 0.5, dur: 0.4, gain: 0.05, delay: 0.05 }); tone(160, { type: 'sine', dur: 0.3, gain: 0.08, to: 70 }); },
    whoosh() { hiss({ freq: 700, q: 0.7, dur: 0.5, gain: 0.03 }); },
    // Fishing: the cast, a bite on the bobber, the reel clicking in.
    cast() { hiss({ type: 'highpass', freq: 2600, dur: 0.35, gain: 0.025 }); tone(900, { type: 'sine', dur: 0.3, gain: 0.015, to: 1400 }); },
    bite() { tone(760, { type: 'sine', dur: 0.09, gain: 0.07, to: 420 }); tone(700, { type: 'sine', dur: 0.09, gain: 0.06, delay: 0.14, to: 380 }); hiss({ freq: 1500, q: 0.6, dur: 0.12, gain: 0.04 }); },
    reel() { for (let i = 0; i < 10; i++) hiss({ type: 'bandpass', freq: 3200, q: 6, dur: 0.02, gain: 0.05, delay: i * 0.07 }); },
    quack() { for (let i = 0; i < 2; i++) { tone(430, { type: 'sawtooth', dur: 0.13, gain: 0.03, to: 330, delay: i * 0.2 }); tone(860, { type: 'square', dur: 0.1, gain: 0.008, to: 600, delay: i * 0.2 }); } },
    // A shooting star: a faint high glissando.
    star() { tone(2400, { type: 'sine', dur: 0.9, gain: 0.012, to: 1300, attack: 0.05 }); },
  };

  // Old sound names that now play a music cue (the story and HUD call play('rank') and play('discover')).
  const CUE_FOR = { rank: 'badge', discover: 'discover', quest: 'quest', badge: 'badge', dawn: 'dawn', evening: 'evening', title: 'title' };

  return api;
}
