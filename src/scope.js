// INTERNAL. Looking through a telescope: the camera moves to the eyepiece and the view narrows to a round lens with a
// crosshair. Aim with a mouse drag or W A S D / the arrow keys, zoom from 3x to 12x with the scroll wheel or + and -,
// leave with E or Esc. Whatever sits under the crosshair is named with its distance ("Bayu · 48 m"), and the first
// sighting of each thing is noted. Used by the guard tower's telescope (src/world/areas/lifeguard.js).
import * as THREE from 'three';

const MIN_ZOOM = 3, MAX_ZOOM = 12;
const CSS = `
#hud .scope { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .35s ease; z-index: 4; }
#hud .scope.on { opacity: 1; }
#hud .scope .lens { position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, transparent 0, transparent min(40vh, 40vw), rgba(8,10,14,.9) calc(min(40vh, 40vw) + 2px), #07090c calc(min(40vh, 40vw) + 26px)); }
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

// deps: { camera, input, groundAt, candidates() -> [{ id, name, x, y, z, far }], onSpot(name, id), onClose() }
export function createScope(deps) {
  const { camera, input, groundAt } = deps;
  let root = null, zoomEl = null, spotEl = null;
  let active = false, yaw = 0, pitch = 0, zoom = MIN_ZOOM, baseFov = camera.fov, lastSpot = '';
  const eye = new THREE.Vector3(), fwd = new THREE.Vector3(), viewer = new THREE.Vector3(), to = new THREE.Vector3();
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
  function setFov() { camera.fov = baseFov / zoom; camera.updateProjectionMatrix(); zoomEl.textContent = `${zoom.toFixed(zoom % 1 ? 1 : 0)}×`; }

  const scope = {
    get active() { return active; },
    // at: the eyepiece { x, y, z }; heading: which way it points (radians, like a figure's rotation.y).
    open(at, heading, startPitch = -0.06) {
      if (!root) build();
      active = true; eye.set(at.x, at.y, at.z); yaw = heading; pitch = startPitch; zoom = MIN_ZOOM; baseFov = camera.fov; lastSpot = '';
      keys.clear(); input.consumeLook(); input.consumeZoom();
      setFov(); root.classList.add('on'); document.getElementById('hud').classList.add('scoping');
    },
    close() {
      if (!active) return;
      active = false; camera.fov = baseFov; camera.updateProjectionMatrix();
      root.classList.remove('on'); document.getElementById('hud').classList.remove('scoping'); spotEl.classList.remove('on');
      if (deps.onClose) deps.onClose();
    },
    // Where people should count as "close" for their level of detail: the spot you are looking at, brought near by the zoom.
    viewer() { return viewer; },
    // Moves the camera. Returns true while the scope is in charge of it.
    update(dt) {
      if (!active) return false;
      const look = input.consumeLook();
      const slow = 1 / zoom;
      yaw -= look.dx * 0.004 * slow * 3; pitch -= look.dy * 0.004 * slow * 3;
      const turn = 0.9 * slow * 3 * dt;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) yaw += turn;
      if (keys.has('KeyD') || keys.has('ArrowRight')) yaw -= turn;
      if (keys.has('KeyW') || keys.has('ArrowUp')) pitch += turn * 0.8;
      if (keys.has('KeyS') || keys.has('ArrowDown')) pitch -= turn * 0.8;
      pitch = Math.max(-0.9, Math.min(0.5, pitch));
      let z = zoom - input.consumeZoom() * 0.01;
      if (keys.has('Equal') || keys.has('NumpadAdd')) z += dt * 4;
      if (keys.has('Minus') || keys.has('NumpadSubtract')) z -= dt * 4;
      z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
      if (Math.abs(z - zoom) > 1e-4) { zoom = z; setFov(); }
      fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      camera.position.copy(eye);
      to.copy(eye).add(fwd); camera.lookAt(to);
      // The point you are looking at, for detail: march along the view until it meets the ground.
      let hit = 300;
      for (let d = 2; d < 300; d *= 1.08) { const x = eye.x + fwd.x * d, y = eye.y + fwd.y * d, zz = eye.z + fwd.z * d; if (y < groundAt(x, zz)) { hit = d; break; } }
      viewer.copy(eye).addScaledVector(fwd, hit * (1 - 1 / zoom));
      // What is under the crosshair: the nearest-to-centre named thing within a small cone.
      let best = null, bestA = (camera.fov * Math.PI / 180) * 0.12;
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
