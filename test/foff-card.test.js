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
  assert.match(home, /<div className="lb-games"><BlackjackCard \/><SlotsCard \/><FoffCard \/><ScumCard \/><\/div>/);
  assert.match(home, /<div className="promo-pair" data-test="lobby-games"><BlackjackPromo \/><SlotsPromo \/><FoffPromo \/><ScumPromo \/><\/div>/);
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
