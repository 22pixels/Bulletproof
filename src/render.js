import { VIEW, WIDTH, HEIGHT, COLORS, FONT } from './config.js';
import { bubbleMeter } from './bubble.js';
import { frameAt } from './boss-data.js';
import { promptOf } from './terminal.js';
import { drawLabels } from './labels.js';

const { cellW, cellH, cols, rows } = VIEW;
const mono = (px, weight = '') => `${weight} ${px}px ${FONT}`.trim();

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { k: 1 };

  function resize() {
    const dpr = globalThis.devicePixelRatio || 1;
    const iw = globalThis.innerWidth || WIDTH;
    const ih = globalThis.innerHeight || HEIGHT;
    const fit = Math.min(iw / WIDTH, ih / HEIGHT);
    canvas.style.width = Math.floor(WIDTH * fit) + 'px';
    canvas.style.height = Math.floor(HEIGHT * fit) + 'px';
    canvas.width = Math.floor(WIDTH * fit * dpr);
    canvas.height = Math.floor(HEIGHT * fit * dpr);
    view.k = fit * dpr;
  }

  function toVirtual(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { px: ((clientX - r.left) / r.width) * WIDTH, py: ((clientY - r.top) / r.height) * HEIGHT };
  }

  function draw(g) {
    ctx.setTransform(view.k, 0, 0, view.k, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (g.mode === 'terminal') drawTerminal(ctx, g);
    else drawWorld(ctx, g);
  }

  return { draw, resize, toVirtual };
}

const bar = (frac, n = 10) => {
  const f = Math.round(Math.max(0, Math.min(1, frac)) * n);
  return '#'.repeat(f) + '.'.repeat(n - f);
};

function glyph(ctx, ch, cx, cy, color) {
  ctx.fillStyle = color;
  ctx.fillText(ch, (cx - drawCam.x + 0.5) * cellW, (cy - drawCam.y + 0.5) * cellH);
}
const drawCam = { x: 0, y: 0 };

function drawBoss(ctx, e) {
  if (e.design) { drawDesignedBoss(ctx, e); return; }
  const body = ['/=B=\\', '|ROOT|', '\\_##_/'];
  body.forEach((line, i) => [...line].forEach((ch, j) => glyph(ctx, ch, e.x - Math.floor(line.length / 2) + j, e.y - 1 + i, COLORS.guard)));
  const n = Math.max(0, e.hp ?? 0), max = e.maxHp ?? n;
  const bar = '[' + '#'.repeat(n) + '.'.repeat(Math.max(0, max - n)) + ']';
  [...bar].forEach((ch, j) => glyph(ctx, ch, e.x - Math.floor(bar.length / 2) + j, e.y - 2.2, COLORS.guard));
}

function drawDesignedBoss(ctx, e) {
  const d = e.design, f = frameAt(d, e.anim, e.animT || 0);
  const ox = Math.floor(d.w / 2), oy = Math.floor(d.h / 2);
  (f?.rows || []).forEach((row, i) => [...row].forEach((ch, j) => {
    if (ch !== ' ') glyph(ctx, ch, e.x - ox + j, e.y - oy + i, COLORS.guard);
  }));
  const n = Math.max(0, e.hp ?? 0), max = e.maxHp ?? n;
  const hpBar = '[' + '#'.repeat(n) + '.'.repeat(Math.max(0, max - n)) + ']';
  [...hpBar].forEach((ch, j) => glyph(ctx, ch, e.x - Math.floor(hpBar.length / 2) + j, e.y - oy - 1.2, COLORS.guard));
}

function drawWorld(ctx, g) {
  const L = g.level;
  const cam = g.cam;
  drawCam.x = cam.x; drawCam.y = cam.y;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.font = mono(16);

  ctx.save();
  if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake * 14, (Math.random() - 0.5) * g.shake * 14);

  ctx.fillStyle = COLORS.rain;
  for (const p of g.particles) ctx.fillText(p.ch, p.x * cellW, p.y * cellH);

  const x0 = Math.max(0, Math.floor(cam.x)), x1 = Math.min(L.w - 1, Math.ceil(cam.x + cols));
  const y0 = Math.max(0, Math.floor(cam.y)), y1 = Math.min(L.h - 1, Math.ceil(cam.y + rows));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const ch = L.tiles[cy][cx];
      if (ch === '.') continue;
      if (ch === '#') {
        const deep = L.tiles[cy - 1]?.[cx] === '#';
        glyph(ctx, deep ? ':' : '#', cx, cy, deep ? COLORS.wallDeep : COLORS.wall);
      } else if (ch === '=') glyph(ctx, '=', cx, cy, COLORS.oneway);
      else if (ch === '^') glyph(ctx, '^', cx, cy, COLORS.spike);
      else if (ch >= '1' && ch <= '9' && !L.open.has(ch)) glyph(ctx, '%', cx, cy, COLORS.door);
    }
  }

  drawLabels(ctx, L.labels, cam.x, cam.y, cellW, cellH);

  ctx.font = mono(16, 'bold');
  for (const e of L.entities) {
    if (e.type === 'terminal') {
      glyph(ctx, '$', e.x, e.y, COLORS.terminal);
    } else if (e.type === 'guard') glyph(ctx, 'G', e.x, e.y, COLORS.guard);
    else if (e.type === 'boss') drawBoss(ctx, e, cam);
    else if (e.type === 'checkpoint') {
      glyph(ctx, 'C', e.x, e.y, COLORS.terminal);
      if (g.checkpoint.x === e.x && g.checkpoint.y === e.y) glyph(ctx, '*', e.x, e.y - 0.9, COLORS.terminal);
    } else if (e.type === 'flyer') {
      const wing = Math.floor((e.t || 0) * 8) % 2 ? '/o\\' : '\\o/';
      [...wing].forEach((ch, j) => glyph(ctx, ch, e.x - 1 + j, e.y, COLORS.guard));
    }
    else if (e.type === 'exit') glyph(ctx, '>', e.x, e.y, COLORS.exit);
  }
  ctx.fillStyle = COLORS.player;
  for (const b of g.bullets) {
    const sx = (b.x - cam.x) * cellW, sy = (b.y - cam.y) * cellH;
    if (b.held) {
      ctx.font = mono(18, 'bold');
      ctx.fillText(b.selected ? '[O]' : 'O', sx, sy);
      ctx.font = mono(14, 'bold');
      for (let i = 1; i <= 4; i++) {
        ctx.fillText(i === 4 ? '>' : '.', sx + Math.cos(b.angle) * i * cellW, sy + Math.sin(b.angle) * i * cellH);
      }
    } else {
      ctx.font = mono(14, 'bold');
      ctx.fillText(b.owner === 'player' ? '◦' : '•', sx, sy);
    }
  }
  const p = g.player;
  const px = (p.x + p.w / 2 - cam.x) * cellW, py = (p.y + p.h / 2 - cam.y) * cellH;
  const blink = g.invuln > 0 && Math.floor(g.time * 16) % 2 === 0;
  if (!blink) {
    ctx.font = mono(20, 'bold');
    ctx.fillStyle = COLORS.player;
    ctx.fillText('@', px, py);
  }

  const b = g.bubble;
  if (b.radius > 0.1) {
    ctx.font = mono(14, 'bold');
    ctx.fillStyle = COLORS.bubble;
    const n = Math.max(24, Math.round(b.radius * 10));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.fillText(i % 2 ? '*' : 'o', px + Math.cos(a) * b.radius * cellW, py + Math.sin(a) * b.radius * cellH);
    }
  }

  if (g.nearTerminal) {
    const t = g.nearTerminal;
    ctx.font = mono(13, 'bold');
    ctx.fillStyle = COLORS.terminal;
    ctx.fillText('[E] ACCESS', (t.x + 0.5 - cam.x) * cellW, (t.y - 0.6 - cam.y) * cellH);
  }
  ctx.restore();

  drawHud(ctx, g);
}

function drawHud(ctx, g) {
  ctx.textBaseline = 'middle';
  ctx.font = mono(16, 'bold');
  ctx.textAlign = 'left';
  let x = 12;
  for (let i = 0; i < g.maxHearts; i++) {
    ctx.fillStyle = i < g.hearts ? COLORS.heart : COLORS.dim;
    ctx.fillText(i < g.hearts ? '♥' : '♡', x, 16);
    x += 18;
  }

  ctx.textAlign = 'center';
  ctx.font = mono(13);
  ctx.fillStyle = COLORS.text;
  ctx.fillText((g.levelNum ? `${g.levelNum}/${g.levelCount}  ` : '') + g.level.name, WIDTH / 2, 16);

  const m = bubbleMeter(g.bubble);
  ctx.textAlign = 'right';
  ctx.fillStyle = m.state === 'active' ? COLORS.bubble : m.state === 'cooldown' ? COLORS.dim : COLORS.text;
  ctx.fillText(`${m.label} [${bar(m.frac)}]`, WIDTH - 12, 16);

  if (g.toast) {
    const a = Math.min(1, g.toast.t / 0.5);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    g.toast.lines.forEach((line, i) => {
      ctx.font = i === 0 ? mono(18, 'bold') : mono(14);
      ctx.fillStyle = i === 0 ? COLORS.player : COLORS.text;
      ctx.fillText(line, WIDTH / 2, 64 + i * 24);
    });
    ctx.globalAlpha = 1;
  }

  if (g.complete) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = 'center';
    ctx.font = mono(36, 'bold');
    ctx.fillStyle = COLORS.exit;
    ctx.fillText('SECTOR CLEARED', WIDTH / 2, HEIGHT / 2 - 14);
    ctx.font = mono(16);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(g.hasNext ? 'press ENTER for the next level' : 'last level so far. press ENTER to restart from level 1', WIDTH / 2, HEIGHT / 2 + 28);
  }
}

function drawTerminal(ctx, g) {
  const t = g.terminal;
  ctx.fillStyle = COLORS.bg; 
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = mono(13);
  ctx.fillStyle = COLORS.termDim;
  ctx.fillText(`// ${t.def.name}    [ESC] disconnect`, 20, 18);

  ctx.font = mono(16);
  const lineH = 20;
  const maxLines = Math.floor((HEIGHT - 70) / lineH);
  const cursor = Math.floor(g.time * 2) % 2 === 0 ? '█' : ' ';
  const lines = [...t.lines, promptOf(t) + t.input + cursor];
  const shown = lines.slice(-maxLines);
  shown.forEach((line, i) => {
    ctx.fillStyle = line.startsWith('root@') ? COLORS.term
      : line.startsWith('ACCESS DENIED') ? COLORS.termErr
      : COLORS.termDim;
    ctx.fillText(line, 20, 52 + i * lineH);
  });

  ctx.textAlign = 'center';
}
