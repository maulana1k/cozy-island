// The river from the lake to the sea (its flowing surface is the water shader in world/water.js): bank dressing (reeds, rocks half in the water,
// lily patches, driftwood, a dugout and a raft) in a few InstancedMesh pools per stretch of river, and
// ducks. Nothing is placed in the bridge approach, on the stepping stones' line or on the riverside trail.
//
// Ducks live in river coordinates: `s` metres from the lake along the centre line and `e` metres across
// (+ toward the locals' side). Water deep enough to float is |e| < 0.85 w (the bed profile in terrain.js), so
// a duck that stays in that band is always afloat, whatever the bends. Between the stepping stones and the
// bridge there is a stretch of open water that no deck or stone crosses; the ducks never leave it.
import * as THREE from 'three';
import { AREAS } from '../../config.js';
import { heightAt, riverAt } from '../../logic/terrain.js';
import { BRIDGE, STONES } from '../../logic/layout.js';
import { buildReedClump, buildRiverRock, buildLilyPatch, waterWave, rngFrom, mat, lump } from '../../kit/river.js';
import { buildDuck } from '../../kit/critters.js';
import { cyl, box, stick, mergeStatic } from '../build.js';
import { waterObstacles } from '../water.js';

// ---- the river as a polyline with half widths -------------------------------------------------
const R = AREAS.river, SEG = [];
{ let run = 0; for (let i = 0; i < R.length - 1; i++) { const a = R[i], b = R[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z); SEG.push({ a, b, len, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, start: run }); run += len; } }
const TOTAL = SEG[SEG.length - 1].start + SEG[SEG.length - 1].len;
const clamp = THREE.MathUtils.clamp;
// The point `e` metres across from the centre line at `s` metres along (side +1 = the locals' bank).
function at(s, e = 0) {
  s = clamp(s, 0, TOTAL);
  let i = 0; while (i < SEG.length - 1 && s > SEG[i].start + SEG[i].len) i++;
  const q = SEG[i], t = (s - q.start) / q.len, nx = q.dz, nz = -q.dx;
  const cx = q.a.x + q.dx * s - q.dx * q.start, cz = q.a.z + q.dz * s - q.dz * q.start;
  return { x: cx + nx * e, z: cz + nz * e, w: q.a.w + (q.b.w - q.a.w) * t, tx: q.dx, tz: q.dz, nx, nz, cx, cz, i };
}
const sOfBridge = 101.9, sOfFord = 17.4; // arc lengths where the crossings are (checked against AREAS)

// ---- places that must stay clear --------------------------------------------------------------
const B = BRIDGE;
function distToLine(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / l2, 0, 1);
    best = Math.min(best, Math.hypot(px - a.x - dx * t, pz - a.z - dz * t));
  }
  return best;
}
const ACROSS = AREAS.stones;
function blocked(x, z, margin = 0) {
  // The bridge and its approach on both banks.
  const wx = x - B.a.x, wz = z - B.a.z, along = wx * B.dx + wz * B.dz, lat = wx * B.dz - wz * B.dx;
  if (along > -3.8 - margin && along < B.len + 3.8 + margin && Math.abs(lat) < B.width / 2 + 2.3 + margin) return true;
  // The stepping stones, their line and a landing at each end.
  for (const s of ACROSS) if (Math.hypot(x - s.x, z - s.z) < s.r + 1.3 + margin) return true;
  if (distToLine(x, z, [{ x: ACROSS[0].x - 2.6, z: ACROSS[0].z - 1.3 }, { x: ACROSS[10].x + 2.6, z: ACROSS[10].z + 1.3 }]) < 1.8 + margin) return true;
  // The riverside trails.
  for (const t of AREAS.trails) if (distToLine(x, z, t) < 2.8 + margin) return true;
  return false;
}

export function create(scene, deps) {
  const rnd = rngFrom(4242);
  const group = new THREE.Group(); scene.add(group);
  const colliders = [];

  // Nothing streamed (palms, bushes) grows in the approaches.
  const a = B.a, b = B.b;
  for (const [x, z] of [[a.x - B.dx * 1.8, a.z - B.dz * 1.8], [a.x + B.dx * 1.2, a.z + B.dz * 1.2], [b.x + B.dx * 1.8, b.z + B.dz * 1.8], [b.x - B.dx * 1.2, b.z - B.dz * 1.2]]) deps.keepClear(x, z, 3.4);
  deps.keepClear(ACROSS[0].x - 2.2, ACROSS[0].z - 1.1, 3.4); deps.keepClear(ACROSS[10].x + 2.2, ACROSS[10].z + 1.1, 3.4);

  // ---- bank dressing, placed once
  const ZONES = 3, zoneOf = (s) => (s < 45 ? 0 : s < 90 ? 1 : 2);
  const mk = () => Array.from({ length: ZONES }, () => []);
  const reeds = mk(), rocks = mk(), lilies = mk(), logs = mk();
  const density = (s) => 0.12 + 0.75 * Math.max(Math.exp(-(((s - sOfBridge) / 16) ** 2)), Math.exp(-((s / 16) ** 2)), 0.5 * Math.exp(-(((s - sOfFord) / 8) ** 2)));
  const bankPoint = (s, side, kLo, kHi, hLo, hHi, margin = 0.5, tries = 8) => {
    for (let n = 0; n < tries; n++) {
      const p = at(s, side * (kLo + (kHi - kLo) * rnd()) * at(s).w), h = heightAt(p.x, p.z);
      if (h > hLo && h < hHi && !blocked(p.x, p.z, margin)) return { x: p.x, z: p.z, h, tx: p.tx, tz: p.tz };
    }
    return null;
  };
  for (let s = 1.5; s < 113; s += 1.7) for (const side of [-1, 1]) {
    if (rnd() > density(s) * 0.9) continue;
    const c = bankPoint(s, side, 0.78, 1.3, -0.4, 0.15);
    if (!c) continue;
    for (let k = 0, n = 1 + (rnd() < 0.35 ? 1 : 0); k < n; k++) reeds[zoneOf(s)].push({ x: c.x + (rnd() - 0.5) * 0.9 * k, y: c.h - 0.03, z: c.z + (rnd() - 0.5) * 0.9 * k, ry: rnd() * 6.28, s: 0.8 + rnd() * 0.6, sy: 0.85 + rnd() * 0.5 });
  }
  for (let s = 2; s < 112; s += 2.6) {
    if (rnd() > density(s) * 0.75) continue;
    const side = rnd() < 0.5 ? -1 : 1, c = bankPoint(s, side, 0.7, 1.25, -0.5, 0.5, 0.8);
    if (!c) continue;
    const size = 0.6 + rnd() * 1.1;
    rocks[zoneOf(s)].push({ x: c.x, y: c.h, z: c.z, ry: rnd() * 6.28, s: size });
    if (size > 0.9 && c.h > -0.2) colliders.push({ x: c.x, z: c.z, r: 0.5 * size });
  }
  // Lily patches in slow water: the inside of the bends, over water all round.
  for (let i = 1; i < R.length - 1; i++) {
    const p = SEG[i - 1], q = SEG[i], turn = p.dx * q.dz - p.dz * q.dx, s = q.start;
    if (Math.abs(turn) < 0.1 && i % 4) continue;
    if (Math.abs(s - sOfBridge) < 10 || Math.abs(s - sOfFord) < 6 || s > 112) continue;
    const side = turn < 0 ? 1 : -1;
    for (let tries = 0; tries < 12; tries++) {
      const c = at(s + (rnd() - 0.5) * 6, side * at(s).w * (0.4 + rnd() * 0.35));
      let ok = !blocked(c.x, c.z, 2);
      for (let k = 0; ok && k < 8; k++) ok = heightAt(c.x + Math.cos(k * 0.785) * 1.3, c.z + Math.sin(k * 0.785) * 1.3) < -0.3;
      if (ok) { lilies[zoneOf(s)].push({ x: c.x, y: 0, z: c.z, ry: rnd() * 6.28, s: 0.9 + rnd() * 0.5 }); break; }
    }
  }
  // Driftwood on the sand, lying along the water's edge.
  for (const s of [6, 26, 52, 70, 86, 110]) for (const side of [rnd() < 0.5 ? -1 : 1]) {
    const c = bankPoint(s, side, 1.15, 1.9, 0.04, 0.5, 1.6, 20);
    if (c) logs[zoneOf(s)].push({ x: c.x, y: c.h + 0.1, z: c.z, ry: Math.atan2(c.tx, c.tz) + Math.PI / 2 + (rnd() - 0.5) * 0.5, s: 0.8 + rnd() * 0.5 });
  }

  // The water flows round what stands in it: rocks get a collar and a wake, reeds and lily patches a lapping ring.
  for (const z of rocks) for (const it of z) if (it.y < 0.1) waterObstacles.add(it.x, it.z, 0.42 * it.s, 1);
  for (const z of reeds) for (const it of z) if (it.y < -0.08) waterObstacles.add(it.x, it.z, 0.2 * it.s, 2);
  for (const z of lilies) for (const it of z) waterObstacles.add(it.x, it.z, 1.0 * it.s, 2);

  // Pools: one InstancedMesh for each material of a kit piece, per stretch of river.
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const place = (im, i, it, y = it.y) => im.setMatrixAt(i, M.compose(V.set(it.x, y, it.z), Q.setFromAxisAngle(Y, it.ry), S.set(it.s, it.sy || it.s, it.s)));
  function pool(kit, items, cast) {
    if (!items.length) return null;
    const ims = [...kit.children].map((k) => { const im = new THREE.InstancedMesh(k.geometry, k.material, items.length); im.castShadow = cast; im.receiveShadow = true; group.add(im); return im; });
    items.forEach((it, i) => ims.forEach((im) => place(im, i, it)));
    ims.forEach((im) => { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); });
    return ims;
  }
  // A driftwood log: lumpy, with a stub of branch.
  const driftMat = mat(0x9b8466, 'drift');
  const logKit = new THREE.Group();
  {
    const g = new THREE.CylinderGeometry(0.11, 0.14, 2.4, 7, 4); g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(lump(g, 0.22, 7), driftMat), br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.6, 5), driftMat);
    br.position.set(0.3, 0.18, 0); br.rotation.z = -0.8; logKit.add(m, br); mergeStatic(logKit);
  }
  const zones = Array.from({ length: ZONES }, (_, z) => {
    const items = [...reeds[z], ...rocks[z], ...lilies[z], ...logs[z]];
    let cx = 0, cz = 0; for (const it of items) { cx += it.x; cz += it.z; }
    cx /= items.length || 1; cz /= items.length || 1;
    let rad = 0; for (const it of items) rad = Math.max(rad, Math.hypot(it.x - cx, it.z - cz));
    const g = new THREE.Group(); const before = group.children.length;
    const lily = pool(buildLilyPatch(), lilies[z], false);
    pool(buildReedClump(), reeds[z], false); pool(buildRiverRock(1), rocks[z], true); pool(logKit, logs[z], false);
    const mine = group.children.slice(before); mine.forEach((o) => g.add(o)); group.add(g);
    return { g, cx, cz, rad: rad + 4, lily, lilyItems: lilies[z] };
  });

  // ---- a dugout canoe on the camp bank above the bridge, a raft on the far bank below it
  const floaters = [];
  function floater(s, side, build, hit) {
    for (let k = 1.5; k > 0.5; k -= 0.05) {
      const p = at(s, side * at(s).w * k);
      if (heightAt(p.x, p.z) < -0.28 && !blocked(p.x, p.z, 1)) {
        const g = build(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(p.tx, p.tz) + (side < 0 ? 0.12 : -0.12);
        group.add(g); floaters.push({ g, x: p.x, z: p.z, ry: g.rotation.y, bob: floaters.length * 2 }); waterObstacles.add(p.x, p.z, 0.45, 2);
        for (const o of hit) colliders.push({ x: p.x + Math.sin(g.rotation.y) * o, z: p.z + Math.cos(g.rotation.y) * o, r: 0.5 });
        deps.keepClear(p.x, p.z, 2.4);
        return;
      }
    }
  }
  const wood = 0x8c6444, woodLight = 0xb98a5e;
  floater(sOfBridge - 11, -1, () => {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(lump(new THREE.SphereGeometry(1, 10, 8), 0.1, 3), mat(0x9a7350, 'dugout')); hull.scale.set(0.34, 0.2, 1.45); hull.position.y = 0.02;
    const cavity = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mat(0x4e3524, 'dugout-in')); cavity.scale.set(0.22, 0.12, 1.28); cavity.position.y = 0.13;
    const seat = box(0.4, 0.04, 0.12, woodLight, 0, 0.17, 0.2);
    const paddle = stick([0.1, 0.15, -0.5], [-0.12, 0.2, 0.75], 0.016, wood, 5);
    g.add(hull, cavity, seat, paddle); return mergeStatic(g);
  }, [-0.55, 0.55]);
  floater(sOfBridge + 10, 1, () => {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) g.add(cyl(0.085, 0.09, 1.9 + (i % 2) * 0.1, i % 2 ? 0x9a7350 : 0xb08663, (i - 3) * 0.17, 0.0, 0, 7).rotateX(Math.PI / 2));
    for (const z of [-0.5, 0.5]) g.add(box(1.3, 0.05, 0.1, woodLight, 0, 0.1, z));
    g.add(stick([0.5, 0.05, 0.3], [0.5, 1.5, 0.3], 0.03, wood, 6));
    return mergeStatic(g);
  }, [-0.5, 0.5]);

  // ---- ducks
  const HOMES = [{ s0: 25, s1: 40, n: 3 }, { s0: 54, s1: 72, n: 3 }, { s0: 80, s1: 94, n: 2 }];
  const LO = 21, HI = 98; // open water between the stepping stones and the bridge
  const duckColours = [0xf0cf72, 0xf4efe0, 0xc9a46a, 0xf0cf72, 0xe6dccb, 0xd9b36b, 0xf0cf72, 0xf4efe0];
  const ducks = [], duckGroups = HOMES.map(() => []);
  HOMES.forEach((h, gi) => {
    for (let i = 0; i < h.n; i++) {
      const model = buildDuck(duckColours[ducks.length % duckColours.length]); group.add(model.group);
      const s = h.s0 + (h.s1 - h.s0) * rnd(), e = (rnd() - 0.5) * at(s).w;
      const d = { model, gi, s, e, x: 0, z: 0, y: 0, heading: rnd() * 6.28, state: 'swim', t: rnd() * 3, target: null, queue: [], speed: 0.4, mode: 'swim', phase: rnd() * 20, cool: 0, calm: 0, land: false };
      ducks.push(d); duckGroups[gi].push(d); syncPos(d, 0);
    }
  });
  waterObstacles.mover((out) => { for (const d of ducks) if (!d.land && d.model.group.visible) out.push({ x: d.x, z: d.z, r: 0.2, kind: 3 }); });
  function syncPos(d, elapsed) {
    const p = at(d.s, d.e); d.x = p.x; d.z = p.z;
    const h = heightAt(d.x, d.z);
    d.land = h > -0.06;
    d.ground = h;
  }
  const pickWater = (gi, spread = 0) => { const h = HOMES[gi], s = clamp(h.s0 - spread + (h.s1 - h.s0 + 2 * spread) * rnd(), LO, HI); return { s, e: (rnd() - 0.5) * 1.0 * at(s).w }; };
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

  // Where a bank is: walking out from the water along the normal until the ground is dry and gentle.
  function bankSpot(d, side) {
    for (let k = 0.7; k < 1.9; k += 0.04) {
      const w = at(d.s).w, p = at(d.s, side * k * w), h = heightAt(p.x, p.z);
      if (h > 0.1 && h < 0.7) { const q = at(d.s, side * (k + 0.1) * w); return { s: d.s, e: side * (k + 0.1) * w, x: q.x, z: q.z }; }
    }
    return null;
  }
  function startle(d, player) {
    d.cool = 6;
    // Ashore on the bank the player is NOT standing on, or away across the water.
    const pr = riverAt(player.position.x, player.position.z), pSide = pr && pr.d !== Infinity && pr.d < pr.w + 16 ? pr.side : (d.e > 0 ? -1 : 1);
    const spot = rnd() < 0.5 ? bankSpot(d, -pSide) : null;
    if (spot && dist2(spot.x, spot.z, player.position.x, player.position.z) > 5 && !blocked(spot.x, spot.z)) { d.state = 'toBank'; d.target = spot; d.speed = 1.0; return; }
    flee(d, player.position);
  }
  function flee(d, from, speed = 1.5) {
    let best = null, bd = -1;
    for (let k = 0; k < 8; k++) { const c = pickWater(d.gi, 8), p = at(c.s, c.e), dd = dist2(p.x, p.z, from.x, from.z); if (dd > bd) { bd = dd; best = c; } }
    d.state = 'flee'; d.queue = []; d.target = best; d.speed = speed;
  }
  function scatter(gi, player) {
    for (const d of duckGroups[gi]) {
      d.cool = 4;
      if (d.state === 'toBank' || d.state === 'ashore') { d.state = 'toWater'; d.target = { s: d.s, e: Math.sign(d.e || 1) * 0.35 * at(d.s).w }; d.speed = 1.6; continue; }
      d.state = 'flee'; d.speed = 1.6 + rnd() * 0.5;
      d.queue = [pickWater(gi, 10), pickWater(gi, 10)]; d.target = pickWater(gi, 10);
    }
  }

  const interactables = HOMES.map((h, gi) => ({
    id: `ducks-${gi}`, kind: 'ducks', position: { x: 0, z: 0 }, markerY: 0.8, enabled: false,
    prompt: () => 'E — shoo ducks',
    interact() { deps.player.gesture?.('shoo', 0.9, ducks.find((d) => d.gi === gi)); scatter(gi, deps.player.position); deps.say?.('Quack! Quack!', '🦆'); },
  }));

  function stepDuck(d, dt, elapsed, player, night, dp) {
    d.cool -= dt; d.t -= dt;
    const calm = d.state === 'swim' || d.state === 'dabble' || d.state === 'rest';
    if (calm && d.cool <= 0 && dp < 6.5 && night < 0.6) startle(d, player);
    let moving = false;
    const goTo = (spd) => {
      const tg = d.target, dx = tg.s - d.s, de = tg.e - d.e, dd = Math.hypot(dx, de);
      if (dd < 0.15) return true;
      const st = Math.min(dd, spd * dt);
      d.s += (dx / dd) * st; d.e += (de / dd) * st; moving = true;
      const w = at(d.s).w;
      if (d.state === 'swim' || d.state === 'flee') d.e = clamp(d.e, -0.8 * w, 0.8 * w); // never out of the deep water
      d.s = clamp(d.s, LO, HI);
      return false;
    };
    switch (d.state) {
      case 'swim': {
        if (night > 0.6) { d.state = 'rest'; d.t = 30; break; }
        if (!d.target) { const c = pickWater(d.gi); d.target = c; }
        if (goTo(d.speed)) {
          d.target = null; const r = rnd();
          if (r < 0.4) { d.state = 'dabble'; d.t = 3 + rnd() * 2.5; } else if (r < 0.65) { d.state = 'rest'; d.t = 3 + rnd() * 4; } else d.target = pickWater(d.gi);
          d.speed = 0.35 + rnd() * 0.2;
        }
        break;
      }
      case 'dabble': if (d.t <= 0) { d.state = 'swim'; d.target = pickWater(d.gi); } break;
      case 'rest': if (d.t <= 0 && night < 0.6) { d.state = 'swim'; d.target = pickWater(d.gi); } break;
      case 'flee':
        if (goTo(d.speed)) { if (d.queue.length) d.target = d.queue.shift(); else { d.state = 'swim'; d.target = pickWater(d.gi); d.speed = 0.4; } }
        break;
      case 'toBank': if (goTo(d.speed)) { d.state = 'ashore'; d.t = 8 + rnd() * 6; d.calm = 0; } break;
      case 'ashore':
        d.calm = dp > 9 ? d.calm + dt : 0;
        if (d.calm > 4 && d.t <= 0) { d.state = 'toWater'; d.target = { s: d.s, e: Math.sign(d.e || 1) * 0.4 * at(d.s).w }; d.speed = 0.9; }
        break;
      case 'toWater': if (goTo(d.speed)) { d.state = 'swim'; d.target = pickWater(d.gi); d.speed = 0.4; } break;
    }
    // A little push apart so a group does not stack up on one spot.
    for (const o of duckGroups[d.gi]) { if (o === d) continue; const dx = d.s - o.s, de = d.e - o.e, dd = Math.hypot(dx, de); if (dd < 0.55 && dd > 0.001 && d.state !== 'ashore') { d.s += (dx / dd) * dt * 0.4; d.e += (de / dd) * dt * 0.4; } }
    const px = d.x, pz = d.z; syncPos(d, elapsed);
    const mx = d.x - px, mz = d.z - pz;
    if (moving && mx * mx + mz * mz > 1e-8) {
      const want = Math.atan2(mx, mz); let diff = want - d.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      d.heading += diff * Math.min(1, dt * (d.state === 'flee' ? 9 : 4));
    }
    // Pose: afloat on the swell, or on the ground.
    const g = d.model.group;
    d.mode = d.land ? (moving ? 'waddle' : 'rest') : d.state === 'dabble' ? 'dabble' : d.state === 'rest' ? 'rest' : 'swim';
    const wave = waterWave(d.x, d.z, elapsed);
    const fast = d.state === 'flee' || d.state === 'toBank' || d.state === 'toWater';
    d.model.animate(elapsed + d.phase, { mode: d.mode, speed: fast ? 2 : moving ? 1 : 0.6 });
    const float = d.mode === 'rest' ? -0.05 : d.mode === 'dabble' ? -0.03 : -0.02;
    g.position.set(d.x, d.land ? d.ground : Math.max(wave + float, d.ground), d.z);
    g.rotation.y = d.heading;
  }

  return {
    colliders,
    interactables,
    ducks, // (read by checks)
    update(dt, elapsed, player, night = 0) {
      const px = player.position.x, pz = player.position.z;
      for (const z of zones) {
        z.g.visible = Math.hypot(px - z.cx, pz - z.cz) - z.rad < 110;
        if (z.g.visible && z.lily) { // lily pads ride the swell
          z.lilyItems.forEach((it, i) => z.lily.forEach((im) => place(im, i, it, waterWave(it.x, it.z, elapsed))));
          z.lily.forEach((im) => { im.instanceMatrix.needsUpdate = true; });
        }
      }
      for (const f of floaters) {
        f.g.visible = Math.hypot(px - f.x, pz - f.z) < 110;
        f.g.position.y = waterWave(f.x, f.z, elapsed) - 0.03; f.g.rotation.set(Math.sin(elapsed * 0.9 + f.bob) * 0.015, f.ry, Math.sin(elapsed * 0.7 + f.bob) * 0.02);
      }
      for (const d of ducks) {
        const dp = Math.hypot(px - d.x, pz - d.z);
        d.model.group.visible = dp < 75;
        if (dp < 60) stepDuck(d, Math.min(dt, 0.1), elapsed, player, night, dp);
      }
      // "E — shoo ducks" shows when you face a group within about 11 m: the marker floats just in front of you, toward the nearest duck.
      interactables.forEach((it, gi) => {
        let best = null, bd = Infinity;
        for (const d of duckGroups[gi]) { const dd = Math.hypot(px - d.x, pz - d.z); if (dd < bd) { bd = dd; best = d; } }
        it.enabled = !!best && bd < 11 && !player.riding;
        if (it.enabled) { const k = Math.min(1.2, bd) / (bd || 1); it.position.x = px + (best.x - px) * k; it.position.z = pz + (best.z - pz) * k; it.markerY = Math.max(best.ground, 0) + 0.9; }
      });
    },
  };
}
