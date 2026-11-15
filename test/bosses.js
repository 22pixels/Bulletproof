import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGame, update } from '../src/game.js';
import { emptyInput } from '../src/input.js';
import { validateLevels } from '../src/campaign.js';
import { MOVES } from '../src/boss.js';
import { BOSS_DESIGNS } from '../src/bosses/index.js';
import {
  blankDesign, blankFrame, validateDesign, designToFile, frameIndexAt, animLength, shotAngles, MOVE_NAMES, phaseFor, frameAt, padRows, insertFrameAt, moveFrameTo,
} from '../src/boss-data.js';

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 3).join('\n      ')); process.exitCode = 1; }
}
const DT = 1 / 60;
const clone = (x) => JSON.parse(JSON.stringify(x));
const root = BOSS_DESIGNS.root;

function room(boss) {
  const rows = Array.from({ length: 14 }, (_, y) => (y === 0 || y >= 12 ? '#'.repeat(70) : '#' + '.'.repeat(68) + '#'));
  const put = (x, y, ch) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  put(3, 11, '@'); put(67, 11, '>'); put(40, 8, 'B');
  return { name: 'T', map: rows.join('\n'), terminals: {}, boss };
}
function game(boss = { design: 'root' }) {
  const g = createGame(room(boss));
  g.maxHearts = g.hearts = 99;
  g.player.x = 20; g.player.y = 11 + 1 - g.player.h;
  return g;
}
const step = (g, n = 1) => { for (let i = 0; i < n; i++) update(g, emptyInput(), DT); };

t('the shipped design is valid and registered', () => {
  assert.deepEqual(validateDesign(root), []);
  assert.deepEqual(validateDesign(blankDesign('x')), []);
});

t('validateDesign catches bad data', () => {
  const bad = (fn) => { const d = clone(root); fn(d); return validateDesign(d); };
  assert.ok(bad((d) => { d.name = 'no spaces'; }).some((m) => m.includes('name')));
  assert.ok(bad((d) => { d.animations[0].frames[0].rows.pop(); }).some((m) => m.includes('does not match')));
  assert.ok(bad((d) => { d.animations[1].frames[0].ms = 0; }).some((m) => m.includes('duration')));
  assert.ok(bad((d) => { d.attacks[0].anim = 'nope'; }).some((m) => m.includes("'nope'")));
  assert.ok(bad((d) => { d.attacks[0].steps[0].frame = 9; }).some((m) => m.includes('frame 10')));
  assert.ok(bad((d) => { d.attacks[0].steps = []; }).some((m) => m.includes('no shots')));
  assert.ok(bad((d) => { d.phases[0].move = 'fly'; }).some((m) => m.includes('movement')));
  assert.ok(bad((d) => { d.phases[0].attacks = ['ghost']; }).some((m) => m.includes("'ghost'")));
  assert.ok(bad((d) => { d.phases[0].below = 0.5; }).some((m) => m.includes('full health')));
  assert.ok(bad((d) => { d.animations.push(clone(d.animations[0])); }).some((m) => m.includes('two animations')));
});

t('animation timing: looping wraps, one-shot holds its last frame', () => {
  const a = { loop: true, frames: [{ ms: 100 }, { ms: 200 }, { ms: 100 }] };
  assert.equal(animLength(a), 0.4);
  assert.deepEqual([0, 0.05, 0.1, 0.29, 0.31, 0.39, 0.41].map((x) => frameIndexAt(a, x)), [0, 0, 1, 1, 2, 2, 0]);
  const once = { ...a, loop: false };
  assert.equal(frameIndexAt(once, 5), 2);
  assert.equal(frameAt(root, 'idle', 0.5).ms, 400, 'second idle frame at 0.5s');
});

t('shot patterns: aimed fan, fixed angle, ring', () => {
  const from = { x: 0, y: 0 };
  assert.deepEqual(shotAngles({ kind: 'aimed', count: 1 }, from, { x: 10, y: 0 }), [0]);
  const fan = shotAngles({ kind: 'aimed', count: 3, spread: 40 }, from, { x: 0, y: 10 });
  assert.equal(fan.length, 3);
  assert.ok(Math.abs(fan[1] - Math.PI / 2) < 1e-9 && Math.abs(fan[2] - fan[0] - (40 * Math.PI) / 180) < 1e-9);
  assert.ok(Math.abs(shotAngles({ kind: 'angle', count: 1, angle: 90 }, from, { x: 99, y: 0 })[0] - Math.PI / 2) < 1e-9);
  const ring = shotAngles({ kind: 'ring', count: 4, angle: 45 }, from, { x: 0, y: 0 });
  assert.equal(ring.length, 4);
  assert.ok(Math.abs(ring[1] - ring[0] - Math.PI / 2) < 1e-9);
});

t('phases pick by hp fraction', () => {
  assert.equal(phaseFor(root, 1).attacks[0], 'aimed');
  assert.equal(phaseFor(root, 0.5).attacks[0], 'fan');
  assert.equal(phaseFor(root, 0.1).attacks[0], 'ring');
});

t('movement names in the editor match the game', () => {
  assert.deepEqual([...MOVE_NAMES].sort(), Object.keys(MOVES).sort());
});

t('a designed boss idles, then fires on the frame the attack maps to, not before', () => {
  const g = game({ design: 'root', firstDelay: 0.5, interval: 5 });
  const b = g.level.entities.find((e) => e.type === 'boss');
  step(g, 2);
  assert.equal(b.design.name, 'root');
  assert.equal(b.hitR, 2);
  let start = null, shot = null;
  for (let i = 0; i < 180 && shot === null; i++) {
    step(g);
    if (start === null && b.atk) start = g.time;
    if (g.bullets.length) shot = g.time;
  }
  assert.ok(start !== null && shot !== null);
  assert.ok(Math.abs(shot - start - 0.25) < 0.05, `fired ${(shot - start).toFixed(3)}s into the attack, expected 0.25`);
  assert.equal(b.anim, 'attack');
  step(g, 90);
  assert.equal(b.anim, 'idle', 'back to idle after the animation ends');
  assert.equal(b.atk, null);
});

t('the boss plays its phase attacks in turn and every shot of a multi-shot attack fires once', () => {
  const d = clone(root);
  d.attacks = [{ name: 'burst', anim: 'attack', steps: [
    { frame: 0, kind: 'angle', angle: 180, count: 2, spread: 10, ox: -3, oy: 0 },
    { frame: 1, kind: 'ring', count: 8, angle: 0, ox: 3, oy: 1 },
    { frame: 2, kind: 'angle', angle: 270, count: 1, ox: 0, oy: -2, speed: 5 },
  ] }];
  d.phases = [{ below: 1, move: 'still', attacks: ['burst'], rate: 1, anim: 'idle' }];
  assert.deepEqual(validateDesign(d), []);
  BOSS_DESIGNS.__t = d;
  const g = game({ design: '__t', firstDelay: 0.1, interval: 99 });
  const mine = [];
  const push = g.bullets.push.bind(g.bullets);
  g.bullets.push = (...a) => { mine.push(...a); return push(...a); };
  step(g, 90);
  delete BOSS_DESIGNS.__t;
  assert.equal(mine.length, 2 + 8 + 1);
  const slow = mine.filter((b) => b.speed === 5);
  assert.equal(slow.length, 1, 'the one shot with a custom speed');
  assert.ok(slow[0].vy < 0 && Math.abs(slow[0].vx) < 1e-6, 'and it goes straight up');
  const b = g.level.entities.find((e) => e.type === 'boss');
  assert.ok(mine.some((m) => m.x < b.x), 'left-hand muzzle (ox -3)');
});

t('a bigger hit radius means bullets land from further away', () => {
  const g = game({ design: 'root', firstDelay: 999 });
  const b = g.level.entities.find((e) => e.type === 'boss');
  step(g, 2);
  const hp = b.hp;
  g.bullets.push({ x: b.x + 0.5 + 1.8, y: b.y + 0.5, vx: 0, vy: 0, speed: 0, owner: 'player', held: false, selected: false, angle: 0, baseAngle: 0, life: 5, dead: false });
  step(g, 2);
  assert.equal(b.hp, hp - 1);
});

t('designToFile writes a module that loads back identical', async () => {
  const d = clone(root);
  d.name = 'tmp_roundtrip'; d.animations[0].frames[0].rows[1] = ' | "quote" \\ | ';
  d.animations[0].frames[0].rows = padRows(d.animations[0].frames[0].rows, d.w, d.h);
  const f = path.join(os.tmpdir(), `boss-rt-${process.pid}.mjs`);
  fs.writeFileSync(f, designToFile(d));
  const m = await import(pathToFileURL(f).href);
  fs.unlinkSync(f);
  assert.deepEqual(clone(m.boss_tmp_roundtrip), clone(d));
});

t('a level that names an unknown boss design is reported', () => {
  const lv = room({ design: 'ghost' });
  assert.ok(validateLevels([lv]).some((m) => m.includes("'ghost'")));
  assert.ok(!validateLevels([room({ design: 'root' })]).some((m) => m.includes('boss design')));
});

t('blankFrame / padRows size things right', () => {
  assert.deepEqual(blankFrame(3, 2).rows, ['   ', '   ']);
  assert.deepEqual(padRows(['abcdef', 'x'], 4, 3), ['abcd', 'x   ', '    ']);
});

t('insertFrameAt pads to the design size and shots on later frames follow', () => {
  const d = clone(root);
  const a = d.animations.find((x) => d.attacks.some((k) => k.anim === x.name));
  const atk = d.attacks.find((k) => k.anim === a.name);
  const before = atk.steps.map((s) => s.frame), n = a.frames.length;
  const at = insertFrameAt(d, a.name, 0, { rows: ['XY'], ms: 90 });
  assert.equal(at, 0);
  assert.equal(a.frames.length, n + 1);
  assert.equal(a.frames[0].rows.length, d.h);
  assert.ok(a.frames[0].rows.every((r) => r.length === d.w), 'rows padded to the boss size');
  assert.equal(a.frames[0].ms, 90);
  assert.deepEqual(atk.steps.map((s) => s.frame), before.map((f) => f + 1));
  assert.deepEqual(validateDesign(d), []);
});

t('moveFrameTo reorders and every shot keeps pointing at its own drawing', () => {
  const d = blankDesign('t', 6, 3);
  const a = d.animations[0];
  a.frames = ['A', 'B', 'C', 'D'].map((c) => ({ rows: padRows([c], 6, 3), ms: 100 }));
  d.attacks = [{ name: 'x', anim: a.name, steps: [{ frame: 0, kind: 'aimed', count: 1, speed: 10 }, { frame: 1, kind: 'aimed', count: 1, speed: 10 }, { frame: 3, kind: 'aimed', count: 1, speed: 10 }] }];
  const letters = () => a.frames.map((f) => f.rows[0][0]).join('');
  const shotLetters = () => d.attacks[0].steps.map((s) => a.frames[s.frame].rows[0][0]).join('');
  assert.equal(moveFrameTo(d, a.name, 0, 2), 2);
  assert.equal(letters(), 'BCAD'); assert.equal(shotLetters(), 'ABD');
  assert.equal(moveFrameTo(d, a.name, 3, 0), 0);
  assert.equal(letters(), 'DBCA'); assert.equal(shotLetters(), 'ABD');
  assert.equal(moveFrameTo(d, a.name, 1, 1), 1, 'no-op');
  assert.equal(letters(), 'DBCA');
  assert.equal(moveFrameTo(d, a.name, 0, 99), 3, 'clamped to the end');
  assert.equal(letters(), 'BCAD'); assert.equal(shotLetters(), 'ABD');
});

setTimeout(() => console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ''}`), 50);
