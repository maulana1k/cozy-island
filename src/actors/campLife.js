// The livelier side of camp: the chief scout drilling a squad, a trainer leading exercises,
// logistics and medical staff at work, and scouts being scouts: playing tag, throwing a ball
// about and hauling on a tug-of-war rope.
import * as THREE from 'three';
import { createFigure } from './figure.js';
import { liftFor, talkTo } from './schedule.js';
import { heightAt } from '../logic/terrain.js';
import { COTTAGES, toWorld, groundAt, SALUTE_LINE, CAMPFIRE, PLAY } from '../logic/layout.js';
import { stick, ball, shared } from '../world/build.js';

const KHAKI = 0xd8c08a;
const SKIN = [0xf1c7a0, 0xc98d62, 0xe6b48a, 0x9a6a4a, 0xf3d2b4, 0xd9a273];
const HAIR = [0x5b4336, 0x3d3230, 0x8a5a3c, 0x4a3b36, 0xc98f5a, 0x2f2826];
const SCARF = [0xe8503a, 0xf2b63b, 0x4f7fc9, 0x3f8f6a];
const ADULT = 1.2;

export function createCampLife(scene, deps) {
  const { ui, audio, player, crowd } = deps;
  const people = [];
  let n = 0;
  // A scout, or with opts.adult a grown-up member of staff.
  function person(x, z, rot, opts = {}) {
    const i = n++;
    const figure = createFigure({
      bodyColor: opts.shirt || KHAKI, neckerchief: opts.scarf !== undefined ? opts.scarf : SCARF[i % 4], skinColor: SKIN[i % 6], hairColor: opts.hair || HAIR[(i * 5) % 6],
      shortsColor: opts.shorts || [0x5f7fa6, 0x8a6a4a, 0x6f8f6a, 0x4f5f7a][i % 4], accent: opts.accent !== undefined ? opts.accent : [null, 'cap', 'bow', null][i % 4], accentColor: opts.accentColor || 0x6f8f5a,
      coat: opts.coat !== undefined ? opts.coat : null, armband: !!opts.armband, carry: opts.carry !== undefined ? opts.carry : null, scale: opts.adult ? ADULT : 1,
    });
    scene.add(figure.group);
    const p = { figure, x, z, rot, y: null, speed: 0, opts: {}, react: null, name: opts.name || null, solid: opts.solid !== false, lift: opts.lift || 0, ctl: false };
    p.member = crowd.join({ home: { x, z, rot }, role: 'scout', adult: !!opts.adult });
    people.push(p);
    return p;
  }
  const face = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const near = (x, z, d) => Math.hypot(player.position.x - x, player.position.z - z) < d;
  const react = (p, name, dur = 1.1) => { p.react = { name, t: 0, dur }; };
  const emote = (p, icon) => ui.emote(new THREE.Vector3(p.x, groundAt(p.x, p.z) + (p.figure.group.scale.y > 1 ? 2.0 : 1.6), p.z), icon);

  // ---- The chief scout drills a squad on the parade ground --------------------
  const mid = SALUTE_LINE[1];
  const chief = person(15.1, 11.2, face({ x: 15.1, z: 11.2 }, mid), { adult: true, accent: 'hat', accentColor: 0xb89a5e, scarf: 0x6a3f9c, shorts: 0x6b5a3a, name: 'the chief scout' });
  const squad = SALUTE_LINE.map((p) => person(p.x, p.z, face(p, chief)));
  const ORDERS = ['attention', 'salute', 'jacks', 'march', 'attention', 'clap'];
  const drill = { order: 0, timer: 3 };
  // ---- A trainer leads exercises on the beach ---------------------------------
  const B = PLAY.beach;
  const beach = [0, 1, 2].map((k) => ({ x: B.x + (k - 1) * 1.5, z: B.z - (k - 1) * 0.9 }));
  const trainerSpot = { x: B.x - 1.5, z: B.z - 2.6 };
  const trainer = person(trainerSpot.x, trainerSpot.z, face(trainerSpot, beach[1]), { adult: true, accent: 'cap', accentColor: 0xe8503a, shirt: 0xf2f2ee, shorts: 0x3f4f6a, name: 'the trainer' });
  const beachSquad = beach.map((p) => person(p.x, p.z, face(p, trainerSpot)));

  // ---- Logistics: one teacher ticks off the stores, another carries them to the kitchen
  const hall = COTTAGES.find((c) => c.type === 'hall');
  const stores = toWorld(hall, -5.4, 2.4);
  const clerk = person(stores.x, stores.z, face(stores, toWorld(hall, -5, 1.2)), { adult: true, accent: 'cap', accentColor: 0x4f5f7a, shirt: 0x8fa678, scarf: null, shorts: 0x5b5340, name: 'the stores teacher' });
  const carrier = person(4.2, -4.6, 0, { adult: true, accent: null, shirt: 0x8fa678, scarf: null, shorts: 0x5b5340, carry: 0xc79a62, solid: false, name: 'the logistics teacher' });
  const haul = { route: [{ x: 4.2, z: -4.6 }, { x: 4.6, z: 1.5 }, { x: 6.0, z: 6.0 }, { x: 5.6, z: 12.2 }, { x: 8.5, z: 17 }, { x: 12.6, z: 20.6 }], leg: 1, dir: 1, wait: 0, loaded: true };

  // ---- First aid: a medical teacher explains while a student bandages a patient ---
  const aid = COTTAGES.find((c) => c.type === 'aid');
  const bench = toWorld(aid, -1.4, 3.0), kneel = toWorld(aid, -1.4, 3.85), docSpot = toWorld(aid, -0.2, 4.1), helperSpot = toWorld(aid, 0.9, 3.5);
  const patient = person(bench.x, bench.z, aid.rot, { lift: -0.16, accent: null });
  const medic = person(kneel.x, kneel.z, aid.rot + Math.PI, { armband: true, accent: 'cap', accentColor: 0xffffff });
  const doctor = person(docSpot.x, docSpot.z, face(docSpot, bench), { adult: true, coat: 0xfbfbf7, armband: true, accent: null, scarf: null, shorts: 0x4f5f7a, hair: 0x3d3230, name: 'the medical teacher' });
  const helper = person(helperSpot.x, helperSpot.z, face(helperSpot, bench), { armband: true, accent: null, carry: 0xfafafa });

  // ---- Tag: one scout is "it" and everyone else runs for it -------------------
  const T = PLAY.tag;
  const runners = [0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2; const p = person(T.x + Math.cos(a) * 3.2, T.z + Math.sin(a) * 3.2, a, { solid: false }); p.vx = 0; p.vz = 0; p.wob = k * 1.7; return p; });
  const tag = { it: 0, freeze: 0, last: -1, grace: 0 };

  // ---- Catch: two scouts throwing a ball, sometimes badly ---------------------
  const [c0, c1] = PLAY.catch;
  const catchers = [person(c0.x, c0.z, face(c0, c1), { solid: false }), person(c1.x, c1.z, face(c1, c0), { solid: false })];
  const homes = [c0, c1];
  const toy = ball(0.13, 0xe8503a, 0, 0, 0, 1); scene.add(toy);
  const game = { state: 'held', holder: 0, timer: 1.2, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), dur: 1, arc: 2.5, miss: false };

  // ---- Tug-of-war: two pairs hauling on a rope --------------------------------
  const G = PLAY.tug, gx = Math.sin(G.rot), gz = Math.cos(G.rot);
  const pullers = [-3.1, -2.1, 2.1, 3.1].map((d) => { const p = person(G.x + gx * d, G.z + gz * d, G.rot + (d < 0 ? 0 : Math.PI), { solid: false }); p.d = d; return p; });
  const rope = new THREE.Group();
  rope.add(stick([0, 0.78, -3.6], [0, 0.78, 3.6], 0.03, 0xe9dcc0), ball(0.09, 0xe8503a, 0, 0.78, 0, 0));
  rope.rotation.y = G.rot; scene.add(rope);
  const line = stick([-1.2, 0.03, 0], [1.2, 0.03, 0], 0.03, 0xfaf7f0); line.position.set(G.x, heightAt(G.x, G.z) + 0.03, G.z); line.rotation.y = G.rot; line.rotation.z = Math.PI / 2; scene.add(line);

  // Everyone's place in the timetable.
  const role = (list, name) => { for (const p of list) p.member.role = name; };
  role([chief], 'chief'); role(squad, 'drill'); role([trainer], 'trainer'); role(beachSquad, 'beach'); role([clerk], 'clerk'); role([carrier], 'carrier');
  role([patient, medic, doctor, helper], 'medical'); role(runners, 'tag'); role(catchers, 'catch'); role(pullers, 'tug');
  const busy = (list) => list.some((p) => p.ctl);

  const staff = [chief, trainer, clerk, carrier, doctor];
  const interactables = staff.map((p, k) => ({
    id: `staff-${k}`, kind: 'villager', speaker: ['Chief Scout', 'Trainer', 'Stores Teacher', 'Logistics Teacher', 'Medical Teacher'][k], position: p, get markerY() { return groundAt(p.x, p.z) + 1.95; },
    get enabled() { return !p.member.hidden; },
    prompt: () => `E — greet ${p.name}`,
    interact() { react(p, k === 0 ? 'salute' : 'wave', 1.2); emote(p, 'heart'); audio.play('squeak'); talkTo(p.member, player.position); },
    // For the story's conversations: lying in bed, and staying turned to you while a talk is open.
    get asleep() { return !!(p.member.spot && p.member.spot.lie && p.member.arrived); },
    hold(on) { if (on) { react(p, 'wave', 1.2); talkTo(p.member, player.position, 1e9); } else if (p.member.talk) p.member.talk.dur = 0; },
  }));
  const solids = people.filter((p) => p.solid);
  const colliders = [];

  return {
    interactables,
    colliders() { colliders.length = 0; for (const p of solids) if (!p.member.hidden) colliders.push({ x: p.x, z: p.z, r: 0.32, person: true }); return colliders; },
    update(dt, elapsed) {
      // First ask the timetable who it needs elsewhere; the rest carry on with their own thing.
      for (const p of people) { p.speed = 0; p.opts = {}; p.ctl = crowd.drive(p.member, dt); }

      // Chief: a new order every few seconds, a blast on the whistle, and the squad follows.
      drill.timer -= chief.ctl ? 0 : dt;
      if (drill.timer <= 0) {
        drill.order = (drill.order + 1) % ORDERS.length; drill.timer = 4.5 + Math.random() * 2;
        react(chief, 'reachUp', 0.7); if (near(chief.x, chief.z, 22)) audio.play('whistle');
      }
      chief.opts = { pose: 'command' };
      const order = ORDERS[drill.order];
      squad.forEach((s, k) => {
        // Not everyone is paying attention all the time.
        const late = drill.timer > 4.5 - 0.35 * (k + 1) * 0.6 && drill.timer > 3.6;
        const o = late ? ORDERS[(drill.order + ORDERS.length - 1) % ORDERS.length] : order;
        if (o === 'march') s.speed = 1.15; else s.opts = { pose: o };
      });
      trainer.opts = { pose: Math.sin(elapsed * 0.25) > 0.3 ? 'command' : 'jacks' };
      for (const s of beachSquad) s.opts = { pose: 'jacks' };

      // Logistics
      clerk.opts = { pose: 'write' };
      if (carrier.ctl) { /* off duty */ } else if (haul.wait > 0) { haul.wait -= dt; carrier.opts = haul.loaded ? { pose: 'carry' } : {}; }
      else {
        const tp = haul.route[haul.leg], dx = tp.x - carrier.x, dz = tp.z - carrier.z, d = Math.hypot(dx, dz);
        if (d < 0.2) {
          if (haul.leg === haul.route.length - 1 || haul.leg === 0) { haul.dir = -haul.dir; haul.loaded = haul.leg === 0; carrier.figure.setCarry(haul.loaded); haul.wait = 2.2; react(carrier, 'crouch', 1.2); }
          haul.leg += haul.dir;
        } else { carrier.speed = haul.loaded ? 1.0 : 1.2; carrier.x += (dx / d) * carrier.speed * dt; carrier.z += (dz / d) * carrier.speed * dt; carrier.rot = Math.atan2(dx, dz); if (haul.loaded) carrier.opts = { pose: 'carry' }; }
      }

      // First aid
      patient.member.restOpts = { sitting: true }; patient.opts = { sitting: true }; medic.opts = { pose: 'bandage' }; doctor.opts = { pose: 'explain' }; helper.opts = {}; // the helper stands by (no empty-handed carry pose)

      // Tag
      tag.freeze -= dt; tag.grace -= dt;
      if (tag.freeze <= 0 && !busy(runners)) {
        const it = runners[tag.it];
        let target = -1, best = Infinity;
        runners.forEach((r, k) => { if (k === tag.it || (k === tag.last && tag.grace > 0)) return; const d = Math.hypot(r.x - it.x, r.z - it.z); if (d < best) { best = d; target = k; } });
        runners.forEach((r, k) => {
          let wx = 0, wz = 0, top = 4.2;
          if (k === tag.it) { const q = runners[target]; wx = q.x - r.x; wz = q.z - r.z; top = 4.75; }
          else {
            const dx = r.x - it.x, dz = r.z - it.z, d = Math.hypot(dx, dz) || 1;
            wx = (dx / d) * (6 / (d + 0.5)); wz = (dz / d) * (6 / (d + 0.5));
            // dodge sideways, keep apart from the others, and stay on the playing field
            wx += Math.sin(elapsed * 1.3 + r.wob) * 0.6; wz += Math.cos(elapsed * 1.1 + r.wob) * 0.6;
            for (const o of runners) if (o !== r && o !== it) { const ox = r.x - o.x, oz = r.z - o.z, od = Math.hypot(ox, oz) || 1; if (od < 1.6) { wx += ox / od; wz += oz / od; } }
            if (d > 6) top = 2.6; // catch your breath when the chaser is far off
          }
          const cx = T.x - r.x, cz = T.z - r.z, cd = Math.hypot(cx, cz);
          if (cd > T.r - 1.6) { const pull = (cd - (T.r - 1.6)) * 1.6; wx += (cx / cd) * pull; wz += (cz / cd) * pull; }
          const wl = Math.hypot(wx, wz) || 1, tx = (wx / wl) * top, tz = (wz / wl) * top;
          const dvx = tx - r.vx, dvz = tz - r.vz, dv = Math.hypot(dvx, dvz), step = 11 * dt;
          if (dv <= step) { r.vx = tx; r.vz = tz; } else { r.vx += (dvx / dv) * step; r.vz += (dvz / dv) * step; }
          // Every so often somebody trips over their own feet.
          if (!r.react && r.speed > 3.5 && Math.random() < dt * 0.05) { react(r, 'stumble', 0.75); r.vx *= 0.4; r.vz *= 0.4; }
          r.x += r.vx * dt; r.z += r.vz * dt; r.speed = Math.hypot(r.vx, r.vz);
          if (r.speed > 0.3) r.rot = Math.atan2(r.vx, r.vz);
        });
        if (best < 0.75 && target >= 0) {
          const caught = runners[target];
          react(caught, 'laugh', 1.2); react(it, 'cheer', 1.1); emote(caught, 'note');
          if (near(T.x, T.z, 22)) audio.play('laugh');
          tag.last = tag.it; tag.it = target; tag.freeze = 1.1; tag.grace = 2.5;
          for (const r of runners) { r.vx = 0; r.vz = 0; }
        }
      }

      // Catch
      const hand = (p, out) => out.set(p.x + Math.sin(p.rot) * 0.3, groundAt(p.x, p.z) + 1.35, p.z + Math.cos(p.rot) * 0.3);
      if (busy(catchers)) { /* the game waits */ } else if (game.state === 'held') {
        const h = catchers[game.holder], o = catchers[1 - game.holder];
        // walk back to your own spot if a wild throw took you away from it
        const home = homes[game.holder], hd = Math.hypot(home.x - h.x, home.z - h.z);
        if (hd > 0.25) { h.speed = 2.6; h.x += ((home.x - h.x) / hd) * h.speed * dt; h.z += ((home.z - h.z) / hd) * h.speed * dt; h.rot = Math.atan2(home.x - h.x, home.z - h.z); }
        else { h.rot = face(h, o); game.timer -= dt; }
        hand(h, toy.position);
        if (game.timer <= 0.35 && !game.wound) { react(h, 'throw', 0.7); game.wound = true; }
        if (game.timer <= 0) {
          game.miss = Math.random() < 0.28; game.wound = false;
          hand(h, game.from); hand(o, game.to);
          if (game.miss) { const a = face(h, o) + (Math.random() - 0.5) * 0.9, far = 2 + Math.random() * 2.5; game.to.set(o.x + Math.sin(a) * far, groundAt(o.x, o.z) + 0.13, o.z + Math.cos(a) * far); }
          game.dur = 0.9 + Math.random() * 0.4; game.arc = 1.6 + Math.random() * 2.2; game.t = 0; game.state = 'fly';
          if (!game.miss) react(o, 'catch', game.dur + 0.3);
        }
      } else if (game.state === 'fly') {
        game.t += dt / game.dur;
        const f = Math.min(1, game.t);
        toy.position.lerpVectors(game.from, game.to, f); toy.position.y += game.arc * 4 * f * (1 - f);
        if (f >= 1) {
          if (game.miss) { game.state = 'loose'; const o = catchers[1 - game.holder]; emote(o, 'surprise'); react(catchers[game.holder], 'laugh', 1.2); if (near(o.x, o.z, 20)) audio.play('laugh'); }
          else { game.holder = 1 - game.holder; game.state = 'held'; game.timer = 0.7 + Math.random() * 1.2; }
        }
      } else { // the ball got away: run and fetch it
        const o = catchers[1 - game.holder], dx = toy.position.x - o.x, dz = toy.position.z - o.z, d = Math.hypot(dx, dz);
        if (d > 0.45) { o.speed = 3.8; o.x += (dx / d) * o.speed * dt; o.z += (dz / d) * o.speed * dt; o.rot = Math.atan2(dx, dz); }
        else { react(o, 'crouch', 0.8); game.holder = 1 - game.holder; game.state = 'held'; game.timer = 1.6; }
      }
      toy.rotation.x += dt * 6;

      // Tug-of-war: the whole line lurches one way, then the other.
      const sway = Math.sin(elapsed * 0.7) * 0.55 + Math.sin(elapsed * 1.9) * 0.16;
      for (const p of pullers) { p.x = G.x + gx * (p.d + sway); p.z = G.z + gz * (p.d + sway); p.opts = { pose: 'tug' }; }
      rope.position.set(G.x + gx * sway, heightAt(G.x, G.z), G.z + gz * sway);

      for (const p of people) {
        const m = p.member;
        if (p.ctl) { p.x = m.x; p.z = m.z; p.rot = m.rot; p.speed = m.speed; p.opts = m.opts; } else { m.x = p.x; m.z = p.z; m.rot = p.rot; }
        p.figure.group.visible = !m.hidden;
        if (p.react) { p.react.t += dt; if (p.react.t >= p.react.dur) p.react = null; }
        const y = groundAt(p.x, p.z) + (p.opts.sitting ? p.figure.seatLift(0.42) : p.ctl ? liftFor(p.figure, p.opts) : 0);
        p.figure.group.position.set(p.x, y, p.z);
        // Turn smoothly rather than snapping round.
        let diff = p.rot - p.figure.group.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        p.figure.group.rotation.y += diff * (1 - Math.exp(-dt * 10));
        p.figure.animate(p.speed, elapsed, { ...p.opts, gesture: p.react ? { name: p.react.name, u: p.react.t / p.react.dur } : null });
      }
    },
  };
}
