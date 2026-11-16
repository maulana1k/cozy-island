INTERNAL

# Living village and land: design

Date: 2026-11-16. A follow-up to the bigger island. The owner played it and found the locals' side "still too many plains": large flat single-colour ground, sparse evenly dotted trees, bare earth round the village. They want it to read like a real village: terrain, trees, bushes, forest, trails. They chose approach B below.

## What Alba does that we do not (research)

From the developers' environment-art write-up (ustwo games, "The Environment art of Alba"); reference pictures kept privately in `.reference/alba/` (git-ignored, never shipped):

- Ground blends four materials (dirt, clay, grass, sand) by rules (height, slope) plus hand "stamps" under paths, yards and steps. Ground always varies.
- Grass meshes grow wherever the grass material is: meadows read as thick tufty, often golden, grass.
- Plants are placed as biomes: a cluster of a main tree with its companions (bushes, cones, ferns), each with variants, chance and size ranges. Clusters, not evenly dotted singles.
- Decorative meshes are clumped to break straight lines and bare edges.
- Every plot has a boundary: walls, hedges, fences, kerbs, gates.
- Every building has a yard full of small life: pots, chairs, a table, a bike, washing, a vine over the door.
- Terrain is shaped (ridges, terraces, clay cliffs, valleys, ponds) from real places.
- Flat colours with soft gradients; no normal maps.

## Goals

- The locals' side reads as a real hillside village with farmland and woods, with no stretch of bare uniform ground bigger than about 10 m inside the village and 20 m elsewhere.
- Ground colour and texture vary naturally everywhere on the new land, and along the camp's edges.
- Still no hotter: every spot at or under 900 draw calls and about 1.7 million triangles.

## Non-goals

- Quests, tools, sound.
- Changing the camp, the hill, the river course, the bridge, the stepping stones, the lake, the cliffs or the dock.

## Anti-goals

- Floating or buried buildings, plants through walls, paths blocked, people walking through walls or into water.
- Steep climbs a child would find hard: every walkable slope at the hill trail's gentle grade or less, with steps where terraces meet.
- Recreating any real game's places or assets.

## Approaches considered

- A. Keep the land, only dress it. Fastest, but the village stays on a dome.
- **B. Reshape the locals' land into a terraced hillside village, a farm valley and a wooded ridge, then dress it. Chosen by the owner.**

## Design

### 1. Terrain (locals' land only)

- **Village terraces:** the village climbs a slope that rises away from the bridge (the low side faces the river and bridge). Three or four level terraces, each about 1.2 to 1.6 m above the last, held by dry-stone retaining walls, joined by stone steps and one gentle ramp a cart could use. The square and its banyan sit on the middle terrace; the hall on the top one.
- **Farm valley:** the farm sits in a broad shallow valley beside the village. A small stream rises at a spring under the ridge and runs through the valley to the river. It is shallow enough to wade (or has plank crossings where paths meet it). The paddies step down the valley sides.
- **Wooded ridge:** a low ridge (about 8 to 12 m) behind the village and farm, forming the skyline, covered in forest. One gentle trail climbs to a clearing with a view; the rest is too steep or dense and is edged so you stay on safe ground.
- The far-shore beach and jetty stay where they are.
- Everything must remain safe ground under the jungle rule except the forest interior off the trail, which may use the ordinary warning.
- The bridge's east landing, river banks and river must not move.

### 2. Ground painting (all new land, plus the camp's edges)

- Blend grass, dry golden grass, dirt and clay (and sand near water) in natural patches from noise, height and slope: dirt and clay on slopes and terrace faces, dry grass on high ground, greener grass in the valley and near water.
- Stamps: worn dirt under paths with soft ragged edges, packed earth in yards and the square, darker damp earth by the stream and paddies.
- Done in the ground's vertex colours (and a cheap shader blend if needed); no image textures that tile visibly.

### 3. Grass and plants

- **Ground grass:** dense tufts (dry and green) grown wherever the ground is grassy, only near the player, in one or two instanced pools, like the camp's grass. Short grass along path edges, none on paths, yards or terraces' paving.
- **Plant clusters (biomes)**, each a mix with variants and size ranges:
  - forest on the ridge: tall trees, understorey bushes, ferns, fallen logs;
  - copses between village and farm;
  - bamboo groves by the river and stream;
  - coconut palms along the shore;
  - fruit trees and banana plants round homes;
  - flowering shrubs and wild flowers at edges.
- Real trees near, cheap stand-ins far, as the jungle already does.

### 4. Boundaries and yards

- Hedges, low dry-stone walls and bamboo fences round plots, paddies and gardens, with gate gaps where paths pass.
- Every house gets a yard: potted plants, a bench or stool, a vine or flower arch, a firewood stack, a water jar, washing, a bicycle or handcart, a few chickens or a cat at some homes.
- Paths: stepping slabs or worn earth between terraces; stone steps up the retaining walls.

### 5. Soft gradients (if cheap)

Buildings and big props get a slight darkening toward the ground through vertex colours, as Alba does.

## Who builds (owner's instruction: subagents build, the main session designs and orchestrates)

- Now, in parallel:
  - **Terrain and ground painting** (Opus): sections 1 and 2, and moving the area anchors.
  - **Yard and boundary models** (Sonnet): a new kit of yard props, hedges, walls, gates, steps.
- After the terrain is checked, in parallel:
  - **Village re-placement** (Opus): buildings and people on the terraces, retaining walls, steps, yards.
  - **Farm re-placement** (Sonnet): paddies, pens, orchard, stream crossings in the valley.
  - **Plants and ground grass** (Opus): section 3 across the locals' land and camp edges.
- The main session checks each stage on screen, measures, and merges.

## Left to the builders

Exact shapes, heights, counts and colours, tuned by screenshot within the rules above.

## How it will be checked

- The 50 existing tests pass.
- Screenshots from the bridge, the dock, the village square, each terrace, the farm valley, the ridge clearing, by day and night.
- A scripted walk over every terrace, the steps, the farm, the stream and the ridge trail: no blocking, no floating, no warning on safe ground.
- `node tools/prof.mjs` at all spots.
