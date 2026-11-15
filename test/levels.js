import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels/index.js';
import { createCampaign, validateLevels } from '../src/campaign.js';
import { update, terminalInput } from '../src/game.js';
import { createTerminal } from '../src/terminal.js';
import { emptyInput } from '../src/input.js';

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

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function standOnExit(g) {
  const ex = g.level.entities.find((e) => e.type === 'exit');
  g.player.x = ex.x + (1 - g.player.w) / 2;
  g.player.y = ex.y + 1 - g.player.h;
  update(g, emptyInput(), 1 / 60);
}

function typeLine(g, line) {
  for (const k of line) terminalInput(g, { key: k });
  terminalInput(g, { key: 'Enter' });
}

function openTerminal(g, id) {
  g.mode = 'terminal';
  g.terminal = createTerminal(g.level.terminals[id], id);
}

t('every shipped level is valid', () => {
  assert.deepEqual(validateLevels(LEVELS), []);
});

t('validation catches an unopenable door', () => {
  const bad = { name: 'BAD', map: '#@..1..>.#\n##########', terminals: {} };
  const p = validateLevels([bad]);
  assert.ok(p.some((s) => s.includes('door 1')), p.join('; '));
});

t('validation catches a missing exit and names the level', () => {
  const bad = { name: 'NOEXIT', map: '#@....#\n#######', terminals: {} };
  const p = validateLevels([bad]);
  assert.ok(p.some((s) => s.includes('level 1') && s.includes('NOEXIT') && s.includes('exit')), p.join('; '));
});

t('createCampaign refuses bad data with a readable message', () => {
  const bad = { name: 'BAD', map: '#@..?..>#\n#########', terminals: {} };
  assert.throws(() => createCampaign([bad], fakeStorage()), /level 1 \(BAD\)/);
});

t('starts on level 1 with numbering', () => {
  const c = createCampaign(LEVELS, fakeStorage());
  const g = c.start();
  assert.equal(g.levelNum, 1);
  assert.equal(g.levelCount, LEVELS.length);
  assert.equal(g.hasNext, LEVELS.length > 1);
});

t('standing on the exit completes the level', () => {
  const c = createCampaign(LEVELS, fakeStorage());
  const g = c.start();
  standOnExit(g);
  assert.equal(g.complete, true);
});

t('next() loads the next level and carries hearts + abilities', () => {
  const c = createCampaign(LEVELS, fakeStorage());
  const g1 = c.start();
  g1.maxHearts = 4;
  g1.hearts = 2;
  g1.abilities.wallJump = true;
  assert.equal(c.next(), true);
  const g2 = c.game;
  assert.equal(g2.levelNum, 2);
  assert.equal(g2.maxHearts, 4);
  assert.equal(g2.hearts, 2);
  assert.equal(g2.abilities.wallJump, true);
  assert.notEqual(g2, g1);
});

t('each level starts with fresh doors, guards and bullets', () => {
  const c = createCampaign(LEVELS, fakeStorage());
  const g1 = c.start();
  g1.level.open.add('1');
  g1.bullets.push({});
  c.next();
  assert.equal(c.game.level.open.size, 0);
  assert.equal(c.game.bullets.length, 0);
});

t('progress is saved and resumes in a new session (full heal, keeps max hearts + abilities)', () => {
  const store = fakeStorage();
  const c1 = createCampaign(LEVELS, store);
  const g = c1.start();
  g.maxHearts = 5;
  g.hearts = 1;
  g.abilities.wallJump = true;
  c1.next();

  const c2 = createCampaign(LEVELS, store);
  const g2 = c2.start();
  assert.equal(g2.levelNum, 2);
  assert.equal(g2.maxHearts, 5);
  assert.equal(g2.hearts, 5);
  assert.equal(g2.abilities.wallJump, true);
});

t('fresh start wipes the save', () => {
  const store = fakeStorage();
  const c1 = createCampaign(LEVELS, store);
  c1.start();
  c1.next();
  const c2 = createCampaign(LEVELS, store);
  assert.equal(c2.start({ fresh: true }).levelNum, 1);
  assert.equal(createCampaign(LEVELS, store).start().levelNum, 1);
});

t('a corrupt save falls back to level 1', () => {
  const store = fakeStorage();
  store.setItem('root-save-v1', '{not json');
  assert.equal(createCampaign(LEVELS, store).start().levelNum, 1);
  store.setItem('root-save-v1', JSON.stringify({ level: 999, maxHearts: 3 }));
  assert.equal(createCampaign(LEVELS, store).start().levelNum, 1);
});

t('level override and goto clamp to the valid range', () => {
  const c = createCampaign(LEVELS, fakeStorage());
  assert.equal(c.start({ level: 999 }).levelNum, LEVELS.length);
  assert.equal(c.goto(-5).levelNum, 1);
  assert.equal(c.goto(1).levelNum, 2);
});

t('finishing the last level returns false and clears the save', () => {
  const store = fakeStorage();
  const c = createCampaign(LEVELS, store);
  c.start({ level: LEVELS.length - 1 });
  assert.equal(c.game.hasNext, false);
  assert.equal(c.next(), false);
  assert.equal(store.getItem('root-save-v1'), null);
});

t('level 2 flow: door opens via terminal, wall jump unlocks and carries into level 3', () => {
  const c = createCampaign(LEVELS, fakeStorage());
  const g = c.start({ level: 1 });
  assert.equal(g.abilities.wallJump, false);

  openTerminal(g, 'a');
  typeLine(g, 'unlock LOBBY-0002');
  assert.equal(g.level.open.has('1'), true, 'door 1 should be open');
  g.mode = 'mview';

  openTerminal(g, 'b');
  typeLine(g, 'unlock PRIV-0002');
  assert.equal(g.abilities.wallJump, true, 'wall jump should be granted');
  g.mode = 'mview';

  standOnExit(g);
  assert.equal(g.complete, true);
  c.next();
  assert.equal(c.game.levelNum, 3);
  assert.equal(c.game.abilities.wallJump, true);
});

t('every level survives 5 simulated seconds without throwing', () => {
  const c = createCampaign(LEVELS, fakeStorage());
  for (let i = 0; i < LEVELS.length; i++) {
    const g = c.load(i);
    const inp = emptyInput();
    inp.right = true;
    for (let f = 0; f < 300; f++) update(g, inp, 1 / 60);
    assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.y), `level ${i + 1} produced NaN position`);
  }
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
