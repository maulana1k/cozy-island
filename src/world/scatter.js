import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { getScatter } from '../logic/layout.js';
import { PALETTE } from '../config.js';

const flat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true });
const SHAKE_TIME = 0.8;

function canopyGeometry(kind) {
  if (kind === 1) { // tall cone
    const g = new THREE.ConeGeometry(1.25, 3.0, 7); g.translate(0, 3.0, 0); return g;
  }
  // round, slightly lumpy: two blobs merged by hand
  const g = new THREE.IcosahedronGeometry(1.35, 1); g.scale(1, 0.92, 1); g.translate(0, 2.75, 0); return g;
}

export function createScatter(scene) {
  const data = getScatter();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // ---- Trees: one instanced trunk mesh, one instanced canopy mesh per kind.
  const trunkGeo = new THREE.CylinderGeometry(0.17, 0.27, 1.9, 6); trunkGeo.translate(0, 0.95, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, flat(PALETTE.trunk), data.trees.length);
  trunks.castShadow = true; trunks.receiveShadow = true;
  const canopyColors = [PALETTE.leafA, PALETTE.leafC, PALETTE.blossom];
  const byKind = [0, 1, 2].map((k) => data.trees.filter((t) => t.kind === k));
  const canopies = byKind.map((list, k) => {
    const m = new THREE.InstancedMesh(canopyGeometry(k), flat(0xffffff), Math.max(1, list.length));
    m.count = list.length; m.castShadow = true; m.receiveShadow = true;
    list.forEach((t, i) => {
      // Slightly different tint per tree so the woods do not look stamped out.
      color.setHex(canopyColors[k]).offsetHSL((Math.sin(t.x * 12.9 + t.z * 78.2) * 0.5) * 0.03, 0, Math.cos(t.x * 3.1) * 0.03);
      m.setColorAt(i, color);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return m;
  });
  const trees = data.trees.map((t, i) => ({
    ...t, y: heightAt(t.x, t.z) - 0.05, trunkIndex: i,
    canopy: canopies[t.kind], canopyIndex: byKind[t.kind].indexOf(t),
    phase: (t.x * 0.37 + t.z * 0.53) % 6.28, shakeStart: -10,
  }));
  const treeById = new Map(trees.map((t) => [t.id, t]));

  function placeTree(t, tiltX, tiltZ) {
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.set(tiltX, t.rot, tiltZ, 'YXZ');
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(t.trunkIndex, dummy.matrix);
    t.canopy.setMatrixAt(t.canopyIndex, dummy.matrix);
  }
  trees.forEach((t) => placeTree(t, 0, 0));

  // ---- Bushes
  const bushGeo = new THREE.IcosahedronGeometry(0.62, 1); bushGeo.scale(1.15, 0.8, 1); bushGeo.translate(0, 0.4, 0);
  const bushes = new THREE.InstancedMesh(bushGeo, flat(0xffffff), data.bushes.length);
  bushes.castShadow = true; bushes.receiveShadow = true;
  data.bushes.forEach((b, i) => {
    dummy.position.set(b.x, heightAt(b.x, b.z) - 0.05, b.z); dummy.rotation.set(0, b.rot, 0); dummy.scale.setScalar(b.scale); dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
    bushes.setColorAt(i, color.setHex(i % 3 === 0 ? PALETTE.leafB : PALETTE.leafA).offsetHSL(0, 0, Math.sin(i * 2.1) * 0.03));
  });

  // ---- Rocks
  const rockGeo = new THREE.DodecahedronGeometry(0.55, 0); rockGeo.scale(1.1, 0.72, 0.95); rockGeo.translate(0, 0.25, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, flat(0xffffff), data.rocks.length);
  rocks.castShadow = true; rocks.receiveShadow = true;
  data.rocks.forEach((r, i) => {
    dummy.position.set(r.x, heightAt(r.x, r.z) - 0.05, r.z); dummy.rotation.set(Math.sin(i) * 0.2, r.rot, Math.cos(i * 1.3) * 0.2); dummy.scale.setScalar(r.scale); dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    rocks.setColorAt(i, color.setHex(i % 2 ? PALETTE.stone : PALETTE.stoneDark).offsetHSL(0, 0, Math.sin(i * 1.7) * 0.03));
  });

  // ---- Flowers: stems and heads
  const stemGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.3, 4); stemGeo.translate(0, 0.15, 0);
  const headGeo = new THREE.IcosahedronGeometry(0.085, 0); headGeo.scale(1, 0.7, 1); headGeo.translate(0, 0.32, 0);
  const stems = new THREE.InstancedMesh(stemGeo, flat(0x6fb56b), data.flowers.length);
  const heads = new THREE.InstancedMesh(headGeo, flat(0xffffff), data.flowers.length);
  stems.receiveShadow = true; heads.receiveShadow = true;
  data.flowers.forEach((f, i) => {
    dummy.position.set(f.x, heightAt(f.x, f.z) - 0.02, f.z); dummy.rotation.set(0, f.rot, 0); dummy.scale.setScalar(f.scale); dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, color.setHex(PALETTE.flowers[f.color]));
  });

  for (const m of [bushes, rocks, heads]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  scene.add(trunks, ...canopies, bushes, rocks, stems, heads);

  let now = 0;
  return {
    trees,
    // Position of a tree's canopy, for leaf particles.
    treeTop(id) { const t = treeById.get(id); return t ? new THREE.Vector3(t.x, t.y + 2.6 * t.scale, t.z) : null; },
    shakeTree(id, elapsed) { const t = treeById.get(id); if (t) t.shakeStart = elapsed; },
    update(elapsed) {
      now = elapsed;
      for (const t of trees) {
        // A slow breeze, plus a quick fading wobble when shaken.
        let tiltX = Math.sin(elapsed * 0.8 + t.phase) * 0.012, tiltZ = Math.cos(elapsed * 0.6 + t.phase) * 0.012;
        const since = elapsed - t.shakeStart;
        if (since >= 0 && since < SHAKE_TIME) {
          const fade = 1 - since / SHAKE_TIME;
          tiltX += Math.sin(since * 34) * 0.09 * fade; tiltZ += Math.cos(since * 29) * 0.07 * fade;
        }
        placeTree(t, tiltX, tiltZ);
      }
      trunks.instanceMatrix.needsUpdate = true;
      for (const c of canopies) c.instanceMatrix.needsUpdate = true;
    },
  };
}
