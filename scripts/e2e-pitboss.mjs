// Dealer POV, manual flip, pit-boss loom, and a tip toss. Guntrad stays off camera.
// npm run build && PLAYWRIGHT_DIR=... OUT=/workspace/bba-dealer-pov-shots CHROME=/usr/bin/google-chrome npm run e2e:pitboss
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'path';
import { createRequire } from 'node:module';
import { freshDeck } from '../server/blackjack/rules.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4310 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pov-'));
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
  try {
    const no = p.locator('[data-test=fawn-no]');
    if (await no.count()) { await no.click({ force: true }); await wait(200); }
  } catch { /* no faun this time */ }
  await p.evaluate(() => document.querySelectorAll('[data-test=fawn], .fn').forEach((el) => el.remove()));
}
async function skipGate(p) {
  const skip = p.getByRole('button', { name: 'Skip for now' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 6000 });
    await skip.click();
    await p.waitForURL((u) => !String(u).includes('/welcome'), { timeout: 8000 });
  } catch { /* already past the gate */ }
}
async function open(browser, me, vp, path = '/bj') {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1, reducedMotion: 'no-preference' });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript(() => {
    const css = '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo, .dealer-spot[title="Guntrad"], [data-test=bj-guntrad] { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }';
    const inject = () => {
      if (document.getElementById('e2e-hide-faun')) return;
      const s = document.createElement('style'); s.id = 'e2e-hide-faun'; s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    inject();
    document.addEventListener('DOMContentLoaded', inject);
  });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errs.push('console:' + m.text()); });
  await p.goto(`${B}${path}`);
  await p.addStyleTag({ content: '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo { display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important; }' });
  await skipGate(p);
  await p.addStyleTag({ content: '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo { display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important; }' });
  return p;
}
const noScroll = async (p, label) => {
  const y = await p.evaluate(() => document.scrollingElement?.scrollHeight - document.scrollingElement?.clientHeight);
  check((y || 0) <= 2, `${label}: no scroll (delta ${y})`);
};

let browser;
const frames = OUT ? fs.mkdtempSync(path.join(os.tmpdir(), 'pov-gif-')) : null;
let fi = 0;
const frame = async (page) => { if (!frames) return; fi += 1; await page.screenshot({ path: path.join(frames, `f${String(fi).padStart(4, '0')}.png`) }); };

try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const house = await login('Sam', 'sam@pov.test');
  const ann = await login('Ann', 'ann@pov.test');
  const table = await api(house, 'POST', '/bj/tables', { name: "Sam's pit", settings: { house: 'me', buyIn: 200, houseBank: 500, minBet: 5, maxBetX: 20, bots: 0, continuous: false, turnSec: 86400 } });
  await api(ann, 'POST', `/bj/tables/${table.code}/join`, { ack: true });
  await api(house, 'POST', `/bj/tables/${table.code}/start`);
  await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rig('9h', '7c', '5d', '8s', ['4c']) });
  await api(house, 'POST', `/bj/tables/${table.code}/autopilot`, { on: false });

  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  const D = await open(browser, house, { w: 1280, h: 800 }, `/bj/${table.code}`);
  await D.waitForSelector('[data-test=bj-dealer-pov]', { timeout: 12000 });
  await shooFaun(D);
  check(await D.locator('[data-test=bj-dealer-pov]').count() > 0, 'desktop: dealer POV is on');
  check(await D.locator('[data-test=bj-guntrad]').count() === 0, 'desktop: Guntrad is not in the dealer view');
  check(await D.locator('[data-test=bj-autopilot]').count() > 0, 'desktop: Autopilot toggle is there');

  const A = await open(browser, ann, { w: 1280, h: 800 }, `/bj/${table.code}`);
  await A.waitForSelector('[data-test=bj-table]', { timeout: 12000 });
  await shooFaun(A);
  await A.waitForSelector('[data-test=bj-deal], [data-test=bj-chip-5], [data-test=bj-bar]', { timeout: 8000 });
  // Place a $10 bet if the bet bar is up.
  if (await A.locator('[data-test=bj-deal]').count()) {
    await A.click('[data-test=bj-deal]');
  } else if (await A.getByRole('button', { name: /^Bet/ }).count()) {
    await A.getByRole('button', { name: /^Bet/ }).click();
  } else {
    await api(ann, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 });
    await A.reload(); await skipGate(A); await shooFaun(A);
  }
  await D.waitForSelector('[data-test=bj-deal-next]', { timeout: 8000 });
  check(await D.locator('[data-test=bj-deal-next]').count() > 0, 'desktop: Deal is offered after the bet');

  // Manual deal, framed for a short GIF of the flip.
  for (let i = 0; i < 4; i++) {
    await D.click('[data-test=bj-deal-next]');
    await wait(280);
    await frame(D);
  }
  await wait(200);
  await shot(D, 'desktop-dealer-pov');
  await noScroll(D, 'desktop POV');

  const M = await open(browser, house, { w: 390, h: 844, m: true }, `/bj/${table.code}`);
  await M.waitForSelector('[data-test=bj-dealer-pov]', { timeout: 12000 });
  await shooFaun(M);
  await shot(M, 'mobile-dealer-pov');
  await noScroll(M, 'mobile POV');

  // Pit boss looms in.
  await api(house, 'POST', '/dev/bj-pit', { code: table.code, line: 'Hands where the camera can see them.', loom: true });
  await D.waitForSelector('[data-test=bj-pit][data-state=loom], [data-test=bj-pit][data-state=talk]', { timeout: 8000 });
  await wait(500);
  await shot(D, 'desktop-pit-loom');
  await M.waitForSelector('[data-test=bj-pit]', { timeout: 8000 });
  await wait(400);
  await shot(M, 'mobile-pit-loom');
  check(/Hands where the camera can see them|Count it again|Language|phone|handsome tip/i.test((await D.locator('[data-test=bj-pit-line]').innerText()).replace(/\s+/g, ' ')), 'desktop: pit boss line is up');

  // Tip toss from Ann while Sam is dealing.
  const Am = await open(browser, ann, { w: 390, h: 844, m: true }, `/bj/${table.code}`);
  await Am.waitForSelector('[data-test=bj-tip-25]', { timeout: 10000 });
  await shooFaun(Am);
  await Am.click('[data-test=bj-tip-25]');
  await Am.waitForSelector('[data-test=bj-tip-toss]', { timeout: 5000 });
  await wait(350);
  await shot(Am, 'mobile-tip-toss');
  await D.waitForSelector('[data-test=bj-thanks], [data-test=bj-tip-toss]', { timeout: 6000 });
  await wait(200);
  await shot(D, 'desktop-tip-toss');
  check(await D.locator('[data-test=bj-thanks], [data-test=bj-tip-toss]').count() > 0, 'desktop: thanks or the toss is visible');
  await noScroll(Am, 'mobile tip');

  const benign = (e) => /appendChild|ResizeObserver/.test(e);
  for (const [p, name] of [[D, 'desktop house'], [A, 'desktop ann'], [M, 'mobile house'], [Am, 'mobile ann']]) {
    const errs = (p.errs || []).filter((e) => !benign(e));
    check(errs.length === 0, `${name} page errors (${errs})`);
  }
  check(!/Guntrad/.test(await D.locator('[data-test=bj-table]').innerText().catch(() => '')), 'Guntrad is not on the dealer POV');

  if (OUT && frames && fi > 1) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '5', '-i', path.join(frames, 'f%04d.png'),
      '-vf', 'scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none',
      '-loop', '0', path.join(OUT, 'manual-deal-flip.gif')]);
    console.log('gif', path.join(OUT, 'manual-deal-flip.gif'), 'frames', fi);
  }
} catch (e) {
  console.error(e);
  fails.push(String(e.message || e));
} finally {
  try { await browser?.close(); } catch { /* */ }
  srv.kill();
}
if (fails.length) { console.error('FAILED', fails); process.exit(1); }
console.log('ALL OK');
