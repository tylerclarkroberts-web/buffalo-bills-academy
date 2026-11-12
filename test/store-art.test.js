// Every General Store item has art the client can actually draw (a missing shape renders as nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG } from '../server/catalog/index.js';
import { SHAPES } from '../client/src/avatar/wear.js';
import { PIX_NAMES } from '../client/src/store/pixart.js';

test('every avatar look, pixel icon and bug overlay in the catalog has a drawing', () => {
  for (const x of CATALOG) {
    if (x.look) assert.ok(SHAPES[x.slot]?.[x.look.shape] || (x.slot === 'skin' && x.look.shape === 'solid'), `${x.id}: no ${x.slot} shape ${x.look.shape}`);
    if (x.pix) assert.ok(PIX_NAMES.includes(x.pix), `${x.id}: no pixel icon ${x.pix}`);
  }
  const sprite = readFileSync(new URL('../client/src/barn/sprite.js', import.meta.url), 'utf8');
  for (const x of CATALOG.filter((i) => i.shape)) assert.match(sprite, new RegExp(`\\n  ${x.shape}: \\{ at:`), `${x.id}: no bug overlay ${x.shape}`);
  const css = readFileSync(new URL('../client/src/styles.css', import.meta.url), 'utf8');
  for (const x of CATALOG.filter((i) => i.kind === 'gag')) assert.ok(css.includes(`.fx-${x.effect}`) || ['splash'].includes(x.effect), `${x.id}: no .fx-${x.effect} style`);
  const show = readFileSync(new URL('../client/src/table/Spectacle.jsx', import.meta.url), 'utf8');
  for (const x of CATALOG.filter((i) => i.kind === 'spectacle')) {
    assert.ok(css.includes(`.show-${x.fx}`), `${x.id}: no .show-${x.fx} style`);
    assert.match(show, new RegExp(`\\b${x.fx}: `), `${x.id}: no ${x.fx} overlay in Spectacle.jsx`);
  }
});
