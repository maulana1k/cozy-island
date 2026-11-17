// INTERNAL. Looking through a telescope: the camera glides in to the eyepiece while the view narrows to a round lens
// with a crosshair (about 0.8 s). Aim with a mouse drag or W A S D / the arrow keys: the tube swings with a little
// weight and settles, with a faint sway. Zoom from 3x to 12x with the scroll wheel or + and -: the zoom eases to the
// new power with a motor whirr and a click at each step. Leave with E or Esc (the follow camera blends back). Whatever sits under the crosshair is named with its distance ("Bayu · 48 m"), and the first
// sighting of each thing is noted. Used by the guard tower's telescope (src/world/areas/lifeguard.js).
import * as THREE from 'three';
import { settings } from './settings.js';

const MIN_ZOOM = 3, MAX_ZOOM = 12;
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const CSS = `
#hud .scope { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .35s ease; z-index: 4; }
#hud .scope.on { opacity: 1; }
#hud .scope.on .lens { transform: scale(1); }
#hud .scope .lens { position: absolute; inset: 0; transform: scale(2.6); transition: transform .8s cubic-bezier(.3,.7,.2,1); background: radial-gradient(circle at 50% 50%, transparent 0, transparent min(40vh, 40vw), rgba(8,10,14,.9) calc(min(40vh, 40vw) + 2px), #07090c calc(min(40vh, 40vw) + 26px)); }
#hud .scope .ring { position: absolute; left: 50%; top: 50%; width: min(80vh, 80vw); height: min(80vh, 80vw); transform: translate(-50%, -50%); border-radius: 50%; box-shadow: inset 0 0 0 3px rgba(255,255,255,.18), inset 0 0 40px rgba(0,0,0,.45); }
#hud .scope .cross { position: absolute; left: 50%; top: 50%; width: min(80vh, 80vw); height: min(80vh, 80vw); transform: translate(-50%, -50%); }
#hud .scope .cross::before, #hud .scope .cross::after { content: ""; position: absolute; background: rgba(255,255,255,.55); }
#hud .scope .cross::before { left: 50%; top: 18%; bottom: 18%; width: 1.5px; margin-left: -.75px; }
#hud .scope .cross::after { top: 50%; left: 18%; right: 18%; height: 1.5px; margin-top: -.75px; }
#hud .scope .zoom { position: absolute; left: 50%; bottom: calc(50% - min(40vh, 40vw) + 18px); transform: translateX(-50%); font-size: 18px; font-weight: 800; letter-spacing: 1px; }
#hud .scope .spot { position: absolute; left: 50%; top: calc(50% + 34px); transform: translateX(-50%); font-size: 16px; font-weight: 800; white-space: nowrap; padding: 3px 12px; border-radius: 999px; background: rgba(20,24,30,.45); opacity: 0; transition: opacity .2s ease; }
#hud .scope .spot.on { opacity: 1; }
#hud .scope .keys { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; gap: 14px; font-size: 13px; font-weight: 700; white-space: nowrap; }
#hud .scope .keys kbd { margin-right: 5px; }
#hud.scoping .tl, #hud.scoping .bl, #hud.scoping .hints, #hud.scoping .belt, #hud.scoping .quest, #hud.scoping .way, #hud.scoping .tip1 { opacity: 0 !important; }
`;

// deps: { camera, input, groundAt, audio, candidates() -> [{ id, name, x, y, z, far }], onSpot(name, id), onClose() }
export function createScope(deps) {
  const { camera, input, groundAt } = deps;
  let root = null, zoomEl = null, spotEl = null;
  const BASE_FOV = camera.fov;
  let active = false, yaw = 0, pitch = 0, aimYaw = 0, aimPitch = 0, zoom = MIN_ZOOM, wantZoom = MIN_ZOOM, lastSpot = '', clock = 0, enter = 1, whirrAt = -9;
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), viewer = new THREE.Vector3(), to = new THREE.Vector3();
  const from = new THREE.Vector3(), fromQ = new THREE.Quaternion(), aimQ = new THREE.Quaternion(), probe = new THREE.Object3D();
  let fromFov = BASE_FOV;
  const play = (n) => { if (deps.audio) deps.audio.play(n); };
  const seen = new Set();
  const keys = new Set();
  const onKey = (e) => { if (!active) return; if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code); };
  window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);

  function build() {
    const hud = document.getElementById('hud');
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    root = document.createElement('div'); root.className = 'scope';
    const mk = (cls, text) => { const d = document.createElement('div'); d.className = cls; if (text) d.textContent = text; return d; };
    zoomEl = mk('zoom'); spotEl = mk('spot');
    const k = mk('keys');
    for (const [key, what] of [['Drag / W A S D', 'aim'], ['Scroll / + −', 'zoom'], ['E / Esc', 'leave']]) { const s = document.createElement('span'); const b = document.createElement('kbd'); b.textContent = key; s.append(b, document.createTextNode(what)); k.append(s); }
    root.append(mk('lens'), mk('ring'), mk('cross'), zoomEl, spotEl, k);
    hud.append(root);
  }
  const fovNow = () => BASE_FOV / zoom;
  function showZoom() { const z = Math.round(wantZoom * 2) / 2; zoomEl.textContent = `${z % 1 ? z.toFixed(1) : z}×`; }

  const scope = {
    get active() { return active; },
    // at: the eyepiece { x, y, z }; heading: which way it points (radians, like a figure's rotation.y).
    open(at, heading, startPitch = -0.06) {
      if (!root) build();
      active = true; eye.set(at.x, at.y, at.z); yaw = aimYaw = heading; pitch = aimPitch = startPitch; zoom = wantZoom = MIN_ZOOM; lastSpot = '';
      keys.clear(); input.consumeLook(); input.consumeZoom();
      // The glide in: from wherever the camera is now, to the eyepiece, narrowing to the lens.
      enter = 0; from.copy(camera.position); fromQ.copy(camera.quaternion); fromFov = camera.fov;
      showZoom(); void root.offsetWidth; root.classList.add('on'); document.getElementById('hud').classList.add('scoping'); play('scopeIn');
    },
    close() {
      if (!active) return;
      active = false; // the follow camera eases the field of view back out by itself
      root.classList.remove('on'); document.getElementById('hud').classList.remove('scoping'); spotEl.classList.remove('on');
      if (deps.onClose) deps.onClose();
    },
    // Where people should count as "close" for their level of detail: the spot you are looking at, brought near by the zoom.
    viewer() { return viewer; },
    // Moves the camera. Returns true while the scope is in charge of it.
    update(dt) {
      if (!active) return false;
      clock += dt;
      // Aim: input moves where the tube is headed; the tube follows with a little weight (slower at high power).
      const look = input.consumeLook();
      const slow = 3 / zoom;
      aimYaw -= look.dx * 0.004 * slow; aimPitch -= look.dy * 0.004 * slow;
      const turn = 0.75 * slow * dt;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) aimYaw += turn;
      if (keys.has('KeyD') || keys.has('ArrowRight')) aimYaw -= turn;
      if (keys.has('KeyW') || keys.has('ArrowUp')) aimPitch += turn * 0.8;
      if (keys.has('KeyS') || keys.has('ArrowDown')) aimPitch -= turn * 0.8;
      aimPitch = Math.max(-0.9, Math.min(0.5, aimPitch));
      const follow = 1 - Math.exp(-dt * 3.2);
      yaw += (aimYaw - yaw) * follow; pitch += (aimPitch - pitch) * follow;
      // Zoom: the wheel or + / - set the power; the lens eases there with a whirr and a click at every step.
      let z = wantZoom + input.consumeZoom() * settings.zoomSign * 0.006;
      if (keys.has('Equal') || keys.has('NumpadAdd')) z += dt * 3;
      if (keys.has('Minus') || keys.has('NumpadSubtract')) z -= dt * 3;
      z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
      if (Math.abs(z - wantZoom) > 1e-3) { if (clock - whirrAt > 0.4) { play('scopeWhirr'); whirrAt = clock; } wantZoom = z; showZoom(); }
      const before = zoom;
      zoom += (wantZoom - zoom) * (1 - Math.exp(-dt * 2.6));
      if (Math.floor(before * 2) !== Math.floor(zoom * 2)) play('scopeTick');
      // A faint, slow sway, as if the tripod breathes in the breeze.
      const sy = yaw + (Math.sin(clock * 0.61) * 0.0022 + Math.sin(clock * 1.37 + 1.2) * 0.0009), sp = pitch + Math.sin(clock * 0.83 + 0.5) * 0.0014;
      fwd.set(Math.sin(sy) * Math.cos(sp), Math.sin(sp), Math.cos(sy) * Math.cos(sp));
      // The glide in from the follow camera: position, direction and field of view ease to the eyepiece.
      enter = Math.min(1, enter + dt / 0.8);
      const e = enter * enter * (3 - 2 * enter);
      probe.position.copy(eye); probe.lookAt(to.copy(eye).add(fwd)); aimQ.copy(probe.quaternion);
      // (Object3D.lookAt points +z at the target; a camera looks down -z, so turn the result round.)
      aimQ.multiply(FLIP);
      camera.position.lerpVectors(from, eye, e);
      camera.quaternion.slerpQuaternions(fromQ, aimQ, e);
      camera.fov = fromFov + (fovNow() - fromFov) * e; camera.updateProjectionMatrix();
      // The point you are looking at, for detail: march along the view until it meets the ground.
      let hit = 300;
      for (let d = 2; d < 300; d *= 1.08) { const x = eye.x + fwd.x * d, y = eye.y + fwd.y * d, zz = eye.z + fwd.z * d; if (y < groundAt(x, zz)) { hit = d; break; } }
      viewer.copy(eye).addScaledVector(fwd, hit * (1 - 1 / zoom));
      // What is under the crosshair: the nearest-to-centre named thing within a small cone.
      let best = null, bestA = (fovNow() * Math.PI / 180) * 0.12;
      for (const c of deps.candidates()) {
        to.set(c.x - eye.x, c.y - eye.y, c.z - eye.z);
        const d = to.length();
        if (d < 3 || d > (c.far || 160)) continue;
        const a = to.angleTo(fwd);
        if (a < bestA) { bestA = a; best = { ...c, d }; }
      }
      const text = best ? `${best.name} · ${Math.round(best.d)} m` : '';
      if (text !== lastSpot) { lastSpot = text; spotEl.textContent = text; spotEl.classList.toggle('on', !!best); }
      if (best && !seen.has(best.id)) { seen.add(best.id); if (deps.onSpot) deps.onSpot(best.name, best.id); }
      return true;
    },
  };
  return scope;
}
