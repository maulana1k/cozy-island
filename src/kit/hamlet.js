// INTERNAL. A small fishing-and-farming hamlet, built from code: stilt houses, a meeting hall,
// market stalls, a well, a big shade tree, a washing line, a jetty, a rowing boat, a bamboo
// fence and a path lamp. Every builder returns { group, colliders, lamps } (the jetty adds
// `platforms`, the boat adds `update`). Origin is on the ground at the model's centre, the door
// faces +z, units are metres (scout 1.05 m, adult 1.6 m).
//
// Cost: each model is welded into ONE mesh with ONE material. That material is a tiny colour
// atlas (a canvas with a grid of flat colours plus a few painted cells for planks, thatch,
// tiles and bamboo). Each piece's UVs are pointed at its cell, so any colour or surface costs
// nothing extra in draw calls. Without a document (tests) it falls back to shared(color).
import * as THREE from 'three';
import { flat, box, cyl, ball, stick, roofGeometry, shared, mergeStatic } from '../world/build.js';

// ---- The colour atlas ------------------------------------------------------------------------
const AW = 1024, AH = 512, CELL = 16, TEX = 128; // flat colour cells (16 px) on top, painted cells (128 px) below
let atlasMat = null, atlasCtx = null, atlasTex = null;
const colourCells = new Map(), texCells = new Map();
function atlas() {
  if (typeof document === 'undefined') return null;
  if (!atlasMat) {
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH; atlasCtx = cv.getContext('2d');
    atlasTex = new THREE.CanvasTexture(cv); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4;
    atlasMat = flat(0xffffff, { map: atlasTex });
  }
  return atlasMat;
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const region = (px, py, w, h, inset) => ({ u0: (px + inset) / AW, du: (w - 2 * inset) / AW, v0: 1 - (py + h - inset) / AH, dv: (h - 2 * inset) / AH });
function colourCell(color) {
  if (!colourCells.has(color)) {
    const i = colourCells.size, px = (i % 64) * CELL, py = Math.floor(i / 64) * CELL;
    atlasCtx.fillStyle = hex(color); atlasCtx.fillRect(px, py, CELL, CELL); atlasTex.needsUpdate = true;
    const r = region(px, py, CELL, CELL, CELL / 2); // collapsed to the centre of the cell
    colourCells.set(color, r);
  }
  return colourCells.get(color);
}
// Painted cells: base colour with a simple hand-drawn pattern on top.
function paintTexture(c, kind, color, x, y, S, boards) {
  let seed = 11 + kind.length * 97 + (color % 997); const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  c.save(); c.beginPath(); c.rect(x, y, S, S); c.clip();
  c.fillStyle = hex(color); c.fillRect(x, y, S, S);
  const line = (x0, y0, x1, y1, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x + x0, y + y0); c.lineTo(x + x1, y + y1); c.stroke(); };
  if (kind === 'wood') { // a row of upright boards, each a slightly different tone, with grain streaks and a knot or two
    const bw = S / boards;
    for (let b = 0; b < boards; b++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '40,22,8' : '255,235,200'},${0.03 + rnd() * 0.08})`; c.fillRect(x + b * bw, y, bw, S); }
    for (let i = 0; i < boards * 4; i++) { const px = rnd() * S; line(px, 0, px + (rnd() - 0.5) * 3, S, rnd() < 0.5 ? 'rgba(60,35,15,0.16)' : 'rgba(255,240,210,0.16)', 0.8 + rnd()); }
    for (let b = 1; b < boards; b++) { line(b * bw, 0, b * bw, S, 'rgba(45,25,10,0.5)', 2.5); line(b * bw + 2, 0, b * bw + 2, S, 'rgba(255,240,210,0.18)', 1.5); }
    line(0.5, 0, 0.5, S, 'rgba(45,25,10,0.4)', 1.5); line(S - 0.5, 0, S - 0.5, S, 'rgba(45,25,10,0.4)', 1.5);
  } else if (kind === 'thatch') { // straw courses running along the roof, ragged vertical streaks
    for (let i = 0; i < 90; i++) { const px = rnd() * S, py = rnd() * S; line(px, py, px + (rnd() - 0.5) * 2, py + 5 + rnd() * 9, rnd() < 0.5 ? 'rgba(70,45,10,0.22)' : 'rgba(255,235,160,0.22)', 1 + rnd()); }
    for (let r = 0; r < 9; r++) { const py = (r + 1) * (S / 9); line(0, py, S, py, 'rgba(60,38,8,0.38)', 2.2); line(0, py + 2.5, S, py + 2.5, 'rgba(255,235,160,0.2)', 1.5); }
  } else if (kind === 'tile') { // rows of clay tiles, joints staggered
    const rows = 8, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      const py = r * rh; line(0, py + rh - 1, S, py + rh - 1, 'rgba(40,15,5,0.4)', 2); line(0, py + 2, S, py + 2, 'rgba(255,220,190,0.2)', 1.5);
      for (let k = 0; k < 7; k++) { const px = k * (S / 6) + (r % 2 ? S / 12 : 0); line(px, py, px, py + rh, 'rgba(40,15,5,0.32)', 1.3); }
      c.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},0.05)`; c.fillRect(x, y + py, S, rh);
    }
  } else if (kind === 'bamboo') { // lengthwise streaks and two raised joints
    for (let i = 0; i < 24; i++) { const px = rnd() * S; line(px, 0, px, S, rnd() < 0.5 ? 'rgba(80,60,10,0.2)' : 'rgba(255,250,200,0.25)', 1 + rnd() * 2); }
    for (const py of [S * 0.2, S * 0.7]) { c.fillStyle = 'rgba(70,50,10,0.55)'; c.fillRect(x, y + py, S, 4); c.fillStyle = 'rgba(255,250,200,0.4)'; c.fillRect(x, y + py + 4, S, 3); }
  }
  c.restore();
}
function texCell(kind, color, boards = 0) {
  const key = kind + ':' + color + ':' + boards;
  if (!texCells.has(key)) {
    const i = texCells.size;
    if (i >= 24) return [...texCells.values()].pop(); // atlas full: reuse the last painted cell rather than fail
    const px = (i % 8) * TEX, py = 128 + Math.floor(i / 8) * TEX;
    paintTexture(atlasCtx, kind, color, px, py, TEX, boards); atlasTex.needsUpdate = true;
    texCells.set(key, region(px, py, TEX, TEX, 1));
  }
  return texCells.get(key);
}
// Point a mesh's UVs at a colour (or a painted surface) in the atlas and give it the atlas material.
function paint(mesh, color, kind, boards) {
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (!atlas()) { mesh.material = shared(color); return mesh; }
  const r = kind ? texCell(kind, color, boards) : colourCell(color), uv = mesh.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + r.du * uv.getX(i), r.v0 + r.dv * uv.getY(i));
  mesh.material = atlasMat;
  return mesh;
}
// Small builders that use the helpers from build.js and then repaint into the atlas.
const bx = (w, h, d, c, x = 0, y = 0, z = 0, ry = 0) => paint(box(w, h, d, atlas() || c, x, y, z, ry), c);
const cy = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 7, kind) => paint(cyl(rt, rb, h, atlas() || c, x, y, z, seg), c, kind);
const bl = (r, c, x = 0, y = 0, z = 0, detail = 0) => paint(ball(r, atlas() || c, x, y, z, detail), c);
const sk = (a, b, r, c, seg = 5) => paint(stick(a, b, r, atlas() || c, seg), c);
// A post with no end caps (the ends are always hidden under a floor or a beam), half the triangles of a closed one.
const pole = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 6) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), atlas() || c); m.position.set(x, y, z); m.rotation.set(((x * 7.1 + z * 3.3) % 1 - 0.5) * 0.05, 0, ((z * 5.7 + x * 2.9) % 1 - 0.5) * 0.05); return paint(m, c); };
const cn = (r, h, c, x, y, z, seg = 6) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), atlas() || c); m.position.set(x, y, z); return paint(m, c); };
const at = (m, rx = 0, ry = 0, rz = 0) => { m.rotation.set(rx, ry, rz); return m; };
const sc = (m, x, y, z) => { m.scale.set(x, y, z); return m; };
const rb = (w, h, d, c, x = 0, y = 0, z = 0) => { // a plain straight box, no hand-made wobble
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), atlas() || c); m.position.set(x, y, z); return paint(m, c);
};
// A wall, floor or counter of boards: one box whose faces show a painted row of boards. The number of boards
// follows the length of the piece (about 0.4 m each, in steps of two so the atlas needs few cells).
function planks(w, h, d, c, x = 0, y = 0, z = 0) {
  const len = Math.max(w, d), n = Math.min(18, Math.max(6, 2 * Math.round(len / 0.84)));
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), atlas() || c); m.position.set(x, y, z);
  return paint(m, c, 'wood', n);
}

// ---- Palette -----------------------------------------------------------------------------
const DK = 0x8c6444, MID = 0xb98a5e, LT = 0xc79a62, PALE = 0xe3c79a, GREYWOOD = 0x9a7350, DARK = 0x3b2a22;
const CREAM = 0xfaf3e2, RED = 0xe8503a, YEL = 0xf2b63b, BLUE = 0x4f7fc9, TEAL = 0x5fa8a0, CLAY = 0xc9693f, ROPE = 0xe9dcc0;
const STRAW = 0xd8bb72, LEAF = 0x6fae56, LEAF_D = 0x4f8a48, LEAF_L = 0x8cbf62, GLOW = 0xffd27a, BAMBOO = 0xd8bb72;
const result = (root, extra = {}) => ({ group: root, colliders: [], lamps: [], ...extra });

// ---- Shared little props -----------------------------------------------------------------
// A big clay water jar with a narrow neck and a dark rim.
function jar(g, x, y, z, c = CLAY) {
  g.add(sc(bl(0.29, c, x, y + 0.33, z, 0), 1, 1.15, 1), cy(0.11, 0.15, 0.12, c, x, y + 0.66, z, 7), cy(0.16, 0.16, 0.04, DK, x, y + 0.73, z, 7));
}
// A plain bench: a plank seat on two chunky legs.
function bench(g, x, y, z, len = 1.5, ry = 0, c = MID) {
  const b = new THREE.Group(); b.position.set(x, y, z); b.rotation.y = ry;
  b.add(rb(len, 0.07, 0.34, c, 0, 0.44, 0), rb(0.09, 0.42, 0.3, DK, -len / 2 + 0.14, 0.21, 0), rb(0.09, 0.42, 0.3, DK, len / 2 - 0.14, 0.21, 0));
  g.add(b);
}
// A terracotta pot with a leafy plant and a few flowers.
function plant(g, x, y, z, flower = RED, s = 1) {
  g.add(cy(0.15 * s, 0.1 * s, 0.22 * s, CLAY, x, y + 0.11 * s, z, 6), sc(bl(0.2 * s, LEAF, x, y + 0.36 * s, z, 0), 1, 0.85, 1), bl(0.05 * s, flower, x - 0.05 * s, y + 0.55 * s, z + 0.04 * s, 0));
}
// A woven basket hung on two cords from a beam, spilling green and flowers.
function hangBasket(g, x, beamY, y, z, flower = YEL) {
  g.add(cy(0.2, 0.12, 0.15, STRAW, x, y, z, 6), sc(bl(0.17, LEAF, x, y + 0.12, z, 0), 1, 0.7, 1), bl(0.05, flower, x + 0.06, y + 0.25, z, 0),
    sk([x - 0.17, y + 0.08, z], [x, beamY, z], 0.012, ROPE, 3), sk([x + 0.17, y + 0.08, z], [x, beamY, z], 0.012, ROPE, 3));
}
// A little round wire bird cage hung from a cord, with a yellow bird inside.
function birdCage(g, x, beamY, y, z) {
  g.add(cy(0.17, 0.17, 0.03, DK, x, y - 0.17, z, 7), cy(0.12, 0.17, 0.03, DK, x, y + 0.17, z, 7), sc(bl(0.12, DK, x, y + 0.22, z, 0), 1, 0.7, 1));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4; g.add(sk([x + Math.cos(a) * 0.15, y - 0.16, z + Math.sin(a) * 0.15], [x + Math.cos(a) * 0.15, y + 0.17, z + Math.sin(a) * 0.15], 0.009, 0xd9c48a, 3)); }
  g.add(bl(0.055, YEL, x, y - 0.1, z, 0), sk([x, y + 0.27, z], [x, beamY, z], 0.01, ROPE, 3));
}
// A paper lantern hung from a cord; returns nothing, the caller records its lamp spot.
function lantern(g, x, beamY, y, z, c = RED) {
  g.add(cy(0.11, 0.11, 0.24, c, x, y, z, 6), cn(0.14, 0.1, DK, x, y + 0.17, z, 6), sk([x, y + 0.2, z], [x, beamY, z], 0.01, ROPE, 3));
}
// A woven basket full of round things (fruit, tomatoes...).
function heap(g, x, y, z, r, n, c, br = 0.08, base = STRAW) {
  g.add(cy(r, r * 0.8, 0.17, base, x, y + 0.085, z, 7));
  for (let k = 0; k < n - 1; k++) { const a = (k / (n - 1)) * Math.PI * 2 + 0.5; g.add(bl(br, c, x + Math.cos(a) * r * 0.55, y + 0.2 + (k % 2) * 0.03, z + Math.sin(a) * r * 0.55, 0)); }
  g.add(bl(br, c, x, y + 0.26, z, 0));
}
// A small fish: a flat oval body and a tail. Lies along local x.
function fish(g, x, y, z, ry, c = 0xaebfd0, len = 0.3, rz = 0) {
  const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.set(0, ry, rz);
  f.add(sc(bl(len / 2, c, 0, 0, 0, 0), 1, 0.38, 0.3), at(rb(len * 0.22, len * 0.34, 0.02, c, len * 0.58, 0, 0), 0, 0, 0.15));
  g.add(f);
}
// A rail along one edge of a deck from (x0,z0) to (x1,z1) with posts that hold the roof, two bars,
// and gaps (in metres from the start) left open for steps.
function rail(g, x0, z0, x1, z1, FT, WH, gaps = []) {
  const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len, ry = Math.atan2(-dz, dx);
  const P = (t) => [x0 + dx * t, z0 + dz * t];
  let spans = [[0, len]];
  for (const [a, b] of gaps) spans = spans.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, Math.min(e, a)], [Math.max(s, b), e]])).filter(([s, e]) => e - s > 0.15);
  const posts = new Set();
  for (const [s, e] of spans) {
    const [mx, mz] = P((s + e) / 2);
    g.add(rb(e - s, 0.06, 0.07, DK, mx, FT + 0.92, mz).rotateY(ry), rb(e - s, 0.05, 0.06, DK, mx, FT + 0.48, mz).rotateY(ry));
    posts.add(s.toFixed(2)); posts.add(e.toFixed(2));
    if (e - s > 3.6) posts.add(((s + e) / 2).toFixed(2));
  }
  for (const t of posts) { const [px, pz] = P(Number(t)); g.add(pole(0.07, 0.08, WH, DK, px, FT + WH / 2, pz, 6)); }
  const [cx, cz] = P(len / 2);
  if (len > 1.5) g.add(rb(len + 0.1, 0.1, 0.13, DK, cx, FT + WH - 0.06, cz).rotateY(ry)); // header beam under the eave
}
// Plank steps down from a deck edge at (x, z), going out along +z.
function steps(g, x, z, FT, w = 1.1) {
  const t1 = FT * 0.66, t2 = FT * 0.33;
  g.add(rb(w, 0.06, 0.32, MID, x, t1, z + 0.2), rb(w, 0.06, 0.32, MID, x, t2, z + 0.52));
  for (const s of [-1, 1]) g.add(sk([x + s * (w / 2 - 0.03), 0, z + 0.85], [x + s * (w / 2 - 0.03), FT - 0.1, z + 0.02], 0.04, DK, 4));
}
// A window in a wall at local (x, y, z) turned by ry: frame, dark opening, sill and two shutters.
function windowAt(g, x, y, z, ry, c, open = 1) {
  const w = new THREE.Group(); w.position.set(x, y, z); w.rotation.y = ry; g.add(w);
  w.add(rb(0.7, 0.66, 0.06, DARK, 0, 0, 0.03), rb(0.98, 0.07, 0.15, DK, 0, -0.38, 0.07));
  for (const s of [-1, 1]) {
    if (open === 0) { w.add(rb(0.31, 0.62, 0.04, c, s * 0.155, 0, 0.09)); continue; }
    const phi = open === 1 ? (s < 0 ? 1.2 : 0.8) : 0.5, hx = s * 0.45, cxm = hx + 0.155 * s * Math.cos(phi), czm = 0.06 + 0.155 * Math.sin(phi);
    w.add(at(rb(0.31, 0.62, 0.04, c, cxm, 0, czm), 0, -s * phi, 0));
  }
}
// A roof over `across` x `along` metres with its ridge along the group's z (the group is turned for ridge-along-x).
// The surface is painted straw or tile; the ridge is capped, the edges get fascia boards and bargeboards.
function roofOn(parent, x, y, z, alongX, across, along, rh, color, kind, cap, opts = {}) {
  const rg = new THREE.Group(); rg.position.set(x, y, z); rg.rotation.y = alongX ? Math.PI / 2 : 0; parent.add(rg);
  const geo = roofGeometry(across, rh, along), p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nz = Math.abs(n.getZ(i)), ny = n.getY(i), v = Math.min(1, Math.max(0, p.getY(i) / rh));
    let u = p.getZ(i) / along + 0.5; if (nz > 0.9) u = p.getX(i) / across + 0.5; if (ny < -0.9) { u = 0.5; uv[i * 2 + 1] = 0.5; uv[i * 2] = 0.5; continue; }
    uv[i * 2] = Math.min(1, Math.max(0, u)); uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const mesh = new THREE.Mesh(geo, atlas() || shared(color)); rg.add(paint(mesh, color, kind));
  const ridgeY = (t) => rh - rh * 0.07 * (1 - (2 * t / along) ** 2), segs = 4; // the ridge sags between the gables
  for (let i = 0; i < segs; i++) {
    const t0 = -along / 2 + (along * i) / segs, t1 = t0 + along / segs, y0 = ridgeY(t0), y1 = ridgeY(t1);
    rg.add(at(rb(0.3, 0.13, along / segs + 0.04, cap, 0, (y0 + y1) / 2 + 0.03, (t0 + t1) / 2), -Math.atan2(y1 - y0, t1 - t0), 0, 0));
  }
  const ang = Math.atan2(rh, across / 2), L = Math.hypot(across / 2, rh);
  for (const s of [-1, 1]) {
    rg.add(rb(0.1, 0.17, along + 0.05, cap === DK ? GREYWOOD : DK, s * (across / 2 - 0.03), 0.02, 0)); // fascia along each eave
    for (const e of [-1, 1]) rg.add(at(rb(L + 0.08, 0.1, 0.09, DK, s * across / 4, rh / 2 + 0.01, e * (along / 2 + 0.03)), 0, 0, -s * ang)); // bargeboards on the gable
  }
  if (opts.finial) for (const e of [-1, 1]) for (const s of [-1, 1]) rg.add(at(rb(0.07, 0.7, 0.07, DK, s * 0.15, rh + 0.1, e * (along / 2 + 0.05)), 0, 0, s * 0.42)); // crossed gable horns
  return rg;
}

// ---- Stilt houses --------------------------------------------------------------------------
// Each variant lists the body, the decks (veranda, porch, side deck) in body-centred coordinates, and its look.
const HOUSES = [
  { // 0: golden thatch, long veranda across the front, water jar, bench, hanging baskets
    bw: 5.0, bd: 3.0, wallH: 2.0, wall: 0xdcb27a, door: RED, shutter: TEAL, roof: { c: 0xd9b15a, kind: 'thatch', cap: 0xa8793c, alongX: true, finial: true },
    decks: [{ x0: -2.5, x1: 2.5, z0: 1.5, z1: 2.8, rails: ['f', 'l', 'r'] }], doorX: 0.5, windows: [-1.5, 1.9], steps: [[0.5, 2.8]], side: [[1, 0.0, 1], [-1, 0.0, 1]], back: [0],
  },
  { // 1: clay-tile roof with the gable to the front, L-shaped veranda wrapping the right side
    bw: 4.4, bd: 3.2, wallH: 2.0, wall: 0xf1dcae, door: BLUE, shutter: YEL, roof: { c: 0xc8643f, kind: 'tile', cap: 0x8f3f27, alongX: false },
    decks: [{ x0: -2.2, x1: 2.2, z0: 1.6, z1: 2.8, rails: ['f', 'l'] }, { x0: 2.2, x1: 3.4, z0: -1.6, z1: 2.8, rails: ['f', 'r', 'b'] }], doorX: -0.8, windows: [1.0], steps: [[-0.8, 2.8]], side: [[-1, 0.0, 1]], back: [0.3],
  },
  { // 2: weathered thatch, porch at the door plus a wide side deck with a fish-drying rack
    bw: 4.6, bd: 3.4, wallH: 2.0, wall: 0xbf935f, door: 0xf3e6c4, shutter: YEL, roof: { c: 0xa38a5c, kind: 'thatch', cap: 0x6d5a38, alongX: true, finial: true },
    decks: [{ x0: -3.9, x1: -2.3, z0: -1.7, z1: 1.7, rails: ['f', 'l', 'b'] }, { x0: 0.0, x1: 1.4, z0: 1.7, z1: 2.7, rails: ['f', 'l', 'r'] }], doorX: 0.7, windows: [-1.0, 1.9], steps: [[0.7, 2.7], [-3.1, 1.7]], side: [[1, 0.0, 1]], back: [-0.8, 0.8],
  },
  { // 3: bigger house, blue-grey tiles with a round gable vent, wide veranda, crates and baskets
    bw: 5.8, bd: 3.4, wallH: 2.1, wall: 0xd1a46c, door: YEL, shutter: RED, roof: { c: 0x5a8fa8, kind: 'tile', cap: 0x3d5f73, alongX: false, vent: true },
    decks: [{ x0: -2.9, x1: 2.9, z0: 1.7, z1: 3.0, rails: ['f', 'l', 'r'] }], doorX: 0.0, windows: [-1.9, 1.9], steps: [[0.0, 3.0]], side: [[1, 0.0, 1], [-1, 0.0, 1]], back: [-1.5, 1.5],
  },
];

export function buildStiltHouse(variant = 0) {
  const V = HOUSES[((variant % HOUSES.length) + HOUSES.length) % HOUSES.length], root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  const FT = 0.8, WH = V.wallH, TOP = FT + WH, hw = V.bw / 2, hd = V.bd / 2, lamps = [];
  const rects = [{ x0: -hw, x1: hw, z0: -hd, z1: hd }, ...V.decks];
  const minX = Math.min(...rects.map((r) => r.x0)), maxX = Math.max(...rects.map((r) => r.x1)), minZ = Math.min(...rects.map((r) => r.z0)), maxZ = Math.max(...rects.map((r) => r.z1));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, totW = maxX - minX, totD = maxZ - minZ;
  g.position.set(-cx, 0, -cz);

  // Floors (planks) with two bearers under each, and stilts round the edge of each floor.
  const seen = new Set();
  for (const r of rects) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    g.add(planks(w, 0.14, d, MID, mx, FT - 0.07, mz));
        if (r === rects[0]) for (const s of [-1, 1]) g.add(rb(w - 0.1, 0.12, 0.14, DK, mx, FT - 0.2, mz + s * (d / 2 - 0.15))); // bearers under the main floor
    const xs = [r.x0 + 0.14, r.x1 - 0.14], zs = [r.z0 + 0.14, r.z1 - 0.14];
    if (w > 4.2) xs.splice(1, 0, mx); if (d > 4.2) zs.splice(1, 0, mz);
    for (const x of xs) for (const z of zs) {
      const edge = x === xs[0] || x === xs[xs.length - 1] || z === zs[0] || z === zs[zs.length - 1], key = x.toFixed(1) + ',' + z.toFixed(1);
      if (!edge || seen.has(key)) continue; seen.add(key);
      g.add(pole(0.09, 0.115, FT + 0.05, DK, x, FT / 2 - 0.1, z, 6)); // a short round stilt, a little wider at the foot
    }
  }
  // Plank walls on four sides, corner posts and a top plate.
  const T = 0.12;
  g.add(planks(V.bw, WH, T, V.wall, 0, FT + WH / 2, hd - T / 2), planks(V.bw, WH, T, V.wall, 0, FT + WH / 2, -hd + T / 2),
    planks(T, WH, V.bd - 2 * T, V.wall, hw - T / 2, FT + WH / 2, 0), planks(T, WH, V.bd - 2 * T, V.wall, -hw + T / 2, FT + WH / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rb(0.16, WH, 0.16, DK, sx * (hw - 0.02), FT + WH / 2, sz * (hd - 0.02)));
  g.add(rb(V.bw + 0.12, 0.1, V.bd + 0.12, DK, 0, TOP - 0.05, 0), rb(V.bw + 0.12, 0.12, 0.18, DK, 0, FT + 0.07, hd), rb(V.bw + 0.12, 0.12, 0.18, DK, 0, FT + 0.07, -hd));
  // Door in the front wall, with frame and a little hood.
  g.add(rb(1.12, 1.82, 0.07, DK, V.doorX, FT + 0.91, hd + 0.015), rb(0.9, 1.68, 0.07, V.door, V.doorX, FT + 0.84, hd + 0.05), rb(1.35, 0.09, 0.34, DK, V.doorX, FT + 1.95, hd + 0.15));
  // Windows: front, sides and back; lamps sit at each for night glow.
  const wy = FT + 1.25;
  for (const x of V.windows) { windowAt(g, x, wy, hd, 0, V.shutter, 1); lamps.push({ x, y: wy, z: hd + 0.2 }); }
  for (const [s, z, o] of V.side) { windowAt(g, s * hw, wy, z, s * Math.PI / 2, V.shutter, o); lamps.push({ x: s * (hw + 0.2), y: wy, z }); }
  windowAt(g, V.back[0], wy, -hd, Math.PI, V.shutter, variant % 2 ? 0 : 2); // one window at the back so the rear is not a blank wall
  // Decks: rails with roof posts, and steps.
  const front = V.decks.find((d) => d.rails.includes('f')) || rects[0];
  for (const r of V.decks) {
    const gapsF = V.steps.filter(([sx, sz]) => Math.abs(sz - r.z1) < 0.01 && sx >= r.x0 && sx <= r.x1).map(([sx]) => [sx - r.x0 - 0.6, sx - r.x0 + 0.6]);
    if (r.rails.includes('f')) rail(g, r.x0, r.z1, r.x1, r.z1, FT, WH, gapsF);
    if (r.rails.includes('b')) rail(g, r.x0, r.z0, r.x1, r.z0, FT, WH);
    if (r.rails.includes('l')) rail(g, r.x0, r.z0, r.x0, r.z1, FT, WH);
    if (r.rails.includes('r')) rail(g, r.x1, r.z0, r.x1, r.z1, FT, WH);
  }
  for (const [sx, sz] of V.steps) steps(g, sx, sz, FT);
  // Roof: deep eaves all round, so the veranda sits in shade.
  const alongX = V.roof.alongX, across = (alongX ? totD : totW) + 1.7, along = (alongX ? totW : totD) + 1.2, rh = (across / 2) * 0.52;
  const rg = roofOn(g, cx, TOP, cz, alongX, across, along, rh, V.roof.c, V.roof.kind, V.roof.cap, { finial: V.roof.finial });
  if (V.roof.vent) rg.add(at(cy(0.28, 0.28, 0.05, DARK, 0, rh * 0.33, along / 2 + 0.02, 10), Math.PI / 2, 0, 0), at(cy(0.34, 0.34, 0.04, DK, 0, rh * 0.33, along / 2 + 0.0, 10), Math.PI / 2, 0, 0));
  // Details that make each house its own.
  const beamY = TOP - 0.2, fz = front.z1 - 0.18;
  if (variant % 4 === 0) {
    jar(g, -2.1, FT, 2.25); bench(g, -1.4, FT, 1.75, 1.5); plant(g, 2.1, FT, 2.4, YEL); hangBasket(g, -0.9, beamY, beamY - 0.55, fz); hangBasket(g, 1.7, beamY, beamY - 0.5, fz, RED);
    for (let k = 0; k < 3; k++) g.add(at(pole(0.08, 0.08, 0.6, k % 2 ? 0x9b6f4c : 0xb08663, -2.2 + k * 0.17 - (k === 2 ? 0.09 : 0) * 0, 0.09 + (k === 2 ? 0.14 : 0), 0.6, 5), 0, 0, Math.PI / 2)); // firewood stacked under the house
    lantern(g, 1.15, beamY, beamY - 0.4, 2.0); lamps.push({ x: 1.15, y: beamY - 0.4, z: 2.0 });
  } else if (variant % 4 === 1) {
    birdCage(g, -1.6, beamY, beamY - 0.55, 2.4); plant(g, 0.5, FT, 2.55, RED); plant(g, 1.2, FT, 2.55, YEL, 0.9); plant(g, 1.8, FT, 2.55, 0xe48ab4, 1.1); jar(g, 3.0, FT, -1.0, 0xb4552f);
    g.add(cy(0.22, 0.2, 0.3, STRAW, 3.0, FT + 0.15, 0.4, 8), bl(0.14, 0xf2943a, 3.0, FT + 0.35, 0.4, 0), bl(0.13, 0xf2943a, 2.93, FT + 0.34, 0.5, 0), rb(0.4, 0.04, 0.4, MID, -1.7, FT + 0.34, 2.3), cy(0.04, 0.04, 0.32, DK, -1.8, FT + 0.17, 2.2, 5), cy(0.04, 0.04, 0.32, DK, -1.6, FT + 0.17, 2.4, 5));
    hangBasket(g, 1.4, beamY, beamY - 0.5, 2.55, 0xe48ab4);
  } else if (variant % 4 === 2) {
    // fish-drying rack on the side deck: two posts, a pole, and a row of small fish
    g.add(cy(0.05, 0.05, 1.5, DK, -3.4, FT + 0.75, -1.2, 5), cy(0.05, 0.05, 1.5, DK, -3.4, FT + 0.75, 0.9, 5), at(cy(0.03, 0.03, 2.3, BAMBOO, -3.4, FT + 1.45, -0.15, 5), Math.PI / 2, 0, 0));
    for (let k = 0; k < 6; k++) { fish(g, -3.4, FT + 1.25, -1.0 + k * 0.33, Math.PI / 2, k % 2 ? 0xc8cfd0 : 0xaebfd0, 0.3, 0.1); }
    jar(g, 0.15, FT, 2.25); heap(g, -3.0, FT, 1.0, 0.24, 6, 0xf2943a); bench(g, -0.9, FT + 0, hd + 0.05 - 0.02, 0, 0); hangBasket(g, 1.0, TOP - 0.2, TOP - 0.7, 2.5, RED);
    g.add(at(cy(0.12, 0.12, 0.7, 0x9b6f4c, 2.4, 0.15, 1.9, 6), 0, 0, Math.PI / 2)); // a log to sit on
  } else {
    bench(g, -2.0, FT, 2.45, 1.5); bench(g, 2.0, FT, 2.45, 1.5); plant(g, -1.0, FT, 2.4, RED, 1.1); plant(g, 1.0, FT, 2.4, YEL, 1.1); jar(g, 2.6, FT, 1.9, 0xb4552f);
    for (const [x, z, c] of [[-2.6, 1.9, MID], [-2.4, 2.2, LT]]) g.add(rb(0.46, 0.4, 0.46, c, x, FT + 0.2, z), rb(0.4, 0.04, 0.4, DK, x, FT + 0.41, z));
    g.add(rb(0.4, 0.34, 0.4, MID, -2.55, FT + 0.57, 2.0), sc(bl(0.26, 0xe9dcc0, -2.2, FT + 0.2, 1.7, 0), 1, 0.8, 1)); // stacked crates and a sack of grain
    hangBasket(g, -0.5, beamY, beamY - 0.5, fz, YEL); hangBasket(g, 0.5, beamY, beamY - 0.55, fz, RED); hangBasket(g, 2.2, beamY, beamY - 0.5, fz, 0xe48ab4);
    lantern(g, 0.0, beamY, beamY - 0.35, 2.2, 0xe8503a); lamps.push({ x: 0, y: beamY - 0.35, z: 2.2 });
  }
  mergeStatic(root);
  return result(root, { colliders: [{ x: 0, z: 0, hw: totW / 2, hd: totD / 2, rot: 0 }], lamps: lamps.map((l) => ({ x: l.x - cx, y: l.y, z: l.z - cz })) });
}
export const buildStiltHouse1 = () => buildStiltHouse(1);
export const buildStiltHouse2 = () => buildStiltHouse(2);
export const buildStiltHouse3 = () => buildStiltHouse(3);

// ---- Meeting hall --------------------------------------------------------------------------
// About 9 x 6 m: a raised plank floor on short piles, ten round posts, a big roof, a half-wall at
// the back, rails at the ends, wide steps in front and a gong and a drum at the front of the floor.
export function buildMeetingHall() {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g); const lamps = [];
  const FT = 0.7, PH = 2.6, TOP = FT + PH, W = 9, D = 6, px = [-3.9, -1.95, 0, 1.95, 3.9], pz = 2.45;
  g.add(planks(W, 0.16, D, LT, 0, FT - 0.08, 0)); // raised floor
  g.add(rb(W + 0.1, 0.18, 0.2, DK, 0, FT - 0.25, D / 2 - 0.1), rb(W + 0.1, 0.18, 0.2, DK, 0, FT - 0.25, -D / 2 + 0.1), rb(0.2, 0.18, D, DK, W / 2 - 0.1, FT - 0.25, 0), rb(0.2, 0.18, D, DK, -W / 2 + 0.1, FT - 0.25, 0));
  for (const x of [-4.2, -2.1, 0, 2.1, 4.2]) for (const z of [-2.75, 2.75]) g.add(pole(0.12, 0.15, FT + 0.05, DK, x, FT / 2 - 0.1, z, 6)); // piles
  for (const x of px) for (const s of [-1, 1]) g.add(pole(0.13, 0.15, PH, DK, x, FT + PH / 2, s * pz, 7)); // roof posts
  for (const s of [-1, 1]) g.add(rb(W + 0.3, 0.2, 0.22, DK, 0, TOP - 0.12, s * pz)); // beams along the posts
  for (const x of [-3.9, -1.95, 0, 1.95, 3.9]) g.add(rb(0.17, 0.17, pz * 2 + 0.7, GREYWOOD, x, TOP - 0.28, 0)); // tie beams across
  // Half-wall at the back and rails round the ends.
  g.add(planks(W - 0.4, 0.85, 0.1, PALE, 0, FT + 0.45, -pz)); g.add(rb(W - 0.2, 0.08, 0.16, DK, 0, FT + 0.9, -pz));
  for (const s of [-1, 1]) for (const y of [0.55, 0.95]) g.add(rb(0.07, 0.06, pz * 2, DK, s * px[4], FT + y, 0));
  // Wide steps in front.
  g.add(rb(3.4, 0.24, 0.45, MID, 0, 0.12, D / 2 + 0.2), rb(3.4, 0.47, 0.45, LT, 0, 0.235, D / 2 - 0.2 + 0.0), rb(3.5, 0.05, 0.5, DK, 0, 0.26, D / 2 + 0.2));
  // Roof: big, deep eaves, sagging ridge.
  const across = 2 * (pz + 1.65), along = W + 1.7, rh = (across / 2) * 0.58;
  roofOn(g, 0, TOP, 0, true, across, along, rh, 0xd9b15a, 'thatch', 0xa8793c, { finial: true });
  // A woven mat and cushions on the floor.
  g.add(rb(2.6, 0.03, 1.7, 0xd9634a, -1.6, FT + 0.015, -0.7), rb(2.4, 0.032, 1.5, 0xf2b63b, -1.6, FT + 0.016, -0.7), rb(2.0, 0.034, 1.1, 0xfaf3e2, -1.6, FT + 0.017, -0.7), rb(2.6, 0.03, 1.7, 0x5fa8a0, 1.7, FT + 0.015, -0.9), rb(2.0, 0.032, 1.1, 0xfaf3e2, 1.7, FT + 0.016, -0.9));
  // Gong on a frame at the front right: two posts, a crossbar, a bronze disc on two cords, a mallet.
  const gx = 3.1, gz = 1.9;
  g.add(cy(0.06, 0.07, 2.1, DK, gx - 0.75, FT + 1.05, gz, 7), cy(0.06, 0.07, 2.1, DK, gx + 0.75, FT + 1.05, gz, 7), rb(1.7, 0.1, 0.1, DK, gx, FT + 2.05, gz), rb(0.14, 0.08, 0.9, DK, gx - 0.75, FT + 0.04, gz), rb(0.14, 0.08, 0.9, DK, gx + 0.75, FT + 0.04, gz));
  g.add(at(cy(0.5, 0.5, 0.07, 0xc9983a, gx, FT + 1.2, gz, 14), Math.PI / 2, 0, 0), at(cy(0.17, 0.17, 0.1, 0xe7c15e, gx, FT + 1.2, gz + 0.04, 10), Math.PI / 2, 0, 0), at(cy(0.51, 0.51, 0.03, 0xa57a2a, gx, FT + 1.2, gz - 0.04, 14), Math.PI / 2, 0, 0),
    sk([gx - 0.35, FT + 1.55, gz], [gx - 0.5, FT + 2.0, gz], 0.015, ROPE, 4), sk([gx + 0.35, FT + 1.55, gz], [gx + 0.5, FT + 2.0, gz], 0.015, ROPE, 4),
    sk([gx + 0.45, FT, gz + 0.5], [gx + 0.6, FT + 0.7, gz + 0.5], 0.025, DK, 5), bl(0.09, RED, gx + 0.6, FT + 0.74, gz + 0.5, 0));
  // Big barrel drum lying on a low stand at the front left, with cream skins and rope lacing.
  const dx = -3.0, dz = 1.9;
  g.add(rb(0.16, 0.42, 0.9, DK, dx - 0.4, FT + 0.21, dz), rb(0.16, 0.42, 0.9, DK, dx + 0.4, FT + 0.21, dz), sc(at(cy(0.42, 0.42, 1.0, 0xb4552f, dx, FT + 0.78, dz, 12), 0, 0, Math.PI / 2), 1, 1, 1),
    at(cy(0.4, 0.4, 0.04, CREAM, dx - 0.5, FT + 0.78, dz, 12), 0, 0, Math.PI / 2), at(cy(0.4, 0.4, 0.04, CREAM, dx + 0.5, FT + 0.78, dz, 12), 0, 0, Math.PI / 2),
    at(cy(0.43, 0.43, 0.05, DK, dx - 0.25, FT + 0.78, dz, 12), 0, 0, Math.PI / 2), at(cy(0.43, 0.43, 0.05, DK, dx + 0.25, FT + 0.78, dz, 12), 0, 0, Math.PI / 2));
  // Paper lanterns hung from the tie beams.
  for (const [x, z] of [[-1.95, 1.2], [1.95, 1.2], [-1.95, -1.4], [1.95, -1.4]]) { lantern(g, x, TOP - 0.3, TOP - 0.85, z); lamps.push({ x, y: TOP - 0.85, z }); }
  mergeStatic(root);
  const cols = [{ x: 0, z: 0, hw: W / 2, hd: D / 2, rot: 0 }]; // the raised floor is solid to walk into from the steps only (ASSUMPTION)
  return result(root, { colliders: cols, lamps });
}

// ---- Market stalls -------------------------------------------------------------------------
// A counter under a striped cloth awning on four poles, with baskets of goods. 3 variants.
const STALLS = [
  { a: RED, b: CREAM }, { a: 0x6f9a5a, b: CREAM }, { a: BLUE, b: CREAM },
];
export function buildMarketStall(variant = 0) {
  const v = ((variant % 3) + 3) % 3, S = STALLS[v], root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  const lamps = [], yb = 2.72, yf = 2.12, zb = -0.9, zf = 0.95;
  for (const x of [-1.3, 1.3]) g.add(pole(0.05, 0.065, yb, DK, x, yb / 2, zb, 6), pole(0.05, 0.065, yf, DK, x, yf / 2, zf, 6), sk([x, yb, zb], [x, yf, zf], 0.03, DK, 4));
  g.add(rb(2.8, 0.08, 0.08, DK, 0, yb, zb), rb(2.8, 0.08, 0.08, DK, 0, yf, zf));
  // Awning: stripes of cloth sloping down towards the customer, each with a diamond flap hanging off the front.
  const th = Math.atan2(yb - yf, zf - zb), Ls = Math.hypot(zf - zb, yb - yf) + 0.55, n = 8, sw = 3.2 / n;
  for (let i = 0; i < n; i++) {
    const x = -1.6 + sw * (i + 0.5), c = i % 2 ? S.b : S.a;
    g.add(at(rb(sw, 0.035, Ls, c, x, (yb + yf) / 2 + 0.03, (zb + zf) / 2 + 0.02), th, 0, 0));
    g.add(at(rb(0.3, 0.3, 0.03, c, x, yf - 0.22, zf + 0.28 * Math.cos(th) - 0.03), 0, 0, Math.PI / 4));
  }
  // Counter: a planked front, a thick top, and two shelves at the back.
  g.add(planks(2.6, 0.8, 0.7, MID, 0, 0.4, 0.35), rb(2.85, 0.07, 0.9, LT, 0, 0.84, 0.35), rb(2.4, 0.05, 0.4, MID, 0, 0.55, zb + 0.15), rb(2.4, 0.05, 0.4, MID, 0, 1.15, zb + 0.15), rb(0.06, 1.2, 0.06, DK, -1.15, 0.6, zb + 0.15), rb(0.06, 1.2, 0.06, DK, 1.15, 0.6, zb + 0.15));
  g.add(rb(2.6, 0.1, 0.06, DK, 0, 0.78, 0.72)); // a footrest rail along the counter's front
  const cyTop = 0.875;
  if (v === 0) { // fruit
    heap(g, -0.95, cyTop, 0.35, 0.26, 9, RED); heap(g, -0.3, cyTop, 0.4, 0.25, 8, 0xf2943a, 0.085); heap(g, 0.4, cyTop, 0.33, 0.24, 7, 0xe3c548, 0.07);
    g.add(bl(0.21, 0x4f9a4f, 1.0, cyTop + 0.2, 0.3, 1), bl(0.19, 0x5aa85a, 0.88, cyTop + 0.17, 0.62, 1), bl(0.18, 0x4f9a4f, 1.12, cyTop + 0.17, 0.05, 1));
    for (let k = 0; k < 3; k++) g.add(at(rb(0.3, 0.07, 0.07, YEL, -0.05 - k * 0.0, cyTop + 0.07, 0.6 - k * 0.0), 0, k * 0.5, 0)); // a hand of bananas on the counter
    for (let k = 0; k < 4; k++) g.add(cy(0.07, 0.08, 0.2, 0xe8a63b, -0.15 + k * 0.04, 1.2 + 0.1, zb + 0.2 - k * 0.0, 6), bl(0.08, LEAF_D, -0.15 + k * 0.04, 1.4, zb + 0.2, 0)); // pineapples on the top shelf
    g.add(sc(bl(0.2, 0xe8c15a, -0.9, 0.7, zb + 0.15, 0), 1, 1.3, 1), cy(0.25, 0.22, 0.3, STRAW, 0.8, 0.7 + 0.0, zb + 0.15, 8)); // stored sacks and a basket
    for (let k = 0; k < 5; k++) g.add(at(rb(0.06, 0.4, 0.06, 0xe3c548, -0.5 + k * 0.1, 1.9, zf + 0.0), 0, 0, 0.1 * (k - 2)), sk([-0.5 + k * 0.1, yf, zf], [-0.5 + k * 0.1, 1.72, zf], 0.008, ROPE, 3)); // bananas hung from the awning beam
  } else if (v === 1) { // vegetables
    heap(g, -0.95, cyTop, 0.35, 0.26, 7, 0xa6cf72, 0.13); heap(g, -0.3, cyTop, 0.4, 0.25, 9, 0xe8503a, 0.07);
    for (let k = 0; k < 5; k++) g.add(at(cn(0.045, 0.28, 0xf2873a, 0.42 + k * 0.07, cyTop + 0.1 + (k % 2) * 0.05, 0.4 + (k % 3) * 0.02, 5), 0, 0, Math.PI / 2 + 0.2));
    g.add(cy(0.28, 0.26, 0.17, STRAW, 0.55, cyTop + 0.08, 0.35, 8));
    for (let k = 0; k < 4; k++) g.add(sc(bl(0.1, 0x6a3f9c, 1.0 + (k % 2) * 0.1, cyTop + 0.2 + (k > 1 ? 0.09 : 0), 0.3 + (k % 2) * 0.12, 0), 1, 1.35, 1));
    g.add(sc(bl(0.34, 0xe9dcc0, -0.9, 0.38, zb + 0.4, 1), 1, 1.1, 0.9), sc(bl(0.3, 0xe3d3a8, -0.3, 0.33, zb + 0.4, 1), 1, 1.1, 0.9), cy(0.2, 0.2, 0.3, STRAW, 0.8, 0.7, zb + 0.15, 8), bl(0.14, 0x6f9a5a, 0.8, 0.9, zb + 0.15, 1), bl(0.12, 0x6f9a5a, 0.95, 0.88, zb + 0.18, 1));
    for (let k = 0; k < 5; k++) g.add(sk([-0.55 + k * 0.28, yf, zf], [-0.55 + k * 0.28, 1.65, zf], 0.008, ROPE, 3), bl(0.075, k % 2 ? 0xe8503a : 0xf2873a, -0.55 + k * 0.28, 1.62, zf, 0)); // strings of chillies and peppers
  } else { // fish
    g.add(cy(0.38, 0.33, 0.18, 0x4f7fc9, -0.8, cyTop + 0.09, 0.35, 10), cy(0.32, 0.32, 0.03, 0x9bd0e0, -0.8, cyTop + 0.17, 0.35, 10), cy(0.34, 0.3, 0.16, CREAM, 0.1, cyTop + 0.08, 0.38, 10));
    for (let k = 0; k < 6; k++) fish(g, -0.8 + Math.cos(k * 1.9) * 0.14, cyTop + 0.24 + (k % 3) * 0.02, 0.35 + Math.sin(k * 1.9) * 0.12, k * 1.3, k % 2 ? 0xaebfd0 : 0xd8e1e6, 0.32);
    for (let k = 0; k < 5; k++) fish(g, 0.1 + Math.cos(k * 2.3) * 0.12, cyTop + 0.2 + (k % 2) * 0.03, 0.38 + Math.sin(k * 2.3) * 0.1, k * 0.9 + 0.4, k % 2 ? 0xe39a7a : 0xaebfd0, 0.3);
    g.add(rb(0.55, 0.3, 0.4, MID, 0.95, cyTop + 0.15, 0.35), rb(0.5, 0.05, 0.35, 0xdff1ff, 0.95, cyTop + 0.31, 0.35));
    fish(g, 0.95, cyTop + 0.4, 0.35, 0.3, 0xaebfd0, 0.34); fish(g, 0.85, cyTop + 0.38, 0.4, 1.2, 0x7fa0b8, 0.3);
    g.add(rb(0.5, 0.06, 0.1, DK, 0.0, 1.9, zf - 0.02)); // pole for hanging dried fish
    for (let k = 0; k < 7; k++) { g.add(sk([-0.55 + k * 0.2, yf, zf], [-0.55 + k * 0.2, 1.78, zf], 0.007, ROPE, 3)); fish(g, -0.55 + k * 0.2, 1.62, zf, Math.PI / 2, k % 2 ? 0xc8cfd0 : 0xaebfd0, 0.28, 1.2); }
    g.add(cy(0.3, 0.26, 0.3, 0x4f7fc9, -0.9, 0.2, zb + 0.4, 9), sc(bl(0.18, 0xdff1ff, -0.9, 0.38, zb + 0.4, 0), 1, 0.5, 1), rb(0.55, 0.3, 0.4, LT, 0.1, 0.18, zb + 0.4), cy(0.04, 0.04, 0.6, DK, 1.1, 0.3, zb + 0.5, 5));
  }
  lantern(g, 0, yf - 0.08, yf - 0.5, 0.2, v === 2 ? 0x4f7fc9 : 0xe8503a); lamps.push({ x: 0, y: yf - 0.5, z: 0.2 });
  mergeStatic(root);
  return result(root, { colliders: [{ x: 0, z: 0, hw: 1.45, hd: 1.05, rot: 0 }], lamps });
}
export const buildMarketStall1 = () => buildMarketStall(1);
export const buildMarketStall2 = () => buildMarketStall(2);

// ---- Well --------------------------------------------------------------------------------------
// A ring of grey stones around a dark pool, two posts with a winch, a rope and bucket, under a tiny thatched roof.
export function buildWell() {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  const greys = [0xbdb4bb, 0xa8a0a8, 0xcbc3c9, 0xb3a8ad];
  for (let course = 0; course < 2; course++) {
    const n = 10, R = 0.78;
    for (let i = 0; i < n; i++) {
      const a = ((i + course * 0.5) / n) * Math.PI * 2;
      g.add(rb(0.6, 0.42, 0.34, greys[(i + course) % 4], Math.cos(a) * R, 0.21 + course * 0.42, Math.sin(a) * R).rotateY(Math.PI / 2 - a));
    }
  }
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.15; g.add(rb(0.62, 0.11, 0.46, greys[(i + 2) % 4], Math.cos(a) * 0.8, 0.89, Math.sin(a) * 0.8).rotateY(Math.PI / 2 - a)); } // capstones
  g.add(cy(0.64, 0.64, 0.02, 0x3f6f8f, 0, 0.5, 0, 12)); // dark water deep inside
  for (const k of [0, 1.3, 2.7, 4.1, 5.4]) g.add(sc(bl(0.15, greys[Math.floor(k) % 4], Math.cos(k) * 1.2, 0.06, Math.sin(k) * 1.2, 0), 1, 0.55, 1)); // stones at the foot
  // Two posts, a bamboo winch with a crank, and a thatched roof.
  const py = 2.0;
  for (const s of [-1, 1]) g.add(cy(0.07, 0.09, py, DK, s * 1.05, py / 2, 0, 7), sk([s * 1.05, 0.3, 0.0], [s * 0.82, 0.95, 0.0], 0.04, DK, 4));
  g.add(at(cy(0.09, 0.09, 2.3, MID, 0, 1.55, 0, 8), 0, 0, Math.PI / 2), at(cy(0.14, 0.14, 0.6, ROPE, 0.0, 1.55, 0, 10), 0, 0, Math.PI / 2));
  g.add(sk([1.15, 1.55, 0], [1.38, 1.55, 0.0], 0.03, DK, 5), sk([1.38, 1.55, 0], [1.38, 1.2, 0.0], 0.03, DK, 5), bl(0.06, RED, 1.38, 1.15, 0, 0));
  g.add(sk([0.15, 1.55, 0], [0.15, 1.1, 0], 0.012, ROPE, 4), sk([-0.15, 1.55, 0], [-0.15, 1.1, 0], 0.012, ROPE, 4));
  g.add(cy(0.18, 0.14, 0.26, MID, 0, 0.9, 0, 9), cy(0.19, 0.19, 0.03, 0x5b5b63, 0, 0.98, 0, 9), cy(0.15, 0.15, 0.03, 0x5b5b63, 0, 0.84, 0, 9), at(cy(0.12, 0.12, 0.01, 0x3f6f8f, 0, 1.02, 0, 9)), sk([-0.17, 1.0, 0], [0, 1.12, 0], 0.012, 0x5b5b63, 4), sk([0.17, 1.0, 0], [0, 1.12, 0], 0.012, 0x5b5b63, 4));
  g.add(rb(2.6, 0.08, 0.12, DK, 0, py - 0.02, 0));
  roofOn(g, 0, py + 0.02, 0, true, 2.5, 3.0, 0.95, 0xd9b15a, 'thatch', 0xa8793c);
  // a wooden bucket waiting on the ground
  g.add(cy(0.17, 0.13, 0.26, MID, 1.7, 0.13, 0.8, 9), cy(0.18, 0.18, 0.025, 0x5b5b63, 1.7, 0.2, 0.8, 9), cy(0.14, 0.14, 0.02, 0x3f6f8f, 1.7, 0.26, 0.8, 9));
  mergeStatic(root);
  return result(root, { colliders: [{ x: 0, z: 0, r: 1.15 }] });
}

// ---- Shade tree ------------------------------------------------------------------------------------------
// A broad old banyan: thick leaning trunk, spreading branches, a wide flat-topped canopy of leaf clumps,
// hanging prop roots and a ring bench round the trunk.
export function buildShadeTree() {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g); const lamps = [];
  const BARK = 0x7a5a42, BARK_L = 0x8f6c50;
  g.add(sc(bl(1.6, BARK, 0, 0.35, 0, 1), 1, 0.5, 1), cy(0.85, 1.25, 3.2, BARK, 0, 1.6, 0, 8), at(cy(0.55, 0.8, 3.0, BARK_L, 0.7, 3.6, 0.2, 7), 0, 0, -0.18), at(cy(0.5, 0.7, 2.8, BARK_L, -0.6, 3.5, -0.3, 7), 0, 0, 0.2));
  const lobes = [[0, 6.2, 0, 3.3, LEAF], [4.6, 5.3, 1.6, 3.0, LEAF_D], [-4.6, 5.5, 1.2, 3.1, LEAF], [1.8, 5.3, -4.6, 3.0, LEAF_D], [-3.0, 5.4, -4.2, 2.9, LEAF], [6.2, 4.9, -2.4, 2.4, LEAF], [-6.4, 5.0, -1.6, 2.4, LEAF_D], [0.8, 5.0, 5.2, 2.7, LEAF], [-3.3, 4.8, 4.2, 2.5, LEAF_D], [3.6, 5.0, 4.4, 2.5, LEAF_L], [3.4, 6.7, -1.6, 2.3, LEAF_L], [-2.2, 6.9, 1.8, 2.2, LEAF_L], [-2.4, 6.6, -1.8, 2.1, LEAF]];
  for (const [x, y, z, r, c] of lobes) g.add(sc(bl(r * 1.15, c, x, y - 0.9, z, 1), 1, 0.62, 1));
  for (const [x, y, z] of lobes.slice(0, 10)) g.add(sk([0, 3.4, 0], [x * 0.85, y - 1.0, z * 0.85], 0.28, BARK, 5)); // branches out to each clump
  const cols = [{ x: 0, z: 0, r: 1.3 }];
  // Prop roots: pairs of crooked sticks, so they read as roots and not as poles. Some reach the ground, some still hang.
  for (let k = 0; k < 11; k++) {
    const a = k * 0.58 + 0.3, r = 2.8 + (k % 4) * 0.9, x = Math.cos(a) * r, z = Math.sin(a) * r, y0 = 4.5, bend = 0.35 * (k % 2 ? 1 : -1);
    const mx = x + Math.sin(a) * bend, mz = z - Math.cos(a) * bend;
    if (k % 3 !== 2) { g.add(sk([x * 0.92, y0, z * 0.92], [mx, 2.2, mz], 0.2, BARK_L, 5), sk([mx, 2.2, mz], [x, 0, z], 0.26, BARK_L, 5)); cols.push({ x, z, r: 0.25 }); }
    else g.add(sk([x * 0.92, y0, z * 0.92], [mx, 2.0 + (k % 5) * 0.3, mz], 0.07, BARK_L, 4));
  }
  // Ring bench round the trunk, open at the front (+z).
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2; if (Math.abs(Math.sin(a - Math.PI / 2)) < 0.3 && Math.cos(a - Math.PI / 2) > 0) continue;
    const R = 2.1, x = Math.cos(a) * R, z = Math.sin(a) * R, ry = -a - Math.PI / 2;
    g.add(rb(1.28, 0.08, 0.5, LT, x, 0.46, z).rotateY(ry), rb(0.9, 0.42, 0.28, DK, x, 0.21, z).rotateY(ry));
  }
  g.add(sk([2.6, 5.2, 1.6], [2.6, 3.7, 1.6], 0.012, ROPE, 4), cy(0.1, 0.1, 0.22, RED, 2.6, 3.55, 1.6, 6), cy(0.04, 0.12, 0.04, DK, 2.6, 3.7, 1.6, 6)); lamps.push({ x: 2.6, y: 3.55, z: 1.6 });
  mergeStatic(root);
  return result(root, { colliders: cols, lamps });
}

// ---- Washing line ------------------------------------------------------------------------------------------
// Two bamboo poles, a sagging line and a row of coloured cloths, with a laundry tub at one foot.
export function buildWashingLine() {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  const hx = 2.1, top = 2.1, sag = (x) => 0.2 * (1 - (x / hx) ** 2);
  for (const s of [-1, 1]) g.add(cy(0.04, 0.055, 2.25, BAMBOO, s * hx, 1.12, 0, 6, 'bamboo'), bl(0.05, 0xc9a85a, s * hx, 2.26, 0, 0), sk([s * hx, 0.0, 0.0], [s * (hx + 0.3), -0.2, 0.0], 0.03, DK, 4));
  for (let k = 0; k < 10; k++) { const x0 = -hx + (k / 10) * 2 * hx, x1 = -hx + ((k + 1) / 10) * 2 * hx; g.add(sk([x0, top - sag(x0), 0], [x1, top - sag(x1), 0], 0.012, ROPE, 4)); }
  const hang = (x, w, h, c, extra = () => {}) => { const y = top - sag(x); const f = new THREE.Group(); f.position.set(x, y, 0); f.rotation.y = Math.sin(x * 7) * 0.12; f.add(rb(w, h, 0.02, c, 0, -h / 2 - 0.02, 0), rb(0.04, 0.09, 0.04, DK, -w * 0.3, 0, 0.0), rb(0.04, 0.09, 0.04, DK, w * 0.3, 0, 0.0)); extra(f); g.add(f); };
  hang(-1.75, 0.95, 1.25, BLUE); hang(-0.95, 0.5, 0.45, RED, (f) => f.add(rb(0.2, 0.14, 0.02, RED, -0.33, -0.22, 0), rb(0.2, 0.14, 0.02, RED, 0.33, -0.22, 0)));
  hang(-0.35, 0.5, 0.85, YEL); hang(0.2, 0.4, 0.6, CREAM, (f) => f.add(rb(0.52, 0.18, 0.02, 0xd9634a, 0, -0.65, 0.01)));
  hang(0.75, 0.2, 0.7, 0x6f9a5a, (f) => f.add(rb(0.2, 0.7, 0.02, 0x6f9a5a, 0.24, -0.37, 0)));
  hang(1.25, 0.7, 0.9, 0xe48ab4); hang(1.8, 0.3, 0.32, TEAL, (f) => f.add(rb(0.3, 0.32, 0.02, TEAL, 0.38, -0.2, 0)));
  // laundry tub and a bar of soap
  g.add(cy(0.38, 0.3, 0.3, MID, -1.5, 0.15, 0.8, 10), cy(0.4, 0.4, 0.03, DK, -1.5, 0.3, 0.8, 10), sc(bl(0.24, CREAM, -1.5, 0.33, 0.8, 0), 1, 0.5, 1), cy(0.34, 0.34, 0.02, 0x7ec3d9, -1.5, 0.27, 0.8, 10), rb(0.14, 0.05, 0.08, 0xf2e29a, -1.0, 0.03, 0.9));
  mergeStatic(root);
  return result(root, { colliders: [{ x: -hx, z: 0, r: 0.14 }, { x: hx, z: 0, r: 0.14 }, { x: -1.5, z: 0.8, r: 0.4 }] });
}

// ---- Jetty -------------------------------------------------------------------------------------------------------
// A low fishing jetty running along +z from the shore (-z) out to the water (+z): planks across stringers, on
// round posts. Deck top is y = 0.5. The last posts are tall for tying boats and carry a rope rail.
export function buildJetty(length = 9) {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g); const lamps = [];
  const hw = 1.0, L = length, z0 = -L / 2, z1 = L / 2, tones = [MID, LT, 0xa87d54];
  const n = Math.floor(L / 0.3);
  for (let i = 0; i < n; i++) { const z = z0 + 0.15 + i * (L / n); g.add(rb(2.0 + ((i * 7) % 5) * 0.012, 0.07, L / n - 0.04, tones[i % 3], ((i * 3) % 4 - 1.5) * 0.008, 0.465, z)); }
  for (const x of [-0.8, 0, 0.8]) g.add(rb(0.14, 0.16, L, DK, x, 0.37, 0));
  const posts = []; for (let z = z0 + 0.5; z <= z1 - 0.3; z += 1.9) posts.push(z);
  const last = posts[posts.length - 1];
  for (const z of posts) {
    g.add(rb(2.5, 0.13, 0.16, DK, 0, 0.27, z));
    for (const s of [-1, 1]) g.add(cy(0.085, 0.1, 1.5 + (z > last - 3.9 ? 0.4 : 0.0), DK, s * 1.12, 0.65 + (z > last - 3.9 ? 0.2 : 0.0) - 0.0 - 0.0, z, 6));
  }
  // posts near the end are tall: a rope rail between them, and caps
  const tall = posts.filter((z) => z > last - 3.9);
  for (const s of [-1, 1]) for (let i = 0; i < tall.length; i++) {
    const z = tall[i]; g.add(bl(0.09, 0xc9a85a, s * 1.12, 1.28, z, 0));
    if (i < tall.length - 1) { const zn = tall[i + 1], zm = (z + zn) / 2; g.add(sk([s * 1.12, 1.15, z], [s * 1.12, 1.02, zm], 0.02, ROPE, 4), sk([s * 1.12, 1.02, zm], [s * 1.12, 1.15, zn], 0.02, ROPE, 4)); }
  }
  // steps at the shore end
  g.add(rb(1.9, 0.27, 0.5, DK, 0, 0.135, z0 - 0.3), rb(2.0, 0.05, 0.52, MID, 0, 0.28, z0 - 0.3), rb(1.9, 0.12, 0.45, DK, 0, 0.06, z0 - 0.75));
  // things people leave on a jetty: coiled rope, a bucket, a crate of fish, a lantern post at the very end
  const rz = z1 - 2.4;
  for (let k = 0; k < 3; k++) g.add(cy(0.22 - k * 0.02, 0.22 - k * 0.02, 0.05, ROPE, -0.55, 0.53 + k * 0.045, rz, 10));
  g.add(cy(0.16, 0.12, 0.28, 0x4f7fc9, 0.5, 0.64, rz - 0.2, 8), cy(0.17, 0.17, 0.02, 0x5b5b63, 0.5, 0.78, rz - 0.2, 8));
  g.add(rb(0.62, 0.3, 0.42, LT, 0.4, 0.68, rz + 0.5), rb(0.56, 0.05, 0.36, 0xdff1ff, 0.4, 0.84, rz + 0.5));
  fish(g, 0.4, 0.89, rz + 0.5, 0.4, 0xaebfd0, 0.32); fish(g, 0.3, 0.88, rz + 0.55, -0.6, 0xe39a7a, 0.28);
  g.add(cy(0.04, 0.05, 1.5, DK, -0.85, 1.25, z1 - 0.3, 6), rb(0.2, 0.04, 0.2, DK, -0.85, 2.0, z1 - 0.3), cy(0.11, 0.11, 0.24, GLOW, -0.85, 1.85, z1 - 0.3, 6), cn(0.16, 0.12, DK, -0.85, 2.04, z1 - 0.3, 6)); lamps.push({ x: -0.85, y: 1.85, z: z1 - 0.3 });
  mergeStatic(root);
  const cols = []; for (const z of tall) for (const s of [-1, 1]) cols.push({ x: s * 1.12, z, r: 0.12 });
  return result(root, { colliders: cols, lamps, platforms: [{ x: 0, z: 0, hw, hd: L / 2, rot: 0, top: 0.5 }] });
}

// ---- Row boat ---------------------------------------------------------------------------------------------------------
// A little fishing boat about 3.5 m long: pointed bow at +z, a squarish stern, two thwarts, two oars resting in
// their locks, a heap of net with cork floats and a lantern post at the bow. The waterline is at y = 0.
// update() bobs the whole hull gently.
function hullGeo(parts) { // parts: [{quads:[[a,b,c,d]...], hint}] oriented automatically
  const pos = [];
  const addTri = (a, b, c, hint) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    const cxm = (a[0] + b[0] + c[0]) / 3, cym = (a[1] + b[1] + c[1]) / 3, czm = (a[2] + b[2] + c[2]) / 3, h = hint(cxm, cym, czm);
    if (nx * h[0] + ny * h[1] + nz * h[2] < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
  };
  for (const { tris, hint } of parts) for (const t of tris) addTri(t[0], t[1], t[2], hint);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); geo.computeVertexNormals();
  return geo;
}
export function buildRowBoat(color = 0x4f7fc9) {
  const root = new THREE.Group(), bob = new THREE.Group(), lamps = [{ x: 0, y: 1.0, z: 1.2 }]; root.add(bob);
  const N = 10, HL = 1.75, st = [];
  const gy = (t) => 0.3 + 0.3 * t ** 3, ky = (t) => -0.24 + (0.6 + 0.24) * t ** 4, wd = (t) => 0.62 * (1 - t ** 2.4) ** 0.55 * (0.8 + 0.2 * t);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), z = -HL + 2 * HL * t, w = wd(t), g1 = gy(t), k1 = ky(t), mid = (a, f) => k1 + (g1 - k1) * f;
    const outer = [[-w, g1], [-0.9 * w, mid(0, 0.55)], [-0.5 * w, mid(0, 0.15)], [0, k1], [0.5 * w, mid(0, 0.15)], [0.9 * w, mid(0, 0.55)], [w, g1]].map(([x, y]) => [x, y, z]);
    const wi = Math.max(0, w - 0.075), inner = [[-wi, g1 - 0.0], [-0.9 * wi, mid(0, 0.55) + 0.04], [-0.5 * wi, mid(0, 0.15) + 0.07], [0, k1 + 0.08], [0.5 * wi, mid(0, 0.15) + 0.07], [0.9 * wi, mid(0, 0.55) + 0.04], [wi, g1 - 0.0]].map(([x, y]) => [x, y, z]);
    st.push({ outer, inner });
  }
  const outwardH = (x, y, z) => [x, y - 0.1, 0], inwardH = (x, y, z) => [-x, 0.1 - y + 0.2, 0];
  const strip = (key, j0, j1) => { const tris = []; for (let i = 0; i < N - 1; i++) for (let j = j0; j < j1; j++) { const a = st[i][key][j], b = st[i][key][j + 1], c = st[i + 1][key][j + 1], d = st[i + 1][key][j]; tris.push([a, b, c], [a, c, d]); } return tris; };
  const rim = []; for (let i = 0; i < N - 1; i++) for (const s of [0, 6]) { const a = st[i].outer[s], b = st[i].inner[s], c = st[i + 1].inner[s], d = st[i + 1].outer[s]; rim.push([a, b, c], [a, c, d]); }
  const tr = (arr) => { const o = []; for (let j = 1; j < arr.length - 1; j++) o.push([arr[0], arr[j], arr[j + 1]]); return o; };
  const body = (hint, tris, c, kind) => bob.add(paint(new THREE.Mesh(hullGeo([{ tris, hint }]), atlas() || c), c, kind));
  body(outwardH, strip('outer', 1, 6), color);                       // painted lower hull
  body(outwardH, strip('outer', 0, 1), CREAM);                       // pale top strake
  body(inwardH, strip('inner', 0, 6), 0xd9b27c);                     // inside of the hull
  body(() => [0, 1, 0], rim, DK);                                    // gunwale rim
  body(() => [0, 0, -1], tr(st[0].outer), color);                    // transom outside
  body(() => [0, 0, 1], tr(st[0].inner), 0xd9b27c);                  // transom inside
  // Thwarts, oarlocks and oars.
  for (const z of [-0.45, 0.25]) { const t = (z + HL) / (2 * HL), w = wd(t) - 0.06; bob.add(rb(w * 2, 0.05, 0.26, LT, 0, 0.27 + 0.0, z), rb(0.07, 0.15, 0.2, DK, -w + 0.04, 0.2, z), rb(0.07, 0.15, 0.2, DK, w - 0.04, 0.2, z)); }
  const lz = 0.0, lt = (lz + HL) / (2 * HL), lx = wd(lt) + 0.0, ly = gy(lt) + 0.07;
  for (const s of [-1, 1]) {
    const L0 = [s * lx, ly + 0.02, lz], dir = [s, 0.12, -0.1], A = [L0[0] - 0.9 * dir[0], L0[1] - 0.9 * dir[1], L0[2] - 0.9 * dir[2]], B = [L0[0] + 1.3 * dir[0], L0[1] + 1.3 * dir[1], L0[2] + 1.3 * dir[2]];
    bob.add(cy(0.025, 0.03, 0.14, DK, s * lx, ly - 0.02, lz, 5), sk(A, B, 0.025, LT, 5), bl(0.045, DK, A[0], A[1], A[2], 0));
    const blade = rb(0.15, 0.02, 0.55, LT, 0, 0, 0); blade.position.set(B[0] + dir[0] * 0.2, B[1] + dir[1] * 0.2, B[2] + dir[2] * 0.2); blade.lookAt(blade.position.x + dir[0], blade.position.y + dir[1], blade.position.z + dir[2]); bob.add(blade);
  }
  // A heap of net in the stern with cork floats, and a couple of fish.
  bob.add(sc(bl(0.34, 0xa7b79a, 0, 0.18, -1.2, 1), 1.0, 0.45, 1.1), sc(bl(0.22, 0x8fa386, 0.1, 0.26, -1.0, 0), 1, 0.5, 1));
  for (let k = 0; k < 7; k++) { const a = k * 0.9; bob.add(bl(0.05, k % 2 ? 0xf2873a : RED, Math.cos(a) * 0.3, 0.3 + (k % 3) * 0.03, -1.2 + Math.sin(a) * 0.32, 0)); }
  bob.add(at(sk([0.25, 0.14, -0.9], [0.6, 0.12, -0.45], 0.02, ROPE, 4)));
  fish(bob, -0.15, 0.17, 0.7, 0.4, 0xaebfd0, 0.34); fish(bob, 0.1, 0.17, 0.85, -0.5, 0xe39a7a, 0.3);
  // Lantern post at the bow and a painted bow knob.
  bob.add(cy(0.03, 0.04, 0.85, DK, 0, 0.7, 1.15, 6), rb(0.18, 0.04, 0.18, DK, 0, 1.14, 1.15), cy(0.09, 0.09, 0.18, GLOW, 0, 1.03, 1.15, 6), cn(0.13, 0.1, DK, 0, 1.2, 1.15, 6), bl(0.07, CREAM, 0, gy(1) + 0.06, HL - 0.02, 0));
  mergeStatic(bob);
  const group = new THREE.Group(); group.add(bob);
  return { group, colliders: [{ x: 0, z: 0, hw: 0.7, hd: 1.8, rot: 0 }], lamps, // lamp at the bow lantern
    update(dt, t) { bob.position.y = Math.sin(t * 1.3) * 0.035; bob.rotation.z = Math.sin(t * 1.0 + 1) * 0.025; bob.rotation.x = Math.sin(t * 0.8 + 2) * 0.02; } };
}
export const buildRowBoatRed = () => buildRowBoat(0xe8503a);

// ---- Fence and lamp ----------------------------------------------------------------------------------------------------
// A low bamboo fence along +x: upright canes of slightly different heights tied to two rails, with thicker posts at the ends.
export function buildFenceRun(length = 4) {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  const n = Math.max(3, Math.round(length / 0.16));
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + 0.1 + (i / (n - 1)) * (length - 0.2), h = 0.72 + 0.12 * Math.sin(i * 1.7) + ((i * 5) % 3) * 0.03;
    g.add(cy(0.022, 0.038, h, BAMBOO, x, h / 2, 0, 5, 'bamboo'));
  }
  for (const y of [0.25, 0.55]) for (const z of [-0.055, 0.055]) g.add(at(cy(0.026, 0.026, length, BAMBOO, 0, y, z, 5, 'bamboo'), 0, 0, Math.PI / 2));
  const posts = Math.max(2, Math.round(length / 2) + 1);
  for (let i = 0; i < posts; i++) { const x = -length / 2 + 0.04 + (i / (posts - 1)) * (length - 0.08); g.add(cy(0.05, 0.06, 1.05, 0xb08a4a, x, 0.52, 0, 6), cn(0.055, 0.1, 0xb08a4a, x, 1.08, 0, 6)); for (const y of [0.25, 0.55]) g.add(rb(0.13, 0.04, 0.16, DARK, x, y, 0)); }
  mergeStatic(root);
  return result(root, { colliders: [{ x: 0, z: 0, hw: length / 2, hd: 0.1, rot: 0 }] });
}
// A lantern on a post: a tapered wooden post, a short arm, and a glowing paper lantern with a little cap.
export function buildPathLamp() {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  g.add(cy(0.045, 0.065, 1.7, DK, 0, 0.85, 0, 6), rb(0.26, 0.1, 0.26, 0xa8a0a8, 0, 0.05, 0), rb(0.14, 0.1, 0.14, DK, 0, 1.7, 0), rb(0.5, 0.05, 0.05, DK, 0.22, 1.68, 0), sk([0, 1.5, 0], [0.2, 1.66, 0], 0.025, DK, 4));
  g.add(cy(0.1, 0.12, 0.26, GLOW, 0.4, 1.46, 0, 6), cy(0.13, 0.13, 0.03, DK, 0.4, 1.34, 0, 6), cy(0.12, 0.12, 0.03, DK, 0.4, 1.6, 0, 6), cn(0.17, 0.14, RED, 0.4, 1.69, 0, 6), sk([0.4, 1.62, 0], [0.4, 1.68, 0], 0.01, DK, 3), bl(0.03, YEL, 0.4, 1.31, 0, 0));
  mergeStatic(root);
  return result(root, { colliders: [{ x: 0, z: 0, r: 0.13 }], lamps: [{ x: 0.4, y: 1.46, z: 0 }] });
}
