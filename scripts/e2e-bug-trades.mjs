// The trading post on a phone: compose a bug-for-bug offer with cash, a rival's cash offer for the same bug, the
// owner's inbox, accepting one (the other is called off and refunded), the history, and the lore on the Bugdex.
// Fails on any page error, a money mismatch, or a phone layout that scrolls.
//   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-bug-trades.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4260 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-trades-'));
const ENV = { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BARN_TEST_EGG: '1', BARN_INCUBATE_MS: '1500', BARN_TEST_SPECIES: '1', BARN_TEST_XP: '400' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let srv;
const boot = async () => { srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'ignore', 'inherit'] }); for (let i = 0; i < 80; i++) { try { if ((await fetch(B + '/api/health')).status < 500) return; } catch { /* starting */ } await wait(150); } };
const halt = async () => { srv.kill(); await new Promise((r) => srv.once('exit', r)); };
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const PHONE = { w: 390, h: 844, m: true }, SMALL = { w: 375, h: 667, m: true }, DESK = { w: 1280, h: 800 };
async function login(name) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name.toLowerCase()}@trade.test` }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, u, b) => { const x = await fetch(B + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); return x.json(); };
  const me = await call('GET', '/me');
  await call('POST', '/me/avatar', { kind: 'gen', seed: name });
  return { name, id: me.id, sid: cookie.split('=')[1], post: (u, b) => call('POST', u, b || {}), get: (u) => call('GET', u) };
}
async function egg(me) { const s = await me.post('/mines/start', { rulesVersion: 2 }); await me.post('/mines/egg', { shiftId: s.shiftId }); await me.post('/mines/quit', { shiftId: s.shiftId }); }
async function page(browser, me, vp, url) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1 });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') p.errs.push('console: ' + m.text()); });
  await p.goto(B + url); return p;
}
const scrolls = (p) => p.evaluate(() => document.scrollingElement.scrollHeight > window.innerHeight + 1);
let browser;
try {
  await boot();
  const H = await login('Hank'), G = await login('Gus'), O = await login('Opal');
  for (const who of [H, G, O]) await egg(who);
  await wait(1800);
  for (const [who, sp] of [[H, 'manticora'], [G, 'phanaeus'], [O, 'pyrops']]) { await who.get('/barn'); await who.post('/dev/species', { id: sp }); }
  // more bugs per barn, written straight into the data file while the server is down (some Stage II for variety)
  await halt();
  const file = path.join(dir, 'barn.json'), doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const extra = { [H.id]: [['lamprima', 1], ['empusa', 0]], [G.id]: [['macrodontia', 1], ['umbonia', 0]], [O.id]: [['photuris', 0]] };
  for (const [pid, list] of Object.entries(extra)) {
    const base = doc.pens[pid];
    doc.bench[pid] = list.map(([species, evo], i) => { const at = base.bornAt + 1000 * (i + 1); const { variety: _v, ...rest } = structuredClone(base); return { ...rest, species, name: `${species[0].toUpperCase()}${species.slice(1)} ${['I', 'II'][i]}`, eggAt: at, bornAt: at, benchedAt: Date.now(), ...(evo ? { evo, evolvedAt: Date.now() } : {}) }; });
  }
  fs.writeFileSync(file, JSON.stringify(doc));
  await boot();
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const hankBugs = (await G.get('/barn/trades')).players.find((p) => p.id === H.id).bugs;
  if (process.env.KEEP) console.log(JSON.stringify(hankBugs.map((b) => [b.name, b.species, b.why])));
  check(hankBugs.length === 3, `Gus sees Hank's 3 bugs (${hankBugs.length})`);

  // 1. Gus composes: one of Hank's for one of his, plus $150
  const g = await page(browser, G, PHONE, '/barn?room=trade');
  await g.waitForSelector('[data-test=trades] [data-test=trade-pane-new]', { timeout: 8000 });
  await g.click('[data-test=trade-pane-new]');
  await g.selectOption('[data-test=trade-with]', H.id);
  const groups = await g.$$('.tr-pick');
  await (await groups[0].$$('[data-test=trade-chip]'))[1].click();
  await (await groups[1].$$('[data-test=trade-chip]'))[1].click();
  await g.fill('[data-test=trade-money]', '150'); await wait(600);
  check(!(await scrolls(g)), 'phone: the composer fits without scrolling');
  await shot(g, '01-compose-phone');
  await g.click('[data-test=trade-send]');
  await g.waitForSelector('[data-test=trade-outgoing]', { timeout: 8000 }); await wait(400);
  check(/held/.test(await g.textContent('[data-test=trade-msg]')), 'Gus is told the cash is held');
  await shot(g, '02-sent-phone');
  const gBank = (await G.get('/me')).bankroll;
  check(gBank === 850, `Gus's bankroll dropped by the $150 held (${gBank})`);
  await g.context().close();

  // 2. Opal bids cash for the same bug
  const target = hankBugs[1];
  const op = await O.post('/barn/trades', { to: H.id, want: [target.id], money: 400 });
  check(op.held === 400, 'Opal\'s $400 is held');

  // 3. Hank's inbox: two offers, the Trade button counts them
  const h = await page(browser, H, PHONE, '/barn');
  await h.waitForSelector('[data-test=room-trade]', { timeout: 8000 });
  check(/Trade · 2/.test(await h.textContent('[data-test=room-trade]')), 'the Trade room button shows 2');
  await shot(h, '03-barn-trade-badge-phone');
  await h.click('[data-test=room-trade]');
  await h.waitForSelector('[data-test=trade-incoming]', { timeout: 8000 }); await wait(500);
  check((await h.$$('[data-test=trade-incoming]')).length === 2, 'Hank sees both offers');
  check(!(await scrolls(h)), 'phone: the inbox fits without scrolling');
  await shot(h, '04-inbox-phone');
  // accept Gus's (the bug-for-bug one)
  const rows = await h.$$('[data-test=trade-incoming]');
  let gusRow = null; for (const r of rows) if (/Gus/.test(await r.textContent())) gusRow = r;
  await (await gusRow.$('[data-test=trade-accept]')).click();
  await h.waitForSelector('[data-test=trade-msg]', { timeout: 8000 }); await wait(500);
  await shot(h, '05-accepted-phone');
  const [hb, gb, ob] = [(await H.get('/me')).bankroll, (await G.get('/me')).bankroll, (await O.get('/me')).bankroll];
  check(hb === 1150 && gb === 850 && ob === 1000, `money: Hank +150, Gus -150, Opal refunded (${hb}, ${gb}, ${ob})`);
  check(h.errs.length === 0, `Hank's page has no errors (${h.errs.join(' | ') || 'none'})`);
  await h.click('[data-test=trade-pane-history]'); await wait(300);
  await shot(h, '06-history-phone');
  await h.context().close();

  // 4. Gus sees it went through; his new bug is in his stalls
  const g2 = await page(browser, G, SMALL, '/barn?room=trade');
  await g2.waitForSelector('[data-test=trades]', { timeout: 8000 }); await g2.click('[data-test=trade-pane-history]'); await wait(500);
  check(!(await scrolls(g2)), 'small phone: history fits without scrolling');
  await shot(g2, '07-history-small-phone');
  await g2.goto(B + '/barn'); await g2.waitForSelector('[data-test=barn-stalls]', { timeout: 8000 }); await wait(600);
  await shot(g2, '08-gus-stalls-after-small-phone');
  await g2.context().close();

  // 5. Lore on the Bugdex, and the trading post on desktop
  const d = await page(browser, O, PHONE, '/barn?room=dex');
  await d.waitForSelector('[data-test=dex-lore]', { timeout: 8000 }); await wait(400);
  check((await d.textContent('[data-test=dex-lore]')).length > 10, 'the Bugdex carries a lore line');
  await shot(d, '09-bugdex-lore-phone');
  await d.context().close();
  const k = await page(browser, O, DESK, '/barn?room=trade');
  await k.waitForSelector('[data-test=trades]', { timeout: 8000 }); await k.click('[data-test=trade-pane-history]'); await wait(500);
  await shot(k, '10-history-desktop');
  check(k.errs.length === 0, `desktop: no errors (${k.errs.join(' | ') || 'none'})`);
  await k.context().close();
} catch (e) { fails.push(e.stack || e.message); console.error(e); }
finally { if (process.env.KEEP) console.log('data', dir); await browser?.close(); srv?.kill(); if (!process.env.KEEP) fs.rmSync(dir, { recursive: true, force: true }); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok');
process.exit(fails.length ? 1 : 0);
