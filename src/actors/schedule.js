// The camp timetable. The day is split into blocks; in some of them everyone gathers in one
// place (exercise, the flag ceremony, lunch, the evening campfire, bed), and in the others
// each group gets on with its own activity.
import { resolveCollisions } from '../logic/collision.js';
import { getColliders, COTTAGES, toWorld, allBeds, VILLAGE_FIRE, FLAGPOLE, BELL, LANTERNS, CAT_SPOT } from '../logic/layout.js';

// Times are fractions of a day (0 = midnight). Lights-out wraps past midnight.
export const BLOCKS = [
  { id: 'exercise', from: 0.10, to: 0.17, label: 'Morning exercise', note: 'Everyone warms up together' },
  { id: 'ceremony', from: 0.17, to: 0.27, label: 'Flag ceremony', note: 'The whole camp stands for the flag' },
  { id: 'work', from: 0.27, to: 0.40, label: 'Skills and lessons', note: 'Patrols practise their scoutcraft' },
  { id: 'lunch', from: 0.40, to: 0.50, label: 'Lunch', note: 'Everyone eats by the food tent' },
  { id: 'free', from: 0.50, to: 0.76, label: 'Games and free time', note: 'Tag, catch, tug-of-war and the flying fox' },
  { id: 'campfire', from: 0.76, to: 0.90, label: 'Campfire night', note: 'Songs and stories round the big fire' },
  { id: 'sleep', from: 0.90, to: 0.10, label: 'Lights out', note: 'Two scouts keep the night watch' },
];
// What you can do to join in with each part of the day (F).
export const JOIN = {
  exercise: { verb: 'join the exercise', pose: 'jacks' },
  ceremony: { verb: 'salute the flag', pose: 'salute' },
  work: { verb: 'sit and practise knots', pose: 'write', sit: true },
  lunch: { verb: 'sit down and eat', pose: 'eat', sit: true },
  free: { verb: 'cheer', pose: 'jacks' },
  campfire: { verb: 'sit and sing along', pose: 'clap', sit: true },
};
export function blockAt(t) {
  for (const b of BLOCKS) if (b.from < b.to ? t >= b.from && t < b.to : t >= b.from || t < b.to) return b;
  return BLOCKS[4];
}
export function blockProgress(b, t) {
  const span = b.from < b.to ? b.to - b.from : 1 - b.from + b.to;
  const into = t >= b.from ? t - b.from : 1 - b.from + t;
  return Math.min(1, Math.max(0, into / span));
}

// ---- Where people stand ------------------------------------------------------
const FORM = { x: 8.5, z: 17.3 };                       // middle of the parade formation
const flagDist = Math.hypot(FLAGPOLE.x - FORM.x, FLAGPOLE.z - FORM.z);
const FWD = { x: (FLAGPOLE.x - FORM.x) / flagDist, z: (FLAGPOLE.z - FORM.z) / flagDist }; // toward the flag
const WID = { x: -FWD.z, z: FWD.x };
const FACE_FLAG = Math.atan2(FWD.x, FWD.z);
const at = (f, w) => ({ x: FORM.x + FWD.x * f + WID.x * w, z: FORM.z + FWD.z * f + WID.z * w });

// Rows of eight, facing the flag.
const formation = (i) => ({ ...at((1.5 - Math.floor(i / 8)) * 1.15, ((i % 8) - 3.5) * 1.05), rot: FACE_FLAG });
const leaderSpot = { ...at(4.5, 0), rot: FACE_FLAG + Math.PI };
const staffRow = (k) => ({ ...at(4.1, (k % 2 ? 1 : -1) * (1.5 + Math.floor(k / 2) * 1.0)), rot: FACE_FLAG + Math.PI });

// Rings round the big fire, leaving out anything already standing there.
const fireSpots = (() => {
  const blocked = [{ ...FLAGPOLE, r: 1.0 }, { ...BELL, r: 1.3 }, { ...CAT_SPOT, r: 0.9 }, ...LANTERNS.map((l) => ({ ...l, r: 0.8 })), { x: VILLAGE_FIRE.x - 3.4, z: VILLAGE_FIRE.z + 3.6, r: 1.0 }];
  const taken = [150, 30, 205, 262, 318, 92]; // the two log seats and the four scouts who are always there
  const out = [];
  for (const [radius, stepDeg] of [[3.15, 20], [4.25, 18], [5.35, 15], [6.45, 12.5]]) {
    for (let a = 0; a < 360; a += stepDeg) {
      if (radius < 3.5 && taken.some((t) => Math.abs(((a - t + 540) % 360) - 180) < 14)) continue;
      const p = { x: VILLAGE_FIRE.x + Math.cos((a * Math.PI) / 180) * radius, z: VILLAGE_FIRE.z + Math.sin((a * Math.PI) / 180) * radius };
      if (blocked.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < b.r)) continue;
      out.push({ ...p, rot: Math.atan2(VILLAGE_FIRE.x - p.x, VILLAGE_FIRE.z - p.z) });
    }
  }
  return out;
})();
const storyteller = { x: VILLAGE_FIRE.x + 2.2, z: VILLAGE_FIRE.z - 0.6, rot: Math.atan2(-2.2, 0.6) + Math.PI };

// Lunch: little circles on the grass round the food tent.
const lunchSpots = (() => {
  const out = [];
  for (const c of [{ x: 15.2, z: 20.6 }, { x: 6, z: 23 }, { x: 21.5, z: 25.3 }, { x: 20.6, z: 21.0 }, { x: 4, z: 19 }, { x: 23.8, z: 28.6 }])
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + c.x; const p = { x: c.x + Math.cos(a) * 1.25, z: c.z + Math.sin(a) * 1.25 }; out.push({ ...p, rot: Math.atan2(c.x - p.x, c.z - p.z) }); }
  return out;
})();
const lunchStaff = (k) => ({ x: 12.4 + k * 0.9, z: 20.9 - (k % 2) * 0.7, rot: 0.4 + k * 0.5 });
// Lessons: rows sitting in front of the headquarters tent.
const classSpot = (i) => ({ x: 9.4 + (i % 5) * 1.05, z: -2.6 + Math.floor(i / 5) * 1.1, rot: Math.PI });
// Where each joinable activity happens, so F is only offered (and only works) when you are near it.
// 'free' has no single spot (everyone is scattered over the island), so it offers no F.
const LUNCH_CIRCLES = [{ x: 15.2, z: 20.6 }, { x: 6, z: 23 }, { x: 21.5, z: 25.3 }, { x: 20.6, z: 21.0 }, { x: 4, z: 19 }, { x: 23.8, z: 28.6 }];
const JOIN_AT = {
  exercise: { at: [FORM], r: 10 },
  ceremony: { at: [FORM], r: 10 },
  work: { at: [{ x: 11.5, z: -2.1 }], r: 9 },
  lunch: { at: LUNCH_CIRCLES, r: 8 },
  campfire: { at: [VILLAGE_FIRE], r: 10 },
};
export function nearJoinSpot(id, x, z) {
  const j = JOIN_AT[id];
  return !!j && j.at.some((p) => Math.hypot(x - p.x, z - p.z) <= j.r);
}
// Bed: a camp bed each in the patrol tents for scouts, and in the staff tent for the teachers.
const beds = allBeds();
const scoutBeds = beds.filter((b) => !b.staff && !b.yours), staffBeds = beds.filter((b) => b.staff);
const bedSpot = (b) => ({ x: b.x, z: b.z, rot: b.rot, via: b.door, pose: 'sleep', lie: true });
// How far to raise or lower someone for what they are doing: sitting on the ground, or lying on a bed.
export const liftFor = (figure, opts) => (opts.sitGround ? -figure.sitDrop : opts.lie ? 0.2 : 0);

// ---- Pressing E on a person: they stop, turn to you, wait a while, then carry on ---------------
// `talkTo(member, player.position)` starts it; crowd.drive then holds the member still (and returns true so the
// owner skips its own movement) until the time is up. Nothing else about the member changes, so the schedule
// spot, the half-finished walk and the activity are all picked up again where they were.
export const talkTime = (chars = 0) => 2.5 + Math.random() * 1.5 + Math.min(2.5, chars / 40); // 2.5-4 s, longer for a speech bubble
export function talkTo(m, toward, dur = talkTime()) { m.talk = { t: 0, dur, to: toward }; m.go = 0; }
const talkOpts = (m) => {
  const s = m.arrived && m.spot;
  if (s) return s.lie ? { pose: 'sleep', lie: true } : s.sitGround ? { sitGround: true } : { pose: 'explain' };
  return m.restOpts || { pose: 'explain' };
};

const GAMES = new Set(['tag', 'catch', 'tug']);
const ALWAYS_AT_WORK = { exercise: new Set(['cook']), lunch: new Set(['cook', 'eater']), campfire: new Set(['firecircle', 'watch']), sleep: new Set(['watch']) };

export function createCrowd() {
  const members = [];
  const colliders = getColliders();
  let block = BLOCKS[4], progress = 0, started = false;

  // Decides where a member should be for the current block: a spot, or null for "your own activity".
  function assign() {
    let n = 0, staff = 0, cls = 0, lunchKid = 0, lunchAdult = 0, fire = 0, bed = 0, staffBed = 0;
    for (const m of members) {
      const id = block.id, stay = ALWAYS_AT_WORK[id] && ALWAYS_AT_WORK[id].has(m.role);
      let spot = null;
      if (stay || id === 'free') spot = null;
      else if (id === 'exercise' || id === 'ceremony') {
        const leads = (id === 'exercise' && m.role === 'trainer') || (id === 'ceremony' && m.role === 'chief');
        spot = leads ? { ...leaderSpot, lead: true } : m.adult ? staffRow(staff++) : formation(n++);
      } else if (id === 'work') { if (GAMES.has(m.role)) spot = { ...classSpot(cls++), pose: 'write', sitGround: true }; }
      else if (id === 'lunch') spot = m.adult ? { ...lunchStaff(lunchAdult++), pose: 'eat' } : { ...lunchSpots[lunchKid++ % lunchSpots.length], pose: 'eat', sitGround: true };
      else if (id === 'campfire') spot = m.role === 'chief' ? { ...storyteller, pose: 'explain', lead: true } : { ...fireSpots[fire++ % fireSpots.length], pose: 'clap', sitGround: true };
      else if (id === 'sleep') spot = bedSpot(m.adult ? staffBeds[staffBed++ % staffBeds.length] : scoutBeds[bed++ % scoutBeds.length]);
      m.spot = spot; m.arrived = false; m.travel = 0; m.stuck = 0; m.pastDoor = false;
      // Someone whose home is at the end of a trail walks back along it before heading for the spot.
      m.legs = null; m.legsHome = false;
      if (spot && m.home && m.home.route && Math.hypot(m.x - m.home.x, m.z - m.home.z) < 30) setLegs(m, m.home.route.slice().reverse());
    }
  }

  // Waypoints to walk through first (a trail): from the one nearest to where they stand on.
  function setLegs(m, pts) {
    let k = 0, best = Infinity;
    pts.forEach((p, i) => { const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < best) { best = d; k = i; } });
    m.legs = pts.slice(k); m.legsLen = 0;
    for (let i = 0; i < m.legs.length; i++) { const a = i ? m.legs[i - 1] : m; m.legsLen += Math.hypot(m.legs[i].x - a.x, m.legs[i].z - a.z); }
  }

  // What someone standing in the formation is doing right now.
  function formationPose(m) {
    if (block.id === 'exercise') return { pose: 'jacks' };
    if (m.spot.lead) return { pose: progress < 0.3 ? 'command' : progress < 0.85 ? 'salute' : 'attention' };
    return { pose: progress < 0.3 || progress > 0.85 ? 'attention' : 'salute' };
  }

  function walk(m, goal, dt, hurry) {
    // Into a tent: go to the flap first, then straight in to the bed.
    // Along a trail first (m.legs), then into a tent by its flap, then to the spot.
    const leg = m.legs && m.legs.length ? m.legs[0] : null;
    const viaDoor = !leg && goal.via && !m.pastDoor, target = leg || (viaDoor ? goal.via : goal);
    const dx = target.x - m.x, dz = target.z - m.z, d = Math.hypot(dx, dz);
    if (leg && d < 0.8) { m.legs.shift(); return false; }
    if (d < 0.18 || (viaDoor && d < 0.5)) { if (viaDoor) { m.pastDoor = true; return false; } m.go = 0; return true; }
    m.travel += dt;
    // A long way to go, or badly stuck: just get there rather than wander forever (a trail walk gets its length's worth of time).
    if (m.travel > 20 + (m.legs ? m.legsLen / 0.85 : 0) || m.stuck > 4) { m.x = goal.x; m.z = goal.z; m.pastDoor = true; m.legs = null; return true; } // straight to the spot itself (a bed, not the tent flap outside it)
    // Everyone has their own pace, gets going gradually and slows as they arrive.
    const pace = 0.88 + ((m.index * 37) % 25) / 100;
    m.go = (m.go || 0) + (1 - (m.go || 0)) * (1 - Math.exp(-dt * 2.5));
    const cruise = (hurry ? 3.6 : 1.05) * (m.adult ? (hurry ? 0.9 : 1.05) : 1) * pace * Math.max(0.25, m.go) * Math.min(1, 0.4 + d / 1.8);
    const speed = Math.min(cruise, d / Math.max(dt, 1e-3));
    let nx = dx / d, nz = dz / d;
    if (m.stuck > 0.6) { const side = m.index % 2 ? 1 : -1; const ox = -nz * side, oz = nx * side; nx = nx * 0.3 + ox; nz = nz * 0.3 + oz; const l = Math.hypot(nx, nz); nx /= l; nz /= l; }
    const want = { x: m.x + nx * speed * dt, z: m.z + nz * speed * dt };
    // Near the end, walk straight in; a spot may sit close to a wall or inside a tent.
    const next = (!leg && d < 1.4) || (goal.via && m.pastDoor) ? want : resolveCollisions(want, 0.3, colliders);
    const moved = Math.hypot(next.x - m.x, next.z - m.z);
    m.stuck = moved < speed * dt * 0.35 ? m.stuck + dt : Math.max(0, m.stuck - dt * 2);
    m.rot = Math.atan2(next.x - m.x, next.z - m.z) || m.rot;
    m.x = next.x; m.z = next.z; m.speed = dt > 0 ? moved / dt : 0;
    return false;
  }

  return {
    get block() { return block; },
    get members() { return members; },
    // home: where the member's own activity happens ({x, z, rot}), or null for someone who roams.
    // home.route (optional): waypoints from the camp out to home (a trail), walked both ways.
    join({ home = null, role = 'scout', adult = false }) {
      const m = { pastDoor: false, index: members.length, home, role, adult, x: home ? home.x : 0, z: home ? home.z : 0, rot: home ? home.rot : 0, speed: 0, opts: {}, hidden: false, controlled: false, spot: null, arrived: false, travel: 0, stuck: 0 };
      members.push(m);
      return m;
    },
    tick(nextBlock, nextProgress) {
      progress = nextProgress;
      if (nextBlock !== block) {
        block = nextBlock; assign();
        // The game opened part-way through a block (a saved clock, ?t=): everyone has "already" taken
        // their place, rather than strolling in from home while the block is half over.
        if (!started && progress > 0.15) for (const m of members) if (m.spot) { m.x = m.spot.x; m.z = m.spot.z; m.rot = m.spot.rot; m.arrived = true; m.pastDoor = true; m.controlled = true; }
      }
      started = true;
    },
    // Moves one member for this frame. Returns true while the timetable is in charge of them.
    drive(m, dt) {
      m.speed = 0; m.opts = {};
      if (m.talk) {
        if ((m.talk.t += dt) < m.talk.dur) {
          m.go = 0; m.opts = talkOpts(m);
          if (!m.opts.lie) { let d = Math.atan2(m.talk.to.x - m.x, m.talk.to.z - m.z) - m.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); m.rot += d * (1 - Math.exp(-dt * 8)); }
          return true;
        }
        m.talk = null;
      }
      if (m.spot) {
        m.controlled = true;
        if (!m.arrived) { m.hidden = false; m.arrived = walk(m, m.spot, dt, block.id === 'ceremony' || block.id === 'exercise'); if (m.arrived) m.rot = m.spot.rot; }
        if (m.arrived) {
          m.rot = m.spot.rot; m.hidden = !!m.spot.hide;
          m.opts = block.id === 'exercise' || block.id === 'ceremony' ? formationPose(m) : { pose: m.spot.pose, sitGround: !!m.spot.sitGround, lie: !!m.spot.lie };
        }
        return true;
      }
      m.hidden = false;
      // Back to their own activity: walk home first, then hand over.
      if (m.controlled && m.home) {
        if (m.home.route && !m.legsHome) { m.legsHome = true; setLegs(m, m.home.route); }
        if (!walk(m, m.home, dt, false)) return true;
        m.rot = m.home.rot;
      }
      m.controlled = false; m.travel = 0; m.stuck = 0; m.legs = null; m.legsHome = false;
      return false;
    },
  };
}
