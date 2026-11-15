import { validateLevels } from './campaign.js';

export const SINGLE = new Set(['@', '>']);
export const TERMINALS = 'abcdef';
export const DOORS = '123456789';
export const MIN_W = 20, MAX_W = 300, MIN_H = 10, MAX_H = 80;

const isTerminal = (ch) => ch.length === 1 && ch >= 'a' && ch <= 'f';
const inBounds = (doc, x, y) => x >= 0 && y >= 0 && x < doc.W && y < doc.H;

export function terminalStub(letter) {
  const n = TERMINALS.indexOf(letter) + 1;
  return {
    name: `NODE ${letter.toUpperCase()}`,
    host: `node0${n}`,
    fs: { 'readme.txt': 'edit me. add files here, and unlock codes below.' },
    unlocks: [],
  };
}

export function defaultSide(levelNum = 1, name = 'NEW LEVEL') {
  return {
    name,
    intro: [`LEVEL ${levelNum} :: ${name}`, 'edit this intro text.'],
    bubble: { duration: 5, cooldown: 1 },
    terminals: {},
  };
}

export function newDoc(W = 96, H = 30, levelNum = 1) {
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  for (let y = 0; y < H; y++) { grid[y][0] = '#'; grid[y][W - 1] = '#'; }
  for (let y = H - 3; y < H; y++) grid[y].fill('#');
  grid[H - 4][3] = '@';
  grid[H - 4][W - 4] = '>';
  return { W, H, grid, side: defaultSide(levelNum), levelNum };
}

function gridFromMapText(text) {
  const rows = String(text).replace(/\r/g, '').split('\n');
  while (rows.length && rows[0].trim() === '') rows.shift();
  while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
  if (!rows.length) throw new Error('empty map');
  const W = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => Array.from({ length: W }, (_, x) => (r[x] === undefined || r[x] === ' ' ? '.' : r[x])));
  return { W, H: rows.length, grid };
}

export function docFromDef(def, levelNum = 1) {
  const { map, ...rest } = def;
  const { W, H, grid } = gridFromMapText(map);
  return { W, H, grid, side: JSON.parse(JSON.stringify(rest)), levelNum };
}

export const mapText = (doc) => doc.grid.map((r) => r.join('')).join('\n');
export const toDef = (doc) => ({ ...doc.side, map: '\n' + mapText(doc) + '\n' });

export function ensureTerminal(doc, letter) {
  doc.side.terminals ??= {};
  if (!doc.side.terminals[letter]) doc.side.terminals[letter] = terminalStub(letter);
}

export function setCell(doc, x, y, ch) {
  if (!inBounds(doc, x, y)) return false;
  if (SINGLE.has(ch)) {
    for (const row of doc.grid) for (let i = 0; i < row.length; i++) if (row[i] === ch) row[i] = '.';
  }
  doc.grid[y][x] = ch;
  if (isTerminal(ch)) ensureTerminal(doc, ch);
  return true;
}

export function lineCells(a, b) {
  const cells = [];
  let x0 = a.x, y0 = a.y;
  const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0);
  const sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push({ x: x0, y: y0 });
    if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return cells;
}

export function paintLine(doc, a, b, ch) {
  for (const c of lineCells(a, b)) setCell(doc, c.x, c.y, ch);
}

export function paintRect(doc, a, b, ch) {
  if (SINGLE.has(ch)) { setCell(doc, b.x, b.y, ch); return; }
  const x0 = Math.max(0, Math.min(a.x, b.x)), x1 = Math.min(doc.W - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y)), y1 = Math.min(doc.H - 1, Math.max(a.y, b.y));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setCell(doc, x, y, ch);
}

export function floodFill(doc, x, y, ch) {
  if (!inBounds(doc, x, y)) return 0;
  if (SINGLE.has(ch)) { setCell(doc, x, y, ch); return 1; }
  const target = doc.grid[y][x];
  if (target === ch) return 0;
  const stack = [[x, y]];
  let n = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (!inBounds(doc, cx, cy) || doc.grid[cy][cx] !== target) continue;
    setCell(doc, cx, cy, ch);
    n++;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return n;
}

export function resizeDoc(doc, nw, nh) {
  nw = Math.max(MIN_W, Math.min(MAX_W, Math.round(nw)));
  nh = Math.max(MIN_H, Math.min(MAX_H, Math.round(nh)));
  const grid = Array.from({ length: nh }, () => Array(nw).fill('.'));
  const shift = nh - doc.H;
  for (let y = 0; y < doc.H; y++) {
    const ny = y + shift;
    if (ny < 0 || ny >= nh) continue;
    for (let x = 0; x < Math.min(doc.W, nw); x++) grid[ny][x] = doc.grid[y][x];
  }
  doc.W = nw;
  doc.H = nh;
  doc.grid = grid;
  for (const l of doc.side.labels || []) l.y += shift;
}

export function snapshot(doc, withLabels = false) {
  const s = { W: doc.W, H: doc.H, rows: doc.grid.map((r) => r.join('')) };
  if (withLabels) s.labels = JSON.parse(JSON.stringify(doc.side.labels || []));
  return s;
}

export function restore(doc, snap) {
  doc.W = snap.W;
  doc.H = snap.H;
  doc.grid = snap.rows.map((r) => r.split(''));
  if (snap.labels !== undefined) {
    if (snap.labels.length) doc.side.labels = JSON.parse(JSON.stringify(snap.labels));
    else delete doc.side.labels;
  }
}

export function rectOf(doc, a, b) {
  return {
    x0: Math.max(0, Math.min(a.x, b.x)), y0: Math.max(0, Math.min(a.y, b.y)),
    x1: Math.min(doc.W - 1, Math.max(a.x, b.x)), y1: Math.min(doc.H - 1, Math.max(a.y, b.y)),
  };
}

const inRect = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
const labelIn = (r, l) => inRect(r, Math.floor(l.x), Math.floor(l.y));

export function copyRegion(doc, r, { singles = false } = {}) {
  const cells = [];
  for (let y = r.y0; y <= r.y1; y++) {
    cells.push(doc.grid[y].slice(r.x0, r.x1 + 1).map((ch) => (!singles && SINGLE.has(ch) ? '.' : ch)));
  }
  const labels = (doc.side.labels || []).filter((l) => labelIn(r, l)).map((l) => {
    const o = { dx: l.x - r.x0, dy: l.y - r.y0, text: l.text };
    if (l.size !== undefined) o.size = l.size;
    return o;
  });
  return { w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1, cells, labels };
}

export function clearRegion(doc, r) {
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) doc.grid[y][x] = '.';
  if (doc.side.labels) {
    doc.side.labels = doc.side.labels.filter((l) => !labelIn(r, l));
    if (!doc.side.labels.length) delete doc.side.labels;
  }
}

export function pasteRegion(doc, clip, x, y) {
  for (let cy = 0; cy < clip.h; cy++) {
    for (let cx = 0; cx < clip.w; cx++) {
      const ch = clip.cells[cy][cx];
      if (ch !== '.') setCell(doc, x + cx, y + cy, ch);
    }
  }
  for (const l of clip.labels || []) {
    const lx = x + l.dx, ly = y + l.dy;
    if (lx < 0 || ly < 0 || lx >= doc.W || ly >= doc.H) continue;
    doc.side.labels ||= [];
    const n = { x: lx, y: ly, text: l.text };
    if (l.size !== undefined) n.size = l.size;
    doc.side.labels.push(n);
  }
  return rectOf(doc, { x, y }, { x: x + clip.w - 1, y: y + clip.h - 1 });
}

export function problems(doc) {
  const def = toDef(doc);
  if (!def.name) def.name = 'UNNAMED';
  return validateLevels([def]).map((s) => s.replace(/^level 1 \(.*?\): /, ''));
}

export function wireDoors(doc) {
  const doors = new Set();
  const letters = [];
  for (const row of doc.grid)
    for (const ch of row) {
      if (ch >= '1' && ch <= '9') doors.add(ch);
      else if (isTerminal(ch) && !letters.includes(ch)) letters.push(ch);
    }
  const open = new Set();
  for (const t of Object.values(doc.side.terminals || {}))
    for (const u of t.unlocks || []) for (const d of u.doors || []) open.add(String(d));
  const missing = [...doors].filter((d) => !open.has(d)).sort();
  if (!missing.length) return { added: [] };
  if (!letters.length) return { added: [], error: 'Place a terminal first (T), so the doors have something to unlock them.' };

  const letter = letters[0];
  ensureTerminal(doc, letter);
  const t = doc.side.terminals[letter];
  t.unlocks ??= [];
  t.fs ??= {};
  for (const d of missing) {
    t.unlocks.push({ code: `DOOR-${d}`, doors: [d], message: `SHUTTER ${d} OVERRIDE ACCEPTED.` });
    t.fs[`shutter${d}.log`] = `[auto] shutter ${d} override code: DOOR-${d}`;
  }
  return { added: missing, terminal: letter };
}

export function exportText(doc) {
  const n = doc.levelNum;
  return (
    `const sidecar = ${JSON.stringify(doc.side, null, 2)};\n\n` +
    `const map = \`\n${mapText(doc)}\n\`;\n\n` +
    `export const level${n} = { ...sidecar, map };\n`
  );
}

export function flattenFs(fs, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(fs || {})) {
    if (v && typeof v === 'object') out.push(...flattenFs(v, prefix + k + '/'));
    else out.push({ path: prefix + k, text: String(v ?? '') });
  }
  return out;
}

export function unflattenFs(rows) {
  const fs = {};
  for (const { path, text } of rows) {
    const parts = String(path).split('/').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    let node = fs;
    for (const d of parts.slice(0, -1)) {
      if (typeof node[d] !== 'object' || node[d] === null) node[d] = {};
      node = node[d];
    }
    node[parts[parts.length - 1]] = text;
  }
  return fs;
}

export function setSetting(side, path, value) {
  const keys = path.split('.');
  const blank = value === '' || value === undefined || value === null || (typeof value === 'number' && Number.isNaN(value));
  const trail = [side];
  let node = side;
  for (const k of keys.slice(0, -1)) {
    if (blank && (typeof node[k] !== 'object' || node[k] === null)) return;
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k];
    trail.push(node);
  }
  const last = keys[keys.length - 1];
  if (blank) {
    delete node[last];
    for (let i = trail.length - 1; i > 0; i--) if (!Object.keys(trail[i]).length) delete trail[i - 1][keys[i - 1]];
  } else node[last] = value;
}

export const getSetting = (side, path) => path.split('.').reduce((n, k) => (n == null ? undefined : n[k]), side);

export const mapTerminals = (doc) => [...new Set(doc.grid.flat().filter(isTerminal))].sort();
