// Mine bug battles: the Game Boy-style engine (pure, injected RNG).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFighter, newBattle, resolveTurn, autoMove, legalMoves, turnOrder, effectiveness, typeOf, stageMul, hitChance, fighterView, TYPES, battleLevel } from '../server/engine/gb-battle.js';
import { BUGS } from '../server/engine/bugs.js';

const fixed = (v) => (n) => Math.min(n - 1, v); // always the same roll (clamped)
const seq = (...vals) => { let i = 0; return (n) => Math.min(n - 1, vals[i++ % vals.length]); };
const fighter = (species, level = 5, name = species) => makeFighter({ owner: name, name, species, level });

test('every species gets four moves, a type, and stats that grow with level', () => {
  const types = {};
  for (const b of BUGS) {
    const f = fighter(b.id);
    assert.equal(f.moves.length, 4);
    assert.ok(TYPES.includes(f.type)); types[f.type] = (types[f.type] || 0) + 1;
    assert.equal(f.moves[0].type, 'NORMAL'); assert.equal(f.moves[0].kind, 'damage');
    assert.equal(f.moves[1].type, f.type); assert.equal(f.moves[1].kind, 'damage');
    assert.ok(f.moves.every((m) => m.pp > 0 && m.pp === m.maxPp && m.name));
    assert.equal(f.hp, f.maxHp);
    const hi = fighter(b.id, 10);
    assert.ok(hi.maxHp > f.maxHp && hi.stats.atk > f.stats.atk);
  }
  for (const t of TYPES) assert.ok(types[t] >= 6, `${t}: ${types[t]}`);
  assert.equal(battleLevel(0), battleLevel(1)); assert.equal(battleLevel(99), battleLevel(10));
});

test('the type loop: each type is strong against the next, weak against the one before; NORMAL is neutral', () => {
  for (let i = 0; i < 4; i++) {
    const t = TYPES[i], next = TYPES[(i + 1) % 4], prev = TYPES[(i + 3) % 4];
    assert.ok(effectiveness(t, next) > 1); assert.ok(effectiveness(t, prev) < 1); assert.equal(effectiveness(t, t), 1);
  }
  assert.equal(effectiveness('NORMAL', 'SHELL'), 1);
  assert.equal(typeOf('ceroplophana'), 'SHELL'); assert.equal(typeOf('empusa'), 'CLAW'); assert.equal(typeOf('pyrops'), 'SAP'); assert.equal(typeOf('nemoptera'), 'ODD');
  assert.equal(stageMul(0), 1); assert.equal(stageMul(2), 2); assert.equal(stageMul(-2), 0.5); assert.equal(stageMul(9), 4);
});

test('the faster bug moves first; a speed tie is a coin flip', () => {
  const fast = fighter('graphocephala'), slow = fighter('macrodontia'); // spd 5 vs spd 1
  assert.ok(fast.stats.spd > slow.stats.spd);
  const s = newBattle(slow, fast);
  assert.deepEqual(turnOrder(s, fixed(0)), ['b', 'a']);
  const { events } = resolveTurn(s, { a: 0, b: 0 }, fixed(100));
  const firstUse = events.find((e) => e.side);
  assert.equal(firstUse.side, 'b');
  const tie = newBattle(fighter('phrictus', 5, 'A'), fighter('phrictus', 5, 'B'));
  assert.deepEqual(turnOrder(tie, fixed(0)), ['a', 'b']);
  assert.deepEqual(turnOrder(tie, fixed(1)), ['b', 'a']);
});

test('damage follows the Gen 1 shape: same-type bonus, type chart, crit ignores stages, spread 217-255', () => {
  const a = fighter('ceroplophana', 5, 'A'), b = fighter('lamprima', 5, 'B'); // both SHELL
  const rollMax = (n) => (n === 39 ? 38 : n === 256 ? 255 : n === 100 ? 0 : 0); // top spread, never crit, always hit
  const rollMin = (n) => (n === 39 ? 0 : n === 256 ? 255 : 0);
  const hit = (move, rand) => { const s = newBattle(a, b); s.sides.b.stats.spd = 0; const r = resolveTurn(s, { a: move, b: 2 }, rand); return b.maxHp - r.state.sides.b.hp; };
  const jabHi = hit(0, rollMax), jabLo = hit(0, rollMin), typedHi = hit(1, rollMax);
  assert.ok(jabHi > jabLo && jabLo >= Math.floor(jabHi * 217 / 255) - 1);
  assert.ok(typedHi > jabHi, 'the typed move hits harder (more power and the same-type bonus)');
  // A guarded target takes less, unless the hit is critical.
  const guarded = newBattle(a, b); guarded.sides.b.stages.def = 2; guarded.sides.b.stats.spd = 0;
  const less = b.maxHp - resolveTurn(guarded, { a: 1, b: 2 }, rollMax).state.sides.b.hp;
  assert.ok(less < typedHi);
  const critRoll = (n) => (n === 39 ? 38 : 0); // rand(256)=0 is always a crit
  const crit = b.maxHp - resolveTurn(guarded, { a: 1, b: 2 }, critRoll).state.sides.b.hp;
  assert.ok(crit > typedHi, 'a crit ignores the guard and doubles the level');
});

test('a quicker target is a little harder to hit; status moves and heals behave', () => {
  const slow = fighter('macrodontia'), fast = fighter('graphocephala');
  assert.ok(hitChance(slow.moves[0], slow, fast) < slow.moves[0].accuracy);
  assert.equal(hitChance(fast.moves[0], fast, slow), fast.moves[0].accuracy);
  const s = newBattle(fighter('ceroplophana', 5, 'A'), fighter('lamprima', 5, 'B'));
  const r = resolveTurn(s, { a: 2, b: 2 }, fixed(0)); // both brace
  assert.equal(r.state.sides.a.stages.def, 1); assert.equal(r.state.sides.b.stages.def, 1);
  assert.equal(r.state.sides.a.moves[2].pp, r.state.sides.a.moves[2].maxPp - 1);
  assert.ok(r.events.some((e) => /DEFENSE ROSE/.test(e.s)));
  const healer = BUGS.find((b) => fighter(b.id).moves[3].kind === 'heal');
  const h = newBattle(fighter(healer.id, 5, 'H'), fighter('lamprima', 5, 'B')); h.sides.a.hp = 10; h.sides.b.stats.spd = 0;
  const after = resolveTurn(h, { a: 3, b: 2 }, fixed(0)).state.sides.a.hp;
  assert.ok(after > 10);
  const full = newBattle(fighter(healer.id, 5, 'H'), fighter('lamprima', 5, 'B'));
  assert.ok(resolveTurn(full, { a: 3, b: 2 }, fixed(0)).events.some((e) => e.s === 'BUT IT FAILED!'));
});

test('first bug to zero HP loses; poison ticks at the end of the turn; no PP means Struggle', () => {
  const s = newBattle(fighter('manticora', 10, 'A'), fighter('helicopsyche', 1, 'B'));
  s.sides.b.hp = 1;
  const r = resolveTurn(s, { a: 0, b: 0 }, fixed(0));
  assert.equal(r.state.winner, 'a');
  assert.ok(r.events.some((e) => e.faint === 'b'));
  assert.equal(resolveTurn(r.state, { a: 0, b: 0 }, fixed(0)).events.length, 0, 'a finished battle does not continue');
  const p = newBattle(fighter('lamprima', 5, 'A'), fighter('lamprima', 5, 'B'));
  p.sides.b.poisoned = true; p.sides.b.hp = 3;
  const pr = resolveTurn(p, { a: 2, b: 2 }, fixed(0));
  assert.equal(pr.state.winner, 'a');
  assert.ok(pr.events.some((e) => /HURT BY POISON/.test(e.s)));
  const st = newBattle(fighter('lamprima', 5, 'A'), fighter('lamprima', 5, 'B'));
  for (const m of st.sides.a.moves) m.pp = 0;
  assert.deepEqual(legalMoves(st.sides.a), []);
  assert.equal(autoMove(st.sides.a, fixed(0)), -1);
  const sr = resolveTurn(st, { a: -1, b: 2 }, fixed(0));
  assert.ok(sr.events.some((e) => e.s === 'A USED STRUGGLE!'));
  assert.ok(sr.events.some((e) => /RECOIL/.test(e.s)));
});

test('a timed-out side picks a random legal move; views hide the foe\'s moves', () => {
  const f = fighter('lamprima'); f.moves[0].pp = 0; f.moves[2].pp = 0;
  const picks = new Set(); for (let v = 0; v < 4; v++) picks.add(autoMove(f, fixed(v)));
  assert.deepEqual([...picks].sort(), [1, 3]);
  assert.ok(fighterView(f, true).moves.length === 4);
  assert.equal(fighterView(f, false).moves, undefined);
});

test('balance: no species wins more than about two thirds of fair fights; a full battle ends', () => {
  let seed = 12345; const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const wins = {}, games = {};
  let turns = 0, n = 0;
  for (const A of BUGS) for (const B of BUGS) {
    if (A === B) continue;
    let s = newBattle(fighter(A.id, 5, 'A'), fighter(B.id, 5, 'B'));
    while (!s.winner && s.turn < 200) s = resolveTurn(s, { a: autoMove(s.sides.a, rand), b: autoMove(s.sides.b, rand) }, rand).state;
    assert.ok(s.winner, 'every battle ends');
    turns += s.turn; n++;
    wins[s.winner === 'a' ? A.id : B.id] = (wins[s.winner === 'a' ? A.id : B.id] || 0) + 1;
    games[A.id] = (games[A.id] || 0) + 1; games[B.id] = (games[B.id] || 0) + 1;
  }
  for (const b of BUGS) { const r = (wins[b.id] || 0) / games[b.id]; assert.ok(r > 0.25 && r < 0.75, `${b.id}: ${r.toFixed(2)}`); }
  assert.ok(turns / n < 25, `average ${turns / n} turns`);
});
