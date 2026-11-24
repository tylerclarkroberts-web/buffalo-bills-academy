/** App-wide Nurse Hikari recap banner: hide on the Bug Center itself and in Work Mode (which already hides chrome). */
export function showEvoNewsBanner(me, path, { work = false } = {}) {
  if (!me?.evoNews || work) return false;
  return String(path || '').replace(/\/$/, '') !== '/barn/center';
}
