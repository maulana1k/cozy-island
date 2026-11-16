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
import { setViewer, setGround, setSleepy } from './actors/figure.js';
import { createJournal, clockText, phaseLabel } from './logic/journal.js';
import { getColliders, groundAt, addPlatform, removePlatform, DOCK, LOOKOUT, CAMPFIRE, WINDMILL, SEATS } from './logic/layout.js';
import { surfaceAt, SURFACES, pondDistance } from './logic/surface.js';
import { pickInteractable } from './logic/interact.js';
import { advance, nightFactor, phaseAt } from './logic/dayCycle.js';
import { clampDt } from './logic/time.js';
import { START_TIME, POND, AREAS } from './config.js';
import { createPickups } from './world/pickups.js';
import { createDirector } from './cutscene.js';
import { createJourney } from './logic/journey.js';
import { FLAGPOLE, VILLAGE_FIRE } from './logic/layout.js';
import { createWilds, keepClear } from './world/wilds.js';
// ---- Areas of the bigger island: one file each under src/world/areas/. To add one, import it
// here and add it to AREA_LIST; nothing else in this file needs to change.
import * as crossings from './world/areas/crossings.js';
import * as signpost from './world/areas/signpost.js';
import * as riverside from './world/areas/riverside.js';
import * as cliffs from './world/areas/cliffs.js';
import * as hamletArea from './world/areas/hamlet.js';
import * as farm from './world/areas/farm.js';
import * as harbour from './world/areas/harbour.js';
const AREA_LIST = [crossings, signpost, riverside, cliffs, hamletArea, farm, harbour];
// ---- Plants and ground grass on the locals' land (src/world/flora.js). Kept last: it lays out its
// plants round every circle the areas above ask to keep clear. `?noflora` leaves it out.
import * as flora from './world/flora.js';
if (!new URLSearchParams(location.search).has('noflora')) AREA_LIST.push(flora);
import { nearestSafe, wildness, shoreR } from './logic/terrain.js';
import { WILD } from './config.js';
import { ITEMS, FLASK_SIPS, SIP } from './logic/items.js';
import { createBag } from './logic/bag.js';
import { createStats, STAT_LABEL } from './logic/stats.js';
import { heightAt } from './logic/terrain.js';

const canvas = document.getElementById('game');
// Drawing sharper than this heats the machine for little gain on a high-density screen.
const MAX_RATIO = 1.5;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_RATIO));
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
// The torch throws a cone of light ahead of you, not a glow all round.
// A wide, soft-edged beam that spreads and fades the further it lands, and a faint glow round the scout.
// A forward beam only: a cone from the hand, soft at its rim but lighting nothing beside or behind the scout.
const torch = new THREE.SpotLight(0xfff0c8, 0, 34, 0.4, 0.55, 0.6); scene.add(torch, torch.target);
const torchAim = new THREE.Vector3();
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
  collected += got; if (collected >= 3) progress('collect3');
  if (id === 'stick') tip('wood', 'Firewood! Stand by a campfire and use it to feed the flames.');
  if (ITEMS[id].cook) tip('cook', 'This can be cooked: stand by a lit campfire and use it.');
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
  } else if (item.use === 'torch') { torchOn = !torchOn; player.setTorch(torchOn); audio.play('click'); say(torchOn ? 'Torch on.' : 'Torch off.', '🔦'); }
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
function toggleBag() { if (hud.started && !director.active) { hud.toggleBag(); audio.play('ui'); syncLook(); if (hud.bagOpen) progress('bag'); } }
// Feeling hungry, thirsty or out of puff: a gentle nudge, never a punishment.
let inWild = false, growlAt = 0, turnedBack = 0;
let wasWinded = false, nagFood = 0, nagWater = 0;
function feel(dt) {
  const near = player.sitting && props.fireNear(player.position.x, player.position.z);
  vitals.tick(dt, { running: player.speed > 3.1, moving: player.moving, sitting: player.sitting, cosy: !!near || !!player.act });
  player.canRun = vitals.canRun; player.speedFactor = vitals.speedFactor;
  if (vitals.winded && !wasWinded) tip('winded', 'Running uses energy. Sit down with X to get your breath back faster.');
  if (vitals.hungry) tip('hungry', 'Food is low. Eat from your backpack (B), or take stew and bread from the serving table by the food tent.');
  if (vitals.thirsty) tip('thirsty', 'Water is low. Sip from your flask, or find a water barrel: food tent, summit, beach camp.');
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

// What an area may use. Only call the functions from inside update() or an interaction, not while
// the area is being made (the interface is not built yet at that point).
const areaDeps = {
  ui, audio, effects, player, scatter,
  groundAt, heightAt,
  addPlatform, removePlatform,             // register a walkable deck, stone or gangway (see PLATFORMS in layout.js)
  keepClear,                               // keepClear(x, z, r): no streamed palms or bushes here (call it in create)
  give,                                    // give(id, n, at): put things in the backpack, returns how many fitted
  say: (text, pic) => say(text, pic),      // a short note at the bottom of the screen
  tip: (id, text) => tip(id, text),        // a one-line tip, shown once per id
  discover: (id) => discover(id),          // tick a journal entry or journey step by id (unknown ids are ignored)
  later: (seconds, fn) => later(seconds, fn),
  shakeFruit: (t) => shakeFruit(t),        // t = { id, kind, x, y, z }: maybe drop an apple (or a coconut, kind 3)
  now: () => elapsed, dayTime: () => timeOfDay,
};
const areas = AREA_LIST.map((m) => m.create(scene, areaDeps) || {});
for (const a of areas) if (a.lamps) props.addLamps(a.lamps); // village and pier lamps light the ground round them at night
const areaColliders = () => areas.flatMap((a) => (typeof a.colliders === 'function' ? a.colliders() : a.colliders || []));

// Buildings are hollow for the player (walls with a doorway); everyone else treats them as solid.
const allStatic = getColliders();
const openStatic = allStatic.filter((c) => !c.building);
const interactables = [...areas.flatMap((a) => a.interactables || []), ...pickups.interactables, ...props.interactables, ...buildings.interactables, ...zipline.interactables, ...villagers.interactables, ...activities.interactables, ...campLife.interactables, ...animals.interactables, ...wildlife.interactables];
const playerXZ = { x: 0, z: 0 };
const hintList = [];
let hintTarget = null;

// A different movement for each kind of thing you do: [gesture, seconds].
const GESTURES = {
  lantern: ['reachUp', 0.8], door: ['push', 0.7], bell: ['pull', 1.1], flag: ['pull', 1.3], tree: ['shake', 0.9], campfire: ['crouch', 1.0],
  pickup: ['crouch', 0.8], station: ['reach', 0.8],
  chickens: ['shoo', 0.9], cat: ['crouch', 1.1], sheep: ['pat', 0.9], telescope: ['peer', 1.5],
  local: ['wave', 0.9], goat: ['pat', 0.9], buffalo: ['pat', 0.9], ducks: ['shoo', 0.9], monkey: ['peer', 1.2], view: ['peer', 1.5],
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
const speechPos = new THREE.Vector3(), wayPos = new THREE.Vector3();

// ---- The journey, tips and little films -----------------------------------------
const journey = createJourney();
const director = createDirector(camera);
const noLimit = params.has('nolimit'); // debug: draw as fast as possible, for measuring
// How fast the day goes by: 1× is the normal 8-minute day, 2× is twice as fast. Remembered between visits.
const DAY_SPEEDS = [1, 1.25, 1.5, 2];
let daySpeed = 1; try { daySpeed = DAY_SPEEDS.includes(Number(localStorage.getItem('daySpeed'))) ? Number(localStorage.getItem('daySpeed')) : 1; } catch { /* private window */ }
function cycleDaySpeed() { daySpeed = DAY_SPEEDS[(DAY_SPEEDS.indexOf(daySpeed) + 1) % DAY_SPEEDS.length]; hud.setDaySpeed(daySpeed); if (hud.started) hud.note && hud.note(`Day speed ${daySpeed}×`); audio.play('ui'); try { localStorage.setItem('daySpeed', String(daySpeed)); } catch { /* private window */ } }
let saver = false; try { saver = localStorage.getItem('saver') === '1'; } catch { /* private window */ }
let guideOn = false, filmsOn = true, collected = 0, filmDue = null;
const tipsSeen = new Set(), filmsSeen = new Set();
// One line of help, the first time something comes up.
function tip(id, text) { if (tipsSeen.has(id) || !hud.started) return; tipsSeen.add(id); hud.tip(text); }
function refreshQuest() { hud.setQuest(journey.current, journey.count, journey.total, guideOn); }
function toggleGuide() { guideOn = !guideOn; refreshQuest(); audio.play('ui'); say(guideOn ? 'Journey guide on.' : 'Journey guide off. Explore as you like.', '🧭'); }
// Something happened that the journey cares about. Steps tick off in any order.
function progress(event) {
  const step = journey.mark(event);
  if (!step) return;
  if (guideOn) say(`${step.title}: done`, '🧭');
  vitals.add({ cheer: 5 }); refreshQuest();
  if (journey.complete) later(2, () => { film('finale'); hud.rankUp('Journey complete', 'A true scout'); audio.play('rank'); });
}
const on = (p) => ({ x: p.x, y: groundAt(p.x, p.z), z: p.z });
const wildAngle = Math.atan2(WILD.z, WILD.x);
const FILMS = {
  intro: () => { const back = Math.atan2(-player.position.z, -player.position.x); return [
    { at: { x: -12, y: 0, z: -10 }, r: 128, r1: 104, h: 74, h1: 54, a0: 0.5, a1: 1.25, lookH: 0, dur: 6.5, title: 'Scout Camp Island', sub: 'A small camp at the edge of a great wild jungle' },
    { at: on(FLAGPOLE), r: 19, r1: 15, h: 7, h1: 5, a0: 2.3, a1: 1.5, lookH: 1.5, dur: 5.5, title: 'Sixty scouts, one summer', sub: 'Exercise at dawn, the flag, lessons, games, and songs round the fire' },
    // From the pier: the ferry at its moorings, closing in on you at the top of the gangway.
    { at: () => player.position, r: 17, r1: 6, h: 6, h1: 2.2, a0: back - 0.75, a1: back - 0.2, lookH: 1.4, dur: 6, title: 'Your ferry has just come in', sub: 'Welcome to camp, scout' },
  ]; },
  exercise: () => [{ at: on({ x: 8.5, z: 17.3 }), r: 15, r1: 12, h: 5, h1: 3.5, a0: 2.6, a1: 1.7, lookH: 1, dur: 7, title: 'Morning exercise', sub: 'One, two, three, four!' }],
  ceremony: () => [{ at: on(FLAGPOLE), r: 13, r1: 10, h: 2.2, h1: 3.2, a0: 2.4, a1: 1.6, lookH: 3.6, dur: 7, title: 'Flag ceremony', sub: 'The whole camp stands for the flag' }],
  lunch: () => [{ at: on({ x: 15, z: 23 }), r: 14, r1: 11, h: 6, h1: 4, a0: -0.4, a1: 0.5, lookH: 0.8, dur: 6, title: 'Lunch', sub: 'Camp stew for everyone' }],
  campfire: () => [{ at: on(VILLAGE_FIRE), r: 11, r1: 8.5, h: 3.4, h1: 2.6, a0: 0.3, a1: 1.6, lookH: 1.2, dur: 8, title: 'Campfire night', sub: 'Songs and stories round the big fire' }],
  sleep: () => [{ at: on({ x: 10, z: 8 }), r: 38, r1: 32, h: 17, h1: 14, a0: 0.9, a1: 1.5, lookH: 0, dur: 6, title: 'Lights out', sub: 'Two scouts keep the night watch' }],
  summit: () => [{ at: on(LOOKOUT), r: 15, r1: 13, h: 9.5, h1: 10.5, a0: wildAngle + Math.PI - 0.6, a1: wildAngle + Math.PI + 0.5, lookH: 0.5, dur: 7, title: 'The summit', sub: 'Beyond the rope lies the wild jungle' }],
  // The cliff lookout: round the front past the waterfall, then over your shoulder to the lake, the river and the village.
  cliff: () => [
    { at: on(AREAS.lookout), r: 18, r1: 14, h: 3, h1: 6, a0: 1.05, a1: 1.85, lookH: -2, dur: 6, title: 'The cliff lookout', sub: 'The river starts here, at the foot of the falls' },
    { at: on(AREAS.lookout), r: 6, r1: 7.5, h: 3.2, h1: 4.2, a0: -1.85, a1: -1.3, lookH: 0.4, dur: 6, title: '', sub: 'The village and the far shore, all the way to the sea' },
  ],
  flag: () => [{ at: on(FLAGPOLE), r: 7.5, r1: 6, h: 1.3, h1: 1.8, a0: 2.4, a1: 2.0, lookH: 4.4, dur: 4.5, title: 'The flag goes up', sub: '' }],
  finale: () => [{ at: () => player.position, r: 5, r1: 10, h: 2, h1: 6, a0: 0, a1: 3.1, lookH: 1, dur: 7, title: 'A true scout', sub: 'Your first day is done. The island is yours.' }],
};
// Plays a little film: the camera leaves you for a few seconds, then comes back.
function film(id, opts = {}) {
  if ((!filmsOn && id !== 'intro') || director.active || player.riding || sleeping || hud.menuOpen) return false;
  if (hud.bagOpen) hud.toggleBag(); if (hud.journalOpen) hud.toggleJournal(); if (hud.mapOpen) hud.toggleMap();
  hud.setCine(true); filmsSeen.add(id);
  director.play(FILMS[id](), { onShot: (s) => hud.setCaption(s.title, s.sub), onEnd: () => { hud.setCine(false); if (opts.onEnd) opts.onEnd(); } });
  if (id === 'campfire') audio.play('song');
  if (id === 'ceremony' || id === 'flag') audio.play('bugle');
  if (id === 'exercise') audio.play('whistle');
  return true;
}
const idleInput = { move: { x: 0, z: 0 }, run: false, consumeHop: () => false };

// ---- Interface: journal, ranks, clock, minimap, menu -----------------------
const journal = createJournal();
function refreshProgress() { hud.setProgress(journal.list(), journal.rank(), journal.count, journal.total); }
function discover(id) {
  progress(id);
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
  onStart: (mode) => begin(mode),
  onToggleGuide: toggleGuide,
  onToggleFilms: () => { filmsOn = !filmsOn; hud.setFilms(filmsOn); audio.play('ui'); },
  onToggleSaver: () => { saver = !saver; hud.setSaver(saver); audio.play('ui'); try { localStorage.setItem('saver', saver ? '1' : '0'); } catch { /* private window */ } },
  onUseItem: (id, plain) => useItem(id, plain),
  onDropItem: (id) => dropItem(id),
  describeItem: (id) => describeItem(id),
  onSetTime: (t) => { timeOfDay = t; },
  onDaySpeed: () => cycleDaySpeed(),
});
refreshProgress(); refreshQuest(); hud.setFilms(true); hud.setSaver(saver); hud.setDaySpeed(daySpeed);
// What every scout sets out with.
bag.add('flask'); bag.add('torch'); bag.add('bugle'); bag.add('biscuit', 2);
refreshBag();
const dockEnd = { x: DOCK.x + Math.sin(DOCK.rot) * (DOCK.length - 1.5), z: DOCK.z + Math.cos(DOCK.rot) * (DOCK.length - 1.5) };
const PLACES = [['place-dock', dockEnd, 2.2], ['place-lookout', LOOKOUT, 5.5], ['place-camp', CAMPFIRE, 6], ['place-windmill', WINDMILL, 6.5],
  // The bigger island: the middle of the bridge and of the stones, the foot of the fall, the cliff top, the square, the paddies, the jetty's end.
  ['place-bridge', { x: (AREAS.bridge.a.x + AREAS.bridge.b.x) / 2, z: (AREAS.bridge.a.z + AREAS.bridge.b.z) / 2 }, 2.2],
  ['place-stones', AREAS.ford, 1.6], ['place-waterfall', { x: AREAS.waterfall.foot.x, z: AREAS.waterfall.foot.z + 4 }, 7],
  ['place-cliff', AREAS.lookout, AREAS.lookout.r + 1], ['place-village', AREAS.village, 8], ['place-farm', AREAS.paddies, 12],
  ['place-jetty', { x: AREAS.jetty.x + 8, z: AREAS.jetty.z }, 3]];

// The first key press or click leaves the start screen. Browsers only allow sound after that.
// 'journey' starts you on the ferry at the dock with a short film and a guide; 'free' drops you in camp.
function begin(mode, opts = {}) {
  if (hud.started) return;
  audio.start(); hud.begin(); ui.showHint(); ui.hideHintSoon(10);
  // Whatever key started the game should not also hop, mute or use something.
  input.consumeHop(); input.consumeInteract(); input.consumeMute();
  for (const a of areas) if (a.begin) a.begin(mode); // e.g. the harbour moors the ferry for a journey
  if (mode === 'journey') {
    guideOn = true;
    // At the top of the ferry's gangway, turned toward the island (see ARRIVAL in src/world/areas/harbour.js).
    const at = harbour.ARRIVAL;
    player.position.x = at.x; player.position.z = at.z; player.position.y = groundAt(at.x, at.z);
    rig.yaw = at.yaw; player.gesture('wave', 1.0, at.look);
    if (!params.has('t')) timeOfDay = 0.52;
    const hello = () => { tip('arrive', 'Welcome to the island! Walk down the gangway and follow the trail up to camp: the arrow shows the way.'); tip('move', 'W A S D to walk, hold Shift to run. Drag the mouse to look around.'); tip('guide', 'The journey, top right, suggests what to try next. Follow it or ignore it: press G to hide it.'); };
    if (opts.skipIntro) hello(); else film('intro', { onEnd: hello });
  } else tip('free', 'No guide this time. Press G if you would like the journey after all.');
  refreshQuest();
}
const wake = () => begin('free');
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!hud.started) { if (e.code === 'Enter' || e.code === 'Space') begin('journey'); return; }
  if (e.repeat) return;
  // During a film any of these keys skips it; nothing else works until it is over.
  if (director.active) { if (['Space', 'Enter', 'Escape', 'KeyE'].includes(e.code)) { director.skip(); input.consumeHop(); input.consumeInteract(); } return; }
  if (e.code === 'KeyG' && !hud.menuOpen) toggleGuide();
  if (e.code === 'KeyT') cycleDaySpeed();
  if (e.code === 'KeyJ' || e.code === 'Tab') { e.preventDefault(); if (!hud.menuOpen) toggleJournal(); }
  if (e.code === 'KeyM' && !hud.menuOpen) toggleMap();
  if (e.code === 'KeyC' && !hud.menuOpen) toggleLook();
  if (e.code === 'KeyB' && !hud.menuOpen) toggleBag();
  if (/^Digit[1-6]$/.test(e.code) && !hud.menuOpen) { const s = bag.slots[Number(e.code.slice(5)) - 1]; if (s) useItem(s.id); }
  // Esc closes the journal first, then opens the pause menu.
  if (e.code === 'Escape') { if (hud.bagOpen && !hud.menuOpen) toggleBag(); else if (hud.journalOpen && !hud.menuOpen) toggleJournal(); else if (hud.mapOpen && !hud.menuOpen) toggleMap(); else toggleMenu(); }
});
// Debug aids for automated screenshots: ?play skips the start screen, ?x=&z=&yaw= place the player and camera.
if (params.has('play')) wake();
if (params.has('journey')) begin('journey', { skipIntro: true });
if (params.has('intro')) begin('journey');
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
  renderer.setPixelRatio(Math.min(ratio, window.devicePixelRatio, MAX_RATIO));
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
const maxRatio = Math.min(window.devicePixelRatio, MAX_RATIO);
let ratio = maxRatio, slow = 0, quick = 0;
function tuneResolution(raw) {
  if (raw > 0.25) return; // a hitch from switching tabs, not a slow machine
  const want = 1 / frameRate(); // judged against the rate we are aiming for, not a fixed 60
  slow = raw > want * 1.25 ? slow + raw : Math.max(0, slow - raw * 2);
  quick = raw < want * 1.04 ? quick + raw : 0;
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
  if (hud.started && !hud.menuOpen) tuneResolution(raw);
  const paused = !hud.started || hud.menuOpen;
  // While paused the world stands still; only the picture keeps refreshing.
  const dt = paused ? 0 : clampDt(raw);
  elapsed += dt;

  if (!freezeTime) {
    const before = timeOfDay;
    timeOfDay = advance(timeOfDay, dt * (sleeping ? 45 : daySpeed));
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
    if (!first && hud.started) { tip('timetable', 'The camp follows a timetable. Press F to join in with whatever is going on.'); if (FILMS[block.id] && !filmsSeen.has(block.id)) filmDue = { id: block.id, at: elapsed + 16 }; }
    if (!first && hud.started) { hud.announce(block.note, block.label); audio.play(block.id === 'ceremony' || block.id === 'exercise' ? 'whistle' : 'bell'); }
  }
  crowd.tick(block, blockProgress(block, timeOfDay));
  // A little film of the camp's activity, once everyone has had time to gather.
  if (filmDue && elapsed >= filmDue.at && !paused) { if (filmDue.id === block.id && !buildings.inside) film(filmDue.id); filmDue = null; }
  const filming = director.active;
  if (filming) { input.consumeInteract(); input.consumeJoin(); input.consumeSit(); input.consumeLook(); input.consumeZoom(); }
  if (night > 0.5 && !paused) tip('torch', `It is getting dark. Press ${bag.slots.findIndex((s) => s.id === 'torch') + 1} to switch on your torch.`);
  setSleepy(night);
  // The scout's face shows how they are doing.
  player.mood = params.get('mood') || (vitals.hungry || vitals.thirsty ? 'sad' : vitals.winded ? 'effort' : vitals.cheer >= 85 ? 'happy' : null); // ?mood= is a debug aid
  setViewer(camera.position.x, camera.position.z, player.position.x, player.position.z); // detail is judged from the camera, so the films look right
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
    const colliders = openStatic.concat(pickups.colliders, wilds.colliders, areaColliders(), buildings.colliders(), villagers.colliders(), activities.colliders(), campLife.colliders(), wildlife.colliders());
    zipline.update(dt, elapsed, player);
    // Being walked back out of the jungle, nothing may snag you: trees are ignored for those few seconds.
    player.update(dt, filming && !player.auto ? idleInput : input, rig.yaw, player.auto ? openStatic : colliders, elapsed);
    buildings.update(dt, elapsed, player);
    villagers.update(dt, elapsed, player);
    activities.update(dt, elapsed);
    campLife.update(dt, elapsed);
    animals.update(dt, elapsed, player, night);
    wildlife.update(dt, elapsed, player, night);
    pond.update(dt, elapsed, night, player.position);
    pickups.update(dt, player.position);
    wilds.update(elapsed, night, player.position);
    for (const a of areas) if (a.update) a.update(dt, elapsed, player, night);
    if (!sleeping) feel(dt);
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i][0] <= elapsed) { const fn = pending[i][1]; pending.splice(i, 1); fn(); }
  }
  // Off safe ground into the wild jungle: a warning that grows, then a firm stop. Safe ground is the
  // camp, the locals' land, the river banks, the riverside path, the lake shore and the cliff path.
  if (!paused && !player.riding) {
    const safe = nearestSafe(player.position.x, player.position.z), depth = safe.depth;
    if (depth > 0) {
      if (!inWild) { inWild = true; audio.play('alarm'); discover('place-wild'); growlAt = elapsed + 1.5; }
      hud.setDanger(Math.min(1, 0.4 + depth / WILD.limit * 0.6));
      if (elapsed > growlAt) { growlAt = elapsed + 3 + Math.random() * 3; audio.play('growl'); }
      // Keep going despite the warning and the game takes over: a stop screen, and you are walked back out.
      if (depth > WILD.limit && !turnedBack) {
        turnedBack = 8; // at most; it ends as soon as you are back on safe ground
        hud.setStop(true); audio.play('alarm'); player.gesture('bonk', 0.7); vitals.add({ cheer: -6 });
        if (hud.bagOpen) hud.toggleBag(); if (hud.mapOpen) hud.toggleMap(); if (hud.journalOpen) hud.toggleJournal();
      }
    } else if (inWild) { inWild = false; hud.setDanger(0); say('Phew. Back on safe ground.', '😮‍💨'); }
    if (turnedBack) {
      turnedBack = Math.max(0, turnedBack - dt);
      // Walked to the nearest safe ground, re-aimed every frame.
      const dx = safe.x - player.position.x, dz = safe.z - player.position.z, l = Math.hypot(dx, dz);
      if (l > 0.2) player.auto = { x: dx / l, z: dz / l };
      // Never past the line, whatever happens.
      const over = depth - (WILD.limit + 0.5);
      if (over > 0 && l > 0) { player.position.x += (dx / l) * over; player.position.z += (dz / l) * over; }
      if (depth < -1) turnedBack = 0;
      if (!turnedBack) { player.auto = null; hud.setStop(false); say('Stay where the camp can see you.', '🧭'); }
    }
  }
  // Fog thickens among the big trees, and the sea is loud only near the shore.
  const wn = wildness(player.position.x, player.position.z);
  scene.fog.density = sky.fogDensity * (1 + wn * 1.6);
  audio.setSea(Math.min(1, Math.max(0, (shoreR(player.position.x, player.position.z) - 34) / 22)));
  hud.setStats(vitals);
  // The torch shines from the hand, a step ahead.
  torch.position.set(player.position.x + player.facing.x * 0.38 - player.facing.z * 0.17, player.position.y + 0.72, player.position.z + player.facing.z * 0.38 + player.facing.x * 0.17);
  // The beam follows the hand a moment late and bobs a little with each step.
  const bob = Math.sin(elapsed * 9) * 0.25 * Math.min(1, player.speed / 2);
  torchAim.set(player.position.x + player.facing.x * 9, player.position.y - 0.6 + bob, player.position.z + player.facing.z * 11);
  torch.target.position.lerp(torchAim, 1 - Math.exp(-clampDt(raw) * 9));
  const torchLit = torchOn && !player.asleep ? 1 : 0;
  torch.intensity += (torchLit * (2.2 + night * 7.5) - torch.intensity) * 0.25;

  // What would E do right now?
  playerXZ.x = player.position.x; playerXZ.z = player.position.z;
  const pressed = input.consumeInteract();
  const target = paused || filming || player.sitting || player.riding || player.asleep ? null : pickInteractable(playerXZ, player.facing, interactables);
  hintTarget = target ? target.prompt().split(' — ').slice(1).join(' — ') : null;
  player.focus = target ? target.position : null;
  if (target && target.kind === 'pickup') tip('pickup', 'Press E to pick things up. They go in your backpack: press B to look inside.');
  if (target) {
    ui.setPrompt(target.prompt());
    ui.setMarker(target.position.x, target.markerY, target.position.z);
    if (pressed) {
      if (target.kind === 'flag' && !filmsSeen.has('flag') && target.prompt().includes('raise')) later(0.3, () => film('flag'));
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
    if (buildings.inside) { discover('place-inside'); tip('bed', 'The bed with the gold pillow is yours. Lie down in it to sleep until morning.'); }
    if (Math.hypot(playerXZ.x - FLAGPOLE.x, playerXZ.z - FLAGPOLE.z) < 10) progress('arrive');
    if (journal.has('place-cliff') && !filmsSeen.has('cliff') && !filming) { if (!film('cliff')) filmsSeen.add('cliff'); }
    // The river is too deep to wade: say so the first time you come down to its bank.
    if (!tipsSeen.has('river')) for (const p of AREAS.river) if (Math.hypot(playerXZ.x - p.x, playerXZ.z - p.z) < p.w + 3) { tip('river', 'The river is too deep to wade. Cross by the plank bridge, or by the stepping stones up near the lake.'); break; }
    if (Math.hypot(playerXZ.x - AREAS.cliffPath[0].x, playerXZ.z - AREAS.cliffPath[0].z) < 4) tip('cliffpath', 'The cliff path climbs to a lookout beside the waterfall. Take it slowly.');
    if (journal.has('place-lookout') && !filmsSeen.has('summit') && !filming) { if (!film('summit')) filmsSeen.add('summit'); tip('fox', 'The flying fox starts here: climb the launch tower and press E.'); }
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

  // The journey's next place, marked on the picture (pinned to the edge when it is out of view).
  const goal = guideOn && !filming && !paused && journey.current && journey.current.where;
  if (goal && Math.hypot(goal.x - playerXZ.x, goal.z - playerXZ.z) > 5) {
    wayPos.set(goal.x, groundAt(goal.x, goal.z) + 2.2, goal.z).project(camera);
    let sx = wayPos.x, sy = wayPos.y; const behind = wayPos.z > 1;
    if (behind) { sx = -sx; sy = -sy; }
    const off = behind || Math.abs(sx) > 0.9 || Math.abs(sy) > 0.8;
    if (off) { const k = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.8, behind ? 1e3 : 1); sx /= k; sy /= k; if (behind) { const m = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.8) || 1; sx /= m; sy /= m; } }
    hud.setWaypoint((sx * 0.5 + 0.5) * window.innerWidth, (-sy * 0.5 + 0.5) * window.innerHeight, Math.hypot(goal.x - playerXZ.x, goal.z - playerXZ.z), off);
  } else hud.setWaypoint(null);

  if (!director.update(clampDt(raw))) rig.update(paused ? clampDt(raw) : dt, player.position, input, allStatic, { inside: !!buildings.inside, speed: player.riding ? 8 : player.speed * 1.4 });
  sky.update(timeOfDay, elapsed, player.position);
  island.update(elapsed);
  island.setLight(sky.waterLight, sky.fogColor, scene.fog.density);
  village.update(elapsed);
  village.setNight(night);
  buildings.setNight(night);
  scatter.update(elapsed, player.position);
  props.update(dt, elapsed, night);
  effects.update(dt);
  ui.update(dt, elapsed);

  // Shadows are redrawn every second picture at the smooth rate: nobody sees a shadow one frame late.
  renderer.shadowMap.needsUpdate = saver || (stats.frames & 1) === 0;
  renderer.render(scene, camera);
  // Counted over two pictures, since only every other one redraws the shadows.
  drawn.calls = (drawn.lastCalls + renderer.info.render.calls) / 2; drawn.tris = (drawn.lastTris + renderer.info.render.triangles) / 2;
  drawn.lastCalls = renderer.info.render.calls; drawn.lastTris = renderer.info.render.triangles;
}
const drawn = { calls: 0, tris: 0, lastCalls: 0, lastTris: 0 };
// ---- Not working harder than needed: a fast screen would otherwise have every refresh drawn.
// Smooth is 60 pictures a second, saver 30; the title turns at 30 and the pause menu barely ticks over.
function frameRate() { return hud.menuOpen ? 10 : !hud.started || saver ? 30 : 60; }
let lastDraw = 0;
function frame(now) {
  requestAnimationFrame(frame);
  // The 3 ms of slack lets a 60 Hz screen draw on every refresh, not every other one.
  if (!noLimit && now - lastDraw < 1000 / frameRate() - 3) return;
  lastDraw = now;
  step();
}
// Debug aid for screenshots: ?settle runs a few seconds of game time before the first picture.
if (params.has('settle')) for (let i = 0, n = (Number(params.get('settle')) || 3.5) / 0.05; i < n; i++) { last = performance.now() - 50; step(); }
requestAnimationFrame(frame);

// Handles for automated checks in the browser.
window.__game = {
  wilds, areas, player, rig, input, stats, vitals, journey, director, film, begin, bag, give, useItem, pickups, scene, camera, renderer, audio, interactables, villagers, props, hud, journal, buildings, zipline,
  get timeOfDay() { return timeOfDay; }, set timeOfDay(v) { timeOfDay = v; },
};
if (params.has('dbg')) setInterval(() => { document.title = JSON.stringify({ calls: Math.round(drawn.calls), tris: Math.round(drawn.tris), ratio }); }, 300);
