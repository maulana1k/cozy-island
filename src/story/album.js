// INTERNAL. The digital camera's photo album (src/photo.js): the best photo of each field-guide animal (a small JPEG
// thumbnail, its grade 1..3 stars, the time of day and the day it was taken) and the prints pinned on the camp notice
// board (newest first, at most four). Kept in its own storage slot beside the save (src/story/save.js writeExtra):
// thumbnails are small (256 px wide, about 10 to 25 kB each); one that is too big, or a blocked storage, stays for
// this tab only. A New game clears it. Photos never leave the device.
import { writeExtra, readExtra } from './save.js';

const SLOT = 'album', MAX_PRINTS = 4, MAX_THUMB = 60000;
let data = { v: 1, best: {}, prints: [] };
const listeners = [];
const changed = () => { for (const fn of listeners) fn(); };
function persist() {
  try { writeExtra(SLOT, JSON.stringify(data), 900000); } catch { /* the tab keeps it */ }
}
const okThumb = (t) => typeof t === 'string' && t.startsWith('data:image/') && t.length <= MAX_THUMB;

export const album = {
  load() {
    try {
      const o = JSON.parse(readExtra(SLOT) || 'null');
      data = { v: 1, best: {}, prints: [] };
      if (o && typeof o === 'object') {
        for (const [id, e] of Object.entries(o.best || {})) if (e && Number.isFinite(e.grade)) data.best[id] = { grade: Math.max(1, Math.min(3, Math.round(e.grade))), thumb: okThumb(e.thumb) ? e.thumb : null, when: String(e.when || ''), day: Number(e.day) || 1 };
        if (Array.isArray(o.prints)) data.prints = o.prints.filter((p) => p && okThumb(p.thumb)).slice(0, MAX_PRINTS).map((p) => ({ title: String(p.title || ''), thumb: p.thumb }));
      }
    } catch { data = { v: 1, best: {}, prints: [] }; }
    changed();
  },
  reset() { data = { v: 1, best: {}, prints: [] }; persist(); changed(); },
  get(id) { return data.best[id] || null; },
  // A photo of a field-guide animal. Returns { first, better } (better: it beat the old grade and replaced it).
  record(id, { grade, thumb, when, day }) {
    const old = data.best[id];
    const first = !old, better = !!old && grade > old.grade;
    if (first || better || (old && !old.thumb && okThumb(thumb))) { data.best[id] = { grade, thumb: okThumb(thumb) ? thumb : null, when, day }; persist(); changed(); }
    return { first, better };
  },
  // Pins a print on the camp notice board (newest on top).
  pin(title, thumb) {
    if (!okThumb(thumb)) return;
    data.prints.unshift({ title, thumb });
    data.prints.length = Math.min(data.prints.length, MAX_PRINTS);
    persist(); changed();
  },
  prints() { return data.prints; },
  onChange(fn) { listeners.push(fn); },
};
