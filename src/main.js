import * as THREE from 'three';
import { createIsland } from './world/island.js';
import { createSky } from './world/sky.js';
import { createVillage } from './world/village.js';
import { createBuildings } from './world/buildings.js';
import { createCampProps } from './world/campProps.js';
import { createScatter } from './world/scatter.js';
import { createPond } from './world/pond.js';
import { createZipline } from './world/zipline.js';
import { createProps } from './world/props.js';
import { createInput } from './input.js';
import { createPlayer } from './actors/player.js';
import { createVillagers } from './actors/villagers.js';
import { createActivities } from './actors/activities.js';
import { createAnimals } from './actors/animals.js';
import { createWildlife } from './actors/wildlife.js';
import { createFollowCamera } from './camera.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { createHUD } from './hud.js';
import { createEffects } from './effects.js';
import { createJournal, clockText, phaseLabel } from './logic/journal.js';
import { getColliders, groundAt, DOCK, LOOKOUT, CAMPFIRE, WINDMILL } from './logic/layout.js';
import { surfaceAt, SURFACES, pondDistance } from './logic/surface.js';
import { pickInteractable } from './logic/interact.js';
import { advance, nightFactor, phaseAt } from './logic/dayCycle.js';
import { clampDt } from './logic/time.js';
import { START_TIME, POND } from './config.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.localClippingEnabled = true; // lets a tent be sliced open while you are inside it

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6d9b8);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1200);

// Debug aids: ?t=0.95 starts at that time of day, ?freeze stops the clock.
const params = new URLSearchParams(location.search);
let timeOfDay = params.has('t') ? Number(params.get('t')) : START_TIME;
const freezeTime = params.has('freeze');

let elapsed = 0;
const audio = createAudio();
const ui = createUI(scene);
const effects = createEffects(scene, groundAt);
const island = createIsland(scene);
const sky = createSky(scene, renderer);
const village = createVillage(scene);
const buildings = createBuildings(scene, { audio });
createCampProps(scene);
const scatter = createScatter(scene);
const pond = createPond(scene);
const input = createInput(window, canvas);
const player = createPlayer(scene, { groundAt, surfaceAt, surfaces: SURFACES });
const rig = createFollowCamera(camera);
const props = createProps(scene, { scatter, player, ui, audio, now: () => elapsed });
const villagers = createVillagers(scene, { ui, audio, player });
const activities = createActivities(scene, { ui, audio });
const animals = createAnimals(scene, { ui, audio, player });
const wildlife = createWildlife(scene, { ui, audio });
const zipline = createZipline(scene, { ui, audio, player });
props.onBell((pos) => villagers.hearBell(pos));

// ---- Feet on the ground: every surface sounds and reacts differently -------
let stepCount = 0, dayNumber = 1;
player.onStep = (surface, running) => {
  stepCount++;
  audio.play(`step:${surface}`);
  effects.step(surface, player.position, player.heading, running);
  if (surface === 'sand') discover('place-beach');
  if (surface === 'water' && pondDistance(player.position.x, player.position.z) < POND.rw) discover('place-pond');
};
player.onLand = (surface) => { audio.play(`step:${surface}`); effects.land(surface, player.position); };

// Buildings are hollow for the player (walls with a doorway); everyone else treats them as solid.
const allStatic = getColliders();
const openStatic = allStatic.filter((c) => !c.building);
const interactables = [...props.interactables, ...buildings.interactables, ...zipline.interactables, ...villagers.interactables, ...activities.interactables, ...animals.interactables, ...wildlife.interactables];
const playerXZ = { x: 0, z: 0 };

// A different movement for each kind of thing you do: [gesture, seconds].
const GESTURES = {
  lantern: ['reachUp', 0.8], door: ['push', 0.7], bell: ['pull', 1.1], flag: ['pull', 1.3], tree: ['shake', 0.9], campfire: ['crouch', 1.0],
  chickens: ['shoo', 0.9], cat: ['crouch', 1.1], sheep: ['pat', 0.9], telescope: ['peer', 1.5],
};
const GREETINGS = [['wave', 0.9], ['salute', 0.9], ['cheer', 1.0], ['clap', 0.9]];
let greetings = 0;

// ---- Interface: journal, ranks, clock, minimap, menu -----------------------
const journal = createJournal();
function refreshProgress() { hud.setProgress(journal.list(), journal.rank(), journal.count, journal.total); }
function discover(id) {
  const before = journal.rank().index;
  const d = journal.mark(id);
  if (!d) return;
  hud.toast(d.label, journal.count, journal.total);
  refreshProgress();
  const rank = journal.rank();
  if (rank.index > before) { hud.rankUp(rank.name); audio.play('rank'); } else audio.play('discover');
}
function toggleSound() { hud.setSound(!audio.toggleMute()); }
function toggleMenu() {
  if (!hud.started) return;
  if (hud.menuOpen) hud.closeMenu(); else hud.openMenu();
}
function toggleJournal() { if (hud.started) { hud.toggleJournal(); audio.play('ui'); } }
const hud = createHUD({
  onResume: () => hud.closeMenu(),
  onToggleMenu: toggleMenu,
  onToggleSound: toggleSound,
  onToggleJournal: toggleJournal,
  onSetTime: (t) => { timeOfDay = t; },
});
refreshProgress();
const dockEnd = { x: DOCK.x + Math.sin(DOCK.rot) * (DOCK.length - 1.5), z: DOCK.z + Math.cos(DOCK.rot) * (DOCK.length - 1.5) };
const PLACES = [['place-dock', dockEnd, 2.2], ['place-lookout', LOOKOUT, 5.5], ['place-camp', CAMPFIRE, 6], ['place-windmill', WINDMILL, 6.5]];

// The first key press or click leaves the start screen. Browsers only allow sound after that.
const wake = () => {
  if (hud.started) return;
  audio.start(); hud.begin(); ui.showHint(); ui.hideHintSoon(10);
  // Whatever key started the game should not also hop, mute or use something.
  input.consumeHop(); input.consumeInteract(); input.consumeMute();
};
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!hud.started) { wake(); return; }
  if (e.repeat) return;
  if (e.code === 'KeyJ' || e.code === 'Tab') { e.preventDefault(); if (!hud.menuOpen) toggleJournal(); }
  // Esc closes the journal first, then opens the pause menu.
  if (e.code === 'Escape') { if (hud.journalOpen && !hud.menuOpen) toggleJournal(); else toggleMenu(); }
});
window.addEventListener('pointerdown', wake);
// Debug aids for automated screenshots: ?play skips the start screen, ?x=&z=&yaw= place the player and camera.
if (params.has('play')) wake();
if (params.has('x')) { player.position.x = Number(params.get('x')); player.position.z = Number(params.get('z') || 0); player.position.y = groundAt(player.position.x, player.position.z); }
if (params.has('yaw')) rig.yaw = Number(params.get('yaw'));
if (params.has('journal')) hud.toggleJournal();
if (params.has('ride')) zipline.interactables[0].interact();
if (params.has('found')) ['flag', 'bell', 'cat', 'place-beach', 'tree'].slice(0, Number(params.get('found')) || 5).forEach(discover);
// Leaving the window pauses the game, so nothing happens while you are away.
window.addEventListener('blur', () => { if (hud.started && !hud.menuOpen) toggleMenu(); });

function onResize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
// Moving between a Retina and a normal display changes the pixel ratio without a resize.
let lastRatio = window.devicePixelRatio;
setInterval(() => { if (window.devicePixelRatio !== lastRatio) { lastRatio = window.devicePixelRatio; onResize(); } }, 1000);

const stats = { frames: 0, total: 0, worst: 0 };
let last = performance.now();

function step() {
  const now = performance.now();
  const raw = (now - last) / 1000;
  last = now;
  stats.frames++; stats.total += raw; stats.worst = Math.max(stats.worst, raw);
  const paused = !hud.started || hud.menuOpen;
  // While paused the world stands still; only the picture keeps refreshing.
  const dt = paused ? 0 : clampDt(raw);
  elapsed += dt;

  if (!freezeTime) {
    const before = timeOfDay;
    timeOfDay = advance(timeOfDay, dt);
    if (timeOfDay < before && dt > 0) dayNumber++;
  }
  const night = nightFactor(timeOfDay);

  if (paused) {
    // Keys pressed on the start screen or in the menu must not fire when play resumes.
    input.consumeHop(); input.consumeInteract(); input.consumeMute(); input.consumeLook(); input.consumeZoom();
    if (!hud.started) rig.yaw += clampDt(raw) * 0.08; // a slow turn behind the title
  } else if (input.consumeMute()) toggleSound();
  audio.setNight(night);

  if (!paused) {
    const colliders = openStatic.concat(buildings.colliders(), villagers.colliders(), activities.colliders(), wildlife.colliders());
    zipline.update(dt, elapsed, player);
    player.update(dt, input, rig.yaw, colliders, elapsed);
    buildings.update(dt, elapsed, player);
    villagers.update(dt, elapsed, player);
    activities.update(dt, elapsed);
    animals.update(dt, elapsed, player);
    wildlife.update(dt, elapsed, player);
    pond.update(dt, elapsed, night);
  }

  // What would E do right now?
  playerXZ.x = player.position.x; playerXZ.z = player.position.z;
  const pressed = input.consumeInteract();
  const target = paused || player.sitting || player.riding ? null : pickInteractable(playerXZ, player.facing, interactables);
  if (target) {
    ui.setPrompt(target.prompt());
    ui.setMarker(target.position.x, target.markerY, target.position.z);
    if (pressed) {
      const g = target.kind === 'villager' ? GREETINGS[greetings++ % GREETINGS.length] : GESTURES[target.kind];
      if (g) player.gesture(g[0], g[1], target.position);
      target.interact();
      discover(target.kind);
    }
  } else {
    ui.setPrompt(null);
    ui.setMarker(null);
  }

  if (!paused) {
    for (const [id, p, r] of PLACES) if (!journal.has(id) && Math.hypot(playerXZ.x - p.x, playerXZ.z - p.z) < r) discover(id);
    if (buildings.inside) discover('place-inside');
  }
  const ground = SURFACES[player.riding ? 'wood' : player.surface] || SURFACES.grass;
  hud.setGround(player.riding ? 'Flying fox' : ground.label, ground.color);
  hud.setClock(clockText(timeOfDay), phaseLabel(phaseAt(timeOfDay)), night > 0.5, dayNumber);
  hud.setSteps(stepCount);
  hud.drawMap(playerXZ, player.facing, villagers.villagers.map((v) => v.position));

  rig.update(paused ? clampDt(raw) : dt, player.position, input, allStatic, { inside: !!buildings.inside, speed: player.riding ? 8 : player.speed });
  sky.update(timeOfDay, elapsed, player.position);
  island.update(elapsed);
  island.setLight(sky.waterLight, sky.fogColor, sky.fogDensity);
  village.update(elapsed);
  village.setNight(night);
  buildings.setNight(night);
  scatter.update(elapsed);
  props.update(dt, elapsed, night);
  effects.update(dt);
  ui.update(dt, elapsed);

  renderer.render(scene, camera);
}
function frame() { step(); requestAnimationFrame(frame); }
// Debug aid for screenshots: ?settle runs a few seconds of game time before the first picture.
if (params.has('settle')) for (let i = 0; i < 70; i++) { last = performance.now() - 50; step(); }
frame();

// Handles for automated checks in the browser.
window.__game = {
  player, rig, input, stats, scene, camera, renderer, audio, interactables, villagers, props, hud, journal, buildings, zipline,
  get timeOfDay() { return timeOfDay; }, set timeOfDay(v) { timeOfDay = v; },
};
