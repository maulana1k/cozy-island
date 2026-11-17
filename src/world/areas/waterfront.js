// INTERNAL. The fishing waterfront (docs/superpowers/specs/2026-11-17-fishing-waterfront-design.md), stage 1: the
// place. Built and updated from src/world/areas/hamlet.js (so main.js's AREA_LIST is untouched). Everything stands in
// the beach frame of AREAS.waterfront (src/config.js): `s` metres east along the coast, `d` metres out to sea from
// the grass line; the waterline is at d = 20, +0.5 m of sea reaches d = 10, -0.5 m reaches d = 27.
//
// - The fish market on the level pad above the east half (s 3.5..26.5, d -11..0): six stalls in two rows on an
//   aisle along d = -5.5, a gap between the second and third pair as the way down to the sand, the entrance arch at
//   the west end, two poles at the east end, a rope of lanterns and bunting down the aisle, ground mats, ice and
//   crates at the east end, a gravel floor with a trodden aisle.
// - The fishermen's yard on the west half: Old Darto's hut on the grass line, the thatched shelter, two net racks,
//   a hull on trestles, an oar rack, a salt-fish rack, piles of crates, buoys and baskets, rope coils.
// - The boat beach: seven painted jukung on log rollers at d 4.5..7.5 (two of them ready to launch at d 7), drag
//   tracks to the water, anchors and floats, a net spread for mending.
// - The water: Darto's new jetty in front of his hut (deck 1.05 m, above high tide; piles down to the bed), the tide
//   board beside it, the tide stones at s -18..-12, d 22..26, three moored boats at d 39..43 and three far out.
//
// Cost: the market, the yard and the beach are each ONE welded vertex-coloured mesh (baked AO per piece); crates,
// plastic crates, buoys and baskets of fish are four InstancedMeshes; each moored boat is one mesh moved per frame
// (a transform, no vertex work); the far boats are one mesh. Lantern glass glows through the village's night glow.
//
// Tide-ready: WATERFRONT.setSeaLevel(h) moves the moored and far boats with the sea (M2b); the jetty and the boats on
// the sand stay put (sand boats sit above +0.5 m, the jetty deck is 1.05 m, its piles reach the bed).
// Stage 2 (people and the fishing day) reads WATERFRONT_SPOTS below.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AREAS } from '../../config.js';
import { bakeAO } from '../ao.js';
import { paintGround } from '../ground.js';
import { waterObstacles } from '../water.js';
import { buildJetty } from '../../kit/hamlet.js';
import {
  Mesher, FLAT_MAT, HULLS, COL, JUKUNG, JUKUNG_COLLIDERS, jukung, marketStall, marketArch, signboard, lantern, netRack, netSpread,
  boatOnTrestles, rollers, shelter, dartoHut, tideBoard, oarRack, groundMat, bucket, ropeCoil, jerryCan, anchor, crate, plasticCrate,
  basket, buoy, iceBlocks, dryingRack, paddle,
} from '../../kit/fishing.js';

const WF = AREAS.waterfront, MK = WF.market;
const SEA = WF.sea, LAND = SEA + Math.PI, EAST = WF.along, WEST = EAST + Math.PI;
const P = (s, d) => WF.at(s, d);
const face = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
// A point given in a thing's own frame (it stands at x, z turned by ry) in world coordinates.
const toW = (o, lx, lz) => ({ x: o.x + lx * Math.cos(o.ry) + lz * Math.sin(o.ry), z: o.z - lx * Math.sin(o.ry) + lz * Math.cos(o.ry) });
const spotAt = (s, d, rot, extra = {}) => ({ ...P(s, d), rot, ...extra });
const SHOW_WITHIN = 220;

// ---- The plan ---------------------------------------------------------------------------------------------
const AISLE = MK.d, STALL_W = 5.2, STALL_D = 2.5, HALF_AISLE = 2.4, GAP_S = 16.7;
// Six stalls: what they sell, their awning (0 striped cloth, 1 tin, 2 plain cloth), colours and goods.
const STALLS = [
  { row: 'n', s: 7.6, kind: 0, colour: 0, goods: 0, sells: 'fresh' },
  { row: 'n', s: 13.2, kind: 1, colour: 1, goods: 1, special: 'dried', sells: 'dried' },
  { row: 'n', s: 20.2, kind: 2, colour: 2, goods: 2, sells: 'fresh' },
  { row: 's', s: 7.6, kind: 1, colour: 3, goods: 3, special: 'shellfish', sells: 'shellfish' },
  { row: 's', s: 13.2, kind: 0, colour: 4, goods: 0, sells: 'fresh' },
  { row: 's', s: 20.2, kind: 0, colour: 5, goods: 1, special: 'ice', sells: 'ice' },
];
const stallFrame = (st) => ({ ...P(st.s, st.row === 'n' ? AISLE - HALF_AISLE : AISLE + HALF_AISLE), ry: st.row === 'n' ? SEA : LAND });
// Boats on the sand (keel on log rollers): two ready to launch at d 7, five pulled up above high tide.
const BEACH_BOATS = [
  { s: -14, d: 7.0, yaw: SEA + 0.03, hull: 0, sail: -1, launch: true },
  { s: -8.6, d: 7.0, yaw: SEA - 0.04, hull: 1, sail: 0, launch: true },
  { s: 2.2, d: 5.8, yaw: SEA + 0.1, hull: 2, sail: -1 },
  { s: 7.6, d: 7.4, yaw: SEA - 0.08, hull: 3, sail: 1, tracks: true },
  { s: 13.2, d: 5.4, yaw: SEA + 0.05, hull: 5, sail: -1 },
  { s: 19.2, d: 7.0, yaw: SEA - 0.14, hull: 6, sail: -1, tracks: true },
  { s: 24.8, d: 5.2, yaw: SEA + 0.1, hull: 7, sail: 2 },
];
const MOORED = [{ s: -11, d: 39, yaw: SEA + 0.35, hull: 4, sail: -1 }, { s: -1.5, d: 42.5, yaw: SEA - 0.25, hull: 6, sail: 3 }, { s: 8.5, d: 40, yaw: SEA + 0.15, hull: 2, sail: -1 }];
const FAR = [{ s: -30, d: 95, yaw: SEA + 1.2, hull: 1, sail: 0 }, { s: 12, d: 125, yaw: SEA - 0.9, hull: 3, sail: 1 }, { s: 48, d: 100, yaw: SEA + 2.4, hull: 5, sail: 2 }];
// Darto's jetty: straight out to sea in front of his hut, from where the sand is about at deck level to d 31
// (still a metre of water at mean sea, about half a metre at low tide).
const JETTY = { s: -20.3, d0: 6.8, d1: 31, deck: 1.05, piles: 2.0 };
const TIDE_BOARD = { s: -18.75, d: 21, ry: WEST + 0.75 };
const TIDE_STONES = [[-17.6, 22.2, 0.55], [-16.5, 23.0, 0.48], [-15.4, 22.5, 0.6], [-14.5, 23.9, 0.5], [-13.5, 24.6, 0.62], [-12.6, 25.7, 0.5], [-15.3, 25.2, 0.45], [-16.9, 24.8, 0.52]];

// ---- Anchor points for stage 2 (people and the fishing day). World x, z; `rot` is the heading to face. -------
const stallSpots = STALLS.map((st, i) => {
  const o = stallFrame(st), seller = toW(o, 0.1, -1.4), buyer = toW(o, 0.3, 0.95);
  return { stall: i, sells: st.sells, row: st.row, front: o, seller: { ...seller, rot: o.ry, sit: false }, stool: { ...toW(o, -0.4, -1.35), rot: o.ry }, buyer: { ...buyer, rot: o.ry + Math.PI } };
});
export const WATERFRONT_SPOTS = {
  // The six stalls (seller behind the counter, a buyer in the aisle in front) and two sellers on ground mats.
  stalls: stallSpots,
  mats: [spotAt(24.6, -8.6, SEA, { sit: true }), spotAt(24.6, -2.4, LAND, { sit: true })],
  // Net menders: sitting on the sand either side of the spread net.
  menders: [spotAt(-4.8, 4.35, SEA, { sit: true }), spotAt(-3.4, 6.7, LAND, { sit: true })],
  // The boat builder at the hull on trestles, and where the hull is.
  builder: spotAt(-2.5, 3.2, LAND, { pose: 'hammer' }),
  trestle: spotAt(-2.5, 2.0, EAST),
  // Boat launch lines: where each boat rests, its crew's places at the stern, the water's edge at mean sea and
  // out beyond the shallows. `boat` indexes BEACH_BOATS (and WATERFRONT.beachBoats). Haul-ups use the same lines.
  launches: BEACH_BOATS.map((b, i) => ({ boat: i, b })).filter(({ b }) => b.launch || b.tracks).map(({ b, i }) => ({
    boat: i, rest: spotAt(b.s, b.d, b.yaw), crew: [spotAt(b.s - 0.75, b.d - 3.1, b.yaw), spotAt(b.s + 0.75, b.d - 3.1, b.yaw)],
    water: P(b.s + 0.5, 21), out: P(b.s + 3, 55), launch: !!b.launch,
  })),
  moored: MOORED.map((b) => spotAt(b.s, b.d, b.yaw)),
  // The porters' way from the boats up through the stalls' gap to the market's east end (crates are set down there).
  porter: [P(16.6, 2.4), P(GAP_S, -1.0), P(GAP_S, AISLE), P(23.4, AISLE), spotAt(25.0, -9.4, SEA)],
  darto: {
    door: spotAt(-17.5, 0.6, LAND, { hide: true }),      // in through his door (hidden inside)
    porch: spotAt(-18.5, -2.0, SEA, { sit: true }),       // the porch bench, looking out to sea (sits at the porch floor, see `porchTop`)
    porchTop: null,                                       // filled in when built: the porch bench's world height
    mend: spotAt(-11.6, -0.15, SEA, { sit: true }),       // the shelter's bench, mending
    tideBoard: spotAt(-19.85, 19.7, 0),                   // on the jetty, reading the board (rot filled in below)
    jettyEnd: spotAt(JETTY.s, JETTY.d1 - 0.9, SEA, { sit: true }), // sits on the jetty's end at dusk
    jettyFoot: spotAt(JETTY.s, JETTY.d0 - 1.2, SEA),
  },
  // Market cats waiting for scraps, and where gulls like to circle.
  cats: [spotAt(9.6, -4.4, LAND), spotAt(19.8, -6.7, SEA), spotAt(25.4, -5.0, WEST)],
  gulls: [P(5, 10), P(-15, 20), P(18, 30)],
  // Node ids in the village's walking network (src/world/areas/hamlet.js) that reach the waterfront.
  nodes: { beachPath: ['wb0', 'wb1', 'wb2', 'wb3'], aisle: ['wm0', 'wm1', 'wm2', 'wm3', 'wm4'], marketPath: ['wm5', 'wm6', 'wm7'], down: ['wd0', 'wg0', 'wg1'], sand: ['ws0', 'ws1', 'ws2', 'ws3', 'ws4', 'ws5', 'ws6'], hutDoor: 'wh' },
};
{ const d = WATERFRONT_SPOTS.darto, b = P(TIDE_BOARD.s, TIDE_BOARD.d); d.tideBoard.rot = face(d.tideBoard, b); }

// The live waterfront, for later milestones: the sea level the boats float on, the moored boats, the jetty.
export const WATERFRONT = {
  sea: 0,
  setSeaLevel(h) { this.sea = h; },
  moored: [],   // { mesh, x, z, yaw, phase }: floats at WATERFRONT.sea every frame
  far: null,    // one mesh for the three boats far out
  jetty: null,  // { x, z, rot, length, deckTop, platform, pileBottom }
  beachBoats: BEACH_BOATS.map((b) => ({ ...b, ...P(b.s, b.d) })),
  spots: WATERFRONT_SPOTS,
};

// ---- Building --------------------------------------------------------------------------------------------
export function createWaterfront(scene, deps) {
  const { groundAt, heightAt, keepClear } = deps;
  const root = new THREE.Group(); root.name = 'waterfront';
  const colliders = [], lamps = [];
  const geos = { market: [], yard: [], beach: [] };
  // One placed thing: build it with the Mesher in its own frame, bake its AO (a fine crease grid of its own), and
  // file it under a group; its local colliders and lantern spots go to world space.
  function piece(group, o, y, build, { pitch = 0, roll = 0, ground = groundAt, light = false } = {}) {
    const m = new Mesher(); m.frame(o.x, y, o.z, o.ry || 0, pitch, roll);
    const made = build(m) || {};
    const mesh = m.build(); if (!mesh) return made;
    const g = mesh.geometry; bakeAO(g, { ground }); geos[group].push(g);
    for (const c of made.colliders || []) { const p = toW(o, c.x, c.z); colliders.push(c.r !== undefined ? { x: p.x, z: p.z, r: c.r } : { x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: (c.rot || 0) + (o.ry || 0) }); }
    for (const l of made.glow || []) { const p = toW(o, l.x, l.z); lamps.push({ x: p.x, y: y + l.y, z: p.z, n: null, r: 0.085, light }); }
    return made;
  }
  // The lowest ground under a footprint (local corners), so posts stand on the ground and the uphill side sinks in.
  const footY = (o, hw, z0, z1) => Math.min(...[[-hw, z0], [hw, z0], [-hw, z1], [hw, z1], [0, (z0 + z1) / 2]].map(([lx, lz]) => { const p = toW(o, lx, lz); return groundAt(p.x, p.z); }));
  // Repeated small things are instanced: one pool per kind.
  const pools = { crate: [], plastic: [], buoy: [], basket: [] };
  const put = (kind, s, d, ry = 0, c = 0xffffff, lift = 0, sc = 1) => { const p = P(s, d); pools[kind].push({ x: p.x, y: groundAt(p.x, p.z) + lift - 0.01, z: p.z, ry, c, s: sc, lift }); };

  // ==== 1. The fish market ===============================================================================
  STALLS.forEach((st, i) => {
    const o = stallFrame(st);
    const made = piece('market', o, groundAt(o.x, o.z) - 0.02, (m) => marketStall(m, { W: STALL_W, D: STALL_D, kind: st.kind, colour: st.colour, seed: i * 3 + 1, goods: st.goods, special: st.special || null }));
    void made;
    // Baskets of fish and a bucket at the counter's foot, crates stacked at the back corner.
    const front = st.row === 'n' ? AISLE - HALF_AISLE + 0.35 : AISLE + HALF_AISLE - 0.35, back = st.row === 'n' ? AISLE - HALF_AISLE - STALL_D - 0.45 : AISLE + HALF_AISLE + STALL_D + 0.45;
    put('basket', st.s - 1.7, front, i, 0xffffff); put('basket', st.s + 1.95, front, i * 2, 0xf4ece0, 0, 0.85);
    put('crate', st.s + (i % 2 ? 1.6 : -1.6), back, 0.1 * i, 0xffffff); put('crate', st.s + (i % 2 ? 1.6 : -1.6), back, -0.2 + 0.1 * i, 0xd8ccc0, 0.3);
    put('plastic', st.s + (i % 2 ? -0.6 : 0.6), back, 0.3, [0x3a7fc0, 0xd9463a, 0x3f9f6a][i % 3]);
  });
  // The entrance arch over the aisle's west end, two signboards beside it, poles and a sign at the east end.
  const archO = { ...P(4.2, AISLE), ry: SEA - Math.PI / 2 };
  const ay = footY(archO, 2.2, -0.1, 0.1);
  piece('market', archO, ay, (m) => marketArch(m, 4.2));
  piece('market', { ...P(3.1, AISLE - 3.0), ry: WEST + 0.3 }, groundAt(P(3.1, AISLE - 3.0).x, P(3.1, AISLE - 3.0).z) - 0.03, (m) => { signboard(m, 0, 0, 0, 0, 0.95, 0.45, 0xd9463a, 1.35); return { colliders: [{ x: 0, z: 0, r: 0.08 }] }; });
  piece('market', { ...P(3.1, AISLE + 3.0), ry: WEST - 0.3 }, groundAt(P(3.1, AISLE + 3.0).x, P(3.1, AISLE + 3.0).z) - 0.03, (m) => { signboard(m, 0, 0, 0, 0, 0.85, 0.42, 0x3f9f6a, 1.2); return { colliders: [{ x: 0, z: 0, r: 0.08 }] }; });
  const eastO = { ...P(25.8, AISLE), ry: SEA - Math.PI / 2 }, ey = footY(eastO, 2.0, -0.1, 0.1);
  piece('market', eastO, ey, (m) => {
    for (const s of [-1, 1]) m.rod([s * 1.9, 0, 0], [s * 1.9, 3.1, 0], 0.075, 0.065, COL.bamboo, 6);
    m.rod([-2.1, 2.95, 0], [2.1, 2.95, 0], 0.055, 0.055, COL.bambooDk, 6);
    signboard(m, 0, 2.45, 0.05, Math.PI, 1.6, 0.42, 0xf2b63b, 0);
    return { colliders: [{ x: -1.9, z: 0, r: 0.1 }, { x: 1.9, z: 0, r: 0.1 }] };
  });
  // The aisle rope: from the arch's crossbar to the east poles, sagging, hung with lanterns and bunting.
  {
    const m = new Mesher(); m.frame();
    const a = P(4.2, AISLE), b = P(25.8, AISLE), y0 = ay + 3.15, y1 = ey + 2.92, N = 24, pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push([a.x + (b.x - a.x) * u, y0 + (y1 - y0) * u - 0.45 * Math.sin(Math.PI * u), a.z + (b.z - a.z) * u]); }
    m.bend(pts, 0.013, COL.rope, 3);
    const flags = [0xe8503a, 0xf2c03b, 0x3f9f6a, 0x3a8fd0, 0xf4efe2, 0xe07a3a];
    const at = (u) => { const k = Math.min(N - 1, Math.floor(u * N)), f = u * N - k, p = pts[k], q = pts[k + 1]; return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]; };
    const ux = (b.x - a.x) / Math.hypot(b.x - a.x, b.z - a.z), uz = (b.z - a.z) / Math.hypot(b.x - a.x, b.z - a.z);
    for (let i = 1; i < 40; i++) {
      const p = at(i / 40), l = [p[0] - ux * 0.11, p[1], p[2] - uz * 0.11], r = [p[0] + ux * 0.11, p[1], p[2] + uz * 0.11], t = [p[0], p[1] - 0.26, p[2]];
      m.tris([[l, r, t]], flags[i % flags.length], true);
    }
    const glow = [];
    for (let k = 0; k < 7; k++) { const p = at((k + 0.5) / 7); lantern(m, p[0], p[1] - 0.02, p[2], glow); }
    const mesh = m.build(); bakeAO(mesh.geometry, { ground: null }); geos.market.push(mesh.geometry);
    for (const l of glow) lamps.push({ ...l, n: null, r: 0.085, light: true });
  }
  // The east end: two ground mats of fish, ice under sacks, crates of the catch waiting, a scale on a post.
  piece('market', { ...P(24.6, -8.6), ry: SEA }, groundAt(P(24.6, -8.6).x, P(24.6, -8.6).z) - 0.01, (m) => groundMat(m, 2));
  piece('market', { ...P(24.6, -2.4), ry: LAND }, groundAt(P(24.6, -2.4).x, P(24.6, -2.4).z) - 0.01, (m) => groundMat(m, 5));
  piece('market', { ...P(26.4, -9.8), ry: EAST }, groundAt(P(26.4, -9.8).x, P(26.4, -9.8).z) - 0.02, (m) => { iceBlocks(m, 0, 0, 0, 0, 3); bucket(m, 0.9, 0, 0.5, 0xe8503a); return { colliders: [{ x: 0, z: 0, hw: 0.75, hd: 0.3 }] }; });
  piece('market', { ...P(22.9, -0.6), ry: SEA }, groundAt(P(22.9, -0.6).x, P(22.9, -0.6).z) - 0.02, (m) => {
    // a hanging scale on its own tripod, for the porters' crates
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; m.rod([Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], [0, 2.0, 0], 0.035, 0.03, COL.bambooDk, 5); }
    m.rod([0, 2.0, 0], [0, 1.65, 0], 0.01, 0.01, COL.iron, 3); m.cyl(0.1, 0.1, 0.05, COL.cream, 0, 1.55, 0, 10, Math.PI / 2); m.cyl(0.105, 0.105, 0.03, 0xd9463a, 0, 1.55, -0.02, 10, Math.PI / 2);
    m.rod([0, 1.45, 0], [0, 1.2, 0], 0.012, 0.012, COL.iron, 3); m.box(0.5, 0.04, 0.4, 0xb8b8b0, 0, 1.18, 0);
    return { colliders: [{ x: 0, z: 0, r: 0.45 }] };
  });
  for (const [s, d, ry, c, lift] of [[25.4, -6.6, 0.1, 0xffffff, 0], [25.9, -6.1, 0.4, 0xd8ccc0, 0], [25.6, -6.4, -0.2, 0xffffff, 0.3], [26.6, -4.3, 0.2, 0xe8dcd0, 0]]) put('crate', s, d, ry, c, lift);
  for (const [s, d, ry, c] of [[24.0, -10.4, 0.1, 0x3a7fc0], [24.7, -10.3, -0.3, 0xd9463a], [26.6, -3.5, 0.6, 0x3a7fc0], [17.8, -10.4, 0.2, 0x3f9f6a], [4.8, -9.9, 0, 0xd9463a], [5.3, -1.0, 0.4, 0x3a7fc0]]) put('plastic', s, d, ry, c);
  for (const [s, d, ry] of [[5.6, -8.0, 0], [5.4, -3.0, 1], [23.6, -4.0, 2], [15.9, -7.2, 3], [10.4, -3.9, 4]]) put('basket', s, d, ry, 0xffffff);
  colliders.push({ ...P(25.6, -6.4), r: 0.5 }, { ...P(26.6, -4.3), r: 0.35 });
  // The floor: packed gravel over the pad, a trodden dirt aisle down the middle.
  paintGround({ kind: 'gravel', rect: { x: MK.x, z: MK.z, rot: MK.rot, hw: MK.hw + 0.4, hd: MK.hd + 0.3 }, edge: 1.4, ragged: 0.55, strength: 0.92, tag: 'waterfront' });
  { const c = P(MK.s, AISLE); paintGround({ kind: 'dirt', rect: { x: c.x, z: c.z, rot: MK.rot, hw: MK.hw - 0.5, hd: 1.3 }, edge: 0.9, ragged: 0.5, strength: 0.38, tag: 'waterfront' }); }
  keepClear(P(9, AISLE).x, P(9, AISLE).z, 8); keepClear(P(21, AISLE).x, P(21, AISLE).z, 8);

  // ==== 2. The fishermen's yard ==========================================================================
  const hutO = { ...P(WF.hut.s, WF.hut.d), ry: SEA };
  const hutY = footY(hutO, 1.6, -1.4, 2.5) - 0.03;
  const hut = piece('yard', hutO, hutY, (m) => dartoHut(m), { light: true });
  WATERFRONT_SPOTS.darto.porchTop = hutY + 0.65 + 0.48;
  { const p = toW(hutO, -1.0, 1.4 + 0.3); Object.assign(WATERFRONT_SPOTS.darto.porch, { x: p.x, z: p.z }); }
  if (hut.door) { const p = toW(hutO, hut.door.x, hut.door.z); Object.assign(WATERFRONT_SPOTS.darto.door, { x: p.x, z: p.z }); }
  keepClear(hutO.x, hutO.z, 4);
  const shO = { ...P(-11, 0.6), ry: SEA };
  const sh = piece('yard', shO, footY(shO, 2.2, -1.6, 1.6) - 0.02, (m) => shelter(m, 4.4, 3.2, 2), { light: true });
  if (sh.seat) { const p = toW(shO, sh.seat.x, sh.seat.z); Object.assign(WATERFRONT_SPOTS.darto.mend, { x: p.x, z: p.z }); }
  keepClear(shO.x, shO.z, 4);
  for (const [s, d, len, hex, seed] of [[-4.0, -1.2, 4.2, COL.net, 1], [1.0, -2.0, 3.4, COL.netOr, 4]]) {
    const o = { ...P(s, d), ry: SEA + (seed > 2 ? 0.05 : -0.04) };
    piece('yard', o, footY(o, len / 2, -0.1, 0.1) - 0.02, (m) => { netRack(m, len, hex, seed); return { colliders: [{ x: 0, z: 0, hw: len / 2 + 0.1, hd: 0.3 }] }; });
    keepClear(o.x, o.z, len / 2 + 1);
  }
  { const o = { ...P(-2.5, 2.0), ry: EAST }; piece('yard', o, footY(o, 0.6, -1.6, 1.6) - 0.02, (m) => boatOnTrestles(m, HULLS[4], 3)); keepClear(o.x, o.z, 3.5); }
  { const o = { ...P(-14.6, -3.3), ry: SEA + 0.2 }; piece('yard', o, footY(o, 1, -0.4, 0.5) - 0.02, (m) => oarRack(m, 5)); }
  { const o = { ...P(-21.6, 1.0), ry: SEA }; piece('yard', o, footY(o, 1.6, -0.5, 0.5) - 0.02, (m) => dryingRack(m, 3.2, 1)); keepClear(o.x, o.z, 2.5); }
  // Piles of the fishermen's gear: crates, plastic crates, buoys and baskets (instanced), rope coils and cans.
  const pile = (s, d, seed) => {
    const r = (k) => { const v = Math.sin((seed + 1) * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
    const o = { ...P(s, d), ry: SEA + r(9) * 2 }, at = (lx, lz) => { const p = toW(o, lx, lz); const f = WF; const dx = p.x - f.o.x, dz = p.z - f.o.z; return [dx * f.ax + dz * f.az, dx * f.nx + dz * f.nz]; };
    put('crate', ...at(0, 0), o.ry + r(1) * 0.4, 0xffffff); put('crate', ...at(0.05, 0.02), o.ry + r(2) * 0.5 - 0.25, 0xcfc4b8, 0.3);
    put('plastic', ...at(0.7, 0.1), o.ry + r(3), [0x3a7fc0, 0xd9463a, 0x3f9f6a][seed % 3]);
    put('buoy', ...at(-0.55, 0.3), 0, 0xf2873a); put('buoy', ...at(-0.75, -0.05), 0, 0xf2d03b, 0, 0.85); put('buoy', ...at(-0.45, -0.3), 0, 0xe8503a, 0, 0.8);
    put('basket', ...at(-0.1, -0.68), r(4) * 3, 0xffffff, 0, 0.8);
    piece('yard', o, groundAt(o.x, o.z) - 0.01, (m) => { ropeCoil(m, 0.4, 0, -0.55); jerryCan(m, 1.05, 0, -0.4, r(4)); return { colliders: [{ x: 0.2, z: 0, r: 0.75 }] }; });
  };
  pile(-14.3, 1.6, 0); pile(-5.6, 2.4, 1); pile(3.6, 1.2, 2); pile(-17.6, 4.6, 3); pile(26.4, 1.6, 4);
  for (const [s, d, k] of [[-9.6, 2.9, 0], [-0.8, 4.0, 1], [10.2, 3.0, 2], [22.0, 3.4, 0]]) piece('yard', { ...P(s, d), ry: k }, groundAt(P(s, d).x, P(s, d).z) - 0.01, (m) => ropeCoil(m, 0, 0, 0, 0.22 + 0.03 * k, [COL.rope, 0x6f9fc0, 0xe0884a][k]));
  // Worn, packed earth round the yard's work places.
  { const c = P(-8, -0.2); paintGround({ kind: 'packed', rect: { x: c.x, z: c.z, rot: SEA, hw: 9.5, hd: 2.6 }, edge: 1.4, ragged: 0.7, strength: 0.45, tag: 'waterfront' }); }
  { const c = P(-17.5, 0.2); paintGround({ kind: 'packed', circle: { x: c.x, z: c.z, r: 2.2 }, edge: 1.2, ragged: 0.5, strength: 0.4, tag: 'waterfront' }); }

  // ==== 3. The boat beach ================================================================================
  BEACH_BOATS.forEach((b, i) => {
    const o = { ...P(b.s, b.d), ry: b.yaw }, L = JUKUNG.len;
    const stern = toW(o, 0, -L * 0.42), bow = toW(o, 0, L * 0.42);
    const hs = groundAt(stern.x, stern.z), hb = groundAt(bow.x, bow.z), pitch = Math.atan2(hs - hb, L * 0.84);
    const keel = (hs + hb) / 2 + 0.17;
    piece('beach', o, keel, (m) => {
      jukung(m, { hull: HULLS[b.hull], sail: b.sail, gear: i % 3 !== 1 });
      m.push(0, -0.12, 0); rollers(m, [-1.45, 0.05, 1.5], 1.25); m.pop();
      return { colliders: JUKUNG_COLLIDERS };
    }, { pitch });
    // An anchor out beyond the bow with its rope back to the boat, and two floats on the sand beside it.
    if (i % 2 === 0) { const a = toW(o, 0.3, L / 2 + 1.6); piece('beach', { ...a, ry: b.yaw + Math.PI + 0.2 }, groundAt(a.x, a.z) - 0.02, (m) => anchor(m, 0, 0, 0, 0, 1.1)); }
    const f1 = toW(o, -0.95, -1.0), f2 = toW(o, 1.0, 1.4);
    pools.buoy.push({ ...f1, y: groundAt(f1.x, f1.z) - 0.02, ry: 0, c: [0xf2873a, 0xf2d03b, 0xe8503a][i % 3], s: 1 });
    if (i % 2) pools.buoy.push({ ...f2, y: groundAt(f2.x, f2.z) - 0.02, ry: 0, c: [0xf2d03b, 0xe8503a, 0xf2873a][i % 3], s: 0.85 });
    // Drag tracks: the keel's groove and the floats' furrows, from the bow down to the water.
    if (b.launch || b.tracks) {
      for (const lx of [0, -1.95, 1.95]) {
        const a = toW(o, lx, L * 0.4), e = P(b.s + lx * 0.95 + (b.yaw - SEA) * 10, 21.5);
        paintGround({ kind: 'damp', path: [a, { x: (a.x + e.x) / 2, z: (a.z + e.z) / 2 }, e], width: lx ? 0.28 : 0.55, ragged: 0.25, edge: 0.3, strength: lx ? 0.22 : 0.32, tag: 'waterfront-tracks' });
      }
    }
    keepClear(o.x, o.z, 3.5);
  });
  // The net spread on the sand for mending, two paddles laid by it.
  piece('beach', { ...P(-4.2, 5.5), ry: SEA + 0.06 }, groundAt(P(-4.2, 5.5).x, P(-4.2, 5.5).z) - 0.01, (m) => {
    netSpread(m, 3.0, COL.net, 2); paddle(m, [-1.9, 0.03, -1.3], [-0.2, 0.03, -1.55]); return { colliders: [{ x: 1.9, z: 0.1, r: 0.45 }] };
  });
  // The tide board in the shallows beside the jetty (its marks are metres of sea above mean sea level, 0 = today's sea).
  { const o = { ...P(TIDE_BOARD.s, TIDE_BOARD.d), ry: TIDE_BOARD.ry }; piece('beach', o, 0, (m) => tideBoard(m, -0.9, 1.4)); waterObstacles.add(o.x, o.z, 0.12, 1); }
  // The tide stones: flat, weedy stones on the lower beach, their tops just under today's sea (out at -0.5 m).
  {
    const m = new Mesher(); m.frame();
    for (const [s, d, r] of TIDE_STONES) {
      const p = P(s, d), top = Math.min(groundAt(p.x, p.z) + 0.24, -0.08), k = (s * 7 + d * 3) | 0;
      m.at(new THREE.DodecahedronGeometry(r, 0), [0x7a7264, 0x6f6a5c, 0x857a68][k % 3], p.x, top - r * 0.36, p.z, 0.1 * (k % 3), k * 0.7, 0.05, 1.25, 0.36, 1.0);
      m.at(new THREE.DodecahedronGeometry(r * 0.8, 0), 0x5f7a52, p.x + 0.05, top - r * 0.36 * 0.8 + 0.035, p.z - 0.04, 0, k * 0.7 + 0.4, 0, 1.2, 0.3, 0.9);
      waterObstacles.add(p.x, p.z, r * 1.1, 1);
    }
    const mesh = m.build(); bakeAO(mesh.geometry, { ground: groundAt }); geos.beach.push(mesh.geometry);
  }

  // ==== 4. Darto's jetty ==================================================================================
  {
    const L = JETTY.d1 - JETTY.d0, c = P(JETTY.s, (JETTY.d0 + JETTY.d1) / 2), jy = JETTY.deck - 0.5;
    const j = buildJetty(L, JETTY.piles);
    j.group.position.set(c.x, jy, c.z); j.group.rotation.y = SEA; root.add(j.group);
    const platform = deps.addPlatform ? deps.addPlatform({ shape: 'box', x: c.x, z: c.z, rot: SEA, hw: 1.0, hd: L / 2, top: JETTY.deck, surface: 'wood', id: 'darto-jetty' }) : null;
    const o = { ...c, ry: SEA };
    for (const k of j.colliders || []) { const p = toW(o, k.x, k.z); colliders.push({ x: p.x, z: p.z, r: k.r }); }
    for (const l of j.lamps || []) { const p = toW(o, l.x, l.z); lamps.push({ x: p.x, y: jy + l.y, z: p.z, n: null, r: 0.12, light: true }); }
    for (let lz = -L / 2 + 0.5; lz <= L / 2 - 0.3; lz += 1.9) for (const s of [-1, 1]) { const p = toW(o, s * 1.12, lz); if (heightAt(p.x, p.z) < 0.05) waterObstacles.add(p.x, p.z, 0.12, 1); }
    WATERFRONT.jetty = { ...c, rot: SEA, length: L, deckTop: JETTY.deck, platform, pileBottom: jy - 0.1 - JETTY.piles, foot: P(JETTY.s, JETTY.d0), end: P(JETTY.s, JETTY.d1) };
    keepClear(P(JETTY.s, JETTY.d0).x, P(JETTY.s, JETTY.d0).z, 3);
  }

  // ==== Welding: one mesh each for the market, the yard and the beach; the instanced pools ===================
  for (const [name, list] of Object.entries(geos)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list), FLAT_MAT); mesh.name = `waterfront-${name}`;
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    for (const g of list) g.dispose();
  }
  const proto = (build) => { const m = new Mesher(); m.frame(); build(m); const g = m.build().geometry; bakeAO(g, { ground: 0 }); return g; };
  const PROTO = {
    crate: proto((m) => crate(m, 0, 0, 0, 0, COL.wood)),
    plastic: proto((m) => plasticCrate(m, 0, 0, 0, 0, 0xffffff, [0, 3, 1], 2)),
    buoy: proto((m) => buoy(m, 0, 0, 0, 0xffffff, 0.18)),
    basket: proto((m) => basket(m, 0, 0, 0, 0.26, [0, 2, 4], 1)),
  };
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  for (const [kind, list] of Object.entries(pools)) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(PROTO[kind], FLAT_MAT, list.length); im.name = `waterfront-${kind}`;
    list.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(0, it.ry, 0); dummy.scale.setScalar(it.s || 1); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, col.setHex(it.c ?? 0xffffff));
    });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im);
    if (kind === 'crate' || kind === 'plastic') for (const it of list) if (!it.lift) colliders.push({ x: it.x, z: it.z, r: 0.3 * (it.s || 1) });
  }

  // ==== The boats on the water: moored ones bob on the swell (a transform a frame), far ones as one mesh ======
  const boatGeo = (b, opts = {}) => { const m = new Mesher(); m.frame(); jukung(m, { hull: HULLS[b.hull], sail: b.sail, ...opts }); const g = m.build().geometry; bakeAO(g, { ground: null }); return g; };
  MOORED.forEach((b, i) => {
    const p = P(b.s, b.d), mesh = new THREE.Mesh(boatGeo(b, { anchor: true }), FLAT_MAT);
    mesh.rotation.order = 'YXZ'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `waterfront-moored-${i}`; root.add(mesh);
    const boat = { mesh, x: p.x, z: p.z, yaw: b.yaw, phase: i * 2.1 + 0.4 };
    WATERFRONT.moored.push(boat);
    waterObstacles.add(p.x, p.z, 1.0, 2);
  });
  {
    const list = FAR.map((b) => { const g = boatGeo(b, { gear: false }), p = P(b.s, b.d); g.applyMatrix4(new THREE.Matrix4().makeRotationY(b.yaw).setPosition(p.x, 0, p.z)); return g; });
    const far = new THREE.Mesh(mergeGeometries(list), FLAT_MAT); far.castShadow = false; far.receiveShadow = false; far.name = 'waterfront-far'; root.add(far);
    WATERFRONT.far = far;
  }
  const bob = (boat, t, sea) => {
    const ph = boat.phase, m = boat.mesh;
    m.position.set(boat.x, sea - JUKUNG.waterline + 0.06 * Math.sin(t * 1.15 + ph) + 0.025 * Math.sin(t * 2.3 + ph * 1.7), boat.z);
    m.rotation.set(0.03 * Math.sin(t * 0.95 + ph), boat.yaw + 0.03 * Math.sin(t * 0.21 + ph), 0.045 * Math.sin(t * 0.8 + ph * 1.3));
  };
  for (const b of WATERFRONT.moored) bob(b, 0, WATERFRONT.sea);
  scene.add(root);

  return {
    colliders, lamps, root,
    debug: { WATERFRONT, WATERFRONT_SPOTS, root },
    // The walking network: nodes and links joined to the village's (hamlet.js passes its own node/link helpers).
    network(node, link, rampFoot, rampTop) {
      const N = (id, s, d) => node(id, P(s, d));
      N('wb0', -27, -3); N('wb1', -17, -6.6); N('wb2', -6, -4.5); N('wb3', 3.5, -6.5);
      N('wm0', 5.6, AISLE); N('wm1', 10.4, AISLE); N('wm2', GAP_S, AISLE); N('wm3', 23.4, AISLE); N('wm4', 26.5, -7.5);
      N('wm5', 31, -12); node('wm6', AREAS.paths.market[2]); node('wm7', AREAS.paths.market[3]);
      N('wd0', -7.8, -0.5); N('wg0', GAP_S, -1.0); N('wg1', 16.6, 2.4);
      N('ws0', -7.4, 3.3); N('ws1', -11, 3.0); N('ws2', -17.6, 3.0); N('ws3', -0.6, 3.3); N('ws4', 1.2, 1.9); N('ws5', 9.6, 1.9); N('ws6', 23, 2.2);
      node('wh', WATERFRONT_SPOTS.darto.door);
      const chain = (ids) => ids.forEach((id, i) => { if (i) link(ids[i - 1], id); });
      if (rampFoot) link(rampFoot, 'wb0');
      chain(['wb0', 'wb1', 'wb2', 'wb3', 'wm0', 'wm1', 'wm2', 'wm3', 'wm4', 'wm5', 'wm6', 'wm7']);
      if (rampTop) link('wm7', rampTop);
      chain(['wb2', 'wd0', 'ws0']); chain(['wm2', 'wg0', 'wg1']);
      chain(['ws2', 'ws1', 'ws0', 'ws3', 'ws4', 'ws5', 'wg1', 'ws6']);
      link('wh', 'ws2'); link('wh', 'wb0');
    },
    update(dt, elapsed, player) {
      const p = player.position, near = Math.hypot(p.x - MK.x, p.z - MK.z) < SHOW_WITHIN;
      root.visible = near;
      if (!near) return;
      const sea = WATERFRONT.sea;
      for (const b of WATERFRONT.moored) bob(b, elapsed, sea);
      if (WATERFRONT.far) WATERFRONT.far.position.y = sea - JUKUNG.waterline + 0.07 * Math.sin(elapsed * 0.6);
    },
  };
}
