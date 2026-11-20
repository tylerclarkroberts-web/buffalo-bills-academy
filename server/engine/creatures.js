// The Barn: the roster. Since v33 the residents are real, little-known bugs (server/engine/bugs.js); the v30
// cryptid x historical-figure hybrids are retired. Their ids are kept only so old barn rows can be migrated.
import { BUGS, BUG_BY_ID } from './bugs.js';

export const ROSTER = BUGS;
export const BY_ID = BUG_BY_ID;
/** The retired v30 hybrid ids (for the one-time migration in server/barn.js). */
export const LEGACY_IDS = ['brauenfrost', 'skizzenmott', 'schwerkrall', 'glimmhuf', 'donnersohl', 'schlangkron', 'spulgreif', 'rechenhals', 'tintenbard', 'klecksbock', 'bartsumpf', 'sternglotz', 'schleierhops', 'notenschlurf', 'rabenmief', 'drachenbrill', 'wolkenknautsch', 'perlenuhu', 'schollenschlang', 'wogenteller', 'schnauzdampf', 'erbsenzottel', 'druckglubsch', 'wannenbrumm'];
export const ABILITY_LEVELS = [1, 1, 4, 7, 10]; // strike and technique from the start, so a fight always has a choice
export const MAX_LEVEL = 10; // full size, and the level the last move unlocks at
export const LEVEL_CAP = 30; // as far as any bug goes
/** Level from experience: 1 + floor(sqrt(xp / 40)), capped. Level 5 needs 640 xp (about a week of steady care). */
/** `cap`: the top level this bug can show: PAUSED_AT until it evolves, then its stage's ceiling (STAGE_CAPS). */
/** A bug that has not evolved holds here. XP past it still counts and is kept for when it does (server/barn.js, evolve). */
export const PAUSED_AT = 9;
/** The ceiling for each stage: 9 as hatched, 23 once evolved, 30 after the second evolution (not built yet). */
export const STAGE_CAPS = [PAUSED_AT, 23, LEVEL_CAP];
/** Level as XP alone would have it, with no hold and no cap. */
export const rawLevel = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40));
export const levelFor = (xp, cap = PAUSED_AT) => Math.min(Math.max(PAUSED_AT, Math.min(LEVEL_CAP, cap || 0)), 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40)));
export const xpFor = (level) => 40 * (level - 1) ** 2;
