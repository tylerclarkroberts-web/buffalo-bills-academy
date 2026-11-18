import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFurniture } from '../server/catalog/room.js';
import { ROOM_LINES, CLICK_LINES, REPEAT_CLICK_LINES, VISITOR_LINES, REARRANGE_LINES, TASK_LINES, roomContextLines } from '../client/src/room/dialogue.js';
import { FAUN_EXCHANGES } from '../client/src/room/faun-dialogue.js';

test('a displayed item and a stored purchase prompt different lines, and only the owner hears about storage', () => {
  const empty = { placements: [], furniture: defaultFurniture() };
  const baseline = roomContextLines(empty);
  const specific = (view, visitor) => roomContextLines(view, visitor).filter(line => !baseline.includes(line));
  for (const [itemId, display] of [
    ['odd-anvil', { placements: [{ anchorId: 'floor', itemId: 'odd-anvil' }] }],
    ['furn-pokertable', { furniture: { ...empty.furniture, poker: { ...empty.furniture.poker, off: false } } }],
  ]) {
    const stored = { ...empty, owned: [itemId] };
    const publicDisplay = { ...empty, ...display };
    const privateDisplay = { ...publicDisplay, owned: [itemId] };
    const storedLines = specific(stored);
    const displayedLines = specific(privateDisplay);
    assert.ok(storedLines.length && displayedLines.length, itemId);
    assert.ok(displayedLines.every(line => !storedLines.includes(line)), itemId);
    assert.deepEqual(specific(stored, true), [], 'private inventory is suppressed in visitor preview');
    assert.deepEqual(specific(publicDisplay, true), displayedLines, 'visitors see what is on display');
    assert.deepEqual(specific(privateDisplay, true), displayedLines, 'preview matches the public room');
  }
});

test('financial comments depend on known net worth even when all cash is at tables', () => {
  const lines = worth => roomContextLines({ worth });
  const ordinary = lines({ total: 1000 });
  for (const total of [undefined, null, NaN, Infinity]) {
    assert.deepEqual(lines({ bankroll: 0, total }), ordinary);
  }
  assert.deepEqual(lines({ bankroll: 0, chips: 8000, total: 8000 }), ordinary);
  const poor = lines({ total: 999 }).filter(line => !ordinary.includes(line));
  assert.ok(poor.length > 0);
  assert.ok(poor.every(line => lines({ total: -1 }).includes(line)));
  const rich = lines({ bankroll: 0, total: 100000 });
  assert.ok(rich.some(line => !ordinary.includes(line)));
  assert.ok(poor.every(line => !rich.includes(line)));
});

test('the resident speaks about the right terrarium occupant', () => {
  const egg = roomContextLines({ pet: { stage: 'egg' } });
  const bug = roomContextLines({ pet: { stage: 'creature' } });
  const memorial = roomContextLines({ pet: { stage: 'dead' } });
  assert.ok(egg.length && bug.length && memorial.length);
  assert.deepEqual(roomContextLines({ pet: null }), []);
  assert.equal(new Set([...egg, ...bug, ...memorial]).size, egg.length + bug.length + memorial.length);
});

test('each faun exchange has two brief turns and room speech fits a bubble', () => {
  for (const pair of FAUN_EXCHANGES) {
    assert.equal(pair.length, 2);
    assert.ok(pair.every(line => typeof line === 'string' && line.trim() && line.length <= 80));
  }
  for (const line of [...ROOM_LINES, ...CLICK_LINES, ...REPEAT_CLICK_LINES, ...VISITOR_LINES, ...REARRANGE_LINES, ...Object.values(TASK_LINES).flat()]) {
    assert.ok(line.trim() && line.length <= 110, line);
  }
});
