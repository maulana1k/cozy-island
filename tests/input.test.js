import { test, expect } from 'vitest';
import { createInput } from '../src/input.js';

const key = (type, code, extra = {}) => Object.assign(new Event(type), { code, ...extra });
const make = () => { const keys = new EventTarget(), pointer = new EventTarget(); return { keys, pointer, input: createInput(keys, pointer) }; };

test('W moves forward, W+D is normalised', () => {
  const { keys, input } = make();
  keys.dispatchEvent(key('keydown', 'KeyW'));
  expect(input.move).toEqual({ x: 0, z: 1 });
  keys.dispatchEvent(key('keydown', 'KeyD'));
  expect(Math.hypot(input.move.x, input.move.z)).toBeCloseTo(1);
  expect(input.move.x).toBeGreaterThan(0);
});
test('arrow keys work like WASD', () => {
  const { keys, input } = make();
  keys.dispatchEvent(key('keydown', 'ArrowLeft'));
  expect(input.move.x).toBe(-1);
});
test('releasing a key stops movement', () => {
  const { keys, input } = make();
  keys.dispatchEvent(key('keydown', 'KeyW')); keys.dispatchEvent(key('keyup', 'KeyW'));
  expect(input.move).toEqual({ x: 0, z: 0 });
});
test('held keys clear on blur', () => {
  const { keys, input } = make();
  keys.dispatchEvent(key('keydown', 'KeyW')); keys.dispatchEvent(key('keydown', 'ShiftLeft'));
  expect(input.run).toBe(true);
  keys.dispatchEvent(new Event('blur'));
  expect(input.move).toEqual({ x: 0, z: 0 }); expect(input.run).toBe(false);
});
test('interact is consumed once', () => {
  const { keys, input } = make();
  keys.dispatchEvent(key('keydown', 'KeyE'));
  expect(input.consumeInteract()).toBe(true); expect(input.consumeInteract()).toBe(false);
});
test('holding E does not repeat', () => {
  const { keys, input } = make();
  keys.dispatchEvent(key('keydown', 'KeyE', { repeat: true }));
  expect(input.consumeInteract()).toBe(false);
});
test('hop and mute are consumed once', () => {
  const { keys, input } = make();
  keys.dispatchEvent(key('keydown', 'Space')); keys.dispatchEvent(key('keydown', 'KeyN'));
  expect(input.consumeHop()).toBe(true); expect(input.consumeHop()).toBe(false);
  expect(input.consumeMute()).toBe(true); expect(input.consumeMute()).toBe(false);
});
test('drag accumulates look, wheel accumulates zoom, both reset when read', () => {
  const { pointer, input } = make();
  pointer.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0 }));
  pointer.dispatchEvent(Object.assign(new Event('pointermove'), { movementX: 5, movementY: -3 }));
  pointer.dispatchEvent(Object.assign(new Event('pointermove'), { movementX: 2, movementY: 1 }));
  expect(input.consumeLook()).toEqual({ dx: 7, dy: -2 }); expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
  pointer.dispatchEvent(Object.assign(new Event('wheel'), { deltaY: 120 }));
  expect(input.consumeZoom()).toBe(120); expect(input.consumeZoom()).toBe(0);
});
test('moving the mouse without dragging does not turn the camera', () => {
  const { pointer, input } = make();
  pointer.dispatchEvent(Object.assign(new Event('pointermove'), { movementX: 5, movementY: 5 }));
  expect(input.consumeLook()).toEqual({ dx: 0, dy: 0 });
});
test('anyKeyPressed becomes true after the first key', () => {
  const { keys, input } = make();
  expect(input.anyKeyPressed).toBe(false);
  keys.dispatchEvent(key('keydown', 'KeyW'));
  expect(input.anyKeyPressed).toBe(true);
});
