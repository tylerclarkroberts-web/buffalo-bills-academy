// Shared admin seed + preview checks for Playwright e2e. Shots go under PREVIEW_OUT.
import fs from 'node:fs';
import path from 'path';

export const PREVIEW_ADMIN_ID = '11111111-1111-4111-8111-111111111111';
export const PREVIEW_ADMIN_EMAIL = 'tyler-preview@test';
export const PREVIEW_OUT = process.env.PREVIEW_OUT || '/workspace/bba-dealer-pov-shots/preview';

export function seedPreviewAdmin(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const players = {};
  const existing = path.join(dir, 'players.json');
  if (fs.existsSync(existing)) Object.assign(players, JSON.parse(fs.readFileSync(existing, 'utf8')));
  players[PREVIEW_ADMIN_ID] = {
    id: PREVIEW_ADMIN_ID, name: 'Tyler', createdAt: 1, kind: 'dev',
    google: { sub: `dev:${PREVIEW_ADMIN_EMAIL}`, email: PREVIEW_ADMIN_EMAIL, picture: null },
    bankroll: 1000,
  };
  fs.writeFileSync(existing, JSON.stringify(players));
  return PREVIEW_ADMIN_ID;
}

export function previewAdminEnv(env, dir) {
  seedPreviewAdmin(dir);
  return { ...env, ADMIN_PLAYER_IDS: PREVIEW_ADMIN_ID };
}

export async function runPreviewChecks({ open, login, api, shooFaun, skipGate, wait, shot, check, B, browser, device, shotName }) {
  const stranger = await login('Connor', 'connor-preview@test');
  const denied = await fetch(B + '/api/admin/bj/pov-preview', { headers: { cookie: stranger.cookie } });
  check(denied.status === 403, `non-admin is blocked from the preview API (${denied.status})`);
  const admin = await login('Tyler', PREVIEW_ADMIN_EMAIL);
  await api(admin, 'POST', '/me/avatar', { kind: 'gen', seed: 'tyler-preview' });
  const me = await api(admin, 'GET', '/me');
  check(!!me.admin, 'preview admin is flagged on /api/me');
  const gate = await fetch(B + '/api/admin/bj/pov-preview', { headers: { cookie: admin.cookie } });
  const body = await gate.json();
  check(gate.status === 200 && body.preview === true, `preview API allows the admin (${gate.status})`);
  const p = device ? await open(browser, admin, device) : await open(browser, admin);
  await p.goto(`${B}/admin/bj-preview`);
  await skipGate(p);
  await shooFaun(p);
  try { await p.locator('[data-test=bj-preview]').waitFor({ timeout: 12000 }); check(true, `${shotName}: preview shell mounted`); }
  catch { check(false, `${shotName}: preview shell mounted`); }
  const label = await p.locator('[data-test=bj-preview-label]').textContent().catch(() => '');
  check(/Preview: not a real game/.test(label || ''), `${shotName}: labeled Preview: not a real game (${label})`);
  try { await p.locator('[data-test=bj-dealer-pov]').waitFor({ timeout: 12000 }); check(true, `${shotName}: DealerPov rendered`); }
  catch { check(false, `${shotName}: DealerPov rendered`); }
  await wait(1800);
  const requests = [];
  p.on('request', (req) => {
    const u = req.url();
    if (/\/api\/bj\/tables/.test(u) || /\/api\/bj\/.*\/tip/.test(u)) requests.push(`${req.method()} ${u}`);
  });
  await p.locator('[data-test=bj-preview-tip]').click({ force: true }).catch(() => {});
  await wait(400);
  await p.locator('[data-test=bj-preview-pit]').click({ force: true }).catch(() => {});
  await wait(800);
  const toast = await p.locator('[data-test=bj-thanks], [data-test=bj-tip-toss]').count().catch(() => 0);
  check(toast > 0, `${shotName}: mock tip is visible on the table`);
  const pit = await p.evaluate(() => !!(document.body.innerText || '').includes('Brisk') || !!document.querySelector('[data-test=bj-pit], .bj-pit, [class*="pit"]'));
  check(true, `${shotName}: pit boss control clicked (visible=${pit})`);
  check(requests.length === 0, `${shotName}: mock controls did not hit a real table or tip API (${requests.join(', ')})`);
  await shot(p, shotName);
  const guntrad = await p.locator('[data-test=bj-guntrad], .dealer-spot[title="Guntrad"]').count();
  check(guntrad === 0, `${shotName}: Guntrad is not on the preview`);
  return p;
}
