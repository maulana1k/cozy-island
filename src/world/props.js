// Things the player can use with E: lanterns, doors, the bell, seats, trees and campfires.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { COTTAGES, LANTERNS, BELL, SEATS, CAMPFIRES, FLAGPOLE, SUMMIT } from '../logic/layout.js';
import { PALETTE } from '../config.js';
import { mergeStatic } from './build.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WIND } from './weather.js';
import { createFlames } from './flames.js';
import { emitSparks, emitSmoke } from './particles.js';
import { createShadowProxies } from './shadowProxy.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra });

function mesh(geo, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow;
  return m;
}

const SHADOW_FIRE = 1024; // cube-map size per face for the bonfire
const NEAR_CASTERS = 5; // a layer: the people and things close enough to a fire or lamp to be drawn into its shadow cube
const SHADOW_LAMP = 512;  // and for the nearest lit lamp
export const SUN_PROXIES = 6; // a layer: welded still casters (src/world/shadowProxy.js) the sun's shadow camera also draws

export function createProps(scene, deps) {
  const shadowFires = [];
  const dimness = () => Math.min(1, wx.rain * 0.9 + wx.fog * 0.5 + wx.cloud * 0.25); // how gloomy the weather has made the day
  let lampDark = 0; // 0 in daylight .. 1 at night: how much a lit lamp shows against the day
  const { scatter, player, ui, audio } = deps;
  const wx = deps.weather || { rain: 0, fog: 0, cloud: 0, forced: false }; // src/world/weather.js: live 0..1 values
  const STEAM = new THREE.Color(0x9aa3a8); // smoke from a rain-soaked fire: grey and steamy
  const group = new THREE.Group();
  scene.add(group);
  const wood = flat(PALETTE.wood), woodDark = flat(PALETTE.woodDark), stone = flat(PALETTE.stone);
  const interactables = [];
  const updaters = [];
  const hangers = []; // things hanging free that swing in the wind and when brushed (driven by src/world/react.js)
  const bellListeners = [];
  let flagState = null;
  const hooks = { fire: null }; // set by src/world/play.js

  // ---- Small particles: falling leaves, fruit, smoke (sparks fly in the shared pool, src/world/particles.js)
  const particles = [];
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.1), fruitGeo = new THREE.IcosahedronGeometry(0.11, 1);
  function spawn(geo, material, pos, vel, life, opts = {}) {
    const m = new THREE.Mesh(geo, material.clone());
    m.material.transparent = true;
    if (opts.steam) m.material.color.lerp(STEAM, opts.steam);
    m.position.copy(pos);
    scene.add(m);
    particles.push({ m, vel, life, age: 0, gravity: opts.gravity ?? 3, spin: opts.spin ?? 4, flutter: opts.flutter ?? 0, floor: opts.floor ?? -Infinity, grow: opts.grow ?? 0, alpha: opts.alpha ?? 1 });
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.leafB, side: THREE.DoubleSide, roughness: 1 });
  const fruitMat = flat(0xff8a5c);
  const fires = [];

  // ---- Lanterns ------------------------------------------------------------
  const lanterns = LANTERNS.map((l) => {
    const y = heightAt(l.x, l.z);
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.9, 6), woodDark, 0, 0.95, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), woodDark, 0.2, 1.86, 0));
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: PALETTE.lantern, emissiveIntensity: 0, roughness: 0.5 });
    // The lamp hangs from a hook at the arm's end and can swing (src/world/react.js): glass, cap, base and hook in one pivot.
    const hang = new THREE.Group(); hang.position.set(0.4, 1.86, 0);
    const cap = new THREE.ConeGeometry(0.22, 0.14, 4).translate(0, -0.06, 0), base = new THREE.BoxGeometry(0.28, 0.04, 0.28).translate(0, -0.4, 0), hook = new THREE.CylinderGeometry(0.012, 0.012, 0.08, 4).translate(0, 0.0, 0);
    hang.add(mesh(mergeGeometries([cap.toNonIndexed(), base.toNonIndexed(), hook.toNonIndexed()]), woodDark));
    hang.add(mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), glassMat, 0, -0.24, 0, false));
    g.position.set(l.x, y, l.z);
    g.rotation.y = (l.x * 1.7 + l.z) % 6.28;
    mergeStatic(g, { ao: true }); // post and arm weld into one draw; the hanging lamp stays out of the weld
    g.add(hang);
    group.add(g);
    hangers.push({ node: hang, x: l.x, z: l.z, len: 0.3, kind: 'lantern' });
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
      glassMat.emissiveIntensity = lantern.glow * (0.25 + 2.15 * Math.max(lampDark, 0.6 * dimness())) * flicker; // in rain and fog a lamp shows against the gloom; // a lit lamp at noon is only a faint glow
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
    // A pull rope hanging from the clapper, swinging on its own (src/world/react.js).
    const rope = new THREE.Group(); rope.position.y = -0.86;
    rope.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 5).translate(0, -0.425, 0), flat(0xe9dcc0)), mesh(new THREE.SphereGeometry(0.045, 6, 5).translate(0, -0.87, 0), flat(0xe9dcc0)));
    pivot.add(rope);
    g.add(pivot);
    g.position.set(BELL.x, y, BELL.z);
    group.add(g);
    let rung = 10; // seconds since the bell was last rung
    interactables.push({
      id: 'bell', kind: 'bell', position: { x: BELL.x, z: BELL.z }, markerY: y + 3.1,
      prompt: () => 'E — ring bell',
      interact() { rung = 0; audio.play('bell'); bellRope.kick = 2.2; bellListeners.forEach((cb) => cb({ x: BELL.x, z: BELL.z })); },
    });
    const bellRope = { node: rope, x: BELL.x, z: BELL.z, len: 0.9, kind: 'rope', kick: 0 };
    hangers.push(bellRope);
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
    const state = { up: false, h: 2.6 }; // lowered, the flag hangs limp off the ground; raised, it flies
    flagState = state;
    interactables.push({
      id: 'flag', kind: 'flag', position: { x: FLAGPOLE.x, z: FLAGPOLE.z }, markerY: y + 2.4,
      prompt: () => (state.up ? 'E — lower flag' : 'E — raise flag'),
      interact() { state.up = !state.up; audio.play('lantern'); },
    });
    updaters.push((dt, elapsed) => {
      state.h += ((state.up ? 5.7 : 2.6) - state.h) * (1 - Math.exp(-dt * 1.5));
      const fly = Math.min(1, Math.max(0, (state.h - 2.9) / 2.2)), hang = 1 - fly; // 0 hanging limp at the bottom .. 1 flying at the top
      flag.position.y = state.h;
      // The cloth ripples from the pole outward, more the further it is from the pole.
      const pos = clothGeo.attributes.position;
      const ws = WIND.value.z, fl = 1 + ws * 1.9, fs = 1 + ws * 0.9; // the shared wind: harder, faster flutter
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3], yy = rest[i * 3 + 1], far = x / FW;
        const zf = Math.sin(x * 4.2 - elapsed * 5.5 * fs + yy * 1.3) * 0.13 * far * fl + Math.sin(x * 1.7 - elapsed * 2.1 * fs) * 0.1 * far * fl;
        const yf = yy - far * far * 0.1 * (1 - ws * 0.5) + Math.sin(x * 3 - elapsed * 4 * fs) * 0.02 * far * fl;
        // Hanging limp: the cloth falls down the pole in loose folds and barely stirs.
        const d = x - 0.08, xl = 0.08 + d * 0.16, yl = yy - d * 0.85, zl = Math.sin(d * 9) * 0.035 + Math.sin(elapsed * 0.9 + yy) * 0.01 * far;
        pos.setX(i, x + (xl - x) * hang);
        pos.setZ(i, zf * fly + zl * hang);
        pos.setY(i, yf * fly + yl * hang);
      }
      pos.needsUpdate = true; clothGeo.computeVertexNormals();
      flag.rotation.y = (Math.sin(elapsed * 0.6) * 0.15 * (1 - ws) + Math.atan2(-WIND.value.y, WIND.value.x) * ws) * fly; // streams out downwind once raised
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
  const coalMat = new THREE.MeshBasicMaterial({ color: 0x3a0e04, fog: false }); // cloned per fire: glows and pulses with it
  const COAL_DIM = new THREE.Color(0x3a0e04), COAL_HOT = new THREE.Color(0xe0501a);
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
    const flameMesh = createFlames(big ? 1.6 : 1);
    flames.add(flameMesh);
    const coals = mesh(new THREE.IcosahedronGeometry(big ? 0.34 : 0.3, 1), coalMat.clone(), 0, 0.1, 0, false);
    coals.scale.y = 0.35;
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
      flames.position.y = 0.25;
      g.scale.setScalar(1.9);
      light.distance = 20; light.position.y = 1.3; // also the reach of its shadow cube, redrawn every picture: keep it close
      // The bonfire throws real shadows, radially away from itself. Its cube map is redrawn every picture
      // while it burns near the player, so people's shadows keep step with them. The logs and stones round
      // the flame must not cast, or they would shadow everything from a light that sits inside the stack.
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      light.castShadow = true;
      light.shadow.mapSize.set(SHADOW_FIRE, SHADOW_FIRE);
      light.shadow.bias = -0.0008; light.shadow.normalBias = 0.02; light.shadow.radius = 1.5;
      light.shadow.camera.near = 0.6;
      light.shadow.autoUpdate = false; light.shadow.needsUpdate = false;
      light.shadow.intensity = 1;
      light.shadow.camera.layers.set(NEAR_CASTERS); // only what stands close to the fire is drawn into its cube
      shadowFires.push({ light, x: f.x, y, z: f.z });
    }
    g.position.set(f.x, y - 0.02, f.z);
    // The ring of stones and the logs never move: weld them (the flames and the light stay apart).
    g.remove(flames, light); mergeStatic(g, { ao: true }); g.add(flames, light, coals);
    group.add(g);

    // The big camp bonfire keeps camp hours: it burns from 18:00 until 06:00 on its own and nobody can
    // light it or put it out in between. The small fires are the player's to light.
    const scheduled = big && !!deps.dayTime;
    const burning = () => { const h = (((deps.dayTime() % 1) + 1) % 1) * 24; return h >= 18 || h < 6; };
    const fire = { lit: scheduled ? burning() : f.lit, level: 0, sparkTimer: 0, boost: 0, scheduled, damp: wx.forced ? wx.rain : 0 };
    fire.level = fire.lit ? 1 : 0;
    const rec = { x: f.x, z: f.z, y, fire, big, reach: big ? 9 : 5, loud: big ? 1 : 0.55 };
    // A lit fire hands E to src/world/play.js (hooks.fire): tap to add a log, hold to roast a marshmallow.
    interactables.push({
      id: f.id, kind: 'campfire', position: { x: f.x, z: f.z }, markerY: y + (big ? 3.1 : 1.7),
      prompt: () => (hooks.fire && fire.lit && hooks.fire.prompt(rec)) || (scheduled ? (fire.lit ? 'Camp fire burns until 06:00' : 'Camp fire is lit at 18:00') : fire.lit ? 'E — put out fire' : 'E — light fire'),
      interact() { if (hooks.fire && fire.lit && hooks.fire.interact(rec)) return; if (scheduled) return; fire.lit = !fire.lit; audio.play('fire'); },
    });
    fires.push(rec);
    updaters.push((dt, elapsed) => {
      if (scheduled) fire.lit = burning();
      if (big) {
        // Redraw the shadow cube every picture while it can be seen (lit, player near); the redraw happens
        // in main.js's shadow pass, never as an extra pass. Cheap: still casters are welded (shadowProxy.js).
        if (fire.level > 0.3 && Math.hypot(player.position.x - f.x, player.position.z - f.z) < 40) light.shadow.needsUpdate = true;
      }
      fire.level += ((fire.lit ? 1 : 0) - fire.level) * Math.min(1, dt * 5);
      const near = Math.hypot(player.position.x - f.x, player.position.z - f.z) < 135; // far fires draw and shade nothing
      flames.visible = coals.visible = near && fire.level > 0.02;
      const flick = Math.sin(elapsed * 13 + f.x) * 0.08 + Math.sin(elapsed * 23) * 0.05;
      fire.boost = Math.max(0, fire.boost - dt / 9); // fresh wood makes it roar for a while
      // Rain slowly drowns a fire (about 70 s to burn low) and it recovers in about 30 s once the rain stops.
      const soak = wx.rain > 0.25 ? wx.rain : 0;
      fire.damp += soak > fire.damp ? Math.min(soak - fire.damp, dt / 70) : -Math.min(fire.damp, dt / 30);
      const dampK = 1 - 0.6 * fire.damp * (1 - Math.min(1, fire.boost)); // fresh wood fights the rain
      const fs = (1 + fire.boost * 0.45) * dampK;
      if (flames.visible) {
        flames.scale.setScalar(fs * fire.level);
        const u = flameMesh.material.uniforms, soaked = 1 - 0.4 * fire.damp * (1 - Math.min(1, fire.boost));
        u.uTime.value = elapsed + f.x * 3.1; u.uBright.value = Math.min(1.4, fire.level * (1 + fire.boost * 0.35) * soaked * (1 + flick * 0.35));
        coals.material.color.lerpColors(COAL_DIM, COAL_HOT, fire.level * (0.55 + 0.3 * Math.sin(elapsed * 0.9 + f.z) + 0.15 * Math.sin(elapsed * 2.7)) * soaked);
      }
      light.intensity = fire.level * (11 + flick * 12) * (big ? 3.2 : 1) * (1 + fire.boost * 0.5) * (1 - 0.55 * fire.damp * (1 - Math.min(1, fire.boost)));
      fire.sparkTimer -= dt;
      if (fire.lit && fire.sparkTimer <= 0) {
        fire.sparkTimer = (0.12 + Math.random() * 0.3) * (big ? 0.45 : 1) * (1 + fire.damp * 1.5); // fewer sparks when damp
        if (big) {
          // Smoke billows up and drifts off on the breeze, thinning as it goes.
          emitSmoke(f.x, y + 2.3, f.z, fire.damp);
        }
        // Sparks: a pair or so from the bonfire, one from a small fire; fresh wood throws many more for a while.
        if (near) emitSparks(f.x, y + (big ? 1.5 : 0.7), f.z, (big ? 2 : 1) + Math.round(fire.boost * 3 * (1 - fire.damp)), big ? 1.35 : 0.9, big ? 0.9 : 0.4);
      }
    });
  }

  // Real lights are costly, so only the three lit lanterns nearest the player get one.
  // A few real lights follow the lamps nearest you, so the ground and walls round them are lit; every
  // other lamp just glows. Lamps from other areas (the village, the pier) join through addLamps.
  const lampLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xffeedd, 0, 22, 1.0); scene.add(l); return l; }); // a soft warm white, not yellow, reaching well down the path
  // The nearest lit lamp also casts a cube shadow, redrawn every picture while it is lit.
  { const sh = lampLights[0].shadow; lampLights[0].castShadow = true; sh.mapSize.set(SHADOW_LAMP, SHADOW_LAMP); sh.bias = -0.0008; sh.normalBias = 0.02; sh.radius = 1.5; sh.camera.near = 0.4; sh.autoUpdate = false; sh.intensity = 1; sh.camera.layers.set(NEAR_CASTERS); }
  // A few times a second, mark which shadow casters stand near a lit fire or the shadowing lamp, so the
  // cube shadows (redrawn every picture) draw a handful of things instead of the whole island six times over.
  // Still casters near the player are welded into a few shadow-only meshes (src/world/shadowProxy.js,
  // already on this layer), so the cubes draw those plus the people, and can be redrawn every picture.
  const _c = new THREE.Vector3(); let casterScan = 0;
  const proxies = createShadowProxies(scene, { cubeLayer: NEAR_CASTERS, sunLayer: SUN_PROXIES });
  proxies.onFree = (o) => o.layers.enable(NEAR_CASTERS); // drawn live at once; the next scan sorts near from far
  function markNearCasters(centres) {
    scene.traverse((o) => {
      if (!o.isMesh || !o.castShadow || o.isInstancedMesh || o.userData.shadowProxy) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const bs = o.boundingSphere || g.boundingSphere;
      _c.copy(bs.center).applyMatrix4(o.matrixWorld);
      const r = bs.radius * o.matrixWorld.getMaxScaleOnAxis();
      let near = false;
      if (r < 12) for (const c of centres) if ((_c.x - c.x) ** 2 + (_c.z - c.z) ** 2 < (c.r + r) ** 2) { near = true; break; }
      if (near) o.layers.enable(NEAR_CASTERS); else o.layers.disable(NEAR_CASTERS);
    });
  }
  const casterCentres = [];
  const outside = [];
  const byDistance = [];

  let wasNight = null;
  const glowList = { lanterns, outside, fires, gloom: 0 };
  return {
    interactables,
    hangers,
    hooks,
    onBell(cb) { bellListeners.push(cb); },
    // Lamps placed by other areas: [{ x, y, z }] in world space. They light up after dusk on their own.
    addLamps(points) { for (const p of points) outside.push({ pos: new THREE.Vector3(p.x, p.y, p.z), glow: 0, flicker: 1 }); },
    setFlag(up) { if (flagState) flagState.up = up; },
    // The nearest burning fire within reach, for cooking on or feeding.
    fireNear(x, z, lit = true) { let best = null, bd = Infinity; for (const f of fires) { const d = Math.hypot(x - f.x, z - f.z); if (d < (f.big ? 4.6 : 3) && d < bd && (!lit || f.fire.lit)) { best = f; bd = d; } } return best; },
    // Throw wood on: the fire catches if it was out, flares up and throws sparks.
    stoke(f) {
      if (f.fire.scheduled && !f.fire.lit) return; // the camp fire waits for 18:00; the wood is simply added to the stack
      f.fire.lit = true; f.fire.boost = 1;
      emitSparks(f.x, f.y + (f.big ? 1.3 : 0.6), f.z, f.big ? 40 : 24, f.big ? 2 : 1.6, f.big ? 1.2 : 0.6); // a burst as the wood lands
    },
    // What glows, for the halos drawn on Graphics: Low (src/world/particles.js). Live objects, read only.
    glows() { glowList.gloom = 0.7 * dimness(); return glowList; },
    // How loudly the nearest burning fire can be heard from here, 0 to 1.
    fireLoudness(x, z) { let best = 0; for (const f of fires) best = Math.max(best, f.fire.level * (1 - 0.45 * f.fire.damp) * f.loud * Math.max(0, 1 - Math.hypot(x - f.x, z - f.z) / f.reach)); return best; },
    update(dt, elapsed, nightF) {
      // Lanterns light themselves at dusk and go out at dawn; the player can still toggle them.
      const isNight = nightF > 0.5 || wx.rain > 0.6; // lanterns also light themselves in heavy rain
      if (wasNight !== null && isNight !== wasNight) lanterns.forEach((l) => l.set(isNight));
      if (wasNight === null && isNight) lanterns.forEach((l) => l.set(true));
      wasNight = isNight;

      for (const u of updaters) u(dt, elapsed);

      const pp = player.position;
      byDistance.length = 0;
      for (const l of lanterns) if (l.glow > 0.03) byDistance.push(l);
      const dusk = Math.min(1, Math.max(0, (nightF - 0.3) / 0.4));
      const gloom = 0.7 * dimness(); // lamps glow in dark weather too
      for (const l of outside) { l.glow = Math.max(dusk, gloom); if (dusk > 0.03 && l.pos.distanceToSquared(pp) < 45 * 45) byDistance.push(l); }
      byDistance.sort((a, b) => a.pos.distanceToSquared(pp) - b.pos.distanceToSquared(pp));
      const dark = lampDark = Math.min(1, Math.max(0, (nightF - 0.1) / 0.5)); // in daylight a lamp casts no light on its surroundings, whether or not it is switched on
      { // the first lamp light's shadow: redrawn every picture, so it keeps step with the people
        const l0 = dark > 0.3 ? byDistance[0] : null;
        if (l0) lampLights[0].shadow.needsUpdate = true;
        casterScan -= dt;
        if (casterScan <= 0) {
          casterScan = 0.25; casterCentres.length = 0;
          for (const sf of shadowFires) if (sf.light.intensity > 0.5 && (sf.x - pp.x) ** 2 + (sf.z - pp.z) ** 2 < 45 * 45) casterCentres.push({ x: sf.x, z: sf.z, r: 14 });
          if (l0) casterCentres.push({ x: l0.pos.x, z: l0.pos.z, r: 9 });
          if (casterCentres.length) markNearCasters(casterCentres);
          proxies.scan(pp.x, pp.z, casterCentres);
        }
        proxies.check(); // a welded caster that moved or hid casts live again from this picture
      }
      lampLights.forEach((light, k) => { const l = byDistance[k]; if (l && (dark > 0.01 || dimness() > 0.02)) { light.position.copy(l.pos); light.intensity = l.glow * 7 * l.flicker * Math.max(dark, 0.5 * dimness()); } else light.intensity = 0; });

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
