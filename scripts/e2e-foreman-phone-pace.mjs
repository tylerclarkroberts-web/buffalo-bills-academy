// The Foreman's temporary phone pace in real browsers: an emulated iPhone (WebKit) is shown "Phone pace: 35 WPM
// today" and passes typing keystroke by keystroke at ~50 WPM; a multi-letter insert (predictive text / autocorrect)
// is stopped before it lands; an Android phone (Chromium, Pixel) is also on the phone pace; a desktop is shown 80.
// With MOBILE_TYPING_UNTIL=off (what happens after the end time) the same iPhone needs 80 and 50 WPM fails.
// In-process throwaway servers: no real data, no Slack.
//   npm run build && PLAYWRIGHT_DIR=... OUT=dir npm run e2e:foreman-phone
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { createApp } from '../server/app.js';
import { TYPING_PRAISE } from '../server/foremanTyping.js';

const req = createRequire(path.join(process.env.PLAYWRIGHT_DIR || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules', 'x.js'));
const { chromium, webkit, devices } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || '';
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };

async function boot(until) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-fm-phone-e2e-'));
  // The pace window is pinned relative to now so this test keeps working after the real end time.
  const { app, service, shutdown } = createApp({ dataDir: dir, staticDir: path.join(ROOT, 'dist'), env: { ...process.env, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', EVENT_THEME: 'off', MOBILE_TYPING_UNTIL: until }, marketSources: {}, snapshots: false });
  const server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  const B = `http://127.0.0.1:${server.address().port}`;
  let n = 0;
  async function typist() {
    const name = `Thumbs${++n}`;
    const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name.toLowerCase()}@phone.test` }) });
    const cookie = r.headers.get('set-cookie').split(';')[0], { id } = await r.json();
    await fetch(B + '/api/me/avatar', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ kind: 'gen', seed: name }) });
    service.mines.foreman.scoldTyping(id); // the Heeshee lock, planted directly
    return { id, sid: cookie.split('=')[1], prompt: service.mines.foreman.doc.pending[id].prompt };
  }
  return { B, service, typist, log: () => service.mines.foreman.doc.typingLog, async close() { shutdown(); await new Promise((res) => server.close(res)); fs.rmSync(dir, { recursive: true, force: true }); } };
}

async function open(browser, s, me, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: s.B }]);
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p._ctx = ctx;
  await p.goto(s.B + '/mines', { waitUntil: 'domcontentloaded' });
  for (const sel of ['button:has-text("Skip for now")', '[data-test=sd-skip]', '[data-test=fawn-no]']) { const l = p.locator(sel).first(); if (await l.count()) await l.click({ timeout: 800 }).catch(() => {}); }
  for (let i = 0; i < 20 && !(await p.locator('[data-test=fm-type-input]').count()); i++) { await p.locator('.fm-next').first().click({ timeout: 1000 }).catch(() => {}); await p.waitForTimeout(150); }
  check(await p.locator('[data-test=fm-type-input]').count() > 0, `${ctxOpts.tag}: reached the typing box`);
  await p.waitForTimeout(500);
  return p;
}
const need = (p) => p.locator('[data-test=fm-need]').innerText();
async function typeAt(p, prompt, wpm) {
  const box = p.locator('[data-test=fm-type-input]');
  await box.tap().catch(() => box.click());
  const t0 = Date.now();
  await box.pressSequentially(prompt, { delay: Math.round(60_000 / (wpm * 5)), timeout: 120_000 });
  return { got: await box.inputValue(), wpm: (prompt.length / 5) / ((Date.now() - t0) / 60_000) };
}
async function submit(p) {
  await p.locator('[data-test=fm-typing-submit]').tap().catch(() => p.locator('[data-test=fm-typing-submit]').click());
  await p.waitForFunction(() => !!document.querySelector('[data-test=fm-typing-pass], [data-test=fm-typing-result]'), null, { timeout: 15000 }).catch(() => null);
  return { passed: await p.locator('[data-test=fm-typing-pass]').count() > 0, body: await p.locator('body').innerText() };
}

let wk, cr, s;
try {
  wk = await webkit.launch();
  cr = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const IPHONE = { ...devices['iPhone 13'], tag: 'iphone' }; delete IPHONE.defaultBrowserType;
  const PIXEL = { ...devices['Pixel 7'], tag: 'android' }; delete PIXEL.defaultBrowserType;
  const DESK = { viewport: { width: 1280, height: 800 }, tag: 'desktop' };
  const ctxOf = (o) => { const { tag: _t, ...rest } = o; return { ...rest, tag: o.tag }; };

  s = await boot(String(Date.now() + 3600e3));
  // 1. iPhone (WebKit): the phone pace, a blocked multi-letter insert, then a pass at ~50 WPM.
  let me = await s.typist(), p = await open(wk, s, me, ctxOf(IPHONE));
  const shown = await need(p);
  check(/Phone pace: 35 WPM today/.test(shown), `iphone: the target says "${shown}"`);
  const fmLine = await p.locator('.fm-line').textContent(); check(/35 a minute today/.test(fmLine), `iphone: the Foreman says the phone pace too ("${fmLine}")`);
  await shot(p, 'phone-pace-iphone-01-target');
  await p.locator('[data-test=fm-type-input]').tap();
  await p.keyboard.insertText('Tyler ');
  check((await p.locator('[data-test=fm-type-input]').inputValue()) === '', 'iphone: a multi-letter insert (predictive text) is stopped before it lands');
  const typed = await typeAt(p, me.prompt, 50);
  check(typed.got === me.prompt, `iphone: typed the whole prompt (${typed.got.length}/${me.prompt.length})`);
  check(typed.wpm > 38 && typed.wpm < 70, `iphone: typed at ~${typed.wpm.toFixed(1)} WPM (under 80)`);
  const fmWpm = await p.locator('[data-test=fm-wpm] b').getAttribute('class');
  check(fmWpm === 'ok', 'iphone: the live WPM turns green against 35');
  await shot(p, 'phone-pace-iphone-02-typed');
  let res = await submit(p);
  check(res.passed && res.body.includes(TYPING_PRAISE.slice(0, 20)), 'iphone: passed at ~50 WPM on the phone pace');
  await shot(p, 'phone-pace-iphone-03-passed');
  const sub = s.log().filter((r) => r.k === 'submit' && r.p === me.id).at(-1);
  check(sub?.passed && sub.needWpm === 35 && sub.phone === true && sub.maxInsert <= 2 && sub.inserts >= Math.ceil(me.prompt.length * 0.9), `iphone: the server graded it against 35 with an honest trace (${JSON.stringify({ need: sub?.needWpm, ins: sub?.inserts, max: sub?.maxInsert })})`);
  check(!p.errs.length, `iphone: no page errors ${p.errs.join(' | ')}`);
  await p._ctx.close();

  // 2. Android phone (Chromium, Pixel 7 UA + client hint): phone pace too.
  me = await s.typist(); p = await open(cr, s, me, ctxOf(PIXEL));
  check(/Phone pace: 35 WPM today/.test(await need(p)), `android: the target says "${await need(p)}"`);
  await shot(p, 'phone-pace-android-04-target'); await p._ctx.close();

  // 3. Desktop: still 80.
  me = await s.typist(); p = await open(cr, s, me, ctxOf(DESK));
  const deskNeed = await need(p);
  check(/^80 WPM/.test(deskNeed) && !/Phone/.test(deskNeed), `desktop: the target says "${deskNeed}"`);
  await shot(p, 'phone-pace-desktop-05-target'); await p._ctx.close();
  await s.close(); s = null;

  // 4. After the end time (MOBILE_TYPING_UNTIL=off): the iPhone needs 80 and ~50 WPM fails on speed.
  s = await boot('off');
  me = await s.typist(); p = await open(wk, s, me, ctxOf(IPHONE));
  const late = await need(p);
  check(/^80 WPM/.test(late) && !/Phone/.test(late), `after the end: the iPhone target says "${late}"`);
  await typeAt(p, me.prompt, 50);
  res = await submit(p);
  check(!res.passed && /TOO SLOW/.test(res.body), 'after the end: ~50 WPM on the iPhone fails on speed');
  await shot(p, 'phone-pace-iphone-06-after-end');
  await p._ctx.close();
} catch (e) { fails.push(e.stack || String(e)); console.error(e); }
finally { await wk?.close(); await cr?.close(); await s?.close(); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
