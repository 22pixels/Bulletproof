import { DT } from './config.js';
import { update, terminalInput } from './game.js';
import { createInput, noEdges } from './input.js';
import { createRenderer } from './render.js';
import { LEVELS } from './levels/index.js';
import { createCampaign } from './campaign.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);

function fatal(err) {
  console.error(err);
  const pre = document.createElement('pre');
  pre.style.cssText =
    'position:fixed;inset:0;margin:0;padding:20px;color:#fff;background:#000;font:14px monospace;white-space:pre-wrap;z-index:9';
  pre.textContent = 'ROOT failed to start\n\n' + (err && err.message ? err.message : err);
  document.body.appendChild(pre);
}

const q = new URLSearchParams(location.search);
let campaign;
let game;
try {
  if (q.has('custom')) {
    const def = JSON.parse(localStorage.getItem('root-editor-level') || 'null');
    if (!def) throw new Error('No level from the editor was found. Open editor.html and press P.');
    const noSave = { getItem: () => null, setItem() {}, removeItem() {} };
    campaign = createCampaign([def], noSave);
    game = campaign.start();
  } else {
    campaign = createCampaign(LEVELS);
    game = campaign.start({
      level: q.has('level') ? Number(q.get('level')) - 1 : undefined,
      fresh: q.has('new'),
    });
  }
} catch (err) {
  fatal(err);
  throw err;
}

const input = createInput(window, canvas, renderer.toVirtual, () => game.mode === 'mview' && !game.complete);

function advance() {
  game = campaign.next() ? campaign.game : campaign.start({ fresh: true });
  input.reset();
}

window.addEventListener('resize', renderer.resize);
renderer.resize();

window.addEventListener('keydown', (e) => {
  if (game.mode === 'terminal') {
    e.preventDefault();
    if (e.repeat && e.key.length === 1) return;
    terminalInput(game, e);
    if (game.mode !== 'terminal') input.reset();
    return;
  }
  if (game.complete && e.key === 'Enter') advance();
});

window.__game = () => game;
window.__goto = (n) => {
  game = campaign.goto(n - 1);
  input.reset();
  return game.level.name;
};

let last = performance.now();
let acc = 0;

function frame(now) {
  acc += Math.max(0, Math.min(0.25, (now - last) / 1000));
  last = now;

  let inp = input.state();
  let steps = 0;
  while (acc >= DT && steps < 5) {
    update(game, inp, DT);
    if (steps === 0) input.clearEdges();
    inp = noEdges(inp);
    acc -= DT;
    steps++;
  }
  if (steps === 5) acc = 0;

  renderer.draw(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
