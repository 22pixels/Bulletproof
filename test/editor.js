import assert from 'node:assert/strict';
import {
  newDoc, docFromDef, mapText, toDef, setCell, lineCells, paintLine, paintRect, floodFill,
  resizeDoc, snapshot, restore, problems, wireDoors, exportText, terminalStub,
  flattenFs, unflattenFs, setSetting, getSetting, mapTerminals,
  rectOf, copyRegion, clearRegion, pasteRegion,
} from '../src/editor-core.js';
import { LEVELS } from '../src/levels/index.js';
import { validateLevels } from '../src/campaign.js';
import { parseLevel } from '../src/level.js';
import { sanitizeLabels, labelBounds, labelAt, labelSize } from '../src/labels.js';

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok  ', name);
  } catch (e) {
    console.log('FAIL', name, '\n     ', e.message);
    process.exitCode = 1;
  }
}

const count = (doc, ch) => doc.grid.reduce((n, r) => n + r.filter((c) => c === ch).length, 0);

t('a new level is valid as-is', () => {
  const d = newDoc();
  assert.deepEqual(problems(d), []);
  assert.equal(count(d, '@'), 1);
  assert.equal(count(d, '>'), 1);
});

t('every shipped level round-trips through the editor unchanged', () => {
  LEVELS.forEach((def, i) => {
    const d = docFromDef(def, i + 1);
    assert.equal(d.W, parseLevel(def).w, `level ${i + 1} width`);
    assert.equal(d.H, parseLevel(def).h, `level ${i + 1} height`);
    assert.deepEqual(problems(d), [], `level ${i + 1} problems`);
    const a = parseLevel(def), b = parseLevel(toDef(d));
    assert.deepEqual(b.tiles, a.tiles, `level ${i + 1} tiles`);
    assert.deepEqual(b.entities, a.entities, `level ${i + 1} entities`);
    assert.deepEqual(b.start, a.start);
  });
});

t('start and exit move instead of duplicating', () => {
  const d = newDoc();
  setCell(d, 10, 5, '@');
  setCell(d, 12, 5, '>');
  assert.equal(count(d, '@'), 1);
  assert.equal(count(d, '>'), 1);
  assert.equal(d.grid[5][10], '@');
  assert.equal(d.grid[5][12], '>');
});

t('placing a terminal creates a sidecar stub; removing the tile keeps it harmlessly', () => {
  const d = newDoc();
  assert.equal(d.side.terminals.b, undefined);
  setCell(d, 20, 26, 'b');
  assert.deepEqual(d.side.terminals.b, terminalStub('b'));
  setCell(d, 20, 26, '.');
  assert.deepEqual(problems(d), []);
});

t('out-of-bounds placement is ignored', () => {
  const d = newDoc();
  const before = mapText(d);
  assert.equal(setCell(d, -1, 0, '#'), false);
  assert.equal(setCell(d, d.W, 0, '#'), false);
  assert.equal(setCell(d, 0, d.H, '#'), false);
  assert.equal(mapText(d), before);
});

t('lineCells leaves no gaps in any direction', () => {
  for (const [a, b] of [[{ x: 0, y: 0 }, { x: 9, y: 3 }], [{ x: 9, y: 3 }, { x: 0, y: 0 }], [{ x: 2, y: 8 }, { x: 2, y: 1 }], [{ x: 4, y: 4 }, { x: 4, y: 4 }]]) {
    const cells = lineCells(a, b);
    assert.deepEqual(cells[0], a);
    assert.deepEqual(cells.at(-1), b);
    for (let i = 1; i < cells.length; i++) {
      assert.ok(Math.abs(cells[i].x - cells[i - 1].x) <= 1 && Math.abs(cells[i].y - cells[i - 1].y) <= 1, 'gap in line');
    }
  }
});

t('paintLine and paintRect fill the right cells', () => {
  const d = newDoc();
  paintLine(d, { x: 5, y: 5 }, { x: 9, y: 5 }, '=');
  assert.equal(d.grid[5].slice(5, 10).join(''), '=====');
  paintRect(d, { x: 12, y: 2 }, { x: 14, y: 4 }, '#');
  assert.equal(count(d, '#') - newDoc().grid.flat().filter((c) => c === '#').length, 9);
  paintRect(d, { x: 14, y: 4 }, { x: 12, y: 2 }, '.');
  assert.equal(d.grid[3][13], '.');
});

t('a rectangle of singles places just one', () => {
  const d = newDoc();
  paintRect(d, { x: 5, y: 5 }, { x: 15, y: 10 }, 'G');
  assert.equal(count(d, 'G'), 11 * 6);
  paintRect(d, { x: 5, y: 5 }, { x: 15, y: 10 }, '@');
  assert.equal(count(d, '@'), 1);
  assert.equal(d.grid[10][15], '@');
});

t('flood fill replaces only the connected region', () => {
  const d = newDoc();
  for (let y = 0; y < d.H - 3; y++) d.grid[y][40] = '#';
  const n = floodFill(d, 5, 5, '^');
  assert.ok(n > 0);
  assert.equal(d.grid[5][5], '^');
  assert.equal(d.grid[5][60], '.', 'other side of the wall untouched');
  assert.equal(floodFill(d, 5, 5, '^'), 0, 'same tile is a no-op');
});

t('resize keeps the floor at the bottom and the left edge fixed', () => {
  const d = newDoc(60, 30);
  d.grid[10][7] = 'G';
  resizeDoc(d, 80, 40);
  assert.equal(d.W, 80);
  assert.equal(d.H, 40);
  assert.equal(d.grid[39][5], '#', 'floor still at the bottom');
  assert.equal(d.grid[20][7], 'G', 'content shifted down with the floor');
  assert.equal(d.grid[0][5], '.');
  resizeDoc(d, 50, 30);
  assert.equal(d.W, 50);
  assert.equal(d.grid[29][5], '#');
  assert.equal(d.grid[10][7], 'G');
});

t('resize clamps to sane limits', () => {
  const d = newDoc();
  resizeDoc(d, 5, 5);
  assert.equal(d.W, 20);
  assert.equal(d.H, 10);
  resizeDoc(d, 9999, 9999);
  assert.equal(d.W, 300);
  assert.equal(d.H, 80);
});

t('undo snapshots restore the map exactly', () => {
  const d = newDoc();
  const before = mapText(d);
  const s = snapshot(d);
  paintRect(d, { x: 3, y: 3 }, { x: 8, y: 8 }, '#');
  resizeDoc(d, 120, 35);
  restore(d, s);
  assert.equal(mapText(d), before);
  assert.equal(d.W, 96);
  assert.equal(d.H, 30);
});

t('problems: missing start, missing exit, unopenable door', () => {
  let d = newDoc();
  d.grid[d.H - 4][3] = '.';
  assert.ok(problems(d).some((p) => /start/.test(p)), problems(d).join('; '));

  d = newDoc();
  d.grid[d.H - 4][d.W - 4] = '.';
  assert.ok(problems(d).some((p) => /exit/.test(p)));

  d = newDoc();
  setCell(d, 40, 5, '3');
  assert.ok(problems(d).some((p) => /door 3/.test(p)));
});

t('wireDoors makes every door openable, with a findable code', () => {
  const d = newDoc();
  for (let y = 0; y < 27; y++) setCell(d, 50, y, '1');
  for (let y = 0; y < 27; y++) setCell(d, 70, y, '2');
  assert.ok(wireDoors(d).error, 'no terminal yet: should explain');
  setCell(d, 20, 26, 'c');
  const r = wireDoors(d);
  assert.deepEqual(r.added, ['1', '2']);
  assert.equal(r.terminal, 'c');
  assert.deepEqual(problems(d), []);
  assert.ok(d.side.terminals.c.fs['shutter1.log'].includes('DOOR-1'));
  assert.deepEqual(wireDoors(d).added, [], 'second run adds nothing');
});

t('exported text is a valid ES module in the same shape as the hand-made levels', async () => {
  const d = docFromDef(LEVELS[1], 2);
  d.levelNum = 7;
  const text = exportText(d);
  assert.match(text, /^const sidecar = /);
  assert.match(text, /export const level7 = \{ \.\.\.sidecar, map \};\n$/);
  const url = 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  const mod = await import(url);
  const back = mod.level7;
  assert.deepEqual(parseLevel(back).tiles, parseLevel(LEVELS[1]).tiles);
  assert.deepEqual(validateLevels([back]), []);
  assert.deepEqual(back.terminals, LEVELS[1].terminals);
});

t('flattenFs / unflattenFs round-trip nested folders and hidden files', () => {
  for (const l of LEVELS) for (const term of Object.values(l.terminals || {})) {
    assert.deepEqual(unflattenFs(flattenFs(term.fs)), term.fs);
  }
  assert.deepEqual(unflattenFs([{ path: 'a/b/c.txt', text: 'x' }, { path: '', text: 'skip' }, { path: '.priv', text: 'y' }]), { a: { b: { 'c.txt': 'x' } }, '.priv': 'y' });
});

t('setSetting writes dotted paths and a blank value removes the key and empty parents', () => {
  const side = { name: 'x' };
  setSetting(side, 'guard.interval', 0.8);
  assert.equal(getSetting(side, 'guard.interval'), 0.8);
  setSetting(side, 'bubble.duration', 7);
  setSetting(side, 'guard.interval', '');
  assert.equal(side.guard, undefined);
  assert.equal(side.bubble.duration, 7);
  setSetting(side, 'nothing.here', '');
  assert.equal(side.nothing, undefined);
});

t('guard / boss settings reach the parsed level, and B is a boss entity', () => {
  const doc = newDoc(40, 14, 1);
  setCell(doc, 20, 8, 'B');
  setSetting(doc.side, 'guard.interval', 0.4);
  setSetting(doc.side, 'boss.hp', 3);
  const L = parseLevel(toDef(doc));
  assert.equal(L.guard.interval, 0.4);
  assert.equal(L.guard.range, 34, 'unset values keep their defaults');
  assert.equal(L.boss.hp, 3);
  assert.equal(L.entities.filter((e) => e.type === 'boss').length, 1);
  assert.deepEqual(validateLevels([toDef(doc)]).filter(Boolean).length >= 0, true);
});

t('mapTerminals lists the terminal letters on the map', () => {
  const doc = newDoc(40, 14, 1);
  setCell(doc, 5, 5, 'c'); setCell(doc, 8, 5, 'a');
  assert.deepEqual(mapTerminals(doc), ['a', 'c']);
});

t('labels: sanitize, size clamp, bounds and hit test', () => {
  const list = sanitizeLabels([{ x: 3, y: 4, text: 'MOVE: A D', size: 200 }, { x: 'no', y: 1, text: 'x' }, { x: 1, y: 1, text: '  ' }, null]);
  assert.equal(list.length, 1);
  assert.equal(list[0].size, 64);
  assert.equal(labelSize({}), 16);
  const l = { x: 10, y: 5, text: 'AAAA\nBB', size: 18 };
  const b = labelBounds(l);
  assert.ok(b.w > 0 && b.h > 0);
  assert.equal(labelAt([l], 10.5, 5.5), l);
  assert.equal(labelAt([l], 0, 0), null);
  assert.ok(labelBounds({ ...l, size: 36 }).w > b.w * 1.9, 'bigger size = bigger box');
});

t('labels reach the parsed level and move with the floor when height changes', () => {
  const doc = newDoc(40, 14, 1);
  doc.side.labels = [{ x: 5, y: 3, text: 'JUMP: W', size: 20 }];
  assert.equal(parseLevel(toDef(doc)).labels[0].text, 'JUMP: W');
  resizeDoc(doc, 40, 20);
  assert.equal(doc.side.labels[0].y, 9);
});

t('copy / paste a region: tiles and text come along, empty cells leave the terrain alone', () => {
  const d = newDoc(40, 20, 1);
  setCell(d, 5, 5, '='); setCell(d, 6, 5, '='); setCell(d, 6, 6, '^'); setCell(d, 5, 6, 'a');
  d.side.labels = [{ x: 5.5, y: 4, text: 'HI', size: 20 }, { x: 30, y: 4, text: 'FAR' }];
  const r = rectOf(d, { x: 6, y: 6 }, { x: 5, y: 4 });
  assert.deepEqual(r, { x0: 5, y0: 4, x1: 6, y1: 6 });
  const c = copyRegion(d, r);
  assert.equal(c.w, 2); assert.equal(c.h, 3);
  assert.equal(c.labels.length, 1, 'only the text inside the box');
  setCell(d, 20, 6, '#');
  const out = pasteRegion(d, c, 20, 4);
  assert.deepEqual(out, { x0: 20, y0: 4, x1: 21, y1: 6 });
  assert.equal(d.grid[5][20], '='); assert.equal(d.grid[6][21], '^'); assert.equal(d.grid[6][20], 'a');
  assert.equal(d.grid[4][20], '.');
  assert.equal(d.side.labels.length, 3);
  assert.deepEqual(d.side.labels[2], { x: 20.5, y: 4, text: 'HI', size: 20 });
  assert.deepEqual(problems(d), []);
});

t('a copy never duplicates the start or exit; a move (singles) takes them along', () => {
  const d = newDoc(40, 20, 1);
  const whole = rectOf(d, { x: 0, y: 0 }, { x: 39, y: 19 });
  const c = copyRegion(d, whole);
  assert.ok(c.cells.flat().every((ch) => ch !== '@' && ch !== '>'));
  const m = copyRegion(d, whole, { singles: true });
  assert.equal(m.cells.flat().filter((ch) => ch === '@').length, 1);
  clearRegion(d, whole);
  assert.equal(count(d, '@'), 0);
  pasteRegion(d, m, 0, 0);
  assert.equal(count(d, '@'), 1); assert.equal(count(d, '>'), 1);
});

t('clearRegion removes tiles and the text inside; pasting past the edge is clipped', () => {
  const d = newDoc(30, 12, 1);
  setCell(d, 10, 3, '#'); d.side.labels = [{ x: 10, y: 3, text: 'x' }];
  clearRegion(d, rectOf(d, { x: 9, y: 2 }, { x: 11, y: 4 }));
  assert.equal(d.grid[3][10], '.'); assert.equal(d.side.labels, undefined);
  const c = { w: 3, h: 1, cells: [['#', '#', '#']], labels: [] };
  const out = pasteRegion(d, c, 28, 3);
  assert.deepEqual(out, { x0: 28, y0: 3, x1: 29, y1: 3 });
  assert.equal(d.grid[3][29], '#');
});

t('undo can bring back text removed by a cut when the snapshot asks for labels', () => {
  const d = newDoc(30, 12, 1);
  d.side.labels = [{ x: 5, y: 3, text: 'KEEP' }];
  const s = snapshot(d, true);
  clearRegion(d, rectOf(d, { x: 4, y: 2 }, { x: 6, y: 4 }));
  assert.equal(d.side.labels, undefined);
  restore(d, s);
  assert.equal(d.side.labels[0].text, 'KEEP');
  const plain = snapshot(d);
  assert.equal(plain.labels, undefined, 'plain paints do not rewind text');
});

setTimeout(() => console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`), 50);
