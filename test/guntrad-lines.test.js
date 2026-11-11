import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSayer, dailyLine, localDayNumber } from '../client/src/guntrad-core.js';
import { createFight, simulate, G_HP, isPracticePhrase } from '../server/engine/fight.js';

const BANK = JSON.parse(readFileSync(new URL('../client/src/lines/guntrad-lines.json', import.meta.url)));
const MIN_COUNTS = { lines: 106, fightIntro: 12, fightHit: 24, fightBreak: 6, fightWin: 10, fightLose: 12, fightThrust: 12, bust: 14, offer: 12 };
const SETS = Object.keys(MIN_COUNTS);

test('line bank: full short dialogue sets, unique and tidy', () => {
  for (const l of BANK.lines) assert.ok(l.length <= 100, l);
  const all0 = SETS.flatMap((s) => BANK[s]);
  assert.ok(!all0.some((l) => /straight edge/i.test(l)), 'straight edge line is retired');
  const all = [];
  for (const s of SETS) {
    assert.ok(Array.isArray(BANK[s]) && BANK[s].length >= MIN_COUNTS[s], `${s}: at least ${MIN_COUNTS[s]} lines`);
    if (s.startsWith('fight')) for (const l of BANK[s]) assert.ok(l.length <= 72, `${s}: filtered out of fight captions: ${l}`);
    all.push(...BANK[s]);
  }
  assert.equal(new Set(all).size, all.length, 'duplicate line');
  for (const l of all) { assert.equal(l, l.trim()); assert.ok(l.length > 0 && l.length <= 110, l); }
});

test('line bank: nothing gory, slurry or about real people', () => {
  const banned = /\b(blood|kill|die|dead|death|gore|gun|shoot|stab|knife|murder|suicide|drunk|retard|idiot|stupid|trump|biden|musk|elon|obama|vegas golden knights)\b/i;
  for (const s of SETS) for (const l of BANK[s]) assert.ok(!banned.test(l), l);
});

test('shuffle bag: no repeats until the set is exhausted, never twice in a row', () => {
  const say = makeSayer(BANK);
  const n = BANK.lines.length; const seen = [];
  for (let i = 0; i < n * 4; i++) seen.push(say('lines'));
  for (let k = 0; k < 4; k++) assert.equal(new Set(seen.slice(k * n, (k + 1) * n)).size, n);
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
});

test('shuffle bag: maxLen filters, unknown sets fall back to the tagline bank', () => {
  const say = makeSayer(BANK);
  for (let i = 0; i < 50; i++) assert.ok(say('lines', { maxLen: 70 }).length <= 70);
  assert.ok(BANK.lines.includes(say('nope')));
  for (let i = 0; i < 20; i++) assert.ok(BANK.offer.includes(say('offer')));
});

test('line bank: topic mix is ~half cigarettes, the rest baldness / metal / Dragon', () => {
  const smoke = /cigarette|smok|match|ashtray|exhale|lighter|phillumeny|noir|Bacall|Voyager|Casablanca|Tiffany|Wendover|saloon/i;
  const bald = /bald|hair|follicle|Norwood|DHT|alopecia|Minoxidil|Finasteride/i;
  const metal = /Sabbath|Iommi|Priest|Maiden|Metallica|metal|Lordi|Motorhead/i;
  const dragon = /Dragon|Toothless|Hiccup|Stoick/i;
  const n = BANK.lines.length; const c = { smoke: 0, bald: 0, metal: 0, dragon: 0 };
  for (const l of BANK.lines) {
    const hits = [smoke.test(l) && 'smoke', bald.test(l) && 'bald', metal.test(l) && 'metal', dragon.test(l) && 'dragon'].filter(Boolean);
    assert.ok(hits.length >= 1, `untagged line: ${l}`); c[hits[0]]++;
  }
  assert.ok(c.smoke / n >= 0.42 && c.smoke / n <= 0.58, JSON.stringify(c));
  for (const k of ['bald', 'metal', 'dragon']) assert.ok(c[k] / n >= 0.12 && c[k] / n <= 0.24, JSON.stringify(c));
});

test('daily tagline: same line all day, changes at local midnight, no repeat until the bank is used up', () => {
  const L = BANK.lines;
  const morning = new Date(2026, 9, 30, 0, 1), night = new Date(2026, 9, 30, 23, 59), next = new Date(2026, 9, 31, 0, 1);
  assert.equal(dailyLine(L, morning), dailyLine(L, night));
  assert.notEqual(dailyLine(L, night), dailyLine(L, next));
  assert.equal(localDayNumber(next) - localDayNumber(night), 1);
  const seen = new Set();
  for (let i = 0; i < L.length; i++) seen.add(dailyLine(L, new Date(2026, 0, 1 + i, 12)));
  assert.equal(seen.size, L.length);
  assert.equal(dailyLine([], morning), '');
});

test('practice fight phrase: case-insensitive and trimmed, nothing else matches; practice runs the full Guntrad', () => {
  for (const t of ['practice fight', 'Practice Fight', '  PRACTICE FIGHT  ', 'practice   fight']) assert.equal(isPracticePhrase(t), true, t);
  for (const t of ['practice', 'fight', 'practice fight!', 'practice fights', 'lets practice fight', '', null, 42]) assert.equal(isPracticePhrase(t), false, String(t));
  const d = createFight(42); assert.equal(d.g.hp, G_HP); assert.equal(d.gMax, G_HP);
  const a = simulate(7, [], 600), b = simulate(7, [], 600); assert.deepEqual(a, b);
});
