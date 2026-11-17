// Horror Night: once a week the Acid Mines go wrong for everybody at once. The server decides (here, from the
// clock) and stamps the shift at clock-in, so every miner on shift in the window gets the same night. Pure: no
// I/O, so node --test can drive it. What it looks and sounds like lives in client/src/mines/horror.js.

/** When it happens. Change these and nothing else. weekday: 0 = Sunday ... 6 = Saturday; hours are local to timeZone, endHour 24 = midnight. */
export const HORROR_SCHEDULE = Object.freeze({ timeZone: 'America/Chicago', weekday: 5, startHour: 21, endHour: 24 });
/** Each horror shift starts normal; the lights cut out somewhere in this range (ms after clock-in). */
export const LIGHTS_OUT_MS = Object.freeze([30000, 60000]);

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fmts = new Map();
function fmt(timeZone) {
  let f = fmts.get(timeZone);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }); fmts.set(timeZone, f); }
  return f;
}
/** Local weekday / hour / minute at ms in timeZone. */
export function localParts(ms, timeZone = HORROR_SCHEDULE.timeZone) {
  const p = Object.fromEntries(fmt(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { weekday: WEEKDAYS[p.weekday], hour: Number(p.hour) % 24, minute: Number(p.minute) };
}
/** Is ms inside the weekly window? */
export function inHorrorWindow(ms, s = HORROR_SCHEDULE) {
  const { weekday, hour } = localParts(ms, s.timeZone);
  return weekday === s.weekday && hour >= s.startHour && hour < s.endHour;
}
/**
 * { on, endsAt (when on), nextAt (start of the next window when off) }. Windows start and end on the hour, so a
 * 15-minute walk finds the edges exactly; the walk is bounded at eight days.
 */
export function horrorWindow(ms, s = HORROR_SCHEDULE) {
  const STEP = 15 * 60e3, on = inHorrorWindow(ms, s);
  let t = Math.floor(ms / STEP) * STEP;
  for (let i = 0; i < 8 * 96; i++) {
    t += STEP;
    if (inHorrorWindow(t, s) !== on) return on ? { on, endsAt: t } : { on, nextAt: t };
  }
  return { on };
}
/** Where in LIGHTS_OUT_MS this shift's lights go: from its id, so it costs no randomness and a resumed shift keeps it. */
export function lightsOutMs(shiftId) {
  let h = 2166136261;
  for (const ch of String(shiftId)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const [lo, hi] = LIGHTS_OUT_MS;
  return lo + (h % (hi - lo + 1));
}
