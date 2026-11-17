// Real-looking fire: a few camera-facing quads per fire in ONE draw call (flame tongues + a soft base halo),
// shaded with scrolling fractal noise and a white-yellow -> red-orange colour ramp, additive, no depth write.
// Geometry is built once; per frame only three uniforms change (no allocations).
import * as THREE from 'three';
import { WIND } from './weather.js';

const VERT = /* glsl */`
  uniform float uTime;
  uniform vec4 uWind;          // the shared WIND: x,y = blow-toward direction, z = strength
  attribute vec4 aLayer;       // x,z offset from the fire centre, half-width, height (local metres)
  attribute vec2 aMisc;        // phase, kind (0 flame tongue, 1 base halo)
  varying vec2 vUv; varying float vPhase; varying float vKind; varying float vFade;
  void main() {
    float sc = length(modelMatrix[0].xyz);
    vec3 c = (modelMatrix * vec4(aLayer.x, 0.0, aLayer.y, 1.0)).xyz;
    vec3 toCam = cameraPosition - c;
    vec2 d = normalize(toCam.xz + vec2(1e-4));
    vec3 right = vec3(d.y, 0.0, -d.x);
    vPhase = aMisc.x; vKind = aMisc.y;
    vFade = 1.0 - smoothstep(70.0, 130.0, length(toCam));
    vec3 p;
    if (aMisc.y > 0.5) {
      vUv = vec2(position.x, position.y * 2.0 - 1.0);
      p = c + vec3(0.0, 0.32 * sc, 0.0) + right * position.x * aLayer.z * sc + vec3(0.0, position.y * 2.0 - 1.0, 0.0) * aLayer.w * sc;
    } else {
      vUv = position.xy;
      float flick = 1.0 + 0.09 * sin(uTime * 11.0 + aMisc.x * 6.0) + 0.05 * sin(uTime * 19.0 + aMisc.x * 3.0);
      float h = aLayer.w * flick * sc, y = position.y;
      p = c + right * position.x * aLayer.z * sc + vec3(0.0, y * h, 0.0);
      float lean = y * y * h;
      p.xz += uWind.xy * (0.12 + uWind.z * 0.5) * lean + right.xz * sin(uTime * 2.3 + aMisc.x * 5.0) * 0.07 * lean;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;

const FRAG = /* glsl */`
  uniform float uTime, uBright;
  varying vec2 vUv; varying float vPhase; varying float vKind; varying float vFade;
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { return (0.5 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 3.7) + 0.2 * vnoise(p * 4.3 + 9.1)); }
  void main() {
    if (vKind > 0.5) { // soft orange halo on the logs and ground
      float r = length(vUv);
      float a = pow(clamp(1.0 - r, 0.0, 1.0), 2.4) * (0.55 + 0.1 * sin(uTime * 7.0 + vPhase * 5.0));
      gl_FragColor = vec4(vec3(1.0, 0.45, 0.12), a * 0.5 * uBright * vFade);
      return;
    }
    float x = vUv.x, y = vUv.y;
    float sp = 1.0 + 0.35 * fract(vPhase * 3.7);
    vec2 q = vec2(x * 1.1 + vPhase * 11.0, y * 1.5 - uTime * 1.5 * sp);
    float n = fbm(q * vec2(1.7, 1.2));
    float n2 = fbm(q * vec2(2.6, 1.9) + vec2(5.2, -uTime * 0.9));
    float xd = x + (n - 0.5) * 1.1 * y + sin(uTime * 3.1 + vPhase * 9.0 + y * 4.5) * 0.09 * y;
    float width = (1.0 - pow(y, 0.7)) * (0.55 + 0.45 * smoothstep(0.0, 0.18, y)); // teardrop
    float shape = 1.0 - abs(xd) / max(width * 0.95, 0.001);
    float I = clamp(shape * 1.35 - y * 0.30 - (1.0 - n2) * y * y * 1.1 + (n - 0.5) * 0.35, 0.0, 1.0);
    vec3 c = mix(vec3(0.816, 0.251, 0.102), vec3(1.0, 0.541, 0.165), smoothstep(0.06, 0.34, I));
    c = mix(c, vec3(1.0, 0.824, 0.353), smoothstep(0.32, 0.62, I));
    c = mix(c, vec3(1.0, 0.965, 0.784), smoothstep(0.6, 0.92, I));
    float a = smoothstep(0.02, 0.3, I) * smoothstep(0.0, 0.05, y);
    gl_FragColor = vec4(c, a * 0.62 * uBright * vFade);
  }`;

// [offX, offZ, halfWidth, height] per tongue, tallest first, all relative to a fire of unit size
const TONGUES = [
  [0, 0, 0.30, 0.95], [0.13, 0.05, 0.24, 0.66], [-0.12, 0.08, 0.24, 0.72], [0.04, -0.14, 0.22, 0.6],
  [-0.06, -0.04, 0.2, 0.8], [0.16, -0.08, 0.16, 0.45], [-0.17, -0.1, 0.16, 0.5],
];

export function createFlames(size = 1, count = TONGUES.length) {
  const n = count + 1; // the tongues plus one halo
  const pos = new Float32Array(n * 12), lay = new Float32Array(n * 16), misc = new Float32Array(n * 8), idx = new Uint16Array(n * 6);
  for (let i = 0; i < n; i++) {
    const halo = i === count, t = halo ? [0, 0, 1.25, 1.25] : TONGUES[i];
    for (let v = 0; v < 4; v++) {
      const k = i * 4 + v;
      pos.set([v & 1 ? 1 : -1, v & 2 ? 1 : 0, 0], k * 3);
      lay.set([t[0] * size, t[1] * size, t[2] * size * (halo ? 1 : 1.15), t[3] * size], k * 4);
      misc.set([i * 0.37 + 0.11, halo ? 1 : 0], k * 2);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLayer', new THREE.BufferAttribute(lay, 4));
  geo.setAttribute('aMisc', new THREE.BufferAttribute(misc, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, size * 0.5, 0), size * 1.6); // billboards stay inside this
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uWind: WIND },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    // Additive light; the picture's alpha is left alone, so the finishing pass (src/finish.js) blooms the
    // fire only where its light runs past white, not across its whole soft halo.
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 2; mesh.frustumCulled = true;
  return mesh;
}
