// INTERNAL. The digital camera's screen overlay (src/photo.js drives it). Kept simple, for kids: the picture is
// full-screen inside a thin white rounded border with four corner marks and a soft vignette; a focus box in the
// middle turns green when the focus locks, with the name of the animal in it above ("Sheep · close"); shots left
// and the zoom in the top corners; one quiet line of key hints at the bottom that fades while you aim. The thirds
// grid shows only when switched on (G). Taking a photo blinks the screen and slides the photo to a corner.

const CSS = `
#hud .cam { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .3s ease; z-index: 4; color: #fff; font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
#hud .cam.on { opacity: 1; }
#hud .cam .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(8,12,18,.35) 100%); }
#hud .cam .border { position: absolute; inset: 22px; border: 2px solid rgba(255,255,255,.85); border-radius: 22px; box-shadow: 0 0 4px rgba(0,0,0,.35), inset 0 0 4px rgba(0,0,0,.25); transform: scale(1.04); transition: transform .45s cubic-bezier(.3,.7,.2,1); }
#hud .cam.on .border { transform: scale(1); }
#hud .cam .mk { position: absolute; width: 22px; height: 22px; border: 0 solid rgba(255,255,255,.85); filter: drop-shadow(0 0 2px rgba(0,0,0,.4)); }
#hud .cam .mk.a { left: 36px; top: 36px; border-left-width: 2.5px; border-top-width: 2.5px; }
#hud .cam .mk.b { right: 36px; top: 36px; border-right-width: 2.5px; border-top-width: 2.5px; }
#hud .cam .mk.c { left: 36px; bottom: 36px; border-left-width: 2.5px; border-bottom-width: 2.5px; }
#hud .cam .mk.d { right: 36px; bottom: 36px; border-right-width: 2.5px; border-bottom-width: 2.5px; }
#hud .cam .grid { position: absolute; inset: 22px; border-radius: 22px; opacity: 0; transition: opacity .2s ease; background-image: linear-gradient(90deg, transparent calc(33.33% - .5px), rgba(255,255,255,.3) 0, rgba(255,255,255,.3) calc(33.33% + .5px), transparent 0, transparent calc(66.66% - .5px), rgba(255,255,255,.3) 0, rgba(255,255,255,.3) calc(66.66% + .5px), transparent 0), linear-gradient(0deg, transparent calc(33.33% - .5px), rgba(255,255,255,.3) 0, rgba(255,255,255,.3) calc(33.33% + .5px), transparent 0, transparent calc(66.66% - .5px), rgba(255,255,255,.3) 0, rgba(255,255,255,.3) calc(66.66% + .5px), transparent 0); }
#hud .cam .grid.on { opacity: 1; }
#hud .cam .shots { position: absolute; left: 68px; top: 40px; display: flex; align-items: center; gap: 7px; font-size: 17px; font-weight: 700; }
#hud .cam .zm { position: absolute; right: 68px; top: 40px; font-size: 17px; font-weight: 700; }
#hud .cam svg { width: 20px; height: 20px; fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
#hud .cam .fb { position: absolute; }
#hud .cam .fb i { position: absolute; width: 20px; height: 20px; border: 0 solid rgba(255,255,255,.95); transition: border-color .15s ease; filter: drop-shadow(0 0 2px rgba(0,0,0,.45)); }
#hud .cam .fb i:nth-child(1) { left: 0; top: 0; border-left-width: 2.5px; border-top-width: 2.5px; }
#hud .cam .fb i:nth-child(2) { right: 0; top: 0; border-right-width: 2.5px; border-top-width: 2.5px; }
#hud .cam .fb i:nth-child(3) { left: 0; bottom: 0; border-left-width: 2.5px; border-bottom-width: 2.5px; }
#hud .cam .fb i:nth-child(4) { right: 0; bottom: 0; border-right-width: 2.5px; border-bottom-width: 2.5px; }
#hud .cam .fb.lock i { border-color: #6dff9e; }
#hud .cam .fb.lock { animation: fbpulse .3s ease-out; }
@keyframes fbpulse { 0% { transform: scale(1.12); } 100% { transform: scale(1); } }
#hud .cam .subjname { position: absolute; left: 50%; transform: translate(-50%, -100%); margin-top: -8px; font-size: 17px; font-weight: 700; white-space: nowrap; opacity: 0; transition: opacity .15s ease; }
#hud .cam .subjname.on { opacity: 1; }
#hud .cam .khint { position: absolute; left: 0; right: 0; bottom: 40px; text-align: center; font-size: 14px; font-weight: 600; color: rgba(255,255,255,.85); transition: opacity .6s ease; white-space: nowrap; }
#hud .cam .khint b { font-weight: 800; color: #fff; margin-right: 6px; }
#hud .cam .khint span { margin: 0 6px; opacity: .55; }
#hud .cam .khint.quiet { opacity: 0; }
#hud .cam .blink { position: absolute; inset: 0; background: #000; opacity: 0; }
#hud .cam .blink.go { animation: camblink .2s linear; }
@keyframes camblink { 0% { opacity: 0; } 20% { opacity: 1; } 55% { opacity: 1; } 100% { opacity: 0; } }
#hud .cam .review { position: absolute; left: 50%; top: 50%; width: 240px; padding: 4px 4px 2px; background: #fffdf8; border-radius: 4px; box-shadow: 0 6px 22px rgba(0,0,0,.45); opacity: 0; text-shadow: none; transform-origin: left bottom; }
#hud .cam .review img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #222; }
#hud .cam .review .cap { font-size: 13px; color: #1d232a; padding: 3px 3px 1px; font-weight: 700; display: flex; justify-content: space-between; gap: 8px; }
#hud .cam .review .cap em { font-style: normal; color: #c98a00; }
#hud .cam .review.go { animation: camreview 2.6s cubic-bezier(.3,.7,.2,1) forwards; }
@keyframes camreview { 0% { opacity: 0; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(1.2); } 8% { opacity: 1; } 28% { left: 50%; top: 50%; transform: translate(-50%, -50%) scale(1); }
  45%, 88% { opacity: 1; left: 44px; top: calc(100% - 80px); transform: translate(0, -100%) scale(.6); } 100% { opacity: 0; left: 44px; top: calc(100% - 80px); transform: translate(0, -100%) scale(.6); } }
#hud.snapping .tl, #hud.snapping .bl, #hud.snapping .hints, #hud.snapping .belt, #hud.snapping .quest, #hud.snapping .way, #hud.snapping .tip1, #hud.snapping .tr { opacity: 0 !important; }
#hud .reward .stamp img.photo { width: 40px; height: 40px; object-fit: cover; border-radius: 5px; display: block; }
`;
const ROLL = '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-2.5h5L16 7"/></svg>';

// box: the focus box's half size in screen units (-1..1), { x, y }: the same area photos look for animals in.
export function createViewfinder(box) {
  const mk = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text) d.textContent = text; return d; };
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = mk('cam');
  const grid = mk('grid'), fb = mk('fb'), name = mk('subjname');
  for (let i = 0; i < 4; i++) fb.append(document.createElement('i'));
  fb.style.cssText = `left:${50 - box.x * 50}%;right:${50 - box.x * 50}%;top:${50 - box.y * 50}%;bottom:${50 - box.y * 50}%`;
  name.style.top = `${50 - box.y * 50}%`;
  const tl = mk('shots'), shotsEl = mk('', '', 'span'); tl.innerHTML = ROLL; tl.append(shotsEl);
  const tr = mk('zm');
  const keys = mk('khint');
  [['Space', 'take photo'], ['Scroll', 'zoom'], ['E', 'put away']].forEach(([k, what], i) => { if (i) keys.append(mk('', '·', 'span')); keys.append(mk('', k, 'b'), document.createTextNode(what)); });
  const blink = mk('blink'), review = mk('review'), revImg = document.createElement('img'), revCap = mk('cap'); revImg.alt = ''; review.append(revImg, revCap);
  root.append(mk('vig'), grid, mk('border'), mk('mk a'), mk('mk b'), mk('mk c'), mk('mk d'), fb, name, tl, tr, keys, review, blink);
  document.getElementById('hud').append(root);
  let lastName = '', reviewTimer = null;
  return {
    root,
    show(on) { root.classList.toggle('on', on); document.getElementById('hud').classList.toggle('snapping', on); },
    grid(on) { grid.classList.toggle('on', on); },
    zoom(z) { tr.textContent = `${z.toFixed(1)}×`; },
    shots(n) { shotsEl.textContent = String(n); },
    lock(on, fresh) { fb.classList.toggle('lock', on); if (on && fresh) { fb.style.animation = 'none'; void fb.offsetWidth; fb.style.animation = ''; } },
    // The animal in the focus box (its name), or null.
    subject(label) { const t = label || ''; if (t !== lastName) { lastName = t; if (t) name.textContent = t; name.classList.toggle('on', !!t); } },
    hints(quiet) { keys.classList.toggle('quiet', quiet); },
    shutter() { blink.classList.remove('go'); void blink.offsetWidth; blink.classList.add('go'); },
    review(thumb, caption, grade) {
      if (thumb) revImg.src = thumb;
      revCap.replaceChildren(mk('', caption, 'span'));
      if (grade) revCap.append(mk('', '★'.repeat(grade) + '☆'.repeat(3 - grade), 'em'));
      review.classList.remove('go'); void review.offsetWidth; review.classList.add('go');
      clearTimeout(reviewTimer); reviewTimer = setTimeout(() => review.classList.remove('go'), 2700);
    },
    clear() { review.classList.remove('go'); this.subject(null); fb.classList.remove('lock'); },
  };
}
