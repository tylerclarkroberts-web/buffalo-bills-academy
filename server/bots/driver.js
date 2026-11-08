// v38: runs the bots at bot tables, on the server. After every table change it looks at whose turn it is; when it's
// a bot's, it waits a short human-like moment, then decides from the bot's OWN view of the table (engine viewFor, the
// same thing a player's browser gets: only that bot's hole cards) and acts through the normal engine action, so every
// rule (turn order, legal amounts, the turn clock) applies to bots exactly as to people. Bots also rebuy when broke.
import crypto from 'node:crypto';
import * as G from '../engine/game.js';
import { decide } from './brain.js';
import { BOT_CAST, MAX_BOTS } from './names.js';

export const isBotId = (id) => typeof id === 'string' && id.startsWith('bot-');
const rand = () => crypto.randomInt(2 ** 30) / 2 ** 30;

export class BotDriver {
  constructor(service, { delayScale = 1 } = {}) {
    this.service = service; this.delayScale = delayScale; this.timers = new Map(); this.decisions = 0;
  }
  /** Seat `count` bots at a freshly created table (inside the create mutation). */
  seat(t, count, ctx) {
    const n = Math.max(1, Math.min(MAX_BOTS, Math.floor(Number(count) || 0)));
    const cast = [...BOT_CAST].sort(() => rand() - 0.5).slice(0, n);
    for (const c of cast) {
      const id = `bot-${crypto.randomBytes(6).toString('hex')}`;
      const seat = G.joinTable(t, { id, name: c.name }, undefined, ctx);
      t.seats[seat].bot = true;
      (t.bots.cast ||= {})[id] = { name: c.name, wear: c.wear };
    }
  }
  /** How long a bot "thinks": about 1-3 s, longer for big decisions. */
  delay(t) {
    const h = t.hand; const L = G.legalActions(t, h.toAct);
    let ms = 800 + rand() * 1500;
    if (L && L.toCall > 0) ms += 400 + rand() * 600;
    if (h.street === 'river') ms += 500;
    if (L && L.toCall > t.settings.bigBlind * 10) ms += 800 + rand() * 1200;
    return Math.round(ms * this.delayScale);
  }
  /** Called after every table change (and once per table at boot). */
  kick(code) {
    const t = this.service.store.getTable(code);
    const old = this.timers.get(code);
    if (!t || !t.bots || t.status === 'closed') { if (old) { clearTimeout(old.timer); this.timers.delete(code); } return; }
    let key = null, wait = 0;
    const h = t.hand;
    if (h && h.toAct !== null && t.seats[h.toAct]?.bot && !(t.fight?.status === 'running')) { key = `act:${h.number}:${t.version}`; wait = this.delay(t); }
    else if (t.seats.some((s, i) => s?.bot && s.stack === 0 && !(h?.players[i] && !h.players[i].folded))) { key = `rebuy:${t.version}`; wait = Math.round(600 * this.delayScale); }
    if (old && old.key === key) return;
    if (old) clearTimeout(old.timer);
    if (!key) { this.timers.delete(code); return; }
    const timer = setTimeout(() => { this.timers.delete(code); try { this.step(code, key); } catch (e) { console.error(`bot ${code}:`, e.message); } }, wait);
    timer.unref?.();
    this.timers.set(code, { key, timer });
  }
  /** Do the bot move that `key` was scheduled for, if it is still current. Returns what was done (for tests). */
  step(code, key = null) {
    const t = this.service.store.getTable(code);
    if (!t || !t.bots || t.status === 'closed') return null;
    const h = t.hand;
    if (h && h.toAct !== null && t.seats[h.toAct]?.bot) {
      if (key && key !== `act:${h.number}:${t.version}`) return null; // the table moved on (e.g. the hand was cancelled)
      const seat = h.toAct; const botId = t.seats[seat].playerId;
      const view = G.viewFor(t, botId, this.service.now()); // the bot's own view: its two cards and public information only
      let d = null;
      try { d = decide(view, rand); } catch (e) { console.error('bot brain:', e.message); }
      const action = d?.action || { type: view.legal.canCheck ? 'check' : 'fold' };
      this.decisions++;
      try {
        this.service.mutate(code, (tb, ctx) => G.act(tb, botId, { ...action, handNumber: h.number }, ctx), botId);
      } catch (e) { // never stall the table on a bad decision: fall back to the timeout rule
        this.service.mutate(code, (tb, ctx) => G.act(tb, botId, { type: G.legalActions(tb, seat)?.canCheck ? 'check' : 'fold', handNumber: h.number }, ctx), botId);
      }
      return { seat, botId, action, why: d?.why || 'fallback' };
    }
    const broke = t.seats.map((s, i) => (s?.bot && s.stack === 0 && !(h?.players[i] && !h.players[i].folded) ? s.playerId : null)).filter(Boolean);
    if (broke.length) { this.service.mutate(code, (tb, ctx) => { for (const id of broke) G.rebuy(tb, id, ctx); }); return { rebuy: broke }; }
    return null;
  }
  shutdown() { for (const { timer } of this.timers.values()) clearTimeout(timer); this.timers.clear(); }
}
