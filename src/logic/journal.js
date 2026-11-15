// A gentle journal of things to try. Nothing is required and nothing is ever lost.
export const CATEGORIES = [
  { id: 'skills', label: 'Camp skills' },
  { id: 'friends', label: 'Friends and animals' },
  { id: 'places', label: 'Places' },
  { id: 'pack', label: 'Backpack' },
];

export const DISCOVERIES = [
  { id: 'flag', cat: 'skills', label: 'Raise the camp flag', hint: 'The flagpole stands on the parade ground.' },
  { id: 'bell', cat: 'skills', label: 'Ring the camp bell', hint: 'It hangs near the headquarters tent.' },
  { id: 'campfire', cat: 'skills', label: 'Tend a campfire', hint: 'There are three: camp, beach and summit.' },
  { id: 'lantern', cat: 'skills', label: 'Light a lantern', hint: 'Lanterns line the trails.' },
  { id: 'door', cat: 'skills', label: 'Open a tent flap', hint: 'Walk up to any big tent.' },
  { id: 'seat', cat: 'skills', label: 'Sit down for a while', hint: 'Press X anywhere, or by a log.' },
  { id: 'bed', cat: 'skills', label: 'Sleep in your own bed', hint: 'The bed with the gold pillow, in any patrol tent.' },
  { id: 'tree', cat: 'skills', label: 'Shake a tree', hint: 'Any tree will do.' },
  { id: 'telescope', cat: 'skills', label: 'Look through the telescope', hint: 'It is at the very top of the hill.' },
  { id: 'zipline', cat: 'skills', label: 'Ride the flying fox', hint: 'Climb the launch tower on the summit.' },
  { id: 'join', cat: 'friends', label: 'Join in with the camp', hint: 'Press F during any activity.' },
  { id: 'villager', cat: 'friends', label: 'Greet a fellow scout', hint: 'Say hello, or bump into one.' },
  { id: 'chickens', cat: 'friends', label: 'Shoo the chickens', hint: 'They live in a pen near the farm.' },
  { id: 'cat', cat: 'friends', label: 'Pet the camp cat', hint: 'It likes the parade ground.' },
  { id: 'sheep', cat: 'friends', label: 'Pet a sheep', hint: 'They graze below the windmill.' },
  { id: 'place-inside', cat: 'places', label: 'Step inside a tent', hint: 'Open a flap and walk in.' },
  { id: 'place-pond', cat: 'places', label: 'Wade through the pond', hint: 'West of camp, in the jungle.' },
  { id: 'place-beach', cat: 'places', label: 'Leave footprints on the beach', hint: 'Head for the sea.' },
  { id: 'place-dock', cat: 'places', label: 'Walk to the end of the dock', hint: 'Follow the trail east.' },
  { id: 'place-camp', cat: 'places', label: 'Visit the beach camp', hint: 'South-west, down on the sand.' },
  { id: 'place-windmill', cat: 'places', label: 'Visit the windmill', hint: 'On the knoll to the north-east.' },
  { id: 'place-lookout', cat: 'places', label: 'Reach the summit camp', hint: 'Take the winding hill trail.' },
  { id: 'place-wild', cat: 'places', label: 'Find the edge of the wild jungle', hint: 'Behind the hill, where the rope is.' },
  { id: 'collect', cat: 'pack', label: 'Pick something up', hint: 'Shells, sticks, flowers: look on the ground.' },
  { id: 'eat', cat: 'pack', label: 'Eat a snack', hint: 'Open your backpack with B.' },
  { id: 'drink', cat: 'pack', label: 'Drink some water', hint: 'From your flask, or at a water barrel.' },
  { id: 'cook', cat: 'pack', label: 'Cook over a campfire', hint: 'Marshmallows, mushrooms and eggs.' },
  { id: 'stoke', cat: 'pack', label: 'Feed a campfire', hint: 'Bring it firewood from the jungle.' },
  { id: 'hoard', cat: 'pack', label: 'Carry eight different things', hint: 'A scout is always prepared.' },
];

// Ranks are earned by how much you have found.
export const RANKS = [
  { at: 0, name: 'New Scout' }, { at: 5, name: 'Tenderfoot' }, { at: 10, name: 'Pathfinder' },
  { at: 17, name: 'Explorer' }, { at: DISCOVERIES.length, name: 'Camp Legend' },
];

export function rankFor(count) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (count >= RANKS[i].at) index = i;
  const next = RANKS[index + 1] || null;
  return { index, name: RANKS[index].name, from: RANKS[index].at, next };
}

export function createJournal() {
  const found = new Set();
  return {
    total: DISCOVERIES.length,
    get count() { return found.size; },
    has: (id) => found.has(id),
    // Returns the discovery when it is new, otherwise null.
    mark(id) {
      const d = DISCOVERIES.find((x) => x.id === id);
      if (!d || found.has(id)) return null;
      found.add(id);
      return d;
    },
    list: () => DISCOVERIES.map((d) => ({ ...d, done: found.has(d.id) })),
    rank: () => rankFor(found.size),
  };
}

const PHASE_LABELS = { night: 'Night', morning: 'Morning', day: 'Midday', golden: 'Afternoon', sunset: 'Sunset' };
export const phaseLabel = (phase) => PHASE_LABELS[phase] || '';

// "16:05" from a time-of-day fraction.
export function clockText(t) {
  const minutes = Math.floor((((t % 1) + 1) % 1) * 24 * 60);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
