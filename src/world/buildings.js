// The camp's walk-in structures: canvas tents and bamboo-and-tarp shelters.
// Open the flap and walk in; the top is sliced away so you can see inside.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { COTTAGES, toWorld, floorHeight } from '../logic/layout.js';
import { box, cyl, ball, stick, roofGeometry, shared } from './build.js';

const CUT = 1.15;            // height the walls are sliced at while you are inside
const DOOR_W = 1.1, DOOR_H = 1.85;
const BAMBOO = 0xd8bb72, ROPE = 0xe9dcc0;

const STYLES = {
  hall: { wallH: 2.3, roofH: 1.9, canvas: 0xf5ecd6, roof: 0xf0e2c2, trim: 0xd9634a, floor: 0xc9b48c },
  patrol: { wallH: 2.0, roofH: 1.3, canvas: 0xb9c79a, roof: 0xa9b98a, trim: 0xf2b63b, floor: 0xb7a07a },
  mess: { wallH: 2.2, roofH: 1.4, canvas: 0xf8ecc6, roof: 0xe58a5c, trim: 0xe07a4f, floor: 0xc4ab82 },
  aid: { wallH: 2.0, roofH: 1.1, canvas: 0xfbf8f0, roof: 0xf3efe4, trim: 0xd9453a, floor: 0xd9d2c0 },
  farm: { wallH: 2.1, roofH: 1.2, canvas: 0xd3bb86, roof: 0x7f9a66, trim: 0x7f9a66, floor: 0xb99a6a },
  guard: { wallH: 2.1, roofH: 0.9, canvas: 0xc2cba3, roof: 0x8fa678, trim: 0xf2b63b, floor: 0xb7a07a },
};
const PATROL_COLORS = [[0xb9c79a, 0xa3b584, 0xe8503a], [0xe3d3a6, 0xd2bf8c, 0x4f7fc9], [0xa9c2cf, 0x92afbf, 0xf2b63b]];

export function createBuildings(scene, deps) {
  const { audio } = deps;
  const interactables = [];
  let patrolIndex = 0;

  const buildings = COTTAGES.map((c, index) => {
    const st = { ...STYLES[c.type] };
    if (c.type === 'patrol') { const [canvas, roof, trim] = PATROL_COLORS[patrolIndex++ % 3]; Object.assign(st, { canvas, roof, trim }); }
    const W = c.width, D = c.depth, H = st.wallH, front = D / 2;
    const groundY = floorHeight(c);
    const SKIRT = 0.6; // walls and floor reach down past any dip in the ground
    const openTop = groundY + H + st.roofH + 1.5;
    // Everything above this plane is not drawn. It drops to waist height when you step inside.
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), openTop);
    const sliced = (color, extra = {}) => new THREE.MeshStandardMaterial({
      color, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide, clippingPlanes: [plane], clipShadows: true, ...extra,
    });
    const canvas = sliced(st.canvas, { emissive: 0xffb86b, emissiveIntensity: 0 });
    const roofMat = sliced(st.roof, { emissive: 0xffb86b, emissiveIntensity: 0 });
    const trim = sliced(st.trim), pole = sliced(BAMBOO), rope = sliced(ROPE);
    const use = (mesh, m) => { mesh.material = m; return mesh; };

    const g = new THREE.Group();
    g.position.set(c.x, groundY, c.z); g.rotation.y = c.rot;
    const colliders = [];
    const wall = (lx, lz, hw, hd) => { const p = toWorld(c, lx, lz); colliders.push({ x: p.x, z: p.z, hw, hd, rot: c.rot }); };
    // Furniture you cannot walk through.
    const solid = (mesh, hw, hd) => { g.add(mesh); wall(mesh.position.x, mesh.position.z, hw, hd); return mesh; };

    // ---- Shell: groundsheet, canvas walls with a doorway, and a pitched roof
    const sheet = box(W - 0.02, SKIRT, D - 0.02, st.floor, 0, 0.06 - SKIRT / 2, 0); sheet.castShadow = false; g.add(sheet);
    const hh = H + SKIRT, hy = (H - SKIRT) / 2;
    g.add(use(box(0.07, hh, D, 0, -W / 2, hy, 0), canvas), use(box(0.07, hh, D, 0, W / 2, hy, 0), canvas));
    g.add(use(box(W, hh, 0.07, 0, 0, hy, -front), canvas));
    const sideW = (W - DOOR_W) / 2;
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

    // ---- Door flap: hinged at one side, swings outward
    const hinge = new THREE.Group(); hinge.position.set(-DOOR_W / 2, 0, front + 0.06);
    hinge.add(use(box(DOOR_W - 0.04, DOOR_H - 0.04, 0.045, 0, DOOR_W / 2, DOOR_H / 2, 0), sliced(new THREE.Color(st.canvas).multiplyScalar(0.9))));
    hinge.add(use(box(DOOR_W - 0.04, 0.12, 0.06, 0, DOOR_W / 2, DOOR_H * 0.55, 0), trim));
    g.add(hinge);
    const door = { open: false, angle: 0, speed: 0 };
    const doorSpot = toWorld(c, 0, front + 0.35);
    interactables.push({
      id: `door-${index}`, kind: 'door', position: doorSpot, markerY: groundY + 2.25,
      prompt: () => (door.open ? 'E — close flap' : 'E — open flap'),
      interact() { door.open = !door.open; audio.play('door'); },
    });

    // ---- Walls you cannot walk through (the doorway is blocked only while the flap is shut)
    wall(-(W / 2 + 0.12), 0, 0.2, front + 0.3); wall(W / 2 + 0.12, 0, 0.2, front + 0.3);
    wall(0, -(front + 0.12), W / 2 + 0.3, 0.2);
    for (const s of [-1, 1]) wall(s * (DOOR_W / 2 + sideW / 2), front + 0.12, sideW / 2, 0.2);
    const dp = toWorld(c, 0, front + 0.12);
    const doorBlock = { x: dp.x, z: dp.z, hw: DOOR_W / 2, hd: 0.2, rot: c.rot };

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
      g.add(box(2.4, 1.3, 0.06, 0xb98a5e, 0, 1.25, -front + 0.14), box(2.1, 1.05, 0.02, 0xf3ead2, 0, 1.25, -front + 0.18), box(0.7, 0.4, 0.02, 0x9fc98a, -0.4, 1.35, -front + 0.2), box(0.5, 0.3, 0.02, 0x8fd0e0, 0.5, 1.1, -front + 0.2));
      g.add(cyl(0.03, 0.03, 2.0, BAMBOO, 3.3, 1.0, -2.3), box(0.6, 0.4, 0.02, 0x6a3f9c, 3.0, 1.75, -2.3), cyl(0.2, 0.25, 0.12, 0x9a7350, 3.3, 0.1, -2.3));
      solid(crate(-3.3, -2.3, 0.6), 0.35, 0.35); g.add(crate(-3.3, -2.3, 0.45, 0.6, 0.4), crate(-3.2, -1.6, 0.45));
    } else if (c.type === 'patrol') {
      // Four sleeping mats with rolled blankets, backpacks by the door and a lantern on a crate.
      const bags = [0xe8503a, 0x4f7fc9, 0xf2b63b, 0x5fa8a0];
      [[-1.25, -1.2], [1.25, -1.2], [-1.25, 0.75], [1.25, 0.75]].forEach(([x, z], k) => {
        const m = box(0.8, 0.07, 1.7, 0x8fa0a8, x, 0.12, z); m.castShadow = false;
        g.add(m, box(0.74, 0.1, 1.15, bags[(k + index) % 4], x, 0.2, z + 0.25), box(0.5, 0.11, 0.3, 0xfaf3e2, x, 0.21, z - 0.62));
      });
      g.add(crate(0, -1.9, 0.45), box(0.16, 0.24, 0.16, shared(0xffe2a0), 0, 0.65, -1.9), box(0.2, 0.04, 0.2, 0x5b4636, 0, 0.79, -1.9));
      g.add(box(0.34, 0.42, 0.22, 0x6f9a5a, -1.75, 0.27, 1.9, 0.4), box(0.34, 0.42, 0.22, 0xd9634a, 1.7, 0.27, 1.95, -0.3));
      // The patrol's pennant on a pole beside the door.
      g.add(cyl(0.035, 0.04, 2.9, BAMBOO, W / 2 + 0.55, 1.45, front + 0.5));
      const pen = new THREE.Mesh(roofGeometry(0.5, 0.8, 0.02), shared(st.trim)); pen.rotation.z = -Math.PI / 2; pen.position.set(W / 2 + 0.6, 2.6, front + 0.5); pen.castShadow = true; g.add(pen);
    } else if (c.type === 'mess') {
      // Striped awning over the entrance.
      for (let k = 0; k < 6; k++) { const s = use(box(0.5, 0.05, 1.5, 0, -1.25 + k * 0.5, H - 0.25, front + 0.8), sliced(k % 2 ? 0xfaf3e2 : st.trim)); s.rotation.x = 0.22; g.add(s); }
      for (const sx of [-1.4, 1.4]) g.add(use(cyl(0.04, 0.04, H - 0.4, 0, sx, (H - 0.4) / 2, front + 1.45), pole));
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
      // A red cross beside the door; two camp beds, a cabinet and a stool.
      g.add(use(box(0.62, 0.2, 0.03, 0, 1.15, 1.45, front + 0.06), trim), use(box(0.2, 0.62, 0.03, 0, 1.15, 1.45, front + 0.06), trim));
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

    scene.add(g);
    return { c, g, plane, hinge, door, doorBlock, colliders, smoke, canvas, roofMat, groundY, openTop, W, D, inside: false };
  });

  const out = [];
  return {
    interactables,
    inside: null, // the building the player is in, if any
    // Walls, furniture and shut doors, for the player.
    colliders() {
      out.length = 0;
      for (const b of buildings) { for (const w of b.colliders) out.push(w); if (b.door.angle > -0.9) out.push(b.doorBlock); }
      return out;
    },
    setNight(f) { for (const b of buildings) { b.canvas.emissiveIntensity = f * 0.42; b.roofMat.emissiveIntensity = f * 0.3; } },
    update(dt, elapsed, player) {
      this.inside = null;
      for (const b of buildings) {
        const cos = Math.cos(b.c.rot), sin = Math.sin(b.c.rot);
        const wx = player.position.x - b.c.x, wz = player.position.z - b.c.z;
        const lx = wx * cos - wz * sin, lz = wx * sin + wz * cos;
        b.inside = Math.abs(lx) < b.W / 2 - 0.05 && Math.abs(lz) < b.D / 2 + 0.1;
        if (b.inside) this.inside = b.c;
        // The slice glides down when you walk in and back up when you leave.
        const target = b.inside ? b.groundY + CUT : b.openTop;
        b.plane.constant += (target - b.plane.constant) * (1 - Math.exp(-dt * (b.inside ? 9 : 5)));
        // The flap swings on a soft spring, so it overshoots a touch and settles.
        const goal = b.door.open ? -1.9 : 0;
        b.door.speed += ((goal - b.door.angle) * 70 - b.door.speed * 11) * dt;
        b.door.angle += b.door.speed * dt;
        b.hinge.rotation.y = b.door.angle + (b.door.open ? Math.sin(elapsed * 1.3 + b.c.x) * 0.03 : 0);
        if (b.smoke) for (const p of b.smoke) {
          const u = p.userData, t = (elapsed * 0.2 + u.offset) % 1;
          p.position.set(u.x + Math.sin(t * 5 + u.offset * 9) * 0.35 * t + t * 0.7, u.y + t * 3, u.z);
          p.scale.setScalar(0.14 + t * 0.5); p.material.opacity = (1 - t) * 0.7;
        }
      }
    },
  };
}
