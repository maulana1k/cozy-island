// INTERNAL. The digital camera (research item #5): a pocket camera from the backpack. The view glides from the follow
// camera to the scout's eyes (0.5 s) while a cute modern viewfinder fades in: frame corners, a focus box, battery,
// shot counter, zoom bar and a soft vignette. Aim with a mouse drag (or free look) or W A S D / the arrows: the view
// follows with a little weight, slower when zoomed. Zoom 1x..4x with the scroll wheel or + / -, eased, with a small
// motor whirr. Space or a click takes the photo: shutter sound, white flash, the picture held for a moment as a
// little print. E or Esc puts the camera away. On High the picture uses the V6 depth of field (src/finish.js), focused
// on what is in the focus box (autofocus eases to it).
//
// A photo looks for the animal (or person) in the focus box: not too far, big enough on screen and with the ground
// not in the way. Its grade (1..3 stars) = centred + big enough + in focus and steady. A new animal gets its
// field-guide entry; a better photo replaces the old one. Thumbnails (256 x 192 JPEG) come from the drawn frame
// right after it is drawn (afterRender), so the viewfinder itself is never in the picture.
import * as THREE from 'three';
import { FIGURES } from './actors/figure.js';
import { createViewfinder } from './photoHud.js';

const MIN_ZOOM = 1, MAX_ZOOM = 4, BOX_X = 0.3, BOX_Y = 0.36; // the focus box: half size in screen units (-1..1)
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
// What each kind of thing is in the field guide, and how big it is (m), for "big enough on screen".
const KINDS = { cat: ['cat', 0.45], chickens: ['chicken', 0.45], sheep: ['sheep', 1.0], goat: ['goat', 0.9], buffalo: ['buffalo', 1.6], ducks: ['duck', 0.45], monkey: ['monkey', 0.6] };
const PEOPLE = { villager: 'Scout', local: 'Villager' };

// deps: { camera, input, canvas, groundAt, audio, player, interactables, scene, particles, onPhoto(shot), onClose() }
// shot: { thumb, best: { guide, name, d } | null, grade 1..3 }
export function createPhotoCamera(deps) {
  const { camera, input, groundAt, player } = deps;
  let vf = null, gridOn = false, roll = 0, lastInput = 0, openedAt = 0, histoN = 0; // the overlay (src/photoHud.js)
  const BASE_FOV = 50;
  let active = false, yaw = 0, pitch = 0, aimYaw = 0, aimPitch = 0, zoom = 1, wantZoom = 1, clock = 0, enter = 1, whirrAt = -9, hold = 0, shots = 128;
  let wasLocked = false, lockAt = -9, wasLockedShown = false;
  let subject = false; // something in the focus box: only then is the background thrown out of focus
  let shake = 0, pending = null, hidden = null;
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), to = new THREE.Vector3(), viewer = new THREE.Vector3(), ndc = new THREE.Vector3();
  const from = new THREE.Vector3(), fromQ = new THREE.Quaternion(), aimQ = new THREE.Quaternion(), probe = new THREE.Object3D();
  let fromFov = BASE_FOV;
  const focus = { dist: 8, aperture: 1.5 }; // read by main.js for the depth of field
  const play = (n) => { if (deps.audio) deps.audio.play(n); };
  const keys = new Set();
  const onKey = (e) => {
    if (!active) return;
    if (e.type === 'keydown') { keys.add(e.code); lastInput = clock; if (e.code === 'KeyG' && !e.repeat && vf) { gridOn = !gridOn; vf.grid(gridOn); play('click'); } } else keys.delete(e.code);
  };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
  window.addEventListener('blur', () => keys.clear());
  // A click (a press that hardly moved) takes the photo; a drag only aims.
  let down = null;
  deps.canvas.addEventListener('pointerdown', (e) => { if (active && e.button === 0) down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  deps.canvas.addEventListener('pointerup', (e) => {
    if (!active || !down || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), quick = performance.now() - down.t < 400;
    down = null;
    if (document.pointerLockElement === deps.canvas || (moved < 6 && quick)) cam.shoot();
  });

  const fovNow = () => BASE_FOV / zoom;
  function showZoom() { vf.zoom(wantZoom, MIN_ZOOM, MAX_ZOOM); vf.shots(shots); vf.light(deps.light ? deps.light() : 1); }
  // The scout's own body would fill the bottom of the picture: hidden while the camera is up.
  function hideSelf(on) {
    if (on) {
      let best = null, bd = 0.3;
      for (const f of FIGURES) { if (!f.group.parent || !f.group.visible) continue; const d = f.group.position.distanceTo(player.position); if (d < bd) { bd = d; best = f.group; } }
      hidden = best; if (hidden) hidden.visible = false;
    } else if (hidden) { hidden.visible = true; hidden = null; }
  }

  // ---- What can be photographed, right now: [{ guide, name, x, y, z, size }]
  let gulls = null, rabbits = null, fishes = null, birdsMesh;
  function subjects() {
    const out = [], scene = deps.scene;
    for (const t of deps.interactables) {
      if (t.enabled === false) continue;
      const k = KINDS[t.kind];
      if (k) { const gy = groundAt(t.position.x, t.position.z); out.push({ guide: k[0], name: null, x: t.position.x, y: gy + k[1] * 0.5, z: t.position.z, size: k[1] }); continue; }
      if (PEOPLE[t.kind]) out.push({ guide: null, name: t.speaker || PEOPLE[t.kind], x: t.position.x, y: (t.markerY || groundAt(t.position.x, t.position.z) + 2) - 0.9, z: t.position.z, size: 1.6 });
    }
    if (!gulls) { gulls = []; rabbits = []; fishes = [];
      scene.traverse((o) => {
        if (o.name === 'gull') gulls.push(o);
        if (o.name === 'cliffs-fish') fishes.push(o);
        // Rabbits have no name: they are the only thing with thin capsule ears (src/actors/wildlife.js).
        if (o.isMesh && o.geometry && o.geometry.type === 'CapsuleGeometry' && Math.abs((o.geometry.parameters.radius || 0) - 0.025) < 1e-4 && o.parent && o.parent.parent && !rabbits.includes(o.parent.parent)) rabbits.push(o.parent.parent);
      });
    }
    for (const g of gulls) out.push({ guide: 'gull', x: g.position.x, y: g.position.y, z: g.position.z, size: 1.0 });
    for (const r of rabbits) if (r.visible) out.push({ guide: 'rabbit', x: r.position.x, y: r.position.y + 0.2, z: r.position.z, size: 0.4 });
    for (const f of fishes) if (f.visible) out.push({ guide: 'fish', x: f.position.x, y: f.position.y + 0.3, z: f.position.z, size: 0.5 });
    if (birdsMesh === undefined) birdsMesh = scene.getObjectByName('birds') || null;
    if (birdsMesh) for (const f of birdsMesh.userData.flocks || []) if (f.state !== 'gone') for (const b of f.members) out.push({ guide: 'sparrow', x: b.p.x, y: b.p.y + 0.08, z: b.p.z, size: 0.2 });
    if (deps.particles) for (const b of deps.particles.butterflies()) out.push({ guide: 'butterfly', ...b, size: 0.14 });
    // Fireflies: a cloud of them over the grass ahead, on a good night.
    if (deps.particles && deps.particles.fireflies > 0.3) {
      for (let d = 2; d < 16; d += 0.5) { const x = eye.x + fwd.x * d, y = eye.y + fwd.y * d, z = eye.z + fwd.z * d, gy = groundAt(x, z); if (y < gy + 1.4) { if (gy > 0) out.push({ guide: 'firefly', x, y: Math.max(y, gy + 0.6), z, size: 0.9 }); break; } }
    }
    return out;
  }
  // Is the ground in the way between the eye and a point?
  function blocked(p) {
    const n = 12;
    for (let i = 1; i < n; i++) { const k = i / n, x = eye.x + (p.x - eye.x) * k, y = eye.y + (p.y - eye.y) * k, z = eye.z + (p.z - eye.z) * k; if (y < groundAt(x, z) - 0.05) return true; }
    return false;
  }
  // How well each thing would come out, if the photo were taken now. Returns the best { s, score, c, b, f, d } or null.
  function judge() {
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let best = null;
    for (const s of subjects()) {
      to.set(s.x - eye.x, s.y - eye.y, s.z - eye.z);
      const d = to.length();
      if (d < 0.6 || d > 110) continue;
      ndc.set(s.x, s.y, s.z).project(camera);
      if (ndc.z > 1 || Math.abs(ndc.x) > BOX_X || Math.abs(ndc.y) > BOX_Y) continue;
      const frac = s.size / (2 * d * half); // its height as a share of the picture's
      if (frac < 0.025) continue;
      const c = Math.max(0, 1 - Math.hypot(ndc.x / BOX_X, ndc.y / BOX_Y) / 1.2);
      const b = Math.min(1, (frac - 0.025) / 0.14);
      const vd = Math.max(0.3, to.dot(fwd)); // its depth along the view, as the focus is measured
      const f = Math.max(0, 1 - Math.abs(focus.dist - vd) / Math.max(0.5, vd * 0.25)) * (1 - Math.min(1, shake / 0.5));
      const score = 0.35 * c + 0.4 * b + 0.25 * f;
      if (!best || score > best.score) { if (blocked(s)) continue; best = { s, score, c, b, f, d }; }
    }
    return best;
  }

  const cam = {
    get active() { return active; },
    focus,
    // The depth of field for main.js: shallow focus on the subject in the box, else all sharp.
    get dof() { return subject ? focus : null; },
    viewer() { return viewer; },
    open() {
      if (!vf) vf = createViewfinder({ x: BOX_X, y: BOX_Y });
      active = true; keys.clear(); input.consumeLook(); input.consumeZoom(); input.consumeHop();
      camera.getWorldDirection(fwd);
      yaw = aimYaw = Math.atan2(fwd.x, fwd.z); pitch = aimPitch = Math.max(-0.8, Math.min(0.6, Math.asin(Math.max(-1, Math.min(1, fwd.y))) + 0.08));
      zoom = wantZoom = MIN_ZOOM; hold = 0; shake = 0; wasLocked = false; openedAt = clock; lastInput = clock;
      if (deps.finish) deps.finish.probeFocus = true;
      enter = 0; from.copy(camera.position); fromQ.copy(camera.quaternion); fromFov = camera.fov;
      hideSelf(true);
      showZoom(); vf.grid(gridOn); void vf.root.offsetWidth; vf.show(true); play('scopeIn');
    },
    close() {
      if (!active) return;
      active = false; pending = null;
      if (deps.finish) deps.finish.probeFocus = false;
      hideSelf(false);
      vf.show(false); vf.clear();
      camera.fov = fromFov; camera.updateProjectionMatrix();
      if (deps.onClose) deps.onClose();
    },
    // Points the camera at a spot at once (for tools and checks).
    aimAt(x, y, z) {
      const P = player.position, ex = P.x, ey = P.y + 1.42, ez = P.z, d = Math.hypot(x - ex, z - ez);
      yaw = aimYaw = Math.atan2(x - ex, z - ez); pitch = aimPitch = Math.atan2(y - ey, d);
    },
    // Space or a click.
    shoot() {
      if (!active || enter < 1 || hold > 0) return;
      hold = 0.35; shots = Math.max(0, shots - 1); showZoom(); lastInput = clock; vf.shutter();
      play('scopeTick'); setTimeout(() => play('click'), 70); // the shutter: a soft detent, then the snap
      const j = judge();
      const grade = j ? (j.score > 0.72 ? 3 : j.score > 0.45 ? 2 : 1) : 0;
      pending = { best: j ? { guide: j.s.guide, name: j.s.name, d: j.d } : null, grade };
    },
    // Called by main.js right after the frame is drawn: the drawn frame becomes the thumbnail.
    afterRender() {
      if (active && vf && ++histoN % 12 === 0) vf.histogram(deps.canvas); // the live histogram, five times a second
      if (!pending) return;
      const shot = pending; pending = null;
      try {
        const src = deps.canvas, w = src.width, h = src.height, cw = Math.min(w, h * 4 / 3), ch = cw * 3 / 4;
        const c = document.createElement('canvas'); c.width = 256; c.height = 192;
        c.getContext('2d').drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, 256, 192);
        shot.thumb = c.toDataURL('image/jpeg', 0.72);
      } catch { shot.thumb = null; }
      const res = deps.onPhoto ? deps.onPhoto(shot) : null;
      // The freeze-frame: the photo as a little print, with what it shows.
      vf.review(shot.thumb, res && res.caption ? res.caption : 'Nothing in the focus box', shot.grade);
    },
    // Moves the camera. Returns true while the camera is up.
    update(dt) {
      if (!active) return false;
      clock += dt; hold = Math.max(0, hold - dt);
      input.consumeHop(); // Space is the shutter here
      const look = input.consumeLook(), slow = 1 / Math.sqrt(zoom);
      if (hold <= 0.2) { aimYaw -= look.dx * 0.0035 * slow; aimPitch -= look.dy * 0.0035 * slow; } // a moment's freeze after each photo
      const turn = 0.9 * slow * dt;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) aimYaw += turn;
      if (keys.has('KeyD') || keys.has('ArrowRight')) aimYaw -= turn;
      if (keys.has('KeyW') || keys.has('ArrowUp')) aimPitch += turn * 0.8;
      if (keys.has('KeyS') || keys.has('ArrowDown')) aimPitch -= turn * 0.8;
      aimPitch = Math.max(-0.95, Math.min(0.9, aimPitch));
      const follow = 1 - Math.exp(-dt * 5);
      const dy = (aimYaw - yaw) * follow, dp = (aimPitch - pitch) * follow;
      yaw += dy; pitch += dp;
      // Steadiness: how fast the view is still swinging (radians a second, eased); a blur risk when high.
      shake += ((Math.hypot(dy, dp) / Math.max(dt, 1e-3)) * zoom - shake) * (1 - Math.exp(-dt * 8));
      // Zoom: the wheel or + / - set it; the lens eases there with a motor whirr.
      let z = wantZoom - input.consumeZoom() * 0.003;
      if (keys.has('Equal') || keys.has('NumpadAdd')) z += dt * 1.5;
      if (keys.has('Minus') || keys.has('NumpadSubtract')) z -= dt * 1.5;
      z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
      if (Math.abs(z - wantZoom) > 1e-3) { if (clock - whirrAt > 0.35) { play('scopeWhirr'); whirrAt = clock; } wantZoom = z; showZoom(); }
      zoom += (wantZoom - zoom) * (1 - Math.exp(-dt * 4));
      // A breath of hand shake.
      const sy = yaw + Math.sin(clock * 1.3) * 0.0016 * zoom, sp = pitch + Math.sin(clock * 1.7 + 0.6) * 0.0012 * zoom;
      fwd.set(Math.sin(sy) * Math.cos(sp), Math.sin(sp), Math.cos(sy) * Math.cos(sp));
      const P = player.position, hx = Math.sin(yaw), hz = Math.cos(yaw);
      eye.set(P.x + hx * 0.25, P.y + 1.42, P.z + hz * 0.25);
      enter = Math.min(1, enter + dt / 0.5);
      const e = enter * enter * (3 - 2 * enter);
      probe.position.copy(eye); probe.lookAt(to.copy(eye).add(fwd)); aimQ.copy(probe.quaternion).multiply(FLIP);
      camera.position.lerpVectors(from, eye, e);
      camera.quaternion.slerpQuaternions(fromQ, aimQ, e);
      camera.fov = fromFov + (fovNow() - fromFov) * e; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      // Autofocus on whatever is under the brackets: an animal in the focus box if there is one, else the depth the
      // GPU measured at the centre (src/finish.js probeFocus: a frame or two old), else the ground ahead.
      let hit = 120;
      for (let d = 1; d < 120; d *= 1.08) { const x = eye.x + fwd.x * d, y = eye.y + fwd.y * d, zz = eye.z + fwd.z * d; if (y < groundAt(x, zz)) { hit = d; break; } }
      const j = enter >= 1 ? judge() : null;
      const fin = deps.finish, fresh = fin && fin.probeFocus && performance.now() - fin.focusAt < 300;
      let want = hit;
      if (j) want = Math.max(0.3, to.set(j.s.x - eye.x, j.s.y - eye.y, j.s.z - eye.z).dot(fwd)); // its depth along the view
      else if (fresh) {
        // The centre, unless something thin just beside it is clearly nearer (a stem, a butterfly).
        const c = fin.focusSamples; let m = c[0];
        for (let i = 1; i < c.length; i++) if (c[i] < m * 0.7) m = c[i];
        want = Math.min(m, 400);
      }
      // A lens pulls focus in about a third of a second, smoothly, in distance ratios (as a focus ring turns).
      if (!(focus.dist > 0)) focus.dist = want;
      focus.dist = Math.exp(Math.log(focus.dist) + (Math.log(want) - Math.log(focus.dist)) * (1 - Math.exp(-dt * 11)));
      // Blur strength: strong and creamy close up (macro under ~3 m), gentle for far things; more zoom, shallower.
      const close = Math.min(6, Math.max(0.5, (4 / focus.dist) ** 0.9));
      focus.far = Math.min(24, 3 * zoom ** 0.7 * close); focus.near = focus.far * 0.6; focus.max = Math.min(26, focus.far * 1.3 + 2);
      focus.taps = focus.max > 8 ? 'big' : 'film';
      focus.aperture = 1.1 + zoom * 0.25;
      viewer.copy(eye).addScaledVector(fwd, hit * (1 - 1 / zoom));
      subject = true;
      const locked = enter >= 1 && (j || fresh) && Math.abs(Math.log(focus.dist / want)) < 0.05;
      if (locked && !wasLocked && clock - lockAt > 0.6) { play('ui'); lockAt = clock; } // the half-press beep
      wasLocked = locked;
      vf.lock(!!locked, locked && !wasLockedShown); wasLockedShown = !!locked;
      // The level line: the hands roll a little as they swing and breathe.
      roll += ((-dy / Math.max(dt, 1e-3)) * 0.02 + Math.sin(clock * 0.7) * 0.006 - roll) * (1 - Math.exp(-dt * 6));
      vf.level(roll);
      // Button labels: shown at first and whenever you pause; faint while you are busy.
      if (Math.abs(dy) + Math.abs(dp) > 1e-4 || look.dx || look.dy) lastInput = clock;
      vf.hints(clock - openedAt > 4 && clock - lastInput < 3);
      const label = j ? (deps.label ? deps.label(j.s) : j.s.name || j.s.guide) : '';
      const text = j ? `${label} · ${j.d < 10 ? j.d.toFixed(1) : Math.round(j.d)} m` : '';
      // Subject detect: an outline round the animal, its name above.
      if (j) {
        ndc.set(j.s.x, j.s.y, j.s.z).project(camera);
        const H = deps.canvas.clientHeight, W = deps.canvas.clientWidth, half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        const h = Math.max(24, Math.min(H * 0.8, (j.s.size / (2 * j.d * half)) * H * 1.15));
        vf.subject({ x: (ndc.x * 0.5 + 0.5) * W - 18, y: (-ndc.y * 0.5 + 0.5) * H - 18, w: h * 1.25, h }, text);
      } else vf.subject(null);
      return true;
    },
  };
  return cam;
}
