import * as THREE from 'three';
import { createIsland } from './world/island.js';
import { createSky } from './world/sky.js';
import { advance } from './logic/dayCycle.js';
import { START_TIME } from './config.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6d9b8);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(30, 14, 78);
camera.lookAt(-10, 4, 0);

const island = createIsland(scene);
const sky = createSky(scene, renderer);
const params = new URLSearchParams(location.search);
let timeOfDay = params.has('t') ? Number(params.get('t')) : START_TIME;
const freezeTime = params.has('freeze');

function onResize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

let last = performance.now();
let elapsed = 0;
function frame(now = performance.now()) {
  const dt = (now - last) / 1000;
  elapsed += dt;
  last = now;
  if (!freezeTime) timeOfDay = advance(timeOfDay, dt);
  sky.update(timeOfDay, elapsed, null);
  island.update(elapsed);
  island.setLight(sky.waterLight, sky.fogColor, sky.fogDensity);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
