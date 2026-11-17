// The finishing pass (Graphics: High): the scene is drawn into a multisampled half-float picture, then
// bright things get a soft glow (bloom) and the result goes to the screen.
//
// The picture in the target is exactly what the screen would get: every material tone-maps and encodes to
// sRGB itself, the same as drawing straight to the canvas (see `display` below), so with no glow the
// screen shows the same pixels as Graphics: Low. Two things carry the glow, neither visible on its own:
// - colour past white (> 1), which only additive light (the fire, sparks, fireflies) can reach, and is
//   clipped back to white on the screen;
// - alpha past 1, written by opaque lit materials in proportion to their emitted light (lamp glass, lit
//   windows, coals: src/world/ao.js) and by markGlow() materials (the torch and searchlight lenses, the
//   sun at dusk).
// The bloom (three's UnrealBloomPass mip blur) reads only those, so sunlit white walls never haze over.
//
// Depth of field (films only, V6): useDepth(true) attaches a depth texture to the scene target (resolved
// from the multisampled depth every frame while on). With `finish.dof = { dist, aperture }` set, the
// picture is blurred by distance from the focus at half size (two small passes: blur size per pixel, then
// a bokeh gather) and mixed in by the output pass. The scene is not drawn again for it.
// The digital camera (src/photo.js) uses it too, on High and on Low (`finish.lite`: no glow, a 14-tap gather):
// its `dof` may carry its own strength ({ far, near, max } in half-size pixels per 1000 of picture height) for a
// macro look close up, and `probeFocus` measures the distance under the focus brackets on the GPU (five depth
// samples packed into a 5x1 picture, read back without stalling), for its autofocus: `focusSamples`.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const BLOOM = { strength: 0.55, radius: 0.35, over: 0.3, glow: 0.9 }; // kept low: a glow, never a haze

// What feeds the bloom: colour past white plus the glow carried in alpha, averaged over 2x2 pixels as
// it is halved (so a small lamp does not flicker as it moves across pixels).
const KEY = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, luminosityThreshold: { value: 1 }, uTexel: { value: new THREE.Vector2() }, uOver: { value: BLOOM.over }, uGlow: { value: BLOOM.glow } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uOver; uniform float uGlow; varying vec2 vUv;
    vec3 key(vec2 uv) {
      vec4 t = texture2D(tDiffuse, uv);
      return min(max(t.rgb - 1.0, 0.0), 1.5) * uOver + clamp(t.rgb, 0.0, 1.0) * max(t.a - 1.15, 0.0) * uGlow; // the 0.15: faint additive layers (a fire's halo, a beam) add a little alpha that must not glow
    }
    void main() {
      vec2 o = uTexel * 0.5;
      gl_FragColor = vec4((key(vUv + vec2(-o.x, -o.y)) + key(vUv + vec2(o.x, -o.y)) + key(vUv + vec2(-o.x, o.y)) + key(vUv + o)) * 0.25, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});

// The bloom blur from three's addons, kept apart from the scene: the result stays in its own small target
// and is added in the output pass (not blended back into the multisampled scene target).
class Glow extends UnrealBloomPass {
  constructor() {
    super(new THREE.Vector2(256, 256), BLOOM.strength, BLOOM.radius, 1);
    this.materialHighPassFilter = KEY; this.highPassUniforms = KEY.uniforms;
  }
  get texture() { return this.renderTargetsHorizontal[0].texture; }
  run(renderer, input) {
    const oldClear = renderer.getClearColor(new THREE.Color()), oldAlpha = renderer.getClearAlpha(), oldAuto = renderer.autoClear;
    renderer.autoClear = false; renderer.setClearColor(this.clearColor, 0);
    const quad = this._fsQuad;
    KEY.uniforms.tDiffuse.value = input;
    quad.material = KEY; renderer.setRenderTarget(this.renderTargetBright); renderer.clear(); quad.render(renderer);
    let from = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const m = this.separableBlurMaterials[i]; quad.material = m;
      m.uniforms.colorTexture.value = from.texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]); renderer.clear(); quad.render(renderer);
      m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(this.renderTargetsVertical[i]); renderer.clear(); quad.render(renderer);
      from = this.renderTargetsVertical[i];
    }
    const c = this.compositeMaterial; quad.material = c;
    c.uniforms.bloomStrength.value = this.strength; c.uniforms.bloomRadius.value = this.radius; c.uniforms.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]); renderer.clear(); quad.render(renderer);
    renderer.setClearColor(oldClear, oldAlpha); renderer.autoClear = oldAuto;
  }
}

// A material that glows without changing how it looks: its alpha adds `amount` on top of the picture's
// (colour is drawn as usual; for an opaque material, its colour simply replaces what was behind).
// Call again to change the amount (e.g. a lens that is lit only at night).
export function markGlow(material, amount) {
  if (material.blending !== THREE.CustomBlending) {
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation; material.blendEquationAlpha = THREE.AddEquation;
    if (material.transparent) { material.blendSrc = THREE.SrcAlphaFactor; material.blendDst = THREE.OneMinusSrcAlphaFactor; } else { material.blendSrc = THREE.OneFactor; material.blendDst = THREE.ZeroFactor; }
    material.blendSrcAlpha = THREE.ConstantAlphaFactor; material.blendDstAlpha = THREE.OneFactor;
  }
  material.blendAlpha = amount; // alpha after = this * (the fragment's alpha) + what was there (1)
  return material;
}

// Depth of field. How big the blur is, in half-size pixels per 1000 pixels of picture height, for
// something infinitely far when the subject is 10 m away (near things blur faster, as with a real lens).
const DOF = { far: 6, near: 6, max: 9 };
const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// The blur size of a depth: negative in front of the focus, positive behind, in half-size pixels.
const COC_GLSL = /* glsl */`
  uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform float uFocus; uniform float uFarK; uniform float uNearK; uniform float uMax;
  float viewZ(vec2 uv) { float d = texture2D(tDepth, uv).x; return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
  float coc(vec2 uv) {
    float z = -viewZ(uv), c = 1.0 - uFocus / z;      // 0 at the focus, up to 1 far away, very negative close by
    c = c > 0.0 ? c * uFarK : c * uNearK;
    return clamp(c, -uMax, uMax);
  }`;
const dofUniforms = () => ({ tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uFocus: { value: 10 }, uFarK: { value: 1 }, uNearK: { value: 1 }, uMax: { value: 8 } });
// Pass 1, half size: colour (2x2 average) with the blur size in alpha.
const COC = new THREE.ShaderMaterial({
  uniforms: { tScene: { value: null }, uTexel: { value: new THREE.Vector2() }, ...dofUniforms() },
  vertexShader: QUAD_VS,
  fragmentShader: COC_GLSL + /* glsl */`
    uniform sampler2D tScene; uniform vec2 uTexel; varying vec2 vUv;
    void main() {
      vec2 o = uTexel * 0.5;
      vec3 c = (texture2D(tScene, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tScene, vUv + vec2(o.x, -o.y)).rgb + texture2D(tScene, vUv + vec2(-o.x, o.y)).rgb + texture2D(tScene, vUv + o).rgb) * 0.25;
      // the nearest of the four decides, so a sharp edge in front never goes soft
      float a = coc(vUv + vec2(-o.x, -o.y)), b = coc(vUv + vec2(o.x, -o.y)), d = coc(vUv + vec2(-o.x, o.y)), e = coc(vUv + o);
      gl_FragColor = vec4(min(c, vec3(1.6)), min(min(a, b), min(d, e)));
    }`,
  depthTest: false, depthWrite: false,
});
// Pass 2, half size: a round bokeh gather (golden-angle disc). A sample counts if its own blur reaches this
// pixel; things behind a sharper pixel may not spread over it (no halo of blurred background around a sharp
// leaf), things in front may (a blurred branch in the foreground spills over the subject, as a lens does).
const gather = (TAPS) => new THREE.ShaderMaterial({
  uniforms: { tCoc: { value: null }, uTexel: { value: new THREE.Vector2() }, uMax: { value: 8 } },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tCoc; uniform vec2 uTexel; uniform float uMax; varying vec2 vUv;
    void main() {
      vec4 c0 = texture2D(tCoc, vUv);
      float s0 = abs(c0.a);
      vec3 sum = c0.rgb; float w = 1.0, size = s0;
      for (int i = 0; i < ${TAPS}; i++) {
        float f = float(i);
        float r = sqrt((f + 0.5) / ${TAPS}.0) * uMax, a = f * 2.39996323;
        vec4 s = texture2D(tCoc, vUv + vec2(cos(a), sin(a)) * r * uTexel);
        float ss = abs(s.a);
        if (s.a > c0.a) ss = min(ss, s0 * 2.0);          // behind this pixel: limited to this pixel's own blur
        float k = clamp((ss - r + 1.2) / 1.2, 0.0, 1.0);  // reaches this far?
        sum += s.rgb * k; w += k; size += ss * k;
      }
      gl_FragColor = vec4(sum / w, size / w);
    }`,
  depthTest: false, depthWrite: false,
});
// 28 taps for films; 48 for the camera's wide macro blur (no gaps between taps); 14 on Low.
const GATHERS = { film: gather(28), big: gather(48), lite: gather(14) };
// The autofocus probe: the view distance at five points round the centre, log-packed into two bytes
// (0.05 m .. 1200 m), one pixel each.
const FOCUS_PTS = [[0.5, 0.5], [0.47, 0.5], [0.53, 0.5], [0.5, 0.46], [0.5, 0.54]];
const FOCUS = new THREE.ShaderMaterial({
  uniforms: { ...dofUniforms() },
  vertexShader: QUAD_VS,
  fragmentShader: COC_GLSL + /* glsl */`
    void main() {
      int i = int(gl_FragCoord.x);
      vec2 p = i == 0 ? vec2(${FOCUS_PTS[0]}) : i == 1 ? vec2(${FOCUS_PTS[1]}) : i == 2 ? vec2(${FOCUS_PTS[2]}) : i == 3 ? vec2(${FOCUS_PTS[3]}) : vec2(${FOCUS_PTS[4]});
      float z = clamp(-viewZ(p), 0.05, 1200.0), t = log(z / 0.05) / log(24000.0) * 65535.0;
      float hi = floor(t / 256.0), lo = t - hi * 256.0;
      gl_FragColor = vec4(hi / 255.0, lo / 255.0, 0.0, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
// Sun glare and light shafts (Graphics: High; src/sunfx.js works out the numbers each frame and hands them over
// as `finish.sun`). Everything here is drawn from the scene's depth, kept on High for this:
// - visibility: a 1x1 picture that counts how much of the sun's disc is open sky (13 depth taps), eased toward the
//   new value over a few frames so a leaf crossing the sun does not make the glare flicker;
// - shafts: at quarter size, open sky near the sun (depth = far) is the light, everything nearer is the shadow;
//   two radial blurs toward the sun's place on the picture stretch it into soft rays through gaps in trees and tents;
// - in the output pass: a warm halo round the disc, a faint streak, a few soft ghost discs and hexes on the line from
//   the sun through the centre, a little veiling glare, and the golden-hour grade. All scaled by the visibility.
const SKY_GLSL = /* glsl */`
  uniform sampler2D tDepth; uniform float uNear; uniform float uFar;
  float skyAt(vec2 uv) { float d = texture2D(tDepth, clamp(uv, 0.001, 0.999)).x; float z = (uNear * uFar) / (uFar - (uFar - uNear) * d); return step(uFar * 0.9, z); }`;
const skyUniforms = () => ({ tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1000 } });
const VIS = new THREE.ShaderMaterial({
  uniforms: { ...skyUniforms(), tPrev: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uR: { value: 0.02 }, uEase: { value: 1 } },
  vertexShader: QUAD_VS,
  fragmentShader: SKY_GLSL + /* glsl */`
    uniform sampler2D tPrev; uniform vec2 uSun; uniform float uAspect; uniform float uR; uniform float uEase;
    void main() {
      float s = skyAt(uSun);
      for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236, r = uR * (i < 6 ? 0.5 : 1.0); s += skyAt(uSun + vec2(cos(a) / uAspect, sin(a)) * r); }
      gl_FragColor = vec4(vec3(mix(texture2D(tPrev, vec2(0.5)).r, s / 13.0, uEase)), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
// Quarter size: open sky, brightest close to the sun, averaged over a 2x2 of full-size depth taps.
const SHAFT_SRC = new THREE.ShaderMaterial({
  uniforms: { ...skyUniforms(), uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uTexel: { value: new THREE.Vector2() } },
  vertexShader: QUAD_VS,
  fragmentShader: SKY_GLSL + /* glsl */`
    uniform vec2 uSun; uniform float uAspect; uniform vec2 uTexel; varying vec2 vUv;
    void main() {
      vec2 o = uTexel * 1.5;
      float s = (skyAt(vUv + vec2(-o.x, -o.y)) + skyAt(vUv + vec2(o.x, -o.y)) + skyAt(vUv + vec2(-o.x, o.y)) + skyAt(vUv + o)) * 0.25;
      float r = length((vUv - uSun) * vec2(uAspect, 1.0));
      gl_FragColor = vec4(vec3(s * (exp(-r * r * 9.0) * 0.8 + exp(-r * 2.6) * 0.2)), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
// The radial blur toward the sun, with a jittered start (the second, shorter pass smooths the grain).
const shaftBlur = (TAPS) => new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uLen: { value: 0.9 }, uDecay: { value: 0.96 } },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tSrc; uniform vec2 uSun; uniform float uLen; uniform float uDecay; varying vec2 vUv;
    void main() {
      vec2 step = (uSun - vUv) * uLen / ${TAPS}.0;
      float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec2 p = vUv + step * j; float w = 1.0, sum = 0.0, ws = 0.0;
      for (int i = 0; i < ${TAPS}; i++) { sum += texture2D(tSrc, p).r * w; ws += w; w *= uDecay; p += step; }
      gl_FragColor = vec4(vec3(sum / ws), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const SHAFTS = [shaftBlur(28), shaftBlur(10)];
// The output pass's sun part: grade, shafts, halo, streak, ghosts, veil.
const SUN_GLSL = /* glsl */`
  uniform float uSunOn; uniform vec2 uSunUv; uniform float uSunAspect; uniform vec3 uSunTint; uniform sampler2D tVis; uniform sampler2D tShaft;
  uniform float uGlare; uniform float uShaft; uniform float uGhost; uniform float uStreak; uniform float uVeil; uniform float uGrade; uniform float uCore; uniform float uStar;
  float hexd(vec2 q) { q = abs(q); return max(q.x * 0.866 + q.y * 0.5, q.y); }
  vec3 sunFx(vec3 c) {
    // Golden hour: warmer, a touch of pink in the shade, the lightest tones a little creamier.
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 g = c * vec3(1.05, 0.985, 0.9) + vec3(0.05, 0.012, 0.03) * (1.0 - l) * (1.0 - l);
    c = mix(c, g, uGrade);
    // ...and the open sky richer: more saturated, a touch deeper overhead, hotter low down near the sun.
    if (uGrade > 0.0 && -viewZ(vUv) > uFar * 0.9) {
      float sl = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 sat = clamp(mix(vec3(sl), c, 1.0 + 0.9 * uGrade), 0.0, 1.0);
      c = mix(c, sat * (0.82 + 0.3 * smoothstep(0.3, 0.8, sl)), uGrade); // mid and dark sky deeper, the glow round the sun stays bright
    }
    float vis = texture2D(tVis, vec2(0.5)).r;
    vec2 d = (vUv - uSunUv) * vec2(uSunAspect, 1.0); float r = length(d);
    vec3 add = uSunTint * texture2D(tShaft, vUv).r * uShaft;
    add += uSunTint * vis * uGlare * (exp(-r * r * 90.0) * 0.55 + exp(-r * 6.5) * 0.3 + exp(-r * 1.8) * 0.1);
    // the high sun: white-hot core (no edge) and a faint six-point starburst
    add += mix(vec3(1.0), uSunTint, 0.2) * vis * uCore * (exp(-r * r * 260.0) + exp(-r * r * 40.0) * 0.3);
    if (uStar > 0.0) { float a = atan(d.y, d.x); add += uSunTint * vis * uStar * (pow(abs(cos(a * 3.0)), 60.0) + 0.5 * pow(abs(cos(a * 3.0 + 0.5236)), 90.0)) * exp(-r * 3.5); }
    add += uSunTint * vis * uStreak * exp(-(vUv.y - uSunUv.y) * (vUv.y - uSunUv.y) * 9000.0) * exp(-abs(d.x) * 2.2);
    if (uGhost > 0.0) {
      vec2 axis = vec2(0.5) - uSunUv;
      for (int i = 0; i < 5; i++) {
        float f = i == 0 ? 0.45 : i == 1 ? 0.8 : i == 2 ? 1.2 : i == 3 ? 1.55 : 1.95;
        float sz = i == 0 ? 0.035 : i == 1 ? 0.07 : i == 2 ? 0.045 : i == 3 ? 0.11 : 0.06;
        vec3 tint = i == 0 ? vec3(1.0, 0.75, 0.5) : i == 1 ? vec3(1.0, 0.6, 0.62) : i == 2 ? vec3(0.95, 0.85, 0.55) : i == 3 ? vec3(0.8, 0.7, 0.9) : vec3(1.0, 0.8, 0.6);
        vec2 q = (vUv - (uSunUv + axis * f)) * vec2(uSunAspect, 1.0);
        float dist = (i == 1 || i == 3) ? hexd(q) : length(q);
        add += tint * smoothstep(sz, sz * 0.55, dist) * (0.55 + 0.45 * smoothstep(sz * 0.4, sz, dist)) * uGhost * vis * (i == 3 ? 0.6 : 1.0);
      }
    }
    c = 1.0 - (1.0 - c) * (1.0 - min(add, 1.0)); // screen: never past white
    return c + (1.0 - c) * uSunTint * uVeil * vis;
  }`;
const sunUniforms = () => ({ uSunOn: { value: 0 }, uSunUv: { value: new THREE.Vector2() }, uSunAspect: { value: 1 }, uSunTint: { value: new THREE.Color() }, tVis: { value: null }, tShaft: { value: null }, uGlare: { value: 0 }, uShaft: { value: 0 }, uGhost: { value: 0 }, uStreak: { value: 0 }, uVeil: { value: 0 }, uGrade: { value: 0 }, uCore: { value: 0 }, uStar: { value: 0 } });

export function createFinish(renderer) {
  const size = new THREE.Vector2(-1, -1), now = new THREE.Vector2();
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true, stencilBuffer: false, resolveDepthBuffer: false });
  // Display-referred: three tone-maps and sRGB-encodes per material only when drawing to the canvas or to
  // an XR target, so the scene target says it is one (with an sRGB texture). Nothing else in three's WebGL
  // renderer treats the flag differently (0.187). The output pass then just copies, so tone mapping and
  // sRGB are applied exactly once, by the materials, as when drawing straight to the screen.
  target.texture.colorSpace = THREE.SRGBColorSpace;
  target.isXRRenderTarget = true;
  const glow = new Glow();
  const half = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const cocTarget = half(), blurTarget = half();
  const out = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: target.texture }, tBloom: { value: null }, uBloom: { value: 0 }, tBlur: { value: blurTarget.texture }, uDof: { value: 0 }, ...dofUniforms(), ...sunUniforms() },
    vertexShader: QUAD_VS,
    fragmentShader: COC_GLSL + /* glsl */`
      uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform sampler2D tBlur; uniform float uDof; varying vec2 vUv;` + SUN_GLSL + /* glsl */`
      void main() {
        vec3 c = clamp(texture2D(tScene, vUv).rgb, 0.0, 1.0);
        if (uDof > 0.0) {
          vec4 b = texture2D(tBlur, vUv);
          float k = smoothstep(0.4, 1.6, max(abs(coc(vUv)), b.a)); // sharp where in focus, at full size
          c = mix(c, clamp(b.rgb, 0.0, 1.0), k);
        }
        if (uBloom > 0.0) { vec3 b = min(texture2D(tBloom, vUv).rgb * uBloom, 1.0); c = 1.0 - (1.0 - c) * (1.0 - b); } // screen: never past white
        if (uSunOn > 0.0) c = sunFx(c);
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), out); quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); fsQuad.frustumCulled = false;
  const fsScene = new THREE.Scene(); fsScene.add(fsQuad);
  const pass = (material, to) => { fsQuad.material = material; renderer.setRenderTarget(to); renderer.render(fsScene, quadCam); };
  function setDof(u, camera, dof, h) {
    u.tDepth.value = target.depthTexture; u.uNear.value = camera.near; u.uFar.value = camera.far; u.uFocus.value = dof.dist;
    if (dof.far !== undefined) { const k = h / 1000; u.uFarK.value = dof.far * k; u.uNearK.value = dof.near * k; u.uMax.value = dof.max * k; return; } // the camera's own strength
    const k = h / 1000 * dof.aperture * (10 / Math.max(3, dof.dist)) ** 0.35; // close-ups blur the background a little more
    u.uFarK.value = DOF.far * k; u.uNearK.value = DOF.near * k * 0.35; u.uMax.value = DOF.max * h / 1000;
  }
  const focusTarget = new THREE.WebGLRenderTarget(FOCUS_PTS.length, 1, { type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false });
  const focusBytes = new Uint8Array(FOCUS_PTS.length * 4);
  let focusReading = false;
  // The sun's targets: quarter-size shaft pictures and two 1x1 visibility pictures used in turn (last frame's is read).
  const quarter = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const shaftA = quarter(), shaftB = quarter();
  const vis = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false }));
  let visI = 0, userDepth = false, keepDepth = false;
  function syncDepth() {
    const on = userDepth || keepDepth;
    if (!!target.depthTexture === on) return;
    target.depthTexture = on ? new THREE.DepthTexture(Math.max(1, size.x), Math.max(1, size.y)) : null;
    target.resolveDepthBuffer = on;
    target.dispose(); // rebuilt with the new attachments on next use
  }
  const sunU = out.uniforms;
  function drawSun(sun, camera) {
    const on = !!(sun && sun.on && target.depthTexture && !finish.lite);
    sunU.uSunOn.value = on ? 1 : 0;
    if (!on) return;
    const aspect = size.x / Math.max(1, size.y);
    for (const m of [VIS, SHAFT_SRC]) { const u = m.uniforms; u.tDepth.value = target.depthTexture; u.uNear.value = camera.near; u.uFar.value = camera.far; u.uSun.value.copy(sun.uv); u.uAspect.value = aspect; }
    // how much of the disc is open sky, eased (about 0.12 s)
    VIS.uniforms.uR.value = sun.radius; VIS.uniforms.tPrev.value = vis[visI].texture; VIS.uniforms.uEase.value = sun.fresh ? 1 : 1 - Math.exp(-sun.dt * 8);
    visI ^= 1; pass(VIS, vis[visI]);
    sunU.tVis.value = vis[visI].texture;
    if (sun.shaft > 0.002) {
      pass(SHAFT_SRC, shaftA);
      const [a, b] = SHAFTS;
      a.uniforms.tSrc.value = shaftA.texture; a.uniforms.uSun.value.copy(sun.uv); a.uniforms.uLen.value = 0.85; a.uniforms.uDecay.value = 0.97; pass(a, shaftB);
      b.uniforms.tSrc.value = shaftB.texture; b.uniforms.uSun.value.copy(sun.uv); b.uniforms.uLen.value = 0.12; b.uniforms.uDecay.value = 1; pass(b, shaftA);
    }
    sunU.tShaft.value = shaftA.texture; sunU.tDepth.value = target.depthTexture; sunU.uNear.value = camera.near; sunU.uFar.value = camera.far;
    sunU.uSunUv.value.copy(sun.uv); sunU.uSunAspect.value = aspect; sunU.uSunTint.value.copy(sun.tint);
    sunU.uGlare.value = sun.glare; sunU.uShaft.value = sun.shaft > 0.002 ? sun.shaft : 0; sunU.uGhost.value = sun.ghost; sunU.uStreak.value = sun.streak; sunU.uVeil.value = sun.veil; sunU.uGrade.value = sun.grade; sunU.uCore.value = sun.core; sunU.uStar.value = sun.star;
  }

  const finish = {
    bloom: true,          // the slow-frame ladder's last step switches it off
    dof: null,            // { dist, aperture } during a film on High, or the camera's { dist, far, near, max, taps } (needs useDepth(true)); null = off
    lite: false,          // Graphics Low drawing through here for the camera: no glow, a cheaper gather
    probeFocus: false,    // measure the distances under the camera's focus brackets (needs useDepth(true))
    focusSamples: new Float32Array(FOCUS_PTS.length), // metres: centre, left, right, up, down (a frame or two old)
    focusAt: 0,           // performance.now() of the last reading
    target,
    get depthTexture() { return target.depthTexture; },
    sun: null,            // the sun's glare and shafts (src/sunfx.js), High only; null = off
    useDepth(on) { userDepth = on; syncDepth(); },
    keepDepth(on) { keepDepth = on; syncDepth(); }, // on High the depth stays on for the sun's shafts and glare

    render(scene, camera) {
      renderer.getDrawingBufferSize(now);
      if (!now.equals(size)) {
        size.copy(now); target.setSize(size.x, size.y); glow.setSize(size.x, size.y); KEY.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
        const hw = Math.max(1, size.x >> 1), hh = Math.max(1, size.y >> 1);
        cocTarget.setSize(hw, hh); blurTarget.setSize(hw, hh);
        COC.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
        const qw = Math.max(1, size.x >> 2), qh = Math.max(1, size.y >> 2);
        shaftA.setSize(qw, qh); shaftB.setSize(qw, qh); SHAFT_SRC.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
      }
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const dof = finish.dof && target.depthTexture ? finish.dof : null;
      out.uniforms.uDof.value = dof ? 1 : 0;
      if (dof) {
        const hh = Math.max(1, size.y >> 1);
        setDof(COC.uniforms, camera, dof, hh); setDof(out.uniforms, camera, dof, hh);
        COC.uniforms.tScene.value = target.texture; pass(COC, cocTarget);
        const G = finish.lite ? GATHERS.lite : dof.taps === 'big' ? GATHERS.big : GATHERS.film;
        G.uniforms.tCoc.value = cocTarget.texture; G.uniforms.uTexel.value.set(1 / Math.max(1, size.x >> 1), 1 / hh); G.uniforms.uMax.value = COC.uniforms.uMax.value; pass(G, blurTarget);
      }
      if (finish.probeFocus && target.depthTexture && !focusReading && renderer.readRenderTargetPixelsAsync) {
        const u = FOCUS.uniforms; u.tDepth.value = target.depthTexture; u.uNear.value = camera.near; u.uFar.value = camera.far;
        pass(FOCUS, focusTarget);
        focusReading = true;
        renderer.readRenderTargetPixelsAsync(focusTarget, 0, 0, FOCUS_PTS.length, 1, focusBytes).then(() => {
          for (let i = 0; i < FOCUS_PTS.length; i++) finish.focusSamples[i] = 0.05 * Math.exp((focusBytes[i * 4] * 256 + focusBytes[i * 4 + 1]) / 65535 * Math.log(24000));
          finish.focusAt = performance.now();
        }).catch(() => { finish.probeFocus = false; }).finally(() => { focusReading = false; });
      }
      drawSun(finish.sun, camera);
      const bloom = finish.bloom && !finish.lite;
      if (bloom) glow.run(renderer, target.texture);
      out.uniforms.uBloom.value = bloom ? 1 : 0;
      out.uniforms.tBloom.value = glow.texture;
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
    },
    // Debug and tuning: how much of the picture would glow (share of pixels whose key passes `min`), read
    // back from the scene target. Slow (reads the whole picture); for tools only.
    measure(min = 0.02) {
      const w = size.x, h = size.y, px = new Uint16Array(w * h * 4);
      renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
      let over = 0, glowing = 0, maxRgb = 0, maxA = 0;
      for (let i = 0; i < w * h; i++) {
        const r = THREE.DataUtils.fromHalfFloat(px[i * 4]), g = THREE.DataUtils.fromHalfFloat(px[i * 4 + 1]), b = THREE.DataUtils.fromHalfFloat(px[i * 4 + 2]), a = THREE.DataUtils.fromHalfFloat(px[i * 4 + 3]);
        const m = Math.max(r, g, b); maxRgb = Math.max(maxRgb, m); maxA = Math.max(maxA, a);
        if (m - 1 > min) over++;
        if (a - 1 > min) glowing++;
      }
      return { over: over / (w * h), glowing: glowing / (w * h), maxRgb, maxA, w, h };
    },
  };
  return finish;
}
