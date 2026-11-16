import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import {
  COTTAGES, PATHS, FENCES, BOAT, VILLAGE_CENTER, TENTS, WINDMILL, FIELD, HILL_PATH, RAILINGS, STAIRS, TREAD, STAIR_HALF,
} from '../logic/layout.js';
import { PALETTE } from '../config.js';
import { texture, mergeStatic, stick, shared } from './build.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { backpackTent, domeTent, TENT_COLORS } from '../kit/tents.js';

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

// The small camp tents: modern hiking domes and backpacking tents in mixed colours, some with the door rolled up.
// All of them are welded into ONE mesh (the kit's vertex-coloured material is shared).
const TENT_MIX = [
  [domeTent, TENT_COLORS.mustard, 1.35, false], [backpackTent, TENT_COLORS.forest, 1.8, true], [domeTent, TENT_COLORS.slate, 1.4, true],
  [backpackTent, TENT_COLORS.orange, 1.9, false], [domeTent, TENT_COLORS.brick, 1.35, false], [backpackTent, TENT_COLORS.slate, 1.85, true], [domeTent, TENT_COLORS.forest, 1.45, true],
];
function buildTents() {
  const geos = []; let material = null;
  TENTS.forEach((t, i) => {
    const [make, color, scale, open] = TENT_MIX[i % TENT_MIX.length];
    const g = make({ color, scale, open });
    g.position.set(t.x, heightAt(t.x, t.z) - 0.03, t.z); g.rotation.y = t.rot;
    g.updateMatrixWorld(true);
    const mesh = g.children[0]; material = mesh.material;
    const geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld); geos.push(geo);
  });
  const merged = new THREE.Mesh(mergeGeometries(geos), material);
  merged.castShadow = true; merged.name = 'campTents';
  return merged;
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

// The dock itself (pier, props, ferry) is built by the harbour area: src/world/areas/harbour.js.
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

// The hill trail: flights of level earth steps, each faced with a timber plank, between slanting
// log stringers; and a lashed wooden railing with diagonal braces wherever the ground falls away.
function buildHillTrail() {
  const g = new THREE.Group();
  const LOG = 0xb98a5e, PLANK = 0x9a7350, POLE = 0xd8bb72, ROPE = 0xe9dcc0;
  const earth = new THREE.MeshStandardMaterial({ color: PALETTE.path, roughness: 1 });
  // Stringers down both sides, in short lengths so they follow the trail up the hill.
  for (let i = 1; i < HILL_PATH.length - 1; i++) {
    const a = HILL_PATH[i], b = HILL_PATH[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    const at = (d, side) => { const x = a.x + dx * d + dz * side, z = a.z + dz * d - dx * side; return [x, heightAt(a.x + dx * d, a.z + dz * d) + 0.16, z]; };
    const pieces = Math.max(1, Math.round(len / 1.4));
    for (let k = 0; k < pieces; k++) for (const side of [-STAIR_HALF - 0.08, STAIR_HALF + 0.08]) g.add(stick(at((k / pieces) * len, side), at(((k + 1) / pieces) * len, side), 0.085, LOG, 7));
  }
  // The steps themselves: a block of packed earth with a plank across its front edge.
  for (const t of STAIRS) {
    const tread = new THREE.Mesh(new THREE.BoxGeometry(STAIR_HALF * 2, 0.9, TREAD + 0.03), earth);
    tread.position.set(t.x, t.top - 0.45, t.z); tread.rotation.y = t.rot; tread.receiveShadow = true;
    const front = (t.rising ? -1 : 1) * (TREAD / 2);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(STAIR_HALF * 2 + 0.16, 0.2, 0.11), shared(PLANK));
    plank.position.set(t.x + Math.sin(t.rot) * front, t.top - 0.07, t.z + Math.cos(t.rot) * front); plank.rotation.y = t.rot; plank.castShadow = true; plank.receiveShadow = true;
    g.add(tread, plank);
  }
  for (const [a, b] of RAILINGS) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.round(len / 1.5));
    const post = (k) => { const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n; return [x, heightAt(x, z), z]; };
    for (let k = 0; k <= n; k++) {
      const p = post(k);
      g.add(stick([p[0], p[1] - 0.25, p[2]], [p[0], p[1] + 1.02, p[2]], 0.05, POLE, 6));
      // rope lashing where the rail meets the post
      const lash = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.09, 7), shared(ROPE)); lash.position.set(p[0], p[1] + 0.92, p[2]); g.add(lash);
      if (k === n) break;
      const q = post(k + 1);
      g.add(stick([p[0], p[1] + 0.95, p[2]], [q[0], q[1] + 0.95, q[2]], 0.045, POLE, 6));   // top rail
      g.add(stick([p[0], p[1] + 0.28, p[2]], [q[0], q[1] + 0.28, q[2]], 0.03, POLE, 6));    // low rail
      // a diagonal brace, leaning the other way in each bay
      const lo = k % 2 ? q : p, hi = k % 2 ? p : q;
      g.add(stick([lo[0], lo[1] + 0.28, lo[2]], [hi[0], hi[1] + 0.95, hi[2]], 0.03, POLE, 6));
    }
  }
  return g;
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
  group.add(buildHillTrail());
  // None of the scenery so far moves: weld it into a handful of meshes.
  mergeStatic(group);
  group.add(buildTents()); // after the weld: it keeps its vertex colours
  const windmill = buildWindmill(mats);
  windmill.g.remove(windmill.hub); mergeStatic(windmill.g); windmill.g.add(windmill.hub);
  mergeStatic(windmill.hub);
  const boat = mergeStatic(buildBoat(mats)); // it bobs as one piece: one mesh per colour
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
