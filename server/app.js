// Express app: JSON API under /api, live updates via Server-Sent Events, and the built React app.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { GameError, recordTableMoment } from './engine/game.js';
import { BUGS } from './engine/bugs.js';
import { PokerService } from './service.js';
import { setupAuth, Sessions, authConfig } from './auth.js';
import { Mines } from './mines.js';
import { Foreman } from './foreman.js';
import { Barn } from './barn.js';
import { Shop, SMOKE } from './shop.js';
import { ITEM } from './catalog/index.js';
import { Fawn } from './fawn.js';
import { Foff } from './foff.js';
import { Slots, SLOTS } from './slots/index.js';
import { Blackjack } from './blackjack/index.js';
import { Avatars } from './avatars.js';
import { PRIVACY_HTML, TERMS_HTML } from './legal.js';
import { Market } from './market.js';
import { cents } from './accounts.js';
import { canonicalRedirect } from './canonical.js';
import { verifyPassword } from './passwords.js';
import { SlackClient, SlackAlerts } from './slack.js';
import { cheapestBuyIn, isBroke as brokeCheck, bustedAndBroke } from './broke.js';
import { Conquest, mountConquest } from './conquest.js';
import { Rooms } from './rooms.js';
import { Pvp, PVP } from './pvp.js';
import { Telemetry, watchBlackjack } from './admin/telemetry.js';
import { Geo } from './admin/geo.js';
import { adminConfig, isAdmin, mountAdmin } from './admin/index.js';

export function createApp({ dataDir, staticDir, now, env = process.env, devLogin, fetchImpl, geoFetch, marketSources, randInt, scareInt, veinInt, poolInt, vein, eggInt, foremanInt, snapshots, dealerFile, authLimits, slackFetch, slackRetryMs, slackSendRetryMs, botDelayScale, conquestFetch, conquestPollMs, pvpInt } = {}) {
  const service = new PokerService({ dataDir, now });
  const config = authConfig(env);
  if (devLogin !== undefined) config.devLogin = devLogin;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(canonicalRedirect({ publicUrl: env.PUBLIC_URL, extraHosts: (env.REDIRECT_HOSTS || '').split(',').map((h) => h.trim()) }));
  const smallJson = express.json({ limit: '16kb' });
  const avatarJson = express.json({ limit: '260kb' });
  const fightJson = express.json({ limit: '200kb' }); // a whole fight's input log
  app.use((req, res, next) => (req.path === '/api/me/avatar' ? avatarJson : /^\/api\/tables\/[^/]+\/fight\/(submit|stream)$/.test(req.path) ? fightJson : smallJson)(req, res, next));

  const sessions = new Sessions({ store: service.store, now: service.now });
  // v74 admin dashboard: visits, IPs, devices and a full money ledger from here on (server/admin/)
  const telemetry = new Telemetry({ store: service.store, now: service.now });
  service.accounts.onLog = (p, e) => telemetry.ledger(p, e);
  const adminCfg = adminConfig(env, service.store.dir);
  const { middleware: auth, googleOn } = setupAuth(app, { service, sessions, config, fetchImpl, limits: authLimits,
    onLogin: (req, p, how) => telemetry.login(req, p, how), onLogout: (req, id) => telemetry.logout(req, id) });
  const conquest = new Conquest({ service, sessions, env, fetchImpl: conquestFetch || fetchImpl, pollMs: conquestPollMs });
  service.conquest = conquest;
  const accounts = service.accounts;
  // test hooks (local dev server only, never with DEV_LOGIN off): a short incubation and an egg in every shift, for the e2e
  const barnTest = !!config.devLogin;
  if (botDelayScale !== undefined) service.bots.delayScale = botDelayScale;
  else if (barnTest && env.BOT_DELAY_SCALE) service.bots.delayScale = Math.max(0, Number(env.BOT_DELAY_SCALE) || 0); // e2e only: quicker bots
  const barn = new Barn({ store: service.store, accounts, now: service.now, incubateMs: barnTest ? env.BARN_INCUBATE_MS : undefined, forceEgg: barnTest && env.BARN_TEST_EGG === '1', startXp: barnTest ? env.BARN_TEST_XP : 0, starveMs: barnTest ? env.BARN_TEST_STARVE_MS : undefined, eggInt });
  const foreman = new Foreman({ store: service.store, accounts, now: service.now, randInt: foremanInt });
  const mines = new Mines({ store: service.store, accounts, now: service.now, randInt, scareInt, veinInt, poolInt, vein, barn, foreman });
  const avatars = new Avatars({ dir: service.store.dir, store: service.store, now: service.now });
  service.avatars = avatars;
  // v34: the General Store. Avatars carry what you wear; the barn reads bug looks, toy and gear bonuses from it.
  const shop = new Shop({ store: service.store, accounts, barn, now: service.now });
  mines.owned = (id) => shop.doc.inv[id]?.own;
  const fawn = new Fawn({ store: service.store, accounts, shop, now: service.now });
  // v71: the shared daily mine. Test hook (dev login + PVP_TEST=1 only): skip the greenhorn rules for the two-browser e2e.
  if (barnTest && env.PVP_TEST === '1') { PVP.minShifts = 0; PVP.minAgeMs = 0; if (env.PVP_TEST_GRACE_MS) PVP.graceMs = Math.max(0, Number(env.PVP_TEST_GRACE_MS) || 0); }
  const pvp = new Pvp({ store: service.store, accounts, mines, shop, barn, avatars, now: service.now, randInt: pvpInt });
  const pvpSweep = setInterval(() => { try { pvp.sweep(); } catch (e) { console.error('[pvp] sweep', e); } }, 1000);
  pvpSweep.unref?.();
  const foff = new Foff({ store: service.store, accounts, shop, now: service.now });
  avatars.wearOf = (id) => shop.wearOf(id);
  barn.styleOf = (id) => shop.bugStyle(id);
  service.shop = shop;
  // v39 slots. SLOTS_TEST_FORCE (toot|stash|free) is honoured only with dev login, for the e2e recording.
  const slots = new Slots({ store: service.store, accounts, now: service.now, force: barnTest && ['toot', 'stash', 'free'].includes(env.SLOTS_TEST_FORCE) ? env.SLOTS_TEST_FORCE : null });
  service.slots = slots;
  // v44 blackjack (play money). BJ_TICK_MS=0 disables the clock (tests drive it).
  const bj = new Blackjack({ store: service.store, accounts, getPlayer: (id) => service.getPlayer(id), now: service.now, tickMs: env.BJ_TICK_MS !== undefined ? Number(env.BJ_TICK_MS) : 1000, avatars, barn });
  service.blackjack = bj;
  if (barnTest && Number(env.SLOTS_TEST_GAP_MS) >= 0 && env.SLOTS_TEST_GAP_MS) SLOTS.minGapMs = Number(env.SLOTS_TEST_GAP_MS); // e2e only: quicker API spins
  const market = new Market({ store: service.store, accounts, now: service.now, fetchImpl, sources: marketSources, snapshots: snapshots ?? (env.NODE_ENV === 'production' && !marketSources) });
  service.market = market; service.mines = mines; service.pvp = pvp; service.barn = barn; service.sessions = sessions;
  const guestAllowed = config.allowGuest;
  const slack = new SlackAlerts({ service, publicUrl: env.PUBLIC_URL || 'https://buffalobillsacademy.com',
    client: new SlackClient({ token: env.SLACK_BOT_TOKEN, baseUrl: env.SLACK_API_URL || undefined, fetchImpl: slackFetch || fetchImpl || globalThis.fetch, retryDelayMs: slackRetryMs ?? 1500 }), ...(slackSendRetryMs ? { retryMs: slackSendRetryMs } : {}) });
  service.slack = slack;
  service.onTableChanged = (t, actorId) => slack.tableChanged(t, actorId);
  // v48: blackjack turn DMs (same opt-in, dedupe, reminders, retries as poker)
  slack.bjSource = { all: () => Object.values(bj.doc?.tables || {}) };
  bj.onChange = (t, actorId) => slack.bjChanged(t, actorId);
  watchBlackjack(bj, telemetry);
  telemetry.backfill(service.store.players);
  mines.onShiftStart = (id, s, fare) => telemetry.shiftStart(id, s, fare);
  mines.onShiftEnd = (id, s, receipt) => telemetry.shiftEnd(id, s, receipt);
  slack.sweep();

  const api = express.Router();
  const needPlayer = (req, res, next) => (req.player ? next() : res.status(401).json({ error: 'Please sign in first' }));
  const wrap = (fn) => async (req, res) => {
    try { res.json((await fn(req, res)) ?? { ok: true }); } catch (e) {
      if (e instanceof GameError) res.status(e.status).json({ error: e.message, ...(e.code ? { code: e.code } : {}) });
      else { console.error(e); res.status(500).json({ error: 'Something went wrong' }); }
    }
  };
  api.use(auth);
  api.use((req, res, next) => { try { telemetry.hit(req); } catch { /* never block a request */ } next(); });

  const netWorth = (p) => {
    accounts.ensure(p);
    const holdings = market.holdingsValue(p);
    const chips = service.chipsInPlay(p.id);
    const riskEscrow = conquest.escrow(p);
    const barnEscrow = barn.escrow(p);
    return { bankroll: p.bankroll, holdings, chips, riskEscrow, barnEscrow, total: cents(p.bankroll + holdings + chips + riskEscrow + barnEscrow) };
  };
  const rooms = new Rooms({ store: service.store, shop, barn, avatars, netWorth });
  service.rooms = rooms;
  const meView = (p) => {
    accounts.ensure(p);
    return { id: p.id, name: p.name, kind: p.kind || 'guest', email: p.login?.email || p.google?.email || null, picture: p.google?.picture || null,
      username: p.login?.username || null, hasPassword: !!p.login?.hash, googleLinked: !!p.google && p.kind !== 'dev',
      signedIn: !!(p.google || p.login), bankroll: p.bankroll, worth: netWorth(p), broke: isBroke(p), minBuyIn: minBuyIn(), avatar: avatars.info(p), hasAvatar: !!p.avatar, slack: slack.status(p), foffWatched: foff.watched(p) };
  };
  const minBuyIn = () => cheapestBuyIn(service.store.allTables());
  const isBroke = (p) => brokeCheck({ bankroll: p.bankroll, holdings: market.holdingsValue(p), chipsInPlay: service.chipsInPlay(p.id) + barn.escrow(p), minBuyIn: minBuyIn() });
  // Adds `me.broke` to a table view: busted here, can't afford a rebuy, nothing left anywhere.
  const tableView = (code, p) => {
    const v = service.view(code, p);
    const s = v.me.seat !== null ? v.seats[v.me.seat] : null;
    let broke = false;
    if (p && s) {
      accounts.ensure(p);
      broke = bustedAndBroke({ busted: s.busted, econ: v.econ, bankroll: p.bankroll, holdings: market.holdingsValue(p), buyIn: v.settings.buyIn, otherChips: service.chipsInPlay(p.id, v.code) + barn.escrow(p) });
    }
    v.me = { ...v.me, broke };
    Object.assign(v, shop.tableInfo(v.code, p?.id));
    return v;
  };

  api.get('/health', (req, res) => res.json({ ok: true, time: service.now() }));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  api.get('/auth/config', (req, res) => res.json({ google: googleOn, password: true, dev: config.devLogin, guest: guestAllowed }));
  api.post('/players', wrap((req) => {
    if (!guestAllowed) throw new GameError('Please sign in first.', 403);
    return service.createPlayer(req.body?.name, { hidden: req.body?.hidden === true });
  }));
  // Attach an old name-only (browser token) player to the signed-in account, keeping its tables and chips.
  api.post('/auth/claim-legacy', needPlayer, wrap((req) => {
    const legacy = service.playerFromToken(req.body?.token);
    const me = req.player;
    if (!legacy || legacy.id === me.id) return { merged: false, me: meView(me) };
    if (legacy.google || legacy.login) throw new GameError('That player already belongs to another account.', 409);
    if (!req.sessionId || !(me.google || me.login)) throw new GameError('Sign in first.', 401);
    const fresh = !me.barnBouts && !conquest.hasHistory(me) && !service.store.allTables().some((t) => t.ledger[me.id]) && (me.txns || []).every((x) => x.type === 'start') && !Object.keys(me.holdings || {}).length;
    if (!fresh) return { merged: false, me: meView(me), reason: 'Your signed-in account already has history, so the old player was left as is.' };
    rooms.forget(me.id);
    if (me.google) legacy.google = me.google;
    if (me.login) legacy.login = me.login;
    legacy.kind = me.kind;
    avatars.move(me, legacy);
    sessions.reassign(me.id, legacy.id);
    service.forgetPlayer(me.id);
    accounts.ensure(legacy); accounts.save();
    return { merged: true, me: meView(legacy) };
  }));
  api.get('/me', needPlayer, wrap((req) => ({ ...meView(req.player), ...(isAdmin(req, adminCfg) ? { admin: true } : {}) })));
  api.patch('/me', needPlayer, wrap((req) => {
    const b = req.body || {};
    if (b.username != null) service.changeUsername(req.player, b.username);
    if (b.name != null) service.renamePlayer(req.player, b.name);
    if (b.username == null && b.name == null) throw new GameError('Send a name or username to change.', 400);
    return meView(req.player);
  }));
  api.get('/my-tables', needPlayer, wrap((req) => service.tablesFor(req.player)));
  api.get('/public-tables', needPlayer, wrap((req) => service.publicTables(req.player)));
  api.post('/tables', needPlayer, wrap((req) => {
    const t = service.createTable(req.player, req.body || {});
    return { code: t.code };
  }));
  api.get('/tables/:code', wrap((req) => tableView(req.params.code, req.player)));
  const tableAction = (name, fn) => api.post(`/tables/:code/${name}`, needPlayer, wrap((req) => {
    fn(req.params.code.toUpperCase(), req.player, req.body || {});
    return tableView(req.params.code, req.player);
  }));
  tableAction('join', (c, p, b) => service.join(c, accounts.ensure(p), b.seat));
  tableAction('start', (c, p) => service.start(c, p));
  tableAction('settings', (c, p, b) => service.updateSettings(c, p, b));
  tableAction('action', (c, p, b) => service.act(c, p, { type: b.type, amount: b.amount === undefined ? undefined : Number(b.amount), handNumber: b.handNumber }));
  tableAction('rebuy', (c, p) => service.rebuy(c, accounts.ensure(p)));
  tableAction('sitout', (c, p, b) => service.sitOut(c, p, b.sitOut !== false));
  tableAction('autocheck', (c, p, b) => service.autoCheck(c, p, b.on !== false)); // v42
  tableAction('leave', (c, p) => service.leave(c, p));
  tableAction('show', (c, p, b) => service.show(c, p, b.which, b.handNumber));
  tableAction('showdown-seen', (c, p, b) => service.showdownSeen(c, p, b.number)); // v49
  tableAction('say', (c, p, b) => service.say(c, p, typeof b.text === 'string' ? b.text : ''));
  tableAction('close', (c, p) => service.close(c, p));
  // Fight Guntrad (big blind side game). Money only moves on the server, from a re-simulated replay.
  tableAction('fight/start', (c, p) => service.fightStart(c, p));
  tableAction('fight/decline', (c, p) => service.fightDecline(c, p));
  tableAction('fight/forfeit', (c, p, b) => service.fightForfeit(c, p, typeof b.id === 'string' ? b.id : null));
  tableAction('fight/finish-him', (c, p, b) => service.fightFinishHim(c, p, typeof b.id === 'string' ? b.id : ''));
  tableAction('fight/submit', (c, p, b) => service.fightSubmit(c, p, { id: String(b.id || ''), log: b.log, frames: b.frames }));
  api.post('/tables/:code/fight/stream', needPlayer, wrap((req) => service.fightStream(req.params.code.toUpperCase(), req.player, { id: String(req.body?.id || ''), from: req.body?.from, log: req.body?.log, frame: req.body?.frame })));
  api.get('/tables/:code/fight/watch', wrap((req) => service.fightWatch(req.params.code.toUpperCase(), req.query.since)));

  // Server-Sent Events: pushes the table's version number whenever it changes; the client then re-fetches its own view.
  api.get('/tables/:code/events', (req, res) => {
    let t;
    try { t = service.getTable(req.params.code); } catch (e) { return res.status(404).end(); }
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = (v, extra) => res.write(`data: ${JSON.stringify({ version: v, ...extra })}\n\n`);
    send(t.version);
    const unsub = service.subscribe(t.code, send);
    // A signed-in player's page in front counts as being at the table; a page in the background listens with ?away.
    const leave = req.player && !('away' in req.query) ? service.enter(t.code, req.player.id) : null;
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); unsub(); leave?.(); });
  });
  // ----- profile & leaderboard -----
  const gamesFor = (pid, publicOnly = false) => service.store.allTables().filter((t) => t.ledger[pid] && (!publicOnly || t.visibility === 'public')).map((t) => {
    const l = t.ledger[pid];
    const i = t.seats.findIndex((s) => s && s.playerId === pid);
    const hp = t.hand?.players?.[i];
    const onTable = i >= 0 ? t.seats[i].stack + (hp?.playerId === pid ? (hp.total || 0) + (t.hand.blinds?.[i] || 0) : 0) : 0;
    return { code: t.code, name: t.name, status: t.status, economy: !!t.econ, buyIn: l.buyIn, cashOut: l.cashOut, onTable, net: onTable + l.cashOut - l.buyIn, createdAt: t.createdAt, hands: t.handNumber };
  }).sort((a, b) => b.createdAt - a.createdAt);
  const profile = (p, { self }) => {
    accounts.ensure(p);
    const games = gamesFor(p.id);
    const st = p.stats;
    const port = market.portfolio(p);
    const unrealized = Object.values(port.holdings).reduce((a, h) => a + (h.unrealized || 0), 0);
    const worth = netWorth(p);
    if (!self) { delete worth.riskEscrow; delete worth.barnEscrow; }
    return {
      id: p.id, name: p.name, picture: p.google?.picture || null, avatar: avatars.info(p), kind: p.kind || 'guest', since: p.createdAt,
      ...(self ? { email: p.login?.email || p.google?.email || null, username: p.login?.username || null, txns: (p.txns || []).slice(-40).reverse() } : {}),
      worth,
      poker: { lifetimeNet: games.reduce((a, g) => a + g.net, 0), gamesPlayed: games.length, games: self ? games : gamesFor(p.id, true), handsPlayed: st.handsPlayed, handsWon: st.handsWon,
        winRate: st.handsPlayed ? st.handsWon / st.handsPlayed : 0, biggestPot: st.biggestPot },
      mining: { shifts: p.mining.shifts, earned: p.mining.earned, best: p.mining.best, jackpots: p.mining.jackpots, history: p.mining.history.slice(-12).reverse().map(({ t, outcome, amount }) => ({ t, outcome, amount })) }, // v38: shift times are stored, not shown
      invest: { ...port, unrealized: cents(unrealized), pnl: cents(unrealized + port.realized) },
    };
  };
  api.get('/profile', needPlayer, wrap((req) => profile(req.player, { self: true })));
  api.get('/players/:id/profile', wrap((req) => {
    const p = service.getPlayer(req.params.id);
    if (!p || p.hidden) throw new GameError('No such player', 404);
    return { ...profile(p, { self: req.player?.id === p.id }), roomVisitAvailable: !!((req.player?.google || req.player?.login) && rooms.isOpen(p.id)) };
  }));
  api.get('/leaderboard', wrap(async (req) => {
    const sort = req.query.sort ?? 'wealth';
    const direction = req.query.direction ?? 'desc';
    if (!['wealth', 'earnings', 'mining', 'poker', 'blackjack', 'slots', 'investing'].includes(sort) || !['asc', 'desc'].includes(direction)) {
      throw new GameError('Choose a leaderboard category and sort direction.', 400);
    }
    await market.quotes().catch(() => null); // refresh prices (cached 60s)
    const rows = Object.values(service.store.players)
      .filter((p) => !p.hidden && typeof p.bankroll === 'number' && (googleOn ? (p.google || p.login) : true))
      .map((p) => {
        const { riskEscrow: _privateRiskEscrow, barnEscrow: _privateBarnEscrow, ...worth } = netWorth(p);
        const blackjack = bj.earnings(p.id);
        const slotLife = slots.doc.players[p.id]?.life;
        const earnings = {
          mining: p.mining?.earned || 0,
          poker: cents(gamesFor(p.id).filter((g) => g.economy).reduce((sum, g) => sum + g.net, 0)),
          blackjack: blackjack.net,
          slots: cents((slotLife?.won || 0) - (slotLife?.wagered || 0)),
          investing: p.invest?.realized || 0,
        };
        earnings.total = cents(Object.values(earnings).reduce((sum, value) => sum + value, 0));
        return { id: p.id, name: p.name, picture: p.google?.picture || null, avatar: avatars.info(p), ...worth, earnings, blackjackPartial: blackjack.partial, hands: p.stats?.handsPlayed || 0, shifts: p.mining?.shifts || 0 };
      })
      .sort((a, b) => {
        const value = (r) => sort === 'wealth' ? r.total : r.earnings[sort === 'earnings' ? 'total' : sort];
        return (direction === 'asc' ? 1 : -1) * (value(a) - value(b)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      });
    return { rows: rows.slice(0, 200), me: req.player?.id || null, googleOnly: googleOn, sort, direction };
  }));

  // Room views are permission-checked snapshots, never reusable public profile/store responses.
  api.use('/room', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.get('/room', needPlayer, wrap((req) => rooms.owner(req.player)));
  api.patch('/room/layout', needPlayer, wrap((req) => rooms.saveLayout(req.player, req.body)));
  api.get('/players/:id/room', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, needPlayer,
    wrap((req) => rooms.visit(req.player, service.getPlayer(req.params.id))));

  // ----- Acid Mines -----
  api.get('/fawn', needPlayer, wrap((req) => fawn.status(accounts.ensure(req.player))));
  api.post('/fawn/claim', needPlayer, wrap((req) => fawn.claim(accounts.ensure(req.player))));
  api.get('/mines/office', needPlayer, wrap((req) => mines.office(req.player)));
  api.post('/foff/claim', needPlayer, wrap((req) => foff.claim(accounts.ensure(req.player))));
  api.post('/foff/quest', needPlayer, wrap((req) => foff.quest(accounts.ensure(req.player), String(req.body?.id || ''))));
  api.post('/foff/watched', needPlayer, wrap((req) => foff.markWatched(req.player)));
  api.post('/mines/nephew', needPlayer, wrap((req) => mines.sendNephew(accounts.ensure(req.player))));
  api.post('/mines/start', needPlayer, wrap((req) => mines.start(accounts.ensure(req.player), req.body)));
  api.post('/mines/probe', needPlayer, wrap((req) => mines.probe(accounts.ensure(req.player), req.body?.shiftId, req.body)));
  api.post('/mines/extract', needPlayer, wrap((req) => mines.extract(accounts.ensure(req.player), req.body?.shiftId, req.body)));
  api.post('/mines/egg', needPlayer, wrap((req) => mines.takeEgg(accounts.ensure(req.player), String(req.body?.shiftId || ''))));
  // ----- the Barn (v30) -----
  api.get('/barn', needPlayer, wrap((req) => barn.view(req.player.id)));
  api.post('/barn/care', needPlayer, wrap((req) => barn.care(req.player.id, String(req.body?.action || ''))));
  api.patch('/barn/battle', needPlayer, wrap((req) => barn.setBattle(req.player.id, req.body)));
  api.post('/barn/bout', needPlayer, wrap((req) => barn.bout(req.player.id)));
  api.post('/barn/bouts', needPlayer, wrap((req) => barn.openBout(req.player.id, req.body)));
  api.post('/barn/bouts/:id/join', needPlayer, wrap((req) => barn.joinBout(req.player.id, req.params.id, req.body)));
  api.delete('/barn/bouts/:id', needPlayer, wrap((req) => barn.cancelBout(req.player.id, req.params.id)));
  api.post('/barn/bury', needPlayer, wrap((req) => barn.bury(req.player.id)));
  api.post('/mines/quit', needPlayer, wrap((req) => { pvp.forfeit(req.player.id); return mines.quit(accounts.ensure(req.player), req.body?.shiftId, req.body); })); // clocking out mid-battle forfeits it
  // v71: the shared daily mine (server/pvp.js). The browser reports its position; the server decides who saw whom.
  api.post('/mines/pvp/tick', needPlayer, wrap((req) => pvp.tick(accounts.ensure(req.player), req.body || {})));
  api.post('/mines/pvp/ambush', needPlayer, wrap((req) => pvp.ambush(accounts.ensure(req.player), req.body || {})));
  api.post('/mines/pvp/move', needPlayer, wrap((req) => pvp.move(accounts.ensure(req.player), req.body || {})));
  api.post('/mines/pvp/forfeit', needPlayer, wrap((req) => { const b = pvp.forfeit(req.player.id); return b ? { battle: pvp.battleView(b, req.player.id) } : { battle: null }; }));
  api.get('/mines/foreman', needPlayer, wrap((req) => foreman.view(req.player.id)));
  api.post('/mines/foreman/answer', needPlayer, wrap((req) => foreman.answer(accounts.ensure(req.player), String(req.body?.id || ''), req.body?.answer)));
  api.post('/mines/finish', needPlayer, wrap((req) => mines.finish(accounts.ensure(req.player), req.body?.shiftId, req.body)));

  // ----- investing (play money) -----
  api.get('/market', wrap(async (req) => ({ quotes: await market.quotes(), portfolio: req.player ? market.portfolio(accounts.ensure(req.player)) : null, bankroll: req.player?.bankroll ?? null })));
  api.post('/market/buy', needPlayer, wrap((req) => market.buy(accounts.ensure(req.player), String(req.body?.sym), req.body?.usd)));
  api.post('/market/sell', needPlayer, wrap((req) => market.sell(accounts.ensure(req.player), String(req.body?.sym), { units: req.body?.units, all: req.body?.all === true })));

  // ----- deleting an account -----
  // Refused while seated at an open table (chips there are real bankroll money). Removes the player record,
  // their sessions, avatar file and any mine shift. Table ledgers keep the name for past results.
  function deletePlayer(p) {
    barn.expireBouts();
    if (p.barnBouts?.open) throw new GameError('Cancel your open barn bout before deleting your account.', 409);
    if (conquest.hasPending(p)) throw new GameError('Wait for your Risk bets to settle before deleting your account.', 409);
    if (conquest.data(p).link?.active) throw new GameError('Unlink ConquestK on the Risk bets page before deleting your account.', 409);
    if (conquest.data(p).pendingLink || conquest.linkChanges.has(p.id)) throw new GameError('Finish or unlink your pending ConquestK account link before deleting your account.', 409);
    if (conquest.hasRetainedHistory(p)) throw new GameError('Risk account history must be retained. Contact the Academy operator to anonymize your account.', 409);
    const seated = service.store.allTables().some((t) => t.status !== 'closed' && t.seats.some((x) => x && x.playerId === p.id)) || bj.seatedOpen(p.id);
    if (seated) throw new GameError('Leave your tables first, then delete your account.', 409);
    rooms.forget(p.id);
    try { fs.unlinkSync(avatars.file(p.id)); } catch { /* no photo */ }
    pvp.forget(p.id); mines.forget(p.id);
    barn.forget(p.id); foreman.forget(p.id); shop.forget(p.id); slots.forget(p.id); foff.forget(p.id);
    for (const [k, x] of Object.entries(sessions.doc.sessions)) if (x.playerId === p.id) delete sessions.doc.sessions[k];
    sessions.save();
    service.forgetPlayer(p.id); // also drops a guest's browser token, so it stops working right away
  }
  api.delete('/me', needPlayer, wrap(async (req, res) => {
    const p = req.player;
    if (req.body?.confirm !== 'DELETE') throw new GameError('Type DELETE to confirm.', 400);
    if (p.login?.hash && !(await verifyPassword(String(req.body?.password || ''), p.login.hash))) throw new GameError('That password is not right.', 401);
    deletePlayer(p);
    res.setHeader('Set-Cookie', 'bba_sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure');
    return { deleted: true };
  }));
  // Operator path, no network surface: put a JSON list of usernames/ids in <data>/admin-delete.json and
  // restart; each is deleted with the same rules as above on boot and the file is renamed to *.done.
  (function pendingDeletes() {
    const f = path.join(service.store.dir, 'admin-delete.json');
    if (!fs.existsSync(f)) return;
    let list = [];
    try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { list = []; }
    const results = (Array.isArray(list) ? list : []).map((key) => {
      const k = String(key).toLowerCase();
      const p = service.store.players[key] || Object.values(service.store.players).find((x) => x.login?.username === k);
      if (!p) return `${key}: not found`;
      try { deletePlayer(p); return `${key}: deleted`; } catch (e) { return `${key}: kept (${e.message})`; }
    });
    console.log('[admin-delete]', results.join('; '));
    fs.writeFileSync(`${f}.done`, JSON.stringify({ at: service.now(), results }, null, 2));
    fs.unlinkSync(f);
  })();

  // ----- Slack turn alerts -----
  api.get('/me/slack', needPlayer, wrap((req) => (req.query.check ? slack.check(req.player) : slack.status(req.player))));
  api.post('/me/slack/prefs', needPlayer, wrap((req) => slack.setOn(req.player, req.body?.on !== false)));
  api.post('/me/slack', needPlayer, wrap((req) => slack.connect(req.player, req.body?.email)));
  api.delete('/me/slack', needPlayer, wrap((req) => slack.disconnect(req.player)));
  api.post('/me/slack/test', needPlayer, wrap((req) => slack.test(req.player)));

  // ----- the General Store (play money only) -----
  // test hook (local dev server only, and only with SHOP_TEST_CASH=1): set your own play-money bankroll for the e2e
  if (barnTest && Number(env.SMOKE_TEST_GAP_MS) > 0) SMOKE.gapMs = Number(env.SMOKE_TEST_GAP_MS); // e2e only: shorter tobacco queue gap
  if (barnTest && env.SHOP_TEST_CASH === '1') api.post('/dev/cash', needPlayer, wrap((req) => { const p = accounts.ensure(req.player); const want = Math.max(0, Math.floor(Number(req.body?.to) || 0)); accounts.change(p, want - p.bankroll, 'dev', 'e2e cash'); return { bankroll: p.bankroll }; }));
  // test hook (local dev server only, BARN_TEST_SPECIES=1): swap your own hatched bug's species, so the e2e can page every Field notes sheet
  if (barnTest && env.BARN_TEST_SPECIES === '1') api.post('/dev/species', needPlayer, wrap((req) => { const pen = barn.doc.pens[req.player.id]; const id = String(req.body?.id || ''); if (!pen || !BUGS.some((b) => b.id === id)) throw new GameError('no', 400); pen.species = id; barn.save(); return { species: id }; }));
  api.get('/bj', needPlayer, wrap((req) => ({ ...bj.info(), tables: bj.list(req.player) })));
  api.post('/bj/preview', needPlayer, wrap((req) => bj.preview(req.body?.settings || {})));
  api.post('/bj/tables', needPlayer, wrap((req) => bj.create(req.player, req.body || {})));
  api.get('/bj/tables/:code', needPlayer, wrap((req) => bj.view(req.player, req.params.code)));
  for (const [path, fn] of Object.entries({ join: (p, c, b) => bj.join(p, c, b?.ack === true), start: (p, c) => bj.start(p, c), leave: (p, c) => bj.leave(p, c), close: (p, c) => bj.close(p, c), sitout: (p, c) => bj.sitOut(p, c),
    bet: (p, c, b) => bj.bet(p, c, b), sneak: (p, c, b) => bj.sneak(p, c, b), insure: (p, c, b) => bj.insure(p, c, b?.yes), act: (p, c, b) => bj.act(p, c, b?.action), house: (p, c, b) => bj.setHouse(p, c, b?.playerId) })) {
    api.post(`/bj/tables/:code/${path}`, needPlayer, wrap((req) => fn(req.player, req.params.code, req.body || {})));
  }
  api.get('/slots', needPlayer, wrap((req) => slots.view(req.player)));
  api.post('/slots/spin', needPlayer, wrap((req) => slots.spin(req.player, req.body?.bet)));
  api.post('/slots/end', needPlayer, wrap((req) => slots.end(req.player)));
  if (barnTest) api.post('/dev/slots-force', needPlayer, wrap((req) => { const f = String(req.body?.force || ''); slots.force = ['toot', 'stash', 'free'].includes(f) ? f : null; slots.lastAt.clear(); return { force: slots.force }; }));
  api.get('/shop', needPlayer, wrap((req) => shop.view(req.player)));
  api.post('/shop/buy', needPlayer, wrap((req) => shop.buy(req.player, String(req.body?.id || ''), { confirm: req.body?.confirm === true })));
  api.post('/shop/equip', needPlayer, wrap((req) => shop.equip(req.player, { id: req.body?.id == null ? null : String(req.body.id), slot: String(req.body?.slot || '') })));
  api.post('/shop/use', needPlayer, wrap((req) => shop.use(req.player, String(req.body?.id || ''))));
  api.post('/shop/fit', needPlayer, wrap((req) => { const b = req.body || {}; return shop.setFit(req.player, { id: String(b.id || ''), x: b.x, y: b.y, s: b.s, reset: b.reset === true }); }));
  // v36: gags (formerly pranks). The old /pranks routes stay as aliases for clients still open from before.
  const optOut = wrap((req) => shop.setNoGags(req.player, req.body?.optOut === true));
  const fireGag = wrap((req) => {
    const t = service.getTable(req.params.code);
    const ev = shop.gag(t, req.player, { item: String(req.body?.item || ''), target: String(req.body?.target || '') });
    service.mutate(t.code, (tb, ctx) => recordTableMoment(tb, 'gag', { ...ev, name: ITEM[ev.item].name }, ctx), req.player.id);
    service.push(t.code, { gag: ev });
    return { ok: true, gag: ev };
  });
  const hostGags = wrap((req) => {
    const t = service.getTable(req.params.code);
    shop.setTableOff(t, req.player, req.body?.off === true);
    service.push(t.code, { gagsOff: req.body?.off === true });
    return tableView(t.code, req.player);
  });
  // v37: tobacco moments (one-time use; queued one a minute per table; kept 24h so each viewer sees it once).
  api.post('/me/smoke', needPlayer, wrap((req) => shop.setNoSmoke(req.player, req.body?.optOut === true)));
  api.post('/tables/:code/smoke', needPlayer, wrap((req) => {
    const t = service.getTable(req.params.code);
    const ev = shop.smoke(t, req.player, { item: String(req.body?.item || '') });
    service.mutate(t.code, (tb, ctx) => recordTableMoment(tb, 'smoke', ev, ctx), req.player.id);
    service.push(t.code, { smoke: ev });
    return { ok: true, smoke: ev };
  }));
  // v52: spectacles (one-time use, the whole table watches; follows the gag switches).
  api.post('/tables/:code/spectacle', needPlayer, wrap((req) => { // (not /show: that one shows your cards)
    const t = service.getTable(req.params.code);
    const ev = shop.spectacle(t, req.player, { item: String(req.body?.item || '') });
    service.mutate(t.code, (tb, ctx) => recordTableMoment(tb, 'show', ev, ctx), req.player.id);
    service.push(t.code, { show: ev });
    return { ok: true, show: ev };
  }));
  api.post('/tables/:code/tobacco', needPlayer, wrap((req) => {
    const t = service.getTable(req.params.code);
    shop.setSmokeOff(t, req.player, req.body?.off === true);
    service.push(t.code, { smokeOff: req.body?.off === true });
    return tableView(t.code, req.player);
  }));
  api.post('/me/gags', needPlayer, optOut); api.post('/me/pranks', needPlayer, optOut);
  api.post('/tables/:code/gag', needPlayer, fireGag); api.post('/tables/:code/prank', needPlayer, fireGag);
  api.post('/tables/:code/gags', needPlayer, hostGags); api.post('/tables/:code/pranks', needPlayer, hostGags);

  // ----- avatars -----
  api.post('/me/avatar', needPlayer, wrap((req) => {
    const b = req.body || {};
    if (b.kind === 'photo') return { avatar: avatars.setPhoto(req.player, b.png) };
    if (b.kind === 'gen') return { avatar: avatars.setGenerated(req.player, b.seed) };
    throw new GameError('Choose a photo avatar or a generated one.');
  }));
  api.delete('/me/avatar', needPlayer, wrap((req) => { avatars.remove(req.player); return { avatar: avatars.info(req.player) }; }));
  api.get('/avatars/:id.png', (req, res) => {
    const buf = avatars.read(req.params.id);
    if (!buf) return res.status(404).json({ error: 'No avatar' });
    res.set('cache-control', 'public, max-age=86400').type('png').send(buf);
  });
  // The dealer: a low-poly cut-out made from a photo Tyler supplied. Only the low-poly version is deployed.
  const dealerPath = dealerFile || path.join(import.meta.dirname, 'assets', 'dealer.png');
  api.get('/dealer.png', (req, res) => (fs.existsSync(dealerPath) ? res.set('cache-control', 'public, max-age=86400').type('png').sendFile(dealerPath) : res.status(404).json({ error: 'No dealer' })));

  const geo = new Geo({ store: service.store, now: service.now, fetchImpl: geoFetch !== undefined ? geoFetch : (env.ADMIN_GEO === '0' ? null : globalThis.fetch) });
  mountAdmin({ api, wrap, telemetry, geo, cfg: adminCfg, getCtx: () => ({
    now: service.now(), players: service.store.players, ledger: telemetry.readLedger(), events: telemetry.readEvents(), access: telemetry.doc, worth: netWorth,
    docs: { mines: mines.doc, pvp: pvp.doc, fawn: fawn.doc, foff: foff.doc, slots: slots.doc, blackjack: bj.doc, sessions: sessions.doc } }) });
  mountConquest({ app, api, conquest, auth, wrap });
  api.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use('/api', api);

  app.get('/privacy', (req, res) => res.type('html').send(PRIVACY_HTML));
  app.get('/terms', (req, res) => res.type('html').send(TERMS_HTML));
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    // The mine door's game files (v27) are big and Fly's proxy doesn't compress: gzip them once, keep them in memory,
    // and serve them with a size hint for the progress bar. Only these fixed names; anything else falls through.
    const doomDir = path.join(staticDir, 'doom');
    const DOOM_GZ = { 'websockets-doom.wasm': 'application/wasm', 'websockets-doom.js': 'text/javascript; charset=utf-8', 'freedoom1.wad': 'application/octet-stream' };
    const doomCache = new Map();
    app.get('/doom/:file', (req, res, next) => {
      const type = DOOM_GZ[req.params.file];
      if (!type || !/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
      let hit = doomCache.get(req.params.file);
      if (!hit) {
        const f = path.join(doomDir, req.params.file);
        if (!fs.existsSync(f)) return next();
        const raw = fs.readFileSync(f);
        hit = { gz: zlib.gzipSync(raw, { level: 9 }), size: raw.length, etag: `"${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)}"` };
        doomCache.set(req.params.file, hit);
      }
      if (req.headers['if-none-match'] === hit.etag) return res.status(304).end();
      res.set({ 'Content-Type': type, 'Content-Encoding': 'gzip', 'Content-Length': hit.gz.length, 'X-Bba-Size': hit.size, ETag: hit.etag, Vary: 'Accept-Encoding', 'Cache-Control': 'public, max-age=86400' });
      res.end(hit.gz);
    });
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  } else {
    app.get('/', (req, res) => res.type('text').send('API is running. Build the web app with `npm run build` to play in the browser.'));
  }
  const shutdown = () => { telemetry.shutdown(); clearInterval(pvpSweep); conquest.shutdown(); service.shutdown(); market.shutdown(); slack.shutdown(); };
  return { app, service, shutdown, bj, telemetry };
}
