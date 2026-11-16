// INTERNAL. The wildlife field guide (design 5.7): fills as you meet animals and plants. What each eats, where it
// lives and how to behave around it. `on` lists the game events that add the entry (greeting, petting, picking).
export const FIELD_GUIDE = {
  cat: { name: 'Camp cat', icon: '🐈', on: ['cat'], eats: 'Mice, and any fish the cook drops.', lives: 'The parade ground, in the sun.', behave: 'Let it sniff your hand first. Never pick it up by surprise.' },
  chicken: { name: 'Hen', icon: '🐔', on: ['chickens', 'pick-egg'], eats: 'Seeds, grain and bugs.', lives: 'The yard and nest box by the farm shed.', behave: 'Move slowly. Take eggs gently and leave some for tomorrow.' },
  sheep: { name: 'Sheep', icon: '🐑', on: ['sheep'], eats: 'Grass, all day long.', lives: 'The meadow below the windmill.', behave: 'Approach from the side, where they can see you.' },
  goat: { name: 'Goat', icon: '🐐', on: ['goat', 'goat-home'], eats: 'Leaves, grass, reeds and anything left on a washing line.', lives: 'The pen on the village farm.', behave: 'Goats are curious. Keep gates shut behind you.' },
  buffalo: { name: 'Water buffalo', icon: '🐃', on: ['buffalo'], eats: 'Grass and water plants.', lives: 'The mud wallow on the farm.', behave: 'Friendly but very big. Stay where it can see you and never stand behind it.' },
  duck: { name: 'River duck', icon: '🦆', on: ['ducks'], eats: 'Water weed, snails and insects.', lives: 'Along the river.', behave: 'Do not feed them bread: it is bad for them.' },
  monkey: { name: 'Long-tailed macaque', icon: '🐒', on: ['monkey'], eats: 'Fruit, leaves, crabs, and unguarded snacks.', lives: 'The rocks by the waterfall.', behave: 'Do not feed them or look them in the eye. Keep food in your bag.' },
  palm: { name: 'Coconut palm', icon: '🌴', on: ['tree'], eats: 'Sunshine and sea air.', lives: 'Beaches and the camp edges.', behave: 'Never stand right under one in the wind: coconuts fall.' },
  shellfish: { name: 'Seashells', icon: '🐚', on: ['pick-shell'], eats: 'Their makers filtered tiny food from the water.', lives: 'The tide line on the beaches.', behave: 'Take empty shells only. A shell with someone inside goes back.' },
  plankton: { name: 'Glowing plankton', icon: '✨', on: ['specks'], eats: 'Sunlight, like tiny plants, or even tinier creatures.', lives: 'Floating in the sea, too small to see one by one.', behave: 'Look, do not scoop them up. They glow when the water moves.' },
  reefFish: { name: 'Reef fish', icon: '🐟', on: [], eats: 'Algae and small creatures on the reef.', lives: 'The reef off the far shore.', behave: 'Fish only what you will eat. Never stand on coral.' },
  rice: { name: 'Rice', icon: '🌾', on: ['rice-planted'], eats: 'Water, sun and mud.', lives: 'The flooded paddies below the village.', behave: 'Walk on the bunds, not through the plants.' },
};
