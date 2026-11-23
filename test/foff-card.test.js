// The lobby Foff tile must share blackjack/slots card chrome after the film, and the film gate must stay in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsx = fs.readFileSync(path.join(root, 'client/src/foff/FoffCard.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'client/src/foff/foff-card.css'), 'utf8');
const home = fs.readFileSync(path.join(root, 'client/src/Home.jsx'), 'utf8');

test('unlocked Foff lobby tile uses the same card chrome and CTA as blackjack and slots', () => {
  assert.match(home, /<div className="lb-games"><BlackjackCard \/><SlotsCard \/><FoffCard \/><ScumCard \/><ElHaloCard \/><\/div>/);
  assert.match(home, /<div className="promo-pair" data-test="lobby-games"><BlackjackPromo \/><SlotsPromo \/><FoffPromo \/><ScumPromo \/><ElHaloPromo \/><\/div>/);
  assert.match(jsx, /className="panel lb-card lb-slots lb-foff"/);
  assert.match(jsx, /className=\{`slots-promo foff-promo /);
  assert.match(jsx, /Go on the trip/);
  assert.match(jsx, /data-test="foff-go"/);
  assert.match(jsx, /navigate\('\/foff'\)/);
  assert.match(jsx, /className="ph-sub">\{on \? 'The trip' : 'A short film'\}/);
  assert.equal(jsx.includes('lb-foff-open'), false);
  assert.equal(css.includes('lb-foff-open'), false);
  assert.equal(css.includes('.foff-tile'), false);
});

test('the film still has to play to the end before the trip opens; there is no skip', () => {
  assert.match(jsx, /Watch the film/);
  assert.match(jsx, /data-test="foff-watch"/);
  assert.match(jsx, /data-test="foff-thumb"/);
  assert.match(jsx, /function FilmModal/);
  assert.match(jsx, /export function FilmPlayer/);
  assert.match(jsx, /watchedEnough/);
  assert.match(jsx, /playedEnough/);
  assert.match(jsx, /POST', '\/foff\/watching'/);
  assert.match(jsx, /POST', '\/foff\/watched'/);
  assert.equal(/\bskip\b/i.test(jsx) && /I've watched it/i.test(jsx), false);
  assert.doesNotMatch(jsx, /I've watched it/);
});

test('phone Games-tab Foff promo and the film modal receive the game title as a prop', () => {
  // A missing title on the promo layout (bare=false) used to throw `title is not defined`
  // and blank the whole iPhone lobby, so Play blackjack was unreachable until a refresh
  // of a different route.
  const watch = jsx.slice(jsx.indexOf('function WatchPromo'), jsx.indexOf('function UnlockedPromo'));
  const unlocked = jsx.slice(jsx.indexOf('function UnlockedPromo'), jsx.indexOf('function FoffArt'));
  const modal = jsx.slice(jsx.indexOf('function FilmModal'), jsx.indexOf('export function FilmPlayer'));
  assert.match(watch, /function WatchPromo\(\{ bare, onWatch, title \}\)/);
  assert.match(unlocked, /function UnlockedPromo\(\{ bare, reveal, title \}\)/);
  assert.match(modal, /function FilmModal\(\{ title, onClose, onWatched \}\)/);
  assert.match(jsx, /<WatchPromo bare=\{bare\} onWatch=\{[^}]+\} title=\{title\} \/>/);
  assert.match(jsx, /<UnlockedPromo bare=\{bare\} reveal=\{reveal\} title=\{title\} \/>/);
  assert.match(jsx, /<FilmModal title=\{title\} onClose=/);
  assert.match(watch, /\{title\}/);
  assert.match(unlocked, /\{title\}/);
  assert.match(modal, /\{title\}/);
});
