import * as THREE from 'three';
import { landR, shoreR, coastShift, coastShallow, heightAt, riverAt } from '../logic/terrain.js';
import { PALETTE, ISLAND_RADIUS, WILD, AREAS, POND } from '../config.js';
import { BRIDGE, STONES } from '../logic/layout.js';

// The sea, river, lake and pond surface: one big shaded plane at sea level (moved out of island.js).
//
// Everything moves in the shader:
// - ripples are layered value noise carried along a baked flow map (faster where the river narrows),
//   lit with a fresnel sky reflection (sky colours from the time of day) and soft sun glints;
// - the river and the pond are clear and light over the shallows and dark mid-stream (a baked bed height),
//   with soft foam where the water meets the banks, collars and wakes round rocks and bridge piles, and
//   rings round lily pads, reeds and ducks (the nearest obstacles are handed to the shader every frame);
// - on the sea coast each wave runs up the sand and slides back (the plane is lifted over the beach and cut
//   away where the wash has not reached), with a foam line on its edge and a dark wet band behind it;
// - rain adds ripple rings near the camera.

// ---- obstacles the water flows round ------------------------------------------------------------
// kind 1 = rock or post (collar and wake), 2 = lily pad / reed / moored boat (a lapping ring), 3 = duck (spreading rings).
const OBS_N = 24;
const statics = [], movers = [];
export const waterObstacles = {
  add(x, z, r, kind = 1) { statics.push({ x, z, r, kind }); },
  // fn(out) pushes { x, z, r, kind } for things that move (called every frame).
  mover(fn) { movers.push(fn); },
};
// The footbridge piles (two a side at 30% and 70% of the span, as in areas/crossings.js) and the stepping stones.
for (const u of [0.3, 0.7]) for (const side of [-1, 1]) {
  const off = side * (BRIDGE.width / 2 - 0.12);
  statics.push({ x: BRIDGE.a.x + BRIDGE.dx * BRIDGE.len * u + BRIDGE.dz * off, z: BRIDGE.a.z + BRIDGE.dz * BRIDGE.len * u - BRIDGE.dx * off, r: 0.12, kind: 1 });
}
for (const s of STONES) statics.push({ x: s.x, z: s.z, r: s.r * 1.02, kind: 1 });

const shoreGlsl = /* glsl */ `
  uniform float uShore;
  uniform vec3 uWild;
  uniform float uBlend;
  uniform sampler2D uLand;
  uniform vec4 uLandBox;
  uniform sampler2D uCoast;
  uniform vec4 uCoastBox;
  // x: how far from the island's middle on its own scale (the coast is at uShore), y: how broad the shallows
  // are (0 rocky .. 1 sandy bay), z: inland water (river, lake, pond) 0..1, w: the bed's height (9 = not known).
  // flow: the river's current (metres a second).
  vec4 shoreInfo(vec2 p, out vec2 flow) {
    float ra = length(p), rb = uShore + length(p - uWild.xy) - uWild.z;
    float mh = clamp(0.5 + 0.5 * (rb - ra) / uBlend, 0.0, 1.0);
    float r = mix(rb, ra, mh) - uBlend * mh * (1.0 - mh);
    vec2 cuv = (p - uCoastBox.xy) * uCoastBox.zw;
    vec2 cs = vec2(0.0, 0.5);
    if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0) cs = texture2D(uCoast, cuv).rg;
    vec2 luv = (p - uLandBox.xy) * uLandBox.zw;
    float h = 9.0;
    flow = vec2(0.0);
    if (luv.x > 0.0 && luv.y > 0.0 && luv.x < 1.0 && luv.y < 1.0) { vec4 L = texture2D(uLand, luv); r = L.r; h = L.g; flow = L.ba; }
    else r += cs.r;
    float inland = (1.0 - smoothstep(3.0, 6.0, h)) * (1.0 - smoothstep(52.0, 58.0, r));
    return vec4(r, cs.g, inland, h);
  }
  // How far up the beach the waves run (metres): short on the rocky points, long in the sandy bays.
  float runReach(float shallow) { return mix(0.9, 2.6, shallow); }
`;

const waterVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  ${shoreGlsl}
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // A slow, broad swell: three long waves crossing each other, none of them tall.
    // (kit/river.js waterWave does the same sum for things that float.)
    float w = sin(world.x * 0.085 + world.z * 0.03 + uTime * 0.42) * 0.085 + sin(world.z * 0.07 - world.x * 0.025 - uTime * 0.34) * 0.075
            + sin((world.x * 0.6 + world.z * 0.8) * 0.17 + uTime * 0.58) * 0.035;
    vec2 fl;
    vec4 s = shoreInfo(world.xz, fl);
    // Over the beach the plane is lifted a little above the sand (linear in the shore measure, so the coarse
    // grid follows it), so the fragment shader can draw the wash running up and cut away the dry sand.
    float reach = runReach(s.y), sea = 1.0 - s.z;
    float lift = clamp((uShore - s.x) * 0.32 + 0.16, 0.0, 0.16 + 0.32 * (1.25 * reach + 0.8));
    lift *= sea * smoothstep(uShore - reach - 8.0, uShore - reach - 3.0, s.x);
    // The swell dies away on the beach (the wash takes over there); the river keeps it, so floating things stay in step.
    w *= mix(smoothstep(uShore - 1.0, uShore + 8.0, s.x), 1.0, s.z);
    world.y += w + lift;
    vWave = w;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFragment = /* glsl */ `
  #define OBS_N ${OBS_N}
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uTurq;
  uniform vec3 uDeep;
  uniform vec3 uRiverShallow;
  uniform vec3 uRiverDeep;
  uniform vec3 uWetSand;
  uniform vec3 uFoam;
  uniform vec3 uLight;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uGlint;
  uniform vec3 uSunTrue;
  uniform float uPath;
  uniform float uRain;
  uniform vec4 uObs[OBS_N];
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying float vWave;
  ${shoreGlsl}

  float hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  // Value noise with its slope: x = value 0..1, yz = d/dx, d/dy.
  vec3 noised(vec2 x) {
    vec2 i = floor(x), f = fract(x);
    vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
    float a = hash2(i), b = hash2(i + vec2(1.0, 0.0)), c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
    return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y, du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx));
  }
  // Ripples carried by the current: two copies of the pattern slide downstream half a cycle apart and
  // cross-fade, so it flows for ever without stretching. Fast water draws its ripples out along the flow.
  // Returns x = a 0..1 value (for breaking up foam), yz = the slope.
  vec3 ripples(vec2 p, vec2 vel, float t, float big) {
    float sp = length(vel);
    vec2 dir = sp > 0.02 ? vel / sp : vec2(0.8, 0.6), prp = vec2(-dir.y, dir.x);
    float st = 1.0 + 1.4 * clamp(sp, 0.0, 1.0);
    const float P = 1.8;
    float f0 = fract(t / P), w0 = 1.0 - abs(1.0 - 2.0 * f0);
    vec3 acc = vec3(0.0);
    for (int k = 0; k < 2; k++) {
      float fk = k == 0 ? f0 : fract(t / P + 0.5), wk = k == 0 ? w0 : 1.0 - w0;
      vec2 q = p - vel * (fk * P) + float(k) * vec2(13.7, 7.9);
      vec2 a = vec2(dot(q, dir), dot(q, prp));
      vec2 s1 = vec2(0.85 / st, 0.85), s2 = vec2(2.3 / st, 2.3);
      vec3 n1 = noised(a * s1), n2 = noised(a * s2 + 5.3);
      vec2 g = n1.yz * s1 * 0.55 + n2.yz * s2 * 0.2;
      acc += wk * vec3(n1.x * 0.65 + n2.x * 0.35, dir * g.x + prp * g.y);
    }
    // Wind chop that drifts on its own, so still water is never frozen; and a long swell out at sea.
    vec3 c1 = noised(p * 3.1 + t * vec2(0.31, 0.17)), c2 = noised(p * 2.6 - t * vec2(0.22, -0.27) + 9.1);
    acc.yz += (c1.yz + c2.yz) * 3.0 * 0.05;
    vec3 sw = noised(p * 0.22 + t * vec2(0.05, 0.03));
    acc.yz += sw.yz * 0.22 * 0.9 * big;
    return acc;
  }
  // The run-up of one wave as a fraction of the reach: in fast, out slowly, and a little below the still line
  // before the next one (continuous across waves, so neighbouring stretches can be out of step).
  float runUp(float f, float peak) {
    return f < 0.26 ? mix(-0.15, peak, 1.0 - (1.0 - f / 0.26) * (1.0 - f / 0.26)) : mix(peak, -0.15, smoothstep(0.0, 1.0, (f - 0.26) / 0.74));
  }
  float wavePeak(float id, float sn2) { return mix(0.55, 1.0, hash2(vec2(id, 3.7))) * (0.8 + 0.4 * sn2); }

  void main() {
    vec2 p = vWorld.xz;
    vec2 riverFlow;
    vec4 s = shoreInfo(p, riverFlow);
    float r = s.x, inland = s.z, sea = 1.0 - inland;
    float camD = length(vWorld - cameraPosition);
    float near = 1.0 - smoothstep(30.0, 90.0, camD);
    float speed = length(riverFlow) * inland;
    vec2 dir = speed > 0.02 ? normalize(riverFlow) : vec2(0.0);
    vec2 vel = mix(vec2(0.22, 0.12), riverFlow, inland);
    vec3 rp = ripples(p, vel, uTime, sea);
    vec2 slope = rp.yz * mix(0.085, 0.08 + 0.08 * min(speed, 1.2), inland) * (0.35 + 0.65 * near);

    // ---- rocks, posts, pads and ducks
    float obsFoam = 0.0, rough = 0.0;
    if (camD < 70.0) {
      vec2 prp = vec2(-dir.y, dir.x);
      for (int i = 0; i < OBS_N; i++) {
        vec4 o = uObs[i];
        if (o.w < 0.5) break;
        vec2 d = p - o.xy;
        float dist = length(d);
        if (dist > o.z + 8.0) continue;
        float e = dist - o.z;
        vec2 nd = d / max(dist, 1e-3);
        if (o.w < 1.5) {
          // A collar of white water hugging the rock, fuller on the upstream face; then two soft lines and
          // churned water trailing downstream, longer when the current is quick.
          float up = -dot(nd, dir);
          float collar = 1.0 - smoothstep(0.0, 0.1 + 0.2 * speed * (0.7 + 0.5 * up) + 0.04 * o.z, e);
          float al = dot(d, dir), ac = dot(d, prp);
          float spread = o.z * 0.9 + max(al, 0.0) * 0.2;
          float tail = smoothstep(-0.3, 0.5, al) * exp(-max(al, 0.0) / (0.6 + 3.5 * speed)) * min(1.0, speed * 1.6);
          float lw = (abs(ac) - spread) / (0.1 + max(al, 0.0) * 0.05), lines = exp(-lw * lw);
          float inner = 1.0 - smoothstep(0.0, spread, abs(ac));
          obsFoam += collar * (0.45 + 0.55 * rp.x) + tail * (lines * 0.38 + inner * 0.22) * smoothstep(0.4, 0.8, rp.x + 0.1);
          rough += tail * inner + collar * 0.5;
          // Still water: a slow ring laps round the stone instead.
          slope += nd * cos(e * 14.0 - uTime * 2.2) * exp(-e * 2.5) * 0.03 * (1.0 - min(1.0, speed * 2.0)) * step(0.0, e);
        } else if (o.w < 2.5) {
          // A thin bright line where the water laps the edge, and small rings round it.
          obsFoam += (1.0 - smoothstep(0.0, 0.08, e)) * 0.3 * step(-0.05, e);
          slope += nd * cos(e * 16.0 - uTime * 2.4 + o.x) * exp(-e * 3.0) * 0.035 * step(0.0, e);
        } else {
          // A duck: rings spread out from it and fade.
          for (int k = 0; k < 2; k++) {
            float age = fract(uTime * 0.5 + float(i) * 0.37 + float(k) * 0.5), x = (e - age * 1.8) * 9.0;
            float ring = exp(-x * x) * (1.0 - age) * step(0.0, e);
            slope += nd * (-2.0 * x * exp(-x * x)) * (1.0 - age) * 0.05 * step(0.0, e);
            obsFoam += ring * 0.18;
          }
        }
      }
      slope += rp.yz * min(rough, 1.0) * 0.08;
    }

    // ---- rain: rings opening up all over the water near the camera
    float rainRing = 0.0;
    if (uRain > 0.01 && camD < 45.0) {
      float fade = uRain * (1.0 - smoothstep(20.0, 45.0, camD));
      for (int k = 0; k < 2; k++) {
        vec2 q = p * 1.7 + float(k) * vec2(0.43, 0.71);
        vec2 id = floor(q), f = fract(q) - 0.5;
        float h = hash2(id + float(k) * 19.0);
        if (h > 0.25 + 0.75 * uRain) continue;
        vec2 c = (vec2(hash2(id + 3.1), hash2(id + 5.7)) - 0.5) * 0.36;
        float age = fract(uTime * (0.8 + 0.4 * h) + h * 7.0);
        vec2 d = f - c;
        float dd = length(d), x = (dd - age * 0.42) * 26.0, g = exp(-x * x) * (1.0 - age);
        rainRing += g * fade;
        slope += (d / max(dd, 1e-3)) * (-2.0 * x * exp(-x * x)) * (1.0 - age) * 0.05 * fade;
      }
    }

    // ---- the colour of the water itself
    // Sea: turquoise flats hug the shore (broad in the sandy bays, a narrow fringe round the rocky points), deep blue beyond.
    float flats = mix(7.0, 30.0, s.y);
    float depthT = smoothstep(uShore - 2.0, uShore + flats, r);
    vec3 seaCol = mix(uTurq, uShallow, smoothstep(uShore - 0.5, uShore + flats * 0.5, r));
    seaCol = mix(seaCol, uDeep, depthT);
    float seaAlpha = mix(0.62, 0.96, depthT);
    // River, lake, pond: clear and light over the shallows, dark mid-stream.
    float depth = vWave - s.w;
    vec3 rivCol = mix(uRiverShallow, uRiverDeep, smoothstep(0.05, 1.1, depth));
    float rivAlpha = mix(0.28, 0.92, smoothstep(0.0, 0.9, depth));
    vec3 body = mix(seaCol, rivCol, inland) * (1.0 + vWave * 0.8);

    // ---- foam
    // River banks: soft broken foam right at the edge and faint lapping lines just off it.
    float bank = (1.0 - smoothstep(0.0, 0.07 + 0.07 * speed, depth)) * (0.3 + 0.7 * rp.x);
    float lap = smoothstep(0.75, 1.0, sin(depth * 38.0 - uTime * 1.5 + rp.x * 4.0)) * (1.0 - smoothstep(0.03, 0.2, depth));
    float rivFoam = (bank * 0.5 + lap * 0.22) * step(-0.5, depth);

    // Sea: the wash. Each stretch of beach is a little out of step with the next, and every wave runs a different height.
    float reach = runReach(s.y);
    float sn = noised(p * 0.045).x, sn2 = noised(p * 0.13 + 5.0).x;
    const float PERIOD = 7.5;
    float ph = uTime / PERIOD + sn * 0.8, wid = floor(ph), f = fract(ph);
    float peak = wavePeak(wid, sn2), run = runUp(f, peak);
    float rEdge = uShore - run * reach + (rp.x - 0.5) * 0.3;
    float x = r - rEdge; // metres seaward of the water's edge (below 0: on the sand)
    float uprush = 1.0 - smoothstep(0.18, 0.34, f);
    float edgeFoam = smoothstep(-0.03, 0.06, x) * (1.0 - smoothstep(0.12, 0.3 + 0.8 * uprush, x)) * mix(smoothstep(0.3, 0.65, rp.x + 0.12), 1.0, uprush);
    float sheet = smoothstep(0.1, 0.5, x) * (1.0 - smoothstep(0.3, 0.6 + peak * reach, x)) * (1.0 - uprush) * smoothstep(0.55, 0.8, rp.x) * 0.55;
    // The next breaker rolling in toward the beach, wider and whiter off the rocks.
    float rocky = 1.0 - smoothstep(0.1, 0.45, s.y);
    float crestR = uShore + 0.15 * reach + (1.0 - f) * (9.0 + 4.0 * rocky);
    float cw = (r - crestR) / (0.45 + 0.6 * rocky);
    float crest = exp(-cw * cw) * smoothstep(0.55, 0.85, f) * smoothstep(0.25, 0.7, rp.x + 0.15);
    float seaFoam = (edgeFoam * 0.9 + sheet + crest * (0.35 + 0.4 * rocky)) * mix(1.0, 1.5, rocky);

    // The dry and the wet sand: above the wash the plane is cut away, except a dark film where the water has just been.
    float wetBed = step(s.w, 3.0) * step(s.w, -0.02); // known river-mouth bed under the sea: always water
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * camD * camD);
    if (inland < 0.5 && x < 0.0 && wetBed < 0.5) {
      float q = (uShore - r) / reach; // how far up the beach, in reaches
      float since = 99.0;
      if (f >= 0.26) { if (q < peak) since = (f - (0.26 + 0.74 * clamp((peak - q) / (peak + 0.15), 0.0, 1.0))) * PERIOD; }
      else { float pp = wavePeak(wid - 1.0, sn2); if (q < pp) since = (f + 1.0 - (0.26 + 0.74 * clamp((pp - q) / (pp + 0.15), 0.0, 1.0))) * PERIOD; }
      float wet = max(exp(-max(since, 0.0) / 2.4), 0.4 * (1.0 - smoothstep(0.45, 0.9, q))) * (1.0 - smoothstep(0.85, 1.15, q));
      if (wet < 0.03) discard;
      // A fresh wet film catches the sky for a moment.
      vec3 V = normalize(cameraPosition - vWorld);
      float sheen = pow(1.0 - max(V.y, 0.0), 3.0) * exp(-max(since, 0.0) / 1.2) * 0.35;
      vec3 wc = mix(uWetSand * uLight, uSkyHorizon, sheen);
      gl_FragColor = vec4(mix(wc, uFogColor, fog), (0.34 * wet + sheen) * (1.0 - fog));
      #include <colorspace_fragment>
      return;
    }

    // ---- light: sky in the fresnel, the sun in glints
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = max(dot(n, V), 0.0);
    float fres = 0.03 + 0.62 * pow(1.0 - ndv, 4.0);
    vec3 R = reflect(-V, n);
    R.y = abs(R.y);
    vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));
    float sd = max(dot(R, uSunDir), 0.0);
    float glint = (smoothstep(0.3, 0.9, pow(sd, 300.0)) * 1.3 + pow(sd, 48.0) * 0.1) * uGlint * (0.4 + 0.6 * near);

    vec3 col = mix(body * uLight, sky, fres);
    float foam = clamp(mix(seaFoam, rivFoam, inland) * mix(0.6, 1.0, near) + obsFoam + rainRing * 0.12, 0.0, 1.0);
    col = mix(col, uFoam * uLight * 1.1, foam * 0.85);
    // Low sun: a golden path of light on the sea toward the real sun (the light itself never sinks below 13 degrees).
    float sp = max(dot(R, uSunTrue), 0.0), path = (pow(sp, 60.0) * 0.9 + pow(sp, 14.0) * 0.12) * uPath * (1.0 - inland);
    col += uSunColor * vec3(1.0, 0.82, 0.55) * path * (1.0 - foam);
    glint = max(glint, path);
    col += uSunColor * glint * (1.0 - foam);

    float alpha = mix(seaAlpha, rivAlpha, inland);
    // The wash thins to a clear sheet at its edge.
    alpha *= mix(mix(0.4, 1.0, smoothstep(0.0, 2.0, x)), 1.0, max(inland, smoothstep(uShore + 1.0, uShore + 4.0, r)));
    alpha = max(alpha, max(fres * 1.1, glint));
    alpha = max(alpha, foam * 0.9);

    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

// The coastline and the inland water over the new land and the camp's pond, baked once at 1 m (half floats):
// R = shoreR (as before), G = the bed's height near the river, lake and pond (9 elsewhere), BA = the river's current.
const LAND_BOX = { x0: -36, z0: -200, w: 250, h: 224 };
function bakeLand() {
  const { x0, z0, w, h } = LAND_BOX, n = w * h, toHalf = THREE.DataUtils.toHalfFloat;
  const sr = new Float32Array(n), bed = new Float32Array(n).fill(9), fx = new Float32Array(n), fz = new Float32Array(n);
  const RV = AREAS.river, LAKE = AREAS.lake, segs = [];
  for (let i = 0; i < RV.length - 1; i++) { const a = RV[i], b = RV[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z); segs.push({ a, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, len }); }
  const mouthS = riverAt(AREAS.riverMouth.x, AREAS.riverMouth.z).s;
  const smooth = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + i + 0.5, z = z0 + j + 0.5, k = j * w + i;
    sr[k] = Math.min(120, shoreR(x, z));
    const rv = riverAt(x, z), nearRiver = rv.d !== Infinity && rv.d < rv.w + 3 && rv.s < mouthS + 25;
    const nearLake = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4, nearPond = Math.hypot(x - POND.x, z - POND.z) < POND.rw + POND.bank + 2;
    if (!nearRiver && !nearLake && !nearPond) continue;
    bed[k] = Math.max(-3, Math.min(2.5, heightAt(x, z)));
    if (!nearRiver || rv.d > rv.w + 1) continue;
    // Downstream: the river's direction, eased round the bends (a weighted mix of the nearby stretches).
    let dx = 0, dz = 0;
    for (const sg of segs) {
      const t = Math.max(0, Math.min(1, (x - sg.a.x) * sg.dx + (z - sg.a.z) * sg.dz) / sg.len), px = sg.a.x + sg.dx * sg.len * t, pz = sg.a.z + sg.dz * sg.len * t;
      const wgt = Math.exp(-(((x - px) ** 2 + (z - pz) ** 2) / 36));
      dx += sg.dx * wgt; dz += sg.dz * wgt;
    }
    const l = Math.hypot(dx, dz) || 1;
    // Faster where the river is narrow and mid-stream, slow at the banks, still in the lake, easing out into the sea.
    const across = Math.min(1, rv.d / rv.w);
    const v = 0.8 * (5.4 / rv.w) * (0.2 + 0.8 * Math.sqrt(Math.max(0, 1 - across * across))) * smooth(LAKE.r - 3, LAKE.r + 8, rv.s) * (1 - smooth(mouthS - 2, mouthS + 14, rv.s));
    fx[k] = (dx / l) * v; fz[k] = (dz / l) * v;
  }
  // Soften the current once (3x3), so the pattern does not tear at the bends and the banks.
  const bx = new Float32Array(n), bz = new Float32Array(n);
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    let sx = 0, sz = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const q = (j + b) * w + i + a; sx += fx[q]; sz += fz[q]; }
    bx[j * w + i] = sx / 9; bz[j * w + i] = sz / 9;
  }
  const data = new Uint16Array(n * 4);
  for (let k = 0; k < n; k++) { data[k * 4] = toHalf(sr[k]); data[k * 4 + 1] = toHalf(bed[k]); data[k * 4 + 2] = toHalf(bx[k]); data[k * 4 + 3] = toHalf(bz[k]); }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
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

// The nearest obstacles to the camera go to the shader, nearest first (the rest of the slots stay empty).
const pool = [];
function pickObstacles(cam, out) {
  pool.length = 0;
  for (const o of statics) pool.push(o);
  for (const fn of movers) fn(pool);
  const cx = cam.x, cz = cam.z;
  for (const o of pool) o.d2 = (o.x - cx) ** 2 + (o.z - cz) ** 2;
  pool.sort((a, b) => a.d2 - b.d2);
  for (let i = 0; i < OBS_N; i++) {
    const o = pool[i];
    if (o && o.d2 < 75 * 75) out[i].set(o.x, o.z, o.r, o.kind); else out[i].set(0, 0, 0, 0);
  }
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
      uRiverShallow: { value: new THREE.Color(0x9cc6b4) },
      uRiverDeep: { value: new THREE.Color(0x2c5f66) },
      uWetSand: { value: new THREE.Color(0x5c4631) },
      uFoam: { value: new THREE.Color(PALETTE.foam) },
      uLight: { value: new THREE.Color(1, 1, 1) },
      uSkyTop: { value: new THREE.Color(0x6f9fd0) },
      uSkyHorizon: { value: new THREE.Color(0xd8e8ec) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uGlint: { value: 1 },
      uSunTrue: { value: new THREE.Vector3(0, 1, 0) },
      uPath: { value: 0 },
      uRain: { value: 0 },
      uObs: { value: Array.from({ length: OBS_N }, () => new THREE.Vector4()) },
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
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (renderer, scene, camera) => pickObstacles(camera.position, mat.uniforms.uObs.value);
  const u = mat.uniforms, tmp = new THREE.Color(), dir = new THREE.Vector3();
  mesh.userData.update = (elapsed) => { u.uTime.value = elapsed; };
  // The sky tints the water so it follows the time of day: `light` lights the water body, `fog` is the horizon
  // (it is what the sky looks like low down), `sun` the sky's sun/moon light for glints, `rain` 0..1 for rings.
  mesh.userData.setLight = (light, fog, density, sun, rain = 0, sunDir = null, gold = 0) => {
    // sunDir: the real sun's direction; gold 0..1 how golden and clear the hour is (src/sunfx.js)
    if (sunDir) { u.uSunTrue.value.copy(sunDir); u.uPath.value = gold * THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.06) * (1 - THREE.MathUtils.smoothstep(sunDir.y, 0.35, 0.6)); } else u.uPath.value = 0;
    u.uLight.value.copy(light);
    u.uFogColor.value.copy(fog);
    u.uFogDensity.value = density;
    u.uSkyHorizon.value.copy(fog);
    const lum = fog.r * 0.2126 + fog.g * 0.7152 + fog.b * 0.0722;
    u.uSkyTop.value.copy(fog).multiplyScalar(0.7).lerp(tmp.setRGB(0.28, 0.48, 0.8).multiplyScalar(Math.min(1, lum * 1.3)), 0.5);
    if (sun) {
      dir.copy(sun.position).sub(sun.target.position).normalize();
      u.uSunDir.value.copy(dir);
      const k = Math.min(1, sun.intensity / 3);
      u.uGlint.value = THREE.MathUtils.smoothstep(dir.y, 0.03, 0.25) * k * Math.sqrt(k); // faint under the moon, none at night
      u.uSunColor.value.copy(sun.color);
    }
    u.uRain.value = rain;
  };
  return mesh;
}
