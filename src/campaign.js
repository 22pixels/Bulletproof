import { createGame } from './game.js';
import { BOSS_DESIGNS } from './bosses/index.js';
import { parseLevel } from './level.js';
import { clamp } from './util.js';
import { validateEvents } from './events.js';

const SAVE_KEY = 'root-save-v1';

export function validateLevels(levels) {
  const problems = [];
  levels.forEach((def, i) => {
    const tag = `level ${i + 1} (${def.name ?? '?'})`;
    let L;
    try {
      L = parseLevel(def);
    } catch (e) {
      problems.push(`${tag}: ${e.message}`);
      return;
    }
    if (!L.entities.some((e) => e.type === 'exit')) problems.push(`${tag}: no exit '>' in the map`);

    const doorsInMap = new Set();
    for (const r of L.tiles) for (const ch of r) if (ch >= '1' && ch <= '9') doorsInMap.add(ch);
    const openable = new Set();
    for (const t of Object.values(L.terminals))
      for (const u of t.unlocks || []) for (const d of u.doors || []) openable.add(String(d));
    for (const ev of L.events) for (const a of ev.do || []) if (a.type === 'door' && a.mode !== 'close') openable.add(String(a.id));
    for (const d of L.boss.opens || []) openable.add(String(d));
    if (L.boss?.design && !BOSS_DESIGNS[L.boss.design]) problems.push(`${tag}: boss design '${L.boss.design}' is not in src/bosses/index.js`);
    for (const m of validateEvents(L.events, { w: L.w, h: L.h })) problems.push(`${tag}: ${m}`);
    for (const d of doorsInMap) if (!openable.has(d)) problems.push(`${tag}: door ${d} can never be opened`);
  });
  return problems;
}

const carryOf = (g) => ({ hearts: g.hearts, maxHearts: g.maxHearts, abilities: { ...g.abilities } });

export function createCampaign(levels, storage = globalThis.localStorage) {
  const problems = validateLevels(levels);
  if (problems.length) throw new Error('Bad level data:\n' + problems.join('\n'));

  const c = { levels, index: 0, game: null };

  function readSave() {
    try {
      const s = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null');
      if (s && Number.isInteger(s.level) && s.level >= 0 && s.level < levels.length && Number.isInteger(s.maxHearts)) {
        return {
          level: s.level,
          maxHearts: s.maxHearts,
          abilities: s.abilities && typeof s.abilities === 'object' ? s.abilities : {},
        };
      }
    } catch {
    }
    return null;
  }

  function writeSave(s) {
    try { storage?.setItem(SAVE_KEY, JSON.stringify(s)); } catch {}
  }

  function clearSave() {
    try { storage?.removeItem(SAVE_KEY); } catch {}
  }

  c.load = (i, carry) => {
    const g = createGame(levels[i], carry);
    g.levelNum = i + 1;
    g.levelCount = levels.length;
    g.hasNext = i + 1 < levels.length;
    c.index = i;
    c.game = g;
    return g;
  };

  c.start = ({ level, fresh = false } = {}) => {
    if (fresh) clearSave();
    const save = fresh ? null : readSave();
    let i = save ? save.level : 0;
    if (Number.isInteger(level)) i = clamp(level, 0, levels.length - 1);
    return c.load(i, save ? { maxHearts: save.maxHearts, abilities: save.abilities } : undefined);
  };

  c.next = () => {
    const g = c.game;
    if (!g.hasNext) {
      clearSave();
      return false;
    }
    const carry = carryOf(g);
    writeSave({ level: c.index + 1, maxHearts: carry.maxHearts, abilities: carry.abilities });
    c.load(c.index + 1, carry);
    return true;
  };

  c.goto = (i) => c.load(clamp(i, 0, levels.length - 1), c.game ? carryOf(c.game) : undefined);

  c.clearSave = clearSave;
  return c;
}
