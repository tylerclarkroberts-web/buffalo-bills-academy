// Admin/dev mine preview: a deterministic lit-tunnel and battle harness, not a real shift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { MINE_PREVIEW_PATH, MINE_PREVIEW_LABEL, MINE_PREVIEW_API, SHOTS, previewBout, flourishOf } from '../client/src/mines/minePreview.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('the mine preview is labeled and bookmarked at /admin/mine-preview', () => {
  assert.equal(MINE_PREVIEW_PATH, '/admin/mine-preview');
  assert.equal(MINE_PREVIEW_API, '/admin/mine-preview');
  assert.equal(MINE_PREVIEW_LABEL, 'Preview: not a real shift');
  const app = read('client/src/App.jsx');
  assert.match(app, /\/admin\/mine-preview/);
  assert.match(app, /MinePreview/);
  const admin = read('client/src/admin/AdminPage.jsx');
  assert.match(admin, /Preview legends/);
  assert.match(admin, /data-test="bo-preview-mines"/);
  const server = read('server/app.js');
  assert.match(server, /api\.get\('\/admin\/mine-preview'/);
});

test('preview shots cover the stick insect on a wall and ceiling, the intro, the level-30 battle, and STEEZE', () => {
  for (const s of ['stick-wall', 'stick-ceiling', 'stick-intro', 'stick-battle', 'steeze-tunnel', 'steeze-battle', 'steeze-golf', 'steeze-chicken', 'steeze-calves', 'steeze-wealth']) {
    assert.ok(SHOTS.includes(s), s);
  }
  assert.equal(flourishOf('steeze-golf'), 'golf');
  assert.equal(flourishOf('steeze-chicken'), 'chicken');
  assert.equal(flourishOf('steeze-calves'), 'calves');
  assert.equal(flourishOf('steeze-wealth'), 'wealth');
});

test('the preview battle names the stick insect at level 30 and STEEZE as STEEZE', () => {
  const stick = previewBout('stick');
  assert.equal(stick.preview, true);
  assert.equal(stick.live, true);
  assert.equal(stick.them.species, 'dryococelus');
  assert.equal(stick.them.name, 'Lord Howe Island Stick Insect');
  assert.equal(stick.them.level, 30);
  assert.equal(stick.maxHp[1], 245);
  const steeze = previewBout('steeze');
  assert.equal(steeze.them.species, 'steeze');
  assert.equal(steeze.them.name, 'STEEZE');
  assert.equal(steeze.them.level, 5);
});
