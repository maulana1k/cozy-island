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
import { createCampLife } from './actors/campLife.js';
import { createAnimals } from './actors/animals.js';
import { createWildlife } from './actors/wildlife.js';
import { createFollowCamera } from './camera.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { createHUD } from './hud.js';
import { createEffects } from './effects.js';
import { createCrowd, blockAt, blockProgress, JOIN } from './actors/schedule.js';
import { setViewer } from './actors/figure.js';
import { createJournal, clockText, phaseLabel } from './logic/journal.js';
import { getColliders, groundAt, DOCK, LOOKOUT, CAMPFIRE, WINDMILL, SEATS } from './logic/layout.js';
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
const buildings = createBuildings(scene, { audio, onSleep: (bed) => startSleep(bed) });
createCampProps(scene);
const scatter = createScatter(scene);
const pond = createPond(scene);
const input = createInput(window, canvas);
const player = createPlayer(scene, { groundAt, surfaceAt, surfaces: SURFACES });
const rig = createFollowCamera(camera);
const props = createProps(scene, { scatter, player, ui, audio, now: () => elapsed });
const crowd = createCrowd(); // the camp timetable everyone follows
const villagers = createVillagers(scene, { ui, audio, player, crowd });
const activities = createActivities(scene, { ui, audio, crowd });
const campLife = createCampLife(scene, { ui, audio, player, crowd });
const animals = createAnimals(scene, { ui, audio, player });
const wildlife = createWildlife(scene, { ui, audio });
const zipline = createZipline(scene, { ui, audio, player });
props.onBell((pos) => villagers.hearBell(pos));

// ---- Sleeping: lie down in your bed and the night rushes by until morning exercise.
let sleeping = false;
function startSleep(bed) { player.asleep = bed; sleeping = true; hud.setSleeping(true); audio.play('sit'); discover('bed'); }
function wakeUp() { if (!sleeping) return; sleeping = false; player.asleep = null; hud.setSleeping(false); }

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
const interactables = [...props.interactables, ...buildings.interactables, ...zipline.interactables, ...villagers.interactables, ...activities.interactables, ...campLife.interactables, ...animals.interactables, ...wildlife.interactables];
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
  syncLook();
}
function toggleJournal() { if (hud.started) { hud.toggleJournal(); audio.play('ui'); syncLook(); } }

// ---- Free look: the mouse turns the camera with no button held ---------------
// The browser captures the mouse for this, so it is released whenever a menu or the journal
// is open (you need the cursor there) and taken again when you go back to playing.
let freeLook = false;
const mouseHeld = () => document.pointerLockElement === canvas;
function syncLook() {
  const want = freeLook && hud.started && !hud.menuOpen && !hud.journalOpen;
  if (want && !mouseHeld()) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* the browser may refuse; a click on the picture retries */ } }
  if (!want && mouseHeld()) document.exitPointerLock();
}
function toggleLook() { freeLook = !freeLook; hud.setLook(freeLook); audio.play('ui'); syncLook(); }
document.addEventListener('pointerlockchange', () => {
  input.setFreeLook(mouseHeld());
  // Esc releases the mouse before the game sees the key, so treat that as "pause".
  if (!mouseHeld() && freeLook && hud.started && !hud.menuOpen && !hud.journalOpen) hud.openMenu();
});
canvas.addEventListener('click', syncLook);
const hud = createHUD({
  onResume: () => { hud.closeMenu(); syncLook(); },
  onToggleLook: () => toggleLook(),
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
  if (e.code === 'KeyC' && !hud.menuOpen) toggleLook();
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
  renderer.setPixelRatio(Math.min(ratio, window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
// Moving between a Retina and a normal display changes the pixel ratio without a resize.
let lastRatio = window.devicePixelRatio;
setInterval(() => { if (window.devicePixelRatio !== lastRatio) { lastRatio = window.devicePixelRatio; onResize(); } }, 1000);

const stats = { frames: 0, total: 0, worst: 0 };
let lastBlock = null;

// ---- Keeping it smooth: if frames start taking too long, draw at a slightly lower resolution;
// when there is headroom again, sharpen back up.
const maxRatio = Math.min(window.devicePixelRatio, 2);
let ratio = maxRatio, slow = 0, quick = 0;
function tuneResolution(raw) {
  if (raw > 0.25) return; // a hitch from switching tabs, not a slow machine
  slow = raw > 1 / 48 ? slow + raw : Math.max(0, slow - raw * 2);
  quick = raw < 1 / 58 ? quick + raw : 0;
  let next = ratio;
  if (slow > 1.2 && ratio > 1) next = Math.max(1, ratio - 0.25);
  else if (quick > 8 && ratio < maxRatio) next = Math.min(maxRatio, ratio + 0.25);
  if (next !== ratio) { ratio = next; slow = 0; quick = 0; renderer.setPixelRatio(ratio); }
}
let last = performance.now();

function step() {
  const now = performance.now();
  const raw = (now - last) / 1000;
  last = now;
  stats.frames++; stats.total += raw; stats.worst = Math.max(stats.worst, raw);
  if (hud.started) tuneResolution(raw);
  const paused = !hud.started || hud.menuOpen;
  // While paused the world stands still; only the picture keeps refreshing.
  const dt = paused ? 0 : clampDt(raw);
  elapsed += dt;

  if (!freezeTime) {
    const before = timeOfDay;
    timeOfDay = advance(timeOfDay, dt * (sleeping ? 45 : 1));
    // Morning: time to get up. Pressing a movement key gets you up early.
    if (sleeping && ((before < 0.105 && timeOfDay >= 0.105) || input.move.x !== 0 || input.move.z !== 0)) wakeUp();
    if (timeOfDay < before && dt > 0) dayNumber++;
  }
  const night = nightFactor(timeOfDay);

  if (paused) {
    // Keys pressed on the start screen or in the menu must not fire when play resumes.
    input.consumeHop(); input.consumeInteract(); input.consumeMute(); input.consumeSit(); input.consumeJoin(); input.consumeLook(); input.consumeZoom();
    if (!hud.started) rig.yaw += clampDt(raw) * 0.08; // a slow turn behind the title
  } else if (input.consumeMute()) toggleSound();
  audio.setNight(night);

  // The camp timetable: when the day moves on to its next activity, say so and get everyone going.
  const block = blockAt(timeOfDay);
  if (block !== lastBlock) {
    const first = lastBlock === null;
    lastBlock = block;
    hud.setActivity(block.label);
    player.act = null; // a new activity: whatever you were joining in with is over
    zipline.setOpen(block.id === 'free' || block.id === 'work');
    if (block.id === 'ceremony') props.setFlag(true);
    if (block.id === 'campfire') props.setFlag(false);
    if (!first && hud.started) { hud.announce(block.note, block.label); audio.play(block.id === 'ceremony' || block.id === 'exercise' ? 'whistle' : 'bell'); }
  }
  crowd.tick(block, blockProgress(block, timeOfDay));
  setViewer(player.position.x, player.position.z);
  audio.setFire(paused ? 0 : props.fireLoudness(player.position.x, player.position.z));

  // F joins in with whatever the camp is doing right now.
  const join = JOIN[block.id] || null;
  if (!paused && input.consumeJoin() && join && !player.riding && !player.asleep && !player.sitting) {
    player.act = player.act ? null : { pose: join.pose, sit: !!join.sit };
    if (player.act) { audio.play('ui'); discover('join'); }
  }
  hud.setJoin(join ? join.verb : null, !!player.act);

  // X sits you down: on a log or bench if one is right beside you, otherwise on the ground.
  if (!paused && input.consumeSit() && !player.riding) {
    if (player.sitting) player.stand();
    else {
      const seat = SEATS.reduce((best, st) => { const d = Math.hypot(st.x - player.position.x, st.z - player.position.z); return d < 1.7 && (!best || d < best.d) ? { st, d } : best; }, null);
      if (seat) player.sit(seat.st); else player.sitDown();
      audio.play('sit'); discover('seat');
    }
  }

  if (!paused) {
    const colliders = openStatic.concat(buildings.colliders(), villagers.colliders(), activities.colliders(), campLife.colliders(), wildlife.colliders());
    zipline.update(dt, elapsed, player);
    player.update(dt, input, rig.yaw, colliders, elapsed);
    buildings.update(dt, elapsed, player);
    villagers.update(dt, elapsed, player);
    activities.update(dt, elapsed);
    campLife.update(dt, elapsed);
    animals.update(dt, elapsed, player);
    wildlife.update(dt, elapsed, player);
    pond.update(dt, elapsed, night);
  }

  // What would E do right now?
  playerXZ.x = player.position.x; playerXZ.z = player.position.z;
  const pressed = input.consumeInteract();
  const target = paused || player.sitting || player.riding || player.asleep ? null : pickInteractable(playerXZ, player.facing, interactables);
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
if (params.has('settle')) for (let i = 0, n = (Number(params.get('settle')) || 3.5) / 0.05; i < n; i++) { last = performance.now() - 50; step(); }
frame();

// Handles for automated checks in the browser.
window.__game = {
  player, rig, input, stats, scene, camera, renderer, audio, interactables, villagers, props, hud, journal, buildings, zipline,
  get timeOfDay() { return timeOfDay; }, set timeOfDay(v) { timeOfDay = v; },
};
if (params.has('dbg')) setInterval(() => { const i = renderer.info; document.title = JSON.stringify({ calls: i.render.calls, tris: i.render.triangles, ratio }); }, 300);
