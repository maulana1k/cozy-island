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
import { setViewer, setGround } from './actors/figure.js';
import { createJournal, clockText, phaseLabel } from './logic/journal.js';
import { getColliders, groundAt, DOCK, LOOKOUT, CAMPFIRE, WINDMILL, SEATS } from './logic/layout.js';
import { surfaceAt, SURFACES, pondDistance } from './logic/surface.js';
import { pickInteractable } from './logic/interact.js';
import { advance, nightFactor, phaseAt } from './logic/dayCycle.js';
import { clampDt } from './logic/time.js';
import { START_TIME, POND } from './config.js';
import { createPickups } from './world/pickups.js';
import { createWilds } from './world/wilds.js';
import { wildDepth } from './logic/terrain.js';
import { WILD } from './config.js';
import { ITEMS, FLASK_SIPS, SIP } from './logic/items.js';
import { createBag } from './logic/bag.js';
import { createStats, STAT_LABEL } from './logic/stats.js';
import { heightAt } from './logic/terrain.js';

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
const wilds = createWilds(scene);
const input = createInput(window, canvas);
const player = createPlayer(scene, { groundAt, surfaceAt, surfaces: SURFACES });
const rig = createFollowCamera(camera);
const props = createProps(scene, { scatter, player, ui, audio, now: () => elapsed, onShake: (t) => shakeFruit(t) });
setGround(groundAt); // every figure plants its feet on this
const crowd = createCrowd(); // the camp timetable everyone follows
const villagers = createVillagers(scene, { ui, audio, player, crowd });
const activities = createActivities(scene, { ui, audio, crowd });
const campLife = createCampLife(scene, { ui, audio, player, crowd });
const animals = createAnimals(scene, { ui, audio, player });
const wildlife = createWildlife(scene, { ui, audio });
const zipline = createZipline(scene, { ui, audio, player });
props.onBell((pos) => villagers.hearBell(pos));

// ---- Backpack and how you feel ------------------------------------------------
const bag = createBag(12);
const vitals = createStats();
let sips = FLASK_SIPS, torchOn = false, busyUntil = 0, keepsakeAt = -99;
const torch = new THREE.PointLight(0xfff0c8, 0, 15, 1.5); scene.add(torch);
const pending = []; // things that happen a moment later: [time, fn]
const later = (seconds, fn) => pending.push([elapsed + seconds, fn]);
const say = (text, pic) => hud.note(text, pic);
function refreshBag() {
  hud.setBag({ capacity: bag.capacity, slots: bag.slots.map((s) => ({ id: s.id, count: s.count, label: s.id === 'flask' ? `${sips}/${FLASK_SIPS}` : s.id === 'torch' && torchOn ? 'on' : '' })) });
}
// Puts things in the backpack. Returns how many fitted.
function give(id, n = 1, at = null) {
  const got = bag.add(id, n);
  if (!got) { say('Your backpack is full.', '🎒'); audio.play('nope'); return 0; }
  audio.play('pickup'); say(`${ITEMS[id].name}${got > 1 ? ` ×${got}` : ''}`, ITEMS[id].icon);
  if (at) effects.puff(at.x, at.y, at.z, 5, 0xffffff, 0.3, 0.8);
  refreshBag(); discover('collect'); if (bag.kinds() >= 8) discover('hoard');
  return got;
}
const pickups = createPickups(scene, {
  audio, give, groundAt, note: (t) => { say(t); audio.play('nope'); },
  flaskFull: () => sips >= FLASK_SIPS,
  canDrinkAt: (where) => where === 'barrel' || sips < FLASK_SIPS,
  onWater() {
    player.gesture('drink', 1.2);
    if (sips < FLASK_SIPS) { sips = FLASK_SIPS; vitals.add({ water: 18 }); audio.play('pour'); say('Flask filled to the top.', '🍶'); refreshBag(); }
    else { vitals.add({ water: 45 }); audio.play('gulp'); say('Ahh. Cold water.', '💧'); }
    discover('drink');
  },
});
// Shaking a tree: now and then something worth having falls out.
const fruitAt = new Map();
function shakeFruit(t) {
  if (t.kind === 5 || (fruitAt.get(t.id) || 0) > elapsed || Math.random() > 0.6) return false;
  fruitAt.set(t.id, elapsed + 90);
  later(0.9, () => give(t.kind === 3 ? 'coconut' : 'apple', 1, { x: t.x, y: t.y + 0.5, z: t.z }));
  return true;
}
const plus = (e) => Object.entries(e).map(([k, v]) => `+${v} ${STAT_LABEL[k]}`);
// What the backpack card says about a thing, and what its buttons do right now.
function describeItem(id) {
  const item = ITEMS[id], fire = props.fireNear(player.position.x, player.position.z);
  const chips = item.eat ? plus(item.eat) : [];
  if (id === 'flask') chips.push(`+${SIP.water} Water a sip`);
  if (id === 'bandage') chips.push('+45 Energy');
  if (item.cook) chips.push(fire ? `Becomes ${ITEMS[item.cook].name.toLowerCase()}` : 'Cook it at a lit campfire');
  const cooking = item.cook && fire;
  return { chips, action: cooking ? (id === 'marshmallow' ? 'Toast' : 'Cook') : item.eat ? 'Eat' : item.verb || null, second: cooking && item.eat ? 'Eat as it is' : null, canDrop: item.kind !== 'kit' };
}
function useItem(id, plain = false) {
  if (!hud.started || hud.menuOpen || player.riding || player.asleep || elapsed < busyUntil || !bag.count(id)) return;
  const item = ITEMS[id], p = player.position, fire = props.fireNear(p.x, p.z);
  const busy = (s) => { busyUntil = elapsed + s; };
  if (item.cook && fire && !plain) {
    bag.remove(id, 1);
    if (!bag.add(item.cook, 1)) { bag.add(id, 1); say('No room for it in your backpack.', '🎒'); audio.play('nope'); return; }
    player.gesture('crouch', 1.3, fire); audio.play('sizzle'); busy(1.2);
    later(1.0, () => { say(ITEMS[item.cook].name, ITEMS[item.cook].icon); audio.play('pickup'); });
    vitals.add({ cheer: 4 }); discover('cook');
  } else if (item.eat) {
    if (vitals.food > 96 && (item.eat.food || 0) > 6) { say('You are full to bursting.', '😌'); return; }
    bag.remove(id, 1); vitals.add(item.eat); player.gesture('eat', 1.4); audio.play('munch'); busy(1.1);
    if ((item.eat.cheer || 0) >= 6) ui.emote(overHead(), 'heart');
    discover('eat');
  } else if (item.cook) { say('It needs cooking. Take it to a lit campfire.', '🔥'); audio.play('nope'); return; }
  else if (item.use === 'flask') {
    if (sips <= 0) { say('Your flask is empty. Fill it at a water barrel or the pond.', '🍶'); audio.play('nope'); return; }
    sips--; vitals.add(SIP); player.gesture('drink', 1.3); audio.play('gulp'); busy(1.0); discover('drink');
  } else if (item.use === 'torch') { torchOn = !torchOn; audio.play('click'); say(torchOn ? 'Torch on.' : 'Torch off.', '🔦'); }
  else if (item.use === 'bugle') { player.gesture('blow', 1.3); audio.play('bugle'); villagers.hearBell({ x: p.x, z: p.z }); vitals.add({ cheer: 3 }); busy(1.2); }
  else if (item.use === 'bandage') { bag.remove(id, 1); vitals.add({ energy: 45, cheer: 5 }); player.gesture('rub', 1.3); audio.play('discover'); say('Good as new.', '🩹'); busy(1.2); }
  else if (item.use === 'stoke') {
    const f = props.fireNear(p.x, p.z, false);
    if (!f) { say('Take it to a campfire.', '🔥'); audio.play('nope'); return; }
    bag.remove(id, 1); player.gesture('throw', 0.9, f); busy(0.8);
    later(0.45, () => { props.stoke(f); audio.play('fire'); });
    vitals.add({ cheer: 6 }); discover('stoke');
  } else if (item.use === 'skip') {
    bag.remove(id, 1); player.gesture('throw', 0.9); busy(0.8);
    const fx = player.facing.x, fz = player.facing.z;
    let wet = 0;
    for (let k = 1; k <= 4; k++) { const x = p.x + fx * (3 + k * 2.6), z = p.z + fz * (3 + k * 2.6); if (heightAt(x, z) < 0) { wet++; effects.ripple(x, z, 0.75 - wet * 0.1, 0.4 + wet * 0.22); } else if (wet) break; }
    if (wet) { later(0.6, () => audio.play('splash')); vitals.add({ cheer: wet * 2 }); say(wet > 1 ? `${wet} skips!` : 'Plop.', '🪨'); }
    else later(0.6, () => { effects.puff(p.x + fx * 6, groundAt(p.x + fx * 6, p.z + fz * 6), p.z + fz * 6, 4, 0xe9d3a0, 0.3, 0.4); audio.play('step:dirt'); });
  } else if (item.use === 'keepsake') {
    player.gesture(id === 'feather' ? 'laugh' : id === 'shell' ? 'yawn' : 'eat', 1.3); busy(1.0); say(item.say, item.icon);
    if (elapsed - keepsakeAt > 25) { keepsakeAt = elapsed; vitals.add({ cheer: 6 }); ui.emote(overHead(), 'heart'); }
    if (id === 'feather') audio.play('laugh');
  }
  refreshBag();
}
function dropItem(id) {
  const n = bag.count(id);
  if (!n || ITEMS[id].kind === 'kit' || player.riding || player.asleep) return;
  bag.remove(id, n);
  pickups.drop(id, n, player.position.x + player.facing.x * 0.8, player.position.z + player.facing.z * 0.8);
  audio.play('sit'); refreshBag();
}
function toggleBag() { if (hud.started) { hud.toggleBag(); audio.play('ui'); syncLook(); } }
// Feeling hungry, thirsty or out of puff: a gentle nudge, never a punishment.
let inWild = false, wildNag = 0, growlAt = 0;
let wasWinded = false, nagFood = 0, nagWater = 0;
function feel(dt) {
  const near = player.sitting && props.fireNear(player.position.x, player.position.z);
  vitals.tick(dt, { running: player.speed > 4.2, moving: player.moving, sitting: player.sitting, cosy: !!near || !!player.act });
  player.canRun = vitals.canRun; player.speedFactor = vitals.speedFactor;
  if (vitals.winded && !wasWinded) { player.gesture('pant', 1.6); say('Out of puff! Walk or sit down for a bit.', '😮‍💨'); }
  wasWinded = vitals.winded;
  nagFood -= dt; nagWater -= dt;
  if (vitals.hungry && nagFood <= 0) { nagFood = 75; say('Your tummy is rumbling.', '🍽️'); audio.play('rumble'); if (!player.moving) player.gesture('rub', 1.3); }
  if (vitals.thirsty && nagWater <= 0) { nagWater = 75; say('You are thirsty.', '💧'); }
  if (!vitals.hungry) nagFood = Math.min(nagFood, 8);
  if (!vitals.thirsty) nagWater = Math.min(nagWater, 8);
}

// ---- Sleeping: lie down in your bed and the night rushes by until morning exercise.
let sleeping = false;
function startSleep(bed) { player.asleep = bed; sleeping = true; hud.setSleeping(true); audio.play('sit'); discover('bed'); }
function wakeUp() { if (!sleeping) return; sleeping = false; player.asleep = null; hud.setSleeping(false); vitals.set('energy', 100); vitals.add({ food: -14, water: -14, cheer: 10 }); }

// ---- Feet on the ground: every surface sounds and reacts differently -------
let stepCount = 0, dayNumber = 1;
player.onStep = (surface, running) => {
  stepCount++;
  audio.play(`step:${surface}`);
  effects.step(surface, player.position, player.heading, running);
  if (surface === 'sand') discover('place-beach');
  if (surface === 'water' && pondDistance(player.position.x, player.position.z) < POND.rw) discover('place-pond');
};
// Little accidents: a puff of dust, a squeak and a startled look.
const overHead = () => new THREE.Vector3(player.position.x, player.position.y + 1.5, player.position.z);
player.onOops = (kind) => {
  const p = player.position;
  if (kind === 'skid') { effects.puff(p.x, p.y, p.z, 5, 0xe9d3a0, 0.35, 0.3); audio.play('step:sand'); return; }
  ui.emote(overHead(), kind === 'bonk' ? 'star' : 'surprise');
  audio.play(kind === 'bonk' ? 'door' : 'squeak');
  effects.puff(p.x, p.y, p.z, 4, 0xe9d3a0, 0.3, 0.4);
};
player.onLand = (surface) => { audio.play(`step:${surface}`); effects.land(surface, player.position); };

// Buildings are hollow for the player (walls with a doorway); everyone else treats them as solid.
const allStatic = getColliders();
const openStatic = allStatic.filter((c) => !c.building);
const interactables = [...pickups.interactables, ...props.interactables, ...buildings.interactables, ...zipline.interactables, ...villagers.interactables, ...activities.interactables, ...campLife.interactables, ...animals.interactables, ...wildlife.interactables];
const playerXZ = { x: 0, z: 0 };
const hintList = [];
let hintTarget = null;

// A different movement for each kind of thing you do: [gesture, seconds].
const GESTURES = {
  lantern: ['reachUp', 0.8], door: ['push', 0.7], bell: ['pull', 1.1], flag: ['pull', 1.3], tree: ['shake', 0.9], campfire: ['crouch', 1.0],
  pickup: ['crouch', 0.8], station: ['reach', 0.8],
  chickens: ['shoo', 0.9], cat: ['crouch', 1.1], sheep: ['pat', 0.9], telescope: ['peer', 1.5],
};
const GREETINGS = [['wave', 0.9], ['salute', 0.9], ['cheer', 1.0], ['clap', 0.9]];
let greetings = 0;

// What people say when you greet them, depending on what the camp is doing.
const CHATTER = {
  exercise: ['One, two, three, four!', 'Morning! Try to keep up!', 'Stretch those arms!'],
  ceremony: ['Shh! The flag is going up.', 'Stand up straight, scout.'],
  work: ['I am practising my knots.', 'Semaphore is harder than it looks.', 'Lashings first, then the tripod.'],
  lunch: ['Mmm, camp stew again.', 'Save me a seat!', 'Have you eaten yet?'],
  free: ['Tag! You are it!', 'Have you been down the flying fox yet?', 'Race you to the dock!', 'The pond is great for wading.', 'Watch out for the chickens.'],
  campfire: ['Do you know this song?', 'The chief tells the best stories.', 'Pass the marshmallows!'],
  sleep: ['Zzz...', 'Shh, lights out.'],
};
const STAFF_CHATTER = { 'Chief Scout': ['Well done, scout. Keep exploring!', 'A scout is always prepared.'], Trainer: ['Fancy a few star jumps?'], 'Stores Teacher': ['Forty-two tins of beans. All present.'], 'Logistics Teacher': ['Mind your toes, heavy crate coming through!'], 'Medical Teacher': ['No scraped knees today, I hope?'] };
let chatter = 0, speech = null;
const speechPos = new THREE.Vector3();

// ---- Interface: journal, ranks, clock, minimap, menu -----------------------
const journal = createJournal();
function refreshProgress() { hud.setProgress(journal.list(), journal.rank(), journal.count, journal.total); }
function discover(id) {
  const before = journal.rank().index;
  const d = journal.mark(id);
  if (!d) return;
  hud.toast(d.label, journal.count, journal.total);
  vitals.add({ cheer: 8 });
  refreshProgress();
  // Finding a new place is worth a little jump for joy.
  if (id.startsWith('place-') && !player.riding && !player.asleep) player.gesture('cheer', 1.0);
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
function toggleMap() { if (hud.started) { hud.toggleMap(); audio.play('ui'); syncLook(); } }

// ---- Free look: the mouse turns the camera with no button held ---------------
// The browser captures the mouse for this, so it is released whenever a menu or the journal
// is open (you need the cursor there) and taken again when you go back to playing.
let freeLook = false;
const mouseHeld = () => document.pointerLockElement === canvas;
function syncLook() {
  const want = freeLook && hud.started && !hud.menuOpen && !hud.journalOpen && !hud.mapOpen && !hud.bagOpen;
  if (want && !mouseHeld()) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* the browser may refuse; a click on the picture retries */ } }
  if (!want && mouseHeld()) document.exitPointerLock();
}
function toggleLook() { freeLook = !freeLook; hud.setLook(freeLook); audio.play('ui'); syncLook(); }
document.addEventListener('pointerlockchange', () => {
  input.setFreeLook(mouseHeld());
  // Esc releases the mouse before the game sees the key, so treat that as "pause".
  if (!mouseHeld() && freeLook && hud.started && !hud.menuOpen && !hud.journalOpen && !hud.mapOpen && !hud.bagOpen) hud.openMenu();
});
canvas.addEventListener('click', syncLook);
const hud = createHUD({
  onResume: () => { hud.closeMenu(); syncLook(); },
  onToggleLook: () => toggleLook(),
  onToggleMenu: toggleMenu,
  onToggleSound: toggleSound,
  onToggleJournal: toggleJournal,
  onToggleMap: toggleMap,
  onToggleBag: toggleBag,
  onUseItem: (id, plain) => useItem(id, plain),
  onDropItem: (id) => dropItem(id),
  describeItem: (id) => describeItem(id),
  onSetTime: (t) => { timeOfDay = t; },
});
refreshProgress();
// What every scout sets out with.
bag.add('flask'); bag.add('torch'); bag.add('bugle'); bag.add('biscuit', 2);
refreshBag();
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
  if (e.code === 'KeyM' && !hud.menuOpen) toggleMap();
  if (e.code === 'KeyC' && !hud.menuOpen) toggleLook();
  if (e.code === 'KeyB' && !hud.menuOpen) toggleBag();
  if (/^Digit[1-6]$/.test(e.code) && !hud.menuOpen) { const s = bag.slots[Number(e.code.slice(5)) - 1]; if (s) useItem(s.id); }
  // Esc closes the journal first, then opens the pause menu.
  if (e.code === 'Escape') { if (hud.bagOpen && !hud.menuOpen) toggleBag(); else if (hud.journalOpen && !hud.menuOpen) toggleJournal(); else if (hud.mapOpen && !hud.menuOpen) toggleMap(); else toggleMenu(); }
});
window.addEventListener('pointerdown', wake);
// Debug aids for automated screenshots: ?play skips the start screen, ?x=&z=&yaw= place the player and camera.
if (params.has('play')) wake();
if (params.has('x')) { player.position.x = Number(params.get('x')); player.position.z = Number(params.get('z') || 0); player.position.y = groundAt(player.position.x, player.position.z); }
if (params.has('yaw')) rig.yaw = Number(params.get('yaw'));
if (params.has('journal')) hud.toggleJournal();
if (params.has('map')) hud.toggleMap();
if (params.has('pause')) hud.openMenu();
if (params.has('kit')) { for (const id of ['apple', 'stew', 'mushroom', 'marshmallow', 'shell', 'stick', 'stone', 'egg']) bag.add(id, 2); vitals.set('food', 18); vitals.set('energy', 40); refreshBag(); }
if (params.has('bag')) hud.toggleBag();
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
  // The key list bottom-right: only what is useful right now, the main action first.
  hintList.length = 0;
  if (hintTarget) hintList.push(['E', hintTarget, true]);
  if ((vitals.hungry || vitals.thirsty) && !player.asleep && !player.riding) hintList.push(['B', vitals.hungry ? 'eat something' : 'have a drink', false]);
  if (player.asleep) hintList.push(['W A S D', 'get up', true]);
  else if (player.riding) hintList.push(['', 'hold on tight!', true]);
  else {
    if (join) hintList.push(['F', player.act ? `${join.verb} (move to stop)` : join.verb, false]);
    hintList.push(['X', player.sitting ? 'stand up' : 'sit down', false]);
    if (elapsed < 14) hintList.push(['W A S D', 'move', false], ['Shift', 'run', false], ['Space', 'hop', false]);
  }
  hud.setHints(hud.started ? hintList : []);

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
    const colliders = openStatic.concat(pickups.colliders, wilds.colliders, buildings.colliders(), villagers.colliders(), activities.colliders(), campLife.colliders(), wildlife.colliders());
    zipline.update(dt, elapsed, player);
    player.update(dt, input, rig.yaw, colliders, elapsed);
    buildings.update(dt, elapsed, player);
    villagers.update(dt, elapsed, player);
    activities.update(dt, elapsed);
    campLife.update(dt, elapsed);
    animals.update(dt, elapsed, player);
    wildlife.update(dt, elapsed, player);
    pond.update(dt, elapsed, night);
    pickups.update(dt, player.position);
    wilds.update(elapsed, night, player.position);
    if (!sleeping) feel(dt);
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i][0] <= elapsed) { const fn = pending[i][1]; pending.splice(i, 1); fn(); }
  }
  // Past the rope into the wild jungle: a warning that grows, then a firm stop.
  if (!paused && !player.riding) {
    const depth = wildDepth(player.position.x, player.position.z);
    if (depth > 0) {
      if (!inWild) { inWild = true; audio.play('alarm'); discover('place-wild'); growlAt = elapsed + 1.5; }
      hud.setDanger(Math.min(1, 0.4 + depth / WILD.limit * 0.6));
      if (elapsed > growlAt) { growlAt = elapsed + 3 + Math.random() * 3; audio.play('growl'); }
      if (depth > WILD.limit) {
        const k = (WILD.border + WILD.limit) / Math.hypot(player.position.x, player.position.z);
        player.position.x *= k; player.position.z *= k;
        if (elapsed > wildNag) { wildNag = elapsed + 2.5; player.gesture('bonk', 0.7); audio.play('alarm'); say('Too dangerous! Turn back to camp.', '⚠️'); }
      }
    } else if (inWild) { inWild = false; hud.setDanger(0); say('Phew. Back on safe ground.', '😮‍💨'); }
  }
  hud.setStats(vitals);
  // The torch shines from the hand, a step ahead.
  torch.position.set(player.position.x + player.facing.x * 0.9, player.position.y + 1.15, player.position.z + player.facing.z * 0.9);
  torch.intensity += ((torchOn ? 5 + night * 9 : 0) - torch.intensity) * 0.2;

  // What would E do right now?
  playerXZ.x = player.position.x; playerXZ.z = player.position.z;
  const pressed = input.consumeInteract();
  const target = paused || player.sitting || player.riding || player.asleep ? null : pickInteractable(playerXZ, player.facing, interactables);
  hintTarget = target ? target.prompt().split(' — ').slice(1).join(' — ') : null;
  if (target) {
    ui.setPrompt(target.prompt());
    ui.setMarker(target.position.x, target.markerY, target.position.z);
    if (pressed) {
      const g = target.kind === 'villager' ? GREETINGS[greetings++ % GREETINGS.length] : GESTURES[target.kind];
      if (g) player.gesture(g[0], g[1], target.position);
      target.interact();
      if (target.kind === 'villager') {
        const who = target.speaker || 'Scout', lines = Math.random() < 0.5 && STAFF_CHATTER[who] ? STAFF_CHATTER[who] : CHATTER[block.id] || CHATTER.free;
        hud.say(who, lines[chatter++ % lines.length]);
        vitals.add({ cheer: 3 });
        speech = { x: target.position.x, z: target.position.z, y: target.markerY + 0.1, until: performance.now() + 2800 };
      }
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
  if (speech) {
    if (performance.now() > speech.until) speech = null;
    else { speechPos.set(speech.x, speech.y, speech.z).project(camera); hud.placeBubble((speechPos.x * 0.5 + 0.5) * window.innerWidth, (-speechPos.y * 0.5 + 0.5) * window.innerHeight, speechPos.z < 1); }
  }

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
  player, rig, input, stats, vitals, bag, give, useItem, pickups, scene, camera, renderer, audio, interactables, villagers, props, hud, journal, buildings, zipline,
  get timeOfDay() { return timeOfDay; }, set timeOfDay(v) { timeOfDay = v; },
};
if (params.has('dbg')) setInterval(() => { const i = renderer.info; document.title = JSON.stringify({ calls: i.render.calls, tris: i.render.triangles, ratio }); }, 300);
