// A standing bug comes home at full health. Only a knockout sends its owner to the nurse.
// npm run build && PLAYWRIGHT_DIR=... CHROME=... OUT=dir node scripts/e2e-bug-hp.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { FIGHT } from '../server/fights.js';
import { RECOVER_MS } from '../server/barn.js';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium } = req('playwright-core');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bughp-'));
const staticDir = path.join(dir, 'dist');
// Express skips absolute paths inside hidden directories, including managed worktrees under .codex.
fs.symlinkSync(path.resolve(import.meta.dirname, '../dist'), staticDir, 'junction');
let now = 1800000000000;
const { app, service, shutdown } = createApp({
  dataDir: dir, staticDir, devLogin: true, env: {}, now: () => now, eggInt: () => 0,
});
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const baseURL = `http://127.0.0.1:${server.address().port}`;
const pageErrors = [];

async function player(browser, name, viewport, species, level) {
  const phone = viewport.width < 500;
  const ctx = await browser.newContext({ baseURL, viewport, isMobile: phone, hasTouch: phone, reducedMotion: 'reduce' });
  const login = await ctx.request.post('/auth/dev', { data: { name, email: `${name}@hp.test` } });
  assert.ok(login.ok());
  const { id } = await login.json();
  service.barn.adopt(id, { species, level });
  const avatar = await ctx.request.post('/api/me/avatar', { data: { kind: 'gen', seed: name } });
  assert.ok(avatar.ok());
  await ctx.route('**/api/fawn', (r) => r.fulfill({ json: { available: false } }));
  const p = await ctx.newPage();
  p.on('pageerror', (err) => pageErrors.push(err.message));
  return p;
}

async function shot(p, name) {
  if (!process.env.OUT) return;
  fs.mkdirSync(process.env.OUT, { recursive: true });
  await p.screenshot({ path: path.join(process.env.OUT, `${name}.png`) });
}

async function fullHealth(p) {
  const meter = p.getByRole('meter');
  await meter.waitFor();
  assert.equal(await meter.getAttribute('aria-valuenow'), await meter.getAttribute('aria-valuemax'));
  assert.equal(await p.locator('[data-test=barn-fainted], [data-test=barn-hurt]').count(), 0);
}

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [size, viewport] of [['phone', { width: 360, height: 640 }], ['desktop', { width: 1280, height: 800 }]]) {
    const host = await player(browser, `host-${size}`, viewport, 'manticora', 1);
    const guest = await player(browser, `guest-${size}`, viewport, 'phanaeus', 10);
    const posted = await host.request.post('/api/barn/bouts', { data: { stake: 0 } });
    assert.ok(posted.ok());
    await guest.goto('/barn');
    await guest.click('[data-test=ring-toggle]');
    await guest.click('[data-test=bout-join]');
    await guest.waitForSelector('[data-test=bout][data-live="1"]');
    // Let the game's unattended-fight clock play the seeded match to its natural conclusion.
    now += FIGHT.watchMs + 1;
    await guest.waitForSelector('[data-test=bout][data-done="1"][data-result="won"]');
    const after = await (await guest.request.get('/api/barn')).json();
    const { rounds, maxHp } = after.pen.lastBout;
    const [left, knockedOut] = rounds.at(-1).hp;
    assert.ok(left > 0 && left < maxHp[0], 'survivor took damage in the fight');
    assert.equal(knockedOut, 0);
    assert.equal(after.pen.hp, after.pen.maxHp);
    assert.equal(await guest.locator('[data-test=bout]').getByRole('button', { name: /Bug Center/i }).count(), 0);
    await guest.click('[data-test=bout-close]');
    await guest.click('[data-test=room-stalls]');
    await fullHealth(guest);
    await guest.reload();
    await fullHealth(guest);
    await shot(guest, `survivor-ready-${size}`);
    await guest.click('[data-test=ring-toggle]');
    await guest.fill('[data-test=bout-stake]', '0');
    await guest.click('[data-test=bout-post]');
    await guest.click('[data-test=bout-cancel]');

    await host.goto('/barn');
    await host.waitForSelector('[data-test=bout-fainted]');
    await shot(host, `knockout-${size}`);
    await host.click('[data-test=bout-close]');
    await host.waitForSelector('[data-test=barn-fainted]');
    assert.equal(await host.getByRole('meter').getAttribute('aria-valuenow'), '0');
    const before = await (await host.request.get('/api/barn')).json();
    // Check each price through the nurse's real dialogue, then return to the stall.
    const waitForFree = size === 'desktop';
    if (waitForFree) now += RECOVER_MS;
    await host.click('[data-test=barn-center]');
    await host.waitForSelector('[data-test=bc-status]');
    await host.click('[data-test=bc-en]');
    await host.click('[data-test=bc-talk]');
    const yes = host.locator('[data-test=bc-yes]');
    for (let i = 0; i < 12 && !(await yes.isVisible()); i++) {
      await host.click('[data-test=bc-dialogue]', { position: { x: 30, y: 30 } });
    }
    await yes.waitFor();
    assert.equal((await host.locator('[data-test=bc-dialogue]').textContent()).includes('$50'), !waitForFree);
    await shot(host, `nurse-${size}`);
    await yes.click();
    await host.waitForSelector('[data-test=bc-healing]');
    await host.waitForSelector('[data-test=bc-dialogue]');
    const healed = await (await host.request.get('/api/barn')).json();
    assert.equal(healed.pen.fainted, false);
    assert.equal(healed.bankroll, before.bankroll - (waitForFree ? 0 : 50));
    await host.click('[data-test=bc-back]');
    await fullHealth(host);
    console.log(`${size}: ended on ${left}/${maxHp[0]}, returned at full HP, posted another bout. KO treated for $${waitForFree ? 0 : 50}.`);
    await guest.context().close();
    await host.context().close();
  }
  assert.deepEqual(pageErrors, []);
} finally {
  await browser?.close();
  shutdown();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
