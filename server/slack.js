// Slack turn alerts: a Slack bot ("Guntrad the Pit Boss") DMs a player when it is their turn, plus one
// gentle reminder when about 4 hours are left on their clock. Off unless SLACK_BOT_TOKEN is set.
// It also nudges the host of a table that has 2+ players seated but was never started (10 min, then every 6 h, max 3).
// Players are matched to Slack automatically by their account email (verified Google email, or the email on a
// password account), looked up lazily and cached; a manual "Slack email" in Settings overrides it; alerts can be switched off.
// Slack is never on the game's critical path: every send is async, caught, retried once and logged
// without the token or the message body. Messages never contain hole cards or anyone else's private info.
// The same switch covers one more message: a DM when another player challenges your Barn bug.
import { GameError } from './engine/game.js';
import { fmt, cents } from './accounts.js';

const SLACK_API = 'https://slack.com/api';
const RETRYABLE = new Set(['ratelimited', 'internal_error', 'fatal_error', 'service_unavailable', 'request_timeout', 'network_error', 'http_error']);
export const REMIND_BEFORE_MS = 4 * 3600 * 1000;
const MAX_TIMER = 2 ** 31 - 1;

export class SlackClient {
  constructor({ token, fetchImpl = globalThis.fetch, baseUrl = SLACK_API, retryDelayMs = 1500 } = {}) {
    this.token = token ? String(token).trim() : '';
    this.fetch = fetchImpl; this.baseUrl = baseUrl; this.retryDelayMs = retryDelayMs;
  }
  get enabled() { return !!this.token; }
  /** One Slack Web API call. Returns the parsed body; `ok:false` is returned, not thrown. Retries once on transient failures. */
  async call(method, params = {}, { get = false } = {}) {
    if (!this.enabled) return { ok: false, error: 'not_configured' };
    for (let attempt = 0; ; attempt++) {
      let body;
      try {
        const headers = { authorization: `Bearer ${this.token}` };
        let url = `${this.baseUrl}/${method}`; let init = { method: 'POST', headers };
        if (get) { url += `?${new URLSearchParams(params)}`; init = { method: 'GET', headers }; }
        else { headers['content-type'] = 'application/json; charset=utf-8'; init.body = JSON.stringify(params); }
        const r = await this.fetch(url, init);
        body = r.status === 429 ? { ok: false, error: 'ratelimited' } : r.status >= 500 ? { ok: false, error: 'http_error' } : await r.json();
      } catch { body = { ok: false, error: 'network_error' }; }
      if (body?.ok || attempt >= 1 || !RETRYABLE.has(body?.error)) return body || { ok: false, error: 'bad_response' };
      await new Promise((res) => setTimeout(res, this.retryDelayMs));
    }
  }
  lookupByEmail(email) { return this.call('users.lookupByEmail', { email }, { get: true }); }
  /** DM a Slack user: open (or reuse) the bot's IM with them, then post. */
  async dm(userId, { text, blocks }) {
    const open = await this.call('conversations.open', { users: userId });
    if (!open.ok) return open;
    return this.call('chat.postMessage', { channel: open.channel.id, text, ...(blocks ? { blocks } : {}), unfurl_links: false, unfurl_media: false });
  }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STREET = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };
export function hoursLeft(ms) {
  if (ms <= 0) return 'now';
  const h = ms / 3600000;
  if (h >= 1.5) return `within ${Math.round(h)} hours`;
  if (h >= 1) return 'within the hour or so';
  return `within ${Math.max(1, Math.round(ms / 60000))} minutes`;
}

/** The public facts about a turn: table, hand, street, what it costs to stay in, pot, time left. No cards. */
export function turnFacts(t, now) {
  const h = t.hand;
  if (t.bots) return null; // v38: no Slack from bot tables (reminders included)
  if (!h || h.toAct === null || h.toAct === undefined || h.deadline === null) return null;
  const seat = h.toAct; const s = t.seats[seat]; const p = h.players[seat];
  if (!s || !p) return null;
  const toCall = Math.max(0, Math.min(h.currentBet - p.bet, s.stack));
  const pot = h.players.reduce((a, x) => a + (x ? x.total : 0), 0);
  return { code: t.code, table: t.name, playerId: s.playerId, name: s.name, seat, hand: h.number, street: h.street, toCall, pot, stack: s.stack,
    deadline: h.deadline, turnStart: h.deadline - (t.settings.turnSeconds * 1000), left: h.deadline - now,
    key: `${h.number}:${h.street}:${seat}:${h.deadline}` };
}

export function turnMessage(f, { publicUrl, reminder = false }) {
  const url = `${publicUrl}/t/${f.code}`;
  const face = f.toCall > 0 ? `*${f.toCall}* to call (you have ${f.stack})` : 'You can check';
  const when = hoursLeft(f.left);
  const head = reminder ? `Reminder: it's still your turn at *${esc(f.table)}*` : `Your turn at *${esc(f.table)}*`;
  const line = `Hand #${f.hand} · ${STREET[f.street] || f.street} · pot ${f.pot}. ${face}. Act ${when}${reminder ? ', or Guntrad checks or folds for you' : ''}.`;
  const text = `${reminder ? 'Reminder: still your turn' : 'Your turn'} at ${f.table}: ${f.toCall > 0 ? `${f.toCall} to call` : 'you can check'}, act ${when}. ${url}`;
  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `${head}\n${line}` } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open the table' }, url, style: 'primary', action_id: 'open_table' }] },
    ],
  };
}

// ---- Barn challenges ----
/** Someone has called out a player's bug. What the ring already shows everyone: both bugs, the challenger and the stake. */
export function challengeMessage(f, { publicUrl }) {
  const url = `${publicUrl}/barn`;
  const terms = f.stake > 0 ? `$${fmt(f.stake)} each, winner takes $${fmt(cents(f.stake * 2))}` : 'No money, just the grudge';
  return {
    text: `${f.from}'s bug ${f.bug} has called out your ${f.yours}${f.stake > 0 ? ` for $${fmt(f.stake)}` : ''}. Accept or decline within a day: ${url}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${esc(f.bug)}* has called out your *${esc(f.yours)}*\n${esc(f.from)}'s level ${f.level} ${esc(f.species)}. ${terms}. It stands for a day; nothing is held until you accept.` } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open the Barn' }, url, style: 'primary', action_id: 'open_barn' }] },
    ],
  };
}

// ---- v48: blackjack turns ----
/**
 * Who a blackjack table is waiting on, per seat: 'bet' (betting window open, no bet yet), 'insurance' (dealer shows
 * an ace, no decision yet) or 'play' (their hand is up). Humans only: bot seats, empty/left seats and spectators
 * never appear. Public facts only, never cards. Key = table:round:seat:phase:deadline; the betting key uses 'open'
 * for the deadline because the betting clock only starts at the first human bet (that must not re-ping everyone).
 */
export function bjTurns(t, now) {
  const r = t?.round; if (!r || t.status !== 'playing') return [];
  const out = [];
  const add = (seat, phase, keyDeadline) => {
    const s = t.seats[seat]; if (!s || s.bot || s.left || !s.id) return;
    out.push({ code: t.code, table: t.name, playerId: s.id, seat, phase, round: r.no, deadline: r.deadline || null,
      turnStart: r.deadline ? r.deadline - t.turnSec * 1000 : null, left: r.deadline ? r.deadline - now : null,
      key: `${t.code}:${r.no}:${seat}:${phase}:${keyDeadline ?? 'open'}` });
  };
  if (r.phase === 'betting') t.seats.forEach((s, i) => { if (s && !s.left && s.chips >= t.limits.min && !r.bets[i]) add(i, 'bet', null); });
  else if (r.phase === 'insurance') for (const i of new Set(r.hands.filter((h) => !(h.seat in r.insurance)).map((h) => h.seat))) add(i, 'insurance', r.deadline);
  else if (r.phase === 'play' && r.turn >= 0 && r.deadline && r.hands[r.turn]) add(r.hands[r.turn].seat, 'play', r.deadline);
  return out;
}
const BJ_NEED = { bet: 'place your bet', insurance: 'the dealer shows an ace: insurance or no', play: 'your hand to play' };
export function bjMessage(f, { publicUrl, reminder = false }) {
  const url = `${publicUrl}/bj/${f.code}`;
  const when = f.deadline ? ` within ${hoursLeft(f.left).replace(/^within /, '')}` : '';
  const fall = f.phase === 'play' ? ', or Guntrad stands for you' : f.phase === 'bet' ? ', or you sit the round out' : ', or it is a no';
  const head = `${reminder ? 'Reminder from Guntrad: still waiting on you' : 'Guntrad here'} at blackjack table *${esc(f.table)}*`;
  const line = `${BJ_NEED[f.phase][0].toUpperCase()}${BJ_NEED[f.phase].slice(1)}${f.deadline ? `,${when === ' within now' ? ' now' : when}${fall}` : ' (the clock starts when the first bet goes down)'}.`;
  return {
    text: `${reminder ? 'Reminder: still your turn' : 'Your turn'} at blackjack ${f.table}: ${BJ_NEED[f.phase]}. ${url}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `${head}\n${line}` } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open the table' }, url, style: 'primary', action_id: 'open_table' }] },
    ],
  };
}

// ---- start nudges: the host of a table that's full enough but never started ----
export const NUDGE_FIRST_MS = 10 * 60 * 1000;         // first nudge ~10 minutes after the table first has 2+ players ready
export const NUDGE_EVERY_MS = 6 * 3600 * 1000;        // then at most one reminder every 6 hours
export const NUDGE_MAX = 3;                           // and never more than 3 per table
export const NUDGE_STALE_MS = 7 * 24 * 3600 * 1000;   // a lobby nobody has joined for a week is abandoned: leave it be
/** Players who could be dealt in right now (the server's own start rule). */
export const readyCount = (t) => t.seats.filter((s) => s && !s.sittingOut && !s.leaving && s.stack > 0).length;
/** Guntrad's nudge to a host, in his voice. n = which nudge (1, 2 or 3). */
export function nudgeMessage(t, n, { publicUrl }) {
  const url = `${publicUrl}/t/${t.code}`; const k = readyCount(t); const name = esc(t.name);
  const lines = [
    `Psst, boss. ${k} players are sitting at *${name}* staring at an empty felt. Only the host can deal them in, and that's you.`,
    `Still nothing at *${name}*. ${k} players seated, zero cards dealt. The chips are starting to gather dust.`,
    `Last call from the pit: *${name}* has ${k} players seated and no game. I won't ask again.`,
  ];
  const line = lines[Math.min(n, lines.length) - 1];
  return {
    text: `${line.replace(/\*/g, '')} Start the game: ${url}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: line } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Start the game' }, url, style: 'primary', action_id: 'start_table' }] },
    ],
  };
}

export const HIT_TTL_MS = 7 * 24 * 3600 * 1000;   // a found Slack user is re-checked weekly
export const MISS_TTL_MS = 12 * 3600 * 1000;      // "not in the workspace" is remembered for 12 hours, then tried again
export const ERR_BACKOFF_MS = 5 * 60 * 1000;      // after a Slack outage, wait before looking that email up again
export const LOOKUPS_PER_MIN = 30;                // well under Slack's tier-3 limit for users.lookupByEmail
export const SEND_RETRY_MS = [60e3, 5 * 60e3];    // a turn alert that hit a Slack outage is retried twice, if it's still their turn
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normEmail = (e) => (e ? String(e).trim().toLowerCase() : '');

/** The email we match to Slack automatically: the verified Google email, else the email on a password account. */
export function accountEmail(p) { return normEmail(p?.google?.email || p?.login?.email) || null; }

export class SlackAlerts {
  constructor({ service, client, publicUrl = 'https://buffalobillsacademy.com', log = console, retryMs = SEND_RETRY_MS }) {
    this.service = service; this.client = client; this.log = log; this.retryMs = retryMs;
    this.publicUrl = String(publicUrl || 'https://buffalobillsacademy.com').replace(/\/+$/, '');
    this.state = service.store.loadDoc('slack-alerts', { pinged: {}, reminded: {}, lookups: {}, nudges: {} });
    this.state.pinged ||= {}; this.state.reminded ||= {}; this.state.lookups ||= {}; this.state.nudges ||= {};
    this.pending = new Set(); this.timer = null; this.attempts = new Map();
    this.inflight = new Map(); this.errAt = new Map(); this.recent = []; this.retryTimers = new Set();
  }
  get enabled() { return this.client.enabled; }
  /** Which email we use for this player, and where it came from. A manual Slack email beats the account email. */
  target(p) {
    if (!p) return { email: null, source: null };
    if (p.slack?.email) return { email: normEmail(p.slack.email), source: 'manual' };
    const e = accountEmail(p);
    return e ? { email: e, source: 'account' } : { email: null, source: null };
  }
  isOn(p) { return !!p && !p.slack?.off; }
  cached(email) {
    const c = email && this.state.lookups[email]; const now = this.service.now();
    if (!c) return null;
    if (c.id && now - c.at < HIT_TTL_MS) return c;
    if (c.miss && now - c.at < MISS_TTL_MS) return c;
    return null;
  }
  /** Worth trying to alert: switched on, has an email, and that email isn't a known miss. */
  mayAlert(p) { if (!this.isOn(p)) return false; const { email } = this.target(p); return !!email && !this.cached(email)?.miss; }
  status(p) {
    const { email, source } = this.target(p); const c = this.cached(email);
    return { enabled: this.enabled, on: this.isOn(p), email, source, accountEmail: accountEmail(p), override: p?.slack?.email ? normEmail(p.slack.email) : null,
      connected: !!c?.id, matched: c ? !!c.id : null };
  }

  /**
   * Find this player's Slack user id, lazily: cached hits and misses, at most LOOKUPS_PER_MIN lookups a minute,
   * one lookup per email at a time, and a back-off after Slack errors. Resolves to { id } | { miss } | { error }. Never throws.
   */
  async resolve(p, { force = false } = {}) {
    if (!this.enabled) return { error: 'not_configured' };
    const { email } = this.target(p);
    if (!email || !EMAIL_RE.test(email)) return { miss: true, why: 'no_email' };
    const c = force ? null : this.cached(email);
    if (c) return c.id ? { id: c.id } : { miss: true };
    const stale = this.state.lookups[email];
    const now = this.service.now();
    if (!force && now - (this.errAt.get(email) || -Infinity) < ERR_BACKOFF_MS) return stale?.id ? { id: stale.id } : { error: 'backoff' };
    if (this.inflight.has(email)) return this.inflight.get(email);
    this.recent = this.recent.filter((x) => now - x < 60e3);
    if (this.recent.length >= LOOKUPS_PER_MIN) return stale?.id ? { id: stale.id } : { error: 'rate_limited' };
    this.recent.push(now);
    const job = (async () => {
      try {
        const r = await this.client.lookupByEmail(email);
        if (r.ok && r.user && !r.user.deleted && !r.user.is_bot) {
          this.state.lookups[email] = { id: r.user.id, team: r.user.team_id || null, at: this.service.now() }; this.errAt.delete(email); this.save();
          return { id: r.user.id };
        }
        if (r.ok || r.error === 'users_not_found') { this.state.lookups[email] = { miss: true, at: this.service.now() }; this.save(); return { miss: true }; }
        this.errAt.set(email, this.service.now()); this.warn('lookup', r.error);
        return stale?.id ? { id: stale.id } : { error: r.error || 'error' };
      } catch (e) { this.errAt.set(email, this.service.now()); this.warn('lookup', e?.message); return { error: 'error' }; }
      finally { this.inflight.delete(email); }
    })();
    this.inflight.set(email, job);
    return job;
  }

  /** Rate limit lookups the player asks for (an email lookup reveals whether someone is in the workspace). */
  throttle(p) {
    const now = this.service.now(); const list = (this.attempts.get(p.id) || []).filter((x) => now - x < 3600000);
    if (list.length >= 8) throw new GameError('Too many tries. Wait a bit and try again.', 429);
    list.push(now); this.attempts.set(p.id, list);
  }
  /** Settings → "Slack email": for people whose Slack email differs from their account email. Sends a hello so they know it worked. */
  async connect(p, rawEmail) {
    if (!this.enabled) throw new GameError('Slack alerts are not switched on yet.', 503);
    const email = normEmail(rawEmail);
    if (!EMAIL_RE.test(email) || email.length > 200) throw new GameError('Enter the email address you use in Slack.');
    this.throttle(p);
    const r = await this.client.lookupByEmail(email);
    if (!r.ok) {
      if (r.error === 'users_not_found') { this.state.lookups[email] = { miss: true, at: this.service.now() }; this.save(); throw new GameError('No one with that email is in our Slack workspace. Try the email on your Slack profile.', 404); }
      this.warn('lookup', r.error);
      throw new GameError("Slack didn't answer just now. Try again in a minute.", 502);
    }
    const u = r.user || {};
    if (u.deleted || u.is_bot) throw new GameError("That Slack account can't get messages.", 400);
    this.state.lookups[email] = { id: u.id, team: u.team_id || null, at: this.service.now() }; this.save();
    const welcome = await this.client.dm(u.id, { text: `Howdy ${p.name}. Guntrad the Pit Boss will message you here when it's your turn at a table, with a link straight to it. Turn this off any time on your profile.` });
    if (!welcome.ok) { this.warn('welcome', welcome.error); throw new GameError("Found you on Slack, but couldn't send you a message. Try again in a minute.", 502); }
    p.slack = { email, connectedAt: this.service.now() }; // switched on, with this override
    this.service.store.savePlayers();
    this.sweep();
    return this.status(p);
  }
  /** Drop the manual Slack email: back to matching the account email automatically. */
  disconnect(p) {
    if (p.slack) { const off = !!p.slack.off; p.slack = off ? { off: true } : undefined; if (!p.slack) delete p.slack; this.service.store.savePlayers(); }
    return this.status(p);
  }
  setOn(p, on) {
    const cur = p.slack || {};
    if (on) { delete cur.off; } else cur.off = true;
    if (Object.keys(cur).length) p.slack = cur; else delete p.slack;
    this.service.store.savePlayers(); this.reschedule();
    return this.status(p);
  }
  /** The settings page asks "does my email match?" Looks up at most a few times an hour per player. Never DMs. */
  async check(p) {
    if (!this.enabled || !this.target(p).email) return this.status(p);
    if (!this.cached(this.target(p).email)) { try { this.throttle(p); } catch { return this.status(p); } await this.resolve(p); }
    return this.status(p);
  }
  async test(p) {
    if (!this.enabled) throw new GameError('Slack alerts are not switched on yet.', 503);
    if (!this.isOn(p)) throw new GameError('Turn Slack alerts on first.');
    const r0 = await this.resolve(p);
    if (!r0.id) throw new GameError(r0.miss ? 'No Slack account matches your email. Add your Slack email below.' : "Couldn't reach Slack just now. Try again in a minute.", r0.miss ? 404 : 502);
    const r = await this.client.dm(r0.id, { text: 'Test from Guntrad the Pit Boss: your Slack alerts work. You will hear from me when it is your turn.' });
    if (!r.ok) { this.warn('test', r.error); throw new GameError("Couldn't reach you on Slack just now. Try again in a minute.", 502); }
    return { sent: true };
  }

  /** Called after every table change. Never throws, never awaits Slack. */
  tableChanged(t, actorId = null) {
    try {
      if (!this.enabled || t.bots) return; // v38: bot tables never send Slack
      this.nudgeTrack(t);
      const f = turnFacts(t, this.service.now());
      if (!f) return;
      if (this.state.pinged[t.code] === f.key) return;
      this.state.pinged[t.code] = f.key; this.save();
      if (f.playerId === actorId) return; // their own click put the turn back on them: they're looking at the table
      const p = this.service.store.players[f.playerId];
      if (!this.mayAlert(p)) return;
      this.send(p, turnMessage(f, { publicUrl: this.publicUrl }), 'turn', { code: t.code, key: f.key });
    } catch (e) { this.warn('turn', e.message); } finally { this.reschedule(); }
  }
  /** A Barn challenge was just sent. One message and no reminder: the Barn shows it for its whole day. Never throws, never awaits Slack. */
  challenged(f) {
    try {
      if (!this.enabled) return;
      const p = this.service.store.players[f.toId];
      if (!this.mayAlert(p)) return;
      this.send(p, challengeMessage(f, { publicUrl: this.publicUrl }), 'challenge', { challenge: f.id });
    } catch (e) { this.warn('challenge', e.message); }
  }
  /** v48: called after every saved blackjack change (player action or clock tick). Never throws, never awaits Slack. */
  bjChanged(t, actorId = null) {
    try {
      if (!this.enabled) return;
      const pre = `bj:${t.code}:`; let dirty = false;
      if (t.status !== 'playing') { for (const m of [this.state.pinged, this.state.reminded]) for (const k of Object.keys(m)) if (k.startsWith(pre)) { delete m[k]; dirty = true; } if (dirty) this.save(); return; }
      for (const f of bjTurns(t, this.service.now())) {
        const k = pre + f.seat; if (this.state.pinged[k] === f.key) continue;
        this.state.pinged[k] = f.key; dirty = true;
        if (f.playerId === actorId) continue; // their own click: they're looking at the table
        const p = this.service.store.players[f.playerId];
        if (!this.mayAlert(p)) continue;
        this.send(p, bjMessage(f, { publicUrl: this.publicUrl }), 'bj-turn', { bj: true, code: t.code, key: f.key, seat: f.seat });
      }
      if (dirty) this.save();
    } catch (e) { this.warn('bj-turn', e.message); } finally { this.reschedule(); }
  }
  bjTables() { try { return this.bjSource?.all() || []; } catch { return []; } }
  /** Blackjack turns that will need a reminder: a deadline, a long enough clock, not reminded yet. */
  bjDue(now) {
    const out = [];
    for (const t of this.bjTables()) for (const f of bjTurns(t, now)) {
      if (!f.deadline) continue;
      const rk = `bj:${t.code}:${f.seat}`, rv = `${f.key}:${f.deadline}`;
      if (this.state.reminded[rk] === rv) continue;
      const at = f.deadline - REMIND_BEFORE_MS;
      if (at - f.turnStart < 3600000 || now >= f.deadline) continue;
      out.push({ f, at, rk, rv });
    }
    return out;
  }
  /** Reminders: one per turn, about 4 hours before the deadline, only on turns long enough to need one. */
  sweep() {
    try {
      if (!this.enabled) return;
      const now = this.service.now();
      for (const t of this.service.store.allTables()) {
        const f = turnFacts(t, now);
        if (!f || this.state.reminded[t.code] === f.key) continue;
        const at = f.deadline - REMIND_BEFORE_MS;
        if (at - f.turnStart < 3600000 || now < at || now >= f.deadline) continue;
        const p = this.service.store.players[f.playerId];
        this.state.reminded[t.code] = f.key; this.save();
        if (!this.mayAlert(p)) continue;
        this.send(p, turnMessage(f, { publicUrl: this.publicUrl, reminder: true }), 'reminder', { code: t.code, key: f.key });
      }
      for (const t of this.service.store.allTables()) this.nudgeIfDue(t, now);
      for (const { f, at, rk, rv } of this.bjDue(now)) { // v48: blackjack reminders
        if (now < at) continue;
        this.state.reminded[rk] = rv; this.save();
        const p = this.service.store.players[f.playerId];
        if (!this.mayAlert(p)) continue;
        this.send(p, bjMessage(f, { publicUrl: this.publicUrl, reminder: true }), 'bj-reminder', { bj: true, code: f.code, key: f.key, seat: f.seat });
      }
    } catch (e) { this.warn('sweep', e.message); } finally { this.reschedule(); }
  }
  /**
   * Start nudges. A record per table, persisted with the rest of the Slack state on the volume:
   * { since: when 2+ players were first ready, sent: nudges sent, last: when the last one went }.
   * Records for tables that started or closed are dropped, so the nudging stops for good.
   */
  nudgeTrack(t) {
    const N = this.state.nudges; const rec = N[t.code];
    if (t.status !== 'lobby') { if (rec) { delete N[t.code]; this.save(); } return; }
    const ready = readyCount(t) >= 2;
    if (ready && !rec) { N[t.code] = { since: this.service.now(), sent: 0, last: null }; this.save(); }
    else if (!ready && rec && rec.sent === 0) { delete N[t.code]; this.save(); } // dropped back below 2 before any nudge: the 10 minutes restart
  }
  /** When this table's next nudge is due (ms), or null if none will be. */
  nudgeDue(t) {
    const rec = this.state.nudges[t.code];
    if (!rec || t.status !== 'lobby' || rec.sent >= NUDGE_MAX || readyCount(t) < 2) return null;
    const lastJoin = Math.max(t.createdAt || 0, ...t.seats.filter(Boolean).map((s) => s.joinedAt || 0));
    if (this.service.now() - lastJoin > NUDGE_STALE_MS) return null;
    return rec.sent === 0 ? rec.since + NUDGE_FIRST_MS : rec.last + NUDGE_EVERY_MS;
  }
  nudgeIfDue(t, now) {
    if (t.bots) return;
    this.nudgeTrack(t);
    const due = this.nudgeDue(t);
    if (due === null || now < due) return;
    const host = this.service.store.players[t.hostId];
    if (!this.mayAlert(host)) return; // switched off or no Slack: no DM (and it doesn't use up a nudge)
    const rec = this.state.nudges[t.code]; rec.sent++; rec.last = now; this.save(); // counted before sending: never twice, even across a restart
    this.send(host, nudgeMessage(t, rec.sent, { publicUrl: this.publicUrl }), 'nudge', null);
  }
  reschedule() {
    if (this.closed || !this.enabled) return;
    clearTimeout(this.timer); this.timer = null;
    const now = this.service.now(); let next = Infinity;
    for (const t of this.service.store.allTables()) {
      const f = turnFacts(t, now);
      if (!f || this.state.reminded[t.code] === f.key) continue;
      const at = f.deadline - REMIND_BEFORE_MS;
      if (at - f.turnStart < 3600000 || now >= f.deadline) continue;
      if (!this.mayAlert(this.service.store.players[f.playerId])) continue;
      next = Math.min(next, at);
    }
    for (const t of this.service.store.allTables()) {
      const due = this.nudgeDue(t);
      if (due !== null && this.mayAlert(this.service.store.players[t.hostId])) next = Math.min(next, due);
    }
    for (const { f, at } of this.bjDue(now)) if (this.mayAlert(this.service.store.players[f.playerId])) next = Math.min(next, at);
    if (next === Infinity) return;
    this.timer = setTimeout(() => this.sweep(), Math.min(Math.max(0, next - now) + 50, MAX_TIMER));
    this.timer.unref?.();
  }
  /** Is this still the same turn, for this player, with alerts still on? (Checked again before every retry.) */
  stillDue(p, ctx) {
    if (ctx.challenge) return this.isOn(p) && !!this.challengeOpen?.(ctx.challenge); // withdrawn, declined or fought: say nothing
    if (ctx.bj) { const t = this.bjTables().find((x) => x.code === ctx.code); return !!t && bjTurns(t, this.service.now()).some((f) => f.key === ctx.key && f.playerId === p.id) && this.isOn(p); }
    const t = this.service.store.getTable?.(ctx.code) || this.service.store.allTables().find((x) => x.code === ctx.code);
    const f = t && turnFacts(t, this.service.now());
    return !!f && f.key === ctx.key && f.playerId === p.id && this.isOn(p);
  }
  send(p, msg, kind, ctx, attempt = 0) {
    const job = (async () => {
      const r0 = await this.resolve(p);
      if (r0.miss) return { ok: false, error: 'no_slack_user' }; // not in the workspace: skipped silently
      let r = r0.id ? await this.client.dm(r0.id, msg) : { ok: false, error: r0.error || 'lookup_failed' };
      if (!r.ok && r0.id && ['user_not_found', 'cannot_dm_bot', 'user_disabled', 'account_inactive'].includes(r.error)) {
        delete this.state.lookups[this.target(p).email]; this.save(); // their Slack account changed: look it up fresh next time
      }
      if (!r.ok) {
        this.warn(kind, r.error, p.id);
        const wait = this.retryMs[attempt];
        if (ctx && wait != null && !this.closed) {
          const tm = setTimeout(() => { this.retryTimers.delete(tm); if (this.stillDue(p, ctx)) this.send(p, msg, kind, ctx, attempt + 1); }, wait);
          tm.unref?.(); this.retryTimers.add(tm);
        }
      }
      return r;
    })().catch((e) => this.warn(kind, e?.message || 'error', p.id)).finally(() => this.pending.delete(job));
    this.pending.add(job);
    return job;
  }
  /** For tests and shutdown: wait for in-flight DMs. */
  async idle() { while (this.pending.size) await Promise.allSettled([...this.pending]); }
  save() { try { this.service.store.saveDoc('slack-alerts', this.state); } catch (e) { this.warn('save', e.message); } }
  forgetTable(code) { delete this.state.pinged[code]; delete this.state.reminded[code]; delete this.state.nudges[code]; }
  warn(kind, error, pid) { this.log.warn?.(`[slack] ${kind} failed: ${String(error || 'unknown').slice(0, 80)}${pid ? ` (player ${pid.slice(0, 8)})` : ''}`); }
  shutdown() { this.closed = true; clearTimeout(this.timer); for (const tm of this.retryTimers) clearTimeout(tm); this.retryTimers.clear(); }
}
