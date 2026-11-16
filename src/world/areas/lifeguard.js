// INTERNAL. The camp lookout: a tall lifeguard tower near the middle of camp, west of the big fire, where the
// lifeguard can see the whole camp, from the hill to the beach and the pond. A white wooden stand with a long ladder,
// a seat under a red and white shade roof, a rescue buoy and a red-and-yellow flag. A lifeguard (camp staff) sits on
// top by day keeping an eye on the scouts: scanning slowly from the hill round to the beach, now and then through
// binoculars, and sometimes turning to check the camp behind. At night the seat is empty. You can wave from the ladder.
// Cost: one welded mesh for the tower (one draw call), one figure.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFigure } from '../../actors/figure.js';

export const TOWER = { x: -5, z: 24 };
const HILL_TOP = { x: -18, z: -22 }, BEACH = { x: -24.5, z: 42.5 }; // the two ends of what the lifeguard watches
const DECK = 4.2;                // platform height: high enough to see over the tents
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });

function piece(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

// A box from point a to point b (a beam, a leg, a ladder rail).
function bar(a, b, w, d, hex) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
  const g = new THREE.BoxGeometry(w, len, d);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)));
  return piece(g, hex);
}
// Built facing +z (the lifeguard looks along +z); the ladder is at the back (-z).
function buildTower() {
  const P = [], WHITE = 0xf4f1ea, WOOD = 0xc99a62, RED = 0xe0453a, DARK = 0x6b4a33, F = 1.2, T = 0.88;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r, h, n = 8) => new THREE.CylinderGeometry(r, r, h, n);
  // Four splayed legs, X braces on every side at two heights, and a footing under each leg
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { P.push(bar([sx * F, 0, sz * F], [sx * T, DECK, sz * T], 0.13, 0.13, WHITE), piece(box(0.4, 0.12, 0.4), 0x9d958a, sx * F, 0.05, sz * F)); }
  const at = (s, y) => F + (T - F) * (y / DECK) * s;
  for (const [y0, y1] of [[0.25, DECK * 0.5], [DECK * 0.5, DECK - 0.15]]) for (const s of [-1, 1]) {
    P.push(bar([-at(1, y0), y0, s * at(1, y0)], [at(1, y1), y1, s * at(1, y1)], 0.06, 0.06, WHITE), bar([at(1, y0), y0, s * at(1, y0)], [-at(1, y1), y1, s * at(1, y1)], 0.06, 0.06, WHITE));
    P.push(bar([s * at(1, y0), y0, -at(1, y0)], [s * at(1, y1), y1, at(1, y1)], 0.06, 0.06, WHITE), bar([s * at(1, y0), y0, at(1, y0)], [s * at(1, y1), y1, -at(1, y1)], 0.06, 0.06, WHITE));
  }
  // Deck, rails (front and sides, open at the ladder)
  P.push(piece(box(2.0, 0.12, 2.0), WOOD, 0, DECK, 0));
  for (const sx of [-0.95, 0.95]) P.push(piece(box(0.05, 0.8, 0.05), WHITE, sx, DECK + 0.42, 0.95), piece(box(0.05, 0.8, 0.05), WHITE, sx, DECK + 0.42, -0.35));
  P.push(piece(box(1.95, 0.06, 0.06), WHITE, 0, DECK + 0.8, 0.95), piece(box(1.95, 0.06, 0.06), WHITE, 0, DECK + 0.45, 0.95));
  for (const sx of [-0.95, 0.95]) P.push(piece(box(0.06, 0.06, 1.3), WHITE, sx, DECK + 0.8, 0.3), piece(box(0.06, 0.06, 1.3), WHITE, sx, DECK + 0.45, 0.3));
  // A red board on the front rail with a white cross
  P.push(piece(box(1.3, 0.34, 0.03), RED, 0, DECK + 0.62, 0.98), piece(box(0.08, 0.24, 0.035), WHITE, 0, DECK + 0.62, 1.0), piece(box(0.24, 0.08, 0.035), WHITE, 0, DECK + 0.62, 1.0));
  // The lifeguard's chair
  P.push(piece(box(0.6, 0.06, 0.5), DARK, 0, DECK + 0.5, 0.05), piece(box(0.6, 0.6, 0.06), DARK, 0, DECK + 0.8, -0.2, -0.15, 0, 0));
  for (const sx of [-0.26, 0.26]) for (const sz of [-0.18, 0.26]) P.push(piece(cyl(0.025, 0.45, 6), DARK, sx, DECK + 0.27, sz));
  // A long ladder up the back
  const L0 = [0, 0, -2.3], L1 = [0, DECK + 0.05, -1.0];
  for (const sx of [-0.33, 0.33]) P.push(bar([sx, L0[1], L0[2]], [sx, L1[1] + 0.9, L1[2] + 0.28], 0.08, 0.08, WOOD));
  const RUNGS = 14;
  for (let k = 1; k <= RUNGS; k++) { const u = k / (RUNGS + 1); P.push(piece(box(0.66, 0.05, 0.09), WOOD, 0, L0[1] + (L1[1] - L0[1]) * u, L0[2] + (L1[2] - L0[2]) * u)); }
  // Shade roof: four posts and a red and white striped canopy
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.9, 0.9]) P.push(piece(cyl(0.035, 1.6), WHITE, sx, DECK + 0.82, sz));
  for (let k = 0; k < 6; k++) P.push(piece(box(0.37, 0.06, 2.1), k % 2 ? WHITE : RED, -0.925 + 0.185 + k * 0.37, DECK + 1.64, 0, 0.12, 0, 0));
  // Flagpole with a red-over-yellow lifeguard flag
  P.push(piece(cyl(0.03, 1.8, 6), WHITE, 1.0, DECK + 2.1, -1.0), piece(box(0.02, 0.22, 0.55), RED, 1.0, DECK + 2.85, -0.72), piece(box(0.02, 0.22, 0.55), 0xf2c94c, 1.0, DECK + 2.63, -0.72));
  // A rescue buoy on the front rail, and a rescue board leaning on a leg
  P.push(piece(new THREE.TorusGeometry(0.22, 0.07, 6, 14), 0xf26a3a, 0.62, DECK + 0.48, 1.02));
  P.push(piece(box(0.5, 2.0, 0.08), 0xf2c94c, -1.4, 0.95, 0.7, 0.12, 0.4, 0.18), piece(box(0.1, 1.6, 0.085), RED, -1.4, 0.95, 0.7, 0.12, 0.4, 0.18));
  const g = mergeGeometries(P); g.computeVertexNormals();
  const m = new THREE.Mesh(g, MAT); m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function create(scene, deps) {
  const { groundAt, keepClear, audio, ui } = deps;
  if (keepClear) keepClear(TOWER.x, TOWER.z, 3.5);
  const y0 = groundAt(TOWER.x, TOWER.z);
  // Faces halfway between the hill and the beach, and scans across both.
  const toHill = Math.atan2(HILL_TOP.x - TOWER.x, HILL_TOP.z - TOWER.z), toBeach = Math.atan2(BEACH.x - TOWER.x, BEACH.z - TOWER.z);
  const half = Math.atan2(Math.sin(toHill - toBeach), Math.cos(toHill - toBeach)) / 2, face = toBeach + half, sweep = Math.abs(half) + 0.15;
  const tower = buildTower(); tower.position.set(TOWER.x, y0, TOWER.z); tower.rotation.y = face; scene.add(tower);

  // The lifeguard: grown-up camp staff in red, white cap, sitting on the chair.
  const guard = createFigure({ bodyColor: 0xe0453a, shortsColor: 0xf2c94c, skinColor: 0xb07850, hairColor: 0x2f2826, accent: 'cap', accentColor: 0xf4f1ea, neckerchief: null, scale: 1.18 });
  scene.add(guard.group);
  const seatTop = y0 + DECK + 0.53;
  const fwd = { x: Math.sin(face), z: Math.cos(face) };
  const seatAt = { x: TOWER.x + fwd.x * 0.05, z: TOWER.z + fwd.z * 0.05 };
  const foot = { x: TOWER.x - fwd.x * 2.7, z: TOWER.z - fwd.z * 2.7 }; // the bottom of the ladder
  const look = new THREE.Vector3();
  let scan = Math.random() * 10, glass = 0, react = null;

  const LINES = ['I can see the whole camp from up here: the hill, the pond and the beach.', 'Swim between the flags, and never alone!', 'Red flag means no swimming today.', 'Drink water, scout. The sun is strong.', 'Buddy check! Where is your buddy?', 'Stay out of the wild jungle. I am watching!'];
  let said = 0;
  const onDuty = () => { const t = deps.dayTime(); return t > 0.27 && t < 0.78; };
  const interactables = [{
    id: 'lifeguard', kind: 'villager', speaker: 'Lifeguard', lines: LINES, position: foot,
    get markerY() { return y0 + 2.2; },
    get enabled() { return onDuty(); },
    prompt: () => 'E — wave to the lifeguard',
    interact() { react = { t: 0, dur: 1.4 }; if (audio) audio.play('whistle'); said++; },
  }];
  // The tower's legs and ladder are solid.
  const colliders = [];
  for (const [lx, lz, r] of [[-1.2, -1.2, 0.2], [1.2, -1.2, 0.2], [-1.2, 1.2, 0.2], [1.2, 1.2, 0.2], [0, -2.0, 0.42]]) {
    colliders.push({ x: TOWER.x + lx * Math.cos(face) + lz * fwd.x, z: TOWER.z - lx * Math.sin(face) + lz * fwd.z, r });
  }

  return {
    interactables, colliders,
    update(dt, elapsed, player) {
      const near = Math.hypot(player.position.x - TOWER.x, player.position.z - TOWER.z);
      tower.visible = near < 160;
      const duty = onDuty();
      guard.group.visible = duty && near < 90;
      if (!guard.group.visible) return;
      // Scanning the beach: the body turns slowly a little left and right; now and then the binoculars come up.
      scan += dt;
      glass = Math.max(0, glass - dt);
      if (glass <= 0 && Math.random() < dt / 9) glass = 3 + Math.random() * 3;
      // From the hill round to the beach and back; every half minute or so a look over the shoulder at the camp.
      const back = Math.max(0, Math.sin(scan * 0.21) - 0.93) * 14;
      let rot = face + Math.sin(scan * 0.3) * sweep + back * Math.PI * 0.9;
      if (react) { react.t += dt; rot = Math.atan2(player.position.x - seatAt.x, player.position.z - seatAt.z); if (react.t > react.dur) react = null; }
      guard.group.position.set(seatAt.x, seatTop + guard.seatLift(0) - 0.07, seatAt.z);
      guard.group.rotation.y += (rot - guard.group.rotation.y) * Math.min(1, dt * 3);
      look.set(seatAt.x + Math.sin(rot) * 10, 0, seatAt.z + Math.cos(rot) * 10);
      guard.animate(0, elapsed, {
        sitting: true, pose: react ? undefined : glass > 0 ? 'binoculars' : undefined,
        gesture: react ? { name: 'wave', u: react.t / react.dur } : null, look: react ? player.position : look,
      });
      void ui; void said;
    },
  };
}
