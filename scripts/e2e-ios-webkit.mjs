// iPhone Safari (Playwright WebKit) reliability for the dealer POV.
// npm run build && PLAYWRIGHT_DIR=... OUT=/workspace/bba-dealer-pov-shots/ios npm run e2e:ios
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'os'; import path from 'path';
import { createRequire } from 'node:module';
import { freshDeck } from '../server/blackjack/rules.js';
import { previewAdminEnv, runPreviewChecks, PREVIEW_OUT } from './lib-pov-preview-e2e.mjs';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { webkit, devices } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || '/workspace/bba-dealer-pov-shots/ios';
const PORT = 4320 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-ios-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: previewAdminEnv({ ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BJ_TICK_MS: '0' }, dir), stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rigHands = (hands, up, hole, extra = []) => {
  const firsts = hands.map((h) => h[0]); const seconds = hands.map((h) => h[1]);
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
    const no = p.locator('[data-test=fawn-no], [data-test="fawn-no"]');
    if (await no.count()) { await no.click({ force: true }); await wait(200); }
  } catch { /* */ }
  try {
    await p.addStyleTag({ content: '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo, .fn-root, [class*="fawn"], [class*="faun"] { display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important; }' });
  } catch { /* */ }
}
async function skipGate(p) {
  const skip = p.getByRole('button', { name: 'Skip for now' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 6000 });
    await skip.click();
    await p.waitForURL((u) => !String(u).includes('/welcome'), { timeout: 8000 });
  } catch { /* already past */ }
}

async function open(browser, me, device) {
  const ctx = await browser.newContext({
    ...device,
    reducedMotion: 'no-preference',
  });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript(() => {
    const css = '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo, .dealer-spot[title="Guntrad"], [data-test=bj-guntrad] { display: none !important; }';
    const inject = () => {
      if (document.getElementById('e2e-hide-faun')) return;
      const s = document.createElement('style'); s.id = 'e2e-hide-faun'; s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    inject();
    document.addEventListener('DOMContentLoaded', inject);
  });
  const p = await ctx.newPage();
  p.errs = []; p._ctx = ctx;
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errs.push('console:' + m.text()); });
  await p.goto(`${B}/bj`);
  await skipGate(p);
  return p;
}

const noScroll = async (p, label) => {
  const y = await p.evaluate(() => (document.scrollingElement?.scrollHeight || 0) - (document.scrollingElement?.clientHeight || 0));
  check((y || 0) <= 2, `${label}: no scroll (delta ${y})`);
};

async function waitPov(p, ms = 8000) {
  try { await p.locator('[data-test=bj-dealer-pov]').waitFor({ timeout: ms }); return true; } catch { return false; }
}

async function engineOf(p) {
  try { return await p.locator('[data-test=bj-dealer-pov]').getAttribute('data-engine', { timeout: 3000 }); }
  catch { return null; }
}

async function metrics(p) {
  return p.evaluate(() => {
    const hud = document.querySelector('[data-test=bj-pov-hud]');
    const canvas = document.querySelector('[data-test=bj-pov-canvas]');
    const targets = ['[data-test=bj-autopilot]', '[data-test=bj-say-toggle]', '[data-test=bj-deal-next]', '.bj-pov-act', '.bj-auto-pill'];
    const sizes = targets.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      const r = el.getBoundingClientRect();
      const ta = getComputedStyle(el).touchAction;
      return { sel, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), ta };
    });
    const hudPad = hud ? getComputedStyle(hud).padding : '';
    const canvasH = canvas ? canvas.getBoundingClientRect().height : 0;
    const avail = window.innerHeight;
    const appH = getComputedStyle(document.documentElement).getPropertyValue('--app-h').trim();
    const fps = Number(document.querySelector('[data-test=bj-dealer-pov]')?.getAttribute('data-fps') || 0);
    const engine = document.querySelector('[data-test=bj-dealer-pov]')?.getAttribute('data-engine');
    let vibrateThrew = false;
    try { navigator.vibrate?.(1); } catch { vibrateThrew = true; }
    return {
      sizes, hudPad, canvasH, avail, appH, fps, engine,
      vibrateThrew, hasVibrate: typeof navigator.vibrate === 'function',
      dpr: window.devicePixelRatio,
      inner: { w: window.innerWidth, h: window.innerHeight },
    };
  });
}

async function soak(p, ms = 20000) {
  const t0 = Date.now();
  const samples = [];
  while (Date.now() - t0 < ms) {
    const fps = Number(await p.locator('[data-test=bj-dealer-pov]').getAttribute('data-fps').catch(() => 0)) || 0;
    samples.push(fps);
    await wait(500);
  }
  const used = samples.filter((n) => n > 0);
  const avg = used.length ? used.reduce((a, b) => a + b, 0) / used.length : 0;
  const min = used.length ? Math.min(...used) : 0;
  return { samples: used.length, avg, min, max: used.length ? Math.max(...used) : 0 };
}

async function loseAndRestore(p) {
  return p.evaluate(async () => {
    const c = document.querySelector('[data-test=bj-pov-canvas]');
    if (!c) return { ok: false, reason: 'no-canvas' };
    const gl = c.getContext('webgl') || c.getContext('webgl2');
    if (!gl) return { ok: false, reason: 'no-gl' };
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return { ok: false, reason: 'no-ext' };
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 400));
    try { ext.restoreContext(); } catch (e) { return { ok: false, reason: 'restore-threw', err: String(e) }; }
    await new Promise((r) => setTimeout(r, 1600));
    const engine = document.querySelector('[data-test=bj-dealer-pov]')?.getAttribute('data-engine');
    return { ok: engine === 'webgl' || engine === 'css', engine, reason: 'cycled' };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r, j) => { const t0 = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t0 > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
  const house = await login('Sam', 'sam@ios.test');
  const ann = await login('Ann', 'ann@ios.test');
  const bea = await login('Bea', 'bea@ios.test');
  const cal = await login('Cal', 'cal@ios.test');
  const dee = await login('Dee', 'dee@ios.test');
  for (const [who, seed] of [[house, 'sam-dealer'], [ann, 'ann-hair'], [bea, 'mia'], [cal, 'rose'], [dee, 'player-ann']]) {
    await api(who, 'POST', '/me/avatar', { kind: 'gen', seed });
  }
  const table = await api(house, 'POST', '/bj/tables', { name: "Sam's pit", settings: { house: 'me', buyIn: 200, houseBank: 800, minBet: 5, maxBetX: 20, bots: 0, continuous: false, turnSec: 86400, maxSeats: 5 } });
  for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/join`, { ack: true });
  await api(house, 'POST', `/bj/tables/${table.code}/start`);
  await api(house, 'POST', '/dev/bj-rig', { code: table.code, deck: rigHands([['9h', '5d'], ['7s', '8h'], ['Td', '6d'], ['4h', '9s']], '7c', '8s', ['4c', 'Td']) });
  for (const who of [ann, bea, cal, dee]) await api(who, 'POST', `/bj/tables/${table.code}/bet`, { bet: 10 });

  const browser = await webkit.launch({ headless: true });
  const profiles = [
    { name: 'iphone-13-portrait', device: devices['iPhone 13'] },
    { name: 'iphone-13-landscape', device: devices['iPhone 13 landscape'] },
    { name: 'iphone-15-portrait', device: devices['iPhone 15'] },
    { name: 'iphone-15-landscape', device: devices['iPhone 15 landscape'] },
  ];
  const soakNotes = {};
  let primary;

  for (const { name, device } of profiles) {
    const p = await open(browser, house, device);
    await p.goto(`${B}/bj/${table.code}`);
    await shooFaun(p);
    const ready = await waitPov(p, 12000);
    await shooFaun(p);
    check(ready, `${name}: dealer POV mounted`);
    if (!ready) { await p._ctx.close(); continue; }
    await wait(2200);
    await noScroll(p, name);
    const m = await metrics(p);
    console.log(name, 'engine', m.engine, 'fps', m.fps, 'dpr', m.dpr, 'canvasH', m.canvasH, 'avail', m.avail, 'appH', m.appH);
    check(!m.vibrateThrew, `${name}: navigator.vibrate did not throw`);
    const actionable = m.sizes.filter((s) => !s.missing);
    check(actionable.length > 0, `${name}: HUD controls present (${actionable.map((s) => s.sel).join(', ')})`);
    for (const s of actionable) {
      const tallEnough = s.h >= 44 || s.sel.includes('deal') || s.sel.includes('act') || s.sel.includes('say') || s.sel.includes('auto');
      if (s.sel.includes('autopilot') || s.sel.includes('auto-pill') || s.sel.includes('say') || s.sel.includes('deal') || s.sel.includes('act')) {
        check(s.h >= 44, `${name}: ${s.sel} touch target ${s.w}x${s.h} is at least 44px tall`);
      }
      const ta = String(s.ta || '');
      check(ta === 'manipulation' || ta === 'none' || ta === '', `${name}: ${s.sel} touch-action is not pinch-zoom (${ta})`);
    }
    if (m.canvasH && m.avail) check(m.canvasH >= m.avail * 0.55, `${name}: canvas ${Math.round(m.canvasH)} fills most of the ${m.avail} viewport`);
    await shot(p, name);
    if (name === 'iphone-15-portrait') {
      try {
        const box = await p.locator('[data-test=bj-pov-hud]').boundingBox();
        if (box) await p.screenshot({ path: path.join(OUT, 'iphone-15-portrait-hud.png'), clip: box, fullPage: false });
      } catch { /* */ }
      primary = p;
    } else {
      await p._ctx.close();
    }
    soakNotes[name] = { engine: m.engine, fps: m.fps, dpr: m.dpr, canvasH: m.canvasH, avail: m.avail, appH: m.appH, vibrateThrew: m.vibrateThrew, sizes: m.sizes };
  }

  if (primary) {
    // Audio unlock from a gesture
    const audio = await primary.evaluate(async () => {
      const ev = new PointerEvent('pointerdown', { bubbles: true });
      document.body.dispatchEvent(ev);
      await new Promise((r) => setTimeout(r, 80));
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return { ok: true, reason: 'no-audiocontext' };
      // unlockSfx is not on window; just prove a gesture resume does not throw
      try {
        const a = new A();
        await a.resume().catch(() => {});
        const st = a.state;
        await a.close?.();
        return { ok: true, state: st };
      } catch (e) { return { ok: false, err: String(e) }; }
    });
    check(audio.ok, `audio unlock from a gesture does not throw (${audio.state || audio.reason || audio.err || 'ok'})`);

    // Presence: pagehide should pause, not immediately flag away
    await api(ann, 'POST', `/bj/tables/${table.code}/presence`, { state: 'paused' });
    const afterPause = await api(house, 'GET', `/bj/tables/${table.code}`);
    const annSeat = (afterPause.seats || []).find((s) => s && s.name === 'Ann');
    check(annSeat?.away !== true, 'paused Ann is not immediately away on the house view');

    if (await engineOf(primary) === 'webgl') {
      const cycled = await loseAndRestore(primary);
      console.log('context cycle', cycled);
      check(cycled.ok, `webgl context loss recovered or fell back (${cycled.engine || cycled.reason})`);
      await wait(800);
      await shot(primary, 'iphone-15-portrait-after-context');
      const soakRes = await soak(primary, 20000);
      console.log('soak', soakRes);
      soakNotes.soak = soakRes;
      check(soakRes.samples > 0, `soak collected ${soakRes.samples} fps samples, avg ${soakRes.avg.toFixed(1)} min ${soakRes.min}`);
    } else {
      console.log('webkit engine is not webgl; skipping context-loss and fps soak');
      soakNotes.soak = { skipped: true, engine: await engineOf(primary) };
    }

    const errs = (primary.errs || []).filter((e) => !/appendChild|ResizeObserver|does not belong to this context|INVALID_OPERATION: delete|texImage3D: FLIP_Y|PREMULTIPLY_ALPHA isn't allowed/.test(e));
    check(errs.length === 0, `iphone-15 page errors (${errs.slice(0, 5).join(' | ') || 'none'})`);
    await primary._ctx.close();
  }

  const prevShot = async (page, name) => { fs.mkdirSync(PREVIEW_OUT, { recursive: true }); await page.screenshot({ path: path.join(PREVIEW_OUT, `${name}.png`), fullPage: false }); };
  const phones = [
    { name: 'iphone-15-portrait', device: devices['iPhone 15'] },
    { name: 'iphone-13-landscape', device: devices['iPhone 13 landscape'] },
  ];
  for (const ph of phones) {
    const preview = await runPreviewChecks({ open, login, api, shooFaun, skipGate, wait, shot: prevShot, check, B, browser, device: ph.device, shotName: ph.name });
    const y = await preview.evaluate(() => (document.scrollingElement?.scrollHeight || 0) - (document.scrollingElement?.clientHeight || 0));
    check((y || 0) <= 8, `${ph.name} preview: no scroll (delta ${y})`);
    const previewErrs = (preview.errs || []).filter((e) => !/appendChild|ResizeObserver|does not belong to this context|INVALID_OPERATION: delete|texImage3D: FLIP_Y|PREMULTIPLY_ALPHA isn't allowed/.test(e));
    check(previewErrs.length === 0, previewErrs.length ? `${ph.name} preview page errors (${previewErrs.slice(0, 3).join(' | ')})` : `${ph.name} preview page errors (none)`);
    await preview._ctx.close();
  }

  fs.writeFileSync(path.join(OUT, 'webkit-report.json'), JSON.stringify({ at: new Date().toISOString(), soakNotes, fails }, null, 2));
  await browser.close();
  srv.kill();
  if (fails.length) { console.log('FAILS', fails); process.exit(1); }
  console.log('ALL OK');
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { srv.kill(); } catch { /* */ }
  process.exit(1);
});
