// Seasonal store items: on the shelf for one calendar month (Mountain time), kept for good once bought.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shop, shopMonth } from '../server/shop.js';

function setup(when) {
  const docs = new Map(); let now = Date.parse(when);
  const dale = { id: 'dale', name: 'Dale', bankroll: 10000 };
  const store = { players: { dale }, loadDoc: (id, fallback) => docs.get(id) || fallback, saveDoc: (id, d) => docs.set(id, d) };
  const accounts = { ensure() {}, requireFunds(p, n) { if (p.bankroll < n) throw Object.assign(new Error('broke'), { status: 402 }); }, change(p, n) { p.bankroll += n; } };
  const shop = new Shop({ store, accounts, barn: { view: () => ({}) }, now: () => now });
  return { shop, dale, at: (next) => { now = Date.parse(next); } };
}
const seasonal = (view) => view.items.filter((x) => x.cat === 'seasonal').map((x) => x.id);

test('Halloween stock sells in October only and stays yours afterwards', () => {
  const { shop, dale, at } = setup('2026-10-15T18:00:00Z');
  assert.deepEqual(seasonal(shop.view(dale)), ['odd-jackolantern', 'odd-ghost']);
  shop.buy(dale, 'odd-jackolantern');
  assert.equal(dale.bankroll, 9200);
  assert.throws(() => shop.buy(dale, 'odd-stocking'), (e) => e.status === 409 && /December/.test(e.message));

  at('2027-02-01T18:00:00Z');
  const view = shop.view(dale);
  assert.deepEqual(seasonal(view), ['odd-jackolantern'], 'the one you bought stays on your shelf');
  assert.ok(view.tabs.some((t) => t.id === 'seasonal'));
  assert.throws(() => shop.buy(dale, 'odd-ghost', { confirm: true }), (e) => e.status === 409);
  assert.equal(dale.bankroll, 9200, 'a refused buyer is not charged');
});

test('no Seasonal tab when nothing is in season and you own none', () => {
  const { shop, dale } = setup('2027-02-01T18:00:00Z');
  assert.ok(!shop.view(dale).tabs.some((t) => t.id === 'seasonal'));
});

test('the shop keeps Mountain time, so Halloween night is still October', () => {
  assert.equal(shopMonth(Date.parse('2026-11-01T03:00:00Z')), 10); // 9 pm on Halloween in Denver
  assert.equal(shopMonth(Date.parse('2026-11-01T07:00:00Z')), 11);
});
