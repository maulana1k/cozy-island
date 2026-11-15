import * as THREE from 'three';
import { heightAt, zoneAt } from '../logic/terrain.js';
import { PALETTE, ISLAND_RADIUS, GRASS_RADIUS, HILL } from '../config.js';

const TERRAIN_SIZE = 170;
const TERRAIN_SEGMENTS = 136;

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(PALETTE.grass), grassDark = new THREE.Color(PALETTE.grassDark);
  const grassHill = new THREE.Color(PALETTE.grassHill);
  const sand = new THREE.Color(PALETTE.sand), sandWet = new THREE.Color(PALETTE.sandWet);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const r = Math.hypot(x, z);
    if (zoneAt(x, z) === 'grass') {
      // Patchy greens, lighter up the hill, blending into sand at the rim.
      const patch = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.1) * Math.cos(z * 0.19);
      c.copy(grass).lerp(grassDark, patch * 0.55);
      const hillT = Math.min(1, Math.max(0, (h - 2) / HILL.height));
      c.lerp(grassHill, hillT * 0.8);
      const rim = Math.min(1, Math.max(0, (r - (GRASS_RADIUS - 2.5)) / 2.5));
      c.lerp(sand, rim);
    } else {
      const wet = Math.min(1, Math.max(0, (r - (ISLAND_RADIUS - 4)) / 4));
      c.copy(sand).lerp(sandWet, wet);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
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
