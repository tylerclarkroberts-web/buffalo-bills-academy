// Mobile split-hand UI: after a split, Hit/Stand stay visible, ≥44px, not covered, no scroll.
// Player table (Guntrad hidden). Normal + continuous, WebKit iPhone 13/15 + Chrome mobile.
// Usage: npm run build && PLAYWRIGHT_DIR=... OUT=dir TAG=before|after node scripts/e2e-bj-split-ui.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'node:module';
import { freshDeck } from '../server/blackjack/rules.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium, webkit, devices } = req('playwright-core');
const ROOT = process.env.ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TAG = process.env.TAG || 'after';
const OUT = process.env.OUT || path.join('/workspace/bba-t451-shots/split', TAG);
const PORT = 4380 + Math.floor(Math.random() * 8);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-split-ui-'));
const srv = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BJ_TICK_MS: '50', SHOP_TEST_CASH: '1' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rig = (p1, up, p2, hole, extra = []) => {
  const used = new Set([p1, up, p2, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, p2, up, p1];
};

const HIDE = '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo, .dealer-spot[title="Guntrad"], [data-test=bj-guntrad], .dealer-fig, img[alt*="Guntrad" i] { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }';

async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { name, cookie, sid: cookie.split('=')[1] };
}
async function api(me, method, path, body) {
  const r = await fetch(B + '/api' + path, { method, headers: { 'content-type': 'application/json', cookie: me.cookie }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${text}`);
  return data;
}

async function openPage(browser, me, device) {
  const ctx = await browser.newContext({ ...device, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript((css) => {
    const inject = () => {
      if (document.getElementById('e2e-hide-guntrad')) return;
      const s = document.createElement('style'); s.id = 'e2e-hide-guntrad'; s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    inject();
    document.addEventListener('DOMContentLoaded', inject);
  }, HIDE);
  const p = await ctx.newPage();
  return { ctx, p };
}

async function skipGate(p) {
  const skip = p.getByRole('button', { name: 'Skip for now' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 6000 });
    await skip.click();
    await p.waitForURL((u) => !String(u).includes('/welcome'), { timeout: 8000 });
  } catch { /* already past the gate */ }
}
async function shooFaun(p) {
  const no = p.locator('[data-test=fawn-no]');
  try {
    await no.waitFor({ state: 'visible', timeout: 2500 });
    await no.click({ force: true });
    await p.locator('[data-test=fawn]').waitFor({ state: 'hidden', timeout: 4000 });
  } catch { /* already gone */ }
}

async function box(p, sel) {
  const el = p.locator(sel).first();
  if (!(await el.count())) return null;
  return el.boundingBox();
}

function overlap(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function setupTable(house, ann, { continuous }) {
  await api(house, 'POST', '/dev/cash', { to: 5000 });
  const table = await api(house, 'POST', '/bj/tables', {
    name: continuous ? 'Split continuous' : 'Split pit',
    settings: { house: 'me', buyIn: 400, houseBank: 400, minBet: 5, maxBetX: 50, bots: 0, continuous, turnSec: 86400 },
  });
  await api(ann, 'POST', `/bj/tables/${table.code}/join`, { ack: true });
  await api(house, 'POST', `/bj/tables/${table.code}/start`);
  // 8-8 for Ann, dealer 6c/Ts, extras for the two split cards (not pairs, so we stay on the first hand).
  await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rig('8h', '6c', '8d', 'Ts', ['3h', '4s', '9d', '2c']) });
  await api(ann, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 });
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const v = await api(ann, 'GET', `/bj/tables/${table.code}`);
    if (v.round?.phase === 'play' && v.round?.can?.split) return table;
    await wait(200);
  }
  const last = await api(ann, 'GET', `/bj/tables/${table.code}`).catch((e) => ({ error: e.message }));
  console.error('setup stuck', { continuous, code: table.code, phase: last.round?.phase, can: last.round?.can, myTurn: last.round?.myTurn, hands: last.round?.hands, status: last.status, err: last.error || last.message });
  throw new Error(`did not reach a split in ${continuous ? 'continuous' : 'normal'} ${table.code}`);
}

async function runDevice({ browser, kind, device, ann, table, mode }) {
  const { ctx, p } = await openPage(browser, ann, device);
  const prefix = `${kind}-${mode}`;
  try {
    await p.goto(`${B}/bj/${table.code}`);
    await skipGate(p);
    await shooFaun(p);
    try {
      await p.waitForSelector('[data-test=bj-table]', { timeout: 15000 });
    } catch (e) {
      fs.mkdirSync(OUT, { recursive: true });
      await p.screenshot({ path: path.join(OUT, `${prefix}-debug.png`), fullPage: true }).catch(() => {});
      const body = await p.locator('body').innerText().catch(() => '');
      console.error('DEBUG', prefix, p.url(), body.slice(0, 500));
      throw e;
    }
    await p.waitForSelector('[data-test=bj-split]', { timeout: 12000 });
    const splitBtn = p.locator('[data-test=bj-split]');
    check(await splitBtn.isVisible(), `${prefix}: Split is visible before the split`);
    fs.mkdirSync(OUT, { recursive: true });
    await p.screenshot({ path: path.join(OUT, `${prefix}-before.png`), fullPage: false });

    await p.addStyleTag({ content: HIDE });
    await shooFaun(p);
    await splitBtn.click({ force: true });
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      const n = await p.locator('[data-test=bj-hand]').count();
      if (n >= 2) break;
      await wait(200);
    }
    await wait(400);
    await p.screenshot({ path: path.join(OUT, `${prefix}-after.png`), fullPage: false });

    const hit = p.locator('[data-test=bj-hit]');
    const stand = p.locator('[data-test=bj-stand]');
    check(await hit.isVisible(), `${prefix}: Hit is visible after the split`);
    check(await stand.isVisible(), `${prefix}: Stand is visible after the split`);
    const hb = await box(p, '[data-test=bj-hit]');
    const sb = await box(p, '[data-test=bj-stand]');
    check(!!hb && hb.height >= 44 && hb.width >= 44, `${prefix}: Hit is at least 44px (${hb && Math.round(hb.width)}x${hb && Math.round(hb.height)})`);
    check(!!sb && sb.height >= 44 && sb.width >= 44, `${prefix}: Stand is at least 44px (${sb && Math.round(sb.width)}x${sb && Math.round(sb.height)})`);
    const bar = await box(p, '[data-test=bj-bar]');
    const vp = p.viewportSize();
    const fullyIn = (b, label) => {
      const ok = !!b && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1;
      check(ok, `${prefix}: ${label} is fully in the viewport (${b && Math.round(b.x)},${b && Math.round(b.y)} ${b && Math.round(b.width)}x${b && Math.round(b.height)} in ${vp.width}x${vp.height})`);
    };
    fullyIn(hb, 'Hit');
    fullyIn(sb, 'Stand');
    check(!!bar && bar.y + bar.height <= vp.height + 1, `${prefix}: action bar is in the viewport (no scroll needed)`);
    const y = await p.evaluate(() => document.scrollingElement?.scrollHeight <= document.scrollingElement?.clientHeight + 1);
    check(y, `${prefix}: the page does not require scrolling`);

    const hands = await p.locator('[data-test=bj-hand]').all();
    let covered = false;
    for (const h of hands) {
      const b = await h.boundingBox();
      if (overlap(b, hb) || overlap(b, sb)) covered = true;
    }
    check(!covered, `${prefix}: split hands do not cover Hit or Stand`);

    // The intended hand is marked when the label exists (after the fix). Before the fix this is informational.
    const now = p.locator('[data-test=bj-hand-now]');
    if (await now.count()) {
      check(await now.first().isVisible(), `${prefix}: the active split hand is labelled This hand`);
    }

    const hitEnabled = await hit.isEnabled();
    check(hitEnabled, `${prefix}: Hit is enabled`);
    if (hitEnabled && hb) {
      const beforeHands = (await api(ann, 'GET', `/bj/tables/${table.code}`)).round?.hands?.find((x) => !x.done)?.cards?.length;
      await p.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await wait(600);
      const afterHands = (await api(ann, 'GET', `/bj/tables/${table.code}`)).round;
      const grew = (afterHands?.hands || []).some((x) => (x.cards || []).length > beforeHands);
      const stillUp = afterHands?.phase === 'play' && afterHands?.myTurn;
      check(grew || !stillUp, `${prefix}: a tap on Hit is received`);
    }
  } finally {
    await ctx.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r, j) => {
    const t0 = Date.now();
    const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t0 > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200)));
    ping();
  });
  const house = await login('Sam', 'sam-split@test');
  const ann = await login('Ann', 'ann-split@test');
  const matrix = [
    ['webkit-iphone-13', 'iPhone 13', webkit],
    ['webkit-iphone-15', 'iPhone 15', webkit],
    ['chrome-mobile', null, chromium],
  ];
  const modes = (process.env.MODES || 'normal,continuous').split(',').map((s) => s.trim()).filter(Boolean);
  for (const mode of modes) {
    for (const [kind, deviceName, engine] of matrix) {
      const player = await login(`Ann-${kind}-${mode}`, `ann-${kind}-${mode}@split.test`);
      let table;
      try { table = await setupTable(house, player, { continuous: mode === 'continuous' }); }
      catch (e) { console.warn('retry setup', e.message); table = await setupTable(house, player, { continuous: mode === 'continuous' }); }
      const browser = engine === webkit
        ? await webkit.launch({ headless: true })
        : await chromium.launch({
          executablePath: process.env.CHROME || '/usr/bin/google-chrome',
          args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        });
      const device = deviceName
        ? devices[deviceName]
        : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36' };
      try {
        await runDevice({ browser, kind, device, ann: player, table, mode });
      } finally {
        await browser.close();
        try { await api(house, 'POST', `/bj/tables/${table.code}/close`); } catch { /* already over */ }
        try { if (table) await api(player, 'POST', `/bj/tables/${table.code}/leave`); } catch { /* */ }
      }
    }
  }
  try { srv.kill('SIGTERM'); } catch { /* */ }
  if (fails.length) {
    console.error('SPLIT UI FAILS', fails);
    process.exit(1);
  }
  console.log('SPLIT UI OK', TAG, OUT);
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { srv.kill('SIGTERM'); } catch { /* */ }
  process.exit(1);
});
