// INTERNAL. NOT WIRED IN YET (milestone 2 draft): dialogue for the village cast: Grandmother Wulan (elder), Old Darto (fisherman), Lestari (shopkeeper)
// and the children Nina and Adi. Format as in camp.js.

const SONG = [
  { text: 'Tell me about the sea.', tag: 'sea', goto: 'e.song.sea' },
  { text: 'Tell me about the moon.', tag: 'moon', goto: 'e.song.moon' },
  { text: 'Tell me about the heart.', tag: 'heart', goto: 'e.song.heart' },
  { text: 'Tell me about the stars.', tag: 'stars', goto: 'e.song.stars' },
];
const TIDE = [
  { text: 'High water.', tag: 'high', goto: 'f.tides.go' },
  { text: 'Falling.', tag: 'falling', goto: 'f.tides.go' },
  { text: 'Low water.', tag: 'low', goto: 'f.tides.go' },
  { text: 'Rising.', tag: 'rising', goto: 'f.tides.go' },
];

export const elder = {
  entries: [
    { id: 'e-hello', when: 'stage:ch2.elder', node: 'e.hello' },
    { id: 'e-help', when: 'stage:ch2.help', node: 'e.help', once: false },
    { id: 'e-song', when: 'stage:ch2.song', node: 'e.song', once: false },
    { id: 'e-stones', when: 'stage:ch2.tellElder', node: 'e.stones' },
    { id: 'e-lore', when: ['flag:ch2done', 'friend:elder>=40'], node: 'e.lore' },
  ],
  nodes: [
    { id: 'e.hello', text: 'So you are the scout Chief Sari sent. Come, sit with me. I am Wulan; the children call me Grandmother. And what do they call you?', choices: [
      { text: 'I am {name}. Pleased to meet you, Grandmother.', sets: ['friend:elder+3'], goto: 'e.hello2' },
      { text: 'I am {name}. Chief Sari says you need help?', goto: 'e.hello2' },
    ] },
    { id: 'e.hello2', text: '{name}. A good name. We do need kind hands. The goat pen fence is broken, Adi\'s goat has run off again, and the rice seedlings are waiting to go in.', choices: [
      { text: 'I will help with all three.', sets: ['advance:ch2', 'flag:metElder', 'note:elder-hello', 'friend:elder+5'], goto: 'e.hello3' },
    ] },
    { id: 'e.hello3', text: 'Thank you, child. When you are done, come and sit with me again. I will sing you something very old.', choices: [{ text: 'I would like that.', goto: null }] },
    { id: 'e.help', text: 'The fence by the goat pen, Adi\'s goat, and the rice seedlings at the paddy below the village. Take your time.', choices: [
      { text: 'Where did the goat go?', goto: 'e.help.goat' },
      { text: 'I am on it.', goto: null },
    ] },
    { id: 'e.help.goat', text: 'Ask Adi or Nina. Children see everything that happens in this village.', choices: [{ text: 'I will ask them.', goto: null }] },
    { id: 'e.song', text: 'You have helped us so much. Now, the old song. It has three parts, and they must be asked for in their own order. What would you like to hear about?', choices: [...SONG, { text: 'Let me think about it first.', goto: null }].slice(0, 4) },
    { id: 'e.song.sea', text: '"Where the sea comes in to sleep..." The sea is where everything begins. And then?', choices: SONG },
    { id: 'e.song.moon', text: '"...where the moon pulls slow and deep..." The moon pulls the water, as Old Darto will tell you. And then?', choices: SONG },
    { id: 'e.song.heart', text: '"...there it sleeps, the sea\'s own heart." That is how it ends. And then?', choices: SONG },
    { id: 'e.song.stars', text: 'The stars? No, child, the stars are not in this song. They belong to another one, for another night.', choices: SONG },
    { id: 'e.song.full', text: 'Yes. Like that. "Where the sea comes in to sleep, where the moon pulls slow and deep, glowing blue the waters start: there it sleeps, the sea\'s own heart." My grandmother sang it to me. Nobody remembers what it means.', choices: [
      { text: 'Glowing blue... I saw glowing specks on the beach!', requires: 'flag:stormNight', goto: 'e.song.blue' },
      { text: 'It is beautiful.', goto: 'e.song.end' },
    ] },
    { id: 'e.song.blue', text: 'Glowing, after a storm? Hmm. Old Darto the fisherman knows the sea at night better than anyone. He lives by the jetty on the far shore.', choices: [{ text: 'I will go and ask him.', goto: null }] },
    { id: 'e.song.end', text: 'Go and see Old Darto at the jetty on the far shore. He knows the sea better than anyone, and he likes visitors more than he says.', choices: [{ text: 'I will.', goto: null }] },
    { id: 'e.song.wrong', text: 'Ah, now the song is all tangled, like a net after a storm. The little ones clap it in the right order, and the old post by my house remembers it too. Shall we try again?', choices: [
      { text: 'Let\'s try again.', goto: 'e.song' },
      { text: 'Later, Grandmother.', goto: null },
    ] },
    { id: 'e.stones', text: 'You saw stones at the jetty? Carved? Tell me what was on them.', choices: [
      { text: 'A wave, a moon and a heart. Just like your post!', goto: 'e.stones2' },
    ] },
    { id: 'e.stones2', text: 'Then the song is older than this village. Older than me, and that is very old! ... Perhaps it was never only a song. Perhaps it is a map.', sets: ['note:elder-stones', 'advance:ch2'], choices: [
      { text: 'A map to what?', goto: 'e.stones3' },
    ] },
    { id: 'e.stones3', text: 'To the sea\'s own heart. My grandmother said it was a shell, the most beautiful in the world. The scientists say it is only a story. We will see, little scout. We will see.', choices: [{ text: 'We will see.', goto: null }] },
    { id: 'e.lore', text: 'Every year, on the first full moon of the dry season, we sing all the old songs by the well. You must come, {name}. You are part of this village now.', choices: [{ text: 'I would be honoured.', sets: ['friend:elder+5'], goto: null }] },
  ],
};

export const fisherman = {
  entries: [
    { id: 'f-hello', when: 'stage:ch2.fisherman', node: 'f.hello' },
    { id: 'f-tides', when: 'stage:ch2.tides', node: 'f.tides.ask', once: false },
    { id: 'f-stones', when: 'stage:ch2.stones', node: 'f.stones', once: false },
    { id: 'f-early', when: '!started:ch2', node: 'f.early' },
    { id: 'f-lore', when: ['flag:knowsTides', 'friend:fisherman>=30'], node: 'f.lore' },
  ],
  nodes: [
    { id: 'f.early', text: 'Ahoy, young scout! All the way out to my jetty? Mind the planks, they are slippery when the spray is up.', sets: ['friend:fisherman+2'], choices: [{ text: 'I will be careful.', goto: null }] },
    { id: 'f.hello', text: 'Ahoy, small scout! A visitor at my jetty. I am Darto. Old Darto, they say, as if there were a young one.', choices: [
      { text: 'Grandmother Wulan sent me. It is about her song.', goto: 'f.hello2' },
      { text: 'Hello! Do you fish every day?', goto: 'f.hello.fish' },
    ] },
    { id: 'f.hello.fish', text: 'Every day the sea lets me. Now, what brings you all the way out here?', choices: [{ text: 'Grandmother Wulan\'s song.', goto: 'f.hello2' }] },
    { id: 'f.hello2', text: 'The heart that sleeps! Ha! Years ago a scientist came here asking about that song, hunting for some rare shell. Sent me a postcard after. Here.', sets: ['advance:ch2', 'note:postcard', 'friend:fisherman+5'], choices: [
      { text: 'What does it say?', goto: 'f.hello3' },
    ] },
    { id: 'f.hello3', text: '"Charming song. Folklore, of course." Folklore! The sea does not care what scientists think. But if you want to understand that song, you must understand the tide.', choices: [
      { text: 'Teach me!', goto: 'f.tides' },
      { text: 'Let me read your tide board first.', goto: null },
    ] },
    { id: 'f.tides.ask', text: 'Back to tell me about the tide?', choices: [
      { text: 'Yes, let me try.', goto: 'f.tides' },
      { text: 'Not yet.', goto: null },
    ] },
    { id: 'f.tides', text: 'The tide goes round like a wheel. Start at the top and tell me how it turns: what comes first, then next, then next?', choices: TIDE },
    { id: 'f.tides.go', text: 'Mm-hm. And then?', choices: TIDE },
    { id: 'f.tides.yes', text: 'High, falling, low, rising! The moon pulls and the sea follows. Now: at low tide, go and look at the rocks by the foot of my jetty. Something there might interest a song-hunter.', choices: [
      { text: 'When is low tide?', goto: 'f.when' },
      { text: 'I will go and look!', goto: null },
    ] },
    { id: 'f.when', text: 'Twice a day, about fifty minutes later each day. My tide board says when. If you are impatient, sit on the jetty and wait. The sea is never late.', choices: [{ text: 'Thanks, Darto!', goto: null }] },
    { id: 'f.tides.no', text: 'Ha! The sea does not jump about like a goat. Read the tide board by my hut, then try again.', choices: [
      { text: 'Let me try again.', goto: 'f.tides' },
      { text: 'I will read the board.', goto: null },
    ] },
    { id: 'f.stones', text: 'Low tide yet? Watch the rocks by the jetty foot. Or sit with me and wait for her.', choices: [
      { text: '(Wait for low tide)', requires: '!lowtide', sets: ['wait:lowtide'], goto: null },
      { text: 'The water is low now. I will look!', requires: 'lowtide', goto: null },
      { text: 'Later.', goto: null },
    ] },
    { id: 'f.lore', text: 'When I was a boy, the whole bay glowed blue one night after a storm. My father said, "The heart is dreaming." I never forgot it.', sets: ['friend:fisherman+5', 'guide:reefFish'], choices: [{ text: 'The heart is dreaming...', goto: null }] },
  ],
};

export const shopkeeper = {
  entries: [
    { id: 's-hello', when: 'flag:metElder', node: 's.hello' },
    { id: 's-gather', when: 'active:side.gather', node: 's.gather', once: false },
    { id: 's-offer', when: 'side:gather=offered', node: 's.offer', once: false },
  ],
  nodes: [
    { id: 's.hello', text: 'A scout at my stall! I am Lestari. Grandmother Wulan says you are helping us. If you ever have spare shells or flowers, come and see me.', choices: [{ text: 'I will, Lestari.', goto: null }] },
    { id: 's.offer', text: 'Hello, scout! I need {gather.n} {gather.what}, {gather.why}. Could you bring me some? {gather.where}', choices: [
      { text: 'Happy to help!', sets: ['side:gather=active'], goto: null },
      { text: 'Sorry, not today.', sets: ['side:gather=declined'], goto: null },
    ] },
    { id: 's.gather', text: 'Did you find the {gather.what}?', choices: [
      { text: 'Here they are!', requires: 'item:{gather.item}>={gather.n}', sets: ['take:{gather.item}*{gather.n}', 'advance:side.gather'], goto: 's.thanks' },
      { text: 'Not yet, still looking.', goto: null },
    ] },
    { id: 's.thanks', text: 'Wonderful! Here, a fresh bread roll for your trouble.', choices: [{ text: 'Thank you!', goto: null }] },
  ],
};

export const nina = {
  entries: [
    { id: 'n-goat', when: ['stage:ch2.help', '!flag:goatHome'], node: 'n.goat' },
    { id: 'n-rhyme', when: 'stage:ch2.song', node: 'n.rhyme' },
    { id: 'n-hello', when: 'chapter>=2', node: 'n.hello' },
  ],
  nodes: [
    { id: 'n.hello', text: 'Are you a real scout? Can you tie knots? Can you tie MY shoelaces?', choices: [{ text: 'Sure! There. A double knot.', sets: ['friend:nina+5'], goto: null }] },
    { id: 'n.goat', text: 'Kopi the goat? She always runs off to the lake to eat the reeds, by the stepping stones. Adi is too scared to go there alone.', sets: ['flag:knowsGoat'], choices: [{ text: 'I will bring her back.', goto: null }] },
    { id: 'n.rhyme', text: 'Grandmother\'s song? We clap it! Sea, then moon, then heart: that is how the song should start!', sets: ['note:kids-rhyme', 'friend:nina+3'], choices: [{ text: 'Sea, then moon, then heart!', goto: null }] },
  ],
};

export const adi = {
  entries: [
    { id: 'a-goat', when: ['stage:ch2.help', '!flag:goatHome'], node: 'a.goat' },
    { id: 'a-thanks', when: 'flag:goatHome', node: 'a.thanks' },
    { id: 'a-rhyme', when: 'stage:ch2.song', node: 'a.rhyme' },
    { id: 'a-hello', when: 'chapter>=2', node: 'a.hello' },
  ],
  nodes: [
    { id: 'a.hello', text: 'Want to race me to the big tree? I always win. Except when I lose.', choices: [{ text: 'Next time!', goto: null }] },
    { id: 'a.goat', text: 'My goat Kopi ran away again! She has a red collar. Nina says she goes to the lake, by the stepping stones, but the river is big and loud.', choices: [
      { text: 'I will find her for you.', sets: ['flag:knowsGoat', 'friend:adi+3'], goto: null },
    ] },
    { id: 'a.thanks', text: 'You found Kopi! She is eating my mum\'s washing again, so she is fine. Thank you!', sets: ['friend:adi+5'], choices: [{ text: 'Keep the gate shut!', goto: null }] },
    { id: 'a.rhyme', text: 'Grandmother\'s song? Clap with me! Sea! Moon! Heart! Sea, then moon, then heart: that is how the song should start!', sets: ['note:kids-rhyme', 'friend:adi+3'], choices: [{ text: '(Clap along)', goto: null }] },
  ],
};
