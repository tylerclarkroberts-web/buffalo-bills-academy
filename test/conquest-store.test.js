import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';

const storeModule = new URL('../server/store.js', import.meta.url).href;

function fixture(t, transition) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-conquest-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let before = Object.fromEntries(['alice', 'bob'].map((id) => [id, {
    id, bankroll: 1000, txns: [], holdings: { fund: { units: 3 } }, conquest: { bets: {} },
  }]));
  let drafts = Object.values(structuredClone(before));
  for (const draft of drafts) {
    draft.bankroll -= 10;
    draft.txns.push({ type: 'risk_stake', amount: -10 });
    draft.conquest.bets[`bet-${draft.id}`] = {
      id: `bet-${draft.id}`, state: 'pending',
      terms: { marketId: 'market-1', outcomeUserId: draft.id, stakeCents: 1000, grossCents: 1900 },
      admission: null, terminal: null,
    };
  }
  if (transition === 'settlement') {
    before = Object.fromEntries(drafts.map((draft) => {
      const bet = draft.conquest.bets[`bet-${draft.id}`];
      bet.state = 'accepted';
      bet.admission = { intentId: bet.id, status: 'accepted', terms: structuredClone(bet.terms) };
      return [draft.id, draft];
    }));
    drafts = Object.values(structuredClone(before));
    for (const draft of drafts) {
      const bet = draft.conquest.bets[`bet-${draft.id}`];
      bet.terminal = { kind: 'winner', winnerUserId: 'alice', finalizedAt: '2026-11-09T12:05:00Z' };
      bet.state = draft.id === 'alice' ? 'won' : 'lost';
      if (draft.id === 'alice') {
        draft.bankroll += 19;
        draft.txns.push({ type: 'risk_win', amount: 19 });
      }
    }
  }
  const playersFile = path.join(dir, 'players.json');
  fs.writeFileSync(playersFile, JSON.stringify(before));
  const store = new Store(dir);
  const refs = Object.values(store.players).map((player) => ({
    player, holdings: player.holdings, txns: player.txns, conquest: player.conquest,
  }));
  const after = { ...before, ...Object.fromEntries(drafts.map((draft) => [draft.id, draft])) };
  return { dir, playersFile, store, refs, before, after, drafts };
}

function assertUnpublished(f) {
  assert.deepEqual(f.store.players, f.before);
  for (const ref of f.refs) {
    assert.equal(f.store.players[ref.player.id], ref.player);
    assert.equal(ref.player.holdings, ref.holdings);
    assert.equal(ref.player.txns, ref.txns);
    assert.equal(ref.player.conquest, ref.conquest);
  }
}

for (const transition of ['reservation', 'settlement']) {
  for (const boundary of ['write', 'fsync', 'rename']) {
    test(`${transition}: ${boundary} failure preserves the complete old ledger and live references`, (t) => {
      const f = fixture(t, transition);
      const beforeBytes = fs.readFileSync(f.playersFile, 'utf8');
      const method = { write: 'writeFileSync', fsync: 'fsyncSync', rename: 'renameSync' }[boundary];
      const original = fs[method];
      const fault = new Error(`injected ${boundary} failure`);
      let failures = 0;
      const mock = t.mock.method(fs, method, (...args) => {
        const target = boundary === 'rename' ? args[1] === f.playersFile : typeof args[0] === 'number';
        if (!target) return original(...args);
        failures++;
        if (boundary === 'write') original(args[0], '{"incomplete":');
        assert.deepEqual(JSON.parse(fs.readFileSync(f.playersFile, 'utf8')), f.before);
        throw fault;
      });
      try {
        assert.throws(() => f.store.commitPlayerDrafts(f.drafts), (error) => error === fault);
      } finally {
        mock.mock.restore();
      }
      assert.equal(failures, 1, 'the injected failure must reach the real commit boundary');
      assert.equal(fs.readFileSync(f.playersFile, 'utf8'), beforeBytes);
      assertUnpublished(f);
      assert.deepEqual(new Store(f.dir).players, f.before);
      assert.equal(fs.existsSync(`${f.playersFile}.${process.pid}.risk.tmp`), false);
    });
  }

  test(`${transition}: a successful commit publishes money and its receipt together`, (t) => {
    const f = fixture(t, transition);
    f.store.commitPlayerDrafts(f.drafts);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.playersFile, 'utf8')), f.after);
    assert.deepEqual(f.store.players, f.after);
    assert.deepEqual(new Store(f.dir).players, f.after);
    for (const ref of f.refs) {
      assert.equal(f.store.players[ref.player.id], ref.player);
      assert.equal(ref.player.holdings, ref.holdings);
    }
    assert.equal(fs.existsSync(`${f.playersFile}.${process.pid}.risk.tmp`), false);
  });

  test(`${transition}: restart recovers the new ledger after interruption immediately following rename`, (t) => {
    const f = fixture(t, transition);
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { Store } from ${JSON.stringify(storeModule)};
      const input = JSON.parse(fs.readFileSync(0, 'utf8'));
      const store = new Store(input.dir);
      const refs = Object.values(store.players).map((player) => ({
        player, holdings: player.holdings, txns: player.txns, conquest: player.conquest,
      }));
      const fsync = fs.fsyncSync;
      let flushed = false;
      fs.fsyncSync = (fd) => { fsync(fd); flushed = true; };
      const rename = fs.renameSync;
      fs.renameSync = (from, to) => {
        rename(from, to);
        assert.equal(to, store.playersFile);
        assert.equal(flushed, true, 'the replacement file must be fsynced before rename');
        assert.deepEqual(JSON.parse(fs.readFileSync(to, 'utf8')), input.after);
        assert.deepEqual(store.players, input.before, 'rename precedes all live money publication');
        for (const ref of refs) {
          assert.equal(store.players[ref.player.id], ref.player);
          assert.equal(ref.player.holdings, ref.holdings);
          assert.equal(ref.player.txns, ref.txns);
          assert.equal(ref.player.conquest, ref.conquest);
        }
        process.exit(73);
      };
      store.commitPlayerDrafts(input.drafts);
      throw new Error('the child unexpectedly continued past the rename interruption');
    `], {
      input: JSON.stringify({ dir: f.dir, before: f.before, after: f.after, drafts: f.drafts }),
      encoding: 'utf8', timeout: 10_000, windowsHide: true,
    });
    assert.ifError(child.error);
    assert.equal(child.signal, null);
    assert.equal(child.status, 73, child.stderr || 'child did not reach the post-rename interruption');
    assert.deepEqual(JSON.parse(fs.readFileSync(f.playersFile, 'utf8')), f.after);
    assert.deepEqual(new Store(f.dir).players, f.after, 'fresh startup recovers the complete replacement');
    assertUnpublished(f);
    assert.equal(fs.readdirSync(f.dir).some((name) => name.endsWith('.risk.tmp')), false);
  });
}
