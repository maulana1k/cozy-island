// Soft contact shadows: dark blurred blobs on the ground where things touch it, so nothing looks as if
// it floats. Two instanced meshes, two draw calls in all:
// - fixed blobs under everything solid in the camp and the areas (rocks, trunks, posts, fences, seats,
//   tables; a soft dark rim round the foot of each walk-in tent), from the colliders;
// - moving blobs under each person's feet and body, following them and fading as they leave the ground.
// Drawn straight over the ground with ordinary blending, so they look the same on Graphics High and Low.
import * as THREE from 'three';
import { FIGURES } from '../actors/figure.js';

const SHADE = { solid: 0.42, rim: 0.4, foot: 0.5, body: 0.24 };
const FAR = 70;          // metres from the camera where the blobs have faded out
const PEOPLE_NEAR = 45;  // people further than this get no blobs
const MAX_MOVING = 420;

const material = new THREE.ShaderMaterial({
  uniforms: { uFar: { value: FAR }, uTint: { value: new THREE.Color(0.05, 0.07, 0.09) } },
  vertexShader: /* glsl */`
    attribute vec4 aBlob; // x darkness, y shape (0 soft box, 1 rim), zw the edge as a share of the half size
    varying vec2 vP; varying vec4 vB; varying float vDist;
    void main() {
      vP = position.xz; vB = aBlob;
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vec4 mv = viewMatrix * wp; vDist = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform float uFar; uniform vec3 uTint; varying vec2 vP; varying vec4 vB; varying float vDist;
    void main() {
      vec2 q = abs(vP), e = vB.zw, w = max(1.0 - e, 1e-3);
      vec2 d = (q - e) / w; // 0 at the edge of the thing, 1 at the blob's rim
      float a;
      if (vB.y < 0.5) { float r = length(max(d, 0.0)); a = 1.0 - smoothstep(0.0, 1.0, r); a *= a; }
      else { float s = max(d.x, d.y) < 0.0 ? max(d.x, d.y) : length(max(d, 0.0)); a = 1.0 - smoothstep(0.0, 1.0, abs(s)); a *= a; }
      a *= vB.x * (1.0 - smoothstep(uFar * 0.65, uFar, vDist));
      if (a < 0.004) discard;
      gl_FragColor = vec4(uTint, a);
    }`,
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
});

function quad() {
  const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2);
  for (const k of ['normal', 'uv']) g.deleteAttribute(k);
  return g;
}

export function createContactShadows(scene, { groundAt }) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  // Place one blob: centre, half sizes, turn about y; a fixed one leans with the ground under it.
  function place(x, z, hx, hz, rot, lift = 0.03, g0 = groundAt(x, z), tilt = true) {
    q.setFromAxisAngle(up, rot);
    if (tilt) {
      const s = Math.min(1.2, Math.max(hx, hz));
      const gx = groundAt(x + s, z) - groundAt(x - s, z), gz = groundAt(x, z + s) - groundAt(x, z - s);
      nrm.set(-gx / (2 * s), 1, -gz / (2 * s)).normalize();
      if (nrm.y > 0.6) q.premultiply(qYaw.setFromUnitVectors(up, nrm)); // a ledge or a deck edge: stay level rather than stand on end
    }
    p.set(x, g0 + lift + 0.012 * Math.max(hx, hz), z); sc.set(hx, 1, hz);
    return m4.compose(p, q, sc);
  }

  // ---- Fixed blobs, from the colliders: { x, z, r } circles and { x, z, hw, hd, rot } boxes.
  let fixed = null;
  function addStatic(colliders) {
    const list = [];
    for (const c of colliders) {
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) continue;
      if (c.r !== undefined) {
        if (c.r < 0.08 || c.r > 3) continue; // a big round zone (a fire pit's keep-out, a windmill) is not a footprint
        const h = c.r * 1.3 + 0.18;
        list.push({ x: c.x, z: c.z, hx: h, hz: h, rot: 0, shape: 0, ex: 0, ez: 0, k: SHADE.solid });
      } else if (c.hw !== undefined) {
        const rim = c.building || c.tall, m = rim ? 0.55 : 0.28;
        const hx = c.hw + m, hz = c.hd + m;
        list.push({ x: c.x, z: c.z, hx, hz, rot: c.rot || 0, shape: rim ? 1 : 0, ex: c.hw / hx, ez: c.hd / hz, k: rim ? SHADE.rim : SHADE.solid * 0.9 });
      }
    }
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(quad(), material, list.length);
    const blob = new Float32Array(list.length * 4);
    list.forEach((b, i) => {
      mesh.setMatrixAt(i, place(b.x, b.z, b.hx, b.hz, b.rot));
      blob.set([b.k, b.shape, b.ex, b.ez], i * 4);
    });
    mesh.geometry.setAttribute('aBlob', new THREE.InstancedBufferAttribute(blob, 4));
    mesh.castShadow = mesh.receiveShadow = false; mesh.renderOrder = -1; mesh.frustumCulled = false;
    if (fixed) { scene.remove(fixed); fixed.geometry.dispose(); }
    fixed = mesh; scene.add(mesh);
  }

  // ---- Moving blobs: two feet and the body of everyone near the camera.
  const moving = new THREE.InstancedMesh(quad(), material, MAX_MOVING);
  const mBlob = new THREE.InstancedBufferAttribute(new Float32Array(MAX_MOVING * 4), 4); mBlob.setUsage(THREE.DynamicDrawUsage);
  moving.geometry.setAttribute('aBlob', mBlob); moving.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  moving.castShadow = moving.receiveShadow = false; moving.renderOrder = -1; moving.frustumCulled = false; moving.count = 0;
  scene.add(moving);
  const shown = (o) => { for (let n = o; n; n = n.parent) { if (!n.visible) return false; if (n === scene) return true; } return false; };
  const yawOf = new THREE.Euler();

  function update(camera) {
    let n = 0;
    const cx = camera.position.x, cz = camera.position.z;
    for (const f of FIGURES) {
      const g = f.group;
      if (n + 3 > MAX_MOVING) break;
      if ((g.position.x - cx) ** 2 + (g.position.z - cz) ** 2 > PEOPLE_NEAR * PEOPLE_NEAR || !shown(g)) continue;
      const e = g.matrixWorld.elements, gx = e[12], gy = e[13], gz = e[14], s = f.scale;
      yawOf.setFromRotationMatrix(g.matrixWorld, 'YXZ'); const yaw = yawOf.y;
      // The body: a broad soft patch under the hips, fading as the person rises (a hop, a ladder, a seat).
      const ground = groundAt(gx, gz), lift = Math.max(0, gy - ground);
      const kb = SHADE.body * (1 - Math.min(1, lift / 0.9));
      if (kb > 0.01) { moving.setMatrixAt(n, place(gx, gz, 0.36 * s, 0.3 * s, yaw, 0.035, ground, false)); mBlob.setXYZW(n, kb, 0, 0, 0); n++; }
      // Each foot: a small dark oval under the sole, gone by the time the foot is a shin's height up.
      for (const foot of f.feet) {
        const fe = foot.matrixWorld.elements, fx = fe[12], fy = fe[13], fz = fe[14], fg = groundAt(fx, fz);
        const k = SHADE.foot * (1 - Math.min(1, Math.max(0, fy - fg - 0.06 * s) / (0.32 * s)));
        if (k < 0.01) continue;
        moving.setMatrixAt(n, place(fx, fz, 0.11 * s, 0.17 * s, yaw, 0.04, fg, false)); mBlob.setXYZW(n, k, 0, 0.25, 0.4); n++;
      }
    }
    moving.count = n;
    moving.instanceMatrix.needsUpdate = true; mBlob.needsUpdate = true;
  }

  return { addStatic, update, get fixedCount() { return fixed ? fixed.count : 0; }, get movingCount() { return moving.count; } };
}
