// The world reacting as you walk (visual milestone V3). Everything here is driven by where people are and
// how fast they move (the player and anyone else close by, from FIGURES in src/actors/figure.js) and by the
// shared wind (WIND in src/world/weather.js):
//
// - Bushes and ferns part round legs and shake while someone pushes through (vertex shader: `brushable`
//   below, applied in src/world/scatter.js and src/world/wilds.js), with a soft swish for the player.
// - Small loose things (pebbles on the paths, pinecones under the pines, mugs by the camp fire, sticks)
//   get nudged by feet, roll or slide a little and settle. Simple kinematics, four instanced draws.
// - Hanging things swing: bunting strung from the flagpole, a camp washing line, the lanterns and the
//   bell's pull rope (src/world/props.js hands those in as `hangers`). A damped pendulum each.
// - Tent fabric ripples with the wind (a vertex shader on the tents' cloth, nothing at the ground).
//
// The lily pads on the pond drift and bob when ducks or the player pass (src/world/pond.js), and people
// glance at the player, blink and shift their weight (src/actors/figure.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIGURES } from '../actors/figure.js';
import { WIND } from './weather.js';
import { heightAt } from '../logic/terrain.js';
import { getScatter, distanceToPath, FLAGPOLE, BELL, LANTERNS, CAMPFIRES } from '../logic/layout.js';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';

// ---- Brushing through plants (shader) ---------------------------------------------------------------
// Up to four people near the camera: (x, z, speed m/s, 1 if the slot is used).
const BRUSH = { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) };
const BRUSH_T = { value: 0 };
const BRUSH_GLSL = /* glsl */`
uniform vec4 uBrush[4];
uniform float uBrushT;
// How far a vertex of an instanced plant is pushed (model units) by the people near it: away from each
// one, more at the top, with a quick shake while they are moving.
vec3 brushPush(mat4 im, vec3 p) {
  vec2 at = im[3].xz; float sc = max(length(im[0].xyz), 0.05);
  float h = max(p.y, 0.0);
  vec3 off = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uBrush[i];
    if (w.w <= 0.0) continue;
    vec2 d = at - w.xy; float r = length(d);
    float near = 1.0 - smoothstep(0.2 + 0.3 * sc, 0.55 + 0.75 * sc, r);
    if (near <= 0.0) continue;
    vec2 away = d / max(r, 0.05), side = vec2(-away.y, away.x);
    float moving = min(1.0, w.z * 0.8);
    float shake = sin(uBrushT * 21.0 + at.x * 7.0 + at.y * 5.0) * 0.6 + sin(uBrushT * 13.0 + at.y * 3.0) * 0.4;
    vec2 wv = (away * (0.2 + 0.06 * moving) + (side + away * 0.5) * shake * 0.07 * moving) * near;
    off += vec3(wv.x, -0.05 * near, wv.y);
  }
  // From the world back into the plant's own frame (its turn and size undone), scaled by height.
  return (transpose(mat3(im)) * off) / (sc * sc) * (h * h);
}`;

// Makes an instanced plant material part and shake round people. `rustle` marks it as a bush the
// player hears brushing through.
export function brushable(material, rustle = false) {
  // (Each its own program: the materials it wraps differ in ways their cache keys do not show.)
  const prev = material.onBeforeCompile, key = material.customProgramCacheKey() + '|brush|' + material.uuid;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    shader.uniforms.uBrush = BRUSH; shader.uniforms.uBrushT = BRUSH_T;
    shader.vertexShader = BRUSH_GLSL + '\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        transformed += brushPush(instanceMatrix, position);
      #endif`);
  };
  material.customProgramCacheKey = () => key;
  material.userData.rustle = rustle;
  return material;
}

// ---- Tent cloth rippling in the wind ------------------------------------------------------------------
const RIPPLE_T = { value: 0 };
const TENT_NAMES = new Set(['backpackTent', 'tunnelTent', 'familyTunnelTent', 'domeTent', 'geodesicTent', 'groupShelter', 'utilityTent']);
function ripple(material) {
  if (material.userData.ripple) return;
  material.userData.ripple = true;
  const prev = material.onBeforeCompile, key = material.customProgramCacheKey() + '|ripple';
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    shader.uniforms.uWind = WIND; shader.uniforms.uRipT = RIPPLE_T;
    shader.vertexShader = 'uniform vec4 uWind;\nuniform float uRipT;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        // Pegged at the ground, free higher up; waves run downwind across the cloth. A function of the
        // position only, so the welded panels move together and never open a seam.
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float s = uWind.z, lift = smoothstep(0.1, 0.85, position.y);
        float amp = (0.006 + 0.012 * s + 0.03 * s * s) * lift;
        float ph = dot(wp.xz, uWind.xy) * 2.4 - uRipT * (2.0 + 3.5 * s);
        float rip = sin(ph + wp.y * 2.7) * 0.6 + sin(ph * 1.8 + wp.x * 3.9 - wp.z * 3.1 + uRipT * 1.4) * 0.4;
        vec2 o = position.xz; float ol = length(o);
        vec3 dir = vec3(ol > 0.001 ? o / ol : vec2(0.0), 0.0).xzy; dir.y = 0.45;
        transformed += dir * rip * amp / max(length(modelMatrix[0].xyz), 0.05);
      }`);
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}

// ---- Small loose things -------------------------------------------------------------------------------
function looseGeometries() {
  const pebble = new THREE.DodecahedronGeometry(0.055, 0); pebble.scale(1, 0.62, 0.82);
  const cone = mergeGeometries([new THREE.ConeGeometry(0.034, 0.1, 6).rotateZ(Math.PI / 2).toNonIndexed(), new THREE.SphereGeometry(0.03, 6, 4).translate(0.04, 0, 0).toNonIndexed()]);
  cone.translate(-0.012, 0, 0);
  const cup = mergeGeometries([new THREE.CylinderGeometry(0.042, 0.036, 0.085, 9, 1, true).translate(0, 0.0425, 0).toNonIndexed(), new THREE.CircleGeometry(0.036, 9).rotateX(-Math.PI / 2).translate(0, 0.004, 0).toNonIndexed(),
    new THREE.TorusGeometry(0.024, 0.006, 4, 8, Math.PI).rotateZ(-Math.PI / 2).translate(0.042, 0.045, 0).toNonIndexed()]);
  const stick = mergeGeometries([new THREE.CylinderGeometry(0.014, 0.019, 0.55, 5).rotateZ(Math.PI / 2).toNonIndexed(), new THREE.CylinderGeometry(0.008, 0.01, 0.16, 4).translate(0, 0.08, 0).rotateZ(-0.9).translate(0.08, 0, 0.0).toNonIndexed()]);
  return { pebble, cone, cup, stick };
}
// Per kind: rest height of the centre, rolling radius (0: it slides), how hard a foot sends it, how fast it stops.
const KIND = {
  pebble: { y: 0.03, r: 0.045, kick: 0.85, stop: 2.4, hit: 0.32 },
  cone: { y: 0.033, r: 0.033, kick: 0.75, stop: 2.8, hit: 0.32 },
  cup: { y: 0, r: 0, kick: 0.55, stop: 4.5, hit: 0.3 },
  stick: { y: 0.018, r: 0, kick: 0.35, stop: 6, hit: 0.4 },
};

export function createReact(scene, deps) {
  const { props, audio, player, groundAt } = deps;
  const group = new THREE.Group(); group.name = 'react'; scene.add(group);
  const rng = createRng(SEED + 303);
  const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra });
  const dummy = new THREE.Object3D(), q = new THREE.Quaternion(), axis = new THREE.Vector3(), color = new THREE.Color();
  const colliders = [];

  // ---- People near the player this frame
  const walkers = [], lastPos = new Map(), pool = [];
  function gather(dt, pp) {
    walkers.length = 0;
    for (let i = 0; i < FIGURES.length; i++) {
      const f = FIGURES[i], g = f.group;
      if (!g.parent) continue;
      const x = g.position.x, z = g.position.z;
      let lp = lastPos.get(f);
      if (!lp) { lp = { x, z }; lastPos.set(f, lp); }
      const vx = dt > 0 ? (x - lp.x) / dt : 0, vz = dt > 0 ? (z - lp.z) / dt : 0; lp.x = x; lp.z = z;
      const d2 = (x - pp.x) ** 2 + (z - pp.z) ** 2;
      if (!g.visible || d2 > 28 * 28) continue;
      const speed = Math.hypot(vx, vz);
      if (speed > 9) continue; // teleported (a film, sleeping, a ride)
      const w = pool[walkers.length] || (pool[walkers.length] = {});
      w.x = x; w.z = z; w.y = g.position.y; w.vx = vx; w.vz = vz; w.speed = speed; w.d2 = d2; w.tall = 1.15 * (f.scale || 1);
      walkers.push(w);
    }
    walkers.sort((a, b) => a.d2 - b.d2);
  }

  // ---- Plants: which bushes the player can hear
  const rustlers = [];
  scene.traverse((o) => { if (o.isInstancedMesh && o.material && o.material.userData && o.material.userData.rustle) rustlers.push(o); });
  let rustleScan = 0, rustleWait = 0;
  function listenBushes(dt, pp, moving) {
    rustleWait -= dt; rustleScan -= dt;
    if (rustleScan > 0) return;
    rustleScan = 0.08;
    let hit = false;
    for (const m of rustlers) {
      if (!m.visible) continue;
      const a = m.instanceMatrix.array;
      for (let i = 0, n = m.count; i < n && !hit; i++) {
        const dx = a[i * 16 + 12] - pp.x, dz = a[i * 16 + 14] - pp.z;
        if (dx * dx + dz * dz > 4) continue;
        const sc = Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]);
        if (Math.hypot(dx, dz) < 0.35 + 0.55 * sc) hit = true;
      }
      if (hit) break;
    }
    if (hit && moving && rustleWait <= 0) { audio.play('brush'); rustleWait = 0.45 + Math.random() * 0.25; }
  }

  // ---- Loose things on the ground
  const geos = looseGeometries();
  const data = getScatter();
  const items = [];
  const place = (kind, x, z, rot) => { if (heightAt(x, z) < 0.15) return; items.push({ kind, x, z, vx: 0, vz: 0, yaw: rot, spin: 0, tilt: 0, tiltV: 0, q: new THREE.Quaternion().setFromAxisAngle(axis.set(0, 1, 0), rot), moving: true, home: { x, z } }); };
  // Pebbles on and beside the camp paths.
  for (let k = 0, guard = 0; k < 70 && guard < 4000; guard++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 30, x = 10 + Math.cos(a) * r, z = 10 + Math.sin(a) * r;
    const d = distanceToPath(x, z);
    if (d > 1.5) continue;
    place('pebble', x, z, rng() * 6.28); k++;
  }
  // Pinecones under the pines near camp.
  for (const t of data.trees) {
    if (![0, 2, 4].includes(t.kind) || Math.hypot(t.x - 10, t.z - 10) > 34) continue;
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) { const a = rng() * 6.28, r = 0.7 + rng() * 1.8; place('cone', t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, rng() * 6.28); }
  }
  // Mugs left round the camp fire and sticks by it.
  const fire = CAMPFIRES[0];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28 + rng() * 0.4, r = 2.0 + rng() * 0.9; place('cup', fire.x + Math.cos(a) * r, fire.z + Math.sin(a) * r, rng() * 6.28); }
  for (let i = 0; i < 8; i++) { const a = rng() * 6.28, r = 1.7 + rng() * 1.6; place('stick', fire.x + Math.cos(a) * r, fire.z + Math.sin(a) * r, rng() * 6.28); }
  for (const t of data.trees) { if (Math.hypot(t.x - 10, t.z - 10) > 30 || rng() > 0.25) continue; const a = rng() * 6.28, r = 1 + rng() * 1.6; place('stick', t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, rng() * 6.28); }

  const TONES = { pebble: [0xb9aea4, 0xa8998a, 0xcfc3b2, 0x8e8478], cone: [0x8a5a36, 0x7a4e2e, 0x9a6a40], cup: [0xf2ece0, 0x4f7fc9, 0xe8503a, 0x3f8f6a], stick: [0x8c6444, 0x7a5638, 0x9a7450] };
  const meshes = {};
  for (const kind of Object.keys(KIND)) {
    const list = items.filter((it) => it.kind === kind);
    const m = new THREE.InstancedMesh(geos[kind], flat(0xffffff, kind === 'cup' ? { side: THREE.DoubleSide, roughness: 0.5 } : {}), Math.max(1, list.length));
    m.count = list.length; m.receiveShadow = true; m.castShadow = kind === 'cup' || kind === 'stick';
    list.forEach((it, i) => { it.mesh = m; it.index = i; m.setColorAt(i, color.setHex(TONES[kind][i % TONES[kind].length]).offsetHSL(0, 0, (rng() - 0.5) * 0.06)); });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    meshes[kind] = m; group.add(m);
  }
  function placeItem(it) {
    const K = KIND[it.kind];
    it.y = groundAt(it.x, it.z) + K.y;
    dummy.position.set(it.x, it.y, it.z);
    if (it.kind === 'cup') { dummy.quaternion.setFromAxisAngle(axis.set(0, 1, 0), it.yaw); q.setFromAxisAngle(axis.set(1, 0, 0), it.tilt); dummy.quaternion.multiply(q); }
    else if (it.kind === 'stick') dummy.quaternion.setFromAxisAngle(axis.set(0, 1, 0), it.yaw);
    else dummy.quaternion.copy(it.q);
    dummy.scale.setScalar(1); dummy.updateMatrix();
    it.mesh.setMatrixAt(it.index, dummy.matrix);
    it.mesh.instanceMatrix.needsUpdate = true;
  }
  items.forEach(placeItem);
  items.forEach((it) => { it.moving = false; });
  let knockWait = 0;
  function updateItems(dt, pp) {
    knockWait -= dt;
    for (const it of items) {
      const dx0 = it.x - pp.x, dz0 = it.z - pp.z;
      if (dx0 * dx0 + dz0 * dz0 > 26 * 26) continue;
      const K = KIND[it.kind];
      // A foot meets it: sent the way the walker is going, a little to one side.
      for (const w of walkers) {
        if (w.speed < 0.35) continue;
        const dx = it.x - w.x, dz = it.z - w.z, d2 = dx * dx + dz * dz;
        if (d2 > K.hit * K.hit || Math.abs(groundAt(it.x, it.z) - w.y) > 0.4) continue;
        const ux = w.vx / w.speed, uz = w.vz / w.speed, along = dx * ux + dz * uz;
        if (along < -0.05) continue; // behind the walker
        const side = (dx * -uz + dz * ux) >= 0 ? 1 : -1, push = K.kick * Math.min(w.speed, 4) * (0.7 + Math.random() * 0.5);
        const sx = -uz * side * (0.35 + Math.random() * 0.4), sz = ux * side * (0.35 + Math.random() * 0.4);
        const nvx = (ux + sx) * push, nvz = (uz + sz) * push;
        if (nvx * nvx + nvz * nvz > it.vx * it.vx + it.vz * it.vz) {
          it.vx = nvx; it.vz = nvz;
          if (it.kind === 'stick' || it.kind === 'cup') it.spin += (Math.random() - 0.5) * 9 * Math.min(1, w.speed / 2);
          if (it.kind === 'cup') it.tiltV += 6 * Math.min(1, w.speed / 2);
          if (!it.moving && w.d2 < 0.5 && knockWait <= 0) { audio.play('knock'); knockWait = 0.25; }
          it.moving = true;
        }
      }
      if (!it.moving) continue;
      const sp = Math.hypot(it.vx, it.vz);
      if (sp > 0.001) {
        let nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
        if (heightAt(nx, nz) < 0.1) { it.vx *= -0.4; it.vz *= -0.4; nx = it.x; nz = it.z; } // not into the water
        if (K.r > 0) { axis.set(it.vz, 0, -it.vx).normalize(); q.setFromAxisAngle(axis, (sp * dt) / K.r); it.q.premultiply(q); }
        it.x = nx; it.z = nz;
      }
      const f = Math.exp(-K.stop * dt); it.vx *= f; it.vz *= f;
      // The bumpy ground stops a roll for good once it is slow.
      if (sp < 0.04) { it.vx = 0; it.vz = 0; }
      it.yaw += it.spin * dt; it.spin *= Math.exp(-5 * dt);
      // A mug rocks on its base and settles back upright.
      it.tiltV += (-60 * it.tilt - 5 * it.tiltV) * dt; it.tilt = Math.max(-0.5, Math.min(0.5, it.tilt + it.tiltV * dt));
      placeItem(it);
      if (sp < 0.04 && Math.abs(it.spin) < 0.05 && Math.abs(it.tilt) < 0.01 && Math.abs(it.tiltV) < 0.05) it.moving = false;
    }
  }

  // ---- Hanging things: bunting from the flagpole and a washing line
  const swingers = []; // { x, y, z, nx, nz (the way it swings), w2 (stiffness), c (damping), th, v, gain, low (its lowest point), size }
  const ropeGeos = [];
  const sagCurve = (a, b, sag, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t); });
  function rope(pts, r = 0.008) { const curve = new THREE.CatmullRomCurve3(pts); ropeGeos.push(new THREE.TubeGeometry(curve, pts.length * 2, r, 3, false).toNonIndexed()); }
  // A line from a to b with things hanging every `every` m: returns their spots and the line's side direction.
  function line(a, b, every, sag) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), pts = sagCurve(a, b, sag, 16);
    rope(pts);
    const n = Math.max(1, Math.floor(len / every)), out = [];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2; // local x along the line
    for (let i = 1; i < n; i++) { const t = i / n; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), z: a.z + (b.z - a.z) * t, yaw }); }
    return out;
  }
  const flagTri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.1, 0, 0), new THREE.Vector3(0.1, 0, 0), new THREE.Vector3(0, -0.24, 0)]); flagTri.computeVertexNormals();
  const at = (p, y) => ({ x: p.x, y: heightAt(p.x, p.z) + y, z: p.z });
  const flagTop = at(FLAGPOLE, 4.0);
  const ends = [at(LANTERNS[0], 1.86), at(LANTERNS[1], 1.86), { x: BELL.x + 0.85, y: heightAt(BELL.x, BELL.z) + 2.45, z: BELL.z }];
  const flagSpots = ends.flatMap((e) => line(flagTop, e, 0.42, 0.06 * Math.hypot(e.x - flagTop.x, e.z - flagTop.z) + 0.12));
  const BUNTING = [0xe8503a, 0xf2b63b, 0x4f7fc9, 0x3f8f6a, 0xfaf3e2, 0xa77bd6];
  const flags = new THREE.InstancedMesh(flagTri, flat(0xffffff, { side: THREE.DoubleSide, roughness: 1 }), flagSpots.length);
  flags.castShadow = true; flags.receiveShadow = true;
  flagSpots.forEach((s, i) => { flags.setColorAt(i, color.setHex(BUNTING[i % BUNTING.length])); swingers.push({ ...s, mesh: flags, index: i, w2: 42, c: 2.6, th: 0, v: 0, gain: 1, size: 0.24, flutter: 1 }); });
  flags.instanceColor.needsUpdate = true; group.add(flags);

  // The washing line: two forked poles and a sagging rope beside the first patrol tent, cloths pegged on it.
  const LA = { x: 2.4, z: 9.7 }, LB = { x: 3.5, z: 13.7 }, POLE_H = 1.75;
  const poles = [];
  for (const p of [LA, LB]) {
    const y = heightAt(p.x, p.z);
    poles.push(new THREE.CylinderGeometry(0.035, 0.045, POLE_H + 0.1, 6).translate(p.x, y + POLE_H / 2 - 0.05, p.z).toNonIndexed());
    poles.push(new THREE.CylinderGeometry(0.02, 0.025, 0.25, 5).rotateZ(0.5).translate(p.x - 0.05, y + POLE_H + 0.08, p.z).toNonIndexed(), new THREE.CylinderGeometry(0.02, 0.025, 0.25, 5).rotateZ(-0.5).translate(p.x + 0.05, y + POLE_H + 0.08, p.z).toNonIndexed());
    colliders.push({ x: p.x, z: p.z, r: 0.12 });
  }
  const poleMesh = new THREE.Mesh(mergeGeometries(poles), flat(0x8c6444)); poleMesh.castShadow = true; poleMesh.receiveShadow = true; group.add(poleMesh);
  const clothSpots = line(at(LA, POLE_H), at(LB, POLE_H), 0.62, 0.16);
  const clothGeo = new THREE.PlaneGeometry(1, 1, 1, 2).translate(0, -0.5, 0);
  const CLOTH = [0xfaf3e2, 0x4f7fc9, 0xf2b63b, 0x3f8f6a, 0xe8503a, 0xd8c08a, 0xfaf3e2];
  const cloths = new THREE.InstancedMesh(clothGeo, flat(0xffffff, { side: THREE.DoubleSide, roughness: 1 }), clothSpots.length);
  cloths.castShadow = true; cloths.receiveShadow = true;
  clothSpots.forEach((s, i) => {
    cloths.setColorAt(i, color.setHex(CLOTH[i % CLOTH.length]));
    const w = 0.34 + rng() * 0.2, h = 0.38 + rng() * 0.3;
    swingers.push({ ...s, mesh: cloths, index: i, w2: 18, c: 1.9, th: 0, v: 0, gain: 0.8, size: h, sx: w, sy: h, flutter: 0.5 });
  });
  cloths.instanceColor.needsUpdate = true; group.add(cloths);
  const ropeMesh = new THREE.Mesh(mergeGeometries(ropeGeos), flat(0xe9dcc0)); ropeMesh.castShadow = false; ropeMesh.receiveShadow = true; group.add(ropeMesh);

  const xAxis = new THREE.Vector3(1, 0, 0), yAxis = new THREE.Vector3(0, 1, 0);
  function placeSwinger(s) {
    dummy.position.set(s.x, s.y, s.z);
    dummy.quaternion.setFromAxisAngle(yAxis, s.yaw); q.setFromAxisAngle(xAxis, -s.th); dummy.quaternion.multiply(q);
    dummy.scale.set(s.sx || 1, s.sy || 1, 1); dummy.updateMatrix();
    s.mesh.setMatrixAt(s.index, dummy.matrix);
  }
  // The way a swing (positive angle) moves the hanging end: local +z of the line's frame, in the world.
  for (const s of swingers) { s.nx = Math.sin(s.yaw); s.nz = Math.cos(s.yaw); placeSwinger(s); }

  // The lanterns and the bell rope from src/world/props.js: a pendulum in two directions each.
  const hangers = (props && props.hangers) || [];
  const wp = new THREE.Quaternion(), eu = new THREE.Euler();
  for (const h of hangers) {
    h.node.parent.updateWorldMatrix(true, false); h.node.parent.getWorldQuaternion(wp); eu.setFromQuaternion(wp, 'YXZ');
    h.yaw = eu.y; h.ax = 0; h.az = 0; h.vx = 0; h.vz = 0; h.w2 = 9.8 / h.len; h.c = h.kind === 'rope' ? 1.1 : 1.6;
    const wpos = new THREE.Vector3(); h.node.getWorldPosition(wpos); h.y = wpos.y;
  }

  // Wind on a hanging thing at (x, z): the shared breeze, gusting in waves (the same field the trees use).
  function windAt(x, z) {
    const wv = WIND.value, s = wv.z;
    const gust = (0.55 + 0.45 * Math.sin(wv.w * 0.35 + (x * wv.x + z * wv.y) * 0.05)) * (0.5 + 0.5 * Math.sin(wv.w * (0.7 + 0.5 * s) + x * 0.31 + z * 0.23));
    return (0.15 + s * s * 1.2 + s * 0.3) * gust;
  }
  // How hard the people close by push a thing hanging at (x, y, z), within `reach` m: their velocity, faded by distance.
  const push = { x: 0, z: 0 };
  function brushAt(x, y, z, reach) {
    push.x = 0; push.z = 0;
    for (const w of walkers) {
      if (w.speed < 0.2 || y > w.y + w.tall + 0.35 || y < w.y - 0.2) continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d > reach) continue;
      const k = 1 - d / reach;
      push.x += w.vx * k; push.z += w.vz * k;
    }
    return push;
  }
  function updateHanging(dt, elapsed, pp) {
    const wv = WIND.value;
    const steps = Math.max(1, Math.ceil(dt / 0.02)), h = dt / steps;
    let any = false;
    for (const s of swingers) {
      if ((s.x - pp.x) ** 2 + (s.z - pp.z) ** 2 > 45 * 45) continue;
      any = true;
      const wind = windAt(s.x, s.z), across = (wv.x * s.nx + wv.y * s.nz);
      const flutter = Math.sin(elapsed * 9.3 + s.index * 1.7) * Math.sin(elapsed * 3.1 + s.index) * wv.z * 5 * s.flutter;
      const b = brushAt(s.x, s.y - s.size, s.z, 0.85), bf = (b.x * s.nx + b.z * s.nz) * 7;
      const F = across * wind * 14 * s.gain + flutter + bf;
      for (let k = 0; k < steps; k++) { s.v += (F - s.w2 * Math.sin(s.th) - s.c * s.v) * h; s.th += s.v * h; }
      s.th = Math.max(-1.3, Math.min(1.3, s.th));
      placeSwinger(s);
    }
    if (any) { flags.instanceMatrix.needsUpdate = true; cloths.instanceMatrix.needsUpdate = true; }
    for (const g of hangers) {
      if ((g.x - pp.x) ** 2 + (g.z - pp.z) ** 2 > 40 * 40) continue;
      const wind = windAt(g.x, g.z) * (g.kind === 'rope' ? 1.2 : 0.55);
      const b = brushAt(g.x, g.y - g.len, g.z, 1.0);
      let fx = wv.x * wind + b.x * 1.6, fz = wv.y * wind + b.z * 1.6;
      fx += Math.sin(elapsed * 2.3 + g.x) * wv.z * 0.3; fz += Math.cos(elapsed * 1.9 + g.z) * wv.z * 0.3;
      const c = Math.cos(g.yaw), sn = Math.sin(g.yaw), lx = fx * c - fz * sn, lz = fx * sn + fz * c; // into the hanger's own frame
      if (g.kick) { g.vz += g.kick; g.kick = 0; }
      for (let k = 0; k < steps; k++) {
        g.vx += (lx - g.w2 * Math.sin(g.ax) - g.c * g.vx) * h; g.ax += g.vx * h;
        g.vz += (lz - g.w2 * Math.sin(g.az) - g.c * g.vz) * h; g.az += g.vz * h;
      }
      g.ax = Math.max(-0.9, Math.min(0.9, g.ax)); g.az = Math.max(-0.9, Math.min(0.9, g.az));
      g.node.rotation.set(-g.az, 0, g.ax); // bottom out along local x is +z rotation; along local z is -x rotation
    }
  }

  // ---- Tents: find the cloth and let it ripple
  scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && TENT_NAMES.has(o.name) && o.material && o.material.vertexColors) ripple(o.material); });

  let shaderTime = 0;
  return {
    colliders,
    update(dt, elapsed) {
      const pp = player.position;
      gather(dt, pp);
      shaderTime += dt; BRUSH_T.value = shaderTime; RIPPLE_T.value = shaderTime;
      // The four nearest people bend the plants (the player is always one of them).
      for (let i = 0; i < 4; i++) { const w = walkers[i], u = BRUSH.value[i]; if (w) u.set(w.x, w.z, w.speed, 1); else u.set(0, 0, 0, 0); }
      if (dt <= 0) return;
      listenBushes(dt, pp, player.speed > 0.4 && !player.riding);
      updateItems(dt, pp);
      updateHanging(dt, elapsed, pp);
    },
  };
}
