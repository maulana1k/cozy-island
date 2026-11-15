import * as THREE from 'three';

const SKIN = 0xffe2c6;
const DARK = 0x4a3b36;

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: false });

function limb(material, length, radius) {
  // A pivot at the top so the limb swings from the shoulder or hip.
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 8), material);
  mesh.position.y = -length / 2 - radius * 0.5;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

function buildAccent(kind, accentColor) {
  const m = mat(accentColor);
  const g = new THREE.Group();
  if (kind === 'hat') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 16), m);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 16), m);
    top.position.y = 0.1; g.add(brim, top); g.position.y = 1.26;
  } else if (kind === 'cap') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.285, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12, 1, false, -Math.PI / 2, Math.PI), m);
    peak.position.set(0, 0.02, 0.24); g.add(dome, peak); g.position.y = 1.1;
  } else if (kind === 'scarf') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 16), m);
    ring.rotation.x = Math.PI / 2;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.05), m);
    tail.position.set(0.12, -0.14, 0.17); g.add(ring, tail); g.position.y = 0.86;
  } else if (kind === 'bow') {
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 8), m); l.rotation.z = -Math.PI / 2; l.position.x = -0.08;
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 8), m); r.rotation.z = Math.PI / 2; r.position.x = 0.08;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), m);
    g.add(l, r, knot); g.position.set(0, 1.33, 0);
  } else if (kind === 'apron') {
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.04), m);
    front.position.set(0, 0.5, 0.27); g.add(front);
  } else if (kind === 'flower') {
    const centre = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(0xffe07a));
    g.add(centre);
    for (let i = 0; i < 5; i++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), m);
      const a = (i / 5) * Math.PI * 2;
      petal.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0); g.add(petal);
    }
    g.position.set(0.17, 1.27, 0.12); g.rotation.set(-0.5, 0.4, 0);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// A small rounded person. Origin at the feet, facing +z.
export function createFigure({ bodyColor, accent, accentColor = 0xffffff, hairColor = 0x7a5540 }) {
  const group = new THREE.Group();
  const inner = new THREE.Group(); // bobs and wobbles without disturbing the group's own transform
  group.add(inner);
  const bodyMat = mat(bodyColor), skinMat = mat(SKIN), darkMat = mat(DARK);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.28, 4, 12), bodyMat);
  body.position.y = 0.58; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), skinMat);
  head.position.y = 1.08; head.castShadow = true;
  const eyeGeo = new THREE.SphereGeometry(0.034, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, darkMat), eyeR = new THREE.Mesh(eyeGeo, darkMat);
  eyeL.position.set(-0.1, 1.1, 0.255); eyeR.position.set(0.1, 1.1, 0.255);
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xffa9a9, roughness: 1 });
  const cheekGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const cheekL = new THREE.Mesh(cheekGeo, cheekMat), cheekR = new THREE.Mesh(cheekGeo, cheekMat);
  cheekL.position.set(-0.17, 1.02, 0.215); cheekR.position.set(0.17, 1.02, 0.215);
  cheekL.scale.z = cheekR.scale.z = 0.4;

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.297, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(hairColor));
  hair.position.y = 1.08; hair.rotation.x = -0.42; hair.castShadow = true;

  const armL = limb(bodyMat, 0.2, 0.07), armR = limb(bodyMat, 0.2, 0.07);
  armL.position.set(-0.31, 0.78, 0); armR.position.set(0.31, 0.78, 0);
  armL.rotation.z = -0.18; armR.rotation.z = 0.18;
  const legL = limb(darkMat, 0.14, 0.08), legR = limb(darkMat, 0.14, 0.08);
  legL.position.set(-0.12, 0.32, 0); legR.position.set(0.12, 0.32, 0);

  inner.add(body, head, hair, eyeL, eyeR, cheekL, cheekR, armL, armR, legL, legR);
  if (accent) inner.add(buildAccent(accent, accentColor));

  let phase = 0, lastElapsed = null, swing = 0;

  return {
    group,
    // speed in m/s drives the stride; opts.sitting folds the legs; opts.wobble (0..1) shakes the body.
    animate(speed, elapsed, opts = {}) {
      const dt = lastElapsed === null ? 0 : Math.min(0.1, Math.max(0, elapsed - lastElapsed));
      lastElapsed = elapsed;
      const target = Math.min(1, speed / 3.5);
      swing += (target - swing) * Math.min(1, dt * 10);
      phase += dt * (4 + speed * 2.2);
      const s = Math.sin(phase) * swing;
      if (opts.sitting) {
        legL.rotation.x = legR.rotation.x = -1.45;
        armL.rotation.x = armR.rotation.x = -0.3;
        inner.position.y = 0;
      } else {
        legL.rotation.x = s * 0.9; legR.rotation.x = -s * 0.9;
        armL.rotation.x = -s * 0.8; armR.rotation.x = s * 0.8;
        // A little bounce on each step, and a slow breath when standing still.
        inner.position.y = Math.abs(Math.cos(phase)) * 0.06 * swing + Math.sin(elapsed * 2) * 0.008 * (1 - swing);
      }
      inner.rotation.x = swing * 0.12 * Math.min(1, speed / 7 + 0.4);
      const w = opts.wobble || 0;
      inner.rotation.z = Math.sin(elapsed * 26) * 0.28 * w;
      inner.scale.y = 1 + Math.sin(elapsed * 2) * 0.012 - w * 0.06;
    },
  };
}
