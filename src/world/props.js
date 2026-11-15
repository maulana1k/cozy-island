// Things the player can use with E: lanterns, doors, the bell, seats, trees and campfires.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { COTTAGES, LANTERNS, BELL, SEATS, CAMPFIRES, FLAGPOLE } from '../logic/layout.js';
import { PALETTE } from '../config.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra });

function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow;
  return m;
}

export function createProps(scene, deps) {
  const { scatter, player, ui, audio } = deps;
  const group = new THREE.Group();
  scene.add(group);
  const wood = flat(PALETTE.wood), woodDark = flat(PALETTE.woodDark), stone = flat(PALETTE.stone);
  const interactables = [];
  const updaters = [];
  const bellListeners = [];

  // ---- Small particles: falling leaves, fruit, sparks ----------------------
  const particles = [];
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.1), fruitGeo = new THREE.IcosahedronGeometry(0.11, 1), sparkGeo = new THREE.OctahedronGeometry(0.04, 0);
  function spawn(geo, material, pos, vel, life, opts = {}) {
    const m = new THREE.Mesh(geo, material.clone());
    m.material.transparent = true;
    m.position.copy(pos);
    scene.add(m);
    particles.push({ m, vel, life, age: 0, gravity: opts.gravity ?? 3, spin: opts.spin ?? 4, flutter: opts.flutter ?? 0, floor: opts.floor ?? -Infinity });
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.leafB, side: THREE.DoubleSide, roughness: 1 });
  const fruitMat = flat(0xff8a5c);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc46b, fog: false });

  // ---- Lanterns ------------------------------------------------------------
  const lanterns = LANTERNS.map((l) => {
    const y = heightAt(l.x, l.z);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.9, 6), woodDark, 0, 0.95, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), woodDark, 0.2, 1.86, 0));
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: PALETTE.lantern, emissiveIntensity: 0, roughness: 0.5 });
    g.add(mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), glassMat, 0.4, 1.62, 0, false));
    g.add(mesh(new THREE.ConeGeometry(0.22, 0.14, 4), woodDark, 0.4, 1.84, 0));
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.04, 0.28), woodDark, 0.4, 1.46, 0));
    g.position.set(l.x, y, l.z);
    g.rotation.y = (l.x * 1.7 + l.z) % 6.28;
    const light = new THREE.PointLight(PALETTE.lantern, 0, 11, 1.5);
    light.position.set(0.4, 1.6, 0);
    g.add(light);
    group.add(g);
    const lantern = { on: false, glow: 0 };
    lantern.set = (on) => { lantern.on = on; };
    interactables.push({
      id: l.id, kind: 'lantern', position: { x: l.x, z: l.z }, markerY: y + 2.25,
      prompt: () => (lantern.on ? 'E — put out lantern' : 'E — light lantern'),
      interact() { lantern.set(!lantern.on); audio.play('lantern'); },
    });
    updaters.push((dt, elapsed) => {
      lantern.glow += ((lantern.on ? 1 : 0) - lantern.glow) * Math.min(1, dt * 8);
      const flicker = 1 + Math.sin(elapsed * 11 + l.x) * 0.04;
      glassMat.emissiveIntensity = lantern.glow * 2.4 * flicker;
      light.intensity = lantern.glow * 9 * flicker;
    });
    return lantern;
  });

  // ---- Doors ---------------------------------------------------------------
  COTTAGES.forEach((c, i) => {
    const holder = new THREE.Group();
    holder.position.set(c.x, heightAt(c.x, c.z) - 0.05, c.z);
    holder.rotation.y = c.rot;
    const hinge = new THREE.Group();
    hinge.position.set(-0.5, c.floor, c.depth / 2 + 0.07);
    const leaf = mesh(new THREE.BoxGeometry(1.0, 1.8, 0.07), flat(0x9c6f48), 0.5, 0.9, 0);
    hinge.add(leaf, mesh(new THREE.BoxGeometry(1.0, 0.08, 0.09), woodDark, 0.5, 1.35, 0), mesh(new THREE.BoxGeometry(1.0, 0.08, 0.09), woodDark, 0.5, 0.45, 0));
    hinge.add(mesh(new THREE.SphereGeometry(0.05, 8, 8), flat(0xe8c36a), 0.86, 0.9, 0.06));
    holder.add(hinge);
    group.add(holder);
    const door = { open: false, angle: 0 };
    interactables.push({
      id: `door-${i}`, kind: 'door', position: { x: c.door.x + Math.sin(c.rot) * 0.5, z: c.door.z + Math.cos(c.rot) * 0.5 },
      markerY: holder.position.y + c.floor + 2.3,
      prompt: () => (door.open ? 'E — close door' : 'E — open door'),
      interact() { door.open = !door.open; audio.play('door'); },
    });
    updaters.push((dt) => {
      const target = door.open ? -1.75 : 0;
      door.angle += (target - door.angle) * Math.min(1, dt * 9); // settles in about 0.4 s
      hinge.rotation.y = door.angle;
    });
  });

  // ---- Bell ----------------------------------------------------------------
  {
    const y = heightAt(BELL.x, BELL.z);
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.18, 2.5, 0.18), woodDark, -0.65, 1.25, 0), mesh(new THREE.BoxGeometry(0.18, 2.5, 0.18), woodDark, 0.65, 1.25, 0));
    g.add(mesh(new THREE.BoxGeometry(1.9, 0.18, 0.24), woodDark, 0, 2.5, 0));
    g.add(mesh(new THREE.BoxGeometry(2.3, 0.1, 0.7), flat(PALETTE.roofs[0]), 0, 2.68, 0));
    const pivot = new THREE.Group(); pivot.position.y = 2.4;
    const brass = new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 0.45, metalness: 0.5 });
    pivot.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), woodDark, 0, -0.15, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.13, 0.36, 0.5, 12), brass, 0, -0.52, 0));
    pivot.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), brass, 0, -0.3, 0));
    pivot.add(mesh(new THREE.SphereGeometry(0.07, 8, 8), woodDark, 0, -0.82, 0));
    g.add(pivot);
    g.position.set(BELL.x, y, BELL.z);
    group.add(g);
    let rung = 10; // seconds since the bell was last rung
    interactables.push({
      id: 'bell', kind: 'bell', position: { x: BELL.x, z: BELL.z }, markerY: y + 3.1,
      prompt: () => 'E — ring bell',
      interact() { rung = 0; audio.play('bell'); bellListeners.forEach((cb) => cb({ x: BELL.x, z: BELL.z })); },
    });
    updaters.push((dt) => {
      rung += dt;
      pivot.rotation.z = rung < 1.5 ? Math.sin(rung * 10) * 0.55 * Math.exp(-rung * 2.2) : 0;
    });
  }

  // ---- Camp flag ----------------------------------------------------------
  {
    const y = heightAt(FLAGPOLE.x, FLAGPOLE.z);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 6.4, 8), flat(0xfaf3e2), 0, 3.2, 0));
    g.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 0.4, metalness: 0.5 }), 0, 6.45, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 8), stone, 0, 0.12, 0));
    const flag = new THREE.Group();
    const cloth = mesh(new THREE.BoxGeometry(1.5, 0.95, 0.03), flat(0x4f9a6a), 0.82, 0, 0);
    const stripe = mesh(new THREE.BoxGeometry(1.5, 0.22, 0.04), flat(0xf2c94c), 0.82, 0, 0, false);
    const badge = mesh(new THREE.OctahedronGeometry(0.2, 0), flat(0xfaf3e2), 0.6, 0, 0, false); badge.scale.z = 0.15;
    flag.add(cloth, stripe, badge);
    g.add(flag);
    g.position.set(FLAGPOLE.x, y, FLAGPOLE.z);
    group.add(g);
    const state = { up: false, h: 1.3 };
    interactables.push({
      id: 'flag', kind: 'flag', position: { x: FLAGPOLE.x, z: FLAGPOLE.z }, markerY: y + 2.4,
      prompt: () => (state.up ? 'E — lower flag' : 'E — raise flag'),
      interact() { state.up = !state.up; audio.play('lantern'); },
    });
    updaters.push((dt, elapsed) => {
      state.h += ((state.up ? 5.75 : 1.3) - state.h) * Math.min(1, dt * 1.6);
      flag.position.y = state.h;
      flag.rotation.y = Math.sin(elapsed * 1.7) * 0.22 + Math.sin(elapsed * 3.1) * 0.06;
    });
  }

  // ---- Seats ---------------------------------------------------------------
  for (const s of SEATS) {
    const y = heightAt(s.x, s.z);
    const g = new THREE.Group();
    if (s.kind === 'log') {
      const log = mesh(new THREE.CylinderGeometry(0.27, 0.29, 1.7, 9), flat(PALETTE.trunk), 0, 0.27, 0);
      log.rotation.z = Math.PI / 2;
      const endA = mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.72, 9), flat(0xe3c69a), 0, 0.27, 0, false);
      endA.rotation.z = Math.PI / 2;
      g.add(log, endA);
    } else {
      g.add(mesh(new THREE.BoxGeometry(1.7, 0.1, 0.5), wood, 0, 0.42, 0));
      g.add(mesh(new THREE.BoxGeometry(1.7, 0.4, 0.08), wood, 0, 0.8, -0.24));
      for (const sx of [-0.7, 0.7]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), woodDark, sx, 0.47, -0.24), mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), woodDark, sx, 0.21, 0.18));
    }
    g.position.set(s.x, y - 0.02, s.z);
    g.rotation.y = s.rot;
    group.add(g);
    interactables.push({
      id: s.id, kind: 'seat', position: { x: s.x, z: s.z }, markerY: y + 1.25,
      get enabled() { return !player.sitting; },
      prompt: () => 'E — sit',
      interact() { player.sit(s); audio.play('sit'); },
    });
  }

  // ---- Trees ---------------------------------------------------------------
  for (const t of scatter.trees) {
    interactables.push({
      id: t.id, kind: 'tree', position: { x: t.x, z: t.z }, markerY: t.y + 1.7,
      prompt: () => 'E — shake tree',
      interact() {
        scatter.shakeTree(t.id, deps.now());
        audio.play('rustle');
        const top = scatter.treeTop(t.id);
        if (Math.random() < 0.25) {
          spawn(fruitGeo, fruitMat, top.clone().add(new THREE.Vector3((Math.random() - 0.5), -0.6, (Math.random() - 0.5))), new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5), 2.2, { gravity: 9, floor: t.y + 0.1 });
        }
        const n = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const p = top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2));
          spawn(leafGeo, leafMat, p, new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.3, (Math.random() - 0.5) * 0.8), 2.4, { gravity: 0.9, flutter: 1.2, floor: t.y + 0.05 });
        }
      },
    });
  }

  // ---- Campfires -----------------------------------------------------------
  const flameOuter = new THREE.MeshBasicMaterial({ color: PALETTE.fire, fog: false });
  const flameInner = new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false });
  for (const f of CAMPFIRES) {
    const y = heightAt(f.x, f.z);
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rock = mesh(new THREE.DodecahedronGeometry(0.2, 0), stone, Math.cos(a) * 0.68, 0.1, Math.sin(a) * 0.68);
      rock.rotation.set(i, i * 2, i * 3); rock.scale.y = 0.75;
      g.add(rock);
    }
    for (let i = 0; i < 3; i++) {
      const log = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.95, 6), flat(0x7a563c), 0, 0.22, 0);
      log.rotation.set(0, (i / 3) * Math.PI, Math.PI / 2 - 0.5);
      g.add(log);
    }
    const flames = new THREE.Group();
    const cones = [
      mesh(new THREE.ConeGeometry(0.34, 0.95, 7), flameOuter, 0, 0.62, 0, false),
      mesh(new THREE.ConeGeometry(0.2, 0.62, 6), flameInner, 0.04, 0.5, 0.03, false),
      mesh(new THREE.ConeGeometry(0.18, 0.55, 6), flameOuter, -0.2, 0.42, 0.12, false),
      mesh(new THREE.ConeGeometry(0.16, 0.5, 6), flameOuter, 0.18, 0.4, -0.14, false),
    ];
    flames.add(...cones);
    g.add(flames);
    const light = new THREE.PointLight(PALETTE.fire, 0, 16, 1.4);
    light.position.y = 1.0;
    g.add(light);
    g.position.set(f.x, y - 0.02, f.z);
    group.add(g);

    const fire = { lit: f.lit, level: f.lit ? 1 : 0, sparkTimer: 0 };
    interactables.push({
      id: f.id, kind: 'campfire', position: { x: f.x, z: f.z }, markerY: y + 1.7,
      prompt: () => (fire.lit ? 'E — put out fire' : 'E — light fire'),
      interact() { fire.lit = !fire.lit; audio.play('fire'); },
    });
    updaters.push((dt, elapsed) => {
      fire.level += ((fire.lit ? 1 : 0) - fire.level) * Math.min(1, dt * 5);
      flames.visible = fire.level > 0.02;
      const flick = Math.sin(elapsed * 13 + f.x) * 0.08 + Math.sin(elapsed * 23) * 0.05;
      flames.scale.set(fire.level * (1 + flick * 0.5), fire.level * (1 + flick), fire.level * (1 - flick * 0.5));
      cones.forEach((c, i) => { c.rotation.y = elapsed * (1 + i * 0.4); c.position.y = [0.62, 0.5, 0.42, 0.4][i] + Math.sin(elapsed * (9 + i * 3) + i) * 0.04; });
      light.intensity = fire.level * (11 + flick * 12);
      fire.sparkTimer -= dt;
      if (fire.lit && fire.sparkTimer <= 0) {
        fire.sparkTimer = 0.12 + Math.random() * 0.3;
        spawn(sparkGeo, sparkMat, new THREE.Vector3(f.x + (Math.random() - 0.5) * 0.4, y + 0.8, f.z + (Math.random() - 0.5) * 0.4),
          new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.9, (Math.random() - 0.5) * 0.5), 1.3, { gravity: -0.3, flutter: 0.7 });
      }
    });
  }

  let wasNight = null;
  return {
    interactables,
    onBell(cb) { bellListeners.push(cb); },
    update(dt, elapsed, nightF) {
      // Lanterns light themselves at dusk and go out at dawn; the player can still toggle them.
      const isNight = nightF > 0.5;
      if (wasNight !== null && isNight !== wasNight) lanterns.forEach((l) => l.set(isNight));
      if (wasNight === null && isNight) lanterns.forEach((l) => l.set(true));
      wasNight = isNight;

      for (const u of updaters) u(dt, elapsed);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        p.vel.y -= p.gravity * dt;
        if (p.flutter) { p.vel.x += Math.sin(elapsed * 5 + i) * p.flutter * dt; p.vel.z += Math.cos(elapsed * 4 + i * 2) * p.flutter * dt; }
        p.m.position.addScaledVector(p.vel, dt);
        if (p.m.position.y < p.floor) { p.m.position.y = p.floor; p.vel.set(0, 0, 0); p.gravity = 0; p.spin = 0; p.flutter = 0; }
        p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt;
        const t = p.age / p.life;
        p.m.material.opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
        if (t >= 1) { scene.remove(p.m); p.m.material.dispose(); particles.splice(i, 1); }
      }
    },
  };
}
