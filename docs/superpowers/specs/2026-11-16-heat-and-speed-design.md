INTERNAL

# Heat and speed: design

Date: 2026-11-16. First of four agreed projects (heat and speed, look and feel, bigger island, badges and tools). Each has its own design.

## Why

The owner's laptop gets hot while playing. The next three projects all make the game heavier, so the game has to get cheaper to run first.

## What was measured

Profiled with headless Chrome on the owner's machine (Apple M5, built-in 120 Hz display, 3024 × 1790 drawing surface), frame limiter switched off so the true cost of one frame shows. Midday, standing still.

| Spot | One frame | Draw calls | Triangles |
|---|---|---|---|
| Camp centre (x 10, z 8) | 6.0 ms | 1,404 | 1,199,000 |
| Summit (x -18, z -22) | 5.4 ms | 764 | 1,054,000 |
| Jungle (x -45, z -50) | 6.7 ms | 1,682 | 1,450,000 |

Where the script time goes in camp: about 60% is WebGL calls made once per drawn object (`uniformMatrix4fv` alone is 30%), about 12% is three.js walking the scene, and game rules are small (collisions 2.3%, everything else under 2% each).

Conclusions:

1. The game draws every screen refresh with no limit. On a 120 Hz screen that is 120 frames a second at about 6 ms each, so the machine works about 70% of the time, including behind the pause menu.
2. It draws at 2× pixel ratio with antialiasing. ASSUMPTION: this loads the graphics chip heavily; the profile measures the processor side, not the chip.
3. Too many separate objects. Scenery is already welded (`mergeStatic`), so most of the 1,400 are people: about 70 people, each many meshes, each drawn twice when it casts a shadow.
4. Game logic is not the cost, so WebAssembly would gain a percent or two.

## Goals

- The laptop runs clearly cooler in normal play.
- Room for a larger island and more people later.
- Numbers before and after, from the same profile script.

Targets, measured the same way as the table above:

| Measure | Now | Target |
|---|---|---|
| Frames drawn per second in play, on a 120 Hz screen | 120 | 60 (30 in saver mode) |
| Frames drawn per second while paused | 120 | 10 or fewer |
| Frames drawn per second on the start menu | 120 | 30 |
| Draw calls, camp centre | 1,404 | 900 or fewer (600 follows in the look-and-feel project, see section 4) |
| Draw calls, jungle | 1,682 | 900 or fewer |
| One frame, camp centre | 6.0 ms | 4.5 ms or less |

## Non-goals

- WebAssembly, WebGPU, web workers.
- Changing how anything looks within about 15 m of the player.
- Reducing the number of people in camp.

## Anti-goals

- Movement speed, the clock, stats or animation speed changing with the frame limit. Everything must keep running on real elapsed time.
- People visibly popping between detail levels close to the player.
- Choppy camera. 60 must still feel smooth.

## Constraints

- Three.js 0.187, Vite, plain JavaScript, no downloaded assets.
- The owner asked for no new test files. Existing tests must still pass. Proof is the profile script plus the owner playing.
- Local git only. Work on `build`, fast-forward `main` when done.

## Approaches considered

1. **Limit and rest.** Cap frames, stop drawing when idle, lower resolution. Small change, large effect on heat, but leaves no headroom for a bigger world.
2. **Limit and rest, plus fewer objects.** Chosen by the owner. Everything in 1, plus cut draw calls, mainly people and shadows.
3. **New graphics technology (WebGPU) or WebAssembly.** Rejected: large effort, and the profile shows game logic is not the cost.

## Design

### 1. Frame limit

- The loop still wakes on every `requestAnimationFrame`, but only runs a step when enough time has passed for the chosen rate. Timing must not drift on 60 Hz screens (a 60 limit on a 60 Hz screen must draw every refresh, not every second one).
- Two settings, chosen with one switch in the pause menu and remembered in `localStorage`: **Smooth** (60, default) and **Saver** (30).
- The existing automatic resolution tuning (`tuneResolution` in `src/main.js`) must keep working. Its thresholds assume 60; in Saver mode it must not read 30 as "too slow".

### 2. Rest when idle

- Pause menu open: draw at 10 frames a second or fewer.
- Start menu: 30 frames a second, because its camera turns slowly and would judder at 10. (Writer's call.)
- Map, journal and backpack sheets do not pause the game today and still will not; they run at the normal limit. (Writer's call.)
- Tab hidden: no drawing (the browser already stops `requestAnimationFrame`; the window `blur` pause already exists).
- The `?settle` and `?freeze` debug paths must still work.

### 3. Resolution

- Highest pixel ratio drops from 2 to 1.5. Antialiasing stays on.
- Automatic tuning continues between 1 and 1.5.
- The HUD canvas (map) keeps its own ratio.

### 4. Fewer objects: people

People are the bulk of draw calls. Three levels by distance from the camera, replacing today's levels in `src/actors/figure.js`:

- **Near (under about 15 m):** as today.
- **Middle (about 15 to 40 m):** one mesh per moving part. Everything that rides rigidly on a part (uniform details, hair, face features, hands, shoes) is welded into that part's geometry when the person is built, using vertex colours and the shared body material, as `figure.js` already does for some parts. No shadow beyond 26 m, as today.
- **Far (beyond about 40 m):** one single welded mesh per person in a neutral standing shape, moved and turned as a whole, no limb animation, no shadow. In fog at that range the limbs are a few pixels.

**Known limit, and the writer's call.** A reviewer counted about 17 to 20 meshes per person today plus 7 shadow casters, so the middle level saves only 4 or 5 per person, and a far "statue" would look wrong for people sitting, sleeping or exercising. So:

- The far level starts only where people are small on screen (the builder picks the distance, 55 m or more), and uses a welded shape matching the person's state: standing, sitting or lying. People doing a group activity stay at the middle level.
- Where the look and the target conflict beyond 15 m, heat wins: cut shadows sooner or drop small parts first. The owner asked for simpler workarounds where a full fix costs speed.
- The camp target for this project is 900, not 600. The look-and-feel project rebuilds people with shaped bodies anyway; that rebuild should make each person one skinned mesh (one draw call, one for the shadow), which is what reaches 600. That is noted here so the next design picks it up.

**Bug to fix here.** At `src/actors/figure.js:256` the statement `torchProp.visible = false;` was swallowed by a trailing comment, so every person draws an invisible-in-intent torch (3 meshes, about 210 draw calls across camp). Restore it: a torch shows only while switched on, which is the intended look, so this does not break the "no visible change near the player" rule.

Detail levels are measured from the camera, not the player, so the short films look right.

Switching uses a small distance band (hysteresis) so a person standing on the boundary does not flicker.

The player's own figure is always near.

### 5. Fewer objects: shadows

- The sun's shadow map is redrawn every second step, not every step (`shadowMap.autoUpdate = false`, set `needsUpdate` on alternate steps). In Saver mode, every step.
- Only people within 26 m cast shadows (already so). Check that small props (pickups, pennants) far from the player are not casting.

### 6. Other animals and props

Apply the same idea to `src/actors/animals.js` and `src/actors/wildlife.js` if the profile shows they matter after people are done. Not required to hit the targets.

### 7. Profile script kept in the repo

Add `tools/prof.mjs`: starts headless Chrome with the frame limiter off, visits camp, summit and jungle, prints frame time, draw calls, triangles and the top script costs. The script used for the table above was a scratch file, so re-run the baseline with the new script before changing anything else. It needs a way to ignore the new frame limit, so add a `?nolimit` debug parameter. Document one line in `docs/HANDOFF.md`.

## Left to the builder

- Exact distances and band widths for the detail levels, tuned by eye.
- How the far mesh is produced (welded once per person at build time, or a few shared shapes tinted per person).
- Wording and placement of the Smooth/Saver switch.
- Whether animals need the same treatment.

## How it will be checked

- `tools/prof.mjs` before and after; results table appended to `docs/HANDOFF.md`.
- Headless screenshots at camp, summit and jungle compared with before for visible differences.
- Existing tests pass.
- The owner plays and reports whether the laptop stays cooler.
