// Fixed positions of everything on the island. The same every run.
import { createRng } from './rng.js';
import { heightAt, zoneAt, nearestOnTrail, landR, groundKind } from './terrain.js';
import { SEED, PALETTE, HILL, PLAYER_START, POND, HILL_TRAIL, AREAS } from '../config.js';

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
  { type: 'hall', x: 11.6, z: -7.3, rot: 0, width: 8, depth: 6 },        // big marquee: camp headquarters
  { type: 'patrol', x: -3, z: 6, rot: 1.3, width: 5, depth: 6 },       // patrol dormitory tents, eight beds each
  { type: 'patrol', x: -2.5, z: 16.5, rot: 0.9, width: 5, depth: 6 },
  { type: 'patrol', x: 22, z: 2, rot: -1.9, width: 5, depth: 6 },
  { type: 'farm', x: 33, z: 27, rot: -2.03, width: 5.5, depth: 4.5 }, // bamboo-and-tarp farm shed
  { type: 'guard', x: 44, z: 11, rot: 0.15, width: 3, depth: 3 },     // guard post by the dock path
  { type: 'mess', x: 12, z: 25, rot: -3.02, width: 6, depth: 5 },     // kitchen and food tent
  { type: 'aid', x: 19.5, z: -9, rot: -0.51, width: 3.6, depth: 4 },  // first-aid tent
  { type: 'patrol', x: 29.5, z: -1, rot: -1.7, width: 5, depth: 6, path: [{ x: 17.2, z: -2 }, { x: 22.5, z: -3.6 }] },
  { type: 'patrol', x: 34, z: 6.5, rot: -1.75, width: 5, depth: 6, path: [{ x: 27, z: 11.8 }] },
  { type: 'patrol', x: 6, z: 33, rot: 3.0, width: 5, depth: 6, path: [{ x: 3, z: 24 }, { x: 5.5, z: 27.5 }] },
  { type: 'staff', x: 16.5, z: 33.5, rot: 3.1, width: 4.6, depth: 5.4, path: [{ x: 13.5, z: 21.3 }, { x: 16.2, z: 22.2 }] }, // where the teachers sleep
].map((b) => ({ floor: 0, ...b }));

// Where the beds stand inside a dormitory, in the tent's own frame. `side` is the wall the pillow is against.
export const BED_PLAN = {
  patrol: [-2.25, -1.15, -0.05, 1.05].flatMap((z) => [{ x: -1.65, z, side: -1 }, { x: 1.65, z, side: 1 }]),
  staff: [-1.75, -0.45, 0.85].flatMap((z) => [{ x: -1.4, z, side: -1 }, { x: 1.4, z, side: 1 }]),
};
// Every bed in camp as a world position. `rot` lays a sleeper with their head on the pillow;
// `door` is the spot outside the flap to walk to first. The first bed in each patrol tent is kept free for you.
export function allBeds() {
  const out = [];
  for (const c of COTTAGES) {
    const plan = BED_PLAN[c.type];
    if (!plan) continue;
    plan.forEach((b, k) => {
      const p = toWorld(c, b.x, b.z);
      out.push({ x: p.x, z: p.z, rot: c.rot - (b.side * Math.PI) / 2, door: toWorld(c, 0, c.depth / 2 + 0.9), staff: c.type === 'staff', yours: c.type === 'patrol' && k === 0, tent: c.id });
    });
  }
  return out;
}

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
  length: 20, width: 3.6, top: 0.62, // the harbour pier (models in src/world/areas/harbour.js)
};
const dockDir = { x: Math.sin(DOCK.rot), z: Math.cos(DOCK.rot) };
export const BOAT = {
  x: DOCK.x + dockDir.x * 6.5 + dockDir.z * 3.3, z: DOCK.z + dockDir.z * 6.5 - dockDir.x * 3.3, rot: DOCK.rot + 0.12,
};

export const CAMPFIRE = { x: Math.cos(128 * DEG) * 53, z: Math.sin(128 * DEG) * 53 };
export const LOOKOUT = { x: HILL.x, z: HILL.z };
// The summit camp on the hill's level top: a signal mast, a third fire, a lean-to shelter,
// a telescope looking out to sea and a cairn.
const onSummit = (dx, dz) => ({ x: LOOKOUT.x + dx, z: LOOKOUT.z + dz });
export const SUMMIT = {
  fire: onSummit(1.6, 1.8), mast: onSummit(0, -0.8), shelter: { ...onSummit(3.9, -2.2), rot: -1.2 },
  telescope: onSummit(-1.9, -4.1), cairn: onSummit(1.4, -4.2), signallers: [onSummit(-1.5, 3.7), onSummit(-3.3, 2.9)],
  watcher: onSummit(-3.1, -3.5), mapper: onSummit(3.3, 0.9),
};
// The flying fox: a long cable from a launch tower on the summit, out over the parade ground,
// the campfire and the tents, down to a landing frame on the far beach.
export const ZIPLINE = {
  top: onSummit(4.02, 4.31), bottom: { x: 36.6, z: 36.5 }, topHeight: 4.4, bottomHeight: 2.7, sag: 1.6,
  // A trail from the landing round the farm shed to the barn path.
  trail: [{ x: 36.9, z: 35.3 }, { x: 38.2, z: 30 }, { x: 37.5, z: 23.5 }, { x: 33.5, z: 18 }, { x: 29.5, z: 19 }],
  queue: onSummit(2.7, 3.1),
};
// The long walk back: along the farm trail, through the camp and up the hill trail to the tower.
export const RIDER_ROUTE = [
  ...ZIPLINE.trail, { x: 24, z: 11 }, { x: 14.5, z: 6.5 }, { x: 5, z: 1 }, ...HILL_TRAIL, onSummit(-2.4, 1.4), ZIPLINE.queue,
];
export const CAMPFIRES = [{ id: 'fire-village', ...VILLAGE_FIRE, lit: true }, { id: 'fire-camp', ...CAMPFIRE, lit: false }, { id: 'fire-summit', ...SUMMIT.fire, lit: true }];
export const CHICKEN_YARD = { x: 25, z: 23, r: 3 };
// A windmill stands on the north-east meadow, with sheep grazing beside it.
export const WINDMILL = { x: 30, z: -22 };
export const SHEEP_MEADOW = { x: 23.5, z: -17, r: 3.2 };
export const CAT_SPOT = { x: 4.6, z: 8.8 };

const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const around = (c, angleDeg, r) => ({ x: c.x + Math.cos(angleDeg * DEG) * r, z: c.z + Math.sin(angleDeg * DEG) * r });

function seat(id, kind, pos, lookAt) { return { id, kind, x: pos.x, z: pos.z, rot: facing(pos, lookAt) }; }
const lookoutSeat = around(LOOKOUT, 278, 4.7);

// Two logs by the village fire, two by the camp fire, one bench at the lookout facing the sea.
export const SEATS = [
  seat('log-2', 'log', around(VILLAGE_FIRE, 150, 3.1), VILLAGE_FIRE),
  seat('log-3', 'log', around(VILLAGE_FIRE, 30, 3.1), VILLAGE_FIRE),
  seat('log-0', 'log', around(CAMPFIRE, 200, 2.0), CAMPFIRE),
  seat('log-1', 'log', around(CAMPFIRE, 320, 2.0), CAMPFIRE),
  seat('bench-2', 'bench', lookoutSeat, { x: lookoutSeat.x * 3, z: lookoutSeat.z * 3 }),
  seat('log-4', 'log', around(SUMMIT.fire, 200, 2.0), SUMMIT.fire),
  seat('log-5', 'log', around(SUMMIT.fire, 120, 2.0), SUMMIT.fire),
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
// Open ground for games: tag, a tug-of-war and a game of catch.
// The tug-of-war lies along +x on the flat plateau west of the tents, the beach squad drills east of the camp fire
// (`beach` is the middle of the three; the trainer stands off to its side), and tag is on the level east of the clinic.
export const PLAY = { tag: { x: 13, z: -17, r: 5.4 }, tug: { x: -36, z: 31, rot: 1.6 }, catch: [{ x: -14, z: 25 }, { x: -10, z: 21.5 }], beach: { x: -24.5, z: 42.5 } };
// Ground the games keep clear of bushes, trees, grass tufts and flowers (circles, 1.5 m wider than the players reach).
export const PLAY_CLEAR = [
  { ...PLAY.tag, r: PLAY.tag.r + 1 }, { x: -12, z: 23.2, r: 4.5 }, { ...PLAY.beach, r: 5 },
  ...[-3.6, -1.8, 0, 1.8, 3.6].map((d) => ({ x: PLAY.tug.x + Math.sin(PLAY.tug.rot) * d, z: PLAY.tug.z + Math.cos(PLAY.tug.rot) * d, r: 3.2 })),
];
export const SALUTE_LINE = [{ x: 15.2, z: 12.6 }, { x: 16.6, z: 12.9 }, { x: 18, z: 13.2 }];
const gatePosts = [-1, 1].map((s) => ({ x: GATE.x + Math.cos(GATE.rot) * GATE.half * s, z: GATE.z - Math.sin(GATE.rot) * GATE.half * s }));
export const GATE_POSTS = gatePosts;

// Dirt paths: from the square to every door, the dock, the campfire and the lookout.
// The trail on from the first-aid tent's path to the windmill knoll (where it meets the knoll-to-bridge trail).
const AID_TRAIL = [{ x: 17.2, z: -2.0 }, { x: 22.5, z: -3.6 }, { x: 26.2, z: -6.6 }, { x: 31, z: -11 }, { x: 36.5, z: -15.6 }, { x: 42.5, z: -19 }];
export const PATHS = [
  ...COTTAGES.map((c) => {
    // The far-off barn and guard post branch off the dock path instead of crossing the camp.
    if (c.path) return [...c.path, doorFront(c, 0.4)];
    if (c.type === 'farm') return [{ x: 24, z: 11 }, { x: 29.5, z: 19 }, doorFront(c, 0.4)];
    if (c.type === 'mess') return [PLAYER_START, doorFront(c, 0.4)];
    if (c.type === 'aid') return [{ x: 15.8, z: 3.9 }, doorFront(c, 0.4)];
    if (c.type === 'guard') return [{ x: 40, z: 15 }, doorFront(c, 0.4)];
    return [VILLAGE_CENTER, doorFront(c, 0.4)];
  }),
  [VILLAGE_CENTER, { x: 24, z: 11 }, { x: 40, z: 15 }, { x: DOCK.x, z: DOCK.z }],
  [VILLAGE_CENTER, PLAYER_START, { x: 3, z: 24 }, { x: -14, z: 35 }, { x: CAMPFIRE.x + 2.6, z: CAMPFIRE.z - 3.2 }],
  // The hill trail winds up the gentler side to the summit.
  [VILLAGE_CENTER, ...HILL_TRAIL],
  // The way back up from the flying fox landing.
  ZIPLINE.trail,
  // From the first-aid tent out past the patrol hut, across the meadow to the windmill knoll and on to the bridge.
  AID_TRAIL,
  // The trail to the village: off the dock path past the canoes, up the open beach side of the meadow to the bridge landing.
  [{ x: 52, z: 17.1 }, { x: 54.6, z: 14.6 }, { x: 55.4, z: 9.5 }, { x: 55, z: 3.5 }, { x: 54.2, z: -3 }, { x: 52.8, z: -9.5 }, { x: 51.2, z: -15 }, { x: 51.8, z: -19 }, { x: 53.4, z: -21.2 }],
];
const DOCK_PATH = PATHS[COTTAGES.length], FIRE_PATH = PATHS[COTTAGES.length + 1];
export const HILL_PATH = PATHS[COTTAGES.length + 2];

// Steps: wherever the hill trail climbs steeply it is built as a flight of level treads.
// Each tread is one flat step { i: stretch of trail, s0, s1: where it starts and ends along it, top: its height }.
export const TREAD = 1.1, STAIR_HALF = 1.1; // broad, low steps: easy for short legs
export const STAIRS = (() => {
  const out = [];
  for (let i = 0; i < HILL_TRAIL.length - 1; i++) {
    const a = HILL_TRAIL[i], b = HILL_TRAIL[i + 1], len = dist(a, b), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    const hAt = (s) => heightAt(a.x + dx * s, a.z + dz * s);
    for (let k = 0; (k + 1) * TREAD <= len; k++) {
      const h0 = hAt(k * TREAD), h1 = hAt((k + 1) * TREAD);
      if (Math.abs(h1 - h0) / TREAD < 0.12) continue; // gentle enough to leave as a ramp
      out.push({ i, k, s0: k * TREAD, s1: (k + 1) * TREAD, top: Math.max(h0, h1) + 0.02, rising: h1 > h0, x: a.x + dx * (k + 0.5) * TREAD, z: a.z + dz * (k + 0.5) * TREAD, rot: Math.atan2(dx, dz) });
    }
  }
  return out;
})();
const stairIndex = new Map(STAIRS.map((t) => [`${t.i}:${t.k}`, t]));
// The step under a point, if it is on one.
function stairAt(x, z) {
  if (Math.hypot(x - HILL.x, z - HILL.z) > HILL.radius + 2) return null;
  const n = nearestOnTrail(x, z);
  if (n.d > STAIR_HALF) return null;
  return stairIndex.get(`${n.i}:${Math.floor(n.s / TREAD)}`) || null;
}

// Railings: a lashed wooden rail down the drop side of the hill trail, and round the lookout.
// Each entry is one straight run [from, to].
export const RAILINGS = (() => {
  const runs = [];
  for (let i = 1; i < HILL_PATH.length - 1; i++) {
    const a = HILL_PATH[i], b = HILL_PATH[i + 1], len = dist(a, b), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    // the rail goes on whichever side the ground falls away
    const side = heightAt(mid.x + dz * 2, mid.z - dx * 2) < heightAt(mid.x - dz * 2, mid.z + dx * 2) ? 1 : -1;
    const off = 1.5, trim = i === HILL_PATH.length - 2 ? 1.6 : 0.3;
    runs.push([{ x: a.x + dx * 0.3 + dz * side * off, z: a.z + dz * 0.3 - dx * side * off }, { x: b.x - dx * trim + dz * side * off, z: b.z - dz * trim - dx * side * off }]);
  }
  for (const a of [224, 246, 268, 290]) runs.push([around(LOOKOUT, a, 6.0), around(LOOKOUT, a + 22, 6.0)]);
  return runs;
})();

function distanceToSegment(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

// The camp-to-bridge trail (the last path): trees and bushes keep their crowns off it.
export function distanceToTrail(x, z) {
  let best = Infinity;
  for (const t of [PATHS[PATHS.length - 1], AID_TRAIL]) for (let i = 0; i < t.length - 1; i++) best = Math.min(best, distanceToSegment(x, z, t[i], t[i + 1]));
  return best;
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
  alongPath(HILL_PATH, 14, 2.1), alongPath(HILL_PATH, 27, -2.1),
].map((p, i) => ({ id: `lantern-${i}`, x: p.x, z: p.z }));

export const FENCES = [
  [around(CHICKEN_YARD, 20, 3.6), around(CHICKEN_YARD, 80, 3.6)],
  [around(CHICKEN_YARD, 80, 3.6), around(CHICKEN_YARD, 140, 3.6)],
  [around(CHICKEN_YARD, 320, 3.6), around(CHICKEN_YARD, 20, 3.6)],
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

// Walkable platforms: anything raised you can walk on that is not hardcoded above (bridges,
// stepping stones, a gangway, a jetty). Each is a shape, a top height and a surface name:
//   { shape: 'strip', a: {x, z}, b: {x, z}, width, y0, y1, arch, surface }  a straight deck from a to b;
//       its top runs from y0 at a to y1 at b (each defaults to the ground there) and bows up by `arch` mid-way
//   { shape: 'circle', x, z, r, top, surface }                             a round top, e.g. a stepping stone
//   { shape: 'box', x, z, rot, hw, hd, top, surface }                      a level rectangle turned by rot
// `addPlatform` registers one and returns it (with its numbers filled in); `removePlatform` takes it away.
export const PLATFORMS = [];
export function addPlatform(p) {
  const q = { surface: 'wood', ...p };
  if (q.shape === 'strip') {
    q.y0 ??= heightAt(q.a.x, q.a.z) + 0.04; q.y1 ??= heightAt(q.b.x, q.b.z) + 0.04; q.arch ??= 0;
    q.len = Math.hypot(q.b.x - q.a.x, q.b.z - q.a.z); q.dx = (q.b.x - q.a.x) / q.len; q.dz = (q.b.z - q.a.z) / q.len;
    q.reach = q.len / 2 + q.width; q.cx = (q.a.x + q.b.x) / 2; q.cz = (q.a.z + q.b.z) / 2;
  } else if (q.shape === 'box') { q.cx = q.x; q.cz = q.z; q.reach = Math.hypot(q.hw, q.hd); q.cos = Math.cos(q.rot || 0); q.sin = Math.sin(q.rot || 0); }
  else { q.cx = q.x; q.cz = q.z; q.reach = q.r; }
  PLATFORMS.push(q);
  return q;
}
export function removePlatform(q) { const i = PLATFORMS.indexOf(q); if (i >= 0) PLATFORMS.splice(i, 1); }
// The platform under a point and its top there, or null.
const under = { p: null, y: 0 };
export function platformUnder(x, z) {
  for (const q of PLATFORMS) {
    if (Math.abs(x - q.cx) > q.reach || Math.abs(z - q.cz) > q.reach) continue;
    if (q.shape === 'strip') {
      const wx = x - q.a.x, wz = z - q.a.z, along = wx * q.dx + wz * q.dz;
      if (along < 0 || along > q.len || Math.abs(wx * q.dz - wz * q.dx) > q.width / 2) continue;
      const u = along / q.len;
      under.p = q; under.y = q.y0 + (q.y1 - q.y0) * u + q.arch * Math.sin(Math.PI * u); return under;
    }
    if (q.shape === 'box') {
      const wx = x - q.x, wz = z - q.z;
      if (Math.abs(wx * q.cos - wz * q.sin) > q.hw || Math.abs(wx * q.sin + wz * q.cos) > q.hd) continue;
    } else if (Math.hypot(x - q.x, z - q.z) > q.r) continue;
    under.p = q; under.y = q.top; return under;
  }
  return null;
}
// The foundation's own crossings: the plank bridge at the camp end of the river and the
// stepping stones over the ford near the lake. Their models are in src/world/areas/crossings.js.
export const BRIDGE = addPlatform({ shape: 'strip', a: AREAS.bridge.a, b: AREAS.bridge.b, width: AREAS.bridge.width, arch: AREAS.bridge.arch, surface: 'wood', id: 'bridge' });
export const STONES = AREAS.stones.map((s, i) => addPlatform({ shape: 'circle', x: s.x, z: s.z, r: s.r, top: 0.16 + 0.05 * Math.sin(i * 2.3), surface: 'rock', id: `stone-${i}` }));

// Terrain height, plus the dock's deck, the level floors inside the camp structures and any platform.
export function groundAt(x, z) {
  const h = heightAt(x, z);
  if (inDock(x, z)) return Math.max(h, DOCK.top);
  const step = stairAt(x, z);
  if (step) return step.top;
  for (const f of FLOORS) {
    const wx = x - f.c.x, wz = z - f.c.z;
    if (Math.abs(wx * f.cos - wz * f.sin) < f.c.width / 2 + 0.05 && Math.abs(wx * f.sin + wz * f.cos) < f.c.depth / 2 + 0.2) return Math.max(h, f.y);
  }
  const p = platformUnder(x, z);
  return p ? Math.max(h, p.y) : h;
}

// How deep in the jungle a spot is: 0 in and around the camp and on the locals' land, 1 well outside.
export function jungleAt(x, z) {
  const d = Math.hypot(x - 10, z - 8), r = landR(x, z);
  let t = Math.min(1, Math.max(0, (d - 23) / 6)) * Math.min(1, Math.max(0, (47 - r) / 4));
  if (t > 0 && d > 40) { const g = groundKind(x, z); if (g) t *= 1 - g.locals; }
  return t * t * (3 - 2 * t);
}

// What you are standing on, when it is something built: the dock's planks, a tent's groundsheet, a platform.
export function platformAt(x, z) {
  if (inDock(x, z)) return 'wood';
  for (const f of FLOORS) {
    const wx = x - f.c.x, wz = z - f.c.z;
    if (Math.abs(wx * f.cos - wz * f.sin) < f.c.width / 2 + 0.05 && Math.abs(wx * f.sin + wz * f.cos) < f.c.depth / 2 + 0.2) return 'floor';
  }
  const p = platformUnder(x, z);
  return p ? p.p.surface : null;
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
    { x: POND.x, z: POND.z, r: POND.rw + 1.4 }, { ...GATE, r: 3.2 },
    // Nothing may grow under the flying fox cable.
    ...Array.from({ length: 21 }, (_, k) => ({ x: ZIPLINE.top.x + (ZIPLINE.bottom.x - ZIPLINE.top.x) * (k / 20), z: ZIPLINE.top.z + (ZIPLINE.bottom.z - ZIPLINE.top.z) * (k / 20), r: 4.6 })), { ...TOWER, r: 3 }, ...PICNIC_TABLES.map((t) => ({ ...t, r: 2.6 })), { ...PIONEER_SITE, r: 3.6 },
    ...SALUTE_LINE.map((p) => ({ ...p, r: 1.6 })),
    ...PLAY_CLEAR, { ...CHICKEN_YARD, r: 5 }, { ...CAT_SPOT, r: 2 },
    { ...LOOKOUT, r: 8.6 }, { ...WINDMILL, r: 6 }, { ...SHEEP_MEADOW, r: 5.5 },
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

  // A few trees stand around the camp; beyond it the island is thick jungle of every size.
  const CAMP = { x: 10, z: 8 };
  const treeOk = (gap) => (p, out) => zoneAt(p.x, p.z) === 'grass' && Math.hypot(p.x, p.z) < 45.5 && distanceToPath(p.x, p.z) > 2.4 && distanceToTrail(p.x, p.z) > 4.2
    && clearOfCottages(p, 5.6) && dist(p, VILLAGE_CENTER) > 9 && clearOf(p, keepClear, 0.6) && out.every((o) => dist(p, o) > gap);
  const campTrees = place(34, 'tree', (p, out) => dist(p, CAMP) <= 28 && treeOk(3.2)(p, out),
    () => ({ scale: 0.85 + rng() * 0.5, rot: rng() * Math.PI * 2, kind: [0, 1, 2, 5, 5, 1][Math.floor(rng() * 6)] }));
  const JUNGLE_KINDS = [3, 4, 0, 3, 4, 2, 1, 4, 5, 5];
  const jungle = place(230, 'jtree', (p, out) => dist(p, CAMP) > 25 && treeOk(1.9)(p, out) && campTrees.every((o) => dist(p, o) > 2.6),
    () => ({ scale: 0.5 + rng() * rng() * 1.7, rot: rng() * Math.PI * 2, kind: JUNGLE_KINDS[Math.floor(rng() * JUNGLE_KINDS.length)] }));
  const trees = [...campTrees, ...jungle];

  const bushes = place(30, 'bush',
    (p, out) => zoneAt(p.x, p.z) === 'grass' && Math.hypot(p.x, p.z) < 46.5 && distanceToPath(p.x, p.z) > 1.6 && distanceToTrail(p.x, p.z) > 2.4
      && clearOfCottages(p, 4.2) && dist(p, VILLAGE_CENTER) > 7.5 && clearOf(p, keepClear) && clearOf(p, trees.map((t) => ({ ...t, r: 1.6 })))
      && out.every((o) => dist(p, o) > 1.8),
    () => ({ scale: 0.7 + rng() * 0.6, rot: rng() * Math.PI * 2 }));

  const rocks = place(25, 'rock',
    (p, out) => heightAt(p.x, p.z) > 0.25 && distanceToPath(p.x, p.z) > 1.6 && distanceToTrail(p.x, p.z) > 2.6 && clearOfCottages(p, 4.4)
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
    ...FENCES.map(fenceBox), ...RAILINGS.map(fenceBox),
    ...s.trees.map((t) => ({ x: t.x, z: t.z, r: 0.4 * t.scale })),
    ...s.rocks.map((r) => ({ x: r.x, z: r.z, r: 0.75 * r.scale })), // the block is about 0.86 by 0.68 across at scale 1
    ...LANTERNS.map((l) => ({ x: l.x, z: l.z, r: 0.15 })),
    ...SEATS.map((st) => (st.kind === 'bench'
      ? { x: st.x, z: st.z, hw: 0.85, hd: 0.3, rot: st.rot }
      : { x: st.x, z: st.z, hw: 0.8, hd: 0.3, rot: st.rot })),
    { x: BELL.x, z: BELL.z, r: 0.45 },
    { x: FLAGPOLE.x, z: FLAGPOLE.z, r: 0.22 },
    { x: TOWER.x, z: TOWER.z, r: 1.3 },
    ...GATE_POSTS.map((p) => ({ x: p.x, z: p.z, r: 0.45 })),
    ...PICNIC_TABLES.map((t) => ({ x: t.x, z: t.z, hw: 1.0, hd: 0.9, rot: t.rot })),
    ...CAMPFIRES.map((f) => ({ x: f.x, z: f.z, r: f.id === 'fire-village' ? 1.5 : 0.8 })),
    ...TENTS.map((t) => ({ x: t.x, z: t.z, hw: 1.25, hd: 1.35, rot: t.rot })),
    { x: BOAT.x, z: BOAT.z, r: 1.2 },
    { x: WINDMILL.x, z: WINDMILL.z, r: 2.4 },
    { x: ZIPLINE.top.x, z: ZIPLINE.top.z, r: 1.25 }, { x: ZIPLINE.bottom.x - 1.2, z: ZIPLINE.bottom.z, r: 0.5 },
    { x: SUMMIT.mast.x, z: SUMMIT.mast.z, r: 0.3 }, { x: SUMMIT.telescope.x, z: SUMMIT.telescope.z, r: 0.4 }, { x: SUMMIT.cairn.x, z: SUMMIT.cairn.z, r: 0.6 },
    { x: SUMMIT.shelter.x, z: SUMMIT.shelter.z, hw: 1.3, hd: 0.5, rot: SUMMIT.shelter.rot },
  ];
  return colliderCache;
}
