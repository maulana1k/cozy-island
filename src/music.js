// The score: gentle pieces made up as they play, in the spirit of The Trail and Alba. A piece is a few
// short pentatonic phrases (a motif, then variations on it) over a soft pad, with silence between the
// phrases. After a piece the music rests for a few minutes and the ambience carries the world.
// Mood follows the time of day (bright mornings, warm dusk, sparse soft nights); rain softens and
// muffles it, heavy rain keeps it away; a film or a conversation lifts it a little.
// The instruments (mallet, pluck, pad) are the ones in src/audio.js, so cues and score share one sound.
// Nothing here may throw into the game: every timer body is guarded.

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const pick = (r, list) => list[(r() * list.length) | 0];

// Each mood: tempo, where the tune sits (scale step of its home note), how many notes are kept, loudness,
// brightness (low-pass in Hz), which instrument leads, the chords (scale steps under the tune) and how long a piece runs.
const MOODS = {
  morning: { bpm: 76, home: 5, density: 0.9, gain: 0.9, bright: 5200, lead: ['mallet'], chords: [[0, 2, 3], [1, 3, 5], [-1, 0, 2], [0, 2, 3]], phrases: [6, 8], gap: [1, 3], pad: 0.8 },
  day: { bpm: 70, home: 4, density: 0.8, gain: 0.82, bright: 4200, lead: ['mallet', 'pluck'], chords: [[0, 2, 3], [-1, 0, 2], [1, 3, 5], [0, 2, 3]], phrases: [5, 8], gap: [2, 4], pad: 0.9 },
  dusk: { bpm: 62, home: 2, density: 0.75, gain: 0.85, bright: 3000, lead: ['pluck', 'pluck', 'mallet'], chords: [[-1, 0, 2], [-2, 0, 1], [0, 2, 3], [-1, 0, 2]], phrases: [5, 7], gap: [2, 4], pad: 1.1 },
  night: { bpm: 50, home: 3, density: 0.5, gain: 0.55, bright: 1800, lead: ['mallet', 'pluck'], chords: [[-1, 0, 2], [0, 2, 3], [-2, 0, 1]], phrases: [3, 5], gap: [3, 6], pad: 1.2 },
};

// t: time of day 0..1 (0.1 sunrise, about 0.8 sunset); night 0..1 from the day cycle.
export function moodAt(t, night = 0) {
  if (night >= 0.6) return 'night';
  if (t >= 0.07 && t < 0.33) return 'morning';
  if (t >= 0.33 && t < 0.66) return 'day';
  if (t >= 0.66 && t < 0.92) return 'dusk';
  return 'night';
}

// A short tune: [beat, scale step, length in beats]. Small steps, a held last note on a settled step.
export function makeMotif(r, home) {
  const len = 4 + ((r() * 3) | 0), notes = [];
  let d = home + pick(r, [0, 1, 2, 3]), beat = 0;
  for (let i = 0; i < len; i++) {
    const last = i === len - 1;
    if (last) d = home + pick(r, [0, 2, 3]);
    const dur = last ? pick(r, [2, 3, 3]) : pick(r, [1, 1, 1, 2, 2, 0.5, 1.5]);
    notes.push([beat, d, dur]);
    beat += dur;
    d = Math.min(home + 6, Math.max(home - 2, d + pick(r, [-2, -1, -1, 0, 1, 1, 2, 3, -3])));
  }
  return { notes, beats: beat };
}

// The motif again, changed a little: a note or two moved, sometimes the whole line a step higher or lower,
// sometimes a note left out.
export function vary(r, m, home) {
  const shift = r() < 0.35 ? pick(r, [-1, 1, 2]) : 0;
  const notes = m.notes.map(([b, d, l]) => [b, d + shift, l]);
  const n = 1 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) { const k = 1 + ((r() * (notes.length - 1)) | 0); if (k < notes.length - 1) notes[k][1] += pick(r, [-1, 1]); }
  if (notes.length > 4 && r() < 0.4) notes.splice(1 + ((r() * (notes.length - 2)) | 0), 1);
  for (const x of notes) x[1] = Math.min(home + 7, Math.max(home - 3, x[1]));
  return { notes, beats: m.beats };
}

export function createMusic({ ctx, out, mallet, pluck, pad, nf, roots, isMuted = () => false, random = Math.random }) {
  const r = random;
  // fade: the piece's own envelope; level: mood, rain, lifts and ducking, eased all the time.
  const fade = ctx.createGain(), level = ctx.createGain(), lp = ctx.createBiquadFilter();
  fade.gain.value = 0; level.gain.value = 0; lp.type = 'lowpass'; lp.frequency.value = 4000;
  fade.connect(lp).connect(level).connect(out);

  let mood = { name: 'day', rain: 0 }, phase = 'rest', piece = null, lastRoot = null;
  let restFrom = ctx.currentTime, restUntil = ctx.currentTime + 45 + r() * 35; // the title theme plays first
  let duckUntil = 0;
  const lifts = new Map();

  function startPiece(now) {
    const m = MOODS[mood.name];
    let root = pick(r, roots); if (root === lastRoot) root = roots[(roots.indexOf(root) + 1) % roots.length]; lastRoot = root;
    const count = m.phrases[0] + ((r() * (m.phrases[1] - m.phrases[0] + 1)) | 0);
    const a = makeMotif(r, m.home), b = makeMotif(r, m.home + pick(r, [-1, 1, 2]));
    // A A' B A'' (and on): the tune comes back, never exactly the same.
    const plan = [];
    for (let i = 0; i < count; i++) plan.push(i === 0 ? a : i % 4 === 2 ? (r() < 0.5 ? b : vary(r, b, m.home)) : vary(r, a, m.home));
    piece = { m, root, plan, i: 0, spb: 60 / (m.bpm * (0.95 + r() * 0.1)), nextAt: now + 0.3, lead: pick(r, m.lead) };
    phase = 'play';
    fade.gain.cancelScheduledValues(now); fade.gain.setValueAtTime(fade.gain.value, now); fade.gain.linearRampToValueAtTime(1, now + 5);
  }

  function playPhrase() {
    const p = piece, m = p.m, mo = p.plan[p.i], t0 = p.nextAt, spb = p.spb, root = p.root;
    const chord = m.chords[p.i % m.chords.length];
    const lead = m.lead.length > 1 && p.i % 4 === 3 ? m.lead.find((x) => x !== p.lead) : p.lead;
    const gapBeats = m.gap[0] + r() * (m.gap[1] - m.gap[0]);
    const span = (mo.beats + gapBeats) * spb;
    // The pad: the chord swelling under the phrase and dying away into the gap.
    pad(chord.map((d) => nf(root, d)), t0, Math.max(3, span * 0.95), 0.012 * m.pad, fade);
    // A low plucked root now and then.
    if (r() < 0.6) pluck(nf(root, chord[0] - 5), t0 + (r() < 0.5 ? 0 : spb * 2), 0.04, fade);
    mo.notes.forEach(([b, d, len], k) => {
      const ends = k === 0 || k === mo.notes.length - 1;
      if (!ends && r() > m.density) return; // space: some notes are left out
      const at = t0 + b * spb + (r() - 0.5) * 0.03, g = 0.8 + r() * 0.3, f = nf(root, d);
      if (lead === 'pluck') pluck(f, at, 0.055 * g, fade); else mallet(f, at, 0.045 * g, fade);
      if (len >= 2 && r() < 0.3) mallet(nf(root, d + 5), at + spb * 0.5, 0.012 * g, fade); // a faint octave shimmer on a held note
    });
    p.i++;
    p.nextAt = t0 + span;
  }

  function endPiece(now, soft = true) {
    if (!piece) return;
    const endAt = soft ? Math.max(now, piece.nextAt) : now;
    fade.gain.cancelScheduledValues(now);
    if (soft) { fade.gain.setValueAtTime(1, now); fade.gain.setTargetAtTime(0, endAt, 1.5); } // the last notes have died away by then
    else fade.gain.setTargetAtTime(0, now, 1.8);
    piece = null; phase = 'rest'; restFrom = endAt;
    restUntil = endAt + 100 + r() * 140; // a few minutes of just the world
  }

  function tick() {
    try {
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime, m = MOODS[mood.name], rain = clamp01(mood.rain);
      let lift = 1; for (const k of lifts.values()) lift = Math.max(lift, k);
      const duck = now < duckUntil ? 0.25 : 1;
      level.gain.setTargetAtTime(m.gain * (1 - 0.55 * rain) * lift * duck, now, 1.2);
      lp.frequency.setTargetAtTime(m.bright * (1 - 0.6 * rain), now, 1.5);
      if (phase === 'rest') {
        if (now < restUntil || now < duckUntil || isMuted()) return;
        if (rain > 0.7 && lift < 1.2) { restUntil = now + 40; return; } // a downpour: the rain is the music
        startPiece(now);
      }
      if (phase === 'play' && piece && now >= piece.nextAt - 1.5) {
        if (piece.i < piece.plan.length) playPhrase(); else endPiece(now);
      }
    } catch { /* music is optional */ }
  }
  const timer = setInterval(tick, 250);

  return {
    get playing() { return phase === 'play'; },
    // Every frame or so: the time of day (0..1), night 0..1 and rain 0..1.
    setMood(t, night = 0, rain = 0) { mood.name = moodAt(t, night); mood.rain = rain; },
    // A film ('cine') or a conversation ('talk') raises the music slightly while it lasts. A film during a long
    // rest also brings the next piece in early.
    lift(id, on) {
      if (!on) { lifts.delete(id); return; }
      lifts.set(id, id === 'cine' ? 1.3 : 1.12);
      try { const now = ctx.currentTime; if (id === 'cine' && phase === 'rest' && now - restFrom > 20 && !isMuted()) restUntil = Math.min(restUntil, now + 1.5); } catch { /* fine */ }
    },
    // A short music cue is playing for `sec` seconds: the score steps back under it.
    duck(sec) { try { duckUntil = Math.max(duckUntil, ctx.currentTime + sec); } catch { /* fine */ } },
    stop() { clearInterval(timer); try { endPiece(ctx.currentTime, false); } catch { /* fine */ } },
  };
}
