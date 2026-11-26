// The old-timers in the Acid Mines (engine/npc-miners.js): talk, hit, knock down, and pocket their smokes.
// Everything that counts is decided here: which miners are on a shift, the hit count, how long one stays down, whether
// his pack has anything in it, and how many smokes you hold. Cigarettes are a keepsake count in npcs.json. No money,
// no ledger lines, nothing from the Smoke Shop: a PvP raid can't take them and the store never sees them.
import crypto from 'node:crypto';
import { GameError } from './engine/game.js';
import { MAX_SHIFT_MS } from './mines.js';
import { NPC_BY_ID, HITS_TO_DROP, DOWN_MS, HIT_GAP_MS, HIT_FORGET_MS, SMOKE_COOLDOWN_MS, SMOKES_DROPPED,
  placeNpcs, tipFor, hitLine, DOWN_LINES, OUT_COLD, EMPTY_PACK, HIT_REACH } from './engine/npc-miners.js';

const MAX_SMOKES = 9999; // a keepsake count, not a currency: it just stops growing

export class NpcMiners {
  constructor({ store, mines, now = () => Date.now(), randInt = (n) => crypto.randomInt(n) }) {
    this.store = store; this.mines = mines; this.now = now; this.randInt = randInt;
    this.doc = store.loadDoc('npcs', { by: {} }); this.doc.by ||= {};
    this.pose = null; // (playerId, shiftId) -> { x, y } in tiles from the PvP heartbeat, or null (wired in app.js)
    this.placed = new Map(); // day/shaft/seed -> placements (the maze is the day's: same answer all day)
  }
  save() { this.store.saveDoc('npcs', this.doc); }
  row(playerId) { return (this.doc.by[playerId] ||= { smokes: 0, npc: {} }); }
  smokes(playerId) { return this.doc.by[playerId]?.smokes || 0; }
  /** Who sits where on this shift (same for every miner in the shaft that day). */
  onShift(shift) {
    if (!shift || shift.rulesVersion !== 2) return [];
    const key = `${shift.day || ''}/${shift.shaft || '7'}/${shift.seed}/${shift.cells}/${shift.tier || 0}`;
    if (!this.placed.has(key)) { if (this.placed.size > 16) this.placed.clear(); this.placed.set(key, placeNpcs(shift)); }
    return this.placed.get(key);
  }
  /** The browser's copy: each miner's spot and look, and how they are right now for this player. */
  view(shift, playerId) {
    const now = this.now(), row = this.doc.by[playerId];
    return this.onShift(shift).map((p) => {
      const npc = NPC_BY_ID[p.id], st = row?.npc?.[p.id] || {};
      const down = st.downUntil > now ? st.downUntil - now : 0;
      return { id: p.id, x: p.x, y: p.y, facing: p.facing, ...(p.ox !== undefined ? { ox: p.ox, oy: p.oy } : {}), name: npc.name, title: npc.title, look: npc.look, smoker: !!npc.smoker,
        hits: down || !(now - (st.lastHitAt || 0) < HIT_FORGET_MS) ? 0 : st.hits || 0, downMs: down,
        smokes: down && st.drop?.until === st.downUntil ? st.drop.count : 0 };
    });
  }
  /** The live shift and the miner on it, or a refusal. */
  find(player, shiftId, npcId) {
    const shift = this.mines.doc.active?.[player.id];
    if (!shift || shift.id !== String(shiftId || '') || shift.rulesVersion !== 2 || shift.settlement) throw new GameError('You are not on that shift.', 409);
    if (this.now() - shift.startedAt >= MAX_SHIFT_MS) throw new GameError('Your shift is over.', 410);
    const spot = this.onShift(shift).find((p) => p.id === String(npcId || ''));
    if (!spot) throw new GameError('Nobody by that name down here.', 404);
    return { shift, spot, npc: NPC_BY_ID[spot.id] };
  }
  /** Swings and pickups only count right next to them, by the server's copy of where you are (when it has one). */
  inReach(player, shift, spot) {
    if (!this.pose) return;
    const at = this.pose(player.id, shift.id);
    if (!at || Math.hypot(at.x - spot.x, at.y - spot.y) > HIT_REACH) throw new GameError('You are not close enough.', 409);
  }
  state(playerId, npcId) { const row = this.row(playerId); return (row.npc[npcId] ||= {}); }
  result(player, shift, npcId, extra) {
    const me = this.view(shift, player.id).find((n) => n.id === npcId);
    return { npc: me, totalSmokes: this.smokes(player.id), ...extra };
  }

  talk(player, shiftId, npcId) {
    const { shift, npc } = this.find(player, shiftId, npcId), now = this.now(), st = this.state(player.id, npc.id);
    if (st.downUntil > now) return this.result(player, shift, npc.id, { line: OUT_COLD[this.randInt(OUT_COLD.length)], tip: null });
    const n = st.talks || 0, hello = !n ? npc.hello[this.randInt(npc.hello.length)] : null;
    st.talks = n + 1; this.save();
    return this.result(player, shift, npc.id, { line: hello, tip: tipFor(npc, player.id, n) });
  }

  hit(player, shiftId, npcId) {
    const { shift, spot, npc } = this.find(player, shiftId, npcId), now = this.now(), st = this.state(player.id, npc.id);
    this.inReach(player, shift, spot);
    if (st.downUntil > now) return this.result(player, shift, npc.id, { line: OUT_COLD[this.randInt(OUT_COLD.length)], down: true, ignored: true });
    if (now - (st.lastHitAt || 0) < HIT_GAP_MS) return this.result(player, shift, npc.id, { ignored: true }); // a pickaxe only comes round so fast
    const hits = now - (st.lastHitAt || 0) < HIT_FORGET_MS ? (st.hits || 0) + 1 : 1;
    st.lastHitAt = now;
    if (hits < HITS_TO_DROP) { st.hits = hits; this.save(); return this.result(player, shift, npc.id, { line: hitLine(npc.id, hits), hit: hits }); }
    // Down he goes. The pack only has anything in it once an hour.
    st.hits = 0; st.downUntil = now + DOWN_MS; st.knockdowns = (st.knockdowns || 0) + 1;
    const full = now - (st.lastDropAt || 0) >= SMOKE_COOLDOWN_MS;
    if (full) {
      const count = SMOKES_DROPPED[0] + this.randInt(SMOKES_DROPPED[1] - SMOKES_DROPPED[0] + 1);
      st.drop = { count, until: st.downUntil }; st.lastDropAt = now;
    } else delete st.drop;
    this.save();
    return this.result(player, shift, npc.id, { line: hitLine(npc.id, HITS_TO_DROP), hit: HITS_TO_DROP, down: true, said: DOWN_LINES[npc.id], ...(full ? {} : { empty: EMPTY_PACK }) });
  }

  /** Pocket the smokes lying next to a miner who is still down. Once he gets up, he takes them back. */
  pickup(player, shiftId, npcId) {
    const { shift, spot, npc } = this.find(player, shiftId, npcId), now = this.now(), st = this.state(player.id, npc.id);
    this.inReach(player, shift, spot);
    const drop = st.drop;
    if (!drop || drop.until !== st.downUntil) throw new GameError('There is nothing on the floor.', 409);
    if (st.downUntil <= now) { delete st.drop; this.save(); throw new GameError('He got up and took his smokes back.', 409); }
    const row = this.row(player.id);
    row.smokes = Math.min(MAX_SMOKES, (row.smokes || 0) + drop.count);
    delete st.drop; this.save();
    return this.result(player, shift, npc.id, { took: drop.count });
  }

  forget(playerId) { if (this.doc.by[playerId]) { delete this.doc.by[playerId]; this.save(); } }
}
