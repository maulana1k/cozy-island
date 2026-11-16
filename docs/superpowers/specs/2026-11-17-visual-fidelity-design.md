INTERNAL

# Visual fidelity and micro-interaction: design

Date: 2026-11-17. Status: builder check done (section 9); awaiting the owner's approval.

## 1. Intent

The owner wants Scout Camp Island to look and feel richer up close while keeping **The Trail look**: low-poly shapes, smooth shading, painted colour, no photo textures, no realism. The richness comes from micro shadows, particles, a world that reacts as you walk, more things to use, more detailed objects, and cinematic cutscenes. The story milestones (M2 onward) are deferred until this is done.

## 2. Goals, non-goals, anti-goals

**Goals**
- Nothing looks like it floats: soft contact shading under everything that touches the ground; soft shading in creases and corners.
- Glow around fire, lamps, torch, searchlight and the sun at sunset.
- Crisp edges on thin things (ropes, rails, grass) on a Retina screen.
- Particles that make the world feel alive (section 5.2).
- The world reacts as the player walks (section 5.3) and offers more things to use with E (section 5.4).
- More detailed objects up close (section 5.5).
- Cinematic cutscenes with depth of field (section 5.6).

**Non-goals**
- No photo textures, normal maps or PBR realism. No downloaded assets.
- No change to the story engine, map layout or day/weather systems beyond hooks.

**Anti-goals** (failure even if it works)
- Losing the flat painted Trail look (busy textures, heavy bloom haze, grey AO everywhere).
- Frame rate drops: the game must stay smooth on the owner's Mac.
- Blurry or shimmering edges where today's are sharp.
- Effects that can't be switched off when something looks wrong.

## 3. Constraints

- Three.js 0.187, Vite, plain JS, everything built in code (existing pattern).
- Budget: ≤900 draw calls, ~1.7 M triangles; camp today ~444 calls, ~10 ms/frame.
- PCFSoftShadowMap blanks the ground in this three.js build (noted in sky.js) — don't rely on it.
- The adaptive pixel-ratio code in main.js drops resolution on slow frames; keep it working with any new pass.
- Owner rules: light automated testing (vitest + page-load check + a few screenshots); owner tests by hand; Opus agents for hard parts, Sonnet for simple; no written implementation plans; no new test files.
- Org rules: INTERNAL label; no PII or secrets.

## 4. Approaches (owner chose C)

- **A. Full screen effects:** a post-process stack (screen-space AO, bloom, SMAA/FXAA). Most dynamic; highest per-pixel cost at Retina size; MSAA must be replaced, so thin lines soften.
- **B. Built into objects, no screen effects:** baked vertex AO, contact-shadow decals, additive glow halos, render at full device pixel ratio with MSAA. Cheapest and sharpest, closest to The Trail; shading is static except contact shadows.
- **C. Mix (chosen by the owner, 2026-11-17):** B as the base, plus one light finishing pass that adds only bloom on bright things (fire, lamps, searchlight, sunset) and, during cutscenes only, depth of field. A **Graphics: High / Low** row in the pause menu; Low turns the finishing pass off.

## 5. Design

### 5.1 Shadows, edges and glow (milestone V1)
- **Edges:** raise MAX_RATIO toward the device ratio (2 on Retina) when frame time allows; the adaptive ratio still steps down on slow frames. The finishing pass renders into a multisampled render target so MSAA keeps working.
- **Baked AO:** at build time, darken vertex colours in creases and near the ground (under roofs, between planks, bottom of walls/trunks/rocks) for merged static geometry. One shared helper so every kit can opt in.
- **Contact shadows:** a soft dark blob decal under feet, rocks, logs, posts, tent edges, props; instanced (one or few draw calls). People's blobs follow them.
- **Softer sun shadow edges:** within PCF (e.g. shadow radius / blur, slightly larger filter) — no PCFSoft.
- **Glow:** a bloom pass with a high threshold so only emissive/bright things bloom (fire, lamp glass, torch, searchlight, sun disc at dusk). Additive halo sprites on Low.
- **Graphics: High / Low** row in the pause menu, saved like the battery saver.

### 5.2 Particles (milestone V2)
Instanced, shader-driven pools like weather.js (only uniforms change per frame):
- dust puffs from feet on dry paths/sand; splashes in shallow water (rain footsteps already exist)
- pollen motes and butterflies by day; fireflies at night (near grass, water, trees)
- sparks rising from campfires (more when a log is added)
- birds that take off when the player runs near them
- glow halos for lights on Low graphics

### 5.3 World reacting as you walk (milestone V3)
- grass and bushes part and rustle (grass already leans away from the walker; extend to bushes)
- small pebbles/pinecones/cups get nudged and roll a little
- hanging things (lanterns, laundry, bunting, tent ropes) swing when brushed
- tent fabric ripples with the wind
- lily pads bob when ducks pass
- people glance at the player when near, blink, shift weight while idle

### 5.4 Things to use with E (milestone V4)
- skip a flat stone on pond/river (ripples, skip count)
- ring the camp bell, wind chimes, the tower siren (daytime only)
- fill the flask at the camp tap (splash, droplets)
- pet the camp cat or a goat (purr/bleat, follows a few steps); throw bread to ducks
- open crates/boxes (lid lifts, sometimes a small find)
- rope swing on a big tree
- simple fishing from the jetty (bobber dips, bite)
- lie on the grass to stargaze at night (camera tilts to the sky)
- campfire: add a log (sparks burst), roast a marshmallow at night

### 5.5 Detailed objects (milestone V5)
- rope lashings on poles, nails and plank grain (geometry/vertex colour, not textures), cloth folds, pots and tools at stations
- small clusters around trees: mushrooms, stones, fallen twigs
- detail only near the player where needed (level-of-detail), within budget

### 5.6 Cinematic cutscenes (owner request, 2026-11-17)
- **No letterbox bars:** the camera keeps the full screen ratio; the black bars that squeeze the picture are removed.
- **Cinematic camera:** shots beyond today's circle-a-point: dolly (move along a line), crane (rise/fall), slow push-in, over-the-shoulder, with eased motion and a little handheld drift. The shot list format in src/cutscene.js extends backward-compatibly (existing shots keep working).
- **Titles anywhere:** each shot can place its title and subtitle in a chosen screen spot (e.g. lower-left, upper-right, centre) in the HUD's type style, with a soft fade/slide in and out; default placement is the shot's empty side.
- **Depth of field:** during cutscenes the finishing pass adds a bokeh depth-of-field: the shot's subject is in focus, near and far things blur by distance; focus can pull from one subject to another within a shot (rack focus). Off during normal play. On Low graphics, no DOF.

## 6. Build order

Milestones, each tested by the owner before the next: **V1** shadows/edges/glow + Graphics High/Low → **V6** cinematic cutscenes (needs the V1 finishing pass) → **V2** particles → **V3** reacting world → **V4** things to use → **V5** detailed objects. (BUILDER CALL: cutscenes right after V1 because they share the finishing pass and the owner asked for them now.)

## 7. Left to the builder

Exact AO strengths, blob sizes, bloom threshold/strength, DOF aperture, particle counts, camera paths per existing cutscene, title positions, which props get AO/contact shadows first, LOD distances — within the budget and the Trail look.

## 8. How it will be checked

- vitest stays green (50/50); page loads with no console errors.
- A few screenshots per milestone (midday, dusk, night; one cutscene frame).
- `tools/prof.mjs` once per milestone: within budget.
- The owner plays each milestone by hand.

## 9. Builder-check calls (BUILDER CALLs; owner may override)

1. **Default and target:** Graphics defaults to **High**. "Smooth" = holds the game's 60 fps limiter on the owner's MacBook (screenshots are 3024x1790, so device pixel ratio 2). High may cost more than today, but must not drop below 60 fps at the camp, campfire and village spots in `tools/prof.mjs`.
2. **Slow-frame ladder:** when frames run slow, first step the pixel ratio down (2 → 1.75 → 1.5 → 1.25 → 1), then switch bloom off; DOF only exists in cutscenes. Stepping back up in reverse when frames are quick again.
3. **Cutscenes:** only the black bars go. The HUD hide, input lock, Space/Esc skip and caption system stay (captions move to the per-shot placement).
4. **Which cutscenes:** every existing shot list in main.js (about a dozen titled shots) is retuned with the new shot types; no new cutscenes are added.
5. **DOF depth:** use the scene render target's depth texture (no extra depth pre-pass, no extra draw calls). Alpha-tested foliage writes depth already; transparent particles may stay unblurred.
6. **Scope per milestone:** every listed item is a target, not a promise. An item that breaks the budget or the Trail look may be cut or simplified; each milestone report lists what was cut and why.
7. **Gate:** the owner plays each milestone before the next starts (the same checkpoint rule as the story). Small fixes from the owner's test go in before moving on.
