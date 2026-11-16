// The journey: the old guided first day, now the camp-basics stage of the Chapter 1 "New scout" quest
// (src/story/quests.js). Nothing is locked: steps tick themselves off whenever you happen to do them, in any
// order. Steps marked `basic` are the ones the camp leader wants to see before the camp badge; the rest are
// optional extras shown in the same list.
import { FLAGPOLE, VILLAGE_FIRE, LOOKOUT, ZIPLINE, COTTAGES } from './layout.js';
import { WILD } from '../config.js';

const tent = COTTAGES.find((c) => c.type === 'patrol');
const axis = Math.atan2(WILD.z, WILD.x);
export const YOUR_TENT = tent.door;
export const STEPS = [
  { on: 'villager', title: 'Say hello', text: 'Walk up to any scout and press E.' },
  { on: 'bag', basic: true, title: 'Check your kit', text: 'Press B to open your backpack.' },
  { on: 'eat', basic: true, title: 'Have a snack', text: 'Eat your camp biscuits: press the number under them, or open the backpack.' },
  { on: 'drink', basic: true, title: 'Have a drink', text: 'Sip from your flask, or drink at the water barrel by the food tent.', where: { x: 8.4, z: 21.4 } },
  { on: 'place-inside', basic: true, title: 'Find your tent', text: 'Open the flap of a patrol tent with E and step inside.', where: tent.door },
  { on: 'stoke', basic: true, title: 'Feed the campfire', text: 'Find firewood on the jungle floor, then use it next to a campfire.', where: VILLAGE_FIRE },
  { on: 'knots', basic: true, title: 'Learn a knot', text: 'Ask Bayu, your buddy, to check your reef knot. The notice board by the headquarters tent shows how.', where: 'who:buddy' },
  { on: 'safety', basic: true, title: 'Hear the safety talk', text: 'Ask Chief Sari about staying safe on the island.', where: 'who:leader' },
  { on: 'flag', title: 'Raise the flag', text: 'Go to the flagpole on the parade ground and press E.', where: FLAGPOLE },
  { on: 'collect3', title: 'Go foraging', text: 'Pick up three things: shells on the beach, sticks, flowers, berries from bushes.' },
  { on: 'cook', title: 'Toast a marshmallow', text: 'Take marshmallows from the crate by the big fire and use them beside the flames.', where: VILLAGE_FIRE },
  { on: 'join', title: 'Join in', text: 'Press F to do whatever the camp is doing right now.' },
  { on: 'place-lookout', title: 'Climb the hill', text: 'Take the stepped trail to the summit camp.', where: LOOKOUT },
  { on: 'zipline', title: 'Ride the flying fox', text: 'Climb the launch tower on the summit and press E.', where: ZIPLINE.top },
  { on: 'place-wild', title: 'See the wild jungle', text: 'Walk on behind the hill into the big trees, until you are warned to turn back.', where: { x: Math.cos(axis) * (WILD.border + 1), z: Math.sin(axis) * (WILD.border + 1) } },
  { on: 'bed', title: 'Sleep in your own bed', text: 'Lie down in the bed with the gold pillow, in any patrol tent.', where: tent.door },
];

// The old stand-alone guide (kept until main.js reads the quest instead): arrival plus the steps above that
// the game itself reports.
const OLD = [{ on: 'arrive', title: 'Walk up to camp', text: 'Follow the trail from the dock, through the gateway, to the flagpole.', where: FLAGPOLE }, ...STEPS.filter((s) => s.on !== 'knots' && s.on !== 'safety')];
export function createJourney() {
  const done = new Set();
  const journey = {
    total: OLD.length,
    get count() { return OLD.filter((s) => done.has(s.on)).length; },
    get complete() { return journey.count === OLD.length; },
    get current() { return OLD.find((s) => !done.has(s.on)) || null; },
    mark(event) { if (done.has(event)) return null; const step = OLD.find((s) => s.on === event); if (!step) return null; done.add(event); return step; },
    list: () => OLD.map((s) => ({ ...s, done: done.has(s.on) })),
  };
  return journey;
}
