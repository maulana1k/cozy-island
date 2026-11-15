import {
  ISLAND_RADIUS, GRASS_RADIUS, SEA_FLOOR_RADIUS, GRASS_HEIGHT, HILL,
  MAX_WADE_DEPTH, MIN_WADE_SPEED, SEED, POND, KNOLL, CAMP_FLAT, SHOULDER,
} from '../config.js';

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

// Deterministic lattice hash in [0, 1).
function hash(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + SEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in [-1, 1].
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
}

const NOISE_AMPLITUDE = 0.3;
const NOISE_FADE_START = 40;
const SEA_FLOOR_DEPTH = -3;

// 1 on the hill's level summit, 0 away from it.
function summitLevel(x, z) {
  return smooth(1 - (Math.hypot(x - HILL.x, z - HILL.z) - HILL.plateau) / 3);
}

// The hill: a level top, flanks cut by ridges and gullies with natural benches part-way up,
// a lower shoulder to one side, and a steep drop on the side facing the sea.
function hillHeight(x, z, r) {
  let total = 0;
  const d = Math.hypot(x - HILL.x, z - HILL.z);
  if (d < HILL.radius) {
    const p = d <= HILL.plateau ? 1 : smooth(1 - (d - HILL.plateau) / (HILL.radius - HILL.plateau));
    const flank = p * (1 - p) * 4; // 0 at the top and the foot, 1 half-way up
    let hh = HILL.height * Math.pow(p, 1.2) * (1 + 0.24 * flank * noise(x / 6 + 11, z / 6 + 5) + 0.08 * flank * noise(x / 2.3, z / 2.3 + 9));
    const bench = 2.8;
    hh -= (bench / (2 * Math.PI)) * Math.sin((2 * Math.PI * hh) / bench) * 0.75 * flank;
    total += hh;
  }
  const sd = Math.hypot(x - SHOULDER.x, z - SHOULDER.z);
  if (sd < SHOULDER.radius) total += SHOULDER.height * smooth(1 - sd / SHOULDER.radius) * (1 + 0.2 * noise(x / 5 + 3, z / 5));
  return total * smooth((57 - r) / 8);
}

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h;
  if (r <= GRASS_RADIUS) h = GRASS_HEIGHT;
  else if (r <= ISLAND_RADIUS) {
    // Flat where it meets the grass, but still sloping where it meets the sea, so the waterline is crisp.
    const t = (r - GRASS_RADIUS) / (ISLAND_RADIUS - GRASS_RADIUS);
    h = GRASS_HEIGHT * (1 - t * t);
  } else {
    const s = Math.min(1, (r - ISLAND_RADIUS) / (SEA_FLOOR_RADIUS - ISLAND_RADIUS));
    h = SEA_FLOOR_DEPTH * (0.5 * s + 0.5 * s * s);
  }

  const hill = hillHeight(x, z, r);

  const fade = (1 - smooth((r - NOISE_FADE_START) / (GRASS_RADIUS - NOISE_FADE_START))) * (1 - 0.85 * summitLevel(x, z));
  if (fade > 0) {
    h += NOISE_AMPLITUDE * fade * (0.7 * noise(x / 9, z / 9) + 0.3 * noise(x / 3.5 + 40, z / 3.5 + 40));
    // Slow rolling ground away from the camp.
    const away = smooth((Math.hypot(x - CAMP_FLAT.x, z - CAMP_FLAT.z) - CAMP_FLAT.inner) / (CAMP_FLAT.outer - CAMP_FLAT.inner));
    h += 0.45 * fade * away * noise(x / 22 + 7, z / 22 + 3);
  }
  h += hill;
  const kd = Math.hypot(x - KNOLL.x, z - KNOLL.z);
  if (kd < KNOLL.r) h += KNOLL.height * smooth(1 - kd / KNOLL.r);
  // The pond: a shallow bowl with a gentle bank around it.
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.rw) h = -POND.depth * (1 - (pd / POND.rw) ** 2);
  else if (pd < POND.rw + POND.bank) h *= smooth((pd - POND.rw) / POND.bank);
  return h;
}

export function zoneAt(x, z) {
  if (heightAt(x, z) < 0) return 'water';
  return Math.hypot(x, z) < GRASS_RADIUS ? 'grass' : 'sand';
}

// 1 on dry land, falling to MIN_WADE_SPEED at knee depth.
export function wadeSpeedFactor(h) {
  if (h >= 0) return 1;
  const t = Math.min(1, -h / MAX_WADE_DEPTH);
  return 1 - (1 - MIN_WADE_SPEED) * t;
}

// Stops a move that would go past knee depth, sliding along the shore where possible.
// `groundAt` defaults to the bare terrain; the world passes one that also knows about the dock.
export function constrainToShore(prev, next, groundAt = heightAt) {
  const shallowEnough = (x, z) => groundAt(x, z) >= -MAX_WADE_DEPTH;
  if (shallowEnough(next.x, next.z)) return next;
  if (shallowEnough(next.x, prev.z)) return { x: next.x, z: prev.z };
  if (shallowEnough(prev.x, next.z)) return { x: prev.x, z: next.z };
  return { x: prev.x, z: prev.z };
}
