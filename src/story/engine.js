// INTERNAL. The story engine: pure logic, no Three.js and no DOM (docs/superpowers/specs/2026-11-17-story-quests-design.md,
// section 5.1). It keeps the world state (flags, quests and their stages, friendship, gear, badges, chapter, notes,
// field guide, repeatable side quests), plays dialogue nodes, checks answer-order puzzles, and turns game events into
// quest progress. Content lives in plain data modules (characters, dialogue/*, quests, puzzles, clues, fieldGuide).
//
// Conditions and effects are short strings so the content stays readable:
//   conditions  'flag:x' '!flag:x' 'stage:quest.stage' 'done:quest' '!done:quest' 'active:quest' 'friend:who>=20'
//               'item:stick>=2' 'gear:x' 'badge:x' 'chapter>=2' 'night' 'day' 'lowtide' 'clear' 'side:tpl=offered'
//   effects     'flag:x' 'unflag:x' 'friend:who+5' 'note:id' 'guide:id' 'start:quest' 'advance:quest' 'finish:quest'
//               'gear:id' 'badge:id' 'give:item*2' 'take:item*2' 'chapter:2' 'wait:night|lowtide|clear|morning'
//               'side:tpl=active|done' 'event:name' 'mark:quest.step'
// Effects that reach outside the story (items, waiting, weather) go through the `hooks` the game passes in.

export const SAVE_FIELDS = ['flags', 'quests', 'friendship', 'gear', 'badges', 'chapter', 'notes', 'guide', 'side', 'seen', 'happened', 'name', 'look'];

const clampF = (v) => Math.max(0, Math.min(100, v));

export function createStory(content, hooks = {}) {
  const { characters, dialogue, quests, puzzles, clues, fieldGuide, templates, gearList, badgeList, chapters } = content;
  const QUEST = Object.fromEntries(quests.map((q) => [q.id, q]));
  const NODE = {};
  for (const [who, file] of Object.entries(dialogue)) for (const n of file.nodes) NODE[n.id] = { speaker: who, ...n };
  const listeners = new Set();

  const fresh = () => ({ flags: {}, quests: {}, friendship: {}, gear: [], badges: [], chapter: 1, notes: [], guide: [], side: {}, seen: {}, happened: {}, name: 'Scout', look: null, day: 1 });
  let S = fresh();
  let convo = null; // { who, node, tags: [] }

  const world = () => (hooks.world ? hooks.world() : {});
  const tell = (kind, data) => { for (const f of listeners) f(kind, data); };

  // ---- Conditions ---------------------------------------------------------------------------------------
  function cmp(a, op, b) { return op === '>=' ? a >= b : op === '<=' ? a <= b : op === '>' ? a > b : op === '<' ? a < b : a === b; }
  // '{tpl.key}' in a condition or effect is replaced by today's side-quest value (what to bring, how many).
  const params = (text) => String(text).replace(/\{(\w+)\.(\w+)\}/g, (_, tpl, key) => { const s = S.side[tpl]; return s && s.p && s.p[key] !== undefined ? String(s.p[key]) : ''; });
  function check(cond) {
    if (Array.isArray(cond)) return cond.every(check);
    if (!cond) return true;
    if (cond.includes('{')) cond = params(cond);
    if (cond[0] === '!') return !check(cond.slice(1));
    const w = world();
    if (cond === 'night') return !!w.night;
    if (cond === 'day') return !w.night;
    if (cond === 'lowtide') return !!w.lowTide;
    if (cond === 'clear') return !!w.clear;
    const m = /^(\w+)(?::([\w.-]+))?(?:(>=|<=|>|<|=)([\w.-]+))?$/.exec(cond);
    if (!m) return false;
    const [, kind, arg, op, val] = m;
    switch (kind) {
      case 'flag': return !!S.flags[arg];
      case 'stage': { const [q, st] = arg.split('.'); return isActive(q) && currentStage(q).id === st; }
      case 'active': return isActive(arg);
      case 'done': return !!(S.quests[arg] && S.quests[arg].done);
      case 'started': return !!S.quests[arg];
      case 'friend': return cmp(S.friendship[arg] || 0, op || '>=', Number(val || 1));
      case 'item': return cmp(hooks.count ? hooks.count(arg) : 0, op || '>=', Number(val || 1));
      case 'gear': return S.gear.includes(arg);
      case 'badge': return S.badges.includes(arg);
      case 'note': return S.notes.includes(arg);
      case 'chapter': return cmp(S.chapter, op || '>=', Number(val || 1));
      case 'side': return ((S.side[arg] && S.side[arg].status) || 'none') === val;
      case 'sidep': { const [tpl, key] = arg.split('.'); const s = S.side[tpl]; return !!(s && s.p && String(s.p[key]) === val); }
      case 'seen': return !!S.seen[arg];
      default: return false;
    }
  }

  // ---- Effects ------------------------------------------------------------------------------------------
  function apply(effects) {
    for (const e of [].concat(effects || [])) applyOne(e);
  }
  function applyOne(e) {
    if (e.includes('{')) e = params(e);
    const m = /^(\w+):(.+)$/.exec(e);
    if (!m) return;
    const [, kind, arg] = m;
    switch (kind) {
      case 'flag': if (!S.flags[arg]) { S.flags[arg] = true; tell('flag', arg); } break;
      case 'unflag': delete S.flags[arg]; break;
      case 'friend': { const [who, d] = arg.split(/(?=[+-])/); S.friendship[who] = clampF((S.friendship[who] || 0) + Number(d)); tell('friend', { who, value: S.friendship[who] }); break; }
      case 'note': if (clues[arg] && !S.notes.includes(arg)) { S.notes.push(arg); tell('note', clues[arg]); } break;
      case 'guide': if (fieldGuide[arg] && !S.guide.includes(arg)) { S.guide.push(arg); tell('guide', fieldGuide[arg]); } break;
      case 'start': startQuest(arg); break;
      case 'advance': advance(arg); break;
      case 'finish': while (isActive(arg)) advance(arg); break;
      case 'mark': { const [q, step] = arg.split('.'); markStep(q, step); break; }
      case 'gear': if (gearList[arg] && !S.gear.includes(arg)) { S.gear.push(arg); tell('gear', gearList[arg]); } break;
      case 'badge': if (badgeList[arg] && !S.badges.includes(arg)) { S.badges.push(arg); tell('badge', badgeList[arg]); } break;
      case 'give': { const [id, n] = arg.split('*'); if (hooks.give) hooks.give(id, Number(n || 1)); break; }
      case 'take': { const [id, n] = arg.split('*'); if (hooks.take) hooks.take(id, Number(n || 1)); break; }
      case 'chapter': { const n = Number(arg); if (n > S.chapter) { S.chapter = n; tell('chapter', chapters.find((c) => c.n === n)); } break; }
      case 'wait': if (hooks.wait) hooks.wait(arg); break;
      case 'side': { const [tpl, status] = arg.split('='); setSide(tpl, status); break; }
      case 'event': emit(arg); break;
      default: break;
    }
  }

  // ---- Quests -------------------------------------------------------------------------------------------
  const isActive = (id) => !!(S.quests[id] && !S.quests[id].done);
  const questDef = (id) => QUEST[id] || (S.side[id.replace(/^side\./, '')] && sideDef(id.replace(/^side\./, '')));
  function currentStage(id) { const q = questDef(id), st = S.quests[id]; return q && st ? q.stages[Math.min(st.stage, q.stages.length - 1)] : null; }
  function startQuest(id) {
    const q = questDef(id);
    if (!q || S.quests[id]) return;
    S.quests[id] = { stage: 0, done: false, steps: {}, count: 0 };
    tell('quest', { quest: q, started: true });
    settle();
  }
  function advance(id) {
    const q = questDef(id), st = S.quests[id];
    if (!q || !st || st.done) return;
    const stage = q.stages[st.stage];
    if (stage && stage.then) apply(stage.then);
    st.stage++; st.steps = {}; st.count = 0;
    if (st.stage >= q.stages.length) {
      st.done = true;
      if (q.reward) apply(q.reward);
      if (q.side) setSide(q.side, 'done');
      tell('quest', { quest: q, done: true });
    } else tell('quest', { quest: q, stage: q.stages[st.stage] });
    settle();
  }
  // Checklist stages: tick one step; the stage finishes when every required step is ticked.
  function markStep(id, step) {
    const st = S.quests[id];
    if (!isActive(id) || st.steps[step]) return;
    const stage = currentStage(id);
    if (!stage || !stage.steps || !stage.steps.some((s) => s.id === step)) return;
    st.steps[step] = true;
    tell('step', { quest: questDef(id), step: stage.steps.find((s) => s.id === step) });
    settle();
  }
  // Goals that complete by themselves when the world matches: all flags set, a checklist done.
  let settling = false;
  function settle() {
    if (settling) return;
    settling = true;
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const id of Object.keys(S.quests)) {
        if (!isActive(id)) continue;
        const stage = currentStage(id), g = stage && stage.goal;
        if (!g) continue;
        // Checklist steps count whenever they happened, before or after the stage began.
        if (g.type === 'checklist') for (const s of stage.steps) if (S.happened[s.on] && !S.quests[id].steps[s.id]) { S.quests[id].steps[s.id] = true; tell('step', { quest: questDef(id), step: s }); }
        const ready = (g.type === 'flags' && g.all.every((f) => S.flags[f]))
          || (g.type === 'event' && g.past && S.happened[g.on])
          || (g.type === 'checklist' && stage.steps.filter((s) => !s.optional).every((s) => S.quests[id].steps[s.id]))
          || (g.type === 'cond' && check(g.when));
        if (ready && (!stage.gate || check(stage.gate))) { advance(id); moved = true; }
      }
      if (!moved) break;
    }
    fillSides();
    settling = false;
  }
  // A game event: something was done, found or reached. data.where = { x, z } for visit goals.
  function emit(event, data = {}) {
    S.happened[event] = true;
    for (const id of Object.keys(S.quests)) {
      if (!isActive(id)) continue;
      const stage = currentStage(id), g = stage && stage.goal;
      if (!g) continue;
      if (g.type === 'checklist') continue;
      if (g.type !== 'event' || g.on !== event) continue;
      if (stage.gate && !check(stage.gate)) { tell('gated', { quest: questDef(id), stage }); continue; }
      const st = S.quests[id];
      st.count = (st.count || 0) + 1;
      if (st.count >= (g.n || 1)) advance(id); else tell('count', { quest: questDef(id), stage, count: st.count, of: g.n });
    }
    settle();
  }

  // ---- Repeatable side quests ---------------------------------------------------------------------------
  // S.side[tpl] = { status: 'offered' | 'active' | 'done', day, p: { ...filled template values } }
  function sideDef(tpl) { const t = templates.find((x) => x.id === tpl), s = S.side[tpl]; return t && s ? t.make(s.p, s.day) : null; }
  function setSide(tpl, status) {
    const s = S.side[tpl];
    if (!s) return;
    s.status = status;
    const qid = `side.${tpl}`;
    if (status === 'active') { delete S.quests[qid]; startQuest(qid); }
    if (status === 'done') { if (S.quests[qid]) S.quests[qid].done = true; }
  }
  // A new day: templates fill in afresh (who asks, what for), except a quest already under way.
  function newDay(day) {
    S.day = day;
    fillSides();
    tell('day', day);
  }
  function fillSides() {
    const day = S.day, w = world();
    for (const t of templates) {
      const s = S.side[t.id];
      if (s && s.status === 'active') continue;
      if (s && s.day === day) continue;
      if (t.when && !check(t.when)) { delete S.side[t.id]; continue; }
      S.side[t.id] = { status: 'offered', day, p: t.fill(day, w) };
      delete S.quests[`side.${t.id}`];
    }
  }

  // ---- Dialogue -----------------------------------------------------------------------------------------
  const fill = (text) => {
    const vars = hooks.vars ? hooks.vars() : {};
    return params(text).replace(/\{name\}/g, S.name).replace(/\{(\w+)\}/g, (all, k) => (vars[k] !== undefined ? String(vars[k]) : all));
  };
  // The first entry this person has that is new: an entry is { id, when, node, once = true }.
  function entryFor(who) {
    const file = dialogue[who];
    if (!file) return null;
    for (const e of file.entries) {
      if (e.once !== false && S.seen[e.id]) continue;
      if (check(e.when)) return e;
    }
    return null;
  }
  function viewNode(id) {
    const n = NODE[id];
    if (!n) return null;
    let choices = (n.choices || []).filter((c) => check(c.requires));
    if (!choices.length) choices = [{ text: 'Goodbye.', goto: null }];
    return { id, speaker: n.speaker, name: characters[n.speaker] ? characters[n.speaker].name : n.speaker, text: fill(n.text), choices: choices.slice(0, 4).map((c, i) => ({ i, text: fill(c.text) })), raw: choices.slice(0, 4) };
  }
  function enter(id) {
    const n = NODE[id];
    if (!n) { end(); return null; }
    convo.node = id;
    if (n.sets) apply(n.sets);
    const v = viewNode(id);
    tell('node', v);
    return v;
  }
  function start(who) {
    const e = entryFor(who);
    if (!e) return null;
    convo = { who, entry: e, node: null, tags: [] };
    tell('open', { who });
    return enter(e.node);
  }
  function choose(i) {
    if (!convo) return null;
    const v = viewNode(convo.node), c = v && v.raw[i];
    if (!c) return null;
    if (c.sets) apply(c.sets);
    let next = c.goto;
    if (c.tag) {
      convo.tags.push(c.tag);
      for (const p of puzzles) {
        if (p.character !== convo.who || (!p.repeatable && S.flags[p.solvedFlag]) || (p.when && !check(p.when))) continue;
        const tail = convo.tags.slice(-p.sequence.length);
        if (tail.length === p.sequence.length && tail.every((t, k) => t === p.sequence[k])) { if (p.solvedFlag) apply(`flag:${p.solvedFlag}`); apply(p.reveals.sets); next = p.reveals.node; convo.tags = []; tell('puzzle', p); break; }
        // A wrong order: a friendly answer and a fresh start, never a lock.
        if (p.wrong && convo.tags.length >= p.sequence.length) { next = p.wrong; convo.tags = []; break; }
      }
    }
    if (!next) { end(); return null; }
    return enter(next);
  }
  function end() {
    if (!convo) return;
    const { who, entry } = convo;
    S.seen[entry.id] = true;
    convo = null;
    apply(`friend:${who}+1`);
    tell('close', { who });
    settle();
  }

  // ---- What the HUD needs -------------------------------------------------------------------------------
  function questView(id) {
    const q = questDef(id), st = S.quests[id];
    if (!q || !st) return null;
    const stage = st.done ? null : q.stages[st.stage];
    return {
      id, title: q.title, chapter: q.chapter, side: !!q.side, giver: q.giver, done: st.done, stageIndex: st.stage, stageCount: q.stages.length,
      stage: stage && { ...stage, text: fill(stage.text), steps: stage.steps && stage.steps.map((s) => ({ ...s, done: !!st.steps[s.id] })), count: st.count || 0 },
      past: q.stages.slice(0, st.stage).map((s) => fill(s.title || s.text)),
    };
  }
  const story = {
    get state() { return S; },
    get talking() { return !!convo; },
    get conversation() { return convo; },
    on(f) { listeners.add(f); return () => listeners.delete(f); },
    check, apply, emit, newDay, startQuest, advance, markStep, settle,
    // Something new to say: an unseen entry whose conditions hold.
    hasNew: (who) => !!entryFor(who),
    start, choose, end, fill,
    node: () => (convo ? viewNode(convo.node) : null),
    questView,
    quests: () => Object.keys(S.quests).map(questView).filter(Boolean),
    // The quest the top-right card follows: the chapter's main quest, otherwise an active side quest.
    tracked() {
      const ids = Object.keys(S.quests).filter(isActive);
      const main = ids.find((id) => QUEST[id] && QUEST[id].main);
      const id = main || ids.find((x) => x.startsWith('side.')) || ids[0];
      return id ? questView(id) : null;
    },
    setName(n) { S.name = n; },
    setLook(l) { S.look = l; },
    newGame(name = 'Scout', look = null) { S = fresh(); S.name = name; S.look = look; convo = null; if (content.opening) apply(content.opening); },
    // Save: plain data only. Load: unknown ids are dropped, missing ones start fresh.
    serialise() { const o = {}; for (const k of SAVE_FIELDS) o[k] = JSON.parse(JSON.stringify(S[k])); o.day = S.day; return o; },
    restore(o) {
      S = fresh();
      if (!o || typeof o !== 'object') return;
      const knownQuest = (id) => !!QUEST[id] || (id.startsWith('side.') && templates.some((t) => `side.${t.id}` === id));
      if (o.flags && typeof o.flags === 'object') for (const k of Object.keys(o.flags)) if (o.flags[k]) S.flags[k] = true;
      if (o.side && typeof o.side === 'object') for (const t of templates) { const s = o.side[t.id]; if (s && ['offered', 'active', 'done', 'declined'].includes(s.status) && s.p) S.side[t.id] = { status: s.status, day: Number(s.day) || 1, p: s.p }; }
      if (o.quests && typeof o.quests === 'object') for (const [id, st] of Object.entries(o.quests)) {
        if (!knownQuest(id) || !st || (id.startsWith('side.') && !S.side[id.slice(5)])) continue;
        const q = questDef(id); if (!q) continue;
        S.quests[id] = { stage: Math.max(0, Math.min(q.stages.length, Number(st.stage) || 0)), done: !!st.done, steps: st.steps && typeof st.steps === 'object' ? { ...st.steps } : {}, count: Number(st.count) || 0 };
      }
      if (o.friendship) for (const k of Object.keys(characters)) if (Number.isFinite(o.friendship[k])) S.friendship[k] = clampF(o.friendship[k]);
      if (Array.isArray(o.gear)) S.gear = o.gear.filter((g) => gearList[g]);
      if (Array.isArray(o.badges)) S.badges = o.badges.filter((b) => badgeList[b]);
      if (Array.isArray(o.notes)) S.notes = o.notes.filter((n) => clues[n]);
      if (Array.isArray(o.guide)) S.guide = o.guide.filter((g) => fieldGuide[g]);
      if (o.seen && typeof o.seen === 'object') for (const k of Object.keys(o.seen)) S.seen[k] = true;
      if (o.happened && typeof o.happened === 'object') for (const k of Object.keys(o.happened)) S.happened[k] = true;
      S.chapter = Math.max(1, Math.min(chapters.length, Number(o.chapter) || 1));
      if (typeof o.name === 'string') S.name = o.name;
      if (o.look && typeof o.look === 'object') S.look = o.look;
      S.day = Number(o.day) || 1;
      if (content.opening) for (const e of content.opening) if (e.startsWith('start:') && !S.quests[e.slice(6)]) applyOne(e);
      settle();
    },
  };
  return story;
}
