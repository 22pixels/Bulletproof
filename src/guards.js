import { isSolid } from './physics.js';
import { spawnBullet } from './bullets.js';

export function lineOfSight(level, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.25));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolid(level, Math.floor(x0 + dx * t), Math.floor(y0 + dy * t))) return false;
  }
  return true;
}

export function updateGuards(g, worldDt) {
  const p = g.player;
  const GUARD = g.level.guard;
  const interval = Math.max(0.05, GUARD.interval);
  const px = p.x + p.w / 2, py = p.y + p.h / 2;
  let n = 0;
  for (const e of g.level.entities) {
    if (e.type !== 'guard') continue;
    e.cd ??= GUARD.firstDelay + (n % 4) * 0.25;
    e.shots ??= 0;
    n++;

    const gx = e.x + 0.5, gy = e.y + 0.5;
    const sees = Math.hypot(px - gx, py - gy) <= GUARD.range && lineOfSight(g.level, gx, gy, px, py);
    if (!sees) {
      e.cd = Math.max(e.cd, GUARD.firstDelay);
      continue;
    }
    e.cd -= worldDt;
    if (e.cd <= 0) {
      spawnBullet(g.bullets, gx, gy, Math.atan2(py - gy, px - gx));
      e.cd = interval;
      e.shots++;
    }
  }
}
