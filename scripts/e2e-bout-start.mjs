// Starting a bout on a phone, tap by tap: the ring fits the screen with no page scroll, every control is a thumb-sized
// target, a row opens the tale of the tape (both bugs, the line, the money, one big button), stake chips need no
// keyboard, a challenge goes out in three taps, joining an open bout plays the FIGHT moment and drops you in the live
// ring, and reduced motion holds it still. Also checks a short phone, the desktop card and the Thanksgiving theme.
//   npm run build && PLAYWRIGHT_DIR=<dir holding playwright-core> OUT=/workspace/bba-screens-bout-start npm run e2e:bout-start
import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
import { seedRing } from './lib-bout-seed.mjs';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const VIEWS = [{ n: '390', w: 390, h: 844, m: true }, { n: '375', w: 375, h: 667, m: true }, { n: 'desktop', w: 1280, h: 800 }];

async function page(browser, s, vp, { reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addCookies([{ name: 'bba_sid', value: s.me.sid, url: s.B }]);
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push('console: ' + m.text()); });
  p.tapOr = (sel) => (vp.m ? p.tap(sel) : p.click(sel));
  await p.goto(s.B + '/barn'); await p.waitForSelector('[data-test=barn]');
  if (!(await p.$('[data-test=barn-ring]'))) await p.tapOr('[data-test=ring-toggle]');
  await p.waitForSelector('[data-test=barn-ring]');
  return p;
}
const shot = async (p, name) => { if (!OUT) return; fs.mkdirSync(OUT, { recursive: true }); await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); };
/** Nothing scrolls the page, the root is inside the viewport, and every visible control under it is at least 44px tall. */
const fit = (p, root) => p.evaluate((sel) => {
  const el = document.querySelector(sel); const r = el?.getBoundingClientRect();
  const se = document.scrollingElement;
  const small = [...(el?.querySelectorAll('button, input, select') || [])].filter((b) => { const q = b.getBoundingClientRect(); return q.width && q.height && q.bottom > 0 && q.top < innerHeight && q.height < 44; }).map((b) => `${b.dataset.test || b.textContent.trim().slice(0, 16)}:${Math.round(b.getBoundingClientRect().height)}`);
  return { pageScroll: se.scrollHeight > innerHeight + 1 || se.scrollWidth > innerWidth + 1, inside: !!r && r.top >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1, small };
}, root);
const inView = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= innerHeight && r.height > 0; }, sel);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const vp of VIEWS) {
    const s = await seedRing({ root: ROOT });
    const p = await page(browser, s, vp), n = vp.n;
    // 1. The ring: your corner, the call-out, everyone in one list.
    await shot(p, `after-${n}-01-ring`);
    let f = await fit(p, '[data-test=barn-ring]');
    check(!f.pageScroll && f.inside, `${n}: the ring fits the screen with no page scroll`);
    if (vp.m) check(!f.small.length, `${n}: ring controls are thumb-sized (${f.small.join(', ') || 'all ≥ 44px'})`);
    check((await p.$$('[data-test=ring-with]')).length === 2, `${n}: both of your bugs are big picks, not a dropdown`);
    check(!(await p.$('[data-test=ring-how]')), `${n}: the rules live under ?, not on the ring`);
    const first = await p.textContent('[data-test=ring-list] li:first-child button');
    check(/Fights now/.test(first), `${n}: the open bout is first in the list ("${first.replace(/\s+/g, ' ').trim()}")`);
    check(await p.$$eval('[data-test=roster-bug]', (els) => els.every((e) => /\d+%/.test(e.textContent))), `${n}: every bug you can call out shows your chance`);

    // 2. Call out Ada's Lamprima: row → stake chip → send. No keyboard.
    await p.tapOr('[data-test=roster-bug]:has-text("Lamprima")');
    await p.waitForSelector('[data-test=matchup][data-kind=call]');
    await p.waitForTimeout(500);
    await shot(p, `after-${n}-02-callout-tape`);
    f = await fit(p, '[data-test=matchup]');
    check(!f.pageScroll && f.inside, `${n}: the tale of the tape fits the screen`);
    if (vp.m) check(!f.small.length, `${n}: tape controls are thumb-sized (${f.small.join(', ') || 'all ≥ 44px'})`);
    check(await inView(p, '[data-test=challenge-send]'), `${n}: the big button is on screen`);
    const odds1 = await p.textContent('[data-test=matchup-odds]');
    await p.tapOr('[data-test=matchup-swap]:has-text("Phanaeus")');
    await p.waitForTimeout(200);
    const odds2 = await p.textContent('[data-test=matchup-odds]');
    check(odds1 !== odds2, `${n}: swapping your bug moves the line (${odds1.match(/\d+%/)?.[0]} → ${odds2.match(/\d+%/)?.[0]})`);
    await p.tapOr('[data-test=matchup-swap]:has-text("Manticora")');
    await p.tapOr('[data-test=stake-chip]:has-text("$50")');
    const terms = await p.textContent('[data-test=matchup-terms]');
    check(/You put up \$50 · Ada puts up \$\d+ · winner takes \$\d+/.test(terms), `${n}: the money reads plainly ("${terms}")`);
    await p.tapOr('[data-test=challenge-send]');
    await p.waitForSelector('[data-test=matchup-stamp]', { timeout: 5000 }).catch(() => null);
    await shot(p, `after-${n}-03-called-out`);
    await p.waitForSelector('[data-test=matchup]', { state: 'detached', timeout: 4000 }).catch(() => null);
    const out = (await s.me.call('GET', '/barn')).challenges.outgoing;
    check(out.length === 1 && out[0].stake === 50, `${n}: the challenge went out for $50 in three taps`);
    check(/Called out/.test(await p.textContent('[data-test=roster-bug]:has-text("Lamprima")')), `${n}: the row says it is called out`);

    // 3. Answer Cy's call-out: the tape for accepting, with Decline beside it.
    await p.tapOr('[data-test=challenge-incoming]');
    await p.waitForSelector('[data-test=matchup][data-kind=accept]');
    await shot(p, `after-${n}-04-called-out-by-cy`);
    check(await inView(p, '[data-test=challenge-accept]') && await inView(p, '[data-test=challenge-decline]'), `${n}: Fight and Decline are both on screen`);
    await p.tapOr('[data-test=ring-back]');

    // 4. Post a bout: the empty corner says anyone can answer.
    await p.tapOr('[data-test=bout-post-open]');
    await p.waitForSelector('[data-test=matchup][data-kind=post]');
    await shot(p, `after-${n}-05-post-tape`);
    check(await inView(p, '[data-test=bout-post]'), `${n}: Post is on screen`);
    await p.keyboard.press('Escape');
    await p.waitForSelector('[data-test=matchup]', { state: 'detached', timeout: 2000 }).catch(() => null);
    check(!(await p.$('[data-test=matchup]')), `${n}: Escape closes the tape`);

    // 5. Join Bess's open bout: tape → FIGHT! → the live ring.
    await p.tapOr('[data-test=bout-listing]');
    await p.waitForSelector('[data-test=matchup][data-kind=bout]');
    await shot(p, `after-${n}-06-open-bout-tape`);
    check(/You put up \$\d+ · Bess puts up \$50 · winner takes/.test(await p.textContent('[data-test=matchup-terms]')), `${n}: joining says what each side puts up`);
    await p.tapOr('[data-test=bout-join]');
    await p.waitForSelector('[data-test=fight-fx]', { timeout: 5000 }).catch(() => null);
    check(!!(await p.$('[data-test=fight-fx]')), `${n}: the FIGHT moment plays`);
    await p.waitForTimeout(750); if (OUT) await p.screenshot({ path: path.join(OUT, `after-${n}-07-fight.png`) });
    await p.waitForSelector('[data-test=bout][data-live="1"]', { timeout: 10000 }).catch(() => null);
    check(!!(await p.$('[data-test=bout][data-live="1"]')) && !(await p.$('[data-test=fight-fx]')), `${n}: then the live fight opens`);
    await shot(p, `after-${n}-08-live`);
    check(!p.errs.length, `${n}: no page errors (${p.errs.join(' | ') || 'none'})`);
    await p.context().close(); await s.close();
  }

  // Reduced motion: the FIGHT moment holds still and is shorter.
  {
    const s = await seedRing({ root: ROOT });
    const p = await page(browser, s, VIEWS[0], { reduced: true });
    await p.tap('[data-test=bout-listing]'); await p.waitForSelector('[data-test=matchup]');
    const anim = await p.$eval('[data-test=matchup]', (el) => getComputedStyle(el).animationName);
    check(anim === 'none', `reduced motion: the tape does not slide (${anim})`);
    await p.tap('[data-test=bout-join]');
    await p.waitForSelector('[data-test=fight-fx].still', { timeout: 5000 }).catch(() => null);
    check(!!(await p.$('[data-test=fight-fx].still')), 'reduced motion: the FIGHT moment is held still');
    await p.waitForSelector('[data-test=bout]', { timeout: 10000 }).catch(() => null);
    check(!!(await p.$('[data-test=bout]')), 'reduced motion: the fight opens');
    check(!p.errs.length, `reduced motion: no page errors (${p.errs.join(' | ') || 'none'})`);
    await p.context().close(); await s.close();
  }

  // The Thanksgiving desert-resort theme, if it is on: same flow, its own palette.
  {
    const s = await seedRing({ root: ROOT, event: 'on' });
    const p = await page(browser, s, VIEWS[0]);
    check(await p.evaluate(() => document.body.dataset.event === 'desert-resort'), 'theme: the desert-resort theme is on');
    await shot(p, 'after-390-09-theme-ring');
    await p.tap('[data-test=roster-bug]:has-text("Lamprima")'); await p.waitForSelector('[data-test=matchup]');
    await shot(p, 'after-390-10-theme-tape');
    const f = await fit(p, '[data-test=matchup]');
    check(!f.pageScroll && f.inside, 'theme: the tape still fits');
    check(!p.errs.length, `theme: no page errors (${p.errs.join(' | ') || 'none'})`);
    await p.context().close(); await s.close();
  }

  // Blocked states say why on the button's line instead of failing on tap.
  {
    const s = await seedRing({ root: ROOT });
    s.fund(s.me, 10);
    const p = await page(browser, s, VIEWS[1]);
    await p.tap('[data-test=bout-listing]'); await p.waitForSelector('[data-test=matchup]');
    const why = await p.textContent('[data-test=matchup-why]').catch(() => '');
    check(/You need \$\d+/.test(why) && await p.$eval('[data-test=bout-join]', (b) => b.disabled), `broke: Fight is off and says why ("${why}")`);
    await p.tap('[data-test=ring-back]');
    await p.tap('[data-test=bout-post-open]'); await p.waitForSelector('[data-test=matchup]');
    const chips = await p.$$eval('[data-test=stake-chip]', (els) => els.map((e) => e.textContent));
    check(JSON.stringify(chips) === JSON.stringify(['Free', '$10']), `broke: only stakes you can cover are offered (${chips.join(', ')})`);
    await p.tap('[data-test=stake-other]'); await p.fill('[data-test=bout-stake]', '15');
    check(/steps of \$10/.test(await p.textContent('[data-test=matchup-why]').catch(() => '')), 'a stake off the $10 step says so');
    await shot(p, 'after-375-11-broke-stake');
    check(!p.errs.length, `broke: no page errors (${p.errs.join(' | ') || 'none'})`);
    await p.context().close(); await s.close();
  }
} catch (e) { console.error(e); fails.push(String(e.message)); }
finally { await browser?.close(); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall good');
process.exit(fails.length ? 1 : 0);
