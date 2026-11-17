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
// Two strips melted into the round so the hillside has room: the valley's north side, right up to the
// foot of the cliffs, and the village's south foot (filling a notch in the coast). Each is a capsule a..b;
// on the island's scale it reads k0 + k1 * (metres from the capsule's line).
const FILL = [{ a: { x: 80, z: -116 }, b: { x: 136, z: -116 }, k0: 36, k1: 1.5 }, { a: { x: 80, z: -30 }, b: { x: 118, z: -28 }, k0: 36, k1: 2 }];
function capsuleD(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}
// The fishing beach (AREAS.waterfront): on the island's scale the measure runs from 48 (the grass line, which
// wanders a little) to 60 (the waterline) over `depth` metres, so the sand is wide and falls gently to the sea and
// on out into broad shallows. Past the beach's ends the measure climbs away, so the shore curves back in to the
// old coast like the arms of a bay.
const WF = AREAS.waterfront, WF_K = (ISLAND_RADIUS - GRASS_RADIUS) / WF.depth;
export function beachFrame(x, z) {
  const dx = x - WF.o.x, dz = z - WF.o.z;
  return { s: dx * WF.ax + dz * WF.az, d: dx * WF.nx + dz * WF.nz };
}
// Where the grass gives way to sand: metres seaward of d = 0 (ragged, never a straight edge).
const grassLine = (s) => 1.3 * noise(s / 6.5 + 3.1, 11.7) + 0.55 * noise(s / 2.2 + 9.4, 5.3);
// 1 on the fishing beach's sand, 0 on the grass above it: a soft, ragged edge a metre or two wide.
export function beachSand(x, z) {
  const { s, d } = beachFrame(x, z);
  if (s < WF.s0 - 30 || s > WF.s1 + 30 || d < -12 || d > 80) return 0;
  const out = Math.max(0, WF.s0 - s, s - WF.s1);
  return smooth((d - grassLine(s) + 0.5 + 0.45 * noise(x * 0.9 + 3, z * 0.9 + 8)) / 1.6) * (1 - smooth((out - 4) / 8));
}
function beachR(x, z) {
  const { s, d } = beachFrame(x, z);
  if (s < WF.s0 - 40 || s > WF.s1 + 40 || d < -25 || d > 80) return Infinity;
  const out = Math.max(0, WF.s0 - s, s - WF.s1);
  return GRASS_RADIUS + (d - grassLine(s)) * WF_K + out * (0.35 + out * 0.035);
}
function localsR(x, z, rv) {
  let round = ISLAND_RADIUS + Math.hypot(x - LOC.x, z - LOC.z) - LOC.r;
  for (const f of FILL) round = meltK(round, f.k0 + f.k1 * capsuleD(x, z, f.a, f.b), 10);
  const br = beachR(x, z);
  if (br < round + 4) round = meltK(round, br, 3);
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
// ---- A natural coastline --------------------------------------------------------------------
// The coast is where the island's scale reads 60. That measure is reshaped near the shore, in layers:
//   1. a broad, low noise plus a few explicit bays, added across the beach band (the grass line stays put);
//   2. narrow coves carved into the beach;
//   3. headlands and a sand spit melted onto the land: each is a spine with, at every vertex, the measure
//      on the spine `t` and the half width `hw` where it meets the sea; past that it drops away at `k` per metre
//      (steep for rock, gentle for sand);
//   4. small rock islets, too far out and too deep round to wade to.
// None of it reaches the camp core (inside 48 m of the middle), and all of it fades to nothing round
// everything fixed on the shore: the dock, pier, ferry and the sea it sails out over, the beach camp,
// the flying fox's landing, the river and its mouth, the bridge, the lake and the jetty.
const COAST_KEEP = [
  { a: { x: Math.cos(0.3142) * 50, z: Math.sin(0.3142) * 50 }, b: { x: Math.cos(0.3142) * 112, z: Math.sin(0.3142) * 112 }, near: 16, fade: 12 }, // layout.js DOCK (18 deg, radial), harbour.js ferry
  { a: { x: -32.63, z: 41.77 }, near: 10, fade: 8 },  // layout.js CAMPFIRE (128 deg, 53 m): the beach camp, its tents and props
  { a: { x: 36.6, z: 36.5 }, near: 5, fade: 8 },      // layout.js ZIPLINE.bottom: the flying fox landing
  { a: AREAS.waterfront.at(AREAS.waterfront.s0, 12), b: AREAS.waterfront.at(AREAS.waterfront.s1, 12), near: 26, fade: 10 }, // the fishing beach (beachR below)
];
const COAST_JETTY = { a: { x: 150, z: -62 }, b: { x: 196, z: -62 } };
const COAST_NEAR = 14, COAST_FADE = 12;
function coastKeep(x, z) {
  let t = Infinity;
  for (const k of COAST_KEEP) t = Math.min(t, ((k.b ? capsuleD(x, z, k.a, k.b) : Math.hypot(x - k.a.x, z - k.a.z)) - k.near) / k.fade);
  if (t <= 0) return 0;
  if (inNew(x, z) || (x > 14 && x < 215 && z < 40 && z > -200)) {
    let d = Math.min(capsuleD(x, z, COAST_JETTY.a, COAST_JETTY.b), capsuleD(x, z, AREAS.bridge.a, AREAS.bridge.b),
      Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.r, Math.hypot(x - AREAS.riverMouth.x, z - AREAS.riverMouth.z));
    const rv = nearestOn(riverLine, x, z, 45);
    if (rv.d !== Infinity) { const { a, b } = riverLine.segs[rv.i]; d = Math.min(d, rv.d - (a.w + (b.w - a.w) * rv.t)); }
    t = Math.min(t, (d - COAST_NEAR) / COAST_FADE);
  }
  return smooth(t);
}
// Broad bays: the beach band is pushed inland by up to `amp` on the island's scale, in a round `rad` wide.
// `deep` bays (away from camp) may cut into the grass line as well.
const BAYS = [
  { x: 15, z: 63, rad: 22, amp: 10 },                 // Long Bay, the camp's south beach between two points
  { x: -112, z: 44, rad: 34, amp: 16, deep: true },   // Palm Bay, the jungle's south coast
  { x: 104, z: -226, rad: 26, amp: 18, deep: true },  // the jungle's north-east coast, between two points
  { x: 98, z: -180, rad: 13, amp: 9, deep: true },    // a small bay under the massif's north side
  { x: 108, z: -4, rad: 16, amp: 6 },                 // the locals' south beach
  { x: 175, z: -37, rad: 16, amp: 7 },                // the locals' east beach, south of the jetty
];
// Headlands (`rock` ones get boulders, rock-coloured ground and narrow shallows) and the sand spit.
const lobe = (rock, k, pts) => ({ rock, k, ...line(pts.map(([x, z, t, hw]) => ({ x, z, t, hw }))) });
const LOBES = [
  lobe(false, 1.4, [[29, 45, 49, 12], [35, 55, 52, 8.5], [39, 63, 55, 4.5], [39.5, 67, 57.5, 2.5]]),   // Sandy Point, past the flying fox landing
  lobe(true, 2, [[-4, 48, 49, 17], [-8, 62, 51, 12], [-6, 72, 53, 8], [-1, 79, 55.5, 4.5]]),              // Gull Point, south of camp
  lobe(true, 2, [[-64, 4, 48, 18], [-71, 20, 50, 14], [-75, 31, 52.5, 9], [-73, 39, 55.5, 4.5]]),             // West Rocks, where camp meets jungle
  { ...lobe(false, 1.2, [[-45, 28, 52, 8], [-52, 39, 55, 5], [-56, 48, 56.5, 3.5], [-55, 56, 58.5, 2.2]]), spit: true }, // the sand spit off the beach camp's bay
  lobe(true, 2, [[-148, 36, 46, 20], [-156, 55, 50, 13], [-160, 68, 53, 8], [-157, 76, 56, 4]]),           // Palm Bay's west point
  lobe(true, 2, [[78, -190, 46, 18], [96, -196, 50, 12], [110, -200, 53, 8], [119, -203, 56, 4]]),         // the north-east point
  lobe(false, 1.5, [[82, -262, 46, 16], [98, -266, 51, 10], [109, -268, 55, 5], [115, -268, 58, 2.5]]),    // a sandy point further north
  lobe(true, 2, [[138, -30, 46, 15], [151, -19, 50, 11], [160, -11, 53.5, 7], [166, -5, 56, 3.5]]),        // the locals' south-east point
  lobe(true, 2, [[158, -90, 46, 15], [173, -96, 50, 11], [183, -99, 53.5, 7], [189.5, -101, 56, 3.5]]),    // the point north of the jetty
];
const LOBE_REACH = 22, SPIT = LOBES.find((f) => f.spit);
// Narrow coves, from the sea in: `t` is the measure on the cove's line (over 60 is water), `k` how fast it rises to the banks.
const COVES = [
  { k: 1.4, ...line([{ x: -18.5, z: 67, t: 66 }, { x: -15.5, z: 56.5, t: 63.5 }]) },     // beside Gull Point
  { k: 1.3, ...line([{ x: 104, z: -246, t: 67 }, { x: 92, z: -243, t: 64 }, { x: 84, z: -238, t: 62 }]) }, // the north-east coast
  { k: 1.3, ...line([{ x: 166, z: -124, t: 66 }, { x: 156, z: -121, t: 63.5 }]) },        // under the massif's east end
];
// Islets: rocks a few metres across off the points.
export const COAST_ISLETS = [
  { x: -1, z: 90, rad: 2.6 }, { x: -11.5, z: 88.5, rad: 1.7 }, // off Gull Point
  { x: -81, z: 47.5, rad: 2.2 },                                // off West Rocks
  { x: -151, z: 86, rad: 2.5 },                                 // off Palm Bay's west point
  { x: 129, z: -206, rad: 2.4 },                                // off the north-east point
  { x: 174, z: 4, rad: 2.0 },                                   // off the locals' south-east point
];
const lobeAt = (f, x, z) => {
  const n = nearestOn(f, x, z, LOBE_REACH);
  if (n.d === Infinity) return null;
  const { a, b } = f.segs[n.i];
  return { d: n.d, s: n.s, t: a.t + (b.t - a.t) * n.t, hw: a.hw + (b.hw - a.hw) * n.t };
};
function lobeR(f, x, z) {
  const l = lobeAt(f, x, z);
  if (!l) return Infinity;
  const r = l.d < l.hw ? l.t + (ISLAND_RADIUS - l.t) * (l.d / l.hw) ** 1.5 : ISLAND_RADIUS + f.k * (l.d - l.hw);
  return r + 1.3 * noise(x / 4.5 + 13, z / 4.5 + 71) + 0.6 * noise(x / 1.8 + 5, z / 1.8 + 3);
}
const isletR = (i, x, z) => ISLAND_RADIUS + 3 * (Math.hypot(x - i.x, z - i.z) - i.rad) + 0.7 * noise(x / 1.6 + 41, z / 1.6 + 7);
// The coast measure at (x, z) where the measure before reshaping reads r0.
function coastR(x, z, r0) {
  if (r0 < 42 || r0 > 140) return r0;
  const keep = coastKeep(x, z);
  if (keep <= 0) return r0;
  // 1. Noise and bays across the beach band, fading far out to sea and far from the play area.
  let r = r0;
  const band = smooth((r0 - 49) / 7) * (1 - smooth((r0 - 76) / 14));
  if (band > 0) {
    const far = 1 - smooth((Math.hypot(x - 20, z + 70) - 200) / 40);
    let s = far * (6 * noise(x / 46 + 101, z / 46 + 17) + 3 * noise(x / 17 + 7, z / 17 + 211) + 1.1 * noise(x / 6 + 55, z / 6 + 9));
    for (const b of BAYS) { const d = Math.hypot(x - b.x, z - b.z); if (d < b.rad && !b.deep) s += b.amp * smooth(1 - d / b.rad); }
    r += band * s;
  }
  const deepBand = smooth((r0 - 34) / 10) * (1 - smooth((r0 - 80) / 14));
  if (deepBand > 0) for (const b of BAYS) { const d = Math.hypot(x - b.x, z - b.z); if (d < b.rad && b.deep) r += deepBand * b.amp * smooth(1 - d / b.rad); }
  // 2. Coves, carved only where the beach is (never into the grass line).
  const cw = smooth((r0 - 50) / 5);
  if (cw > 0) for (const c of COVES) {
    const n = nearestOn(c, x, z, 12);
    if (n.d === Infinity) continue;
    const { a, b } = c.segs[n.i], rc = a.t + (b.t - a.t) * n.t - c.k * n.d;
    if (rc > r) r += cw * (rc - r);
  }
  // 3. Headlands and the spit, melted on so they grow out of the land with no crease.
  for (const f of LOBES) { const rl = lobeR(f, x, z); if (rl < r + 6) r = meltK(r, rl, 6); }
  // 4. Islets.
  for (const i of COAST_ISLETS) if (Math.abs(x - i.x) < 14 && Math.abs(z - i.z) < 14) r = Math.min(r, isletR(i, x, z));
  const core = smooth((Math.hypot(x, z) - 48) / 4); // the camp core never moves
  return r0 + (r - r0) * keep * core;
}
// How rocky the shore is at (x, z): 1 on the rocky points' outer parts and on the islets, 0 on sand.
// `reach` widens it (the sea shader uses a wide one so the shallows narrow round rocky points).
export function coastRock(x, z, reach = 0) {
  let k = 0;
  for (const f of LOBES) {
    if (!f.rock) continue;
    const n = nearestOn(f, x, z, 6 + reach + 16);
    if (n.d === Infinity) continue;
    const { a, b } = f.segs[n.i], hw = a.hw + (b.hw - a.hw) * n.t;
    k = Math.max(k, smooth((hw + 2.5 + reach - n.d) / (4 + reach * 0.5)) * smooth((n.s / f.total - 0.12) / 0.3));
  }
  for (const i of COAST_ISLETS) k = Math.max(k, smooth((i.rad + 3 + reach - Math.hypot(x - i.x, z - i.z)) / (2 + reach * 0.5)));
  if (k <= 0 || reach > 0) return k;
  return Math.min(1, k * (0.8 + 0.35 * noise(x / 5 + 7, z / 5 + 19)));
}
// How broad the shallows are, 0 (a narrow fringe round rock) to 1 (wide turquoise flats in a sandy bay).
export function coastShallow(x, z) {
  let bay = 0;
  for (const b of BAYS) { const d = Math.hypot(x - b.x, z - b.z); bay = Math.max(bay, smooth(1.4 - d / b.rad)); }
  const spit = lobeAt(SPIT, x, z), sp = spit ? smooth(1 - spit.d / 20) : 0;
  return Math.min(1, Math.max(0, 0.5 + 0.45 * Math.max(bay, sp) - 0.75 * coastRock(x, z, 10)));
}
// The rock dressing and the ground mesh tiles want to know where the rocky points and islets are.
export const coastFeatures = () => ({ lobes: LOBES.filter((f) => f.rock).map((f) => ({ pts: f.pts, box: f.box })), islets: COAST_ISLETS });
// Rocky ground stands a little proud of the beach: knolls of rock that end at the waterline.
function rockLift(x, z) {
  const k = coastRock(x, z);
  if (k <= 0) return 0;
  const r = landR(x, z);
  return k * 1.5 * smooth((59.4 - r) / 4.5) * (0.7 + 0.45 * noise(x / 3.3 + 2, z / 3.3 + 61));
}
// How much the coast measure moves at (x, z), where the unshifted measure reads r.
const coastShiftAt = (x, z, r) => coastR(x, z, r) - r;
const landR0 = (x, z) => {
  const old = oldLandR(x, z);
  if (!inNew(x, z)) return old;
  const m = massifAt(x, z);
  return Math.min(old, localsR(x, z, riverAt(x, z)), ISLAND_RADIUS + (m.d - MAS.r) * 2.5);
};
// The shift itself (metres on the island's scale), for the sea shader's baked map.
export const coastShift = (x, z) => coastShiftAt(x, z, landR0(x, z));

const shore = (r) => {
  if (r <= GRASS_RADIUS) return GRASS_HEIGHT;
  if (r <= ISLAND_RADIUS) { const t = (r - GRASS_RADIUS) / (ISLAND_RADIUS - GRASS_RADIUS); return GRASS_HEIGHT * (1 - t * t); }
  const s = Math.min(1, (r - ISLAND_RADIUS) / (SEA_FLOOR_RADIUS - ISLAND_RADIUS)); return SEA_FLOOR_DEPTH * (0.5 * s + 0.5 * s * s);
};
const inNew = (x, z) => x > 14 && x < 215 && z < (x > 80 ? 40 : 12) && z > -200; // east of x = 80 it reaches further south, under the fishing beach's shallows
// The river's cross-section: a bed too deep to wade in the middle, shallow at the edges, banks rising beyond.
const riverBed = (d, w) => (d < w ? -RIVER_DEPTH * (1 - (d / w) ** 2) ** 0.8 : (d - w) * 0.32);
const lakeBed = (d) => (d < LAKE.r ? -LAKE.depth * (1 - (d / LAKE.r) ** 2) ** 0.6 : (d - LAKE.r) * 0.3);


// ---- The locals' hillside ------------------------------------------------------------------
// The locals' land is shaped from the plan in AREAS: a spur rising from the bridge with the
// village's terraces cut into it, a broad farm valley north of it with a stream running west to
// the river, and a wooded ridge curving from the top of the village round to the cliffs.
const VF = AREAS.villageFrame, TER = AREAS.terraces, STEPS = AREAS.steps, OLD_VILLAGE = { x: 92, z: -42, r: 18 };
// A spot in the village frame: u uphill from the bridge, v across, ue along the bowed terrace lines.
export function villageUV(x, z) {
  const dx = x - VF.o.x, dz = z - VF.o.z, u = dx * VF.ux + dz * VF.uz, v = dx * VF.vx + dz * VF.vz;
  return { u, v, ue: u - VF.bow * (v - VF.vc) ** 2 };
}
// Piecewise-linear lookup in a table of [t, value] rows.
function lerpTable(tab, t) {
  if (t <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (t <= tab[i][0]) { const [a, va] = tab[i - 1], [b, vb] = tab[i]; return va + (vb - va) * (t - a) / (b - a); }
  return tab[tab.length - 1][1];
}
// The spur's natural height along its crest: it passes each terrace's level half-way along it.
const SPUR = [[-6, 0.9], [0, 1.0], ...TER.map((t) => [(t.u0 + t.u1) / 2, t.y]), [66, 5.9], [80, 7]];
const SPUR_V0 = -23, SPUR_V1 = 22; // the spur's broad top, across (the terraces and the ramp lane); beyond it the flanks fall away
const streamLine = line(AREAS.stream), ridgeLine = line(AREAS.ridge), ridgeTrailLine = line(AREAS.ridgeTrail);
const STREAM_TOP = 2.35, STREAM_END = -0.15, STREAM_DEPTH = 0.36; // the bed at the spring and at the river; how far it is sunk
const streamBed = (s) => STREAM_TOP + (STREAM_END - STREAM_TOP) * Math.min(1, s / streamLine.total);
const ridgeRun = () => ({ h0: TER[TER.length - 1].y, h1: AREAS.clearing.y });
const pathLines = Object.entries(AREAS.paths).map(([name, pts]) => ({ name, ...line(pts) }));

// The land before the village's terraces: low rolling country, rising gently east toward the ridge
// and north toward the cliffs, with a shallow trough down the middle of the valley for the stream.
function localsBase(x, z, lr) {
  const inland = smooth((GRASS_RADIUS + 4 - lr) / 16);
  const n = nearestOn(streamLine, x, z, 26), calm = 0.35 + 0.65 * smooth((n.d - 18) / 14); // the valley rolls less, so fields fit
  let b = 1.2 + 1.5 * smooth((x - 70) / 70) + calm * (0.42 * noise(x / 26 + 51, z / 26 + 7) + 0.16 * noise(x / 9 + 9, z / 9 + 61));
  b += 2.2 * smooth((-z - 100) / 22) * smooth((x - 74) / 12); // foothills under the cliffs
  if (n.d < 26) b += (streamBed(n.s) + STREAM_DEPTH + 0.05 * noise(x / 4, z / 4) - b) * (1 - smooth((n.d - 2.5) / 20));
  return shore(lr) + inland * (b - GRASS_HEIGHT);
}
// The ridge's rise above the land: rounded on top, its flanks reaching `hw` either side of the crest.
function ridgeRise(x, z, lr) {
  const n = nearestOn(ridgeLine, x, z, 26);
  if (n.d === Infinity) return 0;
  const { a, b } = ridgeLine.segs[n.i], hw = a.hw + (b.hw - a.hw) * n.t, rise = a.rise + (b.rise - a.rise) * n.t;
  const t = (n.d + 2.2 * noise(x / 11 + 3, z / 11 + 71)) / hw;
  return t >= 1 ? 0 : rise * (1 + 0.1 * noise(x / 17, z / 17 + 5)) * (1 - smooth(t)) * smooth((57 - lr) / 9);
}
// The face up from terrace k to k+1 at ue: 0 below, 1 above. At steps it is an even slope `run` long.
// Past the south ends of the walls (in the ramp lane) it is a ramp RAMP_HALF * 2 long instead.
function faceShape(k, v) {
  const lo = TER[k], hi = TER[k + 1];
  let corr = 0;
  for (const s of STEPS) if (s.from === lo.id) corr = Math.max(corr, smooth((s.width / 2 + 0.35 - Math.abs(v - s.v)) / 0.35));
  const lane = smooth((v - Math.min(lo.v1, hi.v1) - 0.2) / 1.0);
  let half = FACE_HALF + (STEPS[0].run / 2 - FACE_HALF) * corr;
  half += (RAMP_HALF - half) * lane;
  return { c: (lo.u1 + hi.u0) / 2, half, even: Math.max(corr, lane), corr, lane };
}
function facePart(k, ue, v) {
  const f = faceShape(k, v), t = Math.min(1, Math.max(0, (ue - (f.c - f.half)) / (2 * f.half)));
  return smooth(t) + (t - smooth(t)) * f.even;
}
const FACE_HALF = 0.4; // a face climbs its 1.3 m over 0.8 m of ue, centred between the terraces
const LANE = AREAS.ramp.zone, RAMP_HALF = AREAS.ramp.run / 2; // the ramp lane beyond the terraces' south ends
// For painting: 1 on a terrace face (a band 2.6 m wide round it, so the colour does not alias on the
// ground mesh), 0 elsewhere; and 1 on the slope of a flight of steps.
export function terraceFaceAt(ue, v) {
  let face = 0, step = 0;
  for (let k = 0; k < TER.length - 1; k++) {
    const lo = TER[k], hi = TER[k + 1], c = (lo.u1 + hi.u0) / 2, d = Math.abs(ue - c);
    if (d > 1.8) continue;
    const { corr, lane } = faceShape(k, v), both = Math.min(terraceSide(lo, v), terraceSide(hi, v)), band = smooth((1.6 - d) / 1.1);
    face = Math.max(face, band * both * (1 - corr) * (1 - lane));
    step = Math.max(step, smooth((STEPS[0].run / 2 + 0.2 - d) / 0.4) * corr * both);
  }
  return { face, step };
}
// How much each terrace holds the ground at a spot (they never overlap), and the spur's own share.
// Level from v0 to v1 and on through the ramp lane beyond v1; soft rims 3.5 m wide on the north, 1.5 m past the lane.
const terraceSide = (t, v) => smooth((v - t.v0 + 3.5) / 3.5) * smooth((t.v1 + LANE + 1.5 - v) / 1.5);
function terraceWeights(ue, v, out) {
  for (let k = 0; k < TER.length; k++) {
    const t = TER[k];
    const below = k === 0 ? smooth((ue - t.u0 + 4) / 4) : facePart(k - 1, ue, v);
    const above = k === TER.length - 1 ? 1 - smooth((ue - t.u1) / 5) : 1 - facePart(k, ue, v);
    out[k] = Math.min(below, above) * terraceSide(t, v);
  }
  return out;
}
const TW = new Array(TER.length).fill(0);
function spurShare(ue, v) {
  // The flanks fall at a nearly even rate (half linear, half eased), so no stretch of them is steep.
  const fall = (t) => { const c = Math.min(1, Math.max(0, t)); return 0.5 * (c + smooth(c)); };
  const side = v < SPUR_V0 ? 1 - fall((SPUR_V0 - v) / 22) : v > SPUR_V1 ? 1 - fall((v - SPUR_V1) / 24) : 1;
  return side * smooth((ue + 10) / 8) * (1 - smooth((ue - 64) / 14));
}
// The paddies' levels: the ground at each field's middle before it is levelled, worked out once.
let paddyLevels = null;
function paddyFieldsReady() {
  if (paddyLevels) return paddyLevels;
  paddyLevels = [];
  const fields = AREAS.paddyFields;
  for (const f of fields) {
    const lr = localsR(f.x, f.z, riverAt(f.x, f.z));
    f.y = +localsHeight(f.x, f.z, lr, riverAt(f.x, f.z), true).toFixed(2);
    paddyLevels.push({ ...f, c: Math.cos(f.rot), s: Math.sin(f.rot) });
  }
  return paddyLevels;
}
// 1 inside a paddy field (with a soft 0.7 m rim), and which one.
function paddyAt(x, z) {
  let best = 0, which = null;
  for (const f of paddyFieldsReady()) {
    const dx = x - f.x, dz = z - f.z;
    if (Math.abs(dx) > 9 || Math.abs(dz) > 9) continue;
    // rot is a heading: the field's long side (hw) runs across it, its short side (hd) along it.
    const across = dx * f.c - dz * f.s, along = dx * f.s + dz * f.c;
    const w = smooth((f.hw + 0.7 - Math.abs(across)) / 0.7) * smooth((f.hd + 0.7 - Math.abs(along)) / 0.7);
    if (w > best) { best = w; which = f; }
  }
  return { w: best, f: which };
}

// The fish market's floor: a level rectangle in the beach frame with a soft 2.5 m rim. Its level is the
// ground's own average over it (worked out once), so it neither towers over nor sinks into the beach.
let marketLevel = null;
export function marketAt(x, z) {
  const M = WF.market, { s, d } = beachFrame(x, z);
  return smooth((M.hw + 2.5 - Math.abs(s - M.s)) / 2.5) * smooth((M.hd + 3.5 - Math.abs(d - M.d)) / 3.5);
}
function marketY() {
  if (marketLevel !== null) return marketLevel;
  const M = WF.market; let sum = 0, n = 0;
  for (let i = -4; i <= 4; i++) for (let j = -2; j <= 2; j++) {
    const p = WF.at(M.s + (i / 4) * M.hw, M.d + (j / 2) * M.hd), rv = riverAt(p.x, p.z);
    sum += localsHeight(p.x, p.z, localsR(p.x, p.z, rv), rv, true); n++;
  }
  marketLevel = +(sum / n).toFixed(2); WF.market.y = marketLevel;
  return marketLevel;
}
// The locals' land at (x, z). `beforePaddies` leaves out the paddy levelling (and the market's, used to set their levels).
function localsHeight(x, z, lr, rv, beforePaddies = false) {
  // The land as it was before the hillside, kept exactly along the river so its banks do not move.
  let old = shore(lr);
  if (lr < GRASS_RADIUS + 4) {
    const inland = smooth((GRASS_RADIUS + 4 - lr) / 16), dv = Math.hypot(x - OLD_VILLAGE.x, z - OLD_VILLAGE.z);
    old += inland * (0.55 + 0.55 * noise(x / 24 + 51, z / 24 + 7) + 0.2 * noise(x / 8 + 9, z / 8 + 61));
    old += 0.9 * inland * smooth(1 - (dv - OLD_VILLAGE.r * 0.5) / OLD_VILLAGE.r);
  }
  const keep = rv.d === Infinity || rv.side < 0 ? 0 : 1 - smooth((rv.d - rv.w - 3) / 5);
  if (keep >= 1) return old;
  const base = localsBase(x, z, lr);
  const sd = nearestOn(streamLine, x, z, 20).d; // the stream's valley head cuts back into the ridge's foot
  let h = base + ridgeRise(x, z, lr) * smooth((sd - 2) / 12);
  // The spur the village stands on, and the terraces cut into it.
  const { v, ue } = villageUV(x, z);
  if (ue > -12 && ue < 80 && v > -50 && v < 40) {
    const share = spurShare(ue, v) * smooth((54 - lr) / 8) * smooth((sd - 5) / 15);
    const natural = Math.max(h, base + (lerpTable(SPUR, ue) - base) * share);
    h = natural;
    if (ue > 0 && ue < 66 && v > SPUR_V0 - 5 && v < SPUR_V1 + 2) {
      terraceWeights(ue, v, TW);
      for (let k = 0; k < TER.length; k++) h += TW[k] * (TER[k].y - natural);
    }
  }
  if (!beforePaddies) {
    const p = paddyAt(x, z);
    if (p.w > 0) h += (p.f.y - h) * p.w;
    // The clearing on the ridge: a level lawn with a view.
    const C = AREAS.clearing, dc = Math.hypot(x - C.x, z - C.z);
    if (dc < C.r + 3.5) h += (C.y - h) * smooth((C.r + 3.5 - dc) / 3.5);
    const mk = Math.abs(x - WF.market.x) < 22 && Math.abs(z - WF.market.z) < 22 ? marketAt(x, z) : 0;
    if (mk > 0) h += (marketY() - h) * mk;
  }
  // The stream: a channel 2.8 m across, sunk into the valley floor, from the spring down to the river.
  const n = nearestOn(streamLine, x, z, 6);
  if (n.d < 6) {
    const bed = streamBed(n.s) + 0.03 * noise(x * 1.3, z * 1.3), sp = Math.hypot(x - AREAS.spring.x, z - AREAS.spring.z);
    h = Math.min(h, bed + Math.max(0, n.d - 0.8) * 0.6);
    if (sp < AREAS.spring.r + 2) h = Math.min(h, bed - 0.05 + Math.max(0, sp - AREAS.spring.r) * 0.5); // the spring pool
  }
  return old + (h - old) * (1 - keep);
}

function newLand(x, z, hOld, shift) {
  const rv = riverAt(x, z), lr = localsR(x, z, rv) + shift;
  let h = lr < ISLAND_RADIUS + 2 ? localsHeight(x, z, lr, rv) : shore(lr);
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
  h = cutPath(ridgeTrailLine, ridgeRun, x, z, h);
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
  const r = landR0(x, z);
  return coastR(x, z, r);
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
  if (inNew(x, z)) { const f = ridgeForest(x, z); if (f.depth > 0) return f; } // the wood on the ridge is wild ground
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
  if (!inNew(x, z)) return w;
  const f = smooth((ridgeForest(x, z).depth + 1) / 5); // the ridge's wood
  if (w <= 0) return f;
  return Math.max(f, wildnessNew(x, z, w));
}
function wildnessNew(x, z, w) {
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
  // The hillside: the paths (metres to the nearest), the stream (metres from its middle), the paddies,
  // the ridge's wood (metres inside it), and how much a terrace holds the ground here.
  let path = Infinity;
  for (const L of pathLines) path = Math.min(path, nearestOn(L, x, z, 4).d);
  const st = nearestOn(streamLine, x, z, 8), { v, ue } = villageUV(x, z);
  let terrace = 0, face = 0, step = 0;
  if (ue > 0 && ue < 66 && v > -28 && v < 24) { terraceWeights(ue, v, TW); for (const w of TW) terrace += w; ({ face, step } = terraceFaceAt(ue, v)); }
  return {
    locals: 1 - smooth((localsR(x, z, rv) - 50) / 8), rock: smooth((m - 1.5) / 2), rockHeight: m,
    river: rv.d === Infinity ? Infinity : rv.d - rv.w, mouth: rv.d === Infinity ? 0 : smooth((rv.s - MOUTH_AT) / 10),
    lake: Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.r,
    trail: Math.min(trail, path), oldTrail: trail, path,
    stream: st.d, streamS: st.s, spring: Math.hypot(x - AREAS.spring.x, z - AREAS.spring.z) - AREAS.spring.r,
    paddy: paddyAt(x, z).w, forest: ridgeForest(x, z).depth, terrace, face, step,
    clearing: Math.hypot(x - AREAS.clearing.x, z - AREAS.clearing.z) - AREAS.clearing.r,
    beach: beachSand(x, z), market: marketAt(x, z),
  };
}

// ---- The ridge's wood: wild ground (the ordinary warning) except on the trail, the clearing, the
// spring and the paths. `depth` is metres inside it (negative outside); x, z the nearest safe spot.
const FOREST_EDGE = 0.62; // the wood covers the ridge out to this share of its half width
export function ridgeForest(x, z) {
  const n = nearestOn(ridgeLine, x, z, 20);
  if (n.d === Infinity) return { depth: -99, x, z };
  const { a, b } = ridgeLine.segs[n.i], hw = (a.hw + (b.hw - a.hw) * n.t) * FOREST_EDGE;
  if (n.d > hw) return { depth: hw - n.d, x, z };
  const k = (hw + 1.5) / (n.d || 1e-6);
  let best = { depth: hw - n.d, x: n.x + (x - n.x) * k, z: n.z + (z - n.z) * k };
  const consider = (depth, tx, tz) => { if (depth < best.depth) best = { depth, x: tx, z: tz }; };
  const { ue } = villageUV(x, z);
  if (ue < 70) consider(ue - 66, x - VF.ux * (ue - 64), z - VF.uz * (ue - 64)); // the village
  const t = nearestOn(ridgeTrailLine, x, z, 30); consider(t.d - 3.5, t.x, t.z);
  for (const c of [{ ...AREAS.clearing, r: AREAS.clearing.r + 2.5 }, { ...AREAS.spring, r: AREAS.spring.r + 3.5 }]) consider(Math.hypot(x - c.x, z - c.z) - c.r, c.x, c.z);
  for (const L of pathLines) { const p = nearestOn(L, x, z, 10); consider(p.d - 3, p.x, p.z); }
  return best;
}

// ---- Terrace faces cannot be walked up (or down): a move inside the village onto ground steeper
// than 1 in 1 that is steeper than where you stand is refused. Steps are an even slope of about 1 in 2.
const FACE_SLOPE = 1;
function slopeAt(x, z, groundAt) {
  const e = 0.2;
  return Math.hypot(groundAt(x + e, z) - groundAt(x - e, z), groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
}
export function onTerraceFace(prev, next, groundAt = heightAt) {
  const { ue, v } = villageUV(next.x, next.z);
  if (ue < 2 || ue > 68 || v < -29 || v > 25) return false;
  const s1 = slopeAt(next.x, next.z, groundAt);
  return s1 > FACE_SLOPE && s1 > slopeAt(prev.x, prev.z, groundAt) + 1e-3;
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
function oldHeight(x, z, shift) {
  // The coast's reshaping moves the jungle's measure too, so a bay cut into the jungle is not filled in again below.
  const r0 = Math.hypot(x, z), eq = wildEq(x, z) + shift, rm = melt(r0, eq - shift), r = rm + shift;
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
  const r0 = landR0(x, z), shift = coastR(x, z, r0) - r0;
  const h = oldHeight(x, z, shift);
  return (inNew(x, z) ? newLand(x, z, h, shift) : h) + rockLift(x, z);
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
  const shallowEnough = (x, z) => groundAt(x, z) >= -MAX_WADE_DEPTH && !onTerraceFace(prev, { x, z }, groundAt);
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
