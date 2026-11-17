// Rock dressing for the coast: clusters of grey-brown boulders along the waterline of the rocky points
// (see LOBES in src/logic/terrain.js) and heaped on the small islets off them. Scenery only: no colliders
// (the boulders on land are low and the islets cannot be reached). One instanced mesh, one draw call.
import * as THREE from 'three';
import { bakeAO } from './ao.js';
import { heightAt, landR, coastRock, coastFeatures } from '../logic/terrain.js';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';

// A rough boulder: a low-poly ball with its corners pushed in and out, flattened a little.
function boulderGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, rng = createRng(SEED + 7);
  const moved = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; // shared corners move together
    if (!moved.has(key)) moved.set(key, 0.78 + rng() * 0.4);
    const k = moved.get(key);
    p.setXYZ(i, p.getX(i) * k * 1.1, Math.max(-0.45, p.getY(i) * k * 0.72), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

export function createCoastRocks(scene) {
  const rng = createRng(SEED + 404), list = [];
  const add = (x, z, s, sink = 0.3) => list.push({ x, z, s, sink, rot: rng() * Math.PI * 2, tilt: (rng() - 0.5) * 0.5, sy: 0.7 + rng() * 0.5, tone: rng() });
  const near = (x, z, gap) => list.some((b) => Math.hypot(b.x - x, b.z - z) < gap);
  const { lobes, islets } = coastFeatures();
  for (const f of lobes) {
    const [x0, x1, z0, z1] = f.box, cand = [];
    for (let x = x0 - 14; x <= x1 + 14; x += 1) for (let z = z0 - 14; z <= z1 + 14; z += 1) {
      const jx = x + (rng() - 0.5), jz = z + (rng() - 0.5), k = coastRock(jx, jz);
      if (k < 0.5) continue;
      const r = landR(jx, jz);
      if (r > 57.5 && r < 62.5) cand.push({ x: jx, z: jz, edge: true });       // the waterline
      else if (r > 51 && r <= 57.5 && rng() < 0.08) cand.push({ x: jx, z: jz }); // a few up on the point
    }
    // Shuffle, then keep the ones far enough apart: clusters every few metres along the shore.
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (const c of cand) {
      if (near(c.x, c.z, c.edge ? 2.6 : 5)) continue;
      add(c.x, c.z, c.edge ? 0.8 + rng() * 1.2 : 0.6 + rng() * 0.7);
      const n = c.edge ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) { const a = rng() * Math.PI * 2, d = 0.9 + rng() * 1.2; add(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 0.3 + rng() * 0.5); }
    }
  }
  // Islets: a heap of big boulders on top, smaller ones round the foot in the surf.
  for (const i of islets) {
    add(i.x, i.z, i.rad * 0.85, 0.2);
    const big = 2 + Math.floor(i.rad);
    for (let k = 0; k < big; k++) { const a = (k / big) * Math.PI * 2 + rng(), d = i.rad * (0.35 + rng() * 0.35); add(i.x + Math.cos(a) * d, i.z + Math.sin(a) * d, i.rad * (0.35 + rng() * 0.3)); }
    for (let k = 0; k < 5; k++) { const a = rng() * Math.PI * 2, d = i.rad + 0.3 + rng() * 1.3; add(i.x + Math.cos(a) * d, i.z + Math.sin(a) * d, 0.35 + rng() * 0.5, 0.25); }
  }

  const TONES = [0x9a8d7e, 0x8a7e71, 0xa69a8a, 0x7c7268, 0xb0a593].map((h) => new THREE.Color(h));
  const mesh = new THREE.InstancedMesh(bakeAO(boulderGeometry(), { creases: false, ground: 0, fade: 0.7 }), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true }), list.length);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  list.forEach((b, i) => {
    dummy.position.set(b.x, heightAt(b.x, b.z) - b.sink * b.s, b.z);
    dummy.rotation.set(b.tilt, b.rot, b.tilt * 0.6);
    dummy.scale.set(b.s, b.s * b.sy, b.s * (0.8 + 0.3 * Math.sin(i)));
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.copy(TONES[Math.floor(b.tone * TONES.length)]).offsetHSL(0, 0, Math.sin(i * 1.7) * 0.025));
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
