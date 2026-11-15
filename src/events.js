import { sanitizeLabels, labelBounds } from './labels.js';

const KIND = { guards: 'guard', flyers: 'flyer', bosses: 'boss' };
const ENEMY = new Set(['guard', 'flyer', 'boss']);
export const OF = ['enemies', 'guards', 'flyers', 'bosses'];

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export const AREA = ['x1', 'y1', 'x2', 'y2'];
export const COND_FIELDS = {
  allDead: ['of', ...AREA], playerAt: ['x', 'y', 'r'], pastX: ['x', 'dir'], pastY: ['y', 'dir'], time: ['seconds'], after: ['id', 'delay'], doorOpen: ['id'], keyPress: ['key'], playerDied: [...AREA],
};
export const ACTION_FIELDS = {
  toast: ['text', 'seconds'], label: ['x', 'y', 'text', 'size'], unlabel: ['x', 'y'], wall: ['x', 'y', 'w', 'h', 'tile', 'mode'], walls: ['mode'],
  guard: ['x', 'y'], flyer: ['x', 'y', 'mode', 'range', 'speed'], boss: ['x', 'y'], door: ['id', 'mode'], respawnHere: ['x', 'y'],
};

export function createEventState() {
  return { fired: new Set(), firedAt: {}, armedAt: {}, seen: {}, kills: [], deaths: [], seenIn: {} };
}

function count(g, of, box) {
  let n = 0;
  for (const e of g.level.entities) if ((of === 'enemies' ? ENEMY.has(e.type) : e.type === KIND[of]) && (!box || inBox(e, box))) n++;
  return n;
}

export function boxOf(c) {
  if (!AREA.every((k) => num(c[k]))) return null;
  return { x0: Math.min(c.x1, c.x2), y0: Math.min(c.y1, c.y2), x1: Math.max(c.x1, c.x2), y1: Math.max(c.y1, c.y2) };
}

const inBox = (e, b) => { const x = Math.floor(e.hx ?? e.x), y = Math.floor(e.hy ?? e.y); return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1; };
const kindOk = (type, of) => (of === 'enemies' ? ENEMY.has(type) : type === KIND[of]);

export function recordDeath(g, x, y) {
  g.events.deaths.push({ x, y });
}

export function recordKill(g, e) {
  g.events.kills.push({ type: e.type, x: e.hx ?? e.x, y: e.hy ?? e.y });
}

const COND = {
  allDead: (c, g) => {
    const of = c.of || 'enemies', box = boxOf(c);
    if (!box) return (g.events.seen[of] || 0) > 0 && count(g, of) === 0;
    if (count(g, of, box) > 0) return false;
    return g.events.kills.some((k) => kindOk(k.type, of) && inBox(k, box));
  },
  playerDied: (c, g) => {
    const box = boxOf(c);
    return g.events.deaths.some((d) => !box || inBox(d, box));
  },
  playerAt: (c, g) => {
    const p = g.player;
    return Math.hypot(p.x + p.w / 2 - (c.x + 0.5), p.y + p.h / 2 - (c.y + 0.5)) <= (num(c.r) ? c.r : 3);
  },
  pastX: (c, g) => { const px = g.player.x + g.player.w / 2; return c.dir === 'left' ? px <= c.x : px >= c.x; },
  pastY: (c, g) => { const py = g.player.y + g.player.h / 2; return c.dir === 'above' ? py <= c.y : py >= c.y; },
  time: (c, g) => g.time >= (c.seconds || 0),
  after: (c, g) => g.events.fired.has(c.id) && g.time >= g.events.firedAt[c.id] + (c.delay || 0),
  doorOpen: (c, g) => g.level.open.has(String(c.id)),
  keyPress: (c, g, inp) => !!c.key && !!inp?.keysPressed?.includes(c.key),
};

export const WALL_TILES = ['#', '='];
const tileOf = (t) => (t === '=' ? '=' : '#');

function setRect(g, a, ch) {
  const L = g.level, p = g.player;
  for (let y = Math.max(0, a.y); y < Math.min(L.h, a.y + a.h); y++) {
    let row = L.tiles[y];
    for (let x = Math.max(0, a.x); x < Math.min(L.w, a.x + a.w); x++) {
      if (ch !== '.' && x + 1 > p.x && x < p.x + p.w && y + 1 > p.y && y < p.y + p.h) continue;
      if (L.tiles[y][x] === '^' && ch === '.') continue;
      row = row.slice(0, x) + ch + row.slice(x + 1);
    }
    L.tiles[y] = row;
  }
}

const ACT = {
  toast: (a, g, say) => say(g, String(a.text ?? ''), a.seconds || 3),
  label: (a, g) => g.level.labels.push(...sanitizeLabels([{ x: a.x, y: a.y, text: a.text, size: a.size }])),
  unlabel: (a, g) => {
    g.level.labels = g.level.labels.filter((l) => {
      const b = labelBounds(l);
      return !(b.x < a.x + 1 && b.x + b.w > a.x && b.y < a.y + 1 && b.y + b.h > a.y);
    });
  },
  wall: (a, g) => { setRect(g, { x: a.x, y: a.y, w: a.w || 1, h: a.h || 1 }, a.mode === 'remove' ? '.' : tileOf(a.tile)); g.shake = 0.2; },
  walls: (a, g) => {
    for (const l of a.lines || []) {
      const n = l.len || 1;
      setRect(g, { x: l.x, y: l.y, w: l.dir === 'v' ? 1 : n, h: l.dir === 'v' ? n : 1 }, a.mode === 'remove' ? '.' : tileOf(l.tile));
    }
    g.shake = 0.2;
  },
  guard: (a, g) => g.level.entities.push({ type: 'guard', x: a.x, y: a.y, hx: a.x, hy: a.y }),
  flyer: (a, g) => {
    const opts = {};
    if (a.mode) opts.mode = a.mode;
    if (num(a.range)) opts.range = a.range;
    if (num(a.speed)) opts.speed = a.speed;
    g.level.entities.push({ type: 'flyer', x: a.x, y: a.y, hx: a.x, hy: a.y, opts });
  },
  boss: (a, g) => g.level.entities.push({ type: 'boss', x: a.x, y: a.y, hx: a.x, hy: a.y }),
  respawnHere: (a, g) => {
    g.checkpoint = { x: a.x, y: a.y };
    g.startOverride = { x: a.x, y: a.y };
    g.teleport = { x: a.x, y: a.y };
  },
  door: (a, g) => { if (a.mode === 'close') g.level.open.delete(String(a.id)); else g.level.open.add(String(a.id)); },
};

export function updateEvents(g, say, inp) {
  const list = g.level.events;
  if (!list.length) return;
  const st = g.events;
  for (const of of OF) st.seen[of] = Math.max(st.seen[of] || 0, count(g, of));
  for (const ev of list) {
    if (st.fired.has(ev.id)) continue;
    if (st.armedAt[ev.id] === undefined) {
      const conds = ev.when || [];
      if (!conds.length || !conds.every((c) => COND[c.type]?.(c, g, inp))) continue;
      st.armedAt[ev.id] = g.time;
    }
    if (g.time < st.armedAt[ev.id] + (num(ev.delay) ? ev.delay : 0) - 1e-9) continue;
    st.fired.add(ev.id);
    st.firedAt[ev.id] = g.time;
    for (const a of ev.do || []) ACT[a.type]?.(a, g, say);
  }
}

export function validateEvents(events, dims) {
  const out = [];
  if (events === undefined) return out;
  if (!Array.isArray(events)) return ['events must be a list'];
  const ids = new Set();
  const inMap = (x, y) => !dims || (x >= 0 && y >= 0 && x < dims.w && y < dims.h);
  events.forEach((ev, i) => {
    const tag = `event ${ev?.id ?? i + 1}`;
    if (!ev || typeof ev !== 'object') { out.push(`${tag}: not an object`); return; }
    if (!num(ev.id)) out.push(`${tag}: missing numeric id`);
    else if (ids.has(ev.id)) out.push(`${tag}: duplicate id`);
    ids.add(ev.id);
    if (ev.delay !== undefined && !(num(ev.delay) && ev.delay >= 0)) out.push(`${tag}: delay must be a number of seconds, 0 or more`);
    if (!Array.isArray(ev.when) || !ev.when.length) out.push(`${tag}: needs at least one condition`);
    if (!Array.isArray(ev.do) || !ev.do.length) out.push(`${tag}: needs at least one action`);
    for (const c of ev.when || []) {
      if (!COND[c.type]) { out.push(`${tag}: unknown condition '${c.type}'`); continue; }
      for (const f of COND_FIELDS[c.type]) {
        const numeric = !['of', 'dir', 'key'].includes(f);
        if (numeric && f !== 'delay' && f !== 'r' && !AREA.includes(f) && !num(c[f])) out.push(`${tag}: condition ${c.type} needs a number for '${f}'`);
      }
      if (c.type === 'keyPress' && !/^[A-Za-z0-9]+$/.test(String(c.key || ''))) out.push(`${tag}: key press needs a key (press 'pick key' and hit one)`);
      if ((c.type === 'allDead' || c.type === 'playerDied') && AREA.some((k) => c[k] !== undefined)) {
        if (!AREA.every((k) => num(c[k]))) out.push(`${tag}: the box needs all four corner numbers (x1, y1, x2, y2), or none`);
        else if (!inMap(c.x1, c.y1) || !inMap(c.x2, c.y2)) out.push(`${tag}: the box is outside the map`);
      }
      if (c.type === 'playerAt' && !inMap(c.x, c.y)) out.push(`${tag}: trigger point is outside the map`);
    }
    for (const a of ev.do || []) {
      if (!ACT[a.type]) { out.push(`${tag}: unknown action '${a.type}'`); continue; }
      if (['label', 'unlabel', 'wall', 'guard', 'flyer', 'boss', 'respawnHere'].includes(a.type)) {
        if (!num(a.x) || !num(a.y)) out.push(`${tag}: action ${a.type} needs x and y`);
        else if (!inMap(a.x, a.y)) out.push(`${tag}: action ${a.type} at ${a.x},${a.y} is outside the map`);
      }
      if (a.type === 'wall' && !(a.w > 0 && a.h > 0)) out.push(`${tag}: wall needs w and h above 0`);
      if (a.type === 'wall' && a.tile !== undefined && !WALL_TILES.includes(a.tile)) out.push(`${tag}: wall tile must be # or =`);
      if (a.type === 'walls') {
        if (!Array.isArray(a.lines) || !a.lines.length) out.push(`${tag}: walls needs at least one line`);
        (a.lines || []).forEach((l, n) => {
          const lt = `${tag}: wall line ${n + 1}`;
          if (!num(l.x) || !num(l.y)) out.push(`${lt} needs x and y`);
          else if (!inMap(l.x, l.y)) out.push(`${lt} at ${l.x},${l.y} is outside the map`);
          if (!(Number.isInteger(l.len) && l.len > 0)) out.push(`${lt} needs a length above 0`);
          if (l.dir !== 'h' && l.dir !== 'v') out.push(`${lt} direction must be h or v`);
          if (!WALL_TILES.includes(l.tile)) out.push(`${lt} tile must be # or =`);
        });
      }
      if (a.type === 'label' && !String(a.text || '').trim()) out.push(`${tag}: label has no text`);
      if (a.type === 'door' && !/^[1-9]$/.test(String(a.id))) out.push(`${tag}: door id must be 1-9`);
    }
  });
  for (const ev of events) for (const c of ev?.when || []) {
    if (c.type === 'after' && (!ids.has(c.id) || c.id === ev.id)) out.push(`event ${ev.id}: 'after' points at a missing event (${c.id})`);
  }
  return out;
}
