// INTERNAL. NOT WIRED IN YET: drafted content for the next milestones (Chapter 2 "Across the river" and the
// repeatable side-quest templates). To switch it on, add CH2 to QUESTS and TEMPLATES_NEXT to TEMPLATES in
// src/story/quests.js, the village dialogue (./village.js) to src/story/content.js, the village badges, and
// change the Chapter 1 reward to ['chapter:2', 'start:ch2', ...].
import { CAMPFIRE, WINDMILL, LOOKOUT, PLAY, FLAGPOLE } from '../../logic/layout.js';
import { POND, AREAS } from '../../config.js';

export const CH2 = {
    id: 'ch2', main: true, chapter: 2, title: 'Across the river', giver: 'leader',
    stages: [
      { id: 'cross', title: 'Crossed to the village', text: 'Cross the river by the plank bridge and climb to the village square.', goal: { type: 'event', on: 'place-village', past: true }, where: AREAS.village },
      { id: 'elder', title: 'Met Grandmother Wulan', text: 'Find Grandmother Wulan, the village elder: at the well in the morning, under the big tree at midday. She is indoors after dark.', goal: { type: 'talk', who: 'elder' }, where: 'who:elder' },
      {
        id: 'help', title: 'Helped the village', text: 'Help the village: mend a fence, find a goat, plant rice.', goal: { type: 'checklist' }, steps: [
          { id: 'fence', on: 'fence-fixed', title: 'Mend the goat pen fence', text: 'Two rails are down by the goat pen. Bring 2 firewood and mend it, in clear weather.', where: 'thing:fence' },
          { id: 'goat', on: 'goat-home', title: 'Find Adi\'s runaway goat', text: 'Ask the village children where the goat went.', where: 'thing:goat' },
          { id: 'rice', on: 'rice-planted', title: 'Plant rice seedlings', text: 'A basket of seedlings waits at the edge of the paddy below the village.', where: 'thing:seedlings' },
        ],
      },
      { id: 'song', title: 'Heard the elder\'s song', text: 'Ask Grandmother Wulan about her old song. Ask in the right order: the village children know it.', goal: { type: 'flags', all: ['verse1'] }, where: 'who:elder' },
      { id: 'fisherman', title: 'Met Old Darto', text: 'Visit Old Darto, the fisherman, at the jetty on the far shore.', goal: { type: 'talk', who: 'fisherman' }, where: 'who:fisherman' },
      { id: 'tides', title: 'Learned the tides', text: 'Tell Old Darto how the tide goes round. The tide board by his hut shows the order.', goal: { type: 'flags', all: ['knowsTides'] }, where: 'who:fisherman' },
      { id: 'stones', title: 'Saw the tide stones', text: 'Look at the rocks by the foot of the jetty at low tide.', goal: { type: 'event', on: 'tidestones' }, gate: 'lowtide', where: 'thing:stones' },
      { id: 'tellElder', title: 'Told Grandmother Wulan', text: 'Tell Grandmother Wulan what the tide stones show.', goal: { type: 'talk', who: 'elder' }, where: 'who:elder' },
    ],
    reward: ['badge:village', 'friend:elder+10', 'flag:ch2done', 'note:to-be-continued'],
  };

// ---- Repeatable side quests: one template each, filled afresh every day by giver, weather and day ----------------
// fill(day, world) -> params (saved); make(params) -> a quest definition. The giver's dialogue offers and closes it.
const pick = (day, salt, list) => list[Math.abs(Math.floor(Math.sin(day * 12.9898 + salt * 78.233) * 43758.5453)) % list.length];
export const LOST_SPOTS = [
  { place: 'the pond', x: POND.x + POND.rw + 1.6, z: POND.z + 1 },
  { place: 'the beach camp', x: CAMPFIRE.x + 3, z: CAMPFIRE.z - 2 },
  { place: 'the windmill', x: WINDMILL.x + 3.2, z: WINDMILL.z + 2.4 },
  { place: 'the summit camp', x: LOOKOUT.x + 3.5, z: LOOKOUT.z + 3.5 },
  { place: 'the tag field', x: PLAY.tag.x + 2, z: PLAY.tag.z + 6.2 },
  { place: 'the flagpole', x: FLAGPOLE.x - 2.2, z: FLAGPOLE.z + 2.6 },
];
const GATHER = {
  shell: { what: 'seashells', why: 'for the necklaces I sell to visitors', where: 'Shells wash up on the beaches.' },
  flower: { what: 'wild flowers', why: 'for the garlands on the stalls', where: 'Flowers grow on the camp meadow.' },
  berries: { what: 'bunches of berries', why: 'for jam', where: 'Berry bushes grow round camp.' },
  egg: { what: 'eggs', why: 'for the festival cakes', where: 'The camp hens lay in the nest box by their yard.' },
  mushroom: { what: 'mushrooms', why: 'for soup on a wet day', where: 'Rain brings mushrooms up on the jungle floor.' },
};
const KNOTS = {
  reef: { name: 'reef knot', use: 'tying two ends of the same rope, like a bandage' },
  clove: { name: 'clove hitch', use: 'tying a rope to a pole' },
  bowline: { name: 'bowline', use: 'a loop that will not slip' },
};
export const TEMPLATES_NEXT = [
  {
    id: 'gather', giver: 'shopkeeper', when: 'flag:metElder',
    fill(day, w) { const item = w && w.weather === 'rain' ? 'mushroom' : pick(day, 1, ['shell', 'flower', 'berries', 'egg']); return { item, n: 2 + (day % 3), ...GATHER[item] }; },
    make: (p) => ({ id: 'side.gather', side: 'gather', title: `${p.n} ${p.what} for Lestari`, giver: 'shopkeeper', stages: [{ id: 'bring', text: `Bring ${p.n} ${p.what} to Lestari at the market. ${p.where}`, goal: { type: 'talk', who: 'shopkeeper' }, where: 'who:shopkeeper' }], reward: ['friend:shopkeeper+8', 'give:bread*1'] }),
  },
  {
    id: 'firewood', giver: 'leader', when: 'done:ch1',
    fill(day, w) { return { n: w && w.weather === 'rain' ? 3 : 2, wet: !!(w && w.weather === 'rain') }; },
    make: (p) => ({ id: 'side.firewood', side: 'firewood', title: p.wet ? 'Keep the fires alive in the rain' : 'Firewood for the camp fires', giver: 'leader', stages: [{ id: 'stoke', text: `Feed a campfire ${p.n} times. Firewood lies on the jungle floor.`, goal: { type: 'event', on: 'stoke', n: p.n } }, { id: 'tell', text: 'Tell Chief Sari the fires are fed.', goal: { type: 'talk', who: 'leader' }, where: 'who:leader' }], reward: ['friend:leader+6', 'give:marshmallow*2'] }),
  },
  {
    id: 'lost', giver: 'younger', when: 'flag:metTia',
    fill(day) { const s = pick(day, 3, LOST_SPOTS); return { item: pick(day, 4, ['compass', 'whistle', 'water bottle', 'neckerchief woggle']), place: s.place, x: s.x, z: s.z }; },
    make: (p) => ({ id: 'side.lost', side: 'lost', title: `Tia's lost ${p.item}`, giver: 'younger', stages: [{ id: 'find', text: `Tia lost her ${p.item} somewhere near ${p.place}.`, goal: { type: 'event', on: 'found-lost' }, where: 'thing:lost' }, { id: 'return', text: `Give the ${p.item} back to Tia.`, goal: { type: 'talk', who: 'younger' }, where: 'who:younger' }], reward: ['friend:younger+10'] }),
  },
  {
    id: 'teach', giver: 'younger', when: 'flag:knowsReef',
    fill(day) { const knot = pick(day, 5, ['reef', 'clove', 'bowline']); return { knot, ...KNOTS[knot] }; },
    make: (p) => ({ id: 'side.teach', side: 'teach', title: `Teach Tia a ${p.name}`, giver: 'younger', stages: [{ id: 'teach', text: `Show Tia how to tie a ${p.name}, step by step. The notice board by the headquarters tent shows every knot.`, goal: { type: 'talk', who: 'younger' }, where: 'who:younger' }], reward: ['friend:younger+8', 'friend:buddy+2'] }),
  },
];

export const BADGES_NEXT = {
  knots: { name: 'Knot Teacher', icon: '🪢', desc: 'Taught a younger scout a knot.' },
  village: { name: 'Village Helper', icon: '🤝', desc: 'Mended, found and planted for the village.' },
  tides: { name: 'Tide Reader', icon: '🌊', desc: 'Knows how the tide goes round.' },
};
