// v41: the slot machine's pixel sprites are complete, outlined, low-palette, and the frankfurter is a pure re-skin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { slotPix, SLOT_PIX } from '../client/src/slots/pixslots.js';
import { LOW } from '../server/slots/math.js';

test('every slot symbol has an outlined, limited-palette pixel sprite', () => {
  const need = ['acorn', 'shroom', 'cone', 'berry', 'straw', 'sticks', 'stone', 'straw-broken', 'sticks-broken', 'stone-broken', 'pip', 'bramble', 'boulder', 'W', 'S', 'G', 'rat', 'rat-toot', 'cloud'];
  for (const n of need) {
    const g = slotPix(n); assert.ok(g, n);
    assert.equal(g.px.length, g.w * g.h, n);
    const cols = new Set(g.px.filter(Boolean));
    assert.ok(cols.has('#20141c'), `${n} has the dark outline`);
    assert.ok(cols.size >= 4 && cols.size <= 24, `${n} palette ${cols.size}`);
    assert.ok(g.px.filter(Boolean).length > g.w * g.h * 0.2, `${n} is not empty`);
  }
  assert.ok(SLOT_PIX.includes('frank'));
});

test('the frankfurter is the berry key re-skinned (the math still uses berry)', () => {
  assert.equal(slotPix('berry'), slotPix('frank'));
  assert.deepEqual(LOW, ['acorn', 'shroom', 'cone', 'berry']);
});
