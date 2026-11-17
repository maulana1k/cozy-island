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
// Hook for later (cutscene depth of field, V6): useDepth(true) attaches a depth texture to the scene
// target (resolved from the multisampled depth every frame while on); an effect between the scene and the
// output can read target.texture and depthTexture. Nothing extra is drawn for it.
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
  const out = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: target.texture }, tBloom: { value: null }, uBloom: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; varying vec2 vUv;
      void main() {
        vec3 c = clamp(texture2D(tScene, vUv).rgb, 0.0, 1.0);
        if (uBloom > 0.0) { vec3 b = min(texture2D(tBloom, vUv).rgb * uBloom, 1.0); c = 1.0 - (1.0 - c) * (1.0 - b); } // screen: never past white
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), out); quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const finish = {
    bloom: true,          // the slow-frame ladder's last step switches it off
    target,
    get depthTexture() { return target.depthTexture; },
    useDepth(on) {
      if (!!target.depthTexture === on) return;
      target.depthTexture = on ? new THREE.DepthTexture(Math.max(1, size.x), Math.max(1, size.y)) : null;
      target.resolveDepthBuffer = on;
      target.dispose(); // rebuilt with the new attachments on next use
    },
    render(scene, camera) {
      renderer.getDrawingBufferSize(now);
      if (!now.equals(size)) { size.copy(now); target.setSize(size.x, size.y); glow.setSize(size.x, size.y); KEY.uniforms.uTexel.value.set(1 / size.x, 1 / size.y); }
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      if (finish.bloom) glow.run(renderer, target.texture);
      out.uniforms.uBloom.value = finish.bloom ? 1 : 0;
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
