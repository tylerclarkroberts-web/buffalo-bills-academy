// EL HALO horde match: one shared world, simulated here and streamed to every client (server/elhalo/index.js).
// The server owns the enemies, boards, waves, grenades, damage and points; clients own their own movement (checked
// here: speed, bounds, walls) and send what they did (shots as rays, grenade throws, smacks, holding ACTION).
// Free play: nothing in here knows about money.
import * as L from './rules.js';
import { BOUNDS, OPENINGS, BOARDS_MAX, ENEMY_SPAWNS, PLAYER_SPAWNS, STATIONS, OBSTACLES, FORT_ROUTES, fortRects,
  buildingAt, fortAt, terrain, groundAt, collide, wallDist, insideSolid, segHitsRect } from './map.js';

const { MATCH } = L;
export const EYE = 1.62;
const P_RADIUS = 0.38, MAX_SPEED = 7.6, MOVE_SLACK = 1.3;
const TYPE_IDX = Object.fromEntries(L.ENEMY_TYPES.map((t, i) => [t, i]));
const STATE_IDX = { walk: 0, hit: 1, tear: 2, tackle: 3, shoot: 4, bless: 5, idle: 6 };
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const finite = (...a) => a.every((v) => typeof v === 'number' && Number.isFinite(v));
const COLORS = 8;

export class Match {
  constructor({ rnd = Math.random } = {}) {
    this.rnd = rnd;
    this.players = new Map(); // id -> record (kept for the scoreboard until the match resets)
    this.reset(true);
  }

  // ---- lifecycle
  reset(hard = false) {
    this.t = 0; this.phase = 'idle'; this.wave = 0; this.phaseUntil = 0; this.queue = []; this.spawnT = 0;
    this.enemies = []; this.notes = []; this.nades = []; this.pickups = []; this.events = []; this.nextId = 1;
    this.bars = OPENINGS.map(() => BOARDS_MAX); this.idleT = 0; this.last = this.last || null;
    if (hard) { this.players.clear(); return; }
    for (const [id, p] of this.players) { if (!p.joined) this.players.delete(id); else this.freshStats(p); }
  }
  freshStats(p) {
    Object.assign(p, { kills: 0, pvp: 0, deaths: 0, score: 0, pts: 500, ammo: 0, boards: 0 });
    this.respawn(p);
  }
  online() { return [...this.players.values()].filter((p) => p.joined && p.online); }
  alive() { return [...this.players.values()].filter((p) => p.joined && p.online && p.state === 'alive'); }
  ev(...e) { this.events.push(e); }

  join(id, { name = 'Miner', nowMs = 0 } = {}) {
    let p = this.players.get(id);
    if (!p) {
      if (this.online().length >= MATCH.maxPlayers) return { error: 'full' };
      const used = new Set([...this.players.values()].map((q) => q.color));
      let color = 0; while (used.has(color) && color < COLORS - 1) color++;
      p = { id, name: String(name).slice(0, 18), color, joined: false, online: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, state: 'dead', P: L.createPlayer(),
        w: 'rifle', moving: 0, firing: 0, lastIn: nowMs, tokens: 3, act: false, actWas: false, build: 0, buildAt: -1, rev: 0, revOf: null, prompt: null,
        hist: [], kills: 0, pvp: 0, deaths: 0, score: 0, pts: 500, ammo: 0, boards: 0, inputs: 0, inWin: 0, until: 0, offT: 0, corr: null, seq: 0 };
      this.players.set(id, p);
      if (this.online().length > MATCH.maxPlayers) { this.players.delete(id); return { error: 'full' }; }
    } else {
      if (!p.joined && this.online().filter((q) => q !== p).length >= MATCH.maxPlayers) return { error: 'full' };
      p.name = String(name).slice(0, 18);
    }
    const was = p.joined;
    p.joined = true; p.online = true; p.offT = 0; p.lastIn = nowMs; p.tokens = 3;
    if (!was) { if (p.state !== 'downed' && !(p.state === 'dead' && p.until > this.t)) this.respawn(p); this.ev('j', id, p.name); }
    if (this.phase === 'idle') { this.phase = 'break'; this.wave = 0; this.phaseUntil = this.t + MATCH.firstBreakSecs; }
    return { ok: true, player: p };
  }
  leave(id) {
    const p = this.players.get(id); if (!p || !p.joined) return;
    p.joined = false; p.act = false; this.ev('l', id);
  }
  setOnline(id, on) {
    const p = this.players.get(id); if (!p) return;
    p.online = !!on; p.offT = 0; if (!on) { p.act = false; }
  }

  respawn(p) {
    const far = PLAYER_SPAWNS.map(([x, z]) => ({ x, z, d: Math.min(99, ...this.enemies.map((e) => Math.hypot(e.x - x, e.z - z))) })).sort((a, b) => b.d - a.d);
    const s = far[Math.floor(this.rnd() * Math.min(3, far.length))];
    p.x = s.x + (this.rnd() - 0.5) * 1.5; p.z = s.z + (this.rnd() - 0.5) * 1.5; p.y = groundAt(p.x, p.z, 50, this.bars);
    p.yaw = Math.atan2(p.x, p.z); p.pitch = 0; // face down the canyon toward the middle
    p.P = L.createPlayer(); p.state = 'alive'; p.until = 0; p.hist = []; p.build = 0; p.rev = 0;
    p.corr = [r2(p.x), r2(p.y), r2(p.z), r2(p.yaw)];
  }

  // ---- input from one client. msg: { p:[x,y,z], yaw, pitch, w, act, ev:[...] }. Returns { ok } or { error }.
  input(id, msg, nowMs) {
    const p = this.players.get(id);
    if (!p || !p.joined) return { error: 'not in the match' };
    if (!msg || typeof msg !== 'object') return { error: 'bad input' };
    // rate limit: 30 messages a second, measured over a sliding one-second window
    if (nowMs - p.inWin >= 1000) { p.inWin = nowMs; p.inputs = 0; }
    if (++p.inputs > 30) return { error: 'slow down', status: 429 };
    const dtMs = Math.max(0, nowMs - p.lastIn); p.lastIn = nowMs; p.online = true; p.offT = 0;
    const dt = Math.min(1, dtMs / 1000);
    if (finite(msg.yaw)) p.yaw = ((msg.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (finite(msg.pitch)) p.pitch = Math.max(-1.5, Math.min(1.5, msg.pitch));
    if (msg.w === 'rifle' || msg.w === 'pistol') p.w = msg.w;
    p.act = !!msg.act;
    if (p.state === 'alive' && Array.isArray(msg.p) && msg.p.length === 3 && finite(...msg.p)) this.move(p, msg.p[0], msg.p[1], msg.p[2], dt);
    else if (p.state !== 'alive' && Array.isArray(msg.p) && finite(...msg.p) && Math.hypot(msg.p[0] - p.x, msg.p[2] - p.z) > 0.6) p.corr = [r2(p.x), r2(p.y), r2(p.z)];
    // fire-rate bucket for the gun in hand
    p.tokens = Math.min(3, p.tokens + dt * L.WEAPONS[p.w].rate * 1.15);
    const evs = Array.isArray(msg.ev) ? msg.ev.slice(0, 24) : [];
    for (const e of evs) {
      if (!Array.isArray(e) || p.state !== 'alive') continue;
      if (e[0] === 's' && e.length >= 7 && finite(...e.slice(1, 7))) this.shot(p, { x: e[1], y: e[2], z: e[3] }, { x: e[4], y: e[5], z: e[6] });
      else if (e[0] === 'g' && e.length >= 4 && finite(...e.slice(1, 4))) this.throwNade(p, { x: e[1], y: e[2], z: e[3] });
      else if (e[0] === 'm') this.melee(p);
    }
    return { ok: true };
  }

  move(p, x, y, z, dt) {
    const reject = () => { p.corr = [r2(p.x), r2(p.y), r2(p.z)]; };
    if (x < BOUNDS.x0 - 0.2 || x > BOUNDS.x1 + 0.2 || z < BOUNDS.z0 - 0.2 || z > BOUNDS.z1 + 0.2) return reject();
    const dist = Math.hypot(x - p.x, z - p.z);
    if (dist > MAX_SPEED * Math.max(0.1, dt) + MOVE_SLACK) return reject();
    const g = groundAt(x, z, y, this.bars);
    if (y < terrain(x, z) - 0.6 || y > g + 2.6) return reject();
    if (y - p.y > 1.5 + 2 * Math.min(dt, 0.5)) return reject(); // a jump tops out near 1.2 m: no hopping onto roofs
    // no walking through walls or boards: check the path at knee and chest height, and the end spot
    if (dist > 0.05) {
      const d = { x: (x - p.x) / dist, y: 0, z: (z - p.z) / dist };
      for (const h of [0.6, 1.3]) { const o = { x: p.x, y: Math.max(p.y, y) + h, z: p.z }; if (wallDist(o, d, dist + 0.1, this.bars, true) < dist - 0.05) return reject(); }
    }
    const q = { x, z }; collide(q, P_RADIUS * 0.6, y, 1.8, this.bars);
    if (Math.hypot(q.x - x, q.z - z) > 0.2) {
      const was = { x: p.x, z: p.z }; collide(was, P_RADIUS * 0.6, p.y, 1.8, this.bars); // already wedged somewhere? let them wriggle out
      if (Math.hypot(was.x - p.x, was.z - p.z) <= 0.2 || dist > 1.5) return reject();
    }
    p.moving = dist > 0.03 ? 1 : 0; p.x = x; p.y = y; p.z = z;
  }

  // ---- combat
  shot(p, o, d) {
    if (p.tokens < 1) return; p.tokens -= 1;
    const len = Math.hypot(d.x, d.y, d.z); if (len < 0.5 || len > 1.5) return;
    d = { x: d.x / len, y: d.y / len, z: d.z / len };
    if (Math.hypot(o.x - p.x, o.y - (p.y + EYE), o.z - p.z) > 2) return;
    const w = L.WEAPONS[p.w]; p.firing = 2;
    const wd = wallDist(o, d, 140, this.bars);
    let best = wd, hitE = null, hitP = null, head = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      for (const h of [[e.x, e.y, e.z], ...e.hist]) {
        const c = { x: h[0], y: h[1] + e.st.height * 0.5, z: h[2] };
        const t = L.raySphere(o, d, c, e.st.radius * 1.4); if (t < best) { best = t; hitE = e; hitP = null; head = false; }
        const th = L.raySphere(o, d, { x: h[0], y: h[1] + e.st.height * 0.9, z: h[2] }, 0.3); if (th < best) { best = th; hitE = e; hitP = null; head = true; }
      }
    }
    for (const q of this.players.values()) {
      if (q === p || !q.joined || !q.online || q.state !== 'alive') continue;
      for (const h of [[q.x, q.y, q.z], ...q.hist]) {
        const t = L.raySphere(o, d, { x: h[0], y: h[1] + 1.0, z: h[2] }, 0.52); if (t < best) { best = t; hitP = q; hitE = null; head = false; }
        const th = L.raySphere(o, d, { x: h[0], y: h[1] + 1.62, z: h[2] }, 0.27); if (th < best) { best = th; hitP = q; hitE = null; head = true; }
      }
    }
    const hx = o.x + d.x * best, hy = o.y + d.y * best, hz = o.z + d.z * best;
    this.ev('s', p.id, r2(o.x), r2(o.y), r2(o.z), r2(hx), r2(hy), r2(hz), hitE ? 1 : hitP ? 2 : 0);
    const mult = head ? (p.w === 'pistol' ? 1.7 : 1.25) : 1;
    if (hitE) this.hurtEnemy(hitE, w.damage * mult, 'gun', p, o);
    else if (hitP) this.hurtPlayer(hitP, w.damage * mult, { x: p.x, z: p.z }, p, head ? 'head' : 'gun');
  }
  throwNade(p, o) {
    if (Math.hypot(o.x - p.x, o.y - (p.y + EYE), o.z - p.z) > 2) return;
    if (!L.throwGrenade(p.P)) return;
    const cp = Math.cos(p.pitch), f = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
    const n = { id: this.nextId++, by: p.id, x: o.x + f.x * 0.6, y: o.y - 0.15 + f.y * 0.6, z: o.z + f.z * 0.6,
      vx: f.x * L.GRENADES.speed, vy: f.y * L.GRENADES.speed + L.GRENADES.lift, vz: f.z * L.GRENADES.speed, fuse: L.GRENADES.fuse };
    if (insideSolid(n, this.bars)) { n.x = o.x; n.y = o.y - 0.2; n.z = o.z; }
    this.nades.push(n); this.ev('g', p.id);
  }
  melee(p) {
    if (!L.tryMelee(p.P, this.t)) return;
    this.ev('ml', p.id);
    const f = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
    const inCone = (x, z, y, r) => { const dx = x - p.x, dz = z - p.z, dd = Math.hypot(dx, dz); return dd < L.MELEE.range + r && Math.abs(y - p.y) < 1.8 && (dx * f.x + dz * f.z) / (dd || 1) > 0.45; };
    for (const e of this.enemies) if (!e.dead && inCone(e.x, e.z, e.y, e.st.radius)) this.hurtEnemy(e, L.MELEE.damage, 'melee', p, p);
    for (const q of this.players.values()) if (q !== p && q.joined && q.online && q.state === 'alive' && inCone(q.x, q.z, q.y, P_RADIUS)) this.hurtPlayer(q, L.MELEE.damage, { x: p.x, z: p.z }, p, 'melee');
  }
  explode(n) {
    this.ev('x', r2(n.x), r2(n.y), r2(n.z));
    const by = this.players.get(n.by);
    for (const e of this.enemies) { if (e.dead) continue; const dmg = L.splash(Math.hypot(e.x - n.x, e.y + e.st.height * 0.5 - n.y, e.z - n.z)); if (dmg > 0) this.hurtEnemy(e, dmg, 'grenade', by, n); }
    for (const q of this.players.values()) {
      if (!q.joined || !q.online || q.state !== 'alive') continue;
      let dmg = L.splash(Math.hypot(q.x - n.x, q.y + 1 - n.y, q.z - n.z)); if (q.id === n.by) dmg = Math.round(dmg * 0.5);
      if (dmg > 0) this.hurtPlayer(q, dmg, { x: n.x, z: n.z }, by && by !== q ? by : null, 'grenade');
    }
  }

  hurtEnemy(e, dmg, how, by, from) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 1;
    if (from) { const k = how === 'melee' ? 1.2 : how === 'grenade' ? 0.8 : 0.04; const dx = e.x - from.x, dz = e.z - from.z, dd = Math.hypot(dx, dz) || 1; e.x += dx / dd * k; e.z += dz / dd * k; collide(e, e.st.radius, e.y, e.st.height, this.bars, true); }
    if (by) { by.pts += MATCH.points.hit; by.score += MATCH.points.hit; this.ev('hm', by.id); }
    if (e.hp > 0) return;
    e.dead = true;
    const pts = L.killPoints(e.type, how);
    if (by) { by.kills++; by.pts += pts; by.score += pts; }
    this.ev('k', e.id, TYPE_IDX[e.type], r2(e.x), r2(e.y), r2(e.z), by ? by.id : null, how);
    const roll = this.rnd();
    const kind = roll < 0.16 ? 'ammo' : roll < 0.24 ? 'health' : roll < 0.29 ? 'grenade' : null;
    if (kind && this.pickups.length < 12) this.pickups.push({ id: this.nextId++, kind, x: e.x, z: e.z, y: groundAt(e.x, e.z, e.y + 1, this.bars), life: MATCH.pickupLife });
  }

  hurtPlayer(q, amount, from, by, how) {
    if (q.state !== 'alive') return;
    if (this.calm && !(by && by.id)) return; // test hook: the horde is all bark
    const r = L.applyDamage(q.P, amount, this.t);
    this.ev('h', q.id, from ? r1(from.x) : null, from ? r1(from.z) : null, Math.round(amount), r.toShield > 0 ? 1 : 0, r.shieldBroke ? 1 : 0);
    if (!r.dead) return;
    q.state = 'downed'; q.until = this.t + MATCH.downedSecs; q.deaths++; q.act = false; q.build = 0;
    if (by && by !== q && typeof by === 'object' && by.id) { by.pvp++; by.pts += MATCH.points.pvpKill; by.score += MATCH.points.pvpKill; this.ev('pvp', by.id, q.id, how || 'gun'); }
    this.ev('dn', q.id);
  }

  // ---- the tick
  tick(dt) {
    this.t += dt;
    const t = this.t;
    // offline players drop out after a while; an empty match resets
    for (const p of this.players.values()) {
      if (!p.joined) continue;
      if (!p.online) { p.offT += dt; if (p.offT >= MATCH.offlineDropSecs) { p.joined = false; this.ev('l', p.id); } }
    }
    const online = this.online();
    if (!online.length) {
      if (this.phase !== 'idle') { this.idleT += dt; if (this.idleT >= MATCH.emptyResetSecs) this.reset(); }
      this.flush(); return;
    }
    this.idleT = 0;
    // history for lag-forgiving hit checks (last two ticks)
    for (const e of this.enemies) { e.hist.unshift([e.x, e.y, e.z]); e.hist.length = Math.min(e.hist.length, 2); }
    for (const p of online) { p.hist.unshift([p.x, p.y, p.z]); p.hist.length = Math.min(p.hist.length, 2); if (p.firing > 0) p.firing--; }

    // players: shields, timers, the ACTION button
    for (const p of online) {
      if (p.state === 'alive') L.tickShield(p.P, t, dt);
      else if (p.state === 'downed' && t >= p.until) { p.state = 'dead'; p.until = t + MATCH.respawnSecs; this.ev('dd', p.id); }
      else if (p.state === 'dead' && this.phase !== 'over' && t >= p.until) this.respawn(p);
    }
    for (const p of online) this.action(p, dt);
    this.phases(dt);
    this.ai(dt);
    this.projectiles(dt);
    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i]; k.life -= dt;
      const who = online.find((p) => p.state === 'alive' && Math.hypot(p.x - k.x, p.z - k.z) < 1.4 && Math.abs(p.y - k.y) < 1.8);
      let took = false;
      if (who) {
        if (k.kind === 'ammo') { who.ammo++; took = true; }
        else if (k.kind === 'health' && who.P.health < L.HEALTH.max) { L.heal(who.P, 40); took = true; }
        else if (k.kind === 'grenade') took = L.addGrenade(who.P, 1) > 0;
      }
      if (took) this.ev('pk', k.id, who.id, k.kind);
      if (took || k.life <= 0) this.pickups.splice(i, 1);
    }
    for (const e of this.enemies) if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 6);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.flush();
  }
  flush() { if (this.events.length > 400) this.events.splice(0, this.events.length - 400); }

  phases() {
    const t = this.t, alive = this.alive();
    if (this.phase !== 'over' && this.phase !== 'idle' && !alive.length && this.online().some((p) => p.state !== 'alive') && this.wave > 0) {
      this.phase = 'over'; this.phaseUntil = t + MATCH.overSecs;
      const board = [...this.players.values()].sort((a, b) => b.score - a.score).slice(0, 8).map((p) => ({ id: p.id, name: p.name, score: p.score, kills: p.kills, pvp: p.pvp }));
      this.last = { wave: this.wave, board };
      this.ev('over', this.wave); return;
    }
    if (this.phase === 'over' && t >= this.phaseUntil) {
      this.reset(); this.phase = 'break'; this.phaseUntil = this.t + MATCH.firstBreakSecs; this.ev('new'); return;
    }
    if (this.phase === 'break' && t >= this.phaseUntil) {
      this.wave++; this.phase = 'wave';
      this.queue = L.waveRoster(this.wave, Math.max(1, this.online().length), this.rnd); this.spawnT = t + 0.5;
      for (const p of this.online()) {
        if (p.state === 'alive') L.heal(p.P, L.HEALTH.max);
        else if (p.state === 'dead') this.respawn(p);
      }
      this.boardPts = new Map();
      this.ev('wave', this.wave); return;
    }
    if (this.phase === 'wave') {
      const sc = L.waveScale(this.wave);
      if (this.queue.length && t >= this.spawnT && this.enemies.length < MATCH.maxAlive) { this.spawn(this.queue.shift(), sc); this.spawnT = t + sc.gap; }
      if (!this.queue.length && !this.enemies.length) {
        this.phase = 'break'; this.phaseUntil = t + MATCH.breakSecs;
        for (const p of this.online()) { if (p.state === 'alive') { p.pts += L.waveBonus(this.wave); p.score += L.waveBonus(this.wave); L.addGrenade(p.P, 1); } }
        this.ev('clear', this.wave);
      }
    }
  }

  spawn(type, sc = L.waveScale(this.wave || 1)) {
    const ps = this.alive();
    const opts = ENEMY_SPAWNS.map(([x, z]) => ({ x, z, d: ps.length ? Math.min(...ps.map((p) => Math.hypot(p.x - x, p.z - z))) : 99 }));
    let pool = opts.filter((o) => o.d > 22); if (!pool.length) pool = opts.sort((a, b) => b.d - a.d).slice(0, 3);
    const s = pool[Math.floor(this.rnd() * pool.length)];
    const st = L.ENEMIES[type];
    const e = { id: this.nextId++, type, st, x: s.x + (this.rnd() - 0.5) * 2, z: s.z + (this.rnd() - 0.5) * 2, y: 0, yaw: 0,
      hp: Math.round(st.hp * sc.hp), maxHp: Math.round(st.hp * sc.hp), spd: st.speed * sc.speed * (0.92 + this.rnd() * 0.16), dmg: sc.damage,
      cool: 0.8 + this.rnd(), tcool: 1 + this.rnd() * 2, tackle: 0, tdir: null, ncool: 1 + this.rnd(), bcool: 2, haste: 0, state: 'walk', act: 0,
      target: null, retarget: 0, route: null, hist: [], chk: { x: 0, z: 0, t: 0 }, detour: null, los: false, losT: 0, flash: 0, strafe: this.rnd() < 0.5 ? 1 : -1, strafeT: 0, dead: false };
    e.y = groundAt(e.x, e.z, 50, this.bars);
    this.enemies.push(e); this.ev('sp', e.id);
    return e;
  }

  // ---- enemy brains
  ai(dt) {
    const t = this.t, ps = this.alive();
    for (const e of this.enemies) {
      if (e.dead) continue;
      const st = e.st;
      e.cool -= dt; e.tcool -= dt; e.ncool -= dt; e.bcool -= dt; e.strafeT -= dt; if (e.act > 0) e.act -= dt;
      e.retarget -= dt;
      if (e.retarget <= 0 || !e.target || e.target.state !== 'alive' || !e.target.online || !e.target.joined) {
        e.retarget = 1; e.target = null; let bd = Infinity;
        for (const p of ps) { const d = Math.hypot(p.x - e.x, p.z - e.z) + (e.route && buildingAt(p.x, p.z)?.id === e.route.bid ? -6 : 0); if (d < bd) { bd = d; e.target = p; } }
      }
      const tg = e.target;
      let vx = 0, vz = 0, spd = e.spd * (e.haste > t ? (st.bless ? 1 : L.ENEMIES.padre.bless.haste) : 1);
      e.state = 'walk';
      if (!tg) { e.state = 'idle'; this.stepEnemy(e, 0, 0, 0, dt); continue; }
      const goal = this.goalFor(e, tg, dt);
      if (goal === 'tear') { e.state = 'tear'; this.stepEnemy(e, 0, 0, 0, dt); continue; }
      let dx = goal.x - e.x, dz = goal.z - e.z; const gd = Math.hypot(dx, dz) || 1; dx /= gd; dz /= gd;
      const tdx = tg.x - e.x, tdz = tg.z - e.z, d = Math.hypot(tdx, tdz) || 1;
      const direct = goal.direct;
      if (e.losT <= 0) { e.losT = 0.4; const o = { x: e.x, y: e.y + st.height * 0.85, z: e.z }, to = { x: tg.x - o.x, y: tg.y + 1.2 - o.y, z: tg.z - o.z }; const l = Math.hypot(to.x, to.y, to.z) || 1; e.los = wallDist(o, { x: to.x / l, y: to.y / l, z: to.z / l }, l, this.bars) >= l - 0.4; } else e.losT -= dt;
      const close = d < st.reach && Math.abs(tg.y - e.y) < 1.6;
      // the tackle
      if (e.tackle > 0) {
        e.tackle -= dt; e.state = 'tackle';
        vx = e.tdir.x; vz = e.tdir.z; spd = e.spd * st.tackle.speed;
        for (const p of ps) if (Math.hypot(p.x - e.x, p.z - e.z) < st.reach + 0.3 && Math.abs(p.y - e.y) < 1.6) { this.hurtPlayer(p, st.tackle.damage * e.dmg, e, null, 'tackle'); e.tackle = 0; e.cool = st.every; break; }
      } else if (close) {
        e.state = 'hit';
        if (e.cool <= 0) { e.cool = st.every; e.act = 0.3; this.hurtPlayer(tg, st.hit * e.dmg, e, null, e.type); }
      } else if (e.type === 'luchador' && direct && e.los && d < st.tackle.range && d > 2.2 && e.tcool <= 0) {
        e.tackle = st.tackle.time; e.tcool = st.tackle.cool; e.tdir = { x: tdx / d, z: tdz / d }; e.state = 'tackle'; this.ev('tk', e.id);
        vx = e.tdir.x; vz = e.tdir.z; spd = e.spd * st.tackle.speed;
      } else if (e.type === 'mariachi' && direct && e.los && d < st.note.range) {
        const keep = st.note.keep;
        if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = 1.4 + this.rnd() * 1.8; }
        if (d > keep + 3) { vx = dx; vz = dz; } else if (d < keep - 4) { vx = -tdx / d * 0.8; vz = -tdz / d * 0.8; } else { vx = -tdz / d * e.strafe * 0.7; vz = tdx / d * e.strafe * 0.7; }
        if (e.ncool <= 0) { e.ncool = st.note.every * (0.8 + this.rnd() * 0.5); e.state = 'shoot'; e.act = 0.35; this.note(e, tg); }
      } else if (e.type === 'padre' && direct && d < st.keep && e.los) {
        if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = 2 + this.rnd() * 2; }
        vx = -tdz / d * e.strafe * 0.5; vz = tdx / d * e.strafe * 0.5;
      } else { vx = dx; vz = dz; }
      if (e.type === 'padre' && e.bcool <= 0) {
        e.bcool = st.bless.every; let n = 0;
        for (const o of this.enemies) { if (o.dead || Math.hypot(o.x - e.x, o.z - e.z) > st.bless.radius) continue; o.hp = Math.min(o.maxHp, o.hp + o.maxHp * st.bless.heal); if (o !== e) { o.haste = t + st.bless.time; n++; } }
        if (n) { e.state = 'bless'; e.act = 0.6; this.ev('bl', e.id); }
      }
      this.stepEnemy(e, vx, vz, spd, dt, tg);
    }
  }
  stepEnemy(e, vx, vz, spd, dt, tg) {
    const st = e.st;
    if (e.detour && (vx || vz)) { e.detour.t -= dt; vx = e.detour.x; vz = e.detour.z; if (e.detour.t <= 0) e.detour = null; }
    const vl = Math.hypot(vx, vz); if (vl > 1) { vx /= vl; vz /= vl; }
    e.x += vx * spd * dt; e.z += vz * spd * dt;
    for (const o of this.enemies) { if (o === e || o.dead) continue; const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), mm = (st.radius + o.st.radius) * 0.9; if (od < mm && od > 1e-4) { e.x += ox / od * (mm - od) * 0.5; e.z += oz / od * (mm - od) * 0.5; } }
    for (const p of this.players.values()) { if (!p.joined || !p.online || p.state === 'dead') continue; const ox = e.x - p.x, oz = e.z - p.z, od = Math.hypot(ox, oz), mm = st.radius + P_RADIUS * 0.9; if (od < mm && od > 1e-4 && Math.abs(p.y - e.y) < 1.5) { e.x = p.x + ox / od * mm; e.z = p.z + oz / od * mm; } }
    collide(e, st.radius, e.y, st.height, this.bars, true);
    e.y = groundAt(e.x, e.z, e.y, this.bars);
    const face = tg && (e.state !== 'walk' || Math.hypot(tg.x - e.x, tg.z - e.z) < 12) ? { x: tg.x - e.x, z: tg.z - e.z } : vl > 0.1 ? { x: vx, z: vz } : null;
    if (e.state === 'tear' && e.route) { const op = OPENINGS[e.route.op]; e.yaw = Math.atan2(-(op.x - e.x), -(op.z - e.z)); }
    else if (face) e.yaw = Math.atan2(-face.x, -face.z);
    e.chk.t += dt;
    if (e.chk.t > 0.8) {
      const moved = Math.hypot(e.x - e.chk.x, e.z - e.chk.z);
      if (moved < 0.35 && vl > 0.3 && !e.detour && e.state === 'walk') { const sgn = this.rnd() < 0.5 ? 1 : -1; e.detour = { x: -vz * sgn, z: vx * sgn, t: 0.9 }; }
      e.chk = { x: e.x, z: e.z, t: 0 };
    }
  }

  // Where should e head for to reach tg? Returns a point ({x,z,direct}) or 'tear' while it is pulling boards.
  goalFor(e, tg, dt) {
    const eb = buildingAt(e.x, e.z), tb = buildingAt(tg.x, tg.z);
    const near = (pt, r) => Math.hypot(pt.x - e.x, pt.z - e.z) < r;
    const pickOp = (bid) => {
      const ops = OPENINGS.filter((o) => o.b === bid).map((o) => ({ o, d: Math.hypot(o.out.x - e.x, o.out.z - e.z) + (this.bars[o.i] ? 2 : 0) })).sort((a, b) => a.d - b.d);
      return ops[Math.min(ops.length - 1, this.rnd() < 0.7 ? 0 : 1)].o;
    };
    // already inside the target's building, or both outside: no route through an opening needed
    if (e.route && ((e.route.dir === 'in' && eb && eb.id === e.route.bid) || (e.route.dir === 'out' && !eb) || (e.route.dir === 'in' && tb?.id !== e.route.bid) || (e.route.dir === 'out' && eb && eb.id !== e.route.bid))) e.route = null;
    if (eb && eb !== tb) { // get out first
      if (!e.route || e.route.dir !== 'out') { const op = pickOp(eb.id); e.route = { dir: 'out', bid: eb.id, op: op.i, stage: 0 }; }
    } else if (tb && eb !== tb) {
      if (!e.route || e.route.dir !== 'in' || e.route.bid !== tb.id) { const op = pickOp(tb.id); e.route = { dir: 'in', bid: tb.id, op: op.i, stage: 0 }; }
    } else e.route = null;
    if (e.route) {
      const op = OPENINGS[e.route.op], from = e.route.dir === 'in' ? op.out : op.in, to = e.route.dir === 'in' ? op.in : op.out;
      if (e.route.stage === 0) {
        if (!near(from, 0.9)) return this.around(e, from, e.route.dir === 'in' ? null : eb.id);
        e.route.stage = 1; e.tearT = e.st.tear;
      }
      if (this.bars[op.i] > 0) {
        if (!near(from, 1.6)) { e.route.stage = 0; return from; }
        e.tearT = (e.tearT ?? e.st.tear) - dt;
        if (e.tearT <= 0) { this.bars[op.i]--; e.tearT = e.st.tear; e.act = 0.4; this.ev('bb', op.i, e.id); }
        return 'tear';
      }
      return to;
    }
    // forts have open doorways: go round to one rather than into the wall
    const ef = fortAt(e.x, e.z, e.y), tf = fortAt(tg.x, tg.z, tg.y + 0.01);
    if (ef !== tf) {
      const f = ef || tf, out = !!ef;
      if (!e.door || e.door.f !== f.id || e.door.out !== out) { const dd = f.doors.map((d) => ({ d, k: Math.hypot((out ? d.in : d.out).x - e.x, (out ? d.in : d.out).z - e.z) })).sort((a, b) => a.k - b.k)[0].d; e.door = { f: f.id, out, d: dd, stage: 0 }; }
      const a = out ? e.door.d.in : e.door.d.out, b = out ? e.door.d.out : e.door.d.in;
      if (e.door.stage === 0 && near(a, 0.9)) e.door.stage = 1;
      if (e.door.stage === 0) return out ? a : this.around(e, a, null);
      return b;
    }
    e.door = null;
    // a player up on a fort deck: take the stair
    const fort = fortRects.find((f) => tg.y > f.y + 2.4 && tg.x > f.x0 - 0.5 && tg.x < f.x1 + 0.5 && tg.z > f.z0 - 0.5 && tg.z < f.z1 + 0.5);
    if (fort && e.y < fort.y + 2.4) {
      const way = FORT_ROUTES[fort.id];
      if (e.fortStep == null || e.fortId !== fort.id) { e.fortStep = 0; e.fortId = fort.id; }
      if (e.fortStep < way.length && near(way[e.fortStep], 0.9)) e.fortStep++;
      if (e.fortStep < way.length) return e.fortStep === 0 ? this.around(e, way[0], null) : way[e.fortStep];
    } else e.fortStep = null;
    const g = this.around(e, tg, eb?.id); g.direct = !g.via; return g;
  }
  // Head for p, walking round any building or fort in the way (except the one we are in or heading into).
  around(e, p, skip) {
    for (const r of OBSTACLES) {
      if (r.id === skip) continue;
      if (p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) continue;
      if (!segHitsRect(e, p, r, 0.5)) continue;
      const m = 1.5, cs = [{ x: r.x0 - m, z: r.z0 - m }, { x: r.x1 + m, z: r.z0 - m }, { x: r.x0 - m, z: r.z1 + m }, { x: r.x1 + m, z: r.z1 + m }];
      let best = null, bd = Infinity;
      for (const c of cs) {
        if (Math.hypot(c.x - e.x, c.z - e.z) < 0.6) continue;
        const cost = Math.hypot(c.x - e.x, c.z - e.z) + Math.hypot(p.x - c.x, p.z - c.z) + (segHitsRect(e, c, r, 0.3) ? 40 : 0) + (segHitsRect(c, p, r, 0.3) ? 20 : 0);
        if (cost < bd) { bd = cost; best = c; }
      }
      if (best) return { x: best.x, z: best.z, via: true };
    }
    return { x: p.x, z: p.z };
  }

  note(e, tg) {
    const o = { x: e.x - Math.sin(e.yaw) * 0.4, y: e.y + 1.45, z: e.z - Math.cos(e.yaw) * 0.4 };
    const aim = { x: tg.x + (this.rnd() - 0.5) * 1.2 - o.x, y: tg.y + 1.1 + (this.rnd() - 0.5) * 0.6 - o.y, z: tg.z + (this.rnd() - 0.5) * 1.2 - o.z };
    const l = Math.hypot(aim.x, aim.y, aim.z) || 1, sp = e.st.note.speed;
    this.notes.push({ id: this.nextId++, ...o, vx: aim.x / l * sp, vy: aim.y / l * sp, vz: aim.z / l * sp, life: 2.6, dmg: e.st.note.damage * e.dmg, fx: e.x, fz: e.z });
    this.ev('nt', e.id);
  }
  projectiles(dt) {
    const ps = this.alive();
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i]; n.life -= dt; let gone = n.life <= 0;
      for (let s = 0; s < 3 && !gone; s++) {
        n.x += n.vx * dt / 3; n.y += n.vy * dt / 3; n.z += n.vz * dt / 3;
        const hit = ps.find((p) => Math.hypot(n.x - p.x, (n.y - p.y - 1.0) * 0.8, n.z - p.z) < 0.65);
        if (hit) { this.hurtPlayer(hit, n.dmg, { x: n.fx, z: n.fz }, null, 'note'); gone = true; }
        else if (n.y < terrain(n.x, n.z) || insideSolid(n, this.bars)) gone = true;
      }
      if (gone) this.notes.splice(i, 1);
    }
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const g = this.nades[i]; g.fuse -= dt;
      for (let s = 0; s < 2; s++) {
        const h = dt / 2, was = { x: g.x, y: g.y, z: g.z };
        g.vy -= 18 * h; g.x += g.vx * h; g.y += g.vy * h; g.z += g.vz * h;
        const floor = Math.max(terrain(g.x, g.z), groundAt(g.x, g.z, was.y, this.bars)) + 0.12;
        if (g.y < floor) { g.y = floor; g.vy = Math.abs(g.vy) * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
        if (insideSolid(g, this.bars)) { g.x = was.x; g.y = was.y; g.z = was.z; g.vx *= -0.4; g.vz *= -0.4; }
        g.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, g.x)); g.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, g.z));
      }
      if (g.fuse <= 0) { this.explode(g); this.nades.splice(i, 1); }
    }
  }

  // ---- ACTION: revive a downed friend > rebuild a board > buy from a wall crate
  action(p, dt) {
    p.prompt = null;
    if (p.state !== 'alive') { p.actWas = p.act; return; }
    const downed = [...this.players.values()].find((q) => q !== p && q.joined && q.online && q.state === 'downed' && Math.hypot(q.x - p.x, q.z - p.z) < MATCH.reviveRange);
    if (downed) {
      if (p.act) {
        if (p.revOf !== downed.id) { p.revOf = downed.id; p.rev = 0; }
        p.rev += dt;
        if (p.rev >= MATCH.reviveSecs) {
          downed.state = 'alive'; downed.P.dead = false; downed.P.health = 50; downed.P.shield = 0; downed.P.lastHit = this.t; downed.until = 0;
          p.pts += MATCH.points.revive; p.score += MATCH.points.revive; p.rev = 0; p.revOf = null; this.ev('rv', downed.id, p.id);
        }
      } else { p.rev = 0; p.revOf = null; }
      p.prompt = { k: 'revive', label: downed.name, p: p.rev / MATCH.reviveSecs };
      p.actWas = p.act; return;
    }
    p.rev = 0; p.revOf = null;
    let op = null, od = Infinity;
    for (const o of OPENINGS) { if (this.bars[o.i] >= BOARDS_MAX) continue; const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < MATCH.buildRange && d < od && Math.abs(p.y - o.y) < 1.6) { od = d; op = o; } }
    if (op) {
      const b = op.box, m = 0.5;
      const blocked = [...this.enemies, ...this.online()].some((q) => !q.dead && q.state !== 'dead' && q.x > b.x0 - m && q.x < b.x1 + m && q.z > b.z0 - m && q.z < b.z1 + m);
      if (p.act && !blocked) {
        if (p.buildAt !== op.i) { p.buildAt = op.i; p.build = 0; }
        p.build += dt;
        if (p.build >= MATCH.buildSecs) {
          p.build = 0; this.bars[op.i]++;
          const got = this.boardPts?.get(p.id) || 0;
          if (got < MATCH.points.boardsPerRound) { p.pts += MATCH.points.board; p.score += MATCH.points.board; this.boardPts?.set(p.id, got + 1); }
          p.boards++; this.ev('br', op.i, p.id);
        }
      } else p.build = 0;
      p.prompt = { k: 'build', label: `${this.bars[op.i]}/${BOARDS_MAX}`, p: p.build / MATCH.buildSecs, op: op.i };
      p.actWas = p.act; return;
    }
    p.build = 0; p.buildAt = -1;
    const stn = STATIONS.find((s) => Math.hypot(s.x - p.x, s.z - p.z) < MATCH.buyRange && Math.abs(p.y - s.y) < 1.6);
    if (stn) {
      if (p.act && !p.actWas) {
        if (p.pts >= stn.cost) {
          p.pts -= stn.cost;
          if (stn.kind === 'ammo') p.ammo++; else L.addGrenade(p.P, 2);
          this.ev('buy', p.id, stn.kind);
        } else this.ev('broke', p.id);
      }
      p.prompt = { k: 'buy', label: stn.label, cost: stn.cost };
    }
    p.actWas = p.act;
  }

  // ---- what every client sees (built once a tick) and the bit only you see
  snapshot({ events = true } = {}) {
    const pl = [];
    for (const p of this.players.values()) {
      const here = p.joined && p.online;
      pl.push([p.id, p.name, here ? r2(p.x) : 0, here ? r2(p.y) : 0, here ? r2(p.z) : 0, r2(p.yaw), r2(p.pitch),
        (p.moving ? 1 : 0) | (p.state === 'downed' ? 2 : 0) | (p.state === 'dead' ? 4 : 0) | (!here ? 8 : 0) | (p.firing ? 16 : 0) | (p.w === 'pistol' ? 32 : 0) | (p.P.shield <= 0.5 ? 64 : 0),
        Math.round(p.P.shield), Math.round(p.P.health), p.kills, p.pvp, p.deaths, p.score, p.color]);
    }
    const en = this.enemies.filter((e) => !e.dead).map((e) => [e.id, TYPE_IDX[e.type], r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), Math.max(1, Math.round(100 * e.hp / e.maxHp)), STATE_IDX[e.state] ?? 0, e.flash > 0.3 ? 1 : 0, e.haste > this.t ? 1 : 0]);
    const s = {
      t: r2(this.t), ph: this.phase, wv: this.wave, cd: this.phase === 'break' || this.phase === 'over' ? Math.max(0, Math.ceil(this.phaseUntil - this.t)) : 0,
      left: this.queue.length + this.enemies.filter((e) => !e.dead).length, pl, en, bd: this.bars.slice(),
      pj: this.notes.map((n) => [n.id, r2(n.x), r2(n.y), r2(n.z)]), gr: this.nades.map((g) => [g.id, r2(g.x), r2(g.y), r2(g.z)]),
      pk: this.pickups.map((k) => [k.id, k.kind, r2(k.x), r2(k.y), r2(k.z)]),
      last: this.phase === 'over' ? this.last : undefined,
      ev: events ? this.events : [],
    };
    if (events) this.events = [];
    return s;
  }
  personal(id) {
    const p = this.players.get(id);
    if (!p || !p.joined) return { id, in: false };
    const me = { id, in: true, st: p.state, sh: Math.round(p.P.shield), hp: Math.round(p.P.health), gr: p.P.grenades, pts: p.pts, ag: p.ammo,
      cd: p.state === 'alive' ? 0 : Math.max(0, Math.ceil(p.until - this.t)), pr: p.prompt };
    if (p.corr) { me.corr = p.corr; p.corr = null; }
    return me;
  }
}
