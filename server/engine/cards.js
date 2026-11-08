// Cards are 2-character strings: rank + suit, e.g. "As" (ace of spades), "Td" (ten of diamonds).
import { randomInt } from 'node:crypto';

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

export function newDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

/** rng(n) must return an integer in [0, n). Defaults to crypto.randomInt (cryptographically secure). */
export function shuffle(deck, rng = (n) => randomInt(n)) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const rankOf = (card) => RANKS.indexOf(card[0]) + 2; // 2..14
export const suitOf = (card) => card[1];
