// On-screen interface. During play it is just white text and line icons over the picture,
// with no panels. The journal is a notebook and the map is a paper sheet you hold up.
import { ISLAND_RADIUS, GRASS_RADIUS, HILL, POND } from './config.js';
import { COTTAGES, PATHS, DOCK, TENTS, CAMPFIRES, WINDMILL, ZIPLINE, FLAGPOLE, LOOKOUT, CAMPFIRE, TOWER, getScatter } from './logic/layout.js';
import { CATEGORIES } from './logic/journal.js';
import { ITEMS, KIND_LABEL } from './logic/items.js';
import { STAT_KEYS, STAT_LABEL, LOW } from './logic/stats.js';

const TIMES = [['Morning', 0.2], ['Midday', 0.45], ['Afternoon', 0.64], ['Sunset', 0.78], ['Night', 0.95]];

const ICONS = {
  book: '<svg viewBox="0 0 24 24"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 8h6M9 11.5h4"/><path d="M3 7h3M3 11h3M3 15h3"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="waves" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  mouse: '<svg viewBox="0 0 24 24"><rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 7v3.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" class="fill"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M6 9.5A3.5 3.5 0 0 1 9.5 6h5A3.5 3.5 0 0 1 18 9.5V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M9.5 6V5a2.5 2.5 0 0 1 5 0v1"/><path d="M9 13h6v4H9z"/><path d="M6 12H4.5v5H6M18 12h1.5v5H18"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M12 7.5c-1.6-1.4-4-1.6-5.6 0-2 2-1.6 6.200.6 9.300 1.500 2.100 3.300 2.700 5 1.700 1.700 1 3.500.4 5-1.700 2.200-3.100 2.600-7.300.6-9.300-1.600-1.600-4-1.400-5.600 0z"/><path d="M12 7.500c0-2 1-3.500 2.800-4.200"/></svg>',
  water: '<svg viewBox="0 0 24 24"><path d="M12 3.200c3.300 4 5.800 7.300 5.800 10.600a5.800 5.800 0 0 1-11.600 0c0-3.300 2.500-6.600 5.800-10.600z"/></svg>',
  energy: '<svg viewBox="0 0 24 24"><path d="M13.500 2.800L5.500 13.500h5.500l-1 7.700 8.500-11.200h-5.800z"/></svg>',
  cheer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.800"/><path d="M8.300 14c1 1.600 2.200 2.300 3.700 2.300s2.700-.7 3.700-2.300M9 9.800v.4M15 9.800v.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>',
};

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const icon = (name, cls = 'ico') => { const s = el('span', cls); s.innerHTML = ICONS[name]; return s; };

// ---- The paper map ---------------------------------------------------------------
const MAP = 720, MK = 4.25, MCX = 362, MCY = 378;
const mx = (x) => MCX + x * MK, mz = (z) => MCY + z * MK;
const LABELS = [
  ['Summit camp', LOOKOUT, 92, 196], ['Pond', POND, 66, 404], ['Beach camp', CAMPFIRE, 96, 612], ['Food tent', { x: 12, z: 25 }, 318, 668],
  ['Flying fox landing', ZIPLINE.bottom, 556, 652], ['Farm', { x: 33, z: 27 }, 652, 566], ['Dock', { x: DOCK.x + 6, z: DOCK.z + 2 }, 662, 474],
  ['Guard post', TOWER, 650, 388], ['First aid', { x: 19.5, z: -9 }, 646, 300], ['Windmill', WINDMILL, 604, 186], ['Headquarters', { x: 9, z: -7.5 }, 404, 96], ['Flagpole', FLAGPOLE, 226, 104],
];

function drawPaperMap(c) {
  c.clearRect(0, 0, MAP, MAP);
  c.fillStyle = '#bfe6f6'; c.fillRect(0, 0, MAP, MAP);
  // faint fold lines
  c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 3;
  for (const x of [MAP / 3, (2 * MAP) / 3]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, MAP); c.stroke(); }
  c.beginPath(); c.moveTo(0, MAP / 2); c.lineTo(MAP, MAP / 2); c.stroke();
  // the island: surf, sand with a wobbly edge, then the land
  const blobPath = (radius, wob) => { c.beginPath(); for (let i = 0; i <= 120; i++) { const a = (i / 120) * Math.PI * 2, r = radius + Math.sin(a * 7) * wob + Math.sin(a * 13 + 1) * wob * 0.6; const x = MCX + Math.cos(a) * r * MK, y = MCY + Math.sin(a) * r * MK; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); };
  c.fillStyle = 'rgba(255,255,255,0.75)'; blobPath(ISLAND_RADIUS + 2.2, 0.9); c.fill();
  c.fillStyle = '#f6e3b6'; blobPath(ISLAND_RADIUS, 0.8); c.fill();
  c.fillStyle = '#c7cf8a'; blobPath(GRASS_RADIUS, 0.7); c.fill();
  c.fillStyle = '#ecd58f'; c.beginPath(); c.arc(mx(10), mz(8), 26 * MK, 0, Math.PI * 2); c.fill(); // the camp clearing
  // the hill, in rings
  for (const [r, col] of [[1, '#b9c383'], [0.72, '#cfc98c'], [0.45, '#e0d29a'], [0.22, '#efe0b0']]) { c.fillStyle = col; c.beginPath(); c.ellipse(mx(HILL.x), mz(HILL.z), HILL.radius * r * MK, HILL.radius * r * MK * 0.94, 0.5, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#8fd0e6'; c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(mx(POND.x), mz(POND.z), POND.rw * MK, 0, Math.PI * 2); c.fill(); c.stroke();
  // trees as little dots
  for (const t of getScatter().trees) { c.fillStyle = t.kind === 3 ? '#8aa35c' : '#6f8f55'; c.beginPath(); c.arc(mx(t.x), mz(t.z), 2.2 + t.scale * 1.6, 0, Math.PI * 2); c.fill(); }
  // trails
  c.strokeStyle = '#b98a55'; c.lineWidth = 3.2; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const path of PATHS) { c.beginPath(); path.forEach((p, i) => (i ? c.lineTo(mx(p.x), mz(p.z)) : c.moveTo(mx(p.x), mz(p.z)))); c.stroke(); }
  c.fillStyle = '#f7e9c0'; c.beginPath(); c.arc(mx(10), mz(8), 5.2 * MK, 0, Math.PI * 2); c.fill();
  // dock and the flying fox cable
  c.strokeStyle = '#8c6444'; c.lineWidth = 5; c.beginPath(); c.moveTo(mx(DOCK.x), mz(DOCK.z)); c.lineTo(mx(DOCK.x + Math.sin(DOCK.rot) * DOCK.length), mz(DOCK.z + Math.cos(DOCK.rot) * DOCK.length)); c.stroke();
  c.strokeStyle = '#5b4a7a'; c.lineWidth = 2; c.setLineDash([7, 5]); c.beginPath(); c.moveTo(mx(ZIPLINE.top.x), mz(ZIPLINE.top.z)); c.lineTo(mx(ZIPLINE.bottom.x), mz(ZIPLINE.bottom.z)); c.stroke(); c.setLineDash([]);
  // tents
  for (const h of COTTAGES) {
    c.save(); c.translate(mx(h.x), mz(h.z)); c.rotate(-h.rot);
    const w = h.width * MK * 1.15, d = h.depth * MK * 1.15;
    c.fillStyle = h.type === 'aid' ? '#ffffff' : h.type === 'mess' ? '#f0a070' : h.type === 'hall' ? '#fff3d6' : h.type === 'farm' ? '#9fb878' : '#f6efe0';
    c.strokeStyle = '#7a5a3c'; c.lineWidth = 1.5; c.fillRect(-w / 2, -d / 2, w, d); c.strokeRect(-w / 2, -d / 2, w, d);
    c.beginPath(); c.moveTo(0, -d / 2); c.lineTo(0, d / 2); c.stroke();
    if (h.type === 'aid') { c.fillStyle = '#d9453a'; c.fillRect(-1.5, -5, 3, 10); c.fillRect(-5, -1.5, 10, 3); }
    c.restore();
  }
  for (const t of TENTS) { c.fillStyle = '#e99a72'; c.strokeStyle = '#7a5a3c'; c.lineWidth = 1; c.beginPath(); c.moveTo(mx(t.x), mz(t.z) - 6); c.lineTo(mx(t.x) + 5.5, mz(t.z) + 4.5); c.lineTo(mx(t.x) - 5.5, mz(t.z) + 4.5); c.closePath(); c.fill(); c.stroke(); }
  for (const f of CAMPFIRES) { c.fillStyle = '#ff7a2c'; c.beginPath(); c.arc(mx(f.x), mz(f.z), 4.5, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(mx(f.x), mz(f.z), 2, 0, Math.PI * 2); c.fill(); }
  // windmill and flag
  c.strokeStyle = '#7a5a3c'; c.lineWidth = 2; c.fillStyle = '#fff'; c.beginPath(); c.arc(mx(WINDMILL.x), mz(WINDMILL.z), 6, 0, Math.PI * 2); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(mx(WINDMILL.x) - 10, mz(WINDMILL.z) - 10); c.lineTo(mx(WINDMILL.x) + 10, mz(WINDMILL.z) + 10); c.moveTo(mx(WINDMILL.x) + 10, mz(WINDMILL.z) - 10); c.lineTo(mx(WINDMILL.x) - 10, mz(WINDMILL.z) + 10); c.stroke();
  c.fillStyle = '#6a3f9c'; c.fillRect(mx(FLAGPOLE.x), mz(FLAGPOLE.z) - 12, 11, 7); c.fillStyle = '#7a5a3c'; c.fillRect(mx(FLAGPOLE.x) - 1, mz(FLAGPOLE.z) - 12, 2, 13);
  // labels on paper tags, each with a line to its place
  c.font = '700 15px ui-rounded, "SF Pro Rounded", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const [text, at, lx, ly] of LABELS) {
    const w = c.measureText(text).width + 22, tx = mx(at.x), ty = mz(at.z);
    c.strokeStyle = 'rgba(60,50,70,0.35)'; c.lineWidth = 5; c.beginPath(); c.moveTo(lx, ly); c.lineTo(tx, ty); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(lx, ly); c.lineTo(tx, ty); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(tx, ty, 4, 0, Math.PI * 2); c.fill();
    c.save(); c.translate(lx, ly); c.rotate(((text.length % 5) - 2) * 0.012);
    c.shadowColor = 'rgba(40,50,70,0.25)'; c.shadowBlur = 6; c.shadowOffsetY = 2; c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(-w / 2, -15, w, 30, 5); c.fill();
    c.shadowColor = 'transparent'; c.fillStyle = '#3d4a5c'; c.fillText(text, 0, 1); c.restore();
  }
  // title and compass
  c.save(); c.translate(40, 58); c.rotate(-0.045); c.textAlign = 'left'; c.fillStyle = '#3f6f9a'; c.font = '800 34px ui-rounded, "SF Pro Rounded", system-ui, sans-serif'; c.fillText('SCOUT CAMP ISLAND', 0, 0); c.restore();
  c.save(); c.translate(86, 290); c.strokeStyle = '#3f6f9a'; c.fillStyle = '#3f6f9a'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, -24); c.lineTo(6, 0); c.lineTo(0, 24); c.lineTo(-6, 0); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-24, 0); c.lineTo(0, -5); c.lineTo(24, 0); c.lineTo(0, 5); c.closePath(); c.stroke();
  c.font = '800 13px ui-rounded, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('N', 0, -34); c.fillText('S', 0, 36); c.fillText('W', -34, 1); c.fillText('E', 34, 1); c.restore();
}

export function createHUD(handlers) {
  const root = el('div'); root.id = 'hud';
  document.body.appendChild(root);

  // ---- Top-left: rank and the time, as plain white text
  const tl = el('div', 'tl');
  const rankLine = el('div', 'rank'); const num = el('b', 'num', '0'); const rankName = el('span', 'name', 'New Scout');
  rankLine.append(icon('star', 'ico gold'), num, rankName);
  const bar = el('div', 'bar'); const barFill = el('i'); bar.append(barFill);
  const clockLine = el('div', 'line'); const clockIco = icon('sun'); const time = el('b', 'time'); const phase = el('span');
  clockLine.append(clockIco, time, phase);
  const nowLine = el('div', 'line now');
  // How you are feeling: four thin white bars
  const statBox = el('div', 'stats'); const statRows = {};
  for (const k of STAT_KEYS) { const row = el('div', 'stat'); row.title = STAT_LABEL[k]; const fill = el('i'); const meter = el('div', 'meter'); meter.append(fill); row.append(icon(k), meter); statBox.append(row); statRows[k] = { row, fill }; }
  tl.append(rankLine, bar, clockLine, nowLine, statBox);

  // ---- Bottom-left: line-drawn buttons, and what you are standing on
  const bl = el('div', 'bl');
  const ground = el('div', 'ground'); const groundDot = el('i'); const groundText = el('span'); ground.append(groundDot, groundText);
  const tools = el('div', 'tools');
  const mkBtn = (name, title, key) => { const b = el('button', 'tool'); b.innerHTML = ICONS[name]; b.title = title; b.append(el('em', null, key)); return b; };
  const bagBtn = mkBtn('bag', 'Backpack', 'B');
  const journalBtn = mkBtn('book', 'Journal', 'J'), mapBtn = mkBtn('map', 'Map', 'M'), lookBtn = mkBtn('mouse', 'Free look: move the mouse to turn the camera', 'C'), soundBtn = mkBtn('sound', 'Sound', 'N'), menuBtn = mkBtn('pause', 'Pause', 'Esc');
  const dot = el('span', 'dot'); journalBtn.append(dot);
  tools.append(bagBtn, journalBtn, mapBtn, lookBtn, soundBtn, menuBtn);
  bl.append(ground, tools);

  // ---- Bottom-centre: the first few pockets of the backpack, one key each
  const belt = el('div', 'belt');

  // ---- Backpack: a canvas flap with pockets
  const packSheet = el('div', 'sheet packsheet off');
  const pack = el('div', 'pack');
  const packHead = el('div', 'head'); const packTitle = el('h2', null, 'Backpack'); const packCount = el('span', 'count'); packHead.append(packTitle, packCount);
  const feel = el('div', 'feel'); const feelRows = {};
  for (const k of STAT_KEYS) { const r = el('div', 'f'); const fill = el('i'); const m = el('div', 'meter'); m.append(fill); const n = el('b'); r.append(icon(k), el('span', null, STAT_LABEL[k]), m, n); feel.append(r); feelRows[k] = { r, fill, n }; }
  const grid = el('div', 'grid');
  const detail = el('div', 'detail');
  pack.append(packHead, feel, grid, detail);
  packSheet.append(pack);
  let bagView = { slots: [], capacity: 12 }, selected = 0;

  // ---- Bottom-right: what the keys do right now
  const hints = el('div', 'hints');

  // ---- Pop-ups
  const toasts = el('div', 'toasts');
  const banner = el('div', 'banner'); const bannerBig = el('div', 'big'); const bannerSmall = el('div', 'small'); banner.append(bannerBig, el('i'), bannerSmall);
  const bubble = el('div', 'bubble'); const bubbleName = el('div', 'who'); const bubbleText = el('div', 'said'); bubble.append(bubbleName, bubbleText);

  // ---- Journal: a spiral notebook
  const book = el('div', 'sheet book off');
  const page = el('div', 'page');
  const rings = el('div', 'rings'); for (let i = 0; i < 9; i++) rings.append(el('i'));
  const bookHead = el('div', 'head'); const sumRank = el('h2'); const sumText = el('p');
  bookHead.append(sumRank, sumText);
  const lists = el('div', 'lists');
  const foot = el('div', 'foot');
  page.append(bookHead, lists, foot);
  book.append(rings, page);

  // ---- Map: a folded paper sheet
  const sheet = el('div', 'sheet mapsheet off');
  const paper = el('div', 'paper');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const baseMap = document.createElement('canvas'); baseMap.width = baseMap.height = MAP * dpr;
  const bctx = baseMap.getContext('2d'); bctx.scale(dpr, dpr); drawPaperMap(bctx);
  const mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = MAP * dpr;
  const mctx = mapCanvas.getContext('2d');
  paper.append(mapCanvas); sheet.append(paper);

  // ---- Start screen: just the name of the place
  const start = el('div', 'overlay start');
  start.append(el('h1', null, 'Scout Camp Island'), el('p', 'sub', 'a little camp by the sea'), el('p', 'press', 'Press any key to begin'));

  // ---- Pause menu: white words on the dimmed picture
  const menu = el('div', 'overlay menu off');
  const resume = el('button', 'word', 'Resume'), openJournal = el('button', 'word', 'Journal'), openMap = el('button', 'word', 'Map'), lookRow = el('button', 'word'), soundRow = el('button', 'word');
  const timeRow = el('div', 'times'); timeRow.append(el('span', 'label', 'Time of day'));
  for (const [name, t] of TIMES) { const b = el('button', 'word small', name); b.addEventListener('click', () => handlers.onSetTime(t)); timeRow.append(b); }
  const controls = el('div', 'keys');
  for (const [k, v] of [['W A S D', 'Move'], ['Shift', 'Run'], ['Space', 'Hop'], ['E', 'Use / pick up / say hello'], ['B', 'Backpack'], ['1 – 6', 'Use what is in a pocket'], ['F', 'Join in with the camp'], ['X', 'Sit down / stand up'], ['Mouse drag', 'Look around'], ['C', 'Free look on / off'], ['Scroll', 'Zoom'], ['J', 'Journal'], ['M', 'Map'], ['N', 'Sound'], ['Esc', 'Pause']]) {
    const r = el('div', 'key'); r.append(el('kbd', null, k), el('span', null, v)); controls.append(r);
  }
  menu.append(el('h2', null, 'Paused'), resume, openJournal, openMap, lookRow, soundRow, timeRow, controls);

  const night = el('div', 'sleep'); night.append(el('div', 'zz', 'Z z z'), el('div', 'sub', 'Sleeping until morning. Press any movement key to get up.'));
  root.append(night, tl, bl, belt, hints, toasts, banner, bubble, book, sheet, packSheet, start, menu);

  resume.addEventListener('click', () => handlers.onResume());
  menuBtn.addEventListener('click', () => handlers.onToggleMenu());
  soundBtn.addEventListener('click', () => handlers.onToggleSound());
  soundRow.addEventListener('click', () => handlers.onToggleSound());
  journalBtn.addEventListener('click', () => handlers.onToggleJournal());
  mapBtn.addEventListener('click', () => handlers.onToggleMap());
  lookBtn.addEventListener('click', () => handlers.onToggleLook());
  lookRow.addEventListener('click', () => handlers.onToggleLook());
  openJournal.addEventListener('click', () => { handlers.onResume(); if (!hud.journalOpen) handlers.onToggleJournal(); });
  openMap.addEventListener('click', () => { handlers.onResume(); if (!hud.mapOpen) handlers.onToggleMap(); });
  book.addEventListener('click', (e) => { if (e.target === book) handlers.onToggleJournal(); });
  bagBtn.addEventListener('click', () => handlers.onToggleBag());
  packSheet.addEventListener('click', (e) => { if (e.target === packSheet) handlers.onToggleBag(); });
  sheet.addEventListener('click', () => handlers.onToggleMap());
  // Buttons must not keep keyboard focus, or Space and Enter would press them again.
  root.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });

  let lastClock = '', lastGround = '', lastHints = '', bannerTimer = null, bubbleTimer = null, steps = 0, frame = 0;

  const hud = {
    menuOpen: false, started: false, journalOpen: false, mapOpen: false, bagOpen: false,
    begin() { hud.started = true; start.classList.add('off'); root.classList.add('playing'); },
    openMenu() { hud.menuOpen = true; menu.classList.remove('off'); },
    closeMenu() { hud.menuOpen = false; menu.classList.add('off'); },
    toggleJournal() { hud.journalOpen = !hud.journalOpen; book.classList.toggle('off', !hud.journalOpen); dot.classList.remove('on'); if (hud.journalOpen && hud.mapOpen) hud.toggleMap(); if (hud.journalOpen && hud.bagOpen) hud.toggleBag(); },
    toggleBag() { hud.bagOpen = !hud.bagOpen; packSheet.classList.toggle('off', !hud.bagOpen); if (hud.bagOpen) { if (hud.journalOpen) hud.toggleJournal(); if (hud.mapOpen) hud.toggleMap(); renderDetail(); } },
    // The bars top-left and the numbers in the backpack.
    setStats(s) {
      for (const k of STAT_KEYS) {
        const v = Math.round(s[k]), low = s[k] < LOW;
        if (statRows[k].v === v) continue;
        statRows[k].v = v; statRows[k].fill.style.width = `${v}%`; statRows[k].row.classList.toggle('low', low);
        feelRows[k].fill.style.width = `${v}%`; feelRows[k].n.textContent = v; feelRows[k].r.classList.toggle('low', low);
      }
      statRows.energy.row.classList.toggle('low', s.winded || s.energy < LOW);
    },
    // view: { slots: [{ id, count, label? }], capacity }. Redraws the belt and the pockets.
    setBag(view) {
      bagView = view;
      if (selected >= view.slots.length) selected = Math.max(0, view.slots.length - 1);
      belt.replaceChildren(...view.slots.slice(0, 6).map((s, i) => {
        const b = el('button', 'slot'); b.title = ITEMS[s.id].name;
        b.append(el('span', 'pic', ITEMS[s.id].icon), el('b', null, s.label || (s.count > 1 ? String(s.count) : '')), el('em', null, String(i + 1)));
        b.addEventListener('click', () => handlers.onUseItem(s.id));
        return b;
      }));
      packCount.textContent = `${view.slots.length} of ${view.capacity} pockets`;
      const cells = [];
      for (let i = 0; i < view.capacity; i++) {
        const s = view.slots[i], c = el('button', s ? (i === selected ? 'cell on' : 'cell') : 'cell empty');
        if (s) { c.append(el('span', 'pic', ITEMS[s.id].icon), el('b', null, s.label || (s.count > 1 ? String(s.count) : ''))); if (i < 6) c.append(el('em', null, String(i + 1))); c.addEventListener('click', () => { selected = i; hud.setBag(bagView); }); c.addEventListener('dblclick', () => handlers.onUseItem(s.id)); }
        cells.push(c);
      }
      grid.replaceChildren(...cells);
      renderDetail();
    },
    // A plain line of news at the top: what you picked up, how you feel.
    note(text, pic = '') {
      const t = el('div', 'toast note');
      if (pic) t.append(el('span', 'pic', pic));
      t.append(el('span', 'label', text));
      toasts.append(t);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3200);
    },
    toggleMap() { hud.mapOpen = !hud.mapOpen; sheet.classList.toggle('off', !hud.mapOpen); if (hud.mapOpen && hud.journalOpen) hud.toggleJournal(); },
    setSound(on) { soundBtn.classList.toggle('muted', !on); soundRow.textContent = on ? 'Sound: on' : 'Sound: off'; },
    setLook(on) { lookBtn.classList.toggle('active', on); lookRow.textContent = on ? 'Camera: free look' : 'Camera: hold and drag'; },
    setSleeping(on) { root.classList.toggle('asleep', on); },
    setActivity(label) { nowLine.textContent = label; },
    setJoin() {}, // the join hint now lives in the key list
    setClock(text, phaseText, isNight, dayNumber) {
      const key = `${text}|${dayNumber}`;
      if (key === lastClock) return;
      lastClock = key;
      clockIco.innerHTML = ICONS[isNight ? 'moon' : 'sun'];
      time.textContent = text; phase.textContent = `${phaseText} · Day ${dayNumber}`;
    },
    setSteps(n) { steps = n; },
    setGround(label, color) { if (label === lastGround) return; lastGround = label; groundText.textContent = label; groundDot.style.background = color; },
    // The list of keys, bottom-right: only what is useful at this moment.
    setHints(list) {
      const key = list.map((h) => `${h[0]}:${h[1]}:${h[2] ? 1 : 0}`).join('|');
      if (key === lastHints) return;
      lastHints = key;
      hints.replaceChildren(...list.map(([k, label, strong]) => { const r = el('div', strong ? 'hint strong' : 'hint'); r.append(el('kbd', null, k), el('span', null, label)); return r; }));
    },
    // Rank, progress bar and the notebook pages all come from the same numbers.
    setProgress(list, rank, count, total) {
      num.textContent = count;
      const span = rank.next ? rank.next.at - rank.from : 1, pct = rank.next ? Math.round(((count - rank.from) / span) * 100) : 100;
      rankName.textContent = rank.name; barFill.style.width = `${pct}%`;
      sumRank.textContent = rank.name;
      sumText.textContent = `${count} of ${total} found. ${rank.next ? `${rank.next.at - count} more to become ${rank.next.name}.` : 'You have found everything!'}`;
      foot.textContent = `${steps.toLocaleString('en-US')} steps walked. Nothing here is required.`;
      lists.replaceChildren(...CATEGORIES.map((cat) => {
        const items = list.filter((d) => d.cat === cat.id), done = items.filter((d) => d.done).length;
        const sec = el('section'); const h = el('h3'); h.append(el('span', null, cat.label), el('b', null, `${done}/${items.length}`)); sec.append(h);
        for (const d of items) {
          const row = el('div', d.done ? 'item done' : 'item');
          const mark = el('span', 'mark'); if (d.done) mark.innerHTML = ICONS.star;
          const txt = el('div'); txt.append(el('div', 'label', d.label), el('div', 'tip', d.done ? 'Found' : d.hint));
          row.append(mark, txt); sec.append(row);
        }
        return sec;
      }));
    },
    toast(label, count, total) {
      const t = el('div', 'toast');
      t.append(icon('star', 'ico gold'), el('span', 'label', label), el('b', 'count', `${count}/${total}`));
      toasts.append(t);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => t.classList.add('out'), 3200);
      setTimeout(() => t.remove(), 3800);
      if (!hud.journalOpen) dot.classList.add('on');
    },
    // Big words across the top: a new rank, or the camp moving on to its next activity.
    announce(small, big) { hud.rankUp(big, small); },
    rankUp(name, small = 'New rank') {
      bannerSmall.textContent = small; bannerBig.textContent = name; banner.classList.add('show');
      clearTimeout(bannerTimer); bannerTimer = setTimeout(() => banner.classList.remove('show'), 3800);
    },
    // A speech bubble over whoever you just spoke to.
    say(name, text) { bubbleName.textContent = name; bubbleText.textContent = text; bubble.classList.add('show'); clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 2800); },
    placeBubble(x, y, onScreen) { bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`; bubble.style.visibility = onScreen ? 'visible' : 'hidden'; },
    // Marks where you and the other scouts are, on the paper map while it is open.
    drawMap(player, facing, villagers) {
      if (!hud.mapOpen || frame++ % 3) return;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.drawImage(baseMap, 0, 0);
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mctx.fillStyle = '#ffffff'; mctx.strokeStyle = 'rgba(60,50,70,0.7)'; mctx.lineWidth = 1.2;
      for (const v of villagers) { mctx.beginPath(); mctx.arc(mx(v.x), mz(v.z), 3.4, 0, Math.PI * 2); mctx.fill(); mctx.stroke(); }
      mctx.save(); mctx.translate(mx(player.x), mz(player.z));
      mctx.fillStyle = 'rgba(255,90,60,0.22)'; mctx.beginPath(); mctx.arc(0, 0, 17 + Math.sin(performance.now() / 300) * 3, 0, Math.PI * 2); mctx.fill();
      mctx.rotate(Math.atan2(facing.x, -facing.z));
      mctx.fillStyle = '#ff5a3c'; mctx.strokeStyle = '#ffffff'; mctx.lineWidth = 2.5;
      mctx.beginPath(); mctx.moveTo(0, -13); mctx.lineTo(9, 9); mctx.lineTo(0, 4); mctx.lineTo(-9, 9); mctx.closePath(); mctx.stroke(); mctx.fill();
      mctx.restore();
    },
  };
  // The card under the pockets: what the chosen thing is and what you can do with it.
  function renderDetail() {
    const s = bagView.slots[selected];
    if (!s) { detail.replaceChildren(el('p', 'none', 'Your backpack is empty. Look around: shells on the beach, sticks and mushrooms in the jungle, berries on the bushes.')); return; }
    const item = ITEMS[s.id], info = handlers.describeItem(s.id);
    const top = el('div', 'top'); const txt = el('div');
    txt.append(el('div', 'kind', KIND_LABEL[item.kind]), el('h3', null, s.label ? `${item.name} · ${s.label}` : s.count > 1 ? `${item.name} ×${s.count}` : item.name), el('p', null, item.desc));
    top.append(el('span', 'big', item.icon), txt);
    const chips = el('div', 'chips'); for (const c of info.chips) chips.append(el('span', c.startsWith('+') ? 'chip' : 'chip plain', c));
    const acts = el('div', 'acts');
    if (info.action) { const b = el('button', 'act main', info.action); b.addEventListener('click', () => handlers.onUseItem(s.id)); acts.append(b); }
    if (info.second) { const b = el('button', 'act', info.second); b.addEventListener('click', () => handlers.onUseItem(s.id, true)); acts.append(b); }
    if (info.canDrop) { const b = el('button', 'act', 'Put down'); b.addEventListener('click', () => handlers.onDropItem(s.id)); acts.append(b); }
    detail.replaceChildren(top, chips, acts);
  }
  hud.setSound(true);
  hud.setLook(false);
  return hud;
}
