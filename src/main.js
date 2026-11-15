import * as THREE from 'three';
import { createIsland } from './world/island.js';
import { createSky } from './world/sky.js';
import { createInput } from './input.js';
import { createPlayer } from './actors/player.js';
import { createFollowCamera } from './camera.js';
import { advance } from './logic/dayCycle.js';
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

const island = createIsland(scene);
const sky = createSky(scene, renderer);
const input = createInput(window, canvas);
const colliders = [];
const player = createPlayer(scene);
const rig = createFollowCamera(camera);

function onResize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

const stats = { frames: 0, total: 0, worst: 0 };
let last = performance.now();
let elapsed = 0;

function frame(now = performance.now()) {
  const raw = (now - last) / 1000;
  last = now;
  stats.frames++; stats.total += raw; stats.worst = Math.max(stats.worst, raw);
  const dt = clampDt(raw);
  elapsed += dt;

  if (!freezeTime) timeOfDay = advance(timeOfDay, dt);
  player.update(dt, input, rig.yaw, colliders, elapsed);
  rig.update(dt, player.position, input, colliders);
  sky.update(timeOfDay, elapsed, player.position);
  island.update(elapsed);
  island.setLight(sky.waterLight, sky.fogColor, sky.fogDensity);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Handles for automated checks in the browser.
window.__game = { player, rig, input, stats, scene, camera, renderer, get timeOfDay() { return timeOfDay; } };
