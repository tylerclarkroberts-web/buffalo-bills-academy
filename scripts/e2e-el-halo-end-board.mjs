// Browser check + screenshots for the end-of-round leaderboard and funny badges.
// Boots a throwaway DEV_LOGIN server. Does not deploy.
//   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-el-halo-end-board.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4040 + Math.floor(Math.random() * 9);
const B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-endboard-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const sid = r.headers.get('set-cookie').split(';')[0].split('=')[1];
  const av = await fetch(B + '/api/me/avatar', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `bba_sid=${sid}` }, body: JSON.stringify({ kind: 'gen', seed: name }) });
  if (!av.ok) throw new Error('avatar ' + av.status + ' ' + await av.text());
  return sid;
}
const st = (p) => p.evaluate(() => window.__elHalo.state());
const hook = (p, body) => p.evaluate((b) => fetch('/api/elhalo/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), body);
const until = async (p, fn, arg, ms = 8000) => { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); return true; } catch { return false; } };

async function open(browser, sid, s) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m,
  });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.t0 = Date.now(); p.errs = []; p.n = s.n; p.m = !!s.m; p.ctx = ctx;
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.errs.push('console: ' + m.text()); });
  const resp = await p.goto(`${B}/elhalo`, { waitUntil: 'domcontentloaded' });
  p.gotoStatus = resp?.status();
  try {
    await p.waitForSelector('[data-test=elhalo-page], [data-test=elhalo-room], [data-test=elhalo-lobby], [data-test=elhalo-start]', { timeout: 20000 });
    await p.waitForFunction(() => !!window.__elHalo, null, { timeout: 15000 });
  } catch (err) {
    console.error('open failed', p.url(), (await p.content()).slice(0, 800));
    throw err;
  }
  const rot = p.locator('[data-test=elhalo-rotate-dismiss]');
  if (await rot.count()) { try { await rot.click({ timeout: 800 }); } catch {} }
  return p;
}
async function start(p) {
  const tap = (sel) => (p.m ? p.tap(sel) : p.click(sel));
  await tap('[data-test=elhalo-start]');
  await until(p, () => ['lobby', 'playing'].includes(window.__elHalo.state().mode));
  if ((await st(p)).mode === 'lobby') {
    if (await p.isVisible('[data-test=elhalo-begin]')) await tap('[data-test=elhalo-begin]');
    else if (await p.isVisible('[data-test=elhalo-ready]')) await tap('[data-test=elhalo-ready]');
  }
  return !!(await st(p)).joined;
}
async function awaitPlay(p) {
  return until(p, () => window.__elHalo.state().mode === 'playing' && window.__elHalo.state().joined, null, 10000);
}

const TY_STATS = { kills: 14, melee: 5, alive: 180, dmg: 40, deaths: 1, revives: 0, revived: 0, chiles: 0, launches: 0, pvp: 0, heads: 3, score: 900 };
const JOE_STATS = { kills: 2, melee: 0, alive: 90, dmg: 220, deaths: 6, revives: 5, revived: 3, chiles: 2, launches: 4, pvp: 0, heads: 0, score: 260 };

async function forceOver(p, tyId, joeId) {
  return hook(p, { empty: true, wave: 4, clear: true, calm: true, stats: { [tyId]: TY_STATS, [joeId]: JOE_STATS }, over: true });
}

async function waitBoard(p) {
  return until(p, () => !!document.querySelector('[data-test=elhalo-leaderboard]'), null, 8000);
}

async function boardText(p) {
  return p.evaluate(() => document.querySelector('[data-test=elhalo-over]')?.innerText || '');
}

async function pair(browser, sizes) {
  const tySid = await login('Tyler', 'tyler.board@example.com');
  const joeSid = await login('Joe', 'joe.board@example.com');
  const ty = await open(browser, tySid, sizes.ty);
  const joe = await open(browser, joeSid, sizes.joe);
  check(await start(ty), `${sizes.ty.n} Tyler joined`);
  check(await start(joe), `${sizes.joe.n} Joe joined`);
  if ((await st(ty)).mode === 'lobby' && await ty.isVisible('[data-test=elhalo-begin]')) await (ty.m ? ty.tap('[data-test=elhalo-begin]') : ty.click('[data-test=elhalo-begin]'));
  if ((await st(joe)).mode === 'lobby' && await joe.isVisible('[data-test=elhalo-begin]')) await (joe.m ? joe.tap('[data-test=elhalo-begin]') : joe.click('[data-test=elhalo-begin]'));
  check(await awaitPlay(ty), `${sizes.ty.n} Tyler is in the match`);
  check(await awaitPlay(joe), `${sizes.joe.n} Joe is in the match`);
  const tyId = (await st(ty)).myId || (await hook(ty, {})).me?.id;
  const joeId = (await st(joe)).myId || (await hook(joe, {})).me?.id;
  check(!!tyId && !!joeId && tyId !== joeId, `${sizes.ty.n} two players in the match (${tyId} / ${joeId})`);
  const r = await forceOver(ty, tyId, joeId);
  check(!!r.last?.board, `${sizes.ty.n} hook ended the match`);
  check(await waitBoard(ty), `${sizes.ty.n} Tyler sees the leaderboard`);
  check(await waitBoard(joe), `${sizes.ty.n} Joe sees the leaderboard`);
  const text = await boardText(ty);
  for (const name of ['Puro Plomo', 'Vino a Ver', 'Nadie se Queda', 'Siempre en el Piso', 'Cae Como Iguana', 'A Machete Limpio', 'Se Comió el Chile', 'Aguantó Como Nopal', 'Se Lo Llevó el Agua', 'Esponja de Plomo']) {
    check(text.includes(name), `${sizes.ty.n} badge ${name}`);
  }
  check(text.includes('Tyler') && text.includes('Joe'), `${sizes.ty.n} both names on the board`);
  const padHidden = await ty.locator('[data-test=elhalo-pad]').isHidden();
  check(padHidden, `${sizes.ty.n} pad is hidden over the board`);
  const downHidden = await ty.evaluate(() => {
    const el = document.querySelector('[data-test=elhalo-down]');
    if (!el) return true;
    const s = getComputedStyle(el);
    return s.visibility === 'hidden' || s.opacity === '0' || !el.textContent.trim();
  });
  check(downHidden, `${sizes.ty.n} downed banner is hidden on the board`);
  const tight = await ty.evaluate(() => {
    const card = document.querySelector('[data-test=elhalo-over]');
    if (!card) return { ok: false };
    const r = card.getBoundingClientRect();
    return { ok: r.height <= window.innerHeight + 2 && r.width <= window.innerWidth + 2 && card.scrollHeight <= card.clientHeight + 8, h: r.height, sh: card.scrollHeight, ch: card.clientHeight, vh: window.innerHeight };
  });
  check(tight.ok, `${sizes.ty.n} board fits without scrolling (h=${tight.h}, scroll=${tight.sh}/${tight.ch}, vh=${tight.vh})`);
  return { ty, joe, tyId, joeId, text };
}

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(200); } }

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });

  const desk = await pair(browser, { ty: { w: 1280, h: 720, n: 'desktop' }, joe: { w: 1280, h: 720, n: 'desktop-joe' } });
  await sleep(250);
  await shot(desk.ty, 'desktop-leaderboard');
  await shot(desk.joe, 'desktop-leaderboard-joe');

  const tap = (p, sel) => (p.m ? p.tap(sel) : p.click(sel));
  await tap(desk.ty, '[data-test=elhalo-again]');
  const again = await until(desk.ty, () => !document.querySelector('[data-test=elhalo-leaderboard]') && window.__elHalo.state().phase !== 'over', null, 8000);
  check(again, 'OTRA RONDA leaves the board and starts a new round');
  await forceOver(desk.ty, desk.tyId, desk.joeId);
  check(await waitBoard(desk.ty), 'board comes back for SALIR');
  await tap(desk.ty, '[data-test=elhalo-over-back]');
  const left = await until(desk.ty, () => window.__elHalo.state().mode === 'title' || !window.__elHalo.state().joined, null, 8000);
  check(left, 'SALIR returns to the title');
  const deskErrs = desk.ty.errs.filter((e) => !/favicon/.test(e));
  check(deskErrs.length === 0, 'desktop console clean' + (deskErrs.length ? ': ' + deskErrs.slice(0, 3).join(' | ') : ''));
  await hook(desk.joe, { reset: true, hard: true }).catch(() => {});
  await desk.ty.ctx.close();
  await desk.joe.ctx.close();

  const phone = await pair(browser, { ty: { w: 844, h: 390, n: 'phone', m: true }, joe: { w: 1280, h: 720, n: 'phone-partner' } });
  await sleep(250);
  await shot(phone.ty, 'phone-leaderboard');
  const phoneErrs = phone.ty.errs.filter((e) => !/favicon/.test(e));
  check(phoneErrs.length === 0, 'phone console clean' + (phoneErrs.length ? ': ' + phoneErrs.slice(0, 3).join(' | ') : ''));
  await phone.ty.ctx.close();
  await phone.joe.ctx.close();

  await browser.close();
  srv.kill('SIGTERM');
  if (fails.length) { console.error('\nFAILED:\n' + fails.map((f) => ' - ' + f).join('\n')); process.exit(1); }
  console.log('ALL OK');
}

main().catch((err) => { console.error(err); try { srv.kill('SIGTERM'); } catch {} process.exit(1); });
