// v46 house edge: the main game (every rule combined) and each royal bet, plus the Guntrad floors and the joiner
// ratings/warnings. Pure; edge-table.json is made by scripts/bj-edge-table.mjs from the real engine.
//
// Main game: edge = base (Guntrad's Vegas rules) + the effect of every rule that differs. Each effect was simulated
// against the base with common random numbers (same shuffles), and several multi-rule combos were simulated directly
// to check that the effects add up (table.checks). All figures assume the bots' basic-strategy chart and flat bets,
// as a fraction of the initial bet. Insurance is declined by basic strategy, so offering it doesn't change the edge.
//
// Floors (Guntrad deals): the main game must keep a house edge of at least MAIN_FLOOR, and each royal bet that is on
// must keep at least ROYAL_FLOOR. Human-house tables may go below (generous), but joiners get the warning.
import TABLE from './edge-table.json' with { type: 'json' };
import { GUNTRAD_RULES, RULE_CHOICES, ROYAL, STEP, royalEv } from './rules.js';

export const MAIN_FLOOR = 0.001;   // ≥ +0.10%: Guntrad never deals a game players win over time, with a small margin over sim error
export const ROYAL_FLOOR = 0.02;   // ≥ 2% on each royal bet
export const ACK = { main: 0.02, side: 0.08 }; // joiners must tap "I understand" above these
export const MIX = { main: 10, side: 1 };      // "typical round": $10 main + $1 on each royal bet that is on

const LABEL = { s17: (v) => (v ? 'Dealer stands on soft 17' : 'Dealer hits soft 17'), bjPays: (v) => (v === 1.5 ? 'Blackjack pays 3:2' : 'Blackjack pays 6:5'),
  das: (v) => (v ? 'Double after split' : 'No double after split'), doubleOn: (v) => (v === 'any' ? 'Double on any two' : `Double on ${v} only`),
  maxHands: (v) => (v === 1 ? 'No splitting' : `Split up to ${v} hands`), resplitAces: (v) => (v ? 'Resplit aces' : 'No resplitting aces'),
  hitSplitAces: (v) => (v ? 'Hit split aces' : 'One card on split aces'), surrender: (v) => (v ? 'Late surrender' : 'No surrender'), insurance: (v) => (v ? 'Insurance offered' : 'No insurance') };

const SPLIT_ONLY = ['das', 'resplitAces', 'hitSplitAces'];
const ruleKey = (r) => Object.keys(RULE_CHOICES).map((k) => `${k}=${r[k]}`).join(',');
const cache = new Map();
/** Main-game house edge for a full rule set (cached by rule key). */
export function mainEdge(rules) {
  const r = { ...GUNTRAD_RULES, ...rules }; const key = ruleKey(r);
  if (cache.has(key)) return cache.get(key);
  let edge = TABLE.base, var_ = TABLE.baseSe ** 2; const parts = [];
  for (const k of Object.keys(RULE_CHOICES)) {
    if (r[k] === GUNTRAD_RULES[k]) continue;
    if (r.maxHands === 1 && SPLIT_ONLY.includes(k)) continue; // no splitting: these rules never come up
    const e = TABLE.effects[`${k}=${r[k]}`]; if (!e) continue;
    edge += e.effect; var_ += e.se ** 2; parts.push({ rule: k, label: LABEL[k](r[k]), effect: e.effect });
  }
  const out = { edge: +edge.toFixed(5), se: +Math.sqrt(var_).toFixed(5), parts, key };
  cache.set(key, out); return out;
}
/** Royal bet edge, or null when off. */
export const sideEdge = (bet, pays) => (pays?.on ? royalEv(bet, pays).edge : null);

/** Largest payout for one royal tier (STEP multiple, within its range) that keeps the bet at or above the floor. */
export function royalMaxPay(bet, tierKey, pays, floor = ROYAL_FLOOR) {
  const t = ROYAL[bet].tiers.find((x) => x.k === tierKey);
  for (let v = t.max; v >= t.min; v -= STEP) if (royalEv(bet, { ...pays, [tierKey]: v }).edge >= floor - 1e-12) return v;
  return null;
}
/** For the setup screen: every rule option with its edge, and (at Guntrad tables) whether it crosses the floor. */
export function ruleOptions(rules, guntrad) {
  const r = { ...GUNTRAD_RULES, ...rules }; const out = {};
  for (const [k, opts] of Object.entries(RULE_CHOICES)) {
    out[k] = opts.map((v) => { const e = mainEdge({ ...r, [k]: v }).edge; const blocked = guntrad && e < MAIN_FLOOR;
      return { value: v, edge: e, ...(blocked ? { blocked: `Guntrad won't deal it: the main game would favor players (house edge ${pctTxt(e)}).` } : {}) }; });
  }
  return out;
}
/** Problems with a Guntrad table's settings (empty = fine). */
export function guntradProblems(settings) {
  const out = []; const m = mainEdge(settings.rules);
  if (m.edge < MAIN_FLOOR) out.push(`These rules give players the edge in the main game (house edge ${pctTxt(m.edge)}). Guntrad needs at least ${pctTxt(MAIN_FLOOR)}.`);
  for (const [bet, def] of Object.entries(ROYAL)) {
    const e = sideEdge(bet, settings.royal?.[bet]);
    if (e !== null && e < ROYAL_FLOOR) out.push(`${def.name} pays too much (house edge ${pctTxt(e)}). Guntrad needs at least ${pctTxt(ROYAL_FLOOR)} on each royal bet.`);
  }
  return out;
}

export const pctTxt = (x) => `${x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(Math.abs(x) < 0.1 ? 2 : 1)}%`;
const cents = (x) => `$${(Math.round(x * 100) / 100).toFixed(2)}`;
/** good / fair / poor for the player, with a plain-language line. */
export function rate(kind, edge, name) {
  const [g, f] = kind === 'main' ? [0.005, 0.02] : [0.02, 0.08];
  const tone = edge <= g ? 'good' : edge <= f ? 'fair' : 'poor';
  const per10 = cents(Math.abs(edge) * 10);
  const text = edge < 0 ? `${name} favors players: you'd win about ${per10} of every $10 bet over time.`
    : tone === 'poor' ? `This table takes ${pctTxt(edge)} on ${name}, about ${per10} of every $10 bet.`
      : `${name}: the house keeps about ${per10} of every $10 bet.`;
  return { edge, tone, text };
}
/** Everything a joiner (or the creator) sees about a table's edge. */
export function edgeReport(settings, { grandfathered = false } = {}) {
  const m = mainEdge(settings.rules); const main = { ...rate('main', m.edge, 'the main game'), se: m.se, parts: m.parts };
  const side = {}; let wag = MIX.main, take = MIX.main * m.edge;
  for (const [bet, def] of Object.entries(ROYAL)) {
    const e = sideEdge(bet, settings.royal?.[bet]); if (e === null) continue;
    side[bet] = { name: def.name, ...rate('side', e, def.name) }; wag += MIX.side; take += MIX.side * e;
  }
  const total = { edge: +(take / wag).toFixed(5), take: +take.toFixed(3), wager: wag,
    text: `Typical round ($${MIX.main} main${Object.keys(side).length ? ` + $${MIX.side} on each royal bet` : ''}): the house expects ${take >= 0 ? 'to keep' : 'to lose'} about ${cents(Math.abs(take))} of $${wag}.` };
  const reasons = [];
  if (m.edge > ACK.main) reasons.push(`the main game takes ${pctTxt(m.edge)} (over ${pctTxt(ACK.main)})`);
  for (const s of Object.values(side)) if (s.edge > ACK.side) reasons.push(`${s.name} takes ${pctTxt(s.edge)} (over ${pctTxt(ACK.side)})`);
  const guntrad = settings.house === 'guntrad';
  const problems = guntrad ? guntradProblems(settings) : [];
  return { main, side, total, needsAck: reasons.length > 0, ackReasons: reasons, generous: m.edge < 0 || Object.values(side).some((s) => s.edge < 0),
    ...(grandfathered && problems.length ? { grandfathered: true, problems } : {}) };
}
export const EDGE_TABLE = TABLE;
