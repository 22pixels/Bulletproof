import { approach, clamp } from './util.js';

export function createBubble(cfg) {
  return { cfg, state: 'idle', t: 0, cd: 0, scale: 1, radius: 0 };
}

export const bubbleActive = (b) => b.state === 'active';

export function endBubble(b) {
  if (b.state === 'active') end(b, b.cfg.unlimited ? 0 : b.cfg.cooldown);
}

export function resetBubble(b) {
  b.state = 'idle';
  b.t = 0;
  b.cd = 0;
  b.scale = 1;
  b.radius = 0;
}

export function playerScale(b) {
  const c = b.cfg;
  const span = 1 - c.timeScale;
  const f = span > 0 ? clamp((1 - b.scale) / span, 0, 1) : 0;
  return 1 + (c.playerTimeScale - 1) * f;
}

function end(b, cooldown) {
  if (cooldown > 0) {
    b.state = 'cooldown';
    b.cd = cooldown;
  } else {
    b.state = 'idle';
  }
}

export function updateBubble(b, dt, pressed) {
  const c = b.cfg;

  if (b.state === 'idle') {
    if (pressed) {
      b.state = 'active';
      b.t = 0;
    }
  } else if (b.state === 'active') {
    b.t += dt;
    if (pressed && c.canCancel) end(b, c.unlimited ? 0 : c.cooldown);
    else if (!c.unlimited && b.t >= c.duration - 1e-9) end(b, c.cooldown);
  } else if (b.state === 'cooldown') {
    b.cd -= dt;
    if (b.cd <= 1e-9) b.state = 'idle';
  }

  const active = b.state === 'active';
  b.scale = approach(b.scale, active ? c.timeScale : 1, dt * 6);
  b.radius = approach(b.radius, active ? c.radius : 0, dt * 40);
}

export function bubbleMeter(b) {
  const c = b.cfg;
  if (b.state === 'active') {
    if (c.unlimited) return { label: 'BUBBLE UNLIMITED', frac: 1, state: 'active' };
    return { label: 'BUBBLE', frac: clamp(1 - b.t / c.duration, 0, 1), state: 'active' };
  }
  if (b.state === 'cooldown') {
    return { label: 'RECHARGING', frac: clamp(1 - b.cd / c.cooldown, 0, 1), state: 'cooldown' };
  }
  return { label: 'BUBBLE READY [Q]', frac: 1, state: 'idle' };
}
