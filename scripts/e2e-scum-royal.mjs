// Royal commands in Async Scum: the King's tight picker, the Scum acting it out (no button for them),
// a skippable replay for anyone who missed it, and a rewatch icon. Desktop + phone shots and a GIF or two.
//   PLAYWRIGHT_DIR=/workspace/pw CHROME=/usr/bin/google-chrome OUT=/workspace/bba-scum-royal-shots node scripts/e2e-scum-royal.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || path.join(os.tmpdir(), 'scum-royal-shots');
const PORT = 3000 + Math.floor(Math.random() * 900) + 50;
const BASE = `http://127.0.0.1:${PORT}`;
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 800 };
fs.mkdirSync(OUT, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'scum-royal-e2e-'));

function boot() {
  const p = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DEV_LOGIN: '1', SCUM_BOT_MS: '600000', SLACK_BOT_TOKEN: '', PUBLIC_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((res, rej) => { p.stdout.on('data', (d) => { if (String(d).includes('running')) res(p); }); p.on('exit', (c) => rej(new Error(`server exited ${c}`))); });
}
const stop = (p) => new Promise((r) => { p.on('exit', r); p.kill('SIGTERM'); });
async function call(cookie, method, url, body) {
  const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status >= 400) throw new Error(`${method} ${url} ${r.status} ${JSON.stringify(j)}`);
  return { body: j, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const NAMES = ['Ann', 'Bob', 'Cat', 'Dee'];
async function loginAll() {
  const out = {};
  for (const n of NAMES) { const r = await call(null, 'POST', '/auth/dev', { name: n, email: `${n.toLowerCase()}@example.test` }); out[n] = { cookie: r.cookie, id: r.body.id }; }
  return out;
}

const DECK = []; for (const s of 'shdc') for (const r of '23456789TJQKA') DECK.push(r + s);
const rk = (c) => '23456789TJQKA'.indexOf(c[0]);
const sort = (h) => h.slice().sort((a, b) => rk(a) - rk(b));
function deal(fixed, counts, used = []) {
  const taken = new Set([...used, ...Object.values(fixed).flat()]);
  const rest = DECK.filter((c) => !taken.has(c)); let k = 7;
  const hands = { ...fixed };
  for (const [s, n] of Object.entries(counts)) { hands[s] = []; for (let i = 0; i < n; i++) { k = (k * 37 + 11) % rest.length; hands[s].push(rest.splice(k, 1)[0]); } hands[s] = sort(hands[s]); }
  return hands;
}
const stats = (k, s) => ({ rounds: 1, king: k, scum: s, skips: 0, skipped: 0 });

function tables(P, now) {
  const seat = (n, st) => ({ id: P[n].id, name: n, joinedAt: now - 3600e3, stats: st });
  const hands = deal({ 0: ['3h', '5c', '7s', '9c', 'Jh', 'Qc', 'Ah'] }, { 1: 8, 2: 9, 3: 10 });
  const base = {
    createdAt: now - 7200e3, status: 'playing', settings: { turnSec: 86400, maxSeats: 4, bots: 0 }, turnSec: 86400, maxSeats: 4,
    seats: [seat('Ann', stats(1, 0)), seat('Bob', stats(0, 0)), seat('Cat', stats(0, 0)), seat('Dee', stats(0, 1))],
    titles: { 0: 'king', 1: 'queen', 2: 'commoner', 3: 'scum' }, roundNo: 2,
    lastRound: { no: 1, finish: [{ seat: 0, name: 'Ann', title: 'king', pay: 100, net: 100 }, { seat: 1, name: 'Bob', title: 'queen', pay: 50, net: 50 }, { seat: 2, name: 'Cat', title: 'commoner', net: 0 }, { seat: 3, name: 'Dee', title: 'scum', pay: -10, net: -10 }] },
    round: { no: 2, phase: 'play', order: [0, 1, 2, 3], hands, pile: { cards: ['6h'], count: 1, rank: 6, seat: 1 }, owner: 1, turn: 2, finished: [], gone: [], exchange: null, lastPlay: { seat: 1, cards: ['6h'] }, skipped: null, passed: [], turnAt: now - 60e3, deadline: now + 86340e3 },
    hostId: P.Ann.id, hostName: 'Ann',
  };
  const t1 = { ...base, code: 'ROYAL1', name: 'The Throne Room', log: [{ seq: 1, t: now - 120e3, round: 2, text: 'Round 1 over. King: Ann · Queen: Bob · Commoner: Cat · Scum: Dee.', ev: { k: 'round' } }], seq: 1, royal: [] };
  const milk = { id: 'r10', round: 1, at: now - 30e3, cmd: 'milk', kingSeat: 0, scumSeat: 3, kingName: 'Ann', scumName: 'Dee', targetSeat: null, seen: { [P.Ann.id]: now - 20e3 } };
  const t2 = { ...JSON.parse(JSON.stringify({ ...base, round: { ...base.round, hands: deal({}, { 0: 7, 1: 8, 2: 9, 3: 10 }) } })), code: 'MILKME', name: 'Milk Run',
    log: [{ seq: 2, t: now - 30e3, round: 2, text: 'Ann commands Dee: Get me a glass of milk.', ev: { k: 'royal', id: 'r10', cmd: 'milk', kingSeat: 0, scumSeat: 3 } }], seq: 2, royal: [milk] };
  const toot = { id: 'r11', round: 1, at: now - 30e3, cmd: 'toot', kingSeat: 0, scumSeat: 3, targetSeat: 1, kingName: 'Ann', scumName: 'Dee', targetName: 'Bob', seen: { [P.Ann.id]: now - 20e3 } };
  const t3 = { ...JSON.parse(JSON.stringify({ ...base, round: { ...base.round, hands: deal({}, { 0: 7, 1: 8, 2: 9, 3: 10 }) } })), code: 'TOOTIT', name: 'The Toot',
    log: [{ seq: 2, t: now - 30e3, round: 2, text: 'Ann commands Dee: let Bob toot in their face.', ev: { k: 'royal', id: 'r11', cmd: 'toot', kingSeat: 0, scumSeat: 3, targetSeat: 1 } }], seq: 2, royal: [toot] };
  return { tables: { ROYAL1: t1, MILKME: t2, TOOTIT: t3 } };
}

async function page(browser, who, view, extra = {}) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 2, isMobile: view === PHONE, hasTouch: view === PHONE, reducedMotion: 'no-preference', ...extra });
  const [name, value] = who.cookie.split('=');
  await ctx.addCookies([{ name, value, url: BASE }]);
  await ctx.addInitScript(() => { window.__scumRoyalMs = 20000; const s = document.createElement('style'); s.textContent = '[data-test=fawn]{display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); });
  const p = await ctx.newPage(); p.on('pageerror', (e) => { console.log('pageerror', e.message); fails.push(`pageerror ${e.message}`); });
  return p;
}
const shot = (p, n) => p.screenshot({ path: path.join(OUT, `${n}.png`) });
const noScroll = async (p, label) => { const s = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, v: innerHeight, w: document.documentElement.scrollWidth, vw: innerWidth })); check(s.h <= s.v + 1 && s.w <= s.vw + 1, `${label}: no scroll (${s.w}x${s.h} in ${s.vw}x${s.v})`); };

async function frames(p, prefix, n, interval) {
  const dir = path.join(OUT, `_${prefix}`); fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) { await p.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) }); await wait(interval); }
  return dir;
}
function gif(dir, name, fps = 8) {
  const dest = path.join(OUT, name);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.png'),
    '-vf', 'scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer', dest]);
  console.log('     gif:', dest);
  return dest;
}

let srv = await boot();
try {
  let P = await loginAll();
  for (const n of NAMES) await call(P[n].cookie, 'POST', '/api/me/avatar', { kind: 'gen', seed: `royal-demo-${n}` });
  await stop(srv);
  fs.writeFileSync(path.join(DATA, 'scum.json'), JSON.stringify(tables(P, Date.now())));
  srv = await boot();
  P = await loginAll();
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--hide-scrollbars'] });

  // 1. King Ann's picker, desktop + phone, no scroll
  for (const [view, tag] of [[DESK, 'desktop'], [PHONE, 'phone']]) {
    const p = await page(browser, P.Ann, view);
    await p.goto(`${BASE}/scum/ROYAL1`);
    await p.waitForSelector('[data-test=scum-royal-picker]', { timeout: 8000 });
    check(await p.locator('[data-test=scum-royal-picker]').count() === 1, `${tag}: King sees the royal picker`);
    check(await p.locator('[data-test=scum-royal-cmd-jig]').count() === 1, `${tag}: Do a jig is in the picker`);
    check(await p.locator('[data-test=scum-royal-cmd-milk]').count() === 1, `${tag}: Fetch milk is in the picker`);
    check(await p.locator('[data-test=scum-royal-cmd-toot]').count() === 1, `${tag}: Toot is in the picker`);
    const cmds = await p.locator('[data-test^=scum-royal-cmd-]').count();
    check(cmds === 11, `${tag}: all 11 commands in the picker (${cmds})`);
    const box = await p.locator('[data-test=scum-royal-picker]').boundingBox();
    const vp = p.viewportSize();
    check(box && box.y + box.height <= vp.height + 1, `${tag}: picker fits in the viewport (bottom ${box?.y + box?.height} of ${vp.height})`);
    await shot(p, `${tag}-royal-picker`);
    await noScroll(p, `${tag} picker`);
    // Scum Dee should not see a picker
    if (tag === 'desktop') {
      const dee = await page(browser, P.Dee, view);
      await dee.goto(`${BASE}/scum/ROYAL1`);
      await dee.waitForSelector('[data-test=scum-table]');
      check(await dee.locator('[data-test=scum-royal-picker]').count() === 0, 'Scum has no picker and no confirm button');
      await shot(dee, 'desktop-scum-no-picker');
      await dee.context().close();
    }
    await p.context().close();
  }

  // 2. Ann issues a jig on ROYAL1; live animation; Dee is not asked to press anything
  const ann = await page(browser, P.Ann, DESK);
  await ann.goto(`${BASE}/scum/ROYAL1`);
  await ann.evaluate(() => { window.__scumRoyalMs = 20000; });
  await ann.waitForSelector('[data-test=scum-royal-cmd-jig]');
  await ann.click('[data-test=scum-royal-cmd-jig]');
  await ann.waitForSelector('[data-test=scum-royal-play]', { timeout: 5000 });
  check(/jig/i.test(await ann.locator('[data-test=scum-royal-caption]').innerText()), 'jig caption on the felt');
  check(await ann.locator('[data-test=scum-royal-skip]').count() === 1, 'skip/tap-to-dismiss is on the replay');
  check(await ann.locator('.sc-seat.royal-jig, .sc-seat.royal-scum').count() >= 1, 'Scum seat is animating the jig');
  await shot(ann, 'desktop-jig');
  const jigDir = await frames(ann, 'jig', 10, 160);
  await ann.locator('[data-test=scum-royal-skip]').click({ timeout: 5000 });
  await ann.waitForSelector('[data-test=scum-royal-play]', { state: 'detached', timeout: 4000 });
  try { gif(jigDir, 'jig.gif', 7); } catch (e) { console.log('     (no jig gif: ' + e.message + ')'); }
  check(await ann.locator('[data-test=scum-royal-rewatch]').count() === 1, 'rewatch icon appears after a command');
  await shot(ann, 'desktop-rewatch-icon');

  // Dee (who was not at the table) opens it and gets the replay automatically; skip it; rewatch
  const dee = await page(browser, P.Dee, PHONE);
  await dee.goto(`${BASE}/scum/ROYAL1`);
  await dee.evaluate(() => { window.__scumRoyalMs = 20000; });
  await dee.waitForSelector('[data-test=scum-royal-play]', { timeout: 8000 });
  check(/jig/i.test(await dee.locator('[data-test=scum-royal-caption]').innerText()), 'Dee auto-plays the missed jig on open');
  await shot(dee, 'phone-jig-replay');
  await noScroll(dee, 'phone jig replay');
  await dee.locator('[data-test=scum-royal-skip]').click();
  await dee.waitForSelector('[data-test=scum-royal-play]', { state: 'detached', timeout: 4000 });
  check(await dee.locator('[data-test=scum-royal-play]').count() === 0, 'skip dismisses the replay');
  await dee.locator('[data-test=scum-royal-rewatch]').click();
  await dee.waitForSelector('[data-test=scum-royal-play]');
  check(/jig/i.test(await dee.locator('[data-test=scum-royal-caption]').innerText()), 'rewatch plays the jig again');
  await shot(dee, 'phone-jig-rewatch');
  await dee.locator('[data-test=scum-royal-skip]').click();
  await dee.context().close();
  await ann.context().close();

  // 3. Milk and toot replays (planted, unseen by Bob) — desktop milk GIF, phone toot
  const bobMilk = await page(browser, P.Bob, DESK);
  await bobMilk.goto(`${BASE}/scum/MILKME`);
  await bobMilk.waitForSelector('[data-test=scum-royal-play][data-cmd=milk]', { timeout: 8000 });
  check(/milk/i.test(await bobMilk.locator('[data-test=scum-royal-caption]').innerText()), 'Bob auto-plays the milk command');
  await shot(bobMilk, 'desktop-milk');
  const milkDir = await frames(bobMilk, 'milk', 8, 200);
  await bobMilk.locator('[data-test=scum-royal-skip]').click({ timeout: 5000 });
  try { gif(milkDir, 'milk.gif', 6); } catch (e) { console.log('     (no milk gif: ' + e.message + ')'); }
  await bobMilk.context().close();

  const bobToot = await page(browser, P.Bob, PHONE);
  await bobToot.goto(`${BASE}/scum/TOOTIT`);
  await bobToot.waitForSelector('[data-test=scum-royal-play][data-cmd=toot]', { timeout: 8000 });
  check(/toot/i.test(await bobToot.locator('[data-test=scum-royal-caption]').innerText()), 'phone auto-plays Bob tooting in Dee\'s face');
  check(await bobToot.locator('.sc-seat.royal-toot, .sc-seat.royal-scum').count() >= 1, 'Scum face-green class is on during the toot');
  await shot(bobToot, 'phone-toot');
  const tootDir = await frames(bobToot, 'toot', 8, 180);
  await bobToot.locator('[data-test=scum-royal-skip]').click({ timeout: 5000 });
  try { gif(tootDir, 'toot.gif', 6); } catch (e) { console.log('     (no toot gif: ' + e.message + ')'); }
  await noScroll(bobToot, 'phone toot');
  await bobToot.context().close();

  // 4. Toot target picker on a fresh-enough table? ROYAL1 already used. Skip — picker already showed toot button.
  await browser.close();
} finally { await stop(srv); }

if (fails.length) { console.error('\nFAILED:\n' + fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
console.log('\nall good, shots in', OUT);
