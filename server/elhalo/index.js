// EL HALO horde over HTTP: one live match for everyone in the Hall of Doors.
//   GET  /api/elhalo/stream  Server-Sent Events: the whole match ~10 times a second, plus your own bits ("me")
//   POST /api/elhalo/join    drop into the canyon (late joiners get the current wave as it stands)
//   POST /api/elhalo/input   where you are and what you did since last time (~10 a second)
//   POST /api/elhalo/leave   step out (your score stays on the board until the match resets)
// The sim only runs while someone has the stream open. Free play: no stakes, nothing saved to disk.
import { Match } from './match.js';
import { MATCH } from './rules.js';
import { groundAt } from './map.js';

export class ElHalo {
  constructor({ tickMs = 1000 / MATCH.tickHz, now = () => Date.now(), rnd, testHooks = false } = {}) {
    this.match = new Match({ rnd }); this.tickMs = tickMs; this.now = now; this.testHooks = testHooks;
    this.streams = new Map(); // connection id -> { res, pid }
    this.current = new Map(); // player id -> connection id
    this.timer = null; this.stoppedAt = 0; this.lastTick = 0; this.nextConn = 1;
  }
  start() {
    if (this.timer || !this.tickMs) return;
    if (this.stoppedAt && this.now() - this.stoppedAt > MATCH.emptyResetSecs * 1000) this.match.reset(true);
    this.lastTick = this.now();
    this.timer = setInterval(() => { try { this.step(); } catch (e) { console.error('[elhalo] tick', e); } }, this.tickMs);
    this.timer.unref?.();
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; this.stoppedAt = this.now(); } }
  step() {
    const now = this.now(), dt = Math.min(0.25, Math.max(0, (now - this.lastTick) / 1000)); this.lastTick = now;
    this.match.tick(dt);
    this.broadcast();
  }
  broadcast() {
    const s = JSON.stringify(this.match.snapshot());
    for (const [cid, c] of this.streams) {
      if (c.res.writableLength > 512 * 1024) { c.res.end(); this.drop(cid); continue; } // a stuck client: let it reconnect
      c.res.write(`data: {"s":${s},"me":${JSON.stringify(this.match.personal(c.pid))}}\n\n`);
    }
  }
  drop(cid) {
    const c = this.streams.get(cid); if (!c) return;
    this.streams.delete(cid);
    if (this.current.get(c.pid) === cid) { this.current.delete(c.pid); this.match.setOnline(c.pid, false); }
    if (!this.streams.size) this.stop();
  }
  shutdown() { for (const c of this.streams.values()) c.res.end(); this.streams.clear(); this.stop(); }

  mount(api, needPlayer) {
    const who = (req) => ({ id: req.player.id, name: String(req.player.name || 'Miner') });
    api.get('/elhalo/stream', needPlayer, (req, res) => {
      const { id } = who(req);
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      const old = this.current.get(id);
      if (old) { const c = this.streams.get(old); this.streams.delete(old); this.current.delete(id); c?.res.write('event: bye\ndata: {}\n\n'); c?.res.end(); }
      const cid = this.nextConn++;
      this.streams.set(cid, { res, pid: id }); this.current.set(id, cid);
      this.match.setOnline(id, true);
      this.start();
      res.write(`retry: 1500\ndata: {"s":${JSON.stringify(this.match.snapshot({ events: false }))},"me":${JSON.stringify(this.match.personal(id))}}\n\n`);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); this.drop(cid); });
    });
    api.post('/elhalo/join', needPlayer, (req, res) => {
      const { id, name } = who(req);
      const r = this.match.join(id, { name, nowMs: this.now() });
      if (r.error) return res.status(409).json({ error: r.error === 'full' ? 'The canyon is full (8 players). Watch for a bit.' : r.error });
      if (!this.current.has(id)) this.match.setOnline(id, false); // joined without a stream: shows up once it connects
      res.json({ ok: true, me: this.match.personal(id) });
    });
    api.post('/elhalo/leave', needPlayer, (req, res) => { this.match.leave(req.player.id); res.json({ ok: true }); });
    api.post('/elhalo/input', needPlayer, (req, res) => {
      const r = this.match.input(req.player.id, req.body, this.now());
      if (r.error) return res.status(r.status || 409).json({ error: r.error });
      res.json({ ok: true });
    });
    if (!this.testHooks) return;
    // Local dev server only (DEV_LOGIN): put people and things where the browser checks and screenshots need them.
    const m = this.match;
    api.post('/elhalo/test', needPlayer, (req, res) => {
      const b = req.body || {}, p = m.players.get(req.player.id);
      if (b.place && p) { p.x = +b.place.x; p.z = +b.place.z; p.y = groundAt(p.x, p.z, 50, m.bars); if (b.place.yaw !== undefined) p.yaw = +b.place.yaw; p.corr = [p.x, p.y, p.z, p.yaw]; p.hist = []; }
      if (b.boards) m.bars[b.boards.i] = Math.max(0, Math.min(5, b.boards.n | 0));
      if (b.wave) { m.wave = (b.wave | 0) - 1; m.phase = 'break'; m.phaseUntil = m.t; m.queue = []; for (const e of m.enemies) e.dead = true; }
      if (b.clear) { m.queue = []; for (const e of m.enemies) e.dead = true; }
      if (b.spawn) for (const s of [].concat(b.spawn)) { const e = m.spawn(s.type || 'luchador'); e.x = +s.x; e.z = +s.z; e.y = groundAt(e.x, e.z, 50, m.bars); if (s.still) e.spd = 0; }
      if (b.calm !== undefined) m.calm = !!b.calm;
      if (b.pts && p) p.pts = b.pts | 0;
      res.json({ ok: true, wave: m.wave, phase: m.phase, bars: m.bars, enemies: m.enemies.length });
    });
  }
}
