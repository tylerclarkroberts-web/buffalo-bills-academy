// The company picnic (behind the last door in the Hall of Doors): everyone who opened it stands in the same quarry and shoots
// each other. Nothing is at stake: no money, acid or bugs move here, and nothing is saved. The browser says where it
// is standing and what it hit; the server keeps score, hands out what is lying about, and refuses the impossible
// (walking too fast, shooting too often or with a gun you do not hold, hitting someone out of range, behind you,
// already down or just back up).
// ponytail: cover is on the honour system (the shooter's browser checks rock and ground). If anyone starts riveting
// through boulders, check the line here too with picnic-map's solid().
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { GROUND, SPAWNS, INTERN_RING, GUNS, PICKUPS, PICKUP_REACH } from './engine/picnic-map.js';

export const PICNIC = {
  staleMs: 4000,    // not heard from in this long: gone home
  hp: 100,
  hat: 60,          // the hard hat takes the first three rivets. A second one, picked up, doubles it until it is shot off
  hatWaitMs: 4000,  // left alone this long, a dented hat starts popping back out
  hatFillMs: 2000,  // and is whole again this long after that
  respawnMs: 3000,
  safeMs: 2000,     // just back up: nobody can hit you until this runs out or you fire
  aim: 0.7,         // radians off dead ahead a hit may be (the two browsers never quite agree where anyone is)
  max: 16,
  feedMs: 9000,
  backMs: { stapler: 20000, surveyor: 20000, dynamite: 30000, hat: 45000, salad: 30000 }, // how long a taken pickup stays gone
};
export const INTERN = 'intern';
const FRESH = { hp: PICNIC.hp, hat: PICNIC.hat, hitAt: 0, gun: null }; // how anyone arrives or comes back

/** What one shot does to a miner `d` metres away: from the shooter, or for dynamite from where it went off. */
export function damage(gun, d) {
  if (gun === 'stapler') return Math.round(110 * Math.max(0, Math.min(1, (18 - d) / 13)));
  if (gun === 'surveyor') return 110;
  if (gun === 'dynamite') return Math.round(150 * Math.max(0, 1 - d / GUNS.dynamite.blast));
  return 20;
}

export class Picnic {
  constructor({ store, avatars, now, randInt }) {
    this.store = store; this.avatars = avatars; this.now = now; this.randInt = randInt || ((n) => crypto.randomInt(n));
    // playerId -> { id, x, z, yaw, air, at, hp, hat, hitAt, gun: { kind, ammo } | null, deadUntil, safeUntil, kills, deaths, nextShot, shot, by, got }
    this.here = new Map();
    this.back = new Map(); // pickup id -> when it is there again
    this.feed = []; this.seq = 0;
    this.intern = { id: INTERN, ...FRESH, deadUntil: 0, safeUntil: 0, kills: 0, deaths: 0, air: 0, shot: { n: 0 } };
  }
  /** Gary walks the same circle all day. He is unarmed and gets back up. */
  gary(now) {
    const g = this.intern, a = (now / 1000) * (2.2 / INTERN_RING);
    if (g.hp <= 0 && now >= g.deadUntil) Object.assign(g, FRESH);
    return Object.assign(g, { x: Math.cos(a) * INTERN_RING, z: Math.sin(a) * INTERN_RING, yaw: Math.PI - a, at: now });
  }
  /** What is left of a hard hat right now: `hat` is what it was when last hit. One hat mends itself; the second does not. */
  hatOf(p, now) {
    if (p.hp <= 0) return 0;
    return Math.min(Math.max(PICNIC.hat, p.hat), p.hat + (Math.max(0, now - p.hitAt - PICNIC.hatWaitMs) * PICNIC.hat) / PICNIC.hatFillMs);
  }
  nameOf(p) { return p.id === INTERN ? 'Gary (intern)' : this.store.players[p.id]?.name || 'A miner'; }
  /** The spawn furthest from anyone still standing (any of them if you are alone). */
  spawn() {
    const up = [...this.here.values()].filter((p) => p.hp > 0);
    const room = (s) => Math.min(999, ...up.map((p) => Math.hypot(p.x - s.x, p.z - s.z)));
    let best = SPAWNS[this.randInt(SPAWNS.length)];
    for (const s of SPAWNS) if (room(s) > room(best)) best = s;
    return { x: best.x, z: best.z };
  }
  /** Standing, past their grace period and still reporting: someone who can be hurt. */
  open(t, now) { return t.hp > 0 && now >= t.safeUntil && now - t.at <= PICNIC.staleMs; }
  /** Could `me` have put a shot at `p`: in range, and (past arm's reach) at least facing that way. */
  aimed(me, p) {
    const dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz);
    if (d > GROUND.range) return false;
    return d < 2 || Math.acos(Math.max(-1, Math.min(1, (-Math.sin(me.yaw) * dx - Math.cos(me.yaw) * dz) / d))) < PICNIC.aim;
  }
  hurt(me, t, now, gun, d) {
    const dmg = damage(gun, d), hat = this.hatOf(t, now), dent = Math.min(hat, dmg); // the hat first, then the miner
    if (!dmg) return;
    t.hat = hat - dent; t.hitAt = now; t.hp -= dmg - dent;
    if (t.hp > 0) return;
    const own = t === me; // dynamite does not care who lit it
    t.hp = 0; t.gun = null; t.deadUntil = now + PICNIC.respawnMs; t.deaths++; t.by = own ? null : { name: this.nameOf(me), gun };
    if (!own) me.kills++;
    this.feed = [...this.feed, { n: ++this.seq, at: now, killer: this.nameOf(me), victim: this.nameOf(t), intern: t.id === INTERN, gun, own }].slice(-6);
  }
  /** Walk over something and it is yours, unless you have no use for it (then it stays for someone who does). */
  take(me, kind, now) {
    if (kind === 'salad') { if (me.hp >= PICNIC.hp) return false; me.hp = PICNIC.hp; return true; }
    if (kind === 'hat') { if (this.hatOf(me, now) >= 2 * PICNIC.hat) return false; me.hat = 2 * PICNIC.hat; me.hitAt = now; return true; }
    if (me.gun?.kind === kind && me.gun.ammo >= GUNS[kind].ammo) return false;
    me.gun = { kind, ammo: GUNS[kind].ammo }; return true; // one extra gun at a time: the new one replaces whatever you were carrying
  }

  /**
   * The browser reports about eight times a second: where it stands, which way it faces, and the shots it fired
   * since last time (`shots: [{ x, y, z, hit, gun }]`: where each one ended, who was in the way and what fired it).
   * Returns your own state, everyone else, which pickups are gone and the last few kills. `snap` puts the page where
   * the server says you are (a new arrival, a respawn, or a position nobody could have walked to); `got` names
   * something you just picked up, once.
   */
  tick(player, body = {}) {
    const now = this.now();
    for (const [id, p] of this.here) if (now - p.at > PICNIC.staleMs) this.here.delete(id);
    let me = this.here.get(player.id), snap = body.fresh === true;
    if (!me) {
      if (this.here.size >= PICNIC.max) throw new GameError('The picnic is full. Try another door.', 409);
      me = { id: player.id, ...this.spawn(), ...FRESH, yaw: 0, air: 0, at: now, deadUntil: 0, safeUntil: now + PICNIC.safeMs, kills: 0, deaths: 0, nextShot: 0, shot: { n: 0 }, by: null, got: null };
      this.here.set(player.id, me); snap = true;
    }
    if (me.hp <= 0 && now >= me.deadUntil) { Object.assign(me, this.spawn(), FRESH, { safeUntil: now + PICNIC.safeMs }); snap = true; }
    const x = Number(body.x), z = Number(body.z), yaw = Number(body.yaw), air = Number(body.air);
    if (!snap && me.hp > 0 && Number.isFinite(x) && Number.isFinite(z)) {
      const far = Math.hypot(x - me.x, z - me.z) > GROUND.speed * 1.5 * Math.max(0.05, (now - me.at) / 1000) + 1.5;
      if (far || Math.hypot(x, z) > GROUND.radius + 0.5) snap = true; else { me.x = x; me.z = z; }
    }
    if (Number.isFinite(yaw)) me.yaw = yaw;
    me.air = Number.isFinite(air) ? Math.max(0, Math.min(3, air)) : 0;
    me.at = now;
    if (me.hp > 0) for (const p of PICKUPS) {
      if (now < (this.back.get(p.id) || 0) || Math.hypot(p.x - me.x, p.z - me.z) > PICKUP_REACH || !this.take(me, p.kind, now)) continue;
      this.back.set(p.id, now + PICNIC.backMs[p.kind]); me.got = p.kind;
    }
    const gary = this.gary(now);
    for (const s of Array.isArray(body.shots) ? body.shots.slice(0, 4) : []) {
      if (me.hp <= 0 || me.nextShot > now) break; // down, or faster than that gun fires
      const kind = s?.gun && s.gun === me.gun?.kind ? s.gun : 'rivet', gun = GUNS[kind], ms = gun.everyMs * 0.8;
      me.nextShot = Math.max(me.nextShot, now - ((gun.burst || 1) - 1) * ms) + ms; // a late report may carry a short burst of rivets, nothing else
      me.safeUntil = 0; // opening fire ends your own grace
      if (kind !== 'rivet' && --me.gun.ammo <= 0) me.gun = null;
      const end = { x: Number(s?.x), y: Number(s?.y), z: Number(s?.z) }, landed = Number.isFinite(end.x + end.y + end.z);
      if (landed) me.shot = { n: me.shot.n + 1, ...end, gun: kind };
      if (gun.blast) {
        if (landed && this.aimed(me, end)) for (const t of [...this.here.values(), gary]) { const d = Math.hypot(t.x - end.x, t.z - end.z); if (d < gun.blast && this.open(t, now)) this.hurt(me, t, now, kind, d); }
      } else {
        const t = s?.hit === INTERN ? gary : typeof s?.hit === 'string' ? this.here.get(s.hit) : null;
        if (t && t !== me && this.open(t, now) && this.aimed(me, t)) this.hurt(me, t, now, kind, Math.hypot(t.x - me.x, t.z - me.z));
      }
    }
    const others = [...this.here.values(), gary].filter((p) => p !== me).map((p) => ({
      id: p.id, name: this.nameOf(p), avatar: p.id === INTERN ? null : this.avatars?.info(this.store.players[p.id]) || null,
      x: p.x, z: p.z, yaw: p.yaw, air: p.air, dead: p.hp <= 0, hats: Math.ceil(this.hatOf(p, now) / PICNIC.hat), safe: now < p.safeUntil, kills: p.kills, deaths: p.deaths, shot: p.shot,
    }));
    const got = me.got; me.got = null;
    return { you: { id: me.id, hp: me.hp, hat: this.hatOf(me, now), gun: me.gun, backIn: me.hp > 0 ? 0 : Math.max(0, me.deadUntil - now), by: me.by, kills: me.kills, deaths: me.deaths, safe: now < me.safeUntil },
      ...(snap ? { snap: { x: me.x, z: me.z } } : {}), ...(got ? { got } : {}), others,
      gone: PICKUPS.filter((p) => now < (this.back.get(p.id) || 0)).map((p) => p.id),
      feed: this.feed.filter((f) => now - f.at < PICNIC.feedMs).map(({ n, killer, victim, intern, gun, own }) => ({ n, killer, victim, intern, gun, own })) };
  }
  forget(playerId) { this.here.delete(playerId); }
}
