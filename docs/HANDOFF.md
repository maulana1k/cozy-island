Classification: INTERNAL

# Scout Camp Island — handoff

Last updated: 2026-11-16. Read this first when picking the work back up.

## What it is

A browser 3D game (Three.js, Vite, plain JavaScript, no downloaded assets). You play a scout
at a student scout camp on a small island. There is nothing to win; you wander, use things,
greet people and fill an optional journal.

- Location: `/Users/mekari/Projects/Research/cozy-island/`
- Run: `npm install`, then `npm run dev` (http://localhost:5173)
- Checks: `npm test` (50 tests, rules only), `npm run build`
- Git: local repo only, nothing pushed. Work happens on `build`, fast-forwarded into `main`
  after each round. Both are at the same commit.
- Design history: `docs/superpowers/specs/2026-11-16-cozy-island-design.md` (the original design
  plus a section per round of owner feedback). The original plan in `docs/superpowers/plans/`
  is finished and now out of date.

## Controls

W A S D move · Shift run · Space hop · E use / greet · F join in with the camp · X sit or stand
· C free look · J journal · M map · N sound · Esc pause · drag to look · scroll to zoom

## Where things live

| Area | Files |
|---|---|
| Loop and wiring | `src/main.js` |
| Numbers and palette | `src/config.js` |
| Rules (no Three.js, tested) | `src/logic/`: `terrain`, `layout`, `collision`, `dayCycle`, `rng`, `time` |
| Rules (untested) | `src/logic/`: `interact`, `villagerBrain`, `surface`, `journal` |
| Ground, sea, sky | `src/world/island.js`, `sky.js` |
| Walk-in tents, beds, doors | `src/world/buildings.js` |
| Trails, hill steps, railings, dock, small tents, windmill | `src/world/village.js` |
| Trees, grass, rocks, bushes, ferns | `src/world/scatter.js` |
| Lanterns, bell, flag, seats, campfires, telescope | `src/world/props.js` |
| Scattered camp gear | `src/world/campProps.js` |
| Pond life | `src/world/pond.js` |
| Flying fox and its riders | `src/world/zipline.js` |
| Shared shapes, textures, mesh welding | `src/world/build.js` |
| Body, poses, gestures | `src/actors/figure.js` |
| Player | `src/actors/player.js` |
| Camp timetable and who goes where | `src/actors/schedule.js` |
| People | `src/actors/villagers.js` (6 wanderers), `activities.js` (fixed groups), `campLife.js` (staff, tag, catch, tug-of-war) |
| Animals | `src/actors/animals.js`, `wildlife.js` |
| Interface | `src/hud.js` and the styles in `index.html`; `src/ui.js` (emotes, marker) |
| Sound | `src/audio.js` (all synthesised) |
| Footstep effects | `src/effects.js` |

## How the main systems work

- **Layout** is fixed data in `logic/layout.js`. `COTTAGES` is the list of 12 walk-in structures
  (the name is historical). `getColliders()` treats them as solid for everyone except the
  player, who gets walls with a doorway from `buildings.colliders()`.
- **Ground height** is `heightAt` (terrain, including the level bed cut along the hill trail)
  and `groundAt` (adds the dock, tent floors and the hill steps). The player walks on `groundAt`.
- **Timetable** (`schedule.js`): the day has seven blocks. In gathering blocks every member of
  the crowd is given a spot and walks to it; otherwise each group runs its own logic. Modules
  call `crowd.drive(member, dt)`; true means the timetable is in charge of that person.
- **Slice view**: each tent's materials share a clipping plane that drops to waist height while
  the player is inside.
- **Performance**: body parts and static scenery are welded into few meshes, lantern lights are
  pooled, far people animate every third frame, resolution steps down when frames run slow.
- **Debug URL options**: `?play` skip start screen, `?freeze` stop the clock, `?t=0.2` time of
  day, `?x=&z=&yaw=` place player and camera, `?settle=20` run 20 s before the first frame,
  `?journal`, `?map`, `?pause`, `?ride`, `?found=5`, `?dbg` draw-call count in the page title.

## How it was checked

Almost everything was checked by headless Chrome screenshots, not by playing. The script used
was a scratchpad file and will not survive; it ran Chrome with
`--headless=new --use-angle=metal --enable-gpu --virtual-time-budget=6000 --screenshot=...`
against the debug URL options above. The Playwright browser tools were removed part-way through.

## Known gaps and rough edges

- Not played by hand: free look (needs a real mouse), sleeping, joining in, sit, stumbles and
  fidgets, speech bubbles, sounds, frame rate on the owner's Retina display.
- No tests for anything added after the owner said to stop writing tests: interaction picking,
  scout behaviour, timetable, surfaces, sound.
- People do not avoid each other; the crate carrier, tag players and timetable walkers can pass
  through others, and scouts walk through closed tent flaps at bedtime.
- The six flying fox riders ignore the timetable and wait on the summit overnight.
- Wandering scouts and animals cannot enter tents.
- The seven small ridge tents are decoration with no door.
- The camera can be blocked by trunks and canopies in the jungle.
- Some label lines on the paper map cross each other.
- Trails sit about 1 cm above the ground; watch for flicker against the terrain.
- The flag is the World Scout flag. ASSUMPTION: the owner never said which scout flag; the
  Indonesian Pramuka flag was offered as an alternative and not taken up.

## Owner preferences learned

- Look: taken from the owner's reference pictures as style direction only. Keep an original
  character, interface and world rather than copying that game.
- Simple flat colour over detailed textures on the ground; soft textures on structures are fine.
- Trails: plain pale bands, clean edge, no gradient and no border.
- Scouts short and chubby with tapered limbs; only staff tall.
- Interface: white text and line icons, no panels during play.
- Wants things built and merged without check-ins, and tests by hand afterwards.

## Sixth round (added after the notes above)

- **Backpack, items and stats.** `src/logic/items.js` (catalogue), `bag.js` (12 pockets), `stats.js`
  (food, water, energy, cheer; low values only slow you, nothing can hurt you), `src/world/pickups.js`
  (shells, mushrooms, sticks, flowers, stones, feathers, eggs, berry bushes, plus water barrels, the
  stew and bread table, marshmallow crate and first-aid box). B opens the backpack, 1 to 6 use a
  pocket, E picks up. Cooking and feeding a fire need a lit campfire nearby. Trees drop apples and
  coconuts when shaken.
- **Start menu, journey, tips, films.** "Start the journey" plays an intro film and starts you on
  the dock with a 15-step guide (`src/logic/journey.js`); steps tick off in any order and G hides
  the guide. "Explore freely" skips it. One-line tips appear the first time something comes up.
  `src/cutscene.js` flies the camera for short films: the intro, each timetable activity once
  (16 seconds after it starts), the first flag raising, the summit, the journey's end. Space skips;
  the pause menu can switch films off.
- **Wild jungle.** The land now continues behind the hill (`WILD` in `config.js`, `landR` and
  `wildDepth` in `terrain.js`, scenery in `src/world/wilds.js`). The two parts are melted into one
  coastline (`melt` in `terrain.js`) with no rope or fence: the camp's trees give way to giants from
  55 m out. From 70 m the screen edges turn red with a warning, and at 82 m you are turned back.
- **Hill trail.** Now a 71 m spiral round the back of the hill at one steady 18% slope, with broad
  low steps. The headquarters tent moved 2.6 m east to clear it.
- **Movement.** Feet are planted: the body rests on the lowest point of either shoe every frame
  (`setGround` in `figure.js`). Walk 1.9 m/s, run 3.9 m/s, much less bounce.
- **Fixed.** Invisible pause-menu buttons were catching clicks in the middle of the screen.
- **New debug options:** `?journey` (guide, no intro), `?intro`, `?kit` (sample items, low food),
  `?bag`. `window.__game.film('campfire')` plays a film.
- **Not checked by hand:** item use by keyboard, stat pacing over a full day, the films triggered
  by the timetable itself, the danger turn-back while walking, sound. No tests cover any of this.

## Seventh round

- **Jungle.** The island is now mostly jungle (`WILD.radius` 300 m). `src/world/wilds.js` keeps it in
  48 m tiles: tiles within 300 m exist, real trees (the six camp kinds plus giants, in groves,
  stands and glades) within 88 m, undergrowth within 58 m, one lump per treetop beyond. Fog is
  thicker (`FOG_DENSITY` in `sky.js`) and thickens further among the big trees.
- **Hard stop.** Warning from 70 m out; at 82 m a full-screen STOP takes over and the player is
  walked back for about three seconds (`player.auto`), passing through trees so nothing snags.
- **People.** Faces with blinking eyes that look at things, brows, lashes, a mouth that opens,
  five hair styles; uniform details (collar, buttons, pockets, belt, badge); hands with thumbs;
  feet on ankle joints that keep the sole level. Everyone turns to look at you when you come close.
- **Night and torch.** Nights are much darker. The torch is a forward cone (`SpotLight`), and the
  scout holds it out when it is on.
- **Sound.** Fire is a dry crackle heard only within 9 m (5 m for small fires); the sea is loud
  only near the shore.
- **Not measured:** frame rate after this round. The jungle adds roughly 600,000 triangles and
  each person three to five more things to draw.

## Performance pass on the jungle (after the seventh round)

Measured with `?dbg` in headless Chrome (triangles and draw calls per frame, shadow pass included):

| Where | Before this pass | After | Before this session's work |
|---|---|---|---|
| In the jungle (-45, -55) | 1,446,000 / 173 | 691,000 / 200 | not applicable |
| Summit | 1,557,000 / 930 | 1,102,000 / 841 | not measured |
| Middle of camp (10, 14) | not measured | 1,189,000 / 1,432 | 1,031,000 / 1,350 |

What changed: jungle scenery casts no shadows; real trees only within 58 m and ferns and grass
within 36 m, chosen per tree, not per tile; lumps and tiles out to 230 m with thicker fog covering
the edge; a lighter bush; people beyond 26 m cast no shadow, beyond 45 m have no separate shoes,
and beyond 15 m have no eyes or mouth drawn. Frame rate itself was not measured.
The camp is now the heaviest place, mostly the 70 people (about 1,400 draw calls).

## Heat and speed (2026-11-16)

Design: `docs/superpowers/specs/2026-11-16-heat-and-speed-design.md`. The laptop ran hot because the game drew every refresh of a 120 Hz screen at 2× resolution, and drew about 1,400 separate objects in camp.

What changed:

- **Frame limit** (`frame` and `frameRate` in `src/main.js`): 60 a second in play, 30 with "Battery saver" on (pause menu, remembered in `localStorage` as `saver`), 30 on the title, 10 in the pause menu. `?nolimit` switches the limit off for measuring.
- **Resolution**: pixel ratio capped at 1.5 (`MAX_RATIO`). The automatic tuning now judges against the chosen rate.
- **Shadows**: the shadow map is redrawn every second frame (`shadowMap.autoUpdate = false` in `sky.js`, `needsUpdate` set in `main.js`), every frame in saver mode.
- **Hidden torches**: every person was drawing a torch that should have been hidden (a `visible = false` swallowed by a comment in `figure.js`). About 500 draw calls in camp.
- **Far-away people are one piece** (`bakeFigure`, `farMesh` in `figure.js`): past 46 m a person holding still, and past 70 m anyone, is shown as one welded mesh frozen in the current pose (standing, sitting, lying each cached per person). One is made per frame at most.
- **Far-away buildings drop small parts** (`userData.big` from `mergeStatic`, used in `buildings.update`): past 48 m only pieces at least 0.9 m across are drawn.
- Detail levels for people are judged from the camera, not the player.

Measured with `node tools/prof.mjs` (dev server running; limiter off, midday, standing still):

| Spot | Frame before | Frame after | Draw calls before | Draw calls after |
|---|---|---|---|---|
| Camp centre | 6.0 ms | 3.5 ms | 1,404 | 885 |
| Summit | 5.4 ms | 3.2 ms | 764 | 496 |
| Jungle, looking back at camp | 6.7 ms | 3.8 ms | 1,682 | 819 |

Frames drawn per second, measured in headless Chrome (a 60 Hz surface): play 60, title 30, pause menu 10. The 120 → 60 cut on the real screen follows from the same limiter but was not measured on it.

Still heavy: a view of the whole camp from 45 to 60 m (the beach) is about 1,240 draw calls, because people who are walking or doing an activity stay in full parts until 70 m. The look-and-feel project should rebuild each person as one skinned mesh, which removes this.

## Look and feel, part A: one skinned body per person (2026-11-16, on `build`, awaiting the owner's look)

Design: `docs/superpowers/specs/2026-11-16-look-and-feel-design.md`.

- `src/actors/figure.js`: every joint is now a `THREE.Bone` (same tree, same rest positions, so `animate()` is unchanged). All loose pieces are baked into one `THREE.SkinnedMesh` (`rigid()` gives a piece to one bone; `tube()` sweeps the trunk, arms and legs through rings whose weights are shared across the waist, elbows and knees so they bend in a curve). Only the torch and a carried crate stay separate (`userData.keep`).
- Faces: eyes, pupils, mouth, each brow and the mouth's curve ride their own bones. `FACES` holds eight expressions; `animate()` picks one from `o.mood`, the gesture (`GESTURE_FACE`), the pose (`POSE_FACE`), running, or the camp being sleepy (`setSleepy(night)`), and eases to it. The player's mood comes from the stats in `main.js`. `?mood=sad` forces a face for screenshots.
- The baked far stand-in from the heat project is gone: past 46 m a still person (past 70 m anyone) simply updates once every 30 frames.

| Spot | Draw calls before | After | Frame before | After |
|---|---|---|---|---|
| Camp centre | 885 | 609 | 3.5 ms | 2.9 ms |
| Summit | 496 | 392 | 3.2 ms | 3.2 ms |
| Jungle, looking at camp | 819 | 732 | 3.8 ms | 4.0 ms |
| Beach, looking at camp | about 1,240 | 752 | not measured | not measured |

Camp (target 600) and the beach view (target 700) are just over their targets. Not yet done from the design: parts B to G.

## Look and feel, parts C, D, E: torch, sea, grass (2026-11-16, on `build`)

- **Torch** (`src/main.js`): wider cone (0.6), fully soft edge, gentle fall-off (decay 0.45, reach 42 m) at much lower intensity, so the pool spreads and fades with distance instead of burning the near ground. `torchGlow` is a small point light round the scout. The aim follows the facing a moment late and bobs with the stride.
- **Sea** (`src/world/island.js`): three long slow waves instead of short ripples. The shore foam was a hard 3.4 m band at 85% white, which is what made the sea look white from the beach; it is now a soft band about a stride wide that swells and fades with each wash. Not done: the wet-sand line on the beach.
- **Grass** (`ribbonClump`, `tuftGeometry` and the grass shader in `src/world/scatter.js`): blades keep their width and end blunt, bend over along their length, sway in slow waves with gusts, and lean away from the player's feet (`uWalker`). 7 blades of 4 segments per clump (56 triangles, was 36).

## Look and feel, parts B, F, G: behaviour, animals, buildings (2026-11-16)

- **Behaviour.** `schedule.js` `walk()`: each person has a pace (0.88 to 1.12), eases off from standing and slows on arrival; cruising speeds are 2.3 m/s, 3.6 m/s when hurrying (were 2.7 and 4.4). `figure.js`: the body leans into turns and the head leads (`turn`); people standing with nothing to do fidget on their own (`fidget`: look about, stretch, scratch, tap a foot, yawn at night); people look at the scout, not the camera (`setViewer` takes both). `villagers.js`: a wanderer who arrives near someone stops to chat for a few seconds (`v.chat`, 'explain' pose, talking mouth, a note bubble); measured 4 chats in 22 arrivals over 70 s. Wanderers turn in a curve. Not done: stepping aside for each other, two-sided chats (only the wanderer talks), reactions between campers.
- **Animals** (`animals.js`, `wildlife.js`): smooth-shaded, rounder shapes with eyes. Chickens have swinging legs, a nodding head, pecking bursts with looks up, and roost at night. The cat washes a paw, flicks its ears and curls up at night. Sheep step in diagonal pairs, trot off when run at, look up from grazing and lie down at night. Rabbits stretch through each bound with ears flat. Gulls wheel on a drifting loop, bank into turns and glide. `update` takes `night`. Small parts cast no shadow and animals are hidden beyond 65 m. Not done: gulls landing on the beach.
- **Buildings** (`build.js`): `roofGeometry` roofs sag along the ridge, belly in on each slope and have uneven eaves; `cyl` poles over 0.9 m lean up to about 1.7 degrees; `box` pieces up to 1.6 m sit slightly askew and vary 2.5% in size (`off()` is a steady pseudo-random from position). Colliders are untouched. Not done: bowed canvas walls, curved guy ropes, bevels, canvas moving in wind, and `village.js` houses (they use their own shapes and will be rebuilt with the bigger island).

Draw calls after all parts: camp 605, summit 418. Frame times from `tools/prof.mjs` varied between runs of the same code by up to 2 ms on this machine, so treat draw calls as the stable figure.
