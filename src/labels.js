import { FONT } from './config.js';

export const LABEL = { size: 16, min: 8, max: 64, lineH: 1.25, adv: 0.6 };

export const labelSize = (l) => Math.max(LABEL.min, Math.min(LABEL.max, Number(l.size) || LABEL.size));
export const labelLines = (l) => String(l.text ?? '').split('\n');

export function sanitizeLabels(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((l) => l && Number.isFinite(Number(l.x)) && Number.isFinite(Number(l.y)) && typeof l.text === 'string' && l.text.trim() !== '')
    .map((l) => ({ x: Number(l.x), y: Number(l.y), text: l.text, size: labelSize(l) }));
}

export function labelBounds(l, cw = 15, ch = 18) {
  const s = labelSize(l);
  const lines = labelLines(l);
  const w = Math.max(1, ...lines.map((t) => t.length)) * s * LABEL.adv / cw;
  const h = lines.length * s * LABEL.lineH / ch;
  return { x: l.x, y: l.y, w, h };
}

export function labelAt(labels, x, y, cw = 15, ch = 18) {
  for (let i = (labels?.length ?? 0) - 1; i >= 0; i--) {
    const b = labelBounds(labels[i], cw, ch);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return labels[i];
  }
  return null;
}

export function drawLabels(ctx, labels, camX, camY, cw, ch, { skip = null } = {}) {
  if (!labels?.length) return;
  const { textAlign, textBaseline, font, fillStyle } = ctx;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  for (const l of labels) {
    if (l === skip) continue;
    const s = labelSize(l);
    ctx.font = `${s}px ${FONT}`;
    labelLines(l).forEach((line, i) => ctx.fillText(line, (l.x - camX) * cw, (l.y - camY) * ch + i * s * LABEL.lineH));
  }
  Object.assign(ctx, { textAlign, textBaseline, font, fillStyle });
}
