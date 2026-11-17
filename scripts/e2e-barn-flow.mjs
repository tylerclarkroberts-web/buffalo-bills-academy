// The whole Barn as people use it, with motion on: an egg's countdown, feeding/playing/misting a bug (the
// cooldown shows on the button), a challenge sent on desktop and accepted on a phone, the live turn-based fight
// with a lined-up move, the payout, any knockout at the nurse, and the announcer clips. Fails on any page error.
//   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-barn-flow.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4230 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-barnflow-'));
const INCUBATE = 12000;
const ENV = { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BARN_TEST_EGG: '1', BARN_INCUBATE_MS: String(INCUBATE), BARN_TEST_SPECIES: '1', BARN_TEST_XP: '400' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'ignore', 'inherit'] });
for (let i = 0; i < 80; i++) { try { if ((await fetch(B + '/api/health')).status < 500) break; } catch { /* starting */ } await wait(150); }
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const PHONE = { w: 390, h: 844, m: true }, DESK = { w: 1280, h: 800 };
async function login(name) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name.toLowerCase()}@flow.test` }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, u, b) => { const x = await fetch(B + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); return x.json(); };
  await call('POST', '/me/avatar', { kind: 'gen', seed: name });
  return { name, sid: cookie.split('=')[1], post: (u, b) => call('POST', u, b || {}), get: (u) => call('GET', u) };
}
async function egg(me) { const s = await me.post('/mines/start', { rulesVersion: 2 }); await me.post('/mines/egg', { shiftId: s.shiftId }); await me.post('/mines/quit', { shiftId: s.shiftId }); }
async function page(browser, me, vp, url) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1 });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('bba.barnSound', '1'); } catch { /* private */ } }); // the announcer follows the sound switch
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage(); p.errs = []; p.clips = [];
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') p.errs.push('console: ' + m.text()); });
  p.on('response', (r) => { if (r.url().includes('/announcer/')) p.clips.push(r.status()); });
  await p.goto(B + url); return p;
}
const alive = (p) => p.evaluate(() => !!document.querySelector('[data-test=barn]'));
let browser;
try {
  const A = await login('Hank'), Bb = await login('Gus'), C = await login('Opal');
  await egg(A); await egg(Bb);
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  // 1. An egg in the barn shows its countdown.
  const e = await page(browser, A, PHONE, '/barn');
  await e.waitForSelector('[data-test=barn-egg], [data-test=barn]', { timeout: 8000 }).catch(() => null); await wait(1200);
  check(await alive(e) && !!(await e.$('[data-test=hatch-left]')), `egg: the barn draws the egg and its countdown (${e.errs.join(' | ') || 'no errors'})`);
  await shot(e, '01-egg-phone');
  await e.context().close();
  await wait(INCUBATE + 500); await A.get('/barn'); await Bb.get('/barn');
  await A.post('/dev/species', { id: 'manticora' }); await Bb.post('/dev/species', { id: 'phanaeus' });
  // 2. Care: the cooldown appears on the button that was just used.
  for (const [who, vp, n] of [[A, DESK, 'desktop'], [Bb, PHONE, 'phone']]) {
    const p = await page(browser, who, vp, '/barn');
    await p.waitForSelector('[data-test=act-feed]', { timeout: 8000 });
    await p.click('[data-test=act-feed]'); await wait(1500);
    check(await alive(p) && !p.errs.length, `${n}: feeding keeps the barn up (${p.errs.join(' | ') || 'no errors'})`);
    if (await alive(p)) { check(/\d+[smh]/.test(await p.textContent('[data-test=act-feed]')), `${n}: Feed shows its cooldown`); await p.click('[data-test=act-play]'); await wait(800); check(await alive(p), `${n}: playing too`); }
    await shot(p, `02-after-feed-${n}`);
    await p.context().close();
  }
  // 3. Challenge on desktop, accept on the phone, fight it out live.
  await C.get('/barn');
  const hp = await page(browser, A, DESK, '/barn');
  await hp.waitForSelector('[data-test=ring-toggle]'); await hp.click('[data-test=ring-toggle]');
  await hp.click('[data-test=challenge-open]'); await hp.fill('[data-test=challenge-stake]', '25'); await hp.click('[data-test=challenge-send]');
  await hp.waitForSelector('[data-test=challenge-withdraw]', { timeout: 8000 });
  check(await alive(hp) && !hp.errs.length, `desktop: challenge sent (${hp.errs.join(' | ') || 'no errors'})`);
  await shot(hp, '03-challenge-sent-desktop');
  const gp = await page(browser, Bb, PHONE, '/barn');
  await gp.waitForSelector('[data-test=challenge-accept]', { timeout: 8000 });
  await shot(gp, '04-challenge-incoming-phone');
  const before = (await Bb.get('/barn')).bankroll;
  await gp.click('[data-test=challenge-accept]');
  await gp.waitForSelector('[data-test=bout][data-live="1"]', { timeout: 10000 });
  await gp.waitForSelector('[data-test=bout-panel] .bout-move', { timeout: 10000 });
  await gp.click('[data-test=bout-panel] .bout-move'); await wait(600);
  check(!!(await gp.$('[data-test=bout-queued]')), 'phone: a tapped move is lined up');
  await shot(gp, '05-live-fight-phone');
  await hp.waitForSelector('[data-test=bout]', { timeout: 12000 }).catch(() => null);
  check(!!(await hp.$('[data-test=bout]')), 'desktop: the challenger is pulled into the same live fight');
  await shot(hp, '06-live-fight-desktop');
  await gp.waitForSelector('[data-test=bout][data-done="1"]', { timeout: 240000 });
  await wait(1500);
  const result = await gp.getAttribute('[data-test=bout]', 'data-result');
  check(['won', 'lost', 'draw'].includes(result), `phone: the fight finished (${result})`);
  check(!!(await gp.$('[data-test=bout-payment]')), `phone: payment line: ${await gp.textContent('[data-test=bout-payment]').catch(() => '-')}`);
  const after = (await Bb.get('/barn')).bankroll;
  check(result === 'won' ? after > before : result === 'lost' ? after < before : after === before, `phone: bankroll ${before} → ${after} matches a ${result}`);
  await shot(gp, '07-fight-done-phone');
  await hp.waitForSelector('[data-test=bout][data-done="1"]', { timeout: 20000 }).catch(() => null);
  await shot(hp, '08-fight-done-desktop');
  check(gp.clips.length > 0 && gp.clips.every((s) => s === 200 || s === 206), `announcer clips load (${gp.clips.join(',')})`);
  check(!gp.errs.length && !hp.errs.length, `no page errors in the fight (${[...gp.errs, ...hp.errs].join(' | ') || 'none'})`);
  // 4. Only a knockout needs the nurse.
  const [loser, lp] = result === 'won' ? [A, hp] : [Bb, gp];
  if ((await loser.get('/barn')).pen.fainted) {
    await lp.click('[data-test=bout-close]').catch(() => null); await wait(500);
    await lp.goto(B + '/barn/center'); await lp.waitForSelector('[data-test=bc-talk]');
    await lp.click('[data-test=bc-talk]'); await lp.waitForSelector('[data-test=bc-portrait]');
    for (let i = 0; i < 14 && !(await lp.$('[data-test=bc-yes]')); i++) { await lp.click('[data-test=bc-dialogue]', { position: { x: 30, y: 30 } }); await wait(450); }
    await lp.click('[data-test=bc-yes]'); await wait(6000);
    const v = await loser.get('/barn');
    check(!v.pen.fainted && v.pen.health === 100, `nurse healed the loser (${v.pen.hp}/${v.pen.maxHp})`);
    await lp.goto(B + '/barn'); await lp.waitForSelector('[data-test=barn-creature]', { timeout: 8000 }).catch(() => null);
    check(await alive(lp) && !lp.errs.length, `barn after the nurse (${lp.errs.join(' | ') || 'no errors'})`);
    await shot(lp, '09-barn-after-nurse');
  }
} catch (e) { console.error(e); fails.push(String(e.message)); }
finally { await browser?.close(); srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
