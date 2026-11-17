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

const MIN_ZOOM = 1, MAX_ZOOM = 4, BOX_X = 0.3, BOX_Y = 0.36; // the focus box: half size in screen units (-1..1)
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
// What each kind of thing is in the field guide, and how big it is (m), for "big enough on screen".
const KINDS = { cat: ['cat', 0.45], chickens: ['chicken', 0.45], sheep: ['sheep', 1.0], goat: ['goat', 0.9], buffalo: ['buffalo', 1.6], ducks: ['duck', 0.45], monkey: ['monkey', 0.6] };
const PEOPLE = { villager: 'Scout', local: 'Villager' };
const CSS = `
#hud .cam { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .3s ease; z-index: 4; color: #fff; font-variant-numeric: tabular-nums; }
#hud .cam.on { opacity: 1; }
#hud .cam .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(10,16,24,.38) 100%); }
#hud .cam .frame { position: absolute; inset: 5vh 4vw; transform: scale(1.08); transition: transform .5s cubic-bezier(.3,.7,.2,1); }
#hud .cam.on .frame { transform: scale(1); }
#hud .cam .c { position: absolute; width: 46px; height: 46px; border: 0 solid rgba(255,255,255,.9); filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
#hud .cam .c.k1 { left: 0; top: 0; border-left-width: 4px; border-top-width: 4px; border-top-left-radius: 14px; }
#hud .cam .c.k2 { right: 0; top: 0; border-right-width: 4px; border-top-width: 4px; border-top-right-radius: 14px; }
#hud .cam .c.k3 { left: 0; bottom: 0; border-left-width: 4px; border-bottom-width: 4px; border-bottom-left-radius: 14px; }
#hud .cam .c.k4 { right: 0; bottom: 0; border-right-width: 4px; border-bottom-width: 4px; border-bottom-right-radius: 14px; }
#hud .cam .box { position: absolute; left: ${50 - BOX_X * 50}%; right: ${50 - BOX_X * 50}%; top: ${50 - BOX_Y * 50}%; bottom: ${50 - BOX_Y * 50}%; transition: transform .25s ease; }
#hud .cam .box i { position: absolute; width: 22px; height: 22px; border: 0 solid rgba(255,255,255,.85); transition: border-color .2s ease; }
#hud .cam .box i:nth-child(1) { left: 0; top: 0; border-left-width: 2.5px; border-top-width: 2.5px; }
#hud .cam .box i:nth-child(2) { right: 0; top: 0; border-right-width: 2.5px; border-top-width: 2.5px; }
#hud .cam .box i:nth-child(3) { left: 0; bottom: 0; border-left-width: 2.5px; border-bottom-width: 2.5px; }
#hud .cam .box i:nth-child(4) { right: 0; bottom: 0; border-right-width: 2.5px; border-bottom-width: 2.5px; }
#hud .cam .box.lock { transform: scale(.94); }
#hud .cam .box.lock i { border-color: #7dffb0; }
#hud .cam .dot { position: absolute; left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: rgba(255,255,255,.8); }
#hud .cam .top { position: absolute; left: 28px; right: 28px; top: 18px; display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 800; letter-spacing: .5px; text-shadow: 0 1px 3px rgba(0,0,0,.45); }
#hud .cam .mode { display: flex; gap: 8px; align-items: center; }
#hud .cam .mode b { background: #8fd3c1; color: #1d3b37; border-radius: 6px; padding: 1px 7px; text-shadow: none; font-size: 12px; }
#hud .cam .bat { display: inline-block; width: 26px; height: 12px; border: 2px solid #fff; border-radius: 3px; position: relative; vertical-align: -2px; margin-left: 8px; }
#hud .cam .bat::after { content: ""; position: absolute; right: -5px; top: 2px; width: 3px; height: 4px; background: #fff; border-radius: 0 1px 1px 0; }
#hud .cam .bat i { position: absolute; left: 2px; top: 2px; bottom: 2px; width: 70%; background: #7dffb0; border-radius: 1px; }
#hud .cam .zoom { position: absolute; right: 30px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 13px; font-weight: 800; text-shadow: 0 1px 3px rgba(0,0,0,.45); }
#hud .cam .zbar { width: 6px; height: 140px; border-radius: 3px; background: rgba(255,255,255,.3); position: relative; }
#hud .cam .zbar i { position: absolute; left: -4px; width: 14px; height: 6px; border-radius: 3px; background: #fff; margin-top: -3px; }
#hud .cam .spot { position: absolute; left: 50%; top: calc(${50 + BOX_Y * 50}% + 12px); transform: translateX(-50%); font-size: 15px; font-weight: 800; white-space: nowrap; padding: 3px 12px; border-radius: 999px; background: rgba(20,24,30,.45); opacity: 0; transition: opacity .2s ease; }
#hud .cam .spot.on { opacity: 1; }
#hud .cam .keys { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; gap: 14px; font-size: 13px; font-weight: 700; white-space: nowrap; }
#hud .cam .keys kbd { margin-right: 5px; }
#hud .cam .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
#hud .cam .flash.go { animation: camflash .45s ease-out; }
@keyframes camflash { 0% { opacity: .95; } 100% { opacity: 0; } }
#hud .cam .print { position: absolute; right: 70px; bottom: 64px; padding: 8px 8px 30px; background: #fffdf8; box-shadow: 0 10px 30px rgba(0,0,0,.35); transform: translateY(30px) rotate(4deg) scale(.9); opacity: 0; transition: opacity .25s ease, transform .4s cubic-bezier(.2,1.3,.3,1); color: #2b3440; text-shadow: none; }
#hud .cam .print.on { opacity: 1; transform: translateY(0) rotate(-3deg) scale(1); }
#hud .cam .print img { display: block; width: 224px; height: 168px; object-fit: cover; background: #dde3e8; }
#hud .cam .print .cap { position: absolute; left: 10px; right: 10px; bottom: 7px; font-size: 13px; font-weight: 800; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#hud .cam .print .cap em { font-style: normal; color: #c98a00; margin-left: 6px; }
#hud.snapping .tl, #hud.snapping .bl, #hud.snapping .hints, #hud.snapping .belt, #hud.snapping .quest, #hud.snapping .way, #hud.snapping .tip1, #hud.snapping .tr { opacity: 0 !important; }
#hud .reward .stamp img.photo { width: 40px; height: 40px; object-fit: cover; border-radius: 5px; display: block; }
`;

// deps: { camera, input, canvas, groundAt, audio, player, interactables, scene, particles, onPhoto(shot), onClose() }
// shot: { thumb, best: { guide, name, d } | null, grade 1..3 }
export function createPhotoCamera(deps) {
  const { camera, input, groundAt, player } = deps;
  let root = null, zoomEl = null, zbarEl = null, spotEl = null, boxEl = null, flashEl = null, printEl = null, printImg = null, printCap = null, shotsEl = null;
  const BASE_FOV = 50;
  let active = false, yaw = 0, pitch = 0, aimYaw = 0, aimPitch = 0, zoom = 1, wantZoom = 1, clock = 0, enter = 1, whirrAt = -9, hold = 0, shots = 128;
  let shake = 0, lastSpot = '', pending = null, hidden = null, printTimer = null;
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), to = new THREE.Vector3(), viewer = new THREE.Vector3(), ndc = new THREE.Vector3();
  const from = new THREE.Vector3(), fromQ = new THREE.Quaternion(), aimQ = new THREE.Quaternion(), probe = new THREE.Object3D();
  let fromFov = BASE_FOV;
  const focus = { dist: 8, aperture: 1.5 }; // read by main.js for the depth of field
  const play = (n) => { if (deps.audio) deps.audio.play(n); };
  const keys = new Set();
  const onKey = (e) => { if (!active) return; if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code); };
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

  function build() {
    const hud = document.getElementById('hud');
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const mk = (cls, text) => { const d = document.createElement('div'); d.className = cls; if (text) d.textContent = text; return d; };
    root = mk('cam');
    const frame = mk('frame');
    for (const c of ['k1', 'k2', 'k3', 'k4']) frame.append(mk(`c ${c}`));
    boxEl = mk('box'); for (let i = 0; i < 4; i++) boxEl.append(document.createElement('i'));
    const top = mk('top'), mode = mk('mode'), b = document.createElement('b'); b.textContent = 'AUTO'; mode.append(b, document.createTextNode('📷 Nature'));
    const right = mk('right'); shotsEl = document.createElement('span'); const bat = document.createElement('span'); bat.className = 'bat'; bat.append(document.createElement('i')); right.append(shotsEl, bat);
    top.append(mode, right);
    const z = mk('zoom'); zoomEl = mk('zt'); zbarEl = document.createElement('i'); const bar = mk('zbar'); bar.append(zbarEl); z.append(mk('', 'T'), bar, mk('', 'W'), zoomEl);
    spotEl = mk('spot'); flashEl = mk('flash');
    printEl = mk('print'); printImg = document.createElement('img'); printImg.alt = ''; printCap = mk('cap'); printEl.append(printImg, printCap);
    const k = mk('keys');
    for (const [key, what] of [['Space / click', 'take photo'], ['Drag / W A S D', 'aim'], ['Scroll / + −', 'zoom'], ['E / Esc', 'put away']]) { const s = document.createElement('span'); const kb = document.createElement('kbd'); kb.textContent = key; s.append(kb, document.createTextNode(what)); k.append(s); }
    root.append(mk('vig'), frame, boxEl, mk('dot'), top, z, spotEl, k, printEl, flashEl);
    hud.append(root);
  }
  const fovNow = () => BASE_FOV / zoom;
  function showZoom() { zoomEl.textContent = `${wantZoom.toFixed(1)}×`; zbarEl.style.top = `${(1 - (wantZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%`; shotsEl.textContent = `▣ ${shots}`; }
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
      const f = Math.max(0, 1 - Math.abs(focus.dist - d) / Math.max(1, d * 0.25)) * (1 - Math.min(1, shake / 0.5));
      const score = 0.35 * c + 0.4 * b + 0.25 * f;
      if (!best || score > best.score) { if (blocked(s)) continue; best = { s, score, c, b, f, d }; }
    }
    return best;
  }

  const cam = {
    get active() { return active; },
    focus,
    viewer() { return viewer; },
    open() {
      if (!root) build();
      active = true; keys.clear(); input.consumeLook(); input.consumeZoom(); input.consumeHop();
      camera.getWorldDirection(fwd);
      yaw = aimYaw = Math.atan2(fwd.x, fwd.z); pitch = aimPitch = Math.max(-0.8, Math.min(0.6, Math.asin(Math.max(-1, Math.min(1, fwd.y))) + 0.08));
      zoom = wantZoom = MIN_ZOOM; lastSpot = ''; hold = 0; shake = 0;
      enter = 0; from.copy(camera.position); fromQ.copy(camera.quaternion); fromFov = camera.fov;
      hideSelf(true);
      showZoom(); void root.offsetWidth; root.classList.add('on'); document.getElementById('hud').classList.add('snapping'); play('scopeIn');
    },
    close() {
      if (!active) return;
      active = false; pending = null;
      hideSelf(false);
      root.classList.remove('on'); document.getElementById('hud').classList.remove('snapping'); spotEl.classList.remove('on'); printEl.classList.remove('on');
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
      hold = 0.35; shots = Math.max(0, shots - 1); showZoom();
      play('scopeTick'); setTimeout(() => play('click'), 70); // the shutter: a soft detent, then the snap
      const j = judge();
      const grade = j ? (j.score > 0.72 ? 3 : j.score > 0.45 ? 2 : 1) : 0;
      pending = { best: j ? { guide: j.s.guide, name: j.s.name, d: j.d } : null, grade };
    },
    // Called by main.js right after the frame is drawn: the drawn frame becomes the thumbnail.
    afterRender() {
      if (!pending) return;
      const shot = pending; pending = null;
      try {
        const src = deps.canvas, w = src.width, h = src.height, cw = Math.min(w, h * 4 / 3), ch = cw * 3 / 4;
        const c = document.createElement('canvas'); c.width = 256; c.height = 192;
        c.getContext('2d').drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, 256, 192);
        shot.thumb = c.toDataURL('image/jpeg', 0.72);
      } catch { shot.thumb = null; }
      flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
      const res = deps.onPhoto ? deps.onPhoto(shot) : null;
      // The freeze-frame: the photo as a little print, with what it shows.
      if (shot.thumb) printImg.src = shot.thumb;
      printCap.replaceChildren(document.createTextNode(res && res.caption ? res.caption : 'Nothing in the focus box'));
      if (shot.grade) { const em = document.createElement('em'); em.textContent = '★'.repeat(shot.grade) + '☆'.repeat(3 - shot.grade); printCap.append(em); }
      printEl.classList.add('on'); clearTimeout(printTimer); printTimer = setTimeout(() => printEl.classList.remove('on'), 2200);
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
      // Autofocus: on the best thing in the focus box, else on the ground straight ahead.
      let hit = 120;
      for (let d = 1; d < 120; d *= 1.08) { const x = eye.x + fwd.x * d, y = eye.y + fwd.y * d, zz = eye.z + fwd.z * d; if (y < groundAt(x, zz)) { hit = d; break; } }
      const j = enter >= 1 ? judge() : null;
      const want = j ? j.d : hit;
      focus.dist += (want - focus.dist) * (1 - Math.exp(-dt * 5));
      focus.aperture = 1.1 + zoom * 0.25;
      viewer.copy(eye).addScaledVector(fwd, hit * (1 - 1 / zoom));
      const locked = !!j && Math.abs(focus.dist - j.d) < Math.max(0.4, j.d * 0.12);
      boxEl.classList.toggle('lock', locked);
      const label = j ? (deps.label ? deps.label(j.s) : j.s.name || j.s.guide) : '';
      const text = j ? `${label} · ${j.d < 10 ? j.d.toFixed(1) : Math.round(j.d)} m` : '';
      if (text !== lastSpot) { lastSpot = text; spotEl.textContent = text; spotEl.classList.toggle('on', !!j); }
      return true;
    },
  };
  return cam;
}
