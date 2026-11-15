import { test, expect } from 'vitest';
import { resolveCollisions } from '../src/logic/collision.js';

test('clear position is untouched', () => {
  expect(resolveCollisions({ x: 5, z: 5 }, 0.35, [{ x: 0, z: 0, r: 1 }])).toEqual({ x: 5, z: 5 });
});
test('pushed out of a circle', () => {
  const p = resolveCollisions({ x: 0.5, z: 0 }, 0.35, [{ x: 0, z: 0, r: 1 }]);
  expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.35);
});
test('pushed out of a box', () => {
  const p = resolveCollisions({ x: 1.9, z: 0 }, 0.35, [{ x: 0, z: 0, hw: 2, hd: 1.5, rot: 0 }]);
  expect(p.x).toBeCloseTo(2.35); expect(p.z).toBeCloseTo(0);
});
test('rotated box', () => {
  const p = resolveCollisions({ x: 0, z: 1.9 }, 0.35, [{ x: 0, z: 0, hw: 2, hd: 1.5, rot: Math.PI / 2 }]);
  expect(p.z).toBeCloseTo(2.35);
});
test('exact centre of a circle does not produce NaN', () => {
  const p = resolveCollisions({ x: 0, z: 0 }, 0.35, [{ x: 0, z: 0, r: 1 }]);
  expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
  expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.35);
});
test('near a box corner is pushed diagonally to exactly the radius', () => {
  const p = resolveCollisions({ x: 2.1, z: 1.6 }, 0.35, [{ x: 0, z: 0, hw: 2, hd: 1.5, rot: 0 }]);
  expect(Math.hypot(p.x - 2, p.z - 1.5)).toBeCloseTo(0.35);
});
