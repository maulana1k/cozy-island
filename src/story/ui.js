// INTERNAL. The story's screens, in the HUD's paper-and-notebook style: the conversation panel (portrait, name, text,
// two to four answers on keys 1-4 or a click), the new-game name and look picker, the "waiting..." veil, and the
// journal's Quests, Notes, Field guide and People pages. All text goes in with textContent (the player's name too).
import { GATE_TEXT } from './gates.js';

const CSS = `
#hud .talk { position: absolute; left: 50%; bottom: 26px; width: min(94vw, 760px); transform: translate(-50%, 30px) rotate(-0.6deg); opacity: 0; pointer-events: none; transition: opacity .3s ease, transform .4s cubic-bezier(.2,1.2,.3,1);
  background: #fffdf8; color: var(--ink); text-shadow: none; border-radius: 8px 22px 22px 8px; box-shadow: 0 18px 50px rgba(20,30,50,.35); padding: 18px 24px 16px 132px; box-sizing: border-box; min-height: 150px;
  background-image: linear-gradient(90deg, transparent 116px, #dbe9f4 116px, #dbe9f4 118px, transparent 118px); }
#hud .talk.on { opacity: 1; transform: translate(-50%, 0) rotate(-0.6deg); pointer-events: auto; }
#hud .talk canvas.face { position: absolute; left: 16px; top: 18px; width: 86px; height: 86px; border-radius: 50%; box-shadow: 0 2px 6px rgba(20,30,50,.25); background: #eef2f6; }
#hud .talk .who { position: absolute; left: 12px; top: 112px; width: 94px; text-align: center; font-size: 13px; font-weight: 800; color: #fff; background: #7fb0d6; border-radius: 9px; padding: 3px 4px; letter-spacing: .4px; }
#hud .talk .role { position: absolute; left: 10px; top: 138px; width: 98px; text-align: center; font-size: 10.5px; font-weight: 700; color: #8a95a3; line-height: 1.15; }
#hud .talk .said { font-size: 17px; font-weight: 600; line-height: 1.45; min-height: 50px; }
#hud .talk .answers { display: grid; gap: 6px; margin-top: 12px; }
#hud .talk .ans { display: flex; gap: 10px; align-items: center; text-align: left; font-size: 15px !important; font-weight: 700 !important; color: var(--ink) !important; padding: 7px 12px 7px 7px !important; border-radius: 12px; background: #f3f6f9 !important; transition: transform .12s ease, background .12s ease; }
#hud .talk .ans:hover, #hud .talk .ans:focus-visible { background: #fff2cf !important; transform: translateX(4px); }
#hud .talk .ans kbd { flex: none; }
#hud .talk .bye { position: absolute; right: 16px; top: 10px; font-size: 11px; color: #8a95a3; font-weight: 700; display: flex; gap: 6px; align-items: center; }
#hud .talk .bye kbd { font-size: 10px; padding: 2px 6px; }
#hud.talking .tl, #hud.talking .bl, #hud.talking .hints, #hud.talking .belt, #hud.talking .quest, #hud.talking .way, #hud.talking .tip1 { opacity: 0 !important; }
#hud .picker { position: absolute; right: max(4vw, 24px); top: 50%; width: min(92vw, 380px); transform: translate(40px, -50%) rotate(1.2deg); opacity: 0; pointer-events: none; transition: opacity .35s ease, transform .45s cubic-bezier(.2,1.2,.3,1);
  background: #fffdf8; color: var(--ink); text-shadow: none; border-radius: 22px 8px 8px 22px; box-shadow: 0 18px 50px rgba(20,30,50,.35); padding: 24px 26px 20px; box-sizing: border-box; }
#hud .picker.on { opacity: 1; transform: translate(0, -50%) rotate(1.2deg); pointer-events: auto; }
#hud .picker h2 { margin: 0 0 2px; font-size: 28px; font-weight: 800; }
#hud .picker p { margin: 0 0 14px; font-size: 13px; color: #6a7684; font-weight: 600; }
#hud .picker label { display: block; font-size: 12px; font-weight: 800; letter-spacing: .9px; text-transform: uppercase; color: #7fb0d6; margin: 12px 0 6px; }
#hud .picker input { width: 100%; box-sizing: border-box; font: 700 18px var(--font); color: var(--ink); border: 0; border-bottom: 2px solid #dbe9f4; background: transparent; padding: 4px 2px; outline: none; }
#hud .picker input:focus { border-bottom-color: #f5b301; }
#hud .picker .row { display: flex; gap: 8px; flex-wrap: wrap; }
#hud .picker .sw { width: 32px; height: 32px; border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(0,0,0,.12); transition: transform .12s ease; }
#hud .picker .sw.num { background: #f3f6f9 !important; color: var(--ink) !important; font-weight: 800 !important; font-size: 14px !important; }
#hud .picker .sw:hover { transform: scale(1.12); }
#hud .picker .sw.on { box-shadow: 0 0 0 3px #fffdf8, 0 0 0 5px #f5b301; }
#hud .picker .go { display: flex; gap: 10px; margin-top: 20px; align-items: center; }
#hud .picker .note { font-size: 11px; color: #8a95a3; margin-top: 10px; font-weight: 600; }
#hud .waiting { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; background: rgba(20,26,60,.62); opacity: 0; pointer-events: none; transition: opacity .6s ease; z-index: 6; }
#hud .waiting.on { opacity: 1; pointer-events: auto; }
#hud .waiting .zz { font-size: 34px; font-weight: 800; letter-spacing: 2px; animation: pulse 2.2s ease-in-out infinite; }
#hud .waiting .sub { margin-top: 8px; font-size: 16px; max-width: 520px; }
#hud .start .word.cont { font-size: 34px; opacity: 1; }
#hud .tabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 2px 0 6px; }
#hud .tabs button { font-size: 12.5px !important; font-weight: 800 !important; color: #6a7684 !important; padding: 4px 10px !important; border-radius: 999px; background: #eef2f6 !important; }
#hud .tabs button.on { background: #7fb0d6 !important; color: #fff !important; }
#hud .lists .q { padding: 8px 0 10px; border-bottom: 1.5px solid #e6edf3; }
#hud .lists .q .qn { font-size: 16px; font-weight: 800; }
#hud .lists .q .qs { font-size: 13.5px; color: #4f5b69; font-weight: 600; margin-top: 3px; }
#hud .lists .q .qp { font-size: 12px; color: var(--accent); font-weight: 700; margin-top: 2px; }
#hud .lists .q .gate { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px; color: #b07a1a; font-weight: 700; }
#hud .lists .q .gate button, #hud .lists .help { font-size: 12px !important; font-weight: 800 !important; padding: 4px 11px !important; border-radius: 999px; background: #fff2cf !important; color: #7a5410 !important; }
#hud .lists .step { display: flex; gap: 8px; align-items: baseline; font-size: 13px; padding: 2px 0; color: #5d6875; }
#hud .lists .step.done { color: var(--accent); }
#hud .lists .step.opt { opacity: .75; }
#hud .lists .step i { font-style: normal; width: 14px; flex: none; }
#hud .lists .nt { padding: 8px 0; border-bottom: 1.5px solid #e6edf3; }
#hud .lists .nt b { font-size: 14.5px; } #hud .lists .nt em { font-size: 11px; color: #8a95a3; font-style: normal; font-weight: 700; margin-left: 6px; }
#hud .lists .nt div { font-size: 13px; color: #4f5b69; font-weight: 500; margin-top: 2px; }
#hud .lists .pp { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1.5px solid #e6edf3; }
#hud .lists .pp canvas { width: 46px; height: 46px; border-radius: 50%; flex: none; }
#hud .lists .pp .hearts { color: #e8563f; letter-spacing: 2px; font-size: 14px; }
#hud .lists .pp .hearts span { color: #e3d6d2; }
#hud .lists .chipline { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 2px; }
#hud .lists .chipline span { font-size: 12px; font-weight: 800; padding: 3px 10px; border-radius: 999px; background: #dff0d8; color: #3f7f4a; }
@media (max-width: 720px) { #hud .talk { padding-left: 112px; } #hud .talk .said { font-size: 15px; } }
`;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;

// A little drawn face: skin, hair, hat or bow, eyes and a smile. Things get their icon instead.
export function drawPortrait(canvas, who) {
  const s = 128; canvas.width = canvas.height = s;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, s, s);
  c.fillStyle = '#e4eef6'; c.beginPath(); c.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); c.fill();
  if (!who || who.thing || !who.look) { c.font = '64px system-ui, "Apple Color Emoji", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText((who && who.icon) || '💬', s / 2, s / 2 + 4); return; }
  const L = who.look;
  c.fillStyle = hex(L.shirt || 0xd8c08a); c.beginPath(); c.ellipse(64, 128, 44, 30, 0, Math.PI, 0); c.fill();
  if (L.scarf) { c.fillStyle = hex(L.scarf); c.beginPath(); c.moveTo(44, 100); c.lineTo(84, 100); c.lineTo(64, 122); c.closePath(); c.fill(); }
  c.fillStyle = hex(L.skin); c.beginPath(); c.arc(64, 62, 30, 0, Math.PI * 2); c.fill();
  c.fillStyle = hex(L.hair); c.beginPath(); c.arc(64, 58, 31, Math.PI * 1.02, Math.PI * 1.98); c.fill();
  if (L.hat && !L.bow) { c.fillStyle = hex(L.hat); c.beginPath(); c.ellipse(64, 38, 36, 9, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(64, 38, 22, Math.PI, 0); c.fill(); }
  c.fillStyle = '#2b3440'; c.beginPath(); c.arc(53, 64, 3.6, 0, Math.PI * 2); c.arc(75, 64, 3.6, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(242,141,133,.45)'; c.beginPath(); c.arc(47, 73, 5, 0, Math.PI * 2); c.arc(81, 73, 5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#7a3b2e'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.arc(64, 72, 8, Math.PI * 0.18, Math.PI * 0.82); c.stroke();
}

export const LOOKS = {
  skin: [0xf3d2b4, 0xe6b48a, 0xd9a273, 0xb07850, 0x8a5a3c],
  hair: [0x2f2826, 0x4a3328, 0x8a5a3c, 0xc98f5a, 0xe2c27a],
  style: [0, 1, 2, 3, 4],
  cap: [0xf0d58c, 0xe8503a, 0x4f7fc9, 0x3f8f6a, 0xa66ad0, 0xf2f2ee],
};
export const DEFAULT_LOOK = { skin: 0xd9a273, hair: 0x4a3328, style: 1, cap: 0xf0d58c };
// Letters, digits, spaces and a few marks; at most 14 characters. Empty becomes "Scout".
export const cleanName = (s) => (String(s || '').replace(/[^\p{L}\p{N} '\-.]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14)) || 'Scout';

export function createStoryUI(handlers) {
  const root = document.getElementById('hud');
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  // ---- Conversation panel
  const talk = el('div', 'talk'); const face = el('canvas', 'face'); const who = el('div', 'who'); const role = el('div', 'role'); const said = el('div', 'said'); const answers = el('div', 'answers');
  const bye = el('div', 'bye'); bye.append(el('kbd', null, 'Esc'), el('span', null, 'leave'));
  talk.append(face, who, role, bye, said, answers);
  // ---- Picker
  const picker = el('div', 'picker');
  // ---- Waiting veil
  const veil = el('div', 'waiting'); const veilBig = el('div', 'zz'); const veilSub = el('div', 'sub'); veil.append(veilBig, veilSub);
  root.append(talk, picker, veil);

  let current = null, pick = null;
  const ui = {
    get open() { return !!current; },
    get picking() { return !!pick; },
    // view: { name, text, choices: [{ i, text }] }, person: character data (look, role, icon)
    show(view, person) {
      current = view;
      drawPortrait(face, person); who.textContent = view.name; role.textContent = (person && person.role) || '';
      said.textContent = view.text;
      answers.replaceChildren(...view.choices.map((c, k) => { const b = el('button', 'ans'); b.append(el('kbd', null, String(k + 1)), el('span', null, c.text)); b.addEventListener('click', () => handlers.onChoose(k)); return b; }));
      talk.classList.add('on'); root.classList.add('talking');
    },
    hide() { current = null; talk.classList.remove('on'); root.classList.remove('talking'); },
    // Keys while a conversation is open: 1-4 answer, Esc leaves. Returns true when the key was used here.
    key(e) {
      if (pick) return true; // typing a name
      if (!current) return false;
      const n = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (n) { const k = Number(n[2]) - 1; if (k < current.choices.length) handlers.onChoose(k); return true; }
      if (e.code === 'Escape') { handlers.onLeave(); return true; }
      return true; // everything else waits until the talk is over
    },
    // ---- New game: name and look
    openPicker(start, onChange, onDone, onBack) {
      pick = { ...start };
      picker.replaceChildren();
      const input = el('input'); input.maxLength = 14; input.placeholder = 'Scout'; input.value = start.name || ''; input.setAttribute('aria-label', 'Your name'); input.autocomplete = 'off'; input.spellcheck = false;
      const row = (label, key, list, num) => {
        picker.append(el('label', null, label));
        const r = el('div', 'row');
        list.forEach((v, i) => {
          const b = el('button', num ? 'sw num' : 'sw', num ? String(i + 1) : undefined);
          if (!num) b.style.background = hex(v);
          b.title = `${label} ${i + 1}`;
          if (pick.look[key] === v) b.classList.add('on');
          b.addEventListener('click', () => { pick.look[key] = v; for (const o of r.children) o.classList.toggle('on', o === b); onChange(pick.look); });
          r.append(b);
        });
        picker.append(r);
      };
      picker.append(el('h2', null, 'New scout'), el('p', null, 'What should everyone at camp call you?'));
      picker.append(el('label', null, 'Your name'), input);
      row('Skin', 'skin', LOOKS.skin); row('Hair colour', 'hair', LOOKS.hair); row('Hair style', 'style', LOOKS.style, true); row('Cap', 'cap', LOOKS.cap);
      const go = el('div', 'go'); const ok = el('button', 'act main', 'Start'); const back = el('button', 'act', 'Back'); go.append(ok, back);
      picker.append(go, el('div', 'note', 'Your name stays on this computer. It is only used in conversations.'));
      const finish = () => { const done = { name: cleanName(input.value), look: { ...pick.look } }; pick = null; picker.classList.remove('on'); onDone(done); };
      ok.addEventListener('click', finish);
      back.addEventListener('click', () => { pick = null; picker.classList.remove('on'); onBack(); });
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(); });
      picker.classList.add('on');
      setTimeout(() => { try { input.focus(); } catch { /* fine */ } }, 60);
    },
    // ---- The veil while time is skipped
    veil(big, sub) { veilBig.textContent = big; veilSub.textContent = sub || ''; veil.classList.add('on'); },
    unveil() { veil.classList.remove('on'); },
  };
  return ui;
}

// ---- Journal pages ------------------------------------------------------------------------------------------
// Each returns { title, sub, nodes } for the notebook. ctx: { story, content, waitFor, help, gateOpen }.
export function journalPage(tab, ctx) {
  const { story, content } = ctx, S = story.state;
  if (tab === 'quests') {
    const list = story.quests().sort((a, b) => (a.done - b.done) || ((b.chapter || 0) - (a.chapter || 0)));
    const nodes = [];
    const chips = el('div', 'chipline');
    for (const b of S.badges) chips.append(el('span', null, `${content.badgeList[b].icon} ${content.badgeList[b].name}`));
    for (const g of S.gear) chips.append(el('span', null, `${content.gearList[g].icon} ${content.gearList[g].name}`));
    if (chips.children.length) nodes.push(chips);
    for (const q of list) {
      const box = el('div', 'q');
      box.append(el('div', 'qn', `${q.done ? '✓ ' : ''}${q.title}`));
      if (q.done) { box.append(el('div', 'qp', q.side ? 'Done for today.' : 'Complete.')); nodes.push(box); continue; }
      const st = q.stage;
      box.append(el('div', 'qs', st.text));
      if (st.steps) for (const s of st.steps) { const r = el('div', `step${s.done ? ' done' : ''}${s.optional ? ' opt' : ''}`); r.append(el('i', null, s.done ? '✓' : s.optional ? '·' : '○'), el('span', null, `${s.title}${s.optional ? ' (extra)' : ''}`)); r.title = s.text; box.append(r); }
      if (st.goal && st.goal.n > 1) box.append(el('div', 'qp', `${st.count} of ${st.goal.n}`));
      const gate = st.gate || st.wait;
      if (gate && GATE_TEXT[gate] && !(st.gate && ctx.gateOpen(st.gate))) {
        const g = el('div', 'gate'); g.append(el('span', null, st.gate ? `Only ${GATE_TEXT[gate].when}.` : ''));
        const b = el('button', null, GATE_TEXT[gate].wait); b.addEventListener('click', () => ctx.waitFor(gate)); g.append(b); box.append(g);
      }
      if (q.past.length) box.append(el('div', 'qp', `Done: ${q.past.join(' · ')}`));
      nodes.push(box);
    }
    if (!list.length) nodes.push(el('div', 'qs', 'No quests yet.'));
    const help = el('button', 'help', 'Lost or stuck? Help me back to camp'); help.style.marginTop = '14px'; help.addEventListener('click', () => ctx.help()); nodes.push(help);
    const ch = content.chapters.find((c) => c.n === S.chapter);
    return { title: `Chapter ${S.chapter}`, sub: ch ? ch.title : '', nodes };
  }
  if (tab === 'notes') {
    const nodes = S.notes.slice().reverse().map((id) => { const n = content.clues[id], d = el('div', 'nt'); d.append(el('b', null, n.title), el('em', null, n.from), el('div', null, n.text)); return d; });
    return { title: 'Notes', sub: nodes.length ? `${nodes.length} things learned. Newest first.` : 'Everything you learn is written here.', nodes };
  }
  if (tab === 'guide') {
    const all = Object.entries(content.fieldGuide);
    const nodes = all.map(([id, g]) => {
      const got = S.guide.includes(id), d = el('div', 'nt');
      d.append(el('b', null, `${got ? g.icon : '❔'} ${got ? g.name : 'Not yet seen'}`));
      if (got) d.append(el('div', null, `Eats: ${g.eats}`), el('div', null, `Lives: ${g.lives}`), el('div', null, `Around it: ${g.behave}`));
      return d;
    });
    return { title: 'Field guide', sub: `${S.guide.length} of ${all.length} found. Meet animals and plants to fill it in.`, nodes };
  }
  if (tab === 'people') {
    const nodes = Object.entries(content.people).map(([id, p]) => {
      const met = (S.friendship[id] || 0) > 0, v = S.friendship[id] || 0, r = el('div', 'pp');
      const cv = el('canvas'); drawPortrait(cv, met ? p : { icon: '❔', thing: true });
      const t = el('div'); t.append(el('b', null, met ? p.name : 'Someone you have not met'), el('div', 'qs', met ? p.role : ''));
      const h = el('div', 'hearts'); const full = Math.round(v / 20); h.append(document.createTextNode('♥'.repeat(full))); h.append(el('span', null, '♥'.repeat(5 - full)));
      t.append(h, el('div', 'qp', p.where)); r.append(cv, t);
      return r;
    });
    return { title: 'People', sub: 'Help, chat and listen to grow a friendship.', nodes };
  }
  return null;
}
