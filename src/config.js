
export const VIEW = { cols: 64, rows: 30, cellW: 15, cellH: 18 };
export const WIDTH = VIEW.cols * VIEW.cellW;
export const HEIGHT = VIEW.rows * VIEW.cellH;
export const DT = 1 / 60;
export const MAX_HEARTS = 10;

export const FONT =
  '"JetBrains Mono", "Fira Code", Menlo, Consolas, "DejaVu Sans Mono", monospace';

const BLACK = '#000000';
const WHITE = '#ffffff';

export const COLORS = {
  bg: BLACK,
  wall: WHITE,
  wallDeep: WHITE,
  oneway: WHITE,
  door: WHITE,
  player: WHITE,
  playerGlow: WHITE,
  rain: WHITE,
  bubble: WHITE,
  dim: WHITE,
  text: WHITE,
  terminal: WHITE,
  guard: WHITE,
  spike: WHITE,
  heart: WHITE,
  exit: WHITE,
  term: WHITE,
  termDim: WHITE,
  termErr: WHITE,
};

export const DEFAULT_BUBBLE = {
  duration: 5,
  cooldown: 1,
  unlimited: false,
  canCancel: true,
  timeScale: 0.15,
  playerTimeScale: 0.4,
  radius: 6,
  aimCone: 45,
  maxHeld: 99,
};

export const BULLET = {
  speed: 14,
  radius: 0.25,
  life: 6,
  reflectBoost: 1.5,
  pickRadius: 1.2,
};

export const BOSS = { hp: 10, interval: 1.2, firstDelay: 1.5 };

export const FLYER = {
  mode: 'patrol',
  range: 8,
  rangeY: 1.5,
  speed: 4,
  hover: 3,
  keep: 3,
  sight: 30,
  interval: 2,
  firstDelay: 0.8,
  sightFire: 30,
};

export const RESPAWN = 'checkpoint';

export const GUARD = {
  interval: 1.5,
  firstDelay: 0.6,
  range: 34,
};
