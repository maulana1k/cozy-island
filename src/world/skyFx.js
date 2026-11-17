// The sky's big moving parts, called from src/world/sky.js: stylised cumulus, high cirrus, a few towering
// clouds on the horizon, and the night's starfield with a faint Milky Way and the odd shooting star.
//
// Draw calls: cumulus and towers are ONE merged mesh, cirrus ONE, stars plus the shooting star ONE Points,
// the Milky Way ONE strip; the two night ones are hidden by day. Everything moves in the vertex shader:
// per frame the CPU writes a handful of uniforms and allocates nothing.
//
// Clouds: low-poly icosahedron puffs (flat facets) grouped into fair-weather cumulus. Shading is painted,
// not physical: a sunlit top, a cool blue-grey belly, a warm rim when you look toward the sun, and a baked
// per-vertex "crowding" term so puffs tucked under and between others read darker (self-shadow). Clouds
// live in a big box that wraps round the player and slides with the wind; how many are out follows the
// weather's `cloud` (each cloud has a rank and grows in or shrinks away as the amount passes it).
import * as THREE from 'three';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';

const BOX = 1500; // the cumulus field wraps in a BOX x BOX square round the player (metres)
const CIRRUS_BOX = 2000;
const STAR_R = 800, MILKY_R = 790;
const STAR_N = 4200, SHOT_N = 28;

// ---- Shared GLSL ------------------------------------------------------------------------------------
export const NOISE_GLSL = /* glsl */`
float skyHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float skyNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float skyFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * skyNoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; } return s; }`;

// Where a cloud sits: wrapped round the player, and how far it is from the box edge (1 inside .. 0 at the edge).
const WRAP_GLSL = /* glsl */`
vec3 wrapAt(vec2 frac, float y, vec2 off, vec3 center, float box, out float edge) {
  vec2 rel = mod(frac * box + off - center.xz + box * 0.5, box) - box * 0.5;
  edge = 1.0 - smoothstep(0.7, 1.0, length(rel) / (box * 0.5));
  return vec3(center.x + rel.x, y, center.z + rel.y);
}`;

// ---- Cloud shapes (CPU, once) -----------------------------------------------------------------------
const hash3 = (x, y, z, s) => { const v = Math.sin(Math.round(x * 1e4) * 0.0129898 + Math.round(y * 1e4) * 0.078233 + Math.round(z * 1e4) * 0.037719 + s * 1.618) * 43758.5453; return v - Math.floor(v); };

// A fair-weather cumulus about W metres across: a row of base puffs cut flat underneath, a crown on top.
function cumulusPuffs(rng, W) {
  const p = [], n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const k = i - (n - 1) / 2, mid = 1 - Math.abs(k) / (n / 2 + 0.5);
    const r = (W / n) * (0.62 + 0.3 * rng()) * (0.7 + 0.45 * mid);
    p.push({ x: k * (W / n) * (0.85 + 0.2 * rng()), y: r * (0.25 + 0.15 * rng()), z: (rng() - 0.5) * W * 0.2, r });
  }
  const crown = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < crown; i++) {
    const r = W * (0.16 + 0.1 * rng());
    p.push({ x: (rng() - 0.5) * W * 0.45, y: W * (0.2 + 0.1 * rng()) + r * 0.3, z: (rng() - 0.5) * W * 0.15, r });
  }
  if (rng() < 0.5) { const r = W * (0.11 + 0.06 * rng()); p.push({ x: (rng() - 0.5) * W * 0.25, y: W * 0.36 + r * 0.2, z: 0, r }); }
  return p;
}

// A towering cumulus for the horizon: a wide base, a column of shrinking puffs, a flattened spreading top.
function towerPuffs(rng, W) {
  const p = [];
  for (let i = 0; i < 5; i++) { const k = i - 2, r = W * (0.17 + 0.06 * rng()) * (1 - Math.abs(k) * 0.12); p.push({ x: k * W * 0.17, y: r * 0.3, z: (rng() - 0.5) * W * 0.15, r }); }
  let y = W * 0.18, r = W * 0.2, x = 0;
  const levels = 5 + Math.floor(rng() * 3);
  for (let l = 0; l < levels; l++) {
    x += (rng() - 0.5) * W * 0.08;
    const m = 1 + Math.floor(rng() * 2.4);
    for (let j = 0; j < m; j++) p.push({ x: x + (j - (m - 1) / 2) * r * 0.9, y: y + rng() * r * 0.3, z: (rng() - 0.5) * r * 0.5, r: r * (0.85 + 0.25 * rng()) });
    y += r * 0.85; r *= 0.9;
  }
  for (let j = 0; j < 3; j++) p.push({ x: x + (j - 1) * W * 0.2, y: y - r * 0.2, z: (rng() - 0.5) * r * 0.4, r: r * 1.05, flat: 0.55 });
  return p;
}

function buildCumulus() {
  const rng = createRng(SEED + 501);
  const unit = new THREE.IcosahedronGeometry(1, 1).getAttribute('position'); // non-indexed: flat facets
  const pos = [], nor = [], puff = [], cloud = [], info = [], shade = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const addCloud = (puffs, place, mode, rank, seed) => {
    let top = 1; for (const q of puffs) top = Math.max(top, q.y + q.r * (q.flat || 1));
    puffs.forEach((q, pi) => {
      const ps = seed * 7.13 + pi * 1.71;
      const v = [];
      for (let i = 0; i < unit.count; i++) {
        const ux = unit.getX(i), uy = unit.getY(i), uz = unit.getZ(i);
        const jr = q.r * (0.86 + 0.26 * hash3(ux, uy, uz, ps)); // knobbly facets; same jitter for shared corners
        v.push([q.x + ux * jr, Math.max(0, q.y + uy * jr * (q.flat || 1)), q.z + uz * jr]);
      }
      for (let f = 0; f < unit.count; f += 3) {
        a.fromArray(v[f]); b.fromArray(v[f + 1]); c.fromArray(v[f + 2]);
        e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
        if (e1.lengthSq() < 1e-8) e1.set(0, -1, 0); else e1.normalize();
        const jit = hash3(a.x * 0.37, a.y * 0.41, a.z * 0.29, ps + f);
        for (let k = 0; k < 3; k++) {
          const p = v[f + k];
          // Self-shadow: lower down and deeper among the other puffs reads darker.
          let crowd = 0;
          for (let j = 0; j < puffs.length; j++) {
            if (j === pi) continue;
            const o = puffs[j], d = Math.hypot(p[0] - o.x, p[1] - o.y, p[2] - o.z);
            crowd += Math.max(0, Math.min(1, (o.r * 1.45 - d) / (o.r * 0.85))) * (o.y > p[1] ? 1 : 0.45);
          }
          const h = Math.min(1, p[1] / top);
          const occ = Math.max(0.2, (0.5 + 0.5 * Math.pow(h, 0.7)) * (1 - 0.22 * Math.min(2, crowd)));
          pos.push(p[0], p[1], p[2]); nor.push(e1.x, e1.y, e1.z);
          puff.push(q.x, q.y, q.z, ps % 1);
          cloud.push(place[0], place[1], place[2], rank);
          info.push(h, mode, seed, 0); shade.push(occ, jit);
        }
      }
    });
  };
  // The cumulus field: ranks shuffled so any amount spreads its clouds round the whole sky.
  const N = 30, ranks = Array.from({ length: N }, (_, i) => (i + 0.5) / N);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ranks[i], ranks[j]] = [ranks[j], ranks[i]]; }
  for (let i = 0; i < N; i++) {
    const W = 70 + rng() * rng() * 120;
    addCloud(cumulusPuffs(rng, W), [rng(), 125 + W * 0.35 + rng() * 40, rng()], 0, ranks[i] * 0.92, rng());
  }
  // Towering clouds standing on the horizon (angle, base height, distance); one or two out on most days.
  const towers = [[0.4, 0.12], [2.5, 0.45], [4.4, 0.78]];
  for (const [ang, rank] of towers) addCloud(towerPuffs(rng, 170 + rng() * 70), [ang + rng() * 0.5, 34 + rng() * 14, 700 + rng() * 50], 1, rank, rng());

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aPuff', new THREE.Float32BufferAttribute(puff, 4));
  geo.setAttribute('aCloud', new THREE.Float32BufferAttribute(cloud, 4));
  geo.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  geo.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 2));
  const uniforms = {
    uCenter: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector2() }, uTime: { value: 0 },
    uAmount: { value: 0.3 }, uTowers: { value: 0.3 }, uWiden: { value: 1 }, uFlat: { value: 1 },
    uLit: { value: new THREE.Color() }, uBelly: { value: new THREE.Color() }, uRim: { value: new THREE.Color() },
    uHaze: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() }, uFogMix: { value: 0 }, uLightDir: { value: new THREE.Vector3(0, 1, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: false, depthWrite: true,
    vertexShader: /* glsl */`
      attribute vec4 aPuff, aCloud, aInfo; attribute vec2 aShade;
      uniform vec3 uCenter; uniform vec2 uOff; uniform float uTime, uAmount, uTowers, uWiden, uFlat;
      varying vec3 vN, vWorld; varying vec2 vShade; varying float vH;
      ${WRAP_GLSL}
      void main() {
        float seed = aInfo.z, vis, edge = 1.0; vec3 base;
        if (aInfo.y < 0.5) {
          base = wrapAt(aCloud.xz, aCloud.y, uOff, uCenter, ${BOX.toFixed(1)}, edge);
          vis = smoothstep(aCloud.w, aCloud.w + 0.1, uAmount) * edge;
        } else {
          float an = aCloud.x + uTime * 0.0011;
          base = vec3(uCenter.x + cos(an) * aCloud.z, aCloud.y, uCenter.z + sin(an) * aCloud.z);
          vis = smoothstep(aCloud.w, aCloud.w + 0.15, uTowers);
        }
        // Slow life: each puff swells and settles on its own beat and wanders a little round the cloud.
        float breathe = 1.0 + 0.11 * sin(uTime * 0.05 + seed * 31.0 + aPuff.w * 6.283);
        float cs = vis * (0.93 + 0.07 * sin(uTime * 0.031 + seed * 17.0));
        vec3 pc = aPuff.xyz + vec3(sin(uTime * 0.021 + aPuff.w * 9.0), 0.0, cos(uTime * 0.017 + aPuff.w * 5.0)) * length(aPuff.xz) * 0.06;
        pc *= vec3(uWiden, uFlat, uWiden);
        vec3 local = pc + (position - aPuff.xyz) * breathe * vec3(mix(1.0, uWiden, 0.6), uFlat, mix(1.0, uWiden, 0.6));
        vec3 world = base + local * cs;
        vN = normal; vShade = aShade; vH = aInfo.x; vWorld = world;
        gl_Position = cs < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLit, uBelly, uRim, uHaze, uFogCol, uLightDir; uniform float uFogMix;
      varying vec3 vN, vWorld; varying vec2 vShade; varying float vH;
      void main() {
        vec3 n = normalize(vN), V = normalize(vWorld - cameraPosition);
        float ndl = dot(n, uLightDir);
        // Two soft paint bands rather than a smooth gradient: lit and shaded facets read as shapes.
        float l = smoothstep(-0.5, 0.9, ndl);
        l = mix(l, smoothstep(0.3, 0.55, l) * 0.75 + l * 0.25, 0.55);
        float lit = l * mix(0.4, 1.0, vShade.x) * mix(0.75, 1.0, vH);
        vec3 col = mix(uBelly, uLit, clamp(lit, 0.0, 1.0));
        col *= 0.95 + 0.1 * vShade.y;                                          // a little paint variation per facet
        col = mix(col, uBelly * 0.9, smoothstep(-0.35, -0.95, n.y) * 0.55);    // flat cool underside
        float rim = pow(1.0 - abs(dot(n, V)), 2.4);
        float fwd = pow(max(dot(V, uLightDir), 0.0), 5.0);                     // looking toward the sun
        col += uRim * rim * (0.16 + 1.15 * fwd) * mix(0.5, 1.0, vShade.x);
        col = mix(col, uHaze, (1.0 - smoothstep(0.0, 0.3, V.y)) * 0.62);       // low clouds melt into the haze
        col = mix(col, uFogCol, uFogMix);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'cumulus'; mesh.renderOrder = -8; mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// High wispy cirrus: long soft streaks far up, combed along the wind. One transparent mesh.
function buildCirrus() {
  const rng = createRng(SEED + 503);
  const pos = [], uv = [], cloud = [], info = [], idx = [];
  const N = 16, SEG = 10;
  for (let s = 0; s < N; s++) {
    const L = 280 + rng() * 240, Wd = 70 + rng() * 70, bow = (rng() - 0.5) * 0.5, first = pos.length / 3;
    const place = [rng(), 380 + rng() * 90, rng(), (s + 0.5) / N];
    for (let i = 0; i <= SEG; i++) {
      const f = i / SEG, x = (f - 0.5) * L, zc = Math.sin(f * Math.PI) * bow * L * 0.25;
      for (let k = 0; k < 2; k++) {
        pos.push(x, 0, zc + (k - 0.5) * Wd * (0.6 + 0.4 * Math.sin(f * Math.PI)));
        uv.push(f, k * 2 - 1); cloud.push(...place); info.push((rng() - 0.5) * 0.5, rng(), 0, 0);
      }
      if (i) { const o = first + (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aCloud', new THREE.Float32BufferAttribute(cloud, 4));
  geo.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  geo.setIndex(idx);
  const uniforms = { uCenter: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector2() }, uAng: { value: 0 }, uAmount: { value: 0.5 }, uColor: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: false, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aCloud, aInfo; uniform vec3 uCenter; uniform vec2 uOff; uniform float uAng, uAmount;
      varying vec2 vUv; varying float vA, vSeed; varying vec3 vWorld;
      ${WRAP_GLSL}
      void main() {
        float edge; vec3 base = wrapAt(aCloud.xz, aCloud.y, uOff, uCenter, ${CIRRUS_BOX.toFixed(1)}, edge);
        float a = uAng + aInfo.x, c = cos(a), s = sin(a);
        vec3 world = base + vec3(position.x * c - position.z * s, 0.0, position.x * s + position.z * c);
        vUv = uv; vSeed = aInfo.y; vWorld = world;
        vA = edge * smoothstep(aCloud.w, aCloud.w + 0.12, uAmount);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uHaze; varying vec2 vUv; varying float vA, vSeed; varying vec3 vWorld;
      void main() {
        float across = abs(vUv.y), along = vUv.x;
        float body = (1.0 - smoothstep(0.0, 1.0, across)) * pow(sin(3.14159 * along), 1.2);
        // soft combed wisps: a gentle variation across and along, no hard lines
        float fib = 0.6 + 0.4 * sin(vUv.y * 4.0 + sin(along * 3.0 + vSeed * 20.0) * 0.8 + vSeed * 30.0);
        float a = body * body * fib * vA * 0.32;
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 col = mix(uColor, uHaze, (1.0 - smoothstep(0.05, 0.4, V.y)) * 0.6);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'cirrus'; mesh.renderOrder = -8.9; mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ---- Stars ------------------------------------------------------------------------------------------
// The Milky Way's plane: a great circle that rises to about 70 degrees, its seam hidden below the horizon.
const BAND_N = new THREE.Vector3(0.78, 0.34, -0.52).normalize();
function bandAxes() {
  const A = new THREE.Vector3(0, -1, 0).addScaledVector(BAND_N, BAND_N.y).normalize(); // lowest point of the circle
  const B = new THREE.Vector3().crossVectors(BAND_N, A).normalize();
  return { A, B };
}

function buildStars() {
  const rng = createRng(SEED + 509);
  const { A, B } = bandAxes();
  const pos = new Float32Array((STAR_N + SHOT_N) * 3), star = new Float32Array((STAR_N + SHOT_N) * 4), kind = new Float32Array(STAR_N + SHOT_N);
  const d = new THREE.Vector3();
  for (let i = 0; i < STAR_N; i++) {
    if (i < STAR_N * 0.35) {
      // crowd a third of them along the Milky Way, thickest at its middle line
      const th = rng() * Math.PI * 2, off = (rng() + rng() + rng() - 1.5) * 0.22;
      d.copy(A).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th)).addScaledVector(BAND_N, off).normalize();
    } else {
      const y = rng() * 1.08 - 0.08, th = rng() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      d.set(Math.cos(th) * r, y, Math.sin(th) * r);
    }
    d.toArray(pos, i * 3);
    const m = Math.pow(rng(), 3.2); // a few bright, very many faint
    star[i * 4] = 1.3 + m * 2.9; star[i * 4 + 1] = 0.25 + m * 0.95; star[i * 4 + 2] = rng(); star[i * 4 + 3] = rng();
  }
  for (let i = 0; i < SHOT_N; i++) { const j = STAR_N + i; pos[j * 3 + 1] = 1; kind[j] = (i + 1) / SHOT_N; star[j * 4] = 1; star[j * 4 + 1] = 1; star[j * 4 + 2] = 0.3; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aStar', new THREE.BufferAttribute(star, 4));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const uniforms = {
    uTime: { value: 0 }, uVis: { value: 0 }, uPx: { value: 1 }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) }, uMoon: { value: 0 },
    uShot: { value: new THREE.Vector2() }, uShotA: { value: new THREE.Vector3(0, 1, 0) }, uShotB: { value: new THREE.Vector3(0, 1, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aStar; attribute float aKind;
      uniform float uTime, uVis, uPx, uMoon; uniform vec3 uMoonDir, uShotA, uShotB; uniform vec2 uShot;
      varying vec3 vCol; varying float vA;
      void main() {
        vec3 dir = normalize(position); float bright = aStar.y, size = aStar.x, tw = 1.0;
        if (aKind > 0.0) {
          // the shooting star: a short trail of points behind its head, brightest at the head
          float u = uShot.x - (1.0 - aKind) * 0.2;
          dir = normalize(mix(uShotA, uShotB, clamp(u, 0.0, 1.0)));
          bright = uShot.y * aKind * aKind * step(0.0, u) * 1.6; size = 1.4 + 2.6 * aKind;
          vCol = vec3(1.0, 0.97, 0.88);
        } else {
          float ph = aStar.w;
          float amp = mix(0.55, 0.2, smoothstep(0.0, 0.5, dir.y)); // twinkles more low down, through more air
          tw = 1.0 - amp * (0.5 + 0.5 * sin(uTime * (2.1 + ph * 4.0) + ph * 60.0) * sin(uTime * (1.1 + ph * 1.7) + ph * 13.0));
          float k = aStar.z;
          vCol = k < 0.72 ? mix(vec3(1.0, 0.98, 0.94), vec3(0.86, 0.92, 1.0), k / 0.72)
               : k < 0.86 ? vec3(0.72, 0.82, 1.0)
               : k < 0.96 ? vec3(1.0, 0.88, 0.68) : vec3(1.0, 0.66, 0.5);
        }
        float haze = smoothstep(-0.01, 0.3, dir.y);
        float moon = 1.0 - 0.88 * uMoon * smoothstep(0.8, 0.996, dot(dir, uMoonDir));
        vA = bright * tw * haze * moon * uVis;
        gl_Position = vA < 0.004 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(dir * ${STAR_R.toFixed(1)}, 1.0);
        gl_PointSize = size * uPx * (0.85 + 0.25 * tw);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 4.0) + 0.35 * exp(-d * d * 18.0);
        gl_FragColor = vec4(vCol * 1.25, min(1.0, a * vA));
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'stars'; points.renderOrder = -9.5; points.frustumCulled = false; points.visible = false;
  return { points, uniforms };
}

// The Milky Way: a soft, patchy strip along the band with a darker dust lane. Faint, additive.
function buildMilkyWay() {
  const { A, B } = bandAxes();
  const SEG = 120, ROWS = 6, pos = [], uv = [], idx = [];
  const d = new THREE.Vector3();
  for (let i = 0; i <= SEG; i++) {
    const th = (i / SEG) * Math.PI * 2;
    for (let r = 0; r <= ROWS; r++) {
      const v = (r / ROWS) * 2 - 1;
      d.copy(A).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th)).addScaledVector(BAND_N, v * 0.32).normalize().multiplyScalar(MILKY_R);
      pos.push(d.x, d.y, d.z); uv.push(i / SEG, v);
      if (i && r) { const o = i * (ROWS + 1) + r, p = o - (ROWS + 1); idx.push(p - 1, p, o - 1, o - 1, p, o); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const uniforms = { uVis: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vY;
      void main() { vUv = uv; vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uVis; varying vec2 vUv; varying float vY;
      void main() {
        vec2 p = vec2(vUv.x * 46.0, vUv.y * 3.2);
        float n = skyFbm(p), n2 = skyFbm(p * 2.3 + 7.0);
        float body = exp(-vUv.y * vUv.y * 3.2) * (0.35 + 0.9 * n);
        float lane = exp(-pow((vUv.y - 0.1 + (n2 - 0.5) * 0.3) * 5.5, 2.0)) * smoothstep(0.35, 0.7, n2);
        body *= 1.0 - 0.75 * lane;
        vec3 col = mix(vec3(0.55, 0.62, 0.9), vec3(0.95, 0.88, 0.82), n2);
        float a = body * uVis * 0.17 * smoothstep(0.0, 0.35, vY);
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'milkyWay'; mesh.renderOrder = -9.6; mesh.frustumCulled = false; mesh.visible = false;
  return { mesh, uniforms };
}

// ---- The whole thing --------------------------------------------------------------------------------
export function createSkyFx(scene, renderer) {
  const cum = buildCumulus(), cir = buildCirrus(), stars = buildStars(), milky = buildMilkyWay();
  scene.add(cum.mesh, cir.mesh, stars.points, milky.mesh);
  const tmp = new THREE.Color(), tmp2 = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
  const off = new THREE.Vector2(), cirOff = new THREE.Vector2();
  let shot = null, shotIn = 6, clock = 0;
  const az = (a, e) => new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));

  return {
    cumulus: cum.mesh, cirrus: cir.mesh, stars: stars.points, milkyWay: milky.mesh,
    // o: { dt, elapsed, focus, sun (unit dir), night, c (skyColors hex), top, horizon, fog (THREE.Color, after weather), wx }
    update(o) {
      const { dt, sun, night, c, wx } = o;
      clock += dt;
      const fx = o.focus ? o.focus.x : 0, fz = o.focus ? o.focus.z : 0;
      const wind = wx ? wx.wind : 0.12, cloud = wx ? wx.cloud : 0.1, rain = wx ? wx.rain : 0, fog = wx ? wx.fog : 0;
      const wX = wx ? wx.windX : 1, wZ = wx ? wx.windZ : 0;

      // Drift with the wind: slow on a calm day, brisk in a gale (wrapped so the numbers stay small).
      const v = (2.5 + wind * 13) * dt;
      off.x = (off.x + wX * v) % BOX; off.y = (off.y + wZ * v) % BOX;
      cirOff.x = (cirOff.x + wX * v * 0.6) % CIRRUS_BOX; cirOff.y = (cirOff.y + wZ * v * 0.6) % CIRRUS_BOX;

      // How many: sunny = a few fair-weather clouds, windy = more, rain = all of them, wide, flat and grey.
      const U = cum.uniforms;
      U.uCenter.value.set(fx, 0, fz); U.uOff.value.copy(off); U.uTime.value = clock % 20000;
      U.uAmount.value = Math.min(1, 0.2 + cloud * 0.95 + wind * 0.15);
      U.uTowers.value = Math.max(0, 0.3 + wind * 0.25 + cloud * 0.4 - fog * 1.2 - rain * 0.9);
      U.uWiden.value = 1 + rain * 0.7 + fog * 0.3;
      U.uFlat.value = 1 - rain * 0.35;

      // The light of the hour. gold: 1 near sunrise/sunset, 0 in the high sun.
      const sunUp = sun.y > -0.02;
      const gold = sunUp ? 1 - THREE.MathUtils.smoothstep(sun.y, 0.06, 0.42) : 1;
      const lit = U.uLit.value.copy(WHITE).lerp(tmp.setHex(c.sun), 0.25 + gold * 0.55).lerp(tmp.setHex(c.horizon), gold * 0.25);
      lit.lerp(WHITE, (1 - gold) * 0.55); // bright white at midday
      const belly = U.uBelly.value.setHex(c.top).lerp(tmp.setHex(c.horizon), 0.38).lerp(tmp2.setRGB(0.3, 0.37, 0.52), 0.5 - gold * 0.25);
      belly.multiplyScalar(0.92 - gold * 0.08);
      const rim = U.uRim.value.setHex(c.sun).lerp(tmp.setRGB(1, 0.84, 0.6), 0.4).multiplyScalar(0.55 + gold * 0.6);
      // Night: dark shapes, moonlit tops a touch bluer, belly nearly the night sky.
      lit.lerp(tmp.setRGB(0.045, 0.055, 0.1), night); belly.lerp(tmp.setRGB(0.012, 0.015, 0.032), night); rim.lerp(tmp.setRGB(0.03, 0.04, 0.085), night);
      // Weather: grey and heavy in rain, pale and washed out in fog.
      const grey = Math.min(1, rain * 1.0 + fog * 0.6 + Math.max(0, cloud - 0.5) * 0.5);
      const dim = 1 - night * 0.55;
      lit.lerp(tmp.setRGB(0.52, 0.55, 0.6).multiplyScalar(dim * dim), grey * 0.75);
      belly.lerp(tmp.setRGB(0.22, 0.24, 0.29).multiplyScalar(dim * dim), grey * 0.8);
      rim.multiplyScalar(1 - grey * 0.8);
      U.uHaze.value.copy(o.horizon); U.uFogCol.value.copy(o.fog); U.uFogMix.value = Math.min(0.85, fog * 0.8);
      if (sunUp) U.uLightDir.value.set(sun.x, Math.max(sun.y, -0.05), sun.z).normalize();
      else U.uLightDir.value.set(-sun.x, -sun.y, sun.z).normalize();

      // Cirrus: out on fair and windy days, gone under the rain deck.
      const C = cir.uniforms;
      C.uCenter.value.set(fx, 0, fz); C.uOff.value.copy(cirOff); C.uAng.value = Math.atan2(-wZ, wX);
      C.uAmount.value = Math.max(0, 0.45 + wind * 0.35 - rain * 1.2 - fog * 0.8) * (1 - night * 0.85);
      C.uColor.value.copy(lit).lerp(WHITE, 0.25 * (1 - night)).lerp(tmp.setHex(c.top), 0.12);
      C.uHaze.value.copy(o.horizon);
      cir.mesh.visible = C.uAmount.value > 0.01;

      // Stars: in at dusk, out at dawn; only on a clear night.
      const clear = THREE.MathUtils.clamp(1 - cloud * 1.15 - fog * 1.6 - rain * 2, 0, 1);
      const sv = THREE.MathUtils.smoothstep(night, 0.3, 1) * clear;
      const S = stars.uniforms;
      stars.points.visible = milky.mesh.visible = sv > 0.002;
      stars.points.position.set(fx, 0, fz); milky.mesh.position.set(fx, 0, fz);
      S.uVis.value = sv; S.uTime.value = clock % 3600; S.uPx.value = renderer ? renderer.getPixelRatio() : 1;
      S.uMoonDir.value.set(-sun.x, -sun.y, sun.z).normalize(); S.uMoon.value = THREE.MathUtils.clamp(-sun.y * 4, 0, 1);
      milky.uniforms.uVis.value = sv * sv * (1 - 0.6 * S.uMoon.value * 0.5);
      // The odd shooting star on a clear night.
      if (sv > 0.4) {
        if (!shot) { shotIn -= dt; if (shotIn <= 0) { const a = Math.random() * Math.PI * 2, e = 0.6 + Math.random() * 0.6; shot = { t: 0, dur: 0.7 + Math.random() * 0.5 }; S.uShotA.value.copy(az(a, e)); S.uShotB.value.copy(az(a + 0.35 + Math.random() * 0.35, e - 0.25 - Math.random() * 0.2)); } }
      }
      if (shot) {
        shot.t += dt; const u = shot.t / shot.dur;
        S.uShot.value.set(u, Math.sin(Math.min(1, u) * Math.PI));
        if (u > 1.25) { shot = null; shotIn = 9 + Math.random() * 22; S.uShot.value.set(0, 0); }
      }
    },
    // ?shootingstar debug / stargazing: fire one now.
    shoot() { shotIn = 0; },
  };
}
