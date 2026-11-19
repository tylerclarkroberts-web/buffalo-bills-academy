// EL HALO chili-pepper power-ups. One pepper appears inside La Michoacana each wave,
// after the first minute, and the first player to eat it gets a 30-second power.
// Original designs and audio only; nothing borrowed from other games.
// Times are seconds.

export const CHILE_DURATION = 30;

// One pepper per round. Never in the first 60s. Then a random instant in
// minute 2 (60%), minute 3 (20%), or minute 4 (20%).
export const CHILE_WINDOWS = [
  { p: 0.6, t0: 60, t1: 120 },
  { p: 0.2, t0: 120, t1: 180 },
  { p: 0.2, t0: 180, t1: 240 },
];

// Mid-floor of La Michoacana (the paletería), clear of the ice-cream cases
// and the elote cart. The server still snaps Y to the pad with groundAt.
export const CHILE_SPOT = { x: 15.2, z: 2.8 };

export const CHILE_POWERS = [
  { id: 'invis', name: 'INVISIBLE', color: [0.82, 0.95, 0.55] },
  { id: 'invuln', name: 'INTOCABLE', color: [1, 0.82, 0.18] },
  { id: 'instakill', name: 'UN TIRO', color: [0.85, 0.07, 0.12] },
  { id: 'gigante', name: 'GIGANTISMO', color: [0.55, 0.16, 0.86] },
  { id: 'schnuttin', name: 'LAST MAN SCHNUTTIN HIS PANTS', color: [1, 0.38, 0.78] },
  { id: 'mazo', name: 'EL MAZO DE LA FERIA', color: [1, 0.7, 0.08] },
  { id: 'caballos', name: 'CABALLOS DE AGUA', color: [0.18, 0.7, 0.95] },
];

export const CHILE_IDS = CHILE_POWERS.map((p) => p.id);
export const CHILE_BY_ID = Object.fromEntries(CHILE_POWERS.map((p) => [p.id, p]));
export const CHILE_IDX = Object.fromEntries(CHILE_IDS.map((id, i) => [id, i]));

export const CHILE = {
  duration: CHILE_DURATION,
  eatRange: 1.4,
  eatY: 1.8,
  // "300% faster" = four times the usual walk speed.
  schnuttinSpeed: 4,
  schnuttinGravity: 0.5,
  schnuttinJump: 1.35,
  // Visual scale is 3x; collision is a little shy of that so you can still
  // leave the paletería after you eat the pepper inside it.
  giganteScale: 3,
  giganteRadius: 1.8,
  giganteVitals: 5,
  mazoPeriod: 0.42,
  mazoReach: 4.4,
  mazoUp: 11,
  mazoOut: 16,
};

export function pickChileWindow(rnd) {
  const r = rnd();
  let acc = 0;
  for (const w of CHILE_WINDOWS) {
    acc += w.p;
    if (r < acc) return w;
  }
  return CHILE_WINDOWS[CHILE_WINDOWS.length - 1];
}

export function pickChileAt(rnd) {
  const w = pickChileWindow(rnd);
  return w.t0 + rnd() * (w.t1 - w.t0);
}

export function pickChilePower(rnd) {
  return CHILE_IDS[Math.min(CHILE_IDS.length - 1, Math.floor(rnd() * CHILE_IDS.length))];
}

export function isChilePower(id) {
  return !!CHILE_BY_ID[id];
}
