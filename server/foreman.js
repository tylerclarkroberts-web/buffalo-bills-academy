// v45: the Foreman. Leave the mines with no acid (clock out early, or a shift of nothing but mud) and he storms in:
// a short visual-novel rant, then a mental-arithmetic problem. The server holds the problem and its answer, so the
// client cannot skip it: until you answer right you cannot clock in again (Mines.start checks pending()).
// Rule (keep it light): a wrong answer gets a fresh jab and a new problem, no money lost. Right on the first try
// pays a $5 "can count" bonus, at most 3 times an hour; right after a miss pays nothing. No timer.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';

export const BONUS = 5, BONUS_PER_HOUR = 3;
// Farmer swears only. test/foreman.test.js checks every line against a list of real profanity.
// v48: a scene is 4..20 lines drawn without repeats from three beats: an OPENER (by reason), the ESCALATION /
// tirade, then a WIND-DOWN closer that always leads into the math question. Length is weighted: short 4-6 (40%),
// medium 7-12 (35%), long 13-20 (25%), so sometimes it's a quick rant and sometimes a long tirade.
export const RANTS = {
  quit: [
    ['WELL DAD-GUMMIT!', 'You clocked out with an EMPTY bucket?!'],
    ['Son of a biscuit-eatin\' hog!', 'Not one drop of acid. NOT ONE.'],
    ['Cow-patties and horse apples!', 'I\'ve seen fence posts dig harder than you.'],
    ['Dagnabbit, you sorry sack of feed corn!', 'You walk outta MY mine with NOTHIN\'?'],
    ['Great jumpin\' goose grease!', 'The acid was RIGHT THERE, you turnip!'],
    ['HOLD IT RIGHT THERE, PARTNER.', 'Where do you think you\'re goin\' with that dry bucket?'],
    ['Well butter my biscuit and call it Tuesday!', 'You\'re QUITTIN\'? With NO ACID?'],
    ['Jumpin\' Jehoshaphat!', 'Is that bucket empty or am I goin\' blind?'],
  ],
  mud: [
    ['MUD?! You brought me MUD?!', 'Dad-gummit, I can get mud off my boots for free!'],
    ['Horse apples!', 'That bucket is ninety percent puddle, ten percent shame.'],
    ['Son of a biscuit-eatin\' hog!', 'I paid you ten dollars for DIRT WATER.'],
    ['Is that... is that a PUDDLE?', 'You hauled a puddle up a mine shaft. On PURPOSE.'],
    ['Cheese and crackers!', 'That ain\'t acid, that\'s pig-wallow soup!'],
  ],
};
export const ESCALATION = [
  'Do you know what acid costs down in Wendover? DO YOU?',
  'I got a tiki bar in Wendover waitin\' on this acid. A TIKI BAR.',
  'Them little umbrella drinks don\'t make themselves, sport!',
  'My cousin Earl runs that tiki bar and he\'s gonna call me. AGAIN.',
  'Earl\'s gonna say "where\'s my acid, Dale?" And what do I tell him? Hmm?!',
  'I been foreman of this hole for thirty-one years.',
  'Thirty-one YEARS and never once did a miner come up DRY.',
  'Well, once. Gary. And you know what happened to Gary?',
  'Neither do I! He went to Wendover and never came back!',
  'I seen chickens with more grit than you.',
  'I seen a SCARECROW pull more acid outta this mine than you.',
  'My mule Petunia could do this job. Petunia\'s got ONE good leg!',
  'You got hands, don\'t ya? Two of \'em? Then USE \'EM!',
  'Dag-nab-it, I\'m so mad I could spit a fence post!',
  'My blood pressure is higher than a silo, you hear me?!',
  'Doc says I gotta stay calm. DOES THIS LOOK CALM TO YOU?!',
  'I\'m gonna kick this bucket clear to Elko!',
  'You know what I had for breakfast? DISAPPOINTMENT. And grits.',
  'The acid don\'t walk itself up the shaft, sugar britches!',
  'Shoot fire and save matches, I can\'t BELIEVE this!',
  'My granny dug acid with a SPOON. In a SNOWSTORM. Uphill!',
  'I got quotas! I got QUOTAS, son!',
  'Them Wendover tourists are gonna be sippin\' plain pineapple juice. Plain!',
  'You ever see a tiki torch with no acid in it? Sad. SAD.',
  'The hula girls on the sign are gonna cry. They\'re painted on and they\'re gonna CRY.',
  'Corn-fed, corn-raised, and dumber than a sack of corn!',
  'I oughta sell you to the county fair as a turnip.',
  'Hog-tied and hornswoggled, that\'s what I am!',
  'This here mine has a NAME, and the name is ACID Mines! Not MUD Mines!',
  'You think I hired you for your good looks? HA!',
  'I\'m gonna have to tell the Barn about this. The cows\'ll laugh.',
  'Even the goats down at the Barn are lookin\' at you funny.',
  'Fiddlesticks and fertilizer, I\'m about to pop my overalls!',
  'I\'m so hot under the hard hat I could fry an egg on it.',
  'Don\'t you look at me with them sad cow eyes!',
  'Rattlesnakes and rhubarb, this is the WORST shift all week!',
  'Go on, tell me the acid was hidin\'. I DARE ya.',
  'Every bucket you don\'t fill, a tiki drink goes un-glowin\'.',
];
export const CLOSERS = [
  'Now. Before you set ONE muddy boot back in my mine, you\'re doin\' some figurin\'.',
  'Company rule: no acid, no clock-in, till you prove you can count. Sit DOWN.',
  'I don\'t pay folks who can\'t add. Let\'s see what\'s rattlin\' in that pumpkin head.',
  'Alright. Deep breath, Dale. ...Now you\'re gonna do some arithmetic for me.',
  'Here\'s the deal: you solve this, you go back down. You don\'t, you sit here with me.',
  'Earl taught me this one. Let\'s see if you\'re smarter than a tiki bartender.',
  'Fine. FINE. Pencil down, brain on. Figure THIS, smart britches.',
  'I\'ll let you back in when you show me there\'s somethin\' between them ears.',
  'One question. Get it right and maybe I won\'t call Wendover.',
  'Sit on that bucket and do your sums, sport.',
];
export const SHORT = [4, 6], MED = [7, 12], LONG = [13, 20];
/** Scene length: weighted short 40% / medium 35% / long 25%. */
export function sceneLength(r) {
  const w = r(100), [lo, hi] = w < 40 ? SHORT : w < 75 ? MED : LONG;
  return lo + r(hi - lo + 1);
}
function shuffled(a, r) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = r(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; }
/** The lines of one scene: opener pair (reason), escalation without repeats, closer last. No line twice. */
export function makeScene(reason, r) {
  const n = sceneLength(r), open = pick(RANTS[reason] || RANTS.quit, r);
  const head = n >= 5 ? open : [open[0]];
  const mid = shuffled(ESCALATION, r).slice(0, n - head.length - 1);
  return [...head, ...mid, pick(CLOSERS, r)];
}
export const JABS = [
  'WRONG! Dagnabbit, my mule does better sums!',
  'Cow-patties! Not even close. Try THIS one, sport.',
  'Horse apples! Did you count on your fingers AND miss?',
  'Son of a biscuit-eatin\' hog, that ain\'t it! Another!',
  'You sorry sack of feed corn. Fresh one. Go.',
];
export const PRAISE = ['...Huh. Right. Fine. Get back to work.', 'Well I\'ll be. You CAN count. Don\'t let it go to your head.'];

const pick = (a, r) => a[r(a.length)];
/** v48: a "bit harder" problem, roughly 15-45 s of mental math. Integer answers only; the server keeps the answer. */
const K = (r, lo, hi) => lo + r(hi - lo + 1);
export const GENERATORS = {
  mulAdd: (r) => { const a = K(r, 6, 12), b = K(r, 6, 9), c = K(r, 11, 49); return { text: `${a} × ${b} + ${c}`, answer: a * b + c }; },
  sumMul: (r) => { const a = K(r, 6, 19), b = K(r, 6, 19), c = K(r, 3, 7); return { text: `(${a} + ${b}) × ${c}`, answer: (a + b) * c }; },
  mulSub: (r) => { const a = K(r, 12, 49), b = K(r, 3, 8), c = K(r, 5, Math.min(40, a * b - 1)); return { text: `${a} × ${b} − ${c}`, answer: a * b - c }; },
  percent: (r) => { const [p, base] = pick([[10, 10], [20, 5], [25, 4], [50, 2], [75, 4], [30, 10], [40, 5]], r); const n = base * K(r, 3, 24); return { text: `${p}% of ${n}`, answer: (p * n) / 100 }; },
  fraction: (r) => { const d = pick([3, 4, 5, 6, 8], r), m = K(r, 1, d - 1), n = d * K(r, 4, 15); return { text: `${m}/${d} of ${n}`, answer: (m * n) / d }; },
  eggs: (r) => { const a = K(r, 4, 9), b = 12, c = K(r, 7, 30); return { text: `I got ${a} crates of a dozen eggs. The coyote ate ${c}. How many eggs left?`, answer: a * b - c }; },
  feed: (r) => { const p = K(r, 4, 9), k = K(r, 3, Math.floor(99 / p)); return { text: `Feed's $${p} a sack. You buy ${k} sacks and pay with $100. What's your change?`, answer: 100 - p * k }; },
  mules: (r) => { const m = K(r, 3, 6), b = K(r, 13, 29), x = K(r, 5, 25); return { text: `${m} mules haul ${b} buckets each, then Earl brings ${x} more. How many buckets?`, answer: m * b + x }; },
};
export function makeProblem(r = (n) => crypto.randomInt(n)) {
  const keys = Object.keys(GENERATORS), kind = keys[r(keys.length)];
  return { kind, ...GENERATORS[kind](r) };
}
const textOf = (p) => p.text || `${p.a} ${p.op} ${p.b}`; // pre-v48 pending problems kept a/op/b
const publicProblem = (p) => ({ text: textOf(p), word: textOf(p).length > 24 });

export class Foreman {
  constructor({ store, accounts, now, randInt }) {
    this.store = store; this.accounts = accounts; this.now = now; this.r = randInt || ((n) => crypto.randomInt(n));
    this.doc = store.loadDoc('foreman', { pending: {}, bonuses: {} });
  }
  save() { this.store.saveDoc('foreman', this.doc); }
  pending(playerId) { return this.doc.pending[playerId] || null; }
  /** Start a lecture (reason 'quit' or 'mud'). If one is already waiting, keep it (same problem). */
  scold(playerId, reason) {
    if (this.doc.pending[playerId]) return this.view(playerId);
    const lines = makeScene(reason, this.r);
    this.doc.pending[playerId] = { id: crypto.randomBytes(9).toString('base64url'), reason, lines, problem: makeProblem(this.r), misses: 0, at: this.now() };
    this.save(); return this.view(playerId);
  }
  view(playerId) {
    const p = this.doc.pending[playerId]; if (!p) return { pending: null };
    return { pending: { id: p.id, reason: p.reason, lines: p.lines, problem: publicProblem(p.problem), misses: p.misses } };
  }
  answer(player, id, raw) {
    const p = this.doc.pending[player.id];
    if (!p || p.id !== id) throw new GameError('The foreman is not waiting on you.', 409);
    const s = String(raw ?? '').trim();
    if (!/^-?\d{1,6}$/.test(s)) throw new GameError('Numbers only, sport.', 400);
    if (Number(s) !== p.problem.answer) {
      p.misses += 1; p.problem = makeProblem(this.r); this.save();
      return { correct: false, jab: pick(JABS, this.r), problem: publicProblem(p.problem), misses: p.misses };
    }
    delete this.doc.pending[player.id];
    const now = this.now(); const recent = (this.doc.bonuses[player.id] || []).filter((t) => now - t < 3600e3);
    let bonus = 0;
    if (p.misses === 0 && recent.length < BONUS_PER_HOUR) { bonus = BONUS; recent.push(now); this.accounts.change(player, BONUS, 'mine', 'Acid Mines: the foreman\'s "can count" bonus'); }
    this.doc.bonuses[player.id] = recent; this.save();
    return { correct: true, bonus, line: pick(PRAISE, this.r), misses: p.misses, bankroll: player.bankroll };
  }
  forget(playerId) { delete this.doc.pending[playerId]; delete this.doc.bonuses[playerId]; this.save(); }
}
