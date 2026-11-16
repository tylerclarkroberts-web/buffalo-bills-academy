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
    titles: { 1: 'king', 0: 'queen', 2: 'commoner', 3: 'babyScum', 4: 'scum' }, roundNo: 2,
    lastRound: { no: 1, finish: [{ seat: 1, name: 'Bob', title: 'king', pay: 100, net: 100 }, { seat: 0, name: 'Ann', title: 'queen', pay: 50, net: 50 }, { seat: 2, name: 'Cat', title: 'commoner', net: 0 }, { seat: 3, name: 'Dee', title: 'babyScum', pay: -5, net: -5 }, { seat: 4, name: 'Dusty', title: 'scum', pay: -10, net: -10, house: true }] }, kingPay: { [P.Bob.id]: 100, 'scumbot-0': 0 },
    round: { no: 2, phase: 'play', order: [1, 0, 2, 3, 4], hands, pile: { cards: ['9h', '9s'], count: 2, rank: 9, seat: 1 }, owner: 1, turn: 0, finished: [], gone: [], exchange: null, lastPlay: { seat: 1, cards: ['9h', '9s'] }, skipped: null, turnAt: now - 600e3, deadline: now + 86400e3 - 600e3 },
    log: [log(30, 'Round 2: 52 cards dealt to 5.', { k: 'deal', no: 2 }), log(31, 'Bob leads round 2.', { k: 'lead', seat: 1 }), log(32, 'Bob plays a 4.', { k: 'play', seat: 1, cards: ['4c'] }), log(33, 'Ann plays a 6.', { k: 'play', seat: 0, cards: ['6h'] }),
      log(34, 'Cat plays a 6. Same rank: Dee is SKIPPED!', { k: 'play', seat: 2, cards: ['6s'], skip: 3 }), log(35, 'Dee missed their turn; a stray bug plays their highest: a K.', { k: 'play', seat: 3, cards: ['Kd'], bug: { name: 'a stray bug', generic: true } }), log(36, 'Nobody can follow that. Dusty leads.', { k: 'clear', why: 'pass', seat: 4 }),
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
  // Table 3: Dee went from Scum to King and took Ann's $200 of King pay. Round 3 exchange is waiting on Ann (now Scum).
  const h3 = deal({}, { 0: 13, 1: 13, 2: 13, 3: 13 }, []);
  const t3 = { code: 'THRONE', name: 'Bucket to Throne', hostId: P.Bob.id, hostName: 'Bob', createdAt: now - 9000e3, status: 'playing', settings: { turnSec: 3600, maxSeats: 4, bots: 0 }, turnSec: 3600, maxSeats: 4,
    seats: [seat('Ann', { ...stats(2, 1, 1), cash: -10 }), seat('Bob', { ...stats(0, 0, 2), cash: 100 }), seat('Cat', { ...stats(0, 0, 0), cash: -10 }), seat('Dee', { ...stats(1, 1, 0), cash: 290 })],
    titles: { 3: 'king', 1: 'queen', 2: 'babyScum', 0: 'scum' }, roundNo: 3, kingPay: { [P.Ann.id]: 0, [P.Dee.id]: 100 },
    lastRound: { no: 2, finish: [{ seat: 3, name: 'Dee', title: 'king', pay: 100, bonus: 200, net: 300 }, { seat: 1, name: 'Bob', title: 'queen', pay: 50, net: 50 }, { seat: 2, name: 'Cat', title: 'babyScum', pay: -5, net: -5 }, { seat: 0, name: 'Ann', title: 'scum', pay: -10, dethroned: 200, net: -210 }],
      s2k: { seat: 3, name: 'Dee', from: 0, fromName: 'Ann', amt: 200, owed: 200, house: false } },
    round: { no: 3, phase: 'exchange', order: [3, 1, 2, 0], hands: h3, pile: null, owner: null, turn: null, finished: [], gone: [], lastPlay: null, skipped: null,
      exchange: { pairs: [{ from: 0, to: 3, n: 2, beg: null, tribute: null, paid: false, gift: null, given: false, at: now - 60e3, due: now + 3540e3 }, { from: 2, to: 1, n: 1, beg: null, tribute: null, paid: false, gift: null, given: false, at: now - 60e3, due: now + 3540e3 }] } },
    log: [{ seq: 1, t: now - 70e3, round: 2, text: 'Round 2 over. King: Dee (+$100) · Queen: Bob (+$50) · Baby Scum: Cat (-$5) · Scum: Ann (-$10).', ev: { k: 'round' } },
      { seq: 2, t: now - 69e3, round: 2, text: "FROM SCUM TO KING! Dee takes Ann's King payouts: $200.", ev: { k: 's2k', seat: 3, from: 0, amt: 200 } }], seq: 2 };
  // Table 4: Cat finished Scum with her last dollars: she sits out (seat saved) while Ann, Bob and Dusty play on.
  const h4 = deal({}, { 0: 18, 1: 17, 3: 17 });
  const t4 = { code: 'MINES1', name: 'Dry Gulch', hostId: P.Bob.id, hostName: 'Bob', createdAt: now - 9000e3, status: 'playing', settings: { turnSec: 3600, maxSeats: 4, bots: 1 }, turnSec: 3600, maxSeats: 4,
    seats: [seat('Ann', stats(1, 0, 0)), seat('Bob', stats(0, 0, 0)), { ...seat('Cat', { ...stats(0, 1, 0), cash: -10 }), broke: true }, { ...bot, stats: stats(0, 0, 0) }],
    titles: { 0: 'king', 1: 'queen', 3: 'babyScum', 2: 'scum' }, roundNo: 2,
    lastRound: { no: 1, finish: [{ seat: 0, name: 'Ann', title: 'king', pay: 100, net: 100 }, { seat: 1, name: 'Bob', title: 'queen', pay: 50, net: 50 }, { seat: 3, name: 'Dusty', title: 'babyScum', pay: -5, net: -5, house: true }, { seat: 2, name: 'Cat', title: 'scum', pay: -10, net: -10 }] },
    round: { no: 2, phase: 'play', order: [0, 1, 3], hands: h4, pile: null, owner: null, turn: 0, finished: [], gone: [], exchange: null, lastPlay: null, skipped: null, turnAt: now - 60e3, deadline: now + 3540e3 },
    log: [{ seq: 1, t: now - 70e3, round: 1, text: "Cat can't cover the $10 Scum dues. Off to the Acid Mines; the seat is saved.", ev: { k: 'broke', seat: 2 } }], seq: 1 };
  // Table 5: Ann led a pair of 7s, everyone passed: she can play on her own set or pass to clear.
  const h5 = deal({ 0: ['4c', '8h', '8d', 'Tc', 'Qs', 'Qh'] }, { 1: 14, 2: 15, 3: 15 }, ['7h', '7c']);
  const t5 = { code: 'PLAYON', name: 'Last One Standing', hostId: P.Ann.id, hostName: 'Ann', createdAt: now - 9000e3, status: 'playing', settings: { turnSec: 86400, maxSeats: 4, bots: 0 }, turnSec: 86400, maxSeats: 4,
    seats: [seat('Ann', stats(1, 0, 0)), seat('Bob', stats(0, 0, 0)), seat('Cat', stats(0, 1, 0)), seat('Dee', stats(0, 0, 0))],
    titles: { 0: 'king', 1: 'queen', 3: 'babyScum', 2: 'scum' }, roundNo: 2,
    lastRound: { no: 1, finish: [{ seat: 0, name: 'Ann', title: 'king', pay: 100, net: 100 }, { seat: 1, name: 'Bob', title: 'queen', pay: 50, net: 50 }, { seat: 3, name: 'Dee', title: 'babyScum', pay: -5, net: -5 }, { seat: 2, name: 'Cat', title: 'scum', pay: -10, net: -10 }] },
    round: { no: 2, phase: 'play', order: [0, 1, 3, 2], hands: h5, pile: { cards: ['7h', '7c'], count: 2, rank: 7, seat: 0 }, owner: 0, playOn: true, turn: 0, finished: [], gone: [], exchange: null, lastPlay: { seat: 0, cards: ['7h', '7c'] }, skipped: null, turnAt: now - 60e3, deadline: now + 86340e3 },
    log: [{ seq: 1, t: now - 300e3, round: 2, text: 'Ann leads round 2.', ev: { k: 'lead', seat: 0 } }, { seq: 2, t: now - 240e3, round: 2, text: 'Ann plays two 7s.', ev: { k: 'play', seat: 0, cards: ['7h', '7c'], left: 6 } },
      { seq: 3, t: now - 200e3, round: 2, text: 'Bob passes.', ev: { k: 'pass', seat: 1 } }, { seq: 4, t: now - 150e3, round: 2, text: 'Dee passes.', ev: { k: 'pass', seat: 3 } }, { seq: 5, t: now - 100e3, round: 2, text: 'Cat passes.', ev: { k: 'pass', seat: 2 } },
      { seq: 6, t: now - 99e3, round: 2, text: 'Everyone passed. Ann can keep playing on it or pass to clear.', ev: { k: 'playon', seat: 0 } }], seq: 6 };
  return { tables: { SCUMMY: t1, COURT7: t2, THRONE: t3, MINES1: t4, PLAYON: t5 } };
}

async function page(browser, who, view) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 2, isMobile: view === PHONE, hasTouch: view === PHONE, reducedMotion: 'no-preference' });
  const [name, value] = who.cookie.split('=');
  await ctx.addCookies([{ name, value, url: BASE }]);
  // The wandering faun wears a real friend's face: keep him out of PR screenshots.
  await ctx.addInitScript(() => { const s = document.createElement('style'); s.textContent = '[data-test=fawn]{display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); });
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
  // Cat paid her last $10 as Scum: broke until a shift in the mines.
  const pf = path.join(DATA, 'players.json'); const pl = JSON.parse(fs.readFileSync(pf, 'utf8')); pl[P.Cat.id].bankroll = 0; fs.writeFileSync(pf, JSON.stringify(pl));
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
    check((await p.locator('.lb-scum .sp-desc, .sc-promo .sp-desc, [data-test=scum-go]').first().locator('xpath=ancestor::*[.//*[contains(@class,"sp-desc")]][1]').locator('.sp-desc').first().innerText()) === "You're skipped!", `${tag}: card line reads "You're skipped!"`);
    check(/single deck/i.test(await p.locator('body').innerText()) || tag === 'phone', `${tag}: card tag says single deck`);
    await shot(p, `${tag}-lobby-card`); await noScroll(p, `${tag} lobby`);
    await p.locator('[data-test=scum-go]').first().click(); await p.waitForTimeout(800);
    check(p.url().endsWith('/scum'), `${tag}: card opens /scum`); await shot(p, `${tag}-scum-lobby`); await noScroll(p, `${tag} /scum`);
    await p.context().close();
  }

  // 2. table mid-round, avatars, Ann to act; 3. Ann matches the 9s -> Cat is skipped (Cat on a phone, Ann on desktop)
  const ann = await page(browser, P.Ann, DESK); const cat = await page(browser, P.Cat, PHONE);
  await ann.goto(`${BASE}/scum/SCUMMY`); await cat.goto(`${BASE}/scum/SCUMMY`);
  await ann.waitForSelector('[data-test=scum-hand]'); await cat.waitForSelector('[data-test=scum-hand]');
  // Cat was last here before Cat's own 6 skipped Dee: coming back replays the missed moves (with that skip).
  await cat.evaluate(() => localStorage.setItem('bba.scum.seen.SCUMMY', '33')); await cat.reload();
  await cat.waitForSelector('[data-test=scum-catchup]', { timeout: 5000 }).then(() => check(true, 'missed moves replay on return'), () => check(false, 'missed moves replay on return'));
  await cat.waitForSelector('[data-test=scum-skip]', { timeout: 5000 }).then(() => check(true, 'the missed skip plays in the catch-up'), () => check(false, 'the missed skip plays in the catch-up'));
  await shot(cat, 'phone-catchup-replay');
  await cat.waitForSelector('[data-test=scum-catchup]', { state: 'detached', timeout: 15000 });
  await wait(1500);
  check(await ann.locator('.sc-seat .bust').count() === 5, 'five avatars round the felt');
  check(await ann.locator('[data-test=here-dot]').count() >= 2, 'presence dots for players at the table');
  const edge = { position: { x: 8, y: 14 } };
  const order = await ann.locator('[data-test=scum-hand] [data-test^=scum-card-]').evaluateAll((els) => els.map((e) => e.dataset.test.slice(10)));
  const RK = '23456789TJQKA'; check(order.length === 9 && order.every((c, k) => !k || RK.indexOf(order[k - 1][0]) <= RK.indexOf(c[0])) && order.at(-1) === 'Ah', `hand auto-organized low to high, aces last (${order.join(' ')})`);
  await ann.click('[data-test=scum-card-Ah]', edge);
  check(await ann.locator('[data-test=scum-play]').isDisabled() && /2 aces/.test(await ann.locator('[data-test=scum-play]').innerText()), 'one ace cannot clear a pair (needs 2 aces)');
  await ann.click('[data-test=scum-card-Ah]', edge);
  await ann.click('[data-test=scum-card-9c]', edge); await ann.click('[data-test=scum-card-9d]', edge);
  await shot(ann, 'desktop-table-midgame'); await noScroll(ann, 'desktop table');
  await shot(cat, 'phone-table-midgame'); await noScroll(cat, 'phone table');
  // Opponents' hands are real face-down cards, one per card left (counts only; never the cards themselves).
  const fans = await cat.locator('[data-test=scum-fan]').evaluateAll((els) => els.map((e) => [Number(e.dataset.n), e.querySelectorAll('.sc-back').length]));
  check(fans.length === 4 && fans.every(([n, k]) => n === k && n > 0), `card-back fans by each opponent (${fans.map((f) => f[0]).join(',')})`);
  const annFan = cat.locator('[data-test=scum-seat-0] [data-test=scum-fan]');
  check(await annFan.getAttribute('data-n') === '9', 'Ann shows 9 face-down cards');
  await ann.click('[data-test=scum-play]');
  await cat.waitForFunction(() => document.querySelector('[data-test=scum-seat-0] [data-test=scum-fan]')?.dataset.n === '7', null, { timeout: 5000 }).then(() => check(true, 'Ann’s fan drops to 7 after her pair'), () => check(false, 'Ann’s fan drops to 7 after her pair'));
  await Promise.all([
    (async () => { await ann.waitForSelector('[data-test=scum-skip]'); await wait(1000); await shot(ann, 'desktop-skip-blast'); })(),
    (async () => {
      await cat.waitForSelector('[data-test=scum-skip]', { timeout: 5000 });
      check(/YOU'RE/.test(await cat.locator('.sc-skip-txt').innerText()) && (await cat.locator('.sc-blast.me').count()) === 1, 'skipped player sees YOU\'RE SKIPPED!');
      await wait(700); await shot(cat, 'phone-skip-blast-you');
    })(),
  ]);
  await wait(3000);
  check(await cat.locator('[data-test=scum-skip]').count() === 0, 'blast goes away on its own');
  await ann.context().close(); await cat.context().close();

  // play on: everyone passed on Ann's 7s: she can keep playing or pass to clear (desktop), Bob watches (phone)
  const annP = await page(browser, P.Ann, DESK); const bobP = await page(browser, P.Bob, PHONE);
  await annP.goto(`${BASE}/scum/PLAYON`); await bobP.goto(`${BASE}/scum/PLAYON`);
  await annP.waitForSelector('[data-test=scum-hand]'); await bobP.waitForSelector('[data-test=scum-hand]'); await wait(900);
  check(/Everyone passed — keep playing or pass to clear/.test(await annP.locator('[data-test=scum-status]').innerText()), 'play-on hint for the last player');
  check(/Pass & clear/.test(await annP.locator('[data-test=scum-pass]').innerText()) && await annP.locator('[data-test=scum-pass]').isEnabled(), '"Pass & clear" is offered');
  check(/can play on or clear/.test(await bobP.locator('[data-test=scum-status]').innerText()), 'others see she can play on');
  await annP.click('[data-test=scum-card-8h]', { position: { x: 8, y: 14 } }); await annP.click('[data-test=scum-card-8d]', { position: { x: 8, y: 14 } });
  await shot(annP, 'desktop-play-on'); await noScroll(annP, 'desktop play-on');
  await shot(bobP, 'phone-play-on-watching'); await noScroll(bobP, 'phone play-on');
  await annP.click('[data-test=scum-play]'); await wait(1200);
  check(/Bob/.test(await annP.locator('[data-test=scum-status]').innerText()), 'she played on (8s on her own 7s); Bob gets another chance');
  await annP.context().close(); await bobP.context().close();
  const annC = await page(browser, P.Ann, PHONE); await annC.goto(`${BASE}/scum/PLAYON`); await annC.waitForSelector('[data-test=scum-hand]');
  await call(P.Bob.cookie, 'POST', '/api/scum/tables/PLAYON/pass'); await call(P.Dee.cookie, 'POST', '/api/scum/tables/PLAYON/pass'); await call(P.Cat.cookie, 'POST', '/api/scum/tables/PLAYON/pass');
  await annC.waitForFunction(() => /keep playing or pass to clear/.test(document.querySelector('[data-test=scum-status]')?.innerText || ''), null, { timeout: 6000 }).then(() => check(true, 'back to Ann after everyone passes again'), () => check(false, 'back to Ann after everyone passes again'));
  await wait(400); await shot(annC, 'phone-play-on'); await noScroll(annC, 'phone play-on (you)');
  await annC.click('[data-test=scum-pass]'); await wait(1200);
  check(/Your lead/.test(await annC.locator('[data-test=scum-status]').innerText()), 'pass & clear: she leads fresh');
  await annC.context().close();

  // small phone and phone on its side
  for (const [vp, tag] of [[{ width: 375, height: 667 }, 'small-phone'], [{ width: 844, height: 390 }, 'phone-landscape']]) {
    const p = await page(browser, P.Dee, vp); await p.goto(`${BASE}/scum/SCUMMY`); await p.waitForSelector('[data-test=scum-hand]'); await wait(1200);
    await noScroll(p, `${tag} table`); await shot(p, `${tag}-table`); await p.context().close();
  }

  // 4. exchange: Dee (Scum) types a beg on her phone; Ann (King) reads it and picks two cards on desktop
  const dee = await page(browser, P.Dee, PHONE);
  await dee.goto(`${BASE}/scum/COURT7`); await dee.waitForSelector('[data-test=scum-beg]');
  await dee.fill('[data-test=scum-beg-input]', 'Your Majesty, I have three kids and a 4. Spare a face card?');
  await shot(dee, 'phone-exchange-beg'); await noScroll(dee, 'phone beg');
  await dee.click('[data-test=scum-tribute]'); await wait(800);
  const king = await page(browser, P.Ann, DESK);
  await king.goto(`${BASE}/scum/COURT7`); await king.waitForSelector('[data-test=scum-give]'); await wait(600);
  check(/three kids/.test(await king.locator('[data-test=scum-begbub]').innerText()), 'the King reads the beg');
  const cards = await king.locator('.sc-hc').all(); await cards[0].click({ position: { x: 8, y: 14 } }); await cards[1].click({ position: { x: 8, y: 14 } });
  await shot(king, 'desktop-exchange-give'); await noScroll(king, 'desktop give');
  const bob = await page(browser, P.Bob, PHONE);
  await bob.goto(`${BASE}/scum/COURT7`); await bob.waitForSelector('[data-test=scum-court]'); await wait(500);
  check(await bob.locator('[data-test=scum-begbub]').count() === 0, "the Queen doesn't see Scum's beg");
  await shot(bob, 'phone-exchange-court');
  await king.click('[data-test=scum-give-btn]'); await wait(600);
  await shot(dee, 'phone-exchange-got-back');

  // 5. your bug covered a missed turn: Dee comes back to the replay with the bug note
  const deeB = await page(browser, P.Dee, PHONE);
  await deeB.goto(`${BASE}/scum/SCUMMY`); await deeB.waitForSelector('[data-test=scum-arena]');
  await deeB.evaluate(() => localStorage.setItem('bba.scum.seen.SCUMMY', '34')); await deeB.reload();
  await deeB.waitForSelector('[data-test=scum-bugnote]', { timeout: 6000 }).then(() => check(true, 'replay shows the bug that played a missed turn'), () => check(false, 'replay shows the bug that played a missed turn'));
  check(/Your bug played for you/.test(await deeB.locator('[data-test=scum-bugnote]').innerText().catch(() => '')), 'it says "Your bug played for you"');
  await wait(250); await shot(deeB, 'phone-bug-played'); await deeB.context().close();

  // 6. From Scum to King: Dee (new King) on her phone, Ann (dethroned) on desktop; then the round's payouts
  const deeK = await page(browser, P.Dee, PHONE); const annK = await page(browser, P.Ann, DESK);
  for (const p of [deeK, annK]) { await p.goto(`${BASE}/scum/THRONE`); await p.waitForSelector('[data-test=scum-arena]'); await p.evaluate(() => localStorage.setItem('bba.scum.seen.THRONE', '1')); }
  await Promise.all([deeK.reload(), annK.reload()]);
  await Promise.all([
    deeK.waitForSelector('[data-test=scum-s2k]', { timeout: 6000 }).then(async () => { check(/You take Ann's King payouts: \+\$200/.test(await deeK.locator('[data-test=scum-s2k]').innerText()), 'From Scum to King! on the new King’s phone'); await wait(900); await shot(deeK, 'phone-scum-to-king'); }, () => check(false, 'From Scum to King! on the new King’s phone')),
    annK.waitForSelector('[data-test=scum-s2k]', { timeout: 6000 }).then(async () => { await wait(900); await shot(annK, 'desktop-scum-to-king'); }, () => check(false, 'dethroned King sees it too')),
  ]);
  await annK.waitForSelector('[data-test=scum-s2k]', { state: 'detached', timeout: 8000 }); await deeK.waitForSelector('[data-test=scum-s2k]', { state: 'detached', timeout: 8000 });
  const pays = await annK.locator('[data-test=scum-standpay]').allInnerTexts();
  check(pays.join(' ') === '+$300 +$50 −$5 −$210', `round payouts in the standings (${pays.join(' ')})`);
  check(await annK.locator('[data-test=scum-s2k-line]').count() === 1, 'the standings call out the Scum-to-King haul');
  check(await annK.locator('[data-test=scum-paychip]').count() === 4, '+$/−$ chips by the avatars');
  await shot(annK, 'desktop-round-payouts'); await noScroll(annK, 'desktop payouts');
  await shot(deeK, 'phone-round-payouts'); await noScroll(deeK, 'phone payouts');
  await deeK.context().close(); await annK.context().close();

  // 7. mines lockout: Cat is broke; her seat is saved and the prompt sends her to the mines
  const catM = await page(browser, P.Cat, PHONE);
  await catM.goto(`${BASE}/scum/MINES1`); await catM.waitForSelector('[data-test=scum-broke]', { timeout: 6000 }).then(() => check(true, 'broke player gets the mines prompt'), () => check(false, 'broke player gets the mines prompt'));
  check(await catM.locator('[data-test=scum-minechip]').count() === 1, 'her seat is saved and marked ⛏ mines');
  await wait(400); await shot(catM, 'phone-mines-lockout'); await noScroll(catM, 'phone mines lockout');
  await catM.click('[data-test=scum-mines]'); await wait(1500);
  check(/\/mines/.test(catM.url()), `the button goes to the Acid Mines (${catM.url().replace(BASE, '')})`);
  await catM.context().close();
  const annM = await page(browser, P.Ann, DESK); await annM.goto(`${BASE}/scum/MINES1`); await annM.waitForSelector('[data-test=scum-hand]'); await wait(600);
  await shot(annM, 'desktop-mines-lockout'); await noScroll(annM, 'desktop mines lockout'); await annM.context().close();
  clearInterval(keepHere);
  await browser.close();
} finally { await stop(srv); fs.rmSync(DATA, { recursive: true, force: true }); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good', `\nshots in ${OUT}`);
process.exit(fails.length ? 1 : 0);
