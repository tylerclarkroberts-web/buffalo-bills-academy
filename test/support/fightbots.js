// Scripted players for the Guntrad fight. They read the simulation state (like a player reading the
// screen) and return the buttons to hold this frame. `reaction` = frames before they notice his move,
// `jitter` = how many frames off their combo timing can be, `slip` = % chance of a wrong guess.
import { BTN, GMOVES, PMOVES, COMBO_BREAK, createFight, stepFight, recorder } from '../../server/engine/fight.js';

export function makeBot({ reaction = 1, jitter = 0, slip = 0, maxCombo = COMBO_BREAK - 1, seed = 1 } = {}) {
  let r = seed >>> 0 || 1;
  const rand = (n) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 8) % n; };
  const mem = { seenAt: -1, seenMove: null, guess: null, next: null, cancelAt: -1, release: false, punishAt: -1 };
  return function bot(st) {
    const { p, g } = st; const d = Math.abs(g.x - p.x);
    if (st.phase === 'intro') return 0;
    if (st.phase === 'finish') return (st.f % 4 === 0) ? BTN.P : 0;
    // mid-combo: cancel into the next hit at the right moment
    if (p.st === 'atk' && p.hitAt >= 0 && g.st === 'hit') {
      const n = st.combo.n;
      if (mem.cancelAt < 0 || mem.cancelFor !== p.hitAt) {
        mem.cancelFor = p.hitAt;
        // the window for the next hit is [hit+3, last frame its active part still lands in his hitstun]
        const S = g.stun + (st.f - p.hitAt); // his hitstun counted from the hit frame
        const lastFor = (mv) => p.hitAt + S - PMOVES[mv].su;
        const special = p.meter >= 100 && (n >= 8 || n >= maxCombo);
        const first = p.hitAt + 3;
        const aim = (mv) => { const L = Math.max(0, lastFor(mv) - first); const off = jitter ? rand(2 * jitter + 1) - jitter : 0; return first + Math.round(L * (jitter ? 0.4 : 0)) + off; };
        const stunLeftAt = (mv) => lastFor(mv) - mem.cancelAt;
        mem.cancelAt = first;
        let pick = special ? 'S' : d <= PMOVES.jab.rg - 4 ? 'P' : d <= PMOVES.kick.rg - 4 ? 'K' : null;
        if (pick === 'K' && stunLeftAt('kick') < 0) pick = null;
        if (pick === 'P' && stunLeftAt('jab') < 0) pick = d <= PMOVES.kick.rg - 4 && stunLeftAt('kick') >= 0 ? 'K' : null;
        if (!special && n >= maxCombo) pick = p.meter >= 100 ? 'S' : null;
        mem.next = pick;
        mem.cancelAt = pick ? aim(pick === 'S' ? 'sp' : pick === 'P' ? 'jab' : 'kick') : -1;
        if (mem.cancelAt < first && pick) mem.cancelAt = Math.max(st.f, mem.cancelAt); // pressed too early: locked out, as a human would be
      }
      if (mem.next && st.f === mem.cancelAt) return mem.next === 'S' ? BTN.S : mem.next === 'P' ? BTN.P : BTN.K;
      return 0;
    }
    mem.cancelAt = -1;
    if (p.st !== 'idle' || p.y > 0) return 0;
    // he is mid-move: defend during the wind-up, punish during recovery
    if (g.st === 'atk') {
      const m = GMOVES[g.mv];
      if (mem.seenMove !== `${g.mv}:${st.f - g.mf}`) { mem.seenMove = `${g.mv}:${st.f - g.mf}`; mem.seenAt = st.f; mem.guess = rand(100) < slip ? ['jab', 'hay', 'sweep', 'throw', 'reach'][rand(5)] : g.mv; }
      const known = st.f - mem.seenAt >= reaction - 1;
      const recovering = g.mf >= m.su + m.ac;
      if (recovering) {
        const left = m.su + m.ac + m.re - g.mf;
        const toward = g.x > p.x ? BTN.R : BTN.L;
        if (d > 90 && left > Math.ceil((d - 90) / 5) + PMOVES.jab.su + 1) return toward; // walk in, then start the combo up close
        if (d <= PMOVES.jab.rg - 4 && left >= PMOVES.jab.su) return BTN.P;
        if (d <= PMOVES.kick.rg - 4 && left >= PMOVES.kick.su) return BTN.K;
        return 0;
      }
      if (!known) return 0;
      const mv = mem.guess === 'dash' || mem.guess === 'reach' ? 'jab' : mem.guess;
      if (mv === 'jab') return BTN.D;
      if (mv === 'hay') return BTN.B;
      if (mv === 'sweep') return BTN.D | BTN.B;
      if (mv === 'throw' || mv === 'thrust') return BTN.U;
      return 0;
    }
    if (g.st === 'down' || g.st === 'burst') return d > 160 ? (g.x > p.x ? BTN.R : BTN.L) : 0;
    // neutral: hang just outside his jab, let him come
    if (d > 175) return g.x > p.x ? BTN.R : BTN.L;
    return 0;
  };
}

/** A button-masher: random buttons every few frames, no reading. */
export function masher(seed = 7) {
  let r = seed >>> 0 || 1;
  const rand = (n) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return (r >>> 8) % n; };
  let cur = 0;
  return (st) => { if (st.f % 5 === 0) cur = [BTN.P, BTN.K, BTN.P | BTN.R, BTN.K | BTN.L, BTN.S, BTN.B, BTN.D | BTN.P, 0, BTN.U | BTN.K][rand(9)]; return st.f % 5 === 4 ? 0 : cur; };
}

/** Play a whole fight with a bot; returns { log, frames, result, state }. */
export function playBot(seed, bot) {
  const st = createFight(seed); const rec = recorder();
  while (st.phase !== 'over' && st.f < 20000) { const m = bot(st); rec.push(st.f, m); stepFight(st, m); }
  return { log: rec.log, frames: st.f, result: st.result, state: st };
}

/** A spammer: walks in and taps the same button over and over. */
export function spammer(btn = BTN.K, every = 8) {
  return (st) => { const d = Math.abs(st.g.x - st.p.x); const toward = st.g.x > st.p.x ? BTN.R : BTN.L; if (d > 120) return toward; return st.f % every < 2 ? btn : 0; };
}
