// The admin dashboard's API. Only the owner's signed-in session gets past `requireAdmin`; everyone else gets 403.
// Who counts as the owner: player ids in ADMIN_PLAYER_IDS, Google emails in ADMIN_EMAILS (both comma-separated),
// or ids listed in <data>/admins.json. Nothing is an admin by default.
import fs from 'node:fs';
import path from 'node:path';
import { buildReport, playerDetail, SOURCES, denverDay } from './report.js';

export function adminConfig(env = process.env, dataDir = null) {
  const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const ids = new Set(list(env.ADMIN_PLAYER_IDS));
  const emails = new Set(list(env.ADMIN_EMAILS).map((e) => e.toLowerCase()));
  if (dataDir) {
    try {
      const f = path.join(dataDir, 'admins.json');
      if (fs.existsSync(f)) for (const x of JSON.parse(fs.readFileSync(f, 'utf8')) || []) ids.add(String(x));
    } catch (e) { console.error('[admin] admins.json', e.message); }
  }
  return { ids, emails };
}
/** A real signed-in session (not a legacy browser token) whose player is on the admin list. */
export function isAdmin(req, cfg) {
  const p = req.player;
  if (!p || !req.sessionId || req.legacy) return false;
  if (!(p.google || p.login)) return false;
  if (cfg.ids.has(p.id)) return true;
  // Google-verified email only: never a typed username email, and never a dev-login account (its email is typed too)
  const email = p.google?.email && !String(p.google.sub || '').startsWith('dev:') ? String(p.google.email).toLowerCase() : null;
  return !!(email && cfg.emails.has(email));
}

export function mountAdmin({ api, wrap, telemetry, geo, cfg, getCtx, cacheMs = 5000 }) {
  const requireAdmin = (req, res, next) => {
    if (!isAdmin(req, cfg)) return res.status(403).json({ error: 'Not found' });
    res.set('Cache-Control', 'no-store');
    next();
  };
  let cache = null;
  const report = async () => {
    const now = Date.now();
    if (cache && now - cache.at < cacheMs) return cache;
    telemetry.flush();
    const ctx = getCtx();
    const ips = new Set();
    for (const a of Object.values(ctx.access.players || {})) for (const ip of Object.keys(a.ips || {})) ips.add(ip);
    await geo.lookup([...ips]);
    ctx.geo = (ip) => geo.cached(ip);
    cache = { at: now, ctx, rep: buildReport(ctx) };
    return cache;
  };
  const strip = (rep) => { const { _detail, ...rest } = rep; void _detail; return rest; };

  api.get('/admin/me', requireAdmin, wrap(() => ({ admin: true })));
  api.get('/admin/report', requireAdmin, wrap(async () => strip((await report()).rep)));
  for (const tab of ['overview', 'players', 'money', 'mines', 'usage', 'anomalies']) api.get(`/admin/${tab}`, requireAdmin, wrap(async () => ({ [tab]: (await report()).rep[tab] })));
  api.get('/admin/players/:id', requireAdmin, wrap(async (req, res) => {
    const { ctx, rep } = await report();
    const d = playerDetail(rep, ctx, String(req.params.id));
    if (!d) { res.status(404); return { error: 'No such player' }; }
    return d;
  }));
  const ledgerQuery = async (q) => {
    const { rep, ctx } = await report();
    const names = Object.fromEntries(Object.values(ctx.players).map((p) => [p.id, p.name]));
    const from = q.from ? Date.parse(q.from) : null, to = q.to ? Date.parse(q.to) + 86400e3 : null;
    const text = String(q.q || '').toLowerCase();
    let rows = rep._detail.ledger.filter((x) => (!q.player || x.p === q.player) && (!q.source || x.source === q.source) && (!q.type || x.type === q.type)
      && (q.rec === 'recorded' ? !x.r : q.rec === 'reconstructed' ? !!x.r : true)
      && (!from || x.t >= from) && (!to || x.t < to) && (q.dir === 'in' ? x.amt > 0 : q.dir === 'out' ? x.amt < 0 : true)
      && (!text || `${x.note} ${names[x.p] || ''} ${x.sub}`.toLowerCase().includes(text)));
    rows = rows.slice().reverse();
    return { rows, names };
  };
  api.get('/admin/ledger', requireAdmin, wrap(async (req) => {
    const { rows, names } = await ledgerQuery(req.query);
    const offset = Math.max(0, Number(req.query.offset) || 0), limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const sumIn = rows.reduce((a, x) => a + (x.amt > 0 ? x.amt : 0), 0), sumOut = rows.reduce((a, x) => a + (x.amt < 0 ? x.amt : 0), 0);
    return { total: rows.length, offset, limit, sumIn: Math.round(sumIn * 100) / 100, sumOut: Math.round(sumOut * 100) / 100, sources: SOURCES,
      rows: rows.slice(offset, offset + limit).map((x) => ({ t: x.t, day: denverDay(x.t), p: x.p, name: names[x.p] || '?', type: x.type, source: x.source, sub: x.sub, amt: x.amt, bal: x.bal, note: x.note, r: !!x.r })) };
  }));
  api.get('/admin/ledger.csv', requireAdmin, async (req, res) => {
    try {
      const { rows, names } = await ledgerQuery(req.query);
      const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const lines = ['time_utc,denver_day,player,type,source,detail,amount,balance,note,recorded'];
      for (const x of rows) lines.push([new Date(x.t).toISOString(), denverDay(x.t), esc(names[x.p] || x.p), x.type, x.source, esc(x.sub), x.amt, x.bal ?? '', esc(x.note), x.r ? 'reconstructed' : 'recorded'].join(','));
      res.type('text/csv').set('Content-Disposition', 'attachment; filename="bba-ledger.csv"').send(lines.join('\n'));
    } catch (e) { console.error(e); res.status(500).json({ error: 'Something went wrong' }); }
  });
  return { requireAdmin, invalidate: () => { cache = null; } };
}
