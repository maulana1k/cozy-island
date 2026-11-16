// The camp's walk-in structures: canvas tents and bamboo-and-tarp shelters.
// Open the flap and walk in; the top is sliced away so you can see inside.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { COTTAGES, toWorld, floorHeight, BED_PLAN } from '../logic/layout.js';
import { box, cyl, ball, stick, roofGeometry, shared, texture, mergeStatic } from './build.js';
import { createZipDoor } from './zipDoor.js';
import { familyTunnelTent, geodesicTent, groupShelter, utilityTent, TENT_COLORS } from '../kit/tents.js';

const CUT = 1.15;            // height the walls are sliced at while you are inside
const DOOR_W = 1.1, DOOR_H = 1.85;
const tentAccent = (c) => new THREE.Color(c).lerp(new THREE.Color(0x14171b), 0.2);
const BAMBOO = 0xd8bb72, ROPE = 0xe9dcc0;

const STYLES = {
  hall: { wallH: 2.4, roofH: 0.6, canvas: 0xf5ecd6, roof: 0xf0e2c2, trim: 0xd9634a, floor: 0xc9b48c },
  patrol: { wallH: 2.0, roofH: 1.3, canvas: 0xb9c79a, roof: 0xa9b98a, trim: 0xf2b63b, floor: 0xb7a07a },
  mess: { wallH: 1.8, roofH: 0.5, canvas: 0xf8ecc6, roof: 0xe58a5c, trim: 0xe07a4f, floor: 0xc4ab82 },
  aid: { wallH: 2.0, roofH: 1.1, canvas: 0xfbf8f0, roof: 0xf3efe4, trim: 0xd9453a, floor: 0xd9d2c0 },
  farm: { wallH: 2.1, roofH: 1.2, canvas: 0xd3bb86, roof: 0x7f9a66, trim: 0x7f9a66, floor: 0xb99a6a },
  guard: { wallH: 2.1, roofH: 0.9, canvas: 0xc2cba3, roof: 0x8fa678, trim: 0xf2b63b, floor: 0xb7a07a },
  staff: { wallH: 2.2, roofH: 1.3, canvas: 0xefe6d2, roof: 0xb9a27c, trim: 0x6a3f9c, floor: 0xc4ab82 },
};
// The modern hiking tents (src/kit/tents.js) that stand in for the old canvas halls. `s` stretches a kit tent to the
// building's footprint; `door` is the doorway { w, h, z } (z: where the flap hangs, local) or null for an open shelter.
// farm and guard are wooden sheds and keep their old build.
const PATROL_TENT_COLORS = [TENT_COLORS.forest, TENT_COLORS.orange, TENT_COLORS.slate, TENT_COLORS.mustard];
const TENT_PLAN = {
  hall: { make: groupShelter, o: { color: TENT_COLORS.brick, backWall: true }, s: [2, 1.2, 1.5], legs: [3.64, 2.73], back: -2.73 },
  patrol: { make: familyTunnelTent, o: {}, s: [1, 1, 1], door: { w: 1.7, h: 2.0, z: 3.3 } },
  staff: { make: geodesicTent, o: { open: true, color: 0xa488b0 }, s: [2.3, 1.6, 2.3], door: { w: 1.9, h: 1.15, z: 3.77 } },
  mess: { make: groupShelter, o: { color: TENT_COLORS.orange, backWall: true }, s: [1.5, 1.15, 1.25], legs: [2.73, 2.28], back: -2.28 },
  aid: { make: utilityTent, o: { open: true, cross: true, color: 0xd8dccf, accent: 0xb53a32 }, s: [1.5, 1.1, 1.667], door: { w: 1.45, h: 1.55, z: 2.0 } },
};
const PATROL_COLORS = [[0xb9c79a, 0xa3b584, 0xe8503a], [0xe3d3a6, 0xd2bf8c, 0x4f7fc9], [0xa9c2cf, 0x92afbf, 0xf2b63b], [0xd9b9a0, 0xc9a288, 0x3f8f6a], [0xc7cfa0, 0xb3bd86, 0x7a5cc9], [0xe6dcc0, 0xd6c8a2, 0xe07a94]];

export function createBuildings(scene, deps) {
  const { audio, onSleep } = deps;
  const interactables = [];
  let patrolIndex = 0;

  const buildings = COTTAGES.map((c, index) => {
    const st = { ...STYLES[c.type] };
    const T = TENT_PLAN[c.type], door3 = T ? T.door : { w: DOOR_W, h: DOOR_H, z: c.depth / 2 };
    const tentColor = c.type === 'patrol' ? PATROL_TENT_COLORS[patrolIndex % PATROL_TENT_COLORS.length] : null;
    if (c.type === 'patrol') { const [canvas, roof, trim] = PATROL_COLORS[patrolIndex++ % PATROL_COLORS.length]; Object.assign(st, { canvas, roof, trim }); }
    const state = { inside: false };
    const W = c.width, D = c.depth, H = st.wallH, front = D / 2;
    const groundY = floorHeight(c);
    const SKIRT = 0.6; // walls and floor reach down past any dip in the ground
    const openTop = groundY + H + st.roofH + 1.5;
    // Everything above this plane is not drawn. It drops to waist height when you step inside.
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), openTop);
    const sliced = (color, extra = {}) => new THREE.MeshStandardMaterial({
      color, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide, clippingPlanes: [plane], clipShadows: true, ...extra,
    });
    // Walls are panels of woven canvas about 1.3 m wide; the roof is the same cloth, seen in metres.
    const canvas = sliced(st.canvas, { emissive: 0xffb86b, emissiveIntensity: 0, map: texture('fabric', Math.max(2, Math.round(Math.max(W, D) / 1.4)), 1) });
    const roofMat = sliced(st.roof, { emissive: 0xffb86b, emissiveIntensity: 0, map: texture('fabric', 0.75, 0.75) });
    const trim = sliced(st.trim, { map: texture('fabric', 6, 1) }), pole = sliced(BAMBOO, { map: texture('bamboo', 1, 3) }), rope = sliced(ROPE);
    const use = (mesh, m) => { mesh.material = m; return mesh; };

    const g = new THREE.Group();
    g.position.set(c.x, groundY, c.z); g.rotation.y = c.rot;
    const colliders = [];
    const wall = (lx, lz, hw, hd) => { const p = toWorld(c, lx, lz); colliders.push({ x: p.x, z: p.z, hw, hd, rot: c.rot }); };
    // Furniture you cannot walk through.
    const solid = (mesh, hw, hd) => { g.add(mesh); wall(mesh.position.x, mesh.position.z, hw, hd); return mesh; };

    // ---- Shell: groundsheet, then either a modern tent (one vertex-coloured mesh) or canvas walls with a pitched roof
    const hh = H + SKIRT, hy = (H - SKIRT) / 2;
    const dw = door3 ? door3.w : 0, dh = door3 ? door3.h : 0, doorZ = door3 ? door3.z : front;
    const sideW = (W - dw) / 2;
    let tentGroup = null;
    if (T) {
      // A tent with a door is built hollow (rolled bundle only): the fabric panel below closes it, and open you see the real interior.
      tentGroup = T.make({ ...T.o, ...(tentColor ? { color: tentColor } : {}), ...(T.door ? { open: true, hollow: true } : {}) });
      tentGroup.scale.set(...T.s);
      const mesh = tentGroup.children[0];
      mesh.material = sliced(0xffffff, { vertexColors: true, roughness: 0.85, emissive: 0xffb86b, emissiveIntensity: 0 }); // the kit's own look, now sliceable
    } else {
    g.add(use(box(0.07, hh, D, 0, -W / 2, hy, 0), canvas), use(box(0.07, hh, D, 0, W / 2, hy, 0), canvas));
    g.add(use(box(W, hh, 0.07, 0, 0, hy, -front), canvas));
    for (const s of [-1, 1]) g.add(use(box(sideW, hh, 0.07, 0, s * (DOOR_W / 2 + sideW / 2), hy, front), canvas));
    g.add(box(DOOR_W + 0.5, SKIRT, 0.7, st.floor, 0, 0.04 - SKIRT / 2, front + 0.3)); // doorstep
    g.add(use(box(DOOR_W, H - DOOR_H, 0.07, 0, 0, DOOR_H + (H - DOOR_H) / 2, front), canvas));
    const over = 0.8;
    const roof = new THREE.Mesh(roofGeometry(W + over, st.roofH * (W + over) / W, D + over), roofMat);
    roof.position.y = H - 0.03; roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
    // A band of colour round the eaves, corner poles, a ridge pole and guy ropes pegged to the ground.
    g.add(use(box(W + 0.1, 0.22, D + 0.1, 0, 0, H - 0.2, 0), trim));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(use(cyl(0.05, 0.06, hh + 0.1, 0, sx * (W / 2 + 0.02), hy, sz * (front + 0.02)), pole));
      g.add(use(stick([sx * (W / 2 + over / 2), H - 0.05, sz * front * 0.9], [sx * (W / 2 + 1.25), -0.15, sz * (front * 0.9 + 0.25)], 0.012, 0), rope));
      g.add(cyl(0.03, 0.02, 0.5, 0x8c6444, sx * (W / 2 + 1.25), -0.08, sz * (front * 0.9 + 0.25), 5));
    }
    g.add(use(stick([0, H + st.roofH * (W + over) / W - 0.06, -front - over / 2 - 0.1], [0, H + st.roofH * (W + over) / W - 0.06, front + over / 2 + 0.1], 0.045, 0), pole));
    }

    // The groundsheet follows the tent's own outline when it has one (no platform sticking out past the fabric).
    {
      const fp = tentGroup && tentGroup.userData.footprint;
      let sheet;
      if (fp) {
        const shape = new THREE.Shape(fp.map(([x, z]) => new THREE.Vector2(x * T.s[0], -z * T.s[2])));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: SKIRT, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2); geo.translate(0, 0.06 - SKIRT, 0); // shape y is -z; the extrusion rises from the sunken bottom to 6 cm
        sheet = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: st.floor, roughness: 1, map: texture('fabric', 0.83, 0.83) }));
        sheet.receiveShadow = true;
      } else {
        sheet = box(W - 0.02, SKIRT, D - 0.02, new THREE.MeshStandardMaterial({ color: st.floor, roughness: 1, map: texture('fabric', Math.round(W / 1.2), Math.round(D / 1.2)) }), 0, 0.06 - SKIRT / 2, 0);
      }
      sheet.castShadow = false; g.add(sheet);
    }

    // ---- Door: a swinging canvas flap on the old buildings; on the modern tents a fabric panel that rolls up into the bundle at the top
    // (an open shelter has no door: its hinge stays unhung and nothing can be opened)
    const hinge = new THREE.Group(); hinge.position.set(-dw / 2, 0, doorZ + 0.06);
    const doorColor = new THREE.Color(st.canvas).multiplyScalar(0.9);
    const doorMat = sliced(T ? (T.o.accent ?? tentAccent(tentColor ?? T.o.color ?? 0x4a6a8a)) : doorColor, { map: T ? null : texture('fabric', 1, 1), emissive: 0xffe9a8, emissiveIntensity: 0 }); // its own material: only this flap shimmers
    const door = { open: false, angle: 0, speed: 0, t: 0 }; // t: 0 shut .. 1 open, for the zip doors
    let doorSpot = null;
    let panel = null;
    if (dw && T && tentGroup.userData.doorRing) {
      // The doorway outline in the building's frame; the zip door peels open along it.
      const ring = tentGroup.userData.doorRing.map(([x, y, z]) => [x * T.s[0], y * T.s[1], z * T.s[2]]);
      panel = createZipDoor(ring, doorMat, plane);
      g.add(panel.group);
    } else if (dw) {
      hinge.add(use(box(dw - 0.04, dh - 0.04, 0.045, 0, dw / 2, dh / 2, 0), doorMat));
      hinge.add(use(box(dw - 0.04, 0.12, 0.06, 0, dw / 2, dh * 0.55, 0), trim));
      g.add(hinge);
    }
    if (dw) {
      doorSpot = toWorld(c, 0, T ? Math.min(front + 0.35, doorZ + 0.9) : front + 0.35);
      interactables.push({
        id: `door-${index}`, kind: 'door', position: doorSpot, markerY: groundY + (T ? Math.max(1.6, dh + 0.5) : 2.25),
        prompt: () => (T ? (door.open ? 'E — close door' : 'E — open door') : (door.open ? 'E — close flap' : 'E — open flap')),
        interact() { door.open = !door.open; if (T) audio.play('zip'); else audio.play('door'); },
      });
    }

    // ---- Walls you cannot walk through (the doorway is blocked only while the flap is shut)
    let doorBlock = null;
    if (T && !dw) {
      // An open shelter: only its four legs and the back wall are solid.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) wall(sx * T.legs[0], sz * T.legs[1], 0.16, 0.16);
      wall(0, T.back, T.legs[0], 0.1);
    } else {
      wall(-(W / 2 + 0.12), 0, 0.2, front + 0.3); wall(W / 2 + 0.12, 0, 0.2, front + 0.3);
      wall(0, -(front + 0.12), W / 2 + 0.3, 0.2);
      const bz = T ? doorZ + 0.12 : front + 0.12; // the shut flap, or the old wall line
      for (const s of [-1, 1]) wall(s * (dw / 2 + sideW / 2), bz, sideW / 2, 0.2);
      const dp = toWorld(c, 0, bz);
      doorBlock = { x: dp.x, z: dp.z, hw: dw / 2, hd: 0.2, rot: c.rot };
    }

    // ---- Outside trimmings and what is inside, by purpose
    let smoke = null;
    const crate = (x, z, s = 0.5, y = 0, ry = 0) => box(s, s, s, 0xc79a62, x, y + s / 2 + 0.06, z, ry);
    if (c.type === 'hall') {
      const colors = [0xe8503a, 0xf2b63b, 0x5fa8a0, 0x7a5cc9];
      for (let k = 0; k < 11; k++) { const f = new THREE.Mesh(roofGeometry(0.32, 0.38, 0.02), sliced(colors[k % 4])); f.rotation.z = Math.PI; f.position.set(-W * 0.42 + k * (W * 0.84 / 10), H - 0.32, front + 0.1); g.add(f); }
      solid(box(3.6, 0.1, 1.1, 0xc79a62, 0, 0.74, -0.4), 1.8, 0.95);
      for (const lx of [-1.5, 1.5]) g.add(box(0.12, 0.7, 0.9, 0x9a7350, lx, 0.38, -0.4));
      for (const lz of [-1.2, 0.4]) g.add(box(3.4, 0.08, 0.32, 0xb98a5e, 0, 0.42, lz), box(0.1, 0.4, 0.3, 0x9a7350, -1.4, 0.22, lz), box(0.1, 0.4, 0.3, 0x9a7350, 1.4, 0.22, lz));
      g.add(box(0.9, 0.02, 0.6, 0xf5ecd6, -0.5, 0.8, -0.4, 0.2), cyl(0.07, 0.07, 0.12, 0x5fa8a0, 0.6, 0.85, -0.3), cyl(0.07, 0.07, 0.12, 0xe8503a, 1.0, 0.85, -0.55));
      // A map board at the back, and the camp's banner on a stand.
      g.add(box(2.4, 1.3, 0.06, 0xb98a5e, 0, 1.25, -front + 0.4), box(2.1, 1.05, 0.02, 0xf3ead2, 0, 1.25, -front + 0.44), box(0.7, 0.4, 0.02, 0x9fc98a, -0.4, 1.35, -front + 0.46), box(0.5, 0.3, 0.02, 0x8fd0e0, 0.5, 1.1, -front + 0.46));
      g.add(cyl(0.03, 0.03, 2.0, BAMBOO, 3.3, 1.0, -2.3), box(0.6, 0.4, 0.02, 0x6a3f9c, 3.0, 1.75, -2.3), cyl(0.2, 0.25, 0.12, 0x9a7350, 3.3, 0.1, -2.3));
      solid(crate(-3.3, -2.3, 0.6), 0.35, 0.35); g.add(crate(-3.3, -2.3, 0.45, 0.6, 0.4), crate(-3.2, -1.6, 0.45));
    } else if (c.type === 'patrol' || c.type === 'staff') {
      // A dormitory: camp beds down both sides with their pillows to the wall, kit by the door.
      const blankets = [0xe8503a, 0x4f7fc9, 0xf2b63b, 0x5fa8a0, 0xe07a94, 0x7a5cc9, 0x8fb866, 0xf08a3c];
      BED_PLAN[c.type].forEach((b, k) => {
        const yours = c.type === 'patrol' && k === 0;
        const frame = box(1.35, 0.14, 0.72, 0xc79a62, b.x, 0.13, b.z); frame.castShadow = false;
        g.add(frame, box(1.3, 0.07, 0.68, 0xf2ede2, b.x, 0.23, b.z), box(0.86, 0.06, 0.7, yours ? 0xfaf3e2 : blankets[(k + index) % 8], b.x - b.side * 0.2, 0.29, b.z), box(0.3, 0.09, 0.5, yours ? 0xf5b301 : 0xffffff, b.x + b.side * 0.48, 0.3, b.z));
        if (yours) {
          // The bed with the gold pillow is yours.
          const spot = toWorld(c, b.x, b.z);
          interactables.push({
            id: `bed-${index}`, kind: 'bed', position: toWorld(c, b.x - b.side * 0.75, b.z), markerY: groundY + 1.1,
            get enabled() { return state.inside; },
            prompt: () => 'E — sleep until morning',
            interact() { onSleep({ x: spot.x, z: spot.z, rot: c.rot - (b.side * Math.PI) / 2 }); },
          });
        }
      });
      { const cz = c.type === 'staff' ? -front + 1.3 : -front + 0.45; // the staff tent's round rear wall is further in
        g.add(crate(0, cz, 0.45), box(0.16, 0.24, 0.16, shared(0xffe2a0), 0, 0.65, cz), box(0.2, 0.04, 0.2, 0x5b4636, 0, 0.79, cz)); }
      { // kit by the door (inside the tent's own outline: the big patrol tent's door is further in)
        const kx = c.type === 'patrol' ? 2.3 : 1.9, kz = c.type === 'patrol' ? 2.2 : 2.6;
        g.add(box(0.34, 0.42, 0.22, 0x6f9a5a, -kx, 0.27, kz, 0.4), box(0.34, 0.42, 0.22, 0xd9634a, kx, 0.27, kz - 0.05, -0.3), box(0.34, 0.42, 0.22, 0x4f7fc9, kx - 0.45, 0.27, kz + 0.1, 0.5));
      }
      // The patrol's pennant on a pole beside the door.
      g.add(cyl(0.035, 0.04, 2.9, BAMBOO, W / 2 + 0.55, 1.45, front + 0.5));
      const pen = new THREE.Mesh(roofGeometry(0.5, 0.8, 0.02), shared(st.trim)); pen.rotation.z = -Math.PI / 2; pen.position.set(W / 2 + 0.6, 2.6, front + 0.5); pen.castShadow = true; g.add(pen);
    } else if (c.type === 'mess') {
      // Serving counter, stove with a big pot and a pipe through the roof, shelves and sacks.
      solid(box(4.2, 0.85, 0.7, 0xc79a62, 0.4, 0.48, -1.95), 2.1, 0.4);
      g.add(box(4.3, 0.06, 0.8, 0xe3c79a, 0.4, 0.93, -1.95));
      for (const [x, col] of [[-0.9, 0xd9634a], [-0.2, 0x8fa0a8], [0.6, 0xf2b63b], [1.5, 0x8fa0a8]]) g.add(cyl(0.17, 0.15, 0.2, col, x, 1.06, -1.95, 10));
      for (let k = 0; k < 5; k++) g.add(cyl(0.11, 0.11, 0.02 + k * 0.012, 0xfaf3e2, 2.2, 0.98, -1.9, 10));
      solid(box(0.95, 0.72, 0.95, 0x5b5b63, -2.3, 0.42, -0.4), 0.5, 0.5);
      g.add(cyl(0.36, 0.32, 0.42, 0x8fa0a8, -2.3, 1.0, -0.4, 12), cyl(0.3, 0.3, 0.03, 0xe8b860, -2.3, 1.19, -0.4, 12));
      g.add(use(cyl(0.08, 0.08, H + st.roofH + 0.4, 0, -2.6, (H + st.roofH + 0.4) / 2, -0.9), sliced(0x5b5b63)));
      for (const [x, z, col] of [[2.4, -0.6, 0xe9dcc0], [2.5, 0.1, 0xd9c79a], [2.1, -0.2, 0xe9dcc0]]) { const sack = ball(0.3, col, x, 0.32, z, 1); sack.scale.set(1, 1.15, 0.9); g.add(sack); }
      g.add(crate(2.5, 1.5, 0.5), ball(0.1, 0xe8503a, 2.4, 0.66, 1.45, 1), ball(0.1, 0xf2b63b, 2.6, 0.66, 1.55, 1), ball(0.1, 0x7fae5a, 2.5, 0.68, 1.4, 1));
      const top = toWorld(c, -2.6, -0.9);
      smoke = [0, 1, 2].map((k) => {
        const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
        p.userData = { offset: k / 3, x: top.x, y: groundY + H + st.roofH + 0.5, z: top.z }; scene.add(p); return p;
      });
    } else if (c.type === 'aid') {
      // (the tent carries its own red crosses) two camp beds, a cabinet and a stool.
      for (const x of [-1.05, 1.05]) {
        solid(box(0.85, 0.36, 1.8, 0xd8d2c4, x, 0.26, -0.6), 0.42, 0.9);
        g.add(box(0.8, 0.07, 1.1, 0xd9453a, x, 0.48, -0.3), box(0.55, 0.1, 0.34, 0xffffff, x, 0.5, -1.25));
      }
      g.add(box(0.9, 0.85, 0.4, 0xfaf7f0, 0, 0.5, -1.7), box(0.3, 0.09, 0.02, 0xd9453a, 0, 0.6, -1.49), box(0.09, 0.3, 0.02, 0xd9453a, 0, 0.6, -1.49), cyl(0.18, 0.18, 0.4, 0xb98a5e, 0, 0.26, 0.4));
    } else if (c.type === 'farm') {
      // Hay bales, sacks of feed, tools and crates of vegetables.
      solid(box(1.1, 0.6, 0.7, 0xe8c15a, -1.9, 0.36, -1.6), 0.6, 0.4); g.add(box(1.1, 0.6, 0.7, 0xdcb24e, -1.85, 0.96, -1.6, 0.15), box(1.1, 0.6, 0.7, 0xe8c15a, -0.7, 0.36, -1.65, -0.1));
      for (const [x, z] of [[2.1, -1.6], [2.2, -0.9], [1.6, -1.7]]) { const sack = ball(0.3, 0xd9c79a, x, 0.33, z, 1); sack.scale.set(1, 1.2, 0.9); g.add(sack); }
      g.add(stick([2.5, 0.06, 0.6], [2.62, 1.7, 0.2], 0.025, BAMBOO), box(0.4, 0.05, 0.06, 0x8fa0a8, 2.62, 1.7, 0.2), stick([2.5, 0.06, 1.1], [2.62, 1.6, 0.8], 0.025, BAMBOO), box(0.25, 0.3, 0.03, 0x8fa0a8, 2.62, 1.55, 0.8));
      g.add(crate(-2.2, 1.3, 0.5), ball(0.11, 0xe8503a, -2.3, 0.66, 1.25, 1), ball(0.11, 0xf08a3c, -2.1, 0.66, 1.35, 1), crate(-2.2, 0.6, 0.5), ball(0.12, 0x7fae5a, -2.2, 0.67, 0.6, 1), cyl(0.2, 0.17, 0.3, 0x8fa0a8, 0.4, 0.2, -1.6, 10));
    } else if (c.type === 'guard') {
      solid(box(1.1, 0.74, 0.55, 0xc79a62, 0.75, 0.42, -0.95), 0.55, 0.3);
      g.add(box(0.36, 0.22, 0.2, 0x5b5b63, 0.9, 0.9, -1.0), cyl(0.012, 0.012, 0.5, 0x5b5b63, 1.02, 1.2, -1.0, 4), box(0.5, 0.02, 0.36, 0xf5ecd6, 0.45, 0.8, -0.9, 0.2));
      g.add(cyl(0.17, 0.17, 0.4, 0xb98a5e, 0.75, 0.26, -0.3), box(0.16, 0.24, 0.16, shared(0xffe2a0), -1.0, 0.2, -1.0));
      g.add(cyl(0.035, 0.04, 3.4, BAMBOO, -W / 2 - 0.4, 1.7, front + 0.3));
      const pen = new THREE.Mesh(roofGeometry(0.5, 0.85, 0.02), shared(st.trim)); pen.rotation.z = -Math.PI / 2; pen.position.set(-W / 2 - 0.35, 3.1, front + 0.3); g.add(pen);
    }

    // Everything but the door flap stands still, so weld it: one mesh per material.
    g.remove(hinge); if (panel) g.remove(panel.group); mergeStatic(g); if (dw && !panel) g.add(hinge); if (panel) g.add(panel.group); // the door moves: it stays out of the weld
    if (tentGroup) g.add(tentGroup); // after the weld: it keeps its vertex colours and its own sliceable material
    scene.add(g);
    return { state, c, g, plane, hinge, panel, panelOpen: 0, nightGlow: 0, door, doorMat, doorSpot, shimmer: 0, doorBlock, colliders, smoke, tentFabric: !!T, canvas: T ? tentGroup.children[0].material : canvas, roofMat: T ? { emissiveIntensity: 0 } : roofMat, groundY, openTop, W, D, inside: false };
  });

  const out = [];
  return {
    interactables,
    inside: null, // the building the player is in, if any
    // Walls, furniture and shut doors, for the player.
    colliders() {
      out.length = 0;
      for (const b of buildings) { for (const w of b.colliders) out.push(w); if (b.doorBlock && (b.panel ? b.door.t < 0.85 : b.door.angle > -0.9)) out.push(b.doorBlock); /* a zip door lets you through once it is rolled most of the way up */ }
      return out;
    },
    // Canvas lit from inside: only a faint warm glow in the evening (before lights out at 21:36), dark after.
    setNight(f, t = 0.8) { const awake = t >= 0.7 && t < 0.9 ? Math.min(1, (0.9 - t) / 0.02) : 0, k = f * awake; for (const b of buildings) { b.nightGlow = k * (b.tentFabric ? 0.05 : 0.07); if (!b.tentFabric) b.canvas.emissiveIntensity = b.nightGlow; b.roofMat.emissiveIntensity = k * 0.04; } },
    update(dt, elapsed, player) {
      this.inside = null;
      for (const b of buildings) {
        const cos = Math.cos(b.c.rot), sin = Math.sin(b.c.rot);
        const wx = player.position.x - b.c.x, wz = player.position.z - b.c.z;
        const lx = wx * cos - wz * sin, lz = wx * sin + wz * cos;
        b.inside = Math.abs(lx) < b.W / 2 - 0.05 && Math.abs(lz) < b.D / 2 + 0.1;
        // From far off only the big pieces are drawn: nobody can make out a pillow at sixty metres.
        const far = wx * wx + wz * wz > (b.far ? 44 * 44 : 48 * 48);
        if (far !== b.far) { b.far = far; for (const m of b.g.children) if (m.userData.big !== undefined) m.visible = !far || m.userData.big >= 0.9; }
        b.state.inside = b.inside;
        if (b.inside) this.inside = b.c;
        // The slice glides down when you walk in and back up when you leave.
        const target = b.inside ? b.groundY + CUT : b.openTop;
        b.plane.constant += (target - b.plane.constant) * (1 - Math.exp(-dt * (b.inside ? 9 : 5)));
        // The flap swings on a soft spring, so it overshoots a touch and settles.
        const goal = b.door.open ? -1.9 : 0;
        b.door.speed += ((goal - b.door.angle) * 70 - b.door.speed * 11) * dt;
        b.door.angle += b.door.speed * dt;
        // A gentle once-a-second glow on the flap when you are near and it is shut, so you learn it opens.
        const dx = b.doorSpot ? player.position.x - b.doorSpot.x : 99, dz = b.doorSpot ? player.position.z - b.doorSpot.z : 99;
        const want = !b.door.open && !b.inside && dx * dx + dz * dz < 16 ? 1 : 0;
        b.shimmer += (want - b.shimmer) * (1 - Math.exp(-dt * 6));
        b.doorMat.emissiveIntensity = b.shimmer * (0.3 + 0.25 * Math.sin(elapsed * 6.28)) * (b.panel ? 0.3 : 1); // a dark tent fabric needs a lighter hint than canvas
        if (b.panel) {
          // The zip door: unzip then roll up, 0..1 over about 1.7 s (a touch quicker to close); an open door lets a little daylight glow in.
          b.door.t = Math.max(0, Math.min(1, b.door.t + (b.door.open ? 1 : -1) * dt * (b.door.open ? 0.6 : 0.75))); // unzip, then roll up (about 1.7 s)
          b.panel.update(b.door.t);
          b.canvas.emissiveIntensity = b.nightGlow + Math.min(1, b.door.t * 1.5) * 0.07;
        } else b.hinge.rotation.y = b.door.angle + (b.door.open ? Math.sin(elapsed * 1.3 + b.c.x) * 0.03 : 0);
        if (b.smoke) for (const p of b.smoke) {
          const u = p.userData, t = (elapsed * 0.2 + u.offset) % 1;
          p.position.set(u.x + Math.sin(t * 5 + u.offset * 9) * 0.35 * t + t * 0.7, u.y + t * 3, u.z);
          p.scale.setScalar(0.14 + t * 0.5); p.material.opacity = (1 - t) * 0.7;
        }
      }
    },
  };
}
