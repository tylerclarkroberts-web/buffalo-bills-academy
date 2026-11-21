// Pit Boss Brisk: an original floor manager who occasionally walks a player-dealer's table.
// Flavor only — no penalties, no blocked play beyond a short overlay. He also hears chat
// and will call a player out by name for swearing, or for a phone (a hidden / stale tab).
import { cleanSay } from '../engine/game.js';

export const PIT_NAME = 'Brisk';
export const PIT_TITLE = 'Pit Boss';
export const PHONE_MS = 8000;
export const VISIT_MS = 5500;
export const APPROACH_MS = 1200;
export const LOOM_MS = 2200;
export const FIRST_VISIT_MIN = 25000;
export const FIRST_VISIT_SPAN = 45000;
export const NEXT_VISIT_MIN = 40000;
export const NEXT_VISIT_SPAN = 80000;
export const MAX_VISITS = 4;

export const LINES = [
  'Count it again.',
  'Why is table 3 slow?',
  'Hands where the camera can see them.',
  'Keep the game moving.',
  'I want a clean count.',
];
export const SWEAR_LINE = (name) => `${name}. Language.`;
export const PHONE_LINE = (name) => `${name}. Put the phone away.`;
export const BIG_TIP_LINE = "That's a handsome tip.";

// Word-boundary list: short enough to test, long enough to catch a real outburst.
const SWEARS = /\b(fuck(?:er|ing|ed)?|shit(?:ty|head)?|asshole|bitch(?:es)?|bastard|damn(?:ed)?|crap(?:py)?|piss(?:ed)?|dickhead)\b/i;
export function hasProfanity(text) {
  return SWEARS.test(String(text || ''));
}

export function schedulePit(t, now, rng) {
  if (t.house?.mode !== 'player' || !t.house.id || t.settings?.continuous) return;
  const max = 2 + (typeof rng === 'function' ? rng(3) : 2); // 2–4 visits
  t.pit = {
    name: PIT_NAME,
    visits: 0,
    max: Math.min(MAX_VISITS, max),
    nextAt: now + FIRST_VISIT_MIN + (typeof rng === 'function' ? rng(FIRST_VISIT_SPAN) : FIRST_VISIT_SPAN / 2),
    visit: null,
    lastPhone: {},
  };
}

function startVisit(t, now, { line, target, kind, loom = true }) {
  t.pit ||= { name: PIT_NAME, visits: 0, max: MAX_VISITS, nextAt: now + NEXT_VISIT_MIN, visit: null, lastPhone: {} };
  t.pit.visit = {
    kind: kind || 'check',
    line,
    target: target || null,
    targetName: target?.name || null,
    at: now,
    until: now + VISIT_MS,
    loomUntil: loom ? now + APPROACH_MS + LOOM_MS : now + APPROACH_MS,
    approachUntil: now + APPROACH_MS,
  };
  t.pit.visits = (t.pit.visits || 0) + 1;
}

export function tickPit(t, now, rng, { lastViews } = {}) {
  if (t.house?.mode !== 'player' || !t.house.id || t.status !== 'playing') {
    if (t.pit?.visit && now >= t.pit.visit.until) t.pit.visit = null;
    return t.pit?.visit || null;
  }
  if (!t.pit) schedulePit(t, now, rng);
  const pit = t.pit;
  if (pit.visit && now >= pit.visit.until) pit.visit = null;
  if (pit.visit) return pit.visit;

  // A seated player whose tab has been hidden / stale: call them out, at most once in a while.
  const views = lastViews || t.houseViews || {};
  for (const s of t.seats || []) {
    if (!s || s.left || s.bot || s.id === t.house.id) continue;
    const seen = views[s.id] || 0;
    if (seen && now - seen >= PHONE_MS && now - (pit.lastPhone[s.id] || 0) > NEXT_VISIT_MIN) {
      pit.lastPhone[s.id] = now;
      startVisit(t, now, { line: PHONE_LINE(s.name), target: { id: s.id, name: s.name }, kind: 'phone' });
      return pit.visit;
    }
  }

  if (pit.visits >= pit.max) return null;
  if (now < (pit.nextAt || 0)) return null;
  const line = LINES[typeof rng === 'function' ? rng(LINES.length) : now % LINES.length];
  startVisit(t, now, { line, kind: 'check' });
  pit.nextAt = now + NEXT_VISIT_MIN + (typeof rng === 'function' ? rng(NEXT_VISIT_SPAN) : NEXT_VISIT_SPAN / 2);
  return pit.visit;
}

/** Chat hook: if the line has profanity, Brisk walks over and names them. Flavor only. */
export function hearSay(t, player, text, now) {
  const clean = cleanSay(text);
  if (!hasProfanity(clean)) return { text: clean, warned: false };
  startVisit(t, now, { line: SWEAR_LINE(player.name), target: { id: player.id, name: player.name }, kind: 'swear', loom: true });
  return { text: clean, warned: true };
}

export function remarkBigTip(t, now) {
  startVisit(t, now, { line: BIG_TIP_LINE, kind: 'tip', loom: false });
}

export function pitView(t, now) {
  const v = t.pit?.visit;
  if (!v || now >= v.until) return null;
  const age = now - v.at;
  const state = now < v.approachUntil ? 'approach' : now < v.loomUntil ? 'loom' : now < v.until - 900 ? 'talk' : 'leave';
  return {
    name: PIT_NAME,
    title: PIT_TITLE,
    line: v.line,
    target: v.target || null,
    targetName: v.targetName || null,
    kind: v.kind,
    state,
    at: v.at,
    until: v.until,
    loom: state === 'loom' || (state === 'talk' && v.kind !== 'tip'),
    t: age,
  };
}
