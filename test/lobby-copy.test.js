// Lobby Games copy: no "Play money only" footnote on the slots card, and the Scum tile is titled SCUM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the slots lobby card has no Play money only footnote', () => {
  const home = read('client/src/Home.jsx');
  const promo = home.slice(home.indexOf('function SlotsPromo'), home.indexOf('function HouseRules'));
  assert.equal(promo.includes('Play money only'), false);
  assert.equal(promo.includes('sp-note'), false);
  assert.match(promo, /Play the slots/);
});

test('user-facing Scum copy is SCUM, not Async Scum', () => {
  const card = read('client/src/scum/ScumCard.jsx');
  const page = read('client/src/scum/ScumPage.jsx');
  const slack = read('server/slack.js');
  const report = read('server/admin/report.js');
  const admin = read('client/src/admin/AdminPage.jsx');
  const svc = read('server/scum/index.js');
  assert.match(card, /<span className="western">SCUM<\/span>/);
  assert.match(card, /<b className="western">SCUM<\/b>/);
  assert.doesNotMatch(card.replace(/^\/\/.*$/m, ''), /Async Scum/);
  assert.match(page, /document\.title = "SCUM · Buffalo Bill's Academy"/);
  assert.match(page, /<h1 className="western">SCUM<\/h1>/);
  assert.match(page, /<h2 className="western">SCUM<\/h2>/);
  assert.match(page, /\$\{v\.name\} · SCUM/);
  assert.match(slack, /at SCUM \$\{f\.table\}/);
  assert.match(slack, /at SCUM \*\$\{esc\(f\.table\)\}\*/);
  assert.match(report, /scum: 'SCUM'/);
  assert.match(admin, /scum: 'SCUM'/);
  assert.match(svc, /`SCUM: \$\{note\} \(\$\{where\}\)`/);
  for (const [name, src] of [['card', card], ['page', page], ['slack', slack], ['report', report], ['admin', admin], ['svc', svc]]) {
    const visible = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !l.trim().startsWith('*')).join('\n');
    if (name === 'slack' || name === 'page' || name === 'card' || name === 'svc') {
      // comments may still say Async Scum; user-facing string literals must not
      assert.equal((visible.match(/['"`][^'"`]*Async Scum[^'"`]*['"`]/g) || []).length, 0, name);
    } else {
      assert.equal(src.includes('Async Scum'), false, name);
    }
  }
});
