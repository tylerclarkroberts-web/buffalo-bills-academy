// The Tri-County Bug Circuit: the Barn's single-player campaign. Each area is a short path of stops (talk, trainers,
// the Bug Center, the area's leader); every fight is the ring fight (server/fights.js) against bugs nobody owns, with
// no stake. A leader fields two or three bugs in a row: your bugs' health carries from round to round, and each round
// you send in whoever is still standing. Beat them all for the area's ribbon. Progress lives in circuit.json; a fight
// lives in memory, so a restart mid-round just calls that round off.
//
// XP: only a win pays (the mine's battle XP, by the line and the level beaten: fightXp); a loss pays nothing, so losing on
// purpose earns nothing. A ribbon adds RIBBON_XP to every bug that won a round of it. A beaten trainer stays beaten.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { idOf } from './barn.js';
import { WILD as JAR, jarChance, caughtLevel } from './pvp.js';
import { MAX_LEVEL, LEVEL_CAP, ROSTER } from './engine/creatures.js';
import { typeOf, rarityOf, weakTo } from './engine/bug-types.js';

export const RIBBON_XP = 100;
export const RIBBONS = 8; // the leaders still to come show as empty hooks
// One-time prize money, bigger every area: a trainer pays PURSE.trainer and a ribbon PURSE.ribbon, times the area's
// ribbon number. Nothing can be beaten twice, so none of it can be farmed.
export const PURSE = { trainer: 75, ribbon: 750, boss: 300 };
const FIGHTS = ['trainer', 'rival', 'toll', 'leader', 'boss', 'wild']; // stops with somebody to beat
const OPTIONAL = ['center', 'wild', 'boss']; // stops nothing later waits on
// What each leader hands over with the ribbon. A prize works in circuit fights only (server/engine/bout.js has what each does).
export const PRIZES = {
  pugh: { id: 'whistle', name: 'The Whistle', does: 'Your bug\'s first attack in a circuit fight cannot miss.' },
  gil: { id: 'floaties', name: 'Floaties', does: 'Rising water and a dark porch do nothing to your bug.' },
  dale: { id: 'nightlight', name: 'The Night Light', does: 'You can see how hurt a bug is, however dark the shaft.' },
  ruperto: { id: 'mitt', name: 'The Oven Mitt', does: 'Fire bugs\' hits on your bug do 10% less.' },
  voss: { id: 'antidote', name: 'The Antidote', does: 'Poison does half damage to your bug, and always wears off.' },
  dwayne: { id: 'nighteyes', name: 'Night Eyes', does: 'An Ambush bug\'s first strike can miss your bug.' },
};
/** The prizes a player holds: one for every leader they have beaten. */
export const prizesOf = (me) => Object.entries(PRIZES).filter(([leader]) => me.done[leader]).map(([, prize]) => prize);
// A boss is a feature presentation: one of a kind, after its area's ribbon, never needed to go on. Beating one wins its card.
export const BOSSES = () => AREAS.flatMap((area) => area.stops.filter((stop) => stop.kind === 'boss'));
/** `held`: the ribbons the player has. An any-order area pays as the next ribbon they would win, whichever slot it fills. */
export const purseOf = (stop, area, held = 0) => (stop.kind === 'leader' ? PURSE.ribbon : stop.kind === 'boss' ? PURSE.boss : stop.kind === 'wild' ? 0 : FIGHTS.includes(stop.kind) ? PURSE.trainer : 0) * (area.scale ? held + 1 : area.ribbon);
// Any-order areas grow with the ribbons held: every bug gains SCALE levels a ribbon past the two it takes to get there,
// and a leader's last bug (`from`) only turns up once the player holds that many.
export const SCALE = 1.5;
export const scaled = (bugs, held) => bugs.filter((bug) => !bug.from || held >= bug.from).map(({ from: _from, ...bug }) => ({ ...bug, level: bug.level + Math.round(SCALE * Math.max(0, held - 2)) }));
/** The rival copies off you: a common bug of a type that beats your partner's. */
export const rivalSpecies = (partnerSpecies) => {
  const beats = weakTo(typeOf(partnerSpecies) || 'brawler');
  return ROSTER.find((bug) => rarityOf(bug.id) === 1 && beats.includes(typeOf(bug.id)))?.id || 'lamprima';
};
// Circuit bugs are drilled: in top condition, with the best gear, and TRAINED more health and damage than a barn bug
// of their level. With both left to themselves, a barn bug of the same level wins about one fight in eight.
export const TRAINED = 0.1;
/** The top level a player's bugs can reach: one more for every ribbon. */
export const capFor = (ribbons) => Math.min(LEVEL_CAP, MAX_LEVEL + ribbons);

export const AREAS = [{
  id: 'back40', short: 'Back Forty', name: 'The Back Forty', ribbon: 1, blurb: 'The field behind the Barn. Last mown in 2019.',
  stops: [
    { id: 'foff', kind: 'talk', who: 'Commissioner Foff', title: 'Registration',
      lines: ['Welcome to the Tri-County Invertebrate Athletic Association. Nobody sanctions us. Sign here.', 'I had a clipboard. I have had several clipboards.'],
      ask: { q: 'Before I register this bug: where was it CONCEIVED?!', options: [
        ['Shaft 7', 'Shaft 7. Beautiful. Somebody write that down. Not me. I don\'t have the clipboard.'],
        ['I\'d have to call my mom', 'Call her. I\'ll wait. …I won\'t wait. Registered.'],
        ['It came in a jar', 'A jar baby. Respect. Registered.'],
      ] },
      after: ['Eight ribbons, then the Fair Board, then the Grand Champion. Where were THEY conceived? Nobody knows.', 'First stop is right here. Coach Pugh is at the end of the field. She is always expecting someone.'] },
    { id: 'salad', kind: 'trainer', who: 'Lady Who Found It in Her Salad', bugs: [{ species: 'pyrops', name: 'Crouton', level: 2 }],
      intro: ['I found it in my salad. The restaurant gave me a coupon.', 'I kept the bug.'],
      won: 'I\'m going back for the coupon.', lost: 'It was a very good salad.' },
    { id: 'landon', kind: 'trainer', who: 'Landon', friend: true, bugs: [{ species: 'lamprima', name: 'Backboard', level: 3, stance: 'aggressive' }],
      intro: ['Pickup game. Winner stays on.', 'I\'m calling bank.'],
      won: 'Foul. That was a foul.', lost: 'Scoreboard.' },
    { id: 'notacop', kind: 'trainer', who: 'Man Who Insists He\'s Not a Cop', bugs: [{ species: 'trachelophorus', name: 'Plainclothes', level: 3, stance: 'defensive' }],
      intro: ['Just a regular guy with a regular bug. Totally normal.', 'Do you have any… bugs… on you? Asking as a civilian.'],
      won: 'I\'m going to need you to… congratulations. As a civilian.', lost: 'Have a nice day, citizen. Citizen is a normal word.' },
    { id: 'wild1', kind: 'wild', who: 'Something Under the Old Tractor', bugs: [{ species: 'phloeodes', name: 'Diabolical Ironclad Beetle', level: 5 }],
      intro: ['The tractor has not moved since 2019. Something under it has.', 'It is rare. Knock it out and you get three throws of a jar.'] },
    { id: 'center', kind: 'center', who: 'Nurse Hikari', title: 'Bug Center', lines: ['Anything that faints out here, I can fix. Free after an hour\'s rest ♡'] },
    { id: 'pugh', kind: 'leader', who: 'Coach Deb Pugh', title: 'Ribbon 1', rule: 'dodgeball', tell: 'Coach Pugh puts the whistle to her lips…',
      bugs: [{ species: 'manticora', name: 'Dodgeball', level: 4, stance: 'aggressive' }, { species: 'nemoptera', name: 'Hall Pass', level: 5 }],
      intro: ['Alright, listen up! This is gym class. In gym class we HUSTLE.', 'Two bugs. Beat both and the ribbon is yours. Lose and you run laps.', 'When you hear the whistle, that ball is coming. Guard up or get beaned.'],
      next: 'That\'s one. Don\'t get cocky. I\'ve got a sub.', sub: 'Next! Sub in! Somebody sub in!',
      won: 'Hit the showers. …That was good hustle. Don\'t tell anyone I said that.', lost: 'LAPS! Come back when you\'ve stretched.' },
    { id: 'charlene', kind: 'boss', who: 'Charlene', poster: 'Charlene\'s Web Address', rule: 'web', tell: 'Charlene is writing something over your bug.',
      bugs: [{ species: 'platymeris', name: 'Charlene', level: 6 }],
      intro: ['Up here. The hayloft. Mind Wilbert, he\'s eating.', 'I write a word over every bug that comes up. It is usually accurate.', 'Yours says MID. It will hit like it, too.'],
      won: 'Fine. I\'ll write SOME BUG. Small. Where nobody looks.', lost: 'MID. I\'m leaving it up. Wilbert, stop eating that.' },
  ],
}, {
  id: 'culvert', short: 'Culvert', name: 'The Culvert', ribbon: 2, needs: 1, blurb: 'A storm drain behind the feed store. It is not supposed to have a current.',
  stops: [
    { id: 'nephew1', kind: 'rival', who: 'The Nephew', level: 5, bugName: 'Bug Two',
      intro: ['My uncle said I had to do something with my summer.', 'This is Bug Two. Don\'t ask about Bug One.', 'I saw what you brought. I brought the other thing.'],
      won: 'I wasn\'t even trying. I\'m writing that down as a nap.', lost: 'Bug Two did that. I mostly watched.' },
    { id: 'net', kind: 'trainer', who: 'Kid With a Net', bugs: [{ species: 'gyrinus', name: 'Scoop', level: 5 }],
      intro: ['I\'m not allowed past the second pipe.', 'This one\'s from past the second pipe.'],
      won: 'I have to be home by five anyway.', lost: 'I\'m telling everyone at school.' },
    { id: 'toll1', kind: 'toll', who: 'Chopper & the Hoppers', toll: 150, rule: 'tribute', bugs: [{ species: 'gryllotalpa', name: 'Lefty', level: 6, stance: 'aggressive' }],
      intro: ['This here is a toll culvert. Always has been. Since Tuesday.', 'Tribute is a hundred and fifty. Or your bug can discuss it with Lefty.', 'Lefty eats first. Whatever your bug packed for lunch, that\'s Lefty\'s lunch.'],
      paid: 'Pleasure doing business. Tell your friends. We\'ll be telling ours.',
      won: 'This ain\'t over. There\'s a lot of us and a lot of pipes.', lost: 'That\'s the toll AND a lesson. Lesson\'s free.' },
    { id: 'bent', kind: 'trainer', who: 'Bent', friend: true, rule: 'cough', bugs: [{ species: 'notonecta', name: 'Lozenge', level: 6 }],
      intro: ['*cough* Morning.', '*cough* It\'s going round. The bugs have it too.'],
      won: '*cough* Good game.', lost: '*cough* Sorry. *cough* Not sorry.' },
    { id: 'wild2', kind: 'wild', who: 'Something on the Water', bugs: [{ species: 'halobates', name: 'Sea Skater', level: 7 }],
      intro: ['It is standing on the water. It should be at sea.', 'It is rare. Knock it out and you get three throws of a jar.'] },
    { id: 'center2', kind: 'center', who: 'Nurse Hikari', title: 'Bug Center', lines: ['You are all a little damp. I have towels ♡'] },
    { id: 'gil', kind: 'leader', who: 'Gil', title: 'Ribbon 2', rule: 'flood', tell: 'Gil pats the water. “Feel that? That\'s give.”',
      bugs: [{ species: 'dytiscus', name: 'Queen Size', level: 6 }, { species: 'lethocerus', name: 'California King', level: 7, stance: 'aggressive' }],
      intro: ['Gil. Waterbeds. Thirty-one years. Everything is better as water.', 'Two bugs. In a minute this drain fills, and anything that can\'t swim loses a little every turn.', 'Bring a Water bug. Or don\'t, and learn something about lumbar support.'],
      next: 'That one was a floor model.', sub: 'See? No give. Send in another.',
      won: 'You\'d sleep like a baby on one. Take the ribbon. Take a brochure.', lost: 'Sunk. Come back when you\'ve got something that floats.' },
    { id: 'those', kind: 'boss', who: 'The Storm Drain', poster: 'THOSE!', trained: 0.4,
      bugs: [{ species: 'solenopsis', name: 'THOSE!', level: 8, stance: 'aggressive' }],
      intro: ['Something came down the drain from behind the feed store. The big bags. The ones with the warning.', 'It is an ant. It is not the size an ant is.'],
      won: 'It goes back down the pipe. The pipe was not built for this.', lost: 'It keeps the drain. It was keeping it anyway.' },
  ],
}, {
  id: 'porch', short: 'Porch', name: 'The Front Porch', ribbon: 3, needs: 2, scale: true, blurb: 'Next door, after dark. The light has a mind of its own.',
  stops: [
    { id: 'ladder', kind: 'trainer', who: 'Man Returning a Ladder', bugs: [{ species: 'gromphadorhina', name: 'Rung', level: 7 }],
      intro: ['I borrowed this in 2019.', 'I\'m not here about the bug. But I did bring the bug.'],
      won: 'Tell Dale I was by. Don\'t tell him about the ladder.', lost: 'I\'ll just lean this here.' },
    { id: 'tcut', kind: 'trainer', who: 'Tcut', friend: true, rule: 'rage', bugs: [{ species: 'phanaeus', name: 'Seven Iron', level: 8 }],
      intro: ['Hey man. Just out here to have fun.', 'Nice and easy. Nothing to get upset about.'],
      won: 'Good game. Really. I SAID GOOD GAME.', lost: 'See? Calm wins.' },
    { id: 'wild3', kind: 'wild', who: 'A Light Under the Eaves', bugs: [{ species: 'arachnocampa', name: 'New Zealand Glowworm', level: 9 }],
      intro: ['That is not the porch light.', 'It is rare. Knock it out and you get three throws of a jar.'] },
    { id: 'center3', kind: 'center', who: 'Nurse Hikari', title: 'Bug Center', lines: ['Mind the step. And the other step ♡'] },
    { id: 'dale', kind: 'leader', who: 'Dale', title: 'Ribbon 3', rule: 'flicker', tell: 'Dale reaches for the porch light switch…',
      bugs: [{ species: 'photuris', name: 'Porchlight', level: 8 }, { species: 'bertholdia', name: 'Bylaw', level: 9 }, { species: 'chrysochroa', name: 'Covenant', level: 10, from: 4 }],
      intro: ['Dale. Next door. Eleven years on the HOA board, and I have notes.', 'Your bugs were out past nine. Section four.', 'When this light goes off, nothing can see to hit. My Dazzle bugs manage.'],
      next: 'That\'s going in the minutes.', sub: 'Noted. All of it. Noted.',
      won: 'I\'ll be raising this at the next meeting. Take the ribbon off my porch.', lost: 'Section four. Read it.' },
    { id: 'jimmy', kind: 'boss', who: 'Jimmy Conscience', poster: 'Wish Upon a Bug', rule: 'conscience', tell: 'Jimmy Conscience clears his throat.',
      bugs: [{ species: 'gryllotalpa', name: 'Jimmy Conscience', level: 10 }],
      intro: ['Evening! Top hat, umbrella, opinions. Jimmy Conscience.', 'Now, I don\'t like to tell a fella how to fight.', 'But every dirty trick, every poison, every poke through the armour? Does me a power of good.'],
      won: 'Well. Always let your conscience be your… ow.', lost: 'And what did we learn? Take your time. I\'ve got all night.' },
  ],
}, {
  id: 'kitchen', short: 'Kitchen', name: 'Buffalo Bill\'s Back Kitchen', ribbon: 4, needs: 2, scale: true, blurb: 'Through the swinging door. Nobody is supposed to be back here.',
  stops: [
    { id: 'inspector', kind: 'trainer', who: 'Health Inspector, Off Duty', bugs: [{ species: 'melanophila', name: 'Violation', level: 7 }],
      intro: ['I\'m not here in an official capacity.', 'If I were, this would be a very different conversation.'],
      won: 'I didn\'t see this. I didn\'t see any of this.', lost: 'That\'s a write-up. Unofficially.' },
    { id: 'bmehl', kind: 'trainer', who: 'BMehl', friend: true, bugs: [{ species: 'brachinus', name: 'F***ing Carl', level: 8, stance: 'aggressive' }],
      intro: ['How f***ing hard can it be.'],
      won: 'What the f***.', lost: 'F*** yes.' },
    { id: 'wild4', kind: 'wild', who: 'Something Behind the Fryer', bugs: [{ species: 'pheropsophus', name: 'Asian Bombardier Beetle', level: 9 }],
      intro: ['Every so often there is a pop back here. It is not the fryer.', 'It is rare. Knock it out and you get three throws of a jar.'] },
    { id: 'center4', kind: 'center', who: 'Nurse Hikari', title: 'Bug Center', lines: ['Please do not touch the fryer ♡'] },
    { id: 'ruperto', kind: 'leader', who: 'Ruperto', title: 'Ribbon 4', rule: 'grill', tell: 'Ruperto slams the bell. “ORDER UP!”',
      bugs: [{ species: 'solenopsis', name: 'Order 41', level: 8 }, { species: 'pyrrhocoris', name: 'Order 52', level: 9 }, { species: 'brachinus', name: 'Order 86', level: 10, from: 4 }],
      intro: ['FORTY-ONE!', 'FIFTY-TWO!', 'The grill is never off. Every fourth one comes out HOT.'],
      next: 'FIFTY-TWO! FIFTY-TWO IS UP!', sub: 'NEXT!',
      won: 'EIGHTY-SIX the ribbon. It\'s yours. NEXT!', lost: 'SEND IT BACK!' },
    { id: 'choir', kind: 'boss', who: 'The Roach Choir', poster: 'Apartment 4B: The Musical', rule: 'sing', tell: 'The Roach Choir takes a breath.',
      bugs: [{ species: 'gromphadorhina', name: 'Tenor', level: 9 }, { species: 'gromphadorhina', name: 'Baritone', level: 10 }, { species: 'gromphadorhina', name: 'Bass', level: 11, stance: 'defensive' }],
      intro: ['♪ Behind the fryer, where the mop won\'t go ♪', '♪ There\'s three of us, in case you didn\'t know ♪', '♪ And every verse we sing, we feel a little better ♪'],
      next: '♪ That was the tenor. He was the weak one ♪', sub: '♪ Second verse, same as the first ♪',
      won: '♪ …and scene ♪', lost: '♪ Encore ♪' },
  ],
}, {
  id: 'van', short: 'Van', name: 'The Van at the Mine Entrance', ribbon: 5, needs: 2, scale: true, blurb: 'A white van, lettering scraped off. It has been parked here since she retired.',
  stops: [
    { id: 'oils', kind: 'trainer', who: 'Woman Selling Essential Oils', bugs: [{ species: 'dasymutilla', name: 'Lavender', level: 7 }],
      intro: ['Have you thought about what you\'re putting ON your bug?', 'It\'s not a pyramid. It\'s a wellness triangle.'],
      won: 'I can get you in at the ground floor.', lost: 'That\'s the toxins leaving.' },
    { id: 'article', kind: 'trainer', who: 'Guy Who Read One Article', bugs: [{ species: 'graphocephala', name: 'Actually', level: 8 }],
      intro: ['Actually, most people get bug fighting completely wrong.', 'I read a thing.'],
      won: 'That\'s not what the article said would happen.', lost: 'Like I said. One article.' },
    { id: 'wild5', kind: 'wild', who: 'Something on the Wing Mirror', bugs: [{ species: 'peruphasma', name: 'Black Beauty Stick Insect', level: 9 }],
      intro: ['Black, red wings, yellow eyes, perfectly still. It has been watching the van.', 'It is rare. Knock it out and you get three throws of a jar.'] },
    { id: 'center5', kind: 'center', who: 'Nurse Hikari', title: 'Bug Center', lines: ['Please stay upwind of the van ♡'] },
    { id: 'voss', kind: 'leader', who: 'Aldine Voss', title: 'Ribbon 5', rule: 'linger', tell: 'Aldine Voss looks away. “I\'m so sorry about this next part.”',
      bugs: [{ species: 'sphaerocoris', name: 'Apology', level: 8 }, { species: 'platymeris', name: 'Regret', level: 9 }, { species: 'graphocephala', name: 'Remorse', level: 10, from: 4 }],
      intro: ['Forty years I did the other thing. To bugs. I\'m sorry.', 'I\'m sorry to yours in particular. In advance.', 'What I put on them doesn\'t wear off. It never did. That was the selling point.'],
      next: 'I\'m sorry. I have another.', sub: 'Oh, I\'m sorry. I\'m so sorry.',
      won: 'Thank you. I needed to lose one. Take the ribbon. I\'m sorry it\'s damp.', lost: 'I\'m sorry. I really am. I did warn you.' },
    { id: 'brindle', kind: 'boss', who: 'Dr. Brindle', poster: 'The Wasp', rule: 'telepod', tell: 'Dr. Brindle backs toward the telepod…',
      bugs: [{ species: 'ampulex', name: 'Brindlewasp', level: 10 }],
      intro: ['The shed. Behind the van. Don\'t touch the pods.', 'I went in one alone. I did not come out alone.', 'When this goes badly for me, and it will, we both step in. You\'ll see.'],
      won: 'Be afraid. Be moderately afraid.', lost: 'It worked! It has never worked before.' },
  ],
}, {
  id: 'shaft12', short: 'Shaft 12', name: 'Shaft 12, Night Shift', ribbon: 6, needs: 2, scale: true, blurb: 'Nineteen years of nights. Bring a lamp. It will not help.',
  stops: [
    { id: 'newguy', kind: 'trainer', who: 'New Guy, First Night', bugs: [{ species: 'umbonia', name: 'Lunchbox', level: 7 }],
      intro: ['Is it always this dark?', 'Nobody told me to bring a bug. I found one.'],
      won: 'I\'m going to ask about days.', lost: 'This job\'s alright.' },
    { id: 'kashely', kind: 'trainer', who: 'Kashely', friend: true, rule: 'mulligan', bugs: [{ species: 'empusa', name: 'Ranch Rules', level: 8 }],
      intro: ['Howdy. Out here a bug gets a few mulligans.', 'That\'s not a mine thing. It is on my ranch.'],
      won: 'Three mulligans and I still lost. I\'ll pencil it in as a draw.', lost: 'That\'s how the West was won. Mostly mulligans.' },
    { id: 'wild6', kind: 'wild', who: 'A Noise in the Dark', bugs: [{ species: 'brevisana', name: 'Shrill Thorntree Cicada', level: 9 }],
      intro: ['You cannot see it. You can absolutely hear it.', 'It is rare. Knock it out and you get three throws of a jar.'] },
    { id: 'center6', kind: 'center', who: 'Nurse Hikari', title: 'Bug Center', lines: ['I brought a night light. Dwayne asked me to turn it off ♡'] },
    { id: 'dwayne', kind: 'leader', who: 'Dwayne', title: 'Ribbon 6', rule: 'dark', tell: 'Dwayne stops whispering.',
      bugs: [{ species: 'acanthaspis', name: 'Second Shift', level: 8 }, { species: 'deroplatys', name: 'Third Shift', level: 9 }, { species: 'myrmeleon', name: 'Graveyard', level: 10, from: 4 }],
      intro: ['…', '…you can\'t see it. that\'s the idea.', '…you won\'t know how hurt it is. i do. i\'m used to the dark.'],
      next: '…there\'s another. there\'s always another.', sub: '…next.',
      won: '…take it. what\'s it look like? the ribbon. i never saw it.', lost: '…clock out.' },
    { id: 'mandibull', kind: 'boss', who: 'General Mandibull', poster: 'Ants in Formation',
      bugs: [{ species: 'solenopsis', name: 'Private Zee', level: 9 }, { species: 'odontomachus', name: 'The Colonel', level: 10 }, { species: 'colobopsis', name: 'General Mandibull', level: 11, stance: 'aggressive' }],
      intro: ['The colony under Shaft 12 does not negotiate.', 'Private Zee will go first. He has been talking to someone about it.', 'Then the Colonel. Then me. I explode. It is a whole thing.'],
      next: 'He was expendable. He knew. We discussed it in group.', sub: 'Hold the line!',
      won: 'The colony will remember this. The colony remembers everything. It is exhausting.', lost: 'For the colony!' },
  ],
}];
const STOPS = new Map(AREAS.flatMap((area) => area.stops.map((stop, i) => [stop.id, { area, stop, i }])));

export class Circuit {
  constructor({ store, barn, accounts, fights, now, randInt }) {
    this.store = store; this.accounts = accounts; this.randInt = randInt || ((n) => crypto.randomInt(n)); this.barn = barn; this.fights = fights || barn.fights; this.now = now;
    this.doc = store.loadDoc('circuit', { players: {} });
    this.doc.players ||= {};
    barn.capOf = (pid) => capFor(Object.keys(this.doc.players[pid]?.ribbons || {}).length);
  }
  save() { this.store.saveDoc('circuit', this.doc); }
  me(pid) { return (this.doc.players[pid] ||= { done: {}, ribbons: {}, run: null }); }

  /** An area opens with the ribbon before it. Inside it, a stop is open once every stop before it is done (the Bug Center never blocks anything). */
  open(me, stop) {
    const { area, i } = STOPS.get(stop.id);
    if (area.needs && !me.ribbons[area.needs]) return false;
    return stop.kind === 'center' || area.stops.slice(0, i).every((s) => OPTIONAL.includes(s.kind) || me.done[s.id]);
  }
  /** The bugs a stop fields against this player. The rival's is whatever beats their partner, fixed the first time they look. */
  bugsOf(pid, me, stop) {
    const { area } = STOPS.get(stop.id), held = Object.keys(me.ribbons).length;
    if (area.scale) return me.run?.stop === stop.id && me.run.lineup ? me.run.lineup : scaled(stop.bugs, held); // a gauntlet under way keeps the lineup it began with
    if (stop.kind !== 'rival') return stop.bugs;
    const chosen = (me.rival ||= {})[stop.id] ||= rivalSpecies(this.barn.doc.pens[pid]?.species);
    return [{ species: chosen, name: stop.bugName, level: stop.level }];
  }
  stopOf(id) {
    const found = STOPS.get(String(id || ''));
    if (!found) throw new GameError('There is no such stop on the circuit.', 404);
    return found.stop;
  }

  view(pid) {
    this.fights.sweep();
    const me = this.me(pid);
    if (me.run?.live && !this.fights.get(me.run.live)) me.run.live = null; // a restart called that round off
    return {
      ribbons: Array.from({ length: RIBBONS }, (_, k) => ({ n: k + 1, at: me.ribbons[k + 1] || null })),
      conceived: me.conceived || null,
      areas: AREAS.map((area) => ({ id: area.id, name: area.name, short: area.short, ribbon: area.ribbon, blurb: area.blurb, anyOrder: !!area.scale, open: !area.needs || !!me.ribbons[area.needs],
        stops: area.stops.map((stop) => ({ ...stop, ...(FIGHTS.includes(stop.kind) ? { bugs: this.bugsOf(pid, me, stop) } : {}), purse: purseOf(stop, area, Object.keys(me.ribbons).length), done: me.done[stop.id] || null, open: this.open(me, stop) })) })),
      cap: capFor(Object.keys(me.ribbons).length), trained: TRAINED, tolls: me.tolls || {},
      prizes: prizesOf(me), jars: this.shop?.jars(pid) || 0,
      cards: BOSSES().map((stop) => ({ id: stop.id, who: stop.who, poster: stop.poster, species: stop.bugs.at(-1).species, at: me.cards?.[stop.id] || null })),
      run: me.run && { stop: me.run.stop, foe: me.run.foe, foeHp: me.run.foeHp ?? 100, out: me.run.out, hp: me.run.hp, live: me.run.live },
      live: this.fights.fightOf(pid)?.id || null,
      ribbonXp: RIBBON_XP,
    };
  }

  /** Answer a talking stop (the Commissioner's question). */
  talk(pid, body = {}) {
    const stop = this.stopOf(body.stop), me = this.me(pid);
    if (stop.kind !== 'talk') throw new GameError('Nobody here wants to chat.', 409);
    if (!this.open(me, stop)) throw new GameError('Not yet. Finish the stops before it.', 409);
    const k = Number(body.answer);
    if (!Number.isInteger(k) || !stop.ask.options[k]) throw new GameError('Pick one of the answers.', 400);
    if (!me.done[stop.id]) { me.done[stop.id] = this.now(); me.conceived = stop.ask.options[k][0]; this.save(); }
    return { ...this.view(pid), reply: stop.ask.options[k][1] };
  }

  /** Send one of your bugs (`bug`, the partner if left out) against a trainer or the leader's next bug. */
  fight(pid, ownerName, body = {}) {
    const stop = this.stopOf(body.stop), me = this.me(pid);
    if (!FIGHTS.includes(stop.kind)) throw new GameError('There is nobody to fight here.', 409);
    if (!this.open(me, stop)) throw new GameError('Not yet. Finish the stops before it.', 409);
    if (me.done[stop.id]) throw new GameError(stop.kind === 'leader' ? 'That ribbon is already yours.' : stop.kind === 'boss' ? 'You hold that card already. It will not fight you twice.' : stop.kind === 'wild' ? 'You caught it. There was only the one.' : `${stop.who} has had enough for one lifetime.`, 409);
    if (this.fights.fightOf(pid)) throw new GameError('One of your bugs is in the ring right now.', 409);
    const pen = this.barn.ready(pid, body.bug ?? undefined), id = idOf(pen);
    let run = me.run?.stop === stop.id ? me.run : null;
    if ((stop.kind === 'leader' || stop.bugs?.length > 1) && !run) run = { stop: stop.id, foe: 0, foeHp: null, out: [], hp: {}, won: [], live: null, lineup: this.bugsOf(pid, me, stop) };
    if (run?.out.includes(id)) throw new GameError(`${pen.name} is out of this one. Send in someone else.`, 409);
    if (me.run && me.run !== run) me.run = null; // walked off another leader's gauntlet: it starts again next time
    const k = run ? run.foe : 0, foe = this.bugsOf(pid, me, stop)[k], health = run?.hp[id];
    // Chopper's tribute: whatever lunch your bug packed, his eats instead
    const lunch = stop.rule === 'tribute' ? pen.lunch || null : null;
    if (lunch) this.barn.lunchEaten(pid, pen.bornAt);
    const fightId = crypto.randomBytes(9).toString('base64url');
    const wild = stop.kind === 'wild', prizes = prizesOf(me).map((prize) => prize.id);
    if (wild) me.catch = null; // a new fight: whatever was lying there has gone
    const fighters = [{ ...this.barn.fighter(pid, pen), owner: ownerName, ...(prizes.length ? { prizes } : {}), ...(health != null ? { health } : {}), ...(stop.rule === 'tribute' ? { lunch: null } : {}) },
      wild ? { species: foe.species, name: foe.name, level: foe.level, wild: true } : // nobody's bug: no drilling, no gear
      { species: foe.species, name: foe.name, level: foe.level, mood: 100, gear: 0.06, defense: 0.06, trained: stop.trained ?? TRAINED, battle: { stance: foe.stance || 'balanced' }, owner: stop.who,
        ...(run?.foeHp != null ? { health: run.foeHp } : {}), ...(lunch ? { lunch } : {}), ...(stop.rule ? { rule: stop.rule, tell: stop.tell } : {}) }];
    this.fights.start({ id: fightId, kind: 'circuit', players: [pid, null], fighters, seed: `${this.now()}:${fightId}`, watching: [pid],
      onFinish: (fight) => this.settle(pid, stop, { id, bornAt: pen.bornAt }, foe, fight) });
    if (run) { run.live = fightId; me.run = run; }
    this.save();
    return this.view(pid);
  }

  /** A round is over. A draw goes to the home corner: it counts as a loss. */
  settle(pid, stop, bug, foe, fight) {
    const me = this.me(pid), S = fight.S, won = fight.over.winner === 0, fainted = S.hp[0] === 0;
    const res = this.barn.battleResult(pid, { battleId: fight.id, bornAt: bug.bornAt, won, fought: false, fainted,
      foeLevel: foe.level, foeName: stop.kind === 'wild' ? `a wild ${foe.name}` : `${stop.who}'s ${foe.name}`, odds: this.fights.lineOf(fight, 0), place: 'circuit' });
    const extra = { ...(res.xp ? { xpEarned: res.xp } : {}), levelBefore: res.levelBefore, levelAfter: res.levelAfter, ...(fainted ? { healthAfter: 0 } : {}) }; // a loss says nothing about XP: there is none
    const say = (line) => `${stop.who}: “${line}”`;
    const run = me.run?.stop === stop.id ? me.run : null;
    const area = STOPS.get(stop.id).area;
    // a boss beaten: its card, and its purse
    const card = () => { (me.cards ||= {})[stop.id] = this.now(); return [`Feature presentation card · “${stop.poster}”`, this.pay(pid, stop, area)]; };
    if (stop.kind === 'wild') { // knocked out, it lies there for the jar; anything else and it is back in the grass until next time
      if (won && S.hp[1] === 0) {
        me.catch = { stop: stop.id, fight: fight.id, species: foe.species, name: foe.name, level: foe.level, by: fight.fighters[0].level, jars: JAR.throws };
        extra.jar = this.jarOf(pid, me.catch); extra.verdict = `${foe.name} is out cold. Jar it before it comes to.`;
      } else extra.verdict = won ? `${foe.name} is beaten on points and slips away. It will be back.` : `${foe.name} keeps its spot.`;
    } else if (!run) {
      if (won) { me.done[stop.id] = this.now(); extra.spoils = stop.kind === 'boss' ? card() : [this.pay(pid, stop, area)]; }
      extra.verdict = say(won ? stop.won : stop.lost);
    } else {
      run.live = null;
      const pct = (i) => Math.max(1, Math.round((S.hp[i] / S.maxHp[i]) * 100));
      if (won) {
        run.hp[bug.id] = pct(0); run.foe += 1; run.foeHp = null;
        if (!run.won.includes(bug.bornAt)) run.won.push(bug.bornAt);
      } else {
        run.out.push(bug.id); run.foeHp = fight.over.winner === 1 ? pct(1) : run.foeHp;
      }
      const standing = this.barn.bugs(pid).filter((pen) => pen.stage === 'creature' && !pen.faintedAt && !run.out.includes(idOf(pen)));
      if (run.foe >= (run.lineup || stop.bugs).length && stop.kind === 'boss') {
        me.done[stop.id] = this.now(); me.run = null;
        extra.verdict = say(stop.won); extra.spoils = card();
      } else if (run.foe >= (run.lineup || stop.bugs).length) {
        me.done[stop.id] = me.ribbons[area.ribbon] = this.now(); me.run = null;
        for (const bornAt of run.won) {
          const got = this.barn.grantXp(pid, bornAt, RIBBON_XP);
          if (got && bornAt === bug.bornAt) { extra.xpEarned = (extra.xpEarned || 0) + RIBBON_XP; extra.levelAfter = got.levelAfter; }
        }
        extra.verdict = say(stop.won);
        const cap = capFor(Object.keys(me.ribbons).length);
        extra.spoils = [`Ribbon ${area.ribbon} · ${area.name}`, ...(PRIZES[stop.id] ? [`Prize: ${PRIZES[stop.id].name}`] : []), this.pay(pid, stop, area), `Your bugs can now reach level ${cap}`, `+${RIBBON_XP} XP to every bug that won a round`];
      } else if (!won && !standing.length) {
        me.run = null;
        extra.verdict = say(stop.lost);
      } else {
        extra.verdict = say(won ? stop.next : stop.sub);
        if (won) extra.carry = run.hp[bug.id]; // its health goes into the next round as it is
      }
    }
    if (fight.over.winner === null) extra.verdict += ' A draw goes to the home corner.';
    fight.extra = extra;
    this.save();
  }

  /** What a throw at the bug lying there is worth, for the ring. */
  jarOf(pid, c) {
    return { have: this.shop?.jars(pid) || 0, room: this.barn.room(pid), left: c.jars, chance: jarChance(rarityOf(c.species), c.level - c.by), keeps: caughtLevel(c.level, c.by) };
  }
  /**
   * Throw a jar at the wild bug your bug has just knocked out on the circuit: the mine's rules (server/pvp.js), three
   * throws while the fight is still on the books. Caught, it takes a stall and its stop is done for good.
   */
  jar(pid, body = {}) {
    const me = this.me(pid), c = me.catch, fight = c && this.fights.get(c.fight);
    if (!c || String(body.fight || '') !== c.fight) throw new GameError('It is gone.', 409);
    if (!fight) { me.catch = null; this.save(); throw new GameError('It came to and left. It will be back.', 409); }
    if (!this.barn.room(pid)) throw new GameError('Every stall is taken. Nowhere to put it.', 409);
    const held = this.randInt(1000) < Math.round(jarChance(rarityOf(c.species), c.level - c.by) * 1000);
    const wildId = `circuit:${c.stop}:${pid}:${c.fight}`;
    if (!this.shop.takeJar(pid, held ? { wildId, battleId: c.fight } : null)) throw new GameError('You are out of jars. The General Store sells them.', 409);
    if (held) {
      const caught = this.barn.adopt(pid, { wildId, battleId: c.fight, species: c.species, level: caughtLevel(c.level, c.by) });
      me.done[c.stop] = this.now(); me.catch = null;
      Object.assign(fight.extra, { jar: undefined, over: { reason: 'jarred', caught: caught.name }, verdict: `In the jar. ${caught.name} has a stall waiting.` });
    } else if (--c.jars <= 0) {
      me.catch = null;
      Object.assign(fight.extra, { jar: undefined, verdict: `${c.name} comes to and is gone. It will be back.` });
    } else fight.extra.jar = this.jarOf(pid, c);
    this.save();
    return { held, fight: this.fights.view(fight, pid, body.have) };
  }
  /** Pay a toll stop's tribute instead of fighting: it lets you past, with no purse and no XP. */
  payToll(pid, body = {}) {
    const stop = this.stopOf(body.stop), me = this.me(pid);
    if (stop.kind !== 'toll') throw new GameError('Nobody here is asking for money. For once.', 409);
    if (!this.open(me, stop)) throw new GameError('Not yet. Finish the stops before it.', 409);
    if (me.done[stop.id]) throw new GameError('You are already through.', 409);
    if (this.fights.fightOf(pid)) throw new GameError('One of your bugs is in the ring right now.', 409);
    const player = this.accounts.ensure(this.store.players[pid]);
    this.accounts.requireFunds(player, stop.toll, 'the toll');
    this.accounts.change(player, -stop.toll, 'circuit', `Bug Circuit: tribute to ${stop.who}`);
    me.done[stop.id] = this.now(); me.tolls = { ...(me.tolls || {}), [stop.id]: 'paid' }; this.save();
    return { ...this.view(pid), reply: stop.paid };
  }
  /** The stop's one-time purse, into the bankroll. Returns the line the ring shows. */
  pay(pid, stop, area) {
    const me = this.me(pid), held = Object.keys(me.ribbons).length - (stop.kind === 'leader' && me.ribbons[area.ribbon] ? 1 : 0); // a ribbon just won does not raise its own purse
    const amount = purseOf(stop, area, held), player = this.store.players[pid];
    if (amount && player && this.accounts) this.accounts.change(player, amount, 'circuit', `Bug Circuit: ${stop.kind === 'leader' ? `ribbon ${area.ribbon} from` : 'beat'} ${stop.who}`);
    return `$${amount} purse`;
  }
  /** Walk away from a leader's gauntlet between rounds. It starts from the first bug next time. */
  giveUp(pid) {
    const me = this.me(pid);
    if (me.run?.live && this.fights.get(me.run.live) && !this.fights.get(me.run.live).over) throw new GameError('Finish the round first.', 409);
    me.run = null; this.save();
    return this.view(pid);
  }
}
