// Critter kit: a duck, a heron, a monkey, butterflies and a jumping fish. Facing +z, origin at the feet / waterline.
// Each animal is a few moving parts on pivots; every part is its own welded mesh (pieces carry vertex colours,
// so one material covers the whole animal). Only body-sized parts cast shadows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---- helpers ------------------------------------------------------------------------------
const FUR = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1 }); // colours come from the vertices
const SPHERE = new THREE.SphereGeometry(1, 14, 10);
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// One coloured piece, moved / scaled / turned and with its colour baked in.
function bit(geo, color, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), new THREE.Vector3(s[0], s[1], s[2]));
  g.applyMatrix4(_m);
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
// A rounded blob: a sphere stretched to the given radii.
const blob = (color, p, radii, r) => bit(SPHERE, color, p, radii, r);
// A rounded rod from point a to point b.
function limb(color, a, b, rad) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, vb.clone().sub(va).normalize()), e = new THREE.Euler().setFromQuaternion(q);
  return bit(new THREE.CapsuleGeometry(rad, Math.max(0.001, len - rad * 2), 3, 8), color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [1, 1, 1], [e.x, e.y, e.z]);
}
// A small cone pointing along +z (beaks, tail tips).
const spike = (color, p, rad, len, s = [1, 1, 1], tilt = 0) => bit(new THREE.ConeGeometry(rad, len, 6), color, p, s, [Math.PI / 2 + tilt, 0, 0]);
// Weld pieces into one mesh. Only body-sized parts cast a shadow.
function weld(bits, cast = false) {
  const mesh = new THREE.Mesh(mergeGeometries(bits), FUR);
  mesh.castShadow = cast; mesh.receiveShadow = true;
  return mesh;
}
// A pivot placed at p; meshes added inside it turn about that point.
const pivot = (x, y, z, ...kids) => { const g = new THREE.Group(); g.position.set(x, y, z); g.add(...kids); return g; };
// Shifts / tilts a list of pieces (to line a head up with the end of a neck).
function moved(bits, p, rx = 0) { const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1)); bits.forEach((g) => g.applyMatrix4(m)); return bits; }
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
const DARK = 0x2a2220, ORANGE = 0xf2a23b;
const ease = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
const smooth = (x) => x * x * (3 - 2 * x);

// =============================================================================================
// DUCK  (about 0.45 m long, 0.35 m tall)
// =============================================================================================
export function buildDuck(color = 0xf0cf72) {
  const group = new THREE.Group();
  const light = shade(color, 1.08), wingC = shade(color, 0.85);
  // The body rig (everything rides on the body so it can tip forward as one).
  const rig = new THREE.Group(); rig.position.y = 0.19; group.add(rig);
  // Plump body with two folded wings on its sides.
  const body = weld([blob(color, [0, 0, 0], [0.15, 0.125, 0.24]), blob(wingC, [0.115, 0.025, -0.03], [0.045, 0.09, 0.17], [0, 0, -0.15]), blob(wingC, [-0.115, 0.025, -0.03], [0.045, 0.09, 0.17], [0, 0, 0.15])], true);
  // Tail: a little upturned fan at the back, wiggles on its own pivot.
  const tail = pivot(0, 0.03, -0.2, weld([blob(color, [0, 0.01, -0.07], [0.07, 0.035, 0.11], [-0.4, 0, 0])]));
  // Neck and head on a pivot at the front of the chest: head, orange bill, dot eyes.
  const head = pivot(0, 0.09, 0.15, weld([
    limb(light, [0, -0.02, -0.01], [0, 0.13, 0.05], 0.068),
    blob(light, [0, 0.165, 0.06], [0.095, 0.095, 0.1]),
    blob(ORANGE, [0, 0.15, 0.165], [0.05, 0.022, 0.07]),
    blob(DARK, [0.062, 0.195, 0.115], [0.018, 0.018, 0.018]), blob(DARK, [-0.062, 0.195, 0.115], [0.018, 0.018, 0.018]),
  ]));
  // Legs hang from under the body: a thin shin and a flat webbed foot.
  const legMesh = () => weld([limb(ORANGE, [0, 0, 0], [0, -0.1, 0], 0.014), blob(ORANGE, [0, -0.105, 0.035], [0.035, 0.009, 0.055])]);
  const legL = pivot(-0.06, -0.09, -0.02, legMesh()), legR = pivot(0.06, -0.09, -0.02, legMesh());
  rig.add(body, tail, head, legL, legR);

  return {
    group,
    animate(t, { mode = 'rest', speed = 1 } = {}) {
      const k = Math.max(0.3, speed || 1);
      // Start from a calm pose, then each mode bends it.
      rig.position.set(0, 0.19, 0); rig.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0); tail.rotation.set(0, 0, 0); legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0); group.position.y = 0;
      if (mode === 'swim') {
        // Floating low with the belly in the water; bobs, paddles with both feet, tail wags, head nods.
        rig.position.y = 0.11 + Math.sin(t * 2.2) * 0.012; rig.rotation.z = Math.sin(t * 1.7) * 0.04; rig.rotation.x = Math.sin(t * 2.2 + 1) * 0.03;
        legL.rotation.x = Math.sin(t * 5) * 0.6; legR.rotation.x = -Math.sin(t * 5) * 0.6;
        tail.rotation.y = Math.sin(t * 6) * 0.35; head.rotation.x = Math.sin(t * 2.2) * 0.08; head.rotation.y = Math.sin(t * 0.7) * 0.25;
      } else if (mode === 'dabble') {
        // Bottom up: tips forward, head under the surface, tail pointing at the sky, feet kicking.
        const d = 0.5 + 0.5 * Math.sin(t * 0.9), tip = 0.75 + d * 0.3;
        rig.position.y = 0.12; rig.rotation.x = tip; head.rotation.x = 0.3;
        tail.rotation.y = Math.sin(t * 7) * 0.3; tail.rotation.x = -0.3;
        legL.rotation.x = Math.sin(t * 6) * 0.5 - 0.3; legR.rotation.x = -Math.sin(t * 6) * 0.5 - 0.3;
      } else if (mode === 'waddle') {
        // Side-to-side walk: legs swing in turn, body rolls over each foot, head bobs.
        const ph = t * (4 + 3 * k), s = Math.sin(ph);
        rig.rotation.z = s * 0.14; rig.rotation.x = Math.cos(ph * 2) * 0.03; rig.position.y = 0.19 + Math.abs(Math.cos(ph)) * 0.012; rig.position.x = s * 0.012;
        legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7; legL.position.y = -0.09 + Math.max(0, -s) * 0.02; legR.position.y = -0.09 + Math.max(0, s) * 0.02;
        tail.rotation.y = -s * 0.25; head.rotation.x = Math.cos(ph * 2) * 0.08;
      } else { // rest: sits still, breathing, head tucked back a little
        rig.position.y = 0.17 + Math.sin(t * 1.4) * 0.004; head.rotation.x = -0.25 + Math.sin(t * 0.5) * 0.04; head.position.z = 0.13;
        legL.rotation.x = legR.rotation.x = 1.2; // feet folded under the belly
      }
      if (mode !== 'rest') head.position.z = 0.15;
    },
  };
}

// =============================================================================================
// HERON  (a tall white egret, about 0.9 m)
// =============================================================================================
export function buildHeron() {
  const group = new THREE.Group();
  const WHITE = 0xfbfbf7, GREY = 0xe3e6e2, LEG = 0x3b3733, FOOT = 0xe8c23a, BEAK = 0xf2b84b;
  // The body rig sits at hip height and carries body, wings and neck.
  const rig = new THREE.Group(); rig.position.set(0, 0.52, 0); group.add(rig);
  // Slim oval body with a pointed rump.
  const body = weld([blob(WHITE, [0, 0, -0.02], [0.1, 0.095, 0.2]), blob(WHITE, [0, -0.015, -0.24], [0.055, 0.035, 0.12], [-0.2, 0, 0]), blob(WHITE, [0, 0.04, 0.17], [0.08, 0.09, 0.09])], true);
  // Wings: built stretched out sideways (inner arm, outer feathers, grey tips); folded back along the body when idle.
  const wingMesh = (s) => weld([
    blob(WHITE, [s * 0.12, 0, 0], [0.14, 0.022, 0.1]), blob(GREY, [s * 0.3, 0, -0.03], [0.16, 0.018, 0.12]),
    blob(WHITE, [s * 0.5, 0, -0.07], [0.16, 0.014, 0.1]), blob(GREY, [s * 0.66, 0, -0.1], [0.11, 0.012, 0.07]),
  ], true);
  const wingL = pivot(-0.085, 0.045, 0.06, wingMesh(-1)), wingR = pivot(0.085, 0.045, 0.06, wingMesh(1));
  // Neck in two bending halves (so it can make an S or stab): lower half, then upper half carrying the head.
  const NL = 0.18;
  const neck1 = pivot(0, 0.08, 0.13, weld([limb(WHITE, [0, -0.02, 0], [0, NL + 0.02, 0], 0.034)]));
  const headBits = moved([
    blob(WHITE, [0, 0.02, 0.025], [0.04, 0.04, 0.065]),
    spike(BEAK, [0, 0.015, 0.14], 0.022, 0.2, [1, 0.8, 1]),
    blob(DARK, [0.034, 0.035, 0.04], [0.013, 0.013, 0.013]), blob(DARK, [-0.034, 0.035, 0.04], [0.013, 0.013, 0.013]),
  ], [0, NL, 0], 0.5);
  const neck2 = pivot(0, NL, 0, weld([limb(WHITE, [0, -0.02, 0], [0, NL, 0], 0.03), ...headBits]));
  neck1.add(neck2);
  rig.add(body, wingL, wingR, neck1);
  // Long dark legs with yellow feet, hung from the hips (the body can tip without moving them).
  const legMesh = () => weld([limb(LEG, [0, 0, 0], [0, -0.47, 0], 0.012), blob(FOOT, [0, -0.465, 0.04], [0.03, 0.009, 0.055])]);
  const legL = pivot(-0.045, 0.48, 0, legMesh()), legR = pivot(0.045, 0.48, 0, legMesh());
  group.add(legL, legR);

  return {
    group,
    animate(t, { mode = 'stand', speed = 1 } = {}) {
      const k = Math.max(0.3, speed || 1);
      rig.position.set(0, 0.52, 0); rig.rotation.set(0, 0, 0);
      legL.position.y = legR.position.y = 0.48; legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0);
      let n1 = 0.45, n2 = -0.85, fold = 1, flap = 0;   // the resting S-shaped neck and folded wings
      if (mode === 'stand') {
        n1 += Math.sin(t * 0.8) * 0.06; n2 += Math.sin(t * 0.8 + 0.8) * 0.08; rig.position.y += Math.sin(t * 1.5) * 0.002;
      } else if (mode === 'stalk') {
        // Slow high steps: each leg lifts, swings forward and plants; the neck reaches ahead and the head stays steady.
        const ph = t * (1.6 + 0.5 * k);
        for (const [leg, off] of [[legL, 0], [legR, Math.PI]]) {
          const s = Math.sin(ph + off), c = Math.cos(ph + off);
          leg.rotation.x = s * 0.45; leg.position.y = 0.48 + Math.max(0, c) * 0.07;
        }
        rig.position.y += Math.abs(Math.sin(ph)) * 0.015; rig.rotation.x = 0.1 + Math.sin(ph * 2) * 0.02;
        n1 = 0.85 + Math.sin(ph * 2) * 0.05; n2 = -0.45 - Math.sin(ph * 2) * 0.05;
      } else if (mode === 'strike') {
        // 2.6 s cycle: stare, a quick stab straight down, then a slow lift back up with a catch.
        const c = (t % 2.6) / 2.6; let a = 0;
        if (c < 0.45) a = smooth(c / 0.45) * 0.25;                 // lean in slowly, eyes on the water
        else if (c < 0.52) a = ease(0.25, 1, (c - 0.45) / 0.07);     // stab
        else if (c < 0.62) a = 1;                                    // hold
        else a = 1 - smooth((c - 0.62) / 0.38);                      // recover
        rig.rotation.x = a * 0.4; n1 = ease(0.45, 1.5, a); n2 = ease(-0.85, 0.35, a);
      } else if (mode === 'fly') {
        // Wings beating, legs trailing behind, neck pulled in.
        fold = 0; flap = Math.sin(t * 7 * Math.max(0.6, k * 0.8)) * 0.65;
        rig.position.y = 0.52 + Math.sin(t * 7 * Math.max(0.6, k * 0.8)) * 0.03; rig.rotation.x = -0.05 + Math.sin(t * 7 * Math.max(0.6, k * 0.8)) * 0.03;
        legL.rotation.x = legR.rotation.x = 1.45 + Math.sin(t * 3) * 0.03; legL.position.y = legR.position.y = 0.48; legL.rotation.z = 0.05; legR.rotation.z = -0.05;
        n1 = 0.95; n2 = -1.5;
      }
      neck1.rotation.x = n1; neck2.rotation.x = n2;
      for (const [w, s] of [[wingL, -1], [wingR, 1]]) {
        w.rotation.set(0, s * fold * 1.45, s * flap);                 // folded: swung back along the body; flying: spread and flapping
        w.scale.x = fold ? 0.5 : 1; w.position.y = fold ? 0.05 : 0.07; if (fold) w.rotation.z = s * -0.12;
      }
    },
  };
}

// =============================================================================================
// MONKEY  (about 0.5 m sitting height, long curling tail)
// =============================================================================================
export function buildMonkey() {
  const group = new THREE.Group();
  const FURC = 0x8a5a3a, TAIL = 0x6b4630, SKIN = 0xe8c9a0;
  // `swing` is a pivot at the hand-hold for hanging; `rig` carries the hips; both sit still unless 'hang'.
  const swing = new THREE.Group(), rig = new THREE.Group(); group.add(swing); swing.add(rig);
  const hips = new THREE.Group(); hips.position.set(0, 0.075, -0.02); rig.add(hips);
  // Torso: round belly and chest with a pale tummy patch.
  const torso = weld([blob(FURC, [0, 0.055, 0], [0.135, 0.12, 0.125]), blob(FURC, [0, 0.17, 0.01], [0.115, 0.13, 0.105]), blob(SKIN, [0, 0.1, 0.07], [0.085, 0.09, 0.05])], true);
  // Head on a neck pivot: big round head, pale face and muzzle, dot eyes, round ears.
  const head = pivot(0, 0.24, 0.02, weld([
    blob(FURC, [0, 0.075, 0.02], [0.1, 0.1, 0.1]),
    blob(SKIN, [0, 0.065, 0.075], [0.07, 0.062, 0.045]), blob(SKIN, [0, 0.045, 0.1], [0.042, 0.034, 0.034]), blob(DARK, [0, 0.058, 0.132], [0.014, 0.01, 0.01]),
    blob(DARK, [0.036, 0.1, 0.1], [0.016, 0.016, 0.016]), blob(DARK, [-0.036, 0.1, 0.1], [0.016, 0.016, 0.016]),
    blob(SKIN, [0.1, 0.085, 0.02], [0.03, 0.036, 0.022]), blob(SKIN, [-0.1, 0.085, 0.02], [0.03, 0.036, 0.022]),
  ], true));
  // Arms from the shoulders: a rod and a pale hand.
  const armMesh = () => weld([limb(FURC, [0, 0, 0], [0, -0.17, 0.02], 0.033), blob(SKIN, [0, -0.19, 0.03], [0.04, 0.04, 0.04])]);
  const armL = pivot(-0.12, 0.22, 0.0, armMesh()), armR = pivot(0.12, 0.22, 0.0, armMesh());
  // Legs: a rod and a pale foot, hip pivots low on the torso.
  const legMesh = () => weld([limb(FURC, [0, 0, 0], [0, -0.2, 0.0], 0.042), blob(SKIN, [0, -0.205, 0.035], [0.036, 0.026, 0.056])]);
  const legL = pivot(-0.085, 0.02, 0.03, legMesh()), legR = pivot(0.085, 0.02, 0.03, legMesh());
  // The tail is four joints in a chain, thinning to the tip, so it can curl.
  const tailSeg = (r0, r1) => weld([limb(TAIL, [0, 0, 0.025], [0, 0, -0.14], (r0 + r1) / 2)]);
  const t1 = pivot(0, 0.02, -0.11, tailSeg(0.032, 0.028)), t2 = pivot(0, 0, -0.11, tailSeg(0.028, 0.024)), t3 = pivot(0, 0, -0.11, tailSeg(0.024, 0.02)), t4 = pivot(0, 0, -0.11, tailSeg(0.02, 0.016));
  t1.add(t2); t2.add(t3); t3.add(t4);
  hips.add(torso, head, armL, armR, legL, legR, t1);
  const tails = [t1, t2, t3, t4];

  return {
    group,
    animate(t, { mode = 'sit', speed = 1 } = {}) {
      const k = Math.max(0.3, speed || 1);
      // Calm sitting pose first.
      swing.position.set(0, 0, 0); swing.rotation.set(0, 0, 0); rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
      hips.position.set(0, 0.075, -0.02); hips.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0); torso.scale.set(1, 1, 1);
      armL.rotation.set(-0.55, 0, 0.12); armR.rotation.set(-0.55, 0, -0.12);
      legL.rotation.set(-1.2, 0, -0.15); legR.rotation.set(-1.2, 0, 0.15);
      tails.forEach((s, i) => s.rotation.set(0.55 + 0.25 * Math.sin(t * 1.2 + i * 0.7), 0.2 * Math.sin(t * 0.9 + i), 0)); tails[0].rotation.x += 0.1;
      if (mode === 'sit') {
        // Looks about, breathing; the tail curls and uncurls.
        head.rotation.y = Math.sin(t * 0.6) * 0.7; head.rotation.x = Math.sin(t * 0.9) * 0.12 - 0.05;
        torso.scale.set(1, 1 + Math.sin(t * 2) * 0.012, 1);
        tails.forEach((s, i) => { s.rotation.x = 0.5 + 0.35 * Math.sin(t * 1.4 + i * 0.6) + i * 0.1; });
      } else if (mode === 'scratch') {
        // Right hand scratches the head, left hand the belly; body sways a touch, head tilts into it.
        const sc = Math.sin(t * 11);
        armR.rotation.set(-2.7 + sc * 0.18, 0, -0.55 + sc * 0.08); armL.rotation.set(-0.7 + Math.sin(t * 9) * 0.15, 0, 0.45);
        head.rotation.z = -0.15; head.rotation.x = 0.05; hips.rotation.z = Math.sin(t * 1.3) * 0.03; head.rotation.y = Math.sin(t * 0.5) * 0.2;
      } else if (mode === 'scamper') {
        // Bounding on all fours: torso levelled forward, arms and legs reach and push together, tail streams behind.
        const ph = t * (4 + 3 * k), s = Math.sin(ph), lean = 1.25;
        hips.position.set(0, 0.2 + Math.abs(Math.sin(ph)) * 0.05, -0.04);
        hips.rotation.x = lean + Math.sin(ph) * 0.06; head.rotation.x = -lean + 0.25 - Math.sin(ph) * 0.06;
        armL.rotation.set(-lean + s * 0.8, 0, 0.1); armR.rotation.set(-lean + s * 0.8, 0, -0.1);
        legL.rotation.set(-lean - s * 0.9 + 0.3, 0, -0.1); legR.rotation.set(-lean - s * 0.9 + 0.3, 0, 0.1);
        tails.forEach((x, i) => x.rotation.set((i ? 0.2 : -1.2) + Math.sin(ph + i * 0.7) * 0.2, Math.sin(ph * 0.5 + i) * 0.15, 0));
      } else if (mode === 'hang') {
        // Dangles by the right hand from a hold at 1.0 m; swings like a pendulum, free arm and legs trailing.
        const sw = Math.sin(t * 1.6);
        swing.position.set(0, 1.0, 0); rig.position.set(-0.12, -0.52, 0.02);
        swing.rotation.set(Math.sin(t * 1.6 + 1.2) * 0.12, 0, sw * 0.28);
        armR.rotation.set(Math.PI, 0, 0); armL.rotation.set(-0.3 + sw * 0.15, 0, 0.5);
        legL.rotation.set(0.15 - sw * 0.2, 0, -0.15); legR.rotation.set(-0.05 - sw * 0.2, 0, 0.15);
        head.rotation.set(-0.1, Math.sin(t * 0.8) * 0.4, -sw * 0.1);
        tails.forEach((x, i) => x.rotation.set(-0.6 + Math.sin(t * 1.6 - i * 0.5) * 0.3, 0, 0));
        hips.rotation.x = 0.05;
      }
    },
  };
}

// =============================================================================================
// BUTTERFLIES  (one instanced mesh; wings flap in the shader)
// =============================================================================================
export function buildButterflies(count = 8) {
  const group = new THREE.Group();
  // Wing outlines for the right side (x across, y becomes forward z): a big front wing and a smaller back wing.
  const P = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const fore = P([[0.01, 0.035], [0.06, 0.105], [0.14, 0.12], [0.18, 0.07], [0.13, 0.0], [0.01, -0.01]]);
  const hind = P([[0.01, -0.005], [0.11, -0.01], [0.14, -0.06], [0.09, -0.12], [0.04, -0.105], [0.01, -0.05]]);
  const flatten = (g, dy, kind, mirror) => { // lay a 2D shape flat (x, 0, y), tag it, optionally mirror it to the left side
    g = g.toNonIndexed(); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (mirror ? -1 : 1), dy, p.getY(i));
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(p.count).fill(kind), 1));
    return g;
  };
  const parts = [];
  for (const mirror of [false, true]) {
    parts.push(flatten(new THREE.ShapeGeometry(fore), 0, 0, mirror), flatten(new THREE.ShapeGeometry(hind), 0, 0, mirror));
    for (const dy of [0.003, -0.003]) { // pale spots on both faces of each wing
      const spot = (cx, cz) => { const c = new THREE.CircleGeometry(0.028, 6); c.translate(cx, cz, 0); return flatten(c, dy, 1, mirror); };
      parts.push(spot(0.125, 0.075), spot(0.085, -0.065));
    }
  }
  // Body: a dark little capsule and head along the middle.
  for (const [z, r, len] of [[0, 0.012, 0.07], [0.075, 0.015, 0]]) {
    const g = new THREE.SphereGeometry(1, 6, 5).toNonIndexed(); g.scale(r, r, r + len); g.translate(0, 0, z);
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(2), 1)); parts.push(g);
  }
  const geo = mergeGeometries(parts);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) phases[i] = i * 2.1;
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, uniforms: { uTime: { value: 0 },},
    vertexShader: `attribute float aKind; attribute float aPhase; uniform float uTime; varying vec3 vColor; varying float vKind;
      void main() {
        vec3 p = position;
        float side = sign(p.x), x = abs(p.x);
        float ang = sin(uTime * 15.0 + aPhase) * 0.9 + 0.3;           // wing angle: tips swing up and below flat
        if (aKind < 1.5) { p.x = side * x * cos(ang); p.y += x * sin(ang); }
        vColor = instanceColor; vKind = aKind;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying vec3 vColor; varying float vKind;
      void main() {
        vec3 c = vColor;
        if (vKind > 1.5) c = vec3(0.17, 0.12, 0.1);                   // body
        else if (vKind > 0.5) c = mix(vColor, vec3(1.0, 0.97, 0.9), 0.75); // spots
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, material, count);
  const cols = [0xf2b63b, 0xe8503a, 0x7fb3f0, 0xf7b7cf, 0xffffff, 0xb78be8, 0xff9a4a, 0x6fd0a8];
  const seeds = [];
  for (let i = 0; i < count; i++) {
    mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    const r = (n) => { const v = Math.sin((i + 1) * 91.7 + n * 17.3) * 43758.5; return v - Math.floor(v); };
    seeds.push({ f: [0.35 + r(1) * 0.35, 0.3 + r(2) * 0.35, 0.4 + r(3) * 0.3, 0.7 + r(4) * 0.5], p: [r(5) * 6.28, r(6) * 6.28, r(7) * 6.28, r(8) * 6.28], bob: 9 + r(9) * 4 });
  }
  mesh.frustumCulled = false;
  group.add(mesh);
  // Wander: slow overlapping loops, squeezed softly inside a ball 2 m in radius (a 4 m bubble) centred 1.5 m up.
  const R = 1.95, CY = 1.5;
  const at = (s, t, out) => {
    const x = Math.sin(t * s.f[0] + s.p[0]) * 1.3 + Math.sin(t * s.f[3] + s.p[3]) * 0.7;
    const y = Math.sin(t * s.f[1] + s.p[1]) * 0.9 + Math.sin(t * s.f[3] * 1.7 + s.p[2]) * 0.3;
    const z = Math.cos(t * s.f[2] + s.p[2]) * 1.3 + Math.cos(t * s.f[0] * 1.4 + s.p[1]) * 0.7;
    const len = Math.hypot(x, y, z) || 1, k = R * Math.tanh(len / R) / len;
    return out.set(x * k, CY + y * k + 0.0, z * k);
  };
  const dummy = new THREE.Object3D(), a = new THREE.Vector3(), b = new THREE.Vector3();
  return {
    group,
    update(dt, elapsed) {
      material.uniforms.uTime.value = elapsed;
      for (let i = 0; i < count; i++) {
        const s = seeds[i];
        at(s, elapsed, a); at(s, elapsed + 0.05, b);
        dummy.position.copy(a).y += Math.sin(elapsed * s.bob + i) * 0.03;
        dummy.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), Math.sin(elapsed * 1.7 + i) * 0.25); // face where it is going, lean into turns
        dummy.scale.setScalar(1.15); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// =============================================================================================
// JUMPING FISH  (leaps out of y = 0 every few seconds)
// =============================================================================================
export function buildJumpingFish() {
  const group = new THREE.Group();
  const TOP = 0xf2894a, BELLY = 0xfff0d2, FIN = 0xe8663a;
  // The fish: plump orange body, cream belly, back fin, side fins, big eyes. Origin = middle of its body.
  const fish = new THREE.Group(); fish.visible = false; group.add(fish);
  const body = weld([
    blob(TOP, [0, 0, 0], [0.075, 0.09, 0.21]), blob(BELLY, [0, -0.04, 0.02], [0.062, 0.06, 0.17]),
    blob(FIN, [0, 0.095, -0.02], [0.012, 0.055, 0.09], [0.45, 0, 0]),
    blob(FIN, [0.07, -0.03, 0.05], [0.012, 0.03, 0.06], [0, 0, -0.4]), blob(FIN, [-0.07, -0.03, 0.05], [0.012, 0.03, 0.06], [0, 0, 0.4]),
    blob(0xffffff, [0.06, 0.025, 0.14], [0.026, 0.026, 0.026]), blob(0xffffff, [-0.06, 0.025, 0.14], [0.026, 0.026, 0.026]),
    blob(DARK, [0.075, 0.027, 0.146], [0.015, 0.015, 0.015]), blob(DARK, [-0.075, 0.027, 0.146], [0.015, 0.015, 0.015]),
  ], true);
  // Tail fin on its own pivot at the back so it can flick.
  const tail = pivot(0, 0, -0.19, weld([blob(TOP, [0, 0, -0.02], [0.03, 0.035, 0.06]), blob(FIN, [0, 0.05, -0.08], [0.012, 0.065, 0.045], [0.55, 0, 0]), blob(FIN, [0, -0.05, -0.08], [0.012, 0.065, 0.045], [-0.55, 0, 0])]));
  fish.add(body, tail);

  // Two flat rings of splash (where it leaves and where it lands) and a few flying drops.
  const ringGeo = new THREE.RingGeometry(0.8, 1, 28); ringGeo.rotateX(-Math.PI / 2);
  const mkRing = () => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 })); m.position.y = 0.03; m.visible = false; m.renderOrder = 2; group.add(m); return m; };
  const ringOut = mkRing(), ringIn = mkRing();
  const DROPS = 12;
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.03, 0), new THREE.MeshBasicMaterial({ color: 0xeaf8ff }), DROPS);
  drops.frustumCulled = false; group.add(drops);
  const dv = Array.from({ length: DROPS }, (_, i) => { const a = (i % 6) / 6 * 6.28 + i, v = 0.7 + ((i * 37) % 10) / 10 * 0.8; return { vx: Math.cos(a) * 0.5, vz: Math.sin(a) * 0.5, vy: v }; });

  const hash = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const PERIOD = 4.6, DUR = 0.95, Z0 = -0.6, Z1 = 0.6, HIGH = 0.95;
  const dummy = new THREE.Object3D();
  return {
    group,
    update(dt, elapsed) {
      // Each 4.6 s window holds one jump, starting at a different moment in the window each time.
      const idx = Math.floor(elapsed / PERIOD), start = idx * PERIOD + 0.4 + hash(idx) * (PERIOD - DUR - 1.8), u = (elapsed - start) / DUR;
      fish.visible = u >= 0 && u <= 1;
      if (fish.visible) {
        fish.position.set(0, HIGH * 4 * u * (1 - u) + 0.0, Z0 + (Z1 - Z0) * u);
        const slope = (HIGH * 4 * (1 - 2 * u)) / (Z1 - Z0);
        fish.rotation.x = -Math.atan(slope) * 0.95; fish.rotation.z = Math.sin(u * 12) * 0.12;
        tail.rotation.y = Math.sin(elapsed * 38) * 0.55;
        fish.position.y -= 0.05; // a little of the body is still in the water at the very start and end
      }
      // Rings and drops belong to the jump that is nearest in time (this one, or the one just before).
      const prev = (idx - 1) * PERIOD + 0.4 + hash(idx - 1) * (PERIOD - DUR - 1.8);
      let cur = start; if (elapsed < start) cur = prev;
      const ring = (m, z, age) => {
        const on = age >= 0 && age < 1.3; m.visible = on;
        if (on) { const s = 0.12 + age * 0.75; m.position.z = z; m.scale.set(s, 1, s); m.material.opacity = 0.75 * (1 - age / 1.3); }
      };
      ring(ringOut, Z0, elapsed - cur); ring(ringIn, Z1, elapsed - cur - DUR);
      for (let i = 0; i < DROPS; i++) {
        const d = dv[i], fromOut = i < DROPS / 2, age = elapsed - cur - (fromOut ? 0 : DUR), z0 = fromOut ? Z0 : Z1;
        if (age < 0 || age > 0.9) { dummy.scale.setScalar(0); dummy.position.set(0, -1, 0); }
        else { dummy.scale.setScalar(1); dummy.position.set(d.vx * age * 0.6, Math.max(0.0, d.vy * age - 4.9 * age * age), z0 + d.vz * age * 0.6); }
        dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
  };
}
