// Species fact cards: every catchable bug has an entry, the strangest fact comes first, and the card opens once after a catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUGS } from '../server/engine/bugs.js';
import { FACTS, factsFor, factCard, shouldShowCatchFacts, FOUND_MAX, EATS_MAX, FACT_MAX, STAGE_II_NAME } from '../server/engine/bug-facts.js';

test('every catchable species has a fact-card entry with a range, a diet and two or three facts', () => {
  assert.equal(Object.keys(FACTS).length, BUGS.length);
  for (const bug of BUGS) {
    const f = factsFor(bug.id);
    assert.ok(f, `${bug.id} has an entry`);
    assert.equal(f.name, bug.name);
    assert.equal(f.sci, bug.sci);
    assert.ok(f.found, `${bug.id} has a range`);
    assert.ok(f.eats, `${bug.id} has a diet`);
    assert.ok(f.found.length <= FOUND_MAX, `${bug.id} found is short enough for one screen`);
    assert.ok(f.eats.length <= EATS_MAX, `${bug.id} eats is short enough for one screen`);
    assert.ok(f.facts.length >= 2 && f.facts.length <= 3, `${bug.id} has 2 or 3 facts`);
    for (const [i, text] of f.facts.entries()) {
      assert.ok(text && text.length <= FACT_MAX, `${bug.id} fact ${i} is short enough for one screen`);
    }
    assert.ok(f.kind === 'science' || f.kind === 'lore', `${bug.id} is science or lore`);
    const card = factCard(bug.id);
    assert.equal(card.found, f.found);
    assert.equal(card.facts.length, f.facts.length, `${bug.id} shows every fact at once, with no pager`);
  }
});

test('the most striking facts come first', () => {
  assert.match(FACTS.ampulex.facts[0], /brain|antenna/);
  assert.match(FACTS.colobopsis.facts[0], /bursts/);
  assert.match(FACTS.photuris.facts[0], /flash/);
  assert.match(FACTS.phloeodes.facts[0], /car/);
  assert.match(FACTS.trachelophorus.facts[0], /necks/);
  assert.match(FACTS.onymacris.facts[0], /headstand/);
  assert.match(FACTS.odontomachus.facts[0], /microseconds/);
});

test('STEEZE, Bloom Eye and botched rebuilds are marked as Academy lore, not science', () => {
  assert.equal(FACTS.steeze.kind, 'lore');
  assert.equal(factCard('steeze').factsLabel, 'Academy lore');
  assert.equal(factCard('ampulex').factsLabel, 'Factoids');
  assert.equal(STAGE_II_NAME.pseudocreobotra, 'Bloom Eye');
  const wild = factCard('pseudocreobotra');
  assert.equal(wild.lore.some((p) => p.key === 'stage2'), false, 'a wild catch does not mention Bloom Eye');
  assert.equal(wild.kind, 'science');
  const evolved = factCard('pseudocreobotra', { evo: 1 });
  const bloom = evolved.lore.find((p) => p.key === 'stage2');
  assert.match(bloom.text, /Bloom Eye/);
  assert.match(bloom.text, /not a wild insect/);
  const botched = factCard('lamprima', { botched: 'lazy' }).lore.find((p) => p.key === 'botched');
  assert.match(botched.text, /botched \(lazy\)/);
  assert.match(botched.text, /not natural history/);
  const thanks = factCard('menacanthus').lore.find((p) => p.key === 'note');
  assert.match(thanks.text, /Thanksgiving/);
  assert.match(FACTS.menacanthus.found, /Poultry yards worldwide/);
  assert.equal(/Thanksgiving/.test(FACTS.menacanthus.found), false, 'the science range does not mention Thanksgiving');
});

test('the fact card opens once after a successful catch and not on a replay', () => {
  assert.equal(shouldShowCatchFacts({ reason: 'jarred' }), true);
  assert.equal(shouldShowCatchFacts({ reason: 'jarred', replay: true }), false, 'a replay of a catch does not open it again');
  assert.equal(shouldShowCatchFacts({ reason: 'jarred', dismissed: true }), false, 'dismissing it closes it for this catch');
  assert.equal(shouldShowCatchFacts({ reason: 'jarred', tossing: true }), false, 'it waits until the jar has landed');
  assert.equal(shouldShowCatchFacts({ reason: 'ko' }), false);
  assert.equal(shouldShowCatchFacts({ reason: 'timeout' }), false);
  assert.equal(shouldShowCatchFacts({}), false);
  assert.equal(shouldShowCatchFacts({ reason: 'jarred', replay: false, dismissed: false, tossing: false }), true);
});
