// The soundscape director: works out which areas you are in (a soft blend), hands that to the audio
// beds, and makes the birds you can see sing from where they are. Music cues for dawn and the
// evening campfire start here too. All sound itself is in src/audio.js.
import { AREAS, POND } from './config.js';
import { riverAt, wildness, shoreR } from './logic/terrain.js';
import { jungleAt, CHICKEN_YARD } from './logic/layout.js';
import { blockAt } from './actors/schedule.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// 1 at `near` metres (or closer), 0 at `far` and beyond, smooth in between.
const fade = (d, near, far) => { const t = clamp01((far - d) / (far - near)); return t * t * (3 - 2 * t); };

// How much each area is around x, z (y is the ground height there): 0..1 each, they may overlap.
export function areaWeights(x, z, y = 0) {
  const camp = fade(Math.hypot(x - 10, z - 8), 28, 50);
  const jungle = Math.max(jungleAt(x, z), wildness(x, z));
  const rv = riverAt(x, z), river = rv.d === Infinity ? 0 : fade(rv.d - rv.w, 2, 18);
  const pond = fade(Math.hypot(x - POND.x, z - POND.z) - POND.rw, 0, 14);
  const lake = fade(Math.hypot(x - AREAS.lake.x, z - AREAS.lake.z) - AREAS.lake.r, 0, 18);
  const foot = AREAS.waterfall.foot, fall = fade(Math.hypot(x - foot.x, z - foot.z), 6, 30);
  const sea = clamp01((shoreR(x, z) - 34) / 22), beach = fade(1 - sea, 0.05, 0.45);
  const village = Math.max(fade(Math.hypot(x - AREAS.village.x, z - AREAS.village.z), 20, 55), 0.8 * fade(Math.hypot(x - AREAS.paddies.x, z - AREAS.paddies.z), 15, 45));
  const hill = clamp01((y - 5) / 6);
  return { camp, jungle, water: Math.max(river, pond, lake), fall, beach, village, hill };
}

// The dawn chorus: strongest just after sunrise (0.10), gone by mid-morning.
export const dawnAt = (t) => clamp01(1 - Math.abs(t - 0.12) / 0.06);

export function createAmbience(audio, scene) {
  let flocks = null, gulls = null, areaT = 0, callT = 0, lastT = null, lastBlock = null;
  let w = { camp: 1 };
  const states = new Map();
  return {
    // ctx: { player, camera, timeOfDay, night, weather, inside, paused }
    update(dt, ctx) {
      if (!audio.started) return;
      const p = ctx.player.position, t = ctx.timeOfDay, wx = ctx.weather || {};
      // Cue music at sunrise and when the campfire evening begins.
      const block = blockAt(t).id;
      if (lastT !== null && !ctx.paused) {
        if (lastT < 0.1 && t >= 0.1 && t - lastT < 0.2) audio.cue('dawn');
        if (block === 'campfire' && lastBlock !== 'campfire') audio.cue('evening');
      }
      lastT = t; lastBlock = block;
      // Ears on the player, turned the way the camera looks.
      const e = ctx.camera.matrixWorld.elements;
      audio.listen(p.x, p.y, p.z, -e[8], -e[10]);
      // The area blend changes slowly: four times a second is plenty.
      areaT -= dt || 0.016;
      if (areaT <= 0) {
        areaT = 0.25;
        w = areaWeights(p.x, p.z, p.y);
        const murmur = block === 'sleep' ? 0 : block === 'campfire' ? 1 : 0.7;
        const kids = block === 'free' || block === 'lunch' ? 1 : block === 'work' ? 0.4 : 0;
        audio.ambience(w, { night: ctx.night, dawn: dawnAt(t), rain: wx.rain || 0, wind: wx.wind || 0, inside: !!ctx.inside, murmur, kids });
      }
      // Calls from real animals near you, checked a few times a second.
      callT -= dt; if (callT > 0 || !dt) return;
      callT = 0.25;
      const day = 1 - ctx.night, k = 0.25;
      if (!flocks) { const b = scene.getObjectByName('birds'); flocks = (b && b.userData.flocks) || []; }
      if (!gulls) { gulls = []; scene.traverse((o) => { if (o.name === 'gull') gulls.push(o); }); }
      flocks.forEach((f, i) => {
        const d = Math.hypot(f.x - p.x, f.z - p.z), was = states.get(f);
        states.set(f, f.state);
        if (d > 45) return;
        // A flock taking off: wings and alarm calls from where it was.
        if (f.state === 'flee' && was === 'ground') { const m = f.members[0]; audio.call('flutter', m.p.x, m.p.y + 0.3, m.p.z); return; }
        if ((f.state === 'ground' || f.state === 'back') && Math.random() < 0.18 * k * (1 - d / 45) * day * 4) {
          const m = f.members[(Math.random() * f.members.length) | 0];
          audio.call('bird', m.p.x, m.p.y + 0.2, m.p.z, i);
        }
      });
      for (const g of gulls) if (Math.hypot(g.position.x - p.x, g.position.z - p.z) < 45 && Math.random() < 0.06 * k * day) audio.call('gull', g.position.x, g.position.y, g.position.z);
      if (Math.hypot(CHICKEN_YARD.x - p.x, CHICKEN_YARD.z - p.z) < 25 && Math.random() < 0.12 * k * day) audio.call('cluck', CHICKEN_YARD.x, p.y, CHICKEN_YARD.z);
    },
  };
}
