// INTERNAL. Dialogue for the camp cast: Chief Sari (camp leader), Bayu (buddy scout) and Tia (younger scout).
// entries: what a person has to say, first match wins; `once` (default true) entries are not repeated.
// nodes: { id, text, sets?, choices: [{ text, requires?, sets?, goto, tag? }] }. goto null ends the talk.
// Text uses {name} for the player's chosen name and {tpl.key} for today's side quest. Kindness is always the way.

const KNOT_STEPS = (go) => [
  { text: 'Right end over left end.', tag: 'rol', goto: go },
  { text: 'Left end over right end.', tag: 'lor', goto: go },
  { text: 'Pull both ends tight.', tag: 'pull', goto: go },
];

export const leader = {
  entries: [
    { id: 'l-hello', when: 'stage:ch1.leader', node: 'l.hello' },
    { id: 'l-report', when: 'stage:ch1.report', node: 'l.report' },
    { id: 'l-night', when: 'stage:ch1.night', node: 'l.night', once: false },
    { id: 'l-tell', when: 'stage:ch1.tell', node: 'l.tell' },
    { id: 'l-safety', when: ['flag:metLeader', '!flag:heardSafety'], node: 'l.safety', once: false },
    { id: 'l-fire-done', when: 'stage:side.firewood.tell', node: 'l.fire.done', once: false },
    { id: 'l-fire-offer', when: 'side:firewood=offered', node: 'l.fire.offer', once: false },
    { id: 'l-ch2', when: 'stage:ch2.cross', node: 'l.ch2' },
    { id: 'l-lore', when: ['flag:ch2done', 'friend:leader>=30'], node: 'l.lore' },
  ],
  nodes: [
    { id: 'l.hello', text: 'Welcome to camp, {name}! I am Chief Sari. You found your way up the trail, so that is the first test passed.', choices: [
      { text: 'Thank you, Chief! What should I do first?', goto: 'l.hello2' },
      { text: 'Is it always this sunny here?', goto: 'l.hello.sunny' },
    ] },
    { id: 'l.hello.sunny', text: 'Ha! Not always. The island has moods: sun, wind, rain and fog. A good scout is ready for all of them.', choices: [
      { text: 'Then what should I do first?', goto: 'l.hello2' },
    ] },
    { id: 'l.hello2', text: 'First, meet your buddy. Every scout here has one, and buddies look out for each other. Bayu is waiting by your patrol tent, the big tunnel tent west of the parade ground.', choices: [
      { text: 'I will go and find Bayu.', sets: ['advance:ch1', 'flag:metLeader', 'friend:leader+5'], goto: 'l.hello3' },
    ] },
    { id: 'l.hello3', text: 'And while you settle in, learn the basics: water, food, fire, your tent and kit, one good knot. Then come back for my safety talk. Your journal keeps track of it all: press J.', choices: [
      { text: 'Got it, Chief!', sets: ['note:water-rule'], goto: null },
    ] },
    { id: 'l.safety', text: 'Ready for the safety talk, {name}? It is short, I promise.', choices: [
      { text: 'I am listening.', goto: 'l.safety2' },
      { text: 'Maybe later.', goto: null },
    ] },
    { id: 'l.safety2', text: 'One: tell someone where you are going. Two: stay out of the wild jungle past the warning line. Three: if you are lost or tired, Stop, Think, Observe, Plan, and blow this whistle three times. Someone will always come for you.', sets: ['gear:whistle', 'note:safety-talk', 'flag:heardSafety', 'event:safety', 'friend:leader+5'], choices: [
      { text: 'What does S.T.O.P. stand for again?', goto: 'l.safety3' },
      { text: 'Thanks, Chief. I will keep it safe.', goto: null },
    ] },
    { id: 'l.safety3', text: 'Stop, Think, Observe, Plan. It is on the notice board by headquarters, next to the knots. And if you ever get stuck, the pause menu has "Help me back to camp".', choices: [
      { text: 'Stop, think, observe, plan. Got it.', goto: null },
    ] },
    { id: 'l.report', text: 'Let me see... water, food, fire, your tent and kit, a proper knot, and you listened to my safety talk. That is the Camp Basics badge, {name}. Well done!', sets: ['badge:basics', 'friend:leader+10', 'advance:ch1'], choices: [
      { text: 'Thank you, Chief!', goto: 'l.report2' },
    ] },
    { id: 'l.report2', text: 'One more thing. The radio says a storm is coming in tonight. Nothing to worry about in a good tent, but get a proper night\'s sleep in your own bed.', choices: [
      { text: 'I will sleep in my bed tonight.', goto: null },
      { text: '(Sleep until morning)', sets: ['wait:morning'], goto: null },
    ] },
    { id: 'l.night', text: 'Storm\'s on its way, {name}. Into your bed with the gold pillow, or just get some rest.', choices: [
      { text: '(Sleep until morning)', sets: ['wait:morning'], goto: null },
      { text: 'Not yet, Chief.', goto: null },
    ] },
    { id: 'l.tell', text: 'Glowing specks on the beach? Hmm. Tell me more.', choices: [
      { text: 'Like tiny blue stars in the wet sand!', goto: 'l.tell2' },
      { text: 'They flashed brighter when I touched them.', goto: 'l.tell2' },
    ] },
    { id: 'l.tell2', text: 'That will be plankton. Tiny sea creatures that light up when the water moves, and a big storm stirs them up. Nothing to worry about.', sets: ['note:plankton', 'guide:plankton'], choices: [
      { text: 'Just plankton?', goto: 'l.tell3' },
    ] },
    { id: 'l.tell3', text: 'Just plankton. Probably. ... Anyway! The village across the river has asked for scout helpers. Their elder, Grandmother Wulan, needs someone kind and patient. Someone like you.', sets: ['advance:ch1'], choices: [
      { text: 'I will go!', goto: null },
    ] },
    { id: 'l.ch2', text: 'The plank bridge is north-east of camp, past the windmill. Hold the rope, it wobbles. And be polite: the village has been here much longer than our camp.', choices: [
      { text: 'I will, Chief.', goto: null },
    ] },
    { id: 'l.fire.offer', text: 'The camp fires are hungry today, {name}. Could you feed them {firewood.n} times? Firewood lies on the jungle floor.', choices: [
      { text: 'Leave it to me.', sets: ['side:firewood=active'], goto: null },
      { text: 'Not today, sorry.', sets: ['side:firewood=declined'], goto: null },
    ] },
    { id: 'l.fire.done', text: 'Fires fed and crackling. Thank you! Take these marshmallows for later.', sets: ['advance:side.firewood'], choices: [
      { text: 'Thanks, Chief!', goto: null },
    ] },
    { id: 'l.lore', text: 'You know, when I was a young scout here, the old fisherman told us the bay once glowed blue all night. I thought it was just a story. These days I am not so sure.', choices: [
      { text: 'Maybe the song is true.', goto: null },
    ] },
  ],
};

export const buddy = {
  entries: [
    { id: 'b-hello', when: 'stage:ch1.buddy', node: 'b.hello' },
    { id: 'b-storm', when: 'stage:ch1.specks', node: 'b.storm' },
    { id: 'b-knots', when: ['flag:metBuddy', '!flag:knowsReef'], node: 'b.knots', once: false },
    { id: 'b-ch2', when: 'stage:ch2.cross', node: 'b.ch2' },
    { id: 'b-lore', when: ['flag:metElder', 'friend:buddy>=30'], node: 'b.lore' },
  ],
  nodes: [
    { id: 'b.hello', text: 'Oh! Hi! You must be {name}. I am Bayu, your buddy. I made you a name tag, but the wind took it.', choices: [
      { text: 'Nice to meet you, Bayu!', goto: 'b.hello2' },
      { text: 'A name tag? That is really kind.', sets: ['friend:buddy+3'], goto: 'b.hello2' },
    ] },
    { id: 'b.hello2', text: 'This is our patrol tent. Your bed is the one with the gold pillow. And that is Tia. She is younger than us and follows me everywhere. I do not mind. Much.', sets: ['advance:ch1', 'flag:metBuddy', 'friend:buddy+5'], choices: [
      { text: 'What should we learn first?', goto: 'b.hello3' },
      { text: 'See you around, buddy!', goto: null },
    ] },
    { id: 'b.hello3', text: 'Knots! Chief says every scout needs a reef knot. Come and tell me how you would tie one. There is a poster on the notice board by headquarters if you forget.', choices: [
      { text: 'Deal.', goto: null },
    ] },
    { id: 'b.knots', text: 'Ready to show me your reef knot? Tell me the steps, in order.', choices: [
      ...KNOT_STEPS('b.knots.go'),
      { text: 'I will read the notice board first.', goto: null },
    ] },
    { id: 'b.knots.go', text: 'Okay... and then?', choices: [...KNOT_STEPS('b.knots.go'), { text: 'Hold on, let me start again.', goto: 'b.knots' }] },
    { id: 'b.knots.yes', text: 'Right over left, left over right, pull... it lies flat! A perfect reef knot. You are better at this than me already.', choices: [
      { text: 'Thanks, Bayu!', goto: null },
    ] },
    { id: 'b.knots.no', text: 'Hmm. It went all twisty. That is a granny knot, and they slip. The poster by headquarters shows the order. Want to try again?', choices: [
      { text: 'Let\'s try again.', goto: 'b.knots' },
      { text: 'Later.', goto: null },
    ] },
    { id: 'b.storm', text: 'Did you hear that thunder?! I hid under my blanket. Not because I was scared. Because it was cold.', choices: [
      { text: 'Of course. Very cold.', goto: 'b.storm2' },
    ] },
    { id: 'b.storm2', text: 'When the lightning flashed I peeked out, and the sea was... sparkly? Blue sparkly. Down on the beach below where the trainer does exercises. You should go and look tonight, after dark.', sets: ['note:storm'], choices: [
      { text: 'I will go and see.', goto: null },
      { text: 'Come with me?', goto: 'b.storm3' },
    ] },
    { id: 'b.storm3', text: 'Maybe next time. Maybe. Tell me everything after!', sets: ['friend:buddy+3'], choices: [{ text: 'Promise.', goto: null }] },
    { id: 'b.ch2', text: 'You are going across the river? On the wobbly bridge? Tell me everything after. Especially if there are snacks.', choices: [{ text: 'I will bring you a story.', goto: null }] },
    { id: 'b.lore', text: 'Hey {name}... thanks for being my buddy. Before you came I mostly stayed near the tent. Now I want to see the waterfall. And the cliff. Maybe.', sets: ['friend:buddy+5'], choices: [
      { text: 'We will go together.', goto: null },
    ] },
  ],
};

// Tia learns three knots; which one she asks for changes with the day (src/story/quests.js, template "teach").
const TEACH = [
  { text: 'Right end over left end.', tag: 'rol', requires: 'sidep:teach.knot=reef' },
  { text: 'Left end over right end.', tag: 'lor', requires: 'sidep:teach.knot=reef' },
  { text: 'Pull both ends tight.', tag: 'pull', requires: 'sidep:teach.knot=reef' },
  { text: 'Wrap the rope round the pole.', tag: 'wrap', requires: 'sidep:teach.knot=clove' },
  { text: 'Cross over the first turn.', tag: 'cross', requires: 'sidep:teach.knot=clove' },
  { text: 'Tuck the end under.', tag: 'tuck', requires: 'sidep:teach.knot=clove' },
  { text: 'Make a small loop.', tag: 'loop', requires: 'sidep:teach.knot=bowline' },
  { text: 'Up through the hole.', tag: 'up', requires: 'sidep:teach.knot=bowline' },
  { text: 'Round the back of the tree.', tag: 'round', requires: 'sidep:teach.knot=bowline' },
  { text: 'Back down the hole.', tag: 'down', requires: 'sidep:teach.knot=bowline' },
].map((c) => ({ ...c, goto: 'y.teach.go' }));

export const younger = {
  entries: [
    { id: 'y-hello', when: 'flag:metBuddy', node: 'y.hello' },
    { id: 'y-lost-back', when: 'stage:side.lost.return', node: 'y.lost.back', once: false },
    { id: 'y-teach', when: 'side:teach=active', node: 'y.teach', once: false },
    { id: 'y-teach-offer', when: 'side:teach=offered', node: 'y.teach.offer', once: false },
    { id: 'y-lost-offer', when: 'side:lost=offered', node: 'y.lost.offer', once: false },
    { id: 'y-lore', when: 'friend:younger>=40', node: 'y.lore' },
  ],
  nodes: [
    { id: 'y.hello', text: 'Hi! I am Tia. Bayu says you are new. I am newer: I came yesterday. Do you know any knots? I only know shoelaces.', choices: [
      { text: 'I am learning too!', goto: 'y.hello2' },
      { text: 'I will teach you one, one day.', sets: ['friend:younger+4'], goto: 'y.hello2' },
    ] },
    { id: 'y.hello2', text: 'Promise? Come and find me when you know one properly.', sets: ['flag:metTia'], choices: [{ text: 'Promise.', goto: null }] },
    { id: 'y.lost.offer', text: 'Oh no, oh no. I lost my {lost.item}! I think it was near {lost.place}. Could you look for it? Please?', choices: [
      { text: 'I will find it.', sets: ['side:lost=active'], goto: null },
      { text: 'Sorry, not right now.', sets: ['side:lost=declined'], goto: null },
    ] },
    { id: 'y.lost.back', text: 'My {lost.item}! You found it! You are the best scout in the whole camp.', sets: ['advance:side.lost'], choices: [{ text: 'Keep it safe this time!', goto: null }] },
    { id: 'y.teach.offer', text: 'Can you teach me the {teach.name}? It is for {teach.use}.', choices: [
      { text: 'Let\'s do it.', sets: ['side:teach=active'], goto: 'y.teach' },
      { text: 'Another time.', sets: ['side:teach=declined'], goto: null },
    ] },
    { id: 'y.teach', text: 'Okay, I have got the rope. The {teach.name}. What do I do first?', choices: [...TEACH, { text: 'Let\'s stop for now.', goto: null }] },
    { id: 'y.teach.go', text: 'Like this? Okay... then what?', choices: [...TEACH, { text: 'Let\'s start again.', goto: 'y.teach' }] },
    { id: 'y.teach.yes', text: 'I did it! Look, it holds! I am going to tie EVERYTHING.', choices: [{ text: 'Well done, Tia!', goto: null }] },
    { id: 'y.teach.no', text: 'Um... it fell apart. Can we start again? The notice board shows the steps.', choices: [
      { text: 'Start again.', goto: 'y.teach' },
      { text: 'Let me check the board.', goto: null },
    ] },
    { id: 'y.lore', text: 'When I grow up I am going to be a patrol leader. Like you. Is that okay?', choices: [{ text: 'You will be a great one.', sets: ['friend:younger+5'], goto: null }] },
  ],
};
