// Sunlight on the lens: works out each frame how strong the sun's glare, light shafts, ghosts and the golden-hour
// grade should be (drawn by src/finish.js on Graphics: High), and keeps a cheap additive halo sprite on the sun for
// Graphics: Low. Strongest at sunrise and sunset, gentle at midday, gone when the sun is down or the weather is
// thick; the moon gets at most a faint cool halo. The sun's disc sits at sunDirection(t) * 820 round the island's
// centre (src/world/sky.js), so its place on the picture is worked out from that same point.
import * as THREE from 'three';
import { sunDirection, skyColors, nightFactor } from './logic/dayCycle.js';

const DISC_AT = 820, DISC_R = 34; // the disc's distance and radius in sky.js
const smooth = THREE.MathUtils.smoothstep;
const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));

// 0..1, how golden the hour is: full from just before sunrise into the early morning and through the evening.
export function goldenHour(t) {
  const dawn = ramp(t, 0.085, 0.11) * (1 - ramp(t, 0.25, 0.33));
  const dusk = ramp(t, 0.66, 0.76) * (1 - ramp(t, 0.875, 0.9));
  return Math.max(dawn, dusk);
}

function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,236,200,0.9)'); r.addColorStop(0.18, 'rgba(255,214,160,0.45)'); r.addColorStop(0.5, 'rgba(255,180,120,0.12)'); r.addColorStop(1, 'rgba(255,160,110,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createSunFx(scene) {
  const sunPos = new THREE.Vector3(), moonPos = new THREE.Vector3(), trueDir = new THREE.Vector3();
  const v = new THREE.Vector3(), fwd = new THREE.Vector3(), to = new THREE.Vector3(), tmp = new THREE.Color();
  const pack = { on: false, uv: new THREE.Vector2(), radius: 0.02, tint: new THREE.Color(), glare: 0, shaft: 0, ghost: 0, streak: 0, veil: 0, grade: 0, dt: 0, fresh: true };
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  sprite.renderOrder = -8.9; sprite.scale.setScalar(300); sprite.visible = false; sprite.frustumCulled = false;
  scene.add(sprite);
  let wasOn = false;

  return {
    pack, trueDir,
    // How much the weather hides the sun (sunny 1, windy cloud about 0.6, fog and rain 0).
    clearness(wx) { return wx ? Math.max(0, 1 - wx.cloud * 0.9) * Math.max(0, 1 - wx.fog * 1.4) * Math.max(0, 1 - wx.rain * 1.6) : 1; },
    // t: time of day; wx: the weather module; high: Graphics High; lens: 1 normal, more through the digital camera.
    update(dt, camera, t, wx, high, lens = 1) {
      const s = sunDirection(t), night = nightFactor(t);
      trueDir.set(s.x, s.y, s.z);
      sunPos.set(s.x, s.y, s.z).multiplyScalar(DISC_AT); moonPos.set(-s.x, -s.y, s.z).multiplyScalar(DISC_AT);
      const clear = this.clearness(wx), gold = goldenHour(t);
      const up = smooth(s.y, -0.03, 0.05), moonUp = smooth(-s.y, 0.02, 0.15) * night;
      const moon = up < 0.01;
      const at = moon ? moonPos : sunPos;
      camera.getWorldDirection(fwd);
      const facing = to.copy(at).sub(camera.position).normalize().dot(fwd);
      v.copy(at).project(camera);
      const ok = facing > 0 && Number.isFinite(v.x);
      const e = Math.max(Math.abs(v.x), Math.abs(v.y)); // 1 = the picture's edge
      const near = ok ? smooth(-e, -1.7, -0.95) : 0, inView = ok ? smooth(-e, -1.12, -0.8) : 0;
      const c = skyColors(t);

      // Graphics: Low: the sprite halo only.
      sprite.visible = !high && up * clear > 0.02;
      if (sprite.visible) {
        sprite.position.copy(sunPos);
        sprite.material.color.setHex(c.sun);
        sprite.material.opacity = up * clear * (0.35 + 0.65 * gold);
        sprite.scale.setScalar(260 + 160 * gold);
      }

      pack.dt = dt; pack.fresh = !wasOn;
      pack.uv.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      pack.radius = DISC_R / DISC_AT / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 0.5;
      pack.grade = high ? gold * (0.35 + 0.65 * clear) * up * 0.85 : 0;
      if (moon) {
        const k = moonUp * Math.max(0, 1 - (wx ? wx.cloud : 0)) * near;
        pack.tint.setRGB(0.55, 0.65, 0.95);
        pack.glare = 0.14 * k; pack.shaft = 0; pack.ghost = 0; pack.streak = 0; pack.veil = 0; pack.grade = 0;
      } else {
        const k = up * clear;
        pack.tint.setHex(c.sun).lerp(tmp.setRGB(1, 0.62, 0.32), 0.55 * gold).lerp(tmp.setRGB(1, 0.97, 0.9), 0.4 * (1 - gold));
        const look = smooth(facing, 0.55, 1);
        pack.glare = k * (0.4 + 0.75 * gold) * look * Math.min(lens, 1.15);
        pack.shaft = k * (0.3 + 0.9 * gold) * near * smooth(facing, 0.2, 0.9);
        pack.ghost = k * gold * inView * look * 0.05 * lens * lens;
        pack.streak = k * (0.15 + 0.35 * gold) * inView * look * 0.35 * lens * lens;
        pack.veil = k * smooth(facing, 0.9, 1) * (0.03 + 0.04 * gold) * Math.min(lens, 1.2);
      }
      pack.on = high && (pack.glare > 0.003 || pack.shaft > 0.003 || pack.grade > 0.003);
      wasOn = pack.on;
      return pack;
    },
  };
}
