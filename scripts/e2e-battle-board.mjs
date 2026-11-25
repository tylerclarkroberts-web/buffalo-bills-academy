// Phone stills and a tap-through of the bug battle board (/leaderboard/battles) and one player's fights.
// OUT=/workspace/bba-screens-battles PLAYWRIGHT_DIR=<dir holding playwright-core> node scripts/e2e-battle-board.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createApp } from '../server/app.js';
import { xpFor } from '../server/engine/creatures.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || '/workspace/bba-screens-battles';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-battle-board-'));
const { app, service, shutdown } = createApp({ dataDir: dir, staticDir: path.join(ROOT, 'dist'), env: { ...process.env, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BJ_TICK_MS: '0' }, marketSources: {}, snapshots: false });
const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const B = `http://127.0.0.1:${server.address().port}`;
const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };

async function login(name) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name.toLowerCase()}@battles.test` }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { name, sid: cookie.split('=')[1], id: (await r.json()).id };
}
const names = ['Ada', 'Bess', 'Cy', 'Dot', 'Elmer', 'Flo', 'Gus', 'Hank', 'Ivy', 'Jeb'];
const P = {};
for (const n of names) P[n] = await login(n);
const barn = service.barn, log = barn.battleLog, now = Date.now();
const creature = (name, species, xp, record, mineRecord, i = 0) => ({ stage: 'creature', species, name, xp, cap: 9, record, mineRecord, bornAt: now - 86400e3 * 5 + i });
const roster = [
  ['Ada', 'Lamprima', 'lamprima', 2581, { w: 9, l: 12, d: 0 }, { w: 7, l: 2 }],
  ['Bess', 'Halobates', 'halobates', 2794, { w: 12, l: 7, d: 0 }, { w: 31, l: 2 }],
  ['Cy', 'Pyrops', 'pyrops', 2221, { w: 12, l: 9, d: 0 }, { w: 6, l: 1 }],
  ['Dot', 'Phrictus', 'phrictus', 1653, { w: 6, l: 4, d: 1 }, { w: 3, l: 3 }],
  ['Elmer', 'Sphaerocoris', 'sphaerocoris', 1500, { w: 4, l: 3, d: 0 }, { w: 5, l: 3 }],
  ['Flo', 'Pachyrhynchus', 'pachyrhynchus', 900, { w: 1, l: 5, d: 0 }, { w: 1, l: 0 }],
  ['Gus', 'Nemoptera', 'nemoptera', 700, { w: 0, l: 1, d: 0 }, { w: 3, l: 4 }],
  ['Hank', 'Pyrops II', 'pyrops', 1100, { w: 0, l: 0, d: 0 }, { w: 2, l: 2 }],
  ['Ivy', 'Onymacris', 'onymacris', 300, { w: 0, l: 1, d: 0 }, null],
];
roster.forEach(([who, name, species, xp, rec, mrec], i) => { barn.doc.pens[P[who].id] = creature(name, species, xp, rec, mrec, i); });
barn.save();
// a few older mine battles between miners, as pvp.json keeps them
const raid = (id, at, w, l, cash, wb, lb) => ({ id, kind: 'battle', at, battleId: `B${id}`, winner: P[w].id, winnerName: w, loser: P[l].id, loserName: l, paid: cash, bugs: { winner: { xp: 2000 }, loser: { xp: 1500 }, winnerBug: wb, loserBug: lb }, barn: { winner: { xp: 22 }, loser: { xp: 12 } }, done: true });
service.pvp.doc.raids = { r1: raid('r1', now - 3 * 86400e3, 'Bess', 'Ada', 41, 'Halobates', 'Lamprima'), r2: raid('r2', now - 2 * 86400e3, 'Ada', 'Cy', 63, 'Lamprima', 'Pyrops'), r3: raid('r3', now - 1.5 * 86400e3, 'Cy', 'Gus', 29, 'Pyrops', 'Nemoptera') };
log.doc = { v: 1, entries: [], base: {}, counts: {}, backfill: null };
log.backfill({ players: service.store.players, barn, pvp: service.pvp });
// and fights logged live since: one of each kind for Ada
const bug = (name, species, level) => ({ name, species, level });
const s = (who, b, extra = {}) => ({ pid: P[who].id, name: who, bug: b, ...extra });
let t = now - 6 * 3600e3;
log.record({ id: 'L1', type: 'bout', at: t += 600e3, winner: 0, pot: 200, sides: [s('Ada', bug('Lamprima', 'lamprima', 9), { xp: 17, cash: 100 }), s('Elmer', bug('Sphaerocoris', 'sphaerocoris', 7), { xp: 9, cash: -100 })] });
log.record({ id: 'L2', type: 'wild', at: t += 900e3, winner: 0, sides: [s('Ada', bug('Lamprima', 'lamprima', 9), { xp: 24 }), { pid: null, name: 'a wild New Zealand Glowworm', bug: bug('New Zealand Glowworm', 'arachnocampa', 8) }] });
log.record({ id: 'L3', type: 'circuit', at: t += 900e3, winner: 1, note: 'The Culvert', sides: [s('Ada', bug('Lamprima', 'lamprima', 9), { xp: 0, cash: 0 }), { pid: null, name: 'Gil', bug: bug('Gerris', 'gerris', 10) }] });
log.record({ id: 'L4', type: 'circuit', at: t += 600e3, winner: 0, note: 'The Culvert', sides: [s('Ada', bug('Lamprima', 'lamprima', 9), { xp: 105, cash: 450 }), { pid: null, name: 'Gil', bug: bug('Gerris', 'gerris', 10) }] });
log.record({ id: 'L5', type: 'raid', at: t += 1200e3, winner: 1, reason: 'disconnect', sides: [s('Ada', bug('Lamprima', 'lamprima', 9), { cash: -55 }), s('Bess', bug('Halobates', 'halobates', 9), { xp: 0, cash: 55 })] });
log.record({ id: 'L6', type: 'bout', at: t += 900e3, winner: 1, pot: 667, sides: [s('Ada', bug('Lamprima', 'lamprima', 9), { xp: 15, cash: -333 }), s('Bess', bug('Pheropsophus', 'pheropsophus', 9), { xp: 11, cash: 334 })] });
log.record({ id: 'L7', type: 'wild', at: t += 600e3, winner: 0, sides: [s('Ada', bug('Lamprima', 'lamprima', 9), { xp: 21 }), { pid: null, name: "Cy's abandoned Polyphylla", bug: bug('Polyphylla', 'polyphylla', 4) }] });
log.record({ id: 'L8', type: 'bout', at: t += 600e3, winner: 0, pot: 125, sides: [s('Ada', bug('Lamprima', 'lamprima', 9), { xp: 14, cash: 62 }), s('Dot', bug('Phrictus', 'phrictus', 6), { xp: 9, cash: -63 })] });

// the faun has had his day already (a real face: keep him out of the stills), and the CSS below hides him regardless
await fetch(B + '/api/fawn/claim', { method: 'POST', headers: { cookie: `bba_sid=${P.Ada.sid}` } });
const HIDE = '[data-test="fawn"], .fn, [data-test=bj-guntrad], img[src*="dealer.png"], img[src*="steeze"] { display: none !important; pointer-events: none !important; }';
async function page(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'bba_sid', value: P.Ada.sid, url: B }]);
  await ctx.addInitScript((css) => { const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st); }, HIDE);
  const p = await ctx.newPage();
  p.on('load', () => p.addStyleTag({ content: HIDE }).catch(() => {}));
  return { ctx, p };
}
const noFaun = (p) => p.evaluate(() => [...document.querySelectorAll('[data-test=fawn], .fn-img')].every((el) => !el.getClientRects().length));
const noScroll = (p) => p.evaluate(() => { const el = document.querySelector('.screen'); return el && el.scrollHeight <= el.clientHeight + 2 && document.scrollingElement.scrollHeight <= window.innerHeight + 2; });
const skipGate = async (p) => { try { const b = p.getByRole('button', { name: 'Skip for now' }); await b.waitFor({ state: 'visible', timeout: 2500 }); await b.click(); } catch { /* none */ } };

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  fs.mkdirSync(OUT, { recursive: true });
  for (const vp of [{ width: 390, height: 844, tag: '390x844' }, { width: 375, height: 667, tag: '375x667' }]) {
    const { ctx, p } = await page(browser, vp);
    await p.goto(`${B}/leaderboard`); await skipGate(p);
    await p.waitForSelector('[role=tab]:has-text("Bug battles")');
    await p.getByRole('tab', { name: 'Bug battles' }).click();
    await p.waitForSelector('[data-test=battle-row-0]');
    check(p.url().endsWith('/leaderboard/battles'), `${vp.tag}: the tab opens /leaderboard/battles`);
    check(await noScroll(p), `${vp.tag}: board does not scroll`);
    const first = await p.locator('[data-test=battle-row-0]').innerText();
    check(/Bess/.test(first), `${vp.tag}: best win % first (Bess)`);
    await p.screenshot({ path: path.join(OUT, `${vp.tag}-board-all.png`) });
    await p.click('[data-test=battle-kind-raid]');
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, `${vp.tag}-board-raids.png`) });
    await p.click('[data-test=battle-kind-all]');
    const me = p.locator('.battle-row.me');
    await me.click();
    await p.waitForSelector('[data-test=battle-history-row]');
    check(p.url().includes(`/leaderboard/battles/${P.Ada.id}`), `${vp.tag}: tapping your row opens your fights`);
    check(await noScroll(p), `${vp.tag}: detail does not scroll`);
    check(await noFaun(p), `${vp.tag}: no faun in the shot`);
    await p.screenshot({ path: path.join(OUT, `${vp.tag}-detail-all.png`) });
    await p.click('[data-test=battle-detail-kind-bout]');
    await p.waitForTimeout(150);
    check((await p.locator('[data-test=battle-history-row]').allInnerTexts()).every((x) => /Barn bout/.test(x)), `${vp.tag}: the Bouts card filters the list`);
    await p.screenshot({ path: path.join(OUT, `${vp.tag}-detail-bouts.png`) });
    if (vp.tag === '390x844') {
      await p.click('[data-test=battle-detail-kind-bout]');
      const pager = p.getByRole('button', { name: 'Next page' });
      if (await pager.count() && await pager.isEnabled()) { await pager.click(); await p.waitForTimeout(150); await p.screenshot({ path: path.join(OUT, `${vp.tag}-detail-page2.png`) }); }
      await p.click('.bd-back');
      await p.waitForSelector('[data-test=battle-board]');
      await p.getByRole('tab', { name: 'Money' }).click();
      await p.waitForSelector('[data-test=bug-trainers]');
      check(await noScroll(p), `${vp.tag}: money board still fits with the new tabs`);
      await p.screenshot({ path: path.join(OUT, `${vp.tag}-money-tab.png`) });
    }
    await ctx.close();
  }
} catch (e) {
  console.error(e); fails.push(e.message || String(e));
} finally {
  await browser?.close();
  shutdown(); server.closeAllConnections(); await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
}
if (fails.length) { console.error('BATTLE BOARD FAILS', fails); process.exit(1); }
console.log('BATTLE BOARD OK', OUT);
