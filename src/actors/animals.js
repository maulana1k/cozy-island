import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { CHICKEN_YARD, CAT_SPOT } from '../logic/layout.js';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';

const soft = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true });

function part(geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

function buildChicken(color) {
  const g = new THREE.Group();
  const body = soft(color);
  const b = part(new THREE.SphereGeometry(0.2, 10, 8), body, 0, 0.26, 0); b.scale.set(0.9, 0.9, 1.15);
  const head = part(new THREE.SphereGeometry(0.11, 10, 8), body, 0, 0.47, 0.17);
  const beak = part(new THREE.ConeGeometry(0.04, 0.09, 6), soft(0xffb24a), 0, 0.46, 0.29); beak.rotation.x = Math.PI / 2;
  const comb = part(new THREE.BoxGeometry(0.03, 0.07, 0.1), soft(0xf0625d), 0, 0.59, 0.17);
  const tail = part(new THREE.ConeGeometry(0.09, 0.2, 5), body, 0, 0.38, -0.22); tail.rotation.x = -0.9;
  const wingL = part(new THREE.SphereGeometry(0.1, 8, 6), body, -0.17, 0.28, 0), wingR = part(new THREE.SphereGeometry(0.1, 8, 6), body, 0.17, 0.28, 0);
  wingL.scale.set(0.35, 0.8, 1.1); wingR.scale.set(0.35, 0.8, 1.1);
  const legMat = soft(0xffb24a);
  g.add(b, head, beak, comb, tail, wingL, wingR, part(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 4), legMat, -0.06, 0.06, 0), part(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 4), legMat, 0.06, 0.06, 0));
  return { g, head, wingL, wingR };
}

function buildCat() {
  const g = new THREE.Group();
  const fur = soft(0xf2b872), dark = soft(0x4a3b36), cream = soft(0xfff1dc);
  const body = part(new THREE.SphereGeometry(0.24, 12, 10), fur, 0, 0.24, -0.05); body.scale.set(0.9, 0.95, 1.2);
  const chest = part(new THREE.SphereGeometry(0.13, 10, 8), cream, 0, 0.2, 0.14);
  const head = new THREE.Group(); head.position.set(0, 0.5, 0.14);
  head.add(part(new THREE.SphereGeometry(0.17, 12, 10), fur, 0, 0, 0));
  const earGeo = new THREE.ConeGeometry(0.06, 0.11, 4);
  head.add(part(earGeo, fur, -0.1, 0.16, 0), part(earGeo, fur, 0.1, 0.16, 0));
  const eyeGeo = new THREE.SphereGeometry(0.022, 6, 6);
  head.add(part(eyeGeo, dark, -0.065, 0.02, 0.155), part(eyeGeo, dark, 0.065, 0.02, 0.155), part(new THREE.SphereGeometry(0.018, 6, 6), soft(0xff9db5), 0, -0.03, 0.168));
  const tail = new THREE.Group(); tail.position.set(0, 0.14, -0.3);
  const tailMesh = part(new THREE.CapsuleGeometry(0.04, 0.34, 3, 6), fur, 0, 0.2, 0);
  tail.add(tailMesh);
  g.add(body, chest, head, tail);
  return { g, head, tail, body };
}

export function createAnimals(scene, deps) {
  const { ui, audio } = deps;
  const rng = createRng(SEED + 9);
  const inYard = () => { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (CHICKEN_YARD.r - 0.6); return { x: CHICKEN_YARD.x + Math.cos(a) * r, z: CHICKEN_YARD.z + Math.sin(a) * r }; };

  const chickens = [0xffffff, 0xfff0d8, 0xe8b98a, 0xffffff].map((color) => {
    const model = buildChicken(color);
    const p = inYard();
    scene.add(model.g);
    return { ...model, x: p.x, z: p.z, target: inYard(), wait: rng() * 3, heading: rng() * 6.28, panic: 0, vx: 0, vz: 0, phase: rng() * 6 };
  });

  const centre = { x: CHICKEN_YARD.x, z: CHICKEN_YARD.z };
  function scatterChickens(from) {
    for (const c of chickens) {
      let dx = c.x - from.x, dz = c.z - from.z; const d = Math.hypot(dx, dz) || 1;
      const a = Math.atan2(dz, dx) + (rng() - 0.5) * 1.2;
      c.vx = Math.cos(a) * 4.5; c.vz = Math.sin(a) * 4.5; c.panic = 0.55 + rng() * 0.25;
    }
    audio.play('cluck');
  }

  const cat = buildCat();
  const catY = heightAt(CAT_SPOT.x, CAT_SPOT.z);
  cat.g.position.set(CAT_SPOT.x, catY, CAT_SPOT.z);
  cat.g.rotation.y = 0.6;
  scene.add(cat.g);
  let petted = -10;

  const interactables = [
    {
      id: 'chickens', kind: 'chickens', position: centre, markerY: heightAt(centre.x, centre.z) + 1.1,
      prompt: () => 'E — shoo chickens',
      interact() { scatterChickens(deps.player.position); },
    },
    {
      id: 'cat', kind: 'cat', position: { x: CAT_SPOT.x, z: CAT_SPOT.z }, markerY: catY + 1.05,
      prompt: () => 'E — pet cat',
      interact() { petted = 0; audio.play('purr'); ui.emote(new THREE.Vector3(CAT_SPOT.x, catY + 1.0, CAT_SPOT.z), 'heart'); },
    },
  ];

  return {
    interactables,
    update(dt, elapsed, player) {
      // The prompt follows the flock, so E works wherever the chickens currently are.
      let cx = 0, cz = 0;
      let ranThrough = false;
      for (const c of chickens) {
        if (c.panic > 0) {
          c.panic -= dt;
          c.x += c.vx * dt; c.z += c.vz * dt;
          c.vx *= 1 - Math.min(1, dt * 3); c.vz *= 1 - Math.min(1, dt * 3);
          // Never out to sea: stay within reach of the yard.
          const d = Math.hypot(c.x - CHICKEN_YARD.x, c.z - CHICKEN_YARD.z);
          if (d > CHICKEN_YARD.r + 4) { c.x = CHICKEN_YARD.x + ((c.x - CHICKEN_YARD.x) / d) * (CHICKEN_YARD.r + 4); c.z = CHICKEN_YARD.z + ((c.z - CHICKEN_YARD.z) / d) * (CHICKEN_YARD.r + 4); }
          c.heading = Math.atan2(c.vx, c.vz);
          if (c.panic <= 0) { c.target = inYard(); c.wait = 0.4; }
        } else if (c.wait > 0) {
          c.wait -= dt;
        } else {
          const dx = c.target.x - c.x, dz = c.target.z - c.z, d = Math.hypot(dx, dz);
          if (d < 0.15) { c.wait = 1 + rng() * 4; c.target = inYard(); }
          else {
            const far = Math.hypot(c.x - CHICKEN_YARD.x, c.z - CHICKEN_YARD.z) > CHICKEN_YARD.r;
            const speed = (far ? 1.6 : 0.6) * dt;
            c.x += (dx / d) * Math.min(speed, d); c.z += (dz / d) * Math.min(speed, d);
            const want = Math.atan2(dx, dz); let diff = want - c.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            c.heading += diff * Math.min(1, dt * 8);
          }
        }
        if (c.panic <= 0 && player.speed > 4 && Math.hypot(player.position.x - c.x, player.position.z - c.z) < 1.3) ranThrough = true;

        const flap = c.panic > 0 ? Math.sin(elapsed * 40 + c.phase) * 0.9 : 0;
        c.wingL.rotation.z = -Math.abs(flap); c.wingR.rotation.z = Math.abs(flap);
        // Pecking when standing around.
        c.head.position.y = 0.47 - (c.panic <= 0 && c.wait > 0 ? Math.max(0, Math.sin(elapsed * 6 + c.phase)) * 0.16 : 0);
        const hop = c.panic > 0 ? Math.abs(Math.sin(elapsed * 18 + c.phase)) * 0.22 : 0;
        c.g.position.set(c.x, heightAt(c.x, c.z) + hop, c.z);
        c.g.rotation.y = c.heading;
        cx += c.x; cz += c.z;
      }
      if (ranThrough) scatterChickens(player.position);
      centre.x = cx / chickens.length; centre.z = cz / chickens.length;

      // The cat watches the player and leans in when petted.
      petted += dt;
      const dx = player.position.x - CAT_SPOT.x, dz = player.position.z - CAT_SPOT.z;
      const near = Math.hypot(dx, dz) < 7;
      let look = near ? Math.atan2(dx, dz) - cat.g.rotation.y : 0;
      look = THREE.MathUtils.clamp(Math.atan2(Math.sin(look), Math.cos(look)), -1.1, 1.1);
      cat.head.rotation.y += (look - cat.head.rotation.y) * Math.min(1, dt * 5);
      cat.tail.rotation.z = Math.sin(elapsed * 1.6) * 0.35;
      cat.tail.rotation.x = -0.5 + Math.sin(elapsed * 0.9) * 0.1;
      const squish = petted < 0.8 ? Math.sin((petted / 0.8) * Math.PI) : 0;
      cat.g.scale.set(1 + squish * 0.1, 1 - squish * 0.14, 1 + squish * 0.1);
      cat.head.rotation.z = squish * 0.3;
    },
  };
}
