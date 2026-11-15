import {
  ISLAND_RADIUS, GRASS_RADIUS, SEA_FLOOR_RADIUS, GRASS_HEIGHT, HILL,
  MAX_WADE_DEPTH, MIN_WADE_SPEED, SEED, POND, KNOLL, CAMP_FLAT, SHOULDER, HILL_TRAIL, WILD,
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

// The land is two overlapping rounds: the camp's island and the wild jungle behind the hill.
// `wildEq` measures the wild round on the island's own scale, so "distance from the middle"
// works for both: the smaller of the two is how far inland a spot is.
const wildEq = (x, z) => ISLAND_RADIUS + Math.hypot(x - WILD.x, z - WILD.z) - WILD.radius;
export const landR = (x, z) => Math.min(Math.hypot(x, z), wildEq(x, z));
// How many metres past the rope into the wild jungle a spot is; negative on the camp side.
export function wildDepth(x, z) {
  const r0 = Math.hypot(x, z);
  return wildEq(x, z) < r0 ? r0 - WILD.border : -1;
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

// The lie of the land before anything is dug into it.
function rawHeight(x, z) {
  const r0 = Math.hypot(x, z), eq = wildEq(x, z), r = Math.min(r0, eq);
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
  // The wild jungle: the ground climbs away from the rope into rough country, up to a far mountain.
  if (eq < r0) {
    const w = smooth((GRASS_RADIUS - 2 - eq) / 22);
    if (w > 0) {
      const dW = Math.hypot(x - WILD.x, z - WILD.z), dP = Math.hypot(x - WILD.x + 34, z - WILD.z - 14);
      h += w * (2.6 + 2.2 * noise(x / 17 + 31, z / 17 + 13) + 1.0 * noise(x / 6 + 5, z / 6 + 77));
      h += 30 * smooth(1 - dW / 50) * (1 + 0.22 * noise(x / 13, z / 13 + 50)) + 15 * smooth(1 - dP / 30);
    }
  }
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
  return landR(x, z) < GRASS_RADIUS ? 'grass' : 'sand';
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

// The nearest point on the hill trail: how far away it is, where it is, which stretch it is on
// and how far along that stretch.
export function nearestOnTrail(x, z) {
  let best = { d: Infinity, x: 0, z: 0, i: 0, s: 0 };
  for (let i = 0; i < HILL_TRAIL.length - 1; i++) {
    const a = HILL_TRAIL[i], b = HILL_TRAIL[i + 1], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz, i, s: t * Math.sqrt(len2) };
  }
  return best;
}

const TRAIL_BED = 1.6, TRAIL_BANK = 2.0; // half-width of the level bed, and how far the cut banks reach beyond it

// Ground height. Along the hill trail a level bed is cut into the slope, so the trail is flat
// from side to side, with a bank above it and a fill below.
export function heightAt(x, z) {
  const h = rawHeight(x, z);
  if (Math.abs(x + 13) > 20 || Math.abs(z + 12) > 15) return h; // nowhere near the trail
  const n = nearestOnTrail(x, z);
  if (n.d >= TRAIL_BED + TRAIL_BANK) return h;
  const bed = rawHeight(n.x, n.z);
  return bed + (h - bed) * smooth((n.d - TRAIL_BED) / TRAIL_BANK);
}
