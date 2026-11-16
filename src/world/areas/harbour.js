// The harbour: the long pier on the east beach (DOCK in src/logic/layout.js is its walkable deck), its
// props and lamps, and the passenger ferry that brings you to the island.
//
// The ferry is moored along the outer part of the pier, its gangway down onto the deck, from the start
// of a journey until dusk on day 1; then it casts off and sails out to sea. "Explore freely" has no ferry.
// While it is moored, its deck and gangway are walkable platforms. It never leaves while you are aboard.
// A journey starts at ARRIVAL: at the top of the gangway, facing the island (see begin() in src/main.js).
import * as THREE from 'three';
import { stick, mergeStatic } from '../build.js';
import { DOCK, platformUnder } from '../../logic/layout.js';
import { buildDock, buildDockProps, buildFerry, buildGangway, lampPost, LAMP_GLASS } from '../../kit/harbour.js';

const dir = { x: Math.sin(DOCK.rot), z: Math.cos(DOCK.rot) };
// A point in the pier's own frame (x across it, toward the far side from the ferry; z out along it) as a world point.
const toWorld = (lx, lz) => ({ x: DOCK.x + dir.x * lz + dir.z * lx, z: DOCK.z + dir.z * lz - dir.x * lx });

// Where the ferry lies, in the pier's frame: alongside the outer part, a short gangway's length off the deck.
const FERRY = { x: -6.65, z: 15.2 };
const GANG = { x0: FERRY.x + 1.7, x1: -1.45 };   // the gangway runs from the ferry's side (high) to the deck (low)
const DUSK = 0.8;                                // the ferry casts off once the day gets this late (see nightFactor)
const SHOW_WITHIN = 90;                          // not drawn when you are further off than this

// Where a journey begins: on the ferry at the top of the gangway, looking down it at the pier and the island.
const start = toWorld(FERRY.x + 1.75, FERRY.z);
export const ARRIVAL = { x: start.x, z: start.z, yaw: DOCK.rot + 0.35, look: toWorld(1.5, 10) };

export function create(scene, { keepClear, addPlatform, removePlatform, dayTime, say }) {
  keepClear(DOCK.x - dir.x * 2, DOCK.z - dir.z * 2, 6); // no palms or bushes on the pier's shore end
  // Everything is laid out in the pier's frame.
  const frame = new THREE.Group(); frame.position.set(DOCK.x, 0, DOCK.z); frame.rotation.y = DOCK.rot; scene.add(frame);

  // ---- The pier and everything on it: welded into one mesh per colour (a handful of draws for the lot).
  const pier = new THREE.Group(); frame.add(pier);
  const deck = buildDock(DOCK.length, DOCK.width); pier.add(deck.group);
  // A row of cargo along the far edge, from the shore end out: crates, barrels, luggage, a lamp, the blank board, a hand cart.
  const props = buildDockProps(); props.group.position.set(1.0, DOCK.top, 9.2); props.group.rotation.y = -Math.PI / 2; pier.add(props.group);
  // More lamp posts along the pier, their lanterns hanging over the deck.
  const lamps = [[-1.45, 1.2, 0], [-1.45, 8.0, 0], [1.45, 19.2, Math.PI]].map(([x, z, ry]) => { const l = lampPost(x, z, ry); l.position.y = DOCK.top; pier.add(l); return { x, z }; });
  frame.updateMatrixWorld(true);
  // Solid things on the pier, as world colliders (read before the props are welded, while they still have their frames).
  const colliders = [];
  const yawOf = (o) => { let r = 0; for (let p = o; p && p !== scene; p = p.parent) r += p.rotation.y; return r; };
  const v = new THREE.Vector3();
  const place = (obj, c) => { v.set(c.x, 0, c.z).applyMatrix4(obj.matrixWorld); return c.r !== undefined ? { x: v.x, z: v.z, r: c.r } : { x: v.x, z: v.z, hw: c.hw, hd: c.hd, rot: yawOf(obj) + (c.rot || 0) }; };
  for (const c of deck.colliders) colliders.push(place(deck.group, c));
  for (const c of props.colliders) colliders.push(place(props.group, c));
  for (const l of lamps) { const p = toWorld(l.x, l.z); colliders.push({ x: p.x, z: p.z, r: 0.15 }); }
  mergeStatic(pier);

  // ---- The ferry, the gangway and two mooring lines. Only the hull and cabin cast shadows.
  const ferry = buildFerry(); ferry.group.position.set(FERRY.x, 0, FERRY.z); frame.add(ferry.group);
  const moor = new THREE.Group(); frame.add(moor);
  const gang = buildGangway(GANG.x1 - GANG.x0); gang.group.position.set((GANG.x0 + GANG.x1) / 2, 0, FERRY.z); gang.group.rotation.y = Math.PI / 2; moor.add(gang.group);
  const ROPE = 0xd8c08a;
  for (const [a, b] of [[[FERRY.x + 0.7, 1.44, FERRY.z + 4.4], [-1.55, 1.05, 18.5]], [[FERRY.x + 0.9, 1.44, FERRY.z - 6.1], [-1.55, 1.05, 12]]]) {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.3, (a[2] + b[2]) / 2];
    moor.add(stick(a, mid, 0.03, ROPE, 5), stick(mid, b, 0.03, ROPE, 5));
  }
  mergeStatic(moor);
  for (const m of moor.children) m.castShadow = false;
  frame.updateMatrixWorld(true);
  const ferryColliders = ferry.colliders.map((c) => place(ferry.group, c));
  // The walkable deck and gangway, registered while the ferry is moored. Their tops follow the bob.
  const deckShapes = ferry.platforms.map((p) => { const w = toWorld(FERRY.x + p.x, FERRY.z + p.z); return { shape: 'box', x: w.x, z: w.z, rot: DOCK.rot, hw: p.hw, hd: p.hd, top: p.top, surface: 'wood', id: 'ferry-deck' }; });
  const gangShape = { shape: 'strip', a: toWorld(GANG.x0, FERRY.z), b: toWorld(GANG.x1, FERRY.z), width: 1.1, y0: ferry.deckY, y1: DOCK.top, surface: 'wood', id: 'gangway' };
  const centre = toWorld(FERRY.x, FERRY.z);
  let live = [];        // the registered platforms
  let state = 'off';    // off (no ferry) | moored | leaving | gone
  let lastT = null, sail = 0, speed = 0;
  ferry.group.visible = moor.visible = false;

  const aboard = (p) => { const u = platformUnder(p.x, p.z); return !!u && live.includes(u.p); };
  function moorUp() {
    state = 'moored'; ferry.group.visible = moor.visible = true;
    live = [...deckShapes.map((s) => addPlatform({ ...s })), addPlatform({ ...gangShape })];
  }
  function castOff(player) {
    for (const q of live) removePlatform(q);
    live = []; moor.visible = false; state = 'leaving'; sail = 0; speed = 0;
    if (Math.hypot(player.position.x - centre.x, player.position.z - centre.z) < SHOW_WITHIN) say('The ferry toots goodbye and heads back to the mainland.', '⛴️');
  }

  return {
    // Called from begin() in src/main.js: a journey arrives by ferry.
    begin(mode) { if (mode === 'journey' && state === 'off') moorUp(); },
    colliders: () => (state === 'moored' ? colliders.concat(ferryColliders) : colliders),
    update(dt, elapsed, player, night) {
      LAMP_GLASS.emissiveIntensity = night * 2.4;
      if (state === 'off' || state === 'gone') return;
      const t = dayTime(), wrapped = lastT !== null && t < lastT - 0.5; lastT = t;
      const far = Math.hypot(player.position.x - centre.x, player.position.z - centre.z) > SHOW_WITHIN;
      if (state === 'moored') {
        // Dusk on the first day, or past midnight somehow (asleep): time to go, once nobody is aboard.
        if ((t >= DUSK || wrapped) && !aboard(player.position)) castOff(player);
        else {
          ferry.group.visible = moor.visible = !far;
          if (!far) ferry.update(dt, elapsed);
          const bob = ferry.body.position.y;
          for (let i = 0; i < deckShapes.length; i++) live[i].top = ferry.deckY + bob;
          live[deckShapes.length].y0 = ferry.deckY + bob;
          return;
        }
      }
      // Leaving: gathering speed straight out to sea, easing away from the pier, then gone once well out or out of sight.
      speed = Math.min(4, speed + dt * 0.25); sail += speed * dt;
      ferry.group.position.set(FERRY.x - sail * 0.12, 0, FERRY.z + sail); ferry.group.rotation.y = -Math.min(0.25, sail * 0.006);
      ferry.update(dt, elapsed);
      if (far || sail > 110) { state = 'gone'; ferry.group.visible = false; }
    },
  };
}
