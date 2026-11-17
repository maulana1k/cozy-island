// INTERNAL. The digital camera's screen overlay (src/photo.js drives it), styled like a modern mirrorless camera's
// LCD: thin, crisp, slightly see-through white glyphs and condensed type with a soft dark shadow, so they read on any
// background. Top row: mode dial (leaf: Nature), drive, quality, stabiliser, AF mode, shots left, battery with
// segments, a small live histogram. Middle: the focus area, an AF point that pulses green on lock with "AF●", a
// subject-detect outline round the animal with its name above it, a level line that tilts with the hands, an
// optional thirds grid, a slim zoom bar with the focal length. Bottom row: exposure meter, shutter, aperture, ISO,
// white balance. The camera body round the screen: textured trim with a highlight edge, SCOUTCAM, and button labels
// as outlined glyphs that fade while you are busy and come back when you pause.

const FONT = `'DIN Condensed', 'Avenir Next Condensed', 'Roboto Condensed', 'Arial Narrow', 'Helvetica Neue', sans-serif`;
const ICON = {
  leaf: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M7.5 16.5c0-6 4-9 9-9 0 6-3.5 9.5-9 9zM7.5 16.5l5-5"/></svg>',
  drive: '<svg viewBox="0 0 24 24"><rect x="5" y="6" width="14" height="12" rx="1.5"/><path d="M9 10h6v4H9z"/></svg>',
  is: '<svg viewBox="0 0 24 24"><path d="M8 18V9.5a1.5 1.5 0 0 1 3 0V13M11 12V7.5a1.5 1.5 0 0 1 3 0V13M14 12V8.5a1.5 1.5 0 0 1 3 0V15c0 3-2 5-5 5h-1c-2 0-3-1-4-2.5L5.5 14a1.4 1.4 0 0 1 2.4-1.4L8 13"/><path d="M3 6c1-1.5 2-2 3-2M21 6c-1-1.5-2-2-3-2"/></svg>',
  af: '<svg viewBox="0 0 24 24"><path d="M4 9V5h4M16 5h4v4M20 15v4h-4M8 19H4v-4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
  wb: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><text x="12" y="15.2" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">AWB</text></svg>',
  shutter: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5 15h14"/></svg>',
  zoom: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
  aim: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 6v3M12 15v3M6 12h3M15 12h3"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>',
  exit: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
};
const CSS = `
#hud .cam { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .3s ease; z-index: 4; color: rgba(255,255,255,.93); font-family: ${FONT}; font-stretch: condensed; font-variant-numeric: tabular-nums; letter-spacing: .4px;
  text-shadow: 0 0 3px rgba(0,0,0,.55), 0 1px 1px rgba(0,0,0,.6); }
#hud .cam.on { opacity: 1; }
#hud .cam svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 2px rgba(0,0,0,.6)); flex: none; }
#hud .cam .scr { position: absolute; left: 18px; right: 18px; top: 18px; bottom: 58px; border-radius: 26px; overflow: hidden; }
#hud .cam .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, transparent 58%, rgba(8,12,18,.42) 100%); }
#hud .cam .grid { position: absolute; inset: 0; opacity: 0; transition: opacity .2s ease; background-image: linear-gradient(90deg, transparent calc(33.33% - .5px), rgba(255,255,255,.3) 0, rgba(255,255,255,.3) calc(33.33% + .5px), transparent 0, transparent calc(66.66% - .5px), rgba(255,255,255,.3) 0, rgba(255,255,255,.3) calc(66.66% + .5px), transparent 0), linear-gradient(0deg, transparent calc(33.33% - .5px), rgba(255,255,255,.3) 0, rgba(255,255,255,.3) calc(33.33% + .5px), transparent 0, transparent calc(66.66% - .5px), rgba(255,255,255,.3) 0, rgba(255,255,255,.3) calc(66.66% + .5px), transparent 0); }
#hud .cam .grid.on { opacity: 1; }
/* rows */
#hud .cam .row { position: absolute; left: 26px; right: 26px; display: flex; align-items: center; gap: 18px; font-size: 17px; font-weight: 500; white-space: nowrap; }
#hud .cam .row.top { top: 14px; }
#hud .cam .row.bot { bottom: 12px; justify-content: center; gap: 30px; }
#hud .cam .row .sp { flex: 1; }
#hud .cam .row .it { display: flex; align-items: center; gap: 5px; }
#hud .cam .q { font-size: 14px; border: 1.3px solid rgba(255,255,255,.85); border-radius: 3px; padding: 0 4px; line-height: 17px; box-shadow: 0 0 2px rgba(0,0,0,.5); }
#hud .cam .bat { display: flex; gap: 1.5px; padding: 2px; border: 1.4px solid rgba(255,255,255,.9); border-radius: 3px; position: relative; box-shadow: 0 0 2px rgba(0,0,0,.5); }
#hud .cam .bat::after { content: ""; position: absolute; right: -4.5px; top: 4px; width: 2.5px; height: 5px; background: rgba(255,255,255,.9); border-radius: 0 1px 1px 0; }
#hud .cam .bat i { width: 5px; height: 9px; background: rgba(255,255,255,.92); border-radius: 1px; }
#hud .cam .bat i.off { background: transparent; }
#hud .cam canvas.histo { width: 72px; height: 30px; border: 1px solid rgba(255,255,255,.35); border-radius: 2px; background: rgba(0,0,0,.18); }
/* exposure meter */
#hud .cam .meter { position: relative; width: 150px; height: 22px; }
#hud .cam .meter .scale { position: absolute; left: 0; right: 0; top: 2px; display: flex; justify-content: space-between; font-size: 11px; }
#hud .cam .meter .ticks { position: absolute; left: 4px; right: 4px; top: 15px; height: 4px; background-image: linear-gradient(90deg, rgba(255,255,255,.85) 1px, transparent 1px); background-size: 12.5% 100%; box-shadow: 0 1px 0 rgba(255,255,255,.85); }
#hud .cam .meter .needle { position: absolute; top: 12px; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 6px solid #fff; margin-left: -4px; transition: left .3s ease; filter: drop-shadow(0 0 2px rgba(0,0,0,.6)); }
/* focus */
#hud .cam .area { position: absolute; transition: transform .25s ease; }
#hud .cam .area i { position: absolute; width: 16px; height: 16px; border: 0 solid rgba(255,255,255,.55); }
#hud .cam .area i:nth-child(1) { left: 0; top: 0; border-left-width: 1.4px; border-top-width: 1.4px; }
#hud .cam .area i:nth-child(2) { right: 0; top: 0; border-right-width: 1.4px; border-top-width: 1.4px; }
#hud .cam .area i:nth-child(3) { left: 0; bottom: 0; border-left-width: 1.4px; border-bottom-width: 1.4px; }
#hud .cam .area i:nth-child(4) { right: 0; bottom: 0; border-right-width: 1.4px; border-bottom-width: 1.4px; }
#hud .cam .afp { position: absolute; left: 50%; top: 50%; width: 64px; height: 48px; margin: -24px 0 0 -32px; border: 1.5px solid rgba(255,255,255,.9); border-radius: 3px; box-shadow: 0 0 3px rgba(0,0,0,.45), inset 0 0 3px rgba(0,0,0,.3); transition: border-color .12s ease; }
#hud .cam .afp.lock { border-color: #6dff9e; animation: afpulse .35s ease-out; }
@keyframes afpulse { 0% { transform: scale(1.18); } 60% { transform: scale(.94); } 100% { transform: scale(1); } }
#hud .cam .afok { position: absolute; left: 50%; top: 50%; margin: -44px 0 0 -32px; font-size: 13px; font-weight: 600; color: #6dff9e; opacity: 0; transition: opacity .12s ease; }
#hud .cam .afok.on { opacity: 1; }
#hud .cam .subj { position: absolute; border: 1.3px solid rgba(255,214,120,.95); border-radius: 4px; box-shadow: 0 0 3px rgba(0,0,0,.45); opacity: 0; transition: opacity .15s ease; }
#hud .cam .subj.on { opacity: 1; }
#hud .cam .subj b { position: absolute; left: -1.3px; bottom: 100%; margin-bottom: 3px; font-size: 14px; font-weight: 600; color: rgba(255,224,150,.98); white-space: nowrap; }
#hud .cam .level { position: absolute; left: 50%; top: 50%; width: 240px; height: 0; margin-left: -120px; border-top: 1.3px solid rgba(255,255,255,.45); }
#hud .cam .level.ok { border-top-color: rgba(109,255,158,.75); }
#hud .cam .level::before, #hud .cam .level::after { content: ""; position: absolute; top: -5px; width: 1.3px; height: 9px; background: inherit; border-left: 1.3px solid currentColor; opacity: .6; }
#hud .cam .level::before { left: -1px; } #hud .cam .level::after { right: -1px; }
#hud .cam .zoom { position: absolute; right: 26px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 13px; }
#hud .cam .zbar { width: 2px; height: 150px; background: rgba(255,255,255,.4); position: relative; box-shadow: 0 0 2px rgba(0,0,0,.5); }
#hud .cam .zbar i { position: absolute; left: -5px; width: 12px; height: 2px; background: #fff; margin-top: -1px; box-shadow: 0 0 2px rgba(0,0,0,.6); }
#hud .cam .zoom .mm { font-size: 17px; font-weight: 600; }
/* shutter */
#hud .cam .blink { position: absolute; inset: 0; background: #000; opacity: 0; }
#hud .cam .blink.go { animation: camblink .2s linear; }
@keyframes camblink { 0% { opacity: 0; } 20% { opacity: 1; } 55% { opacity: 1; } 100% { opacity: 0; } }
#hud .cam .review { position: absolute; left: 50%; top: 50%; width: 240px; padding: 3px; background: rgba(255,255,255,.92); border-radius: 3px; box-shadow: 0 6px 22px rgba(0,0,0,.45); transform: translate(-50%, -50%) scale(1.25); opacity: 0; text-shadow: none; }
#hud .cam .review img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #222; }
#hud .cam .review .cap { font-size: 13px; color: #1d232a; padding: 3px 4px 1px; font-weight: 600; display: flex; justify-content: space-between; }
#hud .cam .review .cap em { font-style: normal; color: #c98a00; }
#hud .cam .review.go { animation: camreview 2.6s cubic-bezier(.3,.7,.2,1) forwards; }
@keyframes camreview { 0% { opacity: 0; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(1.25); } 8% { opacity: 1; } 28% { left: 50%; top: 50%; transform: translate(-50%, -50%) scale(1); }
  45%, 88% { opacity: 1; left: 30px; top: calc(100% - 64px); transform: translate(0, -100%) scale(.6); transform-origin: left bottom; } 100% { opacity: 0; left: 30px; top: calc(100% - 64px); transform: translate(0, -100%) scale(.6); } }
/* the camera body */
#hud .cam .body { position: absolute; inset: 0; padding: 18px 18px 58px; box-sizing: border-box; background: radial-gradient(circle at 30% 0%, #2e353b, #191d21 70%), #1c2125;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; }
#hud .cam .body::before { content: ""; position: absolute; inset: 0; opacity: .5; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px); }
#hud .cam .rim { position: absolute; left: 18px; right: 18px; top: 18px; bottom: 58px; border-radius: 26px; box-shadow: 0 0 0 16px #1c2125, inset 0 0 0 1px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.14), 0 0 0 17px rgba(255,255,255,.035), inset 0 0 40px rgba(0,0,0,.35); }
#hud .cam .strip { position: absolute; left: 36px; right: 36px; bottom: 14px; height: 30px; display: flex; align-items: center; gap: 22px; color: rgba(214,222,228,.62); text-shadow: 0 -1px 0 rgba(0,0,0,.6); }
#hud .cam .brand { font: 700 13px ${FONT}; letter-spacing: 4px; color: rgba(214,222,228,.8); }
#hud .cam .brand i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #d8442f; margin-right: 9px; vertical-align: 1px; box-shadow: 0 0 4px rgba(232,86,63,.8), inset 0 1px 1px rgba(255,255,255,.4); }
#hud .cam .lens { font: 500 11px ${FONT}; letter-spacing: 1.5px; opacity: .55; }
#hud .cam .btns { margin-left: auto; display: flex; gap: 20px; font: 400 13px ${FONT}; letter-spacing: .6px; transition: opacity .6s ease; }
#hud .cam .btns.quiet { opacity: .12; }
#hud .cam .btns span { display: flex; align-items: center; gap: 6px; }
#hud .cam .btns svg { width: 17px; height: 17px; stroke-width: 1.2; filter: none; opacity: .9; }
#hud .cam .btns small { font-size: 11px; opacity: .7; }
#hud.snapping .tl, #hud.snapping .bl, #hud.snapping .hints, #hud.snapping .belt, #hud.snapping .quest, #hud.snapping .way, #hud.snapping .tip1, #hud.snapping .tr { opacity: 0 !important; }
#hud .reward .stamp img.photo { width: 40px; height: 40px; object-fit: cover; border-radius: 5px; display: block; }
`;

// box: the focus area's half size in screen units (-1..1): { x, y }.
export function createViewfinder(box) {
  const mk = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text) d.textContent = text; return d; };
  const ico = (name) => { const s = mk('ico', '', 'span'); s.innerHTML = ICON[name]; return s.firstChild; };
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = mk('cam');
  const scr = mk('scr');
  const grid = mk('grid');
  const area = mk('area'); area.style.cssText = `left:${50 - box.x * 50}%;right:${50 - box.x * 50}%;top:${50 - box.y * 50}%;bottom:${50 - box.y * 50}%`;
  for (let i = 0; i < 4; i++) area.append(document.createElement('i'));
  const afp = mk('afp'), afok = mk('afok', 'AF●'), level = mk('level'), subj = mk('subj'), subjName = mk('', '', 'b'); subj.append(subjName);
  // top row
  const top = mk('row top');
  const it = (...kids) => { const d = mk('it'); d.append(...kids); return d; };
  const mode = it(ico('leaf'), mk('', 'NATURE', 'span'));
  const shotsEl = mk('', '', 'span'), bat = mk('bat', '', 'span'); const segs = [0, 1, 2, 3].map((i) => { const s = document.createElement('i'); if (i === 3) s.className = 'off'; bat.append(s); return s; });
  const histo = document.createElement('canvas'); histo.className = 'histo'; histo.width = 72; histo.height = 30;
  top.append(mode, it(ico('drive')), mk('q', 'RAW+L', 'span'), it(ico('is')), it(ico('af'), mk('', 'AF-C', 'span')), mk('sp'), histo, it(mk('', '[', 'span'), shotsEl, mk('', ']', 'span')), bat);
  void segs;
  // bottom row: exposure meter, shutter, aperture, ISO, white balance
  const bot = mk('row bot');
  const meter = mk('meter'), scale = mk('scale'); for (const t of ['-2', '1', '0', '1', '+2']) scale.append(mk('', t, 'span'));
  const needle = mk('needle'); meter.append(scale, mk('ticks'), needle);
  const speedEl = mk('', '', 'span'), fEl = mk('', 'F2.8', 'span'), isoEl = mk('', '', 'span');
  bot.append(meter, speedEl, fEl, isoEl, it(ico('wb')));
  // zoom
  const zoom = mk('zoom'), zbar = mk('zbar'), zthumb = document.createElement('i'), mm = mk('mm'); zbar.append(zthumb);
  zoom.append(mk('', 'T'), zbar, mk('', 'W'), mm);
  const blink = mk('blink');
  const review = mk('review'), revImg = document.createElement('img'), revCap = mk('cap'); revImg.alt = ''; review.append(revImg, revCap);
  scr.append(mk('vig'), grid, area, level, subj, afp, afok, top, bot, zoom, review, blink);
  // the body
  const body = mk('body'), rim = mk('rim');
  const strip = mk('strip'), brand = mk('brand'); brand.append(document.createElement('i'), document.createTextNode('SCOUTCAM'));
  const hints = mk('btns');
  for (const [g, what, key] of [['shutter', 'SHUTTER', 'space · click'], ['aim', 'AIM', 'drag · WASD'], ['zoom', 'ZOOM', 'scroll · + −'], ['grid', 'GRID', 'G'], ['exit', 'EXIT', 'E · 4']]) { const s = mk('', '', 'span'); s.append(ico(g), document.createTextNode(what), mk('', key, 'small')); hints.append(s); }
  strip.append(brand, mk('lens', '24–96 mm  1:2.8'), hints);
  root.append(scr, body, rim, strip);
  document.getElementById('hud').append(root);

  const hctx = histo.getContext('2d'), probe = document.createElement('canvas'); probe.width = 48; probe.height = 27;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  let lastSubj = '', reviewTimer = null;
  return {
    root,
    show(on) { root.classList.toggle('on', on); document.getElementById('hud').classList.toggle('snapping', on); },
    grid(on) { grid.classList.toggle('on', on); },
    zoom(z, min, max) { zthumb.style.top = `${(1 - (z - min) / (max - min)) * 100}%`; mm.textContent = `${Math.round(24 * z)} mm`; },
    shots(n) { shotsEl.textContent = String(n); },
    // light 0..1: ISO and shutter speed.
    light(L) {
      const iso = L > 0.75 ? 100 : L > 0.5 ? 200 : L > 0.3 ? 400 : L > 0.15 ? 800 : 1600;
      isoEl.textContent = `ISO ${iso}`; speedEl.textContent = `1/${iso >= 800 ? 60 : iso >= 400 ? 125 : 250}`;
    },
    lock(on, fresh) { afp.classList.toggle('lock', on); afok.classList.toggle('on', on); if (on && fresh) { afp.style.animation = 'none'; void afp.offsetWidth; afp.style.animation = ''; } },
    // Subject detect: a box in pixels { x, y, w, h } and a label, or null.
    subject(r, label) {
      if (!r) { if (lastSubj) { subj.classList.remove('on'); lastSubj = ''; } return; }
      subj.style.cssText = `left:${r.x - r.w / 2}px;top:${r.y - r.h / 2}px;width:${r.w}px;height:${r.h}px`;
      if (label !== lastSubj) { subjName.textContent = label; lastSubj = label; }
      subj.classList.add('on');
    },
    level(roll) { level.style.transform = `rotate(${roll}rad)`; level.classList.toggle('ok', Math.abs(roll) < 0.005); },
    hints(quiet) { hints.classList.toggle('quiet', quiet); },
    // The picture just drawn: a live histogram and where the exposure meter points.
    histogram(src) {
      try {
        pctx.drawImage(src, 0, 0, probe.width, probe.height);
        const d = pctx.getImageData(0, 0, probe.width, probe.height).data, bins = new Array(36).fill(0);
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) { const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; bins[Math.min(35, Math.floor(l * 36))]++; sum += l; }
        const top = Math.max(...bins);
        hctx.clearRect(0, 0, 72, 30); hctx.fillStyle = 'rgba(255,255,255,.75)';
        bins.forEach((b, i) => { const h = Math.round((b / top) * 28); hctx.fillRect(i * 2, 30 - h, 2, h); });
        const ev = Math.max(-2, Math.min(2, (sum / (d.length / 4) - 0.46) * 6));
        needle.style.left = `${4 + (ev + 2) / 4 * 142}px`;
      } catch { /* a tainted or lost canvas: no histogram */ }
    },
    // The shutter: a blink to black, then the photo slides to the corner as a review.
    shutter() { blink.classList.remove('go'); void blink.offsetWidth; blink.classList.add('go'); },
    review(thumb, caption, grade) {
      if (thumb) revImg.src = thumb;
      revCap.replaceChildren(mk('', caption, 'span'));
      if (grade) revCap.append(mk('', '★'.repeat(grade) + '☆'.repeat(3 - grade), 'em'));
      review.classList.remove('go'); void review.offsetWidth; review.classList.add('go');
      clearTimeout(reviewTimer); reviewTimer = setTimeout(() => review.classList.remove('go'), 2700);
    },
    clear() { review.classList.remove('go'); subj.classList.remove('on'); lastSubj = ''; afp.classList.remove('lock'); afok.classList.remove('on'); },
  };
}
