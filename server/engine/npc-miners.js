// The old-timers: a few NPC miners who sit out their smoke breaks in the dead ends of the day's tunnels. Talk to one
// and he (or she) tells you something true about the mine or the bugs. Swing your pickaxe (Space, or SWING on a
// phone) while you're up against one and they just take it; HITS_TO_DROP hits and they stay down for DOWN_MS, and the first knockdown in SMOKE_COOLDOWN_MS drops a few
// cigarettes you can pocket. Pure data and maths, shared with the browser (where they stand, what they say).
// Every number in a tip is read off the code it describes (server/barn.js, pvp.js, mines.js, engine/gym.js,
// circuit.js, catalog/mine.js): keep them true when those change. Never the payroll odds, which are secret.
import { rng } from './maze.js';
import { shiftMaze } from './mine-tiers.js';
import { daySeed } from './daily-maze.js';

export const HITS_TO_DROP = 8;               // pickaxe hits to put one on the floor
export const DOWN_MS = 3 * 60e3;             // how long they stay down
export const HIT_GAP_MS = 250;               // the fastest a pickaxe comes round (the server ignores anything quicker)
export const HIT_FORGET_MS = 60e3;           // stop swinging this long and they shake it off: the count starts again
export const SMOKE_COOLDOWN_MS = 60 * 60e3;  // a miner's pack refills once an hour: knock him down again sooner and there is nothing in it
export const SMOKES_DROPPED = [1, 3];        // fewest and most cigarettes on the floor
export const HALL_LEAN = 0.28;               // tiles off the middle of a hallway, against a wall (dead ends sit in the middle)
export const NPCS_A_SHIFT = 3;               // how many of the cast are down the mine on a given day and shaft
export const HIT_REACH = 1.9;                // tiles from the miner's own tile, by the server's last checked position (the page swings at about 1.2)

// Looks for the browser (client/src/mines/npcMesh.js): hard hat, shirt, skin, hair and beard colours, how big.
export const CAST = [
  { id: 'scratch', name: 'OLD SCRATCH', title: 'THIRTY-ONE YEARS DOWN HERE. SAYS FORTY.', smoker: true,
    look: { hat: '#8a7a52', shirt: '#6b4a3a', skin: '#e0b49a', hair: '#e8e4da', beard: '#eeeae0', bulk: 0.95, hunch: 0.22, face: 'squint' },
    hello: ['Pull up a rock.', 'You smell like a greenhorn. Sit down.', 'Ain\'t seen daylight since the Carter administration. Ask me anything.', 'Mind the spit bucket.'],
    tips: [
      'Feed it, play with it, hose it down. Nine XP a go, every one of \'em. Ain\'t no daily cap. Just the waiting.',
      'Feeding and playing come back round every twenty minutes. Hosing down takes forty. Set a clock. Or a wife.',
      'A bug gets eight XP for every full day alive, long as its needs averaged twenty-five or better. Neglect it and you get nothing but guilt.',
      'An automatic feeder\'s worth nine XP a day. One feed\'s worth, every day, while you\'re down here with me.',
      'Leave a toy in the terrarium. Good one\'s worth up to twenty XP a day. Your bug plays with it. You do not.',
      'Level is one plus the square root of XP over forty, rounded down. Level 5 is 640 XP. Level 10 is 3,240. I did the math on a cave wall.',
      'Past level 5 the easy XP dries up. Care, daily and losing XP fade to a sixth by level 10. Old bugs learn from winning, same as old men.',
      'Beat a bug above your level and it pays more: a quarter more per level up, up to double. Beat one three levels under you and you get a tenth. Pick on somebody your own size.',
      'Barn bout pays fifteen XP win or lose, and about eight more for winning an even fight. Underdog that wins gets more than that.',
      'Fight down here in the mine, wild or raid, that\'s fifteen XP, and about twenty-two more for winning an even one. Best XP in the county.',
      'A bug at GFR Farms don\'t gain a lick of XP. It\'s retired. It\'s on a porch.',
      'Your guide bug gets one XP for every acid pool it leads you to. One. Like a gold star from a mean teacher.',
    ],
  },
  { id: 'twolung', name: 'TWO-LUNG DOLORES', title: 'ON HER SECOND LUNG. NOT HER LAST.', smoker: true,
    look: { hat: '#c0392b', shirt: '#2f5d50', skin: '#c68a64', hair: '#2a1a14', beard: null, bulk: 0.9, hunch: 0.05, face: 'patch' },
    hello: ['Got a light? No? Then listen.', 'Lost the first lung to a jar of something purple. Ask away.', 'Speak up, hon. The left ear\'s in a jar too.'],
    tips: [
      'A jar holds a common bug six times in ten, if it\'s no higher level than yours. You get three throws before it comes to and walks off.',
      'Uncommons are harder to keep. Rares harder yet. A legendary holds about one throw in eight. Bring patience. Bring three jars.',
      'Every level the wild bug\'s got on yours knocks a fifth off your jar. It never drops below three tenths of the usual, though.',
      'A bug you jar shows up at most two levels over the one that caught it. Caught a level 9 with a level 3? Congratulations on your level 5.',
      'Every miner today\'s chasing the same five to eight wild bugs. Jar one and it\'s gone for everybody. Early bird gets the beetle.',
      'Fight a wild bug, win or lose, and it leaves your shift. Lose and it\'s still out there for the next fella.',
      'Wild bugs wander loops of six to twelve tiles, out of the acid, never more than three tiles nearer the lift. The deeper the tunnel, the higher the level.',
      'Level 1 bugs hang near the lift. Level 6 and up live way out in the deepest fifth of the tunnels. Go walk.',
      'Got a permit? Every shaft below 7 puts one more wild bug in the tunnels, and a meaner one.',
      'Released bugs come back down as strays about one day in three. Up to three at a time. They still answer to their old names.',
      'STEEZE shows up about one day in five. He\'s easy to jar. Hard to get rid of. Brings a golf bag.',
      'The big stick insect only comes out on Badlands and Dead Man\'s Dig days, and only on half of those. Level 30. One jar in a hundred holds it. I\'ve seen grown men weep.',
    ],
  },
  { id: 'mule', name: 'MULE CRABTREE', title: 'USED TO LIFT. STILL LIFTS. DON\'T ASK WHAT.', smoker: false,
    look: { hat: '#3a5f8a', shirt: '#8a2e2e', skin: '#8d5a3b', hair: '#1a1a1a', beard: '#1a1a1a', bulk: 1.28, hunch: 0, face: 'unibrow' },
    hello: ['Hey buddy.', 'You want to get big? Your bug, I mean. Me, I\'m done.', 'Sit. Not there. That\'s my protein rock.'],
    tips: [
      'Roids don\'t last, buddy. A vial is forty load, and it fades three quarters a point an hour. Gone in about two days. Full load takes five and a half.',
      'Full roid load is plus sixty percent damage and plus twenty percent HP. Sounds great. It also gives zero XP. Zero. I counted twice.',
      'Cool Down & Stretch flushes twenty roid load. Wear a sweatband and it flushes half again. The GLP-1 pen makes the whole load fade twice as fast.',
      'Clean work sticks. Cardio, sparring, double shifts: that conditioning never fades. Tops out at plus twenty percent damage. Honest muscle.',
      'Cardio & Drills is nine XP every half hour. Sparring Pit is fourteen if it\'s a sharp bout, eight if it\'s a scrap. Smelling Salts make it sharp more often.',
      'Double Shift pays twelve XP every fifteen minutes but piles on strain. Past ninety strain your bug won\'t lift. A knee brace lets it push to a hundred.',
      'A bug full of roids walks slow in the mine and doesn\'t always listen. Roid rage might squash a knocked-out wild bug before you get a jar on it.',
      'Roid rage is no joke: up to sixty percent at a full load, more if it\'s strained past fifty. No roids and strain under fifty, it never rages. Ask me how I know.',
      'The Breathing Mask is plus half XP on everything for three weeks. Wear it. Look like a dentist. Level up.',
      'Bug gets knocked out, it\'s down an hour. Fifty bucks gets it up now. Cheaper than my knee.',
      'Type matters. Brawlers tip Shells over. Shells pull their heads in on the Dazzlers. Toxic beats Brawlers: size is no defence against chemistry.',
      'Fliers beat Brawlers. Jaws ain\'t no use on something that won\'t land. Sonic beats Fliers. Everything beats me before lunch.',
    ],
  },
  { id: 'lefty', name: 'LEFTY FITZWATER', title: 'FOUR FINGERS. ONE WORM GRUDGE.', smoker: true,
    look: { hat: '#e8b923', shirt: '#4a4a6a', skin: '#f0c8a8', hair: '#b04a1a', beard: '#b04a1a', bulk: 1, hunch: 0.1, face: 'scar' },
    hello: ['Keep your bucket where I can see it.', 'Count my fingers. Go on. That\'s worms.', 'Shh. You hear slurping? No? Good.'],
    tips: [
      'Worms drink two acid a second from your bucket, each one. Cut \'em off your face. Tap \'em or hit K. Don\'t stand there and admire \'em.',
      'Worms don\'t bother you while acid\'s in reach. They wait till you walk off from the pool. Little cowards.',
      'Greenhorn Gulch days got no worms at all. Dead Man\'s Dig can stack three on your face at once.',
      'Every day is one of five tiers, one in five chance each. Rougher days pay hazard: ten percent more on a Tenderfoot day, double on Dead Man\'s Dig.',
      'Acid gets richer the farther you walk from the lift. Past eighty tiles out, every sixty-two more tiles pays the shaft\'s rate again. Walk, you lazy so-and-so.',
      'Shaft 8 acid pays four times Shaft 7. Shaft 12, eight times. Earl\'s Level, sixteen. Nobody\'s met Earl. Nobody wants to.',
      'Deeper shafts have loose roofs. A cave-in knocks a quarter of your bucket on the floor. A bug with a Hoist Claw holds it up out of the mess.',
      'Bendy Straw fills twice as fast. Shop-Vac ten times. Dale says it\'s cheating. Dale owns one.',
      'Thirty minutes a shift, that\'s your lot. Then the Foreman wants his bucket back.',
      'First fifteen seconds of a shift, nobody can touch you, and the lift landing is safe ground. After that, watch your back.',
      'Same two miners can only rob each other once every two hours. And nobody loses cash more than three times a day. Your acid and your Smoke Shop stash, though? Fair game.',
      'Empty barn? Look sharp near the lift the first thirty seconds. Sometimes there\'s an egg. It\'s warm. It kicks.',
    ],
  },
  { id: 'hollis', name: 'PASTOR HOLLIS', title: 'DEFROCKED. RE-FROCKED. DEFROCKED AGAIN.', smoker: false,
    look: { hat: '#2a2a2a', shirt: '#1c1c22', skin: '#d9a77f', hair: '#5a5a5a', beard: null, bulk: 0.92, hunch: 0.12, face: 'collar' },
    hello: ['Bless you, child. Mind the acid.', 'Have you accepted the purple into your heart?', 'I preach to the worms now. They don\'t listen either.'],
    tips: [
      'At level 10 the purple calls. Every shift from then, one chance in four your bug drinks the purple acid. Level 11, two in four. By 13 it\'s certain.',
      'The purple pool sits in the same spot for every miner in a shaft that day. Only a bug that\'s ready drinks from it. The rest won\'t go near it.',
      'A bug that drinks the purple comes home sick, and the Bug Center rebuilds it. The bill is half your cash. No refusing. No refund. Amen.',
      'One rebuild in fifteen goes a little wrong. The bug still evolves. It just keeps a quirk. Like me.',
      'The second calling comes at level 23, certain by 26. That one makes a machine of it. Have another bug handy for parts, or half your cash again.',
      'A rebuilt bug can take one mech part. A Drill Arm makes every unit of acid worth a tenth more. The Lamp Eye shows the next pool before you walk there.',
      'The Plunger Arm: once a shift, when a pool comes up nearly dry, half a bucket comes up instead. Don\'t ask what it was blocked with.',
      'A circuit ribbon is seventy-five XP in one go. The circuit only pays XP when you win. Thus it is written.',
      'The thing that freezes when you look at it. Keep looking at it. Keep your bug close.',
      'Purple stuff on the floor and your bug won\'t touch it? It isn\'t ready. Level it. Then pray.',
    ],
  },
];
export const NPC_BY_ID = Object.fromEntries(CAST.map((n) => [n.id, n]));

// What they say while you hit them, roughly in order of how hard they have been hit. Each one takes it.
export const HIT_LINES = {
  scratch: ['Ow.', 'That\'s my good shoulder.', 'I fought in a war for you. Not a real one.', 'Hrk.', 'You swing like my late wife.', 'I\'m eighty-one.', 'Fine. Fine.', 'Tell the Foreman I tripped.'],
  twolung: ['Oh, real nice.', 'That was the good lung!', 'Honey, no.', 'I\'ve been hit harder by a draft.', 'My cigarette!', 'Okay that one stung.', 'You\'re going in my diary.', 'Lights out, sugar.'],
  mule: ['Huh.', 'That tickles, buddy.', 'Was that the pointy end?', 'Ow. Okay. Ow.', 'I\'m not gonna hit back. I promised my mom.', 'Leg day was yesterday.', 'Buddy.', 'Goodnight, buddy.'],
  lefty: ['Hey! I need those fingers!', 'Not the hand. Not the hand.', 'Worse than worms. Barely.', 'I\'m telling Dale.', 'Ow, my grudge.', 'You\'re a worm in a hat.', 'I see three of you.', 'Count my teeth now.'],
  hollis: ['Forgive him.', 'Forgive him harder.', 'I turn the other cheek. Ow. Both cheeks.', 'This is a test. I am failing it.', 'Lord, smite him a little.', 'I have seen the light. It\'s your pickaxe.', 'Into thy hands.', 'Amen.'],
};
export const DOWN_LINES = {
  scratch: 'OLD SCRATCH GOES DOWN LIKE A SACK OF FEED. SOMETHING FALLS OUT OF HIS VEST.',
  twolung: 'DOLORES HITS THE FLOOR. HER PACK SKIDS ACROSS THE ROCK.',
  mule: 'MULE TIPS OVER SLOWLY, LIKE A TREE. HIS POCKETS EMPTY THEMSELVES.',
  lefty: 'LEFTY SAYS "WORMS" AND FALLS OVER.',
  hollis: 'PASTOR HOLLIS LIES DOWN WITH HIS ARMS CROSSED. IT SEEMS PLANNED.',
};
export const OUT_COLD = ['Zzz.', '…mama?', '*snores in Morse code*', '…tell Earl I said hey…', '…the purple… so pretty…'];
export const GET_UP = ['Whoa. Long nap.', 'Who turned off the mine?', 'I\'m up. I\'m up. Where\'s my hat?', 'Back on the clock.'];
export const EMPTY_PACK = 'HIS POCKETS ARE EMPTY. YOU ALREADY TOOK THIS ONE\'S SMOKES. GIVE IT AN HOUR.';

/** The next tip for this miner: walks a fixed shuffle so a tip never comes round twice in a row. `n` counts the talks. */
export function tipFor(npc, playerId, n) {
  const tips = npc.tips, order = tips.map((_, i) => i);
  const r = rng(daySeed(`npc:${npc.id}:${playerId}`));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return tips[order[((n % tips.length) + tips.length) % tips.length]];
}
/** What they say for hit number `hits` (1-based, the last one is the knockdown line). */
export function hitLine(npcId, hits) {
  const lines = HIT_LINES[npcId] || HIT_LINES.scratch;
  return lines[Math.min(lines.length, Math.max(1, hits)) - 1];
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/**
 * Where the day's old-timers sit: NPCS_A_SHIFT of the cast, each in a dead end of the shift's tunnels (so nobody is ever
 * in the way; only a small dig with too few free dead ends seats one in a hallway, where the browser lets you walk through), off every acid pool and the purple pool, at least 4 steps from the lift, spread from near to far.
 * Seeded by the day and shaft, so every miner in a shaft meets the same people in the same places.
 */
export function placeNpcs(shift) {
  if (!shift?.pools?.length) return [];
  const maze = shiftMaze(shift), g = maze.grid, depth = (x, y) => maze.dist[y]?.[x] ?? -1;
  const taken = new Set([...(shift.pools || []), ...(shift.purplePool ? [shift.purplePool] : [])].map((p) => `${p.x},${p.y}`));
  const r = rng(daySeed(`npc:${shift.day || shift.seed}:${shift.shaft || '7'}`));
  const ends = [], spare = [];
  for (let y = 1; y < maze.size - 1; y++) for (let x = 1; x < maze.size - 1; x++) {
    if (g[y][x] !== 0 || depth(x, y) < 4 || taken.has(`${x},${y}`)) continue;
    const open = DIRS.filter(([dx, dy]) => g[y + dy]?.[x + dx] === 0);
    if (open.length === 1) ends.push({ x, y, d: depth(x, y), out: open[0] });
    else if (open.length === 2 && open[0][0] === -open[1][0] && open[0][1] === -open[1][1]) spare.push({ x, y, d: depth(x, y), out: open[0], hall: true }); // a straight hallway
  }
  const byDepth = (a, b) => a.d - b.d || a.y - b.y || a.x - b.x;
  ends.sort(byDepth); spare.sort(byDepth);
  const cast = CAST.slice();
  for (let i = cast.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cast[i], cast[j]] = [cast[j], cast[i]]; }
  // spread over near-to-far bands of the free dead ends; a small dig with too few of them puts the rest in a hallway
  const pickFrom = (spots, n) => { // one from each of n equal bands, near to far
    const band = Math.floor(spots.length / Math.max(1, n));
    return Array.from({ length: n }, (_, k) => spots[k * band + Math.floor(r() * band)]);
  };
  const chosen = pickFrom(ends, Math.min(NPCS_A_SHIFT, ends.length));
  chosen.push(...pickFrom(spare, NPCS_A_SHIFT - chosen.length));
  // facing: yaw toward the open side (front is +z). In a hallway they lean on one wall, side-on, so there is room to pass.
  const out = chosen.map((s, k) => {
    const [dx, dy] = s.out || [1, 0], side = r() < 0.5 ? 1 : -1;
    return { id: cast[k].id, x: s.x, y: s.y, facing: Math.atan2(dx, dy), ...(s.hall ? { ox: -dy * side * HALL_LEAN, oy: dx * side * HALL_LEAN } : {}) };
  });
  return out;
}
