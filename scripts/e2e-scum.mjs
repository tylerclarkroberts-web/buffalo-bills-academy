// Async Scum in real browsers with made-up players (Ann, Bob, Cat, Dee and a bot): the lobby card, a table mid-round
// with avatars, the "You're skipped!" blast (live, on the skipped player's screen and someone else's) and the
// exchange (Scum's beg form, then the King reading the beg and picking cards to give back).
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core CHROME=/usr/bin/google-chrome OUT=dir node scripts/e2e-scum.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || path.join(os.tmpdir(), 'scum-shots');
const PORT = 3000 + Math.floor(Math.random() * 900) + 50;
const BASE = `http://127.0.0.1:${PORT}`;
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 800 };
fs.mkdirSync(OUT, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'scum-e2e-'));

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

// ---- made-up game state, written before the second boot ----
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
const stats = (k, s, sk) => ({ rounds: 1, king: k, scum: s, skips: sk, skipped: 0 });
function tables(P, now) {
  const seat = (n, st) => ({ id: P[n].id, name: n, joinedAt: now - 3600e3, stats: st });
  const bot = { id: 'scumbot-0', name: 'Dusty', bot: true, stats: stats(0, 1, 0) };
  // Table 1: round 2, Bob (King) led a pair of 9s; Ann (Queen) is up and holds two 9s too -> Cat gets skipped.
  const hands = deal({ 0: ['3h', '5c', '5d', '7s', '9c', '9d', 'Jh', 'Qc', 'Ah'] }, { 1: 6, 2: 8, 3: 7, 4: 10 }, ['9h', '9s']);
  const log = (seq, text, ev) => ({ seq, t: now - (40 - seq) * 60e3, round: 2, text, ev });
  const t1 = { code: 'SCUMMY', name: 'Porch Scum', hostId: P.Ann.id, hostName: 'Ann', createdAt: now - 7200e3, status: 'playing', settings: { turnSec: 86400, maxSeats: 6, bots: 1 }, turnSec: 86400, maxSeats: 6,
    seats: [seat('Ann', stats(0, 0, 1)), seat('Bob', stats(1, 0, 0)), seat('Cat', stats(0, 0, 0)), seat('Dee', stats(0, 0, 0)), bot, null],
    titles: { 1: 'king', 0: 'queen', 2: 'citizen', 3: 'babyScum', 4: 'scum' }, roundNo: 2,
    lastRound: { no: 1, finish: [{ seat: 1, name: 'Bob', title: 'king' }, { seat: 0, name: 'Ann', title: 'queen' }, { seat: 2, name: 'Cat', title: 'citizen' }, { seat: 3, name: 'Dee', title: 'babyScum' }, { seat: 4, name: 'Dusty', title: 'scum' }] },
    round: { no: 2, phase: 'play', order: [1, 0, 2, 3, 4], hands, pile: { cards: ['9h', '9s'], count: 2, rank: 9, seat: 1 }, owner: 1, turn: 0, finished: [], gone: [], exchange: null, lastPlay: { seat: 1, cards: ['9h', '9s'] }, skipped: null, turnAt: now - 600e3, deadline: now + 86400e3 - 600e3 },
    log: [log(30, 'Round 2: 52 cards dealt to 5.', { k: 'deal', no: 2 }), log(31, 'Bob leads round 2.', { k: 'lead', seat: 1 }), log(32, 'Bob plays a 4.', { k: 'play', seat: 1, cards: ['4c'] }), log(33, 'Ann plays a 6.', { k: 'play', seat: 0, cards: ['6h'] }),
      log(34, 'Cat plays a 6. Same rank: Dee is SKIPPED!', { k: 'play', seat: 2, cards: ['6s'], skip: 3 }), log(35, 'Dusty plays a K.', { k: 'play', seat: 4, cards: ['Kd'] }), log(36, 'Nobody can follow that. Dusty leads.', { k: 'clear', why: 'pass', seat: 4 }),
      log(37, 'Dusty passes the lead with a pair of 3s.', { k: 'play', seat: 4, cards: ['3c', '3d'] }), log(38, 'Bob plays two 9s.', { k: 'play', seat: 1, cards: ['9h', '9s'] })], seq: 38 };
  // Table 2: round 3 exchange. Dee is Scum and owes the King (Ann) her 2 best; Cat (Baby Scum) owes the Queen (Bob) one.
  const h2 = deal({}, { 0: 13, 1: 13, 2: 13, 3: 13 });
  if (!h2[3].some((c) => c[0] === 'A')) { /* make Dee's tribute hurt */ const a = h2[0].find((c) => c[0] === 'A') || h2[1].find((c) => c[0] === 'A'); if (a) { const from = h2[0].includes(a) ? 0 : 1; h2[from] = sort([...h2[from].filter((c) => c !== a), h2[3][0]]); h2[3] = sort([...h2[3].slice(1), a]); } }
  const t2 = { code: 'COURT7', name: 'Royal Court', hostId: P.Ann.id, hostName: 'Ann', createdAt: now - 9000e3, status: 'playing', settings: { turnSec: 3600, maxSeats: 4, bots: 0 }, turnSec: 3600, maxSeats: 4,
    seats: [seat('Ann', stats(2, 0, 3)), seat('Bob', stats(0, 0, 1)), seat('Cat', stats(0, 1, 2)), seat('Dee', stats(0, 1, 0))],
    titles: { 0: 'king', 1: 'queen', 2: 'babyScum', 3: 'scum' }, roundNo: 3,
    lastRound: { no: 2, finish: [{ seat: 0, name: 'Ann', title: 'king' }, { seat: 1, name: 'Bob', title: 'queen' }, { seat: 2, name: 'Cat', title: 'babyScum' }, { seat: 3, name: 'Dee', title: 'scum' }] },
    round: { no: 3, phase: 'exchange', order: [0, 1, 2, 3], hands: h2, pile: null, owner: null, turn: null, finished: [], gone: [], lastPlay: null, skipped: null,
      exchange: { pairs: [{ from: 3, to: 0, n: 2, beg: null, tribute: null, paid: false, gift: null, given: false, at: now - 60e3, due: now + 3540e3 }, { from: 2, to: 1, n: 1, beg: null, tribute: null, paid: false, gift: null, given: false, at: now - 60e3, due: now + 3540e3 }] } },
    log: [{ seq: 1, t: now - 60e3, round: 3, text: 'Round 2 over. King: Ann · Queen: Bob · Baby Scum: Cat · Scum: Dee.', ev: { k: 'round' } }], seq: 1 };
  return { tables: { SCUMMY: t1, COURT7: t2 } };
}

async function page(browser, who, view) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 2, isMobile: view === PHONE, hasTouch: view === PHONE, reducedMotion: 'no-preference' });
  const [name, value] = who.cookie.split('=');
  await ctx.addCookies([{ name, value, url: BASE }]);
  const p = await ctx.newPage(); p.on('pageerror', (e) => { console.log('pageerror', e.message); fails.push(`pageerror ${e.message}`); });
  return p;
}
const shot = (p, n) => p.screenshot({ path: path.join(OUT, `${n}.png`) });
const noScroll = async (p, label) => { const s = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, v: innerHeight, w: document.documentElement.scrollWidth, vw: innerWidth })); check(s.h <= s.v + 1 && s.w <= s.vw + 1, `${label}: no scroll (${s.w}x${s.h} in ${s.vw}x${s.v})`); };

let srv = await boot();
try {
  let P = await loginAll();
  for (const n of NAMES) await call(P[n].cookie, 'POST', '/api/me/avatar', { kind: 'gen', seed: `scum-demo-${n}` });
  await stop(srv);
  fs.writeFileSync(path.join(DATA, 'scum.json'), JSON.stringify(tables(P, Date.now())));
  srv = await boot();
  P = await loginAll();
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const keepHere = setInterval(() => { for (const n of ['Bob', 'Dee']) call(P[n].cookie, 'GET', '/api/scum/tables/SCUMMY').catch(() => {}); }, 1500);

  // 1. lobby card
  for (const [view, tag] of [[DESK, 'desktop'], [PHONE, 'phone']]) {
    const p = await page(browser, P.Ann, view);
    await p.goto(`${BASE}/`); await p.waitForTimeout(1200);
    if (tag === 'phone') { const g = p.getByRole('tab', { name: 'Games' }); if (await g.count()) await g.click(); await p.waitForTimeout(400); }
    check(await p.locator('[data-test=scum-card], [data-test=scum-go]').count() > 0, `${tag}: scum card in the lobby`);
    await shot(p, `${tag}-lobby-card`); await noScroll(p, `${tag} lobby`);
    await p.locator('[data-test=scum-go]').first().click(); await p.waitForTimeout(800);
    check(p.url().endsWith('/scum'), `${tag}: card opens /scum`); await shot(p, `${tag}-scum-lobby`); await noScroll(p, `${tag} /scum`);
    await p.context().close();
  }

  // 2. table mid-round, avatars, Ann to act; 3. Ann matches the 9s -> Cat is skipped (Cat on a phone, Ann on desktop)
  const ann = await page(browser, P.Ann, DESK); const cat = await page(browser, P.Cat, PHONE);
  await ann.goto(`${BASE}/scum/SCUMMY`); await cat.goto(`${BASE}/scum/SCUMMY`);
  await ann.waitForSelector('[data-test=scum-hand]'); await cat.waitForSelector('[data-test=scum-hand]'); await wait(2500);
  check(await ann.locator('.sc-seat .bust').count() === 5, 'five avatars round the felt');
  check(await ann.locator('[data-test=here-dot]').count() >= 2, 'presence dots for players at the table');
  await ann.click('[data-test=scum-card-9c]'); await ann.click('[data-test=scum-card-9d]');
  await shot(ann, 'desktop-table-midgame'); await noScroll(ann, 'desktop table');
  await shot(cat, 'phone-table-midgame'); await noScroll(cat, 'phone table');
  await ann.click('[data-test=scum-play]');
  await ann.waitForSelector('[data-test=scum-skip]'); await wait(1100); await shot(ann, 'desktop-skip-blast');
  await cat.waitForSelector('[data-test=scum-skip]', { timeout: 5000 }); await wait(1100); await shot(cat, 'phone-skip-blast-you');
  check(/YOU'RE/.test(await cat.locator('.sc-skip-txt').innerText()), 'skipped player sees YOU\'RE SKIPPED!');
  await wait(2500);
  check(await cat.locator('[data-test=scum-skip]').count() === 0, 'blast goes away on its own');
  await ann.context().close(); await cat.context().close();

  // 4. exchange: Dee (Scum) types a beg on her phone; Ann (King) reads it and picks two cards on desktop
  const dee = await page(browser, P.Dee, PHONE);
  await dee.goto(`${BASE}/scum/COURT7`); await dee.waitForSelector('[data-test=scum-beg]');
  await dee.fill('[data-test=scum-beg-input]', 'Your Majesty, I have three kids and a 4. Spare a face card?');
  await shot(dee, 'phone-exchange-beg'); await noScroll(dee, 'phone beg');
  await dee.click('[data-test=scum-tribute]'); await wait(800);
  const king = await page(browser, P.Ann, DESK);
  await king.goto(`${BASE}/scum/COURT7`); await king.waitForSelector('[data-test=scum-give]'); await wait(600);
  check(/three kids/.test(await king.locator('[data-test=scum-begbub]').innerText()), 'the King reads the beg');
  const cards = await king.locator('.sc-hc').all(); await cards[0].click(); await cards[1].click();
  await shot(king, 'desktop-exchange-give'); await noScroll(king, 'desktop give');
  const bob = await page(browser, P.Bob, PHONE);
  await bob.goto(`${BASE}/scum/COURT7`); await bob.waitForSelector('[data-test=scum-court]'); await wait(500);
  check(await bob.locator('[data-test=scum-begbub]').count() === 0, "the Queen doesn't see Scum's beg");
  await shot(bob, 'phone-exchange-court');
  await king.click('[data-test=scum-give-btn]'); await wait(600);
  await shot(dee, 'phone-exchange-got-back');
  clearInterval(keepHere);
  await browser.close();
} finally { await stop(srv); fs.rmSync(DATA, { recursive: true, force: true }); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good', `\nshots in ${OUT}`);
process.exit(fails.length ? 1 : 0);
