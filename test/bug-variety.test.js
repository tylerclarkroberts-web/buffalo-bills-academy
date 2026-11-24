// Bug variety: every bug gets its own base, ailments, faint fruit and colouring, once, from its id, and keeps it.
// Cosmetic only: fights read none of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, idOf } from '../server/barn.js';
import { ROSTER } from '../server/engine/creatures.js';
import { line, simulateBout } from '../server/engine/bout.js';
import { BASES, AILMENTS, FRUITS, PATTERNS, varietyFor, cleanVariety, varietyLabels, varietyKey } from '../server/engine/variety.js';
import { spriteGrid } from '../client/src/barn/sprite.js';

const clock = () => ({ now: Date.parse('2031-06-15T18:00:00Z') });
function fixture(t, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-variety-'))) {
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const c = clock(), now = () => c.now, store = new Store(dir), accounts = new Accounts({ store, now });
  const make = () => new Barn({ store: new Store(dir), accounts, now, incubateMs: 1000, eggInt: () => 0 });
  return { dir, c, store, make, barn: new Barn({ store, accounts, now, incubateMs: 1000, eggInt: () => 0 }) };
}
const differ = (a, b) => { let n = 0; a.forEach((row, y) => row.forEach((px, x) => { if (px !== b[y][x]) n++; })); return n; };

test('variety is decided by the bug alone: the same id and species always give the same look', () => {
  for (const id of [1, 1793834063911, 1795202956391, 'abc']) assert.deepEqual(varietyFor(id, 'lamprima'), varietyFor(id, 'lamprima'));
  assert.notDeepEqual(varietyFor(1793834063911, 'lamprima'), varietyFor(1793834063912, 'lamprima'));
  const seen = { base: new Set(), ail: new Set(), fruit: new Set(), pat: new Set(), two: 0, morphs: 0 };
  for (let i = 0; i < 600; i++) {
    const v = varietyFor(1790000000000 + i * 7919, ROSTER[i % ROSTER.length].id);
    assert.deepEqual(cleanVariety(v), v, 'whatever it picks survives cleaning unchanged');
    assert.ok(v.ail.length >= 1 && v.ail.length <= 2 && new Set(v.ail).size === v.ail.length);
    if (v.ail.length === 2) { seen.two++; assert.notEqual(AILMENTS[v.ail[0]].spot, AILMENTS[v.ail[1]].spot, 'two ailments never draw in the same spot'); }
    assert.ok(Math.abs(v.hue) <= 70 && Math.abs(v.tone) <= 9); if (Math.abs(v.hue) >= 40) seen.morphs++;
    seen.base.add(v.base); v.ail.forEach((a) => seen.ail.add(a)); seen.fruit.add(v.fruit); seen.pat.add(v.pat);
  }
  assert.deepEqual([...seen.base].sort(), Object.keys(BASES).sort(), 'legs, wheels, rotor, tracks and slug all turn up');
  assert.deepEqual([...seen.ail].sort(), Object.keys(AILMENTS).sort());
  assert.deepEqual([...seen.fruit].sort(), Object.keys(FRUITS).sort());
  assert.deepEqual([...seen.pat].sort(), [...PATTERNS].sort());
  assert.ok(seen.two > 100 && seen.two < 300, 'some bugs have two');
  assert.ok(seen.morphs > 30 && seen.morphs < 120, 'about one in eight is a colour morph');
});

test('a stored or sent variety is cleaned: unknown values never reach the drawing', () => {
  assert.equal(cleanVariety(null), null); assert.equal(cleanVariety({ base: 'jetpack' }), null); assert.equal(cleanVariety('legs'), null);
  assert.deepEqual(cleanVariety({ base: 'slug', ail: ['pox', 'pox', 'plague', 'grin', 'cloud'], fruit: 'durian', hue: 999, tone: -999, pat: '<script>', seed: -5 }),
    { v: 1, seed: 0, base: 'slug', ail: ['pox', 'grin'], fruit: null, hue: 90, tone: -12, pat: 'plain' });
  const labels = varietyLabels({ base: 'rotor', ail: ['nightowl'], fruit: 'pea' });
  assert.equal(labels.base.name, 'Hover Rotor'); assert.equal(labels.ail[0].name, 'Night Owl'); assert.ok(labels.ail[0].line.length > 10); assert.equal(labels.fruit.name, 'pea pod');
  for (const a of Object.values(AILMENTS)) assert.ok(a.name && a.line && a.line.length < 60, `${a.name}: a name and one short line`);
});

test('existing bugs get their variety on load, nothing else on the pen changes, and it is kept from then on', (t) => {
  const f = fixture(t);
  f.barn.layEgg('ann'); f.c.now += 2000; f.barn.view('ann');
  f.barn.adopt('ann', { wildId: 'w1', battleId: 'b1', species: 'halobates', level: 4 });
  // as a live barn saved before variety existed: no `variety` on any pen
  const doc = JSON.parse(JSON.stringify(f.barn.doc));
  delete doc.pens.ann.variety; for (const pen of doc.bench.ann) delete pen.variety;
  f.store.saveDoc('barn', doc);
  const before = JSON.parse(JSON.stringify(doc));
  const loaded = f.make();
  const pens = [loaded.doc.pens.ann, ...loaded.doc.bench.ann], old = [before.pens.ann, ...before.bench.ann];
  pens.forEach((pen, i) => {
    assert.deepEqual(pen.variety, varietyFor(idOf(pen), pen.species), 'the look it would have been given anyway');
    const { variety, ...rest } = pen; assert.deepEqual(rest, old[i], 'no data lost or changed');
  });
  const saved = JSON.parse(fs.readFileSync(path.join(f.dir, 'barn.json'), 'utf8'));
  assert.deepEqual(saved.pens.ann.variety, pens[0].variety, 'written to disk on that load');
  // a stored look wins over the formula, so a later change to the lists never redraws anyone's bug
  saved.pens.ann.variety = { v: 1, seed: 7, base: 'tracks', ail: ['tidy'], fruit: 'stem', hue: 3, tone: 0, pat: 'plain' };
  f.store.saveDoc('barn', saved);
  const again = f.make();
  assert.deepEqual(again.doc.pens.ann.variety, saved.pens.ann.variety);
  assert.deepEqual(again.looksOf('ann').variety, saved.pens.ann.variety, 'and that is the one it is drawn with');
});

test('new eggs, hatchlings and caught bugs come with a variety, and the hatchling keeps the egg\'s', (t) => {
  const f = fixture(t);
  f.barn.layEgg('bob');
  const egg = f.barn.doc.pens.bob;
  assert.deepEqual(egg.variety, varietyFor(egg.eggAt, egg.species));
  const v = egg.variety; f.c.now += 2000; f.barn.view('bob');
  assert.equal(f.barn.doc.pens.bob.stage, 'creature'); assert.deepEqual(f.barn.doc.pens.bob.variety, v);
  f.barn.adopt('bob', { wildId: 'w2', battleId: 'b2', species: 'macrodontia', level: 2 });
  const caught = f.barn.doc.bench.bob[0];
  assert.deepEqual(caught.variety, varietyFor(idOf(caught), 'macrodontia'));
  // every surface that draws the bug gets it through its style
  assert.deepEqual(f.barn.view('bob').pen.style.variety, v);
  assert.deepEqual(f.barn.fighter('bob', f.barn.doc.pens.bob).style.variety, v);
});

test('variety is cosmetic: the odds and the fight come out the same with or without it', (t) => {
  const f = fixture(t);
  for (const id of ['ann', 'bob']) { f.barn.layEgg(id); }
  f.c.now += 2000; f.barn.view('ann'); f.barn.view('bob');
  for (const id of ['ann', 'bob']) f.barn.doc.pens[id].xp = 40 * 7 ** 2;
  const a = f.barn.fighter('ann', f.barn.doc.pens.ann), b = f.barn.fighter('bob', f.barn.doc.pens.bob);
  assert.ok(a.style?.variety && b.style?.variety);
  const plain = (x) => ({ ...x, style: undefined });
  assert.equal(line(a, b), line(plain(a), plain(b)));
  const strip = (r) => JSON.parse(JSON.stringify(r.rounds));
  assert.deepEqual(strip(simulateBout(a, b, 'seed-1')), strip(simulateBout(plain(a), plain(b), 'seed-1')));
  // and the wilder looks change nothing either
  const wheels = (x) => ({ ...x, style: { variety: { ...x.style.variety, base: 'wheels', ail: ['pox', 'grin'] } } });
  assert.deepEqual(strip(simulateBout(wheels(a), b, 'seed-2')), strip(simulateBout(plain(a), b, 'seed-2')));
});

test('every species draws with every base, ailment and fruit, as hatched and evolved, on every grid', () => {
  const ails = Object.keys(AILMENTS), fruits = Object.keys(FRUITS), bases = Object.keys(BASES);
  ROSTER.forEach((bug, i) => {
    for (const [fine, evo] of [[1, 0], [2, 0], [1, 1], [1, 2]]) {
      const v = { seed: i + 1, base: bases[i % bases.length], ail: [ails[i % ails.length], ails[(i + 5) % ails.length]], fruit: fruits[i % fruits.length], hue: 10, tone: -4, pat: PATTERNS[i % 3] };
      const g = spriteGrid(bug, 10, fine, evo, false, v);
      assert.equal(g.length, 64 * fine); assert.ok(g.every((row) => row.length === 64 * fine && row.every((px) => px === null || /^#[0-9a-f]{6}$/.test(px))), `${bug.id} ${fine} ${evo}`);
    }
  });
});

test('the drawing is stable, a base replaces the legs, and fruit stays a whisper', () => {
  const bug = ROSTER.find((b) => b.id === 'lamprima'), v = { seed: 9, base: 'legs', ail: [], fruit: null, hue: 0, tone: 0, pat: 'plain' };
  assert.deepEqual(spriteGrid(bug, 10, 1, 0, false, v), spriteGrid(bug, 10, 1, 0, false, v), 'same look, same pixels');
  assert.deepEqual(spriteGrid(bug, 10, 1, 0, false, v), spriteGrid(bug, 10, 1), 'plain legs, no marks, no shift: the species sprite');
  for (const evo of [1, 2]) assert.deepEqual(spriteGrid(bug, 10, 1, evo, false, { ...v, base: 'wheels' }), spriteGrid(bug, 10, 1, evo), 'an evolved body keeps its own legs and kit');
  const legs = spriteGrid(bug, 10, 1, 0, false, v);
  for (const base of ['wheels', 'rotor', 'tracks', 'slug']) assert.ok(differ(legs, spriteGrid(bug, 10, 1, 0, false, { ...v, base })) > 40, `${base} looks clearly different`);
  for (const fruit of Object.keys(FRUITS)) { const n = differ(legs, spriteGrid(bug, 10, 1, 0, false, { ...v, fruit })); assert.ok(n <= 16, `${fruit}: ${n} pixels at most a handful`); }
  for (const ail of Object.keys(AILMENTS)) assert.ok(differ(legs, spriteGrid(bug, 10, 1, 0, false, { ...v, ail: [ail] })) > 0, `${ail} shows`);
  // two bugs of a species with different seeds look different
  assert.notDeepEqual(spriteGrid(bug, 10, 1, 0, false, varietyFor(1, 'lamprima')), spriteGrid(bug, 10, 1, 0, false, varietyFor(2, 'lamprima')));
  // young bugs keep their grub bodies: no base yet
  const grub = spriteGrid(bug, 1, 1, 0, false, { ...v, base: 'wheels' }); assert.equal(differ(grub, spriteGrid(bug, 1, 1, 0, false, v)), 0);
  assert.notEqual(varietyKey(varietyFor(1, 'x')), varietyKey(varietyFor(2, 'x')));
});

test('every species has its own mining tool, with a name and a line, drawn in its hand', async () => {
  const { TOOLS, SPECIES_TOOL, toolFor } = await import('../server/engine/tools.js');
  const obscure = ['spoon', 'gad', 'moil', 'singlejack', 'doublejack', 'tamper', 'canary', 'carbide', 'scaling', 'dolly', 'pollpick', 'davy', 'riffle', 'rocker', 'drillsteel'];
  for (const bug of ROSTER) {
    if (bug.id === 'steeze') { assert.equal(toolFor(bug.id), null, 'the photo bug is left alone'); continue; }
    const t = toolFor(bug.id); assert.ok(t && t.name && t.line && t.line.length < 70, bug.id);
    assert.deepEqual(toolFor(bug.id), t, 'fixed per species');
  }
  assert.deepEqual(new Set(Object.values(SPECIES_TOOL)), new Set(Object.keys(TOOLS)), 'every tool is somebody\'s');
  for (const id of obscure) assert.ok(TOOLS[id], id);
  // the tool is in the picture: the same bug with and without it differs, on the right-hand side only
  const { drawTool } = await import('../client/src/barn/varietyArt.js');
  assert.equal(typeof drawTool, 'function');
  const lamprima = ROSTER.find((b) => b.id === 'lamprima'), g = spriteGrid(lamprima, 10, 1);
  const plain = spriteGrid({ ...lamprima, id: 'lamprima-no-tool' }, 10, 1);
  let left = 0, right = 0; g.forEach((row, y) => row.forEach((px, x) => { if (px !== plain[y][x]) (x < 32 ? left++ : right++); }));
  assert.ok(right > 10 && left === 0, `tool pixels: ${right} right, ${left} left`);
});
