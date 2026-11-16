import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRAVITY } from '../config.js';

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
// A smooth curve through a few keys (w rising 0..1), with no allocation: cubic Hermite, Catmull-Rom slopes.
function keyed(W, V, w) {
  const n = W.length; let i = 0;
  while (i < n - 2 && w > W[i + 1]) i++;
  const w0 = W[i], w1 = W[i + 1], d = w1 - w0, x = clamp((w - w0) / d, 0, 1);
  const m0 = (i > 0 ? (V[i + 1] - V[i - 1]) / (W[i + 1] - W[i - 1]) : (V[1] - V[0]) / (W[1] - W[0])) * d;
  const m1 = (i < n - 2 ? (V[i + 2] - V[i]) / (W[i + 2] - W[i]) : (V[n - 1] - V[n - 2]) / (W[n - 1] - W[n - 2])) * d;
  const x2 = x * x, x3 = x2 * x;
  return (2 * x3 - 3 * x2 + 1) * V[i] + (x3 - 2 * x2 + x) * m0 + (-2 * x3 + 3 * x2) * V[i + 1] + (x3 - x2) * m1;
}
// A running leg's swing, in joint angles from toe-off (w 0) to touchdown (w 1). Thigh forward of the
// body's line (rad): it trails a moment longer, then drives through to about 50 degrees and settles back a
// little to land. Knee bend: the heel kicks up behind to about 105 degrees, then the lower leg reaches out.
// Foot: pointed after push-off, relaxing to level for the landing. The ends are filled in each frame.
const RUN_TH_W = [0, 0.15, 0.44, 0.78, 0.92, 1], RUN_TH_B = [0, 0, 0.05, 0.88, 0.76, 0], RUN_TH = new Float64Array(6);
const RUN_KN_W = [0, 0.16, 0.44, 0.7, 0.9, 1], RUN_KN_B = [0, 0.62, 1.84, 1.62, 0.7, 0], RUN_KN = new Float64Array(6);
const RUN_FT_W = [0, 0.2, 0.45, 0.66, 0.84, 1], RUN_FT = new Float64Array([0, 0.6, 0.95, 0.3, -0.1, 0]);
// A walking leg, by joint angles over its stride, shaped like measured human walking. Stance (s 0..1, heel
// strike to toe-off): the knee lands nearly straight (3 degrees), stays so while both feet are down, gives
// about 12 degrees as the weight comes fully on, straightens to about 3 by late stance and is still nearly straight when the other heel lands (s 0.83),
// so both legs are straight in the double support (the inverted V); it starts to bend only as the toes leave.
const WK_S_W = [0, 0.12, 0.3, 0.46, 0.62, 0.83, 0.93, 1], WK_S_KN = [0.05, 0.07, 0.21, 0.12, 0.05, 0.05, 0.09, 0.26];
// Swing (w 0..1, toe-off to heel strike): the knee folds to its peak (about 60 degrees) a third of the way
// through, then reaches out straight again before the heel comes down. The thigh swings through, flexes a
// little past its landing angle and settles back onto it. The foot leaves pointed and lands toes up.
// Values are filled in each frame from the toe-off and heel-strike poses.
const WK_TH_W = [0, 0.25, 0.5, 0.78, 1], WK_TH = new Float64Array(5);
const WK_KN_W = [0, 0.3, 0.5, 0.75, 0.9, 1], WK_KN = new Float64Array(6);
const WK_FT_W = [0, 0.3, 0.65, 1], WK_FT = new Float64Array(4);

// (x, z) is the camera, for judging detail; (px, pz) is the scout, the one people look at.
const scout = { x: 0, z: 0 };
export function setViewer(x, z, px = x, pz = z) { viewer.x = x; viewer.z = z; scout.x = px; scout.z = pz; frameCount++; }
// How sleepy the whole camp is (0 by day, 1 late at night), so faces can show it.
let sleepy = 0;
export function setSleepy(v) { sleepy = v; }
// Past these distances a person holding still, and then anyone at all, keeps the last pose.
const FAR_IN = 46, FAR_OUT = 42, FAR_ANY = 70;

// A rounded box swept up through rings [y, half width, half depth] (a superellipse, so soft corners), closed top and bottom.
function roundLoft(rings, seg = 16) {
  const pos = [], idx = [], e = 0.5; // |sin|^e: squarer than an ellipse
  const sq = (v) => Math.sign(v) * Math.abs(v) ** e;
  for (const [y, a, b] of rings) for (let k = 0; k < seg; k++) { const t = (k / seg) * Math.PI * 2; pos.push(a * sq(Math.sin(t)), y, b * sq(Math.cos(t))); }
  const n = rings.length; pos.push(0, rings[0][0], 0, 0, rings[n - 1][0], 0);
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const p0 = i * seg + k, q0 = i * seg + (k + 1) % seg; idx.push(p0, q0, p0 + seg, q0, q0 + seg, p0 + seg); }
  for (let k = 0; k < seg; k++) { idx.push(n * seg, (k + 1) % seg, k); idx.push(n * seg + 1, (n - 1) * seg + k, (n - 1) * seg + (k + 1) % seg); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const f = g.toNonIndexed(); f.computeVertexNormals(); return f;
}
function part(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = shadow;
  return m;
}

// Two builds. Scouts are small with a big head (about 1.15 m to the crown, legs about 0.4 m, a bit over a third of
// that, a child's long-ish trunk); staff are taller and slimmer. `belly` is the waist at the belt,
// `hips` the seat of the shorts, `chest` the ribcage under the arms.
const KID = { thigh: 0.21, shin: 0.21, pelvisY: 0.47, neckY: 0.3, headR: 0.2, headY: 0.18, shX: 0.172, shY: 0.232, upper: 0.126, fore: 0.116, hipX: 0.072, chest: 0.15, belly: 0.136, hips: 0.146, limb: 1 };
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
  } else if (kind === 'cap') { // a baseball cap: a low crown sitting clear of the hair, a short bill, a button on top
    // The crown stays a good few millimetres outside the hair everywhere (never nearly touching it, which
    // would flicker), and its rim sits above the brows so the face is not hidden.
    const dome = part(new THREE.SphereGeometry(R * 1.1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.scale.y = 0.72;
    const bill = part(new THREE.CylinderGeometry(R * 0.72, R * 0.72, 0.016, 14, 1, false, -Math.PI / 2, Math.PI), m, 0, 0.004, R * 0.82); bill.scale.x = 1.12; bill.rotation.x = 0.16;
    g.add(dome, bill, part(new THREE.SphereGeometry(R * 0.09, 8, 6), m, 0, R * 0.79, 0, false));
    g.position.y = headC + R * 0.38;
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
  // A child's small scout day pack (about three quarters of a grown-up one): a rounded body, a little narrower
  // at the top, its front resting on the back between the shoulder blades; a domed lighter flap over the top
  // that hangs down the outside with a buckle, a front pocket, side pockets and a grab loop. Its padded straps
  // are part of the skin (built with the trunk below), so they stay on the body however it moves.
  const PACK = { zc: -0.045, top: P.neckY * (0.84 - 0.86), H: 0.186, flap: 0xcdbb88, strap: 0x4b5130, buckle: 0x2e2c26 };
  if (backpackColor !== null) {
    const { zc, top, H } = PACK, yb = top - H, body = mat(backpackColor), flapM = mat(PACK.flap), dk = mat(new THREE.Color(backpackColor).multiplyScalar(0.82));
    pack.add(part(roundLoft([[0, 0.054, 0.03], [0.01, 0.073, 0.045], [0.03, 0.08, 0.05], [0.11, 0.077, 0.05], [0.158, 0.069, 0.047], [0.176, 0.06, 0.04], [H, 0.04, 0.025]]), body, 0, yb, zc));
    const dome = part(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), flapM, 0, top - 0.024, zc - 0.002, false); dome.scale.set(0.071, 0.034, 0.055); pack.add(dome);
    pack.add(part(roundLoft([[0, 0.056, 0.006], [0.012, 0.066, 0.007], [0.072, 0.07, 0.008]]), flapM, 0, top - 0.088, zc - 0.051, false)); // the flap's front, over the outside
    pack.add(part(new THREE.BoxGeometry(0.02, 0.022, 0.008), mat(PACK.buckle), 0, top - 0.088, zc - 0.059, false)); // buckle
    pack.add(part(new THREE.BoxGeometry(0.012, 0.045, 0.004), mat(PACK.strap), 0, top - 0.11, zc - 0.052, false)); // the buckle's strap down to the pocket
    pack.add(part(roundLoft([[0, 0.04, 0.008], [0.008, 0.05, 0.014], [0.055, 0.052, 0.015], [0.062, 0.046, 0.011]]), dk, 0, yb + 0.022, zc - 0.05, false)); // front pocket
    for (const sx of [-1, 1]) { const sp = part(new THREE.SphereGeometry(1, 10, 8), dk, sx * 0.077, yb + 0.062, zc + 0.002, false); sp.scale.set(0.017, 0.045, 0.032); pack.add(sp); } // side pockets
    pack.add(part(new THREE.TorusGeometry(0.014, 0.0042, 5, 10, Math.PI), mat(PACK.strap), 0, top + 0.004, zc + 0.03, false)); // grab loop
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

  // The pack's shoulder straps, as skin: from the bottom corners of the pack round the sides of the ribs, up the
  // front of the chest (over the pockets), over the shoulders inside the sleeves and down the back into the top
  // of the pack, following the shirt's own shape. They ride the trunk, and blend onto the pack bone where they
  // go into it, so the pack can bounce on them without a gap. A thin chest strap with a buckle joins them.
  function packStraps(tr) {
    const half = (x, y) => { // how far the shirt reaches forward (and back) at x across and y up (torso frame)
      for (let i = 0; i < tr.length - 1; i++) {
        const ya = tr[i].y - PELVIS_Y, yb = tr[i + 1].y - PELVIS_Y;
        if (y <= ya && y >= yb) { const f = ya - yb < 1e-6 ? 0 : (ya - y) / (ya - yb), rx = lerp(tr[i].rx, tr[i + 1].rx, f), rz = lerp(tr[i].rz, tr[i + 1].rz, f); return Math.abs(x) >= rx ? 0 : rz * Math.sqrt(1 - (x / rx) ** 2); }
      }
      return 0;
    };
    const ringXZ = (y) => { for (let i = 0; i < tr.length - 1; i++) { const ya = tr[i].y - PELVIS_Y, yb = tr[i + 1].y - PELVIS_Y; if (y <= ya && y >= yb) { const f = ya - yb < 1e-6 ? 0 : (ya - y) / (ya - yb); return [lerp(tr[i].rx, tr[i + 1].rx, f), lerp(tr[i].rz, tr[i + 1].rz, f)]; } } return [0.1, 0.1]; };
    const out = [], packY = P.neckY * 0.86, packZ = -P.chest * 0.8, tS = bi(torso), tP = bi(pack);
    const ribbon = (pts, col) => { // pts: { p: [x, y, z], n: unit normal out, w: width, th: thickness, o: gap off the shirt }
      const pos = [], c = new THREE.Color(col), V = THREE.Vector3, cs = [];
      for (let i = 0; i < pts.length; i++) {
        const A = pts[Math.max(0, i - 1)].p, B = pts[Math.min(pts.length - 1, i + 1)].p, q = pts[i];
        const t = new V(B[0] - A[0], B[1] - A[1], B[2] - A[2]).normalize(), n = new V(...q.n), sd = new V().crossVectors(t, n).normalize();
        const at = (o, w) => new V(...q.p).addScaledVector(n, o).addScaledVector(sd, w);
        cs.push([at(q.o, -q.w / 2), at(q.o, q.w / 2), at(q.o + q.th, q.w / 2), at(q.o + q.th, -q.w / 2), q.wp]);
      }
      const si = [], sw = [], put = (v, wp) => { pos.push(v.x, v.y + PELVIS_Y, v.z); si.push(tS, tP, 0, 0); sw.push(1 - wp, wp, 0, 0); };
      for (let i = 0; i < cs.length - 1; i++) for (let f = 0; f < 4; f++) {
        const a0 = cs[i][f], a1 = cs[i][(f + 1) % 4], b0 = cs[i + 1][f], b1 = cs[i + 1][(f + 1) % 4], wa = cs[i][4], wb = cs[i + 1][4];
        put(a0, wa); put(b0, wb); put(a1, wa); put(a1, wa); put(b0, wb); put(b1, wb);
      }
      const g = new THREE.BufferGeometry(), n = pos.length / 3, col3 = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col3[i * 3] = c.r; col3[i * 3 + 1] = c.g; col3[i * 3 + 2] = c.b; }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      g.setAttribute('color', new THREE.BufferAttribute(col3, 3));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      return g;
    };
    // How much of a strap point is held by the pack: where it goes into it, low on the back.
    const onPack = (y, z) => smooth((-z - 0.1) / 0.03) * smooth((0.27 - y) / 0.02);
    // Over the pockets on the chest the padding stands a little proud of the shirt.
    const gap = (y, nz) => 0.003 + 0.011 * smooth((nz - 0.3) / 0.3) * smooth((y - 0.1) / 0.03) * smooth((0.26 - y) / 0.03);
    for (const sx of [-1, 1]) {
      const pts = [];
      // Low: from the pack's bottom corner, round the side of the ribs to the front.
      const yL = packY - 0.17, xs = 0.07, [rx, rz] = ringXZ(yL), thB = Math.PI - Math.asin(Math.min(0.99, xs / rx)), thF = Math.asin(Math.min(0.99, xs / rx));
      for (let k = 0; k <= 8; k++) {
        const th = lerp(thB, thF, k / 8), x = sx * rx * Math.sin(th), z = rz * Math.cos(th), y = yL + 0.004 * k / 8;
        const n = new THREE.Vector3(x / (rx * rx), 0, z / (rz * rz)).normalize();
        pts.push({ p: [x, y, z], n: n.toArray(), w: 0.016, th: 0.0035, o: 0.003, wp: onPack(y, z) });
      }
      // High: up the front, over the shoulder and down the back into the top of the pack (a slice front to back,
      // found by marching out from inside the chest to the shirt).
      const y0 = 0.19, f0 = Math.atan2(0.13, -(y0 - (yL + 0.004))), f1 = Math.atan2(-0.13, packY - 0.02 - y0);
      for (let k = 1; k <= 22; k++) {
        const f = lerp(f0, f1, k / 22), x = sx * lerp(0.072, 0.045, smooth(k / 22)), dy = Math.cos(f), dz = Math.sin(f);
        let r = 0.01; while (r < 0.3 && Math.abs(r * dz) < half(x, y0 + r * dy)) r += 0.0015;
        const y = y0 + r * dy, z = r * dz, pad = smooth(Math.min(k / 4, (22 - k) / 3, 1));
        pts.push({ p: [x, y, z], n: [0, dy, dz], w: lerp(0.016, 0.026, pad), th: lerp(0.0035, 0.008, pad), o: gap(y, dz), wp: onPack(y, z) });
      }
      out.push(ribbon(pts, PACK.strap));
    }
    // The chest strap: taut across between the two, just proud of the buttons, with a buckle in the middle.
    const yC = 0.2, zC = half(0, yC) + 0.016, chest = [];
    for (let k = 0; k <= 4; k++) { const x = lerp(-0.074, 0.074, k / 4); chest.push({ p: [x, yC, Math.max(zC, half(x, yC) + 0.014)], n: [0, 0, 1], w: 0.009, th: 0.003, o: 0, wp: 0 }); }
    out.push(ribbon(chest, PACK.strap));
    const bk = ribbon([{ p: [-0.011, yC, zC + 0.002], n: [0, 0, 1], w: 0.016, th: 0.005, o: 0, wp: 0 }, { p: [0.011, yC, zC + 0.002], n: [0, 0, 1], w: 0.016, th: 0.005, o: 0, wp: 0 }], PACK.buckle);
    out.push(bk);
    void packZ;
    return out;
  }
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
    if (backpackColor !== null) geos.push(...packStraps(tr));
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
  let phase = Math.random(), spd = 0, lastSpd = 0, acc = 0, gait = 0, run = 0, effort = 0, locoLegs = 1, locoArms = 1;
  let steps = 0, bounce = 0, fly = 0, hurry = 1, gD = null; // footfalls so far; the running bounce of the hips (own units); the stride catching up with the body
  // The walking hips follow the planted leg's height; where one leg hands over to the next (a corner in that
  // height) they round it off through a critically damped follower that keeps up with its slope: hT0 the
  // last height, hTd its rate, hErr and hErrV how far the hips are from it [value, rate] (never above it).
  let hT0 = null, hTd = 0, hErr = 0, hErrV = 0;
  const H_W = 85;
  let wasAir = false, jump = null, landRun = false, lastPy = null, pyVel = 0, pyAcc = 0;
  // The body's own level over uneven ground (world m, eased so steps and slopes never jolt it) and the
  // little correction that keeps the soles on the ground, eased too: both critically damped [value, velocity].
  let bodyY = null, springY = null, bodyV = 0, liftV = 0;
  const BODY_W = 10, LIFT_W = 22;
  // A critically damped spring's exact step toward T over dt (stable for any dt): leaves the value in cdX, the rate in cdV.
  let cdX = 0, cdV = 0;
  function critStep(x, v, T, w, dt) { const e = x - T, a = v + w * e, f = Math.exp(-w * dt); cdX = T + (e + a * dt) * f; cdV = (v - w * a * dt) * f; }
  // g: the ground under the foot (world m), g0: where it last pushed off, gO: g against the body's level (own units)
  const legs = [{ u: 0, stance: true, s: 0, w: 0, z: 0, y: ANK, sg: 0, kL: 0.99, lift: 0, zf: 0, g: 0, g0: 0, gO: 0, gd: 0, kAdd: 0, fAdd: 0, tAdd: 0, fresh: false, ax: 0, az: 0, ayaw: 0, anc: false, held: false, stepping: false }, { u: 0.5, stance: true, s: 0, w: 0, z: 0, y: ANK, sg: 0, kL: 0.99, lift: 0, zf: 0, g: 0, g0: 0, gO: 0, gd: 0, kAdd: 0, fAdd: 0, tAdd: 0, fresh: false, ax: 0, az: 0, ayaw: 0, anc: false, held: false, stepping: false }];
  // A planted walking foot stays where it landed on the ground (ax, az: the world spot of its flat foot), so it
  // never slides when the body speeds up, slows down or stops. ayaw: which way the body faced then.
  // (A leaning body carries its hips, and so the feet as placed, hzL further forward: the last frame's.)
  let fwdX = 0, fwdZ = 1, hzL = 0;
  const anchorAt = (L, zf) => { L.ax = group.position.x + fwdX * (zf + hzL) * scale; L.az = group.position.z + fwdZ * (zf + hzL) * scale; L.ayaw = group.rotation.y; L.anc = true; };
  const anchorRel = (L) => ((L.ax - group.position.x) * fwdX + (L.az - group.position.z) * fwdZ) / scale - hzL;
  // Stopping: one foot at a time steps in under the hips (stLeg, how far through the step stX, from the ankle
  // at stZ0, stY0 with the foot tipped stSg0), until both stand side by side.
  let stLeg = -1, stX = 0, stZ0 = 0, stY0 = 0, stSg0 = 0;
  const ST_T = 0.28;
  // Does this foot need to step in: in the air, not under the hips, or planted before the body turned on the spot?
  const settleOff = (L, yaw) => (!L.held && !L.stance) || Math.abs(anchorRel(L)) > 0.012 / scale || Math.abs(Math.atan2(Math.sin(yaw - L.ayaw), Math.cos(yaw - L.ayaw))) > 0.3;
  // The ground at a spot given in the body's own frame (x across, z forward, in metres), with no allocation.
  let gX = 0, gZ = 0, gCos = 1, gSin = 0, gSink = 0;
  const groundLocal = (lx, lz) => groundUnder(gX + lx * gCos + lz * gSin, gZ - lx * gSin + lz * gCos) - gSink;
  const edgeT = { z: 0, y: 0, sg: 0, zf: 0 }, edgeA = { z: 0, y: 0, sg: 0, zf: 0 }, edgeB = { z: 0, y: 0, sg: 0, zf: 0 };
  // Arms, head nod and backpack carry on a moment after the body moves: small damped springs [value, velocity].
  const PACK_W = 26, PACK_K = 0.2, PACK_S = 2.5; // the backpack on its straps: how tightly it follows the hops, how far it lifts, how far it swings out
  const spring = { shL: [0, 0], shR: [0, 0], elL: [-0.15, 0], elR: [-0.15, 0], nod: [0, 0], pack: [0, 0], bob: [0, 0], flap: [0, 0], headB: [0, 0], packY: [0, 0] };
  const pull = (sp, target, w, z, dt, force = 0) => {
    if (dt > 0.06 || dt <= 0) { if (dt > 0.06) { sp[0] = target; sp[1] = 0; } return sp[0]; }
    // In steps of at most 0.01 s, so it is stable however long the frame (w * step stays well under 1).
    const n = Math.ceil(dt / 0.01), h = dt / n;
    for (let k = 0; k < n; k++) { sp[1] += (-(w * w) * (sp[0] - target) - 2 * z * w * sp[1] + force) * h; sp[0] += sp[1] * h; }
    return sp[0];
  };
  // Cadence (steps a second) and step length from speed, the way children move: steps get much longer as
  // they speed up while the legs turn over only a little faster. A leg can only sweep so far under the
  // body, so past a brisk walk the only way to go faster is a moment in the air between steps: running.
  // Walking, the step comes from the angles: the leg lands with the thigh about 24 degrees forward and a
  // nearly straight knee, so the footprint each foot sweeps (own units) follows from the leg's length.
  const WK_HU = 0.45, WK_K0 = WK_S_KN[0];                                   // the foot's tilt (toes up) and knee bend at heel strike
  const WK_D0 = -HEEL * (1 - Math.cos(WK_HU)) - ANK * Math.sin(WK_HU);      // the ankle against the flat foot's spot, heel down and toes up
  const WK_A = 0.45;                                                       // the share of the footprint ahead of the hip as the heel lands
  const walkC = (A) => (TH * Math.sin(A) + SH * Math.sin(A - WK_K0) - WK_D0) / WK_A;
  const A_NOM = 0.42, A_MAX = 0.53, C_LO = 1.8, C_HI = 3.0;               // 24 and 30 degrees; a natural cadence band (steps a second on a scout's legs)
  const gaitOut = { r: 0, vk: 0, c: 0, S: 0, D: 0.6, A: 0 }, gaitAsk = { r: 0, vk: 0, c: 0, S: 0, D: 0.6, A: 0 };
  let gDw = 0.6;
  const sOf = (A) => (walkC(A) * scale) / (2 * gDw);                      // a walking step at this angle (m)
  function gaitOf(v, out = gaitOut) {
    const vk = v / sqK; // the same pace on a scout's legs (dynamic similarity: speed goes with the root of leg length)
    // Walking: about 24 degrees each way, the cadence whatever puts the planted foot down without skating
    // (speed over step). Ambling, the steps shorten rather than the legs turning over in slow motion; brisk,
    // the hips swing wider (up to 30 degrees) before the legs turn over faster than about 3 a second.
    // Each foot is down 60% of the stride, so for a tenth of it at each footfall both are (double support).
    // Running (above about 2.2 on a scout's legs): every step has a moment in the air; the blend runs over 2.15 to 2.9.
    const Dw = 0.6 - 0.02 * smooth(vk / 2.0); gDw = Dw;
    let A = A_NOM, want = 0;
    if (v * sqK > C_HI * sOf(A_NOM)) want = (v * sqK) / C_HI;
    else if (v * sqK < C_LO * sOf(A_NOM)) want = (v * sqK) / C_LO;
    if (want > 0) {
      let lo = want > sOf(A_NOM) ? A_NOM : 0, hi = want > sOf(A_NOM) ? A_MAX : A_NOM;
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (sOf(m) < want) lo = m; else hi = m; }
      A = (lo + hi) / 2;
    }
    const cWk = Math.max(C_LO, (v * sqK) / sOf(A));                       // steps a second, on a scout's legs
    const cRun = 3.15 + Math.min(1, (vk - 2.4) / 1.5) * 0.3;
    const Cr = 0.50;                                                      // the longest footprint a scout's leg sweeps running (m)
    const r = smooth((vk - 2.15) / 0.75);                                 // 0 walking .. 1 running
    const cK = lerp(cWk, cRun, r);
    const Sk = vk / cK;
    out.r = r; out.vk = vk; out.c = cK / sqK; out.S = Sk * legK; out.A = A;
    out.D = lerp(Dw, Math.min(0.45, Cr / (2 * Math.max(Sk, 1e-4))), r);
    return out;
  }
  // Where an ankle is while its foot is down, from the hip's spot on the ground: the foot stays put on the
  // ground (no skating) and rolls from the heel, flat, onto the toes.
  // `a` is the share of the footprint ahead of the hip at touchdown (a half walking; less running, where
  // the foot lands a little ahead and pushes off well behind).
  // `r0` is where in the step the heel starts to rise (earlier running).
  function stanceAt(s, C, heel, toe, out, a = 0.5, r0 = 0.5) {
    const zf = C * (a - s), sg = s < 0.2 ? -heel * (1 - s / 0.2) ** 2 : s > r0 ? toe * ((s - r0) / (1 - r0)) ** 2 : 0;
    return rollAt(zf, sg, out);
  }
  // The ankle of a foot whose flat spot is zf, tipped by sg (toes up negative, pivoting on the heel; toes
  // down positive, pivoting on the toes).
  function rollAt(zf, sg, out) {
    const c = Math.cos(sg), sn = Math.sin(sg);
    if (sg < 0) { out.z = zf - HEEL + ANK * sn + HEEL * c; out.y = ANK * c - HEEL * sn; } // pivoting on the heel
    else { out.z = zf + TOE + ANK * sn - TOE * c; out.y = ANK * c + TOE * sn; }         // flat, or pivoting on the toes
    out.sg = sg; out.zf = zf; return out;
  }
  // Two-bone leg: the thigh and knee angles that put the ankle at (dz forward, dy up) from the hip.
  const ik = { th: 0, kn: 0 };
  function legIK(dz, dy) {
    const d = clamp(Math.hypot(dz, dy), Math.abs(TH - SH) + 1e-3, LL * 0.9995);
    ik.kn = Math.PI - Math.acos(clamp((TH * TH + SH * SH - d * d) / (2 * TH * SH), -1, 1));
    ik.th = -(Math.atan2(dz, -dy) + Math.acos(clamp((TH * TH + d * d - SH * SH) / (2 * TH * d), -1, 1)));
    return ik;
  }
  // The lowest point of a shoe (heel or toe) against the ground, for a leg at these angles under hips h high.
  let toeLow = false;
  // `lx` is the hip's side (m) when the ground under the shoe is to be looked up, or null on flat ground.
  function shoeLow(th, kn, f, lean, h, lx) {
    const a2 = th + kn, a3 = a2 + f, cl = Math.cos(lean), sl = Math.sin(lean);
    const ay = -TH * Math.cos(th) - SH * Math.cos(a2), az = -TH * Math.sin(th) - SH * Math.sin(a2);
    let low = Infinity;
    for (let k = 0; k < 3; k++) {
      const sz = k === 2 ? 0.035 * P.limb : k ? TOE : -HEEL, sy = k === 2 ? -ANK : -ANK + 0.004;
      const y = ay + sy * Math.cos(a3) - sz * Math.sin(a3), z = az + sy * Math.sin(a3) + sz * Math.cos(a3);
      let v = h + y * cl - z * sl;
      if (lx !== null) v -= (groundLocal(lx, (h * Math.tan(lean) + y * sl + z * cl) * scale) - bodyY) / scale;
      if (v < low) { low = v; toeLow = k === 1; }
    }
    return low;
  }
  // The hips' height over a foot at (L.z, L.y) with the leg this long (hip to ankle).
  const hOverE = (L, e) => Math.sqrt(Math.max(0, e * e - L.z * L.z)) + L.y;
  // The running bounce while a foot is down, x 0..1 through the step: a smooth dip that leaves and meets
  // the flight at the same speed. stAl, stBe are set each frame from the flight time.
  let stAl = 0, stBe = 0;
  const bStance = (x) => { const u2 = (1 - 2 * x) ** 2; return stAl * (u2 - 1) + stBe * (u2 * u2 - 1); };
  // Hip to ankle with the knee bent so far: landing (soft), pushing off (nearly straight).
  const effAt = (k) => Math.sqrt(TH * TH + SH * SH + 2 * TH * SH * Math.cos(k));
  const E_TD = effAt(0.28), E_TO = effAt(0.12);
  // ---- The walk, by joint angles. The knee is set by the curve above for the stance; the hips ride on the
  // planted leg at whatever height that leaves them (an inverted pendulum over a nearly straight leg), so the
  // body is never pulled down to reach. Standing, the knees are as soft as the idle pose has them.
  const K_IDLE = 0.15; // standing: legs straight but not locked (about 9 degrees)
  const W_R0 = 0.5;                       // from here on in the stance the heel lifts as the leg needs
  let wkGait = 1, wkHu = 0, wkC = 0, wkSH = 0.83, wkSig = 0;   // set each frame
  const wkKnee = (s) => lerp(K_IDLE, keyed(WK_S_W, WK_S_KN, clamp(s, 0, 1)), wkGait);
  // The foot's tilt through the stance as drawn: heel strike to flat (easing in, so the ankle sinking as the
  // toes come down does not drop the hips just after the heel lands), flat, then the heel rising toward the
  // tilt that lets this leg, nearly straight, meet the other one's heel strike (wkSig).
  const W_RB = 0.7; // the heel rocker's shape: 0 eases in, 1 drops the toes fastest at first
  const wkRoll = (s) => s < 0.3 ? -wkHu * lerp(1 - smooth(s / 0.3), (1 - s / 0.3) ** 2, W_RB) : s > W_R0 ? wkSig * ((s - W_R0) / (wkSH - W_R0)) ** 2 : 0;
  const wkP = { z: 0, y: 0, sg: 0, zf: 0 };
  const lowF = (sg) => -ANK * Math.cos(sg) + Math.min(HEEL * Math.sin(sg), -TOE * Math.sin(sg));
  // The hips' height over a planted walking foot at s (own units, flat ground), its hip joint carried dz
  // forward and dy up by the turn and tilt of the hips.
  const wkH = (s, sg, dz, dy, zf = wkC * (WK_A - s)) => { rollAt(zf, sg, wkP); const e = effAt(wkKnee(s)), z = wkP.z - dz; return Math.sqrt(Math.max(0, e * e - z * z)) + wkP.y - dy; };
  // How far a planted foot at zf must tip onto its toes for the leg, its knee bent k, to reach hips hN high
  // with the ground gO under it. Leaves the answer in wkP.
  // (In the body's leaned frame, wkCl and wkSl the lean, and from the hip joint where it is: dz, dy.)
  let wkCl = 1, wkSl = 0;
  const wkFar = (zf, sg, e, hN, gO, dz, dy) => { rollAt(zf, sg, wkP); const yg = wkP.y + gO - hN; return Math.hypot(wkP.z * wkCl - yg * wkSl - dz, yg * wkCl + wkP.z * wkSl - dy) > e; };
  function wkReach(zf, k, hN, gO, dz, dy) {
    const e = effAt(k);
    if (!wkFar(zf, 0, e, hN, gO, dz, dy)) return rollAt(zf, 0, wkP);
    if (wkFar(zf, 1.1, e, hN, gO, dz, dy)) return wkP;
    let lo = 0, hi = 1.1;
    for (let j = 0; j < 14; j++) { const m = (lo + hi) / 2; if (wkFar(zf, m, e, hN, gO, dz, dy)) lo = m; else hi = m; }
    return rollAt(zf, hi, wkP);
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
    stepLength: (v) => gaitOf(v, gaitAsk).S,
    // Footfalls so far (one more each time a foot touches down), so footstep sounds land with the feet.
    get steps() { return steps; },
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
      // The stride only turns over while actually going somewhere: standing, both feet stay planted.
      const going = smooth(spd / 0.18);
      // The share of the stride each foot is down eases between walking and running, so slowing from a run
      // the steps lengthen their contact over a step or two instead of a foot in the middle of a short running
      // contact suddenly finding itself in a long walking one, well behind the hips (which then dropped).
      gD = gD === null || dt <= 0 ? (gD === null ? G.D : gD) : gD + (G.D - gD) * ease(8);
      const Tst = 2 / G.c, D = gD, C = (2 * D * G.S) / scale; // a stride's time; the footprint each foot sweeps (own units)
      // Setting off (or speeding up) the body can get ahead of the planted foot, which stays put on the ground
      // while the stride's clock still has it under the hips: then the stride turns over faster, so the next foot
      // comes down sooner and nearer, instead of the planted leg being left stretched out behind.
      hurry = 1;
      if (!inAir && spd >= 0.04 && fly < 0.999 && C > 1e-3) {
        const A0 = legs[0].stance && legs[0].anc && !legs[0].held, A1 = legs[1].stance && legs[1].anc && !legs[1].held;
        const Ls = A0 && A1 ? (legs[0].s < legs[1].s ? legs[0] : legs[1]) : A0 ? legs[0] : A1 ? legs[1] : null;
        if (Ls) hurry = 1 + clamp((C * (WK_A - Ls.s) - anchorRel(Ls) - 0.015 - (1.5 * spd * dt) / scale) / 0.05, 0, 2) * (1 - fly); // (a frame's travel is no lag)
      }
      if (!inAir && spd >= 0.04) phase = (phase + dt * G.c * 0.5 * going * hurry) % 1; // (stopped: see the settling step below)
      // How much of a real run this is: a moment in the air between steps (none walking, so walking is untouched).
      fly = run * smooth((0.5 - D) / 0.12);
      const heelUp = lerp(WK_HU, 0.3, run) * gait, toeOff = lerp(lerp(0.62, 0.75, run), 0.9, fly) * gait; // no rolling heel-to-toe when standing
      // Leaning: forward into a run, a touch more while speeding up, back a little while braking. Never into bends.
      const accLean = inAir ? 0 : clamp(acc * 0.008, -0.08, 0.08);
      const crouch = o.crouch || 0, land = o.land || 0;
      // Running, the foot comes down only a little ahead of the hip and pushes off well behind it: find the
      // split of the footprint at which the landing leg (knee softly bent) and the pushing-off leg (nearly
      // straight, up on the toes) carry the hips at the same height.
      const r0 = lerp(0.5, 0.3, fly);
      let aR = 0.5;
      if (fly > 0.001 && C > 1e-3) {
        let lo = 0.1, hi = 0.7;
        for (let k = 0; k < 14; k++) {
          const m = (lo + hi) / 2;
          if (hOverE(stanceAt(0, C, heelUp, toeOff, edgeB, m, r0), E_TD) > hOverE(stanceAt(1, C, heelUp, toeOff, edgeA, m, r0), E_TO)) lo = m; else hi = m;
        }
        aR = (lo + hi) / 2;
      }
      const aS = lerp(WK_A, aR, fly);
      // The walk this frame: how much of it there is (the knees soften toward the idle pose when standing), the
      // footprint, and how far the trailing foot is up on its toes when the other heel lands (wkSig: as far as
      // lets that leg, nearly straight, carry the hips at the height the landing leg does, so both are straight).
      const walking = fly < 0.999;
      fwdX = Math.sin(yaw); fwdZ = Math.cos(yaw);
      const legFree = !o.sitting && !o.sitGround && !inAir && !LEG_POSES.has(o.pose) && !(o.gesture && LEG_GESTURES.has(o.gesture.name));
      if (!legFree || lastElapsed === null) { legs[0].anc = legs[1].anc = false; legs[0].held = legs[1].held = false; stLeg = -1; }
      wkGait = gait; wkHu = WK_HU * gait; wkC = C; wkSH = Math.min(1, 0.5 / D); wkSig = 0;
      const sTO = Math.max(0, (D - 0.5) / D); // how far into its stance the leading leg is when the other one's toes leave
      // The hips turn toward the forward leg (see below), most as a heel lands: that carries its hip joint this far forward.
      const walkW = gait * locoLegs * (inAir ? 0 : 1), rA = C > 1e-3 ? 1 / (C * 0.5 + 0.02) : 0, yawK = walkW * lerp(0.11, 0.13, run) * 0.5;
      const dzHS = P.hipX * Math.sin(yawK * (clamp(rollAt(C * WK_A, -wkHu, wkP).z * rA, -1.2, 1.2) - clamp(rollAt(C * (WK_A - wkSH), 0, wkP).z * rA, -1.2, 1.2)));
      const H0 = wkH(0, -wkHu, dzHS, 0);     // the hips over a leg landing on its heel
      wkCl = 1; wkSl = 0;
      if (walking && wkSH > W_R0) wkSig = wkReach(C * (WK_A - wkSH), wkKnee(wkSH), H0, 0, -dzHS, 0).sg;

      // ---- Where each foot is: down on the ground, or swinging through
      for (let i = 0; i < 2; i++) {
        const L = legs[i];
        L.u = (phase + i * 0.5) % 1; L.lift = 0;
        const was = L.stance; L.stance = L.u < D;
        L.fresh = L.stance && !was;
        if (L.fresh && going > 0.5 && !inAir) steps++; // a footfall
        if (L.stance) {
          L.s = L.u / D; stanceAt(L.s, C, heelUp, toeOff, L, aS, r0);
          if (fly < 1) { // walking: on its own spot, with its own roll (late in the stance worked out again below, once the hips are known)
            const zfA = C * (WK_A - L.s);
            if (L.fresh || !L.anc || Math.abs(anchorRel(L) - zfA) > 0.6 * LL) anchorAt(L, zfA);
            rollAt(anchorRel(L), wkRoll(Math.min(L.s, wkSH)), wkP);
            L.z = lerp(wkP.z, L.z, fly); L.y = lerp(wkP.y, L.y, fly); L.sg = lerp(wkP.sg, L.sg, fly); L.zf = lerp(wkP.zf, L.zf, fly);
          }
        } else {
          const w = (L.u - D) / (1 - D); L.w = w;
          stanceAt(1, C, heelUp, toeOff, edgeA, aS, r0); stanceAt(0, C, heelUp, toeOff, edgeB, aS, r0);
          // Walking, the foot skims through. (Running, the swing is set by the joints further down; this path
          // still says where the foot is for the arms and the ground under it.)
          const e = lerp(smooth(Math.min(1, w * 1.18)), smooth(Math.pow(w, 1.35)), run); // walking, the foot reaches forward early and comes down on a straight leg
          L.lift = gait * lerp(0.17 * LL * Math.pow(Math.sin(Math.PI * w), 0.8), LL * (0.3 + 0.3 * smooth((G.vk - 2) / 1.9)) * Math.sin(Math.PI * Math.pow(w, 0.7)), run);
          L.z = lerp(edgeA.z, edgeB.z, e); L.y = lerp(edgeA.y, edgeB.y, w) + L.lift;
          L.sg = lerp(edgeA.sg, edgeB.sg, smooth(w)) + run * 0.35 * Math.sin(Math.PI * w);
        }
      }
      // ---- Stopping. The stride stops turning over where it was, so the feet would be left split (or one in the
      // air). Instead, one at a time, a foot that is not under the hips (or was planted facing another way
      // before turning on the spot) takes a short step in beside the other: lifted a little, set down flat.
      legs[0].stepping = legs[1].stepping = false;
      if (legFree && spd < 0.04 && walking) {
        if (stLeg < 0) {
          const a = settleOff(legs[0], yaw), b = settleOff(legs[1], yaw);
          if (a || b) {
            stLeg = a && b ? (!legs[0].stance && !legs[0].held ? 0 : !legs[1].stance && !legs[1].held ? 1 : Math.abs(anchorRel(legs[0])) >= Math.abs(anchorRel(legs[1])) ? 0 : 1) : a ? 0 : 1;
            // from where that ankle is now (the leg as last drawn)
            const th0 = stLeg === 0 ? pose.thL : pose.thR, kn0 = stLeg === 0 ? pose.knL : pose.knR, f0 = stLeg === 0 ? pose.fL : pose.fR, l0 = pose.lean;
            const az = -TH * Math.sin(th0) - SH * Math.sin(th0 + kn0), ay = -TH * Math.cos(th0) - SH * Math.cos(th0 + kn0);
            const hNow = (pose.py + PELVIS_Y - 0.04) * Math.cos(l0);
            stZ0 = ay * Math.sin(l0) + az * Math.cos(l0); stY0 = ay * Math.cos(l0) - az * Math.sin(l0) + hNow; stSg0 = f0 + l0 + th0 + kn0; stX = 0;
          } else if (!(legs[0].stance && legs[1].stance)) {
            // Both feet down side by side: put the stride just before one foot's toe-off, so setting off is the
            // weight going onto the other foot and this one stepping out (the planted one is not half a step
            // ahead of where the stride thinks it is, which used to leave it stretched out behind).
            phase = D > 0.5 ? D - 0.5 - 0.03 : 0; legs[0].held = legs[1].held = false;
            for (let i = 0; i < 2; i++) { const L = legs[i]; L.u = (phase + i * 0.5) % 1; L.stance = true; L.s = L.u / D; L.fresh = false; }
          }
        }
        for (let i = 0; i < 2; i++) {
          const L = legs[i];
          if (i === stLeg) {
            stX = Math.min(1, stX + dt / ST_T); const x = smooth(stX), xz = smooth((stX - 0.15) / 0.7); // up first, across, then straight down
            L.stance = true; L.stepping = true; L.held = false;
            L.z = lerp(stZ0, 0, xz); L.y = lerp(stY0, ANK, x) + 0.07 * LL * Math.sin(Math.PI * stX); L.sg = lerp(stSg0, 0, x); L.zf = L.z;
            if (stX >= 1) { anchorAt(L, 0); L.held = true; L.stepping = false; L.z = 0; L.y = ANK; L.sg = 0; stLeg = -1; }
          } else if (L.held || (!L.stance && L.anc)) { // standing on its spot, flat
            L.stance = true; L.held = true; rollAt(anchorRel(L), 0, L);
          }
        }
      } else { if (stLeg >= 0) legs[stLeg].stepping = false; stLeg = -1; legs[0].held = legs[1].held = false; }

      // ---- The hips. Walking: they ride on the leg that landed last, at the height its angles put them (the
      // knee from the curve, the foot as it rolls): an inverted pendulum over a nearly straight leg, highest as
      // the hips pass over the foot, lowest as the next heel lands. Never lowered to make a leg reach.
      // Hips: they turn with the legs (the forward leg's hip comes forward) and dip on the side of the swinging
      // leg at a walk. That carries each hip joint a little forward or back and up or down, which the legs
      // below allow for, so a planted foot stays exactly where it is.
      const yawP = yawK * (clamp(legs[0].z * rA, -1.2, 1.2) - clamp(legs[1].z * rA, -1.2, 1.2));
      const lift0 = legs[0].stance ? 0 : Math.sin(Math.PI * legs[0].w), lift1 = legs[1].stance ? 0 : Math.sin(Math.PI * legs[1].w);
      const rollP = walkW * (1 - run) * 0.045 * (lift0 - lift1);
      // Standing, the weight drifts gently from foot to foot (the hips tilt a touch with it).
      const sway = Math.sin((elapsed + seed) * 0.55) * 0.015 * (1 - gait) * (o.pose || o.sitting || o.sitGround ? 0 : 1);
      const yawS = P.hipX * Math.sin(yawP), rollS = P.hipX * Math.sin(rollP + sway); // leg 0's hip joint forward, and down; leg 1's the other way
      const lead = legs[0].u < 0.5 ? legs[0] : legs[1], sLd = Math.min(lead.u / D, wkSH), ld = lead === legs[0] ? 1 : -1;
      // (Between a run and a walk, in a moment off the ground there is no planted leg for the walking hips to
      // ride: they are where a landing heel would put them, not on the leg still trailing in the air.)
      let hT = lead.stance ? wkH(sLd, wkRoll(sLd), ld * yawS, -ld * rollS, lead.anc ? anchorRel(lead) : wkC * (WK_A - sLd)) : H0;
      if (legs[0].held || legs[1].held || stLeg >= 0) { // stopping: on whichever feet are down
        hT = Infinity;
        for (let i = 0; i < 2; i++) { const L = legs[i]; if (L.stepping) continue; const dz = i === 0 ? yawS : -yawS, dy = i === 0 ? -rollS : rollS, e = effAt(wkKnee(L.held ? 0.5 : L.s)), z = L.z - dz; hT = Math.min(hT, Math.sqrt(Math.max(0, e * e - z * z)) + L.y - dy); }
      }
      // The hand-over to the next leg is a corner (falling, then rising): round it off. The follower keeps up
      // with the height's own rate, so it only ever lags at the corner, and then below it (the landing knee
      // gives a few degrees more: the loading response), never above.
      if (hT0 === null || dt <= 0 || dt > 0.06) { hErr = 0; hErrV = 0; hTd = 0; }
      else {
        const td = (hT - hT0) / dt; hErrV += hTd - td; hTd = td;
        critStep(hErr, hErrV, 0, H_W, dt); hErr = cdX; hErrV = cdV;
      }
      hT0 = hT;
      const hW = hT + Math.min(0, hErr);
      let h = hW;
      // Running: a bounce. Off the ground the body flies a true arc under the game's gravity, highest halfway
      // between the steps. On the ground the leg takes the weight like a spring: the hips sink to their lowest
      // halfway through the step (the knee bending to about 40 degrees) and rise again to push off at the
      // speed they landed with, so the height and its rate of change are smooth all the way round.
      // The bounce, as an offset from the hips' height at touchdown and toe-off (hE).
      const gU = (GRAVITY * (1 + 0.5 * fly)) / scale, tc = D * Tst, tf = Math.max(0, (0.5 - D) * Tst), V = (gU * tf) / 2;
      const dip = V * tc * 0.16; stAl = 2 * dip - (V * tc) / 4; stBe = (V * tc) / 4 - dip;
      // hE: as high as it can be with the planted leg still reaching the ground all through the step (landing
      // with the knee a little bent, pushing off nearly straight).
      let hE = Math.min(hOverE(edgeA, E_TO), hOverE(edgeB, E_TD));
      if (fly > 0.001 && C > 1e-3) {
        for (let k = 1; k < 8; k++) { const x = k / 8; hE = Math.min(hE, hOverE(stanceAt(x, C, heelUp, toeOff, edgeA, aS, r0), lerp(E_TD, E_TO, x)) - bStance(x)); }
        stanceAt(1, C, heelUp, toeOff, edgeA, aS, r0);
      }
      bounce = 0;
      if (fly > 0.001 && C > 1e-3) {
        const S0 = legs[0].stance ? legs[0] : legs[1].stance ? legs[1] : null;
        if (S0) bounce = bStance(S0.s);
        else { const A = legs[0].w < legs[1].w ? legs[0] : legs[1], tt = clamp((A.u - D) * Tst, 0, tf); bounce = V * tt - (gU * tt * tt) / 2; }
        bounce *= going * fly;
      }
      h = lerp(h, hE, fly) + bounce;
      const hOff = -crouch * 0.36 * LL - land * (landRun ? 0.1 : 0.3) * LL + Math.sin(elapsed * 1.8 + seed) * 0.001 * (1 - gait);
      h += hOff;
      // ---- The ground under each foot. A planted foot stands on the ground where it is; a swinging one
      // heads from where it pushed off to where it will come down. The body's level follows the lower
      // of them through a critically damped spring, so it rides smoothly up and down steps and slopes
      // while the legs reach for the treads. Running, the foot on the ground (or, in the air, the one about
      // to land) sets the level the body bounces on.
      const lean = 0.012 + run * 0.09 * smooth(G.vk / 3.9) + accLean + crouch * 0.06 + land * 0.04;
      const hz = hW * Math.tan(lean); // the leaned body carries the hips, and so the feet, this far forward
      hzL = hz;
      const planted = groundUnder && !far && !o.sitting && !o.sitGround && !inAir && o.pose !== 'hang' && o.pose !== 'sleep';
      if (planted) {
        gX = group.position.x; gZ = group.position.z; gCos = Math.cos(group.rotation.y); gSin = Math.sin(group.rotation.y); gSink = o.sink || 0;
        if (springY === null) legs[0].g0 = legs[1].g0 = legs[0].gd = legs[1].gd = group.position.y - gSink;
        let target = Infinity, tRun = Infinity;
        for (let i = 0; i < 2; i++) {
          const L = legs[i], lx = (i === 0 ? -P.hipX : P.hipX) * scale;
          const z = (L.z + hz) * scale, heel = groundLocal(lx, z - HEEL * scale), toe = groundLocal(lx, z + TOE * scale);
          if (L.stance) {
            // A sole over a step's edge rests on the higher tread. Running, a foot keeps the ground it landed on
            // until it leaves (its heel and toes rolling over an edge do not change what it stands on).
            // It lands where the body was heading for in the air, so the level never jumps at touchdown.
            if (fly > 0.001) L.g = L.g0 = L.fresh ? Math.max(L.gd, Math.min(heel, toe)) : L.g0;
            else L.g = L.g0 = Math.max(heel, toe);
            target = Math.min(target, L.g); tRun = Math.min(tRun, L.g);
          }
          else {
            // Heading for where it will come down; rising early for a step up; never through the ground it passes over.
            // (Running, the whole sole is looked at: one landing across a step's edge stands on the higher tread.)
            const zd = (edgeB.z + hz) * scale + spd * (1 - L.w) * (1 - D) * Tst, zr = zd + (edgeB.zf - edgeB.z) * scale;
            const down = fly > 0.001 ? Math.max(groundLocal(lx, zr - (HEEL + 0.01) * scale), groundLocal(lx, zr + (TOE + 0.01) * scale)) : groundLocal(lx, zd + 0.03 * scale);
            L.gd = down;
            L.g = Math.max(lerp(L.g0, down, smooth(down > L.g0 ? Math.min(1, L.w * 1.8) : L.w)), heel, toe); target = Math.min(target, down);
          }
        }
        if (tRun === Infinity) tRun = (legs[0].w > legs[1].w ? legs[0] : legs[1]).gd;
        target = lerp(target, tRun, fly);
        if (springY === null || Math.abs(target - springY) > 1.5) { springY = target; bodyV = 0; } // first step, or moved far at once
        else if (dt > 0) { critStep(springY, bodyV, target, BODY_W, dt); springY = cdX; bodyV = cdV; }
        // Running, the level is the ground under the foot that is down; in the air it moves smoothly from
        // the tread pushed off to the one the next foot lands on, so a flight of steps is taken in bounds.
        let runY = springY;
        if (fly > 0) {
          const S1 = legs[0].stance ? legs[0] : legs[1].stance ? legs[1] : null;
          if (S1) runY = S1.g;
          else {
            const A = legs[0].w < legs[1].w ? legs[0] : legs[1], B = A === legs[0] ? legs[1] : legs[0];
            const tf = Math.max(1e-3, (0.5 - D) * Tst);
            runY = lerp(A.g0, B.gd, smooth(clamp(((A.u - D) * Tst) / tf, 0, 1)));
          }
        }
        bodyY = lerp(springY, runY, fly);
        legs[0].gO = (legs[0].g - bodyY) / scale; legs[1].gO = (legs[1].g - bodyY) / scale;
      } else { bodyY = springY = null; bodyV = 0; legs[0].gO = legs[1].gO = 0; }
      const t = { ...pose };
      t.hy = 0; t.hp = 0; t.lean = lean;
      t.trunk = 0.03 + run * 0.09 + accLean * 0.6 + crouch * 0.3 + land * (landRun ? 0.08 : 0.22);
      // ---- Legs: solve each one so its ankle lands exactly there, in the body's leaned frame. A running
      // leg in the air follows the swing curves instead, from exactly where it pushed off to exactly where it
      // will land: the heel kicks up behind, the thigh drives through, the lower leg reaches out.
      const cl = Math.cos(lean), sl = Math.sin(lean), yHip = h / cl;
      t.py = yHip + 0.04 - PELVIS_Y;
      wkCl = cl; wkSl = sl;
      const runSwing = fly > 0.001 && !inAir, hEnd = h - bounce, amp = 0.55 + 0.45 * smooth((G.vk - 1.6) / 2.3);
      // Walking, a swinging leg follows its joint curves from the toe-off pose to the heel-strike pose: the
      // leg landing at its angle with the hips over it, and the leg leaving as the other one is a little way
      // into its stance, up on its toes as far as it needs. (Both on flat ground; the ends are met exactly below.)
      const wkSwing = walking && !inAir && (!legs[0].stance || !legs[1].stance);
      let sgTO = 0;
      if (wkSwing) {
        rollAt(C * WK_A, -wkHu, wkP); let y0 = wkP.y - H0; legIK(wkP.z * cl - y0 * sl - dzHS, y0 * cl + wkP.z * sl);
        const thHS = ik.th, knHS = ik.kn, hTO = wkH(sTO, wkRoll(sTO), dzHS, 0);
        sgTO = wkReach(C * (WK_A - 1), wkKnee(1), hTO, 0, -dzHS, 0).sg; y0 = wkP.y - hTO; legIK(wkP.z * cl - y0 * sl + dzHS, y0 * cl + wkP.z * sl);
        const thTO = ik.th, knTO = ik.kn, dTh = thHS - thTO, wa = clamp(C / walkC(A_MAX), 0, 1), kPk = gait * (0.85 + 0.2 * wa);
        WK_TH[0] = thTO; WK_TH[1] = thTO + 0.45 * dTh; WK_TH[2] = thTO + 0.92 * dTh; WK_TH[3] = thHS - 0.08 * wa; WK_TH[4] = thHS;
        WK_KN[0] = knTO; WK_KN[1] = Math.max(kPk, knTO); WK_KN[2] = Math.max(0.66 * kPk, knHS); WK_KN[3] = knHS + 0.2 * kPk; WK_KN[4] = knHS + 0.03 * gait; WK_KN[5] = knHS;
        WK_FT[0] = sgTO; WK_FT[1] = 0.12 * gait; WK_FT[2] = 0; WK_FT[3] = -wkHu;
      }
      for (let i = 0; i < 2; i++) {
        const L = legs[i], hipDz = i === 0 ? yawS : -yawS, hipDy = i === 0 ? -rollS : rollS;
        // Walking, late in the stance the heel lifts as far as this leg, its knee nearly straight, needs to
        // carry the hips where they are (on the ground under this foot).
        if (L.stance && walking && L.s > W_R0 && !L.held && !L.stepping) {
          wkReach(L.anc ? anchorRel(L) : C * (WK_A - L.s), wkKnee(L.s), h, L.gO, hipDz, hipDy); stanceAt(L.s, C, heelUp, toeOff, edgeT, aS, r0);
          L.z = lerp(wkP.z, edgeT.z, fly); L.y = lerp(wkP.y, edgeT.y, fly); L.sg = lerp(wkP.sg, edgeT.sg, fly);
        }
        const yg = L.y + L.gO - h;
        legIK(L.z * cl - yg * sl - hipDz, yg * cl + L.z * sl - hipDy);
        let th = ik.th, kn = ik.kn, f = L.sg - lean - th - kn, ws = L.w, wkEnd = 0, wkLand = 0;
        // Where a swinging foot comes down (walking, running, or between the two): the same spot its stance starts on.
        const tSw = (spd * (1 - D) * Tst) / (scale * hurry);
        rollAt(C * WK_A, -wkHu, wkP);
        const landZ = lerp(wkP.z + tSw * (1 - L.w), edgeB.z, fly), landY = lerp(wkP.y, edgeB.y, fly);
        const swinging = !L.stance && !inAir, gS = planted ? (L.g0 - bodyY) / scale : 0, gE = planted ? (L.gd - bodyY) / scale : 0;
        if (swinging && wkSwing) {
          const w = L.w;
          let wth = keyed(WK_TH_W, WK_TH, w), wkn = Math.max(0, keyed(WK_KN_W, WK_KN, w)), wsg = keyed(WK_FT_W, WK_FT, w);
          // At both ends the ankle reaches for the very spot it leaves and lands on, on that spot's own ground
          // and at the hips' height now, so the foot neither pops nor sinks there. (Those spots stay put on
          // the ground while the body goes on: tSw is how far it goes in a whole swing, own units.)
          // Coming in, the heel is over its spot just before it comes down onto it, so it never slides in.
          const kA = 1 - smooth(w / 0.2), kB = smooth((w - 0.72) / 0.22), kY = smooth((w - 0.8) / 0.2);
          wkEnd = Math.max(kA, kB) * (1 - fly); wkLand = kB * (1 - fly); // (these ends keep the shoe clear themselves)
          if (kA > 0 || kB > 0) {
            const az = -TH * Math.sin(wth) - SH * Math.sin(wth + wkn), ay = -TH * Math.cos(wth) - SH * Math.cos(wth + wkn);
            let Z = ay * sl + az * cl, Y = ay * cl - az * sl;
            // (lowF: the shoe's lowest point under the ankle, tipped so: the heel or the toes.)
            if (kA > 0) { // leaving: the toes come up off their spot at once, never dragging forward over it
              wkReach(L.anc ? anchorRel(L) : C * (WK_A - 1) - tSw * w, wkKnee(1), h, gS, hipDz, hipDy); Z = lerp(Z, wkP.z, kA); wsg = lerp(wsg, wkP.sg, kA);
              Y = Math.max(lerp(Y, wkP.y + gS - h, kA), gS - h - lowF(wsg) + 0.04 * LL * smooth(w / 0.12) * gait);
            }
            const low = lowF(wsg);
            if (kB > 0) { const ty = landY + gE - h; Z = lerp(Z, landZ, kB); Y = Math.max(lerp(Y, ty, kY), gE - h - low + 0.03 * LL * (1 - kY) * gait); }
            legIK(Z * cl - Y * sl - hipDz, Y * cl + Z * sl - hipDy); wth = ik.th; wkn = ik.kn;
          }
          th = wth; kn = wkn; f = wsg - lean - wth - wkn;
        }
        if (runSwing && !L.stance) {
          let y0 = edgeA.y + gS - hEnd; legIK(edgeA.z * cl - y0 * sl, y0 * cl + edgeA.z * sl);
          RUN_TH[0] = -ik.th; RUN_KN[0] = ik.kn; RUN_FT[0] = edgeA.sg - lean - ik.th - ik.kn;
          y0 = edgeB.y + gE - hEnd; legIK(edgeB.z * cl - y0 * sl, y0 * cl + edgeB.z * sl);
          RUN_TH[5] = -ik.th; RUN_KN[5] = ik.kn; RUN_FT[5] = edgeB.sg - lean - ik.th - ik.kn;
          RUN_TH[1] = RUN_TH[0] - 0.06;
          for (let k = 2; k < 4; k++) RUN_TH[k] = RUN_TH_B[k] * amp;
          for (let k = 1; k < 4; k++) RUN_KN[k] = RUN_KN_B[k];
          // Coming in to land the leg settles toward its landing pose, whatever height the hips are at.
          RUN_TH[4] = Math.max(RUN_TH[5] + 0.15, RUN_TH[3] - 0.25); RUN_KN[4] = RUN_KN[5] + 0.3;
          // The curves are timed against the other foot's step: the swinging foot passes under the body as
          // the other leg is halfway through its step and the hips are lowest, however long the steps are.
          const wm = (0.5 - D / 2) / (1 - D); ws = L.w < wm ? (0.5 * L.w) / wm : 0.5 + (0.5 * (L.w - wm)) / (1 - wm);
          let rth = -keyed(RUN_TH_W, RUN_TH, ws), rkn = keyed(RUN_KN_W, RUN_KN, ws), rf = keyed(RUN_FT_W, RUN_FT, ws);
          // The last of the swing reaches for the very spot it lands on, from just above and behind it, at the
          // hips' height now, so the foot comes down onto the ground and never through it.
          const kL = smooth((ws - 0.6) / 0.4);
          if (kL > 0) {
            // (Blended as a path of the ankle, which stays above the ground, not of the joint angles, which need not.)
            const tz = landZ, ty = landY + gE - Math.min(h, hEnd), rfE = lerp(-wkHu, edgeB.sg, fly) - lean;
            const az = -TH * Math.sin(rth) - SH * Math.sin(rth + rkn), ay = -TH * Math.cos(rth) - SH * Math.cos(rth + rkn);
            // In the ground's frame: forward to the spot, and down to it only from above (onto a higher step, or
            // off the edge of the one it left).
            const Z = lerp(ay * sl + az * cl, tz, kL), Y = Math.max(lerp(ay * cl - az * sl, ty, kL), lerp(Math.max(ty, gS + ANK - Math.min(h, hEnd)), ty, kL) + 0.05 * (1 - kL));
            legIK(Z * cl - Y * sl - hipDz, Y * cl + Z * sl - hipDy);
            rf = lerp(rf + rth + rkn, rfE, kL) - ik.th - ik.kn; rth = ik.th; rkn = ik.kn;
          }
          th = lerp(th, rth, fly); kn = lerp(kn, Math.max(0.03, rkn), fly); f = lerp(f, rf, fly);
        }
        if (swinging && (runSwing || wkSwing)) {
          // Never through the ground on the way: if the shoe would scuff, lift the toes, then fold the knee a
          // little more; let go of that again gently, not all at once.
          // (and straight after toe-off the toes clear the ground at once, so they never drag forward over it)
          const want = Math.max(0.02 * Math.sin(Math.PI * clamp(ws, 0, 1)), L.w < 0.5 ? 0.012 * smooth(L.w / 0.1) : 0) * (1 - wkLand) - 0.05 * wkLand, k0 = kn, f0 = f, t0 = th, lx = planted ? (i === 0 ? -P.hipX : P.hipX) * scale : null;
          kn = Math.min(2.3, kn + L.kAdd * (1 - wkEnd)); f -= L.fAdd * (1 - wkEnd); th -= L.tAdd * (1 - wkEnd);
          for (let k = 0; k < 5; k++) {
            const low = shoeLow(th, kn, f, lean, h, lx); if (low >= want) break;
            if (toeLow && f > -0.3) {
              const slope = Math.max(0.03, (shoeLow(th, kn, f - 0.1, lean, h, lx) - low) / 0.1);
              f = Math.max(-0.3, f - Math.min(0.4, (want - low) / slope)); continue;
            }
            const sk = (shoeLow(th, kn + 0.1, f, lean, h, lx) - low) / 0.1, st = (shoeLow(th - 0.1, kn, f, lean, h, lx) - low) / 0.1;
            if (kn < 2.1 && sk >= st && sk > 0.03) kn = Math.min(2.3, kn + Math.min(0.5, (want - low) / sk));
            else if (t0 - th < 0.6) th -= Math.min(0.2, (want - low) / Math.max(0.03, st)); // or lift the thigh higher
          }
          L.kAdd = Math.max(0, kn - k0) * (1 - ease(14)); L.fAdd = Math.max(0, f0 - f) * (1 - ease(14)); L.tAdd = Math.max(0, t0 - th) * (1 - ease(14));
        } else { L.kAdd = 0; L.fAdd = 0; L.tAdd = 0; }
        if (i === 0) { t.thL = th; t.knL = kn; t.fL = f; } else { t.thR = th; t.knR = kn; t.fR = f; }
      }
      t.spreadL = run * 0.05; t.spreadR = -run * 0.05; // a running child's feet land nearer the midline
      // ---- Arms: pendulums from the shoulders, driven by the opposite leg through the twist of the trunk.
      // Nearly straight and loose at a walk; bent to about a right angle and pumping at a run.
      // Each arm goes with the opposite leg's place in its stride (+1 forward). Angles are aimed in the world,
      // so a body leaning into a run does not carry the arms up with it. Walking: a loose swing of about 15
      // degrees each way. Running: elbows at about a right angle, the hand coming forward to the chest and
      // back past the hip (further back than forward), not an athlete's punch.
      const fR = C > 1e-3 ? clamp(legs[0].z / (C * 0.5 + 0.02), -1, 1) : 0, fL = C > 1e-3 ? clamp(legs[1].z / (C * 0.5 + 0.02), -1, 1) : 0;
      const aSw = lerp(0.27, 0.1, run) * gait * going, aOff = lerp(0.025, 0.35, run) * gait - (lean + t.trunk) * 0.85 + clamp(acc * 0.012, -0.15, 0.12);
      t.shLx = aOff - aSw * fL; t.shRx = aOff - aSw * fR;
      const elOf = (f) => -(0.15 * (1 - gait) + gait * (lerp(0.2, 0.3, run) + lerp(0.15 * Math.max(0, f), 0.04 * f, run) * going));
      t.elL = elOf(fL); t.elR = elOf(fR);
      t.shLz = -(0.12 + 0.56 * run); t.shRz = 0.12 + 0.56 * run; // running: both arms out to the sides like little wings (about 40 degrees)
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
      if (!legsIK) bounce = 0; // legs placed by a pose or gesture: no running bounce
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
      // (yawP and rollP are worked out before the legs are solved, which allow for them.)
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
      pelvis.rotation.z = sway + rollP;
      pelvis.position.x = walkW * (1 - run) * 0.012 * (lift0 - lift1); // weight over the planted foot
      pelvis.position.y = PELVIS_Y + pose.py;
      pelvis.rotation.y = yawP;
      // The upper body rides the bounce a little softer than the hips, so the head is steadier still.
      const rg = fly * going, lagB = pull(spring.headB, bounce, 12, 0.4, dt);
      // Torso, neck and head ride the hips rigidly (no separate vertical motion, so the neck never stretches).
      torso.position.y = 0; neck.position.y = P.neckY / (1 + breath);
      const waddle = 0.09 * rg * Math.cos(2 * Math.PI * (phase - D / 2));
      torso.rotation.set(pose.trunk, -yawP * 1.8 + clamp(turn * 0.08, -0.25, 0.25) * gait, -rollP * 1.1 + waddle);
      torso.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 1.2);
      neck.scale.set(1 / (1 + breath * 0.5), 1 / (1 + breath), 1 / (1 + breath * 1.2)); // breathing swells the chest only: the neck and head keep their size and place
      // How hard the hips are being lifted and dropped: it jolts the head, the arms and the backpack.
      // (The steady running bounce counts for only a little: the body is ready for it.)
      const pyB = pose.py - bounce * 0.75;
      if (lastPy !== null && dt > 0 && dt < 0.06) { const v = (pyB - lastPy) / dt; pyAcc += (clamp((v - pyVel) / dt, -40, 40) - pyAcc) * ease(25); pyVel = v; }
      lastPy = pyB;
      // Arms: damped springs toward their pose, loose while swinging free, firm when doing something.
      const loose = locoArms * Math.max(gait, inAir ? 0.6 : 0);
      const wS = lerp(24, 19, loose), zS = lerp(0.8, 0.7, loose), wE = lerp(26, 20, loose);
      const flap = pull(spring.flap, rg * 1.8 * bounce, 15, 0.3, dt) * 1.0; // wings flop up and down a beat behind the hops
      armL.shoulder.rotation.set(pull(spring.shL, pose.shLx, wS, zS, dt), 0, pose.shLz - flap);
      armR.shoulder.rotation.set(pull(spring.shR, pose.shRx, wS, zS, dt), 0, pose.shRz + flap);
      armL.elbow.rotation.x = Math.min(0, pull(spring.elL, pose.elL, wE, 0.55, dt, pyAcc * 0.25 * loose) - Math.abs(flap) * 1.5);
      armR.elbow.rotation.x = Math.min(0, pull(spring.elR, pose.elR, wE, 0.55, dt, pyAcc * 0.25 * loose) - Math.abs(flap) * 1.5);
      // The backpack hangs on its straps: running, it follows the hops a beat late (a loosely damped spring), so
      // it lifts off the back as the body drops, bumps down as it rises, and swings out a little at each
      // landing. Walking it barely stirs; standing it is still.
      const packLag = pull(spring.bob, bounce, PACK_W, 0.22, dt), packRel = clamp(packLag - bounce, -0.12, 0.12);
      pack.position.y = P.neckY * 0.86 + packRel * PACK_K + pull(spring.packY, 0, 18, 0.5, dt, -pyAcc * 0.15 * (1 - fly)) * 0.3;
      pack.rotation.x = clamp(pull(spring.pack, clamp(-acc * 0.004, -0.04, 0.08) + Math.max(0, packRel) * PACK_S, 12, 0.3, dt), 0, 0.22);

      const w = o.wobble || 0;
      inner.rotation.x = pose.lean + (o.pitch || 0);
      inner.rotation.z = (o.roll || 0) + Math.sin(elapsed * 26) * 0.28 * w; // no banking into bends
      const stretch = inAir ? Math.abs(o.air) * 0.035 : 0, sq = land * (landRun ? 0.03 : 0.07);
      inner.scale.set(1 + sq * 0.6 - stretch * 0.5, 1 - sq + stretch - w * 0.06 + Math.sin(elapsed * 1.8 + seed) * 0.006 * (1 - gait), 1 + sq * 0.6 - stretch * 0.5);
      // The head steadies itself: it stays near level whatever the body does, nods a moment late when the
      // hips are jolted, and turns into a bend before the body does.
      const nod = pull(spring.nod, 0, 13, 0.45, dt, pyAcc * 1.2);
      neck.rotation.x = -pose.lean * 0.6 - pose.trunk * 0.85 + pose.hp + nod + rg * 1.6 * (bounce - lagB); // running: the head nods a beat behind the hops (rotation only)
      neck.rotation.y = Math.sin(e * 0.45) * 0.28 * (1 - gait) * (o.pose ? 0.3 : 1) * (headLook ? 0.15 : 1) + pose.hy + headLook + clamp(turn * 0.28, -0.55, 0.55) * Math.max(gait, 0.4) + yawP * 0.8;
      neck.rotation.z = -inner.rotation.z * 0.6 + rollP * 0.6;
      // Asleep: flat on the back, centred on the bed, chest rising and falling.
      if (o.pose === 'sleep') { inner.rotation.set(-Math.PI / 2, 0, 0); inner.position.set(0, 0.1, TALL / 2); neck.rotation.set(0, 0, 0); inner.scale.set(1, 1, 1 + Math.sin(elapsed * 1.3 + seed) * 0.03); }
      else {
        // Feet on the ground: the legs were solved onto the ground under each foot, so this is only a
        // small correction for what they could not reach (or a pose that places the legs itself): find how
        // far the planted soles are in or above the ground and ease the body by that much. Eased, never
        // snapped, so it can not put a jolt into the body's rise and fall.
        const base = planted ? (bodyY - group.position.y) / scale : 0;
        let liftT = 0;
        if (planted) {
          inner.position.set(0, base, 0);
          group.updateMatrixWorld(true);
          let pen = -Infinity;
          for (let i = 0; i < 2; i++) {
            if (legsIK && !legs[i].stance) continue; // a swinging foot is meant to be off the ground
            const F = i === 0 ? legL : legR;
            for (const pt of SOLE) { solePoint.copy(pt).applyMatrix4(F.foot.matrixWorld); pen = Math.max(pen, groundUnder(solePoint.x, solePoint.z) - (o.sink || 0) - solePoint.y); }
          }
          liftT = pen > -Infinity ? clamp(pen + 0.003, -0.12, 0.4) : footLift; // a hair of clearance, so an eased sole never dips in
          // Running, the legs and the bounce already put the foot on the ground: this only ever lifts a sole out of it.
          if (pen > -Infinity && legsIK) liftT = lerp(liftT, Math.max(0, liftT), fly);
        }
        if (dt > 0) { critStep(footLift, liftV, liftT, LIFT_W, dt); footLift = cdX; liftV = cdV; }
        inner.position.set(0, base + footLift / scale, 0);
      }
    },
  };
}
