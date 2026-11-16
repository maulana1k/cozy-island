import * as THREE from 'three';
import { landR, shoreR, coastShift, coastShallow } from '../logic/terrain.js';
import { PALETTE, ISLAND_RADIUS, WILD } from '../config.js';

// The sea, river and lake surface: one big shaded plane at sea level (moved out of island.js).
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

export function buildWater() {
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

