// Create a SCUM table with no bots: the primary button is Open lobby, then the lobby shows the invite code.
// Writes desktop + 390x844 screenshots. Fake players. Hides Guntrad and the faun.
//   npm run build && PLAYWRIGHT_DIR=/workspace/pw/package.json CHROME=/usr/bin/google-chrome OUT=/workspace/bba-scum-nobots-shots node scripts/e2e-scum-nobots.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || '/workspace/bba-scum-nobots-shots';
const DEMO = path.join(ROOT, 'docs/demo/scum-open-no-bots');
const PORT = Number(process.env.PORT || 4011);
const B = `http://127.0.0.1:${PORT}`;
const PW = process.env.PLAYWRIGHT_DIR || '/workspace/pw/package.json';
const { chromium } = createRequire(PW)('playwright-core');

const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await wait(step);
  }
};

const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const HIDE = `
  .dealer-fig, .dl-plate, .dl-img, .dl-face, .dl-head, .dl-body, .dl-glow,
  img[src*="dealer"], img[alt*="Guntrad" i],
  [data-test="fawn"], .fn { display: none !important; visibility: hidden !important; }
`;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DEMO, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'scum-nobots-e2e-'));

function boot() {
  const p = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: DATA,
      DEV_LOGIN: '1',
      SCUM_TICK_MS: '0',
      SCUM_BOT_MS: '0',
      SLACK_BOT_TOKEN: '',
      PUBLIC_URL: '',
      STATIC_DIR: path.join(ROOT, 'dist'),
    },
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
  const ctx = await browser.newContext({
    viewport: view,
    deviceScaleFactor: 2,
    isMobile: view.width <= 430,
    hasTouch: view.width <= 430,
    reducedMotion: 'reduce',
  });
  const [name, value] = cookie.split('=');
  await ctx.addCookies([{ name, value, url: B }]);
  await ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, HIDE);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('pageerror', e.message); fails.push(`pageerror ${e.message}`); });
  return p;
}

const shot = async (p, n) => {
  const dest = path.join(OUT, `${n}.png`);
  await p.screenshot({ path: dest, fullPage: false });
  fs.copyFileSync(dest, path.join(DEMO, `${n}.png`));
  console.log('shot', dest);
};

const noScroll = async (p, label) => {
  const s = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, v: innerHeight, w: document.documentElement.scrollWidth, vw: innerWidth }));
  check(s.h <= s.v + 2 && s.w <= s.vw + 2, `${label}: no scroll (${s.w}x${s.h} in ${s.vw}x${s.v})`);
};

const srv = await boot();
try {
  const ann = await call(null, 'POST', '/auth/dev', { name: 'Ann', email: 'ann-nobots@example.test' });
  const bob = await call(null, 'POST', '/auth/dev', { name: 'Bob', email: 'bob-nobots@example.test' });
  const cat = await call(null, 'POST', '/auth/dev', { name: 'Cat', email: 'cat-nobots@example.test' });
  await call(ann.cookie, 'POST', '/api/me/avatar', { kind: 'gen', seed: 'scum-nobots-ann' });
  await call(bob.cookie, 'POST', '/api/me/avatar', { kind: 'gen', seed: 'scum-nobots-bob' });
  await call(cat.cookie, 'POST', '/api/me/avatar', { kind: 'gen', seed: 'scum-nobots-cat' });

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });

  // Create page with Bots = None on desktop and phone first (no leftover tables), then open one lobby.
  let code = null;
  const pages = [];
  for (const [view, tag] of [[DESK, 'desktop'], [PHONE, 'phone']]) {
    const p = await openPage(browser, ann.cookie, view);
    await p.goto(`${B}/scum`);
    await p.waitForSelector('.sc-lobby, [data-test=scum-setup], [data-test=scum-tab-new]');
    const tab = p.locator('[data-test=scum-tab-new]');
    if (await tab.count()) { await tab.click(); }
    await p.waitForSelector('[data-test=scum-setup]');
    const none = p.locator('[data-test=scum-bots] button', { hasText: 'None' });
    await none.click();
    await wait(200);
    check(await none.evaluate((el) => el.classList.contains('on')), `${tag}: None is selected`);
    const lobbyBtn = p.locator('[data-test=scum-create]');
    check(await lobbyBtn.count() === 1, `${tag}: one Open lobby button`);
    check(await lobbyBtn.innerText() === 'Open lobby →', `${tag}: primary label is Open lobby →`);
    check(await lobbyBtn.isEnabled(), `${tag}: Open lobby is enabled`);
    check(await lobbyBtn.evaluate((el) => el.classList.contains('primary')), `${tag}: Open lobby uses the primary style`);
    check(await p.locator('[data-test=scum-create-deal]').count() === 0, `${tag}: Open & deal is not shown`);
    await shot(p, `${tag}-create-none`);
    await noScroll(p, `${tag} create`);
    pages.push({ p, tag, view, lobbyBtn });
  }

  await pages[0].lobbyBtn.click();
  await pages[0].p.waitForSelector('[data-test=scum-lobby]');
  code = await pages[0].p.locator('[data-test=scum-code]').innerText();
  check(/^[A-Z2-9]{6}$/.test(code), `desktop: lobby shows invite code (${code})`);
  check(await pages[0].p.locator('[data-test=scum-deal]').isDisabled(), 'desktop: Deal stays off until 3 players');
  await shot(pages[0].p, 'desktop-lobby');
  await noScroll(pages[0].p, 'desktop lobby');
  await pages[0].p.context().close();

  await pages[1].p.goto(`${B}/scum/${code}`);
  await pages[1].p.waitForSelector('[data-test=scum-lobby]');
  const shown = await pages[1].p.locator('[data-test=scum-code]').innerText();
  check(shown === code, `phone: lobby shows the same invite code (${shown})`);
  check(await pages[1].p.locator('[data-test=scum-deal]').isDisabled(), 'phone: Deal stays off until 3 players');
  await shot(pages[1].p, 'phone-lobby');
  await noScroll(pages[1].p, 'phone lobby');
  await pages[1].p.context().close();

  // Friends join; host can then deal.
  if (code) {
    await call(bob.cookie, 'POST', `/api/scum/tables/${code}/join`);
    await call(cat.cookie, 'POST', `/api/scum/tables/${code}/join`);
    const p = await openPage(browser, ann.cookie, DESK);
    await p.goto(`${B}/scum/${code}`);
    await p.waitForSelector('[data-test=scum-lobby]');
    check(await p.locator('[data-test=scum-deal]').isEnabled(), 'Deal enables once three humans are seated');
    const started = await call(ann.cookie, 'POST', `/api/scum/tables/${code}/start`);
    check(started.body.status === 'playing', `host dealt a no-bot table after friends joined (${started.body.status})`);
    check((started.body.seats || []).filter((s) => s && s.bot).length === 0, 'dealt table has no bots');
    await p.reload();
    await p.waitForSelector('[data-test=scum-hand]', { timeout: 8000 });
    check(await p.locator('[data-test=scum-hand]').count() > 0, 'host sees a dealt hand');
    await p.context().close();
  }

  await browser.close();
} finally {
  await stop(srv);
  fs.rmSync(DATA, { recursive: true, force: true });
}

if (fails.length) {
  console.error(`\n${fails.length} failure(s):\n` + fails.map((f) => `- ${f}`).join('\n'));
  process.exit(1);
}
console.log('\nall ok');
