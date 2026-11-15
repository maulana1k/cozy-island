import * as THREE from 'three';
import { createIsland } from './world/island.js';
import { createSky } from './world/sky.js';
import { createVillage } from './world/village.js';
import { createScatter } from './world/scatter.js';
import { createProps } from './world/props.js';
import { createInput } from './input.js';
import { createPlayer } from './actors/player.js';
import { createVillagers } from './actors/villagers.js';
import { createAnimals } from './actors/animals.js';
import { createWildlife } from './actors/wildlife.js';
import { createFollowCamera } from './camera.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { createHUD } from './hud.js';
import { createJournal, clockText, phaseLabel } from './logic/journal.js';
import { getColliders, groundAt, DOCK, LOOKOUT, CAMPFIRE, WINDMILL } from './logic/layout.js';
import { pickInteractable } from './logic/interact.js';
import { advance, nightFactor, phaseAt } from './logic/dayCycle.js';
import { clampDt } from './logic/time.js';
import { START_TIME } from './config.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

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
const island = createIsland(scene);
const sky = createSky(scene, renderer);
const village = createVillage(scene);
const scatter = createScatter(scene);
const input = createInput(window, canvas);
const player = createPlayer(scene, { groundAt });
const rig = createFollowCamera(camera);
const props = createProps(scene, { scatter, player, ui, audio, now: () => elapsed });
const villagers = createVillagers(scene, { ui, audio, player });
const animals = createAnimals(scene, { ui, audio, player });
const wildlife = createWildlife(scene, { ui, audio });
props.onBell((pos) => villagers.hearBell(pos));
let stepCount = 0, dayNumber = 1;
player.onStep = (inWater) => { stepCount++; audio.play(inWater ? 'splash' : 'step'); };

// ---- Interface: journal, clock, minimap, menu ------------------------------
const journal = createJournal();
function discover(id) {
  const d = journal.mark(id);
  if (!d) return;
  hud.toast(`★ ${d.label}`);
  hud.setJournal(journal.list());
}
function toggleSound() { hud.setSound(!audio.toggleMute()); }
function toggleMenu() {
  if (!hud.started) return;
  if (hud.menuOpen) hud.closeMenu(); else { hud.setJournal(journal.list()); hud.openMenu(); }
}
const hud = createHUD({
  onResume: () => hud.closeMenu(),
  onToggleMenu: toggleMenu,
  onToggleSound: toggleSound,
  onSetTime: (t) => { timeOfDay = t; },
});
hud.setJournal(journal.list());
const dockEnd = { x: DOCK.x + Math.sin(DOCK.rot) * (DOCK.length - 1.5), z: DOCK.z + Math.cos(DOCK.rot) * (DOCK.length - 1.5) };
const PLACES = [['place-dock', dockEnd, 2.2], ['place-lookout', LOOKOUT, 3.5], ['place-camp', CAMPFIRE, 6], ['place-windmill', WINDMILL, 6.5]];

const staticColliders = getColliders();
const interactables = [...props.interactables, ...villagers.interactables, ...animals.interactables, ...wildlife.interactables];
const playerXZ = { x: 0, z: 0 };

// The first key press or click leaves the start screen. Browsers only allow sound after that.
const wake = () => {
  if (hud.started) return;
  audio.start(); hud.begin(); ui.showHint(); ui.hideHintSoon(9);
  // Whatever key started the game should not also hop, mute or use something.
  input.consumeHop(); input.consumeInteract(); input.consumeMute();
};
window.addEventListener('keydown', (e) => {
  if (!hud.started) { if (!e.metaKey && !e.ctrlKey && !e.altKey) wake(); return; }
  if (e.code === 'Escape' && !e.repeat) toggleMenu();
});
window.addEventListener('pointerdown', wake);
// Debug aids for automated screenshots: ?play skips the start screen, ?x=&z=&yaw= place the player and camera.
if (params.has('play')) wake();
if (params.has('x')) { player.position.x = Number(params.get('x')); player.position.z = Number(params.get('z') || 0); }
if (params.has('yaw')) rig.yaw = Number(params.get('yaw'));
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

function frame(now = performance.now()) {
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

  const colliders = staticColliders.concat(villagers.colliders(), wildlife.colliders());
  if (!paused) {
    player.update(dt, input, rig.yaw, colliders, elapsed);
    villagers.update(dt, elapsed, player);
    animals.update(dt, elapsed, player);
    wildlife.update(dt, elapsed, player);
  }

  // What would E do right now?
  playerXZ.x = player.position.x; playerXZ.z = player.position.z;
  const pressed = input.consumeInteract();
  const target = paused || player.sitting ? null : pickInteractable(playerXZ, player.facing, interactables);
  if (target) {
    ui.setPrompt(target.prompt());
    ui.setMarker(target.position.x, target.markerY, target.position.z);
    if (pressed) { target.interact(); discover(target.kind); }
  } else {
    ui.setPrompt(null);
    ui.setMarker(null);
  }

  if (!paused) {
    for (const [id, p, r] of PLACES) if (!journal.has(id) && Math.hypot(playerXZ.x - p.x, playerXZ.z - p.z) < r) discover(id);
  }
  hud.setClock(clockText(timeOfDay), phaseLabel(phaseAt(timeOfDay)), night > 0.5, dayNumber);
  hud.setStats(journal.count, journal.total, stepCount);
  hud.drawMap(playerXZ, player.facing, villagers.villagers.map((v) => v.position));

  rig.update(paused ? clampDt(raw) : dt, player.position, input, staticColliders);
  sky.update(timeOfDay, elapsed, player.position);
  island.update(elapsed);
  island.setLight(sky.waterLight, sky.fogColor, sky.fogDensity);
  village.update(elapsed);
  village.setNight(night);
  scatter.update(elapsed);
  props.update(dt, elapsed, night);
  ui.update(dt, elapsed);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Handles for automated checks in the browser.
window.__game = {
  player, rig, input, stats, scene, camera, renderer, audio, interactables, villagers, props, hud, journal,
  get timeOfDay() { return timeOfDay; }, set timeOfDay(v) { timeOfDay = v; },
};
