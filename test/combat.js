import assert from 'node:assert/strict';
import { createGame, update, hurt } from '../src/game.js';
import { emptyInput } from '../src/input.js';
import { spawnBullet } from '../src/bullets.js';
import { playerScale } from '../src/bubble.js';
import { lineOfSight } from '../src/guards.js';
import { hitBoss, PHASES } from '../src/boss.js';
import { validateEvents } from '../src/events.js';
import { VIEW, GUARD, DEFAULT_BUBBLE } from '../src/config.js';

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok  ', name);
  } catch (e) {
    console.log('FAIL', name, '\n     ', e.stack.split('\n').slice(0, 3).join('\n      '));
    process.exitCode = 1;
  }
}

const DT = 1 / 60;
const row = (s) => s.padEnd(60, '.');
function room({ guards = [], walls = [], bosses = [], flyers = [], checkpoints = [], events, flyer, respawn } = {}) {
  const rows = Array.from({ length: 12 }, () => row('#'));
  rows[10] = '#'.repeat(60);
  rows[11] = '#'.repeat(60);
  for (let y = 1; y < 10; y++) rows[y] = '#' + '.'.repeat(58) + '#';
  rows[0] = '#'.repeat(60);
  const put = (x, y, ch) => { rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };
  put(3, 9, '@');
  put(57, 9, '>');
  for (const x of guards) put(x, 9, 'G');
  for (const x of bosses) put(x, 8, 'B');
  for (const [x, y] of flyers) put(x, y, 'F');
  for (const x of checkpoints) put(x, 9, 'C');
  for (const [x, y] of walls) put(x, y, '#');
  return { name: 'TEST', map: rows.join('\n'), terminals: {}, events, flyer, respawn };
}

function game(opts = {}, bubble = {}) {
  const def = room(opts);
  def.bubble = bubble;
  const g = createGame(def);
  g.maxHearts = g.hearts = 99;
  g.player.x = opts.playerX ?? 20;
  g.player.y = 9 + 1 - g.player.h;
  return g;
}

const step = (g, inp = emptyInput(), n = 1) => { for (let i = 0; i < n; i++) update(g, inp, DT); };
const pressQ = (g) => { const i = emptyInput(); i.bubblePressed = true; update(g, i, DT); };
const pcenter = (g) => ({ x: g.player.x + g.player.w / 2, y: g.player.y + g.player.h / 2 });
const enemy = (g, dx, dy = 0) => { const p = pcenter(g); return spawnBullet(g.bullets, p.x + dx, p.y + dy, Math.PI); };
const mouseAt = (g, x, y, pressed = false) => {
  const i = emptyInput();
  i.mouse = { px: (x - g.cam.x) * VIEW.cellW, py: (y - g.cam.y) * VIEW.cellH, down: pressed, pressed, released: false };
  return i;
};

t('every guard shoots, not just the first one', () => {
  const g = game({ guards: [30, 40, 50] });
  step(g, emptyInput(), 150);
  const shots = g.level.entities.filter((e) => e.type === 'guard').map((e) => e.shots);
  assert.ok(shots.every((n) => n >= 1), `shots per guard: ${shots}`);
});

t('guards are staggered, not in lockstep', () => {
  const g = game({ guards: [30, 31] });
  const first = [];
  for (let f = 0; f < 240 && first.length < 2; f++) {
    step(g);
    for (const e of g.level.entities) if (e.type === 'guard' && e.shots > 0 && !first.some((x) => x.e === e)) first.push({ e, f });
  }
  assert.equal(first.length, 2);
  assert.notEqual(first[0].f, first[1].f, 'both fired on the same frame');
});

t('a guard needs line of sight: a wall in between blocks it', () => {
  const walls = [];
  for (let y = 1; y < 10; y++) walls.push([25, y]);
  const g = game({ guards: [40], walls, playerX: 20 });
  step(g, emptyInput(), 300);
  assert.equal(g.level.entities.find((e) => e.type === 'guard').shots, 0);
  assert.equal(lineOfSight(g.level, 40.5, 9.5, 20.5, 9.5), false);
});

t('a guard out of range does not shoot', () => {
  const g = game({ guards: [57], playerX: 57 - GUARD.range - 5 });
  step(g, emptyInput(), 300);
  assert.equal(g.level.entities.find((e) => e.type === 'guard').shots, 0);
});

t('a guard waits firstDelay after seeing you before the first shot', () => {
  const g = game({ guards: [40], playerX: 20 });
  let frames = 0;
  while (!(g.level.entities.find((e) => e.type === 'guard').shots > 0) && frames < 600) { step(g); frames++; }
  assert.ok(frames * DT >= GUARD.firstDelay - 0.05, `fired after only ${(frames * DT).toFixed(2)}s`);
});

t('guard bullets hit the player', () => {
  const g = game({ guards: [30], playerX: 20 });
  g.hearts = 3; g.maxHearts = 3;
  step(g, emptyInput(), 150);
  assert.ok(g.hearts < 3, 'player should have been hit');
});

t('Q opens the bubble even when no bullet is nearby', () => {
  const g = game();
  pressQ(g);
  assert.equal(g.bubble.state, 'active');
});

t('the bubble stays up with no bullets until its duration runs out', () => {
  const g = game();
  pressQ(g);
  step(g, emptyInput(), 120);
  assert.equal(g.bubble.state, 'active');
  step(g, emptyInput(), 200);
  assert.equal(g.bubble.state, 'cooldown');
});

function threeBullets() {
  const g = game();
  const a = enemy(g, 2, 0);
  const b = enemy(g, -4, -1);
  const c = enemy(g, 5, -1);
  a.vx = -14; b.vx = 14; c.vx = -14; a.vy = b.vy = c.vy = 0; b.angle = 0;
  pressQ(g);
  step(g, emptyInput(), 15);
  return { g, a, b, c };
}

t('every bullet in range is frozen, not just one', () => {
  const { a, b, c } = threeBullets();
  assert.ok(a.held && b.held && c.held);
});

t('default selection is the bullet closest to the player', () => {
  const { a, b, c } = threeBullets();
  assert.equal(a.selected, true);
  assert.equal(b.selected, false);
  assert.equal(c.selected, false);
});

t('clicking ON another bullet selects it instead of firing', () => {
  const { g, a, c } = threeBullets();
  step(g, mouseAt(g, c.x, c.y, true));
  assert.equal(c.selected, true);
  assert.equal(a.selected, false);
  assert.ok(a.held && c.held, 'nothing should have fired');
  step(g, emptyInput(), 5);
  assert.equal(c.selected, true, 'the pick sticks');
});

t('clicking elsewhere fires the selected bullet along the mouse direction', () => {
  const { g, a } = threeBullets();
  const target = { x: a.x, y: a.y - 6 };
  g.bubble.cfg.aimCone = 180;
  step(g, mouseAt(g, target.x, target.y, true));
  assert.equal(a.held, false);
  assert.equal(a.owner, 'player');
  assert.ok(a.vy < 0 && Math.abs(a.vx) < 1e-6, `expected straight up, got ${a.vx},${a.vy}`);
});

t('after firing, selection falls back to the closest remaining bullet', () => {
  const { g, a, b, c } = threeBullets();
  g.bubble.cfg.aimCone = 180;
  step(g, mouseAt(g, 30, 3, true));
  step(g, emptyInput());
  assert.equal(a.held, false);
  assert.equal(b.selected, true, 'b is now the closest to the player');
  assert.equal(c.selected, false);
});

t('the aim cone still limits the angle', () => {
  const { g, a } = threeBullets();
  g.bubble.cfg.aimCone = 45;
  const base = a.baseAngle;
  step(g, mouseAt(g, a.x + Math.cos(base + Math.PI / 2) * 5, a.y + Math.sin(base + Math.PI / 2) * 5));
  let d = Math.atan2(Math.sin(a.angle - base), Math.cos(a.angle - base));
  assert.ok(Math.abs(d) <= Math.PI / 4 + 1e-9, `angle off by ${d}`);
});

t('when the bubble runs out, every held bullet is released', () => {
  const { g, a, b, c } = threeBullets();
  g.bubble.t = g.bubble.cfg.duration;
  step(g, emptyInput(), 2);
  assert.ok(!a.held && !b.held && !c.held);
});

t('firing the last held bullet does NOT end bullet time at once (the 1-second bug)', () => {
  const g = game();
  const a = enemy(g, 3);
  a.vx = -14;
  pressQ(g);
  step(g, emptyInput(), 15);
  assert.ok(a.held);
  g.bubble.cfg.aimCone = 180;
  step(g, mouseAt(g, 50, 3, true));
  step(g, emptyInput(), 3);
  assert.equal(g.bubble.state, 'active', 'still active right after firing');
  step(g, emptyInput(), 60);
  assert.equal(g.bubble.state, 'active', 'still active 1s later');
  g.bullets.length = 0;
  step(g, emptyInput(), 60);
  assert.equal(g.bubble.state, 'active', 'no auto-close once bullets are gone');
});

t('bubble lasts the full duration when bullets keep coming', () => {
  const g = game();
  enemy(g, 3); pressQ(g); step(g, emptyInput(), 15);
  const held = g.bullets.find((b) => b.held);
  for (let i = 0; i < 60 * 4.5; i++) { if (i % 30 === 0) enemy(g, 4); step(g, emptyInput(), 1); }
  assert.equal(g.bubble.state, 'active');
  assert.ok(held);
});

t('guard fire rate comes from the level: guard.interval', () => {
  const count = (interval) => {
    const g = game({ guards: [40] });
    g.level.guard.interval = interval;
    g.player.x = 10;
    step(g, emptyInput(), 60 * 6);
    return g.level.entities.find((e) => e.type === 'guard').shots;
  };
  const slow = count(2), fast = count(0.5);
  assert.ok(fast > slow * 2, `fast ${fast} vs slow ${slow}`);
});

t('the player is slowed in bullet time and eases in and out', () => {
  const run = (bubbleOn) => {
    const g = game();
    if (bubbleOn) { enemy(g, 8); pressQ(g); step(g, emptyInput(), 90); }
    const x0 = g.player.x;
    const inp = emptyInput(); inp.right = true;
    step(g, inp, 30);
    return g.player.x - x0;
  };
  const normal = run(false), slowed = run(true);
  assert.ok(slowed < normal * 0.6, `slowed ${slowed.toFixed(2)} vs normal ${normal.toFixed(2)}`);
  assert.ok(slowed > 0, 'still moves');

  const g = game();
  assert.equal(playerScale(g.bubble), 1);
  enemy(g, 8);
  pressQ(g);
  const early = playerScale(g.bubble);
  step(g, emptyInput(), 90);
  const settled = playerScale(g.bubble);
  assert.ok(early > settled, 'eases down');
  assert.ok(Math.abs(settled - DEFAULT_BUBBLE.playerTimeScale) < 0.01, `settled at ${settled}`);
});

t('playerTimeScale 1 keeps full speed (per-level override)', () => {
  const g = game({}, { playerTimeScale: 1 });
  enemy(g, 8); pressQ(g); step(g, emptyInput(), 90);
  assert.equal(playerScale(g.bubble), 1);
});

t('dying in bullet time respawns with the bubble off, no lockout, and no old bullets', () => {
  const g = game();
  g.hearts = 1;
  enemy(g, 8); enemy(g, 3);
  pressQ(g);
  step(g, emptyInput(), 20);
  assert.equal(g.bubble.state, 'active');
  assert.ok(g.bubble.scale < 1);
  hurt(g, { respawnAfter: true });
  assert.equal(g.bubble.state, 'idle');
  assert.equal(g.bubble.cd, 0);
  assert.equal(g.bubble.scale, 1);
  assert.equal(g.bubble.radius, 0);
  assert.equal(g.bullets.length, 0);
  assert.equal(playerScale(g.bubble), 1);
  assert.ok(g.invuln > 0);
  assert.equal(g.deaths, 1);
});

t('falling into a pit (respawn without dying) also drops bullet time', () => {
  const g = game();
  enemy(g, 8); pressQ(g); step(g, emptyInput(), 10);
  g.player.y = g.level.h + 10;
  step(g);
  assert.equal(g.bubble.state, 'idle');
  assert.equal(g.bubble.scale, 1);
});

t('a hit that does not kill leaves bullet time running', () => {
  const g = game();
  g.hearts = 5;
  enemy(g, 8); pressQ(g); step(g, emptyInput(), 10);
  hurt(g, { respawnAfter: false });
  assert.equal(g.bubble.state, 'active');
});

t('the shipped levels still run with all of this', () => {
  const g = game({ guards: [30, 34, 38, 42], playerX: 10 });
  const inp = emptyInput();
  for (let f = 0; f < 600; f++) {
    if (f % 90 === 0) inp.bubblePressed = true; else inp.bubblePressed = false;
    inp.mouse = { px: 400, py: 200, down: false, pressed: f % 45 === 0, released: false };
    update(g, inp, DT);
    assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.bubble.scale));
  }
});

t('a boss moves, fires, loses hp to reflected bullets and opens its doors when it dies', () => {
  const g = game({ bosses: [40] });
  g.level.boss.hp = 2; g.level.boss.opens = ['5'];
  const b = g.level.entities.find((e) => e.type === 'boss');
  step(g, emptyInput(), 60 * 4);
  assert.equal(b.maxHp, 2);
  assert.ok(g.bullets.length > 0 || b.t > 0, 'boss runs on its timer');
  assert.notEqual(b.x, b.hx, 'sway moved it');
  assert.equal(hitBoss(g, b), false);
  assert.equal(b.hp, 1);
  assert.equal(hitBoss(g, b), true);
  assert.ok(!g.level.entities.includes(b));
  assert.ok(g.level.open.has('5'));
});

t('a reflected player bullet that reaches the boss damages it (end to end)', () => {
  const g = game({ bosses: [40] });
  const b = g.level.entities.find((e) => e.type === 'boss');
  g.level.boss.firstDelay = 999;
  step(g, emptyInput(), 2);
  const hp0 = b.hp;
  spawnBullet(g.bullets, b.x + 0.5 - 3, b.y + 0.5, 0, 'player');
  step(g, emptyInput(), 60);
  assert.equal(b.hp, hp0 - 1);
  assert.ok(PHASES.length >= 1);
});

t('touching a checkpoint moves the respawn point', () => {
  const g = game({ checkpoints: [30], playerX: 29.5 });
  step(g, emptyInput(), 5);
  assert.equal(g.checkpoint.x, 30);
  g.hearts = 1; g.invuln = 0;
  g.player.y = 99; step(g, emptyInput(), 2);
  assert.ok(Math.abs(g.player.x - 30) < 1, 'respawned at the checkpoint ' + g.player.x);
});

t('flyer patrol stays inside its range; follow chases the player and both shoot', () => {
  const g = game({ flyers: [[30, 5]], flyer: { range: 4, rangeY: 1, speed: 6 } });
  const f = g.level.entities.find((e) => e.type === 'flyer');
  let lo = 99, hi = -99;
  for (let i = 0; i < 60 * 12; i++) { step(g); lo = Math.min(lo, f.x); hi = Math.max(hi, f.x); }
  assert.ok(lo >= 30 - 4.1 && hi <= 30 + 4.1, `range ${lo}..${hi}`);
  assert.ok(hi - lo > 5, 'it actually moved');
  assert.ok(f.shots > 0, 'it shot');
  const h = game({ flyers: [[25, 3]], flyer: { mode: 'follow', speed: 8 }, playerX: 45 });
  const e = h.level.entities.find((x) => x.type === 'flyer');
  step(h, emptyInput(), 60 * 6);
  assert.ok(Math.abs(e.x - h.player.x) < 5, 'followed ' + e.x + ' vs ' + h.player.x);
});

t('a flyer dies to a reflected bullet', () => {
  const g = game({ flyers: [[40, 5]] });
  const f = g.level.entities.find((e) => e.type === 'flyer');
  g.level.flyer.firstDelay = 999;
  spawnBullet(g.bullets, f.x - 3, f.y + 0.5, 0, 'player');
  step(g, emptyInput(), 90);
  assert.ok(!g.level.entities.includes(f));
});

const ev = (id, when, doo) => ({ id, when, do: doo });

t('event: all guards dead -> text, wall removed, boss spawned (and not at the start of an empty level)', () => {
  const g = game({ guards: [50], events: [ev(1, [{ type: 'allDead', of: 'guards' }], [
    { type: 'toast', text: 'ALL CLEAR' }, { type: 'wall', x: 10, y: 5, w: 1, h: 3, mode: 'remove' }, { type: 'boss', x: 30, y: 8 }]) ] });
  g.level.tiles[5] = g.level.tiles[5].slice(0, 10) + '#' + g.level.tiles[5].slice(11);
  step(g, emptyInput(), 10);
  assert.ok(!g.events.fired.has(1), 'guard still alive');
  g.level.entities.splice(g.level.entities.findIndex((e) => e.type === 'guard'), 1);
  step(g, emptyInput(), 2);
  assert.ok(g.events.fired.has(1));
  assert.equal(g.toast.lines[0], 'ALL CLEAR');
  assert.equal(g.level.tiles[5][10], '.');
  assert.ok(g.level.entities.some((e) => e.type === 'boss'));
  const empty = game({ events: [ev(1, [{ type: 'allDead', of: 'guards' }], [{ type: 'toast', text: 'x' }])] });
  step(empty, emptyInput(), 10);
  assert.ok(!empty.events.fired.has(1), 'no guards ever existed');
});

t('event: player position triggers (at, past x, past y) and fire only once', () => {
  const g = game({ events: [
    ev(1, [{ type: 'pastX', x: 25, dir: 'right' }], [{ type: 'guard', x: 40, y: 9 }]),
    ev(2, [{ type: 'playerAt', x: 20, y: 9, r: 2 }], [{ type: 'label', x: 5, y: 3, text: 'HI', size: 20 }]),
    ev(3, [{ type: 'pastY', y: 3, dir: 'above' }], [{ type: 'toast', text: 'UP' }]),
  ] });
  step(g, emptyInput(), 3);
  assert.ok(g.events.fired.has(2), 'player starts at x=20');
  assert.ok(!g.events.fired.has(1));
  assert.equal(g.level.labels.length, 1);
  g.player.x = 26; step(g, emptyInput(), 3);
  assert.ok(g.events.fired.has(1));
  step(g, emptyInput(), 30);
  assert.equal(g.level.entities.filter((e) => e.type === 'guard').length, 1, 'fired once only');
  assert.ok(!g.events.fired.has(3));
});

t('event delay: runs N seconds after the conditions are met, even if the player walks away', () => {
  const g = game({ events: [{ id: 1, delay: 5, when: [{ type: 'pastX', x: 25, dir: 'right' }], do: [{ type: 'toast', text: 'LATE' }] }] });
  step(g, emptyInput(), 120);
  assert.ok(!g.events.armedAt[1], 'conditions not met yet, clock not started');
  g.player.x = 26; step(g, emptyInput(), 3);
  assert.ok(g.events.armedAt[1] !== undefined, 'clock started');
  g.player.x = 10;
  step(g, emptyInput(), 60 * 4);
  assert.ok(!g.events.fired.has(1), 'about 4s in: still waiting');
  step(g, emptyInput(), 90);
  assert.ok(g.events.fired.has(1), 'fires ~5s after the trigger');
  assert.equal(g.toast.lines[0], 'LATE');
});

t('event delay is validated and 0/absent means immediate', () => {
  const good = { id: 1, when: [{ type: 'time', seconds: 0 }], do: [{ type: 'toast', text: 'x' }] };
  assert.deepEqual(validateEvents([{ ...good, delay: 2.5 }]), []);
  assert.ok(validateEvents([{ ...good, delay: -1 }]).some((m) => m.includes('delay')));
  assert.ok(validateEvents([{ ...good, delay: 'x' }]).some((m) => m.includes('delay')));
  const g = game({ events: [good] });
  step(g, emptyInput(), 3);
  assert.ok(g.events.fired.has(1));
});

t('event chains: after (with delay), time, doors; walls never entomb the player', () => {
  const g = game({ events: [
    ev(1, [{ type: 'time', seconds: 0.5 }], [{ type: 'door', id: 4, mode: 'open' }]),
    ev(2, [{ type: 'after', id: 1, delay: 1 }], [{ type: 'wall', x: 18, y: 7, w: 6, h: 3, mode: 'spawn' }, { type: 'flyer', x: 30, y: 4, mode: 'follow' }]),
  ] });
  step(g, emptyInput(), 60 * 0.4); assert.ok(!g.events.fired.has(1));
  step(g, emptyInput(), 60 * 0.3); assert.ok(g.events.fired.has(1)); assert.ok(g.level.open.has('4'));
  assert.ok(!g.events.fired.has(2));
  step(g, emptyInput(), 60 * 1.2); assert.ok(g.events.fired.has(2));
  const p = g.player;
  const cx = Math.floor(p.x + p.w / 2), cy = Math.floor(p.y + p.h / 2);
  assert.notEqual(g.level.tiles[cy][cx], '#', 'player cell stays free');
  assert.equal(g.level.tiles[7][18], '#');
  assert.equal(g.level.entities.find((e) => e.type === 'flyer').opts.mode, 'follow');
});

t('event: wall action can spawn passthrough (=) tiles, and remove clears them', () => {
  const g = game({ events: [
    ev(1, [{ type: 'time', seconds: 0.1 }], [{ type: 'wall', x: 30, y: 6, w: 4, h: 1, tile: '=', mode: 'spawn' }, { type: 'wall', x: 30, y: 4, w: 2, h: 1, mode: 'spawn' }]),
    ev(2, [{ type: 'time', seconds: 0.5 }], [{ type: 'wall', x: 30, y: 6, w: 4, h: 1, mode: 'remove' }]),
  ] });
  step(g, emptyInput(), 15);
  assert.equal(g.level.tiles[6].slice(30, 34), '====');
  assert.equal(g.level.tiles[4].slice(30, 32), '##', 'no tile = solid, as before');
  step(g, emptyInput(), 30);
  assert.equal(g.level.tiles[6].slice(30, 34), '....');
});

t('event: walls action spawns several lines of different types in one go', () => {
  const g = game({ events: [ev(1, [{ type: 'time', seconds: 0.1 }], [{ type: 'walls', mode: 'spawn', lines: [
    { x: 10, y: 5, len: 5, dir: 'h', tile: '=' },
    { x: 20, y: 3, len: 4, dir: 'v', tile: '#' },
    { x: 25, y: 7, len: 3, dir: 'h', tile: '#' },
  ] }])] });
  step(g, emptyInput(), 15);
  assert.equal(g.level.tiles[5].slice(10, 16), '=====.');
  for (let y = 3; y < 7; y++) assert.equal(g.level.tiles[y][20], '#');
  assert.equal(g.level.tiles[7].slice(25, 29), '###.');
  const off = game({ events: [ev(1, [{ type: 'time', seconds: 0.1 }], [{ type: 'walls', mode: 'remove', lines: [{ x: 1, y: 3, len: 3, dir: 'v', tile: '#' }] }])] });
  step(off, emptyInput(), 15);
  for (let y = 3; y < 6; y++) assert.equal(off.level.tiles[y][1], '.', 'remove clears whatever is there');
});

t('a passthrough tile spawned by an event lets the player jump up through it and stand on it', () => {
  const g = game({ playerX: 30, events: [ev(1, [{ type: 'time', seconds: 0 }], [{ type: 'walls', mode: 'spawn', lines: [{ x: 26, y: 8, len: 10, dir: 'h', tile: '=' }] }])] });
  step(g, emptyInput(), 3);
  assert.equal(g.level.tiles[8][30], '=');
  assert.ok(Math.abs(g.player.y + g.player.h - 10) < 0.05, 'starts on the floor, below the platform');
  const press = emptyInput(); press.jump = true; press.jumpPressed = true;
  step(g, press, 1);
  const hold = emptyInput(); hold.jump = true;
  step(g, hold, 25);
  step(g, emptyInput(), 90);
  assert.ok(Math.abs(g.player.y + g.player.h - 8) < 0.05, 'ended up standing ON the spawned platform (bottom at row 8), not under it');
});

t('validateEvents checks the new wall fields', () => {
  const ok = (doo) => validateEvents([ev(1, [{ type: 'time', seconds: 1 }], doo)], { w: 60, h: 12 });
  assert.deepEqual(ok([{ type: 'wall', x: 1, y: 1, w: 2, h: 1, tile: '=' }]), []);
  assert.deepEqual(ok([{ type: 'walls', mode: 'spawn', lines: [{ x: 1, y: 1, len: 3, dir: 'h', tile: '#' }, { x: 5, y: 1, len: 2, dir: 'v', tile: '=' }] }]), []);
  assert.ok(ok([{ type: 'wall', x: 1, y: 1, w: 2, h: 1, tile: 'Z' }]).some((m) => m.includes('tile must be')));
  assert.ok(ok([{ type: 'walls', lines: [] }]).some((m) => m.includes('at least one line')));
  const bad = ok([{ type: 'walls', lines: [{ x: 999, y: 1, len: 3, dir: 'h', tile: '#' }, { x: 1, y: 1, len: 0, dir: 'q', tile: '?' }] }]);
  for (const needle of ['outside the map', 'length above 0', 'direction must be', 'tile must be']) assert.ok(bad.some((m) => m.includes(needle)), needle + '\n' + bad.join('\n'));
});

t('checkpoint tile is C (old K still loads)', () => {
  const g = game({ checkpoints: [30] });
  assert.equal(g.level.entities.filter((e) => e.type === 'checkpoint').length, 1);
  const def = room({ checkpoints: [30] }); def.map = def.map.replace('C', 'K');
  assert.equal(createGame(def).level.entities.filter((e) => e.type === 'checkpoint').length, 1);
});

t('respawn toggle: checkpoint (default) vs start', () => {
  for (const [mode, expect] of [[undefined, 30], ['checkpoint', 30], ['start', 3]]) {
    const g = game({ checkpoints: [30], playerX: 29.5, respawn: mode });
    step(g, emptyInput(), 5);
    assert.equal(g.checkpoint.x, 30);
    g.player.y = 99; g.invuln = 0; step(g, emptyInput(), 2);
    assert.ok(Math.abs(g.player.x - expect) < 1, `${mode}: respawned at ${g.player.x}, wanted ~${expect}`);
  }
  const g = game({ respawn: 'start' }); g.hearts = 1; g.invuln = 0; hurt(g);
  assert.match(g.toast.lines[1], /beginning/);
});

const shoot = (g, e) => { spawnBullet(g.bullets, e.x - 3, e.y + 0.5, 0, 'player'); step(g, emptyInput(), 90); };
const inBox = (extra = {}) => ({ type: 'allDead', of: 'guards', x1: 25, y1: 5, x2: 35, y2: 9, ...extra });

t('event: all dead in an area needs a real kill, ignores guards outside, never fires on despawn', () => {
  const mk = () => game({ guards: [30, 50], events: [ev(1, [inBox()], [{ type: 'toast', text: 'ZONE' }])] });
  let g = mk(); g.level.guard.firstDelay = 999; step(g, emptyInput(), 10);
  assert.ok(!g.events.fired.has(1));
  g = mk(); g.level.guard.firstDelay = 999;
  g.level.entities.splice(g.level.entities.findIndex((e) => e.type === 'guard' && e.x === 30), 1);
  step(g, emptyInput(), 10);
  assert.ok(!g.events.fired.has(1), 'despawn is not a kill');
  g = mk(); g.level.guard.firstDelay = 999;
  shoot(g, g.level.entities.find((e) => e.type === 'guard' && e.x === 30));
  assert.ok(g.level.entities.some((e) => e.type === 'guard' && e.x === 50), 'outside guard still alive');
  assert.ok(g.events.fired.has(1));
  g = mk(); g.level.guard.firstDelay = 999;
  shoot(g, g.level.entities.find((e) => e.type === 'guard' && e.x === 50));
  assert.ok(!g.events.fired.has(1));
  g = game({ guards: [30, 32], events: [ev(1, [inBox({ x1: 35, y1: 9, x2: 25, y2: 5 })], [{ type: 'toast', text: 'ZONE' }])] });
  g.level.guard.firstDelay = 999;
  shoot(g, g.level.entities.find((e) => e.type === 'guard' && e.x === 30));
  assert.ok(!g.events.fired.has(1), 'one still alive');
  shoot(g, g.level.entities.find((e) => e.type === 'guard' && e.x === 32));
  assert.ok(g.events.fired.has(1));
});

t('event: key press fires on that key only, and only when the other conditions hold', () => {
  const g = game({ events: [ev(1, [{ type: 'keyPress', key: 'KeyY' }], [{ type: 'toast', text: 'YES' }]),
    ev(2, [{ type: 'keyPress', key: 'KeyY' }, { type: 'pastX', x: 40, dir: 'right' }], [{ type: 'toast', text: 'BOTH' }])] });
  const press = (...keys) => { const i = emptyInput(); i.keysPressed = keys; update(g, i, DT); };
  step(g, emptyInput(), 5); assert.ok(!g.events.fired.has(1), 'no key, no event');
  press('KeyU'); assert.ok(!g.events.fired.has(1), 'wrong key');
  press('KeyU', 'KeyY'); assert.ok(g.events.fired.has(1));
  assert.ok(!g.events.fired.has(2), 'player is not past x=40');
});

t('event: despawn text removes the labels at that spot (static or spawned) and nothing else', () => {
  const def = room({ events: [ev(1, [{ type: 'time', seconds: 0.1 }], [{ type: 'unlabel', x: 11, y: 3 }])] });
  def.labels = [{ x: 10, y: 3, text: 'WASD to move', size: 16 }, { x: 30, y: 3, text: 'keep me', size: 16 }];
  const g = createGame(def);
  assert.equal(g.level.labels.length, 2);
  step(g, emptyInput(), 20);
  assert.deepEqual(g.level.labels.map((l) => l.text), ['keep me']);
});

t('event: player dies in a box -> respawn here (moves them, sets the respawn point, works in start mode)', () => {
  for (const mode of ['checkpoint', 'start']) {
    const g = game({ respawn: mode, playerX: 30, events: [ev(1, [{ type: 'playerDied', x1: 25, y1: 5, x2: 35, y2: 9 }], [{ type: 'respawnHere', x: 40, y: 9 }])] });
    step(g, emptyInput(), 5);
    assert.ok(!g.events.fired.has(1), 'no death yet');
    g.player.x = 10; g.player.y = 9 + 1 - g.player.h; g.invuln = 0; g.hearts = 1; hurt(g);
    step(g, emptyInput(), 3);
    assert.ok(!g.events.fired.has(1), 'died outside the box');
    g.player.x = 30; g.invuln = 0; g.hearts = 1; hurt(g);
    step(g, emptyInput(), 3);
    assert.ok(g.events.fired.has(1), mode);
    assert.ok(Math.abs(g.player.x - 40) < 1, `${mode}: moved to 40, at ${g.player.x}`);
    g.player.x = 15; g.invuln = 0; g.hearts = 1; hurt(g);
    assert.ok(Math.abs(g.player.x - 40) < 1, `${mode}: later deaths go to the new point, at ${g.player.x}`);
  }
  const bad = validateEvents([ev(1, [{ type: 'playerDied', x1: 1 }], [{ type: 'respawnHere', x: 5 }])], { w: 60, h: 12 });
  assert.ok(bad.some((m) => m.includes('four corner')) && bad.some((m) => m.includes('respawnHere needs x and y')), bad.join('\n'));
  assert.deepEqual(validateEvents([ev(1, [{ type: 'playerDied' }], [{ type: 'respawnHere', x: 5, y: 5 }])], { w: 60, h: 12 }), []);
});

t('validateEvents: new kinds', () => {
  const ok = (when, doo = [{ type: 'toast', text: 'a' }]) => validateEvents([ev(1, when, doo)], { w: 60, h: 12 });
  assert.deepEqual(ok([inBox()]), []);
  assert.deepEqual(ok([{ type: 'keyPress', key: 'KeyY' }], [{ type: 'unlabel', x: 3, y: 3 }]), []);
  assert.ok(ok([{ type: 'allDead', of: 'guards', x1: 1, y1: 1 }]).some((m) => m.includes('four corner')));
  assert.ok(ok([inBox({ x2: 999 })]).some((m) => m.includes('outside the map')));
  assert.ok(ok([{ type: 'keyPress' }]).some((m) => m.includes('needs a key')));
  assert.ok(ok([{ type: 'time', seconds: 1 }], [{ type: 'unlabel', x: 999, y: 1 }]).some((m) => m.includes('outside the map')));
});

t('validateEvents catches mistakes', () => {
  assert.deepEqual(validateEvents([ev(1, [{ type: 'time', seconds: 1 }], [{ type: 'toast', text: 'a' }])], { w: 60, h: 12 }), []);
  const bad = validateEvents([
    ev(1, [{ type: 'nope' }], [{ type: 'wall', x: 1, y: 1, w: 0, h: 2 }]),
    ev(1, [{ type: 'after', id: 9 }], [{ type: 'guard', x: 999, y: 1 }, { type: 'door', id: 12 }]),
    { id: 3, when: [], do: [] },
  ], { w: 60, h: 12 });
  for (const needle of ['unknown condition', 'wall needs', 'duplicate id', 'missing event', 'outside the map', 'door id', 'at least one condition'])
    assert.ok(bad.some((m) => m.includes(needle)), 'expected: ' + needle + '\n' + bad.join('\n'));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
