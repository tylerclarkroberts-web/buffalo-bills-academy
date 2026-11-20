// All-in blackjack: local DEV_LOGIN table only (never live data).
// Player-dealer table so Guntrad stays off camera.
//   OUT=/workspace/bba-bj-allin-shots PHASE=before|after node scripts/e2e-bj-allin.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { freshDeck } from '../server/blackjack/rules.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PHASE = process.env.PHASE || 'after';
const PORT = 4290 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bj-allin-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BJ_TICK_MS: '0' }, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
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
async function shooFaun(p) {
  const no = p.locator('[data-test=fawn-no]');
  try {
    await no.waitFor({ state: 'visible', timeout: 3000 });
    await no.click({ force: true });
    await p.locator('[data-test=fawn]').waitFor({ state: 'hidden', timeout: 4000 });
  } catch { /* no faun this time */ }
}
async function skipGate(p) {
  for (const name of ['Skip for now', 'No photo, make me one →']) {
    const btn = p.getByRole('button', { name });
    try {
      await btn.waitFor({ state: 'visible', timeout: 2500 });
      await btn.click();
      await wait(300);
    } catch { /* already past */ }
  }
  try { await p.waitForURL((u) => !String(u).includes('/welcome'), { timeout: 4000 }); } catch { /* ok */ }
}

async function open(browser, me, vp, path) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript(() => {
    const s = document.createElement('style');
    s.textContent = [
      '[data-test="fawn"], .fn, .dealer-spot[title="Guntrad"], .dealer-spot:not([data-test]) { display: none !important; visibility: hidden !important; pointer-events: none !important; }',
    ].join(' ');
    document.documentElement.appendChild(s);
  });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(`${B}${path}`);
  await skipGate(p);
  return p;
}

let browser;
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const house = await login('Sam', 'sam@allin.test');
  const ann = await login('Ann', 'ann@allin.test');
  const table = await api(house, 'POST', '/bj/tables', { name: "Ann's all-in", settings: { house: 'me', buyIn: 100, houseBank: 1000, minBet: 5, maxBetX: 50, bots: 0, continuous: false, turnSec: 86400 } });
  await api(ann, 'POST', `/bj/tables/${table.code}/join`, { ack: true });
  await api(house, 'POST', `/bj/tables/${table.code}/start`);
  // 9+2, hit 10 = 21; dealer 6+9 = 15. A winning all-in.
  await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rig('9h', '6c', '2d', '9s', ['Th']) });

  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const A = await open(browser, ann, { w: 1280, h: 720 }, `/bj/${table.code}`);
  await A.locator('[data-test=bj-table]').waitFor({ timeout: 15000 });
  await shooFaun(A);
  await A.locator('[data-test=bj-bet-max]').click();
  await A.locator('[data-test=bj-deal]').click();
  await wait(800);
  const status = (await A.locator('[data-test=bj-status]').innerText()).replace(/\s+/g, ' ').trim();
  console.log('status after all-in:', status);

  if (PHASE === 'before') {
    check(/waiting for the others/i.test(status), `stuck status reads "${status}"`);
    check(!(await A.locator('[data-test=bj-acts]').count()), 'no hit/stand yet — hand never dealt');
    await shot(A, 'before-stuck');
  } else {
    check(!/waiting for the others/i.test(status), `dealt instead of waiting ("${status}")`);
    await A.locator('[data-test=bj-acts]').waitFor({ timeout: 8000 });
    const dbl = A.locator('[data-test=bj-double]');
    const split = A.locator('[data-test=bj-split]');
    check(await dbl.isDisabled(), 'double is disabled with no chips left');
    check(await split.isDisabled(), 'split is disabled with no chips left');
    await shot(A, 'after-your-move');
    await A.locator('[data-test=bj-hit]').click();
    await wait(1200);
    const afterHit = (await A.locator('[data-test=bj-status]').innerText()).replace(/\s+/g, ' ').trim();
    console.log('status after hit:', afterHit);
    await shot(A, 'after-settled');
    check(/21/.test(await A.content()) || /win|Round/i.test(afterHit) || (await A.locator('[data-test=bj-betting], [data-test=bj-final]').count()) > 0, 'hand played through to a result or the next bet');
  }

  if (OUT && fs.existsSync(path.join(OUT, 'after-your-move.png')) && fs.existsSync(path.join(OUT, 'after-settled.png'))) {
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('ffmpeg', ['-y', '-loop', '1', '-t', '1.2', '-i', path.join(OUT, 'after-your-move.png'), '-loop', '1', '-t', '1.6', '-i', path.join(OUT, 'after-settled.png'),
        '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0,fps=8,scale=960:-1:flags=lanczos', path.join(OUT, 'after-playthrough.gif')], { stdio: 'pipe' });
      console.log('gif: ' + path.join(OUT, 'after-playthrough.gif'));
    } catch (e) { console.log('gif skipped:', e.message); }
  }
  if (fails.length) {
    console.log(fails.length + ' FAILED');
    process.exitCode = 1;
  } else {
    console.log('ALL OK');
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  srv.kill();
}
