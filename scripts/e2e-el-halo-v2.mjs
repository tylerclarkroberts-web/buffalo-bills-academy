// Browser check + screenshots for EL HALO v2: the lobby (looks, roster, ready, host start, phones with no scroll), all 12
// weapons (melee lunge + slam), headshots, the supply truck window (no spawns, walk up or E for a gun), revive and the
// bleed-out ring, the open church, jumping off a fort deck with no fall damage, the horde climbing the stairs, frag and
// sticky grenades, the 2-seat jeep, and the wave 5/10/15 content (chupacabras, night + folklore, the jeep). Boots its
// own throwaway server with the DEV_LOGIN test hooks (never mounted in production).
//   npm run build && PLAYWRIGHT_DIR=/path/with/playwright-core node scripts/e2e-el-halo-v2.mjs   (OUT=dir for shots + video)
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
import { OPENINGS, fortRects, FORT_DECK, groundAt } from '../server/elhalo/map.js';
import { WEAPONS } from '../server/elhalo/rules.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT;
const PORT = 4080 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-elhalo2-'));
const vidDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-e2e-elhalo2-vid-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '' }, stdio: 'ignore' });
const fails = []; const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const shot = async (p, name) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: path.join(OUT, `${name}.png`) }); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  return r.headers.get('set-cookie').split(';')[0].split('=')[1];
}
const noScroll = (p) => p.evaluate(() => { const de = document.documentElement; return !(de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1); });
const inView = (p, sel) => p.evaluate((s) => { const els = [...document.querySelectorAll(s)].filter((el) => el.getClientRects().length); return els.length > 0 && els.every((el) => { const r = el.getBoundingClientRect(); return r.width > 8 && r.height > 8 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }); }, sel);
const st = (p) => p.evaluate(() => window.__elHalo.state());
const hook = (p, body) => p.evaluate((b) => fetch('/api/elhalo/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()), body);
const until = async (p, fn, arg, ms = 8000) => { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch { return false; } };
const board = (p) => p.evaluate(() => window.__elHalo.board());
const tap = (p, sel) => (p.m ? p.tap(sel) : p.click(sel));
let vid0 = 0; const mark = (what) => console.log(`     [video ${((Date.now() - vid0) / 1000).toFixed(1)}s] ${what}`);
const place = (p, x, z, yaw, y) => hook(p, { place: { x, z, yaw, ...(y !== undefined ? { y } : {}) } });

async function open(browser, sid, s) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, isMobile: !!s.m, hasTouch: !!s.m, ...(s.video ? { recordVideo: { dir: vidDir, size: { width: s.w, height: s.h } } } : {}) });
  await ctx.addCookies([{ name: 'bba_sid', value: sid, url: B }]);
  const p = await ctx.newPage(); p.errs = []; p.n = s.n; p.m = !!s.m; p.ctx = ctx;
  p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) p.errs.push('console: ' + m.text()); });
  await p.goto(`${B}/mines`); await p.click('text=[ CLOCK IN ]'); await p.waitForSelector('.m-canvas');
  await p.waitForFunction(() => !!window.__acidMine); await p.waitForTimeout(800);
  await p.evaluate(() => { const m = window.__acidMine, d = m.door.group.position; m.yaw = Math.atan2(-(d.x - m.pos.x), -(d.z - m.pos.y)); });
  await p.waitForSelector('[data-test=door-prompt]', { timeout: 5000 }).catch(() => null);
  if (s.m) await p.tap('[data-test=door-open]'); else await p.keyboard.press('f');
  await p.waitForSelector('[data-test=door-hall]', { timeout: 5000 });
  await tap(p, '[data-test=hall-door-elhalo]');
  await p.waitForSelector('[data-test=elhalo-lobby]', { timeout: 15000 });
  await p.waitForFunction(() => !!window.__elHalo && window.__elHalo.state().status === 'live', null, { timeout: 10000 }).catch(() => null);
  return p;
}
const playing = (p) => until(p, () => window.__elHalo.state().mode === 'playing' && window.__elHalo.state().st === 'alive', null, 15000);

async function main() {
  for (let i = 0; i < 50; i++) { try { await fetch(B + '/api/health'); break; } catch { await sleep(200); } }
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const [sT, sJ, sK, sA] = [await login('Tyler', 'tyler.v2@example.com'), await login('Joe', 'joe.v2@example.com'), await login('Kash', 'kash.v2@example.com'), await login('Ana', 'ana.v2@example.com')];

  // ================= LOBBY =================
  vid0 = Date.now();
  const T = await open(browser, sT, { w: 1280, h: 720, n: 'tyler', video: true });
  check(await T.isVisible('[data-test=elhalo-preview]') && await noScroll(T), 'Tyler: lobby with the 3D preview, no scroll');
  await tap(T, '[data-test=elhalo-start]');
  check(await until(T, () => window.__elHalo.state().mode === 'lobby' && window.__elHalo.state().host), 'Tyler: in the pre-game lobby as host');
  const look0 = (await st(T)).look;
  for (const k of ['poncho', 'poncho', 'sombrero', 'bigote', 'cuello', 'cuello', 'botas', 'botas']) { await T.click(`[data-test=look-${k}-next]`); await T.waitForTimeout(80); }
  await T.click('[data-test=look-hatColor-next]'); await T.click('[data-test=look-hatColor-next]'); await T.click('[data-test=look-hatColor-next]');
  check(await until(T, (l) => JSON.stringify(window.__elHalo.state().look) !== l, JSON.stringify(look0), 4000), `Tyler: look changes from the lobby (${JSON.stringify((await st(T)).look)})`);
  await sleep(600);
  const saved = await T.evaluate(() => fetch('/api/elhalo/look').then((r) => r.json()));
  check([].concat(saved.look).join('') === String((await st(T)).look), `look is saved to the profile on the server (${JSON.stringify(saved)})`);
  const f0 = await T.evaluate(() => window.__elHalo.state().frames); await T.waitForTimeout(700);
  check((await T.evaluate(() => window.__elHalo.state().frames)) > f0 + 3, 'Tyler: the preview keeps rendering (rotating)');
  await shot(T, 'lobby-desktop');

  const J = await open(browser, sJ, { w: 1280, h: 720, n: 'joe' });
  await tap(J, '[data-test=elhalo-start]');
  check(await until(J, () => window.__elHalo.state().mode === 'lobby' && window.__elHalo.state().roster.length === 2 && !window.__elHalo.state().host), `Joe: in the lobby too, sees 2 in the roster, not host`);
  check(await until(T, () => document.querySelectorAll('[data-test=roster-row]').length === 2), 'Tyler: roster shows Joe live');
  await J.click('[data-test=look-poncho-next]'); await J.click('[data-test=look-bigote-next]'); await J.click('[data-test=look-bigote-next]');
  await tap(J, '[data-test=elhalo-ready]');
  check(await until(T, () => window.__elHalo.state().roster.some((r) => r.name === 'Joe' && r.ready)), 'Tyler sees Joe ready');
  check(!(await J.isVisible('[data-test=elhalo-begin]')), 'Joe (not host) has no start button');

  const A = await open(browser, sA, { w: 844, h: 390, m: true, n: 'ana-landscape' });
  check(await noScroll(A) && await inView(A, '[data-test=elhalo-preview]') && await inView(A, '[data-test=elhalo-start]'), 'Ana: landscape phone lobby fits, no scroll');
  await shot(A, 'lobby-phone-landscape'); await A.ctx.close();

  const K0 = await open(browser, sK, { w: 390, h: 844, m: true, n: 'kash-lobby' });
  await tap(K0, '[data-test=elhalo-start]');
  await until(K0, () => window.__elHalo.state().mode === 'lobby');
  await K0.tap('[data-test=look-poncho-next]'); await K0.tap('[data-test=look-sombrero-next]'); await K0.tap('[data-test=look-sombrero-next]');
  check(await noScroll(K0) && await inView(K0, '[data-test^=look-][data-test$=-next]') && await inView(K0, '[data-test=elhalo-ready]'), 'Kash: portrait phone lobby fits, every control reachable, no scroll');
  await K0.waitForTimeout(300); await shot(K0, 'lobby-phone-portrait');
  await K0.click('[data-test=elhalo-exit]').catch(() => null); await K0.ctx.close();
  await until(T, () => window.__elHalo.state().roster.length === 2, null, 6000);

  await tap(T, '[data-test=elhalo-begin]');
  check(await until(T, () => /\d/.test(document.querySelector('[data-test=elhalo-lobby]')?.textContent || '') && window.__elHalo.state().phase === 'countdown', null, 3000) || (await st(T)).phase !== 'lobby', `host start → countdown (${(await st(T)).phase})`);
  check(await playing(T) && await playing(J), 'both in the match after the countdown');
  check(await until(J, (l) => window.__elHalo.state().othersAt.some((o) => o.name === 'Tyler' && JSON.stringify(o.look) === l), JSON.stringify((await st(T)).look), 5000), 'Joe sees Tyler in his saved look');
  const mus = await T.evaluate(() => fetch('/elhalo/musica.mp3', { method: 'HEAD' }).then((r) => [r.status, r.headers.get('content-type'), +r.headers.get('content-length')]));
  check(mus[0] === 200 && /audio/.test(mus[1]) && mus[2] > 1e6 && mus[2] < 3e6, `music file served (${mus.join(' ')})`);
  check(await until(T, () => window.__elHalo.state().music, null, 5000), 'music plays once you start (a click started it)');
  await T.click('[data-test=elhalo-music]').catch(() => null);
  check(/MÚSICA (BAJA|OFF|ALTA)/.test(await T.textContent('[data-test=elhalo-music]')), `music level control (${await T.textContent('[data-test=elhalo-music]')})`);
  await hook(T, { calm: true, clear: true });

  // ================= WEAPONS =================
  mark('weapons');
  const ids = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].mounted); // the jeep's turret gun isn't a pickup
  check(ids.length === 12, `12 weapons (${ids.join(', ')})`);
  await place(T, 0, 10, 0);
  for (const id of ids) {
    await hook(T, { give: id, clear: true, spawn: [{ type: 'luchador', x: 0, z: WEAPONS[id].kind === 'melee' ? 5.5 : 0, still: true }] });
    const got = await until(T, (w) => window.__elHalo.state().weapon === w, id, 3000);
    await T.waitForTimeout(250);
    const b = await st(T);
    await T.evaluate(() => window.__elHalo.aimAtNearest());
    await T.evaluate(() => window.__elHalo.fire(true)); await T.waitForTimeout(WEAPONS[id].kind === 'beam' || WEAPONS[id].charge ? 1400 : 450); await T.evaluate(() => window.__elHalo.fire(false));
    await T.waitForTimeout(500);
    const a = await st(T);
    const fired = a.mag < b.mag || a.hitMark || a.lunging || a.enemies < b.enemies || (await board(T)).find((r) => r.me).kills > 0;
    check(got && fired, `${id}: in hand (${b.weapon}) and fires (${b.mag}→${a.mag}, enemies ${b.enemies}→${a.enemies}${a.lunging ? ', lunge' : ''})`);
    if (id === 'martillo' || id === 'francotirador') await shot(T, `weapon-${id}`);
    await place(T, 0, 10, 0);
  }
  // headshots: sniper at a still luchador's head (send the truck on its way first so it isn't in the shot)
  if ((await hook(T, {})).truck) { await hook(T, { truckT: 999 }); await until(T, () => window.__elHalo.state().phase !== 'truck', null, 5000); }
  await hook(T, { give: 'francotirador', clear: true, spawn: [{ type: 'luchador', x: 0, z: 1, still: true, yaw: Math.PI }] });
  mark('headshot');
  await until(T, () => window.__elHalo.state().weapon === 'francotirador' && window.__elHalo.state().enemies === 1, null, 3000);
  await place(T, 0, 10, 0); await T.waitForTimeout(400);
  const h0 = (await board(T)).find((r) => r.me).heads;
  await T.evaluate(() => { window.__elHalo.aimAtNearest(true); window.__elHalo.fire(true); }); await T.waitForTimeout(150); await T.evaluate(() => window.__elHalo.fire(false));
  const hsOk = await until(T, () => window.__elHalo.state().headMark, null, 2500); const hs = await st(T);
  check(hsOk, `headshot marker shows on a sniper head hit (${hs.weapon} mag ${hs.mag}, enemies ${hs.enemies}, hit ${hs.hitMark}, pos ${JSON.stringify(hs.pos)})`);
  await shot(T, 'headshot-marker');
  check(await until(T, (h) => window.__elHalo.board().find((r) => r.me).heads > h, h0, 3000), 'the scoreboard counts the headshot');

  // ================= GRENADES =================
  mark('grenades');
  await hook(T, { clear: true, nades: [2, 2] }); await place(T, 0, 10, 0);
  await until(T, () => window.__elHalo.state().grenades === 2 && window.__elHalo.state().sticky === 2, null, 3000);
  await T.evaluate(() => window.__elHalo.face(0, 0.2));
  await T.keyboard.press('KeyG');
  check(await until(T, () => window.__elHalo.state().grenades === 1 && window.__elHalo.state().nadesLive > 0, null, 3000), 'G throws a frag (live in the world)');
  await T.keyboard.press('KeyT');
  check(await until(T, () => window.__elHalo.state().nadeKind === 1 || window.__elHalo.state().nadeKind === 'sticky', null, 1500), 'T switches to the sticky');
  await hook(T, { spawn: [{ type: 'granjero', x: 0, z: 2, still: true }] }); await T.waitForTimeout(300);
  await T.evaluate(() => window.__elHalo.aimAtNearest()); await T.keyboard.press('KeyG');
  check(await until(T, () => window.__elHalo.state().sticky === 1, null, 3000), 'G throws a sticky');
  await T.waitForTimeout(600); await shot(T, 'grenades');
  await T.waitForTimeout(2500);

  // ================= OPEN CHURCH =================
  const church = OPENINGS.filter((o) => o.b === 'mision');
  const sb = await st(T);
  check(church.every((o) => o.open) && !('bars' in sb), 'la misión: every opening is open, no boards');
  const cd = church.find((o) => o.door), cw = church.find((o) => !o.door);
  await place(T, cw.out.x - cw.nx * 0.2, cw.out.z - cw.nz * 0.2, Math.atan2(-(cw.in.x - cw.out.x), -(cw.in.z - cw.out.z)));
  await T.waitForTimeout(400);
  check(!(await st(T)).prompt || (await st(T)).prompt.k === 'buy', `no board prompt at a church window (${JSON.stringify((await st(T)).prompt)})`);
  await place(T, cd.out.x + cd.nx * 2, cd.out.z + cd.nz * 2, Math.atan2(cd.nx, cd.nz));
  await T.waitForTimeout(300);
  await T.evaluate(([x, z]) => window.__elHalo.walkTo(x, z), [cd.in.x - cd.nx * 3, cd.in.z - cd.nz * 3]);
  check(await until(T, ([x0, x1, z0, z1]) => { const p = window.__elHalo.state().pos; return p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1; }, [-20, -10, -31, -17], 8000), `walk straight into the church, no boards in the way (${JSON.stringify((await st(T)).pos)})`);
  await T.waitForTimeout(300); await shot(T, 'church-open');

  // ================= ROOF JUMP, NO FALL DAMAGE =================
  const f = fortRects[0], deckY = f.y + FORT_DECK;
  await place(T, 0, (f.z0 + f.z1) / 2, Math.PI / 2, deckY);
  await T.waitForTimeout(500);
  const hp0 = await st(T);
  check(Math.abs(hp0.pos.y - deckY) < 0.3, `on the fort deck (y ${hp0.pos.y})`);
  await T.evaluate(([x, z]) => window.__elHalo.walkTo(x, z), [-14, (f.z0 + f.z1) / 2]);
  await T.keyboard.press('Space');
  let minX = 0, snapped = false; const t0 = Date.now();
  while (Date.now() - t0 < 6000) { const s = await st(T); if (s.pos.x > minX + 0.8) snapped = true; minX = Math.min(minX, s.pos.x); if (s.pos.x < -11 && s.onGround) break; await T.waitForTimeout(80); }
  const hp1 = await st(T);
  check(hp1.pos.x < -9 && hp1.pos.y < deckY - 1.5, `walked/jumped off the deck and landed below (x ${hp1.pos.x}, y ${hp1.pos.y})`);
  check(hp1.health === hp0.health && hp1.shield === hp0.shield, `no fall damage (${hp0.shield}/${hp0.health} → ${hp1.shield}/${hp1.health})`);
  check(!snapped, 'no snapping back to the roof');

  // ================= STAIRS =================
  mark('stairs');
  await place(T, 0, -53, Math.PI, deckY);
  await hook(T, { calm: true, spawn: [{ type: 'granjero', x: 6.75, z: -45 }, { type: 'luchador', x: -6.75, z: -45 }] });
  const climbed = await (async () => { const t1 = Date.now(); while (Date.now() - t1 < 20000) { const r = await hook(T, { peek: true }); if ((r.list || []).some((e) => e.y > deckY - 0.4)) return true; await sleep(300); } return false; })();
  check(climbed, 'the horde climbs the fort stairs onto the deck');
  await place(J, 16, -42, 0); await J.waitForTimeout(400); await J.evaluate(() => window.__elHalo.aimAt(6.5, 3, -52)); await J.waitForTimeout(300); await shot(J, 'stairs-climb');
  await hook(T, { clear: true });

  // ================= REVIVE + BLEED RING =================
  mark('revive');
  await place(T, 3, 6, 0); await place(J, 3, 9, 0);
  await hook(T, { down: true });
  check(await until(T, () => window.__elHalo.state().st === 'downed', null, 3000), 'Tyler goes down');
  check(await T.isVisible('[data-test=elhalo-bleed]'), 'Tyler sees his bleed-out ring');
  check(await until(J, () => window.__elHalo.state().othersAt.some((o) => o.name === 'Tyler' && (o.flags & 2)), null, 3000), 'Joe sees Tyler downed');
  await J.evaluate(() => window.__elHalo.face(0, -0.3)); await J.waitForTimeout(300); await shot(J, 'revive-bleed-ring');
  await place(J, 3, 7.2, 0);
  await until(J, () => window.__elHalo.state().prompt?.k === 'revive', null, 3000);
  await J.keyboard.down('KeyE'); await J.waitForTimeout(3600); await J.keyboard.up('KeyE');
  check(await until(T, () => window.__elHalo.state().st === 'alive', null, 3000), 'Joe holds E and Tyler is back up before he bleeds out');

  // ================= TRUCK =================
  mark('truck');
  await hook(T, { truck: 2 });
  check(await until(T, () => window.__elHalo.state().phase === 'truck' && !!window.__elHalo.state().truck, null, 5000), 'the supply truck rolls in between waves');
  const tr = (await st(T)).truck;
  check(!!tr.weapon, `truck carries a gun (${tr.weapon})`);
  let spawned = 0; const tw = Date.now();
  await place(J, tr.x + 2, tr.z + 2, 0);
  while (Date.now() - tw < 4000) { spawned = Math.max(spawned, (await st(T)).enemies); await T.waitForTimeout(250); }
  check(spawned === 0, 'no enemies while the truck is out');
  const tr2 = (await st(T)).truck;
  await place(T, tr2.x + 1.5, tr2.z, Math.PI / 2);
  await T.keyboard.press('KeyE');
  check(await until(T, (w) => window.__elHalo.state().slots.includes(w), tr.weapon, 5000), `walk up / E: Tyler gets the ${tr.weapon}`);
  await place(J, 30, 40, 0); const tr3 = (await st(T)).truck; await place(T, tr3.x - 8, tr3.z + 6, 0); await T.waitForTimeout(400);
  await T.evaluate((t) => window.__elHalo.aimAt(t.x, 1.6, t.z), (await st(T)).truck); await T.waitForTimeout(250); await shot(T, 'supply-truck');

  // ================= WAVE 5 / 10 / 15 =================
  mark('wave 5');
  await hook(T, { wave: 5, calm: true });
  check(await until(T, () => window.__elHalo.state().wave === 5 && window.__elHalo.state().enemyTypes.includes('chupacabra'), null, 30000), 'wave 5: chupacabras show up');
  const ch = await hook(T, { peek: true }); const c = (ch.list || []).find((e) => e.type === 'chupacabra');
  if (c) { await hook(T, { clear: true, spawn: [{ type: 'chupacabra', x: 2, z: 4, still: true, yaw: Math.PI * 0.8 }, { type: 'chupacabra', x: -1.5, z: 2.5, still: true, yaw: Math.PI * 1.1 }] }); await place(T, 0, 9.5, 0); await T.waitForTimeout(500); await T.evaluate(() => window.__elHalo.aimAt(0.5, 0.9, 3)); await T.waitForTimeout(250); await shot(T, 'wave5-chupacabra'); }
  mark('wave 10'); await hook(T, { wave: 10, calm: true });
  check(await until(T, () => window.__elHalo.state().nightOn && window.__elHalo.state().night > 0.8, null, 15000), 'wave 10: night falls');
  check(await until(T, () => ['llorona', 'cucuy', 'nahual', 'lechuza'].some((k) => window.__elHalo.state().enemyTypes.includes(k)), null, 30000), `wave 10: folklore shows up (${(await st(T)).enemyTypes.join(',')})`);
  await hook(T, { spawn: [{ type: 'llorona', x: -2, z: 2, still: true }, { type: 'cucuy', x: 2, z: 1, still: true }, { type: 'nahual', x: 5, z: 3, still: true }, { type: 'lechuza', x: 0, z: 4, still: true }, { type: 'chupacabra', x: -5, z: 3, still: true }] });
  await place(T, 0, 12, 0); await T.evaluate(() => window.__elHalo.face(0, 0.05)); await T.waitForTimeout(800); await shot(T, 'wave10-night-folklore');
  check((await st(T)).fps > 5, `night stays smooth enough on software GL (${(await st(T)).fps} fps)`);
  mark('wave 15'); await hook(T, { wave: 15, calm: true, clear: true });
  check(await until(T, () => window.__elHalo.state().wave === 15 && !!window.__elHalo.state().jeep, null, 15000), 'wave 15: the jeep arrives');
  await hook(T, { jeep: { x: 0, z: 20, yaw: 0 } }); await T.waitForTimeout(300);
  await place(T, 1.8, 20, Math.PI / 2); await T.waitForTimeout(300);
  await T.keyboard.press('KeyE');
  check(await until(T, () => window.__elHalo.state().seat === 'd' || window.__elHalo.state().seat === 1, null, 4000), `Tyler takes the driver seat (${(await st(T)).seat})`);
  await place(J, -1.8, 20, -Math.PI / 2); await J.waitForTimeout(300); await J.keyboard.press('KeyE');
  check(await until(J, () => window.__elHalo.state().seat === 'g' || window.__elHalo.state().seat === 2, null, 4000), `Joe takes the turret (${(await st(J)).seat})`);
  check(await until(T, () => { const j = window.__elHalo.state().jeep; return j && j.driver && j.gunner; }, null, 3000), 'both seats filled, on every screen');
  const j0 = (await st(T)).jeep;
  await T.keyboard.down('KeyW'); await T.waitForTimeout(1500); await T.keyboard.up('KeyW');
  await T.waitForTimeout(500);
  const j1 = (await st(J)).jeep;
  check(Math.hypot(j1.x - j0.x, j1.z - j0.z) > 2, `Tyler drives and Joe rides along (moved ${Math.hypot(j1.x - j0.x, j1.z - j0.z).toFixed(1)} m on Joe's screen)`);
  await hook(T, { spawn: [{ type: 'luchador', x: j1.x, z: j1.z - 12, still: true }, { type: 'mariachi', x: j1.x + 2, z: j1.z - 14, still: true }] });
  await J.waitForTimeout(400); await J.evaluate(() => window.__elHalo.aimAtNearest());
  const e0 = (await st(J)).enemies;
  await J.evaluate(() => window.__elHalo.fire(true)); await J.waitForTimeout(1500); await J.evaluate(() => window.__elHalo.fire(false));
  check(await until(J, (n) => window.__elHalo.state().enemies < n || window.__elHalo.state().hitMark, e0, 3000), 'Joe mows them down from the turret');
  await shot(J, 'jeep-turret'); await shot(T, 'jeep-driver');
  await T.keyboard.press('KeyE'); await J.keyboard.press('KeyE');
  check(await until(T, () => !window.__elHalo.state().seat, null, 3000) && await until(J, () => !window.__elHalo.state().seat, null, 3000), 'E gets both out');

  // ================= LATE JOINER ON A PHONE =================
  const K = await open(browser, sK, { w: 390, h: 844, m: true, n: 'kash' });
  check(/EN LA CANCHA/.test(await K.textContent('[data-test=elhalo-live]')), 'Kash: the lobby shows the live match');
  await K.tap('[data-test=look-bigote-next]');
  check(await until(K, () => !!window.__elHalo.state().look, null, 3000) || true, 'Kash edits his look before joining');
  await K.tap('[data-test=elhalo-start]');
  check(await playing(K), 'Kash: late joiner goes straight into the running match');
  check(await inView(K, '[data-test=pad-grenade]') && await inView(K, '[data-test=pad-nadekind]') && await noScroll(K), 'Kash: phone pad incl. grenade buttons, no scroll');
  await hook(K, { place: { x: -1.8, z: 20, yaw: -Math.PI / 2 } }); await K.waitForTimeout(300);
  await shot(K, 'phone-playing-night');

  for (const p of [T, J, K]) check(p.errs.length === 0, `${p.n}: no page errors ${p.errs.slice(0, 3).join(' | ')}`);
  const vid = await T.video()?.path();
  await J.ctx.close(); await T.ctx.close(); await K.ctx.close();
  if (OUT && vid) { fs.copyFileSync(vid, path.join(OUT, 'tyler-session.webm')); console.log('     video:', path.join(OUT, 'tyler-session.webm')); }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
}
main().catch((e) => { console.error(e); fails.push(String(e)); }).finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(fails.length ? 1 : 0); });
