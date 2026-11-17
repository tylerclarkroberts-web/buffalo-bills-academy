// EL HALO horde match: one shared world, simulated here and streamed to every client (server/elhalo/index.js).
// The server owns the lobby, enemies, boards, waves, the supply truck, the jeep, grenades, rockets, needles, damage
// and points; clients own their own movement (checked here: speed, bounds, walls, falls) and send what they did
// (shots as rays, grenade throws, swings, holding ACTION). Free play: nothing in here knows about money.
import * as L from './rules.js';
import { BOUNDS, OPENINGS, BOARDS_MAX, ENEMY_SPAWNS, PLAYER_SPAWNS, STATIONS, OBSTACLES, FORT_ROUTES, FORT_DECK, fortRects,
  buildingAt, fortAt, terrain, groundAt, collide, wallDist, insideSolid, segHitsRect, truckAt, TRUCK, AMMO_SPOTS, NADE_SPOTS, JEEP_SPAWN } from './map.js';

const { MATCH, WEAPONS, ENEMIES } = L;
export const EYE = 1.62;
const P_RADIUS = 0.38, MAX_SPEED = 7.6, MOVE_SLACK = 1.3, LUNGE_SPEED = 24;
const TYPE_IDX = Object.fromEntries(L.ENEMY_TYPES.map((t, i) => [t, i]));
const W_IDX = Object.fromEntries(L.WEAPON_IDS.map((t, i) => [t, i]));
const STATE_IDX = { walk: 0, hit: 1, tear: 2, tackle: 3, shoot: 4, bless: 5, idle: 6, climb: 7, swoop: 8, wail: 9 };
const NADE_IDX = { frag: 0, sticky: 1 };
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const finite = (...a) => a.every((v) => typeof v === 'number' && Number.isFinite(v));
const COLORS = 8;
const fwdOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const rightOf = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

export class Match {
  constructor({ rnd = Math.random, looks = null } = {}) {
    this.rnd = rnd; this.looks = looks; // looks: (playerId) => saved look array, or null
    this.players = new Map(); // id -> record (kept for the scoreboard until the match resets)
    this.reset(true);
  }

  // ---- lifecycle. idle (nobody) -> lobby (pick your look, get ready) -> break (countdown) -> wave -> truck -> break -> wave ...
  reset(hard = false) {
    this.t = 0; this.phase = 'idle'; this.wave = 0; this.phaseUntil = 0; this.queue = []; this.spawnT = 0;
    this.enemies = []; this.notes = []; this.nades = []; this.shots = []; this.pickups = []; this.events = []; this.nextId = 1;
    this.bars = OPENINGS.map((o) => (o.open ? 0 : BOARDS_MAX)); this.idleT = 0; this.last = this.last || null;
    this.truck = null; this.jeep = null; this.night = false; this.ammoT = 6; this.nadeT = 12; this.host = null; this.forceNight = null;
    if (hard) { this.players.clear(); return; }
    for (const [id, p] of this.players) { if (!p.joined) this.players.delete(id); else this.freshStats(p); }
    if (this.online().length) this.phase = 'lobby';
  }
  freshStats(p) {
    Object.assign(p, { kills: 0, pvp: 0, deaths: 0, heads: 0, score: 0, pts: 500, ammo: 0, boards: 0, ready: false, truckGot: -1 });
    p.state = 'dead'; // a new match: back to the starting guns
    this.respawn(p);
  }
  online() { return [...this.players.values()].filter((p) => p.joined && p.online); }
  alive() { return [...this.players.values()].filter((p) => p.joined && p.online && p.state === 'alive'); }
  ev(...e) { this.events.push(e); }

  join(id, { name = 'Miner', nowMs = 0, look } = {}) {
    let p = this.players.get(id);
    if (!p) {
      if (this.online().length >= MATCH.maxPlayers) return { error: 'full' };
      const used = new Set([...this.players.values()].map((q) => q.color));
      let color = 0; while (used.has(color) && color < COLORS - 1) color++;
      p = { id, name: String(name).slice(0, 18), color, joined: false, online: true, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, state: 'dead', P: L.createPlayer(),
        w: 'rifle', slots: [...L.START_WEAPONS], wv: 0, moving: 0, firing: 0, lastIn: nowMs, tokens: 3, act: false, actWas: false, build: 0, buildAt: -1, rev: 0, revOf: null, prompt: null,
        hist: [], kills: 0, pvp: 0, deaths: 0, heads: 0, score: 0, pts: 500, ammo: 0, boards: 0, inputs: 0, inWin: 0, until: 0, offT: 0, corr: null, seq: 0,
        ready: false, joinedAt: 0, seat: null, lungeMs: 0, airT: 0, groundY: 0, look: L.cleanLook(look ?? this.looks?.(id)), needles: null, truckGot: -1 };
      this.players.set(id, p);
      if (this.online().length > MATCH.maxPlayers) { this.players.delete(id); return { error: 'full' }; }
    } else {
      if (!p.joined && this.online().filter((q) => q !== p).length >= MATCH.maxPlayers) return { error: 'full' };
      p.name = String(name).slice(0, 18);
      if (look !== undefined) p.look = L.cleanLook(look);
    }
    const was = p.joined;
    p.joined = true; p.online = true; p.offT = 0; p.lastIn = nowMs; p.tokens = 3;
    if (!was) { p.joinedAt = this.t + this.nextId * 1e-6; p.ready = false; if (p.state !== 'downed' && p.state !== 'dead') this.respawn(p); else if (p.state === 'dead' && !(p.until > this.t)) this.respawn(p); this.ev('j', id, p.name); }
    if (this.phase === 'idle') { this.phase = 'lobby'; this.wave = 0; }
    this.pickHost();
    return { ok: true, player: p };
  }
  leave(id) {
    const p = this.players.get(id); if (!p || !p.joined) return;
    this.exitJeep(p); p.joined = false; p.act = false; p.ready = false; this.ev('l', id); this.pickHost();
  }
  setOnline(id, on) {
    const p = this.players.get(id); if (!p) return;
    p.online = !!on; p.offT = 0; if (!on) { p.act = false; this.exitJeep(p); }
    this.pickHost();
  }
  pickHost() {
    const on = this.online().sort((a, b) => a.joinedAt - b.joinedAt);
    if (!on.some((p) => p.id === this.host)) this.host = on[0]?.id || null;
  }
  setLook(id, look) { const p = this.players.get(id); if (p) p.look = L.cleanLook(look); return p ? p.look : L.cleanLook(look); }

  // ---- the lobby: everyone ready (or the host says go) starts a short countdown
  setReady(id, on) {
    const p = this.players.get(id);
    if (!p || !p.joined) return { error: 'not in the match' };
    if (this.phase !== 'lobby') return { ok: true, phase: this.phase };
    p.ready = !!on; this.ev('rd', id, p.ready ? 1 : 0);
    this.checkLobby();
    return { ok: true, phase: this.phase };
  }
  begin(id) {
    const p = this.players.get(id);
    if (!p || !p.joined) return { error: 'not in the match' };
    if (this.phase !== 'lobby') return { ok: true, phase: this.phase };
    if (this.host && this.host !== id) return { error: 'only the host can start it', status: 403 };
    this.countdown(); return { ok: true, phase: this.phase };
  }
  checkLobby() {
    const on = this.online();
    if (this.phase === 'lobby' && on.length && on.every((p) => p.ready)) this.countdown();
  }
  countdown() {
    this.phase = 'break'; this.wave = 0; this.phaseUntil = this.t + MATCH.lobbyCountdown;
    for (const p of this.online()) { p.ready = false; if (p.state !== 'alive') this.respawn(p); }
    this.ev('go');
  }

  respawn(p) {
    const far = PLAYER_SPAWNS.map(([x, z]) => ({ x, z, d: Math.min(99, ...this.enemies.map((e) => Math.hypot(e.x - x, e.z - z))) })).sort((a, b) => b.d - a.d);
    const s = far[Math.floor(this.rnd() * Math.min(3, far.length))];
    this.exitJeep(p, true);
    p.x = s.x + (this.rnd() - 0.5) * 1.5; p.z = s.z + (this.rnd() - 0.5) * 1.5; p.y = groundAt(p.x, p.z, 50, this.bars); p.groundY = p.y; p.airT = 0;
    p.yaw = Math.atan2(p.x, p.z); p.pitch = 0; // face down the canyon toward the middle
    if (!p.slots || p.state === 'dead' || !p.wv) { p.slots = [...L.START_WEAPONS]; p.w = p.slots[0]; p.wv = (p.wv || 0) + 1; }
    const nades = p.P?.nades; p.P = L.createPlayer(p.slots); if (nades && p.state === 'downed') p.P.nades = nades;
    p.state = 'alive'; p.until = 0; p.hist = []; p.build = 0; p.rev = 0;
    p.corr = [r2(p.x), r2(p.y), r2(p.z), r2(p.yaw)];
  }

  // ---- input from one client. msg: { p:[x,y,z], yaw, pitch, w, act, veh:[x,y,z,yaw], ev:[...] }. Returns { ok } or { error }.
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
    if (typeof msg.w === 'string' && (p.slots.includes(msg.w) || (msg.w === 'torreta' && p.seat === 'g'))) p.w = msg.w;
    if (p.seat !== 'g' && p.w === 'torreta') p.w = p.slots[0];
    p.act = !!msg.act;
    const evs = Array.isArray(msg.ev) ? msg.ev.slice(0, 24) : [];
    // a lunge arrives with the first fast step: open the window before the move is checked
    if (!p.seat && p.state === 'alive' && WEAPONS[p.w]?.kind === 'melee' && evs.some((e) => Array.isArray(e) && e[0] === 'L')) p.lungeMs = nowMs + 700;
    if (p.seat) {
      if (p.seat === 'd' && Array.isArray(msg.veh) && msg.veh.length === 4 && finite(...msg.veh)) this.drive(p, msg.veh, dt);
      if (p.seat === 'g' && this.jeep) { this.jeep.ty = p.yaw; this.jeep.tp = p.pitch; }
    } else if (p.state === 'alive' && Array.isArray(msg.p) && msg.p.length === 3 && finite(...msg.p)) this.move(p, msg.p[0], msg.p[1], msg.p[2], dt, nowMs);
    else if (p.state !== 'alive' && Array.isArray(msg.p) && finite(...msg.p) && Math.hypot(msg.p[0] - p.x, msg.p[2] - p.z) > 0.6) p.corr = [r2(p.x), r2(p.y), r2(p.z)];
    // fire-rate bucket for the gun in hand (a burst counts as its three rounds; slow, heavy guns can't bank shots)
    const w = WEAPONS[p.w], rate = w.rate * (w.burst || 1);
    p.tokens = Math.min(rate >= 4 ? 3 : 1.25, p.tokens + dt * rate * 1.15);
    for (const e of evs) {
      if (!Array.isArray(e) || p.state !== 'alive' || this.phase === 'lobby') continue;
      if (e[0] === 's' && e.length >= 7 && finite(...e.slice(1, 7))) this.shot(p, { x: e[1], y: e[2], z: e[3] }, { x: e[4], y: e[5], z: e[6] });
      else if (e[0] === 'g' && e.length >= 4 && finite(...e.slice(1, 4)) && !p.seat) this.throwNade(p, { x: e[1], y: e[2], z: e[3] }, e[4] === 'sticky' ? 'sticky' : 'frag');
      else if (e[0] === 'm' && !p.seat) { if (e[1] === 'w' && WEAPONS[p.w].kind === 'melee') this.weaponMelee(p); else this.melee(p); }
    }
    return { ok: true };
  }

  move(p, x, y, z, dt, nowMs = 0) {
    const reject = () => { p.corr = [r2(p.x), r2(p.y), r2(p.z)]; };
    if (x < BOUNDS.x0 - 0.2 || x > BOUNDS.x1 + 0.2 || z < BOUNDS.z0 - 0.2 || z > BOUNDS.z1 + 0.2) return reject();
    const dist = Math.hypot(x - p.x, z - p.z);
    const top = nowMs < p.lungeMs ? LUNGE_SPEED : MAX_SPEED; // a sword or hammer lunge covers ground fast
    if (dist > top * Math.max(0.1, dt) + MOVE_SLACK) return reject();
    const g = groundAt(x, z, y, this.bars);
    if (y < terrain(x, z) - 0.6) return reject();
    // high above the ground is fine on the way DOWN (stepping or jumping off a roof deck: no fall damage, no snapping
    // back); going up is capped by a jump from the last place you stood
    if (y > Math.max(g + 2.6, p.groundY + 1.7)) return reject();
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
    const air = y - g;
    if (air < 0.25) { p.groundY = y; p.airT = 0; } else p.airT += dt;
    if (p.airT > 3) { p.y = g; p.groundY = g; p.airT = 0; p.corr = [r2(p.x), r2(p.y), r2(p.z)]; } // nobody hovers
  }

  // ---- the jeep (wave 15+): the driver's client drives it like its own feet, the server checks the moves
  spawnJeep() {
    const y = groundAt(JEEP_SPAWN.x, JEEP_SPAWN.z, 50, this.bars);
    this.jeep = { x: JEEP_SPAWN.x, y, z: JEEP_SPAWN.z, yaw: JEEP_SPAWN.yaw, spd: 0, driver: null, gunner: null, ty: 0, tp: 0, corr: null };
    this.ev('jp');
  }
  seatPos(seat) {
    const j = this.jeep, f = fwdOf(j.yaw), r = rightOf(j.yaw);
    return seat === 'd' ? { x: j.x + f.x * 0.25 - r.x * 0.45, y: j.y - 0.25, z: j.z + f.z * 0.25 - r.z * 0.45 } : { x: j.x - f.x * 1.15, y: j.y + 0.55, z: j.z - f.z * 1.15 };
  }
  enterJeep(p) {
    const j = this.jeep; if (!j || p.seat) return false;
    const seat = !j.driver ? 'd' : !j.gunner ? 'g' : null; if (!seat) return false;
    if (seat === 'd') j.driver = p.id; else { j.gunner = p.id; p.w = 'torreta'; p.P.weapons.torreta = L.loadout('torreta'); }
    p.seat = seat; Object.assign(p, this.seatPos(seat)); p.hist = []; p.build = 0;
    this.ev('je', p.id, seat); return true;
  }
  exitJeep(p, quiet = false) {
    const j = this.jeep; if (!p.seat || !j) { p.seat = null; return; }
    if (j.driver === p.id) { j.driver = null; j.spd = 0; }
    if (j.gunner === p.id) j.gunner = null;
    delete p.P.weapons.torreta; if (p.w === 'torreta') p.w = p.slots[0];
    const r = rightOf(j.yaw), side = p.seat === 'd' ? -1 : 1;
    let spot = { x: j.x + r.x * 2.2 * side, z: j.z + r.z * 2.2 * side };
    collide(spot, P_RADIUS, groundAt(spot.x, spot.z, 50, this.bars), 1.8, this.bars);
    if (insideSolid({ ...spot, y: groundAt(spot.x, spot.z, 50, this.bars) + 0.5 }, this.bars)) spot = { x: j.x, z: j.z };
    p.seat = null; p.x = spot.x; p.z = spot.z; p.y = groundAt(p.x, p.z, j.y + 1, this.bars); p.groundY = p.y; p.airT = 0; p.hist = [];
    p.corr = [r2(p.x), r2(p.y), r2(p.z)];
    if (!quiet) this.ev('jx', p.id);
  }
  drive(p, [x, y, z, yaw], dt) {
    const j = this.jeep; if (!j || j.driver !== p.id) return;
    const reject = () => { j.corr = [r2(j.x), r2(j.y), r2(j.z), r2(j.yaw)]; };
    if (x < BOUNDS.x0 - 0.5 || x > BOUNDS.x1 + 0.5 || z < BOUNDS.z0 - 0.5 || z > BOUNDS.z1 + 0.5) return reject();
    const dist = Math.hypot(x - j.x, z - j.z);
    if (dist > MATCH.jeep.maxSpeed * Math.max(0.1, dt) + 1.5) return reject();
    const g = groundAt(x, z, j.y + 0.6, this.bars);
    if (Math.abs(y - g) > 1.2) return reject();
    const q = { x, z }; collide(q, 1.0, g, 1.6, this.bars);
    if (Math.hypot(q.x - x, q.z - z) > 0.35) return reject();
    j.spd = j.spd * 0.5 + (dist / Math.max(0.05, dt)) * 0.5;
    j.x = x; j.y = g; j.z = z; j.yaw = yaw;
  }

  // ---- combat
  // every enemy and player the ray crosses before a wall, nearest first; head = the head sphere took the hit
  castRay(p, o, d, maxD = 140) {
    const wd = wallDist(o, d, maxD, this.bars), hits = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      let best = Infinity, head = false;
      for (const h of [[e.x, e.y, e.z, e.yaw], ...e.hist]) {
        const lift = this.lift(e, h[1]);
        const tb = L.raySphere(o, d, { x: h[0], y: lift + e.st.height * 0.5, z: h[2] }, e.st.radius * 1.4);
        const hd = L.headOf(e.type, h[0], lift, h[2], h[3]); const th = L.raySphere(o, d, hd, hd.r);
        // a head that sticks out in front (chupacabras, nahual wolves) can still be tagged from behind, over the back
        const isHead = th < Infinity && th <= tb + 0.45 + e.st.head.f * 1.4, t = isHead ? th : Math.min(tb, th);
        if (t < best) { best = t; head = isHead; }
      }
      if (best < wd) hits.push({ t: best, e, head });
    }
    for (const q of this.players.values()) {
      if (q === p || !q.joined || !q.online || q.state !== 'alive') continue;
      let best = Infinity, head = false;
      for (const h of [[q.x, q.y, q.z], ...q.hist]) {
        const tb = L.raySphere(o, d, { x: h[0], y: h[1] + 1.0, z: h[2] }, 0.52), th = L.raySphere(o, d, { x: h[0], y: h[1] + 1.62, z: h[2] }, 0.27);
        const isHead = th < Infinity && th <= tb + 0.45, t = Math.min(tb, th);
        if (t < best) { best = t; head = isHead; }
      }
      if (best < wd) hits.push({ t: best, q, head });
    }
    hits.sort((a, b) => a.t - b.t);
    return { hits, wall: wd };
  }
  lift(e, y = e.y) { return y + (e.st.float || 0); }
  shot(p, o, d) {
    if (p.tokens < 1) return; p.tokens -= 1;
    const len = Math.hypot(d.x, d.y, d.z); if (len < 0.5 || len > 1.5) return;
    d = { x: d.x / len, y: d.y / len, z: d.z / len };
    if (Math.hypot(o.x - p.x, o.y - (p.y + EYE), o.z - p.z) > (p.seat ? 2.6 : 2)) return;
    const id = p.w, w = WEAPONS[id]; p.firing = 2;
    if (!w || w.kind === 'melee') return;
    if (w.kind === 'rocket') { this.launch(p, o, d, 'rocket'); return; }
    if (w.kind === 'needle') { this.launch(p, o, d, 'needle'); return; }
    if (w.kind === 'pellets') {
      const sum = new Map();
      for (let i = 0; i < w.pellets; i++) {
        const s = w.spread, dd = { x: d.x + (this.rnd() - 0.5) * 2 * s, y: d.y + (this.rnd() - 0.5) * 2 * s, z: d.z + (this.rnd() - 0.5) * 2 * s };
        const l = Math.hypot(dd.x, dd.y, dd.z); dd.x /= l; dd.y /= l; dd.z /= l;
        const h = this.castRay(p, o, dd, w.range * 1.6).hits[0]; if (!h) continue;
        const k = h.e || h.q, cur = sum.get(k) || { dmg: 0, head: false, e: h.e, q: h.q };
        cur.dmg += w.damage * L.falloff(id, h.t) * (h.head ? w.head : 1); cur.head = cur.head || h.head; sum.set(k, cur);
      }
      this.ev('sg', p.id, r2(o.x), r2(o.y), r2(o.z), r2(d.x), r2(d.y), r2(d.z), W_IDX[id]);
      for (const h of sum.values()) { if (h.dmg <= 0) continue; if (h.e) this.hurtEnemy(h.e, h.dmg, h.head ? 'head' : 'gun', p, o, { head: h.head }); else this.hurtPlayer(h.q, h.dmg, { x: p.x, z: p.z }, p, h.head ? 'head' : 'gun', h.head); }
      return;
    }
    const { hits, wall } = this.castRay(p, o, d, Math.min(220, (w.range || 140) * 1.5));
    const use = hits.slice(0, w.pierce || 1);
    const end = use.length && use.length === (w.pierce || 1) ? use[use.length - 1].t : wall;
    const first = use[0];
    this.ev('s', p.id, r2(o.x), r2(o.y), r2(o.z), r2(o.x + d.x * end), r2(o.y + d.y * end), r2(o.z + d.z * end), first ? (first.e ? 1 : 2) : 0, W_IDX[id], first?.head ? 1 : 0);
    for (const h of use) {
      const dmg = w.damage * L.falloff(id, h.t) * (h.head ? w.head : 1);
      if (h.e) this.hurtEnemy(h.e, dmg, h.head ? 'head' : 'gun', p, o, { head: h.head, stun: w.stun }); else this.hurtPlayer(h.q, dmg, { x: p.x, z: p.z }, p, h.head ? 'head' : 'gun', h.head);
    }
  }
  // rockets fly straight; needles home in on whatever was nearest the crosshair
  launch(p, o, d, kind) {
    const w = WEAPONS[p.w];
    const s = { id: this.nextId++, kind, by: p.id, x: o.x + d.x * 0.5, y: o.y + d.y * 0.5 - 0.1, z: o.z + d.z * 0.5, vx: d.x * w.speed, vy: d.y * w.speed, vz: d.z * w.speed, life: kind === 'rocket' ? 4 : 1.7, age: 0, w: p.w, tgt: null };
    if (kind === 'needle') {
      let best = null, bs = 0.32;
      const consider = (k, c) => { const v = { x: c.x - o.x, y: c.y - o.y, z: c.z - o.z }, l = Math.hypot(v.x, v.y, v.z); if (l > w.range) return; const a = Math.acos(Math.max(-1, Math.min(1, (v.x * d.x + v.y * d.y + v.z * d.z) / l))); if (a < bs && wallDist(o, { x: v.x / l, y: v.y / l, z: v.z / l }, l, this.bars) >= l - 0.5) { bs = a; best = k; } };
      for (const e of this.enemies) if (!e.dead) consider({ e }, { x: e.x, y: this.lift(e) + e.st.height * 0.5, z: e.z });
      for (const q of this.players.values()) if (q !== p && q.joined && q.online && q.state === 'alive') consider({ q }, { x: q.x, y: q.y + 1, z: q.z });
      s.tgt = best;
    }
    this.shots.push(s); this.ev(kind === 'rocket' ? 'rk' : 'nd', p.id);
  }
  throwNade(p, o, kind = 'frag') {
    if (Math.hypot(o.x - p.x, o.y - (p.y + EYE), o.z - p.z) > 2) return;
    if (!L.throwGrenade(p.P, kind)) return;
    const G = kind === 'sticky' ? L.STICKY : L.GRENADES;
    const cp = Math.cos(p.pitch), f = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
    const n = { id: this.nextId++, kind, by: p.id, x: o.x + f.x * 0.6, y: o.y - 0.15 + f.y * 0.6, z: o.z + f.z * 0.6,
      vx: f.x * G.speed, vy: f.y * G.speed + G.lift, vz: f.z * G.speed, fuse: G.fuse, on: null, age: 0 };
    if (insideSolid(n, this.bars)) { n.x = o.x; n.y = o.y - 0.2; n.z = o.z; }
    this.nades.push(n); this.ev('g', p.id, NADE_IDX[kind]);
  }
  melee(p) {
    if (!L.tryMelee(p.P, this.t)) return;
    this.ev('ml', p.id);
    this.cone(p, L.MELEE.range, L.MELEE.damage, 'melee');
  }
  cone(p, range, dmg, how) {
    const f = fwdOf(p.yaw);
    const inCone = (x, z, y, r) => { const dx = x - p.x, dz = z - p.z, dd = Math.hypot(dx, dz); return dd < range + r && Math.abs(y - p.y) < 1.9 && (dx * f.x + dz * f.z) / (dd || 1) > 0.45; };
    let n = 0;
    for (const e of this.enemies) if (!e.dead && inCone(e.x, e.z, this.lift(e) + (e.st.fly ? -0.6 : 0), e.st.radius)) { this.hurtEnemy(e, dmg, how, p, p); n++; }
    for (const q of this.players.values()) if (q !== p && q.joined && q.online && q.state === 'alive' && !q.seat && inCone(q.x, q.z, q.y, P_RADIUS)) { this.hurtPlayer(q, dmg, { x: p.x, z: p.z }, p, how); n++; }
    return n;
  }
  // the machete slices what's in front of you; the hammer slams the ground and throws everything round you
  weaponMelee(p) {
    const w = WEAPONS[p.w];
    if (!L.tryMelee(p.P, this.t, 1 / w.rate)) return;
    if (w.slam) {
      const f = fwdOf(p.yaw), c = { x: p.x + f.x * 1.6, y: p.y + 0.4, z: p.z + f.z * 1.6 };
      this.blast(c, w.radius, w.damage, p, 'slam', 'melee', 0, 3);
    } else { this.ev('sw', p.id); this.cone(p, w.reach, w.damage, 'melee'); }
  }
  // kinds: 0 frag, 1 sticky, 2 rocket, 3 needle supercombine, 4 hammer slam
  blast(at, radius, damage, by, kindName, how = 'grenade', selfK = 0.5, push = 0.8) {
    const kind = { frag: 0, sticky: 1, rocket: 2, combine: 3, slam: 4 }[kindName] ?? 0;
    this.ev('x', r2(at.x), r2(at.y), r2(at.z), kind);
    for (const e of this.enemies) { if (e.dead) continue; const dmg = L.splash(Math.hypot(e.x - at.x, this.lift(e) + e.st.height * 0.5 - at.y, e.z - at.z), radius, damage); if (dmg > 0) this.hurtEnemy(e, dmg, how, by, at, { push }); }
    for (const q of this.players.values()) {
      if (!q.joined || !q.online || q.state !== 'alive') continue;
      let dmg = L.splash(Math.hypot(q.x - at.x, q.y + 1 - at.y, q.z - at.z), radius, damage); if (by && q.id === by.id) dmg = Math.round(dmg * selfK);
      if (dmg > 0) this.hurtPlayer(q, dmg, { x: at.x, z: at.z }, by && by !== q ? by : null, how);
    }
  }
  explode(n) {
    const by = this.players.get(n.by), G = n.kind === 'sticky' ? L.STICKY : L.GRENADES;
    this.blast(n, G.radius, G.damage, by, n.kind);
  }

  hurtEnemy(e, dmg, how, by, from, { head = false, stun = 0, push } = {}) {
    if (e.dead) return;
    e.hp -= dmg; e.flash = 1;
    if (stun) e.stunUntil = this.t + stun;
    if (from && !e.st.etereo) { const k = push ?? (how === 'melee' ? 1.2 : how === 'grenade' ? 0.8 : 0.04); const dx = e.x - from.x, dz = e.z - from.z, dd = Math.hypot(dx, dz) || 1; e.x += dx / dd * k; e.z += dz / dd * k; if (!e.st.fly && !e.climb) collide(e, e.st.radius, e.y, e.st.height, this.bars, true); }
    if (by) { by.pts += MATCH.points.hit + (head ? MATCH.points.head : 0); by.score += MATCH.points.hit + (head ? MATCH.points.head : 0); this.ev('hm', by.id, head ? 1 : 0); }
    if (e.hp > 0) return;
    e.dead = true;
    const pts = L.killPoints(e.type, how);
    if (by) { by.kills++; by.pts += pts; by.score += pts; if (head) by.heads++; }
    this.ev('k', e.id, TYPE_IDX[e.type], r2(e.x), r2(this.lift(e)), r2(e.z), by ? by.id : null, how);
    const roll = this.rnd();
    const kind = roll < 0.18 ? 'ammo' : roll < 0.26 ? 'health' : roll < 0.3 ? 'frag' : roll < 0.33 ? 'sticky' : null;
    if (kind && this.pickups.length < 14) this.pickups.push({ id: this.nextId++, kind, x: e.x, z: e.z, y: groundAt(e.x, e.z, e.y + 1, this.bars), life: MATCH.pickupLife });
  }

  hurtPlayer(q, amount, from, by, how, head = false) {
    if (q.state !== 'alive') return;
    if (this.calm && !(by && by.id)) return; // test hook: the horde is all bark
    const r = L.applyDamage(q.P, amount, this.t);
    this.ev('h', q.id, from ? r1(from.x) : null, from ? r1(from.z) : null, Math.round(amount), r.toShield > 0 ? 1 : 0, r.shieldBroke ? 1 : 0, head ? 1 : 0);
    if (by && by.id && by !== q) this.ev('hm', by.id, head ? 1 : 0);
    if (!r.dead) return;
    this.exitJeep(q, true);
    q.state = 'downed'; q.until = this.t + MATCH.downedSecs; q.deaths++; q.act = false; q.build = 0;
    if (by && by !== q && typeof by === 'object' && by.id) { by.pvp++; by.pts += MATCH.points.pvpKill; by.score += MATCH.points.pvpKill; if (head) by.heads++; this.ev('pvp', by.id, q.id, how || 'gun'); }
    this.ev('dn', q.id);
  }

  // ---- the tick
  tick(dt) {
    this.t += dt;
    const t = this.t;
    // offline players drop out after a while; an empty match resets
    for (const p of this.players.values()) {
      if (!p.joined) continue;
      if (!p.online) { p.offT += dt; if (p.offT >= MATCH.offlineDropSecs) { p.joined = false; p.ready = false; this.ev('l', p.id); this.pickHost(); } }
    }
    const online = this.online();
    if (!online.length) {
      if (this.phase !== 'idle') { this.idleT += dt; if (this.idleT >= MATCH.emptyResetSecs) this.reset(); }
      this.flush(); return;
    }
    this.idleT = 0;
    if (this.phase === 'lobby') { this.checkLobby(); this.flush(); return; }
    // history for lag-forgiving hit checks (last two ticks)
    for (const e of this.enemies) { e.hist.unshift([e.x, e.y, e.z, e.yaw]); e.hist.length = Math.min(e.hist.length, 2); }
    for (const p of online) { p.hist.unshift([p.x, p.y, p.z]); p.hist.length = Math.min(p.hist.length, 2); if (p.firing > 0) p.firing--; }

    // players: shields, the bleed-out clock, riding in the jeep, the ACTION button
    for (const p of online) {
      if (p.state === 'alive') L.tickShield(p.P, t, dt);
      else if (p.state === 'downed' && t >= p.until) { p.state = 'dead'; p.until = Infinity; this.ev('dd', p.id); } // back next wave
      if (p.seat && this.jeep) Object.assign(p, this.seatPos(p.seat));
    }
    for (const p of online) this.action(p, dt);
    this.phases(dt);
    this.ai(dt);
    this.projectiles(dt);
    this.vehicles(dt);
    this.spots(dt);
    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i]; k.life -= dt;
      const who = online.find((p) => p.state === 'alive' && !p.seat && Math.hypot(p.x - k.x, p.z - k.z) < 1.4 && Math.abs(p.y - k.y) < 1.8);
      let took = false;
      if (who) {
        if (k.kind === 'ammo') { who.ammo++; took = true; }
        else if (k.kind === 'health' && who.P.health < L.HEALTH.max) { L.heal(who.P, 40); took = true; }
        else if (k.kind === 'frag' || k.kind === 'sticky') took = L.addGrenade(who.P, 1, k.kind) > 0;
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
    if (!['over', 'idle', 'lobby'].includes(this.phase) && !alive.length && this.online().some((p) => p.state !== 'alive') && this.wave > 0) {
      this.phase = 'over'; this.phaseUntil = t + MATCH.overSecs; this.truck = null;
      const board = [...this.players.values()].sort((a, b) => b.score - a.score).slice(0, 8).map((p) => ({ id: p.id, name: p.name, score: p.score, kills: p.kills, pvp: p.pvp, heads: p.heads }));
      this.last = { wave: this.wave, board };
      this.ev('over', this.wave); return;
    }
    if (this.phase === 'over' && t >= this.phaseUntil) { this.reset(); this.ev('new'); return; }
    if (this.phase === 'truck') {
      this.truck.t += t - this.truck.at; this.truck.at = t;
      const tk = truckAt(this.truck.t);
      for (const p of this.alive()) if (!p.seat && p.truckGot !== this.truck.n && Math.hypot(p.x - tk.x, p.z - tk.z) < MATCH.truck.grab && Math.abs(p.y - terrain(tk.x, tk.z)) < 2.6) this.gift(p);
      if (tk.done) { this.truck = null; this.phase = 'break'; this.phaseUntil = t + MATCH.breakSecs; this.ev('tg0'); }
      return;
    }
    if (this.phase === 'break' && t >= this.phaseUntil) {
      this.wave++; this.phase = 'wave';
      this.night = this.forceNight ?? this.wave >= MATCH.nightWave;
      if (this.wave === MATCH.nightWave) this.ev('night');
      this.queue = this.emptyWave ? [] : L.waveRoster(this.wave, Math.max(1, this.online().length), this.rnd); this.spawnT = t + 0.5;
      for (const p of this.online()) {
        if (p.state === 'alive') L.heal(p.P, L.HEALTH.max);
        else if (p.state === 'dead') this.respawn(p);
      }
      if (this.wave >= MATCH.jeepWave && !this.jeep) this.spawnJeep();
      this.boardPts = new Map();
      this.ev('wave', this.wave); return;
    }
    if (this.phase === 'wave') {
      const sc = L.waveScale(this.wave);
      if (this.queue.length && t >= this.spawnT && this.enemies.length < MATCH.maxAlive) {
        const i = this.queue.findIndex((ty) => !ENEMIES[ty].cap || this.enemies.filter((e) => e.type === ty).length < ENEMIES[ty].cap);
        if (i >= 0) { this.spawn(this.queue.splice(i, 1)[0], sc); this.spawnT = t + sc.gap; }
      }
      if (!this.queue.length && !this.enemies.length && !this.emptyWave) this.startTruck();
    }
  }
  // between waves: the truck drives through handing out the next gun on the list. Nothing spawns while it's out.
  startTruck() {
    const t = this.t;
    for (const p of this.online()) {
      if (p.state === 'alive') { p.pts += L.waveBonus(this.wave); p.score += L.waveBonus(this.wave); L.addGrenade(p.P, 1, 'frag'); }
      else if (p.state === 'dead') this.respawn(p); // the dead come back for the truck
    }
    this.ev('clear', this.wave);
    for (const e of this.enemies) e.dead = true; // anything left (test waves) is held off: the canyon goes quiet
    this.queue = []; this.notes = [];
    this.phase = 'truck'; this.phaseUntil = t + TRUCK.secs;
    this.truck = { n: this.wave, at: t, t: 0, weapon: L.truckWeapon(this.wave, this.rnd) };
    this.ev('tr', this.truck.weapon);
  }
  gift(p) {
    const id = this.truck.weapon; p.truckGot = this.truck.n;
    const r = L.giveWeapon(p.P, id);
    if (r === 'new') { const i = p.slots.indexOf(p.w === 'torreta' ? p.slots[0] : p.w); p.slots[i >= 0 ? i : 0] = id; p.w = id; }
    p.wv++; this.ev('tg', p.id, id, r);
  }

  spawn(type, sc = L.waveScale(this.wave || 1)) {
    const ps = this.alive();
    const opts = ENEMY_SPAWNS.map(([x, z]) => ({ x, z, d: ps.length ? Math.min(...ps.map((p) => Math.hypot(p.x - x, p.z - z))) : 99 }));
    let pool = opts.filter((o) => o.d > 22); if (!pool.length) pool = opts.sort((a, b) => b.d - a.d).slice(0, 3);
    const s = pool[Math.floor(this.rnd() * pool.length)];
    const st = ENEMIES[type];
    const e = { id: this.nextId++, type, st, x: s.x + (this.rnd() - 0.5) * 2, z: s.z + (this.rnd() - 0.5) * 2, y: 0, yaw: 0,
      hp: Math.round(st.hp * sc.hp), maxHp: Math.round(st.hp * sc.hp), spd: st.speed * sc.speed * (0.92 + this.rnd() * 0.16), dmg: sc.damage,
      cool: 0.8 + this.rnd(), tcool: 1 + this.rnd() * 2, tackle: 0, tdir: null, ncool: 1 + this.rnd(), bcool: 2, haste: 0, state: 'walk', act: 0,
      target: null, retarget: 0, route: null, hist: [], chk: { x: 0, z: 0, t: 0 }, detour: null, los: false, losT: 0, flash: 0, strafe: this.rnd() < 0.5 ? 1 : -1, strafeT: 0, dead: false,
      stunUntil: 0, jit: 0, jx: 0, jz: 0, wolf: false, shiftT: st.shift ? st.shift.every * this.rnd() : 0, wailT: st.wail ? 3 + this.rnd() * 3 : 0, blinkT: st.blink ? st.blink.every : 0,
      climb: null, swoop: 0, rise: 0, fortRoute: null };
    e.y = groundAt(e.x, e.z, 50, this.bars);
    if (st.fly) e.y += st.fly.cruise;
    this.enemies.push(e); this.ev('sp', e.id);
    if (type === 'chupacabra' || type === 'lechuza' || type === 'llorona') this.ev('sh', e.id);
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
      let spd = e.spd * (e.haste > t ? (st.bless ? 1 : ENEMIES.padre.bless.haste) : 1) * (e.stunUntil > t ? 0.35 : 1);
      if (st.shift) { e.shiftT -= dt; if (e.shiftT <= 0) { e.wolf = !e.wolf; e.shiftT = st.shift.every * (0.7 + this.rnd() * 0.6); this.ev('nh', e.id, e.wolf ? 1 : 0); } spd *= e.wolf ? st.shift.wolf : st.shift.man; }
      e.state = 'walk';
      if (!tg) { e.state = 'idle'; this.stepEnemy(e, 0, 0, 0, dt); continue; }
      if (e.climb) { this.climbStep(e, dt); continue; }
      if (st.fly) { this.flyer(e, tg, spd, dt); continue; }
      if (st.etereo) { this.etereo(e, tg, spd, dt, ps); continue; }
      const goal = this.goalFor(e, tg, dt);
      if (goal === 'tear') { e.state = 'tear'; this.stepEnemy(e, 0, 0, 0, dt); continue; }
      if (goal === 'climb') { this.climbStep(e, dt); continue; }
      let dx = goal.x - e.x, dz = goal.z - e.z; const gd = Math.hypot(dx, dz) || 1; dx /= gd; dz /= gd;
      const tdx = tg.x - e.x, tdz = tg.z - e.z, d = Math.hypot(tdx, tdz) || 1;
      const direct = goal.direct;
      if (e.losT <= 0) { e.losT = 0.4; const o = { x: e.x, y: e.y + st.height * 0.85, z: e.z }, to = { x: tg.x - o.x, y: tg.y + 1.2 - o.y, z: tg.z - o.z }; const l = Math.hypot(to.x, to.y, to.z) || 1; e.los = wallDist(o, { x: to.x / l, y: to.y / l, z: to.z / l }, l, this.bars) >= l - 0.4; } else e.losT -= dt;
      const close = d < st.reach && Math.abs(tg.y - e.y) < 1.6;
      let vx = 0, vz = 0;
      if (e.tackle > 0) { // the tackle / pounce
        e.tackle -= dt; e.state = 'tackle';
        vx = e.tdir.x; vz = e.tdir.z; spd = e.spd * st.tackle.speed;
        for (const p of ps) if (Math.hypot(p.x - e.x, p.z - e.z) < st.reach + 0.3 && Math.abs(p.y - e.y) < 1.6) { this.hurtPlayer(p, st.tackle.damage * e.dmg, e, null, 'tackle'); e.tackle = 0; e.cool = st.every; break; }
      } else if (close) {
        e.state = 'hit';
        if (e.cool <= 0) { e.cool = st.every; e.act = 0.3; this.hurtPlayer(tg, st.hit * e.dmg, e, null, e.type); }
      } else if (st.tackle && direct && e.los && d < st.tackle.range && d > 2.2 && e.tcool <= 0 && (!st.shift || e.wolf)) {
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
      // the chupacabra never moves in a straight line for long: little sideways jerks
      if (st.jitter && e.state === 'walk') { e.jit -= dt; if (e.jit <= 0) { e.jit = 0.2 + this.rnd() * 0.45; const a = (this.rnd() - 0.5) * 1.6; e.jx = -vz * a; e.jz = vx * a; } vx += e.jx; vz += e.jz; }
      if (e.type === 'padre' && e.bcool <= 0) {
        e.bcool = st.bless.every; let n = 0;
        for (const o of this.enemies) { if (o.dead || Math.hypot(o.x - e.x, o.z - e.z) > st.bless.radius) continue; o.hp = Math.min(o.maxHp, o.hp + o.maxHp * st.bless.heal); if (o !== e) { o.haste = t + st.bless.time; n++; } }
        if (n) { e.state = 'bless'; e.act = 0.6; this.ev('bl', e.id); }
      }
      this.stepEnemy(e, vx, vz, spd, dt, tg);
    }
  }
  // La Llorona drifts straight at you through walls and boards, rises up to wherever you're standing, wails, and
  // every so often simply isn't where she was any more.
  etereo(e, tg, spd, dt, ps) {
    const st = e.st, dx = tg.x - e.x, dz = tg.z - e.z, d = Math.hypot(dx, dz) || 1;
    e.wailT -= dt; e.blinkT -= dt;
    if (e.wailT <= 0) {
      e.wailT = st.wail.every * (0.8 + this.rnd() * 0.4); e.state = 'wail'; e.act = 1.2; this.ev('wl', e.id);
      for (const p of ps) if (Math.hypot(p.x - e.x, p.z - e.z) < st.wail.radius) this.hurtPlayer(p, st.wail.damage * e.dmg, e, null, 'wail');
    }
    if (e.blinkT <= 0 && d > st.blink.min) { // appear behind the target
      e.blinkT = st.blink.every * (0.8 + this.rnd() * 0.5);
      const f = fwdOf(tg.yaw), nx = tg.x - f.x * st.blink.dist, nz = tg.z - f.z * st.blink.dist;
      if (nx > BOUNDS.x0 && nx < BOUNDS.x1 && nz > BOUNDS.z0 && nz < BOUNDS.z1) { e.x = nx; e.z = nz; e.y = Math.max(terrain(nx, nz), tg.y - 0.2); e.hist = []; this.ev('bk', e.id); }
    }
    const close = d < st.reach && Math.abs(tg.y - e.y) < 1.8;
    if (close) { e.state = 'hit'; if (e.cool <= 0) { e.cool = st.every; e.act = 0.4; this.hurtPlayer(tg, st.hit * e.dmg, e, null, 'llorona'); } }
    else { e.x += dx / d * spd * dt; e.z += dz / d * spd * dt; if (e.act <= 0) e.state = 'walk'; }
    e.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, e.x)); e.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, e.z));
    const floor = terrain(e.x, e.z), want = Math.max(floor, tg.y - 0.1);
    e.y += Math.max(-2 * dt, Math.min(1.6 * dt, want - e.y)); if (e.y < floor) e.y = floor;
    e.yaw = Math.atan2(-dx, -dz);
  }
  // La Lechuza circles high, then dives at your head when she can see you out in the open
  flyer(e, tg, spd, dt) {
    const st = e.st, dx = tg.x - e.x, dz = tg.z - e.z, d = Math.hypot(dx, dz) || 1;
    const ground = terrain(e.x, e.z), cruise = Math.max(ground, tg.y) + st.fly.cruise;
    const indoors = !!buildingAt(tg.x, tg.z) || !!fortAt(tg.x, tg.z, tg.y);
    let vx = dx / d, vz = dz / d, vy = 0;
    if (e.swoop > 0) {
      e.swoop -= dt; e.state = 'swoop';
      const to = { x: tg.x - e.x, y: tg.y + 1.3 - e.y, z: tg.z - e.z }, l = Math.hypot(to.x, to.y, to.z) || 1;
      vx = to.x / l; vz = to.z / l; vy = to.y / l; spd = st.fly.swoop;
      if (l < st.reach) { if (e.cool <= 0) { e.cool = st.every; this.hurtPlayer(tg, st.hit * e.dmg, e, null, 'lechuza'); } e.swoop = 0; e.rise = 1.4; }
      const nx = e.x + vx * spd * dt, ny = e.y + vy * spd * dt, nz = e.z + vz * spd * dt;
      if (insideSolid({ x: nx, y: ny, z: nz }, this.bars)) { e.swoop = 0; e.rise = 1; } else { e.x = nx; e.y = ny; e.z = nz; }
    } else {
      if (e.rise > 0) e.rise -= dt;
      if (d < st.fly.near && !indoors && e.rise <= 0 && e.cool <= 0) { e.swoop = 1.6; this.ev('sh', e.id); }
      if (d < 5 && e.swoop <= 0) { vx = -dz / d; vz = dx / d; } // circle overhead
      e.x += vx * spd * dt; e.z += vz * spd * dt;
      e.y += Math.max(-4 * dt, Math.min(5 * dt, cruise - e.y));
    }
    e.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, e.x)); e.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, e.z));
    if (e.y < ground + 0.4) e.y = ground + 0.4;
    e.yaw = Math.atan2(-vx, -vz);
  }
  // up the outside of a fort wall, hand over hand, then over the top onto the deck
  climbStep(e, dt) {
    const c = e.climb; e.state = 'climb';
    e.y = Math.min(c.top, e.y + 3.2 * dt);
    if (e.y >= c.top - 0.01) { e.x = c.in.x; e.z = c.in.z; e.y = c.top; e.climb = null; e.hist = []; this.ev('cl', e.id); return; }
    e.x += (c.at.x - e.x) * Math.min(1, dt * 6); e.z += (c.at.z - e.z) * Math.min(1, dt * 6);
    e.yaw = Math.atan2(-(c.in.x - e.x), -(c.in.z - e.z));
  }
  stepEnemy(e, vx, vz, spd, dt, tg) {
    const st = e.st;
    if (e.detour && (vx || vz)) { e.detour.t -= dt; vx = e.detour.x; vz = e.detour.z; if (e.detour.t <= 0) e.detour = null; }
    const vl = Math.hypot(vx, vz); if (vl > 1) { vx /= vl; vz /= vl; }
    e.x += vx * spd * dt; e.z += vz * spd * dt;
    for (const o of this.enemies) { if (o === e || o.dead || o.st.fly || o.st.etereo) continue; const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), mm = (st.radius + o.st.radius) * 0.9; if (od < mm && od > 1e-4 && Math.abs(o.y - e.y) < 1.5) { e.x += ox / od * (mm - od) * 0.5; e.z += oz / od * (mm - od) * 0.5; } }
    for (const p of this.players.values()) { if (!p.joined || !p.online || p.state === 'dead' || p.seat) continue; const ox = e.x - p.x, oz = e.z - p.z, od = Math.hypot(ox, oz), mm = st.radius + P_RADIUS * 0.9; if (od < mm && od > 1e-4 && Math.abs(p.y - e.y) < 1.5) { e.x = p.x + ox / od * mm; e.z = p.z + oz / od * mm; } }
    collide(e, st.radius, e.y, st.height, this.bars, true);
    e.y = groundAt(e.x, e.z, e.y, this.bars);
    const face = tg && (e.state !== 'walk' || Math.hypot(tg.x - e.x, tg.z - e.z) < 12) ? { x: tg.x - e.x, z: tg.z - e.z } : vl > 0.1 ? { x: vx, z: vz } : null;
    if (e.state === 'tear' && e.route) { const op = OPENINGS[e.route.op]; e.yaw = Math.atan2(-(op.x - e.x), -(op.z - e.z)); }
    else if (face) e.yaw = Math.atan2(-face.x, -face.z);
    e.chk.t += dt;
    if (e.chk.t > 0.8) {
      const moved = Math.hypot(e.x - e.chk.x, e.z - e.chk.z);
      if (moved < 0.35 && vl > 0.3 && !e.detour && e.state === 'walk') { const sgn = this.rnd() < 0.5 ? 1 : -1; e.detour = { x: -vz * sgn, z: vx * sgn, t: 0.9 }; e.stuck = (e.stuck || 0) + 1; } else if (moved > 1) e.stuck = 0;
      e.chk = { x: e.x, z: e.z, t: 0 };
    }
  }

  // Where should e head for to reach tg? Returns a point ({x,z,direct}), 'tear' while it is pulling boards, or
  // 'climb' when it starts up a fort wall.
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
    // a player up on a fort deck: take the nearer stair, and the agile ones go straight up the wall
    const fort = fortRects.find((f) => tg.y > f.y + 2.4 && tg.x > f.x0 - 0.5 && tg.x < f.x1 + 0.5 && tg.z > f.z0 - 0.5 && tg.z < f.z1 + 0.5);
    // (the old check gave up halfway up the stair, at 2.4 m, which is why the deck used to be a safe haven)
    const upTop = fort && e.y > fort.y + 2.4 && e.x > fort.x0 && e.x < fort.x1 && e.z > fort.z0 && e.z < fort.z1;
    if (fort && !upTop) {
      const top = fort.y + FORT_DECK;
      if (e.st.climb) { // at the outside of a wall, near the player: climb it
        const cx = Math.max(fort.x0, Math.min(fort.x1, e.x)), cz = Math.max(fort.z0, Math.min(fort.z1, e.z));
        const out = Math.hypot(e.x - cx, e.z - cz);
        if (out > 0.2 && out < e.st.radius + 0.9 && Math.hypot(tg.x - cx, tg.z - cz) < 9) {
          const nx = (e.x - cx) / out, nz = (e.z - cz) / out;
          e.climb = { top, at: { x: cx + nx * (e.st.radius + 0.05), z: cz + nz * (e.st.radius + 0.05) }, in: { x: cx - nx * 0.9, z: cz - nz * 0.9 } };
          return 'climb';
        }
      }
      const ways = FORT_ROUTES[fort.id];
      if (!e.fortRoute || e.fortRoute.f !== fort.id) {
        const pick = ways.map((w, i) => ({ i, d: Math.min(Math.hypot(w[0].x - e.x, w[0].z - e.z), Math.abs(w[0].x - e.x) < 1.2 && e.y - fort.y > 0.3 ? 0 : 99) + Math.hypot(w[2].x - tg.x, w[2].z - tg.z) * 0.5 })).sort((a, b) => a.d - b.d)[0].i;
        const way = ways[pick], hi = e.y - fort.y; // already partway up a stair: carry on from there
        e.fortRoute = { f: fort.id, way, step: hi > 3 ? 2 : hi > 0.3 ? 1 : 0 };
      }
      const fr = e.fortRoute, way = fr.way;
      if (fr.step < way.length && near(way[fr.step], fr.step === 0 ? 1.1 : 0.9)) fr.step++;
      if (fr.step >= way.length) fr.step = way.length - 1; // keep stepping onto the deck until we're actually on it
      if (fr.step === 1 && e.y < fort.y + 0.3 && !near(way[0], 2.5)) fr.step = 0; // knocked off the bottom: go round again
      if (fr.step < way.length) { if (fr.step === 0) { const g = this.around(e, way[0], null); g.direct = false; return g; } return { x: way[fr.step].x, z: way[fr.step].z, direct: false }; }
    } else e.fortRoute = null;
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
    // on the deck with a player down below: back down the stair (or just drop off the edge, like the players do)
    const onDeck = fortRects.find((f) => e.y > f.y + 2.4 && e.x > f.x0 - 0.2 && e.x < f.x1 + 0.2 && e.z > f.z0 - 0.2 && e.z < f.z1 + 0.2);
    if (onDeck && tg.y < onDeck.y + 2.4) { const g = { x: tg.x, z: tg.z, direct: true }; return g; }
    const g = this.around(e, tg, eb?.id); g.direct = !g.via; return g;
  }
  // Head for p, walking round any building or fort in the way (except the one we are in or heading into).
  around(e, p, skip) {
    for (const r of OBSTACLES) {
      if (r.id === skip) continue;
      if (p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) continue;
      if (e.x > r.x0 && e.x < r.x1 && e.z > r.z0 && e.z < r.z1) continue; // standing in it (a stair, a deck): no detour
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
    // rockets and needles
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i], w = WEAPONS[s.w], by = this.players.get(s.by); s.life -= dt; s.age += dt;
      let gone = s.life <= 0;
      for (let k = 0; k < 4 && !gone; k++) {
        const h = dt / 4;
        if (s.kind === 'needle' && s.tgt) { // steer toward the target
          const T = s.tgt.e && !s.tgt.e.dead ? { x: s.tgt.e.x, y: this.lift(s.tgt.e) + s.tgt.e.st.height * 0.55, z: s.tgt.e.z } : s.tgt.q && s.tgt.q.state === 'alive' ? { x: s.tgt.q.x, y: s.tgt.q.y + 1, z: s.tgt.q.z } : null;
          if (T) { const v = { x: T.x - s.x, y: T.y - s.y, z: T.z - s.z }, l = Math.hypot(v.x, v.y, v.z) || 1, sp = Math.hypot(s.vx, s.vy, s.vz), a = Math.min(1, h * 7); s.vx += (v.x / l * sp - s.vx) * a; s.vy += (v.y / l * sp - s.vy) * a; s.vz += (v.z / l * sp - s.vz) * a; }
        }
        const nx = s.x + s.vx * h, ny = s.y + s.vy * h, nz = s.z + s.vz * h;
        let hitE = null, hitQ = null, head = false;
        for (const e of this.enemies) {
          if (e.dead) continue; const cy = this.lift(e) + e.st.height * 0.5;
          if (Math.hypot(nx - e.x, (ny - cy) * (e.st.height > 1.5 ? 0.6 : 1), nz - e.z) < e.st.radius + 0.3) { hitE = e; const hd = L.headOf(e.type, e.x, this.lift(e), e.z, e.yaw); head = Math.hypot(nx - hd.x, ny - hd.y, nz - hd.z) < hd.r + 0.15; break; }
        }
        if (!hitE) for (const q of ps) { if (q.id === s.by && s.age < 0.4) continue; if (q.id === s.by && s.kind === 'needle') continue; if (Math.hypot(nx - q.x, (ny - q.y - 1) * 0.7, nz - q.z) < 0.6) { hitQ = q; head = ny > q.y + 1.4; break; } }
        const wall = insideSolid({ x: nx, y: ny, z: nz }, this.bars) || ny < terrain(nx, nz);
        s.x = nx; s.y = ny; s.z = nz;
        if (s.kind === 'rocket' && (hitE || hitQ || wall)) { this.blast(s, w.radius, w.damage, by, 'rocket'); gone = true; }
        else if (s.kind === 'needle' && (hitE || hitQ)) {
          const tgt = hitE || hitQ, dmg = w.damage * (head ? w.head : 1);
          if (hitE) this.hurtEnemy(hitE, dmg, head ? 'head' : 'gun', by, null, { head }); else this.hurtPlayer(hitQ, dmg, { x: s.x, z: s.z }, by, head ? 'head' : 'gun', head);
          // seven crystals in quick succession and they all go off at once
          if (!tgt.needles || this.t - tgt.needles.t > 3) tgt.needles = { n: 0, t: this.t };
          tgt.needles.n++; tgt.needles.t = this.t;
          if (tgt.needles.n >= w.combine) { tgt.needles = null; this.blast({ x: tgt.x, y: (hitE ? this.lift(hitE) : tgt.y) + 0.9, z: tgt.z }, w.combineRadius, w.combineDamage, by, 'combine'); this.ev('cb', s.by); }
          gone = true;
        } else if (wall) gone = true;
      }
      if (gone) this.shots.splice(i, 1);
    }
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const g = this.nades[i]; g.fuse -= dt; g.age += dt;
      if (g.on) { // stuck to something: ride along with it
        if (g.on.e) { if (!g.on.e.dead) { g.x = g.on.e.x + g.on.dx; g.y = this.lift(g.on.e) + g.on.dy; g.z = g.on.e.z + g.on.dz; } }
        else if (g.on.q) { if (g.on.q.state !== 'dead') { g.x = g.on.q.x + g.on.dx; g.y = g.on.q.y + g.on.dy; g.z = g.on.q.z + g.on.dz; } }
      } else for (let s = 0; s < 2; s++) {
        const h = dt / 2, was = { x: g.x, y: g.y, z: g.z };
        g.vy -= 18 * h; g.x += g.vx * h; g.y += g.vy * h; g.z += g.vz * h;
        if (g.kind === 'sticky') {
          const e = this.enemies.find((q) => !q.dead && Math.hypot(g.x - q.x, (g.y - this.lift(q) - q.st.height * 0.55) * 0.7, g.z - q.z) < q.st.radius + L.STICKY.grab);
          const pl = !e && [...this.players.values()].find((q) => q.joined && q.online && q.state === 'alive' && (q.id !== g.by || g.age > 0.5) && Math.hypot(g.x - q.x, (g.y - q.y - 1) * 0.7, g.z - q.z) < 0.7);
          if (e || pl) { const o = e || pl, oy = e ? this.lift(e) : pl.y; g.on = { e, q: pl, dx: (g.x - o.x) * 0.5, dy: Math.max(0.4, g.y - oy), dz: (g.z - o.z) * 0.5 }; g.fuse = Math.min(g.fuse, L.STICKY.stuckFuse); this.ev('st', g.id, e ? 1 : pl ? 2 : 0); break; }
        }
        const floor = Math.max(terrain(g.x, g.z), groundAt(g.x, g.z, was.y, this.bars)) + 0.12;
        const solid = insideSolid(g, this.bars);
        if (g.kind === 'sticky' && (g.y < floor || solid)) { if (solid) { g.x = was.x; g.y = was.y; g.z = was.z; } else g.y = floor; g.on = { wall: true }; g.vx = g.vy = g.vz = 0; g.fuse = Math.min(g.fuse, L.STICKY.stuckFuse); this.ev('st', g.id, 0); break; }
        if (g.y < floor) { g.y = floor; g.vy = Math.abs(g.vy) * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
        if (solid) { g.x = was.x; g.y = was.y; g.z = was.z; g.vx *= -0.4; g.vz *= -0.4; }
        g.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, g.x)); g.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, g.z));
      }
      if (g.fuse <= 0) { this.explode(g); this.nades.splice(i, 1); }
    }
  }
  vehicles() {
    const j = this.jeep; if (!j) return;
    for (const id of [j.driver, j.gunner]) { const p = id && this.players.get(id); if (!p || !p.joined || !p.online || p.state !== 'alive' || !p.seat) { if (j.driver === id) { j.driver = null; j.spd = 0; } if (j.gunner === id) j.gunner = null; if (p) p.seat = null; } }
    if (!j.driver) j.spd *= 0.5;
    if (j.spd > 3 && j.driver) { // run them over
      const drv = this.players.get(j.driver);
      for (const e of this.enemies) if (!e.dead && !e.st.fly && Math.hypot(e.x - j.x, e.z - j.z) < 1.9 + e.st.radius && Math.abs(e.y - j.y) < 1.6) this.hurtEnemy(e, MATCH.jeep.runOver, 'jeep', drv, j, { push: 2.5 });
    }
  }
  // ammo crates and grenades turn up around the canyon now and then
  spots(dt) {
    if (this.phase !== 'wave' && this.phase !== 'truck' && this.phase !== 'break') return;
    this.ammoT -= dt; this.nadeT -= dt;
    const free = (list, kinds) => list.filter(([x, z]) => !this.pickups.some((k) => kinds.includes(k.kind) && k.spot && Math.hypot(k.x - x, k.z - z) < 0.5));
    if (this.ammoT <= 0) {
      this.ammoT = MATCH.spots.ammoEvery;
      const open = free(AMMO_SPOTS, ['ammo']);
      if (open.length && this.pickups.filter((k) => k.spot && k.kind === 'ammo').length < MATCH.spots.maxAmmo) { const [x, z] = open[Math.floor(this.rnd() * open.length)]; this.pickups.push({ id: this.nextId++, kind: 'ammo', spot: true, x, z, y: groundAt(x, z, 50, this.bars), life: 90 }); }
    }
    if (this.nadeT <= 0) {
      this.nadeT = MATCH.spots.nadeEvery;
      const open = free(NADE_SPOTS, ['frag', 'sticky']);
      if (open.length && this.pickups.filter((k) => k.spot && k.kind !== 'ammo').length < MATCH.spots.maxNades) { const [x, z] = open[Math.floor(this.rnd() * open.length)]; this.pickups.push({ id: this.nextId++, kind: this.rnd() < 0.55 ? 'frag' : 'sticky', spot: true, x, z, y: groundAt(x, z, 50, this.bars), life: 90 }); }
    }
  }

  // ---- ACTION: leave the jeep > get in the jeep > grab from the truck > revive a downed friend > rebuild a board > buy
  action(p, dt) {
    p.prompt = null;
    const edge = p.act && !p.actWas;
    if (p.state !== 'alive') { p.actWas = p.act; return; }
    if (p.seat) { if (edge) this.exitJeep(p); else p.prompt = { k: 'exit', label: p.seat === 'd' ? 'CONDUCIENDO' : 'EN LA TORRETA' }; p.actWas = p.act; return; }
    const j = this.jeep;
    if (j && Math.hypot(j.x - p.x, j.z - p.z) < MATCH.jeep.enter && Math.abs(j.y - p.y) < 2 && (!j.driver || !j.gunner)) {
      if (edge) this.enterJeep(p); else p.prompt = { k: 'jeep', label: !j.driver ? 'CONDUCIR' : 'TORRETA' };
      p.actWas = p.act; return;
    }
    if (this.truck && p.truckGot !== this.truck.n) {
      const tk = truckAt(this.truck.t);
      if (Math.hypot(tk.x - p.x, tk.z - p.z) < MATCH.truck.reach) { if (edge) this.gift(p); else p.prompt = { k: 'truck', label: WEAPONS[this.truck.weapon].name }; p.actWas = p.act; return; }
    }
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
    for (const o of OPENINGS) { if (o.open || this.bars[o.i] >= BOARDS_MAX) continue; const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < MATCH.buildRange && d < od && Math.abs(p.y - o.y) < 1.6) { od = d; op = o; } }
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
      if (edge) {
        if (p.pts >= stn.cost) {
          p.pts -= stn.cost;
          if (stn.kind === 'ammo') p.ammo++; else L.addGrenade(p.P, 2, 'frag');
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
        (p.moving ? 1 : 0) | (p.state === 'downed' ? 2 : 0) | (p.state === 'dead' ? 4 : 0) | (!here ? 8 : 0) | (p.firing ? 16 : 0) | (p.w === 'pistol' ? 32 : 0) | (p.P.shield <= 0.5 ? 64 : 0) | (p.id === this.host ? 128 : 0),
        Math.round(p.P.shield), Math.round(p.P.health), p.kills, p.pvp, p.deaths, p.score, p.color,
        p.state === 'downed' ? Math.max(0, Math.round(100 * (p.until - this.t) / MATCH.downedSecs)) : 0, W_IDX[p.w] ?? 0, p.seat === 'd' ? 1 : p.seat === 'g' ? 2 : 0, p.ready ? 1 : 0, L.lookStr(p.look), p.heads]);
    }
    const en = this.enemies.filter((e) => !e.dead).map((e) => [e.id, TYPE_IDX[e.type], r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), Math.max(1, Math.round(100 * e.hp / e.maxHp)), STATE_IDX[e.state] ?? 0, e.flash > 0.3 ? 1 : 0, e.haste > this.t ? 1 : 0,
      (e.wolf ? 1 : 0) | (e.stunUntil > this.t ? 4 : 0)]);
    const tk = this.truck ? truckAt(this.truck.t) : null, j = this.jeep;
    const s = {
      t: r2(this.t), ph: this.phase, wv: this.wave, cd: ['break', 'over', 'truck'].includes(this.phase) ? Math.max(0, Math.ceil(this.phaseUntil - this.t)) : 0,
      left: this.queue.length + this.enemies.filter((e) => !e.dead).length, pl, en, bd: this.bars.slice(), host: this.host, nt: this.night ? 1 : 0,
      pj: this.notes.map((n) => [n.id, r2(n.x), r2(n.y), r2(n.z)]), gr: this.nades.map((g) => [g.id, r2(g.x), r2(g.y), r2(g.z), NADE_IDX[g.kind], g.on ? 1 : 0]),
      pr: this.shots.map((q) => [q.id, q.kind === 'rocket' ? 0 : 1, r2(q.x), r2(q.y), r2(q.z)]),
      pk: this.pickups.map((k) => [k.id, k.kind, r2(k.x), r2(k.y), r2(k.z)]),
      tk: tk ? [r2(tk.x), r2(tk.z), r2(tk.yaw), W_IDX[this.truck.weapon], tk.stopped ? 1 : 0] : 0,
      jp: j ? [r2(j.x), r2(j.y), r2(j.z), r2(j.yaw), j.driver, j.gunner, r2(j.ty), r2(j.tp)] : 0,
      last: this.phase === 'over' ? this.last : undefined,
      ev: events ? this.events : [],
    };
    if (events) this.events = [];
    return s;
  }
  personal(id) {
    const p = this.players.get(id);
    if (!p || !p.joined) return { id, in: false, look: p ? L.lookStr(p.look) : undefined };
    const me = { id, in: true, st: p.state, sh: Math.round(p.P.shield), hp: Math.round(p.P.health), nd: [p.P.nades.frag, p.P.nades.sticky], pts: p.pts, ag: p.ammo,
      cd: p.state === 'downed' ? Math.max(0, Math.ceil(p.until - this.t)) : 0, pr: p.prompt, ws: p.slots.slice(), cw: p.w, wv: p.wv, seat: p.seat, ready: p.ready, host: this.host === id, look: L.lookStr(p.look) };
    if (p.corr) { me.corr = p.corr; p.corr = null; }
    if (p.seat === 'd' && this.jeep?.corr) { me.vc = this.jeep.corr; this.jeep.corr = null; }
    return me;
  }
}
