// INTERNAL. Things to use with E (visual milestone V4, design 5.4). Each is a small interaction with a sound,
// a few particles and a reward card the first time (remembered in localStorage, `cozy.v4.firsts`):
//
// - Skimming stones: E on a bed of flat pebbles (pond and river shore) puts a stone in the backpack; using it
//   (its quick-bar key) throws it where the camera looks. Looking level throws it flat; it skips across the
//   water with a ring, a splash and a plink at every bounce. The count is shown; the best is remembered.
// - Wind chimes hanging off the bell frame: E strikes them; the wind rings them softly too.
// - Wooden crates (camp hall, guard hut, beach pier): the lid lifts with a creak; sometimes something inside.
// - A rope swing on a big tree on the pond's west bank: W/S swing, Space jumps off (into the pond if over it).
// - Fishing from the side of the river's fishing dock: cast, wait for the bobber to dip, E/Space to strike,
//   then keep the fish (E) or let it go (Space). The first catch of each kind fills its field-guide page.
// - Stargazing at night: E on the blanket by the sports field, or hold X anywhere outdoors: lie back, the
//   camera tilts to the sky, stars twinkle, the constellations are faintly traced and now and then a
//   shooting star goes over. Any movement key gets up.
// - The campfire (src/world/props.js hands its E over through `hooks.fire`): tap E to add a log (spark
//   burst, crackle), hold E with a marshmallow at night to roast it: let go when golden, not black.
// - Filling the flask at a water barrel: a stream from the tap, a splash, a glug (pour(), from main.js).
//
// While one of the longer ones runs (swing, fishing, stargazing, roasting) the player is `riding` this
// module: player.js leaves the body to us, main.js shows `riding.hint` and hides other E prompts.
// Cost: about 20 draw calls near camp at most (the sky extras only while stargazing).
import * as THREE from 'three';
import { heightAt, riverAt } from '../logic/terrain.js';
import { POND, AREAS } from '../config.js';
import { BELL, COTTAGES, toWorld, DOCK, FIELD } from '../logic/layout.js';
import { emitDrops, emitSparks, emitSmoke } from './particles.js';
import { WIND } from './weather.js';
import { waterWave } from '../kit/river.js';
import { box, cyl, ball, stick, mergeStatic, shared } from './build.js';

const clamp = THREE.MathUtils.clamp;
const SPECIES = [
  { id: 'rasbora', name: 'silver rasbora', w: 0.4, color: 0xc8d4dc, size: 0.7 },
  { id: 'tilapia', name: 'tilapia', w: 0.3, color: 0x8a9a86, size: 1.0 },
  { id: 'catfish', name: 'river catfish', w: 0.18, color: 0x5d544a, size: 1.25 },
  { id: 'gourami', name: 'gourami', w: 0.12, color: 0xc2ab7c, size: 0.95 },
];
const FINDS = [['apple', 0.32], ['mug', 0.16], ['rope', 0.16], ['biscuit', 0.14], [null, 0.22]];

export function createPlay(scene, deps) {
  const { audio, ui, player, effects, groundAt } = deps;
  const interactables = [], colliders = [], updaters = [];
  const group = new THREE.Group(); group.name = 'play'; scene.add(group);
  const now = () => deps.now();
  const later = (s, fn) => deps.later(s, fn);

  // ---- Keys this module reads itself (E held for roasting, Space while on the swing or fishing, X held to lie back)
  const keys = { e: false, x: false, xAt: 0, space: false, eTap: false };
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyE') { keys.e = true; keys.eTap = true; }
    if (e.code === 'KeyX') { keys.x = true; keys.xAt = now(); keys.xTap = true; }
    if (e.code === 'Space') keys.space = true;
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyE') keys.e = false; if (e.code === 'KeyX') keys.x = false; });
  window.addEventListener('blur', () => { keys.e = keys.x = false; });

  // ---- First-time cards
  let firsts = new Set();
  try { firsts = new Set(JSON.parse(localStorage.getItem('cozy.v4.firsts') || '[]')); } catch { /* private window */ }
  function first(id, title, sub, pic) {
    if (firsts.has(id)) return false;
    firsts.add(id); try { localStorage.setItem('cozy.v4.firsts', JSON.stringify([...firsts])); } catch { /* private window */ }
    deps.reward({ kind: 'discovery', title, sub, pic }); audio.play('discover');
    return true;
  }
  let best = 0; try { best = Number(localStorage.getItem('cozy.skipBest')) || 0; } catch { /* private window */ }

  // ---- Riding this module: one longer activity at a time
  const riding = { heading: 0, speed: 0, pitch: 0, roll: 0, opts: {}, hint: '', label: '', cam: null, camSpeed: 0 };
  let mode = null;
  function begin(kind, data = {}) {
    if (player.sitting) player.stand();
    player.act = null;
    mode = { kind, t: 0, ...data };
    riding.heading = player.heading; riding.speed = 0; riding.pitch = riding.roll = 0; riding.opts = {}; riding.cam = null; riding.camSpeed = 0; riding.hint = ''; riding.label = '';
    player.riding = riding;
    keys.space = false; keys.eTap = false; keys.xTap = false;
  }
  function end() {
    if (player.riding === riding) player.riding = null;
    mode = null; riding.cam = null;
    keys.space = false; keys.eTap = false; keys.xTap = false;
  }
  const moving = () => { const m = deps.input.move; return m.x !== 0 || m.z !== 0; };

  // The water at a spot: the river rides the swell, the pond and the sea sit level.
  const isWet = (x, z) => heightAt(x, z) < -0.04;
  function waterY(x, z) { const r = riverAt(x, z); return r.d !== Infinity && r.d < r.w + 1 ? waterWave(x, z, now()) : 0.03; }
  // A dry, gentle spot near (x, z): a short spiral search out to 5 m.
  function shore(x, z) {
    for (let r = 0; r < 5; r += 0.35) for (let a = 0; a < 6.28; a += 0.5) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, h = heightAt(px, pz); if (h > 0.04 && h < 0.4) return { x: px, z: pz }; }
    return { x, z };
  }

  // =====================================================================================================
  // ---- Flat stones: pebble beds to take them from, and the throw
  const pebbleGeo = new THREE.DodecahedronGeometry(0.09, 0); pebbleGeo.scale(1, 0.35, 0.8);
  const D = AREAS.fishingDock, DC = Math.cos(D.rot), DS = Math.sin(D.rot);
  const dockW = (lx, lz) => ({ x: D.x + DC * lx + DS * lz, z: D.z - DS * lx + DC * lz });
  const beds = [shore(POND.x + POND.rw + 0.55, POND.z - 1.2), shore(POND.x - 1.5, POND.z + POND.rw + 0.5), shore(dockW(-1.9, 0.6).x, dockW(-1.9, 0.6).z)];
  beds.forEach((b, i) => {
    const g = new THREE.Group(), y = heightAt(b.x, b.z);
    for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 0.12 + (k % 4) * 0.12, m = new THREE.Mesh(pebbleGeo, shared([0xb9b4ad, 0xa8a199, 0xcfc8bd][k % 3])); m.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r); m.rotation.set(0.1 * (k % 3), a, 0.08); m.receiveShadow = true; g.add(m); }
    g.position.set(b.x, y, b.z); group.add(g); mergeStatic(g);
    interactables.push({
      id: `pebbles-${i}`, kind: 'pebbles', position: { x: b.x, z: b.z }, markerY: y + 0.8,
      prompt: () => (deps.has('stone') >= 5 ? 'Your pockets are full of stones' : 'E — pick up a flat stone'),
      interact() {
        if (deps.has('stone') >= 5) return;
        if (deps.give('stone', 1, { x: b.x, y: y + 0.1, z: b.z })) deps.tip('skim', `A flat stone! Face the water, look level and press ${deps.keyOf('stone') || 'B'} to skim it.`);
      },
    });
  });

  const stoneMesh = new THREE.Mesh(pebbleGeo, shared(0xb9b4ad)); stoneMesh.visible = false; stoneMesh.castShadow = true; group.add(stoneMesh);
  let stone = null;
  // Throws a stone where the camera looks. False if one is still in the air.
  function throwStone() {
    if (stone || mode) return false;
    const dir = new THREE.Vector3(); deps.camera.getWorldDirection(dir);
    const h = Math.hypot(dir.x, dir.z) || 1, fx = dir.x / h, fz = dir.z / h;
    const p = player.position;
    player.gesture('throw', 0.9, { x: p.x + fx * 5, z: p.z + fz * 5 });
    // The follow camera looks about 0.22 down at the scout: level with that is a flat throw; looking up lobs it.
    const vy = clamp(0.5 + (dir.y + 0.22) * 7, -0.6, 4.5);
    stone = { wait: 0.32, x: 0, y: 0, z: 0, vx: fx * (7.6 + Math.random() * 0.9), vy, vz: fz * (7.6 + Math.random() * 0.9), skips: 0, done: 0 };
    audio.play('whoosh');
    return true;
  }
  function stoneEnd(skips, sank) {
    const p = stoneMesh.position;
    if (skips > 0) {
      deps.say(skips === 1 ? '1 skip!' : `${skips} skips!`, '🪨');
      deps.cheer(Math.min(10, skips * 2));
      const was = best;
      if (skips > best) { best = skips; try { localStorage.setItem('cozy.skipBest', String(best)); } catch { /* private window */ } }
      if (!first('skim', 'Skimming stones', `${skips} skip${skips === 1 ? '' : 's'} · best ${best}`, '🪨') && skips > was && was > 0) { deps.reward({ kind: 'discovery', title: `New best: ${skips} skips`, sub: 'Can you beat it?', pic: '🪨' }); audio.play('discover'); }
    } else if (sank) deps.say('Plop! Too steep. Look level for a flatter throw.', '🪨');
    else { deps.say('It landed on the bank. Face the water.', '🪨'); effects.puff(p.x, groundAt(p.x, p.z), p.z, 4, 0xe9d3a0, 0.3, 0.4); }
  }
  function stepStone(dt) {
    const s = stone;
    if (s.wait > 0) {
      s.wait -= dt; if (s.wait > 0) return;
      const p = player.position, f = player.facing;
      s.x = p.x + f.x * 0.4 - f.z * 0.2; s.y = p.y + 1.05; s.z = p.z + f.z * 0.4 + f.x * 0.2; stoneMesh.visible = true;
    }
    s.vy -= 9.8 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    stoneMesh.position.set(s.x, s.y, s.z); stoneMesh.rotation.y += dt * 25;
    const wet = isWet(s.x, s.z), wy = wet ? waterY(s.x, s.z) : groundAt(s.x, s.z);
    if (s.y > wy) return;
    stoneMesh.visible = false; stone = null;
    if (!wet) { stoneEnd(s.skips, false); return; }
    const vh = Math.hypot(s.vx, s.vz), steep = -s.vy / vh;
    // Flat enough and still fast: it skips, a bit slower and a bit lower each time (and now and then it just digs in).
    if (vh > 2.6 && steep < (s.skips ? 0.62 : 0.78) && Math.random() > 0.06) {
      s.skips++; stone = s; stoneMesh.visible = true; s.y = wy + 0.01;
      const k = 0.72 + Math.random() * 0.14; s.vx *= k; s.vz *= k; s.vy = -s.vy * 0.3 + 0.3;
      effects.ripple(s.x, s.z, 0.45, 0, wy + 0.02); effects.ripple(s.x, s.z, 0.75, 0.12, wy + 0.02); emitDrops(s.x, wy, s.z, 5, 0.55);
      audio.play('plink');
      return;
    }
    effects.ripple(s.x, s.z, 0.7, 0, wy + 0.02); effects.ripple(s.x, s.z, 1.2, 0.15, wy + 0.02); emitDrops(s.x, wy, s.z, 9, 0.8);
    audio.play('plop');
    stoneEnd(s.skips, true);
  }
  updaters.push((dt) => { if (stone) stepStone(dt); });

  // =====================================================================================================
  // ---- Wind chimes on the end of the bell frame's beam
  {
    const by = heightAt(BELL.x, BELL.z), top = { x: BELL.x + 0.8, y: by + 2.38, z: BELL.z };
    const hold = new THREE.Group(); hold.position.set(top.x, top.y, top.z); group.add(hold);
    hold.add(cyl(0.006, 0.006, 0.12, 0xe9dcc0, 0, 0.0, 0, 4), cyl(0.12, 0.12, 0.025, 0x8c6444, 0, -0.07, 0, 10));
    const TUBES = 5, tubeGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 8).translate(0, -0.5, 0);
    const tubes = new THREE.InstancedMesh(tubeGeo, new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.3, metalness: 0.75 }), TUBES);
    tubes.castShadow = true; tubes.position.y = -0.09; hold.add(tubes);
    const swing = Array.from({ length: TUBES }, (_, i) => ({ a: (i / TUBES) * Math.PI * 2, len: 0.22 + i * 0.05, amp: 0, ph: i * 1.7 }));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
    let softAt = 0, struck = 0;
    interactables.push({
      id: 'chimes', kind: 'chimes', position: { x: BELL.x + 1.15, z: BELL.z }, markerY: by + 2.9,
      prompt: () => 'E — ring the wind chimes',
      interact() { struck = 0; for (const t of swing) t.amp = 0.45 + Math.random() * 0.25; audio.play('chime'); first('chimes', 'Wind chimes', 'They sing whenever the wind gets up', '🎐'); },
    });
    updaters.push((dt, elapsed) => {
      const near = Math.hypot(player.position.x - top.x, player.position.z - top.z);
      hold.visible = near < 70; if (!hold.visible) return;
      const wind = WIND.value.z;
      struck += dt;
      swing.forEach((t, i) => {
        t.amp = Math.max(wind * 0.18, t.amp * Math.exp(-dt * 0.9));
        E.set(Math.sin(elapsed * 3.1 + t.ph) * t.amp, 0, Math.cos(elapsed * 2.7 + t.ph) * t.amp * 0.8);
        V.set(Math.cos(t.a) * 0.075, 0, Math.sin(t.a) * 0.075); Q.setFromEuler(E); S.set(1, t.len, 1);
        tubes.setMatrixAt(i, M.compose(V, Q, S));
      });
      tubes.instanceMatrix.needsUpdate = true;
      hold.rotation.z = Math.sin(elapsed * 1.3) * wind * 0.08;
      softAt -= dt;
      if (wind > 0.3 && near < 16 && softAt <= 0 && struck > 3) { softAt = 1.5 + Math.random() * 3.5 / wind; audio.play('chimeSoft'); }
    });
  }

  // =====================================================================================================
  // ---- Crates whose lid lifts
  {
    const hall = COTTAGES.find((c) => c.type === 'hall'), guard = COTTAGES.find((c) => c.type === 'guard');
    const pierAt = (lx, lz) => { const dx = Math.sin(DOCK.rot), dz = Math.cos(DOCK.rot), gx = DOCK.x - dx * 2.6 - dz * 2.6, gz = DOCK.z - dz * 2.6 + dx * 2.6, c = Math.cos(DOCK.rot), s = Math.sin(DOCK.rot); return { x: gx + lx * c + lz * s, z: gz - lx * s + lz * c, rot: DOCK.rot }; };
    const spots = [];
    if (hall) spots.push({ ...toWorld(hall, -hall.width / 2 - 1.0, 2.5), rot: hall.rot + 0.15, where: 'camp' });
    if (guard) spots.push({ ...toWorld(guard, guard.width / 2 + 0.75, -1.55), rot: guard.rot - 0.2, where: 'camp' });
    spots.push({ ...pierAt(0.15, -1.25), where: 'pier' });
    const bodyMat = shared(0xb98a5e), lidMat = shared(0xc79a62);
    spots.forEach((c, i) => {
      const y = heightAt(c.x, c.z), g = new THREE.Group(); g.position.set(c.x, y - 0.02, c.z); g.rotation.y = c.rot; group.add(g);
      const body = new THREE.Group();
      body.add(box(0.62, 0.46, 0.46, bodyMat, 0, 0.23, 0), box(0.66, 0.05, 0.5, 0x7a563c, 0, 0.1, 0), box(0.66, 0.05, 0.5, 0x7a563c, 0, 0.36, 0));
      body.add(box(0.5, 0.02, 0.36, 0x4e3524, 0, 0.455, 0)); // the dark inside, seen when the lid is up
      g.add(body); mergeStatic(body);
      const hinge = new THREE.Group(); hinge.position.set(0, 0.47, -0.23); g.add(hinge);
      const lid = box(0.64, 0.05, 0.48, lidMat, 0, 0.0, 0.23); hinge.add(lid);
      colliders.push({ x: c.x, z: c.z, r: 0.4 });
      const st = { open: 0, want: 0, shut: 0, next: 0 };
      interactables.push({
        id: `crate-${i}`, kind: 'crate', position: { x: c.x, z: c.z }, markerY: y + 1.1,
        prompt: () => (st.want ? 'The crate is open' : 'E — open the crate'),
        interact() {
          if (st.want) return;
          st.want = 1; st.shut = 6; audio.play('creak');
          deps.later(0.6, () => {
            if (st.next > now()) { deps.say('Empty. Someone has already had a look.', '📦'); return; }
            st.next = now() + 180;
            let r = Math.random(), find = null; for (const [id, w] of FINDS) { if ((r -= w) <= 0) { find = id; break; } }
            if (find) { deps.give(find, 1, { x: c.x, y: y + 0.6, z: c.z }); first('crate', 'Opened a crate', `Inside: ${deps.itemName(find).toLowerCase()}`, '📦'); }
            else { deps.say(c.where === 'pier' ? 'Only old life jackets in this one.' : 'Only tent pegs and string in this one.', '📦'); first('crate', 'Opened a crate', 'Sometimes there is something useful inside', '📦'); }
          });
        },
      });
      updaters.push((dt) => {
        if (st.want && (st.shut -= dt) <= 0) { st.want = 0; deps.later(0.35, () => audio.play('thud')); }
        st.open += (st.want - st.open) * Math.min(1, dt * (st.want ? 6 : 9));
        hinge.rotation.x = -st.open * 1.85;
      });
    });
  }

  // =====================================================================================================
  // ---- The rope swing: a big tree on the pond's west bank, its branch reaching out over the water
  const SW = (() => {
    const dir = { x: 1, z: 0 }; // from the tree out over the pond
    const base = { x: POND.x - POND.rw - 2.6, z: POND.z + 0.6 }, by = heightAt(base.x, base.z);
    const pivot = { x: POND.x - POND.rw + 1.0, y: 5.1, z: base.z };
    const mount = { x: POND.x - POND.rw - 0.75, z: base.z }; // where you grab it, on the bank
    const L = pivot.y - 0.72, th0 = Math.asin(clamp((mount.x - pivot.x) / L, -0.9, 0.9));
    const tree = new THREE.Group(); tree.position.set(base.x, by, base.z); group.add(tree);
    const BARK = 0x6f5238, BARK2 = 0x7d5c40, LEAF = [0x4f7f45, 0x5f8f4c, 0x6f9a55];
    tree.add(cyl(0.34, 0.5, 4.6, BARK, 0, 2.3, 0, 9));
    tree.add(stick([0, 3.9, 0], [pivot.x - base.x + 0.6, pivot.y - by + 0.25, 0], 0.17, BARK2, 7));
    tree.add(stick([0, 3.6, 0], [-1.6, 5.4, 0.9], 0.13, BARK2, 6), stick([0, 4.4, 0], [0.4, 6.4, -1.2], 0.13, BARK2, 6));
    for (const [x, y, z, r] of [[0, 6.2, 0, 2.0], [-1.4, 5.8, 0.9, 1.5], [1.3, 6.0, -0.9, 1.6], [pivot.x - base.x - 0.2, pivot.y - by + 1.1, 0.2, 1.4], [2.0, 5.7, 0.9, 1.2], [0.4, 7.2, 0.3, 1.3]]) {
      const b = ball(r, LEAF[(x * 7 | 0) & 1 ? 1 : (r > 1.5 ? 0 : 2)], x, y, z, 1); b.scale.y = 0.75; tree.add(b);
    }
    for (let k = 0; k < 4; k++) { const a = k * 1.6; tree.add(stick([Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3], [Math.cos(a) * 0.95, 0.02, Math.sin(a) * 0.95], 0.09, BARK, 5)); } // roots
    mergeStatic(tree, { ao: true });
    colliders.push({ x: base.x, z: base.z, r: 0.55 });
    deps.keepClear && deps.keepClear(base.x, base.z, 3);
    // The rope and its seat hang from a pivot on the branch.
    const rope = new THREE.Group(); rope.position.set(pivot.x, pivot.y, pivot.z); group.add(rope);
    const swingParts = new THREE.Group();
    swingParts.add(cyl(0.022, 0.022, L, 0xe9dcc0, -0.0, -L / 2, -0.17, 5), cyl(0.022, 0.022, L, 0xe9dcc0, 0, -L / 2, 0.17, 5));
    swingParts.add(box(0.26, 0.05, 0.48, 0x9a7350, 0, -L, 0));
    swingParts.add(cyl(0.06, 0.06, 0.12, 0x8c6444, 0, 0.0, 0, 8));
    rope.add(swingParts); mergeStatic(swingParts);
    const s = { th: th0, w: 0, rest: th0 };
    interactables.push({
      id: 'rope-swing', kind: 'swing', position: mount, markerY: heightAt(mount.x, mount.z) + 1.9,
      get enabled() { return !mode; },
      prompt: () => 'E — get on the rope swing',
      interact() { begin('swing'); s.w = 0; s.th = th0; riding.heading = Math.atan2(dir.x, dir.z); riding.label = 'Rope swing'; riding.camSpeed = 3; riding.opts = { sitting: true }; riding.hint = 'W / S swing · Space jump off · E let go'; first('swing', 'Rope swing', 'Swing out and jump into the pond with Space', '🌳'); },
    });
    function seat() { return { x: pivot.x + Math.sin(s.th) * L * dir.x, y: pivot.y - Math.cos(s.th) * L, z: pivot.z + Math.sin(s.th) * L * dir.z }; }
    updaters.push((dt) => {
      const near = Math.hypot(player.position.x - pivot.x, player.position.z - pivot.z) < 90; tree.visible = rope.visible = near;
      if (mode && mode.kind === 'swing') {
        const drive = deps.input.move.z, a = -(9.8 / L) * Math.sin(s.th) - 0.1 * s.w + (drive && Math.sign(drive) === Math.sign(s.w || drive) ? drive * 1.25 : drive * 0.4);
        s.w += a * dt; s.th = clamp(s.th + s.w * dt, -1.2, 1.2); if (Math.abs(s.th) >= 1.2) s.w *= -0.3;
        const p = seat();
        player.position.set(p.x, p.y - 0.5 + player.seatLift(0.5) + 0.02, p.z);
        riding.pitch = -s.th * 0.85;
        if (Math.abs(s.w) > 1.2 && Math.abs(s.th) < 0.12 && (mode.whoosh = (mode.whoosh || 0) - dt) <= 0) { mode.whoosh = 0.6; audio.play('whoosh'); }
        if (keys.space || keys.eTap) {
          // Off you go along the swing's path, with a little hop if you jumped.
          const v = s.w * L, hop = keys.space ? 2.4 : 0.3;
          mode = { kind: 'fall', t: 0, vx: Math.cos(s.th) * v * dir.x, vz: Math.cos(s.th) * v * dir.z, vy: Math.sin(s.th) * v + hop, jumped: keys.space };
          riding.opts = {}; riding.pitch = 0; riding.hint = ''; keys.space = keys.eTap = false;
          audio.play('whoosh');
        }
      } else {
        // Empty, it swings out and back and settles where it is tied off on the bank.
        s.w += (-(9.8 / L) * Math.sin(s.th - s.rest) * 0.6 - 0.9 * s.w) * dt; s.th += s.w * dt;
      }
      rope.rotation.z = -s.th; // the swing plane runs along +x (dir), so it turns about z
    });
    return { pivot };
  })();
  void SW;
  // Falling off the swing (or any other launch): ballistic until the ground or the pond bed, then a splash.
  updaters.push((dt) => {
    if (!mode || mode.kind !== 'fall') return;
    const m = mode, p = player.position;
    m.vy -= 9.8 * dt; p.x += m.vx * dt; p.y += m.vy * dt; p.z += m.vz * dt; m.t += dt;
    riding.heading = Math.atan2(m.vx, m.vz) || riding.heading;
    const g = groundAt(p.x, p.z);
    if (p.y <= g || m.t > 4) {
      p.y = g; const wet = isWet(p.x, p.z);
      end(); player.landNow();
      if (wet) { audio.play('bigSplash'); const wy = waterY(p.x, p.z); emitDrops(p.x, wy, p.z, 22, 1.5); effects.ripple(p.x, p.z, 2.2, 0.1, wy + 0.02); effects.ripple(p.x, p.z, 3.2, 0.3, wy + 0.02); if (m.jumped) { deps.cheer(8); first('splash', 'Splash!', 'Straight off the rope swing into the pond', '💦'); } }
    }
  });

  // =====================================================================================================
  // ---- Fishing from the side of the river's fishing dock
  const FISH = (() => {
    const spot = dockW(0.55, 3.0), out = { x: DC, z: -DS }; // standing on the deck, facing out across the river
    const target = dockW(3.6, 3.6);
    const rod = new THREE.Group(); group.add(rod); rod.visible = false;
    rod.add(stick([0, 0, 0], [0, 0, 2.3], 0.014, 0x8a5a34, 5), cyl(0.04, 0.04, 0.05, 0xb8bcc2, 0, -0.05, 0.3, 8));
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe8453a, roughness: 0.5 })); bob.visible = false; group.add(bob);
    const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf2f2ea, transparent: true, opacity: 0.8 })); line.frustumCulled = false; line.visible = false; group.add(line);
    const fishMat = new THREE.MeshStandardMaterial({ color: 0xc8d4dc, roughness: 0.35, metalness: 0.25 });
    const fish = new THREE.Group(); fish.visible = false; group.add(fish);
    { const b = new THREE.SphereGeometry(0.06, 8, 6); b.scale(0.55, 0.9, 2.2); const t = new THREE.ConeGeometry(0.06, 0.1, 4); t.rotateX(-Math.PI / 2); t.translate(0, 0, -0.16); fish.add(new THREE.Mesh(b, fishMat), new THREE.Mesh(t, fishMat)); }
    const tip = new THREE.Vector3();
    interactables.push({
      id: 'fishing-spot', kind: 'fishing', position: spot, get markerY() { return groundAt(spot.x, spot.z) + 1.5; },
      get enabled() { return !mode; },
      prompt: () => 'E — fish from the dock',
      interact() {
        begin('fish', { phase: 'cast', pt: 0, wait: 0 });
        player.position.set(spot.x, groundAt(spot.x, spot.z), spot.z);
        riding.heading = Math.atan2(out.x, out.z); riding.label = 'Fishing dock'; riding.opts = { pose: 'carry' };
        audio.play('cast'); deps.tip('fishing', 'Watch the bobber. When it dips, press E or Space to strike!');
      },
    });
    function pick() { let r = Math.random(); for (const sp of SPECIES) { if ((r -= sp.w) <= 0) return sp; } return SPECIES[0]; }
    updaters.push((dt, elapsed) => {
      const on = mode && mode.kind === 'fish';
      rod.visible = line.visible = bob.visible = !!on;
      if (!on) { fish.visible = false; return; }
      const m = mode; m.pt += dt;
      const p = player.position, f = player.facing, side = { x: f.z, z: -f.x };
      // The rod from the hands, out over the water; it comes up when you strike.
      const lift = m.phase === 'reel' ? Math.min(1, m.pt / 0.4) : m.phase === 'hold' ? 1 : 0;
      rod.position.set(p.x + f.x * 0.32 - side.x * 0.1, p.y + 0.9, p.z + f.z * 0.32 - side.z * 0.1);
      rod.rotation.set(-(0.55 + lift * 0.5), riding.heading, 0, 'YXZ');
      tip.set(0, 0, 2.3).applyEuler(rod.rotation).add(rod.position);
      const wy = waterY(target.x, target.z);
      let bx = target.x + Math.sin(elapsed * 0.4) * 0.1, bz = target.z + Math.cos(elapsed * 0.33) * 0.1, by = wy + 0.02 + Math.sin(elapsed * 2.1) * 0.012;
      const hint = (h) => { riding.hint = h; };
      if (m.phase === 'cast') {
        const u = Math.min(1, m.pt / 0.7);
        bx = tip.x + (bx - tip.x) * u; bz = tip.z + (bz - tip.z) * u; by = tip.y + (by - tip.y) * u + Math.sin(u * Math.PI) * 1.2;
        hint('Casting…');
        if (u >= 1) { m.phase = 'wait'; m.pt = 0; m.wait = 3 + Math.random() * 6; effects.ripple(bx, bz, 0.4, 0, wy + 0.02); audio.play('plop'); keys.eTap = keys.space = false; }
      } else if (m.phase === 'wait') {
        hint('Wait for the bobber to dip… (move to stop)');
        if (m.pt > m.wait - 1.2) by -= Math.max(0, Math.sin(elapsed * 20)) * 0.025; // a nibble or two first
        if (keys.eTap || keys.space) { deps.say('Too soon! Wait for the bobber to go right under.', '🎣'); m.phase = 'cast'; m.pt = 0; audio.play('cast'); keys.eTap = keys.space = false; }
        else if (m.pt >= m.wait) { m.phase = 'bite'; m.pt = 0; audio.play('bite'); ui.emote(new THREE.Vector3(p.x, p.y + 2.0, p.z), 'surprise'); effects.ripple(bx, bz, 0.5, 0, wy + 0.02); }
      } else if (m.phase === 'bite') {
        by -= 0.09; hint('A bite! Press E or Space NOW!');
        if (Math.random() < dt * 8) emitDrops(bx, wy, bz, 2, 0.4);
        if (keys.eTap || keys.space) { m.phase = 'reel'; m.pt = 0; m.sp = pick(); audio.play('reel'); keys.eTap = keys.space = false; }
        else if (m.pt > 0.95) { deps.say('It got away! Wait for the next one.', '🎣'); m.phase = 'wait'; m.pt = 0; m.wait = 3 + Math.random() * 5; }
      } else if (m.phase === 'reel') {
        const u = Math.min(1, m.pt / 1.1);
        bx = bx + (tip.x - bx) * u * 0.85; bz = bz + (tip.z - bz) * u * 0.85; by = by + (tip.y - 0.5 - by) * u;
        hint('Reeling in…');
        if (u >= 1) {
          m.phase = 'hold'; m.pt = 0; keys.eTap = keys.space = false;
          const sp = m.sp; fishMat.color.setHex(sp.color); fish.scale.setScalar(sp.size);
          deps.progress(`catch-${sp.id}`); // the first of each kind fills its field-guide page (and shows its card)
          deps.say(`You caught a ${sp.name}! E keep it · Space let it go`, '🐟'); audio.play('cheer'); deps.cheer(5);
          emitDrops(bx, by, bz, 8, 0.6);
        }
      } else if (m.phase === 'hold') {
        bx = tip.x; bz = tip.z; by = tip.y - 0.42; hint('E keep it · Space let it go');
        if (keys.eTap) { keys.eTap = false; deps.give('fish', 1, { x: p.x, y: p.y + 1, z: p.z }); m.phase = 'cast'; m.pt = 0; audio.play('cast'); }
        else if (keys.space) { keys.space = false; deps.say('You let it go. It flicks its tail and is gone.', '🐟'); deps.cheer(3); effects.ripple(target.x, target.z, 0.6, 0, wy + 0.02); emitDrops(target.x, wy, target.z, 6, 0.5); audio.play('splash'); m.phase = 'cast'; m.pt = 0; }
      }
      fish.visible = m.phase === 'reel' && m.pt > 0.6 || m.phase === 'hold';
      if (fish.visible) { fish.position.set(bx, by - 0.15 * fish.scale.x, bz); fish.rotation.set(Math.PI / 2 + Math.sin(elapsed * 22) * 0.5, riding.heading, 0); }
      bob.position.set(bx, by, bz);
      lineGeo.attributes.position.array.set([tip.x, tip.y, tip.z, bx, by + 0.04, bz]); lineGeo.attributes.position.needsUpdate = true;
      if (moving() && m.phase !== 'reel') { end(); deps.say('Rod away. Come back any time.', '🎣'); }
    });
    return { spot };
  })();
  void FISH;

  // =====================================================================================================
  // ---- Stargazing: lie back on the grass at night
  const starFx = buildStarFx(); starFx.group.visible = false; scene.add(starFx.group);
  const blanketAt = toWorld(FIELD, 0, FIELD.length / 2 + 2.6);
  {
    const y = heightAt(blanketAt.x, blanketAt.z), b = box(1.5, 0.02, 1.9, 0x5b7fb0, blanketAt.x, y + 0.01, blanketAt.z, FIELD.rot);
    b.castShadow = false; group.add(b); b.add(box(1.5, 0.021, 0.18, 0xe8c15a, 0, 0.002, -0.6), box(1.5, 0.021, 0.18, 0xe8c15a, 0, 0.002, 0.6));
  }
  const night = () => deps.nightF();
  function lieBack(at) {
    begin('stars', { fade: 0, shoot: 2.5 + Math.random() * 3 });
    if (at) { player.position.x = at.x; player.position.z = at.z; riding.heading = FIELD.rot + Math.PI; }
    riding.label = 'Stargazing'; riding.opts = { pose: 'sleep' }; riding.hint = 'Lying back under the stars · move to get up';
    player.position.y = groundAt(player.position.x, player.position.z) + 0.02;
    riding.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    audio.play('sit');
    if (!first('stars', 'Stargazing', 'Find the Southern Cross, low in the south', '✨')) deps.cheer(2);
  }
  interactables.push({
    id: 'stargaze', kind: 'stargaze', position: blanketAt, markerY: heightAt(blanketAt.x, blanketAt.z) + 0.9,
    get enabled() { return night() > 0.55 && !mode; },
    prompt: () => 'E — lie back and look at the stars',
    interact() { lieBack(blanketAt); },
  });
  updaters.push((dt, elapsed) => {
    const on = mode && mode.kind === 'stars';
    // Hold X (sit, then keep holding) at night on open ground to lie back.
    if (!on && !mode && keys.x && player.sitting && now() - keys.xAt > 0.65 && night() > 0.55 && !player.riding) { keys.x = false; lieBack(null); return; }
    if (on) {
      const m = mode; m.t += dt; m.fade = Math.min(1, m.fade + dt * 0.8);
      const p = player.position, f = player.facing;
      const head = { x: p.x - f.x * 0.62, z: p.z - f.z * 0.62 };
      riding.cam.pos.set(head.x - f.x * 0.35, p.y + 0.55, head.z - f.z * 0.35);
      riding.cam.look.set(head.x + f.x * 9, p.y + 40, head.z + f.z * 9);
      if (m.t > 0.8 && (moving() || keys.eTap || keys.space || keys.xTap)) { end(); audio.play('sit'); return; }
      if (night() < 0.4) { end(); deps.say('The sky is getting light. Time to get up.', '🌅'); return; }
      // Now and then a shooting star.
      m.shoot -= dt;
      if (m.shoot <= 0) { m.shoot = 7 + Math.random() * 9; starFx.shoot(); later(0.2, () => audio.play('star')); if (first('shooting-star', 'Shooting star!', 'Quick, make a wish', '🌠')) deps.cheer(6); }
    }
    const vis = (on ? mode.fade : 0) * Math.min(1, Math.max(0, (night() - 0.4) / 0.3));
    starFx.group.visible = vis > 0.01;
    if (starFx.group.visible) { starFx.group.position.copy(deps.camera.position); starFx.update(dt, elapsed, vis); }
  });
  // =====================================================================================================
  // ---- The campfire: tap E to add a log, hold E to roast a marshmallow (at night, with one in the backpack)
  const stickMesh = new THREE.Group(); stickMesh.visible = false; group.add(stickMesh);
  stickMesh.add(stick([0, 0, 0], [0, 0, 1.3], 0.012, 0x9a7450, 4));
  const mallowMat = new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: 0.9 });
  const mallow = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 10), mallowMat); mallow.rotation.x = Math.PI / 2; mallow.position.z = 1.28; stickMesh.add(mallow);
  const C_RAW = new THREE.Color(0xfff8ee), C_GOLD = new THREE.Color(0xe0a050), C_BROWN = new THREE.Color(0x8a5a2a), C_BURNT = new THREE.Color(0x231a14);
  const logAt = new Map();
  let pending = null;
  const canRoast = () => night() > 0.45 && deps.has('marshmallow') > 0;
  function addLog(rec) {
    if ((logAt.get(rec) || 0) > now()) { deps.say('The fire is roaring. Give it a moment.', '🔥'); return; }
    logAt.set(rec, now() + 4);
    player.gesture('throw', 0.9, rec);
    later(0.45, () => { deps.props.stoke(rec); audio.play('crackle'); audio.play('fire'); });
    deps.cheer(2);
    first('log', 'Fed the campfire', 'Fresh wood makes it roar and spark', '🔥');
  }
  deps.props.hooks.fire = {
    prompt: () => (mode || pending ? null : canRoast() ? 'E — add a log · hold E — roast a marshmallow' : 'E — add a log'),
    interact(rec) { if (mode || pending) return true; pending = { rec, t: 0 }; return true; },
  };
  updaters.push((dt) => {
    if (pending) {
      pending.t += dt;
      if (!keys.e && pending.t < 0.28) { addLog(pending.rec); pending = null; }
      else if (pending.t >= 0.28) {
        const rec = pending.rec; pending = null;
        if (keys.e && canRoast()) {
          begin('roast', { rec, b: 0 });
          riding.heading = Math.atan2(rec.x - player.position.x, rec.z - player.position.z); riding.opts = { pose: 'stir' }; riding.label = 'Campfire';
          mallowMat.color.copy(C_RAW); audio.play('sizzle');
        } else addLog(rec);
      }
    }
    const on = mode && mode.kind === 'roast';
    stickMesh.visible = !!on;
    if (!on) return;
    const m = mode, p = player.position, f = player.facing;
    m.b += dt * (m.rec.big ? 0.34 : 0.28) * (0.7 + 0.3 * m.rec.fire.level);
    const b = m.b;
    if (b < 0.6) mallowMat.color.lerpColors(C_RAW, C_GOLD, b / 0.6); else if (b < 0.95) mallowMat.color.lerpColors(C_GOLD, C_BROWN, (b - 0.6) / 0.35); else mallowMat.color.lerpColors(C_BROWN, C_BURNT, Math.min(1, (b - 0.95) / 0.2));
    stickMesh.position.set(p.x + f.x * 0.3 + f.z * 0.15, p.y + 0.95, p.z + f.z * 0.3 - f.x * 0.15);
    stickMesh.rotation.set(0.25, riding.heading, 0, 'YXZ');
    riding.hint = b < 0.45 ? 'Toasting… still pale. Keep holding E' : b < 0.85 ? 'Golden! Let go of E now' : b < 1.05 ? 'Getting dark… let go!' : 'It is on fire!';
    if (b > 1.05 && Math.random() < dt * 12) { const t = mallow.getWorldPosition(new THREE.Vector3()); emitSparks(t.x, t.y, t.z, 1, 0.5, 0.05); if (Math.random() < 0.3) emitSmoke(t.x, t.y + 0.1, t.z, 0.6); }
    if (!keys.e || b > 1.6) {
      end();
      if (b < 0.45) { deps.say('Still pale. Hold E a little longer next time.', '🍬'); return; }
      deps.take('marshmallow'); player.gesture('eat', 1.4); audio.play('munch');
      if (b < 0.85) { deps.eat({ food: 9, cheer: 14 }); ui.emote(new THREE.Vector3(p.x, p.y + 1.9, p.z), 'heart'); deps.say('Golden and gooey. Perfect!', '🍡'); first('mallow', 'Perfect marshmallow', 'Golden outside, gooey inside', '🍡'); }
      else if (b < 1.05) { deps.eat({ food: 8, cheer: 8 }); deps.say('A bit dark, but still yummy.', '🍡'); }
      else { deps.eat({ food: 5, cheer: 3 }); audio.play('laugh'); deps.say('Burnt to a crisp! You eat it anyway.', '🔥'); }
    }
  });

  // =====================================================================================================
  // ---- Filling the flask at a water barrel: a stream from the tap, then a splash
  const pours = [];
  function pour(at) {
    const rot = at.rot || 0, y = heightAt(at.x, at.z);
    pours.push({ x: at.x + Math.sin(rot) * 0.46, y: y + 0.6, z: at.z + Math.cos(rot) * 0.46, t: 0, gy: y });
    audio.play('glug');
    first('tap', 'Filled your flask', 'Four good sips of cold water', '💧');
  }
  updaters.push((dt) => {
    for (let i = pours.length - 1; i >= 0; i--) {
      const q = pours[i]; q.t += dt;
      emitDrops(q.x, q.y - 0.05, q.z, 2, 0.12, 0xdff3fa);
      if (Math.random() < dt * 10) emitDrops(q.x, q.gy + 0.02, q.z, 2, 0.4);
      if (q.t > 1.1) { effects.ripple(q.x, q.z, 0.3, 0, q.gy + 0.03); pours.splice(i, 1); }
    }
  });

  // =====================================================================================================
  return {
    interactables,
    colliders,
    get active() { return !!mode; },
    throwStone, pour,
    // Something used through main.js's E for the first time: a card for the ones without a field-guide page.
    noticed(kind) {
      if (kind === 'bell') first('bell', 'Rang the camp bell', 'Everyone nearby glances over', '🔔');
      else if (kind === 'siren') first('siren', 'Sounded the siren', 'Daytime only, and only for a moment', '📢');
      else if (kind === 'ducks-bread') first('ducks', 'Fed the ducks', 'They paddle over for the crumbs', '🦆');
    },
    update(dt, elapsed) {
      for (const u of updaters) u(dt, elapsed);
      keys.eTap = false; keys.space = false; keys.xTap = false;
    },
  };
}

// ---- The sky while stargazing: brighter twinkling stars, faint constellation lines and a shooting star.
// One group that follows the camera (radius 480, inside the sky dome), shown only while lying back.
function buildStarFx() {
  const group = new THREE.Group(); group.name = 'star-fx'; group.renderOrder = -5;
  const R = 480;
  const dirOf = (az, el) => { const a = az * Math.PI / 180, e = el * Math.PI / 180; return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(R); };
  // Constellations as (azimuth, elevation) points in degrees and the lines between them. Shapes, not a star atlas.
  const CONST = [
    { pts: [[180, 38], [184, 31], [176, 33], [181, 27], [186, 35]], lines: [[0, 3], [2, 4]] },                                // a cross, low in the south
    { pts: [[95, 52], [103, 47], [99, 42], [97, 41.5], [95, 41], [92, 35], [104, 36]], lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 6], [4, 5]] }, // the hunter and his belt
    { pts: [[220, 30], [226, 34], [231, 36], [236, 33], [239, 27], [241, 21], [246, 18], [250, 20]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]] }, // a scorpion's tail
    { pts: [[340, 22], [348, 24], [354, 22], [0, 20], [3, 15], [10, 16], [9, 22]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },          // a ladle, low in the north
  ];
  const pos = [], size = [], phase = [], lines = [];
  for (const c of CONST) {
    const v = c.pts.map(([az, el]) => dirOf(az, el));
    for (const p of v) { pos.push(p.x, p.y, p.z); size.push(4.2 + Math.random() * 1.6); phase.push(Math.random()); }
    for (const [a, b] of c.lines) lines.push(v[a].x, v[a].y, v[a].z, v[b].x, v[b].y, v[b].z);
  }
  for (let i = 0; i < 160; i++) { const p = dirOf(Math.random() * 360, 8 + Math.pow(Math.random(), 0.7) * 80); pos.push(p.x, p.y, p.z); size.push(1.6 + Math.random() * 2.2); phase.push(Math.random()); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1)); geo.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
  const uniforms = { uTime: { value: 0 }, uFade: { value: 0 }, uDpr: { value: Math.min(2, window.devicePixelRatio || 1) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float size; attribute float phase; uniform float uTime, uFade, uDpr; varying float vA;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float tw = 0.6 + 0.4 * sin(uTime * (1.3 + phase * 2.1) + phase * 40.0) * sin(uTime * (0.7 + phase) + phase * 17.0);
        gl_PointSize = size * (0.75 + 0.35 * tw) * uDpr; vA = tw * uFade;
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(1.0, 0.97, 0.9, a * vA); }`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; group.add(points);
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const conLines = new THREE.LineSegments(lineGeo, lineMat); conLines.frustumCulled = false; group.add(conLines);
  // The shooting star: a short bright streak sliding across and fading.
  const shotGeo = new THREE.BufferGeometry(); shotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const shotMat = new THREE.LineBasicMaterial({ color: 0xfffbe8, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const shot = new THREE.Line(shotGeo, shotMat); shot.frustumCulled = false; group.add(shot);
  let shooting = null;
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  return {
    group,
    shoot() { const az = Math.random() * 360, el = 45 + Math.random() * 30; shooting = { t: 0, from: dirOf(az, el), to: dirOf(az + 25 + Math.random() * 20, el - 18 - Math.random() * 10) }; },
    update(dt, elapsed, fade) {
      uniforms.uTime.value = elapsed; uniforms.uFade.value = fade;
      lineMat.opacity = 0.22 * fade * (0.85 + 0.15 * Math.sin(elapsed * 0.6));
      if (shooting) {
        shooting.t += dt; const u = shooting.t / 0.9;
        if (u >= 1) { shooting = null; shotMat.opacity = 0; }
        else {
          A.lerpVectors(shooting.from, shooting.to, Math.min(1, u)); B.lerpVectors(shooting.from, shooting.to, Math.max(0, u - 0.18));
          shotGeo.attributes.position.array.set([A.x, A.y, A.z, B.x, B.y, B.z]); shotGeo.attributes.position.needsUpdate = true;
          shotMat.opacity = fade * Math.sin(u * Math.PI);
        }
      }
    },
  };
}
