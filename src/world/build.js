// Small helpers shared by the things built from simple shapes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...extra });

// ---- Surface textures --------------------------------------------------------
// Light grey patterns drawn once and multiplied by each material's own colour, so canvas
// looks woven, wood has grain, bamboo has its rings and stone has courses. Kept soft so
// they sit with the simple shapes rather than fighting them.
const painters = {
  // Woven cloth with a stitched seam down each panel and a faint weathered tone.
  fabric(c, S, rnd) {
    for (let i = 0; i < 14; i++) { const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 60; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rnd() < 0.5 ? 'rgba(150,150,150,0.10)' : 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, S, S); }
    c.strokeStyle = 'rgba(110,110,110,0.10)'; c.lineWidth = 1;
    for (let p = 0; p < S; p += 4) { c.beginPath(); c.moveTo(p + 0.5, 0); c.lineTo(p + 0.5, S); c.moveTo(0, p + 0.5); c.lineTo(S, p + 0.5); c.stroke(); }
    c.fillStyle = 'rgba(95,95,95,0.20)'; c.fillRect(0, 0, 3, S); c.fillRect(S - 3, 0, 3, S);
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.setLineDash([7, 6]); c.lineWidth = 1.5;
    for (const x of [8, S - 8]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
    c.setLineDash([]);
    c.fillStyle = 'rgba(95,95,95,0.14)'; c.fillRect(0, S - 5, S, 5); // hem
  },
  // Boards with gaps between them, long grain streaks and the odd knot.
  wood(c, S, rnd) {
    for (let i = 0; i < 130; i++) { const x = rnd() * S; c.strokeStyle = `rgba(${rnd() < 0.5 ? '90,90,90' : '255,255,255'},${0.05 + rnd() * 0.12})`; c.lineWidth = 0.6 + rnd() * 1.4; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + (rnd() - 0.5) * 8, S * 0.33, x + (rnd() - 0.5) * 8, S * 0.66, x, S); c.stroke(); }
    c.fillStyle = 'rgba(70,70,70,0.30)'; for (const x of [0, S / 3, (2 * S) / 3]) c.fillRect(x - 1.5, 0, 3, S);
    for (let i = 0; i < 4; i++) { const x = rnd() * S, y = rnd() * S; c.strokeStyle = 'rgba(80,80,80,0.28)'; c.lineWidth = 1.2; for (const r of [3, 6, 9]) { c.beginPath(); c.ellipse(x, y, r * 0.6, r, 0, 0, Math.PI * 2); c.stroke(); } }
  },
  // Bamboo: soft lengthwise streaks and a raised ring at each joint.
  bamboo(c, S, rnd) {
    for (let i = 0; i < 50; i++) { const x = rnd() * S; c.fillStyle = `rgba(${rnd() < 0.5 ? '100,100,100' : '255,255,255'},${0.05 + rnd() * 0.1})`; c.fillRect(x, 0, 1 + rnd() * 4, S); }
    for (const y of [S * 0.22, S * 0.72]) { c.fillStyle = 'rgba(70,70,70,0.42)'; c.fillRect(0, y, S, 4); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, y + 4, S, 3); c.fillStyle = 'rgba(90,90,90,0.16)'; c.fillRect(0, y - 6, S, 6); }
  },
  // Stonework: staggered courses of blocks, each a slightly different shade.
  stone(c, S, rnd) {
    const rows = 6, h = S / rows;
    for (let r = 0; r < rows; r++) for (let k = -1; k < 4; k++) {
      const w = S / 3, x = k * w + (r % 2 ? w / 2 : 0), v = 205 + Math.floor(rnd() * 45);
      c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x + 2, r * h + 2, w - 4, h - 4);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 2, r * h + 2, w - 4, 3);
    }
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(90,90,90,${rnd() * 0.12})`; c.fillRect(rnd() * S, rnd() * S, 2, 2); }
  },
};
const baseTone = { fabric: '#f1f1f1', wood: '#ededed', bamboo: '#f0f0f0', stone: '#b9b9b9' };
const textureCache = new Map();
// A texture of the given kind, repeated (rx, ry) times across a face. Without a document
// (in tests) there is nothing to draw on, so materials simply stay plain.
export function texture(kind, rx = 1, ry = 1) {
  if (typeof document === 'undefined') return null;
  const key = `${kind}:${rx}:${ry}`;
  if (textureCache.has(key)) return textureCache.get(key);
  let base = textureCache.get(kind);
  if (!base) {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'); c.fillStyle = baseTone[kind]; c.fillRect(0, 0, S, S);
    let seed = 7 + kind.length * 131; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    painters[kind](c, S, rnd);
    base = new THREE.CanvasTexture(cv); base.colorSpace = THREE.SRGBColorSpace; base.anisotropy = 4;
    textureCache.set(kind, base);
  }
  const t = base.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true;
  textureCache.set(key, t);
  return t;
}

// Which everyday colours are wood and which are bamboo, so props pick up the right texture.
const KIND_BY_COLOR = { 0xd8bb72: 'bamboo', 0xb98a5e: 'wood', 0xc79a62: 'wood', 0x8c6444: 'wood', 0x9a7350: 'wood', 0xe3c79a: 'wood', 0x9b6f4c: 'wood', 0xb08663: 'wood', 0xbdb4bb: 'stone', 0xa198a6: 'stone', 0xb3a8ad: 'stone' };
const cache = new Map();
// One shared material per colour, for props that never change.
export function shared(color) {
  if (!cache.has(color)) { const kind = KIND_BY_COLOR[color]; cache.set(color, flat(color, kind ? { map: texture(kind, kind === 'bamboo' ? 1 : 1, kind === 'bamboo' ? 3 : 1) } : {})); }
  return cache.get(color);
}
const asMat = (m) => (typeof m === 'number' ? shared(m) : m);

export function box(w, h, d, m, x = 0, y = 0, z = 0, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), asMat(m));
  mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
export function cyl(rTop, rBottom, h, m, x = 0, y = 0, z = 0, seg = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), asMat(m));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
export function ball(r, m, x = 0, y = 0, z = 0, detail = 0) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), asMat(m));
  mesh.position.set(x, y, z); mesh.castShadow = true;
  return mesh;
}
const UP = new THREE.Vector3(0, 1, 0);
// A pole or rope running from point a to point b.
export function stick(a, b, r, m, seg = 6) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), asMat(m));
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, vb.sub(va).normalize());
  mesh.castShadow = true;
  return mesh;
}
// A triangular prism lying along z: the shape of a tent or a pitched roof.
export function roofGeometry(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(0, height); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// Welds everything under `root` that never moves into one mesh per material. A camp's worth of
// crates and poles then costs a few dozen draw calls instead of several hundred.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const byMaterial = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(m4.multiplyMatrices(inverse, o.matrixWorld));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, { geos: [], cast: false });
    const entry = byMaterial.get(o.material); entry.geos.push(g); entry.cast = entry.cast || o.castShadow;
  });
  root.clear();
  for (const [material, { geos, cast }] of byMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
