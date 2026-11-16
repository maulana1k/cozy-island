INTERNAL

# Bigger island: design

Date: 2026-11-16. Third of four agreed projects (heat and speed, look and feel are done; badges, tools and quests follow; music and sound effects come last of all).

## Why

The owner wants the world to feel like a place where real scouting happens: more kinds of terrain (rock cliffs, a river, a local village, a village farm, a ship dock where students arrive, more animals). The owner chose island shape "C": a river down the middle, the scouts' side and the locals' side, joined by bridges, with a lake and waterfall.

This project builds the places. It adds no quests, badges or tools: those are the next project and will be designed on top of the finished island.

## Goals

- A bit over twice today's walkable land (the first sketch said three times; a reviewer showed that much land could not be kept full), with five clearly different areas, each worth walking to.
- Everything already in the game stays where it is and keeps working.
- The game runs no hotter than today.

## Non-goals

- Badges, missions, quest givers, new tools (binoculars, compass, rope, raft you steer).
- Music and sound effects beyond reusing sounds the game already makes.
- New mechanics for the player other than crossing water by bridge and stepping stones, and climbing the cliff path on foot.

## Anti-goals

- Moving or breaking the existing camp, hill trail, flying fox, timetable or jungle limit.
- Empty land. Density matters more than size: no stretch of more than about 25 m without something to look at or do.
- Any view costing more than 900 draw calls, or people or animals appearing in water or inside rock.
- Recreating places or characters from any existing game.

## Constraints

- Three.js 0.187, Vite, plain JavaScript, everything built in code, no downloaded assets.
- No new test files (owner's request). The 50 existing tests must pass; several of them test `src/logic/terrain.js` and `src/logic/layout.js`.
- Local git; work on `build`; fast-forward `main` when a step is checked.
- Style: flat, warm, simple scenery; only people are detailed.
- Measure with `node tools/prof.mjs` (dev server running). Draw calls are the stable figure; frame times vary by up to 2 ms between runs.

## How the world works today (what the builder needs to know)

- Units are metres. East is +x, south is +z. The camp island is a round of radius 60 at the origin (`ISLAND_RADIUS`), grass inside 48. The hill is at (-18, -22). The wild jungle is a second round, centre (-207, -253), radius 300, to the north-west; `melt()` in `src/logic/terrain.js` joins the two coastlines with a smooth minimum, and `landR(x, z)` is "how far from the middle, on the camp island's scale" (under 60 is land).
- `heightAt(x, z)` is the ground everywhere; sea level is y = 0 and one large water plane is drawn at that level (`src/world/island.js`). The player cannot wade deeper than 0.45 m (`MAX_WADE_DEPTH`, `constrainToShore`).
- The camp's ground mesh covers about ±85 m. Beyond that, `src/world/wilds.js` streams 48 m ground tiles wherever there is land and fills them with jungle according to `wildness(x, z)`; it shows real trees within 58 m and single lumps beyond, out to 230 m.
- Raised walkable things (the dock, tent floors, steps) are hardcoded one by one in `groundAt` and `platformAt` in `src/logic/layout.js`; there is no general list. `surface.js` only names the kind of ground underfoot.
- The sea shader in `src/world/island.js` (`uShore`, `uWild`, `uBlend`) and the paper map in `src/hud.js` each hardcode the two rounds of land for shore colour, foam and outline.
- The jungle rules are radial: `wildDepth` and `wildness` treat anything far from the origin on the jungle side as jungle, and the turn-back in `src/main.js` clamps the player to 82.5 m from the origin. Most of the new land would count as jungle under those rules.
- A test (`sea floor is deep`) needs the bed at (75, 0) to stay below -2 m, so new land must not shallow the sea there.
- Tile ground has a vertex every 4 m, too coarse for river banks and rock ledges.
- Today's dock runs east out to sea from about (53, 17). A lighthouse-style tower stands at (46.5, 8.2), a guard post at (44, 11), a farm shed at (33, 27) with a small field at (26.5, 31.5), a windmill on a knoll at (30, -22) and a sheep meadow at (23.5, -17).
- Past 70 m from the camp's middle on the jungle side the player gets a warning, and is turned back 12 m further (`WILD.border`, `WILD.limit`, handled in `src/main.js`).

## Approaches considered

1. **Add land beside the camp and carve a river between them.** Chosen. The camp, hill and jungle keep their coordinates. Lowest risk; nothing already tested moves.
2. **Redraw the island from a painted height map.** Rejected: every placed thing would need re-placing and re-checking for no visible gain.
3. **A separate island reached by boat.** Rejected: the owner has already refused separate landmasses, and it loses the bridges.

## Design

### 1. The shape of the land

Coordinates are approximate. A reviewer probed the terrain and found my first anchor points did not fit (the lake site was open sea and the gap between the lands was 14 to 24 m), so the foundation builder fixes exact positions by probing `heightAt` and `landR`, within these rules. The camp does not move.

| Thing | Where | Rules |
|---|---|---|
| Locals' land | a third round north-east of camp, radius about 60 to 65, centre roughly (125, -75) | Placed so the channel between it and today's coast is river-width. Low and rolling, 1 to 3 m, with one rise for the village. It must not change the sea bed at (75, 0). |
| Rock massif and cliffs | new raised rock land closing the channel's northern end, joining the jungle coast to the locals' land | 10 to 14 m high, grey-brown stone, stepped ledges. This is what makes the channel a river and not a strait. Behind it the land runs on into jungle. |
| Lake | the widened head of the channel, under the cliff face, about 25 m across | A waterfall drops from the cliff top into it. |
| River | from the lake to the sea; mouth on the east coast north of today's dock and tower, clear of them | 9 to 14 m wide, winding. Too deep to wade in the middle (bed about 1.2 m down), shallow at the edges. Its surface is the existing sea plane. A moving-streak strip makes it read as flowing. |
| Riverside path | along the camp-side bank from the windmill knoll north to the lake and the foot of the cliffs | So the lake and cliffs can be reached from camp without crossing. About 15 m of safe ground either side of the path. |
| Cliff path | a switchback at the hill trail's gentle grade from the lake shore to a ledge lookout at the top beside the fall | Walkable on foot. |
| Bridges | two | A plank-and-rope bridge at the camp end, on the line from camp to the village. Stepping stones across a shallow stretch near the lake. |
| Local village, farm | on the locals' land | See section 3. |
| Ship dock | today's dock, rebuilt longer and wider | See section 4. |
| Deep jungle | unchanged in feel | See the rules below. |

Rules that replace today's radial jungle logic:

- **Safe ground is a list of shapes** (the camp round, the locals' round, the riverside path corridor, the lake shore, the cliff path and lookout). `wildDepth` becomes "how far outside safe ground, on jungle land". The warning starts where it does today relative to the camp (about 10 m past the camp-side boundary) and at the edge of the other safe shapes; the hard stop is 12 m further, as now.
- **Turn-back walks the player to the nearest safe ground**, not toward the origin.
- **`wildness` is 0 on the locals' land** and falls off across the riverside corridor, so jungle does not grow on the village or the path. Jungle still surrounds the cliffs and backs the massif.
- **Behind the cliffs and along the back of the locals' land where it meets the massif**, the rock face is too steep to walk; where jungle touches safe ground the ordinary warning applies.
- The far edge of the locals' land is ordinary coast: beach, then sea too deep to wade.
- **Walkable platforms become a small general list** (`platforms` in `layout.js`: a shape, a top height, a surface name) that `groundAt` and `platformAt` consult, so bridges, stepping stones, the gangway and the jetty register themselves without each being hardcoded.
- **The sea shader and the paper map must know the whole coastline.** The builder chooses how (a third round in the same maths, or a small baked land texture both can sample); the shore colour, foam and map outline must be right along the new coast, and the river banks must not show sea foam.
- **Finer ground where it matters.** River banks, the lake shore and the cliffs need vertices closer than 4 m (a finer tile setting there, or a dedicated mesh).

### 2. Drawing the new land

- Ground: reuse the tile streaming in `wilds.js` for ground beyond the camp mesh; it already builds a tile wherever there is land. Rename or generalise as needed so "tile" no longer implies jungle.
- Colours by area: village earth and paths, farm green and paddy water, river banks sandy, cliff rock.
- Plants on the locals' side: scattered palms, fruit trees and bushes, far sparser than the jungle, using the existing instanced pools and the same near/far trick (real within 58 m, lumps beyond).
- Everything static in an area is welded with `mergeStatic` and hidden or simplified past about 60 m, as buildings and animals already are.

### 3. The locals' side

**Village** (about 8 homes): wooden houses on short stilts with thatched or tiled roofs, built from the existing helpers so they pick up the sagging roofs and leaning posts. The village sits on the bridge side of the locals' land. A small square with a well and a big shade tree, a market stall with baskets of fruit and fish, a prayer or meeting hall, washing lines, a fishing jetty on the far shore with two small boats, paths between everything. Houses are scenery: no interiors.

**Farm**: it fills the outer ring of the locals' land so no part is empty: paddies to the east and south, the orchard to the north, the jetty on the far shore. Stepped paddy fields with shallow water and green shoots, a vegetable plot, a fruit orchard (trees you can shake, as elsewhere), a goat pen, a duck pond linked to the river, a hay shelter, a scarecrow, a buffalo wallow.

**People**: about 10 locals, adults and a few children, in everyday clothes rather than uniform (use `createFigure` with other colours and no neckerchief). They follow a simple daily round of their own: farm work in the morning, market at midday, home at dusk, indoors (hidden) at night. They greet the player with the existing "say hello" interaction and a few lines of their own. Reuse the existing movers; do not write a new one.

### 4. The ship dock and arriving

- Rebuild today's dock on the same line, about twice as long and wider, with bollards, crates, a signboard and lamp posts. Keep the existing "end of the dock" discovery.
- A passenger ship (a simple wooden ferry about 14 m long with a cabin, funnel or mast, and a gangway) is moored there from the start of a journey until dusk on day 1, then gone (the journey starts after midday, so "morning only" would never be seen). "Explore freely" has no ship.
- **Arrival**: "Start the journey" now begins with the scout standing on the ship's gangway at the dock, and the opening film shows the ship at the dock before handing over. "Explore freely" still starts in camp. The journey's first step ("arrive" at the flagpole) still works from the new start.

### 5. More animals

Add up to six kinds, each tied to a place, in the same rounded simple style as today's animals, with a gait and one or two habits each, small parts casting no shadow, hidden past 65 m:

- Ducks on the river and the duck pond (paddle, upend, waddle ashore).
- Goats in the pen (wander, butt heads, bleat when petted).
- A water buffalo in the wallow (chews, flicks ears, can be petted).
- Monkeys in the trees by the cliffs (sit, scratch, scamper off when approached).
- A heron or egrets in the paddies (stand, stalk, fly off).
- Butterflies over the meadow and farm; fish that jump in the lake.

Each pettable or shoo-able animal is an interactable like today's sheep and chickens.

### 6. Places, map and guide

- New discoverable places for the journal (river, bridge, lake, waterfall, cliff top, village square, market, farm, jetty), added the same way existing places are.
- The map (press M) is redrawn to cover the whole island with the river, lake and locals' land; the jungle label stays.
- First-visit tips for the bridge ("the river is too deep to wade: use the bridge or the stepping stones") and the cliff path.
- A short film the first time the player reaches the cliff top, like the existing summit film.

### 7. Performance budget

- Any spot: 900 draw calls or fewer. Camp centre stays at or under 650.
- Triangles in any view no more than about 1.7 million (today's worst is about 1.5 million in the jungle).
- Check from: camp centre, summit, the jungle spot, the bridge, the village square, the farm, the cliff top, the dock. Add the new spots to `tools/prof.mjs`.

## Build order, and what can be built in parallel

**Step 1, foundation (one builder, first).** Terrain: the third round, the rock massif, the river bed, the lake, the riverside and cliff paths; safe-ground shapes with the new `wildDepth`, `wildness` and turn-back; the general platform list; ground colours and finer ground at banks and cliffs; tile streaming for the new land; the sea shader and the map knowing the new coast; bridges and stepping stones as walkable platforms (plain models). A small area interface: each area is its own new file under `src/world/areas/` exporting `create(scene, deps)` and returning `{ interactables, colliders, update(dt, elapsed, player, night) }`, registered in one list in `src/main.js`, with its anchor points in `src/config.js`. After this step the player can walk the whole empty island.

**Step 2, areas (independent of each other, can be built at the same time, each in its own new files):**

- River look, waterfall, lake, bridge and stepping-stone models.
- Cliffs: rock face, ledges, lookout, monkeys.
- Village: houses, square, market, jetty, locals and their day.
- Farm: paddies, orchard, pens, farm animals.
- Dock and ship, and the arrival start.
- Ducks, herons, butterflies, fish.

Area builders must not edit shared files other than adding their one line to the area list; anything they need from terrain or layout they ask of the foundation.

**Step 3, joining up (one builder).** Places, tips, the cliff film, journal entries, performance pass, screenshots of every area by day and night, handoff notes.

## Who builds

The owner's instruction: the main session designs and orchestrates; building is delegated to subagents on Opus. Step 1 goes to one agent. Step 2's areas go to agents working at the same time, each in its own new files. The main session integrates, checks on screen, measures and reports.

## Left to the builder

- Exact coordinates, sizes, colours and counts, within the table above.
- Exact shapes of the safe ground, and how the coastline is given to the sea shader and map.
- How locals' daily round is driven, as long as it reuses an existing mover.
- Which of the six animal kinds to drop if the budget is tight (keep ducks, goats and the buffalo).

## How it will be checked

- The 50 existing tests pass.
- `node tools/prof.mjs` at the eight spots, table in `docs/HANDOFF.md`.
- Headless screenshots of each area, by day and at night, looked at by the builder.
- A scripted walk: camp to bridge to village to farm to stepping stones to lake to cliff top and back, confirming no warning fires, the player never sinks or floats, and the river cannot be waded.
- The owner plays and says what feels empty or wrong.
