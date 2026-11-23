// SPA navigation into Blackjack must not require a full refresh.
// The phone Games tab (where "Play blackjack" lives) used to crash the whole
// app because the Foff promo read an undefined `title`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('phone Games tab mounts FoffPromo and a Play blackjack button that SPA-navigates to /bj', () => {
  const home = read('client/src/Home.jsx');
  const games = home.slice(home.indexOf("tabKey === 'games'"), home.indexOf("tabKey === 'games'") + 500);
  assert.match(games, /<FoffPromo \/>/);
  assert.match(home, /data-test="bj-go"/);
  assert.match(home, /navigate\('\/bj'\)/);
  const app = read('client/src/App.jsx');
  assert.match(app, /path === '\/bj' \|\| path\.startsWith\('\/bj\/'\)/);
  assert.match(app, /export function navigate/);
});

test('Foff promo children never read a free-standing title identifier', () => {
  const jsx = read('client/src/foff/FoffCard.jsx');
  for (const [name, start, end] of [
    ['WatchPromo', 'function WatchPromo', 'function UnlockedPromo'],
    ['UnlockedPromo', 'function UnlockedPromo', 'function FoffArt'],
    ['FilmModal', 'function FilmModal', 'export function FilmPlayer'],
  ]) {
    const slice = jsx.slice(jsx.indexOf(start), jsx.indexOf(end));
    assert.ok(slice.includes('title'), `${name} still uses the title`);
    assert.match(slice, new RegExp(`function ${name}\\([^)]*\\btitle\\b`));
  }
});
