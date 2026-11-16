import * as THREE from 'three';
import { heightAt, landR, wildness, shoreR, coastShift, coastShallow, coastRock } from '../logic/terrain.js';
import { createCoastRocks } from './rocks.js';
import { PALETTE, ISLAND_RADIUS, GRASS_RADIUS, HILL, POND, WILD } from '../config.js';
import { distanceToPath, jungleAt, VILLAGE_CENTER } from '../logic/layout.js';
import { ROCK_HEIGHT } from '../logic/surface.js';
import { paintNewGround, gridSlopes, groundChanges } from './ground.js';

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
    paintNewGround(c, x, z, h, slopes[i]); // the river banks, the locals' land and the rest of the new ground
    paintCoastRock(c, x, z, r);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  for (let i = 0; i < pos.count; i++) paint(i);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // Plain painted colour, no close-up texture: it matches the flat, simple look of everything else.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
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

const waterVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // A slow, broad swell: three long waves crossing each other, none of them tall.
    float w = sin(world.x * 0.085 + world.z * 0.03 + uTime * 0.42) * 0.085 + sin(world.z * 0.07 - world.x * 0.025 - uTime * 0.34) * 0.075
            + sin((world.x * 0.6 + world.z * 0.8) * 0.17 + uTime * 0.58) * 0.035;
    world.y += w;
    vWave = w;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uTurq;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uLight;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uShore;
  uniform vec3 uWild;
  uniform float uBlend;
  uniform sampler2D uLand;
  uniform vec4 uLandBox;
  uniform sampler2D uCoast;
  uniform vec4 uCoastBox;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    float ra = length(vWorld.xz), rb = uShore + length(vWorld.xz - uWild.xy) - uWild.z;
    float mh = clamp(0.5 + 0.5 * (rb - ra) / uBlend, 0.0, 1.0);
    float r = mix(rb, ra, mh) - uBlend * mh * (1.0 - mh);
    // Over the new land the coastline comes from a baked map of the same measure, which also
    // counts the river and the lake as inland water (so they get no surf).
    // Elsewhere the round coast is moved by the same reshaping the land uses (baked from terrain.js: bays,
    // coves, points, the spit and the islets). The map's second channel says how broad the shallows are.
    vec2 cuv = (vWorld.xz - uCoastBox.xy) * uCoastBox.zw;
    vec2 cs = vec2(0.0, 0.5);
    if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0) cs = texture2D(uCoast, cuv).rg;
    vec2 luv = (vWorld.xz - uLandBox.xy) * uLandBox.zw;
    if (luv.x > 0.0 && luv.y > 0.0 && luv.x < 1.0 && luv.y < 1.0) r = texture2D(uLand, luv).r;
    else r += cs.r;
    float ang = atan(vWorld.z, vWorld.x);
    // Turquoise flats hug the shore: broad in the sandy bays, a narrow fringe round the rocky points.
    float reach = mix(7.0, 30.0, cs.g);
    float depthT = smoothstep(uShore - 2.0, uShore + reach, r);
    vec3 col = mix(uTurq, uShallow, smoothstep(uShore - 0.5, uShore + reach * 0.5, r));
    col = mix(col, uDeep, depthT);

    // Soft sparkle bands
    float band = sin(vWorld.x * 0.11 + vWorld.z * 0.07 + uTime * 0.25) * sin(vWorld.z * 0.09 - vWorld.x * 0.05 - uTime * 0.2);
    col += band * 0.035;
    col += vWave * 0.3;

    // Foam lines that breathe in and out along the shore
    float wobble = sin(ang * 14.0 + uTime * 0.6) * 0.35 + sin(ang * 31.0 - uTime * 0.9) * 0.18;
    float tide = sin(uTime * 0.5) * 0.45;
    float edge = r - (uShore + 0.25 + wobble + tide);
    // A broad band of white surf lapping at the shore, with a broken leading edge.
    float surf = edge + sin(ang * 60.0 + uTime * 1.4) * 0.25 + sin(ang * 133.0 - uTime) * 0.12;
    // Soft at both edges and only a stride wide, fading as each wave draws back.
    float wash = 0.55 + 0.45 * sin(uTime * 0.5 + 1.2);
    float foam = smoothstep(-0.55, 0.0, surf) * (1.0 - smoothstep(0.15, 1.25, surf)) * (0.45 + 0.4 * wash);
    float edge2 = r - (uShore + 2.6 + wobble * 1.4 - tide);
    foam += (1.0 - smoothstep(0.0, 0.5, abs(edge2))) * 0.28 * (1.0 - wash * 0.6);
    // Rocky shores break the swell into more white water.
    foam *= mix(1.45, 1.0, smoothstep(0.1, 0.45, cs.g));
    col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.8);

    col *= uLight;
    float alpha = mix(0.62, 0.96, depthT);
    alpha = max(alpha, clamp(foam, 0.0, 1.0) * 0.85);

    float dist = length(vWorld - cameraPosition);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

// The coastline over the new land, baked once: `shoreR` sampled every metre (half floats).
const LAND_BOX = { x0: 14, z0: -200, w: 200, h: 212 };
function bakeLand() {
  const { x0, z0, w, h } = LAND_BOX, data = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[j * w + i] = THREE.DataUtils.toHalfFloat(Math.min(120, shoreR(x0 + i + 0.5, z0 + j + 0.5)));
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}

// The irregular coast's shift (metres on the island's scale), baked on a wide box at 1.5 m: the
// sea shader adds it to its round coast where the land is not covered by the map above.
// Its second channel is how broad the shallows are there (coastShallow).
const COAST_BOX = { x0: -260, z0: -320, cell: 1.5, w: 337, h: 308 };
function bakeCoast() {
  const { x0, z0, cell, w, h } = COAST_BOX, data = new Uint16Array(w * h * 2), toHalf = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell, k = (j * w + i) * 2, s = coastShift(x, z);
    data[k] = toHalf(s);
    data[k + 1] = toHalf(Math.abs(landR(x, z) - 60) < 45 ? coastShallow(x, z) : 0.5);
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}

function buildWater() {
  const geo = new THREE.PlaneGeometry(900, 900, 220, 220);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(PALETTE.water) },
      uTurq: { value: new THREE.Color(0x86d9cc) },
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
      uFoam: { value: new THREE.Color(PALETTE.foam) },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uFogColor: { value: new THREE.Color(0xf6d9b8) },
      uFogDensity: { value: 0.004 },
      uShore: { value: ISLAND_RADIUS },
      uWild: { value: new THREE.Vector3(WILD.x, WILD.z, WILD.radius) },
      uBlend: { value: WILD.blend },
      uLand: { value: bakeLand() },
      uCoast: { value: bakeCoast() },
      uCoastBox: { value: new THREE.Vector4(COAST_BOX.x0, COAST_BOX.z0, 1 / (COAST_BOX.w * COAST_BOX.cell), 1 / (COAST_BOX.h * COAST_BOX.cell)) },
      uLandBox: { value: new THREE.Vector4(LAND_BOX.x0, LAND_BOX.z0, 1 / LAND_BOX.w, 1 / LAND_BOX.h) },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return mesh;
}

export function createIsland(scene) {
  const terrain = buildTerrain();
  const water = buildWater();
  scene.add(terrain, water);
  createCoastRocks(scene); // boulders on the rocky points and the islets
  return {
    terrain,
    water,
    update(elapsed) { water.material.uniforms.uTime.value = elapsed; terrain.userData.repaint(); },
    // Lets the sky tint the water so it follows the time of day.
    setLight(lightColor, fogColor, fogDensity) {
      const u = water.material.uniforms;
      u.uLight.value.copy(lightColor);
      u.uFogColor.value.copy(fogColor);
      u.uFogDensity.value = fogDensity;
    },
  };
}
