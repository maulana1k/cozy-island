// Player options that live outside the game save. Stored in localStorage; every access is guarded
// because storage can be blocked (private window, embedded iframe with site data off).
const KEY = 'scout-camp-island.invertZoom';
let invert = false;
try { invert = localStorage.getItem(KEY) === '1'; } catch { /* storage blocked: off for this session */ }

export const settings = {
  get invertZoom() { return invert; },
  set invertZoom(v) { invert = !!v; try { localStorage.setItem(KEY, invert ? '1' : '0'); } catch { /* storage blocked */ } },
  // +1 normally, -1 when inverted: multiply the wheel delta by this.
  get zoomSign() { return invert ? -1 : 1; },
};
