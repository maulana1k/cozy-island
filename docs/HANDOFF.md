INTERNAL

# Scout Camp Island: handoff

Last updated: 2026-11-17, at commit `1243c98` (previous refresh: `d366eed`, 2026-11-16; 70 commits since, from `git log --oneline d366eed..HEAD`). Read this first when picking the work back up. Facts come from git and the code; anything inferred is marked ASSUMPTION.

## 1. What the game is

A browser 3D game (Three.js, Vite, plain JavaScript, no downloaded assets). You play a scout at a student scout camp on a large island with a camp, a jungle, a river, a terraced village, a farm, a harbour with a ferry, and a cliff with a waterfall. There is still no win state, but there is now an optional story layer: pick a name and look, talk to people (Chapter 1 "New scout"), keep a journal with Quests, Notes, Field guide and People pages, photograph animals, clean up litter, and watch about 70 camp people follow a daily timetable. The day cycle, weather and night lighting are live. The local repo is not pushed anywhere.

- Path: `/Users/mekari/Projects/Research/cozy-island/`
- Stack: `three` ^0.187, `vite` ^8, `vitest` ^4 (from `package.json`)
- Look: "The Trail" style (low-poly, painted colour, cel shading, no photo textures). Research in `docs/research/2026-11-17-trail-alba-style-research.md`.
- Controls (from the pause menu's Controls panel in `src/hud.js`): W A S D move, Shift toggles walk/run, Space hop, E use/pick up/greet, F join in, X sit, mouse drag or C free look, scroll zoom, 1-8 quick bar, B backpack, J journal, M map, G quest guide on/off, N sound, T day speed 1x to 2x, Tab menu, Esc pause, Alt shows the calm HUD while held.

## 2. Run, test, verify

```
npm install
npm run dev          # http://localhost:5173
npx vitest run       # rules tests, 7 files, 50 tests (all 50 pass at 1243c98, checked today)
npm run build
```

**Debug URL params** (combine with `&`; from `src/main.js` and the files named):

| Param | Effect |
|---|---|
| `?play` | skip the start screen |
| `?t=0.45` | time of day, 0..1 (0.45 is about midday) |
| `?freeze` | stop the clock |
| `?x=&z=&yaw=` | place the player and camera |
| `?weather=sun\|wind\|rain\|fog` | force one weather (random otherwise; the pause menu Weather row also sets it) |
| `&thunder=1` | thunder debug flag read in `weather.js` (ASSUMPTION: forces thunder more often; read `src/world/weather.js` before relying on it) |
| `?nolimit` | switch the frame limiter off, for measuring |
| `?dbg` | draw-call count in the page title |
| `?settle=20` | run 20 s before the first frame |
| `?graphics=low\|high` | force Graphics High or Low (otherwise the saved pause-menu choice, default High) |
| `?noparticles` | V2 particles off (`src/world/particles.js`), for measuring |
| `?noreact` | V3 reacting world off (`src/world/react.js`), for measuring |
| `?dpr=1`, `?noshadow=sun,fire,lamps,torch` (bare `?noshadow`: all), `?nobloom`, `?nosunfx`, `?nosky`, `?nowater` | measuring switches (`src/perf.js`); `?dpr` and `?nolimit` also stop the slow-frame ladder, so a measured ratio stays put. With `?dbg` the title carries `upd`/`rend`: ms of script per frame in the update and in the render call |
| `?picker` | open the story's name and look picker |
| `?talk=leader\|buddy\|younger\|board` | walk up to and open that conversation after 0.5 s (leader is the chief scout, `staff-0`; the others are `cast-<name>` or the prop id) |
| `?journal`, `?map`, `?pause`, `?ride`, `?found=5`, `?journey`, `?intro`, `?kit`, `?bag`, `?mood=sad`, `?noflora`, `?nohamlet` | open a screen or switch a feature, per `main.js` |

**Tools in `tools/`** (unchanged; dev server must be running; each tool opens one headless Chrome and always closes it; gives up after `MAXMS`, default 240000 ms; set `PORT=9xxx` if two run together; screenshots go in `.shots/`):

- `ev.mjs`: `node tools/ev.mjs "<query>" "<expression>" [waitMs] [shot.jpg] ["<js before shot>"]`. Loads the game with a query, optionally runs JS, optionally screenshots, prints the expression value.
- `cam.mjs`: `node tools/cam.mjs out.jpg camx camy camz tx ty tz [t=0.45] [playerx] [playerz] [extra]`. Fixed-camera picture. **The `extra` query argument must start with `&`**, for example `&weather=rain`.
- `prof.mjs`: `node tools/prof.mjs [spot]`. Frame time, draw calls and triangles per spot with the limiter off. `T=0.8 node tools/prof.mjs camp` sets the time of day (default 0.45). A second argument is appended to the URL. Spots: `camp`, `summit`, `jungle`, `bridge`, `village`, `farm`, `clifftop`, `dock`, `topterrace`, `clearing`.
- `kitshot.mjs`: `node tools/kitshot.mjs "kit=tents&fn=familyTunnelTent" out.jpg`. A picture of one model on the bare stage.
- `browser.mjs`: shared helper that starts and always kills the headless Chrome. Not run directly.

**Kit previews**: `http://localhost:5173/kit.html?kit=tents&fn=tentLineup`. `kit` is a file in `src/kit/`, `fn` an exported builder. Optional `dist`, `h`, `a`, `look`, `mode`.

**Testing the story by hand (Milestone 1):** open `?play&picker` for the picker, `?play&talk=leader` (or `buddy`, `younger`, `board`) for a conversation. Without `?play`, the start screen offers Continue / New game. Progress is saved in `localStorage` key `scout-camp-island.save` (version 1; `src/story/save.js`); if storage is blocked, a session-only copy keeps Continue working until the tab closes. A New game also clears the photo album.

## 3. Working rules learned in this project

**Agent workflow**
- **Model choice:** Opus agents for hard work (engine, rendering, animation, cross-system changes), Sonnet for simple work (docs, small content, mechanical edits).
- **Light testing only:** `npx vitest run`, a page-load check with no console errors, and a few screenshots. The owner plays each milestone by hand. No new test files (the owner asked to stop; the 7 existing files cover rules only). No written implementation plans; design docs go in `docs/superpowers/specs/`.
- **Branches:** agents commit on `build`. The orchestrator fast-forwards `main` after the change is checked. At `1243c98`, `main` and `build` are the same commit.
- **Whole-file pathspec commits only:** `git commit -m "..." -- path/to/file`. A partial-hunk commit once left a broken `src/hud.js` (`5e89b90`, `ec1860d` repaired the dropped and misplaced `closeMenu` line). Never `git add -A`; name the files.
- **Verify committed JS parses** after a risky commit: `git show HEAD:<file> > /tmp/x.mjs && node --check /tmp/x.mjs`.
- **Several agents share one tree:** touch only the files of your own task; check `git status` before committing.
- **Never use `git stash`** (apply, pop or drop). `stash@{0}` exists and must not be touched (section 6). Reading it with `git stash show -p stash@{0}` is fine.

**Browser and machine**
- **One headless Chrome at a time.** Take the lock before starting a browser: `mkdir /tmp/cozy-chrome.lock` (fails if another agent has it); remove it with `rmdir` when done. The tools do not take the lock themselves.
- **Never `pkill` Chrome.** Another agent's browser may be running. Leftover browsers heated the owner's laptop in an earlier round.
- **Git-ignored folders:** `.shots/` (screenshots) and `.reference/` (the owner's private reference images; never commit or share them). Also ignored: `node_modules`, `dist`, `.superpowers`.
- **Performance budget:** at most 900 draw calls and about 1.7 M triangles in any view; the visual-fidelity design also wants 60 fps at the camp, campfire and village spots on the owner's Mac (device pixel ratio 2).
- **The owner's laptop overheats.** Keep the frame limiter on (60/s play, 30 in battery saver), and turn it off only for measuring.
- **Not played by hand:** much of this was checked by screenshots only (see section 7).

**Org rules:** INTERNAL label at the top of each doc; no PII or secrets in docs, code or commit messages. The story stores only a chosen display name, on the device.

## 4. Architecture map

Rules without Three.js are in `src/logic/` (`terrain`, `layout`, `collision`, `dayCycle`, `rng`, `time` are tested; `interact`, `villagerBrain`, `surface`, `journal`, `items`, `bag`, `belt`, `restore`, `stats`, `journey` are not). Loop and wiring are in `src/main.js`; numbers, palette and area anchors are in `src/config.js`.

| Module | What it does |
|---|---|
| `world/sky.js` | Sun, moon, painterly sky gradient, cut-paper clouds, far ridge silhouettes, aerial haze, fog, hemisphere light, sun shadow map |
| `world/toon.js` | Cel shading by rewriting three.js's shared lighting chunks (flat light bands, one shadow tone, cool shadows, olive grade, teal shade); imported first by `sky.js` |
| `world/weather.js` | Weather director (`sun`, `wind`, `rain`, `fog`), rain/wind/mist particles, falling leaves, shared wind sway (`WIND`, `windSway`), wet surfaces (`WET`, `wetSurface`), lightning; calls `audio.thunder` |
| `world/water.js` | Sea and river water shader (moved out of `island.js` in `dd9c163`): flow-mapped ripples, fresnel sky, glints, depth colour, bank foam, wakes, beach swash, rain rings |
| `finish.js` | Finishing pass for Graphics High: multisampled half-float target, bloom on bright things only, depth of field (films and the camera), `markGlow`, `probeFocus` |
| `world/ao.js` | Baked contact shading (`bakeAO` attribute) and the glow tag for the bloom, by rewriting lit shaders once at import |
| `world/contact.js` | Soft contact-shadow blobs: fixed under solid things, moving under people. Two draw calls |
| `world/particles.js` | V2: pooled shader particles. Bursts (dust, spray, drops, sparks, campfire smoke), pollen and fireflies, butterflies, bird flocks, Low-graphics halos. Five draw calls |
| `world/react.js` | V3: bushes and ferns part round people, loose pebbles/cones/mugs/sticks get kicked, bunting, washing line, lanterns and bell rope swing as damped pendulums, tent cloth ripples |
| `cutscene.js` | Film director and shot format (section 5) |
| `world/flames.js`, `world/props.js` | Shader fire; lamps, campfires, flag, seats, bell (with pull rope), telescope. Night shadow cubes on the `NEAR_CASTERS` layer (5) |
| `world/shadowProxy.js` | Every shadow map (sun/moon, bonfire cube, nearest-lamp cube) is redrawn every picture; still casters within 50 m are welded per 10 m cell into shadow-only meshes (layer 6 for the sun, 5 for the cubes) and cast nothing themselves while welded. Anything that moves more than 1.5 cm, reshapes or hides casts live again |
| `world/buildings.js`, `world/zipDoor.js`, `kit/tents.js` | Walk-in tents, beds, doors with zip-door animation; tent models |
| `actors/figure.js` | One skinned body per person: FK walk/run, ground sit, fidgets, glances, `setGround` |
| `actors/player.js` | Player movement, collisions, set-off and stop, hop, backpack and cap |
| `actors/schedule.js`, `actors/campLife.js` | Seven-block camp timetable, `crowd.drive()`, `crowd.join`, activity groups |
| `story/*` | Story system (section 5) |
| `photo.js`, `photoHud.js` | Digital camera and its LCD overlay; `story/album.js` stores photos; `world/photoBoard.js` pins prints |
| `scope.js` | Telescope view (3x to 12x) |
| `logic/restore.js`, `world/litter.js` | Restoration rules (`areaHealth`) and litter/birdhouse meshes |
| `logic/belt.js` | Quick bar slot rules (keys 1-8) |
| `audio.js`, `ambience.js` | All synthesised sound; area blend director (section 5) |
| `hud.js` | HUD: calm-HUD fading, reward cards, paper map, line icons, journal, backpack, pause menu |
| `world/areas/*.js` | One file per area, `create(scene, deps)`, list `AREA_LIST` in `main.js`. New since last refresh: `riverside.js` and `fishing.js` (dock and fishers), `lifeguard.js` (guard tower), `storyCast.js` (story people, notice board, glowing specks) |

Other: `world/village.js`, `world/campProps.js`, `world/pond.js`, `world/zipline.js`, `world/build.js`, `world/scatter.js`, `flora.js`, `wilds.js`, `ground.js`, `island.js`, `effects.js`, `camera.js`, `input.js`.

## 5. What was done since the last refresh (from `git log d366eed..HEAD`)

### Story system (`src/story/*`)
Design: `docs/superpowers/specs/2026-11-17-story-quests-design.md` (draft `fabdc77`, owner decisions `6d5e844`, `a8c574f`, built-in-milestones `b2402a8`). Approach: the story is built one milestone at a time, the owner playtests each before the next starts; later milestones add the village cast, Chapter 2, more puzzles and side-quest templates, a chapter at a time (design section 10, decision 6).
- **Milestone 1 (done in code, `67ab187`, `ac81d76`; owner playtest not confirmed in git, ASSUMPTION: pending):** engine, saving, picker, conversation screen, Journal Quests / Notes / Field guide / People tabs, Chapter 1 "New scout" with the camp leader (Chief Sari), buddy (Bayu) and younger scout (Tia), the notice board, glowing specks on the beach after the Chapter 1 storm, and one sample sequence puzzle (reef knot).
- Files: `engine.js` (pure logic: flags, quests and stages, friendship, gear, badges, notes, field guide, answer-order puzzles; conditions and effects are short strings), `save.js`, `characters.js`, `clues.js`, `quests.js` (Chapters 1 and 2 data, templates, gear, badges), `gates.js` (night, low tide, clear weather; tide is a 12.42 h rhythm that slips about 50 min a day; nothing in the water moves yet), `fieldGuide.js` (entries filled by game events or a camera photo), `ui.js` (paper-and-notebook screens; answers on keys 1-4 or click), `runtime.js` (conversation camera, game time paused in talk, waiting/sleeping until a gate opens, quest card and waypoint, picker, autosave), `content.js` (gathers everything), `dialogue/camp.js`, `dialogue/things.js`, `album.js` (photo album, own storage slot).
- `story/next/chapter2.js` and `story/next/village.js`: drafted Milestone 2 content (Chapter 2 "Across the river", village cast Wulan, Darto, Lestari, Nina, Adi, side-quest templates), **not wired in**. The header of `chapter2.js` lists the switch-on steps.
- Other story-adjacent fixes: Continue starts at camp if the saved spot has no ground, e.g. the ferry deck (`5d98732`). First aid now happens inside the medical tent (`fc8e066`).

### Visual milestones (design: `docs/superpowers/specs/2026-11-17-visual-fidelity-design.md`, commit `63206d3`)
Owner chose approach C: baked/instanced effects as the base plus one light finishing pass. Build order V1, V6, V2, V3, V4, V5, each owner-tested before the next. Anti-goals: losing the flat Trail look, frame drops, blurry edges, effects that cannot be switched off.
- **V1 shadows, edges, glow (done):** `src/finish.js` (multisampled target, bloom only on bright things), `src/world/ao.js` (baked AO, glow tag, `ba1da51`), `src/world/contact.js` (soft blobs), softer sun-shadow edges within PCF (`9da103e`; PCFSoft blanks the ground in this three.js build, see `sky.js`), **Graphics High / Low** in the pause menu (`b6c8051`): High draws up to device ratio 2 through the finishing pass, Low draws straight at ratio up to 1.5 with additive halos instead of bloom. Saved in `localStorage` like the battery saver; `?graphics=` overrides.
- **V6 cinematic cutscenes (done):** no letterbox bars; `src/cutscene.js` shot format `{ move, dur, title, sub, place, ... }` with moves `orbit` (default, every old shot), `crane`, `push`, `dolly`, `ots`; common fields `fov`/`fov1`, `drift`, `blend`, `focus`/`focus1`/`rack`, `aperture`, `place` (`lower-left` ... `center`); points may be functions for moving subjects (`580510e`, `8462380`). Depth of field: half-size bokeh gather from the scene's depth texture, High only (`84cc4b6`). The 13 titled shots were retuned (`4cfa6d2`). **Films play only on intent** (`1243c98`): joining a camp activity with F, or using the flag; no auto-play on schedule or first visit. Schedule blocks show a gentle toast; cliff and summit use discovery cards. Space, Enter, Esc or E skips a film.
- **V2 particles (done, `e239d43`):** `src/world/particles.js`, one pooled shader pass per kind (five draws); dust from feet, spray, drops, campfire sparks, pollen, fireflies, butterflies, bird flocks that scatter when you run at them. Campfire smoke joined the shared burst pool (`7899037`, one draw, no per-puff meshes). `?noparticles` switches it off.
- **V3 reacting world (done, `5b87908`, `d8823eb`, `35c86d0`, `24c7c16`):** `src/world/react.js` (see section 4); lily pads pushed by ducks and the player; people glance at the scout and shift weight when idle. `?noreact` (`90bcb02`).
- **Trail look, stage 1 (`c911a88`) and stage 2 (`0fb8eba`, `4c2029a`, `4529f5e`):** painterly sky and cut-paper clouds, aerial haze, gentle cel shading; then lower default camera pitch (13 degrees), fewer bigger clouds, two hazy far-ridge layers, bluer daytime haze, sun-dried gold patches in open grass, olive grade and teal shade in `toon.js`, warm-top/cool-belly gradient on canopies and far lumps, gradient in baked AO and chipped edges on chunky `box()` props. The stash `stash@{0}` is the older paused version of this work (section 6).
- **Left: V4 and V5.** V4 "things to use with E" (skip a stone, bell and chimes, fill the flask at the tap, pet cat/goat, feed ducks, crates, rope swing, jetty fishing, stargaze, add a log and roast a marshmallow) is being built by another agent right now, not in git yet. V5 detailed objects (lashings, plank grain, cloth folds, small clusters round trees, LOD) is not started.

### Research doc and its top-10 (`docs/research/2026-11-17-trail-alba-style-research.md`, `b71472b`)
Status from commits (items 6 and 10 are partial; ASSUMPTION: partial means the commit text covers part of the item):
1. Warm ground, cool foliage: done (`4c2029a`).
2. Calm HUD: done (`514eced`).
3. More sky and vista: done (`0fb8eba`).
4. Biome soundscape with visible birds plus music stingers: done (`3cc1434`, `163a534`).
5. Wildlife camera loop: done (`3041216`).
6. Simplify tree canopies at mid range: partial (canopy and far-lump gradient in `4c2029a`).
7. Stepped blue distance layers: done (`0fb8eba`).
8. Restoration: done (`fcf3245`).
9. Discovery beat (chime, card, camera nudge): done (`514eced`, `rewardBump` in `main.js`).
10. Gradient and chipped-edge pass: partial (`4529f5e`; clumped plants along straight runs not seen in git).

### Sound (`src/audio.js`, `src/ambience.js`; `3cc1434`, `163a534`)
Everything is synthesised with Web Audio; nothing may throw if audio is unavailable. `ambience.js` blends areas from the player's position (`areaWeights`: camp, jungle, water [river, pond, lake], waterfall, beach, village, hill), updates four times a second, makes visible flocks and gulls sing from where they are, and fires cues. Beds: camp chatter and kids, jungle insects and calls, water and frogs, village roosters, chickens and chimes, wind on high ground, night crickets and owls, dawn chorus. Music cues are short pentatonic phrases: `title`, `discover`, `quest`, `badge`, `dawn` (at sunrise), `evening` (campfire block starts); old sound names `rank` and `discover` map to cues. Places the player has cleaned (`areaHealth`) can enrich the ambience. There is still no looping music.

### Camera, field guide, camp board, restoration, quick bar
- **Digital camera** (`3041216`, `2d7ea13`, `15b254c`, `9c11736`, `836bb83`): slot 4 on the quick bar. View glides to the scout's eyes (0.5 s), viewfinder overlay (`photoHud.js`, mirrorless-LCD style: mode, drive, shots, segmented battery, live histogram, AF point that pulses green on lock, subject outline with name, level line, zoom bar, G toggles the grid). Aim with mouse drag, free look or W A S D / arrows; zoom 1x to 4x with scroll or + / -; Space or click shoots (shutter, flash, little print); E or Esc puts it away (Esc sets `quietRelock`). Autofocus uses a GPU depth probe with a ~0.3 s focus pull; shallow focus only when something is inside the focus box; Low keeps a cheap 14-tap gather. A photo of an animal adds its field-guide entry with a graded 1 to 3 star thumbnail; the best per animal is kept in the album (`story/album.js`, small JPEGs, never leaves the device).
- **Field guide:** Journal page, entries from `story/fieldGuide.js` (what it eats, where it lives, how to behave, a fact, a call you can play).
- **Camp board:** up to four prints pinned on the notice board by the HQ tent, newest on top (`world/photoBoard.js`).
- **Restoration** (`fcf3245`; `logic/restore.js`, `world/litter.js`): litter at the beach camp, the river bank by the dock and the jungle edge, plus a broken birdhouse to mend there; slot 5 is the litter bag. Each place has `areaHealth` 0 to 1; as it rises, more bird flocks and butterflies (up to 16) return, and ambience can read it.
- **Quick bar keys 1-8** (`logic/belt.js`): fixed tool slots 1 flask, 2 torch, 3 bugle, 4 camera, 5 litter bag (an empty slot keeps its place), 6-8 the first other things in the backpack. **Backpack grid follows the quick-bar slot order**, with ghost cells for tools you do not have yet (`ca2fe6b`). Glossy 3D-style flask, camera and litter-bag icons.

### World places
- **Riverside dock and fishers** (`5793588`, `world/areas/fishing.js`): walkable jetty on the camp bank above the bridge (`AREAS.fishingDock`), bench, rods, bucket, tackle box. Three scouts on the camp timetable fish in lesson and free-time blocks, walk the trails to and from it, and the bobber dips and a small fish flicks out now and then. Riverbank ground fix `0457574`.
- **Guard tower** (`185aa36`, `87e5109`, `7967081`, `b71cdca`; `world/areas/lifeguard.js`, tower at `TOWER = { x: -5, z: 24 }`, west of the big fire): a heavy 12 m timber lookout. E at the foot of the caged ladder climbs rung by rung (you are shown climbing), a hatch leads into the cabin, a door to the balcony, a telescope on the rail (`scope.js`: 3x to 12x, glides in, weighty aim with sway, names what is under the crosshair with its distance, first sightings noted; `8103a88`), a searchlight whose beam sweeps the camp at night (orientation and fade fixed in `b71cdca`), a siren and a flag. E at the hatch climbs back down. The lifeguard sits at the front window by day. Cabin and balcony floors are platforms only while you are up there.
- **First aid** now happens inside the medical tent (`fc8e066`). **Tents:** bigger family tunnel tent with beds inside, large staff geodesic (`e613efd`), zip doors that roll up (`589d3a3`); the tent work from the previous handoff is committed.
- **Water and wind:** realistic river and beach water (`8666c65`); wind as straight streaks at treetop height with CPU-integrated glide, gentler tree sway, falling leaves (`c291597`, `fd1dd01`, `554580d`); rain fixes and wet footsteps (`f63884c`).

### Menus, controls and HUD
- **Pause menu** (`6bf2451`, `8a0af5c`, `8d6a47d`): two panels side by side. Game: Resume, Day speed, Time of day, **Weather** (Auto, Sunny, Windy, Rainy, Foggy), Controls. Settings: guide, films, battery saver, free look, sound, Graphics High/Low. Controls opens a keys panel with Back. Arrow keys move the highlight and switch panel, A/D change a value, Enter picks.
- **Tab and Esc:** Tab opens the menu, steps back out of the Controls panel first, then closes it; with the bag, journal or map open it closes that instead (`aefa0ca`). Esc closes the menu, else the bag, journal or map, else opens the menu (`4a3a6b5`, `89f0b47`). In the camera or telescope, Esc or E leaves. Leaving the window pauses the game.
- **Pointer-lock rules** (`src/main.js`, "Free look"): the menu, journal, map and bag release the mouse; Esc releases the lock before the game sees the key, so `pointerlockchange` handles it (close what is open, else pause), with a 200 ms de-duplication so the same press is not handled twice. **Esc cannot take the lock back (it is not a user gesture)**, but other keydowns can: after leaving the camera or telescope with Esc, the first W A S D, arrow, Space or Shift keydown re-locks quietly (no banner); a mouse press re-locks and is swallowed so it does nothing else; Esc keyup also retries. Closing the menu with Tab re-locks at once because Tab runs inside the keydown.
- **Calm HUD** (`514eced`): hints fade once learned, stat icons show pips, rank/clock/weather and the toolbar and quick bar fade when idle and wake on keys (B J M C N, Esc, Tab, T) or while Alt is held. **Reward cards:** a paper card slides in for each find, its title fills in like ink and a stamp lands (at most three on screen), with a small camera nudge.
- **Paper map:** folded paper look, deckled sheet, creases, printed styling (`af9b064`).
- **F (join in)** is offered and accepted only near the activity's spot (`571ccc4`).

### Animation (`actors/figure.js`, `config.js`)
- **Gait:** `WALK_SPEED` 1.95 m/s (0.6 m steps, about 3.2 a second; it was 1.5, then 2.1 in `661f980`, then slower and longer-striding in `a15c5ad`), `RUN_SPEED` 3.9. Both arms go up in a hop. **NPCs choose their gait from real ground speed**, blending walk to run over 2.4 to 3.0 m/s whatever their leg length (`2d04622`).
- **Ground sit:** real cross-legged pose for everyone, eased down and up (`9c4daeb`).
- **Backpack:** footstep jolt, wobble and roll when running (`6ded6a1`), made gentler and following the torso's waddle (`d2f679f`).

## 6. Current state

**Branches.** `main` and `build` are both at `1243c98` (fast-forward done). Working tree is clean at the time of writing, except that another agent (V4) is editing code in the same tree, which may show as uncommitted changes.

**Tests.** `npx vitest run`: 7 files, 50 tests, all pass (checked at `1243c98`). The tree-count failure from the previous handoff is gone with the tent work committed.

**Stash `stash@{0}`: "On build: trail-look WIP (paused agent, restore before resuming)"** is still present (checked with `git stash list`). Stat: `src/config.js`, `src/logic/dayCycle.js`, `src/world/ground.js`, `src/world/island.js`, `src/world/sky.js` (89 insertions, 58 deletions). ASSUMPTION: superseded by Trail look stages 1 and 2 (`c911a88`, `0fb8eba`, `4c2029a`, `4529f5e`), which are committed; nothing was checked for leftover wanted hunks. Inspect with `git stash show -p stash@{0}` only; do not pop, apply or drop without the owner's say-so.

**Performance pass (2026-11-17, `tools/prof.mjs`, High, ratio 2, limiter off, median ms, better of two runs; noisy machine, ±2 ms):** camp night 14.5 -> 12.8, campfire night 15.4 -> 13.2, jungle night with torch 20.5 -> 13.1, village day 13.8 -> 12.5, beach day 16.0 -> 10.1, camp sunset facing the sun 29.6 -> 17.3. Fixes: each night light's shadow camera draws only its own caster layer (one shared layer made every cube draw everything near any light), lamp shadow cubes go to lamps outside a burning bonfire's 10 m (beside it the fire's own cube shades and its light swamps theirs), a faded-out second lamp cube is not redrawn, and 2x instead of 4x MSAA at ratio 1.75 and up. Breakdown at camp night before: all shadows about 6 ms (lamp cubes 3.2, moon 2.2, fire 1.6), bloom about 1, ratio 2 vs 1 about 7 (fill-bound). **Graphics Low** now: ratio 1, sun map 2048, bonfire cube 512, no lamp or torch shadows, half the burst particles, water detail half as far out, no finishing pass (as before): 3.5 to 8 ms at the same spots. **First run:** with no saved Graphics choice, 3 s of play are timed after a 1.2 s warm-up; a median slower than 22 ms (about 45 fps) switches to Low once, saves it and shows a tip (`src/perf.js`, `graphicsChecked` in localStorage).

**Older performance numbers (reported by the lead and agents; NOT in git commit messages and not re-measured for this refresh, so unverified):** camp about 11 ms per frame, village about 11 to 13 ms, **campfire at night about 16.9 to 17.5 ms, just over the 16.7 ms line for 60 fps**. Earlier measured views (from the previous handoff, before the visual milestones): camp 581 draw calls, dock about 855, under the 900 budget; the visual-fidelity design lists camp at about 444 calls and about 10 ms. Draw calls and triangles are the stable figure; ms numbers varied by up to 2 ms between runs. Re-measure with `tools/prof.mjs` (take the Chrome lock first).

## 7. Known issues and next steps

**Next steps, in order:**

1. **V4 things to use with E** (in progress by another agent; see section 5). Value: more to do in the world. Proof: each new interaction works with a real key press, `prof.mjs` stays inside the budget.
2. **V5 detailed objects** (lashings, plank grain, cloth folds, clusters round trees, near-player LOD), within the budget and the Trail look.
3. **Story Milestone 2:** wire in `src/story/next/` (village cast, Chapter 2, side-quest templates, village badges; steps are in the header of `next/chapter2.js`), after the owner has played Milestone 1. Later chapters follow design section 7.
4. **Campfire-night performance:** about 17 ms against a 16.7 ms line. ASSUMPTION: the cost is the night shadow cube for the bonfire plus the finishing pass at ratio 2; profile with `T=0.8 node tools/prof.mjs camp` and try `?graphics=low`, `?noparticles`, `?noreact` to split the cost before changing anything.
5. **Research leftovers:** simplify tree canopies at mid range (item 6), clumped plants along straight runs (item 10).
6. **Older open items:** grass is thinner across the river (`flora.js`); rain splash rings may appear at the player's height (ASSUMPTION: ring height uses the player's y, check `weather.js`); weather is not saved (ASSUMPTION: re-rolls on load); no breath puffs in cold weather; tent spacing polish (`layout.js`).
7. **Music:** there are only short stingers and ambience beds, no looping music.

**Known gaps and unverified items:**

- No unverified-item list appears in the recent commit messages; this list is from the code and the owner's earlier rules. ASSUMPTION: nothing from this session was played by hand by the owner yet.
- Not played by hand (all earlier items still stand): free look, sleeping, joining in, sitting, speech bubbles, sound and the new ambience, frame rate on the owner's Retina screen, greeting locals and petting farm animals; new since: the camera (focus, HUD), telescope, guard tower climb, fishing dock, restoration, quest conversations, pointer-lock re-lock after Esc in a real browser, Graphics Low versus High on the real machine.
- No tests for anything added after the owner said to stop writing tests (interaction, scouts, timetable, surfaces, sound, story engine, restoration).
- People do not step aside for each other; scouts can walk through closed tent flaps at bedtime.
- The six flying fox riders ignore the timetable and wait on the summit overnight.
- The camera can be blocked by trunks and canopies in the jungle.
- Some label lines on the paper map may cross (from an earlier round; the map was redrawn since, not rechecked).

Design history: `docs/superpowers/specs/` (five dated design files for the original game, bigger island, heat and speed, living village, look and feel; plus `2026-11-17-story-quests-design.md` and `2026-11-17-visual-fidelity-design.md`). The original plan in `docs/superpowers/plans/` is finished and out of date. Research: `docs/research/2026-11-17-trail-alba-style-research.md`.
