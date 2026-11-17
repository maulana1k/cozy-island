// Performance: measuring switches, the per-frame time split, and the first-run Graphics check.
//
// Debug URL params (for tools/prof.mjs; combine with `&`):
//   ?dpr=1           pin the pixel ratio (the slow-frame ladder is off; `nolimit` also turns the ladder off)
//   ?noshadow=sun,fire,lamps,torch   switch shadow maps off (any of them, comma separated)
//   ?nobloom  ?nosunfx  ?nosky  ?nowater   leave that part out
// With ?dbg the tab title also carries `upd` and `rend`: ms of script per frame in the update and in the render
// call, averaged over the last second.
//
// First-run Graphics check: on the very first visit (no saved Graphics choice), the first ~3 s of play are
// timed; if the median frame is slower than about 45 fps, Graphics switches to Low and says so once.
import * as THREE from 'three';

export function readPerfFlags(params) {
  const off = new Set((params.get('noshadow') || '').split(',').filter(Boolean));
  if (params.has('noshadow') && !off.size) ['sun', 'fire', 'lamps', 'torch'].forEach((k) => off.add(k));
  const dpr = Number(params.get('dpr'));
  return {
    noShadow: off,
    dpr: dpr > 0 ? dpr : 0,
    noLadder: dpr > 0 || params.has('nolimit'),
    noBloom: params.has('nobloom'), noSunFx: params.has('nosunfx'), noSky: params.has('nosky'), noWater: params.has('nowater'),
  };
}

// The leave-it-out switches that act on built things (shadows are handled where the lights are updated).
export function applyOffSwitches(flags, { scene, sky, island }) {
  if (flags.noWater && island.water) island.water.visible = false;
  if (flags.noSky) {
    const fx = sky.skyFx; for (const o of [fx.cumulus, fx.stars, fx.milkyWay]) if (o) o.visible = false;
    // the dome and the far ridges have no handle: hide the big fog-free backdrop meshes by their material flag
    scene.traverse((o) => { if (o.isMesh && o.material && o.material.isShaderMaterial && o.material.side === THREE.BackSide) o.visible = false; });
  }
}

// Per-frame script time: the update, and the render call (which on most browsers also waits on the GPU
// when it is behind, so a high `rend` with a low `upd` means the GPU or the driver is the limit).
// (GPU timer queries were tried: under ANGLE/Metal they report wall time across queued frames, so they are not used.)
export function createFrameTimer() {
  const acc = { u: 0, r: 0, n: 0 }, out = { upd: 0, rend: 0 };
  let t0 = 0, t1 = 0, since = performance.now();
  return {
    out,
    beginFrame() { t0 = performance.now(); },
    beginRender() { t1 = performance.now(); },
    endRender() {
      const t2 = performance.now();
      acc.u += t1 - t0; acc.r += t2 - t1; acc.n++;
      if (t2 - since > 1000) { out.upd = acc.u / acc.n; out.rend = acc.r / acc.n; acc.u = acc.r = acc.n = 0; since = t2; }
    },
  };
}

// First-run Graphics check. Call tick(rawSeconds, playing) every frame. onSlow() is called at most once.
const CHECK_KEY = 'graphicsChecked';
export function createAutoGraphics({ enabled, onSlow, warmup = 1.2, window = 3, slowMs = 22 }) {
  let done = !enabled, t = 0;
  const times = [];
  try { if (localStorage.getItem(CHECK_KEY) === '1' || localStorage.getItem('graphics')) done = true; } catch { /* private window: check every visit */ }
  const finish = () => { done = true; try { localStorage.setItem(CHECK_KEY, '1'); } catch { /* private window */ } };
  return {
    get done() { return done; },
    tick(raw, playing) {
      if (done || !playing || raw > 0.25) return; // paused, on the title, or a hitch from switching tabs
      t += raw;
      if (t < warmup) return; // shader compiles and first uploads
      times.push(raw * 1000);
      if (t < warmup + window) return;
      times.sort((a, b) => a - b);
      const median = times[times.length >> 1];
      finish();
      if (median > slowMs) onSlow(median);
    },
  };
}
