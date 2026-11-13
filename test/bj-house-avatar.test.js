// A player who is the blackjack house stands behind the felt in Guntrad's spot: the view carries their avatar and bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Blackjack } from '../server/blackjack/index.js';

function fixture(t, { avatars, barn } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bj-house-av-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const now = 1_800_000_000_000;
  const store = new Store(dir);
  store.players = Object.fromEntries(['house', 'ann', 'bob'].map((id) => [id, { id, name: id, createdAt: now - 1000 }]));
  store.savePlayers();
  const accounts = new Accounts({ store, now: () => now });
  for (const p of Object.values(store.players)) accounts.ensure(p);
  const bj = new Blackjack({ store, accounts, getPlayer: (id) => store.players[id], now: () => now, tickMs: 0, avatars, barn });
  const P = store.players;
  const open = (settings, players = ['ann', 'bob']) => {
    const v = bj.create(P.house, { settings: { buyIn: 200, houseBank: 1000, minBet: 5, maxBetX: 20, bots: 0, ...settings } });
    for (const x of players) bj.join(P[x], v.code, true);
    bj.start(P.house, v.code);
    return v.code;
  };
  return { bj, P, open };
}

const fakeAvatars = { info: (p) => (p.id === 'house' ? { kind: 'photo', v: 3 } : { kind: 'gen', seed: p.id }) };
const fakeBarn = { view: (id) => (id === 'house' ? { pen: { stage: 'creature', species: 'ceroplophana', name: 'Sir Pinch', level: 4 } } : {}) };

for (const continuous of [false, true]) {
  const mode = continuous ? 'continuous' : 'normal';
  test(`${mode}: a player house shows its avatar and hatched bug to everyone`, (t) => {
    const f = fixture(t, { avatars: fakeAvatars, barn: fakeBarn });
    const code = f.open({ house: 'me', continuous });
    for (const who of ['ann', 'house']) {
      const v = f.bj.view(f.P[who], code);
      assert.equal(v.house.mode, 'player');
      assert.equal(v.house.id, 'house');
      assert.deepEqual(v.house.avatar, { kind: 'photo', v: 3 });
      assert.equal(v.house.bug?.name, 'Sir Pinch');
      assert.equal(v.house.isMe, who === 'house');
    }
  });
}

test('a player house without a photo or bug still gets a generated avatar (never blank)', (t) => {
  const f = fixture(t, { avatars: { info: (p) => ({ kind: 'gen', seed: p.id }) }, barn: { view: () => ({ pen: { stage: 'egg' } }) } });
  const v = f.bj.view(f.P.ann, f.open({ house: 'me' }));
  assert.deepEqual(v.house.avatar, { kind: 'gen', seed: 'house' });
  assert.equal(v.house.bug, undefined);
});

test('with no avatar service the house falls back to a generated seed', (t) => {
  const f = fixture(t);
  const v = f.bj.view(f.P.ann, f.open({ house: 'me' }));
  assert.deepEqual(v.house.avatar, { kind: 'gen', seed: 'house' });
});

test('Guntrad tables carry no house avatar (Guntrad deals as before)', (t) => {
  const f = fixture(t, { avatars: fakeAvatars, barn: fakeBarn });
  const v = f.bj.view(f.P.ann, f.open({ house: 'guntrad' }));
  assert.equal(v.house.mode, 'guntrad');
  assert.equal(v.house.avatar, undefined);
  assert.equal(v.house.bug, undefined);
});

test('a house still to be picked has no avatar yet', (t) => {
  const f = fixture(t, { avatars: fakeAvatars, barn: fakeBarn });
  const created = f.bj.create(f.P.house, { settings: { house: 'player', buyIn: 200, houseBank: 1000, minBet: 5, maxBetX: 20 } });
  const v = f.bj.view(f.P.house, created.code);
  assert.equal(v.house.mode, 'player');
  assert.equal(v.house.id, null);
  assert.equal(v.house.avatar, undefined);
});
