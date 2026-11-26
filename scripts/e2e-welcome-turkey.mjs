// Thanksgiving polish: no-scroll mines welcome, instant companion, neon turkey, persistent Proctor bubble.
// Throwaway DEV_LOGIN server. Does not deploy. steeze/fawn stay out of frames; Guntrad may appear.
//   npm run build && PLAYWRIGHT_DIR=... OUT=/workspace/bba-screens-welcome-turkey npm run e2e:welcome-turkey
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules';
const req = createRequire(path.join(PLAYWRIGHT_DIR, 'x.js'));
const { chromium } = req('playwright-core');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || '/workspace/bba-screens-welcome-turkey';
const PORT = 4380 + Math.floor(Math.random() * 8);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-welcome-turkey-'));
const ENV = {
  ...process.env,
  PORT: String(PORT),
  DATA_DIR: dir,
  STATIC_DIR: path.join(ROOT, 'dist'),
  DEV_LOGIN: '1',
  SLACK_BOT_TOKEN: '',
  EVENT_THEME: 'on',
  BARN_TEST_EGG: '1',
  BARN_INCUBATE_MS: '200',
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const PHONE = { w: 390, h: 844, m: true };
const DESK = { w: 1280, h: 800, m: false };
const SHORT = { w: 1024, h: 663, m: false };
const HIDE = '[data-test=fawn],.fn,.steeze-art,.steeze-art-wrap,[data-test=steeze]{visibility:hidden!important;opacity:0!important;pointer-events:none!important}';

const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'ignore', 'inherit'] });

async function login(name) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name.toLowerCase()}@welcome.test` }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, u, b) => {
    const x = await fetch(B + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined });
    const text = await x.text();
    try { return JSON.parse(text); } catch { throw new Error(u + ' ' + x.status + ' ' + text.slice(0, 200)); }
  };
  await call('POST', '/me/avatar', { kind: 'gen', seed: name });
  return { name, sid: cookie.split('=')[1], cookie, call };
}

async function page(browser, me, vp, url) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    isMobile: !!vp.m,
    hasTouch: !!vp.m,
    deviceScaleFactor: vp.m ? 2 : 1,
    reducedMotion: 'reduce', // skip the mines CRT fade so shots are of the actual screen
  });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('bba.barnSound', '0'); } catch { /* */ } });
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(B + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.addStyleTag({ content: HIDE });
  for (const sel of ['button:has-text("Skip for now")', '[data-test=sd-skip]', '.fo-decline', '[data-test=fawn-no]']) {
    const loc = p.locator(sel).first();
    if (await loc.count()) { try { await loc.click({ timeout: 800 }); } catch { /* gone */ } }
  }
  p._ctx = ctx;
  return p;
}

async function shot(p, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const dest = path.join(OUT, `${name}.png`);
  await p.screenshot({ path: dest, fullPage: false });
  console.log('wrote', dest);
}

async function dismissForeman(p) {
  for (let i = 0; i < 16; i++) {
    const fm = p.locator('.fm, [data-test=fm-typing]').first();
    if (!(await fm.count()) || !(await fm.isVisible().catch(() => false))) return;
    const next = p.locator('.fm-next, [data-test=fm-done], .fm .m-btn').first();
    if (await next.count()) { try { await next.click({ timeout: 800 }); } catch { /* */ } }
    await wait(200);
  }
}

async function noScroll(p, label) {
  await dismissForeman(p);
  await p.waitForSelector('[data-test=mine-intro]', { timeout: 10000 });
  const m = await p.evaluate(() => {
    const mines = document.querySelector('.mines');
    const intro = document.querySelector('[data-test=mine-intro]');
    const btn = document.querySelector('[data-test=mine-clock-in]');
    const br = btn?.getBoundingClientRect();
    const style = mines ? getComputedStyle(mines) : {};
    return {
      overflow: style.overflow,
      minesSH: mines?.scrollHeight || 0, minesCH: mines?.clientHeight || 0,
      introSH: intro?.scrollHeight || 0, introCH: intro?.clientHeight || 0,
      docSH: document.documentElement.scrollHeight,
      docCH: document.documentElement.clientHeight,
      btnTop: br ? Math.round(br.top) : null,
      btnBottom: br ? Math.round(br.bottom) : null,
      vh: window.innerHeight, vw: window.innerWidth,
    };
  });
  check(m.overflow === 'hidden' || m.minesSH <= m.minesCH + 2, `${label}: mines overflow is contained (${m.overflow}, ${m.minesSH}/${m.minesCH})`);
  check(m.introSH <= m.introCH + 2, `${label}: intro fits without scroll (${m.introSH} <= ${m.introCH} at ${m.vw}x${m.vh})`);
  check(m.docSH <= m.docCH + 2, `${label}: document fits (${m.docSH} <= ${m.docCH})`);
  check(m.btnTop != null && m.btnTop >= -1 && m.btnBottom <= m.vh + 1, `${label}: CLOCK IN fully in view (${m.btnTop}–${m.btnBottom} of ${m.vh})`);
  return m;
}

let shutting = false;
const shutdown = () => { if (shutting) return; shutting = true; try { srv.kill('SIGTERM'); } catch { /* */ } };
process.on('exit', shutdown);

let browser;
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(B + '/api/health')).status < 500) break; } catch { /* starting */ }
    await wait(150);
  }
  const Hank = await login('Hank');
  const Gus = await login('Gus');
  const Mina = await login('Mina');

  // Plant a hatched guide without starting a shift (a quit can summon the Foreman).
  const planted = await Mina.call('POST', '/dev/heeshee', { on: false, bug: true });
  const barn2 = await Mina.call('GET', '/barn');
  check(barn2.pen?.stage === 'creature' || planted.bug?.name, `Mina has a hatched guide (${barn2.pen?.stage || planted.bug?.name || 'none'})`);

  const created = await Hank.call('POST', '/tables', { name: 'Turkey Night', settings: { buyIn: 200, smallBlind: 5, bigBlind: 10, nextHandDelaySeconds: 60, turnSeconds: 3600 } });
  const code = created.code;
  await Gus.call('POST', `/tables/${code}/join`);
  await Hank.call('POST', `/tables/${code}/start`);

  browser = await chromium.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  const q = '?event=on';

  // 1) Mines welcome, three viewports, no scroll.
  for (const [name, vp] of [['mines-welcome-phone', PHONE], ['mines-welcome-desktop', DESK], ['mines-welcome-short', SHORT]]) {
    const p = await page(browser, Mina, vp, `/mines${q}`);
    await dismissForeman(p);
    await p.waitForSelector('[data-test=mine-intro]', { timeout: 10000 });
    await wait(900);
    await noScroll(p, name);
    const clock = await p.locator('[data-test=mine-clock-in]').count();
    check(clock === 1, `${name}: CLOCK IN is on the page`);
    await shot(p, name);
    check(p.errs.length === 0, `${name}: no page errors (${p.errs[0] || 'none'})`);
    await p._ctx.close();
  }

  // 2) Lobby turkey (desktop always; phone if the marquee is shown).
  for (const [name, vp] of [['lobby-turkey-desktop', DESK], ['lobby-turkey-phone', PHONE]]) {
    const p = await page(browser, Hank, vp, `/${q}`);
    await wait(400);
    const turkey = await p.locator('[data-test=neon-turkey]').count();
    const bill = await p.locator('[data-test=neon-bill]').count();
    if (vp === DESK) {
      check(turkey >= 1, `${name}: neon turkey is up`);
      check(bill === 0, `${name}: cowboy is not up during the event`);
    } else {
      console.log(`${name}: turkey=${turkey} bill=${bill} (marquee may hide on a narrow lobby)`);
    }
    await shot(p, name);
    await p._ctx.close();
  }

  // 3) Guntrad's line stays up (no bubble=1 needed).
  for (const [name, vp] of [['guntrad-bubble-desktop', DESK], ['guntrad-bubble-phone', PHONE]]) {
    const p = await page(browser, Hank, vp, `/t/${code}${q}`);
    await p.waitForSelector('.dealer-fig, [data-test=crucible-say]', { timeout: 10000 }).catch(() => null);
    await wait(500);
    const visible = await p.locator('[data-test=crucible-say]').isVisible().catch(() => false);
    check(visible, `${name}: Crucible bubble is visible without cycling`);
    const text = visible ? await p.locator('[data-test=crucible-say]').innerText() : '';
    check(!visible || /Because it is my name!!!/.test(text), `${name}: line is exact`);
    await wait(1200);
    const still = await p.locator('[data-test=crucible-say]').isVisible().catch(() => false);
    check(still, `${name}: bubble still visible a second later`);
    await shot(p, name);
    await p._ctx.close();
  }

  // 4) Companion present at t≈0.
  const p = await page(browser, Mina, DESK, `/mines${q}`);
  await dismissForeman(p);
  await p.waitForSelector('[data-test=mine-clock-in]', { timeout: 10000 });
  const t0 = Date.now();
  await p.locator('[data-test=mine-clock-in]').click({ timeout: 8000 });
  await p.waitForSelector('canvas.m-canvas, .m-play canvas, .m-play', { timeout: 15000 });
  const appeared = Date.now() - t0;
  await wait(120); // one frame of WebGL after the canvas exists
  const elapsed = Date.now() - t0;
  check(elapsed < 4000, `clock-in to first frame in ${elapsed}ms (appear delay must not be 4s)`);
  await shot(p, 'mines-companion-t0-desktop');

  const phone = await page(browser, Mina, PHONE, `/mines${q}`);
  await dismissForeman(phone);
  // Already on a shift: the welcome may still show until we clock in on this tab.
  // Start is one-at-a-time, so just screenshot the live shift if this tab can resume — otherwise clock-in is locked.
  const clock = phone.locator('[data-test=mine-clock-in]');
  if (await clock.count()) {
    // first tab holds the shift; this one stays on the office. Close first, then clock in.
    await p._ctx.close();
    await phone.locator('[data-test=mine-clock-in]').click();
    await phone.waitForSelector('canvas.m-canvas, .m-play canvas, .m-play', { timeout: 15000 }).catch(() => null);
    await wait(200);
    await shot(phone, 'mines-companion-t0-phone');
  } else {
    await p._ctx.close();
    await shot(phone, 'mines-companion-t0-phone');
  }
  await phone._ctx.close();
  console.log('clock-in appeared in', appeared, 'ms');
} finally {
  try { await browser?.close(); } catch { /* */ }
  shutdown();
}

if (fails.length) {
  console.error(`\n${fails.length} fail(s):\n` + fails.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
console.log('welcome + turkey e2e ok');
