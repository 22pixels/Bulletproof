import { clamp, approach } from './util.js';

export const EPS = 1e-4;

export const PHYS = {
  gravity: 70,
  maxFall: 32,
  run: 11,
  accelGround: 110,
  accelAir: 70,
  fricGround: 100,
  fricAir: 25,
  jumpV: 22,
  jumpCut: 0.45,
  coyote: 0.1,
  buffer: 0.12,
  wallSlide: 5,
  wallKick: 11,
  wallLock: 0.15,
  dropTime: 0.2,
};

export function makePlayer() {
  return {
    x: 0, y: 0, w: 0.7, h: 0.9,
    vx: 0, vy: 0,
    onGround: false, coyote: 0, jumpBuf: 0, jumping: false,
    wall: 0, lock: 0, dropT: 0, facing: 1,
  };
}

export function tileAt(level, cx, cy) {
  if (cx < 0 || cx >= level.w) return '#';
  if (cy < 0 || cy >= level.h) return '.';
  return level.tiles[cy][cx];
}

export function isSolid(level, cx, cy) {
  const ch = tileAt(level, cx, cy);
  if (ch === '#') return true;
  if (ch >= '1' && ch <= '9') return !level.open.has(ch);
  return false;
}

function rectSolid(level, x, y, w, h) {
  for (let cy = Math.floor(y); cy <= Math.floor(y + h); cy++)
    for (let cx = Math.floor(x); cx <= Math.floor(x + w); cx++)
      if (isSolid(level, cx, cy)) return true;
  return false;
}

function touchingWall(level, p, dir) {
  const x = dir < 0 ? p.x - 0.08 : p.x + p.w + 0.03;
  return rectSolid(level, x, p.y + 0.1, 0.05, p.h - 0.2);
}

export function overlapsTile(level, p, ch) {
  const x0 = Math.floor(p.x + 0.15), x1 = Math.floor(p.x + p.w - 0.15);
  const y0 = Math.floor(p.y + 0.4), y1 = Math.floor(p.y + p.h - 0.05);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++)
      if (tileAt(level, cx, cy) === ch) return true;
  return false;
}

function moveX(level, p, dx) {
  if (dx === 0) return;
  p.x += dx;
  const y0 = Math.floor(p.y + EPS), y1 = Math.floor(p.y + p.h - EPS);
  const x0 = Math.floor(p.x), x1 = Math.floor(p.x + p.w - EPS);
  if (dx > 0) {
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++)
        if (isSolid(level, cx, cy)) { p.x = cx - p.w - EPS; p.vx = 0; return; }
  } else {
    for (let cx = x1; cx >= x0; cx--)
      for (let cy = y0; cy <= y1; cy++)
        if (isSolid(level, cx, cy)) { p.x = cx + 1 + EPS; p.vx = 0; return; }
  }
}

function moveY(level, p, dy) {
  if (dy === 0) return;
  const prevBottom = p.y + p.h;
  p.y += dy;
  p.onGround = false;
  const x0 = Math.floor(p.x + EPS), x1 = Math.floor(p.x + p.w - EPS);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + p.h - EPS);
  if (dy > 0) {
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const oneWay = tileAt(level, cx, cy) === '=' && prevBottom <= cy + 0.001 && p.dropT <= 0;
        if (isSolid(level, cx, cy) || oneWay) {
          p.y = cy - p.h; p.vy = 0; p.onGround = true; return;
        }
      }
  } else {
    for (let cy = y1; cy >= y0; cy--)
      for (let cx = x0; cx <= x1; cx++)
        if (isSolid(level, cx, cy)) { p.y = cy + 1 + EPS; p.vy = 0; return; }
  }
}

export function stepPlayer(level, p, inp, dt, abilities = {}) {
  const P = PHYS;
  p.lock = Math.max(0, p.lock - dt);
  const dir = p.lock > 0 ? 0 : (inp.right ? 1 : 0) - (inp.left ? 1 : 0);

  p.wall = 0;
  if (!p.onGround) {
    if (inp.left && touchingWall(level, p, -1)) p.wall = -1;
    else if (inp.right && touchingWall(level, p, 1)) p.wall = 1;
  }

  if (p.lock <= 0) {
    if (dir !== 0) {
      let a = (p.onGround ? P.accelGround : P.accelAir) * dt;
      if (Math.sign(p.vx) === -dir) a *= 2;
      p.vx = clamp(p.vx + dir * a, -P.run, P.run);
      p.facing = dir;
    } else {
      p.vx = approach(p.vx, 0, (p.onGround ? P.fricGround : P.fricAir) * dt);
    }
  }

  p.coyote = p.onGround ? P.coyote : Math.max(0, p.coyote - dt);
  p.jumpBuf = inp.jumpPressed ? P.buffer : Math.max(0, p.jumpBuf - dt);
  p.dropT = Math.max(0, p.dropT - dt);
  if (inp.down && p.onGround) p.dropT = P.dropTime;

  if (p.jumpBuf > 0) {
    if (p.coyote > 0) {
      p.vy = -P.jumpV; p.coyote = 0; p.jumpBuf = 0; p.jumping = true; p.onGround = false;
    } else if (abilities.wallJump && p.wall !== 0) {
      p.vy = -P.jumpV * 0.95;
      p.vx = -p.wall * P.wallKick;
      p.facing = -p.wall;
      p.lock = P.wallLock; p.jumpBuf = 0; p.jumping = true; p.wall = 0;
    }
  }
  if (inp.jumpReleased && p.jumping && p.vy < 0) { p.vy *= P.jumpCut; p.jumping = false; }

  p.vy = Math.min(P.maxFall, p.vy + P.gravity * dt);
  if (abilities.wallJump && p.wall !== 0 && p.vy > P.wallSlide) p.vy = P.wallSlide;

  moveX(level, p, p.vx * dt);
  moveY(level, p, p.vy * dt);
  if (p.vy >= 0) p.jumping = false;
}
