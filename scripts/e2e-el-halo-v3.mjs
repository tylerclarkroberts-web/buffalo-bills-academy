// Browser check + screenshots for EL HALO v3: La Michoacana (sign, logo, freezer cases), the elote man (his calls, the
// heal), the street dogs (same on every screen, the stuck pair, fewer on phones), the luchador volador's ¡ÁGUILA! dive
// (telegraph, ring, damage, knockback, a takedown on the phone) and el gordo (health bar, headshot, belly flop).
// Boots its own throwaway server with DEV_LOGIN (the /api/elhalo/test hook only exists there).
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core OUT=dir node scripts/e2e-el-halo-v3.mjs   (OUT gets shots, a video and a GIF)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { OPENINGS, ELOTE, creekX } from '../server/elhalo/map.js';
import { dogsAt } from '../server/elhalo/critters.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4010 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-elhalo3-'));
const vidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-elhalo3-vid-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  return r.headers.get('set-cookie').split(';')[0].split('=')[1];
}
const noScroll = (p) => p.evaluate(() => { const de = document.documentElement; return !(de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1); });
const inView = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((el) => el.getClientRects().length).every((el) => { const r = el.getBoundingClientRect(); return r.width > 10 && r.height > 10 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }), sel);
const st = (p) => p.evaluate(() => window.__elHalo.state());
const hook = (p, body) => p.evaluate((b) => fetch('/api/elhalo/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), body);
const until = async (p, fn, arg, ms = 8000) => { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } };
const banner = (p) => p.evaluate(() => document.querySelector('[data-h=banner]')?.textContent || '');
const foe = (p, type) => p.evaluate((t) => window.__elHalo.state().foes.find((f) => f.type === t) || null, type);

async function open(browser, sid, s) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m, ...(s.video ? { recordVideo: { dir: vidDir, size: { width: s.w, height: s.h } } } : {}) });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.t0 = Date.now(); p.errs = []; p.n = s.n; p.m = !!s.m; p.ctx = ctx;
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.errs.push('console: ' + m.text()); });
  p.reqs = []; p.on('request', (r) => p.reqs.push({ url: r.url(), method: r.method(), t: Date.now() }));
  await p.goto(`${B}/mines`); await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas');
  await p.waitForFunction(() => !!window.__acidMine); await p.waitForTimeout(800);
  await p.evaluate(() => { const m = window.__acidMine, d = m.door.group.position; m.yaw = Math.atan2(-(d.x - m.pos.x), -(d.z - m.pos.y)); });
  await p.waitForSelector('[data-test=door-prompt]', { timeout: 5000 }).catch(() => null);
  if (s.m) await p.tap('[data-test=door-open]'); else await p.keyboard.press('f');
  await p.waitForSelector('[data-test=door-hall]', { timeout: 5000 });
  check(!p.reqs.some((r) => /ElHaloRoom/.test(r.url)), `${s.n}: El Halo chunk not loaded in the hall`);
  p.tIn = Date.now();
  if (s.m) await p.tap('[data-test=hall-door-elhalo]'); else await p.click('[data-test=hall-door-elhalo]');
  await p.waitForSelector('[data-test=elhalo-lobby]', { timeout: 15000 });
  await p.waitForFunction(() => !!window.__elHalo && window.__elHalo.mode === 'title', null, { timeout: 10000 });
  return p;
}
async function start(p) {
  const tap = (sel) => (p.m ? p.tap(sel) : p.click(sel));
  await tap('[data-test=elhalo-start]');
  await until(p, () => ['lobby', 'playing'].includes(window.__elHalo.state().mode));
  if ((await st(p)).mode === 'lobby') { // in the lobby: the host starts it (or everyone gets ready)
    if (await p.isVisible('[data-test=elhalo-begin]')) await tap('[data-test=elhalo-begin]'); else await tap('[data-test=elhalo-ready]');
  }
  return until(p, () => window.__elHalo.state().mode === 'playing' && window.__elHalo.state().joined && window.__elHalo.state().st === 'alive');
}
async function holdKey(p, key, ms) { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); }
async function holdPad(p, btn, ms, id = 21) { const b = p.locator(`[data-test=pad-${btn}]`); await b.dispatchEvent('pointerdown', { pointerId: id, pointerType: 'touch' }); await p.waitForTimeout(ms); await b.dispatchEvent('pointerup', { pointerId: id, pointerType: 'touch' }); }
const place = (p, x, z, yaw) => hook(p, { place: { x, z, yaw } });
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(200); } }
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const [sT, sK] = [await login('Tyler', 'tyler.elhalo3@example.com'), await login('Kash', 'kash.elhalo3@example.com')];
  const T = await open(browser, sT, { w: 1280, h: 720, n: 'tyler-1280x720', video: true });
  check(await start(T), 'Tyler: joins the match');
  await hook(T, { calm: true, night: false, wave: 1, empty: true });
  await until(T, () => window.__elHalo.state().phase === 'wave', null, 6000);
  let a = await st(T);

  // ================= LA MICHOACANA =================
  check(a.shop >= 4, `La Michoacana: sign, logos and case glass are built (${a.shop} pieces)`);
  await place(T, 1.5, 3, yawTo({ x: 1.5, z: 3 }, { x: 9, z: 3 })); await T.waitForTimeout(600); await T.evaluate(() => window.__elHalo.face(-Math.PI / 2, 0.06)); await T.waitForTimeout(400);
  await shot(T, '01-michoacana-storefront');
  const door = OPENINGS.find((o) => o.b === 'michoacana' && o.door);
  await T.evaluate(([x, z]) => window.__elHalo.walkTo(x, z), [door.in.x + 1.5, door.in.z]);
  check(await until(T, () => window.__elHalo.state().pos.x > 9.6, null, 8000), `walk in the front door, no boards (${JSON.stringify((await st(T)).pos)})`);
  await place(T, 11.2, 0.2, 0); await T.waitForTimeout(400); await T.evaluate(() => window.__elHalo.face(-Math.PI * 0.62, -0.22)); await T.waitForTimeout(400);
  await shot(T, '02-michoacana-cases');
  check(a.prompt?.k !== 'b' + 'uild' && !('bars' in a), 'no boards in the state, no board prompt');

  // ================= THE ELOTE MAN =================
  await place(T, ELOTE.x - 2.6, ELOTE.z - 2.2, yawTo({ x: ELOTE.x - 2.6, z: ELOTE.z - 2.2 }, ELOTE)); await T.waitForTimeout(300);
  await T.evaluate(() => window.__elHalo.face(window.__elHalo.state().yaw, -0.12));
  check(await until(T, () => window.__elHalo.state().elote.say >= 0, null, 9000), `the elote man calls out (${JSON.stringify((await st(T)).elote)})`);
  await T.waitForTimeout(250); await shot(T, '03-elote-man');
  const lines = new Set(); for (let k = 0; k < 40 && lines.size < 2; k++) { const e = (await st(T)).elote; if (e.line) lines.add(e.line); await T.waitForTimeout(500); }
  check(lines.size >= 1 && [...lines].every((l) => /ELOTE|ESQUITE|ELOTITO|CHILE|MAYO|LIMÓN|QUESO|CALIENT/i.test(l)), `his calls: ${[...lines].join(' / ')}`);
  await hook(T, { hp: 50 }); await place(T, ELOTE.x - 1.2, ELOTE.z - 1, yawTo({ x: ELOTE.x - 1.2, z: ELOTE.z - 1 }, ELOTE));
  check(await until(T, () => window.__elHalo.state().prompt?.k === 'elote' && window.__elHalo.state().prompt.ready, null, 3000), `E prompt at the cart (${JSON.stringify((await st(T)).prompt)})`);
  await holdKey(T, 'KeyE', 300);
  check(await until(T, () => window.__elHalo.state().health >= 78, null, 3000), `E: an elote, +30 health (50 → ${(await st(T)).health}) "${await banner(T)}"`);
  check(await until(T, () => /OTRO ELOTE EN/.test(window.__elHalo.state().prompt?.label || ''), null, 2000), 'then a cooldown');
  // enemies leave him alone and shoot past him
  await place(T, ELOTE.x - 9, ELOTE.z - 3, 0); await T.waitForTimeout(300);
  await hook(T, { spawn: [{ type: 'luchador', x: ELOTE.x + 0.6, z: ELOTE.z + 0.6 }] }); await T.waitForTimeout(1800);
  const lu = await foe(T, 'luchador'), me0 = (await st(T)).pos;
  check(lu && Math.hypot(lu.x - me0.x, lu.z - me0.z) < Math.hypot(ELOTE.x + 0.6 - me0.x, ELOTE.z + 0.6 - me0.z) - 2, `a luchador spawned at the cart ignores the elote man and comes for Tyler (${JSON.stringify(lu)})`);
  await hook(T, { clear: true });

  // ================= STREET DOGS =================
  a = await st(T); const sv = await hook(T, { dogs: true });
  check(a.dogs.length === 6 && a.dogs.filter((d) => d.pair).length === 2, `6 dogs on the desktop, the pair included (${a.dogs.length})`);
  const want = dogsAt(a.dogT);
  check(a.dogs.every((d) => Math.abs(d.x - want[d.i].x) < 0.02 && Math.abs(d.z - want[d.i].z) < 0.02) && Math.abs(a.dogT - sv.t) < 1, `the dogs are the server's dogs, on the match clock (client t ${a.dogT}, server ${sv.t.toFixed(2)})`);
  const [pa, pb] = a.dogs.filter((d) => d.pair);
  check(Math.abs(Math.hypot(pa.x - pb.x, pa.z - pb.z) - 0.84) < 0.05, `the stuck pair, rear to rear (${Math.hypot(pa.x - pb.x, pa.z - pb.z).toFixed(2)} m)`);
  // the shot of the pair: stand off to the side of them where they'll be in a moment
  let ahead = 1.2; for (let k = 1.2; k < 40; k += 0.4) { const f = dogsAt(a.dogT + k); if (Math.abs((f[4].x + f[5].x) / 2 - creekX((f[4].z + f[5].z) / 2)) > 4.5) { ahead = k; break; } }
  await T.waitForTimeout((ahead - 1.2) * 1000);
  const fut = dogsAt(a.dogT + ahead), pc = { x: (fut[4].x + fut[5].x) / 2, z: (fut[4].z + fut[5].z) / 2 }, side = Math.atan2(fut[4].x - fut[5].x, fut[4].z - fut[5].z);
  const cam = { x: pc.x + Math.cos(side) * 3.6, z: pc.z - Math.sin(side) * 3.6 };
  await place(T, cam.x, cam.z, yawTo(cam, pc)); await T.waitForTimeout(900); await T.evaluate(() => window.__elHalo.face(window.__elHalo.state().yaw, -0.42));
  const pd = (await st(T)).dogs.filter((d) => d.pair); await T.evaluate(([x, z]) => window.__elHalo.aimAt(x, 0.2 + (window.__elHalo.state().pos.y), z), [(pd[0].x + pd[1].x) / 2, (pd[0].z + pd[1].z) / 2]);
  await T.waitForTimeout(150); await shot(T, '04-dogs-stuck-pair');
  a = await st(T); const free = a.dogs.find((d) => !d.pair); const fc = { x: free.x + 4, z: free.z + 4 };
  await place(T, fc.x, fc.z, yawTo(fc, free)); await T.waitForTimeout(500); await shot(T, '05-dog-roaming');

  // ================= LUCHADOR VOLADOR =================
  await place(T, 0, -30, 0); await hook(T, { clear: true, calm: false }); await T.waitForTimeout(500);
  a = await st(T); const sh0 = a.shield + a.health;
  await hook(T, { spawn: [{ type: 'volador', x: 0, z: -17, lcool: 0.4, yaw: Math.PI }] });
  await T.evaluate(() => window.__elHalo.face(Math.PI, 0.18));
  check(await until(T, () => window.__elHalo.state().foes.some((f) => f.type === 'volador' && f.st === 'windup'), null, 5000), 'the volador crouches (windup)');
  check(await until(T, () => /ÁGUILA/.test([...document.querySelectorAll('[data-test=elhalo-feed] div')].map((d) => d.textContent).join(' ')) || window.__elHalo.state().foes.some((f) => f.st === 'leap'), null, 2000), '¡ÁGUILA! and up it goes');
  const gifFrom = (Date.now() - T.t0) / 1000 - 1.2;
  check(await until(T, () => window.__elHalo.state().foes.some((f) => f.type === 'volador' && f.st === 'leap' && f.y > 2.2), null, 3000), `mid-air, high (${JSON.stringify(await foe(T, 'volador'))})`);
  a = await st(T); check(a.rings >= 1, `the landing ring shows where it will land (${a.rings})`);
  await shot(T, '06-volador-leap');
  check(await until(T, (h) => { const s = window.__elHalo.state(); return s.shield + s.health < h; }, sh0, 3000), `it lands on Tyler: ${sh0} → ${(await st(T)).shield + (await st(T)).health} "${await banner(T)}"`);
  a = await st(T); check(Math.hypot(a.pos.x, a.pos.z + 30) > 1.2, `and throws him back (${JSON.stringify(a.pos)})`);
  await T.waitForTimeout(200); await shot(T, '07-volador-landing');
  const gifTo = (Date.now() - T.t0) / 1000 + 0.6;
  await hook(T, { clear: true, calm: true });

  // ================= PHONE: fewer dogs, the volador takes Kash down =================
  const K = await open(browser, sK, { w: 390, h: 844, m: true, n: 'kash-390x844' });
  check(await start(K), 'Kash: joins on a phone');
  a = await st(K);
  check(a.dogs.length === 4 && a.dogs.filter((d) => d.pair).length === 2, `phone: 4 dogs (2 roaming + the pair) (${a.dogs.length})`);
  check(await noScroll(K) && await inView(K, '[data-test^=pad-]'), 'phone: no scroll, pad on screen');
  await place(T, 15, 3, 0); await place(K, 0, -40, Math.PI); await hook(K, { hp: 35, calm: false });
  await hook(K, { spawn: [{ type: 'volador', x: 0, z: -28, lcool: 0.3, yaw: Math.PI }] }); await K.evaluate(() => window.__elHalo.face(Math.PI, 0.2));
  if (await until(K, () => window.__elHalo.state().foes.some((f) => f.type === 'volador' && f.st === 'leap'), null, 5000)) { await hook(K, { hp: 20 }); await shot(K, '11-phone-volador'); } // (the shield had started coming back)
  check(await until(K, () => window.__elHalo.state().st === 'downed', null, 5000), `the volador's dive takes Kash down (${(await st(K)).st}, ${(await st(K)).shield}/${(await st(K)).health}) "${await banner(K)}"`);
  await K.waitForTimeout(300); await shot(K, '12-phone-takedown');
  await hook(K, { clear: true, calm: true });

  // ================= EL GORDO =================
  await hook(T, { give: 'rifle' }); await place(T, 0, -30, Math.PI); await T.waitForTimeout(2200); // (let the new-gun banner go)
  await hook(T, { spawn: [{ type: 'gordo', x: 0, z: -23, still: true, lcool: 99, hp: 470, yaw: Math.PI }] }); await T.waitForTimeout(900);
  const g0 = await foe(T, 'gordo'); const peek = (await hook(T, { peek: true })).list.find((e) => e.type === 'gordo');
  check(g0 && peek && peek.maxHp === 700, `el gordo is out, 700 max health (${JSON.stringify(peek)})`);
  await T.evaluate(() => window.__elHalo.aimAtNearest(true)); await T.evaluate(() => window.__elHalo.face(window.__elHalo.state().yaw, window.__elHalo.state().pitch - 0.1));
  await T.waitForTimeout(200); await shot(T, '08-gordo-healthbar');
  await T.evaluate(() => window.__elHalo.aimAtNearest(true)); await T.evaluate(() => window.__elHalo.fire(true)); await T.waitForTimeout(150);
  const headed = await until(T, () => window.__elHalo.state().headMark, null, 1500); await T.evaluate(() => window.__elHalo.fire(false));
  check(headed, 'a shot to his mask counts as a headshot');
  await hook(T, { clear: true, calm: false }); await place(T, 0, -30, Math.PI);
  a = await st(T); const before = a.shield + a.health;
  await hook(T, { spawn: [{ type: 'gordo', x: 0, z: -25.5, lcool: 0.3, yaw: Math.PI }] });
  check(await until(T, () => window.__elHalo.state().foes.some((f) => f.type === 'gordo' && f.st === 'windup'), null, 4000), 'el gordo winds up (¡AHÍ VOY!)');
  await T.waitForTimeout(500); await T.evaluate(() => window.__elHalo.face(Math.PI, 0.1)); await shot(T, '09-gordo-windup');
  check(await until(T, (h) => { const s = window.__elHalo.state(); return s.shield + s.health <= h - 90 || s.st === 'downed'; }, before, 4000), `the belly flop lands hard (${before} → ${(await st(T)).shield + (await st(T)).health})`);
  await T.waitForTimeout(150); await shot(T, '10-gordo-flop');
  check(await until(T, () => window.__elHalo.state().st === 'downed', null, 9000), `two flops at most and Tyler's down (${(await st(T)).st})`);
  await hook(T, { clear: true, calm: true });

  const vid = await T.video()?.path();
  for (const p of [T, K]) check(p.errs.length === 0, `${p.n}: no page errors ${p.errs.slice(0, 3).join(' | ')}`);
  console.log(`     fps (software GL): Tyler ${(await st(T)).fps}, Kash ${(await st(K)).fps}`);
  await T.ctx.close(); await K.ctx.close();
  if (OUT && vid) {
    fs.copyFileSync(vid, path.join(OUT, 'tyler-session.webm'));
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, gifFrom)), '-t', String(gifTo - gifFrom), '-i', path.join(OUT, 'tyler-session.webm'), '-vf', 'fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer', path.join(OUT, 'volador-leap.gif')]);
      console.log('     gif:', path.join(OUT, 'volador-leap.gif'));
    } catch (e) { console.log('     (no gif: ' + e.message + ')'); }
  }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
}
main().catch((e) => { console.error(e); fails.push(String(e)); }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fails.length ? 1 : 0); });
