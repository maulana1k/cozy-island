// Small helpers shared by the things built from simple shapes.
import * as THREE from 'three';

export const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...extra });
const cache = new Map();
// One shared material per colour, for props that never change.
export function shared(color) { if (!cache.has(color)) cache.set(color, flat(color)); return cache.get(color); }
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
