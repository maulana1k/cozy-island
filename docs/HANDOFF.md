INTERNAL

# Scout Camp Island: handoff

Last updated: 2026-11-16. Read this first when picking the work back up. Facts come from git and the code; anything inferred is marked ASSUMPTION.

## 1. What the game is

A browser 3D game (Three.js, Vite, plain JavaScript, no downloaded assets). You play a scout at a student scout camp on a large island with a camp, a jungle, a river, a terraced village, a farm, a harbour with a ferry, and a cliff with a waterfall. There is nothing to win: you wander, use things, greet people, fill an optional journal, and watch about 70 camp people follow a daily timetable. The day cycle, weather and night lighting are live. The local repo is not pushed anywhere.

- Path: `/Users/mekari/Projects/Research/cozy-island/`
- Stack: `three` ^0.187, `vite` ^8, `vitest` ^4 (from `package.json`)
- Controls: W A S D move, Shift toggles walk/run, Space hop, E use/greet, F join in, X sit, C free look, J journal, M map, B backpack, N sound, Esc pause.

## 2. Run, test, verify

```
npm install
npm run dev          # http://localhost:5173
npx vitest run       # rules tests, 7 files (see "Current state" for the result today)
npm run build
```

**Debug URL params** (combine with `&`):

| Param | Effect |
|---|---|
| `?play` | skip the start screen |
| `?t=0.45` | time of day, 0..1 (0.45 is about midday) |
| `?freeze` | stop the clock |
| `?x=&z=&yaw=` | place the player and camera |
| `?weather=sun\|wind\|rain\|fog` | force one weather (the weather is random otherwise) |
| `&thunder=1` | thunder debug flag read in `weather.js` (ASSUMPTION: forces thunder to trigger more often; read `thunderDebug` in `src/world/weather.js` before relying on it) |
| `?nolimit` | switch the frame limiter off, for measuring |
| `?dbg` | draw-call count in the page title |
| `?settle=20` | run 20 s before the first frame |
| `?journal`, `?map`, `?pause`, `?ride`, `?found=5`, `?journey`, `?intro`, `?kit`, `?bag`, `?mood=sad`, `?noflora`, `?nohamlet` | open a screen or switch a feature, per `main.js` |

**Tools in `tools/`** (dev server must be running; each tool opens one headless Chrome and always closes it; gives up after `MAXMS`, default 240000 ms; set `PORT=9xxx` if two run together; screenshots go in `.shots/`):

- `ev.mjs`: `node tools/ev.mjs "<query>" "<expression>" [waitMs] [shot.jpg] ["<js before shot>"]`. Loads the game with a query, optionally runs JS, optionally screenshots, prints the expression value.
- `cam.mjs`: `node tools/cam.mjs out.jpg camx camy camz tx ty tz [t=0.45] [playerx] [playerz] [extra]`. Fixed-camera picture. **The `extra` query argument must start with `&`**, for example `&weather=rain`.
- `prof.mjs`: `node tools/prof.mjs [spot]`. Frame time, draw calls and triangles per spot with the limiter off. `T=0.8 node tools/prof.mjs camp` sets the time of day (default 0.45). A second argument is appended to the URL. Spots: `camp`, `summit`, `jungle`, `bridge`, `village`, `farm`, `clifftop`, `dock`, `topterrace`, `clearing`.
- `kitshot.mjs`: `node tools/kitshot.mjs "kit=tents&fn=familyTunnelTent" out.jpg`. A picture of one model on the bare stage.
- `browser.mjs`: shared helper that starts and always kills the headless Chrome. Not run directly.

**Kit previews** in the browser: `http://localhost:5173/kit.html?kit=tents&fn=tentLineup`. `kit` is a file in `src/kit/`, `fn` an exported builder. Optional `dist`, `h`, `a`, `look`, `mode` (see `kitshot.mjs`).

## 3. Working rules learned in this project

- **One headless Chrome at a time.** Take the lock before starting a browser: `mkdir /tmp/cozy-chrome.lock` (fails if another agent has it); remove it with `rmdir` when done. The tools do not take the lock themselves.
- **Never `pkill` Chrome.** Another agent's browser may be running. Leftover browsers heated the owner's laptop in an earlier round.
- **Git-ignored folders:** `.shots/` (screenshots) and `.reference/` (the owner's private reference images; never commit or share them). Also ignored: `node_modules`, `dist`, `.superpowers`.
- **Branches:** work on `build`. Fast-forward `main` only after the change has been checked on screen.
- **No new test files.** The owner asked to stop adding tests; the 7 existing files cover rules only.
- **Never use `git stash`.** A saved stash exists (see section 6) and must not be touched. Use explicit `git add <file>`, never `git add -A`.
- **Performance budget:** at most 900 draw calls and about 1.7 M triangles in any view.
- **The owner's laptop overheats.** Keep the frame limiter on (60/s play, 30 in battery saver), and turn it off only for measuring.
- **Not played by hand:** much of this was checked by screenshots only, not by playing (see section 7).

## 4. Architecture map

Rules without Three.js are in `src/logic/` (`terrain`, `layout`, `collision`, `dayCycle`, `rng`, `time`, plus untested `interact`, `villagerBrain`, `surface`, `journal`, `items`, `bag`, `stats`, `journey`). Loop and wiring are in `src/main.js`; numbers, palette and area anchors are in `src/config.js`.

| Module | What it does |
|---|---|
| `world/sky.js` | Sun, moon, sky colours, fog, hemisphere light, sun shadow map (redrawn every second frame) |
| `world/weather.js` | Weather director (`sun`, `wind`, `rain`, `fog`), rain/wind/mist particles, shared wind sway (`windSway`), wet surfaces (`wetSurface`), lightning; calls `audio.thunder` |
| `world/flames.js` | `createFlames`: shader fire with noise tongues, halo, glowing coals and embers; used by campfires |
| `world/props.js` | Lamps, campfires, flag, seats, bell, telescope. Night shadow cubes for the bonfire and nearest lamp: only objects on the `NEAR_CASTERS` layer (5) near them are drawn into the cube. The flag is the purple World Scout flag |
| `world/buildings.js` | Walk-in tents, beds, doors (`TENT_PLAN` maps tent type to model and doorway), slice clipping plane when the player is inside |
| `kit/tents.js` | Tent models: `backpackTent`, `tunnelTent`, `familyTunnelTent`, `domeTent`, `geodesicTent`, `groupShelter`, `utilityTent`. Preview with `kit.html?kit=tents&fn=tentLineup` |
| `actors/figure.js` | One skinned body per person (bones, eight face expressions), FK walk and run (`animate()`), turning, fidgets, `setGround` for planted feet |
| `actors/player.js` | Player movement, collisions, set-off and stop, hop, backpack and cap on the body |
| `actors/schedule.js`, `actors/campLife.js` | Seven-block camp timetable and `crowd.drive()`; staff, tag, catch and tug-of-war groups |
| `world/scatter.js`, `flora.js`, `wilds.js` | Camp grass, trees, bushes, ferns; ~2,300 plants on the new land; streamed jungle tiles with real trees near and lumps far |
| `world/ground.js`, `island.js` | Painted ground colours for camp mesh and tiles; terrain, sea shader, shoreline |
| `hud.js` | HUD: paper map, line icons (including the water bottle), key-cap interact marker, journal, backpack |
| `audio.js` | All synthesised sound: fire, sea, rain bed (`rainGain`), thunder |

Other areas: `world/areas/*.js` (one file per area, `create(scene, deps)`, list `AREA_LIST` in `main.js`), `world/village.js`, `world/campProps.js`, `world/pond.js`, `world/zipline.js`, `world/build.js` (shared shapes and welding), `cutscene.js`, `effects.js`, `camera.js`, `input.js`.

## 5. What was done in this session (from `git log`)

**Character motion.** Walk rebuilt on joint-angle curves (`c31c63c`): straight legs in double support, hips ride the planted leg, feet settle side by side on stopping. Run with a real flight phase (`dcb7a5e`, `33486be`). Natural set-off and run stop (`b98dcb5`). Player is 1.5 m/s walk; NPCs about 1.0 to 1.2 m/s. Collisions and solid camp props and rocks (`b98dcb5`). Backpack and cap, small scout day pack. Foot-lift spring fixed for large frame times (`2668ad5`).

**World.** Natural coast with bays, coves, rocky points and islets (`c90143d`, `7730b3f`). Trails from camp to the windmill knoll and the village bridge, rerouted along the open beach, trees kept off them (`1d608dc`, `c5ee145`, `003931d`). Moody natural greens (`08f1d0f`, `4cf8033`). Lush multi-blade meadow grass (`7ac70a5`). Plants, grass and ground in a two-tone Trail-style (shard blades, faceted foliage, flat ground patches, `b3b0758`). Camp games moved to flat ground (`853a5d1`).

**Lighting and shadows.** Lamps: soft warm light, twice the reach (`b65cb6a`), none in daylight (`6225781`), village and pier lamps in the lamp-light pool. Sun shadow 4096 map over 60 m (`4c66658`). Shadow bias fixes so shadows start at the object's foot (`b7b97f7`, `0c5c425`). Night shadow cubes for the bonfire and nearest lamp (`d0a1ab5`), made faster and limited to near casters (`7e3b442`, `70a03c8`, `aae2324`).

**Weather, rain, thunder.** Weather director with HUD badge, wind, rain and mist particles, shared wind sway, campfire damping, cold drain and `?weather=` (`e446e50`). Gentler chaotic rain, splashes, rain sound bed, distant thunder with a lightning flash (`7f755fd`).

**Fire.** Real shader flames: noise tongues, halo, coals, embers (`8c687f5`). Camp bonfire burns 18:00 to 06:00 (`a719719`). Tents no longer glow at night (`4bbe402`).

**Modern tents.** Canvas tents replaced by modern hiking tents (`04baaff`, kit in `a0d7cf2`). Larger family tunnel tent for patrol dormitories and crisper two-tone domes (`5edbdd9`). Fabric doors that roll up, lit grey inner tent, groundsheet follows the outline (`e6d25e4`). Lighter staff tent (`d4d0c1d`).

**UI.** Key-cap interact badge and door shimmer hints (`7045dc3`). Water flask bottle icon (`0445f9a`, `cda5c59`). Shift now toggles walk and run (`7aa1ba0`). Paper map redrawn (`ea01310`). Day length 32 minutes at 1x (`479a554`).

**Fixes.** People flying off at large frame times (`2668ad5`). People walking in from home when the game opens mid-block (`f5aeb53`). Campers sleeping outside, they now go to their bed (`bc1f285`). Campers reach their spot within 20 s (`ed4460e`). Games in bushes (`853a5d1`). A split movement block in `player.js` restored (`2cf1edf`). Invisible first-aid box (`32953bd`).

**Earlier in the project** (details in the specs and `git log`): bigger island with river, lake, cliffs, harbour, hamlet, farm and a terraced village; one skinned body per person; frame limiter and resolution cap for heat; locals, wildlife, backpack and stats, intro film and journey guide, jungle streaming.

## 6. Current state

**Branches.** `main` is at `7f755fd`. `build` is 7 commits ahead of `main` (newest first):

```
cda5c59 water flask gets a hand-drawn water bottle icon (the emoji read as soap)
0445f9a water flask shows a bottle icon
d4d0c1d Lighter staff tent so its open door shows a brighter interior
e6d25e4 Fabric tent doors: panel rolls up into its bundle, lit grey inner tent, groundsheet follows tent outline
5edbdd9 Bigger detailed family tunnel tent for patrol dormitories; larger crisper two-tone domes
0c5c425 sun shadows start at the object's foot: normal bias down to about one shadow texel
04baaff Replace canvas tents with modern hiking tents (tunnel, geodesic, shelters, utility, domes)
```

Everything older is on both. The modern tents and the bottle icon are therefore not yet on `main`.

**Uncommitted work in the tree (do not discard).** Modified: `src/audio.js`, `src/kit/tents.js`, `src/logic/layout.js`, `src/world/buildings.js`. Untracked: `src/world/toon.js`, `src/world/zipDoor.js`. This is the in-progress tent work:

- Bigger patrol tunnel tents (footprint 6.6 x 9.6 m, was 5 x 7.4) with beds placed inside (`BEDS` offsets in `layout.js`), a larger staff tent (7.2 x 8 m), and some tents moved to make room (`PIONEER_SITE`, `tent-6`).
- Staff tent interior.
- Zipper door animation: `src/world/zipDoor.js` (a puller travels the zip line while the panel peels away, then flops onto the porch; imported by the working-tree `buildings.js`, not by committed code).

**Tests.** `npx vitest run` today: 49 pass, 1 fails (50 total): `AssertionError: expected [...] to have a length of 264 but got 261`, a tree-count check. It runs against the uncommitted `layout.js`, whose moved tents change how many trees fit. ASSUMPTION: the committed `build` head passes all 50; this was not verified because the tree could not be reset (no stash allowed). Decide whether the layout or the expected count is right before committing the tent work.

**Stash `stash@{0}`: "On build: trail-look WIP (paused agent, restore before resuming)".** A paused art-style pass touching `src/world/` (ground colours and others), kept by an agent that stopped. Its diff stat shows four tracked files, and it is related to the untracked `src/world/toon.js` (cel shading: it rewrites three.js's shared lighting shader chunks so every lit material gets flat light bands, one even shadow tone, cool shadows, and aerial-perspective fog). ASSUMPTION: the stash plus `toon.js` also carry the sky, haze and day-colour changes described by the lead; check with `git stash show -p stash@{0}`, which is read-only. Restore with care: the stash predates later work, so a plain apply may overwrite or conflict with the **newer moody greens, the lush grass and the night lighting**, which must be kept. Prefer `git stash show -p stash@{0}` and port hunks by hand; never `git stash pop` or `drop`.

## 7. Known issues and next steps

**Next steps, in order:**

1. **Finish the tent work** (section 6): fix the tree-count test, check the zipper door, the bigger tunnel with beds, and the staff interior on screen, commit, then fast-forward `main`.
2. **The Trail look, Stage 1 and 2:** resume the paused art-style pass from the stash and `toon.js` (cel shading, sky, haze, day colours), keeping the newer greens, grass and night lighting. Value: the look the owner asked for. Proof: before/after screenshots at fixed `cam.mjs` spots, and `prof.mjs` numbers (cel shading must stay inside the budget).
3. **Tent placement polish:** spacing between the bigger tents, paths and trees (`layout.js`).
4. **Grass not yet lush across the river:** the new land (`flora.js`) has less grass than the camp meadow.
5. **Rain splash rings at the player's height:** splashes appear at head level instead of on the ground (ASSUMPTION: the ring height uses the player's y, not the ground height; check `weather.js`).
6. **Weather is not saved:** ASSUMPTION: it re-rolls on every load; the only saved setting found is the `saver` flag in `localStorage`.
7. **Breath puffs in cold weather:** not done.
8. **Re-profile on a quiet machine.** Frame-time measurements this session were noisy (up to 2 ms between runs of the same code). Treat draw calls and triangles as the stable figure.
9. **Next big project: story, quests and roles.** Being designed now, no code yet. Value: gives the sandbox a reason to play. Write the design in `docs/superpowers/specs/` first.
10. **Then music.** Sound today is all synthesised effects; there is no music.

**Known gaps from earlier rounds:**

- Not played by hand: free look, sleeping, joining in, sitting, speech bubbles, sound, frame rate on the owner's Retina screen, greeting locals and petting farm animals with a real key press.
- No tests for anything added after the owner said to stop writing tests (interaction, scouts, timetable, surfaces, sound).
- People do not step aside for each other; scouts can walk through closed tent flaps at bedtime.
- The six flying fox riders ignore the timetable and wait on the summit overnight.
- The camera can be blocked by trunks and canopies in the jungle.
- Some label lines on the paper map cross.
- Last measured views (earlier in the project, before the tent work): camp 581 draw calls, dock about 855, all under 900. The dock view (whole camp in view) is the dearest and the first to break the budget.

Design history: `docs/superpowers/specs/` (five dated design files for the original game, bigger island, heat and speed, living village, look and feel). The original plan in `docs/superpowers/plans/` is finished and out of date.
