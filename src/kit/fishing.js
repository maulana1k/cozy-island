// INTERNAL. The fishing waterfront's things, built from code (src/world/areas/waterfront.js places them):
// jukung outrigger boats with painted hulls, market stalls with cloth or tin awnings and tables of fish on ice,
// net-drying racks, a boat on trestles, the fishermen's shelter, Old Darto's hut, a tide board, and piles of
// crates, buoys, oars and baskets.
//
// Everything is drawn with ONE vertex-coloured flat material: a builder writes its pieces into a Mesher (below)
// in its own frame, and the Mesher welds whatever it holds into one mesh. Lantern glass goes to a second list
// (`glow`) so it can light up at night. Units are metres; a model's +z is its front (a boat's bow, a stall's
// counter side), y = 0 is the ground (or a boat's keel).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flat } from '../world/build.js';

export const FLAT_MAT = flat(0xffffff, { vertexColors: true });

// ---- The Mesher: any number of pieces in a movable frame -> one vertex-coloured mesh ----------------------
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
export class Mesher {
  constructor() { this.list = []; this.glow = []; this.base = new THREE.Matrix4(); this.stack = []; }
  // The frame the next pieces are given in: a spot, a heading (0 faces +z), and a tilt (pitch about x, roll about z).
  frame(x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0) { this.base.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')), _s.set(1, 1, 1)); return this; }
  // A frame inside the current one (for a part of a model), undone by pop().
  push(x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0, sc = 1) {
    this.stack.push(this.base.clone());
    this.base.multiply(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')), _s.set(sc, sc, sc)));
    return this;
  }
  pop() { this.base.copy(this.stack.pop()); return this; }
  add(geo, hex, local, glow = false) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(local ? _m.multiplyMatrices(this.base, local) : this.base);
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    (glow ? this.glow : this.list).push(g);
  }
  at(geo, hex, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, glow = false) {
    this.add(geo, hex, new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)), glow);
  }
  box(w, h, d, hex, x, y, z, ry = 0, rx = 0, rz = 0) { this.at(new THREE.BoxGeometry(w, h, d), hex, x, y, z, rx, ry, rz); }
  cyl(r0, r1, h, hex, x, y, z, seg = 8, rx = 0, rz = 0, ry = 0) { this.at(new THREE.CylinderGeometry(r0, r1, h, seg), hex, x, y, z, rx, ry, rz); }
  sph(r, hex, x, y, z, sx = 1, sy = 1, sz = 1, w = 7, h = 5, ry = 0) { this.at(new THREE.SphereGeometry(r, w, h), hex, x, y, z, 0, ry, 0, sx, sy, sz); }
  glowBall(r, x, y, z) { this.at(new THREE.IcosahedronGeometry(r, 0), 0xffffff, x, y, z, 0, 0, 0, 1, 1, 1, true); }
  // A tapered rod between two local points.
  rod(a, b, r0, r1 = r0, hex = 0x8c6444, n = 5) {
    const pa = new THREE.Vector3(...a), pb = new THREE.Vector3(...b), len = Math.max(pa.distanceTo(pb), 1e-4);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, pb.clone().sub(pa).normalize());
    this.add(new THREE.CylinderGeometry(r1, r0, len, n, 1), hex, new THREE.Matrix4().compose(pa.add(pb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  }
  // A bent rod through several points.
  bend(pts, r, hex, n = 5) { for (let i = 0; i < pts.length - 1; i++) this.rod(pts[i], pts[i + 1], r, r, hex, n); }
  // Raw triangles [[a, b, c], ...] in local space; `both` adds the back faces too (sails, cloth).
  tris(list, hex, both = false) {
    const p = [];
    for (const [a, b, c] of list) { p.push(...a, ...b, ...c); if (both) p.push(...a, ...c, ...b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals();
    this.add(g, hex);
  }
  quad(a, b, c, d, hex, both = false) { this.tris([[a, b, c], [a, c, d]], hex, both); }
  build(material = FLAT_MAT, cast = true) {
    if (!this.list.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(this.list), material); mesh.castShadow = cast; mesh.receiveShadow = true;
    this.list = []; return mesh;
  }
  buildGlow(material) {
    if (!this.glow.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(this.glow), material); mesh.castShadow = false; mesh.receiveShadow = false;
    this.glow = []; return mesh;
  }
}

// ---- Palette ---------------------------------------------------------------------------------------------
export const COL = {
  bamboo: 0xcdb26a, bambooDk: 0xa88f4c, wood: 0xb98a5e, woodDk: 0x8c6444, woodGrey: 0x9c8b78, plank: 0xc79d6e,
  rope: 0xd8c08a, thatch: 0xc9a25a, thatchDk: 0xa8803f, cream: 0xf4efe2, white: 0xf7f5ee, ink: 0x2f2826,
  net: 0x8fae8c, netOr: 0xe0884a, netBlue: 0x6f9fc0, ice: 0xe2f4f6, iceBlue: 0xbfe2ea,
  tin: 0xa9b8bb, tinRust: 0xb98a6a, sand: 0xe9d3a0, iron: 0x5c5a58,
};
// Hull paint: [body, stripe, bottom].
export const HULLS = [
  [0x2f7fc9, 0xf2c03b, 0xf4efe2], [0xd9463a, 0xf4efe2, 0x2f6fa8], [0xf2c03b, 0x2f7fc9, 0xd9463a], [0x3f9f6a, 0xf4efe2, 0xe8503a],
  [0xf4efe2, 0xd9463a, 0x2f7fc9], [0x3fb0b0, 0xf2c03b, 0xf4efe2], [0x5b6fe0, 0xf4efe2, 0xf2c03b], [0xe07a3a, 0x2f7fc9, 0xf4efe2],
];
const SAILS = [[0xe8503a, 0xf2c03b], [0xf4efe2, 0xe8503a], [0xf2b63b, 0x3f9f6a], [0x5b6fe0, 0xf4efe2]];
const FISH = [0xb8c6d2, 0x5f86a8, 0xe0705a, 0xf0c050, 0x3e5068, 0xc9b8a8, 0x8fb0a0];

// ---- Fish ------------------------------------------------------------------------------------------------
// One fish lying on its side along local x: a body, a tail, a darker back. `k` picks the kind.
export function fish(m, x, y, z, ry, len = 0.32, k = 0) {
  const c = FISH[k % FISH.length], back = new THREE.Color(c).multiplyScalar(0.72).getHex(), tall = k % 3 === 2 ? 0.34 : 0.24;
  m.at(new THREE.SphereGeometry(0.5, 7, 4), c, x, y + len * 0.07, z, 0, ry, 0, len, len * tall, len * 0.13);
  const tx = x - Math.cos(ry) * len * 0.55, tz = z + Math.sin(ry) * len * 0.55;
  m.at(new THREE.ConeGeometry(len * 0.17, len * 0.26, 3), back, tx, y + len * 0.07, tz, 0, ry, Math.PI / 2, 1, 1, 0.35);
  m.at(new THREE.SphereGeometry(0.5, 5, 3), back, x, y + len * 0.12, z, 0, ry, 0, len * 0.7, len * tall * 0.45, len * 0.1);
}
// A heap of fish over a round of radius r (on ice, in a basket or a tray), `n` of them.
function fishHeap(m, x, y, z, r, n, kinds, seed) {
  for (let i = 0; i < n; i++) {
    const a = seed * 2.3 + i * 2.39996, rr = r * Math.sqrt((i + 0.5) / n) * 0.8, len = 0.22 + ((seed + i * 7) % 5) * 0.035;
    fish(m, x + Math.cos(a) * rr, y + (i % 3) * 0.018, z + Math.sin(a) * rr, a * 1.7 + i, len, kinds[(i + seed) % kinds.length]);
  }
}
export function basket(m, x, y, z, r = 0.28, fishKinds = null, seed = 0) {
  m.cyl(r, r * 0.78, r * 0.75, 0xc9a25a, x, y + r * 0.375, z, 9); m.cyl(r * 1.03, r * 1.03, 0.04, COL.woodDk, x, y + r * 0.75, z, 9);
  m.cyl(r * 0.9, r * 0.9, 0.02, 0x6b4a33, x, y + r * 0.7, z, 9);
  if (fishKinds) fishHeap(m, x, y + r * 0.72, z, r, 6, fishKinds, seed);
}
// A shallow round tray (tampah) of fish.
function tray(m, x, y, z, r, kinds, seed) { m.cyl(r, r * 0.92, 0.06, 0xd8b878, x, y + 0.03, z, 10); fishHeap(m, x, y + 0.06, z, r, 7, kinds, seed); }
// An ice box (a white cooler, blue lid propped open behind) full of ice and fish, along local x.
export function iceBox(m, x, y, z, ry = 0, seed = 0, w = 0.66) {
  m.push(x, y, z, ry);
  m.box(w, 0.34, 0.42, COL.white, 0, 0.17, 0); m.box(w + 0.02, 0.04, 0.44, 0x3a8fd0, 0, 0.02, 0);
  m.box(w - 0.06, 0.02, 0.36, COL.ice, 0, 0.33, 0);
  m.box(w, 0.05, 0.42, 0x3a8fd0, 0, 0.42, -0.26, 0, -1.25); // the lid, propped open behind
  for (let i = 0; i < 4; i++) fish(m, -w * 0.32 + i * w * 0.21, 0.335, (i % 2 ? 0.07 : -0.06), 0.15 * (i % 2 ? 1 : -1), 0.26 + (i % 2) * 0.05, (seed + i) % 7);
  m.pop();
}
export function crate(m, x, y, z, ry = 0, hex = COL.wood, s = 1, full = null, seed = 0) {
  m.push(x, y, z, ry, 0, 0, s);
  m.box(0.6, 0.06, 0.4, hex, 0, 0.03, 0);
  for (const yy of [0.1, 0.22]) { m.box(0.6, 0.08, 0.03, hex, 0, yy, 0.19); m.box(0.6, 0.08, 0.03, hex, 0, yy, -0.19); m.box(0.03, 0.08, 0.4, hex, 0.29, yy, 0); m.box(0.03, 0.08, 0.4, hex, -0.29, yy, 0); }
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.18, 0.18]) m.box(0.04, 0.28, 0.04, new THREE.Color(hex).multiplyScalar(0.8).getHex(), sx, 0.14, sz);
  if (full) fishHeap(m, 0, 0.2, 0, 0.26, 6, full, seed);
  m.pop();
}
// A blue plastic fish crate (keranjang).
export function plasticCrate(m, x, y, z, ry = 0, hex = 0x3a7fc0, full = null, seed = 0) {
  m.push(x, y, z, ry);
  m.box(0.58, 0.04, 0.4, hex, 0, 0.02, 0);
  for (const s of [-1, 1]) { m.box(0.58, 0.24, 0.03, hex, 0, 0.14, s * 0.19); m.box(0.03, 0.24, 0.4, hex, s * 0.28, 0.14, 0); }
  m.box(0.6, 0.03, 0.42, new THREE.Color(hex).multiplyScalar(0.8).getHex(), 0, 0.27, 0);
  if (full) fishHeap(m, 0, 0.18, 0, 0.25, 6, full, seed);
  m.pop();
}
export function bucket(m, x, y, z, hex = 0x4f9aa6, water = true) {
  m.cyl(0.16, 0.12, 0.3, hex, x, y + 0.15, z, 8);
  if (water) m.cyl(0.145, 0.145, 0.01, 0x7fb7c0, x, y + 0.27, z, 8);
  m.rod([x - 0.15, y + 0.3, z], [x, y + 0.42, z], 0.008, 0.008, COL.iron, 3); m.rod([x, y + 0.42, z], [x + 0.15, y + 0.3, z], 0.008, 0.008, COL.iron, 3);
}
export function ropeCoil(m, x, y, z, r = 0.24, hex = COL.rope) {
  for (let i = 0; i < 3; i++) m.at(new THREE.TorusGeometry(r - i * 0.05, 0.035, 4, 12), hex, x, y + 0.04 + i * 0.05, z, Math.PI / 2, 0, 0);
}
export function buoy(m, x, y, z, hex = 0xf2873a, r = 0.18) { m.sph(r, hex, x, y + r * 0.9, z, 1, 0.9, 1, 7, 5); m.cyl(0.02, 0.02, 0.12, COL.ink, x, y + r * 1.8, z, 4); }
export function jerryCan(m, x, y, z, ry = 0, hex = 0xe8b03a) { m.box(0.3, 0.42, 0.16, hex, x, y + 0.21, z, ry); m.cyl(0.03, 0.03, 0.06, COL.ink, x, y + 0.45, z, 5); }
// A paddle, lying or leaning: from a (grip) to b (blade end).
export function paddle(m, a, b, hex = COL.woodDk) {
  m.rod(a, b, 0.022, 0.022, hex, 5);
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz);
  const p = [b[0] - dx / l * 0.25, b[1] - dy / l * 0.25, b[2] - dz / l * 0.25];
  const g = new THREE.BoxGeometry(0.16, 0.5, 0.02), q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dx, dy, dz).normalize());
  m.add(g, new THREE.Color(hex).multiplyScalar(1.15).getHex(), new THREE.Matrix4().compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1)));
}
// A lantern hanging at (x, y, z) (y is the hook): a cap, a glowing glass (night glow) and a base.
export function lantern(m, x, y, z, glowOut) {
  m.rod([x, y, z], [x, y - 0.14, z], 0.006, 0.006, COL.ink, 3);
  m.cyl(0.03, 0.09, 0.07, COL.ink, x, y - 0.17, z, 6); m.cyl(0.075, 0.075, 0.03, COL.ink, x, y - 0.38, z, 6);
  m.cyl(0.065, 0.065, 0.17, 0xfff1cf, x, y - 0.29, z, 6);
  if (glowOut) glowOut.push({ x, y: y - 0.29, z });
}
// A painted signboard on its own post, or (post = 0) hung flat: a coloured board with a border and a fish shape.
export function signboard(m, x, y, z, ry, w = 0.9, h = 0.4, hex = 0x3f8fbf, post = 1.4) {
  m.push(x, y, z, ry);
  if (post) { m.rod([0, 0, 0], [0, post, 0], 0.035, 0.03, COL.woodDk, 5); }
  const by = post ? post + h / 2 - 0.05 : 0;
  m.box(w + 0.06, h + 0.06, 0.03, COL.cream, 0, by, 0.0); m.box(w, h, 0.04, hex, 0, by, 0.01);
  // a fish painted on it (both faces)
  for (const s of [1, -1]) {
    m.at(new THREE.SphereGeometry(0.5, 6, 3), COL.cream, -w * 0.12, by, s * 0.035, 0, 0, 0, w * 0.4, h * 0.42, 0.01);
    m.at(new THREE.ConeGeometry(h * 0.22, w * 0.16, 3), COL.cream, w * 0.16, by, s * 0.035, 0, 0, -Math.PI / 2, 1, 1, 0.1);
    m.box(w * 0.18, 0.035, 0.01, COL.white, w * 0.32, by + h * 0.18, s * 0.035); m.box(w * 0.14, 0.035, 0.01, COL.white, w * 0.32, by - h * 0.05, s * 0.035);
  }
  m.pop();
}

// ---- The jukung: a slender painted dugout with bamboo outriggers --------------------------------------------
// Keel at y = 0, bow toward +z. opts: hull [body, stripe, bottom], sail (index or -1), outriggers, gear (net heap,
// paddles), len. Floats at about y = 0.15 (the waterline on the hull). Returns the seat height for a sitter.
export const JUKUNG = { len: 5.6, seatY: 0.26, seats: [-1.0, 0.75], waterline: 0.16, rig: 1.95 };
export function jukung(m, { hull = HULLS[0], sail = -1, outriggers = true, gear = true, len = JUKUNG.len, anchor = false } = {}) {
  const [body, stripe, bottom] = hull, N = 16, W = 0.4, H = 0.52;
  const wd = (t) => W * Math.pow(Math.max(0, 1 - Math.abs(2 * t - 1) ** 2.4), 0.6);
  const ky = (t) => 0.14 * Math.abs(2 * t - 1) ** 3, gy = (t) => H + 0.42 * Math.abs(2 * t - 1) ** 4;
  const F = [1, 0.62, 0.24, 0, 0.24, 0.62, 1], X = [-1, -0.94, -0.66, 0, 0.66, 0.94, 1];
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -len / 2 + len * t, w = wd(t), k = ky(t), g = gy(t);
    rings.push(F.map((f, j) => [X[j] * w, k + (g - k) * f, z]));
  }
  const band = (j0, j1, hex, inner = false) => {
    const tr = [];
    for (let i = 0; i < N; i++) for (let j = j0; j < j1; j++) {
      const a = rings[i][j], b = rings[i][j + 1], c = rings[i + 1][j + 1], d = rings[i + 1][j];
      if (inner) { const s = (p) => [p[0] * 0.86, p[1] + 0.05, p[2]]; tr.push([s(a), s(c), s(b)], [s(a), s(d), s(c)]); } else tr.push([a, b, c], [a, c, d]);
    }
    m.tris(tr, hex);
  };
  band(2, 4, bottom); band(1, 2, body); band(4, 5, body); band(0, 1, stripe); band(5, 6, stripe);
  band(0, 6, 0x9a7650, true);   // the inside
  // A white rim along both gunwales.
  for (let i = 0; i < N; i++) for (const j of [0, 6]) m.rod(rings[i][j], rings[i + 1][j], 0.024, 0.024, COL.white, 4);
  // The swordfish bow: an upswept beak, and a painted eye each side; a short post at the stern.
  m.rod([0, gy(1) - 0.05, len / 2 - 0.02], [0, gy(1) + 0.32, len / 2 + 0.42], 0.05, 0.02, stripe, 5);
  for (const s of [-1, 1]) { m.sph(0.05, COL.white, s * 0.12, gy(0.9) - 0.12, len * 0.38, 0.4, 1, 1); m.sph(0.03, COL.ink, s * 0.135, gy(0.9) - 0.12, len * 0.38, 0.4, 1, 1); }
  m.rod([0, gy(0) - 0.05, -len / 2 + 0.02], [0, gy(0) + 0.18, -len / 2 - 0.2], 0.045, 0.02, body, 5);
  // Thwarts.
  for (const z of JUKUNG.seats) m.box(wd((z + len / 2) / len) * 1.75, 0.04, 0.2, COL.plank, 0, JUKUNG.seatY, z);
  if (outriggers) {
    const R = JUKUNG.rig;
    for (const s of [-1, 1]) {
      m.cyl(0.075, 0.075, len * 0.7, COL.bamboo, s * R, 0.13, 0, 7, Math.PI / 2);
      for (const ez of [-len * 0.35, len * 0.35]) m.sph(0.075, COL.bambooDk, s * R, 0.13, ez, 1, 1, 1.6, 6, 4);
      for (const z of [-1.15, 1.1]) {
        m.bend([[0, H + 0.04, z], [s * 0.7, H + 0.24, z], [s * 1.45, H + 0.12, z], [s * R, 0.3, z]], 0.038, COL.bambooDk, 5);
        m.rod([s * R, 0.3, z], [s * R, 0.14, z], 0.03, 0.03, COL.bambooDk, 4);
      }
    }
  }
  if (sail >= 0) {
    const [a, b] = SAILS[sail % SAILS.length], mz = 1.0;
    m.rod([0, 0.1, mz], [0, 3.3, mz], 0.045, 0.03, COL.woodDk, 6);
    // A lateen-like triangle with a slight belly, in two colours, and its yard along the top edge.
    const top = [0.05, 3.25, mz + 0.1], fore = [0.05, 0.95, mz + 2.1], aft = [0.05, 0.9, mz - 1.7], belly = [0.3, 1.8, mz + 0.05];
    const midA = [(top[0] + aft[0]) / 2 + 0.12, (top[1] + aft[1]) / 2, (top[2] + aft[2]) / 2];
    m.tris([[top, belly, fore], [belly, aft, fore]], a, true); m.tris([[top, midA, belly], [midA, aft, belly]], b, true);
    m.rod(top, fore, 0.03, 0.025, COL.bambooDk, 5); m.rod(aft, fore, 0.025, 0.025, COL.bambooDk, 5);
  }
  if (gear) {
    m.sph(0.3, COL.net, 0, 0.28, -1.75, 1, 0.35, 1.4, 7, 4); m.sph(0.2, 0x7f9e86, 0.06, 0.34, -1.55, 1, 0.4, 1, 6, 4);
    for (let k = 0; k < 5; k++) m.sph(0.045, k % 2 ? 0xf2873a : 0xe8503a, Math.cos(k * 1.4) * 0.18, 0.37, -1.75 + Math.sin(k * 1.4) * 0.3);
    paddle(m, [-0.12, 0.42, -0.4], [0.1, 0.32, 1.5]); paddle(m, [0.14, 0.44, -0.7], [-0.05, 0.33, 1.3]);
  }
  if (anchor) m.rod([0, gy(1) + 0.1, len / 2 + 0.2], [0, -1.2, len / 2 + 2.6], 0.012, 0.012, COL.rope, 3);
  return { seatY: JUKUNG.seatY };
}

// ---- A market stall ------------------------------------------------------------------------------------
// Front (the counter) toward +z at z = 0; the stall goes back to z = -D; width W along x. The awning reaches out
// over the aisle. kind: 0 striped cloth, 1 tin, 2 plain cloth. Returns colliders and lantern spots (local).
const CLOTH = [[0xe8503a, 0xf4efe2], [0x3f9fb0, 0xf4efe2], [0xf2b63b, 0xe07a3a], [0x5fa86a, 0xf2e29a], [0x9a6ad0, 0xf4efe2], [0xd9463a, 0xf2c03b]];
export function marketStall(m, { W = 4.6, D = 2.5, kind = 0, colour = 0, seed = 0, goods = 0 } = {}) {
  const glow = [], cols = [];
  const pf = 2.5, pb = 2.15, reach = 1.25;
  // Bamboo posts and beams.
  for (const sx of [-W / 2, W / 2]) {
    m.rod([sx, 0, 0.2], [sx, pf, 0.2], 0.06, 0.05, COL.bamboo, 6); m.rod([sx, 0, -D], [sx, pb, -D], 0.06, 0.05, COL.bamboo, 6);
    m.rod([sx, pf, 0.2], [sx, pb, -D], 0.045, 0.045, COL.bambooDk, 5);
    m.rod([sx, 0.95, 0.2], [sx, 0.95, -D], 0.035, 0.035, COL.bambooDk, 5);
  }
  m.rod([-W / 2, pf, 0.2], [W / 2, pf, 0.2], 0.05, 0.05, COL.bambooDk, 6); m.rod([-W / 2, pb, -D], [W / 2, pb, -D], 0.05, 0.05, COL.bambooDk, 6);
  // The awning: from the back beam up over the front beam and out over the aisle, with a scalloped flap.
  const [c0, c1] = CLOTH[colour % CLOTH.length];
  const back = (x) => [x, pb + 0.06, -D - 0.15], frontT = (x) => [x, pf + 0.12, 0.2], out = (x) => [x, pf - 0.08, 0.2 + reach];
  if (kind === 1) {
    const tin = seed % 2 ? COL.tin : COL.tinRust;
    m.quad(back(-W / 2 - 0.2), back(W / 2 + 0.2), frontT(W / 2 + 0.2), frontT(-W / 2 - 0.2), tin, true);
    m.quad(frontT(-W / 2 - 0.2), frontT(W / 2 + 0.2), out(W / 2 + 0.2), out(-W / 2 - 0.2), tin, true);
    for (let x = -W / 2; x <= W / 2 + 1e-6; x += 0.3) { m.rod(back(x).map((v, i) => v + (i === 1 ? 0.03 : 0)), frontT(x).map((v, i) => v + (i === 1 ? 0.03 : 0)), 0.018, 0.018, tin, 3); m.rod(frontT(x).map((v, i) => v + (i === 1 ? 0.03 : 0)), out(x).map((v, i) => v + (i === 1 ? 0.03 : 0)), 0.018, 0.018, tin, 3); }
    m.rod([-W / 2 - 0.2, pf - 0.12, 0.2 + reach], [W / 2 + 0.2, pf - 0.12, 0.2 + reach], 0.03, 0.03, COL.woodDk, 4);
    for (const sx of [-W / 2, W / 2]) m.rod([sx, 0, 0.2 + reach], [sx, pf - 0.1, 0.2 + reach], 0.04, 0.035, COL.woodDk, 5);
  } else {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x0 = -W / 2 - 0.15 + ((W + 0.3) * i) / n, x1 = -W / 2 - 0.15 + ((W + 0.3) * (i + 1)) / n, hex = kind === 2 ? (i % 2 ? c0 : new THREE.Color(c0).multiplyScalar(0.9).getHex()) : i % 2 ? c1 : c0;
      const sag = (p, k) => [p[0], p[1] - k, p[2]];
      m.quad(back(x0), back(x1), frontT(x1), frontT(x0), hex, true);
      m.quad(frontT(x0), frontT(x1), sag(out(x1), 0.06), sag(out(x0), 0.06), hex, true);
      // the scalloped flap
      const a = sag(out(x0), 0.06), b = sag(out(x1), 0.06), mid = [(x0 + x1) / 2, a[1] - 0.36, a[2] + 0.01];
      m.tris([[a, [x0, a[1] - 0.24, a[2]], mid], [a, mid, b], [b, mid, [x1, b[1] - 0.24, b[2]]]], hex, true);
    }
    for (const sx of [-W / 2, W / 2]) m.rod([sx, 0, 0.2 + reach], [sx, pf - 0.12, 0.2 + reach], 0.035, 0.03, COL.bamboo, 5);
  }
  // The table along the front, its legs and a plank skirt.
  const tw = W - 0.5, ty = 0.82, tz = -0.48;
  m.box(tw, 0.06, 0.95, COL.plank, 0, ty, tz); m.box(tw, 0.34, 0.03, COL.woodDk, 0, ty - 0.22, tz + 0.46);
  for (const sx of [-tw / 2 + 0.08, tw / 2 - 0.08]) for (const sz of [tz - 0.4, tz + 0.4]) m.box(0.06, ty, 0.06, COL.woodDk, sx, ty / 2, sz);
  cols.push({ x: 0, z: tz, hw: tw / 2, hd: 0.5 });
  for (const sx of [-W / 2, W / 2]) { cols.push({ x: sx, z: 0.2, r: 0.1 }, { x: sx, z: -D, r: 0.1 }); }
  // What is on the table.
  const top = ty + 0.03, K = [[0, 1, 4], [2, 6, 5], [3, 0, 1], [1, 4, 2]][goods % 4];
  if (goods % 2 === 0) {
    iceBox(m, -tw * 0.3, top, tz + 0.05, 0.05, seed); iceBox(m, tw * 0.12, top, tz + 0.05, -0.04, seed + 3);
    tray(m, tw * 0.4, top, tz + 0.1, 0.3, K, seed + 1);
  } else {
    tray(m, -tw * 0.36, top, tz + 0.08, 0.32, K, seed); tray(m, -tw * 0.02, top, tz + 0.12, 0.34, [K[1], K[2]], seed + 2);
    basket(m, tw * 0.3, top, tz + 0.05, 0.25, K, seed + 4); iceBox(m, tw * 0.3, top, tz - 0.3, 0, seed + 5, 0.5);
  }
  // A big fish laid out alone at the counter's edge (the catch of the day).
  fish(m, tw * (goods % 2 ? 0.08 : -0.02), top + 0.01, tz + 0.38, 0.05, 0.62, (seed + 4) % 7);
  // The hanging scale off the front beam: a hook, the round dial and a pan on three strings.
  const sx = tw * (goods % 2 ? -0.38 : 0.35);
  m.rod([sx, pf, 0.2], [sx, pf - 0.25, 0.2], 0.008, 0.008, COL.iron, 3);
  m.cyl(0.08, 0.08, 0.04, COL.cream, sx, pf - 0.33, 0.2, 10, Math.PI / 2); m.cyl(0.085, 0.085, 0.03, 0xd9463a, sx, pf - 0.33, 0.18, 10, Math.PI / 2);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; m.rod([sx, pf - 0.42, 0.2], [sx + Math.cos(a) * 0.17, pf - 0.85, 0.2 + Math.sin(a) * 0.17], 0.004, 0.004, COL.iron, 3); }
  m.cyl(0.19, 0.16, 0.04, 0xb8b8b0, sx, pf - 0.86, 0.2, 10);
  // A string of small fish drying along one side, a lantern on the front beam, a sign on the beam's top.
  const side = goods % 2 ? W / 2 : -W / 2;
  for (let k = 0; k < 4; k++) { const z = -0.3 - k * 0.45; m.rod([side, 1.9, z], [side, 1.45, z], 0.004, 0.004, COL.rope, 3); fish(m, side, 1.42, z, 0, 0.18, (seed + k) % 7); }
  lantern(m, -sx * 0.4, pf - 0.02, 0.24, glow);
  signboard(m, 0, pf + 0.42, 0.24, 0, Math.min(1.5, W * 0.34), 0.34, [0x3f8fbf, 0xd9463a, 0x3f9f6a, 0xf2b63b][(seed + colour) % 4], 0);
  // Behind the counter: crates, a stool, a bucket.
  crate(m, -W / 2 + 0.55, 0, -D + 0.45, 0.1, COL.wood, 1, null);
  crate(m, -W / 2 + 0.55, 0.3, -D + 0.45, -0.15, COL.woodGrey, 1, null);
  plasticCrate(m, W / 2 - 0.55, 0, -D + 0.45, 0.2, [0x3a7fc0, 0xd9463a, 0x3f9f6a][seed % 3], [seed % 7, (seed + 3) % 7], seed);
  bucket(m, 0.3, 0, -D + 0.4, [0x4f9aa6, 0xe8503a, 0xf2c03b][seed % 3]);
  m.cyl(0.17, 0.15, 0.42, COL.wood, -0.4, 0.21, -1.35, 7);
  return { colliders: cols, glow, seller: { x: 0.1, z: -1.4 }, front: { x: 0, z: 0.75 } };
}

// ---- The fishermen's things ------------------------------------------------------------------------------
// A net-drying rack along x: bamboo poles and a bar, nets draped over it to both sides, floats along the top.
export function netRack(m, len = 5, hex = COL.net, seed = 0) {
  const H = 2.05, n = Math.max(2, Math.round(len / 2.4));
  for (let i = 0; i <= n; i++) { const x = -len / 2 + (len * i) / n; m.rod([x, -0.1, 0], [x + 0.02, H + 0.1, 0], 0.055, 0.045, COL.bamboo, 6); m.sph(0.05, COL.bambooDk, x + 0.02, H + 0.12, 0); }
  m.rod([-len / 2 - 0.2, H, 0], [len / 2 + 0.2, H, 0], 0.04, 0.04, COL.bambooDk, 6);
  const cols = 2 * Math.round(len / 0.32);
  for (const side of [-1, 1]) {
    const drop = side > 0 ? 1.55 : 1.15;
    for (let i = 0; i <= cols; i++) {
      const x = -len / 2 + 0.1 + ((len - 0.2) * i) / cols, sag = 0.1 * Math.sin(i * 0.9 + seed);
      m.rod([x, H, side * 0.05], [x + Math.sin(i + seed) * 0.04, H - drop - sag, side * (0.2 + 0.05 * Math.sin(i * 1.7))], 0.008, 0.008, hex, 3);
    }
    for (let r = 1; r <= 5; r++) {
      const y = H - (drop * r) / 5.4, z = side * (0.05 + 0.15 * r / 5);
      for (let i = 0; i < cols; i += 2) { const x0 = -len / 2 + 0.1 + ((len - 0.2) * i) / cols, x1 = -len / 2 + 0.1 + ((len - 0.2) * (i + 2)) / cols; m.rod([x0, y - (i % 4 ? 0.03 : 0), z], [x1, y - (i % 4 ? 0 : 0.03), z], 0.007, 0.007, hex, 3); }
    }
    // the heavier foot of the net, gathered, and its lead line
    m.rod([-len / 2 + 0.1, H - drop - 0.05, side * 0.22], [len / 2 - 0.1, H - drop - 0.05, side * 0.22], 0.03, 0.03, new THREE.Color(hex).multiplyScalar(0.75).getHex(), 4);
  }
  for (let i = 0; i < Math.round(len / 0.35); i++) m.sph(0.045, i % 2 ? 0xf2873a : 0xf2d03b, -len / 2 + 0.2 + i * 0.35, H - 0.04, 0.06);
  return { colliders: Array.from({ length: n + 1 }, (_, i) => ({ x: -len / 2 + (len * i) / n, z: 0, r: 0.1 })) };
}
// A net spread on the sand for mending, with a heap of it at one end and floats. Along x, about len long.
export function netSpread(m, len = 3, hex = COL.net, seed = 0) {
  for (let i = 0; i <= 10; i++) { const x = -len / 2 + (len * i) / 10; m.rod([x, 0.02, -0.9], [x + 0.08 * Math.sin(i + seed), 0.02, 0.9], 0.009, 0.009, hex, 3); }
  for (let j = 0; j <= 6; j++) { const z = -0.9 + (1.8 * j) / 6; m.rod([-len / 2, 0.025, z], [len / 2, 0.025, z + 0.05 * Math.sin(j + seed)], 0.009, 0.009, hex, 3); }
  m.sph(0.45, hex, len / 2 + 0.3, 0.06, 0, 1, 0.38, 1.3, 7, 4); m.sph(0.3, new THREE.Color(hex).multiplyScalar(0.85).getHex(), len / 2 + 0.55, 0.14, 0.3, 1, 0.5, 1, 6, 4);
  for (let k = 0; k < 6; k++) m.sph(0.05, k % 2 ? 0xf2873a : 0xf2d03b, len / 2 + 0.2 + Math.cos(k) * 0.35, 0.2, Math.sin(k * 1.3) * 0.45);
}
// Two A-frame trestles with a hull on them, under repair: planks, a paint pot and a toolbox beside it.
export function boatOnTrestles(m, hull = HULLS[4], seed = 0) {
  for (const z of [-1.4, 1.3]) for (const s of [-1, 1]) {
    m.rod([s * 0.55, 0, z - 0.25], [0, 0.78, z], 0.045, 0.04, COL.woodDk, 5); m.rod([s * 0.55, 0, z + 0.25], [0, 0.78, z], 0.045, 0.04, COL.woodDk, 5);
  }
  for (const z of [-1.4, 1.3]) m.box(0.8, 0.08, 0.12, COL.woodDk, 0, 0.78, z);
  m.push(0, 0.62, 0, 0, 0, 0.12);
  jukung(m, { hull, outriggers: false, gear: false });
  m.pop();
  // a new plank leaning on a trestle, sawhorse, paint pot with a brush, a toolbox
  m.box(0.18, 0.04, 2.2, COL.plank, 1.0, 0.45, 0.2, 0.15, 0, 1.1);
  m.cyl(0.11, 0.1, 0.18, hull[0], -0.9, 0.09, 1.9, 8); m.cyl(0.1, 0.1, 0.01, new THREE.Color(hull[0]).multiplyScalar(0.8).getHex(), -0.9, 0.185, 1.9, 8);
  m.rod([-0.9, 0.17, 1.9], [-0.82, 0.42, 1.95], 0.012, 0.012, COL.wood, 4);
  m.box(0.5, 0.2, 0.24, 0xc0503a, -1.0, 0.1, -0.6, 0.3); m.rod([-1.18, 0.24, -0.66], [-0.82, 0.24, -0.54], 0.015, 0.015, COL.iron, 4);
  return { colliders: [{ x: 0, z: 0, hw: 0.8, hd: 2.9 }] };
}
// Logs laid across under a beached boat (rollers): along x, at local z positions.
export function rollers(m, zs = [-1.3, 1.2], len = 1.3) { for (const z of zs) m.cyl(0.11, 0.11, len, 0xa08060, 0, 0.1, z, 7, 0, Math.PI / 2); }
// The fishermen's shelter: an open thatched roof on four posts over a bench and a table, nets and oars hung up.
export function shelter(m, W = 4.4, D = 3.2, seed = 0) {
  const H = 2.25, R = 3.05;
  for (const sx of [-W / 2, W / 2]) for (const sz of [-D / 2, D / 2]) m.rod([sx, 0, sz], [sx, H, sz], 0.08, 0.07, COL.woodDk, 6);
  for (const sz of [-D / 2, D / 2]) m.rod([-W / 2 - 0.2, H, sz], [W / 2 + 0.2, H, sz], 0.06, 0.06, COL.woodDk, 5);
  for (const sx of [-W / 2, W / 2]) m.rod([sx, H, -D / 2 - 0.1], [sx, H, D / 2 + 0.1], 0.06, 0.06, COL.woodDk, 5);
  // a ridge roof of thatch, eaves well out, along x
  const e = 0.55, a = [-W / 2 - e, H - 0.1, -D / 2 - e], b = [W / 2 + e, H - 0.1, -D / 2 - e], c = [W / 2 + e, R + 0.4, 0], d = [-W / 2 - e, R + 0.4, 0];
  const a2 = [-W / 2 - e, H - 0.1, D / 2 + e], b2 = [W / 2 + e, H - 0.1, D / 2 + e];
  m.quad(a, b, c, d, COL.thatch, true); m.quad(b2, a2, d, c, COL.thatch, true);
  for (let i = 0; i < 4; i++) { const y = H + 0.1 + i * 0.32, k = (y - (H - 0.1)) / (R + 0.4 - (H - 0.1)), zz = (D / 2 + e) * (1 - k) + 0.03; m.rod([-W / 2 - e, y, zz], [W / 2 + e, y, zz], 0.03, 0.03, COL.thatchDk, 4); m.rod([-W / 2 - e, y, -zz], [W / 2 + e, y, -zz], 0.03, 0.03, COL.thatchDk, 4); }
  m.rod([-W / 2 - e - 0.1, R + 0.45, 0], [W / 2 + e + 0.1, R + 0.45, 0], 0.08, 0.08, COL.thatchDk, 6);
  for (const s of [-1, 1]) m.tris([[[s * (W / 2 + e - 0.05), H - 0.05, -D / 2 - e + 0.3], [s * (W / 2 + e - 0.05), H - 0.05, D / 2 + e - 0.3], [s * (W / 2 + e - 0.05), R + 0.3, 0]]], COL.thatchDk, true);
  // bench along the back, a low table, a water jar, nets on a peg, paddles leaning on a post
  m.box(W - 0.6, 0.06, 0.4, COL.plank, 0, 0.45, -D / 2 + 0.4); for (const sx of [-W / 2 + 0.5, 0, W / 2 - 0.5]) m.box(0.08, 0.45, 0.3, COL.woodDk, sx, 0.22, -D / 2 + 0.4);
  m.box(1.2, 0.05, 0.7, COL.plank, 0.6, 0.55, 0.2); for (const sx of [0.1, 1.1]) for (const sz of [-0.1, 0.5]) m.box(0.05, 0.55, 0.05, COL.woodDk, sx, 0.27, sz);
  m.cyl(0.18, 0.14, 0.45, 0xb0603a, -W / 2 + 0.5, 0.22, D / 2 - 0.4, 9); m.cyl(0.1, 0.18, 0.08, 0xb0603a, -W / 2 + 0.5, 0.48, D / 2 - 0.4, 9);
  m.sph(0.35, COL.netOr, W / 2 - 0.1, 1.55, -D / 2 + 0.05, 1, 1.4, 0.4, 7, 5); m.sph(0.3, COL.net, -W / 2 + 0.1, 1.6, -D / 2 + 0.05, 1, 1.5, 0.4, 7, 5);
  paddle(m, [W / 2 + 0.05, 1.9, D / 2 + 0.12], [W / 2 + 0.35, 0, D / 2 + 0.25]); paddle(m, [W / 2 - 0.1, 1.85, D / 2 + 0.15], [W / 2 - 0.45, 0, D / 2 + 0.35]);
  m.box(0.5, 0.06, 0.3, COL.cream, 0.5, 0.6, 0.15); fish(m, 0.5, 0.63, 0.15, 0.3, 0.3, 3); // lunch on a plate
  const glow = []; lantern(m, 0, H, 0, glow);
  return { colliders: [{ x: -W / 2, z: -D / 2, r: 0.12 }, { x: W / 2, z: -D / 2, r: 0.12 }, { x: -W / 2, z: D / 2, r: 0.12 }, { x: W / 2, z: D / 2, r: 0.12 }, { x: 0.6, z: 0.2, hw: 0.6, hd: 0.35 }, { x: 0, z: -D / 2 + 0.4, hw: (W - 0.6) / 2, hd: 0.2 }], glow, seat: { x: -0.6, z: -D / 2 + 0.75, top: 0.48 } };
}
// Old Darto's hut: a small plank hut on stilts with a thatched roof and a porch facing +z (the sea), a ladder of
// three steps, a bench on the porch, a net and a lantern by the door.
export function dartoHut(m) {
  const W = 3.2, D = 2.8, F = 0.65, Hw = 1.9, P = 1.1; // width, depth, floor height, wall height, porch depth
  for (const sx of [-W / 2, 0, W / 2]) for (const sz of [-D / 2, D / 2, D / 2 + P]) m.rod([sx, -0.8, sz], [sx, F, sz], 0.07, 0.06, COL.woodDk, 6);
  m.box(W + 0.2, 0.1, D + P + 0.1, COL.plank, 0, F + 0.05, P / 2);
  // walls of vertical planks, a door and a window on the front
  const wall = (x0, z0, x1, z1, n) => { for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u; m.box(Math.abs(x1 - x0) / n + 0.01 || 0.06, Hw, Math.abs(z1 - z0) / n + 0.01 || 0.06, i % 3 ? COL.plank : COL.wood, x, F + 0.1 + Hw / 2, z); } };
  wall(-W / 2, -D / 2, W / 2, -D / 2, 10); wall(-W / 2, -D / 2, -W / 2, D / 2, 9); wall(W / 2, -D / 2, W / 2, D / 2, 9);
  wall(-W / 2, D / 2, -0.45, D / 2, 4); wall(0.45, D / 2, W / 2, D / 2, 4); m.box(0.9, 0.4, 0.06, COL.plank, 0, F + 0.1 + Hw - 0.2, D / 2);
  m.box(0.9, Hw - 0.4, 0.04, 0x5a4030, 0, F + 0.1 + (Hw - 0.4) / 2, D / 2 - 0.02); // the open doorway, dark inside
  m.box(0.7, 0.5, 0.05, 0x4a3628, 1.0, F + 1.25, D / 2 + 0.01); m.box(0.8, 0.06, 0.12, COL.woodDk, 1.0, F + 0.98, D / 2 + 0.05); // window and sill
  // the roof: two thatched slopes along x, eaves out over the porch
  const ry = F + 0.1 + Hw, top = ry + 1.25, e = 0.4;
  m.quad([-W / 2 - e, ry - 0.15, -D / 2 - e], [W / 2 + e, ry - 0.15, -D / 2 - e], [W / 2 + e, top, 0.2], [-W / 2 - e, top, 0.2], COL.thatch, true);
  m.quad([W / 2 + e, ry - 0.35, D / 2 + P + 0.2], [-W / 2 - e, ry - 0.35, D / 2 + P + 0.2], [-W / 2 - e, top, 0.2], [W / 2 + e, top, 0.2], COL.thatch, true);
  m.rod([-W / 2 - e - 0.1, top + 0.04, 0.2], [W / 2 + e + 0.1, top + 0.04, 0.2], 0.08, 0.08, COL.thatchDk, 6);
  for (const s of [-1, 1]) m.tris([[[s * W / 2, ry, -D / 2], [s * W / 2, ry, D / 2], [s * W / 2, top - 0.05, 0.2]]], COL.plank, true);
  for (const sx of [-W / 2, W / 2]) m.rod([sx, F, D / 2 + P], [sx, ry - 0.3, D / 2 + P], 0.05, 0.05, COL.woodDk, 5);
  // porch rail, steps, bench, a net hung on the rail, a lantern by the door, a fish trap and a pot
  m.rod([-W / 2, F + 0.65, D / 2 + P], [-0.5, F + 0.65, D / 2 + P], 0.03, 0.03, COL.woodDk, 4); m.rod([0.5, F + 0.65, D / 2 + P], [W / 2, F + 0.65, D / 2 + P], 0.03, 0.03, COL.woodDk, 4);
  for (let i = 0; i < 3; i++) m.box(0.9, 0.05, 0.3, COL.plank, 0, F - 0.18 - i * 0.2, D / 2 + P + 0.25 + i * 0.28);
  for (const s of [-0.48, 0.48]) m.rod([s, F, D / 2 + P], [s, -0.05, D / 2 + P + 0.95], 0.035, 0.035, COL.woodDk, 4);
  m.box(1.0, 0.05, 0.32, COL.plank, -1.0, F + 0.48, D / 2 + 0.3); for (const sx of [-1.4, -0.6]) m.box(0.06, 0.42, 0.26, COL.woodDk, sx, F + 0.27, D / 2 + 0.3);
  m.sph(0.3, COL.netBlue, 1.1, F + 0.55, D / 2 + P + 0.02, 1.4, 0.9, 0.3, 7, 5);
  const glow = []; lantern(m, 0.6, ry - 0.2, D / 2 + 0.25, glow);
  m.cyl(0.22, 0.28, 0.6, 0xb08a50, 1.3, F + 0.4, D / 2 + 0.5, 8, Math.PI / 2 * 0.0); m.cyl(0.16, 0.16, 0.02, 0x6b4a33, 1.3, F + 0.71, D / 2 + 0.5, 8);
  return { colliders: [{ x: 0, z: P / 2, hw: W / 2 + 0.1, hd: (D + P) / 2 + 0.05 }], glow, door: { x: 0, z: D / 2 + P + 1.3 } };
}
// The tide board: a tall post standing in the shallows with a white board marked in red and blue bands every
// 10 cm (a longer band every half metre), from y0 to y1 (sea level 0 = the post's base level here), and a
// little gull perched on top.
export function tideBoard(m, y0 = -0.9, y1 = 1.4) {
  const H = y1 - y0;
  m.rod([0, y0 - 0.4, -0.08], [0, y1 + 0.45, -0.08], 0.08, 0.07, COL.woodDk, 7);
  m.box(0.3, H, 0.04, COL.white, 0, y0 + H / 2, 0);
  for (let k = 0; k * 0.1 <= H + 1e-6; k++) {
    const y = y0 + k * 0.1, major = Math.round((y * 10)) % 5 === 0;
    m.box(major ? 0.26 : 0.12, 0.025, 0.05, Math.abs(y) < 0.01 ? COL.ink : major ? 0xd9463a : 0x3a6fb0, major ? 0 : -0.07, y, 0.004);
  }
  m.box(0.34, 0.06, 0.08, COL.woodDk, 0, y1 + 0.03, 0);
  // the gull
  m.sph(0.1, COL.white, 0, y1 + 0.55, -0.08, 1, 0.8, 1.6, 6, 4); m.sph(0.06, COL.white, 0, y1 + 0.66, 0.02); m.at(new THREE.ConeGeometry(0.02, 0.07, 4), 0xf2b63b, 0, y1 + 0.65, 0.1, Math.PI / 2);
  m.sph(0.08, 0x9aa0a8, 0, y1 + 0.58, -0.12, 1.2, 0.4, 1.4, 6, 3);
  return { colliders: [{ x: 0, z: -0.08, r: 0.12 }] };
}
// A rack of oars and paddles leaning on a bar, along x.
export function oarRack(m, n = 5) {
  m.rod([-0.9, 0, -0.2], [-0.9, 1.3, -0.2], 0.04, 0.04, COL.woodDk, 5); m.rod([0.9, 0, -0.2], [0.9, 1.3, -0.2], 0.04, 0.04, COL.woodDk, 5); m.rod([-1, 1.25, -0.2], [1, 1.25, -0.2], 0.035, 0.035, COL.woodDk, 5);
  for (let i = 0; i < n; i++) { const x = -0.7 + (1.4 * i) / (n - 1); paddle(m, [x + 0.05, 1.55, -0.32], [x - 0.08, 0.02, 0.45], i % 2 ? COL.woodDk : 0xa07a50); }
  return { colliders: [{ x: 0, z: 0, hw: 1, hd: 0.35 }] };
}
// A pile of fishing gear on the sand: crates, buoys, coils, a jerry can and baskets. `seed` varies it.
export function gearPile(m, seed = 0) {
  const r = (k) => { const v = Math.sin((seed + 1) * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  crate(m, 0, 0, 0, r(1) * 0.4, COL.wood); crate(m, 0.05, 0.3, 0.02, r(2) * 0.5 - 0.25, COL.woodGrey); plasticCrate(m, 0.7, 0, 0.1, r(3), [0x3a7fc0, 0xd9463a, 0x3f9f6a][seed % 3]);
  buoy(m, -0.55, 0, 0.3, 0xf2873a); buoy(m, -0.75, 0, -0.05, 0xf2d03b, 0.15); buoy(m, -0.45, 0, -0.3, 0xe8503a, 0.14);
  ropeCoil(m, 0.4, 0, -0.55); jerryCan(m, 1.05, 0, -0.4, r(4)); basket(m, -0.1, 0, -0.65, 0.22);
  return { colliders: [{ x: 0.2, z: 0, r: 0.75 }] };
}
// An open-sided salt-fish drying rack: trays of small split fish on a bamboo table, along x.
export function dryingRack(m, len = 3.2, seed = 0) {
  for (const sx of [-len / 2, len / 2]) for (const sz of [-0.5, 0.5]) m.rod([sx, 0, sz], [sx, 0.85, sz], 0.035, 0.035, COL.bamboo, 5);
  m.box(len + 0.1, 0.03, 1.1, COL.bambooDk, 0, 0.86, 0);
  for (let i = 0; i < 4; i++) {
    const x = -len / 2 + 0.4 + (len - 0.8) * (i / 3);
    m.cyl(0.42, 0.42, 0.03, 0xd8b878, x, 0.89, 0, 10);
    for (let k = 0; k < 9; k++) { const a = k * 0.7 + i, rr = 0.3 * Math.sqrt((k + 0.5) / 9); fish(m, x + Math.cos(a) * rr, 0.9, Math.sin(a) * rr, a, 0.15, 5 + (k % 2)); }
  }
  return { colliders: [{ x: 0, z: 0, hw: len / 2, hd: 0.55 }] };
}
// A low bench of planks on two stumps, along x.
export function bench(m, len = 1.6) {
  m.box(len, 0.06, 0.32, COL.plank, 0, 0.44, 0); for (const sx of [-len / 2 + 0.25, len / 2 - 0.25]) m.cyl(0.13, 0.15, 0.42, COL.woodDk, sx, 0.21, 0, 7);
  return { colliders: [{ x: 0, z: 0, hw: len / 2, hd: 0.18 }], top: 0.47 };
}
// A woven mat on the ground with heaps of fish to sell from, and a seller's stool: about 1.6 x 1.1 m.
export function groundMat(m, seed = 0) {
  m.box(1.6, 0.02, 1.1, 0xc9a86a, 0, 0.01, 0); for (let i = 0; i < 5; i++) m.box(0.02, 0.025, 1.1, 0xa88f4c, -0.64 + i * 0.32, 0.012, 0);
  tray(m, -0.4, 0.02, -0.15, 0.3, [seed % 7, (seed + 2) % 7], seed); tray(m, 0.35, 0.02, -0.1, 0.3, [(seed + 4) % 7], seed + 1);
  basket(m, 0.1, 0.02, 0.35, 0.2, [(seed + 1) % 7], seed + 2); bucket(m, -0.6, 0, 0.4, 0x3a7fc0);
  return { colliders: [{ x: 0, z: 0, hw: 0.85, hd: 0.6 }] };
}
// An entrance arch for the market: two tall bamboo poles, a crossbar with a long painted signboard and bunting.
export function marketArch(m, W = 4.2) {
  for (const s of [-1, 1]) m.rod([s * W / 2, 0, 0], [s * W / 2, 3.4, 0], 0.08, 0.07, COL.bamboo, 6);
  m.rod([-W / 2 - 0.25, 3.2, 0], [W / 2 + 0.25, 3.2, 0], 0.06, 0.06, COL.bambooDk, 6);
  m.box(W * 0.78, 0.62, 0.06, COL.cream, 0, 2.75, 0.02); m.box(W * 0.74, 0.54, 0.07, 0x2f6fa8, 0, 2.75, 0.02);
  for (const s of [1, -1]) {
    for (let k = 0; k < 2; k++) { const x = (k ? 1 : -1) * W * 0.22; m.at(new THREE.SphereGeometry(0.5, 6, 3), COL.cream, x, 2.75, s * 0.06, 0, 0, 0, 0.55, 0.22, 0.01); m.at(new THREE.ConeGeometry(0.1, 0.2, 3), COL.cream, x + (k ? -0.33 : 0.33), 2.75, s * 0.06, 0, 0, k ? Math.PI / 2 : -Math.PI / 2, 1, 1, 0.1); }
    for (let k = 0; k < 4; k++) m.box(0.22, 0.07, 0.01, COL.white, -0.4 + k * 0.27, 2.75 + (k % 2 ? 0.08 : -0.06), s * 0.07);
  }
  const flags = [0xe8503a, 0xf2c03b, 0x3f9f6a, 0x3a8fd0, 0xf4efe2];
  for (let i = 0; i < 10; i++) { const x = -W / 2 + 0.2 + (W - 0.4) * (i / 9), y = 3.18 - 0.12 * Math.sin((i / 9) * Math.PI); m.tris([[[x - 0.1, y, 0.04], [x + 0.1, y, 0.04], [x, y - 0.24, 0.04]]], flags[i % 5], true); }
  return { colliders: [{ x: -W / 2, z: 0, r: 0.1 }, { x: W / 2, z: 0, r: 0.1 }] };
}
