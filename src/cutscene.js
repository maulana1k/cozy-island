// A small film director: takes the camera away from the player for a few seconds and flies it through a
// list of shots, then gives it back.
//
// A shot: { move, dur, title, sub, place, ... }. Points may be {x, y, z} or a function returning one (a
// moving subject). `move` picks how the camera travels (eased in and out over the shot):
//   'orbit' (the default, and every older shot): circles a point. { at, r, r1, h, h1, a0, a1, lookH }
//   'crane': rises or falls beside a point, facing it. { at, r, a, h, h1, lookH, lookH1 }
//   'push':  a slow push in toward a point while the lens narrows. { at, r, r1, a, h, h1, lookH, fov, fov1 }
//   'dolly': slides along a line. { p0, p1, look, look1 } (camera from p0 to p1, aim from look to look1)
//   'ots':   over the shoulder of someone, looking past them at something.
//            { who, to, back, side, up, back1, up1 } (`side` +1 = right shoulder, -1 = left)
// Common, all optional:
//   fov, fov1      lens in degrees, eased from fov to fov1 (default: the game's own lens)
//   drift          handheld sway, 0 = locked off (default 1: a few centimetres, very slow)
//   blend          seconds to ease from the previous shot's camera instead of cutting (default 0: a cut)
//   focus, focus1  what is sharp (default: what the camera looks at); with focus1 the focus pulls from one
//                  to the other over `rack` ([start, end] as shares of the shot, default [0.35, 0.75])
//   aperture       depth-of-field strength (default 1)
//   place          where the title sits: 'lower-left', 'lower-right', 'upper-left', 'upper-right',
//                  'center', 'lower-center' (default: the shot's empty side, see placeFor)
import * as THREE from 'three';

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep: gentle start and stop
const lerp = (a, b, t) => a + (b - a) * t;
const pt = (p) => (typeof p === 'function' ? p() : p);

// Slow, smooth noise (sum of sines with unrelated rates), about -1..1.
const wob = (t, k) => (Math.sin(t * 0.61 + k * 1.7) * 0.55 + Math.sin(t * 1.13 + k * 4.1) * 0.3 + Math.sin(t * 2.07 + k * 2.3) * 0.15);

// Where the title goes when the shot does not say: away from the shoulder in an over-the-shoulder shot
// (a camera right of the shoulder sees the person on the left), otherwise lower left, beside the centred subject.
export function placeFor(s) {
  if (s.place) return s.place;
  if (s.move === 'ots') return (s.side ?? 1) > 0 ? 'lower-right' : 'lower-left';
  return 'lower-left';
}

// Camera position and aim for shot `s` at eased progress `u`.
function frame(s, u, pos, look) {
  const move = s.move || 'orbit';
  if (move === 'dolly') {
    const p0 = pt(s.p0), p1 = pt(s.p1), l0 = pt(s.look), l1 = pt(s.look1 ?? s.look);
    pos.set(lerp(p0.x, p1.x, u), lerp(p0.y, p1.y, u), lerp(p0.z, p1.z, u));
    look.set(lerp(l0.x, l1.x, u), lerp(l0.y, l1.y, u) + (s.lookH ?? 0), lerp(l0.z, l1.z, u));
    return;
  }
  if (move === 'ots') {
    const who = pt(s.who), to = pt(s.to);
    let dx = to.x - who.x, dz = to.z - who.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const back = lerp(s.back ?? 1.6, s.back1 ?? s.back ?? 1.6, u), up = lerp(s.up ?? 1.75, s.up1 ?? s.up ?? 1.75, u), side = (s.side ?? 1) * (s.sideOff ?? 0.55);
    // right of the facing direction (dx, dz) is (-dz, dx)
    pos.set(who.x - dx * back - dz * side, who.y + up, who.z - dz * back + dx * side);
    look.set(to.x, to.y + lerp(s.lookH ?? 1, s.lookH1 ?? s.lookH ?? 1, u), to.z);
    return;
  }
  // orbit, crane and push all circle a point; crane and push just default to a fixed bearing.
  const at = pt(s.at);
  const a0 = s.a0 ?? s.a ?? 0, a1 = s.a1 ?? a0;
  const a = lerp(a0, a1, u), r = lerp(s.r, s.r1 ?? s.r, u), h = lerp(s.h, s.h1 ?? s.h, u);
  pos.set(at.x + Math.cos(a) * r, at.y + h, at.z + Math.sin(a) * r);
  look.set(at.x, at.y + lerp(s.lookH ?? 1, s.lookH1 ?? s.lookH ?? 1, u), at.z);
}

export function createDirector(camera) {
  let shots = null, index = 0, t = 0, clock = 0, onEnd = null, onShot = null, baseFov = camera.fov;
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), fromPos = new THREE.Vector3(), fromLook = new THREE.Vector3();
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  let fromFov = 0;
  // What the finishing pass needs for depth of field: the distance (along the view) that is sharp.
  const focus = { dist: 10, aperture: 1 };
  function restore() { if (camera.fov !== baseFov) { camera.fov = baseFov; camera.updateProjectionMatrix(); } }
  function finish() { const cb = onEnd; shots = null; onEnd = null; onShot = null; restore(); if (cb) cb(); }
  function begin(i) {
    // Remember where the camera was, for a soft blend into the new shot.
    fromPos.copy(camera.position); camera.getWorldDirection(fwd); fromLook.copy(camera.position).addScaledVector(fwd, Math.max(1, focus.dist)); fromFov = camera.fov;
    index = i; t = 0; if (onShot) onShot(shots[i]);
  }
  const director = {
    get active() { return !!shots; },
    get shot() { return shots ? shots[index] : null; },
    focus,
    // opts.onShot(shot) is called as each shot begins; opts.onEnd when the film is over or skipped.
    play(list, opts = {}) { shots = list; baseFov = camera.fov; clock = Math.random() * 50; onEnd = opts.onEnd || null; onShot = opts.onShot || null; begin(0); },
    skip() { if (shots) finish(); },
    // Moves the camera. Returns true while a film is playing.
    update(dt) {
      if (!shots) return false;
      const s = shots[index];
      t += dt; clock += dt;
      const lin = Math.min(1, t / s.dur), u = s.ease === 'linear' ? lin : ease(lin);
      frame(s, u, pos, look);
      // Handheld: a slow sway of the aim and a smaller one of the body, scaled by the distance to the subject.
      const drift = s.drift ?? 1;
      if (drift > 0) {
        const far = pos.distanceTo(look);
        look.x += wob(clock, 1) * far * 0.0035 * drift; look.y += wob(clock, 2) * far * 0.0025 * drift; look.z += wob(clock, 3) * far * 0.0035 * drift;
        pos.y += wob(clock * 0.8, 5) * 0.025 * drift; pos.x += wob(clock * 0.7, 6) * 0.02 * drift;
      }
      let fov = lerp(s.fov ?? baseFov, s.fov1 ?? s.fov ?? baseFov, u);
      // A soft blend from the previous camera instead of a cut.
      if (s.blend && t < s.blend) { const k = ease(t / s.blend); pos.lerpVectors(fromPos, pos, k); look.lerpVectors(fromLook, look, k); fov = lerp(fromFov, fov, k); }
      camera.position.copy(pos);
      camera.lookAt(look);
      if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
      // Focus: the subject (or a pull from one to another), measured along the view.
      let f = s.focus ? pt(s.focus) : null;
      if (f && s.focus1) { const [r0, r1] = s.rack || [0.35, 0.75]; const k = ease(Math.min(1, Math.max(0, (lin - r0) / (r1 - r0)))); const g = pt(s.focus1); tmp.set(lerp(f.x, g.x, k), lerp(f.y, g.y, k), lerp(f.z, g.z, k)); f = tmp; }
      camera.getWorldDirection(fwd);
      focus.dist = Math.max(0.5, f ? tmp.set(f.x, f.y, f.z).sub(camera.position).dot(fwd) : look.distanceTo(camera.position));
      focus.aperture = s.aperture ?? 1;
      if (t >= s.dur) { if (index + 1 >= shots.length) finish(); else begin(index + 1); }
      return true;
    },
  };
  return director;
}
