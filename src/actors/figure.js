import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DARK = 0x3f3330;
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Every body is drawn with this one material; the colours live in the vertices.
const BODY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

// Welds the loose pieces of one body segment (say, a head with its hair, ears, eyes and nose)
// into a single mesh. A person is then about a dozen things to draw instead of forty.
function weld(segment, cast = true) {
  const pieces = segment.children.filter((c) => c.isMesh && !c.userData.keep);
  if (!pieces.length) return;
  const geos = pieces.map((c) => {
    c.updateMatrix();
    const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
    g.applyMatrix4(c.matrix);
    const col = c.material.color, n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  for (const c of pieces) segment.remove(c);
  const mesh = new THREE.Mesh(mergeGeometries(geos), BODY);
  mesh.castShadow = cast;
  segment.add(mesh);
}

// Where the player is, so far-off people can be animated less often.
const viewer = { x: 0, z: 0 };
let frameCount = 0;
// The ground under any spot, so feet can be planted on it. Set once by the game.
let groundUnder = null;
export function setGround(fn) { groundUnder = fn; }
const solePoint = new THREE.Vector3();

export function setViewer(x, z) { viewer.x = x; viewer.z = z; frameCount++; }

function part(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = shadow;
  return m;
}

// Two builds. Scouts are short and chubby with a big head; staff are taller and slimmer.
const KID = { thigh: 0.13, shin: 0.13, pelvisY: 0.31, neckY: 0.3, headR: 0.2, headY: 0.165, shX: 0.178, shY: 0.232, upper: 0.115, fore: 0.105, hipX: 0.078, chest: 0.138, belly: 0.168, limb: 1 };
const GROWN = { thigh: 0.25, shin: 0.25, pelvisY: 0.55, neckY: 0.42, headR: 0.15, headY: 0.15, shX: 0.2, shY: 0.345, upper: 0.2, fore: 0.18, hipX: 0.085, chest: 0.155, belly: 0.15, limb: 0.95 };

// Hats, neckerchiefs and the like, sized to the build. Coordinates are from the feet up.
function buildAccent(kind, accentColor, P) {
  const m = mat(accentColor);
  const g = new THREE.Group();
  const headC = P.pelvisY + P.neckY + P.headY, R = P.headR;
  if (kind === 'hat') { // wide-brimmed scout hat
    g.add(part(new THREE.CylinderGeometry(R * 1.75, R * 1.8, 0.025, 18), m));
    g.add(part(new THREE.CylinderGeometry(R * 0.8, R * 1.0, R * 0.75, 16), m, 0, R * 0.38, 0));
    g.add(part(new THREE.CylinderGeometry(R * 1.02, R * 1.03, 0.035, 16), mat(0xe0704f), 0, 0.03, 0, false));
    g.position.y = headC + R * 0.55; g.rotation.x = -0.07;
  } else if (kind === 'cap') {
    const dome = part(new THREE.SphereGeometry(R * 1.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m);
    g.add(dome, part(new THREE.CylinderGeometry(R * 0.78, R * 0.78, 0.022, 12, 1, false, -Math.PI / 2, Math.PI), m, 0, 0.012, R * 0.85));
    g.position.y = headC + R * 0.2; g.rotation.x = -0.12;
  } else if (kind === 'scarf') { // neckerchief: a roll round the collar and a point hanging down the front
    const r = P.chest * 0.62;
    const ring = part(new THREE.TorusGeometry(r, 0.03, 8, 16), m, 0, 0, 0, false); ring.rotation.x = Math.PI / 2;
    const point = part(new THREE.ConeGeometry(0.06, 0.15, 4), m, 0, -0.08, P.chest * 0.82, false); point.rotation.x = Math.PI; point.scale.z = 0.4;
    g.add(ring, point); g.position.y = P.pelvisY + P.neckY - 0.015;
  } else if (kind === 'bow') {
    const l = part(new THREE.ConeGeometry(0.06, 0.11, 8), m, -0.055, 0, 0); l.rotation.z = -Math.PI / 2;
    const r = part(new THREE.ConeGeometry(0.06, 0.11, 8), m, 0.055, 0, 0); r.rotation.z = Math.PI / 2;
    g.add(l, r, part(new THREE.SphereGeometry(0.032, 8, 8), m)); g.position.set(0, headC + R * 0.98, 0);
  } else if (kind === 'apron') {
    g.add(part(new THREE.BoxGeometry(P.belly * 1.5, P.neckY * 0.85, 0.025), m, 0, P.pelvisY + P.neckY * 0.42, P.belly * 0.86, false));
  }
  return g;
}

const HEAD_ACCENTS = new Set(['hat', 'cap', 'bow']);

// A person built from tapered pieces with bending knees and elbows. Origin at the feet, facing +z.
// `scale` above 1 makes a grown-up member of staff.
export function createFigure({
  bodyColor, accent, accentColor = 0xffffff, hairColor = 0x5b4336,
  skinColor = 0xf1c7a0, shortsColor = 0x5f7fa6, backpackColor = null, neckerchief = null, holdFlags = false,
  coat = null, armband = false, carry = null, scale = 1,
}) {
  const P = scale > 1.05 ? GROWN : KID;
  const PELVIS_Y = P.pelvisY, LEG = P.thigh + P.shin, TALL = P.pelvisY + P.neckY + P.headY + P.headR;
  const group = new THREE.Group();
  const inner = new THREE.Group();   // leans and squashes
  const pelvis = new THREE.Group();  // bobs; carries legs and torso
  const torso = new THREE.Group();   // twists against the hips
  const neck = new THREE.Group();
  group.add(inner); inner.add(pelvis); pelvis.add(torso); torso.add(neck);
  pelvis.position.y = PELVIS_Y; neck.position.y = P.neckY;

  const shirt = mat(bodyColor), skin = mat(skinColor), dark = mat(DARK), shorts = mat(shortsColor), shoe = mat(0xf2ede2), sock = mat(0xfafafa);
  // A limb piece that narrows toward its end, hanging down from y = 0.
  const taper = (rTop, rBottom, length, material, y = 0) => part(new THREE.CylinderGeometry(rTop * P.limb, rBottom * P.limb, length, 12), material, 0, y - length / 2, 0);

  // Shorts flare out a little at the hem; the body is a soft barrel, widest at the tummy.
  const seat = part(new THREE.CylinderGeometry(P.belly * 0.98, P.belly * 1.05, 0.13, 16), shorts, 0, -0.005, 0); seat.scale.z = 0.88;
  pelvis.add(seat);
  const bodyH = P.neckY - 0.04;
  const body = part(new THREE.CylinderGeometry(P.chest, P.belly, bodyH, 16), shirt, 0, bodyH / 2 + 0.02, 0); body.scale.z = 0.88;
  const shoulders = part(new THREE.SphereGeometry(P.chest, 16, 10), shirt, 0, bodyH + 0.02, 0); shoulders.scale.set(1.0, 0.5, 0.88);
  torso.add(body, shoulders, part(new THREE.CylinderGeometry(0.05, 0.06, 0.07, 10), skin, 0, P.neckY - 0.01, 0, false));

  // Head: a big soft shape with ears, a small nose, oval eyes and a smile.
  const R = P.headR, hy = P.headY;
  const head = part(new THREE.SphereGeometry(R, 24, 18), skin, 0, hy, 0); head.scale.set(1.04, 0.96, 1.0);
  const hair = part(new THREE.SphereGeometry(R * 1.05, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), mat(hairColor), 0, hy + R * 0.02, -R * 0.03); hair.scale.set(1.04, 0.98, 1.03);
  hair.rotation.x = -0.4;
  const earGeo = new THREE.SphereGeometry(R * 0.2, 8, 8);
  const earL = part(earGeo, skin, -R * 1.0, hy - R * 0.05, 0, false), earR = part(earGeo, skin, R * 1.0, hy - R * 0.05, 0, false); earL.scale.x = earR.scale.x = 0.5;
  const eyeGeo = new THREE.SphereGeometry(R * 0.085, 8, 8);
  const eyeL = part(eyeGeo, dark, -R * 0.36, hy + R * 0.08, R * 0.92, false), eyeR = part(eyeGeo, dark, R * 0.36, hy + R * 0.08, R * 0.92, false);
  eyeL.scale.set(0.8, 1.35, 0.5); eyeR.scale.set(0.8, 1.35, 0.5);
  const nose = part(new THREE.ConeGeometry(R * 0.11, R * 0.24, 4), mat(new THREE.Color(skinColor).multiplyScalar(0.9)), 0, hy - R * 0.1, R * 1.02, false); nose.rotation.x = Math.PI / 2 - 0.4;
  const smile = part(new THREE.TorusGeometry(R * 0.2, R * 0.035, 6, 10, Math.PI), dark, 0, hy - R * 0.3, R * 0.9, false); smile.rotation.z = Math.PI;
  const cheekMat = mat(new THREE.Color(skinColor).lerp(new THREE.Color(0xf28d85), 0.4));
  const cheekGeo = new THREE.SphereGeometry(R * 0.15, 8, 8);
  const cheekL = part(cheekGeo, cheekMat, -R * 0.58, hy - R * 0.2, R * 0.77, false), cheekR = part(cheekGeo, cheekMat, R * 0.58, hy - R * 0.2, R * 0.77, false);
  cheekL.scale.z = cheekR.scale.z = 0.35;
  neck.add(head, hair, earL, earR, eyeL, eyeR, nose, smile, cheekL, cheekR);

  // Arms: a flared short sleeve, an upper arm, then a forearm ending in a mitten hand.
  function arm(side) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * P.shX, P.shY, 0);
    shoulder.add(taper(0.052, 0.068, 0.075, shirt, 0.02), taper(0.046, 0.041, P.upper, skin));
    const elbow = new THREE.Group(); elbow.position.y = -P.upper;
    const hand = part(new THREE.SphereGeometry(0.048 * P.limb, 10, 8), skin, 0, -P.fore - 0.022, 0, false); hand.scale.set(0.9, 1.1, 0.8);
    elbow.add(part(new THREE.SphereGeometry(0.041 * P.limb, 10, 8), skin, 0, 0, 0, false), taper(0.041, 0.034, P.fore, skin), hand);
    if (armband && side === -1) { // a first-aider's white band with a red cross
      shoulder.add(part(new THREE.CylinderGeometry(0.066, 0.07, 0.06, 10), mat(0xffffff), 0, -0.035, 0, false),
        part(new THREE.BoxGeometry(0.012, 0.045, 0.016), mat(0xd9453a), -0.07, -0.035, 0, false), part(new THREE.BoxGeometry(0.012, 0.016, 0.045), mat(0xd9453a), -0.07, -0.035, 0, false));
    }
    if (holdFlags) { // a signalling flag in each hand
      const hy2 = -P.fore - 0.02;
      const stickM = part(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 5), dark, 0, hy2 - 0.18, 0, false);
      const red = part(new THREE.BoxGeometry(0.28, 0.14, 0.01), mat(0xe8503a), side * 0.15, hy2 - 0.31, 0), yel = part(new THREE.BoxGeometry(0.28, 0.14, 0.01), mat(0xf2c94c), side * 0.15, hy2 - 0.17, 0);
      elbow.add(stickM, red, yel);
    }
    shoulder.add(elbow); torso.add(shoulder);
    return { shoulder, elbow };
  }
  // Legs: the leg of the shorts, a thigh, then a shin with a sock and a chunky shoe.
  const shoeGeo = new THREE.SphereGeometry(0.066 * P.limb, 12, 8); shoeGeo.scale(1, 0.72, 1.7);
  function leg(side) {
    const hip = new THREE.Group(); hip.position.set(side * P.hipX, -0.04, 0);
    hip.add(taper(0.074, 0.084, Math.min(0.1, P.thigh * 0.75), shorts, 0.02), taper(0.058, 0.052, P.thigh, skin));
    const knee = new THREE.Group(); knee.position.y = -P.thigh;
    knee.add(part(new THREE.SphereGeometry(0.052 * P.limb, 10, 8), skin, 0, 0, 0, false), taper(0.052, 0.042, P.shin - 0.03, skin),
      taper(0.046, 0.046, 0.045, sock, -P.shin + 0.06), part(shoeGeo, shoe, 0, -P.shin + 0.02, 0.035));
    hip.add(knee); pelvis.add(hip);
    return { hip, knee };
  }
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);

  const accents = [];
  const attach = (kind, color) => {
    const a = buildAccent(kind, color, P); accents.push(a);
    const holder = new THREE.Group(); holder.add(a);
    if (HEAD_ACCENTS.has(kind)) { holder.position.y = -(PELVIS_Y + P.neckY); neck.add(holder); }
    else { holder.position.y = -PELVIS_Y; torso.add(holder); }
  };
  if (accent) attach(accent, accentColor);
  if (neckerchief !== null) attach('scarf', neckerchief); // every scout wears one
  if (backpackColor !== null) {
    torso.add(part(new THREE.BoxGeometry(P.belly * 1.5, P.neckY * 0.8, 0.13), mat(backpackColor), 0, P.neckY * 0.52, -P.belly * 0.88 - 0.05), part(new THREE.BoxGeometry(P.belly * 1.55, 0.08, 0.14), mat(0xf4e3b5), 0, P.neckY * 0.82, -P.belly * 0.88 - 0.055, false));
  }
  if (coat !== null) { // a long coat over the uniform
    const c = part(new THREE.CylinderGeometry(P.chest * 1.06, P.belly * 1.22, P.neckY + 0.2, 14), mat(coat), 0, (P.neckY + 0.2) / 2 - 0.2, 0); c.scale.z = 0.9;
    torso.add(c, part(new THREE.BoxGeometry(0.014, P.neckY * 0.9, 0.014), mat(0xd8d2c4), 0, P.neckY * 0.4, P.belly * 0.97, false));
  }
  // Something carried in both arms: a supply crate.
  let load = null;
  if (carry !== null) { load = part(new THREE.BoxGeometry(0.34, 0.24, 0.24), mat(carry), 0, P.neckY * 0.45, P.belly + 0.13); load.userData.keep = true; torso.add(load); }
  // Only the trunk, head and legs throw a shadow; that is all a simple shadow needs.
  for (const seg of [pelvis, torso, neck, legL.hip, legL.knee, legR.hip, legR.knee]) weld(seg, true);
  for (const seg of [armL.shoulder, armL.elbow, armR.shoulder, armR.elbow, ...accents]) weld(seg, false);
  group.scale.setScalar(scale);

  let phase = 0, lastElapsed = null, gait = 0, run = 0, footLift = 0;
  // The underside of a shoe, in the shin's own frame: heel, middle and toe.
  const soleY = -P.shin + 0.02 - 0.0475 * P.limb, SOLE = [[-0.07, 0], [0.035, -0.004], [0.14, 0]].map(([z, dy]) => new THREE.Vector3(0, soleY + dy, z * P.limb));
  const seed = Math.random() * 10, slot = Math.floor(Math.random() * 3);
  // Current joint angles, eased toward their targets every frame so no pose ever snaps.
  const pose = { thL: 0, thR: 0, knL: 0, knR: 0, shLx: 0, shRx: 0, shLz: -0.15, shRz: 0.15, elL: -0.15, elR: -0.15, spreadL: 0, spreadR: 0, py: 0, lean: 0, hy: 0, hp: 0 };

  return {
    group,
    // How far to lower the figure so it sits on the ground, or on a seat of a given height.
    sitDrop: (PELVIS_Y - 0.15) * scale,
    seatLift: (top) => top + 0.07 - PELVIS_Y * scale,
    setCarry(on) { if (load) load.visible = on; },
    // speed (m/s) drives the stride. opts: sitting, sitGround, wobble 0..1, air (-1 falling .. 1 rising,
    // only while airborne), land 0..1 (just landed), roll, pitch, reach 0..1, wave 0..1,
    // pose: 'clap' | 'jacks' | 'salute' | 'stir' | 'eat' | 'hammer'.
    animate(speed, elapsed, o = {}) {
      // People a long way off only need a fresh pose every third frame.
      const far = (group.position.x - viewer.x) ** 2 + (group.position.z - viewer.z) ** 2 > 38 * 38;
      if (far && (frameCount + slot) % 3 !== 0) return;
      const dt = lastElapsed === null ? 0 : clamp(elapsed - lastElapsed, 0, 0.1);
      lastElapsed = elapsed;
      const ease = (k) => 1 - Math.exp(-dt * k);
      gait += (clamp(speed / 0.7, 0, 1) - gait) * ease(10);
      run += (clamp((speed - 2.6) / 1.3, 0, 1) - run) * ease(7);
      // Feet must keep up with the ground: each step covers a set distance, so the legs
      // turn over exactly as fast as the body is moving. Faster means longer strides.
      const stepLen = 0.26 + 0.12 * speed;
      phase += (dt * speed * Math.PI) / stepLen;
      const s = Math.sin(phase), c2 = Math.cos(phase + 0.6);
      const t = { ...pose };
      t.hy = 0; t.hp = 0;

      // ---- Walking and running
      // The legs open just wide enough to cover that step, whatever the length of leg.
      const A = Math.min(1.0, Math.asin(Math.min(0.9, stepLen / (2 * LEG * scale)))) * gait;
      t.thL = -s * A - run * 0.12 * gait; t.thR = s * A - run * 0.12 * gait;
      t.knL = (0.1 + (0.6 + run * 0.6) * Math.max(0, c2)) * gait;
      t.knR = (0.1 + (0.6 + run * 0.6) * Math.max(0, -c2)) * gait;
      const B = (0.45 + run * 0.45) * gait;
      t.shLx = s * B; t.shRx = -s * B;
      // Arms flap out a bit when running flat out, like a kid who cannot quite keep them in.
      t.shLz = -0.14 - run * 0.12; t.shRz = 0.14 + run * 0.12;
      t.hp = -run * 0.1 + Math.sin(phase * 2) * 0.015 * gait;
      t.elL = -0.15 - (0.2 + run * 1.05) * gait - Math.max(0, -s) * 0.25 * gait;
      t.elR = -0.15 - (0.2 + run * 1.05) * gait - Math.max(0, s) * 0.25 * gait;
      t.spreadL = 0; t.spreadR = 0;
      t.py = -Math.cos(phase * 2) * (0.006 + run * 0.014) * gait - (1 - Math.cos(A)) * LEG * 0.9 * gait + Math.sin(elapsed * 1.8 + seed) * 0.006 * (1 - gait);
      t.lean = 0.04 * gait + run * 0.13;
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
        t.py -= 0.3 * LEG * land; t.shLz -= 0.4 * land; t.shRz += 0.4 * land; t.lean += 0.15 * land;
      }
      if (o.sitting || o.sitGround) {
        t.thL = t.thR = -1.5; t.knL = t.knR = o.sitGround ? 1.9 : 1.35;
        t.spreadL = o.sitGround ? -0.5 : 0; t.spreadR = o.sitGround ? 0.5 : 0;
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
      } else if (o.pose === 'sleep') {
        t.thL = t.thR = 0; t.knL = t.knR = 0.05; t.shLx = t.shRx = 0; t.shLz = -0.12; t.shRz = 0.12; t.elL = t.elR = -0.1; t.py = 0; t.lean = 0;
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
        t.thL = -1.5; t.knL = 1.6; t.thR = -0.15; t.knR = 1.75; t.py = -0.52 * LEG; t.lean = 0.3;
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
        t.thL = t.thR = -1.0; t.knL = t.knR = 1.75; t.py = -0.48 * LEG; t.lean = 0.38;
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
          case 'crouch': mix('thL', -1.25); mix('thR', -1.25); mix('knL', 2.0); mix('knR', 2.0); t.py -= 0.55 * LEG * env; t.lean += 0.3 * env; mix('shRx', -1.0); mix('elR', -0.5 + osc(8) * 0.35); mix('shRz', 0.1); break;
          case 'pat': mix('shRx', -1.25); mix('elR', -0.45 + osc(8) * 0.35); mix('shRz', 0.1); t.lean += 0.18 * env; break;
          case 'wave': mix('shRz', 2.45); mix('shRx', 0); mix('elR', -0.5 + osc(9) * 0.45); break;
          case 'shoo': mix('shRz', 1.2 + osc(8) * 0.35); mix('shLz', -1.2 - osc(8) * 0.35); mix('shRx', -0.7); mix('shLx', -0.7); mix('elR', -0.3); mix('elL', -0.3); t.lean += 0.22 * env; break;
          case 'salute': mix('shRx', -0.5); mix('shRz', 1.35); mix('elR', -2.25); break;
          case 'cheer': mix('shRz', 2.6); mix('shLz', -2.6); mix('shRx', 0); mix('shLx', 0); mix('elR', -0.2); mix('elL', -0.2); t.py += Math.abs(osc(4)) * 0.13 * env; break;
          case 'clap': mix('shRx', -1.0); mix('shLx', -1.0); mix('shRz', -0.25 - Math.max(0, osc(8)) * 0.3); mix('shLz', 0.25 + Math.max(0, osc(8)) * 0.3); mix('elR', -1.0); mix('elL', -1.0); break;
          case 'throw': mix('shRx', u < 0.45 ? 0.9 : -2.6); mix('elR', u < 0.45 ? -1.6 : -0.1); mix('shRz', 0.3); t.lean += (u < 0.45 ? -0.15 : 0.22) * env; break;
          case 'catch': mix('shRx', -2.3); mix('shLx', -2.3); mix('elR', -0.5); mix('elL', -0.5); mix('shRz', -0.15); mix('shLz', 0.15); break;
          case 'laugh': mix('shRx', -0.6); mix('shLx', -0.6); mix('elR', -1.7); mix('elL', -1.7); mix('shRz', -0.4); mix('shLz', 0.4); t.py += Math.abs(osc(10)) * 0.05 * env; t.lean += 0.2 * env; break;
          // ---- Little accidents and idle fidgets
          case 'stumble': { // trip, windmill the arms, catch yourself with a hop
            const fall = Math.sin(Math.min(1, u * 1.6) * Math.PI);
            t.lean += 0.75 * fall; t.shLx = lerp(t.shLx, Math.sin(u * 26) * 1.6 - 0.8, env); t.shRx = lerp(t.shRx, Math.sin(u * 26 + 2) * 1.6 - 0.8, env);
            mix('shLz', -1.0); mix('shRz', 1.0); mix('elL', -0.3); mix('elR', -0.3); t.thL += Math.sin(u * 30) * 0.6 * env; t.thR -= Math.sin(u * 30) * 0.6 * env;
            t.py += Math.max(0, Math.sin((u - 0.55) * Math.PI * 2.2)) * 0.1; t.hp += 0.3 * fall; break;
          }
          case 'bonk': // walked into something: rock back, hands up, shake it off
            t.lean -= 0.42 * env; mix('shLx', -2.2); mix('shRx', -2.2); mix('elL', -1.4); mix('elR', -1.4); t.hy += osc(9) * 0.5 * env; t.hp -= 0.3 * env; t.py -= 0.03 * env; break;
          case 'skid': // stopping in a hurry: lean back, arms out front, heels dug in
            t.lean -= 0.4 * env; mix('shLx', -1.1); mix('shRx', -1.1); mix('shLz', -0.5); mix('shRz', 0.5); mix('thL', -0.7); mix('thR', -0.45); mix('knL', 0.2); mix('knR', 0.5); break;
          case 'scratch': mix('shRx', -2.5); mix('shRz', -0.25); mix('elR', -1.7 + osc(14) * 0.18); t.hy += 0.25 * env; t.hp += 0.12 * env; break;
          case 'stretch': mix('shRz', 2.75); mix('shLz', -2.75); mix('shRx', 0); mix('shLx', 0); mix('elR', -0.15); mix('elL', -0.15); t.lean -= 0.16 * env; t.py += 0.035 * env; t.hp -= 0.3 * env; break;
          case 'yawn': mix('shRx', -1.9); mix('elR', -2.2); mix('shRz', -0.3); t.hp -= 0.4 * env; t.lean -= 0.06 * env; break;
          case 'tapfoot': t.thR = lerp(t.thR, -0.35 + Math.max(0, osc(10)) * 0.3, env); mix('shLz', -0.5); mix('elL', -1.7); mix('shRz', 0.5); mix('elR', -1.7); t.hy += osc(2) * 0.4 * env; break;
          case 'lookabout': t.hy += Math.sin(u * Math.PI * 2) * 0.95; t.hp -= 0.08 * env; mix('shRx', -0.2); break;
          case 'eat': mix('shRx', -0.8); mix('elR', -2.0 + osc(8) * 0.22); mix('shRz', -0.3); mix('shLx', -0.5); mix('elL', -1.0); t.hp += 0.14 * env + osc(8) * 0.05 * env; break;
          case 'drink': mix('shRx', -1.35); mix('elR', -2.15); mix('shRz', -0.25); t.hp -= 0.5 * env; t.lean -= 0.1 * env; break;
          case 'blow': mix('shRx', -1.55); mix('elR', -1.9); mix('shRz', -0.2); mix('shLz', -0.6); mix('elL', -1.6); t.hp -= 0.22 * env; t.lean -= 0.08 * env; break;
          case 'rub': mix('shRx', -0.55); mix('elR', -1.5); mix('shRz', -0.45 + osc(8) * 0.12); t.lean += 0.14 * env; t.hp += 0.2 * env; break;
          case 'pant': mix('shRx', -0.6); mix('shLx', -0.6); mix('elR', -0.3); mix('elL', -0.3); t.lean += 0.45 * env; mix('thL', -0.3); mix('thR', -0.3); mix('knL', 0.55); mix('knR', 0.55); t.py -= 0.05 * env + Math.abs(osc(6)) * 0.02; t.hp += 0.25 * env; break;
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
      // A springy little squash on every footfall, more so at a run.
      const boing = Math.sin(phase * 2 + 0.6) * 0.008 * gait * (1 + run * 0.8);
      inner.scale.set(1 + land * 0.09 - stretch * 0.5 - boing * 0.5, 1 - land * 0.14 + stretch - w * 0.06 + Math.sin(elapsed * 1.8 + seed) * 0.008 + boing, 1 + land * 0.09 - stretch * 0.5 - boing * 0.5);
      // The head stays level and looks about a little when standing.
      // The head bobbles from side to side with each step, and looks about when standing.
      neck.rotation.x = -inner.rotation.x * 0.6 + pose.hp;
      neck.rotation.y = Math.sin(e * 0.45) * 0.28 * (1 - gait) * (o.pose ? 0.3 : 1) + pose.hy;
      neck.rotation.z = -inner.rotation.z * 0.5 + Math.sin(phase) * 0.03 * gait * (1 + run * 0.5);
      // Asleep: flat on the back, centred on the bed, chest rising and falling.
      if (o.pose === 'sleep') { inner.rotation.set(-Math.PI / 2, 0, 0); inner.position.set(0, 0.1, TALL / 2); neck.rotation.set(0, 0, 0); inner.scale.set(1, 1, 1 + Math.sin(elapsed * 1.3 + seed) * 0.03); }
      else {
        // Feet on the ground: find the lowest point of either shoe and move the body so that it
        // rests exactly on the ground under it. A foot can never sink in, and never hovers.
        const planted = groundUnder && !far && !o.sitting && !o.sitGround && o.air === undefined && o.pose !== 'hang';
        if (planted) {
          inner.position.set(0, 0, 0);
          group.updateMatrixWorld(true);
          let pen = -Infinity;
          for (const L of [legL, legR]) for (const pt of SOLE) { solePoint.copy(pt).applyMatrix4(L.knee.matrixWorld); pen = Math.max(pen, groundUnder(solePoint.x, solePoint.z) - (o.sink || 0) - solePoint.y); }
          // Up at once (a foot must never be inside a step); down a touch more gently.
          const want = clamp(pen, -0.12, 0.7);
          footLift = want > footLift || dt <= 0 ? want : footLift + (want - footLift) * ease(30);
        } else if (!groundUnder || o.sitting || o.sitGround || o.air !== undefined || o.pose === 'hang') footLift += (0 - footLift) * ease(20);
        inner.position.set(0, footLift / scale, 0);
      }
    },
  };
}
