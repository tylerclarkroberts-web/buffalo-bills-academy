// One-time $2,000 credit for players who paid the old $4,000 fifth-stall price, plus a Foreman note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts, cents } from '../server/accounts.js';
import { Foreman } from '../server/foreman.js';
import {
  creditStall5Refunds, STALL5_REFUND_KEY, STALL5_REFUND_AMT, STALL5_REFUND_TYPE, STALL5_REFUND_NOTE, STALL5_OLD_COST,
} from '../server/stallRefund.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-stall-refund-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_800_000_000_000 }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const foreman = new Foreman({ store, accounts, now, randInt: () => 0 });
  const player = (id, name, bankroll = 10000) => {
    const p = store.players[id] = { id, name, bankroll, txns: [] };
    store.savePlayers();
    return p;
  };
  const payStall = (p, amount) => accounts.change(p, -amount, 'barn-stall', 'Barn: built a stall');
  const ledgerSum = (p) => cents((p.txns || []).reduce((s, x) => s + x.amount, 0));
  return { dir, clock, store, accounts, foreman, player, payStall, ledgerSum, now, run: () => creditStall5Refunds({ store, accounts, foreman, now }) };
}

test('the two players who paid $4,000 for a fifth stall each get $2,000 back once, with a Foreman note, and ledgers still add up', (t) => {
  const f = fixture(t);
  const tyler = f.player('tyler', 'Tyler', 14695);
  const breiden = f.player('breiden', 'Breiden', 10359.91);
  const joe = f.player('joe', 'Joe', 2693.41);
  f.payStall(tyler, 1500); f.payStall(tyler, STALL5_OLD_COST);
  f.payStall(breiden, 1500); f.payStall(breiden, STALL5_OLD_COST);
  f.payStall(joe, 1500);
  const tylerBefore = tyler.bankroll, breidenBefore = breiden.bankroll, joeBefore = joe.bankroll;

  const first = f.run();
  assert.equal(first.credited.length, 2);
  assert.deepEqual(new Set(first.credited.map((c) => c.name)), new Set(['Tyler', 'Breiden']));
  assert.ok(first.credited.every((c) => c.amount === STALL5_REFUND_AMT));
  assert.equal(tyler.bankroll, cents(tylerBefore + STALL5_REFUND_AMT));
  assert.equal(breiden.bankroll, cents(breidenBefore + STALL5_REFUND_AMT));
  assert.equal(joe.bankroll, joeBefore, 'a $1,500 fourth stall is not refunded');
  for (const p of [tyler, breiden]) {
    const last = p.txns.at(-1);
    assert.equal(last.type, STALL5_REFUND_TYPE);
    assert.equal(last.amount, STALL5_REFUND_AMT);
    assert.equal(last.note, STALL5_REFUND_NOTE);
    assert.equal(last.balance, p.bankroll);
    const start = p.txns[0] && p.txns[0].type === 'start' ? 0 : 0;
    assert.equal(cents(p.bankroll - (p.id === 'tyler' ? 14695 : 10359.91)), f.ledgerSum(p));
    const note = f.foreman.noteOf(p.id);
    assert.ok(note);
    assert.equal(note.text, STALL5_REFUND_NOTE);
    assert.equal(note.key, STALL5_REFUND_KEY);
  }
  assert.equal(f.foreman.noteOf('joe'), null);
  const saved = JSON.parse(fs.readFileSync(path.join(f.dir, 'migrations.json'), 'utf8'));
  assert.deepEqual(new Set(saved.done[STALL5_REFUND_KEY].ids), new Set(['tyler', 'breiden']));

  const second = f.run();
  assert.equal(second.credited.length, 0, 'a second boot credits nobody');
  assert.equal(tyler.bankroll, cents(tylerBefore + STALL5_REFUND_AMT));
  assert.equal(breiden.bankroll, cents(breidenBefore + STALL5_REFUND_AMT));
  assert.equal((tyler.txns || []).filter((x) => x.type === STALL5_REFUND_TYPE).length, 1);
  assert.equal(f.foreman.noteOf('tyler').text, STALL5_REFUND_NOTE, 'the note stays until they dismiss it');

  f.foreman.ackNote('tyler');
  assert.equal(f.foreman.noteOf('tyler'), null);
  f.run();
  assert.equal(f.foreman.noteOf('tyler'), null, 'acking does not make the credit or note repeat');
  assert.equal(tyler.bankroll, cents(tylerBefore + STALL5_REFUND_AMT));
});

test('a $4,000 stall purchase that has rolled off the player txn cap is still found in ledger.jsonl', (t) => {
  const f = fixture(t);
  const p = f.player('old', 'Geoffrey', 5000);
  // the purchase lives only on the append-only ledger, as if p.txns already dropped it
  fs.appendFileSync(path.join(f.dir, 'ledger.jsonl'), JSON.stringify({
    t: f.clock.now - 1, p: p.id, type: 'barn-stall', amt: -STALL5_OLD_COST, bal: 1000, note: 'Barn: built a stall',
  }) + '\n');
  const before = p.bankroll;
  const r = f.run();
  assert.equal(r.credited.map((c) => c.id).join(), 'old');
  assert.equal(p.bankroll, before + STALL5_REFUND_AMT);
  assert.equal(p.txns.at(-1).balance, p.bankroll);
  assert.equal(f.foreman.noteOf(p.id).text, STALL5_REFUND_NOTE);
  assert.equal(f.run().credited.length, 0);
});
