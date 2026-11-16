// Browser check + screenshots for EL HALO (Hall of Doors). Boots its own throwaway server, clocks in, opens the mine
// door into the hall, checks the El Halo door is open while its chunk has not loaded, goes in, starts, moves, shoots,
// takes a hit through the shield, watches it recharge, throws a piñata, then leaves (button, and Esc on desktop) back
// to the hall and the running mine. No page errors at any size.
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core node scripts/e2e-el-halo.mjs   (OUT=dir for screenshots, SIZES=1280x720,390x844m,844x390m)
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT; const SIZES_ENV = process.env.SIZES;
const PORT = 3980 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-elhalo-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  return r.headers.get('set-cookie').split(';')[0].split('=')[1];
}
let PNG = null; try { PNG = req('pngjs').PNG; } catch { try { PNG = createRequire(import.meta.url)('pngjs').PNG; } catch { /* optional */ } }
const lit = async (loc) => { const buf = await loc.screenshot(); if (!PNG) return 1; const d = PNG.sync.read(buf).data; let n = 0, t = 0; for (let i = 0; i < d.length; i += 16) { t++; if (d[i] + d[i + 1] + d[i + 2] > 60) n++; } return n / t; };
const noScroll = (p) => p.evaluate(() => { const de = document.documentElement; return !(de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1); });
const st = (p) => p.evaluate(() => window.__elHalo.state());
const inView = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].every((el) => { const r = el.getBoundingClientRect(); return r.width > 10 && r.height > 10 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }), sel);

async function run(browser, sid, s) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.errs.push('console: ' + m.text()); });
  const reqs = []; p.on('request', (r) => reqs.push({ url: r.url(), method: r.method(), t: Date.now() }));
  const tap = (sel) => (s.m ? p.tap(sel) : p.click(sel));
  await p.goto(`${B}/mines`); await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas');
  await p.waitForFunction(() => !!window.__acidMine); await p.waitForTimeout(800);
  await p.evaluate(() => { const m = window.__acidMine, d = m.door.group.position; m.yaw = Math.atan2(-(d.x - m.pos.x), -(d.z - m.pos.y)); });
  await p.waitForSelector('[data-test=door-prompt]', { timeout: 5000 }).catch(() => null);
  if (s.m) await p.tap('[data-test=door-open]'); else await p.keyboard.press('f');
  await p.waitForSelector('[data-test=door-hall]', { timeout: 5000 }).catch(() => null);
  check(!!(await p.$('[data-test=door-hall]')), `${s.n}: mine door opens the hall`);
  await p.waitForTimeout(400);
  const doors = await p.evaluate(() => [...document.querySelectorAll('[data-test^=hall-door-]')].map((d) => `${d.dataset.test.slice(10)}:${d.dataset.open}`));
  check(doors.includes('elhalo:1') && !doors.some((d) => d.startsWith('ringworld')) && doors.filter((d) => d.endsWith(':0')).length === 6, `${s.n}: El Halo door is open, six still locked (${doors.join(' ')})`);
  check(await inView(p, '[data-test^=hall-door-] .m-hall-frame') && await noScroll(p), `${s.n}: every door on screen, no scroll`);
  check(!reqs.some((r) => /ElHaloRoom/.test(r.url)), `${s.n}: El Halo chunk not loaded in the hall`);
  await shot(p, `${s.n}-1-hall`);

  // in
  const tIn = Date.now();
  await tap('[data-test=hall-door-elhalo]');
  await p.waitForSelector('[data-test=elhalo-title]', { timeout: 15000 }).catch(() => null);
  check(reqs.some((r) => /ElHaloRoom-.*\.js/.test(r.url) && r.t >= tIn), `${s.n}: El Halo chunk loads when the door opens`);
  await p.waitForFunction(() => !!window.__elHalo, null, { timeout: 10000 }).catch(() => null);
  await p.waitForTimeout(1200);
  check(await lit(p.locator('[data-test=elhalo-canvas]')) > 0.6, `${s.n}: title scene draws`);
  check(await noScroll(p) && await inView(p, '[data-test=elhalo-start], [data-test=elhalo-exit]'), `${s.n}: title fits, start + back on screen`);
  await shot(p, `${s.n}-2-title`);
  await tap('[data-test=elhalo-start]');
  await p.waitForTimeout(300);
  let a = await st(p);
  check(a.mode === 'playing' && a.shield === 100 && a.health === 100 && a.mag === 32, `${s.n}: game starts (${JSON.stringify({ mode: a.mode, shield: a.shield, mag: a.mag })})`);
  if (s.m) check(await inView(p, '[data-test^=pad-]') && await p.isVisible('[data-test=elhalo-stick]'), `${s.n}: touch pad (FIRE / GRENADE / JUMP …) on screen`);
  await p.evaluate(() => window.__elHalo.freeze(true)); // the critters hold still for the photos; the game itself is unchanged

  // move
  const p0 = a.pos;
  if (s.m) {
    const box = await p.locator('[data-test=elhalo-stick]').boundingBox();
    const cx = box.x + 80, cy = box.y + box.height - 140;
    await p.locator('[data-test=elhalo-stick]').dispatchEvent('pointerdown', { pointerId: 7, clientX: cx, clientY: cy, isPrimary: true, pointerType: 'touch' });
    for (let i = 1; i <= 6; i++) { await p.locator('[data-test=elhalo-stick]').dispatchEvent('pointermove', { pointerId: 7, clientX: cx, clientY: cy + i * 8, pointerType: 'touch' }); await p.waitForTimeout(16); }
    await p.waitForTimeout(900);
    await shot(p, `${s.n}-4-mobile-controls`);
    await p.locator('[data-test=elhalo-stick]').dispatchEvent('pointerup', { pointerId: 7, clientX: cx, clientY: cy + 48, pointerType: 'touch' });
  } else { await p.keyboard.down('KeyS'); await p.waitForTimeout(900); await p.keyboard.up('KeyS'); }
  a = await st(p);
  check(Math.hypot(a.pos.x - p0.x, a.pos.z - p0.z) > 2, `${s.n}: walks (${JSON.stringify(p0)} → ${JSON.stringify(a.pos)})`);
  // look
  const y0 = a.yaw;
  if (s.m) { const look = p.locator('.elh-look'); const vb = await look.boundingBox(); const lx = vb.x + vb.width * 0.7, ly = vb.y + vb.height * 0.3;
    await look.dispatchEvent('pointerdown', { pointerId: 9, clientX: lx, clientY: ly, pointerType: 'touch' }); for (let i = 1; i <= 5; i++) await look.dispatchEvent('pointermove', { pointerId: 9, clientX: lx + i * 12, clientY: ly, pointerType: 'touch' }); await look.dispatchEvent('pointerup', { pointerId: 9, clientX: lx + 60, clientY: ly, pointerType: 'touch' }); }
  else { await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(250); await p.keyboard.up('ArrowLeft'); }
  await p.waitForTimeout(100);
  a = await st(p);
  check(Math.abs(a.yaw - y0) > 0.05, `${s.n}: looks around (${y0} → ${a.yaw})`);
  // face the action and shoot
  await p.waitForFunction(() => window.__elHalo.state().nearest < 9, null, { timeout: 15000 }).catch(() => null);
  await p.evaluate(() => window.__elHalo.aimAtNearest());
  const shots0 = a.shots, mag0 = a.mag;
  if (s.m) { const f = p.locator('[data-test=pad-fire]'); await f.dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch' }); await p.waitForTimeout(450); await shot(p, `${s.n}-3-gameplay`); await f.dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch' }); }
  else { await p.mouse.down(); await p.waitForTimeout(450); await shot(p, `${s.n}-3-gameplay`); await p.mouse.up(); }
  a = await st(p);
  check(a.shots > shots0 && a.mag < mag0, `${s.n}: fires (${a.shots - shots0} rounds, mag ${mag0} → ${a.mag})`);
  // grenade + jump
  const g0 = a.grenades;
  if (s.m) { await p.locator('[data-test=pad-grenade]').dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch' }); await p.locator('[data-test=pad-grenade]').dispatchEvent('pointerup', { pointerId: 12, pointerType: 'touch' }); await p.locator('[data-test=pad-jump]').dispatchEvent('pointerdown', { pointerId: 13, pointerType: 'touch' }); await p.locator('[data-test=pad-jump]').dispatchEvent('pointerup', { pointerId: 13, pointerType: 'touch' }); }
  else { await p.keyboard.press('KeyG'); await p.keyboard.press('Space'); }
  await p.waitForTimeout(120);
  a = await st(p);
  check(a.grenades === g0 - 1 && a.pos.y > 0.05, `${s.n}: piñata thrown (${g0} → ${a.grenades}), jumping (y ${a.pos.y})`);
  await p.waitForTimeout(2000);
  if (!s.m) { await p.keyboard.press('KeyR'); await p.keyboard.press('KeyF'); await p.keyboard.press('KeyQ'); await p.waitForTimeout(150); a = await st(p); check(a.weapon === 'pistol', `${s.n}: Q swaps to the pistol`); await p.keyboard.press('KeyQ'); }
  // shield: a hit takes the shield first, it stays down, then recharges after the delay
  await p.evaluate(() => window.__elHalo.hurt(130));
  await p.waitForTimeout(200);
  a = await st(p);
  check(a.shield === 0 && a.health < 100 && a.health > 0 && a.mode === 'playing', `${s.n}: hit drops the shield to 0, health takes the rest (${a.shield}/${a.health})`);
  check(await p.evaluate(() => document.querySelector('[data-test=elhalo-shield]').classList.contains('down')), `${s.n}: HUD shows shield down`);
  await shot(p, `${s.n}-5-shield-down`);
  const h1 = a.health;
  await p.waitForTimeout(2200); a = await st(p);
  check(a.shield === 0, `${s.n}: shield waits before recharging (${a.sinceHit}s: ${a.shield})`);
  await p.waitForFunction(() => window.__elHalo.state().shield > 25, null, { timeout: 5000 }).catch(() => null);
  a = await st(p);
  check(a.shield > 0 && a.shield < 100 && a.health === h1, `${s.n}: shield recharging (${a.shield}), health stays ${a.health}`);
  check(await p.evaluate(() => document.querySelector('[data-test=elhalo-shield]').classList.contains('charging')), `${s.n}: HUD shows recharge`);
  await shot(p, `${s.n}-6-shield-recharge`);
  await p.waitForFunction(() => window.__elHalo.state().shield >= 100, null, { timeout: 5000 }).catch(() => null);
  check((await st(p)).shield === 100, `${s.n}: shield back to full`);
  check(await noScroll(p) && await inView(p, '[data-test=elhalo-exit], [data-test=elhalo-mute]'), `${s.n}: no scroll in game, back + sound on screen`);
  a = await st(p); console.log(`     ${s.n}: ${a.fps} fps (software GL), wave ${a.wave}, score ${a.score}, ${a.enemies} on screen`);
  // death → restart works
  await p.evaluate(() => window.__elHalo.hurt(999)); await p.waitForSelector('[data-test=elhalo-dead]', { timeout: 3000 }).catch(() => null);
  check(!!(await p.$('[data-test=elhalo-dead]')), `${s.n}: dying shows the TE TUMBARON card`);
  await tap('[data-test=elhalo-restart]'); await p.waitForTimeout(200); a = await st(p);
  check(a.mode === 'playing' && a.health === 100 && a.shield === 100 && a.score === 0, `${s.n}: OTRA VEZ restarts`);
  // out: Esc on desktop, the button on phones
  // a real Esc first lets go of the mouse (pause card), the next one leaves; headless Chrome never hands back the lock, so release it here
  if (!s.m) { await p.evaluate(() => document.exitPointerLock?.()); await p.waitForTimeout(500); await p.keyboard.press('Escape'); } else await p.tap('[data-test=elhalo-exit]');
  await p.waitForTimeout(400);
  check(!!(await p.$('[data-test=door-hall]')) && !(await p.$('[data-test=elhalo-room]')) && await p.evaluate(() => !window.__elHalo), `${s.n}: back in the hall (${s.m ? 'button' : 'Esc'}), game gone`);
  if (!s.m) { // and the button, the second time
    await p.click('[data-test=hall-door-elhalo]'); await p.waitForSelector('[data-test=elhalo-title]', { timeout: 5000 });
    await p.click('[data-test=elhalo-exit]'); await p.waitForTimeout(300);
    check(!!(await p.$('[data-test=door-hall]')) && !(await p.$('[data-test=elhalo-room]')), `${s.n}: ◄ BACK TO THE HALL works too`);
  }
  const writes = reqs.filter((r) => r.t >= tIn && (r.method !== 'GET' || r.url.includes('/api/')));
  check(writes.length === 0, `${s.n}: no API calls or writes from El Halo (${writes.map((w) => w.method + ' ' + w.url.replace(B, '')).join(', ')})`);
  await p.click('[data-test=hall-exit]'); await p.waitForTimeout(600);
  check(!(await p.$('[data-test=door-hall]')) && await p.evaluate(() => window.__acidMine && window.__acidMine.paused === false), `${s.n}: back in a running mine`);
  check(p.errs.length === 0, `${s.n}: no page errors ${p.errs.join(' | ')}`);
  await ctx.close();
}

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  let SIZES = [{ w: 1280, h: 720, n: '1280x720' }, { w: 390, h: 844, m: true, n: '390x844m' }, { w: 844, h: 390, m: true, n: '844x390m' }];
  if (SIZES_ENV) SIZES = SIZES.filter((s) => SIZES_ENV.split(',').includes(s.n));
  const sid = await login('Tyler', 'tyler.elhalo@example.com');
  for (const s of SIZES) await run(browser, sid, s);
  const idx = fs.readdirSync(path.join(ROOT, 'dist/assets')).filter((n) => /^(index|Mines)-.*\.js$/.test(n)).map((n) => fs.readFileSync(path.join(ROOT, 'dist/assets', n), 'utf8')).join('');
  check(!/LA CHICHARRA|alebrije|luchabot/.test(idx), 'El Halo code is only in its own chunk (not index or Mines)');
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
}
main().catch((e) => { console.error(e); fails.push(String(e)); }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fails.length ? 1 : 0); });
