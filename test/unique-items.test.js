// One-of-a-kind store items: a single owner, shown by name, released when the account goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Shop } from '../server/shop.js';
import { CATALOG } from '../server/catalog/index.js';

function setup(doc) {
  const docs = new Map(doc ? [['shop', doc]] : []);
  const players = { dale: { id: 'dale', name: 'Dale', bankroll: 9e6 }, earl: { id: 'earl', name: 'Earl', bankroll: 9e6, hidden: true } };
  const store = { players, loadDoc: (id, fallback) => docs.get(id) || fallback, saveDoc: (id, d) => docs.set(id, d) };
  const accounts = { ensure() {}, requireFunds(p, n) { if (p.bankroll < n) throw Object.assign(new Error('broke'), { status: 402 }); }, change(p, n) { p.bankroll += n; } };
  const shop = new Shop({ store, accounts, barn: { view: () => ({}) }, now: () => 0 });
  return { shop, ...players };
}

test('the Moon sells once; the store names its owner; deleting the account puts it back', () => {
  const { shop, dale, earl } = setup();
  assert.deepEqual(CATALOG.filter((x) => x.unique).map((x) => x.id).sort(), ['odd-charter', 'odd-deed', 'odd-pickaxe', 'odd-skull']);
  shop.buy(dale, 'odd-deed', { confirm: true });
  assert.equal(dale.bankroll, 4e6);
  assert.throws(() => shop.buy(earl, 'odd-deed', { confirm: true }), (e) => e.status === 409);
  assert.equal(earl.bankroll, 9e6, 'the refused buyer is not charged');
  assert.equal(shop.view(earl).taken['odd-deed'], 'Dale');
  shop.buy(earl, 'odd-skull', { confirm: true });
  assert.equal(shop.view(dale).taken['odd-skull'], 'somebody', 'a hidden owner is not named');
  shop.forget('dale');
  assert.equal(shop.view(earl).taken['odd-deed'], undefined);
  shop.buy(earl, 'odd-deed', { confirm: true });
  assert.equal(shop.inv('earl').own['odd-deed'], 1);
});

test('a deed bought before it was one of a kind keeps its first owner', () => {
  const { shop, earl } = setup({ inv: { dale: { own: { 'odd-deed': 1 } } } });
  assert.equal(shop.doc.unique['odd-deed'], 'dale');
  assert.throws(() => shop.buy(earl, 'odd-deed', { confirm: true }), (e) => e.status === 409);
});
