// Bug types: the chart is consistent, every species has a place in it, an edge is worth what the notes say, and each
// type's perk does what its card says from level 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateBout, startBout, stepBout, odds } from '../server/engine/bout.js';
import { ROSTER } from '../server/engine/creatures.js';
import { TYPES, WHY, LIVE_TYPES, RARITY, EDGE, PERK, typeOf, rarityOf, edge, weakTo, typeEdge, perkFor } from '../server/engine/bug-types.js';
import { TRAIT, traitFor } from '../server/engine/bug-combat.js';

test('the chart: nothing beats itself or its own beater, every pairing has its reason, and every type beats three and loses to three', () => {
  const keys = Object.keys(TYPES), pairs = keys.flatMap((a) => TYPES[a].beats.map((b) => `${a}>${b}`));
  assert.deepEqual(Object.keys(WHY).sort(), pairs.sort(), 'one reason for each pairing, and no others');
  for (const a of keys) {
    assert.ok(TYPES[a].beats.every((b) => keys.includes(b) && b !== a && !TYPES[b].beats.includes(a)), `${a} beats real types, never itself, never both ways`);
    assert.deepEqual([TYPES[a].beats.length, weakTo(a).length], [3, 3], `${a} beats three and loses to three`);
    for (const b of keys) assert.equal(edge(a, b) + edge(b, a), 0, `${a} and ${b} agree on who beats whom`);
  }
  assert.deepEqual(LIVE_TYPES, keys, 'every type has species');
  const everyday = ['flier', 'brawler', 'shell', 'toxic', 'ambush', 'dazzle'], later = ['fire', 'sonic', 'water'];
  for (const type of everyday) { // among themselves the six are even too, and each beats one of the three and loses to one
    assert.equal(TYPES[type].beats.filter((b) => everyday.includes(b)).length, 2, `${type} beats two of the six`);
    assert.equal(weakTo(type).filter((b) => everyday.includes(b)).length, 2, `${type} loses to two of the six`);
  }
  for (const type of later) assert.equal(TYPES[type].beats.filter((b) => later.includes(b)).length, 1, `${type} beats one of the other two`);
  for (const type of keys) assert.ok(ROSTER.filter((bug) => typeOf(bug.id) === type).length >= 3, `${type} has at least three species`);
  for (const bug of ROSTER) {
    assert.ok(TYPES[typeOf(bug.id)] && RARITY[rarityOf(bug.id)], `${bug.id} has a type and a rarity`);
    assert.equal(bug.stats.atk + bug.stats.def + bug.stats.spd, { 3: 10, 4: 11 }[rarityOf(bug.id)] || 9, `${bug.id}: a rare has one more stat point than the rest, a legendary two`);
    assert.ok(bug.facts.length >= 5 && bug.sources.length >= 1, `${bug.id} has its facts and where they came from`);
  }
  assert.deepEqual(ROSTER.filter((bug) => rarityOf(bug.id) === 3).map((bug) => bug.id), ['pheropsophus', 'brevisana', 'halobates', 'phloeodes', 'arachnocampa', 'peruphasma', 'ampulex', 'colobopsis', 'menacanthus']);
  assert.deepEqual([typeEdge('nemoptera', 'lamprima'), typeEdge('lamprima', 'nemoptera'), typeEdge('nemoptera', 'eupholus'), typeEdge('nemoptera', 'nemoptera')], [EDGE.strong, EDGE.weak, 1, 1], 'Flier on Brawler, Brawler on Flier, no edge, same type');
  assert.deepEqual([typeEdge(null, 'lamprima'), typeEdge('lamprima', null), typeEdge('nobody', 'lamprima')], [1, 1, 1], 'a fighter with no type has no edge either way');
});

test('in the ring the type that beats the other wins about four fights in five, and no type or species runs away with the field', () => {
  const fighter = (bug) => ({ species: bug.id, name: bug.id, level: 5, mood: 60 }), SEEDS = 20;
  const favoured = [0, 0], byType = Object.fromEntries(LIVE_TYPES.map((type) => [type, [0, 0]]));
  for (const mine of ROSTER) {
    if (mine.id === 'steeze') continue; // a gag: his moves do no damage, so he is not on the type-balance card
    let won = 0, fought = 0;
    for (const theirs of ROSTER) if (theirs !== mine && theirs.id !== 'steeze') {
      let w = 0;
      for (let s = 0; s < SEEDS; s++) { const o = simulateBout(fighter(mine), fighter(theirs), `types:${s}`).winner; w += o === 0 ? 1 : o === null ? 0.5 : 0; }
      won += w; fought += SEEDS;
      if (edge(typeOf(mine.id), typeOf(theirs.id)) > 0) { favoured[0] += w; favoured[1] += SEEDS; }
    }
    byType[typeOf(mine.id)][0] += won; byType[typeOf(mine.id)][1] += fought;
    assert.ok(won / fought > 0.35 && won / fought < (rarityOf(mine.id) === 4 ? 0.8 : 0.65), `${mine.id} wins ${Math.round((100 * won) / fought)}% of its level 5 bouts`);
  }
  const edgeRate = favoured[0] / favoured[1];
  assert.ok(edgeRate > 0.74 && edgeRate < 0.86, `the favoured type wins ${Math.round(100 * edgeRate)}%`);
  for (const [type, [won, fought]] of Object.entries(byType)) assert.ok(Math.abs(won / fought - 0.5) < 0.06, `${type} wins ${Math.round((100 * won) / fought)}% over the field`);
  // (with the perks on, levels 1 and 10 were measured too: every type within about five points of even, the edge 77% to 79%)
  // a plain fighter (tests, balance runs) has no type, so the same pairing fought plain does not lean
  let plain = 0;
  for (let s = 0; s < 200; s++) plain += simulateBout({ ...fighter(ROSTER.find((b) => b.id === 'nemoptera')), plain: true }, { ...fighter(ROSTER.find((b) => b.id === 'lamprima')), plain: true }, `plain:${s}`).winner === 0 ? 1 : 0;
  assert.ok(plain / 200 > 0.35 && plain / 200 < 0.65, `with no types Flier against Brawler is ${Math.round(plain / 2)}%`);
});

test('each type has its perk, and it works from level 1', () => {
  const f = (species, more = {}) => ({ species, name: species, level: 1, mood: 60, ...more });
  const open = (a, b, more) => { const S = startBout(f(a, more), f(b, more), 'perk'); return { S, mine: odds(S, 0) }; };
  const near = (got, want, what) => assert.ok(Math.abs(got - want) <= 1, `${what}: ${got}, about ${want}`);
  for (const type of LIVE_TYPES) assert.ok(perkFor(type).name && perkFor(type).description, `${type} says what it gives`);

  // Flier, Quick: two targets of the same speed, one of them a Flier
  assert.ok(Math.abs(open('lamprima', 'chrysochroa').mine.basic.hit - open('lamprima', 'phrictus').mine.basic.hit - PERK.quick) < 1e-9);
  // Brawler, Heavy: every hit, against a type it has no edge on, set beside the same fight with no types
  for (const move of ['basic', 'technique']) near(open('lamprima', 'manticora').mine[move].dmg[1], open('lamprima', 'manticora', { plain: true }).mine[move].dmg[1] * (1 + PERK.heavy), `a Brawler's ${move}`);
  // Shell, Armour: less from a plain hit, nothing off a pierce (a Flier has no edge on a Shell)
  const onShell = open('phrictus', 'onymacris', { level: 10 }).mine, bare = open('phrictus', 'onymacris', { level: 10, plain: true }).mine;
  near(onShell.basic.dmg[1], bare.basic.dmg[1] * (1 - PERK.armour), 'a strike on a Shell'); assert.equal(onShell.capstone.dmg[1], bare.capstone.dmg[1], 'a pierce on a Shell');
  // Ambush, First strike: the first attack only
  const ambush = open('deroplatys', 'umbonia'), calm = open('deroplatys', 'umbonia', { plain: true }).mine;
  assert.equal(ambush.mine.basic.hit, 1); near(ambush.mine.basic.dmg[1], calm.basic.dmg[1] * (1 + PERK.strike), 'an Ambush bug\'s first strike');
  while (ambush.S.side[0].attacks < 1) stepBout(ambush.S, 'basic');
  const second = odds(ambush.S, 0).basic;
  assert.ok(second.hit < 1); near(second.dmg[1], calm.basic.dmg[1], 'its second strike');
  // Toxic, Taint: a landed hit poisons a target that is not poisoned, and the poison ticks on that bug's turns
  const toxic = open('sphaerocoris', 'onymacris'), rounds = [];
  assert.deepEqual(toxic.mine.basic.venom, [PERK.toxin, 2], 'the move panel says so before the hit');
  while (!toxic.S.over && rounds.filter((r) => r.type === 'venom').length < 2) rounds.push(...stepBout(toxic.S, 'basic'));
  const strike = rounds.find((r) => r.by === 0 && r.type === 'move' && r.hit);
  assert.equal(strike.moveId, 'basic'); assert.equal(strike.poisons, true); assert.match(strike.line, /poisons for two turns/);
  assert.deepEqual(rounds.filter((r) => r.type === 'venom' && r.by === 0).map((r) => r.dmg).slice(0, 2), [PERK.toxin, PERK.toxin]);
  // Fire, Flare-up: below half health its hits are harder (two Fire bugs, so no edge either way)
  const fire = open('pyrrhocoris', 'solenopsis'), cool = fire.mine.basic.dmg[0];
  fire.S.hp[0] = Math.floor(fire.S.maxHp[0] * 0.4);
  near(odds(fire.S, 0).basic.dmg[0], cool * (1 + PERK.flare), 'a Fire bug below half');
  // Sonic, Loud: a guard blocks less of its hits than of anyone else's
  const guarded = (attacker) => { const { S, mine } = open(attacker, 'pyrrhocoris'); S.side[1].guard = 0.5; return odds(S, 0).basic.dmg[1] / mine.basic.dmg[1]; };
  assert.ok(Math.abs(guarded('pyrrhocoris') - 0.5) < 0.06 && Math.abs(guarded('gryllotalpa') - (1 - 0.5 * (1 - PERK.loud))) < 0.06, 'half blocked for most, less for a Sonic bug');
  // Water, Dive: after a hit lands on it, the next attack against it is less likely to hit (a Shell has no edge on Water)
  const pond = open('onymacris', 'dytiscus'), dry = pond.mine.basic.hit;
  pond.S.side[1].under = true;
  assert.ok(Math.abs(dry - odds(pond.S, 0).basic.hit - PERK.dive) < 1e-9);
  // and two of the newer traits. The backswimmer: only the first attack against it is thrown off
  for (const bug of ROSTER) assert.ok(traitFor(bug.id).name && traitFor(bug.id).description, `${bug.id} has a trait`);
  const swim = open('onymacris', 'notonecta'), surprised = swim.mine.basic.hit;
  swim.S.side[1].met = true;
  assert.ok(Math.abs(odds(swim.S, 0).basic.hit - surprised - TRAIT.upside) < 1e-9);
  // the hissing cockroach: the first three attacks against it do less, the fourth does not
  const hiss = open('pyrrhocoris', 'gromphadorhina'), hissedAt = hiss.mine.basic.dmg[1];
  hiss.S.side[0].attacks = 3;
  near(hissedAt, odds(hiss.S, 0).basic.dmg[1] * (1 - TRAIT.hiss), 'a strike at a cockroach that is still hissing');
  // and three of the newest. The ironclad beetle: no hit takes more than a share of its health, whatever throws it
  const iron = open('lamprima', 'phloeodes', { level: 10 });
  for (const move of Object.values(iron.mine)) if (move.dmg) assert.ok(move.dmg[1] <= Math.round(iron.S.maxHp[1] * TRAIT.iron));
  // the glowworm: every attack against it leaves the attacker in one more thread
  const lines = open('pyrrhocoris', 'arachnocampa'), free = lines.mine.basic.dmg[1];
  lines.S.side[0].attacks = 10;
  near(odds(lines.S, 0).basic.dmg[1], free * (1 - 10 * TRAIT.thread), 'a strike from ten threads in');
  // the exploding ant: the blow that would knock it out sets it off instead, once. It wins on 1 HP if that finishes the opponent, and goes down if not
  let bursts = 0, saved = 0;
  for (let seed = 0; seed < 40; seed++) {
    const S = startBout(f('colobopsis'), f('onymacris'), `goo:${seed}`), goo = [];
    while (!S.over) goo.push(...stepBout(S, 'basic').filter((r) => r.ability === 'Yellow Goo'));
    assert.ok(goo.length <= 1, 'only once a fight');
    if (S.winner === 1) assert.equal(goo.length, 1, 'it never goes down without bursting');
    for (const r of goo) {
      bursts++; assert.ok(r.dmg <= TRAIT.goo); assert.deepEqual(S.rounds.at(-1), r, 'the burst ends the fight either way');
      if (r.hp[1] === 0) { saved++; assert.deepEqual([r.hp[0], S.winner], [1, 0]); } else assert.deepEqual([r.hp[0], S.winner], [0, 1]);
    }
  }
  assert.ok(bursts >= 10 && saved >= 1 && saved < bursts, `${bursts} bursts, ${saved} of them won the fight`);
  near(open('colobopsis', 'pyrrhocoris').mine.basic.dmg[1], open('colobopsis', 'pyrrhocoris', { plain: true }).mine.basic.dmg[1] * (1 - TRAIT.minor), 'and it bites like a minor worker');
  // Dazzle, Startle: the first time it is left below half, the other bug's next attack is off, once
  let flashes = 0, halved = 0;
  for (let seed = 0; seed < 5; seed++) {
    const S = startBout(f('chrysochroa'), f('lamprima'), `startle:${seed}`);
    while (!S.over) {
      const step = stepBout(S, 'basic'), flashed = step.find((r) => /flashes its colours/.test(r.line));
      if (!flashed) continue;
      flashes++;
      assert.ok(S.hp[0] > 0 && S.hp[0] < S.maxHp[0] / 2); assert.equal(S.side[1].spots, PERK.startle);
      const full = (() => { S.side[1].spots = 0; const d = odds(S, 1).basic.dmg[0]; S.side[1].spots = PERK.startle; return d; })();
      if (full < S.hp[0]) { halved++; near(odds(S, 1).basic.dmg[0], full * (1 - PERK.startle), 'the startled bug\'s next strike'); } // a blow is never more than the HP left
      while (!S.over && S.side[1].spots) stepBout(S, 'basic');
      assert.equal(S.side[1].spots, 0, 'the spots clear with its next attack');
      while (!S.over) assert.ok(!stepBout(S, 'basic').some((r) => /flashes its colours/.test(r.line)), 'only once a fight');
    }
  }
  assert.ok(flashes >= 3 && halved >= 1, 'a Dazzle bug that drops below half flashes');
});
