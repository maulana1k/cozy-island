Classification: INTERNAL

# Cozy Island — design

Date: 2026-11-16

## Intent

A small, calm 3D island with a village that you can run around in, poke at
things, and nudge the villagers. There is nothing to win, finish or fail.
The point is that it looks and feels nice for five minutes of wandering.

Stated by the owner: simple, cozy, aesthetic, 3D; can run; simple
interaction with items; can nudge people; island with a small village; no
missions or quests.

Everything else below is the designer's call unless marked "owner".

## Goals

- Run freely around one small island in third person.
- Walk up to items and interact with one key press (owner: "interact with items").
- Nudge villagers and get a cute reaction (owner: "nudge peoples").
- Look cohesive and pretty: soft low-poly shapes, pastel palette, warm light.
- Start with one command and play in a desktop browser.

## Non-goals

- Missions, quests, score, inventory, dialogue trees, saving progress (owner: none of these).
- Building interiors, swimming, leaving the island.
- Phone/touch controls, gamepad, multiplayer.
- Realistic graphics or detailed animated character models.

## Anti-goals (a failure even if it works)

- Anything that punishes, hurries or blocks the player: timers, damage, fail states, locked areas.
- A cluttered screen. The only on-screen text is a short controls hint at the start and a small prompt near an interactable thing.
- Stutter. It must feel smooth on an ordinary laptop.
- Looking like a tech demo: grey boxes, harsh lighting, mismatched styles.

## Constraints

- Runs locally on macOS in a current desktop browser (Chrome is the reference).
- No downloaded art or sound assets. All shapes are built in code and all sound is synthesised in the browser. This avoids licence questions and style clashes.
- Target 60 frames per second on the owner's machine: an Apple M5 MacBook
  with a 3024 x 1964 Retina display (checked on the machine). Real soft
  shadows, shader water and a handful of real lantern lights are in budget.
  Cap the render pixel ratio at 2. No automatic quality step-down is needed.
- Lives in `/Users/mekari/Projects/Research/cozy-island/`.

## Approaches considered

1. **Browser game, everything drawn from code (chosen).** Three.js with
   low-poly shapes generated in code. No asset downloads, consistent style,
   one command to run. Trade-off: villagers are simple blobby figures.
2. **Browser game with free model packs.** More detailed models and real
   walk animations. Trade-off: depends on third-party downloads and their
   licences; packs often clash in style.
3. **Game engine (Godot).** Most capable. Trade-off: needs an editor
   installed and learned; heavy for a game with no missions.

Chosen: 1. The owner described outcomes, not tools, so this was the
designer's call: it gets to "pretty and playable" with the least to go wrong.

## The game

### World

- One roughly round island, about 120 m across, with a sandy beach ring, a
  grassy middle and one gentle hill. Stylised animated water all around.
- A village of 5 or 6 small cottages around a little square, joined by dirt paths.
- Landmarks so the island is easy to read: a wooden dock with a rowing boat,
  a bell on a post in the square, a campfire with log benches on the beach,
  a lookout spot on the hill.
- Scatter: trees, bushes, flowers, rocks, fences, lanterns along the paths.
- The player cannot leave. Wading a little into the water is fine; past
  knee depth the player is gently slowed and cannot go further. No invisible
  wall that feels like a hard stop.

### Village style (owner, added during the build)

- The village is traditional: wooden plank houses on short stilts with
  thatched roofs, instead of pastel cottages.
- A campfire burns in the middle of the village square, with log seats.
- A small camp of canvas tents stands around a second campfire on the beach.
- The bell moves to the northern edge of the square. Seats are logs by the
  two fires plus the lookout bench.

### Later changes asked for by the owner during the build

- **Theme:** a student scouting event on a small island. The villagers are
  five scouts and their leader, all in neckerchiefs; the player is a scout too.
- **Layout:** buildings are scattered, not in a ring, and each has a purpose:
  a meeting hall, three cabins, a farm barn with a crop field, and a guard
  post with a lookout deck by the dock path. Scout tents stand in rows beside
  the parade ground, plus the beach camp. A flagpole (raise/lower with E), a
  windmill and a sheep meadow were added.
- **Look:** taken from the owner's reference pictures as style direction only
  (designer's call: an original character and world, not a copy): golden dry
  grass with swaying tufts, chunky flat-shaded trees, a clear blue sky,
  kid-sized characters, tiled roofs with chimney smoke, gulls, rabbits and sheep.
- **Interface:** start screen, clock and day counter, step count, minimap,
  pop-up notices, and an Esc menu with a journal of 15 optional things to
  find, sound toggle and time-of-day buttons. This replaces the earlier
  "only a hint and a prompt on screen" rule. The journal is not a quest:
  nothing is required or rewarded.
- **Tests:** the owner asked to stop writing test files part-way; rules
  added after that (interaction picking, scout behaviour, sound) are untested.

### Second round of owner feedback

- **Movement:** speed builds up and bleeds off, the body swings round and
  leans into turns, knees and elbows bend, jumps tuck and land with a squash,
  feet kick up dust, and the camera trails softly.
- **Temporary camp structures:** the wooden houses are replaced by canvas
  tents and bamboo-and-tarp shelters: a headquarters marquee, three patrol
  tents, a food tent, a first-aid tent, a farm shed and a guard post, plus a
  pioneering gateway, a bamboo lookout tower and scattered camp gear.
- **Walk-in structures:** open the flap with E and walk in; everything above
  waist height is sliced away while you are inside. The small ridge tents
  are not walk-in (designer's call: they have no door).
- **Activity groups:** scouts singing round the fire, saluting the flag,
  cooking, eating, lashing a tripod and exercising on the beach.
- **Flag:** the purple World Scout flag with a white fleur-de-lis
  (ASSUMPTION: the owner did not say which scout flag).

### Third round of owner feedback

- **Ground:** plain painted colour (a detailed soil texture was tried and
  dropped at the owner's request because it clashed with the flat look).
  Trails, meadow, mud, rock and jungle floor are painted into the terrain.
  Each surface has its own footstep sound and effect: dust, flying grass or
  leaves, mud splats, ripples, and footprints on sand and mud. Mud and soft
  sand are slightly slower, trails slightly quicker.
- **Terrain:** a wadeable pond with reeds, lily pads, ducks, butterflies and
  fireflies; a knoll under the windmill; rolling ground outside the camp; a
  bigger hill with ridges, natural benches, a level summit and a steep
  seaward face.
- **Summit camp:** signal mast, lean-to, third campfire, cairn, telescope,
  semaphore signallers, a lookout and a map-maker.
- **Flying fox:** launch tower on the summit, cable to a landing frame by the
  beach, four scouts who ride it and climb back up, and the player can ride.
- **Jungle:** about 230 mixed trees (palms, giants, saplings and the earlier
  kinds) and ferns outside the camp; softer curved grass and round bushes.
- **Movement:** stride length is tied to speed so feet no longer slide;
  walking is 2.6 m/s and running 6.2 m/s. Each kind of interaction has its
  own gesture, and scouts answer in different ways.
- **Interface:** white frosted glass throughout; scout rank card with a
  progress bar, clock chips, ground chip, discovery pop-ups, rank-up banner,
  and the journal in a side bar (J). Ranks and the journal are still
  optional: nothing is required.

### Fourth round of owner feedback

- **Camp timetable:** the day runs in blocks: morning exercise, flag
  ceremony (the whole camp in formation, flag raised), skills and lessons,
  lunch, games and free time, campfire night, lights out with a two-scout
  night watch. People walk between them; the flying fox riders are the
  exception and stay on their loop.
- **Staff and lively scouts:** chief scout, trainer, logistics and medical
  staff; tag, catch and tug-of-war.
- **Bodies:** scouts are short and chubby with tapered limbs; staff are
  taller. Shadows are plain and clean-edged.
- **Main campfire:** a bonfire with smoke and a crackle that grows as you
  come near.
- **Trails:** plain pale bands with a clean edge, no border and no gradient.
- **Controls:** X sits down or stands up; C switches free look.
- **Performance:** body parts and static scenery are welded into far fewer
  meshes, lantern lights are pooled, and resolution steps down
  automatically when frames run slow.

### Fifth round of owner feedback

- **Interface:** during play only white text and line icons over the
  picture, no panels: rank and time top-left, tool icons bottom-left, a list
  of the keys that matter right now bottom-right. The journal is a spiral
  notebook, the map is a paper sheet opened with M (the minimap is gone),
  greetings show a speech bubble, and the pause menu is white words on the
  dimmed picture. Sound moved to N.
- **World look:** trees with separate pads of foliage, tall flat-bladed
  grass in stands, chunky angular rocks, sandier ground, a white surf line.
  Both taken from the owner's reference pictures as style direction only.
- **Sleeping:** six dormitory tents and a staff tent with a bed for
  everyone; scouts lie in bed at night; the player sleeps until morning in
  the gold-pillow bed.
- **Joining in:** F does what the camp is doing; X sits.
- **Small movements:** head wobble, a bounce on each step, idle fidgets,
  stumbles, skids and bumping into things.

### Player

- A simple cute figure seen from behind and slightly above.
- Move with WASD or arrow keys, relative to the camera. Hold Shift to run. Space for a small hop.
- Drag the mouse to orbit the camera; scroll to zoom within a small range. The camera follows smoothly and does not clip through cottages.
- Simple procedural motion: bobbing and leg/arm swing when moving, faster when running.
- Cannot walk through cottages, trees, rocks, fences or villagers.

### Interacting with items

One key, E. When the player is near something interactable, it gets a soft
highlight and a small prompt ("E — ring bell"). The nearest one in front of
the player wins. Every interaction is instant, repeatable and harmless.

| Thing | What happens |
|---|---|
| Lantern | Toggles on/off with a warm glow |
| Cottage door | Swings open or shut (no interior; a dark doorway) |
| Village bell | Rings; nearby villagers look toward it |
| Bench / log | Player sits; any movement key stands up |
| Tree | Shakes; a few leaves or a fruit drop and fade |
| Campfire | Lights or goes out, with sparks |
| Chickens | Scatter and cluck, then settle |
| Cat | Gets petted; a small heart pops up |

### Villagers

- 5 or 6 villagers, each a different pastel colour with a small distinguishing touch (hat, scarf, etc.).
- They stroll between a few spots in the village, pause, and idle. No schedules.
- Nudging: walking into a villager, or pressing E next to one, makes them
  wobble and hop a step away, show a small picture-only emote bubble
  (heart, music note, surprised face — no words, designer's call, to keep
  the screen free of text), and make a soft squeak. Then they carry on. There is a short cool-down so they
  cannot be spammed into the sea, and they never leave the island.

### Light, time and sound

- A slow day cycle of about 8 minutes: morning, golden afternoon, sunset, a
  short soft blue night, back to morning. Lanterns and cottage windows glow
  at night. It starts in the golden afternoon so the first impression is the prettiest.
- Soft shadows from the sun, light fog toward the horizon, a gradient sky, a few drifting clouds.
- Sound is synthesised: gentle waves, light wind, soft chimes and plucks
  for interactions, footsteps. No music track. M mutes. Sound starts after
  the first click or key press, as browsers require.

### Screen

```
+--------------------------------------------------+
|                                        (sky)     |
|          cottages      bell                      |
|     tree        villager   lantern               |
|                  [you]                           |
|                                                  |
|                 E — ring bell                    |
| WASD move · Shift run · Space hop · E interact   |  <- fades after a few seconds
+--------------------------------------------------+
```

## How it gets made (designer's calls)

- Three.js for 3D, Vite for the dev server and build, plain JavaScript.
  Use the current stable releases at build time; no other runtime libraries
  are expected. Exact versions are unverified here and are for the builder to pin.
- `npm install` then `npm run dev` to play.
- Repeated scenery (trees, flowers, rocks) should be drawn in batches so the frame rate holds.
- The rules that can be checked without a screen (which interactable is
  picked, villager behaviour states, the island's height and edge limits,
  collision) should be plain functions with automated tests. The look is
  checked by running it in the browser and taking screenshots.

## Left to the builder

- File and module layout, and exact dependency versions.
- Exact palette, shapes and proportions, within "soft, pastel, low-poly, warm".
- Exact placement of cottages, landmarks and scatter (a fixed layout, the same every run).
- Collision method, camera smoothing values, movement speeds.
- How the sounds are synthesised.
