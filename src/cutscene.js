// A tiny film director: takes the camera away from the player for a few seconds and flies it
// through a list of shots. Each shot circles a point: { at: {x, y, z}, r, h, a0, a1, lookH, dur, title, sub }.
import * as THREE from 'three';

const smooth = (t) => t * t * (3 - 2 * t);

export function createDirector(camera) {
  let shots = null, index = 0, t = 0, onEnd = null, onShot = null;
  const look = new THREE.Vector3();
  function finish() { const cb = onEnd; shots = null; onEnd = null; onShot = null; if (cb) cb(); }
  const director = {
    get active() { return !!shots; },
    get shot() { return shots ? shots[index] : null; },
    // opts.onShot(shot) is called as each shot begins; opts.onEnd when the film is over or skipped.
    play(list, opts = {}) { shots = list; index = 0; t = 0; onEnd = opts.onEnd || null; onShot = opts.onShot || null; if (onShot) onShot(list[0]); },
    skip() { if (shots) finish(); },
    // Moves the camera. Returns true while a film is playing.
    update(dt) {
      if (!shots) return false;
      const s = shots[index];
      t += dt;
      const at = typeof s.at === 'function' ? s.at() : s.at;
      const u = smooth(Math.min(1, t / s.dur)), a = s.a0 + (s.a1 - s.a0) * u, r = s.r + ((s.r1 ?? s.r) - s.r) * u, h = s.h + ((s.h1 ?? s.h) - s.h) * u;
      camera.position.set(at.x + Math.cos(a) * r, at.y + h, at.z + Math.sin(a) * r);
      look.set(at.x, at.y + (s.lookH ?? 1), at.z);
      camera.lookAt(look);
      if (t >= s.dur) { index++; t = 0; if (index >= shots.length) finish(); else if (onShot) onShot(shots[index]); }
      return true;
    },
  };
  return director;
}
