// INTERNAL. Saving to the browser (design 5.4 and 10b.1, 10b.3). One versioned slot in localStorage; every access is
// wrapped, and when storage is unavailable (a private window, blocked site data) the game keeps a session-only copy
// so Continue still works until the tab closes. No personal data is stored: the chosen name stays on this device.

export const SAVE_VERSION = 1;
const KEY = 'scout-camp-island.save';
let session = null;     // fallback copy when storage is unavailable
let usable = null;

function storage() {
  if (usable === false) return null;
  try {
    const s = window.localStorage;
    const probe = '__probe__'; s.setItem(probe, '1'); s.removeItem(probe);
    usable = true; return s;
  } catch { usable = false; return null; }
}

export function writeSave(data) {
  const doc = { version: SAVE_VERSION, at: Date.now(), ...data };
  let text;
  try { text = JSON.stringify(doc); } catch { return false; }
  session = text;
  const s = storage();
  if (!s) return false;
  try { s.setItem(KEY, text); return true; } catch { return false; }
}

export function readSave() {
  let text = null;
  const s = storage();
  if (s) { try { text = s.getItem(KEY); } catch { text = null; } }
  if (!text) text = session;
  if (!text) return null;
  try {
    const doc = JSON.parse(text);
    if (!doc || typeof doc !== 'object' || typeof doc.version !== 'number' || doc.version > SAVE_VERSION) return null;
    return doc;
  } catch { return null; }
}

export const hasSave = () => !!readSave();

export function clearSave() {
  session = null;
  const s = storage();
  if (s) { try { s.removeItem(KEY); } catch { /* nothing to clear */ } }
}

// True when saves only last for this tab.
export const sessionOnly = () => { storage(); return usable === false; };

// ---- Extra slots beside the save (the camera's photo album, src/story/album.js). Kept apart so the main save stays
// small. A slot larger than `maxChars` is kept for this tab only, never written to storage.
const extra = new Map();
export function writeExtra(name, text, maxChars = 400000) {
  extra.set(name, text);
  const s = storage();
  if (!s) return false;
  try {
    if (text.length > maxChars) { s.removeItem(`${KEY}.${name}`); return false; }
    s.setItem(`${KEY}.${name}`, text); return true;
  } catch { return false; } // full or blocked: the tab keeps its copy
}
export function readExtra(name) {
  const s = storage();
  if (s) { try { const t = s.getItem(`${KEY}.${name}`); if (t) return t; } catch { /* fall back to this tab's copy */ } }
  return extra.get(name) || null;
}
