// Royal Match vs Tip-the-dealer layout stills. Player-dealer table so both
// Kash/Royal Match sneak and Tip appear, plus a betting-phase still.
// TAG=before|after OUT=/workspace/bba-t451-shots/royal/$TAG
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'node:module';
import { freshDeck } from '../server/blackjack/rules.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium, webkit, devices } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TAG = process.env.TAG || 'after';
const OUT = process.env.OUT || path.resolve('/workspace/bba-t451-shots/royal', TAG);
const PORT = 4290 + Math.floor(Math.random() * 8);
const B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-royal-'));
const srv = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SHOP_TEST_CASH: '1', SLACK_BOT_TOKEN: '', BJ_TICK_MS: '0' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rig = (p1, up, p2, hole, extra = []) => {
  const used = new Set([p1, up, p2, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, p2, up, p1];
};

async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { name, cookie, sid: cookie.split('=')[1] };
}
async function api(me, method, path, body) {
  const r = await fetch(B + '/api' + path, { method, headers: { 'content-type': 'application/json', cookie: me.cookie }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${text}`);
  return data;
}
async function skipGate(p) {
  const skip = p.getByRole('button', { name: 'Skip for now' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 5000 });
    await skip.click();
    await p.waitForURL((u) => !String(u).includes('/welcome'), { timeout: 8000 });
  } catch { /* past it */ }
}
async function shooFaun(p) {
  try {
    const no = p.locator('[data-test=fawn-no]');
    await no.waitFor({ state: 'visible', timeout: 1500 });
    await no.click({ force: true });
  } catch { /* none */ }
}
function overlap(a, b) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}
async function boxOf(p, sel) {
  const loc = p.locator(sel).first();
  if (!(await loc.count())) return null;
  const h = await loc.isVisible().catch(() => false);
  if (!h) return null;
  return loc.boundingBox();
}
async function inViewport(p, sel) {
  return p.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const w = window.innerWidth, h = window.innerHeight;
    return r.width >= 24 && r.height >= 24 && r.left >= -1 && r.top >= -1 && r.right <= w + 1 && r.bottom <= h + 1;
  }).catch(() => false);
}

async function open(browser, me, vp, url) {
  const ctx = await browser.newContext({
    ...vp,
    reducedMotion: 'reduce',
  });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript(() => {
    const s = document.createElement('style');
    s.textContent = '[data-test="fawn"], .fn, [data-test=bj-guntrad], img[src*="dealer.png"] { display: none !important; pointer-events: none !important; }';
    document.documentElement.appendChild(s);
  });
  const p = await ctx.newPage();
  await p.goto(url);
  await skipGate(p);
  await shooFaun(p);
  return { ctx, p };
}

async function assertSideBets(p, label, hitSel) {
  const match = await boxOf(p, '[data-test=bj-kash-match], [data-test=bj-side-match]');
  const tips = await boxOf(p, '[data-test=bj-tips]');
  const chat = await boxOf(p, '[data-test=bj-chat]');
  const hit = hitSel ? await boxOf(p, hitSel) : null;
  const visible = await inViewport(p, '[data-test=bj-kash-match], [data-test=bj-side-match]');
  check(!!match, `${label}: Royal Match / Kash Match control is present`);
  check(visible, `${label}: Royal Match is fully in the viewport`);
  if (match && tips) check(overlap(match, tips) < 8, `${label}: Tip does not cover Royal Match (overlap ${match && tips ? overlap(match, tips).toFixed(0) : 0}px)`);
  if (match && chat) check(overlap(match, chat) < 8, `${label}: chat does not cover Royal Match`);
  if (match && hit) check(overlap(match, hit) < 8, `${label}: Royal Match does not cover Hit/Stand`);
  const scroll = await p.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 2 || document.body.scrollHeight > window.innerHeight + 2);
  // The felt page itself may be a fixed screen; check the screen container instead.
  const screenScroll = await p.evaluate(() => {
    const s = document.querySelector('.screen') || document.querySelector('.bj-t') || document.body;
    return s.scrollHeight > s.clientHeight + 8;
  });
  check(!screenScroll, `${label}: no scrolling required to reach the bar`);
  if (await p.locator('[data-test=bj-kash-match]').count()) {
    const h = await p.locator('[data-test=bj-kash-match]').first().evaluate((el) => el.getBoundingClientRect().height);
    check(h >= 32, `${label}: Kash/Match target is at least 32px tall (${h})`);
  }

  if (label.includes('play') && await p.locator('[data-test=bj-kash-pairs]').count()) {
    const pairs = await boxOf(p, '[data-test=bj-kash-pairs]');
    const tips = await boxOf(p, '[data-test=bj-tips]');
    check(!!pairs && await inViewport(p, '[data-test=bj-kash-pairs]'), `${label}: Royal Pairs is fully in the viewport`);
    if (pairs && tips) check(overlap(pairs, tips) < 8, `${label}: Tip does not cover Royal Pairs`);
  }
  if (label.includes('play')) {
    const txt = await p.locator('[data-test=bj-kash-match]').first().innerText().catch(() => '');
    // After the fix the button is labeled Royal Match; before it only said Kash.
    if (process.env.TAG !== 'before') check(/Royal Match/i.test(txt), `${label}: button is labeled Royal Match (got ${JSON.stringify(txt)})`);
  }
}

let browsers = [];
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const house = await login('Sam', 'sam@royal.test');
  const ann = await login('Ann', 'ann@royal.test');
  await api(ann, 'POST', '/dev/cash', { to: 5000 });
  await api(house, 'POST', '/dev/cash', { to: 5000 });
  const openTable = async () => {
    const table = await api(house, 'POST', '/bj/tables', {
      name: "Sam's pit",
      settings: { house: 'me', buyIn: 200, houseBank: 800, minBet: 5, maxBetX: 20, bots: 0, continuous: false, turnSec: 86400 },
    });
    await api(ann, 'POST', `/bj/tables/${table.code}/join`, { ack: true });
    await api(house, 'POST', `/bj/tables/${table.code}/start`);
    await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rig('Kh', '9c', 'Qh', '8s') });
    return table;
  };

  fs.mkdirSync(OUT, { recursive: true });
  const chrome = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  browsers.push(chrome);
  const wk = await webkit.launch();
  browsers.push(wk);

  const vps = [
    { engine: chrome, name: 'desktop-1280', vp: { viewport: { width: 1280, height: 800 } } },
    { engine: chrome, name: 'desktop-1024', vp: { viewport: { width: 1024, height: 768 } } },
    { engine: wk, name: 'iphone-15', vp: { ...devices['iPhone 15'] } },
    { engine: wk, name: 'iphone-15-landscape', vp: { ...devices['iPhone 15 landscape'] } },
  ];

  for (const v of vps) {
    const table = await openTable();
    const { p } = await open(v.engine, ann, v.vp, `${B}/bj/${table.code}`);
    await p.waitForSelector('[data-test=bj-table]', { timeout: 15000 });
    await shooFaun(p);
    // Betting phase: Royal Match stepper should be visible next to the deal button.
    await p.waitForSelector('[data-test=bj-betting], [data-test=bj-deal]', { timeout: 10000 });
    if (await p.locator('[data-test=bj-side-match-more]').count()) {
      await p.click('[data-test=bj-side-match-more]');
    }
    await wait(200);
    await p.screenshot({ path: path.join(OUT, `${v.name}-betting.png`) });
    const bar = p.locator('[data-test=bj-bar]');
    if (await bar.count()) await bar.screenshot({ path: path.join(OUT, `${v.name}-betting-bar.png`) });
    await assertSideBets(p, `${v.name} betting`, null);

    // Place the main bet only (side already maybe +$1; sneak still available if we leave pairs off and... 
    // sneak requires !b.side[k], so if we added match in betting, sneak match won't show.
    // Reset match to off if we toggled it.
    if (await p.locator('[data-test=bj-side-match-less]').count()) {
      // click less until off if we turned it on
      for (let i = 0; i < 6; i++) {
        const amt = await p.locator('[data-test=bj-side-match-amt]').textContent().catch(() => 'off');
        if (!amt || /off/.test(amt)) break;
        await p.click('[data-test=bj-side-match-less]');
      }
    }
    await p.click('[data-test=bj-deal]');
    await p.waitForSelector('[data-test=bj-kash-match], [data-test=bj-hit]', { timeout: 15000 });
    await wait(300);
    await p.screenshot({ path: path.join(OUT, `${v.name}-play.png`) });
    if (await bar.count()) await bar.screenshot({ path: path.join(OUT, `${v.name}-play-bar.png`) });
    await assertSideBets(p, `${v.name} play`, (await p.locator('[data-test=bj-hit]').count()) ? '[data-test=bj-hit]' : null);
    await p.context().close();
  }
} catch (e) {
  console.error(e);
  fails.push(e.message || String(e));
} finally {
  for (const b of browsers) await b.close();
  srv.kill('SIGTERM');
}

if (fails.length) {
  console.error('ROYAL BAR FAILS', fails);
  process.exit(1);
}
console.log('ROYAL BAR OK', TAG, OUT);
