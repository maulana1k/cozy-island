// A fabric tent door that unzips and rolls up: a small puller travels the zip line (up one side, over the top, down
// the other), then the panel rolls up from the bottom into a fat fabric roll that ends tucked under the top of the
// doorway, the way a real tent door is rolled and tied open. Closing runs it backwards (unroll, then zip shut).
// One small CPU-animated grid (no allocations per frame). t: 0 closed .. 1 open.
import * as THREE from 'three';

const NC = 11, NR = 6, RR = 8, ZIP_END = 0.45; // columns, panel rows, rows wrapped round the roll; the zip takes the first 45% of t
const ROWS = RR + NR, TURNS = 1.8 * Math.PI;    // the roll is just under one full turn round its core
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => v * v * (3 - 2 * v);

// ring: [x, y, z] points of the doorway in tent space, ordered along the zip path (the base edge closes the loop).
export function createZipDoor(ring, material, plane) {
  const z0 = ring[0][2] + 0.02;
  const xs = ring.map((p) => p[0]), xmin = Math.min(...xs), xmax = Math.max(...xs), yb = Math.min(...ring.map((p) => p[1]));
  // Height of the doorway's upper edge at x: the highest point where the outline crosses that x.
  const topAt = (x) => {
    let top = yb;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      if ((a[0] - x) * (c[0] - x) > 0) continue;
      const u = Math.abs(c[0] - a[0]) < 1e-6 ? 1 : (x - a[0]) / (c[0] - a[0]);
      top = Math.max(top, a[1] + (c[1] - a[1]) * u, Math.abs(c[0] - a[0]) < 1e-6 ? Math.max(a[1], c[1]) : -1e9);
    }
    return top;
  };
  const restX = new Float32Array(NC), restH = new Float32Array(NC);
  for (let c = 0; c < NC; c++) { const x = xmax - ((xmax - xmin) * c) / (NC - 1) * 0.999; restX[c] = x; restH[c] = Math.max(0.05, topAt(x) - yb); }
  // The roll rises to just under the top of the doorway (straight across the middle; near the sides of an arched
  // doorway it stays under the arch).
  const rollTop = [...restH].sort((p, q) => p - q)[Math.floor(NC / 2)] * 0.88;
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(NC * ROWS * 3), idx = [];
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (let c = 0; c < NC - 1; c++) for (let r = 0; r < ROWS - 1; r++) { const a = c * ROWS + r, b2 = (c + 1) * ROWS + r; idx.push(a, b2, b2 + 1, a, b2 + 1, a + 1); }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material); mesh.castShadow = true; mesh.frustumCulled = false; mesh.material.side = THREE.DoubleSide;

  // The zip line along the doorway's edge, and the puller that rides it.
  const path = ring.map((p) => new THREE.Vector3(p[0], p[1], z0 + 0.012));
  const lens = [0]; for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = lens[lens.length - 1];
  const zipMat = new THREE.LineBasicMaterial({ color: 0x1b1d20, clippingPlanes: [plane] });
  const pullerMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, clippingPlanes: [plane] });
  const puller = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.04), pullerMat); puller.castShadow = false;
  const group = new THREE.Group();
  group.add(mesh, new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), zipMat), puller);

  let last = -1;
  function update(t) {
    if (Math.abs(t - last) < 1e-4) return; last = t;
    const zp = clamp01(t / ZIP_END), roll = ease(clamp01((t - ZIP_END) / (1 - ZIP_END)));
    // The puller rides the zip line; once it is round, it stays at the end of its run.
    const want = zp * total; let i = 1; while (i < lens.length - 1 && lens[i] < want) i++;
    const u = clamp01((want - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1])), a = path[i - 1], c = path[i];
    puller.position.set(a.x + (c.x - a.x) * u, a.y + (c.y - a.y) * u, z0 + 0.03);
    // The roll: its bottom edge climbs from the ground to rollTop, the rolled fabric thickening its radius as it goes.
    const lift = roll * rollTop, rr = 0.006 + 0.07 * roll;
    let k = 0;
    for (let col = 0; col < NC; col++) {
      const rel = col / (NC - 1), freed = ease(clamp01((zp - rel * 0.9) / 0.1)), h = restH[col];
      const belly = Math.sin(rel * Math.PI) * 0.035 * freed * (1 - roll); // a loose panel bellies out a little once unzipped
      const yE = yb + Math.min(lift, h * 0.92);
      // Wrapped round the roll first (innermost turn first), ending where the flat panel begins.
      for (let j = 0; j < RR; j++) {
        const ang = (1 - j / RR) * TURNS;
        pos[k++] = restX[col]; pos[k++] = yE - rr * Math.sin(ang); pos[k++] = z0 + belly + rr - rr * Math.cos(ang);
      }
      // The flat panel from the roll up to the top of the doorway.
      for (let r = 0; r < NR; r++) {
        const f = r / (NR - 1), y = yE + (yb + h - yE) * f;
        pos[k++] = restX[col]; pos[k++] = y; pos[k++] = z0 + belly * (1 - f);
      }
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  }
  update(0);
  return { group, mesh, update };
}
