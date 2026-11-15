// Every tunable number and the palette. Units: metres, seconds. y is up, sea level is y = 0.

export const SEED = 1337;

// Island shape
export const ISLAND_RADIUS = 60;
export const GRASS_RADIUS = 48;
export const SEA_FLOOR_RADIUS = 75;
export const GRASS_HEIGHT = 1.2;
export const HILL = { x: -18, z: -22, radius: 22, height: 8 };
export const MAX_WADE_DEPTH = 0.45;
export const MIN_WADE_SPEED = 0.35;

export const PALETTE = {
  grass: 0xb2e29a,
  grassDark: 0x9dd68a,
  grassHill: 0xc9eaa8,
  sand: 0xfaf0d4,
  sandWet: 0xeedfb8,
  path: 0xf1dfbd,
  water: 0x6fcfd0,
  waterDeep: 0x3fa7b8,
  foam: 0xffffff,
  wood: 0xb98a5e,
  woodDark: 0x8c6444,
  stone: 0xc9c5c0,
  stoneDark: 0xa9a6a6,
  trunk: 0xb08663,
  leafA: 0x8fd69a,
  leafB: 0x9bd67a,
  leafC: 0x74c4a0,
  blossom: 0xf7b7cf,
  // Traditional wooden houses: plank walls in warm wood tones under thatched roofs.
  walls: [0xc79d6e, 0xb88a5e, 0xd2ab7c, 0xc29469, 0xad8158, 0xcba373],
  roofs: [0xdcb970, 0xd3ab62, 0xe2c480, 0xd8b268, 0xcfa65c, 0xe0be78],
  thatchDark: 0xb88f4c,
  tents: [0xf3e6c8, 0xe9a27a, 0xe8c66a],
  flowers: [0xff9db5, 0xfff07a, 0xffffff, 0xc9a6ff, 0xffb86b],
  villagers: [0xf6a6b2, 0xa6d8f6, 0xf9dc8b, 0xc3b1f2, 0xa8e3c0, 0xf7b98b],
  player: 0xff8f6b,
  windowGlow: 0xffd68a,
  lantern: 0xffc97a,
  fire: 0xff9a4a,
};

// Day cycle. Time of day is a fraction in [0, 1), 0 = midnight.
export const DAY_LENGTH = 480;
export const START_TIME = 0.69;

// Player and camera
export const WALK_SPEED = 3.5;
export const RUN_SPEED = 7;
export const HOP_VELOCITY = 4.5;
export const GRAVITY = 14;
export const PLAYER_RADIUS = 0.35;
export const PLAYER_START = { x: 10, z: 14 };
export const MAX_DT = 0.05;
export const CAMERA = { distance: 7, minDistance: 4, maxDistance: 11, minPitch: 10, maxPitch: 60 }; // degrees

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
