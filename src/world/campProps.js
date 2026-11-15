// The gear scattered around a scout camp: gateway, lookout tower, picnic tables, crates, firewood,
// washing lines, bamboo racks, canoes and so on. Decoration only; the big pieces are solid.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import {
  COTTAGES, toWorld, GATE, GATE_POSTS, TOWER, PICNIC_TABLES, PIONEER_SITE, FLAGPOLE, DOCK, CAMPFIRE, VILLAGE_CENTER, FIELD, SUMMIT, LOOKOUT,
} from '../logic/layout.js';
import { box, cyl, ball, stick, roofGeometry, shared } from './build.js';

const BAMBOO = 0xd8bb72, WOOD = 0xb98a5e, DARK = 0x8c6444, ROPE = 0xe9dcc0, TIN = 0x8fa0a8;

export function createCampProps(scene) {
  const root = new THREE.Group();
  scene.add(root);
  // A little group standing on the ground at a world spot.
  const at = (x, z, ry = 0) => { const g = new THREE.Group(); g.position.set(x, heightAt(x, z) - 0.02, z); g.rotation.y = ry; root.add(g); return g; };
  const beside = (c, lx, lz, ry = 0) => { const p = toWorld(c, lx, lz); return at(p.x, p.z, c.rot + ry); };

  const crates = (g, n = 3) => { const s = [[0, 0, 0.55, 0], [0.62, 0.1, 0.45, 0.3], [0.1, 0, 0.42, 0.5]]; for (let i = 0; i < n; i++) { const [x, z, size, r] = s[i]; g.add(box(size, size, size, i % 2 ? 0xc79a62 : 0xb98a5e, x, (i === 2 ? 0.55 : 0) + size / 2, z, r)); } };
  const barrel = (g, x, z, color = 0x4f7fc9) => g.add(cyl(0.28, 0.25, 0.75, color, x, 0.38, z, 10), cyl(0.29, 0.29, 0.05, TIN, x, 0.6, z, 10));
  const firewood = (g) => { for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) { const l = cyl(0.09, 0.09, 0.9, r % 2 ? 0x9b6f4c : 0xb08663, -0.3 + k * 0.2 + r * 0.1, 0.09 + r * 0.17, 0, 7); l.rotation.x = Math.PI / 2; g.add(l); } };
  const backpack = (g, x, z, color, ry = 0) => g.add(box(0.34, 0.42, 0.22, color, x, 0.22, z, ry), box(0.36, 0.1, 0.24, 0xf4e3b5, x, 0.4, z, ry));
  const bucket = (g, x, z, color = TIN) => g.add(cyl(0.16, 0.13, 0.26, color, x, 0.14, z, 10));
  const pennant = (g, x, z, color, h = 2.6) => { g.add(cyl(0.03, 0.035, h, BAMBOO, x, h / 2, z)); const p = new THREE.Mesh(roofGeometry(0.4, 0.7, 0.02), shared(color)); p.rotation.z = -Math.PI / 2; p.position.set(x + 0.04, h - 0.25, z); p.castShadow = true; g.add(p); };
  // A washing line strung between two bamboo poles.
  const washing = (g, len = 3) => {
    g.add(cyl(0.035, 0.04, 1.9, BAMBOO, 0, 0.95, 0), cyl(0.035, 0.04, 1.9, BAMBOO, len, 0.95, 0), stick([0, 1.8, 0], [len, 1.8, 0], 0.01, ROPE));
    const cols = [0xe8503a, 0xfaf3e2, 0x4f7fc9, 0xf2b63b, 0xd8c08a];
    for (let k = 0; k < 5; k++) { const w = k % 2 ? 0.34 : 0.44, h = k % 3 ? 0.5 : 0.36; g.add(box(w, h, 0.02, cols[k], 0.4 + k * (len - 0.8) / 4, 1.8 - h / 2 - 0.02, 0)); }
  };
  // A lashed bamboo rack (for shoes or plates), the kind scouts build.
  const rack = (g, plates = false) => {
    for (const x of [-0.5, 0.5]) for (const z of [-0.17, 0.17]) g.add(cyl(0.025, 0.025, 0.75, BAMBOO, x, 0.38, z, 5));
    for (const y of [0.25, 0.6]) for (const z of [-0.17, 0, 0.17]) g.add(stick([-0.55, y, z], [0.55, y, z], 0.02, BAMBOO, 5));
    for (let k = 0; k < 4; k++) g.add(plates ? cyl(0.1, 0.1, 0.02, 0xfaf3e2, -0.36 + k * 0.24, 0.64, 0, 10) : box(0.12, 0.08, 0.26, [0xfaf3e2, 0x5b4636, 0xd9634a, 0x5b4636][k], -0.36 + k * 0.24, 0.3, 0));
  };
  const signpost = (g) => { g.add(cyl(0.05, 0.06, 1.9, DARK, 0, 0.95, 0)); [[1.55, 0.3, 0xf2b63b], [1.25, -1.2, 0xfaf3e2], [0.95, 2.1, 0x5fa8a0]].forEach(([y, r, col]) => g.add(box(0.75, 0.2, 0.05, col, Math.cos(r) * 0.3, y, -Math.sin(r) * 0.3, r))); };
  const picnic = (g) => {
    g.add(box(1.8, 0.07, 0.8, 0xc79a62, 0, 0.74, 0));
    for (const z of [-0.68, 0.68]) g.add(box(1.8, 0.06, 0.28, WOOD, 0, 0.42, z));
    for (const x of [-0.7, 0.7]) { g.add(box(0.08, 0.72, 0.08, DARK, x, 0.37, -0.3), box(0.08, 0.72, 0.08, DARK, x, 0.37, 0.3), box(0.08, 0.06, 1.6, DARK, x, 0.36, 0)); }
    for (const [x, z, col] of [[-0.5, -0.2, 0xfaf3e2], [0.1, 0.2, 0xfaf3e2], [0.55, -0.18, 0xfaf3e2]]) g.add(cyl(0.11, 0.09, 0.03, col, x, 0.8, z, 10), cyl(0.045, 0.04, 0.1, 0xe8503a, x + 0.2, 0.83, z + 0.05, 8));
    g.add(cyl(0.12, 0.1, 0.16, TIN, -0.05, 0.86, -0.05, 10));
  };
  const canoe = (g, color) => { const h = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shared(color)); h.material.side = THREE.DoubleSide; h.scale.set(0.42, 0.34, 2.0); h.position.y = 0.34; h.castShadow = true; g.add(h, box(0.7, 0.05, 0.14, 0xe3c79a, 0, 0.3, 0.4), box(0.7, 0.05, 0.14, 0xe3c79a, 0, 0.3, -0.5)); };
  const stones = (g, r, n, color = 0xfaf7f0) => { for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const s = ball(0.13, color, Math.cos(a) * r, 0.07, Math.sin(a) * r); s.scale.y = 0.6; g.add(s); } };

  // ---- Pioneering gateway over the dock path
  {
    const g = at(GATE.x, GATE.z, GATE.rot);
    for (const s of [-1, 1]) {
      const x = s * GATE.half;
      for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) g.add(stick([x + dx, 0, dz], [x + dx * 0.4, 4.4, dz * 0.4], 0.05, BAMBOO));
      for (const y of [1.1, 2.3, 3.5]) g.add(stick([x - 0.3, y, -0.3], [x + 0.3, y + 0.5, 0.3], 0.03, BAMBOO), stick([x + 0.3, y, -0.3], [x - 0.3, y + 0.5, 0.3], 0.03, BAMBOO));
      pennant(g, x, 0, s > 0 ? 0xe8503a : 0xf2b63b, 5.3);
    }
    g.add(stick([-GATE.half, 4.2, 0], [GATE.half, 4.2, 0], 0.06, BAMBOO), stick([-GATE.half, 3.5, 0], [GATE.half, 3.5, 0], 0.045, BAMBOO));
    g.add(box(2.4, 0.55, 0.05, 0x6a3f9c, 0, 3.86, 0), box(2.2, 0.06, 0.06, 0xfaf3e2, 0, 3.86, 0.01));
    const badge = ball(0.2, 0xfaf3e2, 0, 3.86, 0.04); badge.scale.z = 0.2; g.add(badge);
  }

  // ---- Bamboo lookout tower beside the guard post
  {
    const g = at(TOWER.x, TOWER.z, 0.4);
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sz] of legs) g.add(stick([sx * 1.05, 0, sz * 1.05], [sx * 0.7, 4.3, sz * 0.7], 0.06, BAMBOO));
    for (const y of [0.9, 2.3]) for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) {
      const k0 = 1.05 - 0.35 * (y / 4.3), k1 = 1.05 - 0.35 * ((y + 1.2) / 4.3);
      g.add(stick([legs[a][0] * k0, y, legs[a][1] * k0], [legs[b][0] * k1, y + 1.2, legs[b][1] * k1], 0.03, BAMBOO));
    }
    g.add(box(1.9, 0.1, 1.9, WOOD, 0, 4.3, 0));
    for (const [sx, sz] of legs) g.add(cyl(0.035, 0.035, 2.3, BAMBOO, sx * 0.88, 5.45, sz * 0.88, 5));
    for (const s of [-1, 1]) g.add(stick([-0.88, 5.2, s * 0.88], [0.88, 5.2, s * 0.88], 0.028, BAMBOO), stick([s * 0.88, 5.2, -0.88], [s * 0.88, 5.2, 0.88], 0.028, BAMBOO));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.9, 4), shared(0x8fa678)); cap.rotation.y = Math.PI / 4; cap.position.y = 7.0; cap.castShadow = true; g.add(cap);
    g.add(stick([-0.25, 0, 1.25], [-0.25, 4.3, 0.95], 0.03, BAMBOO), stick([0.25, 0, 1.25], [0.25, 4.3, 0.95], 0.03, BAMBOO));
    for (let k = 1; k < 10; k++) g.add(stick([-0.25, k * 0.43, 1.25 - k * 0.03], [0.25, k * 0.43, 1.25 - k * 0.03], 0.02, BAMBOO, 5));
    pennant(g, 0.88, 0.88, 0x6a3f9c, 8.2);
  }

  // ---- Picnic tables by the food tent
  for (const t of PICNIC_TABLES) picnic(at(t.x, t.z, t.rot));

  // ---- Around each structure
  const packs = [0x6f9a5a, 0xd9634a, 0x4f7fc9, 0xf2b63b];
  COTTAGES.forEach((c, i) => {
    const W = c.width, D = c.depth;
    if (c.type === 'patrol') {
      firewood(beside(c, -W / 2 - 0.9, 0.6, Math.PI / 2));
      washing(beside(c, W / 2 + 1.5, -1.6, Math.PI / 2), 3.0);
      rack(beside(c, -1.5, D / 2 + 0.75));
      const g = beside(c, 1.9, D / 2 + 1.0); backpack(g, 0, 0, packs[i % 4], 0.3); backpack(g, 0.45, 0.2, packs[(i + 1) % 4], -0.4); bucket(g, -0.6, 0.3, 0xe8503a);
      g.add(cyl(0.3, 0.3, 0.04, 0xb7a07a, 0.2, 0.03, 1.0, 10)); // a sitting mat
    } else if (c.type === 'hall') {
      crates(beside(c, -W / 2 - 1.0, 1.2, 0.2));
      const g = beside(c, W / 2 - 1.2, D / 2 + 1.5); // notice board
      g.add(cyl(0.05, 0.05, 1.9, DARK, -0.7, 0.95, 0), cyl(0.05, 0.05, 1.9, DARK, 0.7, 0.95, 0), box(1.6, 1.0, 0.06, WOOD, 0, 1.35, 0), box(1.7, 0.1, 0.3, 0xd9634a, 0, 1.95, 0));
      [[-0.45, 1.5, 0xfaf3e2], [0.1, 1.55, 0xf2e29a], [0.5, 1.25, 0xfaf3e2], [-0.3, 1.1, 0xbfe0d0]].forEach(([x, y, col]) => g.add(box(0.36, 0.3, 0.02, col, x, y, 0.045)));
      const b = beside(c, -2.4, D / 2 + 1.3); b.add(box(1.6, 0.07, 0.36, WOOD, 0, 0.42, 0), box(0.08, 0.4, 0.3, DARK, -0.65, 0.2, 0), box(0.08, 0.4, 0.3, DARK, 0.65, 0.2, 0));
    } else if (c.type === 'mess') {
      const g = beside(c, -W / 2 - 1.3, 0.4); barrel(g, 0, 0); barrel(g, 0.65, 0.15, 0x5fa8a0); bucket(g, 0.3, 0.7);
      rack(beside(c, W / 2 + 0.8, 1.2, Math.PI / 2), true);
      firewood(beside(c, W / 2 + 0.9, -1.2, Math.PI / 2));
      crates(beside(c, -W / 2 - 1.1, -1.6, 0.1));
      // An outdoor cooking tripod with a pot hung over the embers.
      const t = beside(c, 2.2, D / 2 + 2.3);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; t.add(stick([Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7], [0, 1.7, 0], 0.03, BAMBOO)); }
      t.add(stick([0, 1.65, 0], [0, 0.75, 0], 0.01, ROPE), cyl(0.24, 0.2, 0.3, 0x5b5b63, 0, 0.6, 0, 10)); stones(t, 0.45, 8, 0xbdb4bb);
      t.add(ball(0.14, shared(0xff8a3c), 0, 0.12, 0, 0));
    } else if (c.type === 'aid') {
      const g = beside(c, W / 2 + 0.7, 0.6); // a stretcher leaning on the tent
      g.add(stick([0, 0.05, -0.9], [0.25, 1.5, -0.9], 0.03, BAMBOO), stick([0, 0.05, -0.3], [0.25, 1.5, -0.3], 0.03, BAMBOO));
      const cloth = box(0.04, 1.2, 0.56, 0x9fb6a0, 0.12, 0.8, -0.6); cloth.rotation.z = -0.17; g.add(cloth);
      const b = beside(c, -1.4, D / 2 + 1.0); b.add(box(1.3, 0.07, 0.34, WOOD, 0, 0.42, 0), box(0.08, 0.4, 0.3, DARK, -0.5, 0.2, 0), box(0.08, 0.4, 0.3, DARK, 0.5, 0.2, 0)); bucket(b, 1.0, 0, 0xfaf7f0);
    } else if (c.type === 'farm') {
      const g = beside(c, 1.6, D / 2 + 1.4, 0.4); // wheelbarrow
      g.add(box(0.7, 0.3, 0.5, 0x7f9a66, 0, 0.42, 0), cyl(0.17, 0.17, 0.07, 0x5b4636, 0.5, 0.17, 0, 10).rotateX(Math.PI / 2), stick([-0.3, 0.45, 0.22], [-0.95, 0.6, 0.26], 0.02, DARK), stick([-0.3, 0.45, -0.22], [-0.95, 0.6, -0.26], 0.02, DARK), ball(0.2, 0xe8c15a, 0, 0.62, 0));
      const tr = beside(c, -W / 2 - 1.0, 0.8, Math.PI / 2); tr.add(box(1.5, 0.3, 0.5, WOOD, 0, 0.2, 0), box(1.36, 0.04, 0.36, 0x7ec3d9, 0, 0.35, 0));
      barrel(beside(c, W / 2 + 0.7, -1.0), 0, 0, 0x7f9a66);
    } else if (c.type === 'guard') {
      signpost(beside(c, 1.9, D / 2 + 1.0));
      crates(beside(c, W / 2 + 0.7, -0.4), 2);
    }
  });

  // ---- Parade ground, junctions, pioneering site
  stones(at(FLAGPOLE.x, FLAGPOLE.z), 0.95, 12);
  signpost(at(15.2, 5.0));
  signpost(at(25.2, 9.6, 1));
  {
    const g = at(PIONEER_SITE.x, PIONEER_SITE.z);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.3; g.add(stick([Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0], [0, 2.5, 0], 0.045, BAMBOO)); }
    g.add(stick([-0.5, 1.25, -0.25], [0.45, 1.25, 0.35], 0.035, BAMBOO), cyl(0.09, 0.09, 0.12, ROPE, 0, 2.35, 0, 8));
    const bundle = at(PIONEER_SITE.x + 2.1, PIONEER_SITE.z + 1.2, 0.7);
    for (let k = 0; k < 6; k++) { const p = cyl(0.045, 0.045, 3.2, BAMBOO, (k % 3) * 0.1 - 0.1, 0.06 + Math.floor(k / 3) * 0.09, 0, 6); p.rotation.x = Math.PI / 2; bundle.add(p); }
    const coil = at(PIONEER_SITE.x - 1.6, PIONEER_SITE.z + 1.4); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 14), shared(ROPE)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; coil.add(ring);
    const stump = at(PIONEER_SITE.x + 0.4, PIONEER_SITE.z - 2.2); stump.add(cyl(0.3, 0.34, 0.42, 0x9b6f4c, 0, 0.21, 0, 9), stick([0.05, 0.42, 0], [0.4, 0.95, 0.1], 0.025, DARK), box(0.2, 0.1, 0.05, TIN, 0.1, 0.5, 0.02));
  }

  // ---- Dock and beach: canoes, paddles, crates, a life ring
  {
    const dx = Math.sin(DOCK.rot), dz = Math.cos(DOCK.rot);
    canoe(at(DOCK.x - dx * 3.5 + dz * 3.2, DOCK.z - dz * 3.5 - dx * 3.2, DOCK.rot + 0.5), 0xe8503a);
    canoe(at(DOCK.x - dx * 3.8 + dz * 4.6, DOCK.z - dz * 3.8 - dx * 4.6, DOCK.rot + 0.35), 0xf2b63b);
    const g = at(DOCK.x - dx * 2.6 - dz * 2.6, DOCK.z - dz * 2.6 + dx * 2.6, DOCK.rot); crates(g); barrel(g, -0.8, 0.2, 0xd9634a);
    g.add(stick([1.2, 0.05, 0], [1.3, 1.6, -0.2], 0.022, BAMBOO), box(0.16, 0.4, 0.03, WOOD, 1.31, 1.55, -0.2), stick([1.45, 0.05, 0.1], [1.5, 1.6, -0.1], 0.022, BAMBOO), box(0.16, 0.4, 0.03, WOOD, 1.51, 1.55, -0.1));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.08, 6, 14), shared(0xfaf3e2)); ring.position.set(-0.8, 0.95, 0.2); ring.rotation.x = Math.PI / 2; g.add(ring);
    // Beach camp: backpacks, a tripod of spare poles, a washing line.
    const b = at(CAMPFIRE.x + 3.4, CAMPFIRE.z + 1.6, 0.6); backpack(b, 0, 0, 0x4f7fc9); backpack(b, 0.5, 0.15, 0x6f9a5a, 0.5); bucket(b, -0.6, 0.2);
    washing(at(CAMPFIRE.x - 5.5, CAMPFIRE.z - 4.2, 0.9), 2.8);
    firewood(at(CAMPFIRE.x + 1.2, CAMPFIRE.z - 2.6, 0.3));
  }

  // ---- Summit camp: signal mast, lean-to shelter, cairn, telescope, supplies
  {
    const m = at(SUMMIT.mast.x, SUMMIT.mast.z);
    m.add(cyl(0.07, 0.1, 7.5, BAMBOO, 0, 3.75, 0), stick([-1.3, 6.2, 0], [1.3, 6.2, 0], 0.035, BAMBOO), cyl(0.35, 0.45, 0.3, 0xbdb4bb, 0, 0.12, 0));
    // Guy lines strung with signal pennants
    const cols = [0xe8503a, 0xf2b63b, 0x4f7fc9, 0xfaf3e2, 0x3f8f6a];
    for (const [ex, ez] of [[3.2, 1.6], [-3.0, 2.2], [0.4, -3.4]]) {
      m.add(stick([0, 7.2, 0], [ex, 0.1, ez], 0.012, ROPE));
      for (let k = 1; k < 7; k++) { const t = k / 7.5; const p = new THREE.Mesh(roofGeometry(0.3, 0.36, 0.02), shared(cols[k % 5])); p.rotation.z = Math.PI; p.rotation.y = Math.atan2(ex, ez) + Math.PI / 2; p.position.set(ex * t, 7.2 - 7.1 * t - 0.03, ez * t); m.add(p); }
    }
    const big = new THREE.Mesh(roofGeometry(0.7, 1.3, 0.02), shared(0x6a3f9c)); big.rotation.z = -Math.PI / 2; big.position.set(0.1, 7.1, 0); m.add(big);

    const s = at(SUMMIT.shelter.x, SUMMIT.shelter.z, SUMMIT.shelter.rot); // lean-to: a tarp sloping from a ridge pole to the ground
    s.add(stick([-1.4, 0, 0.5], [-1.4, 1.7, 0.5], 0.05, BAMBOO), stick([1.4, 0, 0.5], [1.4, 1.7, 0.5], 0.05, BAMBOO), stick([-1.6, 1.7, 0.5], [1.6, 1.7, 0.5], 0.045, BAMBOO));
    const tarp = box(3.0, 0.04, 2.3, 0x7f9a66, 0, 0.87, -0.42); tarp.rotation.x = -0.83; s.add(tarp);
    s.add(box(0.8, 0.07, 1.7, 0x8fa0a8, -0.6, 0.06, 0.1), box(0.74, 0.1, 1.1, 0xe8503a, -0.6, 0.14, 0.3), box(0.8, 0.07, 1.7, 0x8fa0a8, 0.55, 0.06, 0.1), box(0.74, 0.1, 1.1, 0x4f7fc9, 0.55, 0.14, 0.3));
    backpack(s, 1.2, 0.9, 0xf2b63b, 0.4);

    const c = at(SUMMIT.cairn.x, SUMMIT.cairn.z); // a cairn of stacked stones
    [[0.55, 0.2], [0.45, 0.55], [0.34, 0.86], [0.24, 1.1], [0.15, 1.28]].forEach(([r, y], k) => { const st = ball(r, k % 2 ? 0xa198a6 : 0xbdb4bb, (k % 2) * 0.05, y, 0); st.scale.y = 0.6; st.rotation.y = k; c.add(st); });

    const t = at(SUMMIT.telescope.x, SUMMIT.telescope.z, Math.atan2(SUMMIT.telescope.x - LOOKOUT.x, SUMMIT.telescope.z - LOOKOUT.z));
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; t.add(stick([Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [0, 1.05, 0], 0.025, DARK)); }
    const tube = cyl(0.07, 0.1, 0.95, 0xd9a05b, 0, 1.12, 0.1, 10); tube.rotation.x = Math.PI / 2 - 0.12; t.add(tube, cyl(0.105, 0.105, 0.06, 0xe9c46a, 0, 1.17, 0.56, 10).rotateX(Math.PI / 2));

    const g = at(SUMMIT.shelter.x - 2.0, SUMMIT.shelter.z + 1.0, 0.5); crates(g, 2); firewood(at(SUMMIT.fire.x - 2.4, SUMMIT.fire.z + 1.6, 1.1));
    const tbl = at(SUMMIT.mapper.x + 0.9, SUMMIT.mapper.z + 0.4, 0.3); tbl.add(box(0.7, 0.4, 0.5, 0xc79a62, 0, 0.2, 0), box(0.6, 0.02, 0.42, 0xf5ecd6, 0, 0.42, 0), box(0.2, 0.02, 0.14, 0x9fc98a, -0.1, 0.435, 0.05));
    bucket(at(SUMMIT.mast.x + 1.1, SUMMIT.mast.z - 1.2), 0, 0, 0x4f7fc9);
  }

  // ---- Bits and pieces round the parade ground and the farm
  firewood(at(VILLAGE_CENTER.x - 3.4, VILLAGE_CENTER.z + 3.6, 0.8));
  bucket(at(VILLAGE_CENTER.x + 2.9, VILLAGE_CENTER.z + 3.3), 0, 0, 0x4f7fc9);
  { const g = at(FIELD.x - 4.2, FIELD.z - 1.5, 0.3); bucket(g, 0, 0, 0x5fa8a0); g.add(stick([0.5, 0.05, 0], [0.7, 1.5, 0.1], 0.022, BAMBOO), box(0.3, 0.05, 0.05, TIN, 0.7, 1.5, 0.1)); crates(g, 1); }

  root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return { update() {} };
}
