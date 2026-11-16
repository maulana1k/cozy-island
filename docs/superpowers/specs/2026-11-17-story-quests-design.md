INTERNAL

# Story, quests and characters: design

Date: 2026-11-17. Status: owner answers in (section 10); builder check done (section 10b). Awaiting owner approval to build Phase 1.

## 1. Intent

Scout Camp Island becomes an **open world with a main story, side quests and no ending**.

The player is a child at a modern-day scout camp who grows by learning and helping:
- **Skills and knowledge:** scoutcraft, plus wildlife: which animals live where, what they eat, how to behave around them.
- **Doing it yourself:** looking after your own kit, food, water and sleep.
- **People:** talking with and helping scouts, staff and villagers.
- **Nature:** plants, weather, tides, the river, the jungle and the sea, and caring for them.

Under that growth story runs a long mystery: a chain of puzzles across the island leads to a hidden cave lit by bioluminescence, with an underground lake. Inside is the **sea heart shell**, an ultra-rare real-world shell that scientists and archaeologists have sought for years. The plot twist is that the camp story was secretly a treasure-hunt story all along. Once found, the shell becomes the **village mascot**. The game carries on afterwards.

Why (owner's words, summarised): a child-growth game about learning many skills, wildlife and nature, doing things yourself, communicating and helping people, with a long, puzzling story and a twist.

## 2. Goals, non-goals, anti-goals

**Goals**
- A main story in chapters that teaches the four themes and gradually opens the island.
- Side quests from scouts, staff and villagers. New ones keep appearing with the day, weather and season, so there is always something to do.
- Conversations with answer choices. **The order of chosen answers can itself be a puzzle:** answering X, then Y, then Z reveals hidden knowledge or the next story step.
- A larger map with "dangerous for kids" places: sea caves at low tide, a reef islet, jungle ruins, a waterfall gorge, and the glowing cave and underground lake.
- Modern scouting gear as progression, such as a headlamp, glow sticks, a GPS/radar tracker, walkie-talkies, a tide watch, binoculars, a camera and a rope kit.
- A cast of important characters, each with their own building and objects.
- Saving, so story, quests, friendships, items, badges and gear persist.

**Non-goals (for now)**
- Live AI conversations (approach B was rejected).
- Combat, hunting or weapons.
- Multiplayer.

**Anti-goals (a failure even if it technically works)**
- Danger at an adult level. There is no injury beyond a scrape, no death and no harsh fail state.
- Sci-fi gadgets or fantasy magic in everyday play. The shell is the only twist, and it is presented as a real but legendary natural object.
- Conversations that are mean or manipulative as the "right" path. Kindness, patience and curiosity are the keys.
- Puzzles solvable only by brute-force guessing. Every sequence must be hinted somewhere in the world.
- A wrong answer locking the player out forever.
- Breaking the performance budget: at most about 900 draw calls and about 1.7 M triangles at every spot, and no laptop overheating.

## 3. Constraints

- Three.js 0.187 + Vite, plain JS. Everything is built in code (models, icons, sound synthesised). No downloaded art or sound assets.
- Existing systems to build on:
  - the journal (src/logic/journal.js)
  - the journey guide (src/logic/journey.js)
  - the daily schedule (src/actors/schedule.js)
  - people (src/actors/*, src/world/areas/hamlet.js), where E makes a person stop and face you (`talkTo`)
  - backpack and items (src/logic/items.js, src/logic/bag.js)
  - weather (src/world/weather.js)
  - areas (src/world/areas/*.js with `create(scene, deps)`)
  - kits (src/kit/*.js)
- There is no save system today, and this design needs one.
- The original design said "no quests, no dialogue trees, no saving". The owner has now reversed that; this design supersedes it.
- Tests: keep the existing 50 passing. Logic modules (story engine, save, puzzle checks) may get unit tests, but only if the owner asks. They have said "no new test files" so far.

## 4. Approaches considered

- **A. Authored story as game data, chosen by the owner.** Dialogue, choices, sequence puzzles, quests and clues are written as data. A small story engine plays them, and progress saves locally.
  - Exact puzzles, free to run, offline, fits the codebase.
  - Cost: every line is written by hand.
- **B. Live AI conversations.** Free-form chat through an AI service.
  - Rejected: it can't guarantee the X-Y-Z puzzles, needs a server and a secret key, costs money per chat, and doesn't work offline.
- **C. Mix of A and B.** More parts for little gain. It could be added on top of A later.

**Build order, the main session's call**, accepted with A:
1. **Foundations:** the story engine, conversation screen, saving and quest log; the main cast and their buildings on today's map; chapters 1–2 and a first set of side quests.
2. **Bigger map:** the new regions, modern gear and the glowing cave.
3. **Later chapters:** the reveal, the mascot ending, and post-story play.

## 5. Systems design

### 5.1 Story engine (data-driven)
- **World state:**
  - `flags` (facts learned, e.g. `knowsReefLegend`)
  - `quests` (id → stage)
  - `friendship` (character → 0..100)
  - `inventory`/`gear`
  - `badges`
  - `chapter`
  - `journalNotes`
- **Content files** under `src/story/`, plain JS objects:
  - `characters.js`
  - `dialogue/*.js` (one file per character)
  - `quests.js`
  - `chapters.js`
  - `clues.js`
- **Dialogue node:**
  - `{ id, speaker, text, choices: [{ text, requires?, sets?, goto, tag? }], onEnter? }`
  - `requires` can check flags, friendship, items, gear, badges, time of day and weather.
- **Sequence puzzle:** a conversation records the `tag` of each chosen answer. A puzzle definition `{ id, character, sequence: ['x','y','z'], reveals: flag|node }` fires when the last N tags match.
  - A wrong sequence leads to an ordinary friendly answer, never a lock.
  - Hints for each sequence live in the world: a song, a carving, a diary page, another character's story.
- **Quest:** `{ id, giver, title, stages: [{ text, goal: { type: talk|bring|visit|do|learn, ... }, where? }], reward: { items, gear, badge, friendship, flags } }`.
  - Goals are checked from existing events (`discover(id)`, pickups, places, `useItem`) through one event bus.
- **Repeatable side quests:** templates filled by giver, time of day, weather and season, such as "bring 3 shells", "help repair the fence after the storm", "find the lost goat", "teach a younger scout a knot". This keeps play infinite.

### 5.2 Conversation screen
- E on a person with something to say opens a conversation panel in the paper/notebook style of the HUD: portrait, name, text, and 2–4 answer buttons (keys 1–4 or a click).
- The camera eases to a two-shot. Game time pauses while the panel is open (BUILDER CALL, so time gates cannot expire mid-conversation); the person keeps facing you, using the existing pause logic.
- People with nothing new to say keep today's one-line greeting.
- Every learned fact or clue is written to the journal's new **Notes** tab, so it can be found again.

### 5.3 Friendship
- Helping, talking and gifts raise friendship.
- Thresholds unlock more dialogue, stories (lore), small gifts, skills taught, and new quests.
- Shown as a simple heart meter in the journal's people page.

### 5.4 Saving
- Autosave to localStorage, versioned, after story events and every few minutes. Includes position, time of day, weather, the full story state, bag and badges.
- Continue / New game on the title screen. The browser storage may be unavailable, so wrap every access in try/catch and fall back to a session-only game.

### 5.5 Gear (modern scouting)
Each piece of gear comes from the story or a badge, opens up places or puzzles, and is drawn as an item icon in code:

| Gear | What it does |
|---|---|
| Headlamp | dark caves are walkable |
| Glow sticks (consumable) | mark your path in caves, show the way back; also the emergency signal |
| GPS / radar tracker | shows clue markers within range once a clue's region is known |
| Walkie-talkie | call the ranger or camp leader: hints, and the safety net |
| Tide watch | shows low tide; low-tide paths open on a cycle |
| Binoculars | spot distant animals, birds and signs |
| Camera | photograph wildlife for the field guide and badges |
| Rope kit | safe climbs at marked points |
| Water filter | drink from streams on long trips |

### 5.6 Kid-level danger and safety
- **Hazards:** slippery rocks (slower movement, a slip animation), dark caves (no entry without a headlamp), a rising tide (a timed path, with water pushing you back), storms (shelter or turn back), steep drops (fenced or rope only), getting lost (glow sticks and the tracker).
- **Preparation as play:** some places need "told a staff member", "headlamp", "glow sticks" or "buddy" before the story lets you in.
- **Soft failure:** if energy runs out or you get stuck, a ranger or buddy helps you back, you wake at camp the next morning (the day advances, so repeatable quests refresh) with a short lesson, and no story progress is lost.

### 5.7 Wildlife field guide
A journal tab that fills as you spot or photograph animals and plants, with simple facts:
- what each one eats
- where it lives
- how to behave around it

It feeds badges and puzzles. For example, a bird's nesting place points to a clue.

## 6. Cast, buildings and objects

| Character | Role | Building / place | Key objects |
|---|---|---|---|
| Camp leader | assigns badges, the main-story anchor in camp | HQ shelter | badge board, notice board, radio |
| Buddy scout | the player's friend, comes on trips, comic relief | patrol tent | spare headlamp, snacks |
| Younger scout | someone to teach and protect; side quests | patrol tent | lost items, a knot rope |
| Park ranger | safety, gear, hazards, the rescue net | ranger post near the trailhead, with a lookout | first-aid kit, tide board, map table |
| Village elder | keeper of the shell legend and songs | stilt house with old carvings | carved posts, a woven map, a conch horn |
| Old fisherman | tides, reef, canoe trips | hut by the jetty | nets, canoe, tide stones |
| Scientist (marine biologist) | years searching for the shell; part mentor, part rival | research station on the coast | sample table, tanks, charts, a field journal |
| Archaeologist | ruins, carvings, the history of the legend | camp tent at the jungle ruins | brushes, a grid string, rubbings |
| Village kids | games, rumours, small helps | around the village square | toys, a kite |
| Shopkeeper or cook | trading, recipes, food quests | village shop / food tent | baskets, jars, a scale |

## 7. Story outline (main quest)

The tone is warm and curious, with tension rising slowly. The shell is real but legendary.

- **Ch. 1 "New scout".** Arrive, find your tent, meet the camp leader, buddy and ranger, and learn the basics: water, food, fire, knots, safety.
  - Foreshadowing: after a night storm, odd glowing specks wash up on the beach. The ranger shrugs: "plankton".
- **Ch. 2 "Across the river".** Cross to the village. Help the villagers: fix a fence, find a goat, help at the farm.
  - Meet the elder, who sings a children's song about "the heart that sleeps where the sea glows". Ask the right questions in the right order to hear the full verse, which is the first sequence puzzle.
  - Meet the scientist, who has searched for years and dismisses the song as folklore.
- **Ch. 3 "Reading the land".** Learn navigation, stars and tracks.
  - The archaeologist shows carved symbols at the jungle ruins. Matching symbols to the elder's verse gives a map fragment.
  - Gear: binoculars and tracker.
- **Ch. 4 "Tides and reef".** The fisherman teaches tides. Canoe to the reef islet at low tide (gear: tide watch). The second map fragment is in a sea cave that is open only at low tide.
  - Hazard: the rising tide.
- **Ch. 5 "The gorge".** Follow the river to the waterfall gorge (gear: rope kit). The third fragment is behind the falls.
  - The scientist now takes you seriously. Their old field journal fills a gap, which is a second sequence puzzle asked in conversation.
- **Ch. 6 "Into the dark".** Combine the fragments. Prepare properly: headlamp, glow sticks, tell the ranger, bring the buddy. Enter the hidden cave: bioluminescent walls, then the underground lake.
  - Puzzle: light, sound or tide timing, plus the elder's last verse.
  - Find the sea heart shell.
- **Ch. 7 "Heart of the village".** Choose to bring the shell home to the village. The scientist confirms it, the village celebrates, and the shell becomes the village mascot: a festival, a shrine, its image on flags and boats.
- **After the story.** The world keeps going:
  - seasonal festivals around the mascot
  - visiting researchers
  - higher badge tiers
  - endless side quests
  - completing the field guide

Character arcs:
- **Scientist:** from dismissive to grateful.
- **Buddy:** from timid to brave.
- **Younger scout:** becomes your apprentice.
- **Player:** from "new scout" to the island's helper.

## 8. Expanded map (phase 2)

New regions, built as areas like today's:
- sea cliffs and low-tide sea caves
- the reef islet (canoe)
- the jungle ruins (behind or inside today's wild jungle)
- the river's upper course and waterfall gorge
- the ranger post and trailhead
- the research station on the coast
- the hidden cave system: bioluminescent cave → underground lake

Exact layout, sizes and how far the island grows are **left to the builder** and the owner's review, within the performance budget. The cave is an interior scene or a heavily culled zone with its own lighting.

## 9. Left to the builder

- Exact dialogue text, puzzle sequences, quest counts, gear numbers, friendship values, and art for the new buildings and characters.
- The data file format details and UI styling, within the HUD's paper style.

## 10. Owner decisions (2026-11-17)

1. **Player identity:** name + pick a look at New game (a few choices of skin tone, hair, cap colour), on the current body/cap/backpack rig. Dialogue uses the chosen name and stays gender-neutral.
2. **Shell ownership:** fixed. The shell becomes the village mascot. The player can persuade the scientist and archaeologist to agree; their friendship only changes small after-story extras.
3. **Time:** light gating. A few steps need low tide, night or clear weather; each shows a hint and offers "wait / sleep until then" so nobody is stuck.
4. **Language:** English only, no translation plan. Text may live in plain JS data modules; no i18n layer.
5. **First slice (Phase 1):** confirmed: story engine + saving + conversation screen + name/look picker + cast on today's map + Chapters 1-2.

## 10b. Builder check results (settled as BUILDER CALLs; owner may override)

1. **Save compatibility:** save has a `version`. Quest and node ids are treated as stable once shipped. On load, unknown ids are dropped and missing ones start fresh; no migration code until a breaking change actually happens.
2. **Canoe and cave (phase 2):** scripted transitions (fade, short ride, arrive), not paddling. The cave is its own culled zone with headlamp lighting. Phase 1 adds no hooks for them.
3. **Saved fields:** flags, quests and stages, friendship, gear, badges, notes, field guide, bag, position, day count, time of day, weather. Conversations are not saved mid-node; reloading puts you back outside the conversation.
4. **Time in conversations:** paused (see 5.2). Sleep and soft failure advance the day.
5. **Phase 1 content bar:** camp and village cast only (camp leader, buddy scout, younger scout, village elder, old fisherman, shopkeeper, 2 village kids). Ranger, scientist and archaeologist arrive in phase 2. At least 3 sequence puzzles, 4 repeatable side-quest templates, and every chapter 1-2 step from section 7.
6. **Testing:** the story engine is pure logic, runnable headless. The scripted run is a repeatable `tools/story-run.mjs` (like `ev.mjs`), not a new unit-test file, keeping the owner's "no new test files" rule.
7. **Journal and journey guide:** the journey guide's steps become the Chapter 1 "New scout" quest inside a new quest log; the camp badge goal stays. Journal gains Quests, Notes, Field guide and People tabs.

## 11. How it will be checked

- The existing 50 tests pass.
- A scripted run reaches every chapter-1 and chapter-2 step, including one sequence puzzle solved and one deliberately failed.
- Save, reload and Continue restore everything.
- Screenshots of the conversation screen, each new building, and the journal Notes, field guide and people pages.
- `node tools/prof.mjs` at all spots stays within budget.
