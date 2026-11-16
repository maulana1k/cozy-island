// INTERNAL. Chapters 1 and 2 (design section 7) as quests with stages, the repeatable side-quest templates, gear,
// badges and the chapter list. Stage goals: 'talk' (finished by the person's dialogue), 'event' (a game event, `n`
// times), 'checklist' (steps in any order, `optional` ones not needed), 'flags' (all set), 'cond' (a condition).
// `gate` is a condition the goal also needs (night, lowtide, clear): the quest card says so and offers a wait.
// `where` is a point, 'who:<character>' or 'thing:<prop>'.
import { STEPS } from '../logic/journey.js';
import { FLAGPOLE } from '../logic/layout.js';

const SPECKS = { x: -28.7, z: 49.8 }; // the tide line straight down the beach from the trainer's exercise spot
export const SPECKS_AT = SPECKS;

export const QUESTS = [
  {
    id: 'ch1', main: true, chapter: 1, title: 'New scout', giver: 'leader',
    stages: [
      { id: 'arrive', title: 'Walked up to camp', text: 'Follow the trail from the dock, through the gateway, to the flagpole.', goal: { type: 'event', on: 'arrive', past: true }, where: FLAGPOLE },
      { id: 'leader', title: 'Met Chief Sari', text: 'Find Chief Sari, the camp leader, and say hello (E). The chief wears the wide scout hat.', goal: { type: 'talk', who: 'leader' }, where: 'who:leader' },
      { id: 'buddy', title: 'Met Bayu, your buddy', text: 'Your buddy Bayu is waiting by your patrol tent.', goal: { type: 'talk', who: 'buddy' }, where: 'who:buddy' },
      {
        id: 'basics', title: 'Learned the camp basics', text: 'Learn the camp basics: water, food, fire, your tent and kit, a knot and the safety talk.',
        goal: { type: 'checklist' }, steps: STEPS.map((s) => ({ id: s.on, on: s.on, title: s.title, text: s.text, where: s.where, optional: !s.basic })),
      },
      { id: 'report', title: 'Earned the Camp Basics badge', text: 'Tell Chief Sari you have learned the basics.', goal: { type: 'talk', who: 'leader' }, where: 'who:leader' },
      { id: 'night', title: 'Slept through the storm', text: 'A storm is coming tonight. Sleep in your bed (the gold pillow), or sleep until morning from the Quests page.', goal: { type: 'event', on: 'woke' }, wait: 'morning', then: ['flag:stormNight'] },
      { id: 'specks', title: 'Saw the glowing specks', text: 'Bayu saw something glowing on the beach below the trainer\'s exercise spot. Go and look after dark.', goal: { type: 'event', on: 'specks' }, gate: 'night', where: SPECKS },
      { id: 'tell', title: 'Told Chief Sari about the lights', text: 'Tell Chief Sari about the glowing specks.', goal: { type: 'talk', who: 'leader' }, where: 'who:leader' },
    ],
    reward: ['flag:ch1done', 'friend:leader+10', 'note:to-be-continued'],
  },
];

// ---- Repeatable side quests: templates filled afresh every day (milestone 2: see src/story/next/chapter2.js).
export const TEMPLATES = [];

export const GEAR = {
  whistle: { name: 'Safety whistle', icon: '📣', desc: 'Three blasts means "I need help". From Chief Sari.' },
};
export const BADGES = {
  basics: { name: 'Camp Basics', icon: '🏕️', desc: 'Water, food, fire, shelter, knots and safety.' },
};
export const CHAPTERS = [
  { n: 1, title: 'New scout' }, { n: 2, title: 'Across the river' }, { n: 3, title: 'Reading the land' }, { n: 4, title: 'Tides and reef' },
  { n: 5, title: 'The gorge' }, { n: 6, title: 'Into the dark' }, { n: 7, title: 'Heart of the village' },
];
// What a new game starts with.
export const OPENING = ['start:ch1'];
