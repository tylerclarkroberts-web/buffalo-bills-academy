// Species fact cards: every catchable bug has an entry, and the card opens once after a catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUGS } from '../server/engine/bugs.js';
import { FACTS, factsFor, factPages, shouldShowCatchFacts, FOUND_MAX, EATS_MAX, FACT_MAX, STAGE_II_NAME } from '../server/engine/bug-facts.js';

test('every catchable species has a fact-card entry with a range, a diet and two or three facts', () => {
  assert.equal(Object.keys(FACTS).length, BUGS.length);
  for (const bug of BUGS) {
    const f = factsFor(bug.id);
    assert.ok(f, `${bug.id} has an entry`);
    assert.equal(f.name, bug.name);
    assert.equal(f.sci, bug.sci);
    assert.ok(f.found, `${bug.id} has a range`);
    assert.ok(f.eats, `${bug.id} has a diet`);
    assert.ok(f.found.length <= FOUND_MAX, `${bug.id} found is short enough`);
    assert.ok(f.eats.length <= EATS_MAX, `${bug.id} eats is short enough`);
    assert.ok(f.facts.length >= 2 && f.facts.length <= 3, `${bug.id} has 2 or 3 facts`);
    for (const [i, text] of f.facts.entries()) {
      assert.ok(text && text.length <= FACT_MAX, `${bug.id} fact ${i} is short enough`);
    }
    assert.ok(f.kind === 'science' || f.kind === 'lore', `${bug.id} is science or lore`);
    const about = factPages(bug.id)[0];
    assert.equal(about.key, 'about');
    assert.equal(about.kind, f.kind);
  }
});

test('STEEZE, Bloom Eye and botched rebuilds are marked as Academy lore, not science', () => {
  assert.equal(FACTS.steeze.kind, 'lore');
  assert.ok(factPages('steeze').every((p) => p.kind === 'lore'));
  assert.equal(STAGE_II_NAME.pseudocreobotra, 'Bloom Eye');
  const wild = factPages('pseudocreobotra');
  assert.equal(wild.some((p) => p.key === 'stage2'), false, 'a wild catch does not mention Bloom Eye');
  assert.ok(wild.every((p) => p.kind === 'science'));
  const evolved = factPages('pseudocreobotra', { evo: 1 });
  const bloom = evolved.find((p) => p.key === 'stage2');
  assert.equal(bloom.kind, 'lore');
  assert.match(bloom.fact, /Bloom Eye/);
  assert.match(bloom.fact, /not a wild insect/);
  const botched = factPages('lamprima', { botched: 'lazy' }).find((p) => p.key === 'botched');
  assert.equal(botched.kind, 'lore');
  assert.match(botched.fact, /botched \(lazy\)/);
  assert.match(botched.fact, /not natural history/);
  const thanks = factPages('menacanthus').find((p) => p.key === 'note');
  assert.equal(thanks.kind, 'lore');
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
