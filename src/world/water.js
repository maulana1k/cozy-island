import * as THREE from 'three';
import { landR, shoreR, coastShift, coastShallow, heightAt, riverAt } from '../logic/terrain.js';
import { PALETTE, ISLAND_RADIUS, WILD, AREAS, POND } from '../config.js';
import { BRIDGE, STONES, DOCK } from '../logic/layout.js';
import { emitDrops, emitPuffs } from './particles.js';
import { WIND } from './weather.js';

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
    float lift = clamp((uShore - s.x) * 0.32 + 0.16, 0.0, 0.16 + 0.32 * (1.7 * reach + 0.8));
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
  uniform float uDetail; // 1 on Graphics High; Low draws the fine detail (wakes, rain rings, surf, glints) half as far out
  uniform vec4 uWind;
  uniform vec3 uAbyss;
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
  // Waves come in sets: every seventh or so is a good deal bigger than the rest.
  float wavePeak(float id, float sn2) { float set = pow(0.5 + 0.5 * sin(id * 0.9 + 1.3), 6.0); return mix(0.55, 1.0, hash2(vec2(id, 3.7))) * (0.8 + 0.4 * sn2) * (1.0 + 0.6 * set); }
  // Cellular noise: distances to the nearest two of a field of slowly wandering points (x = F1, y = F2).
  vec2 cells(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * vec2(hash2(i + g), hash2(i + g + 17.3)));
      vec2 d = g + o - f;
      float dd = dot(d, d);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    return sqrt(vec2(d1, d2));
  }
  // Bubbly lace: the bright film between neighbouring bubbles (the cell borders), with round holes in it.
  // Natural sea foam, the shared pattern: a domain-warped mix of broken patches (~45 cm), bubble clusters
  // (~15 cm) and specks (~5 cm), plus torn holes of uneven size that open and close as bubbles pop.
  // Every layer evolves on its own clock, so the foam dissolves and re-forms rather than sliding as a fixed print.
  // x = the foam value 0..1, y = how much a hole is open here 0..1.
  vec2 foamField(vec2 p, float t, float detail) {
    vec2 w = vec2(noised(p * 0.9 + vec2(t * 0.11, -t * 0.07)).x, noised(p * 0.9 + vec2(4.7, 1.3) - t * 0.09).x);
    vec2 q = p + (w - 0.5) * 0.9;
    float n1 = noised(q * 2.2 + t * vec2(0.13, 0.05)).x;
    float n2 = noised(q * 6.5 - t * vec2(0.31, 0.17)).x;
    float n3 = detail > 0.3 ? noised(q * 19.0 + t * vec2(0.4, -0.55)).x : 0.5;
    float holes = 0.0;
    if (detail > 0.3) {
      vec2 c = cells(q * 11.0 + n1 * 1.7, t * 1.9);
      holes = (1.0 - smoothstep(0.1, 0.18 + 0.28 * n2, c.x)) * smoothstep(0.35, 0.7, n2 + 0.25 * n3) * detail;
    }
    return vec2(n1 * 0.52 + n2 * 0.3 + n3 * 0.18, holes);
  }
  // How much of the water the foam covers where it is dens thick (0 = a few specks .. 1 = solid white),
  // with soft edges; far off the fine pattern fades to its average so no structure shows from any distance.
  float foamCover(vec2 ff, float dens, float detail) {
    float e = 1.0 - dens;
    float c = smoothstep(e - 0.07, e + 0.13, ff.x) * (1.0 - ff.y * (0.5 + 0.45 * (1.0 - dens)));
    return mix(dens * 0.85, c, detail);
  }
  // Caustics: two drifting layers of soft bright cell borders, like sunlight focused by the ripples.
  float caustic(vec2 p, float t) {
    vec2 a = cells(p * 1.25, t * 0.8), b = cells(p * 2.1 + 3.1, -t * 0.65);
    return smoothstep(0.22, 0.0, a.y - a.x) * 0.65 + smoothstep(0.16, 0.0, b.y - b.x) * 0.45;
  }

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
    if (camD < 70.0 * uDetail) {
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
    if (uRain > 0.01 && camD < 45.0 * uDetail) {
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
    seaCol = mix(seaCol, uAbyss, smoothstep(uShore + flats, uShore + flats + 70.0, r)); // deep teal-blue far out
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
    float rocky = 1.0 - smoothstep(0.1, 0.45, s.y);
    float wetBed0 = step(s.w, 3.0) * step(s.w, -0.02);
    float ds = r - uShore; // metres seaward of the still waterline
    float seaFoam = 0.0, waveLight = 0.0, waveShade = 0.0;
    vec2 seaward = vec2(0.0);
    if (sea > 0.3 && ds > -4.0 && ds < 24.0 && camD < 140.0 * uDetail && (x > -0.05 || inland > 0.5 || wetBed0 > 0.5)) {
      vec2 fl2;
      seaward = vec2(shoreInfo(p + vec2(0.7, 0.0), fl2).x - r, shoreInfo(p + vec2(0.0, 0.7), fl2).x - r);
      seaward /= max(length(seaward), 1e-4);
      float detail = 1.0 - smoothstep(45.0, 110.0, camD);
      // ---- the breaker: a swell rolls in, rises and steepens, its lip curls over and it breaks into a bore of white water
      float D0 = mix(16.0, 11.0, rocky), bd = (1.6 + 2.2 * peak) * mix(1.0, 1.6, rocky);
      float vis = smoothstep(0.45, 0.62, f);
      float dc = (1.0 - clamp((f - 0.45) / 0.55, 0.0, 1.0)) * D0; // the crest's distance out
      float u = ds - dc;                                        // + behind the crest (seaward), - in front of it
      float steep = 1.0 - smoothstep(bd, D0, dc);
      float broken = smoothstep(bd + 0.3, bd - 0.6, dc);
      float amp = 0.45 * peak * (0.3 + 0.7 * steep) * vis * (1.0 - 0.75 * broken);
      float wf = mix(1.7, 0.45, steep), w = u < 0.0 ? wf : 3.2;
      float hgt = exp(-(u / w) * (u / w));
      slope += seaward * amp * hgt * (-2.0 * u / (w * w)) * 0.9;
      float front = (1.0 - step(0.0, u)) * hgt * vis * (1.0 - broken);
      waveLight = front * (0.25 + 0.75 * steep);                       // the face, lit through like green glass
      float lu = (u + 0.12) / 0.2, lip = exp(-lu * lu) * smoothstep(0.55, 1.0, steep) * vis * (1.0 - broken);
      float cu = (u + wf * 0.9) / (wf * 0.45);
      waveShade = exp(-cu * cu) * smoothstep(0.7, 1.0, steep) * vis * (1.0 - broken);   // shadow under the curling lip
      // White water: a band that churns behind the broken crest as it rushes in, trailing lace seaward.
      float bw = 0.7 + 2.3 * clamp(1.0 - dc / max(bd, 0.1), 0.0, 1.0);
      // One foam pattern for the whole surf zone, carried gently shoreward with the water.
      vec2 ff = detail > 0.01 ? foamField(p + seaward * (dc * 0.35 + uTime * 0.12), uTime, detail) : vec2(0.5, 0.0);
      float bore = smoothstep(-0.4, 0.0, u) * (1.0 - smoothstep(bw * 0.55, bw, u)) * broken * vis;
      float trail = smoothstep(bw * 0.55, bw, u) * (1.0 - smoothstep(bw, bw + 3.5, u)) * broken * vis;
      // Densest and whitest right behind the front, thinning to patches and specks further back.
      seaFoam += bore * foamCover(ff, mix(0.95, 0.75, smoothstep(0.0, bw, u)), detail);
      seaFoam += trail * foamCover(ff, mix(0.55, 0.08, smoothstep(bw * 0.6, bw + 3.5, u)), detail) * 0.85;
      seaFoam += lip * foamCover(ff, 0.7, detail);
      // ---- the wash on the sand: a dense white band rushing up, then bubbly patches thinning to specks as it slides back
      float band = 0.35 + 1.6 * uprush;
      float edgeFoam = smoothstep(-0.03, 0.06, x) * (1.0 - smoothstep(band * 0.5, band, x));
      edgeFoam *= foamCover(ff, mix(0.6, 0.93, uprush), detail);
      float back = smoothstep(0.26, 1.0, f); // how far into the backwash
      float film = smoothstep(0.05, 0.4, x) * (1.0 - smoothstep(0.4, 0.8 + peak * reach, x)) * (1.0 - uprush);
      film *= foamCover(ff, mix(0.55, 0.06, back) * (1.0 - 0.45 * smoothstep(0.3, 2.2, x)), detail) * 0.8;
      seaFoam += edgeFoam * 0.95 + film;
      seaFoam *= mix(1.0, 1.4, rocky);
    }
    // Wind: gentle foam streaks along the swell's crests out at sea, more and whiter in a blow.
    {
      vec2 wd = normalize(uWind.xy + vec2(1e-4)), wq = vec2(dot(p, wd), dot(p, vec2(-wd.y, wd.x)));
      float ws = uWind.z;
      float cap = noised(wq * vec2(0.11, 0.42) - vec2(uTime * 0.45, 0.0)).x;
      float caps = smoothstep(0.88 - 0.24 * ws, 0.98, cap) * (0.3 + 0.7 * ws) * smoothstep(-0.02, 0.1, vWave);
      seaFoam += caps * smoothstep(0.3, 0.75, rp.x + 0.15) * depthT * sea * 0.8;
    }
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
      float sheen = pow(1.0 - max(V.y, 0.0), 2.5) * exp(-max(since, 0.0) / 1.5) * 0.5;
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

    body = mix(body, uTurq * 1.2 + vec3(0.02, 0.06, 0.05), waveLight * 0.55 * sea) * (1.0 - 0.35 * waveShade);
    vec3 col = mix(body * uLight, sky, fres * (1.0 - 0.5 * waveLight));
    // Caustics on the sandy bottom of the shallows (sea, river and pond), only in sunlight and only close by.
    float caus = 0.0;
    if (camD < 45.0 * uDetail && uGlint > 0.02) {
      float shallowSea = sea * (1.0 - smoothstep(0.0, mix(3.0, 8.0, s.y), r - uShore)) * smoothstep(0.4, 2.0, x);
      float shallowIn = inland * smoothstep(0.02, 0.12, depth) * (1.0 - smoothstep(0.25, 0.75, depth));
      float k = max(shallowSea, shallowIn) * (1.0 - smoothstep(25.0, 45.0, camD));
      if (k > 0.01) caus = caustic(p + slope * 3.0, uTime * 0.9) * k * min(1.0, uGlint * 1.5);
    }
    col += uSunColor * caus * 0.24;
    float foam = clamp(mix(seaFoam, rivFoam, inland) * mix(0.6, 1.0, near) + obsFoam + rainRing * 0.12, 0.0, 1.0);
    col = mix(col, uFoam * uLight * 1.1, foam * 0.85);
    // Low sun: a golden path of light on the sea toward the real sun (the light itself never sinks below 13 degrees).
    float sp = max(dot(R, uSunTrue), 0.0), path = (pow(sp, 40.0) * 1.2 + pow(sp, 10.0) * 0.2) * uPath * (1.0 - inland);
    col += uSunColor * vec3(1.0, 0.82, 0.55) * path * (1.0 - foam);
    glint = max(glint, path);
    // Sparkle: tiny points that wink on and off where the ripples catch the sun.
    if (uGlint > 0.02 && camD < 80.0 * uDetail) {
      vec2 sp2 = p * 3.0 + rp.yz * 2.0, sc = floor(sp2), sf = fract(sp2) - 0.5;
      float sh = hash2(sc + 0.7), tw = pow(max(0.0, sin(uTime * (2.5 + 4.0 * sh) + sh * 40.0)), 10.0);
      float sparkle = step(0.8, sh) * tw * exp(-dot(sf, sf) * 70.0) * pow(sd, 5.0) * uGlint * (1.0 - smoothstep(40.0, 80.0, camD));
      glint += sparkle * 2.2;
    }
    col += uSunColor * glint * (1.0 - foam);

    float alpha = mix(seaAlpha, rivAlpha, inland);
    // The wash thins to a clear sheet at its edge.
    alpha *= mix(mix(0.4, 1.0, smoothstep(0.0, 2.0, x)), 1.0, max(inland, smoothstep(uShore + 1.0, uShore + 4.0, r)));
    alpha = max(alpha, max(fres * 1.1, glint));
    alpha = max(alpha, foam * 0.92);
    alpha = max(alpha, min(caus * 0.3, 0.45));

    col = mix(col, uFogColor, fog);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

// The coastline and the inland water over the new land and the camp's pond, baked once at 1 m (half floats):
// R = shoreR (as before), G = the bed's height near the river, lake and pond (9 elsewhere), BA = the river's current.
const LAND_BOX = { x0: -36, z0: -200, w: 250, h: 274 }; // south to z = 74: over the fishing beach's broad shallows and its pier
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

// ---- breakers that throw spray: the shader's wave clock, copied here so the bursts land on its crests ----
const fract = (v) => v - Math.floor(v);
function hash2(x, y) { // as the GLSL hash2
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33); a += d; b += d; c += d;
  return fract((a + b) * c);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const wavePeak = (id, sn2) => (0.55 + 0.45 * hash2(id, 3.7)) * (0.8 + 0.4 * sn2) * (1 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(id * 0.9 + 1.3), 6));
const sstep = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// Where a wave is at time t for a spot on the shore: its id, phase 0..1, peak, how far out it breaks, and its crest.
function waveAt(pt, t) {
  const ph = t / 7.5 + pt.sn * 0.8, id = Math.floor(ph), f = ph - id, peak = wavePeak(id, pt.sn2);
  const D0 = 16 - 5 * pt.rocky, bd = (1.6 + 2.2 * peak) * (1 + 0.6 * pt.rocky);
  return { id, f, peak, bd, D0, dc: (1 - Math.min(1, Math.max(0, (f - 0.45) / 0.55))) * D0 };
}
const SPRAY = 0xf3f9fb, surf = { pts: [], posts: [], sx: 1e9, sz: 1e9, sound: 0, queue: [] };
function shorePoint(x, z) {
  const r = shoreR(x, z), gx = shoreR(x + 0.7, z) - r, gz = shoreR(x, z + 0.7) - r, l = Math.hypot(gx, gz) || 1;
  const sh = Math.abs(landR(x, z) - 60) < 45 ? coastShallow(x, z) : 0.5;
  return { x, z, r, nx: gx / l, nz: gz / l, rocky: 1 - sstep(0.1, 0.45, sh), sn: vnoise(x * 0.045, z * 0.045), sn2: vnoise(x * 0.13 + 5, z * 0.13 + 5), id: null, f: 0 };
}
// The waterline round the camera, every 2.5 m (redone when the camera has moved on).
function scanShore(cx, cz) {
  surf.pts.length = 0; surf.sx = cx; surf.sz = cz;
  for (let x = cx - 45; x <= cx + 45; x += 2.5) for (let z = cz - 45; z <= cz + 45; z += 2.5) {
    if ((x - cx) ** 2 + (z - cz) ** 2 > 45 * 45) continue;
    const r = shoreR(x, z);
    if (r < 59.2 || r >= 60.8) continue;
    const pt = shorePoint(x, z);
    if (heightAt(x + pt.nx * 4, z + pt.nz * 4) < -0.1) surf.pts.push(pt); // real sea out in front (not a river bank)
  }
}
// The harbour pier's posts (the deck runs out from DOCK along its heading): white water slaps them as each wave passes.
{
  const dx = Math.sin(DOCK.rot), dz = Math.cos(DOCK.rot);
  for (let lz = 1.5; lz <= DOCK.length; lz += 3) for (const lx of [-1, 1]) {
    const o = lx * (DOCK.width / 2 - 0.1), x = DOCK.x + dx * lz + dz * o, z = DOCK.z + dz * lz - dx * o, p = shorePoint(x, z);
    if (p.r > 60.2) { surf.posts.push(p); statics.push({ x, z, r: 0.14, kind: 1 }); }
  }
}
function burst(x, z, nx, nz, peak, rocky, near, t) {
  const tx = -nz, tz = nx, n = Math.round((3 + 4 * peak) * (1 + 1.4 * rocky) * near);
  for (let i = 0; i < n; i++) {
    const o = (Math.random() - 0.5) * (2.4 + rocky * 1.5);
    emitDrops(x + tx * o, 0.25 + rocky * 0.25, z + tz * o, 2, 0.8 + 0.5 * peak + rocky * 0.9, SPRAY);
  }
  emitPuffs(x, 0.3 + rocky * 0.3, z, Math.round((2 + 2 * peak) * (1 + rocky) * near), SPRAY, 0.6 + rocky * 0.5, 1.0 + rocky * 1.6, 0.75);
  // On the rocks, white water then runs back off them a moment later.
  if (rocky > 0.5) surf.queue.push({ t: t + 0.6, x: x - nx * 0.6, z: z - nz * 0.6, tx, tz });
}
function updateSurf(cam, t) {
  if (Math.hypot(cam.x - surf.sx, cam.z - surf.sz) > 12) scanShore(cam.x, cam.z);
  const audio = globalThis.__game?.audio; // optional: the soft crash of a breaker
  for (const pt of surf.pts) {
    const w = waveAt(pt, t), d = Math.hypot(pt.x - cam.x, pt.z - cam.z);
    if (pt.id === w.id && d < 42) {
      const fb = 0.45 + 0.55 * (1 - w.bd / w.D0);
      if (pt.f < fb && w.f >= fb) { // the crest breaks
        const near = 1 - sstep(20, 42, d);
        burst(pt.x + pt.nx * w.bd, pt.z + pt.nz * w.bd, pt.nx, pt.nz, w.peak, pt.rocky, near, t);
        if (audio && d < 32 && t - surf.sound > 0.45) { surf.sound = t; audio.call?.('surf', pt.x + pt.nx * w.bd, 0.3, pt.z + pt.nz * w.bd, pt.rocky > 0.5 ? 1 : 0); }
      }
    }
    pt.id = w.id; pt.f = w.f;
  }
  for (const pt of surf.posts) {
    const w = waveAt(pt, t), d = Math.hypot(pt.x - cam.x, pt.z - cam.z), ds = pt.r - 60;
    const prev = pt.dc ?? w.dc;
    if (d < 40 && prev > ds && w.dc <= ds && w.f > 0.45) {
      const big = w.dc < w.bd ? 1 : 0.4;
      emitDrops(pt.x, 0.2, pt.z, Math.round(3 + 4 * big), 0.6 + 0.6 * big, SPRAY);
      emitPuffs(pt.x, 0.25, pt.z, 1 + Math.round(2 * big), SPRAY, 0.3, 0.8 + big, 0.6);
    }
    pt.dc = w.dc;
  }
  for (let i = surf.queue.length - 1; i >= 0; i--) {
    const q = surf.queue[i];
    if (t < q.t) continue;
    for (let k = 0; k < 4; k++) { const o = (Math.random() - 0.5) * 2.4; emitDrops(q.x + q.tx * o, 0.45, q.z + q.tz * o, 2, 0.35, SPRAY); }
    emitPuffs(q.x, 0.15, q.z, 2, SPRAY, 1.0, 0.25, 0.5);
    surf.queue.splice(i, 1);
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
      uTurq: { value: new THREE.Color(0x7fdccb) },
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
      uWind: WIND,
      uAbyss: { value: new THREE.Color(0x1f6684) },
      uObs: { value: Array.from({ length: OBS_N }, () => new THREE.Vector4()) },
      uFogColor: { value: new THREE.Color(0xf6d9b8) },
      uFogDensity: { value: 0.004 },
      uDetail: { value: 1 },
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
  mesh.userData.surf = surf; mesh.userData.waveAt = waveAt; // (read by checks: timing a screenshot to a break)
  mesh.onBeforeRender = (renderer, scene, camera) => { pickObstacles(camera.position, mat.uniforms.uObs.value); updateSurf(camera.position, mat.uniforms.uTime.value); };
  const u = mat.uniforms, tmp = new THREE.Color(), dir = new THREE.Vector3();
  mesh.userData.update = (elapsed) => { u.uTime.value = elapsed; };
  mesh.userData.setDetail = (k) => { u.uDetail.value = k; }; // Graphics Low: 0.5
  // The sky tints the water so it follows the time of day: `light` lights the water body, `fog` is the horizon
  // (it is what the sky looks like low down), `sun` the sky's sun/moon light for glints, `rain` 0..1 for rings.
  mesh.userData.setLight = (light, fog, density, sun, rain = 0, sunDir = null, gold = 0) => {
    // sunDir: the real sun's direction; gold 0..1 how golden and clear the hour is (src/sunfx.js)
    if (sunDir) { u.uSunTrue.value.copy(sunDir); u.uPath.value = gold * THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.06) * (1 - THREE.MathUtils.smoothstep(sunDir.y, 0.45, 0.75)); } else u.uPath.value = 0;
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
