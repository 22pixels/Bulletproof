
export const ACTIONS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['KeyW', 'Space', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  bubble: ['KeyQ'],
  interact: ['KeyE'],
  slide: ['KeyC'],
};

export function emptyInput() {
  return {
    left: false, right: false, down: false, jump: false,
    jumpPressed: false, jumpReleased: false,
    bubblePressed: false, interactPressed: false, slidePressed: false,
    keysPressed: [],
    mouse: { px: 0, py: 0, down: false, pressed: false, released: false },
  };
}

export function noEdges(inp) {
  return {
    ...inp,
    jumpPressed: false, jumpReleased: false,
    bubblePressed: false, interactPressed: false, slidePressed: false,
    keysPressed: [],
    mouse: { ...inp.mouse, pressed: false, released: false },
  };
}

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(target, canvas, toVirtual, isEnabled = () => true) {
  const down = new Set();
  let pressed = {}, released = {};
  let anyKeys = [];
  const mouse = { px: 0, py: 0, down: false, pressed: false, released: false };

  const codeToAction = {};
  for (const [a, codes] of Object.entries(ACTIONS)) for (const c of codes) codeToAction[c] = a;
  const held = (a) => ACTIONS[a].some((c) => down.has(c));

  target.addEventListener('keydown', (e) => {
    if (isEnabled() && !e.repeat && e.code && !e.ctrlKey && !e.metaKey && !e.altKey) anyKeys.push(e.code);
    const a = codeToAction[e.code];
    if (!a) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!isEnabled() || e.repeat) return;
    const was = held(a);
    down.add(e.code);
    if (!was) pressed[a] = true;
  });

  target.addEventListener('keyup', (e) => {
    const a = codeToAction[e.code];
    if (!a || !down.has(e.code)) return;
    down.delete(e.code);
    if (!held(a)) released[a] = true;
  });

  target.addEventListener('blur', () => down.clear());

  canvas.addEventListener('mousemove', (e) => Object.assign(mouse, toVirtual(e.clientX, e.clientY)));
  canvas.addEventListener('mousedown', (e) => {
    Object.assign(mouse, toVirtual(e.clientX, e.clientY));
    mouse.down = true; mouse.pressed = true;
  });
  canvas.addEventListener('mouseup', () => { mouse.down = false; mouse.released = true; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    state() {
      return {
        left: held('left'), right: held('right'), down: held('down'), jump: held('jump'),
        jumpPressed: !!pressed.jump, jumpReleased: !!released.jump,
        bubblePressed: !!pressed.bubble, interactPressed: !!pressed.interact,
        slidePressed: !!pressed.slide,
        keysPressed: anyKeys.slice(),
        mouse: { ...mouse },
      };
    },
    clearEdges() {
      pressed = {}; released = {}; anyKeys = [];
      mouse.pressed = false; mouse.released = false;
    },
    reset() {
      down.clear();
      this.clearEdges();
    },
  };
}
