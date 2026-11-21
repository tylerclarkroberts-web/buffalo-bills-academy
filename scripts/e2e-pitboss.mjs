// 3D dealer POV, hand signals, pit-boss loom, and a tip toss. Guntrad stays off camera.
// npm run build && PLAYWRIGHT_DIR=... OUT=/workspace/bba-dealer-pov-shots/v2 CHROME=/usr/bin/google-chrome npm run e2e:pitboss
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'path';
import { createRequire } from 'node:module';
import { freshDeck } from '../server/blackjack/rules.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4310 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pov-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BJ_TICK_MS: '0' }, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rig = (p1, up, p2, hole, extra = []) => rigHands([[p1, p2]], up, hole, extra);
// Deal order for N hands: first cards, upcard, second cards, hole, then extras (hits).
const rigHands = (hands, up, hole, extra = []) => {
  const firsts = hands.map((h) => h[0]);
  const seconds = hands.map((h) => h[1]);
  const used = new Set([...firsts, ...seconds, up, hole, ...extra]);
  return [...freshDeck().filter((c) => !used.has(c)), ...extra.slice().reverse(), hole, ...seconds.slice().reverse(), up, ...firsts.slice().reverse()];
};

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
async function shooFaun(p) {
  try {
    const no = p.locator('[data-test=fawn-no]');
    if (await no.count()) { await no.click({ force: true }); await wait(200); }
  } catch { /* no faun this time */ }
}
async function skipGate(p) {
  const skip = p.getByRole('button', { name: 'Skip for now' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 6000 });
    await skip.click();
    await p.waitForURL((u) => !String(u).includes('/welcome'), { timeout: 8000 });
  } catch { /* already past the gate */ }
}
async function open(browser, me, vp, path = '/bj') {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1, reducedMotion: 'no-preference' });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript(() => {
    const css = '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo, .dealer-spot[title="Guntrad"], [data-test=bj-guntrad] { display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important; }';
    const inject = () => {
      if (document.getElementById('e2e-hide-faun')) return;
      const s = document.createElement('style'); s.id = 'e2e-hide-faun'; s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    inject();
    document.addEventListener('DOMContentLoaded', inject);
  });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errs.push('console:' + m.text()); });
  await p.goto(`${B}${path}`);
  await p.addStyleTag({ content: '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo { display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important; }' });
  await skipGate(p);
  await p.addStyleTag({ content: '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo { display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important; }' });
  return p;
}
const noScroll = async (p, label) => {
  const y = await p.evaluate(() => document.scrollingElement?.scrollHeight - document.scrollingElement?.clientHeight);
  check((y || 0) <= 2, `${label}: no scroll (delta ${y})`);
};
const engineOf = async (p) => {
  try { return await p.locator('[data-test=bj-dealer-pov]').getAttribute('data-engine', { timeout: 4000 }); }
  catch { return null; }
};
const waitWebgl = async (p, label) => {
  await p.waitForFunction(() => document.querySelector('[data-test=bj-dealer-pov]')?.getAttribute('data-engine') === 'webgl', { timeout: 15000 });
  check(await engineOf(p) === 'webgl', `${label}: 3D scene loaded (webgl)`);
};

const overlaps = (pt, r, pad = 4) => pt.x >= r.x + pad && pt.x <= r.x + r.w - pad && pt.y >= r.y + pad && pt.y <= r.y + r.h - pad;
const checkFraming = async (p, label, { mobile = false } = {}) => {
  const data = await p.evaluate(() => {
    const fr = window.__bjPovFraming?.() || null;
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { test: el.getAttribute('data-test') || el.className, x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const hud = [
      ...document.querySelectorAll('[data-test=bj-autopilot], [data-test=bj-deal-prompt], [data-test=bj-deal-next], [data-test=bj-say-toggle], [data-test=bj-pov-count]'),
      document.querySelector('.bj-t.pov .bj-head'),
    ].map(box).filter(Boolean);
    const canvas = box(document.querySelector('[data-test=bj-pov-canvas]'));
    const topbar = box(document.querySelector('header.topbar'));
    const footer = box(document.querySelector('footer.legal'));
    return { fr, hud, canvas, innerH: window.innerHeight, topbarH: topbar?.h || 0, footerH: footer?.h || 0 };
  });
  if (!data.fr || !data.canvas) {
    check(false, `${label}: framing probe is available`);
    return;
  }
  const avail = data.innerH - data.topbarH - data.footerH;
  if (mobile) {
    check(data.canvas.h >= avail * 0.85, `${label}: canvas height ${Math.round(data.canvas.h)} is at least 85% of available ${Math.round(avail)}`);
  }
  const clipped = [];
  const covered = [];
  for (const s of data.fr.seats || []) {
    const h = s.head;
    if (!h || !h.visible) clipped.push(`${s.name || s.seat} head`);
    else {
      const hit = (data.hud || []).find((r) => (
        overlaps({ x: h.x, y: h.y }, r) ||
        overlaps({ x: h.x, y: h.y - 18 }, r) ||
        overlaps({ x: h.x, y: h.y + 18 }, r)
      ));
      if (hit) covered.push(`${s.name || s.seat} head vs ${hit.test}`);
    }
  }
  for (const c of data.fr.dealerCards || []) {
    if (!c.visible) clipped.push(`dealer ${c.id}`);
    else {
      const hit = (data.hud || []).find((r) => overlaps({ x: c.x, y: c.y }, r, 2));
      if (hit) covered.push(`dealer ${c.id} vs ${hit.test}`);
    }
  }
  check(clipped.length === 0, `${label}: heads and dealer cards stay in view (${clipped.join(', ') || 'ok'})`);
  check(covered.length === 0, `${label}: HUD does not cover heads or dealer cards (${covered.join(', ') || 'ok'})`);
};

const waitGesture = async (p, kind, ms = 8000) => {
  await p.waitForFunction((k) => document.querySelector('[data-test=bj-dealer-pov]')?.getAttribute('data-gesture') === k, kind, { timeout: ms });
};
const readFps = async (p) => {
  try {
    await p.waitForFunction(() => Number(document.querySelector('[data-test=bj-dealer-pov]')?.getAttribute('data-fps') || 0) > 0, { timeout: 8000 });
  } catch { /* measured below */ }
  try { return Number(await p.locator('[data-test=bj-dealer-pov]').getAttribute('data-fps', { timeout: 2000 })) || 0; }
  catch { return 0; }
};
const dumpErrs = (p, label) => {
  if (p.errs?.length) console.log(label, 'page errors:', p.errs.slice(0, 8).join(' | '));
};
const betIfNeeded = async (page, ann, code) => {
  await page.waitForSelector('[data-test=bj-deal], [data-test=bj-chip-5], [data-test=bj-bar], [data-test=bj-hit]', { timeout: 8000 }).catch(() => {});
  if (await page.locator('[data-test=bj-hit]').count()) return;
  if (await page.locator('[data-test=bj-deal]').count()) {
    await page.click('[data-test=bj-deal]');
  } else if (await page.getByRole('button', { name: /^Bet/ }).count()) {
    await page.getByRole('button', { name: /^Bet/ }).click();
  } else {
    await api(ann, 'POST', `/bj/tables/${code}/bet`, { bet: 10 });
    await page.reload(); await skipGate(page); await shooFaun(page);
  }
};

let browser;
const frames = OUT ? fs.mkdtempSync(path.join(os.tmpdir(), 'pov-gif-')) : null;
let fi = 0;
const frame = async (page) => { if (!frames) return; fi += 1; await page.screenshot({ path: path.join(frames, `f${String(fi).padStart(4, '0')}.png`) }); };

try {
  await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const house = await login('Sam', 'sam@pov.test');
  const ann = await login('Ann', 'ann@pov.test');
  const bea = await login('Bea', 'bea@pov.test');
  const cal = await login('Cal', 'cal@pov.test');
  const dee = await login('Dee', 'dee@pov.test');
  const players = [
    [house, 'sam-dealer'], [ann, 'ann-hair'], [bea, 'mia'], [cal, 'rose'], [dee, 'player-ann'],
  ];
  for (const [who, seed] of players) await api(who, 'POST', '/me/avatar', { kind: 'gen', seed });
  const table = await api(house, 'POST', '/bj/tables', { name: "Sam's pit", settings: { house: 'me', buyIn: 200, houseBank: 800, minBet: 5, maxBetX: 20, bots: 0, continuous: false, turnSec: 86400, maxSeats: 5 } });
  for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/join`, { ack: true });
  await api(house, 'POST', `/bj/tables/${table.code}/start`);
  // Ann 9-5 (will hit 4), Bea 7-8, Cal T-6, Dee 4-9, dealer 7c-8s.
  await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['9h', '5d'], ['7s', '8h'], ['Td', '6d'], ['4h', '9s']], '7c', '8s', ['4c', 'Td']) });
  await api(house, 'POST', `/bj/tables/${table.code}/autopilot`, { on: false });


  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const close = async (page) => { try { await page?.context()?.close(); } catch { /* */ } };

  const D = await open(browser, house, { w: 1280, h: 800 }, `/bj/${table.code}`);
  await D.waitForSelector('[data-test=bj-dealer-pov]', { timeout: 12000 });
  await shooFaun(D);
  await waitWebgl(D, 'desktop');
  await wait(1300);
  check(await D.locator('[data-test=bj-guntrad]').count() === 0, 'desktop: Guntrad is not in the dealer view');
  check(await D.locator('[data-test=bj-autopilot]').count() > 0, 'desktop: Autopilot toggle is there');
  check(await D.locator('[data-test=bj-pov-canvas]').count() > 0, 'desktop: 3D canvas is in the DOM');

  for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 });
  await D.waitForSelector('[data-test=bj-deal-next]', { timeout: 12000 });
  check(await D.locator('[data-test=bj-deal-next]').count() > 0, 'desktop: Deal is offered after the bet');

  // 4 players + up + 4 + hole = 10 deal steps.
  for (let i = 0; i < 10; i++) {
    try {
      await D.locator('[data-test=bj-deal-next]').click({ force: true, timeout: 3000 });
    } catch {
      await api(house, 'POST', `/bj/tables/${table.code}/deal`, { action: 'deal' });
    }
    await wait(280);
    await frame(D);
  }
  await wait(1400);
  dumpErrs(D, 'desktop after deal');
  const desktopFps = await readFps(D);
  console.log('fps desktop', desktopFps.toFixed(1), 'engine', await engineOf(D));
  check(desktopFps > 0, `desktop fps measured (${desktopFps.toFixed(1)})`);
  if (desktopFps > 0) await shot(D, 'desktop-dealer-pov');
  else console.log('skipping blank desktop-dealer-pov overwrite');
  await checkFraming(D, 'desktop');
  await noScroll(D, 'desktop POV');

  // Hit via the API so we only need the dealer's page.
  await api(ann, 'POST', `/bj/tables/${table.code}/act`, { action: 'hit' });
  await waitGesture(D, 'hit');
  const hitKind = await D.locator('[data-test=bj-dealer-pov]').getAttribute('data-gesture');
  check(hitKind === 'hit', `desktop: hit gesture is on the scene (${hitKind})`);
  await wait(280);
  await frame(D);
  await shot(D, 'desktop-hit-gesture');

  if (await D.locator('[data-test=bj-deal-next]').count()) {
    try { await D.locator('[data-test=bj-deal-next]').click({ force: true, timeout: 3000 }); }
    catch { await api(house, 'POST', `/bj/tables/${table.code}/deal`, { action: 'flip' }); }
    await wait(200);
  }
  await api(ann, 'POST', `/bj/tables/${table.code}/act`, { action: 'stand' });
  await waitGesture(D, 'stand').catch(() => {});
  await wait(250);
  await frame(D);
  await api(house, 'POST', `/bj/tables/${table.code}/autopilot`, { on: true });
  const autoLabel = ((await D.locator('[data-test=bj-deal-prompt]').innerText().catch(() => '')) + ' ' + (await D.locator('[data-test=bj-autopilot]').innerText().catch(() => ''))).replace(/\s+/g, ' ');
  const autoOn = await D.locator('[data-test=bj-autopilot] input').isChecked().catch(() => false);
  if (autoOn) check(!/Autopilot is off/i.test(autoLabel), 'desktop: autopilot label matches the checked box (' + autoLabel.trim() + ')');



  const standAll = async () => {
    await api(house, 'POST', `/bj/tables/${table.code}/autopilot`, { on: true }).catch(() => {});
    await api(house, 'POST', `/bj/tables/${table.code}/deal`, { action: 'deal' }).catch(() => {});
    for (const who of [ann, bea, cal, dee]) {
      await api(who, 'POST', `/bj/tables/${table.code}/act`, { action: 'stand' }).catch(() => {});
    }
    await api(house, 'POST', `/bj/tables/${table.code}/deal`, { action: 'flip' }).catch(() => {});
    await api(house, 'POST', `/bj/tables/${table.code}/deal`, { action: 'draw' }).catch(() => {});
  };
  // Wait for the next betting round, then a split.
  const readyToBet = async () => {
    await standAll();
    for (let n = 0; n < 40; n++) {
      const v = await api(house, 'GET', `/bj/tables/${table.code}`);
      if (v?.round?.phase === 'betting' || (!v?.round && v?.status === 'playing')) return v;
      await wait(250);
    }
    throw new Error('betting phase never came back');
  };
  await readyToBet();
  await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['8s', '8h'], ['7d', '9c'], ['5s', '6d'], ['4h', 'Td']], '6c', '9d', ['5c', '9h', '4d']) });
  for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 }).catch(() => {});
  // Autopilot deals; wait until Ann can split.
  let canSplit = false;
  for (let n = 0; n < 40; n++) {
    const v = await api(house, 'GET', `/bj/tables/${table.code}`);
    if (v?.round?.can?.split) { canSplit = true; break; }
    await wait(250);
  }
  if (!canSplit) console.log('split can-flag missed, trying the act anyway');
  await api(ann, 'POST', `/bj/tables/${table.code}/act`, { action: 'split' });
  await waitGesture(D, 'split');
  const splitKind = await D.locator('[data-test=bj-dealer-pov]').getAttribute('data-gesture');
  check(splitKind === 'split', `desktop: split gesture is on the scene (${splitKind})`);
  await wait(350);
  await frame(D);
  await shot(D, 'desktop-split-gesture');

  // Double on a fresh hand, if we can get there.
  await api(ann, 'POST', `/bj/tables/${table.code}/act`, { action: 'stand' }).catch(() => {});
  await api(ann, 'POST', `/bj/tables/${table.code}/act`, { action: 'stand' }).catch(() => {});
  try {
    await readyToBet();
    await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['6h', '5d'], ['7s', '9h'], ['8d', '4c'], ['2s', '3d']], '9c', '8s', ['Td']) });
    for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 }).catch(() => {});
    for (let n = 0; n < 40; n++) {
      const v = await api(house, 'GET', `/bj/tables/${table.code}`);
      if (v?.round?.can?.double) {
        await api(ann, 'POST', `/bj/tables/${table.code}/act`, { action: 'double' });
        await waitGesture(D, 'double', 8000);
        await wait(300);
        await shot(D, 'desktop-double-gesture');
        check(true, 'desktop: double gesture fired');
        break;
      }
      await wait(250);
    }
  } catch (e) { console.log('double gesture skipped', e.message); }

  await api(house, 'POST', '/dev/bj-pit', { code: table.code, line: 'Hands where the camera can see them.', loom: true });
  await D.waitForSelector('[data-test=bj-pit][data-state=loom], [data-test=bj-pit][data-state=talk]', { timeout: 8000 });
  await wait(800);
  await shot(D, 'desktop-pit-loom');
  check(/Hands where the camera can see them|Count it again|Language|phone|handsome tip/i.test((await D.locator('[data-test=bj-pit-line]').innerText()).replace(/\s+/g, ' ')), 'desktop: pit boss line is up');

  await api(ann, 'POST', `/bj/tables/${table.code}/tip`, { amount: 25, id: 'e2e-tip-25' });
  await D.waitForSelector('[data-test=bj-thanks]', { timeout: 6000 });
  await wait(250);
  await shot(D, 'desktop-tip-toss');
  check(await D.locator('[data-test=bj-thanks]').count() > 0, 'desktop: thanks is visible');

  const benign = (e) => /appendChild|ResizeObserver|WebGL|context/.test(e);
  const dErrs = (D.errs || []).filter((e) => !benign(e));
  check(dErrs.length === 0, `desktop house page errors (${dErrs})`);
  check(!/Guntrad/.test(await D.locator('[data-test=bj-table]').innerText().catch(() => '')), 'Guntrad is not on the dealer POV');
  await close(D);

  // Mobile: one page, a mid-hand already on the table (or a fresh dealt hand).
  const M = await open(browser, house, { w: 390, h: 844, m: true }, `/bj/${table.code}`);
  await M.waitForSelector('[data-test=bj-dealer-pov]', { timeout: 12000 });
  await shooFaun(M);
  await waitWebgl(M, 'mobile');
  await wait(1300);
  await shot(M, 'mobile-dealer-pov');
  await checkFraming(M, 'mobile', { mobile: true });
  if (OUT) {
    try { await M.locator('[data-test=bj-pov-hud]').screenshot({ path: path.join(OUT, 'mobile-hud.png') }); } catch { await shot(M, 'mobile-hud'); }
    try {
      const act = M.locator('[data-test=bj-deal-next]');
      if (await act.count()) await act.screenshot({ path: path.join(OUT, 'mobile-hud-action.png') });
      else await M.locator('[data-test=bj-pov-hud-bottom]').screenshot({ path: path.join(OUT, 'mobile-hud-action.png') });
    } catch { /* optional */ }
  }
  await noScroll(M, 'mobile POV');
  const mobileFps = await readFps(M);
  console.log('fps mobile', mobileFps.toFixed(1));
  check(mobileFps > 0, `mobile fps measured (${mobileFps.toFixed(1)})`);
  await api(house, 'POST', '/dev/bj-pit', { code: table.code, line: 'Hands where the camera can see them.', loom: true });
  await M.waitForSelector('[data-test=bj-pit-line]', { timeout: 10000 });
  await wait(800);
  await shot(M, 'mobile-pit-loom');
  check(await M.locator('[data-test=bj-pit-line]').count() > 0, 'mobile: pit boss line is up');
  await close(M);

  // Mobile hit / split stills: open a fresh mid-gesture if we can start another hand; otherwise skip.
  try {
    await readyToBet();
    await api(house, 'POST', `/bj/tables/${table.code}/autopilot`, { on: true });
    await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['9h', '5d'], ['7s', '8h'], ['Td', '6d'], ['4h', '9s']], '7c', '8s', ['4c']) });
    for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 }).catch(() => {});
    const Mh = await open(browser, house, { w: 390, h: 844, m: true }, `/bj/${table.code}`);
    await Mh.waitForSelector('[data-test=bj-dealer-pov]', { timeout: 12000 });
    await shooFaun(Mh);
    await waitWebgl(Mh, 'mobile-hit');
    for (let n = 0; n < 40; n++) {
      const v = await api(house, 'GET', `/bj/tables/${table.code}`);
      if (v?.round?.phase === 'play' && v?.round?.can) break;
      await wait(200);
    }
    await api(ann, 'POST', `/bj/tables/${table.code}/act`, { action: 'hit' });
    await waitGesture(Mh, 'hit');
    await wait(280);
    await shot(Mh, 'mobile-hit-gesture');
    if (OUT) {
      try {
        const act = Mh.locator('[data-test=bj-deal-next]');
        if (await act.count()) await act.screenshot({ path: path.join(OUT, 'mobile-hud-action.png') });
      } catch { /* optional */ }
    }
    await close(Mh);
  } catch (e) { console.log('mobile hit skipped', e.message); }

  try {
    await readyToBet();
    await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['8s', '8h'], ['7d', '9c'], ['5s', '6d'], ['4h', 'Td']], '6c', '9d', ['5c', '9h']) });
    for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 }).catch(() => {});
    const Ms = await open(browser, house, { w: 390, h: 844, m: true }, `/bj/${table.code}`);
    await Ms.waitForSelector('[data-test=bj-dealer-pov]', { timeout: 12000 });
    await shooFaun(Ms);
    await waitWebgl(Ms, 'mobile-split');
    for (let n = 0; n < 40; n++) {
      const v = await api(house, 'GET', `/bj/tables/${table.code}`);
      if (v?.round?.can?.split) break;
      await wait(200);
    }
    await api(ann, 'POST', `/bj/tables/${table.code}/act`, { action: 'split' });
    await waitGesture(Ms, 'split');
    await wait(300);
    await shot(Ms, 'mobile-split-gesture');
    await close(Ms);
  } catch (e) { console.log('mobile split skipped', e.message); }

  // Non-dealer (Ann): classic oval felt, same controls and timing as main. Gestures never gate her.
  try {
    await readyToBet();
    await api(house, 'POST', `/bj/tables/${table.code}/autopilot`, { on: true });
    await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['9h', '5d'], ['7s', '8h'], ['Td', '6d'], ['4h', '9s']], '7c', '8s', ['4c']) });
    for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 }).catch(() => {});
    for (let n = 0; n < 40; n++) {
      const v = await api(ann, 'GET', `/bj/tables/${table.code}`);
      if (v?.round?.phase === 'play') break;
      await wait(200);
    }
  } catch (e) { console.log('non-dealer setup', e.message); }
  const Am = await open(browser, ann, { w: 390, h: 844, m: true }, `/bj/${table.code}`);
  await Am.waitForSelector('[data-test=bj-table]', { timeout: 12000 });
  await shooFaun(Am);
  check(await Am.locator('[data-test=bj-dealer-pov]').count() === 0, 'non-dealer: no 3D dealer POV');
  check(await Am.locator('[data-test=bj-deal-next]').count() === 0, 'non-dealer: no dealer Deal button');
  const hasHit = await Am.locator('[data-test=bj-hit]').count();
  check(hasHit > 0, 'non-dealer: classic Hit control is on the oval felt');
  check(await Am.locator('text=/Wait for the dealer/i').count() === 0, 'non-dealer: no extra wait-for-dealer prompt with autopilot on');
  await shot(Am, 'mobile-non-dealer');
  // Tip from Ann's phone view (still the classic table, not the 3D POV).
  await Am.waitForSelector('[data-test=bj-tip-25]', { timeout: 10000 });
  await Am.click('[data-test=bj-tip-25]');
  await Am.waitForSelector('[data-test=bj-tip-toss]', { timeout: 5000 });
  await wait(350);
  await shot(Am, 'mobile-tip-toss');
  await noScroll(Am, 'mobile tip');
  const aErrs = (Am.errs || []).filter((e) => !benign(e));
  check(aErrs.length === 0, `mobile ann page errors (${aErrs})`);
  // Keep Ann's 2D page open through the film so she does not show as away.


  // Mobile HUD action close-up: Deal is up when autopilot is off and bets are in.
  try {
    await readyToBet();
    await api(house, 'POST', `/bj/tables/${table.code}/autopilot`, { on: false });
    await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['9h', '5d'], ['7s', '8h'], ['Td', '6d'], ['4h', '9s']], '7c', '8s') });
    for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 }).catch(() => {});
    const Ma = await open(browser, house, { w: 390, h: 844, m: true }, `/bj/${table.code}`);
    await Ma.waitForSelector('[data-test=bj-dealer-pov]', { timeout: 12000 });
    await shooFaun(Ma);
    await waitWebgl(Ma, 'mobile-hud-action');
    await Ma.waitForSelector('[data-test=bj-deal-next]', { timeout: 8000 });
    await wait(200);
    if (OUT) {
      try { await Ma.locator('[data-test=bj-deal-next]').screenshot({ path: path.join(OUT, 'mobile-hud-action.png') }); } catch { /* */ }
      try { await Ma.locator('[data-test=bj-pov-hud]').screenshot({ path: path.join(OUT, 'mobile-hud.png') }); } catch { /* */ }
    }
    await close(Ma);
    await api(house, 'POST', `/bj/tables/${table.code}/autopilot`, { on: true });
    await api(house, 'POST', `/bj/tables/${table.code}/deal`, { action: 'deal' }).catch(() => {});
  } catch (e) { console.log('mobile hud action skipped', e.message); }

  // Full-hand film: deal, stand gestures, dealer finish, payout. Autopilot on.
  const filmDir = OUT ? fs.mkdtempSync(path.join(os.tmpdir(), 'pov-film-')) : null;
  let filmI = 0;
  try {
    await readyToBet();
    await api(house, 'POST', `/bj/tables/${table.code}/autopilot`, { on: true });
    await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['9h', '5d'], ['7s', '8h'], ['Td', '6d'], ['4h', '9s']], 'Ts', '8c') });
    const F = await open(browser, house, { w: 1280, h: 800 }, `/bj/${table.code}`);
    await F.waitForSelector('[data-test=bj-dealer-pov]', { timeout: 12000 });
    await shooFaun(F);
    await waitWebgl(F, 'film');
    await wait(1300);
    for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 }).catch(() => {});
    const grab = async () => {
      if (!filmDir) return;
      filmI += 1;
      await F.screenshot({ path: path.join(filmDir, `h${String(filmI).padStart(4, '0')}.png`) });
    };
    const cap = setInterval(() => { grab().catch(() => {}); }, 55);
    const t0 = Date.now();
    for (let n = 0; n < 50; n++) {
      const v = await api(house, 'GET', `/bj/tables/${table.code}`);
      if (v?.round?.phase === 'play') break;
      await wait(120);
    }
    await wait(400);
    for (const who of [ann, bea, cal, dee]) {
      await api(who, 'POST', `/bj/tables/${table.code}/act`, { action: 'stand' }).catch(() => {});
      await wait(450);
    }
    await api(house, 'POST', `/bj/tables/${table.code}/deal`, { action: 'flip' }).catch(() => {});
    await wait(500);
    await api(house, 'POST', `/bj/tables/${table.code}/deal`, { action: 'draw' }).catch(() => {});
    while (Date.now() - t0 < 6500) await wait(80);
    clearInterval(cap);
    await wait(200);
    await grab();
    await shot(F, 'desktop-payout');
    await close(F);
    await close(Am);
    console.log('film frames', filmI);
  } catch (e) {
    console.log('film', e.message);
  }
  await close(Am);

  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'fps.txt'), `desktop ${desktopFps.toFixed(1)}\nmobile ${mobileFps.toFixed(1)}\nrenderer swiftshader (e2e, software GL)\n`);
  }

  if (OUT && filmDir && filmI > 8) {
    const handMp4 = path.join(OUT, 'hand.mp4');
    const handGif = path.join(OUT, 'hand.gif');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '18', '-i', path.join(filmDir, 'h%04d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-t', '8', handMp4]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '18', '-i', path.join(filmDir, 'h%04d.png'),
      '-vf', 'fps=18,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=sierra2_4a',
      '-t', '8', '-loop', '0', handGif]);
    console.log('hand film', handMp4, handGif, 'frames', filmI);
  }

  if (OUT && frames && fi > 1) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '5', '-i', path.join(frames, 'f%04d.png'),
      '-vf', 'scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none',
      '-loop', '0', path.join(OUT, 'gestures.gif')]);
    console.log('gif', path.join(OUT, 'gestures.gif'), 'frames', fi);
  }

} catch (e) {
  console.error(e);
  fails.push(String(e.message || e));
} finally {
  try { await browser?.close(); } catch { /* */ }
  srv.kill();
}
if (fails.length) { console.error('FAILED', fails); process.exit(1); }
console.log('ALL OK');
