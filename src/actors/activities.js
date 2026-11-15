// Groups of scouts busy with camp life: singing round the fire, saluting the flag,
// cooking, eating, and lashing a bamboo tripod. They stay put; you can say hello.
import * as THREE from 'three';
import { createFigure } from './figure.js';
import { heightAt } from '../logic/terrain.js';
import { COTTAGES, toWorld, groundAt, VILLAGE_FIRE, SALUTE_LINE, FLAGPOLE, PICNIC_TABLES, PIONEER_SITE, CAMPFIRE, SUMMIT, VILLAGE_CENTER } from '../logic/layout.js';

const SHIRT = 0xd8c08a;
const SKIN = [0xf1c7a0, 0xc98d62, 0xe6b48a, 0x9a6a4a, 0xf3d2b4, 0xd9a273];
const HAIR = [0x5b4336, 0x3d3230, 0x8a5a3c, 0x4a3b36, 0xc98f5a, 0x2f2826];
const SCARF = [0xe8503a, 0xf2b63b, 0x4f7fc9, 0x3f8f6a];
const SHORTS = [0x5f7fa6, 0x8a6a4a, 0x6f8f6a, 0x4f5f7a];
const CAPS = [null, 'cap', 'bow', null, 'cap'];

export function createActivities(scene, deps) {
  const { ui, audio } = deps;
  const facingTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
  const spots = [];

  // Singing and clapping round the village fire (the two logs are left free for you).
  [205, 262, 318, 92].forEach((deg) => {
    const a = (deg * Math.PI) / 180, p = { x: VILLAGE_FIRE.x + Math.cos(a) * 2.35, z: VILLAGE_FIRE.z + Math.sin(a) * 2.35 };
    spots.push({ ...p, rot: facingTo(p, VILLAGE_FIRE), pose: 'clap', sitGround: true });
  });
  // Standing to attention, saluting the flag.
  for (const p of SALUTE_LINE) spots.push({ ...p, rot: facingTo(p, FLAGPOLE), pose: 'salute' });
  // The cook in the food tent, and two scouts eating at a picnic table.
  const mess = COTTAGES.find((c) => c.type === 'mess');
  const cook = toWorld(mess, -1.55, -0.45);
  spots.push({ ...cook, rot: mess.rot - Math.PI / 2, pose: 'stir', accent: 'apron', accentColor: 0xfaf3e2 });
  const table = PICNIC_TABLES[0];
  for (const [lx, lz, turn] of [[-0.4, -0.72, 0], [0.35, 0.72, Math.PI]]) {
    const p = toWorld({ x: table.x, z: table.z, rot: table.rot }, lx, lz);
    spots.push({ ...p, rot: table.rot + turn, pose: 'eat', sitting: true, lift: 0.12 });
  }
  // Lashing a tripod at the pioneering site.
  for (const [dx, dz] of [[-1.25, 0.5], [1.1, 0.9]]) { const p = { x: PIONEER_SITE.x + dx, z: PIONEER_SITE.z + dz }; spots.push({ ...p, rot: facingTo(p, PIONEER_SITE), pose: 'hammer' }); }
  // Morning exercises on the beach by the camp.
  for (const k of [0, 1, 2]) { const p = { x: CAMPFIRE.x + 6.5 + k * 1.5, z: CAMPFIRE.z - 5.5 - k * 0.9 }; spots.push({ ...p, rot: facingTo(p, CAMPFIRE) + 0.6, pose: 'jacks' }); }

  // On the summit: two signallers sending semaphore down to the camp, a lookout with binoculars,
  // and a scout drawing the map by the fire.
  for (const p of SUMMIT.signallers) spots.push({ ...p, rot: facingTo(p, VILLAGE_CENTER), pose: 'semaphore', holdFlags: true });
  spots.push({ ...SUMMIT.watcher, rot: facingTo({ x: 0, z: 0 }, SUMMIT.watcher), pose: 'binoculars' });
  spots.push({ ...SUMMIT.mapper, rot: facingTo(SUMMIT.mapper, SUMMIT.fire), pose: 'write', sitGround: true });

  const HELLO = ['wave', 'cheer', 'salute', 'clap'];
  const scouts = spots.map((s, i) => {
    const figure = createFigure({
      bodyColor: SHIRT, neckerchief: SCARF[i % 4], skinColor: SKIN[i % 6], hairColor: HAIR[(i * 5) % 6], shortsColor: SHORTS[i % 4],
      accent: s.accent !== undefined ? s.accent : CAPS[i % 5], accentColor: s.accentColor || 0x6f8f5a, holdFlags: !!s.holdFlags,
    });
    const y = groundAt(s.x, s.z) + (s.sitGround ? -0.2 : s.lift || 0);
    figure.group.position.set(s.x, y, s.z); figure.group.rotation.y = s.rot;
    scene.add(figure.group);
    return { ...s, figure, y, react: null, hellos: i, i };
  });

  const interactables = scouts.map((s) => ({
    id: `scout-${s.i}`, kind: 'villager', position: { x: s.x, z: s.z }, markerY: s.y + 1.75,
    prompt: () => 'E — say hello',
    interact() { s.react = { name: HELLO[s.hellos++ % HELLO.length], t: 0, dur: 1.3 }; audio.play(s.hellos % 2 ? 'squeak' : 'cheer'); ui.emote(new THREE.Vector3(s.x, s.y + 1.85, s.z), s.i % 2 ? 'note' : 'heart'); },
  }));
  const colliders = scouts.map((s) => ({ x: s.x, z: s.z, r: 0.3 }));

  return {
    interactables,
    colliders: () => colliders,
    update(dt, elapsed) {
      for (const s of scouts) {
        if (s.react) { s.react.t += dt; if (s.react.t >= s.react.dur) s.react = null; }
        s.figure.animate(0, elapsed, { pose: s.pose, sitGround: s.sitGround, sitting: s.sitting, gesture: s.react ? { name: s.react.name, u: s.react.t / s.react.dur } : null });
      }
    },
  };
}
