import { wetSurface } from './weather.js';
import * as THREE from 'three';
import { heightAt, landR, wildness, coastRock } from '../logic/terrain.js';
import { createCoastRocks } from './rocks.js';
import { buildWater } from './water.js';
import { PALETTE, ISLAND_RADIUS, GRASS_RADIUS, HILL, POND } from '../config.js';
import { distanceToPath, jungleAt, VILLAGE_CENTER, getScatter } from '../logic/layout.js';
import { ROCK_HEIGHT } from '../logic/surface.js';
import { paintNewGround, gridSlopes, groundChanges, vegTone, addVegetation } from './ground.js';

const TERRAIN_SIZE = 170;
const TERRAIN_SEGMENTS = 250;

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

// The camp's ground mesh: heights first, then colours (which need the slope), so a part of it can be
// repainted later when an area stamps the ground (see paintGround in ground.js).
function buildTerrain() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, N = TERRAIN_SEGMENTS + 1, STEP = TERRAIN_SIZE / TERRAIN_SEGMENTS;
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { heights[i] = heightAt(pos.getX(i), pos.getZ(i)); pos.setY(i, heights[i]); }
  const slopes = gridSlopes(heights, N, STEP);
  const colors = new Float32Array(pos.count * 3);
  const C = (hex) => new THREE.Color(hex);
  const grass = C(PALETTE.grass), grassDark = C(PALETTE.grassDark), grassHill = C(PALETTE.grassHill);
  const sand = C(PALETTE.sand), sandWet = C(PALETTE.sandWet);
  const soil = C(0xc4914f), meadow = C(0x7fa04c), meadowDark = C(0x67893f);
  const forest = C(0x6f8e45), forestSoil = C(0x7d7a48), mud = C(0x86654a), mudWet = C(0x5f4a38), bed = C(0x6f6a52), rock = C(0xdcc08c);
  const wildFloor = C(0x47683a), edgeGreen = C(0x8aa04f), edgeDry = C(0xa9a35e), edgeDirt = C(0xcfa266);
  const c = new THREE.Color();
  const blotch = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.1) * Math.cos(z * 0.19);
  const speck = (x, z) => 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9) * Math.sin(z * 1.3 - x * 0.6);
  // Flat angular patches (The Trail's ground): a skewed triangle lattice, each triangle one tone -
  // a touch darker and cooler, or lighter and warmer - on only about 45% of the triangles. Returns -1..1.
  const tri = (ix, iz, k) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(k + 1, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function shard(x, z) {
    const u = (x * 0.8 + z * 0.6) / 5.5, v = (-x * 0.6 + z * 0.8) / 4.2 + u * 0.35, ix = Math.floor(u), iz = Math.floor(v), up = u - ix + (v - iz) > 1 ? 1 : 0;
    const h = tri(ix, iz, up), a = tri(iz, ix, up + 2);
    return h < 0.24 ? -(0.4 + 0.6 * a) : h > 0.78 ? (0.4 + 0.6 * a) : 0;
  }
  { const sc = getScatter(); addVegetation([...sc.trees.map((t) => ({ x: t.x, z: t.z, r: 0.9 * t.scale })), ...sc.bushes.map((b) => ({ x: b.x, z: b.z, r: 0.7 * b.scale }))]); }
  function paint(i) {
    const x = pos.getX(i), z = pos.getZ(i), h = heights[i];
    const r = landR(x, z), pd = Math.hypot(x - POND.x, z - POND.z), wd = wildness(x, z);
    if (r < GRASS_RADIUS + 1) {
      // Dry golden grass with darker and barer patches, lighter up the hill.
      c.copy(grass).lerp(grassDark, blotch(x, z) * 0.55).lerp(soil, smooth((speck(x * 0.35, z * 0.35) - 0.72) / 0.2) * 0.45);
      const hillT = Math.min(1, Math.max(0, (h - 2) / 6));
      c.lerp(grassHill, hillT * 0.8);
      // The camp's edges: away from the tents the grass goes patchy, greener in the hollows,
      // paler and drier in the open, with bare earth where the slope wears through.
      const edge = smooth((Math.hypot(x - 10, z - 8) - 24) / 14) * (1 - hillT * 0.7);
      if (edge > 0) {
        const p1 = blotch(x * 0.55 + 31, z * 0.55 - 7), p2 = speck(x * 0.22 + 3, z * 0.22);
        c.lerp(edgeGreen, edge * smooth((p1 - 0.55) / 0.3) * 0.55).lerp(edgeDry, edge * smooth((p2 - 0.6) / 0.3) * 0.45);
        c.lerp(edgeDirt, edge * Math.max(smooth((slopes[i] - 0.3) / 0.3) * 0.6, smooth((speck(x * 0.5 + 9, z * 0.5) - 0.8) / 0.15) * 0.35));
      }
      // Jungle floor: greener, with dark leaf-litter soil showing through.
      const j = jungleAt(x, z) * (1 - hillT * 0.85); // the hill is open golden grass, not jungle floor
      if (j > 0) c.lerp(forest, j * 0.7).lerp(forestSoil, j * smooth((speck(x * 0.6, z * 0.6) - 0.55) / 0.3) * 0.45);
      // Lush meadow round the pond, mud at its edge, a dark bed under the water.
      c.lerp(meadow, smooth(1 - (pd - POND.rw - 2) / 8)).lerp(meadowDark, smooth(1 - (pd - POND.rw - 2) / 8) * blotch(x * 2, z * 2) * 0.5);
      c.lerp(mud, smooth(1 - (pd - POND.rw - 0.4) / 1.8)).lerp(mudWet, smooth(1 - (pd - POND.rw + 0.6) / 1.2));
      if (h < 0 && pd < POND.rw + 1) c.lerp(bed, smooth(-h / 0.3));
      // Bare rock near the top of the hill.
      c.lerp(rock, smooth((h - ROCK_HEIGHT) / 1.2) * (0.6 + speck(x, z) * 0.4));
      // Past the rope the ground turns dark and damp under the big trees.
      // Deeper into the jungle the same ground just grows greener and damper, in patches.
      if (wd > 0) c.lerp(forest, wd * 0.5).lerp(wildFloor, wd * (0.25 + 0.45 * blotch(x * 0.6 + 9, z * 0.6)));
      c.lerp(sand, Math.min(1, Math.max(0, (r - (GRASS_RADIUS - 2.5)) / 2.5)));
    } else {
      c.copy(sand).lerp(sandWet, Math.min(1, Math.max(0, (r - (ISLAND_RADIUS - 4)) / 4)));
      c.lerp(C(0xfff7dc), smooth((speck(x * 0.5, z * 0.5) - 0.6) / 0.3) * 0.3);
    }
    if (!paintNewGround(c, x, z, h, slopes[i]) && h > 0.1) vegTone(c, x, z, true); // the river banks, the locals' land and the rest of the new ground; else the camp's own grass tone
    paintCoastRock(c, x, z, r);
    // Break up the big flat greens: only where the ground is grass (not sand, dirt, rock or water).
    const green = smooth((c.g / Math.max(1e-4, c.r) - 1.2) / 0.2);
    if (green > 0 && h > 0.05) {
      const s = shard(x, z) * green;
      if (s < 0) { c.r *= 1 + s * 0.13; c.g *= 1 + s * 0.11; c.b *= 1 + s * 0.04; } else if (s > 0) { c.r *= 1 + s * 0.09; c.g *= 1 + s * 0.08; c.b *= 1 - s * 0.06; }
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  for (let i = 0; i < pos.count; i++) paint(i);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // Plain painted colour, no close-up texture: it matches the flat, simple look of everything else.
  const mat = wetSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); // darker when it rains (src/world/weather.js)
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  // Repaints the vertices inside each box [x0, x1, z0, z1].
  let seen = 0;
  mesh.userData.repaint = () => {
    const { version, boxes } = groundChanges(seen);
    if (version === seen) return;
    seen = version;
    const h0 = TERRAIN_SIZE / 2, idx = (v) => Math.round((v + h0) / STEP);
    for (const [x0, x1, z0, z1] of boxes) {
      if (x1 < -h0 || x0 > h0 || z1 < -h0 || z0 > h0) continue;
      for (let iz = Math.max(0, idx(z0)); iz <= Math.min(N - 1, idx(z1)); iz++) for (let ix = Math.max(0, idx(x0)); ix <= Math.min(N - 1, idx(x1)); ix++) paint(iz * N + ix);
    }
    geo.attributes.color.needsUpdate = true;
  };
  mesh.userData.repaint();
  return mesh;
}

// Rocky points and islets: grey-brown rock near the waterline, in patches further up. Shared with wilds.js.
const COAST_ROCK = [new THREE.Color(0x8c8378), new THREE.Color(0x766e66), new THREE.Color(0xa0968a)];
export function paintCoastRock(c, x, z, r) {
  if (r < 46) return;
  const k = Math.min(1, coastRock(x, z) * 1.25) * smooth((r - 47.5) / 3);
  if (k <= 0) return;
  const v = 0.5 + 0.5 * Math.sin(x * 1.3 + Math.cos(z * 1.1) * 2) * Math.cos(z * 0.9 - x * 0.4);
  c.lerp(v < 0.33 ? COAST_ROCK[1] : v > 0.7 ? COAST_ROCK[2] : COAST_ROCK[0], k);
}

export function createIsland(scene) {
  const terrain = buildTerrain();
  const water = buildWater();
  scene.add(terrain, water);
  createCoastRocks(scene); // boulders on the rocky points and the islets
  return {
    terrain,
    water,
    update(elapsed) { water.userData.update(elapsed); terrain.userData.repaint(); },
    // Lets the sky tint the water so it follows the time of day (see setLight in water.js).
    setLight(lightColor, fogColor, fogDensity, sun, rain) { water.userData.setLight(lightColor, fogColor, fogDensity, sun, rain); },
  };
}
