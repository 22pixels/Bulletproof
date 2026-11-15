import { BOSS_DESIGNS } from './bosses/index.js';
import {
  blankDesign, blankFrame, padRows, validateDesign, designToFile, normalizeDesign, animByName, attackByName, animLength,
  frameIndexAt, frameAt, fireStep, insertFrameAt, moveFrameTo, MOVE_NAMES, KINDS, MAX_W, MAX_H, phaseFor,
} from './boss-data.js';

const $ = (id) => document.getElementById(id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const DRAFT = 'root-boss-draft';
const MARGIN = 3;
const GLYPHS = [...'#@%=-|/\\_.:*oO0^v<>[](){}+xX$&~!?"\''];
const MIRROR = { '/': '\\', '\\': '/', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
}
const status = (msg) => { $('status').textContent = msg; };

let d = loadDraft() || clone(BOSS_DESIGNS.root);
let animIdx = 0, frameIdx = 0, atkIdx = 0;
let tool = 'draw', brush = '#', tab = 'attacks', pickStep = null;
let CW = 16, CH = 24;
const player = { x: 52, y: 12 };
let play = null;
let last = 0;

function loadDraft() {
  try { const s = localStorage.getItem(DRAFT); return s ? normalizeDesign(JSON.parse(s)) : null; } catch { return null; }
}
function save() { try { localStorage.setItem(DRAFT, JSON.stringify(d)); } catch {} }

const undo = [], redo = [];
let lastKey = '', lastAt = 0;
function snap(key = '') {
  const now = performance.now();
  if (key && key === lastKey && now - lastAt < 700) { lastAt = now; return; }
  undo.push(JSON.stringify(d)); if (undo.length > 150) undo.shift();
  redo.length = 0; lastKey = key; lastAt = now;
}
function restore(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(d));
  d = normalizeDesign(JSON.parse(from.pop()));
  clampSel(); rebuild();
}

const curAnim = () => d.animations[animIdx];
const curFrame = () => curAnim().frames[frameIdx];
const curAtk = () => d.attacks[atkIdx] || null;
function clampSel() {
  animIdx = Math.min(animIdx, d.animations.length - 1);
  frameIdx = Math.min(frameIdx, curAnim().frames.length - 1);
  atkIdx = d.attacks.length ? Math.min(Math.max(0, atkIdx), d.attacks.length - 1) : -1;
}

const fc = $('frame'), fx = fc.getContext('2d');
const cell = (e) => {
  const r = fc.getBoundingClientRect();
  return { gx: Math.floor((e.clientX - r.left) / CW) - MARGIN, gy: Math.floor((e.clientY - r.top) / CH) - MARGIN };
};
const inBox = (gx, gy) => gx >= 0 && gy >= 0 && gx < d.w && gy < d.h;

function sizeCanvases() {
  CW = Math.max(8, Math.min(20, Math.floor(760 / (d.w + MARGIN * 2))));
  CH = Math.round(CW * 1.5);
  fc.width = (d.w + MARGIN * 2) * CW; fc.height = (d.h + MARGIN * 2) * CH;
}

function setGlyph(rows, gx, gy, ch) {
  const r = rows[gy];
  if (r[gx] === ch) return false;
  rows[gy] = r.slice(0, gx) + ch + r.slice(gx + 1);
  return true;
}

function drawFrame() {
  const W = fc.width, H = fc.height;
  fx.fillStyle = '#000'; fx.fillRect(0, 0, W, H);
  const ox = MARGIN * CW, oy = MARGIN * CH;
  fx.fillStyle = '#0d0d0d'; fx.fillRect(ox, oy, d.w * CW, d.h * CH);
  fx.strokeStyle = 'rgba(255,255,255,.1)'; fx.lineWidth = 1;
  fx.beginPath();
  for (let i = 0; i <= d.w; i++) { fx.moveTo(ox + i * CW + 0.5, oy); fx.lineTo(ox + i * CW + 0.5, oy + d.h * CH); }
  for (let j = 0; j <= d.h; j++) { fx.moveTo(ox, oy + j * CH + 0.5); fx.lineTo(ox + d.w * CW, oy + j * CH + 0.5); }
  fx.stroke();
  const cx = Math.floor(d.w / 2), cy = Math.floor(d.h / 2);
  fx.strokeStyle = 'rgba(255,255,255,.55)'; fx.setLineDash([3, 3]);
  fx.strokeRect(ox + cx * CW + 0.5, oy + cy * CH + 0.5, CW - 1, CH - 1); fx.setLineDash([]);

  fx.font = `bold ${Math.round(CH * 0.7)}px monospace`; fx.textAlign = 'center'; fx.textBaseline = 'middle';
  const text = (rows, alpha) => {
    fx.globalAlpha = alpha; fx.fillStyle = '#fff';
    rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ' ') fx.fillText(ch, ox + (i + 0.5) * CW, oy + (j + 0.55) * CH); }));
    fx.globalAlpha = 1;
  };
  if ($('onion').checked && frameIdx > 0) text(curAnim().frames[frameIdx - 1].rows, 0.25);
  text(curFrame().rows, 1);

  const atk = curAtk();
  if (atk && atk.anim === curAnim().name) {
    atk.steps.forEach((s, i) => {
      if (s.frame !== frameIdx) return;
      const px = ox + (cx + (s.ox ?? 0) + 0.5) * CW, py = oy + (cy + (s.oy ?? 0) + 0.5) * CH;
      fx.strokeStyle = '#fff'; fx.lineWidth = 2;
      fx.beginPath(); fx.arc(px, py, CW * 0.55, 0, Math.PI * 2); fx.moveTo(px - CW, py); fx.lineTo(px + CW, py); fx.moveTo(px, py - CH * 0.7); fx.lineTo(px, py + CH * 0.7); fx.stroke();
      fx.fillStyle = '#fff'; fx.font = `bold ${Math.round(CH * 0.45)}px monospace`; fx.textAlign = 'left';
      fx.fillText(`S${i + 1}`, px + CW * 0.7, py - CH * 0.5); fx.textAlign = 'center';
      fx.font = `bold ${Math.round(CH * 0.7)}px monospace`;
    });
  }
  if (pickStep) { fx.strokeStyle = '#fff'; fx.lineWidth = 3; fx.strokeRect(1, 1, W - 2, H - 2); }
}

let stroke = null;
fc.addEventListener('contextmenu', (e) => e.preventDefault());
fc.addEventListener('pointerdown', (e) => {
  fc.setPointerCapture(e.pointerId);
  const { gx, gy } = cell(e);
  if (pickStep) {
    const s = pickStep; pickStep = null;
    snap();
    s.ox = gx - Math.floor(d.w / 2); s.oy = gy - Math.floor(d.h / 2);
    setTool('draw'); rebuild(); status(`Shot origin set to ${s.ox},${s.oy} from the centre.`); return;
  }
  if (!inBox(gx, gy)) return;
  const erase = e.button === 2;
  if (tool === 'fill' && !erase) { snap(); floodFill(gx, gy, brush); changed(); return; }
  snap();
  stroke = { erase };
  paint(gx, gy);
});
fc.addEventListener('pointermove', (e) => {
  const { gx, gy } = cell(e);
  $('whereHint').textContent = inBox(gx, gy) ? `  cell ${gx},${gy}  (from centre ${gx - Math.floor(d.w / 2)},${gy - Math.floor(d.h / 2)})` : '';
  if (stroke && inBox(gx, gy)) paint(gx, gy);
});
fc.addEventListener('pointerup', () => { stroke = null; });
fc.addEventListener('pointercancel', () => { stroke = null; });

function paint(gx, gy) {
  if (setGlyph(curFrame().rows, gx, gy, stroke.erase ? ' ' : brush)) changed();
}
function floodFill(gx, gy, ch) {
  const rows = curFrame().rows, from = rows[gy][gx];
  if (from === ch) return;
  const q = [[gx, gy]];
  while (q.length) {
    const [x, y] = q.pop();
    if (!inBox(x, y) || rows[y][x] !== from) continue;
    setGlyph(rows, x, y, ch);
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

function frameOp(fn, key) { snap(key); fn(curFrame()); changed(); }
$('clear').onclick = () => frameOp((f) => { f.rows = padRows([], d.w, d.h); });
$('flip').onclick = () => frameOp((f) => { f.rows = f.rows.map((r) => [...r].reverse().map((c) => MIRROR[c] ?? c).join('')); });
$('copyPrev').onclick = () => { if (frameIdx > 0) frameOp((f) => { f.rows = [...curAnim().frames[frameIdx - 1].rows]; }); };
$('shL').onclick = () => frameOp((f) => { f.rows = f.rows.map((r) => r.slice(1) + ' '); }, 'sh');
$('shR').onclick = () => frameOp((f) => { f.rows = f.rows.map((r) => ' ' + r.slice(0, -1)); }, 'sh');
$('shU').onclick = () => frameOp((f) => { f.rows = [...f.rows.slice(1), ' '.repeat(d.w)]; }, 'sh');
$('shD').onclick = () => frameOp((f) => { f.rows = [' '.repeat(d.w), ...f.rows.slice(0, -1)]; }, 'sh');
$('onion').onchange = drawFrame;
$('loop').onchange = () => { snap(); curAnim().loop = $('loop').checked; changed(); };

function addFrame(copy) {
  snap();
  const a = curAnim();
  const f = copy ? clone(curFrame()) : blankFrame(d.w, d.h, curFrame().ms);
  a.frames.splice(frameIdx + 1, 0, f); frameIdx++;
  fixStepsAfterInsert(a.name, frameIdx);
  rebuild();
}
function fixStepsAfterInsert(animName, at) {
  for (const k of d.attacks) if (k.anim === animName) for (const s of k.steps) if (s.frame >= at) s.frame++;
}
function removeFrame() {
  const a = curAnim();
  if (a.frames.length < 2) { status('An animation needs at least one frame.'); return; }
  snap();
  a.frames.splice(frameIdx, 1);
  for (const k of d.attacks) if (k.anim === a.name) for (const s of k.steps) { if (s.frame > frameIdx) s.frame--; else if (s.frame === frameIdx) s.frame = Math.min(frameIdx, a.frames.length - 1); }
  frameIdx = Math.min(frameIdx, a.frames.length - 1);
  rebuild();
}
function moveFrame(dir) {
  const a = curAnim(), j = frameIdx + dir;
  if (j < 0 || j >= a.frames.length) return;
  snap();
  [a.frames[frameIdx], a.frames[j]] = [a.frames[j], a.frames[frameIdx]];
  for (const k of d.attacks) if (k.anim === a.name) for (const s of k.steps) { if (s.frame === frameIdx) s.frame = j; else if (s.frame === j) s.frame = frameIdx; }
  frameIdx = j; rebuild();
}

const CLIP_KEY = 'root-boss-frame-clip';
let fclip = null;
try { fclip = JSON.parse(localStorage.getItem(CLIP_KEY) || 'null'); } catch {}
let dragFrom = null;

function copyFrame(cut) {
  fclip = { rows: [...curFrame().rows], ms: curFrame().ms };
  try { localStorage.setItem(CLIP_KEY, JSON.stringify(fclip)); } catch {}
  if (cut) { if (curAnim().frames.length < 2) status('Copied. Cannot cut the only frame of an animation.'); else removeFrame(); }
  status(`${cut ? 'Cut' : 'Copied'} frame ${frameIdx + 1}. Ctrl+V pastes it as a new frame.`);
  renderTimeline();
}
function pasteFrame(over) {
  if (!fclip) { status('Nothing copied yet. Press Ctrl+C on a frame.'); return; }
  snap();
  if (over) { curFrame().rows = padRows([...fclip.rows], d.w, d.h); curFrame().ms = fclip.ms > 0 ? fclip.ms : 150; rebuild(); status('Pasted over this frame.'); return; }
  frameIdx = insertFrameAt(d, curAnim().name, frameIdx + 1, fclip);
  rebuild(); status(`Pasted as frame ${frameIdx + 1}.`);
}
function dropOnTimeline(ins, copy) {
  const from = dragFrom; dragFrom = null;
  if (from === null) return;
  snap();
  if (copy) frameIdx = insertFrameAt(d, curAnim().name, ins, curAnim().frames[from]);
  else frameIdx = moveFrameTo(d, curAnim().name, from, ins > from ? ins - 1 : ins);
  stopPlay(); rebuild();
}
function dropOnAnim(i, copy) {
  const from = dragFrom; dragFrom = null;
  if (from === null || i === animIdx) return;
  snap();
  const src = curAnim().frames[from];
  animIdx = i;
  frameIdx = insertFrameAt(d, curAnim().name, curAnim().frames.length, src);
  stopPlay(); rebuild(); status(`Copied the frame to the end of ${curAnim().name}.`);
}
const dropSide = (e) => { const r = e.currentTarget.getBoundingClientRect(); return e.clientX > r.left + r.width / 2 ? 1 : 0; };
const clearMarks = () => document.querySelectorAll('.dropL, .dropR, .dropA').forEach((n) => n.classList.remove('dropL', 'dropR', 'dropA'));

function renderTimeline() {
  const t = $('timeline'); t.textContent = '';
  const a = curAnim(), atk = curAtk();
  a.frames.forEach((f, i) => {
    const shots = atk && atk.anim === a.name ? atk.steps.filter((s) => s.frame === i).length : 0;
    const b = el('button', {
      className: 'fbtn' + (i === frameIdx ? ' on' : ''), onclick: () => { frameIdx = i; stopPlay(); rebuild(); },
      innerHTML: `${i + 1}<small>${f.ms}ms${shots ? ` &middot; ${shots} shot${shots > 1 ? 's' : ''}` : ''}</small>`,
      draggable: true, title: 'drag to reorder, Alt-drag to copy',
    });
    b.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', `frame ${i + 1}`); });
    b.addEventListener('dragend', () => { dragFrom = null; clearMarks(); });
    b.addEventListener('dragover', (e) => {
      if (dragFrom === null) return;
      e.preventDefault(); e.dataTransfer.dropEffect = e.altKey || e.ctrlKey ? 'copy' : 'move';
      clearMarks(); b.classList.add(dropSide(e) ? 'dropR' : 'dropL');
    });
    b.addEventListener('drop', (e) => { if (dragFrom === null) return; e.preventDefault(); const ins = i + dropSide(e); clearMarks(); dropOnTimeline(ins, e.altKey || e.ctrlKey); });
    t.append(b);
  });
  const end = el('div', { className: 'fbtn', style: 'min-width:40px;border:1px dashed var(--line);opacity:.5;text-align:center', textContent: '+', title: 'drop here to move / copy a frame to the end' });
  end.addEventListener('dragover', (e) => { if (dragFrom === null) return; e.preventDefault(); clearMarks(); end.classList.add('dropL'); });
  end.addEventListener('drop', (e) => { if (dragFrom === null) return; e.preventDefault(); clearMarks(); dropOnTimeline(a.frames.length, e.altKey || e.ctrlKey); });
  t.append(end);
  const c = $('frameCtl'); c.textContent = '';
  const ms = el('input', { type: 'number', min: 20, step: 10, value: curFrame().ms });
  ms.addEventListener('input', () => { if (Number(ms.value) > 0) { snap('ms'); curFrame().ms = Number(ms.value); changed(true); } });
  c.append(
    el('label', {}, 'frame ', String(frameIdx + 1), ' lasts '), ms, el('span', { textContent: 'ms' }),
    el('button', { textContent: '+ new', onclick: () => addFrame(false) }),
    el('button', { textContent: 'duplicate', onclick: () => addFrame(true) }),
    el('button', { textContent: 'copy', title: 'Ctrl+C', onclick: () => copyFrame(false) }),
    el('button', { textContent: 'paste', title: 'Ctrl+V: new frame after this one', onclick: () => pasteFrame(false) }),
    el('button', { textContent: 'paste over', title: 'Ctrl+Shift+V: replace this frame\'s drawing', onclick: () => pasteFrame(true) }),
    el('button', { textContent: 'delete', onclick: removeFrame }),
    el('button', { textContent: '←', title: 'move earlier', onclick: () => moveFrame(-1) }),
    el('button', { textContent: '→', title: 'move later', onclick: () => moveFrame(1) }),
    el('span', { className: 'hint', textContent: `animation: ${(animLength(a)).toFixed(2)}s${a.loop ? ' (loops)' : ' (plays once)'}` }),
  );
}

function renderAnims() {
  const box = $('anims'); box.textContent = '';
  d.animations.forEach((a, i) => {
    const row = el('div', { className: 'anim' });
    const nb = el('button', { className: 'name' + (i === animIdx ? ' on' : ''), textContent: `${a.name}  (${a.frames.length})`, onclick: () => { animIdx = i; frameIdx = 0; stopPlay(); rebuild(); } });
    nb.addEventListener('dragover', (e) => { if (dragFrom === null || i === animIdx) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; clearMarks(); nb.classList.add('dropA'); });
    nb.addEventListener('dragleave', () => nb.classList.remove('dropA'));
    nb.addEventListener('drop', (e) => { if (dragFrom === null) return; e.preventDefault(); clearMarks(); dropOnAnim(i, true); });
    row.append(nb);
    row.append(el('button', { textContent: '×', title: 'delete animation', onclick: () => deleteAnim(i) }));
    box.append(row);
  });
  const nm = el('input', { type: 'text', value: curAnim().name, spellcheck: false });
  nm.addEventListener('input', () => renameAnim(nm.value));
  box.append(el('label', { className: 'fld' }, el('span', { textContent: 'rename this animation' }), nm));
  $('loop').checked = !!curAnim().loop;
}
function renameAnim(v) {
  const old = curAnim().name; if (!v || v === old) return;
  snap('rn');
  curAnim().name = v;
  for (const k of d.attacks) if (k.anim === old) k.anim = v;
  for (const p of d.phases) if (p.anim === old) p.anim = v;
  changed(); $('anims').querySelector('.name.on').textContent = `${v}  (${curAnim().frames.length})`;
}
$('addAnim').onclick = () => {
  snap();
  let n = d.animations.length + 1; while (animByName(d, `anim${n}`)) n++;
  d.animations.push({ name: `anim${n}`, loop: false, frames: [blankFrame(d.w, d.h)] });
  animIdx = d.animations.length - 1; frameIdx = 0; rebuild();
};
function deleteAnim(i) {
  if (d.animations.length < 2) { status('Keep at least one animation.'); return; }
  snap();
  const gone = d.animations[i].name;
  d.animations.splice(i, 1);
  const fallback = d.animations[0].name;
  for (const p of d.phases) if (p.anim === gone) p.anim = fallback;
  for (const k of d.attacks) if (k.anim === gone) k.anim = fallback;
  animIdx = Math.min(animIdx, d.animations.length - 1); frameIdx = 0; rebuild();
}

$('name').oninput = () => { snap('name'); d.name = $('name').value.trim(); changed(true); };
$('hitR').oninput = () => { if (Number($('hitR').value) > 0) { snap('hit'); d.hitRadius = Number($('hitR').value); changed(true); } };
$('resize').onclick = () => {
  const w = Math.round(Number($('w').value)), h = Math.round(Number($('h').value));
  if (!(w >= 1 && w <= MAX_W && h >= 1 && h <= MAX_H)) { status(`Size must be 1-${MAX_W} wide and 1-${MAX_H} tall.`); return; }
  snap();
  d.w = w; d.h = h;
  for (const a of d.animations) for (const f of a.frames) f.rows = padRows(f.rows, w, h);
  rebuild();
};
const pal = $('pal');
for (const g of GLYPHS) pal.append(el('button', { textContent: g, onclick: () => { setBrush(g); } }));
function setBrush(ch) { brush = ch; $('brush').value = ch === ' ' ? '' : ch; if (tool === 'origin') setTool('draw'); }
$('brush').oninput = () => { if ($('brush').value) brush = $('brush').value.slice(-1); $('brush').value = brush === ' ' ? '' : brush; };
function setTool(t) {
  tool = t === 'origin' ? 'draw' : t;
  $('tool-draw').classList.toggle('on', tool === 'draw');
  $('tool-fill').classList.toggle('on', tool === 'fill');
  $('tool-origin').classList.toggle('on', !!pickStep);
  fc.style.cursor = pickStep ? 'copy' : 'crosshair';
}
$('tool-draw').onclick = () => { pickStep = null; setTool('draw'); drawFrame(); };
$('tool-fill').onclick = () => { pickStep = null; setTool('fill'); drawFrame(); };
$('tool-origin').onclick = () => {
  const atk = curAtk();
  if (!atk || !atk.steps.length) { status('Make an attack with a shot first (Attacks tab), then use its "pick origin" button.'); return; }
  startPick(atk.steps[0]);
};
function startPick(step) {
  pickStep = step;
  const atk = curAtk();
  const ai = d.animations.findIndex((a) => a.name === atk?.anim);
  if (ai >= 0) { animIdx = ai; frameIdx = Math.min(step.frame, d.animations[ai].frames.length - 1); }
  stopPlay(); rebuild(); setTool('draw'); $('tool-origin').classList.add('on');
  status('Click a cell on the frame canvas: that is where this shot comes from.');
}

function field(label, input) { return el('label', { className: 'fld' }, el('span', { textContent: label }), input); }
function num(obj, key, { step = 1, min, blankDeletes = false, onSet } = {}) {
  const i = el('input', { type: 'number', step, value: obj[key] ?? '' });
  if (min !== undefined) i.min = min;
  i.addEventListener('input', () => {
    snap(`n:${key}`);
    if (i.value === '') { if (blankDeletes) delete obj[key]; } else obj[key] = Number(i.value);
    if (onSet) onSet(); changed(true);
  });
  return i;
}
function select(opts, value, onPick) {
  const s = el('select', {}, ...opts.map(([v, t]) => el('option', { value: v, textContent: t })));
  s.value = String(value); s.onchange = () => { snap(); onPick(s.value); };
  return s;
}

function renderAttacks(root) {
  root.append(el('div', { className: 'hint', textContent: 'An attack plays an animation once. Each shot fires the moment the animation reaches the frame you map it to. Click an attack to show its shot origins on the canvas.' }));
  d.attacks.forEach((k, ai) => {
    const card = el('div', { className: 'card' + (ai === atkIdx ? ' sel' : '') });
    card.addEventListener('pointerdown', () => { if (atkIdx !== ai) { atkIdx = ai; drawFrame(); renderTimeline(); [...root.querySelectorAll('.card')].forEach((c, i) => c.classList.toggle('sel', i === ai)); } });
    const nm = el('input', { type: 'text', value: k.name, spellcheck: false });
    nm.addEventListener('input', () => renameAttack(k, nm.value));
    card.append(el('div', { className: 'ehead' }, nm,
      el('button', { textContent: '▶ test', onclick: () => { atkIdx = ai; startAttack(); } }),
      el('button', { textContent: '×', title: 'delete attack', onclick: () => { snap(); const gone = d.attacks.splice(ai, 1)[0].name; for (const p of d.phases) p.attacks = p.attacks.filter((n) => n !== gone); atkIdx = Math.max(0, ai - 1); rebuild(); } })));
    card.append(field('animation it plays', select(d.animations.map((a) => [a.name, a.name]), k.anim, (v) => {
      k.anim = v; const n = animByName(d, v).frames.length; for (const s of k.steps) s.frame = Math.min(s.frame, n - 1);
      rebuild();
    })));
    k.steps.forEach((s, si) => card.append(stepRow(k, s, si)));
    card.append(el('button', { textContent: '+ shot', onclick: () => {
      snap();
      const anim = animByName(d, k.anim);
      k.steps.push({ frame: Math.min(k.anim === curAnim().name ? frameIdx : 0, anim.frames.length - 1), kind: 'aimed', count: 1, spread: 0, ox: 0, oy: 0 });
      atkIdx = ai; rebuild();
    } }));
    root.append(card);
  });
  root.append(el('button', { textContent: '+ new attack', onclick: () => {
    snap();
    let n = d.attacks.length + 1; while (attackByName(d, `attack${n}`)) n++;
    d.attacks.push({ name: `attack${n}`, anim: curAnim().name, steps: [{ frame: frameIdx, kind: 'aimed', count: 1, spread: 0, ox: 0, oy: 0 }] });
    atkIdx = d.attacks.length - 1; rebuild();
  } }));
}
function renameAttack(k, v) {
  if (!v || v === k.name) return;
  snap('ra');
  const old = k.name; k.name = v;
  for (const p of d.phases) p.attacks = p.attacks.map((n) => (n === old ? v : n));
  changed(true);
}
function stepRow(k, s, si) {
  const box = el('div', { className: 'step' });
  const anim = animByName(d, k.anim);
  const frames = anim.frames.map((_, i) => [i, `frame ${i + 1}`]);
  box.append(el('div', { className: 'ehead' }, el('b', { textContent: `shot S${si + 1}` }),
    el('button', { textContent: 'pick origin', title: 'then click the frame canvas', onclick: () => { atkIdx = d.attacks.indexOf(k); startPick(s); } }),
    el('button', { textContent: '×', title: 'delete shot', onclick: () => { snap(); k.steps.splice(si, 1); rebuild(); } })));
  const g = el('div', { className: 'grid2' });
  g.append(field('fires on', select(frames, s.frame, (v) => { s.frame = Number(v); changed(); renderTimeline(); })));
  g.append(field('pattern', select(KINDS.map((x) => [x, { aimed: 'aimed at player', angle: 'fixed angle', ring: 'ring' }[x]]), s.kind, (v) => { s.kind = v; rebuild(); })));
  g.append(field('bullets', num(s, 'count', { min: 1 })));
  if (s.kind !== 'ring') g.append(field('spread (deg, total)', num(s, 'spread', { step: 5, min: 0 })));
  if (s.kind !== 'aimed') g.append(field(s.kind === 'ring' ? 'first bullet angle' : 'angle (0 right, 90 down)', num(s, 'angle', { step: 15 })));
  g.append(field('speed (blank = normal)', num(s, 'speed', { step: 1, min: 0, blankDeletes: true })));
  g.append(field('muzzle x (cells from centre)', num(s, 'ox', { step: 1, onSet: drawFrame })));
  g.append(field('muzzle y', num(s, 'oy', { step: 1, onSet: drawFrame })));
  box.append(g);
  return box;
}

function renderPhases(root) {
  root.append(el('div', { className: 'hint', textContent: 'The boss is in the LOWEST phase whose "below" is at or above its hp (100% = full). In a phase it idles, then plays its attacks in turn every (level interval x rate) seconds.' }));
  d.phases.forEach((p, i) => {
    const card = el('div', { className: 'card' });
    card.append(el('div', { className: 'ehead' }, el('b', { textContent: `phase ${i + 1}` }),
      el('button', { textContent: '×', title: 'delete phase', onclick: () => { if (d.phases.length < 2) { status('Keep at least one phase.'); return; } snap(); d.phases.splice(i, 1); rebuild(); } })));
    const g = el('div', { className: 'grid2' });
    const pct = el('input', { type: 'number', min: 1, max: 100, step: 5, value: Math.round(p.below * 100) });
    pct.addEventListener('input', () => { snap('pct'); p.below = Number(pct.value) / 100; changed(true); });
    g.append(field('while hp is at most (%)', pct));
    g.append(field('movement', select(MOVE_NAMES.map((m) => [m, m]), p.move, (v) => { p.move = v; changed(true); })));
    g.append(field('idle animation', select(d.animations.map((a) => [a.name, a.name]), p.anim, (v) => { p.anim = v; changed(true); })));
    g.append(field('attack rate (x interval)', num(p, 'rate', { step: 0.1, min: 0.1 })));
    card.append(g);
    card.append(el('div', { className: 'hint', textContent: 'attacks it uses (in turn):' }));
    for (const k of d.attacks) {
      const cb = el('input', { type: 'checkbox', checked: p.attacks.includes(k.name) });
      cb.onchange = () => { snap(); p.attacks = d.attacks.map((a) => a.name).filter((n) => (n === k.name ? cb.checked : p.attacks.includes(n))); changed(true); };
      card.append(el('label', { style: 'display:block' }, cb, ' ' + k.name));
    }
    if (!d.attacks.length) card.append(el('div', { className: 'hint', textContent: 'No attacks yet: make one in the Attacks tab.' }));
    root.append(card);
  });
  root.append(el('button', { textContent: '+ new phase', onclick: () => {
    snap();
    const lowest = Math.min(...d.phases.map((p) => p.below));
    d.phases.push({ below: Math.max(0.1, +(lowest - 0.3).toFixed(2)), move: 'hover', attacks: [], rate: 0.8, anim: curAnim().name });
    rebuild();
  } }));
}

function renderJson(root) {
  const ta = el('textarea', { value: designToFile(d), readOnly: true, spellcheck: false, rows: 24, style: 'width:100%;font-size:11px;white-space:pre' });
  root.append(el('div', { className: 'hint', textContent: 'This is exactly what Download writes.' }), ta);
}

function renderPanel() {
  const root = $('panel'); root.textContent = '';
  for (const k of ['attacks', 'phases', 'json']) $(`tab-${k}`).classList.toggle('on', tab === k);
  if (tab === 'attacks') renderAttacks(root); else if (tab === 'phases') renderPhases(root); else renderJson(root);
}
for (const k of ['attacks', 'phases', 'json']) $(`tab-${k}`).onclick = () => { tab = k; renderPanel(); };

function renderProblems() {
  const p = validateDesign(d), box = $('problems');
  box.textContent = '';
  box.className = p.length ? '' : 'ok';
  if (!p.length) box.textContent = 'No problems. Ready to export.';
  for (const m of p) box.append(el('div', { textContent: '• ' + m }));
}

const sc = $('stage'), sx = sc.getContext('2d');
const S_COLS = 64, S_ROWS = 24, SW = 11, SH = 17, BOSS_AT = { x: 32, y: 12 };
sc.width = S_COLS * SW; sc.height = S_ROWS * SH;
sc.addEventListener('pointerdown', (e) => {
  const r = sc.getBoundingClientRect();
  player.x = (e.clientX - r.left) / SW; player.y = (e.clientY - r.top) / SH;
  drawStage();
});

function drawStage() {
  sx.fillStyle = '#000'; sx.fillRect(0, 0, sc.width, sc.height);
  sx.fillStyle = 'rgba(255,255,255,.2)';
  sx.fillRect(0, (S_ROWS - 1) * SH, sc.width, SH);
  let rows, boss = { x: BOSS_AT.x, y: BOSS_AT.y };
  if (play?.mode === 'attack') rows = frameAt(d, play.atk.def.anim, play.atk.t)?.rows;
  else if (play?.mode === 'idle') rows = frameAt(d, phaseFor(d, 1).anim, play.t)?.rows;
  else if (play?.mode === 'anim') rows = frameAt(d, curAnim().name, play.t)?.rows;
  else rows = curFrame().rows;
  sx.font = `bold ${SH - 3}px monospace`; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillStyle = '#fff';
  const ox = Math.floor(d.w / 2), oy = Math.floor(d.h / 2);
  (rows || []).forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== ' ') sx.fillText(ch, (boss.x - ox + i + 0.5) * SW, (boss.y - oy + j + 0.5) * SH);
  }));
  if ($('showHit').checked) {
    sx.strokeStyle = 'rgba(255,255,255,.5)'; sx.setLineDash([4, 4]);
    sx.beginPath(); sx.ellipse((boss.x + 0.5) * SW, (boss.y + 0.5) * SH, d.hitRadius * SW, d.hitRadius * SH, 0, 0, Math.PI * 2); sx.stroke(); sx.setLineDash([]);
  }
  sx.fillText('@', player.x * SW, player.y * SH);
  for (const b of play?.bullets || []) sx.fillText('o', b.x * SW, b.y * SH);
}

function stopPlay() { play = null; drawStage(); }
function startAnim() { play = { mode: 'anim', t: 0, bullets: [] }; kick(); }
function startAttack() {
  const k = curAtk();
  if (!k) { status('Make an attack first.'); return; }
  play = { mode: 'attack', t: 0, bullets: [], atk: { def: k, t: 0, fired: new Set() } };
  kick();
}
$('playAnim').onclick = startAnim;
$('playAtk').onclick = startAttack;
$('stop').onclick = stopPlay;
$('showHit').onchange = drawStage;

const spawnPreview = (list, x, y, angle, _owner, speed) => list.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
function tickPlay(dt) {
  if (!play) return;
  play.t += dt;
  const g = { player: { x: player.x - 0.4, y: player.y - 0.5, w: 0.8, h: 1 }, bullets: play.bullets };
  if (play.mode === 'attack') {
    const a = play.atk, anim = animByName(d, a.def.anim);
    a.t += dt;
    const idx = frameIndexAt(anim, a.t);
    a.def.steps.forEach((s, i) => { if (!a.fired.has(i) && s.frame <= idx) { a.fired.add(i); fireStep(s, BOSS_AT, g, spawnPreview); } });
    if (a.t >= animLength(anim)) {
      a.def.steps.forEach((s, i) => { if (!a.fired.has(i)) { a.fired.add(i); fireStep(s, BOSS_AT, g, spawnPreview); } });
      play = { mode: 'idle', t: 0, bullets: play.bullets, atk: a };
    }
  }
  for (const b of play.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  play.bullets = play.bullets.filter((b) => b.x > -2 && b.x < S_COLS + 2 && b.y > -2 && b.y < S_ROWS + 2);
  if (play.mode === 'idle' && !play.bullets.length) play = null;
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (play) { tickPlay(dt); drawStage(); requestAnimationFrame(loop); } else drawStage();
}
function kick() { last = performance.now(); requestAnimationFrame(loop); }

function updateFields() {
  $('name').value = d.name; $('w').value = d.w; $('h').value = d.h; $('hitR').value = d.hitRadius;
  $('where').textContent = `${d.name} / ${curAnim().name} / frame ${frameIdx + 1} of ${curAnim().frames.length}`;
}
function changed(light = false) {
  save(); renderProblems(); drawFrame(); if (!play) drawStage();
  if (!light) renderTimeline();
  $('where').textContent = `${d.name} / ${curAnim().name} / frame ${frameIdx + 1} of ${curAnim().frames.length}`;
  if (tab === 'json') renderPanel();
}
function rebuild() {
  clampSel(); sizeCanvases(); updateFields(); renderAnims(); renderTimeline(); renderPanel(); renderProblems(); drawFrame(); if (!play) drawStage(); save();
}

const download = (name, text) => {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/javascript' })), download: name });
  document.body.append(a); a.click(); a.remove();
};
$('download').onclick = () => {
  const p = validateDesign(d);
  download(`${d.name || 'boss'}.js`, designToFile(d));
  status(p.length ? `Downloaded, but there are ${p.length} problem(s) - see the list.` : `Downloaded ${d.name}.js. Put it in src/bosses/ and import it in src/bosses/index.js`);
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(designToFile(d)); status('Copied the file text.'); }
  catch { tab = 'json'; renderPanel(); status('Could not reach the clipboard: select the text in the File text tab instead.'); }
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async () => {
  const f = $('importFile').files[0]; if (!f) return;
  try {
    const text = await f.text();
    let obj;
    if (text.trim().startsWith('{')) obj = JSON.parse(text);
    else { const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); const m = await import(url); obj = Object.values(m)[0]; }
    snap(); d = normalizeDesign(obj); animIdx = 0; frameIdx = 0; atkIdx = 0; rebuild(); status(`Loaded ${d.name}.`);
  } catch (e) { status(`Could not read that file: ${e.message}`); }
  $('importFile').value = '';
};

const open = $('open');
open.append(el('option', { value: '', textContent: 'Open...' }), el('option', { value: 'new', textContent: 'New blank boss' }),
  ...Object.keys(BOSS_DESIGNS).map((n) => el('option', { value: n, textContent: `Shipped: ${n}` })));
open.onchange = () => {
  const v = open.value; open.value = ''; if (!v) return;
  if (!confirm('Replace what is in the editor? (Ctrl+Z brings it back)')) return;
  snap(); d = v === 'new' ? blankDesign('newboss') : normalizeDesign(BOSS_DESIGNS[v]);
  animIdx = 0; frameIdx = 0; atkIdx = 0; stopPlay(); rebuild();
};

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if ((e.ctrlKey || e.metaKey) && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) restore(redo, undo); else restore(undo, redo); return; }
    if (k === 'y') { e.preventDefault(); restore(redo, undo); return; }
    if (k === 's') { e.preventDefault(); $('download').click(); return; }
    if (k === 'c') { e.preventDefault(); copyFrame(false); return; }
    if (k === 'x') { e.preventDefault(); copyFrame(true); return; }
    if (k === 'v') { e.preventDefault(); pasteFrame(e.shiftKey); return; }
    if (k === 'd') { e.preventDefault(); addFrame(true); return; }
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') { pickStep = null; setTool('draw'); drawFrame(); return; }
  if (e.key === 'ArrowLeft' && frameIdx > 0) { frameIdx--; stopPlay(); rebuild(); return; }
  if (e.key === 'ArrowRight' && frameIdx < curAnim().frames.length - 1) { frameIdx++; stopPlay(); rebuild(); return; }
  if (e.key === ' ') { e.preventDefault(); setBrush(' '); return; }
  if (e.key === 'F5' || e.key.length !== 1) return;
  setBrush(e.key);
});

setTool('draw');
setBrush('#');
rebuild();
