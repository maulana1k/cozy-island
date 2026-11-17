// Player options that live outside the game save. Stored in localStorage; every access is guarded
// because storage can be blocked (private window, embedded iframe with site data off).
const KEY = 'scout-camp-island.invertZoom';
const VOL_KEY = 'scout-camp-island.volume';
let invert = false;
try { invert = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked: off for this session */ }

// Volumes 0..100 for the three sound groups (the Sound row is the master on/off).
export const VOLUME_DEFAULTS = { music: 80, ambience: 100, sfx: 90 };
const volume = { ...VOLUME_DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(VOL_KEY) || 'null');
  if (saved) for (const k in volume) if (Number.isFinite(saved[k])) volume[k] = Math.min(100, Math.max(0, Math.round(saved[k])));
} catch { /* storage blocked or bad JSON: defaults */ }
const listeners = [];

export const settings = {
  get invertZoom() { return invert; },
  set invertZoom(v) { invert = !!v; try { localStorage.setItem(KEY, invert ? '1' : '0'); } catch { /* storage blocked */ } },
  // +1 normally, -1 when inverted: multiply the wheel delta by this.
  get zoomSign() { return invert ? -1 : 1; },
  // kind: 'music' | 'ambience' | 'sfx'. Returns 0..100.
  volume(kind) { return volume[kind] ?? 100; },
  setVolume(kind, v) {
    if (!(kind in volume)) return;
    volume[kind] = Math.min(100, Math.max(0, Math.round(v)));
    try { localStorage.setItem(VOL_KEY, JSON.stringify(volume)); } catch { /* storage blocked */ }
    for (const fn of listeners) try { fn(kind, volume[kind]); } catch { /* a listener must not break the setting */ }
  },
  // fn(kind, value) after any volume change (the audio applies it live).
  onVolume(fn) { listeners.push(fn); },
};
