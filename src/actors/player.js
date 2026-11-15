import * as THREE from 'three';
import { createFigure } from './figure.js';
import { heightAt, wadeSpeedFactor, constrainToShore } from '../logic/terrain.js';
import { resolveCollisions } from '../logic/collision.js';
import { WALK_SPEED, RUN_SPEED, HOP_VELOCITY, GRAVITY, PLAYER_RADIUS, PLAYER_START, PALETTE } from '../config.js';

const SEAT_HEIGHT = 0.42;
const STEP_LENGTH = 1.0;

// opts.groundAt lets the world add walkable surfaces (the dock) on top of the terrain.
export function createPlayer(scene, opts = {}) {
  const groundAt = opts.groundAt || heightAt;
  const figure = createFigure({ bodyColor: PALETTE.player, accent: 'hat', accentColor: 0xf0d58c, neckerchief: 0xf2c94c, hairColor: 0x4a3328, skinColor: 0xd9a273, shortsColor: 0x3f8f8a, backpackColor: 0x6f9a5a });
  scene.add(figure.group);

  const position = new THREE.Vector3(PLAYER_START.x, groundAt(PLAYER_START.x, PLAYER_START.z), PLAYER_START.z);
  const facing = { x: 0, z: -1 };
  let vy = 0, airborne = false, heading = Math.atan2(facing.x, facing.z);
  let speed = 0, sinceStep = 0;

  const player = {
    position, facing, radius: PLAYER_RADIUS,
    sitting: false,
    speed: 0,
    moving: false,
    pushing: false,
    onStep: null, // (inWater: boolean) => void
    sit(seat) {
      player.sitting = true;
      position.set(seat.x, groundAt(seat.x, seat.z) + SEAT_HEIGHT, seat.z);
      facing.x = Math.sin(seat.rot); facing.z = Math.cos(seat.rot);
      heading = seat.rot;
      vy = 0; airborne = false;
    },
    update(dt, input, cameraYaw, colliders, elapsed) {
      const move = input.move;
      const wantsMove = move.x !== 0 || move.z !== 0;
      const wantsHop = input.consumeHop();

      if (player.sitting && (wantsMove || wantsHop)) {
        player.sitting = false;
        // Stand up in front of the seat rather than inside it.
        position.x += facing.x * 0.7; position.z += facing.z * 0.7;
      }

      let targetSpeed = 0;
      if (!player.sitting) {
        if (wantsMove) {
          // Camera-relative: forward is away from the camera.
          const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
          const rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw);
          const dx = rx * move.x + fx * move.z, dz = rz * move.x + fz * move.z;
          facing.x = dx; facing.z = dz;
          targetSpeed = (input.run ? RUN_SPEED : WALK_SPEED) * wadeSpeedFactor(groundAt(position.x, position.z));
        }
        speed += (targetSpeed - speed) * Math.min(1, dt * 8);
        if (speed > 0.01) {
          const prev = { x: position.x, z: position.z };
          let next = { x: position.x + facing.x * speed * dt, z: position.z + facing.z * speed * dt };
          next = resolveCollisions(next, PLAYER_RADIUS, colliders);
          next = constrainToShore(prev, next, groundAt);
          const moved = Math.hypot(next.x - prev.x, next.z - prev.z);
          position.x = next.x; position.z = next.z;
          // When something blocks the way, do not keep striding on the spot.
          if (dt > 0) speed = Math.min(speed, (moved / dt) * 1.15 + 0.2);
          sinceStep += moved;
          if (sinceStep >= STEP_LENGTH && !airborne) {
            sinceStep = 0;
            if (player.onStep) player.onStep(groundAt(position.x, position.z) < 0);
          }
        }

        const ground = groundAt(position.x, position.z);
        if (wantsHop && !airborne) { vy = HOP_VELOCITY; airborne = true; }
        if (airborne) {
          vy -= GRAVITY * dt;
          position.y += vy * dt;
          if (position.y <= ground) { position.y = ground; vy = 0; airborne = false; }
        } else {
          // Follow the ground smoothly so small bumps do not jitter.
          position.y += (ground - position.y) * Math.min(1, dt * 18);
        }
      } else {
        speed = 0;
      }

      // Turn smoothly toward the facing direction.
      const want = Math.atan2(facing.x, facing.z);
      let diff = want - heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      heading += diff * Math.min(1, dt * (player.sitting ? 30 : 10));

      player.speed = speed;
      player.moving = speed > 0.3;
      // True while a movement key is held, even when something is in the way.
      player.pushing = wantsMove && !player.sitting;
      figure.group.position.copy(position);
      figure.group.rotation.y = heading;
      figure.animate(airborne ? 0 : speed, elapsed, { sitting: player.sitting });
    },
  };
  return player;
}
