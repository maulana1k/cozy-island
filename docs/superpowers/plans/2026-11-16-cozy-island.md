Classification: INTERNAL

# Cozy Island Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser 3D game where you run around a small pastel island village, use items with E, and nudge villagers, with no goals or fail states.

**Architecture:** All game rules live in pure functions under `src/logic/` (no Three.js imports) and are unit-tested. Rendering modules under `src/world/` and `src/actors/` build low-poly meshes from code and read state from the logic layer. `src/main.js` owns the loop and wires them together.

**Tech Stack:** Three.js, Vite, Vitest, plain JavaScript (ES modules), Web Audio API. Install current stable releases with `npm install`; the lockfile pins them. Before using a Three.js API you are unsure of, check current docs with `npx ctx7@latest library "Three.js" "<question>"`.

**Spec:** `docs/superpowers/specs/2026-11-16-cozy-island-design.md` (read it first).

## Global Constraints

- Project root: `/Users/mekari/Projects/Research/cozy-island/`. It becomes its own local git repo (Task 1). Never push.
- No downloaded art or sound assets. Shapes from code, sound synthesised.
- Runtime dependency: `three` only. Dev dependencies: `vite`, `vitest` only.
- `src/logic/**` must not import `three` or touch `window`/`document`.
- Units are metres; y is up; the island is centred on the origin; sea level is y = 0.
- Target 60 fps on Apple M5, 3024 x 1964 Retina. `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- On-screen text is only the start hint and the interact prompt. Emote bubbles are pictures, no words.
- Nothing may punish, hurry or block the player. No timers, score, damage or fail states.
- Look: soft, pastel, low-poly (flat shading), warm light. No grey boxes.
- Controls: WASD/arrows move (camera-relative), Shift run, Space hop, E interact, M mute, mouse drag orbits, scroll zooms.
- Start hint copy, exactly: `WASD move · Shift run · Space hop · E interact · M mute`
- The layout is fixed: same island every run (seeded random, seed `1337`).

## Review Focus

1. Returning to a hidden tab produces a huge frame time: nobody may teleport through walls or into the sea. (Task 3: `clampDt` test.)
2. A movement key held while the window loses focus: the player must stop, not run forever. (Task 3: input blur test.)
3. Nudging a villager repeatedly toward the sea or a wall: they stay on dry land and outside colliders. (Task 6: nudge containment test.)
4. Pressing M or E before any sound has been allowed to start: no error, and mute state is remembered. (Task 7: audio guard test.)
5. Resizing the window or moving it between displays: the picture fills the window without stretching. (Task 1: resize check.)

---

## File Structure

```
cozy-island/
  index.html            canvas + #hint + #prompt elements and their CSS
  package.json          scripts: dev, build, test
  README.md             how to run, controls
  src/
    main.js             boot, game loop, wiring
    config.js           every tunable number and the palette
    input.js            keyboard + mouse state
    camera.js           third-person follow/orbit camera
    audio.js            synthesised ambience and effects
    ui.js               hint, interact prompt, emote sprites
    logic/
      rng.js            seeded random
      terrain.js        island height, zones, shoreline limit
      collision.js      push a circle out of circles and boxes
      dayCycle.js       time of day -> sun, colours, night factor
      layout.js         fixed positions of everything
      interact.js       which interactable is picked
      villagerBrain.js  villager state machine
      time.js           clampDt
    world/
      island.js         terrain mesh, water
      sky.js            sky dome, sun light, fog, clouds
      village.js        cottages, paths, fences, dock, boat
      scatter.js        instanced trees, bushes, flowers, rocks
      props.js          lantern, door, bell, bench, tree, campfire
    actors/
      figure.js         the cute figure mesh + limb animation
      player.js         movement, hop, sitting
      villagers.js      villager meshes driven by villagerBrain
      animals.js        chickens, cat
  tests/                one *.test.js per logic file, plus input and audio
```

---

### Task 1: Project, terrain rules, island on screen

**Files:**
- Create: `package.json`, `index.html`, `.gitignore`, `src/main.js`, `src/config.js`, `src/logic/rng.js`, `src/logic/terrain.js`, `src/world/island.js`
- Test: `tests/rng.test.js`, `tests/terrain.test.js`

**Interfaces:**
- Produces:
  - `config.js`: `ISLAND_RADIUS = 60`, `GRASS_RADIUS = 48`, `SEA_FLOOR_RADIUS = 75`, `GRASS_HEIGHT = 1.2`, `HILL = { x: -18, z: -22, radius: 22, height: 8 }`, `MAX_WADE_DEPTH = 0.45`, `MIN_WADE_SPEED = 0.35`, `SEED = 1337`, `PALETTE` (object of hex colours; builder chooses values).
  - `rng.js`: `createRng(seed: number): () => number` returning floats in [0, 1), deterministic.
  - `terrain.js`: `heightAt(x, z): number`; `zoneAt(x, z): 'grass' | 'sand' | 'water'`; `wadeSpeedFactor(h: number): number`; `constrainToShore(prev: {x,z}, next: {x,z}): {x,z}`.
  - `island.js`: `createIsland(scene): { update(elapsed: number): void }` (terrain mesh + animated water).

- [ ] **Step 1: Scaffold.** `git init`; `npm init -y`; `npm install three`; `npm install -D vite vitest`. Scripts: `"dev": "vite"`, `"build": "vite build"`, `"test": "vitest run"`. `.gitignore`: `node_modules`, `dist`. `index.html` has a full-window `<canvas id="game">`, `<div id="hint">`, `<div id="prompt">`, and loads `/src/main.js`.

- [ ] **Step 2: Write the failing tests**

```js
// tests/rng.test.js
test('same seed gives same sequence', () => {
  const a = createRng(1337), b = createRng(1337);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
test('values are in [0,1)', () => {
  const r = createRng(1); for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
});

// tests/terrain.test.js
test('village plateau is dry', () => { expect(heightAt(10, 8)).toBeGreaterThan(0.8); });
test('shoreline is near sea level', () => { expect(Math.abs(heightAt(60, 0))).toBeLessThan(0.15); });
test('sea floor is deep', () => { expect(heightAt(75, 0)).toBeLessThan(-2); });
test('hill peak', () => { expect(heightAt(-18, -22)).toBeGreaterThan(8); });
test('deterministic', () => { expect(heightAt(12.3, -4.5)).toBe(heightAt(12.3, -4.5)); });
test('zones', () => { expect(zoneAt(0, 0)).toBe('grass'); expect(zoneAt(54, 0)).toBe('sand'); expect(zoneAt(70, 0)).toBe('water'); });
test('wading slows down', () => {
  expect(wadeSpeedFactor(1)).toBe(1); expect(wadeSpeedFactor(0)).toBe(1);
  expect(wadeSpeedFactor(-0.45)).toBeCloseTo(0.35); expect(wadeSpeedFactor(-0.225)).toBeCloseTo(0.675);
});
test('cannot go past knee depth', () => {
  const p = constrainToShore({ x: 59, z: 0 }, { x: 72, z: 0 });
  expect(heightAt(p.x, p.z)).toBeGreaterThanOrEqual(-0.45);
});
test('free movement on land is untouched', () => {
  expect(constrainToShore({ x: 0, z: 0 }, { x: 1, z: 1 })).toEqual({ x: 1, z: 1 });
});
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `rng.js` and `terrain.js`.** Height profile by distance r from origin: `GRASS_HEIGHT` for r <= 48; smooth fall to 0 at r = 60; smooth fall to -3 at r = 75 and beyond. Add the hill as a smooth bump (`HILL.height` at its centre, 0 at `HILL.radius`). Add gentle value noise of at most 0.3 m that fades to 0 between r = 40 and r = 48, so the beach and shoreline are clean. `zoneAt`: `'water'` when height < 0, `'grass'` when r < 48, else `'sand'`. `constrainToShore`: return `next` if its height >= `-MAX_WADE_DEPTH`; otherwise try keeping only the x move, then only the z move, then return `prev`.

- [ ] **Step 5: Run `npm test`.** Expected: PASS.

- [ ] **Step 6: Implement `island.js` and a minimal `main.js`.** Terrain: a plane of about 160 x 160 m, 128 x 128 segments, y from `heightAt`, vertex colours by `zoneAt` (grass/sand) with flat shading. Water: a large plane at y = 0 with a custom shader or animated material: soft teal, lighter foam band where it meets the shore, slow moving ripples, slightly transparent. `main.js`: renderer on `#game`, pixel ratio capped at 2, a temporary fixed camera and one light, a `requestAnimationFrame` loop, and a resize handler that updates renderer size and camera aspect.

- [ ] **Step 7: Verify in the browser.** Run `npm run dev`, open `http://localhost:5173`, take a screenshot. Expected: a round green island with a sandy rim and a hill, in moving teal water. Resize the window to 800 x 600 and back; expected: picture fills the window, nothing stretched, no console errors.

- [ ] **Step 8: Commit.** `git add -A && git commit -m "feat: project scaffold, terrain rules, island and water"`

---

### Task 2: Day cycle, sky and light

**Files:**
- Create: `src/logic/dayCycle.js`, `src/world/sky.js`
- Modify: `src/config.js`, `src/main.js`
- Test: `tests/dayCycle.test.js`

**Interfaces:**
- Produces:
  - `config.js`: `DAY_LENGTH = 480` (seconds), `START_TIME = 0.58`.
  - `dayCycle.js` (t is a fraction of a day in [0,1), 0 = midnight):
    - `advance(t, dtSeconds): number` (wraps)
    - `phaseAt(t): 'night' | 'morning' | 'day' | 'golden' | 'sunset'` with boundaries: night 0.88–0.10, morning 0.10–0.35, day 0.35–0.55, golden 0.55–0.72, sunset 0.72–0.88
    - `nightFactor(t): number` 0 from 0.12 to 0.80; rises linearly to 1 at 0.88; stays 1 until 0.04; falls linearly to 0 at 0.12
    - `sunDirection(t): {x, y, z}` unit vector, y > 0 by day, highest at t = 0.5
    - `skyColors(t): { top, horizon, sun, ambient, fog }` hex numbers, smoothly blended between phase key colours
  - `sky.js`: `createSky(scene, renderer): { update(t: number, elapsed: number): void, sunLight }`

- [ ] **Step 1: Write the failing tests**

```js
test('advance wraps', () => { expect(advance(0.99, 480 * 0.02)).toBeCloseTo(0.01); });
test('one full day is 480 s', () => { expect(advance(0.3, 480)).toBeCloseTo(0.3); });
test('phases', () => {
  expect(phaseAt(0.0)).toBe('night'); expect(phaseAt(0.2)).toBe('morning'); expect(phaseAt(0.5)).toBe('day');
  expect(phaseAt(0.58)).toBe('golden'); expect(phaseAt(0.8)).toBe('sunset'); expect(phaseAt(0.95)).toBe('night');
});
test('night factor', () => {
  expect(nightFactor(0.5)).toBe(0); expect(nightFactor(0.95)).toBe(1); expect(nightFactor(0.0)).toBe(1);
  expect(nightFactor(0.84)).toBeCloseTo(0.5); expect(nightFactor(0.08)).toBeCloseTo(0.5);
});
test('sun is up at noon, down at midnight', () => {
  expect(sunDirection(0.5).y).toBeGreaterThan(0.8); expect(sunDirection(0.0).y).toBeLessThan(0);
});
test('sun direction is unit length', () => { const d = sunDirection(0.3); expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1); });
test('colours are continuous across midnight', () => {
  const a = skyColors(0.999).top, b = skyColors(0.0).top;
  const ch = (c, s) => (c >> s) & 255;
  for (const s of [16, 8, 0]) expect(Math.abs(ch(a, s) - ch(b, s))).toBeLessThan(6);
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `dayCycle.js`.** Key colours per phase are the builder's choice: peach/gold for golden, pink-orange for sunset, deep soft blue (never black) for night, pale warm for morning.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Implement `sky.js` and wire into `main.js`.** Gradient sky dome from `skyColors`; one directional sun light with soft shadow map (`PCFSoftShadowMap`, 2048 map, shadow frustum covering the island); hemisphere ambient; scene fog matching `fog` colour; at night the directional light becomes a dim cool "moon" so the island stays readable; 8–10 low-poly clouds drifting slowly; a few stars fading in with `nightFactor`. `main.js` keeps `timeOfDay`, starting at `START_TIME`, advanced each frame.
- [ ] **Step 6: Verify in the browser.** Screenshot at start (golden light, long soft shadows). Temporarily set `START_TIME` to 0.95 and 0.25, screenshot each; expected: soft blue night with stars, pale morning. Restore 0.58.
- [ ] **Step 7: Commit.** `git commit -am "feat: day cycle, sky, sun and fog"` (after `git add -A`)

---

### Task 3: Player, input, camera, collision

**Files:**
- Create: `src/logic/collision.js`, `src/logic/time.js`, `src/input.js`, `src/camera.js`, `src/actors/figure.js`, `src/actors/player.js`
- Modify: `src/config.js`, `src/main.js`
- Test: `tests/collision.test.js`, `tests/time.test.js`, `tests/input.test.js`

**Interfaces:**
- Consumes: `heightAt`, `wadeSpeedFactor`, `constrainToShore` (Task 1).
- Produces:
  - `config.js`: `WALK_SPEED = 3.5`, `RUN_SPEED = 7`, `HOP_VELOCITY = 4.5`, `GRAVITY = 14`, `PLAYER_RADIUS = 0.35`, `MAX_DT = 0.05`, `CAMERA = { distance: 7, minDistance: 4, maxDistance: 11, minPitch: 10, maxPitch: 60 }` (degrees).
  - `time.js`: `clampDt(dt: number): number` → between 0 and `MAX_DT`.
  - `collision.js`: collider is `{x, z, r}` (circle) or `{x, z, hw, hd, rot}` (box: half width, half depth, rotation in radians about y). `resolveCollisions(pos: {x,z}, radius: number, colliders: Collider[]): {x,z}`.
  - `input.js`: `createInput(keyTarget, pointerTarget): { move: {x, z}, run: boolean, consumeHop(): boolean, consumeInteract(): boolean, consumeMute(): boolean, consumeLook(): {dx, dy}, consumeZoom(): number, anyKeyPressed: boolean }`. `move` is a vector with length <= 1 (x right, z forward). `consume*` return the value once and reset. All held keys clear on the target's `blur` event.
  - `figure.js`: `createFigure({ bodyColor, accent? }): { group, animate(speed: number, elapsed: number, opts?: { sitting?: boolean, wobble?: number }) }`. A rounded body, round head, two dot eyes, stubby arms and legs. `accent` is one of `'hat' | 'scarf' | 'bow' | 'cap' | 'apron' | 'flower'` or undefined.
  - `player.js`: `createPlayer(scene): { position: Vector3, facing: {x, z}, radius, sitting: boolean, sit(seat: {x, z, rot}): void, update(dt, input, cameraYaw, colliders): void }`.
  - `camera.js`: `createFollowCamera(camera): { yaw: number, update(dt, targetPosition, input, colliders): void }`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/time.test.js
test('clampDt', () => { expect(clampDt(5)).toBe(0.05); expect(clampDt(0.016)).toBe(0.016); expect(clampDt(-1)).toBe(0); });

// tests/collision.test.js
test('clear position is untouched', () => {
  expect(resolveCollisions({ x: 5, z: 5 }, 0.35, [{ x: 0, z: 0, r: 1 }])).toEqual({ x: 5, z: 5 });
});
test('pushed out of a circle', () => {
  const p = resolveCollisions({ x: 0.5, z: 0 }, 0.35, [{ x: 0, z: 0, r: 1 }]);
  expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.35);
});
test('pushed out of a box', () => {
  const p = resolveCollisions({ x: 1.9, z: 0 }, 0.35, [{ x: 0, z: 0, hw: 2, hd: 1.5, rot: 0 }]);
  expect(p.x).toBeCloseTo(2.35); expect(p.z).toBeCloseTo(0);
});
test('rotated box', () => {
  const p = resolveCollisions({ x: 0, z: 1.9 }, 0.35, [{ x: 0, z: 0, hw: 2, hd: 1.5, rot: Math.PI / 2 }]);
  expect(p.z).toBeCloseTo(2.35);
});
test('exact centre of a circle does not produce NaN', () => {
  const p = resolveCollisions({ x: 0, z: 0 }, 0.35, [{ x: 0, z: 0, r: 1 }]);
  expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
  expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.35);
});

// tests/input.test.js  (use `new EventTarget()` for both targets; dispatch plain Events with a `code` property)
test('W moves forward, W+D is normalised', () => { /* keydown KeyW -> move {x:0,z:1}; + KeyD -> length ≈ 1 */ });
test('arrow keys work like WASD', () => { /* ArrowLeft -> move.x === -1 */ });
test('held keys clear on blur', () => { /* keydown KeyW, ShiftLeft; dispatch blur; move is {0,0}, run false */ });
test('interact is consumed once', () => { /* keydown KeyE; consumeInteract() true then false */ });
test('holding E does not repeat', () => { /* keydown KeyE with repeat:true is ignored */ });
```

Write the three placeholder-comment tests as real assertions matching the comments.

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `time.js`, `collision.js`, `input.js`.** Mouse: left-button drag accumulates look deltas; wheel accumulates zoom.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Implement `figure.js`, `player.js`, `camera.js`; wire `main.js`.** Player update order: movement vector rotated by camera yaw → speed (`RUN_SPEED` if run else `WALK_SPEED`) × `wadeSpeedFactor(heightAt(pos))` → `resolveCollisions` → `constrainToShore` → y follows `max(heightAt, 0 - MAX_WADE_DEPTH)` plus hop arc. The figure turns smoothly toward its movement direction. Any movement key while sitting stands the player up. Camera: orbits the player from yaw/pitch/distance, smoothed, pitch and distance clamped to `CAMERA`; if a collider or the terrain is between camera and player, pull the camera closer. `main.js` uses `clampDt` on every frame's delta. Player starts at (10, 14) facing the village centre.
- [ ] **Step 6: Verify in the browser.** Use Playwright key presses: hold W for 2 s then screenshot (player moved, limbs swinging); run into the sea (player slows and stops at knee depth, no hard jolt); drag to orbit. No console errors.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat: player movement, camera, collision"`

---

### Task 4: Village and scenery

**Files:**
- Create: `src/logic/layout.js`, `src/world/village.js`, `src/world/scatter.js`
- Modify: `src/main.js`
- Test: `tests/layout.test.js`

**Interfaces:**
- Consumes: `createRng`, `heightAt`, `zoneAt`, collider shapes.
- Produces `layout.js` (all fixed data; exact coordinates are the builder's choice within these rules):
  - `VILLAGE_CENTER = { x: 10, z: 8 }`
  - `COTTAGES`: 6 of `{ id, x, z, rot, wallColor, roofColor, door: {x, z, rot} }`, arranged in a loose ring 9–14 m from `VILLAGE_CENTER`, doors facing the centre. Footprint 5 x 4 m.
  - `BELL = {x, z}` at `VILLAGE_CENTER`
  - `DOCK = { x, z, rot, length: 10 }` on the east shore, running out over the water; `BOAT = {x, z, rot}` beside it
  - `CAMPFIRE = {x, z}` on the south-west beach (zone `'sand'`); `SEATS`: 2 log seats by the campfire + 2 benches in the square, each `{ id, x, z, rot }`
  - `LOOKOUT = { x: -18, z: -22 }` (a small fence and a bench count as one of the scenery pieces; its bench is a 5th entry in `SEATS`)
  - `LANTERNS`: 8 of `{ id, x, z }` along the paths
  - `PATHS`: polylines `[{x,z}, ...]` joining square ↔ each cottage door, square ↔ dock, square ↔ campfire, square ↔ lookout
  - `FENCES`: a few short runs `[{x,z},{x,z}]`
  - `CHICKEN_YARD = { x, z, r: 3 }`, `CAT_SPOT = { x, z }`
  - `VILLAGER_SPOTS`: at least 10 `{x, z}` standing spots on paths and in the square. `VILLAGER_SPOTS[0]` must have 2 m of clear ground around it (Task 6 tests nudge from there)
  - `getScatter(): { trees: {id,x,z,scale,rot}[], bushes: [...], flowers: [...], rocks: [...] }` — 40 trees, 30 bushes, 150 flowers, 25 rocks, generated once from `createRng(SEED)` and cached
  - `getColliders(): Collider[]` — boxes for cottages and fences, circles for tree trunks (r 0.4), rocks, bell post, lantern posts, campfire, boat
  - `distanceToPath(x, z): number`
- `village.js`: `createVillage(scene): { windows: Mesh[], setNight(f: number): void }`
- `scatter.js`: `createScatter(scene): { shakeTree(id: string, elapsed: number): void, update(elapsed: number): void }` using `InstancedMesh`.

- [ ] **Step 1: Write the failing tests**

```js
test('six cottages on dry grass', () => {
  expect(COTTAGES).toHaveLength(6);
  for (const c of COTTAGES) expect(zoneAt(c.x, c.z)).toBe('grass');
});
test('cottages do not overlap each other', () => { /* every pair of centres > 6.5 m apart */ });
test('counts', () => {
  const s = getScatter();
  expect(s.trees).toHaveLength(40); expect(s.bushes).toHaveLength(30);
  expect(s.flowers).toHaveLength(150); expect(s.rocks).toHaveLength(25);
  expect(LANTERNS).toHaveLength(8); expect(SEATS).toHaveLength(5); expect(VILLAGER_SPOTS.length).toBeGreaterThanOrEqual(10);
});
test('scatter is the same every time', () => { expect(getScatter()).toEqual(getScatter()); });
test('trees are on grass, off paths, clear of cottages', () => {
  for (const t of getScatter().trees) {
    expect(zoneAt(t.x, t.z)).toBe('grass');
    expect(distanceToPath(t.x, t.z)).toBeGreaterThan(1.5);
    for (const c of COTTAGES) expect(Math.hypot(t.x - c.x, t.z - c.z)).toBeGreaterThan(4.5);
  }
});
test('campfire is on sand, lanterns and spots on dry land', () => {
  expect(zoneAt(CAMPFIRE.x, CAMPFIRE.z)).toBe('sand');
  for (const p of [...LANTERNS, ...VILLAGER_SPOTS]) expect(heightAt(p.x, p.z)).toBeGreaterThan(0.3);
});
test('player start and villager spots are not inside a collider', () => {
  for (const p of [{ x: 10, z: 14 }, ...VILLAGER_SPOTS])
    expect(resolveCollisions(p, 0.35, getColliders())).toEqual(p);
});
test('every cottage door is reachable: the spot 1.2 m in front of it is clear', () => { /* same check for door front points */ });
```

Write the two placeholder-comment tests as real assertions.

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `layout.js`.** Scatter uses rejection sampling against the rules in the tests.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Implement `village.js` and `scatter.js`; wire `main.js`.** Cottages: pastel walls, contrasting pitched roof, chimney, two windows (emissive strength driven by `setNight`), a door opening with a dark inset (the door leaf itself is added in Task 5). Paths: slightly raised dirt-coloured strips following the terrain. Dock: planks and posts; boat: simple hull bobbing on the water. Trees in two or three shapes (round, cone, blossom) as instanced trunk + canopy; flowers in clusters with several pastel colours; everything casts and receives shadow except flowers. `shakeTree` wobbles that instance for about 0.8 s. Colliders from `getColliders()` are passed to the player and camera.
- [ ] **Step 6: Verify in the browser.** Screenshot from the start position and from the hill. Expected: a readable little village, nothing floating or buried, player cannot walk through cottages or trees. Check the frame rate stays at 60 (log average frame time for 5 s; expected below 17 ms).
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat: village, paths, dock and scenery"`

---

### Task 5: Using items

**Files:**
- Create: `src/logic/interact.js`, `src/world/props.js`, `src/ui.js`
- Modify: `src/config.js`, `src/main.js`, `index.html`
- Test: `tests/interact.test.js`

**Interfaces:**
- Consumes: layout data, `createScatter().shakeTree`, `player.sit`, `nightFactor`.
- Produces:
  - `config.js`: `INTERACT_RANGE = 2.2`, `INTERACT_CLOSE = 0.8`, `INTERACT_CONE = 0.2`.
  - Interactable shape: `{ id: string, kind: string, position: {x, z}, enabled?: boolean, prompt(): string, interact(ctx): void, highlight?(on: boolean): void }`.
  - `interact.js`: `pickInteractable(player: {x, z}, facing: {x, z}, items: Interactable[]): Interactable | null`. Eligible when `enabled !== false` and distance <= `INTERACT_RANGE` and (distance <= `INTERACT_CLOSE` or the dot product of `facing` and the unit direction to the item > `INTERACT_CONE`). Nearest eligible wins.
  - `props.js`: `createProps(scene, deps): { interactables: Interactable[], update(dt, elapsed, nightF): void, onBell(cb: (pos) => void): void }` where `deps = { scatter, player, ui }`.
  - `ui.js`: `createUI(scene): { showHint(): void, hideHint(): void, setPrompt(text: string | null): void, emote(position: Vector3, icon: 'heart' | 'note' | 'surprise' | 'zzz'): void, update(dt, camera): void }`.
  - Prompt copy, exactly: `E — light lantern` / `E — put out lantern`, `E — open door` / `E — close door`, `E — ring bell`, `E — sit`, `E — shake tree`, `E — light fire` / `E — put out fire`.

- [ ] **Step 1: Write the failing tests**

```js
const item = (id, x, z, extra = {}) => ({ id, position: { x, z }, ...extra });
test('nothing in range', () => { expect(pickInteractable({ x: 0, z: 0 }, { x: 0, z: 1 }, [item('a', 0, 5)])).toBeNull(); });
test('picks item in front', () => { expect(pickInteractable({ x: 0, z: 0 }, { x: 0, z: 1 }, [item('a', 0, 2)]).id).toBe('a'); });
test('ignores item behind', () => { expect(pickInteractable({ x: 0, z: 0 }, { x: 0, z: 1 }, [item('a', 0, -2)])).toBeNull(); });
test('very close item counts even if behind', () => { expect(pickInteractable({ x: 0, z: 0 }, { x: 0, z: 1 }, [item('a', 0, -0.5)]).id).toBe('a'); });
test('nearest wins', () => {
  expect(pickInteractable({ x: 0, z: 0 }, { x: 0, z: 1 }, [item('far', 0, 2), item('near', 0.2, 1)]).id).toBe('near');
});
test('disabled items are skipped', () => {
  expect(pickInteractable({ x: 0, z: 0 }, { x: 0, z: 1 }, [item('a', 0, 1, { enabled: false })])).toBeNull();
});
test('standing exactly on an item does not break', () => {
  expect(pickInteractable({ x: 0, z: 0 }, { x: 0, z: 1 }, [item('a', 0, 0)]).id).toBe('a');
});
test('empty list', () => { expect(pickInteractable({ x: 0, z: 0 }, { x: 0, z: 1 }, [])).toBeNull(); });
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `interact.js`.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Implement `ui.js`.** `#hint` shows the exact start-hint copy, fades out 6 s after the first key press. `#prompt` is a small rounded pill near the bottom centre. Emotes are camera-facing sprites drawn on a small canvas texture (pictures only), popping up above `position`, floating up and fading over 1.5 s.
- [ ] **Step 6: Implement `props.js`; wire `main.js`.** Each frame: `pickInteractable` → `setPrompt(item ? item.prompt() : null)` and highlight (a gentle scale pulse or emissive lift) → on `consumeInteract()` call `item.interact()`. While the player is sitting, E does nothing and no prompt shows.
  - Lantern (8): post + glass; toggles a warm emissive glow and a `PointLight` (no shadow). Lanterns turn on by themselves when `nightFactor` first passes 0.5 rising, and off when it passes 0.5 falling; the player can toggle any time.
  - Door (6): a leaf hinged at one side swings open about 100° or shut over 0.4 s. An open door does not block; a closed one is part of the cottage box.
  - Bell: swings for 1.5 s and calls the `onBell` callbacks with its position.
  - Seat (5): `player.sit(seat)`.
  - Tree (40): `scatter.shakeTree(id)`, plus 4–6 leaf particles (or one round fruit, 1 time in 4) that fall and fade.
  - Campfire: toggles flames (a few animated cones), a flickering warm light and rising sparks. Starts unlit.
- [ ] **Step 7: Verify in the browser.** Walk to a lantern, door, the bell, a bench, a tree, the campfire; press E at each; screenshot each result. Expected: correct prompt text, visible change, repeatable, no console errors.
- [ ] **Step 8: Commit.** `git add -A && git commit -m "feat: interactable items, prompt and hint"`

---

### Task 6: Villagers and animals

**Files:**
- Create: `src/logic/villagerBrain.js`, `src/actors/villagers.js`, `src/actors/animals.js`
- Modify: `src/config.js`, `src/main.js`
- Test: `tests/villagerBrain.test.js`

**Interfaces:**
- Consumes: `VILLAGER_SPOTS`, `getColliders`, `resolveCollisions`, `heightAt`, `createFigure`, `ui.emote`, `props.onBell`, Interactable shape.
- Produces:
  - `config.js`: `VILLAGER_COUNT = 6`, `VILLAGER_SPEED = 1.2`, `VILLAGER_RADIUS = 0.35`, `VILLAGER_PAUSE = [2, 6]` (seconds), `NUDGE_DISTANCE = 1.2`, `NUDGE_TIME = 0.4`, `NUDGE_COOLDOWN = 1.5`, `BELL_HEAR_RANGE = 25`, `BELL_LOOK_TIME = 2`, `MIN_DRY_HEIGHT = 0.3`.
  - `villagerBrain.js`:
    - `createVillager(id: string, start: {x, z}, rng): Villager` where `Villager = { id, x, z, facing: {x, z}, state: 'idle' | 'walk' | 'nudged' | 'look', timer, cooldown, target, speed }` (speed is the current ground speed, for animation)
    - `stepVillager(v, dt, world: { spots: {x,z}[], colliders: Collider[], rng }): void` — idle: wait `timer`, then pick a different spot and walk; walk: move at `VILLAGER_SPEED` toward target, idle on arrival with a pause from `VILLAGER_PAUSE`; nudged: slide toward the nudge end point over `NUDGE_TIME`, then idle; look: face the point for `timer`, then resume walking. Position is always passed through `resolveCollisions` and never moves to where `heightAt < MIN_DRY_HEIGHT`.
    - `nudgeVillager(v, from: {x, z}): boolean` — false while `cooldown > 0`; otherwise sets state `'nudged'`, aims `NUDGE_DISTANCE` directly away from `from`, sets `cooldown = NUDGE_COOLDOWN`, returns true.
    - `hearBell(v, bell: {x, z}): void` — within `BELL_HEAR_RANGE` and not nudged → state `'look'` for `BELL_LOOK_TIME`.
  - `villagers.js`: `createVillagers(scene, deps): { colliders(): Collider[], interactables: Interactable[], update(dt, elapsed, player): void }`. Prompt copy, exactly: `E — nudge`.
  - `animals.js`: `createAnimals(scene, deps): { interactables: Interactable[], update(dt, elapsed, player): void }`. Prompt copy, exactly: `E — shoo chickens`, `E — pet cat`.

- [ ] **Step 1: Write the failing tests**

```js
const world = () => ({ spots: VILLAGER_SPOTS, colliders: getColliders(), rng: createRng(7) });
const run = (v, w, seconds, dt = 0.05) => { for (let t = 0; t < seconds; t += dt) stepVillager(v, dt, w); };

test('starts idle then walks', () => {
  const w = world(); const v = createVillager('a', VILLAGER_SPOTS[0], w.rng);
  expect(v.state).toBe('idle'); run(v, w, 7); expect(['walk', 'idle']).toContain(v.state);
  expect(Math.hypot(v.x - VILLAGER_SPOTS[0].x, v.z - VILLAGER_SPOTS[0].z)).toBeGreaterThan(0.5);
});
test('never faster than walking speed', () => {
  const w = world(); const v = createVillager('a', VILLAGER_SPOTS[0], w.rng);
  for (let i = 0; i < 2000; i++) { const px = v.x, pz = v.z; stepVillager(v, 0.05, w); expect(Math.hypot(v.x - px, v.z - pz)).toBeLessThanOrEqual(1.2 * 0.05 + 1e-6); }
});
test('nudge pushes away and reports true', () => {
  const w = world(); const S = VILLAGER_SPOTS[0]; const v = createVillager('a', S, w.rng);
  expect(nudgeVillager(v, { x: S.x, z: S.z - 1 })).toBe(true); expect(v.state).toBe('nudged');
  run(v, w, 0.5); expect(v.z).toBeGreaterThan(S.z + 0.5); expect(v.state).toBe('idle');
});
test('nudge has a cooldown', () => {
  const w = world(); const S = VILLAGER_SPOTS[0]; const v = createVillager('a', S, w.rng);
  const from = { x: S.x, z: S.z - 1 };
  nudgeVillager(v, from); expect(nudgeVillager(v, from)).toBe(false);
  run(v, w, 1.6); expect(nudgeVillager(v, from)).toBe(true);
});
test('cannot be nudged into the sea or into a wall', () => {
  const w = world(); const v = createVillager('a', { x: -55, z: 0 }, w.rng);   // on the west beach, pushed seaward 40 times
  for (let i = 0; i < 40; i++) { nudgeVillager(v, { x: v.x + 1, z: v.z }); run(v, w, 1.6); }
  expect(heightAt(v.x, v.z)).toBeGreaterThanOrEqual(0.3);
  expect(resolveCollisions({ x: v.x, z: v.z }, 0.35, w.colliders)).toEqual({ x: v.x, z: v.z });
});
test('a huge time step still leaves the villager somewhere legal', () => {
  const w = world(); const v = createVillager('a', VILLAGER_SPOTS[0], w.rng); run(v, w, 7);
  stepVillager(v, 5, w);
  expect(heightAt(v.x, v.z)).toBeGreaterThanOrEqual(0.3);
  expect(resolveCollisions({ x: v.x, z: v.z }, 0.35, w.colliders)).toEqual({ x: v.x, z: v.z });
});
test('hears the bell when near, not when far', () => {
  const w = world(); const near = createVillager('a', { x: 12, z: 8 }, w.rng); const far = createVillager('b', { x: -30, z: 40 }, w.rng);
  hearBell(near, { x: 10, z: 8 }); hearBell(far, { x: 10, z: 8 });
  expect(near.state).toBe('look'); expect(far.state).not.toBe('look');
  run(near, w, 2.1); expect(near.state).not.toBe('look');
});
test('nudge from the exact same spot does not produce NaN', () => {
  const w = world(); const S = VILLAGER_SPOTS[0]; const v = createVillager('a', S, w.rng);
  nudgeVillager(v, { x: S.x, z: S.z }); run(v, w, 0.5); expect(Number.isFinite(v.x) && Number.isFinite(v.z)).toBe(true);
});
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `villagerBrain.js`.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Implement `villagers.js`.** Six figures, each a different pastel body colour and a different `accent`. Each frame: step the brain, place the figure on `heightAt`, animate with `v.speed`. A nudge happens when the player presses E on a villager, or when the player's circle overlaps a villager's while the player is moving. On a successful nudge: wobble animation, a small hop, `ui.emote` with a random one of `'heart' | 'note' | 'surprise'`, and the squeak sound hook (a no-op until Task 7). Villagers are circle colliders for the player. Register `props.onBell` → `hearBell` for all.
- [ ] **Step 6: Implement `animals.js`.** Four chickens in `CHICKEN_YARD`: peck and potter; on E (or when the player runs through) they scatter up to 4 m with flapping, then drift back within 5 s. One cat at `CAT_SPOT`: sits, tail flicks, turns its head to the player when near; on E it leans in and `ui.emote(..., 'heart')`. Animals are not colliders.
- [ ] **Step 7: Verify in the browser.** Screenshot villagers strolling; walk into one (wobble, hop away, emote); ring the bell (nearby villagers turn); shoo chickens; pet the cat. No console errors, frame time still below 17 ms.
- [ ] **Step 8: Commit.** `git add -A && git commit -m "feat: villagers, nudging, chickens and cat"`

---

### Task 7: Sound

**Files:**
- Create: `src/audio.js`
- Modify: `src/main.js`, `src/world/props.js`, `src/actors/villagers.js`, `src/actors/animals.js`, `src/actors/player.js`
- Test: `tests/audio.test.js`

**Interfaces:**
- Produces `audio.js`: `createAudio(makeContext?: () => AudioContext): { start(): void, toggleMute(): boolean, muted: boolean, started: boolean, setNight(f: number): void, play(name: 'lantern' | 'door' | 'bell' | 'sit' | 'rustle' | 'fire' | 'squeak' | 'cluck' | 'purr' | 'step' | 'splash'): void }`. `makeContext` defaults to `() => new AudioContext()`. `toggleMute` returns the new muted value. Before `start()`, and when no audio context can be made, `play` and `setNight` do nothing and never throw.

- [ ] **Step 1: Write the failing tests** (Node has no `AudioContext`, which is the point)

```js
test('play before start does nothing and does not throw', () => { const a = createAudio(); expect(() => a.play('bell')).not.toThrow(); expect(a.started).toBe(false); });
test('mute before start is remembered', () => { const a = createAudio(); expect(a.toggleMute()).toBe(true); expect(a.muted).toBe(true); expect(a.toggleMute()).toBe(false); });
test('start survives a missing audio context', () => {
  const a = createAudio(() => { throw new Error('no audio'); });
  expect(() => a.start()).not.toThrow(); expect(() => a.play('bell')).not.toThrow();
});
test('start is safe to call twice', () => {
  let made = 0; const a = createAudio(() => { made++; throw new Error('no audio'); });
  a.start(); a.start(); expect(made).toBe(1);
});
test('unknown sound name does not throw', () => { const a = createAudio(); expect(() => a.play('nope')).not.toThrow(); });
```

- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `audio.js`.** Ambience: filtered noise for waves with a slow swell, quieter filtered noise for wind; at night (`setNight`) add sparse soft cricket chirps and lower the wind. Effects are short synthesised sounds: soft sine/triangle plucks and chimes on a pentatonic scale so nothing clashes; the bell is a longer chime with a few partials; footsteps are tiny soft noise ticks, `splash` instead when wading. One master gain; mute ramps it to 0 over 0.1 s. Overall volume gentle.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Wire it up.** `main.js`: call `audio.start()` on the first key press or click; `consumeMute()` → `toggleMute()`; pass `nightFactor` each frame. Call `play(...)` from each interaction, nudge, chicken scatter, cat pet, and from player footfalls (one per stride; `splash` when `heightAt < 0`).
- [ ] **Step 6: Verify in the browser.** Press a key, then check `audio.started` is true and the context state is `running` via the console; press M and confirm the master gain is 0; no console errors. Sound quality itself is for the owner to judge by ear.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat: synthesised ambience and effects"`

---

### Task 8: Polish pass and handover

**Files:**
- Create: `README.md`
- Modify: whatever the checks below turn up

- [ ] **Step 1: Look pass.** Take screenshots at golden hour, sunset, night and morning from: the start spot, the square, the dock, the campfire and the lookout. Fix anything that breaks the spec's look: harsh or flat lighting, colours that clash, pieces floating or sunk, visible seams, shadow acne, pitch-black night. Lantern and window glow must read clearly at night.
- [ ] **Step 2: Feel pass.** Play for five minutes with the keyboard. Fix: camera clipping into cottages, snagging on corners, jittery turning, prompts that flicker between two items, anything reachable that should not be (roofs, inside cottages, beyond knee depth).
- [ ] **Step 3: Performance check.** Log average and worst frame time over 30 s while running through the village at night with all lanterns on. Expected: average below 17 ms. If not, reduce shadow map cost or the number of real lantern lights first.
- [ ] **Step 4: Run `npm test` and `npm run build`.** Expected: all tests pass, build succeeds with no errors.
- [ ] **Step 5: Write `README.md`.** First line `Classification: INTERNAL`. Then: what it is (two lines), how to run (`npm install`, `npm run dev`, open the printed address), the controls, and a note that there is no saving.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "chore: polish, performance check, readme"`
