import { MAX_DT } from '../config.js';

// Keeps one frame's time step sane, e.g. after the tab was hidden for a while.
export function clampDt(dt) {
  if (!(dt > 0)) return 0;
  return Math.min(dt, MAX_DT);
}
