// Public chrome never carries a custom table or room name: tab titles, share text,
// Open Graph / Twitter titles, and invite URLs use the game plus its code or id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import {
  ACADEMY, labelForPath, publicTitle, holdemShareText, holdemNotifyTitle, applyHtmlMeta,
} from '../server/pageMeta.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const SHELL = `<!doctype html><html><head>
<title>Buffalo Bill's Academy · Texas Hold'em with friends</title>
<meta property="og:title" content="Buffalo Bill's Academy · Texas Hold'em with friends" />
<meta name="twitter:title" content="Buffalo Bill's Academy · Texas Hold'em with friends" />
</head><body></body></html>`;

test('labels and titles use the game and code, never a custom name', () => {
  assert.equal(labelForPath('/t/abc123'), "Hold'em table ABC123");
  assert.equal(labelForPath('/scum/Zy9k2p'), 'SCUM table ZY9K2P');
  assert.equal(labelForPath('/bj/QWERTY'), 'Blackjack table QWERTY');
  assert.equal(labelForPath('/scum'), 'SCUM');
  assert.equal(labelForPath('/bj/'), 'Blackjack');
  assert.equal(labelForPath('/room'), 'My House');
  assert.equal(labelForPath('/rooms/player-id-9'), 'My House');
  assert.equal(labelForPath('/elhalo'), null);
  assert.equal(labelForPath('/t/abc123?name=Crude%20Name'), "Hold'em table ABC123");
  assert.equal(publicTitle("Hold'em table ABC123"), "Hold'em table ABC123 · Buffalo Bill's Academy");
  assert.equal(publicTitle('SCUM', { myTurn: true }), "● Your turn · SCUM · Buffalo Bill's Academy");
  assert.equal(publicTitle("Hold'em table ABC123", { myTurn: true, blink: true }), "○ Hold'em table ABC123 · Buffalo Bill's Academy");
  const share = holdemShareText('ABC123', 'https://buffalobillsacademy.com/t/ABC123');
  assert.match(share, /Hold'em table ABC123/);
  assert.match(share, /\/t\/ABC123/);
  assert.doesNotMatch(share, /Crude|Fart Kitchen/i);
  assert.equal(holdemNotifyTitle('ABC123'), "Your turn at Hold'em table ABC123");
  assert.equal(ACADEMY, "Buffalo Bill's Academy");
});

test('HTML meta rewrites stay neutral and leave unknown routes alone', () => {
  const holdem = applyHtmlMeta(SHELL, '/t/ABC123');
  assert.match(holdem, /<title>Hold'em table ABC123 · Buffalo Bill's Academy<\/title>/);
  assert.match(holdem, /property="og:title" content="Hold'em table ABC123 · Buffalo Bill's Academy"/);
  assert.match(holdem, /name="twitter:title" content="Hold'em table ABC123 · Buffalo Bill's Academy"/);
  assert.doesNotMatch(holdem, /Crude|Fart Kitchen/i);
  const scum = applyHtmlMeta(SHELL, '/scum/ZZ99');
  assert.match(scum, /<title>SCUM table ZZ99 · Buffalo Bill's Academy<\/title>/);
  const house = applyHtmlMeta(SHELL, '/rooms/some-player');
  assert.match(house, /<title>My House · Buffalo Bill's Academy<\/title>/);
  assert.equal(applyHtmlMeta(SHELL, '/elhalo'), SHELL);
  assert.equal(applyHtmlMeta(SHELL, '/'), SHELL);
});

test('the Hold\'em table page and lobby share never put the custom name in the tab, share text, or notification', () => {
  const page = read('client/src/TablePage.jsx');
  const home = read('client/src/Home.jsx');
  assert.match(page, /publicTitle\(label/);
  assert.match(page, /holdemShareText\(code, inviteUrl\)/);
  assert.match(page, /holdemNotifyTitle\(code\)/);
  assert.doesNotMatch(page, /document\.title[^\n]*view\.name/);
  assert.doesNotMatch(page, /Your turn at ' \+ view\.name/);
  assert.doesNotMatch(page, /Pull up a chair at "\$\{view/);
  assert.match(page, /<h1 className="display">\{view\.name\}<\/h1>/);
  assert.match(page, /inviteUrl = `\$\{window\.location\.origin\}\/t\/\$\{code\}`/);
  assert.match(home, /holdemShareText\(t\.code, url\)/);
  assert.doesNotMatch(home, /Pull up a chair at "\$\{t\.name\}"/);
  assert.match(home, /origin\}\/t\/\$\{t\.code\}/);
});

test('SCUM, blackjack, and My House tab titles are neutral; custom names stay in the page', () => {
  const scum = read('client/src/scum/ScumPage.jsx');
  const bj = read('client/src/bj/BlackjackPage.jsx');
  const room = read('client/src/room/Room.jsx');
  assert.match(scum, /publicTitle\('SCUM'\)/);
  assert.match(scum, /SCUM table \$\{v\.code\}/);
  assert.doesNotMatch(scum, /document\.title[^\n]*v\.name/);
  assert.match(bj, /publicTitle\(code \? `Blackjack table \$\{code\}` : 'Blackjack'\)/);
  assert.match(bj, /<h1 className="western" title=\{v\.name\}>\{v\.name\}<\/h1>/);
  assert.match(room, /publicTitle\('My House'\)/);
  assert.doesNotMatch(room, /document\.title[^\n]*owner\.name/);
  assert.match(room, /\$\{room\.owner\.name\}’s house/);
  assert.match(room, /origin\}\/rooms\/\$\{room\.owner\.id\}/);
});

test('the production shell serves neutral titles and OG tags for invite URLs', { timeout: 15000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-meta-'));
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-meta-static-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), SHELL);
  t.after(() => { fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(staticDir, { recursive: true, force: true }); });
  const { app, service } = createApp({ dataDir, staticDir, devLogin: false });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(async () => { service.shutdown(); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); });
  const origin = `http://127.0.0.1:${server.address().port}`;

  const holdem = await fetch(`${origin}/t/ABC123`);
  assert.equal(holdem.status, 200);
  const holdemHtml = await holdem.text();
  assert.match(holdemHtml, /<title>Hold'em table ABC123 · Buffalo Bill's Academy<\/title>/);
  assert.match(holdemHtml, /property="og:title" content="Hold'em table ABC123 · Buffalo Bill's Academy"/);
  assert.match(holdemHtml, /name="twitter:title" content="Hold'em table ABC123 · Buffalo Bill's Academy"/);
  assert.doesNotMatch(holdemHtml, /Crude|Fart Kitchen|Guntrad/i);

  const scum = await fetch(`${origin}/scum/ZZ99`);
  assert.match(await scum.text(), /<title>SCUM table ZZ99 · Buffalo Bill's Academy<\/title>/);

  const bj = await fetch(`${origin}/bj/QWERTY`);
  assert.match(await bj.text(), /<title>Blackjack table QWERTY · Buffalo Bill's Academy<\/title>/);

  const house = await fetch(`${origin}/rooms/someone-rude`);
  assert.match(await house.text(), /<title>My House · Buffalo Bill's Academy<\/title>/);
  assert.doesNotMatch(await fetch(`${origin}/rooms/someone-rude`).then((r) => r.text()), /someone-rude/);

  const home = await fetch(`${origin}/`);
  const homeHtml = await home.text();
  assert.match(homeHtml, /<title>Buffalo Bill's Academy · Texas Hold'em with friends<\/title>/);
  assert.doesNotMatch(homeHtml, /Hold'em table/);
});
