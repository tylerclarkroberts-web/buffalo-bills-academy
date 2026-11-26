// The Turkey Louse: a one-day Thanksgiving wild bug (2026-11-26, America/Phoenix).
// Same calendar check as the Desert Resort Night theme (event-theme.js). It only
// appears and can only be jarred that day; a caught specimen is kept like any other bug.
import { EVENT_DATE, EVENT_TZ, phoenixDate } from './event-theme.js';

export const TURKEY_LOUSE_ID = 'menacanthus';
export const TURKEY_LOUSE_LEVEL = 9;
export const TURKEY_LOUSE_DATE = EVENT_DATE;
export const TURKEY_LOUSE_TZ = EVENT_TZ;
// After a hard fight, a fair catch: about 55% a throw, three throws.
export const TURKEY_LOUSE_JAR_CHANCE = 0.55;
export const TURKEY_LOUSE_JAR_SIDES = 10000;

export const isTurkeyLouse = (id) => id === TURKEY_LOUSE_ID;

/** Whether a mine day's YYYY-MM-DD string is the Thanksgiving window. */
export const turkeyLouseOnDay = (day) => day === TURKEY_LOUSE_DATE;

/** Live server-side check: the calendar date in America/Phoenix is Thanksgiving 2026. */
export const turkeyLouseLive = (now = Date.now()) => phoenixDate(now) === TURKEY_LOUSE_DATE;

/** Shared instance id for generation `gen` (1-based) on a mine day. */
export const louseWildId = (day, gen) => `louse:${day}:${gen}`;

/** Next uncaught generation today: one plus how many of that day's instances have already been jarred. */
export function turkeyLouseGeneration(catches = {}, day) {
  const prefix = `louse:${day}:`;
  let n = 0;
  for (const id of Object.keys(catches || {})) {
    if (!id.startsWith(prefix)) continue;
    if (/^\d+$/.test(id.slice(prefix.length))) n++;
  }
  return n + 1;
}
