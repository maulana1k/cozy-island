INTERNAL

# Fishing waterfront (Milestone M2a): draft plan

Date: 2026-11-17. Status: layout approved by the owner; build next session. Part of Milestone 2 (M2a = the place, M2b = the Chapter 2 story set there). Decisions recorded in docs/superpowers/specs/2026-11-17-story-quests-design.md section 10, item 7.

## 1. Intent

Turn the village's ocean-facing coast into a living fishing waterfront that shows the locals' profession: a wide, gently sloping beach where boats are dragged in and out, a large and crowded fish market, a fishermen's working yard, and many painted local boats. It is the stage for Chapter 2 (Old Darto, the tide board, the tide stones) and must work with the real tide planned for M2b.

## 2. Location

The east/ocean-facing coast by the village: today a grassy strip with scattered trees sloping to a narrow sand beach, with the village fields' bamboo/wooden fence on the inland side and rocks on a point in the distance (owner screenshot, 2026-11-17). Exact coordinates, extent and the positions of the existing village jetty, fence and paths: see section 9 (filled from the scouting agent's report).

## 3. Layout (inland → sea), approved

```
 VILLAGE FENCE / path from the village ───────────────────────────
 ┌─────────────── 1. FISH MARKET (covered, crowded) ───────────────┐
 │ [stall][stall][stall]  ░ market floor ░  [stall][stall][stall]  │
 │       ice boxes · scales · baskets · lanterns · signboards      │
 └────────────────────────────┬────────────────────────────────────┘
   2. FISHERMEN'S YARD        │ path down to the sand
   net racks · repair spot    │ Darto's hut + tide board · shelter
   (hull on trestles)         │ crates · buoys · oars · nets
 ~~~~~~~~~~~~~~ grass → sand (soft, ragged edge) ~~~~~~~~~~~~~~~~~~
   3. BOAT BEACH (wide, gentle sand slope, ~15–25 m deep)
   boats pulled up on log rollers, above high tide; drag tracks
 ~~~~~~~~~~~~ wet sand (tidal band) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   4. SHALLOWS: moored boats bobbing; Darto's jetty extended;
      tide stones at the jetty foot (uncovered at low tide)
 ~~~~~~~~~~~~ open sea: boats out fishing ~~~~~~~~~~~~~~~~~~~~~~~~~
```

## 4. People (about 18, schedule-driven)

| Role | Count | Behaviour |
|---|---|---|
| Old Darto (story character) | 1 | Mends nets by his hut, reads the tide board, sits on the jetty at dusk |
| Boat crews (captain + helper) | 3 crews = 6 | Drag boats down at dawn, row/sail out, return in the afternoon, haul up |
| Net menders | 2 | Sit on the sand mending nets, chatting |
| Boat builder | 1 | Works on the hull on trestles (sand, paint) |
| Fish porters | 2 | Carry fish crates from boats to the market |
| Market sellers | 4 | Stalls: fresh fish, dried/salted fish, shellfish and crabs, ice and tools |
| Buyers | 4–6, rotating | Villagers + the camp cook buying fish for the camp kitchen |
| Kids | 2 | Play around the boats, help pull ropes |
| Animals | — | Market cats waiting for scraps; gulls over the boats |

## 5. Objects

- **Market:** bamboo/wood frame, colourful cloth and tin awnings, 6 stalls, tables with fish (several shapes/colours), ice boxes, hanging scales, baskets, buckets, crates, lanterns for the evening, painted signboards (shapes, no real text needed), gravel/dirt floor.
- **Fishermen's yard:** net-drying racks with hanging nets, a hull on trestles, crates/buoys/oars piles, rope coils, a small thatched shelter, Darto's hut with the tide board.
- **Beach:** 6–8 painted outrigger (jukung-style) boats, blue/red/yellow/green stripes, some with small sails; log rollers; drag tracks; anchors and floats.
- **Water:** 2–3 moored boats bobbing on the swell; Darto's jetty extended; the tide stones at its foot; boats out at sea.
- **Map:** "Fish market" and "Fishermen's beach" labels on the paper map.

## 6. The fishing day

| Time | What happens |
|---|---|
| Dawn (05:00–07:00) | Crews drag 3 boats down the sand and row/sail out; lanterns off |
| Morning (07:00–11:00) | Market busy and crowded: sellers calling, buyers arriving, the camp cook visits |
| Midday | Market quieter; net menders and the boat builder work; boats bob far out |
| Afternoon (14:00–17:00) | Boats return and are hauled up; porters carry crates; second, smaller market rush |
| Evening | Lanterns on, market packs up; Darto sits on the jetty |

## 7. Player activities (proposed; owner to confirm which ship with M2a vs M2b)

- Help drag a boat at dawn or in the afternoon (join the crew with F).
- Buy fish for the camp kitchen (small errand / reward).
- Sort the catch at a stall (quick matching task that teaches fish names → field guide entries).
- Photograph boats, gulls and market cats (existing digital camera).
No cutscenes (films only on intent or story).

## 8. Constraints and rules for the builder

- The Trail-like low-poly painterly look; everything built in code; no downloaded assets.
- Tide-ready (real tide arrives in M2b): slope gentle enough that ±0.4–0.6 m of sea level moves the waterline several metres; boats on the sand above high tide; moored boats float at low tide; jetty/market pilings look right at both levels.
- Keep beach waves, foam and caustics working along the new shoreline (src/world/water.js reads land/bank data).
- Soft grass→sand transition (no staircase; see commit 0457574).
- Reuse the schedule/actor system and the trail system so people walk real paths.
- Performance: ≤900 draw calls and 60 fps on High at the market in the morning; merge static props, instance repeated ones, animate the crowd fully only near the camera.
- Testing light: vitest green, page-load check, a few screenshots; the owner playtests by hand.
- Agents: Opus for the build; whole-file pathspec commits; parse-check committed JS; don't commit screenshots.

## 9. Location details (from the scouting agent, 2026-11-17)

- **Where:** the village's SOUTH shore (not the east coast), between the river mouth (64,-17) and the rocky south-east point (138..166, -30..-5). The fence in the owner's screenshot is the cart ramp's bamboo fence (src/world/areas/hamlet.js): it runs north-east from (84.0,-18.8) to (137.4,-52.5); the grass strip between fence and beach widens from ~10 m (west) to ~30 m (east).
- **Beach frame:** `AREAS.waterfront` in src/config.js, origin (112,-22) on the grass line; `s` along the coast (east +), `d` out to sea. About 49 m of full beach (s -22..27), curving back to the old coast over ~6 m at each end. Grass line (90.1,-24.2)→(138.9,-19.3); waterline (88.1,-4.3)→(136.9,0.6); depth 19.5–20.5 m.
- **Slope and tide:** sand from ~1.3 m at the grass line to 0 at the water (~0.12 m per m near the waterline). +0.5 m sea reaches d≈10; −0.5 m reaches d≈27. Bed −1.0 m at d≈32, −1.5 m at d≈36. Moored boats at d 38–44 float at low tide; pulled-up boats at d 3–9 stay above high tide.
- **Existing jetty:** the farm's fishing jetty is on the EAST coast at (179.5,-62), ~45 m north-east of the beach's east end (map label "Jetty" at (177,-62)). Decide in the build whether Darto uses it or a new jetty is added at the beach.
- **Tide stones:** lower beach in front of Darto's hut, s -18..-12, d 22–26 (about (93..99, -0.5..3)): just under water now, uncovered at −0.5 m.
- **Draft placement (to finalise in the build):** market on the level grass above the east half of the beach (centre ~(127.6,-26.5), ~23 × 11 m, six stalls in two rows on a central aisle, entrance arch at the west end); fishermen's corner on the west half (Darto's hut ~(94.7,-27.0) at the grass line, shelter, net racks and boat on trestles beside it; two launch boats at d≈6.5; moored boats d 38–44; three boats far out at sea).
- **Wiring:** build the area inside src/world/areas/hamlet.js (avoids editing main.js's AREA_LIST) unless main.js is free.
- **Work already in progress (uncommitted at the end of the 2026-11-17 session, see the session report):** beach terrain in src/config.js (`AREAS.waterfront`, `paths.beach`, `paths.market`), src/logic/terrain.js (beach measure, `beachFrame`, `beachSand`, `marketAt`, draft market pad at y 2.11), src/world/ground.js (sand on the beach, `gravel` stamp), src/world/flora.js (plants off the sand/market), and a new unused src/kit/fishing.js (jukung boat, stalls, racks, shelter, hut, tide board, gear builders).
