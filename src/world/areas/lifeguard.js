// INTERNAL. A lifeguard tower on the camp beach: a raised white wooden stand with a ladder, a seat under a red and
// white shade roof, a rescue buoy and a red-and-yellow flag. A lifeguard (camp staff) sits on top by day watching the
// scouts on the beach and in the water: scanning slowly left and right, now and then through binoculars. At night the
// seat is empty. You can say hello from the foot of the ladder.
// Cost: one welded mesh for the tower (one draw call), one figure.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFigure } from '../../actors/figure.js';

export const TOWER = { x: -18.3, z: 51.3 };
const WATCH = { x: -26, z: 57 }; // the water in front of the beach, where the scouts swim
const DECK = 2.1;                // platform height above the sand
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

// Built facing +z (the lifeguard looks along +z); the ladder is at the back (-z).
function buildTower() {
  const P = [], WHITE = 0xf4f1ea, WOOD = 0xc99a62, RED = 0xe0453a, DARK = 0x6b4a33;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r, h, n = 8) => new THREE.CylinderGeometry(r, r, h, n);
  // Four splayed legs and cross braces
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(piece(cyl(0.07, DECK + 0.1), WHITE, sx * 0.85, DECK / 2, sz * 0.85, sz * 0.06, 0, -sx * 0.06));
  for (const sz of [-1, 1]) P.push(piece(box(1.9, 0.06, 0.06), WHITE, 0, DECK * 0.45, sz * 0.86, 0, 0, 0.55), piece(box(1.9, 0.06, 0.06), WHITE, 0, DECK * 0.45, sz * 0.86, 0, 0, -0.55));
  for (const sx of [-1, 1]) P.push(piece(box(0.06, 0.06, 1.9), WHITE, sx * 0.86, DECK * 0.45, 0, 0.55, 0, 0));
  // Deck, rails (front and sides, open at the ladder)
  P.push(piece(box(1.9, 0.1, 1.9), WOOD, 0, DECK, 0));
  for (const sx of [-0.9, 0.9]) P.push(piece(box(0.05, 0.75, 0.05), WHITE, sx, DECK + 0.4, 0.9), piece(box(0.05, 0.75, 0.05), WHITE, sx, DECK + 0.4, -0.3));
  P.push(piece(box(1.85, 0.06, 0.06), WHITE, 0, DECK + 0.75, 0.9), piece(box(1.85, 0.06, 0.06), WHITE, 0, DECK + 0.42, 0.9));
  for (const sx of [-0.9, 0.9]) P.push(piece(box(0.06, 0.06, 1.25), WHITE, sx, DECK + 0.75, 0.3), piece(box(0.06, 0.06, 1.25), WHITE, sx, DECK + 0.42, 0.3));
  // A red board on the front rail with a white cross
  P.push(piece(box(1.3, 0.34, 0.03), RED, 0, DECK + 0.58, 0.93), piece(box(0.08, 0.24, 0.035), WHITE, 0, DECK + 0.58, 0.95), piece(box(0.24, 0.08, 0.035), WHITE, 0, DECK + 0.58, 0.95));
  // The lifeguard's chair
  P.push(piece(box(0.6, 0.06, 0.5), DARK, 0, DECK + 0.5, 0.05), piece(box(0.6, 0.6, 0.06), DARK, 0, DECK + 0.8, -0.2, -0.15, 0, 0));
  for (const sx of [-0.26, 0.26]) for (const sz of [-0.18, 0.26]) P.push(piece(cyl(0.025, 0.45, 6), DARK, sx, DECK + 0.27, sz));
  // Ladder at the back
  for (const sx of [-0.32, 0.32]) P.push(piece(box(0.07, DECK + 0.6, 0.07), WOOD, sx, (DECK + 0.6) / 2 - 0.05, -1.35, -0.35, 0, 0));
  for (let k = 1; k <= 6; k++) { const y = k * (DECK / 6.5), zz = -1.35 - (y - (DECK + 0.6) / 2) * Math.tan(0.35); P.push(piece(box(0.64, 0.05, 0.08), WOOD, 0, y, zz)); }
  // Shade roof: four posts and a red and white striped canopy
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.85, 0.85]) P.push(piece(cyl(0.035, 1.55), WHITE, sx, DECK + 0.8, sz));
  for (let k = 0; k < 6; k++) P.push(piece(box(0.36, 0.06, 2.05), k % 2 ? WHITE : RED, -0.9 + 0.18 + k * 0.36, DECK + 1.6, 0, 0.12, 0, 0));
  // Flagpole with a red-over-yellow lifeguard flag
  P.push(piece(cyl(0.03, 1.6, 6), WHITE, 0.95, DECK + 2.0, -0.95), piece(box(0.02, 0.2, 0.5), RED, 0.95, DECK + 2.65, -0.7), piece(box(0.02, 0.2, 0.5), 0xf2c94c, 0.95, DECK + 2.45, -0.7));
  // A rescue buoy on the front rail, and a rescue board leaning on a leg
  const ring = new THREE.TorusGeometry(0.22, 0.07, 6, 14);
  P.push(piece(ring, 0xf26a3a, 0.62, DECK + 0.45, 0.98));
  P.push(piece(box(0.5, 2.0, 0.08), 0xf2c94c, -1.05, 0.95, 0.55, 0.12, 0.4, 0.18), piece(box(0.1, 1.6, 0.085), RED, -1.05, 0.95, 0.55, 0.12, 0.4, 0.18));
  const g = mergeGeometries(P); g.computeVertexNormals();
  const m = new THREE.Mesh(g, MAT); m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function create(scene, deps) {
  const { groundAt, keepClear, audio, ui } = deps;
  if (keepClear) keepClear(TOWER.x, TOWER.z, 3.2);
  const y0 = groundAt(TOWER.x, TOWER.z);
  const face = Math.atan2(WATCH.x - TOWER.x, WATCH.z - TOWER.z);
  const tower = buildTower(); tower.position.set(TOWER.x, y0, TOWER.z); tower.rotation.y = face; scene.add(tower);

  // The lifeguard: grown-up camp staff in red, white cap, sitting on the chair.
  const guard = createFigure({ bodyColor: 0xe0453a, shortsColor: 0xf2c94c, skinColor: 0xb07850, hairColor: 0x2f2826, accent: 'cap', accentColor: 0xf4f1ea, neckerchief: null, scale: 1.18 });
  scene.add(guard.group);
  const seatTop = y0 + DECK + 0.53;
  const fwd = { x: Math.sin(face), z: Math.cos(face) };
  const seatAt = { x: TOWER.x + fwd.x * 0.05, z: TOWER.z + fwd.z * 0.05 };
  const foot = { x: TOWER.x - fwd.x * 2.0, z: TOWER.z - fwd.z * 2.0 }; // the bottom of the ladder
  const look = new THREE.Vector3();
  let scan = Math.random() * 10, glass = 0, react = null;

  const LINES = ['Swim between the flags, and never alone!', 'I can see the whole beach from up here.', 'Red flag means no swimming today.', 'Drink water, scout. The sun is strong.', 'Buddy check! Where is your buddy?'];
  let said = 0;
  const onDuty = () => { const t = deps.dayTime(); return t > 0.27 && t < 0.78; };
  const interactables = [{
    id: 'lifeguard', kind: 'villager', speaker: 'Lifeguard', lines: LINES, position: foot,
    get markerY() { return y0 + DECK + 1.9; },
    get enabled() { return onDuty(); },
    prompt: () => 'E — wave to the lifeguard',
    interact() { react = { t: 0, dur: 1.4 }; if (audio) audio.play('whistle'); said++; },
  }];
  // The tower's legs and ladder are solid.
  const colliders = [];
  for (const [lx, lz, r] of [[-0.85, -0.85, 0.12], [0.85, -0.85, 0.12], [-0.85, 0.85, 0.12], [0.85, 0.85, 0.12], [0, -1.45, 0.4]]) {
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
      let rot = face + Math.sin(scan * 0.35) * 0.55;
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
