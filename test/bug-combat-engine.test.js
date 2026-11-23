import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER, ABILITY_LEVELS } from '../server/engine/creatures.js';
import { MOVE_IDS, STANCES, movesFor, battleFor, combatStats } from '../server/engine/bug-combat.js';
import { simulateBout, startBout, stepBout, MAX_ROUNDS } from '../server/engine/bout.js';

const fighter = (species, specials = [], stance = 'balanced', level = 10) => ({ species, name: species, level, mood: 80, plain: true, battle: { stance, specials } });
const firstMove = (bout, by) => bout.rounds.find(event => event.by === by && event.type === 'move');

test('every species has five distinct moves at 1/1/4/7/10 and retains its three original names', () => {
  assert.deepEqual(ABILITY_LEVELS, [1, 1, 4, 7, 10]);
  for (const bug of ROSTER) {
    const moves = movesFor(bug.id, 10);
    assert.deepEqual(moves.map(move => move.id), MOVE_IDS);
    assert.deepEqual(moves.slice(0, 3).map(move => move.name), bug.abilities);
    assert.equal(new Set(moves.map(move => move.name)).size, 5);
    if (bug.id === 'steeze') {
      assert.ok(moves.every((move) => move.effect === 'flourish' && move.power === 0 && move.flourish), 'STEEZE only flourishes, and never deals damage');
    } else {
      assert.equal(new Set(moves.map(move => move.effect)).size, 5);
    }
    for (let level = 1; level <= 10; level++) assert.deepEqual(movesFor(bug.id, level).map(move => move.unlocked), ABILITY_LEVELS.map(at => level >= at));
    assert.ok(moves.every(move => move.description && Number.isFinite(move.power) && Number.isFinite(move.cooldown)));
    assert.deepEqual(movesFor(bug.id, 3, 3).map(move => move.unlocked), [true, true, true, false, false]);
  }
  assert.throws(() => movesFor('unknown', 10), /Unknown bug/);
});

test('a bug left alone reaches for every special it has learned; only the stance is saved', () => {
  const all = ['technique', 'signature', 'tactic', 'capstone'];
  assert.deepEqual(battleFor('ceroplophana', 1), { stance: 'balanced', specials: ['technique'] });
  assert.deepEqual(battleFor('ceroplophana', 6), { stance: 'balanced', specials: ['technique', 'signature'] });
  assert.deepEqual(battleFor('ceroplophana', 10, 0, { stance: 'defensive', specials: [] }), { stance: 'defensive', specials: all }, 'an older save that chose two no longer limits it');
  assert.deepEqual(battleFor('ceroplophana', 4, 0, { stance: 'constructor', specials: ['capstone', 'basic'] }), { stance: 'balanced', specials: ['technique', 'signature'] });
  assert.deepEqual(battleFor('ceroplophana', 3, 3).specials, ['technique', 'signature'], 'a move learned on the old schedule stays learned');
  assert.deepEqual(combatStats(1), { maxHp: 100, damageMultiplier: 1 });
  assert.deepEqual(combatStats(3), { maxHp: 110, damageMultiplier: 1.06 });
  assert.deepEqual(combatStats(10), { maxHp: 145, damageMultiplier: 1.27 });
  assert.deepEqual(combatStats(100), combatStats(30), 'nothing grows past level 30');
  assert.deepEqual(combatStats(NaN), combatStats(3));
});

test('automatic fights are deterministic, bounded and respect loadouts, HP and own-turn cooldowns', () => {
  for (const bug of ROSTER) for (const stance of Object.keys(STANCES)) {
    const a = fighter(bug.id, ['technique', 'capstone'], stance), b = fighter('platymeris', ['technique', 'signature']);
    const before = structuredClone([a, b]), bout = simulateBout(a, b, 'bounded');
    assert.deepEqual(bout, simulateBout(a, b, 'bounded')); assert.deepEqual([a, b], before);
    assert.ok(bout.rounds.length > 0 && bout.rounds.length <= MAX_ROUNDS * 2);
    const lastUsed = [{}, {}], previous = [...bout.maxHp];
    for (const event of bout.rounds) {
      assert.ok(event.turn <= MAX_ROUNDS);
      event.hp.forEach((hp, i) => assert.ok(hp >= 0 && hp <= bout.maxHp[i]));
      assert.equal(event.hp[1 - event.by], Math.max(0, previous[1 - event.by] - event.dmg));
      assert.equal(event.hp[event.by], previous[event.by] + (event.healed || 0));
      if (event.type === 'move') {
        const actor = [a, b][event.by]; assert.ok(movesFor(actor.species, actor.level).find(move => move.id === event.moveId).unlocked);
        const move = movesFor(actor.species, actor.level).find(move => move.id === event.moveId);
        if (lastUsed[event.by][event.moveId]) assert.ok(event.ownTurn - lastUsed[event.by][event.moveId] >= move.cooldown);
        lastUsed[event.by][event.moveId] = event.ownTurn;
        if (event.effect === 'heal') { assert.ok(previous[event.by] <= bout.maxHp[event.by] * 0.65); assert.ok(event.healed > 0); assert.equal(event.dmg, 0); }
      }
      previous.splice(0, 2, ...event.hp);
    }
    const score = previous[0] * bout.maxHp[1] - previous[1] * bout.maxHp[0];
    assert.equal(bout.winner, score === 0 ? null : score > 0 ? 0 : 1);
  }
});

test('guard and weakening reduce the next attack; piercing bypasses half the guard', () => {
  // Side 0 opens with the move under test and umbonia answers; the same seed gives both versions the same rolls.
  const exchange = (species, opener, reply, seed) => {
    const S = startBout(fighter(species), fighter('umbonia'), seed);
    if (S.by !== 0) return null;
    const first = stepBout(S, opener).find(event => event.type === 'move'), second = stepBout(S, reply).find(event => event.type === 'move');
    return first.hit && second.hit ? { first, second } : null;
  };
  for (const [species, effect, ratio] of [['ceroplophana', 'guard', 0.5], ['graphocephala', 'weaken', 0.65]]) {
    let checked = 0;
    for (let seed = 0; seed < 50; seed++) {
      const boosted = exchange(species, 'technique', 'basic', seed), plain = exchange(species, 'basic', 'basic', seed);
      if (!boosted || !plain) continue;
      assert.equal(boosted.first.effect, effect);
      assert.ok(Math.abs(boosted.second.dmg - plain.second.dmg * ratio) <= 1);
      if (effect === 'guard') { // umbonia's technique is its pierce
        const piercing = exchange(species, 'technique', 'technique', seed), unguarded = exchange(species, 'basic', 'technique', seed);
        if (piercing && unguarded) assert.ok(Math.abs(piercing.second.dmg - unguarded.second.dmg * 0.75) <= 1);
      }
      checked++;
    }
    assert.ok(checked > 5);
  }
});

test('venom adds bounded damage events, healing restores HP, and stance changes move priority', () => {
  const bout = simulateBout(fighter('platymeris', ['technique']), fighter('bocydium', ['technique']), 'effects');
  const venomHits = bout.rounds.filter(event => event.type === 'move' && event.effect === 'venom' && event.hit);
  const ticks = bout.rounds.filter(event => event.type === 'venom');
  assert.ok(ticks.length > 0 && ticks.length <= venomHits.length * 2);
  assert.ok(ticks.every(event => event.by === 0 && event.dmg > 0 && event.line.includes('venom')));
  assert.ok(bout.rounds.some(event => event.effect === 'heal' && event.healed > 0));
  const a = fighter('ceroplophana', ['technique', 'signature']);
  const aggressive = simulateBout({ ...a, battle: { ...a.battle, stance: 'aggressive' } }, fighter('umbonia'), 1);
  const defensive = simulateBout({ ...a, battle: { ...a.battle, stance: 'defensive' } }, fighter('umbonia'), 1);
  assert.equal(firstMove(aggressive, 0).effect, 'pierce');
  assert.equal(firstMove(defensive, 0).effect, 'guard');
});

test('levels without a new move still improve combat strength', () => {
  let score = 0;
  for (let seed = 0; seed < 600; seed++) {
    const bout = simulateBout(fighter('ceroplophana', ['technique', 'signature'], 'balanced', 7), fighter('ceroplophana', ['technique', 'signature'], 'balanced', 6), seed);
    score += bout.winner === 0 ? 1 : bout.winner === null ? 0.5 : 0;
  }
  assert.ok(score / 600 > 0.55 && score / 600 < 0.88, `adjacent-level score ${score / 600}`);
});

test('only piercing capstones advertise the 5% critical chance', () => {
  for (const bug of ROSTER) for (const move of movesFor(bug.id, 10)) {
    const eligible = move.id === 'capstone' && move.effect === 'pierce';
    assert.equal(move.criticalChance, eligible ? 0.05 : undefined);
    assert.equal(move.description.includes('5% chance'), eligible);
    if (eligible) assert.equal(movesFor(bug.id, 9).find(m => m.id === move.id).unlocked, false);
  }
});

test('rare seeded criticals leave 1 HP, keep normal knockouts and never heal or affect other moves', () => {
  const a = fighter('bocydium'), b = fighter('bocydium');
  let criticals = 0, firstHits = 0, firstCriticals = 0, capstoneKnockouts = 0, oneHpKnockouts = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const bout = startBout(a, b, `critical-${seed}`); // both owners ask for the capstone whenever it is ready
    while (!bout.over) stepBout(bout, 'capstone');
    const first = bout.rounds[0];
    if (first.hit) { firstHits++; if (first.critical) firstCriticals++; }
    let previous = bout.maxHp;
    for (const event of bout.rounds) {
      const target = 1 - event.by;
      assert.equal(event.hp[target], previous[target] - event.dmg);
      assert.ok(event.dmg >= 0 && event.hp[target] >= 0);
      if (event.critical) {
        criticals++;
        assert.equal(event.moveId, 'capstone'); assert.equal(event.effect, 'pierce'); assert.equal(event.hit, true);
        assert.ok(previous[target] > 1); assert.equal(event.hp[target], 1);
        assert.match(event.line, /critical hit.*1 HP/);
      }
      if (event.hp[target] === 0) {
        assert.equal(event.critical, false, 'a normal knockout must not become a critical that restores 1 HP');
        if (event.moveId === 'capstone') capstoneKnockouts++;
        if (previous[target] === 1) oneHpKnockouts++;
      }
      previous = event.hp;
    }
  }
  assert.ok(criticals > 0 && capstoneKnockouts > 0 && oneHpKnockouts > 0);
  assert.ok(firstCriticals / firstHits > 0.03 && firstCriticals / firstHits < 0.07, `first-hit critical rate: ${firstCriticals / firstHits}`);
  for (let seed = 0; seed < 100; seed++) {
    const bout = simulateBout(fighter('ceroplophana', ['signature', 'capstone']), fighter('platymeris', ['technique', 'signature']), seed);
    assert.ok(bout.rounds.every(event => !event.critical), 'ordinary piercing, healing and venom cannot critically reduce HP to 1');
  }
});
