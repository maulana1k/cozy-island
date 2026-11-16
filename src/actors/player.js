import * as THREE from 'three';
import { createFigure } from './figure.js';
import { heightAt, wadeSpeedFactor, constrainToShore } from '../logic/terrain.js';
import { resolveCollisions } from '../logic/collision.js';
import { WALK_SPEED, RUN_SPEED, HOP_VELOCITY, GRAVITY, PLAYER_RADIUS, PLAYER_START, PALETTE } from '../config.js';


const ACCEL = 12, BRAKE = 14, AIR_ACCEL = 7;   // m/s²: how quickly speed builds up and bleeds off (slow enough to see the lean)
const TURN_RATE = 9;                            // how quickly the body swings round to its direction of travel
const JUMP_BUFFER = 0.14, COYOTE = 0.1;         // forgiving jump timing
const WIND_UP = 0.1, WIND_UP_BELOW = 1.6;       // a jump from (nearly) standing starts with a quick crouch (s); faster, you leap straight off the stride

// opts.groundAt lets the world add walkable surfaces (the dock) on top of the terrain.
// opts.surfaceAt names the kind of ground, and opts.surfaces gives each kind's speed factor.
export function createPlayer(scene, opts = {}) {
  const groundAt = opts.groundAt || heightAt;
  const surfaceAt = opts.surfaceAt || (() => 'grass');
  const surfaces = opts.surfaces || {};
  const figure = createFigure({ self: true, hairStyle: 1, eyeColor: 0x5b3a24, bodyColor: PALETTE.player, accent: 'cap', accentColor: 0xf0d58c, neckerchief: 0xf2c94c, hairColor: 0x4a3328, skinColor: 0xd9a273, shortsColor: 0x3f8f8a });
  scene.add(figure.group);

  const position = new THREE.Vector3(PLAYER_START.x, groundAt(PLAYER_START.x, PLAYER_START.z), PLAYER_START.z);
  const facing = { x: 0, z: -1 };
  const vel = { x: 0, z: 0 };
  let vy = 0, airborne = false, heading = Math.PI, yVel = 0;
  let buffer = 0, coyote = 0, land = 0, sinceStep = 0, windUp = -1;
  let gesture = null, look = null, onGround = false, idleFor = 0, nextFidget = 5, stumbleRest = 0;
  const FIDGETS = [['scratch', 1.3], ['stretch', 1.6], ['yawn', 1.6], ['tapfoot', 1.8], ['lookabout', 1.8], ['lookabout', 1.8]];

  const player = {
    position, facing, radius: PLAYER_RADIUS,
    sitting: false, speed: 0, moving: false, pushing: false, airborne: false, surface: 'grass',
    get heading() { return heading; },
    onStep: null, // (surface, running) => void
    onLand: null, // (surface) => void
    onOops: null, // (kind: 'stumble' | 'bonk' | 'skid') => void
    // Plays a one-off gesture; while standing still the body also turns to face what it is for.
    gesture(name = 'reach', seconds = 0.75, target = null) {
      gesture = { name, t: 0, dur: seconds };
      look = target ? { x: target.x, z: target.z, t: 0.5 } : null;
    },
    torch: false, setTorch(on) { player.torch = on; figure.setTorch(on); },
    focus: null, // { x, z } of the thing in reach, set by the game
    auto: null, // { x, z }: walk this way whatever the keys say (being turned back)
    speedFactor: 1, canRun: true, // set from how the scout is feeling
    riding: null, // set while hanging from the flying fox; the ride moves the player
    asleep: null, // set while lying in bed: { x, z, rot }
    act: null,    // joining in with the camp: { pose, sit }. Any movement stops it.
    // Called when a ride lets go at the bottom.
    landNow() { player.riding = null; airborne = false; vy = 0; vel.x = vel.z = 0; land = 1; if (player.onLand) player.onLand(surfaceAt(position.x, position.z)); },
    // Sit down right here on the ground.
    sitDown() {
      if (airborne || player.riding) return;
      player.sitting = true; onGround = true; vel.x = vel.z = 0; vy = 0;
      position.y = groundAt(position.x, position.z) - figure.sitDrop;
    },
    stand() { if (player.sitting) { player.sitting = false; position.y = groundAt(position.x, position.z); if (!onGround) { position.x += Math.sin(heading) * 0.7; position.z += Math.cos(heading) * 0.7; } onGround = false; } },
    sit(seat) {
      onGround = false;
      player.sitting = true;
      position.set(seat.x, groundAt(seat.x, seat.z) + figure.seatLift(0.5), seat.z);
      heading = seat.rot; vel.x = vel.z = 0; vy = 0; airborne = false;
    },
    update(dt, input, cameraYaw, colliders, elapsed) {
      if (player.asleep) {
        input.consumeHop(); vel.x = vel.z = 0; heading = player.asleep.rot; player.sitting = false;
        position.set(player.asleep.x, groundAt(player.asleep.x, player.asleep.z) + 0.2, player.asleep.z);
        player.speed = 0; player.moving = false; player.pushing = false;
        figure.group.position.copy(position); figure.group.rotation.y = heading;
        figure.animate(0, elapsed, { pose: 'sleep' });
        return;
      }
      if (player.riding) {
        input.consumeHop(); vel.x = vel.z = 0; heading = player.riding.heading;
        facing.x = Math.sin(heading); facing.z = Math.cos(heading);
        player.speed = 0; player.moving = false; player.pushing = false; player.sitting = false;
        figure.group.position.copy(position); figure.group.rotation.y = heading;
        figure.animate(0, elapsed, { pose: 'hang' });
        return;
      }
      const move = player.auto ? { x: 0, z: 1 } : input.move;
      const wantsMove = move.x !== 0 || move.z !== 0;
      buffer = input.consumeHop() ? JUMP_BUFFER : buffer - dt;

      if (player.sitting && (wantsMove || buffer > 0)) {
        buffer = 0;
        player.stand(); // off a seat you step forward; off the ground you just get up
      }

      if (player.act && (wantsMove || buffer > 0)) { player.act = null; buffer = 0; }
      const surface = surfaceAt(position.x, position.z);
      player.surface = surface;

      if (!player.sitting) {
        // Where the keys want to go, relative to the camera (forward is away from it).
        let tx = 0, tz = 0;
        if (wantsMove) {
          const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw), rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw);
          // Mud and soft sand are slower going; a trodden trail is a touch quicker.
          const top = (input.run && player.canRun ? RUN_SPEED : WALK_SPEED) * player.speedFactor * wadeSpeedFactor(groundAt(position.x, position.z)) * ((surfaces[surface] && surfaces[surface].speed) || 1);
          tx = (rx * move.x + fx * move.z) * top; tz = (rz * move.x + fz * move.z) * top;
          if (player.auto) { tx = player.auto.x * WALK_SPEED * 1.25; tz = player.auto.z * WALK_SPEED * 1.25; }
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
          const before = Math.hypot(vel.x, vel.z);
          if (dt > 0) { vel.x = (next.x - prev.x) / dt; vel.z = (next.z - prev.z) / dt; }
          // Running flat out into something: bounce off with a silly recoil.
          if (before > 3.5 && Math.hypot(vel.x, vel.z) < before * 0.3 && !airborne && !gesture) {
            vel.x = -Math.sin(heading) * 1.6; vel.z = -Math.cos(heading) * 1.6;
            gesture = { name: 'bonk', t: 0, dur: 0.7 }; if (player.onOops) player.onOops('bonk');
          }
          sinceStep += Math.hypot(next.x - prev.x, next.z - prev.z);
        }
        const speed = Math.hypot(vel.x, vel.z);
        // One footfall per step, in time with the legs (same step length as the animation).
        const stride = Math.max(0.2, figure.stepLength(speed));
        if (sinceStep >= stride && !airborne) {
          sinceStep = 0; if (player.onStep) player.onStep(surface, speed > 3.1);
          // Now and then a running scout trips over their own feet, more often on slippery ground.
          stumbleRest -= 1;
          if (speed > 3.5 && stumbleRest <= 0 && !gesture && Math.random() < (surface === 'mud' ? 0.14 : surface === 'forest' || surface === 'meadow' ? 0.035 : 0.018)) {
            gesture = { name: 'stumble', t: 0, dur: 0.75 }; vel.x *= 0.5; vel.z *= 0.5; stumbleRest = 14; if (player.onOops) player.onOops('stumble');
          }
        }
        // Letting go of the keys at a run: skid to a stop.
        if (!wantsMove && speed > 3.5 && !airborne && !gesture) { gesture = { name: 'skid', t: 0, dur: 0.45 }; if (player.onOops) player.onOops('skid'); }

        const ground = groundAt(position.x, position.z);
        coyote = airborne ? coyote - dt : COYOTE;
        // Jumping: from standing, crouch for a moment first (the push comes from the legs); from a run, go at once.
        if (buffer > 0 && coyote > 0 && windUp < 0) { buffer = 0; windUp = speed < WIND_UP_BELOW ? 0 : WIND_UP; }
        if (windUp >= 0) { windUp += dt; if (airborne && coyote <= 0) windUp = -1; }
        if (windUp >= WIND_UP) { vy = HOP_VELOCITY; airborne = true; coyote = 0; windUp = -1; }
        if (airborne) {
          vy -= GRAVITY * (vy > 0 ? 1 : 1.7) * dt; // falls a little faster than it rises
          position.y += vy * dt;
          if (position.y <= ground && vy <= 0) {
            position.y = ground; yVel = 0; airborne = false; land = Math.min(1, -vy / HOP_VELOCITY + 0.3); vy = 0;
            if (player.onLand) player.onLand(surface);
          }
        } else {
          // Follow the ground smoothly (critically damped, so steps and bumps never jolt). Feet sink a little into mud.
          const sink = surface === 'mud' ? 0.06 : 0, gap = ground - sink - position.y, h = Math.min(dt, 0.05);
          if (Math.abs(gap) > 1.2) { position.y += gap; yVel = 0; }
          else { yVel += (100 * gap - 20 * yVel) * h; position.y += yVel * h; if (position.y < ground - sink - 0.35) { position.y = ground - sink - 0.35; yVel = Math.max(0, yVel); } }
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
      land = Math.max(0, land - dt / 0.3);
      if (gesture) { gesture.t += dt; if (gesture.t >= gesture.dur) gesture = null; }
      // Left standing about, a scout soon starts to fidget.
      idleFor = speed < 0.1 && !gesture && !player.sitting && !player.act && !airborne ? idleFor + dt : 0;
      if (idleFor > nextFidget) { const f = FIDGETS[Math.floor(Math.random() * FIDGETS.length)]; gesture = { name: f[0], t: 0, dur: f[1] }; idleFor = 0; nextFidget = 4 + Math.random() * 6; }

      facing.x = Math.sin(heading); facing.z = Math.cos(heading);
      player.speed = speed; player.moving = speed > 0.3; player.airborne = airborne;
      player.pushing = wantsMove && !player.sitting;
      const act = player.act && !player.sitting && !airborne ? player.act : null;
      figure.group.position.copy(position);
      if (act && act.sit) figure.group.position.y -= figure.sitDrop;
      figure.group.rotation.y = heading;
      // The figure leans into bends and speeding up from how it is moving, so only the jump is spelled out.
      figure.animate(speed, elapsed, {
        pose: act ? act.pose : undefined,
        sitting: player.sitting && !onGround, sitGround: (player.sitting && onGround) || !!(act && act.sit), air: airborne ? vy / HOP_VELOCITY : undefined, land,
        crouch: windUp >= 0 ? Math.sin(Math.min(1, windUp / WIND_UP) * Math.PI * 0.5) : 0,
        gesture: gesture ? { name: gesture.name, u: gesture.t / gesture.dur } : null,
        sink: player.surface === 'mud' ? 0.05 : 0,
        hold: player.torch ? 'torch' : null,
        mood: player.mood || undefined, // how the scout is feeling, set by the game
        look: player.focus, // what you are about to use: the head and eyes turn to it
      });
    },
  };
  return player;
}
