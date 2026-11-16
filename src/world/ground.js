// Colours for the new land, shared by the camp's ground mesh and the streamed tiles so the two
// agree where they overlap: the locals' grass, the village's bare earth, the farm's greener
// ground, sandy river banks and lake shore, grey-brown rock on the massif, and the trails.
import * as THREE from 'three';
import { groundKind, heightAt } from '../logic/terrain.js';
import { AREAS } from '../config.js';

const smooth = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const C = (hex) => new THREE.Color(hex);
const gold = C(0xdcc46c), greenish = C(0xb7c070), farmGreen = C(0x9fbf64), paddy = C(0x8fbb60), earth = C(0xd7ae78), earthDark = C(0xc49a66);
const bankSand = C(0xead6a4), bankWet = C(0xcdb688), bed = C(0x8f8462), trail = C(0xedd2a0);
const campGrass = C(0xd9be66), rockLedge = C(0xb4a690), rockFace = C(0x8f8173), rockDark = C(0x7a6e63), moss = C(0x8e9a5e);
const blotch = (x, z) => 0.5 + 0.5 * Math.sin(x * 0.17 + Math.cos(z * 0.13) * 2.3) * Math.cos(z * 0.15 + 0.7);
const dist = (x, z, p) => Math.hypot(x - p.x, z - p.z);
const t = new THREE.Color(); // scratch

// Paints `c` (already holding the old ground's colour) for the new land at (x, z), height h.
// Returns false where there is nothing new here, leaving `c` untouched.
export function paintNewGround(c, x, z, h) {
  const g = groundKind(x, z);
  if (!g) return false;
  const near = g.locals > 0.01 || g.rock > 0.01 || g.river < 7 || g.lake < 7 || g.trail < 1.6;
  if (!near) return false;
  // The locals' side: warm grass, greener on the farm, bare earth in the village square.
  if (g.locals > 0.01 && h > 0.15) {
    t.copy(gold).lerp(greenish, blotch(x, z) * 0.6);
    const farm = smooth(1 - (dist(x, z, AREAS.farm) - AREAS.farm.r * 0.75) / (AREAS.farm.r * 0.3));
    t.lerp(farmGreen, farm * 0.8).lerp(paddy, smooth(1 - (dist(x, z, AREAS.paddies) - AREAS.paddies.r) / 4) * 0.7);
    const sq = smooth(1 - (dist(x, z, AREAS.village) - AREAS.village.r * 0.45) / 3);
    t.lerp(earth, sq * 0.85).lerp(earthDark, sq * blotch(x * 3, z * 3) * 0.3);
    // The beaches stay beach: only the grass gets the new colours.
    c.lerp(t, g.locals * smooth((h - 0.35) / 0.4));
  }
  // The camp's side of the river was its beach: grass now runs down to a narrow sandy bank.
  if (g.river < 16 && g.mouth < 0.5 && g.locals < 0.01 && h > 0.2) c.lerp(campGrass, smooth((g.river - 2.5) / 3) * smooth((16 - g.river) / 4) * (1 - g.mouth * 2));
  // Rock: pale on the ledges, darker on the steep faces, mossy where the top levels off.
  if (g.rock > 0.01) {
    const e = 0.8, slope = Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    t.copy(rockLedge).lerp(rockFace, smooth((slope - 0.5) / 0.9)).lerp(rockDark, smooth((slope - 1.6) / 1.5) * 0.6);
    t.lerp(moss, smooth((0.45 - slope) / 0.3) * smooth((h - 3) / 3) * 0.55);
    c.lerp(t, g.rock * smooth((h - 0.6) / 0.8));
  }
  // Sandy banks along the river and round the lake, wet at the water, a dark bed beneath it.
  const water = Math.min(g.river === Infinity ? 99 : g.river, g.lake);
  if (water < 7 && g.rock < 0.6) {
    t.copy(bankSand).lerp(bankWet, smooth(1 - (h - 0.05) / 0.35));
    if (h < 0) t.lerp(bed, smooth(-h / 0.6));
    c.lerp(t, smooth((5.5 - water) / 3) * (1 - g.mouth * 0.7));
  }
  // Trails: a plain pale band with a clean edge, no border.
  if (g.trail < 1.6) c.lerp(trail, smooth((1.02 - g.trail) / 0.1));
  return true;
}
