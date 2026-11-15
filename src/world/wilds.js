// The wild jungle behind the hill: far more land than the camp's corner of the island, thick
// with giant trees. A rope with warning signs marks where the camp ends; nobody goes past it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../logic/rng.js';
import { heightAt, landR, wildDepth } from '../logic/terrain.js';
import { WILD, GRASS_RADIUS, ISLAND_RADIUS, SEED, PALETTE } from '../config.js';

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const MAIN_HALF = 85; // the camp's own ground mesh covers this far from the middle

const tint = new THREE.Color();
function part(geo, hex, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz)));
  tint.setHex(hex);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
const join = (...parts) => { const g = mergeGeometries(parts); g.computeVertexNormals(); return g; };

// The rest of the land, beyond the camp's own ground mesh. Coarser, because nobody walks on it.
function buildGround() {
  const size = 190, seg = 118;
  const geo = new THREE.PlaneGeometry(size + 20, size + 20, seg, seg);
  geo.rotateX(-Math.PI / 2); geo.translate(WILD.x, 0, WILD.z);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const floor = new THREE.Color(0x4f7a40), floorDark = new THREE.Color(0x3d6638), high = new THREE.Color(0x6a8f4a), sand = new THREE.Color(PALETTE.sand), wet = new THREE.Color(PALETTE.sandWet), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z), r = landR(x, z);
    // Tuck under the camp's mesh where the two overlap, so they never flicker against each other.
    pos.setY(i, h - 0.3 * smooth((MAIN_HALF - 0.5 - Math.max(Math.abs(x), Math.abs(z))) / 2.5));
    if (r < GRASS_RADIUS + 1) {
      c.copy(floor).lerp(floorDark, 0.5 + 0.5 * Math.sin(x * 0.23 + Math.cos(z * 0.19) * 2)).lerp(high, smooth((h - 9) / 16));
      c.lerp(sand, Math.min(1, Math.max(0, (r - (GRASS_RADIUS - 2.5)) / 2.5)));
    } else c.copy(sand).lerp(wet, Math.min(1, Math.max(0, (r - (ISLAND_RADIUS - 4)) / 4)));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = true;
  return mesh;
}

// A jungle giant: a tall buttressed trunk and a heavy crown in a few dark lumps.
function giantGeometry() {
  const ico = (r) => new THREE.IcosahedronGeometry(r, 0);
  return join(
    part(new THREE.CylinderGeometry(0.28, 0.5, 7, 6), 0xf0b590, 0, 3.5, 0),
    part(new THREE.ConeGeometry(0.95, 1.6, 5), 0xe0a682, 0, 0.75, 0),
    part(ico(2.6), 0xffffff, 0, 8.2, 0, 1, 0.72, 1), part(ico(2.0), 0xe2f0d8, 1.7, 7.2, 0.6, 1, 0.7, 1), part(ico(1.9), 0xd3e6c8, -1.5, 7.0, -0.9, 1, 0.7, 1), part(ico(1.5), 0xf2fae8, 0.2, 9.6, -0.3, 1, 0.7, 1),
    part(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 4), 0x7fa05c, 1.9, 5.3, 0.7), part(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 4), 0x7fa05c, -1.6, 5.5, -1.0), // hanging vines
  );
}
function fernGeometry() {
  const blade = (a) => { const g = part(new THREE.ConeGeometry(0.16, 1.5, 3), 0xffffff, 0, 0.55, 0.5, 1, 1, 0.35); g.applyMatrix4(new THREE.Matrix4().makeRotationX(0.95)); g.applyMatrix4(new THREE.Matrix4().makeRotationY(a)); return g; };
  return join(...[0, 1.05, 2.1, 3.15, 4.2, 5.25].map(blade));
}

function signTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 192;
  const c = cv.getContext('2d');
  c.fillStyle = '#f6d23c'; c.fillRect(0, 0, 256, 192);
  c.fillStyle = '#2b2b2b'; for (let x = -192; x < 256; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 24, 0); c.lineTo(x + 24 + 30, 30); c.lineTo(x + 30, 30); c.fill(); c.beginPath(); c.moveTo(x, 162); c.lineTo(x + 24, 162); c.lineTo(x + 54, 192); c.lineTo(x + 30, 192); c.fill(); }
  c.fillStyle = '#c62f24'; c.textAlign = 'center'; c.font = '900 58px system-ui, sans-serif'; c.fillText('DANGER', 128, 92);
  c.fillStyle = '#2b2b2b'; c.font = '800 25px system-ui, sans-serif'; c.fillText('WILD JUNGLE', 128, 124); c.fillText('KEEP OUT', 128, 152);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createWilds(scene) {
  const rng = createRng(SEED + 7);
  const group = new THREE.Group(); scene.add(group);
  group.add(buildGround());
  const colliders = [];

  const axis = Math.atan2(WILD.z, WILD.x);
  // ---- Trees: sparse just past the rope, a solid wall of green a little further in.
  const spots = [];
  for (let tries = 0; spots.length < 1250 && tries < 60000; tries++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (WILD.radius - 9);
    const x = WILD.x + Math.cos(a) * d, z = WILD.z + Math.sin(a) * d, depth = wildDepth(x, z);
    const edge = Math.hypot(x, z) - WILD.trees;
    if (depth < -900 || edge < 0 || landR(x, z) > GRASS_RADIUS - 3) continue;
    // The first giants stand well apart among the camp's own trees; further in they close up.
    if (rng() > 0.12 + Math.min(1, edge / 22) * 0.88) continue;
    if (spots.some((s) => Math.abs(s.x - x) < 2.4 && Math.abs(s.z - z) < 2.4)) continue;
    spots.push({ x, z, depth, scale: 0.85 + rng() * 0.75 + Math.min(0.5, depth / 90), rot: rng() * 6.28, shade: rng() });
  }
  const near = spots.filter((s) => s.depth < 34), far = spots.filter((s) => s.depth >= 34);
  const geo = giantGeometry(), treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  for (const [list, shadows] of [[near, true], [far, false]]) {
    const mesh = new THREE.InstancedMesh(geo, treeMat, list.length);
    mesh.castShadow = shadows; mesh.receiveShadow = false; mesh.frustumCulled = false;
    list.forEach((s, i) => {
      dummy.position.set(s.x, heightAt(s.x, s.z) - 0.2, s.z); dummy.rotation.set(0, s.rot, 0); dummy.scale.set(s.scale, s.scale * (0.9 + s.shade * 0.35), s.scale); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setHex([0x5f9a50, 0x6aa85a, 0x528a52, 0x78b060][i % 4]).offsetHSL(0, 0, (s.shade - 0.5) * 0.06));
      if (s.depth < WILD.limit + 4) colliders.push({ x: s.x, z: s.z, r: 0.5 * s.scale });
    });
    group.add(mesh);
  }
  // Ferns crowd the ground between the first trees.
  const ferns = [];
  for (let tries = 0; ferns.length < 260 && tries < 20000; tries++) {
    const a = axis + (rng() - 0.5) * 1.5, r = WILD.trees + 2 + rng() * 40, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (wildDepth(x, z) < -900 || heightAt(x, z) < 0.6 || rng() > 0.2 + (r - WILD.trees) / 30) continue;
    ferns.push({ x, z, s: 0.7 + rng() * 0.9, rot: rng() * 6.28 });
  }
  const fernMesh = new THREE.InstancedMesh(fernGeometry(), treeMat, ferns.length);
  ferns.forEach((f, i) => { dummy.position.set(f.x, heightAt(f.x, f.z), f.z); dummy.rotation.set(0, f.rot, 0); dummy.scale.setScalar(f.s); dummy.updateMatrix(); fernMesh.setMatrixAt(i, dummy.matrix); fernMesh.setColorAt(i, color.setHex(i % 3 ? 0x4f9a4a : 0x3f8244)); });
  fernMesh.frustumCulled = false; group.add(fernMesh);

  // ---- Eyes in the dark: something is watching from between the trees.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe36b, fog: false, transparent: true });
  const eyes = [];
  for (let i = 0; i < 9; i++) {
    const a = axis + (i / 8 - 0.5) * 0.85, r = WILD.border + WILD.limit + 4 + rng() * 9, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (heightAt(x, z) < 0.6) continue;
    const pair = new THREE.Group(), m = eyeMat.clone();
    for (const s of [-0.13, 0.13]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), m); e.position.x = s; e.scale.y = 0.6; pair.add(e); }
    pair.position.set(x, heightAt(x, z) + 0.7 + rng() * 0.9, z);
    group.add(pair);
    eyes.push({ pair, m, seed: rng() * 20 });
  }

  return {
    colliders,
    // The eyes only show when you are close to the rope, brighter after dark, and they blink.
    update(elapsed, night, p) {
      const close = smooth((wildDepth(p.x, p.z) + 10) / 12);
      for (const e of eyes) {
        const blink = Math.sin(elapsed * 0.7 + e.seed) > 0.93 ? 0 : 1, show = Math.sin(elapsed * 0.23 + e.seed * 3) > -0.2 ? 1 : 0;
        e.m.opacity += (close * (0.35 + night * 0.65) * blink * show - e.m.opacity) * 0.2;
        e.pair.visible = e.m.opacity > 0.02;
        if (e.pair.visible) e.pair.lookAt(p.x, e.pair.position.y, p.z);
      }
    },
  };
}
