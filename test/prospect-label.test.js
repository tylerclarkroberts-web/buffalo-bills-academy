// The compact header dropdown (Risk bets, Acid Mines, Barn, General Store) is labelled Prospect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = fs.readFileSync(path.join(root, 'client/src/Shell.jsx'), 'utf8');
const menu = shell.slice(shell.indexOf('function GamesMenu'), shell.indexOf('export function Shell'));

test('the compact nav dropdown is labelled Prospect, not Games', () => {
  assert.match(menu, /Prospect\{me\?\.barnChallenges/);
  assert.match(menu, /aria-label="Prospect"/);
  assert.doesNotMatch(menu, /aria-label="Games"/);
  assert.doesNotMatch(menu, /Games\{me\?/);
  assert.match(menu, /Risk bets/);
  assert.match(menu, /Acid Mines/);
  assert.match(menu, />Barn/);
  assert.match(menu, /General Store/);
});
