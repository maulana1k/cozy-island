// Small life in the air (visual milestone V2). Like src/world/weather.js: every kind is ONE instanced mesh
// whose motion is worked out in its vertex shader; per frame the CPU writes a few uniforms (and, for the
// few birds and the Low-graphics halos, a handful of numbers). Five draw calls in all.
//
// - Bursts: dust puffs from feet, water spray and drops, campfire sparks. A ring of slots; a new puff
//   writes its start (place, velocity, time) once and the shader flies it ballistically from there.
//   src/effects.js and src/world/props.js hand theirs in through emitPuffs / emitDrops / emitSparks.
// - Motes: pollen drifting in the sun by day, fireflies blinking at night. A box of them wraps round the
//   player; a small "habitat" picture of the ground round the player (height, meadow, damp grass) says
//   where each may show and how high the ground is under it.
// - Butterflies flitting round the camp's flowers by day.
// - Birds: little flocks pecking on the camp lawns that fly off when the player runs at them, and come
//   back a while later. Places the player has cleaned up (src/logic/restore.js) get flocks of their own
//   as their health rises, and more butterflies (FLY_N: about 10 show as before; up to 16 where it is healed).
// - Halos (Graphics: Low only, where there is no bloom): soft additive glows round fires, lamps, the torch
//   and the searchlight.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../logic/rng.js';
import { SEED, POND } from '../config.js';
import { heightAt } from '../logic/terrain.js';
import { surfaceAt } from '../logic/surface.js';
import { getScatter, getColliders, distanceToPath, VILLAGE_CENTER } from '../logic/layout.js';
import { FIGURES } from '../actors/figure.js';
import { WET } from './weather.js';
import { restoreSpots, areaHealth, healthAt } from '../logic/restore.js';

const BURST_N = 768, POLLEN_N = 150, FIREFLY_N = 90, FLY_N = 16, FLOCKS = 3, PER_FLOCK = 5, HALO_N = 48;
const HAB_RES = 48, HAB_SIZE = 64, HAB_PER_FRAME = 160; // the habitat picture: texels, metres across, texels worked out per frame
const HIDE = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0);';

// ---- Bursts -----------------------------------------------------------------------------------------
// Premultiplied blending, so one draw holds both kinds: puffs and drops blend over the picture, sparks
// add light (their alpha is 0, which also leaves the finishing pass's glow-in-alpha alone).
const PREMULT = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };

let pool = null; // the live burst pool, once createParticles has run
const _c = new THREE.Color();

function buildBursts() {
  const geo = new THREE.PlaneGeometry(1, 1);
  // aA: start x, y, z, start time; aB: velocity, life; aC: colour (linear), size; aD: kind (minus the strength for a puff, 1 spark, 2 drop), gravity, drag, growth.
  const A = new Float32Array(BURST_N * 4).fill(0), B = new Float32Array(BURST_N * 4), C = new Float32Array(BURST_N * 4), D = new Float32Array(BURST_N * 4);
  for (let i = 0; i < BURST_N; i++) A[i * 4 + 3] = -1e6;
  const names = ['aA', 'aB', 'aC', 'aD'], arrays = [A, B, C, D];
  names.forEach((n, i) => { const at = new THREE.InstancedBufferAttribute(arrays[i], 4); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, at); });
  const uniforms = { uTime: { value: 0 }, uDark: { value: 1 }, uHot: { value: 1 }, uWindV: { value: new THREE.Vector3() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, ...PREMULT,
    vertexShader: /* glsl */`
      attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec4 aD;
      uniform float uTime, uDark, uHot; uniform vec3 uWindV;
      varying vec2 vUv; varying vec4 vCol; varying float vKind;
      void main() {
        float age = uTime - aA.w, life = aB.w;
        vUv = position.xy * 2.0; vKind = aD.x;
        if (age < 0.0 || age > life) { ${HIDE} vCol = vec4(0.0); return; }
        float k = age / life, drag = aD.z;
        float f = drag > 0.0 ? (1.0 - exp(-drag * age)) / drag : age;
        vec3 p = aA.xyz + aB.xyz * f; p.y -= 0.5 * aD.y * age * age;
        float size = aC.w * (1.0 + aD.w * k), a; vec3 c;
        if (aD.x < 0.5) {        // a puff of dust or spray: swells, drifts on the wind, fades
          p += uWindV * age * 0.5;
          c = aC.rgb * uDark;
          a = smoothstep(0.0, 0.12, k) * pow(1.0 - k, 1.5) * 0.8 * -aD.x; // a puff's kind is minus its strength
        } else if (aD.x > 2.5) { // campfire smoke (kind = 3 + strength): billows up, drifts on the wind, thins out; grey by day, glows faintly from the fire below at night
          p += uWindV * age * 0.9;
          float fade = k < 0.7 ? 1.0 : max(0.0, 1.0 - (k - 0.7) / 0.3);
          c = aC.rgb * uDark + vec3(1.0, 0.5, 0.18) * 0.55 * (1.0 - uDark) * pow(1.0 - k, 3.0);
          a = min(1.0, k * 6.0) * fade * (aD.x - 3.0) * 0.85;
        } else if (aD.x < 1.5) { // a spark: wobbles up, cools from yellow to red, flickers
          float ph = aA.x * 13.1 + aA.z * 7.7 + aA.w * 3.0;
          p.x += sin(age * 5.0 + ph) * 0.14 * age; p.z += cos(age * 4.3 + ph) * 0.14 * age;
          p += uWindV * age * age * 0.35;
          c = mix(vec3(1.0, 0.78, 0.36), vec3(0.95, 0.24, 0.05), smoothstep(0.1, 0.8, k)) * (1.25 + 1.35 * uHot);
          a = (0.65 + 0.35 * sin(age * 31.0 + ph)) * (1.0 - k * k);
        } else {                 // a water drop: falls back
          c = aC.rgb * uDark;
          a = 0.75 * (1.0 - k);
        }
        vec4 mv = viewMatrix * vec4(p, 1.0);
        a *= smoothstep(0.25, 0.9, -mv.z);
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
        vCol = vec4(c, a);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec4 vCol; varying float vKind;
      void main() {
        float r = length(vUv);
        if (r > 1.0) discard;
        vec3 c = vCol.rgb; float a;
        if (vKind < 0.5 || vKind > 2.5) { a = 1.0 - smoothstep(0.3, 1.0, r); c *= 0.9 + 0.18 * vUv.y; } // soft, lighter on top
        else if (vKind < 1.5) a = exp(-r * r * 5.0);
        else a = 1.0 - smoothstep(0.55, 1.0, r);
        a *= vCol.a;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        gl_FragColor = vec4(gl_FragColor.rgb * a, (vKind > 0.5 && vKind < 1.5) ? 0.0 : a);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, BURST_N);
  mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.renderOrder = 6; mesh.name = 'bursts';
  const attrs = names.map((n) => geo.getAttribute(n));
  let next = 0, lo = Infinity, hi = -1, time = 0, cap = BURST_N;
  function put(x, y, z, vx, vy, vz, life, r, g, b, size, kind, grav, drag, grow, delay = 0) {
    const i = next, o = i * 4; next = (next + 1) % cap;
    A[o] = x; A[o + 1] = y; A[o + 2] = z; A[o + 3] = time + delay;
    B[o] = vx; B[o + 1] = vy; B[o + 2] = vz; B[o + 3] = life;
    C[o] = r; C[o + 1] = g; C[o + 2] = b; C[o + 3] = size;
    D[o] = kind; D[o + 1] = grav; D[o + 2] = drag; D[o + 3] = grow;
    lo = Math.min(lo, i); hi = Math.max(hi, i);
  }
  function flush() {
    if (hi < 0) return;
    for (const at of attrs) { at.clearUpdateRanges(); at.addUpdateRange(lo * 4, (hi - lo + 1) * 4); at.needsUpdate = true; }
    lo = Infinity; hi = -1;
  }
  // Graphics Low: a smaller ring (older bursts are reused sooner) and fewer quads drawn.
  function setCap(n) { if (n === cap) return; cap = n; mesh.count = n; next = 0; }
  return { mesh, uniforms, put, flush, setCap, setTime(t) { time = t; uniforms.uTime.value = t; } };
}

// Soft round puffs (dust, sand, spray): the same arguments as effects.puff. False if there is no pool yet.
export function emitPuffs(x, y, z, count = 1, color = 0xead9b0, spread = 0.2, lift = 0.5, alpha = 1) {
  if (!pool) return false;
  _c.setHex(color);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, v = 0.3 + Math.random() * 0.7;
    pool.put(x + (Math.random() - 0.5) * spread, y + 0.08, z + (Math.random() - 0.5) * spread,
      Math.cos(a) * v * spread * 3, lift * (0.5 + Math.random() * 0.6), Math.sin(a) * v * spread * 3,
      0.5 + Math.random() * 0.35, _c.r, _c.g, _c.b, 0.16 + Math.random() * 0.16, -Math.min(1, Math.max(0.02, alpha)), 0.9, 2.5, 1.6);
  }
  return true;
}
// A puff of campfire smoke: drift is the wind's job in the shader; strength 0..1 is its opacity, steam 0..1 greys it.
const SMOKE = new THREE.Color(0xd9d6d0), STEAM = new THREE.Color(0x9aa3a8);
export function emitSmoke(x, y, z, damp = 0) {
  if (!pool) return false;
  _c.copy(SMOKE).lerp(STEAM, damp);
  pool.put(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6,
    0.1 + Math.random() * 0.15, 1.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3,
    4.5 + damp * 1.5, _c.r, _c.g, _c.b, 0.64, 3 + Math.min(0.95, 0.42 + damp * 0.2), -0.12 + damp * 0.05, 0, 3.2 + damp * 2.4);
  return true;
}
// Water drops thrown up from a splash (they fall back under gravity).
export function emitDrops(x, y, z, count = 4, power = 1, color = 0xe6f7fa) {
  if (!pool) return false;
  _c.setHex(color);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random() * 0.9) * power;
    pool.put(x + Math.cos(a) * 0.12, y + 0.05, z + Math.sin(a) * 0.12, Math.cos(a) * v, (1.6 + Math.random() * 1.4) * power, Math.sin(a) * v,
      0.35 + Math.random() * 0.25 * power, _c.r, _c.g, _c.b, 0.035 + Math.random() * 0.03, 2, 9.8, 0.4, -0.3);
  }
  return true;
}
// Sparks from a fire: `count` of them from (x, y, z) inside `spread` m, rising at about `power` x 1.6 m/s.
export function emitSparks(x, y, z, count = 1, power = 1, spread = 0.4) {
  if (!pool) return false;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, h = Math.random() * 0.35 * power;
    pool.put(x + (Math.random() - 0.5) * spread, y + Math.random() * 0.2, z + (Math.random() - 0.5) * spread,
      Math.cos(a) * h, (1.1 + Math.random() * 1.0) * power, Math.sin(a) * h,
      1.1 + Math.random() * 1.2, 1, 1, 1, 0.03 + Math.random() * 0.035, 1, -0.35, 0.55, -0.4);
  }
  return true;
}

// ---- Pollen and fireflies ---------------------------------------------------------------------------
function buildMotes(rng, habTex) {
  const N = POLLEN_N + FIREFLY_N;
  const geo = new THREE.PlaneGeometry(1, 1);
  const s1 = new Float32Array(N * 4), s2 = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { for (let k = 0; k < 4; k++) { s1[i * 4 + k] = rng(); s2[i * 4 + k] = rng(); } s2[i * 4 + 3] = i < POLLEN_N ? 0 : 1; }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s1, 4));
  geo.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(s2, 4));
  const uniforms = {
    uTime: { value: 0 }, uPollen: { value: 0 }, uFire: { value: 0 }, uDark: { value: 1 }, uHot: { value: 1 }, uSun: { value: 1 },
    uCenter: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector2() }, tHab: { value: habTex }, uHab: { value: new THREE.Vector3(0, 0, HAB_SIZE) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, ...ADD,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; attribute vec4 aSeed2;
      uniform float uTime, uPollen, uFire, uDark, uHot, uSun; uniform vec3 uCenter, uHab; uniform vec2 uOff; uniform sampler2D tHab;
      varying vec2 vUv; varying vec3 vCol; varying float vKind;
      const vec2 BOX = vec2(36.0);
      void main() {
        float fly = aSeed2.w, t = uTime, ph = aSeed2.x * 6.2832;
        vUv = position.xy * 2.0; vKind = fly; vCol = vec3(0.0);
        vec2 rel = mod(aSeed.xz * BOX + (fly < 0.5 ? uOff : vec2(0.0)) - uCenter.xz + BOX * 0.5, BOX) - BOX * 0.5;
        vec2 xz = uCenter.xz + rel;
        if (fly > 0.5) xz += vec2(sin(t * 0.37 + ph) * 1.1 + sin(t * 0.9 + ph * 2.0) * 0.3, cos(t * 0.31 + ph * 1.3) * 1.1 + cos(t * 0.83 + ph) * 0.3);
        else xz += vec2(sin(t * 0.5 + ph), cos(t * 0.43 + ph * 1.7)) * 0.35;
        vec4 hab = texture2D(tHab, (xz - uHab.xy) / uHab.z + 0.5);
        float amt = fly < 0.5 ? uPollen * hab.g : uFire * hab.b, show = smoothstep(0.0, 0.08, amt - aSeed.y);
        if (show <= 0.0) { ${HIDE} return; }
        float y = hab.r + (fly < 0.5 ? 0.25 + aSeed2.y * 2.0 + sin(t * 0.6 + ph) * 0.25 : 0.35 + aSeed2.y * 1.5 + sin(t * 0.7 + ph) * 0.3);
        vec4 mv = viewMatrix * vec4(xz.x, y, xz.y, 1.0);
        float dist = -mv.z, edge = 1.0 - smoothstep(0.65, 1.0, length(rel) / (BOX.x * 0.5)), size;
        if (fly < 0.5) {  // a sunlit mote: tiny, glinting now and then
          size = 0.035 * (1.0 + dist * 0.04);
          vCol = vec3(1.0, 0.95, 0.75) * (0.2 + 0.5 * uSun) * uDark * (0.55 + 0.45 * sin(t * 2.0 + ph * 3.0))
            * smoothstep(1.0, 3.0, dist) * (1.0 - smoothstep(13.0, 19.0, dist));
        } else {          // a firefly: a soft glow that swells and dies away, then a long dark pause
          float cyc = fract(t * (0.2 + aSeed2.z * 0.16) + aSeed2.x);
          float b = smoothstep(0.0, 0.07, cyc) * (1.0 - smoothstep(0.1, 0.38, cyc));
          size = 0.3;
          vCol = vec3(0.78, 1.0, 0.32) * (1.0 + 1.4 * uHot) * max(b, 0.03) * smoothstep(0.8, 2.5, dist) * (1.0 - smoothstep(24.0, 32.0, dist));
        }
        vCol *= edge * show;
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vCol; varying float vKind;
      void main() {
        float r2 = dot(vUv, vUv);
        if (r2 > 1.0) discard;
        float a = vKind < 0.5 ? 1.0 - smoothstep(0.1, 1.0, r2) : exp(-r2 * 70.0) + 0.16 * exp(-r2 * 5.0);
        gl_FragColor = vec4(vCol, 1.0);
        #include <colorspace_fragment>
        gl_FragColor.a = a;
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.renderOrder = 6; mesh.name = 'motes'; mesh.visible = false;
  return { mesh, uniforms };
}

// ---- Butterflies ------------------------------------------------------------------------------------
const FLY_COLORS = [0xf4f1e6, 0xf2d45a, 0xe8893a, 0xa9c4ef, 0xf4f1e6, 0xf2d45a];
function buildButterflies(rng) {
  // Two wings hinged on the body line (x = 0); the shader folds each about it.
  const v = [];
  for (const s of [-1, 1]) v.push(0, 0, 0.022, s * 0.05, 0, 0.04, s * 0.042, 0, -0.035, 0, 0, 0.022, s * 0.042, 0, -0.035, 0, 0, -0.03);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  const home = new Float32Array(FLY_N * 4).fill(0), seed = new Float32Array(FLY_N * 4), col = new Float32Array(FLY_N * 3);
  for (let i = 0; i < FLY_N; i++) {
    seed[i * 4] = rng(); seed[i * 4 + 1] = 0.75 + rng() * 0.5; seed[i * 4 + 2] = 0.85 + rng() * 0.4; seed[i * 4 + 3] = (i + 0.5) / FLY_N;
    _c.setHex(FLY_COLORS[i % FLY_COLORS.length]); col.set([_c.r, _c.g, _c.b], i * 3);
    home[i * 4 + 3] = -1e6;
  }
  const homeAttr = new THREE.InstancedBufferAttribute(home, 4); homeAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aHome', homeAttr);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
  const uniforms = { uTime: { value: 0 }, uAmt: { value: 0 }, uDark: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */`
      attribute vec4 aHome; attribute vec4 aSeed; attribute vec3 aCol;
      uniform float uTime, uAmt, uDark; varying vec3 vCol; varying float vTip;
      vec3 path(float t, float ph, float sp) {
        return vec3(sin(t * 0.7 * sp + ph) * 1.2 + sin(t * 1.9 * sp + ph * 2.0) * 0.35,
                    0.45 + 0.3 * sin(t * 1.3 * sp + ph) + 0.12 * sin(t * 0.45 * sp + ph * 3.0),
                    cos(t * 0.55 * sp + ph * 1.4) * 1.2 + cos(t * 1.7 * sp + ph) * 0.35);
      }
      void main() {
        float grow = smoothstep(0.0, 2.0, uTime - aHome.w) * smoothstep(0.0, 0.1, uAmt - aSeed.w);
        if (grow <= 0.0) { ${HIDE} vCol = vec3(0.0); vTip = 0.0; return; }
        float ph = aSeed.x * 6.2832, sp = aSeed.z, t = uTime;
        vec3 c = aHome.xyz + path(t, ph, sp), d = path(t + 0.08, ph, sp) - path(t, ph, sp);
        float flap = sin(t * 21.0 * sp + ph);
        c.y += 0.04 * flap;
        float ang = 0.35 + 0.8 * flap, s = sign(position.x), w = abs(position.x);
        vec3 q = vec3(s * w * cos(ang), w * sin(ang), position.z) * aSeed.y * grow;
        float yaw = atan(d.x, d.z), cy = cos(yaw), sy = sin(yaw);
        q = vec3(q.x * cy + q.z * sy, q.y, -q.x * sy + q.z * cy);
        gl_Position = projectionMatrix * viewMatrix * vec4(c + q, 1.0);
        vCol = aCol * uDark; vTip = w / 0.05;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vTip;
      void main() { gl_FragColor = vec4(vCol * (1.0 - 0.35 * smoothstep(0.6, 1.0, vTip)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, FLY_N);
  mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.name = 'butterflies'; mesh.visible = false;
  return { mesh, uniforms, home, homeAttr };
}

// ---- Birds ------------------------------------------------------------------------------------------
function birdGeometry() {
  const parts = [];
  const tint = (g, hex, wing = 0) => {
    g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count;
    _c.setHex(hex); const c = new Float32Array(n * 3), w = new Float32Array(n);
    for (let i = 0; i < n; i++) { c.set([_c.r, _c.g, _c.b], i * 3); w[i] = wing; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aWing', new THREE.BufferAttribute(w, 1));
    if (g.attributes.uv) g.deleteAttribute('uv'); if (g.attributes.normal) g.deleteAttribute('normal');
    parts.push(g);
  };
  const body = new THREE.OctahedronGeometry(1, 0); body.scale(0.042, 0.04, 0.085); body.translate(0, 0.07, 0); tint(body, 0x7a5a3e);
  const belly = new THREE.OctahedronGeometry(1, 0); belly.scale(0.034, 0.028, 0.06); belly.translate(0, 0.058, 0.01); tint(belly, 0xcdb894);
  const head = new THREE.OctahedronGeometry(0.03, 0); head.translate(0, 0.105, 0.065); tint(head, 0x5e4632);
  const beak = new THREE.ConeGeometry(0.009, 0.03, 4); beak.rotateX(Math.PI / 2); beak.translate(0, 0.1, 0.1); tint(beak, 0x3a3028);
  const tail = new THREE.BufferGeometry(); tail.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.004, 0.075, -0.06, 0.004, 0.075, -0.06, 0, 0.085, -0.15, 0, 0.085, -0.15, -0.035, 0.08, -0.14, -0.004, 0.075, -0.06, 0.004, 0.075, -0.06, 0.035, 0.08, -0.14, 0, 0.085, -0.15]), 3)); tint(tail, 0x4f3a2a);
  for (const s of [-1, 1]) { // a wing: a long triangle from the shoulder, hinged at x = s * 0.02
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([s * 0.02, 0.085, 0.035, s * 0.02, 0.085, -0.045, s * 0.16, 0.085, -0.03]), 3)); tint(g, 0x5b4330, s);
  }
  const geo = mergeGeometries(parts); geo.computeVertexNormals();
  return geo;
}
function buildBirds(n) {
  const geo = birdGeometry();
  const flap = new Float32Array(n * 4); const flapAttr = new THREE.InstancedBufferAttribute(flap, 4); flapAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aFlap', flapAttr);
  const uTime = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBirdTime = uTime;
    shader.vertexShader = 'uniform float uBirdTime;\nattribute float aWing;\nattribute vec4 aFlap;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      if (aWing != 0.0) { // aFlap: x flying (1) or folded (0), y phase, z beat rate
        vec3 hinge = vec3(aWing * 0.02, 0.085, 0.0), q = transformed - hinge;
        float w = q.x * aWing, ang = aFlap.x > 0.5 ? sin(uBirdTime * aFlap.z + aFlap.y) * 1.05 + 0.15 : -0.35, span = aFlap.x > 0.5 ? 1.0 : 0.32;
        transformed = hinge + vec3(aWing * w * span * cos(ang), w * span * sin(ang), q.z);
      }`);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.name = 'birds';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, flap, flapAttr, uTime };
}

// ---- Halos (Graphics: Low) --------------------------------------------------------------------------
function buildHalos() {
  const geo = new THREE.PlaneGeometry(1, 1);
  const P = new Float32Array(HALO_N * 4), C = new Float32Array(HALO_N * 4);
  const pa = new THREE.InstancedBufferAttribute(P, 4), ca = new THREE.InstancedBufferAttribute(C, 4);
  pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aP', pa); geo.setAttribute('aC', ca);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, ...ADD,
    vertexShader: /* glsl */`
      attribute vec4 aP; attribute vec4 aC; varying vec2 vUv; varying vec4 vC;
      void main() {
        vec4 mv = viewMatrix * vec4(aP.xyz, 1.0);
        mv.xyz += normalize(-mv.xyz) * min(aP.w * 0.45, max(0.0, -mv.z - 0.5)); // drawn a little toward the eye, so it is not cut by its own lamp
        mv.xy += position.xy * aP.w;
        gl_Position = projectionMatrix * mv;
        vUv = position.xy * 2.0; vC = aC;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec4 vC;
      void main() { float r = length(vUv); if (r > 1.0) discard;
        float a = pow(1.0 - r, 2.2) * vC.a;
        gl_FragColor = vec4(vC.rgb, 1.0);
        #include <colorspace_fragment>
        gl_FragColor.a = a;
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, HALO_N);
  mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false; mesh.renderOrder = 7; mesh.name = 'halos'; mesh.visible = false; mesh.count = 0;
  return { mesh, P, C, pa, ca };
}

// ---- The whole thing --------------------------------------------------------------------------------
// deps: groundAt, weather (live 0..1 values), props (glows()), player, torch (the SpotLight), graphics() 'high'|'low'.
export function createParticles(scene, deps) {
  const { groundAt, weather: wx, props, player, torch } = deps;
  const rng = createRng(SEED + 211);

  // The habitat picture round the player: r = ground height, g = pollen, b = fireflies (half floats, 64 m).
  const habData = [new Uint16Array(HAB_RES * HAB_RES * 4), new Uint16Array(HAB_RES * HAB_RES * 4)];
  const habTex = habData.map((d) => { const t = new THREE.DataTexture(d, HAB_RES, HAB_RES, THREE.RGBAFormat, THREE.HalfFloatType); t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.NoColorSpace; return t; });
  const POLLEN = { meadow: 1, grass: 0.55, forest: 0.3, mud: 0.3, dirt: 0.2, sand: 0.04 };
  const FIREFLY = { meadow: 1, grass: 0.75, forest: 0.9, mud: 1, dirt: 0.25, sand: 0.1, rock: 0.1, wood: 0.2 };
  const toHalf = THREE.DataUtils.toHalfFloat;
  let habFront = 0, habBuild = -1, habX = 0, habZ = 0, habBX = 0, habBZ = 0;
  function habTexel(d, i, cx, cz) {
    const tx = i % HAB_RES, tz = Math.floor(i / HAB_RES);
    const x = cx + ((tx + 0.5) / HAB_RES - 0.5) * HAB_SIZE, z = cz + ((tz + 0.5) / HAB_RES - 0.5) * HAB_SIZE;
    const s = surfaceAt(x, z), h = groundAt(x, z);
    let fire = FIREFLY[s] || 0, pollen = POLLEN[s] || 0;
    if (s === 'water') { fire = h > -1.2 ? 0.8 : 0; pollen = 0; } // fireflies over the shallows, not out at sea
    d[i * 4] = toHalf(Math.max(h, 0)); d[i * 4 + 1] = toHalf(pollen); d[i * 4 + 2] = toHalf(fire); d[i * 4 + 3] = toHalf(1);
  }
  function habStep(px, pz) {
    if (habBuild < 0) {
      if (Math.hypot(px - habX, pz - habZ) < 6) return;
      habBuild = 0; habBX = px; habBZ = pz;
    }
    const d = habData[1 - habFront];
    for (let n = 0; n < HAB_PER_FRAME && habBuild < HAB_RES * HAB_RES; n++, habBuild++) habTexel(d, habBuild, habBX, habBZ);
    if (habBuild >= HAB_RES * HAB_RES) {
      habFront = 1 - habFront; habBuild = -1; habX = habBX; habZ = habBZ;
      habTex[habFront].needsUpdate = true;
      motes.uniforms.tHab.value = habTex[habFront]; motes.uniforms.uHab.value.set(habX, habZ, HAB_SIZE);
    }
  }

  const bursts = buildBursts(); pool = bursts;
  const motes = buildMotes(rng, habTex[0]);
  const flies = buildButterflies(rng);
  const halos = buildHalos();

  // Bird flocks: open lawn round the camp, clear of tents, trees, paths and each other.
  const cols = getColliders(), spots = [];
  for (let guard = 0; spots.length < FLOCKS && guard < 4000; guard++) {
    const a = rng() * Math.PI * 2, r = 8 + rng() * 30, x = VILLAGE_CENTER.x + Math.cos(a) * r, z = VILLAGE_CENTER.z + Math.sin(a) * r;
    const s = surfaceAt(x, z);
    if ((s !== 'grass' && s !== 'meadow') || distanceToPath(x, z) < 2.5 || Math.abs(groundAt(x, z) - heightAt(x, z)) > 0.05) continue;
    if (cols.some((c) => Math.hypot(c.x - x, c.z - z) < (c.r || Math.hypot(c.hw, c.hd)) + 4)) continue;
    if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 12)) continue;
    spots.push({ x, z });
  }
  // Flocks that only come back once their place has been cleaned up (need: the health it takes).
  for (const r of restoreSpots().flocks) spots.push({ x: r.x, z: r.z, need: r.need, area: r.area });
  const birds = buildBirds(spots.length * PER_FLOCK);
  const flocks = spots.map((p) => ({ ...p, y: groundAt(p.x, p.z), state: 'ground', timer: 0, members: [] }));
  let birdsStarted = false;
  for (const f of flocks) for (let i = 0; i < PER_FLOCK; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 1.1;
    f.members.push({ ox: Math.cos(a) * r, oz: Math.sin(a) * r, yaw: rng() * 6.28, hop: -1, hopT: 0.4 + rng() * 2, peck: 0, fx: 0, fz: 0, tx: 0, tz: 0, phase: rng() * 6.28, delay: 0, p: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), u: 0 });
  }

  scene.add(bursts.mesh, motes.mesh, flies.mesh, birds.mesh, halos.mesh);
  birds.mesh.userData.flocks = flocks; // for tools and debugging
  // ?noparticles switches all of it off (for measuring, or if something looks wrong).
  const off = typeof location !== 'undefined' && new URLSearchParams(location.search).has('noparticles');
  if (off) { pool = null; for (const m of [bursts.mesh, motes.mesh, flies.mesh, birds.mesh, halos.mesh]) m.visible = false; }

  let clock = 0, flyCheck = 0, searchLens, flyNow = 0, fireNow = 0; const lensPos = new THREE.Vector3();
  const pollenOff = new THREE.Vector2();
  const figSteps = new Map(); // FIGURES index -> footfalls last seen
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const flowerHomes = (() => {
    const s = getScatter(), out = [...s.flowers, ...s.bushes.filter((_, i) => i % 3 === 0)];
    for (let i = 0; i < 10; i++) { const a = rng() * Math.PI * 2, r = POND.rw + 2 + rng() * 8; out.push({ x: POND.x + Math.cos(a) * r, z: POND.z + Math.sin(a) * r }); } // the pond meadow
    out.push(...restoreSpots().homes); // flowers in the places being cleaned up (used once they are a third healed)
    return out;
  })();

  // Butterflies: each keeps its flower until it is far from the player, then takes one near the player.
  function placeButterflies(px, pz) {
    let dirty = false;
    for (let i = 0; i < FLY_N; i++) {
      const o = i * 4, hx = flies.home[o], hz = flies.home[o + 2];
      if (flies.home[o + 3] > -1e5 && Math.hypot(hx - px, hz - pz) < 30) continue;
      let pick = null;
      for (let tries = 0; tries < 12 && !pick; tries++) { const f = flowerHomes[Math.floor(Math.random() * flowerHomes.length)]; const d = Math.hypot(f.x - px, f.z - pz); if (d > 6 && d < 26 && !(f.area && areaHealth(f.area) < 0.34)) pick = f; }
      if (!pick) { if (flies.home[o + 3] > -1e5) { flies.home[o + 3] = -1e6; dirty = true; } continue; }
      flies.home[o] = pick.x; flies.home[o + 1] = groundAt(pick.x, pick.z); flies.home[o + 2] = pick.z; flies.home[o + 3] = clock; dirty = true;
    }
    if (dirty) flies.homeAttr.needsUpdate = true;
  }

  // The birds: pecking and hopping, a flight away when startled, the flight back later.
  function updateBirds(dt, night, scare) {
    const pp = player.position, running = player.speed > 3.1 || player.airborne;
    const away = night > 0.55 || wx.rain > 0.45; // roosting for the night, sheltering from the rain
    let k = 0;
    if (!birdsStarted) { birdsStarted = true; for (const f of flocks) if (away || (f.need && areaHealth(f.area) < f.need)) { f.state = 'gone'; f.timer = 5; for (const b of f.members) b.to.set(f.x + 50, f.y + 18, f.z); } }
    for (const f of flocks) {
      const d = Math.hypot(pp.x - f.x, pp.z - f.z);
      const gone = away || (f.need && areaHealth(f.area) < f.need); // a cleaned-up place's flock waits until it is healed enough
      f.timer -= dt;
      if (f.state === 'ground' && (gone || (scare && ((running && d < 7.5) || d < 2.6)))) {
        f.state = 'flee'; f.timer = 7;
        const base = Math.atan2(f.z - pp.z, f.x - pp.x);
        for (const b of f.members) {
          const a = base + (Math.random() - 0.5) * 1.1, dist = 40 + Math.random() * 15;
          b.from.copy(b.p); b.to.set(f.x + Math.cos(a) * dist, f.y + 14 + Math.random() * 6, f.z + Math.sin(a) * dist);
          b.u = -Math.random() * 0.06; b.phase = Math.random() * 6.28;
        }
      } else if (f.state === 'flee' && f.timer <= 0) { f.state = 'gone'; f.timer = 25 + Math.random() * 25; }
      else if (f.state === 'gone' && f.timer <= 0 && !gone && d > (f.need ? 9 : 14)) {
        f.state = 'back'; f.timer = 6.5;
        for (const b of f.members) { b.u = -Math.random() * 0.08; b.from.copy(b.to); b.to.set(f.x + b.ox, f.y, f.z + b.oz); }
      } else if (f.state === 'back' && f.timer <= 0) f.state = 'ground';
      const show = d < 110 && f.state !== 'gone';
      for (const b of f.members) {
        let pitch = 0, flying = 0;
        if (f.state === 'ground') {
          b.peck = Math.max(0, b.peck - dt); b.hopT -= dt;
          if (b.hop >= 0) {
            b.hop += dt / 0.22;
            if (b.hop >= 1) { b.hop = -1; b.ox = b.tx; b.oz = b.tz; }
          } else if (b.hopT <= 0) {
            b.hopT = 0.5 + Math.random() * 2.2;
            if (Math.random() < 0.45) b.peck = 0.35;
            else {
              const a = Math.random() * Math.PI * 2, r = 0.15 + Math.random() * 0.25;
              b.tx = b.ox + Math.cos(a) * r; b.tz = b.oz + Math.sin(a) * r;
              if (Math.hypot(b.tx, b.tz) > 1.4) { b.tx *= 0.6; b.tz *= 0.6; }
              b.fx = b.ox; b.fz = b.oz; b.hop = 0; b.yaw = Math.atan2(b.tx - b.ox, b.tz - b.oz);
            }
          }
          const h = b.hop >= 0 ? b.hop : 0, x = b.hop >= 0 ? b.fx + (b.tx - b.fx) * h : b.ox, z = b.hop >= 0 ? b.fz + (b.tz - b.fz) * h : b.oz;
          b.p.set(f.x + x, f.y + 0.01 + Math.sin(h * Math.PI) * 0.07, f.z + z);
          pitch = b.peck > 0 ? Math.sin((b.peck / 0.35) * Math.PI) * 0.7 : 0;
        } else if (f.state !== 'gone') {
          const out = f.state === 'flee';
          b.u = Math.min(1, b.u + dt / (out ? 5.5 : 6));
          const u = Math.max(0, b.u);
          // Away: a burst straight up and off, speeding up; back: gliding in, dropping and slowing to land.
          const hk = out ? u * u * (0.6 + 0.4 * u) / (0.6 + 0.4) : 1 - (1 - u) * (1 - u), vk = out ? Math.sin(Math.min(1, u * 1.6) * Math.PI / 2) : 1 - Math.pow(1 - u, 1.6);
          _p.set(b.from.x + (b.to.x - b.from.x) * hk, b.from.y + (b.to.y - b.from.y) * vk, b.from.z + (b.to.z - b.from.z) * hk);
          if (u > 0) { const dx = _p.x - b.p.x, dz = _p.z - b.p.z; if (dx * dx + dz * dz > 1e-6) b.yaw = Math.atan2(dx, dz); pitch = -Math.atan2(_p.y - b.p.y, Math.hypot(dx, dz) + 1e-4) * 0.7; }
          b.p.copy(_p); flying = u > 0 && !(f.state === 'back' && u >= 1) ? 1 : 0;
          if (f.state === 'back' && u >= 1) { b.ox = b.to.x - f.x; b.oz = b.to.z - f.z; }
        }
        const sc = show ? 1.25 : 0;
        _e.set(pitch, b.yaw, 0); _q.setFromEuler(_e); _s.setScalar(sc);
        birds.mesh.setMatrixAt(k, _m.compose(b.p, _q, _s));
        birds.flap[k * 4] = flying; birds.flap[k * 4 + 1] = b.phase; birds.flap[k * 4 + 2] = f.state === 'back' && b.u > 0.6 ? 14 : 26; k++;
      }
    }
    birds.mesh.instanceMatrix.needsUpdate = true; birds.flapAttr.needsUpdate = true;
  }

  // Dust from people's feet (not the player's: src/effects.js does those) close to the player.
  const lastPos = new Map();
  function npcFeet(dt) {
    const pp = player.position, dry = Math.max(0, 1 - WET.value / 0.2);
    for (let i = 0; i < FIGURES.length; i++) {
      const f = FIGURES[i], g = f.group;
      if (f.steps === undefined || !g.parent || !g.visible) continue;
      const x = g.position.x, z = g.position.z, d2 = (x - pp.x) ** 2 + (z - pp.z) ** 2;
      const was = figSteps.get(i), steps = f.steps; figSteps.set(i, steps);
      const lp = lastPos.get(i); let speed = 0;
      if (lp) { speed = Math.hypot(x - lp.x, z - lp.z) / Math.max(dt, 1e-3); lp.x = x; lp.z = z; } else lastPos.set(i, { x, z });
      if (was === undefined || steps === was || d2 > 22 * 22 || d2 < 0.04) continue;
      const s = surfaceAt(x, z), run = speed > 2.6;
      if ((s === 'dirt' || s === 'sand') && dry > 0.05) emitPuffs(x, g.position.y, z, run ? 2 : 1, s === 'sand' ? 0xf7ecc8 : 0xe9d3a0, 0.16, run ? 0.35 : 0.25, 0.8 * dry);
      else if (s === 'water') { emitPuffs(x, 0, z, 1, 0xe6f7fa, 0.18, 0.7, 0.8); emitDrops(x, 0, z, run ? 4 : 2, 0.7); }
    }
  }

  // Low graphics: halos round what would bloom on High.
  function updateHalos(night) {
    const low = deps.graphics() === 'low';
    halos.mesh.visible = low;
    if (!low) return;
    const { P, C } = halos; let n = 0;
    const add = (x, y, z, size, r, g, b, i) => { if (i < 0.02 || n >= HALO_N) return; P.set([x, y, z, size], n * 4); C.set([r, g, b, i], n * 4); n++; };
    const pp = player.position, near = (x, z, r) => (x - pp.x) ** 2 + (z - pp.z) ** 2 < r * r;
    const glows = props && props.glows ? props.glows() : null;
    const dusk = Math.min(1, Math.max(0, (night - 0.15) / 0.45));
    if (glows) {
      for (const f of glows.fires) if (near(f.x, f.z, 120)) { const l = f.fire.level * (1 - 0.45 * f.fire.damp) * (1 + 0.25 * (f.fire.boost || 0)); add(f.x, f.y + (f.big ? 1.3 : 0.55), f.z, f.big ? 4.2 : 1.9, 1.0, 0.5, 0.16, l * (0.35 + 0.4 * dusk)); }
      for (const list of [glows.lanterns, glows.outside]) for (const l of list) if (l.glow > 0.03 && near(l.pos.x, l.pos.z, 90)) add(l.pos.x, l.pos.y, l.pos.z, 1.3, 1.0, 0.78, 0.45, l.glow * (l.flicker || 1) * 0.5 * Math.max(dusk, 0.25 * (glows.gloom || 0)));
    }
    if (torch && torch.intensity > 0.3) add(torch.position.x, torch.position.y, torch.position.z, 0.55, 1.0, 0.95, 0.78, Math.min(0.7, torch.intensity / 10) * (0.3 + 0.7 * dusk));
    if (searchLens === undefined) searchLens = scene.getObjectByName('searchlightLens') || null;
    if (searchLens && searchLens.material.blendAlpha > 0 && searchLens.parent && searchLens.parent.visible) { searchLens.getWorldPosition(lensPos); add(lensPos.x, lensPos.y, lensPos.z, 1.8, 1.0, 0.96, 0.82, 0.55); }
    halos.mesh.count = n;
    if (n) { halos.pa.needsUpdate = true; halos.ca.needsUpdate = true; }
  }

  // Lower the first habitat picture right away, so motes stand on the ground from the first frame.
  { const px = player.position.x, pz = player.position.z; habBX = habX = px; habBZ = habZ = pz; for (let i = 0; i < HAB_RES * HAB_RES; i++) habTexel(habData[0], i, px, pz); habTex[0].needsUpdate = true; motes.uniforms.uHab.value.set(px, pz, HAB_SIZE); }

  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const flyPath = (t, ph, sp) => [Math.sin(t * 0.7 * sp + ph) * 1.2 + Math.sin(t * 1.9 * sp + ph * 2) * 0.35, 0.45 + 0.3 * Math.sin(t * 1.3 * sp + ph) + 0.12 * Math.sin(t * 0.45 * sp + ph * 3), Math.cos(t * 0.55 * sp + ph * 1.4) * 1.2 + Math.cos(t * 1.7 * sp + ph) * 0.35];
  const seedOf = flies.mesh.geometry.attributes.aSeed.array;
  return {
    // Where the butterflies are now (the same sums as their shader), for the camera (src/photo.js): [{ x, y, z }].
    butterflies() {
      const out = [];
      if (!flyNow || off) return out;
      for (let i = 0; i < FLY_N; i++) {
        const o = i * 4;
        if (smoothstep(0, 2, clock - flies.home[o + 3]) * smoothstep(0, 0.1, flyNow - seedOf[o + 3]) <= 0.3) continue;
        const [x, y, z] = flyPath(clock, seedOf[o] * 6.2832, seedOf[o + 2]);
        out.push({ x: flies.home[o] + x, y: flies.home[o + 1] + y, z: flies.home[o + 2] + z });
      }
      return out;
    },
    // How many fireflies are out round the player (0..1).
    get fireflies() { return off ? 0 : fireNow; },
    // Graphics Low (main.js setGraphics): half the burst pool (dust, spray, sparks, smoke).
    setQuality(low) { bursts.setCap(low ? BURST_N / 2 : BURST_N); },
    // dt game seconds (0 while paused); night 0..1.
    update(dt, night = 0) {
      if (off) return;
      clock += dt;
      const t = clock % 3600, high = deps.graphics() !== 'low';
      const dark = 1 - night * 0.65, day = 1 - Math.min(1, Math.max(0, (night - 0.15) / 0.5));
      const pp = player.position;
      bursts.setTime(clock); bursts.uniforms.uDark.value = dark; bursts.uniforms.uHot.value = high ? 1 : 0;
      bursts.uniforms.uWindV.value.set(wx.windX * wx.wind * 1.4, 0, wx.windZ * wx.wind * 1.4);
      bursts.flush();
      if (dt > 0) npcFeet(dt);

      habStep(pp.x, pp.z);
      // Pollen: a calm sunny day over the meadow; fewer in wind, none in rain. Fireflies: warm dry nights.
      const calm = 1 - 0.65 * wx.wind;
      const pollen = day * calm * (1 - Math.min(1, wx.rain * 2.5)) * (1 - 0.5 * wx.fog) * 0.85;
      const fire = Math.min(1, Math.max(0, (night - 0.55) / 0.3)) * (1 - Math.min(1, wx.rain * 4)) * (1 - 0.6 * wx.wind) * (1 - 0.5 * wx.cold) * Math.max(0, 1 - WET.value * 1.5);
      fireNow = fire;
      motes.mesh.visible = pollen > 0.01 || fire > 0.01;
      if (motes.mesh.visible) {
        const u = motes.uniforms, v = (0.12 + wx.wind * 1.2) * dt;
        pollenOff.x = (pollenOff.x + wx.windX * v) % 36; pollenOff.y = (pollenOff.y + wx.windZ * v) % 36;
        u.uTime.value = t; u.uPollen.value = pollen; u.uFire.value = fire; u.uDark.value = dark; u.uHot.value = high ? 1 : 0;
        u.uSun.value = (1 - 0.7 * wx.cloud) * day; u.uCenter.value.set(pp.x, pp.y, pp.z); u.uOff.value.copy(pollenOff);
      }
      // About ten of the sixteen as before; the rest join where the island has been cleaned up.
      const flyAmt = day * (1 - Math.min(1, wx.rain * 3)) * (1 - 0.75 * wx.wind) * (1 - 0.6 * wx.fog) * (0.62 + 0.38 * healthAt(pp.x, pp.z));
      flies.mesh.visible = flyAmt > 0.01; flyNow = flies.mesh.visible ? flyAmt : 0;
      if (flies.mesh.visible) {
        flyCheck -= dt; if (flyCheck <= 0) { flyCheck = 1.5; placeButterflies(pp.x, pp.z); }
        flies.uniforms.uTime.value = clock; flies.uniforms.uAmt.value = flyAmt; flies.uniforms.uDark.value = dark;
      }
      birds.uTime.value = t;
      if (flocks.length) updateBirds(dt, night, dt > 0);
      updateHalos(night);
    },
  };
}
