// What a stage three bug wears: it dresses for where it is from. A hat, something worn, and something for its free
// hand. `o` draws one-sided (it never mirrors); `c` is the canvas itself, for the few pieces worn on both sides.
// `S` is its frame (evolutionArt.js BUILD); `X` flips a column when the bug's arms are the other way round; `d` is
// which way is out from its free hand (1: right).
const REGIONS = {
  bavarian: ['mantispa', 'brachinus', 'pyrrhocoris', 'nemoptera'], thai: ['ceroplophana', 'sagra', 'heteropteryx', 'deroplatys'],
  brazilian: ['bocydium', 'phrictus', 'macrodontia', 'odontomachus', 'peruphasma'], mexican: ['umbonia', 'phanaeus', 'bertholdia', 'phloeodes'],
  canadian: ['graphocephala', 'melanophila', 'helicopsyche'], bayou: ['photuris', 'dasymutilla', 'solenopsis', 'phrixothrix'],
  chinese: ['pyrops', 'lethocerus', 'colobopsis'], appalachian: ['gromphadorhina', 'gryllotalpa', 'meganeura'],
  japanese: ['chrysochroa', 'pheropsophus', 'pachyrhynchus'], egyptian: ['onymacris', 'empusa', 'polyphylla', 'myrmeleon'],
  maasai: ['acanthaspis', 'platymeris', 'manticora', 'pseudocreobotra', 'sphaerocoris', 'brevisana', 'trachelophorus'],
  norse: ['dytiscus', 'notonecta', 'micronecta', 'gyrinus'], outback: ['lamprima', 'dryococelus', 'eupholus'],
  polynesian: ['arachnocampa', 'halobates', 'megachile', 'ampulex'],
};
const REGION_OF = Object.fromEntries(Object.entries(REGIONS).flatMap(([region, ids]) => ids.map((id) => [id, region])));

/** Points along a string hung between two columns, `depth` at its lowest. */
const sag = (x0, x1, y, depth, n) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [x0 + (x1 - x0) * t, y + depth * 4 * t * (1 - t)]; });
const beads = (o, pts, mats, r = 0.8) => pts.forEach(([x, y], i) => o.ell(x, y, r, r, mats[i % mats.length]));
/** A waistcoat: a panel down each side of the chest, clear of the breastplate. */
const vest = (c, S, m) => c.poly([[32.5 - S.ct, 21.6], [30 - S.cb, 21.6], [31 - S.cb, 32.4], [34 - S.ct, 27.6]], m);
const hips = (S, drop = 41) => [[33 - S.hip, 37], [30 + S.hip, 37], [32 + S.hip, drop], [31 - S.hip, drop]];

const OUTFITS = {
  bavarian: {
    hat(o, x, y, w) { // an alpine hat and its feather
      o.ell(x, y + 0.7, w + 2.4, 1.5, 'N');
      o.poly([[x - w * 0.82, y + 0.6], [x - w * 0.56, y - 4.4], [x + w * 0.56, y - 4.8], [x + w * 0.82, y + 0.6]], 'N');
      o.line(x - w * 0.76, y - 1.2, x + w * 0.76, y - 1.2, 'Q');
      o.line(x + w * 0.5, y - 1.4, x + w * 0.5 + 2.4, y - 8, 'P'); o.hair([[x + w * 0.5 + 1.2, y - 2.6], [x + w * 0.5 + 3.4, y - 6.4]], 'P');
    },
    under(c, o, S) { // braces
      c.line(30 - S.cb, 21.6, 32 - S.cb, 32, 'Q', 2); o.line(31.5 - S.cb, 27.5, 31.5 + S.cb, 27.5, 'Q', 2);
      o.ell(31.5, 28, 1.3, 1.3, 'P'); o.put(31, 28, 'Y'); // an edelweiss
    },
    prop(o, x) { // a stein, with a head on it
      o.poly([[x - 3.2, 46], [x + 3.2, 46], [x + 3.6, 54], [x - 3.6, 54]], 'F');
      for (const y of [47.6, 52]) o.line(x - 3.2, y, x + 3.2, y, 'Q');
      for (const k of [-2.2, 0, 2.2]) o.ell(x + k, 45.2, 1.7, 1.5, 'P');
    },
  },
  thai: {
    hat(o, x, y, w) { // a tiered gold crown
      o.poly([[x - w * 0.85, y + 0.8], [x + w * 0.85, y + 0.8], [x + w * 0.5, y - 2.6], [x - w * 0.5, y - 2.6]], 'J');
      o.poly([[x - w * 0.5, y - 2.6], [x + w * 0.5, y - 2.6], [x + 0.7, y - 8.6], [x - 0.7, y - 8.6]], 'Y');
      o.line(x - w * 0.5, y - 2.8, x + w * 0.5, y - 2.8, 'J'); o.ell(x, y - 0.6, 1.1, 1.1, 'R');
    },
    under(c, o, S, X) { // a sash across the chest
      o.line(X(35.5 - S.ct), 21.6, X(30 + S.cb), 31, 'R', 3); o.hair([[X(34.5 - S.ct), 22.8], [X(28.5 + S.cb), 32.6]], 'Y');
    },
    prop(o, x, d) { // a dha, point up
      const s = x + 2.4 * d;
      o.line(s, 46.6, s, 53, 'Q', 2); o.line(s - 1.6, 46, s + 2.6, 46, 'J');
      o.poly([[s - 0.8, 45.6], [s + 1.8, 45.6], [s + 2 + d * 0.6, 34], [s + 0.5 - d * 1.6, 23.5], [s - 0.6 - d * 0.4, 34]], 'Z');
    },
  },
  brazilian: {
    hat(o, x, y, w) { // carnival feathers
      [-1, -0.5, 0, 0.5, 1].forEach((k, i) => o.line(x + k * w * 0.6, y, x + k * (w + 3.5), y - 8 + Math.abs(k) * 3.5, ['N', 'Y', 'U', 'Y', 'N'][i], 2));
      o.line(x - w * 0.8, y + 0.4, x + w * 0.8, y + 0.4, 'J', 2); o.ell(x, y + 0.8, 1, 1, 'R');
    },
    under(c, o) { // its flag for a loincloth
      o.poly([[28.2, 37.4], [34.8, 37.4], [34, 42], [31.5, 44.4], [29, 42]], 'N'); o.poly([[31.5, 38.2], [33.6, 40.4], [31.5, 42.6], [29.4, 40.4]], 'Y'); o.ell(31.5, 40.4, 0.9, 0.9, 'U');
    },
    prop(o, x) { // a football
      o.ell(x, 55.4, 3.6, 3.6, 'P'); o.ell(x, 55.4, 1.1, 1.1, 'K');
      for (const [dx, dy] of [[-2.5, -1.4], [2.5, -1.4], [0, 2.9]]) o.ell(x + dx, 55.4 + dy, 0.8, 0.8, 'K');
    },
  },
  mexican: {
    hat(o, x, y, w) { // a sombrero
      o.ell(x, y + 1, w + 6.5, 2.1, 'F');
      o.poly([[x - w * 0.72, y + 0.6], [x - w * 0.42, y - 5.4], [x + w * 0.42, y - 5.4], [x + w * 0.72, y + 0.6]], 'F');
      o.line(x - w * 0.66, y - 0.9, x + w * 0.66, y - 0.9, 'R');
      if (o.f >= 3) for (let k = -1; k <= 1; k += 0.25) o.ell(x + k * (w + 5.2), y + 1.2 + (1 - k * k) * 0.9, 0.5, 0.5, 'R');
    },
    over(c, o, S, X) { // a serape, folded over one shoulder
      const x = X(60.5 - S.sx);
      o.line(x, 18, x, 32, 'R', 5);
      [20.5, 23.5, 26.5, 29.5, 32.5].forEach((y, i) => o.line(x - 2, y, x + 2, y, ['N', 'P', 'Y', 'P', 'N'][i]));
      for (const k of [-2, -0.6, 0.8, 2.2]) o.hair([[x + k, 35], [x + k, 36.8]], 'P');
    },
    prop(o, x) { // a maraca
      o.line(x, 44, x, 50, 'Q'); o.ell(x + 0.5, 41, 2.9, 3.5, 'R'); o.line(x - 2, 41, x + 2, 41, 'Y');
      for (const k of [-1.2, 1.2]) o.ell(x + 0.5 + k, 39.2, 0.5, 0.5, 'N');
    },
  },
  canadian: {
    hat(o, x, y, w) { // a toque
      o.ell(x, y - 1, w * 0.98, 3.8, 'R'); o.line(x - w, y + 0.2, x + w, y + 0.2, 'P', 2); o.ell(x, y - 5.4, 1.7, 1.7, 'P');
    },
    under(c, o, S) { // buffalo plaid
      vest(c, S, 'R');
      for (const x of [34.6 - S.ct, 37.6 - S.ct]) c.hair([[x, 21.8], [x + 1, 29.4]], 'K');
      for (const y of [24, 26.8]) c.hair([[33 - S.ct, y], [30.4 - S.cb, y]], 'K');
    },
    prop(o, x, d) { // a hockey stick
      const s = x + 2.6 * d;
      o.line(s, 13, s, 59, 'F'); o.line(s - 5.5 * d, 60, s, 60, 'F', 2); o.line(s - 4 * d, 60.6, s - 2 * d, 60.6, 'K'); o.line(s, 14, s, 16.5, 'K');
    },
  },
  bayou: {
    hat(o, x, y, w) { // a straw boater
      o.ell(x, y + 0.8, w + 3, 1.5, 'F');
      o.poly([[x - w * 0.75, y + 0.6], [x - w * 0.75, y - 3.4], [x + w * 0.75, y - 3.4], [x + w * 0.75, y + 0.6]], 'F');
      o.line(x - w * 0.75, y - 1.1, x + w * 0.75, y - 1.1, 'V');
    },
    over(c, o) { // parade beads
      beads(o, sag(24.6, 38.4, 22.4, 4.6, 9), ['V', 'N', 'Y']); beads(o, sag(26.6, 36.4, 22.2, 2.3, 7), ['Y', 'V', 'N'], 0.7);
    },
    prop(o, x, d) { // a lantern on a pole
      const s = x + 2.6 * d;
      o.line(s, 15, s, 59, 'Q'); o.line(s - 3 * d, 15, s, 15, 'Q');
      o.ell(s - 3 * d + 0.5, 19.4, 2.5, 3.1, 'J'); o.ell(s - 3 * d + 0.5, 19.4, 1.5, 2.1, 'Y');
    },
  },
  chinese: {
    hat(o, x, y, w) { // a conical straw hat
      o.poly([[x - w - 4.6, y + 1.8], [x, y - 5.2], [x + w + 4.6, y + 1.8]], 'F');
      for (const k of [-0.62, 0.62]) o.hair([[x, y - 4.8], [x + k * (w + 4), y + 1.4]], 'T');
      o.ell(x, y - 5.2, 0.9, 0.9, 'R');
    },
    under(c, o, S, X) { // a red sash, knotted
      o.line(30.5 - S.wr, 37.2, 32.5 + S.wr, 37.2, 'R', 2); o.ell(X(35), 38.2, 1.7, 1.7, 'R'); o.line(X(35), 39.4, X(36), 44, 'R', 2);
      o.hair([[30.5 - S.wr, 37], [32.5 + S.wr, 37]], 'Y');
    },
    prop(o, x) { // a paper lantern
      o.line(x, 54.4, x, 55.4, 'K'); o.ell(x + 0.5, 58, 3, 2.7, 'R');
      for (const y of [55.6, 60.2]) o.line(x - 1, y, x + 2, y, 'Y');
      for (const k of [-1.2, 1.2]) o.hair([[x + 0.5 + k, 56], [x + 0.5 + k * 1.5, 58], [x + 0.5 + k, 60]], 'T');
    },
  },
  appalachian: {
    hat(o, x, y, w) { // a miner's cap and lamp
      o.ell(x, y - 0.4, w * 0.98, 3, 'K'); o.line(x - w * 1.05, y + 0.8, x + w * 1.05, y + 0.8, 'K');
      o.ell(x, y - 1.8, 2, 2, 'J'); o.ell(x, y - 1.8, 1.2, 1.2, 'Y');
    },
    under(c, o, S) { // bib overalls
      o.poly(hips(S), 'U');
      o.poly([[32 - S.cb, 26.5], [31 + S.cb, 26.5], [31.5 + S.cb, 33], [31.5 - S.cb, 33]], 'U');
      c.line(33 - S.cb, 26.5, 30 - S.cb, 21.6, 'U', 2); c.ell(33 - S.cb, 27.3, 0.8, 0.8, 'J');
      o.hair([[29.5, 28.8], [33.5, 28.8], [33.5, 31.2], [29.5, 31.2], [29.5, 28.8]], 'T');
    },
    prop(o, x) { // a jug of something
      o.line(x - 1, 51, x + 1, 51, 'Q', 2); o.ell(x + 0.5, 55.6, 3.7, 3.9, 'Q');
      for (const k of [-1.9, 0, 1.9]) { o.hair([[x + k, 55], [x + k + 1.2, 56.4]], 'P'); o.hair([[x + k + 1.2, 55], [x + k, 56.4]], 'P'); }
    },
  },
  japanese: {
    hat(o, x, y, w) { // a kabuto and its crescent
      for (const k of [-1, 1]) o.poly([[x + k * (w + 3), y + 3.4], [x + k * (w + 0.6), y - 0.6], [x + k * (w - 0.6), y + 1.6]], 'K');
      o.ell(x, y - 0.2, w * 1.02, 3.4, 'K'); o.line(x - w - 1.5, y + 1, x + w + 1.5, y + 1, 'R');
      for (const k of [-1, 1]) o.line(x + k * 0.8, y - 2.4, x + k * w * 0.85, y - 7.4, 'J');
      o.ell(x, y - 2.6, 1, 1, 'J');
    },
    under(c, o) { // an armour skirt, laced
      for (const k of [-1, 0, 1]) {
        o.poly([[29.5 + k * 4.4, 37.4], [33.5 + k * 4.4, 37.4], [33.7 + k * 5, 43.8], [29.3 + k * 5, 43.8]], 'K');
        for (const y of [39.4, 41.6]) o.line(30 + k * 4.7, y, 33 + k * 4.7, y, 'R');
      }
    },
    prop(o, x, d) { // a katana
      const s = x + 2.4 * d;
      o.line(s, 47, s, 54, 'K', 2); o.line(s - 1.6, 46.4, s + 2.6, 46.4, 'J');
      o.poly([[s - 0.4, 46], [s + 1.4, 46], [s + 1.4 - d * 0.8, 22], [s + 0.5 - d * 2, 13.5]], 'Z');
    },
  },
  egyptian: {
    hat(o, x, y, w) { // a striped headcloth
      o.poly([[x - w - 1.6, y + 6.5], [x - w * 0.95, y - 1.2], [x, y - 3], [x + w * 0.95, y - 1.2], [x + w + 1.6, y + 6.5], [x + w * 0.55, y + 6.5], [x + w * 0.8, y + 0.8], [x - w * 0.8, y + 0.8], [x - w * 0.55, y + 6.5]], 'U');
      o.line(x - w * 0.8, y - 0.8, x + w * 0.8, y - 0.8, 'J');
      for (const v of [1.6, 3.4, 5.2]) for (const k of [-1, 1]) o.line(x + k * (w + 0.2) - 0.8, y + v, x + k * (w + 0.2) + 0.8, y + v, 'J');
      o.ell(x, y - 2.2, 0.9, 1.4, 'J');
    },
    under(c, o, S) { // a pleated kilt
      o.poly(hips(S, 43.6), 'P'); o.line(31.5, 37.6, 31.5, 44, 'J', 2);
      for (const k of [-0.7, -0.35, 0.35, 0.7]) o.hair([[31.5 + k * S.hip, 37.6], [31.5 + k * (S.hip + 1), 43.2]], 'T');
    },
    over(c, o) { // a broad collar
      o.ell(31.5, 22.6, 8.6, 3.4, 'J'); o.ell(31.5, 22.3, 7, 2.5, 'U'); o.ell(31.5, 22, 5.4, 1.7, 'J');
    },
    prop(o, x) { // an ankh
      o.line(x, 44.4, x, 53, 'J'); o.line(x - 2.4, 45, x + 3.4, 45, 'J'); o.ell(x + 0.5, 41.6, 2.3, 2.9, 'J'); o.ell(x + 0.5, 41.6, 1, 1.6, 'K');
    },
  },
  maasai: {
    hat(o, x, y, w) { // a beaded band and one plume
      o.line(x + w * 0.35, y, x + w * 0.35 + 1.4, y - 7, 'P', 2); o.hair([[x + w * 0.35 + 0.4, y - 0.6], [x + w * 0.35 + 1.6, y - 6]], 'K');
      o.line(x - w * 0.92, y + 0.4, x + w * 0.92, y + 0.4, 'R', 2);
      for (let k = -0.8, i = 0; k <= 0.81; k += 0.4, i++) o.ell(x + k * w, y + 1.3, 0.6, 0.6, i % 2 ? 'U' : 'P');
    },
    under(c, o, S, X) { // a shuka over one shoulder
      o.poly([[X(32.5 - S.ct), 21.4], [X(40.5 - S.ct), 21.4], [X(32 + S.cb), 33], [X(31 - S.cb), 33], [X(32.5 - S.ct), 27.6]], 'R');
      for (const k of [3, 6.5]) o.hair([[X(32.5 - S.ct + k), 21.6], [X(31 - S.cb + k + 2), 32.8]], 'K');
      for (const y of [25, 29]) o.hair([[X(32.5 - S.ct), y], [X(31.5 + S.cb - (33 - y) * 0.6), y]], 'K');
    },
    over(c, o) { // a beaded collar
      o.ell(31.5, 22.6, 7.6, 2.9, 'P'); o.ell(31.5, 22.3, 6.2, 2.2, 'R'); o.ell(31.5, 22, 4.8, 1.5, 'U');
    },
    prop(o, x, d) { // a spear, and a hide shield
      const s = x + 2.8 * d;
      o.line(s, 9, s, 59, 'Q'); o.poly([[s - 1.3, 9.5], [s + 0.5, 3], [s + 2.3, 9.5], [s + 0.5, 11.5]], 'Z');
      o.ell(x - d * 0.6, 46, 4.3, 6.6, 'P'); o.ell(x - d * 1.6, 43.4, 1.4, 1.8, 'K'); o.ell(x + d * 0.8, 48.4, 1.2, 1.6, 'K');
      o.hair([[x - d * 0.6, 40], [x - d * 0.6, 52]], 'R');
    },
  },
  norse: {
    hat(o, x, y, w) { // a horned helm
      for (const k of [-1, 1]) o.poly([[x + k * (w - 0.6), y - 0.4], [x + k * (w + 3.4), y - 1.8], [x + k * (w + 4.6), y - 7.2], [x + k * (w + 2), y - 3.4], [x + k * (w - 1.2), y - 2.4]], 'P');
      o.ell(x, y - 0.2, w * 1.02, 3.3, 'M'); o.line(x - w, y + 0.8, x + w, y + 0.8, 'J'); o.line(x, y + 0.8, x, y + 3.2, 'M');
    },
    over(c, o) { // a fur collar
      [-2.4, -1.2, 0, 1.2, 2.4].forEach((k, i) => o.ell(31.5 + k * 3, 22.4 + Math.abs(k) * 0.4, 2.3, 2, i % 2 ? 'Q' : 'F'));
    },
    prop(o, x, d) { // a round shield
      const s = x - d * 0.8;
      o.ell(s, 45.5, 6.2, 6.2, 'Q'); o.ell(s, 45.5, 5.2, 5.2, 'U'); o.line(s - 5, 45.5, s + 5, 45.5, 'P'); o.line(s, 40.5, s, 50.5, 'P'); o.ell(s + 0.5, 46, 1.8, 1.8, 'J');
    },
  },
  outback: {
    hat(o, x, y, w) { // a slouch hat, with corks
      o.ell(x, y + 1, w + 4, 1.6, 'Q');
      o.poly([[x - w * 0.72, y + 0.6], [x - w * 0.56, y - 4], [x + w * 0.56, y - 4], [x + w * 0.72, y + 0.6]], 'Q');
      o.line(x - w * 0.68, y - 0.8, x + w * 0.68, y - 0.8, 'F');
      for (const k of [-1, -0.72, 0.72, 1]) { const u = x + k * (w + 3.2); o.hair([[u, y + 2.2], [u, y + 4.4]], 'K'); o.ell(u, y + 5, 0.75, 0.75, 'F'); }
    },
    under(c, o, S) { // a drover's waistcoat
      vest(c, S, 'F'); c.hair([[30.4 - S.cb, 21.8], [31.2 - S.cb, 32]], 'Q'); c.ell(31.6 - S.cb, 29.4, 0.6, 0.6, 'Q');
    },
    prop(o, x) { // a boomerang
      o.line(x - 3.4, 44, x + 1.2, 47.4, 'Q', 2); o.line(x + 1.2, 47.4, x - 2.6, 53.6, 'Q', 2); o.put(x - 3, 44, 'P'); o.put(x - 2, 53, 'P');
    },
  },
  polynesian: {
    hat(o, x, y, w) { // a crown of leaves and flowers
      o.line(x - w * 0.95, y + 0.4, x + w * 0.95, y + 0.4, 'N', 2);
      for (const k of [-0.7, 0, 0.7]) { o.ell(x + k * w, y + 0.2, 1.6, 1.6, k ? 'R' : 'P'); o.ell(x + k * w, y + 0.2, 0.6, 0.6, 'Y'); }
    },
    under(c, o, S) { // a grass skirt
      for (let x = 30 - S.hip, i = 0; x <= 33 + S.hip; x += 1.3, i++) o.line(x, 37.4, x + (x - 31.5) * 0.1, 44 + (i % 2) * 1.4, i % 2 ? 'F' : 'N');
      o.line(30 - S.hip, 36.8, 33 + S.hip, 36.8, 'F');
    },
    over(c, o) { // a lei
      beads(o, sag(24.5, 38.5, 22.4, 5, 9), ['R', 'P', 'Y'], 1.15);
    },
    prop(o, x, d) { // a paddle
      const s = x + 2.6 * d;
      o.line(s, 17, s, 59, 'Q'); o.ell(s + 0.5, 11.6, 2.6, 5.6, 'Q'); o.hair([[s + 0.5, 7], [s + 0.5, 16]], 'F');
    },
  },
};
export const outfitOf = (id) => OUTFITS[REGION_OF[id]] || {};
