// INTERNAL. The locals' village on its terraced hillside (docs/superpowers/specs/2026-11-16-living-village-design.md,
// sections 1, 4 and 5), now a modern Indonesian coastal town with a few heritage spots
// (docs/superpowers/specs/2026-11-17-modern-village-design.md; builders in src/kit/town.js). Everything stands on the
// plan in AREAS (src/config.js): on the eight plots, painted houses with fenced yards, a warung, a small mosque, a
// motorbike workshop, the village office with its flagpole and a cafe, all looking downhill; Grandmother Wulan's old
// stilt house (plot 5, heritage) with the carved post beside it; the old meeting hall on the top terrace (heritage);
// the square on the middle terrace with the well, the big banyan and a row of ruko shophouses where the market stalls
// stood; dry-stone retaining walls along every terrace face, stone steps up every flight, an asphalt cart ramp with low
// plastered fences, power poles and wires, streetlights that glow after dark, laundry lines; the pos ronda by the
// bridge landing and a minimarket and bus stop at the top of the ramp, on the road to the port. Ten locals (seven grown-ups, three children) keep a simple day:
// farm work in the morning, the market at midday, chores in the afternoon, home at dusk and indoors (hidden) at night.
// They walk the terrace walks, the steps and the ramp, never up a terrace face. Each one can be greeted.
//
// Cost: the hamlet kit and the yard kit each share one atlas material, so the heritage things, walls and steps are
// welded into TWO meshes; every town building is ONE more vertex-coloured mesh (AO baked per piece), its repeated props
// (scooters, chairs, tables, drums, bins, poles, streetlights) one InstancedMesh per kind, all wires one LineSegments,
// plus one mesh for the night glow and one cloud of halos. The ground under paths, the square and the yards is
// painted by the default stamps in src/world/ground.js. People skip their animation beyond 60 m, decide what to do
// about once a second, and the whole area is hidden past 75 m.
import * as THREE from 'three';
import { mergeStatic } from '../build.js';
import { AREAS } from '../../config.js';
import { resolveCollisions } from '../../logic/collision.js';
import { onTerraceFace } from '../../logic/terrain.js';
import { createFigure } from '../../actors/figure.js';
import { talkTime } from '../../actors/schedule.js';
import { buildStiltHouse, buildMeetingHall, buildEarthFill, buildWell, buildShadeTree, SHADE_TREE_BENCH } from '../../kit/hamlet.js';
import { buildYard, buildRetainingWall, buildStoneSteps, buildHedge, buildFlowerArch } from '../../kit/yard.js';
import {
  Mesher, TOWN_MAT, PROP_COLLIDE, STREETLIGHT_HEAD, house, ruko, warung, cafe, bengkel, mosque, kantorDesa, posRonda, minimarket, busStop, pickup,
  road, lowFence, laundryLine, carvedPost, poleLine, buildWires, instanceProps,
} from '../../kit/town.js';
import { bakeAO } from '../ao.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createWaterfront } from './waterfront.js';

const VF = AREAS.villageFrame, VP = AREAS.villagePoint, TER = AREAS.terraces;
const C = { x: AREAS.square.x, z: AREAS.square.z };   // the middle of the square
const SHOW_WITHIN = 75, BUILDINGS_WITHIN = 230, ANIMATE_WITHIN = 60, SHADOW_WITHIN = 16, DRY = 0.35;
const face = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
// A point given in a thing's own frame (it stands at x, z turned by ry) in world coordinates.
const toW = (o, lx, lz) => ({ x: o.x + lx * Math.cos(o.ry) + lz * Math.sin(o.ry), z: o.z - lx * Math.sin(o.ry) + lz * Math.cos(o.ry) });
// The heading straight downhill across the bowed terrace lines at `v` (the lines are ue = const; ue = u - bow (v - vc)^2).
function downAt(v) {
  const g = 2 * VF.bow * (v - VF.vc), l = Math.hypot(1, g), nu = -1 / l, nv = g / l;
  return Math.atan2(nu * VF.ux + nv * VF.vx, nu * VF.uz + nv * VF.vz);
}
// Rotation that runs a model's own +x from a to b (fences, hedges and walls run along +x).
const along = (a, b) => Math.atan2(-(b.z - a.z), b.x - a.x);
const laneV = (k) => TER[k].v1 + 2.5;
const WALK = [7.5, 19.7, 33.6, 52.6];   // the walk along the front of each terrace (ue), a little up from the painted line, clear of the steps' side walls

// ---- What stands where ---------------------------------------------------------------------------------
// House variant and yard variant for each plot in AREAS.plots (three on the low terrace, three on the second, two on top).
const YARD_SEED = [2, 6, 8, 9, 14, 17, 20, 23], HOUSE_V = [0, 0, 2, 3, 3, 1, 1, 2], YARD_V = [0, 4, 2, 1, 5, 1, 3, 0], TURN = [0.04, -0.05, 0.03, -0.03, 0.05, -0.04, 0.02, -0.02];
// What stands on each plot (the modern village design, section 2): a town builder and its options, or the heritage
// stilt house (HOUSE_V and YARD_V above still give plot 5 its old house and yard).
const PLOT_TOWN = [
  { fn: house, opts: { variant: 0 } }, { fn: house, opts: { variant: 1 } }, { fn: warung }, { fn: mosque },
  { fn: bengkel }, { heritage: true }, { fn: kantorDesa }, { fn: cafe },
];
// Hedges along one side of a plot: [plot, side] (side +1 toward +v / the south coast). Only beside the houses now.
const HEDGES = [[0, -1], [1, 1], [5, -1]];
// Props that people walk round (chairs are left out, so nobody sticks on one).
const SOLID_PROPS = new Set(['motorbike', 'table', 'cafeTable', 'drum', 'bin', 'pole', 'streetLight']);
// Path lamps (ue, v): up the main stair line, round the square and on the walks.
const LAMPS = [[4.5, -0.8], [13.5, -4.9], [25, -1.4], [35, -5.4], [47.2, -0.2], [54, -5.2], [8.6, 10], [20.6, -13], [34.6, -13], [39, 6.2], [53.6, 9.5], [21, 11.5]];
// Extra washing lines (ue, v), running uphill, between the plots on the low and second terraces.
const LINES_AT = [[13.4, -0.2], [26.6, 0.4]];
// The children's corner of the square, the two who stand chatting, and the farm work by the paddy under the village.
const PLAY = [[37, -6], [38.5, 1.5], [44.5, -6.5], [40.5, -9.5], [46, 0.5], [36, 2.8], [42, 3.2]];
const CHAT = [[38.4, -0.6], [39.5, 0.5]];
const PADDY = AREAS.paddyFields.find((p) => Math.hypot(p.x - 92, p.z + 83) < 1) || AREAS.paddyFields[0];
// What the locals say when greeted.
const LINES = [
  'Hello, little scout! Welcome to our village.',
  'The rice is growing tall this year. Have you seen the paddies?',
  'My boat brought in six fish at sunrise. Not bad, eh?',
  'Rain is coming tomorrow. I can smell it on the wind.',
  'At night we can hear you scouts singing across the river.',
  'Fresh mangoes today! Tomorrow too, if the monkeys leave us some.',
  'Mind the buffalo. She is friendly, but very big.',
  'When the big tree\'s shade reaches the well, it is time for lunch.',
  'Did you cross the plank bridge? Hold the rope, it wobbles!',
  'We plant the rice by hand, one little shoot at a time.',
  'Your camp flag looks lovely from our jetty.',
  'Drink plenty of water, the sun is strong today.',
];
const KID_LINES = ['Want to race me to the big tree?', 'I can climb higher than my brother!', 'Are you a real scout? Can you tie knots?', 'Shh, I am hiding from my sister!'];

// The people: shirt, trousers, skin, hair, a cap or a hair bow, a long tunic for the elder, and who they are.
const PEOPLE = [
  { role: 'keeper', stall: 0, home: 7, shirt: 0xe07a4f, shorts: 0x5b4a6a, skin: 0xc98d62, hair: 0x2f2826, accent: null, scale: 1.14 },
  { role: 'keeper', stall: 1, home: 2, shirt: 0x8fbf6a, shorts: 0x6b5a3a, skin: 0xe6b48a, hair: 0x4a3b36, accent: 'cap', accentColor: 0xf2b63b, scale: 1.18 },
  { role: 'keeper', stall: 2, home: 4, shirt: 0x4f9aa6, shorts: 0x3f4f6a, skin: 0x9a6a4a, hair: 0x2f2826, accent: 'cap', accentColor: 0xfaf3e2, scale: 1.2 },
  { role: 'farmer', home: 0, shirt: 0xd9634a, shorts: 0x4f5f7a, skin: 0xd9a273, hair: 0x3d3230, accent: 'cap', accentColor: 0xd8bb72, scale: 1.16 },
  { role: 'farmer', home: 1, shirt: 0xf2b63b, shorts: 0x5f4a3a, skin: 0xb07850, hair: 0x2f2826, accent: null, scale: 1.12 },
  { role: 'farmer', home: 3, shirt: 0xa66ad0, shorts: 0x4a4a5a, skin: 0xf1c7a0, hair: 0x8a5a3c, accent: null, scale: 1.15 },
  { role: 'elder', home: 5, shirt: 0xf3e6c8, shorts: 0x6b5a4a, skin: 0xc98d62, hair: 0xd8d2c8, accent: null, coat: 0x5f8f7a, scale: 1.1 },
  { role: 'kid', home: 5, shirt: 0xe48ab4, shorts: 0x4f7fc9, skin: 0xd9a273, hair: 0x2f2826, accent: 'bow', accentColor: 0xf2b63b, scale: 0.92 },
  { role: 'kid', home: 4, shirt: 0x5fa8a0, shorts: 0x8a6a4a, skin: 0x9a6a4a, hair: 0x2f2826, accent: null, scale: 0.96 }, // Adi: plot 6 is the village office now
  { role: 'kid', home: 2, shirt: 0xf2e29a, shorts: 0xa66a5f, skin: 0xe6b48a, hair: 0x5b4336, accent: 'cap', accentColor: 0xe8503a, scale: 0.9 },
];

// The parts of the day, as fractions of a day (0 = midnight).
function phaseOf(t) {
  if (t < 0.21 || t >= 0.86) return 'night';
  if (t < 0.42) return 'morning';
  if (t < 0.64) return 'midday';
  if (t < 0.78) return 'afternoon';
  return 'dusk';
}

export function create(scene, deps) {
  // ?nohamlet leaves the village out, for measuring what it costs.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nohamlet')) return {};
  const { heightAt, keepClear } = deps;
  const groundAt = deps.groundAt || heightAt;
  const village = new THREE.Group(), colliders = [], lampSpots = [];
  // Places a model: its local colliders and lamps go to world space. `tilt` leans it along its own x (fences on a slope).
  function place(made, o, y, tilt = 0) {
    made.group.position.set(o.x, y, o.z); made.group.rotation.set(0, o.ry, tilt); village.add(made.group);
    return record(made, o, y);
  }
  // A model's local colliders and lamps (window glow, lanterns, bulbs that only glow) in world space.
  function record(made, o, y) {
    for (const c of made.colliders || []) {
      const p = toW(o, c.x, c.z);
      colliders.push(c.r !== undefined ? { x: p.x, z: p.z, r: c.r } : { x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: (c.rot || 0) + o.ry });
    }
    for (const l of made.lamps || []) {
      const p = toW(o, l.x, l.z), n = l.window ? { x: l.nx * Math.cos(o.ry) + l.nz * Math.sin(o.ry), z: -l.nx * Math.sin(o.ry) + l.nz * Math.cos(o.ry) } : null;
      lampSpots.push({ x: p.x, y: y + l.y, z: p.z, n, r: l.r, light: l.light });
    }
    return made;
  }
  // A town model (src/kit/town.js), built straight into world space with its own Mesher and AO (a fine crease grid of
  // its own, the ground band from the terrain), filed for the town's one welded mesh; its props join the pools.
  // Its own glow pieces are dropped: the night glow is drawn from its lamp spots, like everything else here.
  const townGeos = [], townProps = [], spans = [];
  function townPiece(o, y, fn, opts = {}, { pitch = 0, roll = 0 } = {}) {
    const m = new Mesher(townGeos.length + 3); m.frame(o.x, y, o.z, o.ry || 0, pitch, roll);
    const made = fn(m, opts) || {}; m.glow = [];
    const mesh = m.build(); if (mesh) { bakeAO(mesh.geometry, { ground: groundAt }); townGeos.push(mesh.geometry); }
    for (const p of made.props || []) { const q = toW(o, p.x, p.z); townProps.push({ ...p, x: q.x, y: y + (p.y || 0), z: q.z, ry: (p.ry || 0) + (o.ry || 0) }); }
    return record(made, o, y);
  }
  // A low plastered fence from a to b, following the ground (it runs along its own +x, tilted along its length).
  function townRun(a, b, sink = 0.04) {
    const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 0.4) return;
    const ha = groundAt(a.x, a.z), hb = groundAt(b.x, b.z);
    townPiece({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, ry: along(a, b) }, (ha + hb) / 2 - sink, lowFence, { len }, { roll: Math.atan2(hb - ha, len) });
  }
  // A prop standing on the ground.
  const putProp = (kind, p, ry = 0, c = 0xffffff) => townProps.push({ kind, x: p.x, y: groundAt(p.x, p.z) - 0.02, z: p.z, ry, c });
  // A run of a boundary (it runs along +x from 0 to len) from a to b, following the ground along its length.
  function run(make, a, b, sink = 0.04) {
    const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 0.4) return;
    const ha = groundAt(a.x, a.z), hb = groundAt(b.x, b.z), made = make(len);
    place(made, { x: a.x, z: a.z, ry: along(a, b) }, ha - sink, Math.atan2(hb - ha, len));
  }

  const uvOf = (p) => { const dx = p.x - VF.o.x, dz = p.z - VF.o.z, u = dx * VF.ux + dz * VF.uz, v = dx * VF.vx + dz * VF.vz; return { ue: u - VF.bow * (v - VF.vc) ** 2, v }; };
  // ---- Houses, shops and civic buildings on the plots, and their yards -----------------------------------
  const doors = [];
  AREAS.plots.forEach((pl, i) => {
    const k = TER.findIndex((t) => t.id === pl.terrace), t = TER[k], spec = PLOT_TOWN[i], ry = downAt(pl.v) + TURN[i];
    // The back stands 0.55 m off the wall behind; the door looks down onto the terrace walk.
    let made, c, o;
    if (spec.heritage) {
      made = buildStiltHouse(HOUSE_V[i]);
      c = VP(t.u1 - 1.25 - made.colliders[0].hd, pl.v); o = { x: c.x, z: c.z, ry };
      place(made, o, t.y);
    } else {
      const hd = spec.fn(new Mesher().frame(), spec.opts || {}).footprint.hd; // a dry run for the size
      c = VP(t.u1 - 1.25 - hd, pl.v); o = { x: c.x, z: c.z, ry };
      // The yard is what is left before the terrace walk: a house's fence stands a metre short of the walk.
      const avail = uvOf(toW(o, 0, hd)).ue - WALK[k], opts = { ...(spec.opts || {}), seed: i + 1 };
      if (spec.fn === house) opts.fence = avail - 1.0 >= 1.0 ? Math.min(2.4, avail - 1.0) : 0;
      if (spec.fn === kantorDesa) opts.yard = Math.max(1.2, avail - 0.8);
      made = townPiece(o, t.y, spec.fn, opts);
    }
    const foot = made.stepFeet[0], door = toW(o, foot.x, foot.z + 1.0);
    // Where the way out of the door (straight on, through the yard's clear middle) meets the terrace walk.
    let out = door; for (let d = 0; d < 12 && uvOf(out).ue > WALK[k]; d += 0.1) out = toW(o, foot.x, foot.z + 1.0 + d);
    doors.push({ ...door, rot: ry + Math.PI, k, v: uvOf(out).v, out });
    keepClear(c.x, c.z, spec.heritage ? 4.5 : 5); keepClear(door.x, door.z, 2.5);
    if (!spec.heritage) return;
    // Heritage: the old yard in front of the door, and the elder's carved post beside the steps (story clue `carved-post`).
    townPiece({ ...toW(o, foot.x - 1.0, foot.z + 0.2), ry }, t.y - 0.02, carvedPost);
    // The yard in front of the door. On the low terrace it is shallow (the walk is close).
    // Its depth is what is left before the terrace walk (props further out are left out); a flower arch over the
    // way in where there is room and the yard has none of its own.
    const yo = { ...toW(o, foot.x, foot.z + 0.15), ry }, room = uvOf(yo).ue - WALK[k] - 0.9;
    place(buildYard(YARD_V[i], YARD_SEED[i], room - 0.6), yo, t.y - 0.02);
    if (room > 4.2 && YARD_V[i] !== 0 && YARD_V[i] !== 3) { const g = toW(o, foot.x, foot.z + 0.15 + Math.min(3.6, room - 0.7)); place(buildFlowerArch(), { ...g, ry }, t.y - 0.02); }
  });
  for (const [i, side] of HEDGES) {
    const pl = AREAS.plots[i], t = TER.find((q) => q.id === pl.terrace), v = pl.v + side * 3.6;
    run((len) => buildHedge(len, 0.85), VP(t.u1 - 0.9, v), VP(t.u1 - 5.6, v), 0.02);
  }

  // ---- The hall, the square, the stalls, the well and the banyan -------------------------------------
  const H = AREAS.hall, hallM = buildMeetingHall(), S = [H.w / 9, 1.2, 1.0]; // 11.7 m wide, 6 m deep: its steps reach the top walk
  hallM.group.scale.set(S[0], S[1], S[2]);
  hallM.colliders = hallM.colliders.map((c) => ({ ...c, x: c.x * S[0], z: c.z * S[2], hw: c.hw * S[0], hd: c.hd * S[2] }));
  hallM.lamps = hallM.lamps.map((l) => ({ ...l, x: l.x * S[0], y: l.y * S[1], z: l.z * S[2] }));
  place(hallM, { x: H.x, z: H.z, ry: H.front }, H.y); keepClear(H.x, H.z, 8);
  // The ruko row where the three market stalls stood (its shop fronts on their front line), and the town's new
  // corners: the pos ronda by the bridge landing, the minimarket and bus stop on the road to the port (level pads in
  // src/logic/terrain.js), a pickup parked at the square's east end.
  const T = AREAS.town, rukoO = { x: T.ruko.x, z: T.ruko.z, ry: T.ruko.rot };
  const rukoMade = townPiece(rukoO, T.ruko.y - 0.02, ruko, { seed: 2 }); keepClear(T.ruko.x, T.ruko.z, 7.5);
  for (const [fn, S] of [[posRonda, T.posRonda], [minimarket, T.minimarket], [busStop, T.busStop]]) {
    townPiece({ x: S.x, z: S.z, ry: S.rot }, groundAt(S.x, S.z) - 0.03, fn, { seed: 5 }); keepClear(S.x, S.z, Math.hypot(S.hw, S.hd) + 0.8);
  }
  { const p = VP(47.6, 13.4), o = { ...p, ry: Math.atan2(VF.vx, VF.vz) }; townPiece(o, groundAt(p.x, p.z) - 0.02, pickup, { color: 0xf2f0ea }); keepClear(p.x, p.z, 2.5); }
  const WELL = { x: AREAS.well.x, z: AREAS.well.z, ry: downAt(AREAS.well.v) + 0.5 };
  place(buildWell(), WELL, AREAS.well.y - 0.04); keepClear(WELL.x, WELL.z, 2.2);
  const B = AREAS.banyan, TREE = { x: B.x, z: B.z, ry: 0.3 }, treeBase = B.y - 0.02;
  place(buildShadeTree(), TREE, treeBase); keepClear(B.x, B.z, 7.5);
  keepClear(C.x, C.z, AREAS.square.r);

  // ---- Retaining walls along every terrace face, with gaps where the steps go up -------------------------
  for (let k = 0; k < TER.length - 1; k++) {
    const lo = TER[k], hi = TER[k + 1], v0 = Math.max(lo.v0, hi.v0) - 1.5, v1 = Math.min(lo.v1, hi.v1);
    const gaps = AREAS.steps.filter((s) => s.from === lo.id).map((s) => [s.v - s.width / 2 - 0.18, s.v + s.width / 2 + 0.18]);
    let spans = [[v0, v1]];
    for (const [a, b] of gaps) spans = spans.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, a], [b, e]])).filter(([s, e]) => e - s > 0.3);
    // The face climbs from ue u1 + 0.1 to u1 + 0.9, but the ground mesh (a vertex a metre) smears it about a metre
    // either way: the wall's front stands 0.7 m out on the lower terrace, and a block of earth behind it fills the
    // smear up to the upper terrace's level, so neither the clay face nor a dip behind the wall shows.
    const front = lo.u1 - 0.7, FILL = 2.3;
    for (const [s, e] of spans) {
      const n = Math.max(1, Math.ceil((e - s) / 2.2));
      for (let i = 0; i < n; i++) {
        const va = s + ((e - s) * i) / n, vb = s + ((e - s) * (i + 1)) / n, vm = (va + vb) / 2;
        const foot = Math.min(heightAt(VP(lo.u1 - 1.3, vm).x, VP(lo.u1 - 1.3, vm).z), lo.y), top = heightAt(VP(lo.u1 + 2.0, vm).x, VP(lo.u1 + 2.0, vm).z);
        if (top - foot < 0.25) continue;
        const a = VP(front, va - (i ? 0.03 : 0)), b = VP(front, vb + 0.03), len = Math.hypot(b.x - a.x, b.z - a.z), o = { x: a.x, z: a.z, ry: along(a, b) };
        place(buildRetainingWall(len, top - foot + 0.25), o, foot - 0.25);
        const f = buildEarthFill(len, FILL, top - foot + 0.25), fo = toW(o, 0, -0.5); f.group.position.set(fo.x, foot - 0.25 + 0.005, fo.z); f.group.rotation.y = o.ry; village.add(f.group);
      }
    }
  }
  // ---- Stone steps up every flight: their treads are a walkable strip (the terrain alone is a plain slope under them) ----
  const platforms = [];
  for (const s of AREAS.steps) {
    const o = { x: s.foot.x, z: s.foot.z, ry: Math.atan2(s.top.x - s.foot.x, s.top.z - s.foot.z) };
    const made = place(buildStoneSteps(s.width, s.y1 - s.y0, Math.hypot(s.top.x - s.foot.x, s.top.z - s.foot.z)), o, s.y0);
    for (const p of made.platforms || []) {
      platforms.push(deps.addPlatform ? deps.addPlatform({ shape: 'strip', a: toW(o, p.a.x, p.a.z), b: toW(o, p.b.x, p.b.z), width: p.width, y0: s.y0 + p.y0, y1: s.y0 + p.y1, surface: 'rock' }) : null);
    }
    keepClear(s.x, s.z, 2.2);
  }
  // ---- The cart ramp: an asphalt lane, low plastered fences along its open south side all the way up and on the north
  // side of each slope, power poles inside the south fence (and on along the road to the port) with their wires ----
  const rp = AREAS.ramp.path.map(uvOf);
  for (let i = 0; i < rp.length - 1; i++) {
    const a = rp[i], b = rp[i + 1], n = Math.max(1, Math.ceil(Math.abs(b.ue - a.ue) / 3));
    for (let j = 0; j < n; j++) {
      const p = (q) => VP(a.ue + (b.ue - a.ue) * q, a.v + (b.v - a.v) * q + 2.2);
      townRun(p(j / n), p((j + 1) / n));
      // the asphalt: a piece per stretch, following the ground (no kerbs: the lane is a village lane)
      const pa = VP(a.ue + (b.ue - a.ue) * (j / n), a.v + (b.v - a.v) * (j / n)), pb = VP(a.ue + (b.ue - a.ue) * ((j + 1) / n), a.v + (b.v - a.v) * ((j + 1) / n));
      const len = Math.hypot(pb.x - pa.x, pb.z - pa.z), ha = groundAt(pa.x, pa.z), hb = groundAt(pb.x, pb.z);
      if (len > 0.3) townPiece({ x: pa.x, z: pa.z, ry: along(pa, pb) }, ha - 0.035, road, { len: len + 0.05, width: 3, kerb: false, gutter: false }, { roll: Math.atan2(hb - ha, len) });
    }
  }
  for (const sl of AREAS.ramp.slopes) {
    const a = uvOf(sl.foot), b = uvOf(sl.top), v = Math.min(...TER.filter((t) => t.id === sl.from || t.id === sl.to).map((t) => t.v1)) + 0.75;
    // from the foot to just past the face line: above that the terrace walks come out onto the lane
    const u0 = a.ue + 0.5, u1 = (a.ue + b.ue) / 2 + 1.0;
    for (let j = 0; j < 2; j++) townRun(VP(u0 + (u1 - u0) * j / 2, v), VP(u0 + (u1 - u0) * (j + 1) / 2, v));
  }
  {
    const pts = [[2, 0], [13, 0], [24.5, 1], [41, 2], [57, 3]].map(([ue, k]) => VP(ue, TER[k].v1 + 2.5 + 1.85)).concat(T.poles).map((p) => ({ ...p, y: groundAt(p.x, p.z) - 0.05 }));
    const line = poleLine(pts); townProps.push(...line.props); spans.push(...line.spans);
    for (const p of pts) keepClear(p.x, p.z, 1);
  }
  // ---- Lamps, washing lines and a few things left about ----------------------------------------------
  // Streetlights where the path lamps stood, their arms reaching toward the square: the village's lit lamps.
  for (const [ue, v] of LAMPS) {
    const p = VP(ue, v), ry = face(p, C), y = groundAt(p.x, p.z) - 0.04, h = toW({ ...p, ry }, STREETLIGHT_HEAD.x, STREETLIGHT_HEAD.z);
    townProps.push({ kind: 'streetLight', x: p.x, y, z: p.z, ry, c: 0xffffff }); lampSpots.push({ x: h.x, y: y + STREETLIGHT_HEAD.y, z: h.z, n: null, r: 0.16 });
  }
  const lines = LINES_AT.map(([ue, v]) => { const a = VP(ue - 2.1, v), b = VP(ue + 2.1, v), c = VP(ue, v), o = { ...c, ry: along(a, b) }; townPiece(o, groundAt(c.x, c.z) - 0.03, laundryLine, { len: 4.2, seed: Math.round(ue) }); keepClear(c.x, c.z, 2.6); return o; });
  // Blue water drums where the clay jars stood.
  for (const [ue, v, n] of [[29.4, -21.8, 3], [54.2, 12.8, 2]]) for (let j = 0; j < n; j++) putProp('drum', VP(ue + (j % 2) * 0.62, v + j * 0.62), j, 0x3a7fc0);
  mergeStatic(village, { ao: { ground: groundAt } });
  // ---- The town: ONE welded mesh, the props one InstancedMesh per kind, all wires one LineSegments ----------------
  if (townGeos.length) {
    const tm = new THREE.Mesh(mergeGeometries(townGeos), TOWN_MAT); tm.name = 'town'; tm.castShadow = true; tm.receiveShadow = true; village.add(tm);
    for (const g of townGeos) g.dispose();
  }
  for (const im of instanceProps(townProps, { glow: false })) village.add(im);
  if (spans.length) village.add(buildWires(spans));
  for (const p of townProps) {
    const k = PROP_COLLIDE[p.kind]; if (!k || !SOLID_PROPS.has(p.kind)) continue;
    colliders.push(k.r !== undefined ? { x: p.x, z: p.z, r: k.r * (p.s || 1) } : { x: p.x, z: p.z, hw: k.hw, hd: k.hd, rot: p.ry || 0 });
  }
  scene.add(village);
  // ---- The fishing waterfront on the village's south shore (src/world/areas/waterfront.js): the fish market, the
  // fishermen's yard, the boat beach and Darto's jetty. Its colliders, lanterns and paths join the village's.
  const waterfront = createWaterfront(scene, { ...deps, groundAt, heightAt, keepClear });
  colliders.push(...waterfront.colliders); lampSpots.push(...waterfront.lamps);

  // ---- The walking network: terrace walks, the steps, the ramp and the way out to the paddy ---------------
  const NODES = {}, EDGES = [];
  const node = (id, p) => { NODES[id] = { x: p.x, z: p.z, id }; return id; };
  const link = (a, b) => EDGES.push([a, b]);
  // Each walk is a chain of nodes: fixed ones (the ends, the steps, the lane) and one in front of every door.
  const WV = [[-21, -14.5, -3, 4, 9.5, laneV(0)], [-21, -14.5, -3, 4, 10, laneV(1)], [-18, -14.5, -9, -3, 4, 11, laneV(2)], [-14, -8.5, -3, 4, 11, laneV(3)]];
  const doorNode = doors.map(() => null);
  WV.forEach((fixed, k) => {
    const vs = [...fixed.map((v) => ({ v })), ...doors.map((d, i) => ({ v: d.v, door: i })).filter((e) => doors[e.door].k === k)].sort((a, b) => a.v - b.v);
    vs.forEach((e, i) => { const id = e.door !== undefined ? `d${e.door}` : `w${k}_${fixed.indexOf(e.v)}`; node(id, e.door !== undefined ? doors[e.door].out : VP(WALK[k], e.v)); if (e.door !== undefined) doorNode[e.door] = id; e.id = id; if (i) link(vs[i - 1].id, id); });
  });
  const wAt = (k, v) => `w${k}_${WV[k].indexOf(v)}`;
  AREAS.steps.forEach((s, i) => {
    const k = TER.findIndex((t) => t.id === s.from), c = s.ue;
    node(`s${i}a`, VP(c - 2.0, s.v)); node(`s${i}b`, VP(c + 2.0, s.v));
    link(wAt(k, s.v), `s${i}a`); link(`s${i}a`, `s${i}b`); link(`s${i}b`, wAt(k + 1, s.v));
  });
  AREAS.ramp.path.forEach((p, i) => { node(`r${i}`, p); if (i) link(`r${i - 1}`, `r${i}`); });
  // Each terrace walk reaches the lane on the ramp's line: between these two points of the ramp path.
  [['r0', 'r1'], ['r2', 'r3'], ['r5', 'r6'], ['r8', 'r9']].forEach(([a, b], k) => { link(wAt(k, laneV(k)), a); link(wAt(k, laneV(k)), b); });
  node('bridge', AREAS.bridge.b); node('landing', VP(3, -1)); link('bridge', 'landing'); link('landing', wAt(0, -3));
  // Out to the farm along the painted path: from the square terrace's north end, down the spur's flank to the paddy.
  const fe = AREAS.paths.toFarmEast;
  node('f0', fe[0]); node('f1', fe[1]); node('f2', fe[2]); link(wAt(2, -18), 'f0'); link('f0', 'f1'); link('f1', 'f2');
  // Down to the waterfront: from the ramp's foot along the top of the beach to the market, down to the sand, and
  // from the market's east end back up to the ramp's top.
  waterfront.network(node, link, 'r0', `r${AREAS.ramp.path.length - 1}`);

  // Is the straight line from a to b clear of every building, dry, and never up or down a terrace face? `skipEnd`
  // metres at the b end are not checked (a keeper steps in behind the counter, a sitter onto the bench).
  const R = 0.33;
  function clear(a, b, skipEnd = 0) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / 0.3));
    let prev = a;
    for (let i = 0; i <= n; i++) {
      const u = i / n; if (len * (1 - u) < skipEnd) break;
      const p = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
      if (heightAt(p.x, p.z) < DRY) return false;
      if (i && onTerraceFace(prev, p, groundAt)) return false;
      const q = resolveCollisions(p, R, colliders);
      if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) > 1e-6) return false;
      prev = p;
    }
    return true;
  }
  // Into each ruko shop: a node on the pavement in front (where the customer stands), one at the gap beside the counter
  // and one behind it, so a keeper walks in round the counter, not through it. Units run east to west in the kit, so
  // they are taken in reverse: index i is the stall that stood there (0 = Lestari's, the west end).
  const SHOPS = rukoMade.spots.keepers.map((k, j) => ({ k, c: rukoMade.spots.customers[j] })).reverse();
  SHOPS.forEach(({ k, c }, i) => {
    const front = node(`k${i}`, toW(rukoO, c.x, c.z)), gap = node(`e${i}`, toW(rukoO, k.x + 1.65, c.z - 0.7)), back = node(`b${i}`, toW(rukoO, k.x + 1.65, k.z));
    link(front, gap); link(gap, back);
    const near = Object.keys(NODES).filter((n) => !/^[keb]\d$/.test(n)).sort((a, b) => Math.hypot(NODES[a].x - NODES[front].x, NODES[a].z - NODES[front].z) - Math.hypot(NODES[b].x - NODES[front].x, NODES[b].z - NODES[front].z));
    near.slice(0, 10).filter((n) => clear(NODES[n], NODES[front])).slice(0, 2).forEach((n) => link(n, front));
    if (i && clear(NODES[`k${i - 1}`], NODES[front])) link(`k${i - 1}`, front);
  });
  const names = Object.keys(NODES), adj = new Map(names.map((n) => [n, []]));
  for (const [a, b] of EDGES) { const d = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z); adj.get(a).push([b, d]); adj.get(b).push([a, d]); }
  // Shortest way between two nodes (a few dozen nodes: a plain search is plenty).
  function route(from, to) {
    const dist = new Map(names.map((n) => [n, Infinity])), prev = new Map(), left = new Set(names); dist.set(from, 0);
    while (left.size) {
      let u = null; for (const n of left) if (u === null || dist.get(n) < dist.get(u)) u = n;
      left.delete(u); if (u === to || dist.get(u) === Infinity) break;
      for (const [v, d] of adj.get(u)) if (dist.get(u) + d < dist.get(v)) { dist.set(v, dist.get(u) + d); prev.set(v, u); }
    }
    const out = [to]; while (out[0] !== from && prev.has(out[0])) out.unshift(prev.get(out[0]));
    return out.map((n) => NODES[n]);
  }
  // The nearest node reachable in a straight line from a spot.
  function joinOf(p, skipEnd = 0) {
    const byDist = names.slice().sort((a, b) => Math.hypot(NODES[a].x - p.x, NODES[a].z - p.z) - Math.hypot(NODES[b].x - p.x, NODES[b].z - p.z));
    for (const n of byDist.slice(0, 12)) if (clear(NODES[n], p, skipEnd)) return n;
    return byDist[0];
  }
  const spot = (p, rot, extra = {}) => { const s = { x: p.x, z: p.z, rot, ...extra }; s.join = joinOf(s, extra.skip || 0); return s; };

  // Spots people use.
  const homes = doors.map((d, i) => { const s = { x: d.x, z: d.z, rot: d.rot, hide: true, join: doorNode[i] }; return s; });
  // The ruko's keepers behind their counters and their customers under the awnings, unit by unit (the stalls' order).
  const keepers = SHOPS.map(({ k }) => spot(toW(rukoO, k.x, k.z), k.rot + rukoO.ry, { skip: 0.3, pose: 'explain' }));
  const customers = SHOPS.map(({ c }) => spot(toW(rukoO, c.x, c.z), c.rot + rukoO.ry));
  const toSquare = Math.atan2(C.z - B.z, C.x - B.x);
  const seat = (a) => { const r = SHADE_TREE_BENCH.r + 0.12; return spot({ x: B.x + Math.cos(a) * r, z: B.z + Math.sin(a) * r }, Math.atan2(Math.cos(a), Math.sin(a)), { skip: 1.2, sit: true }); };
  const seats = [seat(toSquare - 0.55), seat(toSquare), seat(toSquare + 0.6)];
  const ca = VP(...CHAT[0]), cb = VP(...CHAT[1]);
  const chat = [spot(ca, face(ca, cb)), spot(cb, face(cb, ca))];
  const wellSpot = spot(toW(WELL, 0, 1.75), WELL.ry + Math.PI, { pose: 'carry' });
  const washSpot = spot(toW(lines[0], 0.4, -1.0), lines[0].ry, { pose: 'carry' });
  // Farm work at the edge of the paddy below the village, facing the field.
  const ph = { x: Math.sin(PADDY.rot), z: Math.cos(PADDY.rot) }, pr = { x: Math.cos(PADDY.rot), z: -Math.sin(PADDY.rot) };
  const farm = [[-2.6, 'stir'], [0, 'hammer'], [2.6, 'carry'], [1.2, 'stir']].map(([k, pose], i) => {
    const d = PADDY.hd + 0.9 + (i === 3 ? 1.4 : 0);
    return spot({ x: PADDY.x + ph.x * d + pr.x * k, z: PADDY.z + ph.z * d + pr.z * k }, PADDY.rot + Math.PI, { pose });
  });
  const play = PLAY.map(([ue, v]) => spot(VP(ue, v), 0));
  const playLinks = play.map((a) => play.filter((b) => b !== a && clear(a, b)));

  // Where someone should be for a part of the day.
  function goal(p, phase) {
    const P = p.def;
    if (phase === 'night' || phase === 'dusk') return homes[P.home];
    if (P.role === 'keeper') return keepers[P.stall];
    if (P.role === 'kid') return null; // children roam the square
    if (P.role === 'elder') return phase === 'morning' ? wellSpot : phase === 'midday' ? seats[1] : chat[1];
    const k = p.k; // farmers: 3, 4, 5
    if (phase === 'morning') return farm[k - 3];
    if (phase === 'midday') return [customers[0], chat[0], seats[0]][k - 3];
    return [washSpot, farm[1], farm[3]][k - 3];
  }
  // A walk from where someone is now to a spot: to the nearest node, along the network, then in.
  function plan(p, to) {
    const from = p.at && p.at.join ? p.at.join : joinOf({ x: p.x, z: p.z });
    const pts = route(from, to.join);
    // Skip a first node that lies behind us on the way to the second, if the shortcut is clear.
    if (pts.length > 1) { const a = pts[0], b = pts[1]; if ((a.x - p.x) * (b.x - a.x) + (a.z - p.z) * (b.z - a.z) < 0 && clear(p, b)) pts.shift(); }
    return [...pts, to];
  }

  // ---- The people -----------------------------------------------------------------------------------
  const people = PEOPLE.map((def, k) => {
    const figure = createFigure({ bodyColor: def.shirt, shortsColor: def.shorts, skinColor: def.skin, hairColor: def.hair, accent: def.accent, accentColor: def.accentColor || 0xffffff, coat: def.coat || null, scale: def.scale });
    scene.add(figure.group);
    return { def, k, figure, x: 0, z: 0, rot: 0, speed: 0, go: 0, at: null, path: null, leg: 0, hidden: false, phase: null, think: k * 0.1, react: null, line: 0, kidWait: 0, stuck: 0,
      lean: (k * 0.0137) % 0.024 - 0.012, pace: 0.9 + ((k * 37) % 25) / 100 };
  });
  const startAt = (p, s) => { p.x = s.x; p.z = s.z; p.rot = s.rot; p.at = s; p.path = null; p.hidden = !!s.hide; };
  function decide(p, t, snap) {
    const phase = phaseOf((t + p.lean + 1) % 1);
    if (phase === p.phase && (p.def.role !== 'kid' || phase === 'night' || phase === 'dusk')) return;
    const changed = phase !== p.phase; p.phase = phase;
    let to = goal(p, phase);
    if (!to) { // a child: off to another play spot after a little while
      if (!changed && (p.path || (p.kidWait -= 1) > 0)) return;
      const here = p.at && play.includes(p.at) ? playLinks[play.indexOf(p.at)] : play;
      to = here[Math.floor(Math.random() * here.length)] || play[0]; p.kidWait = 2 + Math.random() * 6;
    }
    if (to === p.at && !p.path) return;
    // Snap there when no one is watching; and at nightfall anyone still out is simply indoors.
    if (snap || phase === 'night') { startAt(p, to); return; }
    p.hidden = false; p.path = plan(p, to); p.leg = 0; p.at = null; p.stuck = 0;
  }

  // ---- Night glow: windows and lanterns, and a soft halo round each lantern ------------------------------
  const glowGeos = [];
  for (const l of lampSpots) {
    let g;
    if (l.n) { g = new THREE.PlaneGeometry(0.62, 0.58); g.rotateY(Math.atan2(l.n.x, l.n.z)); g.translate(l.x - l.n.x * 0.12, l.y, l.z - l.n.z * 0.12); }
    else { g = new THREE.IcosahedronGeometry(l.r || 0.15, 0); g.translate(l.x, l.y, l.z); }
    g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    glowGeos.push(g);
  }
  const glow = new THREE.Mesh(mergeGeos(glowGeos), new THREE.MeshBasicMaterial({ color: 0xffcf7a })); glow.visible = false; scene.add(glow);
  const halos = lampSpots.filter((l) => !l.n), haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(halos.flatMap((l) => [l.x, l.y, l.z]), 3));
  const halo = new THREE.Points(haloGeo, new THREE.PointsMaterial({ color: 0xffb860, size: 2.4, map: haloTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.visible = false; scene.add(halo);

  // Start everyone where they would be at this time of day.
  const t0 = deps.dayTime ? deps.dayTime() : 0.45;
  const startT = typeof t0 === 'number' && Number.isFinite(t0) ? t0 : 0.45;
  for (const p of people) { startAt(p, homes[p.def.home]); p.phase = null; decide(p, startT, true); if (!p.at) startAt(p, play[p.k % play.length]); }

  const interactables = people.map((p) => ({
    id: `local-${p.k}`, kind: 'local', position: p,
    get enabled() { return !p.hidden && village.visible; },
    get markerY() { return groundAt(p.x, p.z) + (p.def.scale > 1.05 ? 2.0 : 1.6); },
    prompt: () => 'E — say hello',
    interact() {
      const lines = p.def.role === 'kid' && Math.random() < 0.6 ? KID_LINES : LINES;
      const line = lines[(p.line++ + p.k * 5) % lines.length];
      deps.say(line, p.def.role === 'kid' ? '😄' : '👋');
      // Stop, face the player (live), and wait a while: longer for a longer line. Then the walk carries on.
      p.react = { t: 0, dur: talkTime(line.length), turnTo: deps.player.position };
      p.go = 0;
      if (deps.audio) deps.audio.play('squeak');
    },
  }));
  const circles = people.map(() => ({ x: 0, z: 0, r: 0.3 }));
  let shown = true, first = true;

  return {
    lamps: halos.filter((l) => l.light !== false).map((l) => ({ x: l.x, y: l.y - 0.1, z: l.z })), // lit by the shared lamp lights at night (the market's stall lanterns only glow)
    interactables,
    colliders() { people.forEach((p, i) => { circles[i].x = p.x; circles[i].z = p.z; circles[i].r = p.hidden || !shown ? 0 : 0.3; }); return colliders.concat(circles); },
    // For checks from the console (window.__game.areas): the layout, the people and the walking network.
    debug: { people, colliders, homes, keepers, customers, doors, townProps, rukoO, seats, chat, farm, play, wellSpot, washSpot, NODES, EDGES, platforms, clear, route, decide, phaseOf, waterfront: waterfront.debug },
    update(dt, elapsed, player, night) {
      const px = player.position.x, pz = player.position.z;
      shown = Math.hypot(px - C.x, pz - C.z) < SHOW_WITHIN;
      // The houses and walls are a few welded meshes, cheap enough to keep in view from the dock and camp;
      // only the people need hiding at range.
      const seen = Math.hypot(px - C.x, pz - C.z) < BUILDINGS_WITHIN;
      village.visible = seen; glow.visible = halo.visible = seen && night > 0.3;
      waterfront.update(dt, elapsed, player, night);
      const t = deps.dayTime();
      if (first) for (const p of people) p.phase = null;
      for (const p of people) {
        p.think -= dt;
        if (p.think <= 0 || first) { p.think = 1; decide(p, t, !shown || first); }
        p.speed = 0;
        if (p.react) { p.react.t += dt; p.rot = turnToward(p.rot, face(p, p.react.turnTo), dt * 6); p.go = 0; if (p.react.t > p.react.dur) p.react = null; }
        else if (p.path) walk(p, dt, px, pz);
        const vis = shown && !p.hidden;
        p.figure.group.visible = vis;
        if (!vis) continue;
        const s = p.at || {}, sitting = !p.path && s.sit;
        const y = sitting ? treeBase + p.figure.seatLift(SHADE_TREE_BENCH.top) : groundAt(p.x, p.z);
        p.figure.group.position.set(p.x, y, p.z); p.figure.group.rotation.y = p.rot;
        const dist = Math.hypot(px - p.x, pz - p.z);
        // Only people near the player cast a shadow (each body is ~9k triangles, drawn again into the shadow map).
        const cast = dist < SHADOW_WITHIN; if (cast !== p.cast) { p.cast = cast; p.figure.group.traverse((o) => { if (o.isMesh) o.castShadow = cast; }); }
        if (dist > ANIMATE_WITHIN) continue;
        const busy = !p.path && !p.react;
        p.figure.animate(p.speed, elapsed, {
          sitting, pose: busy && s.pose ? s.pose : p.react && !sitting ? 'explain' : undefined,
          gesture: p.react && p.react.t < 1.6 ? { name: 'wave', u: p.react.t / 1.6 } : null,
          look: p.react ? player.position : undefined, mood: p.react ? 'happy' : undefined,
        });
      }
      first = false;
    },
  };

  // Walks along the planned path with the gentle start and slow arrival of the camp's timetable walkers.
  // A step onto a terrace face is refused just as it is for the player.
  function walk(p, dt, px, pz) {
    const goalPt = p.path[p.leg], last = p.leg === p.path.length - 1;
    const dx = goalPt.x - p.x, dz = goalPt.z - p.z, d = Math.hypot(dx, dz);
    if (d < (last ? 0.12 : 0.45)) {
      if (!last) { p.leg++; return; }
      p.at = goalPt; p.path = null; p.rot = goalPt.rot; p.go = 0; p.hidden = !!goalPt.hide; return;
    }
    // Someone in the way (the player): wait for them.
    const ox = px - p.x, oz = pz - p.z;
    if (ox * ox + oz * oz < 1.0 && ox * dx + oz * dz > 0) { p.go = 0; return; }
    const kid = p.def.role === 'kid';
    p.go += (1 - p.go) * (1 - Math.exp(-dt * 2.5));
    const cruise = (kid ? 1.0 : 1.05) * p.pace * Math.max(0.25, p.go) * (last ? Math.min(1, 0.4 + d / 1.8) : 1);
    const step = Math.min(cruise * dt, d);
    let next = { x: p.x + (dx / d) * step, z: p.z + (dz / d) * step };
    // Near the very end, walk straight in (a keeper behind a counter, a sitter onto the bench).
    if (!(last && d < (goalPt.skip || 0) + 0.2)) next = resolveCollisions(next, 0.3, colliders);
    if (heightAt(next.x, next.z) < DRY || onTerraceFace(p, next, groundAt)) { p.stuck += dt; } else {
      const moved = Math.hypot(next.x - p.x, next.z - p.z);
      p.stuck = moved < step * 0.3 ? p.stuck + dt : 0;
      if (moved > 1e-5) p.rot = turnToward(p.rot, Math.atan2(next.x - p.x, next.z - p.z), dt * 8);
      p.x = next.x; p.z = next.z; p.speed = moved / Math.max(dt, 1e-4);
    }
    // Hopelessly stuck: carry on to the next point of the path rather than push at a wall for ever.
    if (p.stuck > 3) { p.stuck = 0; if (!last) p.leg++; else { p.x = goalPt.x; p.z = goalPt.z; } }
  }
}

function haloTexture() {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function turnToward(a, b, k) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); }

function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.computeBoundingSphere();
  return geo;
}

