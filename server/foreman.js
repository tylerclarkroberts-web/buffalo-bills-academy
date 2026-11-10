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
    ['Well pickle my boots!', 'You brought that bucket back lighter than you took it DOWN!'],
    ['STOP them wanderin\' boots!', 'You ain\'t hauled a thing but yourself!'],
    ['Dad-blasted tumbleweeds!', 'An EMPTY bucket. You takin\' it out for exercise?'],
    ['Hold your horses and park the mule!', 'We ain\'t done discussin\' all this acid you DIDN\'T bring!'],
    ['Sweet corn on a fence rail!', 'You went down a miner and came up a TOURIST!'],
    ['Dagnabbit, look at that bucket!', 'Not even enough acid to worry a spoon!'],
    ['Well rope my tractor!', 'You clocked in just to show the tunnels your BOOTS?'],
    ['Great buttered barn doors!', 'I sent a bucket down and got a WIND CHIME back!'],
    ['Not so fast, biscuit britches!', 'That bucket\'s so dry it\'s askin\' ME for a drink!'],
    ['Corn shucks and crooked fence posts!', 'You quit before the bucket even got DIRTY?'],
    ['Whoa there, daylight chaser!', 'The way out ain\'t the thing I sent you to FIND!'],
    ['For the love of turnips!', 'You got two hands and a whole bucket of AIR!'],
    ['Well fry my suspenders!', 'Did you mine acid or just go admire the ROCKS?'],
    ['Dagnabbit, come back over here!', 'You can\'t hide an empty bucket behind that big ol\' HEAD!'],
    ['Jumpin\' jar of gooseberry jam!', 'I got more acid in a MEMORY than you got in that bucket!'],
    ['Set that dry bucket DOWN!', 'I can hear the bottom echo from over HERE!'],
  ],
  mud: [
    ['MUD?! You brought me MUD?!', 'Dad-gummit, I can get mud off my boots for free!'],
    ['Horse apples!', 'That bucket is ninety percent puddle, ten percent shame.'],
    ['Son of a biscuit-eatin\' hog!', 'I paid you ten dollars for DIRT WATER.'],
    ['Is that... is that a PUDDLE?', 'You hauled a puddle up a mine shaft. On PURPOSE.'],
    ['Cheese and crackers!', 'That ain\'t acid, that\'s pig-wallow soup!'],
    ['Well slop my hogs!', 'You brought me the bottom of a DUCK POND!'],
    ['Dad-gummit, it\'s BROWN!', 'Acid glows, sport. That stuff just SULKS!'],
    ['Great soggy corn shucks!', 'I asked for acid, not a sample of the DRIVEWAY!'],
    ['Dagnabbit, that bucket needs weedin\'!', 'There\'s enough dirt in there to grow a TURNIP!'],
    ['Mud pies and mule tracks!', 'You hauled up the bit we normally wipe OFF!'],
    ['Well butter a puddle!', 'I got cleaner stuff stuck to the bottom of my TRACTOR!'],
    ['Hold on. That\'s garden material!', 'This is payroll, not a POTATO PATCH!'],
    ['Great wobblin\' water trough!', 'That ain\'t a vein, that\'s a DITCH with ambitions!'],
    ['Son of a soggy biscuit!', 'Ten dollars for muck. The PIGS would haggle!'],
    ['Look at this muddy mess!', 'I coulda stayed upstairs and wrung out a DOORMAT!'],
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
  'I seen a snail finish a row of lettuce with more urgency!',
  'A rusty gate puts in more work than you, and all it does is COMPLAIN!',
  'My scarecrow stands in one spot all day and still gets RESULTS!',
  'You move like a wheelbarrow with the wheel on vacation!',
  'I got a barn cat that brings me somethin\' EVERY morning. Horrible things, but SOMETHIN\'!',
  'Even a flat tire makes itself useful holdin\' up the corner of the shed!',
  'You got the determination of wet toast, partner!',
  'My granny\'s rocking chair travels farther before breakfast!',
  'A tumbleweed ain\'t got arms and it still picks things UP!',
  'The worms out back moved more dirt than you and they ain\'t even got a UNION!',
  'Petunia heard your bucket come up and snorted. That mule knows disappointment!',
  'I could put a hard hat on a fence post and save myself this CONVERSATION!',
  'A rooster wakes up the whole farm. You can\'t wake up a BUCKET!',
  'I seen a three-legged stool hold down a job better than this!',
  'The squirrels plan for winter. You ain\'t planned past the DOOR!',
  'That shovel\'s gettin\' lonely, sport! Go introduce yourself!',
  'I sharpened that pick for ROCK, not for leanin\' on!',
  'Your hard hat\'s the hardest-workin\' thing about ya!',
  'That bucket came with a handle so you could HAUL things!',
  'I got cobwebs in the tool shed puttin\' in overtime!',
  'You treat a work shift like a church picnic with worse sandwiches!',
  'If sighin\' filled buckets, I\'d be the richest man in Nevada!',
  'I could bottle all these excuses and open a second MINE!',
  'Your excuses got more layers than my winter underwear!',
  'You got a fresh excuse every time and the SAME old bucket!',
  'I asked for acid, not a guided tour of your difficulties!',
  'Don\'t tilt that bucket at me like the problem\'s the ANGLE!',
  'Quit lookin\' at the ceiling. The answer ain\'t a STALACTITE!',
  'I can hear you thinkin\' about lunch from here!',
  'That guilty look don\'t fill containers, sugar britches!',
  'Earl\'s tiki torches got more work ethic than this. They stay LIT!',
  'Wendover\'s got enough empty promises. It needs FULL BUCKETS!',
  'Earl put up a neon palm tree for this business. A PALM TREE, sport!',
  'Them tourists don\'t drive to Wendover to admire an UNLIT UMBRELLA!',
  'Earl calls it supply and demand. I supply the YELLIN\' and demand the ACID!',
  'I promised Earl a shipment, not a nice story about a shovel!',
  'That tiki bar\'s got a decorative parrot and even IT says get to work!',
  'Earl\'s coconut mugs are sittin\' empty, sport. Empty COCONUTS!',
  'Dad-gummit, my patience is thinner than county-fair gravy!',
  'I\'m one more sigh away from boilin\' my own coffee!',
  'My eyebrows got tired of bein\' surprised and moved in together!',
  'I can feel my hat gettin\' tighter every time you blink!',
  'I\'m clenchin\' my jaw so hard I could crack FEED CORN!',
  'My suspenders ain\'t rated for this much aggravation!',
  'Doc told me to count to ten. I ran outta ten an HOUR ago!',
  'I took a calming breath and it came out a barnyard NOISE!',
  'I got a wrinkle with your name on it, partner!',
  'My lunch went cold while I was workin\' up this DISAPPOINTMENT!',
  'You ever try explainin\' an empty bucket to a clipboard? I HAVE!',
  'The clipboard says acid. I underlined it. With a SECOND PENCIL!',
  'I drew a bucket on the instructions. How much clearer do you NEED?',
  'This ain\'t a complicated business. Hole, bucket, acid. THREE THINGS!',
  'The sign says mine, not wander around till you miss the SUN!',
  'You got a headlamp so you could SEE the work!',
  'The tunnel goes both ways, sport. That ain\'t an invitation!',
  'We got more tunnels than excuses and you\'re workin\' on changin\' THAT!',
  'A shovel don\'t need a pep talk. Why do I gotta give YOU one?',
  'I ain\'t askin\' you to knit a tractor. I\'m askin\' for ACID!',
  'I laid out the whole job in words a GOAT could follow!',
  'Even the canary looks like it wants to speak to management!',
  'The goats eat the paperwork and STILL understand the assignment!',
  'I could send a raccoon down with a lunch pail and get a better story!',
  'The cows heard about this and quit chewin\' for a minute!',
  'You got outworked by a drip in the ceiling. A DRIP!',
  'A potato grows eyes and finds its way outta a sack. Think on THAT!',
  'My porch swing works harder in a light breeze!',
  'Even a busted tractor leaves a useful puddle once in a while!',
  'I seen a possum play dead with more commitment than you bring to this job!',
  'You\'re makin\' the wheelbarrow look like management material!',
  'A hay bale sits there doin\' nothin\' too, but at least the mule can EAT it!',
  'I oughta hang this bucket by the gate as a warning to other BUCKETS!',
  'Your boots got all that tread and not a speck of ambition!',
  'I got a broken clock that finishes somethin\' twice a day!',
  'Thirty-one years in this hole and I still ain\'t found the bottom of these EXCUSES!',
  'You got me talkin\' to myself, sport, and I\'m losin\' the argument!',
  'Dad-gummit, even the echo sounds disappointed in you!',
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
  'All right. Let\'s see if that head can haul a number. Work this out.',
  'No more excuses. You want another shift, you answer one question first.',
  'Park it, partner. Time to put them fingers to mathematical use.',
  'I\'m givin\' my blood pressure a rest. You do the figurin\' for a minute.',
  'Before you clock in again, we\'re checkin\' the machinery between your ears.',
  'Here comes a number problem. Treat it better than you treated that bucket.',
  'Fine. We\'ll try diggin\' up an answer instead. Listen close.',
  'You don\'t need a shovel for this part. You need to COUNT.',
  'Now do these sums. Right answer gets you cleared to clock in.',
  'Set the bucket down and wind up that brain. I got a question.',
  'Earl can do this one and he counts with drink umbrellas. Your turn.',
  'I\'m takin\' a breath. You\'re takin\' a math question. Fair trade.',
  'All right, turnip. Show me you can tell one number from another.',
  'Time for arithmetic. The numbers ain\'t hidin\' down a tunnel.',
  'Before another shift, you and me are settlin\' this with a sum.',
  'Hush now. I wanna hear a number that makes sense.',
  'Let\'s see if you can fill your head with an answer, at least.',
  'I got one question between you and that clock-in button, sport.',
  'Sit tight. No shovel, no mud, just you and some figurin\'.',
  'Deep breath. Shoulders down. Now solve this before I start up again.',
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
  'Dagnabbit! That answer fell clean off the wagon. Try this.',
  'Nope! Even Earl would send that one back. New question.',
  'Horse apples, sport. You counted the bucket twice! Try another.',
  'Not it! My barn cat could get closer walkin\' on the keys.',
  'Sweet corn, that ain\'t the number! Give this one a turn.',
  'Wrong row of turnips, partner. Here\'s a fresh problem.',
  'Nope. That sum needs its wheels tightened. Try again.',
  'Dad-gummit! Don\'t just throw a number down the shaft. Work this one out.',
  'Cheese and crackers, you took the scenic route to WRONG! Another question.',
  'That ain\'t it, sugar britches. New numbers. Same brain. Have another go.',
];
export const PRAISE = [
  '...Huh. Right. Fine. Get back to work.',
  'Well I\'ll be. You CAN count. Don\'t let it go to your head.',
  'That\'s it. Took the long way round my patience, but that\'s it.',
  'Hmph. Correct. Put that much thought into the bucket next time.',
  'Well butter my biscuit. There\'s a number in that head after all.',
  'Right answer, sport. You\'re cleared to clock in. I\'m cleared to stop talkin\'.',
];

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
