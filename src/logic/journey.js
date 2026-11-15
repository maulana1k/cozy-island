// The journey: a gentle path through camp life for anyone who wants one. Nothing is locked:
// steps tick themselves off whenever you happen to do them, in any order, and you can ignore
// the whole thing and just explore.
import { FLAGPOLE, VILLAGE_FIRE, LOOKOUT, ZIPLINE, COTTAGES } from './layout.js';
import { WILD } from '../config.js';

const tent = COTTAGES.find((c) => c.type === 'patrol');
const axis = Math.atan2(WILD.z, WILD.x);
export const STEPS = [
  { on: 'arrive', title: 'Walk up to camp', text: 'Follow the trail from the dock, through the gateway, to the flagpole.', where: FLAGPOLE },
  { on: 'villager', title: 'Say hello', text: 'Walk up to any scout and press E.' },
  { on: 'bag', title: 'Check your kit', text: 'Press B to open your backpack.' },
  { on: 'eat', title: 'Have a snack', text: 'Eat your camp biscuits: press the number under them, or open the backpack.' },
  { on: 'drink', title: 'Have a drink', text: 'Sip from your flask, or drink at the water barrel by the food tent.', where: { x: 8.4, z: 21.4 } },
  { on: 'place-inside', title: 'Find your tent', text: 'Open the flap of a patrol tent with E and step inside.', where: tent.door },
  { on: 'flag', title: 'Raise the flag', text: 'Go to the flagpole on the parade ground and press E.', where: FLAGPOLE },
  { on: 'collect3', title: 'Go foraging', text: 'Pick up three things: shells on the beach, sticks, flowers, berries from bushes.' },
  { on: 'stoke', title: 'Feed the campfire', text: 'Find firewood on the jungle floor, then use it next to a campfire.', where: VILLAGE_FIRE },
  { on: 'cook', title: 'Toast a marshmallow', text: 'Take marshmallows from the crate by the big fire and use them beside the flames.', where: VILLAGE_FIRE },
  { on: 'join', title: 'Join in', text: 'Press F to do whatever the camp is doing right now.' },
  { on: 'place-lookout', title: 'Climb the hill', text: 'Take the stepped trail to the summit camp.', where: LOOKOUT },
  { on: 'zipline', title: 'Ride the flying fox', text: 'Climb the launch tower on the summit and press E.', where: ZIPLINE.top },
  { on: 'place-wild', title: 'See the wild jungle', text: 'Walk on behind the hill into the big trees, until you are warned to turn back.', where: { x: Math.cos(axis) * (WILD.border + 1), z: Math.sin(axis) * (WILD.border + 1) } },
  { on: 'bed', title: 'Sleep in your own bed', text: 'Lie down in the bed with the gold pillow, in any patrol tent.', where: tent.door },
];

export function createJourney() {
  const done = new Set();
  const journey = {
    total: STEPS.length,
    get count() { return STEPS.filter((s) => done.has(s.on)).length; },
    get complete() { return journey.count === STEPS.length; },
    // The first step not yet done, or null when the journey is over.
    get current() { return STEPS.find((s) => !done.has(s.on)) || null; },
    // Something happened. Returns the step it finished, if any.
    mark(event) {
      if (done.has(event)) return null;
      const step = STEPS.find((s) => s.on === event);
      if (!step) return null;
      done.add(event);
      return step;
    },
    list: () => STEPS.map((s) => ({ ...s, done: done.has(s.on) })),
  };
  return journey;
}
