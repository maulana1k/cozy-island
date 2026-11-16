// INTERNAL. The story's new people and things on today's map (docs/superpowers/specs/2026-11-17-story-quests-design.md,
// sections 6 and 10b.5; milestone 1): Bayu the buddy scout and Tia the younger scout outside your patrol tent, the
// camp notice board by the headquarters tent (the hint for the reef-knot puzzle), and the glowing specks on the beach
// after the Chapter 1 storm. The two scouts follow the camp timetable like everyone else (exercise, the flag, lunch,
// the campfire, bed) and come back to the tent the rest of the day; pressing E on them stops them and turns them to
// you through the same talkTo/hold logic as the other people (src/actors/schedule.js).
// Cost: two figures, one welded mesh for the board, one point cloud for the specks (night only).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFigure } from '../../actors/figure.js';
import { liftFor, talkTo } from '../../actors/schedule.js';
import { COTTAGES, toWorld } from '../../logic/layout.js';
import { CHARACTERS } from '../../story/characters.js';
import { SPECKS_AT } from '../../story/quests.js';

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
function piece(geo, hex, x = 0, y = 0, z = 0, ry = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)));
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

// The notice board: two posts, a little roof, a cork board with pinned sheets (knots, the safety poster).
function noticeBoard() {
  const W = 0xe9e2cf, P = [];
  P.push(piece(new THREE.BoxGeometry(0.12, 2.0, 0.12), 0x8d6643, -0.75, 1.0, 0), piece(new THREE.BoxGeometry(0.12, 2.0, 0.12), 0x8d6643, 0.75, 1.0, 0));
  P.push(piece(new THREE.BoxGeometry(1.7, 1.0, 0.06), 0xb98a55, 0, 1.35, 0.02));
  P.push(piece(new THREE.BoxGeometry(1.9, 0.06, 0.5), 0x6b4a33, 0, 2.0, 0.05));
  P.push(piece(new THREE.BoxGeometry(0.55, 0.7, 0.01), W, -0.45, 1.38, 0.06), piece(new THREE.BoxGeometry(0.5, 0.42, 0.01), 0xfff6c8, 0.25, 1.55, 0.06), piece(new THREE.BoxGeometry(0.42, 0.34, 0.01), 0xe8563f, 0.5, 1.12, 0.06));
  // a coil of rope drawn on the knots sheet, and pins
  P.push(piece(new THREE.TorusGeometry(0.12, 0.02, 4, 12), 0xc79a62, -0.45, 1.45, 0.07));
  for (const [x, y] of [[-0.45, 1.7], [0.25, 1.74], [0.5, 1.27]]) P.push(piece(new THREE.SphereGeometry(0.025, 6, 4), 0xe8503a, x, y, 0.08));
  const g = mergeGeometries(P); g.computeVertexNormals();
  const m = new THREE.Mesh(g, MAT); m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Tiny blue lights along the tide line: one point cloud that twinkles, only drawn at night.
function speckCloud(at, groundAt) {
  const n = 140, pos = new Float32Array(n * 3), phase = new Float32Array(n);
  const ang = Math.atan2(at.z, at.x), tx = -Math.sin(ang), tz = Math.cos(ang); // along the shore
  for (let i = 0; i < n; i++) {
    const s = (Math.random() - 0.5) * 9, d = (Math.random() - 0.5) * 1.6;
    const x = at.x + tx * s + Math.cos(ang) * d, z = at.z + tz * s + Math.sin(ang) * d;
    pos.set([x, Math.max(groundAt(x, z), 0) + 0.04, z], i * 3); phase[i] = Math.random() * 6.28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float phase; uniform float uTime; varying float vGlow; void main() { vGlow = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 1.7 + phase * 3.0), 3.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (6.0 + 10.0 * vGlow) * (12.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vGlow; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(0.35, 0.8, 1.0, (1.0 - d * 2.0) * vGlow); }',
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.visible = false;
  return { pts, mat };
}

export function create(scene, deps) {
  const { crowd, groundAt, player, audio, ui } = deps;
  const tent = COTTAGES.find((c) => c.type === 'patrol');
  const turn = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const people = [];
  function scout(id, home, opts) {
    const L = CHARACTERS[id].look;
    const figure = createFigure({ bodyColor: L.shirt, neckerchief: L.scarf, skinColor: L.skin, hairColor: L.hair, accent: opts.accent, accentColor: L.hat, shortsColor: opts.shorts, hairStyle: opts.hairStyle, scale: 1 });
    scene.add(figure.group);
    const member = crowd.join({ home, role: 'cast' });
    const p = { id, figure, member, home, react: null, pose: opts.pose };
    people.push(p);
    return p;
  }
  const doorOut = toWorld(tent, 0, tent.depth / 2 + 3.2);
  const bHome = toWorld(tent, 1.7, tent.depth / 2 + 1.9), tHome = toWorld(tent, -1.9, tent.depth / 2 + 2.5);
  const bayu = scout('buddy', { ...bHome, rot: turn(bHome, doorOut) }, { accent: 'cap', shorts: 0x4f5f7a, hairStyle: 2 });
  const tia = scout('younger', { ...tHome, rot: turn(tHome, bHome) }, { accent: 'bow', shorts: 0x6f8f6a, hairStyle: 3, pose: 'write' });
  tia.member.restOpts = { sitGround: true };

  const asleep = (m) => !!(m.spot && m.spot.lie && m.arrived);
  const interactables = people.map((p) => ({
    id: `cast-${p.id}`, kind: 'villager', speaker: CHARACTERS[p.id].name, lines: CHARACTERS[p.id].greet, position: p.member,
    get markerY() { return groundAt(p.member.x, p.member.z) + 1.5; },
    get enabled() { return !p.member.hidden; },
    get asleep() { return asleep(p.member); },
    prompt: () => `E — say hello to ${CHARACTERS[p.id].name}`,
    interact() { p.react = { name: 'wave', t: 0, dur: 1.2 }; if (audio) audio.play('squeak'); talkTo(p.member, player.position); },
    // While a conversation is open the person stays turned to you; false lets them carry on.
    hold(on) { if (on) { p.react = { name: 'wave', t: 0, dur: 1.2 }; talkTo(p.member, player.position, 1e9); } else if (p.member.talk) p.member.talk.dur = 0; },
  }));

  // ---- The notice board, beside the headquarters tent
  const BOARD = { x: 7.0, z: -3.6, rot: 0.35 };
  const board = noticeBoard(); board.position.set(BOARD.x, groundAt(BOARD.x, BOARD.z), BOARD.z); board.rotation.y = BOARD.rot; scene.add(board);
  const boardFront = { x: BOARD.x + Math.sin(BOARD.rot) * 0.5, z: BOARD.z + Math.cos(BOARD.rot) * 0.5 };
  interactables.push({ id: 'thing-board', kind: 'station', thing: 'board', position: boardFront, markerY: groundAt(BOARD.x, BOARD.z) + 2.3, prompt: () => 'E — read the notice board', interact() {} });
  const colliders = [{ x: BOARD.x - Math.cos(BOARD.rot) * 0.75, z: BOARD.z + Math.sin(BOARD.rot) * 0.75, r: 0.12 }, { x: BOARD.x + Math.cos(BOARD.rot) * 0.75, z: BOARD.z - Math.sin(BOARD.rot) * 0.75, r: 0.12 }];

  // ---- The glowing specks, after the storm
  const specks = speckCloud(SPECKS_AT, groundAt); scene.add(specks.pts);
  const story = deps.story;
  const speckOn = () => !!(story && story.check('flag:stormNight'));
  interactables.push({ id: 'thing-specks', kind: 'station', thing: 'specks', position: SPECKS_AT, get markerY() { return groundAt(SPECKS_AT.x, SPECKS_AT.z) + 0.6; }, get enabled() { return speckOn(); }, prompt: () => 'E — look closely at the sand', interact() {} });

  const circles = people.map(() => ({ x: 0, z: 0, r: 0.3, person: true }));
  return {
    interactables,
    colliders() { people.forEach((p, i) => { circles[i].x = p.member.x; circles[i].z = p.member.z; circles[i].r = p.member.hidden ? 0 : 0.3; }); return colliders.concat(circles); },
    // For the story runtime: where a character or a thing is right now.
    where: { buddy: bayu.member, younger: tia.member, board: BOARD, specks: SPECKS_AT },
    update(dt, elapsed, pl, night) {
      specks.pts.visible = night > 0.5 && speckOn() && Math.hypot(pl.position.x - SPECKS_AT.x, pl.position.z - SPECKS_AT.z) < 90;
      if (specks.pts.visible) specks.mat.uniforms.uTime.value = elapsed;
      for (const p of people) {
        const m = p.member, g = p.figure.group;
        if (p.react) { p.react.t += dt; if (p.react.t >= p.react.dur) p.react = null; }
        const gesture = p.react ? { name: p.react.name, u: p.react.t / p.react.dur } : null;
        if (crowd.drive(m, dt)) {
          g.visible = !m.hidden;
          g.position.set(m.x, groundAt(m.x, m.z) + liftFor(p.figure, m.opts), m.z);
          let d = m.rot - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * (1 - Math.exp(-dt * 10));
          p.figure.animate(m.speed, elapsed, { ...m.opts, gesture, look: m.talk ? pl.position : undefined, mood: m.talk ? 'happy' : undefined });
        } else {
          // At home by the tent: Bayu chats, Tia sits practising knots.
          m.x = p.home.x; m.z = p.home.z;
          g.visible = true; g.position.set(m.x, groundAt(m.x, m.z) + (p.pose === 'write' ? -p.figure.sitDrop : 0), m.z);
          let d = p.home.rot - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * (1 - Math.exp(-dt * 8));
          p.figure.animate(0, elapsed, { pose: p.pose === 'write' ? 'write' : 'explain', sitGround: p.pose === 'write', gesture, look: p === bayu ? tia.member : bayu.member });
        }
      }
      void ui;
    },
  };
}
