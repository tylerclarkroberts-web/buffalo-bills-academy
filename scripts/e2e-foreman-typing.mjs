// Foreman typing test in a real browser: type the prompt keystroke by keystroke at ~100 WPM and pass.
// Confirms the native beforeinput trace (React's onBeforeInput has no inputType).
//   npm run build && PLAYWRIGHT_DIR=... npm run e2e:foreman-typing
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { TYPING_PRAISE } from '../server/foremanTyping.js';

const PLAYWRIGHT_DIR = process.env.PLAYWRIGHT_DIR || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules';
const req = createRequire(path.join(PLAYWRIGHT_DIR, 'x.js'));
const { chromium, webkit } = req('playwright-core');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || '';
const PORT = 4370 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-fm-type-e2e-'));
const ENV = {
  ...process.env,
  PORT: String(PORT),
  DATA_DIR: dir,
  STATIC_DIR: path.join(ROOT, 'dist'),
  DEV_LOGIN: '1',
  SLACK_BOT_TOKEN: '',
  EVENT_THEME: 'off',
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };

const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'ignore', 'inherit'] });

async function login(name) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name.toLowerCase()}@type-e2e.test` }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, u, b) => {
    const x = await fetch(B + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined });
    const text = await x.text();
    try { return { status: x.status, body: JSON.parse(text) }; } catch { return { status: x.status, body: text }; }
  };
  return { name, sid: cookie.split('=')[1], cookie, call };
}

async function armTyping(me) {
  const hook = await me.call('POST', '/dev/heeshee', { on: true, bug: true });
  check(!!hook.body?.bug?.name, `planted a guide (${hook.body?.bug?.name || hook.body?.bug?.error || 'none'})`);
  const start = await me.call('POST', '/mines/start', { rulesVersion: 2 });
  check(start.status === 200 && start.body?.heeshee, `shift has the Heeshee (${start.status})`);
  const shiftId = start.body.shiftId;
  const seen = await me.call('POST', '/mines/heeshee/seen', { shiftId });
  check(seen.status === 200, 'reported the sighting');
  const quit = await me.call('POST', '/mines/quit', { shiftId, rulesVersion: 2 });
  check(quit.body?.pending?.kind === 'typing', `quit armed the typing test (${quit.body?.pending?.kind})`);
  const view = await me.call('GET', '/mines/foreman');
  check(!!view.body?.pending?.prompt, 'foreman has a prompt');
  return view.body.pending;
}

async function openPage(browser, me) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(B + '/mines', { waitUntil: 'domcontentloaded', timeout: 30000 });
  for (const sel of ['button:has-text("Skip for now")', '[data-test=sd-skip]', '[data-test=fawn-no]']) {
    const loc = p.locator(sel).first();
    if (await loc.count()) { try { await loc.click({ timeout: 800 }); } catch { /* gone */ } }
  }
  p._ctx = ctx;
  return p;
}

async function skipRant(p) {
  for (let i = 0; i < 12; i++) {
    if (await p.locator('[data-test=fm-type-input]').count()) return true;
    const btn = p.locator('.fm-next').first();
    if (await btn.count()) { try { await btn.click({ timeout: 1000 }); } catch { /* */ } }
    await wait(150);
  }
  return (await p.locator('[data-test=fm-type-input]').count()) > 0;
}

async function typePrompt(p, prompt, wpm = 100) {
  const delay = Math.round(60_000 / (wpm * 5)); // 120ms at 100 WPM
  const box = p.locator('[data-test=fm-type-input]');
  await box.click();
  const started = Date.now();
  // Keystroke by keystroke: never fill() or paste, which would be a dump.
  await box.pressSequentially(prompt, { delay });
  const elapsed = Date.now() - started;
  const got = await box.inputValue();
  return { got, elapsed, delay };
}

async function runIn(kind, browserType, launchOpts, me, prompt) {
  const browser = await browserType.launch(launchOpts);
  try {
    const p = await openPage(browser, me);
    check(await skipRant(p), `${kind}: reached the typing box`);
    const typed = await typePrompt(p, prompt, 100);
    check(typed.got === prompt, `${kind}: typed the full prompt (${typed.got.length}/${prompt.length})`);
    const estWpm = (typed.got.length / 5) / (typed.elapsed / 60_000);
    check(estWpm >= 80 && estWpm <= 160, `${kind}: pace ~100 WPM (got ${estWpm.toFixed(1)} in ${typed.elapsed}ms)`);
    await p.locator('[data-test=fm-typing-submit]').click();
    await p.waitForFunction((praise) => document.body.innerText.includes(praise), TYPING_PRAISE, { timeout: 15000 }).catch(() => null);
    const body = await p.locator('body').innerText();
    const jab = await p.locator('[data-test=fm-typing-result]').count();
    check(body.includes("WELL I'LL BE") || body.includes('You can type'), `${kind}: the Foreman praised a pass`);
    check(jab === 0, `${kind}: no fail jab on screen`);
    if (OUT) {
      fs.mkdirSync(OUT, { recursive: true });
      await p.screenshot({ path: path.join(OUT, `foreman-typing-${kind}.png`) });
    }
    check(p.errs.length === 0, `${kind}: no page errors (${p.errs[0] || 'none'})`);
    await p._ctx.close();
  } finally {
    await browser.close();
  }
}

let shutting = false;
const shutdown = () => {
  if (shutting) return;
  shutting = true;
  try { srv.kill('SIGTERM'); } catch { /* */ }
};
process.on('exit', shutdown);

try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(B + '/api/health')).status < 500) break; } catch { /* starting */ }
    await wait(150);
  }
  const me = await login('Typist');
  const pending = await armTyping(me);
  const prompt = pending.prompt;
  console.log('prompt length', prompt.length);

  await runIn('chromium', chromium, {
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  }, me, prompt);

  // A second typist for WebKit so the lock is fresh.
  const wes = await login('WebKitTypist');
  const again = await armTyping(wes);
  try {
    await runIn('webkit', webkit, {}, wes, again.prompt);
  } catch (e) {
    check(false, `webkit launch: ${e.message || e}`);
  }

  const disk = JSON.parse(fs.readFileSync(path.join(dir, 'foreman.json'), 'utf8'));
  const submits = (disk.typingLog || []).filter((r) => r.k === 'submit');
  check(submits.some((r) => r.passed === true && r.inserts >= Math.ceil(prompt.length * 0.9)), 'log: a pass recorded enough keystroke inserts');
  check(!submits.some((r) => r.fail === 'keys' && r.passed === false && r.p), 'log: no keys fail for these honest typists');
} finally {
  shutdown();
}

if (fails.length) {
  console.error(`\n${fails.length} fail(s):\n` + fails.map((f) => ' - ' + f).join('\n'));
  process.exit(1);
}
console.log('foreman typing e2e ok');
