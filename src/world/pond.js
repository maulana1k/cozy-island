// Life around the pond: reeds, lily pads, stepping stones, a pair of ducks,
// (the butterflies over its meadow and the fireflies at night are in src/world/particles.js).
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { createRng } from '../logic/rng.js';
import { POND, SEED } from '../config.js';
import { ball, cyl, shared, mergeStatic } from './build.js';
import { waterObstacles } from './water.js';

export function createPond(scene) {
  const rng = createRng(SEED + 41);
  const g = new THREE.Group(); scene.add(g);
  const dummy = new THREE.Object3D();

  // Reeds in clumps round the rim
  const reedGeo = new THREE.ConeGeometry(0.035, 1.5, 4); reedGeo.translate(0, 0.75, 0);
  const reeds = new THREE.InstancedMesh(reedGeo, shared(0x7fa85a), 170);
  const tips = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 5), shared(0x7a5236), 60);
  let n = 0, t = 0;
  for (let clump = 0; clump < 17; clump++) {
    const a = rng() * Math.PI * 2, r = POND.rw - 0.5 + rng() * 1.3;
    for (let k = 0; k < 10; k++) {
      const x = POND.x + Math.cos(a) * r + (rng() - 0.5) * 0.9, z = POND.z + Math.sin(a) * r + (rng() - 0.5) * 0.9;
      const s = 0.6 + rng() * 0.8, y = Math.max(heightAt(x, z), -0.05) - 0.05;
      dummy.position.set(x, y, z); dummy.rotation.set((rng() - 0.5) * 0.25, rng() * 6, (rng() - 0.5) * 0.25); dummy.scale.set(1, s, 1); dummy.updateMatrix();
      reeds.setMatrixAt(n++, dummy.matrix);
      if (k % 3 === 0 && t < 60) { dummy.position.y = y + 1.5 * s - 0.1; dummy.scale.set(1, 1, 1); dummy.updateMatrix(); tips.setMatrixAt(t++, dummy.matrix); }
    }
  }
  reeds.count = n; tips.count = t; reeds.castShadow = true;
  g.add(reeds, tips);

  // Lily pads, some in flower
  const pads = [];
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, r = 1 + rng() * (POND.rw - 2.2);
    const pad = new THREE.Group();
    const padR = 0.34 + rng() * 0.2, disc = new THREE.Mesh(new THREE.CircleGeometry(padR, 9, 0.5, Math.PI * 2 - 0.7), shared(i % 2 ? 0x5fa35a : 0x6fb466));
    disc.rotation.x = -Math.PI / 2; disc.material.side = THREE.DoubleSide; pad.add(disc);
    if (i % 3 === 0) pad.add(ball(0.1, i % 2 ? 0xf7b7cf : 0xffffff, 0, 0.07, 0, 1), ball(0.045, 0xffd75a, 0, 0.13, 0, 0));
    pad.position.set(POND.x + Math.cos(a) * r, 0.03, POND.z + Math.sin(a) * r); pad.rotation.y = rng() * 6;
    pad.userData = { phase: rng() * 6, hx: pad.position.x, hz: pad.position.z, vx: 0, vz: 0, bob: 0, r: padR }; pads.push(pad); g.add(pad);
    waterObstacles.add(pad.position.x, pad.position.z, padR, 2); // a lapping ring round each pad (world/water.js)
  }
  // Flat stepping stones across one side (welded into one draw)
  const stones = new THREE.Group(); g.add(stones);
  for (let i = 0; i < 6; i++) {
    const a = 2.5, d = -POND.rw + 1 + i * 1.75, off = (i % 2 ? 0.35 : -0.3);
    const x = POND.x + Math.cos(a) * d - Math.sin(a) * off, z = POND.z + Math.sin(a) * d + Math.cos(a) * off;
    const st = cyl(0.42 + rng() * 0.12, 0.5, 0.5, 0xb3a8ad, x, Math.max(heightAt(x, z), -0.1) - 0.12, z, 7); st.rotation.y = rng() * 3; stones.add(st);
    if (heightAt(x, z) < 0) waterObstacles.add(x, z, 0.46, 1);
  }
  mergeStatic(stones);

  // Two ducks paddle about
  const ducks = [0, 1].map((i) => {
    const d = new THREE.Group();
    const body = ball(0.24, i ? 0xfaf3e2 : 0xf0cf72, 0, 0.12, 0, 1); body.scale.set(0.85, 0.7, 1.25);
    const head = ball(0.13, i ? 0xfaf3e2 : 0x4f8f6a, 0, 0.36, 0.2, 1);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), shared(0xf2a23b)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.34, 0.36);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 4), body.material); tail.rotation.x = -1.1; tail.position.set(0, 0.2, -0.3);
    d.add(body, head, beak, tail); g.add(d);
    return { d, phase: i * 2.4, r: 2.1 + i * 1.3, speed: 0.22 - i * 0.07 };
  });

  waterObstacles.mover((out) => { for (const k of ducks) if (k.d.visible) out.push({ x: k.d.position.x, z: k.d.position.z, r: 0.2, kind: 3 }); });

  // Butterflies and fireflies round the pond live in the shared pools (src/world/particles.js).

  return {
    // `viewer` (optional): where the player is. From far off the little life (pads, ducks, butterflies) is not drawn.
    update(dt, elapsed, night, viewer) {
      const near = !viewer || (viewer.x - POND.x) ** 2 + (viewer.z - POND.z) ** 2 < 70 * 70;
      for (const p of pads) p.visible = near;
      for (const k of ducks) k.d.visible = near;
      // Lily pads: a slow bob; a duck or the player passing close pushes them aside (they bob harder for a
      // moment, turn a little) and they drift back to where they float (src/world/react.js, milestone V3).
      for (const p of pads) {
        const u = p.userData;
        if (near && dt > 0) {
          let fx = (u.hx - p.position.x) * 0.35, fz = (u.hz - p.position.z) * 0.35;
          const shove = (x, z, reach, k) => { const dx = p.position.x - x, dz = p.position.z - z, d = Math.hypot(dx, dz); if (d < reach && d > 1e-3) { const f = (1 - d / reach) * k; fx += (dx / d) * f; fz += (dz / d) * f; u.bob = Math.min(1, u.bob + f * dt * 1.5); } };
          for (const k of ducks) shove(k.d.position.x, k.d.position.z, 0.75 + u.r, 1.2);
          if (viewer) shove(viewer.x, viewer.z, 0.9 + u.r, 2.5);
          u.vx += (fx - u.vx * 1.6) * dt; u.vz += (fz - u.vz * 1.6) * dt;
          p.position.x += u.vx * dt; p.position.z += u.vz * dt;
          u.bob = Math.max(0, u.bob - dt * 0.6);
        }
        p.position.y = 0.03 + Math.sin(elapsed * 1.1 + u.phase) * 0.012 + Math.sin(elapsed * 6 + u.phase) * 0.02 * u.bob;
        p.rotation.y += dt * (0.03 * Math.sin(u.phase) + (u.vx * 0.7 - u.vz * 0.5));
        p.rotation.x = Math.sin(elapsed * 5 + u.phase) * 0.06 * u.bob;
      }
      for (const k of ducks) {
        const a = elapsed * k.speed + k.phase;
        k.d.position.set(POND.x + Math.cos(a) * k.r, 0.02 + Math.sin(elapsed * 2 + k.phase) * 0.015, POND.z + Math.sin(a) * k.r);
        k.d.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)); k.d.rotation.z = Math.sin(elapsed * 2.4 + k.phase) * 0.06;
      }
    },
  };
}
