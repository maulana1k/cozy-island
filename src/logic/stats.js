// How the scout is feeling: fed, watered, rested and cheerful, each from 0 to 100.
// Nothing here can hurt you. Running low only makes you a little slower until you look after yourself.
const clamp = (v) => Math.max(0, Math.min(100, v));

export const STAT_KEYS = ['food', 'water', 'energy', 'cheer'];
export const STAT_LABEL = { food: 'Food', water: 'Water', energy: 'Energy', cheer: 'Cheer' };
export const LOW = 25;

export function createStats() {
  const s = { food: 78, water: 72, energy: 100, cheer: 60, winded: false };
  const stats = {
    get food() { return s.food; }, get water() { return s.water; }, get energy() { return s.energy; }, get cheer() { return s.cheer; },
    get winded() { return s.winded; },
    get hungry() { return s.food < LOW; }, get thirsty() { return s.water < LOW; },
    // Out of puff: no running until some breath is back.
    get canRun() { return !s.winded; },
    get speedFactor() { return (s.food < 12 || s.water < 12 ? 0.85 : 1) * (s.cheer >= 80 ? 1.06 : 1); },
    add(effect) { for (const k of STAT_KEYS) if (effect[k]) s[k] = clamp(s[k] + effect[k]); if (s.energy >= 30) s.winded = false; },
    set(k, v) { s[k] = clamp(v); if (k === 'energy' && v >= 30) s.winded = false; },
    // state: { running, moving, sitting, cosy } where cosy is sitting by a lit fire or joining in.
    tick(dt, state) {
      const effort = state.running ? 2.1 : state.moving ? 1.15 : 1;
      s.food = clamp(s.food - (100 / 720) * effort * dt);
      s.water = clamp(s.water - (100 / 540) * effort * dt);
      const wellFed = s.food < LOW || s.water < LOW ? 0.4 : 1;
      if (state.running) s.energy = clamp(s.energy - (100 / 70) * dt);
      else s.energy = clamp(s.energy + (state.sitting ? 11 : state.moving ? 2.5 : 5.5) * wellFed * dt);
      if (s.energy <= 0) s.winded = true;
      if (s.energy >= 30) s.winded = false;
      // Cheer settles back toward the middle, lower when hungry or thirsty, and rises when cosy.
      const rest = s.food < LOW || s.water < LOW ? 30 : 55;
      s.cheer = clamp(s.cheer + Math.sign(rest - s.cheer) * Math.min(Math.abs(rest - s.cheer), (100 / 900) * dt));
      if (state.cosy) s.cheer = clamp(s.cheer + 1.6 * dt);
    },
  };
  return stats;
}
