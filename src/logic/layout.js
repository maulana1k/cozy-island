// Fixed positions of everything on the island. The same every run.
import { createRng } from './rng.js';
import { heightAt, zoneAt } from './terrain.js';
import { SEED, PALETTE, HILL, PLAYER_START } from '../config.js';

const DEG = Math.PI / 180;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export const VILLAGE_CENTER = { x: 10, z: 8 };
export const BELL = { x: VILLAGE_CENTER.x, z: VILLAGE_CENTER.z };

export const COTTAGE_SIZE = { width: 5, depth: 4 };

// Cottages sit in an arc that is open to the south, where the player starts.
const COTTAGE_RING = [
  { angle: 150, radius: 12 },
  { angle: 205, radius: 11.5 },
  { angle: 252, radius: 13 },
  { angle: 300, radius: 12 },
  { angle: 345, radius: 12.5 },
  { angle: 32, radius: 12.5 },
];

export const COTTAGES = COTTAGE_RING.map((c, i) => {
  const x = VILLAGE_CENTER.x + Math.cos(c.angle * DEG) * c.radius;
  const z = VILLAGE_CENTER.z + Math.sin(c.angle * DEG) * c.radius;
  const rot = Math.atan2(VILLAGE_CENTER.x - x, VILLAGE_CENTER.z - z); // front (+z) faces the square
  const half = COTTAGE_SIZE.depth / 2;
  return {
    id: `cottage-${i}`, x, z, rot,
    wallColor: PALETTE.walls[i], roofColor: PALETTE.roofs[i],
    door: { x: x + Math.sin(rot) * half, z: z + Math.cos(rot) * half, rot },
  };
});

const doorFront = (c, d) => ({ x: c.door.x + Math.sin(c.door.rot) * d, z: c.door.z + Math.cos(c.door.rot) * d });

// The dock starts on the east beach and runs straight out to sea. x, z is the shore end.
const DOCK_ANGLE = 18 * DEG;
export const DOCK = {
  x: Math.cos(DOCK_ANGLE) * 56.2, z: Math.sin(DOCK_ANGLE) * 56.2,
  rot: Math.atan2(Math.cos(DOCK_ANGLE), Math.sin(DOCK_ANGLE)),
  length: 10, width: 2.4, top: 0.62,
};
const dockDir = { x: Math.sin(DOCK.rot), z: Math.cos(DOCK.rot) };
export const BOAT = {
  x: DOCK.x + dockDir.x * 6.5 + dockDir.z * 2.6, z: DOCK.z + dockDir.z * 6.5 - dockDir.x * 2.6, rot: DOCK.rot + 0.12,
};

export const CAMPFIRE = { x: Math.cos(128 * DEG) * 53, z: Math.sin(128 * DEG) * 53 };
export const LOOKOUT = { x: HILL.x, z: HILL.z };
export const CHICKEN_YARD = { x: 25, z: 23, r: 3 };
export const CAT_SPOT = { x: 6.6, z: 12.2 };

const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const around = (c, angleDeg, r) => ({ x: c.x + Math.cos(angleDeg * DEG) * r, z: c.z + Math.sin(angleDeg * DEG) * r });

function seat(id, kind, pos, lookAt) { return { id, kind, x: pos.x, z: pos.z, rot: facing(pos, lookAt) }; }
const lookoutSeat = { x: LOOKOUT.x - 0.9, z: LOOKOUT.z - 1.1 };

// Two benches in the square, two logs by the fire, one bench at the lookout facing the sea.
export const SEATS = [
  seat('bench-0', 'bench', { x: VILLAGE_CENTER.x - 4.2, z: VILLAGE_CENTER.z + 2.6 }, VILLAGE_CENTER),
  seat('bench-1', 'bench', { x: VILLAGE_CENTER.x + 4.2, z: VILLAGE_CENTER.z + 2.6 }, VILLAGE_CENTER),
  seat('log-0', 'log', around(CAMPFIRE, 200, 2.0), CAMPFIRE),
  seat('log-1', 'log', around(CAMPFIRE, 320, 2.0), CAMPFIRE),
  seat('bench-2', 'bench', lookoutSeat, { x: lookoutSeat.x * 3, z: lookoutSeat.z * 3 }),
];

// Dirt paths: from the square to every door, the dock, the campfire and the lookout.
export const PATHS = [
  ...COTTAGES.map((c) => [VILLAGE_CENTER, doorFront(c, 0.4)]),
  [VILLAGE_CENTER, { x: 24, z: 11 }, { x: 40, z: 15 }, { x: DOCK.x, z: DOCK.z }],
  [VILLAGE_CENTER, PLAYER_START, { x: 3, z: 24 }, { x: -14, z: 35 }, { x: CAMPFIRE.x + 2.6, z: CAMPFIRE.z - 3.2 }],
  [VILLAGE_CENTER, { x: 1, z: -2 }, { x: -6, z: -11 }, { x: -11, z: -14 }, { x: -15, z: -18.5 }, { x: LOOKOUT.x + 1.2, z: LOOKOUT.z + 1.6 }],
];
const DOCK_PATH = PATHS[COTTAGES.length], FIRE_PATH = PATHS[COTTAGES.length + 1], HILL_PATH = PATHS[COTTAGES.length + 2];

function distanceToSegment(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

export function distanceToPath(x, z) {
  let best = Infinity;
  for (const path of PATHS) for (let i = 0; i < path.length - 1; i++) best = Math.min(best, distanceToSegment(x, z, path[i], path[i + 1]));
  return best;
}

// A point `d` metres along a path, pushed `side` metres to one side of it.
function alongPath(path, d, side = 0) {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], len = dist(a, b);
    if (d <= len || i === path.length - 2) {
      const t = Math.min(1, d / len), nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len;
      return { x: a.x + (b.x - a.x) * t + nx * side, z: a.z + (b.z - a.z) * t + nz * side };
    }
    d -= len;
  }
  return path[path.length - 1];
}

export const LANTERNS = [
  around(VILLAGE_CENTER, 62, 5.6), around(VILLAGE_CENTER, 118, 5.6),
  alongPath(DOCK_PATH, 20, 1.5), alongPath(DOCK_PATH, 38, -1.5),
  alongPath(FIRE_PATH, 22, 1.5), alongPath(FIRE_PATH, 40, -1.5),
  alongPath(HILL_PATH, 14, 1.5), alongPath(HILL_PATH, 27, -1.5),
].map((p, i) => ({ id: `lantern-${i}`, x: p.x, z: p.z }));

export const FENCES = [
  [around(CHICKEN_YARD, 20, 3.6), around(CHICKEN_YARD, 80, 3.6)],
  [around(CHICKEN_YARD, 80, 3.6), around(CHICKEN_YARD, 140, 3.6)],
  [around(CHICKEN_YARD, 320, 3.6), around(CHICKEN_YARD, 20, 3.6)],
  [around(LOOKOUT, 215, 2.9), around(LOOKOUT, 250, 2.9)],
  [around(LOOKOUT, 180, 2.9), around(LOOKOUT, 215, 2.9)],
];

// Standing spots villagers stroll between. The first has open ground all around it.
export const VILLAGER_SPOTS = [
  { x: VILLAGE_CENTER.x + 0.6, z: VILLAGE_CENTER.z + 4.6 },
  ...COTTAGES.map((c) => doorFront(c, 2.2)),
  { x: VILLAGE_CENTER.x - 3, z: VILLAGE_CENTER.z - 2.6 },
  { x: VILLAGE_CENTER.x + 3.4, z: VILLAGE_CENTER.z - 2.2 },
  alongPath(DOCK_PATH, 30, 0),
  alongPath(FIRE_PATH, 26, 0),
  alongPath(HILL_PATH, 16, 0),
];

// ---- Walkable ground ----------------------------------------------------

function inDock(x, z) {
  const wx = x - DOCK.x, wz = z - DOCK.z;
  const along = wx * dockDir.x + wz * dockDir.z, across = wx * dockDir.z - wz * dockDir.x;
  return along >= -0.6 && along <= DOCK.length && Math.abs(across) <= DOCK.width / 2;
}

// Terrain height, plus the dock's deck where there is one.
export function groundAt(x, z) {
  const h = heightAt(x, z);
  return inDock(x, z) ? Math.max(h, DOCK.top) : h;
}

// ---- Scatter ------------------------------------------------------------

let scatterCache = null;

export function getScatter() {
  if (scatterCache) return scatterCache;
  const rng = createRng(SEED);
  const keepClear = [
    ...SEATS.map((s) => ({ ...s, r: 2 })), ...LANTERNS.map((l) => ({ ...l, r: 1.5 })),
    ...VILLAGER_SPOTS.map((s) => ({ ...s, r: 2.6 })),
    { ...PLAYER_START, r: 3 }, { ...CAMPFIRE, r: 4.5 }, { ...CHICKEN_YARD, r: 5 }, { ...CAT_SPOT, r: 2 },
    { ...LOOKOUT, r: 4.5 },
  ];
  const clearOf = (p, list, extra = 0) => list.every((o) => dist(p, o) > (o.r || 0) + extra);
  const clearOfCottages = (p, d) => COTTAGES.every((c) => dist(p, c) > d);

  function place(count, prefix, ok, makeExtra) {
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < 200000) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 58;
      const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      if (!ok(p, out)) continue;
      out.push({ id: `${prefix}-${out.length}`, x: p.x, z: p.z, ...makeExtra() });
    }
    return out;
  }

  const trees = place(40, 'tree',
    (p, out) => zoneAt(p.x, p.z) === 'grass' && Math.hypot(p.x, p.z) < 45.5 && distanceToPath(p.x, p.z) > 2.4
      && clearOfCottages(p, 5.6) && dist(p, VILLAGE_CENTER) > 9 && clearOf(p, keepClear, 0.6) && out.every((o) => dist(p, o) > 3.4),
    () => ({ scale: 0.85 + rng() * 0.5, rot: rng() * Math.PI * 2, kind: Math.floor(rng() * 3) }));

  const bushes = place(30, 'bush',
    (p, out) => zoneAt(p.x, p.z) === 'grass' && Math.hypot(p.x, p.z) < 46.5 && distanceToPath(p.x, p.z) > 1.6
      && clearOfCottages(p, 4.2) && dist(p, VILLAGE_CENTER) > 7.5 && clearOf(p, keepClear) && clearOf(p, trees.map((t) => ({ ...t, r: 1.6 })))
      && out.every((o) => dist(p, o) > 1.8),
    () => ({ scale: 0.7 + rng() * 0.6, rot: rng() * Math.PI * 2 }));

  const rocks = place(25, 'rock',
    (p, out) => heightAt(p.x, p.z) > 0.25 && distanceToPath(p.x, p.z) > 1.6 && clearOfCottages(p, 4.4)
      && dist(p, VILLAGE_CENTER) > 8 && clearOf(p, keepClear) && dist(p, DOCK) > 4 && clearOf(p, trees.map((t) => ({ ...t, r: 1.4 })))
      && out.every((o) => dist(p, o) > 2.5),
    () => ({ scale: 0.6 + rng() * 0.9, rot: rng() * Math.PI * 2 }));

  // Flowers grow in little clusters.
  const flowers = [];
  let guard = 0;
  while (flowers.length < 150 && guard++ < 200000) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 45;
    const centre = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    const n = 4 + Math.floor(rng() * 5), color = Math.floor(rng() * PALETTE.flowers.length);
    for (let i = 0; i < n && flowers.length < 150; i++) {
      const p = { x: centre.x + (rng() - 0.5) * 2.6, z: centre.z + (rng() - 0.5) * 2.6 };
      if (zoneAt(p.x, p.z) !== 'grass' || distanceToPath(p.x, p.z) < 0.9 || !clearOfCottages(p, 3.7)) continue;
      flowers.push({ id: `flower-${flowers.length}`, x: p.x, z: p.z, scale: 0.8 + rng() * 0.5, rot: rng() * Math.PI * 2, color });
    }
  }

  scatterCache = { trees, bushes, flowers, rocks };
  return scatterCache;
}

// ---- Colliders ----------------------------------------------------------

let colliderCache = null;

function fenceBox([a, b]) {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hw: dist(a, b) / 2, hd: 0.14, rot: Math.atan2(-(b.z - a.z), b.x - a.x) };
}

export function getColliders() {
  if (colliderCache) return colliderCache;
  const s = getScatter();
  colliderCache = [
    ...COTTAGES.map((c) => ({ x: c.x, z: c.z, hw: COTTAGE_SIZE.width / 2, hd: COTTAGE_SIZE.depth / 2, rot: c.rot, tall: true })),
    ...FENCES.map(fenceBox),
    ...s.trees.map((t) => ({ x: t.x, z: t.z, r: 0.4 * t.scale })),
    ...s.rocks.map((r) => ({ x: r.x, z: r.z, r: 0.5 * r.scale })),
    ...LANTERNS.map((l) => ({ x: l.x, z: l.z, r: 0.15 })),
    ...SEATS.map((st) => (st.kind === 'bench'
      ? { x: st.x, z: st.z, hw: 0.85, hd: 0.3, rot: st.rot }
      : { x: st.x, z: st.z, hw: 0.8, hd: 0.3, rot: st.rot })),
    { x: BELL.x, z: BELL.z, r: 0.35 },
    { x: CAMPFIRE.x, z: CAMPFIRE.z, r: 0.75 },
    { x: BOAT.x, z: BOAT.z, r: 1.2 },
  ];
  return colliderCache;
}
