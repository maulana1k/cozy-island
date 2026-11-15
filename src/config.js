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
  grass: 0x9fd68a,
  grassDark: 0x86c878,
  grassHill: 0xb7e09a,
  sand: 0xfaf0d4,
  sandWet: 0xeedfb8,
  path: 0xdcc39a,
  water: 0x6fcfd0,
  waterDeep: 0x3fa7b8,
  foam: 0xffffff,
  wood: 0xb98a5e,
  woodDark: 0x8c6444,
  stone: 0xc9c5c0,
  stoneDark: 0xa9a6a6,
  trunk: 0x9b6f4c,
  leafA: 0x7fc98b,
  leafB: 0x9bd67a,
  leafC: 0x5fb38a,
  blossom: 0xf7b7cf,
  walls: [0xfbe9d0, 0xf9d5d3, 0xd9ecf2, 0xfff3c4, 0xe3dcf5, 0xdff0d8],
  roofs: [0xe8836f, 0x7fa9c9, 0xd9a05b, 0xb886c4, 0x6fb7a3, 0xe07a94],
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
