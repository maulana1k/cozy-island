// Dynamic weather: a director that picks the next weather, a blender that fades between looks without
// popping, and three particle kinds (rain streaks, swirling wind streaks, low ground mist), each ONE
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
  float gust = 0.55 + 0.45 * sin(t * 0.9 + dot(at, uWind.xy) * 0.07);
  float ph = t * (1.3 + 2.4 * s) + at.x * 0.31 + at.y * 0.23;
  float amp = 0.02 + 0.6 * s * s;
  vec2 along = uWind.xy * (0.5 + 0.5 * sin(ph)) * gust;
  vec2 across = vec2(-uWind.y, uWind.x) * sin(ph * 0.7 + 1.3) * 0.35 * gust;
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
const RAIN_N = 2600, WIND_N = 170, WIND_SEGS = 12, MIST_N = 52;

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

function buildRain(rng) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const uniforms = { uTime: { value: 0 }, uAmt: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(0, -16, 0) }, uColor: { value: new THREE.Color(0xc9d8ea) }, uAlpha: { value: 0.5 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uAmt; uniform vec3 uCenter, uVel; varying float vA;
      void main() {
        const vec3 BOX = vec3(34.0, 20.0, 34.0);
        if (aSeed.w > uAmt) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
        vec3 vel = uVel * (0.85 + 0.3 * fract(aSeed.x * 57.3 + aSeed.z * 13.1));
        vec3 rel = mod(aSeed.xyz * BOX + vel * uTime - uCenter + BOX * 0.5, BOX) - BOX * 0.5;
        vec3 head = uCenter + rel, tail = head - vel * 0.05;
        vec4 a = viewMatrix * vec4(head, 1.0), b = viewMatrix * vec4(tail, 1.0);
        vec3 side = normalize(cross(b.xyz - a.xyz, a.xyz) + 1e-5);
        float dist = length(a.xyz);
        vec4 v = mix(a, b, position.y); v.xyz += side * position.x * 0.015 * (1.0 + dist * 0.035);
        gl_Position = projectionMatrix * v;
        float edge = (1.0 - smoothstep(0.7, 1.0, abs(rel.y) / 10.0)) * (1.0 - smoothstep(0.7, 1.0, length(rel.xz) / 17.0));
        vA = edge * smoothstep(0.8, 2.5, dist) * (1.0 - position.y * 0.65);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main() { gl_FragColor = vec4(uColor, vA * uAlpha);
        #include <colorspace_fragment>
      }`,
  });
  const m = instanced(geo, RAIN_N, [['aSeed', seeded(RAIN_N, rng), 4]]);
  m.material = mat; m.renderOrder = 5; m.name = 'rain';
  return { mesh: m, uniforms };
}

function buildWindStreaks(rng) {
  const verts = [], idx = [];
  for (let i = 0; i <= WIND_SEGS; i++) { const s = i / WIND_SEGS; verts.push(-0.5, s, 0, 0.5, s, 0); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k, k - 1, k + 1); } }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setIndex(idx);
  const uniforms = { uTime: { value: 0 }, uAmt: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: WIND, uAlpha: { value: 0.55 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; attribute vec4 aSeed2; uniform float uTime, uAmt; uniform vec3 uCenter; uniform vec4 uWind; varying float vA;
      const vec3 BOX = vec3(30.0, 7.0, 30.0);
      vec3 swirl(float t) { // a lazy, chaotic loop: two frequencies per axis, different for every streak
        float r = 0.6 + aSeed2.x * 1.5, w1 = 1.1 + aSeed2.y * 1.6, w2 = 0.7 + aSeed2.z * 1.1, ph = aSeed2.w * 6.2832;
        return vec3(sin(t * w1 + ph) * r + sin(t * w2 * 2.3 + aSeed.x * 9.0) * r * 0.5,
                    sin(t * w2 + aSeed.y * 6.28) * r * 0.45 + sin(t * 0.6 * w1 + aSeed.z * 20.0) * 0.4,
                    cos(t * w1 + ph) * r + cos(t * w2 * 1.7 + aSeed.z * 9.0) * r * 0.5);
      }
      void main() {
        if (aSeed.w > uAmt) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
        float speed = 4.0 + uWind.z * 5.0 + aSeed2.x * 3.0;
        vec3 drift = vec3(uWind.x, 0.0, uWind.y) * speed;
        vec3 hb = aSeed.xyz * BOX + drift * uTime;
        vec3 rel = mod(hb - uCenter + BOX * 0.5, BOX) - BOX * 0.5;
        vec3 shift = (uCenter + rel) - hb;
        float s = position.y, tau = uTime - s * 0.38;
        vec3 p = aSeed.xyz * BOX + drift * tau + swirl(tau) + shift;
        vec3 q = aSeed.xyz * BOX + drift * (tau - 0.03) + swirl(tau - 0.03) + shift;
        vec4 a = viewMatrix * vec4(p, 1.0), b = viewMatrix * vec4(q, 1.0);
        vec3 side = normalize(cross(b.xyz - a.xyz, a.xyz) + 1e-5);
        float dist = length(a.xyz), taper = sin(3.14159 * s);
        vec4 v = a; v.xyz += side * position.x * 0.07 * taper * (1.0 + dist * 0.03);
        gl_Position = projectionMatrix * v;
        float edge = (1.0 - smoothstep(0.7, 1.0, abs(rel.y) / 3.5)) * (1.0 - smoothstep(0.65, 1.0, length(rel.xz) / 15.0));
        vA = edge * smoothstep(1.2, 4.0, dist) * taper;
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
export function createWeather(scene, params) {
  const rng = createRng(SEED + 97);
  const rain = buildRain(rng), streaks = buildWindStreaks(rng), mist = buildMist(rng);
  scene.add(rain.mesh, streaks.mesh, mist.mesh);

  const cur = { wind: 0, rain: 0, fog: 0, cloud: 0, cold: 0 };
  const from = { ...cur }, to = { ...cur };
  const w = {
    kind: 'sun', previous: null, forced: false,
    wind: 0, windX: 1, windZ: 0, rain: 0, fog: 0, cloud: 0, wet: 0, cold: 0,
    nextKind: 'sun', hoursLeft: 0, blend: 1, blendTime: 1,
    label: LABEL.sun,
    setKind, update,
  };
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

  const forced = params && params.get('weather');
  const alias = { sun: 'sun', sunny: 'sun', clear: 'sun', wind: 'wind', windy: 'wind', rain: 'rain', rainy: 'rain', fog: 'fog', foggy: 'fog' };
  if (forced && alias[forced]) { w.forced = true; setKind(alias[forced], 12, true); w.hoursLeft = 1e9; }
  else { setKind('sun', 12, true); w.hoursLeft = 2 + rng() * 2; }

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
    clock += dt; windClock += dt * (0.6 + 0.9 * w.wind);
    w.windX = Math.cos(windAngle); w.windZ = Math.sin(windAngle);
    WIND.value.set(w.windX, w.windZ, w.wind, windClock);

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
      u.uVel.value.set(w.windX * (1 + w.wind * 9), -16, w.windZ * (1 + w.wind * 9));
      u.uColor.value.setRGB(0.62 * dark + 0.04, 0.72 * dark + 0.05, 0.86 * dark + 0.08);
      u.uAlpha.value = 0.55;
    }
    const gale = Math.max(0, (w.wind - 0.45) / 0.55);
    streaks.mesh.visible = gale > 0.01;
    if (streaks.mesh.visible) {
      const u = streaks.uniforms;
      u.uTime.value = clock % 3600; u.uAmt.value = gale;
      u.uCenter.value.set(gx, baseY + 2.4, gz);
      u.uAlpha.value = 0.85 * (0.45 + 0.55 * dark);
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
