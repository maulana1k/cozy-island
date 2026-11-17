// On-screen interface. During play it is just white text and line icons over the picture,
// with no panels. The journal is a notebook and the map is a paper sheet you hold up.
import { GRASS_RADIUS, HILL, POND, AREAS } from './config.js';
import { heightAt, landR, shoreR, wildness, groundKind, coastRock } from './logic/terrain.js';
import { COTTAGES, PATHS, DOCK, TENTS, CAMPFIRES, WINDMILL, ZIPLINE, FLAGPOLE, LOOKOUT, CAMPFIRE, getScatter } from './logic/layout.js';
import { CATEGORIES } from './logic/journal.js';
import { ITEMS, KIND_LABEL } from './logic/items.js';
import { beltOf, BELT_SIZE, TOOLS } from './logic/belt.js';
import { STAT_KEYS, STAT_LABEL, LOW } from './logic/stats.js';

const WEATHERS = [['Auto', 'auto'], ['Sunny', 'sun'], ['Windy', 'wind'], ['Rainy', 'rain'], ['Foggy', 'fog']];
const TIMES = [['Morning', 0.2], ['Midday', 0.45], ['Afternoon', 0.64], ['Sunset', 0.78], ['Night', 0.95]];

const ICONS = {
  book: '<svg viewBox="0 0 24 24"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 8h6M9 11.5h4"/><path d="M3 7h3M3 11h3M3 15h3"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="waves" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  mouse: '<svg viewBox="0 0 24 24"><rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 7v3.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M6 9.5A3.5 3.5 0 0 1 9.5 6h5A3.5 3.5 0 0 1 18 9.5V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M9.5 6V5a2.5 2.5 0 0 1 5 0v1"/><path d="M9 13h6v4H9z"/><path d="M6 12H4.5v5H6M18 12h1.5v5H18"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M12 7.5c-1.6-1.4-4-1.6-5.6 0-2 2-1.6 6.200.6 9.300 1.500 2.100 3.300 2.700 5 1.700 1.700 1 3.500.4 5-1.700 2.200-3.100 2.600-7.300.6-9.300-1.600-1.600-4-1.400-5.600 0z"/><path d="M12 7.500c0-2 1-3.500 2.800-4.200"/></svg>',
  water: '<svg viewBox="0 0 24 24"><path d="M12 3.200c3.300 4 5.800 7.300 5.800 10.600a5.800 5.800 0 0 1-11.600 0c0-3.300 2.500-6.600 5.800-10.600z"/></svg>',
  energy: '<svg viewBox="0 0 24 24"><path d="M13.500 2.800L5.500 13.500h5.500l-1 7.700 8.500-11.200h-5.800z"/></svg>',
  cheer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.800"/><path d="M8.300 14c1 1.600 2.200 2.300 3.700 2.300s2.700-.7 3.700-2.300M9 9.800v.4M15 9.800v.4"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 9.2a4.7 4.7 0 0 1 .5 9.300z"/></svg>',
  rain: '<svg viewBox="0 0 24 24"><path d="M7 14.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 5.200a4.700 4.700 0 0 1 .5 9.300z"/><path d="M8 17.500l-1 3M12.500 17.500l-1 3M17 17.500l-1 3"/></svg>',
  wind: '<svg viewBox="0 0 24 24"><path d="M3 9h10.500a2.500 2.500 0 1 0-2.400-3.100M3 13.500h14.500a2.800 2.800 0 1 1-2.700 3.600M3 18h7"/></svg>',
  fog: '<svg viewBox="0 0 24 24"><path d="M7 12.500a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 3.200a4.700 4.700 0 0 1 .5 9.300z"/><path d="M3.500 16h17M6 19.500h12"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>',
};

// Custom drawn icons for things no emoji shows well, named '@name' in ITEMS. Drawn in the glossy emoji style of the
// other item icons: gradients for soft shading, a highlight, a darker underside for depth, a slight tilt, a soft shadow.
const ITEM_ICONS = {
  bottle: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='#9fd2ee'/><stop offset='.45' stop-color='#e6f6fd'/><stop offset='1' stop-color='#5a9cc4'/></linearGradient><linearGradient id='w' x1='0' x2='1'><stop offset='0' stop-color='#2f8fd0'/><stop offset='.5' stop-color='#6cc6f2'/><stop offset='1' stop-color='#1f6aa6'/></linearGradient><linearGradient id='c' x1='0' x2='1'><stop offset='0' stop-color='#2e7d4a'/><stop offset='.45' stop-color='#7fd08f'/><stop offset='1' stop-color='#1d5a34'/></linearGradient><linearGradient id='l' x1='0' x2='1'><stop offset='0' stop-color='#3f7a3a'/><stop offset='.5' stop-color='#8fcf6a'/><stop offset='1' stop-color='#2f5f2c'/></linearGradient><radialGradient id='s' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#000' stop-opacity='.35'/><stop offset='1' stop-color='#000' stop-opacity='0'/></radialGradient></defs><ellipse cx='33' cy='59' rx='15' ry='3.5' fill='url(#s)'/><g transform='rotate(9 32 34)'><rect x='25' y='3' width='14' height='9' rx='3' fill='url(#c)'/><rect x='25' y='9.5' width='14' height='2' fill='#16492a' opacity='.5'/><path d='M27 12 h10 v3 q6 2 7 7 v32 q0 5 -5 5 h-14 q-5 0 -5 -5 v-32 q1 -5 7 -7 z' fill='url(#g)'/><path d='M21.5 30 h21 v24 q0 3.5 -3.5 3.5 h-14 q-3.5 0 -3.5 -3.5 z' fill='url(#w)'/><ellipse cx='32' cy='30' rx='10.5' ry='1.8' fill='#bfe9fb'/><rect x='20' y='35' width='24' height='10' fill='url(#l)'/><path d='M27 40 q5 -6 10 0 q-5 6 -10 0z' fill='#e9f7d8' opacity='.85'/><path d='M24.5 20 q1 -3 3 -4 v36 q-3 -1 -3 -3 z' fill='#fff' opacity='.75'/><circle cx='39' cy='50' r='1.4' fill='#fff' opacity='.7'/></g></svg>`),
  camera: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='b' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#b9efe0'/><stop offset='.55' stop-color='#6cc2ad'/><stop offset='1' stop-color='#3d8f7d'/></linearGradient><linearGradient id='d' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2f7566'/><stop offset='1' stop-color='#1f4f45'/></linearGradient><linearGradient id='t' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f3f6f7'/><stop offset='1' stop-color='#a9b6bd'/></linearGradient><radialGradient id='r' cx='.4' cy='.35' r='.7'><stop offset='0' stop-color='#ffffff'/><stop offset='.6' stop-color='#c9d2d8'/><stop offset='1' stop-color='#7d8a94'/></radialGradient><radialGradient id='k' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#3a4f66'/><stop offset='1' stop-color='#0d141c'/></radialGradient><radialGradient id='g' cx='.35' cy='.3' r='.75'><stop offset='0' stop-color='#9ad8ff'/><stop offset='.35' stop-color='#4b6fd6'/><stop offset='.8' stop-color='#2a1f5a'/><stop offset='1' stop-color='#120e26'/></radialGradient><radialGradient id='u' cx='.4' cy='.3' r='.7'><stop offset='0' stop-color='#ff9a86'/><stop offset='1' stop-color='#c2321f'/></radialGradient><radialGradient id='s' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#000' stop-opacity='.35'/><stop offset='1' stop-color='#000' stop-opacity='0'/></radialGradient></defs><ellipse cx='32' cy='58' rx='25' ry='4' fill='url(#s)'/><g transform='rotate(-7 32 34)'><rect x='38' y='10' width='11' height='6' rx='2.5' fill='url(#u)'/><rect x='40' y='11' width='5' height='1.6' rx='.8' fill='#fff' opacity='.6'/><rect x='7' y='17' width='50' height='35' rx='8' fill='url(#d)'/><rect x='7' y='15' width='50' height='34' rx='8' fill='url(#b)'/><rect x='7' y='15' width='50' height='9' rx='6' fill='url(#t)' opacity='.9'/><path d='M12 17 h40 q3 0 3 2 h-46 q0 -2 3 -2z' fill='#fff' opacity='.8'/><rect x='12' y='27' width='9' height='6' rx='2' fill='#fff7c9' stroke='#e2d38a' stroke-width='.8'/><rect x='13' y='28' width='3' height='2' rx='.6' fill='#fff'/><circle cx='33' cy='35' r='14' fill='#235a4e' opacity='.45'/><circle cx='32' cy='33.5' r='13.5' fill='url(#r)'/><circle cx='32' cy='33.5' r='10' fill='url(#k)'/><circle cx='32' cy='33.5' r='7' fill='url(#g)'/><ellipse cx='29' cy='30.5' rx='3' ry='2' fill='#fff' opacity='.85'/><circle cx='35.5' cy='37' r='1.1' fill='#fff' opacity='.5'/><path d='M10 44 q0 4 4 4 h36 q4 0 4 -4' fill='none' stroke='#2f7566' stroke-width='1.2' opacity='.6'/></g></svg>`),
  litterbag: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='p' x1='0' x2='1'><stop offset='0' stop-color='#b48a57'/><stop offset='.45' stop-color='#ecd2a2'/><stop offset='1' stop-color='#a07443'/></linearGradient><linearGradient id='q' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f6e3bd'/><stop offset='1' stop-color='#cfae7a'/></linearGradient><radialGradient id='f' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='#9be08e'/><stop offset='1' stop-color='#2f7f3a'/></radialGradient><radialGradient id='s' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#000' stop-opacity='.35'/><stop offset='1' stop-color='#000' stop-opacity='0'/></radialGradient></defs><ellipse cx='32' cy='59' rx='19' ry='3.5' fill='url(#s)'/><g transform='rotate(-5 32 34)'><path d='M24 19 q0 -13 8 -13 q8 0 8 13' fill='none' stroke='#7a5a38' stroke-width='3' stroke-linecap='round'/><path d='M14 20 h36 l-4 37 q0 2.5 -2.5 2.5 h-23 q-2.5 0 -2.5 -2.5 z' fill='url(#p)'/><path d='M14 20 l3 -7 h30 l3 7 z' fill='url(#q)'/><path d='M18 22 l3 34' stroke='#fff' stroke-width='2.2' opacity='.45' stroke-linecap='round'/><path d='M32 50 q-11 -2 -8 -14 q9 -2 15 -7 q4 15 -7 21z' fill='url(#f)'/><path d='M30 48 q1 -8 8 -15' fill='none' stroke='#e8f7dc' stroke-width='1.5'/><ellipse cx='28' cy='37' rx='2.2' ry='1.2' fill='#fff' opacity='.6' transform='rotate(-30 28 37)'/></g></svg>`),
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag); if (cls) e.className = cls;
  if (typeof text === 'string' && text[0] === '@' && ITEM_ICONS[text.slice(1)]) { const i = document.createElement('img'); i.src = ITEM_ICONS[text.slice(1)]; i.alt = ''; i.style.cssText = 'width:1.15em;height:1.15em;vertical-align:-0.15em'; e.append(i); }
  else if (typeof text === 'string' && text.startsWith('data:image/')) { const i = document.createElement('img'); i.src = text; i.alt = ''; i.className = 'photo'; e.append(i); } // a photo from the camera (src/photo.js)
  else if (text !== undefined) e.textContent = text;
  return e;
};
const icon = (name, cls = 'ico') => { const s = el('span', cls); s.innerHTML = ICONS[name]; return s; };

// ---- The paper map ---------------------------------------------------------------
// The whole island on one illustrated sheet, in soft flat tones like a hand-painted tourist map.
// The terrain is sampled on a grid into a few smooth fields (height, sand, jungle, rock...), and each
// is traced into vector outlines (marching squares, linearly interpolated) that are filled and
// stroked as canvas paths, so the sheet stays crisp at any size and on retina screens. Trees are
// round blobs, paths are rounded brown strokes, places sit on little white paper tags.
const MAP = 720, MK = 2.2, MX0 = -118, MZ0 = -208;
const mx = (x) => (x - MX0) * MK, mz = (z) => (z - MZ0) * MK;
const HAND = '"Marker Felt", "Chalkboard SE", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
const TAG_FONT = '"Chalkboard SE", "Marker Felt", "Segoe Print", "Comic Sans MS", ui-rounded, system-ui, sans-serif';
// [text, place, where the tag would like to sit, in px from the place]
const LABELS = [
  ['Camp', { x: 11.6, z: -7.3 }, 4, -44], ['Summit camp', LOOKOUT, -64, -30], ['Pond', POND, -50, 22], ['Beach camp', CAMPFIRE, -44, 40],
  ['Dock', { x: DOCK.x + 6, z: DOCK.z + 2 }, 46, 26], ['Bridge', { x: (AREAS.bridge.a.x + AREAS.bridge.b.x) / 2, z: (AREAS.bridge.a.z + AREAS.bridge.b.z) / 2 }, 40, 34],
  ['River', AREAS.river[5], -50, 6], ['Lake', AREAS.lake, -58, 18], ['Waterfall', AREAS.waterfall.foot, 54, 4], ['Lookout', AREAS.lookout, -46, -34],
  ['Village', AREAS.village, 6, 52], ['Fields', AREAS.paddies, 26, 36], ['Jetty', AREAS.jetty, -10, 40], ['Clearing', AREAS.clearing, 44, 28],
];

// A tiny repeatable random number from a seed.
const rnd = (s) => { const v = Math.sin(s * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const G = 3, N = MAP / G + 1; // field grid: a sample every 3 px (1.4 m), on the cell corners
function blur(F, passes = 1) {
  const T = new Float32Array(F.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; T[k] = (F[k - (i > 0)] + F[k] + F[k + (i < N - 1)]) / 3; }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; F[k] = (T[k - (j > 0) * N] + T[k] + T[k + (j < N - 1) * N]) / 3; }
  }
  return F;
}
// Marching squares: the area where F > iso as one fillable path (cells clipped and unioned), and its
// outline as a strokeable path. Crossing points are computed the same way from both sides of an
// edge, so neighbouring pieces meet exactly.
function trace(F, iso) {
  const fill = new Path2D(), line = new Path2D(), segs = [];
  const cross = (k0, k1) => {
    if (k0 > k1) [k0, k1] = [k1, k0];
    const t = (iso - F[k0]) / (F[k1] - F[k0]);
    return [((k0 % N) + ((k1 % N) - (k0 % N)) * t) * G, (Math.floor(k0 / N) + (Math.floor(k1 / N) - Math.floor(k0 / N)) * t) * G];
  };
  for (let j = 0; j < N - 1; j++) {
    let run = -1;
    for (let i = 0; i < N; i++) {
      const ks = [j * N + i, j * N + i + 1, (j + 1) * N + i + 1, (j + 1) * N + i];
      const inside = i < N - 1 ? ks.map((k) => F[k] > iso) : null;
      const full = inside && inside.every(Boolean);
      if (full) { if (run < 0) run = i; continue; }
      if (run >= 0) { fill.rect(run * G, j * G, (i - run) * G, G); run = -1; }
      if (!inside || !inside.some(Boolean)) continue;
      const pts = [], xs = [];
      for (let e = 0; e < 4; e++) {
        const a = ks[e], b = ks[(e + 1) % 4];
        if (inside[e]) pts.push([(a % N) * G, Math.floor(a / N) * G]);
        if (inside[e] !== inside[(e + 1) % 4]) { const p = cross(a, b); pts.push(p); xs.push(p); }
      }
      fill.moveTo(pts[0][0], pts[0][1]); for (let q = 1; q < pts.length; q++) fill.lineTo(pts[q][0], pts[q][1]); fill.closePath();
      for (let q = 0; q + 1 < xs.length; q += 2) segs.push([xs[q], xs[q + 1]]);
    }
  }
  // Join the outline's pieces into long lines (so dashes run along them), then round them off once (Chaikin).
  const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`, ends = new Map(), used = new Uint8Array(segs.length);
  segs.forEach((sg, i) => { for (const p of sg) { const k = key(p); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
  const grow = (pts) => { for (;;) { const nx = (ends.get(key(pts[pts.length - 1])) || []).find((i) => !used[i]); if (nx === undefined) return; used[nx] = 1; const sg = segs[nx]; pts.push(key(sg[0]) === key(pts[pts.length - 1]) ? sg[1] : sg[0]); } };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1; const pts = [segs[i][0], segs[i][1]]; grow(pts); pts.reverse(); grow(pts);
    const closed = pts.length > 3 && key(pts[0]) === key(pts[pts.length - 1]);
    let sm = pts;
    if (pts.length > 3) { sm = closed ? [] : [pts[0]]; for (let q = 0; q < pts.length - 1; q++) { const a = pts[q], b = pts[q + 1]; sm.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } if (!closed) sm.push(pts[pts.length - 1]); }
    line.moveTo(sm[0][0], sm[0][1]); for (let q = 1; q < sm.length; q++) line.lineTo(sm[q][0], sm[q][1]); if (closed) line.closePath();
  }
  return { fill, line };
}
// A smooth line through points (midpoint quadratic curves), in map pixels.
function curve(c, pts) {
  const P = pts.map((p) => [mx(p.x), mz(p.z)]);
  c.beginPath(); c.moveTo(P[0][0], P[0][1]);
  if (P.length === 2) c.lineTo(P[1][0], P[1][1]);
  for (let i = 1; i < P.length - 1; i++) { const nx = i === P.length - 2 ? P[i + 1] : [(P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2]; c.quadraticCurveTo(P[i][0], P[i][1], nx[0], nx[1]); }
  c.stroke();
}

function drawPaperMap(c) {
  // ---- Sample the island into fields
  const n2 = N * N, F = () => new Float32Array(n2);
  const land = F(), seaLand = F(), sr = F(), grass = F(), wild = F(), local = F(), terr = F(), paddy = F(), forest = F(), rock = F();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = MX0 + (i * G) / MK, z = MZ0 + (j * G) / MK, h = heightAt(x, z), r = shoreR(x, z), lr = landR(x, z), w = wildness(x, z);
    land[k] = Math.max(-3, Math.min(3, h)); sr[k] = r; seaLand[k] = h < 0 && r < 58 ? 1 : land[k];
    grass[k] = GRASS_RADIUS - lr; wild[k] = w; forest[k] = -1;
    const g = groundKind(x, z);
    if (g) {
      if (lr < GRASS_RADIUS) { local[k] = g.locals; terr[k] = g.locals > 0.5 ? g.terrace : 0; paddy[k] = g.locals > 0.5 ? g.paddy : 0; }
      forest[k] = Math.max(-1, Math.min(1, g.forest));
      if (h > 2 && !(h > AREAS.massif.height - 1.5 && w > 0.4)) rock[k] = g.rock;
    }
    if (lr > 49) rock[k] = Math.max(rock[k], (coastRock(x, z) * Math.min(1, (lr - 49) / 4) * 0.5) / 0.45);
  }
  blur(land, 1); blur(seaLand, 2); blur(sr, 1); blur(grass, 2); blur(wild, 2); blur(local, 2); blur(terr, 1); blur(paddy, 1); blur(forest, 1); blur(rock, 2);
  const at = (A, px, py) => { const i = Math.max(0, Math.min(N - 2, Math.floor(px / G))), j = Math.max(0, Math.min(N - 2, Math.floor(py / G))), u = px / G - i, v = py / G - j, k = j * N + i; return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + N] * (1 - u) + A[k + N + 1] * u) * v; };

  c.clearRect(0, 0, MAP, MAP);
  c.lineCap = 'round'; c.lineJoin = 'round';
  // ---- The sea: one flat light blue, a few ripples, a white surf line round the coast
  c.fillStyle = '#a8dcf2'; c.fillRect(0, 0, MAP, MAP);
  // printed sea: fine wavy hatch lines, and thin contour rings that follow the coast
  c.strokeStyle = 'rgba(60,120,160,0.2)'; c.lineWidth = 0.7;
  for (let y = 4; y < MAP; y += 5) { c.beginPath(); c.moveTo(0, y); for (let x = 12; x <= MAP; x += 12) c.lineTo(x, y + Math.sin(x * 0.07 + y * 0.9) * 1.1); c.stroke(); }
  c.strokeStyle = 'rgba(40,100,150,0.42)'; c.lineWidth = 0.9;
  for (const iso of [62, 72, 90]) c.stroke(trace(sr, iso).line);
  c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.4;
  for (const [iso, dash] of [[69, [10, 34]], [78, [7, 52]]]) { c.setLineDash(dash); c.stroke(trace(sr, iso).line); }
  c.setLineDash([]);
  const coast = trace(seaLand, 0), shore = trace(land, 0);
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 16; c.stroke(coast.line);
  c.strokeStyle = '#ffffff'; c.lineWidth = 5.5; c.stroke(coast.line);
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3; c.stroke(shore.line); // the river and lake banks
  // ---- The land, in flat layers
  c.fillStyle = '#f1d9a2'; c.fill(shore.fill);
  c.save(); c.clip(shore.fill);
  const lay = (A, iso, col, drop) => { const t = trace(A, iso); if (drop) { c.save(); c.translate(0, drop[0]); c.fillStyle = drop[1]; c.fill(t.fill); c.restore(); } c.fillStyle = col; c.fill(t.fill); return t; };
  lay(grass, 0, '#dfe0a4');
  c.fillStyle = 'rgba(240,222,170,0.85)'; c.beginPath(); c.arc(mx(10), mz(8), 24 * MK, 0, Math.PI * 2); c.fill(); // the camp's open ground
  for (const [r, col] of [[1, '#d3d897'], [0.66, '#e2dca4'], [0.33, '#efe2b2']]) { c.fillStyle = col; c.beginPath(); c.ellipse(mx(HILL.x), mz(HILL.z), HILL.radius * r * MK, HILL.radius * r * MK * 0.94, 0.5, 0, Math.PI * 2); c.fill(); } // the hill
  lay(local, 0.5, '#e6dc9e');
  lay(terr, 0.5, '#eed6a2', [2.5, '#d9b886']);
  const fields = lay(paddy, 0.5, '#c6d685', [2, '#a9bb6c']);
  c.save(); c.clip(fields.fill); c.strokeStyle = 'rgba(140,165,85,0.55)'; c.lineWidth = 1;
  for (let d = -MAP; d < MAP; d += 5) { c.beginPath(); c.moveTo(d, 0); c.lineTo(d + MAP * 0.5, MAP); c.stroke(); } c.restore();
  lay(wild, 0.5, '#bccb88');
  lay(rock, 0.5, '#dcc29a', [3.5, '#b8946c']);
  c.restore();
  // ---- Water on the land: the stream from its spring, the pond, the waterfall
  c.strokeStyle = '#ffffff'; c.lineWidth = 5; curve(c, AREAS.stream); c.strokeStyle = '#a8dcf2'; c.lineWidth = 3; curve(c, AREAS.stream);
  c.fillStyle = '#a8dcf2'; c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
  for (const [p, r] of [[AREAS.spring, AREAS.spring.r], [POND, POND.rw]]) { c.beginPath(); c.arc(mx(p.x), mz(p.z), r * MK, 0, Math.PI * 2); c.fill(); c.stroke(); }
  const wf = AREAS.waterfall; c.strokeStyle = '#ffffff'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(mx(wf.top.x), mz(wf.top.z)); c.lineTo(mx(wf.foot.x), mz(wf.foot.z)); c.stroke();
  // terrace walls, as soft brown lines
  c.strokeStyle = 'rgba(160,120,80,0.6)'; c.lineWidth = 1.6; for (const t of AREAS.terraces) if (t.wallFoot) curve(c, t.wallFoot);
  c.fillStyle = '#c9e09a'; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.arc(mx(AREAS.clearing.x), mz(AREAS.clearing.z), AREAS.clearing.r * MK, 0, Math.PI * 2); c.fill(); c.stroke();
  // ---- Trees: round blobs, the big jungle and the ridge's wood packed, the camp's dotted about
  const blobs = [];
  for (let y = 2, row = 0; y < MAP; y += 7.5, row++) for (let x = (row % 2) * 3.7; x < MAP; x += 7.5) {
    const s = x * 0.731 + y * 1.913, px = x + (rnd(s) - 0.5) * 5, py = y + (rnd(s + 7) - 0.5) * 5;
    if (at(land, px, py) < 0.4 || at(rock, px, py) > 0.45) continue;
    const jw = at(wild, px, py), fw = at(forest, px, py);
    if ((jw > 0.62 || fw > 0.1) && rnd(s + 11) > 0.12) blobs.push([px, py, 4.2 + rnd(s + 3) * 2.6, (rnd(s + 5) * 3) | 0]);
    else if (jw > 0.5 && rnd(s + 9) < 0.5) blobs.push([px, py, 3 + rnd(s + 3) * 2, (rnd(s + 5) * 3) | 0]);
  }
  for (const t of getScatter().trees) blobs.push([mx(t.x), mz(t.z), 2 + t.scale * 1.3, t.kind === 3 ? 2 : (t.x * 7 + t.z) & 1]);
  blobs.sort((a, b) => a[1] - b[1]);
  const GREENS = ['#7da35a', '#6a9150', '#93b467'], LIGHT = ['#9cbf72', '#86ac66', '#aecb80'];
  c.fillStyle = 'rgba(80,105,55,0.38)'; c.beginPath(); for (const [x, y, r] of blobs) { c.moveTo(x + 1.4 + r, y + 2.2); c.arc(x + 1.4, y + 2.2, r, 0, Math.PI * 2); } c.fill();
  for (const [x, y, r, k] of blobs) {
    c.fillStyle = GREENS[k]; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = LIGHT[k]; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.32, r * 0.45, 0, Math.PI * 2); c.fill();
  }
  // ---- Paths: rounded brown strokes
  c.strokeStyle = '#b97d4b'; c.lineWidth = 2.2;
  for (const p of PATHS) curve(c, p);
  for (const p of AREAS.trails) curve(c, p);
  curve(c, AREAS.cliffPath);
  c.lineWidth = 1.8; for (const p of Object.values(AREAS.paths)) if (p && p.length > 1) curve(c, p);
  // ---- Dock, bridge, jetty, stepping stones: planks of wood
  const plank = (ax, az, bx, bz, w) => { c.strokeStyle = '#8a6142'; c.lineWidth = w + 2; c.beginPath(); c.moveTo(mx(ax), mz(az)); c.lineTo(mx(bx), mz(bz)); c.stroke(); c.strokeStyle = '#c99a68'; c.lineWidth = w; c.stroke(); };
  plank(DOCK.x, DOCK.z, DOCK.x + Math.sin(DOCK.rot) * DOCK.length, DOCK.z + Math.cos(DOCK.rot) * DOCK.length, 2.5);
  const br = AREAS.bridge; plank(br.a.x, br.a.z, br.b.x, br.b.z, 3.2);
  const je = AREAS.jetty; plank(je.x - 2, je.z, je.x + Math.sin(je.rot) * 9, je.z + Math.cos(je.rot) * 9, 2.5);
  c.fillStyle = '#9b8f82'; for (const st of AREAS.stones) { c.beginPath(); c.arc(mx(st.x), mz(st.z), 1.5, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = 'rgba(110,90,130,0.6)'; c.lineWidth = 1.2; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(mx(ZIPLINE.top.x), mz(ZIPLINE.top.z)); c.lineTo(mx(ZIPLINE.bottom.x), mz(ZIPLINE.bottom.z)); c.stroke(); c.setLineDash([]);
  // ---- Buildings: tiny houses with a roof
  const house = (x, z, rot, w, d, wall, roof) => {
    c.save(); c.translate(mx(x), mz(z)); c.rotate(-rot);
    const W = Math.max(5, w * MK), D = Math.max(5, d * MK);
    c.fillStyle = 'rgba(90,70,50,0.3)'; c.beginPath(); c.roundRect(-W / 2 + 1.2, -D / 2 + 1.8, W, D, 1.5); c.fill();
    c.fillStyle = wall; c.strokeStyle = '#8a6646'; c.lineWidth = 1; c.beginPath(); c.roundRect(-W / 2, -D / 2, W, D, 1.5); c.fill(); c.stroke();
    c.fillStyle = roof; c.beginPath(); c.roundRect(-W / 2, -D / 2, W, D * 0.5, [1.5, 1.5, 0, 0]); c.fill();
    c.restore();
  };
  for (const h of COTTAGES) {
    house(h.x, h.z, h.rot, h.width * 1.05, h.depth * 1.05, '#fbf3e2', h.type === 'mess' ? '#e48a5c' : h.type === 'aid' ? '#f2f0ea' : h.type === 'farm' ? '#b78a5a' : '#d97b54');
    if (h.type === 'aid') { c.fillStyle = '#d9453a'; c.fillRect(mx(h.x) - 0.8, mz(h.z) - 2.8, 1.6, 5.6); c.fillRect(mx(h.x) - 2.8, mz(h.z) - 0.8, 5.6, 1.6); }
  }
  for (const p of AREAS.plots) house(p.x, p.z, p.front || 0, 5, 4.4, '#fbf3e2', '#c9895a');
  if (AREAS.hall) house(AREAS.hall.x, AREAS.hall.z, AREAS.hall.front || 0, AREAS.hall.w * 0.8, AREAS.hall.d * 0.8, '#fbf3e2', '#b0704a');
  for (const s of AREAS.stalls || []) { c.fillStyle = '#e9a25c'; c.beginPath(); c.arc(mx(s.x), mz(s.z), 2.2, 0, Math.PI * 2); c.fill(); }
  for (const t of TENTS) { c.fillStyle = '#ef8f62'; c.strokeStyle = '#8a5a3c'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(mx(t.x), mz(t.z) - 3.4); c.lineTo(mx(t.x) + 3, mz(t.z) + 2.4); c.lineTo(mx(t.x) - 3, mz(t.z) + 2.4); c.closePath(); c.fill(); c.stroke(); }
  for (const f of CAMPFIRES) { c.fillStyle = '#ff8a3c'; c.beginPath(); c.arc(mx(f.x), mz(f.z), 2.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffd659'; c.beginPath(); c.arc(mx(f.x), mz(f.z), 1, 0, Math.PI * 2); c.fill(); }
  c.save(); c.translate(mx(WINDMILL.x), mz(WINDMILL.z)); c.fillStyle = '#fbf3e2'; c.strokeStyle = '#8a6646'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill(); c.stroke();
  c.lineWidth = 1.6; c.beginPath(); c.moveTo(-5.5, -5.5); c.lineTo(5.5, 5.5); c.moveTo(5.5, -5.5); c.lineTo(-5.5, 5.5); c.stroke(); c.restore();
  c.fillStyle = '#7a4fae'; c.fillRect(mx(FLAGPOLE.x), mz(FLAGPOLE.z) - 8, 6, 4); c.fillStyle = '#7a5a3c'; c.fillRect(mx(FLAGPOLE.x) - 0.75, mz(FLAGPOLE.z) - 8, 1.5, 9);
  // ---- Words on the land: the jungle warning, lightly
  c.save(); c.translate(150, 250); c.rotate(-0.06); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `22px ${HAND}`;
  c.lineWidth = 4; c.strokeStyle = 'rgba(70,100,50,0.55)'; c.strokeText('Wild jungle', 0, 0); c.fillStyle = '#fbf7e4'; c.fillText('Wild jungle', 0, 0);
  c.font = `15px ${HAND}`; c.strokeText('keep out!', 0, 22); c.fillStyle = '#ffe2d6'; c.fillText('keep out!', 0, 22); c.restore();
  // ---- Title cartouche, ornate compass rose, scale bar: printed in dark blue ink
  const INK = '#27506f', SERIF = '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
  const title = { x: 575, y: 664, w: 250, h: 56 }, compass = { x: 52, y: 664, w: 84, h: 84 }, scale = { x: 232, y: 690, w: 250, h: 34 };
  c.save(); c.translate(title.x, title.y); c.rotate(-0.012);
  c.fillStyle = 'rgba(247,238,212,0.92)'; c.strokeStyle = INK;
  c.beginPath(); c.roundRect(-title.w / 2, -title.h / 2, title.w, title.h, 7); c.fill(); c.lineWidth = 2; c.stroke();
  c.lineWidth = 0.8; c.beginPath(); c.roundRect(-title.w / 2 + 4, -title.h / 2 + 4, title.w - 8, title.h - 8, 4); c.stroke();
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `bold 21px ${SERIF}`; const tw = c.measureText('SCOUT CAMP ISLAND').width, ts = Math.min(1, (title.w - 26) / tw);
  c.save(); c.scale(ts, ts); c.fillText('SCOUT CAMP ISLAND', 0, -6); c.restore();
  c.font = `italic 11px ${SERIF}`; c.fillText('a little camp by the sea', 0, 14);
  for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 108, 14); c.lineTo(sx * 95, 14); c.stroke(); c.beginPath(); c.arc(sx * 112, 14, 1.8, 0, Math.PI * 2); c.fill(); }
  c.restore();
  c.save(); c.translate(compass.x, compass.y); c.fillStyle = INK; c.strokeStyle = INK;
  c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 23, 0, Math.PI * 2); c.stroke(); c.lineWidth = 0.6; c.beginPath(); c.arc(0, 0, 20, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8; c.lineWidth = i % 2 ? 0.5 : 0.8; c.beginPath(); c.moveTo(Math.sin(a) * 20, -Math.cos(a) * 20); c.lineTo(Math.sin(a) * 23, -Math.cos(a) * 23); c.stroke(); }
  const star = (len, w, rot, half) => { c.save(); c.rotate(rot); for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(w, -w); c.lineTo(0, -len); c.closePath(); c.fillStyle = INK; c.fill();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-w, -w); c.lineTo(0, -len); c.closePath(); c.fillStyle = half; c.fill(); c.lineWidth = 0.7; c.stroke(); } c.restore(); };
  star(14, 3.2, Math.PI / 4, '#efe3c0'); star(26, 4, 0, '#efe3c0');
  c.fillStyle = '#efe3c0'; c.beginPath(); c.arc(0, 0, 2.2, 0, Math.PI * 2); c.fill(); c.stroke();
  c.fillStyle = INK; c.font = `bold 13px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', 0, -35); c.font = `10px ${SERIF}`; c.fillText('S', 0, 33); c.fillText('W', -33, 1); c.fillText('E', 33, 1);
  c.beginPath(); c.moveTo(0, -46); c.lineTo(-3, -42); c.lineTo(3, -42); c.closePath(); c.fill(); c.restore();
  // scale bar: 100 m, alternating black and paper blocks
  c.save(); c.translate(scale.x - 110, scale.y - 4); const sw = 100 * MK;
  for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#f3e8c8' : INK; c.fillRect((sw / 4) * i, 0, sw / 4, 5); }
  c.strokeStyle = INK; c.lineWidth = 0.9; c.strokeRect(0, 0, sw, 5);
  c.fillStyle = INK; c.font = `10px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillText('0', 0, -3); c.fillText('50', sw / 2, -3); c.fillText('100 m', sw, -3); c.restore();
  // ---- Place tags: white paper, a slight tilt, a short leader; nudged apart so none overlap
  c.font = `italic 14px ${SERIF}`;
  const tags = LABELS.map(([text, p, dx, dy], i) => { const ax = mx(p.x), ay = mz(p.z); return { text, ax, ay, x: ax + dx, y: ay + dy, w: c.measureText(text).width + 8, h: 18, tilt: (rnd(i + 1) - 0.5) * 0.09 }; });
  const keepOut = [{ x: title.x, y: title.y, w: title.w + 10, h: title.h }, { x: compass.x, y: compass.y, w: compass.w, h: compass.h }, { x: scale.x, y: scale.y - 4, w: scale.w, h: scale.h }];
  for (let it = 0; it < 80; it++) {
    let moved = false;
    for (let a = 0; a < tags.length; a++) {
      const A = tags[a];
      const others = [...tags.slice(a + 1), ...keepOut.map((k) => ({ ...k, fixed: true })), ...tags.map((t) => ({ x: t.ax, y: t.ay, w: 8, h: 8, fixed: true }))];
      for (const B of others) {
        const ox = (A.w + B.w) / 2 + 4 - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 + 3 - Math.abs(A.y - B.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const k = B.fixed ? 1 : 0.5;
        if (ox < oy) { const s = A.x < B.x ? -1 : 1; A.x += s * ox * k; if (!B.fixed) B.x -= s * ox * k; }
        else { const s = A.y < B.y ? -1 : 1; A.y += s * oy * k; if (!B.fixed) B.y -= s * oy * k; }
      }
      A.x = Math.max(A.w / 2 + 16, Math.min(MAP - A.w / 2 - 16, A.x)); A.y = Math.max(A.h / 2 + 16, Math.min(MAP - A.h / 2 - 16, A.y));
    }
    if (!moved) break;
  }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const t of tags) {
    const ex = Math.max(t.x - t.w / 2, Math.min(t.x + t.w / 2, t.ax)), ey = Math.max(t.y - t.h / 2, Math.min(t.y + t.h / 2, t.ay));
    c.strokeStyle = 'rgba(45,35,25,0.65)'; c.lineWidth = 0.8; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(ex, ey); c.lineTo(t.ax, t.ay); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#3a2f25'; c.beginPath(); c.arc(t.ax, t.ay, 1.9, 0, Math.PI * 2); c.fill();
  }
  c.lineJoin = 'round';
  for (const t of tags) { // printed names: dark ink with a paper-coloured halo, no boxes
    c.save(); c.translate(t.x, t.y); c.rotate(t.tilt);
    c.lineWidth = 4.5; c.strokeStyle = 'rgba(247,238,212,0.92)'; c.strokeText(t.text, 0, 1);
    c.fillStyle = '#2f2519'; c.fillText(t.text, 0, 1); c.restore();
  }
  // ---- Print look: a touch desaturated and warmer, inked on paper (the sheet's grain is laid over it by the page)
  const tmp = document.createElement('canvas'); tmp.width = c.canvas.width; tmp.height = c.canvas.height;
  const tc = tmp.getContext('2d'); tc.drawImage(c.canvas, 0, 0);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, tmp.width, tmp.height);
  c.filter = 'saturate(0.8) sepia(0.2) contrast(0.96)'; c.drawImage(tmp, 0, 0); c.filter = 'none';
  c.globalCompositeOperation = 'multiply'; c.fillStyle = '#f6ead0'; c.fillRect(0, 0, tmp.width, tmp.height); c.restore();
  // trim to the neat-line and print the border (margin outside it is the paper's)
  c.save(); c.setTransform(dpr0(c), 0, 0, dpr0(c), 0, 0); c.globalCompositeOperation = 'destination-in'; c.fillRect(6, 6, MAP - 12, MAP - 12); c.restore();
  c.save(); c.strokeStyle = '#27506f'; c.lineWidth = 2.4; c.strokeRect(6, 6, MAP - 12, MAP - 12); c.lineWidth = 0.8; c.strokeRect(11, 11, MAP - 22, MAP - 22);
  c.fillStyle = '#27506f'; for (const [x, y] of [[6, 6], [MAP - 6, 6], [6, MAP - 6], [MAP - 6, MAP - 6]]) c.fillRect(x - 3, y - 3, 6, 6); c.restore();
}
const dpr0 = (c) => c.canvas.width / MAP;

// ---- The sheet itself: cream paper with fibres, aged deckled edges and a 3 x 2 grid of folds ----------------
// Painted once into two canvases the same size: the paper under the map, and a see-through layer over it
// (panel shading, creases, wear, grain) so the print looks like it is on the folded paper.
const SHEET = 800;
function paintSheet(bg, ov, dpr) {
  let seed = 7; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const S = SHEET, cols = 3, rows = 2;
  // grain tile: random light and dark specks
  const tile = document.createElement('canvas'); tile.width = tile.height = 192; const tcx = tile.getContext('2d'), id = tcx.createImageData(192, 192);
  for (let i = 0; i < id.data.length; i += 4) { const v = R(), dark = v < 0.5; id.data[i] = dark ? 90 : 255; id.data[i + 1] = dark ? 70 : 252; id.data[i + 2] = dark ? 40 : 240; id.data[i + 3] = Math.abs(v - 0.5) * 70; }
  tcx.putImageData(id, 0, 0);
  // slightly irregular worn outline
  const pts = [], M = 14, step = 8, ph = [R() * 6, R() * 6, R() * 6, R() * 6];
  const wob = (t, k) => Math.sin(t * 0.045 + ph[k]) * 1.6 + Math.sin(t * 0.17 + ph[k] * 2) * 0.9 + (R() - 0.5) * 1.6;
  for (let t = M; t < S - M; t += step) pts.push([t, M + wob(t, 0)]);
  for (let t = M; t < S - M; t += step) pts.push([S - M + wob(t, 1), t]);
  for (let t = S - M; t > M; t -= step) pts.push([t, S - M + wob(t, 2)]);
  for (let t = S - M; t > M; t -= step) pts.push([M + wob(t, 3), t]);
  const outline = (c) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
  const grain = (c, a) => { c.save(); c.globalAlpha = a; c.fillStyle = c.createPattern(tile, 'repeat'); c.fillRect(0, 0, S, S); c.restore(); };
  // ---- under the map
  bg.setTransform(dpr, 0, 0, dpr, 0, 0); bg.save(); outline(bg); bg.clip();
  const g = bg.createRadialGradient(S * 0.45, S * 0.4, 60, S / 2, S / 2, S * 0.75); g.addColorStop(0, '#f6eed6'); g.addColorStop(1, '#ecdfbf');
  bg.fillStyle = g; bg.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) { const x = R() * S, y = R() * S, r = 50 + R() * 140, b = bg.createRadialGradient(x, y, 0, x, y, r), warm = R() < 0.6; b.addColorStop(0, warm ? 'rgba(190,150,90,0.07)' : 'rgba(255,255,245,0.12)'); b.addColorStop(1, 'rgba(255,255,255,0)'); bg.fillStyle = b; bg.fillRect(x - r, y - r, r * 2, r * 2); }
  bg.lineWidth = 0.6; for (let i = 0; i < 2600; i++) { const x = R() * S, y = R() * S, a = R() * Math.PI, l = 3 + R() * 9; bg.strokeStyle = R() < 0.5 ? 'rgba(130,100,60,0.12)' : 'rgba(255,255,250,0.28)'; bg.beginPath(); bg.moveTo(x, y); bg.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + R() * 2, y + Math.sin(a) * l * 0.5 + R() * 2, x + Math.cos(a) * l, y + Math.sin(a) * l); bg.stroke(); }
  grain(bg, 0.9);
  for (const [x0, y0, x1, y1] of [[0, 0, 0, 90], [0, 0, 90, 0], [S, 0, S - 90, 0], [0, S, 0, S - 90]]) { // browner toward each edge
    const e = bg.createLinearGradient(x0, y0, x1, y1); e.addColorStop(0, 'rgba(150,105,55,0.4)'); e.addColorStop(1, 'rgba(150,105,55,0)'); bg.fillStyle = e; bg.fillRect(0, 0, S, S);
  }
  bg.restore(); bg.strokeStyle = 'rgba(110,80,45,0.5)'; bg.lineWidth = 1.1; outline(bg); bg.stroke();
  // ---- over the map
  ov.setTransform(dpr, 0, 0, dpr, 0, 0); ov.save(); outline(ov); ov.clip();
  const pw = (S - 2 * M) / cols, ph2 = (S - 2 * M) / rows, X = (i) => M + i * pw, Y = (j) => M + j * ph2;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { // each panel tilted a little differently to the light
    const lit = (R() - 0.45) * 0.1, a = R() * Math.PI * 2, pg = ov.createLinearGradient(X(i) + pw / 2 + Math.cos(a) * pw / 2, Y(j) + ph2 / 2 + Math.sin(a) * ph2 / 2, X(i) + pw / 2 - Math.cos(a) * pw / 2, Y(j) + ph2 / 2 - Math.sin(a) * ph2 / 2);
    const hi = lit > 0 ? `rgba(255,250,230,${lit * 1.4})` : `rgba(60,40,20,${-lit})`, lo = lit > 0 ? 'rgba(255,250,230,0)' : 'rgba(60,40,20,0)';
    pg.addColorStop(0, hi); pg.addColorStop(1, lo); ov.fillStyle = pg; ov.fillRect(X(i), Y(j), pw, ph2);
  }
  const crease = (horiz, p, flip) => { // soft shadow on one side, highlight on the other, a crisp line between
    const A = M, B = S - M, jit = [], n = Math.ceil((B - A) / 10); for (let k = 0; k <= n; k++) jit.push((R() - 0.5) * 0.7);
    const at = (t) => A + t * (B - A);
    for (const [w, col0, col1, side] of [[9, 'rgba(70,45,20,0.26)', 'rgba(70,45,20,0)', -flip], [6, 'rgba(255,252,238,0.7)', 'rgba(255,252,238,0)', flip]]) {
      const gr = horiz ? ov.createLinearGradient(0, p, 0, p + side * w) : ov.createLinearGradient(p, 0, p + side * w, 0); gr.addColorStop(0, col0); gr.addColorStop(1, col1); ov.fillStyle = gr;
      const lo = Math.min(0, side * w), hh = Math.abs(w);
      if (horiz) ov.fillRect(A, p + lo, B - A, hh); else ov.fillRect(p + lo, A, hh, B - A);
    }
    ov.strokeStyle = 'rgba(75,52,28,0.42)'; ov.lineWidth = 0.9; ov.beginPath();
    for (let k = 0; k <= n; k++) { const t = at(k / n), o = jit[k]; if (horiz) ov.lineTo(t, p + o); else ov.lineTo(p + o, t); if (!k) { /* first lineTo acts as moveTo */ } }
    ov.stroke();
    ov.strokeStyle = 'rgba(255,255,250,0.6)'; ov.lineWidth = 0.7; ov.setLineDash([5, 9, 2, 14]); ov.beginPath(); // whitened, worn stretches
    for (let k = 0; k <= n; k++) { const t = at(k / n), o = jit[k] + flip * 0.9; if (horiz) ov.lineTo(t, p + o); else ov.lineTo(p + o, t); }
    ov.stroke(); ov.setLineDash([]);
  };
  for (let i = 1; i < cols; i++) crease(false, X(i), i % 2 ? 1 : -1);
  for (let j = 1; j < rows; j++) crease(true, Y(j), 1);
  for (let i = 1; i < cols; i++) for (let j = 1; j < rows; j++) { // tiny wear where creases cross
    const x = X(i), y = Y(j), w = ov.createRadialGradient(x, y, 0, x, y, 26); w.addColorStop(0, 'rgba(255,252,240,0.6)'); w.addColorStop(1, 'rgba(255,252,240,0)'); ov.fillStyle = w; ov.fillRect(x - 26, y - 26, 52, 52);
    ov.lineWidth = 0.8; for (let k = 0; k < 14; k++) { const a = R() * Math.PI * 2, r0 = 3 + R() * 10, l = 2 + R() * 5; ov.strokeStyle = R() < 0.6 ? 'rgba(255,255,248,0.75)' : 'rgba(110,80,45,0.35)'; ov.beginPath(); ov.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ov.lineTo(x + Math.cos(a) * (r0 + l), y + Math.sin(a) * (r0 + l)); ov.stroke(); }
  }
  grain(ov, 0.55);
  const vg = ov.createRadialGradient(S / 2, S / 2, S * 0.42, S / 2, S / 2, S * 0.72); vg.addColorStop(0, 'rgba(120,85,40,0)'); vg.addColorStop(1, 'rgba(120,85,40,0.22)'); ov.fillStyle = vg; ov.fillRect(0, 0, S, S);
  ov.restore();
}

export function createHUD(handlers) {
  const root = el('div'); root.id = 'hud';
  document.body.appendChild(root);

  // ---- Top-left: rank and the time, as plain white text
  const tl = el('div', 'tl');
  const rankLine = el('div', 'rank'); const num = el('b', 'num', '0'); const rankName = el('span', 'name', 'New Scout');
  rankLine.append(icon('star', 'ico gold'), num, rankName);
  const bar = el('div', 'bar'); const barFill = el('i'); bar.append(barFill);
  const clockLine = el('div', 'line'); const clockIco = icon('sun'); const time = el('b', 'time'); const phase = el('span');
  const wxEl = el('span', 'wx'); // the weather: a small icon and word next to the clock
  clockLine.append(clockIco, time, phase, wxEl);
  const nowLine = el('div', 'line now');
  // How you are feeling: Food, Water, Energy, Cheer as a compact row just above the quick bar (always there, dimmed when calm)
  const statBox = el('div', 'stats'); const statRows = {};
  for (const k of STAT_KEYS) { const row = el('div', 'stat'); row.title = STAT_LABEL[k]; const fill = el('i'); const meter = el('div', 'meter'); meter.append(fill); const num = el('b', 'sn'); row.append(icon(k), meter, num); statBox.append(row); statRows[k] = { row, fill, num, shown: null, timer: null }; }
  // Rank, clock and weather fade away when idle (see "calm" below); the stat icons have their own rule.
  const topGroup = el('div', 'fade'); topGroup.append(rankLine, bar, clockLine, nowLine);
  tl.append(topGroup);

  // ---- Bottom-left: line-drawn buttons, and what you are standing on
  const bl = el('div', 'bl');
  const ground = el('div', 'ground'); const groundDot = el('i'); const groundText = el('span'); ground.append(groundDot, groundText);
  const tools = el('div', 'tools');
  const mkBtn = (name, title, key) => { const b = el('button', 'tool'); b.innerHTML = ICONS[name]; b.title = title; b.append(el('em', null, key)); return b; };
  const bagBtn = mkBtn('bag', 'Backpack', 'B');
  const journalBtn = mkBtn('book', 'Journal', 'J'), mapBtn = mkBtn('map', 'Map', 'M'), lookBtn = mkBtn('mouse', 'Free look: move the mouse to turn the camera', 'C'), soundBtn = mkBtn('sound', 'Sound', 'N'), menuBtn = mkBtn('pause', 'Pause', 'Esc');
  const dot = el('span', 'dot'); journalBtn.append(dot);
  tools.append(bagBtn, journalBtn, mapBtn, lookBtn, soundBtn, menuBtn);
  bl.classList.add('fade'); bl.append(ground, tools);

  // ---- Bottom-centre: the first few pockets of the backpack, one key each
  const belt = el('div', 'belt fade');

  // ---- Backpack: a canvas flap with pockets
  const packSheet = el('div', 'sheet packsheet off');
  const pack = el('div', 'pack');
  const packHead = el('div', 'head'); const packTitle = el('h2', null, 'Backpack'); const packCount = el('span', 'count'); packHead.append(packTitle, packCount);
  const feel = el('div', 'feel'); const feelRows = {};
  for (const k of STAT_KEYS) { const r = el('div', 'f'); const fill = el('i'); const m = el('div', 'meter'); m.append(fill); const n = el('b'); r.append(icon(k), el('span', null, STAT_LABEL[k]), m, n); feel.append(r); feelRows[k] = { r, fill, n }; }
  const grid = el('div', 'grid');
  const detail = el('div', 'detail');
  pack.append(packHead, feel, grid, detail);
  packSheet.append(pack);
  let bagView = { slots: [], capacity: 12 }, selected = 0, bagOrder = [];
  // Backpack grid order = quick-bar order: slots 1..8 first (null = a tool not found yet, shown as a ghost), then the unkeyed rest.
  const orderBag = (slots) => { const belt = beltOf(slots); return [...belt, ...slots.filter((s) => !belt.includes(s))]; };

  // ---- Bottom-right: what the keys do right now
  const hints = el('div', 'hints');

  // ---- Pop-ups
  const toasts = el('div', 'toasts');
  const rewards = el('div', 'rewards'); // paper cards that slide in and fill in for each find
  const banner = el('div', 'banner'); const bannerBig = el('div', 'big'); const bannerSmall = el('div', 'small'); banner.append(bannerBig, el('i'), bannerSmall);
  const danger = el('div', 'danger'); const alertBox = el('div', 'alert'); alertBox.append(el('div', 'big', '⚠ DANGER ⚠'), el('div', 'small', 'You are too deep in the wild jungle. Go back to camp!'));
  const stop = el('div', 'stop'); stop.append(el('div', 'hand', '✋'), el('div', 'big', 'STOP'), el('div', 'small', 'You cannot go any further. It is not safe.'), el('div', 'small dim', 'Heading back to camp…'));
  const bubble = el('div', 'bubble'); const bubbleName = el('div', 'who'); const bubbleText = el('div', 'said'); bubble.append(bubbleName, bubbleText);

  // ---- Journal: a spiral notebook
  const book = el('div', 'sheet book off');
  const page = el('div', 'page');
  const rings = el('div', 'rings'); for (let i = 0; i < 9; i++) rings.append(el('i'));
  const bookHead = el('div', 'head'); const sumRank = el('h2'); const sumText = el('p');
  bookHead.append(sumRank, sumText);
  const lists = el('div', 'lists');
  const foot = el('div', 'foot');
  // Tabs: the camp badge goal (the original journal), then the story's pages (src/story/ui.js).
  const TABS = [['camp', 'Camp'], ['quests', 'Quests'], ['notes', 'Notes'], ['guide', 'Field guide'], ['people', 'People']];
  let tab = 'camp', lastProgress = null;
  const tabRow = el('div', 'tabs');
  const tabBtns = TABS.map(([id, label]) => { const b = el('button', id === tab ? 'on' : '', label); b.addEventListener('click', () => { tab = id; renderJournal(); }); tabRow.append(b); return b; });
  page.append(tabRow, bookHead, lists, foot);
  book.append(rings, page);

  // ---- Map: a folded paper sheet
  const sheet = el('div', 'sheet mapsheet off');
  const paper = el('div', 'paper');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const baseMap = document.createElement('canvas'); baseMap.width = baseMap.height = MAP * dpr;
  const bctx = baseMap.getContext('2d'); bctx.scale(dpr, dpr);
  let mapDrawn = false; // the sheet is painted the first time it is opened (it samples the whole island)
  const mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = MAP * dpr; mapCanvas.className = 'mp';
  const mctx = mapCanvas.getContext('2d');
  const sheetBg = document.createElement('canvas'), sheetOv = document.createElement('canvas'); sheetOv.className = 'ov';
  sheetBg.width = sheetBg.height = sheetOv.width = sheetOv.height = SHEET * dpr;
  paper.append(sheetBg, mapCanvas, sheetOv); sheet.append(paper);

  // ---- Start screen: the name of the place, Continue (when there is a save), New game, or explore without the guide
  const start = el('div', 'overlay start');
  const startCont = el('button', 'word cont', 'Continue'), startJourney = el('button', 'word go', 'New game'), startFree = el('button', 'word', 'Explore freely');
  const contWhat = el('p', 'what', 'Carry on where you left off.');
  startCont.style.display = contWhat.style.display = 'none';
  start.append(el('h1', null, 'Scout Camp Island'), el('p', 'sub', 'a little camp by the sea'), startCont, contWhat, startJourney, el('p', 'what', 'Choose your name and look, then start your first day at camp.'), startFree, el('p', 'what', 'A new game with no guide on screen.'), el('p', 'press', 'Enter to start'));
  startCont.addEventListener('click', () => handlers.onStart('continue'));
  startJourney.addEventListener('click', () => handlers.onStart('journey'));
  startFree.addEventListener('click', () => handlers.onStart('free'));

  // ---- The journey, top-right: where you are on the path and what to try next
  const quest = el('div', 'quest off');
  const questHead = el('div', 'qh'), questTitle = el('div', 'qt'), questText = el('div', 'qx'), questKey = el('div', 'qk');
  questKey.append(el('kbd', null, 'G'), el('span', null, 'hide guide'));
  quest.append(questHead, questTitle, questText, questKey);
  const way = el('div', 'way'); const wayDist = el('b'); way.append(el('i'), wayDist);
  // ---- A tip: one line of help the first time something comes up
  const lookHint = el('div', 'lookhint', 'Click to look around');
  const tip = el('div', 'tip1'); const tipText = el('span'); tip.append(el('b', null, 'TIP'), tipText);
  let tipTimer = null; const tipQueue = [];
  function nextTip() { const t = tipQueue.shift(); if (!t) { tip.classList.remove('show'); tipTimer = null; return; } tipText.textContent = t; tip.classList.add('show'); tipTimer = setTimeout(() => { tip.classList.remove('show'); tipTimer = setTimeout(nextTip, 500); }, 6500); }
  // ---- Captions for the little cutscenes: a title and a line, placed per shot, sliding softly in and out
  const cine = el('div', 'cine'); const cineSkip = el('div', 'ck');
  cineSkip.append(el('kbd', null, 'Space'), el('span', null, 'skip'));
  cine.append(cineSkip);
  let capTimers = [];
  function setCaption(title, sub, place = 'lower-left', hold = 5) {
    capTimers.forEach(clearTimeout); capTimers = [];
    // The old caption fades where it is; the new one is a fresh element, so the two can cross.
    for (const old of cine.querySelectorAll('.cap')) { old.classList.remove('show'); capTimers.push(setTimeout(() => old.remove(), 1300)); }
    if (!title && !sub) return;
    const cap = el('div', `cap p-${place}${title ? '' : ' notitle'}`);
    cap.append(el('i'), el('div', 'ct', title || ''), el('div', 'cs', sub || ''));
    cine.append(cap);
    capTimers.push(setTimeout(() => cap.classList.add('show'), 450));
    if (hold > 1.6) capTimers.push(setTimeout(() => cap.classList.remove('show'), (hold - 0.9) * 1000));
  }

  // ---- Pause menu: white words on the dimmed picture. Two panels: Game (left) and Settings (right); Controls opens the key list.
  // Keyboard: W/S move in a panel, left/right arrows jump to the other panel, A/D change a value, Enter or E picks (see menuKey, used by main.js).
  const menu = el('div', 'overlay menu off');
  const resume = el('button', 'word', 'Resume');
  // One option row: a label on the left, its value on the right. row.val holds the value's text.
  const opt = (label) => { const row = el('button', 'orow'); row.val = el('b'); row.append(el('span', null, label), row.val); return row; };
  const guideRow = opt('Journey guide'), filmRow = opt('Cutscenes'), saverRow = opt('Battery saver'), speedRow = opt('Day speed'), lookRow = opt('Camera'), soundRow = opt('Sound'), gfxRow = opt('Graphics'), timeRow = opt('Time of day'), weatherRow = opt('Weather'), keysRow = opt('Controls');
  keysRow.val.textContent = '›';
  // Time of day and Weather step through their choices (Auto for the random weather). Time shows the nearest preset when the menu opens.
  let timeAt = 1, wxAt = 0;
  weatherRow.val.textContent = WEATHERS[0][0];
  const showTime = () => { timeRow.val.textContent = TIMES[timeAt][0]; };
  const nearestTime = (t) => { let best = 0, bd = 9; TIMES.forEach(([, v], i) => { const d = Math.abs(v - t), c = Math.min(d, 1 - d); if (c < bd) { bd = c; best = i; } }); return best; };
  const stepTime = (d) => { timeAt = (timeAt + d + TIMES.length) % TIMES.length; showTime(); handlers.onSetTime(TIMES[timeAt][1]); };
  const stepWeather = (d) => { wxAt = (wxAt + d + WEATHERS.length) % WEATHERS.length; weatherRow.val.textContent = WEATHERS[wxAt][0]; handlers.onSetWeather && handlers.onSetWeather(WEATHERS[wxAt][1]); };
  timeRow.step = stepTime; weatherRow.step = stepWeather;
  const controls = el('div', 'keys');
  for (const [k, v] of [['W A S D', 'Move'], ['Shift', 'Switch walk / run'], ['Space', 'Hop'], ['E', 'Use / pick up / say hello'], ['B', 'Backpack'], ['G', 'Quest guide on / off'], ['1 – 8', 'Quick bar: 1 flask, 2 torch, 3 bugle, 4 camera, 5 litter bag, 6 – 8 other things'], ['F', 'Join in with the camp'], ['X', 'Sit down / stand up'], ['Mouse drag', 'Look around'], ['C', 'Free look on / off'], ['Scroll', 'Zoom'], ['J', 'Journal (Notes are inside)'], ['M', 'Map'], ['N', 'Sound'], ['T', 'Day speed 1× to 2×'], ['Tab', 'Menu'], ['Esc', 'Pause']]) {
    const r = el('div', 'key'); r.append(el('kbd', null, k), el('span', null, v)); controls.append(r);
  }
  const gamePanel = el('div', 'panel'); gamePanel.append(el('h3', null, 'Game'), resume, speedRow, timeRow, weatherRow, keysRow);
  const setPanel = el('div', 'panel'); setPanel.append(el('h3', null, 'Settings'), guideRow, filmRow, saverRow, lookRow, soundRow, gfxRow);
  const mbody = el('div', 'mbody'); mbody.append(gamePanel, setPanel);
  const backRow = el('button', 'word', 'Back');
  const keyPanel = el('div', 'panel ctl'); keyPanel.append(el('h3', null, 'Controls'), controls, backRow);
  const mhelp = el('p', 'mhelp', '↑↓ move · ←→ switch panel · A D change · Enter pick · Tab/Esc close');
  menu.append(el('h2', null, 'Paused'), mbody, keyPanel, mhelp);
  keyPanel.style.display = 'none';
  guideRow.addEventListener('click', () => handlers.onToggleGuide());
  filmRow.addEventListener('click', () => handlers.onToggleFilms());
  saverRow.addEventListener('click', () => handlers.onToggleSaver());
  gfxRow.addEventListener('click', () => handlers.onToggleGraphics && handlers.onToggleGraphics());
  speedRow.addEventListener('click', () => handlers.onDaySpeed());
  timeRow.addEventListener('click', () => stepTime(1));
  weatherRow.addEventListener('click', () => stepWeather(1));
  // Keyboard highlight: cols[0] is the Game panel, cols[1] the Settings panel; the key list has only Back.
  const cols = [[resume, speedRow, timeRow, weatherRow, keysRow], [guideRow, filmRow, saverRow, lookRow, soundRow, gfxRow]];
  let col = 0, row = 0, inKeys = false;
  const allItems = cols[0].concat(cols[1], [backRow]);
  function paintCursor() { const cur = inKeys ? backRow : cols[col][row]; for (const o of allItems) o.classList.toggle('sel', o === cur); }
  function showKeys(on) { inKeys = on; mbody.style.display = on ? 'none' : ''; keyPanel.style.display = on ? '' : 'none'; paintCursor(); }
  keysRow.addEventListener('click', () => showKeys(true));
  backRow.addEventListener('click', () => showKeys(false));
  cols.forEach((list, c) => list.forEach((o, r) => o.addEventListener('mouseenter', () => { col = c; row = r; paintCursor(); })));
  paintCursor();

  const night = el('div', 'sleep'); night.append(el('div', 'zz', 'Z z z'), el('div', 'sub', 'Sleeping until morning. Press any movement key to get up.'));
  root.append(danger, alertBox, stop, night, lookHint, way, quest, tip, cine, tl, bl, statBox, belt, hints, toasts, rewards, banner, bubble, book, sheet, packSheet, start, menu);

  resume.addEventListener('click', () => handlers.onResume());
  menuBtn.addEventListener('click', () => handlers.onToggleMenu());
  soundBtn.addEventListener('click', () => handlers.onToggleSound());
  soundRow.addEventListener('click', () => handlers.onToggleSound());
  journalBtn.addEventListener('click', () => handlers.onToggleJournal());
  mapBtn.addEventListener('click', () => handlers.onToggleMap());
  lookBtn.addEventListener('click', () => handlers.onToggleLook());
  lookRow.addEventListener('click', () => handlers.onToggleLook());
  book.addEventListener('click', (e) => { if (e.target === book) handlers.onToggleJournal(); });
  bagBtn.addEventListener('click', () => handlers.onToggleBag());
  packSheet.addEventListener('click', (e) => { if (e.target === packSheet) handlers.onToggleBag(); });
  sheet.addEventListener('click', () => handlers.onToggleMap());
  // Buttons must not keep keyboard focus, or Space and Enter would press them again.
  root.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });

  // ---- Calm: the picture first --------------------------------------------------------------------------
  // ONE RULE for the clock/day/weather block (with rank), the bottom-left toolbar and the pocket belt: each fades out
  // after QUIET seconds and wakes for QUIET seconds when: the pointer goes near its corner or edge; a related key is
  // pressed (B J M C N Esc Tab T for the top and toolbar, 1-6 for the belt); the time of day changes (top and toolbar);
  // something is picked up or used (belt, and the top block on a find); or while Alt is held (everything stays).
  // The first run ever keeps it all up for a full minute before the first fade, later runs for 8 s.
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  };
  const QUIET = 6000;
  const runs = store.get('cozy.hud.runs', 0); store.set('cozy.hud.runs', runs + 1);
  const calm = {
    top: { node: topGroup, until: 0 }, bar: { node: bl, until: 0 }, belt: { node: belt, until: 0 },
    alt: false, first: runs === 0,
  };
  const wake = (names, ms = QUIET) => {  const t = performance.now() + ms; for (const n of names) calm[n].until = Math.max(calm[n].until, t); paintCalm(); };
  function paintCalm() {
    const now = performance.now();
    for (const n of ['top', 'bar', 'belt']) calm[n].node.classList.toggle('away', hud.started && !calm.alt && now > calm[n].until);
    // The stat row moves with the belt: full strength when any stat is low or just changed, or the belt is awake; else dimmed.
    const rows = STAT_KEYS.map((k) => statRows[k].row);
    statBox.classList.toggle('awake', calm.alt || now <= calm.belt.until || rows.some((r) => r.classList.contains('low') || r.classList.contains('seen')));
  }
  setInterval(paintCalm, 500);
  const ZONES = { top: (x, y) => x < 400 && y < 170, bar: (x, y) => x < 460 && y > innerHeight - 130, belt: (x, y) => Math.abs(x - innerWidth / 2) < 260 && y > innerHeight - 120 };
  window.addEventListener('mousemove', (e) => { for (const n in ZONES) if (ZONES[n](e.clientX, e.clientY)) wake([n]); });
  const KEY_WAKES = { KeyB: ['bar'], KeyJ: ['bar'], KeyM: ['bar'], KeyC: ['bar'], KeyN: ['bar'], Escape: ['bar', 'top'], Tab: ['bar', 'top'], KeyT: ['top'] };
  for (let i = 1; i <= 6; i++) KEY_WAKES[`Digit${i}`] = ['belt'];
  // Key hints: the plain how-to-move hints go away once the key has been used a few times (saved per key).
  const LEARN = { 'W A S D': ['move', 5], Shift: ['shift', 3], Space: ['hop', 3], X: ['sit', 3] };
  const LEARN_CODES = { KeyW: 'move', KeyA: 'move', KeyS: 'move', KeyD: 'move', ArrowUp: 'move', ArrowDown: 'move', ArrowLeft: 'move', ArrowRight: 'move', ShiftLeft: 'shift', ShiftRight: 'shift', Space: 'hop', KeyX: 'sit' };
  const used = store.get('cozy.hud.keys', {});
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') { calm.alt = true; paintCalm(); }
    if (!hud.started) return;
    if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const w = KEY_WAKES[e.code]; if (w) wake(w);
      const id = LEARN_CODES[e.code];
      if (id && !hud.menuOpen && !hud.journalOpen && !hud.mapOpen && !hud.bagOpen) { used[id] = (used[id] || 0) + 1; store.set('cozy.hud.keys', used); if (used[id] <= 5) { lastHints = ''; if (lastHintList) hud.setHints(lastHintList); } }
    }
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'Alt') { calm.alt = false; wake(['top', 'bar', 'belt'], 1500); } });
  window.addEventListener('blur', () => { calm.alt = false; });
  let lastHintList = null, lastPhase = null, lastBagSig = null, lastCount = null;

  // ---- A find: a paper card slides in, its title fills in like ink, and a stamp lands (src/hud.js, rewards) ---
  const REWARD_KIND = { discovery: 'Discovery', note: 'Journal note', badge: 'Badge earned', guide: 'Field guide' };
  function reward({ kind = 'discovery', title, sub = '', pic = '' }) {
    const card = el('div', `reward ${kind}`);
    const stamp = el('span', 'stamp'); if (pic) stamp.append(el('span', 'pic', pic)); else stamp.append(icon('star', 'ico'));
    const txt = el('div', 'rw-text');
    const t = el('div', 'rw-title', title); t.dataset.t = title;
    txt.append(el('div', 'rw-kind', REWARD_KIND[kind] || kind), t);
    if (sub) txt.append(el('div', 'rw-sub', sub));
    card.append(el('i', 'rw-margin'), stamp, txt);
    rewards.append(card);
    while (rewards.children.length > 3) rewards.firstChild.remove();
    setTimeout(() => card.classList.add('out'), 4300);
    setTimeout(() => card.remove(), 5000);
    wake(['top']);
    if (handlers.onReward) handlers.onReward(kind);
  }

  let lastWeather = '', lastClock = '', lastGround = '', lastHints = '', bannerTimer = null, bubbleTimer = null, steps = 0, frame = 0;

  const hud = {
    menuOpen: false, started: false, journalOpen: false, mapOpen: false, bagOpen: false,
    begin() { hud.started = true; start.classList.add('off'); root.classList.add('playing'); wake(['top', 'bar', 'belt'], calm.first ? 60000 : 8000); },
    openMenu() { hud.menuOpen = true; menu.classList.remove('off'); showKeys(false); col = 0; row = 0; if (handlers.getTime) { timeAt = nearestTime(handlers.getTime()); showTime(); } paintCursor(); },
    // Leaves the key list for the menu. Returns true when it did (so Esc or Tab only step back).
    menuBack() { if (!inKeys) return false; showKeys(false); return true; },
    // Keys for the open menu. Returns true when it used the key.
    menuKey(e) {
      const c = e.code;
      if (inKeys) { if (c === 'Enter' || c === 'NumpadEnter' || c === 'KeyE') showKeys(false); return ['Enter', 'NumpadEnter', 'KeyE', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c); }
      const list = cols[col], cur = list[row];
      if (c === 'KeyW' || c === 'ArrowUp') { row = Math.max(0, row - 1); paintCursor(); return true; }
      if (c === 'KeyS' || c === 'ArrowDown') { row = Math.min(list.length - 1, row + 1); paintCursor(); return true; }
      if (c === 'ArrowLeft' || c === 'ArrowRight') {
        const to = c === 'ArrowLeft' ? 0 : 1;
        if (to !== col) { const y = cur.getBoundingClientRect().top, other = cols[to]; let best = 0; other.forEach((o, i) => { if (Math.abs(o.getBoundingClientRect().top - y) < Math.abs(other[best].getBoundingClientRect().top - y)) best = i; }); col = to; row = best; paintCursor(); }
        return true;
      }
      if (c === 'KeyA' || c === 'KeyD') { if (cur !== resume && cur !== keysRow) { const d = c === 'KeyA' ? -1 : 1; if (cur.step) cur.step(d); else cur.click(); } return true; }
      if (c === 'Enter' || c === 'NumpadEnter' || c === 'KeyE') { cur.click(); return true; }
      return false;
    },
    closeMenu() { hud.menuOpen = false; menu.classList.add('off'); },
    toggleJournal() { hud.journalOpen = !hud.journalOpen; book.classList.toggle('off', !hud.journalOpen); dot.classList.remove('on'); if (hud.journalOpen) renderJournal(); if (hud.journalOpen && hud.mapOpen) hud.toggleMap(); if (hud.journalOpen && hud.bagOpen) hud.toggleBag(); },
    toggleBag() { hud.bagOpen = !hud.bagOpen; packSheet.classList.toggle('off', !hud.bagOpen); if (hud.bagOpen) { if (hud.journalOpen) hud.toggleJournal(); if (hud.mapOpen) hud.toggleMap(); renderDetail(); } },
    // The bars top-left and the numbers in the backpack.
    setStats(s) {
      for (const k of STAT_KEYS) {
        const v = Math.round(s[k]), low = s[k] < LOW;
        if (statRows[k].v === v) continue;
        const R = statRows[k];
        R.v = v; R.fill.style.width = `${v}%`; R.num.textContent = v; R.row.classList.toggle('low', low);
        // Shown while low; otherwise for a few seconds after a real change (not every tiny drain tick).
        if (R.shown === null) R.shown = v;
        else if (Math.abs(v - R.shown) >= 6) { R.shown = v; R.row.classList.add('seen'); clearTimeout(R.timer); R.timer = setTimeout(() => R.row.classList.remove('seen'), 3500); }
        feelRows[k].fill.style.width = `${v}%`; feelRows[k].n.textContent = v; feelRows[k].r.classList.toggle('low', low);
      }
      statRows.energy.row.classList.toggle('low', s.winded || s.energy < LOW);
      paintCalm();
    },
    // view: { slots: [{ id, count, label? }], capacity }. Redraws the belt and the pockets.
    setBag(view) {
      bagView = view;
      const sig = view.slots.map((s) => `${s.id}:${s.count}:${s.label || ''}`).join('|');
      if (lastBagSig !== null && sig !== lastBagSig) wake(['belt']);
      lastBagSig = sig;
      bagOrder = orderBag(view.slots);
      if (!bagOrder[selected]) { const f = bagOrder.findIndex(Boolean); selected = f < 0 ? 0 : f; }
      // The quick bar (src/logic/belt.js): tools in fixed slots 1-5 (a tool you do not have yet shows faintly in its
      // place), then the first other things.
      belt.replaceChildren(...beltOf(view.slots).map((s, i) => {
        const b = el('button', 'slot');
        if (!s) {
          const tool = TOOLS[i];
          b.title = tool ? `${ITEMS[tool].name} (not found yet)` : 'Empty';
          b.append(el('span', 'pic', tool ? ITEMS[tool].icon : '·'), el('b', null, ''), el('em', null, String(i + 1)));
          b.style.opacity = '0.3'; b.style.filter = 'grayscale(1)'; b.style.pointerEvents = 'none';
          return b;
        }
        b.title = ITEMS[s.id].name;
        b.append(el('span', 'pic', ITEMS[s.id].icon), el('b', null, s.label || (s.count > 1 ? String(s.count) : '')), el('em', null, String(i + 1)));
        b.addEventListener('click', () => handlers.onUseItem(s.id));
        return b;
      }));
      packCount.textContent = `${view.slots.length} of ${view.capacity} pockets`;
      const cells = [];
      const total = Math.max(view.capacity, bagOrder.length);
      for (let i = 0; i < total; i++) {
        const s = bagOrder[i], c = el('button', s ? (i === selected ? 'cell on' : 'cell') : 'cell empty');
        if (s) { c.append(el('span', 'pic', ITEMS[s.id].icon), el('b', null, s.label || (s.count > 1 ? String(s.count) : ''))); if (i < BELT_SIZE) c.append(el('em', null, String(i + 1))); c.addEventListener('click', () => { selected = i; hud.setBag(bagView); }); c.addEventListener('dblclick', () => handlers.onUseItem(s.id)); }
        else if (i < BELT_SIZE) { const tool = TOOLS[i]; c.title = tool ? `${ITEMS[tool].name} (not found yet)` : 'Empty'; c.append(el('span', 'pic', tool ? ITEMS[tool].icon : ''), el('b', null, ''), el('em', null, String(i + 1))); c.style.opacity = '0.3'; c.style.filter = 'grayscale(1)'; c.style.pointerEvents = 'none'; }
        cells.push(c);
      }
      grid.replaceChildren(...cells);
      renderDetail();
    },
    // A plain line of news at the top: what you picked up, how you feel.
    note(text, pic = '') {
      const t = el('div', 'toast note');
      if (pic) t.append(el('span', 'pic', pic));
      t.append(el('span', 'label', text));
      toasts.append(t);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3200);
    },
    toggleMap() { hud.mapOpen = !hud.mapOpen; sheet.classList.toggle('off', !hud.mapOpen); if (hud.mapOpen && hud.journalOpen) hud.toggleJournal(); if (hud.mapOpen && hud.bagOpen) hud.toggleBag(); },
    setSound(on) { soundBtn.classList.toggle('muted', !on); soundRow.val.textContent = on ? 'On' : 'Off'; },
    setLookHint(on) { lookHint.classList.toggle('show', !!on); },
    setLook(on) { lookBtn.classList.toggle('active', on); lookRow.val.textContent = on ? 'Free look' : 'Hold and drag'; },
    // 0 = safe; toward 1 the edges of the picture turn red and the warning shows.
    setDanger(level) { danger.style.opacity = level; root.classList.toggle('danger-on', level > 0); },
    // The quest card top-right. card: { head, title, text } or null when there is nothing to follow.
    setQuest(card, shown) {
      quest.classList.toggle('off', !shown || !card);
      guideRow.val.textContent = shown ? 'On' : 'Off';
      if (!card) return;
      questHead.textContent = card.head; questTitle.textContent = card.title; questText.textContent = card.text;
    },
    hideStart(on) { start.classList.toggle('off', on); },
    setContinue(on) { startCont.style.display = contWhat.style.display = on ? '' : 'none'; startJourney.classList.toggle('go', !on); },
    // The story pages call this when something changed; it redraws the open page.
    refreshJournal() { if (hud.journalOpen) renderJournal(); },
    openTab(id) { tab = id; renderJournal(); },
    setFilms(on) { filmRow.val.textContent = on ? 'On' : 'Off'; },
    setDaySpeed(k) { speedRow.val.textContent = `${k}×`; },
    setSaver(on) { saverRow.val.textContent = on ? 'On (30 fps)' : 'Off (60 fps)'; },
    setGraphics(g) { gfxRow.val.textContent = g === 'low' ? 'Low (cooler)' : 'High (glow)'; },
    // A marker on the picture pointing at the next place on the journey. x, y in pixels; null hides it.
    setWaypoint(x, y, metres, edge) {
      if (x === null) { way.style.opacity = 0; return; }
      way.style.opacity = 1; way.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
      way.classList.toggle('edge', !!edge); wayDist.textContent = `${Math.round(metres)} m`;
    },
    // A find: kind 'discovery' | 'note' | 'badge' | 'guide'. Also calls handlers.onReward(kind) (main.js nudges the camera).
    reward,
    tip(text) { tipQueue.push(text); if (!tipTimer) nextTip(); },
    // A film: everything else steps back (the picture keeps the whole screen).
    setCine(on) { root.classList.toggle('filming', on); if (!on) setCaption(); },
    // place: 'lower-left', 'lower-right', 'upper-left', 'upper-right', 'center', 'lower-center'; hold: seconds on screen.
    setCaption,
    // The hard stop: the whole screen is taken over while you are walked back.
    setStop(on) { root.classList.toggle('stopped', on); },
    setSleeping(on) { root.classList.toggle('asleep', on); },
    setActivity(label) { nowLine.textContent = label; },
    setJoin() {}, // the join hint now lives in the key list
    setClock(text, phaseText, isNight, dayNumber) {
      const key = `${text}|${dayNumber}`;
      if (key === lastClock) return;
      lastClock = key;
      clockIco.innerHTML = ICONS[isNight ? 'moon' : 'sun'];
      time.textContent = text; phase.textContent = `${phaseText} · Day ${dayNumber}`;
      if (lastPhase !== null && lastPhase !== phaseText) wake(['top', 'bar']);
      lastPhase = phaseText;
    },
    setWeather(kind, label) { if (kind === lastWeather) return; if (lastWeather) wake(['top']); lastWeather = kind; wxEl.innerHTML = `${ICONS[{ sun: 'sun', wind: 'wind', rain: 'rain', fog: 'fog' }[kind]] || ''}${label}`; wxEl.dataset.kind = kind; },
    setSteps(n) { steps = n; },
    setGround(label, color) { if (label === lastGround) return; lastGround = label; groundText.textContent = label; groundDot.style.background = color; },
    // The list of keys, bottom-right: only what is useful at this moment.
    setHints(rawList) {
      lastHintList = rawList;
      const list = rawList.filter(([k, , strong]) => { const l = !strong && LEARN[k]; return !l || (used[l[0]] || 0) < l[1]; });
      const key = list.map((h) => `${h[0]}:${h[1]}:${h[2] ? 1 : 0}`).join('|');
      if (key === lastHints) return;
      lastHints = key;
      hints.replaceChildren(...list.map(([k, label, strong]) => { const r = el('div', strong ? 'hint strong' : 'hint'); r.append(el('kbd', null, k), el('span', null, label)); return r; }));
    },
    // Rank, progress bar and the notebook pages all come from the same numbers.
    setProgress(list, rank, count, total) {
      num.textContent = count;
      if (lastCount !== null && count !== lastCount) wake(['top']);
      lastCount = count;
      const span = rank.next ? rank.next.at - rank.from : 1, pct = rank.next ? Math.round(((count - rank.from) / span) * 100) : 100;
      rankName.textContent = rank.name; barFill.style.width = `${pct}%`;
      lastProgress = { list, rank, count, total };
      if (tab === 'camp') renderJournal();
    },
    _campPage({ list, rank, count, total }) {
      sumRank.textContent = rank.name;
      sumText.textContent = `${count} of ${total} found. ${rank.next ? `${rank.next.at - count} more to become ${rank.next.name}.` : 'You have found everything!'}`;
      foot.textContent = `${steps.toLocaleString('en-US')} steps walked. Nothing here is required.`;
      lists.replaceChildren(...CATEGORIES.map((cat) => {
        const items = list.filter((d) => d.cat === cat.id), done = items.filter((d) => d.done).length;
        const sec = el('section'); const h = el('h3'); h.append(el('span', null, cat.label), el('b', null, `${done}/${items.length}`)); sec.append(h);
        for (const d of items) {
          const row = el('div', d.done ? 'item done' : 'item');
          const mark = el('span', 'mark'); if (d.done) mark.innerHTML = ICONS.star;
          const txt = el('div'); txt.append(el('div', 'label', d.label), el('div', 'tip', d.done ? 'Found' : d.hint));
          row.append(mark, txt); sec.append(row);
        }
        return sec;
      }));
    },
    toast(label, count, total) {
      reward({ kind: 'discovery', title: label, sub: `${count} of ${total} found` });
      if (!hud.journalOpen) dot.classList.add('on');
    },
    // Big words across the top: a new rank, or the camp moving on to its next activity.
    announce(small, big) { hud.rankUp(big, small); },
    rankUp(name, small = 'New rank') {
      bannerSmall.textContent = small; bannerBig.textContent = name; banner.classList.add('show');
      clearTimeout(bannerTimer); bannerTimer = setTimeout(() => banner.classList.remove('show'), 3800);
    },
    // A speech bubble over whoever you just spoke to.
    say(name, text) { bubbleName.textContent = name; bubbleText.textContent = text; bubble.classList.add('show'); clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 2800); },
    placeBubble(x, y, onScreen) { bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`; bubble.style.visibility = onScreen ? 'visible' : 'hidden'; },
    // Marks where you and the other scouts are, on the paper map while it is open.
    drawMap(player, facing, villagers) {
      if (!hud.mapOpen || frame++ % 3) return;
      if (!mapDrawn) { drawPaperMap(bctx); paintSheet(sheetBg.getContext('2d'), sheetOv.getContext('2d'), dpr); mapDrawn = true; }
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.drawImage(baseMap, 0, 0);
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mctx.fillStyle = '#f7eed4'; mctx.strokeStyle = 'rgba(45,35,25,0.85)'; mctx.lineWidth = 1.2;
      for (const v of villagers) { mctx.beginPath(); mctx.arc(mx(v.x), mz(v.z), 2.6, 0, Math.PI * 2); mctx.fill(); mctx.stroke(); }
      mctx.save(); mctx.translate(mx(player.x), mz(player.z));
      mctx.fillStyle = 'rgba(255,90,60,0.22)'; mctx.beginPath(); mctx.arc(0, 0, 13 + Math.sin(performance.now() / 300) * 3, 0, Math.PI * 2); mctx.fill();
      mctx.rotate(Math.atan2(facing.x, -facing.z));
      mctx.fillStyle = '#d9442c'; mctx.strokeStyle = '#f7eed4'; mctx.lineWidth = 2.5;
      mctx.beginPath(); mctx.moveTo(0, -10); mctx.lineTo(7, 7); mctx.lineTo(0, 3); mctx.lineTo(-7, 7); mctx.closePath(); mctx.stroke(); mctx.fill();
      mctx.restore();
    },
  };
  // The notebook: the camp page from the journal's numbers, the others from the story.
  function renderJournal() {
    tabBtns.forEach((b, i) => b.classList.toggle('on', TABS[i][0] === tab));
    if (tab === 'camp') { if (lastProgress) hud._campPage(lastProgress); return; }
    const pg = handlers.journalPage ? handlers.journalPage(tab) : null;
    sumRank.textContent = pg ? pg.title : ''; sumText.textContent = pg ? pg.sub : '';
    lists.replaceChildren(...(pg ? pg.nodes : []));
    foot.textContent = tab === 'quests' ? 'Quests never lock you out: wrong answers can always be tried again.' : '';
  }
  // The card under the pockets: what the chosen thing is and what you can do with it.
  function renderDetail() {
    const s = bagOrder[selected];
    if (!s) { detail.replaceChildren(el('p', 'none', 'Your backpack is empty. Look around: shells on the beach, sticks and mushrooms in the jungle, berries on the bushes.')); return; }
    const item = ITEMS[s.id], info = handlers.describeItem(s.id);
    const top = el('div', 'top'); const txt = el('div');
    txt.append(el('div', 'kind', KIND_LABEL[item.kind]), el('h3', null, s.label ? `${item.name} · ${s.label}` : s.count > 1 ? `${item.name} ×${s.count}` : item.name), el('p', null, item.desc));
    top.append(el('span', 'big', item.icon), txt);
    const chips = el('div', 'chips'); for (const c of info.chips) chips.append(el('span', c.startsWith('+') ? 'chip' : 'chip plain', c));
    const acts = el('div', 'acts');
    if (info.action) { const b = el('button', 'act main', info.action); b.addEventListener('click', () => handlers.onUseItem(s.id)); acts.append(b); }
    if (info.second) { const b = el('button', 'act', info.second); b.addEventListener('click', () => handlers.onUseItem(s.id, true)); acts.append(b); }
    if (info.canDrop) { const b = el('button', 'act', 'Put down'); b.addEventListener('click', () => handlers.onDropItem(s.id)); acts.append(b); }
    detail.replaceChildren(top, chips, acts);
  }
  hud.setSound(true);
  hud.setLook(false);
  return hud;
}
