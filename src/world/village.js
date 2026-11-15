import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import {
  COTTAGES, COTTAGE_SIZE, PATHS, FENCES, DOCK, BOAT, VILLAGE_CENTER,
} from '../logic/layout.js';
import { PALETTE } from '../config.js';

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

function buildCottage(c, mats) {
  const g = new THREE.Group();
  const { width: W, depth: D } = COTTAGE_SIZE;
  const wallH = 2.5, front = D / 2;
  const wallMat = flat(c.wallColor), roofMat = flat(c.roofColor);

  g.add(box(W + 0.3, 1.0, D + 0.3, mats.stone, 0, -0.3, 0));           // plinth, sunk into the ground
  g.add(box(W, wallH, D, wallMat, 0, 0.2 + wallH / 2, 0));               // walls
  const roof = new THREE.Mesh(roofGeometry(W + 0.9, 1.9, D + 0.9), roofMat);
  roof.position.y = 0.2 + wallH; roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);
  g.add(box(0.6, 1.5, 0.6, mats.stone, W * 0.27, 0.2 + wallH + 1.25, -D * 0.2)); // chimney
  g.add(box(0.72, 0.14, 0.72, mats.stoneDark, W * 0.27, 0.2 + wallH + 2.05, -D * 0.2));

  // Doorway: a dark inset with a wooden frame. The door leaf itself is an interactable prop.
  g.add(box(1.0, 1.8, 0.06, mats.dark, 0, 0.2 + 0.9, front + 0.012));
  g.add(box(1.24, 0.14, 0.16, mats.woodDark, 0, 0.2 + 1.87, front + 0.04));
  g.add(box(0.12, 1.8, 0.16, mats.woodDark, -0.56, 0.2 + 0.9, front + 0.04));
  g.add(box(0.12, 1.8, 0.16, mats.woodDark, 0.56, 0.2 + 0.9, front + 0.04));
  g.add(box(1.5, 0.16, 0.7, mats.stone, 0, 0.12, front + 0.35));          // doorstep

  const addWindow = (x, y, z, rotY) => {
    const w = new THREE.Group();
    const frame = box(0.96, 0.96, 0.1, mats.wood);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.76, 0.12), mats.window);
    const barV = box(0.06, 0.76, 0.14, mats.wood), barH = box(0.76, 0.06, 0.14, mats.wood);
    const planter = box(0.9, 0.16, 0.24, mats.woodDark, 0, -0.58, 0.14);
    const leaves = box(0.8, 0.14, 0.2, mats.leaf, 0, -0.46, 0.14);
    const bloom = box(0.5, 0.1, 0.16, flat(PALETTE.flowers[(Math.abs(Math.round(x * 3 + z)) % PALETTE.flowers.length)]), 0, -0.37, 0.14);
    w.add(frame, pane, barV, barH, planter, leaves, bloom);
    w.position.set(x, y, z); w.rotation.y = rotY;
    g.add(w);
  };
  addWindow(-1.6, 1.65, front + 0.02, 0);
  addWindow(1.6, 1.65, front + 0.02, 0);
  addWindow(W / 2 + 0.02, 1.65, 0, Math.PI / 2);
  addWindow(-W / 2 - 0.02, 1.65, 0, -Math.PI / 2);

  g.position.set(c.x, heightAt(c.x, c.z) - 0.05, c.z);
  g.rotation.y = c.rot;
  return g;
}

// A ribbon that hugs the ground along a polyline.
function buildPath(points, width, material) {
  const samples = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.8));
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
      positions.push(x, heightAt(x, z) + 0.05, z);
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

function buildSquare(material) {
  const geo = new THREE.CircleGeometry(5.2, 40, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wobble = i === 0 ? 1 : 1 + Math.sin(i * 2.3) * 0.05;
    const x = VILLAGE_CENTER.x + pos.getX(i) * wobble, z = VILLAGE_CENTER.z + pos.getZ(i) * wobble;
    pos.setXYZ(i, x, heightAt(x, z) + 0.06, z);
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

export function createVillage(scene) {
  const mats = {
    stone: flat(PALETTE.stone), stoneDark: flat(PALETTE.stoneDark),
    wood: flat(PALETTE.wood), woodDark: flat(PALETTE.woodDark), woodLight: flat(0xd3a877),
    leaf: flat(PALETTE.leafA), dark: flat(0x4a3a3a),
    window: new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.4, emissive: PALETTE.windowGlow, emissiveIntensity: 0 }),
    path: new THREE.MeshStandardMaterial({ color: PALETTE.path, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };

  const group = new THREE.Group();
  for (const c of COTTAGES) group.add(buildCottage(c, mats));
  PATHS.forEach((p, i) => group.add(buildPath(p, i < COTTAGES.length ? 1.3 : 1.7, mats.path)));
  group.add(buildSquare(mats.path));
  for (const f of FENCES) group.add(buildFence(f, mats));
  group.add(buildDock(mats));
  const boat = buildBoat(mats);
  group.add(boat);
  scene.add(group);

  return {
    windowMaterial: mats.window,
    // f is 0 by day and 1 at night: windows glow as it gets dark.
    setNight(f) { mats.window.emissiveIntensity = f * 1.6; },
    update(elapsed) {
      boat.position.y = 0.2 + Math.sin(elapsed * 0.9) * 0.06;
      boat.rotation.z = Math.sin(elapsed * 0.7) * 0.05;
      boat.rotation.x = Math.sin(elapsed * 0.5 + 1) * 0.03;
    },
  };
}
