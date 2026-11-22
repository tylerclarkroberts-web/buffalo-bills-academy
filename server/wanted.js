// Wanted-poster shame: when a human is the one everyone is waiting on in 4+ games
// at once (same "your turn" as Up Next, so blackjack does not count; bot tables
// do not count), Guntrad posts a WANTED poster to the Academy Slack channel.
// Never throws, never awaits Slack on the game path. Tests stub the Slack client.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { listShameTurns } from './turns.js';
import { tableHasBots, isBotPlayerId } from './slack.js';
import { CRIME, PUNISHMENT, renderWantedPoster, sampleWantedPoster, SAMPLE_NAME } from './wantedPoster.js';

export const SHAME_MIN = 4;
export const SHAME_COOLDOWN_MS = 12 * 3600 * 1000;
export const CHANNEL_GAP_MS = 10 * 60 * 1000;
export const POSTER_TTL_MS = 7 * 24 * 3600 * 1000;
export const WANTED_DOC = 'wanted-posters';
export const DEFAULT_ACADEMY_CHANNEL = '#buffalo-bills-academy';
export const DEFAULT_PUBLIC_URL = 'https://buffalobillsacademy.com';
const POSTER_ID_RE = /^[a-f0-9]{32}$/;

export function defaultWantedState() {
  return { enabled: true, channel: '', players: {}, queue: [], lastPostedAt: 0 };
}

function normChannel(s) {
  return String(s || '').trim();
}

/** env SLACK_WANTED_POSTERS=0 (or false/off) is a hard kill switch. */
export function envWantedEnabled(env = process.env) {
  const raw = String(env.SLACK_WANTED_POSTERS ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

export function resolveChannel(state, env = process.env) {
  return normChannel(state?.channel) || normChannel(env.SLACK_ACADEMY_CHANNEL) || DEFAULT_ACADEMY_CHANNEL;
}

/**
 * Streak / cooldown:
 *  - one poster per offense streak
 *  - re-arm only after the count drops below SHAME_MIN
 *  - at most one poster per player per 12 hours
 */
export function shameDecision(rec, { count, now, min = SHAME_MIN, cooldown = SHAME_COOLDOWN_MS } = {}) {
  const lastAt = rec?.lastAt || 0;
  const streak = !!rec?.streak;
  if (count < min) return { post: false, next: { lastAt, streak: false } };
  if (streak) return { post: false, next: { lastAt, streak: true } };
  if (lastAt && now - lastAt < cooldown) return { post: false, next: { lastAt, streak: true } };
  return { post: true, next: { lastAt: now, streak: true } };
}

export function wantedCaption(name) {
  return `WANTED: ${name} — CRIME: ${CRIME}. PUNISHMENT: ${PUNISHMENT}.`;
}

/** Guntrad's @channel announcement, passing along the sheriff's message. */
export function wantedSlackText({ name, slackUserId, count, posterUrl } = {}) {
  const who = slackUserId ? `<@${slackUserId}>` : String(name || 'Unknown');
  const n = Number.isFinite(Number(count)) ? Number(count) : 0;
  const base = `<!channel> Word from the Sheriff's Office: ${who} is WANTED for making everyone else wait. They're holding up ${n} games. Punishment: One Thousand Years of Pain.`;
  const url = String(posterUrl || '').trim();
  if (!url) return base;
  const linked = url.startsWith('<http') ? url : `<${url}>`;
  return `${base} Poster: ${linked}`;
}

/** One-line Slack error for logs: method plus error code. Never includes a token or message body. */
export function slackErrorLine(result, fallbackMethod = 'slack') {
  const method = result?.method || fallbackMethod;
  const error = String(result?.error || 'unknown');
  const needed = result?.needed ? ` needed=${result.needed}` : '';
  const provided = result?.provided ? ` provided=${result.provided}` : '';
  const status = result?.status ? ` status=${result.status}` : '';
  return `${method} ${error}${needed}${provided}${status}`;
}

export class WantedShame {
  constructor({ service, slack, env = process.env, render = renderWantedPoster, sample = sampleWantedPoster, log } = {}) {
    this.service = service;
    this.slack = slack;
    this.env = env;
    this.render = render;
    this.sample = sample;
    this.log = log || slack?.log || console;
    this.publicUrl = String(env.PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/$/, '');
    this.state = service.store.loadDoc(WANTED_DOC, defaultWantedState());
    if (typeof this.state.enabled !== 'boolean') this.state.enabled = true;
    if (typeof this.state.channel !== 'string') this.state.channel = '';
    if (!this.state.players || typeof this.state.players !== 'object') this.state.players = {};
    if (!Array.isArray(this.state.queue)) this.state.queue = [];
    if (!Number.isFinite(this.state.lastPostedAt)) this.state.lastPostedAt = 0;
    this.pending = new Set();
    this.flushTimer = null;
  }

  get dataDir() { return this.service.store?.dir || this.service.dataDir || null; }

  posterDir() {
    const root = this.dataDir;
    if (!root) return null;
    const dir = path.join(root, 'wanted-public');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  get enabled() {
    return envWantedEnabled(this.env) && this.state.enabled !== false;
  }

  get channel() { return resolveChannel(this.state, this.env); }

  status() {
    return {
      enabled: this.enabled,
      envKill: !envWantedEnabled(this.env),
      toggle: this.state.enabled !== false,
      channel: this.channel,
      channelSet: !!this.channel,
      defaultChannel: DEFAULT_ACADEMY_CHANNEL,
      cooldownMs: SHAME_COOLDOWN_MS,
      channelGapMs: CHANNEL_GAP_MS,
      minGames: SHAME_MIN,
      queued: (this.state.queue || []).length,
    };
  }

  setConfig({ enabled, channel } = {}) {
    if (enabled !== undefined) this.state.enabled = !!enabled;
    if (channel !== undefined) this.state.channel = normChannel(channel);
    this.save();
    return this.status();
  }

  save() {
    try { this.service.store.saveDoc(WANTED_DOC, this.state); } catch (e) { this.warn('save', e.message); }
  }

  countFor(player, now = this.service.now()) {
    if (!player?.id || isBotPlayerId(player.id)) return 0;
    const rows = listShameTurns({
      player,
      service: this.service,
      now,
      tableHasBots,
      scumTables: () => this.slack?.scumTables?.() || Object.values(this.service.scum?.doc?.tables || {}),
    });
    return rows.length;
  }

  /** Scan every human player. Never throws, never awaits Slack. */
  scan() {
    try {
      if (!this.enabled) return;
      if (!this.channel) return;
      if (!this.slack?.client?.enabled) return;
      const now = this.service.now();
      const players = this.service.store.players || {};
      for (const p of Object.values(players)) {
        if (!p?.id || isBotPlayerId(p.id)) continue;
        this.consider(p, now);
      }
      this.flush(now);
    } catch (e) { this.warn('scan', e.message); }
  }

  consider(player, now = this.service.now()) {
    const count = this.countFor(player, now);
    const rec = this.state.players[player.id] || { lastAt: 0, streak: false };
    const { post, next } = shameDecision(rec, { count, now });
    const changed = rec.lastAt !== next.lastAt || rec.streak !== next.streak;
    // A queued poster already has streak set; don't re-arm lastAt until it actually goes out.
    if ((this.state.queue || []).some((q) => q.id === player.id)) {
      if (count < SHAME_MIN) {
        this.dequeue(player.id);
        this.state.players[player.id] = next;
        this.save();
      }
      return { posted: false, queued: count >= SHAME_MIN, count };
    }
    if (changed) { this.state.players[player.id] = next; this.save(); }
    if (!post) return { posted: false, count };
    // Remember the streak so a later scan does not enqueue twice, but stamp lastAt only when we post.
    this.state.players[player.id] = { lastAt: rec.lastAt || 0, streak: true };
    this.enqueue(player, count, now);
    return { posted: 'queued', count };
  }

  /** Photo bytes if this player uploaded one; otherwise the renderer uses their generated bust seed. Never Guntrad's dealer art. */
  readAvatar(player) {
    try {
      if (player?.avatar?.kind !== 'photo') return null;
      const buf = this.service.avatars?.read?.(player.id);
      if (buf && buf.length > 32) return buf;
      const file = this.service.avatars?.file?.(player.id);
      if (!file || !fs.existsSync(file)) return null;
      return fs.readFileSync(file);
    } catch { return null; }
  }

  portraitSeed(player) {
    if (player?.avatar?.kind === 'photo') return null;
    return player?.avatar?.seed || player?.id || null;
  }

  async slackMention(player) {
    try {
      const r = await this.slack?.resolve?.(player);
      return r?.id || null;
    } catch { return null; }
  }

  post(player, count, now) {
    const job = (async () => {
      const name = String(player.name || 'Unknown');
      const png = this.render({
        name,
        avatarPng: this.readAvatar(player),
        seed: this.portraitSeed(player),
        skinTone: player.skinTone,
        monogram: name,
      });
      const channel = this.channel;
      const slackUserId = await this.slackMention(player);
      const hosted = this.hostPoster(png, { playerId: player.id, now });
      const text = wantedSlackText({ name, slackUserId, count, posterUrl: hosted.url });
      const client = this.slack.client;
      const up = await client.uploadImage?.({
        channel,
        filename: 'wanted.png',
        buffer: png,
        title: `WANTED: ${name}`,
        comment: text,
      });
      if (!up || up.ok === false) {
        this.warn('upload', slackErrorLine(up, 'uploadImage'), player.id);
        const r = await client.postChannel?.(channel, { text })
          || await client.call?.('chat.postMessage', { channel, text, unfurl_links: false, unfurl_media: false });
        if (r && r.ok === false) this.warn('post', slackErrorLine(r, 'chat.postMessage'), player.id);
        return r;
      }
      return up;
    })().catch((e) => this.warn('post', e?.message || 'error', player.id)).finally(() => this.pending.delete(job));
    this.pending.add(job);
    return job;
  }

  async idle() { while (this.pending.size) await Promise.allSettled([...this.pending]); }

  shutdown() {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
  }

  enqueue(player, count, now) {
    this.state.queue = this.state.queue || [];
    if (this.state.queue.some((q) => q.id === player.id)) return;
    this.state.queue.push({ id: player.id, count, queuedAt: now });
    this.save();
  }

  dequeue(playerId) {
    const before = (this.state.queue || []).length;
    this.state.queue = (this.state.queue || []).filter((q) => q.id !== playerId);
    if (this.state.queue.length !== before) this.save();
  }

  flush(now = this.service.now()) {
    this.purgeExpired(now);
    const min = SHAME_MIN;
    this.state.queue = (this.state.queue || []).filter((q) => {
      const p = this.service.store.players[q.id];
      return p && this.countFor(p, now) >= min;
    });
    if (!this.state.queue.length) {
      this.save();
      return { posted: false };
    }
    const wait = (this.state.lastPostedAt && now - this.state.lastPostedAt < CHANNEL_GAP_MS)
      ? CHANNEL_GAP_MS - (now - this.state.lastPostedAt)
      : 0;
    if (wait > 0) {
      this.scheduleFlush(wait);
      this.save();
      return { posted: false, wait };
    }
    const next = this.state.queue.shift();
    this.state.lastPostedAt = now;
    this.save();
    const player = this.service.store.players[next.id];
    if (player) {
      const count = this.countFor(player, now) || next.count;
      this.state.players[player.id] = { lastAt: now, streak: true };
      this.save();
      this.post(player, count, now);
    }
    if (this.state.queue.length) this.scheduleFlush(CHANNEL_GAP_MS);
    return { posted: !!player, remaining: this.state.queue.length };
  }

  scheduleFlush(wait) {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    const delay = Math.max(50, Math.min(Number(wait) || CHANNEL_GAP_MS, 2 ** 31 - 1));
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      try { this.flush(this.service.now()); } catch (e) { this.warn('flush', e.message); }
    }, delay);
  }

  hostPoster(png, { playerId, now = this.service.now() } = {}) {
    const id = crypto.randomBytes(16).toString('hex');
    const dir = this.posterDir();
    if (dir && png && png.length) {
      try { fs.writeFileSync(path.join(dir, `${id}.png`), png); }
      catch (e) { this.warn('host', e.message, playerId); }
    }
    this.state.posters = this.state.posters || {};
    this.state.posters[id] = { playerId: playerId || null, createdAt: now };
    this.save();
    return { id, url: `${this.publicUrl}/wanted/${id}.png` };
  }

  readPublic(id) {
    if (!POSTER_ID_RE.test(String(id || ''))) return null;
    const dir = this.posterDir();
    if (!dir) return null;
    const file = path.join(dir, `${id}.png`);
    if (!fs.existsSync(file)) return null;
    const rec = this.state.posters?.[id];
    if (rec?.createdAt && this.service.now() - rec.createdAt > POSTER_TTL_MS) {
      try { fs.unlinkSync(file); } catch { /* gone */ }
      if (this.state.posters) delete this.state.posters[id];
      this.save();
      return null;
    }
    try { return fs.readFileSync(file); } catch { return null; }
  }

  purgeExpired(now = this.service.now()) {
    const posters = this.state.posters || {};
    let dirty = false;
    const dir = this.posterDir();
    for (const [id, rec] of Object.entries(posters)) {
      if (rec?.createdAt && now - rec.createdAt <= POSTER_TTL_MS) continue;
      if (dir) try { fs.unlinkSync(path.join(dir, `${id}.png`)); } catch { /* gone */ }
      delete posters[id];
      dirty = true;
    }
    if (dirty) { this.state.posters = posters; this.save(); }
  }

  previewPng({ name } = {}) {
    return this.sample({ name: name || SAMPLE_NAME });
  }

  warn(kind, error, pid) {
    this.log.warn?.(`[wanted] ${kind} failed: ${String(error || 'unknown').slice(0, 200)}${pid ? ` (player ${pid.slice(0, 8)})` : ''}`);
  }
}

export { CRIME, PUNISHMENT, PROCEDURE, SAMPLE_NAME, SAMPLE_SEED } from './wantedPoster.js';
