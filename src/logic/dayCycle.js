import { DAY_LENGTH } from '../config.js';

// Time of day `t` is a fraction of a day in [0, 1). 0 is midnight.
const SUNRISE = 0.10;
const SUNSET = 0.88;

export function advance(t, dtSeconds) {
  const next = (t + dtSeconds / DAY_LENGTH) % 1;
  return next < 0 ? next + 1 : next;
}

export function phaseAt(t) {
  if (t >= 0.88 || t < 0.10) return 'night';
  if (t < 0.35) return 'morning';
  if (t < 0.55) return 'day';
  if (t < 0.72) return 'golden';
  return 'sunset';
}

// 0 by day, 1 at night, with linear dusk (0.80–0.88) and dawn (0.04–0.12) ramps.
export function nightFactor(t) {
  if (t >= 0.12 && t <= 0.80) return 0;
  if (t > 0.80 && t < 0.88) return (t - 0.80) / 0.08;
  if (t > 0.04 && t < 0.12) return 1 - (t - 0.04) / 0.08;
  return 1;
}

// Unit vector pointing toward the sun. Above the horizon between SUNRISE and SUNSET.
export function sunDirection(t) {
  let angle;
  if (t >= SUNRISE && t < SUNSET) {
    angle = Math.PI * (t - SUNRISE) / (SUNSET - SUNRISE);
  } else {
    const tn = t < SUNRISE ? t + 1 : t;
    angle = Math.PI + Math.PI * (tn - SUNSET) / (1 + SUNRISE - SUNSET);
  }
  const x = Math.cos(angle), y = Math.sin(angle), z = 0.35;
  const len = Math.hypot(x, y, z);
  return { x: x / len, y: y / len, z: z / len };
}

// Key looks through the day; values between keys are blended.
const NIGHT = { top: 0x232f66, horizon: 0x52639e, sun: 0xa9bcff, ambient: 0x8f9ee0, fog: 0x44548c, sunIntensity: 0.7, ambientIntensity: 1.25 };
const KEYS = [
  [0.00, NIGHT],
  [0.06, NIGHT],
  [0.10, { top: 0x46539a, horizon: 0xc98f9c, sun: 0xc0a0c0, ambient: 0x9f90c4, fog: 0x86709e, sunIntensity: 0.12, ambientIntensity: 0.9 }],
  [0.14, { top: 0x6f86c9, horizon: 0xffc2a8, sun: 0xffc49a, ambient: 0xd9c4d6, fog: 0xf2c4b4, sunIntensity: 1.3, ambientIntensity: 0.8 }],
  [0.25, { top: 0x8fc7f2, horizon: 0xfde8cf, sun: 0xfff1d6, ambient: 0xeaf4ff, fog: 0xe8eef0, sunIntensity: 2.4, ambientIntensity: 0.9 }],
  [0.48, { top: 0x79bdf0, horizon: 0xdff1f7, sun: 0xfffaf0, ambient: 0xf0f8ff, fog: 0xd6ecf4, sunIntensity: 2.8, ambientIntensity: 1.0 }],
  [0.66, { top: 0x8fb8e6, horizon: 0xffdfae, sun: 0xffe4bc, ambient: 0xfff0e0, fog: 0xf8dcb4, sunIntensity: 2.5, ambientIntensity: 0.95 }],
  [0.80, { top: 0x6a6fb8, horizon: 0xff9d7a, sun: 0xff9966, ambient: 0xe2b6c4, fog: 0xf0a58c, sunIntensity: 1.8, ambientIntensity: 0.75 }],
  [0.88, { top: 0x3a3f85, horizon: 0xa878a8, sun: 0xb090c0, ambient: 0x8f86c0, fog: 0x6f5f94, sunIntensity: 0.12, ambientIntensity: 0.85 }],
  [0.93, NIGHT],
  [1.00, NIGHT],
];

function mixHex(a, b, f) {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * f);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function skyColors(t) {
  let i = 0;
  while (i < KEYS.length - 2 && t >= KEYS[i + 1][0]) i++;
  const [t0, a] = KEYS[i], [t1, b] = KEYS[i + 1];
  const f = t1 === t0 ? 0 : Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return {
    top: mixHex(a.top, b.top, f),
    horizon: mixHex(a.horizon, b.horizon, f),
    sun: mixHex(a.sun, b.sun, f),
    ambient: mixHex(a.ambient, b.ambient, f),
    fog: mixHex(a.fog, b.fog, f),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * f,
    ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * f,
  };
}
