// Browser check + screenshots for the v89 Hall of Doors. Boots its own throwaway server, clocks in, turns around to the
// mine door, opens it into the hall (no game files loaded yet), rattles a locked door (no navigation), goes through the
// Doom door (E1M1 still starts) and back, then the Nanosaur door (its files only load now; it renders and responds to
// keys or the touch pad) and back, then back to a running mine.
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core node scripts/e2e-door-hall.mjs   (OUT=dir for screenshots, SIZES=1280x720,390x844m)
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT; const SIZES_ENV = process.env.SIZES;
const PORT = 3970 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-hall-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  return r.headers.get('set-cookie').split(';')[0].split('=')[1];
}
let PNG = null; try { PNG = req('pngjs').PNG; } catch { /* optional */ }
const lit = async (loc) => { // share of non-black pixels (WebGL canvases can't be read back, so from a screenshot)
  const buf = await loc.screenshot(); if (!PNG) return 1;
  const d = PNG.sync.read(buf).data; let n = 0, t = 0; for (let i = 0; i < d.length; i += 16) { t++; if (d[i] + d[i + 1] + d[i + 2] > 60) n++; } return n / t;
};
const noScroll = (p) => p.evaluate(() => { const de = document.documentElement; return !(de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1); });

async function run(browser, sid, s) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  const reqs = []; p.on('request', (r) => reqs.push({ url: r.url(), method: r.method(), t: Date.now() }));
  await p.goto(`${B}/mines`); await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas');
  await p.waitForFunction(() => !!window.__acidMine); await p.waitForTimeout(800);
  // turn around to the door
  if (!s.m) { await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(1366); await p.keyboard.up('ArrowLeft'); }
  else await p.evaluate(() => { window.__acidMine.yaw += Math.PI; });
  await p.waitForTimeout(500);
  const dv = await p.evaluate(() => window.__acidMine.doorView());
  if (dv.facing < 0.75) await p.evaluate(() => { const m = window.__acidMine, d = m.door.group.position; m.yaw = Math.atan2(-(d.x - m.pos.x), -(d.z - m.pos.y)); });
  await p.waitForSelector('[data-test=door-prompt]', { timeout: 4000 }).catch(() => null);
  check(!!(await p.$('[data-test=door-prompt]')), `${s.n}: the mine door prompt shows`);
  await shot(p, `${s.n}-1-mine-door`);
  const tOpen = Date.now();
  if (s.m) await p.tap('[data-test=door-open]'); else await p.keyboard.press('f');
  await p.waitForSelector('[data-test=door-hall]', { timeout: 5000 }).catch(() => null);
  check(!!(await p.$('[data-test=door-hall]')), `${s.n}: the mine door opens into the Hall of Doors`);
  check(await p.evaluate(() => window.__acidMine.paused === true), `${s.n}: the mine stops drawing behind the door`);
  await p.waitForTimeout(500);
  check(!reqs.some((r) => /\/(doom|nanosaur)\//.test(r.url)), `${s.n}: no game files loaded in the hall`);
  const hall = await p.evaluate(() => {
    const doors = [...document.querySelectorAll('[data-test^=hall-door-]')];
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 20 && r.height > 20 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; };
    return { n: doors.length, open: doors.filter((d) => d.dataset.open === '1').map((d) => d.dataset.test), allVisible: doors.every((d) => vis(d.querySelector('.m-hall-frame'))), exit: !!document.querySelector('[data-test=hall-exit]') };
  });
  check(hall.n >= 6 && hall.open.join() === 'hall-door-doom,hall-door-nanosaur' && hall.allVisible && hall.exit, `${s.n}: ${hall.n} doors, open: ${hall.open.join(', ')}, all on screen, back button ${JSON.stringify(hall)}`);
  check(await noScroll(p), `${s.n}: hall has no page scroll`);
  await shot(p, `${s.n}-2-hall`);
  // a locked door rattles and says so; nothing navigates
  const url0 = p.url(); const n0 = reqs.length;
  if (s.m) await p.tap('[data-test=hall-door-vault]', { force: true }); else await p.click('[data-test=hall-door-vault]', { force: true });
  await p.waitForTimeout(250);
  const note = await p.textContent('[data-test=hall-note]');
  check(/LOCKED|COMING SOON|NOT YET|HAMMERING/i.test(note) && !!(await p.$('[data-test=hall-door-vault].shake')), `${s.n}: locked door rattles: "${note}"`);
  check(p.url() === url0 && !!(await p.$('[data-test=door-hall]')) && !reqs.slice(n0).some((r) => r.method !== 'GET' || /\/(doom|nanosaur)\//.test(r.url)), `${s.n}: locked door goes nowhere`);
  await shot(p, `${s.n}-3-locked`);
  // Doom, unchanged, then back to the hall
  if (s.m) await p.tap('[data-test=hall-door-doom]'); else await p.click('[data-test=hall-door-doom]');
  await p.waitForSelector('[data-test=doom-room]', { timeout: 5000 }).catch(() => null);
  check(!!(await p.$('[data-test=doom-room]')), `${s.n}: Doom door opens the Doom room`);
  const df = await (await p.waitForSelector('.m-doom-frame')).contentFrame();
  await df.waitForFunction(() => window.__doomRunning === true, null, { timeout: 90000 }).catch(() => null);
  const dargs = await df.evaluate(() => (window.__doomArgs || []).join(' '));
  check(/-warp 1 1/.test(dargs), `${s.n}: Doom still drops into E1M1 (${dargs})`);
  await p.waitForTimeout(2500);
  check(await lit(df.locator('#canvas')) > 0.3, `${s.n}: Doom is drawing`);
  check((await p.textContent('[data-test=doom-exit]')).includes('HALL'), `${s.n}: Doom's exit goes back to the hall`);
  await shot(p, `${s.n}-4-doom`);
  await p.click('[data-test=doom-exit]'); await p.waitForTimeout(400);
  check(!!(await p.$('[data-test=door-hall]')) && !(await p.$('[data-test=doom-room]')), `${s.n}: back in the hall after Doom`);
  // Nanosaur: files only now, renders, responds
  const tNano = Date.now();
  check(!reqs.some((r) => r.url.includes('/nanosaur/')), `${s.n}: nothing under /nanosaur/ fetched before its door opened`);
  if (s.m) await p.tap('[data-test=hall-door-nanosaur]'); else await p.click('[data-test=hall-door-nanosaur]');
  await p.waitForSelector('[data-test=nano-room]', { timeout: 5000 }).catch(() => null);
  check(!!(await p.$('[data-test=nano-room]')), `${s.n}: Nanosaur door opens the Nanosaur room`);
  const nf = await (await p.waitForSelector('[data-test=nano-room] iframe')).contentFrame();
  await nf.waitForFunction(() => window.__nanoRunning === true, null, { timeout: 120000 }).catch(() => null);
  check(await nf.evaluate(() => window.__nanoRunning === true), `${s.n}: Nanosaur boots (${((Date.now() - tNano) / 1000).toFixed(1)} s)`);
  check(await nf.evaluate(() => window.__nanoPatched >= 3), `${s.n}: WebGL fixes installed`);
  await p.waitForTimeout(4000);
  const canvas = nf.locator('#canvas');
  check(await lit(canvas) > 0.5, `${s.n}: Nanosaur is drawing`);
  const geo = await nf.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { w: r.width, h: r.height, x: r.left, y: r.top, W: innerWidth, H: innerHeight }; });
  check(Math.abs(geo.w / geo.h - 4 / 3) < 0.02 && geo.x >= -1 && geo.y >= -1 && geo.x + geo.w <= geo.W + 1 && geo.y + geo.h <= geo.H + 1, `${s.n}: 4:3 picture fits the room ${JSON.stringify(geo)}`);
  if (s.m) check(await nf.evaluate(() => !document.getElementById('pad').hidden), `${s.n}: touch pad shown`);
  await shot(p, `${s.n}-5-nanosaur`);
  // walk forward and fire (keyboard, or the touch pad)
  const before = await canvas.screenshot();
  if (s.m) { await nf.locator('#pad [data-k=ArrowUp]').dispatchEvent('pointerdown'); await p.waitForTimeout(1500); await nf.locator('#pad [data-k=ArrowUp]').dispatchEvent('pointerup'); await nf.locator('#pad .fire').dispatchEvent('pointerdown'); await p.waitForTimeout(300); await nf.locator('#pad .fire').dispatchEvent('pointerup'); }
  else { await canvas.focus(); await p.keyboard.down('ArrowUp'); await p.waitForTimeout(1500); await p.keyboard.up('ArrowUp'); await p.keyboard.down('Space'); await p.waitForTimeout(300); await p.keyboard.up('Space'); }
  await p.waitForTimeout(600);
  const after = await canvas.screenshot();
  check(!before.equals(after), `${s.n}: the dino moves (${s.m ? 'touch pad' : 'keyboard'})`);
  await shot(p, `${s.n}-6-nanosaur-moved`);
  await p.click('[data-test=nano-mute]'); await p.waitForTimeout(500);
  const au = await nf.evaluate(() => (window.__bbaAudio || []).map((c) => c.state));
  check(au.length > 0 && au.every((st) => st !== 'running'), `${s.n}: mute silences the game (${au.join(',')})`);
  await p.click('[data-test=nano-mute]');
  await nf.click('[data-test=nano-credits]'); await p.waitForTimeout(200);
  const cr = await nf.evaluate(() => document.getElementById('credits').innerText);
  check(/Pangea/.test(cr) && /Jorio/.test(cr) && /Lachlan Wright/.test(cr) && /CC BY-NC-SA 4\.0/.test(cr), `${s.n}: credits + licence one tap away`);
  await shot(p, `${s.n}-7-nanosaur-credits`);
  await nf.click('#credits-close');
  const posts = reqs.filter((r) => r.t >= tOpen && (r.method !== 'GET' || r.url.includes('/api/mines/')));
  check(posts.length === 0, `${s.n}: no mine API calls or writes from behind the door (${posts.length})`);
  const gz = reqs.filter((r) => /Nanosaur\.(data|wasm)/.test(r.url)).map((r) => r.url.replace(B, ''));
  console.log(`     ${s.n}: nanosaur fetches ${gz.join(', ')}`);
  await p.click('[data-test=nano-exit]'); await p.waitForTimeout(400);
  check(!!(await p.$('[data-test=door-hall]')) && !(await p.$('[data-test=nano-room] iframe')), `${s.n}: back in the hall, game frame gone`);
  await p.click('[data-test=hall-exit]'); await p.waitForTimeout(600);
  check(!(await p.$('[data-test=door-hall]')) && await p.evaluate(() => window.__acidMine && window.__acidMine.paused === false), `${s.n}: back in a running mine`);
  await shot(p, `${s.n}-8-back-in-mine`);
  check(p.errs.length === 0, `${s.n}: no page errors ${p.errs.join(' | ')}`);
  await ctx.close();
}

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  let SIZES = [{ w: 1280, h: 720, n: '1280x720' }, { w: 390, h: 844, m: true, n: '390x844m' }, { w: 844, h: 390, m: true, n: '844x390m' }, { w: 1024, h: 768, n: '1024x768' }];
  if (SIZES_ENV) SIZES = SIZES.filter((s) => SIZES_ENV.split(',').includes(s.n));
  const sid = await login('Tyler', 'tyler.hall@example.com');
  for (const s of SIZES) await run(browser, sid, s);
  const r = await fetch(`${B}/nanosaur/Nanosaur.data?v=1`, { headers: { 'accept-encoding': 'gzip' } });
  check(r.headers.get('content-encoding') === 'gzip' && +r.headers.get('x-bba-size') === 18461446, `Nanosaur.data served gzipped from disk (${r.headers.get('content-length')} bytes on the wire)`);
  await r.arrayBuffer();
  const idx = fs.readdirSync(path.join(ROOT, 'dist/assets')).filter((n) => /^index-.*\.js$/.test(n)).map((n) => fs.readFileSync(path.join(ROOT, 'dist/assets', n), 'utf8')).join('');
  check(!/Nanosaur\.data|DoorHall|bba-nanosaur|hall-door/.test(idx), 'main bundle has no hall/Nanosaur code (lazy Mines chunk only)');
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
}
main().catch((e) => { console.error(e); fails.push(String(e)); }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fails.length ? 1 : 0); });
