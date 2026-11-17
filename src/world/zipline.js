// The flying fox: launch tower, cable, landing frame, and scouts who ride it and climb back up.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { ZIPLINE, RIDER_ROUTE, groundAt, addPlatform } from '../logic/layout.js';
import { createFigure } from '../actors/figure.js';
import { box, cyl, ball, stick, roofGeometry, shared, mergeStatic } from './build.js';
import { WIND } from './weather.js';

const BAMBOO = 0xd8bb72, DARK = 0x5b5b63, ROPE = 0xe9dcc0, STEEL = 0xc3c7cf, HARNESS = 0xe8743a, RUBBER = 0xd9452f;
const HANG = 0.86;         // how far a rider's feet hang below the cable
const PLATFORM = 2.7;      // height of the launch deck above the summit
const G = 9.8;

// The player's ride, all in metres and seconds.
const LAN = 0.85, STOWED = 0.3;      // the lanyard's working length, and how far it hangs when wound up on the trolley
const HOOK_DROP = 0.1;               // the lanyard comes out of the trolley this far below the cable
const BELT = new THREE.Vector3(0, 0.5, 0.13); // where the hook clips on, in the scout's own frame (feet at the origin)
const PEND = 1.15;                   // pendulum length from the trolley to the body's centre of mass
const SWING_DAMP = 0.85;             // how quickly a swing dies away (1/s)
const DRAG = 0.016, BODY_DRAG = 0.012; // air drag on the trolley and on the hanging scout (per m)
const BRAKE = 3.6, ARRIVE = 3.0;     // the brake rope slows the trolley at this rate to about this speed before the block
const BLOCK_K = 150, BLOCK_C = 8;    // the brake block's bungee: stiffness and damping (per kg)
const RUNG = 0.4, RUNG_TIME = 0.5, WALK = 1.35;
const CLIP_TIME = 2.2, UNCLIP_TIME = 1.0, SETTLE_TIME = 3.0;
const MAT_REST = 0.45;               // how much of its speed a body keeps bouncing off the mat
const STREAKS = 16, SEG = 8;

export function createZipline(scene, deps) {
  const { ui, audio } = deps;
  const topY = heightAt(ZIPLINE.top.x, ZIPLINE.top.z), bottomY = heightAt(ZIPLINE.bottom.x, ZIPLINE.bottom.z);
  const A = new THREE.Vector3(ZIPLINE.top.x, topY + ZIPLINE.topHeight, ZIPLINE.top.z);
  const B = new THREE.Vector3(ZIPLINE.bottom.x, bottomY + ZIPLINE.bottomHeight, ZIPLINE.bottom.z);
  const length = A.distanceTo(B), hLen = Math.hypot(B.x - A.x, B.z - A.z);
  const heading = Math.atan2(B.x - A.x, B.z - A.z);
  const dirX = Math.sin(heading), dirZ = Math.cos(heading), cosH = Math.cos(heading), sinH = Math.sin(heading);
  const root = new THREE.Group(); scene.add(root);
  // A point given in the tower's (or the landing frame's) own coordinates: x across the cable, z along it.
  const local = (o, lx, lz, out) => { out.x = o.x + lx * cosH + lz * sinH; out.z = o.z - lx * sinH + lz * cosH; return out; };
  const deckTop = topY - 0.02 + PLATFORM + 0.06, matTop = bottomY + 0.3;

  // ---- Launch tower on the summit
  {
    const g = new THREE.Group(); g.position.set(A.x, topY - 0.02, A.z); g.rotation.y = heading; root.add(g);
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sz] of legs) g.add(stick([sx * 1.15, 0, sz * 1.15], [sx * 0.95, ZIPLINE.topHeight + 0.5, sz * 0.95], 0.07, BAMBOO));
    for (const y of [0.7, 1.7]) for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) g.add(stick([legs[a][0] * 1.1, y, legs[a][1] * 1.1], [legs[b][0] * 1.05, y + 0.85, legs[b][1] * 1.05], 0.035, BAMBOO));
    g.add(box(2.3, 0.12, 2.3, 0xb98a5e, 0, PLATFORM, 0));
    // Hand rails down both sides and across the back, with a gap where the ladder comes up.
    for (const s of [-1, 1]) g.add(stick([s * 1.0, PLATFORM + 0.95, -1.0], [s * 1.0, PLATFORM + 0.95, 1.0], 0.03, BAMBOO), stick([s * 1.0, PLATFORM + 0.95, -1.0], [s * 0.4, PLATFORM + 0.95, -1.0], 0.03, BAMBOO), stick([s * 0.4, PLATFORM, -1.0], [s * 0.4, PLATFORM + 0.95, -1.0], 0.03, BAMBOO));
    g.add(stick([-1.05, ZIPLINE.topHeight + 0.35, 0], [1.05, ZIPLINE.topHeight + 0.35, 0], 0.07, BAMBOO)); // the beam the cable hangs from
    g.add(cyl(0.12, 0.12, 0.3, DARK, 0, ZIPLINE.topHeight + 0.1, 0, 8));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.8, 4), shared(0xe8503a)); cap.rotation.y = Math.PI / 4; cap.position.y = ZIPLINE.topHeight + 1.0; cap.castShadow = true; g.add(cap);
    // Ladder up the back, a helmet rack and a crate of harnesses at the foot
    g.add(stick([-0.28, 0, -1.55], [-0.28, PLATFORM, -1.2], 0.035, BAMBOO), stick([0.28, 0, -1.55], [0.28, PLATFORM, -1.2], 0.035, BAMBOO));
    for (let k = 1; k < 7; k++) g.add(stick([-0.28, k * RUNG, -1.55 + k * 0.05], [0.28, k * RUNG, -1.55 + k * 0.05], 0.022, BAMBOO, 5));
    g.add(stick([1.8, 0, -1.3], [1.8, 1.1, -1.3], 0.03, BAMBOO), stick([1.8, 0, -0.1], [1.8, 1.1, -0.1], 0.03, BAMBOO), stick([1.8, 1.05, -1.4], [1.8, 1.05, 0], 0.025, BAMBOO));
    [0xe8503a, 0xf2b63b, 0x4f7fc9].forEach((col, k) => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), shared(col)); h.position.set(1.8, 1.07, -1.15 + k * 0.45); g.add(h); });
    g.add(box(0.6, 0.45, 0.45, 0xc79a62, -1.8, 0.23, -0.9, 0.3));
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12), shared(ROPE)); coil.rotation.x = Math.PI / 2; coil.position.set(-1.8, 0.52, -0.9); g.add(coil);
  }
  // The deck can be stood on (a circle inside the tower's footprint, so nobody walking past is lifted onto it).
  addPlatform({ shape: 'circle', x: A.x, z: A.z, r: 1.1, top: deckTop, surface: 'wood', id: 'zipline-deck' });

  // ---- Cable and safety line
  // A long cable hangs in a shallow curve rather than a straight line.
  const sagAt = (f) => ZIPLINE.sag * 4 * f * (1 - f);
  const curvePoints = (lift) => Array.from({ length: 33 }, (_, k) => { const f = k / 32; return new THREE.Vector3(A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f - sagAt(f) + lift, A.z + (B.z - A.z) * f); });
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePoints(0)), 64, 0.028, 6), shared(DARK)); cable.castShadow = true;
  root.add(cable, new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePoints(0.32)), 64, 0.012, 5), shared(ROPE)));
  const pointAt = (f, out) => { out.copy(A).lerp(B, f); out.y -= sagAt(f); return out; };
  // How steeply the cable falls at f (rise over distance along it).
  const slopeAt = (f) => ((B.y - A.y) - ZIPLINE.sag * 4 * (1 - 2 * f)) / length;

  // ---- Landing frame by the beach: an A-frame, a brake tyre, a brake block on the cable, a crash mat and a bench
  let pad, stripe;
  {
    const g = new THREE.Group(); g.position.set(B.x, bottomY - 0.02, B.z); g.rotation.y = heading; root.add(g);
    for (const s of [-1, 1]) { g.add(stick([s * 1.5, 0, 0.3], [0, ZIPLINE.bottomHeight + 0.35, 0.3], 0.07, BAMBOO), stick([s * 1.2, 0, 1.6], [0, ZIPLINE.bottomHeight + 0.2, 0.3], 0.05, BAMBOO)); }
    g.add(stick([-0.85, 1.25, 0.3], [0.85, 1.25, 0.3], 0.04, BAMBOO), cyl(0.11, 0.11, 0.3, DARK, 0, ZIPLINE.bottomHeight, 0.3, 8));
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 8, 14), shared(0x3f3f46)); tyre.position.set(0, ZIPLINE.bottomHeight - 0.02, -0.5); g.add(tyre);
    pad = box(2.6, 0.3, 3.6, 0x4f7fc9, 0, 0.17, -2.6); stripe = box(2.6, 0.05, 0.5, 0xf2c94c, 0, 0.34, -1.2); g.add(pad, stripe);
    g.add(box(1.5, 0.07, 0.36, 0xb98a5e, 2.6, 0.42, -1.5, 0.3), box(0.08, 0.4, 0.3, 0x8c6444, 2.1, 0.2, -1.65, 0.3), box(0.08, 0.4, 0.3, 0x8c6444, 3.1, 0.2, -1.35, 0.3));
    g.add(cyl(0.035, 0.04, 2.8, BAMBOO, -2.3, 1.4, 0.6));
    const pen = new THREE.Mesh(roofGeometry(0.5, 0.85, 0.02), shared(0xe8503a)); pen.rotation.z = -Math.PI / 2; pen.position.set(-2.25, 2.5, 0.6); g.add(pen);
  }
  // ---- Safety catch net just past the brake tyre: two posts, a top rope, guy ropes and a sagging diamond mesh.
  {
    const NZ = ZIPLINE.net.lz, NX = ZIPLINE.net.hw, POST = 3.7, NET_TOP = POST - 0.3, p = { x: 0, z: 0 };
    const ground = (lx, lz) => { local(B, lx, lz, p); return heightAt(p.x, p.z); };
    const g = new THREE.Group(); g.position.set(B.x, 0, B.z); g.rotation.y = heading; root.add(g);
    const tops = [];
    for (const s of [-1, 1]) {
      const gy = ground(s * NX, NZ); tops.push(gy + POST);
      g.add(cyl(0.09, 0.12, POST + 0.4, 0xb98a5e, s * NX, gy + POST / 2 - 0.2, NZ, 8));
      g.add(cyl(0.12, 0.12, 0.06, DARK, s * NX, gy + POST - 0.05, NZ, 8)); // cap ring
      for (const [ax, az] of [[s * (NX + 1.3), NZ + 1.9], [s * (NX - 0.2), NZ + 2.3]]) // guy ropes back to pegs in the sand
        g.add(stick([s * NX, gy + POST - 0.12, NZ], [ax, ground(ax, az) + 0.05, az], 0.014, ROPE, 4), cyl(0.03, 0.03, 0.3, 0x8c6444, ax, ground(ax, az) + 0.1, az, 5));
    }
    const topAt = (f) => tops[0] + (tops[1] - tops[0]) * f - 0.3 - 0.0; // top rope height (before sag)
    const SAG = 0.32;
    // The top and bottom ropes follow the same sag as the mesh hangs from.
    const ropePts = (fn) => Array.from({ length: 13 }, (_, k) => { const f = k / 12; return new THREE.Vector3(-NX + 2 * NX * f, fn(f), NZ); });
    const topRope = (f) => topAt(f) - SAG * 4 * f * (1 - f);
    const botRope = (f) => ground(-NX + 2 * NX * f, NZ) + 0.4;
    for (const fn of [topRope, botRope]) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePts(fn)), 24, 0.02, 4), shared(ROPE)));
    // A "BRAKE ZONE" board: red with a white band, lashed to the top rope's middle.
    g.add(box(1.1, 0.4, 0.04, 0xd9452f, 0, topRope(0.5) - 0.45, NZ - 0.07), box(1.0, 0.1, 0.045, 0xf4efe2, 0, topRope(0.5) - 0.45, NZ - 0.075));
    mergeStatic(g);
    // The net: nodes on a lattice, joined diagonally so the openings are diamonds.
    const COLS = 18, ROWS = 12, pos = [];
    const node = (i, j) => { const f = i / COLS, v = j / ROWS, x = -NX + 2 * NX * f; const y0 = topRope(f), y1 = botRope(f);
      return [x, y0 + (y1 - y0) * v, NZ - Math.sin(Math.PI * f) * Math.sin(Math.PI * Math.min(1, v * 0.8 + 0.1)) * 0.25]; };
    for (let i = 0; i < COLS; i++) for (let j = 0; j <= ROWS; j++) if ((i + j) % 2 === 0) for (const dj of [-1, 1]) {
      const j2 = j + dj; if (j2 < 0 || j2 > ROWS) continue;
      pos.push(...node(i, j), ...node(i + 1, j2));
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: ROPE });
    mat.onBeforeCompile = (shader) => { // the shared wind pushes the middle of the net gently to and fro
      shader.uniforms.uWind = WIND;
      shader.vertexShader = 'uniform vec4 uWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { float edge = 1.0 - pow(abs(position.x) / ${NX.toFixed(2)}, 4.0);
          transformed.z += sin(uWind.w * 1.2 + position.x * 0.8 + position.y * 0.5) * (0.03 + 0.22 * uWind.z) * edge; }`);
    };
    const mesh = new THREE.LineSegments(geo, mat); mesh.frustumCulled = false; g.add(mesh);
  }

  const matCentre = local(B, 0, -2.6, { x: 0, z: 0 });
  const mat = addPlatform({ shape: 'box', x: matCentre.x, z: matCentre.z, rot: heading, hw: 1.3, hd: 1.8, top: matTop, surface: 'wood', id: 'zipline-mat' });
  let matSquash = 0, matWobble = 0, matWobbleV = 0;
  function setMat(squash) {
    const h = Math.max(0.12, 0.3 - squash);
    pad.scale.y = h / 0.3; pad.position.y = 0.02 + h / 2; stripe.position.y = 0.04 + h; mat.top = bottomY + h;
  }

  // The brake block: a rubber buffer threaded on the cable, tied back to the frame with a bungee.
  const UP = new THREE.Vector3(0, 1, 0);
  const fBlock = 1 - 1.9 / hLen, sStop = fBlock * length - 0.27; // where the trolley's nose meets the block
  const blockAt = pointAt(fBlock, new THREE.Vector3());
  const tangent = new THREE.Vector3(B.x - A.x, (B.y - A.y) - ZIPLINE.sag * 4 * (1 - 2 * fBlock), B.z - A.z).normalize();
  const block = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 10), shared(RUBBER)); block.castShadow = true;
  block.quaternion.setFromUnitVectors(UP, tangent); root.add(block);
  const bungeeGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 5);
  const bungee = new THREE.Mesh(bungeeGeo, shared(0x2f2f36)); root.add(bungee);
  const bungeeEnd = local(B, 0, 0.18, new THREE.Vector3()); bungeeEnd.y = B.y - 0.02;
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  // Stretches a unit-long cylinder from a to b.
  function span(mesh, a, b) {
    vc.subVectors(b, a); const len = vc.length();
    mesh.position.addVectors(a, b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(UP, vc.multiplyScalar(1 / Math.max(len, 1e-4))); mesh.scale.set(1, len, 1);
  }
  let blockX = 0; // how far the block is pushed along the cable (m)
  function placeBlock() {
    block.position.copy(blockAt).addScaledVector(tangent, blockX);
    va.copy(block.position).addScaledVector(tangent, 0.12); span(bungee, va, bungeeEnd);
  }
  placeBlock();

  // One NPC ride down the cable: quick away, fast in the middle, braking into the frame.
  const fStop = sStop / length;
  function advance(ride, dt) {
    ride.v = ride.f < 0.925 ? Math.min(12.5, ride.v + 4.5 * dt) : Math.max(2.4, ride.v - 15 * dt);
    ride.f = Math.min(fStop, ride.f + (ride.v * dt) / length);
    return ride.f >= fStop;
  }
  const trolleyGeo = new THREE.BoxGeometry(0.16, 0.12, 0.3);
  const makeTrolley = () => { const t = new THREE.Group(); t.add(new THREE.Mesh(trolleyGeo, shared(DARK)), stick([0, -0.06, 0], [0, -0.32, 0], 0.012, ROPE), stick([-0.2, -0.32, 0], [0.2, -0.32, 0], 0.02, BAMBOO)); t.visible = false; t.rotation.y = heading; root.add(t); return t; };

  // ---- Scouts on a loop: queue, climb the tower, ride, land, walk back up the hill
  const landing = { x: B.x - dirX * 2.4, z: B.z - dirZ * 2.4 };
  const route = RIDER_ROUTE;
  const SKIN = [0xf1c7a0, 0x9a6a4a, 0xe6b48a, 0xc98d62], HELMET = [0xe8503a, 0xf2b63b, 0x4f7fc9, 0x3f8f6a];
  const riders = [0, 1, 2, 3, 4, 5].map((i) => {
    const figure = createFigure({ bodyColor: 0xd8c08a, neckerchief: HELMET[(i + 1) % 4], skinColor: SKIN[i % 4], hairColor: 0x3d3230, shortsColor: 0x5f7fa6, accent: 'cap', accentColor: HELMET[i % 4] });
    scene.add(figure.group);
    const r = { i, figure, trolley: makeTrolley(), state: 'walk', leg: 0, x: 0, z: 0, y: 0, rot: 0, t: 0, ride: null, cheer: 0 };
    // Start them spread out along the way back up, the first already waiting at the top.
    if (i === 0) { r.state = 'wait'; r.x = ZIPLINE.queue.x; r.z = ZIPLINE.queue.z; }
    else { r.leg = Math.min(route.length - 1, 1 + Math.floor(((i - 1) * (route.length - 1)) / 5)); r.x = route[r.leg - 1].x; r.z = route[r.leg - 1].z; }
    return r;
  });
  let launchTimer = 2, cableBusy = false, open = true;
  const tmp = new THREE.Vector3();

  // ---- The player's own ride
  // The trolley the player rides, its lanyard (a few rope segments drawn in one go), the hook, and the harness band.
  const myTrolley = new THREE.Group();
  myTrolley.add(new THREE.Mesh(trolleyGeo, shared(DARK)), cyl(0.05, 0.05, 0.04, STEEL, 0, 0.08, 0.08, 10), cyl(0.05, 0.05, 0.04, STEEL, 0, 0.08, -0.08, 10));
  myTrolley.children[1].rotation.z = myTrolley.children[2].rotation.z = Math.PI / 2;
  myTrolley.rotation.y = heading; root.add(myTrolley);
  const lanyard = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.013, 0.013, 1, 5), shared(HARNESS), SEG);
  lanyard.frustumCulled = false; root.add(lanyard);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.01, 6, 12), shared(STEEL)); root.add(hook);
  const harness = new THREE.Group(); harness.rotation.order = 'YXZ'; harness.visible = false; root.add(harness);
  { const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 16), shared(HARNESS)); band.rotation.x = Math.PI / 2; band.scale.set(1, 0.88, 1); band.position.y = 0.5; harness.add(band); }
  // Wind streaks: short lines hanging still in the air that the rider rushes past.
  const streakPos = new Float32Array(STREAKS * 6), streakBase = new Float32Array(STREAKS * 3);
  const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const streaks = new THREE.LineSegments(streakGeo, streakMat); streaks.frustumCulled = false; streaks.visible = false; root.add(streaks);

  // Everything about the ride in progress, made once and reused every frame.
  const gesture = { name: '', u: 0 };
  const ro = { pose: undefined, gesture: null, mood: undefined, air: undefined, land: 0, kick: 0, tuck: 0, climb: 0, squat: 0 };
  const riding = { heading, speed: 0, pitch: 0, roll: 0, opts: ro };
  const me = {
    phase: 'idle', t: 0, yaw: heading, x: 0, y: 0, z: 0, foot: { x: 0, z: 0 }, aim: { x: 0, z: 0 },
    f: 0, s: 0, v: 0, a: 0, th: 0, thv: 0, ph: 0, phv: 0, twist: 0, lan: STOWED, attached: false, hookT: 0,
    vy: 0, vx: 0, vz: 0, bounces: 0, contact: 0, vin: 0, cheers: 0, cheerT: 0, cheered: false, hit: 0, vHit: 0, retract: 0, clicked: false, dropPitch: 0, dropRoll: 0,
  };
  const f0 = 0.8 / hLen;                        // where the trolley waits, above the edge of the deck
  const stand = local(A, 0, 0.8, { x: 0, z: 0 }); // where the scout stands to clip on
  const trolleyPt = new THREE.Vector3(), hookTop = new THREE.Vector3(), hookPt = new THREE.Vector3(), belt = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ'), mtx = new THREE.Matrix4(), quat = new THREE.Quaternion(), scl = new THREE.Vector3(1, 1, 1);
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), mid = new THREE.Vector3();

  function parkTrolley(f) { me.f = f; me.s = f * length; me.v = 0; pointAt(f, trolleyPt); }
  parkTrolley(f0);
  const setPose = (pose, mood) => { ro.pose = pose; ro.mood = mood; ro.gesture = null; ro.air = undefined; ro.land = 0; };
  const doGesture = (name, u) => { gesture.name = name; gesture.u = u; ro.gesture = gesture; };
  const go = (phase) => { me.phase = phase; me.t = 0; };
  const turnTo = (want, dt, rate = 8) => { let d = want - me.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); me.yaw += d * (1 - Math.exp(-dt * rate)); };
  // Walk toward a point on the ground; true once there.
  function walkTo(p, dt, speed = WALK) {
    const dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz);
    if (d < 0.04) { me.x = p.x; me.z = p.z; riding.speed = 0; return true; }
    const step = Math.min(d, speed * dt); me.x += (dx / d) * step; me.z += (dz / d) * step;
    turnTo(Math.atan2(dx, dz), dt); riding.speed = speed; me.y = groundAt(me.x, me.z);
    return false;
  }
  // Where the belt is, in the world, for the body's current place and tilt.
  function beltWorld(out) { euler.set(riding.pitch, me.yaw, riding.roll, 'YXZ'); return out.copy(BELT).applyEuler(euler).add(p0.set(me.x, me.y, me.z)); }
  // A gusty breeze across the cable: a few slow waves, now stronger, now weaker (m/s² on the hanging body).
  const gust = (t) => (Math.sin(t * 0.9) + 0.6 * Math.sin(t * 2.3 + 1.3) + 0.35 * Math.sin(t * 4.1 + 0.5)) * (0.55 + 0.45 * Math.sin(t * 0.31 + 0.7));

  // The trolley and the swinging body, stepped in small fixed steps so the brake block's spring stays steady.
  function physics(dt, elapsed, brakeOn) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) {
      const f = me.s / length;
      let a = -G * slopeAt(f) - DRAG * me.v * Math.abs(me.v);
      if (brakeOn && me.v > ARRIVE && sStop - me.s < (me.v * me.v - ARRIVE * ARRIVE) / (2 * (BRAKE - 1.3)) + 0.4) a -= BRAKE;
      const pen = me.s - sStop;
      if (pen > 0) { a -= BLOCK_K * pen + BLOCK_C * me.v; if (me.hit === 0) { me.hit = elapsed; me.vHit = me.v; audio.play('door'); } }
      me.v += a * h; me.s += me.v * h; me.a = a;
      // The body swings like a pendulum hung from the trolley: left behind as it speeds up, flung forward as it
      // stops, pushed back by the air at speed and rocked sideways by the gusts.
      const w2 = G / PEND;
      me.thv += (-w2 * Math.sin(me.th) - (a / PEND) * Math.cos(me.th) - (BODY_DRAG * me.v * Math.abs(me.v)) / PEND - SWING_DAMP * me.thv) * h;
      me.phv += (-w2 * Math.sin(me.ph) + (gust(elapsed) * 0.9 * Math.min(1, 0.3 + Math.abs(me.v) / 8)) / PEND - SWING_DAMP * me.phv) * h;
      me.th = THREE.MathUtils.clamp(me.th + me.thv * h, -1.2, 1.2); me.ph = THREE.MathUtils.clamp(me.ph + me.phv * h, -0.6, 0.6);
    }
    blockX = Math.max(0, me.s - sStop);
    me.f = me.s / length; pointAt(me.f, trolleyPt);
  }
  // Hangs the body from the hook at the end of the lanyard, tilted along the swing.
  function hangBody() {
    const lx = LAN * Math.sin(me.ph), ly = -LAN * Math.cos(me.th) * Math.cos(me.ph), lz = LAN * Math.sin(me.th) * Math.cos(me.ph);
    hookPt.set(trolleyPt.x + lx * cosH + lz * sinH, trolleyPt.y - HOOK_DROP + ly, trolleyPt.z - lx * sinH + lz * cosH);
    riding.pitch = -me.th; riding.roll = me.ph;
    euler.set(riding.pitch, me.yaw, riding.roll, 'YXZ');
    p0.copy(BELT).applyEuler(euler);
    me.x = hookPt.x - p0.x; me.y = hookPt.y - p0.y; me.z = hookPt.z - p0.z;
  }

  // Draws the lanyard from the trolley to the hook, sagging when it is slack, and puts the hook and harness in place.
  function drawGear(elapsed) {
    myTrolley.position.copy(trolleyPt);
    hookTop.set(trolleyPt.x, trolleyPt.y - HOOK_DROP, trolleyPt.z);
    if (!me.attached && me.hookT <= 0) {
      // Wound up (or hanging loose): it dangles straight below the trolley, stirring in the breeze.
      const sw = Math.sin(elapsed * 1.7) * 0.05;
      hookPt.set(hookTop.x + sw * cosH, hookTop.y - me.lan, hookTop.z - sw * sinH);
    }
    const d = hookTop.distanceTo(hookPt), slack = 0.5 * Math.sqrt(Math.max(0, me.lan * me.lan - d * d));
    for (let i = 0; i < SEG; i++) {
      const u0 = i / SEG, u1 = (i + 1) / SEG;
      p0.lerpVectors(hookTop, hookPt, u0); p0.y -= slack * 4 * u0 * (1 - u0);
      p1.lerpVectors(hookTop, hookPt, u1); p1.y -= slack * 4 * u1 * (1 - u1);
      vc.subVectors(p1, p0); const len = Math.max(1e-4, vc.length());
      mid.addVectors(p0, p1).multiplyScalar(0.5); quat.setFromUnitVectors(UP, vc.multiplyScalar(1 / len)); scl.set(1, len + 0.01, 1);
      lanyard.setMatrixAt(i, mtx.compose(mid, quat, scl));
    }
    lanyard.instanceMatrix.needsUpdate = true;
    hook.position.copy(hookPt); hook.rotation.set(0, me.yaw + Math.PI / 2, 0);
    if (harness.visible) { harness.position.set(me.x, me.y, me.z); harness.rotation.set(riding.pitch, me.yaw, riding.roll, 'YXZ'); }
  }

  // Wind streaks rushing past while riding fast.
  function respawnStreak(i, ahead) {
    const s = (Math.random() - 0.5) * 2.2, up = 0.1 + Math.random() * 1.5, fwd = ahead ? 3 + Math.random() * 4 : -1.5 + Math.random() * 7;
    streakBase[i * 3] = me.x + dirX * fwd + s * cosH; streakBase[i * 3 + 1] = me.y + up - fwd * 0.2; streakBase[i * 3 + 2] = me.z + dirZ * fwd - s * sinH;
  }
  function drawStreaks(speed) {
    const k = THREE.MathUtils.clamp((speed - 2.5) / 7, 0, 1);
    streakMat.opacity = 0.85 * k; streaks.visible = k > 0.02;
    if (!streaks.visible) return;
    const len = 0.2 * speed;
    for (let i = 0; i < STREAKS; i++) {
      const bx = streakBase[i * 3], by = streakBase[i * 3 + 1], bz = streakBase[i * 3 + 2];
      if ((bx - me.x) * dirX + (bz - me.z) * dirZ < -2) { respawnStreak(i, true); i--; continue; }
      streakPos[i * 6] = bx; streakPos[i * 6 + 1] = by; streakPos[i * 6 + 2] = bz;
      streakPos[i * 6 + 3] = bx - dirX * len; streakPos[i * 6 + 4] = by + 0.28 * len; streakPos[i * 6 + 5] = bz - dirZ * len;
    }
    streakGeo.attributes.position.needsUpdate = true;
  }

  // One frame of the player's ride: walk to the ladder, climb, clip on, ride, stop, unclip, drop and bounce.
  function ridePlayer(dt, elapsed, player) {
    me.t += dt;
    let brakeOn = false;
    riding.speed = 0; riding.pitch = 0; riding.roll = 0; ro.kick = 0; ro.tuck = 0;
    switch (me.phase) {
      case 'walk': // over to the foot of the ladder
        setPose(undefined, undefined);
        if (walkTo(me.foot, dt)) { turnTo(heading, dt, 10); if (Math.abs(Math.atan2(Math.sin(heading - me.yaw), Math.cos(heading - me.yaw))) < 0.05 || me.t > 6) { me.yaw = heading; go('climb'); } }
        break;
      case 'climb': { // up the ladder a rung at a time, then up onto the deck
        const c = Math.min(7, me.t / RUNG_TIME), k = Math.floor(c), u = c - k, s = u * u * (3 - 2 * u), rung = Math.min(7, k + s);
        setPose('climb', 'happy'); ro.climb = c; ro.air = 0;
        const base = topY - 0.02, ground = groundAt(me.foot.x, me.foot.z);
        if (rung <= 6) {
          local(A, 0, -1.55 + 0.05 * rung - 0.22, me.aim); me.y = base + RUNG * rung + (ground - base) * Math.max(0, 1 - rung);
        } else { // the last step: up and forward over the top of the ladder onto the deck
          local(A, 0, -1.47 + 0.62 * (rung - 6), me.aim); me.y = base + RUNG * 6 + (deckTop - base - RUNG * 6) * (rung - 6);
        }
        me.x = me.aim.x; me.z = me.aim.z; me.yaw = heading;
        if (Math.floor(me.t / RUNG_TIME) !== Math.floor((me.t - dt) / RUNG_TIME)) audio.play('step:wood');
        if (c >= 7) { me.y = deckTop; go('deck'); }
        break;
      }
      case 'deck': // across the deck to the edge, under the waiting trolley
        setPose(undefined, 'happy');
        if (walkTo(stand, dt, 1.1)) { turnTo(heading, dt, 10); if (me.t > 0.4 && Math.abs(Math.atan2(Math.sin(heading - me.yaw), Math.cos(heading - me.yaw))) < 0.05) { me.yaw = heading; go('clip'); } }
        me.y = deckTop;
        break;
      case 'clip': { // reach up for the hook, pull the lanyard down, clip it to the harness and tug to check
        const u = Math.min(1, me.t / CLIP_TIME);
        setPose(undefined, u > 0.75 ? 'joy' : 'happy'); doGesture('clip', u);
        me.y = deckTop;
        harness.visible = u > 0.3;
        if (u > 0.2) {
          // The hook goes from the trolley, in the reaching hands, down to the belt.
          const k = THREE.MathUtils.smoothstep(u, 0.2, 0.5);
          me.lan = STOWED + (LAN - STOWED) * k; me.hookT = 1;
          beltWorld(belt); hookPt.set(hookTop.x, hookTop.y - STOWED - 0.05, hookTop.z).lerp(belt, k);
        }
        if (u > 0.55 && !me.clicked) { me.clicked = true; audio.play('click'); }
        if (u >= 1) { me.attached = true; go('launch'); }
        break;
      }
      case 'launch': { // sit back into the harness, lift the knees, and away
        const u = Math.min(1, me.t / 0.55);
        setPose('ride', 'joy'); ro.air = 0; ro.tuck = u;
        me.th = 0.12 * (1 - u); me.thv = 0; hangBody();
        if (u < 1) { me.y += (deckTop - me.y) * (1 - u) * (1 - u); break; }
        go('ride'); me.v = 0.9; me.th = 0.05; audio.play('zip'); audio.play('cheer');
        for (let i = 0; i < STREAKS; i++) respawnStreak(i, false);
        break;
      }
      case 'ride': case 'settle': { // down the cable, the body swinging under it; then the stop at the brake block
        brakeOn = true;
        physics(dt, elapsed, brakeOn);
        me.yaw = heading + Math.sin(elapsed * 0.7) * 0.08 + me.phv * 0.12; // turning a little on the lanyard
        hangBody();
        setPose('ride', me.hit && elapsed - me.hit < 0.5 ? 'surprised' : 'joy'); ro.air = 0;
        ro.tuck = Math.max(0, 1 - me.t / 1.2);
        ro.kick = me.phase === 'ride' ? Math.pow(Math.max(0, Math.sin(me.t * 0.85 + 2.2)), 3) : Math.max(0, 1 - me.t) * 0.6;
        // A whoop and both arms up, twice on the way down, and once more after the stop.
        const cheerAt = me.cheers === 0 ? 0.2 : me.cheers === 1 ? 0.56 : 2;
        if (me.phase === 'ride' && me.f > cheerAt) { me.cheers++; me.cheerT = elapsed; audio.play(me.cheers === 1 ? 'cheer' : 'laugh'); }
        if (me.cheerT && elapsed - me.cheerT < 1.5) doGesture('cheer', (elapsed - me.cheerT) / 1.5);
        if (me.phase === 'ride' && me.hit) { go('settle'); me.cheerT = 0; }
        if (me.phase === 'settle') {
          if (me.t > 1.2 && me.t < 2.6 && !me.cheerT) { me.cheerT = elapsed; audio.play('laugh'); }
          if (me.t > SETTLE_TIME) go('unclip');
        }
        break;
      }
      case 'unclip': { // feel for the gate, squeeze it open, let go
        const u = Math.min(1, me.t / UNCLIP_TIME);
        physics(dt, elapsed, true);
        me.thv *= Math.exp(-dt * 2.5); me.phv *= Math.exp(-dt * 2.5); // steadying themselves for the drop
        hangBody();
        setPose('ride', 'happy'); ro.air = 0; doGesture('unclip', u);
        if (u >= 0.55) {
          // Let go: the lanyard winds back up into the trolley and the scout drops.
          audio.play('click'); me.attached = false; harness.visible = false; me.hookT = 0; me.lan = LAN;
          me.vx = (me.thv * Math.cos(me.th) * dirX + me.phv * cosH) * PEND * 0.5; me.vz = (me.thv * Math.cos(me.th) * dirZ - me.phv * sinH) * PEND * 0.5; me.vy = 0;
          me.dropPitch = riding.pitch; me.dropRoll = riding.roll; me.retract = 1;
          go('drop'); gesture.u = u;
        }
        break;
      }
      case 'drop': case 'bounce': { // falling onto the mat, then a bounce or two
        physics(dt, elapsed, true);
        const fall = Math.exp(-me.t * 9);
        riding.pitch = (me.dropPitch || 0) * fall; riding.roll = (me.dropRoll || 0) * fall; me.yaw = heading;
        if (gesture.u < 1) { gesture.u = Math.min(1, gesture.u + dt / UNCLIP_TIME); }
        if (me.contact > 0) {
          // On the mat: it gives under the scout and throws them back up.
          me.contact += dt;
          const T = 0.16, u = Math.min(1, me.contact / T), depth = Math.min(0.17, (me.vin * T) / Math.PI);
          matSquash = depth * Math.sin(u * Math.PI); me.y = matTop - matSquash - matWobble;
          setPose('squat', 'joy'); ro.air = 0; ro.squat = 0.45 + 0.55 * Math.sin(u * Math.PI) * Math.min(1, me.vin / 3); ro.land = 1;
          if (u >= 1) {
            me.contact = 0; matSquash = 0; matWobbleV -= me.vin * 0.25;
            const out = me.vin * MAT_REST;
            if (out < 0.8 || me.bounces >= 2) { go('rest'); break; }
            me.vy = out; me.bounces++; me.y = matTop; if (me.bounces === 2) audio.play('squeak');
          }
        } else {
          me.vy -= G * dt; me.x += me.vx * dt; me.z += me.vz * dt; me.y += me.vy * dt;
          me.vx *= Math.exp(-dt * 3); me.vz *= Math.exp(-dt * 3);
          setPose(undefined, me.phase === 'drop' ? 'surprised' : 'joy'); ro.air = THREE.MathUtils.clamp(me.vy / 3, -1, 1);
          if (me.phase === 'drop') { ro.gesture = gesture; gesture.name = 'unclip'; }
          if (me.y <= mat.top && me.vy < 0) {
            me.vin = -me.vy; me.contact = 1e-4; me.y = matTop;
            if (me.phase === 'drop') { go('bounce'); audio.play('sit'); }
          }
        }
        break;
      }
      case 'rest': { // a moment crouched on the mat, then up onto their feet with a cheer
        physics(dt, elapsed, true);
        me.y = mat.top; me.yaw = heading;
        const up = THREE.MathUtils.smoothstep(me.t, 0.35, 1.0);
        setPose('squat', 'joy'); ro.air = 0; ro.squat = 0.6 * (1 - up);
        if (me.t > 1.0) { setPose(undefined, 'joy'); ro.air = undefined; doGesture('cheer', Math.min(1, (me.t - 1.0) / 1.1)); }
        if (me.t > 1.0 && !me.cheered) { me.cheered = true; audio.play('cheer'); }
        if (me.t > 2.1) { local(B, -2.1, -2.3, me.aim); go('off'); }
        break;
      }
      case 'off': // step off the side of the mat; then the player has the controls back
        physics(dt, elapsed, true);
        setPose(undefined, 'happy');
        if (walkTo(me.aim, dt)) {
          me.phase = 'idle'; player.position.set(me.x, groundAt(me.x, me.z), me.z); player.riding = null; return;
        }
        break;
    }
    // The lanyard winds back up once let go.
    if (me.retract > 0) { me.retract = Math.max(0, me.retract - dt / 0.6); me.lan = STOWED + (LAN - STOWED) * me.retract; }
    if (me.attached) beltWorld(hookPt); // clipped to the belt
    // The block springs back out once the trolley stops leaning on it.
    placeBlock();
    drawGear(elapsed);
    drawStreaks(me.phase === 'ride' || me.phase === 'settle' ? Math.abs(me.v) : 0);
    riding.heading = me.yaw;
    player.position.set(me.x, me.y, me.z);
  }

  const interactables = [{
    id: 'zipline', kind: 'zipline', position: { x: A.x - dirX * 1.9, z: A.z - dirZ * 1.9 }, markerY: topY + 2.2,
    get enabled() { return me.phase === 'idle'; },
    prompt: () => 'E — ride the flying fox',
    interact() {
      const p = deps.player.position;
      me.x = p.x; me.z = p.z; me.y = p.y; me.yaw = deps.player.heading;
      local(A, 0, -1.77, me.foot);
      me.attached = false; me.hookT = 0; me.lan = STOWED; me.hit = 0; me.cheers = 0; me.cheerT = 0; me.cheered = false; me.bounces = 0; me.contact = 0; me.clicked = false; me.retract = 0;
      me.th = me.thv = me.ph = me.phv = 0; parkTrolley(f0); blockX = 0; harness.visible = false;
      go('walk'); deps.player.riding = riding;
      ui.emote(new THREE.Vector3(A.x, A.y + 0.6, A.z), 'star');
    },
  }];

  return {
    interactables,
    // Where the player's ride is up to (for scripted checks): phase, time in it, trolley position along the cable.
    get rideState() { return { phase: me.phase, t: me.t, f: me.f, v: me.v, vHit: me.vHit, th: me.th, ph: me.ph, x: me.x, y: me.y, z: me.z }; },
    // The flying fox only runs during lessons and free time.
    setOpen(on) { open = on; },
    update(dt, elapsed, player) {
      if (me.phase !== 'idle') ridePlayer(dt, elapsed, player);
      else {
        // Left at the bottom after a ride, the trolley is hauled back up once nobody is watching.
        if (me.f > 0.5 && Math.hypot(player.position.x - B.x, player.position.z - B.z) > 14) { parkTrolley(f0); me.lan = STOWED; }
        if (blockX > 0) { blockX = Math.max(0, blockX - dt * 0.5); placeBlock(); }
        drawGear(elapsed); streaks.visible = false;
      }
      // The mat settles with a little wobble after a bounce.
      matWobbleV += (-260 * matWobble - 9 * matWobbleV) * Math.min(dt, 0.05); matWobble += matWobbleV * Math.min(dt, 0.05);
      if (matSquash > 0 || Math.abs(matWobble) > 1e-4 || Math.abs(matWobbleV) > 1e-3) setMat(matSquash + matWobble);

      launchTimer -= dt;
      for (const r of riders) {
        let speed = 0, opts = {};
        if (r.state === 'walk') {
          const target = route[r.leg], dx = target.x - r.x, dz = target.z - r.z, d = Math.hypot(dx, dz);
          if (d < 0.25) { r.leg++; if (r.leg >= route.length) { r.state = 'wait'; r.leg = 0; } }
          else { speed = 2.4; r.x += (dx / d) * speed * dt; r.z += (dz / d) * speed * dt; r.rot = Math.atan2(dx, dz); }
          r.y = groundAt(r.x, r.z);
        } else if (r.state === 'wait') {
          r.y = groundAt(r.x, r.z); r.rot = heading;
          if (open && launchTimer <= 0 && !cableBusy) { r.state = 'climb'; r.t = 0; cableBusy = true; launchTimer = 9; }
        } else if (r.state === 'climb') {
          // Up the ladder at the back of the tower and onto the deck.
          r.t += dt / 1.6;
          const k = Math.min(1, r.t), e = k * k * (3 - 2 * k);
          r.x = ZIPLINE.queue.x + (A.x - dirX * 0.4 - ZIPLINE.queue.x) * e; r.z = ZIPLINE.queue.z + (A.z - dirZ * 0.4 - ZIPLINE.queue.z) * e;
          r.y = topY + PLATFORM * e; r.rot = heading; speed = 1.2;
          if (k >= 1) { r.state = 'ride'; r.ride = { f: 0.02, v: 2.5 }; if (Math.hypot(player.position.x - A.x, player.position.z - A.z) < 18) audio.play('zip'); }
        } else if (r.state === 'ride') {
          const done = advance(r.ride, dt);
          pointAt(r.ride.f, tmp);
          r.x = tmp.x; r.z = tmp.z; r.y = tmp.y - HANG; r.rot = heading; opts = { pose: 'hang' };
          r.trolley.visible = true; r.trolley.position.copy(tmp);
          if (done) { r.state = 'landed'; r.t = 0; r.trolley.visible = false; cableBusy = false; r.x = landing.x; r.z = landing.z; r.y = groundAt(r.x, r.z); }
        } else if (r.state === 'landed') {
          // A cheer on the crash mat, then off back up the hill.
          r.t += dt; r.rot = heading + Math.PI;
          opts = { land: Math.max(0, 1 - r.t * 3), gesture: { name: 'cheer', u: Math.min(1, r.t / 1.3) } };
          if (r.t > 1.4) { r.state = 'walk'; r.leg = 0; }
        }
        r.figure.group.position.set(r.x, r.y, r.z);
        r.figure.group.rotation.y = r.rot;
        r.figure.animate(speed, elapsed, opts);
      }
    },
  };
}
