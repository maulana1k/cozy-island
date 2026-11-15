// The flying fox: launch tower, cable, landing frame, and scouts who ride it and climb back up.
import * as THREE from 'three';
import { heightAt } from '../logic/terrain.js';
import { ZIPLINE, RIDER_ROUTE } from '../logic/layout.js';
import { createFigure } from '../actors/figure.js';
import { box, cyl, ball, stick, roofGeometry, shared } from './build.js';

const BAMBOO = 0xd8bb72, DARK = 0x5b5b63, ROPE = 0xe9dcc0;
const HANG = 0.86;         // how far a rider's feet hang below the cable
const PLATFORM = 2.7;      // height of the launch deck above the summit

export function createZipline(scene, deps) {
  const { ui, audio } = deps;
  const topY = heightAt(ZIPLINE.top.x, ZIPLINE.top.z), bottomY = heightAt(ZIPLINE.bottom.x, ZIPLINE.bottom.z);
  const A = new THREE.Vector3(ZIPLINE.top.x, topY + ZIPLINE.topHeight, ZIPLINE.top.z);
  const B = new THREE.Vector3(ZIPLINE.bottom.x, bottomY + ZIPLINE.bottomHeight, ZIPLINE.bottom.z);
  const length = A.distanceTo(B);
  const heading = Math.atan2(B.x - A.x, B.z - A.z);
  const dirX = Math.sin(heading), dirZ = Math.cos(heading);
  const root = new THREE.Group(); scene.add(root);

  // ---- Launch tower on the summit
  {
    const g = new THREE.Group(); g.position.set(A.x, topY - 0.02, A.z); g.rotation.y = heading; root.add(g);
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sz] of legs) g.add(stick([sx * 1.15, 0, sz * 1.15], [sx * 0.95, ZIPLINE.topHeight + 0.5, sz * 0.95], 0.07, BAMBOO));
    for (const y of [0.7, 1.7]) for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0]]) g.add(stick([legs[a][0] * 1.1, y, legs[a][1] * 1.1], [legs[b][0] * 1.05, y + 0.85, legs[b][1] * 1.05], 0.035, BAMBOO));
    g.add(box(2.3, 0.12, 2.3, 0xb98a5e, 0, PLATFORM, 0));
    for (const s of [-1, 1]) g.add(stick([s * 1.0, PLATFORM + 0.95, -1.0], [s * 1.0, PLATFORM + 0.95, 1.0], 0.03, BAMBOO), stick([-1.0, PLATFORM + 0.95, -1.0], [1.0, PLATFORM + 0.95, -1.0], 0.03, BAMBOO));
    g.add(stick([-1.05, ZIPLINE.topHeight + 0.35, 0], [1.05, ZIPLINE.topHeight + 0.35, 0], 0.07, BAMBOO)); // the beam the cable hangs from
    g.add(cyl(0.12, 0.12, 0.3, DARK, 0, ZIPLINE.topHeight + 0.1, 0, 8));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.8, 4), shared(0xe8503a)); cap.rotation.y = Math.PI / 4; cap.position.y = ZIPLINE.topHeight + 1.0; cap.castShadow = true; g.add(cap);
    // Ladder up the back, a helmet rack and a crate of harnesses at the foot
    g.add(stick([-0.28, 0, -1.55], [-0.28, PLATFORM, -1.2], 0.035, BAMBOO), stick([0.28, 0, -1.55], [0.28, PLATFORM, -1.2], 0.035, BAMBOO));
    for (let k = 1; k < 7; k++) g.add(stick([-0.28, k * 0.4, -1.55 + k * 0.05], [0.28, k * 0.4, -1.55 + k * 0.05], 0.022, BAMBOO, 5));
    g.add(stick([1.8, 0, -1.3], [1.8, 1.1, -1.3], 0.03, BAMBOO), stick([1.8, 0, -0.1], [1.8, 1.1, -0.1], 0.03, BAMBOO), stick([1.8, 1.05, -1.4], [1.8, 1.05, 0], 0.025, BAMBOO));
    [0xe8503a, 0xf2b63b, 0x4f7fc9].forEach((col, k) => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), shared(col)); h.position.set(1.8, 1.07, -1.15 + k * 0.45); g.add(h); });
    g.add(box(0.6, 0.45, 0.45, 0xc79a62, -1.8, 0.23, -0.9, 0.3));
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12), shared(ROPE)); coil.rotation.x = Math.PI / 2; coil.position.set(-1.8, 0.52, -0.9); g.add(coil);
  }
  // ---- Cable and safety line
  // A long cable hangs in a shallow curve rather than a straight line.
  const sagAt = (f) => ZIPLINE.sag * 4 * f * (1 - f);
  const curvePoints = (lift) => Array.from({ length: 33 }, (_, k) => { const f = k / 32; return new THREE.Vector3(A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f - sagAt(f) + lift, A.z + (B.z - A.z) * f); });
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePoints(0)), 64, 0.028, 6), shared(DARK)); cable.castShadow = true;
  root.add(cable, new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePoints(0.32)), 64, 0.012, 5), shared(ROPE)));
  // ---- Landing frame by the beach: an A-frame, a brake tyre, a crash mat and a bench
  {
    const g = new THREE.Group(); g.position.set(B.x, bottomY - 0.02, B.z); g.rotation.y = heading; root.add(g);
    for (const s of [-1, 1]) { g.add(stick([s * 1.5, 0, 0.3], [0, ZIPLINE.bottomHeight + 0.35, 0.3], 0.07, BAMBOO), stick([s * 1.2, 0, 1.6], [0, ZIPLINE.bottomHeight + 0.2, 0.3], 0.05, BAMBOO)); }
    g.add(stick([-0.85, 1.25, 0.3], [0.85, 1.25, 0.3], 0.04, BAMBOO), cyl(0.11, 0.11, 0.3, DARK, 0, ZIPLINE.bottomHeight, 0.3, 8));
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 8, 14), shared(0x3f3f46)); tyre.position.set(0, ZIPLINE.bottomHeight - 0.02, -0.5); g.add(tyre);
    const pad = box(2.6, 0.3, 3.6, 0x4f7fc9, 0, 0.17, -2.6); g.add(pad, box(2.6, 0.05, 0.5, 0xf2c94c, 0, 0.34, -1.2));
    g.add(box(1.5, 0.07, 0.36, 0xb98a5e, 2.6, 0.42, -1.5, 0.3), box(0.08, 0.4, 0.3, 0x8c6444, 2.1, 0.2, -1.65, 0.3), box(0.08, 0.4, 0.3, 0x8c6444, 3.1, 0.2, -1.35, 0.3));
    g.add(cyl(0.035, 0.04, 2.8, BAMBOO, -2.3, 1.4, 0.6));
    const pen = new THREE.Mesh(roofGeometry(0.5, 0.85, 0.02), shared(0xe8503a)); pen.rotation.z = -Math.PI / 2; pen.position.set(-2.25, 2.5, 0.6); g.add(pen);
  }

  const pointAt = (f, out) => { out.copy(A).lerp(B, f); out.y -= sagAt(f); return out; };
  // One ride down the cable: quick away, fast in the middle, braking into the frame.
  function advance(ride, dt) {
    ride.v = ride.f < 0.925 ? Math.min(12.5, ride.v + 4.5 * dt) : Math.max(2.4, ride.v - 15 * dt);
    ride.f = Math.min(1, ride.f + (ride.v * dt) / length);
    return ride.f >= 0.985;
  }
  const trolleyGeo = new THREE.BoxGeometry(0.16, 0.12, 0.3);
  const makeTrolley = () => { const t = new THREE.Group(); t.add(new THREE.Mesh(trolleyGeo, shared(DARK)), stick([0, -0.06, 0], [0, -0.32, 0], 0.012, ROPE), stick([-0.2, -0.32, 0], [0.2, -0.32, 0], 0.02, BAMBOO)); t.visible = false; t.rotation.y = heading; root.add(t); return t; };

  // ---- Scouts on a loop: queue, climb the tower, ride, land, walk back up the hill
  const landing = { x: B.x - dirX * 2.4, z: B.z - dirZ * 2.4 };
  const route = RIDER_ROUTE;
  const SKIN = [0xf1c7a0, 0x9a6a4a, 0xe6b48a, 0xc98d62], HELMET = [0xe8503a, 0xf2b63b, 0x4f7fc9, 0x3f8f6a];
  const riders = [0, 1, 2, 3, 4, 5].map((i) => {
    const figure = createFigure({ bodyColor: 0xd8c08a, neckerchief: HELMET[(i + 1) % 4], skinColor: SKIN[i % 4], hairColor: 0x3d3230, shortsColor: 0x5f7fa6, accent: 'cap', accentColor: HELMET[i % 4] });
    scene.add(figure.group);
    const r = { i, figure, trolley: makeTrolley(), state: 'walk', leg: 0, x: 0, z: 0, y: 0, rot: 0, t: 0, ride: null, cheer: 0 };
    // Start them spread out along the way back up, the first already waiting at the top.
    if (i === 0) { r.state = 'wait'; r.x = ZIPLINE.queue.x; r.z = ZIPLINE.queue.z; }
    else { r.leg = Math.min(route.length - 1, 1 + Math.floor(((i - 1) * (route.length - 1)) / 5)); r.x = route[r.leg - 1].x; r.z = route[r.leg - 1].z; }
    return r;
  });
  let launchTimer = 2, cableBusy = false, open = true;
  const tmp = new THREE.Vector3();

  // ---- The player's own ride
  const myTrolley = makeTrolley();
  let myRide = null;
  const interactables = [{
    id: 'zipline', kind: 'zipline', position: { x: A.x - dirX * 1.9, z: A.z - dirZ * 1.9 }, markerY: topY + 2.2,
    get enabled() { return !myRide; },
    prompt: () => 'E — ride the flying fox',
    interact() { myRide = { f: 0.02, v: 2.5 }; deps.player.riding = { heading }; audio.play('zip'); ui.emote(new THREE.Vector3(A.x, A.y + 0.6, A.z), 'star'); },
  }];

  return {
    interactables,
    // The flying fox only runs during lessons and free time.
    setOpen(on) { open = on; },
    update(dt, elapsed, player) {
      if (myRide) {
        const done = advance(myRide, dt);
        pointAt(myRide.f, tmp);
        player.position.set(tmp.x, tmp.y - HANG, tmp.z);
        myTrolley.visible = true; myTrolley.position.copy(tmp);
        if (done) { myRide = null; myTrolley.visible = false; player.position.set(landing.x, heightAt(landing.x, landing.z), landing.z); player.landNow(); }
      }

      launchTimer -= dt;
      for (const r of riders) {
        let speed = 0, opts = {};
        if (r.state === 'walk') {
          const target = route[r.leg], dx = target.x - r.x, dz = target.z - r.z, d = Math.hypot(dx, dz);
          if (d < 0.25) { r.leg++; if (r.leg >= route.length) { r.state = 'wait'; r.leg = 0; } }
          else { speed = 2.4; r.x += (dx / d) * speed * dt; r.z += (dz / d) * speed * dt; r.rot = Math.atan2(dx, dz); }
          r.y = heightAt(r.x, r.z);
        } else if (r.state === 'wait') {
          r.y = heightAt(r.x, r.z); r.rot = heading;
          if (open && launchTimer <= 0 && !cableBusy) { r.state = 'climb'; r.t = 0; cableBusy = true; launchTimer = 9; }
        } else if (r.state === 'climb') {
          // Up the ladder at the back of the tower and onto the deck.
          r.t += dt / 1.6;
          const k = Math.min(1, r.t), e = k * k * (3 - 2 * k);
          r.x = ZIPLINE.queue.x + (A.x - dirX * 0.4 - ZIPLINE.queue.x) * e; r.z = ZIPLINE.queue.z + (A.z - dirZ * 0.4 - ZIPLINE.queue.z) * e;
          r.y = topY + PLATFORM * e; r.rot = heading; speed = 1.2;
          if (k >= 1) { r.state = 'ride'; r.ride = { f: 0.02, v: 2.5 }; if (Math.hypot(player.position.x - A.x, player.position.z - A.z) < 18) audio.play('zip'); }
        } else if (r.state === 'ride') {
          const done = advance(r.ride, dt);
          pointAt(r.ride.f, tmp);
          r.x = tmp.x; r.z = tmp.z; r.y = tmp.y - HANG; r.rot = heading; opts = { pose: 'hang' };
          r.trolley.visible = true; r.trolley.position.copy(tmp);
          if (done) { r.state = 'landed'; r.t = 0; r.trolley.visible = false; cableBusy = false; r.x = landing.x; r.z = landing.z; r.y = heightAt(r.x, r.z); }
        } else if (r.state === 'landed') {
          // A cheer on the crash mat, then off back up the hill.
          r.t += dt; r.rot = heading + Math.PI;
          opts = { land: Math.max(0, 1 - r.t * 3), gesture: { name: 'cheer', u: Math.min(1, r.t / 1.3) } };
          if (r.t > 1.4) { r.state = 'walk'; r.leg = 0; }
        }
        r.figure.group.position.set(r.x, r.y, r.z);
        r.figure.group.rotation.y = r.rot;
        r.figure.animate(speed, elapsed, opts);
      }
    },
  };
}
