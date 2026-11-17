// Grass and plants on the locals' land (design: docs/superpowers/specs/2026-11-16-living-village-design.md, section 3).
//
// Plants are laid out once, as "biomes": clusters of a main plant with companions, each with a chance,
// a count and a size range (the ridge's forest, copses, bamboo by the water, palms on the shore, fruit
// trees and banana plants by the houses, bushes along the foot of the terrace walls, flowers at the edges
// of paths), then a filling pass so no stretch of ground is left bare. Nothing grows on a path, a step,
// the ramp, a plot, the square, a paddy, the stream or in a circle an area asked to keep clear.
//
// Drawing: one instanced pool per kind of plant. Near you (NEAR_TREE for trees and bushes, NEAR_SMALL
// for ferns, logs and flowers) a plant is its real model; further out trees, bamboo and big bushes are
// one cheap lump each (like the jungle's), out to FAR metres; the ridge's forest keeps its lumps at any
// distance, so it stays on the skyline. Trees, bamboo, palms and big bushes near you are colliders.
//
// Grass: tufts grow wherever the painted ground is grassy (the colour from ground.js decides), short at
// path edges, none on paths, yards, paving, paddies or water, only within GRASS_R of you, in one swaying
// pool (the camp's grass material). Made a few 4 m cells a frame as you walk.
import * as THREE from 'three';
import { heightAt, groundKind, wildness } from '../logic/terrain.js';
import { paintNewGround, groundVersion, grassDrift, vegDist, addVegetation, dryPatch } from './ground.js';
import { areaKeepsClear } from './wilds.js';
import { swayingGrassMaterial } from './scatter.js';
import { windSway } from './weather.js';
import * as M from '../kit/plants.js';
import { AREAS, SEED } from '../config.js';

const NEAR_TREE = 40, NEAR_BUSH = 32, NEAR_SMALL = 25, FAR = 150, COLLIDE_R = 28, GRASS_R = 28, CELL = 4;
const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const wave = (x, z, s, o) => Math.sin(x / s + o) * Math.cos(z / (s * 0.83) - o * 1.7) + 0.5 * Math.sin((x + z) / (s * 0.47) + o * 2.3);

// ---- The kinds of plant. `col`: collider radius per unit of scale (0: none); `clear`: metres kept from a
// path's edge; `space`: metres kept from other solid plants (times scale); `lump`: the far stand-in (crown
// centre height, radius, squash, colour), or null for none. `tree`: counts as a tree for spacing.
export const KINDS = {
  broad: { make: M.broadleafTree, cap: 1400, near: NEAR_TREE, col: 0.32, clear: 2.2, space: 2.8, tree: true, lump: { y: 4.6, r: 2.8, sy: 1.15, c: 0x557f45 } },
  tall: { make: M.tallTree, cap: 500, near: NEAR_TREE, col: 0.28, clear: 2.2, space: 2.4, tree: true, lump: { y: 8.4, r: 1.6, sy: 1.5, c: 0x527d43 } },
  small: { make: M.smallTree, cap: 1200, near: NEAR_TREE, col: 0.18, clear: 1.6, space: 1.8, tree: true, lump: { y: 2.9, r: 1.3, sy: 1.0, c: 0x5f8f4c } },
  fruit: { make: M.fruitTree, cap: 300, near: NEAR_TREE, col: 0.22, clear: 1.8, space: 2.4, tree: true, shadow: true, lump: { y: 2.9, r: 1.6, sy: 1.0, c: 0x46743b } },
  palm: { make: M.coconutPalm, cap: 400, near: NEAR_TREE, col: 0.22, clear: 1.6, space: 2.4, tree: true, shadow: true, lump: { y: 6.7, r: 1.9, sy: 0.55, c: 0x7da552, ox: 1.15, stem: 0.26 } },
  bamboo: { make: M.bambooClump, cap: 500, near: NEAR_TREE, col: 0.45, clear: 2.2, space: 2.2, tree: true, shadow: true, lump: { y: 3.6, r: 1.35, sy: 2.4, c: 0x86a852 } },
  banana: { make: M.bananaPlant, cap: 500, near: NEAR_BUSH, col: 0.18, clear: 1.3, space: 1.4, lump: { y: 1.4, r: 1.0, sy: 0.6, c: 0x84b452, max: 80 } },
  bush: { make: M.roundBush, cap: 3200, near: NEAR_BUSH, col: 0.42, colMin: 1.05, clear: 1.25, space: 1.0, lump: { y: 0.45, r: 0.75, sy: 0.85, c: 0x5b8f48, max: 130 } },
  pink: { make: () => M.flowerShrub(true), cap: 900, near: NEAR_BUSH, col: 0.45, colMin: 1.05, clear: 1.25, space: 1.0, lump: { y: 0.55, r: 0.8, sy: 0.8, c: 0x8a7a6a, max: 70 } },
  red: { make: () => M.flowerShrub(false), cap: 900, near: NEAR_BUSH, col: 0.45, colMin: 1.05, clear: 1.25, space: 1.0, lump: { y: 0.55, r: 0.8, sy: 0.8, c: 0x7f7a50, max: 70 } },
  fern: { make: M.fern, cap: 4000, near: NEAR_SMALL, col: 0, clear: 0.6, space: 0, lump: null },
  log: { make: M.fallenLog, cap: 300, near: NEAR_SMALL, col: 0, clear: 1.2, space: 1.2, lump: null },
  flowers: { make: M.flowerPatch, cap: 4000, near: NEAR_SMALL, col: 0, clear: 0.3, space: 0, lump: null },
};

// ---- What the plants must keep clear of (from the plan in AREAS).
const seg = (a, b) => ({ a, b, dx: b.x - a.x, dz: b.z - a.z, l2: (b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1e-9 });
const segDist = (s, x, z) => { const k = Math.max(0, Math.min(1, ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.l2)); return Math.hypot(x - s.a.x - s.dx * k, z - s.a.z - s.dz * k); };
const lineSegs = (pts, half) => pts.slice(1).map((b, i) => ({ ...seg(pts[i], b), half }));
const PATH_HALF = (name) => (name === 'main' ? 1.0 : name === 'ramp' ? 1.6 : name.startsWith('walk') ? 0.85 : 0.75);
const PATHS = [
  ...Object.entries(AREAS.paths).flatMap(([name, pts]) => lineSegs(pts, PATH_HALF(name))),
  ...AREAS.trails.flatMap((pts) => lineSegs(pts, 1.0)),
  ...AREAS.cliffPath.length ? lineSegs(AREAS.cliffPath, 1.2) : [],
];
// Metres from (x, z) to the edge of the nearest path (negative on it).
function pathEdge(x, z) { let d = Infinity; for (const s of PATHS) { const e = segDist(s, x, z) - s.half; if (e < d) d = e; } return d; }
const WALLS = AREAS.terraces.filter((t) => t.wallFoot).flatMap((t) => lineSegs(t.wallFoot, 0));
const STEPS = AREAS.steps.map((s) => ({ ...seg(s.foot, s.top), half: s.width / 2 }));
const rect = (o, hw, hd) => ({ x: o.x, z: o.z, c: Math.cos(o.rot ?? o.front ?? 0), s: Math.sin(o.rot ?? o.front ?? 0), hw, hd });
// Metres outside a rectangle (negative inside). `rot` is a heading: hw across it, hd along it.
const rectOut = (r, x, z) => { const dx = x - r.x, dz = z - r.z; return Math.max(Math.abs(dx * r.c - dz * r.s) - r.hw, Math.abs(dx * r.s + dz * r.c) - r.hd); };
const PLOTS = AREAS.plots.map((p) => ({ ...rect(p, p.w / 2, p.d / 2), plot: p }));
const HALL = rect(AREAS.hall, AREAS.hall.w / 2, AREAS.hall.d / 2);
const PADDIES = AREAS.paddyFields.map((f) => rect(f, f.hw, f.hd));
const CIRCLES = [
  { ...AREAS.square, r: AREAS.square.r + 0.6 }, { ...AREAS.banyan, r: AREAS.banyan.r + 1 }, { ...AREAS.well, r: 2 },
  ...AREAS.stalls.map((s) => ({ ...s, r: 2.6 })), { ...AREAS.bridge.a, r: 4 }, { ...AREAS.bridge.b, r: 4.5 },
  ...AREAS.streamCrossings.map((c) => ({ ...c, r: 3 })), { ...AREAS.jetty, r: 7 }, { ...AREAS.spring, r: AREAS.spring.r + 1.5 },
  { ...AREAS.lookout, r: AREAS.lookout.r + 2 },
];
const CLEARING = AREAS.clearing;

// Is (x, z) a place a plant of this kind may stand? Returns the ground facts, or null.
// `small` plants (ferns, flowers) may come closer to things than solid ones.
function siteFor(kind, x, z) {
  const K = KINDS[kind], small = !K.col && kind !== 'log';
  const g = groundKind(x, z);
  if (!g) return null;
  if (g.market > 0.01 || g.beach > (kind === 'palm' ? 0.45 : 0.15)) return null; // the fish market and the fishing beach's sand
  if (g.rock > 0.25 || g.paddy > 0.01 || g.face > 0.05 || g.step > 0.05 || g.river < (kind === 'bamboo' ? 2.2 : 1.4) || g.lake < 2) return null;
  if (g.stream < (kind === 'bamboo' ? 2.8 : small ? 1.8 : 2.4) || g.spring < 1) return null;
  if (pathEdge(x, z) < K.clear) return null;
  const solidPad = small ? 0.2 : 0.6;
  for (const s of STEPS) if (segDist(s, x, z) < s.half + 0.6 + solidPad) return null;
  for (const w of WALLS) if (segDist(w, x, z) < (K.tree ? 1.8 : small ? 0.25 : 0.45)) return null;
  for (const p of PLOTS) if (rectOut(p, x, z) < solidPad) return null;
  if (rectOut(HALL, x, z) < solidPad + 0.5) return null;
  for (const p of PADDIES) if (rectOut(p, x, z) < (small ? 0.3 : K.tree ? 1.8 : 1.0)) return null;
  for (const c of CIRCLES) if (Math.hypot(x - c.x, z - c.z) < c.r + (small ? 0 : 0.5)) return null;
  if (!small && Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r + (K.tree ? 2.5 : 0.8)) return null;
  if (areaKeepsClear(x, z, small ? -1.2 : K.tree ? 0.8 : 0.2)) return null;
  const y = heightAt(x, z);
  if (y < 0.4) return null;
  const e = 0.7, slope = Math.max(Math.abs(heightAt(x + e, z) - y), Math.abs(heightAt(x, z + e) - y), Math.abs(heightAt(x - e, z) - y), Math.abs(heightAt(x, z - e) - y)) / e;
  if (slope > (small ? 1.1 : K.tree ? 0.95 : 0.8)) return null;
  return { g, y };
}

// ---- The biomes: [kind, chance, [min, max] count, [min, max] scale, [min, max] distance from the middle].
const BIOMES = {
  forest: [['broad', 1, [1, 2], [0.85, 1.3], [0, 3.5]], ['tall', 0.4, [1, 1], [0.9, 1.2], [0, 3.5]], ['small', 0.5, [1, 2], [0.8, 1.2], [1.5, 4.5]],
    ['bush', 0.9, [1, 3], [0.8, 1.4], [1, 4.5]], ['fern', 1, [3, 6], [0.8, 1.4], [0.4, 4.5]], ['log', 0.22, [1, 1], [0.8, 1.2], [1, 4]], ['flowers', 0.08, [1, 1], [0.8, 1.1], [1, 4]]],
  edge: [['broad', 0.75, [1, 2], [0.8, 1.2], [0, 3]], ['small', 0.6, [1, 2], [0.8, 1.2], [1, 4]], ['fruit', 0.08, [1, 1], [0.85, 1.1], [1, 4]],
    ['bush', 1, [2, 4], [0.7, 1.3], [1, 4.5]], ['pink', 0.12, [1, 1], [0.8, 1.1], [2, 4.5]], ['fern', 0.8, [1, 3], [0.8, 1.3], [0.5, 4]], ['flowers', 0.4, [1, 2], [0.8, 1.2], [2, 5]], ['log', 0.08, [1, 1], [0.8, 1.1], [1, 3]]],
  copse: [['broad', 0.7, [1, 2], [0.75, 1.15], [0, 3]], ['small', 0.8, [1, 2], [0.8, 1.25], [0.5, 4]], ['fruit', 0.15, [1, 1], [0.85, 1.1], [1, 4]], ['banana', 0.1, [1, 2], [0.8, 1.1], [1.5, 4]],
    ['bush', 1, [2, 4], [0.7, 1.3], [1, 4.5]], ['red', 0.18, [1, 1], [0.8, 1.1], [2, 4.5]], ['pink', 0.18, [1, 1], [0.8, 1.1], [2, 4.5]], ['fern', 0.5, [1, 2], [0.8, 1.2], [0.5, 3.5]], ['flowers', 0.6, [1, 3], [0.8, 1.2], [2, 5]]],
  meadow: [['small', 0.35, [1, 1], [0.8, 1.15], [0, 2]], ['broad', 0.12, [1, 1], [0.8, 1.1], [0, 2]], ['bush', 0.75, [1, 2], [0.7, 1.2], [0, 3.5]], ['pink', 0.25, [1, 1], [0.8, 1.1], [0.5, 3.5]], ['red', 0.22, [1, 1], [0.8, 1.1], [0.5, 3.5]],
    ['flowers', 1, [1, 3], [0.8, 1.3], [0, 4]], ['banana', 0.08, [1, 1], [0.85, 1.1], [0, 3]]],
  bamboo: [['bamboo', 1, [1, 3], [0.8, 1.2], [0, 3]], ['bush', 0.6, [1, 2], [0.7, 1.1], [1.5, 4]], ['fern', 0.7, [1, 3], [0.8, 1.2], [1, 3.5]], ['banana', 0.3, [1, 1], [0.85, 1.1], [2, 4]], ['flowers', 0.3, [1, 2], [0.8, 1.1], [2, 4]]],
  bank: [['bush', 1, [1, 3], [0.7, 1.2], [0, 3.5]], ['fern', 0.6, [1, 2], [0.8, 1.2], [0, 3]], ['flowers', 0.5, [1, 2], [0.8, 1.1], [0, 4]], ['small', 0.3, [1, 1], [0.8, 1.1], [0, 2.5]]],
  shore: [['palm', 0.85, [1, 2], [0.85, 1.25], [0, 4]], ['small', 0.3, [1, 1], [0.8, 1.1], [1, 4]], ['broad', 0.12, [1, 1], [0.8, 1.05], [1, 4]], ['bush', 0.7, [1, 2], [0.7, 1.1], [1, 4]], ['red', 0.1, [1, 1], [0.8, 1], [1, 4]], ['flowers', 0.3, [1, 1], [0.8, 1.1], [1, 4]], ['banana', 0.08, [1, 1], [0.85, 1.1], [1, 3]]],
};

// ---- Lays out every plant. Runs once, after the areas have registered their clear circles.
export function layOut() {
  const rng = rngOf(SEED + 907), plants = [], HASH = 4, grid = new Map();
  const key = (x, z) => `${Math.floor(x / HASH)},${Math.floor(z / HASH)}`;
  const around = (x, z, r, fn) => { const i0 = Math.floor((x - r) / HASH), i1 = Math.floor((x + r) / HASH), j0 = Math.floor((z - r) / HASH), j1 = Math.floor((z + r) / HASH);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const p of grid.get(`${i},${j}`) || []) if (Math.hypot(p.x - x, p.z - z) < r && fn(p)) return true; return false; };
  const solid = (k) => KINDS[k].space > 0;
  // Places one plant if the spot is free; returns it (or null).
  function put(kind, x, z, s, forest = false) {
    const K = KINDS[kind];
    // Trees keep their trunks apart (crowns may touch); bushes keep a little room from anything solid.
    if (solid(kind) && around(x, z, 3.5, (p) => KINDS[p.kind].space > 0 && Math.hypot(p.x - x, p.z - z) < (K.space * s + KINDS[p.kind].space * p.s) * (K.tree && KINDS[p.kind].tree ? 0.38 : 0.3))) return null;
    const site = siteFor(kind, x, z);
    if (!site) return null;
    const p = { kind, x, z, y: site.y - (K.tree ? 0.05 : 0.02), s, rot: rng() * Math.PI * 2, tint: rng() * 2 - 1, forest };
    plants.push(p);
    const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
    return p;
  }
  const range = ([a, b]) => a + rng() * (b - a);
  function cluster(biome, cx, cz, forest = false) {
    for (const [kind, chance, n, size, dist] of BIOMES[biome]) {
      if (rng() > chance) continue;
      const count = Math.round(range(n));
      for (let i = 0; i < count; i++) for (let tries = 0; tries < 5; tries++) {
        const a = rng() * Math.PI * 2, d = range(dist);
        if (put(kind, cx + Math.cos(a) * d, cz + Math.sin(a) * d, range(size), forest)) break;
      }
    }
  }

  // 1. Biomes over the whole of the new land, on a jittered grid: what grows where depends on the ground.
  const X0 = 30, X1 = 192, Z0 = -132, Z1 = -2, STEP = 4.6;
  for (let gz = Z0; gz < Z1; gz += STEP) for (let gx = X0; gx < X1; gx += STEP) {
    const cx = gx + rng() * STEP, cz = gz + rng() * STEP, g = groundKind(cx, cz);
    // Clusters every 4.6 m in the forest, about every 5.7 m elsewhere.
    if (g && g.forest <= -1.5 && rng() < 0.35) continue;
    if (!g || g.rock > 0.3) continue;
    const y = heightAt(cx, cz), n = wave(cx, cz, 23, 1.7), n2 = wave(cx, cz, 13, 4.2);
    if (y < 0.3) continue;
    let biome = null;
    if (g.locals < 0.05) {
      // The camp's side of the river: a few bamboo groves and bushes on the bank, never on the trail.
      if (g.river > 2 && g.river < 12 && g.trail > 4 && n > -0.1) biome = rng() < 0.6 ? 'bamboo' : 'bank';
    } else if (g.forest > -1.5) biome = 'forest';
    else if (g.forest > -9) biome = rng() < 0.8 ? 'edge' : 'meadow';
    else if (g.terrace > 0.3) biome = null; // the village: planted by hand below
    else if ((g.river > 1.5 && g.river < 10) || (g.stream > 2.4 && g.stream < 9)) biome = n2 > -0.25 ? 'bamboo' : 'bank';
    else if (g.locals < 0.92 && y < 3.2) biome = n2 > -0.6 ? 'shore' : 'meadow';
    else biome = n > -0.4 ? 'copse' : 'meadow';
    if (biome) cluster(biome, cx, cz, biome === 'forest');
  }
  // The forest also has extra tall trees right along the crest, so it reads as woods from below.
  const crest = AREAS.ridge;
  for (let i = 0; i < crest.length - 1; i++) {
    const a = crest[i], b = crest[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d < len; d += 3.2) {
      const t = d / len, off = (rng() - 0.5) * 12;
      const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
      put(rng() < 0.4 ? 'tall' : 'broad', a.x + (b.x - a.x) * t + nx * off, a.z + (b.z - a.z) * t + nz * off, 0.95 + rng() * 0.35, true);
    }
  }

  // 2. The village, by hand.
  const VF = AREAS.villageFrame, down = { x: -VF.ux, z: -VF.uz };
  // Fruit trees and banana plants beside each house, outside its plot, and flowering shrubs at the yard's corners.
  for (const p of PLOTS) {
    const ax = { x: p.c, z: -p.s }, al = { x: p.s, z: p.c }; // across the plot, and toward its front (the yard)
    const at = (a, b) => ({ x: p.x + ax.x * a + al.x * b, z: p.z + ax.z * a + al.z * b });
    for (const side of [-1, 1]) {
      const back = at(side * (p.hw + 1.4 + rng() * 0.6), -p.hd * (0.2 + rng() * 0.5));
      put(rng() < 0.6 ? 'fruit' : 'banana', back.x, back.z, 0.85 + rng() * 0.25);
      const mid = at(side * (p.hw + 1.0), p.hd * 0.1);
      if (rng() < 0.6) put('banana', mid.x, mid.z, 0.8 + rng() * 0.3);
      const corner = at(side * (p.hw + 0.7), p.hd - 0.6);
      put(rng() < 0.5 ? 'pink' : 'red', corner.x, corner.z, 0.75 + rng() * 0.3);
      const f = at(side * (p.hw + 0.5 + rng()), p.hd + 0.3);
      put('flowers', f.x, f.z, 0.9 + rng() * 0.3);
    }
  }
  // Bushes in clumps along the foot of each terrace wall (on the lower terrace), softening its line.
  for (const w of WALLS) {
    const len = Math.sqrt(w.l2);
    for (let d = 0.4; d < len; d += 0.9) {
      const x = w.a.x + (w.dx * d) / len, z = w.a.z + (w.dz * d) / len;
      if (wave(x, z, 3.1, 0.6) < -0.35) continue; // gaps between the clumps
      const off = 0.75 + rng() * 0.5, r = rng();
      const kind = r < 0.62 ? 'bush' : r < 0.74 ? 'pink' : r < 0.84 ? 'red' : 'fern';
      put(kind, x + down.x * off, z + down.z * off, 0.7 + rng() * 0.4);
      if (rng() < 0.35) put('flowers', x + down.x * (off + 0.8), z + down.z * (off + 0.8), 0.9);
    }
  }
  // Wild flowers along the edges of the paths, in drifts.
  for (const s of PATHS) {
    const len = Math.sqrt(s.l2), nx = -s.dz / len, nz = s.dx / len;
    for (let d = 0; d < len; d += 1.1) {
      for (const side of [-1, 1]) {
        const x = s.a.x + (s.dx * d) / len, z = s.a.z + (s.dz * d) / len;
        if (wave(x + side * 3, z, 4.3, 2.2) < 0.15 || rng() < 0.35) continue;
        const off = s.half + 0.4 + rng() * 0.6;
        put('flowers', x + nx * off * side, z + nz * off * side, 0.8 + rng() * 0.4);
      }
    }
  }

  // 3. Filling: no stretch of open ground wider than about 10 m in the village or 20 m elsewhere.
  for (let gz = Z0; gz < Z1; gz += 3.5) for (let gx = X0; gx < X1; gx += 3.5) {
    const x = gx + rng() * 3.5, z = gz + rng() * 3.5, g = groundKind(x, z);
    if (!g || g.locals < 0.5 || g.rock > 0.3) continue;
    const village = g.terrace > 0.3, R = village ? 4 : 6.5;
    if (around(x, z, R, () => true)) continue;
    const r = rng();
    const order = village ? (r < 0.35 ? ['flowers'] : r < 0.55 ? ['pink', 'flowers'] : r < 0.7 ? ['red', 'flowers'] : r < 0.85 ? ['bush', 'flowers'] : ['banana', 'flowers'])
      : (r < 0.35 ? ['bush', 'flowers'] : r < 0.55 ? ['small', 'bush', 'flowers'] : r < 0.7 ? ['pink', 'flowers'] : r < 0.8 ? ['red', 'flowers'] : ['flowers']);
    for (const kind of order) if (put(kind, x, z, 0.75 + rng() * 0.4)) break;
  }

  // 4. The camp's bank of the river, from the bend above the fishing dock down to the bridge: lush and varied,
  // ferns and flowers at the water, bushes and flowering shrubs up the bank, and a few shade trees. Last, with its
  // own random numbers for where, so nothing laid out above moves.
  const rb = rngOf(SEED + 913);
  for (const [x, z, kind, s] of [[37.6, -45.2, 'broad', 1.15], [45.8, -35.6, 'broad', 1.0], [37.0, -38.6, 'small', 1.1], [49.6, -30.4, 'small', 1.0], [34.5, -47.5, 'broad', 1.05]]) put(kind, x, z, s);
  for (let n = 0; n < 520; n++) {
    const x = 30 + rb() * 28, z = -58 + rb() * 38, g = groundKind(x, z);
    if (!g || g.locals > 0.05 || g.river < 1.4 || g.river > 13) continue;
    const r = rb(), patch = wave(x, z, 6.5, 3.1); // patches: some stretches bushy, some open and flowery
    let kind;
    if (g.river < 4) kind = r < 0.5 ? 'fern' : r < 0.85 ? 'flowers' : 'bush';
    else if (patch > 0.2) kind = r < 0.45 ? 'bush' : r < 0.6 ? 'pink' : r < 0.72 ? 'red' : r < 0.86 ? 'fern' : r < 0.95 ? 'banana' : 'small';
    else kind = r < 0.55 ? 'flowers' : r < 0.75 ? 'fern' : r < 0.9 ? 'bush' : 'log';
    put(kind, x, z, 0.75 + rb() * 0.5);
  }
  return plants;
}

// ---- Grass: where the ground is painted grassy.
const paintC = new THREE.Color(), srgb = new THREE.Color();
function grassCell(ix, iz) {
  const rng = rngOf((Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ (SEED + 31)) >>> 0), out = [];
  const N = Math.round(CELL * CELL * 1.9);
  for (let n = 0; n < N; n++) {
    const x = (ix + rng()) * CELL, z = (iz + rng()) * CELL, r1 = rng(), r2 = rng(), r3 = rng();
    // Thick stands with thinner ground between (checked first: it is the cheapest test).
    const drift = grassDrift(x, z);
    if (drift < -0.45 && r2 < 0.75) continue;
    const g = groundKind(x, z);
    if (!g) continue;
    if (Math.hypot(x, z) < 47.5 && g.locals < 0.5) continue;                 // the camp has its own grass
    if (g.forest < -1 && g.locals < 0.5 && wildness(x, z) > 0.25) continue;    // and so has the jungle
    if (g.rock > 0.3 || g.paddy > 0.02 || g.river < 1.8 || g.lake < 2 || g.stream < 1.8 || g.spring < 0.8 || g.face > 0.3) continue;
    const edge = pathEdge(x, z);
    if (edge < 0.05) continue;
    if (PLOTS.some((p) => rectOut(p, x, z) < 0) || rectOut(HALL, x, z) < 0.3 || CIRCLES.some((c) => Math.hypot(x - c.x, z - c.z) < c.r - (c === CIRCLES[0] ? 0 : 1))) continue;
    if (STEPS.some((s) => segDist(s, x, z) < s.half + 0.3) || areaKeepsClear(x, z, -1.6)) continue;
    if (g.forest > -1 && r2 < 0.6) continue; // sparse on the forest floor
    const y = heightAt(x, z);
    if (y < 0.3) continue;
    paintC.setHex(0xd9be66);
    if (!paintNewGround(paintC, x, z, y)) continue;
    srgb.copy(paintC).convertLinearToSRGB();
    if (srgb.g / srgb.r < 0.845 || srgb.b / srgb.r > 0.6) continue; // dirt, clay, paths, packed earth, sand: no grass
    const short = edge < 0.9 ? 0.4 + edge * 0.35 : 1;
    // The blades carry the colour; each tuft only nudges hue and value. Tall wild tufts stand against bushes and trunks.
    const wild = vegDist(x, z), tall = wild < 1.8 ? 1 + (1 - Math.max(0, wild) / 1.8) * (0.7 + r1 * 0.5) : 1;
    const v = 0.9 + r3 * 0.2, c1 = ((x * 13.7 + z * 7.3) % 1 + 1) % 1, c2 = ((x * 5.1 - z * 11.9) % 1 + 1) % 1;
    const o = { x, y: y - 0.03, z, s: 0.8 + r3 * 0.5, sy: short * (0.65 + r2 * 0.5) * tall, rot: r1 * 6.283, r: v * (0.94 + c1 * 0.12), g: v * (0.96 + c2 * 0.08), b: v * (0.9 + c1 * 0.16) };
    { const d = dryPatch(x, z); o.r *= 1 + 0.3 * d; o.g *= 1 + 0.03 * d; o.b *= 1 - 0.32 * d; } // gold where the ground has dried (ground.js)
    out.push(o);
  }
  return out;
}

export function create(scene) {
  const group = new THREE.Group(); group.name = 'flora'; scene.add(group);
  const plants = layOut();
  // The ground under and round bushes and trees turns dark and damp (src/world/ground.js); the camp's and the jungle's meshes repaint once.
  addVegetation(plants.filter((p) => KINDS[p.kind].col > 0).map((p) => ({ x: p.x, z: p.z, r: (KINDS[p.kind].tree ? 1.1 : 0.6) * p.s })), true);
  const mat = windSway(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }), 0.02);
  const lumpMat = windSway(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }), 0.02); // lit top, cool belly baked in (M.lump)
  const pool = (geo, material, cap, shadow) => { const m = new THREE.InstancedMesh(geo, material, cap); m.count = 0; m.frustumCulled = false; m.castShadow = !!shadow; m.receiveShadow = true; group.add(m); return m; };
  const pools = {};
  for (const [k, K] of Object.entries(KINDS)) pools[k] = pool(K.make(), mat, Math.min(K.cap, Math.max(1, plants.filter((p) => p.kind === k).length)), K.shadow);
  for (const k of Object.keys(KINDS)) pools[k].setColorAt(0, new THREE.Color(1, 1, 1));
  const lumps = pool(M.lump(), lumpMat, Math.max(1, plants.filter((p) => KINDS[p.kind].lump).length), false);
  // ... and a thin trunk under each far tree, so the crowns do not float.
  const stemGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1, true); stemGeo.translate(0, 0.5, 0);
  const stems = pool(stemGeo, new THREE.MeshStandardMaterial({ color: 0x7c6b5c, flatShading: true, roughness: 1 }), Math.max(1, plants.filter((p) => KINDS[p.kind].tree).length), false);
  stems.receiveShadow = false;
  lumps.setColorAt(0, new THREE.Color(1, 1, 1)); lumps.receiveShadow = false;
  const grassTime = { value: 0 }, grassWalker = { value: new THREE.Vector3(0, 0, 9999) };
  const GRASS_CAP = 6500, grass = pool(M.grassTuft(), swayingGrassMaterial(grassTime, grassWalker), GRASS_CAP, false);
  grass.setColorAt(0, new THREE.Color(1, 1, 1));

  const dummy = new THREE.Object3D(), color = new THREE.Color(), colliders = [];
  const put = (mesh, i, x, y, z, s, rot, sy = s) => { dummy.position.set(x, y, z); dummy.rotation.set(0, rot, 0); dummy.scale.set(s, sy, s); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); };
  function refill(px, pz) {
    const n = {}; for (const k of Object.keys(KINDS)) n[k] = 0;
    let nl = 0, ns = 0; colliders.length = 0;
    for (const p of plants) {
      const K = KINDS[p.kind], d = Math.hypot(p.x - px, p.z - pz);
      if (d < K.near && n[p.kind] < pools[p.kind].instanceMatrix.count) {
        const m = pools[p.kind], i = n[p.kind]++;
        put(m, i, p.x, p.y, p.z, p.s, p.rot);
        // Each plant a little warmer or cooler, lighter or darker, so no two stands look stamped out.
        const t = p.tint, l = 0.94 + 0.12 * ((p.x * 0.37 + p.z * 0.71) % 1 + 1) % 1;
        m.setColorAt(i, color.setRGB((1 + 0.13 * t) * l, (1 + 0.07 * t) * l, (1 - 0.1 * t) * l));
        if (K.col && d < COLLIDE_R && p.s >= (K.colMin || 0)) colliders.push({ x: p.x, z: p.z, r: K.col * p.s });
      } else if (K.lump && (d < Math.min(FAR, K.lump.max || FAR) || p.forest) && d >= K.near) {
        const L = K.lump, ox = L.ox ? Math.cos(p.rot) * L.ox * p.s : 0, oz = L.ox ? -Math.sin(p.rot) * L.ox * p.s : 0;
        put(lumps, nl, p.x + ox, p.y + L.y * p.s, p.z + oz, L.r * p.s, p.rot, L.r * L.sy * p.s);
        lumps.setColorAt(nl++, color.setHex(L.c).offsetHSL(p.tint * 0.02, 0, p.tint * 0.05));
        if (K.tree && p.kind !== 'bamboo') put(stems, ns++, p.x + ox * 0.5, p.y, p.z + oz * 0.5, (L.stem || 0.45) * p.s, 0, (L.y - L.r * L.sy * 0.31) * p.s);
      }
    }
    for (const k of Object.keys(KINDS)) { const m = pools[k]; m.count = n[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    lumps.count = nl; lumps.instanceMatrix.needsUpdate = true; lumps.instanceColor.needsUpdate = true;
    stems.count = ns; stems.instanceMatrix.needsUpdate = true;
  }

  // Grass cells near you, made a few a frame; dropped when far behind.
  const cells = new Map();
  let seenVersion = groundVersion();
  function refillGrass(px, pz) {
    let i = 0;
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL), reach = Math.ceil(GRASS_R / CELL);
    for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
      const list = cells.get(`${ci + di},${cj + dj}`);
      if (!list) continue;
      for (const t of list) {
        const d = Math.hypot(t.x - px, t.z - pz);
        if (d > GRASS_R || i >= GRASS_CAP) continue;
        // Full near you, thinning toward the edge of the grass's reach.
        if (d > 14 && ((t.x * 7.31 + t.z * 3.17) % 1 + 1) % 1 > 1 - ((d - 14) / (GRASS_R - 14)) * 0.65) continue;
        put(grass, i, t.x, t.y, t.z, t.s, t.rot, t.sy * t.s);
        grass.setColorAt(i++, color.setRGB(t.r, t.g, t.b, THREE.LinearSRGBColorSpace));
      }
    }
    grass.count = i; grass.instanceMatrix.needsUpdate = true; grass.instanceColor.needsUpdate = true;
  }
  function makeCells(px, pz, budget) {
    if (groundVersion() !== seenVersion) { seenVersion = groundVersion(); cells.clear(); }
    let made = 0;
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL), reach = Math.ceil(GRASS_R / CELL);
    // Nearest cells first.
    for (let ring = 0; ring <= reach && made < budget; ring++) for (let dj = -ring; dj <= ring && made < budget; dj++) for (let di = -ring; di <= ring && made < budget; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
      const k = `${ci + di},${cj + dj}`;
      if (cells.has(k) || Math.hypot(di * CELL, dj * CELL) > GRASS_R + CELL) continue;
      cells.set(k, grassCell(ci + di, cj + dj)); made++;
    }
    for (const [k, v] of cells) { const [a, b] = k.split(',').map(Number); if (Math.hypot((a + 0.5) * CELL - px, (b + 0.5) * CELL - pz) > GRASS_R + 30) cells.delete(k); }
    return made;
  }

  let last = { x: 1e9, z: 1e9 }, lastGrass = { x: 1e9, z: 1e9 }, started = false, pendingGrass = false;
  return {
    colliders,
    plants, // for checks: { kind, x, y, z, s, rot, forest }
    get counts() { const o = { lumps: lumps.count, grass: grass.count, cells: cells.size, plants: plants.length }; for (const k of Object.keys(KINDS)) o[k] = pools[k].count; return o; },
    update(dt, elapsed, player) {
      const p = player.position;
      grassTime.value = elapsed; grassWalker.value.copy(p);
      if (Math.hypot(p.x - last.x, p.z - last.z) > 4) { refill(p.x, p.z); last = { x: p.x, z: p.z }; }
      const made = makeCells(p.x, p.z, started ? 2 : 1e6); started = true; // about 1 ms a frame while walking
      if (made) pendingGrass = true;
      if ((pendingGrass && made === 0) || Math.hypot(p.x - lastGrass.x, p.z - lastGrass.z) > 2.5) { refillGrass(p.x, p.z); lastGrass = { x: p.x, z: p.z }; pendingGrass = made > 0; }
    },
  };
}
