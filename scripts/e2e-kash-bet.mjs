// Kash Bet screenshots + a short GIF: the felt tell, catch, drag-out, back-room toy, payout, and the buried rule.
// Player-dealer table only (Guntrad stays off camera).  npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-kash-bet.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { freshDeck } from '../server/blackjack/rules.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4280 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-kash-'));
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
    const s = document.createElement('style');
    s.textContent = '[data-test="fawn"], .fn { display: none !important; visibility: hidden !important; pointer-events: none !important; }';
    document.documentElement.appendChild(s);
  });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errs.push('console:' + m.text()); });
  await p.goto(`${B}${path}`);
  await skipGate(p);
  return p;
}

let browser;
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const house = await login('Sam', 'sam@kash.test');
  const ann = await login('Ann', 'ann@kash.test');
  const table = await api(house, 'POST', '/bj/tables', { name: "Sam's pit", settings: { house: 'me', buyIn: 200, houseBank: 500, minBet: 5, maxBetX: 20, bots: 0, continuous: false, turnSec: 86400 } });
  await api(ann, 'POST', `/bj/tables/${table.code}/join`, { ack: true });
  await api(house, 'POST', `/bj/tables/${table.code}/start`);
  await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rig('Kh', '9c', 'Qh', '8s') });

  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const H = await open(browser, house, { w: 1280, h: 720 }, `/bj/${table.code}`);
  const A = await open(browser, ann, { w: 390, h: 844, m: true }, `/bj/${table.code}`);
  await skipGate(H); await skipGate(A);
  try {
    await H.waitForSelector('[data-test=bj-table]', { timeout: 12000 });
    await A.waitForSelector('[data-test=bj-table]', { timeout: 12000 });
  } catch (e) {
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      await H.screenshot({ path: path.join(OUT, 'debug-house.png') }).catch(() => {});
      await A.screenshot({ path: path.join(OUT, 'debug-ann.png') }).catch(() => {});
    }
    const dump = async (p, n) => `${n} url=${p.url()} title=${await p.title()} errs=${JSON.stringify(p.errs)} text=${(await p.locator('body').innerText()).slice(0, 400)}`;
    console.error(await dump(H, 'HOUSE'));
    console.error(await dump(A, 'ANN'));
    throw e;
  }
  await wait(1800); // house poll marks them as watching
  await shooFaun(H); await shooFaun(A);

  // buried rule, mid-list
  await H.click('[data-test=bj-rules]');
  await H.waitForSelector('[data-test=bj-rules-pop]');
  const rulesText = await H.locator('[data-test=bj-rules-pop]').innerText();
  check(/Kash Bet/.test(rulesText), 'rules mention a Kash Bet');
  check(!rulesText.trim().startsWith('A Kash Bet'), 'Kash Bet is not the first rule');
  const lis = await H.locator('[data-test=bj-rules-pop] li').allTextContents();
  const idx = lis.findIndex((x) => /Kash Bet/.test(x));
  check(idx > 0 && idx < lis.length - 1, `Kash Bet is mid-list (${idx + 1} of ${lis.length})`);
  await shot(H, 'rules');
  await H.locator('[data-test=bj-rules-pop]').click({ position: { x: 8, y: 8 }, force: true });
  await H.waitForSelector('[data-test=bj-rules-pop]', { state: 'hidden', timeout: 4000 });

  await A.click('[data-test=bj-deal]');
  await A.waitForSelector('[data-test=bj-kash-match]', { timeout: 15000 });
  await wait(400);
  await shot(A, 'kash-button');

  const frames = OUT ? fs.mkdtempSync(path.join(os.tmpdir(), 'kash-gif-')) : null;
  let fi = 0;
  const frame = async (page) => { if (!frames) return; fi += 1; await page.screenshot({ path: path.join(frames, `f${String(fi).padStart(4, '0')}.png`) }); };

  await A.click('[data-test=bj-kash-match]');
  await H.waitForSelector('[data-test=bj-kash-catch], [data-test=bj-kash-glint]', { timeout: 5000 });
  const hasCatch = await H.locator('[data-test=bj-kash-catch]').count();
  const hasGlint = (await H.locator('[data-test=bj-kash-glint]').count()) + (await A.locator('[data-test=bj-kash-glint]').count());
  check(hasCatch > 0, 'watching dealer gets Call security');
  check(hasGlint > 0, 'a felt glint is up');
  await shot(H, 'tell-and-catch');
  await frame(H);

  await H.click('[data-test=bj-kash-catch]', { force: true });
  await H.waitForSelector('[data-test=bj-kash-drag], [data-test=bj-kash-room]', { timeout: 5000 });
  if (await H.locator('[data-test=bj-kash-drag]').count()) {
    await wait(400);
    await shot(H, 'drag-out');
    await frame(H);
    await H.waitForSelector('[data-test=bj-kash-room]', { timeout: 4000 });
  }
  await H.waitForSelector('[data-test=bj-kash-toy]');
  await wait(400);
  await shot(H, 'back-room');
  await frame(H);

  const box = H.locator('[data-test=bj-kash-toy]');
  const clickToy = async (tool, x, y) => {
    await H.click(`[data-test=bj-kash-tool-${tool}]`);
    const r = await box.boundingBox();
    await H.mouse.click(r.x + r.width * x, r.y + r.height * y);
    await wait(350);
    await frame(H);
  };
  await clickToy('punch', 0.5, 0.4);
  await clickToy('knuckles', 0.55, 0.42);
  await clickToy('pie', 0.5, 0.35);
  await shot(H, 'beat-up');
  await clickToy('grenade', 0.48, 0.5);
  await wait(1100);
  await frame(H);
  await shot(H, 'grenade');

  // phone cheater view of the room
  if (await A.locator('[data-test=bj-kash-room]').count()) await shot(A, 'cheater-room-phone');

  await H.click('[data-test=bj-kash-finish]');
  await H.waitForSelector('[data-test=bj-kash-notice]', { timeout: 5000 });
  await shot(H, 'payout');
  await frame(H);
  const notice = await H.locator('[data-test=bj-kash-notice]').innerText();
  check(/collected/i.test(notice) && /\$/.test(notice), `payout notice shows the take (${notice.replace(/\s+/g, ' ').slice(0, 80)})`);

  await shot(A.locator('body').page(), 'cheater-notice');
  if (await A.locator('[data-test=bj-kash-notice]').count()) await shot(A, 'cheater-notice');

  const benign = (e) => /appendChild/.test(e);
  const herr = (H.errs || []).filter((e) => !benign(e));
  const aerr = (A.errs || []).filter((e) => !benign(e));
  if ((H.errs || []).some(benign)) console.log('note house page: appendChild during navigation (ignored)');
  if ((A.errs || []).some(benign)) console.log('note ann page: appendChild during navigation (ignored)');
  check(herr.length === 0, `house page errors (${herr})`);
  check(aerr.length === 0, `ann page errors (${aerr})`);
  check(!/Guntrad/.test(await H.locator('[data-test=bj-table]').innerText().catch(() => '')), 'Guntrad is not on the felt');

  if (OUT && frames && fi > 1) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '6', '-i', path.join(frames, 'f%04d.png'),
      '-vf', 'scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none',
      '-loop', '0', path.join(OUT, 'kash-bet.gif')]);
    console.log('gif', path.join(OUT, 'kash-bet.gif'), 'frames', fi);
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
