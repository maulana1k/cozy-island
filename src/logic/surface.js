// What kind of ground is underfoot. Each kind looks, sounds and feels different to walk on.
import { heightAt, landR, groundKind } from './terrain.js';
import { platformAt, distanceToPath, jungleAt, VILLAGE_CENTER } from './layout.js';
import { POND, GRASS_RADIUS, HILL, AREAS } from '../config.js';

export const SURFACES = {
  grass: { label: 'Dry grass', color: '#e3b85a', speed: 1 },
  meadow: { label: 'Meadow', color: '#8fbf5f', speed: 0.96 },
  forest: { label: 'Jungle floor', color: '#6f9a55', speed: 0.97 },
  mud: { label: 'Mud', color: '#8a6a4a', speed: 0.78 },
  dirt: { label: 'Trail', color: '#e6c690', speed: 1.04 },
  sand: { label: 'Beach', color: '#f3e3b4', speed: 0.93 },
  water: { label: 'Shallows', color: '#62c3d8', speed: 1 }, // wading already slows you
  rock: { label: 'Rocky ground', color: '#b5aab0', speed: 1 },
  wood: { label: 'Planks', color: '#b98a5e', speed: 1 },
  floor: { label: 'Tent floor', color: '#c9b48c', speed: 1 },
};

export const pondDistance = (x, z) => Math.hypot(x - POND.x, z - POND.z);
export const ROCK_HEIGHT = 9.5;

export function surfaceAt(x, z) {
  const platform = platformAt(x, z);
  if (platform) return platform;
  const h = heightAt(x, z);
  if (h < 0) return 'water';
  const pd = pondDistance(x, z);
  if (pd < POND.rw + 1.5) return 'mud';
  // The new land: trails, bare rock on the massif, the trodden village square.
  const g = groundKind(x, z);
  if (g) {
    if (g.trail < 0.95) return 'dirt';
    if (g.rock > 0.5 && h > 2.5) return 'rock';
    if (Math.hypot(x - AREAS.village.x, z - AREAS.village.z) < AREAS.village.r * 0.45) return 'dirt';
  }
  if (landR(x, z) >= GRASS_RADIUS) return 'sand';
  if (distanceToPath(x, z) < 0.95 || Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 5) return 'dirt';
  if (pd < POND.rw + 9) return 'meadow';
  if (h > ROCK_HEIGHT && Math.hypot(x - HILL.x, z - HILL.z) < HILL.radius) return 'rock';
  if (jungleAt(x, z) > 0.5) return 'forest';
  return 'grass';
}
