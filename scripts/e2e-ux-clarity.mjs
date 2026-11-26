// Screenshots for the challenge wait chip, Ring how-it-works note, and Hold'em Buy back in bar.
// Throwaway DEV_LOGIN server. Does not deploy. Keeps Guntrad out of the frames.
//   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-ux-clarity.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { riggedDeck } from '../test/helpers.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4240 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-ux-clarity-'));
const INCUBATE = 400;
const ENV = { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BARN_TEST_EGG: '1', BARN_INCUBATE_MS: String(INCUBATE), BARN_TEST_SPECIES: '1', BARN_TEST_XP: '400' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'ignore', 'inherit'] });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const PHONE = { w: 390, h: 844, m: true }, DESK = { w: 1280, h: 800 };
const HIDE = '.dealer-spot,.bit-quip,.dl-plate,[data-test=fawn],.fn{visibility:hidden!important;opacity:0!important;pointer-events:none!important}';

async function login(name) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name.toLowerCase()}@clarity.test` }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, u, b) => {
    const x = await fetch(B + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined });
    const text = await x.text();
    try { return JSON.parse(text); } catch { throw new Error(u + ' ' + x.status + ' ' + text.slice(0, 200)); }
  };
  await call('POST', '/me/avatar', { kind: 'gen', seed: name });
  return { name, sid: cookie.split('=')[1], cookie, call };
}
async function egg(me) { const s = await me.call('POST', '/mines/start', { rulesVersion: 2 }); await me.call('POST', '/mines/egg', { shiftId: s.shiftId }); await me.call('POST', '/mines/quit', { shiftId: s.shiftId }); }
async function page(browser, me, vp, url) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1 });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('bba.barnSound', '0'); } catch { /* private */ } });
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(B + url, { waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: HIDE });
  return p;
}
async function dismiss(p) {
  for (const sel of ['button:has-text("Skip for now")', '[data-test=sd-skip]', '.fo-decline', '[data-test=fawn-no]', '[data-test=table-sweep]']) {
    const loc = p.locator(sel).first();
    if (await loc.count()) { try { await loc.click({ timeout: 600 }); } catch { /* gone */ } }
  }
}

let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(B + '/api/health')).status < 500) break; } catch { /* starting */ } await wait(150); }
  const Hank = await login('Hank'), Gus = await login('Gus'), Opal = await login('Opal');
  await egg(Hank); await egg(Gus); await egg(Opal);
  await wait(INCUBATE + 400);
  await Hank.call('GET', '/barn'); await Gus.call('GET', '/barn'); await Opal.call('GET', '/barn');
  await Hank.call('POST', '/dev/species', { id: 'manticora' });
  await Gus.call('POST', '/dev/species', { id: 'phanaeus' });
  await Opal.call('POST', '/dev/species', { id: 'lamprima' });

  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });

  // Hank calls out Gus, then steps into a live bout with Opal so Accept must wait.
  const sent = await Hank.call('POST', '/barn/challenges', { to: (await Gus.call('GET', '/me')).id, stake: 100 });
  const challengeId = sent.challenges?.outgoing?.[0]?.id;
  check(!!challengeId, 'Hank sent Gus a challenge');
  const listed = await Opal.call('POST', '/barn/bouts', { stake: 0 });
  const joined = await Hank.call('POST', `/barn/bouts/${listed.openBout.id}/join`, {});
  check(!!joined.live, `Hank is in a live fight (${joined.live || 'none'})`);
  const waitLine = (await Gus.call('GET', '/barn')).challenges.incoming[0]?.wait;
  check(waitLine === 'Waiting — Hank is in a fight', `incoming wait is "${waitLine}"`);

  // Keep the fight watched so it does not run itself out during the shots.
  const watcher = await page(browser, Hank, DESK, '/barn');
  await watcher.waitForSelector('[data-test=bout], [data-test=barn]', { timeout: 8000 }).catch(() => null);

  for (const [who, vp, n] of [[Gus, DESK, 'desktop'], [Gus, PHONE, 'phone']]) {
    const p = await page(browser, who, vp, '/barn');
    await p.waitForSelector('[data-test=ring-toggle], [data-test=challenge-incoming]', { timeout: 8000 });
    if (await p.$('[data-test=ring-toggle]')) {
      const open = await p.getAttribute('[data-test=ring-toggle]', 'aria-expanded');
      if (open !== 'true') await p.click('[data-test=ring-toggle]');
    }
    await p.waitForSelector('[data-test=challenge-incoming]', { timeout: 8000 });
    // The rules are one tap away under ?, not printed on the ring.
    await p.click('[data-test=barn-help]'); await p.waitForSelector('[data-test=barn-help-panel]', { timeout: 8000 });
    const how = (await p.textContent('[data-test=barn-help-panel]')).replace(/\s+/g, ' ').trim();
    check(/One fight at a time/.test(how) && /Bug Center/.test(how), `${n}: how-it-works note is under ?`);
    await p.click('[data-test=barn-help-panel] button');
    await p.click('[data-test=challenge-incoming]');
    await p.waitForSelector('[data-test=matchup-why]', { timeout: 8000 });
    const acceptOff = await p.$eval('[data-test=challenge-accept]', (el) => el.disabled);
    const chip = (await p.textContent('[data-test=matchup-why]')).trim();
    const declineOn = !(await p.$eval('[data-test=challenge-decline]', (el) => el.disabled));
    check(acceptOff, `${n}: Accept is disabled`);
    check(/Waiting — Hank is in a fight/.test(chip), `${n}: wait chip reads "${chip}"`);
    check(declineOn, `${n}: Decline stays enabled`);
    await shot(p, `ring-wait-${n}`);
    if (vp.m) {
      const go = await p.locator('[data-test=challenge-accept]').boundingBox();
      check(!!go && go.y + go.height <= vp.h, 'phone: the disabled Fight button and why it waits fit on one screen');
    }
    check(!p.errs.length, `${n} barn: no page errors (${p.errs.join(' | ') || 'none'})`);
    await p.context().close();
  }
  await watcher.context().close();

  // Hold'em: a short all-in hand leaves Gus out of chips with a Buy back in button.
  const created = await Hank.call('POST', '/tables', { name: 'Friday Night', settings: { buyIn: 200, smallBlind: 5, bigBlind: 10, nextHandDelaySeconds: 60, turnSeconds: 3600 } });
  const code = created.code;
  await Gus.call('POST', `/tables/${code}/join`);
  const DEAL = riggedDeck(['As', 'Ah', '2c', '3d', '4h', '5s'], ['Kc', 'Kd', '7h', '8d', '9c']);
  await Hank.call('POST', '/dev/holdem-rig', { code, deck: DEAL });
  await Hank.call('POST', `/tables/${code}/start`);
  for (let i = 0; i < 8; i++) {
    const cur = await Hank.call('GET', `/tables/${code}`);
    if (!cur.hand) break;
    const seat = cur.seats[cur.hand.toAct];
    const u = seat?.name === 'Hank' ? Hank : Gus;
    await u.call('POST', `/tables/${code}/action`, { type: 'allin', handNumber: cur.hand.number });
  }
  const hankView = await Hank.call('GET', `/tables/${code}`);
  const gusView = await Gus.call('GET', `/tables/${code}`);
  const busted = hankView.me?.canRebuy ? Hank : gusView.me?.canRebuy ? Gus : null;
  const after = busted === Hank ? hankView : gusView;
  check(!!busted && !!after.me?.canRebuy, `${busted?.name || 'nobody'} can rebuy (Hank stack ${hankView.seats[hankView.me.seat]?.stack}, Gus stack ${gusView.seats[gusView.me.seat]?.stack})`);

  if (!busted) throw new Error('neither player can rebuy');
  for (const [who, vp, n] of [[busted, DESK, 'desktop'], [busted, PHONE, 'phone']]) {
    const p = await page(browser, who, vp, `/t/${code}`);
    await p.waitForSelector('.tp', { timeout: 8000 });
    await dismiss(p); await wait(400); await dismiss(p);
    try { await p.waitForSelector('[data-test=allin-bit]', { timeout: 2000 }); await p.waitForSelector('[data-test=allin-bit]', { state: 'detached', timeout: 10000 }); } catch { /* no punch */ }
    try { await p.waitForSelector('[data-test=table-sweep]', { timeout: 1500 }); await p.locator('[data-test=table-sweep]').click({ timeout: 800 }); } catch { /* none */ }
    await dismiss(p);
    await p.waitForSelector('[data-test=table-rebuy]', { timeout: 8000 });
    const label = (await p.textContent('[data-test=table-rebuy]')).replace(/\s+/g, ' ').trim();
    check(/Buy back in/.test(label), `${n} poker: Buy back in button reads "${label}"`);
    await shot(p, `poker-buy-back-in-${n}`);
    check(!p.errs.length, `${n} poker: no page errors (${p.errs.join(' | ') || 'none'})`);
    await p.context().close();
  }
} catch (e) { console.error(e); fails.push(String(e.message || e)); }
finally { await browser?.close(); srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
console.log(fails.length ? `\n${fails.length} FAILED\n` + fails.map((f) => ' - ' + f).join('\n') : '\nall good');
process.exit(fails.length ? 1 : 0);
