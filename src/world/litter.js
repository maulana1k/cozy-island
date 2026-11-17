// INTERNAL. Litter to pick up and a broken birdhouse to mend (research item #8; the rules and the places are in
// src/logic/restore.js). Every piece of one kind is one instanced mesh (four draws for all the litter); a picked-up
// piece shrinks away. The birdhouse is a small group shown broken (box askew, roof fallen) until mended, then
// upright with a little bird on the roof. E picks up / mends; main.js hands the result to the backpack and the HUD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { restoreSpots, isDone, markDone } from '../logic/restore.js';

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, flatShading: true });
function piece(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
const merge = (parts) => { const g = mergeGeometries(parts); g.computeVertexNormals(); return g; };
const H = Math.PI / 2;
// A bit bigger than life, so a scout can spot them from a few steps away.
const SHAPES = {
  bottle: () => merge([piece(new THREE.CylinderGeometry(0.055, 0.055, 0.26, 8), 0xa9d8ea, 0, 0.055, 0, 0, 0, H), piece(new THREE.CylinderGeometry(0.022, 0.04, 0.06, 8), 0xa9d8ea, 0.16, 0.055, 0, 0, 0, H), piece(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 8), 0x2f7bd6, 0.205, 0.055, 0, 0, 0, H), piece(new THREE.CylinderGeometry(0.057, 0.057, 0.08, 8), 0xe8563f, -0.02, 0.055, 0, 0, 0, H)]),
  can: () => merge([piece(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 9), 0xd8443a, 0, 0.045, 0, 0, 0, H), piece(new THREE.CylinderGeometry(0.046, 0.046, 0.015, 9), 0xc9d0d6, 0.066, 0.045, 0, 0, 0, H), piece(new THREE.CylinderGeometry(0.046, 0.046, 0.015, 9), 0xc9d0d6, -0.066, 0.045, 0, 0, 0, H)]),
  wrapper: () => merge([piece(new THREE.BoxGeometry(0.17, 0.02, 0.1), 0xf2c94c, 0, 0.012, 0, 0.1, 0, 0.12), piece(new THREE.BoxGeometry(0.07, 0.022, 0.1), 0xe8563f, 0.06, 0.014, 0.004, -0.15, 0.2, 0)]),
  bag: () => { const g = new THREE.IcosahedronGeometry(0.13, 0); g.scale(1.2, 0.45, 1); return merge([piece(g, 0xf1f1ea, 0, 0.05, 0), piece(new THREE.TorusGeometry(0.05, 0.012, 4, 8), 0xe4e4dc, 0.14, 0.03, 0, H, 0, 0)]); },
};

function birdhouse() {
  const wood = 0x9a6b42, dark = 0x6b4a33, roof = 0xc0573f;
  const post = new THREE.Mesh(merge([piece(new THREE.BoxGeometry(0.1, 1.5, 0.1), dark, 0, 0.75, 0)]), MAT);
  const house = () => merge([
    piece(new THREE.BoxGeometry(0.3, 0.3, 0.28), wood, 0, 0.15, 0),
    piece(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10), 0x2a2420, 0, 0.18, 0.141, H, 0, 0),
    piece(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 5), dark, 0, 0.09, 0.17, H, 0, 0),
  ]);
  const lid = () => merge([piece(new THREE.BoxGeometry(0.24, 0.025, 0.36), roof, -0.09, 0.34, 0, 0, 0, 0.62), piece(new THREE.BoxGeometry(0.24, 0.025, 0.36), roof, 0.09, 0.34, 0, 0, 0, -0.62)]);
  const bird = merge([piece(new THREE.SphereGeometry(0.05, 7, 5), 0x5b7fb0, 0, 0.05, 0), piece(new THREE.SphereGeometry(0.035, 7, 5), 0x5b7fb0, 0, 0.1, 0.035), piece(new THREE.SphereGeometry(0.03, 6, 4), 0xf2a23b, 0, 0.04, 0.03), piece(new THREE.ConeGeometry(0.01, 0.03, 4), 0xf2a23b, 0, 0.1, 0.075, H, 0, 0)]);
  const broken = new THREE.Group(), fixed = new THREE.Group();
  const bh = new THREE.Mesh(house(), MAT); bh.position.set(0.04, 1.42, 0); bh.rotation.set(0.12, 0, -0.38); // slipped on its nail
  const bl = new THREE.Mesh(lid(), MAT); bl.position.set(0.32, 0.0, 0.18); bl.rotation.set(0.1, 0.8, 1.6); // fallen in the grass
  broken.add(bh, bl);
  const fh = new THREE.Mesh(house(), MAT); fh.position.y = 1.5;
  const fl = new THREE.Mesh(lid(), MAT); fl.position.y = 1.5;
  const fb = new THREE.Mesh(bird, MAT); fb.position.set(0, 1.86, 0.02); fb.name = 'birdhouse-bird';
  fixed.add(fh, fl, fb);
  const g = new THREE.Group(); g.add(post, broken, fixed);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, broken, fixed, bird: fb };
}

// deps: { groundAt, onClean(thing, result) }. thing: { id, kind: 'litter' | 'birdhouse', x, y, z }.
export function createLitter(scene, deps) {
  const { groundAt } = deps;
  const s = restoreSpots();
  const meshes = {}, slots = {}; // kind -> InstancedMesh; id -> { kind, i, shrink }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const kind of Object.keys(SHAPES)) {
    const list = s.litter.filter((l) => l.kind === kind);
    if (!list.length) continue;
    const mesh = new THREE.InstancedMesh(SHAPES[kind](), MAT, list.length);
    mesh.name = `litter-${kind}`; mesh.castShadow = true; mesh.receiveShadow = false;
    list.forEach((l, i) => { slots[l.id] = { kind, i, l, shrink: isDone(l.id) ? 0 : 1 }; });
    meshes[kind] = mesh; scene.add(mesh);
  }
  function place(slot) {
    const l = slot.l, k = slot.shrink;
    e.set(0, l.rot, 0); q.setFromEuler(e); v.set(l.x, groundAt(l.x, l.z) + 0.005, l.z); sc.setScalar(Math.max(0.0001, k));
    meshes[slot.kind].setMatrixAt(slot.i, m4.compose(v, q, sc));
    meshes[slot.kind].instanceMatrix.needsUpdate = true;
  }
  for (const slot of Object.values(slots)) place(slot);
  // Whole bounding spheres: instances spread over three places.
  for (const m of Object.values(meshes)) m.computeBoundingSphere();

  let house = null;
  if (s.birdhouse) {
    const b = s.birdhouse; house = birdhouse();
    house.g.position.set(b.x, groundAt(b.x, b.z), b.z); house.g.rotation.y = b.rot; scene.add(house.g);
  }
  const showHouse = () => { if (!house) return; const ok = isDone(s.birdhouse.id); house.broken.visible = !ok; house.fixed.visible = ok; };
  showHouse();

  const interactables = s.litter.map((l) => ({
    id: l.id, kind: 'litter', position: { x: l.x, z: l.z }, markerY: groundAt(l.x, l.z) + 0.55,
    get enabled() { return !isDone(l.id); },
    prompt: () => 'E — pick up litter',
    interact() {
      const r = markDone(l.id); if (!r) return;
      slots[l.id].going = true;
      if (deps.onClean) deps.onClean({ id: l.id, kind: 'litter', x: l.x, y: groundAt(l.x, l.z), z: l.z }, r);
    },
  }));
  if (house) {
    const b = s.birdhouse;
    interactables.push({
      id: b.id, kind: 'repair', position: { x: b.x, z: b.z }, markerY: groundAt(b.x, b.z) + 2.1,
      get enabled() { return !isDone(b.id); },
      prompt: () => 'E — mend the birdhouse',
      interact() {
        const r = markDone(b.id); if (!r) return;
        if (deps.onClean) deps.onClean({ id: b.id, kind: 'birdhouse', x: b.x, y: groundAt(b.x, b.z) + 1.5, z: b.z }, r);
        setTimeout(showHouse, 900); // after the hammering
      },
    });
  }
  return {
    interactables,
    colliders: house ? [{ x: s.birdhouse.x, z: s.birdhouse.z, r: 0.12 }] : [],
    // After loading a save: show what was already cleaned.
    refresh() { for (const slot of Object.values(slots)) { slot.shrink = isDone(slot.l.id) ? 0 : 1; slot.going = false; place(slot); } showHouse(); },
    update(dt, elapsed) {
      for (const slot of Object.values(slots)) if (slot.going) { slot.shrink = Math.max(0, slot.shrink - dt * 3); place(slot); if (!slot.shrink) slot.going = false; }
      if (house && house.fixed.visible) { house.bird.rotation.y = Math.sin(elapsed * 0.7) * 0.6; house.bird.position.y = 1.86 + Math.max(0, Math.sin(elapsed * 2.3)) * 0.015; }
    },
  };
}
