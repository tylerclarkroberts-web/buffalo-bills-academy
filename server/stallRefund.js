// One-time $2,000 credit for anyone who paid the old $4,000 fifth-stall price (now $2,000).
// Keyed so it never repeats: a ledger type+note, plus migrations.json. Delivered with a Foreman note in-game.
import fs from 'node:fs';
import path from 'node:path';

export const STALL5_REFUND_ID = 'stall5-price-cut-v150';
export const STALL5_REFUND_AMT = 2000;
export const STALL5_REFUND_TYPE = 'barn-stall-refund';
export const STALL5_REFUND_NOTE = "Stall prices dropped. Here's $2,000 back. —The Foreman";
export const STALL5_OLD_COST = 4000;

function readLedger(dir) {
  const file = path.join(dir, 'ledger.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function paidFifthStall(player, ledger) {
  if (ledger.some((row) => row.p === player.id && row.type === 'barn-stall' && Number(row.amt) === -STALL5_OLD_COST)) return true;
  return (player.txns || []).some((row) => row.type === 'barn-stall' && Number(row.amount) === -STALL5_OLD_COST);
}

function alreadyCredited(player, ledger) {
  if (ledger.some((row) => row.p === player.id && row.type === STALL5_REFUND_TYPE)) return true;
  return (player.txns || []).some((row) => row.type === STALL5_REFUND_TYPE);
}

/** Credit each historical $4,000 fifth-stall buyer $2,000 once, and leave them a Foreman note. Safe to call on every boot. */
export function creditStall5Refunds({ store, accounts, foreman, now = () => Date.now() } = {}) {
  const ledger = readLedger(store.dir);
  const credited = [];
  for (const player of Object.values(store.players || {})) {
    if (!player?.id || alreadyCredited(player, ledger) || !paidFifthStall(player, ledger)) continue;
    accounts.change(player, STALL5_REFUND_AMT, STALL5_REFUND_TYPE, STALL5_REFUND_NOTE);
    foreman?.leaveNote?.(player.id, { key: STALL5_REFUND_ID, text: STALL5_REFUND_NOTE });
    credited.push({ id: player.id, name: player.name, amount: STALL5_REFUND_AMT });
  }
  const doc = store.loadDoc('migrations', { done: {} });
  const prev = doc.done[STALL5_REFUND_ID] || {};
  const ids = [...new Set([...(prev.ids || []), ...credited.map((row) => row.id)])];
  doc.done[STALL5_REFUND_ID] = { at: prev.at || now(), ids, amount: STALL5_REFUND_AMT };
  store.saveDoc('migrations', doc);
  return { key: STALL5_REFUND_ID, credited };
}
