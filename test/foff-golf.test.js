import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCHES } from '../client/src/foff/course.js';
import { CLUBS, MAX_STROKES, aiHole, aimPoint, angleTo, applyShot, cardScore, dist, foeApply, foeSwing, foeTee, lieAt, markBack, pickClub, powerFor, shoot, slopeAt, swingSpec, teeUp } from '../client/src/foff/golf-sim.js';
import { rng } from '../server/engine/maze.js';

const [h1, h2] = MATCHES[0].holes;
const club = (id) => CLUBS.find((c) => c.id === id);

test('every hole can be played: tee, a line to a pin on the green, and an end', () => {
  for (const m of MATCHES) for (const h of m.holes) {
    assert.equal(lieAt(h, h.tee), 'tee');
    assert.equal(lieAt(h, h.pin), 'green');
    assert.deepEqual(h.path.at(-1), h.pin);
    assert.equal(lieAt(h, aimPoint(h, h.tee, 250)), dist(h.tee, h.pin) <= 250 ? 'green' : 'fairway', 'the suggested drive finds short grass');
    const rnd = rng(11);
    for (let i = 0; i < 50; i++) { const s = aiHole(h, 1, rnd); assert.ok(s >= 1 && s <= MAX_STROKES); }
  }
});

test('a straight 7 iron carries its number, rolls a little and stays on the fairway', () => {
  const res = shoot(h1, h1.tee, swingSpec(club('7I'), 'tee', 335), { aim: 0, power: 1 });
  assert.deepEqual(res.land, [0, 155]);
  assert.ok(res.rest[1] > 155 && res.rest[1] < 170);
  assert.deepEqual([res.lie, res.holed, res.penalty], ['fairway', false, 0]);
  const pushed = shoot(h1, h1.tee, swingSpec(club('7I'), 'tee', 335), { aim: 0, power: 1, err: 1, wind: [8, 0] });
  assert.ok(pushed.land[0] > 20, 'a late tap and a crosswind both go right');
});

test('water costs a stroke and the ball comes back', () => {
  const g = teeUp(h2), res = shoot(h2, g.pos, swingSpec(club('SW'), 'tee', 150), { aim: 0, power: 1 });
  assert.deepEqual([res.hazard, res.penalty, res.rest, res.lie], ['water', 1, h2.tee, 'tee']);
  applyShot(g, res);
  assert.deepEqual([g.strokes, g.pos, g.holed], [2, h2.tee, false]);
});

test('putts drop at the right pace, lip out when hammered and break with the green', () => {
  const tilt = (sx) => ({ ...h1, green: { ...h1.green, slope: [sx, 0] } }), flat = tilt(0), from = [h1.pin[0], h1.pin[1] - 8];
  const spec = swingSpec(pickClub('green', 8), 'green', 8);
  assert.equal(spec.putt, true);
  const aim = angleTo(from, flat.pin), power = powerFor(flat, from, spec, flat.pin) + 0.03;
  assert.equal(shoot(flat, from, spec, { aim, power }).holed, true);
  assert.equal(shoot(flat, from, spec, { aim, power: 1 }).holed, false, 'too hot');
  assert.equal(shoot(tilt(0.1), from, spec, { aim, power }).holed, false, 'straight at it ignores the break');
});

test('the ball rolls: less in the rough, hardly at all in sand, further downhill than up, and sideways across a slope', () => {
  const flat = { ...h1, hills: [] }, run = (hole, aim) => { const r = shoot(hole, hole.tee, swingSpec(club('7I'), 'tee', 335), { aim, power: 1 }); return [dist(r.land, r.rest), r]; };
  const [fairway, onto] = run(flat, 0), [rough, off] = run(flat, -0.2);
  assert.deepEqual([onto.lie, off.lie], ['fairway', 'rough']);
  assert.ok(fairway > 8 && rough < fairway / 2, `${rough} in the rough, ${fairway} on the fairway`);
  const bunker = { ...flat, sand: [{ c: [0, 160], rx: 12, ry: 12 }] };
  assert.ok(run(bunker, 0)[0] < 1, 'sand stops it');
  const hill = (h) => ({ ...flat, hills: [{ c: [0, 255], r: 100, h }] }); // +h: the landing area climbs away from the tee
  assert.ok(run(hill(-8), 0)[0] > fairway * 1.2 && run(hill(8), 0)[0] < fairway * 0.9, 'downhill runs on, uphill pulls up short');
  const across = run({ ...flat, hills: [{ c: [100, 160], r: 100, h: 8 }] }, 0)[1]; // high ground to the right
  assert.ok(across.rest[0] < -0.5, 'it falls away to the left');
  assert.ok(onto.curve.length > 10 && dist(onto.curve.at(-1), onto.rest) === 0, 'and leaves a path to replay');
});

test('every green holds a ball: nothing on it is steep enough to roll forever', () => {
  for (const m of MATCHES) for (const h of m.holes) for (let a = 0; a < 6.28; a += 0.4) for (const k of [0, 0.5, 0.95]) {
    const p = [h.green.c[0] + Math.cos(a) * h.green.rx * k, h.green.c[1] + Math.sin(a) * h.green.ry * k];
    assert.ok(Math.hypot(...slopeAt(h, p)) < 0.07, `hole par ${h.par} at ${p.map(Math.round)}`);
  }
});

test('quirks: Kashely gets three mulligans a match and no more, and Tcut is worse than his level once he is angry', () => {
  const m = MATCHES.find((x) => x.foes[0].quirk === 'cheat'), rnd = rng(3), q = { mulligans: 3 };
  for (let i = 0; i < 40; i++) for (const h of m.holes) aiHole(h, m.foes[0], rnd, [0, 0], q);
  assert.equal(q.mulligans, 0);
  const t = MATCHES.find((x) => x.foes[0].quirk === 'rage'), avg = (foe) => { const r = rng(8); let s = 0; for (let i = 0; i < 300; i++) for (const h of t.holes) s += aiHole(h, foe, r); return s / 300; };
  assert.ok(avg(t.foes[0]) > avg(t.foes[0].skill) + 0.3);
});

test('Kashely cheats in plain sight: ranch tees, a foot wedge once the mulligans run out, gimmes, a pencil and a marker', () => {
  const m = MATCHES.find((x) => x.foes[0].quirk === 'cheat'), k = m.foes[0], rnd = rng(4), seen = { kick: 0, gimme: 0 };
  for (let i = 0; i < 30; i++) for (const h of m.holes) {
    const g = foeTee(h, k);
    assert.ok(g.lie === 'tee' && dist(g.pos, h.tee) > 50 && dist(g.pos, h.pin) < dist(h.tee, h.pin) - 50, 'he tees off well up the hole');
    while (!g.holed) {
      const close = g.lie === 'green' && dist(g.pos, h.pin) <= 4, out = foeSwing(h, g, k, rnd, [0, 0], { mulligans: 0 });
      assert.equal(!!out.gimme, close, 'a short putt is good, and only a short one');
      if (out.kick) { seen.kick++; assert.equal(lieAt(h, out.kick.rest), 'fairway'); }
      if (out.gimme) { seen.gimme++; assert.equal(out.res.holed, true); }
      const before = g.strokes; foeApply(g, out);
      assert.equal(g.strokes, Math.min(MAX_STROKES, before + 1), 'no penalties on the ranch');
      assert.ok(g.holed || ['fairway', 'green'].includes(g.lie), `he is never in trouble: ${g.lie}`);
    }
  }
  assert.ok(seen.kick > 5 && seen.gimme > 30, `${seen.kick} kicks, ${seen.gimme} gimmes`);
  assert.deepEqual(foeTee(h1, { skill: 8 }).pos, h1.tee, 'everyone else uses the tee');
  const q = { pencil: 1 }; // one hole a match gets better on paper, and never a birdie
  assert.deepEqual([cardScore(k, 3, 4, q), cardScore(k, 5, 4, q), cardScore(k, 5, 4, q), cardScore({ skill: 5 }, 6, 4, { pencil: 1 })], [3, 4, 5, 6]);
  const back = markBack(h1, [h1.pin[0], h1.pin[1] - 2]);
  assert.ok(Math.abs(dist(back, h1.pin) - 4) < 1e-9 && lieAt(h1, back) === 'green', 'Keetch putts from two yards further');
  assert.equal(markBack(h1, [h1.pin[0], h1.pin[1] + h1.green.ry]), null, 'but he is not marked off the green');
});

test('ten strokes and you pick up', () => {
  const g = { ...teeUp(h1), strokes: MAX_STROKES - 1 };
  applyShot(g, { rest: [0, 100], lie: 'fairway', holed: false, penalty: 1 });
  assert.deepEqual([g.strokes, g.holed, g.pickedUp], [MAX_STROKES, true, true]);
});

test('better golfers score lower, the same seed replays the same round, and match 1 is winnable', () => {
  const m = MATCHES[0];
  const round = (skill, rnd) => m.holes.reduce((s, h) => s + aiHole(h, skill, rnd), 0);
  assert.equal(round(4, rng(5)), round(4, rng(5)));
  const avg = (skill) => { const rnd = rng(skill); let t = 0; for (let i = 0; i < 400; i++) t += round(skill, rnd); return t / 400; };
  const [bad, mid, good] = [1, 5, 10].map(avg);
  assert.ok(bad > mid + 2 && mid > good + 2, `${bad} > ${mid} > ${good}`);
  const rnd = rng(99); let wins = 0;
  for (let i = 0; i < 400; i++) { const me = round(7, rnd); if (m.foes.every((f) => me < round(f.skill, rnd))) wins++; }
  assert.ok(wins / 400 > 0.85, `a decent golfer beats ${m.foes.map((f) => f.name).join(' and ')} (${wins}/400)`);
});
