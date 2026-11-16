import { DAY_LENGTH } from '../src/config.js';
import { test, expect } from 'vitest';
import { advance, phaseAt, nightFactor, sunDirection, skyColors } from '../src/logic/dayCycle.js';

test('advance wraps', () => { expect(advance(0.99, DAY_LENGTH * 0.02)).toBeCloseTo(0.01); });
test('one full day is DAY_LENGTH seconds', () => { expect(DAY_LENGTH).toBe(960); expect(advance(0.3, DAY_LENGTH)).toBeCloseTo(0.3); });
test('phases', () => {
  expect(phaseAt(0.0)).toBe('night'); expect(phaseAt(0.2)).toBe('morning'); expect(phaseAt(0.5)).toBe('day');
  expect(phaseAt(0.58)).toBe('golden'); expect(phaseAt(0.8)).toBe('sunset'); expect(phaseAt(0.95)).toBe('night');
});
test('night factor', () => {
  expect(nightFactor(0.5)).toBe(0); expect(nightFactor(0.95)).toBe(1); expect(nightFactor(0.0)).toBe(1);
  expect(nightFactor(0.84)).toBeCloseTo(0.5); expect(nightFactor(0.08)).toBeCloseTo(0.5);
});
test('sun is up at noon, down at midnight', () => {
  expect(sunDirection(0.5).y).toBeGreaterThan(0.8); expect(sunDirection(0.0).y).toBeLessThan(0);
});
test('sun direction is unit length', () => { const d = sunDirection(0.3); expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1); });
test('colours are continuous across midnight', () => {
  const a = skyColors(0.999).top, b = skyColors(0.0).top;
  const ch = (c, s) => (c >> s) & 255;
  for (const s of [16, 8, 0]) expect(Math.abs(ch(a, s) - ch(b, s))).toBeLessThan(6);
});
