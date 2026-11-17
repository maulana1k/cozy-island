// Harbour kit: a passenger ferry, a gangway, a timber pier and a set of props for the pier.
// All built from simple shapes, welded with mergeStatic (one mesh per colour). Metres; +z is forward.
// Every builder returns { group, colliders, platforms, ... }. Local space, origin on the waterline / ground.
import * as THREE from 'three';
import { box, cyl, ball, stick, shared, flat, mergeStatic } from '../world/build.js';

const CREAM = 0xfaf3e2, BLUE = 0x4f7fc9, WOOD = 0xc79a62, DARK = 0x8c6444, RED = 0xe8503a, YELLOW = 0xf2b63b;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// A steady "random" number in -1..1 from an integer, so planks are uneven the same way every time.
const hash = (n) => { const v = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return (v - Math.floor(v)) * 2 - 1; };

// ---- A bag of triangles for hand-made shapes (hulls) ---------------------------------------------
// Each triangle is turned to face the way `dir` says (a vector, or a function of the triangle's centre), so
// we never have to get the winding right by hand.
class Soup {
  constructor() { this.p = []; }
  tri(a, b, c, dir) {
    const n = V().subVectors(b, a).cross(V().subVectors(c, a));
    const mid = V().add(a).add(b).add(c).multiplyScalar(1 / 3);
    const d = typeof dir === 'function' ? dir(mid) : dir;
    if (n.dot(d) < 0) [b, c] = [c, b];
    for (const v of [a, b, c]) this.p.push(v.x, v.y, v.z);
  }
  quad(a, b, c, d, dir) { this.tri(a, b, c, dir); this.tri(a, c, d, dir); }
  mesh(color) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    const uv = []; for (let i = 0; i < this.p.length; i += 3) uv.push(this.p[i] * 0.33, this.p[i + 2] * 0.33); // top-down, for the deck grain
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, shared(color)); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
}

// ================================ FERRY ===========================================================
const L = 7;               // half the hull length: the ferry is 14 m long
const DECK = 1.1;          // deck height above the waterline
const NS = 24;             // slices along the hull
// Half the width of the hull at a point along it. Pointed bow (+z), rounded stern (-z); 2 m at the widest = 4 m beam.
const planW = (z) => { const u = z / L; return u >= 0 ? 2 * Math.pow(Math.max(0, 1 - Math.pow(u, 2.2)), 0.8) : 2 * Math.pow(Math.max(0, 1 - Math.pow(-u, 6)), 0.45); };
// Height of the keel: it rises toward the bow so the front looks like it cuts the water.
const keelY = (z) => { const u = z / L; return u >= 0 ? -0.75 + 0.6 * Math.pow(u, 1.6) : -0.75 + 0.25 * Math.pow(-u, 3); };
// Cross-section rows from keel to deck: [how far up, how far out]. A rounded, flared belly rather than a box.
const SEC = [[0, 0.05], [0.3, 0.5], [0.55, 0.8], [0.8, 0.95], [1, 1]];
const hullPt = (z, j, side) => { const w = planW(z), yb = keelY(z); return V(side * w * SEC[j][1], yb + (DECK - yb) * SEC[j][0], z); };
// How far out the hull surface is at a given height, for sticking portholes on it.
function hullX(z, y) {
  const yb = keelY(z), s = Math.min(1, Math.max(0, (y - yb) / (DECK - yb)));
  for (let j = 0; j < SEC.length - 1; j++) if (s <= SEC[j + 1][0]) { const t = (s - SEC[j][0]) / (SEC[j + 1][0] - SEC[j][0]); return planW(z) * (SEC[j][1] + t * (SEC[j + 1][1] - SEC[j][1])); }
  return planW(z);
}
const sliceZ = (k) => -L + (2 * L * k) / NS;
const GAP_Z = 0.6;         // the gangway opening in the side rails is this wide either side of z = 0 (on the +x side)

// A life ring: red ring with four white bands, hung on a wall. `axis` 'x' faces sideways, 'z' faces front/back.
function lifeRing(body, x, y, z, axis) {
  const g = new THREE.Group(); g.position.set(x, y, z); if (axis === 'x') g.rotation.y = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 6, 12), shared(RED)); ring.castShadow = true; g.add(ring);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, b = box(0.15, 0.15, 0.16, CREAM, Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0); b.rotation.set(0, 0, a); g.add(b); }
  body.add(g);
}

export function buildFerry() {
  const group = new THREE.Group(), body = new THREE.Group(); // `body` is what bobs on the water
  // Only the big shapes (hull, cabin, wheelhouse) cast shadows; all the small detail is welded separately without.
  const shell = new THREE.Group(), detail = new THREE.Group();
  group.add(body); body.add(shell, detail);
  const colliders = [], platforms = [];
  const soup = { blue: new Soup(), cream: new Soup(), deck: new Soup(), rim: new Soup() };

  // ---- Hull: lofted slices. Blue below the water stripe, cream above, wooden deck on top, blue bulwark all round.
  for (let k = 0; k < NS; k++) {
    const z0 = sliceZ(k), z1 = sliceZ(k + 1), zm = (z0 + z1) / 2;
    for (const side of [-1, 1]) {
      for (let j = 0; j < SEC.length - 1; j++) {
        const q = soup[j < 2 ? 'blue' : 'cream'];
        q.quad(hullPt(z0, j, side), hullPt(z1, j, side), hullPt(z1, j + 1, side), hullPt(z0, j + 1, side), (c) => V(c.x, c.y - 0.3, 0));
      }
      // Bulwark: a low blue wall round the deck edge (left open at the gangway).
      if (!(side > 0 && Math.abs(zm) < GAP_Z)) {
        const w0 = planW(z0), w1 = planW(z1), t = 0.1;
        const o0 = V(side * w0, DECK, z0), o1 = V(side * w1, DECK, z1), O0 = V(side * w0, DECK + 0.3, z0), O1 = V(side * w1, DECK + 0.3, z1);
        const i0 = V(side * Math.max(0, w0 - t), DECK, z0), i1 = V(side * Math.max(0, w1 - t), DECK, z1), I0 = V(side * Math.max(0, w0 - t), DECK + 0.3, z0), I1 = V(side * Math.max(0, w1 - t), DECK + 0.3, z1);
        soup.rim.quad(o0, o1, O1, O0, V(side, 0, 0)); soup.rim.quad(i0, i1, I1, I0, V(-side, 0, 0)); soup.rim.quad(O0, O1, I1, I0, V(0, 1, 0));
      }
    }
    soup.blue.quad(hullPt(z0, 0, -1), hullPt(z1, 0, -1), hullPt(z1, 0, 1), hullPt(z0, 0, 1), V(0, -1, 0)); // the keel underside
    soup.deck.quad(hullPt(z0, 4, -1), hullPt(z1, 4, -1), hullPt(z1, 4, 1), hullPt(z0, 4, 1), V(0, 1, 0)); // the deck planking
  }
  shell.add(soup.blue.mesh(BLUE), soup.cream.mesh(CREAM), soup.deck.mesh(WOOD), soup.rim.mesh(BLUE));

  // ---- Portholes: round blue windows along both sides of the hull.
  for (const z of [-5.2, -4.2, -3.2, -2.2, -1.2, -0.2, 0.8, 1.8, 2.8]) for (const side of [-1, 1]) {
    const p = cyl(0.16, 0.16, 0.1, BLUE, side * hullX(z, 0.8), 0.8, z, 8); p.rotation.z = Math.PI / 2; detail.add(p);
  }

  // ---- Railings: wooden posts with two white rails round the deck, open at the gangway.
  const railPost = (side, k) => { const z = sliceZ(k); return { x: side * (planW(z) - 0.08), z }; };
  for (const side of [-1, 1]) {
    let prev = null;
    for (let k = 2; k <= NS - 2; k++) {
      const { x, z } = railPost(side, k);
      if (side > 0 && Math.abs(z) < 0.1) { prev = null; continue; } // the gap
      detail.add(cyl(0.03, 0.035, 0.55, WOOD, x, DECK + 0.3 + 0.275, z, 5));
      if (prev) for (const y of [DECK + 0.85, DECK + 0.58]) detail.add(stick([prev.x, y, prev.z], [x, y, z], 0.02, CREAM, 5));
      prev = { x, z };
    }
  }
  for (const k of [2, NS - 2]) { // rails across the stern and bow
    const a = railPost(-1, k), b = railPost(1, k);
    for (const y of [DECK + 0.85, DECK + 0.58]) detail.add(stick([a.x, y, a.z], [b.x, y, b.z], 0.02, CREAM, 5));
  }

  // ---- Cabin: the main passenger house, cream walls, blue roof, with windows and a door each side.
  const CZ = -0.5, CW = 1.3, CH = 2.0, roofY = DECK + CH;
  shell.add(box(CW * 2, CH, 5, CREAM, 0, DECK + CH / 2, CZ));
  shell.add(box(CW * 2 + 0.4, 0.14, 5.4, BLUE, 0, roofY + 0.07, CZ));
  colliders.push({ x: 0, z: CZ, hw: CW - 0.1, hd: 2.5, rot: 0 }); // a touch inside the walls, so you can squeeze along the side deck
  for (const side of [-1, 1]) {
    for (const z of [-2.4, -1.6, -0.9, 0.9, 1.6]) detail.add(box(0.05, 0.55, 0.55, BLUE, side * (CW + 0.02), DECK + 1.2, z)); // side windows
    detail.add(box(0.06, 1.4, 0.7, WOOD, side * (CW + 0.02), DECK + 0.7, 0));          // a door in the middle of each side
    detail.add(box(0.07, 0.3, 0.4, BLUE, side * (CW + 0.03), DECK + 1.15, 0));           // its little window
  }
  for (const x of [-0.6, 0.6]) { detail.add(box(0.5, 0.55, 0.05, BLUE, x, DECK + 1.2, CZ + 2.52)); detail.add(box(0.5, 0.55, 0.05, BLUE, x, DECK + 1.2, CZ - 2.52)); } // end windows

  // ---- Wheelhouse: the little captain's room on the roof, with a window all round and a red roof.
  const WZ = 0.9, WY = roofY + 0.14;
  shell.add(box(2.0, 1.15, 1.8, CREAM, 0, WY + 0.575, WZ));
  detail.add(box(2.3, 0.12, 2.1, RED, 0, WY + 1.21, WZ));
  for (const x of [-0.5, 0.5]) detail.add(box(0.6, 0.5, 0.05, BLUE, x, WY + 0.65, WZ + 0.91));
  for (const side of [-1, 1]) detail.add(box(0.05, 0.5, 1.0, BLUE, side * 1.01, WY + 0.65, WZ));
  lifeRing(detail, -1.07, WY + 0.55, WZ - 0.6 + 0.1, 'x'); lifeRing(detail, 1.07, WY + 0.55, WZ - 0.6 + 0.1, 'x'); // rings on the wheelhouse sides
  lifeRing(detail, 0, DECK + 0.78, -L * 0.835, 'z');                                                              // and one hung on the stern rail

  // ---- Funnel: fat red chimney with a blue band, behind the wheelhouse. And a short mast for the flag.
  detail.add(cyl(0.38, 0.5, 1.6, RED, 0, roofY + 0.14 + 0.8, -1.7, 12), cyl(0.41, 0.41, 0.16, BLUE, 0, roofY + 0.14 + 1.45, -1.7, 12), cyl(0.3, 0.38, 0.12, BLUE, 0, roofY + 0.14 + 1.68, -1.7, 12));
  const mastTop = WY + 1.27 + 1.5;
  detail.add(cyl(0.035, 0.05, 1.5, WOOD, 0, WY + 1.27 + 0.75, WZ + 0.2, 6), ball(0.07, WOOD, 0, mastTop + 0.04, WZ + 0.2));

  // ---- Aft deck: striped awning on four poles, two benches under it.
  const AZ0 = -5.9, AZ1 = -3.2, poleHi = 2.4, poleLo = 2.1;
  for (const x of [-1.4, 1.4]) {
    detail.add(cyl(0.04, 0.045, poleHi, WOOD, x, DECK + poleHi / 2, AZ1 - 0.2, 6), cyl(0.04, 0.045, poleLo, WOOD, x, DECK + poleLo / 2, AZ0 + 0.3, 6));
    // (no colliders for these thin poles: the front pair would close the side deck off from the stern)
  }
  const stripes = 6, sw = (AZ1 - AZ0) / stripes, tilt = Math.atan((poleHi - poleLo) / (AZ1 - AZ0));
  for (let i = 0; i < stripes; i++) { // alternating red and cream strips of cloth, sloping back toward the stern
    const z = AZ0 + sw * (i + 0.5), y = DECK + poleLo + 0.17 + (poleHi - poleLo) * (i + 0.5) / stripes;
    const s = box(3.3, 0.05, sw + 0.01, i % 2 ? CREAM : RED, 0, y, z); s.rotation.set(-tilt, 0, 0); detail.add(s);
  }
  for (let i = 0; i < 8; i++) detail.add(box(0.41, 0.2, 0.04, i % 2 ? CREAM : RED, -1.44 + i * 0.41, DECK + poleLo + 0.04, AZ0 - 0.04)); // scalloped fringe at the back edge
  for (const x of [-1.1, 1.1]) { // benches
    detail.add(box(0.42, 0.07, 1.7, WOOD, x, DECK + 0.45, -4.5));
    for (const z of [-5.2, -3.8]) detail.add(box(0.36, 0.42, 0.07, WOOD, x, DECK + 0.21, z));
    detail.add(box(0.06, 0.4, 1.7, WOOD, x + Math.sign(x) * 0.2, DECK + 0.68, -4.5));
    colliders.push({ x, z: -4.5, hw: 0.25, hd: 0.85, rot: 0 });
  }

  // ---- Foredeck: mooring posts (bollards) fore and aft, a coil of rope and a couple of crates.
  for (const [x, z] of [[-0.7, 4.4], [0.7, 4.4], [-0.9, -6.1], [0.9, -6.1]]) { detail.add(cyl(0.09, 0.11, 0.3, WOOD, x, DECK + 0.15, z, 8), cyl(0.13, 0.09, 0.08, WOOD, x, DECK + 0.34, z, 8)); colliders.push({ x, z, r: 0.13 }); }
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 5, 10), shared(WOOD)); coil.rotation.x = Math.PI / 2; coil.position.set(0.5, DECK + 0.07, 3.1); detail.add(coil);
  detail.add(box(0.55, 0.5, 0.55, WOOD, -0.55, DECK + 0.25, 3.2, 0.2), box(0.45, 0.4, 0.45, WOOD, -0.55, DECK + 0.7, 3.2, 0.5));
  colliders.push({ x: -0.55, z: 3.2, hw: 0.3, hd: 0.3, rot: 0 });

  mergeStatic(shell); mergeStatic(detail);
  for (const m of detail.children) m.castShadow = false;

  // ---- The flag: a red pennant on the mast that ripples. The only moving part, so it stays its own mesh.
  const flagMat = flat(RED, { side: THREE.DoubleSide });
  const fg = new THREE.PlaneGeometry(0.9, 0.5, 7, 1); fg.translate(0.45, 0, 0); fg.rotateY(Math.PI / 2); // its long side trails toward -z
  const base = fg.attributes.position.array.slice();
  const flag = new THREE.Mesh(fg, flagMat); flag.position.set(0, mastTop - 0.3, WZ + 0.2); flag.castShadow = false;
  body.add(flag);

  // The deck you can stand on, kept inside the rails as the hull narrows: the waist (wide enough to walk round the
  // cabin), the stern, the bow in two steps, and a landing patch out to the hull side at the gangway opening.
  platforms.push({ x: 0, z: -1.25, hw: 1.78, hd: 3.25, rot: 0, top: DECK }, { x: 0, z: -5.25, hw: 1.3, hd: 0.75, rot: 0, top: DECK },
    { x: 0, z: 2.35, hw: 1.68, hd: 0.35, rot: 0, top: DECK }, { x: 0, z: 2.8, hw: 1.25, hd: 0.8, rot: 0, top: DECK }, { x: 0, z: 4.2, hw: 0.8, hd: 0.6, rot: 0, top: DECK },
    { x: 1.65, z: 0, hw: 0.35, hd: 0.6, rot: 0, top: DECK });

  // Gentle bob (up and down), roll (side to side along the length) and a little pitch; the flag ripples.
  const update = (dt, elapsed) => {
    body.position.y = Math.sin(elapsed * 0.9) * 0.04;
    body.rotation.z = Math.sin(elapsed * 0.7) * 0.025;
    body.rotation.x = Math.sin(elapsed * 0.5 + 1) * 0.012;
    const p = fg.attributes.position;
    for (let i = 0; i < p.count; i++) { const along = -base[i * 3 + 2]; p.setX(i, base[i * 3] + Math.sin(along * 8 - elapsed * 5) * 0.07 * (along / 0.9)); }
    p.needsUpdate = true;
  };
  return { group, body, colliders, platforms, deckY: DECK, update };
}

// ================================ GANGWAY ========================================================
// A plank ramp with rope rails from the ferry deck (y 1.1, at its -z end) down to the pier deck (y 0.62, at its +z end).
// `length` is the run along the ground. About 1.1 m wide. Platform slope: top0 is the height at the -z end, top1 at the +z end.
export function buildGangway(length = 4) {
  const group = new THREE.Group(), colliders = [], hiY = DECK, loY = 0.62, drop = hiY - loY, W = 1.1;
  const slopeLen = Math.hypot(length, drop), angle = Math.atan2(drop, length);
  // Tilted sub-group holds everything that lies on the slope: planks, grip battens and the two side beams.
  const ramp = new THREE.Group(); ramp.position.set(0, (hiY + loY) / 2 - 0.025, 0); ramp.rotation.x = angle; group.add(ramp);
  const n = Math.round(slopeLen / 0.28);
  for (let i = 0; i < n; i++) {
    const z = -slopeLen / 2 + (i + 0.5) * slopeLen / n;
    ramp.add(box(W, 0.05, slopeLen / n - 0.02, WOOD, 0, 0, z));
    if (i % 3 === 1) ramp.add(box(W - 0.15, 0.03, 0.05, DARK, 0, 0.035, z)); // a grip batten across every third plank
  }
  for (const x of [-0.5, 0.5]) ramp.add(box(0.08, 0.12, slopeLen + 0.1, DARK, x, -0.08, 0));
  // Rope rails: three posts per side with a sagging top rope and a straight low rope.
  const surf = (t) => hiY - drop * t; // walking height at fraction t along the ramp
  for (const side of [-1, 1]) {
    const x = side * 0.6, tops = [], lows = [];
    for (const t of [0, 0.5, 1]) {
      const z = -length / 2 + t * length, y = surf(t);
      group.add(cyl(0.04, 0.045, 1.0, DARK, x, y + 0.45, z, 6));
      tops.push([x, y + 0.92, z]); lows.push([x, y + 0.45, z]);
    }
    for (let i = 0; i < 2; i++) { // top rope: each half dips in the middle
      const a = tops[i], b = tops[i + 1], mid = [x, (a[1] + b[1]) / 2 - 0.07, (a[2] + b[2]) / 2];
      group.add(stick(a, mid, 0.018, WOOD), stick(mid, b, 0.018, WOOD), stick(lows[i], lows[i + 1], 0.015, WOOD));
    }
  }
  mergeStatic(group, { ao: true });
  const platforms = [{ x: 0, z: 0, hw: W / 2, hd: length / 2, rot: 0, top0: hiY, top1: loY }];
  return { group, colliders, platforms };
}

// ================================ DOCK ===========================================================
const DOCK_TOP = 0.62;
// A timber pier on posts. Runs along +z from the shore end at the origin; deck top at y = 0.62.
export function buildDock(length = 20, width = 3.6) {
  const group = new THREE.Group(), colliders = [], hw = width / 2, T = 0.1;
  // Deck boards: rows across the pier, two boards per row, each a bit different in height, length and angle.
  const rows = Math.floor(length / 0.25), step = length / rows;
  for (let r = 0; r < rows; r++) {
    const z = (r + 0.5) * step + hash(r * 3) * 0.01, joint = hash(r * 7 + 1) * 0.6; // where the two boards meet moves from row to row
    const top = DOCK_TOP + hash(r * 5 + 2) * 0.012, rz = hash(r * 11 + 3) * 0.012;
    for (const [x0, x1] of [[-hw, joint - 0.01], [joint + 0.01, hw]]) {
      const b = box(x1 - x0, T, step - 0.025 - Math.abs(hash(r * 13 + x0)) * 0.012, WOOD, (x0 + x1) / 2, top - T / 2, z, rz);
      b.rotation.set(0, rz, 0); b.scale.set(1, 1, 1); group.add(b);
    }
  }
  // Frame under the deck (dark timber): two long beams, cross beams every 2.5 m, side fascia boards and a sill at the shore end.
  for (const x of [-hw + 0.35, hw - 0.35]) group.add(box(0.16, 0.22, length, DARK, x, DOCK_TOP - T - 0.11, length / 2));
  for (let z = 0.4; z < length; z += 2.5) group.add(box(width + 0.2, 0.18, 0.2, DARK, 0, DOCK_TOP - T - 0.27, z));
  for (const s of [-1, 1]) group.add(box(0.1, 0.24, length, DARK, s * (hw + 0.05), DOCK_TOP - T - 0.02, length / 2));
  group.add(box(width + 0.5, 0.35, 0.35, DARK, 0, DOCK_TOP - 0.1, 0.1));
  // Posts: pairs of round piles driven down into the water, sticking a little above the deck at the edge.
  for (let z = 1.2; z < length; z += 2.5) for (const s of [-1, 1]) group.add(cyl(0.09, 0.11, 2.2, DARK, s * (hw + 0.14), DOCK_TOP + 0.2 - 1.1, z, 8));
  group.add(cyl(0.09, 0.11, 2.2, DARK, -hw - 0.14, DOCK_TOP + 0.2 - 1.1, length - 0.2, 8), cyl(0.09, 0.11, 2.2, DARK, hw + 0.14, DOCK_TOP + 0.2 - 1.1, length - 0.2, 8));
  // Mooring bollards: stubby posts with a fat head, along both edges.
  for (const z of [length - 1.5, length - 8, length - 14.5]) for (const s of [-1, 1]) {
    if (z < 1) continue;
    const x = s * (hw - 0.25);
    group.add(cyl(0.09, 0.12, 0.38, DARK, x, DOCK_TOP + 0.19, z, 8), cyl(0.15, 0.1, 0.1, DARK, x, DOCK_TOP + 0.43, z, 8));
    colliders.push({ x, z, r: 0.17 });
  }
  // Two ladders hanging down the outside, from the deck edge into the water.
  for (const [s, z] of [[-1, length * 0.55], [1, length * 0.3]]) {
    const x = s * (hw + 0.26);
    for (const dz of [-0.22, 0.22]) group.add(box(0.05, 1.9, 0.05, WOOD, x, DOCK_TOP - 0.35, z + dz));
    for (let i = 0; i < 6; i++) group.add(box(0.05, 0.04, 0.5, WOOD, x, DOCK_TOP + 0.4 - i * 0.28, z));
  }
  // Rope coils lying on the deck near the bollards.
  for (const [x, z] of [[-hw + 0.8, length - 8.4], [hw - 0.8, length - 1.9], [hw - 0.8, length - 14.2]]) {
    if (z < 1) continue;
    for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.02, 0.05, 5, 10), shared(WOOD)); c.rotation.x = Math.PI / 2; c.position.set(x, DOCK_TOP + 0.05 + i * 0.07, z); c.castShadow = true; group.add(c); }
  }
  mergeStatic(group, { ao: true });
  const platforms = [{ x: 0, z: length / 2, hw, hd: length / 2, rot: 0, top: DOCK_TOP }];
  return { group, colliders, platforms };
}

// ================================ DOCK PROPS =====================================================
// The glass of every harbour lamp shares this material: turn up its emissiveIntensity after dark.
export const LAMP_GLASS = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffc46b, emissiveIntensity: 0, roughness: 0.5 });
// A lamp post standing at x, z: dark pole on a base, an arm at the top (toward +x) and a lantern hanging from it.
// `ry` turns it about the pole. Its glass uses LAMP_GLASS.
export function lampPost(x = 0, z = 0, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  g.add(cyl(0.16, 0.2, 0.25, DARK, 0, 0.125, 0, 8), cyl(0.05, 0.07, 2.6, DARK, 0, 1.3, 0, 6), box(0.5, 0.05, 0.05, DARK, 0.25, 2.55, 0), cyl(0.01, 0.01, 0.1, DARK, 0.45, 2.5, 0, 4));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), LAMP_GLASS); glass.position.set(0.45, 2.3, 0);
  g.add(glass, cyl(0.02, 0.2, 0.14, DARK, 0.45, 2.52, 0, 4), box(0.28, 0.04, 0.28, DARK, 0.45, 2.13, 0));
  return g;
}
// Things to put on a pier, laid out in a row along x with their feet at y = 0 (put the group at deck height).
// Left to right: crates (x -5.6), barrels (-3.8), luggage pile (-1.2), lamp post (0.8), signboard (2.6), hand cart (4.6).
export function buildDockProps() {
  const group = new THREE.Group(), colliders = [], lamps = [];
  const add = (...o) => group.add(...o);
  const left = new THREE.Group(); left.position.x = -0.8; group.add(left); // crates and barrels sit a little further left
  const addL = (...o) => left.add(...o);

  // ---- Crates: three stacked wooden boxes with a dark belt round each.
  const crate = (x, y, z, s, ry) => { addL(box(s, s, s, WOOD, x, y + s / 2, z, ry), box(s + 0.03, 0.08, s + 0.03, DARK, x, y + s / 2, z, ry)); };
  crate(-4.8, 0, 0, 0.62, 0.1); crate(-4.1, 0, 0.1, 0.5, -0.2); crate(-4.7, 0.62, 0.02, 0.5, 0.4);
  colliders.push({ x: -4.45 - 0.8, z: 0.05, hw: 0.45, hd: 0.35, rot: 0 });

  // ---- Barrels: three standing blue barrels (slightly bulged, dark hoops) and one on its side.
  const barrel = (x, z) => { addL(cyl(0.27, 0.24, 0.4, BLUE, x, 0.2, z, 10), cyl(0.24, 0.27, 0.4, BLUE, x, 0.6, z, 10), cyl(0.26, 0.26, 0.04, DARK, x, 0.15, z, 10), cyl(0.26, 0.26, 0.04, DARK, x, 0.65, z, 10)); colliders.push({ x: x - 0.8, z, r: 0.3 }); };
  barrel(-3.3, 0); barrel(-2.7, 0.15); barrel(-3.05, -0.55);
  const lying = cyl(0.25, 0.25, 0.8, BLUE, -2.4, 0.25, -0.7, 10); lying.rotation.z = Math.PI / 2; lying.rotation.y = 0.5; addL(lying);

  // ---- Luggage pile: three yellow scout rucksacks (flap, front pocket, rolled mat on top) and two blue kit bags lying down.
  const pack = (x, y, z, ry) => { add(box(0.42, 0.52, 0.3, YELLOW, x, y + 0.26, z, ry), box(0.44, 0.14, 0.32, DARK, x, y + 0.5, z, ry)); const pk = box(0.3, 0.22, 0.1, YELLOW, x, y + 0.2, z, ry); pk.translateZ(0.2); add(pk); const mat = cyl(0.07, 0.07, 0.4, DARK, x, y + 0.64, z, 6); mat.rotation.z = Math.PI / 2; mat.rotation.y = ry; add(mat); };
  pack(-1.5, 0, 0, 0.3); pack(-0.95, 0, 0.1, -0.2); pack(-1.2, 0.5, 0.0, 0.5);
  const bag = (x, z, ry) => { const b = cyl(0.17, 0.17, 0.75, BLUE, x, 0.17, z, 8); b.rotation.set(0, ry, Math.PI / 2); add(b); add(box(0.76, 0.05, 0.08, DARK, x, 0.33, z, ry)); };
  bag(-1.2, 0.5, 0.2); bag(-0.8, -0.45, -0.4);
  colliders.push({ x: -1.2, z: 0.05, hw: 0.65, hd: 0.7, rot: 0 });

  // ---- Lamp post (see lampPost above).
  const lx = 0.8;
  add(lampPost(lx, 0));
  lamps.push({ x: lx + 0.45, y: 2.3, z: 0 });
  colliders.push({ x: lx, z: 0, r: 0.15 });

  // ---- Signboard: a blank board on two posts, with a frame (no writing).
  const sx = 2.6;
  for (const s of [-1, 1]) add(cyl(0.06, 0.07, 1.8, DARK, sx + s * 0.7, 0.9, 0, 6));
  add(box(1.5, 0.7, 0.06, WOOD, sx, 1.35, 0.02), box(1.64, 0.07, 0.1, DARK, sx, 1.72, 0.02), box(1.64, 0.07, 0.1, DARK, sx, 0.98, 0.02));
  colliders.push({ x: sx, z: 0, hw: 0.85, hd: 0.12, rot: 0 });

  // ---- Hand cart: wooden bed with low sides, two big dark wheels, two handles resting on the ground, a rucksack in it.
  const cx = 4.4;
  add(box(1.2, 0.08, 0.7, WOOD, cx, 0.52, 0), box(1.2, 0.22, 0.05, WOOD, cx, 0.66, 0.33), box(1.2, 0.22, 0.05, WOOD, cx, 0.66, -0.33), box(0.05, 0.22, 0.7, WOOD, cx - 0.58, 0.66, 0), box(0.05, 0.22, 0.7, WOOD, cx + 0.58, 0.66, 0));
  for (const z of [-0.42, 0.42]) { const w = cyl(0.3, 0.3, 0.06, DARK, cx, 0.3, z, 12); w.rotation.x = Math.PI / 2; add(w); const hub = cyl(0.1, 0.1, 0.1, WOOD, cx, 0.3, z, 8); hub.rotation.x = Math.PI / 2; add(hub); }
  add(stick([cx, 0.3, -0.45], [cx, 0.3, 0.45], 0.025, DARK));
  for (const z of [-0.28, 0.28]) add(stick([cx + 0.5, 0.52, z], [cx + 1.6, 0.1, z], 0.035, WOOD));
  add(stick([cx + 1.6, 0.1, -0.28], [cx + 1.6, 0.1, 0.28], 0.035, WOOD));
  add(box(0.42, 0.52, 0.3, YELLOW, cx - 0.2, 0.82, 0, 0.4));
  colliders.push({ x: cx + 0.5, z: 0, hw: 1.1, hd: 0.5, rot: 0 });

  mergeStatic(group, { ao: true });
  return { group, colliders, platforms: [], lamps };
}
