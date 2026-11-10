// General Store catalog, part 2: gags (v36, formerly "pranks": used once at a table, cartoon only) and absurd
// things that do nothing. Gags never touch cards, chips, turns or timers, reveal nothing, and can be turned off
// (Settings, host switch). Each gag is ONE-TIME USE: you hold at most one of each, and firing it uses it up.
// `pix` names the original pixel-art icon the client draws (client/src/store/pixicons.js); `emoji` is a text fallback.
export const GAG_ITEMS = [
  { id: 'gag-squirt', name: 'Squirt Gun', price: 90, effect: 'splash', emoji: '🔫', desc: 'One harmless cartoon splash on another player\'s seat. They stay dry. Their dignity, less so.' },
  { id: 'gag-soaker', name: 'Super Soaker 3000', price: 600, effect: 'bigsplash', emoji: '💦', desc: 'Same harmless splash, much bigger cartoon. Still never touches the cards.' },
  { id: 'gag-confetti', name: 'Confetti Popper', price: 60, effect: 'confetti', emoji: '🎉', desc: 'Showers a seat in paper confetti. Celebrate their bad beat.' },
  { id: 'gag-spaghetti', name: 'Uncooked Spaghetti Noodle', price: 120, effect: 'noodle', emoji: '🍝', desc: 'One single dry spaghetti noodle, brandished with intent. Taps a seat — tik — and snaps in half. Not al dente. Not even close.' },
  { id: 'gag-pie', name: 'Cream Pie', price: 300, effect: 'pie', emoji: '🥧', desc: 'Cartoon pie, splat, gone in two seconds. No calories.' },
  { id: 'gag-tumbleweed', name: 'Tumbleweed', price: 25, effect: 'tumbleweed', emoji: '🌾', desc: 'Rolls a tumbleweed past someone who is taking too long.' },
  { id: 'gag-mariachi', name: 'Mariachi Trio', price: 4000, effect: 'mariachi', emoji: '🎺', desc: 'Three tiny musicians serenade a seat for a few seconds. A shower of notes, no song you could name. Never touches the cards.' },
].map((x) => ({ kind: 'gag', cat: 'gags', slot: null, once: true, pix: x.id.slice(4), ...x }));
/** v36 migration: old prank ids -> gag ids (the rubber chicken became the spaghetti noodle). */
export const GAG_RENAME = { 'prank-squirt': 'gag-squirt', 'prank-soaker': 'gag-soaker', 'prank-confetti': 'gag-confetti', 'prank-chicken': 'gag-spaghetti', 'prank-pie': 'gag-pie', 'prank-tumbleweed': 'gag-tumbleweed' };

export const ABSURD_ITEMS = [
  ['lamp', 'Oil Lamp', 60, '🪔', 'Lights nothing. Requires oil you do not have.'],
  ['wagon', 'Covered Wagon', 6000, '🛻', 'A whole covered wagon. It lives in a field somewhere. You will never see it.'],
  ['vaccine', 'Smallpox Vaccine', 900, '💉', 'Smallpox was declared eradicated in 1980. You are, however, extra prepared.'],
  ['anvil', 'Anvil', 450, '⚒️', 'Falls on no one. Very heavy in your inventory.'],
  ['deed', 'Deed to the Moon', 20000, '🌕', 'Legally meaningless. Spiritually enormous.'],
  ['spittoon', 'Brass Spittoon', 150, '🏺', 'Polished. Unused. Let\'s keep it that way.'],
  ['rock', 'A Rock', 25, '🪨', 'It is a rock. It is your rock.'],
  ['telegraph', 'Telegraph Key', 300, '📟', 'Taps out STOP STOP STOP to nobody.'],
  ['snakeoil', 'Snake Oil Tonic', 120, '🧴', 'Cures nothing. Says otherwise on the label.'],
  ['piano', 'Player Piano Roll', 750, '🎹', 'Plays a tune on a piano you do not own.'],
  ['horseshoe', 'Lucky Horseshoe', 2500, '🧲', 'Does not change your luck. The deck is shuffled by a machine that does not care.'],
  ['sheriffbadge', 'Expired Fishing Licence', 60, '🎣', 'Valid in 1887 only.'],
  ['bigrock', 'A Second, Bigger Rock', 4000, '🪨', 'Your first rock has a sibling now. It is bigger. It is still a rock.'],
  ['railroad', 'Railroad Share Certificate', 10000, '📜', 'One share of the Great Basin & Pacific. The railroad went bankrupt in 1893.'],
].map(([id, name, price, emoji, desc]) => ({ id: `odd-${id}`, name, price, emoji, pix: id, desc, kind: 'absurd', cat: 'oddities', slot: null }));
