// A placeholder area that proves the wiring: a signpost where the riverside trail leaves the
// windmill knoll. It has something to use (read the sign), something solid (its post) and a
// tiny update (the board creaks round in the breeze). Copy this file to start a new area.
//
// An area file exports `create(scene, deps)` and returns any of:
//   interactables: [{ id, kind, position: {x, z}, markerY, prompt(), interact() }]  picked with E
//   colliders:     an array of {x, z, r} or {x, z, hw, hd, rot}, read every frame (you may change it later),
//                  or a function returning one
//   update(dt, elapsed, player, night)                                              called every frame
// `deps` holds what areas need: see `areaDeps` in src/main.js.
import * as THREE from 'three';
import { box, cyl, mergeStatic } from '../build.js';
import { AREAS, PALETTE } from '../../config.js';

export function create(scene, { heightAt, say, audio }) {
  const at = AREAS.trails[0][0], y = heightAt(at.x + 0.6, at.z - 0.8), x = at.x + 0.6, z = at.z - 0.8;
  const post = new THREE.Group();
  post.add(cyl(0.07, 0.08, 1.9, PALETTE.woodDark, 0, 0.95, 0, 6));
  mergeStatic(post); post.position.set(x, y, z); scene.add(post);
  const board = new THREE.Group();
  board.add(box(1.1, 0.26, 0.05, PALETTE.wood, 0.45, 0, 0), box(0.95, 0.24, 0.05, PALETTE.wood, -0.38, -0.34, 0));
  mergeStatic(board); board.position.set(x, y + 1.6, z); board.rotation.y = 0.6; scene.add(board);
  return {
    interactables: [{
      id: 'signpost-knoll', kind: 'sign', position: { x, z }, markerY: y + 2.1,
      prompt: () => 'E — read the signpost',
      interact() { audio.play('ui'); say('Bridge and village: east. Riverside path to the lake and the cliffs: north.', '🪧'); },
    }],
    colliders: [{ x, z, r: 0.18 }],
    update(dt, elapsed) { board.rotation.y = 0.6 + Math.sin(elapsed * 0.7) * 0.03; },
  };
}
