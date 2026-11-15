import {
  ISLAND_RADIUS, GRASS_RADIUS, SEA_FLOOR_RADIUS, GRASS_HEIGHT, HILL,
  MAX_WADE_DEPTH, MIN_WADE_SPEED, SEED,
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

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h;
  if (r <= GRASS_RADIUS) h = GRASS_HEIGHT;
  else if (r <= ISLAND_RADIUS) h = GRASS_HEIGHT * (1 - smooth((r - GRASS_RADIUS) / (ISLAND_RADIUS - GRASS_RADIUS)));
  else h = SEA_FLOOR_DEPTH * smooth((r - ISLAND_RADIUS) / (SEA_FLOOR_RADIUS - ISLAND_RADIUS));

  const hillDist = Math.hypot(x - HILL.x, z - HILL.z);
  if (hillDist < HILL.radius) h += HILL.height * smooth(1 - hillDist / HILL.radius);

  const fade = 1 - smooth((r - NOISE_FADE_START) / (GRASS_RADIUS - NOISE_FADE_START));
  if (fade > 0) h += NOISE_AMPLITUDE * fade * (0.7 * noise(x / 9, z / 9) + 0.3 * noise(x / 3.5 + 40, z / 3.5 + 40));
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

const shallowEnough = (x, z) => heightAt(x, z) >= -MAX_WADE_DEPTH;

// Stops a move that would go past knee depth, sliding along the shore where possible.
export function constrainToShore(prev, next) {
  if (shallowEnough(next.x, next.z)) return next;
  if (shallowEnough(next.x, prev.z)) return { x: next.x, z: prev.z };
  if (shallowEnough(prev.x, next.z)) return { x: prev.x, z: next.z };
  return { x: prev.x, z: prev.z };
}
