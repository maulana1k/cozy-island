// INTERNAL. The locals' village on its rise across the river: eight stilt houses round a small square
// with the well and the big shade tree, the meeting hall to the north, three market stalls on the south
// side of the square, washing lines, bamboo fences, path lamps that glow after dark and bare earth paths
// between everything. Ten locals (seven grown-ups, three children) keep a simple day of their own:
// farm work in the morning, the market at midday, chores in the afternoon, home at dusk and indoors
// (hidden) at night. Each one can be greeted ("E — say hello").
//
// Cost: every building comes from src/kit/hamlet.js and shares one atlas material, so the whole village is
// welded into ONE mesh (plus one for the earth paths and one for the night glow). People skip their
// animation beyond 60 m, decide what to do about once a second, and the whole area is hidden past 75 m.
import * as THREE from 'three';
import { mergeStatic } from '../build.js';
import { resolveCollisions } from '../../logic/collision.js';
import { createFigure } from '../../actors/figure.js';
import {
  buildStiltHouse, buildMeetingHall, buildMarketStall, buildWell, buildShadeTree, buildWashingLine, buildFenceRun,
  buildPathLamp, buildFootings, SHADE_TREE_BENCH,
} from '../../kit/hamlet.js';

const C = { x: 91, z: -42 };          // the middle of the square
const SHOW_WITHIN = 75, ANIMATE_WITHIN = 60, DRY = 0.35;
const face = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
// A point given in a thing's own frame (it stands at x, z turned by ry) in world coordinates.
const toW = (o, lx, lz) => ({ x: o.x + lx * Math.cos(o.ry) + lz * Math.sin(o.ry), z: o.z - lx * Math.sin(o.ry) + lz * Math.cos(o.ry) });

// ---- Where everything stands ------------------------------------------------------------------------
// Houses face the square (their doors look uphill, so the stilts lengthen at the back). `turn` nudges each
// one off the exact line so the ring does not look drawn with a compass.
const HOUSES = [
  { v: 0, x: 78.5, z: -47.5, turn: 0.15 }, { v: 1, x: 81, z: -58.5, turn: -0.1 }, { v: 2, x: 101.5, z: -57.5, turn: 0.2 },
  { v: 3, x: 109, z: -40, turn: -0.12 }, { v: 0, x: 105.5, z: -28.5, turn: 0.1 }, { v: 1, x: 95, z: -24.5, turn: -0.18 },
  { v: 2, x: 82.5, z: -25.5, turn: 0.12 }, { v: 3, x: 71.5, z: -42.5, turn: 0.08 },
];
const HALL = { x: 91, z: -55, ry: 0.04 };
const STALLS = [{ v: 0, x: 84.8, z: -36.3 }, { v: 1, x: 91, z: -34.4 }, { v: 2, x: 97.4, z: -35.8 }];
const WELL = { x: 88.2, z: -43.4, ry: 0.5 };
const TREE = { x: 99.5, z: -46, ry: 0.3 };
const WASHING = [{ x: 75.5, z: -53.5, ry: 0.95 }, { x: 111.5, z: -27.5, ry: -0.5 }, { x: 77, z: -22.5, ry: 0.3 }];
const FENCES = [
  { x: 95, z: -19.6, ry: 0.05, len: 5 }, { x: 83, z: -20.4, ry: -0.12, len: 4.5 }, { x: 106.5, z: -61.5, ry: 1.35, len: 4.5 },
  { x: 72.6, z: -51.5, ry: 1.0, len: 4 }, { x: 114.5, z: -43, ry: 1.62, len: 4.5 }, { x: 87.2, z: -61.8, ry: 0.15, len: 4 },
  { x: 110.5, z: -33.5, ry: 1.45, len: 3.5 }, { x: 68.6, z: -46, ry: 1.5, len: 3.5 },
];
const LAMPS = [
  { x: 73.6, z: -29.8 }, { x: 80, z: -33.6 }, { x: 85.3, z: -39.2 }, { x: 94.6, z: -38.6 }, { x: 87.2, z: -51.2 },
  { x: 95, z: -51.4 }, { x: 103.6, z: -41.6 }, { x: 89.2, z: -29.8 }, { x: 110.6, z: -48.2 },
];
// The walking network: main nodes and the paths between them. Doors and spots join the nearest node they
// can reach in a straight line. The paths are also painted on the ground as bare earth.
const NODES = {
  hub: { x: 91, z: -42 }, w1: { x: 85.8, z: -40.6 }, w2: { x: 80.6, z: -36.6 }, w3: { x: 75.6, z: -32.4 }, bridge: { x: 70.4, z: -29.6 },
  n1: { x: 91, z: -49.2 }, nw: { x: 83.6, z: -51.6 }, ne: { x: 97.6, z: -51.2 },
  s1: { x: 88, z: -37.8 }, s2: { x: 88, z: -31 }, s3: { x: 94.4, z: -30.4 },
  e1: { x: 96.4, z: -39.6 }, e2: { x: 103.8, z: -38.6 }, e3: { x: 106.6, z: -47.2 }, f1: { x: 113.6, z: -53.4 }, f2: { x: 113.8, z: -58 },
};
const EDGES = [
  ['hub', 'w1'], ['w1', 'w2'], ['w2', 'w3'], ['w3', 'bridge'], ['hub', 'n1'], ['n1', 'nw'], ['n1', 'ne'], ['w1', 'nw'],
  ['hub', 's1'], ['w1', 's1'], ['s1', 's2'], ['s2', 's3'], ['hub', 'e1'], ['e1', 'e2'], ['e2', 'e3'], ['e3', 'f1'], ['f1', 'f2'], ['ne', 'e3'],
];
// Farm work: hoeing and carrying round the farm's vegetable plots nearest the village (see VEG in farm.js).
const FARM = [{ x: 116.2, z: -54.6, rot: Math.PI, pose: 'hammer' }, { x: 119.6, z: -60.5, rot: Math.PI, pose: 'stir' }, { x: 114.2, z: -62.6, rot: Math.PI / 2, pose: 'carry' }, { x: 120.4, z: -54.7, rot: Math.PI + 0.2, pose: 'hammer' }];
// Where the children run about: the open ground of the square.
const PLAY = [{ x: 89.4, z: -38.6 }, { x: 93.4, z: -39 }, { x: 85.6, z: -44 }, { x: 94, z: -43.2 }, { x: 91.2, z: -46.6 }, { x: 86.6, z: -47.6 }, { x: 92.6, z: -36.9 }];

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
  { role: 'kid', home: 6, shirt: 0x5fa8a0, shorts: 0x8a6a4a, skin: 0x9a6a4a, hair: 0x2f2826, accent: null, scale: 0.96 },
  { role: 'kid', home: 2, shirt: 0xf2e29a, shorts: 0xa66a5f, skin: 0xe6b48a, hair: 0x5b4336, accent: 'cap', accentColor: 0xe8503a, scale: 0.9 },
];

// The parts of the day, as fractions of a day (0 = midnight).
function phaseOf(t) {
  if (t < 0.21 || t >= 0.86) return 'night';
  if (t < 0.42) return 'morning';
  if (t < 0.64) return 'midday';
  if (t < 0.8) return 'afternoon';
  return 'dusk';
}

export function create(scene, deps) {
  // ?nohamlet leaves the village out, for measuring what it costs.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nohamlet')) return {};
  const { heightAt, keepClear } = deps;
  const village = new THREE.Group(), colliders = [], lampSpots = [];
  // Places a model on the ground: its local colliders and lamps go to world space.
  function place(made, o, y) {
    made.group.position.set(o.x, y, o.z); made.group.rotation.y = o.ry; village.add(made.group);
    for (const c of made.colliders) {
      const p = toW(o, c.x, c.z);
      colliders.push(c.r !== undefined ? { x: p.x, z: p.z, r: c.r } : { x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: (c.rot || 0) + o.ry });
    }
    for (const l of made.lamps || []) {
      const p = toW(o, l.x, l.z), n = l.window ? { x: l.nx * Math.cos(o.ry) + l.nz * Math.sin(o.ry), z: -l.nx * Math.sin(o.ry) + l.nz * Math.cos(o.ry) } : null;
      lampSpots.push({ x: p.x, y: y + l.y, z: p.z, n });
    }
  }
  const lowest = (o, pts) => Math.min(...pts.map(([lx, lz]) => { const p = toW(o, lx, lz); return heightAt(p.x, p.z); }));
  // Buildings on stilts stand level at the height of their highest stilt; the others are lengthened down to
  // the ground, and a stone footing fills in under any steps left hanging.
  const posts = [], pads = [], doors = [];
  function onStilts(made, o) {
    const ground = made.stilts.map((s) => { const p = toW(o, s.x, s.z); return { ...p, h: heightAt(p.x, p.z) }; });
    const base = Math.max(...ground.map((g) => g.h));
    for (const g of ground) if (g.h < base - 0.06) posts.push({ x: g.x, z: g.z, y0: g.h - 0.15, y1: base + 0.02 });
    for (const f of made.stepFeet) {
      const p = toW(o, f.x, f.z), h = heightAt(p.x, p.z);
      if (h < base - 0.05) pads.push({ x: p.x, z: p.z, y0: h - 0.2, y1: base, w: f.w + 0.2, d: 0.8, ry: o.ry });
      doors.push(toW(o, f.x, f.z + 1.0));
    }
    place(made, o, base);
    return base;
  }
  HOUSES.forEach((h, i) => {
    const o = { x: h.x, z: h.z, ry: face(h, C) + h.turn }, made = buildStiltHouse(h.v);
    onStilts(made, o); h.door = doors[doors.length - made.stepFeet.length]; h.ry = o.ry; h.index = i;
    keepClear(h.x, h.z, 5.5);
  });
  const hallBase = onStilts(buildMeetingHall(), HALL); keepClear(HALL.x, HALL.z, 7);
  STALLS.forEach((s) => { s.ry = face(s, C); place(buildMarketStall(s.v), s, lowest(s, [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.95], [1.3, 0.95]]) - 0.03); keepClear(s.x, s.z, 3); });
  place(buildWell(), WELL, lowest(WELL, [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) - 0.05); keepClear(WELL.x, WELL.z, 2.5);
  const treeBase = lowest(TREE, [[0, 0], [2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6]]) - 0.02;
  place(buildShadeTree(), TREE, treeBase); keepClear(TREE.x, TREE.z, 8); keepClear(C.x, C.z, 9);
  WASHING.forEach((w) => { place(buildWashingLine(), w, lowest(w, [[-2.1, 0], [2.1, 0], [-1.5, 0.8]]) - 0.03); keepClear(w.x, w.z, 3); });
  for (const f of FENCES) {
    const a = toW(f, -f.len / 2, 0), b = toW(f, f.len / 2, 0), ha = heightAt(a.x, a.z), hb = heightAt(b.x, b.z);
    const made = buildFenceRun(f.len); place(made, { ...f }, Math.min(ha, hb) + Math.abs(hb - ha) / 2 - 0.04);
    made.group.rotation.set(0, f.ry, Math.atan2(hb - ha, f.len)); // follows the slope along its length
    keepClear(f.x, f.z, f.len / 2 + 0.5);
  }
  for (const l of LAMPS) { const o = { ...l, ry: face(l, C) + Math.PI / 2 }; place(buildPathLamp(), o, heightAt(l.x, l.z) - 0.04); }
  village.add(buildFootings(posts, pads).group);
  mergeStatic(village); scene.add(village);

  // ---- The walking network ------------------------------------------------------------------------
  // Is the straight line from a to b clear of every building and dry all the way? `skipEnd` metres at the
  // b end are not checked (a keeper steps in behind the counter, a sitter onto the bench).
  const R = 0.38;
  function clear(a, b, skipEnd = 0) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / 0.4));
    for (let i = 0; i <= n; i++) {
      const u = i / n; if (len * (1 - u) < skipEnd) break;
      const p = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
      if (heightAt(p.x, p.z) < DRY) return false;
      const q = resolveCollisions(p, R, colliders);
      if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) > 1e-6) return false;
    }
    return true;
  }
  const names = Object.keys(NODES), adj = new Map(names.map((n) => [n, []]));
  for (const [a, b] of EDGES) { const d = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z); adj.get(a).push([b, d]); adj.get(b).push([a, d]); }
  // Shortest way between two main nodes (a handful of nodes: a plain search is plenty).
  function route(from, to) {
    const dist = new Map(names.map((n) => [n, Infinity])), prev = new Map(), left = new Set(names); dist.set(from, 0);
    while (left.size) {
      let u = null; for (const n of left) if (u === null || dist.get(n) < dist.get(u)) u = n;
      left.delete(u); if (u === to) break;
      for (const [v, d] of adj.get(u)) if (dist.get(u) + d < dist.get(v)) { dist.set(v, dist.get(u) + d); prev.set(v, u); }
    }
    const out = [to]; while (out[0] !== from && prev.has(out[0])) out.unshift(prev.get(out[0]));
    return out.map((n) => NODES[n]);
  }
  // The nearest main node reachable in a straight line from a spot.
  function joinOf(p, skipEnd = 0) {
    const byDist = names.slice().sort((a, b) => Math.hypot(NODES[a].x - p.x, NODES[a].z - p.z) - Math.hypot(NODES[b].x - p.x, NODES[b].z - p.z));
    for (const n of byDist) if (clear(NODES[n], p, skipEnd)) return n;
    return byDist[0];
  }
  const spot = (x, z, rot, extra = {}) => { const s = { x, z, rot, ...extra }; s.join = joinOf(s, extra.skip || 0); return s; };

  // Spots people use.
  const homes = HOUSES.map((h) => spot(h.door.x, h.door.z, h.ry + Math.PI, { hide: true }));
  const keepers = STALLS.map((s) => { const p = toW(s, 0.15, -0.3); return spot(p.x, p.z, s.ry, { skip: 1.6, pose: 'explain' }); });
  const customers = STALLS.map((s) => { const p = toW(s, 0.5, 1.85); return spot(p.x, p.z, s.ry + Math.PI); });
  const seat = (a) => { const r = SHADE_TREE_BENCH.r + 0.12; return spot(TREE.x + Math.cos(a) * r, TREE.z + Math.sin(a) * r, Math.atan2(Math.cos(a), Math.sin(a)), { skip: 1.2, sit: true }); };
  const seats = [seat(Math.PI + 0.25), seat(Math.PI - 0.45), seat(Math.PI * 0.62)];
  const chat = [spot(93.6, -41.4, face({ x: 93.6, z: -41.4 }, { x: 94.8, z: -40.2 })), spot(94.8, -40.2, face({ x: 94.8, z: -40.2 }, { x: 93.6, z: -41.4 }))];
  const wellSpot = (() => { const p = toW(WELL, 0, 1.75); return spot(p.x, p.z, WELL.ry + Math.PI, { pose: 'carry' }); })();
  const washSpot = (() => { const w = WASHING[0], p = toW(w, 0.4, 1.0); return spot(p.x, p.z, w.ry + Math.PI, { pose: 'carry' }); })();
  const farm = FARM.map((f) => spot(f.x, f.z, f.rot, { pose: f.pose }));
  const play = PLAY.map((p) => spot(p.x, p.z, 0));
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
  // A walk from where someone is now to a spot: to the nearest node, along the paths, then in.
  function plan(p, to) {
    const from = p.at && p.at.join ? p.at.join : joinOf({ x: p.x, z: p.z });
    const pts = route(from, to.join);
    // Skip a first node that lies behind us on the way to the second.
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
    if (snap) { startAt(p, to); return; }
    p.hidden = false; p.path = plan(p, to); p.leg = 0; p.at = null; p.stuck = 0;
  }

  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffcf7a });
  const glowGeos = [];
  for (const l of lampSpots) {
    let g;
    if (l.n) { g = new THREE.PlaneGeometry(0.62, 0.58); g.rotateY(Math.atan2(l.n.x, l.n.z)); g.translate(l.x - l.n.x * 0.12, l.y, l.z - l.n.z * 0.12); }
    else { g = new THREE.IcosahedronGeometry(0.15, 0); g.translate(l.x, l.y, l.z); }
    glowGeos.push(g.index ? g.toNonIndexed() : g);
  }
  for (const g of glowGeos) for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const glow = new THREE.Mesh(mergeGeos(glowGeos), glowMat); glow.visible = false; scene.add(glow);
  // A soft halo round each lantern (not the windows), drawn as one cloud of points.
  const halos = lampSpots.filter((l) => !l.n), haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(halos.flatMap((l) => [l.x, l.y, l.z]), 3));
  const halo = new THREE.Points(haloGeo, new THREE.PointsMaterial({ color: 0xffb860, size: 2.4, map: haloTexture(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.visible = false; glow.add(halo);

  // Earth paths: a ribbon draped over the ground along every path and from every door to its node.
  const paths = buildPaths([...EDGES.map(([a, b]) => [NODES[a], NODES[b], 1.5]), ...homes.map((h) => [h, NODES[h.join], 1.0]), [{ x: HALL.x, z: HALL.z + 3.6 }, NODES.n1, 2.6]], heightAt);
  scene.add(paths);

  // Start everyone where they would be at this time of day.
  const t0 = deps.dayTime ? deps.dayTime() : 0.45;
  const startT = typeof t0 === 'number' && Number.isFinite(t0) ? t0 : 0.45;
  for (const p of people) { startAt(p, homes[p.def.home]); p.phase = null; decide(p, startT, true); if (!p.at) startAt(p, play[p.k % play.length]); }

  const interactables = people.map((p) => ({
    id: `local-${p.k}`, kind: 'local', position: p,
    get enabled() { return !p.hidden && village.visible; },
    get markerY() { return heightAt(p.x, p.z) + (p.def.scale > 1.05 ? 2.0 : 1.5); },
    prompt: () => 'E — say hello',
    interact() {
      const lines = p.def.role === 'kid' && Math.random() < 0.6 ? KID_LINES : LINES;
      deps.say(lines[(p.line++ + p.k * 5) % lines.length], p.def.role === 'kid' ? '😄' : '👋');
      p.react = { t: 0, dur: 1.6, turnTo: { x: deps.player.position.x, z: deps.player.position.z } };
      if (deps.audio) deps.audio.play('squeak');
    },
  }));
  const circles = people.map(() => ({ x: 0, z: 0, r: 0.3 }));
  let shown = true, first = true;

  return {
    interactables,
    colliders() { people.forEach((p, i) => { circles[i].x = p.x; circles[i].z = p.z; circles[i].r = p.hidden || !shown ? 0 : 0.3; }); return colliders.concat(circles); },
    // For checks from the console (window.__game.areas): the layout, the people and the walking network.
    debug: { people, colliders, homes, keepers, customers, seats, chat, farm, play, NODES, clear, decide, phaseOf },
    update(dt, elapsed, player, night) {
      const px = player.position.x, pz = player.position.z;
      shown = Math.hypot(px - C.x, pz - C.z) < SHOW_WITHIN;
      village.visible = paths.visible = shown; glow.visible = halo.visible = shown && night > 0.3;
      const t = deps.dayTime();
      if (first) for (const p of people) p.phase = null;
      for (const p of people) {
        p.think -= dt;
        if (p.think <= 0 || first) { p.think = 1; decide(p, t, !shown || first); }
        p.speed = 0;
        if (p.react) { p.react.t += dt; const want = face(p, p.react.turnTo); let d = want - p.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); p.rot += d * Math.min(1, dt * 6); if (p.react.t > p.react.dur) p.react = null; }
        else if (p.path) walk(p, dt, px, pz);
        const vis = shown && !p.hidden;
        p.figure.group.visible = vis;
        if (!vis) continue;
        const s = p.at || {}, sitting = !p.path && s.sit;
        const y = sitting ? treeBase + p.figure.seatLift(SHADE_TREE_BENCH.top) : heightAt(p.x, p.z);
        p.figure.group.position.set(p.x, y, p.z); p.figure.group.rotation.y = p.rot;
        if (Math.hypot(px - p.x, pz - p.z) > ANIMATE_WITHIN) continue;
        const busy = !p.path && !p.react;
        p.figure.animate(p.speed, elapsed, {
          sitting, pose: busy && s.pose ? s.pose : undefined,
          gesture: p.react ? { name: 'wave', u: Math.min(1, p.react.t / p.react.dur) } : null,
          look: p.react ? player.position : undefined, mood: p.react ? 'happy' : undefined,
        });
      }
      first = false;
    },
  };

  // Walks along the planned path with the gentle start and slow arrival of the camp's timetable walkers.
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
    const cruise = (kid ? 2.2 : 1.35) * p.pace * Math.max(0.25, p.go) * (last ? Math.min(1, 0.4 + d / 1.8) : 1);
    const step = Math.min(cruise * dt, d);
    let next = { x: p.x + (dx / d) * step, z: p.z + (dz / d) * step };
    // Near the very end, walk straight in (a keeper behind a counter, a sitter onto the bench).
    if (!(last && d < (goalPt.skip || 0) + 0.2)) next = resolveCollisions(next, 0.3, colliders);
    if (heightAt(next.x, next.z) < DRY) { p.stuck += dt; } else {
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

// Bare earth ribbons over the ground: one mesh for all of them. segs: [a, b, width].
function buildPaths(segs, heightAt) {
  const pos = [], col = [], c0 = new THREE.Color(0xc99c64), c1 = new THREE.Color(0xb98d58);
  for (const [a, b, w] of segs) {
    const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 0.3) continue;
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, nx = -uz * w / 2, nz = ux * w / 2, n = Math.max(1, Math.ceil(len / 0.9));
    const P = (i, s) => { const u = Math.min(len, Math.max(0, i * len / n)), x = a.x + ux * u + nx * s, z = a.z + uz * u + nz * s; return [x, heightAt(x, z) + 0.06, z]; };
    for (let i = 0; i < n; i++) {
      const A = P(i, -1), B = P(i, 1), Cc = P(i + 1, 1), D = P(i + 1, -1);
      pos.push(...A, ...B, ...Cc, ...A, ...Cc, ...D);
      for (const q of [A, B, Cc, A, Cc, D]) { const k = 0.5 + 0.5 * Math.sin(q[0] * 1.7 + q[2] * 2.3) * Math.sin(q[0] * 0.6 - q[2] * 0.9); col.push(c0.r + (c1.r - c0.r) * k, c0.g + (c1.g - c0.g) * k, c0.b + (c1.b - c0.b) * k); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
  return mesh;
}
