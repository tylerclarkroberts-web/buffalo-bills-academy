// Browser check + screenshots for El Halo canyon walls (a solid, obvious rock face you cannot
// melt into) and La Doña (the heavyweight, type id gordo): traditional dress, HUD name, ¡TORTA! slam.
// Boots its own throwaway server with DEV_LOGIN (the /api/elhalo/test hook only exists there).
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core OUT=dir node scripts/e2e-el-halo-walls.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { BOUNDS } from '../server/elhalo/map.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4030 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-elhalo-walls-'));
const vidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-elhalo-walls-vid-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P_RADIUS = 0.38;
const inside = (x, z, r = P_RADIUS - 0.05) => x >= BOUNDS.x0 + r && x <= BOUNDS.x1 - r && z >= BOUNDS.z0 + r && z <= BOUNDS.z1 - r;

async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const sid = r.headers.get('set-cookie').split(';')[0].split('=')[1];
  const av = await fetch(B + '/api/me/avatar', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `bba_sid=${sid}` }, body: JSON.stringify({ kind: 'gen', seed: name }) });
  if (!av.ok) throw new Error('avatar ' + av.status + ' ' + await av.text());
  return sid;
}
const st = (p) => p.evaluate(() => window.__elHalo.state());
const hook = (p, body) => p.evaluate((b) => fetch('/api/elhalo/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), body);
const until = async (p, fn, arg, ms = 8000) => { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } };
const banner = (p) => p.evaluate(() => document.querySelector('[data-h=banner]')?.textContent || '');
const place = async (p, x, z, yaw) => {
  await hook(p, { place: { x, z, yaw } });
  if (yaw !== undefined) await p.evaluate((y) => window.__elHalo.face(y, 0.08), yaw);
  await until(p, (want) => { const s = window.__elHalo.state().pos; return Math.hypot(s.x - want.x, s.z - want.z) < 1.2; }, { x, z }, 4000);
};
const foe = (p, type) => p.evaluate((t) => window.__elHalo.state().foes.find((f) => f.type === t) || null, type);

async function open(browser, sid, s) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m,
    ...(s.video ? { recordVideo: { dir: vidDir, size: { width: s.w, height: s.h } } } : {}),
  });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.t0 = Date.now(); p.errs = []; p.n = s.n; p.m = !!s.m; p.ctx = ctx;
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.errs.push('console: ' + m.text()); });
  const resp = await p.goto(`${B}/elhalo`, { waitUntil: 'domcontentloaded' });
  p.gotoStatus = resp?.status();
  p.finalUrl = p.url();
  try {
    await p.waitForSelector('[data-test=elhalo-page], [data-test=elhalo-room], [data-test=elhalo-lobby], [data-test=elhalo-start]', { timeout: 20000 });
    await p.waitForFunction(() => !!window.__elHalo, null, { timeout: 15000 });
  } catch (err) {
    console.error('open failed', p.url(), (await p.content()).slice(0, 800));
    throw err;
  }
  return p;
}
async function start(p) {
  const tap = (sel) => (p.m ? p.tap(sel) : p.click(sel));
  await tap('[data-test=elhalo-start]');
  await until(p, () => ['lobby', 'playing'].includes(window.__elHalo.state().mode));
  if ((await st(p)).mode === 'lobby') {
    if (await p.isVisible('[data-test=elhalo-begin]')) await tap('[data-test=elhalo-begin]');
    else await tap('[data-test=elhalo-ready]');
  }
  return until(p, () => window.__elHalo.state().mode === 'playing' && window.__elHalo.state().joined && window.__elHalo.state().st === 'alive');
}
async function holdKey(p, key, ms) { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); }
async function holdPad(p, btn, ms, id = 21) { const b = p.locator(`[data-test=pad-${btn}]`); await b.dispatchEvent('pointerdown', { pointerId: id, pointerType: 'touch' }); await p.waitForTimeout(ms); await b.dispatchEvent('pointerup', { pointerId: id, pointerType: 'touch' }); }

const WALL_PUSH = [
  { x: BOUNDS.x1 - 2, z: -8, yaw: -Math.PI / 2, n: 'east z=-8' },
  { x: BOUNDS.x1 - 2, z: 20, yaw: -Math.PI / 2, n: 'east z=20' },
  { x: BOUNDS.x0 + 2, z: 8, yaw: Math.PI / 2, n: 'west z=8' },
  { x: BOUNDS.x0 + 2, z: -44, yaw: Math.PI / 2, n: 'west z=-44' },
  { x: 0, z: BOUNDS.z0 + 2, yaw: 0, n: 'north z=-62' },
  { x: 8, z: BOUNDS.z1 - 2, yaw: Math.PI, n: 'south z=62' },
  { x: BOUNDS.x1 - 2, z: BOUNDS.z0 + 2, yaw: -Math.PI * 0.75, n: 'SE corner' },
  { x: BOUNDS.x0 + 2, z: BOUNDS.z1 - 2, yaw: Math.PI * 0.75, n: 'NW corner' },
];

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(200); } }
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const sid = await login('Tyler', 'tyler.elhalowalls@example.com');
  const T = await open(browser, sid, { w: 1280, h: 720, n: 'tyler-1280x720', video: true });
  check(await start(T), 'Tyler: joins the match');
  await hook(T, { calm: true, night: false, wave: 1, empty: true });
  await until(T, () => window.__elHalo.state().phase === 'wave', null, 6000);

  // ================= CANYON WALLS =================
  // a clear view of the east face and the darker ledge at the foot
  await place(T, 21.2, -8, -Math.PI / 2);
  await T.evaluate(() => window.__elHalo.face(-Math.PI / 2, 0.28));
  await T.waitForTimeout(500);
  await shot(T, 'desktop-wall-east');

  let melted = 0;
  for (const w of WALL_PUSH) {
    await place(T, w.x, w.z, w.yaw);
    await T.evaluate((y) => window.__elHalo.face(y, 0.05), w.yaw);
    await T.waitForTimeout(200);
    await holdKey(T, 'KeyW', 1100);
    const a = await st(T);
    const ok = inside(a.pos.x, a.pos.z);
    check(ok, `push ${w.n}: stayed inside the face at (${a.pos.x}, ${a.pos.z})`);
    if (!ok) melted++;
  }
  check(melted === 0, `no melt into the walls (${melted} failures)`);

  // sprint into the east face (Shift+W if the game uses it; otherwise just hold W longer from closer)
  await place(T, BOUNDS.x1 - 1.2, 12, -Math.PI / 2);
  await T.evaluate(() => window.__elHalo.face(-Math.PI / 2, 0.05));
  await T.keyboard.down('ShiftLeft');
  await holdKey(T, 'KeyW', 900);
  await T.keyboard.up('ShiftLeft');
  let a = await st(T);
  check(inside(a.pos.x, a.pos.z), `sprint into the east face: (${a.pos.x}, ${a.pos.z})`);
  await place(T, BOUNDS.x1 - 1.4, 12, -Math.PI / 2);
  await T.evaluate(() => window.__elHalo.face(-Math.PI / 2, -0.15));
  await T.keyboard.down('Space');
  await holdKey(T, 'KeyW', 800);
  await T.keyboard.up('Space');
  a = await st(T);
  check(inside(a.pos.x, a.pos.z), `jump into the east face: (${a.pos.x}, ${a.pos.z})`);

  // ================= LA DOÑA (portraits first, while the match is still on) =================
  await hook(T, { clear: true, calm: true });
  await place(T, 2.4, -26.6, Math.PI + 0.45);
  await T.evaluate(() => window.__elHalo.face(Math.PI + 0.5, 0.12));
  await hook(T, { spawn: [{ type: 'gordo', x: 0, z: -24, still: true, lcool: 99, yaw: Math.PI + 0.6 }] });
  await T.waitForTimeout(900);
  const g0 = await foe(T, 'gordo');
  const peek = (await hook(T, { peek: true })).list.find((e) => e.type === 'gordo');
  check(g0 && peek && peek.maxHp === 700, `La Doña is out, 700 max health (${JSON.stringify(peek)})`);
  await T.evaluate(() => window.__elHalo.aimAtNearest(true));
  await T.waitForTimeout(250);
  await shot(T, 'desktop-dona');

  // ================= PHONE (before the slam, so the match cannot end first) =================
  const sidK = await login('Kash', 'kash.elhalowalls@example.com');
  const K = await open(browser, sidK, { w: 390, h: 844, n: 'kash-390x844', m: true });
  check(await start(K), 'Kash: joins on the phone');
  await hook(K, { calm: true, night: false, empty: true });
  await until(K, () => window.__elHalo.state().mode === 'playing' && window.__elHalo.state().st === 'alive', null, 8000);
  await place(K, 21.2, -8, -Math.PI / 2);
  await K.evaluate(() => window.__elHalo.face(-Math.PI / 2, 0.28));
  await K.waitForTimeout(500);
  await shot(K, 'phone-wall-east');
  await place(K, BOUNDS.x1 - 2, -8, -Math.PI / 2);
  await K.evaluate(() => window.__elHalo.face(-Math.PI / 2, 0.05));
  await K.evaluate(([x, z]) => window.__elHalo.walkTo(x, z), [BOUNDS.x1 + 4, -8]);
  await K.waitForTimeout(1200);
  a = await st(K);
  check(inside(a.pos.x, a.pos.z), `phone push into the east face: (${a.pos.x}, ${a.pos.z})`);

  await hook(K, { clear: true, calm: true });
  await place(K, 2.4, -26.6, Math.PI + 0.45);
  await K.evaluate(() => window.__elHalo.face(Math.PI + 0.5, 0.12));
  await hook(K, { spawn: [{ type: 'gordo', x: 0, z: -24, still: true, lcool: 99, yaw: Math.PI + 0.6 }] });
  await K.waitForTimeout(900);
  await K.evaluate(() => window.__elHalo.aimAtNearest(true));
  await K.waitForTimeout(250);
  await shot(K, 'phone-dona');

  // the TORTA slam: she winds up on Tyler, then we sidestep so the shout and the dress stay in frame
  await hook(T, { clear: true, calm: false, hp: 100 });
  await place(T, 0, -30, Math.PI);
  await T.evaluate(() => window.__elHalo.face(Math.PI, 0.1));
  await T.waitForTimeout(300);
  T.gifFrom = (Date.now() - T.t0) / 1000 - 0.1;
  await hook(T, { spawn: [{ type: 'gordo', x: 0, z: -25.5, lcool: 0.25, yaw: Math.PI }] });
  check(await until(T, () => window.__elHalo.state().foes.some((f) => f.type === 'gordo' && f.st === 'windup'), null, 4000), 'La Doña winds up (¡AHÍ VOY!)');
  await T.evaluate(() => window.__elHalo.aimAtNearest(true));
  await T.waitForTimeout(350);
  await shot(T, 'desktop-dona-windup');
  // once she is in the air, step aside and look at the landing so ¡TORTA! is readable
  check(await until(T, () => window.__elHalo.state().foes.some((f) => f.type === 'gordo' && (f.st === 'leap' || f.st === 'slam')), null, 4000), 'she takes off');
  const land = { x: 0, z: -30 }, view = { x: 3.8, z: -27.4 };
  const look = Math.atan2(-(land.x - view.x), -(land.z - view.z));
  await place(T, view.x, view.z, look);
  await T.evaluate((y) => window.__elHalo.face(y, 0.22), look);
  const slammed = await until(T, () => {
    const s = window.__elHalo.state();
    const text = document.querySelector('[data-h=banner]')?.textContent || '';
    return text.includes('TORTA') || s.foes.some((f) => f.type === 'gordo' && (f.st === 'slam' || f.st === 'recover'));
  }, null, 5000);
  check(slammed, `the slam lands (${(await st(T)).foes.find((f) => f.type === 'gordo')?.st} banner="${await banner(T)}")`);
  const shouted = await until(T, () => (document.querySelector('[data-h=banner]')?.textContent || '').includes('TORTA'), null, 2500);
  check(shouted || (await banner(T)).includes('TORTA'), `¡TORTA! floating text / banner ("${await banner(T)}")`);
  await T.waitForTimeout(200);
  await shot(T, 'desktop-dona-torta');
  T.gifTo = (Date.now() - T.t0) / 1000 + 0.5;
  await hook(T, { clear: true, calm: true, hp: 100 }); // don't let a second flop end the match mid-teardown

  const vid = await T.video()?.path();
  for (const p of [T, K]) check(p.errs.length === 0, `${p.n}: no page errors ${p.errs.slice(0, 3).join(' | ')}`);
  console.log(`     fps (software GL): Tyler ${(await st(T)).fps}, Kash ${(await st(K)).fps}`);
  await T.ctx.close(); await K.ctx.close();
  if (OUT && vid) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.copyFileSync(vid, path.join(OUT, 'tyler-session.webm'));
    const from = Math.max(0, T.gifFrom || 0);
    const dur = Math.max(2, Math.min(12, (T.gifTo || from + 6) - from));
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(from), '-t', String(dur), '-i', path.join(OUT, 'tyler-session.webm'),
        '-vf', 'fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer',
        path.join(OUT, 'dona-torta-slam.gif')]);
      console.log('     gif:', path.join(OUT, 'dona-torta-slam.gif'), `ss=${from.toFixed(2)} t=${dur.toFixed(2)}`);
    } catch (e) { console.log('     (no gif: ' + e.message + ')'); }
  }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
}
main().catch((e) => { console.error(e); fails.push(String(e)); }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fails.length ? 1 : 0); });
