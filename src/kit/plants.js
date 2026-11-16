// Plant models for the locals' land (src/world/flora.js grows them): low-poly trees, bushes, bamboo,
// palms, banana plants, ferns, logs, flowers and grass tufts. Each builder returns one BufferGeometry
// (non-indexed; position, normal, colour) so it can be drawn as an InstancedMesh: the colours are
// baked into the vertices and the instance colour only tints them (keep it near white).
// Triangle counts are kept small on purpose (most are 30 to 170): there are thousands of these.
// Preview: kit.html?kit=plants&fn=buildPlantRow&dist=16&h=4&look=2
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = new THREE.Color(), D = new THREE.Color();
// Repeatable pseudo-random numbers, so a model is the same every time it is built.
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// Gives a geometry one flat colour (or a bottom-to-top blend from `hex` to `top`) and the shared attribute set.
function paint(geo, hex, top = null) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
  let y0 = Infinity, y1 = -Infinity;
  if (top !== null) for (let i = 0; i < n; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
  C.setHex(hex); if (top !== null) D.setHex(top);
  for (let i = 0; i < n; i++) {
    const c = top === null ? C : C.clone().lerp(D, (p.getY(i) - y0) / Math.max(1e-6, y1 - y0));
    a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
// Two-tone faceting for foliage lumps (the look of The Trail's bushes): every triangle of a non-indexed geometry
// is multiplied (in its colour attribute, made white if missing) by a warm tone where it faces up and a cooler,
// darker blue-green one where it faces down or out, plus a little darker toward the bottom and a small per-face
// jitter. Baked once into the vertices: no per-frame cost, no extra draw calls. `seed` varies the jitter.
const LIT = [1.1, 1.08, 0.88], SHADE = [0.5, 0.66, 0.8];
export function facetShade(geo, seed = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = p.count;
  let col = g.attributes.color;
  if (!col) { col = new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3); g.setAttribute('color', col); }
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < n; f += 3) {
    a.fromBufferAttribute(p, f); b.fromBufferAttribute(p, f + 1); c.fromBufferAttribute(p, f + 2);
    const ny = b.clone().sub(a).cross(c.clone().sub(a)).normalize().y;
    const up = Math.min(1, Math.max(0, (ny + 0.15) / 0.85)), t = up * up * (3 - 2 * up);
    const h = (((a.y + b.y + c.y) / 3 - y0) / Math.max(1e-6, y1 - y0)), jit = 1 + (Math.sin((a.x + b.z * 1.7 + c.y) * 91.7 + seed * 12.3) * 0.5) * 0.12;
    const low = 0.84 + 0.16 * h;
    for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) col.setComponent(f + v, k, col.getComponent(f + v, k) * (SHADE[k] + (LIT[k] - SHADE[k]) * t) * low * jit);
  }
  return g;
}
// A tapered stick (open-ended, no caps) from one point to another.
function stick(x0, y0, z0, x1, y1, z1, r0, r1, hex, seg = 5) {
  const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(x0, y0, z0);
  return paint(g, hex);
}
// A squashed faceted lump of leaves (20 triangles).
function pad(x, y, z, sx, sy, sz, hex, rot = 0) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  g.rotateY(rot); g.scale(sx, sy, sz); g.translate(x, y, z);
  return facetShade(paint(g, hex), x * 3 + z * 7 + y);
}
// A small diamond (8 triangles): fruit, coconuts, flower heads.
function bead(x, y, z, r, hex, sy = 1) {
  const g = new THREE.OctahedronGeometry(r, 0);
  g.scale(1, sy, 1); g.translate(x, y, z);
  return paint(g, hex);
}
// One curved ribbon growing outward at angle `a`: a grass blade, a frond, a banana or palm leaf.
// `shape` 'blade' keeps its width and ends blunt; 'frond' swells in the middle and ends in a point.
// With `fall` given it arches instead: straight out `len` metres, rising `lift` and dropping `fall` (times len).
function ribbon({ a, len, width, droop = 0, rows = 3, r0 = 0, y0 = 0, rise = 1, shape = 'blade', base, tip, ox = 0, oz = 0, lift = 0, fall = null }) {
  const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, pts = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const out = fall === null ? r0 + droop * len * t * t + len * (1 - rise) * t : r0 + len * t * (1 - 0.15 * t);
    const y = fall === null ? y0 + len * rise * (t - 0.22 * droop * t * t) : y0 + len * (lift * t - fall * t * t);
    const w = width * (shape === 'frond' ? Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * t)), 0.7) + 0.04 : Math.max(0.3, Math.pow(1 - Math.pow(t, 2.6), 0.6)));
    pts.push([ox + dx * out - px * w, y, oz + dz * out - pz * w, ox + dx * out + px * w, y, oz + dz * out + pz * w, t]);
  }
  const pos = [], col = [], cb = new THREE.Color(base), ct = new THREE.Color(tip), c = new THREE.Color();
  for (let i = 0; i < rows; i++) {
    const p = pts[i], q = pts[i + 1];
    for (const [v, k] of [[p, 0], [p, 3], [q, 0], [p, 3], [q, 3], [q, 0]]) { pos.push(v[k], v[k + 1], v[k + 2]); c.copy(cb).lerp(ct, v[6]); col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const merge = (parts) => { const g = mergeGeometries(parts); g.computeBoundingSphere(); return g; };

const BARK = 0x7c6b5c, BARK_DARK = 0x6a5a4c, BARK_PALE = 0x9a8670;

// ---- Trees ------------------------------------------------------------------------------------
// A broad forest tree: a leaning trunk forking into two limbs under a crown of five pads (about 130 triangles, 7 m).
export function broadleafTree() {
  return merge([
    stick(0, -0.3, 0, 0.15, 3.5, 0.05, 0.34, 0.21, BARK, 6),
    stick(0.12, 2.5, 0, -1.4, 3.7, 0.4, 0.14, 0.07, BARK), stick(0.12, 2.8, 0, 1.4, 4.0, -0.45, 0.14, 0.07, BARK),
    pad(-1.6, 3.9, 0.45, 1.6, 0.85, 1.4, 0x4c7a40, 0.3), pad(1.55, 4.2, -0.45, 1.65, 0.88, 1.4, 0x507f43, 1.1),
    pad(0.25, 4.2, 1.5, 1.35, 0.72, 1.2, 0x4a773e, 2.1), pad(-0.2, 4.4, -1.5, 1.35, 0.72, 1.2, 0x557f45, 0.8),
    pad(0.15, 5.2, 0.05, 2.0, 1.0, 1.8, 0x5f8c4a, 0.2),
  ]);
}
// A tall slim tree that stands above the canopy (about 100 triangles, 9.5 m): gives the forest a ragged skyline.
export function tallTree() {
  return merge([
    stick(0, -0.3, 0, -0.1, 7.6, 0.1, 0.3, 0.16, BARK_PALE, 6), stick(-0.05, 6.0, 0.05, 0.9, 7.2, -0.2, 0.09, 0.05, BARK_PALE),
    pad(0.9, 7.35, -0.2, 1.05, 0.55, 0.95, 0x47753d, 0.4), pad(-0.6, 7.9, 0.35, 1.2, 0.6, 1.05, 0x4f7c41, 1.3),
    pad(-0.05, 8.75, 0, 1.4, 0.72, 1.25, 0x5a8747, 2.2), pad(0.2, 9.55, -0.1, 0.9, 0.5, 0.85, 0x638f4d, 0.7),
  ]);
}
// A small understorey tree (about 70 triangles, 3.6 m).
export function smallTree() {
  return merge([
    stick(0, -0.2, 0, 0.1, 2.4, 0, 0.16, 0.1, BARK), stick(0.08, 1.7, 0, -0.75, 2.5, 0.25, 0.07, 0.04, BARK),
    pad(-0.8, 2.75, 0.25, 0.85, 0.48, 0.78, 0x5a8a48, 0.5), pad(0.25, 3.05, -0.1, 1.15, 0.6, 1.0, 0x669652, 1.4), pad(0.55, 2.6, 0.55, 0.7, 0.4, 0.65, 0x5f8f4c, 2.6),
  ]);
}
// A fruit tree by a house (a mango or rambutan): a low fork, a dark round crown, fruit showing.
export function fruitTree() {
  const r = rnd(41), fruit = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.5, rr = 1.25 + r() * 0.35;
    fruit.push(bead(Math.cos(a) * rr, 2.15 + r() * 0.9, Math.sin(a) * rr, 0.13, i % 3 === 0 ? 0xf2c13c : 0xe9853a, 1.3));
  }
  return merge([
    stick(0, -0.2, 0, 0.05, 1.3, 0, 0.22, 0.17, BARK_DARK), stick(0.05, 1.2, 0, -0.7, 2.3, 0.2, 0.11, 0.07, BARK_DARK), stick(0.05, 1.2, 0, 0.75, 2.4, -0.15, 0.11, 0.07, BARK_DARK),
    pad(-0.7, 2.6, 0.2, 1.15, 0.85, 1.05, 0x3f6e36, 0.4), pad(0.75, 2.75, -0.15, 1.15, 0.85, 1.05, 0x447439, 1.5), pad(0, 3.35, 0, 1.3, 0.85, 1.2, 0x4d7d40, 2.4),
    ...fruit,
  ]);
}
// A coconut palm: a slim trunk curving up to 7 m, a crown of nine drooping fronds and a few coconuts.
export function coconutPalm() {
  const top = [1.15, 6.9, 0], parts = [
    stick(0, -0.3, 0, 0.15, 2.4, 0, 0.24, 0.2, 0x8f7c66), stick(0.15, 2.4, 0, 0.55, 4.8, 0, 0.2, 0.17, 0x95816a), stick(0.55, 4.8, 0, top[0], top[1], 0, 0.17, 0.14, 0x9b876f),
  ];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.2;
    parts.push(ribbon({ a, len: 2.6 + (i % 3) * 0.3, width: 0.5, lift: 0.55 - (i % 2) * 0.25, fall: 0.95, rows: 3, r0: 0.1, y0: top[1], shape: 'frond', base: 0x5f8f3e, tip: 0x89b456, ox: top[0], oz: top[2] }));
  }
  for (const [x, z] of [[0.18, 0], [-0.1, 0.16], [-0.08, -0.17]]) parts.push(bead(top[0] + x, top[1] - 0.25, z, 0.16, 0x7d8a3a));
  return merge(parts);
}
// A banana plant: two soft stems and seven broad leaves arching out, one green bunch.
export function bananaPlant() {
  const parts = [stick(0, -0.1, 0, 0.05, 1.5, 0, 0.13, 0.1, 0x7a9a4c), stick(0.35, -0.1, 0.2, 0.4, 1.05, 0.22, 0.1, 0.08, 0x86a453)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, hi = i < 4;
    parts.push(ribbon({ a, len: hi ? 1.6 : 1.25, width: 0.34, lift: 0.9, fall: 0.85, rows: 3, r0: 0.05, y0: hi ? 1.45 : 1.0, shape: 'frond', base: 0x6f9f45, tip: 0x9cc862, ox: hi ? 0.05 : 0.4, oz: hi ? 0 : 0.22 }));
  }
  parts.push(bead(0.18, 1.25, 0.05, 0.16, 0x9cad48, 1.6));
  return merge(parts);
}
// A clump of bamboo: eight canes leaning out from one root, with sprays of narrow leaves (about 150 triangles, 6.5 m).
export function bambooClump() {
  const r = rnd(7), parts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.6, lean = 0.12 + r() * 0.16, h = 4.6 + r() * 2.2, bx = Math.cos(a) * 0.3, bz = Math.sin(a) * 0.3;
    const tx = bx + Math.cos(a) * h * lean, tz = bz + Math.sin(a) * h * lean;
    parts.push(stick(bx, -0.2, bz, tx, h, tz, 0.07, 0.05, i % 3 ? 0x9db35a : 0x8aa64e, 4));
    for (let k = 0; k < 3; k++) {
      const f = 0.62 + k * 0.17;
      parts.push(ribbon({ a: a + (k - 1) * 0.9, len: 1.0, width: 0.2, lift: 0.3, fall: 0.75, rows: 2, y0: h * f, shape: 'frond', base: 0x6f9a45, tip: 0x93bb5c, ox: bx + (tx - bx) * f, oz: bz + (tz - bz) * f }));
    }
  }
  return merge(parts);
}

// ---- Bushes and small plants ------------------------------------------------------------------
// A rounded leafy bush (60 triangles, about 1 m tall).
export function roundBush() {
  return merge([pad(0, 0.45, 0, 0.7, 0.55, 0.65, 0x5b8f48), pad(0.5, 0.33, 0.15, 0.48, 0.4, 0.46, 0x548744, 1), pad(-0.45, 0.36, -0.12, 0.5, 0.42, 0.48, 0x62964d, 2)]);
}
// A flowering shrub: a bush dotted with flowers. `pink` is bougainvillea, otherwise hibiscus (red and orange).
export function flowerShrub(pink = true) {
  const r = rnd(pink ? 3 : 5), cols = pink ? [0xe3559b, 0xf07dbb, 0xd94489] : [0xe8483a, 0xf59a3a, 0xf06b45], parts = [
    pad(0, 0.55, 0, 0.75, 0.62, 0.7, 0x4f8440), pad(0.55, 0.4, 0.2, 0.52, 0.45, 0.5, 0x568a45, 1), pad(-0.5, 0.42, -0.15, 0.55, 0.46, 0.5, 0x4b7f3e, 2),
  ];
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, up = r(), rr = 0.55 + r() * 0.3;
    parts.push(bead(Math.cos(a) * rr * (1 - up * 0.45), 0.5 + up * 0.62, Math.sin(a) * rr * (1 - up * 0.45), 0.17, cols[i % 3], 0.75));
  }
  return merge(parts);
}
// A fern: six arching fronds (36 triangles).
export function fern() {
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(ribbon({ a: (i / 6) * Math.PI * 2 + (i % 2) * 0.4, len: 0.95 + (i % 3) * 0.12, width: 0.14, droop: 1.45, rows: 3, r0: 0.04, shape: 'frond', base: 0x3f7a38, tip: 0x78ad52 }));
  return merge(parts);
}
// A fallen log, mossy on top, with a broken stub of a branch (about 40 triangles, 2.4 m long).
export function fallenLog() {
  const g = new THREE.CylinderGeometry(0.24, 0.28, 2.4, 6, 1, false); g.rotateZ(Math.PI / 2); g.translate(0, 0.2, 0);
  const moss = new THREE.IcosahedronGeometry(1, 0); moss.scale(0.7, 0.1, 0.22); moss.translate(-0.2, 0.44, 0);
  return merge([paint(g, 0x7a5f45), paint(moss, 0x6f9446), stick(0.5, 0.3, 0.1, 0.75, 0.75, 0.35, 0.07, 0.05, 0x6f5640, 4)]);
}
// A patch of wild flowers: seven stems with heads in mixed colours (42 triangles).
export function flowerPatch() {
  const r = rnd(19), parts = [], heads = [0xffffff, 0xffd75a, 0xf2a0c4, 0xe8603a, 0xc4a6ec, 0xfff1a8];
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, rr = 0.1 + r() * 0.35, x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = 0.28 + r() * 0.22;
    parts.push(ribbon({ a: r() * 6.28, len: h, width: 0.018, droop: 0.15, rows: 1, ox: x, oz: z, base: 0x5f8a42, tip: 0x7da552 }));
    const g = new THREE.TetrahedronGeometry(0.1, 0); g.scale(1, 0.55, 1); g.translate(x, h, z); parts.push(paint(g, heads[i % heads.length]));
  }
  return merge(parts);
}
// A grass tuft: four soft blades (16 triangles). White, darker at the root: the instance colour sets the hue.
// Multipliers on the instance colour (linear): a darker, cooler base into lighter, warmer yellow-green tips.
const GRASS_BASE = new THREE.Color().setRGB(0.6, 0.68, 0.72, THREE.LinearSRGBColorSpace), GRASS_TIP = new THREE.Color().setRGB(1.25, 1.22, 0.88, THREE.LinearSRGBColorSpace);
export function grassTuft() {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(ribbon({ a: (i / 4) * Math.PI * 2 + (i % 2) * 0.7, len: 0.5 + (i % 3) * 0.14, width: 0.055, droop: 0.7 + (i % 2) * 0.35, rows: 2, r0: 0.03 + (i % 3) * 0.06, base: GRASS_BASE, tip: GRASS_TIP }));
  return merge(parts);
}
// A far-off stand-in for a tree or a bush: one squashed lump (20 triangles).
export function lump() {
  const g = new THREE.IcosahedronGeometry(1, 0); g.scale(1, 0.62, 1);
  return paint(g, 0xffffff);
}

// All of them in a row on the preview stage.
export function buildPlantRow() {
  const group = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide });
  const all = [broadleafTree(), tallTree(), smallTree(), fruitTree(), coconutPalm(), bananaPlant(), bambooClump(), roundBush(), flowerShrub(true), flowerShrub(false), fern(), fallenLog(), flowerPatch(), grassTuft()];
  let tris = 0;
  all.forEach((g, i) => { const m = new THREE.Mesh(g, mat); m.position.set((i - all.length / 2) * 2.6, 0, (i % 2) * 2); group.add(m); tris += g.attributes.position.count / 3; });
  group.userData.tris = tris;
  return group;
}
