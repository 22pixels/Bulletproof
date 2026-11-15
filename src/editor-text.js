import { DEFAULT_BUBBLE, GUARD, BOSS, FLYER, RESPAWN } from './config.js';
import { BOSS_DESIGNS } from './bosses/index.js';
import { ensureTerminal, flattenFs, unflattenFs, setSetting, getSetting, mapTerminals } from './editor-core.js';

const SETTINGS = [
  ['Dying', [
    ['respawn', 'respawn at', RESPAWN, 0, ['checkpoint', 'start']],
  ]],
  ['Guards', [
    ['guard.interval', 'seconds between shots', GUARD.interval, 0.05],
    ['guard.firstDelay', 'seconds before first shot', GUARD.firstDelay, 0.05],
    ['guard.range', 'sight range (cells)', GUARD.range, 1],
  ]],
  ['Flying guards (defaults; each one can override in an event)', [
    ['flyer.mode', 'mode', FLYER.mode, 0, ['patrol', 'follow']],
    ['flyer.range', 'patrol range (cells)', FLYER.range, 1],
    ['flyer.rangeY', 'patrol up/down (cells)', FLYER.rangeY, 0.5],
    ['flyer.speed', 'speed (cells/s)', FLYER.speed, 0.5],
    ['flyer.interval', 'seconds between shots', FLYER.interval, 0.1],
    ['flyer.hover', 'follow: height above you', FLYER.hover, 0.5],
  ]],
  ['Bullet time', [
    ['bubble.duration', 'seconds it lasts', DEFAULT_BUBBLE.duration, 0.5],
    ['bubble.cooldown', 'lockout after (s)', DEFAULT_BUBBLE.cooldown, 0.5],
    ['bubble.playerTimeScale', 'player speed inside (1 = normal)', DEFAULT_BUBBLE.playerTimeScale, 0.05],
    ['bubble.radius', 'radius (cells)', DEFAULT_BUBBLE.radius, 0.5],
  ]],
  ['Boss', [
    ['boss.hp', 'hit points', BOSS.hp, 1],
    ['boss.interval', 'seconds between attacks', BOSS.interval, 0.1],
    ['boss.design', 'boss design (from the boss editor)', 'built-in', 0, Object.keys(BOSS_DESIGNS)],
  ]],
];

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
}
const field = (label, input) => el('label', { className: 'fld' }, el('span', { textContent: label }), input);

function textInput(value, onInput, props = {}) {
  const i = el('input', { type: 'text', value: value ?? '', spellcheck: false, ...props });
  i.addEventListener('input', () => onInput(i.value));
  return i;
}

function area(value, onInput, rows = 3) {
  const a = el('textarea', { value: value ?? '', rows, spellcheck: false, className: 'txt' });
  a.addEventListener('input', () => onInput(a.value));
  return a;
}

export function createTextPanel(root, getDoc, onChange) {
  function render() {
    const doc = getDoc();
    const side = doc.side;
    root.textContent = '';

    root.append(el('h2', { textContent: 'Level text' }));
    root.append(field('name', textInput(side.name, (v) => { side.name = v; onChange(); })));
    const intro = Array.isArray(side.intro) ? side.intro.join('\n') : side.intro || '';
    root.append(field('intro (one line per line)', area(intro, (v) => {
      const lines = v.split('\n');
      if (v.trim()) side.intro = lines; else delete side.intro;
      onChange();
    })));

    for (const [title, rows] of SETTINGS) {
      root.append(el('h2', { textContent: title }));
      const box = el('div', { className: 'grid2' });
      for (const [path, label, def, step, choices] of rows) {
        const cur = getSetting(side, path);
        if (choices) {
          const s = el('select', {}, el('option', { value: '', textContent: `default (${def})` }), ...choices.map((o) => el('option', { value: o, textContent: o })));
          s.value = cur ?? '';
          s.onchange = () => { setSetting(side, path, s.value); onChange(); };
          box.append(field(label, s));
          continue;
        }
        const inp = el('input', { type: 'number', step, value: cur ?? '', placeholder: String(def) });
        inp.addEventListener('input', () => { setSetting(side, path, inp.value === '' ? '' : Number(inp.value)); onChange(); });
        box.append(field(label, inp));
      }
      root.append(box);
    }
    root.append(el('div', { className: 'hint', textContent: 'Blank = default. Smaller "seconds between shots" = faster guards.' }));

    root.append(el('h2', { textContent: 'Terminals' }));
    const letters = [...new Set([...mapTerminals(doc), ...Object.keys(side.terminals || {})])].sort();
    if (!letters.length) root.append(el('div', { className: 'hint', textContent: 'Place a terminal on the map (T) to write its text.' }));
    for (const L of letters) root.append(terminalCard(doc, L));
  }

  function terminalCard(doc, L) {
    const side = doc.side;
    const onMap = mapTerminals(doc).includes(L);
    const card = el('div', { className: 'card' });
    const t = side.terminals?.[L];
    card.append(el('div', { className: 'cardhead', textContent: `terminal ${L}${onMap ? '' : '  (not on the map)'}` }));
    if (!t) {
      card.append(el('button', { textContent: `Create terminal ${L}`, onclick: () => { ensureTerminal(doc, L); onChange(); render(); } }));
      return card;
    }
    card.append(field('name', textInput(t.name, (v) => { t.name = v; onChange(); })));
    card.append(field('host (prompt)', textInput(t.host, (v) => { t.host = v; onChange(); })));

    const rows = flattenFs(t.fs);
    const sync = () => { t.fs = unflattenFs(rows); onChange(); };
    card.append(el('div', { className: 'sub', textContent: 'files  (use / in a name for folders, e.g. logs/a.log; start with . to hide)' }));
    rows.forEach((r, i) => {
      const row = el('div', { className: 'file' });
      row.append(textInput(r.path, (v) => { r.path = v; sync(); }, { placeholder: 'file name' }));
      row.append(el('button', { textContent: '×', title: 'delete file', onclick: () => { rows.splice(i, 1); sync(); render(); } }));
      card.append(row, area(r.text, (v) => { r.text = v; sync(); }, 3));
    });
    card.append(el('button', { textContent: '+ file', onclick: () => { rows.push({ path: `file${rows.length + 1}.txt`, text: '' }); sync(); render(); } }));

    t.unlocks ||= [];
    card.append(el('div', { className: 'sub', textContent: 'unlock codes  (the player types: unlock <code>)' }));
    t.unlocks.forEach((u, i) => {
      const box = el('div', { className: 'unlock' });
      box.append(field('code', textInput(u.code, (v) => { u.code = v; onChange(); })));
      box.append(field('opens doors (e.g. 1,2)', textInput((u.doors || []).join(','), (v) => {
        const d = v.split(/[,\s]+/).filter(Boolean);
        if (d.length) u.doors = d; else delete u.doors;
        onChange();
      })));
      const sel = el('select', {}, ...['none', 'heart', 'wallJump'].map((o) => el('option', { value: o, textContent: o })));
      const rw = u.reward?.heart ? 'heart' : u.reward?.ability === 'wallJump' ? 'wallJump' : 'none';
      sel.value = rw;
      sel.onchange = () => {
        if (sel.value === 'none') delete u.reward;
        else u.reward = sel.value === 'heart' ? { heart: true } : { ability: sel.value };
        onChange();
      };
      box.append(field('reward', sel));
      box.append(field('message', textInput(u.message, (v) => { if (v) u.message = v; else delete u.message; onChange(); })));
      box.append(el('button', { textContent: 'remove code', onclick: () => { t.unlocks.splice(i, 1); onChange(); render(); } }));
      card.append(box);
    });
    card.append(el('button', { textContent: '+ unlock code', onclick: () => { t.unlocks.push({ code: `CODE-${t.unlocks.length + 1}`, message: 'ACCESS GRANTED.' }); onChange(); render(); } }));
    return card;
  }

  function refresh() {
    if (root.contains(document.activeElement) && document.activeElement !== root) return;
    render();
  }
  return { render, refresh };
}
