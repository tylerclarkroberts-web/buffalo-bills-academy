// Stage I high-res faceted low-poly miniature sprites, egg art, and live dual-channel palette tinting.

export const STAGE1_ARCHETYPES = [
  'beetle', 'mantis', 'crawler', 'flier', 'aquatic', 'hopper', 'weevil', 'shield', 'larva',
];

export const STAGE1_EGG_SRC = '/barn/stage1/stage1-egg.webp';
export const STAGE1_GRUB_SRC = '/barn/stage1/stage1-grub.webp';

// Keys whose rendered 512x512 WebPs exist in client/public/barn/stage1/.
export const STAGE1_ENABLED_KEYS = new Set([
  'stage1-beetle', 'stage1-mantis', 'stage1-crawler', 'stage1-flier',
  'stage1-aquatic', 'stage1-hopper', 'stage1-weevil', 'stage1-shield',
  'stage1-larva', 'stage1-grub', 'stage1-egg',
]);

export const ALL_STAGE1_ASSETS = [...STAGE1_ENABLED_KEYS].map((key) => `/barn/stage1/${key}.webp`);

export function hasStage1Egg(enabled = STAGE1_ENABLED_KEYS) {
  return enabled.has('stage1-egg');
}

const STAGE1_SPECIES_OVERRIDE = {
  ampulex: 'flier',
  megachile: 'flier',
  dytiscus: 'aquatic',
  gyrinus: 'aquatic',
};

const MANTIS_KINDS = new Set(['mantis', 'stick', 'tree-lobster']);
const FLIER_KINDS = new Set(['dragonfly', 'lacewing', 'moth', 'cicada', 'caddis']);
const AQUATIC_KINDS = new Set(['waterbug', 'skater']);
const HOPPER_KINDS = new Set(['treehopper', 'leafhopper', 'lanternfly', 'frogleg', 'cricket']);
const WEEVIL_KINDS = new Set(['weevil']);
const SHIELD_KINDS = new Set(['shield', 'ground']);
const LARVA_KINDS = new Set(['larva']);
const CRAWLER_KINDS = new Set(['ant', 'assassin', 'roach', 'antlion']);

const STAGE1_FALLBACK_KEY = {
  'stage1-weevil': 'stage1-beetle',
  'stage1-larva': 'stage1-grub',
};

/** Choose the Stage I organic miniature archetype matching a species' natural body plan, or null for photo cameos. */
export function stage1ArchetypeOf(bug) {
  if (!bug || bug.id === 'steeze' || bug.look?.kind === 'photo') return null;
  if (bug.id && STAGE1_SPECIES_OVERRIDE[bug.id]) return STAGE1_SPECIES_OVERRIDE[bug.id];
  const kind = bug.look?.kind;
  if (MANTIS_KINDS.has(kind)) return 'mantis';
  if (FLIER_KINDS.has(kind)) return 'flier';
  if (AQUATIC_KINDS.has(kind)) return 'aquatic';
  if (HOPPER_KINDS.has(kind)) return 'hopper';
  if (WEEVIL_KINDS.has(kind)) return 'weevil';
  if (SHIELD_KINDS.has(kind)) return 'shield';
  if (LARVA_KINDS.has(kind)) return 'larva';
  if (CRAWLER_KINDS.has(kind)) return 'crawler';
  return 'beetle';
}

/** Resolve the Stage I WebP metadata for a species (or young larva form), or null for cameos / disabled keys. */
export function stage1Meta(bug, young = undefined, enabled = STAGE1_ENABLED_KEYS) {
  const archetype = stage1ArchetypeOf(bug);
  if (!archetype) return null;
  const preferred = young ? 'stage1-grub' : `stage1-${archetype}`;
  const key = enabled.has(preferred)
    ? preferred
    : STAGE1_FALLBACK_KEY[preferred] && enabled.has(STAGE1_FALLBACK_KEY[preferred])
      ? STAGE1_FALLBACK_KEY[preferred]
      : preferred;
  return {
    key,
    src: enabled.has(key) ? `/barn/stage1/${key}.webp` : null,
    archetype,
    young: !!young,
  };
}

const DEFAULT_RGB_PAL = [
  [0x14, 0x14, 0x14],
  [0x3d, 0x44, 0x4d],
  [0x6e, 0x77, 0x85],
  [0xb8, 0xc0, 0xcc],
  [0xff, 0xe3, 0x6e],
];

function parseHexRGB(hex, fallback) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function mixRGB(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Dual-channel luminance + warm-amber-accent palette tinting for neutral faceted low-poly WebPs.
 * Maps neutral silver-pewter facets across [outline, dark, base, light] -> highlight and warm amber
 * markings to the species or bugskin accent ramp while leaving alpha and dark eye planes intact.
 */
export function tintImageData(data, pal) {
  const o = parseHexRGB(pal?.[0], DEFAULT_RGB_PAL[0]);
  const d = parseHexRGB(pal?.[1], DEFAULT_RGB_PAL[1]);
  const b = parseHexRGB(pal?.[2], DEFAULT_RGB_PAL[2]);
  const l = parseHexRGB(pal?.[3], DEFAULT_RGB_PAL[3]);
  const aCol = parseHexRGB(pal?.[4], DEFAULT_RGB_PAL[4]);
  const spec = mixRGB(l, [255, 255, 255], 0.55);
  const deep = mixRGB(o, [8, 8, 10], 0.55);
  const accDark = mixRGB(aCol, o, 0.45);
  const accLight = mixRGB(aCol, [255, 255, 255], 0.4);

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;

    const r = data[i], g = data[i + 1], bl = data[i + 2];
    const max = r > g ? (r > bl ? r : bl) : (g > bl ? g : bl);
    const min = r < g ? (r < bl ? r : bl) : (g < bl ? g : bl);
    const lum = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
    const chroma = (max - min) / 255;

    let body;
    if (lum <= 0.11) body = mixRGB(deep, o, lum / 0.11);
    else if (lum <= 0.24) body = mixRGB(o, d, (lum - 0.11) / 0.13);
    else if (lum <= 0.52) body = mixRGB(d, b, (lum - 0.24) / 0.28);
    else if (lum <= 0.80) body = mixRGB(b, l, (lum - 0.52) / 0.28);
    else body = mixRGB(l, spec, (lum - 0.80) / 0.20);

    let out = body;
    if (chroma > 0.12) {
      const w = Math.min(1, (chroma - 0.12) / 0.22);
      const accent = lum <= 0.45
        ? mixRGB(accDark, aCol, lum / 0.45)
        : mixRGB(aCol, accLight, (lum - 0.45) / 0.55);
      out = mixRGB(body, accent, w);
    }

    if (alpha < 235) {
      out = mixRGB(out, [255, 255, 255], 0.22 * (1 - alpha / 255));
    }

    data[i] = Math.max(0, Math.min(255, Math.round(out[0])));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(out[1])));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(out[2])));
  }
  return data;
}
