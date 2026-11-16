// INTERNAL. The camp guard tower: a tall, heavy timber lookout near the middle of camp (west of the big fire), as high
// as the tallest camp trees, so the lifeguard on duty can watch the whole camp from the hill to the beach and the pond.
// Four thick splayed legs on concrete footings, ring beams and X braces at every storey, a closed lookout cabin with
// plank half-walls under a hip roof, a balcony out front with a big searchlight (its beam sweeps the camp at night)
// and a telescope on the balcony rail, a siren and a flag. Inside the frame a caged ladder runs straight up through a
// hatch in the cabin floor: press E at its foot to climb up (you climb it yourself, rung by rung), walk round the cabin
// and out onto the balcony through the door on the left, use the telescope (3x to 12x, src/scope.js), then press E at
// the hatch to climb back down. The lifeguard sits at the front window by day.
// Cost: three welded meshes (frame and cabin, roof, searchlight head), a beam cone at night, one figure. The cabin and
// balcony floors are only walkable (platforms) while you are up there, so nobody at ground level is lifted onto them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFigure } from '../../actors/figure.js';

export const TOWER = { x: -5, z: 24 };
const HILL_TOP = { x: -18, z: -22 }, BEACH = { x: -24.5, z: 42.5 }; // the two ends of what the lifeguard watches
const DECK = 8.6;                        // cabin floor height: the roof peak ends up about 12.5 m, tree height
const BASE = 2.1, TOP = 1.65;            // half-spread of the legs at the ground and under the cabin
const CAB = 1.8;                         // half-size of the cabin floor
const BAL = 1.5;                         // how far the balcony reaches out in front of the cabin
const DOOR = [-1.45, -0.55];             // the doorway in the cabin's front wall, out to the balcony (x from, to)
const SCOPE = { x: 0.2, z: CAB + BAL - 0.32 }; // the telescope on the balcony rail
const LAMP = { x: CAB - 0.3, z: CAB + BAL - 0.3 }; // the searchlight on the balcony's front corner
const LAD = { x: -0.95, z: -1.05 };      // the ladder (and the hatch above it), in the tower's own frame
const RUNG = 0.3, RUNG_TIME = 0.26;
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });

function tint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function piece(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  return tint(g, hex);
}
// A square beam from point a to point b.
function bar(a, b, w, hex) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
  const g = new THREE.BoxGeometry(w, len, w).toNonIndexed();
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)));
  return tint(g, hex);
}

// Built facing +z (the lifeguard looks out along +z).
function buildTower() {
  const P = [], R = [];
  const TIMBER = 0x7a5536, DARKT = 0x5e4129, PLANK = 0xa77c4f, STEEL = 0x5d636b, CONCRETE = 0xa8a39a, RED = 0xd8443a, WHITE = 0xf2efe6;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r, h, n = 10) => new THREE.CylinderGeometry(r, r, h, n);
  const spread = (y) => BASE + (TOP - BASE) * (y / DECK);
  // Legs on concrete footings, with steel bands
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.push(piece(box(0.75, 0.35, 0.75), CONCRETE, sx * BASE, 0.1, sz * BASE));
    P.push(bar([sx * BASE, 0, sz * BASE], [sx * TOP, DECK, sz * TOP], 0.34, TIMBER));
    for (const y of [0.45, 3.0, 5.6]) { const s = spread(y); P.push(piece(box(0.38, 0.08, 0.38), STEEL, sx * s, y, sz * s)); }
  }
  // Ring beams at each storey (head height first, so you can walk in under it), with X braces between them
  const LEVELS = [2.5, 4.6, 6.6, DECK - 0.2];
  for (const y of LEVELS) { const s = spread(y); for (const k of [-1, 1]) { P.push(bar([-s, y, k * s], [s, y, k * s], 0.24, DARKT), bar([k * s, y, -s], [k * s, y, s], 0.24, DARKT)); } }
  for (let i = 0; i < LEVELS.length - 1; i++) {
    const y0 = LEVELS[i], y1 = LEVELS[i + 1], a = spread(y0), b = spread(y1);
    for (const k of [-1, 1]) {
      P.push(bar([-a, y0, k * a], [b, y1, k * b], 0.14, DARKT), bar([a, y0, k * a], [-b, y1, k * b], 0.14, DARKT));
      P.push(bar([k * a, y0, -a], [k * b, y1, b], 0.14, DARKT), bar([k * a, y0, a], [k * b, y1, -b], 0.14, DARKT));
    }
  }
  // Knee braces from the legs up to the first ring, leaving the ground open
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const s = spread(1.4), t = spread(2.5); P.push(bar([sx * s, 1.4, sz * s], [sx * t * 0.55, 2.5, sz * t], 0.12, DARKT)); }
  // The ladder: two rails from the ground up through the hatch, rungs, and a safety cage of hoops from 2.4 m up
  const lx = LAD.x, lz = LAD.z - 0.24; // the rails stand behind the climber
  for (const dx of [-0.24, 0.24]) P.push(bar([lx + dx, 0, lz], [lx + dx, DECK + 1.05, lz], 0.06, STEEL));
  for (let y = RUNG; y < DECK + 0.9; y += RUNG) P.push(piece(box(0.5, 0.035, 0.035), STEEL, lx, y, lz));
  for (let y = 2.4; y < DECK - 0.3; y += 0.9) {
    const hoop = new THREE.TorusGeometry(0.42, 0.025, 4, 12, Math.PI); hoop.rotateX(Math.PI / 2);
    P.push(piece(hoop, STEEL, lx, y, lz + 0.02));
  }
  for (const a of [0.5, 1.6, 2.65]) P.push(bar([lx + Math.cos(a) * 0.42, 2.4, lz + Math.sin(a) * 0.42], [lx + Math.cos(a) * 0.42, DECK - 0.35, lz + Math.sin(a) * 0.42], 0.03, STEEL));
  // Cabin floor, with the hatch over the ladder left open
  const F = CAB, h0 = LAD.x - 0.45, h1 = LAD.x + 0.45, k0 = LAD.z - 0.45, k1 = LAD.z + 0.45, FY = DECK;
  const slab = (x0, x1, z0, z1) => P.push(piece(box(x1 - x0, 0.16, z1 - z0), PLANK, (x0 + x1) / 2, FY, (z0 + z1) / 2));
  slab(h1, F, -F, F); slab(-F, h0, -F, F); slab(h0, h1, k1, F); slab(h0, h1, -F, k0);
  P.push(piece(box(0.95, 0.05, 0.05), STEEL, LAD.x, FY + 0.1, k0), piece(box(0.95, 0.05, 0.05), STEEL, LAD.x, FY + 0.1, k1)); // hatch rim
  // Floor joists showing under the cabin
  for (const x of [-1.65, 0.2, 1.3]) P.push(piece(box(0.16, 0.22, 2 * F), DARKT, x, FY - 0.18, 0)); // clear of the hatch
  // Corner posts, plank half-walls, a window sill, and the sign board on the front
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(piece(box(0.16, 2.55, 0.16), TIMBER, sx * (F - 0.08), FY + 1.35, sz * (F - 0.08)));
  // Half-walls: back and sides whole, the front with a doorway out to the balcony
  const wallX = (x0, x1, z, y, col) => P.push(piece(box(x1 - x0, 0.22, 0.06), col, (x0 + x1) / 2, y, z));
  for (let k = 0; k < 4; k++) {
    const y = FY + 0.22 + k * 0.25, col = k % 2 ? PLANK : 0x9a7046;
    wallX(-F, F, -(F - 0.03), y, col); wallX(-F, DOOR[0], F - 0.03, y, col); wallX(DOOR[1], F, F - 0.03, y, col);
    for (const s of [-1, 1]) P.push(piece(box(0.06, 0.22, 2 * F), col, s * (F - 0.03), y, 0));
  }
  P.push(piece(box(2 * F + 0.1, 0.07, 0.2), DARKT, 0, FY + 1.18, -(F - 0.03)));
  P.push(piece(box(DOOR[0] + F, 0.07, 0.2), DARKT, (-F + DOOR[0]) / 2, FY + 1.18, F - 0.03), piece(box(F - DOOR[1], 0.07, 0.2), DARKT, (DOOR[1] + F) / 2, FY + 1.18, F - 0.03));
  for (const s of [-1, 1]) P.push(piece(box(0.2, 0.07, 2 * F + 0.1), DARKT, s * (F - 0.03), FY + 1.18, 0));
  for (const x of DOOR) P.push(piece(box(0.1, 2.5, 0.12), TIMBER, x, FY + 1.3, F - 0.03)); // door posts
  P.push(piece(box(1.0, 0.42, 0.04), RED, 0.4, FY + 0.62, F + 0.02), piece(box(0.1, 0.3, 0.045), WHITE, 0.4, FY + 0.62, F + 0.04), piece(box(0.3, 0.1, 0.045), WHITE, 0.4, FY + 0.62, F + 0.04));
  // ---- The balcony: a plank floor out in front, braced from the legs below, with a rail all round its open sides
  const BZ = F + BAL;
  P.push(piece(box(2 * F, 0.14, BAL), PLANK, 0, FY, F + BAL / 2));
  P.push(piece(box(2 * F, 0.2, 0.18), DARKT, 0, FY - 0.17, BZ - 0.1));
  for (const sx of [-1, 1]) {
    P.push(piece(box(0.18, 0.2, BAL + 0.2), DARKT, sx * (F - 0.1), FY - 0.17, F + BAL / 2));
    P.push(bar([sx * (TOP - 0.05), FY - 2.0, TOP], [sx * (F - 0.1), FY - 0.2, BZ - 0.12], 0.16, DARKT)); // struts from the legs
  }
  for (const x of [-F + 0.05, -F / 2, 0, F / 2, F - 0.05]) P.push(piece(box(0.09, 1.05, 0.09), TIMBER, x, FY + 0.55, BZ - 0.05));
  for (const sx of [-1, 1]) for (const z of [F + 0.5, F + 1.0]) P.push(piece(box(0.09, 1.05, 0.09), TIMBER, sx * (F - 0.05), FY + 0.55, z));
  for (const y of [FY + 1.05, FY + 0.6]) {
    P.push(piece(box(2 * F, 0.07, 0.07), TIMBER, 0, y, BZ - 0.05));
    for (const sx of [-1, 1]) P.push(piece(box(0.07, 0.07, BAL), TIMBER, sx * (F - 0.05), y, F + BAL / 2));
  }
  P.push(piece(box(2 * F, 0.16, 0.03), RED, 0, FY + 0.15, BZ - 0.02)); // toe board
  // ---- The telescope on its tripod at the rail, looking out over the camp
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.5; P.push(bar([SCOPE.x + Math.cos(a) * 0.32, FY + 0.06, SCOPE.z - 0.15 + Math.sin(a) * 0.32], [SCOPE.x, FY + 1.05, SCOPE.z - 0.15], 0.035, STEEL)); }
  P.push(piece(cyl(0.05, 0.12, 8), STEEL, SCOPE.x, FY + 1.1, SCOPE.z - 0.15));
  P.push(piece(new THREE.CylinderGeometry(0.07, 0.05, 0.9, 12), 0x2f5f8f, SCOPE.x, FY + 1.22, SCOPE.z - 0.1, Math.PI / 2 - 0.1, 0, 0));
  P.push(piece(cyl(0.085, 0.12, 12), 0xd8b25a, SCOPE.x, FY + 1.255, SCOPE.z + 0.33, Math.PI / 2 - 0.1, 0, 0), piece(cyl(0.035, 0.1, 8), 0x1d2228, SCOPE.x, FY + 1.18, SCOPE.z - 0.58, Math.PI / 2 - 0.1, 0, 0));
  // ---- The searchlight's stand (its head turns, built separately)
  P.push(piece(cyl(0.09, 1.1, 8), STEEL, LAMP.x, FY + 0.6, LAMP.z), piece(box(0.5, 0.06, 0.06), STEEL, LAMP.x, FY + 1.18, LAMP.z));
  // The lifeguard's high chair at the front window
  P.push(piece(box(0.6, 0.06, 0.5), 0x3f4f6a, 0, FY + 0.6, F - 0.75), piece(box(0.6, 0.7, 0.06), 0x3f4f6a, 0, FY + 0.95, F - 1.02, -0.12, 0, 0));
  for (const sx of [-0.26, 0.26]) for (const dz of [-0.2, 0.2]) P.push(piece(cyl(0.025, 0.55, 6), STEEL, sx, FY + 0.32, F - 0.75 + dz));
  // Rescue buoy on the front wall
  P.push(piece(new THREE.TorusGeometry(0.24, 0.075, 6, 14), 0xf26a3a, 1.3, FY + 0.62, F + 0.06));
  // ---- The roof, apart (one mesh of its own)
  const roof = new THREE.ConeGeometry(F * 1.62, 1.35, 4, 1); roof.rotateY(Math.PI / 4);
  R.push(piece(roof, RED, 0, FY + 2.6 + 0.67, 0));
  R.push(piece(box(2 * F + 0.5, 0.1, 2 * F + 0.5), DARKT, 0, FY + 2.62, 0));
  R.push(piece(cyl(0.03, 1.6, 6), WHITE, 0, FY + 4.2, 0), piece(box(0.02, 0.26, 0.62), RED, 0, FY + 4.85, 0.32), piece(box(0.02, 0.26, 0.62), 0xf2c94c, 0, FY + 4.6, 0.32));
  R.push(piece(new THREE.CylinderGeometry(0.06, 0.2, 0.32, 10, 1, true), 0xd9dce0, F - 0.1, FY + 2.95, -F + 0.1, 0, 0, Math.PI / 2)); // the siren horn
  // ---- The searchlight's head: a drum on a yoke, turning on its stand; the lens glows at night
  const H = [];
  H.push(piece(box(0.06, 0.4, 0.06), STEEL, -0.27, 0.2, 0), piece(box(0.06, 0.4, 0.06), STEEL, 0.27, 0.2, 0));
  H.push(piece(new THREE.CylinderGeometry(0.26, 0.22, 0.55, 14), 0x3a3f46, 0, 0.36, 0, Math.PI / 2, 0, 0));
  H.push(piece(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 14), 0x2a2e33, 0, 0.36, 0.28, Math.PI / 2, 0, 0));
  const make = (list) => { const g = mergeGeometries(list); g.computeVertexNormals(); const m = new THREE.Mesh(g, MAT); m.castShadow = true; m.receiveShadow = true; return m; };
  const head = new THREE.Group(); head.add(make(H));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 18), new THREE.MeshBasicMaterial({ color: 0x9a9a8a })); lens.position.set(0, 0.36, 0.325); head.add(lens);
  // The beam: a long soft cone of light from the lens (only drawn at night).
  const beamGeo = new THREE.CylinderGeometry(0.24, 3.4, 30, 20, 1, true); beamGeo.translate(0, 15, 0); beamGeo.rotateX(Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c4, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.position.set(0, 0.36, 0.33); beam.visible = false; head.add(beam);
  return { frame: make(P), roof: make(R), head, lens, beam };
}

export function create(scene, deps) {
  const { groundAt, heightAt, keepClear, audio, addPlatform, removePlatform } = deps;
  const ground = heightAt || groundAt;
  if (keepClear) keepClear(TOWER.x, TOWER.z, 3.6);
  const y0 = ground(TOWER.x, TOWER.z);
  // Faces halfway between the hill and the beach, and scans across both.
  const toHill = Math.atan2(HILL_TOP.x - TOWER.x, HILL_TOP.z - TOWER.z), toBeach = Math.atan2(BEACH.x - TOWER.x, BEACH.z - TOWER.z);
  const half = Math.atan2(Math.sin(toHill - toBeach), Math.cos(toHill - toBeach)) / 2, face = toBeach + half, sweep = Math.abs(half) + 0.15;
  const cosF = Math.cos(face), sinF = Math.sin(face);
  const W = (lx, lz) => ({ x: TOWER.x + lx * cosF + lz * sinF, z: TOWER.z - lx * sinF + lz * cosF });
  const { frame, roof, head, lens, beam } = buildTower();
  for (const m of [frame, roof]) { m.position.set(TOWER.x, y0, TOWER.z); m.rotation.y = face; scene.add(m); }
  const deckTop = y0 + DECK + 0.08;
  const lampAt = W(LAMP.x, LAMP.z); head.position.set(lampAt.x, y0 + DECK + 1.21, lampAt.z); head.rotation.order = 'YXZ'; scene.add(head);

  // ---- The lifeguard at the front window, by day
  const guard = createFigure({ bodyColor: 0xe0453a, shortsColor: 0xf2c94c, skinColor: 0xb07850, hairColor: 0x2f2826, accent: 'cap', accentColor: 0xf4f1ea, neckerchief: null, scale: 1.18 });
  scene.add(guard.group);
  const seat = W(0, CAB - 0.75);
  const look = new THREE.Vector3();
  let scan = Math.random() * 10, glass = 0, react = null;
  const onDuty = () => { const t = deps.dayTime(); return t > 0.27 && t < 0.78; };

  // ---- Climbing: you go up and down the ladder yourself; the cabin floor is walkable only while you are up there
  const foot = W(LAD.x, LAD.z + 0.32), hatch = W(LAD.x, LAD.z + 0.62), up0 = W(LAD.x, LAD.z + 0.05);
  const climb = { phase: 'ground', t: 0, deck: null };
  // air: 0 marks the body as off the ground, so the feet are not planted on the grass far below (src/actors/figure.js).
  const ro = { pose: 'climb', climb: 0, air: 0, land: 0, gesture: null };
  // cam: while you climb, the camera watches from just outside the frame behind the ladder (see main.js), so the
  // beams and the cabin floor never hide you.
  const cam = { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 } };
  const riding = { heading: face + Math.PI, speed: 0, pitch: 0, roll: 0, opts: ro, label: 'Guard tower ladder', hint: 'climbing the ladder', camSpeed: 0, cam };
  // Inside the frame (nothing between you and the camera but the thin cage), or in the cabin for the last step.
  const camIn = W(0.8, 0.6), camTop = W(0.95, 1.0);
  function aimCam(player) {
    const y = player.position.y, top = y > deckTop - 1.5, at = top ? camTop : camIn;
    cam.pos.x = at.x; cam.pos.z = at.z; cam.pos.y = top ? deckTop + 1.8 : Math.min(y + 0.75, deckTop - 0.5);
    cam.look.x = player.position.x; cam.look.y = y + (top ? 0.5 : 0.8); cam.look.z = player.position.z;
  }
  const rungs = Math.round((DECK - 0.2) / RUNG);
  // While you are up: the back and side walls, the front wall either side of the door, the balcony rail, the telescope and lamp.
  const walls = [[0, -CAB, CAB + 0.1, 0.08], [CAB, 0, 0.08, CAB + 0.1], [-CAB, 0, 0.08, CAB + 0.1],
    [(-CAB + DOOR[0]) / 2, CAB, (DOOR[0] + CAB) / 2, 0.08], [(DOOR[1] + CAB) / 2, CAB, (CAB - DOOR[1]) / 2, 0.08],
    [0, CAB + BAL, CAB, 0.08], [CAB, CAB + BAL / 2, 0.08, BAL / 2], [-CAB, CAB + BAL / 2, 0.08, BAL / 2]].map(([lx, lz, hw, hd]) => ({ ...W(lx, lz), hw, hd, rot: face }))
    .concat([{ ...W(SCOPE.x, SCOPE.z - 0.15), r: 0.3 }, { ...W(LAMP.x, LAMP.z), r: 0.25 }]);
  // Railing round the hatch while you are up, so you do not step into it by accident (E goes down).
  const hatchRail = { ...W(LAD.x, LAD.z - 0.05), hw: 0.48, hd: 0.42, rot: face };
  function startUp(player) {
    player.riding = riding; climb.phase = 'climbUp'; climb.t = 0; riding.heading = face + Math.PI;
    player.position.set(foot.x, ground(foot.x, foot.z), foot.z); aimCam(player);
  }
  function startDown(player) {
    if (climb.deck) { for (const q of climb.deck) removePlatform(q); climb.deck = null; }
    player.riding = riding; climb.phase = 'climbDown'; climb.t = 0; riding.heading = face + Math.PI;
    player.position.set(up0.x, deckTop, up0.z); aimCam(player);
  }
  function stepClimb(dt, player) {
    climb.t += dt;
    aimCam(player);
    const total = rungs + 1;
    let c = climb.phase === 'climbUp' ? Math.min(total, climb.t / RUNG_TIME) : Math.max(0, total - climb.t / RUNG_TIME);
    ro.climb = c; riding.heading = face + Math.PI;
    const k = Math.floor(c), u = c - k, s = u * u * (3 - 2 * u), rung = Math.min(total, k + s);
    const g = ground(foot.x, foot.z);
    if (rung <= rungs) { const p = W(LAD.x, LAD.z + 0.32 - 0.27 * Math.min(1, rung)); player.position.set(p.x, g + RUNG * rung, p.z); }
    else { const f = rung - rungs, p = W(LAD.x, LAD.z + 0.3 + 0.35 * f); player.position.set(p.x, g + RUNG * rungs + (deckTop - g - RUNG * rungs) * f, p.z); }
    if (Math.floor(climb.t / RUNG_TIME) !== Math.floor((climb.t - dt) / RUNG_TIME) && audio) audio.play('step:wood');
    if (climb.phase === 'climbUp' && c >= total) {
      const bc = W(0, CAB + BAL / 2 - 0.02);
      climb.deck = [addPlatform({ shape: 'box', x: TOWER.x, z: TOWER.z, rot: face, hw: CAB - 0.1, hd: CAB - 0.05, top: deckTop, surface: 'wood', id: 'guard-tower-deck' }),
        addPlatform({ shape: 'box', x: bc.x, z: bc.z, rot: face, hw: CAB - 0.1, hd: BAL / 2 + 0.02, top: deckTop, surface: 'wood', id: 'guard-tower-balcony' })];
      const p = W(LAD.x, LAD.z + 0.75); player.position.set(p.x, deckTop, p.z);
      player.riding = null; climb.phase = 'up';
      if (deps.discover) deps.discover('guard-tower');
      if (deps.say) deps.say('You can see the whole camp from up here!', '🔭');
    } else if (climb.phase === 'climbDown' && c <= 0) {
      player.position.set(foot.x, ground(foot.x, foot.z), foot.z);
      player.riding = null; climb.phase = 'ground';
    }
  }

  const interactables = [
    { id: 'guard-ladder', kind: 'ladder', position: foot, markerY: y0 + 2.0, get enabled() { return climb.phase === 'ground'; }, prompt: () => 'E — climb the guard tower', interact() { startUp(deps.player); } },
    { id: 'guard-hatch', kind: 'ladder', position: hatch, get markerY() { return deckTop + 0.5; }, get enabled() { return climb.phase === 'up'; }, prompt: () => 'E — climb down', interact() { startDown(deps.player); } },
    {
      id: 'guard-scope', kind: 'telescope', position: W(SCOPE.x, SCOPE.z - 0.75), get markerY() { return deckTop + 1.6; },
      get enabled() { return climb.phase === 'up' && !!deps.scope; },
      prompt: () => 'E — look through the telescope',
      interact() {
        const stand = W(SCOPE.x, SCOPE.z - 0.85), eye = W(SCOPE.x, SCOPE.z + 0.55); // the view starts just past the front lens
        deps.player.position.set(stand.x, deckTop, stand.z);
        deps.scope.open({ x: eye.x, y: deckTop + 1.22, z: eye.z }, face, -0.2); // tipped down a little, at the camp
        if (deps.discover) deps.discover('telescope');
      },
    },
    {
      id: 'lifeguard', kind: 'villager', speaker: 'Lifeguard', position: seat, get markerY() { return deckTop + 1.9; },
      lines: ['I can see the whole camp from up here: the hill, the pond and the beach.', 'Swim between the flags, and never alone!', 'Buddy check! Where is your buddy?', 'Stay out of the wild jungle. I am watching!', 'Hold the ladder with both hands on the way down.'],
      get enabled() { return climb.phase === 'up' && onDuty(); },
      prompt: () => 'E — say hello to the lifeguard',
      interact() { react = { t: 0, dur: 1.4 }; if (audio) audio.play('squeak'); },
    },
  ];
  // Solid legs always; the cabin walls and the hatch rail only while you are in the cabin.
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ ...W(sx * BASE, sz * BASE), r: 0.42 })));
  const cols = [];

  return {
    interactables,
    colliders() { cols.length = 0; cols.push(...legs); if (climb.phase === 'up') cols.push(...walls, hatchRail); return cols; },
    update(dt, elapsed, player, night = 0) {
      if (climb.phase === 'climbUp' || climb.phase === 'climbDown') stepClimb(dt, player);
      // Fell or got moved off the deck somehow (a soft failure, a wait): back to the ground state.
      if (climb.phase === 'up' && (Math.hypot(player.position.x - TOWER.x, player.position.z - TOWER.z) > CAB + BAL + 1.2 || player.position.y < deckTop - 1)) { if (climb.deck) { for (const q of climb.deck) removePlatform(q); climb.deck = null; } climb.phase = 'ground'; }
      const near = Math.hypot(player.position.x - TOWER.x, player.position.z - TOWER.z);
      frame.visible = roof.visible = head.visible = near < 220;
      // The searchlight sweeps slowly across the camp after dark, its lens lit.
      const dark = night > 0.45;
      head.rotation.y = face + Math.sin(elapsed * 0.22) * 1.25; head.rotation.x = dark ? 0.24 + Math.sin(elapsed * 0.13) * 0.06 : 0.1;
      beam.visible = dark && head.visible; lens.material.color.setHex(dark ? 0xfff6d8 : 0x9a9a8a);
      guard.group.visible = onDuty() && near < 110;
      if (!guard.group.visible) return;
      // Scanning from the hill round to the beach; every half minute or so a look back over the camp; binoculars now and then.
      scan += dt;
      glass = Math.max(0, glass - dt);
      if (glass <= 0 && Math.random() < dt / 9) glass = 3 + Math.random() * 3;
      const back = Math.max(0, Math.sin(scan * 0.21) - 0.93) * 14;
      let rot = face + Math.sin(scan * 0.3) * sweep + back * Math.PI * 0.9;
      if (react) { react.t += dt; rot = Math.atan2(player.position.x - seat.x, player.position.z - seat.z); if (react.t > react.dur) react = null; }
      let d = rot - guard.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      guard.group.rotation.y += d * Math.min(1, dt * 3);
      guard.group.position.set(seat.x, y0 + DECK + 0.63 + guard.seatLift(0) - 0.07, seat.z);
      look.set(seat.x + Math.sin(rot) * 10, y0 + DECK, seat.z + Math.cos(rot) * 10);
      guard.animate(0, elapsed, {
        sitting: true, pose: react ? undefined : glass > 0 ? 'binoculars' : undefined,
        gesture: react ? { name: 'wave', u: react.t / react.dur } : null, look: react ? player.position : look,
      });
    },
  };
}
