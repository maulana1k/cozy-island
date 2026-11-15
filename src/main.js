import * as THREE from 'three';
import { createIsland } from './world/island.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6d9b8);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 70, 120);
camera.lookAt(0, 0, 0);

const tempSun = new THREE.DirectionalLight(0xfff0d8, 2.2);
tempSun.position.set(40, 60, 30);
scene.add(tempSun, new THREE.HemisphereLight(0xfff4e0, 0x9fd68a, 1.0));

const island = createIsland(scene);

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
  elapsed += (now - last) / 1000;
  last = now;
  island.update(elapsed);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
