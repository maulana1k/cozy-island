// Groups of scouts busy with camp life: singing round the fire, saluting the flag,
// cooking, eating, and lashing a bamboo tripod. They stay put; you can say hello.
import * as THREE from 'three';
import { createFigure } from './figure.js';
import { liftFor, talkTo } from './schedule.js';
import { heightAt } from '../logic/terrain.js';
import { COTTAGES, toWorld, groundAt, VILLAGE_FIRE, SALUTE_LINE, FLAGPOLE, PICNIC_TABLES, PIONEER_SITE, CAMPFIRE, SUMMIT, VILLAGE_CENTER } from '../logic/layout.js';

const SHIRT = 0xd8c08a;
const SKIN = [0xf1c7a0, 0xc98d62, 0xe6b48a, 0x9a6a4a, 0xf3d2b4, 0xd9a273];
const HAIR = [0x5b4336, 0x3d3230, 0x8a5a3c, 0x4a3b36, 0xc98f5a, 0x2f2826];
const SCARF = [0xe8503a, 0xf2b63b, 0x4f7fc9, 0x3f8f6a];
const SHORTS = [0x5f7fa6, 0x8a6a4a, 0x6f8f6a, 0x4f5f7a];
const CAPS = [null, 'cap', 'bow', null, 'cap'];

export function createActivities(scene, deps) {
  const { ui, audio, crowd, player } = deps;
  const facingTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const spots = [];

  // Singing and clapping round the village fire (the two logs are left free for you).
  [205, 262, 318, 92].forEach((deg, k) => {
    const a = (deg * Math.PI) / 180, p = { x: VILLAGE_FIRE.x + Math.cos(a) * 3.15, z: VILLAGE_FIRE.z + Math.sin(a) * 3.15 };
    spots.push({ ...p, rot: facingTo(p, VILLAGE_FIRE), pose: 'clap', sitGround: true, role: k < 2 ? 'watch' : 'firecircle' }); // two of them keep the night watch
  });
  // The cook in the food tent, and two scouts eating at a picnic table.
  const mess = COTTAGES.find((c) => c.type === 'mess');
  const cook = toWorld(mess, -1.55, -0.45);
  spots.push({ ...cook, rot: mess.rot - Math.PI / 2, pose: 'stir', accent: 'apron', accentColor: 0xfaf3e2, role: 'cook' });
  const table = PICNIC_TABLES[0];
  for (const [lx, lz, turn] of [[-0.4, -0.72, 0], [0.35, 0.72, Math.PI]]) {
    const p = toWorld({ x: table.x, z: table.z, rot: table.rot }, lx, lz);
    spots.push({ ...p, rot: table.rot + turn, pose: 'eat', sitting: true, lift: -0.16, role: 'eater' });
  }
  // Lashing a tripod at the pioneering site.
  for (const [dx, dz] of [[-1.25, 0.5], [1.1, 0.9]]) { const p = { x: PIONEER_SITE.x + dx, z: PIONEER_SITE.z + dz }; spots.push({ ...p, rot: facingTo(p, PIONEER_SITE), pose: 'hammer', role: 'pioneer' }); }

  // On the summit: two signallers sending semaphore down to the camp, a lookout with binoculars,
  // and a scout drawing the map by the fire.
  for (const p of SUMMIT.signallers) spots.push({ ...p, rot: facingTo(p, VILLAGE_CENTER), pose: 'semaphore', holdFlags: true, role: 'summit' });
  spots.push({ ...SUMMIT.watcher, rot: facingTo({ x: 0, z: 0 }, SUMMIT.watcher), pose: 'binoculars', role: 'summit' });
  spots.push({ ...SUMMIT.mapper, rot: facingTo(SUMMIT.mapper, SUMMIT.fire), pose: 'write', sitGround: true, role: 'summit' });

  const HELLO = ['wave', 'cheer', 'salute', 'clap'];
  const scouts = spots.map((s, i) => {
    const figure = createFigure({
      bodyColor: SHIRT, neckerchief: SCARF[i % 4], skinColor: SKIN[i % 6], hairColor: HAIR[(i * 5) % 6], shortsColor: SHORTS[i % 4],
      accent: s.accent !== undefined ? s.accent : CAPS[i % 5], accentColor: s.accentColor || 0x6f8f5a, holdFlags: !!s.holdFlags,
    });
    const y = groundAt(s.x, s.z) + (s.sitGround ? -figure.sitDrop : s.sitting ? figure.seatLift(0.42) : 0);
    figure.group.position.set(s.x, y, s.z); figure.group.rotation.y = s.rot;
    scene.add(figure.group);
    // Each scout has a place in the camp timetable; `member` is where they are right now.
    const member = crowd.join({ home: { x: s.x, z: s.z, rot: s.rot }, role: s.role });
    if (s.sitting) member.restOpts = { sitting: true };
    return { ...s, figure, y, member, react: null, hellos: i, i };
  });

  const interactables = scouts.map((s) => ({
    id: `scout-${s.i}`, kind: 'villager', position: s.member, get markerY() { return groundAt(s.member.x, s.member.z) + 1.5; },
    get enabled() { return !s.member.hidden; },
    prompt: () => 'E — say hello',
    interact() { s.react = { name: HELLO[s.hellos++ % HELLO.length], t: 0, dur: 1.3 }; audio.play(s.hellos % 2 ? 'squeak' : 'cheer'); ui.emote(new THREE.Vector3(s.member.x, groundAt(s.member.x, s.member.z) + 1.6, s.member.z), s.i % 2 ? 'note' : 'heart'); if (player) talkTo(s.member, player.position); },
  }));
  const colliders = [];

  return {
    interactables,
    // Whoever is up and about is solid, wherever they happen to be standing.
    colliders() { colliders.length = 0; for (const s of scouts) if (!s.member.hidden) colliders.push({ x: s.member.x, z: s.member.z, r: 0.3 }); return colliders; },
    update(dt, elapsed) {
      for (const s of scouts) {
        if (s.react) { s.react.t += dt; if (s.react.t >= s.react.dur) s.react = null; }
        const gesture = s.react ? { name: s.react.name, u: s.react.t / s.react.dur } : null;
        const m = s.member, g = s.figure.group;
        if (crowd.drive(m, dt)) {
          // The timetable has them somewhere else: walking there, or joining in.
          g.visible = !m.hidden;
          g.position.set(m.x, groundAt(m.x, m.z) + (m.opts.sitting ? s.figure.seatLift(0.42) : liftFor(s.figure, m.opts)), m.z);
          let diff = m.rot - g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); g.rotation.y += diff * (1 - Math.exp(-dt * 10));
          s.figure.animate(m.speed, elapsed, { ...m.opts, gesture });
        } else {
          g.visible = true; g.position.set(s.x, s.y, s.z);
          { let d = s.rot - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * (1 - Math.exp(-dt * 10)); } // turns back smoothly after a chat
          s.figure.animate(0, elapsed, { pose: s.pose, sitGround: s.sitGround, sitting: s.sitting, gesture });
        }
      }
    },
  };
}
