import { BOSS } from './config.js';
import { spawnBullet } from './bullets.js';
import { BOSS_DESIGNS } from './bosses/index.js';
import { recordKill } from './events.js';
import { animByName, attackByName, animLength, frameIndexAt, phaseFor as designPhase, fireStep } from './boss-data.js';

export const MOVES = {
  still: (b) => ({ x: b.hx, y: b.hy }),
  sway: (b, t) => ({ x: b.hx + Math.sin(t * 0.9) * 6, y: b.hy }),
  hover: (b, t) => ({ x: b.hx + Math.sin(t * 0.7) * 8, y: b.hy - 2 + Math.sin(t * 1.9) * 1.5 }),
};

const aimAt = (b, g) => {
  const p = g.player;
  return Math.atan2(p.y + p.h / 2 - (b.y + 0.5), p.x + p.w / 2 - (b.x + 0.5));
};
export const ATTACKS = {
  aimed: (b, g) => spawnBullet(g.bullets, b.x + 0.5, b.y + 0.5, aimAt(b, g)),
  fan: (b, g) => { const a = aimAt(b, g); for (const d of [-0.35, 0, 0.35]) spawnBullet(g.bullets, b.x + 0.5, b.y + 0.5, a + d); },
  ring: (b, g) => { for (let i = 0; i < 12; i++) spawnBullet(g.bullets, b.x + 0.5, b.y + 0.5, (i / 12) * Math.PI * 2 + b.t); },
};

export const PHASES = [
  { below: 1.0, move: 'sway', attack: 'aimed', rate: 1.0 },
  { below: 0.6, move: 'hover', attack: 'fan', rate: 0.9 },
  { below: 0.3, move: 'hover', attack: 'ring', rate: 0.7 },
];
const phaseFor = (frac) => [...PHASES].reverse().find((p) => frac <= p.below) || PHASES[0];

export function updateBosses(g, worldDt) {
  for (const e of g.level.entities) {
    if (e.type !== 'boss') continue;
    const cfg = { ...BOSS, ...(g.level.boss || {}) };
    if (e.hp === undefined) {
      e.hp = e.maxHp = cfg.hp; e.hx = e.x; e.hy = e.y; e.t = 0; e.cd = cfg.firstDelay;
      e.design = BOSS_DESIGNS[cfg.design] || null;
      if (e.design) { e.hitR = e.design.hitRadius; e.anim = 'idle'; e.animT = 0; e.atk = null; e.turn = 0; }
    }
    e.t += worldDt;
    if (e.design) { updateDesigned(e, g, worldDt, cfg); continue; }
    const ph = phaseFor(e.hp / e.maxHp);
    Object.assign(e, (MOVES[ph.move] || MOVES.still)(e, e.t, g.level));
    e.cd -= worldDt;
    if (e.cd <= 0) { (ATTACKS[ph.attack] || ATTACKS.aimed)(e, g); e.cd = Math.max(0.1, cfg.interval * ph.rate); }
  }
}

function updateDesigned(e, g, dt, cfg) {
  const d = e.design;
  const ph = designPhase(d, e.hp / e.maxHp);
  Object.assign(e, (MOVES[ph.move] || MOVES.still)(e, e.t, g.level));
  if (e.atk) {
    const a = e.atk, anim = animByName(d, a.def.anim);
    a.t += dt;
    const idx = frameIndexAt(anim, a.t);
    for (const [i, s] of a.def.steps.entries()) {
      if (!a.fired.has(i) && s.frame <= idx) { a.fired.add(i); fireStep(s, e, g, spawnBullet); }
    }
    e.anim = a.def.anim; e.animT = a.t;
    if (a.t >= animLength(anim)) {
      for (const [i, s] of a.def.steps.entries()) if (!a.fired.has(i)) { a.fired.add(i); fireStep(s, e, g, spawnBullet); }
      e.atk = null; e.animT = 0;
      e.cd = Math.max(0.1, cfg.interval * ph.rate);
    }
    return;
  }
  e.anim = ph.anim; e.animT += dt;
  e.cd -= dt;
  const list = (ph.attacks || []).map((n) => attackByName(d, n)).filter(Boolean);
  if (e.cd <= 0 && list.length) {
    e.atk = { def: list[e.turn++ % list.length], t: 0, fired: new Set() };
    e.anim = e.atk.def.anim; e.animT = 0;
  }
}

export function hitBoss(g, boss) {
  boss.hp -= 1;
  g.shake = 0.2;
  if (boss.hp > 0) return false;
  g.level.entities.splice(g.level.entities.indexOf(boss), 1);
  recordKill(g, boss);
  for (const d of (g.level.boss?.opens || [])) g.level.open.add(String(d));
  g.bullets.length = 0;
  return true;
}
