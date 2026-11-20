// Browser check + screenshots for the Hold'em equity bar (win % + made-hand name).
// Boots a throwaway DEV_LOGIN server. Does not deploy.
//   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-holdem-equity.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'os'; import path from 'path';
import { createRequire } from 'node:module';
import { riggedDeck } from '../test/helpers.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4070 + Math.floor(Math.random() * 9);
const B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-equity-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };

async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const sid = r.headers.get('set-cookie').split(';')[0].split('=')[1];
  const cookie = `bba_sid=${sid}`;
  const av = await fetch(B + '/api/me/avatar', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ kind: 'gen', seed: name }) });
  if (!av.ok) throw new Error('avatar ' + av.status + ' ' + await av.text());
  return { sid, cookie, name, email };
}
const call = async (u, m, url, b) => {
  const r = await fetch(B + '/api' + url, { method: m, headers: { 'content-type': 'application/json', cookie: u.cookie }, body: b ? JSON.stringify(b) : undefined });
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error(url + ' ' + r.status + ' ' + text.slice(0, 200)); }
};

const HIDE = '.dealer-spot,.bit-quip,.dl-plate,[data-test=fawn],.fn{visibility:hidden!important;opacity:0!important;pointer-events:none!important}';

async function open(browser, u, url, s) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m });
  await ctx.addCookies([{ name: 'bba_sid', value: u.sid, url: B }]);
  const p = await ctx.newPage(); p.ctx = ctx; p.u = u; p.errs = [];
  p.on('pageerror', (e) => { const m = e.message || String(e); if (m.includes("reading 'appendChild'")) return; p.errs.push(m); });
  await p.addInitScript((cssText) => {
    const css = document.createElement('style');
    css.textContent = cssText;
    document.documentElement.appendChild(css);
  }, HIDE);
  await p.goto(`${B}${url}`, { waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: HIDE });
  const skip = p.locator('button:has-text("Skip for now")');
  if (await skip.count()) { try { await skip.click({ timeout: 800 }); } catch {} }
  return p;
}

async function dismissExtras(p) {
  const sd = p.locator('[data-test=sd-skip]');
  if (await sd.count()) { try { await sd.click({ timeout: 800 }); } catch {} }
  const dec = p.locator('.fo-decline');
  if (await dec.count()) { try { await dec.click({ timeout: 800 }); } catch {} }
  const fawn = p.locator('[data-test=fawn-no]');
  if (await fawn.count()) { try { await fawn.click({ timeout: 800, force: true }); } catch {} }
}

async function waitFor(p, sel, ms = 12000) {
  try { await p.waitForSelector(sel, { timeout: ms }); return true; } catch { return false; }
}

// 3-handed: seat 1, seat 2, host, seat 1, seat 2, host. Host (button) gets As Ah.
const DEAL = riggedDeck(['7c', '8d', 'As', '2d', '3h', 'Ah'], ['Ac', 'Ks', '4d', '9c', '2s']);

async function setupTable(host, joe, ana) {
  const created = await call(host, 'POST', '/tables', { name: 'Equity Night', settings: { buyIn: 200, smallBlind: 5, bigBlind: 10, nextHandDelaySeconds: 60, turnSeconds: 3600 } });
  const code = created.code;
  await call(joe, 'POST', `/tables/${code}/join`);
  await call(ana, 'POST', `/tables/${code}/join`);
  await call(host, 'POST', '/dev/holdem-rig', { code, deck: DEAL });
  await call(host, 'POST', `/tables/${code}/start`);
  return code;
}

try {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(100); } }
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const host = await login('Tyler', 'tyler.equity@example.com');
  const joe = await login('Joe', 'joe.equity@example.com');
  const ana = await login('Ana', 'ana.equity@example.com');
  const code = await setupTable(host, joe, ana);

  const view = await call(host, 'GET', `/tables/${code}`);
  const me = view.seats[view.me.seat];
  check(me?.cards?.join(' ') === 'As Ah', `host is dealt As Ah (${me?.cards})`);
  check(view.seats.filter((s) => s && s.inHand && !s.folded).length === 3, 'three players are in the hand');

  const desk = await open(browser, host, `/t/${code}`, { w: 1280, h: 720, m: false });
  await dismissExtras(desk);
  const barOn = await waitFor(desk, '[data-test=hand-equity]', 15000);
  check(barOn, 'host sees the equity bar preflop');
  const preText = barOn ? (await desk.locator('[data-test=hand-equity]').innerText()).replace(/\s+/g, ' ').trim() : '';
  check(/Win\s+\d+%/.test(preText), `bar shows a win percent (${preText})`);
  const prePct = barOn ? await desk.locator('[data-test=hand-equity-pct]').innerText() : '';
  const preN = parseInt((prePct.match(/(\d+)/) || [])[1], 10);
  check(preN >= 68 && preN <= 80, `AA vs two randoms is about 73% (got ${prePct})`);
  const preMade = barOn ? (await desk.locator('[data-test=hand-made]').innerText()).trim() : '';
  check(preMade === 'Pair of Aces', `preflop made-hand is Pair of Aces (${preMade})`);
  await dismissExtras(desk);
  await shot(desk, 'desktop-preflop-aces');
  const deskScroll = await desk.evaluate(() => document.documentElement.scrollHeight > innerHeight + 2);
  check(!deskScroll, 'desktop table page does not scroll with the bar');

  const phone = await open(browser, host, `/t/${code}`, { w: 390, h: 844, m: true });
  await dismissExtras(phone);
  const phoneBar = await waitFor(phone, '[data-test=hand-equity]', 12000);
  check(phoneBar, 'phone shows the equity bar');
  await dismissExtras(phone);
  await shot(phone, 'phone-preflop-aces');
  const phoneScroll = await phone.evaluate(() => document.documentElement.scrollHeight > innerHeight + 2);
  check(!phoneScroll, 'phone table page does not scroll with the bar');
  const phoneMade = phoneBar ? (await phone.locator('[data-test=hand-made]').innerText()).trim() : '';
  check(phoneMade === 'Pair of Aces', `phone made-hand is Pair of Aces (${phoneMade})`);

  const joePage = await open(browser, joe, `/t/${code}`, { w: 1280, h: 720, m: false });
  await dismissExtras(joePage);
  const joeBar = await waitFor(joePage, '[data-test=hand-equity]', 12000);
  check(joeBar, 'Joe sees his own equity bar');
  const joeMade = joeBar ? (await joePage.locator('[data-test=hand-made]').innerText()).trim() : '';
  check(joeMade === 'High card, 7', `Joe's made-hand is High card, 7 from 7c 2d (${joeMade})`);
  const joeSeesAce = await joePage.locator('.seat.me .seat-cards').innerText().catch(() => '');
  // Joe must not be shown the host's aces as his cards; his bar must not say Pair of Aces
  check(joeMade !== 'Pair of Aces', 'Joe does not see the host ace pair on his bar');
  const hostSeatCards = await joePage.locator('.seat:not(.me) .seat-cards .card.face-up, .seat:not(.me) .seat-cards [data-card]').count().catch(() => 0);
  // face-up opponent hole cards should be absent preflop
  const faceUpAway = await joePage.evaluate(() => {
    const seats = [...document.querySelectorAll('.seat:not(.me) .seat-cards')];
    return seats.some((el) => /As|Ah|A♠|A♥/.test(el.textContent || ''));
  });
  check(!faceUpAway, 'Joe does not see the host hole cards');
  await dismissExtras(joePage);
  await shot(joePage, 'desktop-joe-high-card');

  // Call around to the flop: button (host) first, then SB (Joe), then BB (Ana) checks.
  const act = async (u, type) => {
    const cur = await call(u, 'GET', `/tables/${code}`);
    return call(u, 'POST', `/tables/${code}/action`, { type, handNumber: cur.hand.number });
  };
  await act(host, 'call');
  await act(joe, 'call');
  const afterBb = await call(ana, 'GET', `/tables/${code}`);
  if (afterBb.hand?.street === 'preflop') await act(ana, 'check');
  const flop = await call(host, 'GET', `/tables/${code}`);
  check(flop.hand?.street === 'flop', `street is flop (${flop.hand?.street})`);
  check((flop.hand?.board || []).join(' ') === 'Ac Ks 4d', `flop is Ac Ks 4d (${flop.hand?.board})`);

  await desk.reload({ waitUntil: 'domcontentloaded' });
  await desk.addStyleTag({ content: HIDE });
  await dismissExtras(desk);
  const flopBar = await waitFor(desk, '[data-test=hand-equity]', 12000);
  check(flopBar, 'bar is still visible on the flop');
  const flopMade = flopBar ? (await desk.locator('[data-test=hand-made]').innerText()).trim() : '';
  check(flopMade === 'Three of a kind, Aces', `flop made-hand is Three of a kind, Aces (${flopMade})`);
  const flopPctTxt = flopBar ? await desk.locator('[data-test=hand-equity-pct]').innerText() : '';
  check(/Win\s+\d+%/.test(flopPctTxt), `flop bar still shows a percent (${flopPctTxt})`);
  await dismissExtras(desk);
  await shot(desk, 'desktop-flop-trips');

  // Flop action starts left of the button (Joe). Check around until the host can fold.
  for (let i = 0; i < 8; i++) {
    const cur = await call(host, 'GET', `/tables/${code}`);
    if (!cur.hand) break;
    if (cur.seats[cur.me.seat]?.folded) break;
    if (cur.hand.toAct === cur.me.seat) { await act(host, 'fold'); break; }
    const actor = cur.seats[cur.hand.toAct];
    const u = [host, joe, ana].find((x) => x.name === actor?.name);
    if (!u) break;
    await call(u, 'POST', `/tables/${code}/action`, { type: 'check', handNumber: cur.hand.number });
  }
  const afterFold = await call(host, 'GET', `/tables/${code}`);
  check(!!afterFold.seats[afterFold.me.seat]?.folded || !afterFold.hand, 'host is folded (or the hand ended)');
  await desk.reload({ waitUntil: 'load' });
  await desk.addStyleTag({ content: HIDE });
  await dismissExtras(desk);
  try { await desk.waitForSelector('[data-test=hand-equity]', { state: 'detached', timeout: 8000 }); } catch {}
  const still = await desk.locator('[data-test=hand-equity]').count();
  check(still === 0, `bar hides after the host folds (count ${still})`);
  await shot(desk, 'desktop-folded-hidden');

  for (const p of [desk, phone, joePage]) {
    check(!p.errs.length, `${p.u.name} page had no errors (${p.errs.join('; ')})`);
    await p.ctx.close();
  }
  await browser.close();
} catch (e) {
  console.error(e);
  fails.push(String(e?.message || e));
} finally {
  srv.kill('SIGKILL');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
if (fails.length) { console.error('FAILED', fails); process.exit(1); }
console.log('ALL OK');
