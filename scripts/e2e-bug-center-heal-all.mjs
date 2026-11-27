// The Bug Center heals everyone at once. A throwaway in-process server (never real data, no Slack): Tyler has four
// bugs, three knocked out (one rested an hour = free, two fresh = $50 each). On a phone the nurse asks once with the
// whole bill on the button, one tap heals all three, the all-healed moment shows every bug, and the ledger has one
// $100 Bug Center line. Then: money short (she offers what it covers), all rested (free), a repeat tap (nothing
// charged), a 375×667 phone and iPhone Safari (WebKit), with no field, no keyboard and no page scroll anywhere.
//   npm run build && PLAYWRIGHT_DIR=... OUT=/workspace/bba-screens-heal-all node scripts/e2e-bug-center-heal-all.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { createApp } from '../server/app.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium, webkit, devices } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const HOUR = 3600e3, MIN = 60e3;
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };

async function seed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-heal-all-'));
  const { app, service, shutdown } = createApp({ dataDir: dir, staticDir: path.join(ROOT, 'dist'), env: { ...process.env, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', EVENT_THEME: 'off' }, marketSources: {}, snapshots: false });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const B = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Tyler', email: 'tyler@heal.test' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0], { id } = await r.json();
  const call = async (m, u, b) => { const x = await fetch(B + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); const j = await x.json().catch(() => ({})); if (!x.ok) throw Object.assign(new Error(`${m} ${u}: ${j.error || x.status}`), { status: x.status }); return j; };
  await call('POST', '/me/avatar', { kind: 'gen', seed: 'Tyler' });
  const barn = service.barn, store = service.store;
  [['manticora', 7], ['phanaeus', 6], ['lamprima', 5], ['pyrops', 5]].forEach(([species, level], i) => barn.adopt(id, { wildId: `w${i}`, battleId: `b${i}`, species, level }));
  await call('GET', '/barn');
  /** Knock out the first three: `ago` minutes since each fainted. */
  const faint = (ago = [120, 10, 5]) => { barn.bugs(id).slice(0, ago.length).forEach((pen, i) => { pen.faintedAt = Date.now() - ago[i] * MIN; pen.faintedIn = 'ring'; pen.faintedBy = 'Bess'; pen.health = 0; }); barn.save(); };
  const fund = (n) => { store.players[id].bankroll = n; store.savePlayers(); };
  const me = () => store.players[id];
  faint(); fund(1000);
  return { B, sid: cookie.split('=')[1], call, faint, fund, me, heals: () => (me().txns || []).filter((t) => t.type === 'barn-heal'), down: () => barn.bugs(id).filter((pen) => pen.faintedAt).length,
    async close() { shutdown(); await new Promise((res) => server.close(res)); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** No field to type in, nothing focused that could raise a keyboard, the page itself never scrolls. */
async function guard(p, what) {
  const g = await p.evaluate(() => ({ fields: document.querySelectorAll('input, textarea, select, [contenteditable=""], [contenteditable=true]').length,
    typing: /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || !!document.activeElement?.isContentEditable,
    y: scrollY, tall: document.documentElement.scrollHeight - innerHeight }));
  check(!g.fields && !g.typing, `${what}: nothing that can open the keyboard`);
  check(g.y === 0 && g.tall <= 1, `${what}: the page does not scroll (scrollY ${g.y}, overflow ${g.tall}px)`);
}
const inView = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return !!r && r.width > 0 && r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; }, sel);
/** Tap through her lines until the priced choices (or the end of what she says). */
async function toChoices(p, tap) {
  await tap('[data-test=bc-talk]');
  for (let i = 0; i < 30; i++) {
    if (await p.$('[data-test=bc-choices]')) return true;
    if (!(await p.$('[data-test=bc-dialogue]'))) return false;
    await tap('[data-test=bc-dialogue] .bc-box'); await p.waitForTimeout(140);
  }
  return false;
}
const openCenter = async (ctx, s) => {
  await ctx.addCookies([{ name: 'bba_sid', value: s.sid, url: s.B }]);
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(s.B + '/barn/center'); await p.waitForSelector('[data-test=bug-center]'); await p.waitForTimeout(400);
  try { await p.evaluate(() => localStorage.setItem('bba.centerSound', '0')); } catch { /* */ }
  return p;
};

let browser, s;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const phoneCtx = (w = 390, h = 844) => browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  // 1. Three down, $1000: one question, $100 on the button, one tap, everyone up, one ledger line.
  s = await seed();
  let ctx = await phoneCtx(), p = await openCenter(ctx, s);
  const tap = (sel) => p.tap(sel);
  await p.click('[data-test=bc-en]'); // the 訳 subtitles, so the screenshots read in English too
  check((await p.textContent('[data-test=bc-status]')).includes('3'), 'the status tag counts all three knocked-out bugs');
  await shot(p, 'heal-all-390-01-arrive'); await guard(p, 'arrive');
  check(await toChoices(p, tap), 'one conversation ends in a single priced question');
  const said = await p.textContent('[data-test=bc-dialogue]');
  const all = await p.textContent('[data-test=bc-heal-all]');
  check(/\$100/.test(all) && /3/.test(all), `the main button says the whole bill up front: "${all.trim()}"`);
  check(!!(await p.$('[data-test=bc-heal-free]')) && !!(await p.$('[data-test=bc-heal-no]')), 'a free-ones-only and a not-now choice are there too');
  check(/\$100 in all/.test(said), `the bill is said in the same line as the buttons: "${said.slice(-90)}"`);
  check(await inView(p, '[data-test=bc-heal-all]') && await inView(p, '[data-test=bc-heal-no]') && await inView(p, '[data-test=bc-back]'), 'the choices and the Barn button fit the phone screen');
  await guard(p, 'the question'); await shot(p, 'heal-all-390-02-the-bill');
  check(s.me().bankroll === 1000 && s.heals().length === 0, 'asking costs nothing');
  await tap('[data-test=bc-heal-all]');
  await p.waitForSelector('[data-test=bc-healing]'); await p.waitForTimeout(900); await shot(p, 'heal-all-390-03-machine');
  await p.waitForSelector('[data-test=bc-cheer]', { timeout: 8000 }); await p.waitForTimeout(1300);
  check((await p.$$('[data-test=bc-cheer-bug]')).length === 3, 'the all-healed moment shows all three bugs together');
  check((await p.textContent('[data-test=bc-cheer]')).includes('All 3 healed') && (await p.textContent('[data-test=bc-cheer-bill]')).includes('$100'), 'it says "All 3 healed!" and the $100 paid');
  check(await inView(p, '[data-test=bc-cheer] .bc-cheer-title') && await inView(p, '[data-test=bc-cheer-bill]'), 'the moment fits the phone screen');
  await guard(p, 'all healed'); await shot(p, 'heal-all-390-04-all-healed');
  check(s.down() === 0, 'nobody is fainted on the server');
  check(s.me().bankroll === 900, `$100 taken once (bankroll ${s.me().bankroll})`);
  const lines = s.heals(); check(lines.length === 1 && lines[0].amount === -100 && /^Bug Center: expedited recovery × 2/.test(lines[0].note), `one ledger line: ${JSON.stringify(lines.map((l) => [l.amount, l.note]))}`);
  await tap('[data-test=bc-cheer]'); await p.waitForTimeout(1200); await tap('[data-test=bc-dialogue] .bc-box'); await p.waitForTimeout(400); await tap('[data-test=bc-dialogue] .bc-box'); await p.waitForTimeout(1200);
  check((await p.textContent('[data-test=bc-dialogue]')).includes('$100'), 'the nurse then says the bill out loud'); await shot(p, 'heal-all-390-05-nurse-after');
  // a repeat (double tap, stale tab) changes nothing
  const again = await s.call('POST', '/barn/heal-all', { pay: [1, 2, 3], total: 100 }).catch((e) => e);
  check(again.cost === 0 && again.healedAll?.length === 0 && s.me().bankroll === 900 && s.heals().length === 1, 'asking again heals nothing and charges nothing');
  check(!p.errs.length, `no page errors ${p.errs.join(' | ')}`);
  await ctx.close();

  // 2. Money short: $60 covers one of the two paid ones; she says so and offers that.
  s.faint(); s.fund(60);
  ctx = await phoneCtx(); p = await openCenter(ctx, s); await p.click('[data-test=bc-en]');
  check(await toChoices(p, (sel) => p.tap(sel)), 'short of money: still one question');
  const shortSaid = await p.textContent('[data-test=bc-dialogue]');
  check(/\$100/.test(shortSaid) && /\$60/.test(shortSaid), 'she says plainly: everyone is $100 and you have $60');
  check(!(await p.$('[data-test=bc-heal-all]')) && /\$50/.test(await p.textContent('[data-test=bc-heal-afford]')), 'no heal-all button; the offer is for what $60 covers ($50)');
  await guard(p, 'short of money'); await shot(p, 'heal-all-390-06-short-of-money');
  await p.tap('[data-test=bc-heal-afford]'); await p.waitForSelector('[data-test=bc-cheer]', { timeout: 8000 }); await p.waitForTimeout(1300);
  check((await p.$$('[data-test=bc-cheer-bug]')).length === 2 && s.down() === 1 && s.me().bankroll === 10, 'two healed (the free one and one paid), one left resting, $50 taken');
  await shot(p, 'heal-all-390-07-healed-what-you-could');
  await ctx.close();

  // 3. All rested: free, and the 375×667 phone.
  s.faint([200, 90, 61]); s.fund(0);
  ctx = await phoneCtx(375, 667); p = await openCenter(ctx, s); await p.click('[data-test=bc-en]');
  check(await toChoices(p, (sel) => p.tap(sel)), 'all rested: one question');
  check(/free/i.test(await p.textContent('[data-test=bc-heal-free]')) && !(await p.$('[data-test=bc-heal-all]')), 'the button says free; no price anywhere');
  check(await inView(p, '[data-test=bc-heal-free]') && await inView(p, '[data-test=bc-heal-no]'), '375×667: the choices fit');
  await guard(p, '375 free'); await shot(p, 'heal-all-375-08-all-free');
  await p.tap('[data-test=bc-heal-free]'); await p.waitForSelector('[data-test=bc-cheer]', { timeout: 8000 }); await p.waitForTimeout(1300);
  check((await p.textContent('[data-test=bc-cheer-bill]')).includes('No charge') && s.down() === 0 && s.me().bankroll === 0 && s.heals().length === 2, 'three healed for free, no new ledger line');
  check(await inView(p, '[data-test=bc-cheer-bill]'), '375×667: the all-healed moment fits'); await guard(p, '375 all healed'); await shot(p, 'heal-all-375-09-all-healed-free');
  await ctx.close();
  await s.close(); s = null;

  // 4. iPhone Safari (WebKit): the whole flow with taps, focus and scroll checked at every step.
  {
    const wk = await webkit.launch();
    s = await seed();
    const wctx = await wk.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
    p = await openCenter(wctx, s);
    await guard(p, 'iphone arrive');
    check(await toChoices(p, (sel) => p.tap(sel)), 'iphone: one priced question');
    await guard(p, 'iphone question');
    await p.tap('[data-test=bc-heal-all]'); await guard(p, 'iphone machine');
    await p.waitForSelector('[data-test=bc-cheer]', { timeout: 8000 }); await p.waitForTimeout(1300);
    await guard(p, 'iphone all healed'); await shot(p, 'heal-all-iphone-10-all-healed');
    check(s.down() === 0 && s.me().bankroll === 900 && s.heals().length === 1, 'iphone: all three up for one $100 line');
    check(!p.errs.length, `iphone: no page errors ${p.errs.join(' | ')}`);
    await wk.close();
  }
} catch (e) { fails.push(e.stack || String(e)); console.error(e); }
finally { await browser?.close(); await s?.close(); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
