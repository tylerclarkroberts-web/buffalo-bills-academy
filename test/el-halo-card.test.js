// The lobby El Halo tile sits under SCUM, uses the swappable thumb, and opens /elhalo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('El Halo sits directly under SCUM on the lobby and on the Games tab', () => {
  const home = read('client/src/Home.jsx');
  assert.match(home, /import \{ ElHaloCard, ElHaloPromo \} from '\.\/mines\/elhalo\/ElHaloCard\.jsx'/);
  assert.match(home, /<ScumCard \/><ElHaloCard \/>/);
  assert.match(home, /<ScumPromo \/><ElHaloPromo \/>/);
  const card = read('client/src/mines/elhalo/ElHaloCard.jsx');
  assert.match(card, /className="panel lb-card lb-slots lb-elhalo"/);
  assert.match(card, /data-test="elhalo-card"/);
  assert.match(card, /data-test="elhalo-go"/);
  assert.match(card, /Co-op horde/);
  assert.match(card, /Play El Halo/);
  assert.match(card, /navigate\('\/elhalo'\)/);
});

test('the El Halo blurb is exactly the line Tyler asked for', () => {
  const card = read('client/src/mines/elhalo/ElHaloCard.jsx');
  assert.match(card, /export const EL_HALO_BLURB = 'Donde esta la freaking buffadora'/);
  assert.match(card, /\{EL_HALO_BLURB\}/);
  assert.doesNotMatch(card, /useModes|FAMILY_GAME|modes\/family/);
  assert.equal((card.match(/Donde esta la freaking buffadora/g) || []).length, 1);
});

test('the thumbnail slot is a swappable public file (webp, with png fallback)', () => {
  const card = read('client/src/mines/elhalo/ElHaloCard.jsx');
  assert.match(card, /\/elhalo\/thumb\.webp/);
  assert.match(card, /\/elhalo\/thumb\.png/);
  const webp = path.join(root, 'client/public/elhalo/thumb.webp');
  assert.equal(fs.existsSync(webp), true, 'client/public/elhalo/thumb.webp is present');
  assert.ok(fs.statSync(webp).size > 1000, 'thumb.webp is a real image');
  assert.ok(fs.statSync(webp).size < 80_000, 'thumb.webp stays small so it is easy to swap');
});

test('App opens /elhalo as its own lazily loaded page, outside the hall', () => {
  const app = read('client/src/App.jsx');
  assert.match(app, /lazy\(\(\) => import\('\.\/mines\/elhalo\/ElHaloPage\.jsx'\)\)/);
  assert.match(app, /path === '\/elhalo'/);
  assert.doesNotMatch(app, /^import .*elhalo/m, 'no static import of the game');
  const page = read('client/src/mines/elhalo/ElHaloPage.jsx');
  assert.match(page, /navigate\('\/'\)/);
  assert.match(page, /BACK TO THE LOBBY/);
  const room = read('client/src/mines/elhalo/ElHaloRoom.jsx');
  assert.match(room, /exitLabel = '◄ BACK TO THE HALL'/);
  assert.match(room, /showShift = true/);
});

test('Work Mode and the Family rail stay off El Halo, and the room marks itself active', () => {
  const shell = read('client/src/modes/WorkShell.jsx');
  assert.match(shell, /useElHaloImmersive/);
  assert.match(shell, /if \(elhalo\) return children/);
  const modes = read('client/src/modes/Modes.jsx');
  assert.match(modes, /if \(elhalo\) return null/);
  const room = read('client/src/mines/elhalo/ElHaloRoom.jsx');
  assert.match(room, /setElHaloActive\(true\)/);
  assert.match(room, /setElHaloActive\(false\)/);
  const css = read('client/src/modes/modes.css');
  assert.match(css, /html\.elh-active \.mode-rail/);
});
