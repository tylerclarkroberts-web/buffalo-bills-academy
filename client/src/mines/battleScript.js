// v75: what the Game Boy battle screen says before and after the fight. Pure (no React, no DOM) so node --test
// can check the lines: who sent out what, the faint, the WIN/LOSS, the XP (with the win bonus) and the spoils.
export const up = (s) => String(s || '').toUpperCase();

/** Intro timings (ms). The server's first turn clock covers them (PVP.introMs). */
export const INTRO = { flash: 900, versus: 2300, line: 1050 };

/** The "wants to battle!" text box, one line at a time, after the versus screen. */
export function introLines(b) {
  const foe = up(b.foe.ownerName) || 'A MINER', lines = [];
  lines.push(`RIVAL ${foe}\nWANTS TO BATTLE!`);
  lines.push(`${foe} SENT OUT\n${up(b.foe.name)}!`);
  if (b.benched) lines.push(`${up(b.benched)} IS STILL FAINTED!\nTHE FOREMAN LENDS YOU GERALD.`);
  lines.push(`GO! ${up(b.you.name)}!`);
  return lines;
}

/** Which side (you/foe) lost, or null for no contest. */
export function loserOf(b) {
  if (!b.over || b.over.reason === 'abandoned') return null;
  return b.over.won ? 'foe' : 'you';
}

/**
 * Events to play once the last turn has shown: the loser's bar runs out (forfeits and disconnects too), the faint,
 * the WIN/LOSS banner, then XP and what moved. `fainted` says which sprites have already dropped.
 */
export function outroEvents(b, fainted = {}) {
  const out = [], lose = loserOf(b);
  if (!lose) return [{ t: 'text', s: 'NOBODY WAS LEFT TO WIN.' }, { t: 'banner' }];
  const loser = lose === 'you' ? b.you : b.foe;
  const why = b.over.reason === 'forfeit' ? (b.over.won ? `${up(b.foe.ownerName)} RAN FOR THE ELEVATOR!` : 'YOU THREW IN THE TOWEL!')
    : b.over.reason === 'disconnect' ? (b.over.won ? `${up(b.foe.ownerName)} WENT QUIET. THAT COUNTS!` : 'YOU WENT QUIET TOO LONG!') : null;
  if (why) out.push({ t: 'text', s: why });
  if (!fainted[lose]) { out.push({ t: 'hp', who: lose, hp: 0 }); out.push({ t: 'text', s: `${up(loser.name)} FAINTED!`, faint: lose }); }
  out.push({ t: 'banner' });
  const bug = b.over.bug, you = up(b.you.name);
  if (b.over.won) {
    if (bug?.xp) {
      out.push({ t: 'xp', s: `${you} GAINED ${bug.xp} XP!${bug.bonus ? `\n(+${bug.bonus} WIN BONUS)` : ''}` });
      if (bug.levelAfter > bug.levelBefore) out.push({ t: 'text', s: `${you} GREW TO\nLEVEL ${bug.levelAfter}!` });
    } else if (b.you.loaner) out.push({ t: 'text', s: 'GERALD GOES BACK IN THE\nFOREMAN\'S LUNCHBOX. NO XP.' });
  } else {
    out.push({ t: 'text', s: `YOU LOST TO ${up(b.foe.ownerName)}!` });
    if (bug?.fainted) {
      if (bug.xp) out.push({ t: 'xp', s: `${you} STILL GAINED ${bug.xp} XP.` });
      out.push({ t: 'text', s: `${you} IS FAINTED.\nTAKE IT TO THE BUG CENTER.` });
    } else if (b.you.loaner) out.push({ t: 'text', s: 'GERALD IS FINE. HE IS\nALWAYS FINE.' });
  }
  return out;
}

/** The spoils, one short line each, for the result card. */
export function spoilsLines(b) {
  const r = b.over?.raid; if (!r) return [];
  const sign = b.over.won ? '+' : '−';
  const rows = [`${sign}$${r.cash}${r.cashCapped ? ' (DAILY LOSS CAP)' : ''}`, `${sign}${Math.floor(b.over.won ? r.gained || r.acid : r.acid)} ACID`];
  if (r.tobacco?.length) rows.push(`${sign}${r.tobacco.map(up).join(', ')}${r.smoked?.length ? ` (SMOKED ${r.smoked.length} DUPLICATE${r.smoked.length > 1 ? 'S' : ''})` : ''}`);
  return rows;
}
