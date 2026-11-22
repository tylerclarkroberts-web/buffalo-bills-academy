// Family Mode helpers: stable table labels and on-device sanitizing.
// Viewer-only — never written back to the server.

/** FNV-1a 32-bit, then four decimal digits. Same id/code always yields the same number. */
export function familyTableNumber(id) {
  const s = String(id || '').trim().toUpperCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 10000;
}

export function familyTableLabel(id) {
  return `Table #${String(familyTableNumber(id)).padStart(4, '0')}`;
}

export function displayTableName(tableOrCode, rawName, family) {
  const code = (tableOrCode && typeof tableOrCode === 'object')
    ? (tableOrCode.code || tableOrCode.id)
    : tableOrCode;
  const name = (tableOrCode && typeof tableOrCode === 'object' && rawName == null)
    ? tableOrCode.name
    : rawName;
  return family ? familyTableLabel(code) : (name || familyTableLabel(code));
}

// Whole-word list only (so "class" and "assistant" stay put). Covers common English
// profanity and crude slang that would embarrass a parent looking over a shoulder.
const PROFANITY = [
  'ass', 'asshole', 'asshat', 'dumbass', 'jackass',
  'bastard', 'bitch', 'bitches', 'bitchy',
  'blowjob', 'boob', 'boobs', 'boobies',
  'cock', 'cocks', 'crap', 'craps', 'cum', 'cunt',
  'damn', 'damned', 'dammit', 'goddamn', 'goddamned',
  'dick', 'dicks', 'dickhead',
  'fag', 'faggot', 'fags',
  'fart', 'farts', 'farted',
  'fuck', 'fucks', 'fucker', 'fuckers', 'fucking', 'fucked', 'fuckin', 'motherfucker', 'motherfuckers',
  'handjob', 'horny',
  'jizz',
  'nigger', 'nigga', 'niggas',
  'nude', 'nudes',
  'penis', 'piss', 'pissed', 'porn', 'porno', 'pussy',
  'retard', 'retarded',
  'sex', 'sexy', 'shit', 'shits', 'shitty', 'shitty', 'bullshit',
  'slut', 'sluts', 'slutty',
  'tits', 'tit', 'titties', 'toot', 'toots', 'tooting',
  'vagina',
  'wank', 'wanker',
  'whore', 'whores',
  'hell',
  'freaking', 'freakin',
  'wtf',
];

const PROFANITY_RE = new RegExp(`\\b(?:${PROFANITY.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');

function stars(word) {
  return '•'.repeat(Math.max(3, String(word).length));
}

/** Mask crude words in free text (chat, bubbles, copy). */
export function familyMask(text) {
  if (text == null) return text;
  const s = String(text);
  if (!s) return s;
  return s.replace(PROFANITY_RE, (m) => stars(m));
}

/** Player handles: mask in place, or a neutral fallback if the name is nothing but profanity. */
export function familyInitials(name) {
  const s = String(name || 'P').trim();
  const parts = s.split(/\s+/).filter(Boolean);
  const raw = (parts.length >= 2 ? `${parts[0][0] || ''}${parts[1][0] || ''}` : s.slice(0, 2)).toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, '') || 'P';
}

export function familyHandle(name, { fallback = 'Player' } = {}) {
  if (name == null || name === '') return name;
  const masked = familyMask(String(name).trim());
  const leftover = masked.replace(/[•\s._-]+/g, '');
  return leftover ? masked : fallback;
}

export const FAMILY_TITLES = {
  king: 'King',
  queen: 'Queen',
  commoner: 'Commoner',
  babyScum: 'Page',
  scum: 'Low Seat',
};

export const FAMILY_GAME = {
  scum: 'Palace',
  scumLong: 'Palace',
  foff: "Foff's Outing",
  slotsBlurb: 'Arcade Weenies. Bets $1–$100.',
  elhaloBlurb: 'Donde esta la buffadora',
  guntradYeah: 'heck yeah',
};

/** Tame royal-command wording in Family Mode. Unknown commands keep their original copy. */
export const FAMILY_ROYAL = {
  toot: {
    label: 'Let someone blow a party horn',
    short: 'Party horn',
    who: 'Who blows the horn?',
    caption: ({ who, scum }) => `${who} blows a party horn for ${scum}.`,
    log: ({ king, scum, who }) => `${king} asks ${scum} to hear a party horn from ${who}.`,
  },
  dunce: {
    label: 'Wear the silly hat',
    short: 'Silly hat',
    caption: ({ scum }) => `${scum} wears a silly hat.`,
    log: ({ king, scum }) => `${king} asks ${scum} to wear a silly hat.`,
  },
};

export function familyRoyalLabel(cmd, original) {
  return FAMILY_ROYAL[cmd]?.label || original;
}

export function familyRoyalCaption(ev, names = {}, original) {
  const spec = FAMILY_ROYAL[ev?.cmd];
  if (!spec?.caption) return original;
  return spec.caption({
    scum: names.scum || ev.scumName || 'the Low Seat',
    king: names.king || ev.kingName || 'the King',
    who: names.target || names.who || ev.targetName || 'someone',
  });
}

export function familyNotifyTitle(code) {
  return `Your turn at ${familyTableLabel(code)}`;
}

export function familyShareText(code, url) {
  return `Pull up a chair at ${familyTableLabel(code)}: ${url}`;
}
