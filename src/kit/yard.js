// INTERNAL. Yard props and boundaries for the village: potted plants, benches, a table and chairs, a
// flower arch, firewood, water jars, a bicycle, a handcart, a chicken coop, a washing line, ready-made
// yards, hedges, dry-stone walls, a retaining wall, stone steps, a gate and a bamboo fence.
// Every builder returns { group, colliders } (steps also return `platforms`). Units are metres (scout 1.05 m,
// adult 1.6 m), the origin is on the ground at the model's base, +z is forward.
// Props are centred on the origin. Boundaries (hedge, walls, fence) run from x = 0 to x = length so
// they can be chained end to end; the gate and the steps are centred on x = 0.
//
// Cost: each model is welded into ONE mesh with ONE material (a tiny colour atlas: a canvas of flat
// colour cells; every piece's UVs point at its cell). Without a document (tests) it falls back to shared(color).
import * as THREE from 'three';
import { shared, mergeStatic } from '../world/build.js';

// ---- The colour atlas -------------------------------------------------------------------------
const AW = 1024, AH = 64, CELL = 16;
let atlasMat = null, atlasCtx = null, atlasTex = null;
const cells = new Map();
function atlas() {
  if (typeof document === 'undefined') return null;
  if (!atlasMat) {
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH; atlasCtx = cv.getContext('2d');
    atlasTex = new THREE.CanvasTexture(cv); atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.generateMipmaps = false; atlasTex.minFilter = THREE.LinearFilter; // every piece samples one cell centre, so no blur between cells
    atlasMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true, map: atlasTex });
  }
  return atlasMat;
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
function cell(color) {
  if (!cells.has(color)) {
    const i = Math.min(cells.size, 255), px = (i % 64) * CELL, py = Math.floor(i / 64) * CELL;
    atlasCtx.fillStyle = hex(color); atlasCtx.fillRect(px, py, CELL, CELL); atlasTex.needsUpdate = true;
    cells.set(color, { u: (px + CELL / 2) / AW, v: 1 - (py + CELL / 2) / AH });
  }
  return cells.get(color);
}
// Point a mesh's UVs at one colour in the atlas and give it the atlas material.
function paint(mesh, color) {
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (!atlas()) { mesh.material = shared(color); return mesh; }
  const r = cell(color), uv = mesh.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u, r.v);
  mesh.material = atlasMat;
  return mesh;
}

// ---- Palette ----------------------------------------------------------------------------------
const DK = 0x8c6444, MID = 0xb98a5e, LT = 0xc79a62, PALE = 0xe3c79a, DARK = 0x3b2a22, GREYWOOD = 0x9a7350;
const CLAY = 0xc9693f, CLAY_D = 0xa9532f, CLAY_L = 0xdd8a52, CREAM = 0xfaf3e2, RED = 0xe8503a, YEL = 0xf2b63b, BLUE = 0x4f7fc9, TEAL = 0x5fa8a0;
const PINK = 0xf08fa8, VIOLET = 0xa77bd6, ROPE = 0xe9dcc0, STRAW = 0xd8bb72, BAMBOO = 0xd8bb72, BAMBOO_D = 0xb08a4a, SOIL = 0x5b4332, IRON = 0x6c6a72;
const LEAF = 0x6fae56, LEAF_D = 0x4f8a48, LEAF_L = 0x8cbf62, GREENS = [LEAF, LEAF_D, LEAF_L];
const STONES = [0xb9ada4, 0xc8bcab, 0xa89c94, 0xd0c4b0, 0xb3a8ad, 0x9d928c];

// ---- Little builders (each returns a painted mesh) --------------------------------------------
const mk = (geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, atlas() || shared(c)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return paint(m, c); };
const bx = (w, h, d, c, x = 0, y = 0, z = 0, ry = 0, rz = 0, rx = 0) => mk(new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz);
const cy = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 6, open = false) => mk(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), c, x, y, z);
const cn = (r, h, c, x = 0, y = 0, z = 0, seg = 5, open = false) => mk(new THREE.ConeGeometry(r, h, seg, 1, open), c, x, y, z);
// A lumpy ball (20 triangles), stretched by sx, sy, sz.
const bl = (r, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const m = mk(new THREE.IcosahedronGeometry(r, 0), c, x, y, z); m.scale.set(sx, sy, sz); return m; };
// A tiny faceted bead (8 triangles): a flower or a leaf.
const oc = (r, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const m = mk(new THREE.OctahedronGeometry(r, 0), c, x, y, z); m.scale.set(sx, sy, sz); return m; };
const UP = new THREE.Vector3(0, 1, 0);
// A pole or rope from point a to point b (open ended: the ends are always hidden or thin).
const sk = (a, b, r, c, seg = 5) => {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), m = mk(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), seg, 1, true), c);
  m.position.copy(va).add(vb).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(UP, vb.sub(va).normalize()); return m;
};
// A flat leaf blade (a squashed open cone) from `base` pointing along `dir`, `len` long, `w` wide.
const blade = (base, dir, len, w, c, seg = 4) => {
  const d = new THREE.Vector3(...dir).normalize(), m = mk(new THREE.ConeGeometry(w, len, seg, 1, true), c);
  m.position.set(base[0] + d.x * len / 2, base[1] + d.y * len / 2, base[2] + d.z * len / 2); m.quaternion.setFromUnitVectors(UP, d); m.scale.z = 0.35; return m;
};
const at = (m, rx = 0, ry = 0, rz = 0) => { m.rotation.set(rx, ry, rz); return m; };
function rngOf(seed) { let a = (seed * 2654435761 + 1013904223) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
// Runs an inner builder into a fresh group, welds it, and returns the standard result.
function wrap(inner, ...args) {
  const root = new THREE.Group(), colliders = inner(root, ...args) || [];
  mergeStatic(root);
  return { group: root, colliders };
}

// ---- Irregular stones -------------------------------------------------------------------------
// A box whose eight corners are each pulled in a little, so it reads as a roughly cut stone. Corners only
// move inward, so neighbouring stones never overlap. Flat top / flat bottom keep a wall's top and foot true.
function stoneGeo(w, h, d, rnd, j, flatTop, flatBottom) {
  const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, off = new Map();
  for (let i = 0; i < p.count; i++) {
    const sx = Math.sign(p.getX(i)), sy = Math.sign(p.getY(i)), sz = Math.sign(p.getZ(i)), key = sx + ',' + sy + ',' + sz;
    if (!off.has(key)) off.set(key, [rnd() * j * w, rnd() * j * h, rnd() * j * d * 0.6]);
    const o = off.get(key), dy = sy > 0 ? (flatTop ? 0 : -o[1]) : (flatBottom ? 0 : o[1]);
    p.setXYZ(i, p.getX(i) - sx * o[0], p.getY(i) + dy, p.getZ(i) - sz * o[2]);
  }
  return g;
}
// Staggered courses of stones along x from 0 to len, between y = 0 and y = height, centred on z = zc.
// Stone widths are random between o.min and o.max, so any length works without stretching.
function dryStone(g, len, height, thick, zc, rnd, o) {
  const n = Math.max(1, Math.round(height / o.ch)), ch = height / n;
  for (let r = 0; r < n; r++) {
    const top = r === n - 1;
    let cur = 0, first = true;
    while (cur < len - 1e-4) {
      let w = o.min + rnd() * (o.max - o.min);
      if (first && r % 2) w *= 0.5; // odd courses start on a half stone, so the joints stagger
      first = false;
      w = Math.min(w, len - cur); if (len - cur - w < o.min * 0.6) w = len - cur;
      const gh = top && o.flushTop ? ch : ch - 0.012, gd = thick * (0.9 + rnd() * 0.1);
      const geo = stoneGeo(w - 0.02, gh, gd, rnd, o.jit, top && o.flushTop, r === 0);
      g.add(mk(geo, pick(rnd, STONES), cur + w / 2, r * ch + ch / 2, zc - rnd() * o.recess));
      cur += w;
    }
  }
}
// A small tuft of grass blades with a flower or two, growing from (x, y, z), leaning out along (lx, lz).
function tuft(g, x, y, z, lx, lz, rnd, flower) {
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * 6.28 + rnd(), s = 0.35 + rnd() * 0.15;
    g.add(blade([x, y, z], [Math.cos(a) * s + lx, 0.8, Math.sin(a) * s + lz], 0.2 + rnd() * 0.15, 0.03, pick(rnd, GREENS), 4));
  }
  if (flower) g.add(oc(0.04, flower, x + lx * 0.12, y + 0.26, z + lz * 0.12));
}

// =============================================================================================
// YARD PROPS
// =============================================================================================

// A terracotta pot: tapering body with a lip around the rim.
function pot(g, x, z, s, c, y = 0) {
  g.add(cy(0.15 * s, 0.1 * s, 0.22 * s, c, x, y + 0.11 * s, z, 7), cy(0.17 * s, 0.16 * s, 0.045 * s, c, x, y + 0.235 * s, z, 7, true), cy(0.15 * s, 0.15 * s, 0.01, SOIL, x, y + 0.235 * s, z, 7));
}
// Small flowers sitting on the top of a leafy mound at (cx, cy, cz) of radius r.
function blossoms(g, cx, cyy, cz, r, colors, n, rnd) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 6.28 + rnd(), up = 0.35 + rnd() * 0.5, rr = r * Math.sqrt(1 - up * up);
    g.add(oc(0.05, colors[k % colors.length], cx + Math.cos(a) * rr, cyy + r * up * 0.9, cz + Math.sin(a) * rr));
  }
}
// Pots with plants. 0 flowers (two pots in bloom), 1 herbs (a wooden planter), 2 a small palm, 3 three pots of different sizes.
function pottedPlantsInner(g, variant) {
  const rnd = rngOf(40 + variant);
  if (variant === 0) {
    pot(g, -0.2, 0, 1.25, CLAY); g.add(bl(0.24, LEAF, -0.2, 0.42, 0, 1, 0.8, 1)); blossoms(g, -0.2, 0.42, 0, 0.24, [RED, YEL, PINK], 7, rnd);
    pot(g, 0.22, 0.12, 0.95, TEAL); g.add(bl(0.2, LEAF_D, 0.22, 0.36, 0.12, 1, 0.8, 1)); blossoms(g, 0.22, 0.36, 0.12, 0.2, [YEL, VIOLET], 5, rnd);
    return [{ x: 0, z: 0.05, r: 0.42 }];
  }
  if (variant === 1) {
    // A wooden planter box on short legs, full of upright herb tufts
    g.add(bx(0.8, 0.2, 0.3, MID, 0, 0.22, 0), bx(0.82, 0.04, 0.32, DK, 0, 0.33, 0), bx(0.06, 0.12, 0.26, DK, -0.33, 0.06, 0), bx(0.06, 0.12, 0.26, DK, 0.33, 0.06, 0), bx(0.74, 0.01, 0.24, SOIL, 0, 0.335, 0));
    for (let k = 0; k < 14; k++) {
      const x = -0.34 + (k / 13) * 0.68, z = (k % 2 ? 0.06 : -0.06), h = 0.18 + rnd() * 0.14, a = rnd() * 6;
      g.add(blade([x, 0.33, z], [Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3], h, 0.045, pick(rnd, GREENS), 5));
    }
    g.add(oc(0.04, YEL, 0.2, 0.62, 0.05), oc(0.04, PINK, -0.25, 0.58, -0.04));
    return [{ x: 0, z: 0, hw: 0.42, hd: 0.17, rot: 0 }];
  }
  if (variant === 2) {
    // A small palm in a big pot: a leaning trunk and five arching fronds
    pot(g, 0, 0, 1.4, CLAY_D);
    g.add(sk([0, 0.3, 0], [0.05, 0.75, 0.02], 0.04, DK, 5), sk([0.05, 0.75, 0.02], [0.02, 1.2, 0.07], 0.034, DK, 5), bl(0.06, DK, 0.02, 1.22, 0.07));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 6.28 + 0.3, ca = Math.cos(a), sa = Math.sin(a), b = [0.02, 1.22, 0.07];
      g.add(blade(b, [ca * 0.7, 0.75, sa * 0.7], 0.34, 0.12, LEAF, 5));
      g.add(blade([b[0] + ca * 0.24, b[1] + 0.25, b[2] + sa * 0.24], [ca * 0.9, -0.3, sa * 0.9], 0.42, 0.11, k % 2 ? LEAF_D : LEAF_L, 5));
    }
    return [{ x: 0, z: 0, r: 0.3 }];
  }
  // 3: three pots, tall to small, each with its own plant
  pot(g, -0.1, -0.05, 1.7, CLAY); g.add(bl(0.3, LEAF_D, -0.1, 0.62, -0.05, 1, 1.1, 1), bl(0.2, LEAF, -0.02, 0.84, 0, 1, 0.9, 1));
  pot(g, 0.38, 0.1, 1.1, CLAY_L); g.add(bl(0.2, LEAF, 0.38, 0.4, 0.1, 1, 0.8, 1)); blossoms(g, 0.38, 0.4, 0.1, 0.2, [RED, YEL], 5, rnd);
  pot(g, 0.12, 0.38, 0.75, CREAM); g.add(bl(0.14, LEAF_L, 0.12, 0.3, 0.38, 1, 0.8, 1), oc(0.04, PINK, 0.12, 0.4, 0.38));
  return [{ x: 0.1, z: 0.12, r: 0.5 }];
}
export const buildPottedPlants = (variant = 0) => wrap(pottedPlantsInner, variant);

// A bench just right for a child to climb on: a plank seat and two backrest slats on two chunky legs.
function benchInner(g) {
  g.add(bx(1.5, 0.06, 0.34, MID, 0, 0.42, 0.02), bx(1.5, 0.05, 0.05, DK, 0, 0.36, -0.12), bx(1.5, 0.05, 0.05, DK, 0, 0.36, 0.16));
  for (const s of [-1, 1]) g.add(bx(0.07, 0.4, 0.34, DK, s * 0.62, 0.2, 0.02), bx(0.06, 0.4, 0.06, DK, s * 0.62, 0.62, -0.18, 0, 0, -0.12)); // legs; back posts
  g.add(bx(1.4, 0.1, 0.03, MID, 0, 0.66, -0.2, 0, 0, -0.12), bx(1.4, 0.1, 0.03, MID, 0, 0.8, -0.23, 0, 0, -0.12));
  return [{ x: 0, z: 0, hw: 0.76, hd: 0.24, rot: 0 }];
}
export const buildBench = () => wrap(benchInner);

// A round stool: three splayed legs, a round seat and a ring brace.
function stoolInner(g) {
  g.add(cy(0.19, 0.19, 0.06, LT, 0, 0.4, 0, 8), cy(0.2, 0.2, 0.025, DK, 0, 0.37, 0, 8));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28 + 0.5, c = Math.cos(a), s = Math.sin(a); g.add(sk([c * 0.12, 0.38, s * 0.12], [c * 0.2, 0, s * 0.2], 0.03, DK, 5)); }
  g.add(cy(0.13, 0.13, 0.025, DK, 0, 0.17, 0, 6, true));
  return [{ x: 0, z: 0, r: 0.22 }];
}
export const buildStool = () => wrap(stoolInner);

// A low round table with two chairs facing each other across it, and a teapot and cups on top.
function chair(g, x, z, ry) {
  const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
  c.add(bx(0.34, 0.04, 0.34, MID, 0, 0.38, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(sk([sx * 0.14, 0, sz * 0.14], [sx * 0.14, 0.37, sz * 0.14], 0.022, DK, 4));
  for (const sx of [-1, 1]) c.add(sk([sx * 0.14, 0.38, -0.15], [sx * 0.14, 0.8, -0.17], 0.022, DK, 4));
  c.add(bx(0.3, 0.07, 0.025, MID, 0, 0.72, -0.165), bx(0.3, 0.07, 0.025, MID, 0, 0.6, -0.16));
}
function tableChairsInner(g) {
  g.add(cy(0.5, 0.5, 0.05, LT, 0, 0.58, 0, 8), cy(0.48, 0.48, 0.06, DK, 0, 0.53, 0, 8), cy(0.06, 0.08, 0.5, DK, 0, 0.27, 0, 6), cy(0.26, 0.3, 0.04, DK, 0, 0.02, 0, 6));
  g.add(bl(0.09, TEAL, 0.1, 0.69, 0.05, 1, 0.85, 1), cy(0.03, 0.03, 0.03, TEAL, 0.1, 0.78, 0.05, 5), sk([0.18, 0.7, 0.05], [0.26, 0.74, 0.05], 0.014, TEAL, 4)); // teapot
  g.add(cy(0.035, 0.028, 0.05, CREAM, -0.2, 0.64, -0.12, 6), cy(0.035, 0.028, 0.05, CREAM, -0.08, 0.64, 0.2, 6));
  chair(g, 0.8, 0, -Math.PI / 2); chair(g, -0.8, 0, Math.PI / 2);
  return [{ x: 0, z: 0, r: 0.5 }, { x: 0.8, z: 0, r: 0.24 }, { x: -0.8, z: 0, r: 0.24 }];
}
export const buildTableAndChairs = () => wrap(tableChairsInner);

// A walk-through arch of bamboo: two posts and a half-round of canes overhead, wrapped in a flowering vine.
function flowerArchInner(g) {
  const R = 0.78, base = 1.45, rnd = rngOf(11);
  for (const s of [-1, 1]) { g.add(cy(0.05, 0.06, base + 0.05, BAMBOO, s * R, (base + 0.05) / 2, 0, 6), bx(0.18, 0.04, 0.18, DK, s * R, 0.02, 0)); }
  const N = 8, pts = [];
  for (let i = 0; i <= N; i++) { const a = Math.PI * (1 - i / N); pts.push([Math.cos(a) * R, base + Math.sin(a) * 0.72, 0]); }
  for (let i = 0; i < N; i++) g.add(sk(pts[i], pts[i + 1], 0.04, i % 2 ? BAMBOO : BAMBOO_D, 5));
  for (const y of [0.5, 1.0]) for (const s of [-1, 1]) g.add(bx(0.05, 0.05, 0.16, BAMBOO_D, s * R, y, 0)); // cross lashings
  // the vine: lumpy leaves along both posts and over the top, with flowers dotted through
  const leafAt = (x, y, z, k) => g.add(oc(0.085 + rnd() * 0.03, GREENS[k % 3], x + (rnd() - 0.5) * 0.06, y, z + (rnd() - 0.5) * 0.14, 1.2, 0.8, 1));
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) leafAt(s * (R + (k % 2 ? 0.03 : -0.03)), 0.5 + k * 0.3, 0, k + (s > 0 ? 1 : 0));
  for (let i = 1; i < N; i++) { leafAt(pts[i][0], pts[i][1] + 0.02, 0, i); if (i % 2) leafAt(pts[i][0] * 0.98, pts[i][1] - 0.07, 0.05, i + 1); }
  const cols = [PINK, YEL, VIOLET, RED];
  for (let k = 0; k < 11; k++) { const i = 1 + (k * 5) % 7, p = pts[i]; g.add(oc(0.055, cols[k % 4], p[0], p[1] - 0.04 + (k % 3) * 0.03, (k % 2 ? 0.1 : -0.1))); }
  for (const s of [-1, 1]) g.add(oc(0.055, s > 0 ? PINK : YEL, s * R, 0.75, 0.1), oc(0.055, s > 0 ? VIOLET : RED, s * R, 1.1, -0.1));
  return [{ x: -R, z: 0, r: 0.08 }, { x: R, z: 0, r: 0.08 }]; // posts only: the middle is a doorway
}
export const buildFlowerArch = () => wrap(flowerArchInner);

// A neat stack of split logs held between two stakes, with a chopping block and an axe beside it.
function firewoodInner(g) {
  const rnd = rngOf(5), rows = [5, 4, 3, 2];
  rows.forEach((n, r) => {
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 0.2, y = 0.095 + r * 0.17, rad = 0.085 + rnd() * 0.012;
      g.add(at(cy(rad, rad, 0.56, r % 2 ? DK : GREYWOOD, x, y, 0, 5, true), Math.PI / 2, 0, 0)); // log lying along z
      g.add(at(cy(rad * 0.8, rad * 0.8, 0.01, PALE, x, y, 0.285, 5), Math.PI / 2, 0, 0));          // pale cut end on the front
    }
  });
  for (const s of [-1, 1]) g.add(cy(0.03, 0.035, 0.85, DK, s * 0.62, 0.42, 0.05, 5, true));
  g.add(cy(0.2, 0.22, 0.32, LT, 0.9, 0.16, 0.5, 7), cy(0.17, 0.17, 0.01, PALE, 0.9, 0.325, 0.5, 7));
  g.add(sk([0.88, 0.32, 0.5], [0.8, 0.52, 0.5], 0.018, DK, 4), bx(0.12, 0.08, 0.025, IRON, 0.79, 0.54, 0.5, 0, 0.4));
  return [{ x: 0, z: 0.02, hw: 0.62, hd: 0.34, rot: 0 }, { x: 0.9, z: 0.5, r: 0.22 }];
}
export const buildFirewoodStack = () => wrap(firewoodInner);

// Big clay water jars (a lathe-turned belly, neck and flared rim), standing on a little slatted board.
function jarGeo() {
  const prof = [[0.001, 0], [0.17, 0], [0.27, 0.2], [0.3, 0.38], [0.2, 0.6], [0.13, 0.7], [0.17, 0.77], [0.001, 0.75]].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(prof, 8);
}
function waterJarsInner(g, count) {
  const spots = count === 2 ? [[-0.3, 0, 0.9, CLAY], [0.3, 0.05, 1.0, CLAY_D]] : [[-0.4, -0.05, 1.0, CLAY], [0.25, -0.12, 0.85, CLAY_D], [0.05, 0.38, 0.7, CLAY_L]];
  const cols = [];
  g.add(bx(1.2, 0.04, 0.9, DK, 0, 0.02, 0.1, 0.1), bx(1.2, 0.04, 0.12, GREYWOOD, 0, 0.005, 0.1, 0.1));
  spots.forEach(([x, z, s, c], i) => {
    const jar = mk(jarGeo(), c, x, 0.04, z); jar.scale.set(s, s, s); g.add(jar);
    g.add(cy(0.15 * s, 0.1 * s, 0.05, DK, x, 0.04 + 0.78 * s, z, 7)); // a wooden lid sitting in the mouth
    cols.push({ x, z, r: 0.3 * s });
  });
  g.add(bl(0.07, STRAW, 0.45, 0.07, 0.5, 1.2, 0.7, 1), sk([0.45, 0.1, 0.5], [0.58, 0.04, 0.58], 0.014, DK, 4)); // a coconut-shell ladle on the board
  return cols;
}
export const buildWaterJars = (count = 3) => wrap(waterJarsInner, count);

// A wheel: a thin torus tyre with a hub and a few spokes. Plane is x-y, axle along z.
function wheel(g, x, y, z, r, tyre, ry = 0) {
  const w = new THREE.Group(); w.position.set(x, y, z); w.rotation.y = ry; g.add(w);
  w.add(mk(new THREE.TorusGeometry(r, tyre, 4, 12), DARK), cy(0.035, 0.035, 0.06, IRON, 0, 0, 0, 5));
  for (let k = 0; k < 3; k++) w.add(bx(r * 1.9, 0.012, 0.012, ROPE, 0, 0, 0, 0, (k / 3) * Math.PI));
}
// A leaning bicycle (lying along x) with a basket, standing on a kickstand.
function bicycleInner(g) {
  const b = new THREE.Group(); b.rotation.x = 0.1; g.add(b); // leans on its stand
  const R = 0.33, ax = 0.52;
  wheel(b, -ax, R, 0, R, 0.022); wheel(b, ax, R, 0, R, 0.022);
  const fr = TEAL, bb = [-0.02, 0.3, 0], seat = [-0.2, 0.76, 0], head = [0.4, 0.72, 0];
  b.add(sk([-ax, R, 0], bb, 0.017, fr, 4), sk(bb, seat, 0.017, fr, 4), sk(bb, head, 0.02, fr, 4), sk(seat, head, 0.017, fr, 4), sk([-ax, R, 0.0], seat, 0.014, fr, 4), sk(head, [ax, R, 0], 0.016, DK, 4)); // frame and fork
  b.add(bx(0.2, 0.04, 0.1, DARK, -0.22, 0.79, 0), sk([0.4, 0.72, 0], [0.43, 0.84, 0], 0.016, IRON, 4), bx(0.04, 0.04, 0.5, IRON, 0.43, 0.85, 0)); // saddle, stem, handlebar
  b.add(cy(0.17, 0.14, 0.2, STRAW, 0.56, 0.92, 0, 7), bl(0.1, LEAF, 0.56, 1.02, 0, 1, 0.8, 1)); // a woven basket on the front with greens
  b.add(bx(0.04, 0.02, 0.14, IRON, -0.02, 0.28, 0), sk([-0.2, 0.3, 0.02], [-0.3, 0.02, 0.14], 0.012, IRON, 3)); // pedal, kickstand
  return [{ x: 0, z: 0.02, hw: 0.62, hd: 0.14, rot: 0 }];
}
export const buildBicycle = () => wrap(bicycleInner);

// A wooden two-wheeled handcart with its shafts resting on the ground and a load of baskets and a sack.
function handcartInner(g) {
  g.add(bx(0.95, 0.05, 1.1, MID, 0, 0.42, 0)); // bed
  for (const s of [-1, 1]) g.add(bx(0.05, 0.22, 1.1, LT, s * 0.46, 0.55, 0)); // side boards
  g.add(bx(0.92, 0.2, 0.05, LT, 0, 0.54, -0.53), bx(0.92, 0.14, 0.05, LT, 0, 0.5, 0.53)); // back and front boards
  for (const s of [-1, 1]) {
    g.add(sk([s * 0.43, 0.4, 0.3], [s * 0.4, 0.07, 1.65], 0.03, DK, 5), bx(0.06, 0.06, 1.0, DK, s * 0.43, 0.37, -0.1)); // shafts and bed rails
    wheel(g, s * 0.56, 0.3, 0.05, 0.3, 0.035, Math.PI / 2);
    g.add(cy(0.03, 0.03, 0.14, IRON, s * 0.5, 0.3, 0.05, 5)); // axle stub
  }
  g.add(bl(0.27, 0xe3c79a, -0.15, 0.7, -0.15, 1, 0.85, 1.1), cn(0.07, 0.1, 0xe3c79a, -0.15, 0.97, -0.15, 5)); // a sack tied at the top
  g.add(cy(0.2, 0.15, 0.17, STRAW, 0.18, 0.54, 0.25, 7), bl(0.07, RED, 0.14, 0.66, 0.25), bl(0.07, YEL, 0.24, 0.65, 0.3), bl(0.07, RED, 0.2, 0.68, 0.18));
  return [{ x: 0, z: 0.05, hw: 0.62, hd: 0.62, rot: 0 }];
}
export const buildHandcart = () => wrap(handcartInner);

// A small chicken coop raised on four legs: a plank house, a pitched roof, a pop-hole, a ramp with cleats, a nest box and a perch.
// A flat triangle (a gable end) with its base on y, facing +z, turned by ry.
function gable(hw, h, c, x, y, z, ry) {
  const sh = new THREE.Shape(); sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(0, h); sh.closePath();
  return mk(new THREE.ShapeGeometry(sh), c, x, y, z, 0, ry, 0);
}
function coopInner(g) {
  const L = 0.4, W = 1.0, D = 0.75;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cy(0.04, 0.05, L + 0.05, DK, sx * (W / 2 - 0.08), (L + 0.05) / 2, sz * (D / 2 - 0.08), 5, true));
  g.add(bx(W, 0.05, D, GREYWOOD, 0, L + 0.025, 0), bx(W - 0.04, 0.5, D - 0.04, 0xe3c79a, 0, L + 0.3, 0)); // floor and walls
  g.add(bx(0.3, 0.3, 0.02, DARK, -0.2, L + 0.25, D / 2 - 0.015), bx(0.36, 0.04, 0.05, DK, -0.2, L + 0.42, D / 2 - 0.01)); // pop-hole and lintel
  for (const s of [-1, 1]) g.add(bx(0.03, 0.5, 0.02, DK, s * 0.2, L + 0.3, D / 2 - 0.015));
  g.add(bx(0.4, 0.28, 0.02, DARK, 0.25, L + 0.38, D / 2 - 0.015).rotateY(0), bx(0.42, 0.03, 0.04, DK, 0.25, L + 0.52, D / 2)); // a little window above the ramp side
  // pitched roof: two sloped boards meeting at a ridge, and two gable triangles
  const rw = 0.58, ang = 0.62;
  for (const s of [-1, 1]) g.add(bx(rw, 0.04, D + 0.16, CLAY, s * 0.27, L + 0.74, 0, 0, -s * ang));
  g.add(bx(0.07, 0.05, D + 0.18, CLAY_D, 0, L + 0.91, 0));
  for (const s of [-1, 1]) g.add(gable(0.5, 0.36, 0xe3c79a, 0, L + 0.54, s * (D / 2 - 0.02), s < 0 ? Math.PI : 0)); // front and back gable triangles
  // ramp: a long board with cleats, down from the pop-hole to the ground
  const rx = -0.2;
  const dz = 0.75, drop = L + 0.05, ramp = Math.hypot(dz, drop), tilt = Math.atan2(drop, dz);
  g.add(bx(0.26, 0.03, ramp, MID, rx, L + 0.07 - drop / 2, D / 2 + 0.03 + dz / 2, 0, 0, tilt));
  for (let k = 1; k < 5; k++) { const t = k / 5; g.add(bx(0.26, 0.02, 0.03, DK, rx, L + 0.09 - t * drop, D / 2 + 0.03 + t * dz, 0, 0, tilt)); } // cleats
  g.add(bx(0.34, 0.26, 0.28, MID, W / 2 + 0.17, L + 0.3, 0.05), bx(0.4, 0.04, 0.34, CLAY, W / 2 + 0.17, L + 0.46, 0.05, 0, 0.0)); // nest box on the side with a lid
  g.add(bx(0.3, 0.02, 0.2, STRAW, W / 2 + 0.17, L + 0.18, 0.05));
  return [{ x: 0, z: 0, hw: W / 2 + 0.05, hd: D / 2 + 0.05, rot: 0 }];
}
export const buildChickenCoop = () => wrap(coopInner);

// A washing line from x = 0 to x = length: forked poles at the ends (and every 5 m or so in between),
// a rope that sags a little, and cloths and pegs repeating along it. Cloths hang clear above a child's head.
function clotheslineInner(g, length) {
  const rnd = rngOf(23), top = 1.75, cols = [];
  const posts = Math.max(2, Math.ceil(length / 5) + 1);
  for (let i = 0; i < posts; i++) {
    const x = (i / (posts - 1)) * length;
    g.add(cy(0.03, 0.045, top + 0.1, DK, x, (top + 0.1) / 2, 0, 5), sk([x, top, 0], [x - 0.07, top + 0.2, 0.02], 0.02, DK, 4), sk([x, top, 0], [x + 0.07, top + 0.2, -0.02], 0.02, DK, 4));
    cols.push({ x, z: 0, r: 0.07 });
  }
  const sagAt = (x) => { const span = length / (posts - 1), t = ((x % span) / span); return 4 * 0.05 * t * (1 - t) * (span / 5 + 0.4); };
  const segs = Math.max(2, Math.round(length / 0.5));
  for (let i = 0; i < segs; i++) { const x0 = (i / segs) * length, x1 = ((i + 1) / segs) * length; g.add(sk([x0, top + 0.12 - sagAt(x0 + 1e-6), 0], [x1, top + 0.12 - sagAt(x1 - 1e-6), 0], 0.008, ROPE, 3)); }
  const cloths = [0xf2785a, 0x4f7fc9, 0xfaf3e2, 0xf2b63b, 0x5fa8a0, 0xf08fa8];
  const n = Math.floor((length - 0.4) / 0.62);
  for (let i = 0; i < n; i++) {
    const x = 0.35 + (i + 0.5) * ((length - 0.7) / Math.max(1, n)), w = 0.36 + rnd() * 0.16, h = 0.42 + rnd() * 0.25, y = top + 0.12 - sagAt(x);
    if (i % 4 === 3) { // a little shirt: body and two short sleeves
      const c = pick(rnd, cloths);
      g.add(bx(w * 0.7, h, 0.015, c, x, y - h / 2 - 0.02, 0, 0.1), bx(w * 0.35, 0.1, 0.015, c, x - w * 0.4, y - 0.1, 0, 0.1, 0.5), bx(w * 0.35, 0.1, 0.015, c, x + w * 0.4, y - 0.1, 0, 0.1, -0.5));
    } else g.add(bx(w, h, 0.015, pick(rnd, cloths), x, y - h / 2 - 0.02, 0, (rnd() - 0.5) * 0.25));
    for (const s of [-1, 1]) g.add(bx(0.025, 0.07, 0.03, DK, x + s * w * 0.32, y - 0.01, 0));
  }
  return cols;
}
export const buildClothesline = (length = 4) => wrap(clotheslineInner, length);

// =============================================================================================
// READY-MADE YARDS
// =============================================================================================
// Each variant lists [builder, x, z, turn]. The door is at the origin facing +z; the strip |x| < 0.6 is left empty
// all the way out so people can walk straight from the door. Positions get a small seeded nudge; the seed also
// decides whether the yard is mirrored left to right.
const PROPS = {
  pots: (g, v) => pottedPlantsInner(g, v), bench: benchInner, stool: stoolInner, table: tableChairsInner, arch: flowerArchInner,
  wood: firewoodInner, jars: (g, n) => waterJarsInner(g, n), bike: bicycleInner, cart: handcartInner, coop: coopInner, line: (g, l) => clotheslineInner(g, l),
};
const YARDS = [
  // 0: tea corner, a table under the eave side, flowers by the door, jars on the other side, an arch at the far end
  [['table', -1.95, 1.7, 0.2], ['pots', -1.3, 0.45, 0, 0], ['pots', 1.3, 0.45, 0, 3], ['bench', 1.95, 0.6, 0], ['jars', 2.5, 1.7, -0.3, 3], ['stool', 1.4, 1.6, 0.5], ['arch', 0, 3.3, 0]],
  // 1: working yard, firewood, a handcart, a coop, herbs and a stool
  [['wood', -2.3, 0.7, 0], ['cart', 1.9, 1.6, 0.4], ['coop', -2.5, 2.5, 0.3], ['pots', 1.35, 0.4, 0, 1], ['stool', -1.05, 0.95, 0.4], ['bike', 3.0, 1.2, Math.PI / 2], ['jars', -1.5, 2.5, 0.5, 2]],
  // 2: washing day, two lines of washing, a palm, a bench, jars and a coop
  [['line', 0.95, 3.0, 0, 2.2], ['line', -3.15, 3.0, 0, 2.2], ['jars', -2.0, 0.8, 0.2, 3], ['bench', 2.05, 0.6, 0], ['pots', -1.3, 0.45, 0, 2], ['pots', 1.3, 0.45, 0, 0], ['coop', 2.4, 1.3, -0.4], ['stool', -1.9, 1.8, 0.3]],
  // 3: garden, an arch, flowers in every corner, a table and a bicycle
  [['arch', 0, 3.0, 0], ['pots', -1.35, 0.45, 0, 3], ['pots', 1.35, 0.45, 0, 0], ['pots', -2.2, 0.8, 0, 1], ['table', 2.1, 1.9, -0.3], ['bike', -3.0, 2.2, Math.PI / 2 - 0.2], ['pots', -1.9, 2.8, 0, 2], ['stool', 1.1, 2.6, 0]],
  // 4: quiet front, a bench and a stool by the wall, firewood, a palm, jars
  [['bench', -1.95, 0.6, 0], ['stool', -1.15, 1.5, 0.3], ['wood', 2.35, 0.8, 0], ['jars', 1.5, 0.5, 0.2, 2], ['pots', -2.9, 1.8, 0, 3], ['pots', 2.8, 2.0, 0, 2], ['bike', 1.9, 2.3, 0.3]],
  // 5: carter's house, a cart, a bicycle, herbs, firewood and a washing line
  [['cart', -2.1, 1.0, -0.4], ['bike', 2.3, 1.2, -0.1], ['pots', 1.3, 0.45, 0, 1], ['pots', -1.3, 0.45, 0, 0], ['wood', 2.3, 2.4, Math.PI], ['line', -3.3, 3.5, 0, 2.4], ['stool', -2.8, 0.5, 0.2]],
];
// Moves a collider from a prop's own space into the yard: turned by `ry`, then moved by (px, pz).
function toYard(c, px, pz, ry) {
  const co = Math.cos(ry), si = Math.sin(ry), x = px + c.x * co + c.z * si, z = pz - c.x * si + c.z * co;
  return c.r !== undefined ? { x, z, r: c.r } : { x, z, hw: c.hw, hd: c.hd, rot: c.rot + ry };
}
export function buildYard(variant = 0, seed = 1) {
  const root = new THREE.Group(), rnd = rngOf(seed * 31 + variant * 7 + 3), colliders = [];
  const mirror = rnd() < 0.5, layout = YARDS[((variant % YARDS.length) + YARDS.length) % YARDS.length];
  for (const [key, x, z, turn, arg] of layout) {
    let px = x + (rnd() - 0.5) * 0.16, pz = z + (rnd() - 0.5) * 0.16, ry = turn + (rnd() - 0.5) * 0.12;
    if (mirror) { px = -px; ry = -ry; } // flipped left to right: the props are moved and turned, not mirrored
    const sub = new THREE.Group();
    sub.position.set(px, 0, pz); sub.rotation.y = ry; root.add(sub);
    for (const c of PROPS[key](sub, arg) || []) colliders.push(toYard(c, px, pz, ry));
  }
  mergeStatic(root);
  return { group: root, colliders };
}

// =============================================================================================
// BOUNDARIES
// =============================================================================================

// A lumpy green hedge from x = 0 to x = length: a row of big low lumps with a row of smaller ones on top, all different
// sizes, with a few small flowers dotted over it. Lumps repeat along the length so any length works.
function hedgeInner(g, length, height) {
  const rnd = rngOf(Math.round(length * 10) + 77);
  const lump = (x, y, rx, ry, rz, c) => g.add(bl(1, c, x, y, 0, rx, ry, rz).translateZ((rnd() - 0.5) * 0.08));
  const lumps = [];
  const nb = Math.max(2, Math.round(length / 0.62));
  for (let i = 0; i <= nb; i++) { // base row: low, wide lumps that all but touch the ground
    const x = (i / nb) * length, ry = height * (0.4 + rnd() * 0.12), L = { x, y: ry * 0.95, rx: 0.42 + rnd() * 0.16, ry, rz: 0.38 + rnd() * 0.08 };
    lumps.push(L); lump(L.x, L.y, L.rx, L.ry, L.rz, rnd() < 0.6 ? LEAF_D : LEAF);
  }
  const nt = Math.max(1, Math.round(length / 0.58));
  for (let i = 0; i < nt; i++) { // top row: between the base lumps, each a different height so the top ripples
    const x = ((i + 0.5) / nt) * length, ry = height * (0.28 + rnd() * 0.1), top = height * (0.88 + rnd() * 0.16);
    const L = { x, y: top - ry, rx: 0.36 + rnd() * 0.14, ry, rz: 0.32 + rnd() * 0.08 };
    lumps.push(L); lump(L.x, L.y, L.rx, L.ry, L.rz, rnd() < 0.5 ? LEAF : LEAF_L);
  }
  const nf = Math.round(length * 2), cols = [CREAM, PINK, YEL, CREAM];
  for (let k = 0; k < nf; k++) { // flowers on the front and back faces
    const L = lumps[Math.floor(rnd() * lumps.length)], a = (rnd() - 0.5) * 1.6, side = rnd() < 0.5 ? 1 : -1, up = 0.1 + rnd() * 0.8;
    g.add(oc(0.06, cols[k % 4], L.x + Math.sin(a) * L.rx, L.y + L.ry * up * 0.8, side * L.rz * Math.cos(a) * Math.sqrt(1 - up * up) * 1.05));
  }
  return [{ x: length / 2, z: 0, hw: length / 2, hd: 0.34, rot: 0 }];
}
export const buildHedge = (length = 4, height = 0.9) => wrap(hedgeInner, length, height);

// A low dry-stone wall from x = 0 to x = length, 0.38 m thick: irregular stones in staggered courses over a dark core.
function stoneWallInner(g, length, height) {
  const rnd = rngOf(Math.round(length * 10) + 5), thick = 0.4;
  g.add(bx(length - 0.04, height - 0.03, thick - 0.12, 0x8f857c, length / 2, (height - 0.03) / 2, 0)); // the dark core you see in the gaps
  dryStone(g, length, height, thick, 0, rnd, { ch: 0.2, min: 0.32, max: 0.56, jit: 0.11, recess: 0.03, flushTop: false });
  const n = Math.floor(length / 2.5); // moss tufts here and there along the top
  for (let i = 0; i < n; i++) g.add(bl(0.09, LEAF_D, (i + 0.5) * (length / n), height - 0.02, (rnd() - 0.5) * 0.2, 1.4, 0.5, 1));
  return [{ x: length / 2, z: 0, hw: length / 2, hd: thick / 2, rot: 0 }];
}
export const buildStoneWall = (length = 4, height = 0.6) => wrap(stoneWallInner, length, height);

// A dry-stone retaining wall from x = 0 to x = length with its front face at z = 0, going back (towards -z) 0.55 m, its top
// flush with y = height. A few tufts and flowers grow from the cracks and a vine trails from the top.
function retainingWallInner(g, length, height) {
  const rnd = rngOf(Math.round(length * 10) + Math.round(height * 100) + 9), thick = 0.55;
  g.add(bx(length - 0.04, height - 0.01, thick - 0.12, 0x95826a, length / 2, (height - 0.01) / 2, -thick / 2 - 0.02)); // earth and rubble behind the face
  dryStone(g, length, height, thick, -thick / 2, rnd, { ch: 0.3, min: 0.5, max: 0.85, jit: 0.09, recess: 0.04, flushTop: true });
  const n = Math.max(1, Math.round(length / 1.7));
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.3 + rnd() * 0.4) / n) * length, y = 0.2 + rnd() * (height - 0.45);
    tuft(g, x, y, 0.0, 0, 0.6, rnd, pick(rnd, [PINK, YEL, CREAM, VIOLET]));
    if (i % 2 === 0) { // a trailing vine hanging from the top edge
      const vx = ((i + 0.65) / n) * length;
      for (let k = 0; k < 3; k++) g.add(oc(0.07, GREENS[(i + k) % 3], vx + (k % 2 - 0.5) * 0.05, height - 0.07 - k * 0.2, 0.02, 1.2, 1, 0.9));
    }
  }
  return [{ x: length / 2, z: -thick / 2, hw: length / 2, hd: thick / 2, rot: 0 }];
}
export const buildRetainingWall = (length = 4, height = 1.2) => wrap(retainingWallInner, length, height);

// A flight of stone steps, `width` wide, climbing `rise` over `run` along +z from z = 0, centred on x = 0, with a low stone wall
// down each side. Each step is a solid block from the ground up, so there is nothing hollow underneath.
function stepsInner(g, width, rise, run) {
  const rnd = rngOf(Math.round(width * 10 + rise * 100 + run * 7) + 3);
  const n = Math.max(2, Math.round(rise / 0.18)), r = rise / n, t = run / n;
  for (let i = 0; i < n; i++) {
    const h = (i + 1) * r, z = i * t + t / 2;
    g.add(mk(stoneGeo(width, h, t + 0.03, rnd, 0.08, true, true), pick(rnd, STONES), 0, h / 2, z + 0.015));
  }
  // a side wall each side: one long wedge whose top slopes up with the stairs, 0.28 m thick
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(run, 0); sh.lineTo(run, rise + 0.3); sh.lineTo(0, r + 0.3); sh.closePath();
    const wg = new THREE.ExtrudeGeometry(sh, { depth: 0.28, bevelEnabled: false });
    wg.rotateY(-Math.PI / 2); wg.translate(0.14, 0, 0); // shape x -> world z, extrusion -> world x, centred
    g.add(mk(wg, pick(rnd, STONES), s * (width / 2 + 0.12), 0, 0));
  }
  const len = run, cols = [];
  for (const s of [-1, 1]) cols.push({ x: s * (width / 2 + 0.12), z: len / 2, hw: 0.14, hd: len / 2, rot: 0 });
  // the walking surface: a sloped strip through the middle of the first and last treads
  const platforms = [{ shape: 'strip', a: { x: 0, z: t / 2 }, b: { x: 0, z: run - t / 2 }, width, y0: r, y1: rise }];
  return { cols, platforms };
}
export function buildStoneSteps(width = 1.4, rise = 1.0, run = 2.4) {
  const root = new THREE.Group(), { cols, platforms } = stepsInner(root, width, rise, run);
  mergeStatic(root);
  return { group: root, colliders: cols, platforms };
}

// A simple open bamboo gate in a gap centred on x = 0. Two thick posts stand just outside the opening (`width` is the clear
// gap between them); the gate leaf is swung open about 75 degrees into the yard (+z), hinged on the +x post.
function gateInner(g, width) {
  const px = width / 2 + 0.07;
  for (const s of [-1, 1]) g.add(cy(0.06, 0.07, 1.25, BAMBOO_D, s * px, 0.62, 0, 6), cn(0.065, 0.1, BAMBOO_D, s * px, 1.3, 0, 6), bx(0.2, 0.06, 0.2, 0x9d928c, s * px, 0.03, 0));
  const op = 1.3, L = width - 0.04, theta = Math.atan2(-Math.sin(op), -Math.cos(op));
  const leaf = new THREE.Group(); leaf.position.set(px - 0.07, 0, 0.0); leaf.rotation.y = theta; g.add(leaf); // the leaf's own +x runs from the hinge across the gap
  leaf.add(at(cy(0.03, 0.03, L, BAMBOO, L / 2, 0.28, 0, 5, true), 0, 0, Math.PI / 2), at(cy(0.03, 0.03, L, BAMBOO, L / 2, 0.88, 0, 5, true), 0, 0, Math.PI / 2));
  const slats = Math.max(3, Math.round(L / 0.14));
  for (let i = 0; i <= slats; i++) { const x = 0.03 + (i / slats) * (L - 0.06), h = 0.95 + 0.08 * Math.sin(i * 2.1); leaf.add(cy(0.02, 0.025, h, BAMBOO, x, 0.1 + h / 2 - 0.1, 0.045, 5, true)); }
  leaf.add(sk([0.04, 0.28, 0.02], [L - 0.04, 0.88, 0.02], 0.022, BAMBOO_D, 4)); // diagonal brace
  const hx = px - 0.07;
  return [{ x: -px, z: 0, r: 0.08 }, { x: px, z: 0, r: 0.08 }, { x: hx + Math.cos(theta) * L / 2, z: -Math.sin(theta) * L / 2, hw: L / 2, hd: 0.05, rot: theta }];
}
export const buildGate = (width = 1.2) => wrap(gateInner, width);

// A low bamboo fence from x = 0 to x = length: upright canes of different heights lashed to rails, with thicker posts about
// every 1.6 m. Canes repeat, so any length works.
function fenceInner(g, length) {
  const rnd = rngOf(Math.round(length * 10) + 13);
  const n = Math.max(2, Math.round(length / 0.14));
  for (let i = 0; i < n; i++) { const x = ((i + 0.5) / n) * length, h = 0.82 + 0.1 * Math.sin(i * 1.7) + rnd() * 0.06; g.add(cy(0.02, 0.03, h, i % 3 ? BAMBOO : BAMBOO_D, x, h / 2, (rnd() - 0.5) * 0.02, 5, true)); }
  for (const y of [0.25, 0.58]) for (const z of [-0.05, 0.05]) g.add(at(cy(0.022, 0.022, length, BAMBOO_D, length / 2, y, z, 5, true), 0, 0, Math.PI / 2));
  const posts = Math.max(2, Math.ceil(length / 1.6) + 1);
  for (let i = 0; i < posts; i++) { const x = 0.04 + (i / (posts - 1)) * (length - 0.08); g.add(cy(0.045, 0.055, 1.0, 0xb08a4a, x, 0.5, 0, 6, true), cn(0.05, 0.09, 0xb08a4a, x, 1.04, 0, 6)); }
  return [{ x: length / 2, z: 0, hw: length / 2, hd: 0.1, rot: 0 }];
}
export const buildFenceSection = (length = 3) => wrap(fenceInner, length);

// ---- Preview wrappers: the stage calls a builder with no arguments, and boundaries run from x = 0, so these slide them to the middle ----
const centred = (m, len) => { m.group.position.x = -len / 2; return m; };
export const buildPottedPlants0 = () => buildPottedPlants(0);
export const buildPottedPlants1 = () => buildPottedPlants(1);
export const buildPottedPlants2 = () => buildPottedPlants(2);
export const buildPottedPlants3 = () => buildPottedPlants(3);
export const buildWaterJars2 = () => buildWaterJars(2);
export const buildClothesline4 = () => centred(buildClothesline(4), 4);
export const buildYard0 = () => buildYard(0, 1);
export const buildYard1 = () => buildYard(1, 2);
export const buildYard2 = () => buildYard(2, 7);
export const buildYard3 = () => buildYard(3, 4);
export const buildYard4 = () => buildYard(4, 5);
export const buildYard5 = () => buildYard(5, 3);
export const buildHedge1 = () => centred(buildHedge(1), 1);
export const buildHedge8 = () => centred(buildHedge(8), 8);
export const buildHedge30 = () => centred(buildHedge(30), 30);
export const buildStoneWall1 = () => centred(buildStoneWall(1), 1);
export const buildStoneWall8 = () => centred(buildStoneWall(8), 8);
export const buildRetainingWall1 = () => centred(buildRetainingWall(1, 1.2), 1);
export const buildRetainingWall8 = () => centred(buildRetainingWall(8, 1.4), 8);
export const buildRetainingWall30 = () => centred(buildRetainingWall(30, 1.8), 30);
export const buildGate2 = () => buildGate(1.6);
export const buildStoneSteps1 = () => buildStoneSteps(1.4, 1.0, 2.4);
export const buildFenceSection8 = () => centred(buildFenceSection(8), 8);
// Everything laid out in a row for a quick overall look.
export function buildYardKit() {
  const root = new THREE.Group(), items = [buildBench, buildStool, buildTableAndChairs, buildFlowerArch, buildFirewoodStack, buildWaterJars, buildBicycle, buildHandcart, buildChickenCoop, buildPottedPlants0, buildPottedPlants1, buildPottedPlants2, buildPottedPlants3];
  items.forEach((f, i) => { const m = f(); m.group.position.set((i % 5) * 2.2 - 4.4, 0, Math.floor(i / 5) * 2.4 - 2.4); root.add(m.group); });
  return { group: root, colliders: [] };
}
