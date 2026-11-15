// On-screen interface, all in white frosted glass: scout card, clock, minimap, ground chip,
// discovery pop-ups, the journal side bar, the pause menu and the start screen.
import { ISLAND_RADIUS, GRASS_RADIUS, HILL, POND } from './config.js';
import { COTTAGES, PATHS, DOCK, TENTS, CAMPFIRES, BELL, WINDMILL } from './logic/layout.js';
import { CATEGORIES } from './logic/journal.js';

const MAP_SIZE = 164;        // CSS pixels
const MAP_WORLD = 70;        // metres from the centre to the edge of the map
const TIMES = [['Morning', 0.2], ['Midday', 0.45], ['Afternoon', 0.64], ['Sunset', 0.78], ['Night', 0.95]];

const ICONS = {
  book: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 8h7M9 12h5"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="waves" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  mouse: '<svg viewBox="0 0 24 24"><rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 7v3.5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  star: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>',
  steps: '<svg viewBox="0 0 24 24" class="fill"><ellipse cx="8" cy="8" rx="3" ry="4.6"/><ellipse cx="8" cy="16.6" rx="2.2" ry="1.8"/><ellipse cx="16.5" cy="11" rx="3" ry="4.6"/><ellipse cx="16.5" cy="19.6" rx="2.2" ry="1.8"/></svg>',
};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const icon = (name, cls = 'ico') => { const s = el('span', cls); s.innerHTML = ICONS[name]; return s; };

function drawStaticMap(ctx, scale) {
  const c = MAP_SIZE / 2, k = (MAP_SIZE / 2) / MAP_WORLD;
  const px = (x) => c + x * k, pz = (z) => c + z * k;
  ctx.save(); ctx.scale(scale, scale);
  ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.beginPath(); ctx.arc(c, c, c - 1, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#9fdbe6'; ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.fillStyle = '#fbf2d2'; ctx.beginPath(); ctx.arc(c, c, ISLAND_RADIUS * k, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a9cf7c'; ctx.beginPath(); ctx.arc(c, c, GRASS_RADIUS * k, 0, Math.PI * 2); ctx.fill();
  // The camp clearing, the hill and the pond
  ctx.fillStyle = '#edd38a'; ctx.beginPath(); ctx.arc(px(10), pz(8), 27 * k, 0, Math.PI * 2); ctx.fill();
  for (const [r, col] of [[0.9, '#93bf6a'], [0.6, '#b9c98a'], [0.3, '#cfc6b0']]) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px(HILL.x), pz(HILL.z), HILL.radius * r * k, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#7fcfe0'; ctx.beginPath(); ctx.arc(px(POND.x), pz(POND.z), POND.rw * k, 0, Math.PI * 2); ctx.fill();
  // Trails
  ctx.strokeStyle = '#fff6dc'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const path of PATHS) { ctx.beginPath(); path.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z)))); ctx.stroke(); }
  // Dock
  ctx.strokeStyle = '#b98a5e'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(px(DOCK.x), pz(DOCK.z));
  ctx.lineTo(px(DOCK.x + Math.sin(DOCK.rot) * DOCK.length), pz(DOCK.z + Math.cos(DOCK.rot) * DOCK.length)); ctx.stroke();
  // Big tents
  for (const h of COTTAGES) {
    ctx.save(); ctx.translate(px(h.x), pz(h.z)); ctx.rotate(-h.rot);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 0.8;
    const w = h.width * k * 1.25, d = h.depth * k * 1.25;
    ctx.fillRect(-w / 2, -d / 2, w, d); ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.restore();
  }
  for (const t of TENTS) {
    ctx.fillStyle = '#f0a37c'; ctx.beginPath();
    ctx.moveTo(px(t.x), pz(t.z) - 3); ctx.lineTo(px(t.x) + 2.8, pz(t.z) + 2.3); ctx.lineTo(px(t.x) - 2.8, pz(t.z) + 2.3); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px(WINDMILL.x), pz(WINDMILL.z), 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (const f of CAMPFIRES) { ctx.fillStyle = '#ff8a3c'; ctx.beginPath(); ctx.arc(px(f.x), pz(f.z), 2.1, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#f5b301'; ctx.beginPath(); ctx.arc(px(BELL.x), pz(BELL.z), 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function createHUD(handlers) {
  const root = el('div'); root.id = 'hud';
  document.body.appendChild(root);

  // ---- Top-left: scout card (rank and progress) with the clock underneath
  const card = el('div', 'glass scout');
  const ring = el('div', 'ring'); const ringNum = el('span', 'num', '0'); ring.append(icon('star', 'ico gold'), ringNum);
  const who = el('div', 'who');
  const rankName = el('div', 'rank', 'New Scout');
  const bar = el('div', 'bar'); const barFill = el('i'); bar.append(barFill);
  const nextText = el('div', 'next');
  who.append(rankName, bar, nextText);
  card.append(ring, who);
  const chips = el('div', 'chips');
  const clock = el('div', 'glass chip'); const clockIco = icon('sun'); const time = el('b', 'time'); const phase = el('span', 'soft');
  clock.append(clockIco, time, phase);
  const day = el('div', 'glass chip', 'Day 1');
  const steps = el('div', 'glass chip'); const stepsNum = el('b', null, '0'); steps.append(icon('steps'), stepsNum, el('span', 'soft', 'steps'));
  const now = el('div', 'glass chip now'); const nowText = el('b'); now.append(el('span', 'soft', 'Now'), nowText);
  chips.append(clock, day, steps);
  const chips2 = el('div', 'chips'); chips2.append(now);
  const left = el('div', 'left'); left.append(card, chips, chips2);

  // ---- Top-right: buttons and minimap
  const right = el('div', 'right');
  const buttons = el('div', 'buttons');
  const mkBtn = (name, title, key) => { const b = el('button', 'glass round'); b.innerHTML = ICONS[name]; b.title = title; if (key) b.append(el('kbd', 'hot', key)); return b; };
  const journalBtn = mkBtn('book', 'Journal (J)', 'J'), lookBtn = mkBtn('mouse', 'Free look: move the mouse to turn the camera (C)', 'C'), soundBtn = mkBtn('sound', 'Sound (M)', 'M'), menuBtn = mkBtn('pause', 'Menu (Esc)', 'Esc');
  const dot = el('span', 'dot'); journalBtn.append(dot);
  buttons.append(journalBtn, lookBtn, soundBtn, menuBtn);
  const mapWrap = el('div', 'glass map');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const mapStatic = document.createElement('canvas'); mapStatic.width = mapStatic.height = MAP_SIZE * dpr;
  drawStaticMap(mapStatic.getContext('2d'), dpr);
  const map = document.createElement('canvas'); map.width = map.height = MAP_SIZE * dpr;
  map.style.width = map.style.height = `${MAP_SIZE}px`;
  const mapCtx = map.getContext('2d');
  mapWrap.append(map, el('span', 'north', 'N'));
  right.append(buttons, mapWrap);

  // ---- Bottom-left: what you are standing on
  const ground = el('div', 'glass chip ground'); const groundDot = el('i', 'swatch'); const groundText = el('span');
  ground.append(groundDot, groundText);

  // ---- Pop-ups
  const toasts = el('div', 'toasts');
  const banner = el('div', 'glass banner'); const bannerSmall = el('div', 'small', 'New rank'); const bannerBig = el('div', 'big');
  banner.append(icon('star', 'ico gold'), el('div'), icon('star', 'ico gold')); banner.children[1].append(bannerSmall, bannerBig);

  // ---- Journal side bar
  const drawer = el('aside', 'glass drawer');
  const head = el('div', 'head'); const closeBtn = el('button', 'x'); closeBtn.innerHTML = ICONS.close;
  head.append(icon('book'), el('h2', null, 'Scout Journal'), closeBtn);
  const summary = el('div', 'summary'); const sumRank = el('div', 'rank'); const sumBar = el('div', 'bar'); const sumFill = el('i'); sumBar.append(sumFill); const sumText = el('div', 'next');
  summary.append(sumRank, sumBar, sumText);
  const lists = el('div', 'lists');
  drawer.append(head, summary, lists, el('div', 'foot', 'Nothing here is required. Wander as you like.'));

  // ---- Start screen
  const start = el('div', 'overlay start');
  const startCard = el('div', 'glass panel');
  startCard.append(icon('star', 'ico gold huge'), el('h1', null, 'Scout Camp Island'), el('p', 'sub', 'A student scout camp on a quiet little island. Explore, say hello, and fill your journal at your own pace.'), el('p', 'press', 'Press any key or click to begin'));
  start.append(startCard);

  // ---- Pause menu
  const menu = el('div', 'overlay menu off');
  const panel = el('div', 'glass panel wide');
  panel.append(el('h2', null, 'Paused'));
  const resume = el('button', 'btn primary', 'Resume');
  const openJournal = el('button', 'btn', 'Open journal');
  const soundRow = el('button', 'btn');
  const lookRow = el('button', 'btn');
  const timeRow = el('div', 'row');
  timeRow.append(el('span', 'label', 'Time of day'));
  for (const [name, t] of TIMES) { const b = el('button', 'pill', name); b.addEventListener('click', () => handlers.onSetTime(t)); timeRow.append(b); }
  const controls = el('div', 'keys');
  for (const [k, v] of [['W A S D', 'Move'], ['Shift', 'Run'], ['Space', 'Hop'], ['E', 'Use / say hello'], ['X', 'Sit down / stand up'], ['Mouse drag', 'Look around'], ['C', 'Free look on / off'], ['Scroll', 'Zoom'], ['J', 'Journal'], ['M', 'Sound'], ['Esc', 'Pause']]) {
    const r = el('div', 'key'); r.append(el('kbd', null, k), el('span', null, v)); controls.append(r);
  }
  panel.append(resume, openJournal, lookRow, soundRow, timeRow, el('h3', null, 'Controls'), controls);
  menu.append(panel);

  root.append(left, right, ground, toasts, banner, drawer, start, menu);

  resume.addEventListener('click', () => handlers.onResume());
  menuBtn.addEventListener('click', () => handlers.onToggleMenu());
  soundBtn.addEventListener('click', () => handlers.onToggleSound());
  soundRow.addEventListener('click', () => handlers.onToggleSound());
  journalBtn.addEventListener('click', () => handlers.onToggleJournal());
  lookBtn.addEventListener('click', () => handlers.onToggleLook());
  lookRow.addEventListener('click', () => handlers.onToggleLook());
  closeBtn.addEventListener('click', () => handlers.onToggleJournal());
  openJournal.addEventListener('click', () => { handlers.onResume(); if (!hud.journalOpen) handlers.onToggleJournal(); });
  // Buttons must not keep keyboard focus, or Space and Enter would press them again.
  root.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });

  let lastClock = '', lastSteps = -1, lastGround = '', frame = 0, bannerTimer = null;
  const k = (MAP_SIZE / 2) / MAP_WORLD, c = MAP_SIZE / 2;

  const hud = {
    menuOpen: false, started: false, journalOpen: false,
    begin() { hud.started = true; start.classList.add('off'); root.classList.add('playing'); },
    openMenu() { hud.menuOpen = true; menu.classList.remove('off'); },
    closeMenu() { hud.menuOpen = false; menu.classList.add('off'); },
    toggleJournal() { hud.journalOpen = !hud.journalOpen; root.classList.toggle('journal', hud.journalOpen); dot.classList.remove('on'); },
    setLook(on) { lookBtn.classList.toggle('active', on); lookRow.textContent = on ? 'Camera: free look (just move the mouse)' : 'Camera: hold and drag'; },
    setSound(on) { soundBtn.classList.toggle('muted', !on); soundRow.textContent = on ? 'Sound: on' : 'Sound: off'; },
    setClock(text, phaseText, isNight, dayNumber) {
      const key = `${text}|${dayNumber}`;
      if (key === lastClock) return;
      lastClock = key;
      clockIco.innerHTML = ICONS[isNight ? 'moon' : 'sun']; clock.classList.toggle('night', isNight);
      time.textContent = text; phase.textContent = phaseText; day.textContent = `Day ${dayNumber}`;
    },
    setSteps(n) { if (n !== lastSteps) { lastSteps = n; stepsNum.textContent = n.toLocaleString('en-US'); } },
    setGround(label, color) { if (label === lastGround) return; lastGround = label; groundText.textContent = label; groundDot.style.background = color; },
    // Rank, progress bar and the journal lists all come from the same numbers.
    setProgress(list, rank, count, total) {
      ringNum.textContent = count;
      const span = rank.next ? rank.next.at - rank.from : 1, pct = rank.next ? Math.round(((count - rank.from) / span) * 100) : 100;
      const nextLine = rank.next ? `${rank.next.at - count} more to become ${rank.next.name}` : 'You have found everything. Well done!';
      rankName.textContent = rank.name; barFill.style.width = `${pct}%`; nextText.textContent = nextLine;
      sumRank.textContent = `${rank.name} · ${count} of ${total} found`; sumFill.style.width = `${Math.round((count / total) * 100)}%`; sumText.textContent = nextLine;
      lists.replaceChildren(...CATEGORIES.map((cat) => {
        const items = list.filter((d) => d.cat === cat.id), done = items.filter((d) => d.done).length;
        const sec = el('section'); const h = el('h3'); h.append(el('span', null, cat.label), el('b', null, `${done}/${items.length}`)); sec.append(h);
        for (const d of items) {
          const row = el('div', d.done ? 'item done' : 'item');
          const mark = el('span', 'mark'); if (d.done) mark.innerHTML = ICONS.star;
          const txt = el('div'); txt.append(el('div', 'label', d.label), el('div', 'hint', d.done ? 'Found' : d.hint));
          row.append(mark, txt); sec.append(row);
        }
        return sec;
      }));
    },
    toast(label, count, total) {
      const t = el('div', 'glass toast');
      const body = el('div'); body.append(el('div', 'small', 'Discovered'), el('div', 'label', label));
      t.append(icon('star', 'ico gold'), body, el('b', 'count', `${count}/${total}`));
      toasts.append(t);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => t.classList.add('out'), 3200);
      setTimeout(() => t.remove(), 3800);
      if (!hud.journalOpen) dot.classList.add('on');
    },
    setActivity(label) { nowText.textContent = label; },
    // A banner across the top: a new rank, or the camp moving on to its next activity.
    announce(small, big) { hud.rankUp(big, small); },
    rankUp(name, small = 'New rank') {
      bannerSmall.textContent = small; bannerBig.textContent = name; banner.classList.add('show');
      clearTimeout(bannerTimer); bannerTimer = setTimeout(() => banner.classList.remove('show'), 3600);
    },
    // Redraws the moving dots on the minimap. Cheap, but every other frame is plenty.
    drawMap(player, facing, villagers) {
      if (frame++ % 2) return;
      mapCtx.setTransform(1, 0, 0, 1, 0, 0);
      mapCtx.clearRect(0, 0, map.width, map.height);
      mapCtx.drawImage(mapStatic, 0, 0);
      mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mapCtx.fillStyle = '#ffffff'; mapCtx.strokeStyle = 'rgba(40, 50, 60, 0.6)'; mapCtx.lineWidth = 0.8;
      for (const v of villagers) { mapCtx.beginPath(); mapCtx.arc(c + v.x * k, c + v.z * k, 2, 0, Math.PI * 2); mapCtx.fill(); mapCtx.stroke(); }
      // The player is an arrow pointing the way they face.
      mapCtx.save();
      mapCtx.translate(c + player.x * k, c + player.z * k);
      mapCtx.rotate(Math.atan2(facing.x, -facing.z));
      mapCtx.fillStyle = '#ff6b4a'; mapCtx.strokeStyle = '#ffffff'; mapCtx.lineWidth = 1.5;
      mapCtx.beginPath(); mapCtx.moveTo(0, -6.5); mapCtx.lineTo(4.6, 4.6); mapCtx.lineTo(0, 2.2); mapCtx.lineTo(-4.6, 4.6); mapCtx.closePath();
      mapCtx.stroke(); mapCtx.fill();
      mapCtx.restore();
    },
  };
  hud.setSound(true);
  hud.setLook(false);
  return hud;
}
