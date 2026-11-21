// Wanted-poster shame: when a human is the one everyone is waiting on in 4+ games
// at once (same "your turn" as Up Next, so blackjack does not count; bot tables
// do not count), Guntrad posts a WANTED poster to the Academy Slack channel.
// Never throws, never awaits Slack on the game path. Tests stub the Slack client.
import fs from 'node:fs';
import { listShameTurns } from './turns.js';
import { tableHasBots, isBotPlayerId } from './slack.js';
import { CRIME, PUNISHMENT, renderWantedPoster, sampleWantedPoster, SAMPLE_NAME } from './wantedPoster.js';

export const SHAME_MIN = 4;
export const SHAME_COOLDOWN_MS = 12 * 3600 * 1000;
export const WANTED_DOC = 'wanted-posters';
export const DEFAULT_ACADEMY_CHANNEL = '#buffalo-bills-academy';

export function defaultWantedState() {
  return { enabled: true, channel: '', players: {} };
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
export function wantedSlackText({ name, slackUserId, count } = {}) {
  const who = slackUserId ? `<@${slackUserId}>` : String(name || 'Unknown');
  const n = Number.isFinite(Number(count)) ? Number(count) : 0;
  return `<!channel> Word from the Sheriff's Office: ${who} is WANTED for making everyone else wait. They're holding up ${n} games. Punishment: One Thousand Years of Pain.`;
}

export class WantedShame {
  constructor({ service, slack, env = process.env, render = renderWantedPoster, sample = sampleWantedPoster, log } = {}) {
    this.service = service;
    this.slack = slack;
    this.env = env;
    this.render = render;
    this.sample = sample;
    this.log = log || slack?.log || console;
    this.state = service.store.loadDoc(WANTED_DOC, defaultWantedState());
    if (typeof this.state.enabled !== 'boolean') this.state.enabled = true;
    if (typeof this.state.channel !== 'string') this.state.channel = '';
    if (!this.state.players || typeof this.state.players !== 'object') this.state.players = {};
    this.pending = new Set();
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
      minGames: SHAME_MIN,
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
    } catch (e) { this.warn('scan', e.message); }
  }

  consider(player, now = this.service.now()) {
    const count = this.countFor(player, now);
    const rec = this.state.players[player.id] || { lastAt: 0, streak: false };
    const { post, next } = shameDecision(rec, { count, now });
    const changed = rec.lastAt !== next.lastAt || rec.streak !== next.streak;
    if (changed) { this.state.players[player.id] = next; this.save(); }
    if (!post) return { posted: false, count };
    this.post(player, count, now);
    return { posted: true, count };
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
      const text = wantedSlackText({ name, slackUserId, count });
      const client = this.slack.client;
      const up = await client.uploadImage?.({
        channel,
        filename: 'wanted.png',
        buffer: png,
        title: `WANTED: ${name}`,
        comment: text,
      });
      if (up && up.ok === false) {
        const r = await client.postChannel?.(channel, { text })
          || await client.call?.('chat.postMessage', { channel, text, unfurl_links: false, unfurl_media: false });
        if (r && r.ok === false) this.warn('post', r.error, player.id);
        return r;
      }
      return up;
    })().catch((e) => this.warn('post', e?.message || 'error', player.id)).finally(() => this.pending.delete(job));
    this.pending.add(job);
    return job;
  }

  async idle() { while (this.pending.size) await Promise.allSettled([...this.pending]); }

  previewPng({ name } = {}) {
    return this.sample({ name: name || SAMPLE_NAME });
  }

  warn(kind, error, pid) {
    this.log.warn?.(`[wanted] ${kind} failed: ${String(error || 'unknown').slice(0, 80)}${pid ? ` (player ${pid.slice(0, 8)})` : ''}`);
  }
}

export { CRIME, PUNISHMENT, PROCEDURE, SAMPLE_NAME, SAMPLE_SEED } from './wantedPoster.js';
