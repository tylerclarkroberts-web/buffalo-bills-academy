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

export const RIBBON_XP = 100;
export const RIBBONS = 8; // the leaders still to come show as empty hooks

export const AREAS = [{
  id: 'back40', name: 'The Back Forty', ribbon: 1, blurb: 'The field behind the Barn. Last mown in 2019.',
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
    { id: 'center', kind: 'center', who: 'Nurse Hikari', title: 'Bug Center', lines: ['Anything that faints out here, I can fix. Free after an hour\'s rest ♡'] },
    { id: 'pugh', kind: 'leader', who: 'Coach Deb Pugh', title: 'Ribbon 1', rule: 'dodgeball', tell: 'Coach Pugh puts the whistle to her lips…',
      bugs: [{ species: 'manticora', name: 'Dodgeball', level: 4, stance: 'aggressive' }, { species: 'nemoptera', name: 'Hall Pass', level: 5 }],
      intro: ['Alright, listen up! This is gym class. In gym class we HUSTLE.', 'Two bugs. Beat both and the ribbon is yours. Lose and you run laps.', 'When you hear the whistle, that ball is coming. Guard up or get beaned.'],
      next: 'That\'s one. Don\'t get cocky. I\'ve got a sub.', sub: 'Next! Sub in! Somebody sub in!',
      won: 'Hit the showers. …That was good hustle. Don\'t tell anyone I said that.', lost: 'LAPS! Come back when you\'ve stretched.' },
  ],
}];
const STOPS = new Map(AREAS.flatMap((area) => area.stops.map((stop, i) => [stop.id, { area, stop, i }])));

export class Circuit {
  constructor({ store, barn, fights, now }) {
    this.store = store; this.barn = barn; this.fights = fights || barn.fights; this.now = now;
    this.doc = store.loadDoc('circuit', { players: {} });
    this.doc.players ||= {};
  }
  save() { this.store.saveDoc('circuit', this.doc); }
  me(pid) { return (this.doc.players[pid] ||= { done: {}, ribbons: {}, run: null }); }

  /** Open once every stop before it in its area is done (the Bug Center never blocks anything). */
  open(me, stop) {
    const { area, i } = STOPS.get(stop.id);
    return stop.kind === 'center' || area.stops.slice(0, i).every((s) => s.kind === 'center' || me.done[s.id]);
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
      areas: AREAS.map((area) => ({ id: area.id, name: area.name, ribbon: area.ribbon, blurb: area.blurb,
        stops: area.stops.map((stop) => ({ ...stop, done: me.done[stop.id] || null, open: this.open(me, stop) })) })),
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
    if (stop.kind !== 'trainer' && stop.kind !== 'leader') throw new GameError('There is nobody to fight here.', 409);
    if (!this.open(me, stop)) throw new GameError('Not yet. Finish the stops before it.', 409);
    if (me.done[stop.id]) throw new GameError(stop.kind === 'leader' ? 'That ribbon is already yours.' : `${stop.who} has had enough for one lifetime.`, 409);
    if (this.fights.fightOf(pid)) throw new GameError('One of your bugs is in the ring right now.', 409);
    const pen = this.barn.ready(pid, body.bug ?? undefined), id = idOf(pen);
    let run = me.run?.stop === stop.id ? me.run : null;
    if (stop.kind === 'leader' && !run) run = { stop: stop.id, foe: 0, foeHp: null, out: [], hp: {}, won: [], live: null };
    if (run?.out.includes(id)) throw new GameError(`${pen.name} is out of this one. Send in someone else.`, 409);
    if (me.run && me.run !== run) me.run = null; // walked off another leader's gauntlet: it starts again next time
    const k = run ? run.foe : 0, foe = stop.bugs[k], health = run?.hp[id];
    const fightId = crypto.randomBytes(9).toString('base64url');
    const fighters = [{ ...this.barn.fighter(pid, pen), owner: ownerName, ...(health != null ? { health } : {}) },
      { species: foe.species, name: foe.name, level: foe.level, mood: 75, battle: { stance: foe.stance || 'balanced' }, owner: stop.who,
        ...(run?.foeHp != null ? { health: run.foeHp } : {}), ...(stop.rule ? { rule: stop.rule, tell: stop.tell } : {}) }];
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
      foeLevel: foe.level, foeName: `${stop.who}'s ${foe.name}`, odds: this.fights.lineOf(fight, 0), place: 'circuit' });
    const extra = { ...(res.xp ? { xpEarned: res.xp } : {}), levelBefore: res.levelBefore, levelAfter: res.levelAfter, ...(fainted ? { healthAfter: 0 } : {}) }; // a loss says nothing about XP: there is none
    const say = (line) => `${stop.who}: “${line}”`;
    const run = me.run?.stop === stop.id ? me.run : null;
    if (stop.kind === 'trainer') {
      if (won) me.done[stop.id] = this.now();
      extra.verdict = say(won ? stop.won : stop.lost);
    } else if (run) {
      run.live = null;
      const pct = (i) => Math.max(1, Math.round((S.hp[i] / S.maxHp[i]) * 100));
      if (won) {
        run.hp[bug.id] = pct(0); run.foe += 1; run.foeHp = null;
        if (!run.won.includes(bug.bornAt)) run.won.push(bug.bornAt);
      } else {
        run.out.push(bug.id); run.foeHp = fight.over.winner === 1 ? pct(1) : run.foeHp;
      }
      const standing = this.barn.bugs(pid).filter((pen) => pen.stage === 'creature' && !pen.faintedAt && !run.out.includes(idOf(pen)));
      if (run.foe >= stop.bugs.length) {
        const area = STOPS.get(stop.id).area;
        me.done[stop.id] = me.ribbons[area.ribbon] = this.now(); me.run = null;
        for (const bornAt of run.won) {
          const got = this.barn.grantXp(pid, bornAt, RIBBON_XP);
          if (got && bornAt === bug.bornAt) { extra.xpEarned = (extra.xpEarned || 0) + RIBBON_XP; extra.levelAfter = got.levelAfter; }
        }
        extra.verdict = say(stop.won);
        extra.spoils = [`Ribbon ${area.ribbon} · ${area.name}`, `+${RIBBON_XP} XP to every bug that won a round`];
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

  /** Walk away from a leader's gauntlet between rounds. It starts from the first bug next time. */
  giveUp(pid) {
    const me = this.me(pid);
    if (me.run?.live && this.fights.get(me.run.live) && !this.fights.get(me.run.live).over) throw new GameError('Finish the round first.', 409);
    me.run = null; this.save();
    return this.view(pid);
  }
}
