import {
  ISLAND_RADIUS, GRASS_RADIUS, SEA_FLOOR_RADIUS, GRASS_HEIGHT, HILL,
  MAX_WADE_DEPTH, MIN_WADE_SPEED, SEED, POND, KNOLL, CAMP_FLAT, SHOULDER, HILL_TRAIL, WILD, AREAS,
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
// The two rounds are melted together (a smooth minimum), so the coast is one flowing outline
// with no pinch or strip of beach between camp and jungle.
function melt(a, b) { const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / WILD.blend)); return b + (a - b) * h - WILD.blend * h * (1 - h); }
const oldLandR = (x, z) => melt(Math.hypot(x, z), wildEq(x, z));
// 0 in camp country, rising to 1 where the big jungle has fully taken over (before the new land).
function oldWildness(x, z) {
  const r0 = Math.hypot(x, z);
  return smooth((r0 - wildEq(x, z) + 30) / 40) * smooth((r0 - WILD.trees + 6) / 30);
}

// ---- The bigger island --------------------------------------------------------------------
// Beside the old land (which is left exactly as it was) lies new land: the locals' round across
// a river, joined to it by a band along the river's far bank, and a rock massif closing the
// river's north end. The river and the lake are dug out of all of it afterwards.
const meltK = (a, b, k) => { const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k)); return b + (a - b) * h - k * h * (1 - h); };
const { river: RIVER, locals: LOC, lake: LAKE, massif: MAS, lookout: LOOK } = AREAS;
const RIVER_DEPTH = 1.25, BAND = 26, LOOK_TOP = MAS.height + 0.4; // the bed mid-stream, and how wide the strip of land along the far bank is
// A polyline made ready for "nearest point" questions: each stretch and how far along it starts.
function line(pts) {
  const segs = []; let run = 0;
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z); segs.push({ a, b, len, start: run }); run += len; }
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  return { pts, segs, total: run, box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] };
}
// The nearest point of a line: how far away, where, how far along, which side (+1 on the right
// going along it, which for the river is the locals' side), and t on that stretch.
const FAR = { d: Infinity, x: 0, z: 0, s: 0, side: 0, i: 0, t: 0 };
function nearestOn(L, x, z, reach = Infinity) {
  const [x0, x1, z0, z1] = L.box;
  if (x < x0 - reach || x > x1 + reach || z < z0 - reach || z > z1 + reach) return FAR;
  let best = FAR;
  for (let i = 0; i < L.segs.length; i++) {
    const { a, b, len, start } = L.segs[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len * len)));
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz, s: start + t * len, side: dx * (z - a.z) - dz * (x - a.x) < 0 ? 1 : -1, i, t };
  }
  return best;
}
const riverLine = line(RIVER);
const MOUTH_AT = nearestOn(riverLine, AREAS.riverMouth.x, AREAS.riverMouth.z).s, FORD_AT = nearestOn(riverLine, AREAS.ford.x, AREAS.ford.z).s;
// The river where it passes a spot: distance from the middle, half width there, metres from the head, side.
export function riverAt(x, z) {
  const n = nearestOn(riverLine, x, z, 45);
  if (n.d === Infinity) return n;
  const { a, b } = riverLine.segs[n.i];
  return { ...n, w: a.w + (b.w - a.w) * n.t };
}
const trailLines = () => (AREAS.trails.length ? (trailLines.v ||= AREAS.trails.map(line)) : []);
const cliffLine = AREAS.cliffPath.length > 1 ? line(AREAS.cliffPath) : null;
// The locals' side: their round, melted into a band of land along the river's far bank that
// stops where the river reaches the sea. On the island's scale: under 60 is land.
function localsR(x, z, rv) {
  const round = ISLAND_RADIUS + Math.hypot(x - LOC.x, z - LOC.z) - LOC.r;
  if (rv.d === Infinity || rv.side < 0) return round;
  const e = rv.d - rv.w; // metres past the far bank
  const band = ISLAND_RADIUS - 2 * Math.min(e, BAND - e) + 3 * Math.max(0, rv.s - MOUTH_AT);
  return meltK(round, band, 14);
}
// The massif: distance from its spine, and which side of it.
function massifAt(x, z) {
  const { a, b } = MAS, dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
  // `south` is 1 on the side facing the lake and the locals' land, 0 behind, blended across the spine.
  return { d: Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)), south: smooth(0.5 + (dx * (z - a.z) - dz * (x - a.x)) / Math.sqrt(len2) / 8) };
}
// Rock: sheer stepped cliffs over the lake and the locals' land, a gentler flank at the west end
// where the cliff path climbs, and a slope down into the jungle behind. Below sea level outside.
function massifHeight(x, z) {
  const m = massifAt(x, z);
  if (m.d > MAS.r) return -Math.min(3, (m.d - MAS.r) * 0.6);
  const face = 11 + (7 + 10 * smooth((50 - x) / 12) - 11) * m.south;
  const u = Math.min(1, (MAS.r - m.d) / face);
  const hs = MAS.height * u * (1 + 0.06 * noise(x / 9 + 3, z / 9 + 1)) + u * u * 2.2 * noise(x / 21 + 8, z / 21 + 30);
  // Ledges: the rock climbs in steps, with a flat shelf every `ledge` metres of height.
  return hs - (MAS.ledge / (2 * Math.PI)) * Math.sin((2 * Math.PI * hs) / MAS.ledge) * 0.85 + 0.35 * u * noise(x / 3.1, z / 3.1 + 17);
}
const shore = (r) => {
  if (r <= GRASS_RADIUS) return GRASS_HEIGHT;
  if (r <= ISLAND_RADIUS) { const t = (r - GRASS_RADIUS) / (ISLAND_RADIUS - GRASS_RADIUS); return GRASS_HEIGHT * (1 - t * t); }
  const s = Math.min(1, (r - ISLAND_RADIUS) / (SEA_FLOOR_RADIUS - ISLAND_RADIUS)); return SEA_FLOOR_DEPTH * (0.5 * s + 0.5 * s * s);
};
const inNew = (x, z) => x > 14 && x < 215 && z < 12 && z > -200;
// The river's cross-section: a bed too deep to wade in the middle, shallow at the edges, banks rising beyond.
const riverBed = (d, w) => (d < w ? -RIVER_DEPTH * (1 - (d / w) ** 2) ** 0.8 : (d - w) * 0.32);
const lakeBed = (d) => (d < LAKE.r ? -LAKE.depth * (1 - (d / LAKE.r) ** 2) ** 0.6 : (d - LAKE.r) * 0.3);

function newLand(x, z, hOld) {
  const rv = riverAt(x, z), lr = localsR(x, z, rv);
  let h = shore(lr);
  if (lr < GRASS_RADIUS + 4) {
    // Low rolling country, 1 to 3 m, with one broad rise for the village.
    const inland = smooth((GRASS_RADIUS + 4 - lr) / 16);
    h += inland * (0.55 + 0.55 * noise(x / 24 + 51, z / 24 + 7) + 0.2 * noise(x / 8 + 9, z / 8 + 61));
    const v = AREAS.village, dv = Math.hypot(x - v.x, z - v.z);
    h += 0.9 * inland * smooth(1 - (dv - v.r * 0.5) / v.r);
  }
  const hm = massifHeight(x, z);
  h = Math.max(hOld, h, hm);
  // Dig the river and the lake: inside them the bed is set; beside them the banks are trimmed
  // to a gentle slope, except where the rock stands (the cliff drops straight into the lake).
  const rock = smooth((hm - 1.5) / 2);
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  let bed = Infinity, bank = Infinity, sea = 0;
  if (rv.d !== Infinity) {
    sea = smooth((rv.s - MOUTH_AT) / 10); // past the mouth the river is the sea: only ever deepen there
    let p = riverBed(rv.d, rv.w);
    if (rv.d < rv.w) { const ford = smooth(1 - Math.abs(rv.s - FORD_AT) / 2.4); p += (Math.max(p, -0.3) - p) * ford; bed = p; } else bank = p;
  }
  if (dl < LAKE.r) bed = Math.min(bed, lakeBed(dl)); else bank = Math.min(bank, lakeBed(dl));
  if (bed !== Infinity) h = sea > 0 ? Math.min(h, bed) * sea + bed * (1 - sea) : bed;
  else if (bank !== Infinity) h = Math.min(h, bank + rock * 50 + sea * 50);
  // The lookout ledge is levelled, then the cliff path is cut in: a level bed climbing at one steady rate.
  const dk = Math.hypot(x - LOOK.x, z - LOOK.z);
  if (dk < LOOK.r + 2.5) h += (LOOK_TOP - h) * smooth((LOOK.r + 2.5 - dk) / 2.5);
  if (cliffLine) h = cutPath(cliffLine, cliffRun, x, z, h);
  return h;
}
// The cliff path runs from its foot (whatever the ground is there) to the lookout's level top.
let cliffRunCache = null;
function cliffRun() {
  if (!cliffRunCache) {
    const a = AREAS.cliffPath[0];
    cliffRunCache = { h0: Math.max(0.35, heightBeforePath(a.x, a.z)), h1: LOOK_TOP };
  }
  return cliffRunCache;
}
let cutting = false;
function heightBeforePath(x, z) { cutting = true; const h = rawHeight(x, z); cutting = false; return h; }
const PATH_BED = 1.4, PATH_BANK = 2.2;
function cutPath(L, run, x, z, h) {
  if (cutting) return h;
  const n = nearestOn(L, x, z, PATH_BED + PATH_BANK);
  if (n.d >= PATH_BED + PATH_BANK) return h;
  const { h0, h1 } = run(), bedH = h0 + (h1 - h0) * (n.s / L.total);
  return bedH + (h - bedH) * smooth((n.d - PATH_BED) / PATH_BANK);
}

// Where the land is, on the island's scale: under 60 is land, under 48 is grass. The old land
// keeps its numbers exactly; the new land only ever adds to it.
export function landR(x, z) {
  const old = oldLandR(x, z);
  if (!inNew(x, z)) return old;
  const m = massifAt(x, z);
  return Math.min(old, localsR(x, z, riverAt(x, z)), ISLAND_RADIUS + (m.d - MAS.r) * 2.5);
}
// The same, but with the river and the lake counted as inland water, not sea: the sea shader,
// the map and the sound of the surf use this, so the river has no surf and no sea roar.
export function shoreR(x, z) {
  const r = landR(x, z);
  if (!inNew(x, z)) return r;
  const rv = riverAt(x, z), dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  let inl = 44 + 3 * Math.max(0, dl - LAKE.r - 1);
  if (rv.d !== Infinity) inl = Math.min(inl, 44 + 3 * Math.max(0, rv.d - rv.w - 1) + 3 * Math.max(0, rv.s - MOUTH_AT + 4));
  return Math.min(r, inl);
}

// ---- Safe ground: where the camp can see you. Outside it, on jungle land, the warning starts.
// The camp keeps its old rule (a ring 70 m round the middle, on the jungle side); the new places
// are a list of shapes: circles {x, z, r} and lines {line, r}.
const SAFE = [
  { x: LOC.x, z: LOC.z, r: LOC.r + 5 },                     // the locals' land and its beaches
  { line: riverLine, r: 19 },                                // both banks of the river
  { x: LAKE.x, z: LAKE.z, r: LAKE.r + 9 },                   // the lake shore, to the foot of the cliff
  { x: LOOK.x, z: LOOK.z, r: LOOK.r + 3 },                   // the lookout ledge
];
const safeLines = () => (safeLines.v ||= [
  ...trailLines().map((L) => ({ line: L, r: 15 })),         // the riverside path, with room either side
  ...(cliffLine ? [{ line: cliffLine, r: 4 }] : []),         // the cliff path itself, no wider
]);
// How far outside safe ground a spot is (negative inside), and the nearest safe spot to walk to.
export function nearestSafe(x, z) {
  const r0 = Math.hypot(x, z) || 1e-6;
  const camp = wildEq(x, z) < r0 ? r0 - WILD.border : -999;
  let best = { depth: camp, x: (x / r0) * (WILD.border - 1.5), z: (z / r0) * (WILD.border - 1.5) };
  if (camp <= 0 || !inNew(x, z)) return best;
  for (const s of [...SAFE, ...safeLines()]) {
    let cx = s.x, cz = s.z;
    if (s.line) { const n = nearestOn(s.line, x, z, s.r + 40); if (n.d === Infinity) continue; cx = n.x; cz = n.z; }
    const d = Math.hypot(x - cx, z - cz), depth = d - s.r;
    if (depth < best.depth) { const k = Math.max(0, s.r - 1.5) / (d || 1); best = { depth, x: cx + (x - cx) * k, z: cz + (z - cz) * k }; }
  }
  return best;
}
// How many metres past the edge of safe ground a spot is; negative on safe ground.
export const wildDepth = (x, z) => nearestSafe(x, z).depth;
// 0 in camp country and on the locals' land, rising to 1 where the big jungle has taken over.
// It falls away across the river banks, the riverside path, the lake shore and the cliff path.
export function wildness(x, z) {
  const w = oldWildness(x, z);
  if (w <= 0 || !inNew(x, z)) return w;
  const rv = riverAt(x, z);
  let k = smooth((localsR(x, z, rv) - 52) / 10) * smooth((Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.r - 6) / 10);
  if (rv.d !== Infinity) k *= smooth((rv.d - rv.w - 4) / 10);
  for (const L of trailLines()) k *= smooth((nearestOn(L, x, z, 20).d - 5) / 12);
  if (cliffLine) k *= smooth((nearestOn(cliffLine, x, z, 10).d - 3) / 5);
  return w * k * smooth((Math.hypot(x - LOOK.x, z - LOOK.z) - LOOK.r - 2) / 4);
}
// How the new land should be painted: 1 on the locals' side, rock where the massif stands, and
// the distance to the nearest trail. Used by the ground meshes and the map.
export function groundKind(x, z) {
  if (!inNew(x, z)) return null;
  const rv = riverAt(x, z), m = massifHeight(x, z);
  let trail = Infinity;
  for (const L of trailLines()) trail = Math.min(trail, nearestOn(L, x, z, 3).d);
  if (cliffLine) trail = Math.min(trail, nearestOn(cliffLine, x, z, 3).d * 0.75);
  return {
    locals: 1 - smooth((localsR(x, z, rv) - 50) / 8), rock: smooth((m - 1.5) / 2), rockHeight: m,
    river: rv.d === Infinity ? Infinity : rv.d - rv.w, mouth: rv.d === Infinity ? 0 : smooth((rv.s - MOUTH_AT) / 10),
    lake: Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.r, trail,
  };
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

// The lie of the camp and the jungle before anything is dug into it.
function oldHeight(x, z) {
  const r0 = Math.hypot(x, z), eq = wildEq(x, z), r = melt(r0, eq);
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
      h += w * (2.4 + 2.0 * noise(x / 17 + 31, z / 17 + 13) + 0.9 * noise(x / 6 + 5, z / 6 + 77));
      // Far inland the jungle rises into broad hills and ridges.
      const inland = smooth((r0 - 95) / 80) * smooth((GRASS_RADIUS - 8 - eq) / 40);
      if (inland > 0) h += inland * Math.max(0, 10 + 15 * noise(x / 75 + 3, z / 75 + 9) + 6 * noise(x / 27, z / 27 + 4));
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

// The lie of the land before the trails are cut: the camp and jungle, the new land beside it,
// then the river and the lake dug out and the cliff path cut in.
function rawHeight(x, z) {
  const h = oldHeight(x, z);
  return inNew(x, z) ? newLand(x, z, h) : h;
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

let trailRun = null;
const TRAIL_BED = 1.6, TRAIL_BANK = 2.6; // half-width of the level bed, and how far the cut banks reach beyond it

// Ground height. Along the hill trail a level bed is cut into the slope, so the trail is flat
// from side to side, with a bank above it and a fill below.
export function heightAt(x, z) {
  const h = rawHeight(x, z);
  if (Math.hypot(x - HILL.x, z - HILL.z) > HILL.radius + 4) return h; // nowhere near the trail
  const n = nearestOnTrail(x, z);
  if (n.d >= TRAIL_BED + TRAIL_BANK) return h;
  // The bed climbs at one steady rate from the foot of the trail to the top, whatever the
  // hillside does beside it: no sudden steep bits, no dips.
  if (!trailRun) {
    const cum = [0];
    for (let i = 0; i < HILL_TRAIL.length - 1; i++) cum.push(cum[i] + Math.hypot(HILL_TRAIL[i + 1].x - HILL_TRAIL[i].x, HILL_TRAIL[i + 1].z - HILL_TRAIL[i].z));
    const a = HILL_TRAIL[0], b = HILL_TRAIL[HILL_TRAIL.length - 1];
    trailRun = { cum, total: cum[cum.length - 1], h0: rawHeight(a.x, a.z), h1: rawHeight(b.x, b.z) };
  }
  const bed = trailRun.h0 + (trailRun.h1 - trailRun.h0) * ((trailRun.cum[n.i] + n.s) / trailRun.total);
  return bed + (h - bed) * smooth((n.d - TRAIL_BED) / TRAIL_BANK);
}
