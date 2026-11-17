// v76: bug HP persists after a barn bout; only the Bug Center heals it. Two pairs of fake players (one for the phone,
// one for desktop): the host's bug is set weak so the guest wins but walks away hurt. Checks the post-bout prompt,
// the HP pill and hurt line in the barn, the loser fainted in the ring, the nurse reading out HP and healing it to full.
// Screenshots go to OUT.   npm run build && PLAYWRIGHT_DIR=... OUT=dir node scripts/e2e-bug-hp.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4190 + Math.floor(Math.random() * 9), B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bughp-'));
const ENV = { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BARN_TEST_EGG: '1', BARN_INCUBATE_MS: '300', BARN_TEST_SPECIES: '1', BARN_TEST_XP: '400' };
let srv = null;
const boot = async () => {
  srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: ENV, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(B + '/api/health')).status < 500) return; } catch { /* starting */ } await wait(150); }
};
const halt = () => new Promise((r) => { srv.once('exit', r); srv.kill(); });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = { w: 390, h: 844, m: true }, DESK = { w: 1280, h: 800 };
const noScroll = (p) => p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1);
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const call = async (m, u, b) => { const x = await fetch(B + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); return x.json(); };
  const post = (u, b) => call('POST', u, b || {});
  await post('/me/avatar', { kind: 'gen', seed: name });
  return { name, cookie, sid: cookie.split('=')[1], post, get: (u) => call('GET', u) };
}
async function hatch(me, species) {
  const s = await me.post('/mines/start', { rulesVersion: 2 });
  await me.post('/mines/egg', { shiftId: s.shiftId });
  await me.post('/mines/quit', { shiftId: s.shiftId });
  await wait(500); await me.get('/barn');
  await me.post('/dev/species', { id: species });
}
async function page(browser, me, vp, url) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'bba_sid', value: me.sid, url: B }]);
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(B + url); return p;
}
const talkTo = async (p) => {
  await p.click('[data-test=bc-talk]'); await p.waitForSelector('[data-test=bc-portrait]');
  for (let i = 0; i < 14 && !(await p.$('[data-test=bc-yes]')); i++) { await p.click('[data-test=bc-dialogue]', { position: { x: 30, y: 30 } }); await wait(450); }
};

let browser;
try {
  await boot();
  const pairs = [['phone', PHONE, 'Hank', 'Gus'], ['desktop', DESK, 'Dot', 'Earl']];
  const people = {};
  for (const [, , host, guest] of pairs) {
    people[host] = await login(host, `${host.toLowerCase()}@hp.test`); people[guest] = await login(guest, `${guest.toLowerCase()}@hp.test`);
    await hatch(people[host], 'manticora'); await hatch(people[guest], 'phanaeus');
  }
  // Rig the fight on disk: hosts level 3 at 15% HP, guests level 6 at 85%. Restart so the server loads it.
  await halt();
  const file = path.join(dir, 'barn.json'), doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = JSON.parse(fs.readFileSync(path.join(dir, 'players.json'), 'utf8'));
  const idOf = (name) => Object.values(ids.players || ids).find((p) => p && p.name === name)?.id;
  for (const [, , host, guest] of pairs) {
    doc.pens[idOf(host)].xp = 40 * 4; doc.pens[idOf(host)].health = 15;
    doc.pens[idOf(guest)].xp = 40 * 25; doc.pens[idOf(guest)].health = 85; // already scuffed, so it's surely hurt after
  }
  fs.writeFileSync(file, JSON.stringify(doc));
  await boot();
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [n, vp, host, guest] of pairs) {
    const H = people[host], G = people[guest];
    const hv = await H.get('/barn');
    check(hv.pen.hurt === true && hv.pen.health === 15, `${n}: ${host}'s bug starts hurt (${hv.pen.hp}/${hv.pen.maxHp})`);
    const posted = await H.post('/barn/bouts', { stake: 0 });
    check(!!posted.openBout, `${n}: a hurt bug can still post a bout`);
    const p = await page(browser, G, vp, '/barn');
    await p.waitForSelector('[data-test=barn-creature]');
    check(!!(await p.$('[data-test=barn-hurt]')), `${n}: a scuffed bug already shows the hurt prompt`);
    await p.click('[data-test=ring-toggle]'); await p.waitForSelector('[data-test=bout-join]');
    await p.click('[data-test=bout-join]');
    await p.waitForSelector('[data-test=bout][data-done="1"]', { timeout: 90000 }); // #114: bouts play out live, a beat every few seconds
    const result = await p.getAttribute('[data-test=bout]', 'data-result');
    const after = await G.get('/barn');
    console.log(`     ${n}: ${guest} ${result}; HP ${after.pen.hp}/${after.pen.maxHp} (${after.pen.health}%)`);
    check(result === 'won', `${n}: the strong guest won`);
    if (after.pen.hurt) {
      check(!!(await p.$('[data-test=bout-hurt]')), `${n}: after the bout: "Your bug is hurt — visit the Bug Center →"`);
      await wait(300); await shot(p, `01-post-bout-hurt-prompt-${n}`);
      await p.click('[data-test=bout-close]'); await wait(400);
      await p.click('[data-test=ring-toggle]'); await p.waitForSelector('[data-test=barn-creature]'); await wait(400);
      check(!!(await p.$('[data-test=barn-hp]')), `${n}: HP shows on the bug in the barn`);
      check((await p.textContent('[data-test=barn-hp]')).includes(`${after.pen.hp}/${after.pen.maxHp}`), `${n}: HP pill reads ${after.pen.hp}/${after.pen.maxHp}`);
      check(!!(await p.$('[data-test=barn-hurt]')), `${n}: hurt line in the barn`);
      check(await noScroll(p), `${n}: barn fits without scrolling`);
      await shot(p, `02-barn-hp-hurt-${n}`);
      await p.click('[data-test=barn-hurt]'); await p.waitForSelector('[data-test=bug-center]'); await wait(500);
      check(/HP/.test(await p.textContent('[data-test=bc-status]').catch(() => '')), `${n}: the Bug Center shows the HP`);
      await shot(p, `03-bug-center-hurt-status-${n}`);
      await talkTo(p);
      await p.click('[data-test=bc-en]'); await wait(250);
      check(/heal on its own|hurt/.test(await p.textContent('[data-test=bc-dialogue]')), `${n}: the nurse says it won't heal on its own`);
      await shot(p, `04-nurse-hurt-offer-${n}`);
      await p.click('[data-test=bc-yes]'); await p.waitForSelector('[data-test=bc-healing]'); await wait(1500);
      await shot(p, `05-nurse-healing-${n}`);
      await p.waitForSelector('[data-test=bc-dialogue]', { timeout: 8000 }); await wait(1800);
      await shot(p, `06-nurse-healed-${n}`);
      const healed = await G.get('/barn');
      check(healed.pen.health === 100 && !healed.pen.hurt && healed.pen.hp === healed.pen.maxHp, `${n}: healed to full (${healed.pen.hp}/${healed.pen.maxHp})`);
      await p.goto(B + '/barn'); await p.waitForSelector('[data-test=barn-creature]'); await wait(400);
      check(!(await p.$('[data-test=barn-hurt]')), `${n}: no hurt line once healed`);
      await shot(p, `07-barn-full-hp-${n}`);
    } else check(false, `${n}: the guest took no damage, so there is nothing to screenshot (rerun)`);
    // The loser fainted in the ring
    const lv = await H.get('/barn');
    check(lv.pen.fainted === true && lv.pen.faintedIn === 'ring' && lv.pen.hp === 0, `${n}: ${host}'s bug fainted in the ring`);
    const lp = await page(browser, H, vp, '/barn');
    await lp.waitForSelector('[data-test=barn-fainted]'); await wait(400);
    check(/in the ring/.test(await lp.textContent('[data-test=barn-fainted]')), `${n}: barn says fainted in the ring`);
    await shot(lp, `08-barn-loser-fainted-${n}`);
    check(!p.errs.length && !lp.errs.length, `${n}: no page errors ${[...p.errs, ...lp.errs].join(' | ')}`);
  }
} catch (e) { console.error(e); fails.push(String(e.message)); }
finally { await browser?.close(); srv?.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
