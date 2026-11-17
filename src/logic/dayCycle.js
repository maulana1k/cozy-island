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

// Key looks through the day; values between keys are blended. The sky runs from a deeper zenith (`top`)
// down to a pale horizon; `fog` is the haze distant land fades into (aerial perspective, see
// src/world/toon.js). `ambient` is the hemisphere light's sky colour (also the cool tint of shade) and
// `ground` its warm bounce from below. The ambient values also tint the sea, so keep them steady.
const NIGHT = { top: 0x070b24, horizon: 0x18203f, sun: 0x8fa4e6, ambient: 0x56669f, ground: 0x37406a, fog: 0x0e142c, sunIntensity: 0.2, ambientIntensity: 0.3 }; // properly dark: bring a torch
const KEYS = [
  [0.00, NIGHT],
  [0.06, NIGHT],
  // Sunrise and sunset are the dramatic hours: deep indigo overhead, hot orange low down, a strong warm sun and a
  // cooler, dimmer shade for contrast (the long warm rim). src/main.js also thins the haze then in clear weather.
  [0.10, { top: 0x2b2c7a, horizon: 0xff7a4a, sun: 0xff9a5c, ambient: 0x7f80c0, ground: 0xc0809a, fog: 0xb86a86, sunIntensity: 0.5, ambientIntensity: 0.7 }],
  [0.14, { top: 0x2a3592, horizon: 0xff8a48, sun: 0xffa060, ambient: 0x9aa0d6, ground: 0xf0a888, fog: 0xe0806e, sunIntensity: 2.2, ambientIntensity: 0.62 }],
  [0.23, { top: 0x2f4cb0, horizon: 0xff9c58, sun: 0xffb478, ambient: 0xaab8e6, ground: 0xf0bc98, fog: 0xe89a7c, sunIntensity: 2.6, ambientIntensity: 0.68 }],
  [0.32, { top: 0x4ea6e6, horizon: 0xe6f2ee, sun: 0xfff2da, ambient: 0xd8e8ff, ground: 0xe0dcc4, fog: 0xc8dcea, sunIntensity: 2.6, ambientIntensity: 0.9 }],
  [0.48, { top: 0x3f9ce0, horizon: 0xe2f1f0, sun: 0xfff4e0, ambient: 0xd6e6ff, ground: 0xdcdcc0, fog: 0xc0d9ea, sunIntensity: 3.0, ambientIntensity: 0.95 }],
  [0.66, { top: 0x4aa2e0, horizon: 0xf0eedc, sun: 0xffeac4, ambient: 0xd9e4fb, ground: 0xe2d8bc, fog: 0xd0dde0, sunIntensity: 3.0, ambientIntensity: 0.9 }],
  [0.74, { top: 0x4a7ed0, horizon: 0xffc88e, sun: 0xffc890, ambient: 0xc2cdee, ground: 0xecc6a2, fog: 0xe8c0a2, sunIntensity: 2.8, ambientIntensity: 0.78 }],
  [0.80, { top: 0x2f3392, horizon: 0xff7a40, sun: 0xff9a58, ambient: 0xa498d0, ground: 0xf0a888, fog: 0xe0806c, sunIntensity: 2.4, ambientIntensity: 0.7 }],
  [0.88, { top: 0x2a2a70, horizon: 0xc0508a, sun: 0xd08098, ambient: 0x7f7cb8, ground: 0x8a6aa0, fog: 0x7a4c88, sunIntensity: 0.15, ambientIntensity: 0.75 }],
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
    ground: mixHex(a.ground, b.ground, f),
    fog: mixHex(a.fog, b.fog, f),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * f,
    ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * f,
  };
}
