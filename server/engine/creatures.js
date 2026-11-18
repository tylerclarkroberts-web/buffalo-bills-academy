// The Barn: the roster. Since v33 the residents are real, little-known bugs (server/engine/bugs.js); the v30
// cryptid x historical-figure hybrids are retired. Their ids are kept only so old barn rows can be migrated.
import { BUGS, BUG_BY_ID } from './bugs.js';

export const ROSTER = BUGS;
export const BY_ID = BUG_BY_ID;
/** The retired v30 hybrid ids (for the one-time migration in server/barn.js). */
export const LEGACY_IDS = ['brauenfrost', 'skizzenmott', 'schwerkrall', 'glimmhuf', 'donnersohl', 'schlangkron', 'spulgreif', 'rechenhals', 'tintenbard', 'klecksbock', 'bartsumpf', 'sternglotz', 'schleierhops', 'notenschlurf', 'rabenmief', 'drachenbrill', 'wolkenknautsch', 'perlenuhu', 'schollenschlang', 'wogenteller', 'schnauzdampf', 'erbsenzottel', 'druckglubsch', 'wannenbrumm'];
export const ABILITY_LEVELS = [1, 1, 4, 7, 10]; // strike and technique from the start, so a fight always has a choice
export const MAX_LEVEL = 10; // where every bug tops out until its owner wins circuit ribbons
export const LEVEL_CAP = 20; // the most ribbons can raise that to
/** Level from experience: 1 + floor(sqrt(xp / 40)), capped. Level 5 needs 640 xp (about a week of steady care). */
/** `cap`: the top level this bug's owner has earned (MAX_LEVEL with no ribbons). */
export const levelFor = (xp, cap = MAX_LEVEL) => Math.min(Math.max(MAX_LEVEL, Math.min(LEVEL_CAP, cap || 0)), 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40)));
export const xpFor = (level) => 40 * (level - 1) ** 2;
