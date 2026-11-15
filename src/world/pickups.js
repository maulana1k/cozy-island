// Things lying about the island that you can pick up, and the places that hand things out:
// water barrels, the stew pot, the marshmallow crate, the first-aid box and the hens' nest.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../logic/rng.js';
import { heightAt } from '../logic/terrain.js';
import { surfaceAt } from '../logic/surface.js';
import { getScatter, getColliders, COTTAGES, toWorld, CHICKEN_YARD, VILLAGE_FIRE, CAMPFIRE, LOOKOUT, distanceToPath } from '../logic/layout.js';
import { ITEMS } from '../logic/items.js';
import { POND, SEED } from '../config.js';

// One shared material: every shape carries its own colours in its corners.
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
const tint = new THREE.Color();
function part(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  tint.setHex(hex);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const join = (...parts) => { const g = mergeGeometries(parts); g.computeVertexNormals(); return g; };
const ball = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const cyl = (a, b, h, n = 7) => new THREE.CylinderGeometry(a, b, h, n);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// What each thing looks like lying on the ground.
const SHAPES = {
  shell: () => join(part(new THREE.SphereGeometry(0.15, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xf8d9cc, 0, 0, 0, 0, 0, 0, 1, 0.55, 1.15), part(new THREE.ConeGeometry(0.06, 0.12, 5), 0xf2b9a8, 0, 0.03, -0.17, -1.2, 0, 0)),
  mushroom: () => join(part(cyl(0.035, 0.05, 0.16, 6), 0xf4ecd8, 0, 0.08, 0), part(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xd6503c, 0, 0.14, 0, 0, 0, 0, 1, 0.8, 1), part(ball(0.025, 0), 0xfff6e8, 0.05, 0.215, 0.03), part(ball(0.02, 0), 0xfff6e8, -0.05, 0.2, -0.04),
    part(cyl(0.025, 0.035, 0.1, 6), 0xf4ecd8, 0.17, 0.05, 0.06), part(new THREE.SphereGeometry(0.075, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xd6503c, 0.17, 0.09, 0.06, 0, 0, 0, 1, 0.8, 1)),
  stick: () => join(part(cyl(0.03, 0.035, 0.7, 5), 0x8a6444, 0, 0.04, 0, 0, 0.3, Math.PI / 2), part(cyl(0.025, 0.03, 0.55, 5), 0x7a563c, 0.03, 0.09, 0.02, 0, -0.5, Math.PI / 2 - 0.12), part(cyl(0.02, 0.025, 0.42, 5), 0x9a7450, -0.05, 0.05, 0.14, 0, 1.2, Math.PI / 2)),
  flower: () => join(part(cyl(0.012, 0.015, 0.3, 4), 0x6f9a55, 0, 0.15, 0), part(new THREE.ConeGeometry(0.1, 0.05, 6), 0xffffff, 0, 0.3, 0, Math.PI, 0, 0), part(ball(0.04, 0), 0xffc53d, 0, 0.32, 0),
    part(cyl(0.012, 0.015, 0.22, 4), 0x6f9a55, 0.1, 0.11, 0.05, 0, 0, -0.25), part(new THREE.ConeGeometry(0.08, 0.045, 6), 0xff9fc0, 0.13, 0.225, 0.05, Math.PI, 0, 0), part(ball(0.03, 0), 0xffe07a, 0.13, 0.24, 0.05)),
  stone: () => join(part(new THREE.DodecahedronGeometry(0.13, 0), 0xb9b4ad, 0, 0.035, 0, 0.3, 0.2, 0, 1, 0.38, 0.8)),
  feather: () => join(part(box(0.07, 0.008, 0.32), 0xffffff, 0, 0.05, 0, 0.25, 0.4, 0.2), part(box(0.012, 0.012, 0.42), 0xd9d2c4, 0, 0.05, 0.03, 0.25, 0.4, 0.2)),
  egg: () => join(part(ball(0.075, 1), 0xf7ecd9, 0, 0.09, 0, 0, 0, 0, 0.85, 1.1, 0.85)),
  berries: () => join(...[[0.42, 0.42, 0.1], [0.3, 0.55, -0.28], [-0.36, 0.5, 0.22], [-0.12, 0.66, -0.3], [0.05, 0.6, 0.42], [-0.44, 0.36, -0.12], [0.2, 0.7, 0.05]].map(([x, y, z]) => part(ball(0.055, 0), 0x5a4fcf, x, y, z))),
  // Anything else you put down sits in a little cloth sack.
  sack: () => join(part(ball(0.14, 1), 0xd9c39a, 0, 0.11, 0, 0, 0, 0, 1, 0.8, 1), part(cyl(0.04, 0.07, 0.08, 6), 0xc2a878, 0, 0.24, 0), part(cyl(0.05, 0.05, 0.02, 6), 0x9a5a3c, 0, 0.2, 0)),
};
const RESPAWN = { shell: 150, mushroom: 170, stick: 120, flower: 140, stone: 160, feather: 200, egg: 110, berries: 130 };
const COUNTS = { berries: 3 };

export function createPickups(scene, deps) {
  const { audio, give } = deps; // give(id, count, position) → how many went into the bag
  const interactables = [], colliders = [], updaters = [];
  const solid = getColliders();
  const rng = createRng(SEED + 99);
  const taken = [];
  const clear = (x, z, r) => solid.every((c) => Math.hypot(c.x - x, c.z - z) > (c.r || Math.max(c.hw || 0, c.hd || 0) + 0.4) + r) && taken.every((t) => Math.hypot(t.x - x, t.z - z) > 2.4);

  // ---- Where things lie: a fixed scatter, the same every run.
  function spots(n, test, ring) {
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 400; tries++) {
      const a = rng() * Math.PI * 2, r = ring[0] + rng() * (ring[1] - ring[0]);
      const p = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      if (!test(p.x, p.z) || !clear(p.x, p.z, 0.5)) continue;
      out.push(p); taken.push(p);
    }
    return out;
  }
  const surf = (name) => (x, z) => surfaceAt(x, z) === name;
  const offPath = (x, z) => distanceToPath(x, z) > 1.4;
  const placed = {
    shell: spots(16, (x, z) => surfaceAt(x, z) === 'sand' && heightAt(x, z) > 0.12 && heightAt(x, z) < 1.1, [50, 59]),
    mushroom: spots(13, (x, z) => surf('forest')(x, z) && offPath(x, z), [22, 46]),
    stick: spots(15, (x, z) => (surf('forest')(x, z) || surf('meadow')(x, z)) && offPath(x, z), [18, 47]),
    flower: spots(12, (x, z) => (surf('meadow')(x, z) || surf('grass')(x, z)) && offPath(x, z) && Math.hypot(x - 10, z - 8) > 9, [8, 46]),
    stone: spots(10, (x, z) => (surf('sand')(x, z) || surf('mud')(x, z) || surf('rock')(x, z)) && heightAt(x, z) > 0.1, [14, 58]),
    feather: [...spots(4, (x, z) => Math.hypot(x - CHICKEN_YARD.x, z - CHICKEN_YARD.z) < CHICKEN_YARD.r + 2.5 && Math.hypot(x - CHICKEN_YARD.x, z - CHICKEN_YARD.z) > 1, [18, 36]), ...spots(4, (x, z) => surf('sand')(x, z) && heightAt(x, z) > 0.3, [50, 57])],
    egg: [{ x: CHICKEN_YARD.x + 1.9, z: CHICKEN_YARD.z - 1.7 }, { x: CHICKEN_YARD.x + 2.15, z: CHICKEN_YARD.z - 1.5 }],
    berries: getScatter().bushes.filter((_, i) => i % 2 === 0).map((b) => ({ x: b.x, z: b.z, scale: b.scale, rot: b.rot })),
  };

  // ---- One instanced mesh per kind; a thing that has been taken is simply shrunk to nothing.
  const dummy = new THREE.Object3D();
  const pool = [];
  for (const [id, list] of Object.entries(placed)) {
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(SHAPES[id](), MAT, list.length);
    mesh.castShadow = id !== 'feather'; mesh.receiveShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
    list.forEach((p, i) => {
      const y = heightAt(p.x, p.z), rot = p.rot ?? rng() * Math.PI * 2, scale = id === 'berries' ? p.scale : 0.95 + rng() * 0.35;
      const item = { id, mesh, i, x: p.x, z: p.z, y, rot, scale, here: true, back: 0, pop: 1 };
      pool.push(item);
      const name = ITEMS[id].name.toLowerCase();
      interactables.push({
        id: `pick-${id}-${i}`, kind: 'pickup', position: { x: p.x, z: p.z }, markerY: y + (id === 'berries' ? 1.25 * scale : 0.75),
        get enabled() { return item.here; },
        prompt: () => (id === 'berries' ? 'E — pick berries' : id === 'egg' ? 'E — collect egg' : `E — pick up ${name}`),
        interact() {
          if (!give(id, COUNTS[id] || 1, { x: p.x, y: y + 0.4, z: p.z })) return;
          item.here = false; item.back = RESPAWN[id] * (0.8 + Math.random() * 0.5);
        },
      });
    });
    mesh.userData.dirty = true;
  }
  function place(item) {
    const s = item.scale * item.pop;
    dummy.position.set(item.x, item.y - 0.02, item.z); dummy.rotation.set(0, item.rot, 0); dummy.scale.set(s, s, s); dummy.updateMatrix();
    item.mesh.setMatrixAt(item.i, dummy.matrix); item.mesh.instanceMatrix.needsUpdate = true;
  }
  pool.forEach(place);

  // ---- Things you put down again lie where you left them.
  const loose = [];
  function drop(id, count, x, z) {
    const m = new THREE.Mesh((SHAPES[id] || SHAPES.sack)(), MAT);
    const y = deps.groundAt ? deps.groundAt(x, z) : heightAt(x, z);
    m.position.set(x, y, z); m.rotation.y = Math.random() * 6.28; m.castShadow = true;
    scene.add(m);
    const entry = { m, id, count, here: true };
    const it = {
      id: `drop-${loose.length}`, kind: 'pickup', position: { x, z }, markerY: y + 0.75,
      get enabled() { return entry.here; },
      prompt: () => `E — pick up ${ITEMS[id].name.toLowerCase()}${entry.count > 1 ? ` ×${entry.count}` : ''}`,
      interact() {
        const got = give(id, entry.count, { x, y: y + 0.4, z });
        entry.count -= got;
        if (entry.count <= 0) { entry.here = false; scene.remove(m); m.geometry.dispose(); }
      },
    };
    loose.push(entry); interactables.push(it);
  }

  // ---- Places that hand things out -------------------------------------------------
  const camp = new THREE.Group(); scene.add(camp);
  const solidMesh = (geo, x, z, rot = 0) => { const m = new THREE.Mesh(geo, MAT); m.position.set(x, heightAt(x, z) - 0.02, z); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; camp.add(m); return m; };

  // A water barrel on a stand, with a tap and a tin mug.
  const barrelGeo = () => join(
    part(box(0.9, 0.08, 0.7), 0x8a6444, 0, 0.42, 0), ...[[-0.36, -0.26], [0.36, -0.26], [-0.36, 0.26], [0.36, 0.26]].map(([x, z]) => part(box(0.08, 0.42, 0.08), 0x6b4a34, x, 0.21, z)),
    part(cyl(0.3, 0.3, 0.72, 12), 0x5f9fc4, 0, 0.84, 0), part(cyl(0.32, 0.32, 0.05, 12), 0x3f6f8a, 0, 0.6, 0), part(cyl(0.32, 0.32, 0.05, 12), 0x3f6f8a, 0, 1.08, 0), part(cyl(0.31, 0.31, 0.04, 12), 0xdfe9ee, 0, 1.22, 0),
    part(cyl(0.03, 0.03, 0.16, 6), 0xd9d9d9, 0, 0.62, 0.36, Math.PI / 2, 0, 0), part(box(0.1, 0.03, 0.03), 0xd9453a, 0, 0.67, 0.42),
    part(cyl(0.06, 0.05, 0.1, 8), 0xe9e4d8, 0.3, 0.51, 0.22),
  );
  const waters = [
    { x: 8.4, z: 21.4, rot: 2.6 },
    { x: LOOKOUT.x + 0.3, z: LOOKOUT.z + 4.9, rot: 0 },
    { x: CAMPFIRE.x + Math.cos(2.1) * 3.9, z: CAMPFIRE.z + Math.sin(2.1) * 3.9, rot: 1 },
  ];
  const drink = (id, x, z, y, label) => interactables.push({
    id, kind: 'water', position: { x, z }, markerY: y,
    get enabled() { return deps.canDrinkAt ? deps.canDrinkAt(label) : true; },
    prompt: () => (deps.flaskFull() ? 'E — drink water' : 'E — fill flask'),
    interact() { deps.onWater(label, { x, z }); },
  });
  waters.forEach((w, i) => {
    solidMesh(barrelGeo(), w.x, w.z, w.rot);
    colliders.push({ x: w.x, z: w.z, r: 0.5 });
    drink(`water-${i}`, w.x, w.z, heightAt(w.x, w.z) + 1.75, 'barrel');
  });
  // The pond is good water too: fill up anywhere along its edge.
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, x = POND.x + Math.cos(a) * (POND.rw - 0.6), z = POND.z + Math.sin(a) * (POND.rw - 0.6); drink(`pond-${i}`, x, z, 0.9, 'pond'); }

  // A station gives one kind of thing, then needs a while before it has more.
  function station({ id, x, z, rot = 0, geo, r = 0.6, item, count = 1, wait, verb, markerY = 1.5 }) {
    solidMesh(geo, x, z, rot);
    colliders.push({ x, z, r });
    const st = { ready: 0 };
    interactables.push({
      id, kind: 'station', position: { x, z }, markerY: heightAt(x, z) + markerY,
      prompt: () => (st.ready > 0 ? `E — ${verb} (more in ${Math.ceil(st.ready)}s)` : `E — ${verb}`),
      interact() {
        if (st.ready > 0) { deps.note('Not ready yet. Come back in a little while.'); return; }
        if (give(item, count, { x, y: heightAt(x, z) + 1, z })) st.ready = wait;
      },
    });
    updaters.push((dt) => { st.ready = Math.max(0, st.ready - dt); });
  }
  // The serving table by the food tent: a pot of stew, bowls and a basket of bread.
  const table = (...extra) => join(part(box(1.5, 0.07, 0.75), 0xb98a5e, 0, 0.78, 0), ...[[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]].map(([x, z]) => part(box(0.08, 0.78, 0.08), 0x7a563c, x, 0.39, z)), part(box(1.56, 0.02, 0.5), 0xe8563f, 0, 0.82, 0), ...extra);
  station({
    id: 'stew-pot', x: 20.6, z: 25.2, rot: -1.45, item: 'stew', wait: 75, verb: 'take a bowl of stew', r: 0.85, markerY: 1.9,
    geo: table(part(cyl(0.27, 0.22, 0.34, 10), 0x4a4f57, -0.3, 1.0, 0), part(cyl(0.25, 0.25, 0.02, 10), 0xc9803f, -0.3, 1.15, 0), part(cyl(0.015, 0.015, 0.5, 5), 0xd9d9d9, -0.22, 1.28, 0.05, 0, 0, -0.5),
      ...[0, 1, 2].map((k) => part(cyl(0.1, 0.07, 0.05, 8), 0xfaf3e2, 0.3, 0.86 + k * 0.035, -0.1))),
  });
  station({
    id: 'bread-basket', x: 20.9, z: 27.3, rot: -1.75, item: 'bread', wait: 60, verb: 'take a bread roll', r: 0.85, markerY: 1.7,
    geo: table(part(cyl(0.3, 0.24, 0.16, 10), 0xc9a36a, 0, 0.91, 0), ...[[-0.1, 0], [0.1, 0.06], [0, -0.1], [0.02, 0.1]].map(([x, z], k) => part(ball(0.09, 1), 0xd9a25a, x, 1.0 + (k % 2) * 0.03, z, 0, k, 0, 1.3, 0.8, 0.9))),
  });
  // A crate of marshmallows by the big campfire.
  station({
    id: 'marshmallows', x: VILLAGE_FIRE.x - 0.4, z: VILLAGE_FIRE.z - 4.3, rot: 0.2, item: 'marshmallow', count: 2, wait: 60, verb: 'take marshmallows', r: 0.45, markerY: 1.3,
    geo: join(part(box(0.6, 0.42, 0.45), 0xb98a5e, 0, 0.21, 0), part(box(0.64, 0.05, 0.49), 0x7a563c, 0, 0.1, 0), part(box(0.64, 0.05, 0.49), 0x7a563c, 0, 0.34, 0),
      ...[[-0.15, -0.08], [0.02, 0.06], [0.16, -0.05], [-0.04, -0.1], [0.1, 0.1]].map(([x, z], k) => part(cyl(0.055, 0.055, 0.08, 8), k % 2 ? 0xffd9e4 : 0xffffff, x, 0.46 + (k % 3) * 0.02, z, 0.3 * k, 0, 0.4)),
      ...[[-0.5, 0.1, 0.5], [-0.56, 0.12, 0.2], [-0.47, 0.14, -0.1]].map(([x, z, r]) => part(cyl(0.012, 0.012, 0.9, 4), 0x9a7450, x, 0.42, z, 0.12, r, 0.2))),
  });
  // The first-aid box outside the medical tent.
  {
    const c = COTTAGES.find((b) => b.type === 'aid'), p = toWorld(c, 1.45, c.depth / 2 + 0.75);
    station({
      id: 'aid-box', x: p.x, z: p.z, rot: c.rot, item: 'bandage', wait: 120, verb: 'take a bandage', r: 0.4, markerY: 1.35,
      geo: join(part(box(0.5, 0.5, 0.4), 0x8a6444, 0, 0.25, 0), part(box(0.46, 0.3, 0.34), 0xffffff, 0, 0.66, 0), part(box(0.2, 0.06, 0.01), 0xd9453a, 0, 0.66, 0.175), part(box(0.06, 0.2, 0.01), 0xd9453a, 0, 0.66, 0.175), part(box(0.16, 0.04, 0.04), 0xd9d9d9, 0, 0.83, 0)),
    });
  }
  // The hens' nest box: straw, and now and then an egg.
  {
    const x = CHICKEN_YARD.x + 2.03, z = CHICKEN_YARD.z - 1.6;
    solidMesh(join(part(box(0.75, 0.12, 0.55), 0x9a7450, 0, 0.06, 0), part(box(0.75, 0.3, 0.05), 0x9a7450, 0, 0.2, -0.25), part(box(0.05, 0.22, 0.5), 0x9a7450, -0.35, 0.17, 0), part(box(0.05, 0.22, 0.5), 0x9a7450, 0.35, 0.17, 0),
      part(cyl(0.3, 0.26, 0.07, 9), 0xe6c96a, 0, 0.14, 0, 0, 0, 0, 1, 1, 0.75)), x, z, 0.6);
    pool.filter((p) => p.id === 'egg').forEach((p) => { p.y += 0.12; place(p); });
  }

  return {
    interactables, colliders, drop,
    update(dt, playerPos) {
      for (const u of updaters) u(dt);
      for (const item of pool) {
        if (!item.here) {
          item.back -= dt;
          // Things come back when you are not looking.
          if (item.back <= 0 && Math.hypot(playerPos.x - item.x, playerPos.z - item.z) > 14) item.here = true;
        }
        const want = item.here ? 1 : 0;
        if (item.pop !== want) { item.pop += Math.sign(want - item.pop) * Math.min(Math.abs(want - item.pop), dt * 6); place(item); }
      }
    },
  };
}
