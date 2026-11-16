// Things the player can use with E: lanterns, doors, the bell, seats, trees and campfires.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { COTTAGES, LANTERNS, BELL, SEATS, CAMPFIRES, FLAGPOLE, SUMMIT } from '../logic/layout.js';
import { PALETTE } from '../config.js';
import { mergeStatic } from './build.js';

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
  let flagState = null;

  // ---- Small particles: falling leaves, fruit, sparks ----------------------
  const particles = [];
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.1), fruitGeo = new THREE.IcosahedronGeometry(0.11, 1), sparkGeo = new THREE.OctahedronGeometry(0.04, 0);
  function spawn(geo, material, pos, vel, life, opts = {}) {
    const m = new THREE.Mesh(geo, material.clone());
    m.material.transparent = true;
    m.position.copy(pos);
    scene.add(m);
    particles.push({ m, vel, life, age: 0, gravity: opts.gravity ?? 3, spin: opts.spin ?? 4, flutter: opts.flutter ?? 0, floor: opts.floor ?? -Infinity, grow: opts.grow ?? 0, alpha: opts.alpha ?? 1 });
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.leafB, side: THREE.DoubleSide, roughness: 1 });
  const fruitMat = flat(0xff8a5c);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc46b, fog: false });
  const smokeGeo = new THREE.IcosahedronGeometry(0.32, 1);
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0xd9d6d0, depthWrite: false });
  const fires = [];

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
    mergeStatic(g); // post, arm, cap and base weld into one draw; the glass keeps its own (glowing) material
    group.add(g);
    const lantern = { on: false, glow: 0, flicker: 1, pos: new THREE.Vector3(0.4, 1.6, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position) };
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
      lantern.flicker = flicker;
    });
    return lantern;
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

  // ---- Camp flag: the purple World Scout flag with a white fleur-de-lis ----
  {
    const y = heightAt(FLAGPOLE.x, FLAGPOLE.z);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 6.4, 8), flat(0xfaf3e2), 0, 3.2, 0));
    g.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 0.4, metalness: 0.5 }), 0, 6.45, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 8), stone, 0, 0.12, 0));

    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 256;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#5b2d8e'; cx.fillRect(0, 0, 384, 256);
    cx.translate(192, 128);
    cx.strokeStyle = '#ffffff'; cx.lineWidth = 7; cx.setLineDash([13, 5]);
    cx.beginPath(); cx.arc(0, 0, 96, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = '#ffffff';
    // Centre petal
    cx.beginPath(); cx.moveTo(0, -74); cx.bezierCurveTo(26, -40, 22, 0, 0, 30); cx.bezierCurveTo(-22, 0, -26, -40, 0, -74); cx.fill();
    // Side petals, curling outward
    for (const sgn of [-1, 1]) {
      cx.beginPath(); cx.moveTo(sgn * 8, 28); cx.bezierCurveTo(sgn * 30, 8, sgn * 30, -34, sgn * 54, -34);
      cx.bezierCurveTo(sgn * 78, -30, sgn * 74, 6, sgn * 50, 4); cx.bezierCurveTo(sgn * 56, -10, sgn * 44, -16, sgn * 36, -2);
      cx.bezierCurveTo(sgn * 32, 14, sgn * 22, 30, sgn * 8, 40); cx.closePath(); cx.fill();
    }
    cx.fillRect(-34, 28, 68, 13);                       // the band tying the petals
    cx.beginPath(); cx.moveTo(-16, 41); cx.lineTo(16, 41); cx.lineTo(0, 74); cx.closePath(); cx.fill(); // the stem
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;

    const FW = 1.65, FH = 1.1, SEG = 14;
    const clothGeo = new THREE.PlaneGeometry(FW, FH, SEG, 5);
    clothGeo.translate(FW / 2 + 0.08, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 }));
    cloth.castShadow = true;
    const rest = clothGeo.attributes.position.array.slice();
    const flag = new THREE.Group(); flag.add(cloth);
    g.add(flag);
    g.position.set(FLAGPOLE.x, y, FLAGPOLE.z);
    group.add(g);
    const state = { up: false, h: 1.3 };
    flagState = state;
    interactables.push({
      id: 'flag', kind: 'flag', position: { x: FLAGPOLE.x, z: FLAGPOLE.z }, markerY: y + 2.4,
      prompt: () => (state.up ? 'E — lower flag' : 'E — raise flag'),
      interact() { state.up = !state.up; audio.play('lantern'); },
    });
    updaters.push((dt, elapsed) => {
      state.h += ((state.up ? 5.7 : 1.3) - state.h) * (1 - Math.exp(-dt * 1.5));
      flag.position.y = state.h;
      // The cloth ripples from the pole outward, more the further it is from the pole.
      const pos = clothGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3], yy = rest[i * 3 + 1], far = x / FW;
        pos.setZ(i, Math.sin(x * 4.2 - elapsed * 5.5 + yy * 1.3) * 0.13 * far + Math.sin(x * 1.7 - elapsed * 2.1) * 0.1 * far);
        pos.setY(i, yy - far * far * 0.1 + Math.sin(x * 3 - elapsed * 4) * 0.02 * far);
      }
      pos.needsUpdate = true; clothGeo.computeVertexNormals();
      flag.rotation.y = Math.sin(elapsed * 0.6) * 0.15;
    });
  }

  // ---- Telescope on the summit
  {
    const p = SUMMIT.telescope, y = heightAt(p.x, p.z);
    interactables.push({
      id: 'telescope', kind: 'telescope', position: { x: p.x, z: p.z }, markerY: y + 1.75,
      prompt: () => 'E — look through telescope',
      interact() { audio.play('lantern'); ui.emote(new THREE.Vector3(p.x, y + 2.0, p.z), 'star'); },
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
        if (deps.onShake ? deps.onShake(t) : Math.random() < 0.25) {
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
  const logMat = { a: flat(0x7a563c), b: flat(0x8f6a4a), c: flat(0x6b4a34) }; // shared, so each fire's logs weld into a few draws
  for (const f of CAMPFIRES) {
    const y = heightAt(f.x, f.z);
    const big = f.id === 'fire-village'; // the main campfire is a proper bonfire
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rock = mesh(new THREE.DodecahedronGeometry(0.2, 0), stone, Math.cos(a) * 0.68, 0.1, Math.sin(a) * 0.68);
      rock.rotation.set(i, i * 2, i * 3); rock.scale.y = 0.75;
      g.add(rock);
    }
    for (let i = 0; i < 3; i++) {
      const log = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.95, 6), logMat.a, 0, 0.22, 0);
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
    if (big) {
      // A tall stack of split logs leaning together, with more laid round the base.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, log = mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.25, 6), i % 2 ? logMat.a : logMat.b, Math.cos(a) * 0.3, 0.52, Math.sin(a) * 0.3);
        log.rotation.set(Math.sin(a) * -0.5, 0, Math.cos(a) * 0.5); g.add(log);
      }
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.4, log = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6), logMat.c, Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5); log.rotation.set(Math.PI / 2, 0, a); g.add(log); }
      flames.scale.setScalar(1.25); flames.position.y = 0.25;
      g.scale.setScalar(1.9);
      light.distance = 34; light.position.y = 1.3;
    }
    g.position.set(f.x, y - 0.02, f.z);
    // The ring of stones and the logs never move: weld them (the flames and the light stay apart).
    g.remove(flames, light); mergeStatic(g); g.add(flames, light);
    group.add(g);

    const fire = { lit: f.lit, level: f.lit ? 1 : 0, sparkTimer: 0, boost: 0 };
    interactables.push({
      id: f.id, kind: 'campfire', position: { x: f.x, z: f.z }, markerY: y + (big ? 3.1 : 1.7),
      prompt: () => (fire.lit ? 'E — put out fire' : 'E — light fire'),
      interact() { fire.lit = !fire.lit; audio.play('fire'); },
    });
    fires.push({ x: f.x, z: f.z, y, fire, big, reach: big ? 9 : 5, loud: big ? 1 : 0.55 });
    updaters.push((dt, elapsed) => {
      fire.level += ((fire.lit ? 1 : 0) - fire.level) * Math.min(1, dt * 5);
      flames.visible = fire.level > 0.02;
      const flick = Math.sin(elapsed * 13 + f.x) * 0.08 + Math.sin(elapsed * 23) * 0.05;
      fire.boost = Math.max(0, fire.boost - dt / 9); // fresh wood makes it roar for a while
      const fs = (big ? 1.25 : 1) * (1 + fire.boost * 0.45);
      flames.scale.set(fs * fire.level * (1 + flick * 0.5), fs * fire.level * (1 + flick), fs * fire.level * (1 - flick * 0.5));
      cones.forEach((c, i) => { c.rotation.y = elapsed * (1 + i * 0.4); c.position.y = [0.62, 0.5, 0.42, 0.4][i] + Math.sin(elapsed * (9 + i * 3) + i) * 0.04; });
      light.intensity = fire.level * (11 + flick * 12) * (big ? 3.2 : 1) * (1 + fire.boost * 0.5);
      fire.sparkTimer -= dt;
      if (fire.lit && fire.sparkTimer <= 0) {
        fire.sparkTimer = (0.12 + Math.random() * 0.3) * (big ? 0.45 : 1);
        if (big) {
          // Smoke billows up and drifts off on the breeze, thinning as it goes.
          spawn(smokeGeo, smokeMat, new THREE.Vector3(f.x + (Math.random() - 0.5) * 0.6, y + 2.3, f.z + (Math.random() - 0.5) * 0.6),
            new THREE.Vector3(0.35 + Math.random() * 0.3, 1.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3), 4.5, { gravity: -0.12, spin: 0.6, grow: 3.2, alpha: 0.42 });
        }
        spawn(sparkGeo, sparkMat, new THREE.Vector3(f.x + (Math.random() - 0.5) * (big ? 0.9 : 0.4), y + (big ? 1.6 : 0.8), f.z + (Math.random() - 0.5) * (big ? 0.9 : 0.4)),
          new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.9, (Math.random() - 0.5) * 0.5), 1.3, { gravity: -0.3, flutter: 0.7 });
      }
    });
  }

  // Real lights are costly, so only the three lit lanterns nearest the player get one.
  // A few real lights follow the lamps nearest you, so the ground and walls round them are lit; every
  // other lamp just glows. Lamps from other areas (the village, the pier) join through addLamps.
  const lampLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(PALETTE.lantern, 0, 12, 1.4); scene.add(l); return l; });
  const outside = [];
  const byDistance = [];

  let wasNight = null;
  return {
    interactables,
    onBell(cb) { bellListeners.push(cb); },
    // Lamps placed by other areas: [{ x, y, z }] in world space. They light up after dusk on their own.
    addLamps(points) { for (const p of points) outside.push({ pos: new THREE.Vector3(p.x, p.y, p.z), glow: 0, flicker: 1 }); },
    setFlag(up) { if (flagState) flagState.up = up; },
    // The nearest burning fire within reach, for cooking on or feeding.
    fireNear(x, z, lit = true) { let best = null, bd = Infinity; for (const f of fires) { const d = Math.hypot(x - f.x, z - f.z); if (d < (f.big ? 4.6 : 3) && d < bd && (!lit || f.fire.lit)) { best = f; bd = d; } } return best; },
    // Throw wood on: the fire catches if it was out, flares up and throws sparks.
    stoke(f) {
      f.fire.lit = true; f.fire.boost = 1;
      for (let i = 0; i < 14; i++) spawn(sparkGeo, sparkMat, new THREE.Vector3(f.x + (Math.random() - 0.5) * 0.6, f.y + (f.big ? 1.4 : 0.7), f.z + (Math.random() - 0.5) * 0.6), new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6), 1.2, { gravity: 1.2, flutter: 0.8 });
    },
    // How loudly the nearest burning fire can be heard from here, 0 to 1.
    fireLoudness(x, z) { let best = 0; for (const f of fires) best = Math.max(best, f.fire.level * f.loud * Math.max(0, 1 - Math.hypot(x - f.x, z - f.z) / f.reach)); return best; },
    update(dt, elapsed, nightF) {
      // Lanterns light themselves at dusk and go out at dawn; the player can still toggle them.
      const isNight = nightF > 0.5;
      if (wasNight !== null && isNight !== wasNight) lanterns.forEach((l) => l.set(isNight));
      if (wasNight === null && isNight) lanterns.forEach((l) => l.set(true));
      wasNight = isNight;

      for (const u of updaters) u(dt, elapsed);

      const pp = player.position;
      byDistance.length = 0;
      for (const l of lanterns) if (l.glow > 0.03) byDistance.push(l);
      const dusk = Math.min(1, Math.max(0, (nightF - 0.3) / 0.4));
      for (const l of outside) { l.glow = dusk; if (dusk > 0.03 && l.pos.distanceToSquared(pp) < 45 * 45) byDistance.push(l); }
      byDistance.sort((a, b) => a.pos.distanceToSquared(pp) - b.pos.distanceToSquared(pp));
      lampLights.forEach((light, k) => { const l = byDistance[k]; if (l) { light.position.copy(l.pos); light.intensity = l.glow * 9 * l.flicker; } else light.intensity = 0; });

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        p.vel.y -= p.gravity * dt;
        if (p.flutter) { p.vel.x += Math.sin(elapsed * 5 + i) * p.flutter * dt; p.vel.z += Math.cos(elapsed * 4 + i * 2) * p.flutter * dt; }
        p.m.position.addScaledVector(p.vel, dt);
        if (p.m.position.y < p.floor) { p.m.position.y = p.floor; p.vel.set(0, 0, 0); p.gravity = 0; p.spin = 0; p.flutter = 0; }
        p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt;
        const t = p.age / p.life;
        p.m.material.opacity = p.alpha * (t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3)) * (p.grow ? Math.min(1, t * 6) : 1);
        if (p.grow) p.m.scale.setScalar(1 + p.grow * t);
        if (t >= 1) { scene.remove(p.m); p.m.material.dispose(); particles.splice(i, 1); }
      }
    },
  };
}
