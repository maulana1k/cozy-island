// INTERNAL. The village farm and the far shore: a patchwork of stepped rice paddies with earth paths between
// them, vegetable plots, a hay shelter, scarecrows, a goat pen (3 goats), a buffalo wallow (1 water buffalo),
// a duck pond, the orchard (12 fruit trees), herons in the paddies, butterflies, and the fishing jetty with two
// row boats, drying nets and baskets. Models come from src/kit/farm.js, critters.js and hamlet.js.
//
// Cost: all paddy banks, paths and shore props are welded into a few meshes, every rice shoot is ONE
// InstancedMesh, and the orchard is three InstancedMeshes (one per kind of tree). Groups hide beyond ~85 m of
// their centre; animals only update within ~60 m of the farm centre.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flat } from '../build.js';
import { AREAS } from '../../config.js';
import { resolveCollisions } from '../../logic/collision.js';
import { buildVegPlot, buildGoatPen, buildHayShelter, buildScarecrow, buildWallow, buildOrchardTree, buildDuckPond, buildGoat, buildBuffalo } from '../../kit/farm.js';
import { buildHeron, buildButterflies } from '../../kit/critters.js';
import { buildJetty, buildRowBoat } from '../../kit/hamlet.js';

const TAU = Math.PI * 2;
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turnToward = (cur, want, k) => cur + wrap(want - cur) * Math.min(1, k);

// ---- Welded, vertex-coloured scenery: any number of shapes -> one mesh -------------------------------------
const FLAT_MAT = flat(0xffffff, { vertexColors: true });
class Mesher {
  constructor() { this.list = []; this.set(0, 0, 0, 0); }
  set(x, y, z, yaw) { this.ox = x; this.oy = y; this.oz = z; this.yaw = yaw; this.c = Math.cos(yaw); this.s = Math.sin(yaw); return this; }
  tw(lx, ly, lz) { return [this.ox + lx * this.c + lz * this.s, this.oy + ly, this.oz - lx * this.s + lz * this.c]; }
  push(g, hex, m4) {
    g = g.index ? g.toNonIndexed() : g; g.applyMatrix4(m4);
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    const col = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); this.list.push(g);
  }
  at(geo, hex, lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1) {
    const [x, y, z] = this.tw(lx, ly, lz);
    this.push(geo, hex, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw + ry, 0)), new THREE.Vector3(sx, sy, sz)));
  }
  box(w, h, d, hex, lx, ly, lz, ry = 0) { this.at(new THREE.BoxGeometry(w, h, d), hex, lx, ly, lz, ry); }
  cyl(r0, r1, h, hex, lx, ly, lz, seg = 8) { this.at(new THREE.CylinderGeometry(r0, r1, h, seg), hex, lx, ly, lz); }
  sph(r, hex, lx, ly, lz, sx = 1, sy = 1, sz = 1) { this.at(new THREE.SphereGeometry(r, 8, 6), hex, lx, ly, lz, 0, sx, sy, sz); }
  // A tapered rod between two local points.
  seg(a, b, r0, r1, hex, n = 5) {
    const pa = new THREE.Vector3(...this.tw(...a)), pb = new THREE.Vector3(...this.tw(...b)), len = Math.max(pa.distanceTo(pb), 1e-4);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize());
    this.push(new THREE.CylinderGeometry(r1, r0, len, n, 1), hex, new THREE.Matrix4().compose(pa.clone().add(pb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  }
  build(cast = true) {
    const mesh = new THREE.Mesh(mergeGeometries(this.list), FLAT_MAT); mesh.castShadow = cast; mesh.receiveShadow = true; return mesh;
  }
}

// ---- Layout ------------------------------------------------------------------------------------------------
// Paddies: x0..x1, z0..z1 (metres), laid as rows with a ~1.5 m gap for the paths. The middle of the patchwork is AREAS.paddies.
const PADDY_RECTS = [
  { x0: 132, x1: 144, z0: -45.75, z1: -37.5 }, { x0: 145.5, x1: 154.5, z0: -45.75, z1: -37.5 }, { x0: 156, x1: 164, z0: -45.75, z1: -36.5 },
  { x0: 131, x1: 140, z0: -56.75, z1: -47.25 }, { x0: 141.5, x1: 152.5, z0: -56.75, z1: -47.25 }, { x0: 154, x1: 163, z0: -54, z1: -47.25 },
  { x0: 135, x1: 148, z0: -65.5, z1: -58.25 },
];
// Narrow earth paths (polylines, metres).
const PATHS = [
  [[111, -47], [121, -46.5], [131, -46.5], [165, -46.5]],
  [[144.75, -37], [144.75, -46.5]], [[155.25, -36], [155.25, -46.5]], [[140.75, -46.5], [140.75, -57.5]], [[153.25, -46.5], [153.25, -57.5]],
  [[130, -57.5], [165, -57.5]], [[140.75, -57.5], [139.5, -68], [135, -77], [132.2, -83.2]],
  [[130, -57.5], [124, -60], [121, -66], [123, -72]], [[139.5, -68], [148, -76], [151, -80]], [[148, -76], [158, -75]],
  [[165, -57.5], [168, -61.5], [171, -62]], [[121, -66], [114, -64]],
];
const POND = { x: 160, z: -77, r: 3.5 }, WALLOW = { x: 144, z: -84, r: 3 }, PEN = { x: 131, z: -89, size: 7 };
const JETTY = { x: 179.5, z: -62, length: 14, rot: Math.PI / 2 }; // its landward end is at x = 172.5, where the beach is about 1 m up

export function create(scene, deps) {
  const { heightAt, groundAt, addPlatform, keepClear, audio, ui, effects } = deps;
  const rand = rng(97);
  const colliders = [];
  const interactables = [];
  const mk = (name) => { const g = new THREE.Group(); g.name = name; scene.add(g); return g; };
  const farmRoot = mk('farm'), orchardRoot = mk('orchard'), shoreRoot = mk('shore');
  const farmC = AREAS.farm, orchardC = AREAS.orchard, jettyC = { x: JETTY.x, z: JETTY.z };

  const maxH = (x0, x1, z0, z1, step = 1) => { let m = -1e9; for (let x = x0; x <= x1 + 1e-6; x += step) for (let z = z0; z <= z1 + 1e-6; z += step) m = Math.max(m, heightAt(x, z)); return m; };
  const minH = (x0, x1, z0, z1, step = 1) => { let m = 1e9; for (let x = x0; x <= x1 + 1e-6; x += step) for (let z = z0; z <= z1 + 1e-6; z += step) m = Math.min(m, heightAt(x, z)); return m; };
  const toWorld = (x, z, rot, lx, lz) => ({ x: x + lx * Math.cos(rot) + lz * Math.sin(rot), z: z - lx * Math.sin(rot) + lz * Math.cos(rot) });
  const worldColliders = (list, x, z, rot) => list.map((c) => {
    const p = toWorld(x, z, rot, c.x, c.z);
    return c.r !== undefined ? { x: p.x, z: p.z, r: c.r } : { x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: (c.rot || 0) + rot };
  });
  // Puts a kit model on the ground (at the highest ground under it, so nothing sinks), adds its colliders.
  function place(parent, made, x, z, rot = 0, r = 1.6, clear = r + 1) {
    const g = made.group; g.position.set(x, maxH(x - r, x + r, z - r, z + r, r / 2) - 0.02, z); g.rotation.y = rot; parent.add(g);
    colliders.push(...worldColliders(made.colliders || [], x, z, rot)); keepClear(x, z, clear);
    return g;
  }

  // =========================================================================================================
  // Paddies: stepped to the ground. Each is level at the highest ground under it, with an earth skirt down to the
  // lowest, a grass-topped bank all round and a still sheet of water over a muddy bed. One mesh for every bank, one
  // for every water sheet, ONE InstancedMesh for every rice shoot.
  // =========================================================================================================
  const EARTH = 0xa07650, EARTH_DARK = 0x6b4a33, GRASS = 0x8fc65c, BW = 0.45, BH = 0.24;
  const bank = new Mesher(), waters = [], paddies = [];
  PADDY_RECTS.forEach((r, i) => {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const level = maxH(r.x0, r.x1, r.z0, r.z1, 1) - 0.02, low = minH(r.x0, r.x1, r.z0, r.z1, 1) - 0.12;
    const top = level + BH, h = top - low, my = low + h / 2, iw = w - BW * 2, id = d - BW * 2;
    bank.box(iw + 0.1, 0.1 + (level - low), id + 0.1, EARTH_DARK, cx, low + (0.1 + level - low) / 2, cz);          // bed, solid down to the ground
    for (const [bw_, bd_, x, z] of [[w, BW, cx, r.z0 + BW / 2], [w, BW, cx, r.z1 - BW / 2], [BW, id, r.x0 + BW / 2, cz], [BW, id, r.x1 - BW / 2, cz]]) {
      bank.box(bw_, h, bd_, EARTH, x, my, z); bank.box(bw_ - 0.04, 0.03, bd_ * 0.7, GRASS, x, top + 0.012, z);
    }
    for (const sx of [r.x0, r.x1]) for (const sz of [r.z0, r.z1]) bank.sph(0.34, EARTH, sx + (sx === r.x0 ? 0.2 : -0.2), level + 0.1, sz + (sz === r.z0 ? 0.2 : -0.2), 1, 0.55, 1);
    for (let k = 0; k < Math.round(w + d); k++) { // tufts of grass and clods on the banks
      const front = k % 2, x = r.x0 + 0.6 + rand() * (w - 1.2), z = front ? r.z1 - BW / 2 : r.z0 + BW / 2;
      bank.sph(0.1 + rand() * 0.06, rand() < 0.5 ? 0x7fcb5a : GRASS, x, top + 0.04, z + (rand() - 0.5) * 0.2, 1, 0.7, 1);
    }
    if (i % 2 === 0) { bank.cyl(0.035, 0.04, 1.0, 0xb98a5f, r.x1 - 0.3, top + 0.4, r.z1 - 0.3, 6); bank.box(0.28, 0.16, 0.02, 0xe8554e, r.x1 - 0.45, top + 0.9, r.z1 - 0.3); } // a flag stake
    const wg = new THREE.PlaneGeometry(iw, id); wg.rotateX(-Math.PI / 2); wg.translate(cx, level + BH - 0.05, cz); waters.push(wg);
    paddies.push({ ...r, cx, cz, w, d, level, iw, id, bed: level + 0.1 });
    // Walkable: the bed, then the four banks a step higher (everything level, whatever the ground does).
    addPlatform({ shape: 'box', x: cx, z: cz, rot: 0, hw: iw / 2, hd: id / 2, top: level + 0.1, surface: 'mud', id: `paddy-${i}` });
    for (const [hw, hd, x, z] of [[w / 2, BW / 2, cx, r.z0 + BW / 2], [w / 2, BW / 2, cx, r.z1 - BW / 2], [BW / 2, id / 2, r.x0 + BW / 2, cz], [BW / 2, id / 2, r.x1 - BW / 2, cz]]) {
      addPlatform({ shape: 'box', x, z, rot: 0, hw, hd, top: top + 0.02, surface: 'grass', id: `paddy-${i}-bank` });
    }
    for (let x = r.x0 + 2; x < r.x1; x += 4) for (let z = r.z0 + 2; z < r.z1; z += 4) keepClear(x, z, 3.2);
  });
  farmRoot.add(bank.build(false));
  const waterMesh = new THREE.Mesh(mergeGeometries(waters.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x6fc2b6, transparent: true, opacity: 0.62, roughness: 0.1, metalness: 0, depthWrite: false }));
  waterMesh.renderOrder = 2; waterMesh.receiveShadow = true; farmRoot.add(waterMesh);
  { // rice: a tuft of four thin blades, planted in neat rows in every paddy
    const blades = [];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.ConeGeometry(0.022, 0.38, 4, 1, true); g.translate(0, 0.19, 0);
      const a = (k / 4) * TAU, tilt = k === 0 ? 0.05 : 0.36; g.rotateX(Math.sin(a) * tilt); g.rotateZ(-Math.cos(a) * tilt); blades.push(g.toNonIndexed());
    }
    const step = 0.46, cells = paddies.map((p) => [Math.floor((p.iw - 0.5) / step), Math.floor((p.id - 0.5) / step)]);
    const total = cells.reduce((s, [a, b]) => s + a * b, 0);
    const shoots = new THREE.InstancedMesh(mergeGeometries(blades), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), total);
    const dummy = new THREE.Object3D(), col = new THREE.Color(), a1 = new THREE.Color(0x6fba4a), a2 = new THREE.Color(0x9bd35c);
    let n = 0;
    paddies.forEach((p, pi) => {
      const [nx, nz] = cells[pi];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        dummy.position.set(p.cx - ((nx - 1) * step) / 2 + i * step + (rand() - 0.5) * 0.06, p.bed - 0.01, p.cz - ((nz - 1) * step) / 2 + j * step + (rand() - 0.5) * 0.06);
        dummy.rotation.y = rand() * TAU; dummy.scale.setScalar(0.85 + rand() * 0.35); dummy.updateMatrix();
        shoots.setMatrixAt(n, dummy.matrix); shoots.setColorAt(n, col.copy(a1).lerp(a2, rand())); n++;
      }
    });
    shoots.castShadow = false; shoots.receiveShadow = true; farmRoot.add(shoots);
  }

  // ---- Earth paths: ribbons laid on the ground ----------------------------------------------------------------
  {
    const pathGeos = [], dirt = new THREE.Color(0xc9a572);
    for (const line of PATHS) {
      const pts = [];
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 1.2));
        for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      pts.push(line[line.length - 1]);
      const pos = [], uv = [], nrm = [], colr = [], idx = [];
      pts.forEach(([x, z], i) => {
        const [px, pz] = pts[Math.max(0, i - 1)], [qx, qz] = pts[Math.min(pts.length - 1, i + 1)], dl = Math.hypot(qx - px, qz - pz) || 1, nx = -(qz - pz) / dl, nz = (qx - px) / dl;
        const taper = i === 0 || i === pts.length - 1 ? 0.55 : 1, hw = 0.45 * taper * (0.92 + 0.16 * Math.sin(i * 1.7 + line.length));
        for (const s of [-1, 1]) {
          const X = x + nx * hw * s, Z = z + nz * hw * s; pos.push(X, heightAt(X, Z) + 0.05, Z); uv.push(0, 0); nrm.push(0, 1, 0); colr.push(dirt.r, dirt.g, dirt.b);
        }
        if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx); pathGeos.push(g.toNonIndexed());
    }
    const m = new THREE.Mesh(mergeGeometries(pathGeos), flat(0xffffff, { vertexColors: true, side: THREE.DoubleSide })); m.receiveShadow = true; farmRoot.add(m);
  }

  // =========================================================================================================
  // Vegetable plots, hay shelter, scarecrows, goat pen, wallow, duck pond
  // =========================================================================================================
  const VEG = [[118, -57.5, 0], [118, -63.5, 0], [110.5, -62, 0.2], [123.5, -76, Math.PI / 2], [147, -96, 0.4], [162, -69, 1.2]];
  for (const [x, z, rot] of VEG) place(farmRoot, buildVegPlot(6, 4), x, z, rot, 3.3, 4.5);
  place(farmRoot, buildHayShelter(), 127, -64, 0.15, 3.4, 5);
  place(farmRoot, buildHayShelter(), 157, -92, -0.4, 3.4, 5);
  place(farmRoot, buildScarecrow(), 123.2, -57.5, 0.5, 0.8, 2.5);
  place(farmRoot, buildScarecrow(), 133, -62, -0.7, 0.8, 2.5);
  place(farmRoot, buildScarecrow(), 152, -97, 2.5, 0.8, 2.5);
  const pen = buildGoatPen(PEN.size);
  const penGroup = place(farmRoot, pen, PEN.x, PEN.z, 0, PEN.size / 2 + 0.3, PEN.size / 2 + 3);
  const penCols = worldColliders(pen.colliders, PEN.x, PEN.z, 0);
  const wallowY = maxH(WALLOW.x - 3, WALLOW.x + 3, WALLOW.z - 3, WALLOW.z + 3, 1) - 0.1;
  { const g = buildWallow(WALLOW.r).group; g.position.set(WALLOW.x, wallowY, WALLOW.z); farmRoot.add(g); keepClear(WALLOW.x, WALLOW.z, WALLOW.r + 3); }
  place(farmRoot, buildDuckPond(POND.r), POND.x, POND.z, 0, POND.r * 1.3, POND.r + 3.5);
  // A few fence runs of paddy markers are in the paddies; round the pen a trampled patch is already in the model.

  // =========================================================================================================
  // Goats: wander and graze inside the pen, butt heads now and then, can be petted
  // =========================================================================================================
  const GOAT_COLORS = [0xeadcc0, 0xc9a77c, 0xf3efe6];
  const half = PEN.size / 2 - 0.55, shelter = { x: PEN.x - PEN.size / 4 - 0.3 - 0.0, z: PEN.z - PEN.size / 2 + 1.0, hw: 1.7, hd: 1.2 }, trough = { x: PEN.x + PEN.size / 2 - 1.3, z: PEN.z - 0.6, hw: 0.95, hd: 0.5 };
  const penSpot = () => {
    for (let k = 0; k < 20; k++) {
      const x = PEN.x + (rand() * 2 - 1) * half, z = PEN.z + (rand() * 2 - 1) * half;
      if (Math.abs(x - shelter.x) < shelter.hw && Math.abs(z - shelter.z) < shelter.hd) continue;
      if (Math.abs(x - trough.x) < trough.hw && Math.abs(z - trough.z) < trough.hd) continue;
      return { x, z };
    }
    return { x: PEN.x, z: PEN.z + 1 };
  };
  const goats = GOAT_COLORS.map((c, i) => {
    const m = buildGoat(c); farmRoot.add(m.group);
    const s = penSpot();
    const g = { ...m, x: s.x, z: s.z, heading: rand() * TAU, mode: i === 1 ? 'stand' : 'graze', timer: 1 + rand() * 4, target: null, speed: 0, wig: 0, position: { x: s.x, z: s.z }, partner: null, id: i };
    return g;
  });
  let buttAt = 14;
  goats.forEach((g, i) => interactables.push({
    id: `farm-goat-${i}`, kind: 'goat', position: g.position,
    get markerY() { return groundAt(g.x, g.z) + 1.0; },
    prompt: () => 'E — pet goat',
    interact() { g.wig = 1.6; g.mode = 'stand'; g.timer = 2.8; g.target = null; g.partner = null; audio.play('baa'); ui.emote(new THREE.Vector3(g.x, groundAt(g.x, g.z) + 1.1, g.z), 'heart'); },
  }));
  function updateGoats(dt, elapsed, player) {
    buttAt -= dt;
    if (buttAt <= 0) { // two goats walk up to each other for a head-butting bout
      buttAt = 16 + rand() * 14;
      const free = goats.filter((g) => g.mode !== 'butt' && g.mode !== 'meet' && g.wig <= 0);
      if (free.length >= 2) {
        const [a, b] = free, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ang = rand() * Math.PI, ux = Math.cos(ang), uz = Math.sin(ang);
        const clampPen = (v, c) => Math.max(c - half + 0.4, Math.min(c + half - 0.4, v));
        const cx = clampPen(mx, PEN.x), cz = clampPen(mz, PEN.z);
        a.mode = b.mode = 'meet'; a.timer = b.timer = 9; a.partner = b; b.partner = a;
        a.target = { x: cx - ux * 0.5, z: cz - uz * 0.5 }; b.target = { x: cx + ux * 0.5, z: cz + uz * 0.5 };
      }
    }
    for (const g of goats) {
      g.wig = Math.max(0, g.wig - dt); g.timer -= dt;
      const prevX = g.x, prevZ = g.z; let walk = 0;
      if (g.mode === 'meet') {
        const dx = g.target.x - g.x, dz = g.target.z - g.z, d = Math.hypot(dx, dz);
        if (d < 0.12 || g.timer <= 0) {
          if (g.partner && g.partner.mode === 'meet' && Math.hypot(g.partner.target.x - g.partner.x, g.partner.target.z - g.partner.z) < 0.25 || g.timer <= 0) { g.mode = 'butt'; g.timer = 3.6; }
          else { g.speed = 0; }
          if (g.mode === 'butt' && g.partner) { g.partner.mode = 'butt'; g.partner.timer = 3.6; }
        } else { walk = 0.9; g.heading = turnToward(g.heading, Math.atan2(dx, dz), dt * 5); g.x += (dx / d) * walk * dt; g.z += (dz / d) * walk * dt; }
      } else if (g.mode === 'butt') {
        const p = g.partner; if (p) g.heading = turnToward(g.heading, Math.atan2(p.x - g.x, p.z - g.z), dt * 4);
        if (g.timer <= 0) { g.mode = 'stand'; g.timer = 1.5 + rand() * 2; g.partner = null; }
      } else if (g.mode === 'walk') {
        const dx = g.target.x - g.x, dz = g.target.z - g.z, d = Math.hypot(dx, dz);
        if (d < 0.2 || g.timer <= 0) { g.mode = rand() < 0.75 ? 'graze' : 'stand'; g.timer = 3 + rand() * 6; g.target = null; }
        else { walk = 0.75; g.heading = turnToward(g.heading, Math.atan2(dx, dz), dt * 4); g.x += (dx / d) * walk * dt; g.z += (dz / d) * walk * dt; }
      } else if (g.timer <= 0) { g.mode = 'walk'; g.target = penSpot(); g.timer = 12; }
      if (walk > 0 || g.mode === 'meet') {
        const next = resolveCollisions({ x: g.x, z: g.z }, 0.3, penCols);
        g.x = Math.max(PEN.x - half, Math.min(PEN.x + half, next.x)); g.z = Math.max(PEN.z - half, Math.min(PEN.z + half, next.z));
        // Do not walk through the others.
        for (const o of goats) if (o !== g && o.mode !== 'butt') { const ox = g.x - o.x, oz = g.z - o.z, od = Math.hypot(ox, oz); if (od < 0.55 && od > 1e-4 && g.mode !== 'meet') { g.x = o.x + (ox / od) * 0.55; g.z = o.z + (oz / od) * 0.55; } }
      }
      const moved = Math.hypot(g.x - prevX, g.z - prevZ), sp = dt > 0 ? moved / dt : 0; g.speed += (sp - g.speed) * Math.min(1, dt * 8);
      g.position.x = g.x; g.position.z = g.z;
      const wig = g.wig > 0 ? Math.min(1, g.wig) : 0;
      g.group.position.set(g.x, groundAt(g.x, g.z) + Math.abs(Math.sin(elapsed * 11 + g.id)) * 0.07 * wig, g.z);
      g.group.rotation.set(0, g.heading, Math.sin(elapsed * 16 + g.id) * 0.09 * wig);
      g.animate(elapsed, { mode: g.mode === 'meet' ? (walk > 0 ? 'walk' : 'stand') : g.mode, speed: g.speed });
    }
  }

  // =========================================================================================================
  // The buffalo: stands chewing near the wallow, wallows in the mud at midday, can be petted
  // =========================================================================================================
  const bm = buildBuffalo(); farmRoot.add(bm.group);
  const buf = { ...bm, x: WALLOW.x + 5.2, z: WALLOW.z - 1.5, heading: -2.0, mode: 'stand', timer: 6, target: null, speed: 0, wig: 0, position: { x: 0, z: 0 }, inMud: false };
  buf.position.x = buf.x; buf.position.z = buf.z;
  const grazeSpot = () => { const a = rand() * TAU, r = 4.6 + rand() * 3.5; return { x: WALLOW.x + Math.cos(a) * r, z: WALLOW.z + Math.sin(a) * r }; };
  interactables.push({
    id: 'farm-buffalo', kind: 'buffalo', position: buf.position,
    get markerY() { return groundAt(buf.x, buf.z) + 1.7; },
    prompt: () => 'E — pet buffalo',
    interact() { buf.wig = 2.2; buf.timer = Math.max(buf.timer, 3); audio.play('purr'); ui.emote(new THREE.Vector3(buf.x, groundAt(buf.x, buf.z) + 1.9, buf.z), 'heart'); },
  });
  function updateBuffalo(dt, elapsed, player, t) {
    buf.wig = Math.max(0, buf.wig - dt); buf.timer -= dt;
    const hot = t > 0.4 && t < 0.62, dxm = WALLOW.x - buf.x, dzm = WALLOW.z - buf.z, dm = Math.hypot(dxm, dzm);
    let walk = 0, mode = buf.mode;
    if (buf.wig > 0) { mode = buf.inMud ? 'wallow' : 'stand'; }
    else if (hot) {
      if (dm > 0.3 && !buf.inMud) { mode = 'walk'; walk = 0.85; buf.heading = turnToward(buf.heading, Math.atan2(dxm, dzm), dt * 3); buf.x += (dxm / dm) * walk * dt; buf.z += (dzm / dm) * walk * dt; }
      else { buf.inMud = true; mode = 'wallow'; buf.target = null; }
    } else {
      buf.inMud = false;
      if (buf.mode === 'wallow') { buf.mode = 'stand'; buf.timer = 2.5; }
      mode = buf.mode;
      if (mode === 'walk') {
        const dx = buf.target.x - buf.x, dz = buf.target.z - buf.z, d = Math.hypot(dx, dz);
        if (d < 0.3 || buf.timer <= 0) { buf.mode = 'stand'; buf.timer = 7 + rand() * 9; buf.target = null; mode = 'stand'; }
        else { walk = 0.7; buf.heading = turnToward(buf.heading, Math.atan2(dx, dz), dt * 2.5); buf.x += (dx / d) * walk * dt; buf.z += (dz / d) * walk * dt; }
      } else if (buf.timer <= 0) { buf.mode = 'walk'; buf.target = grazeSpot(); buf.timer = 20; mode = 'walk'; }
    }
    if (walk > 0) { const next = resolveCollisions({ x: buf.x, z: buf.z }, 0.7, penCols); buf.x = next.x; buf.z = next.z; }
    buf.speed += (walk - buf.speed) * Math.min(1, dt * 4);
    buf.position.x = buf.x; buf.position.z = buf.z;
    const inside = Math.hypot(buf.x - WALLOW.x, buf.z - WALLOW.z) < WALLOW.r * 1.25;
    const y = inside ? wallowY + 0.02 : groundAt(buf.x, buf.z), w = buf.wig > 0 ? Math.min(1, buf.wig) : 0;
    buf.group.position.set(buf.x, y, buf.z); buf.group.rotation.set(0, buf.heading, Math.sin(elapsed * 9) * 0.015 * w);
    buf.group.scale.setScalar(1 + w * Math.abs(Math.sin(elapsed * 6)) * 0.01);
    buf.animate(elapsed, { mode, speed: buf.speed });
  }

  // =========================================================================================================
  // Herons in the paddies: stand, stalk, now and then stab at the water; fly to another paddy when you come near
  // =========================================================================================================
  const herons = [3, 4, 6].map((pi, i) => {
    const m = buildHeron(); farmRoot.add(m.group); const p = paddies[pi];
    const h = { ...m, paddy: pi, x: p.cx + (rand() - 0.5) * (p.iw - 3), z: p.cz + (rand() - 0.5) * (p.id - 3), heading: rand() * TAU, mode: 'stand', timer: 2 + rand() * 3, target: null, flight: null, calm: 0, y: 0, id: i };
    return h;
  });
  const paddySpot = (pi) => { const p = paddies[pi]; return { x: p.cx + (rand() - 0.5) * (p.iw - 3), z: p.cz + (rand() - 0.5) * (p.id - 3) }; };
  function updateHerons(dt, elapsed, player) {
    for (const h of herons) {
      const pd = paddies[h.paddy];
      if (h.mode === 'fly') {
        const f = h.flight; f.u += dt / f.dur;
        const u = Math.min(1, f.u), e = u * u * (3 - 2 * u);
        h.x = f.x0 + (f.x1 - f.x0) * e; h.z = f.z0 + (f.z1 - f.z0) * e;
        h.y = f.y0 + (f.y1 - f.y0) * e + Math.sin(Math.PI * Math.min(1, u * 1.1)) * f.lift;
        h.heading = turnToward(h.heading, Math.atan2(f.x1 - f.x0, f.z1 - f.z0), dt * 5);
        if (u >= 1) { h.mode = 'stand'; h.timer = 2.5 + rand() * 3; h.calm = 3; h.paddy = f.to; h.y = paddies[f.to].bed; }
      } else {
        h.calm = Math.max(0, h.calm - dt); h.timer -= dt; h.y = pd.bed + 0.02;
        const dxp = h.x - player.position.x, dzp = h.z - player.position.z;
        if (h.calm <= 0 && dxp * dxp + dzp * dzp < 25) { // someone is near: off to the paddy furthest from them (not another heron's)
          const taken = herons.map((o) => (o.mode === 'fly' ? o.flight.to : o.paddy));
          const opts = paddies.map((p, k) => k).filter((k) => k !== h.paddy && !taken.includes(k));
          const pool = opts.length ? opts : paddies.map((p, k) => k).filter((k) => k !== h.paddy);
          let best = pool[0], bd = -1;
          for (const k of pool) { const p = paddies[k], d = Math.hypot(p.cx - player.position.x, p.cz - player.position.z) + rand() * 6; if (d > bd) { bd = d; best = k; } }
          const s = paddySpot(best), dist = Math.hypot(s.x - h.x, s.z - h.z);
          h.mode = 'fly'; h.flight = { x0: h.x, z0: h.z, x1: s.x, z1: s.z, y0: h.y, y1: paddies[best].bed, lift: 1.6 + Math.min(2.2, dist * 0.06), dur: 0.7 + dist / 5.5, u: 0, to: best };
          h.target = null;
        } else if (h.mode === 'stand' && h.timer <= 0) { const r = rand(); h.mode = r < 0.55 ? 'stalk' : r < 0.8 ? 'strike' : 'stand'; h.timer = h.mode === 'stalk' ? 4 + rand() * 4 : h.mode === 'strike' ? 5.2 : 2 + rand() * 3; h.target = h.mode === 'stalk' ? paddySpot(h.paddy) : null; }
        else if (h.mode === 'stalk') {
          const dx = h.target.x - h.x, dz = h.target.z - h.z, d = Math.hypot(dx, dz);
          if (d < 0.2 || h.timer <= 0) { h.mode = 'stand'; h.timer = 2 + rand() * 4; }
          else { h.heading = turnToward(h.heading, Math.atan2(dx, dz), dt * 2.5); h.x += (dx / d) * 0.32 * dt; h.z += (dz / d) * 0.32 * dt; }
        } else if (h.mode === 'strike' && h.timer <= 0) { h.mode = 'stand'; h.timer = 2 + rand() * 3; }
        // stay inside its paddy's water
        h.x = Math.max(pd.x0 + 1, Math.min(pd.x1 - 1, h.x)); h.z = Math.max(pd.z0 + 1, Math.min(pd.z1 - 1, h.z));
      }
      h.group.position.set(h.x, h.y, h.z); h.group.rotation.y = h.heading;
      h.animate(elapsed, { mode: h.mode, speed: h.mode === 'fly' ? 1.2 : 1 });
    }
  }

  // =========================================================================================================
  // Orchard: ~12 fruit trees in loose rows, three kinds (InstancedMesh per kind); shaking drops fruit to pick up
  // =========================================================================================================
  const treeSpots = [];
  { const cols = 4, rows = 3, sx = 5.2, sz = 5.4, r2 = rng(5);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = orchardC.x + (c - (cols - 1) / 2) * sx + (r % 2 ? 1.3 : -0.4) + (r2() - 0.5) * 1.3, z = orchardC.z + (r - (rows - 1) / 2) * sz + (r2() - 0.5) * 1.3;
      treeSpots.push({ x, z, kind: (c + r * 2) % 3, rot: r2() * TAU, scale: 0.92 + r2() * 0.22, y: heightAt(x, z) - 0.04, shake: 0 });
    } }
  const treeKinds = [0, 1, 2].map((kind) => {
    const src = buildOrchardTree(kind), mesh0 = src.group.children[0], spots = treeSpots.filter((t) => t.kind === kind);
    const im = new THREE.InstancedMesh(mesh0.geometry, mesh0.material, spots.length); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    orchardRoot.add(im); return { kind, im, spots, collider: src.colliders[0] };
  });
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler(), tv = new THREE.Vector3(), ts = new THREE.Vector3();
  const writeTree = (k, t, i) => {
    const s = t.shake > 0 ? t.shake : 0, amp = Math.sin(t.shake * 30) * 0.05 * Math.min(1, s * 2.5);
    te.set(amp, t.rot, amp * 0.7, 'YXZ'); tq.setFromEuler(te); tv.set(t.x, t.y, t.z); ts.setScalar(t.scale); k.im.setMatrixAt(i, tm.compose(tv, tq, ts));
  };
  treeKinds.forEach((k) => { k.spots.forEach((t, i) => writeTree(k, t, i)); k.im.instanceMatrix.needsUpdate = true; });
  const TREE_TOP = [2.5, 3.3, 2.8];
  treeKinds.forEach((k) => k.spots.forEach((t, i) => {
    const id = `farm-tree-${k.kind}-${i}`; t.id = id; keepClear(t.x, t.z, 2.4);
    colliders.push({ x: t.x, z: t.z, r: k.collider.r * t.scale + 0.03 });
    interactables.push({
      id, kind: 'tree', position: { x: t.x, z: t.z }, markerY: t.y + TREE_TOP[k.kind] * t.scale + 0.3,
      prompt: () => 'E — shake tree',
      interact() {
        t.shake = 0.9; audio.play('rustle');
        effects.puff(t.x, t.y + TREE_TOP[k.kind] * t.scale * 0.8, t.z, 6, k.kind === 2 ? 0x6fbf5a : 0x5aa655, 0.45, 0.9);
        deps.shakeFruit({ id, kind: 1, x: t.x, y: t.y, z: t.z }); // the island's tree rule: now and then an apple, one go per tree every 90 s
      },
    });
  }));

  // ---- Butterflies over the vegetable plots and the orchard
  const flyers = [[118, -60.5, 7], [125, -75, 6], [112.5, -105, 6], [123.5, -107.5, 6]].map(([x, z, n]) => {
    const b = buildButterflies(n); b.group.position.set(x, heightAt(x, z), z);
    (z < -100 ? orchardRoot : farmRoot).add(b.group); return b;
  });

  // =========================================================================================================
  // The far shore: fishing jetty, two row boats, drying nets and baskets
  // =========================================================================================================
  const landX = JETTY.x - JETTY.length / 2, deckY = heightAt(landX + 0.2, JETTY.z) + 0.03, jy = deckY - 0.5;
  const jetty = buildJetty(JETTY.length, 3.2);
  jetty.group.position.set(JETTY.x, jy, JETTY.z); jetty.group.rotation.y = JETTY.rot; shoreRoot.add(jetty.group);
  addPlatform({ shape: 'box', x: JETTY.x, z: JETTY.z, rot: JETTY.rot, hw: 1.0, hd: JETTY.length / 2, top: jy + 0.5, surface: 'wood', id: 'farm-jetty' });
  colliders.push(...worldColliders(jetty.colliders, JETTY.x, JETTY.z, JETTY.rot)); keepClear(landX, JETTY.z, 6);
  const boats = [[0x4f7fc9, 184.4, -59.3, Math.PI / 2 + 0.05], [0xe8503a, 186.6, -64.8, Math.PI / 2 - 0.07]].map(([c, x, z, rot]) => {
    const b = buildRowBoat(c); b.group.position.set(x, 0, z); b.group.rotation.y = rot; shoreRoot.add(b.group);
    colliders.push(...worldColliders(b.colliders, x, z, rot)); return b;
  });
  { // nets hung to dry on pairs of poles, and baskets, on the beach by the jetty
    const m = new Mesher(), NET = 0x9db08c, POLE = 0x8d6643, ROPE = 0xd8c08a;
    const rack = (x, z, yaw) => {
      const y = heightAt(x, z); m.set(x, y, z, yaw);
      for (const sx of [-1.3, 1.3]) { m.seg([sx, -0.1, 0], [sx * 1.02, 2.3, 0], 0.07, 0.05, POLE, 6); m.sph(0.07, 0xc9a85a, sx * 1.02, 2.33, 0); }
      m.seg([-1.3, 2.15, 0], [1.3, 2.15, 0], 0.03, 0.03, ROPE, 5);
      for (let k = 0; k <= 8; k++) { const x0 = -1.2 + k * 0.3, sag = 1.0 + 0.15 * Math.sin(k * 1.9); m.seg([x0, 2.12, 0.02], [x0 + Math.sin(k) * 0.05, 2.12 - sag, 0.04], 0.012, 0.01, NET, 4); }
      for (let r = 1; r <= 4; r++) { const yy = 2.12 - r * 0.22; for (let k = 0; k < 8; k++) m.seg([-1.2 + k * 0.3, yy - (k % 2) * 0.03, 0.03], [-0.9 + k * 0.3, yy - ((k + 1) % 2) * 0.03, 0.03], 0.009, 0.009, NET, 3); }
      for (let k = 0; k < 6; k++) m.sph(0.05, k % 2 ? 0xf2873a : 0xe8503a, -1.0 + k * 0.4, 2.1, 0.06);
      m.sph(0.3, NET, -0.9, 0.1, 0.9, 1.5, 0.4, 1.1); m.sph(0.2, 0x8fa386, -0.6, 0.12, 1.1, 1.4, 0.45, 1); // a heap of net on the ground
    };
    rack(170.2, -69.5, 0.25); rack(171.2, -53.8, -0.2);
    const basket = (x, z, fruit) => {
      const y = heightAt(x, z); m.set(x, y, z, 0);
      m.cyl(0.3, 0.22, 0.34, 0xc9a25a, 0, 0.17, 0, 10); m.cyl(0.31, 0.31, 0.04, 0x8d6643, 0, 0.35, 0, 10); m.cyl(0.24, 0.24, 0.02, 0x6b4a33, 0, 0.33, 0, 10);
      if (fruit) for (let k = 0; k < 5; k++) m.sph(0.07, fruit[k % fruit.length], Math.cos(k * 1.3) * 0.12, 0.38, Math.sin(k * 1.3) * 0.12);
      m.seg([-0.28, 0.32, 0], [0, 0.62, 0], 0.016, 0.016, 0x8d6643, 4); m.seg([0, 0.62, 0], [0.28, 0.32, 0], 0.016, 0.016, 0x8d6643, 4);
    };
    basket(171.6, -65.4, [0xaebfd0, 0xe39a7a]); basket(171.0, -64.6, null); basket(171.8, -58.8, [0xf2b63b, 0xf2873a]); basket(170.8, -59.6, [0xaebfd0]); basket(172.2, -66.4, null);
    shoreRoot.add(m.build(true));
    colliders.push({ x: 170.2, z: -69.5, r: 0.35 }, { x: 171.2, z: -53.8, r: 0.35 });
  }

  // ---- Colliders: static plus the animals --------------------------------------------------------------------
  const animalCols = [];
  const allColliders = () => { animalCols.length = 0; for (const g of goats) animalCols.push({ x: g.x, z: g.z, r: 0.38 }); animalCols.push({ x: buf.x, z: buf.z, r: buf.inMud ? 0.5 : 0.75 }); return colliders.concat(animalCols); };

  return {
    interactables,
    colliders: allColliders,
    update(dt, elapsed, player, night = 0) {
      const px = player.position.x, pz = player.position.z;
      const nearFarm = Math.hypot(px - farmC.x, pz - farmC.z), nearOrchard = Math.hypot(px - orchardC.x, pz - orchardC.z), nearShore = Math.hypot(px - jettyC.x, pz - jettyC.z);
      farmRoot.visible = nearFarm < 85; orchardRoot.visible = nearOrchard < 85; shoreRoot.visible = nearShore < 85;
      if (nearFarm < 60) {
        updateGoats(dt, elapsed, player); updateBuffalo(dt, elapsed, player, deps.dayTime()); updateHerons(dt, elapsed, player);
      }
      if (farmRoot.visible || orchardRoot.visible) for (const f of flyers) if (f.group.parent.visible) f.update(dt, elapsed);
      // Shaking trees sway for a moment.
      for (const k of treeKinds) {
        let dirty = false;
        k.spots.forEach((t, i) => { if (t.shake > 0) { t.shake = Math.max(0, t.shake - dt); writeTree(k, t, i); dirty = true; } });
        if (dirty) k.im.instanceMatrix.needsUpdate = true;
      }
      if (shoreRoot.visible) for (const b of boats) b.update(dt, elapsed);
    },
  };
}
