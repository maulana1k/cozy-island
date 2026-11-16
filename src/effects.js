// What feet do to the ground: dust, flying grass, mud splats, ripples and footprints.
import * as THREE from 'three';

const PRINTS = 70;

export function createEffects(scene, groundAt) {
  const puffGeo = new THREE.IcosahedronGeometry(0.11, 0);
  const fleckGeo = new THREE.BoxGeometry(0.035, 0.2, 0.012);
  const ringGeo = new THREE.RingGeometry(0.82, 1, 28); ringGeo.rotateX(-Math.PI / 2);
  const printGeo = new THREE.CircleGeometry(1, 10); printGeo.rotateX(-Math.PI / 2);
  const live = [];
  const spare = { puff: [], fleck: [], ring: [] };

  function spawn(kind, geo) {
    const m = spare[kind].pop() || new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = true; m.scale.set(1, 1, 1); m.rotation.set(0, 0, 0);
    if (!m.parent) scene.add(m);
    live.push(m);
    return m;
  }

  // Soft round puffs: dust, sand, spray.
  function puff(x, y, z, count = 1, color = 0xead9b0, spread = 0.2, lift = 0.5) {
    for (let i = 0; i < count; i++) {
      const m = spawn('puff', puffGeo);
      m.material.color.setHex(color);
      m.position.set(x + (Math.random() - 0.5) * spread, y + 0.06, z + (Math.random() - 0.5) * spread);
      const a = Math.random() * Math.PI * 2, v = 0.3 + Math.random() * 0.7;
      m.userData = { kind: 'puff', vx: Math.cos(a) * v * spread * 3, vz: Math.sin(a) * v * spread * 3, vy: lift * (0.5 + Math.random() * 0.6), g: 0.9, age: 0, life: 0.45 + Math.random() * 0.3, size: 0.6 + Math.random() * 0.7, alpha: 0.55 };
    }
  }
  // Small bits thrown up and back: blades of grass, leaves, grit, mud.
  function flecks(x, y, z, count, colors, power = 1) {
    for (let i = 0; i < count; i++) {
      const m = spawn('fleck', fleckGeo);
      m.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
      m.position.set(x + (Math.random() - 0.5) * 0.25, y + 0.1, z + (Math.random() - 0.5) * 0.25);
      const a = Math.random() * Math.PI * 2, v = (0.5 + Math.random()) * power;
      m.userData = { kind: 'fleck', vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: (1.4 + Math.random() * 1.4) * power, g: 7, age: 0, life: 0.5 + Math.random() * 0.3, size: 0.7 + Math.random() * 0.8, alpha: 1, spin: (Math.random() - 0.5) * 16 };
    }
  }
  // A ring spreading across the water (or a puddle at height y).
  function ripple(x, z, size = 1, delay = 0, y = 0.04) {
    const m = spawn('ring', ringGeo);
    m.material.color.setHex(0xffffff);
    m.position.set(x, y, z);
    m.userData = { kind: 'ring', age: -delay, life: 1.1, size, alpha: 0.7 };
    m.visible = delay <= 0;
  }

  // Footprints: a fixed pool, the oldest is reused.
  const prints = [];
  for (let i = 0; i < PRINTS; i++) {
    const m = new THREE.Mesh(printGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.visible = false; m.userData = { age: 99, life: 1 }; scene.add(m); prints.push(m);
  }
  let nextPrint = 0, leftFoot = false;
  function footprint(x, z, heading, color, life) {
    leftFoot = !leftFoot;
    const side = leftFoot ? 0.11 : -0.11;
    const px = x + Math.cos(heading) * side, pz = z - Math.sin(heading) * side;
    const m = prints[nextPrint]; nextPrint = (nextPrint + 1) % PRINTS;
    m.position.set(px, groundAt(px, pz) + 0.025, pz);
    m.rotation.y = heading; m.scale.set(0.085, 1, 0.16);
    m.material.color.setHex(color); m.visible = true; m.userData = { age: 0, life };
  }

  const GRASS = [0xf0cf72, 0xd7b257, 0xc9c06a], GREEN = [0x8fbf5f, 0x6f9f4c, 0xb7d27a], LEAF = [0x6f9a4c, 0x9a7a44, 0x4f8a48, 0xc9a04e], MUD = [0x6f5238, 0x86654a], GRIT = [0xb3a8ad, 0x9d95a3];

  return {
    puff, flecks, ripple, footprint,
    // One footfall on a given kind of ground. wet (0..1): how soaked the ground is from rain (weather.wet).
    step(surface, p, heading, running, wet = 0) {
      const n = running ? 1 : 0;
      // On rain-soaked ground every step splashes: a ring where the foot lands and spray kicked up behind,
      // bigger when running, and a dark wet print that fades.
      if (wet > 0.25 && surface !== 'water') {
        const gy = groundAt(p.x, p.z) + 0.03, k = Math.min(1, (wet - 0.25) / 0.5);
        ripple(p.x, p.z, (running ? 0.55 : 0.35) * (0.6 + 0.4 * k), 0, gy);
        if (running) {
          ripple(p.x, p.z, 0.9 * (0.6 + 0.4 * k), 0.12, gy);
          const bx = p.x - Math.sin(heading) * 0.25, bz = p.z - Math.cos(heading) * 0.25;
          puff(bx, gy - 0.03, bz, 2 + Math.round(3 * k), 0xdcecf5, 0.22, 1.0 + 0.5 * k);
          flecks(bx, gy - 0.05, bz, 2 + Math.round(2 * k), [0xcfe4f0, 0xb8d3e3], 0.6);
        }
        footprint(p.x, p.z, heading, 0x5a6b70, running ? 6 : 4);
        if (surface !== 'mud' && surface !== 'sand') return;
      }
      if (surface === 'water') { ripple(p.x, p.z, 0.7); ripple(p.x, p.z, 1.15, 0.18); puff(p.x, 0, p.z, 2 + n * 2, 0xe6f7fa, 0.25, 0.9 + n * 0.4); }
      else if (surface === 'mud') { flecks(p.x, p.y, p.z, 3 + n * 3, MUD, 0.7); footprint(p.x, p.z, heading, 0x4f3d2c, 16); }
      else if (surface === 'sand') { if (running) puff(p.x, p.y, p.z, 2, 0xf7ecc8, 0.2, 0.3); footprint(p.x, p.z, heading, 0xc9b27e, 12); }
      else if (surface === 'dirt') { puff(p.x, p.y, p.z, 1 + n * 2, 0xe9d3a0, 0.18, 0.3); if (running) footprint(p.x, p.z, heading, 0xc9a26a, 5); }
      else if (surface === 'grass') flecks(p.x, p.y, p.z, 1 + n * 3, GRASS, 0.8);
      else if (surface === 'meadow') flecks(p.x, p.y, p.z, 2 + n * 3, GREEN, 0.85);
      else if (surface === 'forest') flecks(p.x, p.y, p.z, 2 + n * 3, LEAF, 0.75);
      else if (surface === 'rock') { if (running) flecks(p.x, p.y, p.z, 2, GRIT, 0.5); }
    },
    // Landing from a jump throws up a lot more of the same.
    land(surface, p) {
      if (surface === 'water') { ripple(p.x, p.z, 1.2); ripple(p.x, p.z, 1.9, 0.15); ripple(p.x, p.z, 2.6, 0.32); puff(p.x, 0, p.z, 9, 0xe6f7fa, 0.5, 1.5); }
      else if (surface === 'mud') { flecks(p.x, p.y, p.z, 12, MUD, 1.1); puff(p.x, p.y, p.z, 3, 0x86654a, 0.4, 0.3); }
      else if (surface === 'grass' || surface === 'meadow' || surface === 'forest') { flecks(p.x, p.y, p.z, 9, surface === 'grass' ? GRASS : surface === 'meadow' ? GREEN : LEAF, 1.1); puff(p.x, p.y, p.z, 3, 0xe9d3a0, 0.4, 0.3); }
      else puff(p.x, p.y, p.z, 7, surface === 'sand' ? 0xf7ecc8 : 0xe9d3a0, 0.45, 0.4);
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const m = live[i], u = m.userData;
        u.age += dt;
        if (u.age < 0) continue;
        m.visible = true;
        const t = u.age / u.life;
        if (t >= 1) { m.visible = false; live.splice(i, 1); spare[u.kind].push(m); continue; }
        if (u.kind === 'ring') { m.scale.setScalar(u.size * (0.25 + t * 1.3)); m.material.opacity = u.alpha * (1 - t); continue; }
        u.vy -= u.g * dt; u.vx *= 1 - Math.min(1, dt * 2.5); u.vz *= 1 - Math.min(1, dt * 2.5);
        m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.position.z += u.vz * dt;
        if (u.kind === 'puff') { m.scale.setScalar(u.size * (0.5 + t * 1.3)); m.material.opacity = u.alpha * (1 - t); }
        else { m.scale.setScalar(u.size); m.rotation.x += u.spin * dt; m.rotation.z += u.spin * 0.6 * dt; m.material.opacity = t < 0.7 ? 1 : (1 - t) / 0.3; }
      }
      for (const m of prints) {
        if (!m.visible) continue;
        m.userData.age += dt;
        const t = m.userData.age / m.userData.life;
        if (t >= 1) m.visible = false; else m.material.opacity = 0.42 * (1 - t * t);
      }
    },
  };
}
