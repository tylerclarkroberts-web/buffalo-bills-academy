// Regression for live table Z5G38Q: 5 humans, Bots = None, the host CLICKS Deal in the browser and gets a hand.
// Also: a server rejection on Deal stays on screen (the 1.5s poll used to wipe it).
// Writes desktop + 390x844 screenshots. Fake players. Hides Guntrad and the faun.
//   npm run build && PLAYWRIGHT_DIR=/workspace/pw/package.json CHROME=/usr/bin/google-chrome OUT=/workspace/bba-scum-deal-shots node scripts/e2e-scum-deal-click.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || '/workspace/bba-scum-deal-shots';
const PORT = Number(process.env.PORT || 4012);
const B = `http://127.0.0.1:${PORT}`;
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR || '/workspace/pw/package.json')('playwright-core');

const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const HIDE = `.dealer-fig, .dl-plate, .dl-img, .dl-face, .dl-head, .dl-body, .dl-glow, img[src*="dealer"], img[alt*="Guntrad" i],
  [data-test="fawn"], .fn { display: none !important; visibility: hidden !important; }`;
fs.mkdirSync(OUT, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'scum-deal-e2e-'));

function boot() {
  const p = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DEV_LOGIN: '1', SCUM_TICK_MS: '0', SCUM_BOT_MS: '0', SLACK_BOT_TOKEN: '', PUBLIC_URL: '', STATIC_DIR: path.join(ROOT, 'dist') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stderr.on('data', (d) => process.stderr.write(d));
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server start timeout')), 20000);
    p.stdout.on('data', (d) => { if (String(d).includes('running')) { clearTimeout(t); res(p); } });
    p.on('exit', (c) => { clearTimeout(t); rej(new Error(`server exited ${c}`)); });
  });
}
const stop = (p) => new Promise((r) => { p.on('exit', r); p.kill('SIGTERM'); });
async function call(cookie, method, url, body) {
  const r = await fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status >= 400) throw new Error(`${method} ${url} ${r.status} ${JSON.stringify(j)}`);
  return { body: j, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
async function openPage(browser, cookie, view) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 2, isMobile: view.width <= 430, hasTouch: view.width <= 430, reducedMotion: 'reduce' });
  const [name, value] = cookie.split('=');
  await ctx.addCookies([{ name, value, url: B }]);
  await ctx.addInitScript((css) => { const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }; if (document.head) add(); else document.addEventListener('DOMContentLoaded', add); }, HIDE);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('pageerror', e.message); fails.push(`pageerror ${e.message}`); });
  return p;
}
const shot = async (p, n) => { const dest = path.join(OUT, `${n}.png`); await p.screenshot({ path: dest }); console.log('shot', dest); };

const srv = await boot();
try {
  const names = ['Tyler', 'Joe', 'Geoffrey', 'Keetch', 'Gunnar'];
  const ps = [];
  for (const [i, n] of names.entries()) {
    const u = await call(null, 'POST', '/auth/dev', { name: n, email: `deal-click-${i}@example.test` });
    await call(u.cookie, 'POST', '/api/me/avatar', { kind: 'gen', seed: `deal-click-${i}` });
    ps.push(u);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const [view, tag] of [[DESK, 'desktop'], [PHONE, 'phone']]) {
    const t = await call(ps[0].cookie, 'POST', '/api/scum/tables', { name: "Tyler's scum table", settings: { bots: 0, maxSeats: 6, turnSec: 86400 } });
    const code = t.body.code;
    for (const u of ps.slice(1)) await call(u.cookie, 'POST', `/api/scum/tables/${code}/join`);
    const p = await openPage(browser, ps[0].cookie, view);
    await p.goto(`${B}/scum/${code}`);
    await p.waitForSelector('[data-test=scum-lobby]');
    check((await p.locator('[data-test=scum-status]').innerText()).includes('5 seated'), `${tag}: lobby says 5 seated`);
    const deal = p.locator('[data-test=scum-deal]');
    check(await deal.isEnabled(), `${tag}: Deal is enabled`);

    // 1) A server rejection on Deal shows and is still there after several polls.
    let fake = true;
    await p.route(`**/api/scum/tables/${code}/start`, (r) => (fake ? r.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ error: 'Joe needs $10 to be dealt in (Scum pays $10). Work a shift in the Acid Mines first.' }) }) : r.continue()));
    await deal.click();
    await p.waitForSelector('[data-test=scum-error]', { timeout: 4000 }).catch(() => null);
    await wait(4000);
    const msg = await p.locator('[data-test=scum-error]').innerText().catch(() => '');
    check(/Acid Mines/.test(msg), `${tag}: rejection still visible after 4s of polling ("${msg}")`);
    await shot(p, `${tag}-deal-rejected`);
    fake = false;

    // 2) The real click deals.
    await deal.click();
    const hand = await p.waitForSelector('[data-test=scum-hand] .sc-hc', { timeout: 8000 }).catch(() => null);
    check(!!hand, `${tag}: clicking Deal dealt a hand`);
    const st = (await call(ps[0].cookie, 'GET', `/api/scum/tables/${code}`)).body;
    check(st.status === 'playing' && st.round?.order.length === 5, `${tag}: table is playing with 5 humans (${st.status}, ${st.round?.order.length})`);
    check(st.seats.filter((s) => s && s.bot).length === 0, `${tag}: no bots`);
    await wait(500);
    await shot(p, `${tag}-dealt`);
    await p.context().close();
  }
  await browser.close();
} finally {
  await stop(srv);
  fs.rmSync(DATA, { recursive: true, force: true });
}
if (fails.length) { console.error(`\n${fails.length} failure(s):\n` + fails.map((f) => `- ${f}`).join('\n')); process.exit(1); }
console.log('\nall ok');
