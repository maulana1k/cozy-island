// Baked contact shading ("ambient occlusion") for things that never move, and the glow tag that the
// finishing pass (src/finish.js) blooms. Both work by rewriting three.js's lit material shaders once, at
// import, before anything compiles (the same trick as src/world/toon.js):
//
// - Baked AO: a geometry may carry a `bakeAO` attribute (vec4: x crease shade 0..1, y height above the
//   ground in units of the fade height, z ground shade strength, w 0). The lit shaders darken the surface
//   by it: creases and undersides per vertex, the band near the ground per pixel (the height is linear
//   across a face, so a tall wall gets a crisp dark foot, not a gradient over its whole height). The
//   darkening also leans a little more saturated, so it reads as painted shade, never grey dirt.
//   A geometry without the attribute reads the attribute's default, whose w is always 1: no change.
// - Glow: an opaque lit material writes how brightly it glows (its emitted light past a floor) into the
//   picture's alpha, as 1 + glow. Only the finishing pass reads it; the screen ignores alpha.
//
// bakeAO(geometry, opts) computes the attribute; mergeStatic(root, { ao }) in build.js calls it.
import * as THREE from 'three';

export const AO = {
  ground: 0.34,   // how dark the very foot of a thing is (0 = none)
  fade: 0.55,     // metres over which the ground shade fades out
  crease: 0.42,   // how dark a fully enclosed crease is
  under: 0.16,    // extra shade on faces looking straight down (eaves, plank undersides)
  sat: 0.55,      // how much more saturated the shaded part gets
};
const GLOW_FLOOR = 0.35, GLOW_GAIN = 0.9; // emitted light (luminance) below the floor does not glow

const VERT_PARS = /* glsl */`#include <color_pars_vertex>
attribute vec4 bakeAO;
varying vec4 vBakeAO;`;
const VERT = /* glsl */`#include <color_vertex>
vBakeAO = bakeAO;`;
const FRAG_PARS = /* glsl */`#include <color_pars_fragment>
varying vec4 vBakeAO;`;
const FRAG = /* glsl */`#include <color_fragment>
{
	float aoOn = 1.0 - clamp( vBakeAO.w, 0.0, 1.0 );
	if ( aoOn > 0.001 ) {
		float aoK = clamp( vBakeAO.x, 0.0, 1.0 ) * ( 1.0 - vBakeAO.z * ( 1.0 - smoothstep( 0.0, 1.0, vBakeAO.y ) ) );
		aoK = mix( 1.0, aoK, aoOn );
		vec3 aoC = diffuseColor.rgb * aoK;
		float aoL = dot( aoC, vec3( 0.2126, 0.7152, 0.0722 ) );
		diffuseColor.rgb = max( mix( vec3( aoL ), aoC, 1.0 + ( 1.0 - aoK ) * ${AO.sat.toFixed(2)} ), 0.0 );
	}
}`;
const GLOW = /* glsl */`#include <dithering_fragment>
#ifdef OPAQUE
	gl_FragColor.a = 1.0 + ${GLOW_GAIN.toFixed(2)} * max( 0.0, dot( totalEmissiveRadiance, vec3( 0.2126, 0.7152, 0.0722 ) ) - ${GLOW_FLOOR.toFixed(2)} );
#endif`;

const swap = (src, from, to) => {
  if (!src.includes(from)) throw new Error(`ao: shader changed, cannot find ${from}`);
  return src.replace(from, to);
};
for (const id of ['standard', 'physical', 'lambert']) {
  const lib = THREE.ShaderLib[id];
  if (!lib || lib.vertexShader.includes('bakeAO')) continue;
  lib.vertexShader = swap(swap(lib.vertexShader, '#include <color_pars_vertex>', VERT_PARS), '#include <color_vertex>', VERT);
  lib.fragmentShader = swap(swap(swap(lib.fragmentShader, '#include <color_pars_fragment>', FRAG_PARS), '#include <color_fragment>', FRAG), '#include <dithering_fragment>', GLOW);
}

// ---- Baking -----------------------------------------------------------------------------------------
// opts.ground: null (no ground band), a number (the ground's height in the geometry's own space, default 0),
//   or a function (x, z) => height taking world coordinates (then opts.matrix maps geometry to world).
// opts.fade, opts.strength (ground band), opts.crease, opts.under override the defaults in AO.
// opts.creases: false skips the crease probe (cheap: only the ground band and undersides); opts.grid
//   is an aoGrid() to probe instead of one built from this geometry alone.
export function bakeAO(geo, opts = {}) {
  const pos = geo.attributes.position;
  if (!pos) return geo;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal, n = pos.count;
  const fade = opts.fade ?? AO.fade, strength = opts.strength ?? AO.ground, crease = opts.crease ?? AO.crease, under = opts.under ?? AO.under;
  const ground = opts.ground === undefined ? 0 : opts.ground;
  const out = new Float32Array(n * 4);
  const w = new THREE.Vector3(), m = opts.matrix || null;

  // Creases: a coarse occupancy grid of the surfaces (this geometry's, or opts.grid shared by a whole
  // welded group), probed outward from each vertex.
  let occ = null;
  if (opts.creases !== false && crease > 0) occ = creaseProbe(geo, opts.grid || aoGrid([geo], opts.cell));

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let shade = 1;
    const ny = nor.getY(i);
    if (ny < 0) shade *= 1 - under * Math.min(1, -ny);
    if (occ) shade *= 1 - crease * occ[i];
    let h = 1e3, k = 0;
    // Faces looking up (a path, a deck, a tent floor) lie on the ground themselves: no ground band on them.
    if (ground !== null && ny < 0.85) {
      if (typeof ground === 'function') { w.set(x, y, z); if (m) w.applyMatrix4(m); h = w.y - ground(w.x, w.z); } else h = y - ground;
      k = strength * (1 - THREE.MathUtils.smoothstep(ny, 0.45, 0.85));
    }
    out[i * 4] = shade; out[i * 4 + 1] = Math.max(-1, h / fade); out[i * 4 + 2] = k; out[i * 4 + 3] = 0;
  }
  geo.setAttribute('bakeAO', new THREE.BufferAttribute(out, 4));
  return geo;
}

// A coarse occupancy grid of the surfaces of one or more geometries (all in the same space).
export function aoGrid(geos, cellOpt) {
  const bb = new THREE.Box3(), size = new THREE.Vector3();
  for (const g of geos) { g.computeBoundingBox(); bb.union(g.boundingBox); }
  bb.getSize(size);
  const cell = cellOpt || THREE.MathUtils.clamp(Math.max(size.x, size.y, size.z) / 120, 0.05, 0.22);
  const ox = bb.min.x - cell * 8, oy = bb.min.y - cell * 8, oz = bb.min.z - cell * 8;
  const nx = Math.ceil(size.x / cell) + 17, ny = Math.ceil(size.y / cell) + 17, nz = Math.ceil(size.z / cell) + 17;
  const total = nx * ny * nz;
  const bits = total <= 2 ** 28 ? new Uint32Array(Math.ceil(total / 32)) : null, set = bits ? null : new Set();
  const key = (x, y, z) => {
    const ix = Math.floor((x - ox) / cell), iy = Math.floor((y - oy) / cell), iz = Math.floor((z - oz) / cell);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return -1;
    return (ix * ny + iy) * nz + iz;
  };
  const mark = (x, y, z) => { const k = key(x, y, z); if (k < 0) return; if (bits) bits[k >>> 5] |= 1 << (k & 31); else set.add(k); };
  const has = (x, y, z) => { const k = key(x, y, z); if (k < 0) return false; return bits ? (bits[k >>> 5] & (1 << (k & 31))) !== 0 : set.has(k); };
  // Fill: points over every triangle, no further apart than most of a cell.
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const g of geos) {
    const pos = g.attributes.position, idx = g.index, tri = (idx ? idx.count : pos.count) / 3;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const s = Math.min(160, Math.max(1, Math.ceil(edge / (cell * 0.7))));
      for (let i = 0; i <= s; i++) for (let j = 0; j <= s - i; j++) {
        const u = i / s, v = j / s;
        mark(a.x + (b.x - a.x) * u + (c.x - a.x) * v, a.y + (b.y - a.y) * u + (c.y - a.y) * v, a.z + (b.z - a.z) * u + (c.z - a.z) * v);
      }
    }
  }
  return { cell, has };
}

// For each vertex, how enclosed it is (0 open .. 1 shut in), probed against the grid.
function creaseProbe(geo, grid) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count, { cell, has } = grid;
  // Probe: straight out and six directions tipped 55 degrees off the normal, three steps each, starting
  // 1.8 cells straight off the surface, so a flat face never sees itself (a cell's diagonal is 1.73).
  const DIRS = 7, LIFT = 1.8, STEPS = [0.6, 2.0, 3.8], WEIGHT = [1, 0.7, 0.45];
  const occ = new Float32Array(n);
  const N = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3();
  const tilt = Math.sin(55 * Math.PI / 180), up = Math.cos(55 * Math.PI / 180);
  for (let i = 0; i < n; i++) {
    N.fromBufferAttribute(nor, i);
    if (N.lengthSq() < 1e-6) continue;
    N.normalize();
    T.set(Math.abs(N.y) < 0.9 ? 0 : 1, Math.abs(N.y) < 0.9 ? 1 : 0, 0).cross(N).normalize(); B.crossVectors(N, T);
    const px = pos.getX(i) + N.x * LIFT * cell, py = pos.getY(i) + N.y * LIFT * cell, pz = pos.getZ(i) + N.z * LIFT * cell;
    let sum = 0;
    for (let d = 0; d < DIRS; d++) {
      if (d === 0) D.copy(N);
      else { const ang = (d - 1) * (Math.PI / 3) + 0.3; D.copy(N).multiplyScalar(up).addScaledVector(T, Math.cos(ang) * tilt).addScaledVector(B, Math.sin(ang) * tilt); }
      for (let s = 0; s < STEPS.length; s++) {
        const r = STEPS[s] * cell;
        if (has(px + D.x * r, py + D.y * r, pz + D.z * r)) { sum += WEIGHT[s]; break; }
      }
    }
    occ[i] = Math.min(1, Math.pow(sum / DIRS, 0.8) * 1.15);
  }
  return occ;
}
