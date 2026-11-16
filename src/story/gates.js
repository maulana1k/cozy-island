// INTERNAL. Light time gating (design section 10, decision 3): a few story steps need night, low tide or clear
// weather. Pure functions: the tide is a simple twice-a-day rhythm that slips about 50 minutes later each day,
// like a real one. Nothing in the water moves yet (phase 1); the tide board by the fisherman's hut and the
// field guide say when it is low.

const PERIOD = 12.42; // hours between two low tides

// Tide height from -1 (lowest) to 1 (highest), for a day number and a time of day (0..1).
export function tideAt(day, t) {
  const hours = (day - 1) * 24 + t * 24;
  return Math.cos(((hours - 3.2) / PERIOD) * Math.PI * 2);
}
export const isLowTide = (day, t) => tideAt(day, t) < -0.7;
export const isNight = (t) => t >= 0.82 || t < 0.2;

// The next time (day, t) a gate opens, searched in 10-minute steps over two days. Returns null when it is open now.
export function nextOpening(gate, day, t, weatherKind = 'sun') {
  const open = (d, x) => (gate === 'night' ? isNight(x) : gate === 'lowtide' ? isLowTide(d, x) : gate === 'morning' ? x >= 0.25 && x < 0.3 : gate === 'clear' ? true : true);
  if (gate === 'clear') return weatherKind === 'sun' || weatherKind === 'wind' ? null : { day, t: (t + 2 / 24) % 1, wraps: t + 2 / 24 >= 1 };
  if (gate !== 'morning' && open(day, t)) return null;
  for (let k = 1; k <= 288; k++) {
    let x = t + k / 144, d = day;
    while (x >= 1) { x -= 1; d++; }
    if (open(d, x)) return { day: d, t: x, wraps: d > day };
  }
  return null;
}

// "16:05"-style text for the tide board: today's low tides.
export function lowTidesOn(day) {
  const out = [];
  for (let k = 0; k < 144; k++) {
    const x = k / 144, v = tideAt(day, x);
    if (v <= tideAt(day, x - 1 / 144) && v < tideAt(day, x + 1 / 144)) out.push(x);
  }
  return out;
}

export const GATE_TEXT = {
  night: { when: 'after dark', wait: 'Wait until nightfall' },
  lowtide: { when: 'at low tide', wait: 'Wait for low tide' },
  clear: { when: 'in clear weather', wait: 'Wait for the weather to clear' },
  morning: { when: 'in the morning', wait: 'Sleep until morning' },
};
