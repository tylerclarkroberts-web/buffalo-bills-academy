// SCUM chat bubbles: seated players' Say bubbles over their avatars, same as Hold'em.
// Writes desktop 1280 and iPhone 15 screenshots with seeded demo data. Hides Guntrad and the faun.
//   npm run build && PLAYWRIGHT_DIR=/workspace/pw/package.json CHROME=/usr/bin/google-chrome OUT=/workspace/bba-scum-bubbles-shots node scripts/e2e-scum-chat-bubbles.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || '/workspace/bba-scum-bubbles-shots';
const PORT = Number(process.env.PORT || 4018);
const B = `http://127.0.0.1:${PORT}`;
const PW = process.env.PLAYWRIGHT_DIR || '/workspace/pw/package.json';
const { chromium, devices } = createRequire(PW)('playwright-core');

const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await wait(step);
  }
};

const DESK = { width: 1280, height: 800, isMobile: false, hasTouch: false, deviceScaleFactor: 2 };
const IPHONE = (() => {
  const d = devices['iPhone 15'];
  if (d) return { ...d.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: d.deviceScaleFactor || 3, userAgent: d.userAgent };
  return { width: 393, height: 852, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
})();

const HIDE = `
  .dealer-fig, .dl-plate, .dl-img, .dl-face, .dl-head, .dl-body, .dl-glow,
  img[src*="dealer"], img[alt*="Guntrad" i],
  [data-test="fawn"], .fn { display: none !important; visibility: hidden !important; }
`;

fs.mkdirSync(OUT, { recursive: true });
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'scum-bubbles-e2e-'));

function boot() {
  const p = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: DATA,
      DEV_LOGIN: '1',
      SCUM_TICK_MS: '0',
      SCUM_BOT_MS: '0',
      SLACK_BOT_TOKEN: '',
      PUBLIC_URL: '',
      STATIC_DIR: path.join(ROOT, 'dist'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stderr.on('data', (d) => process.stderr.write(d));
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server start timeout')), 20000);
    p.stdout.on('data', (d) => { if (String(d).includes('running')) { clearTimeout(t); res(p); } });
    p.on('exit', (c) => { clearTimeout(t); rej(new Error(`server exited ${c}`)); });
  });
}
const stop = (p) => new Promise((r) => { p.on('exit', r); p.kill('SIGTERM'); });

async function call(cookie, method, url, body) {
  const r = await fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (r.status >= 400) throw new Error(`${method} ${url} ${r.status} ${JSON.stringify(j)}`);
  return { body: j, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}

async function openPage(browser, cookie, view) {
  const ctx = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: view.deviceScaleFactor || 2,
    isMobile: !!view.isMobile,
    hasTouch: !!view.hasTouch,
    reducedMotion: 'reduce',
    ...(view.userAgent ? { userAgent: view.userAgent } : {}),
  });
  const [name, value] = cookie.split('=');
  await ctx.addCookies([{ name, value, url: B }]);
  await ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, HIDE);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { console.log('pageerror', e.message); fails.push(`pageerror ${e.message}`); });
  return p;
}

const shot = async (p, n) => {
  const dest = path.join(OUT, `${n}.png`);
  await p.screenshot({ path: dest, fullPage: false });
  console.log('shot', dest);
  return dest;
};

const noScroll = async (p, label) => {
  const s = await p.evaluate(() => ({ h: document.documentElement.scrollHeight, v: innerHeight, w: document.documentElement.scrollWidth, vw: innerWidth }));
  check(s.h <= s.v + 2 && s.w <= s.vw + 2, `${label}: no scroll (${s.w}x${s.h} in ${s.vw}x${s.v})`);
};

const overlap = (a, b) => a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const srv = await boot();
try {
  const people = [
    { name: 'Ann', email: 'ann-bubbles@example.test', seed: 'scum-bubbles-ann', line: 'Nice lead, Cat.' },
    { name: 'Bob', email: 'bob-bubbles@example.test', seed: 'scum-bubbles-bob', line: 'I have a plan.' },
    { name: 'Cat', email: 'cat-bubbles@example.test', seed: 'scum-bubbles-cat', line: 'Watch this pile.' },
    { name: 'Dee', email: 'dee-bubbles@example.test', seed: 'scum-bubbles-dee', line: 'Pass from me.' },
  ];
  const cookies = {};
  for (const u of people) {
    const r = await call(null, 'POST', '/auth/dev', { name: u.name, email: u.email });
    cookies[u.name] = r.cookie;
    await call(r.cookie, 'POST', '/api/me/avatar', { kind: 'gen', seed: u.seed });
  }

  const created = await call(cookies.Ann, 'POST', '/api/scum/tables', { name: "Ann's scum table", settings: { bots: 0, maxSeats: 6, turnSec: 86400 } });
  const code = created.body.code;
  for (const name of ['Bob', 'Cat', 'Dee']) await call(cookies[name], 'POST', `/api/scum/tables/${code}/join`);
  const started = await call(cookies.Ann, 'POST', `/api/scum/tables/${code}/start`);
  check(started.body.status === 'playing', `dealt a 4-player table (${started.body.status})`);

  // Rotate until the player opposite Ann (top/north seat) is to act, so shots cover the status-vs-turn-pill case.
  const view0 = await call(cookies.Ann, 'GET', `/api/scum/tables/${code}`);
  const ringOf = (v) => {
    const r = v.round;
    const order = (r?.order || v.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)).filter((i) => v.seats[i]);
    const extra = v.seats.map((s, i) => (s && !order.includes(i) ? i : -1)).filter((i) => i >= 0);
    const ring = [...order, ...extra];
    const meAt = Math.max(0, ring.indexOf(v.mySeat));
    return [...ring.slice(meAt), ...ring.slice(0, meAt)];
  };
  const topSeat = ringOf(view0.body)[2];
  check(topSeat != null && view0.body.seats[topSeat], `top seat is ${view0.body.seats[topSeat]?.name || topSeat}`);
  for (let i = 0; i < 12 && (await call(cookies.Ann, 'GET', `/api/scum/tables/${code}`)).body.round?.turn !== topSeat; i++) {
    const v = (await call(cookies.Ann, 'GET', `/api/scum/tables/${code}`)).body;
    const actor = v.seats[v.round.turn];
    if (!actor) throw new Error(`no actor at seat ${v.round.turn}`);
    if (v.round.leading || !v.round.pile) {
      const av = (await call(cookies[actor.name], 'GET', `/api/scum/tables/${code}`)).body;
      const card = av.round?.hand?.[0];
      if (!card) throw new Error(`${actor.name} has no card to lead`);
      await call(cookies[actor.name], 'POST', `/api/scum/tables/${code}/play`, { cards: [card] });
    } else {
      await call(cookies[actor.name], 'POST', `/api/scum/tables/${code}/pass`);
    }
  }
  const ready = (await call(cookies.Ann, 'GET', `/api/scum/tables/${code}`)).body;
  const leader = ready.seats[ready.round?.turn];
  check(ready.round?.turn === topSeat, `turn is on the top seat (${leader?.name}, seat ${ready.round?.turn})`);

  // Post bubbles after the deal (and after any rotation) so the current actor can still say.
  for (const u of people) {
    await call(cookies[u.name], 'POST', `/api/scum/tables/${code}/say`, { text: u.line });
  }
  const checkView = await call(cookies.Ann, 'GET', `/api/scum/tables/${code}`);
  const withSay = (checkView.body.seats || []).filter((s) => s && s.say?.text);
  check(withSay.length >= 3, `at least 3 seat bubbles in the view (got ${withSay.length})`);
  console.log('bubbles', withSay.map((s) => `${s.name}: ${s.say.text}`).join(' | '), 'leader', leader?.name, 'top', ready.seats[topSeat]?.name);

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });

  for (const [view, tag] of [[DESK, 'desktop-1280'], [IPHONE, 'iphone-15']]) {
    const p = await openPage(browser, cookies.Ann, view);
    await p.goto(`${B}/scum/${code}`);
    await p.waitForSelector('[data-test=scum-table]');
    await p.waitForSelector('[data-test=say-bubble]', { timeout: 8000 });
    const n = await p.locator('[data-test=say-bubble]').count();
    check(n >= 3, `${tag}: ${n} bubbles visible`);
    check(await p.locator('[data-test=scum-say-btn]').count() === 1, `${tag}: Say button is in the header`);
    await until(() => p.locator('[data-test=scum-arena] .bj-rail').count().then((c) => c >= 4));
    await wait(300);
    await shot(p, tag);
    await noScroll(p, tag);

    const boxes = await p.evaluate(() => {
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const vp = { x: 0, y: 0, width: innerWidth, height: innerHeight };
      const bubbles = [...document.querySelectorAll('[data-test=say-bubble]')].map((el) => box(el));
      const title = document.querySelector('.sc-felt .bj-head h1');
      return {
        vp,
        bubbles,
        bar: box(document.querySelector('[data-test=scum-bar]')),
        play: box(document.querySelector('[data-test=scum-play]')),
        pass: box(document.querySelector('[data-test=scum-pass]')),
        hand: box(document.querySelector('[data-test=scum-hand]')),
        pile: box(document.querySelector('[data-test=scum-pile]')),
        status: box(document.querySelector('[data-test=scum-status]')),
        turn: box(document.querySelector('[data-test=scum-turn-label]')),
        turnNorth: !!document.querySelector('.sc-seat.north [data-test=scum-turn-label], .sc-seat.north .sc-turnlbl'),
        title: title ? { box: box(title), text: title.textContent, shown: title.innerText, scroll: title.scrollWidth, client: title.clientWidth } : null,
      };
    });
    const inView = (b) => b && b.x >= -4 && b.y >= -4 && b.x + b.width <= boxes.vp.width + 4 && b.y + b.height <= boxes.vp.height + 4;
    check(boxes.bubbles.every(inView), `${tag}: every bubble stays in the viewport`);
    const covers = (label, target) => {
      if (!target) return;
      const hit = boxes.bubbles.some((b) => overlap(b, target));
      check(!hit, `${tag}: bubbles do not cover ${label}`);
    };
    covers('the action bar', boxes.bar);
    covers('Play', boxes.play);
    covers('Pass', boxes.pass);
    covers('your hand', boxes.hand);
    check(boxes.status && boxes.status.height > 0, `${tag}: status line is visible`);
    check(boxes.turnNorth, `${tag}: turn pill is on the north seat`);
    check(boxes.turn && !overlap(boxes.status, boxes.turn), `${tag}: turn pill does not cover the status line`);
    if (boxes.status && boxes.turn) {
      const gap = boxes.turn.y - (boxes.status.y + boxes.status.height);
      console.log(tag, 'status/turn gap', gap.toFixed(1), 'px');
    }
    if (boxes.title) console.log(tag, 'title:', JSON.stringify(boxes.title.shown), 'scroll', boxes.title.scroll, 'client', boxes.title.client);
    // The pile is in the middle; a small overlap with a far bubble is still a miss, so only fail if a bubble covers its center.
    if (boxes.pile) {
      const c = { x: boxes.pile.x + boxes.pile.width * 0.25, y: boxes.pile.y + boxes.pile.height * 0.25, width: boxes.pile.width * 0.5, height: boxes.pile.height * 0.5 };
      const hit = boxes.bubbles.some((b) => overlap(b, c));
      check(!hit, `${tag}: bubbles do not cover the center of the pile`);
    }
    await p.context().close();
  }

  await browser.close();
} finally {
  await stop(srv);
  fs.rmSync(DATA, { recursive: true, force: true });
}

if (fails.length) {
  console.error(`\n${fails.length} failed:\n` + fails.map((f) => ` - ${f}`).join('\n'));
  process.exit(1);
}
console.log('all ok');
