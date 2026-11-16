import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DARK = 0x3f3330;
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Every body is drawn with this one material; the colours live in the vertices.
const BODY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });

// ---- One skin over a skeleton
// A person is a single mesh that bends with the bones inside it. Limbs and trunk are tubes swept
// through rings, shared between the two bones either side of each joint so elbows and knees bend
// in a curve; everything else (head, hair, shoes, pockets) rides rigidly on one bone.
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const tint = new THREE.Color();
// rings run from the top down: { y, rx, rz, col, w } where w is the share held by bone b (the rest by bone a).
function tube(cx, cz, rings, a, b, { seg = 12, capTop = false, capBottom = false } = {}) {
  const pos = [], col = [], si = [], sw = [], idx = [];
  const ring = (r, rx, rz) => {
    tint.set(r.col);
    for (let k = 0; k < seg; k++) {
      const t = (k / seg) * Math.PI * 2;
      pos.push(cx + Math.sin(t) * rx, r.y, cz + Math.cos(t) * rz);
      col.push(tint.r, tint.g, tint.b); si.push(a, b, 0, 0); sw.push(1 - (r.w || 0), r.w || 0, 0, 0);
    }
  };
  const all = [...rings];
  if (capTop) all.unshift({ ...rings[0], rx: 0.0001, rz: 0.0001 });
  if (capBottom) all.push({ ...rings[rings.length - 1], rx: 0.0001, rz: 0.0001 });
  for (const r of all) ring(r, r.rx, r.rz ?? r.rx);
  for (let i = 0; i < all.length - 1; i++) for (let k = 0; k < seg; k++) {
    const p0 = i * seg + k, q0 = i * seg + (k + 1) % seg, p1 = p0 + seg, q1 = q0 + seg;
    idx.push(p0, p1, q0, q0, p1, q1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}
// A loose piece turned into skin that follows one bone.
const toGroup = new THREE.Matrix4();
function rigid(mesh, bone, groupInverse) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(toGroup.multiplyMatrices(groupInverse, mesh.matrixWorld));
  const n = g.attributes.position.count, c = mesh.material.color, col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; si[i * 4] = bone; sw[i * 4] = 1; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

// Where the player is, so far-off people can be animated less often.
const viewer = { x: 0, z: 0 };
let frameCount = 0;
// The ground under any spot, so feet can be planted on it. Set once by the game.
let groundUnder = null;
export function setGround(fn) { groundUnder = fn; }
const solePoint = new THREE.Vector3();

// (x, z) is the camera, for judging detail; (px, pz) is the scout, the one people look at.
const scout = { x: 0, z: 0 };
export function setViewer(x, z, px = x, pz = z) { viewer.x = x; viewer.z = z; scout.x = px; scout.z = pz; frameCount++; }
// How sleepy the whole camp is (0 by day, 1 late at night), so faces can show it.
let sleepy = 0;
export function setSleepy(v) { sleepy = v; }
// Past these distances a person holding still, and then anyone at all, keeps the last pose.
const FAR_IN = 46, FAR_OUT = 42, FAR_ANY = 70;

function part(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = shadow;
  return m;
}

// Two builds. Scouts are small with a big head (about 1.05 m to the crown, legs about a third of
// that, a child's long-ish trunk); staff are taller and slimmer. `belly` is the waist at the belt,
// `hips` the seat of the shorts, `chest` the ribcage under the arms.
const KID = { thigh: 0.168, shin: 0.162, pelvisY: 0.38, neckY: 0.3, headR: 0.2, headY: 0.18, shX: 0.172, shY: 0.232, upper: 0.126, fore: 0.116, hipX: 0.072, chest: 0.15, belly: 0.136, hips: 0.146, limb: 1 };
const GROWN = { thigh: 0.25, shin: 0.25, pelvisY: 0.55, neckY: 0.42, headR: 0.15, headY: 0.15, shX: 0.2, shY: 0.345, upper: 0.2, fore: 0.18, hipX: 0.085, chest: 0.158, belly: 0.142, hips: 0.152, limb: 0.95 };
const KID_LEG = KID.thigh + KID.shin - 0.02; // a scout's hip-to-ankle length, the yardstick for every stride

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
// Poses and gestures that place the legs themselves (everything else walks on solved legs).
const LEG_POSES = new Set(['jacks', 'sleep', 'tug', 'bandage', 'hang', 'hammer']);
const LEG_GESTURES = new Set(['crouch', 'skid', 'pant', 'stumble', 'tapfoot', 'reachUp', 'pull', 'cheer', 'laugh', 'stretch', 'bonk']);
const LEG_KEYS = new Set(['thL', 'thR', 'knL', 'knR', 'py', 'lean', 'trunk', 'spreadL', 'spreadR', 'fL', 'fR']);
const ARM_KEYS = new Set(['shLx', 'shRx', 'shLz', 'shRz', 'elL', 'elR']);

// Faces. Each is: how high the brows sit, how far their inner ends tip up (down if negative),
// the curve of the mouth (1 a smile, -1 a frown) and how wide the eyes are open.
const FACES = {
  neutral: [0, 0, 0.75, 1], happy: [0.03, 0.05, 1, 0.95], joy: [0.07, 0.05, 1.25, 0.68], surprised: [0.16, 0.1, 0.3, 1.22],
  puzzled: [0.06, 0.28, 0.3, 1], sad: [0.05, 0.42, -0.75, 0.82], sleepy: [-0.03, 0.12, 0.45, 0.5], effort: [-0.06, -0.38, 0.22, 0.8],
};
const GESTURE_FACE = {
  cheer: 'joy', laugh: 'joy', wave: 'happy', salute: 'happy', pat: 'happy', clap: 'happy', eat: 'happy', drink: 'happy', catch: 'happy',
  stumble: 'surprised', bonk: 'surprised', skid: 'surprised', pant: 'effort', pull: 'effort', push: 'effort', shake: 'effort', throw: 'effort', crouch: 'neutral',
  scratch: 'puzzled', lookabout: 'puzzled', peer: 'puzzled', tapfoot: 'puzzled', yawn: 'sleepy', rub: 'sad',
};
const POSE_FACE = { tug: 'effort', hammer: 'effort', jacks: 'effort', clap: 'joy', eat: 'happy', command: 'effort', sleep: 'sleepy', hang: 'joy', binoculars: 'puzzled', bandage: 'puzzled' };

// A person built from tapered pieces with bending knees and elbows. Origin at the feet, facing +z.
// `scale` above 1 makes a grown-up member of staff.
export function createFigure({
  bodyColor, accent, accentColor = 0xffffff, hairColor = 0x5b4336,
  skinColor = 0xf1c7a0, shortsColor = 0x5f7fa6, backpackColor = null, neckerchief = null, holdFlags = false,
  coat = null, armband = false, carry = null, scale = 1,
  eyeColor = [0x5b3a24, 0x4a3020, 0x3f5f7a, 0x4f6b3a, 0x6b4a2a][Math.floor(Math.random() * 5)], hairStyle = Math.floor(Math.random() * 5), self = false,
}) {
  const P = scale > 1.05 ? GROWN : KID;
  const PELVIS_Y = P.pelvisY, LEG = P.thigh + P.shin, TALL = P.pelvisY + P.neckY + P.headY + P.headR;
  const group = new THREE.Group();
  const inner = new THREE.Bone();   // leans and squashes
  const pelvis = new THREE.Bone();  // bobs; carries legs and torso
  const torso = new THREE.Bone();   // twists against the hips
  const neck = new THREE.Bone();
  group.add(inner); inner.add(pelvis); pelvis.add(torso); torso.add(neck);
  pelvis.position.y = PELVIS_Y; neck.position.y = P.neckY;

  const shirt = mat(bodyColor), skin = mat(skinColor), dark = mat(DARK), shorts = mat(shortsColor), shoe = mat(0xf2ede2), sock = mat(0xfafafa);

  const bodyH = P.neckY - 0.04;
  // Uniform details: collar, button placket, a chest pocket with a flap, shoulder straps, a belt with a brass buckle.
  {
    const tone = (k) => mat(new THREE.Color(bodyColor).multiplyScalar(k));
    const shade = tone(0.82), light = tone(1.12), leather = mat(0x6b4a34), brass = mat(0xe2b84a);
    const zf = (y) => (P.belly + (P.chest - P.belly) * Math.min(1, Math.max(0, (y - 0.02) / bodyH))) * 0.88; // how far forward the shirt front is at height y
    const add = (m) => { torso.add(m); return m; };
    for (const sx of [-1, 1]) {
      const wing = add(part(new THREE.ConeGeometry(0.036, 0.075, 4), light, sx * 0.04, bodyH - 0.005, zf(bodyH) * 0.86, false)); wing.rotation.set(0.5, sx * 0.4, sx * 2.5); wing.scale.z = 0.45;
      add(part(new THREE.BoxGeometry(0.07, 0.012, 0.045), shade, sx * P.chest * 0.72, bodyH + P.chest * 0.33, 0, false)).rotation.z = -sx * 0.5; // shoulder strap
      add(part(new THREE.SphereGeometry(0.008, 6, 6), brass, sx * P.chest * 0.5, bodyH + P.chest * 0.4, 0.012, false));
    }
    add(part(new THREE.BoxGeometry(0.016, bodyH * 0.74, 0.008), shade, 0, bodyH * 0.5 + 0.02, zf(bodyH * 0.5) + 0.002, false)).rotation.x = Math.atan2(P.belly - P.chest, bodyH) * 0.88;
    for (let k = 0; k < 3; k++) { const y = bodyH * (0.3 + k * 0.22) + 0.02; add(part(new THREE.SphereGeometry(0.0085, 8, 6), mat(0xfff6e0), 0, y, zf(y) + 0.006, false)); }
    for (const sx of [-1, 1]) {
      const y = bodyH * 0.66, x = sx * P.chest * 0.5, z = Math.sqrt(Math.max(0.0001, 1 - (x / (zf(y) / 0.88)) ** 2)) * zf(y);
      const pocket = add(part(new THREE.BoxGeometry(0.058, 0.05, 0.008), shade, x, y, z + 0.002, false)); pocket.rotation.y = sx * 0.42;
      const flap = add(part(new THREE.BoxGeometry(0.062, 0.018, 0.01), light, x, y + 0.026, z + 0.004, false)); flap.rotation.y = sx * 0.42;
      add(part(new THREE.SphereGeometry(0.006, 6, 6), brass, x + sx * 0.002, y + 0.02, z + 0.011, false));
    }
    const belt = add(part(new THREE.CylinderGeometry(P.belly * 1.035, P.belly * 1.045, 0.034, 18), leather, 0, 0.035, 0, false)); belt.scale.z = 0.88;
    add(part(new THREE.BoxGeometry(0.05, 0.036, 0.012), brass, 0, 0.035, P.belly * 0.92, false));
    add(part(new THREE.BoxGeometry(0.028, 0.018, 0.014), leather, 0, 0.035, P.belly * 0.92 + 0.002, false));
    // Shorts: a turned hem and two side pockets.
    const hem = part(new THREE.CylinderGeometry(P.hips * 1.035, P.hips * 1.045, 0.02, 16), mat(new THREE.Color(shortsColor).multiplyScalar(0.8)), 0, -0.066, 0, false); hem.scale.z = 0.88; pelvis.add(hem);
    for (const sx of [-1, 1]) { const p = part(new THREE.BoxGeometry(0.008, 0.06, 0.05), mat(new THREE.Color(shortsColor).multiplyScalar(0.8)), sx * P.hips * 0.99, -0.02, 0.01, false); p.rotation.x = 0.3; pelvis.add(p); }
  }

  // Head: a big soft shape with ears, a small nose, oval eyes and a smile.
  const R = P.headR, hy = P.headY;
  const head = part(new THREE.SphereGeometry(R, 24, 18), skin, 0, hy, 0); head.scale.set(1.04, 0.96, 1.0);
  const hair = part(new THREE.SphereGeometry(R * 1.05, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), mat(hairColor), 0, hy + R * 0.02, -R * 0.03); hair.scale.set(1.04, 0.98, 1.03);
  hair.rotation.x = -0.4;
  const earGeo = new THREE.SphereGeometry(R * 0.2, 8, 8);
  const earL = part(earGeo, skin, -R * 1.0, hy - R * 0.05, 0, false), earR = part(earGeo, skin, R * 1.0, hy - R * 0.05, 0, false); earL.scale.x = earR.scale.x = 0.5;
  // Eyes that can blink and look about: whites, a coloured iris, a pupil and a glint of light.
  const eyeRig = new THREE.Bone(); eyeRig.position.set(0, hy + R * 0.08, 0);
  const whites = new THREE.Group(), pupils = new THREE.Bone();
  for (const sx of [-1, 1]) {
    const w = part(new THREE.SphereGeometry(R * 0.135, 12, 10), mat(0xffffff), sx * R * 0.36, 0, R * 0.875, false); w.scale.set(0.95, 1.2, 0.5);
    const iris = part(new THREE.SphereGeometry(R * 0.09, 12, 8), mat(eyeColor), sx * R * 0.36, 0, R * 0.925, false); iris.scale.set(0.92, 1.12, 0.4);
    const pupil = part(new THREE.SphereGeometry(R * 0.052, 10, 8), dark, sx * R * 0.36, 0, R * 0.95, false); pupil.scale.set(0.92, 1.12, 0.4);
    const glint = part(new THREE.SphereGeometry(R * 0.024, 6, 6), mat(0xffffff), sx * R * 0.36 + R * 0.032, R * 0.045, R * 0.968, false);
    whites.add(w); pupils.add(iris, pupil, glint);
  }
  eyeRig.add(whites, pupils);
  const hairMat = mat(hairColor);
  const browL = part(new THREE.BoxGeometry(R * 0.27, R * 0.06, R * 0.05), dark, -R * 0.37, hy + R * 0.31, R * 0.93, false), browR = part(new THREE.BoxGeometry(R * 0.27, R * 0.06, R * 0.05), dark, R * 0.37, hy + R * 0.31, R * 0.93, false);
  browL.rotation.set(-0.2, -0.35, 0.1); browR.rotation.set(-0.2, 0.35, -0.1);
  // Upper lashes: a dark line over each eye.
  const lashL = part(new THREE.BoxGeometry(R * 0.26, R * 0.022, R * 0.03), dark, -R * 0.36, hy + R * 0.225, R * 0.925, false), lashR = part(new THREE.BoxGeometry(R * 0.26, R * 0.022, R * 0.03), dark, R * 0.36, hy + R * 0.225, R * 0.925, false);
  lashL.rotation.y = -0.36; lashR.rotation.y = 0.36;
  // A mouth that opens: dark inside, a pink tongue.
  const mouth = new THREE.Bone(); mouth.position.set(0, hy - R * 0.36, R * 0.9);
  { const inside = part(new THREE.SphereGeometry(R * 0.11, 10, 8), mat(0x6e2a2a), 0, 0, 0, false); inside.scale.set(1.25, 1, 0.3);
    const tongue = part(new THREE.SphereGeometry(R * 0.06, 8, 6), mat(0xe58a8a), 0, -R * 0.045, R * 0.012, false); tongue.scale.set(1.2, 0.6, 0.3);
    const teeth = part(new THREE.BoxGeometry(R * 0.15, R * 0.03, R * 0.02), mat(0xffffff), 0, R * 0.075, R * 0.02, false);
    mouth.add(inside, tongue, teeth); mouth.scale.y = 0.1; }
  const earInL = part(new THREE.SphereGeometry(R * 0.11, 8, 6), mat(new THREE.Color(skinColor).multiplyScalar(0.86)), -R * 1.06, hy - R * 0.05, R * 0.03, false), earInR = part(new THREE.SphereGeometry(R * 0.11, 8, 6), mat(new THREE.Color(skinColor).multiplyScalar(0.86)), R * 1.06, hy - R * 0.05, R * 0.03, false);
  earInL.scale.x = earInR.scale.x = 0.35;
  // Hair: everyone has a hairline and sideburns, then one of five styles on top of that.
  const locks = [];
  const lock = (r, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = part(new THREE.SphereGeometry(R * r, 10, 8), hairMat, R * x, hy + R * y, R * z, false); m.scale.set(sx, sy, sz); locks.push(m); return m; };
  for (const sx of [-1, 1]) lock(0.2, sx * 0.9, 0.12, 0.28, 0.45, 1.3, 0.8);
  if (hairStyle === 1) for (const x of [-0.5, -0.17, 0.17, 0.5]) lock(0.3, x, 0.62 - Math.abs(x) * 0.25, 0.72, 1, 0.75, 0.7);          // a fringe
  else if (hairStyle === 2) { lock(0.36, 0, 0.95, -0.45); lock(0.14, 0, 0.72, -0.52, 1.6, 0.6, 1.6); }                                   // a bun
  else if (hairStyle === 3) { lock(0.2, 0, 0.45, -1.02); const tail = part(new THREE.ConeGeometry(R * 0.2, R * 0.9, 8), hairMat, 0, hy - R * 0.05, -R * 1.12, false); tail.rotation.x = Math.PI - 0.25; locks.push(tail); lock(0.1, 0, 0.42, -0.98, 2, 0.7, 1.4).material = mat(0xe8563f); } // a ponytail with a red band
  else if (hairStyle === 4) for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; lock(0.27, Math.cos(a) * 0.82, 0.55 + Math.sin(k * 2.1) * 0.08, Math.sin(a) * 0.82 - 0.05); } // curls
  else { lock(0.3, 0.3, 0.72, 0.6, 1.2, 0.6, 0.8); lock(0.22, -0.25, 0.78, 0.62, 1.3, 0.55, 0.8); }                                      // a side-swept crop
  const nose = part(new THREE.SphereGeometry(R * 0.1, 10, 8), mat(new THREE.Color(skinColor).multiplyScalar(0.93)), 0, hy - R * 0.09, R * 0.99, false); nose.scale.set(1, 0.8, 0.9);
  const smile = part(new THREE.TorusGeometry(R * 0.2, R * 0.035, 6, 10, Math.PI), dark, 0, hy - R * 0.3, R * 0.9, false); smile.rotation.z = Math.PI;
  const cheekMat = mat(new THREE.Color(skinColor).lerp(new THREE.Color(0xf28d85), 0.4));
  const cheekGeo = new THREE.SphereGeometry(R * 0.15, 8, 8);
  const cheekL = part(cheekGeo, cheekMat, -R * 0.58, hy - R * 0.2, R * 0.77, false), cheekR = part(cheekGeo, cheekMat, R * 0.58, hy - R * 0.2, R * 0.77, false);
  cheekL.scale.z = cheekR.scale.z = 0.35;
  neck.add(head, hair, earL, earR, earInL, earInR, lashL, lashR, nose, cheekL, cheekR, ...locks);
  // The brows and the curve of the mouth each ride their own little bone, so a face can change.
  const onBone = (m) => { const b = new THREE.Bone(); b.position.copy(m.position); m.position.set(0, 0, 0); b.add(m); neck.add(b); return b; };
  const browBoneL = onBone(browL), browBoneR = onBone(browR), smileBone = onBone(smile);
  const browY = browBoneL.position.y, smileY = smileBone.position.y, smileZ = smileBone.position.z;
  neck.add(eyeRig, mouth);

  // Arms: a flared short sleeve, an upper arm, then a forearm ending in a mitten hand.
  function arm(side) {
    const shoulder = new THREE.Bone(); shoulder.position.set(side * P.shX, P.shY, 0);
    const elbow = new THREE.Bone(); elbow.position.y = -P.upper;
    const hand = part(new THREE.SphereGeometry(0.048 * P.limb, 10, 8), skin, 0, -P.fore - 0.022, 0, false); hand.scale.set(0.9, 1.1, 0.8);
    // A hand with a thumb and a hint of curled fingers; a turned cuff on the sleeve; a patrol badge on one arm.
    const thumb = part(new THREE.SphereGeometry(0.02 * P.limb, 8, 6), skin, -side * 0.012, -P.fore - 0.012, 0.04 * P.limb, false); thumb.scale.set(0.8, 1.3, 0.9);
    const fingers = part(new THREE.SphereGeometry(0.034 * P.limb, 8, 6), skin, 0, -P.fore - 0.05, 0.008, false); fingers.scale.set(0.95, 0.75, 0.7);
    elbow.add(hand, thumb, fingers);
    if (side === 1) { const badge = part(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 10), mat(0xf2c94c), side * 0.058 * P.limb, -0.012, 0, false); badge.rotation.z = Math.PI / 2; shoulder.add(badge, part(new THREE.SphereGeometry(0.009, 6, 6), mat(0x3f8f5a), side * 0.063 * P.limb, -0.012, 0, false)); }
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
    const hip = new THREE.Bone(); hip.position.set(side * P.hipX, -0.04, 0);
    const knee = new THREE.Bone(); knee.position.y = -P.thigh;
    // The foot turns at the ankle, so the sole can stay flat on the ground through a stride.
    const foot = new THREE.Bone(); foot.position.y = -P.shin + 0.02;
    const sole = part(shoeGeo, mat(0xb98a5e), 0, -0.03 * P.limb, 0.035, false); sole.scale.set(1.05, 0.42, 1.03);
    const toe = part(new THREE.SphereGeometry(0.05 * P.limb, 10, 8), mat(0xffffff), 0, -0.012 * P.limb, 0.105 * P.limb, false); toe.scale.set(1.05, 0.7, 0.8);
    const lace = part(new THREE.BoxGeometry(0.05 * P.limb, 0.008, 0.05 * P.limb), mat(0xe8563f), 0, 0.03 * P.limb, 0.04 * P.limb, false); lace.rotation.x = 0.35;
    foot.add(part(shoeGeo, shoe, 0, 0, 0.035), sole, toe, lace);
    knee.add(foot); hip.add(knee); pelvis.add(hip);
    return { hip, knee, foot };
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
  // The backpack hangs from its straps on a bone of its own, so it can jog and swing a little behind the back.
  const pack = new THREE.Bone(); pack.position.set(0, P.neckY * 0.86, -P.chest * 0.8); torso.add(pack);
  if (backpackColor !== null) {
    const bz = -P.chest * 0.88 - 0.05 + P.chest * 0.8, w = P.chest * 1.38;
    pack.add(part(new THREE.BoxGeometry(w, P.neckY * 0.8, 0.13), mat(backpackColor), 0, P.neckY * (0.52 - 0.86), bz), part(new THREE.BoxGeometry(w * 1.04, 0.08, 0.14), mat(0xf4e3b5), 0, P.neckY * (0.82 - 0.86), bz - 0.005, false));
  }
  if (coat !== null) { // a long coat over the uniform
    const c = part(new THREE.CylinderGeometry(P.chest * 1.06, P.belly * 1.22, P.neckY + 0.2, 14), mat(coat), 0, (P.neckY + 0.2) / 2 - 0.2, 0); c.scale.z = 0.9;
    torso.add(c, part(new THREE.BoxGeometry(0.014, P.neckY * 0.9, 0.014), mat(0xd8d2c4), 0, P.neckY * 0.4, P.belly * 0.97, false));
  }
  // Something carried in both arms: a supply crate.
  let load = null;
  if (carry !== null) { load = part(new THREE.BoxGeometry(0.34, 0.24, 0.24), mat(carry), 0, P.neckY * 0.45, P.belly + 0.13); load.userData.keep = true; torso.add(load); }
  // A torch for the right hand, shown only while it is switched on.
  const torchProp = new THREE.Group(); torchProp.position.set(0, -P.fore + 0.01, 0.012); torchProp.rotation.x = Math.PI; torchProp.visible = false; torchProp.userData.keep = true; // lies along the forearm, lens leading
  { const barrel = part(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 10), mat(0x3a3f47), 0, 0.035, 0, false), headT = part(new THREE.CylinderGeometry(0.036, 0.024, 0.05, 12), mat(0x8a9099), 0, 0.12, 0, false);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.006, 12), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false })); lens.position.y = 0.147;
    torchProp.add(barrel, headT, lens); armR.elbow.add(torchProp); }

  // ---- The skin
  const bones = [inner, pelvis, torso, neck, armL.shoulder, armL.elbow, armR.shoulder, armR.elbow, legL.hip, legL.knee, legL.foot, legR.hip, legR.knee, legR.foot, eyeRig, pupils, mouth, browBoneL, browBoneR, smileBone, pack];
  const bi = (b) => bones.indexOf(b);
  group.updateMatrixWorld(true);
  const groupInverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const geos = [];
  const collect = (node, index) => { for (const c of [...node.children]) { if (c.userData.keep || c.isBone) continue; if (c.isMesh) { geos.push(rigid(c, index, groupInverse)); node.remove(c); } else collect(c, index); } };
  bones.forEach((b, i) => collect(b, i));
  {
    const L = P.limb, cShirt = bodyColor, cSkin = skinColor, cShorts = shortsColor, cShade = new THREE.Color(bodyColor).multiplyScalar(0.82);
    // Trunk: the seat of the shorts, a waist at the belt, a ribcage that fills out under the arms, shoulders
    // that slope off to the arms, collarbones under a flatter upper chest, then a slim neck. Hips and chest share the waist.
    const top = bodyH + 0.02, barrel = (f) => P.belly + (P.chest - P.belly) * f, tr = [];
    const T = (y, rx, col, rz = rx * 0.88) => tr.push({ y: PELVIS_Y + y, rx, rz, col, w: smooth((y + 0.02) / 0.09) });
    const dome = 0.42, cy = top + P.chest * dome * Math.sin(1.19), collar = Math.max(0.052, P.chest * Math.cos(1.19));
    T(cy + 0.045, 0.047, cSkin, 0.047); T(cy + 0.016, 0.044, cSkin, 0.043);
    T(cy, collar, cSkin, collar * 0.95); T(cy, collar, cShirt, collar * 0.95);
    T(top + P.chest * dome * Math.sin(0.87), P.chest * Math.cos(0.87) * 1.04, cShirt, P.chest * Math.cos(0.87) * 0.8);
    T(top + P.chest * dome * Math.sin(0.56), P.chest * Math.cos(0.56) * 1.02, cShirt, P.chest * Math.cos(0.56) * 0.82);
    T(top + P.chest * dome * Math.sin(0.27), P.chest * Math.cos(0.27), cShirt, P.chest * Math.cos(0.27) * 0.86);
    T(0.02 + bodyH, P.chest, cShirt, P.chest * 0.87); T(0.02 + bodyH * 0.72, P.chest * 1.01, cShirt, P.chest * 0.9);
    T(0.02 + bodyH * 0.45, barrel(0.55), cShirt, barrel(0.55) * 0.92); T(0.02 + bodyH * 0.2, barrel(0.15), cShirt, barrel(0.15) * 0.93);
    T(0.035, P.belly * 1.01, cShirt, P.belly * 0.9); T(0.035, P.belly * 1.01, cShorts, P.belly * 0.9);
    T(-0.005, P.hips * 0.99, cShorts, P.hips * 0.86); T(-0.07, P.hips * 1.03, cShorts, P.hips * 0.86);
    geos.push(tube(0, 0, tr, bi(pelvis), bi(torso), { seg: 18, capBottom: true }));
    // Arms: a short flared sleeve with a turned cuff, then one skin from shoulder to wrist, shared at the elbow.
    for (const [A, side] of [[armL, -1], [armR, 1]]) {
      const U = P.upper, F = P.fore, b = Math.min(0.03, U * 0.3), sl = Math.min(0.055, U * 0.5), y0 = PELVIS_Y + P.shY, r = [];
      const R = (y, rad, col) => r.push({ y: y0 + y, rx: rad * L, col, w: smooth((-y - (U - b)) / (2 * b)) });
      R(0.045, 0.03, cShirt); R(0.03, 0.05, cShirt); R(0, 0.062, cShirt); R(-sl + 0.008, 0.07, cShirt);
      R(-sl + 0.008, 0.071, cShade); R(-sl - 0.006, 0.071, cShade); R(-sl - 0.006, 0.046, cSkin);
      if (-(sl + (U - sl) * 0.5) > -U + b + 0.008) R(-(sl + (U - sl) * 0.5), 0.047, cSkin);
      R(-U + b, 0.042, cSkin); R(-U + b / 2, 0.043, cSkin); R(-U, 0.045, cSkin); R(-U - b / 2, 0.043, cSkin); R(-U - b, 0.042, cSkin);
      R(-U - F * 0.3, 0.042, cSkin); R(-U - F * 0.7, 0.036, cSkin); R(-U - F, 0.03, cSkin);
      geos.push(tube(side * P.shX, 0, r, bi(A.shoulder), bi(A.elbow), { capTop: true, capBottom: true }));
    }
    // Legs: the leg of the shorts, a thigh, a knee that bends in a curve, a calf, and a sock with two bands.
    for (const [G, side] of [[legL, -1], [legR, 1]]) {
      const Th = P.thigh, S = P.shin, Ls = Math.min(0.1, Th * 0.75), b = Math.min(0.035, Th * 0.3), y0 = PELVIS_Y - 0.04, r = [];
      const R = (y, rad, col) => r.push({ y: y0 + y, rx: rad * L, col, w: smooth((-y - (Th - b)) / (2 * b)) });
      // Linear blending pinches a bent joint by about cos(angle / 2), so the rings at the knee are a little fuller.
      R(0.02, 0.074, cShorts); R(0.02 - Ls, 0.082, cShorts); R(0.02 - Ls, 0.064, cSkin);
      R(-(Ls + (Th - b - Ls) * 0.5), 0.059, cSkin);
      R(-Th + b, 0.053, cSkin); R(-Th + b / 2, 0.055, cSkin); R(-Th, 0.057, cSkin); R(-Th - b / 2, 0.054, cSkin); R(-Th - b, 0.05, cSkin);
      R(-Th - S * 0.32, 0.055, cSkin); R(-Th - S * 0.62, 0.047, cSkin); R(-Th - S + 0.079, 0.041, cSkin);
      R(-Th - S + 0.078, 0.048, 0x3f8f5a); R(-Th - S + 0.066, 0.048, 0x3f8f5a); R(-Th - S + 0.066, 0.046, 0xfafafa); R(-Th - S + 0.058, 0.046, 0xfafafa);
      R(-Th - S + 0.058, 0.048, 0xe8563f); R(-Th - S + 0.05, 0.048, 0xe8563f); R(-Th - S + 0.05, 0.046, 0xfafafa); R(-Th - S + 0.012, 0.046, 0xfafafa);
      geos.push(tube(side * P.hipX, 0, r, bi(G.hip), bi(G.knee), { capBottom: true }));
    }
  }
  const body = new THREE.SkinnedMesh(mergeGeometries(geos), BODY);
  body.castShadow = true;
  // Wide enough for any pose, lying down included, so the body is never wrongly left out of the picture.
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, TALL / 2, 0), TALL * 1.3 + 0.3);
  group.add(body); body.bind(new THREE.Skeleton(bones));
  group.scale.setScalar(scale);
  let lod = 0, isFar = false;

  let lastElapsed = null, footLift = 0;
  // ---- Gait. A stride is two steps: `phase` runs 0..1 through one, the first leg touching down at 0
  // and the other at 0.5. Lengths are in the figure's own units (before `scale`).
  const TH = P.thigh, SH = P.shin - 0.02, LL = TH + SH;                    // thigh, shin to the ankle, the whole leg
  const ANK = 0.051 * P.limb, HEEL = 0.075 * P.limb, TOE = 0.145 * P.limb; // ankle above the sole; heel and toe either side
  const legK = (LL * scale) / KID_LEG, sqK = Math.sqrt(legK);              // this person's legs against a scout's
  const HANG_DROP = P === KID ? 0.31 - KID.pelvisY : 0;                    // keeps the hands on the flying-fox bar
  let phase = Math.random(), spd = 0, lastSpd = 0, acc = 0, gait = 0, run = 0, effort = 0, bank = 0, locoLegs = 1, locoArms = 1;
  let wasAir = false, jump = null, landRun = false, lastPy = null, pyVel = 0, pyAcc = 0;
  const legs = [{ u: 0, stance: true, s: 0, w: 0, z: 0, y: ANK, sg: 0, kL: 0.99, lift: 0 }, { u: 0.5, stance: true, s: 0, w: 0, z: 0, y: ANK, sg: 0, kL: 0.99, lift: 0 }];
  const edgeA = { z: 0, y: 0, sg: 0 }, edgeB = { z: 0, y: 0, sg: 0 };
  // Arms, head nod and backpack carry on a moment after the body moves: small damped springs [value, velocity].
  const spring = { shL: [0, 0], shR: [0, 0], elL: [-0.15, 0], elR: [-0.15, 0], nod: [0, 0], pack: [0, 0], bob: [0, 0] };
  const pull = (sp, target, w, z, dt, force = 0) => {
    if (dt > 0.06 || dt <= 0) { if (dt > 0.06) { sp[0] = target; sp[1] = 0; } return sp[0]; }
    sp[1] += (-(w * w) * (sp[0] - target) - 2 * z * w * sp[1] + force) * dt; sp[0] += sp[1] * dt; return sp[0];
  };
  // Cadence (steps a second) and step length from speed, the way children move: steps get much longer as
  // they speed up while the legs turn over only a little faster. A leg can only sweep so far under the
  // body, so past a brisk walk the only way to go faster is a moment in the air between steps: running.
  function gaitOf(v) {
    const vk = v / sqK; // the same pace on a scout's legs (dynamic similarity: speed goes with the root of leg length)
    const cPref = vk < 0.6 ? 2.2 + (vk / 0.6) * 0.5 : vk < 1.35 ? 2.7 + ((vk - 0.6) / 0.75) * 0.4 : vk < 2.3 ? 3.1 + ((vk - 1.35) / 0.95) * 0.2 : 3.3 + Math.min(1, (vk - 2.3) / 1.7) * 0.15;
    const Dw = 0.6 - 0.06 * smooth(vk / 1.35);           // share of a stride each foot is down when walking
    const Cw = 0.44, Cr = 0.47;                           // the longest footprint a scout's leg sweeps walking, running (m)
    const needD = vk > 0.01 ? (Cw * cPref) / (2 * vk) : 1; // what walking would need at the preferred cadence
    const r = smooth((0.52 - needD) / 0.16);              // 0 walking .. 1 running
    const cK = lerp(Math.max(cPref, (vk * 2 * Dw) / Cw), cPref, r);
    const Sk = vk / cK;
    const D = lerp(Dw, Math.min(0.45, Cr / (2 * Math.max(Sk, 1e-4))), r);
    return { r, vk, c: cK / sqK, S: Sk * legK, D };
  }
  // Where an ankle is while its foot is down, from the hip's spot on the ground: the foot stays put on the
  // ground (no skating) and rolls from the heel, flat, onto the toes.
  function stanceAt(s, C, heel, toe, out) {
    const zf = C / 2 - s * C, sg = s < 0.2 ? -heel * (1 - s / 0.2) ** 2 : s > 0.5 ? toe * ((s - 0.5) / 0.5) ** 2 : 0;
    const c = Math.cos(sg), sn = Math.sin(sg);
    if (sg < 0) { out.z = zf - HEEL + ANK * sn + HEEL * c; out.y = ANK * c - HEEL * sn; } // pivoting on the heel
    else { out.z = zf + TOE + ANK * sn - TOE * c; out.y = ANK * c + TOE * sn; }         // flat, or pivoting on the toes
    out.sg = sg; return out;
  }
  // Two-bone leg: the thigh and knee angles that put the ankle at (dz forward, dy up) from the hip.
  const ik = { th: 0, kn: 0 };
  function legIK(dz, dy) {
    const d = clamp(Math.hypot(dz, dy), Math.abs(TH - SH) + 1e-3, LL * 0.9995);
    ik.kn = Math.PI - Math.acos(clamp((TH * TH + SH * SH - d * d) / (2 * TH * SH), -1, 1));
    ik.th = -(Math.atan2(dz, -dy) + Math.acos(clamp((TH * TH + d * d - SH * SH) / (2 * TH * d), -1, 1)));
    return ik;
  }
  // The underside of a shoe, in the shin's own frame: heel, middle and toe.
  const soleY = -0.051 * P.limb, SOLE = [[-0.075, 0.004], [0.035, 0], [0.145, 0.004]].map(([z, dy]) => new THREE.Vector3(0, soleY + dy, z * P.limb));
  // The little signs of life: blinking, where the eyes are looking, the mouth, noticing someone come close.
  // Turning: how fast the body is coming round, so it can lean into the bend. Fidgets: what someone with nothing to do gets up to.
  let lastYaw = null, turn = 0, fidgetIn = 3 + Math.random() * 9, fidget = null;
  const face = [0, 0, 0.75, 1]; // eased toward whichever face fits the moment
  let blinkIn = 1 + Math.random() * 4, blink = 0, gaze = 0, gazeUp = 0, headLook = 0, mouthOpen = 0, hello = 0, wasNear = false;
  const seed = Math.random() * 10, slot = Math.floor(Math.random() * 3);
  // Current joint angles, eased toward their targets every frame so no pose ever snaps.
  const pose = { thL: 0, thR: 0, knL: 0, knR: 0, shLx: 0, shRx: 0, shLz: -0.15, shRz: 0.15, elL: -0.15, elR: -0.15, spreadL: 0, spreadR: 0, py: 0, lean: 0, hy: 0, hp: 0, trunk: 0, fL: 0, fR: 0 };

  return {
    group,
    // How far to lower the figure so it sits on the ground, or on a seat of a given height.
    sitDrop: (PELVIS_Y - 0.15) * scale,
    seatLift: (top) => top + 0.07 - PELVIS_Y * scale,
    setCarry(on) { if (load) load.visible = on; },
    setTorch(on) { torchProp.visible = on; },
    // How far one step carries this person at a speed (m), so footfall sounds keep time with the feet.
    stepLength: (v) => gaitOf(v).S,
    // speed (m/s) drives the stride. opts: sitting, sitGround, wobble 0..1, air (-1 falling .. 1 rising,
    // only while airborne), land 0..1 (just landed), roll, pitch, reach 0..1, wave 0..1,
    // pose: 'clap' | 'jacks' | 'salute' | 'stir' | 'eat' | 'hammer'.
    animate(speed, elapsed, o = {}) {
      // People a long way off only need a fresh pose every third frame.
      const d2v = (group.position.x - viewer.x) ** 2 + (group.position.z - viewer.z) ** 2, far = d2v > 38 * 38;
      const want = d2v > 45 * 45 ? 2 : d2v > 26 * 26 ? 1 : 0;
      // Far enough, and holding still (or so far it no longer matters): keep the last pose.
      const still = speed < 0.05 && (!o.pose || o.pose === 'sleep') && !o.gesture && o.air === undefined && !o.wave && !o.reach && !o.land;
      const d = Math.sqrt(d2v);
      isFar = !self && lastElapsed !== null && (d > FAR_ANY || (still && d > (isFar ? FAR_OUT : FAR_IN)));
      if (want !== lod) { lod = want; body.castShadow = lod === 0; }
      if (isFar && (frameCount + slot) % 30 !== 0) return;
      if (far && (frameCount + slot) % 3 !== 0) return;
      const dt = lastElapsed === null ? 0 : clamp(elapsed - lastElapsed, 0, isFar ? 1 : 0.1); // far-off people move in big, rare steps
      lastElapsed = elapsed;
      // Standing about with nothing to do, people fidget: look round, stretch, scratch, tap a foot, yawn when it is late.
      if (!self && !far) {
        const idle = speed < 0.05 && !o.pose && !o.gesture && !o.sitting && !o.sitGround && o.air === undefined;
        if (fidget) { fidget.t += dt; if (fidget.t >= fidget.dur || !idle) fidget = null; }
        else if (idle) {
          fidgetIn -= dt;
          if (fidgetIn <= 0) {
            fidgetIn = 5 + Math.random() * 12;
            const pick = sleepy > 0.5 && Math.random() < 0.5 ? ['yawn', 2.2] : [['lookabout', 2.4], ['stretch', 2.0], ['scratch', 1.6], ['tapfoot', 2.2], ['lookabout', 2.0]][Math.floor(Math.random() * 5)];
            fidget = { name: pick[0], t: 0, dur: pick[1] };
          }
        }
        if (fidget) o = { ...o, gesture: { name: fidget.name, u: fidget.t / fidget.dur } };
      }
      // How sharply the body is turning, eased, so it leans into bends and the head leads the way round.
      const yaw = group.rotation.y;
      if (lastYaw !== null && dt > 0) { let dy = yaw - lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); turn += (clamp(dy / dt, -4, 4) - turn) * (1 - Math.exp(-dt * 6)); }
      lastYaw = yaw;
      const ease = (k) => 1 - Math.exp(-dt * k);
      const inAir = o.air !== undefined;
      // ---- Speed, speeding up or slowing down
      spd += (speed - spd) * ease(14);
      if (dt > 0) acc += (clamp((spd - lastSpd) / dt, -25, 25) - acc) * ease(10);
      lastSpd = spd;
      const G = gaitOf(spd);
      gait = smooth(spd / (0.45 * sqK));                 // 0 standing .. 1 striding out
      run += (G.r - run) * ease(10);
      effort = clamp((spd / sqK - 2.6) / 1.3, 0, 1);      // puffing: only a real run
      // Leaving the ground: from a run it is one foot, the swinging leg leading; from standing, both feet.
      if (inAir && !wasAir) {
        const [a, b] = legs, lead = a.stance && !b.stance ? 1 : b.stance && !a.stance ? 0 : !a.stance && !b.stance ? (a.w > b.w ? 0 : 1) : a.z > b.z ? 0 : 1;
        jump = { run: G.vk > 1.4, lead };
      }
      // Back down: a running jump lands on its lead foot straight into the next stride.
      if (!inAir && wasAir) { landRun = !!(jump && jump.run); if (landRun) phase = jump.lead === 0 ? 0 : 0.5; jump = null; }
      wasAir = inAir;
      if (!inAir) phase = (phase + dt * G.c * 0.5) % 1;
      const Tst = 2 / G.c, D = G.D, C = (2 * D * G.S) / scale; // a stride's time; the footprint each foot sweeps (own units)
      const heelUp = lerp(0.3, 0.02, run), toeOff = lerp(0.6, 0.75, run);
      // Leaning: a little into a run, more while speeding up, back while braking (tan(lean) ~ a / g, kept gentle).
      const accLean = inAir ? 0 : clamp(acc * 0.012, -0.13, 0.15);
      bank += (clamp(-Math.atan((spd * turn) / 9.8) * 0.85, -0.32, 0.32) - bank) * ease(8); // into a bend, like a cyclist
      const crouch = o.crouch || 0, land = o.land || 0;

      // ---- Where each foot is: down on the ground, or swinging through
      for (let i = 0; i < 2; i++) {
        const L = legs[i];
        L.u = (phase + i * 0.5) % 1; L.stance = L.u < D; L.lift = 0;
        if (L.stance) {
          L.s = L.u / D; stanceAt(L.s, C, heelUp, toeOff, L);
          const give = Math.sin(Math.PI * L.s);
          L.kL = lerp(0.99 - 0.035 * give, 0.97 - 0.1 * give, run); // the knee gives a little mid-stance, more at a run
        } else {
          const w = (L.u - D) / (1 - D); L.w = w;
          stanceAt(1, C, heelUp, toeOff, edgeA); stanceAt(0, C, heelUp, toeOff, edgeB);
          // Walking, the foot skims through; running, the heel kicks up behind and the knee drives through high.
          const e = lerp(smooth(w), smooth(Math.pow(w, 1.35)), run);
          L.lift = gait * lerp(0.17 * LL * Math.pow(Math.sin(Math.PI * w), 1.3), LL * (0.3 + 0.3 * smooth((G.vk - 2) / 1.9)) * Math.sin(Math.PI * Math.pow(w, 0.7)), run);
          L.z = lerp(edgeA.z, edgeB.z, e); L.y = lerp(edgeA.y, edgeB.y, w) + L.lift;
          L.sg = lerp(edgeA.sg, edgeB.sg, smooth(w)) + run * 0.35 * Math.sin(Math.PI * w);
        }
      }
      // ---- The hips ride over the planted leg like an upturned pendulum: highest straight over the foot,
      // lowest with both feet down. At a run the knee gives on landing, then there is a little flight.
      const hOver = (L, kL = L.kL) => Math.sqrt(Math.max(0, (kL * LL) ** 2 - L.z * L.z)) + L.y;
      let h, clear = 0;
      if (legs[0].stance || legs[1].stance) h = Math.min(legs[0].stance ? hOver(legs[0]) : 9, legs[1].stance ? hOver(legs[1]) : 9);
      else {
        const A = legs[0].w < legs[1].w ? legs[0] : legs[1], kE = lerp(0.99, 0.97, run);
        const tf = Math.max(1e-3, (0.5 - D) * Tst), tt = clamp((A.u - D) * Tst, 0, tf);
        const h0 = hOver(stanceAt(1, C, heelUp, toeOff, edgeA), kE), h1 = hOver(stanceAt(0, C, heelUp, toeOff, edgeB), kE);
        clear = 0.5 * (9 / scale) * tt * (tf - tt); // a ballistic hop between the steps
        h = lerp(h0, h1, tt / tf) + clear;
        legs[0].y += clear; legs[1].y += clear;
      }
      h += -crouch * 0.36 * LL - land * (landRun ? 0.1 : 0.3) * LL + Math.sin(elapsed * 1.8 + seed) * 0.004 * (1 - gait);
      const lean = 0.012 + run * 0.06 * smooth(G.vk / 3.9) + accLean + crouch * 0.06 + land * 0.04;
      const t = { ...pose };
      t.hy = 0; t.hp = 0; t.lean = lean;
      t.trunk = 0.03 + run * 0.09 + accLean * 0.6 + crouch * 0.3 + land * (landRun ? 0.08 : 0.22);
      // ---- Legs: solve each one so its ankle lands exactly there, in the body's leaned frame.
      const cl = Math.cos(lean), sl = Math.sin(lean), yHip = h / cl;
      t.py = yHip + 0.04 - PELVIS_Y;
      for (let i = 0; i < 2; i++) {
        const L = legs[i], yg = L.y - h;
        legIK(L.z * cl - yg * sl, yg * cl + L.z * sl);
        if (i === 0) { t.thL = ik.th; t.knL = ik.kn; t.fL = L.sg - lean - ik.th - ik.kn; } else { t.thR = ik.th; t.knR = ik.kn; t.fR = L.sg - lean - ik.th - ik.kn; }
      }
      t.spreadL = run * 0.05; t.spreadR = -run * 0.05; // a running child's feet land nearer the midline
      // ---- Arms: pendulums from the shoulders, driven by the opposite leg through the twist of the trunk.
      // Nearly straight and loose at a walk; bent to about a right angle and pumping at a run.
      const amp = lerp(0.8, 0.6, run) * gait, off = lerp(0.04, -0.12, run) * gait - (lean + t.trunk) * 0.5 + clamp(acc * 0.025, -0.45, 0.3);
      t.shLx = clamp((t.thR + lean) * amp, -0.75, 0.6) + off; t.shRx = clamp((t.thL + lean) * amp, -0.75, 0.6) + off;
      const fw = (x) => clamp(-(x - off) / 0.8, 0, 1);
      t.elL = -(0.15 * (1 - gait) + lerp(0.22, 1.45, run) * gait + fw(t.shLx) * 0.32 * gait);
      t.elR = -(0.15 * (1 - gait) + lerp(0.22, 1.45, run) * gait + fw(t.shRx) * 0.32 * gait);
      t.shLz = -(0.12 + 0.07 * run); t.shRz = 0.12 + 0.07 * run;
      // Winding up for a jump: arms swing back. Landing from a standing jump: arms out for balance.
      t.shLx += crouch * 0.9; t.shRx += crouch * 0.9; t.elL -= crouch * 0.25; t.elR -= crouch * 0.25;
      const armsOut = landRun ? 0 : land;
      t.shLz -= armsOut * 0.55; t.shRz += armsOut * 0.55; t.shLx -= armsOut * 0.45; t.shRx -= armsOut * 0.45;
      let snap = 14; // how quickly joints chase their targets
      let legsIK = !o.sitting && !o.sitGround && !inAir;

      // ---- In the air
      if (inAir) {
        const a = clamp(o.air, -1, 1), up = Math.max(0, a), down = Math.max(0, -a), top = 1 - up - down;
        const m3 = (u0, t0, d0) => u0 * up + t0 * top + d0 * down;
        if (jump && jump.run) {
          // A leap off one foot: lead knee driven forward, the other leg trailing long behind, the opposite
          // arm reaching forward; the trailing leg folds up through the top and the lead leg reaches to land.
          const thLead = m3(-1.05, -1.15, -0.62), knLead = m3(1.3, 0.95, 0.3), thTrail = m3(0.42, 0.15, -0.1), knTrail = m3(0.35, 1.0, 1.2);
          const fwdArm = m3(-1.2, -1.0, -0.75), backArm = m3(0.65, 0.4, 0.15);
          if (jump.lead === 0) { t.thL = thLead; t.knL = knLead; t.thR = thTrail; t.knR = knTrail; t.shRx = fwdArm; t.shLx = backArm; }
          else { t.thR = thLead; t.knR = knLead; t.thL = thTrail; t.knL = knTrail; t.shLx = fwdArm; t.shRx = backArm; }
          t.elL = t.elR = -m3(1.15, 1.0, 0.7); t.shLz = -0.28; t.shRz = 0.28;
          t.lean = m3(0.16, 0.1, 0.03); t.trunk = m3(0.12, 0.05, 0.0);
          t.fL = t.fR = m3(0.55, 0.4, 0.05);
        } else {
          // From standing: pushed off long with arms flung high, tucked at the top, legs reaching down and
          // arms spreading out for balance on the way to the ground.
          t.thL = t.thR = m3(-0.12, -1.05, -0.42); t.knL = t.knR = m3(0.18, 1.65, 0.5);
          t.shLx = t.shRx = m3(-2.5, -1.3, -0.5); t.elL = t.elR = m3(-0.25, -0.65, -0.3);
          t.shLz = -m3(0.2, 0.45, 1.05); t.shRz = m3(0.2, 0.45, 1.05);
          t.lean = m3(0.0, 0.1, 0.04); t.trunk = m3(-0.06, 0.25, 0.06);
          t.fL = t.fR = m3(0.65, 0.4, 0.1);
        }
        t.spreadL = t.spreadR = 0; t.py = 0; snap = 16;
      }
      if (o.sitting || o.sitGround) {
        t.thL = t.thR = -1.5; t.knL = t.knR = o.sitGround ? 1.9 : 1.35;
        t.spreadL = o.sitGround ? -0.5 : 0; t.spreadR = o.sitGround ? 0.5 : 0;
        t.shLx = t.shRx = -0.35; t.elL = t.elR = -0.5; t.shLz = -0.15; t.shRz = 0.15; t.py = 0; t.lean = 0; t.trunk = 0.05;
      }

      // ---- Activities
      const e = elapsed + seed;
      if (LEG_POSES.has(o.pose)) { legsIK = false; t.trunk = 0; }
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
        t.thL = -0.75 + Math.sin(e * 3) * 0.12; t.thR = -0.55 - Math.sin(e * 3) * 0.12; t.knL = 1.2; t.knR = 0.9; t.py = HANG_DROP; t.lean = -0.12 + Math.sin(e * 2.2) * 0.06;
      } else if (o.pose === 'binoculars') {
        t.shLx = t.shRx = -1.5; t.elL = t.elR = -2.0; t.shLz = 0.3; t.shRz = -0.3; t.lean = -0.04;
      } else if (o.pose === 'write') {
        t.shRx = -0.9; t.elR = -1.2 + Math.sin(e * 7) * 0.08; t.shRz = -0.25 + Math.sin(e * 5) * 0.06; t.shLx = -0.7; t.elL = -1.1; t.lean = 0.2;
      } else if (o.pose === 'hammer') {
        const hit = Math.sin(e * 4.2);
        t.thL = t.thR = -1.0; t.knL = t.knR = 1.75; t.py = -0.48 * LEG; t.lean = 0.38;
        t.shRx = -1.0 + hit * 0.5; t.elR = -0.9 - hit * 0.3; t.shLx = -0.8; t.elL = -0.7;
      }
      // Holding a torch out in front, the beam swinging a little with each step.
      if (o.hold === 'torch' && !o.pose && !o.sitting) { t.shRx = -0.95 - (t.lean + t.trunk) * 0.6 + Math.sin(phase * Math.PI * 4) * 0.05 * gait; t.elR = -0.62 - t.lean; t.shRz = 0.06; }
      // ---- Gestures layered on top
      // ---- One-off gestures layered on top: a different one for each kind of thing you do
      if (o.gesture) {
        if (LEG_GESTURES.has(o.gesture.name)) legsIK = false;
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

      // Feet not placed by the legs' own solving: the sole stays level while the leg swings under it, and
      // the toes drop when the knee lifts.
      const lying = o.pose === 'sleep';
      if (!legsIK && !inAir) {
        const footOf = (th, kn) => lying ? 0.2 : o.pose === 'hang' ? 0.45 : clamp(-(th + kn + t.lean) * 0.92 + Math.max(0, kn - 0.35) * 0.4, -0.9, 1.1);
        t.fL = footOf(t.thL, t.knL); t.fR = footOf(t.thR, t.knR);
      }
      // Walking and running legs go exactly where they were solved (an eased copy would skate), and so do
      // arms swinging free, since their own springs smooth them. Everything else eases toward its target.
      const armsFree = !o.pose && !o.gesture && !o.sitting && !o.sitGround;
      locoLegs += ((legsIK ? 1 : 0) - locoLegs) * ease(10);
      locoArms += ((armsFree || inAir ? 1 : 0) - locoArms) * ease(10);
      const k = ease(snap), kl = Math.max(k, locoLegs), ka = Math.max(k, locoArms);
      for (const key in pose) pose[key] += (t[key] - pose[key]) * (LEG_KEYS.has(key) ? kl : ARM_KEYS.has(key) ? ka : k);

      // Hips: they turn with the legs (the forward leg's hip comes forward), dip on the side of the swinging
      // leg and shift over the planted foot at a walk; the shoulders turn against them.
      const reach = (L) => (C > 1e-3 ? clamp(L.z / (C * 0.5 + 0.02), -1.2, 1.2) : 0);
      const lift = (L) => (L.stance ? 0 : Math.sin(Math.PI * L.w));
      const walkW = gait * locoLegs * (inAir ? 0 : 1);
      const yawP = walkW * lerp(0.1, 0.13, run) * (reach(legs[0]) - reach(legs[1])) * 0.5;
      const rollP = walkW * (1 - run) * 0.045 * (lift(legs[0]) - lift(legs[1]));
      legL.hip.rotation.set(pose.thL, 0, pose.spreadL - rollP); legR.hip.rotation.set(pose.thR, 0, pose.spreadR - rollP);
      legL.knee.rotation.x = pose.knL; legR.knee.rotation.x = pose.knR;
      legL.foot.rotation.x = pose.fL; legR.foot.rotation.x = pose.fR;

      // ---- Signs of life
      // Blinking: every few seconds, quick. Eyes shut when asleep or mid-yawn.
      blinkIn -= dt;
      if (blinkIn <= 0) { blink = 1; blinkIn = 1.8 + Math.random() * 4.5; if (Math.random() < 0.2) blinkIn = 0.25; }
      blink = Math.max(0, blink - dt / 0.13);
      const gname = o.gesture ? o.gesture.name : '';
      const shut = lying || gname === 'yawn' || gname === 'laugh' ? 1 : Math.sin(Math.min(1, blink) * Math.PI);
      // The face for this moment: asked for outright, or read from what the body is doing.
      const mood = o.mood || GESTURE_FACE[gname] || POSE_FACE[o.pose] || (hello > 0 ? 'happy' : effort > 0.6 ? 'effort' : sleepy > 0.6 && !self ? 'sleepy' : 'neutral');
      const F = FACES[mood] || FACES.neutral, fk = ease(mood === 'surprised' ? 18 : 7);
      for (let i = 0; i < 4; i++) face[i] += (F[i] - face[i]) * fk;
      const lop = mood === 'puzzled' ? 0.07 : 0; // one brow higher than the other
      browBoneL.position.y = browY + (face[0] + lop) * R; browBoneR.position.y = browY + (face[0] - lop) * R;
      browBoneL.rotation.z = face[1]; browBoneR.rotation.z = -face[1];
      // The mouth's curve flattens out and turns over into a frown.
      const curve = face[2];
      smileBone.rotation.z = curve < 0 ? Math.PI : 0; smileBone.position.y = smileY - (curve < 0 ? R * 0.2 * -curve : 0); smileBone.position.z = smileZ + (curve < 0 ? R * 0.07 : 0); // a frown sits lower, clear of the cheeks
      smileBone.scale.set(0.85 + 0.15 * Math.min(1, Math.abs(curve)), Math.max(0.12, Math.abs(curve)), 1);
      eyeRig.scale.y = (1 - 0.9 * shut) * face[3];
      // Looking: at whatever you are about to use, or (for everyone else) at you when you come close.
      let wantYaw = 0, near = false;
      const tx = o.look ? o.look.x : self ? null : scout.x, tz = o.look ? o.look.z : self ? null : scout.z;
      if (tx !== null && !lying) {
        const dx = tx - group.position.x, dz = tz - group.position.z, d2 = dx * dx + dz * dz;
        if (d2 < (o.look ? 64 : 20) && d2 > 0.04) {
          let rel = Math.atan2(dx, dz) - group.rotation.y; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
          if (Math.abs(rel) < 2.0) { wantYaw = clamp(rel, -1.15, 1.15); near = d2 < 9; }
        }
      }
      headLook += (wantYaw * 0.72 - headLook) * ease(5);
      gaze += (clamp(wantYaw - headLook, -0.6, 0.6) - gaze) * ease(9);
      // Eyes also drift about a little on their own.
      const wander = Math.sin(e * 0.9) * Math.sin(e * 0.37 + 2) * 0.25 * (wantYaw ? 0.2 : 1);
      pupils.position.x = (gaze + wander) * R * 0.075; pupils.position.y = (gazeUp + Math.sin(e * 0.53 + 1) * 0.12) * R * 0.03;
      // Noticing someone arrive: a quick "oh, hello".
      if (near && !wasNear && !self) hello = 0.7;
      wasNear = near; hello = Math.max(0, hello - dt);
      // The mouth: chewing, singing, talking, laughing, yawning, puffing.
      let mo = 0;
      if (gname === 'eat' || o.pose === 'eat') mo = 0.25 + 0.3 * Math.abs(Math.sin(e * 9));
      else if (gname === 'yawn') mo = 1; else if (gname === 'laugh' || gname === 'cheer') mo = 0.75; else if (gname === 'blow') mo = 0.35;
      else if (gname === 'pant' || gname === 'stumble' || gname === 'bonk') mo = 0.55;
      else if (o.pose === 'clap') mo = 0.3 + 0.5 * Math.abs(Math.sin(e * 3.2));
      else if (o.pose === 'command' || o.pose === 'explain') mo = 0.15 + 0.45 * Math.abs(Math.sin(e * 6.5) * Math.sin(e * 1.9));
      else if (o.pose === 'jacks' || o.pose === 'tug') mo = 0.3;
      else if (hello > 0) mo = 0.6 * Math.sin((hello / 0.7) * Math.PI);
      else if (mood === 'surprised') mo = 0.55; else if (mood === 'joy') mo = 0.5;
      else if (effort > 0.5) mo = 0.22;
      mouthOpen += (mo - mouthOpen) * ease(16);
      mouth.scale.y = 0.1 + 0.9 * mouthOpen; mouth.scale.x = 1 - 0.25 * (gname === 'blow' ? 1 : 0) + 0.1 * mouthOpen;
      // Breathing lifts the chest; faster after a run. Standing still, the weight shifts from foot to foot.
      const breath = Math.sin(e * (1.5 + effort * 2.5)) * (0.012 + effort * 0.012);
      torso.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 1.2);
      pelvis.rotation.z = Math.sin(e * 0.55) * 0.035 * (1 - gait) * (o.pose || o.sitting || o.sitGround ? 0 : 1) + rollP;
      pelvis.position.x = walkW * (1 - run) * 0.012 * (lift(legs[0]) - lift(legs[1])); // weight over the planted foot
      pelvis.position.y = PELVIS_Y + pose.py;
      pelvis.rotation.y = yawP;
      torso.rotation.set(pose.trunk, -yawP * 1.8 + clamp(turn * 0.08, -0.25, 0.25) * gait, -rollP * 1.1);
      // How hard the hips are being lifted and dropped: it jolts the head, the arms and the backpack.
      if (lastPy !== null && dt > 0 && dt < 0.06) { const v = (pose.py - lastPy) / dt; pyAcc += (clamp((v - pyVel) / dt, -40, 40) - pyAcc) * ease(25); pyVel = v; }
      lastPy = pose.py;
      // Arms: damped springs toward their pose, loose while swinging free, firm when doing something.
      const loose = locoArms * Math.max(gait, inAir ? 0.6 : 0);
      const wS = lerp(24, 12, loose), zS = lerp(0.8, 0.45, loose), wE = lerp(26, 15, loose);
      armL.shoulder.rotation.set(pull(spring.shL, pose.shLx, wS, zS, dt), 0, pose.shLz);
      armR.shoulder.rotation.set(pull(spring.shR, pose.shRx, wS, zS, dt), 0, pose.shRz);
      armL.elbow.rotation.x = Math.min(0, pull(spring.elL, pose.elL, wE, 0.55, dt, pyAcc * 0.25 * loose));
      armR.elbow.rotation.x = Math.min(0, pull(spring.elR, pose.elR, wE, 0.55, dt, pyAcc * 0.25 * loose));
      // The backpack jogs on its straps and swings out a touch when the body is jolted.
      pack.position.y = P.neckY * 0.86 + pull(spring.bob, 0, 20, 0.35, dt, -pyAcc * 0.4) * 0.5;
      pack.rotation.x = clamp(pull(spring.pack, clamp(-acc * 0.006, -0.05, 0.12), 11, 0.4, dt, Math.max(0, -pyAcc) * 0.5), 0, 0.3);

      const w = o.wobble || 0;
      inner.rotation.x = pose.lean + (o.pitch || 0);
      inner.rotation.z = (o.roll || 0) + bank * (inAir ? 0.4 : 1) + Math.sin(elapsed * 26) * 0.28 * w;
      const stretch = inAir ? Math.abs(o.air) * 0.035 : 0, sq = land * (landRun ? 0.03 : 0.07);
      inner.scale.set(1 + sq * 0.6 - stretch * 0.5, 1 - sq + stretch - w * 0.06 + Math.sin(elapsed * 1.8 + seed) * 0.006, 1 + sq * 0.6 - stretch * 0.5);
      // The head steadies itself: it stays near level whatever the body does, nods a moment late when the
      // hips are jolted, and turns into a bend before the body does.
      const nod = pull(spring.nod, 0, 13, 0.45, dt, pyAcc * 1.2);
      neck.rotation.x = -pose.lean * 0.6 - pose.trunk * 0.85 + pose.hp + nod;
      neck.rotation.y = Math.sin(e * 0.45) * 0.28 * (1 - gait) * (o.pose ? 0.3 : 1) * (headLook ? 0.15 : 1) + pose.hy + headLook + clamp(turn * 0.28, -0.55, 0.55) * Math.max(gait, 0.4) + yawP * 0.8;
      neck.rotation.z = -inner.rotation.z * 0.6 + rollP * 0.6;
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
          for (const L of [legL, legR]) for (const pt of SOLE) { solePoint.copy(pt).applyMatrix4(L.foot.matrixWorld); pen = Math.max(pen, groundUnder(solePoint.x, solePoint.z) - (o.sink || 0) - solePoint.y); }
          // Up at once (a foot must never be inside a step); down a touch more gently.
          const want = clamp(pen + clear * scale, -0.12, 0.7); // in a running hop the feet are meant to be off the ground
          footLift = want > footLift || dt <= 0 ? want : footLift + (want - footLift) * ease(30);
        } else if (!groundUnder || o.sitting || o.sitGround || o.air !== undefined || o.pose === 'hang') footLift += (0 - footLift) * ease(20);
        inner.position.set(0, footLift / scale, 0);
      }
    },
  };
}
