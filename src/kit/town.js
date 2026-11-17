// INTERNAL. A modern Indonesian coastal town, built from code (docs/superpowers/specs/2026-11-17-modern-village-design.md):
// painted plaster houses (1 and 2 storeys), a row of ruko shophouses, a warung, a minimarket, a café, a motorbike
// workshop (bengkel), a small mosque, the village office (kantor desa) with its flagpole, a pos ronda guard post, and
// the street: road pieces with kerbs and gutters, power poles and their sagging wires, streetlights, bins, signs, a bus
// shelter, scooters, a pickup, water drums, laundry lines, and plants in pots and planters (frangipani, bougainvillea,
// banana). Low-poly and painterly: flat colour per piece with a slight tone jitter, smooth-shaded round things, baked AO.
//
// Two forms of every builder:
// - `house(m, opts)` writes into a Mesher (below) in the model's own frame and returns its meta:
//   { colliders, lamps, spots, props, stepFeet?, floor? }. Use this form when placing many things: one Mesher per
//   welded group, so a whole street is one mesh (plus one glow mesh). `props` are repeated small things (scooters,
//   chairs, drums, bins, poles) that the caller pools into InstancedMeshes with instanceProps() (one draw per kind).
// - `buildHouse(opts)` returns { group, colliders, lamps, spots, props, ... } like the hamlet and yard kits: the model
//   welded into ONE vertex-coloured mesh with baked AO, its glow, and its props instanced. For previews and one-offs.
//
// Frame: origin on the ground at the middle of the footprint, the front (door, shopfront) faces +z, metres (scout
// 1.05 m, adult 1.6 m). Everything a builder reports is in the frame m.frame() set (the model's own frame when it is
// built at that origin; pushes the caller made around it are included). footprint: { hw, hd } the plot it needs (without
// a fence or yard), for laying it out where a stilt house stood. colliders: { x, z, r } or { x, z, hw, hd, rot }, solid
// only (open shopfronts leave their way in free). lamps: window glow { x, y, z, window: true, nx, nz } (as the hamlet's
// stilt houses) or a small glowing bulb { x, y, z, r, light: false } (glow only, no light). spots: named people spots
// { x, z, rot, sit?, top? } (rot faces the way the person looks; door spots look into the house, as hamlet homes do).
// stepFeet: [{ x, z, w }] the foot of the front steps on the ground (the hamlet places a door spot 1 m out from it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeAO } from '../world/ao.js';
import { bananaPlant, facetShade } from './plants.js';

// One material for everything: vertex colours, smooth normals where the shape has them (cylinders, domes, leaves),
// crisp faces on boxes. One more for glowing bulbs, fairy lights and lamp heads (the caller shows it at night).
export const TOWN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
export const TOWN_GLOW_MAT = new THREE.MeshBasicMaterial({ color: 0xffd58a });
export const WIRE_MAT = new THREE.LineBasicMaterial({ color: 0x2a2c30 });

// ---- The Mesher: pieces in a movable frame -> one vertex-coloured mesh --------------------------------------------
// The same idea as kit/fishing.js's Mesher (kept separate here: that file belongs to the waterfront work), plus
// pt()/yaw so helpers can report colliders, lamps and spots in the model's own frame from inside a pushed frame,
// a gentle per-piece tone jitter (painted, never flat-printed), and leaf() for soft two-tone foliage.
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const hash = (i) => { let t = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); t ^= t >>> 13; t = Math.imul(t, 0xc2b2ae35); t ^= t >>> 16; return (t >>> 0) / 4294967296; };
export class Mesher {
  constructor(seed = 1) { this.list = []; this.glow = []; this.base = new THREE.Matrix4(); this.rootInv = new THREE.Matrix4(); this.stack = []; this.yaw = 0; this.n = seed * 101; }
  // The model's frame in the mesh: a spot, a heading (0 faces +z), a tilt.
  frame(x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0) {
    this.base.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')), _s.set(1, 1, 1));
    this.rootInv.copy(this.base).invert(); this.stack = []; this.yaw = 0; return this;
  }
  push(x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, sc = 1) {
    this.stack.push([this.base.clone(), this.yaw]);
    this.base.multiply(new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')), _s.set(sc, sc, sc)));
    this.yaw += yaw; return this;
  }
  pop() { const [b, y] = this.stack.pop(); this.base.copy(b); this.yaw = y; return this; }
  // A point of the current frame, in the model's own frame.
  pt(x, y, z) { const p = new THREE.Vector3(x, y, z).applyMatrix4(this.base).applyMatrix4(this.rootInv); return { x: p.x, y: p.y, z: p.z }; }
  // hex null keeps the geometry's own colours (plants.js foliage).
  add(geo, hex, local, glow = false, leafy = false) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(local ? new THREE.Matrix4().multiplyMatrices(this.base, local) : this.base);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(hex === null && k === 'color')) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (hex !== null) {
      const j = glow ? 1 : 1 + (hash(this.n++) - 0.5) * 0.07, n = g.attributes.position.count, a = new Float32Array(n * 3);
      _c.setHex(hex); for (let i = 0; i < n; i++) { a[i * 3] = _c.r * j; a[i * 3 + 1] = _c.g * j; a[i * 3 + 2] = _c.b * j; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    if (leafy) g = facetShade(g, this.n);
    (glow ? this.glow : this.list).push(g);
  }
  at(geo, hex, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, glow = false, leafy = false) {
    this.add(geo, hex, new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)), glow, leafy);
  }
  box(w, h, d, hex, x, y, z, ry = 0, rx = 0, rz = 0) { this.at(new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, ry, rz); }
  cyl(r0, r1, h, hex, x, y, z, seg = 8, rx = 0, rz = 0, ry = 0) { this.at(new THREE.CylinderGeometry(r0, r1, h, seg), hex, x, y, z, rx, ry, rz); }
  sph(r, hex, x, y, z, sx = 1, sy = 1, sz = 1, w = 8, h = 6) { this.at(new THREE.SphereGeometry(r, w, h), hex, x, y, z, 0, 0, 0, sx, sy, sz); }
  // A soft clump of leaves: lit warm on top, cool underneath (plants.js facetShade).
  leaf(r, hex, x, y, z, sx = 1, sy = 1, sz = 1) { this.at(new THREE.IcosahedronGeometry(r, 1), hex, x, y, z, 0, (x * 3.1 + z) % 6, 0, sx, sy, sz, false, true); }
  glowBall(r, x, y, z) { this.at(new THREE.IcosahedronGeometry(r, 0), 0xffffff, x, y, z, 0, 0, 0, 1, 1, 1, true); }
  glowBox(w, h, d, x, y, z, ry = 0) { this.at(new THREE.BoxGeometry(w, h, d), 0xffffff, x, y, z, 0, ry, 0, 1, 1, 1, true); }
  rod(a, b, r0, r1 = r0, hex = 0x8c6444, n = 5) {
    const pa = new THREE.Vector3(...a), pb = new THREE.Vector3(...b), len = Math.max(pa.distanceTo(pb), 1e-4);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, pb.clone().sub(pa).normalize());
    this.add(new THREE.CylinderGeometry(r1, r0, len, n, 1), hex, new THREE.Matrix4().compose(pa.add(pb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  }
  bend(pts, r, hex, n = 5) { for (let i = 0; i < pts.length - 1; i++) this.rod(pts[i], pts[i + 1], r, r, hex, n); }
  tris(list, hex, both = false) {
    const p = [];
    for (const [a, b, c] of list) { p.push(...a, ...b, ...c); if (both) p.push(...a, ...c, ...b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
    this.add(g, hex);
  }
  quad(a, b, c, d, hex, both = false) { this.tris([[a, b, c], [a, c, d]], hex, both); }
  build(material = TOWN_MAT, cast = true) {
    if (!this.list.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(this.list), material); mesh.castShadow = cast; mesh.receiveShadow = true;
    this.list = []; return mesh;
  }
  buildGlow(material = TOWN_GLOW_MAT) {
    if (!this.glow.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(this.glow), material); mesh.castShadow = false; mesh.receiveShadow = false;
    this.glow = []; return mesh;
  }
}

// ---- Palette ---------------------------------------------------------------------------------------------------
export const PAINT = { mint: 0xa6dcc2, salmon: 0xf2a68e, sky: 0x9ccbe9, cream: 0xf3e2bd, yellow: 0xf4d36a, white: 0xf1ede3, lilac: 0xc8b8e2, peach: 0xf6c59c, lime: 0xc9e08a };
export const C = {
  white: 0xf7f4ec, ink: 0x2c2d31, tile: 0xc8643f, metalBlue: 0x6f93ad, metalRed: 0xb5503f, metalGreen: 0x5f9a80, zinc: 0xaab4b7,
  glass: 0x46606e, glassLt: 0x8fb6c4, grille: 0x34393f, floor: 0xece0c9, floor2: 0xd2c1a4, concrete: 0xc9c3b6, concreteDk: 0xa29c90,
  asphalt: 0x5c5e63, zincRust: 0xb48a6a, kerbW: 0xefeee8, kerbK: 0x2f3134, wood: 0xa8754d, woodDk: 0x7a5236, steel: 0x9aa3a8, pot: 0xc0673f,
  leaf: 0x5f9f4f, leafDk: 0x3f7f45, leafLt: 0x8cc062, bark: 0x8a7e70, red: 0xd9463a, blue: 0x3a7fc0, green: 0x3f9f6a, orange: 0xf08a3a, gold: 0xe2b84a,
};
const shade = (hex, k) => { const f = (s) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * k))); return (f(16) << 16) | (f(8) << 8) | f(0); };
const rngOf = (seed) => { let a = (seed * 2654435761 + 1013904223) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const L3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];

// ---- Reporting helpers: colliders, lamps, spots and props in the model's frame -------------------------------
function colBox(m, out, x, z, hw, hd) { const p = m.pt(x, 0, z); out.push({ x: p.x, z: p.z, hw, hd, rot: m.yaw }); }
function colRound(m, out, x, z, r) { const p = m.pt(x, 0, z); out.push({ x: p.x, z: p.z, r }); }
function winLamp(m, out, x, y, z, nx = 0, nz = 1) {
  const p = m.pt(x + nx * 0.2, y, z + nz * 0.2), c = Math.cos(m.yaw), s = Math.sin(m.yaw);
  out.push({ x: p.x, y: p.y, z: p.z, window: true, nx: nx * c + nz * s, nz: -nx * s + nz * c });
}
function bulb(m, out, x, y, z, r = 0.07) { m.glowBall(r, x, y, z); const p = m.pt(x, y, z); out.push({ x: p.x, y: p.y, z: p.z, r, light: false }); }
function spot(m, x, z, rot = 0, extra = {}) { const p = m.pt(x, 0, z); return { x: p.x, z: p.z, rot: rot + m.yaw, ...extra }; }
function prop(m, out, kind, x, z, ry = 0, c = 0xffffff, extra = {}) { const p = m.pt(x, 0, z); out.push({ kind, x: p.x, y: p.y, z: p.z, ry: ry + m.yaw, c, ...extra }); }

// ---- Shared pieces -----------------------------------------------------------------------------------------------
// Quads across a slope from edge a-b (eave) to edge d-c (top), alternating two tones: 'rows' are tile courses, 'cols'
// corrugated metal.
function strips(m, a, b, c, d, c1, c2, n, mode) {
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, k = i % 2 ? c1 : c2;
    if (mode === 'rows') m.quad(L3(a, d, t0), L3(b, c, t0), L3(b, c, t1), L3(a, d, t1), k);
    else m.quad(L3(a, b, t0), L3(a, b, t1), L3(d, c, t1), L3(d, c, t0), k);
  }
}
// A hipped roof (the usual Indonesian limasan) over w x d at height y, h tall, eaves `over` out. Clay tile courses or
// corrugated metal; a soffit underneath, ridge and hip caps, white fascia boards.
function hipRoof(m, w, d, h, y, col, kind = 'tile', over = 0.5) {
  if (w < d) { m.push(0, 0, 0, Math.PI / 2); hipRoof(m, d, w, h, y, col, kind, over); m.pop(); return; }
  const W = w / 2 + over, D = d / 2 + over, r = W - D, n = kind === 'tile' ? 7 : 18, dark = shade(col, 0.86), mode = kind === 'tile' ? 'rows' : 'cols';
  const P = (x, yy, z) => [x, y + yy, z];
  const eFL = P(-W, 0, D), eFR = P(W, 0, D), eBL = P(-W, 0, -D), eBR = P(W, 0, -D), rL = P(-r, h, 0), rR = P(r, h, 0);
  strips(m, eFL, eFR, rR, rL, col, dark, n, mode); strips(m, eBR, eBL, rL, rR, col, dark, n, mode);
  strips(m, eFR, eBR, rR, rR, col, dark, kind === 'tile' ? n : 9, mode); strips(m, eBL, eFL, rL, rL, col, dark, kind === 'tile' ? n : 9, mode);
  m.quad(eFL, eBL, eBR, eFR, shade(col, 0.62));
  const cap = shade(col, 0.74);
  if (r > 0.05) m.box(2 * r + 0.14, 0.1, 0.2, cap, 0, y + h + 0.02, 0);
  for (const [e, q] of [[eFL, rL], [eFR, rR], [eBL, rL], [eBR, rR]]) m.rod(e, q, 0.045, 0.045, cap, 4);
  m.box(2 * W, 0.16, 0.05, C.white, 0, y - 0.05, D); m.box(2 * W, 0.16, 0.05, C.white, 0, y - 0.05, -D);
  m.box(0.05, 0.16, 2 * D, C.white, W, y - 0.05, 0); m.box(0.05, 0.16, 2 * D, C.white, -W, y - 0.05, 0);
}
// A single-pitch sheet from the front edge (z1, y1) back to (z0, y0), x0..x1: corrugated, with an underside.
function shedRoof(m, x0, x1, z0, y0, z1, y1, col, n = 0) {
  const a = [x0, y1, z1], b = [x1, y1, z1], c = [x1, y0, z0], d = [x0, y0, z0], k = n || Math.max(6, Math.round((x1 - x0) / 0.22));
  strips(m, a, b, c, d, col, shade(col, 0.86), k, 'cols');
  m.quad(a, d, c, b, shade(col, 0.66));
  m.rod(a, b, 0.03, 0.03, shade(col, 0.7), 4);
}
// Floor tiles: a slab with every other tile a lighter tone.
function tiles(m, x0, x1, z0, z1, y, c1 = C.floor, c2 = C.floor2, s = 0.5) {
  m.box(x1 - x0, 0.05, z1 - z0, c2, (x0 + x1) / 2, y - 0.025, (z0 + z1) / 2);
  const nx = Math.max(1, Math.round((x1 - x0) / s)), nz = Math.max(1, Math.round((z1 - z0) / s)), sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if ((i + j) % 2 === 0) {
    const xa = x0 + i * sx + 0.01, xb = xa + sx - 0.02, za = z0 + j * sz + 0.01, zb = za + sz - 0.02;
    m.quad([xa, y + 0.003, zb], [xb, y + 0.003, zb], [xb, y + 0.003, za], [xa, y + 0.003, za], c1);
  }
}
// A window flush on a wall face at (x, y) on the plane z, turned by ry: dark glass, frame, sill, centre mullion and an
// iron security grille (teralis), as nearly every Indonesian house has.
function win(m, lamps, x, y, z, ry = 0, w = 1.0, h = 1.15, frame = C.white, grille = true) {
  m.push(x, y, z, ry);
  m.box(w, h, 0.04, C.glass, 0, 0, 0.0);
  m.box(w + 0.16, 0.08, 0.08, frame, 0, h / 2 + 0.04, 0.02); m.box(w + 0.22, 0.09, 0.16, frame, 0, -h / 2 - 0.045, 0.05);
  m.box(0.08, h, 0.08, frame, -w / 2 - 0.04, 0, 0.02); m.box(0.08, h, 0.08, frame, w / 2 + 0.04, 0, 0.02);
  m.box(0.04, h, 0.05, frame, 0, 0, 0.03); m.box(w, 0.035, 0.05, frame, 0, h * 0.22, 0.03);
  if (grille) {
    const n = Math.max(3, Math.round(w / 0.14));
    for (let i = 1; i < n; i++) m.box(0.018, h, 0.018, C.grille, -w / 2 + (i * w) / n, 0, 0.1);
    m.box(w, 0.022, 0.022, C.grille, 0, h * 0.18, 0.1); m.box(w, 0.022, 0.022, C.grille, 0, -h * 0.25, 0.1);
  }
  m.box(w + 0.4, 0.06, 0.32, shade(frame, 0.9), 0, h / 2 + 0.2, 0.16); // a little concrete visor
  m.pop();
  if (lamps) winLamp(m, lamps, x, y, z, Math.sin(ry), Math.cos(ry));
}
// A panelled door with its frame and the row of little vent blocks above (roster).
function door(m, x, y, z, ry = 0, c = C.wood, w = 0.95, h = 2.1, frame = C.white) {
  m.push(x, y, z, ry);
  m.box(w + 0.18, h + 0.09, 0.06, frame, 0, h / 2 + 0.045, 0.01);
  m.box(w, h, 0.07, c, 0, h / 2, 0.04);
  m.box(w * 0.68, h * 0.3, 0.03, shade(c, 0.84), 0, h * 0.72, 0.085); m.box(w * 0.68, h * 0.3, 0.03, shade(c, 0.84), 0, h * 0.3, 0.085);
  m.box(0.05, 0.05, 0.08, C.gold, w * 0.36, h * 0.48, 0.1);
  for (let i = 0; i < 4; i++) m.box(0.15, 0.15, 0.03, C.ink, -0.27 + i * 0.18, h + 0.28, 0.0);
  m.pop();
}
// A square column with a base and a capital.
function pillar(m, x, z, y0, y1, c = C.white, s = 0.24) {
  m.box(s, y1 - y0, s, c, x, (y0 + y1) / 2, z);
  m.box(s + 0.1, 0.12, s + 0.1, shade(c, 0.9), x, y0 + 0.06, z); m.box(s + 0.1, 0.1, s + 0.1, shade(c, 0.93), x, y1 - 0.05, z);
}
// An iron railing along x from x0 to x1 at z: posts, a top rail and thin balusters.
function railing(m, x0, x1, z, y, h = 0.95, c = C.grille) {
  const len = x1 - x0, n = Math.max(2, Math.round(len / 0.13));
  m.box(len, 0.05, 0.06, c, (x0 + x1) / 2, y + h, z); m.box(len, 0.03, 0.03, c, (x0 + x1) / 2, y + 0.12, z);
  for (let i = 0; i <= n; i++) { const x = x0 + (i * len) / n, post = i % 8 === 0 || i === n; m.box(post ? 0.05 : 0.016, h, post ? 0.05 : 0.016, c, x, y + h / 2, z); }
}
// A low front fence along +x from 0 to len: a plastered wall, iron bars on top, pillars with caps; `gate` [g0, g1]
// leaves an opening with a two-leaf iron gate (one leaf swung open). Colliders go to `cols`.
function fenceRun(m, cols, len, { col = C.white, gate = null, wall = 0.55, bars = 0.6, open = 1.0 } = {}) {
  const spans = gate ? [[0, gate[0]], [gate[1], len]] : [[0, len]];
  for (const [a, b] of spans) {
    if (b - a < 0.05) continue;
    m.box(b - a, wall, 0.18, col, (a + b) / 2, wall / 2, 0); m.box(b - a + 0.04, 0.06, 0.24, shade(col, 0.9), (a + b) / 2, wall + 0.03, 0);
    const n = Math.max(1, Math.round((b - a) / 0.14));
    for (let i = 1; i < n; i++) m.box(0.02, bars, 0.02, C.grille, a + ((b - a) * i) / n, wall + 0.06 + bars / 2, 0);
    m.box(b - a, 0.035, 0.035, C.grille, (a + b) / 2, wall + 0.06 + bars - 0.02, 0);
    colBox(m, cols, (a + b) / 2, 0, (b - a) / 2, 0.12);
  }
  const posts = new Set([0, len]); if (gate) { posts.add(gate[0]); posts.add(gate[1]); }
  for (let x = 1.8; x < len - 0.5; x += 1.8) if (!gate || x < gate[0] - 0.5 || x > gate[1] + 0.5) posts.add(+x.toFixed(2));
  const H = wall + bars + 0.12;
  for (const x of posts) { m.box(0.28, H, 0.28, col, x, H / 2, 0); m.box(0.36, 0.08, 0.36, shade(col, 0.88), x, H + 0.04, 0); }
  if (gate) {
    const gw = (gate[1] - gate[0]) / 2 - 0.02, gh = wall + bars;
    const leaf = (hx, dir, ang) => {
      m.push(hx, 0, 0, dir * ang);
      const cx = dir * gw / 2;
      m.box(gw, 0.04, 0.04, C.grille, cx, 0.12, 0); m.box(gw, 0.04, 0.04, C.grille, cx, gh, 0); m.box(gw, 0.03, 0.03, C.grille, cx, gh * 0.55, 0);
      for (let i = 0; i <= 6; i++) m.box(0.02, gh - 0.1, 0.02, C.grille, dir * (gw * i) / 6, 0.12 + (gh - 0.1) / 2, 0);
      m.pop();
    };
    leaf(gate[0] + 0.14, 1, 0); leaf(gate[1] - 0.14, -1, open); // the second leaf swings into the yard (-z)
  }
}
// A terracotta, white glazed or blue glazed pot with one of four plants: a round shrub, a snake plant, a flowering
// bush, a little palm.
function pot(m, x, y, z, kind = 0, s = 1) {
  const pc = [C.pot, 0xe8e2d6, 0x3f6f8f, C.pot][kind % 4], P = (k) => k * s;
  m.cyl(P(0.17), P(0.12), P(0.3), pc, x, y + P(0.15), z, 9); m.cyl(P(0.19), P(0.19), P(0.05), shade(pc, 0.88), x, y + P(0.3), z, 9);
  const t = y + P(0.3);
  if (kind % 4 === 0) m.leaf(P(0.24), C.leaf, x, t + P(0.18), z, 1, 0.85, 1);
  else if (kind % 4 === 1) for (let i = 0; i < 6; i++) { const a = i * 1.05; m.box(P(0.06), P(0.55 + (i % 3) * 0.1), P(0.02), i % 2 ? 0x4f8a4a : 0x7fa85a, x + Math.cos(a) * P(0.06), t + P(0.28), z + Math.sin(a) * P(0.06), a, (i % 2 - 0.5) * 0.25); }
  else if (kind % 4 === 2) { m.leaf(P(0.22), C.leafDk, x, t + P(0.16), z, 1.1, 0.8, 1.1); for (let i = 0; i < 5; i++) { const a = i * 1.26; m.sph(P(0.05), [0xe8508f, 0xf2c03b, 0xf4efe2][i % 3], x + Math.cos(a) * P(0.16), t + P(0.24), z + Math.sin(a) * P(0.16), 1, 1, 1, 6, 4); } }
  else for (let i = 0; i < 6; i++) { const a = i * 1.05; m.bend([[x, t, z], [x + Math.cos(a) * P(0.25), t + P(0.55), z + Math.sin(a) * P(0.25)], [x + Math.cos(a) * P(0.5), t + P(0.45), z + Math.sin(a) * P(0.5)]], P(0.035), i % 2 ? C.leaf : C.leafLt, 4); }
}
// A frangipani (kamboja): a short grey trunk forking into thick bare branches, each tipped with a leaf rosette and a
// few cream-and-yellow flowers.
function frangipani(m, x, z, s = 1, seed = 1) {
  const rnd = rngOf(seed + 5), top = [x, 1.0 * s, z];
  m.rod([x, 0, z], top, 0.11 * s, 0.09 * s, C.bark, 6);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + rnd() * 0.6, r = (0.55 + rnd() * 0.35) * s, mid = [x + Math.cos(a) * r * 0.5, top[1] + 0.45 * s, z + Math.sin(a) * r * 0.5], tip = [x + Math.cos(a) * r, top[1] + (0.75 + rnd() * 0.4) * s, z + Math.sin(a) * r];
    m.bend([top, mid, tip], 0.06 * s, C.bark, 5);
    m.leaf(0.3 * s, i % 2 ? C.leaf : 0x6aa856, tip[0], tip[1] + 0.12 * s, tip[2], 1.3, 0.55, 1.3);
    for (let k = 0; k < 3; k++) { const b = k * 2.1 + a; const fx = tip[0] + Math.cos(b) * 0.16 * s, fz = tip[2] + Math.sin(b) * 0.16 * s; m.sph(0.065 * s, 0xfaf3e0, fx, tip[1] + 0.3 * s, fz, 1, 0.55, 1, 6, 4); m.sph(0.028 * s, 0xf2c03b, fx, tip[1] + 0.33 * s, fz, 1, 1, 1, 5, 3); }
  }
}
// Bougainvillea spilling over a wall top: a woody stem up the wall at x0, magenta and pink clumps along the top from x0
// to x1 at height y, and trails hanging down the wall face (+z side).
function bougainvillea(m, x0, x1, y, z, seed = 1) {
  const rnd = rngOf(seed + 11), PINKS = [0xd8378f, 0xe8569f, 0xc42a78, 0xf07ab4];
  m.bend([[x0, 0, z + 0.12], [x0 + 0.08, y * 0.5, z + 0.14], [x0 + 0.2, y, z + 0.05]], 0.04, C.woodDk, 4);
  const n = Math.max(2, Math.round((x1 - x0) / 0.42));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    m.leaf(0.26 + rnd() * 0.1, i % 4 === 3 ? C.leafDk : pick(rnd, PINKS), x, y + 0.12, z + (rnd() - 0.5) * 0.1, 1.25, 0.8, 1);
    if (rnd() < 0.55) { const k = 1 + Math.floor(rnd() * 3), dx = (rnd() - 0.5) * 0.2; for (let j = 1; j <= k; j++) m.leaf(0.2 - j * 0.03, j === k ? pick(rnd, PINKS) : (j % 2 ? C.leafDk : pick(rnd, PINKS)), x + dx, y - j * 0.24, z + 0.13, 1.1, 1.2, 0.6); } // a trail hanging down the face
  }
}
// A concrete planter box with a row of plants.
function planter(m, x0, x1, z, seed = 1) {
  const rnd = rngOf(seed), len = x1 - x0;
  m.box(len, 0.45, 0.5, C.concrete, (x0 + x1) / 2, 0.225, z); m.box(len - 0.12, 0.04, 0.38, 0x6b4f3a, (x0 + x1) / 2, 0.44, z);
  for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.45) m.leaf(0.24 + rnd() * 0.08, pick(rnd, [C.leaf, C.leafLt, C.leafDk]), x, 0.62, z, 1, 0.9, 1);
}
// A banana plant (plants.js), scaled.
function banana(m, x, z, s = 1, ry = 0) { m.at(bananaPlant(), null, x, 0, z, 0, ry, 0, s, s, s); }
// Satellite dish on a short mast, looking up and out over +z.
function dish(m, x, y, z, ry = 0) {
  m.push(x, y, z, ry);
  m.rod([0, 0, 0], [0, 1.1, 0], 0.03, 0.03, C.grille, 5);
  m.push(0, 1.15, 0.08, 0, -0.75);
  m.cyl(0.42, 0.07, 0.14, 0xeceae4, 0, 0, 0, 14); m.rod([0, 0.06, 0], [0, 0.45, 0.0], 0.012, 0.012, C.grille, 3); m.box(0.07, 0.1, 0.07, C.ink, 0, 0.48, 0);
  m.pop(); m.pop();
}
// A plastic water tank (toren) with its ribs and lid, base at y.
function waterTank(m, x, y, z, c = 0x3d7fc0) {
  m.cyl(0.55, 0.52, 1.15, c, x, y + 0.575, z, 14);
  for (const k of [0.3, 0.75]) m.cyl(0.57, 0.57, 0.05, shade(c, 0.85), x, y + k, z, 14);
  m.cyl(0.28, 0.42, 0.18, c, x, y + 1.24, z, 12); m.cyl(0.18, 0.18, 0.08, shade(c, 0.8), x, y + 1.36, z, 10);
  m.rod([x + 0.5, y + 0.1, z], [x + 0.75, y + 0.1, z], 0.03, 0.03, 0xe8e4da, 5);
}
// A steel stand for a water tank: four legs from y0 to y1 with braces and a deck.
function tankStand(m, x, z, y0, y1) {
  for (const sx of [-0.45, 0.45]) for (const sz of [-0.45, 0.45]) m.rod([x + sx, y0, z + sz], [x + sx * 0.9, y1, z + sz * 0.9], 0.035, 0.035, C.steel, 5);
  m.rod([x - 0.45, y0 + 0.3, z + 0.45], [x + 0.45, y1 - 0.1, z + 0.45], 0.02, 0.02, C.steel, 4); m.rod([x + 0.45, y0 + 0.3, z - 0.45], [x - 0.45, y1 - 0.1, z - 0.45], 0.02, 0.02, C.steel, 4);
  m.box(1.0, 0.06, 1.0, C.steel, x, y1, z);
}
// Blank signboard (no text): a coloured panel, a contrasting disc and two stripes, as a shop's logo would sit.
function signboard(m, x, y, z, w, h, col, accent, ry = 0) {
  m.push(x, y, z, ry);
  m.box(w, h, 0.08, col, 0, 0, 0); m.box(w + 0.06, h + 0.06, 0.05, shade(col, 0.7), 0, 0, -0.02);
  m.at(new THREE.CylinderGeometry(h * 0.32, h * 0.32, 0.03, 14), accent, -w / 2 + h * 0.55, 0, 0.05, Math.PI / 2);
  m.box(w * 0.55, h * 0.13, 0.02, accent, h * 0.3, h * 0.15, 0.05); m.box(w * 0.4, h * 0.1, 0.02, shade(accent, 0.85), h * 0.3 - w * 0.075, -h * 0.15, 0.05);
  m.pop();
}
// Rows of colourful goods on shelves (boxes and tins), against a back wall at z, x0..x1, from y0 to y1.
function shelves(m, x0, x1, z, y0, y1, seed = 1, rows = 4) {
  const rnd = rngOf(seed), GOODS = [0xe8503a, 0xf2c03b, 0x3a8fd0, 0x3f9f6a, 0xf4efe2, 0xe07a3a, 0x8a5ac8, 0xf28ab4];
  m.box(x1 - x0, y1 - y0, 0.06, shade(C.wood, 1.1), (x0 + x1) / 2, (y0 + y1) / 2, z - 0.2);
  for (let r = 0; r < rows; r++) {
    const y = y0 + ((y1 - y0) * r) / rows + 0.05;
    m.box(x1 - x0, 0.04, 0.4, C.white, (x0 + x1) / 2, y, z);
    for (let x = x0 + 0.08; x < x1 - 0.08;) { const w = 0.1 + rnd() * 0.16, h = 0.14 + rnd() * 0.18; m.box(w * 0.9, h, 0.24, pick(rnd, GOODS), x + w / 2, y + 0.02 + h / 2, z + 0.02); x += w; }
  }
}
// Strings of sachets hanging in a shop front (the warung's coffee and shampoo strips), along x at height y.
function sachets(m, x0, x1, y, z, seed = 2) {
  const rnd = rngOf(seed), COLS = [0xe8503a, 0xf2c03b, 0x3a8fd0, 0x3f9f6a, 0xf28ab4, 0x6a3f9c, 0xf4efe2];
  m.rod([x0, y, z], [x1, y, z], 0.015, 0.015, C.grille, 4);
  for (let x = x0 + 0.1; x < x1 - 0.05; x += 0.13) { const c = pick(rnd, COLS), n = 3 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) m.box(0.1, 0.12, 0.012, k % 2 ? c : shade(c, 0.85), x, y - 0.1 - k * 0.13, z); }
}

// ---- Houses --------------------------------------------------------------------------------------------------------
// Painted plaster houses on a 0.3 m plinth: a front terrace with a tiled floor and pillars, a tiled dado (the lower wall),
// windows with grilles, a panelled door, a hipped clay-tile or metal roof, a low fence with a gate, plants. Footprints fit
// the old stilt-house plots (at most 6.2 x 4.9 m without the fence).
export const HOUSES = [
  { w: 6.0, bd: 3.3, td: 1.5, storeys: 1, paint: PAINT.mint, dado: 0x7fbfa4, roof: { c: C.tile, kind: 'tile' }, door: { x: 0.9, c: C.wood }, win: [-1.4], pillars: [-2.75, 2.75], extras: ['bench'], fenceCol: C.white, bougain: true, pots: [0, 2, 1] },
  { w: 6.0, bd: 3.4, td: 1.4, storeys: 2, paint: PAINT.salmon, dado: 0xd98a72, roof: { c: C.tile, kind: 'tile' }, door: { x: -1.0, c: 0x6f4a33 }, win: [1.2], up: [-1.2, 1.4], pillars: [-2.75, 0.2, 2.75], extras: ['tank'], fenceCol: PAINT.cream, pots: [1, 0] },
  { w: 5.6, bd: 3.3, td: 1.4, storeys: 1, paint: PAINT.sky, dado: 0x6f9fc0, roof: { c: C.metalBlue, kind: 'metal' }, door: { x: -0.6, c: C.white }, win: [1.3], pillars: [-2.55, 2.55], extras: ['dish', 'bike'], fenceCol: C.white, pots: [2, 3] },
  { w: 6.2, bd: 3.4, td: 1.3, storeys: 2, paint: PAINT.cream, dado: 0xd8c08a, roof: { c: C.metalRed, kind: 'metal' }, door: { x: 0.0, c: 0x4f7f6a }, win: [-1.8, 1.8], up: [-1.6, 1.6], pillars: [-2.85, -0.9, 0.9, 2.85], extras: ['dish', 'tank'], fenceCol: PAINT.yellow, frangipani: true, pots: [0, 1, 2] },
  { w: 6.0, bd: 3.2, td: 1.6, storeys: 1, paint: PAINT.yellow, dado: 0xd9a64a, roof: { c: C.tile, kind: 'tile' }, door: { x: 0.6, c: 0x7a4a33 }, win: [-1.6], pillars: [-2.75, 2.75], extras: ['bike', 'bench'], fenceCol: C.white, bougain: true, pots: [2, 0, 3] },
  { w: 5.8, bd: 3.4, td: 1.3, storeys: 2, paint: PAINT.lilac, dado: 0x9a8ac0, roof: { c: C.tile, kind: 'tile' }, door: { x: 1.0, c: C.white }, win: [-1.3], up: [-1.3, 1.3], pillars: [-2.65, 2.65], extras: ['dish'], fenceCol: C.white, frangipani: true, pots: [1, 3] },
];

export function house(m, { variant = 0, fence = 1.8, seed = 1 } = {}) {
  const V = HOUSES[((variant % HOUSES.length) + HOUSES.length) % HOUSES.length];
  const W = V.w, D = V.bd + V.td, hw = W / 2, hd = D / 2, FL = 0.3, H1 = 2.9, H = V.storeys * H1;
  const zb0 = -hd, zb1 = -hd + V.bd, zf = hd, bz = (zb0 + zb1) / 2;
  const colliders = [{ x: 0, z: 0, hw, hd, rot: 0 }], lamps = [], props = [], spots = {};
  // Plinth, body, dado, storey band.
  m.box(W + 0.1, FL, D + 0.04, C.concreteDk, 0, FL / 2, 0);
  m.box(W, H, V.bd, V.paint, 0, FL + H / 2, bz);
  m.box(W + 0.03, 0.8, V.bd + 0.03, V.dado, 0, FL + 0.4, bz);
  if (V.storeys === 2) m.box(W + 0.12, 0.2, V.bd + 0.12, C.white, 0, FL + H1, bz);
  // Terrace: tiled floor, a nosing, a step at the door, pillars.
  tiles(m, -hw, hw, zb1, zf, FL + 0.005);
  m.box(W + 0.1, 0.07, 0.08, C.white, 0, FL - 0.03, zf);
  m.box(1.5, FL / 2, 0.36, C.concrete, V.door.x, FL / 4, zf + 0.18);
  const pTop = FL + H1 - 0.05;
  for (const x of V.pillars) pillar(m, x, zf - 0.16, FL, pTop, C.white);
  m.box(W, 0.22, 0.24, C.white, 0, pTop + 0.06, zf - 0.16); // ring beam over the pillars
  // Door, windows (front, sides, back); a bulb under the terrace ceiling.
  door(m, V.door.x, FL, zb1 + 0.005, 0, V.door.c);
  for (const x of V.win) win(m, lamps, x, FL + 1.45, zb1 + 0.01, 0, 1.1, 1.15);
  for (const s of [-1, 1]) win(m, lamps, s * (hw + 0.01), FL + 1.45, bz, s * Math.PI / 2, 0.8, 1.0);
  win(m, null, 0.4, FL + 1.55, zb0 - 0.01, Math.PI, 0.7, 0.8);
  bulb(m, lamps, V.door.x + (V.door.x > 0 ? -0.9 : 0.9), FL + H1 - 0.25, (zb1 + zf) / 2);
  // Roof: one storey, a hip over body and terrace; two storeys, a flat slab over the terrace (the upstairs balcony)
  // and a hip over the body.
  if (V.storeys === 1) hipRoof(m, W, D, 1.35, FL + H1 + 0.17, V.roof.c, V.roof.kind, 0.5);
  else {
    m.box(W + 0.1, 0.22, V.td + 0.1, C.concrete, 0, FL + H1 + 0.06, (zb1 + zf) / 2 + 0.05);
    railing(m, -hw + 0.05, hw - 0.05, zf - 0.02, FL + H1 + 0.17);
    for (const s of [-1, 1]) { m.push(s * (hw - 0.03), 0, (zb1 + zf) / 2, Math.PI / 2); railing(m, -V.td / 2 + 0.05, V.td / 2, 0, FL + H1 + 0.17); m.pop(); }
    door(m, V.door.x, FL + H1 + 0.17, zb1 + 0.005, 0, C.white, 0.9, 2.05);
    for (const x of V.up) win(m, lamps, x, FL + H1 + 1.5, zb1 + 0.01, 0, 1.0, 1.1);
    for (const s of [-1, 1]) win(m, lamps, s * (hw + 0.01), FL + H1 + 1.5, bz, s * Math.PI / 2, 0.8, 1.0);
    hipRoof(m, W, V.bd, 1.3, FL + H + 0.1, V.roof.c, V.roof.kind, 0.55);
    pot(m, hw - 0.4, FL + H1 + 0.17, zf - 0.35, 2, 0.9);
  }
  // Extras.
  if (V.extras.includes('dish')) dish(m, hw - 0.5, FL + H + 0.05, zb0 + 0.55, 0.3);
  if (V.extras.includes('tank')) { tankStand(m, -hw + 0.75, zb0 + 0.75, FL + H, FL + H + 1.5); waterTank(m, -hw + 0.75, FL + H + 1.53, zb0 + 0.75, variant % 2 ? C.orange : C.blue); }
  if (V.extras.includes('bench')) {
    const bx = V.door.x > 0 ? -1.4 : 1.4;
    m.box(1.3, 0.06, 0.42, C.wood, bx, FL + 0.44, zb1 + 0.35); m.box(1.3, 0.4, 0.05, C.wood, bx, FL + 0.7, zb1 + 0.12);
    for (const s of [-1, 1]) m.box(0.06, 0.44, 0.4, C.woodDk, bx + s * 0.6, FL + 0.22, zb1 + 0.35);
    spots.sit = [spot(m, bx - 0.3, zb1 + 0.4, 0, { sit: true, top: FL + 0.47 }), spot(m, bx + 0.3, zb1 + 0.4, 0, { sit: true, top: FL + 0.47 })];
  }
  V.pots.forEach((k, i) => pot(m, (i % 2 ? 1 : -1) * (hw - 0.35 - Math.floor(i / 2) * 0.5), FL, zf - 0.45, k, 1));
  // The fence and the yard in front, with its plants and the scooter.
  spots.terrace = spot(m, V.door.x > 0 ? V.door.x - 1.0 : V.door.x + 1.0, zf - 0.6, 0);
  if (fence > 0.6) {
    const fz = zf + fence, gate = [hw + 0.2 + V.door.x - 0.8, hw + 0.2 + V.door.x + 0.8];
    m.push(-hw - 0.2, 0, fz); fenceRun(m, colliders, W + 0.4, { col: V.fenceCol, gate }); m.pop();
    for (const s of [-1, 1]) { m.push(s * (hw + 0.2), 0, zf - 0.1, s > 0 ? Math.PI / 2 : -Math.PI / 2); m.push(s > 0 ? -fence - 0.1 : 0, 0, 0); fenceRun(m, colliders, fence + 0.1, { col: V.fenceCol }); m.pop(); m.pop(); }
    tiles(m, V.door.x - 0.6, V.door.x + 0.6, zf + 0.36, fz - 0.1, 0.03, C.concrete, C.concreteDk, 0.6); // a paved walk to the gate
    if (V.bougain) bougainvillea(m, -hw - 0.1, -hw + 1.6, 1.2, fz, seed);
    if (V.frangipani) frangipani(m, V.door.x > 0 ? -hw + 0.9 : hw - 0.9, zf + fence / 2 + 0.1, 0.95, seed);
    else banana(m, V.door.x > 0 ? -hw + 0.7 : hw - 0.7, zf + fence / 2 + 0.2, 0.75, seed);
    if (V.extras.includes('bike')) prop(m, props, 'motorbike', V.door.x > 0 ? V.door.x - 1.6 : V.door.x + 1.6, zf + fence / 2, 0.15, [0xd9463a, 0x3a7fc0, 0x2c2d31][seed % 3]);
  }
  return { colliders, lamps, props, spots, floor: FL, footprint: { hw, hd }, stepFeet: [{ x: V.door.x, z: zf + 0.45, w: 1.5 }], door: { x: V.door.x, z: zb1 }, fenceZ: fence > 0.6 ? zf + fence : null };
}

// ---- Ruko: a row of shophouses ---------------------------------------------------------------------------------
// Each unit is 4.2 m wide and 7 m deep: a 3.4 m shop on the ground floor behind a roller shutter (open, half down,
// closed, or an aluminium glass front), an awning and a blank signboard over it, one or two upper floors with a balcony
// (or sun visors), a parapet with a little stepped crest, a metal roof behind. Spots: each open unit's keeper (behind
// the counter) and customer (under the awning), in unit order.
export const RUKO_UNIT = { w: 4.2, d: 7.0, ground: 3.4, upper: 3.1 };
const RUKO_DEFAULT = [
  { front: 'open', paint: PAINT.cream, sign: C.red, accent: 0xf2c03b, awning: C.zinc },
  { front: 'half', paint: PAINT.mint, sign: C.blue, accent: 0xf4efe2, awning: 0x5f9a80 },
  { front: 'open', paint: PAINT.peach, sign: C.green, accent: 0xf2c03b, awning: 0x3a7fc0 },
];
export function ruko(m, { units = RUKO_DEFAULT, floors = 2, seed = 1 } = {}) {
  const { w: UW, d: D, ground: G, upper: U } = RUKO_UNIT, n = units.length, W = n * UW, Ht = G + (floors - 1) * U;
  const colliders = [], lamps = [], props = [], spots = { keepers: [], customers: [] };
  const fz = D / 2;
  units.forEach((u, i) => {
    const x0 = -W / 2 + UW * (i + 0.5), paint = u.paint, front = u.front;
    m.push(x0, 0, 0);
    // Party walls, back wall, the upper floors' mass (set back 0.1 from the shop front), floor slabs.
    m.box(0.22, Ht + 0.9, D, shade(paint, 0.95), -UW / 2 + 0.11, (Ht + 0.9) / 2, 0);
    if (i === n - 1) m.box(0.22, Ht + 0.9, D, shade(paint, 0.95), UW / 2 - 0.11, (Ht + 0.9) / 2, 0);
    m.box(UW, Ht, 0.2, shade(paint, 0.92), 0, Ht / 2, -D / 2 + 0.1);
    m.box(UW - 0.2, Ht - G, D - 0.3, paint, 0, G + (Ht - G) / 2, -0.15);
    m.box(UW, 0.3, D + 0.05, C.white, 0, G - 0.05, 0.02);
    // The shop: tiled floor, back partition with shelves, pilasters, the front.
    tiles(m, -UW / 2 + 0.2, UW / 2 - 0.2, fz - 4.2, fz, 0.12, 0xf2ece0, 0xd8d0c0, 0.45);
    m.box(UW - 0.4, G - 0.2, 0.15, 0xefe6d2, 0, (G - 0.2) / 2, fz - 4.2);
    m.box(UW - 0.4, 0.05, 4.2, 0xf4efe6, 0, G - 0.22, fz - 2.1); // ceiling
    for (const s of [-1, 1]) m.box(0.36, G, 0.3, paint, s * (UW / 2 - 0.18), G / 2, fz - 0.15);
    m.box(UW - 0.6, 0.12, 0.1, C.concreteDk, 0, 0.06, fz - 0.05); // the shutter's ground rail
    const op = UW - 0.72;
    if (front === 'open' || front === 'half') {
      shelves(m, -UW / 2 + 0.35, UW / 2 - 0.35, fz - 3.85, 0.2, 2.2, seed + i * 7, 4);
      m.box(UW - 1.6, 0.95, 0.55, C.white, -0.2, 0.475 + 0.12, fz - 1.0); m.box(UW - 1.6, 0.4, 0.5, C.glassLt, -0.2, 1.27, fz - 1.0); // counter and its glass case
      for (let k = 0; k < 6; k++) m.box(0.2, 0.15, 0.25, [0xe8503a, 0xf2c03b, 0x3a8fd0][k % 3], -1.2 + k * 0.4, 1.16, fz - 1.0);
      sachets(m, -UW / 2 + 0.4, UW / 2 - 0.4, G - 0.35, fz - 0.5, seed + i);
      if (front === 'half') strips(m, [-op / 2, 1.5, fz - 0.17], [op / 2, 1.5, fz - 0.17], [op / 2, G - 0.3, fz - 0.17], [-op / 2, G - 0.3, fz - 0.17], C.zinc, shade(C.zinc, 0.86), 22, 'rows');
      m.box(op + 0.1, 0.34, 0.34, shade(C.zinc, 0.9), 0, G - 0.32, fz - 0.17); // the rolled-up shutter's drum
      spots.keepers.push(spot(m, 0.4, fz - 1.7, 0, { unit: i })); spots.customers.push(spot(m, 0.2, fz + 1.2, Math.PI, { unit: i }));
      colBox(m, colliders, 0, -0.9 - 0.3, UW / 2, (D - 2.8) / 2);
      colBox(m, colliders, -0.2, fz - 1.0, (UW - 1.6) / 2, 0.3);
      bulb(m, lamps, 0, G - 0.45, fz - 2.2, 0.08);
      winLamp(m, lamps, 0, 1.6, fz - 0.2);
    } else if (front === 'closed') {
      strips(m, [-op / 2, 0.12, fz - 0.17], [op / 2, 0.12, fz - 0.17], [op / 2, G - 0.3, fz - 0.17], [-op / 2, G - 0.3, fz - 0.17], C.zinc, shade(C.zinc, 0.86), 30, 'rows');
      m.box(op + 0.1, 0.34, 0.34, shade(C.zinc, 0.9), 0, G - 0.32, fz - 0.17); m.box(0.08, 0.1, 0.05, C.ink, 0.3, 0.3, fz - 0.13);
      colBox(m, colliders, 0, 0, UW / 2, D / 2);
    } else { // glass: an aluminium shopfront, bright inside
      shelves(m, -UW / 2 + 0.35, UW / 2 - 0.35, fz - 3.85, 0.2, 2.2, seed + i * 7, 4);
      m.box(op, G - 0.6, 0.05, C.glassLt, 0, 0.2 + (G - 0.6) / 2, fz - 0.2);
      for (const x of [-op / 2, -op / 6, op / 6, op / 2]) m.box(0.06, G - 0.5, 0.08, 0xd8dcde, x, 0.2 + (G - 0.5) / 2, fz - 0.17);
      m.box(op, 0.08, 0.08, 0xd8dcde, 0, G - 0.4, fz - 0.17); m.box(op, 0.08, 0.08, 0xd8dcde, 0, 0.18, fz - 0.17);
      colBox(m, colliders, 0, 0, UW / 2, D / 2);
      winLamp(m, lamps, -0.9, 1.5, fz - 0.2); winLamp(m, lamps, 0.9, 1.5, fz - 0.2);
    }
    // Awning, brackets, signboard on the slab edge.
    shedRoof(m, -UW / 2 + 0.12, UW / 2 - 0.12, fz, G - 0.2, fz + 1.35, G - 0.65, u.awning);
    for (const s of [-1, 1]) m.rod([s * (UW / 2 - 0.3), G - 0.9, fz + 0.02], [s * (UW / 2 - 0.3), G - 0.62, fz + 1.25], 0.02, 0.02, C.grille, 4);
    signboard(m, 0, G + 0.5, fz + 0.12, UW - 0.5, 0.72, u.sign, u.accent);
    // Upper floors: a balcony with a glass door, a window and an air-con unit; the top floor of three gets sun visors.
    for (let k = 1; k < floors; k++) {
      const y0 = G + (k - 1) * U + 0.12, top = k === floors - 1 && floors === 3;
      if (!top) {
        m.box(UW - 0.3, 0.16, 0.9, C.concrete, 0, y0, fz + 0.3);
        railing(m, -UW / 2 + 0.2, UW / 2 - 0.2, fz + 0.72, y0 + 0.08);
        door(m, -0.85, y0 + 0.08, fz - 0.14, 0, 0x8fb6c4, 0.9, 2.2);
        win(m, lamps, 0.95, y0 + 1.45, fz - 0.14, 0, 1.0, 1.15);
        m.box(0.72, 0.5, 0.26, 0xeceae4, 1.3, y0 + 0.35, fz + 0.32); m.at(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12), 0x8a9094, 1.3, y0 + 0.35, fz + 0.46, Math.PI / 2);
        pot(m, -1.6, y0 + 0.08, fz + 0.45, (i + k) % 4, 0.85);
        if ((i + k + seed) % 2) { m.rod([-UW / 2 + 0.3, y0 + 1.8, fz + 0.6], [UW / 2 - 0.3, y0 + 1.75, fz + 0.6], 0.008, 0.008, C.grille, 3); for (let c = 0; c < 4; c++) m.box(0.35, 0.5, 0.01, [0xe8503a, 0x3a8fd0, 0xf4efe2, 0xf2c03b][c], -1.2 + c * 0.7, y0 + 1.5, fz + 0.6); }
      } else {
        for (const x of [-0.9, 0.95]) { win(m, lamps, x, y0 + 1.4, fz - 0.14, 0, 1.0, 1.15); m.box(1.4, 0.08, 0.55, C.white, x, y0 + 2.15, fz + 0.1); }
      }
    }
    // Parapet with a stepped crest on alternate units, its cap; the metal roof behind.
    m.box(UW, 0.9, 0.22, paint, 0, Ht + 0.45, fz - 0.2); m.box(UW + 0.06, 0.1, 0.32, C.white, 0, Ht + 0.95, fz - 0.2);
    if (i % 2 === 0) { m.box(1.6, 0.45, 0.22, paint, 0, Ht + 1.2, fz - 0.2); m.box(1.7, 0.08, 0.3, C.white, 0, Ht + 1.46, fz - 0.2); }
    shedRoof(m, -UW / 2 + 0.11, UW / 2 - 0.11, -D / 2, Ht + 0.15, fz - 0.35, Ht + 0.7, C.zinc, 14);
    m.pop();
  });
  // The pavement in front, scooters parked along it.
  m.box(W, 0.12, 1.6, C.concrete, 0, 0.06, fz + 0.8);
  for (let i = 0; i < n; i++) if ((i + seed) % 2 === 0) prop(m, props, 'motorbike', -W / 2 + UW * (i + 0.5) + 1.3, fz + 1.0, Math.PI * 0.5 + 0.1, [C.red, C.blue, 0xf4efe2, C.ink][(i + seed) % 4]);
  return { colliders, lamps, props, spots, footprint: { hw: W / 2, hd: D / 2 } };
}

// ---- Small shops --------------------------------------------------------------------------------------------------
// The warung: a small eatery with a glass snack case on the counter, sachet strips, a zinc lean-to over plastic tables
// and chairs (props), a drinks cooler and green 3 kg gas bottles. A side door to the family's rooms.
export function warung(m, { seed = 3, paint = PAINT.peach } = {}) {
  const W = 5.4, BD = 3.4, LD = 2.4, D = BD + LD, hw = W / 2, zb0 = -D / 2, zb1 = zb0 + BD, zf = D / 2, H = 2.8;
  const colliders = [{ x: 0, z: zb0 + BD / 2, hw, hd: BD / 2, rot: 0 }], lamps = [], props = [], spots = {};
  // Body: back and side walls, the front with a wide opening; a metal roof.
  m.box(W, H, 0.2, paint, 0, H / 2, zb0 + 0.1);
  for (const s of [-1, 1]) m.box(0.2, H, BD, paint, s * (hw - 0.1), H / 2, zb0 + BD / 2);
  m.box(1.0, H, 0.2, paint, hw - 0.6, H / 2, zb1 - 0.1); m.box(0.9, H, 0.2, paint, -hw + 0.55, H / 2, zb1 - 0.1);
  m.box(W - 1.9, 0.6, 0.2, paint, -0.05, H - 0.3, zb1 - 0.1);
  m.box(W + 0.02, 0.6, BD + 0.02, shade(paint, 0.82), 0, 0.3, zb0 + BD / 2 - 0.01);
  tiles(m, -hw + 0.2, hw - 0.2, zb0 + 0.2, zb1, 0.03, 0xf2ece0, 0xd8d0c0, 0.45);
  shedRoof(m, -hw - 0.3, hw + 0.3, zb0 - 0.4, H + 0.05, zb1, H + 0.55, C.zinc);
  door(m, hw - 0.6, 0.02, zb1 + 0.005, 0, 0x5f8f7a, 0.8, 2.0);
  // Counter with the snack case, shelves behind, sachets, the cooler.
  m.box(3.0, 0.95, 0.5, 0xe8dcc0, -0.55, 0.475, zb1 - 0.35); m.box(2.2, 0.45, 0.45, C.glassLt, -0.55, 1.18, zb1 - 0.35);
  for (let k = 0; k < 8; k++) m.box(0.18, 0.12, 0.2, [0xf2c03b, 0xe8503a, 0xc98a3a, 0x3f9f6a][k % 4], -1.45 + k * 0.26, 1.05, zb1 - 0.35);
  shelves(m, -hw + 0.4, hw - 1.4, zb0 + 0.45, 0.2, 2.0, seed, 3);
  sachets(m, -hw + 0.7, hw - 1.4, H - 0.2, zb1 + 0.05, seed);
  m.box(0.75, 1.75, 0.6, C.red, hw - 0.6, 0.875, zb1 + 0.55); m.box(0.6, 1.35, 0.03, C.glassLt, hw - 0.6, 1.0, zb1 + 0.86); m.box(0.7, 0.2, 0.04, 0xf4efe2, hw - 0.6, 1.6, zb1 + 0.86);
  for (const [x, z] of [[-hw + 0.35, zb1 + 0.4], [-hw + 0.7, zb1 + 0.3]]) { m.cyl(0.15, 0.15, 0.3, 0x5fb06a, x, 0.2, z, 10); m.sph(0.15, 0x5fb06a, x, 0.35, z, 1, 0.6, 1, 10, 5); m.cyl(0.04, 0.04, 0.1, C.ink, x, 0.48, z, 6); }
  // The lean-to: two steel posts, a beam, the zinc sheet, a blank banner, a bulb.
  for (const s of [-1, 1]) m.rod([s * (hw - 0.15), 0, zf - 0.1], [s * (hw - 0.15), H - 0.4, zf - 0.1], 0.045, 0.045, C.steel, 6);
  m.box(W - 0.2, 0.1, 0.1, C.steel, 0, H - 0.4, zf - 0.1);
  shedRoof(m, -hw - 0.1, hw + 0.1, zb1, H - 0.1, zf + 0.15, H - 0.45, 0x8fbf6a);
  m.quad([-1.4, H - 0.45, zf - 0.04], [1.4, H - 0.45, zf - 0.04], [1.4, H - 1.05, zf - 0.04], [-1.4, H - 1.05, zf - 0.04], 0xf2c03b, true);
  m.at(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 12), C.red, -0.9, H - 0.75, zf - 0.02, Math.PI / 2);
  bulb(m, lamps, 0, H - 0.55, zb1 + 1.1, 0.08);
  colRound(m, colliders, -hw + 0.15, zf - 0.1, 0.08); colRound(m, colliders, hw - 0.15, zf - 0.1, 0.08);
  // Plastic tables and chairs (props), and where people sit.
  spots.sit = [];
  for (const [tx, tz] of [[-1.3, zb1 + 1.3], [1.0, zb1 + 1.4]]) {
    prop(m, props, 'table', tx, tz, 0, 0xf4efe2);
    for (const [cx, cz, r] of [[-0.6, 0, Math.PI / 2], [0.6, 0, -Math.PI / 2]]) { const c = [C.red, C.blue, C.green][(Math.round(tx * 3) + Math.round(cx * 5) + 6) % 3]; prop(m, props, 'chair', tx + cx, tz + cz, r, c); spots.sit.push(spot(m, tx + cx, tz + cz, r, { sit: true, top: 0.45 })); }
  }
  spots.keeper = spot(m, -0.55, zb1 - 1.0, 0); spots.customer = spot(m, -0.55, zb1 + 0.5, Math.PI);
  return { colliders, lamps, props, spots, footprint: { hw, hd: D / 2 }, stepFeet: [{ x: hw - 0.6, z: zb1 + 0.4, w: 1.0 }], door: { x: hw - 0.6, z: zb1 } };
}

// A minimarket: a flat-roofed white box with a striped fascia and a blank sign, a full glass front with a sliding door,
// bright shelves inside, a tiled forecourt with the water-gallon rack and a freezer, scooters in front.
export function minimarket(m, { seed = 4 } = {}) {
  const W = 7.4, BD = 6.0, FD = 1.8, D = BD + FD, hw = W / 2, zb0 = -D / 2, zb1 = zb0 + BD, zf = D / 2, H = 3.4;
  const colliders = [], lamps = [], props = [], spots = {};
  m.box(W + 0.2, 0.25, D + 0.1, C.concreteDk, 0, 0.125, 0);
  m.box(W, H, 0.2, C.white, 0, H / 2, zb0 + 0.1);
  for (const s of [-1, 1]) m.box(0.2, H, BD, C.white, s * (hw - 0.1), H / 2, zb0 + BD / 2);
  m.box(W, 0.2, BD, C.white, 0, H + 0.1, zb0 + BD / 2);
  // Fascia: a deep white band with three colour stripes and a blank sign; a canopy over the forecourt.
  m.box(W + 0.3, 1.0, 0.3, C.white, 0, H + 0.4, zb1 + 0.1);
  for (const [k, c] of [[0, C.red], [1, 0xf2c03b], [2, C.blue]]) m.box(W + 0.32, 0.12, 0.31, c, 0, H + 0.08 + k * 0.14, zb1 + 0.1);
  signboard(m, 0, H + 0.62, zb1 + 0.27, 3.2, 0.5, C.blue, 0xf2c03b);
  m.box(W + 0.3, 0.14, FD + 0.2, C.white, 0, H - 0.05, zb1 + FD / 2 + 0.1);
  for (const s of [-1, 1]) pillar(m, s * (hw - 0.1), zf - 0.15, 0.25, H - 0.1, C.white, 0.22);
  bulb(m, lamps, -1.8, H - 0.2, zb1 + 0.9, 0.06); bulb(m, lamps, 1.8, H - 0.2, zb1 + 0.9, 0.06);
  // Glass front with mullions and a sliding door (one leaf drawn aside).
  const gw = W - 0.4;
  for (const [a, b] of [[-gw / 2, -0.75], [0.75, gw / 2]]) m.box(b - a, H - 0.5, 0.05, C.glassLt, (a + b) / 2, 0.25 + (H - 0.5) / 2, zb1 - 0.05);
  for (const x of [-gw / 2, -gw / 4, -0.75, 0.75, gw / 4, gw / 2]) m.box(0.07, H - 0.4, 0.09, 0xd8dcde, x, 0.25 + (H - 0.4) / 2, zb1 - 0.03);
  m.box(gw, 0.09, 0.09, 0xd8dcde, 0, H - 0.2, zb1 - 0.03); m.box(0.75, H - 0.6, 0.04, C.glassLt, -0.4, 0.25 + (H - 0.6) / 2, zb1 - 0.12);
  // Inside: aisles of shelves, the till.
  for (const z of [zb0 + 0.6, zb0 + 2.2, zb0 + 3.6]) shelves(m, -hw + 0.5, hw - 2.2, z, 0.25, 1.9, seed + Math.round(z * 3), 4);
  m.box(1.6, 1.0, 0.6, C.white, hw - 1.3, 0.75, zb1 - 1.0); m.box(0.4, 0.3, 0.3, C.ink, hw - 1.1, 1.4, zb1 - 1.0);
  tiles(m, -hw + 0.2, hw - 0.2, zb0 + 0.2, zb1, 0.27, 0xf6f2ea, 0xe2ddd2, 0.6);
  tiles(m, -hw, hw, zb1, zf, 0.255, 0xe8e0d0, 0xc9bca4, 0.6);
  winLamp(m, lamps, -2.4, 1.6, zb1); winLamp(m, lamps, 2.4, 1.6, zb1); winLamp(m, lamps, 0, 1.6, zb1);
  // Forecourt: the gallon rack, a freezer, bins.
  const gx = -hw + 0.7;
  m.box(0.9, 1.2, 0.5, C.steel, gx, 0.85, zb1 + 0.4);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) { const y = 0.5 + r * 0.55, x = gx - 0.2 + k * 0.4; m.at(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 10), 0x6fb4e0, x, y, zb1 + 0.45, Math.PI / 2); }
  m.box(1.1, 0.85, 0.65, C.white, hw - 1.2, 0.68, zb1 + 0.5); m.box(1.0, 0.04, 0.55, C.glassLt, hw - 1.2, 1.12, zb1 + 0.5);
  colBox(m, colliders, gx, zb1 + 0.4, 0.5, 0.3); colBox(m, colliders, hw - 1.2, zb1 + 0.5, 0.6, 0.35);
  // Walls as colliders with a gap at the door, the till inside.
  colBox(m, colliders, 0, zb0 + 0.2, hw, 0.25); for (const s of [-1, 1]) colBox(m, colliders, s * (hw - 0.15), zb0 + BD / 2, 0.2, BD / 2);
  colBox(m, colliders, -(hw + 0.75) / 2 - 0.0, zb1 - 0.05, (hw - 0.75) / 2, 0.12); colBox(m, colliders, (hw + 0.75) / 2, zb1 - 0.05, (hw - 0.75) / 2, 0.12);
  colBox(m, colliders, hw - 1.3, zb1 - 1.0, 0.8, 0.3);
  for (let k = 0; k < 3; k++) prop(m, props, 'motorbike', -1.6 + k * 1.1, zf + 1.1, 0.05, [C.red, C.ink, 0xf4efe2][k]);
  prop(m, props, 'bin', hw - 0.35, zf - 0.35, 0, C.green);
  spots.keeper = spot(m, hw - 1.3, zb1 - 1.6, 0); spots.customer = spot(m, 0, zf + 0.2, Math.PI); spots.inside = spot(m, -0.8, zb0 + 1.4, 0);
  return { colliders, lamps, props, spots, footprint: { hw, hd: D / 2 }, stepFeet: [{ x: 0, z: zf + 0.3, w: 1.4 }], door: { x: 0, z: zb1 } };
}

// A café: a narrow two-storey building (the family lives upstairs) with an open coffee counter at the front, a wooden
// deck under a pergola strung with fairy lights, café tables and chairs (props), plants, a blank A-board.
export function cafe(m, { seed = 5, paint = PAINT.white } = {}) {
  const W = 6.4, BD = 2.6, DD = 2.3, D = BD + DD, hw = W / 2, zb0 = -D / 2, zb1 = zb0 + BD, zf = D / 2, H1 = 3.0;
  const colliders = [{ x: 0, z: zb0 + BD / 2, hw, hd: BD / 2, rot: 0 }], lamps = [], props = [], spots = {};
  m.box(W, H1 * 2, BD, paint, 0, H1, zb0 + BD / 2);
  m.box(W + 0.02, 0.9, BD + 0.02, 0x3f5f5a, 0, 0.45, zb0 + BD / 2 - 0.01);
  m.box(W + 0.1, 0.16, BD + 0.1, C.woodDk, 0, H1, zb0 + BD / 2);
  // The counter opening: dark inside, a timber counter, a menu board, coffee machine, cups.
  m.box(3.4, 1.4, 0.06, 0x3a2e28, -0.6, 1.75, zb1 + 0.01);
  m.box(3.6, 0.1, 0.5, C.wood, -0.6, 1.05, zb1 + 0.2); m.box(3.6, 1.0, 0.1, C.woodDk, -0.6, 0.5, zb1 + 0.05);
  m.box(0.5, 0.45, 0.4, 0xc9ccd0, -1.6, 1.32, zb1 + 0.1); for (let k = 0; k < 4; k++) m.cyl(0.04, 0.035, 0.1, 0xf4efe2, -0.6 + k * 0.18, 1.15, zb1 + 0.3, 6);
  m.box(1.3, 0.55, 0.04, 0x2c3a34, 0.6, 2.05, zb1 + 0.05);
  door(m, hw - 0.75, 0, zb1 + 0.005, 0, C.woodDk, 0.85, 2.1);
  signboard(m, -0.6, H1 - 0.35, zb1 + 0.12, 3.2, 0.5, 0x2c3a34, 0xe2b84a);
  // Upstairs: a window, a balcony door, a small balcony; a low hipped metal roof.
  m.box(W - 0.4, 0.14, 0.8, C.concrete, 0, H1 + 0.08, zb1 + 0.4); railing(m, -hw + 0.3, hw - 0.3, zb1 + 0.78, H1 + 0.15, 0.9, C.woodDk);
  door(m, 1.4, H1 + 0.15, zb1 + 0.005, 0, C.glassLt, 0.9, 2.1); win(m, lamps, -1.2, H1 + 1.5, zb1 + 0.01, 0, 1.2, 1.1, C.woodDk);
  hipRoof(m, W, BD, 1.0, H1 * 2 + 0.05, C.metalGreen, 'metal', 0.45);
  pot(m, -hw + 0.6, H1 + 0.15, zb1 + 0.5, 1, 0.8);
  // The deck, the pergola, the fairy lights.
  m.box(W, 0.16, DD, C.wood, 0, 0.08, zb1 + DD / 2);
  for (let k = 0; k < 12; k++) m.box(0.02, 0.005, DD, C.woodDk, -hw + (k + 0.5) * (W / 12), 0.163, zb1 + DD / 2);
  const PY = 2.65;
  for (const x of [-hw + 0.12, hw - 0.12]) m.box(0.12, PY, 0.12, C.woodDk, x, PY / 2, zf - 0.12);
  m.box(W, 0.12, 0.12, C.woodDk, 0, PY, zf - 0.12);
  for (let k = 0; k < 5; k++) m.box(0.08, 0.12, DD + 0.1, C.woodDk, -hw + 0.12 + k * ((W - 0.24) / 4), PY + 0.08, zb1 + DD / 2);
  for (let k = 0; k < 4; k++) {
    const x = -hw + 0.6 + k * ((W - 1.2) / 3), a = [x, PY + 0.02, zb1 + 0.05], b = [x + (k % 2 ? -0.6 : 0.6), PY, zf - 0.12], pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, p = L3(a, b, t); p[1] -= 0.32 * Math.sin(Math.PI * t); pts.push(p); }
    m.bend(pts, 0.006, C.ink, 3);
    for (let i = 1; i < 8; i++) bulb(m, lamps, pts[i][0], pts[i][1] - 0.05, pts[i][2], 0.035);
  }
  for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9, x = -hw + 0.2 + t * (W - 0.4); bulb(m, lamps, x, PY - 0.12 - 0.12 * Math.sin(Math.PI * ((i % 3) / 3)), zf - 0.12, 0.035); }
  m.rod([-hw + 0.12, PY - 0.08, zf - 0.12], [hw - 0.12, PY - 0.08, zf - 0.12], 0.006, 0.006, C.ink, 3);
  // Tables, chairs, plants, the A-board.
  spots.sit = [];
  for (const [tx, tz] of [[-1.9, zb1 + 1.2], [0.2, zb1 + 1.35], [2.2, zb1 + 1.1]]) {
    prop(m, props, 'cafeTable', tx, tz, 0, 0xffffff);
    for (const [cx, r] of [[-0.55, Math.PI / 2], [0.55, -Math.PI / 2]]) { prop(m, props, 'cafeChair', tx + cx, tz, r, 0xffffff); spots.sit.push(spot(m, tx + cx, tz, r, { sit: true, top: 0.62 })); }
  }
  pot(m, -hw + 0.3, 0.16, zf - 0.35, 3, 1.2); pot(m, hw - 0.3, 0.16, zf - 0.35, 0, 1.1); banana(m, hw + 0.45, zb1 + 0.4, 0.7, 1.2);
  m.push(0.9, 0, zf + 0.45, 0.4); m.quad([-0.3, 0, 0.12], [0.3, 0, 0.12], [0.3, 0.9, -0.02], [-0.3, 0.9, -0.02], 0x2c3a34, true); m.quad([0.3, 0, -0.16], [-0.3, 0, -0.16], [-0.3, 0.9, -0.02], [0.3, 0.9, -0.02], 0x2c3a34, true); m.pop();
  colRound(m, colliders, -hw + 0.12, zf - 0.12, 0.1); colRound(m, colliders, hw - 0.12, zf - 0.12, 0.1);
  spots.barista = spot(m, -0.6, zb1 - 0.5, 0); spots.customer = spot(m, -0.6, zb1 + 0.75, Math.PI);
  return { colliders, lamps, props, spots, footprint: { hw, hd: D / 2 }, stepFeet: [{ x: hw - 0.75, z: zb1 + 0.4, w: 1.0 }], door: { x: hw - 0.75, z: zb1 } };
}

// The bengkel: an open motorbike workshop under a zinc roof: tyres stacked and hung, a pegboard of tools, a
// compressor, a workbench, oil tins, a drum, scooters waiting (props), a yellow sign; the family's door at the side.
export function bengkel(m, { seed = 6, paint = PAINT.sky } = {}) {
  const W = 5.6, D = 4.8, hw = W / 2, hd = D / 2, H = 3.0;
  const colliders = [], lamps = [], props = [], spots = {};
  m.box(W, H, 0.2, paint, 0, H / 2, -hd + 0.1); for (const s of [-1, 1]) m.box(0.2, H, D, paint, s * (hw - 0.1), H / 2, 0);
  m.box(W + 0.02, 0.9, D + 0.02, shade(paint, 0.75), 0, 0.45, -0.01);
  m.box(W - 0.4, 0.06, D - 0.2, 0x8f8b84, 0, 0.03, 0.1);
  for (const [x, z, r] of [[-0.6, 0.2, 0.5], [0.8, -0.8, 0.35], [-1.6, -1.2, 0.3]]) m.at(new THREE.CylinderGeometry(r, r, 0.005, 10), 0x5f5b56, x, 0.065, z);
  shedRoof(m, -hw - 0.25, hw + 0.25, -hd - 0.3, H + 0.1, hd + 0.6, H + 0.55, C.zincRust);
  signboard(m, 0, H + 0.75, hd + 0.62, 3.6, 0.6, 0xf2c03b, C.red);
  for (const s of [-1, 1]) m.rod([s * (hw - 0.1), 0, hd - 0.1], [s * (hw - 0.1), H + 0.5, hd - 0.1], 0.05, 0.05, C.steel, 6);
  // Tyres: a stack and three on the wall.
  for (let k = 0; k < 5; k++) m.at(new THREE.TorusGeometry(0.26, 0.085, 6, 12), 0x2a2a2c, -hw + 0.55, 0.1 + k * 0.17, hd - 0.7, Math.PI / 2);
  for (let k = 0; k < 3; k++) m.at(new THREE.TorusGeometry(0.25, 0.08, 6, 12), 0x2a2a2c, -hw + 0.21, 1.9, -1.2 + k * 0.62, 0, Math.PI / 2);
  // Pegboard with tools, a workbench, oil tins on a shelf, the compressor.
  m.box(2.0, 1.1, 0.04, 0xc9a26a, 0.6, 1.75, -hd + 0.22);
  for (let k = 0; k < 9; k++) m.box(0.05 + (k % 3) * 0.03, 0.25 + (k % 2) * 0.12, 0.03, [C.red, C.ink, C.steel][k % 3], -0.2 + (k % 5) * 0.38, 1.55 + Math.floor(k / 5) * 0.45, -hd + 0.25);
  m.box(2.2, 0.08, 0.7, C.woodDk, 0.6, 0.9, -hd + 0.55); for (const s of [-1, 1]) m.box(0.08, 0.9, 0.6, C.woodDk, 0.6 + s * 1.0, 0.45, -hd + 0.55);
  for (let k = 0; k < 6; k++) m.cyl(0.07, 0.07, 0.22, [C.red, 0xf2c03b, C.blue, C.green][k % 4], -0.2 + k * 0.28, 1.05, -hd + 0.5, 8);
  m.box(1.4, 0.04, 0.3, C.steel, hw - 1.1, 2.5, -hd + 0.3); for (let k = 0; k < 5; k++) m.cyl(0.08, 0.08, 0.25, [0xf2c03b, C.red][k % 2], hw - 1.7 + k * 0.3, 2.65, -hd + 0.3, 8);
  m.at(new THREE.CylinderGeometry(0.25, 0.25, 0.9, 12), C.red, hw - 0.8, 0.35, -0.3, 0, 0, Math.PI / 2); m.box(0.4, 0.35, 0.35, 0x3a3e44, hw - 0.8, 0.75, -0.3);
  m.box(0.4, 0.04, 0.4, C.blue, -1.4, 0.4, 0.6); m.cyl(0.03, 0.03, 0.38, C.steel, -1.4, 0.2, 0.6, 5); // a low stool
  door(m, hw + 0.005, 0, -1.4, Math.PI / 2, 0x6f4a33, 0.85, 2.05);
  bulb(m, lamps, 0, H - 0.2, 0.3, 0.08);
  prop(m, props, 'motorbike', 0.0, 0.5, 0.25, C.red); prop(m, props, 'motorbike', 1.2, hd + 1.3, -0.3, C.blue); prop(m, props, 'drum', -hw + 0.55, -hd + 0.55, 0, 0x3a3e44);
  colBox(m, colliders, 0, -hd + 0.15, hw, 0.2); for (const s of [-1, 1]) colBox(m, colliders, s * (hw - 0.1), 0, 0.15, hd);
  colBox(m, colliders, 0.6, -hd + 0.55, 1.1, 0.35); colRound(m, colliders, -hw + 0.55, hd - 0.7, 0.35); colRound(m, colliders, hw - 0.8, -0.3, 0.5);
  spots.mechanic = spot(m, -0.55, 0.5, Math.PI / 2, { pose: 'hammer' }); spots.customer = spot(m, -1.4, 0.6, 0.6, { sit: true, top: 0.42 });
  return { colliders, lamps, props, spots, footprint: { hw, hd }, stepFeet: [{ x: hw + 0.5, z: -1.4, w: 1.0 }], door: { x: hw, z: -1.4, rot: -Math.PI / 2 } };
}

// ---- Civic -------------------------------------------------------------------------------------------------------
// A small mosque: a white prayer hall on a plinth with arched windows, a front porch (serambi) on round columns, a
// green dome on an octagonal drum, a slender minaret with a balcony and loudspeakers, a wudhu tap wall at the side, a
// sandal rack. 7 x 6.2 m; the minaret stands in the back-left corner. The caretaker (marbot) has a door at the side.
function arch(m, lamps, x, y, z, ry, w = 0.8, h = 1.3, glass = C.glass, frame = 0x3f9f7a) {
  m.push(x, y, z, ry);
  m.box(w, h, 0.04, glass, 0, h / 2, 0);
  m.at(new THREE.CylinderGeometry(w / 2, w / 2, 0.04, 12, 1, false, Math.PI / 2, Math.PI), glass, 0, h, 0, Math.PI / 2);
  m.at(new THREE.CylinderGeometry(w / 2 + 0.1, w / 2 + 0.1, 0.03, 12, 1, false, Math.PI / 2, Math.PI), frame, 0, h, -0.02, Math.PI / 2);
  m.box(w + 0.2, 0.08, 0.14, frame, 0, -0.02, 0.05); for (const s of [-1, 1]) m.box(0.1, h, 0.06, frame, s * (w / 2 + 0.05), h / 2, -0.01);
  m.pop();
  if (lamps) winLamp(m, lamps, x, y + h * 0.6, z, Math.sin(ry), Math.cos(ry));
}
export function mosque(m, { seed = 7, dome = 0x3f9f7a } = {}) {
  const W = 7.0, D = 6.2, hw = W / 2, hd = D / 2, PL = 0.45, H = 3.6, bx0 = -2.2, bx1 = hw, bw = bx1 - bx0, bcx = (bx0 + bx1) / 2, bz0 = -hd, bz1 = 1.3, bd = bz1 - bz0, bcz = (bz0 + bz1) / 2;
  const colliders = [{ x: bcx, z: 0, hw: bw / 2, hd, rot: 0 }], lamps = [], props = [], spots = {}, GREEN = 0x3f9f7a, WHITE = 0xf6f3ea;
  // Plinth and steps; the hall; its green dado; arched windows; the dome on its drum.
  m.box(bw + 0.2, PL, D + 0.1, C.concrete, bcx, PL / 2, 0);
  for (let k = 0; k < 2; k++) m.box(2.6, PL * (1 - k) / 2 + 0.01, 0.35, C.concrete, bcx, PL * (2 - k) / 4, hd + 0.17 + k * 0.33);
  m.box(bw, H, bd, WHITE, bcx, PL + H / 2, bcz); m.box(bw + 0.03, 0.7, bd + 0.03, GREEN, bcx, PL + 0.35, bcz);
  m.box(bw + 0.3, 0.25, bd + 0.3, WHITE, bcx, PL + H + 0.12, bcz); m.box(bw + 0.36, 0.08, bd + 0.36, GREEN, bcx, PL + H + 0.28, bcz);
  for (const z of [bz0 + 1.2, bz0 + 3.0]) { arch(m, lamps, bx1 + 0.01, PL + 0.9, z, Math.PI / 2); arch(m, lamps, bx0 - 0.01, PL + 0.9, z, -Math.PI / 2); }
  arch(m, null, bcx - 1.2, PL + 0.9, bz0 - 0.01, Math.PI); arch(m, null, bcx + 1.2, PL + 0.9, bz0 - 0.01, Math.PI);
  const dy = PL + H + 0.3;
  m.cyl(1.45, 1.45, 0.75, WHITE, bcx, dy + 0.375, bcz, 8); m.cyl(1.52, 1.52, 0.08, GREEN, bcx, dy + 0.75, bcz, 8);
  m.at(new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dome, bcx, dy + 0.78, bcz, 0, 0, 0, 1, 1.18, 1);
  m.rod([bcx, dy + 2.5, bcz], [bcx, dy + 3.2, bcz], 0.03, 0.03, C.gold, 5); m.sph(0.09, C.gold, bcx, dy + 2.65, bcz, 1, 1, 1, 8, 6);
  m.at(new THREE.TorusGeometry(0.17, 0.035, 5, 12, Math.PI * 1.35), C.gold, bcx, dy + 3.33, bcz, 0, 0, -Math.PI * 0.18);
  // The porch: a tiled floor, four columns, a flat roof with a little green crest, the doors, the sandal rack.
  tiles(m, bx0, bx1, bz1, hd, PL + 0.005, 0xf4efe6, 0xd7e6dc, 0.5);
  for (const x of [bx0 + 0.25, bcx - 1.0, bcx + 1.0, bx1 - 0.25]) { m.cyl(0.14, 0.15, H - 0.4, WHITE, x, PL + (H - 0.4) / 2, hd - 0.25, 10); m.box(0.36, 0.14, 0.36, GREEN, x, PL + H - 0.45, hd - 0.25); m.box(0.36, 0.14, 0.36, WHITE, x, PL + 0.07, hd - 0.25); }
  m.box(bw + 0.2, 0.25, hd - bz1 + 0.25, WHITE, bcx, PL + H - 0.25, (bz1 + hd) / 2 + 0.1); m.box(bw + 0.24, 0.08, hd - bz1 + 0.3, GREEN, bcx, PL + H - 0.08, (bz1 + hd) / 2 + 0.1);
  m.box(2.4, 0.55, 0.16, GREEN, bcx, PL + H + 0.25, hd - 0.05); m.at(new THREE.SphereGeometry(0.32, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), dome, bcx, PL + H + 0.52, hd - 0.05);
  arch(m, null, bcx, PL, bz1 + 0.01, 0, 1.2, 1.9, 0x6f4a33, GREEN); arch(m, null, bcx - 1.7, PL + 0.6, bz1 + 0.01, 0, 0.75, 1.2); arch(m, null, bcx + 1.7, PL + 0.6, bz1 + 0.01, 0, 0.75, 1.2);
  m.box(1.2, 0.5, 0.3, C.wood, bx1 - 0.9, PL + 0.25, bz1 + 0.25); for (let k = 0; k < 4; k++) m.box(0.12, 0.04, 0.26, [C.ink, C.blue, C.red, 0x6f4a33][k], bx1 - 1.3 + k * 0.26, PL + 0.52, bz1 + 0.25);
  for (const x of [bcx - 1.6, bcx + 1.6]) bulb(m, lamps, x, PL + H - 0.45, (bz1 + hd) / 2, 0.07);
  // The minaret.
  const mx = -hw + 0.65, mz = -hd + 0.65;
  m.box(1.3, 3.0, 1.3, WHITE, mx, 1.5, mz); m.box(1.36, 0.5, 1.36, GREEN, mx, 0.25, mz); m.box(1.4, 0.12, 1.4, GREEN, mx, 3.0, mz);
  m.cyl(0.48, 0.56, 6.0, WHITE, mx, 6.0, mz, 10); for (const y of [4.6, 6.4, 8.1]) m.cyl(0.55, 0.55, 0.12, GREEN, mx, y, mz, 10);
  m.cyl(0.9, 0.62, 0.22, WHITE, mx, 9.1, mz, 12); m.at(new THREE.TorusGeometry(0.86, 0.03, 4, 18), GREEN, mx, 9.75, mz, Math.PI / 2);
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; m.box(0.03, 0.55, 0.03, GREEN, mx + Math.cos(a) * 0.86, 9.48, mz + Math.sin(a) * 0.86); }
  m.cyl(0.42, 0.42, 1.0, WHITE, mx, 9.7, mz, 8);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; m.box(0.2, 0.55, 0.06, C.ink, mx + Math.cos(a) * 0.4, 9.75, mz + Math.sin(a) * 0.4, -a + Math.PI / 2); }
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.6; m.at(new THREE.ConeGeometry(0.14, 0.38, 8, 1, true), 0xe8e6e0, mx + Math.cos(a) * 0.58, 10.0, mz + Math.sin(a) * 0.58, 0, -a + Math.PI / 2, Math.PI / 2 + 0.3); }
  m.cyl(0.5, 0.5, 0.1, GREEN, mx, 10.25, mz, 10); m.at(new THREE.SphereGeometry(0.48, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dome, mx, 10.3, mz, 0, 0, 0, 1, 1.25, 1);
  m.rod([mx, 10.85, mz], [mx, 11.4, mz], 0.025, 0.025, C.gold, 4); m.at(new THREE.TorusGeometry(0.12, 0.028, 4, 10, Math.PI * 1.35), C.gold, mx, 11.5, mz, 0, 0, -Math.PI * 0.18);
  bulb(m, lamps, mx, 9.5, mz + 0.7, 0.06);
  // The wudhu wall: a tiled low wall with a row of taps over a gutter, along the hall's left side in front of the minaret.
  const wx = -hw + 0.6;
  m.box(0.2, 1.1, 2.6, 0xd7e6dc, wx, 0.55, 0.2); m.box(0.5, 0.12, 2.6, C.concrete, wx + 0.3, 0.06, 0.2);
  for (let k = 0; k < 5; k++) { const z = -0.8 + k * 0.5; m.rod([wx + 0.1, 0.85, z], [wx + 0.28, 0.85, z], 0.02, 0.02, C.steel, 4); m.rod([wx + 0.28, 0.85, z], [wx + 0.28, 0.75, z], 0.015, 0.015, C.steel, 4); }
  colBox(m, colliders, mx, mz, 0.66, 0.66); colBox(m, colliders, wx, 0.2, 0.12, 1.3);
  door(m, bx1 + 0.005, PL, bz0 + 2.1, Math.PI / 2, 0x6f4a33, 0.8, 2.0);
  spots.porch = [-1.0, 0, 1.0].map((dx) => spot(m, bcx + dx, hd - 0.35, 0, { sit: true, top: PL }));
  spots.imam = spot(m, bcx, bz0 + 0.8, Math.PI); spots.wudhu = spot(m, wx + 0.55, 0.2, -Math.PI / 2);
  return { colliders, lamps, props, spots, floor: PL, footprint: { hw, hd }, stepFeet: [{ x: bcx, z: hd + 0.55, w: 2.6 }], door: { x: bx1 + 0.6, z: bz0 + 2.1, rot: -Math.PI / 2 } };
}

// The village office (kantor desa): a long white building with a clay-tile hipped roof, a porch on square columns, louvred
// windows and green trim, a blank name board over the door; in its yard, the flagpole and a signboard on two posts.
export function kantorDesa(m, { seed = 8, yard = 3.0 } = {}) {
  const W = 7.0, BD = 4.0, PD = 1.7, D = BD + PD, hw = W / 2, hd = D / 2, PL = 0.4, H = 3.1, zb0 = -hd, zb1 = zb0 + BD, zf = hd, GREEN = 0x3f8f6a;
  const colliders = [{ x: 0, z: 0, hw, hd, rot: 0 }], lamps = [], props = [], spots = {};
  m.box(W + 0.1, PL, D + 0.05, C.concreteDk, 0, PL / 2, 0);
  for (let k = 0; k < 2; k++) m.box(2.4, PL * (1 - k) / 2 + 0.01, 0.32, C.concrete, 0, PL * (2 - k) / 4, zf + 0.16 + k * 0.3);
  m.box(W, H, BD, 0xf6f3ea, 0, PL + H / 2, zb0 + BD / 2); m.box(W + 0.03, 0.75, BD + 0.03, GREEN, 0, PL + 0.375, zb0 + BD / 2);
  tiles(m, -hw, hw, zb1, zf, PL + 0.005, 0xe8ddc8, 0xc9b49a, 0.5);
  for (const x of [-hw + 0.15, -1.2, 1.2, hw - 0.15]) pillar(m, x, zf - 0.15, PL, PL + H, C.white, 0.26);
  m.box(W, 0.25, 0.26, C.white, 0, PL + H + 0.02, zf - 0.15);
  // Double door with the name board, louvred windows (jalousie panes) left and right.
  for (const s of [-1, 1]) door(m, s * 0.48, PL, zb1 + 0.005, 0, 0x6f4a33, 0.9, 2.2, GREEN);
  m.box(2.4, 0.5, 0.06, GREEN, 0, PL + 2.95, zb1 + 0.05); m.box(2.2, 0.38, 0.02, 0xf4efe2, 0, PL + 2.95, zb1 + 0.09);
  for (const x of [-2.4, -1.5, 1.5, 2.4]) { win(m, lamps, x, PL + 1.5, zb1 + 0.01, 0, 0.7, 1.2, GREEN, false); for (let k = 0; k < 5; k++) m.box(0.62, 0.02, 0.08, 0xc9d6d8, x, PL + 1.05 + k * 0.22, zb1 + 0.06, 0, -0.5); }
  for (const s of [-1, 1]) win(m, lamps, s * (hw + 0.01), PL + 1.5, zb0 + BD / 2, s * Math.PI / 2, 0.9, 1.1, GREEN, true);
  hipRoof(m, W, D, 1.5, PL + H + 0.15, C.tile, 'tile', 0.55);
  for (const x of [-1.6, 1.6]) bulb(m, lamps, x, PL + H - 0.15, (zb1 + zf) / 2, 0.07);
  // A bench on the porch, plants.
  m.box(1.5, 0.06, 0.42, C.wood, -2.3, PL + 0.44, zb1 + 0.35); for (const s of [-1, 1]) m.box(0.06, 0.44, 0.4, C.woodDk, -2.3 + s * 0.68, PL + 0.22, zb1 + 0.35);
  pot(m, -hw + 0.4, PL, zf - 0.45, 0, 1.1); pot(m, hw - 0.4, PL, zf - 0.45, 2, 1.1); pot(m, 1.9, PL, zb1 + 0.3, 1, 1);
  // The yard: flagpole on its stepped base (front left), the signboard (front right), a planter along the front.
  const fx = -hw + 1.0, fz = zf + yard * 0.6;
  flagpole(m, colliders, fx, fz);
  for (const s of [-1, 1]) m.box(0.12, 1.9, 0.12, C.white, hw - 1.4 + s * 0.85, 0.95, zf + yard * 0.55);
  m.box(2.1, 0.9, 0.1, GREEN, hw - 1.4, 1.55, zf + yard * 0.55); m.box(1.9, 0.72, 0.02, 0xf4efe2, hw - 1.4, 1.55, zf + yard * 0.55 + 0.06);
  m.box(1.8, 0.1, 0.03, GREEN, hw - 1.4, 1.75, zf + yard * 0.55 + 0.075); m.box(1.4, 0.07, 0.03, GREEN, hw - 1.4, 1.5, zf + yard * 0.55 + 0.075);
  colRound(m, colliders, hw - 2.25, zf + yard * 0.55, 0.1); colRound(m, colliders, hw - 0.55, zf + yard * 0.55, 0.1);
  planter(m, -0.9, 0.9, zf + yard - 0.3, seed);
  spots.clerk = spot(m, -2.0, zb1 + 0.45, 0, { sit: true, top: PL + 0.47 }); spots.flag = spot(m, fx, fz + 1.4, Math.PI);
  return { colliders, lamps, props, spots, floor: PL, footprint: { hw, hd }, stepFeet: [{ x: 0, z: zf + 0.5, w: 2.4 }], door: { x: 0, z: zb1 } };
}
// The flagpole on its three-step base: a white pole, a gold ball, the halyard and a red-and-white flag that ripples.
export function flagpole(m, colliders, x, z, h = 7.0) {
  for (let k = 0; k < 3; k++) m.box(1.4 - k * 0.4, 0.15, 1.4 - k * 0.4, k % 2 ? C.white : C.concrete, x, 0.075 + k * 0.15, z);
  m.cyl(0.045, 0.065, h, C.white, x, 0.45 + h / 2, z, 8); m.sph(0.09, C.gold, x, 0.45 + h + 0.06, z, 1, 1, 1, 8, 6);
  m.rod([x + 0.06, 1.2, z], [x + 0.06, 0.45 + h, z], 0.006, 0.006, 0xe8e4da, 3);
  const fy = 0.45 + h - 0.15, FW = 1.3, FH = 0.88, N = 6, wave = (u) => Math.sin(u * 3.2) * 0.07 * u;
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N, x0 = x + 0.06 + u0 * FW, x1 = x + 0.06 + u1 * FW, z0 = z + wave(u0), z1 = z + wave(u1);
    m.quad([x0, fy - FH / 2, z0], [x1, fy - FH / 2, z1], [x1, fy, z1], [x0, fy, z0], C.red, true);
    m.quad([x0, fy - FH, z0], [x1, fy - FH, z1], [x1, fy - FH / 2, z1], [x0, fy - FH / 2, z0], 0xf7f4ec, true);
  }
  if (colliders) colRound(m, colliders, x, z, 0.7);
}

// The pos ronda: the neighbourhood watch post. A raised plank platform on four posts, half-walls at the back and sides,
// a zinc roof, the kentongan (slit drum) hanging at the front with its beater, a bulb, a chessboard, glasses and a flask.
export function posRonda(m, { seed = 9 } = {}) {
  const W = 2.6, D = 2.2, hw = W / 2, hd = D / 2, FY = 0.5, H = 2.35;
  const colliders = [{ x: 0, z: 0, hw, hd, rot: 0 }], lamps = [], props = [], spots = {};
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.12, H, 0.12, C.woodDk, sx * (hw - 0.06), H / 2, sz * (hd - 0.06));
  m.box(W, 0.08, D, C.wood, 0, FY, 0); for (let k = 1; k < 8; k++) m.box(0.015, 0.005, D, C.woodDk, -hw + (k * W) / 8, FY + 0.043, 0);
  m.box(W - 0.2, 0.12, D - 0.2, C.woodDk, 0, FY - 0.1, 0);
  m.box(W, 0.6, 0.05, C.wood, 0, FY + 0.34, -hd + 0.05); for (const s of [-1, 1]) m.box(0.05, 0.6, D, C.wood, s * (hw - 0.05), FY + 0.34, 0);
  for (let k = 0; k < 6; k++) m.box(0.01, 0.6, 0.06, C.woodDk, -hw + 0.2 + k * 0.45, FY + 0.34, -hd + 0.03);
  shedRoof(m, -hw - 0.2, hw + 0.2, -hd - 0.25, H + 0.05, hd + 0.4, H + 0.3, C.zinc);
  m.box(W + 0.1, 0.1, 0.1, C.woodDk, 0, H - 0.05, hd - 0.06);
  // Kentongan and beater, a bulb, a chessboard with pieces, two glasses and a red flask.
  const kx = hw - 0.45;
  m.rod([kx, H - 0.1, hd - 0.06], [kx, H - 0.35, hd - 0.06], 0.01, 0.01, 0xd8c08a, 3); m.cyl(0.11, 0.1, 0.62, 0x9a6a3a, kx, H - 0.68, hd - 0.06, 8); m.box(0.03, 0.42, 0.05, C.ink, kx, H - 0.68, hd + 0.04);
  m.rod([kx - 0.2, H - 0.3, hd - 0.06], [kx - 0.22, H - 0.75, hd - 0.04], 0.018, 0.018, C.woodDk, 4);
  bulb(m, lamps, -0.2, H - 0.25, 0, 0.07);
  m.box(0.36, 0.03, 0.36, 0xf4efe2, -0.4, FY + 0.06, -0.1);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) m.box(0.09, 0.005, 0.09, C.ink, -0.535 + i * 0.09, FY + 0.077, -0.235 + j * 0.09);
  for (let k = 0; k < 6; k++) m.cyl(0.015, 0.02, 0.05, k < 3 ? C.ink : 0xf4efe2, -0.5 + (k % 3) * 0.1, FY + 0.1, -0.2 + (k < 3 ? 0 : 0.25), 5);
  m.cyl(0.035, 0.03, 0.09, 0xd8eef2, 0.2, FY + 0.09, 0.1, 6); m.cyl(0.035, 0.03, 0.09, 0xd8eef2, 0.35, FY + 0.09, 0.05, 6); m.cyl(0.07, 0.07, 0.3, C.red, 0.55, FY + 0.19, -0.3, 8);
  // A blank sign on the front beam.
  m.box(0.9, 0.24, 0.04, C.blue, -0.4, H - 0.25, hd - 0.02); m.box(0.8, 0.14, 0.01, 0xf4efe2, -0.4, H - 0.25, hd + 0.005);
  spots.sit = [spot(m, -0.5, hd - 0.15, 0, { sit: true, top: FY + 0.05 }), spot(m, 0.3, hd - 0.15, 0, { sit: true, top: FY + 0.05 })];
  return { colliders, lamps, props, spots, footprint: { hw, hd } };
}

// ---- Street ------------------------------------------------------------------------------------------------------
// A straight piece of road along +x from 0 to len: asphalt, a dashed centre line, kerbs painted black and white (as on
// a main road) or plain, a concrete gutter outside each kerb, and an optional pavement of tiles beyond it. Walkable, so
// no colliders; `top` is the asphalt height. `zebra` paints a crossing in the middle.
export function road(m, { len = 10, width = 5, kerb = 'painted', gutter = true, pavement = 0, zebra = false } = {}) {
  const hw = width / 2, top = 0.06;
  m.box(len, 0.08, width, C.asphalt, len / 2, 0.02, 0);
  for (let x = 0.75; x < len - 0.5; x += 3) m.box(1.5, 0.005, 0.12, 0xf1efe6, x + 0.75, top + 0.003, 0);
  if (zebra) for (let z = -hw + 0.4; z < hw - 0.3; z += 0.6) m.box(2.2, 0.005, 0.32, 0xf1efe6, len / 2, top + 0.004, z + 0.16);
  for (const s of [-1, 1]) {
    const kz = s * (hw + 0.09);
    if (kerb === 'painted') for (let x = 0, k = 0; x < len - 1e-3; x += 1, k++) { const w = Math.min(1, len - x); m.box(w, 0.2, 0.18, k % 2 ? C.kerbK : C.kerbW, x + w / 2, 0.1, kz); }
    else if (kerb) m.box(len, 0.2, 0.18, C.concrete, len / 2, 0.1, kz);
    let z = kz + s * 0.09;
    if (gutter) { m.box(len, 0.04, 0.34, C.concreteDk, len / 2, -0.06, z + s * 0.17); m.box(len, 0.24, 0.08, C.concrete, len / 2, 0.0, z + s * 0.38); z += s * 0.42; }
    if (pavement > 0) tiles(m, 0, len, s > 0 ? z : z - pavement, s > 0 ? z + pavement : z, 0.2, 0xd8d2c4, 0xbdb5a5, 0.5);
  }
  return { colliders: [], lamps: [], props: [], spots: {}, top };
}
// A row of power poles along points [{x, y?, z}] with wires between: the poles are props (instanced), the wires one
// LineSegments from buildWires(spans). Each pole's crossarm stands square to the line.
export const POLE_ANCHORS = [[-0.75, 7.76, 0], [0, 8.02, 0], [0.75, 7.76, 0], [0, 6.1, 0.16]];
export function poleLine(points, { kind = 'pole', sag = 0.035 } = {}) {
  const props = [], spans = [];
  const heads = points.map((p, i) => { const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)]; return Math.atan2(b.x - a.x, b.z - a.z); });
  const anchors = points.map((p, i) => POLE_ANCHORS.map(([ax, ay, az]) => { const c = Math.cos(heads[i] + Math.PI / 2), s = Math.sin(heads[i] + Math.PI / 2); return [p.x + ax * c + az * s, (p.y || 0) + ay, p.z - ax * s + az * c]; }));
  points.forEach((p, i) => props.push({ kind, x: p.x, y: p.y || 0, z: p.z, ry: heads[i] + Math.PI / 2, c: 0xffffff }));
  for (let i = 0; i < points.length - 1; i++) for (let k = 0; k < POLE_ANCHORS.length; k++) spans.push({ a: anchors[i][k], b: anchors[i + 1][k], sag });
  return { props, spans, anchors };
}
// All wires in one draw: each span sags (sag x its length) in a smooth curve of `seg` straight bits.
export function buildWires(spans, { seg = 8, material = WIRE_MAT } = {}) {
  const p = [];
  for (const { a, b, sag = 0.035 } of spans) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]), dip = sag * len;
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg, q0 = L3(a, b, t0), q1 = L3(a, b, t1);
      q0[1] -= dip * 4 * t0 * (1 - t0); q1[1] -= dip * 4 * t1 * (1 - t1); p.push(...q0, ...q1);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeBoundingSphere();
  const lines = new THREE.LineSegments(g, material); lines.name = 'town-wires'; return lines;
}
// Street signs on a pole, blank of text: 'no' (red ring), 'warn' (red-bordered triangle), 'blue' (a blue panel with a
// white arrow), 'street' (a green name plate).
export function signPole(m, { kind = 'no' } = {}) {
  m.cyl(0.035, 0.035, 2.6, C.steel, 0, 1.3, 0, 6);
  const y = 2.35;
  if (kind === 'no') { m.at(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16), C.red, 0, y, 0.05, Math.PI / 2); m.at(new THREE.CylinderGeometry(0.25, 0.25, 0.035, 16), 0xf4f2ea, 0, y, 0.055, Math.PI / 2); m.box(0.4, 0.06, 0.04, C.red, 0, y, 0.07, 0, 0, 0.78); }
  else if (kind === 'warn') { m.tris([[[-0.36, y - 0.25, 0.05], [0.36, y - 0.25, 0.05], [0, y + 0.37, 0.05]]], C.red, true); m.tris([[[-0.27, y - 0.2, 0.06], [0.27, y - 0.2, 0.06], [0, y + 0.26, 0.06]]], 0xf2c03b, true); m.box(0.05, 0.2, 0.02, C.ink, 0, y, 0.07); }
  else if (kind === 'blue') { m.box(0.6, 0.6, 0.03, 0x2f6fc0, 0, y, 0.05); m.tris([[[-0.2, y - 0.04, 0.07], [0.1, y - 0.04, 0.07], [0.1, y + 0.04, 0.07]], [[-0.2, y - 0.04, 0.07], [0.1, y + 0.04, 0.07], [-0.2, y + 0.04, 0.07]], [[0.1, y - 0.15, 0.07], [0.25, y, 0.07], [0.1, y + 0.15, 0.07]]], 0xf4f2ea); }
  else { m.box(0.9, 0.22, 0.03, 0x2f8f5a, 0, y + 0.1, 0); m.box(0.84, 0.16, 0.035, 0xf4f2ea, 0, y + 0.1, 0); m.box(0.8, 0.12, 0.04, 0x2f8f5a, 0, y + 0.1, 0); }
  return { colliders: [{ x: 0, z: 0, r: 0.06 }], lamps: [], props: [], spots: {} };
}
// A bus shelter: concrete base, steel posts, a sloping blue roof, a frosted back panel, a bench, a blank sign on a post.
export function busStop(m, { seed = 10 } = {}) {
  const W = 3.2, D = 1.5, hw = W / 2, hd = D / 2;
  const colliders = [{ x: 0, z: -hd + 0.1, hw, hd: 0.15, rot: 0 }], lamps = [], props = [], spots = {};
  m.box(W + 0.3, 0.12, D + 0.2, C.concrete, 0, 0.06, 0);
  for (const sx of [-1, 1]) { m.rod([sx * (hw - 0.05), 0.1, -hd + 0.08], [sx * (hw - 0.05), 2.55, -hd + 0.08], 0.04, 0.04, C.steel, 6); m.rod([sx * (hw - 0.05), 0.1, hd - 0.1], [sx * (hw - 0.05), 2.35, hd - 0.1], 0.04, 0.04, C.steel, 6); }
  shedRoof(m, -hw - 0.15, hw + 0.15, -hd - 0.1, 2.6, hd + 0.3, 2.35, 0x3a7fc0);
  m.box(W - 0.1, 1.4, 0.03, 0xc9dde4, 0, 1.15, -hd + 0.08); m.box(W - 0.1, 0.06, 0.05, C.steel, 0, 1.87, -hd + 0.08); m.box(W - 0.1, 0.06, 0.05, C.steel, 0, 0.45, -hd + 0.08);
  m.box(0.03, 1.4, D - 0.4, 0xc9dde4, -hw + 0.05, 1.15, -0.1);
  m.box(W - 0.6, 0.06, 0.4, C.steel, 0, 0.48, -hd + 0.35); for (const s of [-1, 0, 1]) m.box(0.05, 0.4, 0.3, C.steel, s * 1.1, 0.28, -hd + 0.35);
  m.cyl(0.04, 0.04, 2.6, C.steel, hw + 0.4, 1.3, hd, 6); m.box(0.5, 0.5, 0.04, 0x2f6fc0, hw + 0.4, 2.35, hd + 0.03); m.box(0.32, 0.22, 0.045, 0xf4f2ea, hw + 0.4, 2.38, hd + 0.04);
  colRound(m, colliders, hw + 0.4, hd, 0.06);
  spots.sit = [-0.8, 0, 0.8].map((x) => spot(m, x, -hd + 0.45, 0, { sit: true, top: 0.51 }));
  return { colliders, lamps, props, spots };
}
// A small pickup (a light commercial truck, no brand): cab with windows, a flat bed with drop sides, four wheels, lights.
export function pickup(m, { color = 0xf2f0ea, cargo = true } = {}) {
  const T = 0x2a2a2c;
  for (const z of [-1.25, 1.15]) for (const s of [-1, 1]) { m.cyl(0.32, 0.32, 0.22, T, s * 0.72, 0.32, z, 12, 0, Math.PI / 2); m.cyl(0.17, 0.17, 0.23, C.steel, s * 0.72, 0.32, z, 8, 0, Math.PI / 2); }
  m.box(1.62, 0.32, 4.1, 0x3a3c40, 0, 0.5, 0);
  m.box(1.66, 0.55, 1.4, color, 0, 0.88, 1.35); m.box(1.6, 0.72, 1.15, color, 0, 1.5, 1.2);
  m.box(1.5, 0.5, 0.04, C.glass, 0, 1.55, 1.79, 0, 0.18); for (const s of [-1, 1]) m.box(0.04, 0.42, 0.85, C.glass, s * 0.81, 1.56, 1.2);
  m.box(1.7, 0.16, 0.12, 0x3a3c40, 0, 0.62, 2.06); for (const s of [-1, 1]) m.box(0.3, 0.14, 0.04, 0xfff2c8, s * 0.6, 0.98, 2.06);
  m.box(1.66, 0.12, 2.4, shade(color, 0.85), 0, 0.72, -0.85);
  for (const s of [-1, 1]) m.box(0.06, 0.45, 2.4, color, s * 0.8, 1.0, -0.85); m.box(1.66, 0.45, 0.06, color, 0, 1.0, -2.04); m.box(1.66, 0.45, 0.06, color, 0, 1.0, 0.33);
  for (const s of [-1, 1]) m.box(0.25, 0.12, 0.04, C.red, s * 0.62, 0.9, -2.08);
  if (cargo) { m.cyl(0.29, 0.29, 0.9, 0x3a7fc0, -0.4, 1.23, -1.4, 10); m.box(0.6, 0.35, 0.45, 0xb98a5e, 0.35, 0.96, -1.1); m.box(0.6, 0.35, 0.45, 0xa8794e, 0.35, 1.31, -1.15); }
  return { colliders: [{ x: 0, z: 0, hw: 0.86, hd: 2.1, rot: 0 }], lamps: [], props: [], spots: {} };
}
// A laundry line between two steel T-posts along x (len), three lines of clothes, a plastic basket.
export function laundryLine(m, { len = 4, seed = 12 } = {}) {
  const rnd = rngOf(seed), CL = [0xe8503a, 0x3a8fd0, 0xf4efe2, 0xf2c03b, 0x3f9f6a, 0xf28ab4, 0x6a5ac8, 0xe07a3a], hx = len / 2;
  for (const s of [-1, 1]) { m.rod([s * hx, 0, 0], [s * hx, 1.85, 0], 0.035, 0.035, C.steel, 6); m.rod([s * hx, 1.85, -0.45], [s * hx, 1.85, 0.45], 0.025, 0.025, C.steel, 5); }
  for (const z of [-0.4, 0, 0.4]) {
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([-hx + len * t, 1.83 - 0.18 * Math.sin(Math.PI * t), z]); }
    m.bend(pts, 0.006, 0xe8e4da, 3);
    for (let x = -hx + 0.35; x < hx - 0.3;) {
      const w = 0.35 + rnd() * 0.45, t = (x + w / 2 + hx) / len, y = 1.83 - 0.18 * Math.sin(Math.PI * t), h = 0.45 + rnd() * 0.45, c = pick(rnd, CL);
      if (rnd() < 0.35) { m.quad([x, y, z], [x + w, y, z], [x + w, y - h * 0.55, z], [x, y - h * 0.55, z], c, true); m.quad([x + w * 0.2, y - h * 0.55, z], [x + w * 0.8, y - h * 0.55, z], [x + w * 0.8, y - h, z], [x + w * 0.2, y - h, z], c, true); }
      else m.quad([x, y, z], [x + w, y, z], [x + w, y - h, z], [x, y - h, z], c, true);
      x += w + 0.08 + rnd() * 0.15;
    }
  }
  m.box(0.55, 0.25, 0.4, 0x3fb0b0, hx - 0.6, 0.125, 0.7); m.box(0.5, 0.06, 0.35, 0xf4efe2, hx - 0.6, 0.27, 0.7);
  return { colliders: [{ x: -hx, z: 0, r: 0.08 }, { x: hx, z: 0, r: 0.08 }], lamps: [], props: [], spots: {} };
}
// A triple waste bin (organic, plastic, other) on a steel frame.
export function tripleBin(m) {
  m.box(1.25, 0.06, 0.06, C.steel, 0, 0.95, 0); for (const s of [-1, 1]) m.rod([s * 0.6, 0, 0], [s * 0.6, 1.0, 0], 0.025, 0.025, C.steel, 5);
  [C.green, 0xf2c03b, C.red].forEach((c, k) => { const x = -0.38 + k * 0.38; m.cyl(0.16, 0.14, 0.55, c, x, 0.5, 0, 10); m.cyl(0.17, 0.17, 0.05, shade(c, 0.8), x, 0.79, 0, 10); });
  return { colliders: [{ x: 0, z: 0, hw: 0.62, hd: 0.2, rot: 0 }], lamps: [], props: [], spots: {} };
}
// Standalone plants for streets and yards.
export function frangipaniTree(m, { s = 1.1, seed = 1 } = {}) { frangipani(m, 0, 0, s, seed); return { colliders: [{ x: 0, z: 0, r: 0.15 }], lamps: [], props: [], spots: {} }; }
export function bougainvilleaWall(m, { len = 3, h = 1.4, seed = 2, col = PAINT.white } = {}) {
  m.box(len, h, 0.22, col, 0, h / 2, 0); m.box(len + 0.04, 0.08, 0.3, shade(col, 0.9), 0, h + 0.04, 0);
  bougainvillea(m, -len / 2 + 0.2, len / 2 - 0.2, h, 0.1, seed);
  return { colliders: [{ x: 0, z: 0, hw: len / 2, hd: 0.15, rot: 0 }], lamps: [], props: [], spots: {} };
}
export function bananaClump(m, { seed = 3 } = {}) { banana(m, 0, 0, 1, seed); banana(m, 0.7, 0.3, 0.7, seed + 2); m.leaf(0.3, C.leafDk, 0.3, 0.2, -0.2, 1.3, 0.6, 1); return { colliders: [{ x: 0, z: 0, r: 0.2 }], lamps: [], props: [], spots: {} }; }
export function potGroup(m, { seed = 4 } = {}) { const rnd = rngOf(seed); for (let k = 0; k < 4; k++) pot(m, (k % 2) * 0.45 - 0.2, 0, Math.floor(k / 2) * 0.45 - 0.2, Math.floor(rnd() * 4), 0.8 + rnd() * 0.5); return { colliders: [{ x: 0, z: 0, r: 0.45 }], lamps: [], props: [], spots: {} }; }
export function planterBox(m, { len = 2.4, seed = 5 } = {}) { planter(m, -len / 2, len / 2, 0, seed); return { colliders: [{ x: 0, z: 0, hw: len / 2, hd: 0.25, rot: 0 }], lamps: [], props: [], spots: {} }; }
export function lowFence(m, { len = 6, gate = null, col = C.white } = {}) { const cols = []; m.push(-len / 2, 0, 0); fenceRun(m, cols, len, { col, gate: gate ? [len / 2 - gate / 2, len / 2 + gate / 2] : null }); m.pop(); return { colliders: cols, lamps: [], props: [], spots: {} }; }

// ---- Props: repeated small things, drawn instanced (one draw per kind) ------------------------------------------
// Each is built white where the instance colour should show (InstancedMesh.setColorAt multiplies), dark parts stay dark.
const PROTO_BUILD = {
  motorbike(m) {
    const T = 0x2a2a2c, G = 0x9aa0a4;
    for (const z of [-0.62, 0.6]) { m.cyl(0.24, 0.24, 0.1, T, 0, 0.24, z, 12, 0, Math.PI / 2); m.cyl(0.11, 0.11, 0.11, G, 0, 0.24, z, 8, 0, Math.PI / 2); }
    m.box(0.3, 0.08, 0.62, 0x4a4a4e, 0, 0.32, 0.0);
    m.sph(0.5, 0xffffff, 0, 0.56, -0.42, 0.36, 0.4, 0.9, 10, 7);
    m.box(0.27, 0.09, 0.64, 0x3a3330, 0, 0.84, -0.36); m.box(0.08, 0.05, 0.3, G, 0, 0.86, -0.82);
    m.box(0.44, 0.64, 0.1, 0xffffff, 0, 0.62, 0.3, 0, -0.22);
    m.sph(0.3, 0xffffff, 0, 0.47, 0.6, 0.45, 0.25, 1.0, 8, 5);
    m.rod([0, 0.24, 0.6], [0, 1.0, 0.42], 0.035, 0.035, G, 5);
    m.box(0.64, 0.05, 0.06, 0x3a3a3e, 0, 1.03, 0.38); m.box(0.26, 0.17, 0.18, 0xffffff, 0, 1.0, 0.45);
    m.sph(0.07, 0xfff4d0, 0, 1.0, 0.55, 1, 0.8, 0.5, 8, 6); m.box(0.12, 0.06, 0.04, 0xd9463a, 0, 0.72, -0.86);
    for (const s of [-1, 1]) { m.rod([s * 0.24, 1.04, 0.36], [s * 0.3, 1.26, 0.36], 0.01, 0.01, G, 3); m.box(0.1, 0.07, 0.02, G, s * 0.3, 1.28, 0.36); }
    m.rod([0.1, 0.3, -0.1], [0.22, 0.02, -0.2], 0.015, 0.015, G, 3);
  },
  chair(m) { // a monobloc plastic chair
    m.box(0.44, 0.04, 0.42, 0xffffff, 0, 0.45, 0); m.box(0.42, 0.4, 0.04, 0xffffff, 0, 0.68, -0.2, 0, -0.12);
    for (const s of [-1, 1]) { m.box(0.04, 0.04, 0.4, 0xffffff, s * 0.21, 0.62, -0.02); for (const t of [-1, 1]) m.box(0.05, 0.46, 0.05, 0xffffff, s * 0.2, 0.22, t * 0.18, 0, t * 0.08, -s * 0.06); }
  },
  table(m) { m.box(0.8, 0.04, 0.8, 0xffffff, 0, 0.72, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.05, 0.72, 0.05, 0xffffff, sx * 0.34, 0.36, sz * 0.34); },
  cafeChair(m) {
    m.box(0.42, 0.04, 0.4, 0xb98a5e, 0, 0.62, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.04, 0.62, 0.04, 0x2c2d31, sx * 0.18, 0.31, sz * 0.17);
    m.box(0.42, 0.3, 0.03, 0xb98a5e, 0, 0.95, -0.19); for (const s of [-1, 1]) m.box(0.03, 0.4, 0.03, 0x2c2d31, s * 0.18, 0.85, -0.19); m.box(0.42, 0.03, 0.03, 0x2c2d31, 0, 0.75, -0.17);
  },
  cafeTable(m) { m.cyl(0.38, 0.38, 0.04, 0xc99a6a, 0, 0.92, 0, 14); m.cyl(0.03, 0.03, 0.9, 0x2c2d31, 0, 0.46, 0, 6); m.cyl(0.22, 0.25, 0.04, 0x2c2d31, 0, 0.02, 0, 10); m.cyl(0.05, 0.05, 0.07, 0xf4efe2, 0.1, 0.97, 0.05, 8); },
  drum(m) { m.cyl(0.29, 0.29, 0.9, 0xffffff, 0, 0.45, 0, 12); for (const y of [0.3, 0.6]) m.cyl(0.3, 0.3, 0.04, 0xe8e8e8, 0, y, 0, 12); m.cyl(0.3, 0.3, 0.03, 0xdddddd, 0, 0.9, 0, 12); m.cyl(0.04, 0.04, 0.04, 0xdddddd, 0.15, 0.93, 0.05, 6); },
  bin(m) { m.cyl(0.24, 0.2, 0.72, 0xffffff, 0, 0.36, 0, 10); m.sph(0.25, 0xeeeeee, 0, 0.72, 0, 1, 0.35, 1, 10, 5); m.box(0.12, 0.03, 0.04, 0x2c2d31, 0, 0.82, 0); },
  pole(m) { // a spun-concrete power pole with crossarm, insulators, a cable clamp, step bolts, a tag
    m.cyl(0.1, 0.16, 7.95, 0xcbc6bc, 0, 3.975, 0, 8); m.box(1.8, 0.1, 0.1, 0x8a8f94, 0, 7.6, 0);
    for (const x of [-0.75, 0.75]) m.cyl(0.045, 0.06, 0.16, 0xe8e2d4, x, 7.7, 0, 6); m.cyl(0.045, 0.06, 0.12, 0xe8e2d4, 0, 7.98, 0, 6);
    for (const s of [-1, 1]) m.rod([s * 0.55, 7.55, 0], [0, 7.15, 0], 0.02, 0.02, 0x8a8f94, 4);
    m.box(0.14, 0.12, 0.2, 0x5a5f64, 0, 6.1, 0.12); m.box(0.16, 0.22, 0.02, 0xf2c03b, 0, 2.6, 0.13);
    for (let k = 0; k < 6; k++) m.box(0.2, 0.03, 0.03, 0x8a8f94, 0, 3.0 + k * 0.45, 0, (k % 2) * Math.PI / 2);
  },
  streetLight(m) { // a grey pole whose arm reaches out over +z to a flat head; its glass glows
    m.box(0.3, 0.3, 0.3, C.concrete, 0, 0.15, 0); m.cyl(0.06, 0.09, 6.4, 0x9aa3a8, 0, 3.4, 0, 8);
    m.bend([[0, 6.5, 0], [0, 6.75, 0.35], [0, 6.85, 1.2]], 0.045, 0x9aa3a8, 6); m.box(0.3, 0.13, 0.6, 0x8a9398, 0, 6.85, 1.45);
    m.glowBox(0.22, 0.03, 0.46, 0, 6.775, 1.45);
  },
};
export const PROP_COLLIDE = { motorbike: { hw: 0.22, hd: 0.85 }, chair: { r: 0.24 }, table: { r: 0.45 }, cafeChair: { r: 0.22 }, cafeTable: { r: 0.38 }, drum: { r: 0.3 }, bin: { r: 0.26 }, pole: { r: 0.16 }, streetLight: { r: 0.18 } };
export const STREETLIGHT_HEAD = { x: 0, y: 6.75, z: 1.45 }; // a streetlight's lamp in its own frame (for the night glow / lamp spots)
const protoCache = new Map();
export function propGeometry(kind) {
  if (!protoCache.has(kind)) {
    const m = new Mesher(7); m.frame(); PROTO_BUILD[kind](m);
    const mesh = m.build(), glow = m.buildGlow();
    bakeAO(mesh.geometry, { ground: 0 });
    protoCache.set(kind, { geo: mesh.geometry, glow: glow ? glow.geometry : null });
  }
  return protoCache.get(kind);
}
// One InstancedMesh per kind (plus one for the kinds that glow) from a list of { kind, x, y, z, ry, c, s?, roll? }.
export function instanceProps(list, { material = TOWN_MAT, glowMaterial = TOWN_GLOW_MAT, y0 = 0 } = {}) {
  const byKind = new Map(), out = [], dummy = new THREE.Object3D(), col = new THREE.Color();
  for (const p of list) { if (!byKind.has(p.kind)) byKind.set(p.kind, []); byKind.get(p.kind).push(p); }
  for (const [kind, items] of byKind) {
    const { geo, glow } = propGeometry(kind);
    const parts = [[geo, material, true]]; if (glow) parts.push([glow, glowMaterial, false]);
    for (const [g, mat, lit] of parts) {
      const im = new THREE.InstancedMesh(g, mat, items.length); im.name = `town-${kind}${lit ? '' : '-glow'}`;
      items.forEach((it, i) => {
        dummy.position.set(it.x, (it.y || 0) + y0, it.z); dummy.rotation.set(0, it.ry || 0, kind === 'motorbike' ? 0.09 : it.roll || 0, 'YXZ'); dummy.scale.setScalar(it.s || 1); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix); if (lit) im.setColorAt(i, col.setHex(it.c ?? 0xffffff));
      });
      im.castShadow = lit; im.receiveShadow = lit; im.computeBoundingSphere(); out.push(im);
    }
  }
  return out;
}
// Colliders for a prop list (in whatever frame the list is in).
export function propColliders(list) {
  return list.filter((p) => PROP_COLLIDE[p.kind]).map((p) => { const c = PROP_COLLIDE[p.kind]; return c.r !== undefined ? { x: p.x, z: p.z, r: c.r * (p.s || 1) } : { x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: p.ry || 0 }; });
}

// ---- Whole-model wrappers (previews and one-offs): ONE welded mesh with baked AO, its glow, its props instanced ----
function wrap(fn, opts) {
  const m = new Mesher((opts && opts.seed) || 1); m.frame();
  const meta = fn(m, opts || {}) || {}, group = new THREE.Group();
  const mesh = m.build(); if (mesh) { bakeAO(mesh.geometry, { ground: 0 }); mesh.name = 'town-model'; group.add(mesh); }
  const glow = m.buildGlow(); if (glow) { glow.name = 'town-glow'; group.add(glow); }
  if (meta.props && meta.props.length) for (const im of instanceProps(meta.props)) group.add(im);
  return { colliders: [], lamps: [], props: [], spots: {}, ...meta, group };
}
export const buildHouse = (opts = {}) => wrap(house, opts);
export const buildRuko = (opts = {}) => wrap(ruko, opts);
export const buildWarung = (opts = {}) => wrap(warung, opts);
export const buildMinimarket = (opts = {}) => wrap(minimarket, opts);
export const buildCafe = (opts = {}) => wrap(cafe, opts);
export const buildBengkel = (opts = {}) => wrap(bengkel, opts);
export const buildMosque = (opts = {}) => wrap(mosque, opts);
export const buildKantorDesa = (opts = {}) => wrap(kantorDesa, opts);
export const buildPosRonda = (opts = {}) => wrap(posRonda, opts);
export const buildRoad = (opts = {}) => wrap(road, opts);
export const buildBusStop = (opts = {}) => wrap(busStop, opts);
export const buildPickup = (opts = {}) => wrap(pickup, opts);
export const buildLaundryLine = (opts = {}) => wrap(laundryLine, opts);
export const buildSignPole = (opts = {}) => wrap(signPole, opts);
export const buildTripleBin = (opts = {}) => wrap(tripleBin, opts);
export const buildFrangipani = (opts = {}) => wrap(frangipaniTree, opts);
export const buildBougainvilleaWall = (opts = {}) => wrap(bougainvilleaWall, opts);
export const buildBananaClump = (opts = {}) => wrap(bananaClump, opts);
export const buildPotGroup = (opts = {}) => wrap(potGroup, opts);
export const buildPlanter = (opts = {}) => wrap(planterBox, opts);
export const buildLowFence = (opts = {}) => wrap(lowFence, opts);
export const buildFlagpole = () => wrap((m) => { const cols = []; flagpole(m, cols, 0, 0); return { colliders: cols }; });
export const buildHouse1 = () => buildHouse({ variant: 1 });
export const buildHouse3 = () => buildHouse({ variant: 3 });
export const buildRuko3 = () => buildRuko({ floors: 3, units: [{ front: 'closed', paint: PAINT.sky, sign: C.blue, accent: 0xf4efe2, awning: C.zinc }, { front: 'glass', paint: PAINT.white, sign: C.red, accent: 0xf2c03b, awning: 0x3a7fc0 }, { front: 'open', paint: PAINT.yellow, sign: C.green, accent: 0xf4efe2, awning: 0xd9463a }] });

// ---- Preview scenes (kit.html?kit=town&fn=townStreet, townCivic, townProps or townLineup; ?townkit is townLineup) -----
// Built the way the village should be: each model in its own Mesher frame with its own baked AO (a fine crease grid
// per piece), all pieces welded into ONE mesh plus ONE glow mesh, props pooled into one InstancedMesh per kind, all
// wires in one LineSegments. The tab title shows draw calls and triangles.
function scene(build) {
  const geos = [], glows = [], props = [], spans = [];
  const put = (fn, x, z, ry, opts) => {
    const m = new Mesher(geos.length + 1); m.frame(x, 0, z, ry);
    const meta = fn(m, opts || {}) || {}, mesh = m.build(), glow = m.buildGlow();
    if (mesh) { bakeAO(mesh.geometry, { ground: 0 }); geos.push(mesh.geometry); }
    if (glow) glows.push(glow.geometry);
    const c = Math.cos(ry), s = Math.sin(ry); // the model's frame to the scene's (as hamlet.js toW)
    for (const p of meta.props || []) props.push({ ...p, x: x + p.x * c + p.z * s, z: z - p.x * s + p.z * c, ry: (p.ry || 0) + ry });
    return meta;
  };
  build({ put, props, spans });
  const group = new THREE.Group(), mesh = new THREE.Mesh(mergeGeometries(geos), TOWN_MAT);
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  if (glows.length) group.add(new THREE.Mesh(mergeGeometries(glows), TOWN_GLOW_MAT));
  for (const im of instanceProps(props)) group.add(im);
  if (spans.length) group.add(buildWires(spans));
  return { group };
}
// A street of shophouses facing a row of houses, the road between with poles, wires, streetlights and scooters.
export function townStreet() {
  return scene(({ put, props, spans }) => {
    put(road, -24, 0, 0, { len: 48, width: 6, pavement: 1.4 });
    put(ruko, -10, -9.0, 0, {}); put(ruko, 4.0, -9.0, 0, { floors: 3, units: [{ front: 'closed', paint: PAINT.sky, sign: C.blue, accent: 0xf4efe2, awning: C.zinc }, { front: 'glass', paint: PAINT.white, sign: C.red, accent: 0xf2c03b, awning: 0x3a7fc0 }] });
    put(warung, 15, -8.5, 0); put(minimarket, -22, -9.5, 0);
    [0, 1, 2, 3].forEach((v, i) => put(house, -18 + i * 8, 9.6, Math.PI, { variant: v, seed: i + 1 }));
    const line = poleLine([-22, -11, 0, 11, 22].map((x) => ({ x, z: -4.6 }))); props.push(...line.props); spans.push(...line.spans);
    for (const x of [-16, -3, 9, 20]) props.push({ kind: 'streetLight', x, z: 4.7, ry: Math.PI, c: 0xffffff });
    [[-8, -2.0, 0], [-6.8, -2.0, 0], [6, 2.0, Math.PI], [12, -2.1, 0]].forEach(([x, z, r], i) => props.push({ kind: 'motorbike', x, z, ry: r + Math.PI / 2, c: [C.red, C.ink, C.blue, 0xf4efe2][i] }));
    put(pickup, -14, 1.6, Math.PI / 2, { color: 0xf2f0ea });
    for (const [x, z] of [[18, 4.6], [-2, 4.6]]) props.push({ kind: 'bin', x, z, ry: 0, c: C.green });
  });
}
// The civic and corner buildings: mosque, kantor desa with its flagpole, pos ronda, café, bengkel, bus stop.
export function townCivic() {
  return scene(({ put, props }) => {
    put(road, -22, 0, 0, { len: 44, width: 5.5, kerb: 'plain', pavement: 0 });
    put(mosque, -14, -7.5, 0); put(kantorDesa, -3, -8.5, 0); put(posRonda, 5.5, -4.6, 0); put(cafe, 13, -6.5, 0);
    put(bengkel, -12, 7.5, Math.PI); put(busStop, -3, 4.2, Math.PI); put(house, 6, 8.5, Math.PI, { variant: 4, seed: 4 }); put(house, 15, 8.5, Math.PI, { variant: 5, seed: 6 });
    for (const x of [-18, -7, 4, 15]) props.push({ kind: 'streetLight', x, z: -3.6, ry: 0, c: 0xffffff });
  });
}
// Street furniture, props and plants, close up.
export function townProps() {
  return scene(({ put, props }) => {
    put(road, -8, -3, 0, { len: 16, width: 4.5, zebra: true, pavement: 1.0 });
    put(signPole, -6, 1.2, 0, { kind: 'no' }); put(signPole, -4.8, 1.2, 0, { kind: 'warn' }); put(signPole, -3.6, 1.2, 0, { kind: 'blue' }); put(signPole, -2.4, 1.2, 0, { kind: 'street' });
    put(tripleBin, -0.6, 1.4, 0); put(laundryLine, 3.0, 2.2, 0, { len: 3.6 }); put(pickup, 6.5, -3, Math.PI / 2);
    put(frangipaniTree, -6.5, 4.6, 0); put(bougainvilleaWall, -3.0, 5.0, 0, { len: 3.2 }); put(bananaClump, 0.2, 4.6, 0); put(potGroup, 1.8, 4.8, 0); put(planterBox, 4.6, 5.0, 0); put(posRonda, 7.8, 4.6, Math.PI);
    put(lowFence, -3.0, 7.0, 0, { len: 6, gate: 1.4 });
    [['motorbike', -6, -1.3, 1.6, C.red], ['motorbike', -4.8, -1.3, 1.5, C.blue], ['chair', 1.0, 0.6, 0.3, C.red], ['chair', 1.6, 0.7, -0.4, C.blue], ['table', 1.3, -0.2, 0, 0xf4efe2], ['drum', 3.2, -0.6, 0, 0x3a7fc0], ['drum', 3.8, -0.4, 0, 0x3a7fc0], ['bin', 5.0, 0.6, 0, C.green],
      ['cafeTable', -1.4, -0.4, 0, 0xffffff], ['cafeChair', -1.9, -0.4, Math.PI / 2, 0xffffff], ['pole', -7.5, 1.6, 0, 0xffffff], ['streetLight', 6.5, 1.6, Math.PI, 0xffffff]].forEach(([kind, x, z, ry, c]) => props.push({ kind, x, z, ry, c }));
  });
}
export function townLineup() {
  const g = new THREE.Group();
  const a = townStreet().group, b = townCivic().group, c = townProps().group;
  b.position.z = -34; c.position.z = 30; g.add(a, b, c);
  return { group: g };
}
