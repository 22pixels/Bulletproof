import { VIEW, BULLET } from './config.js';
import { bubbleActive } from './bubble.js';
import { isSolid } from './physics.js';

const { cellW, cellH } = VIEW;
const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function spawnBullet(list, x, y, angle, owner = 'enemy', speed = BULLET.speed) {
  const b = {
    x, y, speed, owner, angle,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    held: false,
    selected: false,
    baseAngle: angle + Math.PI,
    life: BULLET.life,
    dead: false,
  };
  list.push(b);
  return b;
}

function clampToCone(angle, base, cone) {
  if (cone >= 180) return angle;
  const lim = cone * DEG;
  return base + Math.max(-lim, Math.min(lim, wrap(angle - base)));
}

export function bulletNear(list, x, y, r) {
  for (const b of list) if (!b.dead && b.owner === 'enemy' && Math.hypot(b.x - x, b.y - y) <= r) return true;
  return false;
}

export function bubbleBusy(list, x, y, r) {
  for (const b of list) {
    if (b.dead) continue;
    if (b.held || b.owner === 'player') return true;
    if (Math.hypot(b.x - x, b.y - y) <= r) return true;
  }
  return false;
}

function capture(b) {
  b.held = true;
  b.selected = false;
  b.manual = false;
  b.baseAngle = Math.atan2(-b.vy, -b.vx);
  b.angle = b.baseAngle;
  b.vx = 0;
  b.vy = 0;
}

function release(b) {
  b.held = false;
  b.selected = false;
  b.manual = false;
  b.owner = 'player';
  b.speed *= BULLET.reflectBoost;
  b.vx = Math.cos(b.angle) * b.speed;
  b.vy = Math.sin(b.angle) * b.speed;
  b.life = BULLET.life;
}

function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return Math.hypot(cx - nx, cy - ny) < r;
}

export function updateBullets(list, ctx) {
  const { level, bubble, player, mouse, cam, worldDt, targets = [] } = ctx;
  const cfg = bubble.cfg;
  const active = bubbleActive(bubble);
  const hits = [];

  const pcx = player.x + player.w / 2;
  const pcy = player.y + player.h / 2;
  const mx = mouse.px / cellW + cam.x;
  const my = mouse.py / cellH + cam.y;

  let heldCount = 0;
  for (const b of list) if (b.held) heldCount++;

  for (const b of list) {
    if (b.held || b.dead) continue;

    b.x += b.vx * worldDt;
    b.y += b.vy * worldDt;
    b.life -= worldDt;

    if (b.life <= 0 || b.y < -5 || b.y > level.h + 5) { b.dead = true; continue; }

    if (isSolid(level, Math.floor(b.x), Math.floor(b.y))) {
      b.dead = true;
      hits.push({ type: 'wall', bullet: b });
      continue;
    }

    if (b.owner === 'enemy') {
      if (active && heldCount < cfg.maxHeld && Math.hypot(b.x - pcx, b.y - pcy) < bubble.radius) {
        capture(b);
        heldCount++;
        continue;
      }
      if (circleHitsRect(b.x, b.y, BULLET.radius, player.x, player.y, player.w, player.h)) {
        b.dead = true;
        hits.push({ type: 'player', bullet: b });
      }
    } else {
      for (const t of targets) {
        if (Math.hypot(b.x - (t.x + 0.5), b.y - (t.y + 0.5)) < BULLET.radius + (t.hitR ?? 0.5)) {
          b.dead = true;
          hits.push({ type: 'target', bullet: b, target: t });
          break;
        }
      }
    }
  }

  const held = list.filter((b) => b.held && !b.dead);
  if (held.length) {
    if (!active) {
      for (const b of held) release(b);
    } else {
      let pick = null;
      if (mouse.pressed) {
        let best = BULLET.pickRadius;
        for (const b of held) {
          const d = Math.hypot(mx - b.x, my - b.y);
          if (d <= best) { best = d; pick = b; }
        }
        if (pick) for (const b of held) b.manual = b === pick;
      }

      let sel = held.find((b) => b.manual);
      if (!sel) {
        let best = Infinity;
        for (const b of held) {
          const d = Math.hypot(pcx - b.x, pcy - b.y);
          if (d < best) { best = d; sel = b; }
        }
      }
      for (const b of held) b.selected = b === sel;

      sel.angle = clampToCone(Math.atan2(my - sel.y, mx - sel.x), sel.baseAngle, cfg.aimCone);
      if (mouse.pressed && !pick) release(sel);
    }
  }

  for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);

  return hits;
}
