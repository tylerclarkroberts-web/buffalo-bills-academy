// The Bug Gym: five paths, their outcomes, what they do in the ring and in the Acid Mines, and roid rage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn } from '../server/barn.js';
import { Shop } from '../server/shop.js';
import { Mines } from '../server/mines.js';
import { Pvp } from '../server/pvp.js';
import { startBout, line, simulateBout } from '../server/engine/bout.js';
import { PATHS, PATH_IDS, FIT_CAP, ROID_POWER, POWER_CAP, gymAt, gymEffects, gymView, gymFighter, trainStep, STRAIN_LIMIT } from '../server/engine/gym.js';
import { BugGuide, BALK_S } from '../client/src/mines/bugGuide.js';
import { wildAt } from '../server/engine/wild-roam.js';

const V = { rulesVersion: 2 };
const HOUR = 3600e3;

function fixture(t, { gymInt, rageInt } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-gym-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: Date.parse('2031-06-15T18:00:00Z') }, now = () => clock.now;
  const store = new Store(dir), accounts = new Accounts({ store, now });
  const barn = new Barn({ store, accounts, now, incubateMs: 1000, eggInt: (n) => (n === 100000 ? 99999 : 0), gymInt: gymInt || (() => 0) });
  const shop = new Shop({ store, accounts, barn, now });
  const mines = new Mines({ store, accounts, barn, now, randInt: (n) => (n === 100000 ? 50000 : 0), scareInt: (n) => n - 1, poolInt: () => 40000 });
  mines.owned = (id) => shop.doc.inv[id]?.own;
  const pvp = new Pvp({ store, accounts, mines, shop, barn, avatars: null, now, randInt: () => 0, jarInt: () => 0, rageInt: rageInt || (() => 0) });
  const player = store.players.ann = { id: 'ann', name: 'ANN', kind: 'password', login: { username: 'ann' }, createdAt: clock.now - 30 * 86400e3 };
  accounts.ensure(player); player.bankroll = 2000; store.savePlayers();
  barn.layEgg('ann'); clock.now += 2000; barn.view('ann');
  barn.doc.pens.ann.xp = 40 * (12 - 1) ** 2; // level 12
  for (const k of ['hunger', 'mood', 'clean']) barn.doc.pens.ann.stats[k] = { v: 90, at: clock.now };
  barn.save();
  const bug = () => barn.view('ann').pen;
  const train = (p) => { const r = barn.train('ann', p); clock.now += 2 * HOUR; return r; }; // past every cooldown, little decay
  return { clock, store, accounts, barn, shop, mines, pvp, player, bug, train };
}

/** Win rate of `a` against `b` over many seeds, from the real fight engine. */
function winRate(a, b, n = 200) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    w += simulateBout(a, b, `seed-${i}`).winner === 0 ? 1 : 0;
  }
  return w / n;
}

test('every path exists with the agreed flavour', () => {
  assert.deepEqual(PATH_IDS, ['clean', 'spar', 'overwork', 'roids', 'cooldown']);
  assert.equal(PATHS.roids.needs.mood, -40, 'roids tank mood by 40');
  assert.ok(PATHS.roids.roid * ROID_POWER >= 0.2, 'one vial is at least +20% damage');
  assert.equal(POWER_CAP, FIT_CAP + 0.6);
});

test('clean workout: modest power, mood up, zero unruliness, zero mine penalty, zero rage', (t) => {
  const f = fixture(t);
  const r = f.train('clean');
  assert.equal(r.gym.delta.mood, 6);
  assert.equal(r.gym.after.power, 0.01);
  assert.ok(r.gym.xp > 0);
  const g = f.bug().gym;
  assert.equal(g.unruly, 0); assert.equal(g.mineSpeed, 1); assert.equal(g.rage, 0); assert.equal(g.juiced, false);
});

test('sparring: a sharp bout pays more than a rough scrap; neither adds rage', (t) => {
  const sharp = fixture(t, { gymInt: () => 0 }).train('spar').gym;
  const rough = fixture(t, { gymInt: () => 99 }).train('spar').gym;
  assert.equal(sharp.outcome, 'sharp'); assert.equal(rough.outcome, 'rough');
  assert.ok(sharp.xp > rough.xp);
  assert.ok(sharp.after.power > rough.after.power);
  assert.ok(sharp.delta.hunger < 0 && sharp.delta.clean < 0, 'costs fed and clean');
  for (const r of [sharp, rough]) { assert.equal(r.after.rage, 0); assert.equal(r.after.unruly, 0); }
});

test('overwork: faster power, drains mood, builds strain and unruliness, slows the mine pace; stacked, it adds rage', (t) => {
  const f = fixture(t);
  const r = f.train('overwork').gym;
  assert.equal(r.after.power, PATHS.overwork.fit);
  assert.ok(r.after.power > PATHS.clean.fit * 3);
  assert.equal(r.delta.mood, -20);
  assert.equal(r.after.strain, 30);
  assert.ok(r.after.unruly > 0);
  assert.ok(r.after.mineSpeed < 1);
  assert.equal(r.after.rage, 0, 'one double shift is not dangerous');
  f.clock.now -= 2 * HOUR - 16 * 60e3; // the 15 minute cooldown only
  for (let i = 0; i < 2; i++) { f.barn.train('ann', 'overwork'); f.clock.now += 16 * 60e3; }
  const g = f.bug().gym;
  assert.ok(g.strain > 50, `strain ${g.strain}`);
  assert.ok(g.rage > 0, 'stacked overwork can snap');
});

test('steroids clearly tank mood and make the bug way stronger, with a heavy unruly/rage downside', (t) => {
  const f = fixture(t);
  const before = f.bug();
  const r = f.train('roids').gym;
  assert.equal(r.delta.mood, -40, 'mood drops 40 points');
  assert.equal(r.before.needs.mood - r.after.needs.mood, 40);
  assert.equal(r.after.power, 0.24, '+24% damage from one vial');
  assert.ok(r.after.bulk > 0, 'and more health');
  assert.equal(r.cost, 25); assert.equal(f.store.players.ann.bankroll, 2000 - 25);
  assert.ok(r.after.unruly >= 25); assert.ok(r.after.mineSpeed <= 0.85); assert.ok(r.after.rage >= 0.2);
  assert.ok(f.bug().needs.mood < before.needs.mood - 35, 'the Barn mood meter shows it');
  f.train('roids');
  const g = f.bug().gym;
  assert.ok(g.power >= 0.45, `two vials: ${g.power}`);
  assert.ok(g.rage >= 0.45, `rage ${g.rage}`);
  assert.ok(g.mineSpeed <= 0.7, `pace ${g.mineSpeed}`);
  assert.ok(f.bug().needs.mood <= 15, 'two vials: miserable');
});

test('steroid power is real in the ring: bigger hits, more HP, and it wins far more often', (t) => {
  const f = fixture(t);
  const clean = f.barn.fighter('ann', f.barn.doc.pens.ann);
  assert.equal(clean.gym, undefined, 'an untrained bug carries nothing extra');
  f.train('roids'); f.clock.now -= HOUR; f.train('roids');
  const juiced = f.barn.fighter('ann', f.barn.doc.pens.ann);
  assert.ok(juiced.gym >= 0.45 && juiced.bulk > 0 && juiced.slow > 0);
  const S0 = startBout(clean, clean, 'x'), S1 = startBout({ ...juiced, mood: clean.mood }, clean, 'x'); // same condition: the gym alone
  assert.ok(S1.side[0].boost / S0.side[0].boost >= 1.45, 'damage multiplier');
  assert.ok(S1.maxHp[0] > S0.maxHp[0], 'more health');
  const even = winRate({ ...clean, mood: 90 }, { ...clean, mood: 90 });
  const roided = winRate({ ...juiced, mood: 90 }, { ...clean, mood: 90 });
  assert.ok(roided > even + 0.25, `juiced ${roided} vs mirror ${even}`);
  assert.ok(line(juiced, clean) > 0.75, `the betting line agrees: ${line(juiced, clean)}`);
});

test('cool-down flushes roid load and strain; the dirty edge tapers with it; time fades them too', (t) => {
  const f = fixture(t);
  f.train('roids'); f.train('overwork');
  const hot = f.bug().gym;
  const r = f.train('cooldown').gym;
  assert.ok(r.after.roid < hot.roid && r.after.strain < hot.strain);
  assert.ok(r.after.power < hot.power, 'less juice, less power');
  assert.ok(r.after.rage < hot.rage);
  assert.ok(r.delta.mood > 0);
  f.clock.now += 6 * 24 * HOUR;
  const g = f.bug().gym;
  assert.equal(g.roid, 0); assert.equal(g.strain, 0); assert.equal(g.rage, 0); assert.equal(g.mineSpeed, 1);
  assert.ok(g.power > 0, 'clean conditioning is kept for good');
  assert.throws(() => f.barn.train('ann', 'cooldown'), /Nothing to cool down/);
});

test('cooldowns, money, hunger and limits are enforced', (t) => {
  const f = fixture(t);
  f.barn.train('ann', 'clean');
  assert.throws(() => f.barn.train('ann', 'clean'), (e) => e.status === 429);
  f.player.bankroll = 10; f.store.savePlayers();
  assert.throws(() => f.barn.train('ann', 'roids'), /\$|fund|afford|enough/i);
  f.player.bankroll = 2000; f.store.savePlayers();
  assert.ok(trainStep('overwork', { gym: { strain: STRAIN_LIMIT - 1, at: 0 }, needs: { hunger: 90, mood: 90, clean: 90 }, now: 0 }), 'just under the limit it still lifts');
  assert.throws(() => trainStep('overwork', { gym: { strain: 95, at: 0 }, needs: { hunger: 90, mood: 90, clean: 90 }, now: 0 }), /will not lift/);
  assert.throws(() => trainStep('clean', { gym: null, needs: { hunger: 2, mood: 90, clean: 90 }, now: 0 }), /hungry/);
  assert.throws(() => trainStep('roids', { gym: { roid: 100, at: 0 }, needs: { hunger: 90, mood: 90, clean: 90 }, now: 0 }), /no room/);
  assert.throws(() => f.barn.train('ann', 'bench-press'), /machine/);
  f.barn.doc.pens.ann.faintedAt = f.clock.now; f.barn.save();
  assert.throws(() => f.barn.train('ann', 'spar'), /fainted/);
});

test('legacy barn.json bugs with no gym fields read as all zeros and fight exactly as before', (t) => {
  const f = fixture(t);
  const pen = f.barn.doc.pens.ann;
  assert.equal(pen.gym, undefined);
  const v = f.bug().gym;
  assert.deepEqual([v.power, v.roid, v.strain, v.unruly, v.mineSpeed, v.rage, v.juiced], [0, 0, 0, 0, 1, 0, false]);
  assert.deepEqual(gymFighter(undefined, 0), {});
  assert.deepEqual(gymAt(undefined, 123), { fit: 0, roid: 0, strain: 0 });
  assert.deepEqual(gymEffects(), { power: 0, bulk: 0, unruly: 0, mineSpeed: 1, rage: 0, balk: 0, slow: 0 });
  const fighter = f.barn.fighter('ann', pen);
  for (const k of ['gym', 'bulk', 'slow']) assert.equal(k in fighter, false);
  assert.equal(gymView({ junk: true }, 5).power, 0, 'garbage reads as zero');
});

test('mines: a juiced guide is exposed to the mine, walks slower and balks; a clean one does not', (t) => {
  const f = fixture(t);
  assert.equal(f.mines.guideBug('ann').gym, undefined, 'clean bug: no gym in the mine');
  f.train('roids'); f.train('roids');
  const guide = f.mines.guideBug('ann');
  assert.ok(guide.gym.mineSpeed <= 0.7 && guide.gym.rage > 0 && guide.gym.balk > 0);
  const s = f.mines.start(f.player, V);
  assert.ok(s.bug.gym, 'the shift hands the page the gym state');
  // the client guide: same corridor, same time, the juiced one gets less far
  const grid = [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [1, ...Array(22).fill(0), 1], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]];
  const maze = { grid, pool: { x: 22, y: 1 }, start: { x: 1, y: 1 } };
  const run = (bug, rng) => {
    const g = new BugGuide(maze, { armed: true, bug, afterMs: 0, rng });
    const p = { x: 2.2, z: 2.2, yaw: 0, elapsedMs: 10 };
    g.update(0.01, p); const x0 = g.x;
    for (let i = 0; i < 400; i++) { p.x = g.x; g.update(0.02, p); }
    return { dist: g.x - x0, events: g.events };
  };
  const clean = run({ species: 'onymacris' }, () => 0.99);
  const juiced = run({ species: 'onymacris', gym: { mineSpeed: guide.gym.mineSpeed, balk: 0 } }, () => 0.99);
  assert.ok(juiced.dist < clean.dist * 0.8, `juiced ${juiced.dist} vs clean ${clean.dist}`);
  const balky = run({ species: 'onymacris', gym: { mineSpeed: 1, balk: 1 } }, () => 0);
  assert.ok(balky.events.includes('balk'));
  assert.ok(balky.dist < clean.dist, 'a balk stops it dead for a while');
  assert.ok(BALK_S > 1);
});

function wildFight(f) {
  const s = f.mines.start(f.player, V);
  const wild = s.wilds.find((w) => !w.force);
  assert.ok(wild, 'a wild bug on shift');
  f.pvp.tick(f.player, { ...V, shiftId: s.shiftId });
  Object.assign(f.pvp.presence.get('ann'), wildAt(wild, f.clock.now));
  f.pvp.meetWild(f.player, { shiftId: s.shiftId, wildId: wild.id });
  const battle = f.pvp.battles.get(f.pvp.inBattle.get('ann'));
  assert.ok(battle, 'the fight started');
  return { s, wild, battle };
}

test('roid rage: a juiced bug that KOs a wild bug may kill it before the jar; capture is refused', (t) => {
  const rolls = [];
  const f = fixture(t, { rageInt: (n) => (rolls.push(n), 0) }); // the lowest roll: rage if there is any chance at all
  f.train('roids'); f.train('roids');
  const { battle, wild, s } = wildFight(f);
  assert.ok(battle.rage >= 0.45);
  const log = t.mock.method(console, 'log', () => {});
  battle.fight.S.hp[1] = 0; f.pvp.fights.finish(battle.fight, 0);
  assert.deepEqual(rolls, [10000]);
  assert.equal(battle.over.reason, 'fainted');
  assert.equal(battle.over.rage.killed, battle.wild.name);
  assert.equal(battle.over.jars, undefined, 'no jar phase');
  assert.ok(log.mock.calls.some((c) => /roid rage/.test(c.arguments[0])), 'logged');
  const view = f.pvp.battleView(battle, 'ann');
  assert.ok(view.over.rage, 'the page is told');
  assert.equal(view.jar, undefined, 'no jar button');
  f.shop.buy(f.player, 'jar');
  assert.throws(() => f.pvp.jar(f.player, { battleId: battle.id }), /berserk/);
  assert.equal(f.barn.bugs('ann').length, 1, 'nothing was adopted');
  assert.equal(f.mines.wildsFor(f.mines.doc.active.ann, 'ann').some((w) => w.id === wild.id), false, 'the wild bug is gone from the shift');
  assert.ok(s);
});

test('roid rage misses on a high roll, and a clean bug never rolls: the jar works as before', (t) => {
  const high = fixture(t, { rageInt: () => 9999 });
  high.train('roids');
  const a = wildFight(high).battle;
  a.fight.S.hp[1] = 0; high.pvp.fights.finish(a.fight, 0);
  assert.equal(a.over.rage, undefined); assert.equal(a.over.jars, 3);

  let rolled = 0;
  const clean = fixture(t, { rageInt: () => (rolled++, 0) });
  clean.train('clean'); clean.train('spar');
  const b = wildFight(clean).battle;
  assert.equal(b.rage, 0, '0% for a clean bug');
  b.fight.S.hp[1] = 0; clean.pvp.fights.finish(b.fight, 0);
  assert.equal(rolled, 0, 'never even rolled');
  assert.equal(b.over.rage, undefined); assert.equal(b.over.jars, 3);
  clean.shop.buy(clean.player, 'jar');
  const r = clean.pvp.jar(clean.player, { battleId: b.id });
  assert.equal(r.held, true, 'caught as usual');
});

test('rage chance scales with load: noticeable after one vial, dangerous at a full load', () => {
  const at = (roid, strain = 0) => gymEffects({ fit: 0, roid, strain }).rage;
  assert.equal(at(0), 0);
  assert.ok(at(40) >= 0.2 && at(40) < 0.3);
  assert.ok(at(80) >= 0.45);
  assert.ok(at(100, 100) >= 0.8);
  assert.equal(at(0, 50), 0, 'moderate strain alone is safe');
  assert.ok(at(0, 100) > 0, 'heavy strain alone can snap');
});

test('POST /barn/gym is wired', () => {
  const src = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
  assert.match(src, /api\.post\('\/barn\/gym'/);
});
