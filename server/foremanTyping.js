// Extra-mad Foreman typing test: you saw the Heeshee Mazode and bailed before it took your bug.
// The prompt, speed, and accuracy are checked on the server. The client cannot send a fake elapsed time;
// an attempt starts only when the server stamps attemptStartedAt. A compact input-event trace has to
// match the text (enough single-character inserts, no one big dump) or the attempt is rejected.
export const TYPING_PROMPTS = [
  'Tyler Clark Roberts is number one. His legs are number one. His eyes are number one. His muscles are number one. Tyler is number one.',
  'Tyler Clark Roberts is number one. His heart is number one. His stare is number one. His backbone is number one. Tyler is number one.',
  'Tyler Clark Roberts is number one. His pulse is number one. His voice is number one. His own word is number one. Tyler is number one.',
  'Tyler Clark Roberts is number one. His eyes are number one. His heart is number one. His raw grit is number one. Tyler is number one.',
  'Tyler Clark Roberts is number one. His stare is number one. His legs are number one. His own word is number one. Tyler is number one.',
  'Tyler Clark Roberts is number one. His voice is number one. His pulse is number one. His backbone is number one. Tyler is number one.',
  'Tyler Clark Roberts is number one. His heart is number one. His eyes are number one. His raw grit is number one. Tyler is number one.',
  'Tyler Clark Roberts is number one. His legs are number one. His voice is number one. His own word is number one. Tyler is number one.',
];
export const TYPING_PROMPT = TYPING_PROMPTS[0];
export const TYPING_WPM = 80;
/**
 * Temporary phone pace (t606u, Nov 2026): on a phone the test needs MOBILE_TYPING_WPM instead of TYPING_WPM until
 * MOBILE_TYPING_UNTIL (8 PM MST Nov 27 2026), then everyone is back to 80 with no deploy. The env var
 * MOBILE_TYPING_UNTIL (an ISO time or epoch ms; 'off' or 0 ends it now) overrides the date.
 */
export const MOBILE_TYPING_WPM = 35;
export const MOBILE_TYPING_UNTIL = Date.parse('2026-11-28T03:00:00Z');
const PHONE_UA = /\b(iPhone|iPod|Android.+Mobile|Mobile Safari|Windows Phone|IEMobile|BlackBerry|BB10|webOS|Opera Mini)\b/i;
/**
 * A phone, decided on the server from the request: the Sec-CH-UA-Mobile client hint (Chromium on Android sends
 * "?1") or a phone User-Agent (iPhone, Android "Mobile", ...). Tablets and desktops are not phones. The client
 * sends nothing for this, so a page tweak cannot flip it; faking a whole User-Agent can, which is fine for a
 * friendlier pace in a joke test.
 */
export function isPhoneRequest({ ua = '', chMobile = '' } = {}) {
  if (String(chMobile).trim() === '?1') return true;
  return PHONE_UA.test(String(ua));
}
/** `until` from MOBILE_TYPING_UNTIL: unset uses the built-in date; 'off'/'0' turns the phone pace off. */
export function mobileTypingUntil(env) {
  const raw = env == null ? '' : String(env).trim();
  if (!raw) return MOBILE_TYPING_UNTIL;
  if (/^(off|false|no|0)$/i.test(raw)) return 0;
  const n = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw);
  return Number.isFinite(n) ? n : MOBILE_TYPING_UNTIL;
}
/** The speed this player needs right now: 35 on a phone before `until`, else 80. */
export function typingPace({ phone = false, now = Date.now(), until = MOBILE_TYPING_UNTIL } = {}) {
  if (phone && now < until) return { wpm: MOBILE_TYPING_WPM, phone: true, until };
  return { wpm: TYPING_WPM, phone: false };
}
export const TYPING_ACCURACY = 0.95;
/** Matches client/src/mines/heeshee.js APPEAR_AFTER_MS: after this, the Heeshee is in the tunnels. */
export const HEESHEE_APPEAR_MS = 5000;
/** World-class burst pace. Anything faster is treated as a paste, not typing. */
export const TYPING_MAX_WPM = 200;
/** Largest single insert the server will accept as typing. Bigger is a dump. */
export const TYPING_MAX_INSERT = 2;
/** Insert events must be at least this fraction of the submitted text length. */
export const TYPING_TRACE_MIN = 0.9;
/** Keep this many start/submit rows in foreman.json after passes. */
export const TYPING_LOG_MAX = 2000;

export const TYPING_BLOCKED_INPUT = new Set([
  'insertFromPaste',
  'insertReplacementText',
  'insertFromDrop',
  'insertFromYank',
  'insertFromPasteAsQuotation',
]);

export const TYPING_RANTS = [
  [
    'YOU SAW IT. YOU SAW THE HEESHEE MAZODE. AND YOU RAN.',
    'Dad-gummit, that thing was reachin\' for your bug and you clocked out like a TOURIST!',
    'I don\'t run a gift shop for cowards, biscuit britches!',
    'Now you type. Eighty words a minute. Ninety-five percent. And you will MEAN every word.',
  ],
  [
    'HOLD IT. You peeked at the Heeshee Mazode and bailed before it took your bug.',
    'Great jumpin\' goose grease, I have seen mules with more STICKIN\' POWER!',
    'Dagnabbit, that bug was countin\' on you, and you left it as a SNACK!',
    'Type this. Fast. Clean. The Foreman is EXTRA mad, and extra mad don\'t take shortcuts.',
  ],
  [
    'Well fry my suspenders, you ducked the Heeshee Mazode mid-grab!',
    'Son of a biscuit-eatin\' hog, that is the oldest trick in a SHORT book!',
    'You don\'t get to see that thing and then stroll out with your bug still in your POCKET.',
    'Sit down. Type. Eighty a minute, ninety-five percent, or you don\'t go back DOWN.',
  ],
];

export const TYPING_JABS = {
  speed: 'TOO SLOW, sport. Eighty words a minute. These fingers look like they mine MUD.',
  speedPhone: 'TOO SLOW, sport. Thirty-five a minute on that pocket phone. I am being GENEROUS today.',
  accuracy: 'Dagnabbit, that was sloppy. Ninety-five percent or it don\'t count. Start over.',
  short: 'That ain\'t the whole thing. I said EVERY word. Try again.',
  early: 'Nice try, paste-hands. You type it. You don\'t dump it. Start over.',
  keys: 'Those keystrokes don\'t add up, sport. Type every letter. No dumps, no tricks. Start over.',
};

export const TYPING_PRAISE = 'WELL I\'LL BE. You can type and you meant it. Get back down there, and don\'t run next time.';

export function pickTypingPrompt(randInt) {
  const n = TYPING_PROMPTS.length;
  const i = Math.max(0, Number(randInt?.(n)) || 0) % n;
  return { prompt: TYPING_PROMPTS[i], promptIndex: i };
}

export function minTypingMs(prompt = TYPING_PROMPT) {
  const words = String(prompt).length / 5;
  return Math.ceil((words / TYPING_MAX_WPM) * 60_000);
}

export function levenshtein(a, b) {
  const s = String(a ?? ''), t = String(b ?? '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const tmp = prev[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + cost);
      last = tmp;
    }
  }
  return prev[t.length];
}

export function typingStats(text, elapsedMs, prompt = TYPING_PROMPT, needWpm = TYPING_WPM) {
  const typed = String(text ?? '');
  const elapsed = Number(elapsedMs);
  const dist = levenshtein(typed, prompt);
  const denom = Math.max(typed.length, prompt.length, 1);
  const accuracy = 1 - dist / denom;
  const wpm = elapsed > 0 ? (typed.length / 5) / (elapsed / 60_000) : 0;
  if (!Number.isFinite(elapsed) || elapsed < minTypingMs(prompt)) {
    return { wpm, accuracy, passed: false, fail: 'early' };
  }
  if (typed.length < Math.ceil(prompt.length * TYPING_ACCURACY)) {
    return { wpm, accuracy, passed: false, fail: 'short' };
  }
  if (accuracy < TYPING_ACCURACY) return { wpm, accuracy, passed: false, fail: 'accuracy' };
  if (wpm < needWpm) return { wpm, accuracy, passed: false, fail: 'speed' };
  return { wpm, accuracy, passed: true, fail: null };
}

export function publicTypingStats(stats) {
  return {
    wpm: Math.round((stats.wpm || 0) * 10) / 10,
    accuracy: Math.round((stats.accuracy || 0) * 1000) / 1000,
    passed: !!stats.passed,
    ...(stats.fail ? { fail: stats.fail } : {}),
  };
}

export function shouldBlockTypingInput(inputType, data) {
  const type = String(inputType || '');
  if (TYPING_BLOCKED_INPUT.has(type)) return true;
  if (type.startsWith('insert') && String(data ?? '').length > TYPING_MAX_INSERT) return true;
  return false;
}

export function emptyTypingTrace() {
  return { inserts: 0, chars: 0, deletes: 0, maxInsert: 0, blocked: 0, firstMs: 0, lastMs: 0, comp: '' };
}
/** A composition (Android keyboards, some iOS ones) ended: the next insertCompositionText starts a new word. */
export function endTypingComposition(trace) { if (trace) trace.comp = ''; }

/** Honest one-character-at-a-time trace for tests and for a client that already typed `text`. */
export function typingTraceFor(text, { deletes = 0, maxInsert = 1, spanMs = 8_000 } = {}) {
  const typed = String(text ?? '');
  return {
    inserts: typed.length + deletes,
    chars: typed.length + deletes,
    deletes,
    maxInsert,
    firstMs: 1,
    lastMs: 1 + Math.max(0, spanMs),
  };
}

export function recordTypingInput(trace, inputType, data, now = Date.now()) {
  const type = String(inputType || '');
  const chunk = String(data ?? '');
  // Phone keyboards that compose (Gboard, Samsung, ...) re-send the whole word so far with every key:
  // "T", "Ty", "Tyl"... Only the new letters are typing, so count the growth, a shrink as a delete. A jump
  // bigger than TYPING_MAX_INSERT (a tapped suggestion) is a dump, the same as any other. The browser
  // cannot cancel these, so nothing is prevented; the dump just does not count as keystrokes.
  if (type === 'insertCompositionText') {
    const prev = String(trace.comp || '');
    trace.comp = chunk;
    if (!trace.firstMs) trace.firstMs = now;
    trace.lastMs = now;
    if (chunk.startsWith(prev) && chunk.length > prev.length) {
      const size = chunk.length - prev.length;
      if (size > TYPING_MAX_INSERT) { trace.blocked = (trace.blocked || 0) + 1; return { blocked: false, dumped: true }; }
      trace.inserts += 1; trace.chars += size; if (size > trace.maxInsert) trace.maxInsert = size;
    } else if (prev.startsWith(chunk) && chunk.length < prev.length) {
      trace.deletes += 1;
    } else if (chunk !== prev) {
      // Rewritten in place (autocorrect inside the composition): not typing.
      trace.blocked = (trace.blocked || 0) + 1; return { blocked: false, dumped: true };
    }
    return { blocked: false };
  }
  if (shouldBlockTypingInput(type, chunk)) {
    trace.blocked = (trace.blocked || 0) + 1;
    return { blocked: true };
  }
  if (!trace.firstMs) trace.firstMs = now;
  trace.lastMs = now;
  if (type.startsWith('insert')) {
    if (!chunk.length && (type === 'insertParagraph' || type === 'insertLineBreak')) return { blocked: false };
    const size = chunk.length || 1;
    trace.inserts += 1;
    trace.chars += size;
    if (size > trace.maxInsert) trace.maxInsert = size;
  } else if (type.startsWith('delete')) {
    trace.deletes += 1;
  }
  return { blocked: false };
}

export function publicTypingTrace(trace) {
  const t = trace || emptyTypingTrace();
  return {
    inserts: t.inserts | 0,
    chars: t.chars | 0,
    deletes: t.deletes | 0,
    maxInsert: t.maxInsert | 0,
    firstMs: t.firstMs || 0,
    lastMs: t.lastMs || 0,
  };
}

export function verifyTypingTrace(text, trace) {
  const typed = String(text ?? '');
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) {
    return { ok: false, fail: 'keys' };
  }
  const inserts = Number(trace.inserts);
  const chars = Number(trace.chars);
  const deletes = Number(trace.deletes);
  const maxInsert = Number(trace.maxInsert);
  if (![inserts, chars, maxInsert].every(Number.isFinite) || inserts < 0 || chars < 0 || maxInsert < 0) {
    return { ok: false, fail: 'keys' };
  }
  if (Number.isFinite(deletes) && deletes < 0) return { ok: false, fail: 'keys' };
  if (maxInsert > TYPING_MAX_INSERT) return { ok: false, fail: 'keys' };
  if (inserts < Math.ceil(typed.length * TYPING_TRACE_MIN)) return { ok: false, fail: 'keys' };
  if (chars < typed.length) return { ok: false, fail: 'keys' };
  return { ok: true, fail: null };
}
