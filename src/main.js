import * as THREE from 'three';
import { createIsland } from './world/island.js';
import { createSky } from './world/sky.js';
import { createWeather } from './world/weather.js';
import { createVillage } from './world/village.js';
import { createBuildings } from './world/buildings.js';
import { createCampProps } from './world/campProps.js';
import { createScatter } from './world/scatter.js';
import { createPond } from './world/pond.js';
import { createZipline } from './world/zipline.js';
import { createProps, SUN_PROXIES, setShadowSize } from './world/props.js';
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
import { createAmbience } from './ambience.js';
import { createHUD } from './hud.js';
import { createEffects } from './effects.js';
import { createCrowd, blockAt, blockProgress, JOIN, nearJoinSpot } from './actors/schedule.js';
import { setViewer, setGround, setSleepy } from './actors/figure.js';
import { createJournal, clockText, phaseLabel } from './logic/journal.js';
import { getColliders, groundAt, addPlatform, removePlatform, DOCK, LOOKOUT, CAMPFIRE, WINDMILL, SEATS } from './logic/layout.js';
import { surfaceAt, SURFACES, pondDistance } from './logic/surface.js';
import { pickInteractable } from './logic/interact.js';
import { advance, nightFactor, phaseAt } from './logic/dayCycle.js';
import { clampDt } from './logic/time.js';
import { START_TIME, POND, AREAS, PLAYER_START } from './config.js';
import { createPickups } from './world/pickups.js';
import { createDirector, placeFor } from './cutscene.js';
import { createFinish } from './finish.js';
import { readPerfFlags, applyOffSwitches, createFrameTimer, createAutoGraphics } from './perf.js';
import { createSunFx, goldenHour } from './sunfx.js';
import { createParticles } from './world/particles.js';
import { createReact } from './world/react.js';
import { createContactShadows } from './world/contact.js';
import { createPlay } from './world/play.js';
import { createStoryRuntime } from './story/runtime.js';
import { createScope } from './scope.js';
import { createPhotoCamera } from './photo.js';
import { beltOf, keyOf } from './logic/belt.js';
import { album } from './story/album.js';
import { createLitter } from './world/litter.js';
import { createPhotoBoard } from './world/photoBoard.js';
import { serialiseRestore, loadRestore, resetRestore } from './logic/restore.js';
import { FIELD_GUIDE } from './story/fieldGuide.js';
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
import * as storyCast from './world/areas/storyCast.js'; // the story's buddy, younger scout, notice board, glowing specks
import * as lifeguard from './world/areas/lifeguard.js'; // the lifeguard tower on the camp beach
const AREA_LIST = [crossings, signpost, riverside, cliffs, hamletArea, farm, harbour, storyCast, lifeguard];
// ---- Plants and ground grass on the locals' land (src/world/flora.js). Kept last: it lays out its
// plants round every circle the areas above ask to keep clear. `?noflora` leaves it out.
import * as flora from './world/flora.js';
if (!new URLSearchParams(location.search).has('noflora')) AREA_LIST.push(flora);
import { nearestSafe, wildness, shoreR } from './logic/terrain.js';
import { WILD } from './config.js';
import { ITEMS, FLASK_SIPS, SIP } from './logic/items.js';
import { STAT_KEYS } from './logic/stats.js';
import { createBag } from './logic/bag.js';
import { createStats, STAT_LABEL } from './logic/stats.js';
import { heightAt } from './logic/terrain.js';

const canvas = document.getElementById('game');
// Graphics (pause menu, remembered): High draws up to the screen's own density (2 on a Retina screen)
// through the finishing pass (src/finish.js: multisampled, glow on bright things); Low draws straight to
// the screen at ratio 1 with lighter shadows, particles and water (applyQuality below), for weak laptops.
// ?graphics=low|high forces one.
const RATIO_CAP = { high: 2, low: 1 };
let graphics = 'high'; try { if (localStorage.getItem('graphics') === 'low') graphics = 'low'; } catch { /* private window */ }
{ const g = new URLSearchParams(location.search).get('graphics'); if (g === 'low' || g === 'high') graphics = g; }
const perfFlags = readPerfFlags(new URLSearchParams(location.search)); // measuring switches (src/perf.js)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RATIO_CAP[graphics]));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.localClippingEnabled = true; // lets a tent be sliced open while you are inside it
renderer.info.autoReset = false; // counted per picture below, the finishing pass's own draws included
const finish = createFinish(renderer);
const frameTimer = createFrameTimer(); // script time per frame (update, render call), for ?dbg

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
const sunFx = createSunFx(scene); // the sun's glare and light shafts (High, drawn by finish.js), a sprite halo on Low
sky.sunLight.shadow.camera.layers.enable(SUN_PROXIES); // the welded still casters near the player (src/world/shadowProxy.js), next to layer 0
const weather = createWeather(scene, params, audio); // random weather; ?weather=rain|wind|fog|sun forces one
weather.setGround(groundAt); // rain rings land on decks and bridges too
const village = createVillage(scene);
const buildings = createBuildings(scene, { audio, onSleep: (bed) => startSleep(bed) });
const campProps = createCampProps(scene);
const scatter = createScatter(scene);
const pond = createPond(scene);
const wilds = createWilds(scene);
const input = createInput(window, canvas);
const player = createPlayer(scene, { groundAt, surfaceAt, surfaces: SURFACES });
const rig = createFollowCamera(camera);
const props = createProps(scene, { scatter, weather, player, ui, audio, now: () => elapsed, dayTime: () => timeOfDay, onShake: (t) => shakeFruit(t) });
setGround(groundAt); // every figure plants its feet on this
const crowd = createCrowd(); // the camp timetable everyone follows
const villagers = createVillagers(scene, { ui, audio, player, crowd });
const activities = createActivities(scene, { ui, audio, crowd, player });
const campLife = createCampLife(scene, { ui, audio, player, crowd });
const animals = createAnimals(scene, { ui, audio, player });
const wildlife = createWildlife(scene, { ui, audio });
const zipline = createZipline(scene, { ui, audio, player });
props.onBell((pos) => villagers.hearBell(pos));
// ---- Looking through a telescope (the guard tower's, src/scope.js): names what is under the crosshair.
const NAMED = { villager: 'Scout', local: 'Villager', goat: 'Goat', buffalo: 'Water buffalo', ducks: 'River ducks', monkey: 'Monkeys', chickens: 'Chickens', sheep: 'Sheep', cat: 'Camp cat', zipline: 'Flying fox', campfire: 'Campfire', telescope: 'Telescope', water: 'Water barrel', bell: 'Camp bell', flag: 'Flagpole' };
const LANDMARKS = () => [['Summit camp', LOOKOUT, 1], ['Windmill', WINDMILL, 6], ['Dock', dockEnd, 0.5], ['Pond', POND, 0], ['Beach camp', CAMPFIRE, 0.5], ['Village', AREAS.village, 4], ['Waterfall', AREAS.waterfall.foot, 6],
  ['Cliff lookout', AREAS.lookout, 1], ['Plank bridge', { x: (AREAS.bridge.a.x + AREAS.bridge.b.x) / 2, z: (AREAS.bridge.a.z + AREAS.bridge.b.z) / 2 }, 1], ['Rice fields', AREAS.paddies, 0], ['Fishing jetty', AREAS.jetty, 0.5]];
const scope = createScope({
  camera, input, groundAt, audio,
  candidates: () => {
    const out = [];
    for (const t of interactables) { if (t.enabled === false || t.kind === 'pickup' || t.kind === 'ladder') continue; const name = t.speaker || NAMED[t.kind]; if (name) out.push({ id: t.id, name, x: t.position.x, y: (t.markerY || groundAt(t.position.x, t.position.z)) - 0.6, z: t.position.z, far: 180 }); }
    for (const [name, p, up] of LANDMARKS()) out.push({ id: `land-${name}`, name, x: p.x, y: groundAt(p.x, p.z) + up, z: p.z, far: 400 });
    return out;
  },
  onSpot: (name) => { say(`Spotted: ${name}`, '🔭'); progress('spot'); },
  onClose: () => { storyRt.blendFrom(); syncLook(); }, // the follow camera blends back in
});

// ---- Backpack and how you feel ------------------------------------------------
const bag = createBag(12);
const vitals = createStats();
let sips = FLASK_SIPS, torchOn = false, busyUntil = 0, keepsakeAt = -99;
// The torch throws a cone of light ahead of you, not a glow all round.
// A wide, soft-edged beam that spreads and fades the further it lands, and a faint glow round the scout.
// A forward beam only: a cone from the hand, soft at its rim but lighting nothing beside or behind the scout.
const torch = new THREE.SpotLight(0xfff0c8, 0, 34, 0.4, 0.55, 0.6); scene.add(torch, torch.target);
// Real shadows: one 2D map (cheap next to a cube), redrawn every picture while the torch is lit, from the near casters
// and welded proxies round the player (src/world/props.js, layer 9; the player's own body is left out).
torch.castShadow = true; torch.shadow.mapSize.set(1024, 1024); torch.shadow.camera.near = 0.2; // far = the torch's reach (34)
torch.shadow.bias = -0.0004; torch.shadow.normalBias = 0.03; torch.shadow.radius = 2.5;
torch.shadow.camera.layers.set(9); torch.shadow.autoUpdate = false; torch.shadow.needsUpdate = false;
let torchFrame = 0;
const torchAim = new THREE.Vector3();
const particles = createParticles(scene, { groundAt, weather, props, player, torch, graphics: () => graphics }); // dust, sparks, pollen, fireflies, butterflies, birds, Low halos
// Measuring switches (?noshadow=sun,fire,lamps,torch, ?nosky, ?nowater: src/perf.js).
applyOffSwitches(perfFlags, { scene, sky, island });
if (perfFlags.noShadow.has('sun')) sky.sunLight.castShadow = false;
if (perfFlags.noShadow.has('torch')) torch.castShadow = false;
props.setShadowsOff(perfFlags.noShadow);
// ---- Helping the island heal (src/logic/restore.js, src/world/litter.js): litter to pick up, a birdhouse to mend.
const litter = createLitter(scene, { groundAt, onClean: (thing, r) => onClean(thing, r) });
function onClean(thing, r) {
  const pct = Math.round(r.health * 100);
  if (thing.kind === 'birdhouse') { for (let i = 0; i < 3; i++) later(0.15 + i * 0.3, () => audio.play('door')); later(1.1, () => { say('Birdhouse mended. Someone will move in soon.', '🐦'); audio.play('discover'); }); vitals.add({ cheer: 8 }); }
  else { if (!give('litter', 1, thing)) say('No room for the litter bag. Make space in your backpack.', '@litterbag'); else say(`Litter picked up · ${r.name}: ${pct}% clean`, '@litterbag'); vitals.add({ cheer: 3 }); }
  tip('litter', 'Every bit of litter you pick up helps. Clean a place and more birds and butterflies come back there.');
  progress('litter');
  if (r.all) later(1.4, () => { hud.reward({ kind: 'discovery', title: `${r.name[4].toUpperCase()}${r.name.slice(5)} is clean`, sub: 'Listen: more birds are coming back', pic: '🌿' }); audio.play('discover'); });
}
const ambience = createAmbience(audio, scene); // area sound beds, real birds singing, dawn and campfire cues
const react = params.has('noreact') ? { colliders: [], update() {} } : createReact(scene, { props, audio, player, groundAt }); // V3: plants part, loose things roll, hanging things swing, tents ripple (?noreact: off, for measuring)
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
  refreshBag(); discover('collect'); progress(`pick-${id}`); if (bag.kinds() >= 8) discover('hoard');
  collected += got; if (collected >= 3) progress('collect3');
  if (id === 'stick') tip('wood', 'Firewood! Stand by a campfire and use it to feed the flames.');
  if (ITEMS[id].cook) tip('cook', 'This can be cooked: stand by a lit campfire and use it.');
  return got;
}
const pickups = createPickups(scene, {
  audio, give, groundAt, note: (t) => { say(t); audio.play('nope'); },
  flaskFull: () => sips >= FLASK_SIPS,
  canDrinkAt: (where) => where === 'barrel' || sips < FLASK_SIPS,
  onWater(label, at) {
    player.gesture('drink', 1.2);
    if (sips < FLASK_SIPS) { sips = FLASK_SIPS; vitals.add({ water: 18 }); if (label === 'barrel') play.pour(at); else audio.play('pour'); say('Flask filled to the top.', '@bottle'); refreshBag(); }
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
    if (sips <= 0) { say('Your flask is empty. Fill it at a water barrel or the pond.', '@bottle'); audio.play('nope'); return; }
    sips--; vitals.add(SIP); player.gesture('drink', 1.3); audio.play('gulp'); busy(1.0); discover('drink');
  } else if (item.use === 'torch') { torchOn = !torchOn; player.setTorch(torchOn); audio.play('click'); say(torchOn ? 'Torch on.' : 'Torch off.', '🔦'); }
  else if (item.use === 'bugle') { player.gesture('blow', 1.3); audio.play('bugle'); villagers.hearBell({ x: p.x, z: p.z }); vitals.add({ cheer: 3 }); busy(1.2); }
  else if (item.use === 'camera') { openCamera(); return; }
  else if (item.use === 'litter') { const n = bag.count('litter'); say(`${n} piece${n === 1 ? '' : 's'} of litter in your bag. Thank you for helping the island!`, '@litterbag'); }
  else if (item.use === 'bandage') { bag.remove(id, 1); vitals.add({ energy: 45, cheer: 5 }); player.gesture('rub', 1.3); audio.play('discover'); say('Good as new.', '🩹'); busy(1.2); }
  else if (item.use === 'stoke') {
    const f = props.fireNear(p.x, p.z, false);
    if (!f) { say('Take it to a campfire.', '🔥'); audio.play('nope'); return; }
    bag.remove(id, 1); player.gesture('throw', 0.9, f); busy(0.8);
    later(0.45, () => { props.stoke(f); audio.play('fire'); });
    vitals.add({ cheer: 6 }); discover('stoke');
  } else if (item.use === 'skip') {
    // Skimmed where the camera looks (src/world/play.js): flat and fast, it skips across the water.
    if (!play.throwStone()) return;
    bag.remove(id, 1); busy(0.8);
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
  vitals.tick(dt, { cold: weather.cold, running: player.speed > 3.1, moving: player.moving, sitting: player.sitting, cosy: !!near || !!player.act });
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
function startSleep(bed) { player.asleep = bed; sleeping = true; hud.setSleeping(true); audio.play('sit'); discover('bed'); storyRt.onSleep(); }
function wakeUp() { if (!sleeping) return; sleeping = false; player.asleep = null; hud.setSleeping(false); vitals.set('energy', 100); vitals.add({ food: -14, water: -14, cheer: 10 }); storyRt.onWake(); progress('woke'); }

// ---- Feet on the ground: every surface sounds and reacts differently -------
let stepCount = 0, dayNumber = 1;
player.onStep = (surface, running) => {
  stepCount++;
  audio.play(`step:${surface}`);
  effects.step(surface, player.position, player.heading, running, weather.wet); // rain-soaked ground splashes underfoot
  if (surface === 'sand') discover('place-beach');
  if (surface === 'water' && pondDistance(player.position.x, player.position.z) < POND.rw) discover('place-pond');
};
// Little accidents: a puff of dust, a squeak and a startled look.
const overHead = () => new THREE.Vector3(player.position.x, player.position.y + 1.6, player.position.z);
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
  scope,                                   // scope.open(eye, heading): look through a telescope (src/scope.js)
  say: (text, pic) => say(text, pic),      // a short note at the bottom of the screen
  tip: (id, text) => tip(id, text),        // a one-line tip, shown once per id
  discover: (id) => discover(id),          // tick a journal entry or journey step by id (unknown ids are ignored)
  later: (seconds, fn) => later(seconds, fn),
  shakeFruit: (t) => shakeFruit(t),        // t = { id, kind, x, y, z }: maybe drop an apple (or a coconut, kind 3)
  now: () => elapsed, dayTime: () => timeOfDay,
  crowd,                                   // the camp timetable, for people who follow it (src/world/areas/storyCast.js)
  story: { check: (c) => !!(storyRt && storyRt.story.check(c)) }, // ask the story (a condition string, see src/story/engine.js)
  has: (id) => bag.count(id),              // how many of a thing are in the backpack
  take: (id) => { if (!bag.count(id)) return false; bag.remove(id, 1); refreshBag(); return true; }, // use one up
  hear: (p) => villagers.hearBell(p),      // people nearby glance toward p (the tower siren)
  fed: () => play && play.noticed('ducks-bread'),
};
const areas = AREA_LIST.map((m) => m.create(scene, areaDeps) || {});
for (const a of areas) if (a.lamps) props.addLamps(a.lamps); // village and pier lamps light the ground round them at night
const areaColliders = () => areas.flatMap((a) => (typeof a.colliders === 'function' ? a.colliders() : a.colliders || []));

// Buildings are hollow for the player (walls with a doorway); everyone else treats them as solid.
const allStatic = getColliders();
const openStatic = allStatic.filter((c) => !c.building);
// Soft contact shadows under everything solid, and under people's feet (src/world/contact.js).
const contact = createContactShadows(scene, { groundAt });
contact.addStatic([...allStatic, ...areaColliders()]);
// ---- Things to use with E (src/world/play.js, milestone V4): stones, chimes, crates, the rope swing, fishing, stargazing, the campfire.
const play = createPlay(scene, {
  audio, ui, player, effects, groundAt, input, camera, props, keepClear,
  now: () => elapsed, later: (s, fn) => later(s, fn), nightF: () => nightFactor(timeOfDay),
  say: (t, pic) => say(t, pic), tip: (id, t) => tip(id, t), reward: (r) => hud.reward(r), progress: (e) => progress(e),
  give: (id, n, at) => give(id, n, at), has: (id) => bag.count(id), take: (id) => { if (!bag.count(id)) return false; bag.remove(id, 1); refreshBag(); return true; },
  keyOf: (id) => keyOf(bag.slots, id), itemName: (id) => ITEMS[id].name, cheer: (n) => vitals.add({ cheer: n }), eat: (e) => vitals.add(e),
});
const interactables = [...play.interactables, ...litter.interactables, ...areas.flatMap((a) => a.interactables || []), ...pickups.interactables, ...props.interactables, ...buildings.interactables, ...zipline.interactables, ...villagers.interactables, ...activities.interactables, ...campLife.interactables, ...animals.interactables, ...wildlife.interactables];
// ---- The digital camera (src/photo.js): a photo of an animal in the focus box fills its field-guide entry.
const photo = createPhotoCamera({
  camera, input, canvas, groundAt, audio, player, interactables, scene, particles, finish,
  light: () => (1 - nightFactor(timeOfDay)) * (1 - 0.4 * (weather.cloud || 0)),
  label: (s) => (s.guide && FIELD_GUIDE[s.guide] ? FIELD_GUIDE[s.guide].name : s.name || ''),
  onPhoto: (shot) => onPhoto(shot),
  onClose: () => { if (!director.active) { finish.dof = null; finish.useDepth(false); } storyRt.blendFrom(); syncLook(); },
});
album.hear = (c) => { const p = player.position; audio.call(c.kind, p.x + player.facing.x * 3, p.y + 1.5, p.z + player.facing.z * 3, c.variant || 0); };
const photoBoard = createPhotoBoard(scene, (areas.find((a) => a.where && a.where.board) || { where: { board: { x: 7, z: -3.6, rot: 0.35 } } }).where.board, groundAt);
void photoBoard;
const whenWord = () => { const n = nightFactor(timeOfDay); return n > 0.5 ? 'night' : timeOfDay < 0.36 ? 'morning' : timeOfDay < 0.52 ? 'middle of the day' : timeOfDay < 0.66 ? 'afternoon' : 'evening'; };
function openCamera() {
  if (!hud.started || hud.menuOpen || player.riding || player.asleep || director.active || storyRt.talking || scope.active || photo.active) return;
  if (hud.bagOpen) hud.toggleBag(); if (hud.journalOpen) hud.toggleJournal(); if (hud.mapOpen) hud.toggleMap();
  if (player.sitting) player.stand();
  finish.useDepth(true); // the camera's depth of field and autofocus probe, on High and Low
  photo.open(); syncLook(); progress('camera');
  tip('camera', 'Put an animal in the focus box and press Space or click. Scroll to zoom. E puts the camera away.');
}
// A photo was taken: { thumb, best: { guide, name, d } | null, grade }. Returns { caption } for the print.
function onPhoto(shot) {
  progress('photo');
  const b = shot.best;
  if (!b) return { caption: 'Nothing in the focus box' };
  if (!b.guide) { if (shot.thumb) album.pin(b.name, shot.thumb); say(`Nice photo of ${b.name}! Pinned on the camp board.`, '📷'); vitals.add({ cheer: 2 }); return { caption: b.name }; }
  const g = FIELD_GUIDE[b.guide], r = album.record(b.guide, { grade: shot.grade, thumb: shot.thumb, when: whenWord(), day: dayNumber });
  const known = storyRt.story.state.guide.includes(b.guide);
  if (!known) storyRt.story.apply(`guide:${b.guide}`); // the field-guide card shows the photo (src/story/runtime.js)
  else if (r.better) { hud.reward({ kind: 'guide', title: g.name, sub: `A better photo: ${'★'.repeat(shot.grade)}`, pic: shot.thumb || g.icon }); audio.play('discover'); }
  else if (r.first) say(`Photo of a ${g.name.toLowerCase()} added to its field-guide page.`, '📷');
  if ((!known || r.better || r.first) && shot.thumb) album.pin(g.name, shot.thumb);
  if (!known || r.better) { vitals.add({ cheer: 5 }); hud.refreshJournal(); }
  return { caption: `${g.name}${!known ? ' · new!' : r.better ? ' · better!' : ''}` };
}
const playerXZ = { x: 0, z: 0 };
const hintList = [];
let hintTarget = null;

// A different movement for each kind of thing you do: [gesture, seconds].
const GESTURES = {
  lantern: ['reachUp', 0.8], door: ['push', 0.7], bell: ['pull', 1.1], flag: ['pull', 1.3], tree: ['shake', 0.9], campfire: ['crouch', 1.0],
  pickup: ['crouch', 0.8], station: ['reach', 0.8], litter: ['crouch', 0.8], repair: ['reach', 1.2],
  chickens: ['shoo', 0.9], cat: ['crouch', 1.1], sheep: ['pat', 0.9], telescope: ['peer', 1.5],
  local: ['wave', 0.9], goat: ['pat', 0.9], buffalo: ['pat', 0.9], monkey: ['peer', 1.2], view: ['peer', 1.5],
  pebbles: ['crouch', 0.8], chimes: ['reachUp', 0.8], crate: ['crouch', 0.9], siren: ['push', 0.6], // V4 (src/world/play.js)
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

// ---- The story (src/story/), tips and little films -------------------------------
let storyRt = null; // created once the HUD exists, below
const director = createDirector(camera);
const noLimit = params.has('nolimit'); // debug: draw as fast as possible, for measuring
// How fast the day goes by: 1× is the normal 8-minute day, 2× is twice as fast. Remembered between visits.
const DAY_SPEEDS = [1, 1.25, 1.5, 2];
let daySpeed = 1; try { daySpeed = DAY_SPEEDS.includes(Number(localStorage.getItem('daySpeed'))) ? Number(localStorage.getItem('daySpeed')) : 1; } catch { /* private window */ }
function cycleDaySpeed() { daySpeed = DAY_SPEEDS[(DAY_SPEEDS.indexOf(daySpeed) + 1) % DAY_SPEEDS.length]; hud.setDaySpeed(daySpeed); if (hud.started) hud.note && hud.note(`Day speed ${daySpeed}×`); audio.play('ui'); try { localStorage.setItem('daySpeed', String(daySpeed)); } catch { /* private window */ } }
let saver = false; try { saver = localStorage.getItem('saver') === '1'; } catch { /* private window */ }
let guideOn = false, filmsOn = true, collected = 0;
const tipsSeen = new Set(), filmsSeen = new Set();
// One line of help, the first time something comes up.
function tip(id, text) { if (tipsSeen.has(id) || !hud.started) return; tipsSeen.add(id); hud.tip(text); }
function refreshQuest() { hud.setQuest(storyRt ? storyRt.card() : null, guideOn); }
function toggleGuide() { guideOn = !guideOn; refreshQuest(); audio.play('ui'); say(guideOn ? 'Quest guide on.' : 'Quest guide off. Explore as you like.', '🧭'); }
// Something happened that the story cares about (src/story/runtime.js turns it into quest progress).
function progress(event) { if (storyRt) storyRt.event(event); }
const on = (p) => ({ x: p.x, y: groundAt(p.x, p.z), z: p.z });
const up = (p, h) => () => { const q = typeof p === 'function' ? p() : p; return { x: q.x, y: q.y + h, z: q.z }; }; // a point h above another (which may move)
const ring = (p, a, r, h) => ({ x: p.x + Math.cos(a) * r, y: p.y + h, z: p.z + Math.sin(a) * r }); // a point on a circle round p
const wildAngle = Math.atan2(WILD.z, WILD.x);
// The films. Shot format and camera moves: src/cutscene.js. Titles sit on each shot's empty side; the
// subject is in focus (depth of field on High), and a few shots pull focus from you to what you see.
const FILMS = {
  intro: () => { const back = Math.atan2(-player.position.z, -player.position.x), flag = on(FLAGPOLE); return [
    // A slow aerial drift over the whole island, the lens easing in.
    { at: { x: -12, y: 0, z: -10 }, r: 128, r1: 106, h: 74, h1: 56, a0: 0.5, a1: 1.15, lookH: 0, fov: 52, fov1: 47, dur: 6.5, drift: 0.6, aperture: 0.35, place: 'center', title: 'Scout Camp Island', sub: 'A small camp at the edge of a great wild jungle' },
    // A low dolly across the parade ground, the flagpole sliding past.
    { move: 'dolly', p0: ring(flag, 2.35, 18, 3.2), p1: ring(flag, 1.6, 13.5, 2.4), look: up(flag, 1.6), look1: up(flag, 2.4), dur: 5.5, aperture: 1.1, place: 'upper-left', title: 'Sixty scouts, one summer', sub: 'Exercise at dawn, the flag, lessons, games, and songs round the fire' },
    // From beside the ferry, over the water off its pier side (a = -DOCK.rot points across the hull, away from the pier's
    // length): outside the hull, at deck height and below the cabin roof, a slow push in on you at the top of the gangway.
    // It circles `player.position`, which rides the ferry's deck, so the framing follows the ferry.
    { move: 'push', at: () => player.position, a0: -DOCK.rot + 0.4, a1: -DOCK.rot + 0.25, r: 5.6, r1: 4, h: 1.5, h1: 1.3, lookH: 1.3, fov: 55, fov1: 44, dur: 6, aperture: 1.2, place: 'upper-right', title: 'Your ferry has just come in', sub: 'Welcome to camp, scout' },
  ]; },
  // A low tracking shot along the front row.
  exercise: () => { const p = on({ x: 8.5, z: 17.3 }); return [{ move: 'dolly', p0: ring(p, -0.55, 13, 1.5), p1: ring(p, -1.3, 10.5, 1.9), look: up(p, 1.0), look1: up(p, 1.2), dur: 7, aperture: 1.25, place: 'upper-right', title: 'Morning exercise', sub: 'One, two, three, four!' }]; },
  // A crane up the flagpole from the ranks to the flag.
  ceremony: () => [{ move: 'crane', at: on(FLAGPOLE), a0: 2.3, a1: 2.0, r: 12.5, r1: 10.5, h: 1.1, h1: 4.4, lookH: 2.0, lookH1: 4.6, fov: 50, dur: 7, aperture: 1.1, place: 'upper-left', title: 'Flag ceremony', sub: 'The whole camp stands for the flag' }],
  // A slow push in over the tables.
  lunch: () => [{ move: 'push', at: on({ x: 15, z: 23 }), a0: -0.1, a1: 0.2, r: 15, r1: 10, h: 6, h1: 3.8, lookH: 0.8, fov: 54, fov1: 45, dur: 6, aperture: 1.2, place: 'upper-right', title: 'Lunch', sub: 'Camp stew for everyone' }],
  // Low round the fire at sitting height, shallow focus on the flames.
  campfire: () => [{ at: on(VILLAGE_FIRE), r: 9.5, r1: 7.5, h: 1.7, h1: 2.3, a0: 0.3, a1: 1.35, lookH: 1.0, fov: 48, dur: 8, aperture: 1.4, place: 'upper-left', title: 'Campfire night', sub: 'Songs and stories round the big fire' }],
  // The crane comes down over the sleeping camp.
  sleep: () => [{ move: 'crane', at: on({ x: 10, z: 8 }), a0: 1.25, a1: 1.4, r: 34, r1: 29, h: 21, h1: 12, lookH: 0, lookH1: 1, dur: 6, drift: 0.7, aperture: 0.7, place: 'upper-left', title: 'Lights out', sub: 'Two scouts keep the night watch' }],
  // Rising behind the summit, the jungle beyond the rope.
  summit: () => [{ move: 'crane', at: on(LOOKOUT), r: 15, r1: 13, h: 6.5, h1: 10.5, a0: wildAngle + Math.PI - 0.5, a1: wildAngle + Math.PI + 0.35, lookH: 0.5, lookH1: 0.2, dur: 7, aperture: 0.9, place: 'lower-right', title: 'The summit', sub: 'Beyond the rope lies the wild jungle' }],
  // The cliff lookout: round the front past the waterfall, then over your shoulder to the lake, the river
  // and the village, the focus pulling from you to the view.
  cliff: () => { const look = on(AREAS.lookout), far = { x: look.x + Math.cos(1.5) * 80, y: look.y - 8, z: look.z + Math.sin(1.5) * 80 }; return [
    { move: 'crane', at: look, r: 18, r1: 14, h: 3, h1: 6, a0: 1.05, a1: 1.8, lookH: -2, lookH1: -1, dur: 6, aperture: 0.9, place: 'upper-left', title: 'The cliff lookout', sub: 'The river starts here, at the foot of the falls' },
    { move: 'ots', who: () => player.position, to: far, back: 2.6, back1: 1.9, up: 2.1, up1: 1.9, side: 1, lookH: 0, dur: 6, blend: 1.4, focus: up(() => player.position, 1.4), focus1: far, rack: [0.15, 0.6], aperture: 1.1, place: 'lower-right', title: '', sub: 'The village and the far shore, all the way to the sea' },
  ]; },
  // Over your shoulder up the pole, the focus pulling from your hands to the flag.
  flag: () => { const pole = on(FLAGPOLE); return [{ move: 'ots', who: () => player.position, to: pole, back: 2.3, back1: 1.8, up: 1.5, up1: 1.25, side: 1, sideOff: 0.7, lookH: 3.6, lookH1: 4.8, fov: 50, dur: 4.5, focus: up(() => player.position, 1.3), focus1: up(pole, 5), rack: [0.2, 0.65], aperture: 1.3, place: 'lower-right', title: 'The flag goes up', sub: '' }]; },
  // Pulling back and rising from you as the day ends.
  finale: () => { const a = Math.atan2(player.facing.z, player.facing.x); return [{ at: () => player.position, r: 4, r1: 11, h: 1.6, h1: 6.5, a0: a - 0.2, a1: a + 1.4, lookH: 1.3, lookH1: 0.9, fov: 44, fov1: 54, dur: 7, aperture: 1.2, place: 'upper-left', title: 'A true scout', sub: 'Your first day is done. The island is yours.' }]; },
};
// Plays a little film: the camera leaves you for a few seconds, then comes back.
function film(id, opts = {}) {
  if ((!filmsOn && id !== 'intro') || director.active || player.riding || sleeping || hud.menuOpen) return false;
  if (hud.bagOpen) hud.toggleBag(); if (hud.journalOpen) hud.toggleJournal(); if (hud.mapOpen) hud.toggleMap();
  hud.setCine(true); filmsSeen.add(id);
  if (graphics === 'high') finish.useDepth(true); // depth of field (src/finish.js) reads the scene's depth
  director.play(FILMS[id](), { onShot: (s) => hud.setCaption(s.title, s.sub, placeFor(s), s.dur), onEnd: () => { hud.setCine(false); finish.dof = null; finish.useDepth(false); if (opts.onEnd) opts.onEnd(); } });
  if (id === 'campfire') audio.play('song');
  if (id === 'ceremony' || id === 'flag') audio.play('bugle');
  if (id === 'exercise') audio.play('whistle');
  return true;
}
const idleInput = { move: { x: 0, z: 0 }, run: false, consumeHop: () => false };
const climbLook = new THREE.Vector3(); let hadRideCam = false; // the climbing camera's eased aim

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
  if (hud.menuOpen && hud.menuBack()) return; // Esc leaves the key list first
  if (hud.menuOpen) hud.closeMenu(); else hud.openMenu();
  syncLook();
}
// Tab: open or close the menu (it frees the mouse like the journal and bag). Any other screen that is open just closes.
// Closing runs inside the keydown, a user gesture, so syncLook can take the mouse back at once.
function tabKey() {
  if (hud.menuOpen && hud.menuBack()) return;
  if (hud.menuOpen) { hud.closeMenu(); audio.play('ui'); syncLook(); return; }
  if (hud.bagOpen) return toggleBag();
  if (hud.journalOpen) return toggleJournal();
  if (hud.mapOpen) return toggleMap();
  hud.openMenu(); audio.play('ui'); syncLook();
}
function toggleJournal() { if (hud.started) { hud.toggleJournal(); audio.play('ui'); syncLook(); } }
function toggleMap() { if (hud.started) { hud.toggleMap(); audio.play('ui'); syncLook(); } }

// ---- Free look: the mouse turns the camera with no button held ---------------
// The browser captures the mouse for this, so it is released whenever a menu or the journal
// is open (you need the cursor there) and taken again when you go back to playing.
let freeLook = false;
const mouseHeld = () => document.pointerLockElement === canvas;
const lookWanted = () => freeLook && hud.started && !hud.menuOpen && !hud.journalOpen && !hud.mapOpen && !hud.bagOpen;
let lockRefused = false; // the browser said no to the last request: it wants a click first
let quietRelock = false; // the camera or telescope was left with Esc: the browser wants a gesture, so re-lock on the next key or click with no banner
function updateLookHint() { if (mouseHeld() || !lookWanted()) quietRelock = false; hud.setLookHint(lookWanted() && !mouseHeld() && lockRefused && !quietRelock); }
function syncLook() {
  const want = lookWanted();
  if (want && !mouseHeld()) {
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { lockRefused = true; updateLookHint(); }); } catch { lockRefused = true; /* the browser may refuse; the next click retries */ }
  }
  if (!want && mouseHeld()) document.exitPointerLock();
  if (!want) lockRefused = false;
  updateLookHint();
}
function toggleLook() { freeLook = !freeLook; hud.setLook(freeLook); audio.play('ui'); syncLook(); }
let lockEscAt = -1e9; // when Esc last released the mouse; a keydown for the same press is ignored
let escActedAt = -1e9; // when an Esc keydown last closed a screen or the menu
document.addEventListener('pointerlockchange', () => {
  input.setFreeLook(mouseHeld());
  if (mouseHeld()) { lockRefused = false; updateLookHint(); return; }
  updateLookHint();
  if (!hud.started) return;
  // Esc releases the mouse before the game sees the key, so answer it here: close whatever is open, else pause.
  // (The journal, map and bag release the mouse themselves when they open, so a release with one of them open is not an Esc.)
  if (scope.active) { lockEscAt = performance.now(); quietRelock = true; scope.close(); input.consumeInteract(); return; }
  if (photo.active) { lockEscAt = performance.now(); quietRelock = true; photo.close(); input.consumeInteract(); return; }
  if (storyRt.ui.open) { lockEscAt = performance.now(); storyRt.close(); input.consumeInteract(); return; }
  if (director.active) { lockEscAt = performance.now(); director.skip(); input.consumeHop(); input.consumeInteract(); return; }
  // An Esc keydown that just closed a screen can win the lock back and lose it to the same held key: that is not "pause".
  if (performance.now() - escActedAt < 500) return;
  if (freeLook && !hud.menuOpen && !hud.journalOpen && !hud.mapOpen && !hud.bagOpen) { lockEscAt = performance.now(); hud.openMenu(); }
});
document.addEventListener('pointerlockerror', () => { lockRefused = true; updateLookHint(); });
// Esc is not a user gesture, so closing the menu with it may not be allowed to take the mouse back.
// Try again on the key coming up; if the browser still refuses, the next mouse press takes it, and does nothing else.
// A movement key counts as a gesture, so the first W (etc.) after an Esc exit takes the mouse back.
window.addEventListener('keydown', (e) => { if (quietRelock && /^(Key[WASD]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right))$/.test(e.code) && lookWanted() && !mouseHeld() && !photo.active && !scope.active) syncLook(); }, true);
window.addEventListener('keyup', (e) => { if (e.code === 'Escape' && lookWanted() && !mouseHeld()) syncLook(); });
let swallowClick = false;
const relockPress = (e) => {
  if (!(lockRefused && lookWanted() && !mouseHeld()) || e.button !== 0) return;
  e.preventDefault(); e.stopImmediatePropagation();
  swallowClick = true; syncLook(); // pointerdown is the user gesture that lets the browser grant the lock
};
window.addEventListener('pointerdown', relockPress, true);
window.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopImmediatePropagation(); return; } syncLook(); }, true);
let rewardBump = 9; // seconds since the last find: the camera dips toward the scout for 0.3 s
const hud = createHUD({
  onReward: () => { rewardBump = 0; },
  onResume: () => { hud.closeMenu(); syncLook(); },
  onToggleLook: () => toggleLook(),
  getTime: () => timeOfDay,
  onToggleMenu: toggleMenu,
  onToggleSound: toggleSound,
  onToggleJournal: toggleJournal,
  onToggleMap: toggleMap,
  onToggleBag: toggleBag,
  onStart: (mode) => (mode === 'continue' ? storyRt.continueGame() : storyRt.openPicker(mode)),
  journalPage: (tab) => storyRt.page(tab),
  onToggleGuide: toggleGuide,
  onToggleFilms: () => { filmsOn = !filmsOn; hud.setFilms(filmsOn); audio.play('ui'); },
  onToggleSaver: () => { saver = !saver; hud.setSaver(saver); audio.play('ui'); try { localStorage.setItem('saver', saver ? '1' : '0'); } catch { /* private window */ } },
  onToggleGraphics: () => { setGraphics(graphics === 'high' ? 'low' : 'high'); hud.setGraphics(graphics); audio.play('ui'); try { localStorage.setItem('graphics', graphics); } catch { /* private window */ } },
  onUseItem: (id, plain) => useItem(id, plain),
  onDropItem: (id) => dropItem(id),
  describeItem: (id) => describeItem(id),
  onSetTime: (t) => { timeOfDay = t; },
  onSetWeather: (k) => weather.force(k, timeOfDay * 24),
  onDaySpeed: () => cycleDaySpeed(),
});
// ---- The story: what it may read and change in the game (src/story/runtime.js)
storyRt = createStoryRuntime({
  hud, audio, player, camera, groundAt, bag, vitals, weather, interactables,
  get time() { return timeOfDay; }, set time(v) { timeOfDay = v; },
  get day() { return dayNumber; }, set day(v) { dayNumber = v; },
  give: (id, n) => give(id, n), refreshBag: () => refreshBag(), say, cheer: (n) => vitals.add({ cheer: n }),
  refreshQuest: () => refreshQuest(), refreshJournal: () => hud.refreshJournal(), toggleJournal: () => toggleJournal(), syncLook: () => syncLook(),
  emote: (p, y, kind) => ui.emote(new THREE.Vector3(p.x, y + 0.25, p.z), kind),
  castWhere: () => (areas.find((a) => a.where) || {}).where,
  teleport(x, z, yaw) { if (sleeping) { sleeping = false; player.asleep = null; hud.setSleeping(false); } if (player.sitting) player.stand(); player.act = null; player.position.set(x, groundAt(x, z), z); rig.yaw = yaw; },
  setLook: (l) => player.setLook(l),
  begin: (mode) => begin(mode),
  // Saved: position, day, time, weather, bag, flask, how you feel, the camp journal and the guide switch (the story saves itself).
  snapshot: () => ({ player: { x: player.position.x, z: player.position.z, yaw: rig.yaw }, day: dayNumber, time: timeOfDay, weather: weather.kind, bag: bag.slots.map((b) => ({ id: b.id, count: b.count })), sips,
    vitals: Object.fromEntries(STAT_KEYS.map((k) => [k, Math.round(vitals[k])])), journal: journal.list().filter((d) => d.done).map((d) => d.id), guide: guideOn, restore: serialiseRestore() }),
  restore(doc) {
    // Back where you were, unless that spot has no ground under it now (the ferry's deck only exists on a fresh journey): then camp.
    const at = doc.player && Number.isFinite(doc.player.x) && Number.isFinite(doc.player.z) && groundAt(doc.player.x, doc.player.z) > 0.15 ? doc.player : PLAYER_START;
    player.position.set(at.x, groundAt(at.x, at.z), at.z); rig.yaw = Number(at.yaw) || 0;
    if (Number.isFinite(doc.time)) timeOfDay = ((doc.time % 1) + 1) % 1;
    if (Number.isFinite(doc.day)) dayNumber = Math.max(1, Math.floor(doc.day));
    if (['sun', 'wind', 'rain', 'fog'].includes(doc.weather) && !weather.forced) weather.setKind(doc.weather, timeOfDay * 24, true);
    if (Array.isArray(doc.bag)) { bag.slots.length = 0; for (const b of doc.bag) if (b && ITEMS[b.id]) bag.add(b.id, Math.max(1, Math.min(99, Math.floor(b.count) || 1))); }
    if (Number.isFinite(doc.sips)) sips = Math.max(0, Math.min(FLASK_SIPS, Math.floor(doc.sips)));
    if (doc.vitals) for (const k of STAT_KEYS) if (Number.isFinite(doc.vitals[k])) vitals.set(k, doc.vitals[k]);
    if (Array.isArray(doc.journal)) for (const id of doc.journal) journal.mark(id);
    guideOn = doc.guide !== false;
    if (!bag.count('camera')) bag.add('camera'); // saves from before the camera
    loadRestore(doc.restore); litter.refresh();
    refreshBag(); refreshProgress();
  },
});
hud.setContinue(storyRt.hasSave());
refreshProgress(); refreshQuest(); hud.setFilms(true); hud.setSaver(saver); hud.setGraphics(graphics); hud.setDaySpeed(daySpeed);
// What every scout sets out with.
bag.add('flask'); bag.add('torch'); bag.add('bugle'); bag.add('camera'); bag.add('biscuit', 2); // the camera is on quick-bar key 4
album.load();
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
  storyRt.ensureStarted(); // ?play and ?journey skip the picker: a fresh story with the default look
  audio.start(); hud.begin(); ui.showHint(); ui.hideHintSoon(10);
  // Whatever key started the game should not also hop, mute or use something.
  input.consumeHop(); input.consumeInteract(); input.consumeMute();
  for (const a of areas) if (a.begin) a.begin(mode); // e.g. the harbour moors the ferry for a journey
  if (mode !== 'continue') { resetRestore(); litter.refresh(); album.reset(); } // a new game: litter back, an empty album
  if (mode === 'journey') {
    guideOn = true;
    // At the top of the ferry's gangway, turned toward the island (see ARRIVAL in src/world/areas/harbour.js).
    const at = harbour.ARRIVAL;
    player.position.x = at.x; player.position.z = at.z; player.position.y = groundAt(at.x, at.z);
    rig.yaw = at.yaw; player.gesture('wave', 1.0, at.look);
    if (!params.has('t')) timeOfDay = 0.52;
    const hello = () => { tip('arrive', 'Welcome to the island! Walk down the gangway and follow the trail up to camp: the arrow shows the way.'); tip('move', 'W A S D to walk, press Shift to switch between walking and running. Drag the mouse to look around.'); tip('guide', 'The journey, top right, suggests what to try next. Follow it or ignore it: press G to hide it.'); };
    if (opts.skipIntro) hello(); else film('intro', { onEnd: hello });
  } else if (mode === 'free') { guideOn = false; tip('free', 'No guide this time. Press G if you would like the quest guide after all.'); }
  if (mode !== 'continue') tip('talk', 'People with something to say show a little note over their head. Walk up and press E to talk; answer with 1-4.');
  refreshQuest();
}
const wake = () => begin('free');
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Escape' && performance.now() - lockEscAt < 200) return; // the same press already acted on the lock release
  // A conversation or the name picker takes the keys while it is open (1-4 answer, Esc leaves).
  if (storyRt.key(e)) { if (/^(Digit|Numpad)\d$|^Escape$|^Space$|^Tab$/.test(e.code) && !(e.target && e.target.tagName === 'INPUT')) e.preventDefault(); return; }
  if (!hud.started) { storyRt.titleKey(e); return; }
  if (scope.active) { if (e.code === 'Escape' || e.code === 'KeyE') { if (e.code === 'Escape') quietRelock = true; scope.close(); input.consumeInteract(); } return; } // the telescope has the keys
  if (photo.active) { if (e.code === 'Escape' || e.code === 'KeyE' || (/^Digit[1-8]$/.test(e.code) && beltOf(bag.slots)[Number(e.code.slice(5)) - 1]?.id === 'camera')) { if (e.code === 'Escape') quietRelock = true; photo.close(); input.consumeInteract(); } else if (e.code === 'Space' && !e.repeat) photo.shoot(); e.preventDefault(); return; } // the camera has the keys
  if (e.code === 'Tab') e.preventDefault(); // focus never moves, even on a held key
  if (e.repeat) return;
  // During a film any of these keys skips it; nothing else works until it is over.
  if (director.active) { if (['Space', 'Enter', 'Escape', 'KeyE'].includes(e.code)) { director.skip(); input.consumeHop(); input.consumeInteract(); } return; }
  if (e.code === 'KeyG' && !hud.menuOpen) toggleGuide();
  if (e.code === 'KeyT') cycleDaySpeed();
  if (e.code === 'Tab') { e.preventDefault(); tabKey(); return; }
  if (hud.menuOpen && hud.menuKey(e)) { e.preventDefault(); input.consumeHop(); input.consumeInteract(); return; }
  if (e.code === 'KeyJ') { e.preventDefault(); if (!hud.menuOpen) toggleJournal(); }
  if (e.code === 'KeyM' && !hud.menuOpen) toggleMap();
  if (e.code === 'KeyC' && !hud.menuOpen) toggleLook();
  if (e.code === 'KeyB' && !hud.menuOpen) toggleBag();
  if (/^Digit[1-8]$/.test(e.code) && !hud.menuOpen) { const s = beltOf(bag.slots)[Number(e.code.slice(5)) - 1]; if (s) useItem(s.id); } // the quick bar (src/logic/belt.js)
  // Esc closes the pause menu, else the bag, journal or map, else opens the pause menu.
  if (e.code === 'Escape') {
    escActedAt = performance.now();
    if (hud.menuOpen) toggleMenu();
    else if (hud.bagOpen) toggleBag();
    else if (hud.journalOpen) toggleJournal();
    else if (hud.mapOpen) toggleMap();
    else toggleMenu();
  }
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
if (params.has('torch')) { torchOn = true; player.setTorch(true); } // debug: torch on from the start
if (params.has('ride')) zipline.interactables[0].interact();
// Story debug aids: ?picker opens the name and look picker; ?talk=buddy (leader, younger, board) opens that conversation.
if (params.has('picker')) storyRt.openPicker('journey');
if (params.has('talk')) later(0.5, () => { const who = params.get('talk'), t = interactables.find((x) => x.id === `cast-${who}` || x.thing === who || (who === 'leader' && x.id === 'staff-0')); if (t) { player.position.set(t.position.x + 1.6, groundAt(t.position.x + 1.6, t.position.z), t.position.z); storyRt.tryTalk(t); } });
if (params.has('found')) ['flag', 'bell', 'cat', 'place-beach', 'tree'].slice(0, Number(params.get('found')) || 5).forEach(discover);
// Leaving the window pauses the game, so nothing happens while you are away.
window.addEventListener('blur', () => { if (hud.started && !hud.menuOpen) toggleMenu(); });

let heldFrames = 0;
function onResize() {
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  heldFrames = 0; // a resized canvas is blank: draw it again even while the menu holds the picture
}
window.addEventListener('resize', onResize);
// Moving between a Retina and a normal display changes the pixel ratio without a resize.
let lastRatio = window.devicePixelRatio;
setInterval(() => { if (window.devicePixelRatio !== lastRatio) { lastRatio = window.devicePixelRatio; buildLadder(); applyRung(); onResize(); } }, 1000);

const stats = { frames: 0, total: 0, worst: 0 };
let lastBlock = null;

// ---- Keeping it smooth: a ladder of settings, sharpest first: the pixel ratio from the cap down to 1 in
// quarter steps (2, 1.75, 1.5, 1.25, 1 on a Retina screen at High), then, on High, the glow off. Frames
// that take too long step down a rung; a long run of quick ones steps back up. A rung that proved too slow
// waits twice as long each time before it is tried again, so the picture does not keep flipping.
let ladder = [], rung = 0, ratio = 1, slow = 0, quick = 0;
const failed = new Map(); // rung -> how many times it was too slow
function buildLadder() {
  const cap = perfFlags.dpr || Math.min(window.devicePixelRatio, RATIO_CAP[graphics]), high = graphics === 'high';
  ladder = [{ ratio: cap, bloom: high }];
  for (let r = Math.floor((cap - 0.001) * 4) / 4; r >= 1; r -= 0.25) ladder.push({ ratio: r, bloom: high });
  if (high) ladder.push({ ratio: ladder[ladder.length - 1].ratio, bloom: false });
  rung = 0; failed.clear();
}
function applyRung() {
  const r = ladder[rung]; finish.bloom = r.bloom && !perfFlags.noBloom; slow = 0; quick = 0;
  if (r.ratio !== ratio) { ratio = r.ratio; renderer.setPixelRatio(ratio); }
}
buildLadder(); applyRung();
function setGraphics(g) { graphics = g; buildLadder(); applyRung(); applyQuality(); }
// Graphics Low, light enough for an integrated GPU: a 2048 sun map (4096 on High), the bonfire's cube at 512,
// no lamp or torch shadows, half the burst particles, water detail drawn half as far out. (High: unchanged.)
function applyQuality() {
  const low = graphics === 'low';
  setShadowSize(sky.sunLight.shadow, low ? 2048 : 4096); sky.sunLight.shadow.normalBias = low ? 0.03 : 0.018; // about one texel either way
  torch.castShadow = !low && !perfFlags.noShadow.has('torch');
  props.setQuality(low); particles.setQuality(low);
  if (island.water.userData.setDetail) island.water.userData.setDetail(low ? 0.5 : 1);
}
applyQuality();
// First visit only (no saved Graphics choice, none forced by the URL, not measuring): time the first seconds of
// play, and on a slow machine (median under about 45 fps) switch to Graphics Low once and say so (src/perf.js).
const autoGraphics = createAutoGraphics({
  enabled: !params.has('graphics') && !perfFlags.noLadder,
  onSlow: () => {
    if (graphics === 'low') return;
    setGraphics('low'); hud.setGraphics('low');
    try { localStorage.setItem('graphics', 'low'); } catch { /* private window */ }
    hud.tip('Switched to Graphics Low for smoother play. Change it in Settings (Tab).');
  },
});
function tuneResolution(raw) {
  if (raw > 0.25 || perfFlags.noLadder) return; // a hitch from switching tabs, not a slow machine (or measuring: ?dpr, ?nolimit)
  const want = 1 / frameRate(); // judged against the rate we are aiming for, not a fixed 60
  slow = raw > want * 1.25 ? slow + raw : Math.max(0, slow - raw * 2);
  quick = raw < want * 1.04 ? quick + raw : 0;
  if (slow > 1.2 && rung < ladder.length - 1) { failed.set(rung, (failed.get(rung) || 0) + 1); rung++; applyRung(); }
  else if (rung > 0 && quick > 8 * 2 ** Math.min(4, failed.get(rung - 1) || 0)) { rung--; applyRung(); }
}
let last = performance.now();

function step() {
  const now = performance.now();
  const raw = (now - last) / 1000;
  last = now;
  frameTimer.beginFrame();
  stats.frames++; stats.total += raw; stats.worst = Math.max(stats.worst, raw);
  if (hud.started && !hud.menuOpen) { tuneResolution(raw); autoGraphics.tick(raw, !director.active && !hud.journalOpen && !hud.mapOpen && !hud.bagOpen); }
  const previewing = !hud.started && storyRt.previewing; // the name and look picker: the world carries on behind it
  const paused = (!hud.started && !previewing) || hud.menuOpen;
  // While paused the world stands still; only the picture keeps refreshing.
  const dt = paused ? 0 : clampDt(raw);
  elapsed += dt;

  const talking = storyRt.talking || previewing; // a conversation, a wait or the picker: game time stands still, you stand still
  if (!freezeTime && !talking) {
    const before = timeOfDay;
    timeOfDay = advance(timeOfDay, dt * (sleeping ? 45 : daySpeed));
    // Morning: time to get up. Pressing a movement key gets you up early.
    if (sleeping && ((before < 0.105 && timeOfDay >= 0.105) || input.move.x !== 0 || input.move.z !== 0)) wakeUp();
    if (timeOfDay < before && dt > 0) { dayNumber++; storyRt.newDay(dayNumber); }
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
    if (!first && hud.started) { tip('timetable', 'The camp follows a timetable. Press F to join in with whatever is going on.'); if (JOIN[block.id] && block.id !== 'free' && block.id !== 'work') later(2.5, () => say(`${block.label} has started. Press F when you are at the spot to join in.`, '📣')); }
    if (!first && hud.started) { hud.announce(block.note, block.label); audio.play(block.id === 'ceremony' || block.id === 'exercise' ? 'whistle' : 'bell'); }
  }
  crowd.tick(block, blockProgress(block, timeOfDay));
  const filming = director.active;
  if (filming) { input.consumeInteract(); input.consumeJoin(); input.consumeSit(); input.consumeLook(); input.consumeZoom(); }
  if (night > 0.5 && !paused) tip('torch', `It is getting dark. Press ${keyOf(bag.slots, 'torch')} to switch on your torch.`);
  setSleepy(night);
  // The scout's face shows how they are doing.
  player.mood = params.get('mood') || (vitals.hungry || vitals.thirsty ? 'sad' : vitals.winded ? 'effort' : vitals.cheer >= 85 ? 'happy' : null); // ?mood= is a debug aid
  { const vp = scope.active ? scope.viewer() : photo.active ? photo.viewer() : camera.position; setViewer(vp.x, vp.z, player.position.x, player.position.z); } // detail is judged from the camera (through a telescope, from where it looks), so the films look right
  audio.setFire(paused ? 0 : props.fireLoudness(player.position.x, player.position.z));

  // F joins in with whatever the camp is doing right now.
  const join = JOIN[block.id] && (player.act || nearJoinSpot(block.id, player.position.x, player.position.z)) ? JOIN[block.id] : null; // only near the activity (or while already joined: then moving away stops it)
  if (!paused && input.consumeJoin() && join && !player.riding && !player.asleep && !player.sitting) {
    player.act = player.act ? null : { pose: join.pose, sit: !!join.sit };
    if (player.act) { audio.play('ui'); discover('join'); if (FILMS[block.id] && !filmsSeen.has(block.id)) film(block.id); } // the camp's film plays only when you choose to join in
  }
  // The key list bottom-right: only what is useful right now, the main action first.
  hintList.length = 0;
  if (hintTarget) hintList.push(['E', hintTarget, true]);
  if ((vitals.hungry || vitals.thirsty) && !player.asleep && !player.riding) hintList.push(['B', vitals.hungry ? 'eat something' : 'have a drink', false]);
  if (player.asleep) hintList.push(['W A S D', 'get up', true]);
  else if (player.riding) hintList.push(['', player.riding.hint || 'hold on tight!', true]);
  else {
    if (join) hintList.push(['F', player.act ? `${join.verb} (move to stop)` : join.verb, false]);
    hintList.push(['X', player.sitting ? 'stand up' : 'sit down', false]);
    hintList.push(['W A S D', 'move', false], ['Shift', 'walk / run', false], ['Space', 'hop', false]); // the HUD hides each once it has been used a few times
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
    const colliders = openStatic.concat(pickups.colliders, wilds.colliders, areaColliders(), buildings.colliders(), villagers.colliders(), activities.colliders(), campLife.colliders(), wildlife.colliders(), campProps.colliders, scatter.colliders, react.colliders, litter.colliders, play.colliders);
    zipline.update(dt, elapsed, player);
    // Being walked back out of the jungle, nothing may snag you: trees are ignored for those few seconds.
    player.update(dt, (filming || talking || scope.active || photo.active) && !player.auto ? idleInput : input, rig.yaw, player.auto ? openStatic : colliders, elapsed);
    buildings.update(dt, elapsed, player);
    villagers.update(dt, elapsed, player);
    activities.update(dt, elapsed);
    campLife.update(dt, elapsed);
    animals.update(dt, elapsed, player, night);
    wildlife.update(dt, elapsed, player, night);
    pond.update(dt, elapsed, night, player.position);
    pickups.update(dt, player.position);
    litter.update(dt, elapsed);
    wilds.update(elapsed, night, player.position);
    for (const a of areas) if (a.update) a.update(dt, elapsed, player, night);
    play.update(dt, elapsed);
    if (!sleeping && !talking) feel(dt);
    storyRt.update(dt);
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
  // At sunrise and sunset in clear weather the haze thins, so the horizon reads crisp (fog and rain keep theirs).
  const crisp = 1 - 0.6 * goldenHour(timeOfDay) * Math.max(0, 1 - weather.fog * 2 - weather.rain * 2);
  scene.fog.density = sky.fogDensity * (1 + wn * 1.6) * crisp;
  audio.setRain(weather.rain, !!buildings.inside);
  audio.setSea(Math.min(1, Math.max(0, (shoreR(player.position.x, player.position.z) - 34) / 22)));
  ambience.update(dt, { player, camera, timeOfDay, night, weather, inside: !!buildings.inside, paused });
  hud.setStats(vitals);
  // The torch shines from the hand, a step ahead.
  torch.position.set(player.position.x + player.facing.x * 0.38 - player.facing.z * 0.17, player.position.y + 0.82, player.position.z + player.facing.z * 0.38 + player.facing.x * 0.17);
  // The beam follows the hand a moment late and bobs a little with each step.
  const bob = Math.sin(elapsed * 9) * 0.25 * Math.min(1, player.speed / 2);
  torchAim.set(player.position.x + player.facing.x * 9, player.position.y - 0.6 + bob, player.position.z + player.facing.z * 11);
  torch.target.position.lerp(torchAim, 1 - Math.exp(-clampDt(raw) * 9));
  const torchLit = torchOn && !player.asleep ? 1 : 0;
  torch.intensity += (torchLit * (2.2 + night * 7.5) - torch.intensity) * 0.25;
  const torchShade = torch.intensity > 0.05 && (torchLit > 0 || torch.intensity > 0.3);
  props.setTorchZone(torchShade, player.position.x, player.position.z);
  if (torchShade && (!saver || (++torchFrame & 1))) torch.shadow.needsUpdate = true; // saver: every other picture

  // What would E do right now?
  playerXZ.x = player.position.x; playerXZ.z = player.position.z;
  const pressed = input.consumeInteract();
  const target = paused || filming || talking || scope.active || photo.active || player.sitting || player.riding || player.asleep ? null : pickInteractable(playerXZ, player.facing, interactables);
  const said = target ? storyRt.prompt(target) || target.prompt() : '';
  hintTarget = target ? said.split(' — ').slice(1).join(' — ') : null;
  player.focus = target ? target.position : null;
  if (target && target.kind === 'pickup') tip('pickup', 'Press E to pick things up. They go in your backpack: press B to look inside.');
  if (target) {
    ui.setPrompt(said);
    ui.setMarker(target.position.x, target.markerY, target.position.z, target.kind);
    if (pressed && storyRt.tryTalk(target)) { /* a conversation opened (src/story/runtime.js) */ }
    else if (pressed) {
      if (target.kind === 'flag' && !filmsSeen.has('flag') && target.prompt().includes('raise')) later(0.3, () => film('flag'));
      const g = target.kind === 'villager' ? GREETINGS[greetings++ % GREETINGS.length] : GESTURES[target.kind];
      if (g) player.gesture(g[0], g[1], target.position);
      target.interact();
      play.noticed(target.kind);
      if (target.kind === 'villager') {
        const who = target.speaker || 'Scout', lines = target.lines || (Math.random() < 0.5 && STAFF_CHATTER[who] ? STAFF_CHATTER[who] : CHATTER[block.id] || CHATTER.free);
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
    // The river is too deep to wade: say so the first time you come down to its bank.
    if (!tipsSeen.has('river')) for (const p of AREAS.river) if (Math.hypot(playerXZ.x - p.x, playerXZ.z - p.z) < p.w + 3) { tip('river', 'The river is too deep to wade. Cross by the plank bridge, or by the stepping stones up near the lake.'); break; }
    if (Math.hypot(playerXZ.x - AREAS.cliffPath[0].x, playerXZ.z - AREAS.cliffPath[0].z) < 4) tip('cliffpath', 'The cliff path climbs to a lookout beside the waterfall. Take it slowly.');
    if (journal.has('place-lookout')) { tip('fox', 'The flying fox starts here: climb the launch tower and press E.'); }
  }
  const ground = SURFACES[player.riding ? 'wood' : player.surface] || SURFACES.grass;
  hud.setGround(player.riding ? player.riding.label || 'Flying fox' : ground.label, ground.color);
  hud.setClock(clockText(timeOfDay), phaseLabel(phaseAt(timeOfDay)), night > 0.5, dayNumber);
  hud.setWeather(weather.kind, weather.kind === 'sun' && night > 0.5 ? 'Clear' : weather.label);
  hud.setSteps(stepCount);
  hud.drawMap(playerXZ, player.facing, villagers.villagers.map((v) => v.position));
  if (speech) {
    if (performance.now() > speech.until) speech = null;
    else { speechPos.set(speech.x, speech.y, speech.z).project(camera); hud.placeBubble((speechPos.x * 0.5 + 0.5) * window.innerWidth, (-speechPos.y * 0.5 + 0.5) * window.innerHeight, speechPos.z < 1); }
  }

  // The journey's next place, marked on the picture (pinned to the edge when it is out of view).
  const goal = guideOn && !filming && !paused && !talking && storyRt.goal();
  if (goal && Math.hypot(goal.x - playerXZ.x, goal.z - playerXZ.z) > 5) {
    wayPos.set(goal.x, groundAt(goal.x, goal.z) + 2.2, goal.z).project(camera);
    let sx = wayPos.x, sy = wayPos.y; const behind = wayPos.z > 1;
    if (behind) { sx = -sx; sy = -sy; }
    const off = behind || Math.abs(sx) > 0.9 || Math.abs(sy) > 0.8;
    if (off) { const k = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.8, behind ? 1e3 : 1); sx /= k; sy /= k; if (behind) { const m = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.8) || 1; sx /= m; sy /= m; } }
    hud.setWaypoint((sx * 0.5 + 0.5) * window.innerWidth, (-sy * 0.5 + 0.5) * window.innerHeight, Math.hypot(goal.x - playerXZ.x, goal.z - playerXZ.z), off);
  } else hud.setWaypoint(null);

  const rideCam = player.riding && player.riding.cam; // a climb that brings its own camera (src/world/areas/lifeguard.js)
  if (!director.update(clampDt(raw)) && !scope.update(clampDt(raw)) && !photo.update(clampDt(raw)) && !storyRt.cameraStep(clampDt(raw))) {
    if (rideCam) { if (!hadRideCam) climbLook.copy(rideCam.look); camera.position.lerp(rideCam.pos, 1 - Math.exp(-clampDt(raw) * 4)); climbLook.lerp(rideCam.look, 1 - Math.exp(-clampDt(raw) * 8)); camera.lookAt(climbLook); }
    else { if (hadRideCam) storyRt.blendFrom(); rig.update(paused ? clampDt(raw) : dt, player.position, input, allStatic, { inside: !!buildings.inside, speed: player.riding ? player.riding.camSpeed ?? 8 : player.speed * 1.4 }); storyRt.cameraAfter(clampDt(raw)); }
  }
  hadRideCam = !!rideCam;
  if (rewardBump < 0.3 && !photo.active) { rewardBump += clampDt(raw); camera.translateZ(-Math.sin(Math.min(1, rewardBump / 0.3) * Math.PI) * 0.05); } // find: a 5 cm nudge in and back
  weather.update(dt, timeOfDay, camera, player.position, night);
  sky.update(timeOfDay, elapsed, player.position, weather);
  weather.setMistColor(sky.fogColor);
  island.update(elapsed);
  island.setLight(sky.waterLight, sky.fogColor, scene.fog.density, sky.sunLight, weather.rain, sunFx.trueDir, goldenHour(timeOfDay) * sunFx.clearness(weather));
  village.update(elapsed);
  village.setNight(night);
  buildings.setNight(night, timeOfDay);
  scatter.update(elapsed, player.position);
  props.update(dt, elapsed, night);
  effects.update(dt);
  particles.update(dt, night);
  react.update(dt, elapsed);
  ui.update(dt, elapsed);

  // Every shadow a moving person casts is redrawn every picture, so it moves in lockstep with them: the
  // sun's (or moon's) map here, the fire's and the nearest lamp's cubes when src/world/props.js asks.
  sky.sunLight.shadow.autoUpdate = false;
  sky.sunLight.shadow.needsUpdate = true;
  renderer.shadowMap.needsUpdate = true;
  contact.update(camera);
  renderer.info.reset();
  finish.dof = director.active ? (graphics === 'high' ? director.focus : null) : photo.active ? photo.dof : null; // depth of field in films (High) and through the camera (High and Low)
  finish.lite = graphics !== 'high'; // Low still draws through the finishing pass while the camera is up: no glow, a cheaper blur
  finish.keepDepth(graphics === 'high'); // the sun's shafts and glare read the scene's depth
  finish.sun = sunFx.update(clampDt(raw), camera, timeOfDay, weather, graphics === 'high', photo.active ? 1.5 : 1);
  if (perfFlags.noSunFx) finish.sun = null;
  frameTimer.beginRender();
  if (graphics === 'high' || photo.active) finish.render(scene, camera); else renderer.render(scene, camera);
  frameTimer.endRender();
  photo.afterRender(); // a photo just taken: this frame becomes its thumbnail
  // Averaged over two pictures, to steady the readout.
  drawn.calls = (drawn.lastCalls + renderer.info.render.calls) / 2; drawn.tris = (drawn.lastTris + renderer.info.render.triangles) / 2;
  drawn.lastCalls = renderer.info.render.calls; drawn.lastTris = renderer.info.render.triangles;
}
const drawn = { calls: 0, tris: 0, lastCalls: 0, lastTris: 0 };
// ---- Not working harder than needed: a fast screen would otherwise have every refresh drawn.
// Smooth is 60 pictures a second, saver 30; the title turns at 30 and the pause menu barely ticks over.
function frameRate() { return !hud.started || saver ? 30 : 60; }
let lastDraw = 0;
// The pause menu stops the loop's heavy work: a couple of frames settle the picture under it, then the canvas
// just keeps its last frame (only the HUD stays live). Resuming resets the clock so dt does not jump.
let wasHeld = false;
function frame(now) {
  requestAnimationFrame(frame);
  if (hud.started && hud.menuOpen) {
    if (heldFrames >= 2) { wasHeld = true; return; }
    heldFrames++;
  } else { heldFrames = 0; if (wasHeld) { wasHeld = false; last = performance.now(); lastDraw = now; } }
  // The 3 ms of slack lets a 60 Hz screen draw on every refresh, not every other one.
  if (!noLimit && now - lastDraw < 1000 / frameRate() - 3) return;
  lastDraw = now;
  step();
  if (loadMs === null) reportLoad();
}
// Load time: page start to the first drawn frame (the title screen). Logged, shown in the ?dbg title, and the
// "Building the island…" text in index.html is removed.
let loadMs = null;
function reportLoad() {
  loadMs = Math.round(performance.now());
  console.info(`[scout-camp-island] first frame after ${(loadMs / 1000).toFixed(1)} s`);
  const boot = document.getElementById('boot'); if (boot) boot.remove();
}
// Debug aid for screenshots: ?settle runs a few seconds of game time before the first picture.
if (params.has('settle')) for (let i = 0, n = (Number(params.get('settle')) || 3.5) / 0.05; i < n; i++) { last = performance.now() - 50; step(); }
requestAnimationFrame(frame);

// Handles for automated checks in the browser.
window.__game = {
  wilds, areas, player, rig, input, stats, photo, album, litter, particles, openCamera, vitals, story: storyRt, director, film, begin, bag, give, useItem, pickups, scene, camera, renderer, audio, interactables, villagers, props, hud, journal, buildings, zipline,
  get timeOfDay() { return timeOfDay; }, set timeOfDay(v) { timeOfDay = v; }, weather, finish, contact,
  get graphics() { return graphics; }, set graphics(g) { setGraphics(g); }, get rung() { return ladder[rung]; },
};
if (params.has('dbg')) setInterval(() => { document.title = JSON.stringify({ loadMs, calls: Math.round(drawn.calls), tris: Math.round(drawn.tris), ratio, graphics, bloom: graphics === 'high' && finish.bloom, upd: +frameTimer.out.upd.toFixed(2), rend: +frameTimer.out.rend.toFixed(2) }); }, 300);
