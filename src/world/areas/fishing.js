// The scouts' fishing dock on the camp bank of the river, above the bridge (AREAS.fishingDock), and the
// people who fish from it. Made by riverside.js (create), which hands on its colliders, interactables and update.
//
// The dock: planks on posts, a bench across its end, rods leaning on a post, a bucket and a tackle box. It is
// a walkable platform (addPlatform), so the player and the fishers walk out on it. Round it: pebbles on the
// wet sand, a few more reeds; the lusher plants of the bank are grown by flora.js (its riverbank pass).
//
// The fishers are three scouts in the camp timetable (crowd.join, role 'fisher'): they fish in the lesson and
// free-time blocks, and go to the flag, lunch, the evening campfire and bed with everyone else. Their home
// carries a route (home.route: waypoints along the trails from the camp), so they walk there and back on the
// trail (AREAS.trails) instead of across country. While at home they sit with a rod out, the line in the
// water and a bobber riding the swell; now and then the bobber dips, the rod comes up and a small fish flicks
// out of the water, and they cheer.
import * as THREE from 'three';
import { AREAS } from '../../config.js';
import { createFigure } from '../../actors/figure.js';
import { liftFor, talkTo } from '../../actors/schedule.js';
import { buildReedClump, waterWave, rngFrom, lump } from '../../kit/river.js';
import { box, cyl, stick, mergeStatic } from '../build.js';
import { waterObstacles } from '../water.js';

const D = AREAS.fishingDock, DECK = 0.55, SEAT = 0.42; // deck top (world y) and the bench's seat height above it
const C = Math.cos(D.rot), S = Math.sin(D.rot);
// Dock coordinates (lx across, lz out along the dock from its landward end) to the world.
const toW = (lx, lz) => ({ x: D.x + C * lx + S * lz, z: D.z - S * lx + C * lz });
const BENCH_Z = D.length - 0.9;
// The trail from the camp to the dock: the first-aid tent's trail to the windmill knoll, the lake trail, the spur.
const [aid, lake, spur] = [AREAS.trails[2], AREAS.trails[0], AREAS.trails[4]];
const TO_DOCK = [...aid, lake[1], ...spur]; // the spur starts where the lake trail turns away from the river

const SHIRT = 0xd8c08a, SKIN = [0xc98d62, 0xf1c7a0, 0x9a6a4a], HAIR = [0x3d3230, 0x8a5a3c, 0x2f2826], SCARF = [0x4f7fc9, 0xe8503a, 0xf2b63b], SHORTS = [0x6f8f6a, 0x5f7fa6, 0x8a6a4a];
const ROD_LEN = 2.5;

export function create(scene, deps) {
  const { crowd, groundAt, heightAt, addPlatform, keepClear, audio, ui } = deps;
  const rnd = rngFrom(7731);
  const group = new THREE.Group(); group.name = 'fishing-dock'; scene.add(group);
  const colliders = [];

  // ---- the dock (built in dock coordinates, then welded)
  const dock = new THREE.Group();
  const PL = [0x9a7350, 0xb08663, 0x8c6444], DK = 0x6b4a33, POST = 0x7a5a3e;
  for (let z = 0.15, i = 0; z < D.length; z += 0.31, i++) dock.add(box(D.width + ((i * 7) % 3) * 0.04, 0.06, 0.27, PL[i % 3], ((i * 5) % 3 - 1) * 0.02, DECK - 0.03, z));
  for (const x of [-0.7, 0, 0.7]) dock.add(box(0.12, 0.14, D.length, DK, x, DECK - 0.13, D.length / 2));
  const posts = [0.5, 2.3, 4.1, D.length - 0.25];
  for (const z of posts) {
    dock.add(box(D.width + 0.25, 0.12, 0.14, DK, 0, DECK - 0.22, z));
    for (const s of [-1, 1]) {
      const end = z > D.length - 1, top = DECK + (end ? 0.35 : 0.05);
      dock.add(cyl(0.085, 0.1, top + 1.8, POST, s * (D.width / 2 + 0.05), (top - 1.8) / 2, z, 7));
      if (end) dock.add(cyl(0.075, 0.075, 0.12, 0x5d6b4a, s * (D.width / 2 + 0.05), DECK - 0.1, z, 7)); // weed at the waterline
    }
  }
  // The bench across the end, facing the water.
  dock.add(box(1.5, 0.06, 0.36, 0xb98a5e, 0, DECK + SEAT - 0.03, BENCH_Z));
  for (const x of [-0.62, 0.62]) for (const z of [-0.12, 0.12]) dock.add(box(0.07, SEAT - 0.06, 0.07, DK, x, DECK + (SEAT - 0.06) / 2, BENCH_Z + z));
  // Rods leaning on the second post, a bucket, a tackle box, a coil of rope, a bait tin.
  for (const [dx, dz, c] of [[0, 0, 0x9a6a3a], [0.12, 0.1, 0x6f8f5a]]) {
    dock.add(stick([0.62 + dx, DECK, 1.75 + dz], [0.98 + dx * 0.4, DECK + 2.1, 2.3 + dz], 0.016, c, 5));
    dock.add(cyl(0.035, 0.035, 0.05, 0x3a3f47, 0.66 + dx, DECK + 0.28, 1.82 + dz, 8));
  }
  dock.add(cyl(0.15, 0.12, 0.28, 0x4f7fc9, 0.6, DECK + 0.14, BENCH_Z - 0.75, 9), cyl(0.13, 0.13, 0.02, 0x2f4f6a, 0.6, DECK + 0.27, BENCH_Z - 0.75, 9));
  dock.add(stick([0.46, DECK + 0.28, BENCH_Z - 0.75], [0.6, DECK + 0.45, BENCH_Z - 0.75], 0.008, 0x5b5b63, 3), stick([0.6, DECK + 0.45, BENCH_Z - 0.75], [0.74, DECK + 0.28, BENCH_Z - 0.75], 0.008, 0x5b5b63, 3));
  dock.add(box(0.4, 0.16, 0.24, 0x3f8f6a, -0.55, DECK + 0.08, BENCH_Z - 0.85), box(0.42, 0.03, 0.26, 0x2f6f52, -0.55, DECK + 0.17, BENCH_Z - 0.85));
  for (let k = 0; k < 3; k++) dock.add(cyl(0.19 - k * 0.02, 0.19 - k * 0.02, 0.045, 0xd8c08a, -0.55, DECK + 0.02 + k * 0.04, 1.2, 10));
  dock.add(cyl(0.06, 0.06, 0.08, 0xc7c2b6, 0.25, DECK + 0.04, BENCH_Z - 0.95, 8));
  dock.position.set(D.x, 0, D.z); dock.rotation.y = D.rot; group.add(dock);
  mergeStatic(dock, { ao: { ground: (x, z) => Math.max(heightAt(x, z), -0.2) } });
  const mid = toW(0, D.length / 2);
  addPlatform({ shape: 'box', x: mid.x, z: mid.z, rot: D.rot, hw: D.width / 2, hd: D.length / 2 + 0.05, top: DECK, surface: 'wood', id: 'fishing-dock' });
  for (const x of [-0.7, 0.7]) { const p = toW(x, BENCH_Z); colliders.push({ x: p.x, z: p.z, r: 0.12 }); }
  for (const z of posts) for (const s of [-1, 1]) { const p = toW(s * (D.width / 2 + 0.05), z); if (heightAt(p.x, p.z) < 0.05) waterObstacles.add(p.x, p.z, 0.13, 1); }
  { const land = toW(0, -0.6); keepClear(land.x, land.z, 2.6); const m2 = toW(0, D.length / 2); keepClear(m2.x, m2.z, 3.4); }

  // ---- the bank seat: a stump a little downstream, with its own bucket
  const bankAt = { x: 43.69, z: -38.24, rot: 2.227 };
  const bankY = heightAt(bankAt.x, bankAt.z);
  {
    const g = new THREE.Group();
    g.add(cyl(0.21, 0.25, SEAT, 0x8c6444, 0, SEAT / 2, 0, 9), cyl(0.2, 0.2, 0.015, 0xd9b483, 0, SEAT + 0.005, 0, 9));
    g.add(cyl(0.14, 0.11, 0.26, 0xe8a03a, 0.45, 0.13, -0.2, 9));
    g.add(stick([-0.45, 0.02, -0.35], [-0.55, 1.6, 0.25], 0.015, 0x9a6a3a, 5)); // a spare rod propped on the stump
    // A bleached driftwood log lying along the bank behind.
    const log = new THREE.Mesh(lump(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 7, 3).rotateZ(Math.PI / 2), 0.2, 4), new THREE.MeshStandardMaterial({ color: 0xa8957a, roughness: 1, flatShading: true }));
    log.position.set(0.4, 0.1, -1.4); log.rotation.y = 0.3; log.castShadow = true; g.add(log);
    g.position.set(bankAt.x, bankY - 0.02, bankAt.z); g.rotation.y = bankAt.rot; group.add(g);
    mergeStatic(g, { ao: true });
    colliders.push({ x: bankAt.x, z: bankAt.z, r: 0.25 });
    keepClear(bankAt.x, bankAt.z, 1.8);
  }

  // ---- pebbles on the wet sand, reeds either side of the dock
  {
    const items = [];
    const R = AREAS.river;
    for (let n = 0; n < 900 && items.length < 170; n++) {
      // Along the camp bank from the bend above the dock down to the bridge.
      const i = 8 + Math.floor(rnd() * 3), a = R[i], b = R[i + 1], t = rnd();
      const len = Math.hypot(b.x - a.x, b.z - a.z), nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len, w = a.w + (b.w - a.w) * t;
      const e = -(w * (0.85 + rnd() * 0.45));
      const x = a.x + (b.x - a.x) * t + nx * e, z = a.z + (b.z - a.z) * t + nz * e, h = heightAt(x, z);
      if (h < -0.2 || h > 0.35 || Math.hypot(x - AREAS.bridge.a.x, z - AREAS.bridge.a.z) < 4) continue;
      const clump = rnd() < 0.5 ? 3 : 1;
      for (let k = 0; k < clump; k++) items.push({ x: x + (rnd() - 0.5) * 0.6 * k, z: z + (rnd() - 0.5) * 0.6 * k, s: 0.04 + rnd() * rnd() * 0.12, ry: rnd() * 6.3, c: rnd() });
    }
    const geo = lump(new THREE.IcosahedronGeometry(1, 0), 0.35, 11); geo.scale(1, 0.55, 0.85);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), items.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const tones = [0xa59c92, 0x8e8780, 0xc2b6a2, 0x7d766f, 0xb5a58c];
    items.forEach((p, i) => {
      im.setMatrixAt(i, M.compose(V.set(p.x, heightAt(p.x, p.z) + p.s * 0.2, p.z), Q.setFromAxisAngle(Y, p.ry), SC.set(p.s, p.s, p.s)));
      im.setColorAt(i, col.setHex(tones[Math.floor(p.c * tones.length)]));
    });
    im.receiveShadow = true; im.computeBoundingSphere(); group.add(im);
    // Reeds in the shallows up and downstream of the dock.
    const reedKit = buildReedClump(), reeds = [];
    for (const [lx, lz] of [[-2.2, 3.4], [-3.1, 4.6], [-2.6, 2.2], [2.3, 3.9], [3.4, 2.8], [2.8, 5.2], [4.6, 1.6]]) {
      const p = toW(lx, lz), h = heightAt(p.x, p.z);
      if (h > -0.55 && h < 0.2) reeds.push({ ...p, y: h - 0.03, ry: rnd() * 6.3, s: 0.85 + rnd() * 0.5 });
    }
    for (const k of [...reedKit.children]) {
      const r = new THREE.InstancedMesh(k.geometry, k.material, reeds.length);
      reeds.forEach((p, i) => r.setMatrixAt(i, M.compose(V.set(p.x, p.y, p.z), Q.setFromAxisAngle(Y, p.ry), SC.set(p.s, p.s * (0.9 + (i % 3) * 0.15), p.s))));
      r.receiveShadow = true; r.computeBoundingSphere(); group.add(r);
    }
    for (const p of reeds) if (p.y < -0.08) waterObstacles.add(p.x, p.z, 0.2 * p.s, 2);
  }

  // ---- the fishers
  const homes = [
    { ...toW(-0.42, BENCH_Z), rot: D.rot, seat: DECK + SEAT, route: [...TO_DOCK, toW(0, 0.6), toW(0, BENCH_Z - 1.0)] },
    { ...toW(0.42, BENCH_Z), rot: D.rot, seat: DECK + SEAT, route: [...TO_DOCK, toW(0, 0.6), toW(0, BENCH_Z - 1.0)] },
    { x: bankAt.x, z: bankAt.z, rot: bankAt.rot, seat: bankY + SEAT, route: [...TO_DOCK, { x: 42.4, z: -37.2 }] },
  ];
  const rodGeo = (() => {
    const g = new THREE.CylinderGeometry(0.008, 0.02, ROD_LEN, 5); g.rotateX(Math.PI / 2); g.translate(0, 0, ROD_LEN / 2);
    const grip = new THREE.CylinderGeometry(0.028, 0.028, 0.32, 6); grip.rotateX(Math.PI / 2); grip.translate(0, 0, 0.12);
    const reel = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8); reel.rotateZ(Math.PI / 2); reel.translate(0, -0.05, 0.3);
    const paint = (geo, hex) => { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); for (const k of ['uv']) geo.deleteAttribute(k); return geo.index ? geo.toNonIndexed() : geo; };
    const parts = [paint(g, 0x8a5a34), paint(grip, 0x3a3f47), paint(reel, 0xb8bcc2)];
    const pos = [], nor = [], colA = [];
    for (const p of parts) { pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); colA.push(...p.attributes.color.array); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
    return out;
  })();
  const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
  const rods = new THREE.InstancedMesh(rodGeo, vcMat, homes.length); rods.castShadow = true; rods.frustumCulled = false; group.add(rods);
  const bobGeo = (() => { const top = new THREE.SphereGeometry(0.045, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), bot = new THREE.SphereGeometry(0.045, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const g = new THREE.BufferGeometry(), a = top.toNonIndexed(), b = bot.toNonIndexed(), n = a.attributes.position.count, m = b.attributes.position.count, col = new Float32Array((n + m) * 3);
    for (let i = 0; i < n + m; i++) col.set(i < n ? [0.9, 0.2, 0.15] : [0.95, 0.95, 0.92], i * 3);
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a.attributes.position.array, ...b.attributes.position.array], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([...a.attributes.normal.array, ...b.attributes.normal.array], 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; })();
  const bobbers = new THREE.InstancedMesh(bobGeo, vcMat, homes.length); bobbers.frustumCulled = false; group.add(bobbers);
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(homes.length * 6), 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xf2f2ea, transparent: true, opacity: 0.75 })); lines.frustumCulled = false; group.add(lines);
  const fishMesh = (() => { const g = new THREE.SphereGeometry(0.05, 7, 5); g.scale(0.55, 0.9, 2.2); const tail = new THREE.ConeGeometry(0.05, 0.08, 4); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, -0.14);
    const m = new THREE.Group(); m.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xaebfd0, roughness: 0.35, metalness: 0.2 })), new THREE.Mesh(tail, new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 0.5 }))); return m; })();
  fishMesh.visible = false; group.add(fishMesh);

  const fishers = homes.map((home, i) => {
    const figure = createFigure({ bodyColor: SHIRT, neckerchief: SCARF[i], skinColor: SKIN[i], hairColor: HAIR[i], shortsColor: SHORTS[i], accent: i === 1 ? 'cap' : i === 2 ? 'bow' : null, accentColor: 0x6f8f5a });
    scene.add(figure.group);
    const member = crowd.join({ home, role: 'fisher' });
    member.restOpts = { sitting: true };
    // The rod's butt at the hands, out over the water, a little to the rod hand's side.
    const f = { x: Math.sin(home.rot), z: Math.cos(home.rot) }, side = { x: Math.cos(home.rot), z: -Math.sin(home.rot) };
    const butt = { x: home.x + f.x * 0.32 - side.x * 0.1, y: home.seat + 0.24, z: home.z + f.z * 0.32 - side.z * 0.1 };
    const yaw = home.rot + (i - 1) * 0.12;
    const cast = 1.0 + rnd() * 0.6; // how far past the tip the bobber sits
    return { home, figure, member, butt, yaw, cast, pitch: 0.5, next: 8 + rnd() * 25, reel: -1, react: null, i, fishing: false };
  });
  waterObstacles.mover((out) => { for (const f of fishers) if (f.fishing && f.bob) out.push({ x: f.bob.x, z: f.bob.z, r: 0.14, kind: 2 }); });

  const HELLO = ['wave', 'cheer', 'salute'];
  const LINES = ['Shh, you will scare the fish!', 'Nothing yet. Patience!', 'Caught three this morning. Put them all back.', 'The ducks keep stealing my bait.'];
  let said = 0;
  const interactables = fishers.map((f) => ({
    id: `fisher-${f.i}`, kind: 'villager', position: f.member,
    get markerY() { return groundAt(f.member.x, f.member.z) + 1.5; },
    get enabled() { return !f.member.hidden; },
    prompt: () => 'E — say hello',
    interact() {
      f.react = { name: HELLO[f.i % HELLO.length], t: 0, dur: 1.2 }; audio?.play('squeak');
      if (f.fishing && deps.say) deps.say(LINES[said++ % LINES.length], '🎣');
      if (deps.player) talkTo(f.member, deps.player.position);
    },
  }));

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  const circles = fishers.map(() => ({ x: 0, z: 0, r: 0.3, person: true }));
  let fishOwner = null, ready = false; // (no person circles before the first update: the contact shadows take the first list as fixed)
  return {
    colliders() { fishers.forEach((f, i) => { circles[i].x = f.member.x; circles[i].z = f.member.z; circles[i].r = f.member.hidden || !ready ? 0 : 0.3; }); return colliders.concat(circles); },
    interactables,
    fishers, // (read by checks)
    update(dt, elapsed, player) {
      ready = true;
      const px = player.position.x, pz = player.position.z, near = Math.hypot(px - mid.x, pz - mid.z) < 110;
      group.visible = near;
      const pos = lineGeo.attributes.position;
      for (const f of fishers) {
        const m = f.member, g = f.figure.group;
        if (f.react) { f.react.t += dt; if (f.react.t >= f.react.dur) f.react = null; }
        let gesture = f.react ? { name: f.react.name, u: f.react.t / f.react.dur } : null;
        const driven = crowd.drive(m, dt);
        const seen = Math.hypot(px - m.x, pz - m.z) < 95;
        f.fishing = !driven && !m.talk;
        if (driven) {
          g.visible = !m.hidden && seen;
          if (g.visible) {
            g.position.set(m.x, groundAt(m.x, m.z) + (m.opts.sitting ? f.figure.seatLift(SEAT) : liftFor(f.figure, m.opts)), m.z);
            let d = m.rot - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * (1 - Math.exp(-dt * 10));
            f.figure.animate(m.speed, elapsed, { ...m.opts, gesture, look: m.talk ? player.position : undefined });
          }
        } else {
          m.x = f.home.x; m.z = f.home.z;
          g.visible = seen;
          if (seen) {
            g.position.set(m.x, f.home.seat - SEAT + f.figure.seatLift(SEAT), m.z);
            let d = f.home.rot - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * (1 - Math.exp(-dt * 8));
          }
        }
        // The rod, the line and the bobber.
        if (!f.fishing || !near) {
          rods.setMatrixAt(f.i, HIDE); bobbers.setMatrixAt(f.i, HIDE);
          for (let k = 0; k < 6; k++) pos.array[f.i * 6 + k] = 0;
          if (fishOwner === f) { fishOwner = null; fishMesh.visible = false; }
          if (driven) continue;
        }
        // Waiting for a bite, a nibble (the bobber dips), then reeling in.
        f.next -= dt;
        let lift = 0, pull = 0, nibble = 0;
        if (f.reel < 0 && f.next < 1.6 && f.next > 0) nibble = Math.max(0, Math.sin(elapsed * 22)) * (1 - f.next / 1.6);
        if (f.reel < 0 && f.next <= 0) { f.reel = 0; }
        if (f.reel >= 0) {
          f.reel += dt; const u = f.reel / 3.2;
          lift = Math.sin(Math.min(1, u * 1.6) * Math.PI / 2) * (1 - Math.max(0, (u - 0.8) / 0.2));
          pull = Math.min(1, u * 1.4);
          if (u > 0.55 && u < 0.6 && !f.react && seen) { f.react = { name: 'cheer', t: 0, dur: 1.3 }; if (Math.hypot(px - m.x, pz - m.z) < 14) { audio?.play('cheer'); ui?.emote(new THREE.Vector3(m.x, f.home.seat + 1.3, m.z), 'star'); } }
          if (u >= 1) { f.reel = -1; f.next = 18 + rnd() * 40; }
        }
        gesture = f.react ? { name: f.react.name, u: f.react.t / f.react.dur } : null;
        if (f.fishing && seen) f.figure.animate(0, elapsed, { pose: 'write', sitting: true, gesture });
        if (!f.fishing || !near) continue;
        const pitch = 0.5 + lift * 0.55 + Math.sin(elapsed * 0.7 + f.i) * 0.02;
        E.set(-pitch, f.yaw, 0); Q.setFromEuler(E);
        rods.setMatrixAt(f.i, M.compose(V.set(f.butt.x, f.butt.y, f.butt.z), Q, ONE));
        const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw), reach = Math.cos(pitch) * ROD_LEN;
        const tip = { x: f.butt.x + fx * reach, y: f.butt.y + Math.sin(pitch) * ROD_LEN, z: f.butt.z + fz * reach };
        // The bobber drifts a little on the current and rides the swell; reeling draws it in under the tip and up out of the water.
        const restX = tip.x + fx * f.cast + Math.sin(elapsed * 0.3 + f.i * 2) * 0.12, restZ = tip.z + fz * f.cast + Math.cos(elapsed * 0.23 + f.i) * 0.12;
        const bx = restX + (tip.x - restX) * pull * 0.85, bz = restZ + (tip.z - restZ) * pull * 0.85;
        const water = waterWave(bx, bz, elapsed), out = Math.max(0, (pull - 0.45) / 0.55);
        const by = water + 0.01 + Math.sin(elapsed * 2.1 + f.i) * 0.012 - nibble * 0.06 + out * (tip.y - 0.55 - water);
        f.bob = { x: bx, z: bz };
        bobbers.setMatrixAt(f.i, M.compose(V.set(bx, by, bz), Q.identity(), ONE));
        pos.array.set([tip.x, tip.y, tip.z, bx, by + 0.04, bz], f.i * 6);
        // The fish: out of the water on the line's end, flicking.
        if (f.reel >= 0 && out > 0) {
          fishOwner = f; fishMesh.visible = true;
          fishMesh.position.set(bx, by - 0.16, bz); fishMesh.rotation.set(Math.PI / 2 + Math.sin(elapsed * 25) * 0.5, f.yaw, 0);
        } else if (fishOwner === f) { fishOwner = null; fishMesh.visible = false; }
      }
      rods.instanceMatrix.needsUpdate = true; bobbers.instanceMatrix.needsUpdate = true; pos.needsUpdate = true;
    },
  };
}
