// Admin telemetry: who visits from where, on what device, for how long, and every money movement from now on.
// Everything lives in new files next to players.json, so older data files are untouched:
//   access.json   per player: IPs, devices, visits (time by area), login count
//   ledger.jsonl  one line per bankroll change (append-only; players' own txns keep only their last 200)
//   events.jsonl  logins, mine shifts, blackjack settlements and sneak bets
// Entries backfilled from older data carry `r: 1` (reconstructed); everything else is recorded live.
import fs from 'node:fs';
import path from 'node:path';

export const RETENTION_DAYS = 180;
export const VISIT_GAP_MS = 15 * 60e3; // quiet this long and the next request starts a new visit
export const CREDIT_CAP_MS = 2 * 60e3; // the most time one request can add (stops an idle open tab counting forever)
const MAX_VISITS = 400, MAX_IPS = 100, MAX_DEVICES = 30;

/** Which part of the site an API path belongs to. */
export function areaOf(p) {
  const m = String(p || '').match(/^\/api\/([a-z-]+)/);
  if (!m) return null;
  const k = m[1];
  if (['tables', 'my-tables', 'public-tables'].includes(k)) return 'poker';
  if (k === 'bj') return 'blackjack';
  if (k === 'mines') return 'mines';
  if (k === 'foff') return 'golf';
  if (k === 'slots') return 'slots';
  if (k === 'shop') return 'store';
  if (k === 'barn') return 'barn';
  if (k === 'fawn') return 'faun';
  if (k === 'conquest') return 'risk';
  if (k === 'market') return 'invest';
  if (k === 'room' || k === 'rooms') return 'room';
  if (['me', 'profile', 'players', 'leaderboard'].includes(k)) return 'lobby';
  return null; // health, avatars, admin, auth config: not play
}

/** A short device label from a user agent: "iPhone · Safari", "Windows · Chrome". */
export function deviceOf(ua = '') {
  const s = String(ua);
  const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? (/Mobile/.test(s) ? 'Android phone' : 'Android tablet')
    : /Macintosh|Mac OS X/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : /CrOS/.test(s) ? 'Chromebook' : /Linux/.test(s) ? 'Linux' : s ? 'Other' : 'Unknown';
  const br = /Slack/.test(s) ? 'Slack' : /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox|FxiOS/.test(s) ? 'Firefox' : /CriOS|Chrome\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari' : /node|curl|bot|spider/i.test(s) ? 'Script' : '';
  return br ? `${os} · ${br}` : os;
}
export const mobileDevice = (label) => /iPhone|Android phone/.test(label || '');

export function clientIp(req) {
  const raw = req.get?.('fly-client-ip') || req.ip || req.socket?.remoteAddress || '';
  return String(raw).replace(/^::ffff:/, '').slice(0, 64) || 'unknown';
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn last line after a crash */ }
  }
  return out;
}

export class Telemetry {
  constructor({ store, now = () => Date.now(), retentionDays = RETENTION_DAYS }) {
    this.store = store; this.now = now; this.retentionMs = retentionDays * 86400e3;
    this.ledgerFile = path.join(store.dir, 'ledger.jsonl');
    this.eventsFile = path.join(store.dir, 'events.jsonl');
    this.doc = store.loadDoc('access', { since: null, players: {}, bjSeen: {}, ledgerSince: null });
    this.doc.players ||= {}; this.doc.bjSeen ||= {};
    this.dirty = false;
    this.timer = setInterval(() => this.flush(), 30e3); this.timer.unref?.();
    this.trim();
  }
  save() { this.store.saveDoc('access', this.doc); this.dirty = false; }
  flush() { if (this.dirty) { try { this.save(); } catch (e) { console.error('[admin] access save', e.message); } } }
  shutdown() { clearInterval(this.timer); this.flush(); }

  /** One-time: copy players' surviving transaction history into the ledger, marked reconstructed. */
  backfill(players) {
    if (this.doc.ledgerSince) return;
    const t0 = this.now();
    const rows = [];
    for (const p of Object.values(players)) for (const x of p.txns || []) if (x && Number.isFinite(x.t) && x.t <= t0) rows.push({ t: x.t, p: p.id, type: x.type, amt: x.amount, bal: x.balance, note: x.note, r: 1 });
    rows.sort((a, b) => a.t - b.t);
    if (rows.length) fs.appendFileSync(this.ledgerFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    this.doc.ledgerSince = t0; this.doc.since ||= t0;
    this.save();
  }
  /** Accounts.log hook: every bankroll change, as it happens. */
  ledger(p, e) {
    if (!p?.id || !e) return;
    try { fs.appendFileSync(this.ledgerFile, JSON.stringify({ t: e.t, p: p.id, type: e.type, amt: e.amount, bal: e.balance, note: e.note }) + '\n'); } catch (err) { console.error('[admin] ledger', err.message); }
  }
  event(k, playerId, data = {}, { t, r } = {}) {
    try { fs.appendFileSync(this.eventsFile, JSON.stringify({ t: t ?? this.now(), k, p: playerId || null, ...data, ...(r ? { r: 1 } : {}) }) + '\n'); } catch (err) { console.error('[admin] event', err.message); }
  }
  readLedger() { return readJsonl(this.ledgerFile); }
  readEvents() { return readJsonl(this.eventsFile); }

  /** Drop JSONL lines and visits older than the retention window. Runs at startup. */
  trim() {
    const cut = this.now() - this.retentionMs;
    for (const f of [this.ledgerFile, this.eventsFile]) {
      if (!fs.existsSync(f)) continue;
      const rows = readJsonl(f);
      if (!rows.some((x) => x.t < cut)) continue;
      const keep = rows.filter((x) => x.t >= cut);
      const tmp = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, keep.map((x) => JSON.stringify(x)).join('\n') + (keep.length ? '\n' : ''));
      fs.renameSync(tmp, f);
    }
    for (const a of Object.values(this.doc.players)) a.visits = (a.visits || []).filter((v) => v.e >= cut);
  }

  rec(playerId) {
    const a = (this.doc.players[playerId] ||= { first: this.now(), last: 0, hits: 0, logins: 0, ips: {}, devices: {}, visits: [], areas: {} });
    a.ips ||= {}; a.devices ||= {}; a.visits ||= []; a.areas ||= {};
    return a;
  }
  /** Called on every signed-in API request. Cheap: memory only, saved every 30 s. */
  hit(req) {
    const p = req.player; if (!p?.id) return;
    const area = areaOf(req.originalUrl || req.path); if (!area) return;
    const now = this.now(), ip = clientIp(req), ua = String(req.get?.('user-agent') || '').slice(0, 300), dev = deviceOf(ua);
    const a = this.rec(p.id);
    this.doc.since ||= now;
    const gap = a.last ? now - a.last : Infinity;
    let v = a.visits[a.visits.length - 1];
    if (!v || gap > VISIT_GAP_MS) {
      v = { s: now, e: now, ip, dev, n: 0, areas: {} };
      a.visits.push(v); if (a.visits.length > MAX_VISITS) a.visits.splice(0, a.visits.length - MAX_VISITS);
    } else {
      const credit = Math.min(gap, CREDIT_CAP_MS);
      v.areas[area] = (v.areas[area] || 0) + credit;
      a.areas[area] = (a.areas[area] || 0) + credit;
      v.e = now;
    }
    v.n += 1; a.hits += 1; a.last = now;
    const i = (a.ips[ip] ||= { first: now, last: now, n: 0 });
    i.last = now; i.n += 1; i.dev = dev;
    const d = (a.devices[dev] ||= { first: now, last: now, n: 0, ua });
    d.last = now; d.n += 1; d.ua = ua;
    prune(a.ips, MAX_IPS); prune(a.devices, MAX_DEVICES);
    this.dirty = true;
  }
  login(req, player, how) {
    if (!player?.id) return;
    const ip = clientIp(req), ua = String(req.get?.('user-agent') || '').slice(0, 300);
    const a = this.rec(player.id); a.logins += 1; a.lastLogin = this.now();
    const i = (a.ips[ip] ||= { first: this.now(), last: this.now(), n: 0 }); i.last = this.now(); i.dev = deviceOf(ua);
    this.dirty = true;
    this.event('login', player.id, { how: how || player.kind || 'unknown', ip, dev: deviceOf(ua) });
  }
  logout(req, playerId) {
    if (!playerId) return;
    const a = this.rec(playerId); const v = a.visits[a.visits.length - 1];
    if (v) v.out = true;
    this.dirty = true;
    this.event('logout', playerId, { ip: clientIp(req) });
  }

  /** Blackjack: turn new table-log lines into money events, once each. First sight of a table is a backfill. */
  bjScan(t) {
    if (!t?.code || !Array.isArray(t.log)) return;
    const seen = this.doc.bjSeen[t.code];
    const first = seen === undefined;
    const from = first ? 0 : seen;
    const fresh = t.log.filter((e) => e && e.seq > from);
    if (!fresh.length) { if (first) { this.doc.bjSeen[t.code] = t.seq || 0; this.dirty = true; } return; }
    const houseId = t.house?.mode === 'player' ? t.house.id : null;
    const who = (seat) => t.seats?.[seat] && !t.seats[seat].bot ? t.seats[seat].id : null;
    const rows = [];
    for (const e of fresh) {
      const ev = e.ev || {};
      const base = { t: e.t, code: t.code, round: e.round, house: houseId };
      if (ev.k === 'bet' && (ev.side?.match || ev.side?.pairs)) rows.push(['bj-side', who(ev.seat), { ...base, seat: ev.seat, match: ev.side.match || 0, pairs: ev.side.pairs || 0 }]);
      else if (ev.k === 'royal') rows.push(['bj-royal', who(ev.seat), { ...base, seat: ev.seat, bet: ev.bet, tier: ev.tier, amt: ev.amt, ...(ev.sneak ? { sneak: true } : {}) }]);
      else if (ev.k === 'pay' && ev.ins) rows.push(['bj-ins-pay', who(ev.seat), { ...base, seat: ev.seat, amt: ev.amt }]);
      else if (ev.k === 'ins' && ev.amt) rows.push(['bj-ins', who(ev.seat), { ...base, seat: ev.seat, amt: ev.amt }]);
      else if (ev.k === 'pay') rows.push(['bj-hand', who(ev.seat), { ...base, seat: ev.seat, out: ev.out, amt: ev.amt }]);
    }
    for (const [k, pid, data] of rows) if (pid || k === 'bj-hand') this.event(k, pid, data, { t: data.t, r: first });
    this.doc.bjSeen[t.code] = Math.max(from, ...fresh.map((e) => e.seq));
    this.dirty = true;
  }

  /** Acid Mines clock-in and settlement (see server/mines.js hooks). */
  shiftStart(playerId, s, fare = 0) {
    this.event('shift-start', playerId, { shift: s.id, shaft: s.shaft || '7', cells: s.cells, cap: s.capacity ? s.capacity / 1000 : null, fare, scare: !!(s.scare || s.scareAt), faun: !!s.faun, twin: !!s.twin, egg: !!s.egg }, { t: s.startedAt });
  }
  shiftEnd(playerId, s, receipt) {
    const r = receipt?.result;
    this.event('shift-end', playerId, { shift: s.id, shaft: s.shaft || '7', ms: receipt?.ms, outcome: r?.outcome || null, amt: r?.amount || 0, collected: r?.collected ?? 0, cap: r?.capacity ?? (s.capacity ? s.capacity / 1000 : null),
      reason: receipt?.reason || null, scare: !!(s.scare || s.scareAt), faun: !!s.faun, twin: r?.twin?.took || 0, spill: s.spill ? s.spill.lost / 1000 : 0, pvp: r?.pvp?.kind || null }, { t: receipt?.at });
  }
}
/** Feed blackjack into the telemetry: backfill every table once, scan each change, and note each sneak bet
 * (a losing sneak bet leaves no log line, so it is recorded as it is slid onto the felt). */
export function watchBlackjack(bj, telemetry) {
  for (const t of Object.values(bj.doc.tables || {})) { try { telemetry.bjScan(t); } catch { /* skip a bad table */ } }
  const prev = bj.onChange;
  bj.onChange = (t, actorId) => { try { telemetry.bjScan(t); } catch { /* admin stats only */ } prev?.(t, actorId); };
  const sneak = bj.sneak.bind(bj);
  bj.sneak = (p, code, body) => {
    const t0 = bj.table(code); const seat = t0.seats.findIndex((s) => s && s.id === p.id && !s.left);
    const lane = t0.lanes?.[seat]; const round = (lane ? lane.roundNo : t0.roundNo) || 0; // read before: a sneak can end the round
    const r = sneak(p, code, body);
    try {
      const k = { match: Number(body?.royal?.match) || 0, pairs: Number(body?.royal?.pairs) || 0 };
      telemetry.event('bj-sneak', p.id, { code: t0.code, round, seat, house: t0.house?.mode === 'player' ? t0.house.id : null, ...k });
    } catch { /* admin stats only */ }
    return r;
  };
}
function prune(map, max) {
  const keys = Object.keys(map); if (keys.length <= max) return;
  keys.sort((a, b) => map[a].last - map[b].last);
  for (const k of keys.slice(0, keys.length - max)) delete map[k];
}
