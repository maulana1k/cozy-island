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
