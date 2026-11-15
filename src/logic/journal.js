// A gentle checklist of things to try. Nothing is required and nothing is ever lost.
export const DISCOVERIES = [
  { id: 'lantern', label: 'Light a lantern' },
  { id: 'door', label: 'Open a tent flap' },
  { id: 'bell', label: 'Ring the camp bell' },
  { id: 'flag', label: 'Raise the camp flag' },
  { id: 'seat', label: 'Sit down for a while' },
  { id: 'tree', label: 'Shake a tree' },
  { id: 'campfire', label: 'Tend a campfire' },
  { id: 'villager', label: 'Nudge a fellow scout' },
  { id: 'chickens', label: 'Shoo the chickens' },
  { id: 'cat', label: 'Pet the cat' },
  { id: 'sheep', label: 'Pet a sheep' },
  { id: 'place-dock', label: 'Walk to the end of the dock' },
  { id: 'place-lookout', label: 'Climb to the lookout' },
  { id: 'place-camp', label: 'Visit the beach camp' },
  { id: 'place-windmill', label: 'Visit the windmill' },
];

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
