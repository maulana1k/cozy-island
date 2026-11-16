// River kit: a waterfall, a rope-and-plank footbridge, stepping stones, bank dressing and flowing streaks.
// Metres. Each builder returns a THREE.Group (or { group, ... }) with its origin on the ground / waterline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, ball, stick, flat, mergeStatic } from '../world/build.js';

// ---- small shared helpers -----------------------------------------------------------------
const matCache = new Map();
// One plain flat-shaded material per colour (and per variant), shared by everything in this file.
const mat = (color, key = '', extra = {}) => {
  const k = `${color}:${key}`;
  if (!matCache.has(k)) matCache.set(k, flat(color, extra));
  return matCache.get(k);
};
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const rngFrom = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
// Pushes every point of a rounded shape in or out a little so no two rocks match.
function lump(geo, amount, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (hash(x * 12.9 + y * 78.2 + z * 37.7 + seed) - 0.5) * amount;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}
const lerp = THREE.MathUtils.lerp;

// =============================================================================================
// WATERFALL
// =============================================================================================
// The falling water is ONE mesh with a small shader: pale bands slide down it, streaks are dashes
// that drop faster, and the ragged edges are cut out (no transparency, so nothing to sort).
const FALL_VERT = /* glsl */`
  attribute float aKind;  // 0 = sheet face, 1 = loose streak, 2 = thin side wall of a sheet
  attribute float aSeed;
  varying vec2 vUv; varying float vKind; varying float vSeed;
  void main() { vUv = uv; vKind = aKind; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FALL_FRAG = /* glsl */`
  uniform float uTime; uniform float uHeight;
  varying vec2 vUv; varying float vKind; varying float vSeed;
  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  void main() {
    float y = vUv.y * uHeight;                       // metres below the lip
    float col = floor(vUv.x * 16.0 + vSeed * 5.0);   // narrow vertical lanes, each with its own speed
    float h = hash(col + vSeed * 13.0);
    float ph = y * (0.7 + h * 0.6) - uTime * (5.0 + h * 3.5) + h * 30.0;
    float s = sin(ph) * 0.5 + 0.5;
    vec3 deep = vec3(0.40, 0.72, 0.90), mid = vec3(0.70, 0.90, 0.98);
    vec3 c = mix(deep, mid, smoothstep(0.1, 0.6, s));
    c = mix(c, vec3(1.0), smoothstep(0.45, 0.8, s) * 0.8 + smoothstep(0.7, 1.0, vUv.y) * 0.4);
    if (vKind < 0.5) {                               // ragged side edges
      float edge = abs(vUv.x - 0.5) * 2.0;
      if (edge > 0.93 + 0.05 * sin(y * 2.5 - uTime * 6.0 + vSeed * 9.0)) discard;
    } else if (vKind < 1.5) {                        // streak: dashes of bright water
      if (sin(y * 0.9 - uTime * 9.0 + vSeed * 40.0) < -0.15) discard;
      c = mix(vec3(0.9, 0.97, 1.0), vec3(1.0), s);
    }
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function buildWaterfall(height = 12, width = 4) {
  const H = height, W = width;
  const group = new THREE.Group();
  const foot = 0.25 + 0.09 * H;                       // how far forward (+z) the water lands
  // Water leaves the lip going outward, then falls: z grows quickly at first, then eases.
  const zAt = (y) => 0.15 + (foot - 0.15) * Math.pow(1 - y / H, 0.8);

  // A thin four-sided slab of water running from the lip (y = H) to the foot (y = 0).
  function slab(cx, w0, w1, th0, th1, dz, seed, kindFace, kindSide, rows = 24) {
    const pos = [], uv = [], kind = [], sd = [], idx = [];
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; // front-left, front-right, back-right, back-left
    for (let f = 0; f < 4; f++) {
      const base = pos.length / 3, a = corners[f], b = corners[(f + 1) % 4];
      for (let r = 0; r <= rows; r++) {
        const t = r / rows, y = H * (1 - t), zc = zAt(y) + dz;
        const w = lerp(w0, w1, t), th = lerp(th0, th1, t), x = cx * (1 + 0.12 * t); // sheets spread as they fall
        const face = f % 2 === 0, k = face ? kindFace : kindSide;
        pos.push(x + a[0] * w / 2, y, zc + a[1] * th / 2, x + b[0] * w / 2, y, zc + b[1] * th / 2);
        if (face) uv.push(f === 0 ? 0 : 1, t, f === 0 ? 1 : 0, t); else uv.push(0.5, t, 0.5, t);
        kind.push(k, k); sd.push(seed, seed);
      }
      for (let r = 0; r < rows; r++) { const i = base + r * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
    g.setIndex(idx);
    return g;
  }
  const slabs = [];
  // Three side-by-side sheets that leave small gaps, the middle one pushed a little forward.
  for (const k of [-1, 0, 1]) slabs.push(slab(k * W / 3, W / 3 - 0.3, (W / 3 - 0.3) * 1.2, 0.45, 0.22, k === 0 ? 0.08 : 0, k + 2, 0, 2));
  // A few loose streaks in front of the sheets.
  const r = rngFrom(11);
  for (let i = 0; i < 7; i++) slabs.push(slab((r() - 0.5) * W * 0.9, 0.1 + r() * 0.06, 0.15 + r() * 0.06, 0.08, 0.08, 0.1 + r() * 0.08, 7 + i * 1.7, 1, 1, 20));
  const fallMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uHeight: { value: H } }, vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, side: THREE.DoubleSide });
  const water = new THREE.Mesh(mergeGeometries(slabs), fallMat); // the falling water: 1 draw call
  group.add(water);

  // ---- The cliff the water pours over: rounded grey boulders, mossy on top (2 draw calls once welded).
  const rocks = new THREE.Group();
  const rockM = mat(0x9a9298), mossM = mat(0x6fa05a);
  const rr = rngFrom(5);
  const chunk = (x, y, z, rad, sx, sy, sz, m = rockM) => {
    const mesh = new THREE.Mesh(lump(new THREE.IcosahedronGeometry(1, 1), 0.35, x + y * 3 + z * 7), m);
    mesh.position.set(x, y, z); mesh.scale.set(rad * sx, rad * sy, rad * sz); mesh.rotation.y = rr() * 6;
    mesh.castShadow = mesh.receiveShadow = true; rocks.add(mesh);
  };
  const half = W / 2 + 3.2, rowsN = Math.ceil(H / 1.5);
  for (let row = 0; row <= rowsN; row++) {
    for (let x = -half + (row % 2) * 0.9; x <= half; x += 1.7) {
      const ax = Math.abs(x), behindWater = ax < W / 2 + 0.3;
      // The cliff is tallest beside the water and slopes down to the sides.
      const topY = H + 0.6 - Math.max(0, ax - W / 2) * 0.55, y = Math.min(topY - 0.7, 0.4 + row * (H - 1.1) / rowsN);
      if (y < 0.3 && row > 0) continue;
      // Behind the water the boulders sit well back so the sheets never poke into them.
      chunk(x + (rr() - 0.5) * 0.5, y, (behindWater ? -1.5 : -0.9 - Math.min(ax - W / 2, 2) * 0.1) + (rr() - 0.5) * 0.4, 1.25 + rr() * 0.4, 1.1, 0.75, 1);
    }
  }
  // The lip: a ledge of stone the water slides over, with grass behind it.
  for (let x = -W / 2 - 0.8; x <= W / 2 + 0.8; x += 1.1) chunk(x, H - 0.5, -0.4, 0.75, 1.2, 0.55, 1.3);
  for (let x = -half; x <= half; x += 1.7) { chunk(x, H - 0.2, -2.4 + (rr() - 0.5), 1.1, 1.1, 0.7, 1.1); chunk(x + 0.4, H + 0.1, -2.1 + (rr() - 0.5), 0.9, 1.1, 0.4, 1.1, mossM); }
    // Boulders round the foot, half sunk in the pool.
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) chunk(s * (W / 2 + 0.8 + i * 0.9 + rr() * 0.4), 0.2, 0.9 + i * 0.7, 0.5 + rr() * 0.3, 1, 0.8, 1);
  mergeStatic(rocks);
  group.add(rocks);

  // ---- Froth: white blobs that heave where the water hits the pool.
  const fz = foot + 0.2;
  const frothN = 18, froth = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff, 'froth', { emissive: 0x4a545c }), frothN);
  const frothSeed = Array.from({ length: frothN }, (_, i) => ({ a: hash(i) * 6.28, rad: hash(i + 40), s: 0.25 + hash(i + 90) * 0.3 }));
  froth.frustumCulled = false; group.add(froth);

  // ---- Foam rings: three flat rings that spread out over the pool and fade (one mesh, one shader).
  const ringParts = [0, 1, 2].map((i) => {
    const g = new THREE.RingGeometry(0.82, 1, 36, 1); g.rotateX(-Math.PI / 2);
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(i / 3), 1));
    return g;
  });
  const ringMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCentre: { value: new THREE.Vector3(0, 0, fz + 0.3) }, uSize0: { value: new THREE.Vector2(W * 0.5, 0.7) }, uSize1: { value: new THREE.Vector2(W * 1.3 + 0.8, 2.6) } },
    vertexShader: `attribute float aPhase; uniform float uTime; uniform vec3 uCentre; uniform vec2 uSize0; uniform vec2 uSize1; varying float vA; varying float vAng;
      void main() { float ph = fract(uTime * 0.28 + aPhase); vec2 sz = mix(uSize0, uSize1, ph);
        vec3 p = vec3(position.x * sz.x, 0.04, position.z * sz.y) + uCentre; vAng = atan(position.z, position.x);
        vA = (1.0 - ph) * smoothstep(0.0, 0.08, ph); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uTime; varying float vA; varying float vAng;
      void main() { if (sin(vAng * 9.0 + uTime) + sin(vAng * 17.0 - uTime * 1.3) * 0.7 < -1.0) discard;   // broken, lacy edge
        gl_FragColor = vec4(1.0, 1.0, 1.0, vA * 0.85);
        #include <tonemapping_fragment>
        #include <colorspace_fragment> }`,
  });
  const rings = new THREE.Mesh(mergeGeometries(ringParts), ringMat); rings.frustumCulled = false; rings.renderOrder = 2;
  group.add(rings);

  // ---- Mist: soft white puffs that rise off the foot, grow, drift downstream and shrink away.
  const mistN = 10, mistH = Math.min(2.6, 0.15 * H + 0.8);
  const mist = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false }), mistN);
  mist.frustumCulled = false; mist.renderOrder = 3; group.add(mist);

  const dummy = new THREE.Object3D();
  return {
    group,
    update(dt, elapsed) {
      fallMat.uniforms.uTime.value = elapsed; ringMat.uniforms.uTime.value = elapsed;
      for (let i = 0; i < frothN; i++) {
        const f = frothSeed[i], s = f.s * (1 + 0.2 * Math.sin(elapsed * 2.6 + i * 1.7));
        dummy.position.set(Math.cos(f.a) * f.rad * W * 0.5, 0.08 + 0.07 * Math.sin(elapsed * 3.1 + i), fz + Math.sin(f.a) * f.rad * 0.9);
        dummy.scale.set(s, s * 0.8, s); dummy.rotation.set(0, i, 0); dummy.updateMatrix(); froth.setMatrixAt(i, dummy.matrix);
      }
      froth.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < mistN; i++) {
        const f = (elapsed * 0.16 + i / mistN) % 1, g = Math.sqrt(Math.sin(Math.PI * f));
        dummy.position.set((hash(i + 5) - 0.5) * W * 0.9, 0.5 + f * mistH, fz + f * 1.2 + hash(i) * 0.6);
        const s = (0.35 + f * 0.7) * g * (0.7 + 0.5 * hash(i + 9)); dummy.scale.set(s, s * 0.8, s); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); mist.setMatrixAt(i, dummy.matrix);
      }
      mist.instanceMatrix.needsUpdate = true;
    },
  };
}

// =============================================================================================
// ROPE-AND-PLANK FOOTBRIDGE (runs along +z, centred on the origin)
// =============================================================================================
export function buildPlankBridge(length = 14, width = 1.8) {
  const g = new THREE.Group(), half = length / 2, rnd = rngFrom(23);
  const SAG = 0.35, SEGS = 6;
  // Walking height: 1.0 m at the ends, sagging 0.35 m in the middle (a parabola).
  const deckY = (z) => { const f = THREE.MathUtils.clamp(z / half, -1, 1); return 1.0 - SAG * (1 - f * f); };
  const WOODS = [0xc79a62, 0xb98a5e, 0x9a7350, 0xb08663], ROPE = 0xd8c9a0, POST = 0x8c6444;

  // Planks: each a different wood, width, height and a little crooked, with gaps between them.
  const n = Math.floor(length / 0.42), pitch = length / n;
  for (let i = 0; i < n; i++) {
    const z = -half + pitch * (i + 0.5), top = deckY(z), slope = Math.atan((deckY(z + 0.1) - deckY(z - 0.1)) / 0.2);
    const p = box(width * (0.9 + rnd() * 0.1), 0.07, pitch - 0.07 - rnd() * 0.03, WOODS[Math.floor(rnd() * WOODS.length)], (rnd() - 0.5) * 0.06, top - 0.035 + (rnd() - 0.5) * 0.03, z);
    p.rotation.set(-slope + (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.07, (rnd() - 0.5) * 0.03);
    g.add(p);
  }
  // Two thick ropes under the planks that carry the deck, following the sag.
  const sx = width / 2 - 0.08, ropeN = Math.ceil(length / 0.9);
  for (const s of [-1, 1]) for (let i = 0; i < ropeN; i++) {
    const z0 = -half - 0.12 + (length + 0.24) * i / ropeN, z1 = -half - 0.12 + (length + 0.24) * (i + 1) / ropeN;
    g.add(stick([s * sx, deckY(z0) - 0.1, z0], [s * sx, deckY(z1) - 0.1, z1], 0.045, ROPE, 6));
  }
  // Rail posts every ~1.7 m along both sides; the two at each end are thick anchor posts.
  const postN = Math.ceil(length / 1.7) + 1, rx = width / 2 + 0.05, zEnd = half + 0.12;
  for (const s of [-1, 1]) {
    const tops = [];
    for (let i = 0; i < postN; i++) {
      const z = -zEnd + (2 * zEnd) * i / (postN - 1), anchor = i === 0 || i === postN - 1, y0 = deckY(z), tall = anchor ? 1.2 : 0.98;
      g.add(cyl(anchor ? 0.09 : 0.045, anchor ? 0.11 : 0.05, tall + 0.4, POST, s * rx, y0 - 0.4 + (tall + 0.4) / 2, z, 7));
      if (anchor) g.add(ball(0.11, POST, s * rx, y0 + tall + 0.02, z, 1)); // round cap on an anchor post
      tops.push([s * rx, y0 + (anchor ? 1.0 : 0.95), z, y0 + 0.5, z]);
    }
    // Hand rope along the top and a lower rope halfway down.
    for (let i = 0; i < postN - 1; i++) {
      const a = tops[i], b = tops[i + 1];
      g.add(stick([a[0], a[1], a[2]], [b[0], b[1], b[2]], 0.03, ROPE, 5), stick([a[0], a[3], a[2]], [b[0], b[3], b[2]], 0.022, ROPE, 5));
    }
  }
  // At each end the deck rests on a stone step with a cross log, so it does not hang in mid air.
  for (const e of [-1, 1]) {
    g.add(box(width + 0.7, 0.95, 0.9, 0xbdb4bb, 0, 0.475, e * (half + 0.4)), cyl(0.12, 0.12, width + 0.3, POST, 0, 0.92, e * (half - 0.05), 8).rotateZ(Math.PI / 2));
  }
  mergeStatic(g); // all the wood and rope welded into a handful of meshes

  // Walking surface as 6 flat steps that follow the sag (the player is expected to use `top`).
  const platforms = [], colliders = [], segLen = length / SEGS;
  for (let i = 0; i < SEGS; i++) {
    const zc = -half + segLen * (i + 0.5);
    platforms.push({ x: 0, z: zc, hw: width / 2, hd: segLen / 2, rot: 0, top: deckY(zc) });
    // Thin boxes along both rails so nobody steps off the side.
    for (const s of [-1, 1]) colliders.push({ x: s * (width / 2 + 0.05), z: zc, hw: 0.06, hd: segLen / 2, rot: 0 });
  }
  return { group: g, colliders, platforms, deckY };
}

// =============================================================================================
// STEPPING STONES (a wandering line along +z, flat-topped boulders you can stand on)
// =============================================================================================
export function buildSteppingStones(length = 12, count = 9) {
  const g = new THREE.Group(), rnd = rngFrom(31), platforms = [];
  const spacing = count > 1 ? length / (count - 1) : 0;
  // Slightly wandering centres.
  const pts = Array.from({ length: count }, (_, i) => ({ x: Math.sin(i * 0.9) * 0.3 + (rnd() - 0.5) * 0.12, z: -length / 2 + i * spacing }));
  // Big enough that the gap between neighbours never exceeds 0.5 m edge to edge.
  let maxD = 0;
  for (let i = 1; i < count; i++) maxD = Math.max(maxD, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const baseR = THREE.MathUtils.clamp(maxD / 2 - 0.25 + 0.02, 0.46, 0.8);
  const tones = [0xa39ba0, 0x8f8a92, 0x9d968a];
  pts.forEach((p, i) => {
    const rTop = baseR + rnd() * 0.06, top = 0.25 + (rnd() - 0.5) * 0.04;
    // A fat boulder: wide flat top, sides leaning out, sunk below the waterline.
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rTop * 1.18, 0.65, 8), mat(tones[i % 3]));
    stone.position.set(p.x, top - 0.325, p.z); stone.rotation.y = rnd() * 3; stone.scale.set(0.95 + rnd() * 0.1, 1, 0.95 + rnd() * 0.1);
    stone.castShadow = stone.receiveShadow = true; g.add(stone);
    // A small rounded lump on the rim so the top is not a perfect disc.
    const lumpy = ball(0.16 + rnd() * 0.08, mat(tones[(i + 1) % 3]), p.x + Math.cos(i * 2) * rTop * 0.85, top - 0.04, p.z + Math.sin(i * 2) * rTop * 0.85, 1); lumpy.scale.y = 0.6; g.add(lumpy);
    platforms.push({ x: p.x, z: p.z, r: rTop * 0.95, top });
  });
  mergeStatic(g);
  return { group: g, platforms };
}

// =============================================================================================
// BANK DRESSING
// =============================================================================================
// A clump of reeds: tall green blades leaning every way, a few with brown cattail heads.
export function buildReedClump() {
  const g = new THREE.Group(), rnd = rngFrom(41);
  const greens = [0x7fa85a, 0x6c9a52], brown = mat(0x7a5236);
  const tmp = new THREE.Object3D();
  for (let i = 0; i < 11; i++) {
    const h = 0.8 + rnd() * 0.8, a = rnd() * 6.28, lean = 0.05 + rnd() * 0.3, rad = rnd() * 0.22;
    const geo = new THREE.ConeGeometry(0.035, h, 4); geo.translate(0, h / 2, 0);
    const blade = new THREE.Mesh(geo, mat(greens[i % 2]));
    blade.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad); blade.rotation.set(Math.sin(a) * lean, rnd() * 6, -Math.cos(a) * lean); blade.castShadow = true; g.add(blade);
    if (i % 3 === 0) { // cattail head near the tip of the blade
      tmp.position.copy(blade.position); tmp.rotation.copy(blade.rotation); tmp.updateMatrix();
      const tip = new THREE.Vector3(0, h - 0.14, 0).applyMatrix4(tmp.matrix);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 6), brown); head.position.copy(tip); head.rotation.copy(blade.rotation); g.add(head);
    }
  }
  return mergeStatic(g);
}

// A grey river rock with a smaller pebble beside it and a cap of moss.
export function buildRiverRock(size = 1) {
  const g = new THREE.Group();
  const rockM = mat(0x9a9298), mossM = mat(0x6fa05a);
  const big = new THREE.Mesh(lump(new THREE.IcosahedronGeometry(1, 1), 0.3, 3), rockM);
  big.scale.set(0.55 * size, 0.38 * size, 0.45 * size); big.position.y = 0.16 * size; big.rotation.y = 0.5;
  const pebble = new THREE.Mesh(lump(new THREE.IcosahedronGeometry(1, 1), 0.3, 9), rockM);
  pebble.scale.set(0.2 * size, 0.14 * size, 0.18 * size); pebble.position.set(0.55 * size, 0.06 * size, 0.2 * size);
  const moss = new THREE.Mesh(lump(new THREE.IcosahedronGeometry(1, 1), 0.3, 5), mossM);
  moss.scale.set(0.3 * size, 0.1 * size, 0.26 * size); moss.position.set(-0.08 * size, 0.46 * size, -0.02 * size);
  for (const m of [big, pebble, moss]) m.castShadow = m.receiveShadow = true;
  g.add(big, pebble, moss);
  return mergeStatic(g);
}

// A patch of lily pads floating just above the water, two in flower.
export function buildLilyPatch() {
  const g = new THREE.Group(), rnd = rngFrom(51);
  const greens = [mat(0x5fa35a, 'pad', { side: THREE.DoubleSide }), mat(0x6fb466, 'pad', { side: THREE.DoubleSide })];
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4 + rnd(), d = 0.3 + Math.sqrt(rnd()) * 1.2, r = 0.25 + rnd() * 0.18;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 10, 0.5, Math.PI * 2 - 0.7), greens[i % 2]);
    pad.rotation.set(-Math.PI / 2, 0, rnd() * 6); pad.position.set(Math.cos(a) * d, 0.03 + i * 0.004, Math.sin(a) * d); pad.receiveShadow = true; g.add(pad);
    if (i === 1 || i === 5) { // a flower: ring of pink petals round a yellow middle
      const col = i === 1 ? 0xf7b7cf : 0xffffff, fx = pad.position.x, fz = pad.position.z;
      for (let k = 0; k < 5; k++) { const p = ball(0.07, mat(col), fx + Math.cos(k * 1.256) * 0.07, 0.09, fz + Math.sin(k * 1.256) * 0.07, 1); p.scale.set(1, 0.5, 1); g.add(p); }
      g.add(ball(0.04, mat(0xffd75a), fx, 0.115, fz, 0));
    }
  }
  return mergeStatic(g);
}

// =============================================================================================
// FLOWING STREAKS (a thin mesh on the water that shows which way the river runs)
// =============================================================================================
export function buildFlowStreaks(points, width) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.z)));
  const len = curve.getLength(), N = Math.max(8, Math.ceil(len / 0.8));
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = curve.getPointAt(t), tan = curve.getTangentAt(t), nx = -tan.z, nz = tan.x;
    pos.push(c.x + nx * width / 2, 0.02, c.z + nz * width / 2, c.x - nx * width / 2, 0.02, c.z - nz * width / 2);
    uv.push(0, t * len, 1, t * len); // across the river, and metres along it (downstream = increasing)
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        float u = vUv.x + 0.03 * sin(vUv.y * 0.7 + floor(vUv.x * 9.0) * 2.0);    // lanes wobble a little
        float lane = floor(u * 9.0), h = hash(lane * 3.7 + 1.3), lx = fract(u * 9.0);
        float line = smoothstep(0.4, 0.2, abs(lx - 0.5));                          // a thin streak in the middle of each lane
        float period = 2.4 + h * 2.0, f = fract(vUv.y / period - uTime * (0.6 + h * 0.5) / period + h);  // slides downstream
        float dash = smoothstep(0.0, 0.1, f) * smoothstep(0.55, 0.3, f);
        float bank = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);   // fade near both banks
        float a = line * dash * bank * 0.6;
        if (a < 0.02) discard;
        gl_FragColor = vec4(0.95, 0.98, 1.0, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 1; mesh.frustumCulled = false;
  const group = new THREE.Group(); group.add(mesh);
  return { group, update(dt, elapsed) { m.uniforms.uTime.value = elapsed; } };
}

// A made-up S-bend river so the streaks can be previewed on their own.
export function buildFlowStreaksDemo() {
  const pts = Array.from({ length: 9 }, (_, i) => ({ x: Math.sin(i * 0.7) * 4, z: -12 + i * 3 }));
  return buildFlowStreaks(pts, 3);
}
