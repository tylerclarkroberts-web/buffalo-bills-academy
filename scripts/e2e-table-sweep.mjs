// Browser check + screenshots for the bust-out punch and the clean-sweep sit-down.
// Boots a throwaway DEV_LOGIN server. Does not deploy.
//   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-table-sweep.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'os'; import path from 'path';
import { createRequire } from 'node:module';
import { riggedDeck } from '../test/helpers.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4060 + Math.floor(Math.random() * 9);
const B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-sweep-'));
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

async function open(browser, u, url, s) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m });
  await ctx.addCookies([{ name: 'bba_sid', value: u.sid, url: B }]);
  const p = await ctx.newPage(); p.ctx = ctx; p.u = u; p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.addInitScript(() => {
    const css = document.createElement('style');
    css.textContent = '.dealer-spot,.bit-quip,.dl-plate,[data-test=fawn],.fn{visibility:hidden!important;opacity:0!important;pointer-events:none!important}';
    document.documentElement.appendChild(css);
  });
  await p.goto(`${B}${url}`, { waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: '.dealer-spot,.bit-quip,.dl-plate,[data-test=fawn],.fn{visibility:hidden!important;opacity:0!important;pointer-events:none!important}' });
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

const DEAL = riggedDeck(['7c', '8d', 'As', '2d', '3h', 'Ah'], ['Kc', '9s', '4d', 'Jh', 'Td']);

async function setupTable(host, joe, ana) {
  const created = await call(host, 'POST', '/tables', { name: 'Sweep Night', settings: { buyIn: 200, smallBlind: 5, bigBlind: 10, nextHandDelaySeconds: 30, turnSeconds: 3600 } });
  const code = created.code;
  await call(joe, 'POST', `/tables/${code}/join`);
  await call(ana, 'POST', `/tables/${code}/join`);
  await call(host, 'POST', '/dev/holdem-rig', { code, deck: DEAL });
  await call(host, 'POST', `/tables/${code}/start`);
  // Ann/host is seat 0, button, first to act 3-handed after BB.
  const v = await call(host, 'GET', `/tables/${code}`);
  const byName = {};
  for (const s of v.seats) if (s) byName[s.name] = s.playerId;
  // Act in toAct order until the hand is over.
  const users = { [host.name]: host, [joe.name]: joe, [ana.name]: ana };
  for (let i = 0; i < 8; i++) {
    const cur = await call(host, 'GET', `/tables/${code}`);
    if (!cur.hand) return { code, last: cur };
    const actorId = cur.hand.toActPlayerId;
    const seat = cur.seats[cur.hand.toAct];
    const u = Object.values(users).find((x) => x.name === seat.name);
    await call(u, 'POST', `/tables/${code}/action`, { type: 'allin', handNumber: cur.hand.number });
  }
  return { code, last: await call(host, 'GET', `/tables/${code}`) };
}

async function recFrames(p, sel, dir, prefix, every = 180, max = 16) {
  if (!OUT) return [];
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (let i = 0; i < max; i++) {
    if (!(await p.$(sel))) break;
    const f = path.join(dir, `${prefix}-${String(i).padStart(2, '0')}.png`);
    await p.screenshot({ path: f });
    files.push(f);
    await sleep(every);
  }
  return files;
}

async function gif(frames, dest) {
  if (!frames.length || !OUT) return false;
  const { spawnSync } = await import('node:child_process');
  const args = ['-y', '-framerate', '7', '-pattern_type', 'glob', '-i', path.join(path.dirname(frames[0]), path.basename(frames[0]).replace(/-\d+\.png$/, '-*.png')),
    '-vf', 'scale=720:-1:flags=lanczos', dest];
  // simpler: list files
  const r = spawnSync('ffmpeg', ['-y', '-framerate', '7', ...frames.flatMap((f) => ['-i', f]), '-filter_complex', `concat=n=${frames.length}:v=1:a=0,scale=720:-1:flags=lanczos`, dest], { stdio: 'ignore' });
  if (r.status === 0) return true;
  const r2 = spawnSync('ffmpeg', ['-y', '-framerate', '7', '-i', path.join(path.dirname(frames[0]), path.basename(frames[0]).replace(/-\d+\.png$/, '-%02d.png')), '-vf', 'scale=720:-1:flags=lanczos', dest], { stdio: 'ignore' });
  return r2.status === 0;
}

try {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(100); } }
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const host = await login('Tyler', 'tyler.sweep@example.com');
  const joe = await login('Joe', 'joe.sweep@example.com');
  const ana = await login('Ana', 'ana.sweep@example.com');

  // --- desktop: punch then tour, winner watching live ---
  const table = await setupTable(host, joe, ana);
  check(!!table.last.sweep, 'server recorded a sweep');
  check(Array.isArray(table.last.lastHand?.allInLosers) && table.last.lastHand.allInLosers.length >= 1, 'all-in losers still recorded for the punch');
  check(table.last.sweep?.winner?.name === 'Tyler', `winner is Tyler (${table.last.sweep?.winner?.name})`);
  const desk = await open(browser, host, `/t/${table.code}`, { w: 1280, h: 720, m: false });
  await dismissExtras(desk);
  const punchOn = await waitFor(desk, '[data-test=allin-bit]', 15000);
  check(punchOn, 'bust-out punch animation still fires');
  if (punchOn) {
    await shot(desk, 'punch-still-works');
    const punchFrames = await recFrames(desk, '[data-test=allin-bit]', path.join(OUT || os.tmpdir(), 'punch-frames'), 'punch', 200, 10);
    await gif(punchFrames, path.join(OUT || os.tmpdir(), 'punch-still-works.gif'));
  }
  // Let the punch finish on its own (a skip click can also land on the tour as it mounts).
  try { await desk.waitForSelector('[data-test=allin-bit]', { state: 'detached', timeout: 10000 }); } catch {}
  await sleep(200);
  const tourOn = await waitFor(desk, '[data-test=table-sweep][data-mode=tour]', 12000);
  check(tourOn, 'winner sees the zoomed sit-down tour');
  if (tourOn) {
    await sleep(1400);
    await shot(desk, 'sweep-zoom');
    const tourFrames = await recFrames(desk, '[data-test=table-sweep]', path.join(OUT || os.tmpdir(), 'tour-frames'), 'tour', 200, 14);
    await gif(tourFrames, path.join(OUT || os.tmpdir(), 'sweep-zoom.gif'));
    await desk.locator('[data-test=table-sweep]').click({ timeout: 800 }).catch(() => {});
  }
  const scrolled = await desk.evaluate(() => document.documentElement.scrollHeight > innerHeight + 2);
  check(!scrolled, 'desktop table page does not scroll during the bit');
  await desk.ctx.close();

  // --- Ana was not at the table: fake "your turn" then close-up ---
  const phone = await open(browser, ana, '/', { w: 390, h: 844, m: true });
  await dismissExtras(phone);
  const pill = await waitFor(phone, '[data-test=turns-entry]', 8000);
  check(pill, 'fake turn shows in the Your turn pill');
  const row = await waitFor(phone, '[data-test=table-your-turn]', 8000);
  check(row, 'fake turn shows as a Your turn table badge');
  await shot(phone, 'fake-turn-prompt');
  const turns = await call(ana, 'GET', '/turns');
  check(!!turns.turns?.some((x) => x.code === table.code && x.deadline == null && x.game === 'holdem'), 'GET /turns lists a Hold\'em-looking row with no deadline');
  if (row) await phone.locator('[data-test=table-your-turn]').click();
  else if (pill) await phone.locator('[data-test=turns-entry]').click();
  await phone.waitForURL(new RegExp(`/t/${table.code}`), { timeout: 8000 }).catch(() => {});
  await dismissExtras(phone);
  try { await phone.waitForSelector('[data-test=allin-bit]', { timeout: 4000 }); await phone.waitForSelector('[data-test=allin-bit]', { state: 'detached', timeout: 10000 }); } catch {}
  const closeOn = await waitFor(phone, '[data-test=table-sweep][data-mode=closeup]', 12000);
  check(closeOn, 'victim opening later sees a close-up of their own sit-down');
  if (closeOn) {
    await sleep(900);
    await shot(phone, 'victim-closeup');
    const closeFrames = await recFrames(phone, '[data-test=table-sweep]', path.join(OUT || os.tmpdir(), 'close-frames'), 'close', 200, 12);
    await gif(closeFrames, path.join(OUT || os.tmpdir(), 'victim-closeup.gif'));
    await phone.locator('[data-test=table-sweep]').click({ timeout: 800 }).catch(() => {});
  }
  const phoneScroll = await phone.evaluate(() => document.documentElement.scrollHeight > innerHeight + 2);
  check(!phoneScroll, 'phone close-up does not grow a page scroll');
  // After skip, the usual leave / rebuy / out-of-chips UI is there
  await sleep(400);
  const leaveUI = await phone.evaluate(() => !!(document.querySelector('button') && /Leave table|Rebuy|Out of chips/i.test(document.body.innerText)));
  check(leaveUI, 'after the close-up, the normal leave/rebuy screen is there');
  await phone.ctx.close();

  // once only
  const again = await call(ana, 'GET', '/turns');
  check(!again.turns?.some((x) => x.code === table.code), 'fake turn is gone after the victim watched it');

  await browser.close();
  if (fails.length) { console.log(`\n${fails.length} FAILED`); fails.forEach((f) => console.log(' -', f)); process.exitCode = 1; }
  else console.log('ALL OK');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  srv.kill();
}
