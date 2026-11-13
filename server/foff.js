// Foff's Bachelor Party: the golf and the side quests run entirely in the browser, so the server takes a player's
// word for what they won. It pays out once per account per thing, on the honour system, like the trip itself:
// $2,000 and the Presidential Medal of Freedom for beating all eleven friends, and pocket money for each side
// quest, four of which also leave a keepsake. Keepsakes hang in My Room with the other oddities and cannot be bought.
import { GameError } from './engine/game.js';
import { CATALOG } from './catalog/index.js';

export const MEDAL = 'odd-medal', PRIZE = 2000;
/** What each side quest pays, by the quest ids in client/src/foff/quests.js (a test keeps the two in step). */
export const REWARDS = {
  van: { cash: 30 }, luggage: { cash: 20 }, banya: { cash: 40, item: 'odd-flipflop' }, burma: { cash: 25 }, dessert: { cash: 25 },
  bakery: { cash: 20 }, mystery: { cash: 30 }, chinese: { cash: 25 },
  piper: { cash: 50, item: 'odd-drone' }, dametra: { cash: 25 }, carmel: { cash: 30 },
  sardine: { cash: 40, item: 'odd-abalone' }, edibles: { cash: 30 },
  hmb: { cash: 40 }, sfo: { cash: 60, item: 'odd-boardingpass' },
};

export class Foff {
  constructor({ store, accounts, shop, now = () => Date.now() }) {
    this.store = store; this.accounts = accounts; this.shop = shop; this.now = now;
    this.doc = store.loadDoc('foff', { by: {}, quests: {} }); this.doc.by ||= {}; this.doc.quests ||= {}; this.doc.watched ||= {};
  }
  save() { this.store.saveDoc('foff', this.doc); }
  give(p, id) { this.shop.inv(p.id).own[id] = 1; this.shop.save(); }
  /** A deleted account takes its claims with it. */
  forget(pid) { delete this.doc.by[pid]; delete this.doc.quests[pid]; delete this.doc.watched[pid]; this.save(); }
  /** Whether this player has finished the lobby film that unlocks the bachelor party. Missing `watched` is unwatched. */
  watched(p) { return !!(p && this.doc.watched[p.id]); }
  markWatched(p) {
    if (!p) throw new GameError('Please sign in first', 401);
    const row = this.doc.watched[p.id] || { at: this.now() };
    if (!this.doc.watched[p.id]) { this.doc.watched[p.id] = row; this.save(); }
    return { watched: true, at: row.at };
  }
  claim(p) {
    if (!p) throw new GameError('Please sign in first', 401);
    this.accounts.ensure(p);
    if (this.doc.by[p.id]) return { already: true, prize: PRIZE, bankroll: p.bankroll };
    this.accounts.change(p, PRIZE, 'foff', `Presidential Medal of Freedom: $${PRIZE.toLocaleString('en-US')}`);
    this.give(p, MEDAL);
    this.doc.by[p.id] = { at: this.now() }; this.save();
    return { prize: PRIZE, bankroll: p.bankroll };
  }
  quest(p, id) {
    if (!p) throw new GameError('Please sign in first', 401);
    const reward = Object.hasOwn(REWARDS, id) && REWARDS[id];
    if (!reward) throw new GameError('Nobody on the trip remembers that happening.', 404);
    this.accounts.ensure(p);
    const mine = (this.doc.quests[p.id] ||= {}), item = reward.item && CATALOG.find((x) => x.id === reward.item).name;
    if (mine[id]) return { already: true, cash: reward.cash, item, bankroll: p.bankroll };
    this.accounts.change(p, reward.cash, 'foff', `Foff's bachelor party: $${reward.cash}`);
    if (reward.item) this.give(p, reward.item);
    mine[id] = this.now(); this.save();
    return { cash: reward.cash, item, bankroll: p.bankroll };
  }
}
