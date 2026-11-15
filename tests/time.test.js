import { test, expect } from 'vitest';
import { clampDt } from '../src/logic/time.js';

test('clampDt', () => { expect(clampDt(5)).toBe(0.05); expect(clampDt(0.016)).toBe(0.016); expect(clampDt(-1)).toBe(0); });
test('clampDt turns NaN into 0', () => { expect(clampDt(NaN)).toBe(0); });
