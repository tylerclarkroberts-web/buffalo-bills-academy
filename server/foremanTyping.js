// Extra-mad Foreman typing test: you saw the Heeshee Mazode and bailed before it took your bug.
// The prompt, speed, and accuracy are checked on the server. The client cannot send a fake elapsed time;
// an attempt starts only when the server stamps attemptStartedAt.
export const TYPING_PROMPT = 'Tyler Clark Roberts is number one. His legs are number one. His eyes are number one. His muscles are number one. Tyler is number one.';
export const TYPING_WPM = 80;
export const TYPING_ACCURACY = 0.95;
/** Matches client/src/mines/heeshee.js APPEAR_AFTER_MS: after this, the Heeshee is in the tunnels. */
export const HEESHEE_APPEAR_MS = 5000;
/** World-class burst pace. Anything faster is treated as a paste, not typing. */
export const TYPING_MAX_WPM = 200;

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
  accuracy: 'Dagnabbit, that was sloppy. Ninety-five percent or it don\'t count. Start over.',
  short: 'That ain\'t the whole thing. I said EVERY word. Try again.',
  early: 'Nice try, paste-hands. You type it. You don\'t dump it. Start over.',
};

export const TYPING_PRAISE = 'WELL I\'LL BE. You can type and you meant it. Get back down there, and don\'t run next time.';

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

export function typingStats(text, elapsedMs, prompt = TYPING_PROMPT) {
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
  if (wpm < TYPING_WPM) return { wpm, accuracy, passed: false, fail: 'speed' };
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
