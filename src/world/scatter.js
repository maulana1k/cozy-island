import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, zoneAt } from '../logic/terrain.js';
import { getScatter, distanceToPath, jungleAt, COTTAGES, VILLAGE_CENTER, WINDMILL, FIELD, TENTS } from '../logic/layout.js';
import { POND, HILL } from '../config.js';
import { createRng } from '../logic/rng.js';
import { PALETTE, SEED } from '../config.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...extra });
const SHAKE_TIME = 0.8;
const GRASS_TUFTS = 7000;
const FERNS = 260;

// A faceted lump, squashed and placed.
function blob(x, y, z, sx, sy, sz, rot = 0) {
  const g = new THREE.DodecahedronGeometry(1, 0);
  g.rotateY(rot); g.scale(sx, sy, sz); g.translate(x, y, z);
  return g;
}
// A softer, rounder lump for leaves.
function leafy(x, y, z, sx, sy, sz, rot = 0) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.rotateY(rot); g.scale(sx, sy, sz); g.translate(x, y, z);
  return g;
}

// A clump of curved ribbons growing from one spot: blades of grass, or fern fronds.
// Each ribbon bends outward along its length and narrows to a soft tip. Vertex colours
// run darker at the base to lighter at the tip.
function ribbonClump({ blades, height, width, spread, droop, rows = 4, shape = 'blade' }) {
  const pos = [], nor = [], col = [];
  const frac = (v) => v - Math.floor(v);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + frac(b * 0.618) * 1.4;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const r0 = spread * frac(b * 0.37 + 0.2), hb = height * (0.6 + 0.4 * frac(b * 0.73)), bend = droop * (0.6 + 0.8 * frac(b * 0.29));
    const pts = [];
    for (let i = 0; i <= rows; i++) {
      const t = i / rows, out = r0 + bend * hb * t * t, y = hb * (t - 0.22 * bend * t * t);
      const w = width * (shape === 'frond' ? Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * t)), 0.7) : (1 - t * t * 0.92));
      pts.push([dx * out - px * w, y, dz * out - pz * w, dx * out + px * w, y, dz * out + pz * w, 0.8 + 0.2 * t]);
    }
    for (let i = 0; i < rows; i++) {
      const p = pts[i], q = pts[i + 1];
      const quad = [[p[0], p[1], p[2], p[6]], [p[3], p[4], p[5], p[6]], [q[0], q[1], q[2], q[6]], [p[3], p[4], p[5], p[6]], [q[3], q[4], q[5], q[6]], [q[0], q[1], q[2], q[6]]];
      for (const [x, y, z, shade] of quad) { pos.push(x, y, z); nor.push(dx * 0.25, 1, dz * 0.25); col.push(shade, shade, shade); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function stick(x0, y0, z0, x1, y1, z1, r0, r1) {
  const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 6).toNonIndexed();
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(x0, y0, z0);
  return g;
}

// Three kinds of tree: a tall umbrella pine, a low forked olive, and a slim cypress.
// A flat, rounded pad of foliage: the canopy of these trees is a few such pads, one at the end of each branch.
const pad = (x, y, z, w, h, d, rot = 0) => leafy(x, y, z, w, h, d, rot);

// Trees are a bare, slightly leaning trunk with branches, each carrying its own pad of leaves.
export const TREE_KINDS = [
  { // umbrella pine
    color: 0x56733f,
    trunk: () => mergeGeometries([stick(0, 0, 0, 0.3, 2.3, 0.05, 0.3, 0.22), stick(0.3, 2.3, 0.05, 0.15, 3.9, 0.1, 0.22, 0.15),
      stick(0.2, 3.3, 0.08, -1.3, 4.3, 0.35, 0.12, 0.07), stick(0.18, 3.6, 0.1, 1.35, 4.6, -0.4, 0.12, 0.07), stick(0.15, 3.9, 0.1, 0.25, 5.0, 0.95, 0.1, 0.06)]),
    canopy: () => mergeGeometries([pad(-1.45, 4.55, 0.4, 1.25, 0.42, 1.05, 0.4), pad(1.5, 4.85, -0.45, 1.3, 0.44, 1.1, 1.2), pad(0.3, 5.25, 1.05, 1.1, 0.4, 0.95, 2.1), pad(0.1, 5.5, -0.1, 1.45, 0.46, 1.25, 0.2)]),
    top: 4.7,
  },
  { // olive: low and wide, forking near the ground
    color: 0x82966a,
    trunk: () => mergeGeometries([stick(0, 0, 0, -0.1, 1.1, 0, 0.3, 0.2), stick(-0.1, 1.0, 0, -0.9, 2.0, 0.25, 0.15, 0.08), stick(-0.1, 1.0, 0, 0.8, 2.15, -0.2, 0.15, 0.08), stick(-0.1, 1.0, 0, 0.1, 2.3, 0.75, 0.12, 0.07)]),
    canopy: () => mergeGeometries([pad(-1.0, 2.3, 0.3, 0.95, 0.42, 0.85), pad(0.9, 2.45, -0.25, 1.0, 0.44, 0.9, 0.8), pad(0.1, 2.65, 0.85, 0.85, 0.4, 0.8, 1.6), pad(0, 2.9, -0.1, 0.9, 0.4, 0.85, 2.4)]),
    top: 2.6,
  },
  { // young pine: one trunk, one broad pad and a smaller one
    color: 0x4c6a3c,
    trunk: () => mergeGeometries([stick(0, 0, 0, 0.12, 2.7, 0, 0.2, 0.12), stick(0.1, 2.0, 0, -0.75, 2.75, 0.2, 0.08, 0.05)]),
    canopy: () => mergeGeometries([pad(0.12, 3.05, 0, 1.2, 0.45, 1.05), pad(-0.85, 2.85, 0.25, 0.7, 0.32, 0.62, 1)]),
    top: 3.0,
  },
  { // palm: a leaning trunk with drooping fronds
    color: 0x7f9a55,
    trunk: () => mergeGeometries([stick(0, 0, 0, 0.25, 1.7, 0, 0.24, 0.18), stick(0.25, 1.7, 0, 0.7, 3.3, 0, 0.18, 0.15), stick(0.7, 3.3, 0, 0.95, 4.7, 0, 0.15, 0.12)]),
    canopy: () => {
      const fronds = [];
      for (let i = 0; i < 8; i++) {
        const g = new THREE.ConeGeometry(0.34, 2.5, 4).toNonIndexed();
        g.scale(1, 1, 0.22); g.translate(0, 1.25, 0); g.rotateZ(-1.15 - (i % 2) * 0.35); g.rotateY((i / 8) * Math.PI * 2); g.translate(0.95, 4.65, 0);
        fronds.push(g);
      }
      fronds.push(blob(0.95, 4.7, 0, 0.3, 0.3, 0.3));
      return mergeGeometries(fronds);
    },
    top: 4.4,
  },
  { // old pine: a thick, tall trunk and a wide crown of big pads
    color: 0x455f39,
    trunk: () => mergeGeometries([stick(0, 0, 0, 0.35, 3.0, 0.1, 0.48, 0.36), stick(0.35, 3.0, 0.1, 0.2, 5.2, 0.15, 0.36, 0.22),
      stick(0.3, 4.2, 0.12, -2.0, 5.5, 0.5, 0.17, 0.09), stick(0.28, 4.6, 0.12, 2.1, 5.9, -0.6, 0.17, 0.09), stick(0.22, 5.0, 0.14, 0.3, 6.3, 1.7, 0.14, 0.08), stick(0.22, 5.1, 0.14, 0.1, 6.5, -1.5, 0.14, 0.08)]),
    canopy: () => mergeGeometries([pad(-2.2, 5.8, 0.55, 1.75, 0.55, 1.5, 0.5), pad(2.3, 6.2, -0.65, 1.8, 0.56, 1.55, 1.3), pad(0.35, 6.6, 1.9, 1.5, 0.5, 1.3, 2.2), pad(0.1, 6.8, -1.65, 1.5, 0.5, 1.3, 0.9), pad(0.15, 7.1, 0.1, 2.0, 0.6, 1.8, 0.1)]),
    top: 5.8,
  },
  { // sapling
    color: 0x7f9a5e,
    trunk: () => mergeGeometries([stick(0, 0, 0, 0.05, 1.5, 0, 0.09, 0.06), stick(0.03, 1.0, 0, 0.4, 1.6, 0.1, 0.04, 0.03), stick(0.03, 1.1, 0, -0.35, 1.7, -0.1, 0.04, 0.03)]),
    canopy: () => mergeGeometries([pad(0.05, 1.95, 0, 0.75, 0.38, 0.7), pad(0.5, 1.72, 0.15, 0.45, 0.26, 0.42, 1), pad(-0.45, 1.82, -0.15, 0.48, 0.28, 0.44, 2)]),
    top: 1.9,
  },
];

export const fernGeometry = () => ribbonClump({ blades: 9, height: 0.95, width: 0.13, spread: 0.06, droop: 1.5, rows: 5, shape: 'frond' });
// Soft grass: many thin curved blades, most of them short.
// Tall dry grass: clumps of broad, flat blades standing nearly straight, bending a little at the tip.
export const tuftGeometry = () => ribbonClump({ blades: 9, height: 0.8, width: 0.05, spread: 0.2, droop: 0.42, rows: 2 });

// A chunky angular block of stone with a flat top.
export function rockGeometry() {
  const g = new THREE.DodecahedronGeometry(0.75, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * 1.15, Math.max(-0.3, Math.min(0.42, p.getY(i))), p.getZ(i) * 0.9);
  g.translate(0, 0.25, 0); g.computeVertexNormals();
  return g;
}

// A rounded leafy bush made of a few lumps.
export function bushGeometry() {
  return mergeGeometries([leafy(0, 0.42, 0, 0.62, 0.48, 0.58), leafy(0.42, 0.32, 0.12, 0.42, 0.36, 0.4, 1), leafy(-0.4, 0.3, -0.1, 0.44, 0.34, 0.42, 2), leafy(0.05, 0.3, -0.42, 0.38, 0.32, 0.36, 3), leafy(-0.05, 0.62, 0.2, 0.36, 0.3, 0.34, 4)]);
}

export function createScatter(scene) {
  const data = getScatter();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // ---- Trees: per kind, one instanced trunk mesh and one instanced canopy mesh.
  const byKind = TREE_KINDS.map((_, k) => data.trees.filter((t) => t.kind === k));
  const kinds = TREE_KINDS.map((def, k) => {
    const list = byKind[k], n = Math.max(1, list.length);
    const trunk = new THREE.InstancedMesh(def.trunk(), flat(PALETTE.treeTrunk), n);
    const canopy = new THREE.InstancedMesh(def.canopy(), flat(0xffffff), n);
    for (const m of [trunk, canopy]) { m.count = list.length; m.castShadow = true; m.receiveShadow = true; }
    list.forEach((t, i) => {
      // Slightly different tint per tree so the woods do not look stamped out.
      canopy.setColorAt(i, color.setHex(def.color).offsetHSL(Math.sin(t.x * 12.9 + t.z * 78.2) * 0.015, 0, Math.cos(t.x * 3.1) * 0.035));
    });
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    return { trunk, canopy };
  });
  const trees = data.trees.map((t) => ({
    ...t, y: heightAt(t.x, t.z) - 0.05, index: byKind[t.kind].indexOf(t),
    phase: (t.x * 0.37 + t.z * 0.53) % 6.28, shakeStart: -10,
  }));
  const treeById = new Map(trees.map((t) => [t.id, t]));

  function placeTree(t, tiltX, tiltZ) {
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(tiltX, t.rot, tiltZ, 'YXZ');
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    kinds[t.kind].trunk.setMatrixAt(t.index, dummy.matrix);
    kinds[t.kind].canopy.setMatrixAt(t.index, dummy.matrix);
  }
  trees.forEach((t) => placeTree(t, 0, 0));
  dummy.rotation.order = 'XYZ';

  // ---- Spiky bushes
  const bushes = new THREE.InstancedMesh(bushGeometry(), flat(0xffffff), data.bushes.length);
  bushes.castShadow = true; bushes.receiveShadow = true;
  data.bushes.forEach((b, i) => {
    dummy.position.set(b.x, heightAt(b.x, b.z) - 0.05, b.z); dummy.rotation.set(0, b.rot, 0); dummy.scale.setScalar(b.scale * 1.15); dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
    bushes.setColorAt(i, color.setHex(jungleAt(b.x, b.z) > 0.5 ? [0x5f9a4c, 0x4f8a48][i % 2] : [0x93ae6c, 0xa9b874, 0x7f9f60][i % 3]).offsetHSL(0, 0, Math.sin(i * 2.1) * 0.03));
  });

  // ---- Rocks
  // Rocks: the ones laid out on land, plus dark boulders scattered along the waterline.
  const rockRng = createRng(SEED + 61);
  const shore = Array.from({ length: 34 }, () => { const a = rockRng() * Math.PI * 2, r = 57.5 + rockRng() * 5; return { x: Math.cos(a) * r, z: Math.sin(a) * r, scale: 0.7 + rockRng() * 1.6, rot: rockRng() * 6.28, shore: true }; });
  const allRocks = [...data.rocks, ...shore];
  const ROCK_TONES = [0xd9b47c, 0xcba56c, 0xbf9a68, 0xa98a6c], SHORE_TONES = [0x7a6050, 0x8a6e5a, 0x6b5648];
  const rocks = new THREE.InstancedMesh(rockGeometry(), flat(0xffffff), allRocks.length);
  rocks.castShadow = true; rocks.receiveShadow = true;
  allRocks.forEach((r, i) => {
    dummy.position.set(r.x, Math.max(heightAt(r.x, r.z), -0.25) - 0.08, r.z); dummy.rotation.set(Math.sin(i) * 0.12, r.rot, Math.cos(i * 1.3) * 0.12); dummy.scale.set(r.scale, r.scale * (0.8 + (i % 3) * 0.25), r.scale); dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    rocks.setColorAt(i, color.setHex(r.shore ? SHORE_TONES[i % 3] : ROCK_TONES[i % 4]).offsetHSL(0, 0, Math.sin(i * 1.7) * 0.02));
  });

  // ---- Flowers: stems and heads
  const stemGeo = new THREE.CylinderGeometry(0.016, 0.02, 0.42, 4); stemGeo.translate(0, 0.21, 0);
  const headGeo = new THREE.ConeGeometry(0.13, 0.11, 6); headGeo.rotateX(Math.PI); headGeo.translate(0, 0.45, 0);
  const stems = new THREE.InstancedMesh(stemGeo, flat(0x7d9a5a), data.flowers.length);
  const heads = new THREE.InstancedMesh(headGeo, flat(0xffffff), data.flowers.length);
  stems.receiveShadow = true; heads.receiveShadow = true;
  data.flowers.forEach((f, i) => {
    dummy.position.set(f.x, heightAt(f.x, f.z) - 0.02, f.z); dummy.rotation.set(Math.sin(i * 3.3) * 0.2, f.rot, Math.cos(i * 2.7) * 0.2); dummy.scale.setScalar(f.scale); dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, color.setHex(PALETTE.flowers[f.color]));
  });

  // ---- Tall dry grass, swaying in the breeze
  const rng = createRng(SEED + 21);
  const grassTime = { value: 0 };
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, vertexColors: true });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float swayA = sin(uTime * 1.5 + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27);
        float swayB = cos(uTime * 1.1 + instanceMatrix[3].x * 0.21 - instanceMatrix[3].z * 0.18);
        transformed.x += swayA * 0.1 * position.y * position.y;
        transformed.z += swayB * 0.07 * position.y * position.y;
      #endif`);
  };
  const grass = new THREE.InstancedMesh(tuftGeometry(), grassMat, GRASS_TUFTS);
  grass.receiveShadow = true;
  let placed = 0, guard = 0;
  const grassColors = [0xdcd29c, 0xcfc58a, 0xe6deb0, 0xc3bd80, 0xd3c489];
  const lushColors = [0xa3ad68, 0x93a05c, 0xb3bb76, 0x869555, 0xbcc07f];
  while (placed < GRASS_TUFTS && guard++ < GRASS_TUFTS * 40) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 47.5, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (zoneAt(x, z) !== 'grass' || distanceToPath(x, z) < 1.25) continue;
    if (Math.hypot(x - HILL.x, z - HILL.z) < 7.6) continue; // the summit camp is trodden bare
    if (Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 6.2 || Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 2.6) continue;
    if (COTTAGES.some((c) => Math.hypot(x - c.x, z - c.z) < Math.max(c.width, c.depth) / 2 + 1)) continue;
    if (Math.hypot(x - FIELD.x, z - FIELD.z) < 5 || TENTS.some((t) => Math.hypot(x - t.x, z - t.z) < 1.9)) continue;
    // Grass grows in drifts rather than evenly.
    // Grass grows in thick stands with open ground between, and is kept thin and short round the camp.
    const drift = Math.sin(x * 0.31 + Math.cos(z * 0.27) * 1.9) * Math.cos(z * 0.29 + 1.3) + Math.sin(x * 0.9 + z * 0.7) * 0.25;
    const inCamp = Math.hypot(x - 10, z - 8) < 19;
    if (drift < 0.12 && rng() < 0.93) continue;
    if (inCamp && rng() < 0.7) continue;
    const pd = Math.hypot(x - POND.x, z - POND.z);
    if (pd < POND.rw + 1.3) continue; // bare mud at the water's edge
    const lush = Math.max(heightAt(x, z) > 3.2 ? 0 : jungleAt(x, z), pd < POND.rw + 9 ? 1 : 0);
    dummy.position.set(x, heightAt(x, z) - 0.03, z); dummy.rotation.set(0, rng() * 6.28, 0);
    const s = 0.75 + rng() * 0.6; dummy.scale.set(s, s * (inCamp ? 0.45 + rng() * 0.3 : 0.7 + rng() * 0.8), s); dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    grass.setColorAt(placed, color.setHex((lush > 0.5 ? lushColors : grassColors)[Math.floor(rng() * 5)]));
    placed++;
  }
  grass.count = placed;

  // ---- Ferns carpet the jungle floor
  const ferns = new THREE.InstancedMesh(fernGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, vertexColors: true }), FERNS);
  ferns.receiveShadow = true;
  let fernCount = 0; guard = 0;
  while (fernCount < FERNS && guard++ < FERNS * 40) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 46, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (jungleAt(x, z) < 0.6 || zoneAt(x, z) !== 'grass' || distanceToPath(x, z) < 1.4) continue;
    if (Math.hypot(x - HILL.x, z - HILL.z) < 9) continue;
    if (COTTAGES.some((c) => Math.hypot(x - c.x, z - c.z) < Math.max(c.width, c.depth) / 2 + 1.5) || Math.hypot(x - FIELD.x, z - FIELD.z) < 5.5 || Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 4) continue;
    dummy.position.set(x, heightAt(x, z) - 0.03, z); dummy.rotation.set(0, rng() * 6.28, 0); dummy.scale.setScalar(0.6 + rng() * 0.9); dummy.updateMatrix();
    ferns.setMatrixAt(fernCount, dummy.matrix);
    ferns.setColorAt(fernCount, color.setHex([0x5f9a4c, 0x76ad55, 0x4f8a48][fernCount % 3]));
    fernCount++;
  }
  ferns.count = fernCount; if (ferns.instanceColor) ferns.instanceColor.needsUpdate = true;
  scene.add(ferns);

  for (const m of [bushes, rocks, heads, grass]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  scene.add(...kinds.flatMap((k) => [k.trunk, k.canopy]), bushes, rocks, stems, heads, grass);

  let swayFrame = 0;
  return {
    trees,
    // Position of a tree's canopy, for leaf particles.
    treeTop(id) { const t = treeById.get(id); return t ? new THREE.Vector3(t.x, t.y + TREE_KINDS[t.kind].top * t.scale, t.z) : null; },
    shakeTree(id, elapsed) { const t = treeById.get(id); if (t) t.shakeStart = elapsed; },
    update(elapsed) {
      grassTime.value = elapsed;
      // The slow sway of the trees is refreshed every other frame; a shaken tree every frame.
      const shaking = trees.some((t) => elapsed - t.shakeStart < SHAKE_TIME);
      if (!shaking && (swayFrame++ & 1)) return;
      for (const t of trees) {
        // A slow breeze, plus a quick fading wobble when shaken.
        let tiltX = Math.sin(elapsed * 0.8 + t.phase) * 0.012, tiltZ = Math.cos(elapsed * 0.6 + t.phase) * 0.012;
        const since = elapsed - t.shakeStart;
        if (since >= 0 && since < SHAKE_TIME) {
          const fade = 1 - since / SHAKE_TIME;
          tiltX += Math.sin(since * 34) * 0.07 * fade; tiltZ += Math.cos(since * 29) * 0.055 * fade;
        }
        placeTree(t, tiltX, tiltZ);
      }
      for (const k of kinds) { k.trunk.instanceMatrix.needsUpdate = true; k.canopy.instanceMatrix.needsUpdate = true; }
    },
  };
}
