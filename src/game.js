import { parseLevel } from './level.js';
import { createBubble, updateBubble, bubbleActive, resetBubble, playerScale } from './bubble.js';
import { makePlayer, stepPlayer, overlapsTile } from './physics.js';
import { createTerminal, terminalKey } from './terminal.js';
import { VIEW, MAX_HEARTS } from './config.js';
import { clamp } from './util.js';
import { updateBullets } from './bullets.js';
import { updateGuards } from './guards.js';
import { updateBosses, hitBoss } from './boss.js';
import { updateFlyers } from './flyers.js';
import { createEventState, updateEvents, recordKill, recordDeath } from './events.js';

export function createGame(levelDef, carry = {}) {
  const level = parseLevel(levelDef);
  const maxHearts = carry.maxHearts ?? 3;
  const g = {
    level,
    mode: 'mview',
    time: 0,
    worldTime: 0,
    hearts: Math.min(carry.hearts ?? maxHearts, maxHearts),
    maxHearts,
    invuln: 0,
    shake: 0,
    deaths: 0,
    complete: false,
    hasNext: false,
    checkpoint: { x: level.start.x, y: level.start.y },
    used: new Set(),
    terminal: null,
    nearTerminal: null,
    toast: null,
    cam: { x: 0, y: 0 },
    particles: [],
    bullets: [],
    events: createEventState(),
    abilities: { ...level.abilities, ...(carry.abilities || {}) },
    player: makePlayer(),
  };
  g.bubble = createBubble(level.bubble);

  const rng = carry.rng || Math.random;

  
  respawn(g, true);
  if (level.intro) say(g, level.intro, 4);
  return g;
}

export function say(g, text, seconds = 2.5) {
  g.toast = { lines: Array.isArray(text) ? text : [text], t: seconds, dur: seconds };
}

function respawnPoint(g) {
  return g.level.respawn === 'start' ? (g.startOverride ?? g.level.start) : g.checkpoint;
}

function place(p, c) {
  p.x = c.x + (1 - p.w) / 2;
  p.y = c.y + 1 - p.h;
  p.vx = 0; p.vy = 0;
  p.coyote = 0; p.jumpBuf = 0; p.jumping = false; p.lock = 0; p.dropT = 0;
  p.onGround = false;
}

export function respawn(g, initial = false) {
  if (!initial) recordDeath(g, Math.floor(g.player.x + g.player.w / 2), Math.floor(g.player.y + g.player.h / 2));
  place(g.player, respawnPoint(g));
  if (!initial) {
    g.invuln = 1.2;
    resetBubble(g.bubble);
    g.bullets.length = 0;
  }
  updateCamera(g, true);
}

export function hurt(g, { n = 1, respawnAfter = true } = {}) {
  if (g.invuln > 0) return false;
  g.hearts -= n;
  g.shake = 0.35;
  if (g.hearts <= 0) {
    g.deaths++;
    g.hearts = g.maxHearts;
    say(g, ['PROCESS TERMINATED', g.level.respawn === 'start' ? 'restarting from the beginning' : 'restored from last checkpoint'], 2.5);
    respawn(g);
  } else {
    say(g, 'INTEGRITY DAMAGED', 1.5);
    if (respawnAfter) respawn(g);
    else g.invuln = 1.0;
  }
  return true;
}

export function updateCamera(g, snap = false) {
  const p = g.player, L = g.level, cam = g.cam;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const fwd = VIEW.cols * 0.45, back = VIEW.cols * 0.30;

  if (snap) cam.x = cx - VIEW.cols * 0.35;
  else if (cx > cam.x + fwd) cam.x = cx - fwd;
  else if (cx < cam.x + back) cam.x = cx - back;
  cam.x = clamp(cam.x, 0, Math.max(0, L.w - VIEW.cols));

  const top = VIEW.rows * 0.30, bot = VIEW.rows * 0.60;
  if (snap) cam.y = cy - VIEW.rows * 0.5;
  else if (cy > cam.y + bot) cam.y = cy - bot;
  else if (cy < cam.y + top) cam.y = cy - top;
  cam.y = clamp(cam.y, 0, Math.max(0, L.h - VIEW.rows));
}

function findTerminal(g) {
  const p = g.player;
  const px = p.x + p.w / 2, py = p.y + p.h / 2;
  for (const e of g.level.entities) {
    if (e.type !== 'terminal') continue;
    if (Math.abs(px - (e.x + 0.5)) < 1.6 && Math.abs(py - (e.y + 0.5)) < 1.2) return e;
  }
  return null;
}

function enterTerminal(g, ent) {
  g.mode = 'terminal';
  g.terminal = createTerminal(g.level.terminals[ent.id], ent.id);
  if (g.checkpoint.x !== ent.x || g.checkpoint.y !== ent.y) {
    g.checkpoint = { x: ent.x, y: ent.y };
    g.terminal.lines.push('[checkpoint saved]', '');
  }
}

function applyEffect(g, fx) {
  if (fx.type === 'door') {
    g.level.open.add(fx.id);
    say(g, `SHUTTER ${fx.id} OPEN`, 2.5);
  } else if (fx.type === 'heart') {
    g.maxHearts = Math.min(MAX_HEARTS, g.maxHearts + 1);
    g.hearts = g.maxHearts;
    say(g, ['INTEGRITY CELL ABSORBED', `max integrity ${g.maxHearts}`], 3);
  } else if (fx.type === 'ability') {
    g.abilities[fx.name] = true;
    say(g, ['PRIVILEGE GRANTED', fx.name], 3);
  }
}

export function terminalInput(g, ev) {
  if (g.mode !== 'terminal' || !g.terminal) return;
  const r = terminalKey(g.terminal, ev, g.used);
  for (const fx of r.effects) applyEffect(g, fx);
  if (r.exit) {
    g.mode = 'mview';
    g.terminal = null;
  }
}

function updateParticles(g, worldDt) {
  for (const p of g.particles) {
    p.y += p.v * worldDt;
    if (p.y > VIEW.rows + 1) { p.y = -1; p.x = Math.random() * VIEW.cols; }
  }
}

export function update(g, inp, dt) {
  g.time += dt;
  if (g.mode !== 'mview') return;

  if (g.toast && (g.toast.t -= dt) <= 0) g.toast = null;
  g.shake = Math.max(0, g.shake - dt);
  if (g.complete) return;

  const bub = g.bubble;
  updateBubble(bub, dt, inp.bubblePressed);
  const worldDt = dt * bub.scale;
  g.worldTime += worldDt;

  updateGuards(g, worldDt);
  updateBosses(g, worldDt);
  updateFlyers(g, worldDt);

  const hits = updateBullets(g.bullets, {
    level: g.level, bubble: g.bubble, player: g.player, mouse: inp.mouse,
    cam: g.cam, worldDt,
    targets: g.level.entities.filter((e) => e.type === 'guard' || e.type === 'boss' || e.type === 'flyer'),
  });
  for (const h of hits) {
    if (h.type === 'player') hurt(g, { respawnAfter: false });
    else if (h.type === 'target') {
      if (h.target.type === 'boss') hitBoss(g, h.target);
      else { g.level.entities.splice(g.level.entities.indexOf(h.target), 1); g.shake = 0.15; recordKill(g, h.target); }
    }
  }
  g.invuln = Math.max(0, g.invuln - dt);

  const pdt = dt * playerScale(g.bubble);
  stepPlayer(g.level, g.player, inp, pdt, g.abilities);
  updateParticles(g, worldDt);

  const p = g.player;
  if (overlapsTile(g.level, p, '^')) hurt(g);
  else if (p.y > g.level.h + 3) hurt(g);

  const exit = g.level.entities.find((e) => e.type === 'exit');
  if (exit && Math.abs(p.x + p.w / 2 - (exit.x + 0.5)) < 0.8 && Math.abs(p.y + p.h / 2 - (exit.y + 0.5)) < 1) {
    g.complete = true;
  }

  updateEvents(g, say, inp);
  if (g.teleport) {
    place(g.player, g.teleport);
    g.teleport = null;
    g.invuln = Math.max(g.invuln, 0.6);
    updateCamera(g, true);
  }

  for (const e of g.level.entities) {
    if (e.type !== 'checkpoint') continue;
    if (Math.abs(p.x + p.w / 2 - (e.x + 0.5)) < 1.2 && Math.abs(p.y + p.h / 2 - (e.y + 0.5)) < 1.6 && (g.checkpoint.x !== e.x || g.checkpoint.y !== e.y)) {
      g.checkpoint = { x: e.x, y: e.y };
      say(g, 'CHECKPOINT', 1.2);
    }
  }

  g.nearTerminal = findTerminal(g);
  if (inp.interactPressed && g.nearTerminal) enterTerminal(g, g.nearTerminal);

  updateCamera(g);
}
