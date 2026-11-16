// v75: two real browsers, a Game Boy bug battle to the end, then the loser's fainted bug goes to the Bug Center.
// Checks: the flash, versus screen and "wants to battle!" box show before the fight; the end has a faint, a WIN/LOSS
// banner and stamps on both screens and the winner's XP line; the loser's bug shows fainted in the barn; the nurse
// heals it for free. Screenshots (phone + desktop) go to OUT.   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-bug-center.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4180 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bugcenter-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', PVP_TEST: '1', PVP_TEST_GRACE_MS: '0', BARN_TEST_EGG: '1', BARN_INCUBATE_MS: '300', BARN_TEST_SPECIES: '1', BARN_TEST_XP: '400' }, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { w: 390, h: 844, m: true }, DESK = { w: 1280, h: 800 };
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const post = async (u, b) => { const x = await fetch(B + '/api' + u, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(b || {}) }); return x.json(); };
  await post('/me/avatar', { kind: 'gen', seed: name }); // past the "add your face" step
  return { name, cookie, sid: cookie.split('=')[1], post };
}
async function hatch(me, species) {
  const s = await me.post('/mines/start', { rulesVersion: 2 });
  await me.post('/mines/egg', { shiftId: s.shiftId });
  await me.post('/mines/quit', { shiftId: s.shiftId });
  await wait(500); await fetch(B + '/api/barn', { headers: { cookie: me.cookie } });
  await me.post('/dev/species', { id: species });
}
async function page(browser, me, vp, url) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1 });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } })); // keep the daily faun out of the screenshots
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(B + url); return p;
}
async function mine(browser, me, vp) {
  const p = await page(browser, me, vp, '/mines');
  await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas'); await p.waitForFunction(() => !!window.__acidMine);
  await p.waitForTimeout(600); return p;
}
const grid = (p) => p.evaluate(() => window.__acidMine.maze.grid);
function bfs(g, from, to) {
  const key = (x, y) => `${x},${y}`, prev = new Map([[key(from.x, from.y), null]]), q = [from];
  while (q.length) { const c = q.shift(); if (c.x === to.x && c.y === to.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c.x + dx, y = c.y + dy; if (g[y]?.[x] === 0 && !prev.has(key(x, y))) { prev.set(key(x, y), c); q.push({ x, y }); } } }
  const out = []; for (let c = to; c; c = prev.get(key(c.x, c.y))) out.unshift(c); return out;
}
async function walk(p, g, to, yaw) {
  const at = await p.evaluate(() => ({ x: Math.round(window.__acidMine.pos.x / 2.2), y: Math.round(window.__acidMine.pos.y / 2.2) }));
  const route = bfs(g, at, { x: Math.round(to.x), y: Math.round(to.y) }); route.push(to);
  let cur = await p.evaluate(() => ({ x: window.__acidMine.pos.x / 2.2, y: window.__acidMine.pos.y / 2.2 }));
  for (const n of route.slice(1)) {
    const d = Math.hypot(n.x - cur.x, n.y - cur.y), steps = Math.max(1, Math.ceil(d / 0.25));
    const face = Math.atan2(-(n.x - cur.x), -(n.y - cur.y));
    for (let i = 1; i <= steps; i++) {
      const x = cur.x + (n.x - cur.x) * i / steps, y = cur.y + (n.y - cur.y) * i / steps;
      await p.evaluate(([x, y, a]) => { const m = window.__acidMine; m.pos.set(x * 2.2, y * 2.2); if (Number.isFinite(a)) m.yaw = a; }, [x, y, d > 0.01 ? face : NaN]);
      await wait(125);
    }
    cur = n;
  }
  await p.evaluate((a) => { window.__acidMine.yaw = a; }, yaw); await wait(600);
}
const EAST = -Math.PI / 2, WEST = Math.PI / 2;
const fitsScreen = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return !!r && r.top >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1; }, sel);

let browser;
try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 15000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const ann = await login('Ann', 'ann@bc.test'), bob = await login('Bob', 'bob@bc.test');
  await hatch(ann, 'manticora'); await hatch(bob, 'phanaeus');
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const swap = process.env.SWAP === '1'; // SWAP=1: Ann on desktop, Bob on the phone (to get the other result on each size)
  const [nA, nB] = swap ? ['desktop', 'phone'] : ['phone', 'desktop'];
  const A = await mine(browser, ann, swap ? DESK : PHONE), Bp = await mine(browser, bob, swap ? PHONE : DESK);
  const P = swap ? Bp : A;
  const g = await grid(A);
  let spot = null, best = 1e9;
  for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g.length - 4; x++) {
    if ([0, 1, 2, 3].every((k) => g[y][x + k] === 0) && Math.hypot(x - 1, y - 1) > 4) { const l = bfs(g, { x: 1, y: 1 }, { x, y }).length; if (l > 1 && l < best) { best = l; spot = { x, y }; } }
  }
  check(!!spot, 'found a straight tunnel');
  await walk(Bp, g, { x: spot.x + 2, y: spot.y }, EAST);
  await walk(A, g, { x: spot.x + 1.45, y: spot.y }, EAST);
  await Bp.evaluate((a) => { window.__acidMine.yaw = a; }, WEST);
  // the intro, phase by phase
  const phase = async (p, name, t = 7000) => p.waitForSelector(`[data-test=bug-battle][data-phase=${name}]`, { timeout: t }).then(() => true).catch(() => false);
  check(await phase(A, 'flash') && await phase(Bp, 'flash', 2000), 'the flash and wipe open the battle on both screens');
  await wait(640); await shot(A, `01-intro-flash-${nA}`); await shot(Bp, `01-intro-flash-${nB}`);
  check(await phase(A, 'versus') && await phase(Bp, 'versus', 2000), 'the versus screen shows both bugs and both miners');
  await wait(1300); await shot(A, `02-versus-${nA}`); await shot(Bp, `02-versus-${nB}`);
  check(/ANN/.test(await Bp.textContent('[data-test=battle-versus]')) && /BOB/.test(await A.textContent('[data-test=battle-versus]')), 'versus names the rival');
  check(await phase(A, 'appear') && await phase(Bp, 'appear', 3000), '"wants to battle!" text box');
  await shot(A, `03-wants-to-battle-${nA}`); await shot(Bp, `03-wants-to-battle-${nB}`);
  check(/WANTS TO BATTLE/.test(await A.textContent('[data-test=battle-text]')), `text box: ${(await A.textContent('[data-test=battle-text]')).replace(/\n/g, ' ')}`);
  check(await phase(A, 'fight', 6000) && await phase(Bp, 'fight', 6000), 'then the fight');
  await wait(300);
  await shot(A, `04-battle-layout-${nA}`); await shot(Bp, `04-battle-layout-${nB}`);
  check(await fitsScreen(P, '.gb-screen'), 'phone: battle screen fits with no scrolling');
  check(!!(await A.$('[data-test=battle-xp]')), 'your bug has an XP bar');
  let over = false, mid = false;
  for (let t = 0; t < 60 && !over; t++) {
    for (const p of [A, Bp]) { const btn = await p.$('[data-test^=battle-move-]:not([disabled])'); if (btn) await btn.click().catch(() => {}); }
    await wait(1100);
    if (!mid && t >= 1) { mid = true; await shot(A, `05-mid-battle-${nA}`); await shot(Bp, `05-mid-battle-${nB}`); }
    over = !!(await A.$('[data-test=battle-banner]')) && !!(await Bp.$('[data-test=battle-banner]'));
  }
  check(over, 'a WIN/LOSS banner on both screens');
  const annWon = await A.evaluate(() => document.querySelector('[data-test=battle-banner]')?.textContent.includes('WIN'));
  const [W, L, wName, wMe, lMe] = annWon ? [A, Bp, nA, ann, bob] : [Bp, A, nB, ann, bob];
  const lName = wName === 'phone' ? 'desktop' : 'phone';
  void wMe;
  const loser = annWon ? bob : ann;
  console.log('     winner:', annWon ? `Ann (${nA})` : `Bob (${nB})`);
  await wait(200); await shot(W, `06-win-banner-${wName}`); await shot(L, `07-loss-banner-${lName}`);
  check(!!(await W.$('[data-test=stamp-you].gb-stamp.win')) && !!(await W.$('[data-test=stamp-foe].gb-stamp.loss')), 'winner: WIN stamp on yours, LOSE on theirs');
  check(!!(await L.$('[data-test=stamp-you].gb-stamp.loss')), 'loser: LOSE stamp on yours');
  await W.waitForFunction(() => /GAINED \d+ XP!/.test(document.querySelector('[data-test=battle-text]')?.textContent || ''), null, { timeout: 8000 }).catch(() => null);
  const xpLine = await W.textContent('[data-test=battle-text]');
  check(/GAINED 50 XP!/.test(xpLine) && /WIN BONUS/.test(xpLine), `winner XP line: ${xpLine.replace(/\n/g, ' ')}`);
  await shot(W, `08-win-xp-${wName}`);
  await Promise.all([W.waitForSelector('[data-test=battle-over]', { timeout: 10000 }), L.waitForSelector('[data-test=battle-over]', { timeout: 10000 })]);
  await wait(300);
  await shot(W, `09-win-screen-${wName}`); await shot(L, `10-loss-screen-${lName}`);
  check(/YOU WON!/.test(await W.textContent('[data-test=battle-over]')) && /YOU LOST!/.test(await L.textContent('[data-test=battle-over]')), 'result cards: YOU WON! / YOU LOST!');
  check(!!(await W.$('[data-test=battle-spoils]')), `spoils: ${(await W.textContent('[data-test=battle-spoils]').catch(() => '')).trim()}`);
  check(await fitsScreen(P, '.gb-screen'), 'phone: the end screen fits too');
  await L.click('[data-test=battle-done]'); await L.waitForSelector('[data-test=pvp-fainted]', { timeout: 5000 }).catch(() => null);
  check(!!(await L.$('[data-test=pvp-fainted]')), 'the loser\'s receipt says the bug fainted, with a Bug Center link');
  await shot(L, `11-loser-receipt-${lName}`);
  await W.click('[data-test=battle-done]');
  // the fainted bug: barn on both sizes (with the Bug Center option), then into the clinic
  const barnPhone = await page(browser, loser, PHONE, '/barn'), barnDesk = await page(browser, loser, DESK, '/barn');
  for (const [p, n] of [[barnPhone, 'phone'], [barnDesk, 'desktop']]) {
    await p.waitForSelector('[data-test=barn-fainted]', { timeout: 8000 }).catch(() => null);
    check(!!(await p.$('[data-test=barn-fainted]')) && !!(await p.$('[data-test=fainted-mark]')), `${n}: barn shows the bug fainted (swirly eyes)`);
    check(!!(await p.$('[data-test=barn-center]')), `${n}: Bug Center option in the barn`);
    await wait(300); await shot(p, `12-barn-fainted-bug-center-option-${n}`);
    await p.click('[data-test=barn-center]'); await p.waitForSelector('[data-test=bug-center]');
    await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 5000 }).catch(() => null);
    await wait(400); await shot(p, `13-bug-center-interior-${n}`);
    check(await fitsScreen(p, '.bc-scene'), `${n}: the clinic fits with no scrolling`);
    check((await p.textContent('[data-test=sign-title]')).includes('バグセンター'), `${n}: signage in Japanese`);
    await p.click('[data-test=bc-talk]'); await p.waitForSelector('[data-test=bc-portrait]');
    await p.waitForFunction(() => document.querySelector('[data-test=bc-portrait]')?.complete && document.querySelector('[data-test=bc-portrait]').naturalWidth > 0, null, { timeout: 5000 }).catch(() => null);
    await wait(1400); await shot(p, `14-nurse-portrait-${n}`);
    check(await p.evaluate(() => document.querySelector('[data-test=bc-portrait]')?.naturalWidth > 0), `${n}: the nurse portrait loads`);
    for (let i = 0; i < 12 && !(await p.$('[data-test=bc-yes]')); i++) { await p.click('[data-test=bc-dialogue]', { position: { x: 30, y: 30 } }); await wait(450); }
    check(!!(await p.$('[data-test=bc-yes]')), `${n}: she offers to heal (はい / いいえ)`);
    await shot(p, `15-nurse-dialogue-${n}`);
    await p.click('[data-test=bc-en]'); await wait(200); await shot(p, `16-nurse-dialogue-english-${n}`); await p.click('[data-test=bc-en]');
    if (n === 'desktop') { await p.click('[data-test=bc-no]'); await wait(300); }
  }
  const money0 = (await (await fetch(B + '/api/barn', { headers: { cookie: loser.cookie } })).json()).bankroll;
  const H = barnPhone;
  await H.click('[data-test=bc-yes]');
  await H.waitForSelector('[data-test=bc-healing]'); await wait(1500);
  check(!!(await H.$('.bc-machine.lit')) && !!(await H.$('[data-test=bc-pod]')), 'the pod sits in the machine and the lights pulse');
  await shot(H, '17-healing-phone');
  await H.waitForSelector('[data-test=bc-dialogue]', { timeout: 8000 }); await wait(1600);
  check(/すっかり元気/.test(await H.textContent('[data-test=bc-dialogue]')), 'she says it is fully healed');
  await shot(H, '18-healed-phone');
  const after = await (await fetch(B + '/api/barn', { headers: { cookie: loser.cookie } })).json();
  check(after.pen.fainted === false, 'the bug is no longer fainted');
  check(after.bankroll === money0, `healing was free (${money0} → ${after.bankroll})`);
  // desktop: the healing too, for a wide screenshot (the bug is healthy now; she checks it anyway)
  await barnDesk.reload(); await barnDesk.waitForSelector('[data-test=bug-center]');
  await barnDesk.click('[data-test=bc-talk]');
  for (let i = 0; i < 12 && !(await barnDesk.$('[data-test=bc-yes]')); i++) { await barnDesk.click('[data-test=bc-dialogue]', { position: { x: 30, y: 30 } }); await wait(450); }
  await barnDesk.click('[data-test=bc-yes]'); await wait(1500); await shot(barnDesk, '17-healing-desktop');
  await barnDesk.goto(B + '/barn'); await barnDesk.waitForSelector('[data-test=barn-creature]');
  check(!(await barnDesk.$('[data-test=barn-fainted]')), 'back in the barn: no longer fainted');
  await wait(300); await shot(barnDesk, '19-barn-healed-desktop');
  for (const [n, p] of [['A', A], ['B', Bp], ['barn phone', barnPhone], ['barn desk', barnDesk]]) check(!p.errs.length, `${n}: no page errors ${p.errs.join(' | ')}`);
  void lMe;
} catch (e) { console.error(e); fails.push(String(e.message)); }
finally { await browser?.close(); srv.kill(); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
