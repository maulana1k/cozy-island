// On-screen interface: start screen, clock and stats, minimap, notices and the pause menu.
import { ISLAND_RADIUS, GRASS_RADIUS, HILL } from './config.js';
import { COTTAGES, COTTAGE_SIZE, PATHS, DOCK, TENTS, CAMPFIRES, BELL } from './logic/layout.js';

const MAP_SIZE = 168;        // CSS pixels
const MAP_WORLD = 70;        // metres from the centre to the edge of the map
const TIMES = [['Morning', 0.2], ['Midday', 0.45], ['Afternoon', 0.66], ['Sunset', 0.78], ['Night', 0.95]];

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function drawStaticMap(ctx, scale) {
  const c = MAP_SIZE / 2, k = (MAP_SIZE / 2) / MAP_WORLD;
  const px = (x) => c + x * k, pz = (z) => c + z * k;
  ctx.save(); ctx.scale(scale, scale);
  ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.beginPath(); ctx.arc(c, c, c - 1, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#8fd6d6'; ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  ctx.fillStyle = '#f7ecca'; ctx.beginPath(); ctx.arc(c, c, ISLAND_RADIUS * k, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b5e09c'; ctx.beginPath(); ctx.arc(c, c, GRASS_RADIUS * k, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(120, 180, 110, 0.55)'; ctx.beginPath(); ctx.arc(px(HILL.x), pz(HILL.z), HILL.radius * 0.55 * k, 0, Math.PI * 2); ctx.fill();
  // Paths
  ctx.strokeStyle = '#ecd7ae'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const path of PATHS) { ctx.beginPath(); path.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z)))); ctx.stroke(); }
  // Dock
  ctx.strokeStyle = '#b98a5e'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(px(DOCK.x), pz(DOCK.z));
  ctx.lineTo(px(DOCK.x + Math.sin(DOCK.rot) * DOCK.length), pz(DOCK.z + Math.cos(DOCK.rot) * DOCK.length)); ctx.stroke();
  // Houses
  for (const h of COTTAGES) {
    ctx.save(); ctx.translate(px(h.x), pz(h.z)); ctx.rotate(-h.rot);
    ctx.fillStyle = '#c9944f'; ctx.strokeStyle = '#8c6444'; ctx.lineWidth = 0.8;
    const w = COTTAGE_SIZE.width * k * 1.25, d = COTTAGE_SIZE.depth * k * 1.25;
    ctx.fillRect(-w / 2, -d / 2, w, d); ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.restore();
  }
  // Tents
  for (const t of TENTS) {
    ctx.fillStyle = '#e9a27a'; ctx.beginPath();
    ctx.moveTo(px(t.x), pz(t.z) - 3.4); ctx.lineTo(px(t.x) + 3.2, pz(t.z) + 2.6); ctx.lineTo(px(t.x) - 3.2, pz(t.z) + 2.6); ctx.closePath(); ctx.fill();
  }
  // Fires and bell
  for (const f of CAMPFIRES) { ctx.fillStyle = '#ff8a3c'; ctx.beginPath(); ctx.arc(px(f.x), pz(f.z), 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.arc(px(BELL.x), pz(BELL.z), 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function createHUD(handlers) {
  const root = el('div'); root.id = 'hud';
  document.body.appendChild(root);

  // ---- Top-left: clock and stats
  const info = el('div', 'panel info');
  const clockRow = el('div', 'clock');
  const icon = el('span', 'icon'), time = el('span', 'time'), phase = el('span', 'phase');
  clockRow.append(icon, time, phase);
  const statsRow = el('div', 'stats');
  const day = el('span', 'chip'), found = el('span', 'chip'), steps = el('span', 'chip');
  statsRow.append(day, found, steps);
  info.append(clockRow, statsRow);

  // ---- Top-right: buttons and minimap
  const right = el('div', 'right');
  const buttons = el('div', 'buttons');
  const soundBtn = el('button', 'round', '♪'); soundBtn.title = 'Sound (M)';
  const menuBtn = el('button', 'round', '☰'); menuBtn.title = 'Menu (Esc)';
  buttons.append(soundBtn, menuBtn);
  const mapWrap = el('div', 'map');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const mapStatic = document.createElement('canvas'); mapStatic.width = mapStatic.height = MAP_SIZE * dpr;
  drawStaticMap(mapStatic.getContext('2d'), dpr);
  const map = document.createElement('canvas'); map.width = map.height = MAP_SIZE * dpr;
  map.style.width = map.style.height = `${MAP_SIZE}px`;
  const mapCtx = map.getContext('2d');
  mapWrap.append(map, el('span', 'north', 'N'));
  right.append(buttons, mapWrap);

  // ---- Notices
  const toasts = el('div', 'toasts');

  // ---- Start screen
  const start = el('div', 'overlay start');
  const startCard = el('div', 'card');
  startCard.append(el('h1', null, 'Cozy Island'), el('p', 'sub', 'A quiet little island with a wooden village. Nothing to win, nowhere to be.'), el('p', 'press', 'Press any key or click to begin'));
  start.append(startCard);

  // ---- Pause menu
  const menu = el('div', 'overlay menu hidden-overlay');
  const card = el('div', 'card wide');
  card.append(el('h2', null, 'Paused'));
  const resume = el('button', 'big', 'Resume');
  const soundRow = el('button', 'big ghost');
  const timeRow = el('div', 'row');
  timeRow.append(el('span', 'label', 'Time of day'));
  for (const [name, t] of TIMES) {
    const b = el('button', 'small', name);
    b.addEventListener('click', () => handlers.onSetTime(t));
    timeRow.append(b);
  }
  const cols = el('div', 'cols');
  const journalCol = el('div', 'col'); const journalTitle = el('h3'); const journalList = el('ul', 'journal');
  journalCol.append(journalTitle, journalList);
  const controlsCol = el('div', 'col');
  controlsCol.append(el('h3', null, 'Controls'));
  const controls = el('ul', 'controls');
  for (const [k, v] of [['W A S D / arrows', 'Move'], ['Shift', 'Run'], ['Space', 'Hop'], ['E', 'Use what is in front of you'], ['Drag mouse', 'Turn the camera'], ['Scroll', 'Zoom'], ['M', 'Sound on / off'], ['Esc', 'Open or close this menu']]) {
    const li = el('li'); li.append(el('kbd', null, k), el('span', null, v)); controls.append(li);
  }
  controlsCol.append(controls);
  cols.append(journalCol, controlsCol);
  card.append(resume, soundRow, timeRow, cols);
  menu.append(card);

  root.append(info, right, toasts, start, menu);

  resume.addEventListener('click', () => handlers.onResume());
  menuBtn.addEventListener('click', () => handlers.onToggleMenu());
  soundBtn.addEventListener('click', () => handlers.onToggleSound());
  soundRow.addEventListener('click', () => handlers.onToggleSound());
  // Buttons must not keep keyboard focus, or Space and Enter would press them again.
  root.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') e.target.blur(); });

  let lastClock = '', lastStats = '', frame = 0;
  const k = (MAP_SIZE / 2) / MAP_WORLD, c = MAP_SIZE / 2;

  const hud = {
    menuOpen: false,
    started: false,
    begin() { hud.started = true; start.classList.add('hidden-overlay'); root.classList.add('playing'); },
    openMenu() { hud.menuOpen = true; menu.classList.remove('hidden-overlay'); },
    closeMenu() { hud.menuOpen = false; menu.classList.add('hidden-overlay'); },
    setSound(on) {
      soundBtn.classList.toggle('off', !on);
      soundRow.textContent = on ? 'Sound: on' : 'Sound: off';
    },
    setClock(text, phaseText, isNight, dayNumber) {
      const key = `${text}|${phaseText}|${dayNumber}`;
      if (key === lastClock) return;
      lastClock = key;
      icon.textContent = isNight ? '☾' : '☀';
      icon.classList.toggle('moon', isNight);
      time.textContent = text; phase.textContent = phaseText; day.textContent = `Day ${dayNumber}`;
    },
    setStats(count, total, stepCount) {
      const key = `${count}|${stepCount}`;
      if (key === lastStats) return;
      lastStats = key;
      found.textContent = `★ ${count} / ${total} found`;
      steps.textContent = `${stepCount} steps`;
    },
    setJournal(list) {
      const done = list.filter((d) => d.done).length;
      journalTitle.textContent = `Journal — ${done} of ${list.length}`;
      journalList.replaceChildren(...list.map((d) => { const li = el('li', d.done ? 'done' : '', d.label); return li; }));
    },
    toast(text) {
      const t = el('div', 'toast', text);
      toasts.append(t);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3200);
    },
    // Redraws the moving dots on the minimap. Cheap, but every other frame is plenty.
    drawMap(player, facing, villagers) {
      if (frame++ % 2) return;
      mapCtx.setTransform(1, 0, 0, 1, 0, 0);
      mapCtx.clearRect(0, 0, map.width, map.height);
      mapCtx.drawImage(mapStatic, 0, 0);
      mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mapCtx.fillStyle = '#ffffff'; mapCtx.strokeStyle = 'rgba(90, 70, 54, 0.7)'; mapCtx.lineWidth = 0.8;
      for (const v of villagers) { mapCtx.beginPath(); mapCtx.arc(c + v.x * k, c + v.z * k, 2.1, 0, Math.PI * 2); mapCtx.fill(); mapCtx.stroke(); }
      // The player is an arrow pointing the way they face.
      mapCtx.save();
      mapCtx.translate(c + player.x * k, c + player.z * k);
      mapCtx.rotate(Math.atan2(facing.x, -facing.z));
      mapCtx.fillStyle = '#ff7a52'; mapCtx.strokeStyle = '#ffffff'; mapCtx.lineWidth = 1.4;
      mapCtx.beginPath(); mapCtx.moveTo(0, -6.5); mapCtx.lineTo(4.6, 4.6); mapCtx.lineTo(0, 2.2); mapCtx.lineTo(-4.6, 4.6); mapCtx.closePath();
      mapCtx.stroke(); mapCtx.fill();
      mapCtx.restore();
    },
  };
  hud.setSound(true);
  return hud;
}
