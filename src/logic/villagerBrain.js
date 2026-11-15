// How a villager decides what to do. No rendering here.
import { resolveCollisions } from './collision.js';
import { heightAt } from './terrain.js';
import {
  VILLAGER_SPEED, VILLAGER_RADIUS, VILLAGER_PAUSE, NUDGE_DISTANCE, NUDGE_TIME, NUDGE_COOLDOWN,
  BELL_HEAR_RANGE, BELL_LOOK_TIME, MIN_DRY_HEIGHT,
} from '../config.js';

const MAX_STEP = 0.05; // big time steps are split so nobody tunnels through a wall
const STUCK_TIME = 1.5;

const pause = (rng) => VILLAGER_PAUSE[0] + rng() * (VILLAGER_PAUSE[1] - VILLAGER_PAUSE[0]);

export function createVillager(id, start, rng) {
  return {
    id, x: start.x, z: start.z,
    facing: { x: 0, z: 1 },
    state: 'idle', timer: pause(rng), cooldown: 0,
    target: null, speed: 0, stuck: 0, nudge: null, resume: null,
  };
}

// Moves toward (tx, tz) by at most `dist`, staying on dry land and out of colliders.
// Returns how far the villager actually got.
function moveToward(v, tx, tz, dist, colliders) {
  const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  const step = Math.min(dist, d);
  let next = { x: v.x + (dx / d) * step, z: v.z + (dz / d) * step };
  next = resolveCollisions(next, VILLAGER_RADIUS, colliders);
  if (heightAt(next.x, next.z) < MIN_DRY_HEIGHT) return 0;
  let moved = Math.hypot(next.x - v.x, next.z - v.z);
  // Being pushed out of a collider must never make a villager faster than its own pace.
  if (moved > step) { const k = step / moved; next = { x: v.x + (next.x - v.x) * k, z: v.z + (next.z - v.z) * k }; moved = step; }
  if (heightAt(next.x, next.z) < MIN_DRY_HEIGHT) return 0;
  v.x = next.x; v.z = next.z;
  return moved;
}

function pickTarget(v, world) {
  const options = world.spots.filter((s) => Math.hypot(s.x - v.x, s.z - v.z) > 1.5);
  const spot = options[Math.floor(world.rng() * options.length)] || world.spots[0];
  // Aim a little off the exact spot so two villagers do not stand inside each other.
  v.target = { x: spot.x + (world.rng() - 0.5) * 1.2, z: spot.z + (world.rng() - 0.5) * 1.2 };
  if (heightAt(v.target.x, v.target.z) < MIN_DRY_HEIGHT) v.target = { x: spot.x, z: spot.z };
  v.state = 'walk'; v.stuck = 0;
}

function stepOnce(v, dt, world) {
  v.cooldown = Math.max(0, v.cooldown - dt);
  v.speed = 0;

  if (v.state === 'idle') {
    v.timer -= dt;
    if (v.timer <= 0) pickTarget(v, world);
  } else if (v.state === 'walk') {
    const dx = v.target.x - v.x, dz = v.target.z - v.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { v.state = 'idle'; v.timer = pause(world.rng); return; }
    v.facing.x = dx / d; v.facing.z = dz / d;
    const want = VILLAGER_SPEED * dt;
    const moved = moveToward(v, v.target.x, v.target.z, want, world.colliders);
    v.speed = dt > 0 ? moved / dt : 0;
    // Blocked by a wall or the shore: give up on this spot after a moment and pick another.
    if (moved < want * 0.3) { v.stuck += dt; if (v.stuck > STUCK_TIME) { v.state = 'idle'; v.timer = 0.6; } }
    else v.stuck = 0;
  } else if (v.state === 'nudged') {
    v.timer -= dt;
    const speed = NUDGE_DISTANCE / NUDGE_TIME;
    moveToward(v, v.nudge.x, v.nudge.z, speed * dt, world.colliders);
    if (v.timer <= 0) { v.state = 'idle'; v.timer = 0.8 + world.rng() * 1.2; v.nudge = null; }
  } else if (v.state === 'look') {
    v.timer -= dt;
    if (v.timer <= 0) {
      if (v.resume) { v.target = v.resume; v.resume = null; v.state = 'walk'; v.stuck = 0; }
      else { v.state = 'idle'; v.timer = 0.5 + world.rng(); }
    }
  }
}

export function stepVillager(v, dt, world) {
  if (!(dt > 0)) return;
  let left = Math.min(dt, 10);
  while (left > 1e-9) { const h = Math.min(left, MAX_STEP); stepOnce(v, h, world); left -= h; }
}

// Pushes a villager a step away from `from`. Refused while they are still recovering.
export function nudgeVillager(v, from) {
  if (v.cooldown > 0) return false;
  let dx = v.x - from.x, dz = v.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { dx = v.facing.x; dz = v.facing.z; } else { dx /= d; dz /= d; }
  v.nudge = { x: v.x + dx * NUDGE_DISTANCE, z: v.z + dz * NUDGE_DISTANCE };
  v.facing.x = -dx; v.facing.z = -dz; // turn to look at whoever bumped them
  v.state = 'nudged'; v.timer = NUDGE_TIME; v.cooldown = NUDGE_COOLDOWN;
  return true;
}

// Villagers near the bell stop and look toward it for a moment.
export function hearBell(v, bell) {
  if (v.state === 'nudged') return;
  const dx = bell.x - v.x, dz = bell.z - v.z, d = Math.hypot(dx, dz);
  if (d > BELL_HEAR_RANGE) return;
  if (d > 1e-6) { v.facing.x = dx / d; v.facing.z = dz / d; }
  v.resume = v.state === 'walk' ? v.target : null;
  v.state = 'look'; v.timer = BELL_LOOK_TIME;
}

// Makes a walking villager wait briefly, e.g. when the player is standing in the way.
export function waitAMoment(v, seconds) {
  if (v.state === 'walk') { v.resume = v.target; v.state = 'look'; v.timer = seconds; }
}
