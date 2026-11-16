// Everything that can go in the backpack. `eat` and `drink` say what a thing does to you;
// `cook` names what it turns into over a lit campfire; `use` names a special action.
export const ITEMS = {
  // ---- Kit you start with
  flask: { name: 'Water flask', icon: '🧴', kind: 'kit', stack: 1, use: 'flask', verb: 'Drink', desc: 'Four good sips. Fill it at a water barrel or the pond.' },
  torch: { name: 'Torch', icon: '🔦', kind: 'kit', stack: 1, use: 'torch', verb: 'Switch', desc: 'Lights your way after dark.' },
  bugle: { name: 'Bugle', icon: '📯', kind: 'kit', stack: 1, use: 'bugle', verb: 'Blow', desc: 'Everyone nearby turns to look.' },
  // ---- Food
  biscuit: { name: 'Camp biscuits', icon: '🍪', kind: 'food', stack: 6, eat: { food: 14, cheer: 2 }, desc: 'Dry, crumbly and somehow perfect.' },
  apple: { name: 'Apple', icon: '🍎', kind: 'food', stack: 6, eat: { food: 16, water: 5 }, desc: 'Shaken out of a tree.' },
  coconut: { name: 'Coconut', icon: '🥥', kind: 'food', stack: 4, eat: { food: 12, water: 22 }, desc: 'Food and drink in one shell.' },
  berries: { name: 'Berries', icon: '🫐', kind: 'food', stack: 12, eat: { food: 7, water: 3, cheer: 2 }, desc: 'Picked from the bushes. Sweet and a bit sharp.' },
  bread: { name: 'Bread roll', icon: '🥖', kind: 'food', stack: 4, eat: { food: 24 }, desc: 'Fresh from the food tent.' },
  stew: { name: 'Camp stew', icon: '🍲', kind: 'food', stack: 2, eat: { food: 48, water: 10, energy: 15, cheer: 6 }, desc: 'A proper hot meal. Nothing fills you up like it.' },
  mushroom: { name: 'Mushroom', icon: '🍄', kind: 'food', stack: 8, eat: { food: 4 }, cook: 'grilledMushroom', desc: 'Not much raw. Much better grilled over a fire.' },
  grilledMushroom: { name: 'Grilled mushroom', icon: '🍢', kind: 'food', stack: 8, eat: { food: 20, cheer: 4 }, desc: 'Smoky and soft.' },
  egg: { name: 'Egg', icon: '🥚', kind: 'food', stack: 6, cook: 'friedEgg', desc: 'From the hens. It needs cooking over a fire.' },
  friedEgg: { name: 'Campfire egg', icon: '🍳', kind: 'food', stack: 6, eat: { food: 26, energy: 8 }, desc: 'Cooked on a hot stone.' },
  marshmallow: { name: 'Marshmallow', icon: '🍬', kind: 'food', stack: 8, eat: { food: 5, cheer: 3 }, cook: 'toasted', desc: 'Fine as it is. Glorious toasted.' },
  toasted: { name: 'Toasted marshmallow', icon: '🍡', kind: 'food', stack: 8, eat: { food: 9, cheer: 14 }, desc: 'Golden outside, gooey inside.' },
  // ---- Useful things
  bandage: { name: 'Bandage', icon: '🩹', kind: 'kit', stack: 3, use: 'bandage', verb: 'Patch up', desc: 'For scraped knees. Puts a spring back in your step.' },
  stick: { name: 'Firewood', icon: '🪵', kind: 'find', stack: 8, use: 'stoke', verb: 'Feed fire', desc: 'Dry sticks from the jungle floor. A campfire loves them.' },
  stone: { name: 'Flat stone', icon: '🪨', kind: 'find', stack: 8, use: 'skip', verb: 'Skim', desc: 'Just right for skimming across water.' },
  // ---- Keepsakes
  shell: { name: 'Seashell', icon: '🐚', kind: 'find', stack: 12, use: 'keepsake', verb: 'Listen', say: 'You can hear the sea in it.', desc: 'Washed up on the beach.' },
  flower: { name: 'Wild flower', icon: '🌼', kind: 'find', stack: 12, use: 'keepsake', verb: 'Smell', say: 'It smells of summer.', desc: 'Picked on the meadow.' },
  feather: { name: 'Feather', icon: '🪶', kind: 'find', stack: 12, use: 'keepsake', verb: 'Tickle', say: 'Ha! That tickles.', desc: 'Light as air. Lost by a bird.' },
};

export const KIND_LABEL = { kit: 'Scout kit', food: 'Food', find: 'Found on the island' };
export const FLASK_SIPS = 4;
export const SIP = { water: 28 };
