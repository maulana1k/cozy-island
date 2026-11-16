import * as THREE from 'three';
import { createFigure } from './figure.js';
import { liftFor } from './schedule.js';
import { createVillager, stepVillager, nudgeVillager, hearBell, waitAMoment } from '../logic/villagerBrain.js';
import { createRng } from '../logic/rng.js';
import { heightAt } from '../logic/terrain.js';
import { VILLAGER_SPOTS, getColliders, groundAt } from '../logic/layout.js';
import { PALETTE, SEED, VILLAGER_COUNT, VILLAGER_RADIUS, NUDGE_TIME } from '../config.js';

// Five scouts and their leader (the one in the wide hat).
const ACCENTS = ['hat', 'cap', 'bow', 'cap', null, 'cap'];
const SHIRTS = [0xc9b27a, 0xd8c08a, 0xd8c08a, 0xcdb98a, 0xd8c08a, 0xcbb780];
const NECKERCHIEFS = [0x3f8f6a, 0xe8503a, 0xf2b63b, 0x4f7fc9, 0xe8503a, 0xf2b63b];
const ACCENT_COLORS = [0xb89a5e, 0x6f8f5a, 0xe07a94, 0x6f8f5a, 0xfff3c4, 0x6f8f5a];
const HAIR = [0x5b4336, 0x8a5a3c, 0x3d3230, 0xc98f5a, 0xd8d2c8, 0x4a3b36];
const SKIN = [0xf1c7a0, 0xc98d62, 0xe6b48a, 0x9a6a4a, 0xf3d2b4, 0xd9a273];
const SHORTS = [0x5f7fa6, 0x8a6a4a, 0x6f8f6a, 0x4f5f7a, 0xa66a5f, 0x7a6fa6];
const EMOTES = ['heart', 'note', 'surprise'];
const REACTIONS = ['wave', 'cheer', 'salute', 'clap', 'wave'];

export function createVillagers(scene, deps) {
  const { ui, audio, crowd } = deps;
  const rng = createRng(SEED + 5);
  const world = { spots: VILLAGER_SPOTS, colliders: getColliders(), rng };

  const villagers = [];
  for (let i = 0; i < VILLAGER_COUNT; i++) {
    const brain = createVillager(`villager-${i}`, VILLAGER_SPOTS[i + 1], rng);
    brain.timer = 0.5 + rng() * 4;
    const figure = createFigure({ bodyColor: SHIRTS[i], neckerchief: NECKERCHIEFS[i], accent: ACCENTS[i], accentColor: ACCENT_COLORS[i], hairColor: HAIR[i], skinColor: SKIN[i], shortsColor: SHORTS[i] });
    scene.add(figure.group);
    villagers.push({ member: crowd.join({ home: null, role: 'villager', adult: i === 0 }), brain, figure, heading: rng() * 6.28, wobble: 0, hop: 0, position: { x: brain.x, z: brain.z } });
  }

  function nudge(v, from) {
    if (!nudgeVillager(v.brain, from)) return;
    v.wobble = 1; v.hop = NUDGE_TIME;
    // Each scout answers a nudge in their own way, a moment after stumbling.
    v.react = { name: REACTIONS[Math.floor(Math.random() * REACTIONS.length)], t: -0.45, dur: 1.1 };
    audio.play('squeak');
    const y = heightAt(v.brain.x, v.brain.z);
    ui.emote(new THREE.Vector3(v.brain.x, y + 1.5, v.brain.z), EMOTES[Math.floor(Math.random() * EMOTES.length)]);
  }

  const interactables = villagers.map((v) => ({
    id: v.brain.id, kind: 'villager', position: v.position,
    get markerY() { return heightAt(v.brain.x, v.brain.z) + 1.4; },
    prompt: () => 'E — nudge',
    interact() { nudge(v, { x: deps.player.position.x, z: deps.player.position.z }); },
  }));

  const circles = villagers.map(() => ({ x: 0, z: 0, r: 0.3 }));

  return {
    interactables,
    villagers,
    // Villagers are solid for the player.
    colliders() { villagers.forEach((v, i) => { circles[i].x = v.brain.x; circles[i].z = v.brain.z; circles[i].r = v.member.hidden ? 0 : 0.3; }); return circles; },
    hearBell(pos) { villagers.forEach((v) => hearBell(v.brain, pos)); },
    update(dt, elapsed, player) {
      for (const v of villagers) {
        const b = v.brain, m = v.member;
        if (v.react) { v.react.t += dt; if (v.react.t >= v.react.dur) v.react = null; }
        if (!m.controlled) { m.x = b.x; m.z = b.z; m.rot = v.heading; }
        if (crowd.drive(m, dt)) {
          // Called away by the timetable: walk there and join in, then wander again afterwards.
          b.x = m.x; b.z = m.z; b.state = 'idle'; b.timer = 1 + (m.index % 3); v.position.x = b.x; v.position.z = b.z;
          let diff = m.rot - v.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); v.heading += diff * (1 - Math.exp(-dt * 10));
          v.figure.group.visible = !m.hidden;
          v.figure.group.position.set(b.x, groundAt(b.x, b.z) + liftFor(v.figure, m.opts), b.z);
          v.figure.group.rotation.y = v.heading;
          v.figure.animate(m.speed, elapsed, { ...m.opts, gesture: v.react && v.react.t > 0 ? { name: v.react.name, u: v.react.t / v.react.dur } : null });
          continue;
        }
        v.figure.group.visible = true;
        const dx = player.position.x - b.x, dz = player.position.z - b.z, d = Math.hypot(dx, dz);
        // Walking into a villager nudges them; a villager walking into the player just waits.
        if (d < VILLAGER_RADIUS + player.radius + 0.12) {
          if (player.pushing) nudge(v, { x: player.position.x, z: player.position.z });
          else if (b.state === 'walk' && dx * b.facing.x + dz * b.facing.z > 0) waitAMoment(b, 1);
        }
        const was = b.state;
        stepVillager(b, dt, world);
        v.position.x = b.x; v.position.z = b.z;
        // Arriving somewhere, a wanderer may find someone close by and stop for a chat.
        if (v.chat) { v.chat.t += dt; if (v.chat.t >= v.chat.dur || b.state !== 'idle') v.chat = null; }
        else if (was === 'walk' && b.state === 'idle' && Math.random() < 0.6) {
          let best = null, bd = 3.6 * 3.6;
          for (const o of crowd.members) { if (o === m || o.hidden) continue; const q = (o.x - b.x) ** 2 + (o.z - b.z) ** 2; if (q > 0.5 && q < bd) { bd = q; best = o; } }
          if (best) {
            const dur = 3 + Math.random() * 3.5, l = Math.sqrt(bd);
            b.facing.x = (best.x - b.x) / l; b.facing.z = (best.z - b.z) / l; b.timer = Math.max(b.timer, dur + 0.5);
            v.chat = { t: 0, dur, with: best };
            if (d < 25) ui.emote(new THREE.Vector3(b.x, groundAt(b.x, b.z) + 1.5, b.z), 'note');
          }
        }

        v.wobble = Math.max(0, v.wobble - dt / 0.7);
        v.hop = Math.max(0, v.hop - dt);
        const hopY = v.hop > 0 ? Math.sin((1 - v.hop / NUDGE_TIME) * Math.PI) * 0.35 : 0;

        const want = Math.atan2(b.facing.x, b.facing.z);
        let diff = want - v.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        v.heading += diff * Math.min(1, dt * 4.5); // comes round in a curve

        v.figure.group.position.set(b.x, groundAt(b.x, b.z) + hopY, b.z);
        v.figure.group.rotation.y = v.heading;
        v.figure.animate(b.state === 'walk' ? b.speed : 0, elapsed, { wobble: v.wobble, pose: v.chat && !v.react ? 'explain' : undefined, look: v.chat ? v.chat.with : undefined, mood: v.chat ? 'happy' : undefined, gesture: v.react && v.react.t > 0 ? { name: v.react.name, u: v.react.t / v.react.dur } : null });
      }
    },
  };
}
