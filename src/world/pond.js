// Life around the pond: reeds, lily pads, stepping stones, a pair of ducks,
// butterflies over the meadow by day and fireflies at night.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { createRng } from '../logic/rng.js';
import { POND, SEED } from '../config.js';
import { ball, cyl, shared, mergeStatic } from './build.js';

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
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34 + rng() * 0.2, 9, 0.5, Math.PI * 2 - 0.7), shared(i % 2 ? 0x5fa35a : 0x6fb466));
    disc.rotation.x = -Math.PI / 2; disc.material.side = THREE.DoubleSide; pad.add(disc);
    if (i % 3 === 0) pad.add(ball(0.1, i % 2 ? 0xf7b7cf : 0xffffff, 0, 0.07, 0, 1), ball(0.045, 0xffd75a, 0, 0.13, 0, 0));
    pad.position.set(POND.x + Math.cos(a) * r, 0.03, POND.z + Math.sin(a) * r); pad.rotation.y = rng() * 6;
    pad.userData.phase = rng() * 6; pads.push(pad); g.add(pad);
  }
  // Flat stepping stones across one side (welded into one draw)
  const stones = new THREE.Group(); g.add(stones);
  for (let i = 0; i < 6; i++) {
    const a = 2.5, d = -POND.rw + 1 + i * 1.75, off = (i % 2 ? 0.35 : -0.3);
    const x = POND.x + Math.cos(a) * d - Math.sin(a) * off, z = POND.z + Math.sin(a) * d + Math.cos(a) * off;
    const st = cyl(0.42 + rng() * 0.12, 0.5, 0.5, 0xb3a8ad, x, Math.max(heightAt(x, z), -0.1) - 0.12, z, 7); st.rotation.y = rng() * 3; stones.add(st);
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

  // Butterflies by day, fireflies by night
  const wingGeo = new THREE.PlaneGeometry(0.16, 0.2); wingGeo.translate(0.08, 0, 0);
  const flutter = [0xf2b63b, 0xffffff, 0xe8503a, 0x7fb3f0, 0xf7b7cf, 0xffffff, 0xf2b63b].map((col, i) => {
    const b = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true });
    const l = new THREE.Mesh(wingGeo, m), r = new THREE.Mesh(wingGeo, m); r.scale.x = -1;
    b.add(l, r); g.add(b);
    const a = rng() * Math.PI * 2, rad = POND.rw + 1 + rng() * 9;
    return { b, l, r, m, cx: POND.x + Math.cos(a) * rad, cz: POND.z + Math.sin(a) * rad, phase: rng() * 10, i };
  });
  const flyCount = 46;
  const flyPos = new Float32Array(flyCount * 3), flySeed = [];
  for (let i = 0; i < flyCount; i++) { const a = rng() * Math.PI * 2, rad = rng() * (POND.rw + 11); flySeed.push({ x: POND.x + Math.cos(a) * rad, z: POND.z + Math.sin(a) * rad, p: rng() * 20, h: 0.5 + rng() * 1.6 }); }
  const flyGeo = new THREE.BufferGeometry(); flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ color: 0xe9ff8a, size: 0.14, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  flies.frustumCulled = false; g.add(flies);

  return {
    // `viewer` (optional): where the player is. From far off the little life (pads, ducks, butterflies) is not drawn.
    update(dt, elapsed, night, viewer) {
      const near = !viewer || (viewer.x - POND.x) ** 2 + (viewer.z - POND.z) ** 2 < 70 * 70;
      for (const p of pads) p.visible = near;
      for (const k of ducks) k.d.visible = near;
      for (const p of pads) { p.position.y = 0.03 + Math.sin(elapsed * 1.1 + p.userData.phase) * 0.012; p.rotation.y += dt * 0.03 * Math.sin(p.userData.phase); }
      for (const k of ducks) {
        const a = elapsed * k.speed + k.phase;
        k.d.position.set(POND.x + Math.cos(a) * k.r, 0.02 + Math.sin(elapsed * 2 + k.phase) * 0.015, POND.z + Math.sin(a) * k.r);
        k.d.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)); k.d.rotation.z = Math.sin(elapsed * 2.4 + k.phase) * 0.06;
      }
      const day = 1 - night;
      for (const f of flutter) {
        const e = elapsed * 0.5 + f.phase;
        f.b.visible = near && day > 0.05; f.m.opacity = day;
        f.b.position.set(f.cx + Math.sin(e) * 3 + Math.sin(e * 2.3) * 1.2, heightAt(f.cx, f.cz) + 1.0 + Math.sin(e * 1.7) * 0.5 + Math.abs(Math.sin(elapsed * 9 + f.i)) * 0.12, f.cz + Math.cos(e * 0.8) * 3);
        f.b.rotation.y = e * 1.3;
        const flap = Math.sin(elapsed * 16 + f.i * 2) * 1.0;
        f.l.rotation.y = flap; f.r.rotation.y = -flap;
      }
      flies.material.opacity = night * (0.65 + Math.sin(elapsed * 3) * 0.2);
      if (night > 0.02) {
        for (let i = 0; i < flyCount; i++) {
          const s = flySeed[i], e = elapsed * 0.35 + s.p;
          const x = s.x + Math.sin(e) * 1.6, z = s.z + Math.cos(e * 1.3) * 1.6;
          flyPos[i * 3] = x; flyPos[i * 3 + 1] = Math.max(0.2, heightAt(x, z)) + s.h + Math.sin(e * 2.1) * 0.4; flyPos[i * 3 + 2] = z;
        }
        flyGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
