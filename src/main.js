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
import { createFollowCamera } from './camera.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { getColliders, groundAt } from './logic/layout.js';
import { pickInteractable } from './logic/interact.js';
import { advance, nightFactor } from './logic/dayCycle.js';
import { clampDt } from './logic/time.js';
import { START_TIME } from './config.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6d9b8);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1200);

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
props.onBell((pos) => villagers.hearBell(pos));
player.onStep = (inWater) => audio.play(inWater ? 'splash' : 'step');

const staticColliders = getColliders();
const interactables = [...props.interactables, ...villagers.interactables, ...animals.interactables];
const playerXZ = { x: 0, z: 0 };

ui.showHint();
// Browsers only allow sound after the first key press or click.
const wake = () => { audio.start(); ui.hideHintSoon(6); };
window.addEventListener('keydown', wake);
window.addEventListener('pointerdown', wake);

function onResize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

const stats = { frames: 0, total: 0, worst: 0 };
let last = performance.now();

function frame(now = performance.now()) {
  const raw = (now - last) / 1000;
  last = now;
  stats.frames++; stats.total += raw; stats.worst = Math.max(stats.worst, raw);
  const dt = clampDt(raw);
  elapsed += dt;

  if (!freezeTime) timeOfDay = advance(timeOfDay, dt);
  const night = nightFactor(timeOfDay);

  if (input.consumeMute()) audio.toggleMute();
  audio.setNight(night);

  const colliders = staticColliders.concat(villagers.colliders());
  player.update(dt, input, rig.yaw, colliders, elapsed);
  villagers.update(dt, elapsed, player);
  animals.update(dt, elapsed, player);

  // What would E do right now?
  playerXZ.x = player.position.x; playerXZ.z = player.position.z;
  const pressed = input.consumeInteract();
  const target = player.sitting ? null : pickInteractable(playerXZ, player.facing, interactables);
  if (target) {
    ui.setPrompt(target.prompt());
    ui.setMarker(target.position.x, target.markerY, target.position.z);
    if (pressed) target.interact();
  } else {
    ui.setPrompt(null);
    ui.setMarker(null);
  }

  rig.update(dt, player.position, input, staticColliders);
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
  player, rig, input, stats, scene, camera, renderer, audio, interactables, villagers, props,
  get timeOfDay() { return timeOfDay; }, set timeOfDay(v) { timeOfDay = v; },
};
