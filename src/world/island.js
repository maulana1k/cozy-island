import * as THREE from 'three';
import { heightAt, zoneAt } from '../logic/terrain.js';
import { PALETTE, ISLAND_RADIUS, GRASS_RADIUS, HILL, POND } from '../config.js';
import { distanceToPath, jungleAt, VILLAGE_CENTER } from '../logic/layout.js';
import { ROCK_HEIGHT } from '../logic/surface.js';

const TERRAIN_SIZE = 170;
const TERRAIN_SEGMENTS = 250;

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const C = (hex) => new THREE.Color(hex);
  const grass = C(PALETTE.grass), grassDark = C(PALETTE.grassDark), grassHill = C(PALETTE.grassHill);
  const sand = C(PALETTE.sand), sandWet = C(PALETTE.sandWet);
  const trail = C(0xedd2a0), trailEdge = C(0xc9a26a), soil = C(0xc4914f), meadow = C(0x9cc468), meadowDark = C(0x7fae56);
  const forest = C(0x86a85a), forestSoil = C(0x8f7a4c), mud = C(0x86654a), mudWet = C(0x5f4a38), bed = C(0x6f6a52), rock = C(0xb3a8ad);
  const c = new THREE.Color();
  const blotch = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.1) * Math.cos(z * 0.19);
  const speck = (x, z) => 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9) * Math.sin(z * 1.3 - x * 0.6);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const r = Math.hypot(x, z), pd = Math.hypot(x - POND.x, z - POND.z);
    if (r < GRASS_RADIUS + 1) {
      // Dry golden grass with darker and barer patches, lighter up the hill.
      c.copy(grass).lerp(grassDark, blotch(x, z) * 0.55).lerp(soil, smooth((speck(x * 0.35, z * 0.35) - 0.72) / 0.2) * 0.45);
      c.lerp(grassHill, Math.min(1, Math.max(0, (h - 2) / HILL.height)) * 0.8);
      // Jungle floor: greener, with dark leaf-litter soil showing through.
      const j = jungleAt(x, z);
      if (j > 0) c.lerp(forest, j * 0.85).lerp(forestSoil, j * smooth((speck(x * 0.6, z * 0.6) - 0.55) / 0.3) * 0.6);
      // Lush meadow round the pond, mud at its edge, a dark bed under the water.
      c.lerp(meadow, smooth(1 - (pd - POND.rw - 2) / 8)).lerp(meadowDark, smooth(1 - (pd - POND.rw - 2) / 8) * blotch(x * 2, z * 2) * 0.5);
      c.lerp(mud, smooth(1 - (pd - POND.rw - 0.4) / 1.8)).lerp(mudWet, smooth(1 - (pd - POND.rw + 0.6) / 1.2));
      if (h < 0 && pd < POND.rw + 1) c.lerp(bed, smooth(-h / 0.3));
      // Bare rock near the top of the hill.
      c.lerp(rock, smooth((h - ROCK_HEIGHT) / 1.2) * (0.6 + speck(x, z) * 0.4));
      c.lerp(sand, Math.min(1, Math.max(0, (r - (GRASS_RADIUS - 2.5)) / 2.5)));
    } else {
      c.copy(sand).lerp(sandWet, Math.min(1, Math.max(0, (r - (ISLAND_RADIUS - 4)) / 4)));
      c.lerp(C(0xfff7dc), smooth((speck(x * 0.5, z * 0.5) - 0.6) / 0.3) * 0.3);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // Plain painted colour, no close-up texture: it matches the flat, simple look of everything else.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

const waterVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float w = sin(world.x * 0.35 + uTime * 0.9) * 0.06 + sin(world.z * 0.27 - uTime * 0.7) * 0.06
            + sin((world.x + world.z) * 0.6 + uTime * 1.3) * 0.025;
    world.y += w;
    vWave = w;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uLight;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uShore;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    float r = length(vWorld.xz);
    float ang = atan(vWorld.z, vWorld.x);
    float depthT = smoothstep(uShore - 2.0, uShore + 22.0, r);
    vec3 col = mix(uShallow, uDeep, depthT);

    // Soft sparkle bands
    float band = sin(vWorld.x * 0.11 + vWorld.z * 0.07 + uTime * 0.25) * sin(vWorld.z * 0.09 - vWorld.x * 0.05 - uTime * 0.2);
    col += band * 0.035;
    col += vWave * 0.5;

    // Foam lines that breathe in and out along the shore
    float wobble = sin(ang * 14.0 + uTime * 0.6) * 0.35 + sin(ang * 31.0 - uTime * 0.9) * 0.18;
    float tide = sin(uTime * 0.5) * 0.45;
    float edge = r - (uShore + 0.25 + wobble + tide);
    float foam = 1.0 - smoothstep(0.0, 0.7, abs(edge));
    float edge2 = r - (uShore + 2.6 + wobble * 1.4 - tide);
    foam += (1.0 - smoothstep(0.0, 0.35, abs(edge2))) * 0.55;
    col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.85);

    col *= uLight;
    float alpha = mix(0.62, 0.96, depthT);
    alpha = max(alpha, clamp(foam, 0.0, 1.0) * 0.9);

    float dist = length(vWorld - cameraPosition);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

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
      uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
      uFoam: { value: new THREE.Color(PALETTE.foam) },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uFogColor: { value: new THREE.Color(0xf6d9b8) },
      uFogDensity: { value: 0.004 },
      uShore: { value: ISLAND_RADIUS },
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
  return {
    terrain,
    water,
    update(elapsed) { water.material.uniforms.uTime.value = elapsed; },
    // Lets the sky tint the water so it follows the time of day.
    setLight(lightColor, fogColor, fogDensity) {
      const u = water.material.uniforms;
      u.uLight.value.copy(lightColor);
      u.uFogColor.value.copy(fogColor);
      u.uFogDensity.value = fogDensity;
    },
  };
}
