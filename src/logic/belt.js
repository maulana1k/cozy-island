// INTERNAL. The quick bar at the bottom of the screen (keys 1..8). Every tool has its own fixed slot, whether or not
// you have it yet (an empty slot keeps its place): 1 flask, 2 torch, 3 bugle, 4 camera, 5 litter bag. Slots 6..8 hold
// the first other things in the backpack (food, finds, bandages), in backpack order. Plain rules, no DOM.
export const TOOLS = ['flask', 'torch', 'bugle', 'camera', 'litter'];
export const BELT_SIZE = 8;

// slots: the backpack's [{ id, count }]. Returns BELT_SIZE entries: a slot, or null for an empty one.
export function beltOf(slots) {
  const out = TOOLS.map((id) => slots.find((s) => s.id === id) || null);
  for (const s of slots) { if (out.length >= BELT_SIZE) break; if (!TOOLS.includes(s.id)) out.push(s); }
  while (out.length < BELT_SIZE) out.push(null);
  return out;
}
// The key (1..8) that uses a thing, or 0 when it is only in the backpack.
export function keyOf(slots, id) { const i = beltOf(slots).findIndex((s) => s && s.id === id); return i + 1; }
