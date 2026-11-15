import { test, expect } from 'vitest';
import { createRng } from '../src/logic/rng.js';

test('same seed gives same sequence', () => {
  const a = createRng(1337), b = createRng(1337);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
test('values are in [0,1)', () => {
  const r = createRng(1);
  for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
});
