// Fixed positions of everything on the island. The same every run.
import { createRng } from './rng.js';
import { heightAt, zoneAt } from './terrain.js';
import { SEED, PALETTE, HILL, PLAYER_START } from '../config.js';

const DEG = Math.PI / 180;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export const VILLAGE_CENTER = { x: 10, z: 8 };
// The village fire burns in the middle of the square; the bell stands at its northern edge.
export const VILLAGE_FIRE = { x: VILLAGE_CENTER.x, z: VILLAGE_CENTER.z };
export const BELL = { x: 12.5, z: 2.8 };
export const FLAGPOLE = { x: 14.2, z: 10.6 };
// The farm: a crop field beside the barn.
export const FIELD = { x: 26.5, z: 31.5, rot: 0.5, width: 5, length: 7 };

// Houses stand on short stilts; `floor` is how far the floor is above the ground.
export const COTTAGE_SIZE = { width: 5, depth: 4, floor: 0.55 };

// The scout camp's buildings are scattered around the parade ground, each with its own job.
// `rot` turns the front (+z) of the building; width/depth are its footprint; `floor` is the
// height of the floor above the ground (cabins stand on short stilts).
const BUILDINGS = [
  { type: 'hall', x: 9, z: -7.5, rot: 0, width: 8, depth: 6 },        // big marquee: camp headquarters
  { type: 'patrol', x: -3, z: 6, rot: 1.3, width: 4.2, depth: 4.6 },  // patrol sleeping tents
  { type: 'patrol', x: -1, z: 16, rot: 0.9, width: 4.2, depth: 4.6 },
  { type: 'patrol', x: 22, z: 2, rot: -1.9, width: 4.2, depth: 4.6 },
  { type: 'farm', x: 33, z: 27, rot: -2.03, width: 5.5, depth: 4.5 }, // bamboo-and-tarp farm shed
  { type: 'guard', x: 44, z: 11, rot: 0.15, width: 3, depth: 3 },     // guard post by the dock path
  { type: 'mess', x: 12, z: 25, rot: -3.02, width: 6, depth: 5 },     // kitchen and food tent
  { type: 'aid', x: 19.5, z: -9, rot: -0.51, width: 3.6, depth: 4 },  // first-aid tent
].map((b) => ({ floor: 0, ...b }));

// A point given in a building's own frame (x to its side, z out of its front) as a world point.
export function toWorld(c, lx, lz) {
  const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  return { x: c.x + lx * cos + lz * sin, z: c.z - lx * sin + lz * cos };
}

export const COTTAGES = BUILDINGS.map((b, i) => ({
  id: `cottage-${i}`, ...b,
  wallColor: PALETTE.walls[i], roofColor: PALETTE.roofs[i],
  door: { x: b.x + Math.sin(b.rot) * (b.depth / 2), z: b.z + Math.cos(b.rot) * (b.depth / 2), rot: b.rot },
}));

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
export const CAMPFIRES = [{ id: 'fire-village', ...VILLAGE_FIRE, lit: true }, { id: 'fire-camp', ...CAMPFIRE, lit: false }];
export const CHICKEN_YARD = { x: 25, z: 23, r: 3 };
// A windmill stands on the north-east meadow, with sheep grazing beside it.
export const WINDMILL = { x: 30, z: -22 };
export const SHEEP_MEADOW = { x: 23.5, z: -17, r: 3.2 };
export const CAT_SPOT = { x: 4.6, z: 8.8 };

const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const around = (c, angleDeg, r) => ({ x: c.x + Math.cos(angleDeg * DEG) * r, z: c.z + Math.sin(angleDeg * DEG) * r });

function seat(id, kind, pos, lookAt) { return { id, kind, x: pos.x, z: pos.z, rot: facing(pos, lookAt) }; }
const lookoutSeat = { x: LOOKOUT.x - 0.9, z: LOOKOUT.z - 1.1 };

// Two logs by the village fire, two by the camp fire, one bench at the lookout facing the sea.
export const SEATS = [
  seat('log-2', 'log', around(VILLAGE_FIRE, 150, 2.3), VILLAGE_FIRE),
  seat('log-3', 'log', around(VILLAGE_FIRE, 30, 2.3), VILLAGE_FIRE),
  seat('log-0', 'log', around(CAMPFIRE, 200, 2.0), CAMPFIRE),
  seat('log-1', 'log', around(CAMPFIRE, 320, 2.0), CAMPFIRE),
  seat('bench-2', 'bench', lookoutSeat, { x: lookoutSeat.x * 3, z: lookoutSeat.z * 3 }),
];

// Canvas tents: three around the beach camp fire, and the scouts' rows beside the parade ground.
const tentAt = (id, p, lookAt) => ({ id, x: p.x, z: p.z, rot: facing(p, lookAt) });
export const TENTS = [
  ...[60, 185, 250].map((a, i) => tentAt(`tent-${i}`, around(CAMPFIRE, a, 5.4), CAMPFIRE)),
  tentAt('tent-3', { x: 15.5, z: 16 }, VILLAGE_CENTER), tentAt('tent-4', { x: 19, z: 17.5 }, VILLAGE_CENTER),
  tentAt('tent-5', { x: -8, z: 12 }, VILLAGE_CENTER), tentAt('tent-6', { x: -9.5, z: 15.5 }, VILLAGE_CENTER),
];

// A pioneering gateway over the dock path, a bamboo lookout tower by the guard post,
// picnic tables by the mess tent, and the spots where groups of scouts are busy.
export const GATE = { x: 30, z: 12.5, rot: Math.atan2(16, 4), half: 1.9 };
export const TOWER = { x: 46.5, z: 8.2 };
export const PICNIC_TABLES = [{ x: 17.8, z: 23.4, rot: 0.3 }, { x: 18.2, z: 27.2, rot: -0.25 }];
export const PIONEER_SITE = { x: -5.3, z: 21 };
export const SALUTE_LINE = [{ x: 15.2, z: 12.6 }, { x: 16.6, z: 12.9 }, { x: 18, z: 13.2 }];
const gatePosts = [-1, 1].map((s) => ({ x: GATE.x + Math.cos(GATE.rot) * GATE.half * s, z: GATE.z - Math.sin(GATE.rot) * GATE.half * s }));
export const GATE_POSTS = gatePosts;

// Dirt paths: from the square to every door, the dock, the campfire and the lookout.
export const PATHS = [
  ...COTTAGES.map((c) => {
    // The far-off barn and guard post branch off the dock path instead of crossing the camp.
    if (c.type === 'farm') return [{ x: 24, z: 11 }, { x: 29.5, z: 19 }, doorFront(c, 0.4)];
    if (c.type === 'mess') return [PLAYER_START, doorFront(c, 0.4)];
    if (c.type === 'aid') return [{ x: 15.8, z: 3.9 }, doorFront(c, 0.4)];
    if (c.type === 'guard') return [{ x: 40, z: 15 }, doorFront(c, 0.4)];
    return [VILLAGE_CENTER, doorFront(c, 0.4)];
  }),
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

// A camp structure's floor is level: it sits at the highest bit of ground under it.
export function floorHeight(c) {
  let top = heightAt(c.x, c.z);
  for (const lx of [-1, 0, 1]) for (const lz of [-1, 0, 1]) { const p = toWorld(c, lx * c.width / 2, lz * c.depth / 2); top = Math.max(top, heightAt(p.x, p.z)); }
  return top;
}
const FLOORS = COTTAGES.map((c) => ({ c, y: floorHeight(c) + 0.06, cos: Math.cos(c.rot), sin: Math.sin(c.rot) }));

// Terrain height, plus the dock's deck and the level floors inside the camp structures.
export function groundAt(x, z) {
  const h = heightAt(x, z);
  if (inDock(x, z)) return Math.max(h, DOCK.top);
  for (const f of FLOORS) {
    const wx = x - f.c.x, wz = z - f.c.z;
    if (Math.abs(wx * f.cos - wz * f.sin) < f.c.width / 2 + 0.05 && Math.abs(wx * f.sin + wz * f.cos) < f.c.depth / 2 + 0.2) return Math.max(h, f.y);
  }
  return h;
}

// ---- Scatter ------------------------------------------------------------

let scatterCache = null;

export function getScatter() {
  if (scatterCache) return scatterCache;
  const rng = createRng(SEED);
  const keepClear = [
    ...SEATS.map((s) => ({ ...s, r: 2 })), ...LANTERNS.map((l) => ({ ...l, r: 1.5 })),
    ...VILLAGER_SPOTS.map((s) => ({ ...s, r: 2.6 })),
    { ...PLAYER_START, r: 3 }, { ...CAMPFIRE, r: 8.5 }, { ...BELL, r: 2 }, { ...FLAGPOLE, r: 2 }, { ...FIELD, r: 5.5 },
    ...TENTS.map((t) => ({ ...t, r: 3 })),
    { ...GATE, r: 3.2 }, { ...TOWER, r: 3 }, ...PICNIC_TABLES.map((t) => ({ ...t, r: 2.6 })), { ...PIONEER_SITE, r: 3.6 },
    ...SALUTE_LINE.map((p) => ({ ...p, r: 1.6 })), { ...CHICKEN_YARD, r: 5 }, { ...CAT_SPOT, r: 2 },
    { ...LOOKOUT, r: 4.5 }, { ...WINDMILL, r: 6 }, { ...SHEEP_MEADOW, r: 5.5 },
  ];
  const clearOf = (p, list, extra = 0) => list.every((o) => dist(p, o) > (o.r || 0) + extra);
  // Bigger buildings need a wider berth.
  const clearOfCottages = (p, d) => COTTAGES.every((c) => dist(p, c) > d + Math.max(0, (Math.max(c.width, c.depth) - 5) / 2));

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

  const trees = place(70, 'tree',
    (p, out) => zoneAt(p.x, p.z) === 'grass' && Math.hypot(p.x, p.z) < 45.5 && distanceToPath(p.x, p.z) > 2.4
      && clearOfCottages(p, 5.6) && dist(p, VILLAGE_CENTER) > 9 && clearOf(p, keepClear, 0.6) && out.every((o) => dist(p, o) > 2.9),
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
    ...COTTAGES.map((c) => ({ x: c.x, z: c.z, hw: c.width / 2, hd: c.depth / 2, rot: c.rot, tall: true, building: true })),
    ...FENCES.map(fenceBox),
    ...s.trees.map((t) => ({ x: t.x, z: t.z, r: 0.4 * t.scale })),
    ...s.rocks.map((r) => ({ x: r.x, z: r.z, r: 0.5 * r.scale })),
    ...LANTERNS.map((l) => ({ x: l.x, z: l.z, r: 0.15 })),
    ...SEATS.map((st) => (st.kind === 'bench'
      ? { x: st.x, z: st.z, hw: 0.85, hd: 0.3, rot: st.rot }
      : { x: st.x, z: st.z, hw: 0.8, hd: 0.3, rot: st.rot })),
    { x: BELL.x, z: BELL.z, r: 0.45 },
    { x: FLAGPOLE.x, z: FLAGPOLE.z, r: 0.22 },
    { x: TOWER.x, z: TOWER.z, r: 1.3 },
    ...GATE_POSTS.map((p) => ({ x: p.x, z: p.z, r: 0.45 })),
    ...PICNIC_TABLES.map((t) => ({ x: t.x, z: t.z, hw: 1.0, hd: 0.9, rot: t.rot })),
    ...CAMPFIRES.map((f) => ({ x: f.x, z: f.z, r: 0.8 })),
    ...TENTS.map((t) => ({ x: t.x, z: t.z, hw: 1.25, hd: 1.35, rot: t.rot })),
    { x: BOAT.x, z: BOAT.z, r: 1.2 },
    { x: WINDMILL.x, z: WINDMILL.z, r: 2.4 },
  ];
  return colliderCache;
}
