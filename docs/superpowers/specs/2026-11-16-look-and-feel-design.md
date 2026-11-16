INTERNAL

# Look and feel: design

Date: 2026-11-16. Second of four agreed projects (heat and speed is done; bigger island and badges follow).

## Why

The owner played the game and said these feel wrong or fake:

1. People move like robots, have no expression, and their bodies are tubes and balls.
2. The torch is too bright and hard-edged; its light should spread and fade with distance.
3. The sea and its waves, the animals' shapes and movement, and the grass (too spiky).
4. Buildings are too rigid, not natural.

The owner also said: where a proper fix is too hard or costs speed, do a workaround or a simpler improvement. Only people get rich detail; everything else stays simple in style.

## Goals

- People read as children and adults with bodies, faces and moods, and move like they have somewhere to be and things on their mind.
- Torch, sea, grass, animals and buildings stop drawing the eye for the wrong reason.
- Camp gets cheaper to draw, not dearer (people become fewer objects).

## Non-goals

- New places, quests, tools or animals species. Those belong to the next two projects.
- Realistic rendering. The style stays flat-shaded, warm and simple.
- Downloaded models, textures or animation files.

## Anti-goals

- Anything that makes the laptop run hotter than after the heat-and-speed project. Check with `node tools/prof.mjs` after each part.
- Losing any existing pose, gesture or activity (jacks, salute, tug of war, eating, sleeping, torch hold, sitting and so on).
- Faces that look uncanny. Simple and readable beats detailed.

## Constraints

- Three.js 0.187, Vite, plain JavaScript, everything built in code.
- No new test files (owner's request). Existing tests must pass.
- Local git, work on `build`, fast-forward `main` after each part below is checked.
- The game must not recreate characters from any existing game. Original designs only.

## Approaches considered (people)

1. **One smooth skin with a skeleton inside.** Chosen by the owner. Continuous body that bends at the joints; 2 or 3 draw calls per person.
2. **Keep the hinged pieces and reshape them.** Rejected: joints still show and there is no speed gain.
3. **Download a rigged character.** Rejected: breaks the no-downloaded-assets rule.

For torch, sea, grass, animals and buildings there is one sensible route each, described below.

## Design

Build order: A first (it is the risk), then B to F in any order. Each part is merged on its own.

### A. People: one skinned body

**Today.** `src/actors/figure.js` builds about 13 rigid meshes on a tree of groups (pelvis, torso, neck/head, shoulders, elbows, hips, knees, feet). `animate()` works out target joint angles for every pose and gesture and eases the groups toward them. Feet are planted on the ground by lifting the body.

**New.** Keep `animate()`'s pose logic and its public interface (`createFigure` options, `animate`, `setTorch`, `setCarry`, `sitDrop`, `seatLift`, `group`) so `player.js`, `villagers.js`, `campLife.js` and `activities.js` do not change. Replace what the angles drive:

- The group tree becomes a tree of `THREE.Bone` with the same joints and the same rest positions, so the existing angle maths and foot-planting maths carry over.
- One `THREE.SkinnedMesh` per person holds the whole body: torso, arms, legs, hands, feet, neck, head, hair, clothes. Vertex colours and the shared body material. Smooth shading, as people have today (people are the one smooth-shaded thing in the game; that stays, and suits a continuous skin). (Writer's call.)
- **Body shape.** Built in code from rings swept along each limb (not cylinders): torso with shoulders, chest, waist and hips; arms and legs that taper, with a soft bulge at calf and forearm; hands as mitts with a thumb; shoes with a sole. The two builds (child, adult) stay, child with a bigger head.
- **Bending.** Vertices near an elbow, knee, shoulder, hip, waist and neck are shared between the two bones either side with blended weights, so the skin bends in a curve and never opens a gap. Two bones per vertex is enough.
- **Clothes** are part of the skin: shirt with collar and pockets, shorts or skirt hem, belt, neckerchief, socks. Hats, caps, bows and hair are welded into the skin and weighted fully to the head.
- **Held and carried things** (torch, carried box) stay separate small meshes parented to the hand or torso bone. They are hidden unless in use.

**Face.** A separate small mesh on the head bone, drawn only within about 15 m (as today's eyes and mouth are):

- Eyes with whites, iris, lids; brows; mouth; cheeks.
- Expressions are a small set of named faces, each a set of numbers (brow height and tilt, lid openness, mouth curve, mouth open, cheek lift): neutral, happy, big smile, surprised, puzzled, sad, sleepy, effort, talking. The face eases between them.
- The game picks the expression from what is happening: happy when greeted or cheering, effort when running or tugging, sleepy at night, surprised when the bugle blows nearby, sad or tired when the player's stats are low (player only), talking while a speech bubble is up.
- Blinking and gaze stay.

**Far away.** The one-piece frozen stand-in from the heat project is no longer needed for speed (a skinned person is already one draw call) but skinning costs processor time per bone. Keep the rule "past 46 m still people, past 70 m everyone, stop updating the skeleton" by simply not calling the bone update; the skin holds its last pose. Remove the baked stand-in meshes.

**Shadows.** One skinned mesh casts the shadow, within 26 m as today.

**Check before roll-out.** Build the new body for the player's scout only, behind a `?newbody` debug switch, and show the owner screenshots (standing, walking, running, sitting, a salute, a close-up of three expressions) before converting everyone.

Target: camp centre 600 draw calls or fewer; the beach view of camp 700 or fewer (now about 1,240); frame time in camp no higher than 3.5 ms.

### B. People: behaving like people

Today there are three separate movers: `src/logic/villagerBrain.js` drives the 6 free wanderers in `villagers.js`; `walk()` in `src/actors/schedule.js` marches everyone between timetable spots (and teleports after 40 s if stuck); `campLife.js` has its own movement for the crate carrier, tag and catch. Most of the roughly 70 people stand at a spot in a pose.

Who gets what (writer's call):

- **Everyone who walks**, by any of the three movers: varied pace, easing in and out, curved turns and lean. Do this with one small shared helper that smooths pace and heading, called by the three movers; do not merge the movers.
- **Only people with free time** (the 6 wanderers always; others during free-time blocks): pauses with a reason, stopping to chat, stepping aside.
- **Never while the timetable is marching someone to an activity.** They must still arrive on time; the 40 s teleport stays as the safety net.
- **People holding a pose** do not break it. They get small in-pose life only: weight shifts, head turns, glances at neighbours, being slightly out of time with each other.

- **Speed varies** per person and per moment: a personal pace, slowing before a stop and into a turn, easing up from standing.
- **Curved turns.** The body turns toward its heading over a short time instead of snapping, and leans slightly into the turn.
- **Pauses with a reason.** Now and then stop to look at something nearby (an animal, the fire, the sea, another person), scratch, stretch, adjust the hat, tie a shoe, yawn at night.
- **Noticing.** The head and eyes turn to passers-by; people step slightly aside rather than colliding; two who meet may stop and chat for a few seconds (facing each other, talking faces, small hand movements).
- **Reacting to the player.** A wave or nod the first time you come near, a glance when you run past, a look of surprise at the bugle (already partly there).
- **Group moments feel alive.** In activities, each person is slightly out of time with the others and makes small mistakes, rather than all moving as one.

These must stay cheap: decisions a few times a second per person, not every frame, and none for people past 46 m.

### C. Torch

Today: a `THREE.SpotLight` in `src/main.js`, intensity `30 + night * 190`, angle 0.42, penumbra 0.55, reach 30.

- Lower the peak so lit ground is not washed out; full soft edge (penumbra near 1).
- Wider cone, and a longer reach with gentler fall-off, so the pool of light spreads and fades the further it lands.
- A weak, short-range glow around the scout so the body and the ground at the feet are just visible. Use the cheapest thing that works (a small point light, or a brightening of the scout's own material) and measure it.
- The beam should move with the hand, with a slight lag and bob while walking.

### D. Sea

Today: one water mesh with a shader in `src/world/island.js`; foam is a hard band from `step()`.

- Replace the sharp ripples with a slow, broad swell: two or three long waves moving in different directions, low height.
- Shoreline foam becomes soft: a band that fades in and out as each wave washes up and draws back, with a thin wet-sand line left behind on the beach.
- Colour blends smoothly from shallow to deep; a soft sun glint.
- **White sea fault.** Standing on the south-west beach (x -28, z 52) at midday (`?t=0.45`) with the camera looking north-east toward camp, the water at the bottom of the picture, nearest the camera, is almost white. Reproduce it first and find the cause. If it is foam or transparency, fix it in the water shader. If it is fog on the water, change how the water shader applies fog; do not change the scene fog, which hides the edge of the drawn jungle and protects the performance numbers.
- No extra render passes, no reflections.

### E. Grass and plants

Today: `tuftGeometry` in `src/world/scatter.js` makes clumps of broad straight blades that end in points.

- Blades get rounded tips and a real bend along their length; clumps are fuller at the base and vary in height and lean.
- Colour softens toward the tip.
- Sway becomes a slow wave travelling across the field, not each clump waving alone; blades bend more at the tip than the base.
- Grass near the player's feet bends away a little as they walk through. If that costs measurable time, drop it.
- Same number of instances as today, or fewer.

### F. Animals

Today: chickens and a cat in `src/actors/animals.js`; gulls, rabbits and sheep in `src/actors/wildlife.js`, built from a few primitives and slid along the ground.

- Rounder, softer bodies with a clear head, ears, tail and legs, in the same simple style (not as detailed as people).
- Legs that step in a proper gait matched to speed: chickens strut and peck with a head bob, rabbits hop in arcs, sheep amble, the cat stays at its spot as today (its prompt, marker and the campfire seating depend on that) and gets animation only: washing, stretching, watching passers-by, curling up at night. (Writer's call.)
- Habits: graze or peck, look up, startle and scatter when the player runs at them, drift back when calm, settle down at night.
- Gulls wheel and glide instead of flying fixed circles; they land on the beach and take off when approached.
- Each animal merged to as few meshes as its moving parts need.

### G. Buildings

Today: tents and huts in `src/world/buildings.js`, `campProps.js` and `village.js` are built from exact boxes and straight cylinders.

- Canvas sags between poles and bows slightly at the walls; ridge lines dip in the middle; guy ropes hang in a slight curve.
- Poles and posts lean a degree or two, each differently; planks vary in width, length and height by small amounts; roofs overhang unevenly.
- Hard box edges on the larger pieces get a small bevel.
- Tent flaps and flags already move; add a slow breathing of the canvas in wind, done in the vertex shader on the canvas material only.
- Walls, doors and colliders keep their positions so nobody walks through anything and interiors still work.

All of this is done once when the building is made, then welded as today, so it costs nothing per frame except the canvas shader.

## Left to the builder

- Exact proportions, colours and numbers; tune by screenshot.
- Ring and segment counts for the body, within a budget of about 2,500 triangles per person.
- How the face mesh is built (a few small shapes moved by bones, or shapes rebuilt each change).
- Which idle habits to include and how often they happen.
- Whether the glow around the scout is a light or a material trick.

## How it will be checked

- `node tools/prof.mjs` before and after each part; table added to `docs/HANDOFF.md`.
- Headless screenshots for each part, looked at by the builder, with the people set shown to the owner before roll-out.
- Every existing pose and gesture screenshotted on the new body and compared with the old one.
- Existing tests pass.
- The owner plays and says what still feels fake.
