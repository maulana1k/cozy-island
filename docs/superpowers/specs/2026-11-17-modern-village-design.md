INTERNAL

# Modern village: replacement map (phase 1)

Owner's choice: **a modern Indonesian coastal town with a few heritage spots**. Most of the hillside village becomes today's coastal town (painted plaster houses, a ruko row, shops, a mosque, the village office). Three traditional buildings stay as heritage landmarks for contrast. The goal is scenery and nuance, not story.

Phase 1 (this doc, commit with it): the kit `src/kit/town.js` and this map. Nothing is wired into the world yet. Phase 2 wires it into `src/world/areas/hamlet.js`.

Sources: `src/world/areas/hamlet.js`, `src/kit/hamlet.js`, `src/kit/yard.js`, `src/config.js` (AREAS), `src/story/characters.js`, `src/story/clues.js`, `src/story/next/*.js`, `src/hud.js`, `src/world/ground.js`, `src/world/flora.js`. World positions were computed from the same code (village frame `VP(ue, v)`), rounded to 0.1 m.

## 1. Heritage picks

| Pick | Where | Why |
|---|---|---|
| **Old Darto's hut** (owner's pick) | waterfront, hut at (94.9, -26.9); `dartoHut` in `src/kit/fishing.js` | The fisherman's plank hut on stilts beside the tide board. Owned by the waterfront work; left exactly as that work builds it. |
| **Grandmother Wulan's stilt house** (plot 5) | (97.0, -40.2), second terrace, faces downhill | The oldest-looking wooden house (clay-tile roof, L-shaped veranda). The elder and Nina live here, and the story's carved post "by the elder's house" (clue `carved-post`) belongs beside it. An old timber house among painted concrete ones tells the village's age without words. |
| **The meeting hall (balai)** | (115.2, -63.3), top terrace, 12 x 6 m | The village's open pendopo with a gong and a drum, on the highest terrace above the square. Villages often keep the old balai next to a newer office, so it sits naturally beside the new kantor desa on plot 6. |

The **well** (stone ring, winch) and the **banyan** also stay. They are not buildings, and both are the elder's daily spots and her song place ("we sing all the old songs by the well").

## 2. Survey and replacement map: buildings

People: `local-k` is `PEOPLE[k]` in `hamlet.js`. Homes are door spots (`hide: true`), so a person disappears indoors there at dusk and night. Footprints are the stilt house's deck-inclusive box (w x d). Every house returns window lamps (glow only) and one collider box.

| Thing | Position (x, z), y | Footprint, current style | Depends on it | Decision | Becomes (builder) |
|---|---|---|---|---|---|
| Plot 0 | (71.8, -54.7), 1.4 low | 5.0 x 4.3, golden thatch stilt house v0 | home of local-3 (farmer); door (68.1, -53.1) | modernise | 1-storey mint house, clay tile, fence and gate: `house({ variant: 0 })` |
| Plot 1 | (75.5, -45.0), 1.4 low | 5.0 x 4.3, thatch v0 | home of local-4 (farmer); door (72.0, -42.9) | modernise | 2-storey salmon house, balcony, water tank: `house({ variant: 1 })` |
| Plot 2 | (84.5, -33.0), 1.4 low | 6.2 x 4.4, weathered thatch v2, fish rack | home of local-1 (keeper of stall 1) and local-9 (kid); door (83.0, -29.0); nearest plot to the ramp foot and beach path | modernise | `warung` (eatery, plastic tables, family door at the side) |
| Plot 3 | (83.0, -62.8), 2.7 second | 5.8 x 4.7, blue-tile v3 | home of local-5 (farmer); door (78.9, -61.9); next to the north steps and the farm path | modernise | small `mosque` with dome and minaret; local-5 becomes its caretaker (marbot) and keeps a home door at the mosque's side |
| Plot 4 | (86.6, -53.1), 2.7 second | 5.8 x 4.7, blue-tile v3 | home of local-2 (keeper of stall 2); door (83.0, -51.0) | modernise | `bengkel` (scooter workshop) with the family door at the side; Adi moves in here (see section 4) |
| Plot 5 | (97.0, -40.2), 2.7 second | 5.6 x 4.4, clay-tile v1 | home of local-6 **Wulan** (elder) and local-7 **Nina**; door (93.2, -38.2); story clue `carved-post` | **keep (heritage)** | unchanged stilt house; phase 2 adds the carved post |
| Plot 6 | (110.8, -73.6), 5.3 top | 5.6 x 4.4, clay-tile v1 | home of local-8 **Adi**; door (106.5, -73.2) | modernise | `kantorDesa` (village office) with the flagpole and a signboard in its yard |
| Plot 7 | (125.8, -55.5), 5.3 top | 6.2 x 4.4, thatch v2 | home of local-0 **Lestari**; door (124.6, -51.3); top terrace, south end, sea view | modernise | `cafe`: coffee counter, deck, pergola with fairy lights; Lestari lives upstairs (door kept) |
| Meeting hall | (115.2, -63.3), 5.3 top | 12 x 6, thatch pendopo, 4 lanterns | none in schedules; drawn on the map | **keep (heritage)** | unchanged |
| Stalls 0-2 | (105.0, -44.2), (109.1, -47.1), (113.1, -50.0), 4.0 square; face north | 2.9 x 2.1 each, striped cloth awnings, 1 lantern each | keepers local-0/1/2 by day at (105.1, -43.8), (109.1, -46.8), (113.2, -49.7); customers 1.85 m in front; farmer local-3 shops at stall 0 at midday; Lestari's "first market stall" | modernise | one 3-unit, 2-storey `ruko` row (12.6 x 7 m): unit 0 Lestari's open shop, unit 1 half-shuttered, unit 2 open; its front on the old stall front line, backs toward the ramp lane (v 8.5 to about 15) |
| Well | (104.3, -55.4), 4.0 | r 1.15, stone ring, thatch roof | Wulan's morning spot (103.6, -53.7); the well song | keep | unchanged |
| Banyan | (95.2, -66.7), 4.0 | r 4.5 canopy, ring bench, lantern | 3 bench seats (Wulan at midday; farmer local-5 at midday) | keep | unchanged |

New sites, not on a plot (no story or schedule dependency). Positions are ASSUMPTION: none of them was checked for level ground.

| New thing | Suggested site | Builder |
|---|---|---|
| Pos ronda (watch post) | the bridge landing, beside node `landing` (71.5, -31.6), off the line from the bridge to the main stair | `posRonda` |
| Minimarket and bus stop | the top of the ramp lane where the jetty path leaves (135.2, -53.6) | `minimarket`, `busStop` |
| Power poles and wires | along the ramp lane and the main stair line, about every 22 m | `poleLine` + `buildWires` |

## 3. Survey and replacement map: structures

| Thing | Where (hamlet.js) | Decision | Becomes |
|---|---|---|---|
| Yards in front of houses (`buildYard`: coops, carts, herbs) | each plot, depth to the terrace walk | replace | the house's own front yard: low plastered fence with iron bars and a gate, a paved walk, a frangipani or banana, potted plants, a scooter (prop) |
| Flower arches (yard kit) | plots with room | remove | bougainvillea over the fence (`house` variants 0 and 4) |
| Dry-stone retaining walls, earth fill | every terrace face | keep | still common on Indonesian hillsides |
| Stone steps (5 flights) | `AREAS.steps` | keep | walkable strips unchanged |
| Hedges between plots | `HEDGES` | keep | |
| Bamboo fences along the cart ramp | ramp lane, south side and slopes | replace | `lowFence` runs (plastered wall with iron bars) |
| Cart ramp lane | `AREAS.ramp.path` | modernise | `road({ kerb: 'plain' })` pieces, tilted on the slopes (ASSUMPTION: or a new ground paint kind) |
| Path lamps (12) | `LAMPS` (ue, v) | replace | `streetLight` props on the same 12 spots, still the only lit lamps there; their head is `STREETLIGHT_HEAD` |
| Washing lines (2) | (80.4, -37.1), (91.5, -44.4) | modernise | `laundryLine({ len: 4.2 })`, same spot and heading (`washSpot` hangs on line 0) |
| Handcart, water jars x2, firewood | (118.5, -48.1), (84.1, -66.4), (123.4, -52.2), (67.9, -55.4) | replace / remove | a parked `pickup` at the cart's spot, blue `drum` props at the jars, firewood removed |

## 4. What phase 2 must respect

1. **Door spots.** Each home stays a door spot where the house's `stepFeet[0]` meets the yard (hamlet adds 1 m outward). Every town builder returns `stepFeet`, `door` and `footprint`. Place by `footprint.hd`, not `colliders[0].hd`: open fronts (ruko, minimarket, bengkel) list only solid colliders.
2. **One home moves.** Plot 6 becomes the village office, so Adi (local-8) moves home 6 to home 4. Every other `PEOPLE[].home` stays. The farmer local-5 keeps home 3, the mosque's side door.
3. **Stall spots become ruko spots.** `ruko().spots.keepers[i]` and `customers[i]` replace the stall keeper and customer spots for i = 0..2, in the same order. Keep `skip: 1.6` on keepers so they can step in past the counter.
4. **Elder's day unchanged.** The well, banyan seats and chat spots stay where they are.
5. **Story text.** `characters.js` says Lestari is "at the first market stall on the village square". Change that to the first shop of the row. Add the carved post beside plot 5 (clue `carved-post`). Darto's tide board is waterfront work.
6. **Walking network.** `clear()` tests colliders. The new fences, the mosque's minaret and wudhu wall, the flagpole and the ruko pavement must leave each door's line out to the terrace walk free. Re-check `homes[i].join` after placing.
7. **Lamps.** Window lamps and bulbs (`light: false`) only glow, through the village's existing glow mesh. The lit set (`lamps` returned to `props.addLamps`) stays at about today's count: the 12 streetlights plus the hall and banyan lanterns. No new shadow lights.
8. **Map and ground.** `hud.js` draws stalls as dots, so draw the ruko as one building, and optionally add the mosque. `flora.js` keeps 2.6 m circles clear around stalls; the ruko needs its 12.6 x 7 m rectangle kept clear, or plants will grow inside the shops. `ground.js` `plan-yards` stamps can stay.
9. **Files owned by the waterfront work.** `terrain.js` belongs to the waterfront work. Any levelling for the new sites goes through that owner. `createWaterfront` stays called from `hamlet.js` as it is.

## 5. Kit and performance

`src/kit/town.js`: one vertex-coloured material (`TOWN_MAT`, smooth normals on round things), one glow material, `WIRE_MAT`. Each builder writes into a `Mesher` and returns `{ colliders, lamps, spots, props, footprint, stepFeet, door }`. `buildX()` wrappers give `{ group, ... }` for previews.

| Group | Builders |
|---|---|
| Houses | `house` (6 variants: 1 and 2 storeys, mint, salmon, sky, cream, yellow, lilac; clay tile or metal hip roofs; tiled terrace and pillars; grilles; fence and gate; dish or tank) |
| Shops | `ruko` (units: open, half, closed, glass; 2 or 3 storeys), `warung`, `minimarket`, `cafe`, `bengkel` |
| Civic | `mosque`, `kantorDesa` (+ `flagpole`), `posRonda` |
| Street | `road`, `poleLine` + `buildWires`, `signPole`, `busStop`, `pickup`, `laundryLine`, `tripleBin`, `lowFence` |
| Plants | `frangipaniTree`, `bougainvilleaWall`, `bananaClump`, `potGroup`, `planterBox` (and the same inside houses) |
| Instanced props | `motorbike`, `chair`, `table`, `cafeChair`, `cafeTable`, `drum`, `bin`, `pole`, `streetLight` via `instanceProps(list)` |

Plan for the village. Weld each terrace group into one Mesher mesh with AO baked per piece, as `waterfront.js` does, plus one glow mesh. Use one InstancedMesh per prop kind (9, plus 1 for streetlight glass) and one LineSegments for all wires. That is about 15 draws before shadow passes. Measured in the preview: the street scene (11 buildings, road, 5 poles, wires, props) is 20 draw calls and about 111k triangles. ASSUMPTION: the whole village stays under about 150k triangles and well inside the 900-call budget. Measure with `tools/prof.mjs village` and `topterrace` in phase 2.

Preview: `http://localhost:5173/kit.html?townkit` (everything), or `?townkit&fn=townStreet | townCivic | townProps`.
