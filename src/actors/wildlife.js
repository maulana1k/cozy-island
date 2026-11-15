// Wild animals: gulls overhead, shy rabbits in the grass, and sheep by the windmill.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { getScatter, SHEEP_MEADOW } from '../logic/layout.js';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';

const soft = (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
function part(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

function buildGull() {
  const g = new THREE.Group();
  const white = soft(0xffffff), grey = soft(0xcfd6dc);
  const body = part(new THREE.SphereGeometry(0.22, 8, 6), white); body.scale.set(0.8, 0.7, 1.9);
  const head = part(new THREE.SphereGeometry(0.13, 8, 6), white, 0, 0.06, 0.42);
  const beak = part(new THREE.ConeGeometry(0.04, 0.16, 5), soft(0xf2a23b), 0, 0.04, 0.58); beak.rotation.x = Math.PI / 2;
  const wing = () => { const p = new THREE.Group(); const w = part(new THREE.BoxGeometry(1.0, 0.04, 0.34), grey, 0.5, 0, 0); const tip = part(new THREE.BoxGeometry(0.4, 0.035, 0.24), soft(0x5b6470), 1.15, 0, -0.03); p.add(w, tip); return p; };
  const wingR = wing(), wingL = wing(); wingL.scale.x = -1;
  g.add(body, head, beak, wingL, wingR);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { g, wingL, wingR };
}

function buildRabbit() {
  const g = new THREE.Group();
  const fur = soft(0xb98b62), cream = soft(0xf3e2c8);
  const body = part(new THREE.SphereGeometry(0.17, 8, 6), fur, 0, 0.17, 0); body.scale.set(0.85, 0.9, 1.25);
  const head = part(new THREE.SphereGeometry(0.11, 8, 6), fur, 0, 0.34, 0.16);
  const earGeo = new THREE.CapsuleGeometry(0.025, 0.2, 2, 5);
  const earL = part(earGeo, fur, -0.045, 0.52, 0.13), earR = part(earGeo, fur, 0.045, 0.52, 0.13);
  earL.rotation.z = 0.12; earR.rotation.z = -0.12;
  g.add(body, head, earL, earR, part(new THREE.SphereGeometry(0.06, 6, 5), cream, 0, 0.2, -0.2));
  return g;
}

function buildSheep() {
  const g = new THREE.Group();
  const wool = soft(0xfbf3e2), face = soft(0x8a6248), leg = soft(0x6b4a38);
  const fluff = [[0, 0.72, 0, 0.42], [0.18, 0.8, 0.3, 0.3], [-0.18, 0.8, 0.28, 0.3], [0.2, 0.78, -0.3, 0.32], [-0.2, 0.76, -0.32, 0.32], [0, 0.95, 0, 0.3], [0, 0.66, -0.5, 0.26]];
  for (const [x, y, z, r] of fluff) g.add(part(new THREE.IcosahedronGeometry(r, 0), wool, x, y, z));
  const head = new THREE.Group(); head.position.set(0, 0.86, 0.58);
  const skull = part(new THREE.SphereGeometry(0.17, 8, 6), face); skull.scale.set(0.85, 0.95, 1.25);
  const earGeo = new THREE.SphereGeometry(0.07, 6, 5);
  const earL = part(earGeo, face, -0.19, 0.03, -0.05), earR = part(earGeo, face, 0.19, 0.03, -0.05); earL.scale.set(1.5, 0.5, 0.8); earR.scale.set(1.5, 0.5, 0.8);
  head.add(skull, earL, earR, part(new THREE.IcosahedronGeometry(0.15, 0), wool, 0, 0.14, -0.08));
  g.add(head);
  for (const [x, z] of [[-0.18, 0.28], [0.18, 0.28], [-0.18, -0.3], [0.18, -0.3]]) g.add(part(new THREE.CylinderGeometry(0.05, 0.045, 0.45, 6), leg, x, 0.22, z));
  return { g, head };
}

export function createWildlife(scene, deps) {
  const { ui, audio } = deps;
  const rng = createRng(SEED + 31);

  // ---- Gulls circle high above the island
  const gulls = [0, 1, 2, 3].map((i) => {
    const m = buildGull(); scene.add(m.g);
    return { ...m, cx: (rng() - 0.5) * 50, cz: (rng() - 0.5) * 50, r: 18 + rng() * 26, h: 13 + rng() * 9, speed: (0.1 + rng() * 0.08) * (i % 2 ? 1 : -1), phase: rng() * 6.28 };
  });

  // ---- Rabbits sit near bushes and hop away when you come close
  const bushes = getScatter().bushes;
  const rabbits = [3, 9, 15, 21, 27].map((bi) => {
    const b = bushes[bi % bushes.length];
    const g = buildRabbit(); scene.add(g);
    return { g, home: { x: b.x + 0.9, z: b.z + 0.6 }, x: b.x + 0.9, z: b.z + 0.6, heading: rng() * 6.28, flee: 0, dirX: 0, dirZ: 0, hopPhase: rng() * 6, idle: rng() * 4 };
  });

  // ---- Sheep graze in the meadow by the windmill
  const sheep = [0, 1, 2].map((i) => {
    const m = buildSheep(); scene.add(m.g);
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const s = { ...m, x: SHEEP_MEADOW.x + Math.cos(a) * 2.5, z: SHEEP_MEADOW.z + Math.sin(a) * 2.5, heading: rng() * 6.28, target: null, wait: 1 + rng() * 5, petted: 10, position: { x: 0, z: 0 } };
    s.position.x = s.x; s.position.z = s.z;
    return s;
  });
  const meadowSpot = () => { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * SHEEP_MEADOW.r; return { x: SHEEP_MEADOW.x + Math.cos(a) * r, z: SHEEP_MEADOW.z + Math.sin(a) * r }; };

  const interactables = sheep.map((s, i) => ({
    id: `sheep-${i}`, kind: 'sheep', position: s.position,
    get markerY() { return heightAt(s.x, s.z) + 1.55; },
    prompt: () => 'E — pet sheep',
    interact() { s.petted = 0; s.wait = Math.max(s.wait, 2.5); s.target = null; audio.play('baa'); ui.emote(new THREE.Vector3(s.x, heightAt(s.x, s.z) + 1.6, s.z), 'heart'); },
  }));

  return {
    interactables,
    // Sheep are solid for the player.
    colliders: () => sheep.map((s) => ({ x: s.x, z: s.z, r: 0.5 })),
    update(dt, elapsed, player) {
      for (const b of gulls) {
        const a = elapsed * b.speed + b.phase;
        const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r;
        b.g.position.set(x, b.h + Math.sin(elapsed * 0.4 + b.phase) * 1.5, z);
        b.g.rotation.y = Math.atan2(-Math.sin(a) * b.speed, Math.cos(a) * b.speed);
        b.g.rotation.z = b.speed > 0 ? -0.25 : 0.25;
        // A few flaps, then a glide.
        const flap = Math.sin(elapsed * 0.5 + b.phase) > 0.2 ? Math.sin(elapsed * 7 + b.phase) * 0.5 : Math.sin(elapsed * 1.2) * 0.08;
        b.wingR.rotation.z = flap; b.wingL.rotation.z = -flap;
      }

      for (const r of rabbits) {
        const dx = r.x - player.position.x, dz = r.z - player.position.z, d = Math.hypot(dx, dz);
        if (r.flee <= 0 && d < 3.6) { r.flee = 0.9; const a = Math.atan2(dz, dx) + (rng() - 0.5) * 0.9; r.dirX = Math.cos(a); r.dirZ = Math.sin(a); }
        let moving = false;
        if (r.flee > 0) {
          r.flee -= dt;
          const nx = r.x + r.dirX * 5.2 * dt, nz = r.z + r.dirZ * 5.2 * dt;
          if (heightAt(nx, nz) > 0.5) { r.x = nx; r.z = nz; }
          r.heading = Math.atan2(r.dirX, r.dirZ); moving = true;
        } else if (d > 9) {
          // Once the coast is clear, hop home.
          const hx = r.home.x - r.x, hz = r.home.z - r.z, hd = Math.hypot(hx, hz);
          if (hd > 0.4) { r.x += (hx / hd) * 1.6 * dt; r.z += (hz / hd) * 1.6 * dt; r.heading = Math.atan2(hx, hz); moving = true; }
        }
        r.hopPhase += dt * (moving ? 13 : 0);
        const hop = moving ? Math.abs(Math.sin(r.hopPhase)) * 0.22 : 0;
        r.g.position.set(r.x, heightAt(r.x, r.z) + hop, r.z);
        r.g.rotation.y = r.heading;
        // Sit up and look about now and then.
        r.g.rotation.x = moving ? 0 : -Math.max(0, Math.sin(elapsed * 0.7 + r.idle)) * 0.35;
      }

      for (const s of sheep) {
        s.petted += dt;
        if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) s.target = meadowSpot(); }
        else if (s.target) {
          const tx = s.target.x - s.x, tz = s.target.z - s.z, td = Math.hypot(tx, tz);
          const nearPlayer = Math.hypot(s.x - player.position.x, s.z - player.position.z) < 1.1;
          if (td < 0.2 || nearPlayer) { s.target = null; s.wait = 3 + rng() * 6; }
          else {
            s.x += (tx / td) * 0.55 * dt; s.z += (tz / td) * 0.55 * dt;
            let diff = Math.atan2(tx, tz) - s.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            s.heading += diff * Math.min(1, dt * 3);
          }
        }
        s.position.x = s.x; s.position.z = s.z;
        const squish = s.petted < 0.8 ? Math.sin((s.petted / 0.8) * Math.PI) : 0;
        s.g.position.set(s.x, heightAt(s.x, s.z), s.z);
        s.g.rotation.y = s.heading;
        s.g.scale.set(1 + squish * 0.08, 1 - squish * 0.1, 1 + squish * 0.08);
        // Head down to graze while standing, up when walking or petted.
        const graze = s.wait > 0 && s.petted > 1.5 ? 0.5 + Math.sin(elapsed * 2.2 + s.x) * 0.08 : 0;
        s.head.rotation.x += (graze - s.head.rotation.x) * Math.min(1, dt * 3);
        s.head.position.y = 0.86 - s.head.rotation.x * 0.35;
      }
    },
  };
}
