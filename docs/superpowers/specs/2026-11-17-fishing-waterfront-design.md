INTERNAL

# Fishing waterfront (Milestone M2a): draft plan

Date: 2026-11-17. Status: layout approved by the owner; build next session. Part of Milestone 2 (M2a = the place, M2b = the Chapter 2 story set there). Decisions recorded in docs/superpowers/specs/2026-11-17-story-quests-design.md section 10, item 7.

## 1. Intent

Turn the village's ocean-facing coast into a living fishing waterfront that shows the locals' profession: a wide, gently sloping beach where boats are dragged in and out, a large and crowded fish market, a fishermen's working yard, and many painted local boats. It is the stage for Chapter 2 (Old Darto, the tide board, the tide stones) and must work with the real tide planned for M2b.

## 2. Location

The east/ocean-facing coast by the village: today a grassy strip with scattered trees sloping to a narrow sand beach, with the village fields' bamboo/wooden fence on the inland side and rocks on a point in the distance (owner screenshot, 2026-11-17). Exact coordinates, extent and the positions of the existing village jetty, fence and paths: see section 9 (filled from the scouting agent's report).

## 3. Layout (inland → sea), approved; revised by the owner (section 10)

```
 VILLAGE FENCE / cart ramp ──────────────────────────────────────────────
   FORECOURT (concrete apron): small truck, motorbikes, drums, signboard
 ┌──────── 1. FISH AUCTION HALL (TPI) on a raised concrete slab ────────┐
 │ tables · auction crates · weighing station · ice corner · office     │
 └─────────────┬───────────────────────────────────────┬───────────────┘
   2. FISHERMEN'S YARD (west)    steps to the sand      │ PIER ramp
   Darto's hut + tide board · shelter · net racks       │
   hull on trestles · outboards on stands · bench       │ concrete pier
 ~~~~~~~~~~~ grass → sand (soft, ragged edge) ~~~~~~~~~~│~~~~~~~~~~~~~~~
   3. BOAT BEACH (wide, nearly flat, ~40 m deep)        │
   jukung + fibreglass boats on rollers above high tide │
 ~~~~~~~~~~~ wet sand (tidal band, d 25..47) ~~~~~~~~~~~│~~~~~~~~~~~~~~~
   4. SHALLOWS: Darto's jetty (traditional) to d 48;    │
      tide stones beside it; moored boats d 50..56      │
                                       ┌────── T-HEAD (d 52..57) ──────┐
 ~~~~~~~~~~ deep water (-3 m) ~~~~~~~~ kapal motor · FISH CARRIER SHIP ~~
 ~~~~~~~~~~ open sea: boats out fishing ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
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

- **Market (revised, section 10):** a modern fish auction hall (TPI): raised concrete slab with a painted edge, steps and a cart ramp; white concrete columns, open sides, corrugated blue gable roof on steel trusses with a ridge vent, gutters and an orange fascia; tiled floor with two drainage channels; eight tiled selling tables; an auction floor of blue and red crates; weighing station; ice crusher, crushed-ice heap, styrofoam and cool boxes; office with windows, tap, hose and blue drums; tube lights that glow at night (emissive only); signboards with shapes, no text; forecourt with a small truck and motorbikes.
- **Fishermen's yard:** net-drying racks, a hull on trestles, crates/buoys/oars piles, rope coils, a small thatched shelter, Darto's hut with the tide board; plus modern gear: outboards on stands, a repair workbench, blue and orange fuel drums, jerrycans.
- **Beach:** six painted jukung (some with sails) and two fibreglass outboard boats on log rollers above high tide; drag tracks; anchors and floats.
- **Water:** concrete pier with a T-head (bollards, tyre fenders, ladder, glow-only lamp posts, crates and a hand cart); a fish carrier ship and a steel kapal motor at the T-head, a fibreglass boat on its inner face; moored jukung, a fibreglass boat and a wooden kapal motor (radar dome, antennas, LED lamp rigs, net hauler, coolers, drums, jerrycans); Darto's traditional jetty; the tide stones; boats out at sea.
- **Map:** "Fish market", "Fishermen's beach" and "Pier" labels on the paper map.

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
- **Beach frame:** `AREAS.waterfront` in src/config.js, origin (112,-22) on the grass line; `s` along the coast (east +), `d` out to sea. Revised (section 10): 60 m of full beach (s -26..34), the west end curving back fast to keep the river mouth deep, the east end running into the rocky point (~70 m of sand in all). Waterline at d≈40 (39–41 along the beach).
- **Slope and tide (revised):** sand from ~1.4 m at the grass line, easing into an even fall of ~0.033 m per m, 0 at d≈40. +0.5 m sea reaches d≈25; −0.5 m reaches d≈47. Past that the bed steepens: −0.9 m at d 50, −1.8 m at d 55, −3 m from d≈58. Moored boats at d 50–56 float at low tide; pulled-up boats at d 11–20 stay above high tide.
- **Existing jetty:** the farm's fishing jetty is on the EAST coast at (179.5,-62), ~45 m north-east of the beach's east end (map label "Jetty" at (177,-62)). Decide in the build whether Darto uses it or a new jetty is added at the beach.
- **Tide stones (revised):** beside Darto's jetty, s -18..-12, d 42.5–46: just under water now, uncovered at −0.5 m. The tide board stands at the waterline, s -18.75, d 40.5.
- **Placement (revised, as built):** hall slab s 3.5..30.5, d -13..0 on a levelled pad (s 3.5..30.5, d -17..0, level ~2.4 m; slab top ~2.8 m); forecourt d -17..-13; pier at s 24.5 from the slab out to d 52, T-head s 6.5..42.5, d 52..57; fishermen's corner on the west half (Darto's hut ~(94.7,-27.0) at the grass line); two launch boats at d≈19; moored boats d 50–56; boats far out at d 95–140. The camp ferry's leaving course passes ~10 m outside the ship (d≈75–80).
- **Wiring:** build the area inside src/world/areas/hamlet.js (avoids editing main.js's AREA_LIST) unless main.js is free.
- **Work already in progress (uncommitted at the end of the 2026-11-17 session, see the session report):** beach terrain in src/config.js (`AREAS.waterfront`, `paths.beach`, `paths.market`), src/logic/terrain.js (beach measure, `beachFrame`, `beachSand`, `marketAt`, draft market pad at y 2.11), src/world/ground.js (sand on the beach, `gravel` stamp), src/world/flora.js (plants off the sand/market), and a new unused src/kit/fishing.js (jukung boat, stalls, racks, shelter, hut, tide board, gear builders).

## 10. Owner revision (modern port), 2026-11-17

The owner tested stage 1 and asked for a more modern Indonesian fishing port. Decisions, as built (commits 5220b77, 9b83da3, 5c5e2db):

1. **Market → modern fish auction hall (TPI)** replacing the bamboo stalls: raised concrete slab (0.42 m, painted edge, steps west, seaward and inland, a cart ramp to the forecourt), white concrete columns, open sides, corrugated gable roof with ridge vent, gutters and fascia, tiled floor with drains, tiled tables, auction crates, weighing station, ice corner, office with tap and hose, tube lights (emissive only), shape-only signboards, a forecourt with a truck and motorbikes. Kit: src/kit/port.js.
2. **Beach wider and nearly flat:** ~0.033 m rise per m, 40 m from grass to water, 60 m of full width (s -26..34). The beach's height is read off its own coast measure, so the sea shader's waterline, foam and swash stay on the sand's zero; the sea's land map now reaches z 74. ±0.5 m of tide moves the waterline from d≈25 to d≈47.
3. **Concrete pier and ship:** pier from the hall slab to a T-head at d 52..57 (deck 1.85 m; bed -1.7 to -3 m, so at -0.5 m tide 1.2–2.5 m of water), with bollards, tyre fenders, a ladder, glow-only lamps, crates and a hand cart. A ~23 m fish carrier ship (painted waterline, wheelhouse, mast with radar and lights, crane, hatches, insulated containers, crates) lies on the T-head's seaward face (draft 1.5 m over a -3 m bed) and bobs with a cheap transform.
4. **Boats, traditional and modern:** six jukung and two fibreglass outboard boats on the sand; moored jukung (2), fibreglass (1) and a wooden kapal motor; at the pier a steel kapal motor and a fibreglass boat; modern gear on them (radar/GPS domes, antennas, LED lamp rigs, net hauler, coolers, drums, jerrycans).
5. **Darto's jetty kept** as the traditional jetty by his hut (contrast with the concrete pier), lengthened from 24 m to 40 m (d 8..48) so its end still has water at low tide. The yard keeps the hut, tide board, shelter and racks and adds outboards on stands, a repair bench and fuel drums.
6. **Stage 2 anchors** (`WATERFRONT_SPOTS`): table sellers and buyers, auctioneer and auction crowd, weigher, ice worker, clerk, porters (boats → hall, hall → pier → ship gangway), launch lines, pier crews, menders, builder, mechanic, Darto, cats, gulls; walking network nodes for the hall aisles, forecourt and pier.
7. **Performance (High, morning, prof.mjs):** market spot 761 draw calls, 13.3 ms; boat beach spot 673 calls, 14.1 ms. Triangles at those spots are 1.9–2.1 M (above the 1.7 M guideline in HANDOFF; ASSUMPTION: mostly the existing village and flora, not re-split).
