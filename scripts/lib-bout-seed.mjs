// Test data for the bout-start e2e: a throwaway in-process server with a few players, each with bugs fit to fight,
// one open bout from somebody else and one challenge waiting for you. Never touches real data.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createApp } from '../server/app.js';
import { xpFor } from '../server/engine/creatures.js';

export async function seedRing({ root, event = 'off' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-bout-start-'));
  const { app, service, shutdown } = createApp({ dataDir: dir, staticDir: path.join(root, 'dist'), env: { ...process.env, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', EVENT_THEME: event, BJ_TICK_MS: '0' }, marketSources: {}, snapshots: false });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const B = `http://127.0.0.1:${server.address().port}`;
  async function login(name) {
    const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email: `${name.toLowerCase()}@bout.test` }) });
    const cookie = r.headers.get('set-cookie').split(';')[0];
    const { id } = await r.json();
    const call = async (m, u, b) => { const x = await fetch(B + '/api' + u, { method: m, headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); const j = await x.json().catch(() => ({})); if (!x.ok) throw new Error(`${m} ${u}: ${j.error || x.status}`); return j; };
    await call('POST', '/me/avatar', { kind: 'gen', seed: name });
    return { name, id, sid: cookie.split('=')[1], call };
  }
  const barn = service.barn;
  const give = (p, species, level, i = 0) => barn.adopt(p.id, { wildId: `w-${p.name}-${i}`, battleId: `b-${p.name}-${i}`, species, level });
  const fund = (p, amount) => { service.store.players[p.id].bankroll = amount; service.store.savePlayers(); };
  const me = await login('Tyler');
  const ada = await login('Ada'), bess = await login('Bess'), cy = await login('Cy'), dot = await login('Dot');
  give(me, 'manticora', 7, 0); give(me, 'phanaeus', 5, 1);
  give(ada, 'lamprima', 8, 0); give(ada, 'pyrops', 4, 1);
  give(bess, 'halobates', 6, 0);
  give(cy, 'phrictus', 7, 0); give(cy, 'nemoptera', 3, 1);
  give(dot, 'sphaerocoris', 5, 0);
  for (const p of [me, ada, bess, cy, dot]) fund(p, 1000);
  for (const p of [me, ada, bess, cy, dot]) await p.call('GET', '/barn');
  // Bess posts a bout for anyone; Cy calls out your best bug.
  await bess.call('POST', '/barn/bouts', { stake: 50 });
  const mine = (await me.call('GET', '/barn')).stable.bugs;
  await cy.call('POST', '/barn/challenges', { to: me.id, their: mine[0].id, stake: 20 });
  return { B, service, me, ada, bess, cy, dot, login, give, fund,
    async close() { shutdown(); await new Promise((r) => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); } };
}
