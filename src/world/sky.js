import * as THREE from 'three';
import { skyColors, sunDirection, nightFactor } from '../logic/dayCycle.js';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';
import './toon.js'; // gentle cel shading and aerial haze for every lit material: must run before anything compiles

const SUN_SCALE = 1.0;
const AMBIENT_SCALE = 1.25;
const FOG_DENSITY = 0.006; // aerial perspective: the near ground stays vivid, far hills fade into soft haze
const WEATHER_FOG = 0.0046; // the step weather adds per unit of fog or rain (kept from before the haze, so fog and rain look as they did)
// Shadows are drawn only near the player, where you can see them, so the map's texels stay small and
// edges stay smooth. SHADOW_TEXELS is the map size; one texel is 2 * SHADOW_HALF / SHADOW_TEXELS metres.
const SHADOW_HALF = 30, SHADOW_TEXELS = 4096;

function buildDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uFog; varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        // A broad pale band low down, the deep zenith colour only high overhead; below the horizon the haze.
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 1.0, pow(h, 0.62)));
        col = mix(uFog, col, smoothstep(-0.02, 0.08, vDir.y));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  dome.renderOrder = -10;
  return dome;
}

function buildStars(rng) {
  const count = 320;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2, y = 0.12 + rng() * 0.88, r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * r * 850;
    positions[i * 3 + 1] = y * 850;
    positions[i * 3 + 2] = Math.sin(theta) * r * 850;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xfff6d8, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  return new THREE.Points(geo, mat);
}

// Flat, angular cut-paper clouds standing round the horizon: each a jagged pale slab with one darker
// facet tucked behind and below it. All of them are one mesh (one draw call) that follows the player and
// turns slowly; they take the light of the hour in update().
function buildClouds(rng) {
  const pos = [], col = [], idx = [];
  const white = new THREE.Color(0xffffff), under = new THREE.Color(0xc4d0e6);
  // An x-monotone slab from x0 to x1: a jagged top over a flatter, slanting bottom, as column quads.
  const slab = (place, x0, x1, base, height, cols, c, back) => {
    const first = pos.length / 3, slant = (rng() - 0.5) * 0.25 * height;
    for (let i = 0; i <= cols; i++) {
      const f = i / cols, x = x0 + (x1 - x0) * f, edge = i === 0 || i === cols;
      const top = base + height * (edge ? 0.12 + rng() * 0.2 : 0.45 + rng() * 0.55) * Math.sin(Math.PI * (0.15 + 0.7 * f));
      const bot = base + slant * (f - 0.5) + (edge ? height * 0.06 : -rng() * height * 0.08);
      place(x, Math.max(top, bot + 0.5), back); place(x, bot, back);
      for (let k = 0; k < 2; k++) col.push(c.r, c.g, c.b);
      if (i) { const o = first + (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3); }
    }
  };
  for (let n = 0; n < 16; n++) {
    const a = (n / 16) * Math.PI * 2 + (rng() - 0.5) * 0.3, R = 330 + rng() * 140, y0 = 70 + rng() * 90;
    const cx = Math.cos(a) * R, cz = Math.sin(a) * R, tx = -Math.sin(a), tz = Math.cos(a), nx = -Math.cos(a), nz = -Math.sin(a);
    const place = (x, y, back) => pos.push(cx + tx * x - nx * back, y0 + y, cz + tz * x - nz * back);
    const w = 50 + rng() * 80, h = 10 + rng() * 14;
    slab(place, -w / 2, w / 2, 0, h, 5 + Math.floor(rng() * 3), white, 0);
    const off = (rng() - 0.5) * w * 0.5, fw = w * (0.45 + rng() * 0.3);
    slab(place, off - fw / 2, off + fw / 2, -h * 0.28, h * 0.6, 3 + Math.floor(rng() * 2), under, 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false, transparent: true, opacity: 0.94 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -8;
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

  const rng = createRng(SEED + 11);
  const dome = buildDome();
  const stars = buildStars(rng);
  const clouds = buildClouds(rng);
  const sunDisc = buildDisc(0xfff2c8, 34);
  const moonDisc = buildDisc(0xeef2ff, 20);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(SHADOW_TEXELS, SHADOW_TEXELS);
  const cam = sunLight.shadow.camera;
  cam.left = -SHADOW_HALF; cam.right = SHADOW_HALF; cam.top = SHADOW_HALF; cam.bottom = -SHADOW_HALF;
  cam.near = 1; cam.far = 260;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.018; // about one texel: enough against acne without lifting shadows off their feet
  sunLight.shadow.radius = 1; // a clean edge, filtered a little so it is smooth rather than stair-stepped
  if ('intensity' in sunLight.shadow) sunLight.shadow.intensity = 0.75; // one even shadow tone everywhere

  const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  scene.fog = new THREE.FogExp2(0xffffff, FOG_DENSITY);
  scene.add(dome, stars, clouds, sunDisc, moonDisc, sunLight, sunLight.target, ambient);

  const tmp = new THREE.Color();
  const cloudTint = new THREE.Color();
  const waterLight = new THREE.Color();
  const fogColor = new THREE.Color();
  const dir = new THREE.Vector3(), snapRight = new THREE.Vector3(), snapUp = new THREE.Vector3();
  let lastElapsed = 0;

  return {
    sunLight,
    waterLight,
    fogColor,
    fogDensity: FOG_DENSITY,
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
        const texel = (2 * SHADOW_HALF) / SHADOW_TEXELS;
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
      moonDisc.position.set(-s.x * 820, -s.y * 820, s.z * 820);
      moonDisc.lookAt(0, 0, 0);
      moonDisc.material.opacity = THREE.MathUtils.clamp(-s.y * 6 + 0.2, 0, 1) * 0.95;

      stars.material.opacity = night * 0.9;
      // The clouds ring the player and drift slowly round; peach at golden hour, dim blue at night.
      clouds.position.set(fx, 0, fz);
      clouds.rotation.y += cloudDt * 0.004;
      cloudTint.setHex(c.horizon).lerp(tmp.setHex(c.sun), 0.35).lerp(tmp.set(0xffffff), 0.5 * (1 - night));
      clouds.material.color.copy(cloudTint).multiplyScalar(1 - night * 0.6);

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
        sunLight.intensity *= 1 - 0.78 * gloom; sunLight.shadow.intensity *= 1 - 0.8 * gloom;
        tone(sunLight.color, chill * 0.6, 1); tone(ambient.color, chill * 0.55, 1);
        ambient.intensity *= 1 - 0.2 * gloom + 0.12 * wx.rain; ambient.intensity += fl * 1.1; // the sky light stays up a little, so rain is dim, not black
        sunDisc.material.opacity *= 1 - 0.95 * Math.min(1, wx.cloud * 1.2); moonDisc.material.opacity *= 1 - 0.8 * wx.cloud; stars.material.opacity *= 1 - wx.cloud;
        clouds.material.color.lerp(tmp.setRGB(0.36, 0.4, 0.46).multiplyScalar(1 - night * 0.6), wx.rain * 0.9 + wx.cloud * 0.1);
        clouds.scale.set(1, 1 + wx.cloud * 0.4, 1); // clouds grow taller into an overcast
        waterLight.multiplyScalar(1 - 0.45 * gloom);
        this.fogDensity = FOG_DENSITY + WEATHER_FOG * (wx.fog * 7 + wx.rain * 0.9);
        // (main.js reads fogDensity and thickens it among the big trees on top of this)
      }
    },
  };
}
