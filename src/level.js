import { DEFAULT_BUBBLE, GUARD, BOSS, FLYER, RESPAWN } from './config.js';
import { sanitizeLabels } from './labels.js';

const EMPTY = new Set(['.', ' ']);
const TILES = new Set(['#', '=', '^', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

export function parseLevel(def) {
  const rows = def.map.replace(/\r/g, '').split('\n');
  while (rows.length && rows[0].trim() === '') rows.shift();
  while (rows.length && rows[rows.length - 1].trim() === '') rows.pop();
  if (!rows.length) throw new Error(`level "${def.name}": empty map`);

  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const entities = [];
  let start = null;
  const terminals = def.terminals || {};

  const tiles = rows.map((row, y) => {
    let out = '';
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.';
      if (EMPTY.has(ch)) out += '.';
      else if (TILES.has(ch)) out += ch;
      else if (ch === '@') {
        start = { x, y };
        out += '.';
      } else if (ch === 'G') {
        entities.push({ type: 'guard', x, y });
        out += '.';
      } else if (ch === 'F') {
        entities.push({ type: 'flyer', x, y });
        out += '.';
      } else if (ch === 'C' || ch === 'K') {
        entities.push({ type: 'checkpoint', x, y });
        out += '.';
      } else if (ch === 'B') {
        entities.push({ type: 'boss', x, y });
        out += '.';
      } else if (ch === '>') {
        entities.push({ type: 'exit', x, y });
        out += '.';
      } else if (ch >= 'a' && ch <= 'f') {
        if (!terminals[ch]) throw new Error(`level "${def.name}": terminal '${ch}' at ${x},${y} has no definition`);
        entities.push({ type: 'terminal', id: ch, x, y });
        out += '.';
      } else {
        throw new Error(`level "${def.name}": unknown tile '${ch}' at ${x},${y}`);
      }
    }
    return out;
  });

  for (const e of entities) { e.hx = e.x; e.hy = e.y; }

  if (!start) throw new Error(`level "${def.name}": no player start '@'`);

  return {
    name: def.name,
    intro: def.intro || null,
    labels: sanitizeLabels(def.labels),
    w,
    h,
    tiles,
    entities,
    start,
    terminals,
    bubble: { ...DEFAULT_BUBBLE, ...(def.bubble || {}) },
    boss: { ...BOSS, ...(def.boss || {}) },
    flyer: { ...FLYER, ...(def.flyer || {}) },
    events: JSON.parse(JSON.stringify(Array.isArray(def.events) ? def.events : [])),
    guard: { ...GUARD, ...(def.guard || {}) },
    respawn: def.respawn === 'start' || def.respawn === 'checkpoint' ? def.respawn : RESPAWN,
    abilities: { wallJump: false, ...(def.abilities || {}) },
    open: new Set(),
  };
}
