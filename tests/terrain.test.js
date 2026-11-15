import { test, expect } from 'vitest';
import { heightAt, zoneAt, wadeSpeedFactor, constrainToShore } from '../src/logic/terrain.js';

test('village plateau is dry', () => { expect(heightAt(10, 8)).toBeGreaterThan(0.8); });
test('shoreline is near sea level', () => { expect(Math.abs(heightAt(60, 0))).toBeLessThan(0.15); });
test('sea floor is deep', () => { expect(heightAt(75, 0)).toBeLessThan(-2); });
test('hill peak', () => { expect(heightAt(-18, -22)).toBeGreaterThan(8); });
test('deterministic', () => { expect(heightAt(12.3, -4.5)).toBe(heightAt(12.3, -4.5)); });
test('zones', () => { expect(zoneAt(0, 0)).toBe('grass'); expect(zoneAt(54, 0)).toBe('sand'); expect(zoneAt(70, 0)).toBe('water'); });
test('wading slows down', () => {
  expect(wadeSpeedFactor(1)).toBe(1); expect(wadeSpeedFactor(0)).toBe(1);
  expect(wadeSpeedFactor(-0.45)).toBeCloseTo(0.35); expect(wadeSpeedFactor(-0.225)).toBeCloseTo(0.675);
});
test('cannot go past knee depth', () => {
  const p = constrainToShore({ x: 59, z: 0 }, { x: 72, z: 0 });
  expect(heightAt(p.x, p.z)).toBeGreaterThanOrEqual(-0.45);
});
test('free movement on land is untouched', () => {
  expect(constrainToShore({ x: 0, z: 0 }, { x: 1, z: 1 })).toEqual({ x: 1, z: 1 });
});
