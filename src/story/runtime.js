// INTERNAL. Glue between the story engine and the game: who you are talking to, the conversation camera, game time
// paused while a conversation is open, waiting or sleeping until a gate opens, the soft failure, the quest card and
// waypoint, the new-game picker, and autosave. main.js creates it once and calls a handful of functions from its loop.
import * as THREE from 'three';
import { createStory } from './engine.js';
import { CONTENT } from './content.js';
import { LINKS } from './characters.js';
import { isLowTide, isNight, nextOpening, GATE_TEXT, lowTidesOn } from './gates.js';
import { writeSave, readSave, hasSave, sessionOnly } from './save.js';
import { createStoryUI, journalPage, DEFAULT_LOOK } from './ui.js';
import { clockText } from '../logic/journal.js';
import { YOUR_TENT } from '../logic/journey.js';

const AUTOSAVE_EVERY = 180; // seconds of play
const smooth = (k, dt) => 1 - Math.exp(-dt * k);

// io: what the game lets the story read and change (see main.js).
export function createStoryRuntime(io) {
  const { hud, audio, player, camera, groundAt } = io;
  const story = createStory(CONTENT, {
    world: () => { const t = io.time, d = io.day; return { night: isNight(t), lowTide: isLowTide(d, t), clear: io.weather.kind === 'sun' || io.weather.kind === 'wind', weather: io.weather.kind }; },
    count: (id) => io.bag.count(id),
    give: (id, n) => io.give(id, n),
    take: (id, n) => { io.bag.remove(id, n); io.refreshBag(); },
    wait: (gate) => { pendingWait = gate; },
    vars: () => ({ tide: lowTidesOn(io.day).map(clockText).join(' and ') }),
  });
  let pendingWait = null, talkTarget = null, busy = false, dirty = false, saveIn = AUTOSAVE_EVERY, started = false, saveSoon = -1;
  const ui = createStoryUI({ onChoose: (k) => choose(k), onLeave: () => close() });

  // ---- What the story tells the player -------------------------------------------------------------------
  story.on((kind, d) => {
    if (['quest', 'step', 'note', 'badge', 'gear', 'chapter', 'close', 'puzzle'].includes(kind)) { dirty = true; saveSoon = 1.5; }
    if (!started) return;
    if (kind === 'quest' && d.done && !d.quest.side) { hud.rankUp(d.quest.title, `Chapter ${d.quest.chapter} complete`); audio.play('rank'); }
    else if (kind === 'quest' && d.started) { io.say(`New quest: ${d.quest.title}`, '📜'); audio.play('discover'); }
    else if (kind === 'quest' && d.stage) io.say(d.stage.text.split('. ')[0].replace(/\.$/, ''), '🧭');
    else if (kind === 'step') { io.say(`${d.step.title}: done`, '✅'); io.cheer(4); }
    else if (kind === 'note') { hud.reward({ kind: 'note', title: d.title, sub: 'Added to your notes', pic: '📝' }); audio.play('discover'); }
    else if (kind === 'badge') { hud.rankUp(d.name, 'Badge earned'); hud.reward({ kind: 'badge', title: d.name, sub: 'Badge earned', pic: d.icon }); audio.play('rank'); }
    else if (kind === 'gear') io.say(`New gear: ${d.name}`, d.icon);
    else if (kind === 'guide') { hud.reward({ kind: 'guide', title: d.name, sub: 'Added to your field guide', pic: d.icon }); audio.play('discover'); }
    else if (kind === 'puzzle') audio.play('discover');
    io.refreshQuest(); io.refreshJournal();
  });

  // ---- Talking ------------------------------------------------------------------------------------------
  const characterOf = (t) => (t.thing ? t.thing : LINKS[t.id] || null);
  function canTalk(t) { const who = characterOf(t); return who && CONTENT.dialogue[who] && story.hasNew(who) ? who : null; }
  // "E — talk to Bayu" when they have something new; null keeps the thing's own prompt.
  function prompt(t) { const who = canTalk(t); return who && !t.thing ? `E — talk to ${CONTENT.characters[who].name}` : null; }
  // E pressed on something. True when the story took it (a conversation opened, or a polite "asleep").
  function tryTalk(t) {
    const who = canTalk(t);
    if (!who) return false;
    if (t.asleep) { io.say(`${CONTENT.characters[who].name} is fast asleep. Talk in the morning.`, '💤'); return true; }
    const view = story.start(who);
    if (!view) return false;
    talkTarget = t;
    if (t.hold) t.hold(true);
    player.gesture(t.thing ? 'peer' : 'wave', 0.9, t.position);
    shot.active = true; shot.k = 0; shot.from.copy(camera.position);
    ui.show(view, CONTENT.characters[who]); audio.play('ui');
    io.syncLook();
    return true;
  }
  function choose(k) {
    const v = story.choose(k);
    audio.play('click');
    if (v) ui.show(v, CONTENT.characters[v.speaker] || CONTENT.characters[story.conversation.who]);
    else finish();
  }
  function close() { if (story.talking) story.end(); finish(); }
  function finish() {
    ui.hide();
    if (talkTarget && talkTarget.hold) talkTarget.hold(false);
    talkTarget = null; shot.active = false; shot.out = 0.6;
    io.refreshQuest(); io.refreshJournal(); io.syncLook();
    if (pendingWait) { const g = pendingWait; pendingWait = null; waitFor(g); }
  }

  // ---- The two-shot: the camera eases to the side of you and the person, both in view ----------------------
  const shot = { active: false, k: 0, out: 0, from: new THREE.Vector3(), pos: new THREE.Vector3(), look: new THREE.Vector3(), lookNow: new THREE.Vector3(), q: new THREE.Quaternion(), side: 1 };
  const tmp = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), m4 = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  // Returns true while it is in charge of the camera.
  function cameraStep(dt) {
    // The picker: a close, front-on view of your scout on the left of the screen (the panel is on the right).
    if (ui.picking) {
      const P = player.position, fx = player.facing.x, fz = player.facing.z, rx = fz, rz = -fx;
      shot.pos.set(P.x + fx * 2.7 + rx * 0.8, P.y + 1.15, P.z + fz * 2.7 + rz * 0.8);
      shot.look.set(P.x + rx * 0.8, P.y + 0.72, P.z + rz * 0.8);
      if (shot.k !== -1) { shot.k = -1; shot.lookNow.copy(shot.look); }
      camera.position.lerp(shot.pos, smooth(3, dt));
      shot.lookNow.lerp(shot.look, smooth(4, dt));
      camera.lookAt(shot.lookNow);
      return true;
    }
    if (!shot.active || !talkTarget) return false;
    const P = player.position, N = talkTarget.position;
    const nx = N.x, nz = N.z, dx = nx - P.x, dz = nz - P.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    const mx = (P.x + nx) / 2, mz = (P.z + nz) / 2, gy = Math.max(groundAt(mx, mz), P.y - 0.3);
    if (shot.k === 0) { const cx = camera.position.x - mx, cz = camera.position.z - mz; shot.side = cx * -uz + cz * ux >= 0 ? 1 : -1; shot.lookNow.set(mx, gy + 1.0, mz); }
    const far = 2.6 + d * 0.9;
    shot.pos.set(mx - uz * shot.side * far - ux * 0.5, gy + 1.55, mz + ux * shot.side * far - uz * 0.5);
    if (shot.pos.y < groundAt(shot.pos.x, shot.pos.z) + 0.6) shot.pos.y = groundAt(shot.pos.x, shot.pos.z) + 0.6;
    shot.look.set(mx, gy + 1.0, mz);
    shot.k = Math.min(1, shot.k + dt);
    camera.position.lerp(shot.pos, smooth(4, dt));
    shot.lookNow.lerp(shot.look, smooth(5, dt));
    camera.lookAt(shot.lookNow);
    shot.q.copy(camera.quaternion);
    return true;
  }
  // After the follow camera has placed itself, blend from where the two-shot left off, so nothing snaps.
  function cameraAfter(dt) {
    if (shot.out <= 0) return;
    shot.out = Math.max(0, shot.out - dt);
    const k = shot.out / 0.6;
    tmp.copy(camera.position); camera.position.lerpVectors(tmp, shot.pos, k * k);
    tmpQ.copy(camera.quaternion); camera.quaternion.copy(tmpQ).slerp(shot.q, k * k);
    void m4; void up;
  }

  // ---- Waiting and sleeping until a gate opens; the soft failure ------------------------------------------
  function skip(big, sub, apply) {
    busy = true; ui.veil(big, sub);
    setTimeout(() => { apply(); setTimeout(() => { ui.unveil(); busy = false; io.refreshQuest(); io.refreshJournal(); }, 500); }, 1700);
  }
  function setClock(day, t) {
    const from = io.day;
    io.time = t;
    if (day > from) { io.day = day; story.newDay(day); }
  }
  function waitFor(gate) {
    if (busy || story.talking) return;
    if (hud.journalOpen) io.toggleJournal();
    const stormy = story.check('stage:ch1.night');
    const nx = nextOpening(gate, io.day, io.time, io.weather.kind);
    if (!nx && gate !== 'morning') { io.say(`It is ${GATE_TEXT[gate].when.replace(/^(at|in|after) /, '')} now.`, '🧭'); return; }
    const words = { night: ['Waiting for nightfall…', 'You sit and watch the sky change colour.'], lowtide: ['Waiting for low tide…', 'The sea slowly pulls back from the rocks.'], clear: ['Waiting for the weather to clear…', 'You shelter until the sky brightens.'], morning: ['Z z z', stormy ? 'Thunder rumbles all night long. You sleep through it, snug in the tent.' : 'You sleep until morning.'] }[gate];
    if (gate === 'morning' && stormy) { io.weather.setKind('rain', io.time * 24, true); if (io.weather.strike) io.weather.strike(0.6, 0.8); }
    skip(words[0], words[1], () => {
      if (gate === 'clear') { io.weather.setKind('sun', io.time * 24, false); }
      if (nx) setClock(nx.day, nx.t);
      if (gate === 'morning') { io.vitals.set('energy', 100); io.vitals.add({ food: -14, water: -14, cheer: 10 }); event('woke'); }
    });
  }
  // Lying down in your bed: during the storm night the rain comes in.
  function onSleep() { if (story.check('stage:ch1.night')) { io.weather.setKind('rain', io.time * 24, true); if (io.weather.strike) io.weather.strike(1.5, 0.7); } }
  function onWake() { if (io.weather.kind === 'rain' && story.check('flag:stormNight')) io.weather.setKind('sun', io.time * 24, false); }
  let failCheck = 0;
  // Out of energy, food and water, or stuck: someone helps you back, and you wake at camp the next morning.
  function softFail(reason = 'tired') {
    if (busy) return;
    if (hud.journalOpen) io.toggleJournal();
    if (story.talking) close();
    const why = reason === 'help' ? 'You blew your whistle three times. Bayu and Chief Sari came to fetch you.' : 'You were worn out, hungry and thirsty. Bayu found you and helped you back to camp.';
    skip('Back at camp', why, () => {
      io.teleport(YOUR_TENT.x, YOUR_TENT.z, YOUR_TENT.rot + Math.PI);
      setClock(io.day + 1, 0.26);
      io.vitals.set('food', 65); io.vitals.set('water', 65); io.vitals.set('energy', 85); io.vitals.set('cheer', 50);
      io.say(reason === 'help' ? 'Asking for help is what good scouts do.' : 'Lesson learned: eat, drink and rest before you run out.', '🧭');
    });
  }

  // ---- Every frame ------------------------------------------------------------------------------------------
  const goalPos = { x: 0, z: 0 };
  function resolveWhere(w) {
    if (!w) return null;
    if (typeof w !== 'string') return w;
    const [kind, id] = w.split(':');
    const cast = io.castWhere();
    if (kind === 'who') { if (cast && cast[id]) return cast[id]; const t = io.interactables.find((x) => LINKS[x.id] === id); return t ? t.position : null; }
    if (kind === 'thing' && cast && cast[id]) return cast[id];
    return null;
  }
  // The card top-right and the waypoint: the tracked quest's stage (or, on a checklist, its first open step).
  function card() {
    const q = story.tracked();
    if (!q) return null;
    const st = q.stage;
    if (!st) return null;
    let title = q.title, text = st.text, where = st.where;
    if (st.steps) { const open = st.steps.find((s) => !s.done && !s.optional); if (open) { title = open.title; text = open.text; where = open.where; } }
    const gate = st.gate && !gateOpen(st.gate) ? ` (${GATE_TEXT[st.gate].when}: J to wait)` : '';
    return { head: `Chapter ${q.chapter || story.state.chapter} · ${q.title}`, title, text: text + gate, where: resolveWhere(where) };
  }
  const gateOpen = (g) => story.check(g);
  function update(dt) {
    if (!started) return;
    // Autosave a moment after something happened, and every few minutes; never mid-conversation.
    if (saveSoon > 0) { saveSoon -= dt; if (saveSoon <= 0 && !story.talking && !busy) save(); }
    if ((saveIn -= dt) <= 0) { saveIn = AUTOSAVE_EVERY; if (!story.talking && !busy) save(); }
    if ((failCheck -= dt) <= 0) {
      failCheck = 1;
      const v = io.vitals;
      if (!busy && !story.talking && !player.asleep && ((v.food <= 0 && v.water <= 0) || (v.energy <= 1 && (v.food < 4 || v.water < 4)))) softFail('tired');
      // A gentle "!" over people who have something new to say, nearby.
      if (!story.talking && !busy) for (const t of io.interactables) {
        if (t.thing || t.enabled === false || !LINKS[t.id] || !canTalk(t)) continue;
        if (Math.hypot(t.position.x - player.position.x, t.position.z - player.position.z) < 22 && Math.random() < 0.35) io.emote(t.position, t.markerY, 'note');
      }
    }
  }
  function goal() { const c = card(); if (!c || !c.where) return null; goalPos.x = c.where.x; goalPos.z = c.where.z; return goalPos; }

  // ---- Game events --------------------------------------------------------------------------------------
  function event(id) {
    for (const [gid, g] of Object.entries(CONTENT.fieldGuide)) if (g.on.includes(id)) story.apply(`guide:${gid}`);
    story.emit(id);
  }

  // ---- New game, Continue, saving ----------------------------------------------------------------------
  function save() {
    if (!started) return false;
    dirty = false; saveSoon = -1;
    return writeSave({ story: story.serialise(), ...io.snapshot() });
  }
  function newGame(name, look) { story.newGame(name, look); story.newDay(io.day); started = true; dirty = true; saveSoon = 2; }
  // Picker on the title screen, then the game starts in `mode` ('journey' or 'free').
  function openPicker(mode) {
    hud.hideStart(true);
    const look = story.state.look || { ...DEFAULT_LOOK };
    io.setLook(look);
    ui.openPicker({ name: '', look }, (l) => io.setLook(l), ({ name, look: l }) => { io.setLook(l); newGame(name, l); io.begin(mode); }, () => { hud.hideStart(false); });
  }
  function continueGame() {
    const doc = readSave();
    if (!doc) return false;
    story.restore(doc.story);
    io.restore(doc);
    if (story.state.look) io.setLook(story.state.look);
    started = true;
    io.begin('continue');
    return true;
  }
  // Keys on the title screen: Enter continues a saved game, or opens the picker.
  function titleKey(e) {
    if (ui.picking) return true;
    if (e.code === 'Enter' || e.code === 'Space') { if (!(hasSave() && continueGame())) openPicker('journey'); return true; }
    return false;
  }
  // Called by main when play starts without the picker (?play, ?journey): a fresh story with the default look.
  function ensureStarted() { if (!started) newGame('Scout', story.state.look || { ...DEFAULT_LOOK }); }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (started && !story.talking) save(); });

  return {
    story, ui, content: CONTENT,
    get talking() { return story.talking || busy; },
    // The picker is open on the title screen: the world runs (people move) but you stand still.
    get previewing() { return ui.picking; },
    get busy() { return busy; },
    // Blend the follow camera in from wherever the camera is now (after a climb's own camera lets go).
    blendFrom() { shot.pos.copy(camera.position); shot.q.copy(camera.quaternion); shot.out = 0.6; },
    prompt, tryTalk, close, cameraStep, cameraAfter, update, goal, card, event, waitFor, softFail, onSleep, onWake, save, openPicker, continueGame, titleKey, ensureStarted,
    hasSave, sessionOnly,
    newDay: (d) => story.newDay(d),
    // Keys while talking or picking. True when used.
    key: (e) => ui.key(e),
    page: (tab) => journalPage(tab, { story, content: CONTENT, waitFor, help: () => softFail('help'), gateOpen }),
    get dirty() { return dirty; },
  };
}
