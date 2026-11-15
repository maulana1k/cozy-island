import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import {
  COTTAGES, PATHS, FENCES, DOCK, BOAT, VILLAGE_CENTER, TENTS, WINDMILL, FIELD,
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

// One wooden building. The type decides its shape and trimmings:
// cabin (sleeping hut on stilts), hall (big meeting hall with a porch),
// barn (farm store with big doors) and guard (small post with a lookout deck).
function buildCottage(c, mats) {
  const g = new THREE.Group();
  const { width: W, depth: D, floor: F, type } = c;
  const wallH = { hall: 3.0, barn: 3.1, guard: 2.4 }[type] || 2.3;
  const front = D / 2;
  const wallMat = flat(type === 'barn' ? 0xb9553f : c.wallColor), roofMat = flat(c.roofColor);
  g.userData.puffs = [];

  // Stilts, floor and steps
  if (F > 0.1) {
    const nx = Math.max(2, Math.round(W / 2.4));
    for (let ix = 0; ix <= nx; ix++) for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, F + 0.9, 7), mats.woodDark);
      post.position.set(-W / 2 + 0.25 + (ix / nx) * (W - 0.5), F / 2 - 0.45, sz * (D / 2 - 0.25)); post.castShadow = true;
      g.add(post);
    }
    g.add(box(W + 0.36, 0.16, D + 0.36, mats.woodDark, 0, F - 0.08, 0));
    g.add(box(1.6, 0.14, 0.42, mats.wood, 0, F - 0.2, front + 0.36));
    if (F > 0.45) g.add(box(1.6, 0.14, 0.42, mats.wood, 0, F - 0.42, front + 0.72));
  } else {
    g.add(box(W + 0.3, 0.9, D + 0.3, mats.stone, 0, -0.33, 0));
  }

  // Plank walls with darker seams and corner posts
  g.add(box(W, wallH, D, wallMat, 0, F + wallH / 2, 0));
  const seams = Math.round(wallH / 0.48);
  for (let i = 1; i < seams; i++) g.add(box(W + 0.03, 0.045, D + 0.03, type === 'barn' ? mats.barnSeam : mats.seam, 0, F + (wallH * i) / seams, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.24, wallH + 0.1, 0.24, type === 'barn' ? mats.cream : mats.woodDark, sx * W / 2, F + wallH / 2, sz * D / 2));
  g.add(box(W + 0.3, 0.2, D + 0.3, mats.woodDark, 0, F + wallH + 0.02, 0));

  const roofH = type === 'guard' ? 0 : (type === 'hall' ? 2.9 : type === 'barn' ? 2.7 : 2.35);
  if (type === 'guard') {
    // A flat lookout deck with a railing, a ladder and a pennant.
    const top = F + wallH + 0.12;
    g.add(box(W + 0.9, 0.16, D + 0.9, mats.wood, 0, top, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.14, 1.0, 0.14, mats.woodDark, sx * (W / 2 + 0.35), top + 0.5, sz * (D / 2 + 0.35)));
    for (const sz of [-1, 1]) g.add(box(W + 0.8, 0.09, 0.09, mats.woodDark, 0, top + 0.95, sz * (D / 2 + 0.35)), box(W + 0.8, 0.07, 0.07, mats.woodDark, 0, top + 0.5, sz * (D / 2 + 0.35)));
    for (const sx of [-1, 1]) g.add(box(0.09, 0.09, D + 0.8, mats.woodDark, sx * (W / 2 + 0.35), top + 0.95, 0), box(0.07, 0.07, D + 0.8, mats.woodDark, sx * (W / 2 + 0.35), top + 0.5, 0));
    // little roof over the deck
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.1, 1.5, 0.1, mats.woodDark, sx * (W / 2 - 0.2), top + 1.6, sz * (D / 2 - 0.2)));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(W * 0.95, 1.2, 4), roofMat); cap.rotation.y = Math.PI / 4; cap.position.y = top + 2.9; cap.castShadow = true;
    g.add(cap);
    // ladder on the left side
    const lx = -W / 2 - 0.32;
    g.add(box(0.07, top + 0.2, 0.07, mats.wood, lx, (top + 0.2) / 2, -0.28), box(0.07, top + 0.2, 0.07, mats.wood, lx, (top + 0.2) / 2, 0.28));
    for (let k = 0; k < 6; k++) g.add(box(0.06, 0.06, 0.56, mats.wood, lx, 0.35 + k * 0.4, 0));
    // pennant
    g.add(box(0.07, 2.2, 0.07, mats.woodDark, W / 2 + 0.35, top + 2.0, D / 2 + 0.35));
    const pennant = new THREE.Mesh(roofGeometry(0.7, 1.0, 0.03), flat(0xf2b63b, { side: THREE.DoubleSide }));
    pennant.rotation.z = -Math.PI / 2; pennant.position.set(W / 2 + 0.4, top + 2.75, D / 2 + 0.35); g.add(pennant);
  } else {
    // Tiled roof in two layers
    const under = new THREE.Mesh(roofGeometry(W + 1.7, roofH - 0.05, D + 1.1), flat(new THREE.Color(c.roofColor).multiplyScalar(0.78)));
    under.position.y = F + wallH - 0.1; under.castShadow = true; under.receiveShadow = true;
    const roof = new THREE.Mesh(roofGeometry(W + 1.3, roofH, D + 1.5), roofMat);
    roof.position.y = F + wallH + 0.06; roof.castShadow = true; roof.receiveShadow = true;
    g.add(under, roof, box(0.24, 0.18, D + 1.7, mats.woodDark, 0, F + wallH + roofH + 0.07, 0));
  }

  if (type === 'cabin' || type === 'hall') {
    // Stone chimney with smoke
    const chimX = W * 0.27, chimZ = -D * 0.22, chimTop = F + wallH + roofH * 0.8 + 0.5;
    g.add(box(0.62, 1.9, 0.62, mats.stone, chimX, chimTop - 0.9, chimZ), box(0.76, 0.14, 0.76, mats.stoneDark, chimX, chimTop + 0.07, chimZ));
    g.userData.puffs = [0, 1, 2].map((k) => {
      const puff = new THREE.Mesh(mats.puffGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
      puff.userData = { offset: k / 3 + Math.abs(c.x * 0.37) % 1, x: chimX, y: chimTop + 0.2, z: chimZ };
      g.add(puff);
      return puff;
    });
  }

  if (type === 'hall') {
    // A porch roof on posts, with bunting strung across the front.
    g.add(box(W * 0.6, 0.14, 1.5, roofMat, 0, F + 2.45, front + 0.75));
    for (const sx of [-1, 1]) g.add(box(0.16, 2.4, 0.16, mats.woodDark, sx * (W * 0.3 - 0.1), F + 1.2, front + 1.35));
    const colors = [0xe8503a, 0xf2b63b, 0x5fa8a0, 0xfaf3e2];
    for (let k = 0; k < 9; k++) {
      const flag = new THREE.Mesh(roofGeometry(0.34, 0.4, 0.02), flat(colors[k % 4], { side: THREE.DoubleSide }));
      flag.rotation.z = Math.PI; flag.position.set(-W * 0.27 + k * (W * 0.54 / 8), F + 2.36, front + 1.52); g.add(flag);
    }
  }
  if (type === 'barn') {
    // Big barn doors with white braces either side of the small door, a hay loft hatch and hay bales.
    for (const sx of [-1, 1]) {
      g.add(box(1.5, 2.2, 0.08, mats.cream, sx * 1.55, 1.1, front + 0.03), box(1.3, 2.0, 0.1, wallMat, sx * 1.55, 1.1, front + 0.035));
      for (const t of [-1, 1]) { const brace = box(0.12, 2.3, 0.12, mats.cream, sx * 1.55, 1.1, front + 0.06); brace.rotation.z = t * 0.58; g.add(brace); }
    }
    g.add(box(1.0, 0.9, 0.1, mats.cream, 0, wallH + 0.75, front + 0.72), box(0.8, 0.7, 0.12, mats.dark, 0, wallH + 0.75, front + 0.73));
    const hay = flat(0xe8c15a);
    for (const [x, y, z, r] of [[W / 2 + 1.0, 0.3, 0.6, 0.2], [W / 2 + 1.1, 0.3, -0.5, -0.3], [W / 2 + 1.0, 0.9, 0.1, 0.5]]) { const b = box(1.0, 0.6, 0.7, hay, x, y, z); b.rotation.y = r; g.add(b); }
  }

  // Doorway: a dark inset with a wooden frame. The door leaf itself is an interactable prop.
  g.add(box(1.0, 1.8, 0.06, mats.dark, 0, F + 0.9, front + 0.012));
  g.add(box(1.3, 0.16, 0.18, mats.woodDark, 0, F + 1.88, front + 0.05));
  g.add(box(0.14, 1.8, 0.18, mats.woodDark, -0.57, F + 0.9, front + 0.05));
  g.add(box(0.14, 1.8, 0.18, mats.woodDark, 0.57, F + 0.9, front + 0.05));

  // Windows with wooden shutters; the panes glow at night.
  const addWindow = (x, y, z, rotY) => {
    const w = new THREE.Group();
    const frame = box(0.9, 0.9, 0.1, mats.woodDark);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.12), mats.window);
    const barV = box(0.06, 0.7, 0.14, mats.woodDark), barH = box(0.7, 0.06, 0.14, mats.woodDark);
    const shutterL = box(0.36, 0.86, 0.06, mats.wood, -0.64, 0, 0.04), shutterR = box(0.36, 0.86, 0.06, mats.wood, 0.64, 0, 0.04);
    const sill = box(1.0, 0.08, 0.2, mats.woodDark, 0, -0.5, 0.08);
    w.add(frame, pane, barV, barH, shutterL, shutterR, sill);
    w.position.set(x, y, z); w.rotation.y = rotY;
    g.add(w);
  };
  const winY = F + 1.35;
  if (type === 'cabin') { addWindow(-1.55, winY, front + 0.02, 0); addWindow(1.55, winY, front + 0.02, 0); }
  if (type === 'hall') { addWindow(-2.75, winY + 0.2, front + 0.02, 0); addWindow(2.75, winY + 0.2, front + 0.02, 0); addWindow(-2, winY + 0.2, -front - 0.02, Math.PI); addWindow(2, winY + 0.2, -front - 0.02, Math.PI); }
  addWindow(W / 2 + 0.02, winY, 0, Math.PI / 2);
  addWindow(-W / 2 - 0.02, winY, 0, -Math.PI / 2);

  g.position.set(c.x, heightAt(c.x, c.z) - 0.05, c.z);
  g.rotation.y = c.rot;
  return g;
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
  const canvas = flat(PALETTE.tents[i % PALETTE.tents.length], { side: THREE.DoubleSide });
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

// A stone windmill with slowly turning sails.
function buildWindmill(mats) {
  const g = new THREE.Group();
  const stone = flat(0xf1e6cf), cap = flat(PALETTE.roofs[0]);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 2.25, 6.2, 8), stone);
  tower.position.y = 3.0; tower.castShadow = true; tower.receiveShadow = true;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.55, 0.5, 8), mats.stone); base.position.y = 0.15; base.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.9, 8), cap); roof.position.y = 7.05; roof.castShadow = true;
  g.add(tower, base, roof, box(0.9, 1.7, 0.2, mats.woodDark, 0, 0.95, 2.1), box(0.6, 0.7, 0.2, mats.window, 0, 3.6, 1.75));
  const hub = new THREE.Group(); hub.position.set(0, 5.6, 1.85);
  hub.add(box(0.5, 0.5, 0.7, mats.woodDark));
  for (let i = 0; i < 4; i++) {
    const sail = new THREE.Group();
    sail.add(box(0.14, 4.4, 0.1, mats.woodDark, 0, 2.3, 0.3), box(1.0, 3.2, 0.05, flat(0xfaf3e2, { side: THREE.DoubleSide }), 0.5, 2.75, 0.3));
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
    stone: flat(PALETTE.stone), stoneDark: flat(PALETTE.stoneDark),
    wood: flat(PALETTE.wood), woodDark: flat(PALETTE.woodDark), woodLight: flat(0xd3a877),
    tentInside: new THREE.MeshBasicMaterial({ color: 0x5a4038 }),
    puffGeo: new THREE.IcosahedronGeometry(1, 1),
    cream: flat(0xfaf3e2), barnSeam: flat(0x9c4636),
    leaf: flat(PALETTE.leafA), dark: flat(0x4a3a3a), seam: flat(0x9a7350), thatchDark: flat(PALETTE.thatchDark),
    window: new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.4, emissive: PALETTE.windowGlow, emissiveIntensity: 0 }),
    path: new THREE.MeshStandardMaterial({ color: PALETTE.path, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };

  const group = new THREE.Group();
  const puffs = [];
  for (const c of COTTAGES) { const house = buildCottage(c, mats); puffs.push(...house.userData.puffs); group.add(house); }
  const windmill = buildWindmill(mats);
  group.add(buildField(mats));
  group.add(windmill.g);
  PATHS.forEach((p, i) => group.add(buildPath(p, i < COTTAGES.length ? 1.3 : 1.7, mats.path)));
  group.add(buildSquare(mats.path));
  for (const f of FENCES) group.add(buildFence(f, mats));
  TENTS.forEach((t, i) => group.add(buildTent(t, i, mats)));
  group.add(buildDock(mats));
  const boat = buildBoat(mats);
  group.add(boat);
  scene.add(group);

  return {
    windowMaterial: mats.window,
    // f is 0 by day and 1 at night: windows glow as it gets dark.
    setNight(f) { mats.window.emissiveIntensity = f * 1.6; },
    update(elapsed) {
      windmill.hub.rotation.z = -elapsed * 0.45;
      // Smoke puffs rise from each chimney, growing and fading as they go.
      for (const p of puffs) {
        const u = p.userData, t = (elapsed * 0.22 + u.offset) % 1;
        p.position.set(u.x + Math.sin(t * 5 + u.offset * 9) * 0.3 * t + t * 0.5, u.y + t * 2.6, u.z);
        p.scale.setScalar(0.16 + t * 0.42);
        p.material.opacity = (1 - t) * 0.75;
      }
      boat.position.y = 0.2 + Math.sin(elapsed * 0.9) * 0.06;
      boat.rotation.z = Math.sin(elapsed * 0.7) * 0.05;
      boat.rotation.x = Math.sin(elapsed * 0.5 + 1) * 0.03;
    },
  };
}
