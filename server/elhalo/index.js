// EL HALO horde over HTTP: one live match for everyone in the Hall of Doors.
//   GET  /api/elhalo/stream  Server-Sent Events: the whole match ~10 times a second, plus your own bits ("me")
//   POST /api/elhalo/join    drop into the canyon (late joiners get the current wave as it stands)
//   POST /api/elhalo/input   where you are and what you did since last time (~10 a second)
//   POST /api/elhalo/leave   step out (your score stays on the board until the match resets)
//   GET  /api/elhalo/look    your saved look (poncho, sombrero, mustache...); POST it to change and save it
//   POST /api/elhalo/ready   in the lobby: ready or not; POST /api/elhalo/begin  the host starts the countdown
// The sim only runs while someone has the stream open. Free play: no stakes; the only thing saved is your look.
import { Match } from './match.js';
import { MATCH, cleanLook, DEFAULT_LOOK } from './rules.js';
import { groundAt, OPENINGS } from './map.js';

export class ElHalo {
  constructor({ tickMs = 1000 / MATCH.tickHz, now = () => Date.now(), rnd, testHooks = false, store = null } = {}) {
    // looks live in their own little doc on disk (player id -> look), so they survive deploys and new matches
    this.store = store; this.lookDoc = store ? store.loadDoc('elhalo-looks', {}) : {};
    this.match = new Match({ rnd, looks: (id) => this.lookDoc[id] || DEFAULT_LOOK }); this.tickMs = tickMs; this.now = now; this.testHooks = testHooks;
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
    api.get('/elhalo/look', needPlayer, (req, res) => res.json({ look: cleanLook(this.lookDoc[req.player.id] || DEFAULT_LOOK) }));
    api.post('/elhalo/look', needPlayer, (req, res) => {
      const look = cleanLook(req.body?.look);
      this.lookDoc[req.player.id] = look;
      if (this.store) this.store.saveDoc('elhalo-looks', this.lookDoc);
      this.match.setLook(req.player.id, look);
      res.json({ ok: true, look });
    });
    api.post('/elhalo/ready', needPlayer, (req, res) => { const r = this.match.setReady(req.player.id, !!req.body?.ready); if (r.error) return res.status(r.status || 409).json({ error: r.error }); res.json(r); });
    api.post('/elhalo/begin', needPlayer, (req, res) => { const r = this.match.begin(req.player.id); if (r.error) return res.status(r.status || 409).json({ error: r.error }); res.json(r); });
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
      if (b.place && p) { if (p.seat) m.exitJeep(p, true); p.x = +b.place.x; p.z = +b.place.z; p.y = b.place.y !== undefined ? +b.place.y : groundAt(p.x, p.z, 50, m.bars); p.groundY = p.y; p.airT = 0; if (b.place.yaw !== undefined) p.yaw = +b.place.yaw; p.corr = [p.x, p.y, p.z, p.yaw]; p.hist = []; }
      if (b.boards && !OPENINGS[b.boards.i]?.open) m.bars[b.boards.i] = Math.max(0, Math.min(5, b.boards.n | 0));
      if (b.wave) { if (m.phase === 'lobby' || m.phase === 'idle') m.countdown(); m.truck = null; m.wave = (b.wave | 0) - 1; m.phase = 'break'; m.phaseUntil = m.t; m.queue = []; for (const e of m.enemies) e.dead = true; if (b.keepQueue === false) m.queue = []; }
      if (b.empty !== undefined) m.emptyWave = !!b.empty; // (with wave) the wave's queue is dropped on the next tick, for quiet checks
      if (b.clear) { m.queue = []; for (const e of m.enemies) e.dead = true; }
      if (b.truck) { if (m.phase === 'lobby') m.countdown(); if (!m.wave) m.wave = Math.max(1, b.truck | 0); else if (typeof b.truck === 'number') m.wave = b.truck; m.startTruck(); }
      if (b.truckT !== undefined && m.truck) { m.truck.t = +b.truckT; m.truck.at = m.t; }
      if (b.spawn) for (const s of [].concat(b.spawn)) { const e = m.spawn(s.type || 'luchador'); e.x = +s.x; e.z = +s.z; e.y = groundAt(e.x, e.z, 50, m.bars) + (e.st.fly ? (s.fly ?? e.st.fly.cruise) : 0); if (s.y !== undefined) e.y = +s.y; if (s.still) e.spd = 0; if (s.yaw !== undefined) e.yaw = +s.yaw; e.hist = []; }
      if (b.calm !== undefined) m.calm = !!b.calm;
      if (b.night !== undefined) { m.forceNight = b.night === null ? null : !!b.night; m.night = m.forceNight ?? m.wave >= MATCH.nightWave; }
      if (b.give && p) { p.truckGot = -1; m.truck = m.truck || null; const save = m.truck; m.truck = { weapon: b.give, n: -99 }; m.gift(p); m.truck = save; }
      if (b.nades && p) { p.P.nades.frag = b.nades[0] | 0; p.P.nades.sticky = b.nades[1] | 0; }
      if (b.jeep) { if (!m.jeep) m.spawnJeep(); if (b.jeep.x !== undefined) { m.jeep.x = +b.jeep.x; m.jeep.z = +b.jeep.z; m.jeep.y = groundAt(m.jeep.x, m.jeep.z, 50, m.bars); m.jeep.yaw = +(b.jeep.yaw || 0); } }
      if (b.enter && p) m.enterJeep(p);
      if (b.down && p) { p.P.shield = 0; m.hurtPlayer(p, 999, null, { id: 'test' }, 'test'); }
      if (b.pickup) m.pickups.push({ id: m.nextId++, kind: b.pickup.kind, x: +b.pickup.x, z: +b.pickup.z, y: groundAt(+b.pickup.x, +b.pickup.z, 50, m.bars), life: 60 });
      if (b.hp && p) { p.P.health = +b.hp; p.P.shield = 0; }
      res.json({ ok: true, wave: m.wave, phase: m.phase, bars: m.bars, enemies: m.enemies.length, truck: m.truck ? { t: m.truck.t, weapon: m.truck.weapon } : null, jeep: m.jeep ? { x: m.jeep.x, z: m.jeep.z, driver: m.jeep.driver, gunner: m.jeep.gunner } : null, me: p ? { x: p.x, y: p.y, z: p.z, st: p.state, slots: p.slots, seat: p.seat, nades: p.P.nades, hp: p.P.health, sh: p.P.shield } : null });
    });
  }
}
