import * as THREE from 'three';
import { heightAt } from './logic/terrain.js';
import { CAMERA } from './config.js';

const DEG = Math.PI / 180;
const LOOK_HEIGHT = 0.85;
const CAMERA_CLEARANCE = 0.5;
const INSIDE_PITCH = 46 * DEG, INSIDE_DISTANCE = 6.8;

function insideTall(x, z, colliders) {
  for (const c of colliders) {
    if (!c.tall) continue;
    const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
    const wx = x - c.x, wz = z - c.z;
    const lx = wx * cos - wz * sin, lz = wx * sin + wz * cos;
    if (Math.abs(lx) < c.hw + CAMERA_CLEARANCE && Math.abs(lz) < c.hd + CAMERA_CLEARANCE) return true;
  }
  return false;
}

export function createFollowCamera(camera) {
  const target = new THREE.Vector3();
  let initialised = false;
  let pitch = 19 * DEG, livePitch = pitch, wantDistance = CAMERA.distance, distance = CAMERA.distance, insideBlend = 0;
  const offset = new THREE.Vector3();
  const baseFov = camera.fov;

  const rig = {
    yaw: 0,
    // opts.inside: the player is in a building, so look down into it from above.
    // opts.speed: the player's speed, for a gentle widening of the view when running.
    update(dt, targetPosition, input, colliders, opts = {}) {
      const look = input.consumeLook();
      rig.yaw -= look.dx * 0.005;
      pitch = THREE.MathUtils.clamp(pitch + look.dy * 0.004, CAMERA.minPitch * DEG, CAMERA.maxPitch * DEG);
      wantDistance = THREE.MathUtils.clamp(wantDistance + input.consumeZoom() * 0.006, CAMERA.minDistance, CAMERA.maxDistance);

      insideBlend += ((opts.inside ? 1 : 0) - insideBlend) * (1 - Math.exp(-dt * 4));
      livePitch = Math.max(pitch, pitch + (INSIDE_PITCH - pitch) * insideBlend);
      const reachWanted = wantDistance + (Math.max(wantDistance, INSIDE_DISTANCE) - wantDistance) * insideBlend;

      // The camera trails the player softly: quicker sideways, gentler up and down.
      if (!initialised) { target.copy(targetPosition); initialised = true; }
      const kxz = 1 - Math.exp(-dt * 9), ky = 1 - Math.exp(-dt * 5);
      target.x += (targetPosition.x - target.x) * kxz; target.z += (targetPosition.z - target.z) * kxz;
      target.y += (targetPosition.y - target.y) * ky;
      const tx = target.x, ty = target.y + LOOK_HEIGHT, tz = target.z;

      offset.set(Math.sin(rig.yaw) * Math.cos(livePitch), Math.sin(livePitch), Math.cos(rig.yaw) * Math.cos(livePitch));

      // Walk outward from the player; stop before a tent or the ground gets in the way.
      let allowed = reachWanted;
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const d = (reachWanted * i) / steps;
        const x = tx + offset.x * d, y = ty + offset.y * d, z = tz + offset.z * d;
        if (y < heightAt(x, z) + 0.35 || (!opts.inside && y < 4.6 && insideTall(x, z, colliders))) {
          allowed = Math.max(1.2, (reachWanted * (i - 1)) / steps);
          break;
        }
      }
      // Pull in quickly, ease back out slowly.
      distance += (allowed - distance) * (1 - Math.exp(-dt * (allowed < distance ? 14 : 2.5)));

      camera.position.set(tx + offset.x * distance, Math.max(ty + offset.y * distance, 0.4), tz + offset.z * distance);
      camera.lookAt(tx, ty, tz);

      const fov = baseFov + Math.min(1, Math.max(0, ((opts.speed || 0) - 4) / 3)) * 5;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 4)); camera.updateProjectionMatrix(); }
    },
  };
  return rig;
}
