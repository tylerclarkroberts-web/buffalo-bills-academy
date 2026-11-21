// Mid-hand refresh, POV crash fallback, and the runtime kill switch.
// PLAYWRIGHT_DIR=... CHROME=/usr/bin/google-chrome npm run e2e:pov-stress
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'os'; import path from 'path';
import { createRequire } from 'node:module';
import { freshDeck } from '../server/blackjack/rules.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || '/workspace/bba-dealer-pov-shots/reliability';
const PORT = 4330 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pov-stress-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BJ_TICK_MS: '0' }, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (p, name) => { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }); };
const rigHands = (hands, up, hole, extra = []) => {
  const firsts = hands.map((h) => h[0]); const seconds = hands.map((h) => h[1]);
  const used = new Set([...firsts, ...seconds, up, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, ...seconds.slice().reverse(), up, ...firsts.slice().reverse()];
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

async function shooFaun(p) {
  try {
    const no = p.locator('[data-test=fawn-no], [data-test="fawn-no"]');
    if (await no.count()) { await no.click({ force: true }); await wait(200); }
  } catch { /* */ }
}

async function skipGate(p) {
  const skip = p.getByRole('button', { name: 'Skip for now' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 6000 });
    await skip.click();
    await p.waitForURL((u) => !String(u).includes('/welcome'), { timeout: 8000 });
  } catch { /* */ }
}

async function open(browser, me) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'no-preference',
  });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript(() => {
    const css = '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo, .dealer-spot[title="Guntrad"], [data-test=bj-guntrad] { display: none !important; }';
    const inject = () => {
      if (document.getElementById('e2e-hide-faun')) return;
      const s = document.createElement('style'); s.id = 'e2e-hide-faun'; s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    inject();
    document.addEventListener('DOMContentLoaded', inject);
  });
  const p = await ctx.newPage();
  p.errs = []; p._ctx = ctx;
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errs.push('console:' + m.text()); });
  await p.goto(`${B}/bj`);
  await skipGate(p);
  return p;
}

const filterErrs = (errs) => (errs || []).filter((e) => !/appendChild|ResizeObserver|does not belong to this context|texImage3D: FLIP_Y|PREMULTIPLY_ALPHA|pov test crash|dealer-pov/.test(e));

try {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r, j) => { const t0 = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t0 > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const house = await login('Sam', 'sam@stress.test');
  const ann = await login('Ann', 'ann@stress.test');
  for (const [who, seed] of [[house, 'sam-dealer'], [ann, 'ann-hair']]) await api(who, 'POST', '/me/avatar', { kind: 'gen', seed });
  const table = await api(house, 'POST', '/bj/tables', { name: "Sam's pit", settings: { house: 'me', buyIn: 200, houseBank: 800, minBet: 5, maxBetX: 20, bots: 0, continuous: false, turnSec: 86400, maxSeats: 5 } });
  await api(ann, 'POST', `/bj/tables/${table.code}/join`, { ack: true });
  await api(house, 'POST', `/bj/tables/${table.code}/start`);
  await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['Kh', 'Qh']], '7c', '8s') });
  await api(ann, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 });

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await open(browser, house);
  await p.goto(`${B}/bj/${table.code}`);
  await shooFaun(p);
  try { await p.locator('[data-test=bj-dealer-pov]').waitFor({ timeout: 12000 }); check(true, 'dealer POV mounted'); }
  catch { check(false, 'dealer POV mounted'); }
  await wait(1500);
  await shot(p, 'before-refresh');

  const before = await api(house, 'GET', `/bj/tables/${table.code}`);
  check(before.round?.phase === 'play' || before.round?.hands?.length > 0, `mid-hand before refresh (phase ${before.round?.phase})`);
  const cardsBefore = (before.round?.hands || []).map((h) => (h.cards || []).join(','));

  await p.reload({ waitUntil: 'domcontentloaded' });
  await skipGate(p);
  await shooFaun(p);
  try { await p.locator('[data-test=bj-dealer-pov]').waitFor({ timeout: 12000 }); check(true, 'POV remounted after mid-hand refresh'); }
  catch { check(false, 'POV remounted after mid-hand refresh'); }
  await wait(800);
  const after = await api(house, 'GET', `/bj/tables/${table.code}`);
  const cardsAfter = (after.round?.hands || []).map((h) => (h.cards || []).join(','));
  check(JSON.stringify(cardsAfter) === JSON.stringify(cardsBefore), `server cards unchanged after refresh (${cardsAfter})`);
  check(after.round?.phase === before.round?.phase, `phase stayed ${after.round?.phase}`);
  await shot(p, 'after-refresh');

  // Render crash → classic table + house deal bar
  await p.evaluate(() => { window.__BBA_POV_THROW = new Error('pov test crash'); });
  await p.locator('[data-test=bj-mute]').click().catch(() => {});
  await wait(1200);
  const fallback = await p.evaluate(() => ({
    arena: !!document.querySelector('[data-test=bj-arena]'),
    bar: !!document.querySelector('[data-test=bj-house-bar]'),
    pov: !!document.querySelector('[data-test=bj-dealer-pov]'),
  }));
  check(fallback.arena, 'classic arena is on screen after a POV render crash');
  check(fallback.bar, 'house deal bar is available after a POV render crash');
  check(!fallback.pov, '3D POV unmounted after the crash fallback');
  await shot(p, 'after-crash');

  // Kill switch: write the data-dir flag, reload, POV stays off and the house can still deal
  fs.writeFileSync(path.join(dir, 'pov-off'), new Date().toISOString() + '\n');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await skipGate(p);
  await shooFaun(p);
  await wait(1500);
  const killed = await p.evaluate(() => ({
    arena: !!document.querySelector('[data-test=bj-arena]'),
    bar: !!document.querySelector('[data-test=bj-house-bar]'),
    pov: !!document.querySelector('[data-test=bj-dealer-pov]'),
  }));
  check(killed.arena && killed.bar && !killed.pov, `kill switch serves the classic table (arena=${killed.arena} bar=${killed.bar} pov=${killed.pov})`);
  await shot(p, 'kill-switch');

  const leftover = filterErrs(p.errs);
  check(leftover.length === 0, leftover.length ? `page errors (${leftover.slice(0, 3).join(' | ')})` : 'page errors (none)');
  await p._ctx.close();
  await browser.close();
} catch (e) {
  console.error(e);
  fails.push(String(e.message || e));
} finally {
  try { srv.kill('SIGTERM'); } catch { /* */ }
}
if (fails.length) { console.log('FAILS', fails); process.exit(1); }
console.log('ALL OK');
