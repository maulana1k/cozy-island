// INTERNAL. Farm kit: rice paddy, vegetable plot, goat pen, hay shelter, scarecrow, buffalo wallow,
// orchard trees, duck pond, plus a goat and a water buffalo. Everything is built from code.
//   scenery: buildX(...) -> { group, colliders }   (colliders are local circles {x,z,r} or boxes {x,z,hw,hd,rot})
//   animals: buildGoat(color) / buildBuffalo() -> { group, animate(elapsed, { mode, speed }) }
// Style: flat warm colours, simple rounded shapes. All parts are welded into very few meshes:
// scenery pieces use ONE vertex-coloured mesh (plus a water or mud surface where one is needed),
// and each moving part of an animal is welded into ONE mesh with its own pivot.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, roofGeometry, flat } from '../world/build.js';

// ---- small helpers ---------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; // same numbers every run
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex(); // blend two hex colours

const dyes = new Map(); // one plain material per colour; only used to carry the colour into the weld
const dye = (hex) => { if (!dyes.has(hex)) dyes.set(hex, flat(hex)); return dyes.get(hex); };
// A mesh of any shape with a colour, position, per-axis scale and rotation.
function M(geo, hex, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, dye(hex));
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
  return m;
}
const sph = (r, hex, x, y, z, sx, sy, sz, rx, ry, rz, w = 12, h = 8) => M(new THREE.SphereGeometry(r, w, h), hex, x, y, z, sx, sy, sz, rx, ry, rz);
// A tapered rod from point a (radius r0) to point b (radius r1): limbs, horns, reeds, stalks.
function seg(a, b, r0, r1, hex, n = 7) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, Math.max(len, 1e-4), n, 1), dye(hex));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, vb.clone().sub(va).normalize());
  return m;
}
// Water or mud sheet that keeps its own material (welded separately from the coloured mesh).
function sheet(geo, material, x, y, z, rx = 0) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.x = rx; m.userData.own = true; return m;
}
const waterMat = (color, opacity, roughness = 0.15) => new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness, metalness: 0 });

const FLAT_MAT = flat(0xffffff, { vertexColors: true });                                    // scenery: faceted, one material for all colours
const SOFT_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });    // animals: smooth and rounded

// Welds a list of meshes into one mesh (colours baked into the vertices), like mergeStatic but
// collapsing every colour into a single material. Meshes flagged `userData.own` keep their material.
function weld(list, { mat = FLAT_MAT, cast = true } = {}) {
  const main = [], own = new Map();
  for (const m of list) {
    m.updateWorldMatrix(true, false);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld); g.clearGroups();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (m.userData.own) { if (!own.has(m.material)) own.set(m.material, []); own.get(m.material).push(g); continue; }
    const c = m.material.color, n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); main.push(g);
  }
  const out = [];
  if (main.length) { const mesh = new THREE.Mesh(mergeGeometries(main), mat); mesh.castShadow = cast; mesh.receiveShadow = true; out.push(mesh); }
  for (const [material, geos] of own) { const mesh = new THREE.Mesh(mergeGeometries(geos), material); mesh.receiveShadow = true; out.push(mesh); }
  return out;
}
const scenery = (list, cast = true) => { const group = new THREE.Group(); group.add(...weld(list, { cast })); return group; };
const part = (list, cast = false) => weld(list, { mat: SOFT_MAT, cast })[0]; // one moving animal part -> one mesh
const pivot = (x, y, z, ...kids) => { const g = new THREE.Group(); g.position.set(x, y, z); g.add(...kids); return g; };

// Palette (kept small and warm)
const C = {
  earth: 0xa07650, earthDark: 0x6b4a33, soil: 0x6e4a32, dirt: 0xc9a572, grass: 0x8fc65c, leaf: 0x5fb04c, leafLight: 0x7fcb5a, leafDark: 0x3f8a46,
  wood: 0xb98a5f, woodDark: 0x8d6643, straw: 0xe0a93c, thatch: 0xb98a45, strap: 0x8c6a2a, metal: 0x9aa3a8, dark: 0x3b2a22,
  bamboo: 0xd9bc73, blue: 0x5fa6d8, reed: 0x7bb35a, reedLight: 0x98c466, cattail: 0x7a4f35, stone: 0xb5aeb0, orange: 0xf58a2e,
};

// A ring of squashed lumps, used for banks and churned earth. Returns meshes.
function lumpRing(radius, count, size, colors, y, rand, spread = 0.08) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.15, rr = radius * (1 + (rand() - 0.5) * spread * 2), s = size * (0.8 + rand() * 0.5);
    out.push(sph(s, colors[Math.floor(rand() * colors.length)], Math.cos(a) * rr, y, Math.sin(a) * rr, 1.3, 0.75, 1, 0, -a, 0, 10, 7));
  }
  return out;
}
// A tuft of reeds: thin blades leaning outward from (cx, cz); some carry a brown cattail head.
function reeds(cx, cz, outward, rand, count = 7, tall = 1.2, cattails = true) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, ox = cx + Math.cos(a) * 0.12, oz = cz + Math.sin(a) * 0.12, h = tall * (0.6 + rand() * 0.5), lean = 0.1 + rand() * 0.3;
    const tx = ox + Math.cos(outward) * lean * h + (rand() - 0.5) * 0.15, tz = oz + Math.sin(outward) * lean * h + (rand() - 0.5) * 0.15;
    const hex = rand() < 0.5 ? C.reed : C.reedLight;
    out.push(seg([ox, 0, oz], [tx, h, tz], 0.02, 0.006, hex, 4));
    if (cattails && i % 3 === 0) out.push(seg([lerp(ox, tx, 0.82), h * 0.82, lerp(oz, tz, 0.82)], [lerp(ox, tx, 0.96), h * 0.96, lerp(oz, tz, 0.96)], 0.035, 0.03, C.cattail, 6));
  }
  return out;
}

// =================================================================================================
// SCENERY
// =================================================================================================

// A rice paddy: earth bank round a shallow sheet of still water, rows of green rice shoots.
export function buildPaddy(width = 10, depth = 8) {
  const L = [], rand = rng(11), bw = 0.45, bh = 0.24, waterY = bh - 0.05, iw = width - bw * 2, id = depth - bw * 2;
  L.push(box(iw + 0.1, 0.1, id + 0.1, C.earthDark, 0, 0.05, 0));                                   // muddy bed under the water
  // The bank: four low earth strips with a green top, and rounded corners.
  const strips = [[width, bw, 0, -(depth - bw) / 2], [width, bw, 0, (depth - bw) / 2], [bw, id, -(width - bw) / 2, 0], [bw, id, (width - bw) / 2, 0]];
  for (const [w, d, x, z] of strips) { L.push(box(w, bh, d, C.earth, x, bh / 2, z), box(w - 0.04, 0.03, d * 0.7, C.grass, x, bh + 0.012, z)); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.push(sph(0.34, C.earth, sx * (width / 2 - 0.2), 0.1, sz * (depth / 2 - 0.2), 1, 0.55, 1, 0, 0, 0, 8, 5));
  for (let i = 0; i < 16; i++) { // little tufts of grass and clods on the bank
    const onFront = i % 2, x = (rand() - 0.5) * (width - 1), z = (onFront ? 1 : -1) * (depth / 2 - bw / 2);
    L.push(sph(0.1 + rand() * 0.06, rand() < 0.5 ? C.leafLight : C.grass, x, bh + 0.04, z + (rand() - 0.5) * 0.2, 1, 0.7, 1, 0, 0, 0, 7, 5));
  }
  // A marker stake with a red flag at one corner.
  L.push(cyl(0.035, 0.04, 1.0, C.wood, width / 2 - 0.3, 0.7, depth / 2 - 0.3, 6), box(0.28, 0.16, 0.02, 0xe8554e, width / 2 - 0.45, 1.12, depth / 2 - 0.3));
  const water = sheet(new THREE.PlaneGeometry(iw, id), waterMat(0x6fc2b6, 0.62, 0.1), 0, waterY, 0, -Math.PI / 2);
  L.push(water);
  const group = scenery(L, false);
  // Rice shoots: one instanced tuft of five thin blades, planted in neat rows.
  const blades = [];
  for (let k = 0; k < 5; k++) {
    const g = new THREE.ConeGeometry(0.022, 0.38, 4); g.translate(0, 0.19, 0);
    const a = (k / 5) * Math.PI * 2, tilt = k === 0 ? 0.05 : 0.38;
    g.rotateX(Math.sin(a) * tilt); g.rotateZ(-Math.cos(a) * tilt); blades.push(g);
  }
  const step = 0.42, nx = Math.floor((iw - 0.5) / step), nz = Math.floor((id - 0.5) / step);
  const shoots = new THREE.InstancedMesh(mergeGeometries(blades.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), nx * nz);
  const dummy = new THREE.Object3D(), col = new THREE.Color(), a1 = new THREE.Color(0x6fba4a), a2 = new THREE.Color(0x9bd35c);
  let n = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    dummy.position.set(-((nx - 1) * step) / 2 + i * step + (rand() - 0.5) * 0.05, 0.1, -((nz - 1) * step) / 2 + j * step + (rand() - 0.5) * 0.05);
    dummy.rotation.y = rand() * 6.28; dummy.scale.setScalar(0.85 + rand() * 0.35); dummy.updateMatrix();
    shoots.setMatrixAt(n, dummy.matrix); shoots.setColorAt(n, col.copy(a1).lerp(a2, rand())); n++;
  }
  shoots.castShadow = false; shoots.receiveShadow = true; group.add(shoots);
  return { group, colliders: [] };
}

// A vegetable plot: raised soil rows with cabbages, lettuces and carrot tops, bean poles and a watering can.
export function buildVegPlot(width = 6, depth = 4, skirt = 0.5) { // skirt: how far the plot's earth slab reaches down, for a plot on a slope
  const L = [], rand = rng(23);
  L.push(box(width, skirt, depth, C.dirt, 0, 0.01 - skirt / 2, 0));                                              // trodden bare earth floor, a slab that reaches down into sloping ground
  // Low wooden boards round the edge.
  for (const sz of [-1, 1]) L.push(box(width, 0.14, 0.06, C.wood, 0, 0.07, sz * (depth / 2 - 0.03)));
  for (const sx of [-1, 1]) L.push(box(0.06, 0.14, depth - 0.12, C.wood, sx * (width / 2 - 0.03), 0.07, 0));
  // Three raised soil beds, each planted differently.
  const bl = width - 2.0, bx = 0.7;
  const rows = [-1.15, 0, 1.15];
  rows.forEach((z, r) => {
    L.push(box(bl, 0.2, 0.72, C.soil, bx, 0.12, z), box(bl - 0.1, 0.05, 0.5, mix(C.soil, 0x000000, 0.12), bx, 0.235, z));
    const count = Math.floor(bl / 0.52);
    for (let i = 0; i < count; i++) {
      const x = bx - bl / 2 + 0.3 + i * ((bl - 0.6) / (count - 1)), zz = z + (rand() - 0.5) * 0.06;
      if (r === 0) { // cabbages: a round head in a skirt of outer leaves
        L.push(sph(0.2, C.leaf, x, 0.4, zz, 1.2, 0.5, 1.2, 0, rand() * 3, 0, 9, 6), sph(0.15, C.leafLight, x, 0.46, zz, 1, 0.9, 1, 0, 0, 0, 9, 6));
      } else if (r === 1) { // lettuces: a few frilly leaves
        for (let k = 0; k < 4; k++) { const a = k * 1.6 + rand(); L.push(sph(0.09, k % 2 ? 0xa9d65f : 0x8fcb55, x + Math.cos(a) * 0.08, 0.36 + k * 0.01, zz + Math.sin(a) * 0.08, 1, 0.8, 1, 0, 0, 0, 7, 5)); }
      } else { // carrots: leafy tops with an orange shoulder showing
        L.push(sph(0.05, 0xf08a3c, x, 0.26, zz, 1, 0.7, 1, 0, 0, 0, 6, 4));
        for (let k = 0; k < 3; k++) { const a = k * 2.1 + rand(); L.push(seg([x, 0.27, zz], [x + Math.cos(a) * 0.12, 0.55, zz + Math.sin(a) * 0.12], 0.018, 0.006, C.leafDark, 4)); }
      }
    }
  });
  // Two bean teepees at the left end: bamboo poles leaning together, covered in bean leaves and pods.
  const colliders = [];
  for (const tz of [-0.9, 0.9]) {
    const cx = -width / 2 + 0.75;
    for (let k = 0; k < 4; k++) { const a = k * (Math.PI / 2) + 0.4; L.push(seg([cx + Math.cos(a) * 0.4, 0, tz + Math.sin(a) * 0.4], [cx, 2.0, tz], 0.03, 0.018, C.bamboo, 5)); }
    for (let k = 0; k < 14; k++) {
      const a = k * 1.9 + tz, t = 0.12 + (k / 14) * 0.7, rr = 0.4 * (1 - t) + 0.05;
      L.push(sph(0.085 + rand() * 0.03, rand() < 0.5 ? C.leaf : C.leafLight, cx + Math.cos(a) * rr, 2.0 * t, tz + Math.sin(a) * rr, 1, 0.7, 1, 0, 0, 0, 7, 5));
      if (k % 3 === 0) L.push(seg([cx + Math.cos(a + 0.4) * rr, 2.0 * t, tz + Math.sin(a + 0.4) * rr], [cx + Math.cos(a + 0.4) * rr, 2.0 * t - 0.22, tz + Math.sin(a + 0.4) * rr], 0.016, 0.012, 0xb4d65c, 4));
    }
    colliders.push({ x: cx, z: tz, r: 0.45 });
  }
  // A blue watering can: a round body, a spout with a rose, and a handle.
  const can = new THREE.Group(); can.position.set(-width / 2 + 0.8, 0, 0); can.rotation.y = -0.7;
  for (const m of [cyl(0.14, 0.15, 0.26, C.blue, 0, 0.14, 0, 12), cyl(0.12, 0.12, 0.03, 0x3f7fb0, 0, 0.275, 0, 12),
    seg([0.1, 0.1, 0], [0.4, 0.34, 0], 0.045, 0.025, C.blue, 6), seg([0.4, 0.34, 0], [0.46, 0.38, 0], 0.06, 0.07, 0x3f7fb0, 8),
    seg([-0.1, 0.25, 0], [-0.22, 0.3, 0], 0.02, 0.02, 0x3f7fb0, 5), seg([-0.22, 0.3, 0], [-0.22, 0.12, 0], 0.02, 0.02, 0x3f7fb0, 5), seg([-0.22, 0.12, 0], [-0.14, 0.08, 0], 0.02, 0.02, 0x3f7fb0, 5)]) can.add(m);
  L.push(...can.children);
  colliders.push({ x: -width / 2 + 0.8, z: 0, r: 0.22 });
  return { group: scenery(L), colliders };
}

// A goat pen: a square rail fence with a gate gap on +z, a lean-to shelter, a feed trough.
export function buildGoatPen(size = 6) {
  const L = [], colliders = [], h = size / 2, gap = 0.7, rand = rng(5);
  const post = (x, z, ht = 1.1) => L.push(cyl(0.065, 0.075, ht + 0.4, C.woodDark, x, ht / 2 - 0.2, z, 7), sph(0.075, C.woodDark, x, ht, z, 1, 0.7, 1, 0, 0, 0, 7, 4));
  const rails = (x0, z0, x1, z1) => { // two rails between two points, split into pieces between posts
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.5)), ang = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, cx = lerp(x0, x1, t), cz = lerp(z0, z1, t);
      for (const y of [0.5, 0.88]) L.push(box(len / n + 0.05, 0.07, 0.05, C.wood, cx, y, cz, ang));
    }
  };
  const step = size / 4;
  for (let i = 0; i <= 4; i++) { const t = -h + i * step; post(t, -h); post(-h, t); post(h, t); if (Math.abs(t) > gap + 0.1) post(t, h); }
  post(-gap, h, 1.25); post(gap, h, 1.25);                                                    // taller gate posts
  rails(-h, -h, h, -h); rails(-h, -h, -h, h); rails(h, -h, h, h); rails(-h, h, -gap, h); rails(gap, h, h, h);
  colliders.push({ x: 0, z: -h, hw: h, hd: 0.07, rot: 0 }, { x: -h, z: 0, hw: 0.07, hd: h, rot: 0 }, { x: h, z: 0, hw: 0.07, hd: h, rot: 0 },
    { x: -(h + gap) / 2, z: h, hw: (h - gap) / 2, hd: 0.07, rot: 0 }, { x: (h + gap) / 2, z: h, hw: (h - gap) / 2, hd: 0.07, rot: 0 });
  // The gate leaf stands open, swung inward against the side of the gap.
  const gx = -gap, gl = 1.0;
  for (const y of [0.45, 0.85]) L.push(box(0.05, 0.07, gl, C.wood, gx + 0.1, y, h - gl / 2 - 0.1));
  L.push(box(0.05, 0.5, 0.05, C.wood, gx + 0.1, 0.65, h - gl - 0.12), box(0.05, 0.5, 0.05, C.wood, gx + 0.1, 0.65, h - 0.18));
  colliders.push({ x: gx + 0.1, z: h - gl / 2 - 0.1, hw: 0.05, hd: gl / 2, rot: 0 });
  // Lean-to shelter against the back fence: four posts, a sloping thatched roof, a plank back wall, straw bedding.
  const sx = -h / 2 - 0.3, sz = -h + 1.0, sw = Math.min(2.8, size * 0.5), sd = 1.9;
  for (const px of [-1, 1]) { L.push(cyl(0.06, 0.07, 1.7, C.woodDark, sx + px * (sw / 2 - 0.1), 0.85, sz - sd / 2 + 0.1, 7), cyl(0.06, 0.07, 1.2, C.woodDark, sx + px * (sw / 2 - 0.1), 0.6, sz + sd / 2 - 0.1, 7)); }
  const roof = box(sw + 0.3, 0.09, sd + 0.3, C.thatch, sx, 1.5, sz, 0); roof.rotation.x = 0.26; roof.scale.set(1, 1, 1); L.push(roof);
  L.push(box(sw + 0.3, 0.05, 0.12, mix(C.thatch, 0x7a5a20, 0.4), sx, 1.34, sz + sd / 2 + 0.12));
  L.push(box(sw, 1.35, 0.06, C.wood, sx, 0.7, sz - sd / 2 + 0.08), box(sw - 0.3, 0.05, sd - 0.3, C.straw, sx, 0.03, sz), sph(0.35, C.straw, sx + 0.6, 0.1, sz - 0.2, 1.4, 0.5, 1, 0, 0, 0, 8, 5));
  colliders.push({ x: sx, z: sz, hw: sw / 2 + 0.1, hd: sd / 2 + 0.1, rot: 0 });
  // Feed trough on four legs, full of hay, with a bucket beside it.
  const tx = h - 1.3, tz = -0.6;
  L.push(box(1.4, 0.05, 0.42, C.wood, tx, 0.36, tz), box(1.4, 0.2, 0.05, C.woodDark, tx, 0.45, tz - 0.2), box(1.4, 0.2, 0.05, C.woodDark, tx, 0.45, tz + 0.2), box(0.05, 0.2, 0.4, C.woodDark, tx - 0.7, 0.45, tz), box(0.05, 0.2, 0.4, C.woodDark, tx + 0.7, 0.45, tz));
  for (const lx of [-0.6, 0.6]) for (const lz of [-0.15, 0.15]) L.push(seg([tx + lx, 0, tz + lz], [tx + lx, 0.36, tz + lz], 0.035, 0.035, C.woodDark, 5));
  L.push(sph(0.2, C.straw, tx, 0.5, tz, 3.2, 0.5, 1, 0, 0, 0, 8, 5), sph(0.14, 0xf0a04a, tx + 0.25, 0.53, tz + 0.04, 1, 0.9, 1, 0, 0, 0, 7, 5));
  colliders.push({ x: tx, z: tz, hw: 0.75, hd: 0.25, rot: 0 });
  L.push(cyl(0.15, 0.12, 0.24, C.blue, h - 1.6, 0.12, 1.4, 10), cyl(0.15, 0.15, 0.02, 0x3f7fb0, h - 1.6, 0.235, 1.4, 10));
  for (let i = 0; i < 5; i++) L.push(sph(0.08, C.straw, (rand() - 0.5) * (size - 1.5), 0.03, (rand() - 0.5) * (size - 1.5), 1.6, 0.3, 1, 0, rand() * 3, 0, 6, 4));
  return { group: scenery(L), colliders };
}

// A hay shelter: a thatched roof on four posts, stacked bales, and tools leaning against the posts.
export function buildHayShelter() {
  const L = [], colliders = [], w = 3.2, d = 2.4, hx = w / 2 - 0.1, hz = d / 2 - 0.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { L.push(cyl(0.07, 0.085, 2.5, C.woodDark, sx * hx, 0.75, sz * hz, 7)); colliders.push({ x: sx * hx, z: sz * hz, r: 0.13 }); }
  for (const sz of [-1, 1]) L.push(box(w + 0.1, 0.12, 0.12, C.wood, 0, 1.97, sz * hz));
  for (const sx of [-1, 1]) L.push(box(0.12, 0.12, d + 0.1, C.wood, sx * hx, 1.97, 0));
  // Thick thatched roof with a ridge, hanging past the posts.
  L.push(M(roofGeometry(w + 1.1, 1.15, d + 0.8), C.thatch, 0, 2.0, 0), box(0.16, 0.08, d + 0.9, mix(C.thatch, 0x5a3a10, 0.4), 0, 3.06, 0));
  for (const sz of [-1, 1]) L.push(box(w + 1.05, 0.07, 0.07, mix(C.thatch, 0x8a6a28, 0.35), 0, 1.96, sz * (d / 2 + 0.4)));
  // Hay bales: roped rectangular blocks stacked against the back, a loose heap, and a round bale outside.
  const bale = (x, y, z, ry = 0) => { L.push(box(0.9, 0.45, 0.55, C.straw, x, y, z, ry), box(0.92, 0.47, 0.06, C.strap, x - 0.22, y, z, ry), box(0.92, 0.47, 0.06, C.strap, x + 0.22, y, z, ry)); };
  bale(-0.95, 0.24, -0.78); bale(0, 0.24, -0.78); bale(0.95, 0.24, -0.78); bale(-0.5, 0.7, -0.78); bale(0.5, 0.7, -0.78);
  L.push(sph(0.45, C.straw, 0.9, 0.12, 0.35, 1.5, 0.45, 1.1, 0, 0, 0, 8, 5), sph(0.3, 0xf0cc6a, 1.2, 0.1, 0.65, 1.2, 0.4, 1, 0, 0, 0, 8, 5));
  const round = cyl(0.5, 0.5, 0.95, C.straw, 2.5, 0.5, 0.2, 14); round.rotation.z = Math.PI / 2; L.push(round);
  for (const e of [-1, 1]) L.push(M(new THREE.CylinderGeometry(0.49, 0.49, 0.04, 14), C.strap, 2.5 + e * 0.2, 0.5, 0.2, 1, 1, 1, 0, 0, Math.PI / 2));
  colliders.push({ x: 0, z: -0.78, hw: 1.4, hd: 0.3, rot: 0 }, { x: 2.5, z: 0.2, r: 0.55 });
  // Tools leaning on the posts: a pitchfork and rake on the right, a spade and hoe on the left.
  const lean = (bx, bz, tx, ty, tz, hex = C.wood) => L.push(seg([bx, 0.03, bz], [tx, ty, tz], 0.024, 0.02, hex, 6));
  lean(1.95, 0.5, hx + 0.05, 1.75, 0.52);                                                       // pitchfork handle
  L.push(seg([hx + 0.05, 1.75, 0.38], [hx + 0.05, 1.75, 0.66], 0.015, 0.015, C.metal, 5));
  for (const o of [-0.13, 0, 0.13]) L.push(seg([hx + 0.05, 1.75, 0.52 + o], [hx + 0.02, 2.12, 0.52 + o], 0.014, 0.006, C.metal, 4));
  L.push(seg([hx + 0.05, 1.75, 0.38], [hx + 0.05, 1.89, 0.38], 0.014, 0.014, C.metal, 4), seg([hx + 0.05, 1.75, 0.66], [hx + 0.05, 1.89, 0.66], 0.014, 0.014, C.metal, 4));
  lean(1.95, -0.2, hx + 0.05, 1.7, -0.22);                                                      // rake handle
  L.push(seg([hx + 0.05, 1.7, -0.45], [hx + 0.05, 1.7, 0.0], 0.02, 0.02, C.metal, 5));
  for (let i = 0; i < 6; i++) L.push(seg([hx + 0.05, 1.7, -0.43 + i * 0.086], [hx + 0.1, 1.5, -0.43 + i * 0.086], 0.012, 0.007, C.metal, 4));
  lean(-1.95, -0.3, -hx - 0.05, 1.5, -0.35);                                                    // spade: handle and blade
  L.push(box(0.2, 0.26, 0.025, C.metal, -1.98, 0.17, -0.3), box(0.2, 0.04, 0.04, C.woodDark, -hx - 0.05, 1.5, -0.35));
  lean(-1.9, 0.5, -hx - 0.05, 1.65, 0.55);                                                      // hoe
  L.push(box(0.2, 0.025, 0.04, C.metal, -hx - 0.09, 1.66, 0.55), box(0.04, 0.2, 0.025, C.metal, -hx - 0.17, 1.58, 0.55));
  return { group: scenery(L), colliders };
}

// A cheerful scarecrow: pumpkin head with a smile, straw hat with a sunflower, patched teal shirt, scarf, and a little bird on its arm.
export function buildScarecrow() {
  const L = [], colliders = [{ x: 0, z: 0, r: 0.3 }];
  const teal = 0x4aa6a3, pants = 0x5b78c9, boot = 0x6a4631, pump = C.orange, pumpDark = 0xe97a22, strawHat = 0xe9c868;
  L.push(cyl(0.05, 0.06, 2.3, C.wood, 0, 0.75, -0.05, 7), sph(0.3, 0xa07650, 0, 0.04, -0.05, 1, 0.3, 1, 0, 0, 0, 8, 5));
  L.push(seg([-0.78, 1.43, -0.05], [0.78, 1.43, -0.05], 0.035, 0.035, C.wood, 6));            // cross bar the arms hang on
  L.push(sph(0.3, teal, 0, 1.2, 0, 0.9, 1.1, 0.75, 0, 0, 0, 12, 9));                          // stuffed shirt
  for (const [x, y, c, s] of [[0.1, 1.27, 0xf4c84a, 1], [-0.12, 1.1, 0xe35d4f, 0.9]]) L.push(box(0.13 * s, 0.13 * s, 0.04, c, x, y, 0.2 * 1.02, 0.2));
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 6, 16), dye(0xc08a4a)); belt.rotation.x = Math.PI / 2; belt.scale.set(1.15, 0.95, 1); belt.position.set(0, 1.02, 0); L.push(belt);
  for (const s of [-1, 1]) {                                                                   // sleeves and straw hands
    L.push(seg([s * 0.2, 1.4, 0], [s * 0.62, 1.43, -0.04], 0.11, 0.085, teal, 8), sph(0.085, teal, s * 0.64, 1.43, -0.04, 1, 1, 1, 0, 0, 0, 8, 6));
    for (let k = 0; k < 6; k++) { const a = k * 1.05; L.push(seg([s * 0.66, 1.43, -0.04], [s * (0.78 + Math.cos(a) * 0.04), 1.43 + Math.sin(a) * 0.1, -0.04 + Math.cos(a * 2) * 0.08], 0.016, 0.004, C.straw, 4)); }
    L.push(seg([s * 0.1, 1.0, 0.03], [s * 0.12, 0.5, 0.08], 0.1, 0.075, pants, 8), sph(0.095, boot, s * 0.12, 0.42, 0.14, 1, 0.8, 1.5, 0, 0, 0, 9, 6)); // dangling legs and boots
  }
  // Scarf round the neck with a tail blowing out the side.
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 7, 14), dye(0xe0554c)); scarf.rotation.x = Math.PI / 2; scarf.position.set(0, 1.52, 0); L.push(scarf);
  L.push(seg([0.12, 1.5, 0.12], [0.22, 1.2, 0.2], 0.05, 0.04, 0xe0554c, 6), box(0.05, 0.05, 0.05, 0xf4c84a, 0.2, 1.38, 0.18));
  // Pumpkin head: three plump lobes, with a carved smile and triangle eyes.
  const hy = 1.8, hr = [0.255, 0.2, 0.232];
  L.push(sph(1, pump, 0, hy, 0, hr[0], hr[1], hr[2], 0, 0, 0, 14, 10), sph(1, pumpDark, 0.14, hy, 0, 0.17, 0.19, 0.22, 0, 0, 0, 12, 8), sph(1, pumpDark, -0.14, hy, 0, 0.17, 0.19, 0.22, 0, 0, 0, 12, 8));
  const onHead = (x, y) => hr[2] * Math.sqrt(Math.max(0.05, 1 - (x / hr[0]) ** 2 - ((y - hy) / hr[1]) ** 2));
  for (const s of [-1, 1]) {
    const e = M(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 3), C.dark, s * 0.09, hy + 0.04, onHead(s * 0.09, hy + 0.04) + 0.005, 1, 1, 1, Math.PI / 2, 0, Math.PI); L.push(e);
  }
  for (let i = 0; i <= 8; i++) { const x = (i / 8 - 0.5) * 0.2, y = hy - 0.12 + 0.07 * (x / 0.1) ** 2; L.push(sph(0.017, C.dark, x, y, onHead(x, y) + 0.008, 1, 1, 0.6, 0, 0, 0, 6, 4)); }
  // Straw hat with a red band and a sunflower.
  L.push(cyl(0.38, 0.4, 0.035, strawHat, 0, hy + 0.17, 0, 14), cyl(0.17, 0.2, 0.2, strawHat, 0, hy + 0.28, 0, 12), cyl(0.205, 0.205, 0.045, 0xd9534f, 0, hy + 0.2, 0, 12), sph(0.17, strawHat, 0, hy + 0.38, 0, 1, 0.4, 1, 0, 0, 0, 10, 5));
  const fx = 0.12, fz = 0.21;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; L.push(sph(0.032, 0xffd23f, fx + Math.cos(a) * 0.06, hy + 0.22 + Math.sin(a) * 0.06, fz + 0.01, 1, 1, 0.5, 0, 0, 0, 6, 4)); }
  L.push(sph(0.04, 0x6b4a2b, fx, hy + 0.22, fz + 0.02, 1, 1, 0.7, 0, 0, 0, 7, 5));
  // A little blue bird perched on the right arm.
  const bx = 0.42, by = 1.54;
  L.push(sph(0.06, 0x5ab0e8, bx, by, -0.04, 1, 0.9, 1.35, 0, 0, 0, 9, 6), sph(0.04, 0x5ab0e8, bx, by + 0.06, 0.04, 1, 1, 1, 0, 0, 0, 8, 6), sph(0.012, C.dark, bx + 0.032, by + 0.075, 0.06, 1, 1, 1, 0, 0, 0, 5, 4), sph(0.012, C.dark, bx - 0.032, by + 0.075, 0.06, 1, 1, 1, 0, 0, 0, 5, 4),
    M(new THREE.ConeGeometry(0.014, 0.04, 5), 0xffa63a, bx, by + 0.06, 0.1, 1, 1, 1, Math.PI / 2), seg([bx, by, -0.09], [bx, by + 0.02, -0.2], 0.03, 0.012, 0x3f8ccc, 5), sph(0.04, 0xf3e6c4, bx, by - 0.02, 0.0, 1, 0.8, 1.2, 0, 0, 0, 7, 5));
  return { group: scenery(L), colliders };
}

// A buffalo wallow: a muddy pool with a rim of churned earth, hoof prints and reeds.
export function buildWallow(radius = 3, skirt = 0.6) { // skirt: depth of the earth plug under it, for sloping ground
  const L = [], rand = rng(37);
  L.push(M(new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, skirt, 32), C.dirt, 0, 0.01 - skirt / 2, 0));      // trampled dry earth round it, a plug that reaches down into sloping ground
  L.push(sheet(new THREE.CylinderGeometry(radius * 0.88, radius * 0.88, 0.05, 28), new THREE.MeshStandardMaterial({ color: 0x74523a, roughness: 0.3 }), 0, 0.035, 0));
  L.push(...lumpRing(radius * 0.97, Math.round(radius * 8), radius * 0.16, [0x9a7a55, 0x8a6a48, 0xa8865e], 0.07, rand));
  L.push(...lumpRing(radius * 1.12, Math.round(radius * 5), radius * 0.1, [0x9a7a55, 0xb08a5e], 0.04, rand, 0.15));
  for (let i = 0; i < 12; i++) { // hoof prints: pairs of dark crescents in the dirt
    const a = rand() * Math.PI * 2, r = radius * (1.15 + rand() * 0.12);
    for (const o of [-0.05, 0.05]) L.push(M(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 7), 0x4b3426, Math.cos(a) * r - Math.sin(a) * o, 0.02, Math.sin(a) * r + Math.cos(a) * o, 0.8, 1, 1.5, 0, a, 0));
  }
  L.push(sph(0.1, 0x5a3e2c, radius * 0.3, 0.06, -radius * 0.2, 1, 0.3, 1, 0, 0, 0, 7, 4));
  for (let i = 0; i < 5; i++) { const a = 0.4 + i * 1.25; L.push(...reeds(Math.cos(a) * radius * 1.05, Math.sin(a) * radius * 1.05, a, rand, 8, 1.3)); }
  return { group: scenery(L, false), colliders: [] };
}

// An orchard tree. kind 0 = banana plant, 1 = mango tree, 2 = papaya.
export function buildOrchardTree(kind = 0) {
  const L = [], rand = rng(41 + kind * 7);
  kind = ((Math.round(kind) % 3) + 3) % 3;
  if (kind === 0) {
    // Banana: a thick green pseudo-stem, big arching leaves, a purple flower bud and hanging yellow hands of fruit.
    L.push(seg([0, 0, 0], [0.02, 2.2, 0.06], 0.17, 0.1, 0x8aae4e, 8), sph(0.22, 0x7da046, 0, 0.1, 0, 1, 0.55, 1, 0, 0, 0, 8, 5));
    for (const y of [0.5, 1.0, 1.5]) L.push(sph(0.14, 0x76993f, 0.01, y, 0.02, 1, 0.2, 1, 0, 0, 0, 8, 4));
    const top = [0.02, 2.2, 0.06];
    for (let i = 0; i < 8; i++) {
      const phi = (i / 8) * Math.PI * 2 + rand() * 0.3, lg = new THREE.Group(); lg.position.set(...top); lg.rotation.y = phi;
      const c1 = i % 2 ? 0x5db04a : 0x73c458;
      lg.add(seg([0, 0, 0], [0, 0.25, 0.45], 0.025, 0.02, 0x7da046, 5), sph(1, c1, 0, 0.45, 0.85, 0.36, 0.025, 0.62, -0.22, 0, 0, 9, 6), sph(1, c1, 0, 0.28, 1.5, 0.32, 0.025, 0.6, 0.85, 0, 0, 9, 6));
      L.push(...lg.children);
    }
    L.push(seg(top, [0.02, 2.1, 0.45], 0.035, 0.03, 0x7da046, 5), seg([0.02, 2.1, 0.45], [0.02, 1.8, 0.6], 0.035, 0.03, 0x7da046, 5));
    for (const [hy, n] of [[2.05, 6], [1.88, 6], [1.71, 5]]) for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = 0.02 + Math.cos(a) * 0.09, pz = 0.55 + Math.sin(a) * 0.09;
      L.push(seg([px, hy, pz], [px + Math.cos(a) * 0.07, hy - 0.3, pz + Math.sin(a) * 0.07 + 0.02], 0.045, 0.03, k % 3 ? 0xf2d447 : 0xdcd24a, 6));
    }
    L.push(sph(0.12, 0x8e3a6b, 0.02, 1.42, 0.62, 0.8, 1.6, 0.8, 0, 0, 0, 8, 6));
    return { group: scenery(L), colliders: [{ x: 0, z: 0, r: 0.22 }] };
  }
  if (kind === 1) {
    // Mango: a sturdy trunk, a round dark-green crown of lobes, and hanging mangoes in yellow, orange and green.
    L.push(seg([0, 0, 0], [0.04, 1.35, 0], 0.2, 0.13, 0x7d5a40, 8), sph(0.28, 0x7d5a40, 0, 0.08, 0, 1, 0.5, 1, 0, 0, 0, 8, 5));
    for (const [x, z] of [[0.55, 0.25], [-0.5, -0.2], [0.1, -0.55]]) L.push(seg([0.04, 1.1, 0], [x, 1.85, z], 0.08, 0.05, 0x7d5a40, 6));
    const lobes = [[0, 2.35, 0, 1.0], [0.75, 2.05, 0.2, 0.75], [-0.75, 2.1, -0.15, 0.78], [0.2, 2.1, 0.8, 0.72], [-0.2, 2.15, -0.8, 0.72], [0, 3.0, 0.05, 0.7], [0.5, 2.7, -0.4, 0.62], [-0.5, 2.7, 0.4, 0.62]];
    lobes.forEach(([x, y, z, r], i) => L.push(sph(r, [0x4d9a4a, 0x5aa655, 0x3f8a46, 0x62b05a][i % 4], x, y, z, 1, 0.85, 1, 0, 0, 0, 12, 8)));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rand() * 0.4, r = 0.8 + rand() * 0.55, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 1.3 + rand() * 0.2;
      L.push(seg([x, y + 0.4, z], [x, y + 0.1, z], 0.014, 0.014, 0x5a3e28, 4), sph(0.125, [0xf4a83c, 0xe9663f, 0x9ac24c, 0xf4c24a][k % 4], x, y, z, 0.9, 1.25, 0.9, 0, 0, 0, 8, 6));
    }
    return { group: scenery(L), colliders: [{ x: 0, z: 0, r: 0.26 }] };
  }
  // Papaya: a slim tan trunk with leaf scars, a crown of big lobed leaves on long stalks, and orange fruit under the crown.
  L.push(seg([0, 0, 0], [0.06, 2.3, 0], 0.11, 0.08, 0xb7a56a, 7), sph(0.14, 0xb7a56a, 0, 0.06, 0, 1, 0.5, 1, 0, 0, 0, 7, 4));
  for (let k = 0; k < 6; k++) L.push(sph(0.1, 0x9d8c55, 0.015 + k * 0.01, 0.35 + k * 0.33, 0, 1, 0.2, 1, 0, 0, 0, 7, 4));
  const crown = [0.06, 2.3, 0];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, up = i % 2 ? 0.55 : 0.3, ex = crown[0] + Math.cos(a) * 1.0, ey = crown[1] + up + (i % 2 ? 0.1 : 0), ez = Math.sin(a) * 1.0;
    L.push(seg(crown, [ex, ey, ez], 0.03, 0.018, 0x8aae4e, 5));
    const c = i % 2 ? 0x5aaa4a : 0x4a9a44;
    L.push(sph(0.3, c, ex, ey + 0.02, ez, 1, 0.12, 1, 0, 0, 0, 8, 5));
    for (let k = 0; k < 5; k++) { const b = (k / 5) * Math.PI * 2 + a; L.push(sph(0.2, c, ex + Math.cos(b) * 0.3, ey + 0.02 - Math.sin(b - a) * 0.01, ez + Math.sin(b) * 0.3, 1, 0.12, 1, 0, 0, 0, 7, 4)); }
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, x = 0.06 + Math.cos(a) * 0.15, z = Math.sin(a) * 0.15, y = 2.05 - (k % 2) * 0.12;
    L.push(sph(0.1, [0xf5a43a, 0xf2b23e, 0x9bc24c][k % 3], x, y, z, 0.9, 1.5, 0.9, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25, 8, 6));
  }
  return { group: scenery(L), colliders: [{ x: 0, z: 0, r: 0.18 }] };
}

// Preview shortcuts: the preview calls builders with no arguments, so each tree kind gets its own name.
export const buildBananaTree = () => buildOrchardTree(0);
export const buildMangoTree = () => buildOrchardTree(1);
export const buildPapayaTree = () => buildOrchardTree(2);

// A duck pond: round, with a bed, still water, a bank of lumpy earth and stones, lily pads, pink lotus flowers and reeds.
export function buildDuckPond(radius = 3.5, skirt = 0.6) { // skirt: depth of the grassy plug under it, for sloping ground
  const L = [], rand = rng(53);
  L.push(M(new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, skirt, 36), C.grass, 0, 0.015 - skirt / 2, 0));      // grassy fringe, a plug that reaches down into sloping ground
  L.push(M(new THREE.CylinderGeometry(radius * 0.97, radius * 0.97, 0.03, 32), 0x4e8f95, 0, 0.03, 0));       // pond bed
  L.push(...lumpRing(radius * 1.0, Math.round(radius * 8), radius * 0.12, [0x9c7b56, 0x8b6c4b, 0xa98a62], 0.08, rand));
  for (let i = 0; i < Math.round(radius * 3); i++) { const a = rand() * Math.PI * 2, r = radius * (0.98 + rand() * 0.1); L.push(sph(0.14 + rand() * 0.1, C.stone, Math.cos(a) * r, 0.1, Math.sin(a) * r, 1, 0.7, 1, 0, 0, 0, 7, 5)); }
  L.push(sheet(new THREE.CircleGeometry(radius * 0.96, 36), waterMat(0x6fc3d0, 0.72, 0.1), 0, 0.085, 0, -Math.PI / 2));
  for (let i = 0; i < 9; i++) { // lily pads: flat round leaves with a notch cut out
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius * 0.68, s = 0.28 + rand() * 0.16, x = Math.cos(a) * r, z = Math.sin(a) * r;
    L.push(M(new THREE.CylinderGeometry(s, s, 0.015, 12, 1, false, rand() * 6, Math.PI * 2 - 0.5), i % 2 ? 0x4faa55 : 0x62b85d, x, 0.1, z));
    if (i % 3 === 0) { for (let k = 0; k < 6; k++) { const b = (k / 6) * Math.PI * 2; L.push(sph(0.055, 0xf7a6c8, x + Math.cos(b) * 0.05, 0.14, z + Math.sin(b) * 0.05, 1, 1.6, 0.55, Math.sin(b) * 0.5, -b, Math.cos(b) * 0.5, 6, 4)); } L.push(sph(0.035, 0xffd23f, x, 0.145, z, 1, 1, 1, 0, 0, 0, 6, 4)); }
  }
  for (let i = 0; i < 4; i++) { const a = 0.6 + i * 1.7; L.push(...reeds(Math.cos(a) * radius * 1.02, Math.sin(a) * radius * 1.02, a, rand, 8, 1.3)); }
  return { group: scenery(L, false), colliders: [{ x: 0, z: 0, r: radius * 0.9 }] };
}

// =================================================================================================
// ANIMALS
// =================================================================================================
// Both animals keep their moving parts on pivots: body, head (with horns, eyes, neck), jaw, two ears, tail, four legs.
// Each is welded into a single mesh. Only the body and head cast shadows. A `rig` group above everything
// lets the animal bob, rear up or sink without touching the group the game positions.

// Walk cycle shared by both: legs in diagonal pairs, with the cycle rate set so the feet do not slide.
function gaitRate(speed, legLen, swing) { return Math.min(4, speed / (2 * legLen * Math.sin(swing))); } // cycles per second

// A small goat with horns, ears, a beard and a tail. Modes: 'stand', 'graze', 'walk', 'butt'.
export function buildGoat(color = 0xeadcc0) {
  const fur = color, dark = mix(color, 0x4a3b34, 0.35), light = mix(color, 0xffffff, 0.5), hoof = 0x3f322d, horn = 0xe6dabd, eye = 0x2b2220, pink = 0xe9a3a0;
  const group = new THREE.Group(), rig = new THREE.Group(); group.add(rig);
  const body = part([
    sph(0.21, fur, 0, 0.5, -0.02, 0.92, 0.9, 1.6, 0, 0, 0, 18, 12), sph(0.15, fur, 0, 0.52, 0.17, 1.0, 1.0, 0.9, 0, 0, 0, 12, 9), sph(0.16, fur, 0, 0.5, -0.19, 1.0, 0.98, 0.95, 0, 0, 0, 12, 9),
  ], true);
  // Head on a neck that hinges at the shoulder: neck, skull, muzzle, nose, eyes and swept-back horns.
  const headParts = [
    seg([0, 0, 0], [0, 0.2, 0.12], 0.1, 0.07, fur, 9), sph(0.11, fur, 0, 0.0, -0.01, 1, 1, 1, 0, 0, 0, 9, 6),
    sph(0.085, fur, 0, 0.235, 0.17, 0.86, 0.95, 1.2, 0, 0, 0, 12, 9), sph(0.055, light, 0, 0.2, 0.255, 0.9, 0.8, 1.25, 0, 0, 0, 10, 7), sph(0.02, pink, 0, 0.207, 0.315, 1, 0.8, 0.8, 0, 0, 0, 6, 5),
  ];
  for (const s of [-1, 1]) {
    headParts.push(sph(0.015, eye, s * 0.064, 0.255, 0.21, 1, 1, 1, 0, 0, 0, 6, 5));
    headParts.push(seg([s * 0.04, 0.295, 0.14], [s * 0.055, 0.375, 0.10], 0.028, 0.02, horn, 6), seg([s * 0.055, 0.375, 0.10], [s * 0.05, 0.435, 0.03], 0.02, 0.007, horn, 6));
  }
  const head = pivot(0, 0.52, 0.27, part(headParts, true));
  const ear = (s) => pivot(s * 0.07, 0.265, 0.14, part([sph(0.06, dark, s * 0.065, 0, 0, 1.45, 0.25, 0.75, 0, 0, 0, 8, 5), sph(0.035, pink, s * 0.07, 0.012, 0.005, 1.3, 0.15, 0.6, 0, 0, 0, 6, 4)]));
  const earL = ear(-1), earR = ear(1); earL.rotation.z = 0.35; earR.rotation.z = -0.35;
  const jaw = pivot(0, 0.2, 0.225, part([sph(0.04, light, 0, -0.014, 0.04, 1, 0.6, 1.6, 0, 0, 0, 8, 5), seg([0, -0.025, 0.07], [0, -0.14, 0.055], 0.022, 0.005, horn, 5)]));
  head.add(earL, earR, jaw);
  const tail = pivot(0, 0.6, -0.3, part([seg([0, 0, 0], [0, 0.12, -0.06], 0.03, 0.014, fur, 6), sph(0.02, dark, 0, 0.125, -0.065, 1, 1, 1, 0, 0, 0, 5, 4)]));
  // Legs hang from the hip pivot and bend at a knee (a hock on the hind legs): the upper leg is one mesh, the
  // lower leg and dark hoof another on a knee pivot, so a stepping foot folds up instead of swinging stiff.
  const leg = (x, z, hind) => {
    const upper = hind
      ? [sph(0.06, fur, 0, -0.03, 0, 1, 1.3, 1.1, 0, 0, 0, 8, 6), seg([0, -0.02, 0], [0, -0.2, 0.03], 0.048, 0.03, fur, 7)]
      : [sph(0.05, fur, 0, -0.03, 0, 1, 1.3, 1.1, 0, 0, 0, 8, 6), seg([0, -0.02, 0], [0, -0.2, 0], 0.04, 0.03, dark, 7), sph(0.03, dark, 0, -0.2, 0, 1, 1, 1, 0, 0, 0, 7, 5)];
    const lower = hind
      ? [sph(0.03, dark, 0, 0, 0, 1, 1, 1, 0, 0, 0, 7, 5), seg([0, 0, 0], [0, -0.17, -0.035], 0.03, 0.024, dark, 7), seg([0, -0.17, -0.035], [0, -0.235, -0.035], 0.03, 0.034, hoof, 6)]
      : [seg([0, 0, 0], [0, -0.17, 0], 0.03, 0.026, dark, 7), seg([0, -0.17, 0], [0, -0.235, 0], 0.028, 0.033, hoof, 6)];
    const g = pivot(x, 0.44, z, part(upper)), knee = pivot(0, -0.2, hind ? 0.03 : 0, part(lower)); g.add(knee); g.knee = knee;
    return g;
  };
  const FL = leg(-0.1, 0.2, false), FR = leg(0.1, 0.2, false), BL = leg(-0.1, -0.2, true), BR = leg(0.1, -0.2, true);
  rig.add(body, head, tail, FL, FR, BL, BR);

  const S = { last: null, phase: 0, walk: 0, graze: 0, pitch: 0, butt: 0 }, A = 0.5, LEG = 0.43;
  function animate(elapsed, opts = {}) {
    const mode = opts.mode || 'stand', speed = opts.speed || 0;
    const dt = S.last === null ? 0 : Math.min(0.1, Math.max(0, elapsed - S.last)), k = S.last === null ? 1 : 1 - Math.exp(-dt * 6); S.last = elapsed;
    const moving = mode === 'walk' && speed > 0.02;
    S.walk += ((moving ? 1 : 0) - S.walk) * k; S.graze += ((mode === 'graze' ? 1 : 0) - S.graze) * k; S.butt += ((mode === 'butt' ? 1 : 0) - S.butt) * k;
    if (moving) S.phase += dt * Math.PI * 2 * gaitRate(speed, LEG, A);
    const p = S.phase, t = elapsed;
    // Legs in diagonal pairs: front-left with back-right, then front-right with back-left. A swinging foot folds up at the knee.
    const swing = (leg, ph) => {
      const fwd = Math.max(0, -Math.cos(ph)); // 0..1 while the foot is carried forward
      leg.rotation.x = Math.sin(ph) * A * S.walk; leg.position.y = 0.44 + fwd * 0.02 * S.walk; leg.knee.rotation.x = (fwd ** 0.7) * 1.0 * S.walk;
    };
    swing(FL, p); swing(BR, p); swing(FR, p + Math.PI); swing(BL, p + Math.PI);
    // Butt: a repeating 2.6 s cycle of rearing back, a short lunge, then settling.
    const u = (t % 2.6) / 2.6;
    let rear = 0, lunge = 0;
    if (u < 0.45) rear = smooth(u / 0.45); else if (u < 0.6) { rear = 1 - smooth((u - 0.45) / 0.15); lunge = smooth((u - 0.45) / 0.15); } else { lunge = 1 - smooth((u - 0.6) / 0.3); }
    const bw = S.butt, pitchRig = (-0.38 * rear + 0.16 * lunge) * bw;
    // Grazing: the whole front dips (legs stay upright), the neck stretches down and forward so the muzzle meets the grass.
    const dip = 0.22 * S.graze;
    rig.rotation.x = pitchRig + dip; rig.position.y = 0.2 * Math.abs(Math.sin(pitchRig)) + Math.abs(Math.cos(p * 2)) * 0.012 * S.walk;
    rig.position.z = (-0.12 * rear + 0.28 * lunge) * bw; rig.rotation.z = Math.sin(p) * 0.03 * S.walk;
    for (const f of [FL, FR]) { f.rotation.x += (-0.9 * rear + 0.35 * lunge) * bw - dip; f.position.y += 0.2 * Math.sin(dip); }
    for (const b of [BL, BR]) { b.rotation.x += 0.15 * rear * bw - dip; b.position.y -= 0.2 * Math.sin(dip); }
    head.position.set(0, 0.52 - 0.14 * S.graze, 0.27 + 0.06 * S.graze);
    // Head: down to nibble when grazing (with small dips), tucked toward the ground when butting, bobbing when walking.
    const nibble = Math.sin(t * 3.1) * 0.07 + Math.max(0, Math.sin(t * 0.5) * 3 - 2) * -0.4;
    const target = 2.0 * S.graze + nibble * S.graze + (0.9 * lunge + 0.3 * rear) * bw + Math.sin(p * 2) * 0.05 * S.walk + Math.sin(t * 0.7) * 0.03;
    S.pitch += (target - S.pitch) * Math.min(1, k * 1.5 + 0.0001);
    head.rotation.x = S.pitch; head.rotation.y = Math.sin(t * 0.45) * 0.12 * (1 - S.graze);
    // Chewing: jaw opens and closes in bursts when standing, faster nibbling when grazing.
    const burst = clamp01((0.5 + 0.5 * Math.sin(t * 0.35) - 0.2) * 4), chew = lerp(Math.max(0, Math.sin(t * 6.5)) * 0.14 * burst, Math.max(0, Math.sin(t * 9)) * 0.2, S.graze);
    jaw.rotation.x = chew; jaw.position.x = Math.sin(t * 3.25) * 0.004 * (burst + S.graze);
    // Ears flick in quick twitches now and then, and bounce when walking.
    const flick = (o) => Math.max(0, Math.sin(t * 0.9 + o) - 0.9) * 10 * Math.sin(t * 38 + o) * 0.35;
    earL.rotation.z = 0.35 + flick(0) + Math.sin(p * 2) * 0.08 * S.walk; earR.rotation.z = -0.35 - flick(2.1) - Math.sin(p * 2) * 0.08 * S.walk;
    // Tail wags in happy bursts.
    tail.rotation.z = Math.sin(t * 9) * 0.45 * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.7))); tail.rotation.x = -0.2 * S.walk;
    body.scale.y = 1 + Math.sin(t * 1.8) * 0.012;
  }
  return { group, animate };
}

// A gentle water buffalo with big curved horns, about 1.3 m at the shoulder. Modes: 'stand', 'walk', 'wallow'.
export function buildBuffalo() {
  const hide = 0x8a7b74, hideDark = 0x6d605b, muzzleC = 0x5d514f, hornC = 0xe6dabd, hornTip = 0x50423c, hoof = 0x3d322e, eye = 0x201a18, belly = 0x9a8c85;
  const group = new THREE.Group(), rig = new THREE.Group(); group.add(rig);
  const body = part([
    sph(0.5, hide, 0, 0.9, 0, 0.82, 0.78, 1.4, 0, 0, 0, 18, 12), sph(0.37, hide, 0, 0.92, 0.36, 0.95, 0.96, 0.85, 0, 0, 0, 14, 10), sph(0.37, hide, 0, 0.9, -0.36, 0.95, 0.94, 0.85, 0, 0, 0, 14, 10),
    sph(0.3, hide, 0, 1.1, 0.5, 0.9, 0.7, 1.0, 0, 0, 0, 12, 8), sph(0.3, hide, 0, 1.0, 0.62, 0.9, 1, 1, 0, 0, 0, 12, 8), sph(0.32, belly, 0, 0.62, 0.05, 0.9, 0.55, 1.6, 0, 0, 0, 12, 8),
  ], true);
  // Head hangs low and forward from a thick neck: skull, brow boss, muzzle, nostrils, eyes and the big crescent horns.
  const hp = [
    seg([0, 0, 0], [0, -0.1, 0.34], 0.22, 0.17, hide, 10), sph(0.18, hide, 0, -0.2, 0.5, 0.9, 0.95, 1.3, 0, 0, 0, 14, 10), sph(0.12, hideDark, 0, -0.08, 0.42, 1.25, 0.7, 0.8, 0, 0, 0, 10, 7),
    sph(0.14, muzzleC, 0, -0.31, 0.68, 1, 0.85, 1.1, 0, 0, 0, 12, 9),
  ];
  for (const s of [-1, 1]) {
    hp.push(sph(0.03, eye, s * 0.062, -0.28, 0.8, 1, 0.8, 0.6, 0, 0, 0, 6, 4), sph(0.024, eye, s * 0.158, -0.14, 0.55, 1, 1, 1, 0, 0, 0, 6, 5));
    const pts = [[0.14, -0.08, 0.46], [0.27, -0.05, 0.41], [0.4, 0, 0.33], [0.5, 0.1, 0.26], [0.52, 0.24, 0.27], [0.47, 0.34, 0.34]], rad = [0.058, 0.052, 0.044, 0.035, 0.024, 0.008];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      hp.push(seg([s * a[0], a[1], a[2]], [s * b[0], b[1], b[2]], rad[i], rad[i + 1], i >= 3 ? hornTip : hornC, 7));
      if (i > 0) hp.push(sph(rad[i], i >= 3 ? hornTip : hornC, s * a[0], a[1], a[2], 1, 1, 1, 0, 0, 0, 7, 5));
    }
  }
  const head = pivot(0, 1.05, 0.62, part(hp, true));
  const ear = (s) => pivot(s * 0.17, -0.12, 0.38, part([sph(0.09, hide, s * 0.11, 0, 0, 1.5, 0.28, 0.8, 0, 0, 0, 9, 6), sph(0.05, 0xc89a8c, s * 0.12, 0.01, 0.005, 1.4, 0.2, 0.6, 0, 0, 0, 6, 4)]));
  const earL = ear(-1), earR = ear(1); earL.rotation.z = 0.3; earR.rotation.z = -0.3;
  const jaw = pivot(0, -0.36, 0.62, part([sph(0.1, muzzleC, 0, -0.01, 0.07, 1, 0.55, 1.3, 0, 0, 0, 10, 7)]));
  head.add(earL, earR, jaw);
  const tail = pivot(0, 1.08, -0.8, part([seg([0, 0, 0], [0, -0.2, -0.1], 0.04, 0.03, hide, 6), seg([0, -0.2, -0.1], [0, -0.55, -0.12], 0.03, 0.02, hideDark, 6), sph(0.07, 0x3a302d, 0, -0.62, -0.12, 0.9, 1.6, 0.9, 0, 0, 0, 7, 5)]));
  const leg = (x, z) => pivot(x, 0.63, z, part([sph(0.115, hide, 0, -0.04, 0, 0.9, 1.3, 1.0, 0, 0, 0, 9, 7), seg([0, -0.05, 0], [0, -0.5, 0], 0.1, 0.075, hideDark, 8), seg([0, -0.5, 0], [0, -0.63, 0], 0.08, 0.092, hoof, 7)]));
  const FL = leg(-0.27, 0.45), FR = leg(0.27, 0.45), BL = leg(-0.27, -0.45), BR = leg(0.27, -0.45);
  rig.add(body, head, tail, FL, FR, BL, BR);

  const S = { last: null, phase: 0, walk: 0, sink: 0, pitch: 0 }, A = 0.38, LEG = 0.63;
  function animate(elapsed, opts = {}) {
    const mode = opts.mode || 'stand', speed = opts.speed || 0;
    const dt = S.last === null ? 0 : Math.min(0.1, Math.max(0, elapsed - S.last)), k = S.last === null ? 1 : 1 - Math.exp(-dt * 4); S.last = elapsed;
    const moving = mode === 'walk' && speed > 0.02;
    S.walk += ((moving ? 1 : 0) - S.walk) * k; S.sink += ((mode === 'wallow' ? 1 : 0) - S.sink) * k * 0.6;
    if (moving) S.phase += dt * Math.PI * 2 * gaitRate(speed, LEG, A);
    const p = S.phase, t = elapsed, sk = smooth(S.sink);
    const swing = (leg, ph) => { leg.rotation.x = Math.sin(ph) * A * S.walk; leg.position.y = 0.63 + Math.max(0, -Math.cos(ph)) * 0.09 * S.walk; };
    swing(FL, p); swing(BR, p); swing(FR, p + Math.PI); swing(BL, p + Math.PI);
    // Wallowing: the body sinks until only the back shows, the head lifts clear, and slow breaths swell the ribs.
    const breath = Math.sin(t * 1.2);
    rig.position.y = -0.98 * sk + Math.abs(Math.cos(p * 2)) * 0.015 * S.walk + breath * 0.012 * sk; rig.rotation.z = Math.sin(p) * 0.025 * S.walk;
    body.scale.set(1 + breath * 0.012, 1 + breath * (0.012 + 0.012 * sk), 1);
    const target = -0.9 * sk + Math.sin(p * 2) * 0.04 * S.walk + Math.sin(t * 0.5) * 0.04;
    S.pitch += (target - S.pitch) * Math.min(1, k * 1.5); head.rotation.x = S.pitch; head.rotation.y = Math.sin(t * 0.3) * 0.12 * (1 - sk) + Math.sin(t * 0.25) * 0.08 * sk;
    // Slow chewing in bursts; ears flick now and then; the tail swishes side to side, slowly in the mud.
    const burst = clamp01((0.5 + 0.5 * Math.sin(t * 0.3) - 0.15) * 4), speedUp = 1 - 0.5 * sk;
    jaw.rotation.x = Math.max(0, Math.sin(t * 4 * speedUp)) * 0.12 * burst; jaw.position.x = Math.sin(t * 2 * speedUp) * 0.006 * burst;
    const flick = (o) => Math.max(0, Math.sin(t * 0.7 + o) - 0.88) * 8 * Math.sin(t * 30 + o) * 0.4;
    earL.rotation.z = 0.3 + flick(0) + Math.sin(p * 2) * 0.05 * S.walk; earR.rotation.z = -0.3 - flick(1.7) - Math.sin(p * 2) * 0.05 * S.walk;
    tail.rotation.z = Math.sin(t * 1.9 * speedUp) * 0.5 * (1 - 0.4 * sk); tail.rotation.x = Math.sin(t * 1.3) * 0.12;
  }
  return { group, animate };
}
