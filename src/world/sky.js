import * as THREE from 'three';
import { skyColors, sunDirection, nightFactor } from '../logic/dayCycle.js';
import { createRng } from '../logic/rng.js';
import { SEED } from '../config.js';

const SUN_SCALE = 1.0;
const AMBIENT_SCALE = 1.25;
const FOG_DENSITY = 0.0026;
const SHADOW_HALF = 42;

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
        vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
        col = mix(uFog, col, smoothstep(0.0, 0.10, vDir.y));
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

function buildClouds(rng) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, fog: false, transparent: true, opacity: 0.95 });
  const puff = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < puffs; j++) {
      const m = new THREE.Mesh(puff, mat);
      const s = 5 + rng() * 5;
      m.scale.set(s * 1.5, s * 0.6, s);
      m.position.set((j - puffs / 2) * 7 + rng() * 2, rng() * 2, rng() * 5 - 2.5);
      cloud.add(m);
    }
    const angle = rng() * Math.PI * 2, dist = 110 + rng() * 170;
    cloud.position.set(Math.cos(angle) * dist, 55 + rng() * 30, Math.sin(angle) * dist);
    cloud.userData.speed = 0.5 + rng() * 0.7;
    group.add(cloud);
  }
  return group;
}

function buildDisc(color, size) {
  const mat = new THREE.MeshBasicMaterial({ color, fog: false, depthWrite: false, transparent: true });
  const m = new THREE.Mesh(new THREE.CircleGeometry(size, 24), mat);
  m.renderOrder = -9;
  return m;
}

export function createSky(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
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
  sunLight.shadow.mapSize.set(2048, 2048);
  const cam = sunLight.shadow.camera;
  cam.left = -SHADOW_HALF; cam.right = SHADOW_HALF; cam.top = SHADOW_HALF; cam.bottom = -SHADOW_HALF;
  cam.near = 1; cam.far = 260;
  sunLight.shadow.bias = -0.0006;
  sunLight.shadow.normalBias = 0.06;
  sunLight.shadow.radius = 1; // a plain, clean-edged shadow

  const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  scene.fog = new THREE.FogExp2(0xffffff, FOG_DENSITY);
  scene.add(dome, stars, clouds, sunDisc, moonDisc, sunLight, sunLight.target, ambient);

  const tmp = new THREE.Color();
  const waterLight = new THREE.Color();
  const fogColor = new THREE.Color();
  const dir = new THREE.Vector3();
  let lastElapsed = 0;

  return {
    sunLight,
    waterLight,
    fogColor,
    fogDensity: FOG_DENSITY,
    update(t, elapsed, focus) {
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
      const fx = focus ? focus.x : 0, fz = focus ? focus.z : 0;
      sunLight.target.position.set(fx, 0, fz);
      sunLight.position.set(fx + dir.x * 120, dir.y * 120, fz + dir.z * 120);
      sunLight.color.setHex(c.sun);
      sunLight.intensity = c.sunIntensity * SUN_SCALE;

      ambient.color.setHex(c.ambient);
      ambient.groundColor.setHex(c.ambient).lerp(tmp.setHex(c.horizon), 0.5);
      ambient.intensity = c.ambientIntensity * AMBIENT_SCALE;

      sunDisc.position.set(s.x * 820, s.y * 820, s.z * 820);
      sunDisc.lookAt(0, 0, 0);
      sunDisc.material.color.setHex(c.sun).lerp(tmp.set(0xffffff), 0.45);
      sunDisc.material.opacity = THREE.MathUtils.clamp(s.y * 6 + 0.6, 0, 1);
      moonDisc.position.set(-s.x * 820, -s.y * 820, s.z * 820);
      moonDisc.lookAt(0, 0, 0);
      moonDisc.material.opacity = THREE.MathUtils.clamp(-s.y * 6 + 0.2, 0, 1) * 0.95;

      stars.material.opacity = night * 0.9;
      clouds.children.forEach((cloud) => {
        cloud.position.x += cloud.userData.speed * cloudDt;
        if (cloud.position.x > 300) cloud.position.x = -300;
      });
      clouds.children[0].children[0].material.emissive.setHex(c.horizon).multiplyScalar(0.25);

      // A single tint the water shader multiplies by, so the sea follows the time of day.
      waterLight.setHex(c.ambient).multiplyScalar(0.55 * c.ambientIntensity)
        .add(tmp.setHex(c.sun).multiplyScalar(0.19 * c.sunIntensity));
    },
  };
}
