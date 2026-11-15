import * as THREE from 'three';

const DARK = 0x3f3330;
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function part(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = shadow;
  return m;
}

// Accents are modelled in whole-figure coordinates (feet at y = 0).
function buildAccent(kind, accentColor) {
  const m = mat(accentColor);
  const g = new THREE.Group();
  if (kind === 'hat') { // wide straw sun hat
    g.add(part(new THREE.CylinderGeometry(0.46, 0.48, 0.035, 18), m));
    g.add(part(new THREE.CylinderGeometry(0.22, 0.27, 0.17, 18), m, 0, 0.09, 0));
    g.add(part(new THREE.CylinderGeometry(0.275, 0.28, 0.05, 18), mat(0xe0704f), 0, 0.04, 0, false));
    g.position.y = 1.24; g.rotation.x = -0.08;
  } else if (kind === 'cap') {
    g.add(part(new THREE.SphereGeometry(0.318, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), m));
    g.add(part(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 14, 1, false, -Math.PI / 2, Math.PI), m, 0, 0.02, 0.24));
    g.position.y = 1.07; g.rotation.x = -0.12;
  } else if (kind === 'scarf') {
    const ring = part(new THREE.TorusGeometry(0.17, 0.06, 8, 16), m, 0, 0, 0, false); ring.rotation.x = Math.PI / 2;
    const knot = part(new THREE.ConeGeometry(0.09, 0.22, 4), m, 0, -0.13, 0.17, false); knot.rotation.x = Math.PI;
    g.add(ring, knot); g.position.y = 0.77;
  } else if (kind === 'bow') {
    const l = part(new THREE.ConeGeometry(0.09, 0.16, 8), m, -0.08, 0, 0); l.rotation.z = -Math.PI / 2;
    const r = part(new THREE.ConeGeometry(0.09, 0.16, 8), m, 0.08, 0, 0); r.rotation.z = Math.PI / 2;
    g.add(l, r, part(new THREE.SphereGeometry(0.05, 8, 8), m)); g.position.set(0, 1.34, 0);
  } else if (kind === 'apron') {
    g.add(part(new THREE.BoxGeometry(0.3, 0.34, 0.04), m, 0, 0.54, 0.2, false));
  }
  return g;
}

const HEAD_ACCENTS = new Set(['hat', 'cap', 'bow']);
const PELVIS_Y = 0.4, NECK_Y = 0.42; // neck is measured from the pelvis

// A small kid-sized person with a big round head, bending knees and elbows.
// Origin at the feet, facing +z.
export function createFigure({
  bodyColor, accent, accentColor = 0xffffff, hairColor = 0x5b4336,
  skinColor = 0xf1c7a0, shortsColor = 0x5f7fa6, backpackColor = null, neckerchief = null, holdFlags = false,
  coat = null, armband = false, carry = null, scale = 1,
}) {
  const group = new THREE.Group();
  const inner = new THREE.Group();   // leans and squashes
  const pelvis = new THREE.Group();  // bobs; carries legs and torso
  const torso = new THREE.Group();   // twists against the hips
  const neck = new THREE.Group();
  group.add(inner); inner.add(pelvis); pelvis.add(torso); torso.add(neck);
  pelvis.position.y = PELVIS_Y; neck.position.y = NECK_Y;

  const shirt = mat(bodyColor), skin = mat(skinColor), dark = mat(DARK), shorts = mat(shortsColor), shoe = mat(0xfaf3e6);

  pelvis.add(part(new THREE.CapsuleGeometry(0.19, 0.06, 4, 12), shorts, 0, 0.02, 0));
  torso.add(part(new THREE.CapsuleGeometry(0.2, 0.2, 4, 12), shirt, 0, 0.2, 0));

  // Head
  const head = part(new THREE.SphereGeometry(0.3, 22, 18), skin, 0, 0.2, 0); head.scale.y = 0.94;
  const hair = part(new THREE.SphereGeometry(0.314, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(hairColor), 0, 0.2, 0);
  hair.rotation.x = -0.45;
  const eyeGeo = new THREE.SphereGeometry(0.036, 8, 8);
  const eyeL = part(eyeGeo, dark, -0.11, 0.22, 0.272, false), eyeR = part(eyeGeo, dark, 0.11, 0.22, 0.272, false);
  const smile = part(new THREE.TorusGeometry(0.055, 0.012, 6, 10, Math.PI), dark, 0, 0.135, 0.283, false); smile.rotation.z = Math.PI;
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xf28d85, roughness: 1, transparent: true, opacity: 0.7 });
  const cheekGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const cheekL = part(cheekGeo, cheekMat, -0.19, 0.15, 0.225, false), cheekR = part(cheekGeo, cheekMat, 0.19, 0.15, 0.225, false);
  cheekL.scale.z = cheekR.scale.z = 0.35;
  neck.add(head, hair, eyeL, eyeR, smile, cheekL, cheekR);

  // Arms: shoulder -> elbow -> hand
  function arm(side) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.25, 0.32, 0);
    shoulder.add(part(new THREE.CapsuleGeometry(0.062, 0.08, 3, 8), shirt, 0, -0.07, 0));
    const elbow = new THREE.Group(); elbow.position.y = -0.14;
    elbow.add(part(new THREE.CapsuleGeometry(0.05, 0.08, 3, 8), skin, 0, -0.065, 0), part(new THREE.SphereGeometry(0.058, 8, 8), skin, 0, -0.15, 0, false));
    if (armband && side === -1) { // a first-aider's white band with a red cross
      shoulder.add(part(new THREE.CylinderGeometry(0.078, 0.078, 0.08, 10), mat(0xffffff), 0, -0.07, 0, false),
        part(new THREE.BoxGeometry(0.012, 0.055, 0.02), mat(0xd9453a), -0.08, -0.07, 0, false), part(new THREE.BoxGeometry(0.012, 0.02, 0.055), mat(0xd9453a), -0.08, -0.07, 0, false));
    }
    if (holdFlags) { // a signalling flag in each hand
      const stickM = part(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), dark, 0, -0.38, 0, false);
      const red = part(new THREE.BoxGeometry(0.32, 0.16, 0.012), mat(0xe8503a), side * 0.17, -0.5, 0), yel = part(new THREE.BoxGeometry(0.32, 0.16, 0.012), mat(0xf2c94c), side * 0.17, -0.34, 0);
      elbow.add(stickM, red, yel);
    }
    shoulder.add(elbow); torso.add(shoulder);
    return { shoulder, elbow };
  }
  // Legs: hip -> knee -> foot
  const shoeGeo = new THREE.SphereGeometry(0.085, 10, 8); shoeGeo.scale(1, 0.7, 1.35);
  function leg(side) {
    const hip = new THREE.Group(); hip.position.set(side * 0.1, -0.02, 0);
    hip.add(part(new THREE.CapsuleGeometry(0.075, 0.1, 3, 8), shorts, 0, -0.08, 0));
    const knee = new THREE.Group(); knee.position.y = -0.17;
    knee.add(part(new THREE.CapsuleGeometry(0.06, 0.1, 3, 8), skin, 0, -0.085, 0), part(shoeGeo, shoe, 0, -0.18, 0.035));
    hip.add(knee); pelvis.add(hip);
    return { hip, knee };
  }
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

  const attach = (kind, color) => {
    const a = buildAccent(kind, color);
    const holder = new THREE.Group(); holder.add(a);
    if (HEAD_ACCENTS.has(kind)) { holder.position.y = -(PELVIS_Y + NECK_Y); neck.add(holder); }
    else { holder.position.y = -PELVIS_Y; torso.add(holder); }
  };
  if (accent) attach(accent, accentColor);
  if (neckerchief !== null) attach('scarf', neckerchief); // every scout wears one
  if (backpackColor !== null) {
    torso.add(part(new THREE.BoxGeometry(0.3, 0.32, 0.16), mat(backpackColor), 0, 0.22, -0.24), part(new THREE.BoxGeometry(0.31, 0.1, 0.17), mat(0xf4e3b5), 0, 0.34, -0.245, false));
  }

  if (coat !== null) { // a long coat over the uniform
    torso.add(part(new THREE.CapsuleGeometry(0.225, 0.3, 4, 12), mat(coat), 0, 0.13, 0), part(new THREE.BoxGeometry(0.02, 0.5, 0.02), mat(0xd8d2c4), 0, 0.12, 0.226, false));
  }
  // Something carried in both arms: a supply crate.
  let load = null;
  if (carry !== null) { load = part(new THREE.BoxGeometry(0.42, 0.3, 0.3), mat(carry), 0, 0.2, 0.36); torso.add(load); }
  group.scale.setScalar(scale);

  let phase = 0, lastElapsed = null, gait = 0, run = 0;
  const seed = Math.random() * 10;
  // Current joint angles, eased toward their targets every frame so no pose ever snaps.
  const pose = { thL: 0, thR: 0, knL: 0, knR: 0, shLx: 0, shRx: 0, shLz: -0.15, shRz: 0.15, elL: -0.15, elR: -0.15, spreadL: 0, spreadR: 0, py: 0, lean: 0 };

  return {
    group,
    setCarry(on) { if (load) load.visible = on; },
    // speed (m/s) drives the stride. opts: sitting, sitGround, wobble 0..1, air (-1 falling .. 1 rising,
    // only while airborne), land 0..1 (just landed), roll, pitch, reach 0..1, wave 0..1,
    // pose: 'clap' | 'jacks' | 'salute' | 'stir' | 'eat' | 'hammer'.
    animate(speed, elapsed, o = {}) {
      const dt = lastElapsed === null ? 0 : clamp(elapsed - lastElapsed, 0, 0.1);
      lastElapsed = elapsed;
      const ease = (k) => 1 - Math.exp(-dt * k);
      gait += (clamp(speed / 0.7, 0, 1) - gait) * ease(10);
      run += (clamp((speed - 3.6) / 2.2, 0, 1) - run) * ease(7);
      // Feet must keep up with the ground: each step covers a set distance, so the legs
      // turn over exactly as fast as the body is moving. Faster means longer strides.
      const stepLen = 0.3 + 0.1 * speed;
      phase += (dt * speed * Math.PI) / stepLen;
      const s = Math.sin(phase), c2 = Math.cos(phase + 0.6);
      const t = { ...pose };

      // ---- Walking and running
      // The legs open just wide enough to cover that step (leg length is about 0.37 m).
      const A = Math.min(1.05, Math.asin(Math.min(0.95, stepLen / 0.74))) * gait;
      t.thL = -s * A - run * 0.12 * gait; t.thR = s * A - run * 0.12 * gait;
      t.knL = (0.12 + (0.7 + run * 0.75) * Math.max(0, c2)) * gait;
      t.knR = (0.12 + (0.7 + run * 0.75) * Math.max(0, -c2)) * gait;
      const B = (0.45 + run * 0.45) * gait;
      t.shLx = s * B; t.shRx = -s * B;
      t.shLz = -0.14 - run * 0.2; t.shRz = 0.14 + run * 0.2;
      t.elL = -0.15 - (0.2 + run * 1.05) * gait - Math.max(0, -s) * 0.25 * gait;
      t.elR = -0.15 - (0.2 + run * 1.05) * gait - Math.max(0, s) * 0.25 * gait;
      t.spreadL = 0; t.spreadR = 0;
      t.py = -Math.cos(phase * 2) * (0.014 + run * 0.035) * gait - (1 - Math.cos(A)) * 0.3 * gait + Math.sin(elapsed * 1.8 + seed) * 0.006 * (1 - gait);
      t.lean = 0.05 * gait + run * 0.2;
      let snap = 14; // how quickly joints chase their targets

      // ---- In the air: tuck on the way up, reach for the ground on the way down
      if (o.air !== undefined) {
        const up = clamp((o.air + 1) / 2, 0, 1);
        t.thL = lerp(-0.1, -0.95, up); t.thR = lerp(-0.3, -0.6, up);
        t.knL = lerp(0.25, 1.5, up); t.knR = lerp(0.45, 1.1, up);
        t.shLz = -lerp(0.9, 1.5, up); t.shRz = lerp(0.9, 1.5, up);
        t.shLx = t.shRx = -0.25; t.elL = t.elR = -0.35;
        t.py = 0; t.lean = 0.12 * up; snap = 16;
      }
      // ---- Landing: knees soak it up
      const land = o.land || 0;
      if (land > 0) {
        t.thL -= 0.55 * land; t.thR -= 0.55 * land; t.knL += 0.95 * land; t.knR += 0.95 * land;
        t.py -= 0.1 * land; t.shLz -= 0.4 * land; t.shRz += 0.4 * land; t.lean += 0.15 * land;
      }
      if (o.sitting || o.sitGround) {
        t.thL = t.thR = -1.5; t.knL = t.knR = o.sitGround ? 1.9 : 1.35;
        t.spreadL = o.sitGround ? -0.55 : 0; t.spreadR = o.sitGround ? 0.55 : 0;
        t.shLx = t.shRx = -0.35; t.elL = t.elR = -0.5; t.py = 0; t.lean = 0;
      }

      // ---- Activities
      const e = elapsed + seed;
      if (o.pose === 'clap') {
        const beat = Math.max(0, Math.sin(e * 5.5));
        t.shLx = t.shRx = -1.0; t.shLz = 0.25 + beat * 0.3; t.shRz = -0.25 - beat * 0.3; t.elL = t.elR = -1.0;
      } else if (o.pose === 'jacks') {
        const k = Math.sin(e * 4.6) * 0.5 + 0.5;
        t.shLz = -(0.25 + 2.3 * k); t.shRz = 0.25 + 2.3 * k; t.shLx = t.shRx = 0; t.elL = t.elR = -0.1;
        t.spreadL = -0.38 * k; t.spreadR = 0.38 * k; t.py = Math.abs(Math.sin(e * 4.6)) * 0.07; snap = 22;
      } else if (o.pose === 'salute') {
        t.shRx = -0.5; t.shRz = 1.35; t.elR = -2.25; t.shLx = 0; t.shLz = -0.08; t.elL = -0.05; t.lean = -0.03;
      } else if (o.pose === 'stir') {
        t.shRx = -1.0 + Math.sin(e * 3.2) * 0.14; t.shRz = Math.cos(e * 3.2) * 0.22; t.elR = -0.75; t.shLx = -0.35; t.elL = -0.9; t.lean = 0.12;
      } else if (o.pose === 'eat') {
        const bite = Math.max(0, Math.sin(e * 1.7));
        t.shRx = -0.55 - bite * 0.3; t.elR = -1.1 - bite * 1.0; t.shLx = -0.6; t.elL = -0.9;
      } else if (o.pose === 'semaphore') {
        // Arms swing between signal positions, holding each for a moment.
        const SIG = [[0.4, 2.4], [1.55, 1.55], [2.4, 0.4], [0.4, 1.55], [1.55, 2.4], [2.4, 2.4], [0.4, 0.4]];
        const [l, r] = SIG[Math.floor(e / 0.95) % SIG.length];
        t.shLz = -l; t.shRz = r; t.shLx = t.shRx = 0; t.elL = t.elR = -0.03; snap = 8;
      } else if (o.pose === 'carry') {
        t.shLx = t.shRx = -0.75; t.elL = t.elR = -1.25; t.shLz = 0.1; t.shRz = -0.1; t.lean += 0.02;
      } else if (o.pose === 'command') {
        // One arm sweeping and pointing, the other on the hip: giving orders.
        t.shRx = -1.45 + Math.sin(e * 2.6) * 0.3; t.shRz = 0.25 + Math.sin(e * 1.7) * 0.35; t.elR = -0.2; t.shLz = -0.55; t.shLx = 0.15; t.elL = -1.7; t.lean = -0.03;
      } else if (o.pose === 'attention') {
        t.shLx = t.shRx = 0; t.shLz = -0.05; t.shRz = 0.05; t.elL = t.elR = -0.03; t.lean = -0.04;
      } else if (o.pose === 'explain') {
        t.shRx = -0.9 + Math.sin(e * 2.2) * 0.25; t.elR = -1.0 + Math.sin(e * 3.1) * 0.3; t.shLx = -0.7 + Math.sin(e * 1.9 + 1) * 0.2; t.elL = -1.1; t.lean = 0.05;
      } else if (o.pose === 'tug') {
        // Leaning back on the rope, feet shuffling for grip.
        t.lean = -0.42 + Math.sin(e * 3.3) * 0.05; t.shLx = t.shRx = -1.15; t.elL = t.elR = -0.45; t.shLz = 0.25; t.shRz = -0.25;
        t.thL = -0.55 + Math.sin(e * 5) * 0.12; t.thR = -0.2 - Math.sin(e * 5) * 0.12; t.knL = 0.75; t.knR = 0.55; t.py = -0.05;
      } else if (o.pose === 'bandage') {
        // Kneeling, both hands busy winding a bandage.
        t.thL = -1.5; t.knL = 1.6; t.thR = -0.15; t.knR = 1.75; t.py = -0.17; t.lean = 0.3;
        t.shLx = -1.0 + Math.sin(e * 5) * 0.12; t.shRx = -1.0 - Math.sin(e * 5) * 0.12; t.elL = -0.8 + Math.cos(e * 5) * 0.2; t.elR = -0.8 - Math.cos(e * 5) * 0.2;
      } else if (o.pose === 'hang') {
        // Hanging from the flying fox: arms straight up, knees tucked, swinging a little.
        t.shLx = t.shRx = -3.0; t.shLz = 0.12; t.shRz = -0.12; t.elL = t.elR = -0.08;
        t.thL = -0.75 + Math.sin(e * 3) * 0.12; t.thR = -0.55 - Math.sin(e * 3) * 0.12; t.knL = 1.2; t.knR = 0.9; t.py = 0; t.lean = -0.12 + Math.sin(e * 2.2) * 0.06;
      } else if (o.pose === 'binoculars') {
        t.shLx = t.shRx = -1.5; t.elL = t.elR = -2.0; t.shLz = 0.3; t.shRz = -0.3; t.lean = -0.04;
      } else if (o.pose === 'write') {
        t.shRx = -0.9; t.elR = -1.2 + Math.sin(e * 7) * 0.08; t.shRz = -0.25 + Math.sin(e * 5) * 0.06; t.shLx = -0.7; t.elL = -1.1; t.lean = 0.2;
      } else if (o.pose === 'hammer') {
        const hit = Math.sin(e * 4.2);
        t.thL = t.thR = -1.0; t.knL = t.knR = 1.75; t.py = -0.15; t.lean = 0.38;
        t.shRx = -1.0 + hit * 0.5; t.elR = -0.9 - hit * 0.3; t.shLx = -0.8; t.elL = -0.7;
      }
      // ---- Gestures layered on top
      // ---- One-off gestures layered on top: a different one for each kind of thing you do
      if (o.gesture) {
        const u = clamp(o.gesture.u, 0, 1), env = Math.sin(u * Math.PI), osc = (n) => Math.sin(u * Math.PI * n);
        const mix = (key, v) => { t[key] = lerp(t[key], v, env); };
        switch (o.gesture.name) {
          case 'reachUp': mix('shRx', -2.7); mix('elR', -0.15); mix('shRz', 0.15); t.py += 0.05 * env; t.lean -= 0.06 * env; break;
          case 'push': mix('shRx', -1.45); mix('shLx', -1.45); mix('elR', -0.2); mix('elL', -0.2); mix('shRz', 0.05); mix('shLz', -0.05); t.lean += 0.28 * env; break;
          case 'pull': mix('shRx', -2.5 + osc(6) * 0.55); mix('shLx', -2.3 - osc(6) * 0.55); mix('elR', -0.7); mix('elL', -0.7); mix('shRz', 0.1); mix('shLz', -0.1); t.py -= Math.max(0, osc(6)) * 0.05 * env; break;
          case 'shake': mix('shRx', -1.5); mix('shLx', -1.5); mix('shRz', 0.1 + osc(10) * 0.3); mix('shLz', -0.1 + osc(10) * 0.3); mix('elR', -0.4); mix('elL', -0.4); t.lean += 0.15 * env; break;
          case 'crouch': mix('thL', -1.25); mix('thR', -1.25); mix('knL', 2.0); mix('knR', 2.0); t.py -= 0.19 * env; t.lean += 0.3 * env; mix('shRx', -1.0); mix('elR', -0.5 + osc(8) * 0.35); mix('shRz', 0.1); break;
          case 'pat': mix('shRx', -1.25); mix('elR', -0.45 + osc(8) * 0.35); mix('shRz', 0.1); t.lean += 0.18 * env; break;
          case 'wave': mix('shRz', 2.45); mix('shRx', 0); mix('elR', -0.5 + osc(9) * 0.45); break;
          case 'shoo': mix('shRz', 1.2 + osc(8) * 0.35); mix('shLz', -1.2 - osc(8) * 0.35); mix('shRx', -0.7); mix('shLx', -0.7); mix('elR', -0.3); mix('elL', -0.3); t.lean += 0.22 * env; break;
          case 'salute': mix('shRx', -0.5); mix('shRz', 1.35); mix('elR', -2.25); break;
          case 'cheer': mix('shRz', 2.6); mix('shLz', -2.6); mix('shRx', 0); mix('shLx', 0); mix('elR', -0.2); mix('elL', -0.2); t.py += Math.abs(osc(4)) * 0.13 * env; break;
          case 'clap': mix('shRx', -1.0); mix('shLx', -1.0); mix('shRz', -0.25 - Math.max(0, osc(8)) * 0.3); mix('shLz', 0.25 + Math.max(0, osc(8)) * 0.3); mix('elR', -1.0); mix('elL', -1.0); break;
          case 'throw': mix('shRx', u < 0.45 ? 0.9 : -2.6); mix('elR', u < 0.45 ? -1.6 : -0.1); mix('shRz', 0.3); t.lean += (u < 0.45 ? -0.15 : 0.22) * env; break;
          case 'catch': mix('shRx', -2.3); mix('shLx', -2.3); mix('elR', -0.5); mix('elL', -0.5); mix('shRz', -0.15); mix('shLz', 0.15); break;
          case 'laugh': mix('shRx', -0.6); mix('shLx', -0.6); mix('elR', -1.7); mix('elL', -1.7); mix('shRz', -0.4); mix('shLz', 0.4); t.py += Math.abs(osc(10)) * 0.05 * env; t.lean += 0.2 * env; break;
          case 'peer': mix('shRx', -1.5); mix('shLx', -1.5); mix('elR', -2.0); mix('elL', -2.0); mix('shRz', -0.3); mix('shLz', 0.3); t.lean += 0.12 * env; break;
          default: mix('shRx', -1.35); mix('elR', -0.25); mix('shRz', 0.1); t.lean += 0.1 * env; // 'reach'
        }
        snap = 20;
      }

      const k = ease(snap);
      for (const key in pose) pose[key] += (t[key] - pose[key]) * k;

      legL.hip.rotation.set(pose.thL, 0, pose.spreadL); legR.hip.rotation.set(pose.thR, 0, pose.spreadR);
      legL.knee.rotation.x = pose.knL; legR.knee.rotation.x = pose.knR;
      armL.shoulder.rotation.set(pose.shLx, 0, pose.shLz); armR.shoulder.rotation.set(pose.shRx, 0, pose.shRz);
      armL.elbow.rotation.x = pose.elL; armR.elbow.rotation.x = pose.elR;
      pelvis.position.y = PELVIS_Y + pose.py;
      // Shoulders counter the hips, the way a real stride twists the body.
      pelvis.rotation.y = -s * 0.07 * gait; torso.rotation.y = s * 0.17 * gait;

      const w = o.wobble || 0;
      inner.rotation.x = pose.lean + (o.pitch || 0);
      inner.rotation.z = (o.roll || 0) + Math.sin(elapsed * 26) * 0.28 * w;
      const stretch = o.air !== undefined ? Math.abs(o.air) * 0.05 : 0;
      inner.scale.set(1 + land * 0.07 - stretch * 0.5, 1 - land * 0.1 + stretch - w * 0.06 + Math.sin(elapsed * 1.8 + seed) * 0.008, 1 + land * 0.07 - stretch * 0.5);
      // The head stays level and looks about a little when standing.
      neck.rotation.x = -inner.rotation.x * 0.6;
      neck.rotation.y = Math.sin(e * 0.45) * 0.28 * (1 - gait) * (o.pose ? 0.3 : 1);
      neck.rotation.z = -inner.rotation.z * 0.5;
    },
  };
}
