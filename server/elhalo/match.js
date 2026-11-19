// EL HALO horde match: one shared world, simulated here and streamed to every client (server/elhalo/index.js).
// The server owns the lobby, enemies (and their leaps), waves, the street dogs and the elote man, the supply truck, the jeep, grenades, rockets, needles, damage
// and points; clients own their own movement (checked here: speed, bounds, walls, falls) and send what they did
// (shots as rays, grenade throws, swings, holding ACTION). Free play: nothing in here knows about money.
import * as L from './rules.js';
import { OPENINGS, BUILDINGS, ELOTE, BUFADORA, ENEMY_SPAWNS, PLAYER_SPAWNS, STATIONS, OBSTACLES, FORT_ROUTES, FORT_DECK, fortRects,
  buildingAt, fortAt, terrain, groundAt, collide, wallDist, insideSolid, segHitsRect, truckAt, TRUCK, AMMO_SPOTS, NADE_SPOTS, JEEP_SPAWN,
  inCanyon, clampInCanyon, canyonCollide } from './map.js';
import { dogsAt, eloteShout } from './critters.js';

const { MATCH, WEAPONS, ENEMIES, BUFADORA_RULES: BF } = L;
export const EYE = 1.62;
const P_RADIUS = 0.38, MAX_SPEED = 7.6, MOVE_SLACK = 1.3, LUNGE_SPEED = 24;
const TYPE_IDX = Object.fromEntries(L.ENEMY_TYPES.map((t, i) => [t, i]));
const W_IDX = Object.fromEntries(L.WEAPON_IDS.map((t, i) => [t, i]));
const STATE_IDX = { walk: 0, hit: 1, grab: 2, tackle: 3, shoot: 4, bless: 5, idle: 6, climb: 7, swoop: 8, wail: 9, windup: 10, leap: 11, slam: 12 };
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
    this.idleT = 0; this.last = this.last || null;
    this.truck = null; this.jeep = null; this.night = false; this.ammoT = 6; this.nadeT = 12; this.host = null; this.forceNight = null;
    this.bufNext = null; this.bfPh = 'idle'; this.bfUntil = 0;
    this.chile = null; this.chileAt = null; this.chileWave = 0; this.caballosUntil = 0;
    if (hard) { this.players.clear(); return; }
    for (const [id, p] of this.players) { if (!p.joined) this.players.delete(id); else this.freshStats(p); }
    if (this.online().length) this.phase = 'lobby';
  }
  freshStats(p) {
    Object.assign(p, { kills: 0, pvp: 0, deaths: 0, heads: 0, score: 0, pts: 500, ammo: 0, ready: false, truckGot: -1, eloteAt: -Infinity, eloteWave: 0 });
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
        w: 'rifle', slots: [...L.START_WEAPONS], wv: 0, moving: 0, firing: 0, lastIn: nowMs, tokens: 3, act: false, actWas: false, rev: 0, revOf: null, prompt: null,
        hist: [], kills: 0, pvp: 0, deaths: 0, heads: 0, score: 0, pts: 500, ammo: 0, eloteAt: -Infinity, eloteWave: 0, inputs: 0, inWin: 0, until: 0, offT: 0, corr: null, seq: 0,
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
    if (this.bufNext == null) this.bufNext = this.t + BF.period;
    for (const p of this.online()) { p.ready = false; if (p.state !== 'alive') this.respawn(p); }
    this.ev('go');
  }

  respawn(p) {
    const far = PLAYER_SPAWNS.map(([x, z]) => ({ x, z, d: Math.min(99, ...this.enemies.map((e) => Math.hypot(e.x - x, e.z - z))) })).sort((a, b) => b.d - a.d);
    const s = far[Math.floor(this.rnd() * Math.min(3, far.length))];
    this.exitJeep(p, true);
    p.x = s.x + (this.rnd() - 0.5) * 1.5; p.z = s.z + (this.rnd() - 0.5) * 1.5; p.y = groundAt(p.x, p.z, 50); p.groundY = p.y; p.airT = 0;
    p.yaw = Math.atan2(p.x, p.z); p.pitch = 0; // face down the canyon toward the middle
    if (!p.slots || p.state === 'dead' || !p.wv) { p.slots = [...L.START_WEAPONS]; p.w = p.slots[0]; p.wv = (p.wv || 0) + 1; }
    const nades = p.P?.nades; p.P = L.createPlayer(p.slots); if (nades && p.state === 'downed') p.P.nades = nades;
    p.state = 'alive'; p.until = 0; p.hist = []; p.rev = 0;
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
    if (typeof msg.w === 'string' && (msg.wv === undefined || msg.wv === p.wv) && (p.slots.includes(msg.w) || (msg.w === 'torreta' && p.seat === 'g'))) p.w = msg.w;
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
    const w = WEAPONS[p.w], rate = w.rate * (w.burst || 1), cap = rate >= 4 ? 3 : 1.25;
    if (p.tokW !== p.w) { // each gun keeps its own bucket, so swapping neither drains nor refills it
      p.tokBy = p.tokBy || {}; if (p.tokW) p.tokBy[p.tokW] = { v: p.tokens, t: this.t };
      const b = p.tokBy[p.w]; p.tokens = b ? Math.min(cap, b.v + (this.t - b.t) * rate * 1.15) : cap; p.tokW = p.w;
    }
    p.tokens = Math.min(cap, p.tokens + dt * rate * 1.15);
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
    // A launched player may request a pose a few metres past the face (the geyser throws them);
    // we clamp them onto the rock rather than snapping them back mid-air. Anyone else that far
    // out is a teleport and gets rejected. The body never sits in the rock: see canyonCollide.
    if (!inCanyon(x, z, p.launched ? -8 : -0.2)) return reject();
    const dist = Math.hypot(x - p.x, z - p.z);
    const boost = p.power?.id === 'schnuttin' ? L.CHILE.schnuttinSpeed : 1;
    const top = (nowMs < p.lungeMs ? LUNGE_SPEED : MAX_SPEED) * boost; // a sword or hammer lunge covers ground fast
    if (dist > top * Math.max(0.1, dt) + MOVE_SLACK) return reject();
    const g = groundAt(x, z, y);
    if (y < terrain(x, z) - 0.6) return reject();
    // La Bufadora: a launched player is allowed to go very high and come down. No fall damage, and no 3s hover snap.
    // The canyon walls still stop them: you cannot be thrown through the rock.
    if (p.launched) {
      const q = { x, z }; canyonCollide(q, P_RADIUS);
      if (Math.hypot(q.x - x, q.z - z) > 1e-4) { x = q.x; z = q.z; p.corr = [r2(x), r2(y), r2(z)]; }
      p.moving = dist > 0.03 ? 1 : 0; p.x = x; p.y = y; p.z = z;
      const air = y - g;
      if (air < 0.3) { p.launched = false; p.groundY = y; p.airT = 0; }
      else p.airT = 0; // keep the launch until they land; the usual hover snap must not cancel it
      return;
    }
    // high above the ground is fine on the way DOWN (stepping or jumping off a roof deck: no fall damage, no snapping
    // back); going up is capped by a jump from the last place you stood
    const high = p.power?.id === 'schnuttin';
    if (y > Math.max(g + (high ? 9 : 2.6), p.groundY + (high ? 8 : 1.7))) return reject();
    if (y - p.y > (high ? 4 : 1.5) + 2 * Math.min(dt, 0.5)) return reject(); // a jump tops out near 1.2 m: no hopping onto roofs
    // no walking through walls: check the path at knee and chest height, and the end spot
    if (dist > 0.05) {
      const d = { x: (x - p.x) / dist, y: 0, z: (z - p.z) / dist };
      for (const h of [0.6, 1.3]) { const o = { x: p.x, y: Math.max(p.y, y) + h, z: p.z }; if (wallDist(o, d, dist + 0.1, true) < dist - 0.05) return reject(); }
    }
    const rad = p.power?.id === 'gigante' ? P_RADIUS * L.CHILE.giganteRadius : P_RADIUS;
    const q = { x, z }; collide(q, rad * 0.6, y, p.power?.id === 'gigante' ? 4.8 : 1.8);
    canyonCollide(q, rad); // full body radius against the rock face, even if building collide was looser
    const pushed = Math.hypot(q.x - x, q.z - z);
    if (pushed > 0.2) {
      const was = { x: p.x, z: p.z }; collide(was, rad * 0.6, p.y, p.power?.id === 'gigante' ? 4.8 : 1.8); canyonCollide(was, rad); // already wedged somewhere? let them wriggle out
      if (Math.hypot(was.x - p.x, was.z - p.z) <= 0.2 || dist > 1.5) {
        // modest shove into the canyon face: take the clamped pose so you slide along the wall instead of melting in
        if (pushed < 1.2) { x = q.x; z = q.z; p.corr = [r2(x), r2(y), r2(z)]; }
        else return reject();
      }
    } else if (pushed > 1e-4) { x = q.x; z = q.z; p.corr = [r2(x), r2(y), r2(z)]; }
    p.moving = dist > 0.03 ? 1 : 0; p.x = x; p.y = y; p.z = z;
    const air = y - g;
    if (air < 0.25) { p.groundY = y; p.airT = 0; } else p.airT += dt;
    if (p.airT > 3) { p.y = g; p.groundY = g; p.airT = 0; p.corr = [r2(p.x), r2(p.y), r2(p.z)]; } // nobody hovers
  }

  // ---- the jeep (wave 15+): the driver's client drives it like its own feet, the server checks the moves
  spawnJeep() {
    const y = groundAt(JEEP_SPAWN.x, JEEP_SPAWN.z, 50);
    this.jeep = { x: JEEP_SPAWN.x, y, z: JEEP_SPAWN.z, yaw: JEEP_SPAWN.yaw, spd: 0, driver: null, gunner: null, ty: 0, tp: 0, corr: null };
    this.ev('jp');
  }
  seatPos(seat) {
    const j = this.jeep, f = fwdOf(j.yaw), r = rightOf(j.yaw);
    return seat === 'd' ? { x: j.x + f.x * 0.25 - r.x * 0.45, y: j.y - 0.25, z: j.z + f.z * 0.25 - r.z * 0.45 } : { x: j.x - f.x * 1.15, y: j.y + 0.85, z: j.z - f.z * 1.15 };
  }
  enterJeep(p) {
    const j = this.jeep; if (!j || p.seat) return false;
    const seat = !j.driver ? 'd' : !j.gunner ? 'g' : null; if (!seat) return false;
    if (seat === 'd') j.driver = p.id; else { j.gunner = p.id; p.w = 'torreta'; p.P.weapons.torreta = L.loadout('torreta'); }
    p.seat = seat; Object.assign(p, this.seatPos(seat)); p.hist = [];
    this.ev('je', p.id, seat); return true;
  }
  exitJeep(p, quiet = false) {
    const j = this.jeep; if (!p.seat || !j) { p.seat = null; return; }
    if (j.driver === p.id) { j.driver = null; j.spd = 0; }
    if (j.gunner === p.id) j.gunner = null;
    delete p.P.weapons.torreta; if (p.w === 'torreta') p.w = p.slots[0];
    const r = rightOf(j.yaw), side = p.seat === 'd' ? -1 : 1;
    let spot = { x: j.x + r.x * 2.2 * side, z: j.z + r.z * 2.2 * side };
    collide(spot, P_RADIUS, groundAt(spot.x, spot.z, 50), 1.8);
    if (insideSolid({ ...spot, y: groundAt(spot.x, spot.z, 50) + 0.5 })) spot = { x: j.x, z: j.z };
    p.seat = null; p.x = spot.x; p.z = spot.z; p.y = groundAt(p.x, p.z, j.y + 1); p.groundY = p.y; p.airT = 0; p.hist = [];
    p.corr = [r2(p.x), r2(p.y), r2(p.z)];
    if (!quiet) this.ev('jx', p.id);
  }
  drive(p, [x, y, z, yaw], dt) {
    const j = this.jeep; if (!j || j.driver !== p.id) return;
    const reject = () => { j.corr = [r2(j.x), r2(j.y), r2(j.z), r2(j.yaw)]; };
    if (!inCanyon(x, z, -0.5)) return reject();
    const dist = Math.hypot(x - j.x, z - j.z);
    if (dist > MATCH.jeep.maxSpeed * Math.max(0.1, dt) + 1.5) return reject();
    const g = groundAt(x, z, j.y + 0.6);
    if (Math.abs(y - g) > 1.2) return reject();
    const q = { x, z }; collide(q, 1.0, g, 1.6);
    canyonCollide(q, 1.0);
    const shoved = Math.hypot(q.x - x, q.z - z);
    if (shoved > 0.35) {
      // ramming the canyon face: park on the clamped pose rather than sinking into the rock
      if (shoved < 2 && inCanyon(q.x, q.z, 0.9)) { j.x = q.x; j.z = q.z; j.y = groundAt(q.x, q.z, j.y + 0.6); j.yaw = yaw; j.spd *= 0.4; j.corr = [r2(j.x), r2(j.y), r2(j.z), r2(j.yaw)]; return; }
      return reject();
    }
    if (shoved > 1e-4) { x = q.x; z = q.z; j.corr = [r2(x), r2(g), r2(z), r2(yaw)]; }
    j.spd = j.spd * 0.5 + (dist / Math.max(0.05, dt)) * 0.5;
    j.x = x; j.y = g; j.z = z; j.yaw = yaw;
  }

  // ---- combat
  // every enemy and player the ray crosses before a wall, nearest first; head = the head sphere took the hit
  castRay(p, o, d, maxD = 140) {
    const wd = wallDist(o, d, maxD), hits = [];
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
  // Where a shot or nade should start. A tight 2m muzzle check was dropping fire after a rejected
  // move, a stair/roof desync, a Bufadora launch, or a laggy jeep seat — the tracer might still
  // draw on the client, but the server never applied damage. Accept a plausible client origin;
  // if it is inside a wall or wildly far, fire from the server eye instead of silently eating it.
  aimOrigin(p, o, d) {
    const eye = { x: p.x, y: p.y + EYE, z: p.z };
    if (!o || !finite(o.x, o.y, o.z)) return eye;
    const off = Math.hypot(o.x - eye.x, o.y - eye.y, o.z - eye.z);
    const maxOff = (p.launched || p.seat) ? 32 : 12;
    let src = off <= maxOff ? { x: o.x, y: o.y, z: o.z } : eye;
    const clipped = (q) => insideSolid(q) || wallDist(q, d, 0.3, true) <= 0.02;
    if (clipped(src)) {
      const dx = eye.x - src.x, dy = eye.y - src.y, dz = eye.z - src.z, len = Math.hypot(dx, dy, dz);
      if (len > 1e-6) {
        for (let i = 1; i <= 8; i++) {
          const k = i / 8, q = { x: src.x + dx * k, y: src.y + dy * k, z: src.z + dz * k };
          if (!clipped(q)) { src = q; break; }
        }
      }
      if (clipped(src)) src = { ...eye };
      if (clipped(src)) src = { x: eye.x + d.x * 0.45, y: eye.y + d.y * 0.45, z: eye.z + d.z * 0.45 };
    }
    return src;
  }
  shot(p, o, d) {
    const len = Math.hypot(d.x, d.y, d.z); if (len < 0.5 || len > 1.5) return;
    d = { x: d.x / len, y: d.y / len, z: d.z / len };
    o = this.aimOrigin(p, o, d);
    if (p.tokens < 1) return; p.tokens -= 1;
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
      const consider = (k, c) => { const v = { x: c.x - o.x, y: c.y - o.y, z: c.z - o.z }, l = Math.hypot(v.x, v.y, v.z); if (l > w.range) return; const a = Math.acos(Math.max(-1, Math.min(1, (v.x * d.x + v.y * d.y + v.z * d.z) / l))); if (a < bs && wallDist(o, { x: v.x / l, y: v.y / l, z: v.z / l }, l) >= l - 0.5) { bs = a; best = k; } };
      for (const e of this.enemies) if (!e.dead) consider({ e }, { x: e.x, y: this.lift(e) + e.st.height * 0.5, z: e.z });
      for (const q of this.players.values()) if (q !== p && q.joined && q.online && q.state === 'alive') consider({ q }, { x: q.x, y: q.y + 1, z: q.z });
      s.tgt = best;
    }
    this.shots.push(s); this.ev(kind === 'rocket' ? 'rk' : 'nd', p.id);
  }
  throwNade(p, o, kind = 'frag') {
    const cp = Math.cos(p.pitch), f = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
    o = this.aimOrigin(p, o, f);
    if (!L.throwGrenade(p.P, kind)) return;
    const G = kind === 'sticky' ? L.STICKY : L.GRENADES;
    const n = { id: this.nextId++, kind, by: p.id, x: o.x + f.x * 0.6, y: o.y - 0.15 + f.y * 0.6, z: o.z + f.z * 0.6,
      vx: f.x * G.speed, vy: f.y * G.speed + G.lift, vz: f.z * G.speed, fuse: G.fuse, on: null, age: 0 };
    if (insideSolid(n)) { n.x = o.x; n.y = o.y - 0.2; n.z = o.z; }
    this.nades.push(n); this.ev('g', p.id, NADE_IDX[kind]);
  }
  melee(p) {
    if (!L.tryMelee(p.P, this.t)) return;
    this.ev('ml', p.id);
    this.cone(p, L.MELEE.range, L.MELEE.damage, 'melee');
  }
  cone(p, range, dmg, how) {
    const f = fwdOf(p.yaw);
    const inCone = (x, z, y, r) => { const dx = x - p.x, dz = z - p.z, dd = Math.hypot(dx, dz); return dd < range + r && Math.abs(y - p.y) < 8 && (dx * f.x + dz * f.z) / (dd || 1) > 0.45; };
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
    if (by && by.power) {
      if (by.power.id === 'instakill' && (how === 'gun' || how === 'head')) dmg = Math.max(dmg, e.hp);
      if (by.power.id === 'gigante' && how === 'melee') dmg = Math.max(dmg, e.hp);
    }
    e.hp -= dmg; e.flash = 1;
    if (stun) e.stunUntil = this.t + stun;
    if (from && !e.st.etereo) { const k = (push ?? (how === 'melee' ? 1.2 : how === 'grenade' ? 0.8 : 0.04)) * (e.st.heavy ? 0.2 : 1) * (e.leapS?.ph === 'air' ? 0 : 1); const dx = e.x - from.x, dz = e.z - from.z, dd = Math.hypot(dx, dz) || 1; e.x += dx / dd * k; e.z += dz / dd * k; if (!e.st.fly && !e.climb) collide(e, e.st.radius, e.y, e.st.height, true); }
    if (by) { by.pts += MATCH.points.hit + (head ? MATCH.points.head : 0); by.score += MATCH.points.hit + (head ? MATCH.points.head : 0); this.ev('hm', by.id, head ? 1 : 0); }
    if (e.hp > 0) return;
    e.dead = true;
    const pts = L.killPoints(e.type, how);
    if (by) { by.kills++; by.pts += pts; by.score += pts; if (head) by.heads++; }
    this.ev('k', e.id, TYPE_IDX[e.type], r2(e.x), r2(this.lift(e)), r2(e.z), by ? by.id : null, how);
    const roll = this.rnd();
    const kind = roll < 0.18 ? 'ammo' : roll < 0.26 ? 'health' : roll < 0.3 ? 'frag' : roll < 0.33 ? 'sticky' : null;
    if (kind && this.pickups.length < 14) this.pickups.push({ id: this.nextId++, kind, x: e.x, z: e.z, y: groundAt(e.x, e.z, e.y + 1), life: MATCH.pickupLife });
  }

  hurtPlayer(q, amount, from, by, how, head = false) {
    if (q.state !== 'alive') return;
    if (this.calm && !(by && by.id)) return; // test hook: the horde is all bark
    // INTOCABLE stops horde damage only. Other players can still hurt you in PVP.
    const fromPlayer = by && by.id && this.players.has(by.id);
    if (q.power?.id === 'invuln' && !fromPlayer) { this.ev('blk', q.id); return; }
    const r = L.applyDamage(q.P, amount, this.t);
    this.ev('h', q.id, from ? r1(from.x) : null, from ? r1(from.z) : null, Math.round(amount), r.toShield > 0 ? 1 : 0, r.shieldBroke ? 1 : 0, head ? 1 : 0);
    if (by && by.id && by !== q) this.ev('hm', by.id, head ? 1 : 0);
    if (!r.dead) return;
    this.exitJeep(q, true);
    q.state = 'downed'; q.until = this.t + MATCH.downedSecs; q.deaths++; q.act = false;
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
    // history for lag-forgiving hit checks (last five ticks, ~500ms at 10 Hz)
    for (const e of this.enemies) { e.hist.unshift([e.x, e.y, e.z, e.yaw]); e.hist.length = Math.min(e.hist.length, 5); }
    for (const p of online) { p.hist.unshift([p.x, p.y, p.z]); p.hist.length = Math.min(p.hist.length, 5); if (p.firing > 0) p.firing--; }

    // players: shields, the bleed-out clock, riding in the jeep, the ACTION button
    for (const p of online) {
      if (p.state === 'alive') L.tickShield(p.P, t, dt, p.shMax || L.SHIELD.max);
      else {
        if (p.power) this.clearPower(p);
        if (p.state === 'downed' && t >= p.until) { p.state = 'dead'; p.until = Infinity; this.ev('dd', p.id); } // back next wave
      }
      if (p.seat && this.jeep) Object.assign(p, this.seatPos(p.seat));
    }
    this.tickChile(dt);
    this.tickPowers(dt);
    for (const p of online) this.action(p, dt);
    this.phases(dt);
    this.tickBufadora(dt);
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
        if (p.state === 'alive') L.heal(p.P, p.hpMax || L.HEALTH.max, p.hpMax || L.HEALTH.max);
        else if (p.state === 'dead') this.respawn(p);
      }
      if (this.wave >= MATCH.jeepWave && !this.jeep) this.spawnJeep();
      this.scheduleChile();
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
    this.clearChile(false);
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
    // the gun in hand is the one that gets swapped out; anything not in a slot is long gone
    const held = p.w === 'torreta' || !p.slots.includes(p.w) ? p.slots[0] : p.w;
    for (const k of Object.keys(p.P.weapons)) if (!p.slots.includes(k) && k !== 'torreta') delete p.P.weapons[k];
    p.P.current = held;
    const r = L.giveWeapon(p.P, id);
    if (r === 'new') { const i = p.slots.indexOf(held); p.slots[i >= 0 ? i : 0] = id; }
    if (!p.seat) p.w = id; // you're holding what you just got (topped up if you already had it)
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
      climb: null, swoop: 0, rise: 0, fortRoute: null, leapS: null, lcool: st.leap ? 1.5 + this.rnd() * 2 : 0, grabT: 0, recover: 0 };
    e.y = groundAt(e.x, e.z, 50);
    if (st.fly) e.y += st.fly.cruise;
    this.enemies.push(e); this.ev('sp', e.id);
    if (type === 'chupacabra' || type === 'lechuza' || type === 'llorona' || type === 'gordo') this.ev('sh', e.id);
    return e;
  }

  // ---- enemy brains
  ai(dt) {
    const t = this.t, ps = this.alive();
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.fling) { this.tickFling(e, dt); continue; }
      if (e.blowVy) {
        e.blowVy -= 16 * dt;
        e.y += e.blowVy * dt;
        const floor = groundAt(e.x, e.z, e.y);
        if (e.y <= floor) { e.y = floor; e.blowVy = 0; }
        else continue; // in the air off La Bufadora: no walking or leaping this tick
      }
      const st = e.st;
      e.cool -= dt; e.tcool -= dt; e.ncool -= dt; e.bcool -= dt; e.strafeT -= dt; e.lcool -= dt; if (e.act > 0) e.act -= dt;
      e.retarget -= dt;
      if (e.retarget <= 0 || !e.target || e.target.state !== 'alive' || !e.target.online || !e.target.joined || e.target.power?.id === 'invis') {
        e.retarget = 1; e.target = null; let bd = Infinity;
        for (const p of ps) {
          if (p.power?.id === 'invis') continue; // they don't see you or go for you
          const d = Math.hypot(p.x - e.x, p.z - e.z) + (e.route && buildingAt(p.x, p.z)?.id === e.route.bid ? -6 : 0); if (d < bd) { bd = d; e.target = p; }
        }
      }
      const tg = e.target;
      let spd = e.spd * (e.haste > t ? (st.bless ? 1 : ENEMIES.padre.bless.haste) : 1) * (e.stunUntil > t ? 0.35 : 1);
      if (st.shift) { e.shiftT -= dt; if (e.shiftT <= 0) { e.wolf = !e.wolf; e.shiftT = st.shift.every * (0.7 + this.rnd() * 0.6); this.ev('nh', e.id, e.wolf ? 1 : 0); } spd *= e.wolf ? st.shift.wolf : st.shift.man; }
      e.state = 'walk';
      if (!tg) { e.state = 'idle'; this.stepEnemy(e, 0, 0, 0, dt); continue; }
      if (e.climb) { this.climbStep(e, dt); continue; }
      if (e.leapS) { this.leapStep(e, dt, ps); continue; }
      if (e.recover > 0) { e.recover -= dt; e.state = 'slam'; this.stepEnemy(e, 0, 0, 0, dt, tg); continue; } // picking itself up: the moment to punish it
      if (e.grabT > 0) { this.grabStep(e, tg, dt); continue; }
      if (st.fly) { this.flyer(e, tg, spd, dt); continue; }
      if (st.etereo) { this.etereo(e, tg, spd, dt, ps); continue; }
      const goal = this.goalFor(e, tg, dt);
      if (goal === 'climb') { this.climbStep(e, dt); continue; }
      let dx = goal.x - e.x, dz = goal.z - e.z; const gd = Math.hypot(dx, dz) || 1; dx /= gd; dz /= gd;
      const tdx = tg.x - e.x, tdz = tg.z - e.z, d = Math.hypot(tdx, tdz) || 1;
      const direct = goal.direct;
      if (e.losT <= 0) { e.losT = 0.4; const o = { x: e.x, y: e.y + st.height * 0.85, z: e.z }, to = { x: tg.x - o.x, y: tg.y + 1.2 - o.y, z: tg.z - o.z }; const l = Math.hypot(to.x, to.y, to.z) || 1; e.los = wallDist(o, { x: to.x / l, y: to.y / l, z: to.z / l }, l) >= l - 0.4; } else e.losT -= dt;
      const close = d < st.reach && Math.abs(tg.y - e.y) < 1.6;
      let vx = 0, vz = 0;
      if (st.leap && e.lcool <= 0 && direct && e.los && d >= st.leap.min && d <= st.leap.range && Math.abs(tg.y - e.y) < (st.leap.dy || 3.5) && this.leapOk(e, tg)) {
        e.leapS = { ph: 'wind', t: st.leap.windup }; e.state = 'windup'; e.yaw = Math.atan2(-tdx, -tdz); this.ev('ag', e.id); this.stepEnemy(e, 0, 0, 0, dt, tg); continue;
      }
      if (st.grab && close && e.cool <= 0) { e.grabT = st.grab.windup; e.state = 'grab'; this.ev('gb', e.id); this.stepEnemy(e, 0, 0, 0, dt, tg); continue; }
      if (e.tackle > 0) { // the tackle / pounce
        e.tackle -= dt; e.state = 'tackle';
        vx = e.tdir.x; vz = e.tdir.z; spd = e.spd * st.tackle.speed;
        for (const p of ps) if (Math.hypot(p.x - e.x, p.z - e.z) < st.reach + 0.3 && Math.abs(p.y - e.y) < 1.6) { this.hurtPlayer(p, st.tackle.damage * e.dmg, e, null, 'tackle'); e.tackle = 0; e.cool = st.every; break; }
      } else if (close && st.grab) { e.state = 'idle';
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
  // ---- the big jumps: the luchador volador's eagle dive (long and high) and the gordo's belly flop (short and heavy).
  // Telegraphed: a crouch and a shout first ('ag'), then the landing spot is fixed where the target stood at take-off and
  // sent to everyone ('lp') so it can be marked on the ground. Step out of the ring before it lands and it whiffs.
  leapOk(e, tg) { // same side of every wall: both outdoors with no building between, or inside the same one
    const eb = buildingAt(e.x, e.z), tb = buildingAt(tg.x, tg.z);
    if (eb !== tb) return false;
    if (!eb && BUILDINGS.some((b) => segHitsRect(e, tg, b, 0.4))) return false;
    if (insideSolid({ x: tg.x, y: tg.y + 0.6, z: tg.z })) return false;
    return true;
  }
  leapStep(e, dt, ps) {
    const st = e.st, Lp = st.leap, s = e.leapS, tg = e.target;
    if (s.ph === 'wind') {
      e.state = 'windup'; s.t -= dt;
      if (tg && tg.state === 'alive') e.yaw = Math.atan2(-(tg.x - e.x), -(tg.z - e.z));
      if (s.t > 0) return;
      if (!tg || tg.state !== 'alive' || !this.leapOk(e, tg)) { e.leapS = null; e.lcool = 1.5; return; }
      // take off: the landing spot is wherever the target is right now (capped at the leap's range)
      let dx = tg.x - e.x, dz = tg.z - e.z; const d = Math.hypot(dx, dz) || 1, far = Math.min(d, Lp.range + 1.5);
      const to = { x: e.x + dx / d * far, z: e.z + dz / d * far }; canyonCollide(to, st.radius); to.y = groundAt(to.x, to.z, tg.y + 0.5);
      const inside = buildingAt(e.x, e.z), apex = inside ? Math.min(Lp.apex, Math.max(0.6, inside.h - st.height - 0.5)) : Lp.apex;
      e.leapS = { ph: 'air', t: 0, dur: Lp.air, from: { x: e.x, y: e.y, z: e.z }, to, apex };
      e.state = 'leap'; this.ev('lp', e.id, r2(to.x), r2(to.y), r2(to.z), Lp.air, r2(Lp.radius), r2(apex), r2(e.x), r2(e.y), r2(e.z));
      return;
    }
    // in the air: a server-side arc, everyone sees the same flight
    s.t += dt; const k = Math.min(1, s.t / s.dur);
    e.x = s.from.x + (s.to.x - s.from.x) * k; e.z = s.from.z + (s.to.z - s.from.z) * k;
    e.y = s.from.y + (s.to.y - s.from.y) * k + s.apex * 4 * k * (1 - k);
    e.yaw = Math.atan2(-(s.to.x - s.from.x), -(s.to.z - s.from.z)); e.state = 'leap';
    if (k < 1) return;
    // landing: the shockwave. Full damage near the middle, fading to a third at the edge; knocked back out of it.
    e.x = s.to.x; e.z = s.to.z; e.y = s.to.y; e.leapS = null; e.lcool = Lp.cool; e.recover = Lp.recover; e.state = 'slam';
    collide(e, st.radius, e.y, st.height, true); e.y = groundAt(e.x, e.z, e.y + 0.3);
    this.ev('lx', r2(e.x), r2(e.y), r2(e.z), r2(Lp.radius), e.type === 'gordo' ? 1 : 0, e.id);
    for (const p of ps) {
      if (p.seat || p.state !== 'alive') continue;
      const dd = Math.hypot(p.x - e.x, p.z - e.z); if (dd > Lp.radius || Math.abs(p.y - e.y) > 1.8) continue;
      const f = dd <= Lp.radius * 0.4 ? 1 : 1 - 0.67 * (dd - Lp.radius * 0.4) / (Lp.radius * 0.6);
      this.hurtPlayer(p, Lp.damage * f * e.dmg, e, null, e.type === 'gordo' ? 'flop' : 'aguila');
      if (p.state === 'alive') { // thrown back
        const ux = dd > 0.05 ? (p.x - e.x) / dd : -Math.sin(e.yaw), uz = dd > 0.05 ? (p.z - e.z) / dd : -Math.cos(e.yaw);
        const q = { x: p.x + ux * Lp.push, z: p.z + uz * Lp.push }; collide(q, P_RADIUS, p.y, 1.8);
        if (!insideSolid({ x: q.x, y: p.y + 0.6, z: q.z })) { p.x = q.x; p.z = q.z; p.y = groundAt(q.x, q.z, p.y + 0.5); p.groundY = p.y; p.airT = 0; p.hist = []; p.corr = [r2(p.x), r2(p.y), r2(p.z)]; }
        this.ev('kb', p.id);
      }
    }
  }
  // the gordo's bear hug: arms out, a beat to get away, then it squeezes whoever is still in reach
  grabStep(e, tg, dt) {
    const g = e.st.grab; e.state = 'grab'; e.grabT -= dt;
    if (tg) e.yaw = Math.atan2(-(tg.x - e.x), -(tg.z - e.z));
    this.stepEnemy(e, 0, 0, 0, dt, tg);
    if (e.grabT > 0) return;
    e.grabT = 0; e.cool = g.cool; e.act = 0.5;
    const hit = tg && tg.state === 'alive' && !tg.seat && Math.hypot(tg.x - e.x, tg.z - e.z) < g.reach && Math.abs(tg.y - e.y) < 1.6;
    if (hit) this.hurtPlayer(tg, g.damage * e.dmg, e, null, 'abrazo');
    this.ev('gs', e.id, hit ? 1 : 0);
  }
  // La Llorona drifts straight at you through walls, rises up to wherever you're standing, wails, and
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
      if (inCanyon(nx, nz, e.st.radius)) { e.x = nx; e.z = nz; e.y = Math.max(terrain(nx, nz), tg.y - 0.2); this.ev('bk', e.id); }
    }
    const close = d < st.reach && Math.abs(tg.y - e.y) < 1.8;
    if (close) { e.state = 'hit'; if (e.cool <= 0) { e.cool = st.every; e.act = 0.4; this.hurtPlayer(tg, st.hit * e.dmg, e, null, 'llorona'); } }
    else { e.x += dx / d * spd * dt; e.z += dz / d * spd * dt; if (e.act <= 0) e.state = 'walk'; }
    canyonCollide(e, e.st.radius);
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
      if (insideSolid({ x: nx, y: ny, z: nz })) { e.swoop = 0; e.rise = 1; } else { e.x = nx; e.y = ny; e.z = nz; }
    } else {
      if (e.rise > 0) e.rise -= dt;
      if (d < st.fly.near && !indoors && e.rise <= 0 && e.cool <= 0) { e.swoop = 1.6; this.ev('sh', e.id); }
      if (d < 5 && e.swoop <= 0) { vx = -dz / d; vz = dx / d; } // circle overhead
      e.x += vx * spd * dt; e.z += vz * spd * dt;
      e.y += Math.max(-4 * dt, Math.min(5 * dt, cruise - e.y));
    }
    canyonCollide(e, e.st.radius);
    if (e.y < ground + 0.4) e.y = ground + 0.4;
    e.yaw = Math.atan2(-vx, -vz);
  }
  // up the outside of a fort wall, hand over hand, then over the top onto the deck
  climbStep(e, dt) {
    const c = e.climb; e.state = 'climb';
    e.y = Math.min(c.top, e.y + 3.2 * dt);
    if (e.y >= c.top - 0.01) { e.x = c.in.x; e.z = c.in.z; e.y = c.top; e.climb = null; this.ev('cl', e.id); return; }
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
    collide(e, st.radius, e.y, st.height, true);
    e.y = groundAt(e.x, e.z, e.y);
    const face = tg && (e.state !== 'walk' || Math.hypot(tg.x - e.x, tg.z - e.z) < 12) ? { x: tg.x - e.x, z: tg.z - e.z } : vl > 0.1 ? { x: vx, z: vz } : null;
    if (face && !['windup', 'grab', 'slam'].includes(e.state)) e.yaw = Math.atan2(-face.x, -face.z);
    e.chk.t += dt;
    if (e.chk.t > 0.8) {
      const moved = Math.hypot(e.x - e.chk.x, e.z - e.chk.z);
      if (moved < 0.35 && vl > 0.3 && !e.detour && e.state === 'walk') { const sgn = this.rnd() < 0.5 ? 1 : -1; e.detour = { x: -vz * sgn, z: vx * sgn, t: 0.9 }; e.stuck = (e.stuck || 0) + 1; } else if (moved > 1) e.stuck = 0;
      e.chk = { x: e.x, z: e.z, t: 0 };
    }
  }

  // Where should e head for to reach tg? Returns a point ({x,z,direct}) or 'climb' when it starts up a fort wall.
  // Every building is open, so getting in is just a matter of walking to a door or window and through it.
  goalFor(e, tg, dt) {
    const eb = buildingAt(e.x, e.z), tb = buildingAt(tg.x, tg.z);
    const near = (pt, r) => Math.hypot(pt.x - e.x, pt.z - e.z) < r;
    const pickOp = (bid) => {
      const ops = OPENINGS.filter((o) => o.b === bid && (o.door || !e.st.doors)).map((o) => ({ o, d: Math.hypot(o.out.x - e.x, o.out.z - e.z) })).sort((a, b) => a.d - b.d); // the big ones only fit through doors
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
        e.route.stage = 1;
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
        else if (n.y < terrain(n.x, n.z) || insideSolid(n)) gone = true;
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
        const wall = insideSolid({ x: nx, y: ny, z: nz }) || ny < terrain(nx, nz);
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
        const floor = Math.max(terrain(g.x, g.z), groundAt(g.x, g.z, was.y)) + 0.12;
        const solid = insideSolid(g);
        if (g.kind === 'sticky' && (g.y < floor || solid)) { if (solid) { g.x = was.x; g.y = was.y; g.z = was.z; } else g.y = floor; g.on = { wall: true }; g.vx = g.vy = g.vz = 0; g.fuse = Math.min(g.fuse, L.STICKY.stuckFuse); this.ev('st', g.id, 0); break; }
        if (g.y < floor) { g.y = floor; g.vy = Math.abs(g.vy) * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
        if (solid) { g.x = was.x; g.y = was.y; g.z = was.z; g.vx *= -0.4; g.vz *= -0.4; }
        clampInCanyon(g, 0.12);
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
      if (open.length && this.pickups.filter((k) => k.spot && k.kind === 'ammo').length < MATCH.spots.maxAmmo) { const [x, z] = open[Math.floor(this.rnd() * open.length)]; this.pickups.push({ id: this.nextId++, kind: 'ammo', spot: true, x, z, y: groundAt(x, z, 50), life: 90 }); }
    }
    if (this.nadeT <= 0) {
      this.nadeT = MATCH.spots.nadeEvery;
      const open = free(NADE_SPOTS, ['frag', 'sticky']);
      if (open.length && this.pickups.filter((k) => k.spot && k.kind !== 'ammo').length < MATCH.spots.maxNades) { const [x, z] = open[Math.floor(this.rnd() * open.length)]; this.pickups.push({ id: this.nextId++, kind: this.rnd() < 0.55 ? 'frag' : 'sticky', spot: true, x, z, y: groundAt(x, z, 50), life: 90 }); }
    }
  }

  // ---- ACTION: leave the jeep > get in the jeep > grab from the truck > revive a downed friend > an elote > buy
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
    // the elote man: a heal plus a full refill of the gun in hand, once per wave per player (server-authoritative)
    if (Math.hypot(ELOTE.x - p.x, ELOTE.z - p.z) < ELOTE.range && Math.abs(p.y - terrain(ELOTE.x, ELOTE.z)) < 1.6) {
      const used = p.eloteWave === this.wave, full = p.P.health >= L.HEALTH.max;
      if (edge && !used) {
        if (!full) L.heal(p.P, MATCH.elote.heal);
        L.refillWeapon(p.P, p.w);
        const s = p.P.weapons[p.w];
        p.eloteWave = this.wave; p.eloteAt = this.t;
        this.ev('el', p.id, 1, p.w, s ? s.mag : 0, s ? s.reserve : 0);
      }
      p.prompt = { k: 'elote', label: used ? 'Ya comiste este round' : 'ELOTE Y BALAS', ready: !used };
      p.actWas = p.act; return;
    }
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

  // ---- La Bufadora: a shared blowhole. Everyone hears the same rumble, then the same geyser.
  overBufadora(x, z, y = 0) {
    const d = Math.hypot(x - BUFADORA.x, z - BUFADORA.z);
    if (d > BUFADORA.r + 0.15) return false;
    const g = groundAt(BUFADORA.x, BUFADORA.z, 50);
    return y < g + 5; // standing on it, or just above it (a jump, a jeep, a floater)
  }
  tickBufadora() {
    if (['idle', 'lobby', 'over'].includes(this.phase)) {
      if (this.bfPh !== 'idle') this.bfPh = 'idle';
      return;
    }
    if (this.bufNext == null) this.bufNext = this.t + BF.period;
    const warnAt = this.bufNext - BF.warn;
    if (this.bfPh === 'blow' && this.t >= this.bfUntil) this.bfPh = 'idle';
    if (this.t >= this.bufNext) {
      this.bfPh = 'blow';
      this.bfUntil = this.t + BF.blast;
      this.ev('bfb');
      this.launchBufadora();
      this.bufNext += BF.period;
    } else if (this.t >= warnAt && this.bfPh !== 'warn' && this.bfPh !== 'blow') {
      this.bfPh = 'warn';
      this.ev('bfw');
    }
  }
  launchBufadora() {
    for (const p of this.alive()) {
      if (p.seat) continue; // riding EL TORO: stay in the jeep
      if (!this.overBufadora(p.x, p.z, p.y)) continue;
      p.launched = true; p.airT = 0;
      this.ev('bfl', p.id, BF.launchVy);
    }
    for (const e of this.enemies) {
      if (e.dead || e.st.fly) continue;
      if (!this.overBufadora(e.x, e.z, e.y)) continue;
      e.blowVy = BF.enemyVy;
      this.ev('bfe', e.id, BF.enemyVy);
    }
  }
  // dev / e2e: start the warning now so the blast lands in `warn` seconds (same path as the timer).
  triggerBufadora() {
    if (['idle', 'lobby'].includes(this.phase)) {
      if (this.phase === 'idle') this.phase = 'break';
      else this.countdown();
    }
    this.bufNext = this.t + BF.warn;
    this.bfPh = 'warn';
    this.bfUntil = 0;
    this.ev('bfw');
    return { ok: true, in: BF.warn };
  }


  // ---- La Michoacana chili peppers (one per wave, first eater takes it)
  scheduleChile() {
    this.chileWave = this.wave;
    if (this.emptyWave) { this.chileAt = null; return; } // quiet test waves stay empty unless a hook plants one
    this.clearChile(false);
    this.chileAt = this.t + L.pickChileAt(this.rnd);
  }
  spawnChile(power, x, z) {
    const id = typeof power === 'string' && L.isChilePower(power) ? power : L.pickChilePower(this.rnd);
    const sx = x !== undefined ? +x : L.CHILE_SPOT.x;
    const sz = z !== undefined ? +z : L.CHILE_SPOT.z;
    this.chile = { id: this.nextId++, power: id, x: sx, z: sz, y: groundAt(sx, sz, 50) };
    this.chileAt = null;
    this.ev('chile', id, r2(this.chile.x), r2(this.chile.y), r2(this.chile.z));
    return this.chile;
  }
  clearChile(stripPowers = false) {
    if (this.chile) { this.ev('ch0', this.chile.id); this.chile = null; }
    this.chileAt = null;
    if (stripPowers) for (const p of this.players.values()) if (p.power) this.clearPower(p);
  }
  tickChile(dt) {
    if (this.chileAt != null && this.phase === 'wave' && this.t >= this.chileAt && !this.chile && this.chileWave === this.wave) {
      this.spawnChile();
    }
    const k = this.chile;
    if (!k) return;
    // if the wave already moved on, the leftover pepper leaves with it
    if (this.phase !== 'wave' && this.phase !== 'truck' && this.phase !== 'break') { this.clearChile(false); return; }
    const who = this.alive().find((p) => !p.seat && Math.hypot(p.x - k.x, p.z - k.z) < L.CHILE.eatRange && Math.abs(p.y - k.y) < L.CHILE.eatY);
    if (!who) return;
    const power = k.power;
    this.chile = null;
    this.grantPower(who, power);
  }
  grantPower(p, id) {
    if (!p || !L.isChilePower(id)) return { error: 'bad power' };
    if (p.power) this.clearPower(p);
    p.power = { id, until: this.t + L.CHILE.duration, swing: 0 };
    if (id === 'gigante') {
      p.hpMax = L.HEALTH.max * L.CHILE.giganteVitals;
      p.shMax = L.SHIELD.max * L.CHILE.giganteVitals;
      p.P.health = Math.min(p.hpMax, p.P.health * L.CHILE.giganteVitals);
      p.P.shield = Math.min(p.shMax, p.P.shield * L.CHILE.giganteVitals);
    }
    this.ev('eat', p.id, id);
    if (id === 'schnuttin') this.ev('schnuttin', p.id);
    if (id === 'caballos') this.washHorde(p);
    return { ok: true, id, until: p.power.until };
  }
  clearPower(p) {
    if (!p?.power) return;
    const id = p.power.id;
    if (id === 'gigante') {
      p.P.health = Math.min(L.HEALTH.max, p.P.health);
      p.P.shield = Math.min(L.SHIELD.max, p.P.shield);
      p.hpMax = L.HEALTH.max;
      p.shMax = L.SHIELD.max;
    }
    p.power = null;
    this.ev('pw0', p.id, id);
  }
  tickPowers(dt) {
    for (const p of this.players.values()) {
      if (!p.power) continue;
      if (this.t >= p.power.until || p.state !== 'alive') { this.clearPower(p); continue; }
      if (p.power.id === 'mazo') this.tickMazo(p, dt);
    }
    if (this.caballosUntil && this.t >= this.caballosUntil) this.caballosUntil = 0;
  }
  tickMazo(p, dt) {
    p.power.swing = (p.power.swing || 0) - dt;
    if (p.power.swing > 0) return;
    p.power.swing = L.CHILE.mazoPeriod;
    const fwd = fwdOf(p.yaw);
    this.ev('swing', p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw));
    for (const e of this.enemies) {
      if (e.dead || e.fling) continue;
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
      if (d > L.CHILE.mazoReach + (e.st.radius || 0) || Math.abs(e.y - p.y) > 3.2) continue;
      const along = d < 0.35 ? 1 : (dx * fwd.x + dz * fwd.z) / d;
      if (along < -0.15 && d > 1.6) continue; // mostly in front or very close
      this.flingEnemy(e, p, dx, dz, d);
    }
  }
  flingEnemy(e, by, dx, dz, d) {
    const n = d > 1e-4 ? 1 / d : 1;
    const ox = d > 1e-4 ? dx * n : -Math.sin(by.yaw);
    const oz = d > 1e-4 ? dz * n : -Math.cos(by.yaw);
    e.fling = { vx: ox * L.CHILE.mazoOut, vy: L.CHILE.mazoUp, vz: oz * L.CHILE.mazoOut, by: by.id };
    e.target = null;
    e.leapS = 0;
    e.climb = 0;
    this.ev('fling', e.id, r2(e.fling.vx), r2(e.fling.vy), r2(e.fling.vz), by.id);
  }
  tickFling(e, dt) {
    if (e.dead || !e.fling) return;
    const f = e.fling;
    f.vy -= 18 * dt;
    const nx = e.x + f.vx * dt, ny = e.y + f.vy * dt, nz = e.z + f.vz * dt;
    const floor = groundAt(nx, nz, ny);
    const dist = Math.hypot(nx - e.x, ny - e.y, nz - e.z);
    const dir = dist > 1e-5 ? { x: (nx - e.x) / dist, y: (ny - e.y) / dist, z: (nz - e.z) / dist } : { x: 0, y: -1, z: 0 };
    const wall = wallDist({ x: e.x, y: e.y + Math.max(0.4, (e.st.height || 1.6) * 0.5), z: e.z }, dir, dist + 0.2, true);
    const q = { x: nx, z: nz }; canyonCollide(q, e.st.radius || 0.4);
    const slammed = ny <= floor + 0.05;
    const rock = Math.hypot(q.x - nx, q.z - nz) > 0.04;
    const out = !inCanyon(nx, nz, 0.1);
    if (wall < dist - 0.02 || slammed || rock || out) {
      const by = this.players.get(f.by) || null;
      e.x = rock ? q.x : nx; e.z = rock ? q.z : nz; e.y = Math.max(floor, ny);
      e.fling = null;
      this.hurtEnemy(e, Math.max(e.hp, 9999), 'mazo', by, { x: e.x, z: e.z });
      return;
    }
    e.x = nx; e.y = ny; e.z = nz;
  }
  washHorde(by) {
    this.caballosUntil = this.t + L.CHILE.duration;
    this.ev('caballos', by ? by.id : null);
    // washes away the horde on the map right now. Other human players are not
    // swept away — this is a horde-clear, not a PVP wipe.
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.fling = null;
      this.ev('wash', e.id, r2(e.x), r2(e.y), r2(e.z));
      this.hurtEnemy(e, Math.max(e.hp, 9999), 'caballos', by, { x: e.x, z: e.z });
    }
  }

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
      left: this.queue.length + this.enemies.filter((e) => !e.dead).length, pl, en, host: this.host, nt: this.night ? 1 : 0,
      dg: dogsAt(this.t).map((d) => [r2(d.x), r2(d.z), r2(d.yaw), d.gait]), el: eloteShout(this.t),
      pj: this.notes.map((n) => [n.id, r2(n.x), r2(n.y), r2(n.z)]), gr: this.nades.map((g) => [g.id, r2(g.x), r2(g.y), r2(g.z), NADE_IDX[g.kind], g.on ? 1 : 0]),
      pr: this.shots.map((q) => [q.id, q.kind === 'rocket' ? 0 : 1, r2(q.x), r2(q.y), r2(q.z)]),
      pk: this.pickups.map((k) => [k.id, k.kind, r2(k.x), r2(k.y), r2(k.z)]),
      tk: tk ? [r2(tk.x), r2(tk.z), r2(tk.yaw), W_IDX[this.truck.weapon], tk.stopped ? 1 : 0] : 0,
      jp: j ? [r2(j.x), r2(j.y), r2(j.z), r2(j.yaw), j.driver, j.gunner, r2(j.ty), r2(j.tp)] : 0,
      last: this.phase === 'over' ? this.last : undefined,
      ev: events ? this.events : [],
      bf: this.bfPh === 'idle' ? 0 : [this.bfPh === 'blow' ? 1 : 0, r2(this.bfPh === 'blow' ? Math.max(0, this.bfUntil - this.t) : Math.max(0, this.bufNext - this.t))],
      ch: this.chile ? [this.chile.id, this.chile.power, r2(this.chile.x), r2(this.chile.y), r2(this.chile.z)] : 0,
      pw: [...this.players.values()].filter((p) => p.power).map((p) => [p.id, p.power.id, r2(Math.max(0, p.power.until - this.t))]),
    };
    if (events) this.events = [];
    return s;
  }
  personal(id) {
    const p = this.players.get(id);
    if (!p || !p.joined) return { id, in: false, look: p ? L.lookStr(p.look) : undefined };
    const me = { id, in: true, st: p.state, sh: Math.round(p.P.shield), hp: Math.round(p.P.health), nd: [p.P.nades.frag, p.P.nades.sticky], pts: p.pts, ag: p.ammo,
      cd: p.state === 'downed' ? Math.max(0, Math.ceil(p.until - this.t)) : 0, pr: p.prompt, ws: p.slots.slice(), cw: p.w, wv: p.wv, seat: p.seat, ready: p.ready, host: this.host === id, look: L.lookStr(p.look),
      pw: p.power?.id || null, pwl: p.power ? r2(Math.max(0, p.power.until - this.t)) : 0, hpMax: p.hpMax || L.HEALTH.max, shMax: p.shMax || L.SHIELD.max };
    if (p.corr) { me.corr = p.corr; p.corr = null; }
    if (p.seat === 'd' && this.jeep?.corr) { me.vc = this.jeep.corr; this.jeep.corr = null; }
    return me;
  }
}
