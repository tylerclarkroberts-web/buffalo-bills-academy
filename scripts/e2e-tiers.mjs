// The daily mine's difficulty tiers (v79), in real browsers: the tier banner at the shift office, the HUD badge, an
// acid worm landing and the bowie knife cutting it off, a cave-in in a hallway, and the lantern from tier 1 to 5.
// Boots a throwaway server per tier with the MINE_TEST_TIER hook (dev login only).
//   npm run build && PLAYWRIGHT_DIR=... OUT=dir TIERS=1,3,5 node scripts/e2e-tiers.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const TIER_LIST = (process.env.TIERS || '1,3,5').split(',').map(Number);
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const PHONE = { w: 390, h: 844, m: true, tag: 'phone' }, DESK = { w: 1280, h: 800, tag: 'desktop' };

function bfs(g, from, to) {
  const key = (x, y) => `${x},${y}`, prev = new Map([[key(from.x, from.y), null]]), q = [from];
  while (q.length) { const c = q.shift(); if (c.x === to.x && c.y === to.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c.x + dx, y = c.y + dy; if (g[y]?.[x] === 0 && !prev.has(key(x, y))) { prev.set(key(x, y), c); q.push({ x, y }); } } }
  if (!prev.has(key(to.x, to.y))) return null;
  const out = []; for (let c = to; c; c = prev.get(key(c.x, c.y))) out.unshift(c); return out;
}
/** Walk tile to tile at ~2 tiles/s (inside the server's speed check), then face `yaw`. */
async function walk(p, route, yaw) {
  let cur = route[0];
  for (const n of route.slice(1)) {
    const face = Math.atan2(-(n.x - cur.x), -(n.y - cur.y));
    for (let i = 1; i <= 4; i++) {
      const x = cur.x + (n.x - cur.x) * i / 4, y = cur.y + (n.y - cur.y) * i / 4;
      await p.evaluate(([x, y, a]) => { const m = window.__acidMine; m.pos.set(x * 2.2, y * 2.2); m.yaw = a; m.pitch = 0; }, [x, y, face]);
      await wait(120);
    }
    cur = n;
  }
  await p.evaluate((a) => { window.__acidMine.yaw = a; }, yaw); await wait(500);
}

async function runTier(browser, tier) {
  const PORT = 4180 + tier * 7 + Math.floor(Math.random() * 5), B = `http://localhost:${PORT}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bba-tiers-${tier}-`));
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', MINE_TEST_TIER: String(tier), PVP_TEST: '1' }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    await new Promise((r, j) => { const t = Date.now(); const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t > 15000 ? j(new Error('server did not start')) : setTimeout(ping, 200))); ping(); });
    for (const vp of [PHONE, DESK]) {
      const lr = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Tier${tier}${vp.tag}`, email: `t${tier}${vp.tag}@tiers.test` }) });
      const sid = lr.headers.get('set-cookie').split(';')[0].split('=')[1];
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: vp.m ? 2 : 1, reducedMotion: 'no-preference' });
      await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(`${B}/mines`);
      await p.waitForSelector('[data-test="mine-today"]');
      const banner = await p.textContent('[data-test="mine-today"]');
      check(banner.includes(`TODAY'S DIG`) && (await p.$$('[data-test="mine-today"] .m-picks i:not(.off)')).length === tier, `tier ${tier} ${vp.tag}: banner shows ${tier} of 5 picks (${banner.trim()})`);
      await wait(900); // the CRT warm-up
      const over = () => p.evaluate(() => { const m = document.querySelector('.mines'); return m.scrollHeight - m.clientHeight; });
      const scroll = await over();
      await p.evaluate(() => { document.querySelector('[data-test="mine-today"]').style.display = 'none'; });
      const without = await over();
      await p.evaluate(() => { document.querySelector('[data-test="mine-today"]').style.display = ''; });
      if (vp.m) check(scroll <= Math.max(2, without), `tier ${tier} ${vp.tag}: the tier banner adds no scrolling (${scroll}px over, ${without}px without it)`);
      else console.log(`     tier ${tier} ${vp.tag}: shift office ${scroll}px over (${without}px without the banner; the desktop office already scrolled)`);
      await shot(p, `tier${tier}-${vp.tag}-office`);
      await p.click('text=[ CLOCK IN ]'); await p.waitForFunction(() => !!window.__acidMine && !!document.querySelector('.m-ticker'));
      // listen to the ticker from the start: on some days a cave-in is already in sight when you clock in
      await p.evaluate(() => { window.__lines = []; new MutationObserver(() => window.__lines.push(document.querySelector('.m-ticker').textContent)).observe(document.querySelector('.m-ticker'), { childList: true, characterData: true, subtree: true }); });
      await wait(1500);
      check(!!(await p.$('.m-hud [data-test="mine-tier"]')), `tier ${tier} ${vp.tag}: HUD shows the tier`);
      if (vp.m) check(!!(await p.$('[data-test="mine-pad"]')), `tier ${tier} phone: move pad still there`);
      await shot(p, `tier${tier}-${vp.tag}-lantern`);
      const g = await p.evaluate(() => window.__acidMine.maze.grid);
      const rubble = []; g.forEach((row, y) => row.forEach((v, x) => { if (v === 2) rubble.push({ x, y }); }));
      check(tier === 1 ? rubble.length === 0 : rubble.length > 0, `tier ${tier}: ${rubble.length} cave-ins`);
      if (tier > 1) {
        // a worm lands, then the knife
        await p.evaluate(() => window.__acidWorms.spawn()); await wait(700);
        check((await p.$$('[data-test="worm"]')).length === 1 && !!(await p.$('[data-test="knife"]')), `tier ${tier} ${vp.tag}: a worm on the goggles and the knife button`);
        check(await p.evaluate(() => document.querySelector('.m-worms').dataset.mode) === '3d', `tier ${tier} ${vp.tag}: the worm is drawn in 3D`);
        // its eyes follow a finger / the cursor: point at the top-left corner for the shot
        await p.mouse.move(vp.w * 0.1, vp.h * 0.25); await wait(300);
        const gl = await p.evaluate(() => ({ c: window.__wormLayer.calls(), t: window.__wormLayer.triangles() }));
        check(gl.c <= 6 && gl.t <= 520, `tier ${tier} ${vp.tag}: one worm costs ${gl.c} draw calls, ${gl.t} triangles`);
        await shot(p, `tier${tier}-${vp.tag}-worm`);
        if (vp.m) await p.tap('[data-test="knife"]'); else await p.keyboard.press('k');
        await wait(90); await shot(p, `tier${tier}-${vp.tag}-slash`);
        await wait(800);
        check((await p.$$('[data-test="worm"]')).length === 0 && !(await p.$('[data-test="knife"]')), `tier ${tier} ${vp.tag}: the knife cleared it`);
        // a swipe across a worm cuts it too (phone), or a click (desktop)
        await p.evaluate(() => window.__acidWorms.spawn()); await wait(600);
        const box = await (await p.$('[data-test="worm"]')).boundingBox();
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        await p.mouse.move(cx - 40, cy - 30); await p.mouse.down(); await p.mouse.move(cx + 40, cy + 30, { steps: 6 }); await p.mouse.up();
        await wait(900);
        check((await p.$$('[data-test="worm"]')).length === 0, `tier ${tier} ${vp.tag}: a swipe cut it off`);
        // walk to the nearest cave-in and look at it
        const start = await p.evaluate(() => ({ x: Math.round(window.__acidMine.pos.x / 2.2), y: Math.round(window.__acidMine.pos.y / 2.2) }));
        let best = null;
        for (const c of rubble) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const stand = { x: c.x + dx * 2, y: c.y + dy * 2 };
          if (g[c.y + dy]?.[c.x + dx] !== 0 || g[stand.y]?.[stand.x] !== 0) continue;
          stand.close = { x: c.x + dx * 1.35, y: c.y + dy * 1.35 };
          const r = bfs(g, start, stand); if (r && (!best || r.length < best.route.length)) best = { route: [...r, stand.close], yaw: Math.atan2(dx, dy) };
        }
        if (best && best.route.length < 90) {
          await walk(p, best.route, best.yaw); await wait(400);
          while (await p.evaluate(() => window.__acidWorms.count)) { await p.evaluate(() => window.__acidWorms.cut()); await wait(50); }
          await wait(800);
          await shot(p, `tier${tier}-${vp.tag}-cavein`);
          const lines = await p.evaluate(() => window.__lines.join(' / '));
          check(/ROOF CAME DOWN/.test(lines), `tier ${tier} ${vp.tag}: the ticker calls out the cave-in${/ROOF CAME DOWN/.test(lines) ? "" : ` (heard: ${lines.slice(-300)})`}`);
          // walk into it: you can't
          const before = await p.evaluate(() => ({ x: window.__acidMine.pos.x, y: window.__acidMine.pos.y }));
          await p.evaluate(() => { window.__acidMine.input.f = 1; }); await wait(1500); await p.evaluate(() => { window.__acidMine.input.f = 0; });
          const after = await p.evaluate(() => ({ x: window.__acidMine.pos.x / 2.2, y: window.__acidMine.pos.y / 2.2 }));
          const tile = g[Math.round(after.y)][Math.round(after.x)];
          check(tile === 0 && Math.hypot(after.x * 2.2 - before.x, after.y * 2.2 - before.y) < 2.2 * 1.6, `tier ${tier} ${vp.tag}: the rubble stops you`);
          if (tier >= 3 && vp.tag === 'desktop') { await p.evaluate(() => window.__acidWorms.spawn()); await wait(700); await shot(p, `tier${tier}-${vp.tag}-cavein-worm`); }
        } else console.log(`(tier ${tier}: no cave-in close enough to walk to for a screenshot)`);
      }
      check(errs.length === 0, `tier ${tier} ${vp.tag}: no page errors ${errs.join(' | ')}`);
      await ctx.close();
    }
  } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
}

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const t of TIER_LIST) await runTier(browser, t);
} finally { await browser?.close(); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok');
process.exit(fails.length ? 1 : 0);
