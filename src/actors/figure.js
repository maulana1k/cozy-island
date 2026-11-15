import * as THREE from 'three';

const DARK = 0x3f3330;

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });

function part(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = true;
  return m;
}

function buildAccent(kind, accentColor) {
  const m = mat(accentColor);
  const g = new THREE.Group();
  if (kind === 'hat') { // wide straw sun hat
    g.add(part(new THREE.CylinderGeometry(0.46, 0.48, 0.035, 18), m));
    g.add(part(new THREE.CylinderGeometry(0.22, 0.27, 0.17, 18), m, 0, 0.09, 0));
    g.add(part(new THREE.CylinderGeometry(0.275, 0.28, 0.05, 18), mat(0xe0704f), 0, 0.04, 0));
    g.position.y = 1.24; g.rotation.x = -0.08;
  } else if (kind === 'cap') {
    g.add(part(new THREE.SphereGeometry(0.318, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), m));
    const peak = part(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 14, 1, false, -Math.PI / 2, Math.PI), m, 0, 0.02, 0.24);
    g.add(peak); g.position.y = 1.07; g.rotation.x = -0.12;
  } else if (kind === 'scarf') {
    const ring = part(new THREE.TorusGeometry(0.17, 0.065, 8, 16), m); ring.rotation.x = Math.PI / 2;
    g.add(ring, part(new THREE.BoxGeometry(0.1, 0.22, 0.05), m, 0.1, -0.12, 0.16)); g.position.y = 0.76;
  } else if (kind === 'bow') {
    const l = part(new THREE.ConeGeometry(0.09, 0.16, 8), m, -0.08, 0, 0); l.rotation.z = -Math.PI / 2;
    const r = part(new THREE.ConeGeometry(0.09, 0.16, 8), m, 0.08, 0, 0); r.rotation.z = Math.PI / 2;
    g.add(l, r, part(new THREE.SphereGeometry(0.05, 8, 8), m)); g.position.set(0, 1.34, 0);
  } else if (kind === 'apron') {
    g.add(part(new THREE.BoxGeometry(0.3, 0.3, 0.04), m, 0, 0.52, 0.2));
  } else if (kind === 'flower') {
    g.add(part(new THREE.SphereGeometry(0.05, 8, 8), mat(0xffe07a)));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(part(new THREE.SphereGeometry(0.05, 8, 8), m, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0)); }
    g.position.set(0.2, 1.24, 0.14); g.rotation.set(-0.5, 0.4, 0);
  }
  return g;
}

function limb(upperMat, lowerMat, length, radius, endGeo, endMat) {
  // A pivot at the top so the limb swings from the shoulder or hip.
  const pivot = new THREE.Group();
  pivot.add(part(new THREE.CapsuleGeometry(radius, length, 3, 8), lowerMat, 0, -length / 2 - radius * 0.4, 0));
  if (upperMat) pivot.add(part(new THREE.CapsuleGeometry(radius * 1.25, length * 0.3, 3, 8), upperMat, 0, -length * 0.2, 0));
  if (endGeo) pivot.add(part(endGeo, endMat, 0, -length - radius * 1.1, 0.03));
  return pivot;
}

// A small kid-sized person with a big round head. Origin at the feet, facing +z.
export function createFigure({
  bodyColor, accent, accentColor = 0xffffff, hairColor = 0x5b4336,
  skinColor = 0xf1c7a0, shortsColor = 0x5f7fa6, backpackColor = null, neckerchief = null,
}) {
  const group = new THREE.Group();
  const inner = new THREE.Group(); // bobs and wobbles without disturbing the group's own transform
  group.add(inner);
  const shirt = mat(bodyColor), skin = mat(skinColor), dark = mat(DARK), shorts = mat(shortsColor), shoe = mat(0xfaf3e6);

  const torso = part(new THREE.CapsuleGeometry(0.2, 0.2, 4, 12), shirt, 0, 0.6, 0);
  const hips = part(new THREE.CapsuleGeometry(0.19, 0.06, 4, 12), shorts, 0, 0.42, 0);
  const head = part(new THREE.SphereGeometry(0.3, 22, 18), skin, 0, 1.02, 0); head.scale.y = 0.94;
  const hair = part(new THREE.SphereGeometry(0.314, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(hairColor), 0, 1.02, 0);
  hair.rotation.x = -0.45;
  const eyeGeo = new THREE.SphereGeometry(0.036, 8, 8);
  const eyeL = part(eyeGeo, dark, -0.11, 1.04, 0.272), eyeR = part(eyeGeo, dark, 0.11, 1.04, 0.272);
  const smile = part(new THREE.TorusGeometry(0.055, 0.012, 6, 10, Math.PI), dark, 0, 0.955, 0.283); smile.rotation.z = Math.PI;
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xf28d85, roughness: 1, transparent: true, opacity: 0.7 });
  const cheekGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const cheekL = part(cheekGeo, cheekMat, -0.19, 0.97, 0.225), cheekR = part(cheekGeo, cheekMat, 0.19, 0.97, 0.225);
  cheekL.scale.z = cheekR.scale.z = 0.35; cheekL.castShadow = cheekR.castShadow = false;
  eyeL.castShadow = eyeR.castShadow = smile.castShadow = false;

  const armL = limb(shirt, skin, 0.2, 0.055), armR = limb(shirt, skin, 0.2, 0.055);
  armL.position.set(-0.25, 0.72, 0); armR.position.set(0.25, 0.72, 0);
  const shoeGeo = new THREE.SphereGeometry(0.085, 10, 8); shoeGeo.scale(1, 0.7, 1.35);
  const legL = limb(null, skin, 0.16, 0.065, shoeGeo, shoe), legR = limb(null, skin, 0.16, 0.065, shoeGeo, shoe);
  legL.position.set(-0.1, 0.36, 0); legR.position.set(0.1, 0.36, 0);

  inner.add(torso, hips, head, hair, eyeL, eyeR, smile, cheekL, cheekR, armL, armR, legL, legR);
  if (accent) inner.add(buildAccent(accent, accentColor));
  // Every scout wears a neckerchief.
  if (neckerchief !== null) inner.add(buildAccent('scarf', neckerchief));
  if (backpackColor !== null) {
    const pack = part(new THREE.BoxGeometry(0.3, 0.32, 0.16), mat(backpackColor), 0, 0.62, -0.24);
    const flap = part(new THREE.BoxGeometry(0.31, 0.1, 0.17), mat(0xf4e3b5), 0, 0.74, -0.245);
    inner.add(pack, flap);
  }

  let phase = 0, lastElapsed = null, swing = 0, run = 0;

  return {
    group,
    // speed in m/s drives the stride; opts.sitting folds the legs; opts.wobble (0..1) shakes the body.
    animate(speed, elapsed, opts = {}) {
      const dt = lastElapsed === null ? 0 : Math.min(0.1, Math.max(0, elapsed - lastElapsed));
      lastElapsed = elapsed;
      swing += (Math.min(1, speed / 3.5) - swing) * Math.min(1, dt * 10);
      run += (Math.min(1, Math.max(0, (speed - 3.8) / 3)) - run) * Math.min(1, dt * 8);
      phase += dt * (4 + speed * 2.1);
      const s = Math.sin(phase) * swing;
      if (opts.sitting) {
        legL.rotation.x = legR.rotation.x = -1.45;
        armL.rotation.x = armR.rotation.x = -0.3;
        armL.rotation.z = -0.15; armR.rotation.z = 0.15;
        inner.position.y = 0;
      } else {
        legL.rotation.x = s * 1.0; legR.rotation.x = -s * 1.0;
        // Walking swings the arms; running holds them out a little, like a kid dashing about.
        armL.rotation.x = -s * (0.8 - run * 0.4); armR.rotation.x = s * (0.8 - run * 0.4);
        armL.rotation.z = -0.15 - run * 0.75; armR.rotation.z = 0.15 + run * 0.75;
        // A little bounce on each step, and a slow breath when standing still.
        inner.position.y = Math.abs(Math.cos(phase)) * (0.05 + run * 0.05) * swing + Math.sin(elapsed * 2) * 0.008 * (1 - swing);
      }
      inner.rotation.x = swing * 0.1 + run * 0.16;
      const w = opts.wobble || 0;
      inner.rotation.z = Math.sin(elapsed * 26) * 0.28 * w + Math.sin(phase) * 0.04 * swing;
      inner.scale.y = 1 + Math.sin(elapsed * 2) * 0.012 - w * 0.06;
    },
  };
}
