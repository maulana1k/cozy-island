// Every shadow a moving person casts is redrawn every picture (the sun's or moon's map, the bonfire's
// and the nearest lamp's cubes), so it keeps step with them. What makes that costly is not triangles
// but draw calls: every caster is drawn once into the sun map and once per cube face it touches. So the
// things that never move (tents, benches, crates, fences) near the player are welded, in world space,
// into one position-only mesh per 10 m cell that is drawn only into shadow maps; while welded, the
// originals cast nothing themselves. People (skinned, or hung on bones), cutouts, and anything seen
// moving, reshaping or hiding stay live casters. Nothing here is drawn to the screen.
//   layers: proxies sit on `sunLayer` (added to the sun shadow camera, next to layer 0) or `cubeLayer`
//   (the night cubes' caster layer), never on layer 0, so the main camera and raycasts never see them.
import * as THREE from 'three';

const CELL = 10; // m: a cube face or the sun's box skips the cells outside it
const REACH = 50, LET_GO = 60; // m from the player: weld within REACH, unweld beyond LET_GO (no churn at the edge)
const MAX_R = 12; // m: bigger things (the ground, the sea) stay as they are
const SWAY = 0.015; // m: a tent breathing in the wind by less than this keeps its welded shadow; more and it casts live
const FLIP = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };

function worldVisible(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
function onBone(o) { for (let p = o.parent; p; p = p.parent) if (p.isBone) return true; return false; }

// Can this caster be welded without changing its shadow? (no cutouts, no bones or morphs, one material)
export function weldable(o) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh || o.customDistanceMaterial || o.customDepthMaterial) return false;
  const m = o.material, g = o.geometry;
  if (!m || Array.isArray(m) || !m.visible || m.alphaTest > 0 || m.alphaToCoverage || m.alphaMap || m.displacementMap || (m.clippingPlanes && m.clippingPlanes.length)) return false;
  if (!g || !g.attributes.position || (g.morphAttributes && g.morphAttributes.position)) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  return !onBone(o);
}

// Is this caster a lamp's own fixture (post, arm, lantern housing)? A small, non-skinned thing whose bounding
// sphere encloses the light. A real lantern is a glowing area source a few tens of cm wide, so its own post
// leaves only a faint soft penumbra; a point light would cast an endless hard wedge, so the lamp's cube must
// not draw it. centres: entries with `light` (a Vector3) and `slot` are the shadowing lamps.
// Returns the slot of the lamp this caster is the fixture of, or -1.
export function ownFixture(o, cx, cy, cz, r, centres) {
  if (r >= 1.6 || o.isSkinnedMesh || onBone(o)) return -1;
  for (const c of centres) if (c.light && (cx - c.light.x) ** 2 + (cy - c.light.y) ** 2 + (cz - c.light.z) ** 2 < (r + 0.1) ** 2) return c.slot;
  return -1;
}

export function createShadowProxies(scene, { cubeLayer, sunLayer }) {
  const root = new THREE.Group();
  root.name = 'shadowProxies'; root.matrixAutoUpdate = false; root.userData.shadowProxy = true;
  scene.add(root);
  const moves = new WeakMap(); // times seen moving after being welded; twice and it stays live for good
  const cells = new Map(); // key -> { members: Map(obj -> state), meshes: [], dirty }
  const where = new Map(); // obj -> cell key
  const mats = {};
  const matFor = (side) => mats[side] || (mats[side] = Object.assign(new THREE.MeshBasicMaterial({ colorWrite: false }), { shadowSide: side }));
  const _v = new THREE.Vector3();
  let onFree = null;

  function merged(list, side, layer) {
    let nv = 0, ni = 0;
    for (const o of list) { const g = o.geometry, n = g.attributes.position.count; nv += n; ni += g.index ? g.index.count : n; }
    const pos = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v = 0, i = 0;
    for (const o of list) {
      const g = o.geometry, p = g.attributes.position, n = p.count;
      for (let k = 0; k < n; k++) { _v.fromBufferAttribute(p, k).applyMatrix4(o.matrixWorld); pos[(v + k) * 3] = _v.x; pos[(v + k) * 3 + 1] = _v.y; pos[(v + k) * 3 + 2] = _v.z; }
      if (g.index) for (let k = 0; k < g.index.count; k++) idx[i++] = g.index.getX(k) + v;
      else for (let k = 0; k < n; k++) idx[i++] = k + v;
      v += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, matFor(side));
    mesh.matrixAutoUpdate = false; mesh.castShadow = true; mesh.receiveShadow = false;
    mesh.layers.set(layer); mesh.userData.shadowProxy = true;
    root.add(mesh);
    return mesh;
  }

  // Per cell and face side: one mesh of everything for the sun, one of only what stands near a lit fire
  // or the shadowing lamp for their cubes (the cubes would otherwise draw the whole camp six times).
  function build(cell) {
    for (const m of cell.meshes) { root.remove(m); m.geometry.dispose(); }
    cell.meshes.length = 0;
    const bySide = new Map();
    for (const [o, st] of cell.members) {
      const side = o.material.shadowSide ?? FLIP[o.material.side];
      if (!bySide.has(side)) bySide.set(side, { all: [], near: [] });
      const b = bySide.get(side); b.all.push(o); if (st.near) b.near.push(o);
    }
    for (const [side, b] of bySide) {
      cell.meshes.push(merged(b.all, side, sunLayer));
      if (b.near.length) cell.meshes.push(merged(b.near, side, cubeLayer));
    }
    cell.dirty = false;
  }

  function isNear(r, centres) { // _v: the caster's world centre
    for (const c of centres) if ((_v.x - c.x) ** 2 + (_v.z - c.z) ** 2 < (c.r + r) ** 2) return true;
    return false;
  }
  function weld(o, near) {
    const g = o.geometry;
    _v.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
    const key = `${Math.floor(_v.x / CELL)},${Math.floor(_v.z / CELL)}`;
    let cell = cells.get(key); if (!cell) cells.set(key, (cell = { members: new Map(), meshes: [], dirty: true }));
    const r = g.boundingSphere.radius + g.boundingSphere.center.length(); // how far a point of it can be from its origin
    cell.members.set(o, { m: o.matrixWorld.elements.slice(), r, near, geo: g, ver: g.attributes.position.version, idx: g.index ? g.index.version : -1 });
    cell.dirty = true; where.set(o, key);
    o.castShadow = false; o.userData.welded = true;
  }
  function unweld(o) {
    const key = where.get(o); if (key === undefined) return;
    const cell = cells.get(key); cell.members.delete(o); cell.dirty = true; where.delete(o);
    o.castShadow = true; delete o.userData.welded;
    if (onFree) onFree(o);
  }
  function flush() {
    for (const [key, cell] of cells) {
      if (cell.dirty) build(cell);
      if (!cell.members.size) cells.delete(key);
    }
  }

  // Trees, bushes and rocks are instanced meshes that never move (marked userData.staticCaster), so they
  // cannot be welded like the rest. For each light that shades (a lamp, the bonfire) their instances within
  // reach are merged once, from the instance matrices (sway ignored), into one shadow-only mesh on the cube
  // layer; only those of the lights now in use are visible, the rest wait in the cache.
  const stat = new Map(); // "x,z" -> { mesh|null, x, z }
  function buildStatic(c) {
    const list = [], m = new THREE.Matrix4();
    scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.userData.staticCaster) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); m.premultiply(o.matrixWorld);
        _v.copy(g.boundingSphere.center).applyMatrix4(m);
        const reach = c.r + 3 + g.boundingSphere.radius * m.getMaxScaleOnAxis();
        if ((_v.x - c.x) ** 2 + (_v.z - c.z) ** 2 < reach * reach) list.push({ geometry: g, matrixWorld: m.clone() });
      }
    });
    return list.length ? merged(list, THREE.DoubleSide, cubeLayer) : null;
  }
  function syncStatic(centres) {
    const live = new Set();
    for (const c of centres) {
      const key = `${c.x.toFixed(1)},${c.z.toFixed(1)}`; live.add(key);
      let e = stat.get(key); if (!e) { e = { mesh: buildStatic(c) }; stat.set(key, e); }
      if (e.mesh) e.mesh.visible = true;
    }
    for (const [key, e] of stat) if (!live.has(key) && e.mesh) e.mesh.visible = false;
  }

  return {
    root, syncStatic,
    // Called with each caster handed back (e.g. to put it on the cube layer at once).
    set onFree(fn) { onFree = fn; },
    // A few times a second: weld still casters near the player, let go of those far behind.
    // centres: [{ x, z, r }] round the lights whose cubes are drawn; a caster within r (plus its size) is near.
    scan(px, pz, centres = []) {
      scene.traverse((o) => {
        if (!o.isMesh || o.userData.shadowProxy) return;
        const welded = where.has(o);
        if (!welded && (!o.castShadow || (moves.get(o) || 0) >= 2 || !weldable(o) || !worldVisible(o))) return;
        const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        _v.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld);
        const d2 = (_v.x - px) ** 2 + (_v.z - pz) ** 2;
        const rw = g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis();
        if (centres.length && ownFixture(o, _v.x, _v.y, _v.z, rw, centres) >= 0) { if (welded) unweld(o); return; } // stays a live caster; the lamp's own cube skips it
        if (welded) {
          if (d2 > LET_GO * LET_GO) { unweld(o); return; }
          const st = cells.get(where.get(o)).members.get(o), near = isNear(g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis(), centres);
          if (near !== st.near) { st.near = near; cells.get(where.get(o)).dirty = true; }
          return;
        }
        if (d2 < REACH * REACH && g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() < MAX_R) weld(o, isNear(g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis(), centres));
      });
      flush();
    },
    // Every picture: anything welded that moved, changed shape, hid, or was set to cast by other code
    // since it was welded casts live again from this picture on, and its cell is rebuilt.
    check() {
      let freed = null;
      for (const cell of cells.values()) for (const [o, s] of cell.members) {
        const e = o.matrixWorld.elements, g = o.geometry;
        // How far any point of it has gone from where it was welded, at most (columns 0-2 turn and scale, 3 moves).
        let turn = 0;
        for (let k = 0; k < 11; k++) if (k !== 3 && k !== 7) turn = Math.max(turn, Math.abs(e[k] - s.m[k]));
        const moved = Math.abs(e[12] - s.m[12]) + Math.abs(e[13] - s.m[13]) + Math.abs(e[14] - s.m[14]) + 3 * turn * s.r > SWAY;
        const reshaped = g !== s.geo || g.attributes.position.version !== s.ver || (g.index ? g.index.version : -1) !== s.idx;
        if (moved || reshaped) moves.set(o, (moves.get(o) || 0) + 1);
        if (moved || reshaped || o.castShadow || !worldVisible(o)) (freed || (freed = [])).push(o);
      }
      if (freed) { for (const o of freed) unweld(o); flush(); }
      return freed;
    },
    get count() { return where.size; },
    get draws() { return root.children.length; },
  };
}
