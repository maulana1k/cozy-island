// Every tunable number and the palette. Units: metres, seconds. y is up, sea level is y = 0.

export const SEED = 1337;

// Island shape
export const ISLAND_RADIUS = 60;
export const GRASS_RADIUS = 48;
export const SEA_FLOOR_RADIUS = 75;
export const GRASS_HEIGHT = 1.2;
// A big hill with a level summit, a lower shoulder beside it, and a steep seaward face.
export const HILL = { x: -18, z: -22, radius: 30, height: 13, plateau: 6.5 };
export const SHOULDER = { x: -37, z: -3, radius: 12, height: 4.5 };
// The trail that winds up the hill. A level bed is cut into the hillside along it.
// It starts at the camp side and winds two-thirds of the way round the hill, behind it and up
// the far side, gaining height evenly all the way, so it is an easy walk for short legs.
export const HILL_TRAIL = (() => {
  const s = (t) => t * t * (3 - 2 * t), span = HILL.radius - HILL.plateau;
  const pAt = (d) => s(Math.min(1, Math.max(0, 1 - (d - HILL.plateau) / span)));
  const start = { x: 1, z: -2 }, d0 = Math.hypot(start.x - HILL.x, start.z - HILL.z), a0 = Math.atan2(start.z - HILL.z, start.x - HILL.x);
  const dEnd = HILL.plateau + 1, turn = -4.3, N = 18;
  const f0 = pAt(d0) ** 1.2, f1 = pAt(dEnd) ** 1.2;
  const out = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = (f0 + (f1 - f0) * u) ** (1 / 1.2);
    let lo = dEnd, hi = d0; // find the distance from the top where the hill is this high
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (pAt(mid) > p) lo = mid; else hi = mid; }
    // It heads straight for the hill at first, clear of the headquarters tent, and only then starts to wind.
    const d = i === 0 ? d0 : (lo + hi) / 2, a = a0 + turn * u ** 1.5;
    out.push({ x: +(HILL.x + Math.cos(a) * d).toFixed(2), z: +(HILL.z + Math.sin(a) * d).toFixed(2) });
  }
  return out;
})();
// Behind the hill the island runs on into a wide wild jungle, far bigger than the camp's corner
// of it. There is no fence: the trees simply close in. Past `border` (metres from the middle of
// camp) a warning shows; nobody gets more than `limit` metres beyond that. `trees` is where the
// big jungle trees begin, and `blend` rounds the two parts of the coast into one outline.
export const WILD = { x: -70, z: -86, radius: 84, border: 70, limit: 12, trees: 55, blend: 30 };
export const MAX_WADE_DEPTH = 0.45;
// A shallow pond you can wade right across, and a knoll the windmill stands on.
export const POND = { x: -26, z: 12, rw: 6, bank: 4, depth: 0.4 };
export const KNOLL = { x: 30, z: -22, r: 11, height: 1.4 };
// The camp itself stays level; the land rolls gently further out.
export const CAMP_FLAT = { x: 10, z: 8, inner: 20, outer: 34 };
export const MIN_WADE_SPEED = 0.35;

export const PALETTE = {
  grass: 0xe6c56f,
  grassDark: 0xd9b45c,
  grassHill: 0xedd183,
  sand: 0xf4dfb4,
  sandWet: 0xe9cfa0,
  path: 0xf6e2b0,
  water: 0x8cc3d2,
  waterDeep: 0x5a8fb6,
  foam: 0xffffff,
  wood: 0xb98a5e,
  woodDark: 0x8c6444,
  stone: 0xbdb4bb,
  stoneDark: 0xa198a6,
  trunk: 0xb08663,
  leafA: 0x8fd69a,
  leafB: 0x9bd67a,
  leafC: 0x74c4a0,
  blossom: 0xf7b7cf,
  // Traditional wooden houses: plank walls in warm wood tones under thatched roofs.
  walls: [0xc79d6e, 0xb88a5e, 0xd2ab7c, 0xc29469, 0xad8158, 0xcba373],
  roofs: [0xd9634a, 0x5fa8a0, 0xcf5a45, 0xe07a4f, 0x4f9aa6, 0xd4694c],
  thatchDark: 0xb88f4c,
  tents: [0xf3e6c8, 0xe9a27a, 0xe8c66a],
  flowers: [0xe8503a, 0x5b6fe0, 0xe8503a, 0xffffff, 0xffd75a],
  treeTrunk: 0x7c6b5c,
  villagers: [0xf6a6b2, 0xa6d8f6, 0xf9dc8b, 0xc3b1f2, 0xa8e3c0, 0xf7b98b],
  player: 0xf2785a,
  windowGlow: 0xffd68a,
  lantern: 0xffc97a,
  fire: 0xff9a4a,
};

// Day cycle. Time of day is a fraction in [0, 1), 0 = midnight.
export const DAY_LENGTH = 480;
export const START_TIME = 0.64;

// Player and camera
export const WALK_SPEED = 1.9;
export const RUN_SPEED = 3.9; // a child's run, not a sprinter's
export const HOP_VELOCITY = 5;
export const GRAVITY = 15;
export const PLAYER_RADIUS = 0.35;
export const PLAYER_START = { x: 10, z: 14 };
export const MAX_DT = 0.05;
export const CAMERA = { distance: 6.2, minDistance: 4, maxDistance: 11, minPitch: 10, maxPitch: 60 }; // degrees

// Interaction
export const INTERACT_RANGE = 2.2;
export const INTERACT_CLOSE = 0.8;
export const INTERACT_CONE = 0.2;

// Villagers
export const VILLAGER_COUNT = 6;
export const VILLAGER_SPEED = 1.2;
export const VILLAGER_RADIUS = 0.35;
export const VILLAGER_PAUSE = [2, 6];
export const NUDGE_DISTANCE = 1.2;
export const NUDGE_TIME = 0.4;
export const NUDGE_COOLDOWN = 1.5;
export const BELL_HEAR_RANGE = 25;
export const BELL_LOOK_TIME = 2;
export const MIN_DRY_HEIGHT = 0.3;
