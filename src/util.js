export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);
