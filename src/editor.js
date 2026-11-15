import { LEVELS } from './levels/index.js';
import {
  SINGLE, newDoc, docFromDef, mapText, toDef, setCell, lineCells, paintRect, floodFill,
  resizeDoc, snapshot, restore, problems, wireDoors, exportText,
  rectOf, copyRegion, clearRegion, pasteRegion,
} from './editor-core.js';
import { createTextPanel } from './editor-text.js';
import { createEventsPanel, drawEventOverlays } from './editor-events.js';
import { drawLabels, labelAt, labelBounds, labelSize, LABEL } from './labels.js';

const CW = 15, CH = 18;
const FONT = '"JetBrains Mono", "Fira Code", Menlo, Consolas, "DejaVu Sans Mono", monospace';
const DRAFT_KEY = 'root-editor-draft-v1';
const TEST_KEY = 'root-editor-level';
const ZOOMS = [0.5, 0.75, 1, 1.5, 2];

const PALETTE = [
  { key: 'w', ch: '#', name: 'wall' },
  { key: 'q', ch: '=', name: 'one-way platform' },
  { key: 'r', ch: '^', name: 'spikes' },
  { key: 'e', ch: 'G', name: 'guard' },
  { key: 'g', ch: 'F', name: 'flying guard' },
  { key: 'v', ch: 'B', name: 'boss' },
  { key: 'c', ch: 'C', name: 'checkpoint' },
  { key: 't', ch: 'a', name: 'terminal (cycles a-f)', cycle: 'abcdef' },
  { key: 'd', ch: '1', name: 'door (cycles 1-9)', cycle: '123456789' },
  { key: 's', ch: '@', name: 'player start' },
  { key: 'x', ch: '>', name: 'level exit' },
  { key: 'a', ch: '.', name: 'erase' },
];

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!d || typeof d.map !== 'string' || !d.side) return null;
    return docFromDef({ ...d.side, map: d.map }, Number(d.levelNum) || 1);
  } catch {
    return null;
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ levelNum: doc.levelNum, side: doc.side, map: mapText(doc) }));
  } catch {}
}

let textPanel = null;
let eventsPanel = null;
let selEvent = null;
let pickState = null;
let selLabel = null;
let lastSize = LABEL.size;
let lblDrag = null;
let doc = loadDraft() ?? newDoc(96, 30, LEVELS.length + 1);
let cur = '#';
let tool = 'brush';
let zoomI = 2;
let hover = null;
let drag = null;
let selRect = null;
let selDrag = null;
let clip = null;
let floating = null;
let pending = null;
let sideError = null;
let flashMsg = '';
let flashTimer = 0;
const undoStack = [];
const redoStack = [];

function draw() {
  const z = ZOOMS[zoomI];
  const w = Math.round(doc.W * CW * z), h = Math.round(doc.H * CH * z);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(z, 0, 0, z, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, doc.W * CW, doc.H * CH);

  ctx.lineWidth = 1 / z;
  for (let x = 0; x <= doc.W; x++) {
    ctx.strokeStyle = x % 10 === 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.moveTo(x * CW, 0); ctx.lineTo(x * CW, doc.H * CH); ctx.stroke();
  }
  for (let y = 0; y <= doc.H; y++) {
    ctx.strokeStyle = y % 10 === 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.moveTo(0, y * CH); ctx.lineTo(doc.W * CW, y * CH); ctx.stroke();
  }

  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  for (let y = 0; y < doc.H; y++) {
    for (let x = 0; x < doc.W; x++) {
      const ch = doc.grid[y][x];
      if (ch === '.') continue;
      let t = ch;
      if (ch === '#') t = doc.grid[y - 1]?.[x] === '#' ? ':' : '#';
      if (ch !== '#' && ch !== '=' && ch !== '^') ctx.strokeRect(x * CW + 1.5, y * CH + 1.5, CW - 3, CH - 3);
      ctx.fillText(t, (x + 0.5) * CW, (y + 0.5) * CH);
    }
  }

  const sl = sel();
  drawLabels(ctx, doc.side.labels, 0, 0, CW, CH, { skip: $('labeled').hidden ? null : sl });
  if (sl) {
    const b = labelBounds(sl, CW, CH);
    ctx.save();
    ctx.setLineDash([4 / z, 3 / z]);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1 / z;
    ctx.strokeRect(b.x * CW - 2, b.y * CH - 1, b.w * CW + 4, b.h * CH + 2);
    ctx.restore();
  }

  drawEventOverlays(ctx, doc.side.events, CW, CH, z, selEvent, doc.W, doc.H);
  if (pickState?.start) {
    const a = pickState.start, b = pickState.last;
    ctx.save(); ctx.setLineDash([4 / z, 3 / z]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / z;
    ctx.strokeRect(Math.min(a.x, b.x) * CW, Math.min(a.y, b.y) * CH, (Math.abs(a.x - b.x) + 1) * CW, (Math.abs(a.y - b.y) + 1) * CH);
    ctx.restore();
  }

  if (drag?.rect) {
    const x0 = Math.min(drag.start.x, drag.last.x), x1 = Math.max(drag.start.x, drag.last.x);
    const y0 = Math.min(drag.start.y, drag.last.y), y1 = Math.max(drag.start.y, drag.last.y);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    if (SINGLE.has(drag.ch)) ctx.fillText(drag.ch, (drag.last.x + 0.5) * CW, (drag.last.y + 0.5) * CH);
    else if (drag.ch !== '.')
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ctx.fillText(drag.ch, (x + 0.5) * CW, (y + 0.5) * CH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / z;
    ctx.strokeRect(x0 * CW, y0 * CH, (x1 - x0 + 1) * CW, (y1 - y0 + 1) * CH);
  }

  if (selRect && !floating?.drag) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(selRect.x0 * CW, selRect.y0 * CH, (selRect.x1 - selRect.x0 + 1) * CW, (selRect.y1 - selRect.y0 + 1) * CH);
    ctx.setLineDash([6 / z, 4 / z]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / z;
    ctx.strokeRect(selRect.x0 * CW, selRect.y0 * CH, (selRect.x1 - selRect.x0 + 1) * CW, (selRect.y1 - selRect.y0 + 1) * CH);
    ctx.restore();
  }
  if (floating) {
    const f = floating;
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.font = `bold 16px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let cy = 0; cy < f.clip.h; cy++) for (let cx = 0; cx < f.clip.w; cx++) {
      const ch = f.clip.cells[cy][cx];
      if (ch === '.') continue;
      if (ch !== '#' && ch !== '=' && ch !== '^') ctx.strokeRect((f.x + cx) * CW + 1.5, (f.y + cy) * CH + 1.5, CW - 3, CH - 3);
      ctx.fillText(ch, (f.x + cx + 0.5) * CW, (f.y + cy + 0.5) * CH);
    }
    drawLabels(ctx, f.clip.labels.map((l) => ({ x: f.x + l.dx, y: f.y + l.dy, text: l.text, size: l.size })), 0, 0, CW, CH, {});
    ctx.setLineDash([6 / z, 4 / z]); ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / z;
    ctx.strokeRect(f.x * CW, f.y * CH, f.clip.w * CW, f.clip.h * CH);
    ctx.restore();
  }
  if (selDrag) {
    const r = rectOf(doc, selDrag.start, selDrag.last);
    ctx.save(); ctx.setLineDash([6 / z, 4 / z]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / z;
    ctx.strokeRect(r.x0 * CW, r.y0 * CH, (r.x1 - r.x0 + 1) * CW, (r.y1 - r.y0 + 1) * CH);
    ctx.restore();
  }

  if (hover) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / z;
    ctx.strokeRect(hover.x * CW + 1, hover.y * CH + 1, CW - 2, CH - 2);
  }
}

const nameOf = (ch) => {
  const p = PALETTE.find((q) => (q.cycle ? q.cycle.includes(ch) : q.ch === ch));
  return p ? p.name.replace(/ \(.*\)/, '') : ch;
};

function buildPalette() {
  const box = $('palette');
  box.textContent = '';
  for (const p of PALETTE) {
    const on = p.cycle ? p.cycle.includes(cur) : cur === p.ch;
    const shown = p.cycle && p.cycle.includes(cur) ? cur : p.ch;
    const b = document.createElement('button');
    b.className = 'pal' + (on ? ' on' : '');
    const k = document.createElement('span'); k.className = 'k'; k.textContent = p.key.toUpperCase();
    const g = document.createElement('span'); g.className = 'g'; g.textContent = shown;
    const n = document.createElement('span'); n.textContent = p.name;
    b.append(k, g, n);
    b.onclick = () => select(shown);
    box.append(b);
  }
}

function select(ch) {
  cur = ch;
  buildPalette();
  updateStatus();
}

function setTool(t) {
  tool = t;
  $('tool-brush').classList.toggle('on', t === 'brush');
  $('tool-fill').classList.toggle('on', t === 'fill');
  $('tool-text').classList.toggle('on', t === 'text');
  $('tool-select').classList.toggle('on', t === 'select');
  canvas.style.cursor = t === 'text' ? 'text' : t === 'select' ? 'cell' : 'crosshair';
  if (t !== 'text') { closeEditor(); selLabel = null; draw(); }
  syncLabelBox();
  updateStatus();
}

function flash(msg) {
  flashMsg = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashMsg = ''; updateStatus(); }, 3500);
  updateStatus();
}

function updateStatus() {
  const cell = hover ? `cell ${hover.x},${hover.y} '${doc.grid[hover.y][hover.x]}'` : 'cell -';
  const parts = [cell, `brush '${cur}' ${nameOf(cur)}`, `tool ${tool}`, `${doc.W}x${doc.H}`];
  if (selRect) parts.push(`selection ${selRect.x1 - selRect.x0 + 1}x${selRect.y1 - selRect.y0 + 1}`);
  if (floating && !floating.drag) parts.push('PASTING: click to stamp, right-click or Esc to stop');
  if (pickState) parts.push('PICK: ' + pickState.hint + ' (Esc cancels)');
  if (flashMsg) parts.push(flashMsg);
  $('status').textContent = parts.join('   |   ');
}

function refreshSide() {
  if (textPanel) textPanel.refresh();
  if (eventsPanel) eventsPanel.refresh();
  if (sideError || document.activeElement === $('side')) return;
  $('side').value = JSON.stringify(doc.side, null, 2);
}

function refreshProblems() {
  const box = $('problems');
  box.textContent = '';
  const list = sideError ? [`sidecar JSON: ${sideError}`] : problems(doc);
  if (!list.length) list.push(null);
  for (const p of list) {
    const d = document.createElement('div');
    d.textContent = p === null ? '✓ level is valid' : `✗ ${p}`;
    box.append(d);
  }
}

function changed() {
  $('w').value = doc.W;
  $('h').value = doc.H;
  $('levelNum').value = doc.levelNum;
  draw();
  refreshSide();
  refreshProblems();
  saveDraft();
  updateStatus();
}

function pushUndo(withLabels = false) {
  undoStack.push(snapshot(doc, withLabels));
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  const top = undoStack.pop();
  redoStack.push(snapshot(doc, top.labels !== undefined));
  restore(doc, top);
  resetSel();
  changed();
}

function redo() {
  if (!redoStack.length) return;
  const top = redoStack.pop();
  undoStack.push(snapshot(doc, top.labels !== undefined));
  restore(doc, top);
  resetSel();
  changed();
}

const resetSel = () => { selRect = null; selDrag = null; floating = null; pending = null; };
const inSel = (c) => selRect && c.x >= selRect.x0 && c.x <= selRect.x1 && c.y >= selRect.y0 && c.y <= selRect.y1;
const clampTo = (f) => {
  f.x = Math.max(0, Math.min(doc.W - f.clip.w, f.x));
  f.y = Math.max(0, Math.min(doc.H - f.clip.h, f.y));
};

function copySel(cut) {
  if (!selRect) { flash('Nothing selected. Press M, then drag over an area.'); return; }
  clip = copyRegion(doc, selRect, { singles: cut });
  if (cut) { pushUndo(true); clearRegion(doc, selRect); changed(); }
  flash(`${cut ? 'Cut' : 'Copied'} ${clip.w}x${clip.h}. Ctrl+V to paste.`);
}

function startPaste() {
  if (!clip) { flash('Clipboard is empty. Select an area and press Ctrl+C.'); return; }
  closeEditor();
  floating = { clip, ox: 0, oy: 0, x: hover?.x ?? 0, y: hover?.y ?? 0, drag: false };
  clampTo(floating);
  draw(); updateStatus();
}

function stampFloating() {
  pushUndo(true);
  selRect = pasteRegion(doc, floating.clip, floating.x, floating.y);
  changed();
}

function duplicateSel() {
  if (!selRect) { flash('Nothing selected. Press M, then drag over an area.'); return; }
  const c = copyRegion(doc, selRect);
  const w = c.w, h = c.h;
  let x = selRect.x0 + w, y = selRect.y0;
  if (x + w > doc.W) { x = selRect.x0; y = selRect.y0 + h; }
  if (y + h > doc.H) { x = selRect.x0 + 1; y = selRect.y0 + 1; }
  pushUndo(true);
  selRect = pasteRegion(doc, c, x, y);
  changed();
}

function deleteSel() {
  if (!selRect) return;
  pushUndo(true);
  clearRegion(doc, selRect);
  changed();
}

function lift() {
  pushUndo(true);
  const copy = pending.alt;
  floating = {
    clip: copyRegion(doc, selRect, { singles: !copy }),
    ox: pending.start.x - selRect.x0, oy: pending.start.y - selRect.y0, x: selRect.x0, y: selRect.y0, drag: true,
  };
  if (!copy) clearRegion(doc, selRect);
  changed();
}

function dropFloating() {
  if (floating?.drag) { selRect = pasteRegion(doc, floating.clip, floating.x, floating.y); floating = null; }
  pending = null;
  changed();
}

function cellAt(e) {
  const r = canvas.getBoundingClientRect();
  const k = canvas.width / r.width / ZOOMS[zoomI];
  const x = Math.floor(((e.clientX - r.left) * k) / CW);
  const y = Math.floor(((e.clientY - r.top) * k) / CH);
  return {
    x: Math.max(0, Math.min(doc.W - 1, x)),
    y: Math.max(0, Math.min(doc.H - 1, y)),
    inside: x >= 0 && y >= 0 && x < doc.W && y < doc.H,
  };
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.button !== 2) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  if (pickState) {
    if (e.button !== 0) { endPick(); return; }
    const c = cellAt(e);
    if (pickState.kind === 'point') { const cb = pickState.cb; endPick(); cb(c); return; }
    pickState.start = c; pickState.last = c; draw();
    return;
  }
  if (floating && !floating.drag) {
    if (e.button !== 0) { floating = null; draw(); updateStatus(); } else stampFloating();
    return;
  }
  if (tool === 'text') { textDown(e); return; }
  if (tool === 'select') {
    const sc = cellAt(e);
    if (e.button !== 0) { selRect = null; draw(); updateStatus(); return; }
    if (inSel(sc)) { pending = { start: sc, alt: e.altKey }; return; }
    selRect = null; selDrag = { start: sc, last: sc };
    draw();
    return;
  }
  const c = cellAt(e);
  const ch = e.button === 2 ? '.' : cur;
  pushUndo();
  if (tool === 'fill' && !e.shiftKey) {
    floodFill(doc, c.x, c.y, ch);
    changed();
    return;
  }
  drag = { rect: e.shiftKey, ch, start: c, last: c };
  if (!drag.rect) setCell(doc, c.x, c.y, ch);
  draw();
});

canvas.addEventListener('pointermove', (e) => {
  if (pickState?.start) { pickState.last = cellAt(e); draw(); return; }
  if (lblDrag) {
    const f = pointFloat(e);
    lblDrag.l.x = Math.max(0, snap(f.x - lblDrag.dx));
    lblDrag.l.y = Math.max(0, snap(f.y - lblDrag.dy));
    lblDrag.moved = true;
    placeEditor(); draw();
    return;
  }
  const c = cellAt(e);
  hover = c.inside ? c : null;
  if (pending) {
    if (!floating && (c.x !== pending.start.x || c.y !== pending.start.y)) lift();
    if (floating) { floating.x = c.x - floating.ox; floating.y = c.y - floating.oy; clampTo(floating); }
    draw(); updateStatus();
    return;
  }
  if (selDrag) { selDrag.last = c; draw(); updateStatus(); return; }
  if (floating) { floating.x = c.x - floating.ox; floating.y = c.y - floating.oy; clampTo(floating); }
  if (drag) {
    if (drag.rect) drag.last = c;
    else {
      for (const p of lineCells(drag.last, c)) setCell(doc, p.x, p.y, drag.ch);
      drag.last = c;
    }
  }
  draw();
  updateStatus();
});

canvas.addEventListener('pointerup', (e) => {
  if (pickState?.start) {
    const a = pickState.start, b = cellAt(e), cb = pickState.cb;
    endPick();
    cb({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 });
    return;
  }
  if (pending) { dropFloating(); return; }
  if (selDrag) {
    selRect = rectOf(doc, selDrag.start, cellAt(e));
    selDrag = null;
    draw(); updateStatus();
    return;
  }
  if (lblDrag) {
    const { l, moved } = lblDrag;
    lblDrag = null;
    if (moved) labelsChanged(); else openEditor(l);
    return;
  }
  if (!drag) return;
  if (drag.rect) paintRect(doc, drag.start, cellAt(e), drag.ch);
  drag = null;
  changed();
});

canvas.addEventListener('pointercancel', () => {
  pickState = pickState && { ...pickState, start: null }; drag = null; lblDrag = null; selDrag = null;
  if (pending) dropFloating();
  draw();
});
canvas.addEventListener('pointerleave', () => { hover = null; draw(); updateStatus(); });

function pickOnMap(kind, cb, hint) {
  closeEditor();
  pickState = { kind, cb, hint, start: null, last: null };
  canvas.style.cursor = 'copy';
  updateStatus();
}

function endPick() {
  pickState = null;
  canvas.style.cursor = tool === 'text' ? 'text' : tool === 'select' ? 'cell' : 'crosshair';
  draw();
  updateStatus();
}

const snap = (v) => Math.round(v * 2) / 2;
const sel = () => (doc.side.labels?.includes(selLabel) ? selLabel : null);

function pointFloat(e) {
  const r = canvas.getBoundingClientRect();
  const k = canvas.width / r.width / ZOOMS[zoomI];
  return { x: ((e.clientX - r.left) * k) / CW, y: ((e.clientY - r.top) * k) / CH };
}

function labelsChanged() {
  refreshJson();
  saveDraft();
  syncLabelBox();
}

function syncLabelBox() {
  const l = sel();
  $('labelbox').hidden = !(tool === 'text' || l);
  $('lbl-size').value = l ? labelSize(l) : lastSize;
}

function textDown(e) {
  if (e.button !== 0) { lblDrag = null; return; }
  closeEditor();
  const f = pointFloat(e);
  doc.side.labels ||= [];
  const hit = labelAt(doc.side.labels, f.x, f.y, CW, CH);
  if (hit) {
    selLabel = hit;
    lblDrag = { l: hit, dx: f.x - hit.x, dy: f.y - hit.y, moved: false };
    syncLabelBox(); draw();
    return;
  }
  const l = { x: Math.floor(f.x), y: Math.floor(f.y), text: '', size: lastSize };
  doc.side.labels.push(l);
  openEditor(l);
}

function placeEditor() {
  const t = $('labeled');
  const l = sel();
  if (t.hidden || !l) return;
  const z = ZOOMS[zoomI], s = labelSize(l) * z;
  const lines = t.value.split('\n');
  Object.assign(t.style, {
    fontFamily: FONT, fontSize: s + 'px',
    left: l.x * CW * z - 3 + 'px', top: l.y * CH * z - 1 + 'px',
    width: Math.max(6, ...lines.map((x) => x.length + 1)) * s * LABEL.adv + 8 + 'px',
    height: lines.length * s * LABEL.lineH + 2 + 'px',
  });
}

function openEditor(l) {
  selLabel = l;
  const t = $('labeled');
  t.hidden = false;
  t.value = l.text;
  placeEditor();
  draw();
  t.focus();
  syncLabelBox();
}

function closeEditor() {
  const t = $('labeled');
  if (t.hidden) return;
  t.hidden = true;
  const l = sel();
  if (l && !l.text.trim()) removeLabel(l);
  labelsChanged();
  draw();
}

function removeLabel(l) {
  const i = doc.side.labels?.indexOf(l) ?? -1;
  if (i >= 0) doc.side.labels.splice(i, 1);
  if (!doc.side.labels.length) delete doc.side.labels;
  if (selLabel === l) selLabel = null;
  $('labeled').hidden = true;
  labelsChanged();
  draw();
}

function setLabelSize(n) {
  n = Math.max(LABEL.min, Math.min(LABEL.max, Math.round(n) || LABEL.size));
  lastSize = n;
  const l = sel();
  if (l) { l.size = n; placeEditor(); draw(); labelsChanged(); }
  $('lbl-size').value = n;
}

$('labeled').addEventListener('input', () => {
  const l = sel();
  if (!l) return;
  l.text = $('labeled').value;
  placeEditor(); draw(); saveDraft(); refreshJson();
});
$('labeled').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeEditor(); } });
$('labeled').addEventListener('blur', () => closeEditor());
$('lbl-minus').onclick = () => setLabelSize((sel() ? labelSize(sel()) : lastSize) - 2);
$('lbl-plus').onclick = () => setLabelSize((sel() ? labelSize(sel()) : lastSize) + 2);
$('lbl-size').onchange = () => setLabelSize(Number($('lbl-size').value));
$('lbl-del').onclick = () => { const l = sel(); if (l) removeLabel(l); };
$('tool-text').onclick = () => setTool('text');

function setZoom(i) {
  zoomI = Math.max(0, Math.min(ZOOMS.length - 1, i));
  $('zoomLabel').textContent = Math.round(ZOOMS[zoomI] * 100) + '%';
  placeEditor();
  draw();
}

function play() {
  if (sideError) { flash('Fix the sidecar JSON first.'); return; }
  try {
    localStorage.setItem(TEST_KEY, JSON.stringify(toDef(doc)));
  } catch {
    flash('Could not store the level for playtest.');
    return;
  }
  window.open('index.html?custom', '_blank');
}

async function copyText() {
  const text = exportText(doc);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  flash(`Copied levelN.js text for level ${doc.levelNum}.`);
}

function download() {
  const url = URL.createObjectURL(new Blob([exportText(doc)], { type: 'text/javascript' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `level${doc.levelNum}.js`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  flash(`Downloaded level${doc.levelNum}.js. Put it in src/levels/.`);
}

function buildOpen() {
  const s = $('open');
  s.textContent = '';
  const add = (v, label) => { const o = document.createElement('option'); o.value = v; o.textContent = label; s.append(o); };
  add('', 'Open a level...');
  add('new', 'New blank level');
  LEVELS.forEach((l, i) => add(String(i), `Level ${i + 1}: ${l.name}`));
}

$('open').onchange = () => {
  const v = $('open').value;
  $('open').value = '';
  if (!v) return;
  pushUndo();
  closeEditor(); selLabel = null; resetSel();
  doc = v === 'new' ? newDoc(96, 30, LEVELS.length + 1) : docFromDef(LEVELS[Number(v)], Number(v) + 1);
  sideError = null;
  $('side').classList.remove('bad');
  changed();
};

$('side').addEventListener('input', () => {
  try {
    const v = JSON.parse($('side').value);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('must be a JSON object');
    doc.side = v;
    sideError = null;
    $('side').classList.remove('bad');
  } catch (err) {
    sideError = err.message;
    $('side').classList.add('bad');
  }
  refreshProblems();
  saveDraft();
});

$('levelNum').onchange = () => {
  doc.levelNum = Math.max(1, Math.min(99, parseInt($('levelNum').value, 10) || 1));
  changed();
};

$('resize').onclick = () => {
  pushUndo(true);
  resetSel();
  resizeDoc(doc, Number($('w').value), Number($('h').value));
  changed();
};

$('wire').onclick = () => {
  if (sideError) { flash('Fix the sidecar JSON first.'); return; }
  const r = wireDoors(doc);
  if (r.error) flash(r.error);
  else if (!r.added.length) flash('Every door already has an unlock code.');
  else flash(`Added codes for door ${r.added.join(', ')} on terminal ${r.terminal}. Check the sidecar.`);
  changed();
};

$('tool-brush').onclick = () => setTool('brush');
$('tool-fill').onclick = () => setTool('fill');
$('tool-select').onclick = () => setTool('select');
$('zoomIn').onclick = () => setZoom(zoomI + 1);
$('zoomOut').onclick = () => setZoom(zoomI - 1);
$('play').onclick = play;
$('copy').onclick = copyText;
$('download').onclick = download;

$('stage').addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(zoomI + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (pickState && k === 'escape') { endPick(); return; }
  if (k === 'escape' && (floating || selRect)) {
    if (floating && !floating.drag) floating = null; else if (!floating) selRect = null;
    draw(); updateStatus();
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    if (k === 'c') { e.preventDefault(); copySel(false); }
    else if (k === 'x') { e.preventDefault(); copySel(true); }
    else if (k === 'v') { e.preventDefault(); startPaste(); }
    else if (k === 'd') { e.preventDefault(); duplicateSel(); }
    else if (k === 'a') { e.preventDefault(); setTool('select'); selRect = rectOf(doc, { x: 0, y: 0 }, { x: doc.W - 1, y: doc.H - 1 }); draw(); updateStatus(); }
    else if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 's') { e.preventDefault(); download(); }
    return;
  }
  if (e.altKey) return;

  const p = PALETTE.find((q) => q.key === k);
  if (p) {
    if (p.cycle) {
      const i = p.cycle.indexOf(cur);
      const n = p.cycle.length;
      select(i < 0 ? p.cycle[0] : p.cycle[(i + (e.shiftKey ? -1 : 1) + n) % n]);
    } else {
      select(p.ch);
    }
  } else if (k.length === 1 && k >= '1' && k <= '9') select(k);
  else if (k === 'f') setTool(tool === 'fill' ? 'brush' : 'fill');
  else if (k === 'b') setTool('brush');
  else if (k === 'y') setTool('text');
  else if (k === 'm') setTool('select');
  else if ((k === 'delete' || k === 'backspace') && sel()) { e.preventDefault(); removeLabel(sel()); }
  else if ((k === 'delete' || k === 'backspace') && selRect) { e.preventDefault(); deleteSel(); }
  else if (k === 'p') play();
  else if (k === '-') setZoom(zoomI - 1);
  else if (k === '=' || k === '+') setZoom(zoomI + 1);
});

textPanel = createTextPanel($('text'), () => doc, () => { refreshJson(); refreshProblems(); saveDraft(); });
function refreshJson() { if (document.activeElement !== $('side')) $('side').value = JSON.stringify(doc.side, null, 2); }
eventsPanel = createEventsPanel($('events'), () => doc, {
  onChange: () => { refreshJson(); refreshProblems(); saveDraft(); draw(); },
  pick: pickOnMap,
  here: () => (hover ? { x: hover.x, y: hover.y } : { x: 10, y: Math.max(1, doc.H - 6) }),
  setSel: (id) => { selEvent = id; draw(); },
});
function showTab(which) {
  $('text').hidden = which !== 'text'; $('events').hidden = which !== 'events'; $('side').hidden = which !== 'json';
  for (const k of ['text', 'events', 'json']) $('tab-' + k).classList.toggle('on', k === which);
  if (sideError && which !== 'json') { flash('Fix the sidecar JSON first.'); return showTab('json'); }
  if (which === 'text') textPanel.render(); else if (which === 'events') eventsPanel.render(); else refreshJson();
}
$('tab-events').onclick = () => showTab('events');
$('tab-text').onclick = () => showTab('text');
$('tab-json').onclick = () => showTab('json');
buildPalette();
buildOpen();
setTool('brush');
setZoom(zoomI);
changed();
