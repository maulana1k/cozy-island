// INTERNAL. Modern hiking and camp tents for the scout camp: a backpacking tent, a dome, a patrol tunnel
// tent, a geodesic leader tent, an open group shelter and a cabin-style utility tent.
// Every builder returns a THREE.Group, origin on the ground at the tent's centre, the door facing +z, units
// in metres (scout 1.05 m). Options (all optional): { color, accent, scale, open } (`open` shows the door
// rolled up; utilityTent also takes `cross` for a first-aid panel, groupShelter `backWall`).
// userData: { size: [x, y, z] metres before `scale`, tris, door: '+z' }; tents with a door opening also carry
// doorRing ([x, y, z] points of the opening) and footprint ([x, z] outline) so a game can hang its own fabric door.
// `hollow` (with `open`) leaves the doorway empty (just the rolled bundle) so the game can show the interior and fit a panel.
// Preview: kit.html?kit=tents&fn=domeTent  (also tentLineup, tentLineupOpen, domeTentOpen, tunnelTentOpen, utilityTentAid).
//
// Cost: each tent is ONE mesh with ONE shared material; colour lives in vertex colours (fly, darker seam
// strips, accent trim, charcoal bathtub, grey inner, silver poles, cream guylines). Seams and windows are
// coloured cells of the fly itself, so nothing is layered on top of the fabric except thin poles and a few
// patches lifted 1 cm off it.
import * as THREE from 'three';

// ---- Palette -------------------------------------------------------------------------------------------
export const TENT_COLORS = { orange: 0xc8673a, mustard: 0xc9a23b, forest: 0x4f7a46, slate: 0x4d6a8a, brick: 0xa8473b };
const INNER = 0x9a9a94, TUB = 0x3b3e42, POLE = 0xbcc1c6, CORD = 0xe6dfcc, PEG = 0xd0d3d6, ZIP = 0x25282c;
const GLASS = 0x2a2f36, REFL = 0xdfe3e6, LOGO = 0xeee6d1, SAND = 0xd6cfb8, WHITE = 0xf1ede2, REDX = 0xb53a32;
const INK = new THREE.Color(0x14171b), PAPER = new THREE.Color(0xf3eddc);
const dark = (c, t) => new THREE.Color(c).lerp(INK, t);
const pale = (c, t) => new THREE.Color(c).lerp(PAPER, t);
const autoAccent = (c) => dark(c, 0.2);

// ---- Small maths ---------------------------------------------------------------------------------------
const TAU = Math.PI * 2, PI = Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sgnpow = (v, p) => Math.sign(v) * Math.abs(v) ** p;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---- One mesh, vertex colours ---------------------------------------------------------------------------
const KC = new Map();
const K = (c) => { if (c.isColor) return c; let r = KC.get(c); if (!r) KC.set(c, (r = new THREE.Color(c))); return r; };
let MAT = null;
const material = () => MAT || (MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide }));

class Mesher {
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, k) {
    const n = cross(sub(b, a), sub(c, a));
    if (n[0] * n[0] + n[1] * n[1] + n[2] * n[2] < 1e-12) return; // degenerate (a pinched apex)
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const q = K(k); for (let i = 0; i < 3; i++) this.c.push(q.r, q.g, q.b);
  }
  quad(a, b, c, d, k) { this.tri(a, b, c, k); this.tri(a, c, d, k); }
  fan(o, ring, k) { for (let i = 0; i < ring.length; i++) this.tri(o, ring[i], ring[(i + 1) % ring.length], k); }
  // A grid of quads: columns `us`, rows `vs`, pt(u, v) -> [x, y, z], kf(i, j) -> colour of the cell.
  grid(us, vs, pt, kf) {
    const P = us.map((u) => vs.map((v) => pt(u, v)));
    for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) this.quad(P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1], kf(i, j));
    return P;
  }
  // A thin pole or cord along a polyline (open ended: the ends are hidden or thin).
  tube(pts, r, k, sides = 3) {
    const rings = pts.map((p, i) => {
      const t = nrm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
      const u = nrm(cross(t, Math.abs(t[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0])), v = cross(t, u);
      return Array.from({ length: sides }, (_, s) => { const a = (s / sides) * TAU + PI / 4; return add(p, add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r))); });
    });
    for (let i = 0; i < pts.length - 1; i++) for (let s = 0; s < sides; s++) this.quad(rings[i][s], rings[i][(s + 1) % sides], rings[i + 1][(s + 1) % sides], rings[i + 1][s], k);
  }
  // A closed vertical wall following a plan loop of [x, z] points, from y0 to y1.
  band(loop, y0, y1, k) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], c = loop[(i + 1) % loop.length];
      this.quad([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], k);
    }
  }
  // A flat rectangle lifted `off` off a surface (a logo, a reflective tab). n = outward normal.
  patch(p, n, w, h, k, off = 0.012) {
    const nn = nrm(n); let u = cross([0, 1, 0], nn); if (Math.hypot(u[0], u[1], u[2]) < 1e-3) u = [1, 0, 0]; u = nrm(u);
    const v = cross(nn, u), c = add(p, mul(nn, off)), U = mul(u, w / 2), V = mul(v, h / 2);
    this.quad(sub(sub(c, U), V), sub(add(c, U), V), add(add(c, U), V), add(sub(c, U), V), k);
  }
  // A peg and the guyline that runs from a point on the tent out to it. dir = [dx, dz] pointing away from the tent.
  guy(from, dir, len, drop = 0.1) {
    const d = nrm([dir[0], 0, dir[1]]), x = from[0] + d[0] * len, z = from[2] + d[2] * len, head = [x, drop, z];
    this.tube([from, head], 0.004, CORD, 3);
    this.tube([[x - d[0] * 0.045, 0.0, z - d[2] * 0.045], head], 0.011, PEG, 3);
  }
}

function finish(b, name, size, scale = 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material()); mesh.castShadow = true; mesh.name = name; // no receiveShadow: self-shadow acne on thin fabric
  const g = new THREE.Group(); g.name = name; g.add(mesh);
  g.userData = { size, tris: b.p.length / 9, door: '+z' };
  g.scale.setScalar(scale);
  return g;
}

// A half-ellipsoid porch hood on the front of a dome (back ring buried in the wall, closes to a beak at the front).
// `open` stops short of the tip and leaves a doorway.
function hood(b, { z0, y0, a0, b0, D, color, open }) {
  const ss = open ? [0, 0.4, 0.75] : [0, 0.4, 0.75, 0.93, 1], bs = [0, 1, 2, 3, 4, 5, 6].map((i) => (i * PI) / 6);
  b.grid(bs, ss, (be, s) => { const q = Math.sqrt(1 - s * s); return [a0 * q * Math.cos(be), y0 + b0 * q * Math.sin(be), z0 + D * s]; }, () => color);
  if (!open) b.tube(ss.map((s) => { const q = Math.sqrt(1 - s * s); return [0, y0 + b0 * q + 0.011, z0 + D * s]; }), 0.009, ZIP, 3); // door zip
}

// ==== 1. Backpacking tent and 3. patrol tunnel tent: hooped tunnels ==================================
// keys: stations along z (rear end, hoops, front end) with half-width W and height H. The fly is a
// superelliptic arch between them; hoops sit on darker sleeve strips; the front slope is the vestibule.
function tunnel(o, S) {
  const { color, accent, open } = o, seamC = dark(color, 0.36), accSeam = dark(accent, 0.3);
  const keys = S.keys, gap = S.gap, d = 0.03, last = keys[keys.length - 1], first = keys[0];
  const env = (z) => {
    let i = 0; while (i < keys.length - 2 && z > keys[i + 1].z) i++;
    const a = keys[i], c = keys[i + 1], t = clamp((z - a.z) / (c.z - a.z), 0, 1);
    return { W: lerp(a.W, c.W, t), H: lerp(a.H, c.H, t) };
  };
  const sec = (z, th) => { const { W, H } = env(z); return [W * Math.cos(th), gap + (H - gap) * Math.abs(Math.sin(th)) ** 0.7, z]; };
  const outN = (z, th) => { const { W, H } = env(z); return nrm([Math.cos(th) / W, Math.sin(th) / (H - gap), 0]); };
  const b = new Mesher();
  // fabric rows
  const zs = [first.z], cells = []; let kind = 'rear';
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (k.hoop) { zs.push(k.z - d); cells.push(kind); zs.push(k.z + d); cells.push('seam'); kind = 'bay'; }
    else { zs.push(k.z); cells.push(kind === 'bay' ? 'front' : kind); }
  }
  const th = [0, 0.45, 0.95, PI / 2 - 0.07, PI / 2 + 0.07, PI - 0.95, PI - 0.45, PI], CREST = 3, win = S.windows || [];
  b.grid(th, zs, (t, z) => sec(z, t), (i, j) => {
    const kd = cells[j];
    if (win.includes(j) && (i === 1 || i === 5)) return GLASS;
    if (kd === 'seam') return kd && (cells[j + 1] === 'front' || cells[j - 1] === 'front' ? accSeam : seamC);
    if (i === CREST) return kd === 'front' ? accSeam : seamC;
    return kd === 'front' ? accent : color;
  });
  // end caps: rear closed, front is the door
  const ringAt = (z) => th.map((t) => sec(z, t)), centre = (z) => { const { H } = env(z); return [0, gap + (H - gap) * 0.4, z]; };
  b.fan(centre(first.z), ringAt(first.z), color);
  const fr = ringAt(last.z), fc = centre(last.z);
  b.fan(fc, fr, open ? GLASS : accent);
  if (!open) b.tube([0, 2, 3, 4, 5, 7].map((i) => { const p = add(fc, mul(sub(fr[i], fc), 0.78)); return [p[0], p[1], last.z + 0.012]; }), 0.008, ZIP, 3);
  else b.tube([2, 3, 4, 5].map((i) => add(fr[i], [0, 0.02, 0.03])), 0.035, accent, 4); // rolled-up door
  // hoops
  const pth = [0, 0.45, 0.95, PI / 2, PI - 0.95, PI - 0.45, PI];
  for (const k of keys.filter((q) => q.hoop)) {
    const pts = pth.map((t) => { const p = sec(k.z, t), n = outN(k.z, t); return [p[0] + n[0] * 0.016, p[1] + n[1] * 0.016, k.z]; });
    b.tube([[pts[0][0], 0.02, k.z], ...pts, [pts[pts.length - 1][0], 0.02, k.z]], 0.012, POLE, 3);
  }
  // bathtub floor edge
  const loop = [...keys.map((k) => [k.W * 0.95, k.z]), ...keys.slice().reverse().map((k) => [-k.W * 0.95, k.z])];
  b.band(loop, 0, gap + 0.04, TUB);
  // guylines: both ends, and a pair per hoop
  b.guy(add(fr[3], [0, 0, 0.01]), [0, 1], S.endGuy, 0.1);
  const rr = ringAt(first.z); b.guy(rr[3], [0, -1], S.endGuy, 0.1);
  for (const k of keys.filter((q) => q.hoop)) for (const sx of [1, -1]) { const p = sec(k.z, sx > 0 ? 0.95 : PI - 0.95); b.guy(p, [sx, 0.35 * Math.sign(k.z - (first.z + last.z) / 2 + 0.01)], S.sideGuy, 0.1); }
  // reflective tab and logo patch
  const tz = S.tabZ, tn = outN(tz, 1.2);
  b.patch(sec(tz, 1.2), tn, 0.22, 0.05, REFL); b.patch(sec(S.logoZ, PI - 1.2), outN(S.logoZ, PI - 1.2), 0.3, 0.1, LOGO);
  return finish(b, S.name, S.size, o.scale);
}

export function backpackTent(o = {}) {
  const color = o.color ?? TENT_COLORS.orange, accent = o.accent ?? autoAccent(color);
  return tunnel({ color, accent, open: !!o.open, scale: o.scale }, {
    name: 'backpackTent', gap: 0.05, size: [1.3, 1.0, 2.2], endGuy: 0.9, sideGuy: 0.8, tabZ: -0.1, logoZ: 0.0,
    keys: [{ z: -1.1, W: 0.38, H: 0.3 }, { z: -0.55, W: 0.62, H: 0.8, hoop: 1 }, { z: 0.35, W: 0.65, H: 1.0, hoop: 1 }, { z: 1.1, W: 0.5, H: 0.62 }],
  });
}

export function tunnelTent(o = {}) {
  const color = o.color ?? TENT_COLORS.forest, accent = o.accent ?? autoAccent(color);
  return tunnel({ color, accent, open: !!o.open, scale: o.scale }, {
    name: 'tunnelTent', gap: 0.07, size: [2.6, 1.9, 4.5], endGuy: 1.3, sideGuy: 1.0, tabZ: 0.25, logoZ: -0.95, windows: [2, 4],
    keys: [{ z: -2.25, W: 0.8, H: 0.95 }, { z: -1.55, W: 1.2, H: 1.6, hoop: 1 }, { z: -0.35, W: 1.3, H: 1.9, hoop: 1 }, { z: 0.85, W: 1.25, H: 1.75, hoop: 1 }, { z: 2.25, W: 0.66, H: 0.95 }],
  });
}

// ==== 3b. Family tunnel tent: the big patrol dormitory tent =================================================
// 6.6 m wide, 8.1 m of body plus a 1.5 m porch (9.6 m), 3.2 m at the tallest hoop. Near-vertical side walls
// (a squared-off "tunnel with walls" section), five hoops that step down toward the back, panels that bow gently
// between them, a charcoal skirt, side windows with a rolled flap, roof vents with hoods, raised pole sleeves,
// reflective tabs, pegged guylines. The front is a wall with a D-shaped door (zip line round its curve) under a
// porch awning on two poles; `open` rolls the door bundle up, `hollow` (with `open`) leaves the doorway empty so
// the game can hang its own zip door and show the inner tent.
export function familyTunnelTent(o = {}) {
  const color = o.color ?? TENT_COLORS.forest, accent = o.accent ?? autoAccent(color), open = !!o.open, hollow = !!o.hollow;
  const seamC = dark(color, 0.36), accSeam = dark(accent, 0.3), SKIRT = 0x2f3236, gap = 0.08, d = 0.05, P = 0.6;
  const keys = [
    { z: -4.8, W: 2.6, H: 2.0 }, { z: -3.9, W: 3.0, H: 2.55, hoop: 1 }, { z: -2.3, W: 3.25, H: 2.85, hoop: 1 }, { z: -0.7, W: 3.3, H: 3.05, hoop: 1 },
    { z: 0.9, W: 3.3, H: 3.15, hoop: 1 }, { z: 2.5, W: 3.3, H: 3.2, hoop: 1 }, { z: 3.3, W: 3.1, H: 2.9 },
  ];
  const first = keys[0], last = keys[keys.length - 1], b = new Mesher(), fz = last.z;
  const env = (z) => {
    let i = 0; while (i < keys.length - 2 && z > keys[i + 1].z) i++;
    const a = keys[i], c = keys[i + 1], t = clamp((z - a.z) / (c.z - a.z), 0, 1), bu = 1 + 0.02 * Math.sin(PI * t); // panels bow out between hoops
    return { W: lerp(a.W, c.W, t) * bu, H: lerp(a.H, c.H, t) * bu };
  };
  const sec = (z, th) => { const { W, H } = env(z); return [W * sgnpow(Math.cos(th), P), gap + (H - gap) * Math.abs(Math.sin(th)) ** P, z]; };
  const outN = (z, th) => { const p0 = sec(z, th - 0.01), p1 = sec(z, th + 0.01); return nrm([p1[1] - p0[1], p0[0] - p1[0], 0]); };
  // rows: each bay is split so the middle of a side bay can hold a window
  const zs = [first.z], cells = []; let prev = first.z, kd = 'rear';
  const bay = (z1) => {
    const L = z1 - prev, fr = L > 1 ? [0, 0.1, 0.5, 0.9, 1] : [0, 0.5, 1];
    fr.slice(1).forEach((f, q) => { zs.push(prev + L * f); cells.push({ kd, win: kd === 'bay' && fr.length === 5 && (q === 1 || q === 2) }); });
    prev = z1;
  };
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (k.hoop) { bay(k.z - d); zs.push(k.z + d); cells.push({ kd: 'seam' }); prev = k.z + d; kd = i === keys.length - 2 ? 'front' : 'bay'; } else bay(k.z);
  }
  const th = [0, 0.04, 0.12, 0.5, 0.95, PI / 2 - 0.1, PI / 2 + 0.1, PI - 0.95, PI - 0.5, PI - 0.12, PI - 0.04, PI];
  b.grid(th, zs, (t, z) => sec(z, t), (i, j) => {
    const c = cells[j];
    if (i === 0 || i === 10) return SKIRT;
    if (c.win && (i === 2 || i === 8)) return GLASS;
    if (c.kd === 'seam') return cells[j + 1] && cells[j + 1].kd === 'front' || cells[j - 1] && cells[j - 1].kd === 'front' ? accSeam : seamC;
    if (i === 5) return c.kd === 'front' ? accSeam : seamC;
    return c.kd === 'front' ? accent : color;
  });
  // closed rear; the front is a wall round a D-shaped door
  const ringAt = (z) => th.map((t) => sec(z, t)), centre = (z) => [0, gap + (env(z).H - gap) * 0.4, z];
  b.fan(centre(first.z), ringAt(first.z), color);
  const fr = ringAt(fz), DW = 0.85, DH = 2.0;
  const Q = th.map((t) => [DW * sgnpow(Math.cos(t), 0.55), gap + (DH - gap) * Math.abs(Math.sin(t)) ** 0.6, fz]);
  for (let i = 0; i < th.length - 1; i++) b.quad(fr[i], fr[i + 1], Q[i + 1], Q[i], accent);
  b.tube(Q.map((p) => [p[0], p[1], fz + 0.012]), 0.011, ZIP, 3); // the zip line round the door's curve
  if (open) {
    b.tube(Q.slice(2, 10).map((p) => [p[0] * 0.98, p[1] + 0.03, fz + 0.05]), 0.045, accent, 4); // the rolled-up door bundle
    if (!hollow) b.fan([0, 0.9, fz - 0.02], Q.map((p) => [p[0], p[1], fz - 0.02]), INNER);
  } else b.fan([0, 0.9, fz + 0.005], Q.map((p) => [p[0], p[1], fz + 0.005]), accent);
  // raised pole sleeves, one per hoop, running over the roof and down to the ground
  const pth = [0, 0.12, 0.5, 0.95, PI / 2, PI - 0.95, PI - 0.5, PI - 0.12, PI], hoops = keys.filter((q) => q.hoop);
  for (const k of hoops) {
    const pts = pth.map((t) => { const p = sec(k.z, t), n = outN(k.z, t); return [p[0] + n[0] * 0.015, p[1] + n[1] * 0.015, k.z]; });
    b.tube([[pts[0][0], 0.02, k.z], ...pts, [pts[pts.length - 1][0], 0.02, k.z]], 0.022, seamC, 3);
  }
  // side windows get a rolled flap above them
  const flapRows = []; for (let j = 0; j < cells.length; j++) if (cells[j].win) flapRows.push(zs[j], zs[j + 1]);
  for (const t0 of [0.5, PI - 0.5]) for (let q = 0; q < flapRows.length; q += 4) {
    const za = flapRows[q], zb = flapRows[q + 3];
    b.tube([za, (za + zb) / 2, zb].map((z) => { const p = sec(z, t0), n = outN(z, t0); return [p[0] + n[0] * 0.02, p[1] + n[1] * 0.02, z]; }), 0.03, accent, 4);
  }
  // roof vents with small hoods
  const vent = (z, t) => {
    const p = sec(z, t), n = outN(z, t), u = nrm(cross(n, [0, 0, 1])), U = mul(u, 0.2), V = [0, 0, 0.15];
    b.patch(p, n, 0.36, 0.24, GLASS, 0.008);
    const base = (sx, sz, h) => add(add(add(p, mul(n, h)), mul(U, sx)), mul(V, sz));
    b.quad(base(-1, -1, 0.03), base(1, -1, 0.03), base(1, 1, 0.12), base(-1, 1, 0.12), accent);
    b.tri(base(-1, -1, 0.03), base(-1, 1, 0.12), base(-1, 1, 0.0), accSeam); b.tri(base(1, -1, 0.03), base(1, 1, 0.12), base(1, 1, 0.0), accSeam);
  };
  vent(-3.1, 1.2); vent(-1.5, PI - 1.2); vent(0.1, 1.2); vent(1.7, PI - 1.2);
  // the grey inner tent: a pale lining just inside the fly, so a rolled-up door shows a bright interior, not a dark hollow
  if (hollow) {
    const rows = [first.z + 0.03, ...keys.map((k) => k.z).filter((z) => z > first.z + 0.01 && z < fz - 0.01), fz - 0.03];
    const inn = (z, t) => { const p = sec(z, t); return [p[0] * 0.965, gap + (p[1] - gap) * 0.965, z]; };
    b.grid(th, rows, (t, z) => inn(z, t), () => 0xb4b2a8);
    b.fan([0, gap + (env(first.z).H - gap) * 0.38, first.z + 0.03], th.map((t) => inn(first.z + 0.03, t)), 0xb4b2a8);
  }
  // groundsheet edge
  b.band([...keys.map((k) => [k.W * 0.97, k.z]), ...keys.slice().reverse().map((k) => [-k.W * 0.97, k.z])], 0, gap + 0.05, TUB);
  // porch awning on two poles, with a valance
  const xb = 1.5, tb = Math.acos((xb / last.W) ** (1 / P)), yb = sec(fz, tb)[1] + 0.03, xf = 2.1, yf = 2.15, zf = fz + 1.5;
  const awn = (u, v) => [lerp(xb, xf, v) * u, lerp(yb, yf, v) - 0.06 * Math.sin(PI * v) * (1 - u * u), fz + 0.02 + (zf - fz - 0.02) * v];
  b.grid([-1, -0.5, 0.5, 1], [0, 0.5, 1], awn, (i) => (i === 1 ? accSeam : accent));
  const e0 = awn(-1, 1), e1 = awn(1, 1); b.quad(e0, e1, add(e1, [0, -0.12, 0]), add(e0, [0, -0.12, 0]), accSeam);
  for (const sx of [-1, 1]) {
    const top = [sx * xf, yf, zf], a0 = awn(sx, 0), a1 = awn(sx, 1);
    b.tri(a0, a1, [a0[0], a1[1], a0[2]], accSeam);
    b.tube([top, [sx * xf, 0.02, zf]], 0.022, POLE, 4);
    b.guy(add(top, [0, 0, -0.01]), [sx * 0.8, 1], 1.5, 0.1);
  }
  // pegged guylines: both ends, and a pair per hoop leaning to the nearer end
  b.guy(sec(first.z, PI / 2), [0, -1], 1.4, 0.1);
  const mid = (first.z + last.z) / 2;
  for (const k of hoops) for (const sx of [1, -1]) b.guy(sec(k.z, sx > 0 ? 0.5 : PI - 0.5), [sx, 0.3 * Math.sign(k.z - mid)], 1.4, 0.1);
  // reflective tabs at each hoop, and the brand patch
  for (const k of hoops) for (const sx of [1, -1]) { const t = sx > 0 ? 0.3 : PI - 0.3; b.patch(sec(k.z + 0.12, t), outN(k.z, t), 0.07, 0.24, REFL); }
  b.patch(sec(-1.5, PI - 0.75), outN(-1.5, PI - 0.75), 0.7, 0.2, LOGO);
  const g = finish(b, 'familyTunnelTent', [6.6, 3.2, 9.6], o.scale);
  g.userData.doorRing = Q;
  g.userData.footprint = [...keys.map((k) => [k.W * 0.97, k.z]), [xf + 0.1, zf], [-xf - 0.1, zf], ...keys.slice().reverse().map((k) => [-k.W * 0.97, k.z])];
  return g;
}

// ==== 2. Dome tent: two crossing poles, fly stops short of the ground ====================================
export function domeTent(o = {}) {
  const color = o.color ?? TENT_COLORS.mustard, accent = o.accent ?? autoAccent(color), open = !!o.open;
  const Rx = 1.05, Rz = 1.05, H = 1.3, gap = 0.14, sag = 0.03, seam = dark(color, 0.38), skirtSeam = dark(accent, 0.3);
  const b = new Mesher();
  const pt = (phi, t, sc = 1) => {
    const a = (t * PI) / 2, ne = lerp(3.2, 2.2, t), r = Math.cos(a) * (1 - sag * Math.cos(2 * phi) ** 2 * Math.sin(PI * t)) * sc;
    return [Rx * sgnpow(Math.cos(phi), 2 / ne) * r, gap + (H - gap) * Math.sin(a), Rz * sgnpow(Math.sin(phi), 2 / ne) * r];
  };
  const out = (p, dd) => add(p, mul(nrm([p[0] / (Rx * Rx), (p[1] - gap) / (H - gap) ** 2, p[2] / (Rz * Rz)]), dd));
  const dl = 0.03, phis = [];
  for (let k = 0; k < 4; k++) for (let m = 0; m < 4; m++) phis.push(PI / 4 + (k * PI) / 2 + dl + ((PI / 2 - 2 * dl) * m) / 3);
  phis.push(phis[0] + TAU);
  const ts = [0, 0.16, 0.42, 0.75, 1];
  b.grid(phis, ts, (ph, t) => pt(ph, t), (i, j) => (i % 4 === 3 ? (j <= 1 ? skirtSeam : seam) : j <= 1 ? accent : color)); // two-tone fly: accent lower panels
  // two crossing poles over the top
  for (const p0 of [PI / 4, (3 * PI) / 4]) {
    const seq = [...ts.map((t) => [p0, t]), ...ts.slice(0, -1).reverse().map((t) => [p0 + PI, t])];
    const pts = seq.map(([ph, t]) => out(pt(ph, t), 0.016));
    b.tube([[pts[0][0], 0.02, pts[0][2]], ...pts, [pts[pts.length - 1][0], 0.02, pts[pts.length - 1][2]]], 0.012, POLE, 3);
  }
  // bathtub edge and grey inner showing under the fly
  const ph16 = Array.from({ length: 17 }, (_, i) => (i * TAU) / 16);
  b.band(ph16.slice(0, 16).map((ph) => { const p = pt(ph, 0, 0.955); return [p[0], p[2]]; }), 0, 0.07, TUB);
  b.grid(ph16, [0, 1], (ph, v) => { const p = pt(ph, v ? 0.16 : 0, 0.955); return v ? p : [p[0], 0.07, p[2]]; }, () => INNER);
  // front porch hood, door zip, or the rolled-up door
  const z0 = 0.8 * Rz, y0 = gap, a0 = 0.5, b0 = 0.66, D = 0.72;
  hood(b, { z0, y0, a0, b0, D, color: accent, open });
  if (open) {
    const ring = [[0.3, 0.02], [0.3, 0.2]];
    for (let q = 1; q < 8; q++) { const t = (q / 8) * PI; ring.push([0.3 * Math.cos(t), 0.2 + 0.22 * Math.sin(t)]); }
    ring.push([-0.3, 0.2], [-0.3, 0.02]);
    b.fan(out(pt(PI / 2, 0.15), 0.014), ring.map(([dp, t]) => out(pt(PI / 2 + dp, t), 0.014)), GLASS);
    b.tube([[-0.15, 0.46, z0 + D * 0.75 - 0.03], [0, 0.47, z0 + D * 0.75 - 0.03], [0.15, 0.46, z0 + D * 0.75 - 0.03]], 0.035, accent, 5);
  }
  // guylines and tabs
  for (let k = 0; k < 4; k++) { const ph = PI / 4 + (k * PI) / 2, p = out(pt(ph, 0.16), 0.016); b.guy(p, [Math.cos(ph), Math.sin(ph)], 1.1, 0.1); }
  b.guy([0, y0 + 0.03, z0 + D], [0, 1], 0.9, 0.1);
  { const p = pt((3 * PI) / 2, 0.3), n = nrm([p[0] / (Rx * Rx), (p[1] - gap) / (H - gap) ** 2, p[2] / (Rz * Rz)]); b.patch(p, n, 0.18, 0.045, REFL); }
  { const p = pt(0, 0.42), n = nrm([p[0] / (Rx * Rx), (p[1] - gap) / (H - gap) ** 2, p[2] / (Rz * Rz)]); b.patch(p, n, 0.26, 0.1, LOGO); }
  return finish(b, 'domeTent', [2.1, 1.3, 2.1 + (open ? 0.6 : 0.6)], o.scale);
}

// ==== 4. Geodesic leader tent: three poles cross at the top, a belt in two arcs round the shoulder =========
export function geodesicTent(o = {}) {
  const color = o.color ?? TENT_COLORS.slate, accent = o.accent ?? autoAccent(color), open = !!o.open, hollow = !!o.hollow;
  const Rc = 1.55, zs = 1.1, H = 2.0, gap = 0.16, ts = [0, 0.36, 0.7, 1], dl = 0.03;
  const seam = dark(color, 0.38), skirtSeam = dark(accent, 0.3), lightC = pale(color, 0.1);
  const b = new Mesher();
  const V = (k, t) => { const a = (t * PI) / 2, r = Math.cos(a), ph = (k * PI) / 3; return [Rc * Math.cos(ph) * r, gap + (H - gap) * Math.sin(a), Rc * zs * Math.sin(ph) * r]; };
  const P = (k, u, t) => mix(V(k, t), V(k + 1, t), u);
  const S = (k, t) => mix(P(k - 1, 1 - dl, t), P(k, dl, t), 0.5);
  const out = (p, dd) => add(p, mul(nrm([p[0] / (Rc * Rc), (p[1] - gap) / (H - gap) ** 2, p[2] / (Rc * zs) ** 2]), dd));
  const cols = []; for (let k = 0; k < 6; k++) cols.push([k, dl], [k, 1 - dl]); cols.push([6, dl]);
  b.grid(cols, ts, ([k, u], t) => P(k, u, t), (i, j) => (i % 2 === 1 ? (j === 0 ? skirtSeam : seam) : j === 0 ? accent : (i >> 1) % 2 ? lightC : color));
  // poles: three crossing at the apex, a belt in front and back arcs
  for (let k = 0; k < 3; k++) {
    const seq = [0, 1, 2].map((j) => S(k, ts[j])), seq2 = [2, 1, 0].map((j) => S(k + 3, ts[j]));
    const pts = [...seq, [0, H, 0], ...seq2].map((p) => (p[1] >= H ? [0, H + 0.02, 0] : out(p, 0.016)));
    b.tube([[pts[0][0], 0.02, pts[0][2]], ...pts, [pts[pts.length - 1][0], 0.02, pts[pts.length - 1][2]]], 0.012, POLE, 3);
  }
  for (const k0 of [0, 3]) b.tube([0, 1, 2, 3].map((q) => out(S(k0 + q, ts[1]), 0.016)), 0.012, POLE, 3);
  // bathtub edge and grey inner
  const hex = (sc, y, t) => Array.from({ length: 6 }, (_, k) => { const p = V(k, t); return [p[0] * sc, p[2] * sc]; });
  b.band(hex(0.955, 0, 0), 0, 0.07, TUB);
  b.grid([0, 1, 2, 3, 4, 5, 6], [0, 1], (k, v) => { const p = V(k, v ? 0.2 : 0); return [p[0] * 0.955, v ? p[1] : 0.07, p[2] * 0.955]; }, () => INNER);
  // porch hood on the front (+z) panel
  const frontZ = (y) => lerp(Rc * zs * Math.sin(PI / 3), Rc * zs * Math.sin(PI / 3) * Math.cos((ts[1] * PI) / 2), (y - gap) / (V(0, ts[1])[1] - gap));
  hood(b, { z0: 1.0, y0: gap, a0: 0.62, b0: 0.85, D: 0.85, color: accent, open });
  if (open) {
    const ring = [[-0.5, 0.2], [-0.5, 0.9]]; for (let q = 1; q < 8; q++) { const t = PI - (q / 8) * PI; ring.push([0.5 * Math.cos(t), 0.9 + 0.3 * Math.sin(t)]); }
    ring.push([0.5, 0.9], [0.5, 0.2]);
    if (!hollow) b.fan([0, 0.7, frontZ(0.7) + 0.015], ring.map(([x, y]) => [x, y, frontZ(y) + 0.015]), GLASS);
    b.tube([[-0.36, 0.86, 1.0 + 0.85 * 0.75 - 0.02], [0, 0.88, 1.0 + 0.85 * 0.75 - 0.02], [0.36, 0.86, 1.0 + 0.85 * 0.75 - 0.02]], 0.05, accent, 5);
  }
  // guylines and tabs
  for (let k = 0; k < 6; k++) { const p = out(S(k, ts[1]), 0.016), ph = (k * PI) / 3; b.guy(p, [Math.cos(ph), Math.sin(ph) * zs], 1.3, 0.1); }
  b.patch([0, 1.5, frontZ(1.5)], [0, 0.3, 1], 0.5, 0.14, LOGO);
  { const p = mix(S(4, 0.2 * 0 + ts[1]), S(5, ts[1]), 0.5); b.patch(out(p, 0), nrm([p[0], 0.4, p[2]]), 0.22, 0.05, REFL); }
  const g = finish(b, 'geodesicTent', [3.1, 2.0, 2.95 + 0.0 + 0.0], o.scale);
  { const q = Math.sqrt(1 - 0.75 * 0.75), zr = 1.0 + 0.85 * 0.75; // the porch hood stops short here and leaves a doorway
    g.userData.doorRing = Array.from({ length: 13 }, (_, i) => { const be = (i / 12) * PI; return [0.62 * q * Math.cos(be), gap + 0.85 * q * Math.sin(be), zr]; }); }
  const hx = Array.from({ length: 6 }, (_, k) => [V(k, 0)[0] * 0.98, V(k, 0)[2] * 0.98]);
  g.userData.footprint = [hx[0], hx[1], [0.55, 1.85], [-0.55, 1.85], hx[2], hx[3], hx[4], hx[5]];
  return g;
}

// ==== 5. Group shelter: an open event canopy, peaked roof with a valance, optional back wall ============
export function groupShelter(o = {}) {
  const color = o.color ?? TENT_COLORS.brick, accent = o.accent ?? SAND, backWall = o.backWall ?? true;
  const E = 2.0, LEG = 1.82, YE = 2.0, YA = 2.52, seam = dark(color, 0.36), b = new Mesher();
  const C = [[-E, YE, E], [E, YE, E], [E, YE, -E], [-E, YE, -E]], A = [0, YA, 0];
  const roofPt = (c0, c1) => (u, v) => { const e = mix(c0, c1, u); const p = mix(e, A, v); p[1] -= 0.05 * Math.sin(PI * u) * Math.sin(PI * v); return p; };
  C.forEach((c0, f) => {
    const c1 = C[(f + 1) % 4], side = f % 2 === 1 ? pale(color, 0.12) : color;
    b.grid([0, 0.035, 0.485, 0.515, 0.965, 1], [0, 0.4, 0.75, 1], roofPt(c0, c1), (i) => (i % 2 === 0 ? seam : side));
    // valance: a flat band and pennant teeth
    const top = (u) => mix(c0, c1, u), n = 8;
    b.quad(top(0), top(1), add(top(1), [0, -0.08, 0]), add(top(0), [0, -0.08, 0]), accent);
    for (let t = 0; t < n; t++) b.tri(add(top(t / n), [0, -0.08, 0]), add(top((t + 1) / n), [0, -0.08, 0]), add(top((t + 0.5) / n), [0, -0.26, 0]), t % 2 ? pale(accent, 0.25) : accent);
  });
  // frame: four legs on foot plates, eave beams, hip rafters, a king pole
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * LEG, z = sz * LEG;
    b.tube([[x, 0.0, z], [x, YE - 0.03, z]], 0.04, POLE, 4);
    b.quad([x - 0.12, 0.02, z - 0.12], [x + 0.12, 0.02, z - 0.12], [x + 0.12, 0.02, z + 0.12], [x - 0.12, 0.02, z + 0.12], TUB);
    b.tube([[x, YE - 0.05, z], [0, YA - 0.08, 0]], 0.02, POLE, 3);
  }
  for (const [a, c] of [[[-LEG, 1.97, LEG], [LEG, 1.97, LEG]], [[LEG, 1.97, LEG], [LEG, 1.97, -LEG]], [[LEG, 1.97, -LEG], [-LEG, 1.97, -LEG]], [[-LEG, 1.97, -LEG], [-LEG, 1.97, LEG]]]) b.tube([a, c], 0.025, POLE, 3);
  b.tube([[0, YA - 0.08, 0], [0, YA + 0.08, 0]], 0.03, POLE, 4);
  if (backWall) {
    const w = dark(color, 0.12);
    b.grid([-LEG, -0.62, -0.58, 0.58, 0.62, LEG], [0.04, 0.24, 1.97], (x, y) => [x, y, -LEG + 0.0], (i, j) => (j === 0 ? TUB : i % 2 === 1 ? seam : w));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.guy([sx * E, YE, sz * E], [sx, sz], 1.2, 0.1);
  { const p = roofPt(C[0], C[1])(0.5, 0.3), n = nrm([0, 2, 0.52]); b.patch(p, n, 0.5, 0.14, LOGO); }
  b.patch([-LEG, 1.2, LEG + 0.04], [0, 0, 1], 0.05, 0.3, REFL, 0.004);
  return finish(b, 'groupShelter', [4, 2.6, 4], o.scale);
}

// ==== 6. Utility tent: tall cabin, near-vertical walls, roll-up door, optional first-aid cross ============
export function utilityTent(o = {}) {
  const color = o.color ?? TENT_COLORS.mustard, accent = o.accent ?? autoAccent(color), open = !!o.open, aid = !!o.cross, hollow = !!o.hollow;
  const hw = 1.2, ew = 1.13, y0 = 0.12, ye = 1.75, yr = 2.2, hd = 1.2, seam = dark(color, 0.36), roofC = dark(color, 0.08), b = new Mesher();
  const wx = (y) => lerp(hw, ew, (y - y0) / (ye - y0));
  // side walls: skirt, window cell
  for (const sx of [-1, 1]) b.grid([-hd, -0.4, 0.4, hd], [y0, 0.3, 0.85, 1.45, ye], (z, y) => [sx * wx(y), y, z], (i, j) => (j === 0 ? accent : i === 1 && j === 2 ? GLASS : color));
  // roof slopes
  const ex = ew + 0.1;
  for (const sx of [-1, 1]) b.grid([0, 0.94, 1], [-1.35, 0, 1.35], (s, z) => [sx * lerp(ex, 0, s), lerp(1.72, yr, s), z], (i) => (i === 1 ? seam : roofC));
  // front and back walls around the door
  const dx = 0.5, dy1 = 1.55;
  for (const sz of [-1, 1]) {
    const z = sz * hd, P = (x, y) => [x, y, z];
    b.quad(P(-hw, y0), P(-dx, y0), P(-dx, ye), P(-ew, ye), color);
    b.quad(P(dx, y0), P(hw, y0), P(ew, ye), P(dx, ye), color);
    b.tri(P(-ew, ye), P(-dx, ye), P(0, yr), color); b.tri(P(-dx, ye), P(dx, ye), P(0, yr), color); b.tri(P(dx, ye), P(ew, ye), P(0, yr), color);
    if (sz > 0) {
      b.quad(P(-dx, dy1), P(dx, dy1), P(dx, ye), P(-dx, ye), color);
      if (!hollow) b.quad(P(-dx, y0), P(dx, y0), P(dx, dy1), P(-dx, dy1), open ? GLASS : accent);
    } else {
      b.quad(P(-dx, y0), P(dx, y0), P(dx, ye), P(-dx, ye), color);
    }
  }
  const zf = hd + 0.012;
  if (!open) b.tube([[-0.44, 0.14, zf], [-0.44, 1.5, zf], [0.44, 1.5, zf], [0.44, 0.14, zf]], 0.008, ZIP, 3);
  else {
    b.tube([[-0.5, 1.5, hd + 0.05], [0.5, 1.5, hd + 0.05]], 0.07, accent, 6); // the rolled door
    for (const x of [-0.28, 0.28]) b.quad([x - 0.02, 1.46, hd + 0.13], [x + 0.02, 1.46, hd + 0.13], [x + 0.02, 1.2, hd + 0.1], [x - 0.02, 1.2, hd + 0.1], ZIP);
  }
  // awning over the door on two poles
  b.quad([-0.85, 1.7, hd], [0.85, 1.7, hd], [0.85, 1.45, hd + 0.65], [-0.85, 1.45, hd + 0.65], accent);
  for (const x of [-0.85, 0.85]) {
    b.tri([x, 1.7, hd], [x, 1.45, hd + 0.65], [x, 1.45, hd], seam);
    b.tube([[x, 1.45, hd + 0.65], [x, 0.02, hd + 0.72]], 0.012, POLE, 3);
  }
  // outside frame poles: corners, front and back rafters, ridge
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.tube([[sx * (hw + 0.02), 0.02, sz * (hd + 0.02)], [sx * (ew + 0.02), ye, sz * (hd + 0.02)]], 0.012, POLE, 3);
  for (const sz of [-1, 1]) { const z = sz * (hd + 0.02); b.tube([[-ew - 0.01, ye, z], [0, yr + 0.02, z], [ew + 0.01, ye, z]], 0.012, POLE, 3); }
  b.tube([[0, yr + 0.016, -1.4], [0, yr + 0.016, 1.4]], 0.012, POLE, 3);
  // bathtub edge
  b.band([[-hw * 0.97, -hd * 0.97], [hw * 0.97, -hd * 0.97], [hw * 0.97, hd * 0.97], [-hw * 0.97, hd * 0.97]], 0, y0 + 0.08, TUB);
  // guylines
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.guy([sx * (ew + 0.03), ye - 0.05, sz * hd], [sx, sz], 1.3, 0.1);
  for (const sz of [-1, 1]) b.guy([0, yr, sz * 1.38], [0, sz], 1.2, 0.1);
  // patches
  b.patch([wx(1.3) + 0.0, 1.3, -0.95], [1, 0.04, 0], 0.3, 0.1, LOGO);
  b.patch([0.85, 0.5, zf + 0.0], [0, 0, 1], 0.07, 0.22, REFL, 0.0);
  if (aid) {
    const cp = (p, n) => { b.patch(p, n, 0.5, 0.5, WHITE, 0.012); b.patch(p, n, 0.34, 0.1, REDX, 0.024); b.patch(p, n, 0.1, 0.34, REDX, 0.024); };
    cp([-0.84, 1.0, hd], [0, 0, 1]); cp([0.84, 1.0, hd], [0, 0, 1]);
    for (const sx of [-1, 1]) cp([sx * 0.615, 1.96, 0], nrm([sx * 0.48, 1.23, 0]));
  }
  const g = finish(b, 'utilityTent', [2.4, 2.2, 2.4], o.scale);
  g.userData.doorRing = [[dx, y0, hd + 0.014], [dx, dy1, hd + 0.014], [-dx, dy1, hd + 0.014], [-dx, y0, hd + 0.014]];
  return g;
}

// ==== Preview helpers ====================================================================================
export const familyTunnelTentOpen = () => familyTunnelTent({ open: true });
export const domeTentOpen = () => domeTent({ open: true });
export const tunnelTentOpen = () => tunnelTent({ open: true });
export const utilityTentAid = () => utilityTent({ cross: true, open: true });

function lineup(variants) {
  const g = new THREE.Group();
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(24, 48), new THREE.MeshStandardMaterial({ color: 0x7f9a4e, roughness: 1 }));
  lawn.rotation.x = -PI / 2; lawn.position.y = 0.01; lawn.receiveShadow = true; g.add(lawn);
  const list = [[backpackTent, 1.3], [domeTent, 2.1], [tunnelTent, 2.6], [familyTunnelTent, 6.6], [geodesicTent, 3.1], [groupShelter, 4], [utilityTent, 2.4]];
  const gapX = 1.5, total = list.reduce((s, [, w]) => s + w, 0) + gapX * (list.length - 1);
  let x = -total / 2;
  list.forEach(([fn, w], i) => { const t = fn(variants[i] || {}); t.position.x = x + w / 2; x += w + gapX; g.add(t); });
  return g;
}
export const tentLineup = () => lineup([]);
export const tentLineupOpen = () => lineup([{ open: true }, { open: true }, { open: true }, { open: true }, { open: true }, {}, { open: true, cross: true }]);
