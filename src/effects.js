// Small puffs of dust and spray kicked up by feet.
import * as THREE from 'three';

export function createEffects(scene) {
  const geo = new THREE.IcosahedronGeometry(0.11, 0);
  const live = [], spare = [];

  function puff(x, y, z, count = 1, color = 0xead9b0, spread = 0.2, lift = 0.5) {
    for (let i = 0; i < count; i++) {
      const m = spare.pop() || new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false }));
      m.material.color.setHex(color);
      m.position.set(x + (Math.random() - 0.5) * spread, y + 0.06, z + (Math.random() - 0.5) * spread);
      const a = Math.random() * Math.PI * 2, v = 0.3 + Math.random() * 0.7;
      m.userData = { vx: Math.cos(a) * v * spread * 3, vz: Math.sin(a) * v * spread * 3, vy: lift * (0.5 + Math.random() * 0.6), age: 0, life: 0.45 + Math.random() * 0.3, size: 0.6 + Math.random() * 0.7 };
      m.visible = true;
      if (!m.parent) scene.add(m);
      live.push(m);
    }
  }

  return {
    puff,
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const m = live[i], u = m.userData;
        u.age += dt;
        const t = u.age / u.life;
        if (t >= 1) { m.visible = false; live.splice(i, 1); spare.push(m); continue; }
        u.vy -= 0.9 * dt; u.vx *= 1 - Math.min(1, dt * 3); u.vz *= 1 - Math.min(1, dt * 3);
        m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.position.z += u.vz * dt;
        m.scale.setScalar(u.size * (0.5 + t * 1.3));
        m.material.opacity = 0.55 * (1 - t);
      }
    },
  };
}
