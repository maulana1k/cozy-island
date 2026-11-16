// INTERNAL. The village farm in its valley, and the far shore: nine rice paddies on the levelled paddy
// fields (AREAS.paddyFields), vegetable plots, hay shelters, scarecrows, a goat pen (3 goats), a buffalo
// wallow (1 water buffalo), a duck pond and the orchard (12 fruit trees), all set on the valley's gentlest
// ground (found by a search: off the terraces, the ridge, the stream, the paths and the paddies); plank
// footbridges at both stream crossings; low stone walls, hedges and bamboo fences round plots, pen and
// orchard with gate gaps (and a little worn path to each gate); herons in the paddies; butterflies; and
// the fishing jetty with two row boats, drying nets and baskets on the far shore.
//
// Cost: all paddy banks, bridges and shore props are welded into a few meshes, every rice shoot is ONE
// InstancedMesh, all walls/hedges/fences are ONE mesh, and the orchard is three InstancedMeshes (one per
// kind of tree). Groups hide beyond ~85 m of their centre; animals only update within ~60 m.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flat } from '../build.js';
import { AREAS } from '../../config.js';
import { groundKind } from '../../logic/terrain.js';
import { resolveCollisions } from '../../logic/collision.js';
import { paintGround } from '../ground.js';
import { shakeAmp, shakeWave } from '../scatter.js';
import { buildVegPlot, buildGoatPen, buildHayShelter, buildScarecrow, buildWallow, buildOrchardTree, buildDuckPond, buildGoat, buildBuffalo } from '../../kit/farm.js';
import { buildStoneWall, buildHedge, buildFenceSection, buildGate } from '../../kit/yard.js';
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
  at(geo, hex, lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1, tilt = 0) {
    const [x, y, z] = this.tw(lx, ly, lz);
    this.push(geo, hex, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, this.yaw + ry, 0, 'YXZ')), new THREE.Vector3(sx, sy, sz)));
  }
  box(w, h, d, hex, lx, ly, lz, ry = 0, tilt = 0) { this.at(new THREE.BoxGeometry(w, h, d), hex, lx, ly, lz, ry, 1, 1, 1, tilt); }
  cyl(r0, r1, h, hex, lx, ly, lz, seg = 8) { this.at(new THREE.CylinderGeometry(r0, r1, h, seg), hex, lx, ly, lz); }
  sph(r, hex, lx, ly, lz, sx = 1, sy = 1, sz = 1, w = 8, h = 6) { this.at(new THREE.SphereGeometry(r, w, h), hex, lx, ly, lz, 0, sx, sy, sz); }
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
// Welds kit pieces (yard walls, hedges, fences, gates: all share one material) into one mesh.
class Welder {
  constructor() { this.list = []; this.mat = null; }
  add(made, x, y, z, yaw) {
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    made.group.updateMatrixWorld(true);
    made.group.traverse((o) => {
      if (!o.isMesh) return;
      this.mat = this.mat || o.material;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(m4, o.matrixWorld));
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
      this.list.push(g);
    });
  }
  build() { if (!this.list.length) return null; const m = new THREE.Mesh(mergeGeometries(this.list), this.mat); m.castShadow = true; m.receiveShadow = true; return m; }
}

// ---- Fixed places ------------------------------------------------------------------------------------------
const JETTY = { x: 179.5, z: -62, length: 14, rot: Math.PI / 2 }; // its landward end is at x = 172.5, where the beach is about 1 m up
const FIELDS = AREAS.paddyFields, POLY = AREAS.valley.outline;
const inPoly = (x, z) => { let c = false; for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) { const a = POLY[i], b = POLY[j]; if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c; } return c; };
const rectDist = (x, z, f) => { const c = Math.cos(f.rot), s = Math.sin(f.rot), wx = x - f.x, wz = z - f.z, lx = wx * c - wz * s, lz = wx * s + wz * c; return Math.hypot(Math.max(Math.abs(lx) - f.hw, 0), Math.max(Math.abs(lz) - f.hd, 0)); };
// The nearest point on any of the plan's paths (they are painted on the ground already).
const PATH_LINES = Object.entries(AREAS.paths).filter(([k]) => !['main', 'walkLow', 'walkSecond', 'walkSquare', 'walkTop', 'jetty'].includes(k)).map(([, l]) => l);
function nearestPath(x, z) {
  let best = { d: Infinity, x: 0, z: 0 };
  for (const L of PATH_LINES) for (let i = 0; i < L.length - 1; i++) {
    const a = L[i], b = L[i + 1], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz))), px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz };
  }
  return best;
}

export function create(scene, deps) {
  const { heightAt, groundAt, addPlatform, keepClear, audio, ui, effects } = deps;
  const rand = rng(97);
  const colliders = [];
  const interactables = [];
  const mk = (name) => { const g = new THREE.Group(); g.name = name; scene.add(g); return g; };
  const farmRoot = mk('farm'), orchardRoot = mk('orchard'), shoreRoot = mk('shore');
  const farmC = AREAS.farm, orchardC = AREAS.orchard, jettyC = { x: JETTY.x, z: JETTY.z };

  const maxH = (x0, x1, z0, z1, step = 1) => { let m = -1e9; for (let x = x0; x <= x1 + 1e-6; x += step) for (let z = z0; z <= z1 + 1e-6; z += step) m = Math.max(m, heightAt(x, z)); return m; };
  const toWorld = (x, z, rot, lx, lz) => ({ x: x + lx * Math.cos(rot) + lz * Math.sin(rot), z: z - lx * Math.sin(rot) + lz * Math.cos(rot) });
  const worldColliders = (list, x, z, rot) => list.map((c) => {
    const p = toWorld(x, z, rot, c.x, c.z);
    return c.r !== undefined ? { x: p.x, z: p.z, r: c.r } : { x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: (c.rot || 0) + rot };
  });
  const rangeAt = (x, z, r) => { let a = heightAt(x, z), b = a; for (let k = 0; k < 12; k++) { const q = (k / 12) * TAU; for (const f of [0.5, 1]) { const h = heightAt(x + Math.cos(q) * r * f, z + Math.sin(q) * r * f); a = Math.min(a, h); b = Math.max(b, h); } } return b - a; };
  // The way the contours run at a point, as a heading for a long thing (local +x along the slope's side).
  const contourRot = (x, z) => { const e = 1.5, gx = heightAt(x + e, z) - heightAt(x - e, z), gz = heightAt(x, z + e) - heightAt(x, z - e); return Math.hypot(gx, gz) < 0.03 ? 0 : Math.atan2(-gx, -gz); };

  // ---- Finding level ground: a disc of radius r that is in the valley, off the terraces, the ridge, the stream,
  // the paths and the paddies, no steeper than `tol` (height range over the disc), clear of what is placed.
  const taken = [];
  const valid = (x, z, r, o = {}) => {
    if (!inPoly(x, z)) return false;
    const g = groundKind(x, z); if (!g) return false;
    if (g.stream < r + 1.8 + (o.stream || 0) || g.terrace > 0.02 || g.face > 0 || g.step > 0 || g.forest > -2 || g.river < r + 3 || g.path < r + (o.path ?? 0.8)) return false;
    for (const f of FIELDS) if (rectDist(x, z, f) < r + 0.9) return false;
    for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < r + t.r + (o.gap ?? 0.4)) return false;
    return rangeAt(x, z, r) <= (o.tol ?? 1.0);
  };
  function findSpot(pref, r, o = {}) {
    for (let ring = 0; ring <= 60; ring++) {
      const n = Math.max(1, ring * 6), rr = ring * 1.5, a0 = rand() * TAU;
      let best = null, bs = 1e9;
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * TAU, x = pref.x + Math.cos(a) * rr, z = pref.z + Math.sin(a) * rr;
        if (valid(x, z, r, o)) { const s = rangeAt(x, z, r); if (s < bs) { bs = s; best = { x, z }; } }
      }
      if (best) { if (!o.noTake) taken.push({ x: best.x, z: best.z, r }); return best; }
    }
    return null;
  }
  const layout = {};

  // Puts a kit model on the ground (at the highest ground under it, so nothing sinks), adds its colliders.
  function place(parent, made, x, z, rot = 0, r = 1.6, clear = r + 1) {
    const g = made.group; g.position.set(x, maxH(x - r, x + r, z - r, z + r, r / 2) - 0.02, z); g.rotation.y = rot; parent.add(g);
    colliders.push(...worldColliders(made.colliders || [], x, z, rot)); keepClear(x, z, clear);
    return g;
  }

  // =========================================================================================================
  // Paddies: one on each levelled paddy field, same size and level. Earth skirt down to the lowest ground, a
  // grass-topped bank all round, still water over a muddy bed. One mesh for every bank, one for every water
  // sheet, ONE InstancedMesh for every rice shoot.
  // =========================================================================================================
  const EARTH = 0xa07650, EARTH_DARK = 0x6b4a33, GRASS = 0x8fc65c, BW = 0.45, BH = 0.24;
  const bank = new Mesher(), waters = [], paddies = [];
  FIELDS.forEach((f, i) => {
    const w = f.hw * 2, d = f.hd * 2, iw = w - BW * 2, id = d - BW * 2;
    const fy = f.y ?? maxH(f.x - 2, f.x + 2, f.z - 2, f.z + 2), level = fy - 0.08;           // the bed's top is at the field's own level
    let low = 1e9; const c = Math.cos(f.rot), s = Math.sin(f.rot);
    for (let lx = -f.hw - 0.7; lx <= f.hw + 0.7; lx += 1) for (let lz = -f.hd - 0.7; lz <= f.hd + 0.7; lz += 1) low = Math.min(low, heightAt(f.x + lx * c + lz * s, f.z - lx * s + lz * c));
    low -= 0.12;
    const top = level + BH, h = top - low, my = low + h / 2;
    bank.set(f.x, 0, f.z, f.rot);
    bank.box(iw + 0.1, 0.1 + (level - low), id + 0.1, EARTH_DARK, 0, low + (0.1 + level - low) / 2, 0);   // bed, solid down to the ground
    for (const [bw_, bd_, x, z] of [[w, BW, 0, -f.hd + BW / 2], [w, BW, 0, f.hd - BW / 2], [BW, id, -f.hw + BW / 2, 0], [BW, id, f.hw - BW / 2, 0]]) {
      bank.box(bw_, h, bd_, EARTH, x, my, z); bank.box(bw_ - 0.04, 0.03, bd_ * 0.7, GRASS, x, top + 0.012, z);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bank.sph(0.34, EARTH, sx * (f.hw - 0.2), level + 0.1, sz * (f.hd - 0.2), 1, 0.55, 1, 6, 4);
    for (let k = 0; k < Math.round(w + d) / 2; k++) bank.sph(0.1 + rand() * 0.06, rand() < 0.5 ? 0x7fcb5a : GRASS, (rand() - 0.5) * (w - 1.2), top + 0.04, (k % 2 ? 1 : -1) * (f.hd - BW / 2) + (rand() - 0.5) * 0.2, 1, 0.7, 1, 5, 3);
    if (i % 2 === 0) { bank.cyl(0.035, 0.04, 1.0, 0xb98a5f, f.hw - 0.3, top + 0.4, f.hd - 0.3, 6); bank.box(0.28, 0.16, 0.02, 0xe8554e, f.hw - 0.45, top + 0.9, f.hd - 0.3); }
    const wg = new THREE.PlaneGeometry(iw, id); wg.rotateX(-Math.PI / 2); wg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(f.x, level + BH - 0.05, f.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f.rot, 0)), new THREE.Vector3(1, 1, 1))); waters.push(wg);
    paddies.push({ f, cx: f.x, cz: f.z, rot: f.rot, c, s, iw, id, hw: f.hw, hd: f.hd, level, bed: level + 0.1 });
    addPlatform({ shape: 'box', x: f.x, z: f.z, rot: f.rot, hw: iw / 2, hd: id / 2, top: level + 0.1, surface: 'mud', id: `paddy-${i}` });
    for (const [hw, hd, x, z] of [[w / 2, BW / 2, 0, -f.hd + BW / 2], [w / 2, BW / 2, 0, f.hd - BW / 2], [BW / 2, id / 2, -f.hw + BW / 2, 0], [BW / 2, id / 2, f.hw - BW / 2, 0]]) {
      const p = toWorld(f.x, f.z, f.rot, x, z); addPlatform({ shape: 'box', x: p.x, z: p.z, rot: f.rot, hw, hd, top: top + 0.02, surface: 'grass', id: `paddy-${i}-bank` });
    }
    for (let lx = -f.hw + 1.5; lx <= f.hw - 1; lx += 3.5) for (let lz = -f.hd; lz <= f.hd; lz += 3) { const p = toWorld(f.x, f.z, f.rot, lx, lz); keepClear(p.x, p.z, 3); }
  });
  farmRoot.add(bank.build(false));
  const waterMesh = new THREE.Mesh(mergeGeometries(waters.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: 0x6fc2b6, transparent: true, opacity: 0.62, roughness: 0.1, metalness: 0, depthWrite: false }));
  waterMesh.renderOrder = 2; waterMesh.receiveShadow = true; farmRoot.add(waterMesh);
  { // rice: a tuft of three thin blades, planted in neat rows in every paddy
    const blades = [];
    for (let k = 0; k < 3; k++) {
      const g = new THREE.ConeGeometry(0.024, 0.38, 4, 1, true); g.translate(0, 0.19, 0);
      const a = (k / 3) * TAU, tilt = k === 0 ? 0.05 : 0.36; g.rotateX(Math.sin(a) * tilt); g.rotateZ(-Math.cos(a) * tilt); blades.push(g.toNonIndexed());
    }
    const step = 0.5, cells = paddies.map((p) => [Math.floor((p.iw - 0.5) / step), Math.floor((p.id - 0.5) / step)]);
    const total = cells.reduce((s, [a, b]) => s + a * b, 0);
    const shoots = new THREE.InstancedMesh(mergeGeometries(blades), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), total);
    const dummy = new THREE.Object3D(), col = new THREE.Color(), a1 = new THREE.Color(0x6fba4a), a2 = new THREE.Color(0x9bd35c);
    let n = 0;
    paddies.forEach((p, pi) => {
      const [nx, nz] = cells[pi];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const lx = -((nx - 1) * step) / 2 + i * step + (rand() - 0.5) * 0.06, lz = -((nz - 1) * step) / 2 + j * step + (rand() - 0.5) * 0.06, q = toWorld(p.cx, p.cz, p.rot, lx, lz);
        dummy.position.set(q.x, p.bed - 0.01, q.z); dummy.rotation.y = rand() * TAU; dummy.scale.setScalar(0.85 + rand() * 0.35); dummy.updateMatrix();
        shoots.setMatrixAt(n, dummy.matrix); shoots.setColorAt(n, col.copy(a1).lerp(a2, rand())); n++;
      }
    });
    shoots.castShadow = false; shoots.receiveShadow = true; farmRoot.add(shoots);
  }

  // =========================================================================================================
  // Plank footbridges over the stream at both crossings
  // =========================================================================================================
  {
    const m = new Mesher(), WOOD = 0xb98a5e, WOOD_D = 0x8c6444, ROPE = 0xd8c08a;
    for (const cr of AREAS.streamCrossings) {
      const dx = Math.sin(cr.rot), dz = Math.cos(cr.rot); // the direction across
      let ta = 2.5, tb = 2.5; // walk outwards until clear of the channel and its bank, each side
      while (ta < 7 && groundKind(cr.x - dx * ta, cr.z - dz * ta).stream < 2.1) ta += 0.25;
      while (tb < 7 && groundKind(cr.x + dx * tb, cr.z + dz * tb).stream < 2.1) tb += 0.25;
      const A = { x: cr.x - dx * (ta + 0.3), z: cr.z - dz * (ta + 0.3) }, B = { x: cr.x + dx * (tb + 0.3), z: cr.z + dz * (tb + 0.3) };
      const L = Math.hypot(B.x - A.x, B.z - A.z), y0 = heightAt(A.x, A.z) + 0.07, y1 = heightAt(B.x, B.z) + 0.07, arch = 0.25, width = 1.7;
      addPlatform({ shape: 'strip', a: A, b: B, width, y0, y1, arch, surface: 'wood', id: `farm-bridge-${cr.path}` });
      const yaw = Math.atan2(B.x - A.x, B.z - A.z), deck = (u) => y0 + (y1 - y0) * u + arch * Math.sin(Math.PI * u);
      m.set(A.x, 0, A.z, yaw);
      const n = Math.ceil(L / 0.36);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, tilt = Math.atan2(deck(Math.min(1, u + 0.02)) - deck(Math.max(0, u - 0.02)), L * 0.04);
        m.box(width + 0.2, 0.07, 0.34, i % 3 ? WOOD : 0xc79a62, 0, deck(u) - 0.045, u * L, 0, -tilt);
      }
      for (const side of [-1, 1]) {
        const x = side * (width / 2 - 0.1), pts = [0, 0.25, 0.5, 0.75, 1];
        for (let k = 0; k < 8; k++) { const u0 = k / 8, u1 = (k + 1) / 8; m.seg([x, deck(u0) - 0.17, u0 * L], [x, deck(u1) - 0.17, u1 * L], 0.07, 0.07, WOOD_D, 5); }
        const posts = pts.map((u) => [side * (width / 2 + 0.05), deck(u), u * L]);
        for (const [px, py, pz] of posts) m.cyl(0.06, 0.07, 1.1, WOOD_D, px, py + 0.45, pz, 6);
        for (let k = 0; k < posts.length - 1; k++) m.seg([posts[k][0], posts[k][1] + 0.95, posts[k][2]], [posts[k + 1][0], posts[k + 1][1] + 0.95, posts[k + 1][2]], 0.025, 0.025, ROPE, 5);
        for (const u of [0.3, 0.7]) m.cyl(0.09, 0.11, deck(u) + 1.4, WOOD_D, x, (deck(u) - 1.4) / 2, u * L, 6); // legs standing in the stream bed
        for (const u of [0, 1]) { const p = toWorld(A.x, A.z, yaw, side * (width / 2 + 0.05), u * L); colliders.push({ x: p.x, z: p.z, r: 0.1 }); }
      }
      keepClear(cr.x, cr.z, 4);
    }
    if (m.list.length) farmRoot.add(m.build(true));
  }

  // =========================================================================================================
  // Boundaries: low stone walls, hedges and bamboo fences round a rectangle, with a gate gap facing the nearest
  // path (and a worn path to it). A stretch that would stand in the stream, on a path or on a steep bit is left out.
  // =========================================================================================================
  const yard = new Welder();
  function ring(cx, cz, rot, hw, hd, k0, { gate = true } = {}) {
    const c = Math.cos(rot), s = Math.sin(rot), P = (lx, lz) => ({ x: cx + lx * c + lz * s, z: cz - lx * s + lz * c });
    // sides as [local start, local end, outward normal in local axes]
    const sides = [[[-hw, -hd], [hw, -hd], [0, -1]], [[hw, -hd], [hw, hd], [1, 0]], [[hw, hd], [-hw, hd], [0, 1]], [[-hw, hd], [-hw, -hd], [-1, 0]]];
    const np = nearestPath(cx, cz);
    let gateSide = -1, best = -2;
    if (gate && np.d < 30) sides.forEach((sd, i) => { const n = sd[2], nx = n[0] * c + n[1] * s, nz = -n[0] * s + n[1] * c, tx = np.x - cx, tz = np.z - cz, dl = Math.hypot(tx, tz) || 1, dot = (nx * tx + nz * tz) / dl; if (dot > best) { best = dot; gateSide = i; } });
    sides.forEach(([a, b, n], i) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, style = ['stone', 'hedge', 'stone', 'fence'][(i + k0) % 4];
      const gw = i === gateSide ? 1.5 : 0, mid = len / 2, cuts = gw ? [[0, mid - gw / 2], [mid + gw / 2, len]] : [[0, len]];
      for (const [s0, s1] of cuts) {
        const pieces = Math.max(1, Math.ceil((s1 - s0) / 3)), pl = (s1 - s0) / pieces;
        for (let p = 0; p < pieces; p++) {
          const t0 = s0 + p * pl, t1 = t0 + pl, A = P(a[0] + ux * t0, a[1] + uz * t0), B = P(a[0] + ux * t1, a[1] + uz * t1), M = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
          let bad = false;
          for (const q of [A, M, B]) { const g = groundKind(q.x, q.z); if (!g || g.stream < 2.4 || g.path < 1.6 || g.terrace > 0.02 || g.face > 0) bad = true; }
          if (bad || Math.abs(heightAt(A.x, A.z) - heightAt(B.x, B.z)) > 0.7) continue;
          let paddyHit = false; for (const f of FIELDS) if (rectDist(M.x, M.z, f) < 1.0) paddyHit = true;
          if (paddyHit) continue;
          const yaw = Math.atan2(-(B.z - A.z), B.x - A.x), y = Math.min(heightAt(A.x, A.z), heightAt(B.x, B.z), heightAt(M.x, M.z)) - 0.08;
          const made = style === 'stone' ? buildStoneWall(pl, 0.78) : style === 'hedge' ? buildHedge(pl, 0.9) : buildFenceSection(pl);
          yard.add(made, A.x, y, A.z, yaw); colliders.push(...worldColliders(made.colliders, A.x, A.z, yaw));
        }
      }
      if (i === gateSide) {
        const G = P(a[0] + ux * mid, a[1] + uz * mid), nx = n[0] * c + n[1] * s, nz = -n[0] * s + n[1] * c, made = buildGate(1.4), yaw = Math.atan2(-nx, -nz);
        const gy = heightAt(G.x, G.z) - 0.02; yard.add(made, G.x, gy, G.z, yaw); colliders.push(...worldColliders(made.colliders, G.x, G.z, yaw));
        // a worn path from the gate to the nearest path
        const out = { x: G.x + nx * 0.9, z: G.z + nz * 0.9 };
        if (np.d < 26) paintGround({ kind: 'path', path: [out, { x: (out.x + np.x) / 2, z: (out.z + np.z) / 2 }, { x: np.x, z: np.z }], width: 1.1, tag: 'farm-spurs' });
      }
    });
  }

  // =========================================================================================================
  // Placing everything on the valley's level ground
  // =========================================================================================================
  // =========================================================================================================
  // Orchard (placed first, it needs the most flat ground): 12 fruit trees in loose rows, three kinds (InstancedMesh per kind); shaking drops fruit to pick up
  // =========================================================================================================
  const treeSpots = [];
  { const cols = 4, rows = 3, sx = 4.3, sz = 4.4, r2 = rng(5), OC = { x: orchardC.x + 3.5, z: orchardC.z + 0.5 };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const pref = { x: OC.x + (c - (cols - 1) / 2) * sx + (r % 2 ? 1.2 : -0.4) + (r2() - 0.5) * 1.2, z: OC.z + (r - (rows - 1) / 2) * sz + (r2() - 0.5) * 1.2 };
      const s = findSpot(pref, 2.1, { tol: 0.9, stream: 0.2, path: 0.8, gap: 0.2 });
      if (s) treeSpots.push({ x: s.x, z: s.z, kind: (c + r * 2) % 3, rot: r2() * TAU, scale: 0.92 + r2() * 0.22, y: heightAt(s.x, s.z) - 0.04, shake: 0 });
    } }
  layout.trees = treeSpots.length;
  if (treeSpots.length) { // a low wall round the orchard's trees, leaving gaps where paths or the stream pass
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const t of treeSpots) { x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); z0 = Math.min(z0, t.z); z1 = Math.max(z1, t.z); }
    ring((x0 + x1) / 2, (z0 + z1) / 2, 0, (x1 - x0) / 2 + 3.2, (z1 - z0) / 2 + 3.2, 0);
  }
  const PEN_SIZE = 6;
  const pensSpot = findSpot({ x: 68, z: -78 }, 3.9, { tol: 0.9, stream: -0.4, path: 0.3 });
  const PEN = pensSpot ? { ...pensSpot, size: PEN_SIZE, rot: 0 } : { x: 100, z: -96, size: PEN_SIZE, rot: 0 };
  { const np = nearestPath(PEN.x, PEN.z); PEN.rot = np.d < 60 ? Math.atan2(np.x - PEN.x, np.z - PEN.z) : 0; layout.pen = { x: +PEN.x.toFixed(1), z: +PEN.z.toFixed(1), rot: +PEN.rot.toFixed(3) }; }
  const wallowSpot = findSpot({ x: 111, z: -97 }, 4.2, { tol: 1.4, stream: -2.6, path: 0.0 }), WALLOW = { ...(wallowSpot || { x: 114, z: -97 }), r: 3 };
  const pondSpot = findSpot({ x: 97, z: -94 }, 4.2, { tol: 1.4, stream: -2.6, path: 0.0 }), POND = { ...(pondSpot || { x: 112, z: -99 }), r: 3.5, ok: !!pondSpot };
  layout.wallow = { x: +WALLOW.x.toFixed(1), z: +WALLOW.z.toFixed(1) }; layout.pond = { x: +POND.x.toFixed(1), z: +POND.z.toFixed(1) };
  const hayPrefs = [{ x: 70, z: -80 }, { x: 118, z: -92 }];
  const hays = hayPrefs.map((p) => findSpot(p, 3.2, { tol: 1.0, stream: -0.4, path: 0.3 })).filter(Boolean);
  const vegPrefs = [{ x: 68, z: -85 }, { x: 94, z: -96 }, { x: 128, z: -97 }, { x: 80, z: -96 }];
  const vegs = vegPrefs.map((p) => findSpot(p, 3.2, { tol: 1.5, stream: -0.4, path: 0.3 })).filter(Boolean);
  layout.veg = vegs.map((v) => [+v.x.toFixed(1), +v.z.toFixed(1)]); layout.hay = hays.map((v) => [+v.x.toFixed(1), +v.z.toFixed(1)]);
  const scarecrows = [vegs[0] && { x: vegs[0].x + 5.2, z: vegs[0].z }, vegs[1] && { x: vegs[1].x, z: vegs[1].z + 5.2 }].filter(Boolean).map((p) => findSpot(p, 1.0, { tol: 0.6, path: 0.5 })).filter(Boolean);

  vegs.forEach((v, i) => {
    const rot = contourRot(v.x, v.z); place(farmRoot, buildVegPlot(6, 4, 0.5 + rangeAt(v.x, v.z, 3.3)), v.x, v.z, rot, 3.3, 4.6);
    paintGround({ kind: 'dirt', rect: { x: v.x, z: v.z, rot, hw: 3.5, hd: 2.5 }, strength: 0.7, tag: 'farm-plots' });
    ring(v.x, v.z, rot, 3.9, 2.9, i);
  });
  hays.forEach((h, i) => place(farmRoot, buildHayShelter(), h.x, h.z, contourRot(h.x, h.z) + (i ? 0.3 : 0), 3.4, 5));
  scarecrows.forEach((s, i) => place(farmRoot, buildScarecrow(), s.x, s.z, rand() * TAU, 0.8, 2.5));
  const pen = buildGoatPen(PEN.size);
  place(farmRoot, pen, PEN.x, PEN.z, PEN.rot, PEN.size / 2 + 0.3, PEN.size / 2 + 3);
  const wallowY = maxH(WALLOW.x - 3, WALLOW.x + 3, WALLOW.z - 3, WALLOW.z + 3, 1) - 0.1;
  { const g = buildWallow(WALLOW.r, 0.6 + rangeAt(WALLOW.x, WALLOW.z, 3.9)).group; g.position.set(WALLOW.x, wallowY, WALLOW.z); farmRoot.add(g); keepClear(WALLOW.x, WALLOW.z, WALLOW.r + 3);
    paintGround({ kind: 'mud', circle: { x: WALLOW.x, z: WALLOW.z, r: WALLOW.r * 1.1 }, edge: 0.8, tag: 'farm-wet' }); paintGround({ kind: 'damp', circle: { x: WALLOW.x, z: WALLOW.z, r: WALLOW.r * 1.9 }, edge: 1.5, strength: 0.7, tag: 'farm-wet' }); }
  if (POND.ok) {
    place(farmRoot, buildDuckPond(POND.r, 0.6 + rangeAt(POND.x, POND.z, POND.r * 1.3)), POND.x, POND.z, 0, POND.r * 1.3, POND.r + 3.5);
    paintGround({ kind: 'damp', circle: { x: POND.x, z: POND.z, r: POND.r * 1.9 }, edge: 1.5, strength: 0.8, tag: 'farm-wet' });
  }
  { const np = nearestPath(PEN.x, PEN.z); if (np.d < 26) { const gp = toWorld(PEN.x, PEN.z, PEN.rot, 0, PEN.size / 2 + 0.9); paintGround({ kind: 'path', path: [gp, { x: (gp.x + np.x) / 2, z: (gp.z + np.z) / 2 }, { x: np.x, z: np.z }], width: 1.1, tag: 'farm-spurs' }); } }

  // =========================================================================================================
  // Goats: wander and graze inside the pen, butt heads now and then, can be petted. Positions are in the pen's
  // own frame (it can face any way); the world position is worked out each frame.
  // =========================================================================================================
  const GOAT_COLORS = [0xeadcc0, 0xc9a77c, 0xf3efe6];
  const half = PEN.size / 2 - 0.55, shelter = { x: -PEN.size / 4 - 0.3, z: -PEN.size / 2 + 1.0, hw: 1.7, hd: 1.2 }, trough = { x: PEN.size / 2 - 1.3, z: -0.6, hw: 0.95, hd: 0.5 };
  const penSpot = () => {
    for (let k = 0; k < 20; k++) {
      const x = (rand() * 2 - 1) * half, z = (rand() * 2 - 1) * half;
      if (Math.abs(x - shelter.x) < shelter.hw && Math.abs(z - shelter.z) < shelter.hd) continue;
      if (Math.abs(x - trough.x) < trough.hw && Math.abs(z - trough.z) < trough.hd) continue;
      return { x, z };
    }
    return { x: 0, z: 1 };
  };
  const penWorld = (lx, lz) => toWorld(PEN.x, PEN.z, PEN.rot, lx, lz);
  const goats = GOAT_COLORS.map((c, i) => {
    const m = buildGoat(c); farmRoot.add(m.group);
    const s = penSpot(), w = penWorld(s.x, s.z);
    return { ...m, x: s.x, z: s.z, wx: w.x, wz: w.z, heading: rand() * TAU, mode: i === 1 ? 'stand' : 'graze', timer: 1 + rand() * 4, target: null, speed: 0, wig: 0, position: { x: w.x, z: w.z }, partner: null, id: i };
  });
  let buttAt = 14;
  goats.forEach((g, i) => interactables.push({
    id: `farm-goat-${i}`, kind: 'goat', position: g.position,
    get markerY() { return groundAt(g.wx, g.wz) + 1.0; },
    prompt: () => 'E — pet goat',
    interact() { g.wig = 1.6; g.mode = 'stand'; g.timer = 2.8; g.target = null; g.partner = null; audio.play('baa'); ui.emote(new THREE.Vector3(g.wx, groundAt(g.wx, g.wz) + 1.1, g.wz), 'heart'); },
  }));
  function updateGoats(dt, elapsed) {
    buttAt -= dt;
    if (buttAt <= 0) { // two goats walk up to each other for a head-butting bout
      buttAt = 16 + rand() * 14;
      const free = goats.filter((g) => g.mode !== 'butt' && g.mode !== 'meet' && g.wig <= 0);
      if (free.length >= 2) {
        const [a, b] = free, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ang = rand() * Math.PI, ux = Math.cos(ang), uz = Math.sin(ang);
        const cl = (v) => Math.max(-half + 0.4, Math.min(half - 0.4, v)), cx = cl(mx), cz = cl(mz);
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
          if ((g.partner && g.partner.mode === 'meet' && Math.hypot(g.partner.target.x - g.partner.x, g.partner.target.z - g.partner.z) < 0.25) || g.timer <= 0) { g.mode = 'butt'; g.timer = 3.6; if (g.partner) { g.partner.mode = 'butt'; g.partner.timer = 3.6; } }
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
        const next = resolveCollisions({ x: g.x, z: g.z }, 0.3, pen.colliders);
        g.x = Math.max(-half, Math.min(half, next.x)); g.z = Math.max(-half, Math.min(half, next.z));
        for (const o of goats) if (o !== g && o.mode !== 'butt' && g.mode !== 'meet') { const ox = g.x - o.x, oz = g.z - o.z, od = Math.hypot(ox, oz); if (od < 0.55 && od > 1e-4) { g.x = o.x + (ox / od) * 0.55; g.z = o.z + (oz / od) * 0.55; } }
      }
      const moved = Math.hypot(g.x - prevX, g.z - prevZ), sp = dt > 0 ? moved / dt : 0; g.speed += (sp - g.speed) * Math.min(1, dt * 8);
      const w = penWorld(g.x, g.z); g.wx = w.x; g.wz = w.z; g.position.x = w.x; g.position.z = w.z;
      const wig = g.wig > 0 ? Math.min(1, g.wig) : 0;
      g.group.position.set(w.x, groundAt(w.x, w.z) + Math.abs(Math.sin(elapsed * 11 + g.id)) * 0.07 * wig, w.z);
      g.group.rotation.set(0, g.heading + PEN.rot, Math.sin(elapsed * 16 + g.id) * 0.09 * wig);
      g.animate(elapsed, { mode: g.mode === 'meet' ? (walk > 0 ? 'walk' : 'stand') : g.mode, speed: g.speed });
    }
  }

  // =========================================================================================================
  // The buffalo: stands chewing near the wallow, wallows in the mud at midday, can be petted
  // =========================================================================================================
  const bm = buildBuffalo(); farmRoot.add(bm.group);
  const buf = { ...bm, x: WALLOW.x + 5.2, z: WALLOW.z - 1.5, heading: -2.0, mode: 'stand', timer: 6, target: null, speed: 0, wig: 0, position: { x: 0, z: 0 }, inMud: false };
  { const s = (() => { for (let k = 0; k < 40; k++) { const a = rand() * TAU, r = 4.6 + rand() * 2; const x = WALLOW.x + Math.cos(a) * r, z = WALLOW.z + Math.sin(a) * r; if (okForBuffalo(x, z)) return { x, z }; } return null; })(); if (s) { buf.x = s.x; buf.z = s.z; } }
  buf.position.x = buf.x; buf.position.z = buf.z;
  function okForBuffalo(x, z) { const g = groundKind(x, z); if (!g || g.stream < 3 || g.terrace > 0.02 || g.face > 0 || g.path < 1.2) return false; for (const f of FIELDS) if (rectDist(x, z, f) < 1.6) return false; for (const t of taken) if (Math.abs(t.x - WALLOW.x) + Math.abs(t.z - WALLOW.z) > 0.1 && Math.hypot(x - t.x, z - t.z) < t.r + 0.8) return false; return rangeAt(x, z, 1) < 0.5; }
  const grazeSpot = () => { for (let k = 0; k < 20; k++) { const a = rand() * TAU, r = 4.4 + rand() * 3.5, x = WALLOW.x + Math.cos(a) * r, z = WALLOW.z + Math.sin(a) * r; if (okForBuffalo(x, z)) return { x, z }; } return null; };
  interactables.push({
    id: 'farm-buffalo', kind: 'buffalo', position: buf.position,
    get markerY() { return groundAt(buf.x, buf.z) + 1.7; },
    prompt: () => 'E — pet buffalo',
    interact() { buf.wig = 2.2; buf.timer = Math.max(buf.timer, 3); audio.play('purr'); ui.emote(new THREE.Vector3(buf.x, groundAt(buf.x, buf.z) + 1.9, buf.z), 'heart'); },
  });
  function updateBuffalo(dt, elapsed, t) {
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
      } else if (buf.timer <= 0) { const s = grazeSpot(); if (s) { buf.mode = 'walk'; buf.target = s; buf.timer = 20; mode = 'walk'; } else buf.timer = 6; }
    }
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
  const paddySpot = (pi) => { const p = paddies[pi]; return toWorld(p.cx, p.cz, p.rot, (rand() - 0.5) * (p.iw - 3), (rand() - 0.5) * (p.id - 3)); };
  const herons = [1, 7].filter((pi) => paddies[pi]).map((pi, i) => {
    const m = buildHeron(); farmRoot.add(m.group); const s = paddySpot(pi);
    return { ...m, paddy: pi, x: s.x, z: s.z, heading: rand() * TAU, mode: 'stand', timer: 2 + rand() * 3, target: null, flight: null, calm: 0, y: 0, id: i };
  });
  const inPaddy = (p, x, z) => { const wx = x - p.cx, wz = z - p.cz, lx = wx * p.c - wz * p.s, lz = wx * p.s + wz * p.c; return Math.abs(lx) < p.iw / 2 - 1 && Math.abs(lz) < p.id / 2 - 1; };
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
          const taken_ = herons.map((o) => (o.mode === 'fly' ? o.flight.to : o.paddy));
          const opts = paddies.map((p, k) => k).filter((k) => k !== h.paddy && !taken_.includes(k));
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
          else { h.heading = turnToward(h.heading, Math.atan2(dx, dz), dt * 2.5); const nx = h.x + (dx / d) * 0.32 * dt, nz = h.z + (dz / d) * 0.32 * dt; if (inPaddy(pd, nx, nz)) { h.x = nx; h.z = nz; } else { h.mode = 'stand'; h.timer = 2; } }
        } else if (h.mode === 'strike' && h.timer <= 0) { h.mode = 'stand'; h.timer = 2 + rand() * 3; }
      }
      h.group.position.set(h.x, h.y, h.z); h.group.rotation.y = h.heading;
      h.animate(elapsed, { mode: h.mode, speed: h.mode === 'fly' ? 1.2 : 1 });
    }
  }

  const treeKinds = [0, 1, 2].map((kind) => {
    const src = buildOrchardTree(kind), mesh0 = src.group.children[0], spots = treeSpots.filter((t) => t.kind === kind);
    const im = new THREE.InstancedMesh(mesh0.geometry, mesh0.material, Math.max(1, spots.length)); im.count = spots.length; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    orchardRoot.add(im); return { kind, im, spots, collider: src.colliders[0] };
  });
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler(), tv = new THREE.Vector3(), ts = new THREE.Vector3();
  const writeTree = (k, t, i) => {
    const amp = t.shake > 0 ? shakeWave(1.1 - t.shake) * shakeAmp([2.5, 3.3, 2.8][k.kind] * t.scale) : 0;
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
        t.shake = 1.1; audio.play('rustle');
        effects.puff(t.x, t.y + TREE_TOP[k.kind] * t.scale * 0.8, t.z, 6, k.kind === 2 ? 0x6fbf5a : 0x5aa655, 0.45, 0.9);
        deps.shakeFruit({ id, kind: 1, x: t.x, y: t.y, z: t.z }); // the island's tree rule: now and then an apple, one go per tree every 90 s
      },
    });
  }));

  // ---- Butterflies over the vegetable plots and the orchard
  const flyPts = [...vegs.slice(0, 2).map((v) => [v.x, v.z, 7]), ...(treeSpots.length ? [[treeSpots[1 % treeSpots.length].x, treeSpots[1 % treeSpots.length].z, 6], [treeSpots[treeSpots.length - 2 >= 0 ? treeSpots.length - 2 : 0].x, treeSpots[Math.max(0, treeSpots.length - 2)].z, 6]] : [])];
  const flyers = flyPts.map(([x, z, n], i) => {
    const b = buildButterflies(n); b.group.position.set(x, heightAt(x, z), z);
    (i >= vegs.slice(0, 2).length ? orchardRoot : farmRoot).add(b.group); return b;
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
      m.sph(0.3, NET, -0.9, 0.1, 0.9, 1.5, 0.4, 1.1); m.sph(0.2, 0x8fa386, -0.6, 0.12, 1.1, 1.4, 0.45, 1);
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

  // ---- All the walls, hedges, fences and gates: one mesh
  { const m = yard.build(); if (m) farmRoot.add(m); }

  // ---- Colliders: static plus the animals --------------------------------------------------------------------
  const animalCols = [];
  const allColliders = () => { animalCols.length = 0; for (const g of goats) animalCols.push({ x: g.wx, z: g.wz, r: 0.38 }); animalCols.push({ x: buf.x, z: buf.z, r: buf.inMud ? 0.5 : 0.75 }); return colliders.concat(animalCols); };

  return {
    interactables,
    colliders: allColliders,
    layout,
    update(dt, elapsed, player, night = 0) {
      const px = player.position.x, pz = player.position.z;
      const nearFarm = Math.hypot(px - farmC.x, pz - farmC.z), nearOrchard = Math.hypot(px - orchardC.x, pz - orchardC.z), nearShore = Math.hypot(px - jettyC.x, pz - jettyC.z);
      farmRoot.visible = nearFarm < 85 || nearOrchard < 85; orchardRoot.visible = nearOrchard < 85; shoreRoot.visible = nearShore < 85;
      if (nearFarm < 60 || nearOrchard < 60) {
        updateGoats(dt, elapsed); updateBuffalo(dt, elapsed, deps.dayTime()); updateHerons(dt, elapsed, player);
      }
      for (const f of flyers) if (f.group.parent.visible) f.update(dt, elapsed);
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
