// The backpack: a few pockets, each holding a pile of one kind of thing.
import { ITEMS } from './items.js';

export function createBag(capacity = 12) {
  const slots = []; // { id, count }
  const bag = {
    capacity,
    get slots() { return slots; },
    get used() { return slots.length; },
    count: (id) => slots.reduce((n, s) => (s.id === id ? n + s.count : n), 0),
    kinds: () => new Set(slots.map((s) => s.id)).size,
    // How many of `n` would fit right now.
    room(id, n = 1) {
      const max = ITEMS[id].stack;
      let space = (capacity - slots.length) * max;
      for (const s of slots) if (s.id === id) space += max - s.count;
      return Math.min(n, space);
    },
    // Puts things in, topping up piles first. Returns how many went in.
    add(id, n = 1) {
      const max = ITEMS[id].stack;
      let left = n;
      for (const s of slots) { if (s.id !== id || left <= 0) continue; const take = Math.min(left, max - s.count); s.count += take; left -= take; }
      while (left > 0 && slots.length < capacity) { const take = Math.min(left, max); slots.push({ id, count: take }); left -= take; }
      return n - left;
    },
    // Takes things out, from the last pile first. Returns how many came out.
    remove(id, n = 1) {
      let left = n;
      for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
        const s = slots[i];
        if (s.id !== id) continue;
        const take = Math.min(left, s.count); s.count -= take; left -= take;
        if (s.count === 0) slots.splice(i, 1);
      }
      return n - left;
    },
  };
  return bag;
}
