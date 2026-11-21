// Stills of the strongest-bug-trainer highlight on the leaderboard.
// OUT=/workspace/bba-t451-shots/bug-leader
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'node:module';
import { createApp } from '../server/app.js';
import { xpFor } from '../server/engine/creatures.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium, webkit, devices } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || '/workspace/bba-t451-shots/bug-leader';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bug-board-'));
const { app, service, shutdown } = createApp({
  dataDir: dir,
  staticDir: path.join(ROOT, 'dist'),
  env: { ...process.env, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BJ_TICK_MS: '0' },
  marketSources: {},
  snapshots: false,
});
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const PORT = server.address().port;
const B = `http://127.0.0.1:${PORT}`;
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };

const creature = (over = {}) => ({
  stage: 'creature', species: 'empusa', name: 'Empusa', xp: xpFor(5), cap: 9,
  record: { w: 0, l: 0, d: 0 }, bornAt: Date.now(), ...over,
});

async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const body = await r.json();
  return { name, cookie, sid: cookie.split('=')[1], id: body.id };
}

const ada = await login('Ada', 'ada@bugboard.test');
const bess = await login('Bess', 'bess@bugboard.test');
const cy = await login('Cy', 'cy@bugboard.test');
const egg = await login('Edie', 'edie@bugboard.test');
service.getPlayer(ada.id).bankroll = 1200;
service.getPlayer(bess.id).bankroll = 1800;
service.getPlayer(cy.id).bankroll = 900;
service.getPlayer(egg.id).bankroll = 400;
service.barn.doc.pens[ada.id] = creature({ name: 'Phrixothrix', species: 'phrixothrix', xp: 3022, cap: 9, record: { w: 7, l: 4, d: 0 } });
service.barn.doc.bench[ada.id] = [creature({ name: 'Empusa', species: 'empusa', xp: 3301, cap: 9, record: { w: 1, l: 0, d: 0 }, bornAt: Date.now() + 1 })];
service.barn.doc.pens[bess.id] = creature({ name: 'Pyrops', species: 'pyrops', xp: 2221, cap: 9, record: { w: 12, l: 7, d: 0 } });
service.barn.doc.pens[cy.id] = creature({ name: 'Lamprima', species: 'lamprima', xp: 1653, cap: 9, record: { w: 2, l: 10, d: 0 } });
service.barn.doc.pens[egg.id] = { stage: 'egg', species: 'onymacris', eggAt: Date.now(), hatchAt: Date.now() + 86400e3 };
service.barn.save();

async function skipGate(p) {
  const skip = p.getByRole('button', { name: 'Skip for now' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 4000 });
    await skip.click();
    await p.waitForURL((u) => !String(u).includes('/welcome'), { timeout: 8000 });
  } catch { /* already past it */ }
}
async function shooFaun(p) {
  const no = p.locator('[data-test=fawn-no], [data-test=fawn-done]');
  try {
    await no.first().waitFor({ state: 'visible', timeout: 4000 });
    await no.first().click();
    await p.locator('[data-test=fawn]').waitFor({ state: 'hidden', timeout: 4000 });
  } catch { /* no faun today */ }
  await p.addStyleTag({ content: '[data-test="fawn"], .fn, [data-test=bj-guntrad], img[src*="dealer.png"] { display: none !important; pointer-events: none !important; }' });
}

async function shot(browser, name, vp) {
  const ctx = await browser.newContext({ ...vp, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'bba_sid', value: ada.sid, url: B }]);
  await ctx.addInitScript(() => {
    const s = document.createElement('style');
    s.textContent = '[data-test="fawn"], .fn, [data-test=bj-guntrad], img[src*="dealer.png"] { display: none !important; pointer-events: none !important; }';
    document.documentElement.appendChild(s);
  });
  const p = await ctx.newPage();
  await p.goto(`${B}/leaderboard`);
  await skipGate(p);
  await shooFaun(p);
  await p.waitForSelector('[data-test=bug-trainers]', { timeout: 15000 });
  const champ = p.locator('[data-test=bug-trainer-0]');
  await champ.waitFor({ state: 'visible' });
  const text = await champ.innerText();
  check(/Ada/i.test(text) && /Empusa/i.test(text) && /Lv\s*9/i.test(text), `${name}: champion is Ada with Empusa at level 9`);
  check(await p.locator('[data-test=bug-trainer-1]').count(), `${name}: runner-up is present`);
  check(!(await p.locator('[data-test=bug-trainer-3]').count()), `${name}: only the top 3 trainers are named`);
  const inView = await champ.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1;
  });
  check(inView, `${name}: champion row is fully on screen`);
  const screenScroll = await p.evaluate(() => {
    const s = document.querySelector('.screen') || document.body;
    return s.scrollHeight > s.clientHeight + 8;
  });
  check(!screenScroll, `${name}: the screen itself does not scroll`);
  fs.mkdirSync(OUT, { recursive: true });
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  const box = p.locator('[data-test=bug-trainers]');
  if (await box.count()) await box.screenshot({ path: path.join(OUT, `${name}-highlight.png`) });
  await ctx.close();
}

let browsers = [];
try {
  const chrome = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  browsers.push(chrome);
  const wk = await webkit.launch();
  browsers.push(wk);
  await shot(chrome, 'desktop-1280', { viewport: { width: 1280, height: 800 } });
  await shot(wk, 'iphone-15', { ...devices['iPhone 15'] });
} catch (e) {
  console.error(e);
  fails.push(e.message || String(e));
} finally {
  for (const b of browsers) await b.close();
  shutdown();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
}

if (fails.length) {
  console.error('BUG TRAINER BOARD FAILS', fails);
  process.exit(1);
}
console.log('BUG TRAINER BOARD OK', OUT);
