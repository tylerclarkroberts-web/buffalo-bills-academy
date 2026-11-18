// Sing me a song: dialogue bubbles, karaoke lyrics, tomato-eating King, skip/rewatch.
//   PLAYWRIGHT_DIR=/workspace/pw CHROME=/usr/bin/google-chrome OUT=/workspace/bba-scum-song-shots node scripts/e2e-scum-song.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { parseScript } from '../client/src/scum/songScript.js';
const script = parseScript(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../client/public/scum/song/script.txt'), 'utf8'));
const SONG_DIALOG = script.dialogue, SONG_LYRICS = script.lyrics, SONG_START = script.songStart;

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || path.join(os.tmpdir(), 'scum-song-shots');
const PORT = 3000 + Math.floor(Math.random() * 900) + 50;
const BASE = `http://127.0.0.1:${PORT}`;
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 800 };
fs.mkdirSync(OUT, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'scum-song-e2e-'));

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
  const t1 = { ...base, code: 'SONGIT', name: 'The Song Table', log: [{ seq: 1, t: now - 120e3, round: 2, text: 'Round 1 over. King: Ann · Queen: Bob · Commoner: Cat · Scum: Dee.', ev: { k: 'round' } }], seq: 1, royal: [] };
  const ev = { id: 'r-sing', round: 1, at: now - 30e3, cmd: 'sing', kingSeat: 0, scumSeat: 3, kingName: 'Ann', scumName: 'Dee', targetSeat: null, seen: { [P.Ann.id]: now - 20e3 } };
  const t2 = { ...JSON.parse(JSON.stringify({ ...base, round: { ...base.round, hands: deal({}, { 0: 7, 1: 8, 2: 9, 3: 10 }) } })), code: 'SONGME', name: 'Song Replay',
    log: [{ seq: 2, t: now - 30e3, round: 2, text: 'Ann commands Dee: Sing me a song.', ev: { k: 'royal', id: 'r-sing', cmd: 'sing', kingSeat: 0, scumSeat: 3 } }], seq: 2, royal: [ev] };
  return { tables: { SONGIT: t1, SONGME: t2 } };
}

async function page(browser, who, view, extra = {}) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 2, isMobile: view === PHONE, hasTouch: view === PHONE, reducedMotion: 'no-preference', ...extra });
  const [name, value] = who.cookie.split('=');
  await ctx.addCookies([{ name, value, url: BASE }]);
  await ctx.addInitScript(() => { window.__scumRoyalMs = 40000; const s = document.createElement('style'); s.textContent = '[data-test=fawn]{display:none!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); });
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
  for (const n of NAMES) await call(P[n].cookie, 'POST', '/api/me/avatar', { kind: 'gen', seed: `song-demo-${n}` });
  await stop(srv);
  fs.writeFileSync(path.join(DATA, 'scum.json'), JSON.stringify(tables(P, Date.now())));
  srv = await boot();
  P = await loginAll();
  const scriptRes = await fetch(BASE + '/scum/song/script.txt');
  check(scriptRes.ok && /KING:/.test(await scriptRes.text()), 'public script.txt is served at /scum/song/script.txt');
  const mp3 = await fetch(BASE + '/scum/song/song.mp3', { method: 'GET', headers: { Range: 'bytes=0-2' } });
  const mp3Type = mp3.headers.get('content-type') || '';
  check(!/audio|mpeg|mp3/i.test(mp3Type), `song.mp3 is optional and currently absent (got ${mp3.status} ${mp3Type})`);

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--hide-scrollbars'] });

  // 1. King picker shows Sing me a song (desktop + phone)
  for (const [view, tag] of [[DESK, 'desktop'], [PHONE, 'phone']]) {
    const p = await page(browser, P.Ann, view);
    await p.goto(`${BASE}/scum/SONGIT`);
    await p.waitForSelector('[data-test=scum-royal-cmd-sing]', { timeout: 8000 });
    check(await p.locator('[data-test=scum-royal-cmd-sing]').count() === 1, `${tag}: Sing me a song is in the picker`);
    check(await p.locator('[data-test=scum-royal-cmd-serenade]').count() === 0, `${tag}: old serenade command is gone`);
    const label = (await p.locator('[data-test=scum-royal-cmd-sing]').innerText()).trim();
    check(label === 'Sing me a song', `${tag}: picker label is "${label}"`);
    const cmds = await p.locator('[data-test^=scum-royal-cmd-]').count();
    check(cmds === 11, `${tag}: still 11 commands (${cmds})`);
    await shot(p, `${tag}-song-picker`);
    await noScroll(p, `${tag} song picker`);
    await p.context().close();
  }

  // 2. Ann issues the command; first spoken line
  const ann = await page(browser, P.Ann, DESK);
  await ann.goto(`${BASE}/scum/SONGIT`);
  await ann.waitForSelector('[data-test=scum-royal-cmd-sing]');
  await ann.click('[data-test=scum-royal-cmd-sing]');
  await ann.waitForSelector('[data-test=scum-royal-play][data-cmd=sing]', { timeout: 5000 });
  await ann.waitForSelector('[data-test=scum-royal-bubble][data-who=king]', { timeout: 3000 });
  const first = (await ann.locator('[data-test=scum-royal-bubble]').innerText()).trim();
  check(first === SONG_DIALOG[0].text, `first bubble: "${first}"`);
  check(await ann.locator('[data-test=scum-royal-play]').getAttribute('data-phase') === 'talk', 'phase is talk during dialogue');
  check(await ann.locator('[data-test=scum-royal-skip]').count() === 1, 'skip is on the song replay');
  await shot(ann, 'desktop-song-king-1');
  await noScroll(ann, 'desktop first bubble');

  await ann.waitForFunction((txt) => {
    const el = document.querySelector('[data-test=scum-royal-bubble][data-who=scum]');
    return el && el.textContent.includes(txt);
  }, SONG_DIALOG[1].text.slice(0, 20), { timeout: SONG_DIALOG[1].at + 2000 });
  check((await ann.locator('[data-test=scum-royal-bubble]').innerText()).includes('already heard enough'), 'scum reply bubble');
  await shot(ann, 'desktop-song-scum-reply');

  await ann.waitForFunction((txt) => {
    const el = document.querySelector('[data-test=scum-royal-bubble][data-who=king]');
    return el && el.textContent.includes(txt);
  }, "didn't ask", { timeout: SONG_START });
  check((await ann.locator('[data-test=scum-royal-bubble]').innerText()).includes("didn't ask"), 'king insists');
  await shot(ann, 'desktop-song-king-2');

  // 3. Song phase: karaoke, tomatoes, Scum steps aside
  await ann.waitForSelector('[data-test=scum-royal-play][data-phase=song]', { timeout: SONG_START + 2000 });
  await ann.waitForSelector('[data-test=scum-royal-karaoke]', { timeout: 2000 });
  const line0 = (await ann.locator('[data-test=scum-royal-karaoke]').innerText()).trim();
  check(line0 === SONG_LYRICS[0].text, `first lyric: "${line0}"`);
  check(await ann.locator('[data-test=scum-royal-tomatoes]').count() === 1, 'tomato mess is on the King');
  check(await ann.locator('.sc-seat.royal-sing, .sc-seat.royal-scum').count() >= 1, 'Scum has royal-sing class');
  check(await ann.locator('.sc-seat.royal-king-sing').count() === 1, 'King has tomato-eating class');
  await shot(ann, 'desktop-song-karaoke');
  const songDir = await frames(ann, 'song', 16, 400);
  await ann.locator('[data-test=scum-royal-skip]').click({ timeout: 5000 });
  await ann.waitForSelector('[data-test=scum-royal-play]', { state: 'detached', timeout: 4000 });
  try { gif(songDir, 'song.gif', 5); } catch (e) { console.log('     (no song gif: ' + e.message + ')'); }
  check(await ann.locator('[data-test=scum-royal-rewatch]').count() === 1, 'rewatch icon after the song');
  await shot(ann, 'desktop-song-rewatch-icon');
  await ann.locator('[data-test=scum-royal-rewatch]').click();
  await ann.waitForSelector('[data-test=scum-royal-play][data-cmd=sing]');
  check(await ann.locator('[data-test=scum-royal-bubble], [data-test=scum-royal-karaoke]').count() >= 1, 'rewatch starts the song scene again');
  await shot(ann, 'desktop-song-rewatch');
  await ann.locator('[data-test=scum-royal-skip]').click();
  await ann.context().close();

  // 4. Phone auto-replay (Bob missed it on SONGME), tight layout, skip
  const bob = await page(browser, P.Bob, PHONE);
  await bob.goto(`${BASE}/scum/SONGME`);
  await bob.waitForSelector('[data-test=scum-royal-play][data-cmd=sing]', { timeout: 8000 });
  await bob.waitForSelector('[data-test=scum-royal-bubble]', { timeout: 3000 });
  await shot(bob, 'phone-song-talk');
  await noScroll(bob, 'phone song talk');
  await bob.waitForSelector('[data-test=scum-royal-play][data-phase=song]', { timeout: SONG_START + 2000 });
  await bob.waitForSelector('[data-test=scum-royal-karaoke]', { timeout: 2000 });
  await shot(bob, 'phone-song-karaoke');
  await noScroll(bob, 'phone song karaoke');
  const phoneDir = await frames(bob, 'song-phone', 8, 450);
  try { gif(phoneDir, 'song-phone.gif', 5); } catch (e) { console.log('     (no phone gif: ' + e.message + ')'); }
  await bob.locator('[data-test=scum-royal-skip]').click({ timeout: 5000 });
  await bob.waitForSelector('[data-test=scum-royal-play]', { state: 'detached', timeout: 4000 });
  check(await bob.locator('[data-test=scum-royal-play]').count() === 0, 'skip dismisses the song replay');
  await bob.locator('[data-test=scum-royal-rewatch]').click();
  await bob.waitForSelector('[data-test=scum-royal-play][data-cmd=sing]');
  await shot(bob, 'phone-song-rewatch');
  await bob.locator('[data-test=scum-royal-skip]').click();
  await bob.context().close();

  await browser.close();
} finally { await stop(srv); }

if (fails.length) { console.error('\nFAILED:\n' + fails.map((x) => ' - ' + x).join('\n')); process.exit(1); }
console.log('\nall good, shots in', OUT);
