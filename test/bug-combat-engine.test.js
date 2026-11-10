import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER, ABILITY_LEVELS } from '../server/engine/creatures.js';
import { MOVE_IDS, STANCES, movesFor, battleFor, combatStats } from '../server/engine/bug-combat.js';
import { simulateBout, MAX_ROUNDS } from '../server/engine/bout.js';

const fighter = (species, specials = [], stance = 'balanced', level = 10) => ({ species, name: species, level, mood: 80, battle: { stance, specials } });
const firstMove = (bout, by) => bout.rounds.find(event => event.by === by && event.type === 'move');

test('every species has five distinct moves at 3/4/6/8/10 and retains its three original names', () => {
  assert.deepEqual(ABILITY_LEVELS, [3, 4, 6, 8, 10]);
  for (const bug of ROSTER) {
    const moves = movesFor(bug.id, 10);
    assert.deepEqual(moves.map(move => move.id), MOVE_IDS);
    assert.deepEqual(moves.slice(0, 3).map(move => move.name), bug.abilities);
    assert.equal(new Set(moves.map(move => move.name)).size, 5);
    assert.equal(new Set(moves.map(move => move.effect)).size, 5);
    for (let level = 1; level <= 10; level++) assert.deepEqual(movesFor(bug.id, level).map(move => move.unlocked), ABILITY_LEVELS.map(at => level >= at));
    assert.ok(moves.every(move => move.description && Number.isFinite(move.power) && Number.isFinite(move.cooldown)));
    assert.deepEqual(movesFor(bug.id, 3, 3).map(move => move.unlocked), [true, true, true, false, false]);
  }
  assert.throws(() => movesFor('unknown', 10), /Unknown bug/);
});

test('battle defaults and saved choices never equip locked, duplicate or more than two specials', () => {
  assert.deepEqual(battleFor('ceroplophana', 3), { stance: 'balanced', specials: [] });
  assert.deepEqual(battleFor('ceroplophana', 6), { stance: 'balanced', specials: ['technique', 'signature'] });
  assert.deepEqual(battleFor('ceroplophana', 10, 0, { stance: 'defensive', specials: [] }), { stance: 'defensive', specials: [] });
  assert.deepEqual(battleFor('ceroplophana', 4, 0, { stance: 'constructor', specials: ['capstone', 'basic', 'technique', 'technique'] }), { stance: 'balanced', specials: ['technique'] });
  assert.deepEqual(battleFor('ceroplophana', 10, 0, { stance: 'aggressive', specials: ['tactic', 'signature', 'technique'] }).specials, ['tactic', 'signature']);
  assert.deepEqual(battleFor('ceroplophana', 3, 3).specials, ['technique', 'signature']);
  assert.deepEqual(combatStats(3), { maxHp: 100, damageMultiplier: 1 });
  assert.deepEqual(combatStats(10), { maxHp: 121, damageMultiplier: 1.14 });
  assert.deepEqual(combatStats(100), combatStats(10));
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
        const actor = [a, b][event.by]; assert.ok(event.moveId === 'basic' || actor.battle.specials.includes(event.moveId));
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
  for (const [species, effect, ratio] of [['ceroplophana', 'guard', 0.5], ['graphocephala', 'weaken', 0.65]]) {
    let checked = 0;
    for (let seed = 0; seed < 50; seed++) {
      const target = fighter('umbonia');
      const boosted = simulateBout(fighter(species, ['technique']), target, seed);
      const plain = simulateBout(fighter(species), target, seed);
      if (boosted.rounds[0].by !== 0 || !boosted.rounds[0].hit || !firstMove(boosted, 1).hit) continue;
      assert.equal(boosted.rounds[0].effect, effect);
      assert.ok(Math.abs(firstMove(boosted, 1).dmg - firstMove(plain, 1).dmg * ratio) <= 1);
      if (effect === 'guard') {
        const piercing = simulateBout(fighter(species, ['technique']), fighter('umbonia', ['technique']), seed);
        const unguarded = simulateBout(fighter(species), fighter('umbonia', ['technique']), seed);
        if (firstMove(piercing, 1).hit) assert.ok(Math.abs(firstMove(piercing, 1).dmg - firstMove(unguarded, 1).dmg * 0.75) <= 1);
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
  assert.ok(score / 600 > 0.5 && score / 600 < 0.8, `adjacent-level score ${score / 600}`);
});
