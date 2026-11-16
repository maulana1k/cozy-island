// The two ways over the river: a plank bridge at the camp end and stepping stones over the ford
// near the lake. The walkable shapes themselves are BRIDGE and STONES in src/logic/layout.js (so the
// ground, the shore rule and everyone's feet already know them); the models here are drawn to match:
// the planks follow the deck's height along the bridge, and every stone's flat top is its platform top.
//
// An area file: `create(scene, deps)` returns { interactables, colliders, update } (all optional).
import * as THREE from 'three';
import { box, cyl, ball, stick, mergeStatic } from '../build.js';
import { BRIDGE, STONES } from '../../logic/layout.js';
import { PALETTE } from '../../config.js';
import { mat, lump, hash, rngFrom, WAVE_GLSL } from '../../kit/river.js';

const ROCK_TONES = [0xa89f96, 0x9a928c, 0xb0a79c];

export function create(scene, deps) {
  const group = new THREE.Group(), rnd = rngFrom(77); group.name = 'crossings';
  const dark = PALETTE.woodDark, ROPE = 0xd8c08a, WOODS = [0xb98a5e, 0xc79a62, 0x9a7350, 0xb08663];
  const b = BRIDGE, rot = Math.atan2(b.dx, b.dz);
  const topAt = (u) => b.y0 + (b.y1 - b.y0) * u + b.arch * Math.sin(Math.PI * u);
  const at = (u, side) => ({ x: b.a.x + b.dx * b.len * u + b.dz * side, z: b.a.z + b.dz * b.len * u - b.dx * side });

  // ---- The deck: planks of different woods and thickness, each a little crooked, with gaps between.
  // A plank's top is the platform's height (to a centimetre), so the player's feet are on what is drawn.
  const n = Math.ceil(b.len / 0.42), pitch = b.len / n;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, p = at(u, (rnd() - 0.5) * 0.05), th = 0.06 + rnd() * 0.035;
    const tilt = Math.atan2(topAt(Math.min(1, u + 0.01)) - topAt(Math.max(0, u - 0.01)), b.len * (Math.min(1, u + 0.01) - Math.max(0, u - 0.01)));
    const plank = box(b.width + 0.14 + rnd() * 0.14, th, pitch - 0.05 - rnd() * 0.05, WOODS[Math.floor(rnd() * 4)], p.x, topAt(u) - th / 2 - 0.004 - rnd() * 0.012, p.z, 0);
    plank.rotation.order = 'YXZ'; plank.rotation.set(-tilt, rot + (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.02); plank.scale.set(1, 1, 1);
    group.add(plank);
  }
  // Two stringers under the deck, in short straight runs that follow the bow, and a cross log at each end.
  for (const side of [-1, 1]) {
    const off = side * (b.width / 2 - 0.12), K = 12;
    for (let k = 0; k < K; k++) {
      const p0 = at(k / K, off), p1 = at((k + 1) / K, off);
      group.add(stick([p0.x, topAt(k / K) - 0.2, p0.z], [p1.x, topAt((k + 1) / K) - 0.2, p1.z], 0.085, dark, 6));
    }
  }
  // ---- Posts and rope rails: a post every 3 m or so, thicker anchor posts at the ends, a sagging
  // hand rope along the top and a second rope halfway down.
  const POSTS = 7;
  for (const side of [-1, 1]) {
    const tops = [];
    for (let i = 0; i < POSTS; i++) {
      const u = i / (POSTS - 1), p = at(u, side * (b.width / 2 + 0.03)), anchor = i === 0 || i === POSTS - 1, y = topAt(u);
      const h = anchor ? 1.25 : 1.05;
      group.add(cyl(anchor ? 0.085 : 0.06, anchor ? 0.1 : 0.07, h + 0.3, dark, p.x, y - 0.3 + (h + 0.3) / 2, p.z, 7));
      group.add(ball(anchor ? 0.1 : 0.075, dark, p.x, y + h + 0.02, p.z, 1));
      tops.push([p.x, y, p.z]);
    }
    for (let i = 0; i < POSTS - 1; i++) {
      const [x0, y0, z0] = tops[i], [x1, y1, z1] = tops[i + 1];
      for (const [hgt, rad, sag] of [[0.98, 0.026, 0.07], [0.48, 0.02, 0.05]]) {
        const S = 4; let prev = [x0, y0 + hgt, z0];
        for (let k = 1; k <= S; k++) {
          const t = k / S, sg = sag * Math.sin(Math.PI * t), cur = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + hgt - sg, z0 + (z1 - z0) * t];
          const r = stick(prev, cur, rad, ROPE, 5); r.castShadow = false; group.add(r); prev = cur;
        }
      }
    }
  }
  // Piles in the river bed under the deck, two a side, standing up to the stringers.
  for (const u of [0.3, 0.7]) for (const side of [-1, 1]) {
    const p = at(u, side * (b.width / 2 - 0.12));
    group.add(cyl(0.1, 0.12, topAt(u) + 1.6, dark, p.x, (topAt(u) - 1.6) / 2 - 0.1, p.z, 7));
  }
  // Stone footings at both ends: a heap of grey boulders half sunk in the bank, under the first plank.
  const rockMat = mat(0x9a9298), mossMat = mat(0x6fa05a);
  const heap = (u, dirSign) => {
    for (let k = 0; k < 6; k++) {
      const side = (k % 2 ? 1 : -1) * (b.width / 2 - 0.2 + rnd() * 0.5), along = u + dirSign * (0.12 + rnd() * 0.5) / b.len, p = at(along, side), s = 0.28 + rnd() * 0.22;
      const g = lump(new THREE.IcosahedronGeometry(1, 1), 0.3, k * 5 + u * 9);
      const m = new THREE.Mesh(g, k === 4 ? mossMat : rockMat);
      m.scale.set(s * 1.3, s * 0.8, s); m.position.set(p.x, topAt(Math.min(1, Math.max(0, along))) - 0.38 - rnd() * 0.1, p.z); m.rotation.y = rnd() * 6;
      m.castShadow = m.receiveShadow = true; group.add(m);
    }
  };
  heap(0.0, -1); heap(1.0, 1);
  mergeStatic(group);

  // ---- Stepping stones: flat-topped natural boulders, the top exactly at each platform's top.
  const stones = new THREE.Group();
  const stoneMats = ROCK_TONES.map((c) => mat(c, 'stone'));
  STONES.forEach((s, i) => {
    const rt = s.r * (1.0 + hash(i * 3.1) * 0.08), SEG = 9, prof = [[0.5, -0.95], [0.55, -0.45], [0.3, -0.16], [0.14, -0.04], [0.04, 0]]; // radius beyond the platform circle, drop below the top: the flat top covers the whole circle
    const geo = new THREE.LatheGeometry([new THREE.Vector2(0, s.top - 0.95), ...prof.map(([k, dy]) => new THREE.Vector2(s.r + k, s.top + dy)), new THREE.Vector2(0, s.top)], SEG);
    // The top is a flat disc: centre and the inner ring stay exactly at `top`. The sides are lumpy.
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v), rr = Math.hypot(x, z);
      if (y > s.top - 0.001) continue;
      const k = 1 + (hash(Math.round(x * 20) + Math.round(z * 20) * 7 + i * 13) - 0.5) * 0.26;
      pos.setXYZ(v, x * k, y + (hash(x * 9 + z * 5 + i) - 0.5) * 0.04 * (rr > 0 ? 1 : 0), z * k);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, stoneMats[(i + (hash(i) > 0.5 ? 1 : 0)) % 3]);
    m.rotation.y = i * 1.7; m.scale.set(1 + hash(i * 5.3) * 0.2, 1, 1 + hash(i * 8.9) * 0.2); m.castShadow = m.receiveShadow = true; m.position.set(s.x, 0, s.z);
    stones.add(m);
    // Every other stone wears a little moss on the side away from the flow (not on the top).
    if (i % 2 === 0) {
      const mo = new THREE.Mesh(lump(new THREE.IcosahedronGeometry(1, 1), 0.3, i), mossMat);
      mo.scale.set(0.2, 0.07, 0.16); mo.position.set(s.x + Math.cos(i) * rt * 1.08, s.top - 0.2, s.z + Math.sin(i) * rt * 1.08); mo.castShadow = false; stones.add(mo);
    }
  });
  mergeStatic(stones);
  group.add(stones);

  // ---- White water: a broken ring of foam round each stone, riding the swell (one mesh, one shader).
  const parts = [];
  STONES.forEach((s, i) => {
    const R0 = s.r * 1.08, R1 = s.r * 2.7, A = 28, pos = [], aux = [], idx = [];
    for (let k = 0; k <= A; k++) {
      const a = (k / A) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // Longer on the downstream side (the river here runs toward -x, +z): the foam streams away from each stone.
      const stretch = 1 + 1.2 * Math.max(0, ca * -0.45 + sa * 0.89);
      pos.push(s.x + ca * R0, 0, s.z + sa * R0, s.x + ca * R1 * stretch, 0, s.z + sa * R1 * stretch);
      aux.push(a, 0, i, a, 1, i);
      if (k < A) { const j = k * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 3)); g.setIndex(idx);
    parts.push(g);
  });
  const foamGeo = mergeGeoms(parts);
  const foamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; attribute vec3 aux; varying vec3 vAux; ${WAVE_GLSL}
      void main() { vAux = aux; vec3 p = position; p.y = waterWave(p.xz, uTime) + 0.04; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec3 vAux;
      void main() {
        float a = vAux.x, seed = vAux.z, t = vAux.y;
        float n = sin(a * 5.0 + uTime * 0.9 + seed * 9.0) + sin(a * 11.0 - uTime * 1.3 + seed * 4.0) * 0.7;   // broken, lacy edge
        float breath = 0.6 + 0.4 * sin(uTime * 1.7 + seed * 2.1);
        float al = (1.0 - t) * (1.0 - t) * smoothstep(-1.1, 0.2, n - t * 1.4) * breath * 1.25;
        if (al < 0.03) discard;
        gl_FragColor = vec4(1.0, 1.0, 1.0, al);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  foamMat.polygonOffset = true; foamMat.polygonOffsetFactor = -3; foamMat.polygonOffsetUnits = -3;
  const foam = new THREE.Mesh(foamGeo, foamMat); foam.renderOrder = 3; foam.frustumCulled = false;
  group.add(foam);

  scene.add(group);
  const c = STONES[5];
  return {
    update(dt, elapsed, player) {
      // Out of sight past 110 m: not worth drawing.
      group.visible = Math.hypot(player.position.x - b.cx, player.position.z - b.cz) < 110 || Math.hypot(player.position.x - c.x, player.position.z - c.z) < 110;
      if (group.visible) foamMat.uniforms.uTime.value = elapsed;
    },
  };
}

// Joins plain indexed geometries (positions and the three-value `aux`) into one.
function mergeGeoms(list) {
  let vc = 0, ic = 0; for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), aux = new Float32Array(vc * 3), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3); aux.set(g.attributes.aux.array, vo * 3);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count; io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('aux', new THREE.BufferAttribute(aux, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
