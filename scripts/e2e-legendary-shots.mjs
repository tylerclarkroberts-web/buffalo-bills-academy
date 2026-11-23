// Proof screenshots for PR #212 review: the admin mine-preview harness plus barn ledger/collection.
//   PLAYWRIGHT_DIR=... OUT=/workspace/bba-legendary-shots node scripts/e2e-legendary-shots.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || '/workspace/bba-legendary-shots';
const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { webkit, devices } = req('playwright-core');
const PORT = 4300 + Math.floor(Math.random() * 200);
const B = `http://localhost:${PORT}`;
const ANN_ID = '11111111-1111-1111-1111-111111111111';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-legend-shot-'));
fs.writeFileSync(path.join(dir, 'players.json'), JSON.stringify({
  [ANN_ID]: { id: ANN_ID, name: 'Ann', createdAt: Date.now() - 40 * 86400e3, kind: 'dev', google: { sub: 'dev:ann@stick.test', email: 'ann@stick.test' }, bankroll: 8000, mining: { shifts: 12 } },
}));
fs.writeFileSync(path.join(dir, 'admins.json'), JSON.stringify([ANN_ID]));

const env = {
  ...process.env,
  PORT: String(PORT),
  DATA_DIR: dir,
  DEV_LOGIN: '1',
  SLACK_BOT_TOKEN: '',
  BARN_TEST_SPECIES: '1',
  BARN_INCUBATE_MS: '1',
  ADMIN_PLAYER_IDS: ANN_ID,
  PVP_TEST: '1',
};
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit'] });
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (p, name, { animations = 'disabled' } = {}) => {
  fs.mkdirSync(OUT, { recursive: true });
  await p.screenshot({ path: path.join(OUT, `${name}.png`), animations });
  console.log('shot', name);
};

async function login() {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ann', email: 'ann@stick.test' }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { cookie, sid: cookie.split('=')[1], body: await r.json().catch(() => ({})) };
}
async function api(cookie, method, url, body) {
  const r = await fetch(B + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text) }; } catch { return { status: r.status, text }; }
}
async function skipGates(p) {
  try {
    const skip = p.getByRole('button', { name: /skip for now/i });
    await skip.waitFor({ state: 'visible', timeout: 2000 });
    await skip.click();
    await p.waitForTimeout(200);
  } catch { /* */ }
  try {
    const no = p.locator('[data-test=fawn-no]');
    if (await no.count()) await no.click({ force: true });
  } catch { /* */ }
  try {
    await p.addStyleTag({ content: '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo, .fn-root { display:none!important;visibility:hidden!important; } .mine-preview-banner { display:none!important; }' });
  } catch { /* */ }
}
async function openPage(browser, sid, device, path) {
  const opts = device ? { ...device } : { viewport: { width: 1280, height: 800 } };
  const reduced = path.includes('/barn') ? 'reduce' : 'no-preference';
  const ctx = await browser.newContext({ ...opts, reducedMotion: reduced });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(B + path);
  await skipGates(p);
  return { ctx, p };
}

async function waitReady(p, extra = 0) {
  await p.locator('[data-test=mine-preview][data-ready="1"]').waitFor({ timeout: 8000 });
  if (extra) await p.waitForTimeout(extra);
}

async function previewShot(browser, sid, device, query, name, { animations, extra } = {}) {
  const { ctx, p } = await openPage(browser, sid, device, `/admin/mine-preview?shot=${query}&clean=1`);
  if (query === 'stick-intro') {
    await p.locator('[data-test=stick-intro-title]').waitFor({ timeout: 4000 });
    await p.waitForTimeout(200);
  } else if (query.includes('battle') || query.startsWith('steeze-') && query !== 'steeze-tunnel') {
    await p.locator('.bout').waitFor({ timeout: 5000 });
    await waitReady(p, extra ?? 400);
  } else {
    await waitReady(p, extra ?? 200);
  }
  const visibleBug = await p.evaluate(() => {
    const body = document.body.innerText || '';
    return { title: body.includes('LEGENDARY') || body.includes('Lord Howe'), steeze: body.includes('STEEZE'), ready: document.querySelector('[data-test=mine-preview]')?.getAttribute('data-ready') };
  });
  if (query === 'stick-wall' || query === 'stick-ceiling' || query === 'stick-intro' || query === 'steeze-tunnel') {
    const avg = await p.evaluate(() => {
      const c = document.querySelector('[data-test=mine-preview-canvas]');
      if (!c) return 0;
      const t = document.createElement('canvas'); t.width = Math.min(c.width || 0, 640); t.height = Math.min(c.height || 0, 400);
      if (!t.width || !t.height) return -1;
      const x = t.getContext('2d'); x.drawImage(c, 0, 0, t.width, t.height);
      const d = x.getImageData(0, 0, t.width, t.height).data;
      let s = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { s += d[i] + d[i + 1] + d[i + 2]; n++; }
      return n ? s / (n * 3) : 0;
    });
    check(avg > 12, `${name} canvas is not a black frame (avg ${avg.toFixed(1)})`);
  }
  await shot(p, name, { animations: animations || 'disabled' });
  check(!p.errs.length, `${name} no page errors (${p.errs.join('; ')})`);
  await ctx.close();
  return visibleBug;
}

async function hatchAs(cookie, species) {
  const heeshee = await api(cookie, 'POST', '/api/dev/heeshee', { on: false, bug: true });
  if (heeshee.status >= 400) {
    // fall back: no partner yet is fine if heeshee hook failed for lack of an egg path
    console.log('heeshee hatch', heeshee.status, heeshee.json || heeshee.text);
  }
  const barn = await api(cookie, 'GET', '/api/barn');
  if (!barn.json?.pen && !barn.json?.pens) {
    console.log('barn after hatch', barn.status, JSON.stringify(barn.json || barn.text).slice(0, 300));
  }
  const sw = await api(cookie, 'POST', '/api/dev/species', { id: species });
  console.log('species', species, sw.status, sw.json);
  return sw;
}

async function barnShot(browser, sid, cookie, device, species, tab, name) {
  await hatchAs(cookie, species);
  const { ctx, p } = await openPage(browser, sid, device, '/barn');
  await p.locator('[data-test=barn-creature]').waitFor({ timeout: 8000 });
  if (tab) {
    await p.locator(`[data-test=tab-${tab}]`).click();
    await p.waitForTimeout(400);
  }
  if (tab === 'notes') {
    const pager = p.locator('[data-test=notes-count]');
    await pager.waitFor({ timeout: 4000 });
    const inView = await pager.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom <= (window.innerHeight - 4) && r.top >= 0;
    });
    check(inView, `${name} ledger pager is in the viewport`);
    // page to the history facts if they are not on page 1
    const next = p.locator('[data-test=notes-next]');
    if (await next.isEnabled()) {
      // stay on a page that shows a fact if possible; first take the fitted page, then advance once so history is in frame
    }
  }
  const text = await p.locator('[data-test=creature-name]').innerText();
  if (species === 'steeze') check(text.trim() === 'STEEZE', `${name} stall name is STEEZE (got ${JSON.stringify(text)})`);
  if (species === 'dryococelus') check(/Lord Howe Island Stick Insect/i.test(text), `${name} stall name is the stick insect (got ${JSON.stringify(text)})`);
  await shot(p, name);
  check(!p.errs.length, `${name} no page errors (${p.errs.join('; ')})`);
  await ctx.close();
  return text;
}

async function main() {
  let browser;
  try {
    for (let i = 0; i < 40; i++) {
      try { const r = await fetch(B + '/api/auth/config'); if (r.ok) break; } catch { /* */ }
      if (i === 39) throw new Error('server did not start');
      await wait(250);
    }
    const { cookie, sid, body } = await login();
    console.log('login', sid && 'ok', body?.player?.id || body);
    const gate = await api(cookie, 'GET', '/api/admin/mine-preview');
    check(gate.status === 200 && gate.json?.preview, `mine-preview API ${gate.status}`);

    browser = await webkit.launch();
    const phone = devices['iPhone 15'] || devices['iPhone 14'] || devices['iPhone 13'];

    await previewShot(browser, sid, null, 'stick-wall', 'desktop-1280-wall');
    await previewShot(browser, sid, null, 'stick-ceiling', 'desktop-1280-ceiling');
    await previewShot(browser, sid, null, 'stick-intro', 'desktop-1280-intro', { animations: 'allow' });
    await previewShot(browser, sid, null, 'stick-battle', 'desktop-1280-battle', { extra: 400 });
    await previewShot(browser, sid, phone, 'stick-wall', 'iphone-15-wall');
    await previewShot(browser, sid, phone, 'stick-ceiling', 'iphone-15-ceiling');
    await previewShot(browser, sid, phone, 'stick-intro', 'iphone-15-intro', { animations: 'allow' });
    await previewShot(browser, sid, phone, 'stick-battle', 'iphone-15-battle', { extra: 400 });

    await previewShot(browser, sid, null, 'steeze-tunnel', 'steeze-desktop-1280-tunnel', { extra: 400 });
    await previewShot(browser, sid, null, 'steeze-battle', 'steeze-desktop-1280-battle', { extra: 400 });
    await previewShot(browser, sid, null, 'steeze-golf', 'steeze-desktop-1280-move-golf', { animations: 'allow', extra: 400 });
    await previewShot(browser, sid, null, 'steeze-chicken', 'steeze-desktop-1280-move-chicken', { animations: 'allow', extra: 400 });
    await previewShot(browser, sid, null, 'steeze-calves', 'steeze-desktop-1280-move-calves', { animations: 'allow', extra: 400 });
    await previewShot(browser, sid, null, 'steeze-wealth', 'steeze-desktop-1280-move-wealth', { animations: 'allow', extra: 400 });
    await previewShot(browser, sid, phone, 'steeze-tunnel', 'steeze-iphone-15-tunnel', { extra: 400 });
    await previewShot(browser, sid, phone, 'steeze-battle', 'steeze-iphone-15-battle', { extra: 400 });
    await previewShot(browser, sid, phone, 'steeze-golf', 'steeze-iphone-15-move-golf', { animations: 'allow', extra: 400 });
    await previewShot(browser, sid, phone, 'steeze-chicken', 'steeze-iphone-15-move-chicken', { animations: 'allow', extra: 400 });
    await previewShot(browser, sid, phone, 'steeze-calves', 'steeze-iphone-15-move-calves', { animations: 'allow', extra: 400 });
    await previewShot(browser, sid, phone, 'steeze-wealth', 'steeze-iphone-15-move-wealth', { animations: 'allow', extra: 400 });

    await barnShot(browser, sid, cookie, null, 'dryococelus', 'notes', 'desktop-1280-ledger');
    await barnShot(browser, sid, cookie, phone, 'dryococelus', 'notes', 'iphone-15-ledger');
    await barnShot(browser, sid, cookie, null, 'steeze', null, 'steeze-desktop-1280-collection');
    await barnShot(browser, sid, cookie, phone, 'steeze', null, 'steeze-iphone-15-collection');
  } finally {
    try { await browser?.close(); } catch { /* */ }
    srv.kill('SIGKILL');
  }
  if (fails.length) {
    console.error('FAILED', fails);
    process.exit(1);
  }
  console.log('all shot checks passed');
}

main().catch((e) => { console.error(e); try { srv.kill('SIGKILL'); } catch { /* */ } process.exit(1); });
