// Builds every number on the admin dashboard from the game's own files plus the admin telemetry.
// Pure: give it the data, get plain JSON back (tests feed it fixtures directly).
import { deviceOf, mobileDevice } from './telemetry.js';
import { geoLabel } from './geo.js';

export const TZ = 'America/Denver';
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const DAY = 86400e3;
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
export const denverDay = (t) => dayFmt.format(new Date(t));
export function denverHour(t) {
  const parts = Object.fromEntries(hourFmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour) % 24, dow: parts.weekday };
}

export const SOURCES = {
  start: 'Starting bankroll', poker: 'Poker', blackjack: 'Blackjack', mines: 'Acid Mines', pvp: 'Mine PvP', fawn: 'Faun gifts', golf: 'Foff golf',
  slots: 'Slots', store: 'General Store', invest: 'Investing', barn: 'Barn bouts', risk: 'Risk bets', admin: 'Admin / dev grants', other: 'Other',
};
/** Where a bankroll change came from: { source, sub } from its type and note. */
export function classify(type, note = '') {
  const n = String(note || '');
  switch (type) {
    case 'start': return { source: 'start', sub: 'Starting bankroll' };
    case 'buyin': return { source: 'poker', sub: 'Buy-in' };
    case 'cashout': return { source: 'poker', sub: 'Cash-out' };
    case 'guntrad': return { source: 'poker', sub: /^Beat/.test(n) ? 'Guntrad fight won' : 'Guntrad fight lost' };
    case 'blackjack': return { source: 'blackjack', sub: /house bank back/.test(n) ? 'House bank returned' : /house bank/.test(n) ? 'House bank staked' : /buy-in/.test(n) ? 'Buy-in' : 'Cash-out' };
    case 'mine': return { source: 'mines', sub: /elevator fare/.test(n) ? 'Elevator fare' : /nephew/.test(n) ? "Nephew's shift" : /foreman/.test(n) ? "Foreman's bonus" : 'Shift payout' };
    case 'pvp': return { source: 'pvp', sub: /lost a bug battle/.test(n) ? 'Lost bug battle' : /won a bug battle/.test(n) ? 'Won bug battle' : /ambushed by/.test(n) ? 'Was ambushed' : 'Ambushed someone' };
    case 'fawn': return { source: 'fawn', sub: "Faun's wooden box" };
    case 'foff': return { source: 'golf', sub: /Medal/.test(n) ? 'Medal of Freedom' : 'Bachelor party quest' };
    case 'slots': return { source: 'slots', sub: 'Spin result' };
    case 'shop': return { source: 'store', sub: 'Purchase' };
    case 'invest-buy': return { source: 'invest', sub: 'Bought' };
    case 'invest-sell': return { source: 'invest', sub: 'Sold' };
    case 'barn-stake': return { source: 'barn', sub: 'Stake held' };
    case 'barn-win': return { source: 'barn', sub: 'Won pot' };
    case 'barn-refund': return { source: 'barn', sub: 'Stake returned' };
    case 'dev': return { source: 'admin', sub: 'Dev/test cash' };
    default: return /^risk/.test(type || '') ? { source: 'risk', sub: type.replace(/^risk_?/, '') || 'Risk' } : { source: 'other', sub: type || '?' };
  }
}

const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
function lastNDays(now, n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(denverDay(now - i * DAY)); return [...new Set(out)]; }

/**
 * ctx: { now, players, ledger, events, access, docs: { mines, pvp, fawn, foff, slots, blackjack, sessions }, pokerTables, worth(p), geo(ip) }
 */
export function buildReport(ctx) {
  const now = ctx.now;
  const players = Object.values(ctx.players || {});
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const nameOf = (id) => byId[id]?.name || (id ? `#${String(id).slice(0, 6)}` : '—');
  const access = ctx.access || { players: {} };
  const ap = (id) => access.players?.[id] || null;
  const events = ctx.events || [];
  const docs = ctx.docs || {};
  const geo = ctx.geo || (() => null);

  // ---------- ledger ----------
  const ledger = (ctx.ledger || []).filter((x) => x && Number.isFinite(x.t)).map((x) => ({ ...x, ...classify(x.type, x.note) })).sort((a, b) => a.t - b.t);
  const perPlayerSource = {}; // id -> source -> { in, out, net, n }
  const sourceTotals = Object.fromEntries(Object.keys(SOURCES).map((k) => [k, { in: 0, out: 0, net: 0, n: 0, subs: {} }]));
  for (const x of ledger) {
    const amt = Number(x.amt) || 0;
    const ps = ((perPlayerSource[x.p] ||= {})[x.source] ||= { in: 0, out: 0, net: 0, n: 0 });
    const st = sourceTotals[x.source] || sourceTotals.other;
    for (const o of [ps, st]) { if (amt >= 0) o.in += amt; else o.out += amt; o.net += amt; o.n += 1; }
    const sb = (st.subs[x.sub] ||= { net: 0, n: 0 }); sb.net += amt; sb.n += 1;
  }
  const round = (o) => { for (const k of ['in', 'out', 'net']) o[k] = r2(o[k]); for (const s of Object.values(o.subs || {})) s.net = r2(s.net); return o; };
  Object.values(sourceTotals).forEach(round);
  Object.values(perPlayerSource).forEach((m) => Object.values(m).forEach(round));
  // a player's txns keep only their last 200; if the oldest surviving one isn't the starting bankroll, history is partial
  const partialHistory = (p) => (p.txns?.length || 0) >= 200 && p.txns[0]?.type !== 'start';

  // ---------- blackjack detail (from table logs and sneak-bet records) ----------
  const bj = {}; // id -> { hands, handsN, royalMatch, royalPairs, sideStaked, sideWon, sneakN, sneakStaked, sneakWon, ins, house, sneakAgainst }
  const bjp = (id) => (bj[id] ||= { hands: 0, handsN: 0, wins: 0, losses: 0, pushes: 0, bjs: 0, match: 0, pairs: 0, sideN: 0, sideStaked: 0, sideWon: 0, sneakN: 0, sneakStaked: 0, sneakWon: 0, sneakWins: 0, ins: 0, house: 0, sneakAgainst: 0, sneakAgainstN: 0 });
  const key = (e) => `${e.code}|${e.round}|${e.seat}`;
  const royalWins = new Map(); // key|bet -> amt (normal) ; sneak separately
  const sneakWins = new Map();
  const insPaid = new Map();
  for (const e of events) {
    if (e.k === 'bj-royal') (e.sneak ? sneakWins : royalWins).set(`${key(e)}|${e.bet}`, (Number(e.amt) || 0));
    if (e.k === 'bj-ins-pay') insPaid.set(key(e), Number(e.amt) || 0);
  }
  const houseByTable = {};
  for (const e of events) {
    if (!e.k?.startsWith('bj-')) continue;
    if (e.house) (houseByTable[e.code] ||= e.house);
    if (e.k === 'bj-hand') {
      if (e.p) { const b = bjp(e.p); b.hands += Number(e.amt) || 0; b.handsN += 1; if (e.out === 'blackjack') b.bjs += 1; if ((e.amt || 0) > 0) b.wins += 1; else if ((e.amt || 0) < 0) b.losses += 1; else b.pushes += 1; }
      if (e.house) bjp(e.house).house -= Number(e.amt) || 0;
    } else if (e.k === 'bj-side' && e.p) {
      const b = bjp(e.p);
      for (const k of ['match', 'pairs']) {
        const stake = Number(e[k]) || 0; if (!stake) continue;
        const win = royalWins.get(`${key(e)}|${k}`);
        const net = win ? win : -stake;
        b[k] += net; b.sideN += 1; b.sideStaked += stake; if (win) b.sideWon += win;
        if (e.house) bjp(e.house).house -= net;
      }
    } else if (e.k === 'bj-sneak' && e.p) {
      const b = bjp(e.p);
      for (const k of ['match', 'pairs']) {
        const stake = Number(e[k]) || 0; if (!stake) continue;
        const win = sneakWins.get(`${key(e)}|${k}`);
        const net = win ? win : -stake;
        b.sneakN += 1; b.sneakStaked += stake; b.sneakWon += win || 0; if (win) b.sneakWins += 1;
        b[k] += net;
        if (e.house) { const h = bjp(e.house); h.house -= net; h.sneakAgainst -= net; h.sneakAgainstN += 1; }
      }
    } else if (e.k === 'bj-ins' && e.p) {
      const paid = insPaid.get(key(e));
      const net = paid ? paid : -(Number(e.amt) || 0);
      bjp(e.p).ins += net; if (e.house) bjp(e.house).house -= net;
    }
  }
  // sneak wins seen in logs from before sneak bets were recorded (stake unknown)
  const sneakKeys = new Set(events.filter((e) => e.k === 'bj-sneak').flatMap((e) => ['match', 'pairs'].filter((k) => e[k]).map((k) => `${key(e)}|${k}`)));
  for (const e of events) if (e.k === 'bj-royal' && e.sneak && e.p && !sneakKeys.has(`${key(e)}|${e.bet}`)) { const b = bjp(e.p); b.sneakN += 1; b.sneakWins += 1; b.sneakWon += Number(e.amt) || 0; b[e.bet] += Number(e.amt) || 0; b.sneakUnknownStake = true; }
  for (const b of Object.values(bj)) for (const k of Object.keys(b)) if (typeof b[k] === 'number') b[k] = r2(b[k]);
  const bjEarnings = docs.blackjack?.earnings || {};
  const bjSeat = {}; // lifetime seat stats summed over every table still on disk
  for (const t of Object.values(docs.blackjack?.tables || {})) for (const s of t.seats || []) {
    if (!s || s.bot || !s.id) continue;
    const o = (bjSeat[s.id] ||= { tables: new Set(), rounds: 0, wagered: 0, won: 0, lost: 0, bj: 0 });
    o.tables.add(t.code); o.rounds += s.stats?.rounds || 0; o.wagered += s.stats?.wagered || 0; o.won += s.stats?.won || 0; o.lost += s.stats?.lost || 0; o.bj += s.stats?.bj || 0;
  }

  // ---------- mines ----------
  const shiftEnds = events.filter((e) => e.k === 'shift-end');
  const shiftStarts = events.filter((e) => e.k === 'shift-start');
  const raids = Object.values(docs.pvp?.raids || {}).sort((a, b) => b.at - a.at);
  const minesFor = (p) => {
    const m = p.mining || {};
    const hist = (m.history || []).map((h) => ({ t: h.t, outcome: h.outcome, amt: h.amount, ms: h.ms || null, r: 1 }));
    const rec = shiftEnds.filter((e) => e.p === p.id);
    const starts = shiftStarts.filter((e) => e.p === p.id);
    const shifts = [...hist.filter((h) => !rec.some((e) => Math.abs(e.t - h.t) < 2000 && e.amt === h.amt)),
      ...rec.map((e) => ({ t: e.t, outcome: e.outcome || (e.reason === 'quit' ? 'quit' : e.pvp ? (e.pvp === 'battle' ? 'defeated' : 'ambushed') : null), amt: e.amt, ms: e.ms, collected: e.collected, cap: e.cap, shaft: e.shaft, scare: e.scare, faun: e.faun, twin: e.twin, spill: e.spill, pvp: e.pvp, reason: e.reason }))]
      .sort((a, b) => b.t - a.t);
    const timedList = shifts.filter((x) => x.ms > 0);
    const timedMs = sum(timedList.map((x) => x.ms)), timedAmt = sum(timedList.map((x) => x.amt));
    const totalMs = m.totalMs || 0, timed = m.timedShifts || 0;
    const won = raids.filter((x) => x.winner === p.id), lost = raids.filter((x) => x.loser === p.id);
    return {
      shifts: m.shifts || 0, earned: r2(m.earned || 0), best: m.best || 0, jackpots: m.jackpots || 0, totalMs, timedShifts: timed,
      avgMs: timed ? Math.round(totalMs / timed) : 0, perHour: timedMs > 60e3 ? r2(timedAmt / (timedMs / 3600e3)) : null, quitsMs: sum(rec.filter((e) => e.reason === 'quit').map((e) => e.ms || 0)),
      recorded: { ends: rec.length, starts: starts.length, quits: rec.filter((e) => e.reason === 'quit').length, full: rec.filter((e) => e.cap && e.collected >= e.cap - 1e-6).length,
        scare: starts.filter((e) => e.scare).length, faun: starts.filter((e) => e.faun).length, twin: rec.filter((e) => e.twin).length, caveIns: rec.filter((e) => e.spill).length, eggs: starts.filter((e) => e.egg).length,
        fares: r2(sum(starts.map((e) => e.fare))) },
      pvp: { won: won.length, lost: lost.length, cashWon: r2(sum(won.map((x) => x.paid ?? x.cash))), cashLost: r2(sum(lost.map((x) => x.paid ?? x.cash))), battlesWon: won.filter((x) => x.kind === 'battle').length, ambushesWon: won.filter((x) => x.kind !== 'battle').length },
      list: shifts.slice(0, 120),
    };
  };

  // ---------- activity (last seen) ----------
  const sessionsByPlayer = {};
  for (const s of Object.values(docs.sessions?.sessions || {})) (sessionsByPlayer[s.playerId] ||= []).push(s);
  const lastLedger = {}; for (const x of ledger) lastLedger[x.p] = Math.max(lastLedger[x.p] || 0, x.t);
  const lastSeen = (p) => Math.max(ap(p.id)?.last || 0, lastLedger[p.id] || 0, ...(p.mining?.history || []).map((h) => h.t || 0), ...(sessionsByPlayer[p.id] || []).map((s) => s.created || 0), p.createdAt || 0);

  const anyGeo = (ip) => geo(ip);
  const playerRow = (p) => {
    const a = ap(p.id);
    const ips = Object.entries(a?.ips || {}).sort((x, y) => y[1].last - x[1].last);
    const lastIp = ips[0]?.[0] || null;
    const devs = Object.entries(a?.devices || {}).sort((x, y) => y[1].last - x[1].last);
    const visits = a?.visits || [];
    const playMs = sum(Object.values(a?.areas || {}));
    const src = perPlayerSource[p.id] || {};
    const net = Object.fromEntries(Object.keys(SOURCES).map((k) => [k, src[k]?.net || 0]));
    const worth = ctx.worth ? ctx.worth(p) : { total: p.bankroll };
    const g = lastIp ? anyGeo(lastIp) : null;
    return {
      id: p.id, name: p.name, kind: p.kind || 'guest', username: p.login?.username || null, createdAt: p.createdAt || null,
      bankroll: r2(p.bankroll), worth: r2(worth.total), gain: r2((worth.total || 0) - 1000), lastSeen: lastSeen(p), lastIp, location: lastIp ? geoLabel(g) : null, isp: g?.isp || null,
      device: devs[0]?.[0] || null, devices: devs.length, ips: ips.length, visits: visits.length, logins: (a?.logins || 0), sessions: (sessionsByPlayer[p.id] || []).length, playMs,
      net, mines: { shifts: p.mining?.shifts || 0, earned: r2(p.mining?.earned || 0), ms: p.mining?.totalMs || 0 },
      poker: { hands: p.stats?.handsPlayed || 0, won: p.stats?.handsWon || 0 }, bjNet: r2(bjEarnings[p.id] || 0), slotsNet: r2((docs.slots?.players?.[p.id]?.life?.won || 0) - (docs.slots?.players?.[p.id]?.life?.wagered || 0)),
      partial: partialHistory(p),
    };
  };
  const rows = players.map(playerRow);

  // ---------- daily money chart ----------
  const days30 = lastNDays(now, 30);
  const daily = Object.fromEntries(days30.map((d) => [d, {}]));
  for (const x of ledger) { const d = denverDay(x.t); if (!daily[d] || x.source === 'start') continue; daily[d][x.source] = r2((daily[d][x.source] || 0) + (Number(x.amt) || 0)); }

  // ---------- usage ----------
  const activeDays = {}; // day -> Set(ids)
  const mark = (t, id) => { if (!t || !id) return; (activeDays[denverDay(t)] ||= new Set()).add(id); };
  const hours = Array(24).fill(0), dows = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
  const stamp = (t) => { const h = denverHour(t); hours[h.hour] += 1; if (h.dow in dows) dows[h.dow] += 1; };
  for (const x of ledger) { if (x.type === 'start') continue; mark(x.t, x.p); stamp(x.t); }
  for (const p of players) for (const h of p.mining?.history || []) mark(h.t, p.id);
  for (const s of Object.values(docs.sessions?.sessions || {})) mark(s.created, s.playerId);
  const visitsAll = [];
  for (const [id, a] of Object.entries(access.players || {})) for (const v of a.visits || []) { visitsAll.push({ ...v, p: id }); mark(v.s, id); mark(v.e, id); stamp(v.s); }
  const dau = days30.map((d) => ({ day: d, n: activeDays[d]?.size || 0, visits: visitsAll.filter((v) => denverDay(v.s) === d).length }));
  const activeWithin = (ms) => players.filter((p) => lastSeen(p) >= now - ms).length;
  const areaTotals = {};
  for (const a of Object.values(access.players || {})) for (const [k, v] of Object.entries(a.areas || {})) areaTotals[k] = (areaTotals[k] || 0) + v;
  const visitLens = visitsAll.map((v) => v.e - v.s);
  const devCount = {};
  for (const a of Object.values(access.players || {})) for (const [k] of Object.entries(a.devices || {})) devCount[k] = (devCount[k] || 0) + 1;
  const logins = events.filter((e) => e.k === 'login');
  const loginHow = {}; for (const e of logins) loginHow[e.how] = (loginHow[e.how] || 0) + 1;

  // ---------- circulation ----------
  const worthTotals = players.reduce((o, p) => { const w = ctx.worth ? ctx.worth(p) : { bankroll: p.bankroll, total: p.bankroll }; for (const k of ['bankroll', 'holdings', 'chips', 'riskEscrow', 'barnEscrow', 'total']) o[k] = r2((o[k] || 0) + (w[k] || 0)); return o; }, {});
  let bjChips = 0, bjBanks = 0;
  for (const t of Object.values(docs.blackjack?.tables || {})) { if (t.status === 'closed' || t.paidOut) continue; for (const s of t.seats || []) if (s && !s.bot && !s.left) bjChips += s.chips || 0; if (t.house?.mode === 'player' && t.house.staked) bjBanks += t.house.bank || 0; }
  const faucets = ['start', 'mines', 'fawn', 'golf'].reduce((a, k) => a + (sourceTotals[k]?.net || 0), 0) + (sourceTotals.poker.subs['Guntrad fight won']?.net || 0) + (sourceTotals.poker.subs['Guntrad fight lost']?.net || 0);
  const today = denverDay(now);
  const todayNet = {}; for (const x of ledger) if (denverDay(x.t) === today && x.source !== 'start') todayNet[x.p] = r2((todayNet[x.p] || 0) + (Number(x.amt) || 0));

  const overview = {
    now, tz: TZ, since: access.since || null, ledgerSince: access.ledgerSince || null,
    players: players.length, signedIn: players.filter((p) => p.google || p.login).length,
    active: { today: players.filter((p) => denverDay(lastSeen(p)) === today).length, d7: activeWithin(7 * DAY), d30: activeWithin(30 * DAY) },
    money: { ...worthTotals, bjChips: r2(bjChips), bjBanks: r2(bjBanks), circulation: r2((worthTotals.total || 0) + bjChips + bjBanks), faucets: r2(faucets),
      sinks: r2((sourceTotals.store?.net || 0) + (sourceTotals.mines?.subs['Elevator fare']?.net || 0)) },
    flows: Object.entries(sourceTotals).filter(([, v]) => v.n).map(([k, v]) => ({ source: k, label: SOURCES[k], in: v.in, out: v.out, net: v.net, n: v.n })).sort((a, b) => b.net - a.net),
    top: [...rows].sort((a, b) => b.gain - a.gain).slice(0, 5).map((r) => ({ id: r.id, name: r.name, gain: r.gain, worth: r.worth })),
    bottom: [...rows].sort((a, b) => a.gain - b.gain).slice(0, 5).map((r) => ({ id: r.id, name: r.name, gain: r.gain, worth: r.worth })),
    today: Object.entries(todayNet).sort((a, b) => b[1] - a[1]).map(([id, net]) => ({ id, name: nameOf(id), net })),
    dau: dau.slice(-14),
    recent: ledger.slice(-8).reverse().map((x) => ({ t: x.t, p: x.p, name: nameOf(x.p), amt: x.amt, source: x.source, sub: x.sub })),
  };

  const money = {
    sources: Object.entries(sourceTotals).filter(([, v]) => v.n).map(([k, v]) => ({ source: k, label: SOURCES[k], ...v, subs: Object.entries(v.subs).map(([s, o]) => ({ sub: s, ...o })).sort((a, b) => b.net - a.net) })),
    matrix: rows.map((r) => ({ id: r.id, name: r.name, net: r.net, total: r2(sum(Object.entries(r.net).filter(([k]) => k !== 'start').map(([, v]) => v))) })).sort((a, b) => b.total - a.total),
    daily: days30.map((d) => ({ day: d, ...daily[d] })),
    blackjack: Object.entries(bj).map(([id, b]) => ({ id, name: nameOf(id), ...b, lifetime: r2(bjEarnings[id] || 0) })).sort((a, b) => (b.hands + b.match + b.pairs + b.house) - (a.hands + a.match + a.pairs + a.house)),
    ledgerCount: ledger.length, reconstructed: ledger.filter((x) => x.r).length,
  };

  const minesRows = players.filter((p) => (p.mining?.shifts || 0) > 0 || shiftEnds.some((e) => e.p === p.id)).map((p) => ({ id: p.id, name: p.name, ...(({ list, ...rest }) => rest)(minesFor(p)) }));
  const allShiftMs = [...players.flatMap((p) => (p.mining?.history || []).map((h) => h.ms).filter(Boolean))];
  for (const e of shiftEnds) if (e.ms && !allShiftMs.includes(e.ms)) allShiftMs.push(e.ms);
  const buckets = [[0, 60e3, '<1m'], [60e3, 120e3, '1–2m'], [120e3, 180e3, '2–3m'], [180e3, 300e3, '3–5m'], [300e3, 600e3, '5–10m'], [600e3, Infinity, '10m+']];
  const outcomes = {};
  for (const p of players) for (const h of p.mining?.history || []) outcomes[h.outcome] = (outcomes[h.outcome] || 0) + 1;
  for (const e of shiftEnds) if (e.reason === 'quit') outcomes.quit = (outcomes.quit || 0) + 1; else if (e.pvp) outcomes[e.pvp === 'battle' ? 'defeated' : 'ambushed'] = (outcomes[e.pvp === 'battle' ? 'defeated' : 'ambushed'] || 0) + 1;
  const shiftsByDay = Object.fromEntries(days30.map((d) => [d, 0]));
  for (const p of players) for (const h of p.mining?.history || []) { const d = denverDay(h.t); if (d in shiftsByDay) shiftsByDay[d] += 1; }
  const mines = {
    totals: { shifts: sum(players.map((p) => p.mining?.shifts || 0)), earned: r2(sum(players.map((p) => p.mining?.earned || 0))), ms: sum(players.map((p) => p.mining?.totalMs || 0)),
      avgMs: allShiftMs.length ? Math.round(sum(allShiftMs) / allShiftMs.length) : 0, medianMs: Math.round(median(allShiftMs)),
      recordedStarts: shiftStarts.length, recordedEnds: shiftEnds.length,
      scare: shiftStarts.filter((e) => e.scare).length, faun: shiftStarts.filter((e) => e.faun).length, twin: shiftEnds.filter((e) => e.twin).length,
      caveIns: shiftEnds.filter((e) => e.spill).length, quits: shiftEnds.filter((e) => e.reason === 'quit').length,
      full: shiftEnds.filter((e) => e.cap && e.collected >= e.cap - 1e-6).length, partial: shiftEnds.filter((e) => e.cap && e.collected > 0 && e.collected < e.cap - 1e-6).length,
      active: Object.keys(docs.mines?.active || {}).length },
    perHourAll: (() => { const xs = players.flatMap((p) => (p.mining?.history || []).filter((h) => h.ms > 0)); const ms = sum(xs.map((h) => h.ms)); return ms > 60e3 ? r2(sum(xs.map((h) => h.amount)) / (ms / 3600e3)) : null; })(),
    durations: buckets.map(([a, b, label]) => ({ label, n: allShiftMs.filter((x) => x >= a && x < b).length })),
    outcomes: Object.entries(outcomes).map(([k, n]) => ({ outcome: k, n })).sort((a, b) => b.n - a.n),
    byDay: Object.entries(shiftsByDay).map(([day, n]) => ({ day, n })),
    players: minesRows.sort((a, b) => b.earned - a.earned),
    raids: raids.slice(0, 60).map((x) => ({ at: x.at, kind: x.kind, winner: x.winner, winnerName: x.winnerName, loser: x.loser, loserName: x.loserName, cash: x.paid ?? x.cash, acid: x.mines?.acid || 0, tobacco: x.tobaccoNames || [] })),
    active: Object.entries(docs.mines?.active || {}).map(([id, s]) => ({ id, name: nameOf(id), startedAt: s.startedAt, shaft: s.shaft || '7', collected: s.collected ? s.collected / 1000 : 0, cap: s.capacity ? s.capacity / 1000 : null })),
  };

  const usage = {
    dau, visits: visitsAll.length, avgVisitMs: visitLens.length ? Math.round(sum(visitLens) / visitLens.length) : 0, medianVisitMs: Math.round(median(visitLens)),
    areas: Object.entries(areaTotals).map(([area, ms]) => ({ area, ms })).sort((a, b) => b.ms - a.ms),
    hours, dows, devices: Object.entries(devCount).map(([device, n]) => ({ device, n, mobile: mobileDevice(device) })).sort((a, b) => b.n - a.n),
    logins: logins.length, loginHow, sessionsActive: Object.keys(docs.sessions?.sessions || {}).length,
    perPlayer: rows.map((r) => ({ id: r.id, name: r.name, visits: r.visits, playMs: r.playMs, lastSeen: r.lastSeen, areas: ap(r.id)?.areas || {} })).sort((a, b) => b.playMs - a.playMs || b.lastSeen - a.lastSeen),
    recentVisits: visitsAll.sort((a, b) => b.s - a.s).slice(0, 40).map((v) => ({ p: v.p, name: nameOf(v.p), s: v.s, e: v.e, ip: v.ip, location: geoLabel(anyGeo(v.ip)), dev: v.dev, n: v.n, areas: v.areas })),
  };

  const anomalies = findAnomalies({ players, rows, ledger, access, bj, bjSeat, docs, nameOf, minesRows, geo: anyGeo, now });

  return { overview, players: rows, money, mines, usage, anomalies, _detail: { ledger, minesFor, bj, bjSeat, sessionsByPlayer, perPlayerSource, events } };
}

export function findAnomalies({ players, rows, ledger, access, bj, bjSeat, docs, nameOf, minesRows, geo, now }) {
  const out = [];
  const add = (sev, kind, text, ids = [], extra = {}) => out.push({ sev, kind, text, ids, ...extra });
  // one IP, several accounts
  const ipMap = {};
  for (const [id, a] of Object.entries(access.players || {})) for (const ip of Object.keys(a.ips || {})) (ipMap[ip] ||= new Set()).add(id);
  for (const [ip, ids] of Object.entries(ipMap)) if (ids.size > 1 && ip !== 'unknown') {
    const g = geo(ip);
    add(ids.size > 2 ? 'high' : 'med', 'shared-ip', `${ids.size} accounts used the same IP (${ip}${g && !g.private ? `, ${geoLabel(g)}` : ''}): ${[...ids].map(nameOf).join(', ')}`, [...ids], { ip });
  }
  // several countries for one player
  for (const [id, a] of Object.entries(access.players || {})) {
    const cs = new Set(Object.keys(a.ips || {}).map((ip) => geo(ip)).filter((g) => g && g.cc).map((g) => g.cc));
    if (cs.size > 1) add('med', 'countries', `${nameOf(id)} connected from ${cs.size} countries (${[...cs].join(', ')})`, [id]);
    const vpn = Object.keys(a.ips || {}).map((ip) => [ip, geo(ip)]).filter(([, g]) => g && (g.proxy || g.hosting));
    if (vpn.length) add('low', 'vpn', `${nameOf(id)} used a VPN / hosting IP (${vpn.map(([ip]) => ip).join(', ')})`, [id]);
  }
  // win rates
  for (const p of players) {
    const s = p.stats || {};
    if ((s.handsPlayed || 0) >= 30 && s.handsWon / s.handsPlayed > 0.45) add('med', 'poker-winrate', `${p.name} wins ${Math.round(100 * s.handsWon / s.handsPlayed)}% of poker hands over ${s.handsPlayed} hands`, [p.id]);
    const b = bjSeat[p.id];
    if (b && b.wagered >= 500 && b.won / b.wagered > 1.15) add('med', 'bj-return', `${p.name} gets back ${Math.round(100 * b.won / b.wagered)}% of what they wager at blackjack ($${Math.round(b.wagered)} wagered)`, [p.id]);
    const sl = docs.slots?.players?.[p.id]?.life;
    if (sl && sl.spins >= 100 && sl.won / sl.wagered > 1.1) add('med', 'slots-return', `${p.name} slots return ${Math.round(100 * sl.won / sl.wagered)}% over ${sl.spins} spins`, [p.id]);
    if (p.bankroll < 0) add('high', 'negative', `${p.name} has a negative bankroll ($${p.bankroll})`, [p.id]);
    const last = [...(p.txns || [])].pop();
    if (last && Math.abs((last.balance ?? p.bankroll) - p.bankroll) > 0.01) add('low', 'ledger-mismatch', `${p.name}'s bankroll ($${p.bankroll}) differs from their last logged balance ($${last.balance})`, [p.id]);
  }
  // rapid balance jumps: one change of $2,000+ or a day's gain over $3,000 (starting bankrolls excluded)
  const dayGain = {};
  for (const x of ledger) {
    if (x.type === 'start') continue;
    if ((Number(x.amt) || 0) >= 2000) add('med', 'big-win', `${nameOf(x.p)} +$${Math.round(x.amt).toLocaleString('en-US')} in one go (${x.sub}, ${SOURCES[x.source]})`, [x.p], { t: x.t });
    const k = `${x.p}|${denverDay(x.t)}`; dayGain[k] = (dayGain[k] || 0) + (Number(x.amt) || 0);
  }
  for (const [k, v] of Object.entries(dayGain)) if (v >= 3000) { const [id, d] = k.split('|'); add('med', 'day-jump', `${nameOf(id)} gained $${Math.round(v).toLocaleString('en-US')} on ${d}`, [id], { day: d }); }
  // sneak bets
  for (const [id, b] of Object.entries(bj)) {
    if (b.sneakN >= 10) add(b.sneakN >= 25 ? 'high' : 'med', 'sneak', `${nameOf(id)} slid ${b.sneakN} sneak bets (won $${b.sneakWon}, staked $${b.sneakStaked})`, [id]);
    else if (b.sneakWins >= 3) add('low', 'sneak', `${nameOf(id)} has ${b.sneakWins} winning sneak bets`, [id]);
  }
  // mining speed: earnings per hour way above everyone else
  const rates = minesRows.filter((m) => m.perHour && m.timedShifts >= 5).map((m) => m.perHour);
  const med = rates.length ? [...rates].sort((a, b) => a - b)[rates.length >> 1] : 0;
  for (const m of minesRows) if (m.perHour && m.timedShifts >= 5 && med && m.perHour > 2.5 * med) add('low', 'mine-rate', `${m.name} earns $${Math.round(m.perHour).toLocaleString('en-US')}/h mining, ${(m.perHour / med).toFixed(1)}× the median`, [m.id]);
  void rows; void now;
  const rank = { high: 0, med: 1, low: 2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev] || (b.t || 0) - (a.t || 0));
}

/** Everything about one player for the drilldown. */
export function playerDetail(report, ctx, id, { limit = 400 } = {}) {
  const p = ctx.players[id]; if (!p) return null;
  const d = report._detail;
  const a = ctx.access?.players?.[id] || {};
  const row = report.players.find((r) => r.id === id);
  const ips = Object.entries(a.ips || {}).sort((x, y) => y[1].last - x[1].last).map(([ip, v]) => { const g = ctx.geo(ip); return { ip, ...v, location: geoLabel(g), isp: g?.isp || null, lat: g?.lat, lon: g?.lon, proxy: !!g?.proxy, hosting: !!g?.hosting, mobile: !!g?.mobile }; });
  const ledger = d.ledger.filter((x) => x.p === id);
  const logins = d.events.filter((e) => e.p === id && (e.k === 'login' || e.k === 'logout')).map((e) => ({ t: e.t, k: e.k, how: e.how, ip: e.ip, dev: e.dev }));
  const sessions = (d.sessionsByPlayer[id] || []).map((s) => ({ t: s.created, exp: s.exp, ip: s.ip || null, dev: s.ua ? deviceOf(s.ua) : null })).sort((x, y) => y.t - x.t);
  const timeline = [...logins.map((x) => ({ ...x, kind: x.k })), ...sessions.filter((s) => !logins.some((l) => Math.abs(l.t - s.t) < 5000)).map((s) => ({ t: s.t, kind: 'session', ip: s.ip, dev: s.dev, r: 1 })),
    ...(a.visits || []).map((v) => ({ t: v.s, kind: 'visit', end: v.e, ip: v.ip, dev: v.dev, n: v.n, areas: v.areas }))].sort((x, y) => y.t - x.t).slice(0, 300);
  const fawnToday = ctx.docs.fawn?.by?.[id]?.gift || null;
  const slot = ctx.docs.slots?.players?.[id]?.life || null;
  return {
    row, profile: { id, name: p.name, kind: p.kind || 'guest', username: p.login?.username || null, email: p.google?.email || p.login?.email || null, createdAt: p.createdAt || null, hasAvatar: !!p.avatar },
    worth: ctx.worth ? ctx.worth(p) : { bankroll: p.bankroll, total: p.bankroll },
    ips, timeline, areas: a.areas || {}, devices: Object.entries(a.devices || {}).map(([k, v]) => ({ device: k, ...v })).sort((x, y) => y.last - x.last),
    sources: d.perPlayerSource[id] || {}, ledger: ledger.slice(-limit).reverse(), ledgerTotal: ledger.length, partial: row?.partial || false,
    mines: d.minesFor(p), poker: p.stats || {}, bj: d.bj[id] || null, bjSeat: d.bjSeat[id] ? { ...d.bjSeat[id], tables: d.bjSeat[id].tables.size } : null, bjLifetime: ctx.docs.blackjack?.earnings?.[id] || 0,
    slots: slot, fawn: fawnToday, holdings: p.holdings || {}, invest: p.invest || {},
  };
}
