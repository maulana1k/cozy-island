// Colours for the new land, shared by the camp's ground mesh and the streamed tiles so the two
// agree where they overlap.
//
// The locals' hillside blends grass, dry golden grass, dirt and clay (sand near water) in natural
// patches from noise, height and slope: dirt and clay on slopes and terrace faces, dry grass up high,
// greener grass in the valley and by water, dark damp earth along the stream and in the paddies,
// leaf litter under the ridge's wood. Over that go ground stamps: worn dirt under paths (soft, ragged
// edges), packed earth on the square and in yards.
//
// ---- Ground stamps (for the village and farm builders) -------------------------------------------
//   import { paintGround, clearGroundStamps } from '../ground.js';   (from src/world/areas/*)
//   paintGround({ kind: 'path', path: [{ x, z }, ...], width: 1.8 });      worn dirt along a polyline
//   paintGround({ kind: 'packed', circle: { x, z, r: 4 } });              packed earth in a disc
//   paintGround({ kind: 'packed', rect: { x, z, rot, hw, hd } });         ... or a rectangle (rot: heading)
// kinds: path (worn dirt), packed (hard pale earth: squares, yards), dirt, clay, damp (dark wet earth),
// mud, grass, dry (golden grass), sand. Options: strength 0..1 (default 1), edge (soft edge, metres,
// default 0.5), ragged 0..1 (how much the edge wanders, default 0.5 for paths, 0.25 otherwise), tag.
// Call it while an area is being made (in create): the tiles are built afterwards and the camp's mesh
// repaints the touched part on its next frame. Calling it later also works (affected ground repaints).
// `clearGroundStamps(tag)` removes stamps with that tag. The plan's own stamps (the paths in
// AREAS.paths, the square, the yards in front of AREAS.plots) carry the tags 'plan-paths',
// 'plan-square' and 'plan-yards': clear them if you lay out your own.
import * as THREE from 'three';
import { groundKind, heightAt } from '../logic/terrain.js';
import { AREAS } from '../config.js';

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const C = (hex) => new THREE.Color(hex);
const bankSand = C(0xead6a4), bankWet = C(0xcdb688), bed = C(0x8f8462), trail = C(0xedd2a0);
const campGrass = C(0x86994e), rockLedge = C(0xb4a690), rockFace = C(0x8f8173), rockDark = C(0x7a6e63), moss = C(0x8e9a5e);
// The hillside's palette.
const dry = C(0xa9a25c), dryPale = C(0xb9b177), olive = C(0x8f9d50), green = C(0x7a984a), lush = C(0x5f8640); // natural, slightly muted greens
const dirt = C(0xd3a46c), clay = C(0xcc8a5c), clayDark = C(0xb87250), damp = C(0x97794f), mud = C(0x7d6246);
const litter = C(0x8f8a52), forestGreen = C(0x7d9a4c), streamBed = C(0x8b7a5a);
const STAMP = {
  path: C(0xdcb07a), packed: C(0xe3c391), dirt, clay, damp, mud, grass: green, dry, sand: bankSand,
};

// Smooth value noise in [0, 1] (a different lattice from the terrain's, so the patches do not follow the hills).
function hash(ix, iz) { let h = Math.imul(ix, 2246822519) ^ Math.imul(iz, 3266489917) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 15), 2654435761); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
const fbm = (x, z) => 0.55 * vnoise(x, z) + 0.3 * vnoise(x * 2.3 + 17, z * 2.3 + 5) + 0.15 * vnoise(x * 5.1 + 3, z * 5.1 + 41);
const blotch = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.17 + Math.cos(z * 0.13) * 2.3) * Math.cos(z * 0.15 + 0.7);
const t = new THREE.Color(), u = new THREE.Color(); // scratch

// ---- Stamps ----------------------------------------------------------------------------------
const STAMPS = [];
let version = 0;
const DIRTY = []; // { version, box: [x0, x1, z0, z1] }
function bbox(s) {
  const m = s.edge + s.ragged * 1.2 + 0.5;
  if (s.circle) return [s.circle.x - s.circle.r - m, s.circle.x + s.circle.r + m, s.circle.z - s.circle.r - m, s.circle.z + s.circle.r + m];
  if (s.rect) { const R = Math.hypot(s.rect.hw, s.rect.hd) + m; return [s.rect.x - R, s.rect.x + R, s.rect.z - R, s.rect.z + R]; }
  const xs = s.path.map((p) => p.x), zs = s.path.map((p) => p.z), w = s.width / 2 + m;
  return [Math.min(...xs) - w, Math.max(...xs) + w, Math.min(...zs) - w, Math.max(...zs) + w];
}
export function paintGround(stamp) {
  const s = { strength: 1, edge: 0.5, ragged: stamp.path ? 0.5 : 0.25, width: 1.6, ...stamp };
  if (!STAMP[s.kind]) throw new Error(`paintGround: unknown kind ${s.kind}`);
  if (s.rect) { s.rect = { ...s.rect, c: Math.cos(s.rect.rot || 0), s: Math.sin(s.rect.rot || 0) }; }
  s.box = bbox(s);
  STAMPS.push(s);
  DIRTY.push({ version: ++version, box: s.box });
  return s;
}
export function clearGroundStamps(tag) {
  for (let i = STAMPS.length - 1; i >= 0; i--) if (STAMPS[i].tag === tag) { DIRTY.push({ version: ++version, box: STAMPS[i].box }); STAMPS.splice(i, 1); }
}
// For the ground meshes: the boxes [x0, x1, z0, z1] repainted since `since`, and the current version.
export function groundChanges(since) { return { version, boxes: DIRTY.filter((d) => d.version > since).map((d) => d.box) }; }
export const groundVersion = () => version;

// How much stamp `s` covers (x, z): 0..1, with a soft, ragged edge.
function coverage(s, x, z) {
  const wob = s.ragged ? (vnoise(x * 0.9 + 7, z * 0.9 + 3) - 0.5) * 2 * s.ragged + (vnoise(x * 2.6, z * 2.6) - 0.5) * 0.6 * s.ragged : 0;
  let inside; // metres inside the stamp's edge (negative outside)
  if (s.circle) inside = s.circle.r - Math.hypot(x - s.circle.x, z - s.circle.z);
  else if (s.rect) {
    const dx = x - s.rect.x, dz = z - s.rect.z, a = Math.abs(dx * s.rect.c - dz * s.rect.s), b = Math.abs(dx * s.rect.s + dz * s.rect.c);
    inside = Math.min(s.rect.hw - a, s.rect.hd - b);
  } else {
    let d = Infinity;
    for (let i = 0; i < s.path.length - 1; i++) {
      const p = s.path[i], q = s.path[i + 1], dx = q.x - p.x, dz = q.z - p.z, l2 = dx * dx + dz * dz || 1e-9;
      const k = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / l2));
      d = Math.min(d, Math.hypot(x - p.x - dx * k, z - p.z - dz * k));
    }
    inside = s.width / 2 - d;
  }
  return smooth((inside + wob + s.edge * 0.5) / s.edge) * s.strength;
}
function applyStamps(c, x, z) {
  for (const s of STAMPS) {
    const b = s.box;
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    const k = coverage(s, x, z);
    if (k <= 0) continue;
    t.copy(STAMP[s.kind]);
    // A little life in the stamp: worn paths are paler down the middle, packed earth is mottled.
    if (s.kind === 'path' || s.kind === 'packed') t.lerp(dryPale, (vnoise(x * 0.7, z * 0.7) - 0.5) * 0.35 + 0.1).lerp(dirt, smooth((vnoise(x * 1.9 + 9, z * 1.9) - 0.55) / 0.3) * 0.35);
    c.lerp(t, k);
  }
}

// The plan's own stamps: the path network, the square and the yards in front of the house plots.
{
  const P = AREAS.paths;
  for (const [name, pts] of Object.entries(P)) {
    const width = name === 'main' ? 1.9 : name === 'ramp' ? 2.5 : name.startsWith('walk') ? 1.6 : 1.4;
    paintGround({ kind: 'path', path: pts, width, ragged: 0.7, edge: 0.7, tag: 'plan-paths', strength: name === 'ridgeTrail' ? 0.85 : 0.92 });
  }
  paintGround({ kind: 'packed', circle: { x: AREAS.square.x, z: AREAS.square.z, r: AREAS.square.r }, edge: 1.2, ragged: 0.35, tag: 'plan-square' });
  for (const p of AREAS.plots) {
    // The yard: the front half of the plot, toward the terrace walk.
    const fx = Math.sin(p.front), fz = Math.cos(p.front);
    paintGround({ kind: 'packed', rect: { x: p.x + fx * p.d * 0.22, z: p.z + fz * p.d * 0.22, rot: p.front, hw: p.w / 2 - 0.4, hd: p.d * 0.3 }, edge: 1, ragged: 0.45, strength: 0.55, tag: 'plan-yards' });
  }
  version = 0; DIRTY.length = 0; // nothing is built yet
}

// The hillside's own colour at (x, z), height h, slope (rise per metre), before stamps.
function hillside(x, z, h, slope, g) {
  const n1 = fbm(x / 9, z / 9), n2 = vnoise(x / 3.2 + 31, z / 3.2 + 11), n3 = fbm(x / 30 + 5, z / 30 + 9), fine = vnoise(x * 0.9 + 3, z * 0.9 + 8);
  // Grass first: greener low down, in the valley and by water; dry and golden up high and in the open.
  const water = Math.min(g.stream === Infinity ? 99 : g.stream, g.river === Infinity ? 99 : g.river + 2, g.spring + 1, g.lake + 2);
  const wet = Math.max(smooth((10 - water) / 8), smooth((2.2 - h) / 1.4) * 0.5) + (n3 - 0.5) * 0.9;
  const high = smooth((h - 3) / 3.5);
  // Golden where the patch noise says dry (more of it high up), olive between, green where it is wet.
  const dryness = smooth((n1 - 0.47 + high * 0.22 - wet * 0.35) / 0.16);
  t.copy(olive).lerp(dry, dryness).lerp(dryPale, dryness * smooth((n2 - 0.62) / 0.25) * 0.6);
  t.lerp(green, smooth((wet - 0.35 + (0.5 - n1) * 0.5) / 0.3) * (1 - high * 0.5));
  t.lerp(lush, smooth((wet - 0.75) / 0.3) * 0.75);
  // Fine mottling, so no stretch of grass is one flat colour.
  t.offsetHSL(0, 0, (fine - 0.5) * 0.07);
  // Bare dirt patches here and there, more where the ground is dry.
  t.lerp(dirt, smooth((fbm(x / 5 + 13, z / 5 + 2) - 0.64) / 0.1) * (0.5 + 0.35 * dryness) * (1 - smooth(wet) * 0.8));
  // Slopes wear through to dirt, then clay; terrace faces and steep banks are clay.
  const s = slope + (n2 - 0.5) * 0.12;
  t.lerp(dirt, smooth((s - 0.3) / 0.25) * 0.75);
  u.copy(clay).lerp(clayDark, n2 * 0.6);
  t.lerp(u, Math.max(smooth((s - 0.6) / 0.35) * (1 - g.terrace), g.face * 0.95));
  if (g.step > 0) t.lerp(dirt, g.step * 0.8);
  // The ridge's wood: leaf litter and moss under the trees.
  if (g.forest > -4) {
    const f = smooth((g.forest + 4) / 6);
    u.copy(forestGreen).lerp(litter, smooth((n2 - 0.35) / 0.4) * 0.8);
    t.lerp(u, f * (1 - smooth((s - 0.6) / 0.3) * 0.5));
  }
  // The clearing: a lawn, greener than the hill round it.
  if (g.clearing < 4) t.lerp(green, smooth((4 - g.clearing) / 4) * (0.55 + n2 * 0.3));
  // Paddies: dark damp earth (the farm puts water and rice on them).
  if (g.paddy > 0.01) { u.copy(damp).lerp(mud, n2 * 0.5); t.lerp(u, g.paddy * 0.9); }
  // The stream: damp earth on its banks, a dark bed under the water; the spring's pool likewise.
  const sd = Math.min(g.stream, g.spring + 1.3);
  if (sd < 3.4) { u.copy(damp).lerp(lush, smooth((sd - 1.5) / 1.6) * 0.65); t.lerp(u, smooth((3.4 - sd) / 1.8)); t.lerp(streamBed, smooth((1.3 - sd) / 0.6)); }
  return t;
}

// Paints `c` (already holding the old ground's colour) for the new land at (x, z), height h.
// `slope` (rise per metre) is worked out here when not given. Returns false where there is nothing
// new here, leaving `c` untouched.
export function paintNewGround(c, x, z, h, slope) {
  const g = groundKind(x, z);
  if (!g) return false;
  // Every colour below fades to nothing before these limits, so the gate leaves no hard edge (a hard
  // cut here, sampled on the 0.68 m vertex grid, drew a staircase of green and sand along the bank).
  const near = g.locals > 0.01 || g.rock > 0.01 || g.river < 22 || g.lake < 7 || g.oldTrail < 2.4;
  if (!near) return false;
  if (slope === undefined) { const e = 0.6; slope = Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); }
  // The locals' side. The beaches stay beach: only the grass gets the hillside's colours.
  if (g.locals > 0.01 && h > 0.15) c.lerp(hillside(x, z, h, slope, g), g.locals * smooth((h - 0.35) / 0.4));
  // The camp's side of the river was its beach: grass now runs down to a narrow sandy bank.
  // Its edges wander (noise), so grass, sand and mud meet in soft, ragged, painterly bands.
  if (g.river < 22 && g.mouth < 0.5 && g.locals < 0.01 && h > 0.1) {
    const n1 = fbm(x / 3.1 + 21, z / 3.1 + 4), n2 = vnoise(x / 1.3 + 5, z / 1.3 + 17);
    const reach = g.river - 2.1 - (n1 - 0.5) * 2.6 - (n2 - 0.5) * 0.8; // metres of grass past its ragged foot
    const k = smooth(reach / 2.4) * smooth((22 - g.river) / 6) * smooth((h - 0.1) / 0.3) * (1 - g.mouth * 2);
    // Lush and deep near the water, with paler and drier tufts further up.
    t.copy(campGrass).lerp(lush, smooth((7 - g.river) / 4) * (0.35 + 0.4 * n2)).lerp(olive, smooth((n1 - 0.6) / 0.2) * 0.4);
    c.lerp(t, k);
  }
  // Rock: pale on the ledges, darker on the steep faces, mossy where the top levels off.
  if (g.rock > 0.01) {
    t.copy(rockLedge).lerp(rockFace, smooth((slope - 0.5) / 0.9)).lerp(rockDark, smooth((slope - 1.6) / 1.5) * 0.6);
    t.lerp(moss, smooth((0.45 - slope) / 0.3) * smooth((h - 3) / 3) * 0.55);
    c.lerp(t, g.rock * smooth((h - 0.6) / 0.8));
  }
  // Sandy banks along the river and round the lake, wet at the water, a dark bed beneath it.
  const water = Math.min(g.river === Infinity ? 99 : g.river, g.lake);
  if (water < 7 && g.rock < 0.6) {
    const n = vnoise(x / 1.7 + 9, z / 1.7 + 2);
    t.copy(bankSand).lerp(bankWet, smooth(1 - (h - 0.05) / 0.35));
    // A band of dark wet sand and mud at the waterline, ragged, wider in the slow, low places.
    if (g.river < 3 && g.locals < 0.5) t.lerp(mud, smooth((1.4 + (n - 0.5) * 1.2 - Math.abs(water - 0.15)) / 0.9) * 0.55).lerp(damp, smooth((0.6 - Math.abs(water)) / 0.6) * 0.3);
    if (h < 0) t.lerp(bed, smooth(-h / 0.6));
    // On the camp's side the grass comes down closer: a narrower strip of sand.
    const reach = g.locals < 0.5 && g.lake > 7 ? 3.8 : 5.5;
    c.lerp(t, smooth((reach - water + (n - 0.5) * 1.2) / (reach * 0.55)) * (1 - g.mouth * 0.7));
  }
  // The camp-side trails: a plain pale band with a clean edge, no border.
  // Its edge is soft (about a metre) and wanders a little, so the 0.68 m vertex grid cannot step it.
  if (g.oldTrail < 2.4) c.lerp(trail, smooth((1.45 + (vnoise(x * 0.8 + 3, z * 0.8 + 7) - 0.5) * 0.45 - g.oldTrail) / 0.9));
  // Stamps: paths, the square, yards, and whatever the areas add.
  if (g.locals > 0.01 && h > 0.05) applyStamps(c, x, z);
  if (h > 0.1) vegTone(c, x, z, g.locals < 0.5);
  return true;
}

// ---- Ground tone under vegetation: where the grass grows lush the ground is a deeper, richer green; round and under
// bushes and trees it is darker and damper (a soft halo 2.4 m out). The grass uses the same drift fields and the same
// bush/tree list (addVegetation), so ground and grass agree. Bare and trodden ground (not green) is left pale and dusty.
const wave = (x, z, s, o) => Math.sin(x / s + o) * Math.cos(z / (s * 0.83) - o * 1.7) + 0.5 * Math.sin((x + z) / (s * 0.47) + o * 2.3);
export const grassDrift = (x, z) => wave(x, z, 5.3, 0.9) + 0.6 * wave(x, z, 2.1, 3.3);                 // the locals' land (src/world/flora.js)
export const campDrift = (x, z) => Math.sin(x * 0.31 + Math.cos(z * 0.27) * 1.9) * Math.cos(z * 0.29 + 1.3) + Math.sin(x * 0.9 + z * 0.7) * 0.25; // the camp (src/world/scatter.js)
const VEG_CELL = 6, VEG_HALO = 2.4, vegGrid = new Map();
// Registers bushes and trees as [{ x, z, r }] (r: how far the crown or the shrub reaches). With `dirty`, repaints the ground round them.
export function addVegetation(list, dirty = false) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of list) {
    const k = `${Math.floor(p.x / VEG_CELL)},${Math.floor(p.z / VEG_CELL)}`; let l = vegGrid.get(k); if (!l) vegGrid.set(k, l = []); l.push(p);
    x0 = Math.min(x0, p.x - p.r - VEG_HALO); x1 = Math.max(x1, p.x + p.r + VEG_HALO); z0 = Math.min(z0, p.z - p.r - VEG_HALO); z1 = Math.max(z1, p.z + p.r + VEG_HALO);
  }
  if (dirty && list.length) DIRTY.push({ version: ++version, box: [x0, x1, z0, z1] });
}
// Metres from (x, z) to the edge of the nearest registered bush or tree (Infinity when none within a few metres).
export function vegDist(x, z) {
  let d = Infinity; const i0 = Math.floor((x - 5) / VEG_CELL), i1 = Math.floor((x + 5) / VEG_CELL), j0 = Math.floor((z - 5) / VEG_CELL), j1 = Math.floor((z + 5) / VEG_CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = vegGrid.get(`${i},${j}`); if (l) for (const p of l) d = Math.min(d, Math.hypot(p.x - x, p.z - z) - p.r); }
  return d;
}
const veg = { deep: C(0x4a7a2a), damp: C(0x3e5024), dampBrown: C(0x4a4a2a) };
// Tints `c` in place. `camp`: use the camp's drift field instead of the locals' land's.
export function vegTone(c, x, z, camp = false) {
  const green = smooth((c.g / Math.max(1e-4, c.r) - 1.15) / 0.35); // 0 on dirt, sand and stone; 1 on grass
  if (green <= 0.01) return;
  const drift = camp ? campDrift(x, z) : grassDrift(x, z);
  c.lerp(veg.deep, green * smooth((drift + 0.1) / 0.7) * 0.4);
  const e = vegDist(x, z);
  if (e < VEG_HALO) c.lerp(veg.damp, green * smooth((VEG_HALO - e) / VEG_HALO) * 0.6).lerp(veg.dampBrown, green * smooth((0.8 - e) / 0.8) * 0.25);
}

// ---- Sun-dried patches (The Trail and Alba: warm ochre ground under cool blue distance) --------------
// Big, soft patches where open grass has dried to a muted gold, about 40% of the open ground: fewer
// round the camp's lawn (kept a little greener as the place you live), none under trees and bushes.
// dryPatch is 0..1; the grass tufts use it too (scatter.js, flora.js, wilds.js) so blades and ground agree.
const goldDry = C(0xb3a05c), goldPale = C(0xc2ad70), ochre = C(0xb8925a);
export function dryPatch(x, z) {
  const n = fbm(x / 26 + 50, z / 26 + 20) + (vnoise(x / 7 + 3, z / 7 + 61) - 0.5) * 0.12;
  const camp = Math.hypot(x - 10, z - 8);
  const p = smooth((n - 0.45 - (camp < 22 ? 0.03 * (1 - camp / 22) : 0)) / 0.12);
  const e = vegDist(x, z);
  return e < VEG_HALO + 0.6 ? p * smooth((e + 0.4) / (VEG_HALO + 1)) : p;
}
// Warms `c` in place where it is grass (green, not dirt, sand or stone): gold in the dry patches, with a
// paler or more ochre cast from a second, finer field, so the patches are not one flat tone.
export function warmGround(c, x, z) {
  const green = smooth((c.g / Math.max(1e-4, c.r) - 1.08) / 0.3);
  if (green <= 0.01) return;
  const k = dryPatch(x, z) * green;
  if (k <= 0.01) return;
  const f = vnoise(x / 4.3 + 17, z / 4.3 + 5);
  t.copy(goldDry).lerp(goldPale, smooth((f - 0.55) / 0.3) * 0.6).lerp(ochre, smooth((0.4 - f) / 0.3) * 0.5);
  t.multiplyScalar(0.94 + 0.12 * Math.min(1, c.r * 3)); // keep a little of the old light and dark
  c.lerp(t, k * 0.85);
}

// Slope (rise per metre) at each vertex of a regular grid of heights (row-major, n x n, spacing `step`).
export function gridSlopes(heights, n, step) {
  const out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const at = (a, b) => heights[Math.min(n - 1, Math.max(0, b)) * n + Math.min(n - 1, Math.max(0, a))];
    // Over two cells each way, so a narrow bank does not flicker from vertex to vertex.
    const sx = (at(i + 2, j) - at(i - 2, j)) / ((Math.min(n - 1, i + 2) - Math.max(0, i - 2)) * step);
    const sz = (at(i, j + 2) - at(i, j - 2)) / ((Math.min(n - 1, j + 2) - Math.max(0, j - 2)) * step);
    out[j * n + i] = Math.hypot(sx, sz);
  }
  return out;
}

// ---- The stream's water: a ribbon along AREAS.stream, a hand deep over its bed, always running
// downhill, with a round pool at the spring. One mesh, one draw call.
export const STREAM_WATER_DEPTH = 0.22;
export function buildStreamWater() {
  const pts = AREAS.stream, samples = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.8));
    for (let k = 0; k < n; k++) samples.push({ x: a.x + (b.x - a.x) * (k / n), z: a.z + (b.z - a.z) * (k / n) });
  }
  samples.push({ ...pts[pts.length - 1] });
  // Smooth the line a little so the ribbon has no kinks, then find the water level: the bed plus a
  // hand, never rising downstream.
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i < samples.length - 1; i++) { const p = samples[i - 1], q = samples[i + 1]; samples[i].x = (p.x + q.x + samples[i].x * 2) / 4; samples[i].z = (p.z + q.z + samples[i].z * 2) / 4; }
  let level = Infinity;
  for (const s of samples) { level = Math.min(level, heightAt(s.x, s.z) + STREAM_WATER_DEPTH); s.y = Math.max(level, 0.03); }
  const posA = [], colA = [], idx = [], HALF = 1.2, deep = C(0x6fb3c9), shallow = C(0x9fd3dc), c = new THREE.Color();
  samples.forEach((s, i) => {
    const p = samples[Math.max(0, i - 1)], q = samples[Math.min(samples.length - 1, i + 1)], dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    for (const [side, k] of [[-1, 0], [-0.45, 1], [0.45, 1], [1, 0]]) {
      posA.push(s.x + nx * HALF * side, s.y, s.z + nz * HALF * side);
      c.copy(shallow).lerp(deep, k * (0.6 + 0.4 * vnoise(s.x * 0.4, s.z * 0.4))); colA.push(c.r, c.g, c.b);
    }
    if (i) { const o = (i - 1) * 4; for (let j = 0; j < 3; j++) idx.push(o + j, o + j + 4, o + j + 1, o + j + 1, o + j + 4, o + j + 5); }
  });
  // The spring's pool.
  const sp = AREAS.spring, base = posA.length / 3, y0 = samples[0].y;
  posA.push(sp.x, y0, sp.z); colA.push(deep.r, deep.g, deep.b);
  for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; posA.push(sp.x + Math.cos(a) * (sp.r + 0.3), y0, sp.z + Math.sin(a) * (sp.r + 0.3)); colA.push(shallow.r, shallow.g, shallow.b); if (k) idx.push(base, base + k + 1, base + k); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
  mesh.renderOrder = 1; mesh.name = 'stream';
  mesh.userData.samples = samples; // centreline points with the water level y, for anyone who needs it
  return mesh;
}
