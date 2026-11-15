import { INTERACT_RANGE, INTERACT_CLOSE, INTERACT_CONE } from '../config.js';

// Picks the nearest usable thing that is in reach and roughly in front of the player.
// Very close things count even when they are behind.
export function pickInteractable(player, facing, items) {
  const flen = Math.hypot(facing.x, facing.z) || 1;
  let best = null, bestDist = Infinity;
  for (const item of items) {
    if (item.enabled === false) continue;
    const dx = item.position.x - player.x, dz = item.position.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > INTERACT_RANGE || d >= bestDist) continue;
    if (d > INTERACT_CLOSE) {
      const dot = (dx * facing.x + dz * facing.z) / (d * flen);
      if (dot <= INTERACT_CONE) continue;
    }
    best = item; bestDist = d;
  }
  return best;
}
