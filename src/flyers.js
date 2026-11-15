import { FLYER } from './config.js';
import { isSolid } from './physics.js';
import { spawnBullet } from './bullets.js';
import { lineOfSight } from './guards.js';

function step(level, e, nx, ny) {
  if (!isSolid(level, Math.floor(nx + 0.5), Math.floor(e.y + 0.5))) e.x = nx;
  if (!isSolid(level, Math.floor(e.x + 0.5), Math.floor(ny + 0.5))) e.y = ny;
}

export function updateFlyers(g, worldDt) {
  const p = g.player;
  const px = p.x + p.w / 2, py = p.y + p.h / 2;
  const L = g.level;
  for (const e of L.entities) {
    if (e.type !== 'flyer') continue;
    const c = { ...L.flyer, ...e.opts };
    if (e.t === undefined) { e.hx = e.x; e.hy = e.y; e.t = 0; e.cd = Math.max(c.firstDelay, 0); e.shots = 0; }
    e.t += worldDt;

    if (c.mode === 'follow') {
      const tx = px - 0.5, ty = py - c.hover - 0.5;
      const d = Math.hypot(tx - e.x, ty - e.y);
      if (d < c.sight && d > c.keep) {
        const k = Math.min(c.speed * worldDt, d - c.keep) / d;
        step(L, e, e.x + (tx - e.x) * k, e.y + (ty - e.y) * k);
      } else if (d >= c.sight) {
        step(L, e, e.x + Math.sin(e.t * 1.7) * 0.01, e.hy + Math.sin(e.t * 1.7) * 0.4);
      }
    } else {
      const w = c.speed / Math.max(c.range, 0.5);
      step(L, e, e.hx + Math.sin(e.t * w) * c.range, e.hy + Math.sin(e.t * w * 2) * c.rangeY);
    }

    const sees = Math.hypot(px - (e.x + 0.5), py - (e.y + 0.5)) <= c.sightFire && lineOfSight(L, e.x + 0.5, e.y + 0.5, px, py);
    if (!sees) { e.cd = Math.max(e.cd, c.firstDelay); continue; }
    e.cd -= worldDt;
    if (e.cd <= 0) {
      spawnBullet(g.bullets, e.x + 0.5, e.y + 0.5, Math.atan2(py - (e.y + 0.5), px - (e.x + 0.5)));
      e.cd = Math.max(0.05, c.interval);
      e.shots++;
    }
  }
}
