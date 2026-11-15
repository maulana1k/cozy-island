import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import {
  COTTAGES, PATHS, FENCES, DOCK, BOAT, VILLAGE_CENTER, TENTS, WINDMILL, FIELD,
} from '../logic/layout.js';
import { PALETTE } from '../config.js';
import { texture, mergeStatic } from './build.js';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...extra });

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

function roofGeometry(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(0, height); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// The farm's crop field: rows of soil with little green plants.
function buildField(mats) {
  const g = new THREE.Group();
  const soil = flat(0xa9774f), leaf = flat(0x7fae5a), leaf2 = flat(0x9cc46a);
  const rows = 6, gap = FIELD.width / (rows - 1);
  for (let r = 0; r < rows; r++) {
    const x = -FIELD.width / 2 + r * gap;
    const row = box(0.6, 0.16, FIELD.length, soil, x, 0.03, 0); row.castShadow = false;
    g.add(row);
    for (let k = 0; k < 9; k++) {
      const plant = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42 + ((r + k) % 3) * 0.08, 5), (r + k) % 2 ? leaf : leaf2);
      plant.position.set(x, 0.3, -FIELD.length / 2 + 0.45 + k * (FIELD.length - 0.9) / 8); plant.castShadow = true;
      g.add(plant);
    }
  }
  // A scarecrow keeps watch.
  g.add(box(0.1, 1.9, 0.1, mats.woodDark, FIELD.width / 2 + 0.9, 0.95, 0), box(1.3, 0.09, 0.09, mats.woodDark, FIELD.width / 2 + 0.9, 1.45, 0));
  g.add(box(0.6, 0.6, 0.3, flat(0xd9a05b), FIELD.width / 2 + 0.9, 1.25, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), flat(0xf3e2c8)); head.position.set(FIELD.width / 2 + 0.9, 1.78, 0); head.castShadow = true;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 8), flat(0xe8c15a)); hat.position.set(FIELD.width / 2 + 0.9, 2.0, 0); hat.castShadow = true;
  g.add(head, hat);
  g.position.set(FIELD.x, heightAt(FIELD.x, FIELD.z), FIELD.z);
  g.rotation.y = FIELD.rot;
  return g;
}

// A canvas ridge tent with an open front.
function buildTent(t, i, mats) {
  const g = new THREE.Group();
  const canvas = flat(PALETTE.tents[i % PALETTE.tents.length], { side: THREE.DoubleSide, map: texture('fabric', 0.8, 0.8) });
  const body = new THREE.Mesh(roofGeometry(2.5, 1.75, 2.7), canvas);
  body.castShadow = true; body.receiveShadow = true;
  const opening = new THREE.Mesh(roofGeometry(1.5, 1.25, 0.04), mats.tentInside);
  opening.position.set(0, 0.0, 1.345);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), mats.woodDark);
  pole.rotation.x = Math.PI / 2; pole.position.y = 1.74;
  const front = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.8, 6), mats.woodDark);
  front.position.set(0, 0.88, 1.38);
  const mat = box(1.5, 0.05, 0.9, flat(0xd88f6a), 0, 0.03, 1.9); // a little mat at the entrance
  mat.castShadow = false;
  g.add(body, opening, pole, front, mat);
  g.position.set(t.x, heightAt(t.x, t.z) - 0.03, t.z);
  g.rotation.y = t.rot;
  return g;
}

// A ribbon that hugs the ground along a polyline.
function buildPath(points, width, material) {
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4));
    for (let j = 0; j < n; j++) samples.push({ x: a.x + (b.x - a.x) * (j / n), z: a.z + (b.z - a.z) * (j / n) });
  }
  samples.push(points[points.length - 1]);
  const positions = [], indices = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i], q = samples[Math.min(i + 1, samples.length - 1)], o = samples[Math.max(i - 1, 0)];
    let dx = q.x - o.x, dz = q.z - o.z; const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const wobble = 1 + Math.sin(i * 1.7) * 0.12;
    for (const side of [-1, 1]) {
      const x = p.x + dz * side * (width / 2) * wobble, z = p.z - dx * side * (width / 2) * wobble;
      positions.push(x, heightAt(x, z) + 0.012, z); // barely above the ground, so feet stand on it rather than in it
    }
    if (i < samples.length - 1) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildSquare(material, radius = 5.2) {
  const geo = new THREE.CircleGeometry(radius, 40, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wobble = i === 0 ? 1 : 1 + Math.sin(i * 2.3) * 0.05;
    const x = VILLAGE_CENTER.x + pos.getX(i) * wobble, z = VILLAGE_CENTER.z + pos.getZ(i) * wobble;
    pos.setXYZ(i, x, heightAt(x, z) + 0.014, z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildFence([a, b], mats) {
  const g = new THREE.Group();
  const len = Math.hypot(b.x - a.x, b.z - a.z), posts = Math.max(2, Math.round(len / 1.3) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1), x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    g.add(box(0.14, 1.0, 0.14, mats.wood, x, heightAt(x, z) + 0.45, z));
  }
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, rot = Math.atan2(-(b.z - a.z), b.x - a.x);
  const ya = heightAt(a.x, a.z), yb = heightAt(b.x, b.z);
  for (const h of [0.42, 0.78]) {
    const rail = box(len, 0.08, 0.07, mats.wood, mx, (ya + yb) / 2 + h, mz);
    rail.rotation.y = rot; rail.rotation.z = Math.atan2(yb - ya, len);
    g.add(rail);
  }
  return g;
}

function buildDock(mats) {
  const g = new THREE.Group();
  const planks = 22, step = (DOCK.length + 0.6) / planks;
  for (let i = 0; i < planks; i++) {
    const p = box(DOCK.width, 0.12, step * 0.9, i % 2 ? mats.wood : mats.woodLight, 0, DOCK.top - 0.06, -0.6 + step * (i + 0.5));
    p.rotation.y = Math.sin(i * 4.1) * 0.015;
    g.add(p);
  }
  for (const along of [1.5, 5, 9.6]) for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.4, 7), mats.woodDark);
    post.position.set(side * (DOCK.width / 2 - 0.05), DOCK.top - 1.25, along); post.castShadow = true;
    g.add(post);
  }
  g.position.set(DOCK.x, 0, DOCK.z);
  g.rotation.y = DOCK.rot;
  return g;
}

function buildBoat(mats) {
  const g = new THREE.Group();
  const hullGeo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, flat(0xf2a48c, { side: THREE.DoubleSide }));
  hull.scale.set(0.8, 0.62, 1.9); hull.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 20), mats.woodLight);
  rim.rotation.x = Math.PI / 2; rim.scale.set(0.8, 1.9, 1);
  g.add(hull, rim, box(1.3, 0.07, 0.3, mats.woodLight, 0, -0.18, 0.5), box(1.3, 0.07, 0.3, mats.woodLight, 0, -0.18, -0.6));
  g.position.set(BOAT.x, 0.2, BOAT.z);
  g.rotation.y = BOAT.rot;
  return g;
}

// A stone windmill with slowly turning sails.
function buildWindmill(mats) {
  const g = new THREE.Group();
  const stone = flat(0xf1e6cf, { map: texture('stone', 5, 2) }), cap = flat(PALETTE.roofs[0], { map: texture('wood', 4, 1) });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 2.25, 6.2, 8), stone);
  tower.position.y = 3.0; tower.castShadow = true; tower.receiveShadow = true;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.55, 0.5, 8), mats.stone); base.position.y = 0.15; base.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.9, 8), cap); roof.position.y = 7.05; roof.castShadow = true;
  g.add(tower, base, roof, box(0.9, 1.7, 0.2, mats.woodDark, 0, 0.95, 2.1), box(0.6, 0.7, 0.2, mats.window, 0, 3.6, 1.75));
  const hub = new THREE.Group(); hub.position.set(0, 5.6, 1.85);
  hub.add(box(0.5, 0.5, 0.7, mats.woodDark));
  for (let i = 0; i < 4; i++) {
    const sail = new THREE.Group();
    sail.add(box(0.14, 4.4, 0.1, mats.woodDark, 0, 2.3, 0.3), box(1.0, 3.2, 0.05, flat(0xfaf3e2, { side: THREE.DoubleSide, map: texture('fabric', 1, 3) }), 0.5, 2.75, 0.3));
    for (let k = 0; k < 4; k++) sail.add(box(1.0, 0.07, 0.08, mats.woodDark, 0.5, 1.3 + k * 0.97, 0.32));
    sail.rotation.z = (i / 4) * Math.PI * 2;
    hub.add(sail);
  }
  g.add(hub);
  g.position.set(WINDMILL.x, heightAt(WINDMILL.x, WINDMILL.z) - 0.05, WINDMILL.z);
  g.rotation.y = Math.atan2(VILLAGE_CENTER.x - WINDMILL.x, VILLAGE_CENTER.z - WINDMILL.z);
  return { g, hub };
}

export function createVillage(scene) {
  const mats = {
    stone: flat(PALETTE.stone, { map: texture('stone', 2, 1) }), stoneDark: flat(PALETTE.stoneDark, { map: texture('stone', 2, 1) }),
    wood: flat(PALETTE.wood, { map: texture('wood', 1, 1) }), woodDark: flat(PALETTE.woodDark, { map: texture('wood', 1, 1) }), woodLight: flat(0xd3a877, { map: texture('wood', 1, 1) }),
    tentInside: new THREE.MeshBasicMaterial({ color: 0x5a4038 }),
    puffGeo: new THREE.IcosahedronGeometry(1, 1),
    cream: flat(0xfaf3e2), barnSeam: flat(0x9c4636),
    leaf: flat(PALETTE.leafA), dark: flat(0x4a3a3a), seam: flat(0x9a7350), thatchDark: flat(PALETTE.thatchDark),
    window: new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.4, emissive: PALETTE.windowGlow, emissiveIntensity: 0 }),
    path: new THREE.MeshStandardMaterial({ color: PALETTE.path, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
  };

  const group = new THREE.Group();
  group.add(buildField(mats));
  // Trails: a plain pale band laid just above the ground, with a clean edge and no border.
  PATHS.forEach((p, i) => group.add(buildPath(p, i < COTTAGES.length ? 1.4 : 1.8, mats.path)));
  group.add(buildSquare(mats.path));
  for (const f of FENCES) group.add(buildFence(f, mats));
  TENTS.forEach((t, i) => group.add(buildTent(t, i, mats)));
  group.add(buildDock(mats));
  // None of the scenery so far moves: weld it into a handful of meshes.
  mergeStatic(group);
  const windmill = buildWindmill(mats);
  windmill.g.remove(windmill.hub); mergeStatic(windmill.g); windmill.g.add(windmill.hub);
  mergeStatic(windmill.hub);
  const boat = buildBoat(mats);
  group.add(windmill.g, boat);
  scene.add(group);

  return {
    windowMaterial: mats.window,
    // f is 0 by day and 1 at night: windows glow as it gets dark.
    setNight(f) { mats.window.emissiveIntensity = f * 1.6; },
    update(elapsed) {
      windmill.hub.rotation.z = -elapsed * 0.45;
      boat.position.y = 0.2 + Math.sin(elapsed * 0.9) * 0.06;
      boat.rotation.z = Math.sin(elapsed * 0.7) * 0.05;
      boat.rotation.x = Math.sin(elapsed * 0.5 + 1) * 0.03;
    },
  };
}
