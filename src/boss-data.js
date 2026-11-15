import { BULLET } from './config.js';

export const MOVE_NAMES = ['still', 'sway', 'hover'];
export const KINDS = ['aimed', 'angle', 'ring'];
export const MAX_W = 40, MAX_H = 24;

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export const padRows = (rows, w, h) => Array.from({ length: h }, (_, i) => (rows[i] ?? '').slice(0, w).padEnd(w, ' '));
export const blankFrame = (w, h, ms = 150) => ({ rows: padRows([], w, h), ms });

export function blankDesign(name = 'newboss') {
  const w = 11, h = 6;
  return {
    name, w, h, hitRadius: 2,
    animations: [{ name: 'idle', loop: true, frames: [blankFrame(w, h, 300)] }],
    attacks: [],
    phases: [{ below: 1, move: 'sway', attacks: [], rate: 1, anim: 'idle' }],
  };
}

export const animByName = (d, name) => d.animations.find((a) => a.name === name) || null;

export function insertFrameAt(d, animName, at, frame) {
  const a = animByName(d, animName);
  at = Math.max(0, Math.min(a.frames.length, at));
  a.frames.splice(at, 0, { rows: padRows([...frame.rows], d.w, d.h), ms: frame.ms > 0 ? frame.ms : 150 });
  for (const k of d.attacks) if (k.anim === animName) for (const s of k.steps) if (s.frame >= at) s.frame++;
  return at;
}

export function moveFrameTo(d, animName, from, to) {
  const a = animByName(d, animName);
  const n = a.frames.length;
  to = Math.max(0, Math.min(n - 1, to));
  if (from === to || from < 0 || from >= n) return from;
  a.frames.splice(to, 0, a.frames.splice(from, 1)[0]);
  const at = (i) => (i === from ? to : from < to && i > from && i <= to ? i - 1 : from > to && i >= to && i < from ? i + 1 : i);
  for (const k of d.attacks) if (k.anim === animName) for (const s of k.steps) s.frame = at(s.frame);
  return to;
}
export const attackByName = (d, name) => d.attacks.find((a) => a.name === name) || null;

export const animLength = (a) => (a?.frames || []).reduce((s, f) => s + Math.max(0.02, (f.ms || 100) / 1000), 0);

export function frameIndexAt(a, t) {
  const n = a?.frames?.length || 0;
  if (!n) return 0;
  const total = animLength(a);
  let tt = a.loop ? t % total : Math.min(t, total - 1e-9);
  for (let i = 0; i < n; i++) {
    tt -= Math.max(0.02, (a.frames[i].ms || 100) / 1000);
    if (tt < 0) return i;
  }
  return n - 1;
}

export function frameAt(d, animName, t) {
  const a = animByName(d, animName) || d.animations[0];
  return a?.frames[frameIndexAt(a, t)] || null;
}

export function phaseFor(d, frac) {
  const ph = d.phases;
  return [...ph].sort((a, b) => b.below - a.below).reverse().find((p) => frac <= p.below + 1e-9) || ph[0];
}

export function shotAngles(step, from, target) {
  const n = Math.max(1, Math.round(step.count ?? 1));
  const R = Math.PI / 180;
  if (step.kind === 'ring') return Array.from({ length: n }, (_, i) => (step.angle ?? 0) * R + (i / n) * Math.PI * 2);
  const centre = step.kind === 'angle' ? (step.angle ?? 0) * R : Math.atan2(target.y - from.y, target.x - from.x);
  const spread = (step.spread ?? 0) * R;
  if (n === 1) return [centre];
  return Array.from({ length: n }, (_, i) => centre - spread / 2 + (spread * i) / (n - 1));
}

export function stepOrigin(step, cx, cy) {
  return { x: cx + 0.5 + (step.ox ?? 0), y: cy + 0.5 + (step.oy ?? 0) };
}
export const stepSpeed = (step) => (num(step.speed) && step.speed > 0 ? step.speed : BULLET.speed);

export function fireStep(step, boss, g, spawn) {
  const from = stepOrigin(step, boss.x, boss.y);
  const target = { x: g.player.x + g.player.w / 2, y: g.player.y + g.player.h / 2 };
  for (const a of shotAngles(step, from, target)) spawn(g.bullets, from.x, from.y, a, 'enemy', stepSpeed(step));
}

export function validateDesign(d) {
  const out = [];
  if (!d || typeof d !== 'object') return ['design is not an object'];
  if (!/^[a-z0-9_-]+$/i.test(d.name || '')) out.push('name must be letters, numbers, - or _ (it becomes the file name)');
  if (!(d.w >= 1 && d.w <= MAX_W && d.h >= 1 && d.h <= MAX_H)) out.push(`size must be 1-${MAX_W} wide and 1-${MAX_H} tall`);
  if (!(num(d.hitRadius) && d.hitRadius > 0)) out.push('hit radius must be above 0');
  if (!Array.isArray(d.animations) || !d.animations.length) { out.push('needs at least one animation'); return out; }
  const names = new Set();
  for (const a of d.animations) {
    if (!a.name) out.push('an animation has no name');
    else if (names.has(a.name)) out.push(`two animations are called '${a.name}'`);
    names.add(a.name);
    if (!a.frames?.length) out.push(`animation '${a.name}' has no frames`);
    for (const [i, f] of (a.frames || []).entries()) {
      if (!(f.ms > 0)) out.push(`animation '${a.name}' frame ${i + 1}: duration must be above 0`);
      if ((f.rows || []).length !== d.h || f.rows.some((r) => r.length !== d.w)) out.push(`animation '${a.name}' frame ${i + 1}: does not match the ${d.w}x${d.h} size`);
    }
  }
  const attackNames = new Set();
  for (const k of d.attacks || []) {
    const tag = `attack '${k.name}'`;
    if (!k.name) out.push('an attack has no name');
    else if (attackNames.has(k.name)) out.push(`two attacks are called '${k.name}'`);
    attackNames.add(k.name);
    const anim = animByName(d, k.anim);
    if (!anim) out.push(`${tag}: animation '${k.anim}' does not exist`);
    if (!k.steps?.length) out.push(`${tag}: has no shots`);
    for (const [i, s] of (k.steps || []).entries()) {
      if (!KINDS.includes(s.kind)) out.push(`${tag} shot ${i + 1}: unknown kind '${s.kind}'`);
      if (anim && !(Number.isInteger(s.frame) && s.frame >= 0 && s.frame < anim.frames.length)) out.push(`${tag} shot ${i + 1}: frame ${s.frame + 1} is not in animation '${k.anim}' (${anim.frames.length} frames)`);
      if (!(s.count >= 1)) out.push(`${tag} shot ${i + 1}: count must be 1 or more`);
      if (s.speed !== undefined && !(num(s.speed) && s.speed > 0)) out.push(`${tag} shot ${i + 1}: speed must be above 0 or blank`);
    }
  }
  if (!Array.isArray(d.phases) || !d.phases.length) out.push('needs at least one phase');
  for (const [i, p] of (d.phases || []).entries()) {
    const tag = `phase ${i + 1}`;
    if (!MOVE_NAMES.includes(p.move)) out.push(`${tag}: unknown movement '${p.move}'`);
    if (!names.has(p.anim)) out.push(`${tag}: idle animation '${p.anim}' does not exist`);
    if (!(p.below > 0 && p.below <= 1)) out.push(`${tag}: 'below' is a fraction of hp, above 0 and at most 1`);
    if (!(p.rate > 0)) out.push(`${tag}: rate must be above 0`);
    for (const a of p.attacks || []) if (!attackNames.has(a)) out.push(`${tag}: attack '${a}' does not exist`);
  }
  if (d.phases?.length && !d.phases.some((p) => p.below >= 1)) out.push('no phase covers full health (one phase needs below = 1)');
  return out;
}

export function designToFile(d) {
  const id = d.name.replace(/[^a-z0-9_]/gi, '_');
  const frame = (f) => `        { ms: ${f.ms}, rows: [\n${f.rows.map((r) => `          ${JSON.stringify(r)},`).join('\n')}\n        ] },`;
  const anims = d.animations.map((a) => `    { name: ${JSON.stringify(a.name)}, loop: ${!!a.loop}, frames: [\n${a.frames.map(frame).join('\n')}\n    ] },`).join('\n');
  const rest = JSON.stringify({ attacks: d.attacks, phases: d.phases }, null, 2).slice(1, -1).replace(/^\n/, '').replace(/\n$/, '');
  return `export const boss_${id} = {
  name: ${JSON.stringify(d.name)},
  w: ${d.w},
  h: ${d.h},
  hitRadius: ${d.hitRadius},
  animations: [
${anims}
  ],
${rest},
};
`;
}

export function normalizeDesign(src) {
  const d = JSON.parse(JSON.stringify(src || {}));
  d.name = d.name || 'newboss';
  d.w = Math.min(MAX_W, Math.max(1, Math.round(d.w || 11)));
  d.h = Math.min(MAX_H, Math.max(1, Math.round(d.h || 6)));
  d.hitRadius = num(d.hitRadius) && d.hitRadius > 0 ? d.hitRadius : 2;
  d.animations = Array.isArray(d.animations) && d.animations.length ? d.animations : blankDesign().animations;
  for (const a of d.animations) {
    a.loop = !!a.loop;
    a.frames = a.frames?.length ? a.frames : [blankFrame(d.w, d.h)];
    for (const f of a.frames) { f.rows = padRows(f.rows || [], d.w, d.h); f.ms = f.ms > 0 ? f.ms : 150; }
  }
  d.attacks = Array.isArray(d.attacks) ? d.attacks : [];
  d.phases = Array.isArray(d.phases) && d.phases.length ? d.phases : blankDesign().phases;
  return d;
}
