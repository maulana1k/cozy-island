// The rock cliffs over the lake: the massif's face dressed in broken blocky stone with boulders at its
// foot, a waterfall pouring down a notch in it into the lake, a small stream feeding the lip, a timber
// lookout at the top, a rope rail and log steps along the cliff path, monkeys and jumping fish.
//
// The ground itself is the terrain's (massifHeight and the cut cliff path in src/logic/terrain.js);
// this file only dresses it. Every rock is placed on `heightAt` with its base sunk below the lowest
// ground under it, and kept clear of the cliff path, the trail and the lookout floor.
//
// An area file: `create(scene, deps)` returns { interactables, colliders, update } (all optional).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, stick, flat, mergeStatic } from '../build.js';
import { rockGeometry } from '../scatter.js';
import { AREAS, PALETTE, SEED } from '../../config.js';
import { createRng } from '../../logic/rng.js';
import { buildWaterfall } from '../../kit/river.js';
import { buildMonkey, buildJumpingFish } from '../../kit/critters.js';

const LAKE = AREAS.lake, LOOK = AREAS.lookout, FALL = AREAS.waterfall, PATH = AREAS.cliffPath;
const LOOK_TOP = AREAS.massif.height + 0.4;
const BLOCK_TONES = [0x9d948c, 0x8a8079, 0xaea59a];          // grey-brown stone in three tones
const WET_TONE = 0x6f6a66, MOSS_TONES = [0x7aa35a, 0x8db865, 0x6b9a52];
const FALL_W = 4.2;                                          // the waterfall's width
const SHOW_R = 110, ANIMAL_R = 60;                           // hide the area / stop the animals past these

// ---- small geometry helpers -----------------------------------------------------------------
const hash3 = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
// A rough block of stone, 1 x 1 x 1 with its base at y = 0: a subdivided box whose points are nudged
// (the same nudge for a shared corner, so it stays closed) and whose top is drawn in a little.
function blockGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.round(x * 4) * 7 + Math.round(y * 4) * 13 + Math.round(z * 4) * 29;
    const top = y > 0.4 ? 0.88 : 1;
    p.setXYZ(i, x * top + (hash3(k, 1, 2) - 0.5) * 0.14, y + 0.5 + (hash3(k, 3, 4) - 0.5) * (y > 0.4 ? 0.12 : 0.06), z * top + (hash3(k, 5, 6) - 0.5) * 0.14);
  }
  const n = g.toNonIndexed(); n.computeVertexNormals(); return n;
}
// A tuft of grass or fern in a crack: a few thin blades splayed out, 1 m tall before scaling.
function tuftGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.ConeGeometry(0.05, 1, 3); b.translate(0, 0.5, 0);
    b.rotateZ(0.35 + (i % 2) * 0.25); b.rotateY((i / 6) * Math.PI * 2 + i * 0.4); b.scale(1, 0.7 + (i % 3) * 0.18, 1);
    parts.push(b);
  }
  return mergeGeometries(parts);
}
// Nearest distance from a point to a polyline.
function distToLine(pts, x, z) {
  let best = Infinity, along = 0, run = 0, bestS = 0, bi = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, len = Math.sqrt(l2);
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; bestS = run + t * len; bi = i; }
    run += len;
  }
  along = bestS;
  return { d: best, s: along, i: bi };
}

export function create(scene, deps) {
  const { heightAt, say, audio, ui } = deps;
  const rng = createRng(SEED + 707);
  const root = new THREE.Group(); root.name = 'cliffs'; scene.add(root);
  const trail = AREAS.trails[0] || [];
  const pathD = (x, z) => distToLine(PATH, x, z).d;
  const trailD = (x, z) => (trail.length > 1 ? distToLine(trail, x, z).d : Infinity);
  // The stream on the cliff top: from a spring among rocks to the lip of the fall.
  const streamPts = [{ x: 66.4, z: -143.2 }, { x: 65.6, z: -139.6 }, { x: 63.9, z: -136.4 }, { x: 63.2, z: -133.6 }, { x: FALL.top.x, z: FALL.top.z }];
  // Places kept free of rock: the trees and props placed below (x, z, r).
  const reserved = [];
  const reserve = (x, z, r) => reserved.push({ x, z, r });
  // Is a round footprint (x, z, r) clear of everything walkable or reserved?
  function clear(x, z, r, { notch = true, top = Infinity } = {}) {
    if (pathD(x, z) - r < 1.6) return false;                                   // the cliff path's level bed and a margin
    if (trailD(x, z) - r < 1.3) return false;                                  // the riverside trail where it reaches the lake
    const dk = Math.hypot(x - LOOK.x, z - LOOK.z);                             // the lookout floor (rock below its rim is fine)
    if (dk - r < LOOK.r + 0.7 && !(top < LOOK_TOP - 0.8 && dk > LOOK.r + 0.3)) return false;
    if (notch && Math.abs(x - FALL.top.x) - r < FALL_W / 2 + 0.25 && z > FALL.top.z - 1.5 && z < FALL.foot.z + 2.5) return false; // the waterfall's notch and pool
    if (distToLine(streamPts, x, z).d - r < 0.9 && z < FALL.top.z + 0.5) return false; // the stream channel
    for (const q of reserved) if (Math.hypot(x - q.x, z - q.z) - r < q.r) return false;
    return true;
  }

  // ---- Solid lookup: what is the top surface at (x, z)? The ground, or the top of a rock on it.
  // Used to seat the waterfall, monkeys and tufts on the stone, never inside it.
  const cells = new Map(), CELL = 4;
  const cellKey = (cx, cz) => cx * 1000 + cz;
  function addSolid(s) {
    const r = s.r; s.cos = Math.cos(s.rot); s.sin = Math.sin(s.rot);
    for (let cx = Math.floor((s.x - r) / CELL); cx <= Math.floor((s.x + r) / CELL); cx++) for (let cz = Math.floor((s.z - r) / CELL); cz <= Math.floor((s.z + r) / CELL); cz++) {
      const k = cellKey(cx, cz); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(s);
    }
  }
  function surfaceY(x, z) {
    let y = heightAt(x, z);
    const list = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (list) for (const s of list) {
      const wx = x - s.x, wz = z - s.z, lx = wx * s.cos - wz * s.sin, lz = wx * s.sin + wz * s.cos;
      if (Math.abs(lx) <= s.hw && Math.abs(lz) <= s.hd && s.top > y) y = s.top;
    }
    return y;
  }
  // The lowest and highest ground under a footprint (half sizes hw, hd, turned by rot).
  function footprint(x, z, hw, hd, rot) {
    const c = Math.cos(rot), s = Math.sin(rot); let lo = Infinity, hi = -Infinity;
    for (const u of [-1, -0.34, 0.34, 1]) for (const v of [-1, -0.34, 0.34, 1]) {
      const lx = u * hw, lz = v * hd, h = heightAt(x + lx * c + lz * s, z - lx * s + lz * c);
      if (h < lo) lo = h; if (h > hi) hi = h;
    }
    return { lo, hi };
  }

  const blocks = [], boulders = [], tufts = [], solids = [];
  function addBlock(x, z, w, d, rot, { lift = 0, minH = 0.8, tone = null, collide = true, sink = 0.4 } = {}) {
    const { lo, hi } = footprint(x, z, w / 2, d / 2, rot);
    const bottom = lo - sink;
    let top = hi + lift; if (top - bottom < minH) top = bottom + minH;
    if (top - bottom > 7.5) return null;
    const b = { x, z, w, d, rot, bottom, top, tone: tone ?? BLOCK_TONES[Math.floor(rng() * 3)], tx: (rng() - 0.5) * 0.08, tz: (rng() - 0.5) * 0.08 };
    blocks.push(b);
    const s = { x, z, hw: w / 2, hd: d / 2, rot, top, r: Math.hypot(w, d) / 2, collide }; addSolid(s); solids.push(s);
    return b;
  }
  function addBoulder(x, z, size, { tone = null, sinkK = 0.14, collide = true, squash = 0.75 + rng() * 0.5 } = {}) {
    const rot = rng() * Math.PI * 2, hw = 0.86 * size, hd = 0.68 * size;
    const { lo } = footprint(x, z, hw * 0.8, hd * 0.8, rot);
    const y = lo - sinkK * size, sy = size * squash;
    const b = { x, z, y, size, sy, rot, tone: tone ?? BLOCK_TONES[Math.floor(rng() * 3)] };
    boulders.push(b);
    const s = { x, z, hw: hw * 0.8, hd: hd * 0.8, rot, top: y + 0.64 * sy, r: Math.hypot(hw, hd), collide: collide && size > 0.55 }; addSolid(s); solids.push(s);
    return b;
  }
  const grad = (x, z) => { const e = 0.6; return { gx: (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz: (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e) }; };

  // ---- Reserved spots for the props and trees (placed later, but rock keeps off them now).
  const TREES = [{ x: 42, z: -114.5, h: 5.2, branch: 2.5, dir: 0.9 }, { x: 60.6, z: -140.2, h: 5.6, branch: 2.7, dir: 2.6 }, { x: 22.5, z: -131, h: 5, branch: 2.4, dir: -1.2 }];
  for (const t of TREES) reserve(t.x, t.z, 1.6);
  const CAIRN = { x: 59.2, z: -136.4 }, SIGN = { x: 53.4, z: -136.1 };
  reserve(CAIRN.x, CAIRN.z, 1.0); reserve(SIGN.x, SIGN.z, 0.8);

  // ---- 1. The cliff face and the massif's flanks: blocks on steep ground, slabs and boulders on
  // the gentler slopes, now and then an outcrop on the shelves and the top.
  const STEP = 1.35;
  for (let gx0 = 16; gx0 <= 121; gx0 += STEP) for (let gz0 = -152; gz0 <= -114; gz0 += STEP) {
    const x = gx0 + (rng() - 0.5) * 0.9, z = gz0 + (rng() - 0.5) * 0.9, h = heightAt(x, z);
    if (h < -0.35) continue;
    const { gx, gz } = grad(x, z), sl = Math.hypot(gx, gz), down = Math.atan2(-gx, -gz);
    const face = z > -134 && x > 44, far = x > 100 ? 0.65 : 1, r0 = rng();
    if (sl > 1.0) {
      // A riser: a block whose front stands out of the slope and whose top meets the shelf above.
      if (r0 > 0.9 * far) continue;
      const w = 1.4 + rng() * 1.4, d = 1.0 + rng() * 0.8, rot = down + (rng() - 0.5) * 0.5, lift = (rng() - 0.3) * 0.55;
      if (!clear(x, z, Math.hypot(w, d) / 2, { top: footprint(x, z, w / 2, d / 2, rot).hi + lift })) continue;
      addBlock(x, z, w, d, rot, { lift });
    } else if (sl > 0.4) {
      if (r0 > (face ? 0.3 : 0.16) * far) continue;
      if (rng() < 0.5) {
        const w = 1.2 + rng() * 1.3, d = 0.9 + rng() * 0.9;
        if (!clear(x, z, Math.hypot(w, d) / 2)) continue;
        addBlock(x, z, w, d, down + (rng() - 0.5) * 0.8, { lift: 0.25 + rng() * 0.5, minH: 0.7 });
      } else {
        const s = 0.6 + rng() * 0.9;
        if (!clear(x, z, s)) continue;
        addBoulder(x, z, s);
      }
    } else if (h > 2.5 && r0 < (face ? 0.045 : 0.025) * far) {
      // An outcrop on a shelf or the top: a squat block with a boulder or two at its feet.
      const w = 1.3 + rng() * 1.6, d = 1.1 + rng() * 1.2, rot = rng() * Math.PI;
      if (!clear(x, z, Math.hypot(w, d) / 2 + 0.8)) continue;
      addBlock(x, z, w, d, rot, { lift: 0.5 + rng() * 0.9, minH: 0.9 });
      for (let k = 0; k < 2; k++) { const a = rng() * 6.28, bx = x + Math.cos(a) * (w * 0.6 + 0.4), bz = z + Math.sin(a) * (d * 0.6 + 0.4); if (clear(bx, bz, 0.5)) addBoulder(bx, bz, 0.35 + rng() * 0.35); }
    }
  }
  // Fallen boulders along the foot of the face, and out into the lake's edge under it.
  const foot = AREAS.cliffFace;
  for (let i = 0; i < foot.length - 1; i++) {
    const a = foot[i], b = foot[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = 0; s < len; s += 1.5) {
      if (rng() > (a.x > 95 ? 0.45 : 0.8)) continue;
      const t = s / len, x = a.x + (b.x - a.x) * t + (rng() - 0.5) * 1.2, z = a.z + (b.z - a.z) * t + 0.4 + rng() * 2.8, h = heightAt(x, z);
      const size = 0.45 + rng() * rng() * 1.5;
      if (h < -0.9 || h > 3 || !clear(x, z, size)) continue;
      addBoulder(x, z, size, { sinkK: h < 0 ? 0.25 : 0.14 });
    }
  }
  for (let i = 0; i < 46; i++) {
    const a = -Math.PI * 0.95 + rng() * Math.PI * 1.25, rad = LAKE.r - 1.4 + rng() * 2.6; // mostly the north (cliff) half
    const x = LAKE.x + Math.cos(a) * rad, z = LAKE.z + Math.sin(a) * rad * 0.95, h = heightAt(x, z), size = 0.35 + rng() * rng() * 1.1;
    if (h < -0.7 || Math.hypot(x - 58.5, z + 102) < 7 || !clear(x, z, size)) continue;
    addBoulder(x, z, size, { sinkK: h < 0 ? 0.3 : 0.15, tone: h < 0.1 ? WET_TONE : null });
  }

  // ---- 2. The waterfall's notch: wet dark rock behind the water, and two taller jambs either side.
  for (let y = 0.5; y < FALL.top.y - 1; y += 2.2) for (const k of [-1, 0, 1]) {
    // Find where the face is at this height, and set a dark slab just inside it.
    let zf = FALL.top.z; for (let z = FALL.foot.z + 1; z > FALL.top.z - 2; z -= 0.1) if (heightAt(FALL.top.x + k * 1.2, z) >= y) { zf = z; break; }
    const x = FALL.top.x + k * 1.25 + (rng() - 0.5) * 0.3;
    addBlock(x, zf - 0.6, 1.5, 1.2, (rng() - 0.5) * 0.3, { tone: WET_TONE, lift: 0.15, minH: 1.2, collide: false });
  }
  for (const side of [-1, 1]) for (let y = 0; y < FALL.top.y; y += 2.6) {
    let zf = FALL.top.z; const x = FALL.top.x + side * (FALL_W / 2 + 1.0) + (rng() - 0.5) * 0.3;
    for (let z = FALL.foot.z + 2; z > FALL.top.z - 2; z -= 0.1) if (heightAt(x, z) >= y) { zf = z; break; }
    addBlock(x, zf + 0.2, 1.7 + rng() * 0.5, 1.6, side * 0.15 + (rng() - 0.5) * 0.2, { lift: 0.5 + rng() * 0.4, minH: 2.2 });
  }
  // Stones lining the stream on the top, and a heap where its spring comes out.
  for (let i = 0; i < streamPts.length - 1; i++) {
    const a = streamPts[i], b = streamPts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len;
    for (let s = 0.4; s < len; s += 1.1) for (const side of [-1, 1]) {
      if (rng() < 0.3) continue;
      const t = s / len, off = 0.85 + rng() * 0.4;
      addBoulder(a.x + (b.x - a.x) * t + nx * off * side, a.z + (b.z - a.z) * t + nz * off * side, 0.25 + rng() * 0.25, { collide: false, squash: 0.6 });
    }
  }
  addBlock(66.9, -144.6, 2.4, 1.8, 0.4, { lift: 0.9, minH: 1.3 });
  addBoulder(65.2, -144.4, 0.8); addBoulder(68.2, -143.1, 0.7);

  // ---- 3. Rock under the monkeys' perches and the lookout boulder (explicit, so we know their tops).
  const lookRock = addBoulder(61.6, -136.3, 1.05, { squash: 0.9 });
  const lookRock2 = addBlock(59.6, -141.2, 1.8, 1.5, 0.7, { lift: 1.2, minH: 1.4 });
  const footRock = addBoulder(57.6, -124.4, 1.1, { squash: 1.0 });

  // ---- Instanced pools: blocks, boulders and tufts (3 draw calls, plus 2 for shadows).
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const blockMesh = new THREE.InstancedMesh(blockGeometry(), flat(0xffffff), blocks.length);
  blocks.forEach((b, i) => {
    dummy.position.set(b.x, b.bottom, b.z); dummy.rotation.set(b.tx, b.rot, b.tz, 'YXZ'); dummy.scale.set(b.w, b.top - b.bottom, b.d); dummy.updateMatrix();
    blockMesh.setMatrixAt(i, dummy.matrix); blockMesh.setColorAt(i, col.setHex(b.tone).offsetHSL(0, 0, (hash3(i, 2, 9) - 0.5) * 0.05));
  });
  const boulderGeo = rockGeometry();
  const boulderMesh = new THREE.InstancedMesh(boulderGeo, flat(0xffffff), boulders.length);
  boulders.forEach((b, i) => {
    dummy.position.set(b.x, b.y + 0.05 * b.sy, b.z); dummy.rotation.set((hash3(i, 1, 1) - 0.5) * 0.25, b.rot, (hash3(i, 4, 1) - 0.5) * 0.25, 'YXZ'); dummy.scale.set(b.size, b.sy, b.size); dummy.updateMatrix();
    boulderMesh.setMatrixAt(i, dummy.matrix); boulderMesh.setColorAt(i, col.setHex(b.tone).offsetHSL(0, 0, (hash3(i, 7, 3) - 0.5) * 0.05));
  });
  for (const m of [blockMesh, boulderMesh]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); root.add(m); }
  // Tufts: in cracks on block tops and at the feet of the rocks.
  for (const b of blocks) {
    if (rng() < 0.22) { const lx = (rng() - 0.5) * b.w * 0.6, lz = (rng() - 0.5) * b.d * 0.6, c = Math.cos(b.rot), s = Math.sin(b.rot); const x = b.x + lx * c + lz * s, z = b.z - lx * s + lz * c; tufts.push({ x, z, y: surfaceY(x, z) - 0.04, s: 0.3 + rng() * 0.35 }); }
    else if (rng() < 0.1) { const a = b.rot + (rng() - 0.5) * 1.5, x = b.x + Math.sin(a) * (b.d * 0.6 + 0.2), z = b.z + Math.cos(a) * (b.d * 0.6 + 0.2); if (heightAt(x, z) > 0.2 && clear(x, z, 0.2, { notch: false })) tufts.push({ x, z, y: surfaceY(x, z) - 0.04, s: 0.35 + rng() * 0.35 }); }
  }
  const tuftMesh = new THREE.InstancedMesh(tuftGeometry(), flat(0xffffff), Math.max(1, tufts.length));
  tufts.forEach((t, i) => {
    dummy.position.set(t.x, t.y, t.z); dummy.rotation.set(0, hash3(i, 3, 3) * 6.28, 0); dummy.scale.set(t.s * 1.2, t.s, t.s * 1.2); dummy.updateMatrix();
    tuftMesh.setMatrixAt(i, dummy.matrix); tuftMesh.setColorAt(i, col.setHex(MOSS_TONES[i % 3]));
  });
  tuftMesh.count = tufts.length; tuftMesh.receiveShadow = true; tuftMesh.computeBoundingSphere(); root.add(tuftMesh);

  // ---- The waterfall: the kit's falling sheets without its own rock wall, bent to hug the face.
  const H = FALL.top.y;
  // Where the front of the stone is at each height across the fall's width (the most forward point).
  const STEPY = 0.2, raw = [], columns = [];
  for (let x = FALL.top.x - FALL_W / 2; x <= FALL.top.x + FALL_W / 2 + 0.01; x += 0.5) {
    const c = []; for (let z = FALL.foot.z + 1.5; z > FALL.top.z - 3; z -= 0.08) c.push([z, surfaceY(x, z)]); columns.push(c);
  }
  for (let y = 0; y <= H + 0.001; y += STEPY) {
    let best = -Infinity;
    for (const c of columns) for (const [z, sy] of c) if (sy >= y) { if (z > best) best = z; break; }
    raw.push(best === -Infinity ? FALL.top.z : best);
  }
  // Water never runs back under a ledge: from the top down it only moves forward. Then soften the jumps.
  const n = raw.length, front = raw.slice();
  for (let i = n - 2; i >= 0; i--) front[i] = Math.max(front[i], front[i + 1]);
  const soft = front.map((_, i) => { let s = 0, w = 0; for (let k = -2; k <= 2; k++) { const j = Math.min(n - 1, Math.max(0, i + k)); s += front[j]; w++; } return s / w; });
  const lipZ = soft[n - 1] + 0.3;
  const profile = (y) => { const f = Math.min(n - 1.001, Math.max(0, y / STEPY)), i = Math.floor(f), t = f - i; return soft[i] + (soft[i + 1] - soft[i]) * t + 0.38 - lipZ; };
  const fall = buildWaterfall(H, FALL_W, { wall: false, profile, rows: 56 });
  fall.group.position.set(FALL.top.x, 0, lipZ);
  root.add(fall.group);
  // Splashes where the water lands on each ledge on the way down.
  const splashAt = [];
  for (let i = 1; i < n; i++) if (front[i - 1] - front[i] > 0.45 && i * STEPY > 1) splashAt.push({ y: i * STEPY - 0.15, z: front[i - 1] + 0.5 });
  const SPL = 7, splashes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xeef7fc }), Math.max(1, splashAt.length * SPL));
  splashes.count = splashAt.length * SPL; splashes.frustumCulled = false; root.add(splashes);

  // ---- The stream on the top: a flowing ribbon laid on the ground from the spring to the lip.
  const streamGeo = (() => {
    const pos = [], uv = [], idx = []; let run = 0, rows = 0;
    for (let i = 0; i < streamPts.length - 1; i++) {
      const a = streamPts[i], b = streamPts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len;
      const steps = Math.ceil(len / 0.45);
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const t = k / steps, x = a.x + (b.x - a.x) * t, z = (i === streamPts.length - 2 && k === steps) ? lipZ - 0.05 : a.z + (b.z - a.z) * t, s = run + t * len;
        const w = 0.55 - 0.12 * (s / 14) + (i === 0 && k < 3 ? 0.35 : 0);
        for (const side of [-1, 1]) { const px = x + nx * w * side, pz = z + nz * w * side; pos.push(px, Math.max(H - 0.02, heightAt(px, pz) + 0.09), pz); uv.push(side < 0 ? 0 : 1, s); }
        if (rows > 0) { const q = (rows - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        rows++;
      }
      run += len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  })();
  const streamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLight: { value: 1 } }, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform float uLight; varying vec2 vUv;
      void main() { float e = abs(vUv.x - 0.5) * 2.0;
        float s = sin(vUv.y * 2.6 - uTime * 4.0 + sin(vUv.x * 9.0 + vUv.y) * 0.8) * 0.5 + 0.5;
        vec3 c = mix(vec3(0.42, 0.70, 0.84), vec3(0.72, 0.90, 0.97), smoothstep(0.35, 0.9, s));
        c = mix(c, vec3(0.95, 0.98, 1.0), smoothstep(0.82, 1.0, e) * 0.7);
        gl_FragColor = vec4(c * uLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const stream = new THREE.Mesh(streamGeo, streamMat); stream.receiveShadow = false; root.add(stream);

  // ---- 4. Props: the lookout rail, bench, cairn and sign; the cliff path's steps, edging and rope rail; trees.
  const props = new THREE.Group(), WOOD = PALETTE.wood, DARK = PALETTE.woodDark, ROPE = 0xd8c08a, STONE = 0xa39a92;
  const colliders = [];
  // Lookout rail: posts round the drop side, two rails between them.
  const RAIL_R = LOOK.r - 0.05, A0 = -1.55, A1 = 1.95, NP = 10;
  const railPt = (a) => ({ x: LOOK.x + Math.sin(a) * RAIL_R, z: LOOK.z + Math.cos(a) * RAIL_R });
  let prevP = null;
  for (let i = 0; i <= NP; i++) {
    const a = A0 + (A1 - A0) * (i / NP), p = railPt(a), y = heightAt(p.x, p.z);
    props.add(cyl(0.07, 0.085, 1.15, DARK, p.x, y + 0.5, p.z, 6));
    if (prevP) {
      for (const hy of [0.95, 0.52]) props.add(stick([prevP.x, prevP.y + hy, prevP.z], [p.x, y + hy, p.z], 0.045, WOOD, 5));
      const mx = (prevP.x + p.x) / 2, mz = (prevP.z + p.z) / 2, len = Math.hypot(p.x - prevP.x, p.z - prevP.z);
      colliders.push({ x: mx, z: mz, hw: len / 2 + 0.05, hd: 0.1, rot: Math.atan2(p.z - prevP.z, p.x - prevP.x) * -1 });
    }
    prevP = { x: p.x, y, z: p.z };
  }
  // Bench facing out over the lake and the fall.
  { const bx = LOOK.x - 1.9, bz = LOOK.z + 1.5, rot = 0.55, y = heightAt(bx, bz), bench = new THREE.Group();
    bench.add(box(1.7, 0.08, 0.42, WOOD, 0, 0.45, 0), box(1.7, 0.3, 0.05, WOOD, 0, 0.78, -0.2));
    for (const sx of [-0.7, 0.7]) { bench.add(box(0.08, 0.45, 0.36, DARK, sx, 0.22, 0), box(0.07, 0.42, 0.06, DARK, sx, 0.66, -0.2)); }
    bench.position.set(bx, y, bz); bench.rotation.y = rot; props.add(bench);
    colliders.push({ x: bx, z: bz, hw: 0.88, hd: 0.25, rot }); }
  // Cairn of stacked stones.
  { const y = heightAt(CAIRN.x, CAIRN.z); let h = y - 0.05;
    for (let k = 0; k < 6; k++) { const r = 0.42 - k * 0.055, t = 0.2 - k * 0.012; const st = cyl(r * 0.9, r, t, STONE, CAIRN.x + (hash3(k, 1, 0) - 0.5) * 0.06, h + t / 2, CAIRN.z + (hash3(k, 2, 0) - 0.5) * 0.06, 7); st.rotation.y = k; props.add(st); h += t * 0.92; }
    colliders.push({ x: CAIRN.x, z: CAIRN.z, r: 0.42 }); }
  // Signpost.
  { const y = heightAt(SIGN.x, SIGN.z), sign = new THREE.Group();
    sign.add(cyl(0.06, 0.07, 1.6, DARK, 0, 0.8, 0, 6), box(0.9, 0.42, 0.05, WOOD, 0, 1.35, 0.06), box(0.62, 0.16, 0.05, WOOD, 0.22, 0.98, 0.06));
    sign.position.set(SIGN.x, y, SIGN.z); sign.rotation.y = 0.5; props.add(sign);
    colliders.push({ x: SIGN.x, z: SIGN.z, r: 0.14 }); }
  // The cliff path: log steps across the climbing stretches, edging logs on the uphill side, and a rope
  // rail on posts on the drop side where it is steep. All at the edges or flush with the bed: nothing blocks.
  { const segs = []; let run = 0;
    for (let i = 0; i < PATH.length - 1; i++) { const a = PATH[i], b = PATH[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z); segs.push({ a, b, len, start: run }); run += len; }
    const at = (s) => { const g = segs.find((q) => s <= q.start + q.len) || segs[segs.length - 1], t = Math.min(1, (s - g.start) / g.len), tx = (g.b.x - g.a.x) / g.len, tz = (g.b.z - g.a.z) / g.len; return { x: g.a.x + (g.b.x - g.a.x) * t, z: g.a.z + (g.b.z - g.a.z) * t, tx, tz, nx: tz, nz: -tx }; };
    const total = run;
    let ropePrev = null;
    for (let s = 1.5; s < total - 3; s += 2.6) {
      const p = at(s), yc = heightAt(p.x, p.z);
      // Which side drops away?
      const hl = heightAt(p.x + p.nx * 3.4, p.z + p.nz * 3.4), hr = heightAt(p.x - p.nx * 3.4, p.z - p.nz * 3.4);
      const dropSide = hl < hr ? 1 : -1, drop = yc - Math.min(hl, hr), upSide = -dropSide;
      // A log step across the bed, sunk so only its top shows.
      if (s > 3 && s < total - 9 && Math.floor(s / 2.6) % 2 === 0) {
        const a = [p.x + p.nx * 1.3, yc - 0.03, p.z + p.nz * 1.3], b = [p.x - p.nx * 1.3, yc - 0.03, p.z - p.nz * 1.3];
        a[1] = heightAt(a[0], a[2]) - 0.03; b[1] = heightAt(b[0], b[2]) - 0.03;
        props.add(stick(a, b, 0.085, DARK, 6));
      }
      // An edging log on the uphill side.
      if (rng() < 0.7) {
        const ox = p.x + p.nx * 1.55 * upSide, oz = p.z + p.nz * 1.55 * upSide;
        const a = [ox - p.tx * 0.9, 0, oz - p.tz * 0.9], b = [ox + p.tx * 0.9, 0, oz + p.tz * 0.9];
        a[1] = heightAt(a[0], a[2]) + 0.04; b[1] = heightAt(b[0], b[2]) + 0.04;
        props.add(stick(a, b, 0.1, WOOD, 6));
      }
      // Rope rail on the drop side.
      if (drop > 1.0) {
        const px = p.x + p.nx * 1.75 * dropSide, pz = p.z + p.nz * 1.75 * dropSide, py = heightAt(px, pz);
        props.add(cyl(0.055, 0.07, 1.0, DARK, px, py + 0.42, pz, 6));
        const top = { x: px, y: py + 0.86, z: pz };
        if (ropePrev && Math.hypot(top.x - ropePrev.x, top.z - ropePrev.z) < 3.2) {
          const mid = [(top.x + ropePrev.x) / 2, (top.y + ropePrev.y) / 2 - 0.12, (top.z + ropePrev.z) / 2];
          props.add(stick([ropePrev.x, ropePrev.y, ropePrev.z], mid, 0.025, ROPE, 4), stick(mid, [top.x, top.y, top.z], 0.025, ROPE, 4));
        }
        ropePrev = top;
      } else ropePrev = null;
    }
  }
  // Trees for the monkeys: a leaning trunk, a branch to sit on, a lumpy crown.
  const trunkM = flat(0x8a6a50), leafM = flat(0x79b25e);
  const treeInfo = TREES.map((t, i) => {
    const y = heightAt(t.x, t.z), lean = 0.12, lx = Math.sin(t.dir + 2) * lean, lz = Math.cos(t.dir + 2) * lean;
    const top = [t.x + lx * t.h, y + t.h, t.z + lz * t.h];
    const tr = stick([t.x, y - 0.3, t.z], top, 0.2, trunkM, 7); tr.geometry = new THREE.CylinderGeometry(0.13, 0.24, tr.geometry.parameters.height, 7); props.add(tr);
    const bAt = (k) => [t.x + lx * k, y + k, t.z + lz * k];
    const b0 = bAt(t.branch), bEnd = [b0[0] + Math.sin(t.dir) * 1.5, b0[1] + 0.35, b0[2] + Math.cos(t.dir) * 1.5];
    props.add(stick(b0, bEnd, 0.075, trunkM, 6));
    const c0 = bAt(t.h * 0.78), b2 = [c0[0] + Math.sin(t.dir + 2.4) * 1.1, c0[1] + 0.3, c0[2] + Math.cos(t.dir + 2.4) * 1.1];
    props.add(stick(c0, b2, 0.06, trunkM, 5));
    for (let k = 0; k < 6; k++) {
      const a = k * 1.1 + i, r = k === 0 ? 0 : 1.2, blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), leafM);
      blob.position.set(top[0] + Math.cos(a) * r, top[1] + (k === 0 ? 0.5 : -0.1 + (k % 2) * 0.3), top[2] + Math.sin(a) * r);
      blob.scale.set(1.25, 0.85, 1.25); blob.rotation.y = a; blob.castShadow = true; props.add(blob);
    }
    colliders.push({ x: t.x, z: t.z, r: 0.28 });
    // Perch on the sitting branch (two thirds of the way out), and a hold in the crown.
    const f = 0.62;
    return { y, sit: { x: b0[0] + (bEnd[0] - b0[0]) * f, y: b0[1] + (bEnd[1] - b0[1]) * f + 0.07, z: b0[2] + (bEnd[2] - b0[2]) * f }, crown: { x: (c0[0] + b2[0]) / 2, y: (c0[1] + b2[1]) / 2 + 0.06, z: (c0[2] + b2[2]) / 2 }, dir: t.dir };
  });
  mergeStatic(props); root.add(props);

  // Rock colliders: blocks and the bigger boulders, looked up near the player only.
  for (const s of solids) if (s.collide) colliders.push({ x: s.x, z: s.z, hw: s.hw * 0.92, hd: s.hd * 0.92, rot: s.rot, far: true });

  // ---- 5. Monkeys: each has two perches; when you come close it scampers to the other one.
  // A route is a list of 3D points; rock routes follow the stone (surfaceY) so they never cut through it.
  function route(a, b, onRock) {
    const pts = [], len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), k = Math.max(2, Math.ceil(len / 0.3));
    for (let i = 0; i <= k; i++) {
      const t = i / k, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; let y = a.y + (b.y - a.y) * t;
      if (onRock) y = Math.max(surfaceY(x, z), i === 0 ? a.y : i === k ? b.y : -Infinity);
      pts.push({ x, y, z });
    }
    let run = 0; pts.forEach((p, i) => { if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z); p.s = run; });
    return pts;
  }
  const onTop = (x, z) => ({ x, y: surfaceY(x, z), z });
  // West flank perch: on the rock just uphill of the path's third leg.
  const [flankA, flankB] = (() => {
    const a = PATH[2], b = PATH[3], t = 0.55, len = Math.hypot(b.x - a.x, b.z - a.z), nx = (b.z - a.z) / len, nz = -(b.x - a.x) / len;
    const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t;
    const side = heightAt(cx + nx * 3, cz + nz * 3) > heightAt(cx - nx * 3, cz - nz * 3) ? 1 : -1;
    return [onTop(cx + nx * 2.9 * side, cz + nz * 2.9 * side), onTop(cx + nx * 6.2 * side + 1.2, cz + nz * 6.2 * side)];
  })();
  const MONKEYS = [
    { a: { ...treeInfo[0].sit }, b: { ...treeInfo[0].crown }, rock: false, face: treeInfo[0].dir, hang: false },
    { a: { x: treeInfo[1].sit.x, y: treeInfo[1].sit.y - 1.07, z: treeInfo[1].sit.z }, b: { ...treeInfo[1].crown }, rock: false, face: treeInfo[1].dir + 1.6, hang: true },
    { a: { x: lookRock.x, y: lookRock.y + 0.64 * lookRock.sy, z: lookRock.z }, b: onTop(lookRock2.x, lookRock2.z), rock: true, face: 0.4 },
    { a: { x: footRock.x, y: footRock.y + 0.64 * footRock.sy, z: footRock.z }, b: onTop(footRock.x - 1.6, -127.6), rock: true, face: 0.2 },
    { a: flankA, b: flankB, rock: true, face: -0.4 },
  ];
  const LINES = [
    'The monkey scratches behind its ear, then stares right back at you.',
    'It tilts its head when you tilt yours. Who is watching who?',
    'Its long tail curls round like a question mark.',
    'A big yawn. Lots of tiny teeth!',
    'It picks at its fur very carefully, like a groomer at work.',
    'It chatters softly, then pretends you are not there.',
  ];
  const monkeys = MONKEYS.map((def, i) => {
    const kit = buildMonkey(); kit.group.rotation.order = 'YXZ'; scene.add(kit.group);
    const pts = route(def.a, def.b, def.rock);
    const m = { kit, def, pts, len: pts[pts.length - 1].s, s: 0, dir: 0, calm: 0, watch: 0, idle: rng() * 6, mode: 'sit', heading: def.face, t0: rng() * 20, pos: { x: def.a.x, z: def.a.z }, y: def.a.y, moving: false, lastLine: -1 };
    return m;
  });
  const placeMonkey = (m) => {
    const { pts } = m; let i = 1; while (i < pts.length - 1 && pts[i].s < m.s) i++;
    const p0 = pts[i - 1], p1 = pts[i], t = p1.s > p0.s ? Math.min(1, Math.max(0, (m.s - p0.s) / (p1.s - p0.s))) : 0;
    m.pos.x = p0.x + (p1.x - p0.x) * t; m.pos.z = p0.z + (p1.z - p0.z) * t; m.y = p0.y + (p1.y - p0.y) * t;
    return { dx: (p1.x - p0.x) * m.dir, dy: (p1.y - p0.y) * m.dir, dz: (p1.z - p0.z) * m.dir };
  };
  const interactables = monkeys.map((m, i) => ({
    id: `monkey-${i}`, kind: 'monkey', position: m.pos,
    get markerY() { return m.y + (m.def.hang && m.s < 0.01 ? 1.3 : 0.85); },
    get enabled() { return m.kit.group.visible && m.dir === 0; },
    prompt: () => 'E — watch monkey',
    interact() {
      m.watch = 3.5; m.calm = 1; m.idle = 0;
      let k = Math.floor(rng() * LINES.length); if (k === m.lastLine) k = (k + 1) % LINES.length; m.lastLine = k;
      audio.play('squeak'); ui.emote(new THREE.Vector3(m.pos.x, m.y + 0.9, m.pos.z), rng() < 0.5 ? 'note' : 'heart');
      say(LINES[k], '🐒');
    },
  }));
  // The lookout sign, and taking in the view from the rail.
  const signY = heightAt(SIGN.x, SIGN.z);
  interactables.push({
    id: 'cliffs-sign', kind: 'sign', position: { x: SIGN.x, z: SIGN.z }, markerY: signY + 1.9,
    prompt: () => 'E — read the sign',
    interact() { audio.play('ui'); say('Cliff Top Lookout, 12 m above the lake. Path back down: west, along the rope rail.', '🪧'); },
  });
  const viewAt = railPt(0.15);
  interactables.push({
    id: 'cliffs-view', kind: 'view', position: { x: LOOK.x + (viewAt.x - LOOK.x) * 0.8, z: LOOK.z + (viewAt.z - LOOK.z) * 0.8 }, markerY: LOOK_TOP + 1.4,
    prompt: () => 'E — take in the view',
    interact() { audio.play('ui'); say('The whole river winds away to the sea. You can see the bridge, the village and, far off, the camp flag.', '🏞️'); },
  });

  // ---- 6. Jumping fish in the lake, away from the stepping stones.
  const fish = [{ x: 61, z: -116.5, rot: 0.4, off: 0 }, { x: 66.5, z: -112, rot: 2.2, off: 1.9 }, { x: 59, z: -110.5, rot: -1.1, off: 3.3 }].map((f) => {
    const k = buildJumpingFish(); k.group.position.set(f.x, 0, f.z); k.group.rotation.y = f.rot; scene.add(k.group); return { ...f, k };
  });

  // ---- Update
  const lastP = { x: 0, z: 0 };
  let shown = true;
  return {
    interactables,
    colliders: () => {
      const out = [];
      for (const c of colliders) if (!c.far || (c.x - lastP.x) ** 2 + (c.z - lastP.z) ** 2 < 15 * 15) out.push(c);
      return out;
    },
    update(dt, elapsed, player, night = 0) {
      const p = player.position; lastP.x = p.x; lastP.z = p.z;
      const dl = Math.hypot(p.x - LAKE.x, p.z - LAKE.z);
      const show = dl < SHOW_R;
      if (show !== shown) { shown = show; root.visible = show; }
      const near = dl < ANIMAL_R + 25;
      for (const f of fish) { const d = Math.hypot(p.x - f.x, p.z - f.z), on = d < ANIMAL_R; f.k.group.visible = on; if (on) f.k.update(dt, elapsed + f.off); }
      if (!show) { for (const m of monkeys) m.kit.group.visible = false; return; }
      fall.update(dt, elapsed); streamMat.uniforms.uTime.value = elapsed;
      const light = 1 - 0.72 * night; fall.setLight(light); streamMat.uniforms.uLight.value = light; splashes.material.color.setScalar(0.95 * light);
      // Ledge splashes heave and spit.
      for (let j = 0; j < splashAt.length; j++) for (let k = 0; k < SPL; k++) {
        const q = splashAt[j], i = j * SPL + k, a = k * 0.9 + j, s = (0.22 + 0.12 * hash3(k, j, 1)) * (1 + 0.3 * Math.sin(elapsed * 4.1 + i * 1.3));
        dummy.position.set(FALL.top.x + Math.cos(a) * FALL_W * 0.42 * ((k / SPL) * 2 - 1), q.y + 0.1 * Math.abs(Math.sin(elapsed * 3.3 + i)), q.z + 0.15 * Math.sin(a));
        dummy.rotation.set(0, i, 0); dummy.scale.set(s, s * 0.7, s); dummy.updateMatrix(); splashes.setMatrixAt(i, dummy.matrix);
      }
      splashes.instanceMatrix.needsUpdate = true;
      if (!near) { for (const m of monkeys) m.kit.group.visible = false; return; }
      for (const m of monkeys) {
        const dx = m.pos.x - p.x, dz = m.pos.z - p.z, d = Math.hypot(dx, dz), up = m.y - p.y;
        const vis = d < ANIMAL_R; m.kit.group.visible = vis;
        if (!vis) continue;
        // Shy at first; once it has had a good look at you it lets you come closer, until you go away again.
        if (d > 10) m.calm = Math.max(0, m.calm - dt / 25);
        const atA = m.dir === 0 && m.s <= 0.001, atB = m.dir === 0 && m.s >= m.len - 0.001;
        const safeHigh = up > 3;                         // high in a tree, it does not mind you underneath
        const scared = !safeHigh && ((m.calm < 0.5 && d < 4) || d < 1.15 || (player.speed > 3.2 && d < 2.6));
        if (m.dir === 0 && scared) {
          // Run to whichever perch is farther from you, if that is better than where it is.
          const end = atA ? m.pts[m.pts.length - 1] : m.pts[0], de = Math.hypot(end.x - p.x, end.z - p.z) + (end.y - p.y > 3 ? 4 : 0);
          if (de > d + 0.5) { m.dir = atA ? 1 : -1; if (d < 6) audio.play('squeak'); }
        } else if (m.dir === 0 && atB && d > 9 && m.calm < 0.85) {
          m.idle += dt; if (m.idle > 3) { m.dir = -1; m.idle = 0; m.back = true; }
        }
        let vel = null;
        if (m.dir !== 0) {
          const speed = m.back ? 1.3 : 3.0;
          m.s += m.dir * speed * dt;
          if (m.s >= m.len) { m.s = m.len; m.dir = 0; m.calm = Math.max(m.calm, 1); m.idle = 0; m.back = false; }
          else if (m.s <= 0) { m.s = 0; m.dir = 0; m.idle = 0; if (!m.back) m.calm = Math.max(m.calm, 1); m.back = false; }
          vel = placeMonkey(m);
          if (m.dir !== 0 && m.back && d < 4 && m.calm < 0.5) { m.dir = 1; m.back = false; } // turned back towards you: off again
        } else placeMonkey(m);
        const g = m.kit.group, t = elapsed + m.t0;
        let mode = 'sit', pitch = 0;
        if (vel && (vel.dx || vel.dz || vel.dy)) {
          mode = 'scamper';
          const h = Math.atan2(vel.dx, vel.dz), dh = Math.hypot(vel.dx, vel.dz);
          if (dh > 0.02) m.heading = h;
          pitch = -Math.max(-1.1, Math.min(1.1, Math.atan2(vel.dy, Math.max(0.05, dh)))) * 0.85;
        } else {
          // At rest: look your way if you are near, else gaze out; now and then a good scratch.
          const want = d < 12 ? Math.atan2(-dx, -dz) : m.def.face;
          let diff = want - m.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); m.heading += diff * Math.min(1, dt * 2.5);
          const hanging = m.def.hang && m.s <= 0.001;
          if (m.watch > 0) { m.watch -= dt; mode = hanging ? 'hang' : 'scratch'; }
          else if (hanging) mode = 'hang';
          else mode = Math.sin(t * 0.37 + m.t0) > 0.72 ? 'scratch' : 'sit';
        }
        g.position.set(m.pos.x, m.y, m.pos.z);
        g.rotation.set(pitch, m.heading, 0);
        m.kit.animate(night > 0.7 && mode === 'sit' ? t * 0.35 : t, { mode, speed: 1 });
      }
    },
  };
}
