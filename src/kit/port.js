// INTERNAL. The modern fishing port's things (owner revision of the fishing waterfront, design section 10), built
// from code and placed by src/world/areas/waterfront.js: the fish auction hall (TPI) on its raised slab, the concrete
// pier with its T-head, the fish carrier ship, the modern boats (fibreglass outboard boats and wooden or steel motor
// fishing boats, kapal motor) with their gear, a small truck and motorbikes for the forecourt, and the modern yard
// gear (an outboard on a stand, a repair bench). Same rules as src/kit/fishing.js: everything goes into a Mesher in
// the model's own frame (+z its front or bow, y = 0 the ground, or the waterline for a hull), one vertex-coloured
// flat material, glowing parts (tube lights, lamp lenses, mast lights) into the Mesher's glow list.
// Low-poly and painterly: simple shapes, flat faces, painted trims; signboards carry shapes, never text.
import * as THREE from 'three';
import { COL, fish, iceBlocks, bucket, jerryCan, ropeCoil, signboard } from './fishing.js';

export const PCOL = {
  concrete: 0xc4bfb2, concreteDk: 0x9a958a, concreteLt: 0xdcd8cd, tileA: 0xe9edeb, tileB: 0xcfdcdd, drain: 0x4a5256, grate: 0x9aa4a8,
  steel: 0x7d98a6, steelDk: 0x56646c, roof: 0x4d86b6, roofDk: 0x3f72a0, roofUnder: 0xbfcbcf, fascia: 0xe2703a, trim: 0xf2c03b,
  white: 0xf3f1ea, cream: 0xf1e6cc, glass: 0x5f8099, blue: 0x2f6fb0, drum: 0x2f6fc0, tyre: 0x2e2c2c, weed: 0x5f7a52, rust: 0xa86a4a,
};

// A face list, oriented so each triangle looks away from a point (or along a direction): [a, b, c] are local points.
function addFaces(m, tris, hex, away = null, dir = null) {
  const out = [];
  for (const [a, b, c] of tris) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    let hx, hy, hz;
    if (dir) [hx, hy, hz] = dir;
    else { const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3; [hx, hy, hz] = away(cx, cy, cz); }
    out.push(nx * hx + ny * hy + nz * hz >= 0 ? [a, b, c] : [a, c, b]);
  }
  if (out.length) m.tris(out, hex);
}
const quadT = (a, b, c, d) => [[a, b, c], [a, c, d]];

// ---- Corrugated roof sheet ---------------------------------------------------------------------------------
// A sheet from its low edge (z = za, y = ya) to its high edge (zb, yb), x0..x1 across, ribs running down the slope
// every `p` m; `up` is the side the top faces (+1 up). Two shades on alternate facets read as painted corrugation.
export function corrugated(m, x0, x1, za, ya, zb, yb, hex, hexDk, { p = 0.34, rib = 0.045, under = PCOL.roofUnder } = {}) {
  const n = Math.max(2, Math.round((x1 - x0) / (p / 2))), lit = [], dark = [];
  for (let i = 0; i < n; i++) {
    const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n, ha = i % 2 ? rib : 0, hb = i % 2 ? 0 : rib;
    (i % 2 ? dark : lit).push(...quadT([xa, ya + ha, za], [xb, ya + hb, za], [xb, yb + hb, zb], [xa, yb + ha, zb]));
  }
  addFaces(m, lit, hex, null, [0, 1, 0]); addFaces(m, dark, hexDk, null, [0, 1, 0]);
  if (under) addFaces(m, quadT([x0, ya - 0.01, za], [x1, ya - 0.01, za], [x1, yb - 0.01, zb], [x0, yb - 0.01, zb]), under, null, [0, -1, 0]);
}

// ---- Steps and a cart ramp off a slab edge ----------------------------------------------------------------
// Steps down from a slab top `h` high, the edge at local z = 0 facing +z, `w` wide, `n` treads 0.32 deep.
export function steps(m, w, h, n = 3, hex = PCOL.concrete, nose = PCOL.trim) {
  for (let k = 0; k < n; k++) {
    const top = h - (h / n) * (k + 1), d = 0.32;
    m.box(w, top + 0.3, d, hex, 0, (top - 0.3) / 2, d * (k + 0.5));
    m.box(w, 0.025, 0.05, nose, 0, top + 0.012, d * (k + 1) - 0.03);
  }
}
// A wedge ramp down from the slab top `h` at z = 0 to the ground at z = len, `w` wide.
export function cartRamp(m, w, h, len, hex = PCOL.concrete) {
  const x0 = -w / 2, x1 = w / 2, b = -0.25;
  addFaces(m, quadT([x0, h, 0], [x1, h, 0], [x1, 0.02, len], [x0, 0.02, len]), hex, null, [0, 1, 0.3]);
  for (const x of [x0, x1]) addFaces(m, [[[x, h, 0], [x, 0.02, len], [x, b, len]], [[x, h, 0], [x, b, len], [x, b, 0]]], PCOL.concreteDk, null, [Math.sign(x), 0, 0]);
  for (let z = 0.4; z < len; z += 0.5) m.box(w - 0.1, 0.02, 0.06, PCOL.concreteDk, 0, h + (0.02 - h) * (z / len) + 0.01, z); // grooves for grip
}

// ---- The fish auction hall (TPI) ------------------------------------------------------------------------------
// Origin: the middle of the slab at the levelled ground; x along the coast (W), z out to sea (D); the slab stands
// `SL` proud. Open sides under a gable roof of corrugated sheet on steel trusses, a raised ridge vent, gutters and a
// painted fascia; a tiled selling floor with two drainage channels; tiled selling tables in two rows; the weighing
// station; an ice crusher and its heap; the office with windows, a tap and hose; tube lights under the trusses
// (glow list). Returns colliders, the edge openings, the selling places, and the tube spots.
export const HALL = { SL: 0.42, EAVE: 4.4, RISE: 1.9, COLS: [-12, -8, -4, 0, 4, 8, 12], CZ: 5.6, TABLE_Z: 4.45, DRAIN_Z: 3.3 };
export function fishHall(m, { W = 27, D = 13, openings = [] } = {}) {
  const { SL, CZ, COLS } = HALL, EAVE = SL + HALL.EAVE, RIDGE = EAVE + HALL.RISE, slope = HALL.RISE / CZ;
  const cols = [], hw = W / 2, hd = D / 2;
  // The slab: a concrete block standing proud, a lighter top skin, a painted yellow edge line and a dark plinth.
  m.box(W, SL + 0.35, D, PCOL.concrete, 0, (SL - 0.35) / 2, 0);
  m.box(W + 0.08, 0.12, D + 0.08, PCOL.concreteDk, 0, 0.0, 0);
  m.box(W - 0.02, 0.02, D - 0.02, PCOL.concreteLt, 0, SL + 0.005, 0);
  for (const s of [-1, 1]) { m.box(W - 0.3, 0.012, 0.09, PCOL.trim, 0, SL + 0.02, s * (hd - 0.12)); m.box(0.09, 0.012, D - 0.3, PCOL.trim, s * (hw - 0.12), SL + 0.02, 0); }
  // Steps and ramps at the openings: { side: 'w'|'e'|'n'|'s', at, w, kind: 'steps'|'ramp'|'none' } (n = inland, -z).
  for (const o of openings) {
    if (o.kind === 'none') continue;
    const [x, z, ry] = { w: [-hw, o.at, -Math.PI / 2], e: [hw, o.at, Math.PI / 2], s: [o.at, hd, 0], n: [o.at, -hd, Math.PI] }[o.side];
    m.push(x, 0, z, ry);
    if (o.kind === 'steps') steps(m, o.w, SL, 3); else cartRamp(m, o.w, SL, o.len || 2.4);
    m.pop();
  }
  // Edge colliders: the slab's rim, except where steps, ramps and the pier come off it.
  const edge = (side, a0, a1) => {
    const gaps = openings.filter((o) => o.side === side).map((o) => [o.at - o.w / 2, o.at + o.w / 2]).sort((p, q) => p[0] - q[0]);
    let a = a0;
    const seg = (u, v) => {
      if (v - u < 0.2) return; const c = (u + v) / 2, l = (v - u) / 2;
      if (side === 'w' || side === 'e') cols.push({ x: side === 'w' ? -hw : hw, z: c, hw: 0.12, hd: l });
      else cols.push({ x: c, z: side === 's' ? hd : -hd, hw: l, hd: 0.12 });
    };
    for (const [g0, g1] of gaps) { seg(a, g0); a = g1; }
    seg(a, a1);
  };
  edge('w', -hd, hd); edge('e', -hd, hd); edge('s', -hw, hw); edge('n', -hw, hw);

  // The tiled selling floor (1 m tiles, two tones) inside the columns, and two drainage channels with grates.
  const tiles = [[], []];
  for (let x = -12.5; x < 12.5; x += 1) for (let z = -5.5; z < 5.5; z += 1) {
    const k = (Math.round(x + 0.5) + Math.round(z + 0.5)) & 1, y = SL + 0.018;
    tiles[k].push(...quadT([x + 0.02, y, z + 0.02], [x + 0.98, y, z + 0.02], [x + 0.98, y, z + 0.98], [x + 0.02, y, z + 0.98]));
  }
  addFaces(m, tiles[0], PCOL.tileA, null, [0, 1, 0]); addFaces(m, tiles[1], PCOL.tileB, null, [0, 1, 0]);
  const grates = [];
  for (const s of [-1, 1]) {
    const z = s * HALL.DRAIN_Z, y = SL + 0.024;
    addFaces(m, quadT([-12.4, y, z - 0.17], [12.4, y, z - 0.17], [12.4, y, z + 0.17], [-12.4, y, z + 0.17]), PCOL.drain, null, [0, 1, 0]);
    for (let x = -12.3; x < 12.3; x += 0.22) grates.push(...quadT([x, y + 0.004, z - 0.15], [x + 0.06, y + 0.004, z - 0.15], [x + 0.06, y + 0.004, z + 0.15], [x, y + 0.004, z + 0.15]));
  }
  addFaces(m, grates, PCOL.grate, null, [0, 1, 0]);

  // Columns: white concrete with a blue painted foot and an orange band under the truss.
  for (const x of COLS) for (const s of [-1, 1]) {
    const z = s * CZ;
    m.box(0.36, EAVE - SL, 0.36, PCOL.white, x, SL + (EAVE - SL) / 2, z);
    m.box(0.4, 0.7, 0.4, PCOL.blue, x, SL + 0.35, z);
    m.box(0.4, 0.16, 0.4, PCOL.fascia, x, EAVE - 0.25, z);
    cols.push({ x, z, r: 0.26 });
  }
  // Steel trusses over each pair of columns, purlins along the hall.
  const roofY = (z) => RIDGE - Math.abs(z) * slope;
  for (const x of COLS) {
    m.rod([x, EAVE, -CZ], [x, EAVE, CZ], 0.06, 0.06, PCOL.steel, 5);
    for (const s of [-1, 1]) {
      m.rod([x, EAVE, s * CZ], [x, RIDGE, 0], 0.065, 0.065, PCOL.steel, 5);
      for (const f of [0.33, 0.66]) {
        const z = s * CZ * (1 - f), zn = s * CZ * (1 - f - 0.33);
        m.rod([x, EAVE, z], [x, roofY(z), z], 0.035, 0.035, PCOL.steel, 4);
        m.rod([x, EAVE, z], [x, roofY(zn), zn], 0.03, 0.03, PCOL.steel, 4);
      }
    }
    m.rod([x, EAVE, 0], [x, RIDGE, 0], 0.04, 0.04, PCOL.steel, 4);
  }
  for (const z of [-5.2, -3.9, -2.6, -1.3, 1.3, 2.6, 3.9, 5.2]) m.box(W - 0.6, 0.08, 0.06, PCOL.steelDk, 0, roofY(z) + 0.02, z);
  // The roof: two corrugated slopes from the eaves (1 m out past the columns) to the ridge vent, and the vent's
  // own little roof lifted over the gap; gutters with downpipes, a painted fascia and barge boards.
  const RX = hw - 0.1, EZ = CZ + 1.0, ey = roofY(EZ) + 0.12, gz = 0.75, gy = roofY(gz) + 0.12;
  for (const s of [-1, 1]) corrugated(m, -RX, RX, s * EZ, ey, s * gz, gy, PCOL.roof, PCOL.roofDk);
  const vy = RIDGE + 0.62, vz = 1.3, vey = vy - vz * slope;
  for (const s of [-1, 1]) corrugated(m, -RX + 0.3, RX - 0.3, s * vz, vey, 0, vy, PCOL.roofDk, PCOL.roof, { under: PCOL.roofUnder });
  for (const x of [-9, -3, 3, 9]) for (const s of [-1, 1]) m.rod([x, gy, s * 0.7], [x, vey + 0.02, s * 1.0], 0.025, 0.025, PCOL.steelDk, 4);
  for (const s of [-1, 1]) {
    m.box(2 * RX, 0.3, 0.06, PCOL.fascia, 0, ey - 0.1, s * (EZ + 0.03));
    m.box(2 * RX, 0.14, 0.2, PCOL.steelDk, 0, ey - 0.22, s * (EZ + 0.16));                  // gutter
    for (const x of [-RX + 0.15, RX - 0.15]) m.rod([x, ey - 0.25, s * (EZ + 0.16)], [x, SL + 0.05, s * (EZ + 0.16)], 0.05, 0.05, PCOL.steelDk, 5); // downpipes
    // barge boards up both gables, and a painted gable panel with a fish signboard under each
    for (const t of [-1, 1]) m.rod([s * RX, ey - 0.05, t * EZ], [s * RX, RIDGE + 0.1, 0], 0.07, 0.07, PCOL.fascia, 4);
    const gx = s * (COLS[COLS.length - 1] + 0.05);
    addFaces(m, [[[gx, EAVE + 0.05, -CZ], [gx, EAVE + 0.05, CZ], [gx, RIDGE - 0.05, 0]]], PCOL.cream, null, [s, 0, 0]);
    addFaces(m, [[[gx - s * 0.02, EAVE + 0.05, -CZ], [gx - s * 0.02, EAVE + 0.05, CZ], [gx - s * 0.02, RIDGE - 0.05, 0]]], PCOL.cream, null, [-s, 0, 0]);
    m.box(0.05, 0.22, 2 * CZ, PCOL.blue, gx, EAVE + 0.1, 0);
    signboard(m, gx + s * 0.06, EAVE + 0.75, 0, s * Math.PI / 2, 3.2, 0.9, s > 0 ? 0x2f8f9f : 0xd9463a, 0);
  }
  // Tube lights hung under the bottom chords between the trusses (the glowing tube goes to the glow list).
  const tubes = [];
  for (let i = 0; i < COLS.length - 1; i++) for (const z of [-3.0, 3.0, -0.4]) for (const f of [0.3, 0.7]) {
    if (z === -0.4 && f === 0.7) continue;
    const x = COLS[i] + (COLS[i + 1] - COLS[i]) * f, y = EAVE - 0.4;
    m.rod([x, EAVE, z], [x, y + 0.05, z], 0.008, 0.008, COL.ink, 3);
    m.box(1.3, 0.05, 0.12, PCOL.white, x, y + 0.03, z, Math.PI / 2 * 0);
    m.at(new THREE.BoxGeometry(1.2, 0.045, 0.06), 0xffffff, x, y - 0.015, z, 0, 0, 0, 1, 1, 1, true);
    tubes.push({ x, y, z });
  }

  // Selling tables: tiled tops with a blue edge, steel legs, a shelf below; ice and fish laid out on top.
  const tables = [];
  const TX = [-10.2, -6.6, -3.0, 0.6];
  for (const s of [-1, 1]) TX.forEach((x, i) => {
    const z = s * HALL.TABLE_Z, L = 3.0, T = 1.0, ty = SL + 0.82, seed = i * 3 + (s > 0 ? 1 : 7);
    m.box(L + 0.06, 0.1, T + 0.06, PCOL.blue, x, ty - 0.04, z);
    m.box(L, 0.04, T, 0xf3f6f5, x, ty + 0.02, z);
    for (const lx of [-L / 2 + 0.12, L / 2 - 0.12]) for (const lz of [-T / 2 + 0.1, T / 2 - 0.1]) m.rod([x + lx, SL, z + lz], [x + lx, ty - 0.08, z + lz], 0.03, 0.03, PCOL.steel, 4);
    m.box(L - 0.2, 0.03, T - 0.2, PCOL.steel, x, SL + 0.25, z);
    m.box(L - 0.3, 0.035, T - 0.3, COL.ice, x, ty + 0.055, z);
    const n = 9;
    for (let k = 0; k < n; k++) fish(m, x - L / 2 + 0.3 + (L - 0.6) * (k / (n - 1)), ty + 0.075, z + ((k % 3) - 1) * 0.22, 1.2 + k * 0.7 + s, 0.3 + ((seed + k) % 4) * 0.05, (seed + k) % 7);
    if (i % 2) iceBlocks(m, x + L / 2 - 0.5, SL + 0.28, z, 0, 1);
    else bucket(m, x - L / 2 + 0.35, SL + 0.28, z + 0.15, [0xe8503a, 0x3a8fd0][i % 2 ? 1 : 0]);
    cols.push({ x, z, hw: L / 2 + 0.05, hd: T / 2 + 0.05 });
    tables.push({ x, z, s, L });
  });

  // The weighing station: a steel platform scale flush with the floor, a post with its display, and a desk.
  const SC = { x: 4.4, z: 0.0 };
  m.box(1.3, 0.07, 1.3, PCOL.steelDk, SC.x, SL + 0.035, SC.z); m.box(1.2, 0.02, 1.2, 0x9aa8ae, SC.x, SL + 0.075, SC.z);
  m.rod([SC.x + 0.85, SL, SC.z - 0.5], [SC.x + 0.85, SL + 1.15, SC.z - 0.5], 0.035, 0.035, PCOL.steel, 5);
  m.box(0.34, 0.24, 0.12, PCOL.white, SC.x + 0.85, SL + 1.27, SC.z - 0.5, -0.5); m.box(0.24, 0.1, 0.02, 0x2e3a3a, SC.x + 0.82, SL + 1.29, SC.z - 0.44, -0.5);
  m.box(0.9, 0.06, 0.6, 0x8c6444, SC.x + 1.55, SL + 0.76, SC.z - 0.9); for (const lx of [-0.4, 0.4]) for (const lz of [-0.25, 0.25]) m.rod([SC.x + 1.55 + lx, SL, SC.z - 0.9 + lz], [SC.x + 1.55 + lx, SL + 0.74, SC.z - 0.9 + lz], 0.025, 0.025, PCOL.steelDk, 4);
  m.box(0.3, 0.02, 0.22, COL.cream, SC.x + 1.5, SL + 0.8, SC.z - 0.92, 0.2);
  cols.push({ x: SC.x + 1.55, z: SC.z - 0.9, hw: 0.48, hd: 0.33 }, { x: SC.x + 0.85, z: SC.z - 0.5, r: 0.1 });

  // The ice corner: a crusher on legs with its hopper and chute, a heap of crushed ice, blocks waiting.
  const IC = { x: 10.6, z: 1.5 };
  m.push(IC.x, SL, IC.z, 0.15);
  for (const lx of [-0.4, 0.4]) for (const lz of [-0.3, 0.3]) m.rod([lx, 0, lz], [lx, 0.55, lz], 0.035, 0.035, PCOL.steelDk, 4);
  m.box(1.0, 0.75, 0.8, 0x3f9f6a, 0, 0.92, 0); m.box(1.04, 0.08, 0.84, PCOL.trim, 0, 1.3, 0);
  m.at(new THREE.CylinderGeometry(0.62, 0.32, 0.55, 4, 1), PCOL.steel, 0, 1.6, 0, 0, Math.PI / 4, 0);
  m.box(0.4, 0.06, 0.9, PCOL.steel, -0.75, 0.62, 0, 0, 0, 0.6); m.box(0.2, 0.25, 0.18, 0x2e3a3a, 0.5, 0.95, 0.42);
  m.pop();
  m.at(new THREE.DodecahedronGeometry(0.75, 1), COL.ice, IC.x - 1.45, SL + 0.05, IC.z + 0.05, 0, 0.4, 0, 1.0, 0.42, 0.85);
  m.at(new THREE.DodecahedronGeometry(0.45, 1), 0xd4eef2, IC.x - 2.1, SL + 0.02, IC.z + 0.55, 0, 1.1, 0, 1.0, 0.35, 0.9);
  iceBlocks(m, IC.x + 1.0, SL, IC.z + 1.0, 0.1, 3);
  m.rod([IC.x - 2.3, SL, IC.z - 0.6], [IC.x - 1.75, SL + 1.0, IC.z - 0.35], 0.022, 0.022, COL.woodDk, 4); m.box(0.24, 0.3, 0.03, PCOL.steel, IC.x - 2.3, SL + 0.15, IC.z - 0.6, 0.3); // a shovel
  cols.push({ x: IC.x, z: IC.z, r: 0.65 }, { x: IC.x - 1.5, z: IC.z + 0.1, r: 0.6 });

  // The office: a small room in the east inland corner, cream walls with a blue dado, windows on two sides, a door,
  // a flat concrete roof with an orange edge, a sign shape; a tap with a coiled hose on its west wall.
  const OF = { x0: 8.4, x1: 11.6, z0: -5.3, z1: -1.9, h: 2.7 };
  {
    const { x0, x1, z0, z1, h } = OF, t = 0.14, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, wx = x1 - x0, wz = z1 - z0, y0 = SL;
    const wall = (len, x, z, ry, win, door) => {
      m.push(x, y0, z, ry);
      // pieces of wall round a window (0.9 .. 1.9 m high) and a door (0 .. 2.05 m), all along local x
      const holes = []; if (win) holes.push([win[0], win[1], 0.95, 1.95]); if (door) holes.push([door[0], door[1], 0, 2.05]);
      const xs = [-len / 2, ...holes.flatMap((hh) => [hh[0], hh[1]]), len / 2].sort((a, b) => a - b);
      for (let i = 0; i < xs.length - 1; i++) {
        const a = xs[i], b = xs[i + 1], c = (a + b) / 2, wd = b - a; if (wd < 0.01) continue;
        const hole = holes.find((hh) => hh[0] <= a + 1e-6 && hh[1] >= b - 1e-6);
        if (!hole) { m.box(wd, h, t, PCOL.cream, c, h / 2, 0); m.box(wd + 0.004, 1.0, t + 0.02, PCOL.blue, c, 0.5, 0); continue; }
        if (hole[2] > 0) { m.box(wd, hole[2], t, PCOL.cream, c, hole[2] / 2, 0); m.box(wd + 0.004, Math.min(1.0, hole[2]), t + 0.02, PCOL.blue, c, Math.min(1.0, hole[2]) / 2, 0); }
        m.box(wd, h - hole[3], t, PCOL.cream, c, (h + hole[3]) / 2, 0);
        if (hole[2] > 0) { m.box(wd, hole[3] - hole[2], 0.03, PCOL.glass, c, (hole[2] + hole[3]) / 2, 0); m.box(0.05, hole[3] - hole[2], t + 0.03, PCOL.white, c, (hole[2] + hole[3]) / 2, 0); m.box(wd, 0.06, t + 0.08, PCOL.white, c, hole[2] - 0.02, 0.02); }
        else m.box(wd - 0.06, hole[3] - 0.02, 0.05, 0x3f7f6a, c, hole[3] / 2, 0.02);
      }
      m.pop();
    };
    wall(wx, cx, z1, 0, [-1.1, 0.7], null);               // seaward face, a wide window
    wall(wz, x0, cz, -Math.PI / 2, [0.3, 1.3], [-1.3, -0.45]); // west face: a door and a window
    wall(wx, cx, z0, Math.PI, null, null);
    wall(wz, x1, cz, Math.PI / 2, [-0.6, 0.6], null);
    m.box(wx + 0.4, 0.16, wz + 0.4, PCOL.concrete, cx, y0 + h + 0.08, cz); m.box(wx + 0.44, 0.1, wz + 0.44, PCOL.fascia, cx, y0 + h + 0.05, cz);
    signboard(m, cx, y0 + h + 0.55, z1 + 0.15, 0, 2.2, 0.55, 0x3f9f6a, 0);
    for (const lx of [-0.9, 0.9]) m.rod([cx + lx, y0 + h + 0.16, z1 + 0.15], [cx + lx, y0 + h + 0.3, z1 + 0.15], 0.025, 0.025, PCOL.steelDk, 4);
    // the tap and the hose on the west wall, a bucket under it
    const tx = x0 - 0.1, tz = z1 - 0.75;
    m.rod([tx, y0, tz], [tx, y0 + 0.9, tz], 0.03, 0.03, PCOL.steelDk, 5); m.rod([tx, y0 + 0.9, tz], [tx - 0.18, y0 + 0.9, tz], 0.025, 0.025, PCOL.steelDk, 4);
    m.box(0.06, 0.04, 0.14, 0xd9463a, tx - 0.1, y0 + 0.97, tz);
    for (let k = 0; k < 4; k++) m.at(new THREE.TorusGeometry(0.22 - k * 0.012, 0.022, 4, 12), 0x3f9f6a, tx - 0.06, y0 + 0.62, tz + 0.5 + k * 0.012, 0, Math.PI / 2, 0);
    m.bend([[tx - 0.18, y0 + 0.88, tz], [tx - 0.24, y0 + 0.4, tz + 0.2], [tx - 0.5, y0 + 0.03, tz + 0.7], [tx - 1.6, y0 + 0.03, tz + 0.9]], 0.022, 0x3f9f6a, 4);
    bucket(m, tx - 0.3, y0, tz - 0.2, 0x3a8fd0);
    cols.push({ x: cx, z: cz, hw: wx / 2 + 0.1, hd: wz / 2 + 0.1 });
  }

  // A blue tarp shade off the seaward eave over the apron by the pier ramp.
  const tarp = (x0, x1, z0, y0, z1, y1, hex) => { addFaces(m, quadT([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1]), hex, null, [0, 1, 0]); addFaces(m, quadT([x0, y0 - 0.01, z0], [x1, y0 - 0.01, z0], [x1, y1 - 0.01, z1], [x0, y1 - 0.01, z1]), new THREE.Color(hex).multiplyScalar(0.8).getHex(), null, [0, -1, 0]); };
  tarp(2.9, 10.1, EZ - 0.2, ey - 0.35, hd + 1.6, SL + 2.6, 0x2f7fc9);
  for (const x of [3.0, 10.0]) m.rod([x, -0.6, hd + 1.6], [x, SL + 2.65, hd + 1.6], 0.04, 0.04, COL.woodDk, 5);
  cols.push({ x: 3.0, z: hd + 1.6, r: 0.08 }, { x: 10.0, z: hd + 1.6, r: 0.08 });

  return { colliders: cols, tubes, tables, scale: SC, ice: IC, office: OF, top: SL, roofY, eave: EAVE };
}

// ---- Boat hulls ---------------------------------------------------------------------------------------------
// A hull from rings: `L` long (bow +z), beam `B`, keel `keel` (below the waterline, y = 0), deck `deck` at mid with
// sheer `fore`/`aft`, a bulwark `bw` high, a transom stern. Paint bands: bottom (antifouling) below the waterline, a
// boot top band at it, the topsides, a sheer stripe; the deck inside. Returns the deck height function.
export function hull(m, { L = 10, B = 3, keel = -0.8, deck = 0.6, fore = 0.5, aft = 0.2, bw = 0.4, transom = 0.8, bowRise = 0.6,
  bottom = 0xb8453a, boot = 0x2a2a2e, top = 0x2f6fb0, stripe = PCOL.white, deckHex = 0xb98a5e, inner = null, N = 14 } = {}) {
  const halfW = (t) => (B / 2) * (t < 0.62 ? transom + (1 - transom) * Math.min(1, t / 0.22) : Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.38) ** 2)));
  const keelY = (t) => keel + (t > 0.62 ? bowRise * ((t - 0.62) / 0.38) ** 2 : 0) + (t < 0.08 ? (0.08 - t) * 2.5 * (-keel) * 0.25 : 0);
  const deckY = (t) => deck + (t > 0.45 ? fore * ((t - 0.45) / 0.55) ** 2 : aft * ((0.45 - t) / 0.45) ** 2);
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -L / 2 + L * t, w = Math.max(0.001, halfW(t)), k = keelY(t), g = deckY(t);
    const lv = [k, k + 0.06, Math.min(-0.04, k + 0.55 * (-0.04 - k)), -0.04, Math.min(g - 0.12, 0.2), Math.max(Math.min(g - 0.12, 0.2) + 0.02, g - 0.16), g + bw];
    for (let j = 1; j < lv.length; j++) lv[j] = Math.max(lv[j], lv[j - 1] + 0.005);
    const xf = [0, 0.55, 0.9, 0.98, 1, 1, 1.0];
    rings.push({ z, w, g, pts: lv.map((y, j) => [w * xf[j], y, z]) });
  }
  const bandHex = [bottom, bottom, bottom, boot, top, stripe];
  const away = (cx, cy, cz) => [cx, cy + 0.3, 0];
  for (let j = 0; j < 6; j++) {
    const tr = [];
    for (let i = 0; i < N; i++) for (const s of [-1, 1]) {
      const p = (r, jj) => [s * rings[r].pts[jj][0], rings[r].pts[jj][1], rings[r].pts[jj][2]];
      tr.push(...quadT(p(i, j), p(i, j + 1), p(i + 1, j + 1), p(i + 1, j)));
    }
    addFaces(m, tr, bandHex[j], away);
  }
  // the bulwark's inside, its white cap, and the deck
  const inn = [], dk = [], ins = 0.1;
  for (let i = 0; i < N; i++) for (const s of [-1, 1]) {
    const a = rings[i], b = rings[i + 1], wa = Math.max(0, a.w - ins), wb = Math.max(0, b.w - ins);
    inn.push(...quadT([s * wa, a.g, a.z], [s * wa, a.g + bw, a.z], [s * wb, b.g + bw, b.z], [s * wb, b.g, b.z]));
    m.rod([s * a.w, a.g + bw, a.z], [s * b.w, b.g + bw, b.z], 0.05, 0.05, stripe, 4);
  }
  addFaces(m, inn, inner || stripe, (cx, cy, cz) => [-cx, 0, 0]);
  for (let i = 0; i < N; i++) { const a = rings[i], b = rings[i + 1], wa = Math.max(0, a.w - ins), wb = Math.max(0, b.w - ins); dk.push(...quadT([-wa, a.g, a.z], [wa, a.g, a.z], [wb, b.g, b.z], [-wb, b.g, b.z])); }
  addFaces(m, dk, deckHex, null, [0, 1, 0]);
  // the transom
  const r0 = rings[0], tt = [];
  for (let j = 0; j < 6; j++) { const a = r0.pts[j], b = r0.pts[j + 1]; tt.push(...quadT([-a[0], a[1], a[2]], [a[0], a[1], a[2]], [b[0], b[1], b[2]], [-b[0], b[1], b[2]])); }
  addFaces(m, tt.slice(0, 6), bottom, null, [0, 0, -1]); addFaces(m, tt.slice(6, 8), boot, null, [0, 0, -1]); addFaces(m, tt.slice(8, 10), top, null, [0, 0, -1]); addFaces(m, tt.slice(10), stripe, null, [0, 0, -1]);
  return { deckAt: (z) => deckY((z + L / 2) / L), halfAt: (z) => halfW((z + L / 2) / L), L, B };
}

// A box cabin with a band of windows on every side and a roof with an overhang, standing on y = 0 at (x, z).
function cabin(m, x, z, w, d, h, { wall = PCOL.white, band = PCOL.glass, roof = PCOL.white, trim = PCOL.blue, winY = 0.6, winH = 0.55 } = {}) {
  m.box(w, h, d, wall, x, h / 2, z);
  m.box(w + 0.02, winH, d + 0.02, band, x, h * winY + winH / 2 - 0.1, z);
  for (let k = 1; k < 4; k++) m.box(0.06, winH + 0.01, d + 0.04, wall, x - w / 2 + (w * k) / 4, h * winY + winH / 2 - 0.1, z);
  for (let k = 1; k < 3; k++) m.box(w + 0.04, winH + 0.01, 0.06, wall, x, h * winY + winH / 2 - 0.1, z - d / 2 + (d * k) / 3);
  m.box(w + 0.3, 0.1, d + 0.3, roof, x, h + 0.05, z); m.box(w + 0.32, 0.06, d + 0.32, trim, x, h - 0.01, z);
}

// ---- The fish carrier ship -----------------------------------------------------------------------------------
// About 23 m long, origin at the waterline amidships, bow +z: navy topsides over a red bottom with a black boot top,
// a white sheer stripe; the wheelhouse aft (two tiers, a band of windows), a funnel, a mast with a radar, a GPS dome
// and lights; a deck crane by the hatches; two insulated containers and stacks of crates on deck; rails, lifebuoys,
// an anchor each side of the bow and a flag at the stern. `glow` gets the mast and deck lights.
export const SHIP = { L: 23, B: 5.4, draft: 1.5, deck: 1.15 };
export function fishCarrier(m) {
  const h = hull(m, { L: SHIP.L, B: SHIP.B, keel: -SHIP.draft, deck: SHIP.deck, fore: 0.75, aft: 0.25, bw: 0.75, transom: 0.86, bowRise: 0.9, bottom: 0xa8453a, top: 0x2b5a92, stripe: PCOL.white, deckHex: 0x7d8f86, inner: 0xe9e4d6, N: 18 });
  const dy = (z) => h.deckAt(z);
  // wheelhouse aft: a lower deckhouse and the bridge on it, both white with a window band, a funnel behind
  const wz = -7.2, d0 = dy(wz);
  m.push(0, d0, 0);
  cabin(m, 0, wz, 4.2, 4.0, 2.1, { winY: 0.45, winH: 0.45 });
  m.push(0, 2.2, 0); cabin(m, 0, wz + 0.3, 3.6, 2.8, 1.7, { winY: 0.42, winH: 0.65, trim: 0xd9463a }); m.pop();
  for (const s of [-1, 1]) { m.at(new THREE.TorusGeometry(0.3, 0.07, 5, 10), 0xf2703a, s * 2.13, 1.25, wz + 0.6, 0, Math.PI / 2, 0); m.box(0.05, 0.08, 0.14, PCOL.white, s * 2.16, 1.25, wz + 0.6); }
  m.box(0.7, 1.5, 0.7, 0x2e2c2c, 0, 2.9, wz - 1.6); m.box(0.74, 0.35, 0.74, 0xd9463a, 0, 3.3, wz - 1.6); m.box(0.74, 0.12, 0.74, 0x2e2c2c, 0, 3.66, wz - 1.6);
  // the mast on the bridge roof: a yard, the radar bar, a GPS dome, an antenna, and lights
  const my = 4.15, mz = wz + 0.4;
  m.rod([0, my, mz], [0, my + 3.0, mz], 0.06, 0.04, PCOL.white, 6); m.rod([-1.0, my + 2.0, mz], [1.0, my + 2.0, mz], 0.035, 0.035, PCOL.white, 4);
  m.cyl(0.12, 0.12, 0.25, PCOL.steelDk, 0, my + 1.35, mz + 0.4, 6); m.box(1.6, 0.09, 0.16, PCOL.white, 0, my + 1.55, mz + 0.4);
  m.sph(0.22, PCOL.white, 0.8, my + 0.25, mz - 0.6, 1, 0.8, 1, 8, 5); m.rod([0.8, my, mz - 0.6], [0.8, my + 0.1, mz - 0.6], 0.04, 0.04, PCOL.steelDk, 4);
  m.rod([-0.9, my, mz - 0.5], [-0.9, my + 2.4, mz - 0.5], 0.015, 0.008, COL.ink, 3);
  m.glowBall(0.09, 0, my + 3.05, mz); m.glowBall(0.07, -1.0, my + 1.95, mz); m.glowBall(0.07, 1.0, my + 1.95, mz);
  m.pop();
  // hatches amidships, and the crane: a yellow post, a boom reaching forward over them, its wire and hook
  for (const [z, len] of [[-1.6, 3.0], [2.4, 3.2]]) { const y = dy(z); m.box(2.6, 0.5, len, 0x5f8f6a, 0, y + 0.25, z); m.box(2.7, 0.1, len + 0.1, 0x3f6f4a, 0, y + 0.52, z); for (let k = 1; k < 4; k++) m.box(2.72, 0.04, 0.06, 0x2f5f3a, 0, y + 0.58, z - len / 2 + (len * k) / 4); }
  const cz = 0.4, cy = dy(cz);
  m.cyl(0.22, 0.26, 4.0, PCOL.trim, 1.7, cy + 2.0, cz, 8); m.box(0.6, 0.5, 0.6, PCOL.trim, 1.7, cy + 1.0, cz);
  m.rod([1.7, cy + 1.6, cz], [0.3, cy + 5.0, cz + 4.5], 0.11, 0.07, PCOL.trim, 6);
  m.rod([1.7, cy + 4.0, cz], [0.3, cy + 5.0, cz + 4.5], 0.02, 0.02, COL.ink, 3);
  m.rod([0.3, cy + 4.95, cz + 4.5], [0.3, cy + 2.2, cz + 4.5], 0.012, 0.012, COL.ink, 3); m.box(0.18, 0.22, 0.1, 0xd9463a, 0.3, cy + 2.1, cz + 4.5);
  // cargo: two insulated containers on the foredeck, crate stacks by the hatches
  for (const [x, z] of [[-1.25, 6.6], [1.25, 6.6]]) { const y = dy(z); m.box(2.2, 2.0, 2.8, PCOL.white, x, y + 1.0, z); for (let k = 0; k < 5; k++) m.box(2.24, 1.9, 0.06, 0xd8dcd8, x, y + 1.0, z - 1.2 + k * 0.6); m.box(0.5, 0.4, 0.06, 0x3f86c0, x, y + 1.5, z + 1.42); }
  const crateHex = [0x2f6fc0, 0xd9463a, 0x2f6fc0, 0x3f9f6a];
  let k = 0;
  for (const [x0, z0] of [[-1.9, 4.2], [1.3, -4.6], [-1.9, -4.6]]) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 3 - ((a + b) % 2); c++) {
    const x = x0 + a * 0.6, z = z0 + b * 0.42, y = dy(z) + c * 0.29;
    const col = crateHex[(k++) % 4]; m.box(0.58, 0.27, 0.4, col, x, y + 0.14, z); m.box(0.6, 0.03, 0.42, new THREE.Color(col).multiplyScalar(0.8).getHex(), x, y + 0.27, z);
  }
  // rails along the bulwark aft of the bow, the anchors and the flag
  for (const s of [-1, 1]) { const zs = [-10.5, -6, -2, 2, 6, 9]; zs.forEach((z) => m.rod([s * (h.halfAt(z) - 0.08), dy(z) + 0.75, z], [s * (h.halfAt(z) - 0.08), dy(z) + 1.25, z], 0.03, 0.03, PCOL.white, 4)); for (let i = 0; i < zs.length - 1; i++) m.rod([s * (h.halfAt(zs[i]) - 0.08), dy(zs[i]) + 1.25, zs[i]], [s * (h.halfAt(zs[i + 1]) - 0.08), dy(zs[i + 1]) + 1.25, zs[i + 1]], 0.025, 0.025, PCOL.white, 4); }
  for (const s of [-1, 1]) { m.box(0.08, 0.5, 0.35, 0x2e2c2c, s * (h.halfAt(9.6) + 0.02), dy(9.6) - 0.35, 9.6); }
  m.rod([0, dy(-11.2) + 0.7, -11.2], [0, dy(-11.2) + 3.0, -11.2], 0.03, 0.025, PCOL.white, 4);
  m.box(0.02, 0.3, 0.8, 0xd9463a, 0, dy(-11.2) + 2.8, -11.6); m.box(0.02, 0.3, 0.8, PCOL.white, 0, dy(-11.2) + 2.5, -11.6);
  // deck lights on the crane post and the wheelhouse front
  m.glowBall(0.08, 1.7, cy + 4.1, cz + 0.25); m.glowBall(0.07, 0, dy(wz) + 2.25, wz + 2.05);
  return { colliders: [{ x: 0, z: 0.2, hw: SHIP.B / 2 - 0.15, hd: SHIP.L / 2 - 0.6 }, { x: 0, z: SHIP.L / 2 - 0.3, r: 0.6 }] };
}

// ---- Kapal motor: a wooden (or steel) motor fishing boat with a wheelhouse aft --------------------------------
// About 11 m, origin at the waterline; painted hull, a wheelhouse with windows, a mast with a radar dome and antennas,
// LED fishing-lamp rigs on poles along both sides (the bulbs glow at night), a net hauler forward, coolers, blue drums
// and jerrycans. `steel`: a grey-blue steel hull with an orange wheelhouse instead.
export const KAPAL = { L: 11, B: 3.4, draft: 0.75, deck: 0.62 };
export function kapalMotor(m, { variant = 0, steel = false } = {}) {
  const pal = steel ? { bottom: 0xa8453a, top: 0x6f8a9a, stripe: 0xf3f1ea, deckHex: 0x7f8a84, house: 0xe8803a, roof: PCOL.white }
    : [{ bottom: 0xb8453a, top: 0x3f9f6a, stripe: 0xf2c03b, deckHex: 0xb98a5e, house: 0x3f86c0, roof: PCOL.white },
       { bottom: 0x2f6fb0, top: 0xf3f1ea, stripe: 0xd9463a, deckHex: 0xb98a5e, house: 0x3fb0b0, roof: 0xf2c03b }][variant % 2];
  const h = hull(m, { L: KAPAL.L, B: KAPAL.B, keel: -KAPAL.draft, deck: KAPAL.deck, fore: 0.55, aft: 0.15, bw: 0.35, transom: 0.8, bowRise: 0.55, bottom: pal.bottom, top: pal.top, stripe: pal.stripe, deckHex: pal.deckHex, inner: pal.stripe, N: 14 });
  const dy = (z) => h.deckAt(z);
  // wheelhouse aft
  const wz = -3.2;
  m.push(0, dy(wz), 0); cabin(m, 0, wz, 2.3, 2.2, 1.9, { wall: pal.house, band: PCOL.glass, roof: pal.roof, trim: PCOL.white, winY: 0.5, winH: 0.5 }); m.pop();
  const top = dy(wz) + 2.0;
  // the mast, the radar dome and the antennas
  m.rod([0, top, wz + 0.4], [0, top + 2.4, wz + 0.4], 0.05, 0.035, PCOL.white, 5);
  m.cyl(0.32, 0.32, 0.18, PCOL.white, 0, top + 1.3, wz + 0.4, 10); m.sph(0.32, PCOL.white, 0, top + 1.39, wz + 0.4, 1, 0.35, 1, 10, 4);
  m.rod([0.7, top, wz - 0.6], [0.75, top + 2.2, wz - 0.6], 0.015, 0.008, COL.ink, 3); m.rod([-0.7, top, wz - 0.6], [-0.72, top + 1.6, wz - 0.6], 0.015, 0.008, COL.ink, 3);
  m.sph(0.14, PCOL.white, -0.6, top + 0.12, wz + 0.6, 1, 0.8, 1, 7, 4);
  m.box(0.05, 0.3, 0.45, 0xd9463a, 0.02, top + 2.25, wz + 0.15); m.box(0.05, 0.3, 0.45, PCOL.white, 0.02, top + 1.95, wz + 0.15);
  // LED fishing-lamp rigs: a pole along each side on short arms, a bulb every half metre (into the glow list)
  for (const s of [-1, 1]) {
    const x = s * (KAPAL.B / 2 + 0.25), y = dy(0) + 1.9;
    m.rod([x, y, -4.3], [x, y + 0.15, 3.6], 0.035, 0.035, PCOL.steel, 5);
    for (const z of [-3.5, 0, 3.0]) m.rod([s * (h.halfAt(z) - 0.1), dy(z) + 0.35, z], [x, y + 0.04 + 0.02 * (z + 4) / 8, z], 0.03, 0.03, PCOL.steel, 4);
    for (let z = -4.0; z <= 3.4; z += 0.5) { const yy = y - 0.12 + 0.15 * (z + 4.3) / 7.9; m.box(0.08, 0.08, 0.12, PCOL.white, x, yy + 0.07, z); m.at(new THREE.SphereGeometry(0.07, 6, 4), 0xffffff, x, yy - 0.02, z, 0, 0, 0, 1, 1, 1, true); }
  }
  // the net hauler forward: a drum on a frame; a heap of net; coolers, two blue drums and jerrycans on deck
  const nz = 2.6, ny = dy(nz);
  m.box(0.12, 0.7, 0.6, PCOL.steelDk, -0.5, ny + 0.35, nz); m.box(0.12, 0.7, 0.6, PCOL.steelDk, 0.5, ny + 0.35, nz);
  m.cyl(0.28, 0.28, 0.9, 0x3f9f6a, 0, ny + 0.62, nz, 10, 0, Math.PI / 2); m.cyl(0.36, 0.36, 0.05, PCOL.trim, -0.42, ny + 0.62, nz, 10, 0, Math.PI / 2); m.cyl(0.36, 0.36, 0.05, PCOL.trim, 0.42, ny + 0.62, nz, 10, 0, Math.PI / 2);
  m.sph(0.6, COL.net, 0.3, dy(0.8) + 0.12, 0.8, 1.2, 0.35, 1.0, 8, 4); for (let k = 0; k < 6; k++) m.sph(0.06, k % 2 ? 0xf2873a : 0xf2d03b, 0.3 + Math.cos(k) * 0.5, dy(0.8) + 0.3, 0.8 + Math.sin(k) * 0.5);
  m.box(1.0, 0.55, 0.6, 0xf2873a, 0.6, dy(-0.9) + 0.28, -0.9); m.box(1.02, 0.08, 0.62, PCOL.white, 0.6, dy(-0.9) + 0.57, -0.9);
  m.box(0.9, 0.5, 0.55, 0x3a8fd0, -0.65, dy(-1.0) + 0.25, -1.0);
  for (const [x, z] of [[-0.9, -5.0], [-0.3, -5.1]]) { m.cyl(0.24, 0.24, 0.75, PCOL.drum, x, dy(z) + 0.38, z, 10); m.cyl(0.245, 0.245, 0.04, 0x255a9a, x, dy(z) + 0.6, z, 10); }
  jerryCan(m, 0.6, dy(-5.0), -5.0, 0.3, 0xd9463a); jerryCan(m, 0.95, dy(-5.0), -4.9, -0.2, 0xe8b03a);
  // the stern light and a deck lamp under the wheelhouse roof
  m.glowBall(0.06, 0, dy(-5.4) + 1.0, -5.4); m.glowBall(0.06, 0, top - 0.05, wz + 1.25);
  m.rod([0, dy(-5.4) + 0.35, -5.4], [0, dy(-5.4) + 0.95, -5.4], 0.02, 0.02, PCOL.white, 3);
  return { colliders: [{ x: 0, z: 0, hw: KAPAL.B / 2 + 0.2, hd: KAPAL.L / 2 - 0.4 }, { x: -(KAPAL.B / 2 + 0.25), z: -0.3, hw: 0.08, hd: 3.9 }, { x: KAPAL.B / 2 + 0.25, z: -0.3, hw: 0.08, hd: 3.9 }] };
}

// ---- A fibreglass outboard boat ---------------------------------------------------------------------------------
// About 6.8 m, origin at the waterline: a white hull with a coloured sheer stripe and boot band, an outboard motor on
// the transom, a centre console with a little windscreen, a GPS dome and an antenna, a cooler, a blue drum and
// jerrycans; `canopy` adds a frame with a blue tarp roof.
export const FIBRE = { L: 6.8, B: 1.9, draft: 0.35, deck: 0.42 };
export function fibreBoat(m, { colour = 0, canopy = false } = {}) {
  const st = [0x2f6fb0, 0xe8703a, 0x3f9f6a, 0xd9463a][colour % 4];
  const h = hull(m, { L: FIBRE.L, B: FIBRE.B, keel: -FIBRE.draft, deck: FIBRE.deck, fore: 0.32, aft: 0.05, bw: 0.12, transom: 0.86, bowRise: 0.3, bottom: PCOL.white, boot: st, top: PCOL.white, stripe: st, deckHex: 0xe4e2da, inner: PCOL.white, N: 12 });
  const dy = (z) => h.deckAt(z);
  // the outboard on the transom: a dark cowling, a grey leg down into the water, a skeg and a propeller
  const tz = -FIBRE.L / 2 - 0.15, ty = dy(-FIBRE.L / 2) + 0.12;
  m.box(0.42, 0.55, 0.55, 0x2e2c2c, 0, ty + 0.3, tz - 0.12); m.box(0.44, 0.08, 0.57, PCOL.white, 0, ty + 0.4, tz - 0.12);
  m.box(0.14, 0.75, 0.2, 0x5a5a5e, 0, ty - 0.35, tz - 0.1); m.box(0.2, 0.12, 0.34, 0x5a5a5e, 0, ty - 0.72, tz - 0.12);
  m.rod([0, ty - 0.68, tz - 0.32], [0, ty - 0.68, tz - 0.42], 0.06, 0.06, 0x7a7a7e, 6);
  m.rod([0, ty + 0.25, tz + 0.15], [0, dy(-2.6) + 0.5, -2.6], 0.02, 0.02, 0x7a7a7e, 3); // the tiller cable
  // the console amidships
  const cz = -0.6, cy = dy(cz);
  m.box(0.65, 0.85, 0.55, PCOL.white, 0, cy + 0.42, cz); m.box(0.67, 0.05, 0.57, st, 0, cy + 0.84, cz);
  m.box(0.6, 0.32, 0.03, 0x8fb4c8, 0, cy + 1.02, cz + 0.22, 0, -0.35); m.cyl(0.12, 0.12, 0.03, 0x2e2c2c, 0, cy + 0.88, cz - 0.05, 8, 0.6);
  m.rod([0.2, cy + 0.85, cz - 0.15], [0.2, cy + 1.25, cz - 0.15], 0.025, 0.025, PCOL.white, 4); m.sph(0.13, PCOL.white, 0.2, cy + 1.3, cz - 0.15, 1, 0.8, 1, 7, 4);
  m.rod([-0.25, cy + 0.85, cz - 0.2], [-0.27, cy + 2.5, cz - 0.25], 0.012, 0.006, COL.ink, 3);
  // a cooler forward, a blue drum and jerrycans aft, a coil of rope on the bow
  m.box(0.8, 0.42, 0.45, 0xf2c03b, 0, dy(1.1) + 0.21, 1.1); m.box(0.82, 0.06, 0.47, PCOL.white, 0, dy(1.1) + 0.44, 1.1);
  m.cyl(0.22, 0.22, 0.65, PCOL.drum, -0.42, dy(-2.3) + 0.33, -2.3, 10); m.cyl(0.225, 0.225, 0.04, 0x255a9a, -0.42, dy(-2.3) + 0.55, -2.3, 10);
  jerryCan(m, 0.35, dy(-2.6), -2.6, 0.2, 0xd9463a); jerryCan(m, 0.42, dy(-2.2), -2.15, -0.1, 0xe8b03a);
  ropeCoil(m, 0, dy(2.6), 2.6, 0.18);
  if (canopy) {
    const y = cy + 1.75;
    for (const x of [-0.75, 0.75]) for (const z of [-2.4, 0.2]) m.rod([x, dy(z) + 0.1, z], [x * 0.95, y, z], 0.022, 0.022, PCOL.steel, 4);
    m.box(1.7, 0.04, 2.9, 0x2f7fc9, 0, y + 0.02, -1.1); m.box(1.72, 0.12, 2.92, 0x2668ac, 0, y - 0.04, -1.1);
  }
  return { colliders: [{ x: 0, z: 0, hw: FIBRE.B / 2, hd: FIBRE.L / 2 }] };
}

// ---- Bits of the port ------------------------------------------------------------------------------------------
// Instanced prototypes: a bollard, a tyre fender (hangs in its local xy plane, facing +z), a blue plastic drum, a
// styrofoam fish box, an insulated cool box (tinted per instance), a jerrycan.
export function bollard(m) { m.cyl(0.17, 0.2, 0.42, 0x3a3f44, 0, 0.21, 0, 9); m.cyl(0.26, 0.26, 0.08, 0x3a3f44, 0, 0.46, 0, 9); m.cyl(0.21, 0.21, 0.04, PCOL.trim, 0, 0.12, 0, 9); }
export function tyre(m) { m.at(new THREE.TorusGeometry(0.34, 0.13, 6, 10), PCOL.tyre, 0, 0, 0); m.rod([0, 0.42, 0.05], [0, 0.9, 0.0], 0.015, 0.015, COL.rope, 3); }
export function drum(m) { m.cyl(0.29, 0.29, 0.88, 0xffffff, 0, 0.44, 0, 12); for (const y of [0.3, 0.6]) m.cyl(0.3, 0.3, 0.05, 0xcfd6dc, 0, y, 0, 12); m.cyl(0.25, 0.25, 0.02, 0xd8dde2, 0, 0.885, 0, 12); m.cyl(0.04, 0.04, 0.03, 0xf2f2f2, 0.14, 0.9, 0.05, 5); }
export function styroBox(m) { m.box(0.62, 0.34, 0.42, 0xf6f6f2, 0, 0.17, 0); m.box(0.64, 0.05, 0.44, 0xeceee8, 0, 0.355, 0); m.box(0.5, 0.02, 0.012, 0x3f86c0, 0, 0.22, 0.212); }
export function coolBox(m) { m.box(1.1, 0.7, 0.75, 0xffffff, 0, 0.36, 0); m.box(1.14, 0.08, 0.79, 0xe8ecee, 0, 0.73, 0); for (const s of [-1, 1]) m.box(0.06, 0.08, 0.3, 0x3a3f44, s * 0.58, 0.55, 0); m.box(1.12, 0.06, 0.77, 0x3a3f44, 0, 0.03, 0); }

// A flat hand trolley with four small wheels and a push handle, loaded with crates of fish (merged with it).
export function handCart(m, hex = 0x2f6fc0) {
  m.box(1.3, 0.06, 0.8, PCOL.steelDk, 0, 0.22, 0);
  for (const x of [-0.5, 0.5]) for (const z of [-0.32, 0.32]) { m.cyl(0.1, 0.1, 0.06, 0x2e2c2c, x, 0.1, z, 8, 0, Math.PI / 2); m.rod([x, 0.12, z], [x, 0.2, z], 0.02, 0.02, PCOL.steelDk, 3); }
  m.rod([-0.65, 0.22, -0.35], [-0.75, 1.0, -0.35], 0.02, 0.02, PCOL.steel, 4); m.rod([-0.65, 0.22, 0.35], [-0.75, 1.0, 0.35], 0.02, 0.02, PCOL.steel, 4); m.rod([-0.75, 1.0, -0.35], [-0.75, 1.0, 0.35], 0.025, 0.025, 0x2e2c2c, 4);
  for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
    const x = -0.3 + a * 0.6, y = 0.25 + c * 0.29, col = (a + c) % 2 ? hex : 0xd9463a;
    m.box(0.58, 0.04, 0.4, col, x, y + 0.02, 0); for (const s of [-1, 1]) { m.box(0.58, 0.24, 0.03, col, x, y + 0.14, s * 0.19); m.box(0.03, 0.24, 0.4, col, x + s * 0.28, y + 0.14, 0); }
    if (c === 1) for (let k = 0; k < 4; k++) fish(m, x - 0.18 + k * 0.12, y + 0.22, ((k % 2) - 0.5) * 0.12, 1.4 + k, 0.28, (a * 3 + k) % 7);
  }
}

// A small truck (a light diesel pickup with a wooden cargo box), front +z, wheels on y = 0: a yellow cab with a white
// roof, a blue-painted plank box loaded with styrofoam fish boxes under a tarp corner.
export function smallTruck(m) {
  const W = 1.75;
  for (const z of [1.55, -1.3]) for (const s of [-1, 1]) { m.cyl(0.34, 0.34, 0.22, 0x2e2c2c, s * 0.78, 0.34, z, 10, 0, Math.PI / 2); m.cyl(0.18, 0.18, 0.24, 0xbfc4c4, s * 0.78, 0.34, z, 8, 0, Math.PI / 2); }
  m.box(W - 0.1, 0.25, 4.6, 0x3a3f44, 0, 0.55, 0.0);
  // the cab
  m.box(W, 1.15, 1.45, 0xf0c040, 0, 1.2, 1.6); m.box(W + 0.02, 0.12, 1.5, PCOL.white, 0, 1.82, 1.58);
  m.box(W - 0.2, 0.5, 0.04, PCOL.glass, 0, 1.45, 2.33, 0, -0.18); for (const s of [-1, 1]) m.box(0.04, 0.42, 0.8, PCOL.glass, s * (W / 2 + 0.005), 1.45, 1.6);
  m.box(W + 0.04, 0.22, 0.12, 0xbfc4c4, 0, 0.75, 2.36); for (const s of [-1, 1]) m.box(0.3, 0.14, 0.04, 0xfff1cf, s * 0.6, 0.92, 2.34);
  for (const s of [-1, 1]) { m.box(0.05, 0.08, 0.2, COL.ink, s * (W / 2 + 0.12), 1.55, 2.0); }
  // the cargo box: blue planks, open at the top, styrofoam boxes inside and a tarp thrown over one corner
  const bz = -1.0, bl = 2.9, by = 0.68;
  m.box(W + 0.05, 0.08, bl, 0x8c6444, 0, by, bz);
  for (const s of [-1, 1]) m.box(0.08, 0.7, bl, 0x2f6fb0, s * (W / 2), by + 0.38, bz);
  m.box(W, 0.7, 0.08, 0x2f6fb0, 0, by + 0.38, bz - bl / 2); m.box(W, 0.7, 0.08, 0x2f6fb0, 0, by + 0.38, bz + bl / 2);
  for (let k = 0; k < 3; k++) m.box(W + 0.1, 0.06, 0.06, 0xf2c03b, 0, by + 0.73, bz - bl / 2 + 0.4 + k * 1.05);
  for (let a = 0; a < 2; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 2; c++) { const x = -0.4 + a * 0.78, z = bz - 1.1 + b * 0.68, y = by + 0.05 + c * 0.36; m.box(0.62, 0.34, 0.6, 0xf6f6f2, x, y + 0.17, z); m.box(0.64, 0.04, 0.62, 0xeceee8, x, y + 0.35, z); }
  addFaces(m, quadT([-W / 2, by + 0.8, bz + 0.2], [W / 2, by + 0.8, bz + 0.3], [W / 2 + 0.05, by + 0.35, bz + 1.5], [-W / 2 - 0.05, by + 0.6, bz + 1.45]), 0x2f7fc9, null, [0, 1, 0]);
  return { colliders: [{ x: 0, z: 0.15, hw: W / 2 + 0.1, hd: 2.4 }] };
}

// A small motorbike on its stand, front +z; `box` adds a styrofoam box tied on the back (the fish seller's way).
export function motorbike(m, hex = 0xd9463a, box = false) {
  const lean = 0.12;
  m.push(0, 0, 0, 0, 0, lean);
  for (const z of [0.62, -0.62]) { m.cyl(0.27, 0.27, 0.08, 0x2e2c2c, 0, 0.27, z, 10, 0, Math.PI / 2); m.cyl(0.13, 0.13, 0.09, 0xbfc4c4, 0, 0.27, z, 7, 0, Math.PI / 2); }
  m.rod([0, 0.27, 0.62], [0, 0.95, 0.42], 0.03, 0.03, 0xbfc4c4, 4);
  m.rod([-0.33, 0.98, 0.4], [0.33, 0.98, 0.4], 0.018, 0.018, COL.ink, 4);
  m.box(0.3, 0.32, 0.5, hex, 0, 0.72, 0.38, 0, 0.35); m.box(0.26, 0.2, 0.8, hex, 0, 0.5, -0.1);
  m.box(0.28, 0.1, 0.65, 0x2e2c2c, 0, 0.72, -0.25); m.box(0.24, 0.16, 0.5, 0x5a5a5e, 0.0, 0.42, -0.38);
  m.box(0.1, 0.08, 0.04, 0xfff1cf, 0, 0.88, 0.62); m.box(0.08, 0.05, 0.03, 0xd9463a, 0, 0.64, -0.82);
  if (box) { m.box(0.62, 0.38, 0.45, 0xf6f6f2, 0, 0.98, -0.5); m.box(0.64, 0.04, 0.47, 0x3f86c0, 0, 1.0, -0.5); }
  m.pop();
  m.rod([-0.06, 0.32, -0.25], [-0.2, 0.0, -0.32], 0.015, 0.015, 0x5a5a5e, 3);
  return { colliders: [{ x: 0, z: 0, hw: 0.32, hd: 0.95 }] };
}

// An outboard motor on a wooden stand, and a repair workbench with a vice, tools, a toolbox and a spare cowling.
export function engineStand(m) {
  for (const x of [-0.45, 0.45]) { m.rod([x, 0, -0.35], [x, 1.0, 0], 0.04, 0.04, COL.woodDk, 4); m.rod([x, 0, 0.35], [x, 1.0, 0], 0.04, 0.04, COL.woodDk, 4); }
  m.box(1.1, 0.12, 0.16, COL.wood, 0, 1.02, 0);
  m.box(0.42, 0.55, 0.55, 0x2e2c2c, 0, 1.4, -0.1); m.box(0.44, 0.08, 0.57, PCOL.white, 0, 1.5, -0.1); m.box(0.14, 0.75, 0.2, 0x5a5a5e, 0, 0.75, -0.05);
  m.box(0.2, 0.12, 0.34, 0x5a5a5e, 0, 0.36, -0.07); m.rod([0, 0.4, -0.27], [0, 0.4, -0.37], 0.06, 0.06, 0x7a7a7e, 6);
  bucket(m, 0, 0, 0.0, 0x3a8fd0); // a bucket of water under the propeller, to run it
  return { colliders: [{ x: 0, z: 0, hw: 0.6, hd: 0.45 }] };
}
export function workbench(m) {
  const L = 2.2, T = 0.8, y = 0.86;
  m.box(L, 0.08, T, COL.wood, 0, y, 0); for (const x of [-L / 2 + 0.1, L / 2 - 0.1]) for (const z of [-T / 2 + 0.08, T / 2 - 0.08]) m.box(0.08, y, 0.08, COL.woodDk, x, y / 2, z);
  m.box(L - 0.2, 0.04, T - 0.2, COL.woodDk, 0, 0.25, 0);
  m.box(0.22, 0.14, 0.18, 0x3f6f9a, L / 2 - 0.25, y + 0.11, T / 2 - 0.1); m.rod([L / 2 - 0.25, y + 0.1, T / 2 + 0.02], [L / 2 - 0.25, y + 0.1, T / 2 + 0.2], 0.015, 0.015, PCOL.steelDk, 3); // the vice
  m.box(0.5, 0.22, 0.25, 0xd9463a, -0.6, y + 0.15, -0.1); m.box(0.52, 0.04, 0.27, 0x9a2f2a, -0.6, y + 0.28, -0.1); // toolbox
  m.box(0.3, 0.03, 0.05, PCOL.steel, 0.1, y + 0.06, 0.15, 0.4); m.box(0.25, 0.03, 0.04, 0xf2c03b, 0.3, y + 0.06, -0.05, -0.6);
  m.box(0.42, 0.3, 0.5, 0x2e2c2c, 0.2, 0.42, 0.0); // a spare cowling under the bench
  jerryCan(m, -0.7, 0, 0.0, 0.2, 0xd9463a);
  m.box(1.6, 0.9, 0.04, COL.woodGrey, 0, y + 0.55, -T / 2 - 0.02); // a tool board behind
  for (let k = 0; k < 5; k++) m.box(0.05, 0.3, 0.03, [PCOL.steel, 0xf2c03b, PCOL.steelDk, 0xd9463a, PCOL.steel][k], -0.6 + k * 0.3, y + 0.6, -T / 2 + 0.01);
  return { colliders: [{ x: 0, z: 0, hw: L / 2, hd: T / 2 + 0.05 }] };
}
