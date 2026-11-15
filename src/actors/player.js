import * as THREE from 'three';
import { createFigure } from './figure.js';
import { heightAt, wadeSpeedFactor, constrainToShore } from '../logic/terrain.js';
import { resolveCollisions } from '../logic/collision.js';
import { WALK_SPEED, RUN_SPEED, HOP_VELOCITY, GRAVITY, PLAYER_RADIUS, PLAYER_START, PALETTE } from '../config.js';

const SEAT_HEIGHT = 0.3;
const ACCEL = 18, BRAKE = 22, AIR_ACCEL = 7;   // m/s²: how quickly speed builds up and bleeds off
const TURN_RATE = 9;                            // how quickly the body swings round to its direction of travel
const JUMP_BUFFER = 0.14, COYOTE = 0.1;         // forgiving jump timing

// opts.groundAt lets the world add walkable surfaces (the dock) on top of the terrain.
// opts.surfaceAt names the kind of ground, and opts.surfaces gives each kind's speed factor.
export function createPlayer(scene, opts = {}) {
  const groundAt = opts.groundAt || heightAt;
  const surfaceAt = opts.surfaceAt || (() => 'grass');
  const surfaces = opts.surfaces || {};
  const figure = createFigure({ bodyColor: PALETTE.player, accent: 'hat', accentColor: 0xf0d58c, neckerchief: 0xf2c94c, hairColor: 0x4a3328, skinColor: 0xd9a273, shortsColor: 0x3f8f8a, backpackColor: 0x6f9a5a });
  scene.add(figure.group);

  const position = new THREE.Vector3(PLAYER_START.x, groundAt(PLAYER_START.x, PLAYER_START.z), PLAYER_START.z);
  const facing = { x: 0, z: -1 };
  const vel = { x: 0, z: 0 };
  let vy = 0, airborne = false, heading = Math.PI;
  let buffer = 0, coyote = 0, land = 0, roll = 0, pitch = 0, sinceStep = 0, lastSpeed = 0;
  let gesture = null, look = null;

  const player = {
    position, facing, radius: PLAYER_RADIUS,
    sitting: false, speed: 0, moving: false, pushing: false, airborne: false, surface: 'grass',
    get heading() { return heading; },
    onStep: null, // (surface, running) => void
    onLand: null, // (surface) => void
    // Plays a one-off gesture; while standing still the body also turns to face what it is for.
    gesture(name = 'reach', seconds = 0.75, target = null) {
      gesture = { name, t: 0, dur: seconds };
      look = target ? { x: target.x, z: target.z, t: 0.5 } : null;
    },
    riding: null, // set while hanging from the flying fox; the ride moves the player
    // Called when a ride lets go at the bottom.
    landNow() { player.riding = null; airborne = false; vy = 0; vel.x = vel.z = 0; land = 1; if (player.onLand) player.onLand(surfaceAt(position.x, position.z)); },
    sit(seat) {
      player.sitting = true;
      position.set(seat.x, groundAt(seat.x, seat.z) + SEAT_HEIGHT, seat.z);
      heading = seat.rot; vel.x = vel.z = 0; vy = 0; airborne = false;
    },
    update(dt, input, cameraYaw, colliders, elapsed) {
      if (player.riding) {
        input.consumeHop(); vel.x = vel.z = 0; heading = player.riding.heading;
        facing.x = Math.sin(heading); facing.z = Math.cos(heading);
        player.speed = 0; player.moving = false; player.pushing = false; player.sitting = false;
        figure.group.position.copy(position); figure.group.rotation.y = heading;
        figure.animate(0, elapsed, { pose: 'hang' });
        return;
      }
      const move = input.move;
      const wantsMove = move.x !== 0 || move.z !== 0;
      buffer = input.consumeHop() ? JUMP_BUFFER : buffer - dt;

      if (player.sitting && (wantsMove || buffer > 0)) {
        player.sitting = false; buffer = 0;
        // Stand up in front of the seat rather than inside it.
        position.x += Math.sin(heading) * 0.7; position.z += Math.cos(heading) * 0.7;
      }

      const surface = surfaceAt(position.x, position.z);
      player.surface = surface;

      if (!player.sitting) {
        // Where the keys want to go, relative to the camera (forward is away from it).
        let tx = 0, tz = 0;
        if (wantsMove) {
          const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw), rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw);
          // Mud and soft sand are slower going; a trodden trail is a touch quicker.
          const top = (input.run ? RUN_SPEED : WALK_SPEED) * wadeSpeedFactor(groundAt(position.x, position.z)) * ((surfaces[surface] && surfaces[surface].speed) || 1);
          tx = (rx * move.x + fx * move.z) * top; tz = (rz * move.x + fz * move.z) * top;
        }
        // Speed builds up and bleeds off instead of switching on and off.
        const dvx = tx - vel.x, dvz = tz - vel.z, dv = Math.hypot(dvx, dvz);
        const rate = (airborne ? AIR_ACCEL : wantsMove ? ACCEL : BRAKE) * dt;
        if (dv <= rate) { vel.x = tx; vel.z = tz; } else { vel.x += (dvx / dv) * rate; vel.z += (dvz / dv) * rate; }

        if (Math.hypot(vel.x, vel.z) > 0.01) {
          const prev = { x: position.x, z: position.z };
          let next = { x: position.x + vel.x * dt, z: position.z + vel.z * dt };
          next = resolveCollisions(next, PLAYER_RADIUS, colliders);
          next = constrainToShore(prev, next, groundAt);
          position.x = next.x; position.z = next.z;
          // Whatever a wall took away is gone from the speed too, so you slide along it.
          if (dt > 0) { vel.x = (next.x - prev.x) / dt; vel.z = (next.z - prev.z) / dt; }
          sinceStep += Math.hypot(next.x - prev.x, next.z - prev.z);
        }
        const speed = Math.hypot(vel.x, vel.z);
        // One footfall per step, in time with the legs (same step length as the animation).
        const stride = 0.3 + 0.1 * speed;
        if (sinceStep >= stride && !airborne) { sinceStep = 0; if (player.onStep) player.onStep(surface, speed > 4); }

        const ground = groundAt(position.x, position.z);
        coyote = airborne ? coyote - dt : COYOTE;
        if (buffer > 0 && coyote > 0) { vy = HOP_VELOCITY; airborne = true; buffer = 0; coyote = 0; }
        if (airborne) {
          vy -= GRAVITY * (vy > 0 ? 1 : 1.7) * dt; // falls a little faster than it rises
          position.y += vy * dt;
          if (position.y <= ground && vy <= 0) {
            position.y = ground; airborne = false; land = Math.min(1, -vy / HOP_VELOCITY + 0.3); vy = 0;
            if (player.onLand) player.onLand(surface);
          }
        } else {
          // Follow the ground smoothly so small bumps do not jitter. Feet sink a little into mud.
          const sink = surface === 'mud' ? 0.06 : 0;
          position.y += (ground - sink - position.y) * Math.min(1, dt * 18);
        }
      } else {
        vel.x = vel.z = 0;
      }

      // The body swings round toward where it is going, leaning into the turn.
      const speed = Math.hypot(vel.x, vel.z);
      let turned = 0;
      if (!player.sitting) {
        let want = null;
        if (speed > 0.25) want = Math.atan2(vel.x, vel.z);
        else if (look && look.t > 0) want = Math.atan2(look.x - position.x, look.z - position.z);
        if (want !== null) {
          let diff = want - heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          turned = diff * (1 - Math.exp(-dt * (speed > 0.25 ? TURN_RATE : 12)));
          heading += turned;
        }
      }
      if (look) look.t -= dt;
      const turnSpeed = dt > 0 ? turned / dt : 0;
      const k = 1 - Math.exp(-dt * 8);
      roll += (Math.max(-0.3, Math.min(0.3, -turnSpeed * 0.035 * Math.min(1, speed / 4))) - roll) * k;
      const accel = dt > 0 ? (speed - lastSpeed) / dt : 0;
      pitch += (Math.max(-0.16, Math.min(0.16, accel * 0.009)) - pitch) * k;
      lastSpeed = speed;
      land = Math.max(0, land - dt / 0.3);
      if (gesture) { gesture.t += dt; if (gesture.t >= gesture.dur) gesture = null; }

      facing.x = Math.sin(heading); facing.z = Math.cos(heading);
      player.speed = speed; player.moving = speed > 0.3; player.airborne = airborne;
      player.pushing = wantsMove && !player.sitting;
      figure.group.position.copy(position);
      figure.group.rotation.y = heading;
      figure.animate(airborne ? 0 : speed, elapsed, {
        sitting: player.sitting, air: airborne ? vy / HOP_VELOCITY : undefined, land, roll, pitch,
        gesture: gesture ? { name: gesture.name, u: gesture.t / gesture.dur } : null,
      });
    },
  };
  return player;
}
