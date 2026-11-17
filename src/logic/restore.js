// INTERNAL. Helping the island heal (research item #8, docs/research/2026-11-17-trail-alba-style-research.md):
// three places have litter lying about (the beach camp, the river bank by the fishing dock, the jungle edge
// below the summit) and the jungle edge has a broken birdhouse. Each place keeps a "health" from 0 (as the game
// starts: today's world) to 1 (all cleaned up). As it rises, more birds and butterflies come back there
// (src/world/particles.js reads healthAt / restoreSpots) and its ambience can get richer: src/audio.js or
// src/ambience.js may read areaHealth(area) ('beach', 'river' or its alias 'water', 'jungle'; anything else is 0).
// Plain rules, no Three.js. State is a module singleton, saved with the game (main.js snapshot `restore`).
import { heightAt, riverAt, nearestSafe } from './terrain.js';
import { CAMPFIRE, getColliders } from './layout.js';
import { WILD } from '../config.js';
import { createRng } from './rng.js';

const SEED = 4242;
// The places. `r` is how far the place reaches (its health fades out over 20 m beyond that).
export const RESTORE_AREAS = [
  { id: 'beach', name: 'the beach camp', x: CAMPFIRE.x, z: CAMPFIRE.z, r: 24 },
  { id: 'river', name: 'the river bank', x: 46, z: -30, r: 16 },
  // The jungle edge: on the line from the camp toward the wild jungle, just inside the safe ground.
  { id: 'jungle', name: 'the jungle edge', ...(() => { const l = Math.hypot(WILD.x, WILD.z); return { x: +(WILD.x / l * (WILD.border - 9)).toFixed(2), z: +(WILD.z / l * (WILD.border - 9)).toFixed(2) }; })(), r: 16 },
];
const ALIAS = { water: 'river' };
const LITTER_PER_AREA = 6, REPAIR_WEIGHT = 2;
const LITTER_KINDS = ['bottle', 'can', 'wrapper', 'bag', 'bottle', 'can'];

let spots = null;
const done = new Set();

function okGround(x, z, cols) {
  const h = heightAt(x, z);
  if (h < 0.25) return false; // not in the water
  if (cols.some((c) => Math.hypot(c.x - x, c.z - z) < (c.r || Math.hypot(c.hw || 0, c.hd || 0)) + 0.9)) return false;
  return nearestSafe(x, z).depth < -2; // never past the jungle rope
}
// Where things are: worked out once, the same every time (seeded).
export function restoreSpots() {
  if (spots) return spots;
  const rng = createRng(SEED), cols = getColliders();
  const litter = [], flocks = [], homes = [];
  let birdhouse = null;
  for (const a of RESTORE_AREAS) {
    const taken = [];
    const pick = (rMin, rMax, gap, extra) => {
      for (let guard = 0; guard < 600; guard++) {
        const ang = rng() * Math.PI * 2, r = rMin + rng() * (rMax - rMin), x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
        if (!okGround(x, z, cols) || taken.some((p) => Math.hypot(p.x - x, p.z - z) < gap) || (extra && !extra(x, z))) continue;
        const p = { x: +x.toFixed(2), z: +z.toFixed(2) }; taken.push(p); return p;
      }
      return null;
    };
    // River litter lies along the bank, a step or two from the water.
    const bank = a.id === 'river' ? (x, z) => { const rv = riverAt(x, z); return rv.d !== Infinity && rv.d - rv.w > 1.2 && rv.d - rv.w < 7; } : null;
    for (let i = 0; i < LITTER_PER_AREA; i++) {
      const p = pick(2, a.r, 2.5, bank);
      if (p) litter.push({ id: `litter-${a.id}-${i}`, area: a.id, kind: LITTER_KINDS[i % LITTER_KINDS.length], rot: rng() * Math.PI * 2, ...p });
    }
    if (a.id === 'jungle') { const p = pick(3, a.r * 0.7, 3); if (p) birdhouse = { id: 'birdhouse-jungle', area: a.id, rot: rng() * Math.PI * 2, ...p }; }
    // Birds that come back: a flock at a third, another at two thirds.
    for (const need of [0.34, 0.67]) { const p = pick(4, a.r + 4, 6); if (p) flocks.push({ area: a.id, need, ...p }); }
    for (let i = 0; i < 6; i++) { const p = pick(1, a.r, 2); if (p) homes.push({ area: a.id, ...p }); }
  }
  spots = { litter, birdhouse, flocks, homes };
  return spots;
}

function totalOf(area) {
  const s = restoreSpots();
  return s.litter.filter((l) => l.area === area).length + (s.birdhouse && s.birdhouse.area === area ? REPAIR_WEIGHT : 0);
}
function doneOf(area) {
  const s = restoreSpots();
  let n = s.litter.filter((l) => l.area === area && done.has(l.id)).length;
  if (s.birdhouse && s.birdhouse.area === area && done.has(s.birdhouse.id)) n += REPAIR_WEIGHT;
  return n;
}
// How healed a place is: 0 (as found) .. 1 (all cleaned up and mended).
export function areaHealth(area) {
  const id = ALIAS[area] || area;
  if (!RESTORE_AREAS.some((a) => a.id === id)) return 0;
  const t = totalOf(id);
  return t ? doneOf(id) / t : 0;
}
// The health felt at a point: each place's health, fading out over 20 m past its reach.
export function healthAt(x, z) {
  let best = 0;
  for (const a of RESTORE_AREAS) {
    const d = Math.hypot(x - a.x, z - a.z), k = Math.min(1, Math.max(0, 1 - (d - a.r) / 20));
    if (k > 0) best = Math.max(best, areaHealth(a.id) * k);
  }
  return best;
}
export const isDone = (id) => done.has(id);
// Something was cleaned up or mended. Returns { area, health, all } (all: that place is now fully healed), or null.
export function markDone(id) {
  if (done.has(id)) return null;
  const s = restoreSpots(), thing = s.litter.find((l) => l.id === id) || (s.birdhouse && s.birdhouse.id === id ? s.birdhouse : null);
  if (!thing) return null;
  done.add(id);
  const health = areaHealth(thing.area);
  return { area: thing.area, name: RESTORE_AREAS.find((a) => a.id === thing.area).name, health, all: health >= 1 };
}
export const serialiseRestore = () => [...done];
export function loadRestore(list) { done.clear(); if (Array.isArray(list)) for (const id of list) if (typeof id === 'string') done.add(id); }
export const resetRestore = () => done.clear();
