// Browser check + screenshots for La Bufadora: the rocky blowhole, the rumble, the geyser, a launch with no fall
// damage, and /elhalo loading as the game (not a 301 to the lobby). Boots its own throwaway server with DEV_LOGIN
// (the /api/elhalo/dev/bufadora hook only exists there).
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core OUT=dir node scripts/e2e-el-halo-bufadora.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { BUFADORA, groundAt } from '../server/elhalo/map.js';
import { BUFADORA_RULES as BF } from '../server/elhalo/rules.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4020 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-bufadora-'));
const vidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-bufadora-vid-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const sid = r.headers.get('set-cookie').split(';')[0].split('=')[1];
  // /elhalo is a first-class lobby route, so it goes through the face gate (unlike /mines). Give the dev
  // account a generated face so a full-page load of /elhalo actually opens the game.
  const av = await fetch(B + '/api/me/avatar', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `bba_sid=${sid}` }, body: JSON.stringify({ kind: 'gen', seed: name }) });
  if (!av.ok) throw new Error('avatar ' + av.status + ' ' + await av.text());
  return sid;
}
const st = (p) => p.evaluate(() => window.__elHalo.state());
const hook = (p, body) => p.evaluate((b) => fetch('/api/elhalo/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), body);
const trig = (p) => p.evaluate(() => fetch('/api/elhalo/dev/bufadora', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })));
const until = async (p, fn, arg, ms = 8000) => { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); return true; } catch { return false; } };
const banner = (p) => p.evaluate(() => document.querySelector('[data-h=banner]')?.textContent || '');
const place = (p, x, z, yaw) => hook(p, { place: { x, z, yaw } });
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

async function open(browser, sid, s) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m,
    ...(s.video ? { recordVideo: { dir: vidDir, size: { width: s.w, height: s.h } } } : {}),
  });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.t0 = Date.now(); p.errs = []; p.n = s.n; p.m = !!s.m; p.ctx = ctx;
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.errs.push('console: ' + m.text()); });
  const resp = await p.goto(`${B}/elhalo`, { waitUntil: 'domcontentloaded' });
  p.gotoStatus = resp?.status();
  p.finalUrl = p.url();
  try {
    await p.waitForSelector('[data-test=elhalo-page], [data-test=elhalo-room], [data-test=elhalo-lobby], [data-test=elhalo-start]', { timeout: 20000 });
    await p.waitForFunction(() => !!window.__elHalo, null, { timeout: 15000 });
  } catch (err) {
    console.error('open failed', p.url(), (await p.content()).slice(0, 800));
    throw err;
  }
  return p;
}
async function start(p) {
  const tap = (sel) => (p.m ? p.tap(sel) : p.click(sel));
  await tap('[data-test=elhalo-start]');
  await until(p, () => ['lobby', 'playing'].includes(window.__elHalo.state().mode));
  if ((await st(p)).mode === 'lobby') {
    if (await p.isVisible('[data-test=elhalo-begin]')) await tap('[data-test=elhalo-begin]');
    else await tap('[data-test=elhalo-ready]');
  }
  return until(p, () => window.__elHalo.state().mode === 'playing' && window.__elHalo.state().joined && window.__elHalo.state().st === 'alive');
}

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(200); } }

  const noRedir = await fetch(B + '/elhalo', { redirect: 'manual' });
  check(noRedir.status === 200 && !noRedir.headers.get('location'), `GET /elhalo is 200, not a 301 (${noRedir.status} ${noRedir.headers.get('location') || ''})`);
  const slash = await fetch(B + '/elhalo/', { redirect: 'manual' });
  check(slash.status === 200, `GET /elhalo/ is also the app (${slash.status})`);

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const sid = await login('Tyler', 'tyler.bufadora@example.com');
  const T = await open(browser, sid, { w: 1280, h: 720, n: 'tyler-1280x720', video: true });
  check(T.gotoStatus === 200, `/elhalo page status ${T.gotoStatus}`);
  check(/\/elhalo\/?$/.test(new URL(T.finalUrl).pathname) && !/\/mines|\/$/.test(new URL(T.finalUrl).pathname.replace(/\/elhalo\/?$/, '')), `landed on the El Halo route (${T.finalUrl})`);
  check(await start(T), 'Tyler: joins the match');
  await hook(T, { calm: true, night: false, wave: 1, empty: true });
  await until(T, () => window.__elHalo.state().phase === 'wave', null, 6000);

  const holeY = groundAt(BUFADORA.x, BUFADORA.z, 50);
  const look = { x: BUFADORA.x - 3.2, z: BUFADORA.z + 4.5 };
  const close = { x: BUFADORA.x - 2.3, z: BUFADORA.z + 2.5 };
  const lookAt = (p, y) => p.evaluate((t) => window.__elHalo.aimAt(t.x, t.y, t.z), { x: BUFADORA.x, y, z: BUFADORA.z });
  await place(T, close.x, close.z, yawTo(close, BUFADORA));
  await lookAt(T, holeY + 0.35);
  await T.waitForTimeout(600);
  const a0 = await st(T);
  check(a0.bufadora && Math.abs(a0.bufadora.z - BUFADORA.z) < 0.01, 'client knows where La Bufadora is');
  await shot(T, '01-blowhole-rocks');

  // from the bank: rumble, then the geyser (not standing on it, so we can actually see the jet)
  const fired = await trig(T);
  check(fired.status === 200 && fired.body?.ok && fired.body.in === BF.warn, `dev hook starts the warning (${JSON.stringify(fired)})`);
  check(await until(T, () => { const b = window.__elHalo.state().bf; return Array.isArray(b) && b[0] === 0; }, null, 2000), 'snapshot says warn (shared clock)');
  check(await until(T, () => /BUFADORA/.test(document.querySelector('[data-h=banner]')?.textContent || ''), null, 2500), `warn banner: "${await banner(T)}"`);
  await lookAt(T, holeY + 1.0);
  await T.waitForTimeout(200);
  await shot(T, '02-rumble-warn');

  check(await until(T, () => { const b = window.__elHalo.state().bf; return Array.isArray(b) && b[0] === 1; }, null, (BF.warn + 2) * 1000), 'the geyser blows on the shared clock');
  await lookAt(T, holeY + 10);
  await T.waitForTimeout(280);
  await shot(T, '03-geyser-blow');
  await T.waitForTimeout(BF.blast * 1000 + 200);

  // now stand on it and ride the next blast
  await place(T, BUFADORA.x, BUFADORA.z, yawTo({ x: BUFADORA.x, z: BUFADORA.z }, { x: BUFADORA.x, z: BUFADORA.z - 8 }));
  await lookAt(T, holeY + 6);
  await T.waitForTimeout(300);
  const before = await st(T);
  const fired2 = await trig(T);
  check(fired2.status === 200 && fired2.body?.ok, 'second hook for the launch');
  T.gifFrom = (Date.now() - T.t0) / 1000 - 0.2;
  check(await until(T, () => window.__elHalo.state().pos.y > 12, null, (BF.warn + 3) * 1000), `launched (${(await st(T)).pos.y} m, vy ${(await st(T)).vy})`);
  await T.evaluate(() => window.__elHalo.face(window.__elHalo.state().yaw, -0.85)); // look down at the canyon
  await T.waitForTimeout(250);
  await shot(T, '04-launch-airborne');
  const mid = await st(T);
  check(mid.health === before.health && mid.st === 'alive', `no mid-air damage (${before.health} → ${mid.health}, ${mid.st})`);

  check(await until(T, () => window.__elHalo.state().pos.y < 2 && window.__elHalo.state().onGround, null, 6000), `landed at y=${(await st(T)).pos.y}`);
  await T.evaluate((t) => window.__elHalo.aimAt(t.x, t.y, t.z), { x: BUFADORA.x, y: holeY + 1, z: BUFADORA.z - 12 });
  await T.waitForTimeout(250);
  const land = await st(T);
  check(land.health === before.health && land.st === 'alive' && land.shield === before.shield, `lands with no fall damage (${before.shield}/${before.health} → ${land.shield}/${land.health})`);
  await shot(T, '05-landed');
  T.gifTo = (Date.now() - T.t0) / 1000 + 0.2;

  // phone: same bank angle for the hole, then the jet
  const P = await open(browser, sid, { w: 390, h: 844, n: 'phone-390x844', m: true });
  if ((await P.evaluate(() => window.__elHalo?.mode || '')) !== 'playing') await start(P);
  await hook(P, { calm: true, empty: true });
  await place(P, close.x, close.z, yawTo(close, BUFADORA));
  await lookAt(P, holeY + 0.35);
  await P.waitForTimeout(500);
  await shot(P, '06-phone-blowhole');
  await hook(P, { bufadora: true, place: { x: look.x, z: look.z, yaw: yawTo(look, BUFADORA) } });
  await lookAt(P, holeY + 10);
  check(await until(P, () => { const b = window.__elHalo.state().bf; return Array.isArray(b) && b[0] === 1; }, null, (BF.warn + 2.5) * 1000), 'phone sees the same geyser');
  await P.waitForTimeout(250);
  await shot(P, '07-phone-geyser');

  const vid = await T.video()?.path();
  for (const p of [T, P]) check(p.errs.length === 0, `${p.n}: no page errors ${p.errs.slice(0, 3).join(' | ')}`);
  console.log(`     fps (software GL): Tyler ${(await st(T)).fps}`);
  await T.ctx.close(); await P.ctx.close();
  if (OUT && vid) {
    fs.copyFileSync(vid, path.join(OUT, 'tyler-session.webm'));
    const from = Math.max(0, T.gifFrom || 0);
    const dur = Math.max(2, Math.min(12, (T.gifTo || from + 8) - from));
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(from), '-t', String(dur), '-i', path.join(OUT, 'tyler-session.webm'),
        '-vf', 'fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer',
        path.join(OUT, 'bufadora-launch.gif')]);
      console.log('     gif:', path.join(OUT, 'bufadora-launch.gif'), `ss=${from.toFixed(2)} t=${dur.toFixed(2)}`);
    } catch (e) { console.log('     (no gif: ' + e.message + ')'); }
  }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
}
main().catch((e) => { console.error(e); fails.push(String(e)); }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fails.length ? 1 : 0); });
