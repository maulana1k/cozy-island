import * as THREE from 'three';
import { skyColors, sunDirection, nightFactor } from '../logic/dayCycle.js';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';
import './toon.js'; // gentle cel shading and aerial haze for every lit material: must run before anything compiles
import { markGlow } from '../finish.js';
import { createSkyFx, NOISE_GLSL } from './skyFx.js';

const SUN_SCALE = 1.0;
const AMBIENT_SCALE = 1.25;
const FOG_DENSITY = 0.0064; // aerial perspective: the near ground stays vivid, far hills fade into soft haze
const WEATHER_FOG = 0.0046; // the step weather adds per unit of fog or rain (kept from before the haze, so fog and rain look as they did)
// Shadows are drawn only near the player, where you can see them, so the map's texels stay small and
// edges stay smooth. SHADOW_TEXELS is the map size; one texel is 2 * SHADOW_HALF / SHADOW_TEXELS metres.
const SHADOW_HALF = 30, SHADOW_TEXELS = 4096;

function buildDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
      uDeck: { value: 0 }, uDeckLight: { value: new THREE.Color() }, uDeckDark: { value: new THREE.Color() }, uDeckOff: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uFog; varying vec3 vDir;
      uniform float uDeck; uniform vec3 uDeckLight, uDeckDark; uniform vec2 uDeckOff;
      ${NOISE_GLSL}
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        // A broad pale band low down, the deep zenith colour only high overhead; below the horizon the haze.
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 1.0, pow(h, 0.62)));
        // Overcast (rain, fog, heavy cloud): a grey deck of soft, slightly stepped bands drifting with the wind.
        if (uDeck > 0.01) {
          vec2 p = vDir.xz / (max(vDir.y, 0.0) + 0.14) * 1.4 + uDeckOff;
          float n = skyFbm(p);
          n = mix(n, floor(n * 5.0 + 0.5) / 5.0, 0.45);
          float cover = clamp(uDeck * 1.25 - 0.45 + n * 0.9 * (1.0 - uDeck * 0.4), 0.0, 1.0) * smoothstep(-0.02, 0.12, vDir.y);
          col = mix(col, mix(uDeckDark, uDeckLight, smoothstep(0.25, 0.75, n)), cover);
        }
        col = mix(uFog, col, smoothstep(-0.02, 0.08, vDir.y));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  dome.renderOrder = -10;
  return dome;
}

// Far ridges: a few spans of distant hills on the sea horizon, in two layers - the nearer a little
// deeper blue, the further paler - each fading into the haze at its foot (The Trail's stepped, paper-cut
// distance). One mesh, one draw call; it follows the player like the clouds and takes its colours from the
// sky of the hour in update(), so it goes lavender at dusk, dark at night and vanishes in fog and rain.
function buildRidges(rng) {
  const pos = [], aux = [], idx = [];
  const span = (layer, a0, a1, R, hMin, hMax) => {
    // A handful of peaks joined by straight runs: an angular silhouette with flat facets.
    const cols = Math.max(4, Math.round((a1 - a0) * R / 22)), first = pos.length / 3;
    let peak = hMin + rng() * (hMax - hMin);
    for (let i = 0; i <= cols; i++) {
      const f = i / cols, a = a0 + (a1 - a0) * f, end = Math.min(f, 1 - f);
      if (i % 3 === 0) peak = hMin + rng() * (hMax - hMin);
      const h = Math.max(4, peak * Math.min(1, end * 5) * (0.75 + 0.25 * rng()));
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      pos.push(x, -12, z, x, h, z);
      aux.push(layer, 0, layer, 1);
      if (i) { const o = first + (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
  };
  // Far layer first (behind), then the nearer one over it.
  for (let n = 0; n < 4; n++) { const a = n * 1.6 + rng() * 0.6; span(1, a, a + 0.7 + rng() * 0.6, 680, 30, 72); }
  for (let n = 0; n < 4; n++) { const a = n * 1.6 + 0.7 + rng() * 0.5; span(0, a, a + 0.4 + rng() * 0.45, 600, 16, 42); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aRidge', new THREE.Float32BufferAttribute(aux, 2));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, depthWrite: false, fog: false,
    uniforms: { uFog: { value: new THREE.Color() }, uNear: { value: new THREE.Color() }, uFar: { value: new THREE.Color() }, uShow: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec2 aRidge; varying vec2 vR;
      void main() { vR = aRidge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog; uniform vec3 uNear; uniform vec3 uFar; uniform float uShow; varying vec2 vR;
      void main() {
        vec3 col = mix(uNear, uFar, vR.x);
        // Misty at the foot, the silhouette's colour from about a third of the way up.
        col = mix(uFog, col, smoothstep(0.08, 0.4, vR.y) * uShow);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -7.5; // after the clouds (which write depth), so a ridge hides a tower cloud standing behind it
  mesh.frustumCulled = false;
  return mesh;
}

function buildDisc(color, size) {
  const mat = new THREE.MeshBasicMaterial({ color, fog: false, depthWrite: false, transparent: true });
  const m = new THREE.Mesh(new THREE.CircleGeometry(size, 24), mat);
  m.renderOrder = -9;
  return m;
}

export function createSky(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false; // main.js asks for a fresh one when it is due
  renderer.shadowMap.type = THREE.PCFShadowMap; // (PCFSoftShadowMap blanks the ground in this three.js build)
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const dome = buildDome();
  const ridges = buildRidges(createRng(SEED + 12));
  const sunDisc = buildDisc(0xfff2c8, 34);
  sunDisc.name = 'sunDisc'; // src/sunfx.js reshapes it by the sun's height on Graphics: High (after update())
  markGlow(sunDisc.material, 0); // glows low in the sky (Graphics: High, src/finish.js)
  const moonDisc = buildDisc(0xeef2ff, 20);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(SHADOW_TEXELS, SHADOW_TEXELS);
  const cam = sunLight.shadow.camera;
  cam.left = -SHADOW_HALF; cam.right = SHADOW_HALF; cam.top = SHADOW_HALF; cam.bottom = -SHADOW_HALF;
  cam.near = 1; cam.far = 260;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.018; // about one texel: enough against acne without lifting shadows off their feet
  sunLight.shadow.radius = 2.5; // a soft edge a few centimetres wide (PCF taps spread this many texels; toon.js keeps it from going mushy)
  if ('intensity' in sunLight.shadow) sunLight.shadow.intensity = 0.75; // one even shadow tone everywhere

  const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  scene.fog = new THREE.FogExp2(0xffffff, FOG_DENSITY);
  const skyFx = createSkyFx(scene, renderer); // clouds, cirrus, stars, Milky Way (src/world/skyFx.js)
  scene.add(dome, ridges, sunDisc, moonDisc, sunLight, sunLight.target, ambient);

  const tmp = new THREE.Color();
  const deckOff = new THREE.Vector2();
  const waterLight = new THREE.Color();
  const fogColor = new THREE.Color();
  const dir = new THREE.Vector3(), snapRight = new THREE.Vector3(), snapUp = new THREE.Vector3();
  let lastElapsed = 0;

  return {
    sunLight,
    waterLight,
    fogColor,
    fogDensity: FOG_DENSITY,
    skyFx,
    update(t, elapsed, focus, wx) {
      const cloudDt = Math.min(0.1, Math.max(0, elapsed - lastElapsed)); lastElapsed = elapsed;
      const c = skyColors(t);
      const night = nightFactor(t);
      dome.material.uniforms.uTop.value.setHex(c.top);
      dome.material.uniforms.uHorizon.value.setHex(c.horizon);
      fogColor.setHex(c.fog);
      dome.material.uniforms.uFog.value.copy(fogColor);
      scene.fog.color.copy(fogColor);
      if (scene.background) scene.background.copy(fogColor);

      // The one shadow-casting light is the sun by day and a dim moon at night.
      const s = sunDirection(t);
      const sunUp = s.y > 0;
      if (sunUp) dir.set(s.x, s.y, s.z); else dir.set(-s.x, -s.y, s.z).normalize();
      // Keep the light from going fully horizontal so shadows never streak across the island.
      if (dir.y < 0.22) { dir.y = 0.22; dir.normalize(); }
      // Follow the player, but only in whole shadow-map texels as seen from the sun, so shadow edges
      // stay still instead of crawling and shimmering as you walk or turn.
      let fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
      {
        const texel = (2 * SHADOW_HALF) / sunLight.shadow.mapSize.x; // Graphics Low uses a smaller map (main.js)
        snapRight.set(dir.z, 0, -dir.x); if (snapRight.lengthSq() < 1e-6) snapRight.set(1, 0, 0); snapRight.normalize();
        snapUp.crossVectors(dir, snapRight).normalize();
        const r = Math.round((fx * snapRight.x + fz * snapRight.z) / texel) * texel, u = Math.round((fx * snapUp.x + fz * snapUp.z) / texel) * texel;
        // Back to the ground plane: solve for the point whose light-space coordinates are (r, u).
        const a = snapRight.x, b = snapRight.z, c = snapUp.x, d = snapUp.z, det = a * d - b * c;
        if (Math.abs(det) > 1e-4) { fx = (r * d - b * u) / det; fz = (a * u - r * c) / det; }
      }
      sunLight.target.position.set(fx, 0, fz);
      sunLight.position.set(fx + dir.x * 120, dir.y * 120, fz + dir.z * 120);
      sunLight.color.setHex(c.sun);
      sunLight.intensity = c.sunIntensity * SUN_SCALE;
      sunLight.shadow.intensity = 0.75 * (1 - 0.65 * night); // the moon's shadow fades so the fire's and lamps' read

      ambient.color.setHex(c.ambient);
      ambient.groundColor.setHex(c.ground); // warm bounce from below
      ambient.intensity = c.ambientIntensity * AMBIENT_SCALE;

      sunDisc.position.set(s.x * 820, s.y * 820, s.z * 820);
      sunDisc.lookAt(0, 0, 0);
      sunDisc.material.color.setHex(c.sun).lerp(tmp.set(0xffffff), 0.45);
      sunDisc.material.opacity = THREE.MathUtils.clamp(s.y * 6 + 0.6, 0, 1);
      sunDisc.material.blendAlpha = 1.4 * THREE.MathUtils.smoothstep(0.32 - s.y, 0, 0.27); // a warm glow round the sun near the horizon only
      moonDisc.position.set(-s.x * 820, -s.y * 820, s.z * 820);
      moonDisc.lookAt(0, 0, 0);
      moonDisc.material.opacity = THREE.MathUtils.clamp(-s.y * 6 + 0.2, 0, 1) * 0.95;

      // The far ridges: a step deeper than the haze toward the zenith's hue, the nearer layer more so.
      ridges.position.set(fx, 0, fz);
      const rU = ridges.material.uniforms;
      rU.uFog.value.copy(fogColor);
      rU.uNear.value.copy(fogColor).lerp(dome.material.uniforms.uTop.value, 0.34).multiplyScalar(0.93);
      rU.uFar.value.copy(fogColor).lerp(dome.material.uniforms.uTop.value, 0.17);
      rU.uShow.value = 1;

      // A single tint the water shader multiplies by, so the sea follows the time of day.
      waterLight.setHex(c.ambient).multiplyScalar(0.55 * c.ambientIntensity)
        .add(tmp.setHex(c.sun).multiplyScalar(0.19 * c.sunIntensity));

      // ---- WEATHER (multipliers on top of everything above; wx = the weather module's 0..1 values) ----
      if (wx) {
        const gloom = Math.min(1, wx.cloud * 0.55 + wx.rain * 0.6 + wx.fog * 0.25); // 0 clear .. 1 dark overcast
        const grey = Math.min(1, wx.cloud * 0.8 + wx.fog * 0.5), chill = Math.min(1, wx.cold * 0.7 + wx.rain * 0.3);
        const tone = (col, g, k) => { const l = col.r * 0.2126 + col.g * 0.7152 + col.b * 0.0722; return col.lerp(tmp.setRGB(l * 0.92, l * 0.99, l * 1.12), g).multiplyScalar(k); };
        tone(dome.material.uniforms.uTop.value, grey, 1 - 0.55 * wx.rain - 0.12 * wx.fog);
        tone(dome.material.uniforms.uHorizon.value, grey, 1 - 0.35 * wx.rain);
        tone(fogColor, Math.min(1, grey + wx.fog * 0.3), 1 - 0.3 * wx.rain - 0.04 * wx.fog);
        const fl = wx.flash || 0; // lightning: the whole sky blinks pale for a moment
        if (fl > 0) { tmp.setRGB(0.82, 0.88, 1); dome.material.uniforms.uTop.value.lerp(tmp, fl * 0.5); dome.material.uniforms.uHorizon.value.lerp(tmp, fl * 0.55); fogColor.lerp(tmp, fl * 0.5); }
        dome.material.uniforms.uFog.value.copy(fogColor); scene.fog.color.copy(fogColor); if (scene.background) scene.background.copy(fogColor);
        rU.uFog.value.copy(fogColor); rU.uShow.value = Math.max(0, 1 - wx.fog * 1.3 - wx.rain * 0.8 - wx.cloud * 0.3); // lost in fog and rain
        sunLight.intensity *= 1 - 0.78 * gloom; sunLight.shadow.intensity *= 1 - 0.8 * gloom;
        tone(sunLight.color, chill * 0.6, 1); tone(ambient.color, chill * 0.55, 1);
        ambient.intensity *= 1 - 0.2 * gloom + 0.12 * wx.rain; ambient.intensity += fl * 1.1; // the sky light stays up a little, so rain is dim, not black
        sunDisc.material.opacity *= 1 - 0.95 * Math.min(1, wx.cloud * 1.2); moonDisc.material.opacity *= 1 - 0.8 * wx.cloud;
        waterLight.multiplyScalar(1 - 0.45 * gloom);
        this.fogDensity = FOG_DENSITY + WEATHER_FOG * (wx.fog * 7 + wx.rain * 0.9);
        // (main.js reads fogDensity and thickens it among the big trees on top of this)
      }
      // The overcast deck in the dome, and the clouds and stars (they take the toned colours above).
      const dU = dome.material.uniforms, deck = wx ? Math.min(1, wx.rain * 1.1 + wx.fog * 0.55 + Math.max(0, wx.cloud - 0.55) * 1.4) : 0;
      dU.uDeck.value = deck;
      if (deck > 0.01) {
        const dim = 1 - night * 0.7;
        dU.uDeckLight.value.copy(fogColor).lerp(tmp.setRGB(0.72, 0.75, 0.8), 0.5).multiplyScalar(dim);
        dU.uDeckDark.value.copy(fogColor).lerp(tmp.setRGB(0.42, 0.45, 0.52), 0.6).multiplyScalar(dim);
        if (wx) { const v = cloudDt * (0.004 + wx.wind * 0.02); deckOff.x = (deckOff.x + wx.windX * v) % 1000; deckOff.y = (deckOff.y + wx.windZ * v) % 1000; }
        dU.uDeckOff.value.copy(deckOff);
      }
      skyFx.update({ dt: cloudDt, sun: s, night, c, wx, focus, horizon: dU.uHorizon.value, fog: fogColor });
    },
  };
}
