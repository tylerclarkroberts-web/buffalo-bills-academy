import { BY_ID, ABILITY_LEVELS, MAX_LEVEL } from './creatures.js';

export const MOVE_IDS = ['basic', 'technique', 'signature', 'tactic', 'capstone'];
export const STANCES = {
  balanced: { id: 'balanced', name: 'Balanced', description: 'Rotate ready specials in your chosen order. Normal damage and defence.', damage: 1, taken: 1 },
  aggressive: { id: 'aggressive', name: 'Aggressive', description: 'Prioritise piercing and venom. Deal and take 8% more direct attack damage.', damage: 1.08, taken: 1.08 },
  defensive: { id: 'defensive', name: 'Defensive', description: 'Prioritise healing and guarding. Deal and take 8% less direct attack damage.', damage: 0.92, taken: 0.92 },
};

// The first three names stay with their species; effects and new moves share a small combat vocabulary.
const KITS = {
  ceroplophana: ['guard', 'pierce', 'Horn Feint', 'weaken', 'Sumatran Second Wind', 'heal'],
  bocydium: ['heal', 'weaken', 'Orbital Shell', 'guard', 'Globe Drill', 'pierce'],
  phrictus: ['guard', 'weaken', 'Dragon Sap', 'heal', 'Five-Point Lance', 'pierce'],
  pyrops: ['pierce', 'weaken', 'Longan Sip', 'heal', 'Lantern Shield', 'guard'],
  graphocephala: ['weaken', 'venom', 'Striped Shelter', 'guard', 'Meadow Renewal', 'heal'],
  umbonia: ['pierce', 'guard', 'Thorn Warning', 'weaken', 'Sapling Revival', 'heal'],
  trachelophorus: ['guard', 'pierce', 'Neck Sway', 'weaken', 'Rolled-Leaf Rest', 'heal'],
  eupholus: ['pierce', 'guard', 'Blue Scale Dazzle', 'weaken', 'Weevil Recovery', 'heal'],
  pachyrhynchus: ['guard', 'pierce', 'Prism Dazzle', 'weaken', 'Island Renewal', 'heal'],
  platymeris: ['venom', 'pierce', 'Two-Spot Threat', 'weaken', 'Assassin Carapace', 'guard'],
  acanthaspis: ['pierce', 'heal', 'Ant-Cloak Screen', 'guard', 'Assassin Secretion', 'venom'],
  helicopsyche: ['weaken', 'heal', 'Pebble Bastion', 'guard', 'Spiral Lance', 'pierce'],
  chrysochroa: ['weaken', 'pierce', 'Jewel Carapace', 'guard', 'Summer Renewal', 'heal'],
  lamprima: ['guard', 'heal', 'Stag Threat', 'weaken', 'Golden Mandible Drill', 'pierce'],
  onymacris: ['guard', 'heal', 'Dune Dazzle', 'weaken', 'Desert Piercer', 'pierce'],
  brachinus: ['venom', 'pierce', 'Warning Crackle', 'weaken', 'Pressure Shield', 'guard'],
  phrixothrix: ['heal', 'weaken', 'Railway Carapace', 'guard', 'Red-Light Lance', 'pierce'],
  macrodontia: ['pierce', 'weaken', 'Gallery Shelter', 'guard', 'Longhorn Recovery', 'heal'],
  sagra: ['weaken', 'pierce', 'Vine Shelter', 'guard', 'Leaf-Sap Renewal', 'heal'],
  manticora: ['weaken', 'pierce', 'Dune Carapace', 'guard', 'Nightfall Recovery', 'heal'],
  heteropteryx: ['weaken', 'guard', 'Jungle Sap', 'heal', 'Nymph Spike', 'pierce'],
  mantispa: ['heal', 'guard', 'Lacewing Feint', 'weaken', 'Lightning Pincer', 'pierce'],
  nemoptera: ['weaken', 'heal', 'Spoon-Wing Shield', 'guard', 'Lacewing Needle', 'pierce'],
  pseudocreobotra: ['weaken', 'pierce', 'Petal Shelter', 'guard', 'Flower Renewal', 'heal'],
  deroplatys: ['guard', 'weaken', 'Forest Renewal', 'heal', 'Dead-Leaf Ambush', 'pierce'],
  empusa: ['weaken', 'pierce', 'Conehead Guard', 'guard', 'Night-Sap Recovery', 'heal'],
  polyphylla: ['guard', 'pierce', 'Pine-Scent Feint', 'weaken', 'Forest Rest', 'heal'],
  phanaeus: ['heal', 'guard', 'Rainbow Dazzle', 'weaken', 'Scarab Horn Drill', 'pierce'],
  lethocerus: ['pierce', 'guard', 'Pond Recovery', 'heal', 'Water-Bug Venom', 'venom'],
  sphaerocoris: ['venom', 'guard', 'Painted Warning', 'weaken', 'Picasso Recovery', 'heal'],
};

const EFFECTS = {
  strike: { power: 18, accuracy: 0.9, cooldown: 0, description: 'A reliable direct attack.' },
  guard: { power: 12, accuracy: 0.9, cooldown: 3, guard: 0.5, description: 'Attack and halve the next incoming attack. Guard does not block venom.' },
  venom: { power: 10, accuracy: 0.9, cooldown: 3, venom: 5, duration: 2, description: 'On hit, poison for two turns. Venom bypasses armour and does not stack.' },
  pierce: { power: 20, accuracy: 0.88, cooldown: 3, description: 'Ignore armour and half of any guard. Stance protection still applies.' },
  heal: { power: 0, accuracy: 1, cooldown: 4, heal: 22, description: 'Recover HP instead of attacking. Used only at 65% HP or lower.' },
  weaken: { power: 14, accuracy: 0.9, cooldown: 3, weaken: 0.65, description: 'On hit, reduce the next enemy attack by 35%. Does not stack.' },
};

export function movesFor(species, level, legacyAbilities = 0) {
  const bug = BY_ID[species];
  if (!bug) throw new RangeError('Unknown bug species.');
  const [technique, signature, tacticName, tactic, capstoneName, capstone] = KITS[species];
  const names = [...bug.abilities, tacticName, capstoneName];
  const effects = ['strike', technique, signature, tactic, capstone];
  return MOVE_IDS.map((id, tier) => {
    const effect = effects[tier], base = EFFECTS[effect], extra = Math.max(0, tier - 1) * 2;
    return { id, name: names[tier], level: ABILITY_LEVELS[tier], unlocked: level >= ABILITY_LEVELS[tier] || tier < Math.min(3, legacyAbilities),
      tier, effect, ...base, power: base.power ? base.power + extra : 0, ...(base.heal ? { heal: base.heal + extra } : {}),
      ...(id === 'capstone' && effect === 'pierce' ? { criticalChance: 0.05, description: `${base.description} On a nonlethal hit, 5% chance to leave the opponent at 1 HP.` } : {}) };
  });
}

export function battleFor(species, level, legacyAbilities = 0, stored = null) {
  const available = movesFor(species, level, legacyAbilities).filter(move => move.unlocked && move.id !== 'basic').map(move => move.id);
  const selected = Array.isArray(stored?.specials) ? [...new Set(stored.specials)].filter(id => available.includes(id)).slice(0, 2) : available.slice(0, 2);
  return { stance: Object.hasOwn(STANCES, stored?.stance) ? stored.stance : 'balanced', specials: selected };
}

export function combatStats(level) {
  const growth = Math.max(0, Math.min(MAX_LEVEL, Number.isFinite(level) ? Math.floor(level) : 3) - 3);
  return { maxHp: 100 + growth * 3, damageMultiplier: (100 + growth * 2) / 100 };
}
