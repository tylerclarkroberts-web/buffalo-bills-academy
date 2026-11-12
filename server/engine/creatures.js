// The Barn: the roster. Since v33 the residents are real, little-known bugs (server/engine/bugs.js); the v30
// cryptid x historical-figure hybrids are retired. Their ids are kept only so old barn rows can be migrated.
import { BUGS, BUG_BY_ID } from './bugs.js';

export const ROSTER = BUGS;
export const BY_ID = BUG_BY_ID;
/** The retired v30 hybrid ids (for the one-time migration in server/barn.js). */
export const LEGACY_IDS = ['brauenfrost', 'skizzenmott', 'schwerkrall', 'glimmhuf', 'donnersohl', 'schlangkron', 'spulgreif', 'rechenhals', 'tintenbard', 'klecksbock', 'bartsumpf', 'sternglotz', 'schleierhops', 'notenschlurf', 'rabenmief', 'drachenbrill', 'wolkenknautsch', 'perlenuhu', 'schollenschlang', 'wogenteller', 'schnauzdampf', 'erbsenzottel', 'druckglubsch', 'wannenbrumm'];
export const ABILITY_LEVELS = [3, 4, 6, 8, 10];
export const MAX_LEVEL = 10;
/** Level from experience: 1 + floor(sqrt(xp / 40)), capped. Level 5 needs 640 xp (about a week of steady care). */
export const levelFor = (xp) => Math.min(MAX_LEVEL, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40)));
export const xpFor = (level) => 40 * (level - 1) ** 2;
