// End-of-round superlatives for EL HALO. Funny, local names; only awarded when the
// underlying stat was actually tracked this match. Times are seconds.
export const BADGES = [
  { id: 'plomo', name: 'Puro Plomo', stat: 'kills', dir: 'max', min: 1 },
  { id: 'turista', name: 'Vino a Ver', stat: 'kills', dir: 'min', spread: true },
  { id: 'samaritan', name: 'Nadie se Queda', stat: 'revives', dir: 'max', min: 1 },
  { id: 'piso', name: 'Siempre en el Piso', stat: 'revived', dir: 'max', min: 1 },
  { id: 'iguana', name: 'Cae Como Iguana', stat: 'deaths', dir: 'max', min: 1 },
  { id: 'machete', name: 'A Machete Limpio', stat: 'melee', dir: 'max', min: 1 },
  { id: 'chile', name: 'Se Comió el Chile', stat: 'chiles', dir: 'max', min: 1 },
  { id: 'nopal', name: 'Aguantó Como Nopal', stat: 'alive', dir: 'max', min: 1 },
  { id: 'bufadora', name: 'Se Lo Llevó el Agua', stat: 'launches', dir: 'max', min: 1 },
  { id: 'esponja', name: 'Esponja de Plomo', stat: 'dmg', dir: 'max', min: 1 },
];

export const BLANK_STATS = { kills: 0, pvp: 0, deaths: 0, heads: 0, score: 0, revives: 0, revived: 0, melee: 0, chiles: 0, launches: 0, dmg: 0, alive: 0 };

function pickIds(rows, def) {
  if (!rows.length) return new Set();
  const vals = rows.map((r) => r[def.stat] || 0);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (def.dir === 'max') {
    if (hi < (def.min || 0)) return new Set();
    return new Set(rows.filter((r) => (r[def.stat] || 0) === hi).map((r) => r.id));
  }
  // fewest: only if someone actually did better, so "came to watch" means something
  if (def.spread && hi <= lo) return new Set();
  return new Set(rows.filter((r) => (r[def.stat] || 0) === lo).map((r) => r.id));
}

export function buildEndBoard(players) {
  const rows = [...players]
    .filter((p) => p && (p.joined || p.online || p.kills || p.deaths || p.revives || p.revived || p.score || p.melee || p.chiles || p.launches || p.dmg || p.alive))
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color ?? 0,
      score: p.score || 0,
      kills: p.kills || 0,
      pvp: p.pvp || 0,
      deaths: p.deaths || 0,
      heads: p.heads || 0,
      revives: p.revives || 0,
      revived: p.revived || 0,
      melee: p.melee || 0,
      chiles: p.chiles || 0,
      launches: p.launches || 0,
      dmg: Math.round(p.dmg || 0),
      alive: Math.round((p.alive || 0) * 10) / 10,
      badges: [],
    }))
    .sort((a, b) => b.kills - a.kills || b.revives - a.revives || b.score - a.score || String(a.name).localeCompare(String(b.name)))
    .slice(0, 8);

  for (const def of BADGES) {
    const ids = pickIds(rows, def);
    for (const r of rows) if (ids.has(r.id)) r.badges.push({ id: def.id, name: def.name });
  }
  const killMax = Math.max(0, ...rows.map((r) => r.kills));
  const revMax = Math.max(0, ...rows.map((r) => r.revives));
  for (const r of rows) {
    r.topKiller = killMax > 0 && r.kills === killMax;
    r.topReviver = revMax > 0 && r.revives === revMax;
  }
  return rows;
}
