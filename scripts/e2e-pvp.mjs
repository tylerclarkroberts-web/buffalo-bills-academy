// Real browsers in the same daily mine. Boots a throwaway server with the PvP test hook
// (greenhorn rules and the clock-in grace off), clocks everyone in, walks them to the same tunnel by the server's
// own speed rules, and checks: you can see the other miner, the ASSASSINATE prompt shows behind an unaware miner,
// meeting face to face starts a bug fight in the ring on both screens, the battle plays out, and the loser gets the
// receipt. The winner can ambush again, using touch and keyboard across two encounters.
// npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-pvp.mjs
import { once } from 'node:events';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { createApp } from '../server/app.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const OUT = process.env.OUT;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pvp-'));
const staticDir = path.join(dir, 'dist');
fs.symlinkSync(path.resolve(import.meta.dirname, '../dist'), staticDir, 'junction');
// This day's mine has a straight, wild-free tunnel four tiles east of the elevator.
const now = () => Date.UTC(2026, 10, 17, 18) + Math.floor(performance.now());
const { app, service, shutdown } = createApp({ dataDir: dir, staticDir, now, devLogin: true, env: { PVP_TEST: '1', PVP_TEST_GRACE_MS: '0' } });
const srv = app.listen(0, '127.0.0.1');
await once(srv, 'listening');
const B = `http://127.0.0.1:${srv.address().port}`;
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const { id } = await r.json();
  const avatar = await fetch(B + '/api/me/avatar', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ kind: 'gen', seed: name }) });
  if (!avatar.ok) throw new Error('Could not create the test miner avatar');
  return { name, id, sid: cookie.split('=')[1] };
}
async function open(browser, me, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(`${B}/mines`);
  await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas'); await p.waitForFunction(() => !!window.__acidMine);
  await p.waitForTimeout(600); return p;
}
const east = -Math.PI / 2;
async function walk(p, toX) {
  const from = await p.evaluate(() => window.__acidMine.pos.x / 2.2);
  const steps = Math.max(1, Math.ceil(Math.abs(toX - from) / .25));
  for (let i = 1; i <= steps; i++) {
    await p.evaluate(([x, yaw]) => {
      const mine = window.__acidMine;
      mine.pos.set(x * 2.2, 2.2); mine.yaw = yaw;
    }, [from + (toX - from) * i / steps, toX < from ? -east : east]);
    await wait(125);
  }
  await wait(600);
}
let browser;
try {
  const ann = await login('Ann', 'ann@pvp.test'), bob = await login('Bob', 'bob@pvp.test'), cal = await login('Cal', 'cal@pvp.test');
  service.barn.adopt(ann.id, { wildId: 'test-beetle', battleId: 'test-catch', species: 'brachinus', level: 10 }); // Bob borrows the Foreman's.
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const phone = { w: 360, h: 640, m: true }, desktop = { w: 1280, h: 720 };
  const A = await open(browser, ann, phone);
  const Bp = await open(browser, bob, desktop);
  const grid = p => p.evaluate(() => window.__acidMine.maze.grid);
  check(JSON.stringify(await grid(A)) === JSON.stringify(await grid(Bp)), 'both miners got the same maze today');
  const lift = 1, approach = 4, behind = 4.75, target = 5;
  await walk(Bp, target);
  await walk(A, approach);
  await A.getByText('GET CLOSE BEHIND THEM TO ASSASSINATE').waitFor();
  const drawn = await A.evaluate(() => window.__acidMine.miners.map.size);
  check(drawn === 1, `Ann's scene draws Bob (${drawn})`);
  await shot(A, '1-maze-other-player-phone');
  await walk(A, behind);
  await A.waitForSelector('[data-test=ambush-prompt]', { timeout: 4000 }).catch(() => null);
  check(!!(await A.$('[data-test=ambush-prompt]')), 'the ASSASSINATE prompt shows behind an unaware Bob');
  check(!(await Bp.$('[data-test=ambush-prompt]')), 'Bob gets no prompt (he cannot see her)');
  await shot(A, '2-assassinate-prompt-phone');
  const noScroll = await A.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1);
  check(noScroll, 'phone: no page scroll with the prompt up');
  // ...but Ann holds off. Bob turns around: they see each other and they are touching. Bugs out.
  await Bp.evaluate((a) => { window.__acidMine.yaw = a; }, -east);
  await Promise.all([A.waitForSelector('[data-test=bout][data-kind=mine]', { timeout: 6000 }).catch(() => null), Bp.waitForSelector('[data-test=bout][data-kind=mine]', { timeout: 6000 }).catch(() => null)]);
  check(!!(await A.$('[data-test=bout][data-kind=mine]')) && !!(await Bp.$('[data-test=bout][data-kind=mine]')), 'face to face and touching: a bug battle opens on both screens');
  check(!(await A.$('[data-test=ambush-prompt]')), 'no assassinate prompt once he has seen you');
  await wait(400);
  await shot(A, '3-bug-battle-phone'); await shot(Bp, '3-bug-battle-desktop');
  const fits = await A.evaluate(() => { const r = document.querySelector('[data-test=bout]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
  check(fits, 'phone: the whole battle screen fits without scrolling');
  await A.waitForSelector('[data-test=bout-run]', { timeout: 9000 }).catch(() => null);
  check(await A.evaluate(() => !!document.querySelector('[data-test=bout-run]')), 'RUN is on screen');
  // play it out: both keep lining up their first move; the fight keeps its own time (up to about two minutes)
  let over = false;
  for (let t = 0; t < 130 && !over; t++) {
    for (const p of [A, Bp]) {
      const btn = await p.$('[data-test^=bout-move-]:not([disabled])');
      if (btn) await btn.click().catch(() => {});
    }
    await wait(1200);
    if (t === 1) { await shot(A, '4-bug-battle-midfight-phone'); }
    over = !!(await A.$('[data-test=bout][data-done="1"]')) && !!(await Bp.$('[data-test=bout][data-done="1"]'));
  }
  await wait(1500);
  check(over, 'the battle ends on both screens');
  await shot(A, '5-battle-over-phone'); await shot(Bp, '5-battle-over-desktop');
  const annWon = await A.evaluate(() => document.querySelector('[data-test=bout]')?.dataset.result === 'won');
  const [W, L, winner] = annWon ? [A, Bp, ann] : [Bp, A, bob];
  console.log('     winner:', winner.name);
  await L.click('[data-test=bout-close]'); await L.waitForSelector('[data-test=pvp-receipt]', { timeout: 5000 }).catch(() => null);
  check(!!(await L.$('[data-test=pvp-receipt]')), 'the loser gets a YOUR BUG LOST receipt');
  await shot(L, '6-loser-receipt');
  await W.click('[data-test=bout-close]'); await wait(500);
  check(!!(await W.$('.m-canvas')) && !(await W.$('[data-test=bout][data-kind=mine]')), 'the winner is back in the tunnels');
  await walk(W, lift);
  const C = await open(browser, cal, desktop);
  await walk(C, target);
  const ambush = async (attacker, victim, useTouch) => {
    await walk(attacker, behind);
    const button = attacker.locator('[data-test=ambush]');
    await button.waitFor({ timeout: 5000 });
    await shot(attacker, useTouch ? '7-assassinate-phone' : '7-assassinate-desktop');
    const result = attacker.waitForResponse(r => r.url().endsWith('/pvp/ambush'));
    if (useTouch) await button.tap(); else await attacker.keyboard.press('x');
    check((await result).ok(), `${useTouch ? 'tap' : 'X'} ambush succeeds`);
    await victim.locator('[data-test=pvp-receipt]').waitFor({ timeout: 6000 });
  };
  await ambush(W, C, annWon);
  await walk(W, target);
  const D = await open(browser, await login('Dee', 'dee@pvp.test'), annWon ? desktop : phone);
  await ambush(D, W, !annWon);
  await shot(W, '8-ambushed-receipt');
  for (const [n, p] of [['Ann', A], ['Bob', Bp], ['Cal', C], ['Dee', D]]) check(!p.errs.length, `${n}: no page errors ${p.errs.join(' | ')}`);
} catch (e) { console.error(e); fails.push(String(e.message)); }
finally {
  await browser?.close(); shutdown(); await new Promise(resolve => srv.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
