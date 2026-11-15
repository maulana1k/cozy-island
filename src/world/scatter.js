import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, zoneAt } from '../logic/terrain.js';
import { getScatter, distanceToPath, jungleAt, COTTAGES, VILLAGE_CENTER, WINDMILL, FIELD, TENTS } from '../logic/layout.js';
import { POND } from '../config.js';
import { createRng } from '../logic/rng.js';
import { PALETTE, SEED } from '../config.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...extra });
const SHAKE_TIME = 0.8;
const GRASS_TUFTS = 9500;
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
      pts.push([dx * out - px * w, y, dz * out - pz * w, dx * out + px * w, y, dz * out + pz * w, 0.58 + 0.42 * t]);
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
const TREE_KINDS = [
  {
    color: 0x6f8a4c,
    trunk: () => mergeGeometries([stick(0, 0, 0, 0.15, 3.3, 0, 0.3, 0.17), stick(0.1, 2.3, 0, -0.9, 3.4, 0.3, 0.12, 0.07), stick(0.1, 2.5, 0, 0.9, 3.5, -0.4, 0.12, 0.07)]),
    canopy: () => mergeGeometries([blob(0.1, 3.9, 0, 1.9, 0.62, 1.7), blob(-1.3, 3.6, 0.4, 1.2, 0.5, 1.1, 0.6), blob(1.3, 3.7, -0.5, 1.25, 0.5, 1.1, 1.1), blob(0.2, 3.55, 1.2, 1.0, 0.42, 0.9, 2), blob(0, 4.3, -0.2, 1.1, 0.45, 1.0, 0.3)]),
    top: 3.8,
  },
  {
    color: 0x9db38a,
    trunk: () => mergeGeometries([stick(0, 0, 0, -0.1, 1.2, 0, 0.3, 0.2), stick(-0.1, 1.1, 0, -0.75, 2.1, 0.2, 0.15, 0.08), stick(-0.1, 1.1, 0, 0.7, 2.2, -0.15, 0.15, 0.08), stick(-0.1, 1.1, 0, 0.05, 2.3, 0.6, 0.12, 0.07)]),
    canopy: () => mergeGeometries([blob(-0.85, 2.45, 0.25, 0.95, 0.6, 0.9), blob(0.8, 2.55, -0.2, 1.0, 0.62, 0.9, 0.8), blob(0.05, 2.75, 0.7, 0.85, 0.55, 0.8, 1.6), blob(0, 2.95, -0.1, 0.9, 0.5, 0.85, 2.4)]),
    top: 2.6,
  },
  {
    color: 0x5c7f58,
    trunk: () => stick(0, 0, 0, 0, 1.3, 0, 0.2, 0.16),
    canopy: () => { const g = new THREE.ConeGeometry(0.95, 4.2, 6).toNonIndexed(); g.translate(0, 3.1, 0); return g; },
    top: 3.2,
  },
  { // palm: a leaning trunk with drooping fronds
    color: 0x7fb257,
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
  { // jungle giant: thick trunk, buttress roots and a deep layered crown
    color: 0x4c8750,
    trunk: () => mergeGeometries([stick(0, 0, 0, 0, 4.4, 0, 0.5, 0.3), stick(0.75, 0, 0.2, 0.15, 1.3, 0, 0.16, 0.1), stick(-0.6, 0, 0.5, -0.1, 1.2, 0, 0.16, 0.1), stick(-0.2, 0, -0.8, 0, 1.2, 0, 0.16, 0.1),
      stick(0, 3.4, 0, 1.5, 4.8, 0.4, 0.16, 0.09), stick(0, 3.6, 0, -1.4, 4.9, -0.6, 0.16, 0.09)]),
    canopy: () => mergeGeometries([blob(0, 5.4, 0, 2.4, 1.0, 2.2), blob(1.7, 5.0, 0.6, 1.5, 0.8, 1.4, 0.7), blob(-1.6, 5.1, -0.7, 1.6, 0.8, 1.4, 1.4), blob(0.3, 4.8, -1.7, 1.3, 0.7, 1.2, 2.2), blob(-0.4, 4.9, 1.8, 1.3, 0.7, 1.2, 0.2), blob(0, 6.3, 0, 1.6, 0.8, 1.5, 1)]),
    top: 5.0,
  },
  { // young tree: a slim stem and a small round crown
    color: 0x8fb866,
    trunk: () => mergeGeometries([stick(0, 0, 0, 0.05, 1.5, 0, 0.09, 0.06), stick(0.03, 1.0, 0, 0.4, 1.6, 0.1, 0.04, 0.03), stick(0.03, 1.1, 0, -0.35, 1.7, -0.1, 0.04, 0.03)]),
    canopy: () => mergeGeometries([leafy(0.05, 2.0, 0, 0.75, 0.7, 0.72), leafy(0.5, 1.75, 0.15, 0.48, 0.42, 0.46, 1), leafy(-0.45, 1.85, -0.15, 0.5, 0.44, 0.46, 2)]),
    top: 1.9,
  },
];

const fernGeometry = () => ribbonClump({ blades: 9, height: 0.95, width: 0.13, spread: 0.06, droop: 1.5, rows: 5, shape: 'frond' });
// Soft grass: many thin curved blades, most of them short.
const tuftGeometry = () => ribbonClump({ blades: 8, height: 0.42, width: 0.022, spread: 0.2, droop: 0.9, rows: 3 });

// A rounded leafy bush made of a few lumps.
function bushGeometry() {
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
  const rockGeo = new THREE.DodecahedronGeometry(0.6, 0); rockGeo.scale(1.15, 0.75, 0.95); rockGeo.translate(0, 0.25, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, flat(0xffffff), data.rocks.length);
  rocks.castShadow = true; rocks.receiveShadow = true;
  data.rocks.forEach((r, i) => {
    dummy.position.set(r.x, heightAt(r.x, r.z) - 0.05, r.z); dummy.rotation.set(Math.sin(i) * 0.2, r.rot, Math.cos(i * 1.3) * 0.2); dummy.scale.setScalar(r.scale); dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    rocks.setColorAt(i, color.setHex(i % 2 ? PALETTE.stone : PALETTE.stoneDark).offsetHSL(0, 0, Math.sin(i * 1.7) * 0.03));
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
        transformed.x += swayA * 0.22 * position.y * position.y;
        transformed.z += swayB * 0.14 * position.y * position.y;
      #endif`);
  };
  const grass = new THREE.InstancedMesh(tuftGeometry(), grassMat, GRASS_TUFTS);
  grass.receiveShadow = true;
  let placed = 0, guard = 0;
  const grassColors = [0xf0cf72, 0xe3b85a, 0xf6dc8c, 0xd7b257, 0xc9c06a];
  const lushColors = [0x8fbf5f, 0x7aae52, 0xa6cf6e, 0x6f9f4c, 0xb7d27a];
  while (placed < GRASS_TUFTS && guard++ < GRASS_TUFTS * 12) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 47.5, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (zoneAt(x, z) !== 'grass' || distanceToPath(x, z) < 1.25) continue;
    if (Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 6.2 || Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 2.6) continue;
    if (COTTAGES.some((c) => Math.hypot(x - c.x, z - c.z) < Math.max(c.width, c.depth) / 2 + 1)) continue;
    if (Math.hypot(x - FIELD.x, z - FIELD.z) < 5 || TENTS.some((t) => Math.hypot(x - t.x, z - t.z) < 1.9)) continue;
    // Grass grows in drifts rather than evenly.
    const drift = Math.sin(x * 0.22 + Math.cos(z * 0.19) * 1.7) * Math.cos(z * 0.17 + 1.3);
    if (drift < -0.25 && rng() < 0.8) continue;
    const pd = Math.hypot(x - POND.x, z - POND.z);
    if (pd < POND.rw + 1.3) continue; // bare mud at the water's edge
    const lush = Math.max(jungleAt(x, z), pd < POND.rw + 9 ? 1 : 0);
    dummy.position.set(x, heightAt(x, z) - 0.03, z); dummy.rotation.set(0, rng() * 6.28, 0);
    const s = 0.7 + rng() * 0.7; dummy.scale.set(s, s * (lush > 0.5 ? 1.0 + rng() * 0.9 : 0.6 + rng() * 0.8), s); dummy.updateMatrix();
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
