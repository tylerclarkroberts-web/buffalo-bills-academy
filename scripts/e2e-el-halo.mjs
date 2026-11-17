// Browser check + screenshots for EL HALO (Hall of Doors), the shared horde match. Boots its own throwaway server,
// clocks three miners in (two desktops and a phone), walks each through the mine door and the hall into El Halo (the
// lobby first; the host starts it), and checks: they share one world and see each other and the horde; nailing boards
// back over a hacienda window works
// (desktop E and the phone's ACCIÓN button) and pays points; friendly fire lands and scores a PVP down; a friend can
// pick you back up; a late joiner gets the current wave as it stands; leaving takes you off everyone's screen; and
// nothing but /api/elhalo is called from inside the room. No page errors.
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core node scripts/e2e-el-halo.mjs   (OUT=dir for screenshots + video)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { OPENINGS } from '../server/elhalo/map.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 3980 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-elhalo-'));
const vidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-elhalo-vid-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  return r.headers.get('set-cookie').split(';')[0].split('=')[1];
}
const noScroll = (p) => p.evaluate(() => { const de = document.documentElement; return !(de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1); });
const inView = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((el) => el.getClientRects().length).every((el) => { const r = el.getBoundingClientRect(); return r.width > 10 && r.height > 10 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }), sel);
const st = (p) => p.evaluate(() => window.__elHalo.state());
const hook = (p, body) => p.evaluate((b) => fetch('/api/elhalo/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), body);
const until = async (p, fn, arg, ms = 8000) => { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } };
const board = (p) => p.evaluate(() => window.__elHalo.board());

async function open(browser, sid, s) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m, ...(s.video ? { recordVideo: { dir: vidDir, size: { width: s.w, height: s.h } } } : {}) });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.n = s.n; p.m = !!s.m; p.ctx = ctx;
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.errs.push('console: ' + m.text()); });
  p.reqs = []; p.on('request', (r) => p.reqs.push({ url: r.url(), method: r.method(), t: Date.now() }));
  await p.goto(`${B}/mines`); await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas');
  await p.waitForFunction(() => !!window.__acidMine); await p.waitForTimeout(800);
  await p.evaluate(() => { const m = window.__acidMine, d = m.door.group.position; m.yaw = Math.atan2(-(d.x - m.pos.x), -(d.z - m.pos.y)); });
  await p.waitForSelector('[data-test=door-prompt]', { timeout: 5000 }).catch(() => null);
  if (s.m) await p.tap('[data-test=door-open]'); else await p.keyboard.press('f');
  await p.waitForSelector('[data-test=door-hall]', { timeout: 5000 });
  check(!p.reqs.some((r) => /ElHaloRoom/.test(r.url)), `${s.n}: El Halo chunk not loaded in the hall`);
  p.tIn = Date.now();
  if (s.m) await p.tap('[data-test=hall-door-elhalo]'); else await p.click('[data-test=hall-door-elhalo]');
  await p.waitForSelector('[data-test=elhalo-lobby]', { timeout: 15000 });
  await p.waitForFunction(() => !!window.__elHalo && window.__elHalo.mode === 'title', null, { timeout: 10000 });
  return p;
}
async function start(p) {
  const tap = (sel) => (p.m ? p.tap(sel) : p.click(sel));
  await tap('[data-test=elhalo-start]');
  await until(p, () => ['lobby', 'playing'].includes(window.__elHalo.state().mode));
  if ((await st(p)).mode === 'lobby') { // in the lobby: the host starts it (or everyone gets ready)
    if (await p.isVisible('[data-test=elhalo-begin]')) await tap('[data-test=elhalo-begin]'); else await tap('[data-test=elhalo-ready]');
  }
  return until(p, () => window.__elHalo.state().mode === 'playing' && window.__elHalo.state().joined && window.__elHalo.state().st === 'alive');
}
async function holdKey(p, key, ms) { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); }
async function holdPad(p, btn, ms, id = 21) { const b = p.locator(`[data-test=pad-${btn}]`); await b.dispatchEvent('pointerdown', { pointerId: id, pointerType: 'touch' }); await p.waitForTimeout(ms); await b.dispatchEvent('pointerup', { pointerId: id, pointerType: 'touch' }); }
const place = (p, x, z, yaw) => hook(p, { place: { x, z, yaw } });
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(200); } }
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const [sT, sJ, sK] = [await login('Tyler', 'tyler.elhalo@example.com'), await login('Joe', 'joe.elhalo@example.com'), await login('Kash', 'kash.elhalo@example.com')];

  // ---- Tyler opens the door to an empty canyon and starts it
  const T = await open(browser, sT, { w: 1280, h: 720, n: 'tyler-1280x720' });
  await until(T, () => /NADIE|EN LA CANCHA/.test(document.querySelector('[data-test=elhalo-live]')?.textContent || ''));
  check(/NADIE/.test(await T.textContent('[data-test=elhalo-live]')), `Tyler: lobby says the canyon is empty (${await T.textContent('[data-test=elhalo-live]')})`);
  await shot(T, '01-title-spectating');
  check(await start(T), 'Tyler: joins the match');
  await hook(T, { calm: true }); // the horde can't hurt anyone during the checks (players still can)
  let a = await st(T);
  check(a.phase === 'break' && a.health === 100 && a.shield === 100, `Tyler: alive in the intermission before wave 1 (${a.phase}, ${a.shield}/${a.health})`);

  // ---- Joe sees Tyler on the title (live), joins, and they see each other
  const J = await open(browser, sJ, { w: 1280, h: 720, n: 'joe-1280x720', video: true });
  await until(J, () => /1 EN LA CANCHA/.test(document.querySelector('[data-test=elhalo-live]')?.textContent || ''));
  check(/1 EN LA CANCHA/.test(await J.textContent('[data-test=elhalo-live]')), `Joe: title shows the live match (${await J.textContent('[data-test=elhalo-live]')})`);
  check(await start(J), 'Joe: joins the same match');
  check(await until(T, () => window.__elHalo.state().others.includes('Joe')) && await until(J, () => window.__elHalo.state().others.includes('Tyler')), 'Tyler and Joe see each other');

  // ---- boarding inside the hacienda (la misión is wide open now): a window, boards pulled down, enemies outside
  const win = OPENINGS.find((o) => o.b === 'hacienda' && o.side === 'w' && !o.door);
  const nx = win.nx, nz = win.nz, ix = win.in.x - nx * 0.4, iz = win.in.z - nz * 0.4;
  await hook(T, { boards: { i: win.i, n: 1 } });
  await place(T, ix, iz, yawTo(win.in, win)); // inside, facing the window
  const outAt = (d, s) => ({ x: win.out.x + nx * d - nz * s, z: win.out.z + nz * d + nx * s });
  await hook(T, { spawn: [{ type: 'luchador', ...outAt(2.5, -1), still: true }, { type: 'granjero', ...outAt(4, 1.5), still: true }, { type: 'mariachi', ...outAt(6, -2.5), still: true }] });
  await until(T, (i) => window.__elHalo.state().bars[i] === 1 && window.__elHalo.state().prompt?.k === 'build', win.i);
  a = await st(T);
  check(a.prompt?.k === 'build' && Math.hypot(a.pos.x - ix, a.pos.z - iz) < 0.5, `Tyler: inside the hacienda at a broken window, prompt to nail boards (${JSON.stringify(a.prompt)})`);
  const pts0 = a.pts;
  await T.keyboard.down('KeyE'); await T.waitForTimeout(1300);
  await shot(T, '03-hacienda-boarding');
  await T.waitForTimeout(1900); await T.keyboard.up('KeyE');
  await until(T, (i) => window.__elHalo.state().bars[i] >= 4, win.i, 3000);
  a = await st(T);
  check(a.bars[win.i] >= 4 && a.pts > pts0, `Tyler: holding E nails boards back up (1 → ${a.bars[win.i]}) and pays points (${pts0} → ${a.pts})`);
  check(await until(J, (i) => window.__elHalo.state().bars[i] >= 4, win.i, 3000), 'Joe sees the same boards');

  // ---- friendly fire: Joe shoots Tyler in the open, then finishes him (a PVP down), then picks him back up
  await hook(T, { clear: true }); // nobody else in the line of fire
  await place(T, 3, -6, 0); await place(J, 3, 0, Math.PI);
  await sleep(600);
  await J.evaluate(() => window.__elHalo.aimAtPlayer('Tyler'));
  await J.evaluate(() => window.__elHalo.fire(true)); await J.waitForTimeout(500); await J.evaluate(() => window.__elHalo.fire(false));
  check(await until(T, () => window.__elHalo.state().shield < 100, null, 3000), `PVP: Joe's rifle takes Tyler's shield down (${(await st(T)).shield})`);
  for (let k = 0; k < 14 && (await st(T)).st === 'alive'; k++) { await J.evaluate(() => window.__elHalo.aimAtPlayer('Tyler')); await J.evaluate(() => window.__elHalo.fire(true)); await J.waitForTimeout(900); await J.evaluate(() => window.__elHalo.fire(false)); if ((await st(J)).mag < 8) { await J.keyboard.press('KeyR'); await J.waitForTimeout(2200); } }
  check(await until(T, () => window.__elHalo.state().st === 'downed', null, 3000), `PVP: Tyler goes down (${(await st(T)).st})`);
  check(await until(T, () => /CAÍSTE/.test(document.querySelector('[data-test=elhalo-down]').textContent)), 'Tyler: downed notice on screen');
  const jb = (await board(J)).find((r) => r.name === 'Joe');
  check(jb && jb.pvp >= 1, `scoreboard: Joe has a PVP down (${JSON.stringify(jb)})`);
  check(await until(J, () => [...document.querySelectorAll('[data-test=elhalo-feed] div')].some((d) => /JOE|TÚ ➜ TYLER|➜/.test(d.textContent)), null, 2000), 'kill feed shows the PVP down');
  await J.keyboard.down('Tab'); await J.waitForTimeout(250);
  check(await J.isVisible('[data-test=elhalo-board]'), 'Tab shows the scoreboard'); await shot(J, '05-scoreboard');
  await J.keyboard.up('Tab');
  await place(J, 3, -4.8, Math.PI);
  await until(J, () => window.__elHalo.state().prompt?.k === 'revive', null, 3000);
  await holdKey(J, 'KeyE', 3600);
  check(await until(T, () => window.__elHalo.state().st === 'alive', null, 3000), `revive: Joe holds E and Tyler's back up (${(await st(T)).st})`);

  // ---- a few rounds in: wave 3, real enemies on the move
  await hook(T, { wave: 3 });
  check(await until(T, () => window.__elHalo.state().wave === 3 && window.__elHalo.state().enemies > 2, null, 12000), `wave 3 starts with enemies on the field (${(await st(T)).enemies})`);

  // ---- Kash shows up late on a phone
  const K = await open(browser, sK, { w: 390, h: 844, m: true, n: 'kash-390x844' });
  await until(K, () => /2 EN LA CANCHA · OLEADA 3/.test(document.querySelector('[data-test=elhalo-live]')?.textContent || ''));
  check(/2 EN LA CANCHA · OLEADA 3/.test(await K.textContent('[data-test=elhalo-live]')), `Kash: phone title shows the live match (${await K.textContent('[data-test=elhalo-live]')})`);
  await shot(K, '06-mobile-title');
  check(await start(K), 'Kash: late joiner gets in');
  a = await st(K);
  check(a.wave === 3 && a.phase === 'wave' && a.enemies > 0 && a.others.includes('Tyler') && a.others.includes('Joe'), `Kash: lands mid wave 3 with enemies and both friends there (wave ${a.wave}, ${a.enemies} enemies, ${a.others.join(',')})`);
  check(a.bars[win.i] === (await st(T)).bars[win.i], 'Kash: gets the boards as they stand');
  check(await inView(K, '[data-test^=pad-]') && await noScroll(K), 'Kash: phone pad on screen (incl. ACCIÓN), no scroll');
  // the phone's ACCIÓN button nails boards too (hacienda window)
  const hw = OPENINGS.find((o) => o.b === 'hacienda' && o.side === 'n');
  await hook(K, { boards: { i: hw.i, n: 0 } });
  await place(K, hw.in.x, hw.in.z, yawTo(hw.in, hw));
  await until(K, () => window.__elHalo.state().prompt?.k === 'build', null, 4000);
  const ready = await until(K, () => document.querySelector('[data-test=pad-act]').classList.contains('ready'), null, 3000);
  check(ready, `Kash: ACCIÓN lights up at a broken window (${JSON.stringify((await st(K)).prompt)} / ${await K.getAttribute('[data-test=pad-act]', 'class')})`);
  await holdPad(K, 'act', 2600);
  a = await st(K);
  check(a.bars[hw.i] >= 2, `Kash: holding ACCIÓN nails boards (0 → ${a.bars[hw.i]})`);
  await K.evaluate(() => window.__elHalo.face(Math.PI * 0.75, -0.05));
  await K.waitForTimeout(400); await shot(K, '07-mobile-playing');
  await K.tap('[data-test=elhalo-board-btn]'); await K.waitForTimeout(300);
  check(await K.isVisible('[data-test=elhalo-board]'), 'Kash: MARCADOR shows the scoreboard on the phone'); await shot(K, '08-mobile-scoreboard');
  await K.tap('[data-test=elhalo-board-close]');

  // ---- the crew together (Joe's view), the overview, and a fight for the video
  await place(T, -4, 6, 0); await place(K, -2, 6.5, 0); await place(J, -3, 12, 0);
  await sleep(700);
  await J.evaluate(() => window.__elHalo.face(0, -0.08)); await J.waitForTimeout(300);
  await shot(J, '04-multiple-players');
  await T.evaluate(() => window.__elHalo.overview(true)); await T.waitForTimeout(500); await shot(T, '02-map-overview'); await T.evaluate(() => window.__elHalo.overview(false));
  await hook(T, { calm: true, clear: true, spawn: [{ type: 'luchador', x: -3, z: 24 }, { type: 'padre', x: 0, z: 26 }, { type: 'granjero', x: -6, z: 25 }, { type: 'mariachi', x: 3, z: 27 }, { type: 'luchador', x: 1, z: 22 }] });
  for (let k = 0; k < 18; k++) { await J.evaluate(() => window.__elHalo.aimAtNearest()); await J.evaluate(() => window.__elHalo.fire(true)); await J.waitForTimeout(330); await J.evaluate(() => window.__elHalo.fire(false)); if (k === 6) await J.keyboard.press('KeyG'); if ((await st(J)).mag < 8) { await J.keyboard.press('KeyR'); await J.waitForTimeout(2000); } }
  a = await st(J);
  check((await board(J)).find((r) => r.name === 'Joe').kills > 0, `Joe: horde kills land (${(await board(J)).find((r) => r.name === 'Joe').kills}; ${a.st} ${a.mode} pts ${a.pts} mag ${a.mag}/${a.reserve} enemies ${a.enemies})`);
  await shot(J, '09-fight');

  // ---- leaving takes you off everyone's screen
  await J.evaluate(() => document.exitPointerLock?.()); await J.waitForTimeout(400);
  await J.click('[data-test=elhalo-exit]');
  check(await until(T, () => !window.__elHalo.state().others.includes('Joe'), null, 5000), 'Joe leaves: gone from Tyler\'s screen');
  const fps = { T: (await st(T)).fps, K: (await st(K)).fps };
  console.log(`     fps (software GL, three browsers on one box): Tyler ${fps.T}, Kash ${fps.K}`);

  for (const p of [T, J, K]) {
    const odd = p.reqs.filter((r) => r.t >= p.tIn && r.url.includes('/api/') && !r.url.includes('/api/elhalo/'));
    check(odd.length === 0, `${p.n}: only /api/elhalo from inside the room (${odd.map((w) => w.method + ' ' + w.url.replace(B, '')).slice(0, 4).join(', ')})`);
    check(p.errs.length === 0, `${p.n}: no page errors ${p.errs.slice(0, 3).join(' | ')}`);
  }
  const idx = fs.readdirSync(path.join(ROOT, 'dist/assets')).filter((n) => /^(index|Mines)-.*\.js$/.test(n)).map((n) => fs.readFileSync(path.join(ROOT, 'dist/assets', n), 'utf8')).join('');
  check(!/MARTILLO DE GRAVEDAD|\/api\/elhalo|HORDA EN EL CA/.test(idx), 'El Halo code is only in its own chunk (not index or Mines)');
  const vid = await J.video()?.path();
  await J.ctx.close(); await T.ctx.close(); await K.ctx.close();
  if (OUT && vid) { fs.copyFileSync(vid, path.join(OUT, 'joe-session.webm')); console.log('     video:', path.join(OUT, 'joe-session.webm')); }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
}
main().catch((e) => { console.error(e); fails.push(String(e)); }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fails.length ? 1 : 0); });
