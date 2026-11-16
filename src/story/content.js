// INTERNAL. Everything the story engine plays, gathered in one place. To add a character: an entry in
// characters.js, a dialogue file under dialogue/, and the file's export here. To add a puzzle: a line in PUZZLES.
import { CHARACTERS } from './characters.js';
import { leader, buddy, younger } from './dialogue/camp.js';
import { THINGS, board, specks } from './dialogue/things.js';
import { QUESTS, TEMPLATES, GEAR, BADGES, CHAPTERS, OPENING } from './quests.js';
import { CLUES } from './clues.js';
import { FIELD_GUIDE } from './fieldGuide.js';

// Answer-order puzzles (design 5.1): the last N answer tags in one conversation, in order, reveal something.
// A wrong order leads to the friendly `wrong` node and a fresh start; the hint for each is somewhere in the world.
export const PUZZLES = [
  // Hint: the knots poster on the notice board by the headquarters tent.
  { id: 'reef', character: 'buddy', sequence: ['rol', 'lor', 'pull'], solvedFlag: 'knowsReef', wrong: 'b.knots.no', reveals: { node: 'b.knots.yes', sets: ['event:knots', 'note:reef-knot', 'friend:buddy+10'] } },
];

export const CONTENT = {
  characters: { ...CHARACTERS, ...THINGS },
  people: CHARACTERS,
  dialogue: { leader, buddy, younger, board, specks },
  quests: QUESTS, templates: TEMPLATES, puzzles: PUZZLES,
  clues: CLUES, fieldGuide: FIELD_GUIDE, gearList: GEAR, badgeList: BADGES, chapters: CHAPTERS, opening: OPENING,
};
