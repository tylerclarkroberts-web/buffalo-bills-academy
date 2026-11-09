import crypto from 'node:crypto';
import { GameError } from './engine/game.js';

export const RISK_LIMITS = Object.freeze({ minStakeCents: 100, maxStakeCents: 10000, maxGrossCents: 100000, marketGrossCents: 1000000, totalGrossCents: 2500000 });
const MODEL = 'cr-strength-v1';
const ACTIVE = new Set(['pending', 'accepted']);
const STATES = new Set([...ACTIVE, 'won', 'lost', 'void', 'rejected']);
const MARKET_STATES = new Set(['open', 'closed', 'started', 'settled', 'void']);
const hash = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
const text = (v) => typeof v === 'string' && v.length > 0 && v.length <= 512;
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const date = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const fail = (message, status = 400, code = 'risk_invalid') => { const e = new GameError(message, status); e.code = code; return e; };
const unavailable = () => fail('Risk betting is temporarily unavailable. Your existing bets are kept safely for recovery.', 503, 'risk_unavailable');
const iso = (t) => new Date(t).toISOString();
const termsEqual = (a, b) => !!b && Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
const sameRoster = (a, b) => a.length === b.length && a.every((p) => b.some((q) => q.userId === p.userId && q.rating === p.rating));

export function validLink(link) {
  return !!link && text(link.id) && integer(link.version) && text(link.academyPlayerId) && text(link.conquestUserId) && typeof link.conquestName === 'string' && typeof link.active === 'boolean';
}
export function validMarket(m) {
  return !!m && text(m.id) && text(m.gameId) && integer(m.generation) && integer(m.version) && MARKET_STATES.has(m.status)
    && typeof m.gameName === 'string' && text(m.gameUrl) && date(m.openedAt) && date(m.closesAt) && date(m.expiresAt)
    && (m.startedAt === null || date(m.startedAt)) && Array.isArray(m.participants) && m.participants.length >= 2
    && m.participants.every((p) => text(p.userId) && typeof p.name === 'string' && Number.isSafeInteger(p.rating))
    && new Set(m.participants.map((p) => p.userId)).size === m.participants.length
    && (m.terminal === null ? !['settled', 'void'].includes(m.status) : (['winner', 'void'].includes(m.terminal?.kind) && date(m.terminal.finalizedAt)
      && (m.terminal.kind === 'winner' ? m.status === 'settled' : m.status === 'void')
      && typeof m.terminal.reason === 'string' && (m.terminal.kind === 'void' ? m.terminal.winnerUserId === null : m.participants.some((p) => p.userId === m.terminal.winnerUserId))));
}
function validTerms(t) {
  return !!t && ['academyPlayerId', 'conquestUserId', 'linkId', 'marketId', 'outcomeUserId'].every((k) => text(t[k]))
    && integer(t.linkVersion) && integer(t.marketVersion) && t.modelVersion === MODEL
    && integer(t.stakeCents) && t.stakeCents >= RISK_LIMITS.minStakeCents && t.stakeCents <= RISK_LIMITS.maxStakeCents
    && integer(t.oddsHundredths) && t.oddsHundredths >= 101 && t.oddsHundredths <= 2000
    && integer(t.grossCents) && t.grossCents === Math.floor(t.stakeCents * t.oddsHundredths / 100) && t.grossCents <= RISK_LIMITS.maxGrossCents;
}
function validConquest(p) {
  const c = p.conquest;
  if (c === undefined) return true;
  if (!c || typeof c !== 'object' || Array.isArray(c) || !c.bets || typeof c.bets !== 'object' || Array.isArray(c.bets)) return false;
  if (c.link !== null && (!validLink(c.link) || c.link.academyPlayerId !== p.id)) return false;
  if (c.pendingLink !== null && (!c.pendingLink || !text(c.pendingLink.state) || !text(c.pendingLink.sessionHash) || !date(c.pendingLink.expiresAt))) return false;
  if (c.linkReceipt && (!text(c.linkReceipt.stateHash) || !text(c.linkReceipt.codeHash) || !text(c.linkReceipt.sessionHash))) return false;
  return Object.entries(c.bets).every(([id, b]) => text(id) && b.id === id && STATES.has(b.state) && date(b.createdAt)
    && validTerms(b.terms) && b.terms.academyPlayerId === p.id && validMarket(b.market)
    && b.terms.marketId === b.market.id && b.terms.marketVersion === b.market.version
    && b.market.participants.some((x) => x.userId === b.terms.outcomeUserId)
    && (b.state === 'pending' ? b.admission === null : (b.admission?.intentId === id && date(b.admission.decidedAt)
      && b.admission.status === (b.state === 'rejected' ? 'rejected' : 'accepted') && termsEqual(b.terms, b.admission.terms)))
    && (!['won', 'lost', 'void'].includes(b.state) || (date(b.terminal?.finalizedAt)
      && (b.state === 'void' ? b.terminal.kind === 'void' && b.terminal.winnerUserId === null
        : b.terminal.kind === 'winner' && b.market.participants.some((x) => x.userId === b.terminal.winnerUserId)
          && (b.state === 'won') === (b.terminal.winnerUserId === b.terms.outcomeUserId)))));
}

export function riskOdds(market) {
  const highest = Math.max(...market.participants.map((p) => p.rating));
  const weights = market.participants.map((p) => 10 ** ((p.rating - highest) / 400));
  const total = weights.reduce((a, b) => a + b, 0);
  return market.participants.map((p, i) => {
    const probability = weights[i] / total;
    const oddsHundredths = Math.floor(Math.min(20, 0.95 / probability) * 100);
    return { ...p, probability, oddsHundredths: oddsHundredths < 101 ? null : oddsHundredths,
      maxStakeCents: oddsHundredths < 101 ? 0 : Math.min(RISK_LIMITS.maxStakeCents, Math.floor(RISK_LIMITS.maxGrossCents * 100 / oddsHundredths)) };
  });
}

export class Conquest {
  constructor({ service, sessions, env, fetchImpl = globalThis.fetch, pollMs = 10000 }) {
    this.service = service; this.store = service.store; this.accounts = service.accounts; this.sessions = sessions;
    this.now = service.now; this.fetchImpl = fetchImpl;
    this.url = (env.CONQUESTK_URL || 'https://conquestk.com').replace(/\/$/, '');
    this.publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
    this.token = env.CONQUESTK_SERVICE_TOKEN || '';
    this.enabled = ['true', '1'].includes(env.CONQUESTK_BETTING_ENABLED);
    this.pilot = new Set((env.CONQUESTK_PILOT_PLAYER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
    this.quotes = new Map(); this.linkChanges = new Set(); this.failures = new Map(); this.markets = []; this.connected = false; this.lastRefresh = 0; this.fault = null;
    try {
      if (this.token && this.token.length < 32) throw new Error('ConquestK service token must contain at least 32 characters');
      const target = new URL(this.url);
      if (target.pathname !== '/' || target.search || target.hash || target.username || target.password
        || (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)))) throw new Error('Invalid ConquestK origin');
      for (const p of Object.values(this.store.players)) if (!validConquest(p)) throw new Error('Invalid stored ConquestK ledger');
    } catch (e) { this.fault = e.message; console.error('ConquestK integration disabled:', e.message); }
    if (this.token && pollMs > 0) {
      this.timer = setInterval(() => { void this.reconcile(); }, pollMs); this.timer.unref?.();
      queueMicrotask(() => { void this.reconcile(); });
    }
  }
  shutdown() { clearInterval(this.timer); }
  configured() { return !!this.token && !this.fault; }
  canPlace(p) { return this.configured() && this.enabled && !!p && (!this.pilot.size || this.pilot.has(p.id)); }
  checkStorage() { if (this.fault) throw unavailable(); }
  data(p) { return p.conquest || { link: null, pendingLink: null, bets: {} }; }
  allBets() { return Object.values(this.store.players).flatMap((p) => Object.values(this.data(p).bets).map((bet) => ({ p, bet }))); }
  hasPending(p) { return !validConquest(p) || Object.values(this.data(p).bets).some((b) => ACTIVE.has(b.state)); }
  hasHistory(p) { return !!p.conquest && (!!p.conquest.link || !!p.conquest.pendingLink || Object.keys(p.conquest.bets || {}).length > 0); }
  escrow(p) { return validConquest(p) ? Object.values(this.data(p).bets).filter((b) => ACTIVE.has(b.state)).reduce((sum, b) => sum + b.terms.stakeCents, 0) / 100 : 0; }
  draft(p) { return { ...p, txns: [...(p.txns || [])], conquest: structuredClone(this.data(p)) }; }
  commit(drafts) {
    this.checkStorage();
    try { this.store.commitPlayerDrafts(drafts); }
    catch (e) { this.fault = 'Risk ledger write failed'; console.error('ConquestK ledger write failed:', e.message); throw unavailable(); }
  }
  move(draft, amountCents, type, note) {
    const balance = Math.round(draft.bankroll * 100);
    if (!integer(balance) || !Number.isSafeInteger(balance + amountCents) || balance + amountCents < 0) throw fail('There is not enough spendable play money for this bet.', 402);
    draft.bankroll = (balance + amountCents) / 100;
    this.accounts.log(draft, type, amountCents / 100, note);
  }
  async request(method, path, body) {
    if (!this.configured()) throw unavailable();
    let response;
    try {
      response = await this.fetchImpl(`${this.url}/api/integrations/academy/v1${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { this.connected = false; throw unavailable(); }
    let data;
    try { data = await response.json(); } catch { throw unavailable(); }
    if (!response.ok) throw fail(typeof data?.error === 'string' ? data.error : 'ConquestK could not complete that request.', response.status === 404 ? 404 : 503, data?.code || 'risk_remote');
    this.connected = true;
    return data;
  }
  checkMarket(m) {
    if (!validMarket(m) || new URL(m.gameUrl, this.url).origin !== new URL(this.url).origin) throw unavailable();
    return { ...m, gameUrl: new URL(m.gameUrl, this.url).href };
  }
  async refreshMarkets() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const result = await this.request('GET', '/markets');
      if (!Array.isArray(result.markets)) throw unavailable();
      this.markets = result.markets.map((m) => this.checkMarket(m)); this.lastRefresh = this.now();
    })();
    try { await this.refreshing; } finally { this.refreshing = null; }
  }
  async market(id) { const r = await this.request('GET', `/markets/${encodeURIComponent(id)}`); return this.checkMarket(r.market); }
  async refreshLink(p) {
    const r = await this.request('GET', `/links/${encodeURIComponent(p.id)}`);
    if (r.link !== null && (!validLink(r.link) || r.link.academyPlayerId !== p.id)) throw unavailable();
    const current = this.store.players[p.id]; if (!current) throw fail('Sign in again.', 401);
    if (JSON.stringify(this.data(current).link) !== JSON.stringify(r.link)) { const d = this.draft(current); d.conquest.link = r.link; this.commit([d]); }
    return r.link;
  }
  async startLink(p, sessionId) {
    this.checkStorage();
    if (!this.publicUrl) throw unavailable();
    if (this.hasPending(p)) throw fail('Wait for your existing Risk bets to settle before changing the account link.', 409);
    if (this.data(p).link?.active) throw fail('Unlink your current ConquestK account before linking another.', 409);
    const state = crypto.randomBytes(32).toString('hex');
    const d = this.draft(p);
    d.conquest.pendingLink = { state, sessionHash: hash(sessionId), expiresAt: iso(this.now() + 10 * 60000) };
    this.commit([d]);
    const r = await this.request('POST', '/link-requests', { academyPlayerId: p.id, academyName: p.name, state });
    if (!text(r.requestId) || !date(r.expiresAt) || !text(r.authorizeUrl) || new URL(r.authorizeUrl).origin !== new URL(this.url).origin) throw unavailable();
    return { authorizeUrl: r.authorizeUrl };
  }
  async finishLink(p, sessionId, { code, state }) {
    const pending = this.data(p).pendingLink;
    const receipt = this.data(p).linkReceipt;
    if (!pending && receipt && text(code) && text(state) && receipt.stateHash === hash(state) && receipt.codeHash === hash(code)
      && receipt.sessionHash === hash(sessionId) && this.data(p).link?.active) return;
    if (!pending || !text(code) || pending.state !== state || pending.sessionHash !== hash(sessionId) || Date.parse(pending.expiresAt) <= this.now()) throw fail('That link request expired. Start again from Risk bets.', 400);
    const r = await this.request('POST', '/link-redemptions', { academyPlayerId: p.id, state, code });
    if (!validLink(r.link) || r.link.academyPlayerId !== p.id || !r.link.active) throw unavailable();
    const current = this.store.players[p.id];
    if (!current || this.data(current).pendingLink?.state !== state || !this.sessions.lookup(sessionId)) throw fail('Sign in and start the link again.', 401);
    if (this.hasPending(current)) throw fail('Wait for your Risk bets to settle before changing the account link.', 409);
    const d = this.draft(current); d.conquest.link = r.link; d.conquest.pendingLink = null;
    d.conquest.linkReceipt = { stateHash: hash(state), codeHash: hash(code), sessionHash: hash(sessionId) }; this.commit([d]);
  }
  async unlink(p) {
    this.checkStorage();
    if (this.linkChanges.has(p.id)) throw fail('Your account link is being updated. Try again shortly.', 409);
    if (this.hasPending(p)) throw fail('Your Risk bets must settle before you unlink this account.', 409);
    this.linkChanges.add(p.id);
    try {
      const link = await this.refreshLink(p);
      if (link?.active) await this.request('POST', `/links/${encodeURIComponent(link.id)}/revoke`, { academyPlayerId: p.id, linkVersion: link.version });
      const current = this.store.players[p.id]; const d = this.draft(current);
      if (d.conquest.link) d.conquest.link.active = false;
      d.conquest.pendingLink = null; this.commit([d]);
    } finally { this.linkChanges.delete(p.id); }
  }
  async overview(p) {
    if (this.configured() && this.now() - this.lastRefresh > 5000) { try { await this.refreshMarkets(); } catch { this.connected = false; } }
    const safe = p && validConquest(p);
    return { conquestUrl: this.url, connected: this.configured() && this.connected, canBet: this.canPlace(p), serverTime: iso(this.now()), limits: RISK_LIMITS,
      link: safe ? this.data(p).link : null,
      markets: this.markets.map((m) => ({ ...m, outcomes: riskOdds(m) })),
      bets: safe ? Object.values(this.data(p).bets).map((b) => this.publicBet(b)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [],
      escrow: safe ? this.escrow(p) : 0, bankroll: safe ? p.bankroll : null };
  }
  publicBet(b) { return { id: b.id, state: b.state, createdAt: b.createdAt, marketId: b.market.id, gameId: b.market.gameId, gameName: b.market.gameName,
    gameUrl: b.market.gameUrl, outcomeName: b.market.participants.find((p) => p.userId === b.terms.outcomeUserId)?.name || 'Player',
    stakeCents: b.terms.stakeCents, oddsHundredths: b.terms.oddsHundredths, grossCents: b.terms.grossCents, reason: b.terminal?.reason || b.admission?.reason || null };
  }
  checkSelection(p, m, link, outcomeId) {
    if (!link?.active) throw fail('Link your ConquestK account before placing a bet.', 409);
    if (m.status !== 'open' || Date.parse(m.closesAt) <= this.now()) throw fail('Betting has closed for this match.', 409, 'risk_closed');
    if (!m.participants.some((x) => x.userId === outcomeId)) throw fail('Choose a player in this match.');
    if (m.participants.some((x) => x.userId === link.conquestUserId) && outcomeId !== link.conquestUserId) throw fail('Players in the match can only bet on themselves.', 403);
    if (Object.values(this.data(p).bets).some((b) => (b.market.id === m.id && b.state !== 'rejected') || (b.market.gameId === m.gameId && ACTIVE.has(b.state)))) throw fail('You already have a bet for this match.', 409, 'risk_already_bet');
  }
  async quote(p, { marketId, outcomeUserId, stakeCents }) {
    if (!this.canPlace(p)) throw unavailable();
    if (this.linkChanges.has(p.id)) throw fail('Your account link is being updated. Try again shortly.', 409);
    if (!text(marketId) || !text(outcomeUserId) || !integer(stakeCents) || stakeCents < RISK_LIMITS.minStakeCents || stakeCents > RISK_LIMITS.maxStakeCents) throw fail('Choose a stake between $1 and $100.');
    const [m, link] = await Promise.all([this.market(marketId), this.refreshLink(p)]);
    p = this.store.players[p.id];
    if (!p || this.linkChanges.has(p.id)) throw fail('Your account link changed. Try again.', 409);
    this.checkSelection(p, m, link, outcomeUserId);
    const outcome = riskOdds(m).find((x) => x.userId === outcomeUserId);
    if (!outcome.oddsHundredths || stakeCents > outcome.maxStakeCents) throw fail('This stake exceeds the available return limit. Choose a smaller stake.', 400);
    if (Math.round(p.bankroll * 100) < stakeCents) throw fail('There is not enough spendable play money for this bet.', 402);
    const terms = { academyPlayerId: p.id, conquestUserId: link.conquestUserId, linkId: link.id, linkVersion: link.version,
      marketId: m.id, marketVersion: m.version, outcomeUserId, stakeCents, oddsHundredths: outcome.oddsHundredths,
      grossCents: Math.floor(stakeCents * outcome.oddsHundredths / 100), modelVersion: MODEL };
    this.checkExposure(terms);
    for (const [id, q] of this.quotes) if (Date.parse(q.expiresAt) <= this.now()) this.quotes.delete(id);
    if (this.quotes.size >= 1000) throw fail('Please try again shortly.', 429);
    const q = { id: crypto.randomUUID(), market: m, terms, expiresAt: iso(Math.min(this.now() + 60000, Date.parse(m.closesAt))) };
    this.quotes.set(q.id, q);
    return { quote: { id: q.id, expiresAt: q.expiresAt, ...terms, gameName: m.gameName, outcomeName: outcome.name } };
  }
  exposure(extra) {
    const markets = new Map();
    const terms = this.allBets().filter(({ bet }) => ACTIVE.has(bet.state)).map(({ bet }) => bet.terms);
    if (extra) terms.push(extra);
    for (const t of terms) { const outcomes = markets.get(t.marketId) || new Map(); outcomes.set(t.outcomeUserId, (outcomes.get(t.outcomeUserId) || 0) + t.grossCents); markets.set(t.marketId, outcomes); }
    const amounts = [...markets.values()].map((outcomes) => Math.max(...outcomes.values()));
    return { maxMarketGrossCents: Math.max(0, ...amounts), totalGrossCents: amounts.reduce((a, b) => a + b, 0) };
  }
  checkExposure(extra) {
    const exposure = this.exposure(extra);
    if (exposure.maxMarketGrossCents > RISK_LIMITS.marketGrossCents || exposure.totalGrossCents > RISK_LIMITS.totalGrossCents) throw fail('The house limit has been reached. No money was taken.', 409, 'risk_limit');
  }
  diagnostics() {
    const bets = this.allBets().map(({ bet }) => bet), pending = bets.filter((b) => b.state === 'pending');
    return { connected: this.connected, storageFault: !!this.fault, pendingCount: pending.length,
      oldestPendingSeconds: pending.length ? Math.max(0, Math.floor((this.now() - Math.min(...pending.map((b) => Date.parse(b.createdAt)))) / 1000)) : 0,
      ...this.exposure(), settlementFailures: this.failures.size,
      refundsCents: bets.filter((b) => ['void', 'rejected'].includes(b.state)).reduce((sum, b) => sum + b.terms.stakeCents, 0),
      netIssuanceCents: bets.reduce((sum, b) => sum + (b.state === 'won' ? b.terms.grossCents - b.terms.stakeCents : b.state === 'lost' ? -b.terms.stakeCents : 0), 0) };
  }
  recordFailure(phase, id, error) {
    const key = `${phase}:${id}`, code = error.code || 'risk_recovery';
    if (this.failures.get(key) !== code) console.error(JSON.stringify({ event: 'conquest_recovery_failure', phase, id, code }));
    this.failures.set(key, code);
  }
  report() {
    const diagnostics = this.diagnostics();
    const signature = JSON.stringify({ ...diagnostics, oldestPendingSeconds: Math.floor(diagnostics.oldestPendingSeconds / 300) });
    if (signature !== this.lastReport) { console.info(JSON.stringify({ event: 'conquest_ledger_status', ...diagnostics })); this.lastReport = signature; }
  }
  async place(p, quoteId) {
    this.checkStorage();
    if (typeof quoteId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId)) throw fail('Request a new quote.');
    const existing = this.data(p).bets[quoteId]; if (existing) return this.publicBet(existing);
    if (!this.canPlace(p)) throw unavailable();
    if (this.linkChanges.has(p.id)) throw fail('Your account link is being updated. Try again shortly.', 409);
    const q = this.quotes.get(quoteId);
    if (!q || q.terms.academyPlayerId !== p.id || Date.parse(q.expiresAt) <= this.now()) throw fail('Your quote expired. Review a new quote before placing the bet.', 409, 'risk_quote_expired');
    const link = this.data(p).link;
    if (link?.id !== q.terms.linkId || link?.version !== q.terms.linkVersion) throw fail('Your account link changed. Request a new quote.', 409);
    this.checkSelection(p, q.market, link, q.terms.outcomeUserId); this.checkExposure(q.terms);
    const d = this.draft(p);
    this.move(d, -q.terms.stakeCents, 'risk_stake', `Risk stake: ${q.market.gameName}`);
    d.conquest.bets[q.id] = { id: q.id, state: 'pending', createdAt: iso(this.now()), terms: q.terms, market: q.market, admission: null, terminal: null };
    this.commit([d]); this.quotes.delete(q.id);
    try { await this.decide(p.id, q.id); } catch { /* a lost response is pending, never a refund */ }
    return this.publicBet(this.data(this.store.players[p.id]).bets[q.id]);
  }
  async decide(playerId, betId) {
    const p = this.store.players[playerId]; const b = this.data(p).bets[betId]; if (b.state !== 'pending') return;
    const r = await this.request('POST', `/admissions/${encodeURIComponent(b.id)}`, b.terms);
    const a = r.admission;
    if (!a || a.intentId !== b.id || !['accepted', 'rejected'].includes(a.status) || !date(a.decidedAt) || !termsEqual(b.terms, a.terms)) throw unavailable();
    const current = this.store.players[playerId]; if (!current || this.data(current).bets[betId]?.state !== 'pending') return;
    const d = this.draft(current); const next = d.conquest.bets[betId]; next.admission = a;
    if (a.status === 'accepted') next.state = 'accepted';
    else { this.move(d, b.terms.stakeCents, 'risk_refund', `Risk bet not admitted: ${b.market.gameName}`); next.state = 'rejected'; }
    this.commit([d]);
  }
  settle(market) {
    if (!market.terminal || !['settled', 'void'].includes(market.status)) return;
    const rows = this.allBets().filter(({ bet }) => bet.market.id === market.id && ACTIVE.has(bet.state));
    if (rows.some(({ bet }) => bet.state === 'pending')) return;
    const drafts = rows.map(({ p, bet }) => {
      if (bet.market.version !== market.version || bet.market.gameId !== market.gameId
        || !sameRoster(bet.market.participants, market.participants)) throw unavailable();
      const d = this.draft(p); const b = d.conquest.bets[bet.id];
      b.terminal = market.terminal;
      if (market.terminal.kind === 'void') { this.move(d, b.terms.stakeCents, 'risk_refund', `Risk match void: ${market.gameName}`); b.state = 'void'; }
      else if (market.terminal.winnerUserId === b.terms.outcomeUserId) { this.move(d, b.terms.grossCents, 'risk_win', `Risk win: ${market.gameName}`); b.state = 'won'; }
      else b.state = 'lost';
      return d;
    });
    if (drafts.length) this.commit(drafts);
  }
  refreshNames(market) {
    const drafts = [];
    for (const p of Object.values(this.store.players)) {
      const bets = Object.values(this.data(p).bets).filter((b) => b.market.id === market.id);
      if (bets.some((b) => !sameRoster(b.market.participants, market.participants) || b.market.version !== market.version)) throw unavailable();
      if (!bets.some((b) => b.market.participants.some((x) => market.participants.find((y) => y.userId === x.userId)?.name !== x.name))) continue;
      const d = this.draft(p);
      for (const bet of bets) d.conquest.bets[bet.id].market.participants = market.participants;
      drafts.push(d);
    }
    if (drafts.length) this.commit(drafts);
  }
  async reconcile() {
    if (!this.configured() || this.reconciling) return this.reconciling;
    this.reconciling = (async () => {
      try { await this.refreshMarkets(); } catch { /* existing wagers still recover by exact market ID */ }
      for (const { p, bet } of this.allBets()) if (bet.state === 'pending') {
        try { await this.decide(p.id, bet.id); this.failures.delete(`admission:${bet.id}`); }
        catch (e) { this.recordFailure('admission', bet.id, e); }
      }
      const ids = new Set(this.allBets().map(({ bet }) => bet.market.id));
      for (const id of ids) {
        try { const market = await this.market(id); this.refreshNames(market); this.settle(market); this.failures.delete(`settlement:${id}`); }
        catch (e) { this.recordFailure('settlement', id, e); }
      }
      this.report();
    })();
    try { await this.reconciling; } finally { this.reconciling = null; }
  }
}

export function mountConquest({ app, api, conquest, auth, wrap }) {
  const registered = (req, _res, next) => {
    if (!req.sessionId || !(req.player?.google || req.player?.login)) return next(fail('Sign in with an account to use Risk betting.', 401));
    next();
  };
  const sameOrigin = (req, _res, next) => {
    const expected = conquest.publicUrl || `${req.protocol}://${req.get('host')}`;
    if (req.get('origin') !== expected || !req.is('application/json')) return next(fail('Open Risk bets on the Academy site and try again.', 403));
    next();
  };
  api.get('/conquest', wrap((req) => conquest.overview(req.sessionId ? req.player : null)));
  api.post('/conquest/link', registered, sameOrigin, wrap((req) => conquest.startLink(req.player, req.sessionId)));
  api.post('/conquest/unlink', registered, sameOrigin, wrap(async (req) => { await conquest.unlink(req.player); return { unlinked: true }; }));
  api.post('/conquest/quotes', registered, sameOrigin, wrap((req) => conquest.quote(req.player, req.body || {})));
  api.post('/conquest/bets', registered, sameOrigin, wrap(async (req, res) => { const bet = await conquest.place(req.player, req.body?.quoteId); if (bet.state === 'pending') res.status(202); return { bet }; }));
  api.use('/conquest', (err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message, code: err.code || 'risk_error' }));
  app.get('/auth/conquest/callback', auth, async (req, res) => {
    try {
      if (!req.sessionId || !(req.player?.google || req.player?.login)) throw fail('Sign in again.', 401);
      await conquest.finishLink(req.player, req.sessionId, req.query);
      res.redirect('/conquest?linked=1');
    } catch { res.redirect('/conquest?linkError=1'); }
  });
}
