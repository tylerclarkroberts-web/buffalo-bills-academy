// The Barn page crashed for everyone with an egg or a care cooldown ("ge is not a function") when a state variable
// named `left` shadowed the countdown formatter `left(ms)`. Keep the module helpers unshadowed inside BarnHome.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../client/src/barn/Barn.jsx', import.meta.url), 'utf8');

test('Barn: nothing in the page shadows the left(ms) countdown formatter', () => {
  assert.match(src, /^const left = \(ms\) =>/m);
  const home = src.slice(src.indexOf('function BarnHome('));
  assert.ok(home.length > 100);
  assert.doesNotMatch(home, /\b(?:const|let|var)\s+(?:\[\s*)?left\b/, 'BarnHome declares its own `left`, so left(ms) is not a function there');
  assert.doesNotMatch(home, /\(\s*left\s*[,)]/, 'BarnHome takes a parameter called `left`');
});
