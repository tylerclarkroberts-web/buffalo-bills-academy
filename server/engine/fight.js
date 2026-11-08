// "Fight Guntrad": a tiny Mortal Kombat-style duel, as a PURE deterministic simulation.
// The browser runs it to play (and to show watchers the same fight); the server re-runs it from the
// fight's seed + the player's input log to decide the result. Integer math only, fixed 60 fps timestep,
// seeded RNG: the same seed + inputs give the same fight on every machine. Never trust a client "win".
export const FPS = 60;
export const INTRO = 220;            // he walks out in his vest, rips it off, "FIGHT!" (inputs ignored)
export const RIP_AT = 70;            // intro frame where the pit boss clothes fly off
export const ROUND = 85 * FPS;       // 85-second round clock
export const FINISH = 180;           // "FINISH HIM!" window once Guntrad's health hits zero
export const MAX_FRAMES = INTRO + ROUND + 6 * FINISH + 120; // hard cap on any fight (clock stops in FINISH)
export const P_HP = 100;
export const G_HP = 1500;           // fifteen times yours
export const W = 1000;               // arena width (units); ground at y = 0
const XMIN = 60, XMAX = 940, BODY = 70;
export const BTN = { L: 1, R: 2, U: 4, D: 8, P: 16, K: 32, B: 64, S: 128 };
export const COMBO_REAL = 5;         // combos only start to hurt from the 5th hit
export const COMBO_BREAK = 14;       // Guntrad bursts out of anything longer (a special can still end it)
const HS_MIN = 6, DECAY = 3, CANCEL_MIN = 3, LUNGE = 3, PUSH_G = 3;
const METER_MAX = 100;

// Player moves: su startup, ac active, re recovery (frames); rg reach; dm base damage; hs hitstun; lv height.
export const PMOVES = {
  jab:  { su: 4, ac: 2, re: 9,  rg: 100, dm: 1, hs: 20, lv: 'high' },
  kick: { su: 7, ac: 3, re: 14, rg: 130, dm: 2, hs: 22, lv: 'mid' },
  lp:   { su: 5, ac: 2, re: 10, rg: 95,  dm: 1, hs: 18, lv: 'low' },
  sw:   { su: 9, ac: 3, re: 18, rg: 130, dm: 2, hs: 22, lv: 'low' },
  jk:   { su: 3, ac: 12, re: 0, rg: 115, dm: 2, hs: 24, lv: 'air' },
  sp:   { su: 6, ac: 6, re: 24, rg: 125, dm: 6, hs: 0,  lv: 'mid', special: true },
};
// Guntrad's moves. lv: high (duck it or stand-block), over (overhead: stand-block only), low (crouch-block or jump), throw (jump or be out of reach).
// Long gangly arms: his punches stretch (Mr. Fantastic style), so closing the gap is the hard part.
// thrust: the anti-spam hip thrust: a shockwave that knocks you away. Can't be blocked or ducked; jump it.
export const GMOVES = {
  jab:  { su: 5,  ac: 3, re: 12, rg: 165, dm: 9,  lv: 'high', stretch: true },
  hay:  { su: 18, ac: 4, re: 27, rg: 230, dm: 18, lv: 'over', stretch: true },
  sweep:{ su: 12, ac: 4, re: 22, rg: 175, dm: 9,  lv: 'low', stretch: true },
  throw:{ su: 8,  ac: 2, re: 26, rg: 100, dm: 12, lv: 'throw' },
  dash: { su: 7,  ac: 3, re: 16, rg: 120, dm: 8,  lv: 'high', dash: 16 },
  reach:{ su: 8, ac: 4, re: 24, rg: 390, dm: 12, lv: 'high', stretch: true },
  thrust:{ su: 10, ac: 5, re: 26, rg: 240, dm: 4, lv: 'thrust' },
};
// Anti-spam: the same move started from neutral SPAM_N times in a row, each within SPAM_GAP frames of the last.
export const SPAM_N = 4, SPAM_GAP = 90;

/** His hitstun shrinks with every hit of a combo, so each link has a tighter window than the last. */
export function hitstun(hs, n) { return Math.max(HS_MIN, hs - ((DECAY * (n - 1)) >> 1)); }
export function comboScale(n) { return n < COMBO_REAL ? 1 : (n - 3) * 2; }
export function seedOf(x) { let h = 2166136261; for (const c of String(x)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function rnd(st, n) { // mulberry32, integer in [0, n)
  st.rng = (st.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(st.rng ^ (st.rng >>> 15), 1 | st.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) % n;
}

/** opts.gHp: Guntrad's starting health (practice "Training" only; real fights always use G_HP). */
export function createFight(seed, { gHp = G_HP } = {}) {
  return {
    gMax: gHp,
    f: 0, rng: (seed >>> 0) || 1, phase: 'intro', result: null, clock: ROUND, finishLeft: 0, prev: 0, ev: [],
    p: { x: 330, y: 0, vy: 0, vx: 0, face: 1, hp: P_HP, st: 'idle', mv: null, mf: 0, res: false, hitAt: -1, lock: false, stun: 0, crouch: false, block: false, meter: 0, jkUsed: false, whiff: false, blocked: 0 },
    g: { x: 670, y: 0, face: -1, hp: gHp, st: 'idle', mv: null, mf: 0, res: false, stun: 0, cool: 30, guard: 0, chain: false, walk: 0, ko: 0, thrustQ: false },
    spam: { mv: null, n: 0, f: -999 }, thrusts: 0,
    combo: { n: 0, dmg: 0 }, best: 0, hits: 0, lastCombo: null,
  };
}

const dist = (st) => Math.abs(st.g.x - st.p.x);
const air = (o) => o.y > 30;
function clampX(o) { o.x = Math.max(XMIN, Math.min(XMAX, o.x)); }
function separate(st) {
  const { p, g } = st;
  if (air(p)) return;
  const d = g.x - p.x;
  if (Math.abs(d) >= BODY) return;
  const need = BODY - Math.abs(d); const s = d >= 0 ? 1 : -1;
  const half = need >> 1;
  p.x -= s * half; g.x += s * (need - half);
  clampX(p); clampX(g);
  if (Math.abs(g.x - p.x) < BODY) { if (g.x === XMIN || g.x === XMAX) p.x = g.x - s * BODY; else g.x = p.x + s * BODY; clampX(p); clampX(g); }
}
function push(st, who, amt) { // shove `who` away from the other; at the wall the other one slides back instead
  const o = who === 'g' ? st.g : st.p; const other = who === 'g' ? st.p : st.g;
  const s = o.x >= other.x ? 1 : -1;
  const before = o.x; o.x += s * amt; clampX(o);
  const left = amt - Math.abs(o.x - before);
  if (left > 0) { other.x -= s * left; clampX(other); }
}

function startP(st, name, neutral = false) {
  const p = st.p;
  if (neutral) { // anti-spam bookkeeping (combo links don't count)
    const sp = st.spam;
    if (sp.mv === name && st.f - sp.f <= SPAM_GAP) sp.n += 1; else { sp.mv = name; sp.n = 1; }
    sp.f = st.f;
    if (sp.n >= SPAM_N) { st.g.thrustQ = true; sp.n = 0; }
  }
  if (name === 'sp') p.meter -= METER_MAX;
  p.st = 'atk'; p.mv = name; p.mf = 0; p.res = false; p.hitAt = -1; p.lock = false; p.whiff = false;
  st.ev.push({ k: 'swing', who: 'p', mv: name });
  // Guntrad reads you: if he's free and you swing in reach, he usually blocks (specials can't be blocked).
  const g = st.g; const m = PMOVES[name];
  if (g.st === 'idle' && !m.special && dist(st) <= m.rg + 40) {
    const chance = name === 'jk' ? 55 : 74;
    if (rnd(st, 100) < chance) { g.guard = m.su + m.ac + 4; }
  }
}
function startG(st, name) {
  const g = st.g; g.st = 'atk'; g.mv = name; g.mf = 0; g.res = false; g.guard = 0;
  st.ev.push({ k: 'swing', who: 'g', mv: name });
}

function hitG(st, m, name) {
  const { g, p } = st;
  const fresh = g.st !== 'hit';
  const counter = g.st === 'atk' && g.mv !== 'thrust' && g.mf < GMOVES[g.mv].su; // interrupted his wind-up
  st.combo.n = fresh ? 1 : st.combo.n + 1;
  if (fresh) st.combo.dmg = 0;
  const n = st.combo.n;
  if (!m.special && n >= COMBO_BREAK) { // combo breaker
    g.st = 'burst'; g.stun = 22; g.mv = null; st.ev.push({ k: 'breaker' });
    p.st = 'hit'; p.stun = 26; p.mv = null; p.hp = Math.max(0, p.hp - 3); push(st, 'p', 90);
    endCombo(st);
    return;
  }
  const dmg = st.phase === 'finish' ? 0 : m.dm * comboScale(n);
  g.hp -= dmg; st.combo.dmg += dmg; st.hits += 1;
  p.meter = Math.min(METER_MAX, p.meter + 5);
  st.ev.push({ k: 'hit', who: 'g', dmg, n, mv: name, counter });
  if (st.phase === 'finish') { st.phase = 'over'; st.result = 'win'; st.ev.push({ k: 'finished' }); g.st = 'down'; g.stun = 999; return; }
  if (g.st === 'atk' && g.mv === 'thrust') { endCombo(st); if (g.hp <= 0) { g.hp = 1; } return; } // armored: the thrust goes through your hits
  if (m.special) { g.st = 'down'; g.stun = 70; g.mv = null; push(st, 'g', 60); endCombo(st); }
  else { g.st = 'hit'; g.mv = null; g.stun = hitstun(m.hs, n) + (counter ? 10 : 0); push(st, 'g', PUSH_G); }
  g.guard = 0;
  if (g.hp <= 0) { g.hp = 0; endCombo(st); st.phase = 'finish'; st.finishLeft = FINISH; g.st = 'dizzy'; g.stun = 0; g.ko += 1; st.ev.push({ k: 'finishhim' }); }
}
function endCombo(st) {
  if (st.combo.n > 0) { st.best = Math.max(st.best, st.combo.n); if (st.combo.n >= 2) st.lastCombo = { n: st.combo.n, dmg: st.combo.dmg, f: st.f }; }
  st.combo.n = 0;
}

function resolveP(st) {
  const { p, g } = st; const m = PMOVES[p.mv];
  const inAct = p.mf >= m.su && p.mf < m.su + m.ac;
  if (!inAct || p.res) return;
  if (dist(st) > m.rg || (p.mv === 'jk' && p.y > 140)) return;
  if (g.st === 'down' || g.st === 'burst') return;
  p.res = true;
  if (g.st === 'dizzy') { hitG(st, m, p.mv); return; }
  if (g.guard > 0 && !m.special && g.st === 'idle') { // blocked
    st.ev.push({ k: 'block', who: 'g' }); push(st, 'p', 18);
    // he steps through your blocked swing with a counter-jab
    g.guard = 0; g.cool = 0; g.chain = false; g.punish = true;
    return;
  }
  p.hitAt = st.f; hitG(st, m, p.mv);
}

function resolveG(st) {
  const { p, g } = st; const m = GMOVES[g.mv];
  if (g.mf < m.su || g.mf >= m.su + m.ac || g.res) return;
  if (dist(st) > m.rg) return;
  g.res = true;
  const aerial = air(p);
  if (m.lv === 'thrust') {
    if (aerial || p.st === 'down') return miss(st);
    p.hp = Math.max(0, p.hp - m.dm); p.mv = null; p.y = 0; p.vy = 0; p.vx = 0; p.st = 'down'; p.stun = 40; p.block = false; p.crouch = false;
    push(st, 'p', 330); st.thrusts += 1;
    st.ev.push({ k: 'hit', who: 'p', dmg: m.dm, mv: 'thrust' }, { k: 'thrust' });
    return;
  }
  if ((m.lv === 'low' || m.lv === 'throw') && aerial) return miss(st);
  if (m.lv === 'high' && p.crouch && p.st === 'idle' && !aerial) return miss(st);
  if (p.st === 'down') return miss(st);
  const canBlock = p.st === 'idle' && p.block && !aerial;
  const blocks = canBlock && ((m.lv === 'high' && !p.crouch) || (m.lv === 'over' && !p.crouch) || (m.lv === 'low' && p.crouch));
  if (blocks) {
    p.st = 'bs'; p.stun = 8; p.hp = Math.max(0, p.hp - (m.lv === 'over' ? 2 : 1)); push(st, 'p', 22);
    p.meter = Math.min(METER_MAX, p.meter + 3); p.blocked += 1;
    st.ev.push({ k: 'block', who: 'p' });
    g.chain = false;
  } else {
    p.hp = Math.max(0, p.hp - m.dm);
    p.mv = null; p.y = 0; p.vy = 0; p.vx = 0;
    if (m.lv === 'throw') { p.st = 'down'; p.stun = 48; push(st, 'p', 120); }
    else { p.st = 'hit'; p.stun = 22; push(st, 'p', 16); }
    p.meter = Math.min(METER_MAX, p.meter + 4);
    st.ev.push({ k: 'hit', who: 'p', dmg: m.dm, mv: g.mv });
    g.chain = g.mv === 'jab' || g.mv === 'dash'; // a landed jab rolls straight into the haymaker
  }
}
function miss() { /* whiffed: his recovery is your opening */ }

function stepP(st, mask) {
  const { p, g } = st;
  const edge = mask & ~st.prev;
  const press = (b) => (edge & b) !== 0;
  const hold = (b) => (mask & b) !== 0;
  const want = press(BTN.S) ? 'S' : press(BTN.K) ? 'K' : press(BTN.P) ? 'P' : null;
  // in the air
  if (p.y > 0 || p.vy !== 0) {
    p.x += p.vx; clampX(p); p.y += p.vy; p.vy -= 2;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.vx = 0; if (p.mv === 'jk') { p.st = 'idle'; p.mv = null; } p.jkUsed = false; }
    if (p.st === 'idle' && want && (want === 'K' || want === 'P') && !p.jkUsed && p.y > 0) { p.jkUsed = true; startP(st, 'jk', true); }
    if (p.st === 'atk' && p.mv === 'jk') { p.mf++; resolveP(st); if (p.y === 0) { p.st = 'idle'; p.mv = null; } }
    return;
  }
  if (p.st === 'hit' || p.st === 'bs' || p.st === 'down') { if (--p.stun <= 0) { p.st = 'idle'; } p.crouch = false; p.block = false; return; }
  if (p.st === 'atk') {
    const m = PMOVES[p.mv];
    if (want) { // cancel into the next hit: only after a hit, not too early (pressing early locks you out)
      const next = pickMove(st, want, hold(BTN.D));
      if (next && p.hitAt >= 0 && !p.lock && st.f - p.hitAt >= CANCEL_MIN && g.st === 'hit') { startP(st, next); resolveP(st); return; }
      p.lock = true;
    }
    if (p.mf < m.su && dist(st) > BODY + 10) { p.x += p.face * LUNGE; clampX(p); } // step into the swing
    p.mf++;
    resolveP(st);
    if (p.mf >= m.su + m.ac && !p.res) { if (!p.whiff) { p.whiff = true; st.ev.push({ k: 'whiff' }); } }
    if (p.mf >= m.su + m.ac + m.re) { p.st = 'idle'; p.mv = null; }
    return;
  }
  // idle on the ground
  p.face = g.x >= p.x ? 1 : -1;
  p.crouch = hold(BTN.D); p.block = hold(BTN.B);
  if (want) {
    const mv = pickMove(st, want, p.crouch);
    if (mv) { p.block = false; startP(st, mv, true); p.mf = 0; return; }
  }
  if (hold(BTN.U) && !p.block) { p.vy = 22; p.y = 1; p.vx = hold(BTN.L) ? -6 : hold(BTN.R) ? 6 : 0; p.crouch = false; p.jkUsed = false; st.ev.push({ k: 'jump' }); return; }
  if (!p.crouch && !p.block) { if (hold(BTN.L)) p.x -= 5; else if (hold(BTN.R)) p.x += 5; clampX(p); }
}
function pickMove(st, want, crouch) {
  if (want === 'S') return st.p.meter >= METER_MAX ? 'sp' : null;
  if (want === 'P') return crouch ? 'lp' : 'jab';
  return crouch ? 'sw' : 'kick';
}

function stepG(st) {
  const { p, g } = st;
  g.face = p.x >= g.x ? 1 : -1;
  if (g.st === 'dizzy') return;
  if (g.st === 'hit' || g.st === 'burst' || g.st === 'down') {
    if (--g.stun <= 0) { if (g.st === 'hit') endCombo(st); g.cool = g.st === 'down' ? 4 : 2; g.st = 'idle'; g.guard = 0; }
    return;
  }
  if (g.st === 'atk') {
    const m = GMOVES[g.mv];
    if (m.dash && g.mf < m.su && dist(st) > m.rg - 10) g.x += g.face * m.dash;
    clampX(g);
    g.mf++;
    resolveG(st);
    if (g.mf >= m.su + m.ac + m.re || (g.chain && g.mf >= m.su + m.ac)) {
      const chained = g.chain; g.chain = false; g.st = 'idle'; g.mv = null;
      if (chained && (p.st === 'hit')) { startG(st, 'hay'); return; }
      g.cool = 8 + rnd(st, 22);
    }
    return;
  }
  // idle: hip-thrusting spammers, guarding, punishing, or picking his next move
  const d = dist(st);
  if (g.thrustQ && p.st !== 'down') { g.thrustQ = false; if (d <= GMOVES.thrust.rg + 60) { startG(st, 'thrust'); st.ev.push({ k: 'thrustcue' }); return; } }
  if (g.guard > 0) { g.guard--; return; }
  if (g.punish) { g.punish = false; if (d <= 200) { startG(st, d <= GMOVES.jab.rg ? 'jab' : 'dash'); return; } }
  // whiff punish: you swung at air and you're still recovering
  if (p.st === 'atk' && p.whiff && d <= 260) { startG(st, d <= GMOVES.jab.rg ? 'jab' : 'dash'); return; }
  if (p.st === 'down' && d < 200) { g.x += g.face * 2; clampX(g); return; }
  if (g.cool > 0) { g.cool--; if (d > 150) { g.x += g.face * 5; clampX(g); } return; }
  if (d > 200) { // out of jab range: stretch a long arm at you, dash in, or stalk forward
    const r = rnd(st, 100);
    if (d <= GMOVES.reach.rg && r < 42) startG(st, 'reach');
    else if (r < 62) startG(st, 'dash');
    else { g.cool = 4 + rnd(st, 8); g.x += g.face * 5; clampX(g); }
    return;
  }
  // close: mix it up. He watches what you do: blockers get thrown, duckers get the overhead.
  const blocking = p.block && !p.crouch, ducking = p.crouch;
  const w = {
    jab: ducking ? 8 : 30,
    hay: ducking ? 40 : 18,
    sweep: blocking ? 40 : 18,
    throw: d <= GMOVES.throw.rg ? (p.block ? 45 : 16) : 0,
    wait: 6,
  };
  let r = rnd(st, w.jab + w.hay + w.sweep + w.throw + w.wait);
  for (const k of ['jab', 'hay', 'sweep', 'throw', 'wait']) {
    if (r < w[k]) { if (k === 'wait') { g.cool = 4 + rnd(st, 12); g.guard = rnd(st, 2) ? 14 : 0; } else startG(st, k); return; }
    r -= w[k];
  }
}

/** Advance one frame with this frame's input mask. Returns the state (mutated). st.ev holds this frame's events. */
export function stepFight(st, mask) {
  st.ev = [];
  mask = (mask | 0) & 255;
  if (st.phase === 'over') return st;
  if (st.phase === 'intro') {
    st.f++; st.prev = mask;
    if (st.f === RIP_AT) st.ev.push({ k: 'rip' }); // the vest and bow tie come off (cosmetic)
    if (st.f >= INTRO) { st.phase = 'fight'; st.ev.push({ k: 'fight' }); }
    return st;
  }
  if (st.phase === 'finish') {
    stepP(st, mask); separate(st);
    st.prev = mask; st.f++;
    if (st.phase === 'over') return st;
    if (--st.finishLeft <= 0) { // he shakes it off
      st.phase = 'fight'; st.g.st = 'idle'; st.g.hp = 80; st.g.cool = 10; st.ev.push({ k: 'recover' });
    }
    return st;
  }
  stepP(st, mask);
  if (st.phase === 'fight') stepG(st);
  separate(st);
  st.prev = mask; st.f++;
  if (st.phase !== 'fight') return st;
  if (st.p.hp <= 0) { st.phase = 'over'; st.result = 'lose'; st.ev.push({ k: 'ko', who: 'p' }); return st; }
  if (--st.clock <= 0) { st.phase = 'over'; st.result = 'lose'; st.ev.push({ k: 'time' }); }
  return st;
}

// ----- input logs: [[frame, mask], ...] whenever the held buttons change, plus the total frame count -----
export const LOG_MAX = 8000;
/** Check a log's shape. Returns an error string or null. */
export function checkLog(log, frames) {
  if (!Array.isArray(log) || log.length > LOG_MAX) return 'bad log';
  if (!Number.isInteger(frames) || frames < 0 || frames > MAX_FRAMES) return 'bad frame count';
  let last = -1;
  for (const e of log) {
    if (!Array.isArray(e) || e.length !== 2) return 'bad entry';
    const [f, m] = e;
    if (!Number.isInteger(f) || f <= last || f >= frames + 1 || !Number.isInteger(m) || m < 0 || m > 255) return 'bad entry';
    last = f;
  }
  // humans can't change buttons more than ~25 times a second: cap changes in any 1-second window
  for (let i = 0, j = 0; i < log.length; i++) { while (log[i][0] - log[j][0] >= FPS) j++; if (i - j + 1 > 40) return 'inhuman input rate'; }
  return null;
}
/** Re-run a whole fight. Returns { result: 'win'|'lose', frame, state }. A log that stops early, before a KO or the clock, is a loss. */
export function simulate(seed, log, frames) {
  const st = createFight(seed);
  let k = 0, mask = 0;
  for (let f = 0; f < frames && st.phase !== 'over'; f++) {
    while (k < log.length && log[k][0] === f) { mask = log[k][1]; k++; }
    stepFight(st, mask);
  }
  return { result: st.result === 'win' ? 'win' : 'lose', frame: st.f, state: st };
}
/** Records inputs as a change log while you play. */
export function recorder() {
  const log = []; let last = 0;
  return { log, push(f, mask) { if (mask !== last || (f === 0 && mask)) { log.push([f, mask]); last = mask; } } };
}

/** Typed in the speech-bubble box, this phrase opens a no-money practice fight instead of posting (client), and is
 * never posted as a bubble (server). Any case; spaces around and between the words don't matter. */
export const isPracticePhrase = (t) => typeof t === 'string' && t.trim().replace(/\s+/g, ' ').toLowerCase() === 'practice fight';
