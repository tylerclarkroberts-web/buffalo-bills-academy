// Browser check + screenshots for the ammo HUD, the low-ammo warning, and the elote man's once-per-wave refill.
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core OUT=dir node scripts/e2e-el-halo-ammo.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { ELOTE } from '../server/elhalo/map.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4030 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-ammo-'));
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
const banner = (p) => p.evaluate(() => document.querySelector('[data-h=banner]')?.textContent || '');
const ammoText = (p) => p.evaluate(() => document.querySelector('[data-h=magread]')?.textContent || '');
const ammoHint = (p) => p.evaluate(() => document.querySelector('[data-h=ammohint]')?.textContent || '');
const place = (p, x, z, yaw) => hook(p, { place: { x, z, yaw } });
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

async function open(browser, sid, s) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.n = s.n; p.m = !!s.m; p.ctx = ctx;
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

async function showHud(p, prefix, wave = 1) {
  await hook(p, { calm: true, empty: true, clear: true, wave });
  await place(p, ELOTE.x - 8, ELOTE.z + 2, yawTo({ x: ELOTE.x - 8, z: ELOTE.z + 2 }, ELOTE));
  await p.evaluate(() => window.__elHalo.face(window.__elHalo.state().yaw, -0.08));
  await p.waitForTimeout(500);

  await p.evaluate(() => window.__elHalo.setAmmo({ weapon: 'rifle', mag: 24, reserve: 120, reload: false }));
  await p.waitForTimeout(150);
  check(/24\s*\/\s*120/.test(await ammoText(p)), `${p.n}: HUD reads 24 / 120 ("${await ammoText(p)}")`);
  await shot(p, `${prefix}-hud`);

  await p.evaluate(() => window.__elHalo.setAmmo({ mag: 8, reserve: 120, toast: 64 }));
  await p.waitForTimeout(200);
  const low = await p.evaluate(() => ({ text: document.querySelector('[data-h=magread]')?.textContent, hint: document.querySelector('[data-h=ammohint]')?.textContent, low: document.querySelector('[data-h=ammo]')?.classList.contains('low'), toast: document.querySelector('[data-h=ammotoast]')?.textContent }));
  check(/8\s*\/\s*120/.test(low.text) && low.low && low.hint === 'RECARGA', `${p.n}: low ammo pulses and says RECARGA (${JSON.stringify(low)})`);
  check(low.toast === '+64', `${p.n}: pickup toast +64 ("${low.toast}")`);
  await shot(p, `${prefix}-low-ammo`);

  await p.evaluate(() => window.__elHalo.setAmmo({ mag: 0, reserve: 0, toast: 0 }));
  await p.waitForTimeout(150);
  check((await ammoHint(p)) === 'SIN BALAS', `${p.n}: empty magazine says SIN BALAS ("${await ammoHint(p)}")`);

  await p.evaluate(() => window.__elHalo.setAmmo({ weapon: 'machete', mag: 7 }));
  await p.waitForTimeout(100);
  check((await ammoText(p)).trim() === '7', `${p.n}: machete shows charges ("${await ammoText(p)}")`);

  // real elote refill at the cart
  await p.evaluate(() => window.__elHalo.setAmmo({ weapon: 'rifle', mag: 4, reserve: 10, toast: false }));
  await hook(p, { hp: 50, place: { x: ELOTE.x - 1.2, z: ELOTE.z - 1, yaw: yawTo({ x: ELOTE.x - 1.2, z: ELOTE.z - 1 }, ELOTE) } });
  check(await until(p, () => window.__elHalo.state().prompt?.k === 'elote' && window.__elHalo.state().prompt.ready, null, 4000), `${p.n}: elote prompt ready (${JSON.stringify((await st(p)).prompt)})`);
  await p.evaluate(() => { window.__elHalo.act(true); });
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__elHalo.act(false));
  const okBanner = await until(p, () => /Elote y balas/i.test(document.querySelector('[data-h=banner]')?.textContent || ''), null, 3000);
  const after = await st(p);
  check(okBanner, `${p.n}: banner "¡Elote y balas!" ("${await banner(p)}")`);
  check(after.health >= 78 && after.mag === 32 && after.reserve === 192, `${p.n}: heal + full rifle (${after.health} hp, ${after.mag} / ${after.reserve})`);
  await p.waitForTimeout(200);
  await shot(p, `${prefix}-elote-refill`);

  await p.evaluate(() => window.__elHalo.act(true));
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__elHalo.act(false));
  check(await until(p, () => /Ya comiste este round/.test(window.__elHalo.state().prompt?.label || ''), null, 2000), `${p.n}: already eaten this wave`);
}

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(200); } }
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const sid = await login('Tyler', 'tyler.ammo@example.com');

  const T = await open(browser, sid, { w: 1280, h: 800, n: 'desktop' });
  check(await start(T), 'desktop starts a match');
  await showHud(T, 'desktop', 1);

  const P = await open(browser, sid, { w: 390, h: 844, n: 'phone-390x844', m: true });
  if ((await P.evaluate(() => window.__elHalo?.mode || '')) !== 'playing') await start(P);
  await showHud(P, 'phone', 2);

  for (const p of [T, P]) check(p.errs.length === 0, `${p.n}: no page errors ${p.errs.slice(0, 3).join(' | ')}`);
  await T.ctx.close(); await P.ctx.close();
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
}
main().catch((e) => { console.error(e); fails.push(String(e)); }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fails.length ? 1 : 0); });
