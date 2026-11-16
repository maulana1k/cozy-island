// The land beyond the camp's own ground mesh: the wild jungle, the locals' land across the river
// and the rock massif. Far too much to draw at once, so it is kept in
// square tiles and only the tiles near you exist. Near tiles get real trees (the same kinds that
// grow round the camp, plus jungle giants), bushes, rocks, ferns and grass; far tiles get a simple
// lump per treetop. There is no fence: the camp's woods just thicken into it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, landR, wildDepth, wildness, groundKind } from '../logic/terrain.js';
import { paintNewGround } from './ground.js';
import { TREE_KINDS, bushGeometry, rockGeometry, fernGeometry, tuftGeometry } from './scatter.js';
import { WILD, GRASS_RADIUS, ISLAND_RADIUS, SEED, PALETTE, AREAS } from '../config.js';

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const TILE = 48, VIEW = 230, NEAR = 58, UNDER = 36; // tile size; how far tiles exist; how far real trees and undergrowth go
const MAIN_HALF = 85;                                  // the camp's own ground mesh covers this far from the middle
const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...extra });

// Repeatable random numbers for one tile.
function tileRng(ix, iz) {
  let a = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ SEED) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Slow, smooth variation across the land: where the groves, stands and clearings are.
const wave = (x, z, s, o) => Math.sin(x / s + o) * Math.cos(z / (s * 0.83) - o * 1.7) + 0.5 * Math.sin((x + z) / (s * 0.47) + o * 2.3);

// A jungle giant: a tall buttressed trunk and a heavy crown, with vines.
const giant = {
  color: 0x5a9450, top: 8,
  trunk: () => { const a = new THREE.CylinderGeometry(0.28, 0.5, 7, 6).toNonIndexed(); a.translate(0, 3.5, 0); const b = new THREE.ConeGeometry(0.95, 1.6, 5).toNonIndexed(); b.translate(0, 0.75, 0); return mergeGeometries([a, b]); },
  canopy: () => mergeGeometries([[2.6, 0, 8.2, 0], [2.0, 1.7, 7.2, 0.6], [1.9, -1.5, 7.0, -0.9], [1.5, 0.2, 9.6, -0.3]].map(([r, x, y, z]) => { const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, 0.72, 1); g.translate(x, y, z); return g; })
    .concat([[1.9, 5.3, 0.7, 3.2], [-1.6, 5.5, -1.0, 2.4]].map(([x, y, z, len]) => { const g = new THREE.CylinderGeometry(0.03, 0.03, len, 4).toNonIndexed(); g.translate(x, y, z); return g; }))),
};
const KINDS = [...TREE_KINDS, giant];
const MAX_ROCK = AREAS.massif.height;
// Too steep for a tree to stand: the cliff faces.
const steep = (x, z, y) => Math.max(Math.abs(heightAt(x + 1, z) - y), Math.abs(heightAt(x, z + 1) - y)) > 0.75;

// Ground kept clear of streamed plants (villages, fields, jetties): {x, z, r}. Areas add to it
// while they are being made, before the first tiles are built.
const KEEP_CLEAR = [
  { x: AREAS.village.x, z: AREAS.village.z, r: AREAS.village.r + 5 }, { x: AREAS.paddies.x, z: AREAS.paddies.z, r: AREAS.paddies.r + 2 },
  { x: AREAS.orchard.x, z: AREAS.orchard.z, r: AREAS.orchard.r + 2 }, { x: AREAS.jetty.x, z: AREAS.jetty.z, r: 8 },
];
export const keepClear = (x, z, r) => { KEEP_CLEAR.push({ x, z, r }); };
const cleared = (x, z) => KEEP_CLEAR.some((k) => Math.hypot(x - k.x, z - k.z) < k.r);

export function createWilds(scene) {
  const group = new THREE.Group(); scene.add(group);
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const colliders = [];

  // ---- Shared pools: one instanced mesh per kind of thing, refilled when the nearby tiles change.
  const pool = (geo, material, cap) => { const m = new THREE.InstancedMesh(geo, material, cap); m.count = 0; m.castShadow = false; // no shadows out here: that alone halves the cost
    m.receiveShadow = false; m.frustumCulled = false; group.add(m); return m; };
  const trunkMat = flat(PALETTE.treeTrunk), white = flat(0xffffff);
  const trees = KINDS.map((def) => ({ trunk: pool(def.trunk(), trunkMat, 2600, true), canopy: pool(def.canopy(), white, 2600, true) }));
  const lumpGeo = new THREE.IcosahedronGeometry(1, 0); lumpGeo.scale(1, 0.62, 1);
  const lumps = pool(lumpGeo, white, 26000, false);
  const leaves = flat(0xffffff, { vertexColors: true, side: THREE.DoubleSide });
  const lightBush = mergeGeometries([[0.62, 0, 0.42, 0], [0.42, 0.42, 0.32, 0.12], [0.44, -0.4, 0.3, -0.1]].map(([r, x, y, z]) => { const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, 0.78, 1); g.translate(x, y, z); return g; }));
  const bushes = pool(lightBush, white, 2400), rocks = pool(rockGeometry(), white, 700);
  const ferns = pool(fernGeometry(), leaves, 3600, false), tufts = pool(tuftGeometry(), leaves, 5200, false);

  // ---- One tile: its ground and a list of what grows on it. Made once, then kept while it is near.
  const C = (hex) => new THREE.Color(hex);
  const cJungle = C(0xc9b866), cSoil = C(0xb39a58), cGreen = C(0x8fb45c), cDeep = C(0x5f8a48), cHigh = C(0x9fb070), cSand = C(PALETTE.sand), cWet = C(PALETTE.sandWet);
  function buildTile(ix, iz) {
    const x0 = ix * TILE, z0 = iz * TILE, rng = tileRng(ix, iz);
    // Nothing but sea here?
    let land = false;
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) if (landR(x0 + u * TILE, z0 + v * TILE) < ISLAND_RADIUS + 14) land = true;
    if (!land) return { empty: true };
    const tile = { ix, iz, cx: x0 + TILE / 2, cz: z0 + TILE / 2, trees: [], bushes: [], rocks: [], ferns: [], tufts: [], mesh: null };

    // Ground, unless the camp's own mesh already covers the whole tile.
    const inside = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < MAIN_HALF - 3;
    if (!(inside(x0, z0) && inside(x0 + TILE, z0 + TILE))) {
      // A vertex every 4 m is plenty for rolling ground; river banks, the lake shore, cliffs and
      // the cliff path get one every metre, the rest of the new land one every 2 m.
      let seg = 12;
      for (let u = 0; u <= 6 && seg < 48; u++) for (let v = 0; v <= 6; v++) {
        const g = groundKind(x0 + u * TILE / 6, z0 + v * TILE / 6);
        if (!g) continue;
        if (g.river < 12 || g.lake < 14 || g.trail < 6 || (g.rock > 0.02 && g.rockHeight < MAX_ROCK - 0.5)) { seg = 48; break; }
        if (g.locals > 0.2 || g.rock > 0.02) seg = 24;
      }
      const geo = new THREE.PlaneGeometry(TILE, TILE, seg, seg);
      geo.rotateX(-Math.PI / 2); geo.translate(tile.cx, 0, tile.cz);
      const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z), r = landR(x, z);
        // Tuck under the camp's mesh where the two overlap, so they never flicker against each other.
        pos.setY(i, h - 0.35 * smooth((MAIN_HALF - 0.5 - Math.max(Math.abs(x), Math.abs(z))) / 3));
        if (r < GRASS_RADIUS + 1) {
          // The same dry jungle floor as round the camp, greener in the damp hollows, paler on the heights.
          const damp = smooth(wave(x, z, 46, 1.3) * 0.5 + 0.5), deep = smooth(wave(x, z, 23, 4.1) * 0.6 + 0.3);
          color.copy(cJungle).lerp(cSoil, smooth(wave(x, z, 9, 0.7) * 0.5 + 0.2) * 0.5).lerp(cGreen, damp * 0.75).lerp(cDeep, deep * damp * 0.6).lerp(cHigh, smooth((h - 9) / 12) * 0.7);
          color.lerp(cSand, Math.min(1, Math.max(0, (r - (GRASS_RADIUS - 2.5)) / 2.5)));
        } else color.copy(cSand).lerp(cWet, Math.min(1, Math.max(0, (r - (ISLAND_RADIUS - 4)) / 4)));
        paintNewGround(color, x, z, h);
        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      tile.mesh = new THREE.Mesh(geo, groundMat); tile.mesh.receiveShadow = true;
      group.add(tile.mesh);
    }

    // What grows here. Groves of palms, stands of pine, giants in the damp, open glades between.
    const grows = (x, z) => { const w = wildness(x, z); return w > 0 && landR(x, z) < GRASS_RADIUS - 2 ? w : 0; };
    for (let n = 0; n < 230; n++) {
      const x = x0 + rng() * TILE, z = z0 + rng() * TILE, pick = rng(), size = rng(), turn = rng(), chance = rng();
      const w = grows(x, z);
      if (!w) continue;
      const glade = smooth((wave(x, z, 31, 2.9) + 0.75) / 0.5); // 0 in a clearing
      if (chance > w * (0.1 + 0.9 * glade)) continue;
      const y = heightAt(x, z);
      if (y < 0.5 || steep(x, z, y)) continue;
      const biome = wave(x, z, 52, 0.4), damp = wave(x, z, 46, 1.3);
      let kind;
      if (pick < 0.22) kind = Math.floor((pick / 0.22) * 7);                    // a bit of everything everywhere
      else if (biome > 0.45) kind = pick < 0.8 ? 3 : 5;                          // palm grove with saplings
      else if (biome < -0.45) kind = pick < 0.5 ? 0 : pick < 0.8 ? 4 : 2;        // pine stand
      else if (damp > 0.2) kind = pick < 0.72 ? 6 : pick < 0.86 ? 1 : 5;         // giants in the damp hollows
      else kind = pick < 0.45 ? 1 : pick < 0.7 ? 2 : pick < 0.85 ? 0 : 6;        // open mixed wood
      // Close to camp the trees stay camp-sized; the giants only come in further out.
      const depthIn = Math.hypot(x, z) - WILD.trees;
      if (kind === 6 && depthIn < 10 && size > depthIn / 10) kind = 1 + Math.floor(turn * 2);
      const scale = (kind === 6 ? 0.8 + size * 0.8 : kind === 5 ? 0.7 + size * 0.6 : 0.85 + size * 0.7) * (0.9 + Math.min(0.35, depthIn / 200));
      tile.trees.push({ x, y: y - 0.1, z, kind, scale, rot: turn * 6.283, tint: size - 0.5 });
    }
    for (let n = 0; n < 150; n++) {
      const x = x0 + rng() * TILE, z = z0 + rng() * TILE, what = rng(), size = rng(), turn = rng();
      const w = grows(x, z);
      if (!w || what > w * 1.2) continue;
      const y = heightAt(x, z);
      if (y < 0.5 || steep(x, z, y)) continue;
      const item = { x, y, z, s: 0.7 + size * 0.8, rot: turn * 6.283, tint: size };
      const glade = wave(x, z, 31, 2.9) < -0.5;
      if (what < 0.035) tile.rocks.push(item);
      else if (what < 0.2) tile.bushes.push(item);
      else if (what < 0.55 && !glade) tile.ferns.push(item);
      else tile.tufts.push(item);
    }
    // The locals' land: a few palms, fruit trees and bushes, far sparser than the jungle,
    // never on the trails, the beaches, the village square or the fields.
    for (let n = 0; n < 26; n++) {
      const x = x0 + rng() * TILE, z = z0 + rng() * TILE, what = rng(), size = rng(), turn = rng();
      const g = groundKind(x, z);
      if (!g || g.locals < 0.8 || g.trail < 3 || g.river < 4 || cleared(x, z)) continue;
      const y = heightAt(x, z), r = landR(x, z);
      if (y < 0.7 || steep(x, z, y)) continue;
      if (what < 0.32) tile.trees.push({ x, y: y - 0.1, z, kind: r > 40 || what < 0.12 ? 3 : 1, scale: 0.85 + size * 0.45, rot: turn * 6.283, tint: size - 0.5 });
      else if (what < 0.4) tile.trees.push({ x, y: y - 0.05, z, kind: 5, scale: 0.8 + size * 0.5, rot: turn * 6.283, tint: size - 0.5 });
      else if (what < 0.75) tile.bushes.push({ x, y, z, s: 0.6 + size * 0.6, rot: turn * 6.283, tint: size });
      else if (what < 0.8) tile.rocks.push({ x, y, z, s: 0.5 + size * 0.5, rot: turn * 6.283, tint: size });
    }
    return tile;
  }

  // ---- Filling the pools from the tiles that are near enough.
  const tiles = new Map();
  const TREE_TINTS = [0x5f9a50, 0x6aa85a, 0x528a52, 0x78b060];
  function refill(px, pz) {
    const counts = KINDS.map(() => 0);
    let nLump = 0, nBush = 0, nRock = 0, nFern = 0, nTuft = 0;
    colliders.length = 0;
    const put = (mesh, i, x, y, z, s, rot, sy = s) => { dummy.position.set(x, y, z); dummy.rotation.set(0, rot, 0); dummy.scale.set(s, sy, s); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); };
    for (const tile of tiles.values()) {
      if (tile.empty) continue;
      const d = Math.hypot(tile.cx - px, tile.cz - pz);
      for (const t of tile.trees) {
        const def = KINDS[t.kind];
        // Only the trees right round you are real; the rest are a single lump each, which reads the same through the haze.
        if (Math.hypot(t.x - px, t.z - pz) < NEAR && counts[t.kind] < 2600) {
          const i = counts[t.kind]++;
          put(trees[t.kind].trunk, i, t.x, t.y, t.z, t.scale, t.rot); trees[t.kind].canopy.setMatrixAt(i, dummy.matrix);
          trees[t.kind].canopy.setColorAt(i, color.setHex(def.color).offsetHSL(t.tint * 0.03, 0, t.tint * 0.07));
          colliders.push({ x: t.x, z: t.z, r: (t.kind === 6 ? 0.5 : 0.4) * t.scale }); // safe ground now reaches deep into the jungle
        } else if (nLump < 26000 && t.kind !== 5) {
          // Far away a tree is just its crown: one lump at treetop height.
          const r = (t.kind === 6 ? 3.3 : t.kind === 3 ? 1.9 : 2.5) * t.scale;
          put(lumps, nLump, t.x, t.y + def.top * t.scale * 0.92, t.z, r, t.rot, r * (t.kind === 3 ? 0.7 : 1));
          lumps.setColorAt(nLump++, color.setHex(def.color).offsetHSL(t.tint * 0.03, 0, t.tint * 0.07 - 0.02));
        }
      }
      if (d < NEAR + TILE) {
        const closeBy = (b) => Math.hypot(b.x - px, b.z - pz) < UNDER;
        for (const b of tile.bushes) if (nBush < 2400 && Math.hypot(b.x - px, b.z - pz) < NEAR) { put(bushes, nBush, b.x, b.y, b.z, b.s, b.rot); bushes.setColorAt(nBush++, color.setHex(TREE_TINTS[Math.floor(b.tint * 4) % 4])); }
        for (const b of tile.rocks) if (nRock < 700 && Math.hypot(b.x - px, b.z - pz) < NEAR) { put(rocks, nRock, b.x, b.y, b.z, b.s * 1.2, b.rot); rocks.setColorAt(nRock++, color.setHex(b.tint > 0.5 ? 0xb9a58a : 0xa89a8c)); }
        for (const b of tile.ferns) if (nFern < 3600 && closeBy(b)) { put(ferns, nFern, b.x, b.y, b.z, b.s * 1.15, b.rot); ferns.setColorAt(nFern++, color.setHex(b.tint > 0.5 ? 0x4f9a4a : 0x6aa650)); }
        for (const b of tile.tufts) if (nTuft < 5200 && closeBy(b)) { put(tufts, nTuft, b.x, b.y, b.z, b.s * 1.1, b.rot); tufts.setColorAt(nTuft++, color.setHex(b.tint > 0.6 ? 0xd9c46a : b.tint > 0.3 ? 0xa9b85c : 0x7fa650)); }
      }
    }
    KINDS.forEach((_, k) => { for (const m of [trees[k].trunk, trees[k].canopy]) { m.count = counts[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } });
    for (const [m, n] of [[lumps, nLump], [bushes, nBush], [rocks, nRock], [ferns, nFern], [tufts, nTuft]]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  // Makes the tiles that have come into range (a few at a time) and drops the ones left behind.
  let lastFill = { x: 1e9, z: 1e9 }, dirty = true;
  function stream(px, pz, budget) {
    const ci = Math.floor(px / TILE), cj = Math.floor(pz / TILE), reach = Math.ceil(VIEW / TILE);
    for (let dj = -reach; dj <= reach && budget > 0; dj++) for (let di = -reach; di <= reach && budget > 0; di++) {
      const ix = ci + di, iz = cj + dj, key = `${ix},${iz}`;
      if (tiles.has(key) || Math.hypot((ix + 0.5) * TILE - px, (iz + 0.5) * TILE - pz) > VIEW) continue;
      const tile = buildTile(ix, iz);
      tiles.set(key, tile);
      if (!tile.empty) { dirty = true; budget--; }
    }
    for (const [key, tile] of tiles) {
      if (tile.empty || Math.hypot(tile.cx - px, tile.cz - pz) < VIEW + 70) continue;
      if (tile.mesh) { group.remove(tile.mesh); tile.mesh.geometry.dispose(); }
      tiles.delete(key); dirty = true;
    }
    if (dirty || Math.hypot(px - lastFill.x, pz - lastFill.z) > 7) { refill(px, pz); lastFill = { x: px, z: pz }; dirty = false; }
  }

  // ---- Eyes in the dark: something is watching from between the trees.
  const axis = Math.atan2(WILD.z, WILD.x);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe36b, fog: false, transparent: true });
  const eyes = [], erng = tileRng(7, 7);
  for (let i = 0; i < 11; i++) {
    const a = axis + (i / 10 - 0.5) * 1.3, r = WILD.border + WILD.limit + 5 + erng() * 10, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 0.6 || wildDepth(x, z) < 0) continue;
    const pair = new THREE.Group(), m = eyeMat.clone();
    for (const s of [-0.13, 0.13]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), m); e.position.x = s; e.scale.y = 0.6; pair.add(e); }
    pair.position.set(x, heightAt(x, z) + 0.7 + erng() * 0.9, z);
    group.add(pair);
    eyes.push({ pair, m, seed: erng() * 20 });
  }

  let started = false;
  return {
    colliders,
    get counts() { return { lumps: lumps.count, bushes: bushes.count, rocks: rocks.count, ferns: ferns.count, tufts: tufts.count, trees: trees.map((t) => t.canopy.count), tris: [lumps, bushes, rocks, ferns, tufts, ...trees.flatMap((t) => [t.trunk, t.canopy])].map((m) => Math.round(m.count * m.geometry.attributes.position.count / 3 / (m.geometry.index ? m.geometry.attributes.position.count / m.geometry.index.count : 1))) }; },
    get tileCount() { let n = 0; for (const t of tiles.values()) if (!t.empty) n++; return n; },
    update(elapsed, night, p) {
      // Everything in range is made at the start; after that, a couple of tiles a frame as you move.
      stream(p.x, p.z, started ? 2 : 1e6); started = true;
      // The eyes only show when you are deep among the trees, brighter after dark, and they blink.
      const close = smooth((wildDepth(p.x, p.z) + 10) / 12);
      for (const e of eyes) {
        const blink = Math.sin(elapsed * 0.7 + e.seed) > 0.93 ? 0 : 1, show = Math.sin(elapsed * 0.23 + e.seed * 3) > -0.2 ? 1 : 0;
        e.m.opacity += (close * (0.35 + night * 0.65) * blink * show - e.m.opacity) * 0.2;
        e.pair.visible = e.m.opacity > 0.02;
        if (e.pair.visible) e.pair.lookAt(p.x, e.pair.position.y, p.z);
      }
    },
  };
}
