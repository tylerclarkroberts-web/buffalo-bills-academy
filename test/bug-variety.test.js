// Bug variety: every bug gets its own base, ailments, faint fruit and colouring, once, from its id, and keeps it, and
// wears it (with its species' mining tool) once it is a Stage II bug. Stage I and Stage III are drawn exactly as before.
// Cosmetic only: fights read none of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { Accounts } from '../server/accounts.js';
import { Barn, idOf } from '../server/barn.js';
import { ROSTER } from '../server/engine/creatures.js';
import { line, simulateBout } from '../server/engine/bout.js';
import { BASES, AILMENTS, FRUITS, PATTERNS, MORPHS, METALS, varietyFor, cleanVariety, varietyLabels, varietyKey } from '../server/engine/variety.js';
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
  const seen = { base: new Set(), ail: new Set(), fruit: new Set(), pat: new Set(), morph: new Set(), metal: new Set(), two: 0, far: 0, morphs: 0 };
  for (let i = 0; i < 600; i++) {
    const v = varietyFor(1790000000000 + i * 7919, ROSTER[i % ROSTER.length].id);
    assert.deepEqual(cleanVariety(v), v, 'whatever it picks survives cleaning unchanged');
    assert.ok(v.ail.length >= 1 && v.ail.length <= 2 && new Set(v.ail).size === v.ail.length);
    if (v.ail.length === 2) { seen.two++; assert.notEqual(AILMENTS[v.ail[0]].spot, AILMENTS[v.ail[1]].spot, 'two ailments never draw in the same spot'); }
    assert.ok(Math.abs(v.hue) <= 180 && Math.abs(v.tone) <= 14); if (Math.abs(v.hue) >= 60) seen.far++; if (v.morph !== 'none') seen.morphs++;
    seen.morph.add(v.morph); seen.metal.add(v.metal); seen.base.add(v.base); v.ail.forEach((a) => seen.ail.add(a)); seen.fruit.add(v.fruit); seen.pat.add(v.pat);
  }
  assert.deepEqual([...seen.base].sort(), Object.keys(BASES).sort(), 'wheels, rotor, tracks and slug all turn up: no Stage II bug keeps plain legs');
  assert.deepEqual([...seen.ail].sort(), Object.keys(AILMENTS).sort());
  assert.deepEqual([...seen.fruit].sort(), Object.keys(FRUITS).sort());
  assert.deepEqual([...seen.pat].sort(), [...PATTERNS].sort());
  assert.ok(seen.two > 100 && seen.two < 300, 'some bugs have two');
  assert.deepEqual([...seen.morph].sort(), [...MORPHS].sort()); assert.deepEqual([...seen.metal].sort(), [...METALS].sort());
  assert.ok(seen.far > 250, `most are turned well round the colour wheel (${seen.far} of 600)`);
  assert.ok(seen.morphs > 330 && seen.morphs < 470, `about two in three have a morph (${seen.morphs})`);
});

test('a stored or sent variety is cleaned: unknown values never reach the drawing', () => {
  assert.equal(cleanVariety(null), null); assert.equal(cleanVariety({ base: 'jetpack' }), null); assert.equal(cleanVariety('legs'), null);
  assert.ok(BASES[cleanVariety({ seed: 5, base: 'legs' }).base], 'a look stored with legs gets a real base');
  assert.equal(BASES.legs, undefined);
  assert.deepEqual(cleanVariety({ base: 'slug', ail: ['pox', 'pox', 'plague', 'grin', 'cloud'], fruit: 'durian', hue: 999, tone: -999, pat: '<script>', seed: -5 }),
    { v: 2, seed: 0, base: 'slug', ail: ['pox', 'grin'], fruit: null, hue: 180, tone: -14, pat: 'plain', morph: 'none', metal: 'iron' });
  assert.equal(cleanVariety({ base: 'slug', morph: 'zombie', metal: 'unobtainium' }).metal, 'iron');
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
  saved.pens.ann.variety = { v: 2, seed: 7, base: 'tracks', ail: ['tidy'], fruit: 'stem', hue: 3, tone: 0, pat: 'plain', morph: 'pale', metal: 'teal' };
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

test('every species draws with every base, ailment and fruit, at every stage, on every grid', () => {
  const ails = Object.keys(AILMENTS), fruits = Object.keys(FRUITS), bases = Object.keys(BASES);
  ROSTER.forEach((bug, i) => {
    for (const [fine, evo, botched] of [[1, 0], [2, 0], [1, 1], [2, 1], [1, 1, true], [1, 2]]) {
      const v = { seed: i + 1, base: bases[i % bases.length], ail: [ails[i % ails.length], ails[(i + 5) % ails.length]], fruit: fruits[i % fruits.length], hue: 10, tone: -4, pat: PATTERNS[i % 3] };
      const g = spriteGrid(bug, 10, fine, evo, !!botched, v);
      assert.equal(g.length, 64 * fine); assert.ok(g.every((row) => row.length === 64 * fine && row.every((px) => px === null || /^#[0-9a-f]{6}$/.test(px))), `${bug.id} ${fine} ${evo}`);
    }
  });
});

test('Stage I is untouched: larvae and grown Stage I bugs draw exactly as before, whatever their variety', () => {
  const bases = Object.keys(BASES), ails = Object.keys(AILMENTS), fruits = Object.keys(FRUITS);
  ROSTER.forEach((bug, i) => {
    const v = { seed: i + 3, base: bases[i % 4], ail: [ails[i % ails.length]], fruit: fruits[i % fruits.length], hue: 60, tone: 9, pat: 'freckles' };
    for (const level of [1, 3, 10]) for (const fine of [1, 2]) assert.deepEqual(spriteGrid(bug, level, fine, 0, false, v), spriteGrid(bug, level, fine), `${bug.id} Lv ${level} x${fine}`);
    // Stage III is left as it was too
    assert.deepEqual(spriteGrid(bug, 10, 1, 2, false, v), spriteGrid(bug, 10, 1, 2), `${bug.id} Stage III`);
  });
  // and pixel for pixel the art from before variety (the #223 sprites, commit 1cdbec9). If Stage I art is ever changed
  // on purpose, this fingerprint is the one line to update.
  const h = crypto.createHash('sha256');
  for (const bug of ROSTER) for (const lv of [1, 3, 10]) for (const fine of [1, 2, 4]) h.update(JSON.stringify(spriteGrid(bug, lv, fine)));
  assert.equal(h.digest('hex'), 'e85f7b850184372ad515f76e3a0629cdcdb9cf37c0cc007f58881f0a412ecdea');
});

// Since the Stage II redraw (stageTwoArt.js) a clean Stage II bug is drawn bare; only a botched one still wears its variety.
test('a botched Stage II bug changes: a base instead of legs, its ailments, a whisper of fruit, its colouring', () => {
  const bug = ROSTER.find((b) => b.id === 'lamprima'), v = { seed: 9, base: 'wheels', ail: [], fruit: null, hue: 0, tone: 0, pat: 'plain' };
  const own = spriteGrid(bug, 10, 1, 1, true), wheels = spriteGrid(bug, 10, 1, 1, true, v);
  assert.deepEqual(wheels, spriteGrid(bug, 10, 1, 1, true, v), 'same look, same pixels');
  const grids = Object.keys(BASES).map((base) => spriteGrid(bug, 10, 1, 1, true, { ...v, base }));
  grids.forEach((g, i) => { assert.ok(differ(own, g) > 40, `${Object.keys(BASES)[i]} replaces the iron legs`); grids.slice(i + 1).forEach((o) => assert.ok(differ(g, o) > 40, 'and each base looks like itself')); });
  let shown = 0;
  for (const fruit of Object.keys(FRUITS)) { const n = differ(wheels, spriteGrid(bug, 10, 1, 1, true, { ...v, fruit })); if (n) shown++; assert.ok(n <= 16, `${fruit}: ${n} pixels, a handful at most`); }
  assert.ok(shown >= 6, `faint, but there: ${shown} of 8 fruits show on this body`);
  for (const ail of Object.keys(AILMENTS)) assert.ok(differ(wheels, spriteGrid(bug, 10, 1, 1, true, { ...v, ail: [ail] })) > 0, `${ail} shows`);
  assert.ok(differ(wheels, spriteGrid(bug, 10, 1, 1, true, { ...v, hue: 60 })) > 100, 'a colour morph recolours it');
  // every botched species with any variety at all looks different from its plain art; a clean Stage II bug looks exactly like it
  for (const b of ROSTER) for (const botched of [false, true]) {
    const n = differ(spriteGrid(b, 10, 1, 1, botched), spriteGrid(b, 10, 1, 1, botched, varietyFor(7, b.id)));
    if (b.id === 'steeze' || !botched) assert.equal(n, 0, `${b.id}${botched ? ' botched' : ''}: drawn bare`); else assert.ok(n > 40, `${b.id} botched: ${n}`);
  }
  // two botched bugs of a species with different seeds look different
  assert.notDeepEqual(spriteGrid(bug, 10, 1, 1, true, varietyFor(1, 'lamprima')), spriteGrid(bug, 10, 1, 1, true, varietyFor(2, 'lamprima')));
  assert.notEqual(varietyKey(varietyFor(1, 'x')), varietyKey(varietyFor(2, 'x')));
});

test('every species has its own mining tool, with a name and a line, held by its Stage II body', async () => {
  const { TOOLS, SPECIES_TOOL, toolFor } = await import('../server/engine/tools.js');
  const obscure = ['spoon', 'gad', 'moil', 'singlejack', 'doublejack', 'tamper', 'canary', 'carbide', 'scaling', 'dolly', 'pollpick', 'davy', 'riffle', 'rocker', 'drillsteel'];
  for (const bug of ROSTER) {
    if (bug.id === 'steeze') { assert.equal(toolFor(bug.id), null, 'the photo bug is left alone'); continue; }
    const t = toolFor(bug.id); assert.ok(t && t.name && t.line && t.line.length < 70, bug.id);
    assert.deepEqual(toolFor(bug.id), t, 'fixed per species');
  }
  assert.deepEqual(new Set(Object.values(SPECIES_TOOL)), new Set(Object.keys(TOOLS)), 'every tool is somebody\'s');
  for (const id of obscure) assert.ok(TOOLS[id], id);
  // every tool is drawn from the machine's free right hand, up and out to its right, clear of the body
  const { drawTool } = await import('../client/src/barn/varietyArt.js');
  for (const id of Object.keys(TOOLS)) {
    const xs = [], c = { put: (x) => xs.push(x), line: (x0, y0, x1) => xs.push(x0, x1), ell: (x, y, rx) => xs.push(x - rx, x + rx), hair: (pts) => pts.forEach(([x]) => xs.push(x)) };
    drawTool(c, { top: 10, bottom: 60, rows: [] }, id, { x: 50.5, y: 39 });
    assert.ok(xs.length > 2 && Math.min(...xs) >= 44 && Math.max(...xs) <= 64, `${id}: x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}`);
  }
});

test('two botched Stage II bugs of one species look clearly different: most of their pixels differ', () => {
  for (const id of ['lamprima', 'halobates', 'nemoptera', 'macrodontia']) {
    const bug = ROSTER.find((b) => b.id === id), gs = Array.from({ length: 10 }, (_, i) => spriteGrid(bug, 12, 1, 1, true, varietyFor(1795000000000 + i * 104729, id)));
    const ink = gs[0].flat().filter(Boolean).length; let sum = 0, k = 0, min = Infinity;
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) { const d = differ(gs[i], gs[j]); sum += d; k++; min = Math.min(min, d); }
    assert.ok(sum / k / ink > 0.65, `${id}: on average ${Math.round((100 * sum) / k / ink)}% of its pixels differ`);
    assert.ok(min > 300, `${id}: even the closest pair differs in ${min} pixels`);
  }
});
