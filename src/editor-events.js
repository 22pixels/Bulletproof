import { COND_FIELDS, ACTION_FIELDS, OF, AREA, boxOf, WALL_TILES } from './events.js';

const COND_LABEL = {
  allDead: 'all dead', playerAt: 'player near a point', pastX: 'player past a vertical line', pastY: 'player past a horizontal line',
  time: 'seconds since level start', after: 'after another event', doorOpen: 'door is open', keyPress: 'player presses a key', playerDied: 'player dies in a box',
};
const ACT_LABEL = {
  toast: 'show message (fades)', label: 'spawn text in the level', unlabel: 'despawn text', respawnHere: 'respawn here (move player + set respawn point)', wall: 'spawn / remove wall (solid or passthrough)', walls: 'spawn / remove wall lines (mixed types)', guard: 'spawn guard',
  flyer: 'spawn flying guard', boss: 'spawn boss', door: 'open / close door',
};
const SELECTS = {
  of: OF, dir: null, mode: null,
};
const dirOpts = (type) => (type === 'pastY' ? ['below', 'above'] : ['right', 'left']);
const modeOpts = (type) => (type === 'wall' || type === 'walls' ? ['spawn', 'remove'] : type === 'flyer' ? ['patrol', 'follow'] : ['open', 'close']);
const FIELD_LABEL = { x: 'x', y: 'y', r: 'radius', seconds: 'seconds', delay: 'delay (s)', w: 'width', h: 'height', size: 'size px', range: 'range', speed: 'speed', id: 'id', key: 'key', x1: 'corner 1 x', y1: 'corner 1 y', x2: 'corner 2 x', y2: 'corner 2 y', of: 'of', dir: 'direction', mode: 'mode', text: 'text', tile: 'tile' };
const TILE_LABEL = { '#': '# solid wall', '=': '= passthrough (one-way)' };
const DIR_LABEL = { h: 'horizontal', v: 'vertical' };

const condDefaults = (type, ctx) => ({
  allDead: { of: 'enemies' }, playerAt: { x: ctx.x, y: ctx.y, r: 3 }, pastX: { x: ctx.x, dir: 'right' }, pastY: { y: ctx.y, dir: 'below' },
  time: { seconds: 5 }, after: { id: ctx.otherId, delay: 0 }, doorOpen: { id: 1 }, keyPress: { key: 'KeyY' }, playerDied: {},
}[type]);
const actDefaults = (type, ctx) => ({
  toast: { text: 'MESSAGE', seconds: 3 }, unlabel: { x: ctx.x, y: ctx.y }, respawnHere: { x: ctx.x, y: ctx.y }, label: { x: ctx.x, y: ctx.y, text: 'TEXT', size: 16 },
  wall: { x: ctx.x, y: ctx.y, w: 3, h: 2, tile: '#', mode: 'spawn' },
  walls: { mode: 'spawn', lines: [{ x: ctx.x, y: ctx.y, len: 6, dir: 'h', tile: '=' }] }, guard: { x: ctx.x, y: ctx.y }, flyer: { x: ctx.x, y: ctx.y, mode: 'patrol', range: 8, speed: 4 },
  boss: { x: ctx.x, y: ctx.y }, door: { id: 1, mode: 'open' },
}[type]);

export const keyName = (code) => String(code || '').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '') || '(none)';

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
}

export function createEventsPanel(root, getDoc, { onChange, pick, here, setSel }) {
  let selId = null;

  function evs() { const s = getDoc().side; return (s.events ||= []); }

  function select(id) { selId = id; setSel(id); }

  function numberField(obj, f, rerender) {
    const i = el('input', { type: 'number', step: f === 'r' || f === 'seconds' || f === 'delay' || f === 'speed' ? 0.5 : 1, value: obj[f] ?? '' });
    i.addEventListener('input', () => {
      if (i.value === '') delete obj[f]; else obj[f] = Number(i.value);
      onChange();
    });
    return i;
  }

  function fieldEl(obj, f, type, kind, event) {
    if (f === 'key') {
      const b = el('button', { textContent: keyName(obj.key), title: 'click, then press the key you want' });
      b.onclick = () => {
        b.textContent = 'press a key...';
        const done = (e) => {
          window.removeEventListener('keydown', done, true);
          if (e.code !== 'Escape') { e.preventDefault(); e.stopPropagation(); obj.key = e.code; onChange(); }
          b.textContent = keyName(obj.key);
        };
        window.addEventListener('keydown', done, true);
      };
      return b;
    }
    if (f === 'text') {
      const a = el('textarea', { value: obj.text ?? '', rows: 2, className: 'txt', spellcheck: false });
      a.addEventListener('input', () => { obj.text = a.value; onChange(); });
      return a;
    }
    if (f === 'tile') {
      const s = el('select', {}, ...WALL_TILES.map((o) => el('option', { value: o, textContent: TILE_LABEL[o] })));
      s.value = WALL_TILES.includes(obj.tile) ? obj.tile : '#';
      s.onchange = () => { obj.tile = s.value; onChange(); };
      return s;
    }
    let opts = null;
    if (f === 'of') opts = OF;
    else if (f === 'dir') opts = dirOpts(type);
    else if (f === 'mode') opts = modeOpts(type);
    else if (f === 'id' && type === 'after') opts = evs().filter((e) => e !== event).map((e) => e.id);
    if (opts) {
      const s = el('select', {}, ...opts.map((o) => el('option', { value: o, textContent: o })));
      s.value = String(obj[f] ?? opts[0]);
      s.onchange = () => { obj[f] = type === 'after' ? Number(s.value) : s.value; onChange(); };
      return s;
    }
    return numberField(obj, f);
  }

  function pickButtons(obj, type, kind) {
    const out = [];
    const apply = (patch) => { Object.assign(obj, patch); onChange(); render(); };
    if (kind === 'cond' && (type === 'allDead' || type === 'playerDied')) {
      out.push(el('button', {
        textContent: 'pick area',
        title: 'Drag from one corner to the opposite corner. For all-dead: only enemies placed inside count, and one has to be shot dead. For died: the player must have been sent back from inside it.',
        onclick: () => pick('rect', (r) => apply({ x1: r.x, y1: r.y, x2: r.x + r.w - 1, y2: r.y + r.h - 1 }), 'Drag from one corner of the kill zone to the other'),
      }));
      out.push(el('button', { textContent: 'clear area', onclick: () => { for (const k of AREA) delete obj[k]; onChange(); render(); } }));
    } else if (kind === 'act' && type === 'unlabel') {
      out.push(el('button', { textContent: 'pick text', onclick: () => pick('point', (p) => apply({ x: p.x, y: p.y }), 'Click a cell the text sits on') }));
    } else if (kind === 'act' && type === 'wall') {
      out.push(el('button', { textContent: 'pick area', onclick: () => pick('rect', (r) => apply({ x: r.x, y: r.y, w: r.w, h: r.h }), 'Drag a rectangle on the map for the wall') }));
    } else if ((kind === 'cond' && type === 'playerAt') || (kind === 'act' && ['label', 'guard', 'flyer', 'boss', 'respawnHere'].includes(type))) {
      out.push(el('button', { textContent: 'pick point', onclick: () => pick('point', (p) => apply({ x: p.x, y: p.y }), 'Click a cell on the map') }));
    } else if (kind === 'cond' && type === 'pastX') {
      out.push(el('button', { textContent: 'pick line', onclick: () => pick('point', (p) => apply({ x: p.x }), 'Click where the vertical line should be') }));
    } else if (kind === 'cond' && type === 'pastY') {
      out.push(el('button', { textContent: 'pick line', onclick: () => pick('point', (p) => apply({ y: p.y }), 'Click where the horizontal line should be') }));
    }
    return out;
  }

  function lineRow(o, n) {
    const l = o.lines[n];
    const box = el('div', { className: 'unlock' });
    const grid = el('div', { className: 'grid2' });
    const num = (f, label) => el('label', { className: 'fld' }, el('span', { textContent: label }), numberField(l, f));
    const sel = (f, opts, labels) => {
      const s = el('select', {}, ...opts.map((v) => el('option', { value: v, textContent: labels[v] })));
      s.value = opts.includes(l[f]) ? l[f] : opts[0];
      s.onchange = () => { l[f] = s.value; onChange(); };
      return el('label', { className: 'fld' }, el('span', { textContent: f === 'tile' ? 'tile' : 'direction' }), s);
    };
    grid.append(num('x', 'x'), num('y', 'y'), num('len', 'length'), sel('dir', ['h', 'v'], DIR_LABEL), sel('tile', WALL_TILES, TILE_LABEL));
    box.append(el('div', { className: 'sub', textContent: `line ${n + 1}` }), grid);
    box.append(el('div', { className: 'row' },
      el('button', {
        textContent: 'pick line',
        title: 'Drag along the map: the longer side decides horizontal or vertical',
        onclick: () => pick('rect', (r) => {
          const vert = r.h > r.w;
          Object.assign(l, { x: r.x, y: r.y, len: vert ? r.h : r.w, dir: vert ? 'v' : 'h' });
          onChange(); render();
        }, 'Drag a line on the map (longer side = direction)'),
      }),
      el('button', { textContent: 'duplicate', onclick: () => { o.lines.splice(n + 1, 0, { ...l, y: l.dir === 'v' ? l.y : l.y + 1, x: l.dir === 'v' ? l.x + 1 : l.x }); onChange(); render(); } }),
      el('button', { textContent: 'remove line', onclick: () => { o.lines.splice(n, 1); onChange(); render(); } }),
    ));
    return box;
  }

  function row(event, list, i, kind) {
    const o = list[i];
    const labels = kind === 'cond' ? COND_LABEL : ACT_LABEL;
    const fields = (kind === 'cond' ? COND_FIELDS : ACTION_FIELDS)[o.type] || [];
    const box = el('div', { className: 'erow' });
    const typeSel = el('select', {}, ...Object.keys(labels).map((t) => el('option', { value: t, textContent: labels[t] })));
    typeSel.value = o.type;
    typeSel.onchange = () => {
      const ctx = defaults(event);
      list[i] = { type: typeSel.value, ...(kind === 'cond' ? condDefaults : actDefaults)(typeSel.value, ctx) };
      onChange(); render();
    };
    box.append(el('div', { className: 'ehead' }, typeSel, el('button', { textContent: '×', title: 'remove', onclick: () => { list.splice(i, 1); onChange(); render(); } })));
    const grid = el('div', { className: 'grid2' });
    for (const f of fields) {
      const lab = el('label', { className: 'fld', style: f === 'text' ? 'grid-column:1/3' : '' }, el('span', { textContent: FIELD_LABEL[f] || f }), fieldEl(o, f, o.type, kind, event));
      grid.append(lab);
    }
    box.append(grid);
    if (kind === 'act' && o.type === 'walls') {
      o.lines ||= [];
      o.lines.forEach((_, n) => box.append(lineRow(o, n)));
      box.append(el('div', { className: 'row' }, el('button', {
        textContent: '+ add line',
        onclick: () => { const h = defaults(event); o.lines.push({ x: h.x, y: h.y, len: 6, dir: 'h', tile: '#' }); onChange(); render(); },
      })));
    }
    const pbs = pickButtons(o, o.type, kind);
    if (pbs.length) box.append(el('div', { className: 'row' }, ...pbs));
    return box;
  }

  function defaults(event) {
    const h = here();
    const other = evs().find((e) => e !== event);
    return { x: h.x, y: h.y, otherId: other ? other.id : 1 };
  }

  function addPicker(labels, onAdd, text) {
    const s = el('select', {}, el('option', { value: '', textContent: text }), ...Object.keys(labels).map((t) => el('option', { value: t, textContent: labels[t] })));
    s.onchange = () => { if (s.value) onAdd(s.value); };
    return s;
  }

  function card(event) {
    const c = el('div', { className: 'card' + (event.id === selId ? ' sel' : '') });
    c.addEventListener('pointerdown', () => { if (selId !== event.id) { select(event.id); c.classList.add('sel'); } });
    c.append(el('div', { className: 'ehead' },
      el('span', { className: 'cardhead', textContent: `EVENT ${event.id}  (fires once${event.delay > 0 ? `, +${event.delay}s` : ''})` }),
      el('span', {},
        el('button', {
          textContent: 'duplicate', title: 'Copy this event (new id)',
          onclick: () => {
            const id = evs().reduce((m, e) => Math.max(m, e.id || 0), 0) + 1;
            evs().splice(evs().indexOf(event) + 1, 0, { ...JSON.parse(JSON.stringify(event)), id });
            select(id); onChange(); render();
          },
        }),
        ' ',
        el('button', { textContent: 'delete', onclick: () => { evs().splice(evs().indexOf(event), 1); onChange(); render(); } }))));
    event.when ||= []; event.do ||= [];
    c.append(el('div', { className: 'sub', textContent: 'WHEN  (all of these are true)' }));
    event.when.forEach((_, i) => c.append(row(event, event.when, i, 'cond')));
    c.append(addPicker(COND_LABEL, (t) => { event.when.push({ type: t, ...condDefaults(t, defaults(event)) }); onChange(); render(); }, '+ add condition...'));
    const dl = el('input', { type: 'number', min: 0, step: 0.5, value: event.delay ?? '', placeholder: '0' });
    dl.addEventListener('input', () => { if (dl.value === '' || Number(dl.value) <= 0) delete event.delay; else event.delay = Number(dl.value); onChange(); });
    c.append(el('label', { className: 'fld', title: 'Seconds to wait after the conditions first become true. Once they have been met the event always fires, even if the player moves away.' },
      el('span', { textContent: 'WAIT this many seconds after the conditions are met, then do the actions' }), dl));
    c.append(el('div', { className: 'sub', textContent: 'THEN  (do these, in order)' }));
    event.do.forEach((_, i) => c.append(row(event, event.do, i, 'act')));
    c.append(addPicker(ACT_LABEL, (t) => { event.do.push({ type: t, ...actDefaults(t, defaults(event)) }); onChange(); render(); }, '+ add action...'));
    return c;
  }

  function render() {
    root.textContent = '';
    const list = evs();
    root.append(el('div', { className: 'hint', textContent: 'Events are game states: when every condition is true, the actions run once. Overlays on the map show where each event happens (E1, E2...).' }));
    if (!list.length) root.append(el('div', { className: 'hint', textContent: 'No events yet.' }));
    for (const e of list) root.append(card(e));
    root.append(el('button', {
      textContent: '+ new event',
      onclick: () => {
        const id = list.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1;
        list.push({ id, when: [{ type: 'allDead', of: 'enemies' }], do: [{ type: 'toast', text: 'MESSAGE', seconds: 3 }] });
        select(id); onChange(); render();
      },
    }));
  }

  function refresh() {
    if (root.contains(document.activeElement) && document.activeElement !== root) return;
    render();
  }
  return { render, refresh, select };
}

export function drawEventOverlays(ctx, events, CW, CH, z, selId, W, H) {
  if (!events?.length) return;
  ctx.save();
  ctx.setLineDash([5 / z, 4 / z]);
  ctx.lineWidth = 1.5 / z;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const tag = (txt, x, y) => { ctx.fillStyle = '#000'; ctx.fillRect(x, y, txt.length * 6.6 + 3, 13); ctx.fillStyle = '#fff'; ctx.fillText(txt, x + 2, y + 1); };
  for (const ev of events) {
    ctx.globalAlpha = selId == null || ev.id === selId ? 0.95 : 0.4;
    ctx.strokeStyle = '#fff';
    const E = `E${ev.id}${ev.delay > 0 ? `+${ev.delay}s` : ''}`;
    for (const c of ev.when || []) {
      if (c.type === 'playerAt' && Number.isFinite(c.x)) {
        ctx.beginPath(); ctx.ellipse((c.x + 0.5) * CW, (c.y + 0.5) * CH, (c.r ?? 3) * CW, (c.r ?? 3) * CH, 0, 0, Math.PI * 2); ctx.stroke();
        tag(`${E} near`, (c.x + 0.5) * CW - 14, (c.y + 0.5) * CH - 6);
      } else if (c.type === 'pastX' && Number.isFinite(c.x)) {
        ctx.beginPath(); ctx.moveTo(c.x * CW, 0); ctx.lineTo(c.x * CW, H * CH); ctx.stroke();
        tag(`${E} ${c.dir === 'left' ? '<' : '>'}`, c.x * CW + 2, 4);
      } else if ((c.type === 'allDead' || c.type === 'playerDied') && boxOf(c)) {
        const b = boxOf(c);
        ctx.strokeRect(b.x0 * CW, b.y0 * CH, (b.x1 - b.x0 + 1) * CW, (b.y1 - b.y0 + 1) * CH);
        tag(`${E} ${c.type === 'playerDied' ? 'death zone' : 'kill zone'}`, b.x0 * CW + 2, b.y0 * CH + 2);
      } else if (c.type === 'pastY' && Number.isFinite(c.y)) {
        ctx.beginPath(); ctx.moveTo(0, c.y * CH); ctx.lineTo(W * CW, c.y * CH); ctx.stroke();
        tag(`${E} ${c.dir === 'above' ? '^' : 'v'}`, 4, c.y * CH + 2);
      }
    }
    for (const a of ev.do || []) {
      if (a.type === 'walls') {
        (a.lines || []).forEach((l, n) => {
          if (!Number.isFinite(l.x) || !Number.isFinite(l.y)) return;
          const len = l.len || 1;
          ctx.setLineDash(l.tile === '=' ? [2 / z, 3 / z] : [5 / z, 4 / z]);
          ctx.strokeRect(l.x * CW, l.y * CH, (l.dir === 'v' ? 1 : len) * CW, (l.dir === 'v' ? len : 1) * CH);
          ctx.setLineDash([5 / z, 4 / z]);
          tag(`${E} ${a.mode === 'remove' ? '-' : '+'}${l.tile === '=' ? '=' : '#'}${n + 1}`, l.x * CW + 2, l.y * CH + 2);
        });
        continue;
      }
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
      if (a.type === 'wall') {
        ctx.strokeRect(a.x * CW, a.y * CH, (a.w || 1) * CW, (a.h || 1) * CH);
        tag(`${E} ${a.mode === 'remove' ? '-' : '+'}${a.tile === '=' ? 'pass' : 'wall'}`, a.x * CW + 2, a.y * CH + 2);
      } else {
        ctx.strokeRect(a.x * CW, a.y * CH, CW, CH);
        const g = { guard: 'G', flyer: 'F', boss: 'B', label: 'T', unlabel: 'x text', respawnHere: 'R' }[a.type];
        tag(`${E} ${g}`, a.x * CW, a.y * CH - 13);
        if (a.type === 'flyer' && a.mode !== 'follow') {
          const r = a.range ?? 8;
          ctx.beginPath(); ctx.moveTo((a.x - r + 0.5) * CW, (a.y + 0.5) * CH); ctx.lineTo((a.x + r + 0.5) * CW, (a.y + 0.5) * CH); ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}
