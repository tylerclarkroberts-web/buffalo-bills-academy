// v51: daily faun dopamine. Once a UTC-day, a signed-in player can talk to the low-poly faun and open his wooden box.
// Odds (server-authoritative, seeded by player+day so refreshes can't re-roll): 1% $1000, 1% $500, 50% $35–62,
// 10% a filtered cigarette, ~38% the goat-butt gag (nothing). Never grants more than once per day.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';

const CIG = 'filtered';

export function dayKey(now) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}
function roll(seed) {
  // 0..9999
  const h = crypto.createHash('sha256').update(seed).digest();
  const n = h.readUInt32BE(0) % 10000;
  if (n < 100) return { kind: 'cash', amount: 1000, rarity: 'jackpot' }; // 1%
  if (n < 200) return { kind: 'cash', amount: 500, rarity: 'rare' }; // 1%
  if (n < 1200) return { kind: 'cig', id: CIG, rarity: 'uncommon' }; // 10%
  if (n < 6200) { // 50%: $35..$62 inclusive
    const amount = 35 + (h.readUInt16BE(4) % 28);
    return { kind: 'cash', amount, rarity: 'common' };
  }
  return { kind: 'moon', rarity: 'gag' }; // ~38%
}

export class Fawn {
  constructor({ store, accounts, shop, now = () => Date.now() }) {
    this.store = store; this.accounts = accounts; this.shop = shop; this.now = now;
    this.doc = store.loadDoc('fawn', { by: {} }); this.doc.by ||= {};
  }
  save() { this.store.saveDoc('fawn', this.doc); }
  status(p) {
    if (!p) return { available: false };
    const day = dayKey(this.now());
    const row = this.doc.by[p.id];
    if (row?.day === day) return { available: false, claimed: true, gift: row.gift, day };
    return { available: true, claimed: false, day };
  }
  claim(p) {
    if (!p) throw new GameError('Please sign in first', 401);
    this.accounts.ensure(p);
    const day = dayKey(this.now());
    const prev = this.doc.by[p.id];
    if (prev?.day === day) return { already: true, gift: prev.gift };
    const gift = roll(`${p.id}:${day}:fawn-v1`);
    if (gift.kind === 'cash') this.accounts.change(p, gift.amount, 'fawn', `Faun's wooden box: $${gift.amount}`);
    else if (gift.kind === 'cig') {
      const iv = this.shop.inv(p.id);
      if (!iv.own[CIG]) iv.own[CIG] = 1; // one-at-a-time tobacco rule: skip if they already hold one
      this.shop.save();
    }
    const out = { ...gift, day, at: this.now() };
    this.doc.by[p.id] = { day, gift: out };
    this.save();
    return { gift: out, bankroll: p.bankroll };
  }
}
