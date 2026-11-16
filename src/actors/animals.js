import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { CHICKEN_YARD, CAT_SPOT } from '../logic/layout.js';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';

const soft = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 }); // rounded, not faceted

function part(geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  // Only the bulk of an animal throws a shadow; eyes, feet and ears are not worth drawing twice.
  geo.computeBoundingSphere(); m.position.set(x, y, z); m.castShadow = geo.boundingSphere.radius > 0.13;
  return m;
}

function buildChicken(color) {
  const g = new THREE.Group();
  const body = soft(color);
  const b = part(new THREE.SphereGeometry(0.2, 14, 10), body, 0, 0.26, 0); b.scale.set(0.92, 0.95, 1.2);
  const breast = part(new THREE.SphereGeometry(0.14, 12, 8), body, 0, 0.3, 0.12);
  const neck = part(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), body, 0, 0.4, 0.15); neck.rotation.x = 0.25;
  const head = new THREE.Group(); head.position.set(0, 0.47, 0.17);
  head.add(part(new THREE.SphereGeometry(0.105, 12, 10), body, 0, 0, 0), part(new THREE.SphereGeometry(0.03, 6, 6), soft(0xf0625d), 0, -0.09, 0.08), part(new THREE.SphereGeometry(0.016, 6, 6), soft(0x2f2826), -0.07, 0.03, 0.07), part(new THREE.SphereGeometry(0.016, 6, 6), soft(0x2f2826), 0.07, 0.03, 0.07));
  const beak = part(new THREE.ConeGeometry(0.04, 0.09, 6), soft(0xffb24a), 0, -0.01, 0.12); beak.rotation.x = Math.PI / 2;
  const comb = part(new THREE.SphereGeometry(0.05, 8, 6), soft(0xf0625d), 0, 0.11, 0.01); comb.scale.set(0.35, 1, 1.5);
  head.add(beak, comb);
  const tail = new THREE.Group(); tail.position.set(0, 0.34, -0.2);
  for (const a of [-0.45, 0, 0.45]) { const f = part(new THREE.ConeGeometry(0.06, 0.24, 6), body, Math.sin(a) * 0.05, 0.08, -0.03); f.rotation.set(-0.75, 0, -a); f.scale.z = 0.5; tail.add(f); }
  const wingL = part(new THREE.SphereGeometry(0.1, 8, 6), body, -0.17, 0.28, 0), wingR = part(new THREE.SphereGeometry(0.1, 8, 6), body, 0.17, 0.28, 0);
  wingL.scale.set(0.35, 0.8, 1.1); wingR.scale.set(0.35, 0.8, 1.1);
  const legMat = soft(0xffb24a);
  // Legs swing from the hip, each ending in a little foot.
  const leg = (x) => { const p = new THREE.Group(); p.position.set(x, 0.13, 0); const f = part(new THREE.BoxGeometry(0.05, 0.012, 0.08), legMat, 0, -0.125, 0.02); f.castShadow = false; p.add(part(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 5), legMat, 0, -0.065, 0), f); return p; };
  const legL = leg(-0.06), legR = leg(0.06);
  g.add(b, breast, neck, head, tail, wingL, wingR, legL, legR);
  return { g, head, wingL, wingR, legL, legR, tail };
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
  // Front paws, one of which does the washing; ears that can twitch.
  const pawL = part(new THREE.SphereGeometry(0.05, 8, 6), cream, -0.08, 0.04, 0.22), pawR = part(new THREE.SphereGeometry(0.05, 8, 6), cream, 0.08, 0.04, 0.22);
  g.add(pawL, pawR);
  const tail = new THREE.Group(); tail.position.set(0, 0.14, -0.3);
  const tailMesh = part(new THREE.CapsuleGeometry(0.04, 0.34, 3, 6), fur, 0, 0.2, 0);
  tail.add(tailMesh);
  g.add(body, chest, head, tail);
  return { g, head, tail, body, pawR, ears: head.children.slice(1, 3), eyes: head.children.slice(3, 5) };
}

export function createAnimals(scene, deps) {
  const { ui, audio } = deps;
  const rng = createRng(SEED + 9);
  const inYard = () => { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * (CHICKEN_YARD.r - 0.6); return { x: CHICKEN_YARD.x + Math.cos(a) * r, z: CHICKEN_YARD.z + Math.sin(a) * r }; };

  const chickens = [0xffffff, 0xfff0d8, 0xe8b98a, 0xffffff].map((color) => {
    const model = buildChicken(color);
    const p = inYard();
    scene.add(model.g);
    return { ...model, x: p.x, z: p.z, target: inYard(), wait: rng() * 3, heading: rng() * 6.28, panic: 0, vx: 0, vz: 0, phase: rng() * 6, step: 0, roost: 0 };
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
  let petted = 10, curl = 0, wash = 0;

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
    update(dt, elapsed, player, night = 0) {
      // The prompt follows the flock, so E works wherever the chickens currently are.
      let cx = 0, cz = 0;
      let ranThrough = false;
      for (const c of chickens) {
        let walking = false;
        if (c.panic > 0) {
          c.panic -= dt; c.step += dt * 30;
          c.x += c.vx * dt; c.z += c.vz * dt;
          c.vx *= 1 - Math.min(1, dt * 3); c.vz *= 1 - Math.min(1, dt * 3);
          // Never out to sea: stay within reach of the yard.
          const d = Math.hypot(c.x - CHICKEN_YARD.x, c.z - CHICKEN_YARD.z);
          if (d > CHICKEN_YARD.r + 4) { c.x = CHICKEN_YARD.x + ((c.x - CHICKEN_YARD.x) / d) * (CHICKEN_YARD.r + 4); c.z = CHICKEN_YARD.z + ((c.z - CHICKEN_YARD.z) / d) * (CHICKEN_YARD.r + 4); }
          c.heading = Math.atan2(c.vx, c.vz);
          if (c.panic <= 0) { c.target = inYard(); c.wait = 0.4; }
        } else if (night > 0.6) {
          c.wait = 1; // roosting: nobody wanders about after dark
        } else if (c.wait > 0) {
          c.wait -= dt;
        } else {
          const dx = c.target.x - c.x, dz = c.target.z - c.z, d = Math.hypot(dx, dz);
          if (d < 0.15) { c.wait = 1 + rng() * 4; c.target = inYard(); }
          else {
            const far = Math.hypot(c.x - CHICKEN_YARD.x, c.z - CHICKEN_YARD.z) > CHICKEN_YARD.r;
            const speed = (far ? 1.6 : 0.6) * dt;
            c.x += (dx / d) * Math.min(speed, d); c.z += (dz / d) * Math.min(speed, d); c.step += Math.min(speed, d) * 22; walking = true;
            const want = Math.atan2(dx, dz); let diff = want - c.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            c.heading += diff * Math.min(1, dt * 8);
          }
        }
        if (c.panic <= 0 && player.speed > 4 && Math.hypot(player.position.x - c.x, player.position.z - c.z) < 1.3) ranThrough = true;

        const flap = c.panic > 0 ? Math.sin(elapsed * 40 + c.phase) * 0.9 : 0;
        c.wingL.rotation.z = -Math.abs(flap); c.wingR.rotation.z = Math.abs(flap);
        // Pecking when standing around.
        // Settled down for the night: sunk onto the ground, head tucked in.
        c.roost += ((night > 0.6 && c.panic <= 0 ? 1 : 0) - c.roost) * Math.min(1, dt * 2);
        // Pecking in bursts when standing around, with a look up in between; the head nods forward with each stride.
        const peck = c.panic <= 0 && c.wait > 0 && c.roost < 0.3 && Math.sin(elapsed * 0.9 + c.phase) > 0 ? Math.max(0, Math.sin(elapsed * 7 + c.phase)) : 0;
        c.head.position.y = 0.47 - peck * 0.2 - c.roost * 0.07;
        c.head.position.z = 0.17 + peck * 0.05 + (walking ? Math.sin(c.step * 2) * 0.035 : 0) - c.roost * 0.05;
        c.head.rotation.x = peck * 0.9; c.head.rotation.y = peck > 0 || walking || c.roost > 0.3 ? 0 : Math.sin(elapsed * 1.7 + c.phase * 3) * 0.6;
        const stride = walking || c.panic > 0 ? Math.sin(c.step) * 0.75 : 0;
        c.legL.rotation.x = stride; c.legR.rotation.x = -stride; c.legL.scale.y = c.legR.scale.y = 1 - c.roost * 0.75;
        c.tail.rotation.x = Math.sin(elapsed * 2.3 + c.phase) * 0.08 + peck * 0.25;
        const hop = (c.panic > 0 ? Math.abs(Math.sin(elapsed * 18 + c.phase)) * 0.22 : walking ? Math.abs(Math.sin(c.step)) * 0.012 : 0) - c.roost * 0.095;
        c.g.position.set(c.x, heightAt(c.x, c.z) + hop, c.z);
        c.g.rotation.y = c.heading; c.g.visible = (player.position.x - c.x) ** 2 + (player.position.z - c.z) ** 2 < 65 * 65; // too small to see from further off
        cx += c.x; cz += c.z;
      }
      if (ranThrough) scatterChickens(player.position);
      centre.x = cx / chickens.length; centre.z = cz / chickens.length;

      // The cat watches the player and leans in when petted.
      petted += dt;
      const dx = player.position.x - CAT_SPOT.x, dz = player.position.z - CAT_SPOT.z;
      const near = Math.hypot(dx, dz) < 7; cat.g.visible = dx * dx + dz * dz < 65 * 65;
      let look = near ? Math.atan2(dx, dz) - cat.g.rotation.y : 0;
      look = THREE.MathUtils.clamp(Math.atan2(Math.sin(look), Math.cos(look)), -1.1, 1.1);
      cat.head.rotation.y += (look - cat.head.rotation.y) * Math.min(1, dt * 5);
      cat.tail.rotation.z = Math.sin(elapsed * 1.6) * 0.35;
      cat.tail.rotation.x = -0.5 + Math.sin(elapsed * 0.9) * 0.1;
      const squish = petted < 0.8 ? Math.sin((petted / 0.8) * Math.PI) : 0;
      // Curled up after dark; by day, a wash every so often when nobody is fussing it.
      curl += ((night > 0.6 && petted > 3 ? 1 : 0) - curl) * Math.min(1, dt * 1.5);
      const cycle = (elapsed + 4) % 11, washing = cycle < 3.2 && petted > 2 && curl < 0.2 && !(near && Math.hypot(dx, dz) < 2.5);
      wash += ((washing ? 1 : 0) - wash) * Math.min(1, dt * 5);
      const lick = Math.sin(elapsed * 9) * 0.5 + 0.5;
      cat.pawR.position.set(0.08 - wash * 0.03, 0.04 + wash * (0.36 + lick * 0.05), 0.22 + wash * 0.05);
      cat.g.scale.set(1 + squish * 0.1 + curl * 0.06, 1 - squish * 0.14 - curl * 0.22, 1 + squish * 0.1 + curl * 0.04);
      cat.head.rotation.z = squish * 0.3 + wash * 0.25 + curl * 0.5;
      cat.head.rotation.x = wash * (0.35 + lick * 0.2) + curl * 0.45;
      cat.head.position.y = 0.5 - curl * 0.12;
      for (const eye of cat.eyes) eye.scale.y = 1 - 0.85 * Math.max(curl, wash * 0.6);
      // An ear flicks now and then.
      const flick = Math.max(0, Math.sin(elapsed * 0.83) - 0.95) * 20;
      cat.ears[0].rotation.z = flick * Math.sin(elapsed * 40) * 0.35; cat.ears[1].rotation.z = Math.max(0, Math.sin(elapsed * 0.61 + 2) - 0.95) * 20 * Math.sin(elapsed * 40) * 0.35;
    },
  };
}
