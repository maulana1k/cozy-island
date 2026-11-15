import * as THREE from 'three';
import { heightAt } from './logic/terrain.js';
import { CAMERA } from './config.js';

const DEG = Math.PI / 180;
const LOOK_HEIGHT = 1.15;
const CAMERA_CLEARANCE = 0.5;

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
  let pitch = 19 * DEG, wantDistance = CAMERA.distance, distance = CAMERA.distance;
  const offset = new THREE.Vector3();

  const rig = {
    yaw: 0,
    update(dt, targetPosition, input, colliders) {
      const look = input.consumeLook();
      rig.yaw -= look.dx * 0.005;
      pitch = THREE.MathUtils.clamp(pitch + look.dy * 0.004, CAMERA.minPitch * DEG, CAMERA.maxPitch * DEG);
      wantDistance = THREE.MathUtils.clamp(wantDistance + input.consumeZoom() * 0.006, CAMERA.minDistance, CAMERA.maxDistance);

      if (!initialised) { target.copy(targetPosition); initialised = true; }
      target.lerp(targetPosition, Math.min(1, dt * 9));
      const tx = target.x, ty = target.y + LOOK_HEIGHT, tz = target.z;

      offset.set(Math.sin(rig.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(rig.yaw) * Math.cos(pitch));

      // Walk outward from the player; stop before a cottage or the ground gets in the way.
      let allowed = wantDistance;
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const d = (wantDistance * i) / steps;
        const x = tx + offset.x * d, y = ty + offset.y * d, z = tz + offset.z * d;
        if (y < heightAt(x, z) + 0.35 || (y < 5.5 && insideTall(x, z, colliders))) {
          allowed = Math.max(1.2, (wantDistance * (i - 1)) / steps);
          break;
        }
      }
      // Pull in quickly, ease back out slowly.
      distance += (allowed - distance) * Math.min(1, dt * (allowed < distance ? 16 : 3));

      camera.position.set(tx + offset.x * distance, Math.max(ty + offset.y * distance, 0.4), tz + offset.z * distance);
      camera.lookAt(tx, ty, tz);
    },
  };
  return rig;
}
