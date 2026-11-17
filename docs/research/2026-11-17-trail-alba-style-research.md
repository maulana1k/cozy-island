INTERNAL

# The Trail and Alba: style research and gap analysis

Date: 2026-11-17. Purpose: make Scout Camp Island's nuance, graphics, design and tone close to **The Trail** (22cans; mobile 2016, PC/Switch as *The Trail: Frontier Challenge*) and **Alba: A Wildlife Adventure** (ustwo games, 2020). We match style only. We do not copy names, characters, art, levels or music.

How to read this:
- **Sourced** facts link to a source in section 7.
- **Observed** means seen in the owner's private reference images in `.reference/`. These are official store screenshots and dev-talk stills; never commit or share them.
- **ASSUMPTION** marks anything inferred.
- "unverified" means no source was found.

---

## 1. Summary: what makes each game feel the way it does

**The Trail**
1. **Big flat shapes, few tones.** Each surface reads as one or two flat colours with crisp facets. Distance turns into stacked, paler blue layers, like a paper diorama (observed: ss02, ss09). Press called it a "cell shaded/paper/Tiltbrush look" [K].
2. **High-key sky with cut-paper clouds.** The sky is a saturated cyan-to-blue gradient. Clouds are flat, angular white or lavender polygons, and the sky fills a big share of the frame (observed: ss02, ss09).
3. **Warm ground against a cool distance.** Ochre and golden grass sit under blue mountains and teal water, so the main colour contrast is warm-near, cool-far (observed).
4. **Calm by design.** Walking is the core verb, at "a calm and measured pace" [S1]. Reviews describe "a real air of relaxation, aided by the soundtrack" [K] and "nice, soothing music" [M].
5. **Gather, then use it at the campfire.** You pick things up along the path, then craft and trade at camps, which are also where you rest [S1][MW][M]. The campfire is the social and mechanical hub (observed: ss02).
6. **Small HUD.** A few icon pips (apples for stamina, chevrons for speed), an "Inventory" paper tab at a corner, and big character name cards in a display face. The world gets the screen (observed: ss02, ss09).

**Alba**

7. **Sun-bleached, Sorolla-inspired palette.** Warm dry ochre ground, olive trees, pastel plaster buildings. Colour comes from a gradient palette atlas, not textures [A1]. The light is soft and warm, with long readable shadows (observed).
8. **Built for wildlife photography and density.** Compositions were planned for photo hunting [A1]. "Density was a much more important conversation… than the size of the island" [A2]. Ambience is biome-based and every animal heard is a real, findable animal [A3].
9. **Doing good is the loop.** Photograph and identify about 60 species, clean litter, repair benches and boards, help sick animals, and gather signatures. Cleaning brings more animals back [A5][A6]. There is no reward or penalty for a perfect shot [A5].
10. **Earnest, funny, never preachy.** Writing aims at "children at young reading ages" yet works for adults [A4]. Grandparents and even the mayor are written as real people with their own views [A2][A6]. The message is "positive… affirming and empowering" (developer quote via search summary; verify against the original before quoting) [A7].

---

## 2. Visual language

### 2.1 Palette and value structure
- **The Trail (observed):** a few large value groups per frame: bright sky, mid-value warm ground, darker characters and props. Far land steps through 3 to 5 progressively lighter, bluer layers. Saturation stays high in the sky and water and moderate on the ground. Shadows are cool, desaturated, flat shapes.
- **Alba:** the palette came from location photos and the painter Joaquín Sorolla [A1]. Observed: dry gold and ochre dominate the ground, foliage is dusty olive, not lush green, and buildings are pastel pink, yellow and white with orange tiles. The value range is high-key, with very little near-black.
- **ASSUMPTION:** both games keep the large ground area warm (gold or ochre) and push green toward olive or teal. Our frame is dominated by mid-saturated green.

### 2.2 Lighting, time of day, sky, haze
- **The Trail (observed):** mostly bright daylight. Haze is strong and blue-cyan, and it flattens distant hills into silhouettes. The sky is a two-colour gradient with flat polygon clouds. The day/night cycle is unverified.
- **Alba:** shading detail on buildings comes from UVs stretched over a gradient palette, plus light baking [A1]. Observed: warm low-angle sun, long soft shadows on the ground, and cool blue-violet shade on walls. A reviewer stopped to photograph a sunset [A6]. The details of the day cycle are unverified.

### 2.3 Shading model, outlines, texture
- **The Trail:** flat-faceted low-poly. Some characters and props carry painted, faceted colour patches that read like cut paper (observed, ss02). No ink outlines (observed).
- **Alba:**
  - Primitives in solid colours, then gradient atlases.
  - Decals only for large surfaces such as town floors, piers and breezeblock walls.
  - No tileable textures, no normal maps.
  - "Normal transfer" from smooth proxy meshes for soft rounded shapes.
  - Boolean "chipping" breaks up sharp corners on concrete and brick [A1].
  - No outlines (observed).

### 2.4 Foliage and terrain
- **Alba terrain** [A1]:
  - One terrain mesh with 4 splat channels: dirt, clay (orange cliffs and paths), grass, sand.
  - Splats are driven by height and slope rules, with detail maps for transitions.
  - Stamps paint dirt under objects so grass does not clip through.
  - Biomes are spawned procedurally from weighted elements, then hand-polished.
  - Pines get 4 LOD levels.
- **Alba trees (observed):** a few big, soft, rounded clumps per tree, not many small facets. The canopy reads as 3 to 5 blobs with a lit top and a cool underside.
- **The Trail (observed):**
  - Trees are a few large angular planes.
  - Grass is golden shard clumps at the edge of paths.
  - Pine forests in the distance are single dark silhouettes.

### 2.5 Water
- **The Trail (observed):** saturated turquoise to cyan, flat, with pale edge bands at the shore. It reads as colour, not reflection.
- **Alba:** technique unverified. Observed: flat turquoise with light foam edges.
- **ASSUMPTION:** both read as stylised flat colour plus a shore band. Our realistic water (flow maps, fresnel, glints) may be more detailed than either reference.

### 2.6 Characters, proportions, faces
- **The Trail (observed):** lanky, elongated adults with small heads and stylised faces; the outfit carries the character. Faceted fabric. A companion dog is always on screen.
- **Alba (observed):** small, rounded, child-proportioned figure. Simple bodies in solid colour. Alba's run kept its original "sphere-style design", with randomised blends and skipping added [A2]. Early animals were "a bit robotic" until a dedicated strike team animated them [A2].
- Readable animal silhouettes were chosen with colourblind and low-vision players in mind [A8].

### 2.7 UI, HUD and typography
- **The Trail (observed):** a minimal corner HUD (icon pips), paper or wood tab buttons, warm cream panels with coloured tile buttons in interiors, and a condensed slab or western display face for name cards.
- **Alba:** in-game UI is built around a smartphone, with a camera app and a guidebook [A5][A6]. Players can inspect each call in the guidebook [A3]. Off-screen sounds get visual indicators, and no puzzle needs sound [A8]. Detailed UI style is unverified.

### 2.8 Camera
- **The Trail:** behind the hero and swingable [PG]. Observed: low, close, wide shots that put a lot of sky and vista in frame (ss02, ss09).
- **Alba:**
  - Rear-follow camera; designed for one-handed portrait play on mobile.
  - A large FOV, with upper floors of buildings "squished" to stay in proportion next to the small character [A1].
  - The photo mode is first-person on the phone; you cannot move while shooting [A6].
  - Reviewers praised the autofocus and bokeh [A6].

---

## 3. Feel and nuance

### 3.1 Pacing
- **The Trail:** slow, measured walking [S1]. Critics found the loop tedious after a few hours [MW] and repetitive in long sessions [M].
  - Lesson for us: calm pace needs constant small discoveries.
- **Alba:** compact and dense; finished in about 3 to 4 hours [A5][A6]. The island can be crossed on foot in minutes [A6]. "Chillectathon" framing, at your own pace [S2].

### 3.2 Sound and music
- **Alba** [A3]:
  - Ambience comes from biomes: forest, beach, town, mountain, terraces.
  - The ocean uses two splines: shore and offshore.
  - Bird calls were cleaned so each one is single-species.
  - "There were no additional animals buried in the ambiences."
  - Music: an original score by Lorena Alvarez, mostly tied to quest events, which leaves space for ambience.
- **The Trail:** soothing travel music [M][K]; "stirring soundtrack" (App Store editorial, via search summary; unverified). The composer is unverified.

### 3.3 Ambient life
- **Alba:** residents fan themselves, eat ice cream, doze, read the paper and watch the sky. "No-one seems in a rush to do anything" [A5]. There are about 60 to 70 animals [A3][A5].
- **The Trail:** a dog companion and other travellers at campfires (observed). The wildlife is hunted in The Trail [MW], which is out of scope for us (no hunting).

### 3.4 How the world reacts and rewards discovery
- **Alba:** cleaning and repairing visibly bring more wildlife back [A6]. Photographed species become information-board signs in the world [A6]. Each new species is a guidebook entry.
- **The Trail:** found items feed crafting, and crafted gear raises stamina or speed [MW][M]. Arrival at the destination town unlocks house building, a pet and town upgrades [S1].

---

## 4. Design

| Topic | The Trail | Alba |
|---|---|---|
| Core loop | Walk → gather → camp: rest, craft, trade → walk on; long-term: settle in the town, professions, house [S1][MW][M] | Explore → spot, photograph and identify wildlife → good deeds (clean, repair, rescue) → signatures and volunteers [A5][A6][S2] |
| Objectives | NPC guide gives small objectives (collect, hunt) [M]; "Items needed" panel with counts (observed ss05) | Map, quest log, main and side quests kept but simplified "as simple as possible" [A4] |
| Signature system | 3x3 crafting grid with a lever [MW]; conveyor-belt trading mini-game at camps [PG][M] | Phone camera app that IDs species; guidebook with calls; info-board signs [A5][A6][A3] |
| Teaching | Learn-by-doing objectives (ASSUMPTION beyond [M]) | Designed for players with low game literacy; open-world conventions kept for orientation [A4] |
| Failure | Stamina runs out → you collapse and lose items [S1][M] | No reward or penalty for shot quality [A5]; fail states are unverified, ASSUMPTION: effectively none |
| Session length | Long, open-ended [M] | About 3 to 4 hours total [A5][A6]; built to "respect the player's time" [A4] |
| Onboarding | NPC with objectives (ASSUMPTION beyond [M]) | Grandparents hand over the phone, map and guide at the start [A6] |

---

## 5. Tone

- **Themes:**
  - Alba: environmentalism through individual action ("individuals can make a difference") [A4], and community persuasion over confrontation [A5]. The developer pledged one tree per copy sold [A4].
  - The Trail: frontier journey, self-reliance, community-building in the town [S1].
- **Voice:**
  - Alba: light, humorous, self-aware; adults written with nuance, including the "antagonist" mayor [A2][A6]. Some critics found the story naive [A6 search summary].
  - The Trail: "rather charming", "pleasant and subdued" [M].
- **Audience:**
  - Alba: young readers, plus "the 11-year-old in all of us" (paraphrase in the source [A4]).
  - The Trail: App Store age rating 9+ (listing title; unverified beyond that).
- **Our match:** the story spec's "warm and curious, kindness is always the way", with no harsh fail and no hunting, sits closer to Alba than to The Trail.

---

## 6. Gap table: Scout Camp Island today vs the references

**What the game does today**, from `git log` on `build`, the code and the screenshots in `.shots/`:
- **Visual and cutscene milestones done:**
  - Trail look stage 1: sky gradient, cut-paper clouds, aerial haze and gentle cel shading (`toon.js`, `c911a88`)
  - V1: AO, contact shadows and bloom
  - V2: particles, including butterflies, fireflies and startled bird flocks
  - V6: film camera and depth of field
- **World:**
  - realistic flow-mapped water (`8666c65`)
  - fishing dock
- **Story:** story M1 (engine, save, conversation screen, field guide, quests, notes).
- **Current settings:**
  - camera FOV 55, distance 6.2 m, pitch 19 degrees
  - HUD in a rounded system font with stat bars and a key-hint stack
  - all sound is synthesised effects; there is no music
- **Observed in `.shots/v1-midday-camp.jpg` and `v2-day-meadow.jpg`:**
  - green fills most of the frame
  - the sky is small
  - the canopy is many dark faceted discs
  - the HUD carries 4 stat bars, a clock row, a tip bar, a 6-item hint stack and two toolbars

| Area | References do | We do now | Gap | Concrete change for us | Effort | Fits |
|---|---|---|---|---|---|---|
| Palette balance | Warm ochre/gold ground dominates; green pushed to olive/teal (observed both) | Mid-saturated green everywhere; gold only on hill paths | Too green and even; little warm/cool contrast | Shift meadow and jungle-floor ground toward dry gold/ochre patches (30 to 50% of open ground); push foliage hue to olive, shade to teal; keep camp lawn greener as a focal area | M | new "Look pass 2" (fits V5 if no new milestone) |
| Value grouping | 3 to 4 big value groups per frame | Many small dark canopy discs make a busy mid-dark band | Noisy darks | Lighten canopy undersides (cool mid-tone, not near-black); fewer, bigger canopy clumps per tree | M | V5 |
| Sky share and clouds | Sky fills 30 to 50% of frame; big flat polygon clouds (Trail) | Camera pitch 19° + trees frame most shots; sky mostly hidden | Little vista | Lower default pitch slightly (~12 to 14°) and raise look height so the horizon sits at about the upper third; bigger, fewer cut-paper clouds | S | V3 (camera) / new |
| Distance layering | 3 to 5 bluer, paler silhouette layers (Trail) | Aerial haze exists (`toon.js`) | Haze tint not stepped/blue enough at range | Raise haze hue toward the sky's horizon cyan and increase desaturation beyond ~150 m; add 2 far "card" ridges or islets as silhouette layers | S | new |
| Foliage shape | Few big soft clumps (Alba) or few big planes (Trail) | Many small faceted discs, dark | Too detailed and dark at mid distance | Tree LOD at mid range as 3 to 5 merged soft blobs with a lit top and cool underside (vertex colour gradient) | M | V5 |
| Gradient colouring | Gradient atlas on surfaces gives soft vertical shading without textures [A1] | Vertex colours, baked AO (V1) | Large flat walls and tents read as flat paint | Bake a vertical value gradient (lighter top, cooler foot) into big surfaces: tents, buildings, rocks, trunks | S | V5 |
| Chipped edges | Boolean chipping and clumping break straight runs [A1] | Clean boxes on many props | Silhouettes too perfect | Add a shared helper for bevel or chip notches on plank ends, rock and concrete corners; clump small plants along long fences and edges | M | V5 |
| Water | Flat turquoise with a shore band (observed both) | Realistic flow-mapped water with fresnel and glints | Possibly over-real for the look (ASSUMPTION) | Owner check side by side; if needed, a "stylised" preset: stronger flat turquoise, a pale shore band, glints toned down | S | new (owner call) |
| Characters | Faceted cloth patches (Trail); rounded child shape, lively blended run with skips (Alba) | Skinned figure, eight expressions, curve-based walk/run | No skip or idle personality on the player | Add a random skip or hop-step blend into the player's run and idle looks (glance at animals, wipe brow in heat) | M | V3 |
| Companion | Dog always with you (Trail) | Buddy scout exists in story; no follower | Lacks a constant friendly presence | Buddy scout or a camp dog that follows on trips and reacts to finds (sniffs, points) | M | story M2+ |
| HUD density | Tiny icon pips plus one paper tab (Trail); phone UI only on demand (Alba) | 4 bars, clock row, 6-row key-hint stack, two toolbars, tip bar | Screen is busy; the world gets less frame | Auto-hide key hints after first use; collapse stats into small icon pips shown only when low; show the clock and toolbar only while moving the mouse or on a key | S | new "HUD calm" (or V4) |
| Typography | Display face for names; paper or wood panels (Trail) | Rounded system UI font, white text with shadow | Generic, app-like | Paper/wood name cards over people on greet; a warmer display face for titles (built in CSS, no downloaded font if the rule holds; ASSUMPTION: a system serif or slab stack) | S | story M2 |
| Wildlife photo loop | Phone camera IDs species; guidebook with calls; info-board signs [A5][A6][A3] | Field guide fills from greeting, petting and picking; camera gear only planned | Spotting is passive | Camera gear early: aim, frame and ID with a range and visibility check; the entry gains a call sound; a "print to camp board" reward | L | story M2 (gear) |
| Restoration feedback | Cleaning brings more animals back [A6] | Not present | No visible world change from good deeds | Litter or repair tasks per area raise that area's "wildlife level", adding spawn slots and birdsong layers | M | story M2+ |
| Ambient people | Residents fan themselves, eat ice cream, doze [A5] | 70 people on a timetable; fidgets | Few idle micro-acts tied to heat or time | Add 6 to 8 idle props or poses (fan, drink, read, nap in shade at midday, stargaze at night) | M | V3 |
| Soundscape | Biome ambience, every call a real visible animal, music mostly at quest beats [A3] | Synthesised effects (fire, sea, rain, thunder); no biome beds; no music | Missing the main "alive and peaceful" layer | Biome ambience zones (forest, beach, village, river) with synthesised bird calls tied to visible birds; short synthesised music stingers at quest and discovery beats, not constant music | M | new "Sound" (HANDOFF step 10) |
| Discovery reward | New species → guidebook and sign; gear from crafting | Journal entries, badges | Weak moment-of-discovery feel | A 1.5 s discovery beat: soft chime, card slide-in with a silhouette that fills in, camera nudges toward the animal | S | V4 |
| Rest hub | Campfire is the rest, craft and trade hub [S1][M] | Campfires burn at night, sit key | Fire is not a play hub | Campfire as the evening hub: sit to rest, swap or trade found items with scouts, hear a story line or clue | M | story M2+ |
| Soft failure | Trail: collapse and lose items (harsh) | Spec: soft failure, wake at camp | Already aligned with Alba, not The Trail | Keep it; do not copy The Trail's item loss | n/a | n/a |
| Density over size | "Density over size" [A2] | Large island, sparse in places (HANDOFF: grass thin across the river) | Long empty walks risk The Trail's "tedious" critique [MW] | One small find every ~20 to 30 s of walking on main trails (an animal, pickup, person or view point); seat a bench at each vista | M | V4 / V5 |
| Accessibility | Silhouettes readable; sound never required; visual cues for off-screen sounds [A8] | Not addressed | Gap | Off-screen animal call indicator (edge arrow); never gate a puzzle on sound only | S | story M2 |

---

## 7. Top 10 changes, ordered by how far each moves the feel

1. **Warm the ground, cool the foliage.** Ochre and gold open ground, olive foliage, teal shade. This is the single biggest palette move toward both games.
2. **Calm the HUD.** Auto-hide hints, small icon pips instead of bars, and the clock and toolbar shown on demand.
3. **Show more sky and vista.** A lower camera pitch, a higher horizon share, and bigger, fewer cut-paper clouds.
4. **Biome soundscape with real visible birds,** plus short music stingers at quest and discovery beats.
5. **Wildlife camera loop.** Frame, ID, add a guidebook entry with the call, and pin the card to the camp board.
6. **Simplify tree canopies** at mid range into a few soft blobs with lit tops and cool undersides, to calm the busy dark band.
7. **Stepped blue distance layers.** Stronger cyan haze desaturation plus far silhouette ridges or islets.
8. **Restoration makes the world answer back.** Clean or repair an area and more animals and birdsong return there.
9. **Discovery beat.** A chime, a card that fills in, and a camera nudge, so every find feels like a small reward.
10. **Gradient and chipped-edge pass** on big surfaces and props: a vertical value gradient, notched corners, and clumped plants along straight runs.

Measure before and after for each item. Use fixed `tools/cam.mjs` shots at camp, meadow, village and clifftop (midday and dusk), and `tools/prof.mjs` for draw calls and triangles, which must stay at 900 draw calls or fewer and about 1.7 M triangles.

---

## 8. Sources

- [A1] ustwo games, "The Environment art of Alba: a Wildlife Adventure": https://ustwogames.co.uk/news/the-environment-art-of-alba-a-wildlife-adventure/ (also https://medium.com/@ustwogames/the-environment-art-of-alba-a-wildlife-adventure-6bddd8b56955)
- [A2] Film Stories, interview with David Fernández Huerta: https://filmstories.co.uk/features/how-we-made-alba-a-wildlife-adventure/
- [A3] Cassini Sound, Alba sound case study: https://www.cassinisound.com/casestudy-alba
- [A4] PocketGamer.biz, interview with Manesh Mistry (Feb 2021): https://www.pocketgamer.biz/interview/75834/alba-a-wildlife-adventures-journey-to-plant-one-million-trees-around-the-world/
- [A5] Engadget review: https://www.engadget.com/alba-a-wildlife-adventure-steam-apple-arcade-ustwo-review-152045112.html
- [A6] TheSixthAxis review: https://www.thesixthaxis.com/2020/12/11/alba-a-wildlife-adventure-review/
- [A7] Gamesradar preview (seen via search summary only, not fetched): https://gamesradar.com/alba-a-wildlife-adventure-is-about-a-young-girls-quest-to-save-an-island-and-its-wildlife
- [A8] GameByte developer interview: https://old.gamebyte.com/theres-room-for-games-like-this-too-alba-a-wildlife-adventure-developer-interview
- [S2] Steam, Alba: https://store.steampowered.com/app/1337010/
- [S1] Steam, The Trail: Frontier Challenge: https://store.steampowered.com/app/584370/
- [PG] Pocket Gamer hands-on: https://www.pocketgamer.com/articles/071290/r/
- [MW] Macworld review (2016): https://www.macworld.com/article/3144462/the-trails-destination-doesnt-justify-the-tedious-journey.html
- [M] Miketendo64 Switch review (2018): https://miketendo64.com/2018/03/06/review-the-trail-frontier-challenge-nintendo-switch/
- [K] KitGuru: https://www.kitguru.net/gaming/jon-martindale/new-22-cans-game-appears-without-hype-or-promises/
- Observed: owner's private references in `.reference/the-trail/` (Steam screenshots ss01 to ss13) and `.reference/alba/` (dev-talk stills). These are git-ignored and must not be shared.

**Not found, so treated as unverified:**
- any GDC talk on either game
- a direct art-direction interview with 22cans
- The Trail's composer
- Alba's water and sky technique
- Alba's day-cycle details
