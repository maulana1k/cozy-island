// INTERNAL. Things you can read or look at closely open the same conversation screen, with an icon for a portrait.
// They use the dialogue format of camp.js. THINGS gives each one a name and an icon.
export const THINGS = {
  board: { name: 'Notice board', icon: '📋', thing: true },
  specks: { name: 'Glowing specks', icon: '✨', thing: true },
};

export const board = {
  entries: [{ id: 'board', when: [], node: 'board.read', once: false }],
  nodes: [
    { id: 'board.read', text: 'CAMP NOTICE BOARD. Knots of the week: REEF KNOT: right over left, then left over right, then pull both ends. CLOVE HITCH: wrap the pole, cross over, tuck under. BOWLINE: small loop, up through the hole, round the tree, back down the hole.', sets: ['note:notice-knots'], choices: [
      { text: 'Read the safety poster.', goto: 'board.safety' },
      { text: 'Done reading.', goto: null },
    ] },
    { id: 'board.safety', text: 'STAY SAFE: S.T.O.P. If you are lost or worried: Stop, Think, Observe, Plan. Never go out alone without telling a leader. Three whistle blasts mean "help".', sets: ['note:notice-safety'], choices: [
      { text: 'Read the knots again.', goto: 'board.read' },
      { text: 'Done reading.', goto: null },
    ] },
  ],
};

export const specks = {
  entries: [
    { id: 'specks-night', when: 'night', node: 'specks.look', once: false },
    { id: 'specks-day', when: [], node: 'specks.day', once: false },
  ],
  nodes: [
    { id: 'specks.look', text: 'Tiny blue lights blink in the wet sand along the tide line. When you brush them with your fingers they flash brighter, then slowly fade, like someone spilled stars on the beach.', sets: ['event:specks', 'note:specks', 'guide:plankton'], choices: [{ text: 'Wow...', goto: null }] },
    { id: 'specks.day', text: 'Just wet sand, seaweed and a few shells now. Whatever glowed here only shows after dark.', choices: [
      { text: '(Wait until nightfall)', requires: 'stage:ch1.specks', sets: ['wait:night'], goto: null },
      { text: 'Okay.', goto: null },
    ] },
  ],
};
