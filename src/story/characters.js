// INTERNAL. The phase 1 cast (design section 6, settled call 10b.5): camp and village only. All names are made up.
// `links` are the ids of the people in the world who play this character: the camp leader is the existing chief
// scout, the elder, shopkeeper and two of the children are existing villagers; the buddy, the younger scout and the
// fisherman are new (src/world/areas/storyCast.js). Milestone 1 wires the camp three only. `where` is the hint shown in the People tab.
export const CHARACTERS = {
  leader: {
    name: 'Chief Sari', role: 'Camp leader', links: ['staff-0'], where: 'On the parade ground by day; tells stories at the campfire at night.',
    look: { skin: 0xc98d62, hair: 0x3d3230, hat: 0xb89a5e, shirt: 0xd8c08a, scarf: 0x6a3f9c },
  },
  buddy: {
    name: 'Bayu', role: 'Your buddy scout', links: ['cast-buddy'], where: 'Beside your patrol tent, when the camp is not busy.',
    look: { skin: 0xd9a273, hair: 0x2f2826, hat: 0x4f7fc9, shirt: 0xd8c08a, scarf: 0xf2c94c },
    greet: ['I saved you a spot by the fire tonight.', 'Did you know a reef knot is flat? It lies flat. That is the whole point.', 'My torch keeps going flat. Or I keep leaving it on.', 'Race you to the flagpole! No, wait, I am tired.'],
  },
  younger: {
    name: 'Tia', role: 'Younger scout', links: ['cast-younger'], where: 'Near your patrol tent, usually practising knots.',
    look: { skin: 0xf1c7a0, hair: 0x8a5a3c, hat: 0xe07a94, bow: true, shirt: 0xd8c08a, scarf: 0xe8503a },
    greet: ['I tied my shoelace in a bowline. It will not come undone. Ever.', 'Are you a patrol leader? You look like one.', 'I am not scared of the dark. I just like torches.', 'Can you teach me something tomorrow?'],
  },
};

// Milestone 2 (not wired in yet): the village cast. Add these to CHARACTERS with their dialogue (src/story/next/village.js).
export const NEXT_CHARACTERS = {
  elder: {
    name: 'Grandmother Wulan', role: 'Village elder', links: ['local-6'], where: 'At the well in the morning, under the big tree at midday, at home after dark.',
    look: { skin: 0xc98d62, hair: 0xd8d2c8, hat: null, shirt: 0x5f8f7a, scarf: null },
  },
  fisherman: {
    name: 'Old Darto', role: 'Fisherman', links: ['cast-fisherman'], where: 'At the fishing jetty on the far shore, by his hut.',
    look: { skin: 0x9a6a4a, hair: 0xd8d2c8, hat: 0xd8bb72, shirt: 0x4f9aa6, scarf: null },
    greet: ['The sea is in a good mood today.', 'Mind the slippery planks, scout.', 'Six fish at sunrise. Not bad for an old man.', 'Watch the tide board. The sea keeps her own clock.'],
  },
  shopkeeper: {
    name: 'Lestari', role: 'Shopkeeper', links: ['local-0'], where: 'In the first shop of the row on the village square by day.',
    look: { skin: 0xc98d62, hair: 0x2f2826, hat: null, shirt: 0xe07a4f, scarf: null },
  },
  nina: {
    name: 'Nina', role: 'Village child', links: ['local-7'], where: 'Playing round the village square.',
    look: { skin: 0xd9a273, hair: 0x2f2826, hat: 0xf2b63b, shirt: 0xe48ab4, scarf: null },
  },
  adi: {
    name: 'Adi', role: 'Village child', links: ['local-8'], where: 'Playing round the village square.',
    look: { skin: 0x9a6a4a, hair: 0x2f2826, hat: null, shirt: 0x5fa8a0, scarf: null },
  },
};

// Interactable id -> character id.
export const LINKS = Object.fromEntries(Object.entries(CHARACTERS).flatMap(([id, c]) => c.links.map((l) => [l, id])));
