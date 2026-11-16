// The two ways over the river: a plank bridge at the camp end and stepping stones over the ford
// near the lake. Plain models only; the walkable shapes themselves are BRIDGE and STONES in
// src/logic/layout.js (so the ground, the shore rule and everyone's feet already know them).
// The river area may dress or replace these models; keep the platforms where they are.
//
// An area file: `create(scene, deps)` returns { interactables, colliders, update } (all optional).
import * as THREE from 'three';
import { box, cyl, stick, mergeStatic, flat } from '../build.js';
import { BRIDGE, STONES } from '../../logic/layout.js';
import { PALETTE } from '../../config.js';

export function create(scene, deps) {
  const group = new THREE.Group();
  const wood = PALETTE.wood, dark = PALETTE.woodDark, rope = flat(0xd8c08a);
  // The bridge: planks across a pair of stringers, following the deck's gentle bow.
  const b = BRIDGE, rot = Math.atan2(b.dx, b.dz), n = Math.ceil(b.len / 0.42);
  const topAt = (u) => b.y0 + (b.y1 - b.y0) * u + b.arch * Math.sin(Math.PI * u);
  const at = (u, side) => ({ x: b.a.x + b.dx * b.len * u + b.dz * side, z: b.a.z + b.dz * b.len * u - b.dx * side });
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, p = at(u, 0), y = topAt(u) - 0.05, tilt = Math.atan2(topAt(Math.min(1, u + 0.02)) - topAt(Math.max(0, u - 0.02)), b.len * 0.04);
    const plank = box(b.width + 0.2, 0.08, 0.36, wood, p.x, y, p.z, rot);
    plank.rotation.x = -tilt; group.add(plank);
  }
  for (const side of [-1, 1]) {
    const off = side * (b.width / 2 - 0.1);
    for (let k = 0; k < 8; k++) { // stringers under the planks, in short straight runs that follow the bow
      const u0 = k / 8, u1 = (k + 1) / 8, p0 = at(u0, off), p1 = at(u1, off);
      group.add(stick([p0.x, topAt(u0) - 0.16, p0.z], [p1.x, topAt(u1) - 0.16, p1.z], 0.07, dark));
    }
    // Posts and a rope rail along each side.
    const posts = [0, 0.25, 0.5, 0.75, 1].map((u) => { const p = at(u, side * (b.width / 2 + 0.05)); return [p.x, topAt(u), p.z]; });
    for (const [x, y, z] of posts) group.add(cyl(0.06, 0.07, 1.1, dark, x, y + 0.45, z, 6));
    for (let k = 0; k < posts.length - 1; k++) {
      const [x0, y0, z0] = posts[k], [x1, y1, z1] = posts[k + 1];
      const r = stick([x0, y0 + 0.95, z0], [x1, y1 + 0.95, z1], 0.025, rope, 5); r.castShadow = false; group.add(r);
    }
    // Feet of the posts stand in the river bed.
    for (const u of [0.3, 0.7]) { const p = at(u, side * (b.width / 2 - 0.1)); group.add(cyl(0.09, 0.11, topAt(u) + 1.4, dark, p.x, (topAt(u) - 1.4) / 2, p.z, 6)); }
  }
  // The stepping stones: flat-topped boulders just clear of the water.
  const stone = flat(0xa89f96);
  STONES.forEach((s, i) => {
    const g = new THREE.CylinderGeometry(s.r * 0.92, s.r * 1.15, s.top + 0.9, 7);
    const m = new THREE.Mesh(g, stone); m.position.set(s.x, (s.top - 0.9) / 2, s.z); m.rotation.y = i * 1.7; m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  });
  mergeStatic(group);
  scene.add(group);
  return {
    update(dt, elapsed, player) {
      // Out of sight past 140 m: not worth drawing.
      group.visible = Math.hypot(player.position.x - b.cx, player.position.z - b.cz) < 140 || Math.hypot(player.position.x - STONES[5].x, player.position.z - STONES[5].z) < 140;
    },
  };
}
