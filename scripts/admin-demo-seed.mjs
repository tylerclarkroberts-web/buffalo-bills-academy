// Fills a throwaway data folder with made-up players, money, shifts and visits so the admin dashboard can be
// previewed locally. Never point this at real data.
//   node scripts/admin-demo-seed.mjs /tmp/bba-admin-demo
//   DATA_DIR=/tmp/bba-admin-demo DEV_LOGIN=1 ADMIN_GEO=0 BJ_TICK_MS=0 npm run server   -> sign in as owner@example.com, open /admin
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/admin-demo-seed.mjs <empty folder>'); process.exit(1); }
if (fs.existsSync(path.join(dir, 'players.json'))) { console.error('That folder already has players.json; refusing to overwrite.'); process.exit(1); }
fs.mkdirSync(path.join(dir, 'tables'), { recursive: true });

let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const r2 = (x) => Math.round(x * 100) / 100;
const NOW = Date.now(), DAY = 86400e3, TRACK = NOW - 6 * DAY;
const uuid = () => crypto.randomUUID();

const CITIES = [['Provo', 'Utah', 'US', 'Comcast Cable', 40.23, -111.66], ['Denver', 'Colorado', 'US', 'CenturyLink', 39.74, -104.99], ['Salt Lake City', 'Utah', 'US', 'Google Fiber', 40.76, -111.89],
  ['Boise', 'Idaho', 'US', 'Sparklight', 43.61, -116.2], ['Phoenix', 'Arizona', 'US', 'Cox Communications', 33.45, -112.07], ['Austin', 'Texas', 'US', 'Spectrum', 30.27, -97.74],
  ['Lehi', 'Utah', 'US', 'Verizon Wireless', 40.39, -111.85], ['Vancouver', 'British Columbia', 'CA', 'Telus', 49.28, -123.12]];
const UA = { 'iPhone · Safari': 'iPhone', 'Mac · Chrome': 'Mac', 'Windows · Chrome': 'Win', 'Android phone · Chrome': 'Android', 'iPad · Safari': 'iPad' };
const NAMES = ['Dusty', 'Marge', 'Big Lou', 'Hank', 'Pearl', 'Skeeter', 'Opal', 'Rusty', 'Dot', 'Clem', 'Bunny', 'Waylon', 'Ida', 'Boone'];
const owner = { id: uuid(), name: 'Owner', createdAt: NOW - 30 * DAY, kind: 'dev', google: { sub: 'dev:owner@example.com', email: 'owner@example.com' } };
const people = [owner, ...NAMES.map((name, i) => ({ id: uuid(), name, createdAt: NOW - ri(8, 30) * DAY, kind: i % 4 === 3 ? 'password' : 'google',
  ...(i % 4 === 3 ? { login: { username: name.toLowerCase().replace(/\s/g, ''), hash: 'x' } } : { google: { sub: `demo-${i}`, email: `${name.toLowerCase().replace(/\s/g, '')}@example.com` } }) }))];

const ledger = [], events = [], access = { since: TRACK, ledgerSince: TRACK, players: {}, bjSeen: {} };
const geo = { ips: {} };
const raids = {};
const slots = { players: {} };
const bjEarn = {};
let ipN = 10;
const homeIp = {};
for (const p of people) {
  const c = p.name === 'Opal' ? CITIES[7] : pick(CITIES.slice(0, 7));
  const ip = `203.0.113.${ipN++}`;
  homeIp[p.id] = ip;
  geo.ips[ip] = { at: NOW, city: c[0], region: c[1], country: c[2] === 'US' ? 'United States' : 'Canada', cc: c[2], isp: c[3], lat: c[4], lon: c[5], tz: '', mobile: false, proxy: false, hosting: false };
}
// two accounts on one IP, and one player hopping on cellular + a VPN
homeIp[people[6].id] = homeIp[people[5].id];
geo.ips['198.51.100.40'] = { at: NOW, city: 'Lehi', region: 'Utah', country: 'United States', cc: 'US', isp: 'T-Mobile USA', lat: 40.39, lon: -111.85, mobile: true, proxy: false, hosting: false };
geo.ips['192.0.2.77'] = { at: NOW, city: 'Seattle', region: 'Washington', country: 'United States', cc: 'US', isp: 'Mullvad VPN', lat: 47.6, lon: -122.3, mobile: false, proxy: true, hosting: true };

const players = {};
for (const p of people) {
  let bal = 1000; const txns = [];
  const add = (t, type, amount, note) => { bal = r2(bal + amount); const e = { t, type, amount: r2(amount), note, balance: bal }; txns.push(e); ledger.push({ t, p: p.id, type, amt: e.amount, bal, note, ...(t < TRACK ? { r: 1 } : {}) }); };
  add(p.createdAt, 'start', 1000, 'Starting bankroll');
  const skill = p.name === 'Big Lou' ? 1.6 : p.name === 'Skeeter' ? 0.6 : 0.8 + rnd() * 0.5;
  const mining = { shifts: 0, earned: 0, jackpots: 0, best: 0, history: [], recentStarts: [], totalMs: 0, timedShifts: 0 };
  const stats = { handsPlayed: 0, handsWon: 0, biggestPot: 0, chipsWon: 0 };
  const days = Math.floor((NOW - p.createdAt) / DAY);
  const life = { spins: 0, wagered: 0, won: 0, biggest: 0 };
  for (let d = days; d >= 0; d--) {
    if (rnd() < 0.35 && p !== owner) continue;
    // evenings, Denver time (UTC-7): most play lands between about 4 PM and 11 PM
    const midnight = Math.floor((NOW - 7 * 3600e3) / DAY) * DAY + 7 * 3600e3 - d * DAY;
    const base = midnight + (rnd() < 0.8 ? ri(15, 21) : ri(7, 14)) * 3600e3 + ri(0, 59) * 60e3;
    if (base > NOW) continue;
    // mines
    for (let s = 0; s < ri(0, 3); s++) {
      const t = base + s * ri(4, 9) * 60e3; if (t > NOW) break;
      const ms = ri(60, 420) * 1000; const outcome = rnd() < 0.08 ? 'dud' : rnd() < 0.01 ? 'diamonds' : 'normal';
      const amt = outcome === 'dud' ? ri(8, 14) : outcome === 'diamonds' ? 10000 : ri(85, 125);
      const cap = 100, collected = rnd() < 0.85 ? 100 : ri(30, 95);
      const paid = r2(amt * collected / cap);
      mining.shifts++; mining.earned = r2(mining.earned + paid); mining.best = Math.max(mining.best, paid); mining.totalMs += ms; mining.timedShifts++;
      if (outcome === 'diamonds') mining.jackpots++;
      mining.history.push({ t: t + ms, outcome, amount: paid, ms });
      add(t + ms, 'mine', paid, `Acid Mines: ${outcome === 'dud' ? 'mostly mud' : 'shift complete'}`);
      if (t >= TRACK) {
        const scare = rnd() < 0.28, faun = !scare && rnd() < 0.28;
        events.push({ t, k: 'shift-start', p: p.id, shift: uuid().slice(0, 8), shaft: '7', cells: 7, cap, fare: 0, scare, faun, twin: false, egg: rnd() < 0.05 });
        events.push({ t: t + ms, k: 'shift-end', p: p.id, shaft: '7', ms, outcome, amt: paid, collected, cap, reason: outcome === 'dud' ? 'mud' : null, scare, faun, twin: 0, spill: 0, pvp: null });
        if (rnd() < 0.12) { const q = t + ms + 60e3; events.push({ t: q, k: 'shift-start', p: p.id, shaft: '7', cap, fare: 0, scare: false, faun: false }); events.push({ t: q + 40e3, k: 'shift-end', p: p.id, ms: 40e3, outcome: null, amt: 0, collected: 0, cap, reason: 'quit' }); }
      }
    }
    if (rnd() < 0.5) { const t = base + 90 * 60e3; if (t < NOW) add(t, 'fawn', ri(30, 70), `Faun's wooden box: $${ri(30, 70)}`); }
    if (rnd() < 0.4) { // poker
      const t = base + 2 * 3600e3; if (t < NOW) { const buy = pick([200, 500]); add(t, 'buyin', -buy, 'Buy-in at Friday Night'); const back = Math.max(0, Math.round(buy * (skill - 0.65 + rnd() * 1.1))); stats.handsPlayed += ri(15, 60); stats.handsWon += Math.round(stats.handsPlayed * 0.02 * skill); if (back) add(t + 3 * 3600e3, 'cashout', back, 'Cashed out of Friday Night'); }
    }
    if (rnd() < 0.45) { // blackjack
      const t = base + 4 * 3600e3; if (t < NOW) { add(t, 'blackjack', -200, 'Blackjack buy-in (DEMO01)'); const back = Math.max(0, Math.round(200 * (0.6 + rnd() * 0.7) * (p.name === 'Pearl' ? 1.4 : 1))); add(t + 40 * 60e3, 'blackjack', back, 'Blackjack cash-out (DEMO01)'); bjEarn[p.id] = r2((bjEarn[p.id] || 0) + back - 200); }
    }
    if (rnd() < 0.3) { const t = base + 5 * 3600e3; if (t < NOW) { const n = ri(10, 60), bet = pick([1, 2, 5]); const won = r2(n * bet * (0.75 + rnd() * 0.3)); life.spins += n; life.wagered += n * bet; life.won = r2(life.won + won); add(t, 'slots', r2(won - n * bet), 'Slots'); } }
    if (rnd() < 0.15) { const t = base + 6 * 3600e3; if (t < NOW) add(t, 'shop', -pick([25, 40, 75, 150]), `General Store: ${pick(['Black cowboy hat', 'Goggles', 'Bandage', 'Spaghetti gag'])}`); }
  }
  if (rnd() < 0.4) add(NOW - ri(1, 4) * DAY, 'foff', pick([25, 30, 40, 60]), "Foff's bachelor party: $40");
  if (p.name === 'Big Lou') add(NOW - 2 * DAY + 3600e3, 'foff', 2500, 'Presidential Medal of Freedom: $2,500');
  if (life.spins) slots.players[p.id] = { life, recent: [] };
  players[p.id] = { ...p, bankroll: bal, txns: txns.slice(-200), stats, mining: { ...mining, history: mining.history.slice(-50) }, holdings: {}, invest: { realized: 0 } };
}
// pvp
const miners = people.slice(1);
for (let i = 0; i < 9; i++) {
  const w = pick(miners), l = pick(miners.filter((x) => x !== w)); const at = NOW - ri(0, 5) * DAY - ri(0, 20) * 3600e3; const cash = ri(20, 90); const kind = rnd() < 0.5 ? 'battle' : 'ambush';
  raids[`r${i}`] = { id: `r${i}`, kind, at, winner: w.id, winnerName: w.name, loser: l.id, loserName: l.name, cash, paid: cash, tobaccoNames: rnd() < 0.3 ? ['Filtered Cigarette'] : [], mines: { acid: ri(10, 80) }, done: true };
  for (const [p, amt, note] of [[l, -cash, `Acid Mines: ${kind === 'battle' ? 'lost a bug battle to' : 'ambushed by'} ${w.name}`], [w, cash, `Acid Mines: ${kind === 'battle' ? 'won a bug battle against' : 'ambushed'} ${l.name}`]]) {
    const pl = players[p.id]; pl.bankroll = r2(pl.bankroll + amt); const e = { t: at, type: 'pvp', amount: amt, note, balance: pl.bankroll }; pl.txns.push(e); ledger.push({ t: at, p: p.id, type: 'pvp', amt, bal: pl.bankroll, note });
  }
  events.push({ t: at, k: 'shift-end', p: l.id, ms: ri(60, 200) * 1000, outcome: kind === 'battle' ? 'defeated' : 'ambushed', amt: 0, collected: 0, cap: 100, reason: null, pvp: kind });
}
// blackjack rounds (side bets, sneak bets against a player house)
const house = people[3];
for (let round = 1; round <= 160; round++) {
  const p = pick(miners.filter((x) => x !== house)); const t = NOW - ri(0, 5) * DAY - ri(0, 23) * 3600e3; const code = 'DEMO01';
  const net = pick([10, 10, -10, -10, -10, 15, 0, 20, -20]);
  events.push({ t, k: 'bj-hand', p: p.id, code, round, seat: 0, house: house.id, out: net > 0 ? 'win' : net < 0 ? 'lose' : 'push', amt: net });
  if (rnd() < 0.3) { const m = ri(1, 5); events.push({ t, k: 'bj-side', p: p.id, code, round, seat: 0, house: house.id, match: m, pairs: 0 }); if (rnd() < 0.2) events.push({ t, k: 'bj-royal', p: p.id, code, round, seat: 0, house: house.id, bet: 'match', tier: 'easy', amt: m * 2.5 }); }
  const sneaker = p.name === 'Skeeter' ? 0.6 : 0.04;
  if (rnd() < sneaker) { const m = ri(2, 10); events.push({ t: t + 1000, k: 'bj-sneak', p: p.id, code, round, seat: 0, house: house.id, match: m, pairs: 0 }); if (rnd() < 0.35) events.push({ t: t + 1000, k: 'bj-royal', p: p.id, code, round, seat: 0, house: house.id, bet: 'match', tier: 'easy', amt: m * 2.5, sneak: true }); }
}
// visits, IPs, devices, logins (tracked days only)
const AREAS = ['poker', 'blackjack', 'mines', 'mines', 'slots', 'lobby', 'store', 'golf', 'barn'];
for (const p of people) {
  const dev = p === owner ? 'Mac · Chrome' : pick(Object.keys(UA));
  const a = access.players[p.id] = { first: TRACK, last: 0, hits: 0, logins: 0, ips: {}, devices: {}, visits: [], areas: {} };
  const sessions = p.name === 'Rusty' ? 0 : ri(3, 14);
  for (let i = 0; i < sessions; i++) {
    const d0 = Math.floor((TRACK + rnd() * (NOW - TRACK) - 7 * 3600e3) / DAY) * DAY + 7 * 3600e3; // a Denver midnight
    const s = d0 + (rnd() < 0.75 ? ri(16, 22) : ri(8, 15)) * 3600e3 + ri(0, 59) * 60e3; if (s > NOW - 3600e3) continue;
    const len = ri(3, 70) * 60e3; const ip = p.name === 'Waylon' && i % 3 === 1 ? '198.51.100.40' : p.name === 'Opal' && i === 2 ? '192.0.2.77' : homeIp[p.id];
    const areas = {}; let left = len; while (left > 0) { const k = pick(AREAS); const x = Math.min(left, ri(2, 25) * 60e3); areas[k] = (areas[k] || 0) + x; left -= x; }
    const n = Math.round(len / 20e3);
    a.visits.push({ s, e: s + len, ip, dev, n, areas });
    for (const [k, v] of Object.entries(areas)) a.areas[k] = (a.areas[k] || 0) + v;
    a.hits += n; a.last = Math.max(a.last, s + len);
    const ipr = (a.ips[ip] ||= { first: s, last: s, n: 0, dev }); ipr.last = Math.max(ipr.last, s + len); ipr.n += n;
    const dr = (a.devices[dev] ||= { first: s, last: s, n: 0, ua: UA[dev] }); dr.last = Math.max(dr.last, s + len); dr.n += n;
    if (i % 3 === 0) { a.logins++; events.push({ t: s, k: 'login', p: p.id, how: p.kind === 'password' ? 'password' : 'google', ip, dev }); }
  }
  a.visits.sort((x, y) => x.s - y.s);
}
ledger.sort((a, b) => a.t - b.t); events.sort((a, b) => a.t - b.t);
const w = (name, data) => fs.writeFileSync(path.join(dir, name), typeof data === 'string' ? data : JSON.stringify(data));
w('players.json', players);
w('ledger.jsonl', ledger.map((x) => JSON.stringify(x)).join('\n') + '\n');
w('events.jsonl', events.map((x) => JSON.stringify(x)).join('\n') + '\n');
w('access.json', access);
w('geo.json', geo);
w('pvp.json', { raids, pairs: {}, losses: {} });
w('slots.json', slots);
w('blackjack.json', { tables: {}, earnings: bjEarn, earningsSince: null });
w('mines.json', { active: { [people[2].id]: { id: 'x', startedAt: NOW - 95e3, rulesVersion: 2, shaft: '7', collected: 42000, capacity: 100000 }, [people[9].id]: { id: 'y', startedAt: NOW - 30e3, rulesVersion: 2, shaft: '9', collected: 0, capacity: 150000 } } });
w('admins.json', [owner.id]);
console.log(`Seeded ${people.length} made-up players in ${dir}. Sign in with dev login as owner@example.com and open /admin.`);
