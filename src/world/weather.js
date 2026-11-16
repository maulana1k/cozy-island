// Dynamic weather: a director that picks the next weather, a blender that fades between looks without
// popping, and three particle kinds (rain streaks, straight wind streaks, low ground mist), each ONE
// instanced mesh whose motion is computed entirely in its vertex shader. Per frame the CPU only writes
// a few uniforms and a handful of numbers: no allocations.
//
// Everything else listens to the numbers this module publishes (all 0..1, live on the returned object):
//   wind (strength) with windX/windZ (unit direction the air moves toward), rain, fog, cloud, wet, cold.
// - src/world/sky.js turns cloud/rain/fog/cold into light, sky and fog multipliers.
// - Plants and trees bend through the one shared WIND uniform and windSway(): no per-object animation code.
// - src/world/props.js fades campfires and strengthens lamps; src/logic/stats.js uses `cold`.
import * as THREE from 'three';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';

export const KINDS = ['sun', 'wind', 'rain', 'fog'];
export const LABEL = { sun: 'Sunny', wind: 'Windy', rain: 'Rainy', fog: 'Foggy' };

// ---- Shared uniforms ------------------------------------------------------------------------------
// WIND: x, y = direction (x, z) the wind blows toward, z = strength 0..1, w = wind clock (speeds up in gusts).
export const WIND = { value: new THREE.Vector4(1, 0, 0.12, 0) };
// WET: 0 dry .. 1 soaked; darkens whatever wetSurface() was applied to.
export const WET = { value: 0 };

// GLSL: how far the wind pushes something standing at `at` (world xz); multiply by a height weight.
export const WIND_GLSL = /* glsl */`
vec2 windPush(vec2 at, float t, float s) {
  float gust = 0.55 + 0.45 * sin(t * 0.35 + dot(at, uWind.xy) * 0.05);
  float ph = t * (0.7 + 0.5 * s) + at.x * 0.31 + at.y * 0.23;
  float amp = 0.02 + 0.5 * s * s;
  vec2 along = uWind.xy * (0.5 + 0.5 * sin(ph)) * gust;
  vec2 across = vec2(-uWind.y, uWind.x) * sin(ph * 0.7 + 1.3) * 0.25 * gust;
  return (along + across) * amp;
}`;

// Makes an instanced material bend with the shared wind: the higher a vertex sits (in the model's own
// units, so bigger instances move more in the world), the further it is pushed.
export function windSway(material, k = 0.012) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    shader.uniforms.uWind = WIND;
    shader.vertexShader = 'uniform vec4 uWind;\n' + WIND_GLSL + '\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        { float wh = min(position.y, 8.0);
          transformed.xz += windPush(instanceMatrix[3].xz, uWind.w, uWind.z) * (wh * wh * ${k.toFixed(4)} * 20.0); }
      #endif`);
  };
  return material;
}

// Soaks a material: wetter ground reads darker and a touch more saturated.
export function wetSurface(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(material, shader, renderer);
    shader.uniforms.uWet = WET;
    shader.fragmentShader = 'uniform float uWet;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= 1.0 - 0.30 * uWet;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * diffuseColor.rgb * 1.7, 0.18 * uWet);`);
  };
  return material;
}

// ---- Looks ----------------------------------------------------------------------------------------
// Target values per weather. `wet` is not here: it follows rain on its own clock (soaks fast, dries slowly).
const LOOK = {
  sun: { wind: 0.12, rain: 0, fog: 0, cloud: 0.08, cold: 0 },
  wind: { wind: 1, rain: 0, fog: 0, cloud: 0.4, cold: 0.05 },
  rain: { wind: 0.38, rain: 1, fog: 0.12, cloud: 1, cold: 0.3 },
  fog: { wind: 0.08, rain: 0, fog: 1, cloud: 0.45, cold: 1 },
};
const KEYS = ['wind', 'rain', 'fog', 'cloud', 'cold'];

const BLEND_MIN = 20, BLEND_MAX = 40; // s of real time to blend into the next weather
const HOURS_MIN = 3, HOURS_MAX = 6; // in-game hours a weather lasts
const smooth = (x) => x * x * (3 - 2 * x);

// Odds of the next weather by in-game hour. Sunny is most common; fog belongs to the early morning
// (dawn until about 10:00) and is nearly impossible later; rain and wind can arrive at any time.
export function oddsAt(hour, previous) {
  const fog = hour >= 4 && hour < 8 ? 0.34 : hour >= 8 && hour < 10 ? 0.34 - (hour - 8) * 0.11 : 0.01;
  const w = { sun: 0.52, wind: 0.17, rain: 0.19, fog };
  if (previous !== 'sun') w.sun *= 1.35; // a change of weather is usually followed by a clear spell
  if (previous && previous !== 'sun') w[previous] *= 0.15; // and never the same bad weather twice running
  const total = w.sun + w.wind + w.rain + w.fog;
  for (const k of KINDS) w[k] /= total;
  return w;
}

// ---- Particle shaders -----------------------------------------------------------------------------
const RAIN_N = 1900, SPLASH_N = 150, WIND_N = 170, WIND_SEGS = 16, MIST_N = 52, LEAF_N = 220;

function seeded(n, rng, width = 4) {
  const a = new Float32Array(n * width);
  for (let i = 0; i < a.length; i++) a[i] = rng();
  return a;
}
function instanced(geo, n, attrs) {
  for (const [name, data, size] of attrs) geo.setAttribute(name, new THREE.InstancedBufferAttribute(data, size));
  const m = new THREE.InstancedMesh(geo, null, n);
  m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.visible = false;
  return m;
}

function buildRain() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const uniforms = { uTime: { value: 0 }, uAmt: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(0, -6.5, 0) }, uWindDir: { value: new THREE.Vector2(1, 0) }, uGust: { value: 0 }, uColor: { value: new THREE.Color(0xc9d8ea) }, uAlpha: { value: 0.5 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      // aSeed: where the drop lives (xyz) and the rain amount it needs (w).
      // aSeed2: its own speed (x), size (y), wobble rate (z) and phase (w), so no two drops fall alike.
      attribute vec4 aSeed; attribute vec4 aSeed2;
      uniform float uTime, uAmt, uGust; uniform vec3 uCenter, uVel; uniform vec2 uWindDir; varying float vA; varying float vU;
      void main() {
        const vec3 BOX = vec3(34.0, 20.0, 34.0);
        if (aSeed.w > uAmt) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; vU = 0.0; return; }
        vec3 vel = uVel * (0.55 + 0.9 * aSeed2.x);
        vec3 rel = mod(aSeed.xyz * BOX + vel * uTime - uCenter + BOX * 0.5, BOX) - BOX * 0.5;
        vec3 wp = uCenter + rel;
        // Each drop wanders a little on its own, and gusts sweep across the field as waves.
        float ph = aSeed2.w * 6.2832, fq = 0.8 + aSeed2.z * 2.2;
        vec3 wob = vec3(sin(uTime * fq + ph), 0.0, cos(uTime * fq * 0.83 + ph * 1.7)) * (0.12 + 0.3 * aSeed2.z);
        float g = sin(uTime * 0.7 + dot(wp.xz, uWindDir) * 0.09) + 0.6 * sin(uTime * 1.7 + wp.x * 0.21 - wp.z * 0.17);
        vec3 push = vec3(uWindDir.x, 0.0, uWindDir.y) * (g * 0.5 + 0.3) * uGust;
        vec3 head = wp + wob + push * 1.4;
        float len = 0.03 + 0.035 * aSeed2.y;
        vec3 tail = head - (vel + push * 1.6 + wob * 1.5) * len;
        vec4 a = viewMatrix * vec4(head, 1.0), b = viewMatrix * vec4(tail, 1.0);
        vec3 side = normalize(cross(b.xyz - a.xyz, a.xyz) + 1e-5);
        float dist = length(a.xyz);
        vec4 v = mix(a, b, position.y); v.xyz += side * position.x * (0.008 + 0.012 * aSeed2.y) * (1.0 + dist * 0.035);
        gl_Position = projectionMatrix * v;
        float edge = (1.0 - smoothstep(0.7, 1.0, abs(rel.y) / 10.0)) * (1.0 - smoothstep(0.7, 1.0, length(rel.xz) / 17.0));
        float bright = 0.35 + 0.65 * fract(sin(aSeed2.x * 91.7 + aSeed2.w * 37.1) * 4375.5);
        vA = edge * bright * smoothstep(0.8, 2.5, dist) * (1.0 - position.y * 0.7);
        vU = position.x;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; varying float vA; varying float vU;
      void main() { gl_FragColor = vec4(uColor, vA * uAlpha * (1.0 - smoothstep(0.15, 0.5, abs(vU))));
        #include <colorspace_fragment>
      }`,
  });
  const m = instanced(geo, RAIN_N, [['aSeed', seeded(RAIN_N, createRng(SEED + 131)), 4], ['aSeed2', seeded(RAIN_N, createRng(SEED + 137)), 4]]);
  m.material = mat; m.renderOrder = 5; m.name = 'rain';
  return { mesh: m, uniforms };
}

// Drops landing: little rings that open and fade on the ground around the player, one instanced mesh.
// Each slot repeats on its own beat and picks a new spot every time round.
function buildSplashes() {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const uniforms = { uTime: { value: 0 }, uAmt: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBase: { value: 0 }, uColor: { value: new THREE.Color(0xdfe9f4) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uAmt, uBase; uniform vec3 uCenter; varying vec2 vUv; varying float vA; varying float vAge;
      float h(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float period = 0.45 + aSeed.z * 0.6;
        float c = uTime / period + aSeed.w * 7.0, k = floor(c);
        vAge = c - k;
        vec2 spot = vec2(h(aSeed.x * 91.0 + k * 1.31 + aSeed.y), h(aSeed.y * 57.0 + k * 2.17 + aSeed.x)) - 0.5;
        const float R = 15.0;
        vec2 xz = uCenter.xz + spot * 2.0 * R;
        float r = (0.05 + vAge * (0.16 + 0.12 * aSeed.z)) ;
        vec3 world = vec3(xz.x + position.x * r * 2.0, uBase + 0.07, xz.y + position.z * r * 2.0);
        vUv = uv;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mv;
        float rank = fract(aSeed.x * 41.7 + aSeed.y * 13.3);
        vA = step(rank, uAmt) * (1.0 - smoothstep(0.55, 1.0, length(spot) * 2.0)) * smoothstep(1.0, 4.0, length(mv.xyz));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying vec2 vUv; varying float vA; varying float vAge;
      void main() {
        float d = length(vUv * 2.0 - 1.0);
        float ring = smoothstep(0.62, 0.86, d) * (1.0 - smoothstep(0.9, 1.0, d));
        gl_FragColor = vec4(uColor, ring * vA * (1.0 - vAge) * (1.0 - vAge) * 0.55);
        #include <colorspace_fragment>
      }`,
  });
  const m = instanced(geo, SPLASH_N, [['aSeed', seeded(SPLASH_N, createRng(SEED + 149)), 4]]);
  m.material = mat; m.renderOrder = 4; m.name = 'rainSplashes';
  return { mesh: m, uniforms };
}

// Wind streaks up at treetop height (about 4-7 m). The field moves by uOff, an offset the CPU adds up
// each frame (wrapped to the box), so a turning wind never swings the whole field sideways. Each streak's
// shape is the path its head took over the last second or two: most are long, gently wavy lines along
// the wind; about a third now and then roll into a slow loop, like a curl of air.
export const STREAK_BOX = [34, 3, 34];
export const streakSpeed = (wind) => 2.0 + wind * 0.8; // m/s the streaks glide (the CPU offset uses the same)
function buildWindStreaks(rng) {
  const verts = [], idx = [];
  for (let i = 0; i <= WIND_SEGS; i++) { const s = i / WIND_SEGS; verts.push(-0.5, s, 0, 0.5, s, 0); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k, k - 1, k + 1); } }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setIndex(idx);
  const uniforms = { uTime: { value: 0 }, uAmt: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector3() }, uSpeed: { value: 2 }, uWind: WIND, uAlpha: { value: 0.55 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; attribute vec4 aSeed2; uniform float uTime, uAmt, uSpeed; uniform vec3 uCenter, uOff; uniform vec4 uWind; varying float vA;
      const vec3 BOX = vec3(${STREAK_BOX.map((v) => v.toFixed(1)).join(', ')});
      vec3 D, A, BASE; float CURLY, PH;
      // Where the streak's head was \`back\` seconds ago (relative to the head now).
      vec3 path(float back) {
        float t = uTime - back;
        vec3 p = BASE - D * uSpeed * back;
        // every line sways a little across the wind and up and down, slowly
        p += A * sin(t * 0.55 + PH) * 0.35 + vec3(0.0, 1.0, 0.0) * sin(t * 0.4 + PH * 1.7) * 0.18;
        // the curly ones roll into a loop now and then: radius x rate > speed, so it really curls over
        float env = CURLY * smoothstep(0.2, 0.85, sin(t * 0.3 + PH * 3.0));
        float w = 2.6 + aSeed2.y * 0.6, r = 0.85 + aSeed2.z * 0.3, ang = t * w + PH;
        p += env * r * (D * sin(ang) + vec3(0.0, 1.0, 0.0) * (1.0 - cos(ang)));
        return p;
      }
      void main() {
        if (aSeed.w > uAmt) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
        D = normalize(vec3(uWind.x, 0.0, uWind.y) + vec3(1e-5, 0.0, 0.0));
        A = vec3(-D.z, 0.0, D.x);
        CURLY = step(0.66, aSeed2.w); PH = aSeed2.w * 37.0 + aSeed.x * 11.0;
        vec3 head = aSeed.xyz * BOX + uOff;
        vec3 rel = mod(head - uCenter + BOX * 0.5, BOX) - BOX * 0.5;
        BASE = uCenter + rel;
        float s = position.y, tail = mix(1.3, 2.4, CURLY) * (0.8 + aSeed2.x * 0.4);
        vec3 p = path(s * tail), q = path(s * tail + 0.04);
        vec4 a = viewMatrix * vec4(p, 1.0), b = viewMatrix * vec4(q, 1.0);
        vec3 side = normalize(cross(a.xyz - b.xyz, a.xyz) + 1e-5);
        float dist = length(a.xyz), taper = sin(3.14159 * s);
        vec4 v = a; v.xyz += side * position.x * 0.045 * taper * (1.0 + dist * 0.03);
        gl_Position = projectionMatrix * v;
        float edge = (1.0 - smoothstep(0.6, 1.0, abs(rel.y) / (BOX.y * 0.5))) * (1.0 - smoothstep(0.6, 1.0, length(rel.xz) / (BOX.x * 0.5)));
        vA = edge * smoothstep(3.0, 7.0, dist) * taper;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAlpha; varying float vA;
      void main() { gl_FragColor = vec4(vec3(1.0), vA * uAlpha);
        #include <colorspace_fragment>
      }`,
  });
  const m = instanced(geo, WIND_N, [['aSeed', seeded(WIND_N, rng), 4], ['aSeed2', seeded(WIND_N, rng), 4]]);
  m.material = mat; m.renderOrder = 6; m.name = 'windStreaks';
  return { mesh: m, uniforms };
}

// Falling leaves: small two-sided leaves fluttering down from treetop height around the player, tumbling
// and swaying, carried by the wind (uOff, added up on the CPU like the streaks). A few on a calm day,
// many in a gale. Green and autumn tones; darkened at night.
export const LEAF_BOX = [26, 7, 26];
export const leafDrift = (wind) => 0.15 + wind * 2.0; // m/s sideways with the wind
function buildLeaves(rng) {
  const geo = new THREE.BufferGeometry();
  // a leaf: a pointed diamond with a little fold, ~14 cm long
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.07, 0.045, 0.008, 0, 0, 0, 0.07, -0.045, 0.008, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const uniforms = { uTime: { value: 0 }, uAmt: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector3() }, uWind: WIND, uDark: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aSeed; attribute vec4 aSeed2; uniform float uTime, uAmt; uniform vec3 uCenter, uOff; uniform vec4 uWind; varying float vA; varying vec3 vC;
      const vec3 BOX = vec3(${LEAF_BOX.map((v) => v.toFixed(1)).join(', ')});
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
      void main() {
        if (aSeed.w > uAmt) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
        float ph = aSeed2.w * 6.2832, gust = uWind.z;
        float fall = 0.45 + aSeed2.x * 0.4;                       // m/s down: leaves drift, they don't drop
        float y = BOX.y - mod(aSeed.y * BOX.y + fall * uTime, BOX.y); // height above the ground, top to bottom
        vec3 head = vec3(aSeed.x * BOX.x, 0.0, aSeed.z * BOX.z) + uOff;
        vec2 rel = mod(head.xz - uCenter.xz + BOX.xz * 0.5, BOX.xz) - BOX.xz * 0.5;
        vec3 d = normalize(vec3(uWind.x, 0.0, uWind.y) + vec3(1e-5, 0.0, 0.0)), across = vec3(-d.z, 0.0, d.x);
        // the falling-leaf pendulum: swings side to side as it sinks, more in the wind
        float swing = sin(uTime * (1.4 + aSeed2.z * 0.8) + ph);
        vec3 world = vec3(uCenter.x + rel.x, uCenter.y + y, uCenter.z + rel.y) + across * swing * (0.35 + gust * 0.4) + d * swing * swing * 0.15;
        // tumble: rocks with the swing, spins faster in the wind
        mat3 R = rotY(ph + uTime * (0.6 + gust * 1.5) * (aSeed2.z - 0.5) * 2.0) * rotZ(swing * 0.9) * rotX(uTime * (0.8 + gust * 2.5) * aSeed2.y);
        vec4 mv = viewMatrix * vec4(world + R * (position * (0.8 + aSeed2.y * 0.6)), 1.0);
        gl_Position = projectionMatrix * mv;
        float edge = 1.0 - smoothstep(0.6, 1.0, length(rel) / (BOX.x * 0.5));
        vA = edge * smoothstep(0.0, 0.5, y) * smoothstep(BOX.y, BOX.y - 0.8, y) * smoothstep(0.6, 2.0, -mv.z);
        vec3 green = mix(vec3(0.33, 0.45, 0.16), vec3(0.47, 0.55, 0.2), aSeed.x);
        vec3 autumn = mix(vec3(0.78, 0.55, 0.18), vec3(0.6, 0.32, 0.14), aSeed.z);
        vC = mix(green, autumn, step(0.55, aSeed2.w)) * (0.85 + 0.3 * aSeed2.y);
        vec4 mvPosition = mv;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uDark; varying float vA; varying vec3 vC;
      void main() { gl_FragColor = vec4(vC * uDark, vA);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  Object.assign(mat.uniforms, uniforms);
  const m = instanced(geo, LEAF_N, [['aSeed', seeded(LEAF_N, rng), 4], ['aSeed2', seeded(LEAF_N, rng), 4]]);
  m.material = mat; m.renderOrder = 5; m.name = 'leaves';
  return { mesh: m, uniforms };
}

// Low ground fog: big soft discs lying just above the ground, drifting slowly, thickest near the ground.
function buildMist(rng) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const uniforms = { uTime: { value: 0 }, uAmt: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBase: { value: 0 }, uDrift: { value: new THREE.Vector2(0.5, 0.2) }, uColor: { value: new THREE.Color(0xdde4e8) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uAmt, uBase; uniform vec3 uCenter; uniform vec2 uDrift; varying vec2 vUv; varying float vA;
      void main() {
        const vec2 BOX = vec2(70.0);
        float rank = fract(aSeed.x * 41.7 + aSeed.y * 13.3);
        vec2 rel = mod(aSeed.xy * BOX + uDrift * (0.6 + aSeed.w) * uTime - uCenter.xz + BOX * 0.5, BOX) - BOX * 0.5;
        float r = 4.5 + aSeed.w * 5.5;
        vec3 world = vec3(uCenter.x + rel.x, uBase + 0.12 + aSeed.z * 1.5, uCenter.z + rel.y) + vec3(position.x, 0.0, position.z) * r * 2.0;
        vUv = uv;
        vec4 mv = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = length(mv.xyz);
        vA = step(rank, uAmt) * (1.0 - smoothstep(0.55, 1.0, length(rel) / 35.0)) * smoothstep(1.5, 6.0, dist);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying vec2 vUv; varying float vA;
      void main() { float d = length(vUv * 2.0 - 1.0); float a = (1.0 - smoothstep(0.0, 1.0, d)); gl_FragColor = vec4(uColor, a * a * vA * 0.42);
        #include <colorspace_fragment>
      }`,
  });
  const m = instanced(geo, MIST_N, [['aSeed', seeded(MIST_N, rng), 4]]);
  m.material = mat; m.renderOrder = 4; m.name = 'groundMist';
  return { mesh: m, uniforms };
}

// ---- The weather ----------------------------------------------------------------------------------
// params: URLSearchParams, for ?weather=rain|wind|fog|sun (forced: it never changes).
export function createWeather(scene, params, audio) {
  const rng = createRng(SEED + 97);
  const rain = buildRain(), splash = buildSplashes(), streaks = buildWindStreaks(rng), mist = buildMist(rng), leaves = buildLeaves(rng);
  scene.add(rain.mesh, splash.mesh, streaks.mesh, mist.mesh, leaves.mesh);
  const streakOff = new THREE.Vector3(), leafOff = new THREE.Vector3();

  const cur = { wind: 0, rain: 0, fog: 0, cloud: 0, cold: 0 };
  const from = { ...cur }, to = { ...cur };
  const w = {
    kind: 'sun', previous: null, forced: false,
    wind: 0, windX: 1, windZ: 0, rain: 0, fog: 0, cloud: 0, wet: 0, cold: 0,
    nextKind: 'sun', hoursLeft: 0, blend: 1, blendTime: 1,
    label: LABEL.sun,
    flash: 0, flashClock: -1, strike,
    setKind, update, force,
  };
  let thunderIn = -1;
  let windAngle = 0.6, windClock = 0, clock = 0, baseY = 0, lastT = -1, hasBase = false;

  // Starts the blend toward `kind`; with `instant`, jumps straight there (the debug override).
  function setKind(kind, hour = 12, instant = false) {
    const look = LOOK[kind];
    w.previous = w.kind; w.kind = kind; w.label = LABEL[kind];
    // Each time is a little different: a drizzle or a downpour, a breeze or a gale.
    const strength = kind === 'sun' ? 1 : 0.72 + rng() * 0.28;
    for (const k of KEYS) { from[k] = cur[k]; to[k] = look[k] * (k === 'wind' || k === 'rain' ? strength : 1); }
    if (instant) { w.blend = 1; for (const k of KEYS) cur[k] = to[k]; w.wet = cur.rain; } else w.blend = 0;
    w.blendTime = BLEND_MIN + rng() * (BLEND_MAX - BLEND_MIN);
    let hours = HOURS_MIN + rng() * (HOURS_MAX - HOURS_MIN);
    if (kind === 'fog') hours = Math.min(hours, Math.max(1.5, 10.5 - hour)); // the fog burns off by about 10:30
    w.hoursLeft = hours;
  }

  // Pause-menu override: a chosen kind blends in over a few seconds and stays; 'auto' hands back to the director.
  function force(kind, hour = 12) {
    if (!kind || kind === 'auto' || !LOOK[kind]) { w.forced = false; w.hoursLeft = 0; return; } // the director picks on the next update
    w.forced = true; setKind(kind, hour); w.blendTime = 4; w.hoursLeft = 1e9;
  }

  const forced = params && params.get('weather');
  const alias = { sun: 'sun', sunny: 'sun', clear: 'sun', wind: 'wind', windy: 'wind', rain: 'rain', rainy: 'rain', fog: 'fog', foggy: 'fog' };
  if (forced && alias[forced]) { w.forced = true; setKind(alias[forced], 12, true); w.hoursLeft = 1e9; }
  else { setKind('sun', 12, true); w.hoursLeft = 2 + rng() * 2; }

  // Lightning: a flash now (one to three quick flickers), the rumble a few seconds later like real distance.
  function strike(delay = 2.5 + Math.random() * 3.5, strength = 0.5 + Math.random() * 0.5) {
    w.flashClock = 0; w.flashPeak = 0.6 + 0.4 * strength; w.flashThird = Math.random() < 0.4;
    try { audio && audio.thunder && audio.thunder(delay, strength); } catch { /* sound is optional */ }
  }
  const thunderDebug = !!(params && params.has('thunder'));

  function choose(hour) {
    const odds = oddsAt(hour, w.kind);
    let r = rng(), pick = 'sun';
    for (const k of KINDS) { r -= odds[k]; if (r <= 0) { pick = k; break; } }
    setKind(pick, hour);
  }

  // dt real seconds; t time of day (0..1); camera/focus for where the particles gather; night 0..1.
  function update(dt, t, camera, focus, night = 0) {
    // The director counts in-game hours, so sleeping through the night or speeding the clock moves it along.
    if (lastT >= 0 && !w.forced) {
      let d = t - lastT; if (d < -0.5) d += 1; if (d > 0.5) d -= 1;
      w.hoursLeft -= Math.abs(d) * 24;
      if (w.hoursLeft <= 0) choose(t * 24);
    }
    lastT = t;

    // Blend (real time), eased so nothing starts or stops abruptly.
    if (w.blend < 1) {
      w.blend = Math.min(1, w.blend + dt / w.blendTime);
      const k = smooth(w.blend);
      for (const key of KEYS) cur[key] = from[key] + (to[key] - from[key]) * k;
    }
    w.wind = cur.wind; w.rain = cur.rain; w.fog = cur.fog; w.cloud = cur.cloud; w.cold = cur.cold;
    // Wet ground: soaks within about 35 s of steady rain, takes about two minutes to dry.
    if (cur.rain > w.wet) w.wet = Math.min(cur.rain, w.wet + dt / 35); else w.wet = Math.max(cur.rain, w.wet - dt / 110);
    WET.value = w.wet;

    // The wind direction wanders slowly; the wind's own clock runs faster in a gale, never backwards.
    windAngle += (Math.sin(clock * 0.037) * 0.09 + Math.sin(clock * 0.11 + 1.7) * 0.05) * dt;
    clock += dt; windClock += dt * (0.6 + 0.3 * w.wind);
    w.windX = Math.cos(windAngle); w.windZ = Math.sin(windAngle);
    WIND.value.set(w.windX, w.windZ, w.wind, windClock);
    // The streak and leaf fields move by offsets added up here (wrapped to their boxes), never by direction x time.
    { const v = streakSpeed(w.wind) * dt; streakOff.x = (streakOff.x + w.windX * v) % STREAK_BOX[0]; streakOff.z = (streakOff.z + w.windZ * v) % STREAK_BOX[2]; }
    { const v = leafDrift(w.wind) * dt; leafOff.x = (leafOff.x + w.windX * v) % LEAF_BOX[0]; leafOff.z = (leafOff.z + w.windZ * v) % LEAF_BOX[2]; }

    // Particles: only uniforms change.
    const cx = camera.position.x, cz = camera.position.z;
    const fx = focus ? focus.x : cx, fz = focus ? focus.z : cz, fy = focus ? focus.y : 0;
    if (!hasBase) { baseY = fy; hasBase = true; } else baseY += (fy - baseY) * Math.min(1, dt * 2);
    // Gather the particles in front of the camera, between it and the player, where they are seen.
    const gx = (cx + fx * 2) / 3, gz = (cz + fz * 2) / 3;
    const dark = 1 - night * 0.65;

    const rainOn = w.rain > 0.02;
    rain.mesh.visible = rainOn;
    if (rainOn) {
      const u = rain.uniforms;
      u.uTime.value = clock % 3600; u.uAmt.value = Math.min(1, w.rain * 1.05);
      u.uCenter.value.set(gx, baseY + 3, gz);
      u.uVel.value.set(w.windX * (0.5 + w.wind * 3.5), -6.5, w.windZ * (0.5 + w.wind * 3.5));
      u.uWindDir.value.set(w.windX, w.windZ); u.uGust.value = 0.5 + w.wind * 2.2;
      u.uColor.value.setRGB(0.62 * dark + 0.04, 0.72 * dark + 0.05, 0.86 * dark + 0.08);
      u.uAlpha.value = 0.6;
      const sp = splash.uniforms;
      sp.uTime.value = clock % 3600; sp.uAmt.value = Math.min(1, w.rain * 1.05);
      sp.uCenter.value.set(fx, 0, fz); sp.uBase.value = fy;
      sp.uColor.value.copy(u.uColor.value);
    }
    splash.mesh.visible = rainOn;
    // Thunder only in real rain; heavier rain brings it sooner. ?thunder=1 forces the first one soon.
    if (w.kind === 'rain' && w.rain > 0.6) {
      if (thunderIn < 0) thunderIn = thunderDebug ? 3 : 12 + Math.random() * 25;
      thunderIn -= dt;
      if (thunderIn <= 0) { strike(thunderDebug ? 3 : undefined); thunderIn = (25 + Math.random() * 45) * (1.3 - 0.3 * w.rain); }
    } else thunderIn = -1;
    if (w.flashClock >= 0) {
      const s = (w.flashClock += dt), p = w.flashPeak || 1;
      const pulse = (a, b, h) => (s > a && s < b ? h * (1 - (s - a) / (b - a)) : 0);
      w.flash = Math.max(pulse(0, 0.12, p), pulse(0.17, 0.3, p * 0.65), w.flashThird ? pulse(0.4, 0.5, p * 0.4) : 0);
      if (s > 0.7) { w.flashClock = -1; w.flash = 0; }
    }

    const gale = Math.max(0, (w.wind - 0.45) / 0.55);
    streaks.mesh.visible = gale > 0.01;
    if (streaks.mesh.visible) {
      const u = streaks.uniforms;
      u.uTime.value = clock % 3600; u.uAmt.value = gale * 0.5; // a few airy lines, not a swarm
      u.uCenter.value.set(gx, baseY + 5.5, gz); // up at treetop height
      u.uOff.value.copy(streakOff); u.uSpeed.value = streakSpeed(w.wind);
      u.uAlpha.value = 0.5 * (0.45 + 0.55 * dark);
    }
    // Falling leaves: a few on a calm day, many in a gale; fewer in heavy rain.
    const leafAmt = (0.06 + 0.94 * Math.max(0, (w.wind - 0.1) / 0.9)) * (1 - 0.6 * w.rain);
    leaves.mesh.visible = leafAmt > 0.01;
    if (leaves.mesh.visible) {
      const u = leaves.uniforms;
      u.uTime.value = clock % 3600; u.uAmt.value = Math.min(1, leafAmt);
      u.uCenter.value.set(fx, baseY - 0.2, fz); u.uOff.value.copy(leafOff);
      u.uDark.value = dark;
    }
    mist.mesh.visible = w.fog > 0.02;
    if (mist.mesh.visible) {
      const u = mist.uniforms;
      u.uTime.value = clock % 3600; u.uAmt.value = Math.min(1, w.fog * 1.1);
      u.uCenter.value.set(fx, baseY, fz);
      u.uDrift.value.set(w.windX * 0.8 + 0.3, w.windZ * 0.8 + 0.1);
    }
  }
  // sky.js hands the haze colour to the mist so it matches the distance.
  w.setMistColor = (c) => mist.uniforms.uColor.value.copy(c);
  return w;
}
