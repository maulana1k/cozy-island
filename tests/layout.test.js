import { test, expect } from 'vitest';
import {
  COTTAGES, LANTERNS, SEATS, VILLAGER_SPOTS, CAMPFIRE, DOCK, BELL, VILLAGE_CENTER, CHICKEN_YARD, CAT_SPOT,
  getScatter, getColliders, distanceToPath, groundAt,
} from '../src/logic/layout.js';
import { heightAt, zoneAt, constrainToShore } from '../src/logic/terrain.js';
import { resolveCollisions } from '../src/logic/collision.js';
import { PLAYER_START, MAX_WADE_DEPTH } from '../src/config.js';

const doorFront = (c, d = 1.2) => ({ x: c.door.x + Math.sin(c.door.rot) * d, z: c.door.z + Math.cos(c.door.rot) * d });

test('eight camp buildings on dry grass', () => {
  expect(COTTAGES).toHaveLength(8);
  for (const c of COTTAGES) expect(zoneAt(c.x, c.z)).toBe('grass');
});
test('cottages do not overlap each other', () => {
  for (let i = 0; i < COTTAGES.length; i++) for (let j = i + 1; j < COTTAGES.length; j++)
    expect(Math.hypot(COTTAGES[i].x - COTTAGES[j].x, COTTAGES[i].z - COTTAGES[j].z)).toBeGreaterThan(6.5);
});
test('every building door faces away from its own walls', () => {
  for (const c of COTTAGES) {
    const p = doorFront(c, 0.6);
    expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(c.depth / 2);
  }
});
test('counts', () => {
  const s = getScatter();
  expect(s.trees).toHaveLength(264); expect(s.bushes).toHaveLength(30);
  expect(s.flowers).toHaveLength(150); expect(s.rocks).toHaveLength(25);
  expect(LANTERNS).toHaveLength(8); expect(SEATS).toHaveLength(7); expect(VILLAGER_SPOTS.length).toBeGreaterThanOrEqual(10);
});
test('scatter is the same every time', () => { expect(getScatter()).toEqual(getScatter()); });
test('trees are on grass, off paths, clear of cottages', () => {
  for (const t of getScatter().trees) {
    expect(zoneAt(t.x, t.z)).toBe('grass');
    expect(distanceToPath(t.x, t.z)).toBeGreaterThan(1.5);
    for (const c of COTTAGES) expect(Math.hypot(t.x - c.x, t.z - c.z)).toBeGreaterThan(4.5);
  }
});
test('every scattered thing has a unique id', () => {
  const s = getScatter();
  const ids = [...s.trees, ...s.bushes, ...s.flowers, ...s.rocks].map((o) => o.id);
  expect(new Set(ids).size).toBe(ids.length);
});
test('campfire is on sand, lanterns and spots on dry land', () => {
  expect(zoneAt(CAMPFIRE.x, CAMPFIRE.z)).toBe('sand');
  for (const p of [...LANTERNS, ...VILLAGER_SPOTS]) expect(heightAt(p.x, p.z)).toBeGreaterThan(0.3);
});
test('bell, chicken yard and cat are on dry grass', () => {
  for (const p of [BELL, CHICKEN_YARD, CAT_SPOT]) expect(zoneAt(p.x, p.z)).toBe('grass');
});
test('player start and villager spots are not inside a collider', () => {
  for (const p of [PLAYER_START, ...VILLAGER_SPOTS])
    expect(resolveCollisions(p, 0.35, getColliders())).toEqual(p);
});
test('the first villager spot has 2 m of clear ground around it', () => {
  const s = VILLAGER_SPOTS[0];
  for (let a = 0; a < 8; a++) {
    const p = { x: s.x + Math.cos(a * Math.PI / 4) * 1.65, z: s.z + Math.sin(a * Math.PI / 4) * 1.65 };
    expect(resolveCollisions(p, 0.35, getColliders())).toEqual(p);
  }
});
test('every cottage door is reachable: the spot 1.2 m in front of it is clear', () => {
  for (const c of COTTAGES) { const p = doorFront(c); expect(resolveCollisions(p, 0.35, getColliders())).toEqual(p); }
});
test('the dock can be walked to its end but not off it', () => {
  const dir = { x: Math.sin(DOCK.rot), z: Math.cos(DOCK.rot) };
  const at = (d, side = 0) => ({ x: DOCK.x + dir.x * d + dir.z * side, z: DOCK.z + dir.z * d - dir.x * side });
  // On the planks the ground is the deck, well above the sea floor.
  const end = at(DOCK.length - 0.5);
  expect(heightAt(end.x, end.z)).toBeLessThan(-MAX_WADE_DEPTH);
  expect(groundAt(end.x, end.z)).toBeGreaterThan(0.3);
  expect(constrainToShore(at(DOCK.length - 1), end, groundAt)).toEqual(end);
  // Past the end, or off the side, is deep water: the move is refused.
  const beyond = at(DOCK.length + 1.5), from = at(DOCK.length - 0.3);
  const stopped = constrainToShore(from, beyond, groundAt);
  expect(groundAt(stopped.x, stopped.z)).toBeGreaterThanOrEqual(-MAX_WADE_DEPTH);
  const offSide = at(DOCK.length - 2, 3), fromMid = at(DOCK.length - 2);
  const stoppedSide = constrainToShore(fromMid, offSide, groundAt);
  expect(groundAt(stoppedSide.x, stoppedSide.z)).toBeGreaterThanOrEqual(-MAX_WADE_DEPTH);
});
test('groundAt equals the terrain away from the dock', () => { expect(groundAt(3, 4)).toBe(heightAt(3, 4)); });
