// INTERNAL. The fishing waterfront (docs/superpowers/specs/2026-11-17-fishing-waterfront-design.md), stage 1 (the
// place), as revised by the owner into a modern Indonesian fishing port (design section 10). Built and updated from
// src/world/areas/hamlet.js (so main.js's AREA_LIST is untouched). Everything stands in the beach frame of
// AREAS.waterfront (src/config.js): `s` metres east along the coast, `d` metres out to sea from the grass line. The
// beach is a nearly flat sand plain: the waterline is at d = 40, +0.5 m of sea reaches d = 25, -0.5 m reaches d = 47;
// past that the bed steepens to -3 m by d = 58.
//
// - The fish auction hall (TPI) on its raised concrete slab (s 3.5..30.5, d -13..0): open sides, white columns,
//   a corrugated gable roof with a ridge vent, gutters and an orange fascia, a tiled selling floor with drainage
//   channels, tiled selling tables in two rows, the auction floor of blue and red crates, the weighing station, the
//   ice corner, the office with its tap and hose, tube lights that glow at night. Steps west, seaward and inland, a
//   cart ramp to the forecourt (a parked truck, motorbikes) and the pier ramp seaward.
// - The concrete pier from the slab to a T-head at d 52..57 (bed -1.7..-3 m): bollards, tyre fenders, a ladder,
//   lamp posts (glow only), crates and a hand cart at the head; the fish carrier ship moored along its seaward face,
//   a steel kapal motor beside it, a fibreglass boat on its inner face.
// - The fishermen's yard on the west half: Old Darto's hut and his tide board, the shelter, net racks, a hull on
//   trestles, an oar rack, a salt-fish rack; modern gear beside it: outboards on stands, a repair bench, fuel drums.
// - The boat beach: painted jukung and fibreglass outboard boats on log rollers above high tide, drag tracks down the
//   long flat sand to the water; Darto's traditional bamboo-and-plank jetty out to the low-tide line, the tide stones
//   beside it; moored boats (jukung, a fibreglass boat, a wooden kapal motor) and boats far out.
//
// Cost: the hall, the yard, the beach and the pier are each ONE welded vertex-coloured mesh (baked AO per piece);
// repeated props (crates, drums, styrofoam and cool boxes, bollards, tyres, buoys, baskets) are instanced, one draw
// per kind; each floating boat and the ship is one mesh moved per frame (a transform); the glowing tubes, lamp
// lenses and boat lights share one emissive material whose brightness follows the night (no new lights).
//
// Tide-ready: WATERFRONT.setSeaLevel(h) floats the moored boats, the ship and the pier boats with the sea (M2b); the
// pier and the jetty stay put (pier deck 1.85 m, jetty deck 1.05 m, piles to the bed), boats on the sand sit above
// +0.5 m. Stage 2 (people and the fishing day) reads WATERFRONT_SPOTS below.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AREAS } from '../../config.js';
import { bakeAO } from '../ao.js';
import { paintGround } from '../ground.js';
import { waterObstacles } from '../water.js';
import { buildJetty } from '../../kit/hamlet.js';
import {
  Mesher, FLAT_MAT, HULLS, COL, JUKUNG, JUKUNG_COLLIDERS, jukung, signboard, netRack, netSpread, boatOnTrestles, rollers, shelter,
  dartoHut, tideBoard, oarRack, ropeCoil, jerryCan, anchor, crate, plasticCrate, basket, buoy, dryingRack, paddle,
} from '../../kit/fishing.js';
import {
  PCOL, HALL, fishHall, SHIP, fishCarrier, KAPAL, kapalMotor, FIBRE, fibreBoat, bollard, tyre, drum, styroBox, coolBox, handCart,
  smallTruck, motorbike, engineStand, workbench,
} from '../../kit/port.js';

const WF = AREAS.waterfront, MK = WF.market, HL = WF.hall, PR = WF.pier, HEAD = PR.head;
const SEA = WF.sea, LAND = SEA + Math.PI, EAST = WF.along, WEST = EAST + Math.PI;
const P = (s, d) => WF.at(s, d);
const face = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
// A point given in a thing's own frame (it stands at x, z turned by ry) in world coordinates.
const toW = (o, lx, lz) => ({ x: o.x + lx * Math.cos(o.ry) + lz * Math.sin(o.ry), z: o.z - lx * Math.sin(o.ry) + lz * Math.cos(o.ry) });
const spotAt = (s, d, rot, extra = {}) => ({ ...P(s, d), rot, ...extra });
const SHOW_WITHIN = 220;

// ---- The plan ---------------------------------------------------------------------------------------------
// The hall in its own frame: x = s - HS, z = d - HD (see kit/port.js fishHall).
const HS = (HL.s0 + HL.s1) / 2, HD = (HL.d0 + HL.d1) / 2, HW = HL.s1 - HL.s0, HDp = HL.d1 - HL.d0;
const hs = (x) => HS + x, hdd = (z) => HD + z; // hall local -> beach frame
// Where the slab's edge opens: steps west (from the beach path), seaward (down to the sand), inland (to the
// forecourt), a cart ramp inland, and the pier ramp seaward (built with the pier).
const OPENINGS = [
  { side: 'w', at: 0, w: 3, kind: 'steps' }, { side: 's', at: 16.7 - HS, w: 3, kind: 'steps' }, { side: 's', at: PR.s - HS, w: PR.w, kind: 'none' },
  { side: 'n', at: 18.5 - HS, w: 4, kind: 'ramp', len: 2.4 }, { side: 'n', at: 8.25 - HS, w: 2.5, kind: 'steps' },
];
// Boats on the sand (keel on log rollers), all above high tide (+0.5 m reaches d 25): painted jukung, two of them
// ready to launch at d 19, and fibreglass outboard boats.
const BEACH_BOATS = [
  { kind: 'jukung', s: -22.5, d: 13.0, yaw: SEA + 0.05, hull: 0, sail: -1, tracks: true },
  { kind: 'jukung', s: -14.5, d: 19.0, yaw: SEA + 0.03, hull: 1, sail: 0, launch: true },
  { kind: 'jukung', s: -8.6, d: 19.5, yaw: SEA - 0.04, hull: 3, sail: -1, launch: true },
  { kind: 'jukung', s: -2.0, d: 12.5, yaw: SEA + 0.1, hull: 2, sail: 1 },
  { kind: 'fibre', s: 4.4, d: 15.5, yaw: SEA - 0.08, colour: 0, canopy: true, tracks: true },
  { kind: 'jukung', s: 10.0, d: 11.0, yaw: SEA + 0.06, hull: 5, sail: -1 },
  { kind: 'fibre', s: 17.0, d: 17.5, yaw: SEA + 0.12, colour: 1 },
  { kind: 'jukung', s: 31.5, d: 13.5, yaw: SEA - 0.12, hull: 7, sail: 2, tracks: true },
];
// On the water: boats moored off the beach (all afloat at -0.5 m: d 50..56 is -0.9..-2.1 m), the boats at the pier,
// and the boats far out.
const MOORED = [
  { kind: 'jukung', s: -17, d: 50.5, yaw: SEA + 0.35, hull: 4, sail: -1 },
  { kind: 'jukung', s: -7.5, d: 53.5, yaw: SEA - 0.25, hull: 6, sail: 3 },
  { kind: 'fibre', s: -25, d: 51.0, yaw: SEA + 0.6, colour: 2 },
  { kind: 'kapal', s: 1.5, d: 56.0, yaw: SEA + 0.3, variant: 0 },
];
const AT_PIER = [
  { kind: 'ship', s: 31, d: HEAD.d1 + 0.35 + SHIP.B / 2, yaw: EAST },
  { kind: 'kapal', s: 12, d: HEAD.d1 + 0.35 + KAPAL.B / 2, yaw: WEST, steel: true },
  { kind: 'fibre', s: 37, d: HEAD.d0 - 0.3 - FIBRE.B / 2, yaw: EAST, colour: 3, canopy: true },
];
const FAR = [{ s: -30, d: 95, yaw: SEA + 1.2, hull: 1, sail: 0 }, { s: 12, d: 125, yaw: SEA - 0.9, hull: 3, sail: 1 }, { s: 48, d: 100, yaw: SEA + 2.4, hull: 5, sail: 2 }, { kind: 'kapal', s: -8, d: 140, yaw: SEA + 1.6 }];
// Darto's jetty: the traditional bamboo-and-plank jetty in front of his hut, from where the sand is at deck level out
// past the low-tide line (bed about -0.6 m at its end).
const JETTY = { s: -20.3, d0: 8, d1: 48, deck: 1.05, piles: 2.0 };
const TIDE_BOARD = { s: -18.75, d: 40.5, ry: WEST + 0.75 };
const TIDE_STONES = [[-17.6, 42.6, 0.55], [-16.5, 43.4, 0.48], [-15.4, 42.9, 0.6], [-14.5, 44.2, 0.5], [-13.5, 44.9, 0.62], [-12.6, 45.8, 0.5], [-15.3, 45.4, 0.45], [-16.9, 45.0, 0.52]];
// The auction floor: rows of crates between the drainage channels, west of the weighing station (hall local).
const AUCTION = { rows: [-1.6, -0.55, 0.55, 1.6], x0: -10.9, n: 14, step: 0.7 };

// ---- Anchor points for stage 2 (people and the fishing day). World x, z; `rot` is the heading to face. -------
const hallSpot = (x, z, rot, extra = {}) => spotAt(hs(x), hdd(z), rot, extra);
const tableSpots = [];
for (const s of [-1, 1]) [-10.2, -6.6, -3.0, 0.6].forEach((x, i) => {
  // the seller stands on the outer side (toward the columns), the buyer on the aisle side
  const z = s * HALL.TABLE_Z;
  tableSpots.push({ table: tableSpots.length, row: s > 0 ? 'sea' : 'land', seller: hallSpot(x + 0.4, z + s * 0.85, s > 0 ? LAND : SEA), buyer: hallSpot(x - 0.3, z - s * 0.9, s > 0 ? SEA : LAND), sells: ['fresh', 'tuna', 'squid', 'reef'][i] });
});
export const WATERFRONT_SPOTS = {
  // The hall: sellers behind the eight tables (a buyer in front of each), the auctioneer and the bidders round the
  // crates, the weigher at the scale, the ice worker, the clerk in the office door, a cat or two.
  tables: tableSpots,
  auctioneer: hallSpot(AUCTION.x0 + 4.5, 2.6, LAND, { pose: 'explain' }),
  auctionCrowd: [[-10.5, -2.5], [-8.6, -2.6], [-6.8, -2.5], [-4.9, -2.6], [-3.0, -2.5], [-9.5, 2.55], [-7.6, 2.6], [-3.6, 2.6], [-1.6, 2.5]].map(([x, z]) => hallSpot(AUCTION.x0 + 0.4 + (x + 10.5), z, z > 0 ? LAND : SEA)),
  weigher: hallSpot(5.7, -0.9, WEST), scale: hallSpot(4.4, 0, WEST),
  iceWorker: hallSpot(9.6, 0.7, EAST, { pose: 'hammer' }),
  clerk: hallSpot(7.8, -4.0, WEST),
  // Porters: crates from the beach boats up the seaward steps to the auction floor, and from the auction floor out
  // along the pier to the ship's gangway (the crates stack at the pier head).
  porterFromBoats: [P(16.6, 14), P(16.6, 2.0), P(16.7, 0.6), P(16.7, -2.4), P(hs(AUCTION.x0 + 9.5), hdd(-2.6))],
  porterToShip: [P(hs(-1.5), hdd(-2.6)), P(hs(6.5), hdd(2.4)), P(PR.s, -0.6), P(PR.s, 1.5), P(PR.s, 8), P(PR.s, 30), P(PR.s, 51), P(PR.s + 1.5, 54.0), spotAt(31, HEAD.d1 - 0.5, SEA)],
  shipGangway: spotAt(31, HEAD.d1 - 0.4, SEA),
  crateStack: spotAt(27.5, 53.9, LAND),
  // Boat launch lines: where each boat rests, its crew's places at the stern, the water's edge at mean sea and
  // out beyond the shallows. `boat` indexes BEACH_BOATS (and WATERFRONT.beachBoats). Haul-ups use the same lines.
  launches: BEACH_BOATS.map((b, i) => ({ b, i })).filter(({ b }) => b.launch || b.tracks).map(({ b, i }) => ({
    boat: i, kind: b.kind, rest: spotAt(b.s, b.d, b.yaw), crew: [spotAt(b.s - 0.75, b.d - 3.1, b.yaw), spotAt(b.s + 0.75, b.d - 3.1, b.yaw)],
    water: P(b.s + 0.5, 40.5), out: P(b.s + 3, 62), launch: !!b.launch,
  })),
  // Crews on the moored boats and at the pier (stand on deck), and the kapal motor's skipper at the pier.
  moored: MOORED.map((b) => spotAt(b.s, b.d, b.yaw, { kind: b.kind })),
  pierCrew: [spotAt(12, HEAD.d1 - 0.6, SEA), spotAt(29.5, HEAD.d1 - 0.6, SEA), spotAt(34.5, HEAD.d1 - 0.7, SEA)],
  // The fishermen's yard: menders by the spread net, the boat builder at the hull, the mechanic at the bench.
  menders: [spotAt(-4.8, 7.35, SEA, { sit: true }), spotAt(-3.4, 9.7, LAND, { sit: true })],
  builder: spotAt(-2.5, 3.2, LAND, { pose: 'hammer' }),
  trestle: spotAt(-2.5, 2.0, EAST),
  mechanic: spotAt(1.6, 2.7, SEA, { pose: 'hammer' }),
  darto: {
    door: spotAt(-17.5, 0.6, LAND, { hide: true }),      // in through his door (hidden inside)
    porch: spotAt(-18.5, -2.0, SEA, { sit: true }),       // the porch bench, looking out to sea (sits at the porch floor, see `porchTop`)
    porchTop: null,                                       // filled in when built: the porch bench's world height
    mend: spotAt(-11.6, -0.15, SEA, { sit: true }),       // the shelter's bench, mending
    tideBoard: spotAt(-19.85, 39.2, 0),                   // on the jetty, reading the board (rot filled in below)
    jettyEnd: spotAt(JETTY.s, JETTY.d1 - 0.9, SEA, { sit: true }), // sits on the jetty's end at dusk
    jettyFoot: spotAt(JETTY.s, JETTY.d0 - 1.2, SEA),
  },
  // Market cats waiting for scraps, and where gulls like to circle (over the boats and the ship).
  cats: [hallSpot(-11.6, -3.4, LAND), hallSpot(1.8, 3.6, SEA), hallSpot(8.6, 2.6, WEST)],
  gulls: [P(5, 18), P(-15, 42), P(31, 62), P(24.5, 35)],
  // Node ids in the village's walking network (src/world/areas/hamlet.js) that reach the waterfront.
  nodes: {
    beachPath: ['wb0', 'wb1', 'wb2', 'wb3'], hallSea: ['wm0', 'wm1', 'wm2', 'wm3', 'wm4', 'wm5'], hallLand: ['wa1', 'wa2', 'wa3', 'wa4'],
    forecourt: ['wf0', 'wf1', 'wf2'], pier: ['wp0', 'wp1', 'wp2', 'wp3', 'wp4', 'wp5', 'wp6'], down: ['wd0', 'wg0', 'wg1'],
    sand: ['ws0', 'ws1', 'ws2', 'ws3', 'ws4', 'ws5', 'ws6'], hutDoor: 'wh', office: 'wo',
  },
};
{ const d = WATERFRONT_SPOTS.darto, b = P(TIDE_BOARD.s, TIDE_BOARD.d); d.tideBoard.rot = face(d.tideBoard, b); }

// The live waterfront, for later milestones: the sea level the boats float on, the floating boats, the pier, the jetty.
export const WATERFRONT = {
  sea: 0,
  setSeaLevel(h) { this.sea = h; },
  moored: [],   // { mesh, x, z, yaw, phase, lift, amp, kind }: floats at WATERFRONT.sea every frame (moored boats and the boats at the pier)
  ship: null,   // the fish carrier at the pier head (also in `moored`)
  far: null,    // one mesh for the boats far out
  pier: null,   // { deckTop, rampTop, platforms, foot, head, ... }
  hall: null,   // { slabTop, platform, ... }
  jetty: null,  // { x, z, rot, length, deckTop, platform, pileBottom }
  beachBoats: BEACH_BOATS.map((b) => ({ ...b, ...P(b.s, b.d) })),
  spots: WATERFRONT_SPOTS,
};

// One emissive material for everything that glows at night here (tube lights, lamp lenses, boat lights).
const GLOW_MAT = new THREE.MeshStandardMaterial({ color: 0xe8eef0, emissive: 0xf2f7ff, emissiveIntensity: 0, roughness: 0.6, metalness: 0 });

// ---- Building --------------------------------------------------------------------------------------------
export function createWaterfront(scene, deps) {
  const { groundAt, heightAt, keepClear } = deps;
  const root = new THREE.Group(); root.name = 'waterfront';
  const colliders = [], lamps = [], glowGeos = [];
  const geos = { market: [], yard: [], beach: [], pier: [] };
  const addPlatform = (p) => (deps.addPlatform ? deps.addPlatform(p) : null);
  // One placed thing: build it with the Mesher in its own frame, bake its AO (a fine crease grid of its own), and
  // file it under a group; its local colliders and lantern spots go to world space, its glowing bits to the glow mesh.
  function piece(group, o, y, build, { pitch = 0, roll = 0, ground = groundAt, light = false } = {}) {
    const m = new Mesher(); m.frame(o.x, y, o.z, o.ry || 0, pitch, roll);
    const made = build(m) || {};
    const gm = m.buildGlow(GLOW_MAT); if (gm) glowGeos.push(gm.geometry);
    const mesh = m.build(); if (!mesh) return made;
    const g = mesh.geometry; bakeAO(g, { ground }); geos[group].push(g);
    for (const c of made.colliders || []) { const p = toW(o, c.x, c.z); colliders.push(c.r !== undefined ? { x: p.x, z: p.z, r: c.r } : { x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: (c.rot || 0) + (o.ry || 0) }); }
    for (const l of made.glow || []) { const p = toW(o, l.x, l.z); lamps.push({ x: p.x, y: y + l.y, z: p.z, n: null, r: 0.085, light }); }
    return made;
  }
  // The lowest ground under a footprint (local corners), so posts stand on the ground and the uphill side sinks in.
  const footY = (o, hw, z0, z1) => Math.min(...[[-hw, z0], [hw, z0], [-hw, z1], [hw, z1], [0, (z0 + z1) / 2]].map(([lx, lz]) => { const p = toW(o, lx, lz); return groundAt(p.x, p.z); }));
  // Repeated small things are instanced: one pool per kind. `put` stands one on whatever is under it (sand, slab, deck).
  const pools = { crate: [], plastic: [], full: [], buoy: [], basket: [], drum: [], styro: [], cool: [], bollard: [], tyre: [] };
  const putW = (kind, p, ry = 0, c = 0xffffff, lift = 0, sc = 1, y = null) => pools[kind].push({ x: p.x, y: (y ?? groundAt(p.x, p.z)) + lift - 0.01, z: p.z, ry, c, s: sc, lift });
  const put = (kind, s, d, ry = 0, c = 0xffffff, lift = 0, sc = 1) => putW(kind, P(s, d), ry, c, lift, sc);

  // ==== 1. The fish auction hall ==========================================================================
  const hallO = { ...P(HS, HD), ry: SEA }, padY = groundAt(hallO.x, hallO.z), slabTop = padY + HALL.SL;
  const inSlab = (x, z, m = 0) => { const dx = x - hallO.x, dz = z - hallO.z, ls = dx * WF.ax + dz * WF.az, ld = dx * WF.nx + dz * WF.nz; return Math.abs(ls) < HW / 2 - m && Math.abs(ld) < HDp / 2 - m; };
  const hallGround = (x, z) => (inSlab(x, z, 0.03) ? slabTop : heightAt(x, z));
  const slab = addPlatform({ shape: 'box', x: hallO.x, z: hallO.z, rot: SEA, hw: HW / 2, hd: HDp / 2, top: slabTop, surface: 'rock', id: 'fish-hall' });
  const hall = piece('market', hallO, padY, (m) => fishHall(m, { W: HW, D: HDp, openings: OPENINGS }), { ground: hallGround });
  // Steps and ramps are walkable slopes from the slab's edge down to the ground.
  const ramps = [];
  for (const o of OPENINGS) {
    if (o.kind === 'none') continue;
    const len = o.kind === 'ramp' ? o.len : 1.0;
    const [a, b] = { w: [[-HW / 2, o.at], [-HW / 2 - len, o.at]], s: [[o.at, HDp / 2], [o.at, HDp / 2 + len]], n: [[o.at, -HDp / 2], [o.at, -HDp / 2 - len]] }[o.side].map(([x, z]) => toW(hallO, x, z));
    ramps.push(addPlatform({ shape: 'strip', a, b, width: o.w, y0: slabTop, y1: heightAt(b.x, b.z) + 0.02, surface: 'rock', id: `fish-hall-${o.side}` }));
  }
  WATERFRONT.hall = { slabTop, padY, platform: slab, ramps, tubes: (hall.tubes || []).map((t) => ({ ...toW(hallO, t.x, t.z), y: padY + t.y })) };
  keepClear(hallO.x, hallO.z, 16);
  // The auction floor: four rows of crates of fish (blue and red), some styrofoam boxes among them; one collider per row.
  AUCTION.rows.forEach((z, r) => {
    for (let i = 0; i < AUCTION.n; i++) {
      const x = AUCTION.x0 + i * AUCTION.step, p = toW(hallO, x, z), k = (i * 3 + r * 5) % 7;
      if (k === 3) putW('styro', p, SEA + 0.05 * (i % 3), 0xffffff, 0, 1, slabTop);
      else putW('full', p, SEA + (k - 3) * 0.03, [0x2f6fc0, 0xd9463a, 0x2f6fc0, 0x3a7fc0, 0xd9463a, 0x2f6fc0, 0xc9453a][k], 0, 1, slabTop);
      if ((i + r) % 5 === 0) putW('plastic', p, SEA + 0.1, r % 2 ? 0xd9463a : 0x2f6fc0, 0.29, 1, slabTop);
    }
    const c = toW(hallO, AUCTION.x0 + (AUCTION.n - 1) * AUCTION.step / 2, z); colliders.push({ x: c.x, z: c.z, hw: (AUCTION.n * AUCTION.step) / 2, hd: 0.24, rot: SEA });
  });
  // Styrofoam and cool boxes by the ice corner and the scale, blue drums by the office tap, crates waiting to go out.
  const hw = (x, z) => toW(hallO, x, z);
  for (const [x, z, n] of [[12.4, 0.3, 3], [12.5, -0.5, 2], [11.8, -0.2, 1]]) for (let k = 0; k < n; k++) putW('styro', hw(x, z), SEA + 0.08 * k, 0xffffff, k * 0.36, 1, slabTop);
  for (const [x, z, n] of [[4.2, -0.1, 2], [4.6, 0.25, 1]]) for (let k = 0; k < n; k++) putW('styro', hw(x, z), SEA + 0.3, 0xffffff, 0.09 + k * 0.36, 1, slabTop);
  for (const [x, z, c, ry] of [[10.4, 4.9, 0x2f6fc0, 0], [11.7, 4.9, 0xf2873a, 0.05], [12.6, 3.9, 0x2f6fc0, 1.6]]) putW('cool', hw(x, z), SEA + ry, c, 0, 1, slabTop);
  putW('cool', hw(10.4, 4.9), SEA + 0.12, 0x3f9f6a, 0.76, 1, slabTop);
  colliders.push({ ...hw(11.4, 4.6), hw: 1.6, hd: 0.6, rot: SEA }, { ...hw(12.6, 3.9), r: 0.5 }, { ...hw(12.3, -0.1), r: 0.55 });
  for (const [x, z] of [[7.3, -1.55], [6.7, -1.75], [7.05, -0.95]]) { putW('drum', hw(x, z), 0, PCOL.drum, 0, 1, slabTop); colliders.push({ ...hw(x, z), r: 0.3 }); }
  for (const [x, z, n, c] of [[5.6, 4.3, 3, 0x2f6fc0], [6.2, 4.4, 2, 0xd9463a], [5.9, 3.8, 2, 0x2f6fc0]]) for (let k = 0; k < n; k++) putW('full', hw(x, z), SEA + 0.1 * k, c, k * 0.28, 1, slabTop);
  colliders.push({ ...hw(5.9, 4.15), r: 0.55 });
  // The forecourt: a concrete apron with parking lines, the truck, motorbikes, a sign, blue drums and crates.
  piece('market', hallO, padY, (m) => {
    m.box(HW, 0.1, 4.2, 0xbab5aa, 0, 0.0, -HDp / 2 - 2.1);
    for (const x of [-9.5, 5.0, 11.0]) m.box(0.08, 0.012, 3.4, PCOL.white, x, 0.055, -HDp / 2 - 2.2);
    m.box(HW - 1, 0.012, 0.08, PCOL.trim, 0, 0.055, -HDp / 2 - 0.35);
    signboard(m, -HW / 2 - 0.6, 0, -HDp / 2 - 3.2, -Math.PI / 2 + 0.4, 1.4, 0.6, 0x2f8f9f, 2.0);
    return { colliders: [{ x: -HW / 2 - 0.6, z: -HDp / 2 - 3.2, r: 0.1 }] };
  });
  { const p = hw(8.0, -HDp / 2 - 2.3); piece('market', { ...p, ry: WEST }, padY + 0.05, (m) => smallTruck(m)); }
  [[-12.6, 0xd9463a, true], [-11.6, 0x2f6fb0, false], [-10.6, 0x3a3f44, true], [12.0, 0xf2c03b, false]].forEach(([x, c, box], i) => {
    const p = hw(x, -HDp / 2 - 2.6); piece('market', { ...p, ry: LAND + 0.15 - i * 0.07 }, padY + 0.05, (m) => motorbike(m, c, box));
  });
  for (const [x, z] of [[12.9, -HDp / 2 - 0.9], [12.3, -HDp / 2 - 0.8]]) { putW('drum', hw(x, z), 0, 0x2f6fc0, 0, 1, padY + 0.05); colliders.push({ ...hw(x, z), r: 0.3 }); }
  for (let k = 0; k < 3; k++) putW('styro', hw(11.2, -HDp / 2 - 0.9), SEA + 0.1 * k, 0xffffff, k * 0.36, 1, padY + 0.05);
  colliders.push({ ...hw(11.2, -HDp / 2 - 0.9), r: 0.4 });
  paintGround({ kind: 'gravel', rect: { x: hallO.x, z: hallO.z, rot: SEA, hw: HW / 2 + 1.2, hd: HDp / 2 + 5.2 }, edge: 1.4, ragged: 0.55, strength: 0.8, tag: 'waterfront' });
  keepClear(hw(0, -HDp / 2 - 2.5).x, hw(0, -HDp / 2 - 2.5).z, 12);

  // ==== 2. The concrete pier, its T-head, the ship and the boats alongside ===============================
  const pierO = { ...P(PR.s, 0), ry: SEA }, DECK = PR.deck, RAMP = PR.ramp;
  const bedAt = (lx, lz) => { const p = toW(pierO, lx, lz); return heightAt(p.x, p.z); };
  const pierGround = (x, z) => heightAt(x, z);
  const H0 = HEAD.s0 - PR.s, H1 = HEAD.s1 - PR.s, HZ0 = HEAD.d0, HZ1 = HEAD.d1, PW = PR.w;
  piece('pier', pierO, 0, (m) => {
    const cols = [];
    // the ramp down from the slab, then the level deck and the T-head: a concrete deck with darker edge beams
    const rampDrop = slabTop - DECK, rampLen = Math.hypot(RAMP, rampDrop), pitch = Math.atan2(rampDrop, RAMP);
    m.at(new THREE.BoxGeometry(PW, 0.4, rampLen), PCOL.concrete, 0, (slabTop + DECK) / 2 - 0.2, RAMP / 2, pitch, 0, 0);
    m.at(new THREE.BoxGeometry(PW - 0.1, 0.02, rampLen), PCOL.concreteLt, 0, (slabTop + DECK) / 2 + 0.005, RAMP / 2, pitch, 0, 0);
    for (const s of [-1, 1]) m.at(new THREE.BoxGeometry(0.22, 0.2, rampLen), PCOL.concreteLt, s * (PW / 2 - 0.11), (slabTop + DECK) / 2 + 0.1, RAMP / 2, pitch, 0, 0);
    const L = HZ0 - RAMP;
    m.box(PW, 0.4, L, PCOL.concrete, 0, DECK - 0.2, RAMP + L / 2); m.box(PW - 0.1, 0.02, L, PCOL.concreteLt, 0, DECK + 0.005, RAMP + L / 2);
    m.box(H1 - H0, 0.45, HZ1 - HZ0, PCOL.concrete, (H0 + H1) / 2, DECK - 0.225, (HZ0 + HZ1) / 2); m.box(H1 - H0 - 0.1, 0.02, HZ1 - HZ0 - 0.1, PCOL.concreteLt, (H0 + H1) / 2, DECK + 0.005, (HZ0 + HZ1) / 2);
    m.box(H1 - H0 + 0.04, 0.12, HZ1 - HZ0 + 0.04, PCOL.concreteDk, (H0 + H1) / 2, DECK - 0.4, (HZ0 + HZ1) / 2);
    // curbs with yellow paint every other metre along the pier and round the T-head (open where the pier joins)
    const curb = (x, z, w, d) => m.box(w, 0.2, d, PCOL.concreteLt, x, DECK + 0.1, z);
    for (const s of [-1, 1]) { curb(s * (PW / 2 - 0.11), RAMP + L / 2, 0.22, L); cols.push({ x: s * (PW / 2 - 0.05), z: (RAMP + HZ0) / 2, hw: 0.12, hd: L / 2 + RAMP / 2 }); }
    curb((H0 + H1) / 2, HZ1 - 0.11, H1 - H0, 0.22); cols.push({ x: (H0 + H1) / 2, z: HZ1 - 0.05, hw: (H1 - H0) / 2, hd: 0.12 });
    for (const x of [H0 + 0.11, H1 - 0.11]) { curb(x, (HZ0 + HZ1) / 2, 0.22, HZ1 - HZ0); cols.push({ x: x + Math.sign(x) * 0.06, z: (HZ0 + HZ1) / 2, hw: 0.12, hd: (HZ1 - HZ0) / 2 }); }
    for (const [a, b] of [[H0, -PW / 2], [PW / 2, H1]]) { curb((a + b) / 2, HZ0 + 0.11, b - a, 0.22); cols.push({ x: (a + b) / 2, z: HZ0 + 0.05, hw: (b - a) / 2, hd: 0.12 }); }
    for (let z = RAMP + 0.5; z < HZ0 - 0.5; z += 2) for (const s of [-1, 1]) m.box(0.23, 0.012, 1.0, PCOL.trim, s * (PW / 2 - 0.11), DECK + 0.205, z);
    for (let x = H0 + 1; x < H1 - 1; x += 2) m.box(1.0, 0.012, 0.23, PCOL.trim, x, DECK + 0.205, HZ1 - 0.11);
    // piles: square concrete piles in pairs under the pier and in two rows under the T-head, on pile caps; a band of
    // weed and barnacles round each where the tide washes it
    const pile = (x, z) => {
      const bed = bedAt(x, z), topY = DECK - 0.75, bot = bed - 0.6, h = topY - bot;
      m.box(0.4, h, 0.4, PCOL.concreteDk, x, bot + h / 2, z);
      if (bed < 0.6) { m.box(0.44, 0.75, 0.44, PCOL.weed, x, -0.2, z); m.box(0.43, 0.12, 0.43, 0xd8d4c4, x, 0.25, z); }
    };
    for (let z = RAMP; z <= HZ0 - 1; z += 4) { for (const s of [-1, 1]) pile(s * 1.5, z); m.box(PW + 0.3, 0.38, 0.55, PCOL.concrete, 0, DECK - 0.58, z); }
    for (let x = H0 + 1; x <= H1 - 0.9; x += 4) { for (const z of [HZ0 + 0.6, HZ1 - 0.6]) pile(x, z); m.box(0.55, 0.38, HZ1 - HZ0 - 0.4, PCOL.concrete, x, DECK - 0.62, (HZ0 + HZ1) / 2); }
    // the ladder down the T-head's seaward face, between the kapal motor and the ship
    const lx = 18.5 - PR.s, lz = HZ1 + 0.08;
    for (const s of [-1, 1]) m.rod([lx + s * 0.22, DECK + 0.9, lz], [lx + s * 0.22, -1.9, lz], 0.03, 0.03, PCOL.steel, 5);
    for (let y = -1.7; y < DECK; y += 0.3) m.rod([lx - 0.22, y, lz], [lx + 0.22, y, lz], 0.018, 0.018, PCOL.steel, 4);
    // the gangway onto the ship, a hand cart of crates and a tarp shade at the pier head
    const gx = 31 - PR.s;
    m.push(gx, DECK + 0.05, HZ1 - 0.2, 0, -0.03);
    m.box(0.8, 0.05, 2.3, 0xbfc4c4, 0, 0, 1.0); for (let z = 0; z < 2.2; z += 0.3) m.box(0.8, 0.02, 0.04, PCOL.steelDk, 0, 0.035, z);
    for (const s of [-1, 1]) { m.rod([s * 0.4, 0, 0], [s * 0.4, 0.9, 0.0], 0.02, 0.02, PCOL.steel, 4); m.rod([s * 0.4, 0, 2.1], [s * 0.4, 0.9, 2.1], 0.02, 0.02, PCOL.steel, 4); m.rod([s * 0.4, 0.9, 0], [s * 0.4, 0.9, 2.1], 0.02, 0.02, PCOL.steel, 4); }
    m.pop();
    m.push(30.0 - PR.s, DECK, 53.6, Math.PI / 2 + 0.2); handCart(m); m.pop();
    cols.push({ x: 30.0 - PR.s, z: 53.6, hw: 0.45, hd: 0.7, rot: Math.PI / 2 + 0.2 });
    // lamp posts along the pier and on the T-head: a grey pole, an arm, a lamp head whose lens glows at night
    const lampsHere = [[1.75, 14, -1], [-1.75, 26, 1], [1.75, 38, -1], [-1.75, 50, 1], [H0 + 1.5, 54.5, 1], [H1 - 1.5, 54.5, -1]];
    for (const [x, z, dir] of lampsHere) {
      m.rod([x, DECK + 0.2, z], [x, DECK + 4.0, z], 0.07, 0.05, 0x9aa4a8, 6); m.rod([x, DECK + 3.95, z], [x + dir * 0.7, DECK + 4.05, z], 0.035, 0.035, 0x9aa4a8, 4);
      m.box(0.5, 0.12, 0.24, 0x5f686e, x + dir * 0.85, DECK + 4.02, z); m.at(new THREE.BoxGeometry(0.42, 0.03, 0.18), 0xffffff, x + dir * 0.85, DECK + 3.95, z, 0, 0, 0, 1, 1, 1, true);
      cols.push({ x, z, r: 0.12 });
      const p = toW(pierO, x + dir * 0.85, z); lamps.push({ x: p.x, y: DECK + 3.9, z: p.z, n: null, r: 0.06, light: false });
    }
    return { colliders: cols };
  }, { ground: pierGround });
  const pierPlat = [
    addPlatform({ shape: 'strip', a: P(PR.s, 0), b: P(PR.s, RAMP), width: PW - 0.2, y0: slabTop, y1: DECK, surface: 'rock', id: 'pier-ramp' }),
    addPlatform({ shape: 'box', ...P(PR.s, (RAMP + HZ0) / 2), rot: SEA, hw: PW / 2, hd: (HZ0 - RAMP) / 2 + 0.05, top: DECK, surface: 'rock', id: 'pier' }),
    addPlatform({ shape: 'box', ...P((HEAD.s0 + HEAD.s1) / 2, (HZ0 + HZ1) / 2), rot: SEA, hw: (H1 - H0) / 2, hd: (HZ1 - HZ0) / 2, top: DECK, surface: 'rock', id: 'pier-head' }),
  ];
  WATERFRONT.pier = { deckTop: DECK, rampTop: slabTop, platforms: pierPlat, foot: P(PR.s, 0), end: P(PR.s, HZ0), head: { a: P(HEAD.s0, (HZ0 + HZ1) / 2), b: P(HEAD.s1, (HZ0 + HZ1) / 2) } };
  // Bollards along the T-head's seaward edge and a pair along the pier; tyre fenders hung on the seaward face.
  for (let x = H0 + 2; x <= H1 - 2; x += 4) { const p = toW(pierO, x, HZ1 - 0.45); putW('bollard', p, 0, 0xffffff, 0, 1, DECK); colliders.push({ ...p, r: 0.24 }); }
  for (const z of [22, 42]) for (const s of [-1, 1]) { const p = toW(pierO, s * 1.45, z); putW('bollard', p, 0, 0xffffff, 0, 0.85, DECK); colliders.push({ ...p, r: 0.2 }); }
  for (let x = H0 + 1.2; x <= H1 - 1.2; x += 2.5) { if (Math.abs(x - (18.5 - PR.s)) < 1) continue; const p = toW(pierO, x, HZ1 + 0.16); putW('tyre', p, SEA, 0xffffff, 0, 1, DECK - 0.75); }
  for (const z of [48, 50.5]) for (const s of [-1, 1]) { const p = toW(pierO, s * (PW / 2 + 0.15), z); putW('tyre', p, SEA + s * Math.PI / 2, 0xffffff, 0, 0.9, DECK - 0.7); }
  // The crates waiting at the pier head for the ship: a stack of fish crates and styrofoam boxes beside the cart.
  for (const [s, d, n, kind, c] of [[26.6, 52.9, 3, 'full', 0x2f6fc0], [27.2, 52.9, 3, 'full', 0xd9463a], [26.9, 53.35, 2, 'full', 0x2f6fc0], [27.9, 52.8, 3, 'styro', 0xffffff], [28.5, 52.85, 2, 'styro', 0xffffff], [28.4, 53.4, 2, 'full', 0xd9463a]]) {
    for (let k = 0; k < n; k++) putW(kind, P(s, d), EAST + 0.05 * k, c, k * (kind === 'styro' ? 0.36 : 0.28), 1, DECK);
  }
  colliders.push({ ...P(27.5, 53.1), hw: 1.3, hd: 0.45, rot: SEA });
  // Water slaps the piles standing in the sea (a few of them; the shader keeps the nearest).
  for (let z = 32; z <= HZ0; z += 8) for (const s of [-1, 1]) { const p = toW(pierO, s * 1.5, z); waterObstacles.add(p.x, p.z, 0.22, 1); }
  for (let x = H0 + 1; x <= H1; x += 8) { const p = toW(pierO, x, HZ1 - 0.6); waterObstacles.add(p.x, p.z, 0.22, 1); }

  // ==== 3. The fishermen's yard ==========================================================================
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
  for (const [s, d, len, hex, seed] of [[-4.0, -1.2, 4.2, COL.net, 1], [-0.2, 1.0, 3.0, COL.netOr, 4], [-25.0, 3.0, 3.4, COL.netBlue, 2]]) {
    const o = { ...P(s, d), ry: SEA + (seed > 2 ? 0.05 : -0.04) };
    piece('yard', o, footY(o, len / 2, -0.1, 0.1) - 0.02, (m) => { netRack(m, len, hex, seed); return { colliders: [{ x: 0, z: 0, hw: len / 2 + 0.1, hd: 0.3 }] }; });
    keepClear(o.x, o.z, len / 2 + 1);
  }
  { const o = { ...P(-2.5, 2.0), ry: EAST }; piece('yard', o, footY(o, 0.6, -1.6, 1.6) - 0.02, (m) => boatOnTrestles(m, HULLS[4], 3)); keepClear(o.x, o.z, 3.5); }
  { const o = { ...P(-14.6, -3.3), ry: SEA + 0.2 }; piece('yard', o, footY(o, 1, -0.4, 0.5) - 0.02, (m) => oarRack(m, 5)); }
  { const o = { ...P(-22.0, 1.2), ry: SEA }; piece('yard', o, footY(o, 1.6, -0.5, 0.5) - 0.02, (m) => dryingRack(m, 3.2, 1)); keepClear(o.x, o.z, 2.5); }
  // Modern gear beside the old: a repair bench, outboards on stands, fuel drums (blue plastic and orange steel).
  { const o = { ...P(1.6, 4.0), ry: LAND + 0.1 }; piece('yard', o, footY(o, 1.1, -0.4, 0.4) - 0.02, (m) => workbench(m)); keepClear(o.x, o.z, 2); }
  for (const [s, d, ry] of [[4.0, 5.6, SEA + 0.5], [-13.4, 3.8, SEA - 0.3]]) { const o = { ...P(s, d), ry }; piece('yard', o, footY(o, 0.6, -0.4, 0.4) - 0.02, (m) => engineStand(m)); }
  for (const [s, d, c] of [[-0.6, 5.9, PCOL.drum], [-0.0, 6.4, PCOL.drum], [-1.1, 6.5, 0xe8703a], [-14.8, 4.6, 0xe8703a], [-15.4, 5.1, PCOL.drum]]) { put('drum', s, d, 0, c); colliders.push({ ...P(s, d), r: 0.3 }); }
  piece('yard', { ...P(0.6, 6.9), ry: SEA }, groundAt(P(0.6, 6.9).x, P(0.6, 6.9).z) - 0.01, (m) => { jerryCan(m, 0, 0, 0, 0.2, 0xd9463a); jerryCan(m, 0.38, 0, 0.1, -0.3, 0xe8b03a); jerryCan(m, -0.36, 0, 0.05, 0.1, 0xd9463a); return { colliders: [{ x: 0, z: 0, r: 0.45 }] }; });
  // Piles of the fishermen's gear: crates, plastic crates, buoys and baskets (instanced), rope coils and cans.
  const pile = (s, d, seed) => {
    const r = (k) => { const v = Math.sin((seed + 1) * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
    const o = { ...P(s, d), ry: SEA + r(9) * 2 }, at = (lx, lz) => toW(o, lx, lz);
    putW('crate', at(0, 0), o.ry + r(1) * 0.4, 0xffffff); putW('crate', at(0.05, 0.02), o.ry + r(2) * 0.5 - 0.25, 0xcfc4b8, 0.3);
    putW('plastic', at(0.7, 0.1), o.ry + r(3), [0x3a7fc0, 0xd9463a, 0x3f9f6a][seed % 3]);
    putW('buoy', at(-0.55, 0.3), 0, 0xf2873a); putW('buoy', at(-0.75, -0.05), 0, 0xf2d03b, 0, 0.85); putW('buoy', at(-0.45, -0.3), 0, 0xe8503a, 0, 0.8);
    putW('basket', at(-0.1, -0.68), r(4) * 3, 0xffffff, 0, 0.8);
    piece('yard', o, groundAt(o.x, o.z) - 0.01, (m) => { ropeCoil(m, 0.4, 0, -0.55); jerryCan(m, 1.05, 0, -0.4, r(4)); return { colliders: [{ x: 0.2, z: 0, r: 0.75 }] }; });
  };
  pile(-14.3, 1.6, 0); pile(-6.2, 6.0, 1); pile(-17.6, 4.6, 3); pile(-26.0, 6.0, 2);
  for (const [s, d, k] of [[-9.6, 2.9, 0], [-0.8, 8.0, 1], [10.2, 6.0, 2], [-20.0, 9.0, 0]]) piece('yard', { ...P(s, d), ry: k }, groundAt(P(s, d).x, P(s, d).z) - 0.01, (m) => ropeCoil(m, 0, 0, 0, 0.22 + 0.03 * k, [COL.rope, 0x6f9fc0, 0xe0884a][k]));
  // Worn, packed earth round the yard's work places.
  { const c = P(-8, 0.5); paintGround({ kind: 'packed', rect: { x: c.x, z: c.z, rot: SEA, hw: 10.5, hd: 3.0 }, edge: 1.4, ragged: 0.7, strength: 0.45, tag: 'waterfront' }); }
  { const c = P(-17.5, 0.2); paintGround({ kind: 'packed', circle: { x: c.x, z: c.z, r: 2.2 }, edge: 1.2, ragged: 0.5, strength: 0.4, tag: 'waterfront' }); }

  // ==== 4. The boat beach ================================================================================
  BEACH_BOATS.forEach((b, i) => {
    const o = { ...P(b.s, b.d), ry: b.yaw }, L = b.kind === 'fibre' ? FIBRE.L : JUKUNG.len;
    const stern = toW(o, 0, -L * 0.42), bow = toW(o, 0, L * 0.42);
    const hs0 = groundAt(stern.x, stern.z), hb = groundAt(bow.x, bow.z), pitch = Math.atan2(hs0 - hb, L * 0.84);
    if (b.kind === 'fibre') {
      const keel = (hs0 + hb) / 2 + 0.17;
      piece('beach', o, keel + FIBRE.draft, (m) => {
        const made = fibreBoat(m, { colour: b.colour, canopy: b.canopy });
        m.push(0, -FIBRE.draft - 0.12, 0); rollers(m, [-1.9, 0.0, 1.9], 1.2); m.pop();
        return made;
      }, { pitch });
    } else {
      const keel = (hs0 + hb) / 2 + 0.17;
      piece('beach', o, keel, (m) => {
        jukung(m, { hull: HULLS[b.hull], sail: b.sail, gear: i % 3 !== 1 });
        m.push(0, -0.12, 0); rollers(m, [-1.45, 0.05, 1.5], 1.25); m.pop();
        return { colliders: JUKUNG_COLLIDERS };
      }, { pitch });
    }
    // An anchor out beyond the bow with its rope back to the boat, and floats on the sand beside it.
    if (i % 2 === 0) { const a = toW(o, 0.3, L / 2 + 1.6); piece('beach', { ...a, ry: b.yaw + Math.PI + 0.2 }, groundAt(a.x, a.z) - 0.02, (m) => anchor(m, 0, 0, 0, 0, 1.1)); }
    const f1 = toW(o, -0.95 - (b.kind === 'fibre' ? 0.3 : 0), -1.0), f2 = toW(o, 1.0 + (b.kind === 'fibre' ? 0.3 : 0), 1.4);
    pools.buoy.push({ ...f1, y: groundAt(f1.x, f1.z) - 0.02, ry: 0, c: [0xf2873a, 0xf2d03b, 0xe8503a][i % 3], s: 1 });
    if (i % 2) pools.buoy.push({ ...f2, y: groundAt(f2.x, f2.z) - 0.02, ry: 0, c: [0xf2d03b, 0xe8503a, 0xf2873a][i % 3], s: 0.85 });
    if (b.kind === 'fibre') { const j = toW(o, 1.3, -2.0); putW('drum', j, 0, PCOL.drum); colliders.push({ ...j, r: 0.3 }); }
    // Drag tracks: the keel's groove (and a jukung's floats' furrows), from the bow down to the water.
    if (b.launch || b.tracks) {
      for (const lx of b.kind === 'fibre' ? [0] : [0, -1.95, 1.95]) {
        const a = toW(o, lx, L * 0.4), e = P(b.s + lx * 0.95 + (b.yaw - SEA) * 18, 41);
        paintGround({ kind: 'damp', path: [a, { x: (a.x + e.x) / 2, z: (a.z + e.z) / 2 }, e], width: lx ? 0.28 : 0.55, ragged: 0.25, edge: 0.3, strength: lx ? 0.2 : 0.3, tag: 'waterfront-tracks' });
      }
    }
    keepClear(o.x, o.z, 4);
  });
  // The net spread on the sand for mending, two paddles laid by it.
  piece('beach', { ...P(-4.2, 8.5), ry: SEA + 0.06 }, groundAt(P(-4.2, 8.5).x, P(-4.2, 8.5).z) - 0.01, (m) => {
    netSpread(m, 3.0, COL.net, 2); paddle(m, [-1.9, 0.03, -1.3], [-0.2, 0.03, -1.55]); return { colliders: [{ x: 1.9, z: 0.1, r: 0.45 }] };
  });
  // The tide board at the waterline beside the jetty (its marks are metres of sea above mean sea level, 0 = today's sea).
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

  // ==== 5. Darto's jetty (the traditional one, by his hut) ==================================================
  {
    const L = JETTY.d1 - JETTY.d0, c = P(JETTY.s, (JETTY.d0 + JETTY.d1) / 2), jy = JETTY.deck - 0.5;
    const j = buildJetty(L, JETTY.piles);
    j.group.position.set(c.x, jy, c.z); j.group.rotation.y = SEA; root.add(j.group);
    const platform = addPlatform({ shape: 'box', x: c.x, z: c.z, rot: SEA, hw: 1.0, hd: L / 2, top: JETTY.deck, surface: 'wood', id: 'darto-jetty' });
    const o = { ...c, ry: SEA };
    for (const k of j.colliders || []) { const p = toW(o, k.x, k.z); colliders.push({ x: p.x, z: p.z, r: k.r }); }
    for (const l of j.lamps || []) { const p = toW(o, l.x, l.z); lamps.push({ x: p.x, y: jy + l.y, z: p.z, n: null, r: 0.12, light: true }); }
    for (let lz = -L / 2 + 0.5; lz <= L / 2 - 0.3; lz += 3.8) for (const s of [-1, 1]) { const p = toW(o, s * 1.12, lz); if (heightAt(p.x, p.z) < 0.05) waterObstacles.add(p.x, p.z, 0.12, 1); }
    WATERFRONT.jetty = { ...c, rot: SEA, length: L, deckTop: JETTY.deck, platform, pileBottom: jy - 0.1 - JETTY.piles, foot: P(JETTY.s, JETTY.d0), end: P(JETTY.s, JETTY.d1) };
    keepClear(P(JETTY.s, JETTY.d0).x, P(JETTY.s, JETTY.d0).z, 3);
  }

  // ==== Welding: one mesh each for the hall, the yard, the beach and the pier; the glow; the instanced pools ======
  for (const [name, list] of Object.entries(geos)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list), FLAT_MAT); mesh.name = `waterfront-${name}`;
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    for (const g of list) g.dispose();
  }
  if (glowGeos.length) { const gm = new THREE.Mesh(mergeGeometries(glowGeos), GLOW_MAT); gm.name = 'waterfront-glow'; root.add(gm); for (const g of glowGeos) g.dispose(); }
  const proto = (build, ground = 0) => { const m = new Mesher(); m.frame(); build(m); const g = m.build().geometry; bakeAO(g, { ground }); return g; };
  const PROTO = {
    crate: proto((m) => crate(m, 0, 0, 0, 0, COL.wood)),
    plastic: proto((m) => plasticCrate(m, 0, 0, 0, 0, 0xffffff, [0, 3, 1], 2)),
    full: proto((m) => plasticCrate(m, 0, 0, 0, 0, 0xffffff, [0, 1, 3, 5], 4)),
    buoy: proto((m) => buoy(m, 0, 0, 0, 0xffffff, 0.18)),
    basket: proto((m) => basket(m, 0, 0, 0, 0.26, [0, 2, 4], 1)),
    drum: proto((m) => drum(m)), styro: proto((m) => styroBox(m)), cool: proto((m) => coolBox(m)),
    bollard: proto((m) => bollard(m)), tyre: proto((m) => tyre(m), null),
  };
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  for (const [kind, list] of Object.entries(pools)) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(PROTO[kind], FLAT_MAT, list.length); im.name = `waterfront-${kind}`;
    list.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z); dummy.rotation.set(0, it.ry, 0); dummy.scale.setScalar(it.s || 1); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, col.setHex(it.c ?? 0xffffff));
    });
    im.castShadow = kind !== 'tyre'; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im);
    if (kind === 'crate' || kind === 'plastic') for (const it of list) if (!it.lift) colliders.push({ x: it.x, z: it.z, r: 0.3 * (it.s || 1) });
  }

  // ==== The boats on the water: moored ones and the pier's bob on the swell (a transform a frame) ============
  const boatGeo = (b, opts = {}) => {
    const m = new Mesher(); m.frame();
    let made;
    if (b.kind === 'ship') made = fishCarrier(m);
    else if (b.kind === 'kapal') made = kapalMotor(m, { variant: b.variant || 0, steel: !!b.steel });
    else if (b.kind === 'fibre') made = fibreBoat(m, { colour: b.colour || 0, canopy: !!b.canopy });
    else made = jukung(m, { hull: HULLS[b.hull], sail: b.sail, ...opts });
    const glow = m.buildGlow(GLOW_MAT);
    const g = m.build().geometry; bakeAO(g, { ground: null });
    return { g, glow, made };
  };
  const float = (b, i, cast) => {
    const p = P(b.s, b.d), { g, glow, made } = boatGeo(b, { anchor: true }), mesh = new THREE.Mesh(g, FLAT_MAT);
    if (glow) mesh.add(glow);
    mesh.rotation.order = 'YXZ'; mesh.castShadow = cast; mesh.receiveShadow = true; mesh.name = `waterfront-${b.kind}-${i}`; root.add(mesh);
    const big = b.kind === 'ship' ? 1 : b.kind === 'kapal' ? 0.6 : 0;
    const boat = { mesh, kind: b.kind, x: p.x, z: p.z, yaw: b.yaw, phase: i * 2.1 + 0.4, lift: b.kind === 'jukung' || !b.kind ? -JUKUNG.waterline : 0, amp: 1 - 0.75 * big };
    WATERFRONT.moored.push(boat);
    const o = { ...p, ry: b.yaw };
    if (b.kind !== 'jukung') for (const c of made.colliders || []) { const q = toW(o, c.x, c.z); colliders.push(c.r !== undefined ? { x: q.x, z: q.z, r: c.r } : { x: q.x, z: q.z, hw: c.hw, hd: c.hd, rot: (c.rot || 0) + b.yaw }); }
    else for (const c of JUKUNG_COLLIDERS) { const q = toW(o, c.x, c.z); colliders.push({ x: q.x, z: q.z, hw: c.hw, hd: c.hd, rot: b.yaw }); }
    // the water parts round the hull: one disc for a small boat, three along a long one
    const len = b.kind === 'ship' ? SHIP.L : b.kind === 'kapal' ? KAPAL.L : b.kind === 'fibre' ? FIBRE.L : JUKUNG.len;
    if (len > 8) for (const f of [-0.33, 0, 0.33]) { const q = toW(o, 0, f * len); waterObstacles.add(q.x, q.z, len > 15 ? 3.0 : 1.8, 2); }
    else waterObstacles.add(p.x, p.z, 1.0, 2);
    return boat;
  };
  MOORED.forEach((b, i) => float(b, i, true));
  AT_PIER.forEach((b, i) => { const boat = float(b, i + MOORED.length, true); if (b.kind === 'ship') WATERFRONT.ship = boat; });
  {
    const list = FAR.map((b) => { const { g } = boatGeo(b, { gear: false }), p = P(b.s, b.d); g.applyMatrix4(new THREE.Matrix4().makeRotationY(b.yaw).setPosition(p.x, b.kind === 'kapal' ? JUKUNG.waterline : 0, p.z)); return g; });
    const far = new THREE.Mesh(mergeGeometries(list), FLAT_MAT); far.castShadow = false; far.receiveShadow = false; far.name = 'waterfront-far'; root.add(far);
    WATERFRONT.far = far;
  }
  const bob = (boat, t, sea) => {
    const ph = boat.phase, m = boat.mesh, a = boat.amp;
    m.position.set(boat.x, sea + boat.lift + a * (0.06 * Math.sin(t * 1.15 + ph) + 0.025 * Math.sin(t * 2.3 + ph * 1.7)), boat.z);
    m.rotation.set(a * 0.03 * Math.sin(t * 0.95 + ph), boat.yaw + a * 0.02 * Math.sin(t * 0.21 + ph), a * 0.045 * Math.sin(t * 0.8 + ph * 1.3));
  };
  for (const b of WATERFRONT.moored) bob(b, 0, WATERFRONT.sea);
  scene.add(root);

  return {
    colliders, lamps, root,
    debug: { WATERFRONT, WATERFRONT_SPOTS, root },
    // The walking network: nodes and links joined to the village's (hamlet.js passes its own node/link helpers).
    network(node, link, rampFoot, rampTop) {
      const N = (id, s, d) => node(id, P(s, d)), NH = (id, x, z) => node(id, P(hs(x), hdd(z)));
      N('wb0', -27, -3); N('wb1', -17, -6.6); N('wb2', -6, -4.5); N('wb3', 1.5, -6.5);
      // the hall: in at the west steps, along the seaward aisle (between the sea tables and the crates) to the pier ramp,
      // and along the inland aisle to the cart ramp and the office
      NH('wm0', -HW / 2 + 0.8, 0); NH('wm1', -11.6, 2.75); NH('wm2', -4.8, 2.75); NH('wm3', 16.7 - HS, 2.75); NH('wm4', 4.4, 1.6); NH('wm5', PR.s - HS, 3.2);
      NH('wa1', -11.6, -2.75); NH('wa2', -4.8, -2.75); NH('wa3', 18.5 - HS, -2.75); NH('wa4', 4.4, -2.0); NH('wo', 7.8, -4.0);
      N('wf0', 18.5, -14.6); node('wf1', AREAS.paths.market[1]); node('wf2', AREAS.paths.market[2]);
      N('wp0', PR.s, 0.6); N('wp1', PR.s, RAMP); N('wp2', PR.s, 30); N('wp3', PR.s, HZ0 - 0.5); N('wp4', PR.s, (HZ0 + HZ1) / 2); N('wp5', 31, HZ1 - 0.6); N('wp6', 12, HZ1 - 0.6);
      N('wd0', -7.8, -0.5); N('wg0', 16.7, 1.0); N('wg1', 16.6, 5.0);
      N('ws0', -7.4, 3.3); N('ws1', -11, 3.0); N('ws2', -17.6, 3.0); N('ws3', -6.0, 9.0); N('ws4', 1.2, 9.0); N('ws5', 9.6, 6.5); N('ws6', 20.5, 8.0);
      node('wh', WATERFRONT_SPOTS.darto.door);
      const chain = (ids) => ids.forEach((id, i) => { if (i) link(ids[i - 1], id); });
      if (rampFoot) link(rampFoot, 'wb0');
      chain(['wb0', 'wb1', 'wb2', 'wb3', 'wm0', 'wm1', 'wm2', 'wm3', 'wm4', 'wm5', 'wp0', 'wp1', 'wp2', 'wp3', 'wp4', 'wp5']); link('wp4', 'wp6');
      chain(['wm0', 'wa1', 'wa2', 'wa3', 'wa4', 'wo']); link('wm4', 'wa4'); link('wa3', 'wf0'); chain(['wf0', 'wf1', 'wf2']);
      if (rampTop) link('wf2', rampTop);
      chain(['wb2', 'wd0', 'ws0']); chain(['wm3', 'wg0', 'wg1']);
      chain(['ws2', 'ws1', 'ws0', 'ws3', 'ws4', 'ws5', 'wg1', 'ws6']);
      link('wh', 'ws2'); link('wh', 'wb0');
    },
    update(dt, elapsed, player, night = 0) {
      const p = player.position, near = Math.hypot(p.x - MK.x, p.z - MK.z) < SHOW_WITHIN;
      root.visible = near;
      if (!near) return;
      GLOW_MAT.emissiveIntensity = Math.max(0, night - 0.15) * 2.2;
      const sea = WATERFRONT.sea;
      for (const b of WATERFRONT.moored) bob(b, elapsed, sea);
      if (WATERFRONT.far) WATERFRONT.far.position.y = sea - JUKUNG.waterline + 0.07 * Math.sin(elapsed * 0.6);
    },
  };
}
