// Pure helpers for the Your turns queue. The server already sorts oldest waiting first.

export const ADVANCE_MS = 1800;
export const CAUGHT_MS = 2000;

export function samePath(a, b) {
  const norm = (p) => {
    const s = String(p || '').split('?')[0].replace(/\/+$/, '') || '/';
    return s.replace(/\/([A-Za-z0-9]+)$/, (_, c) => `/${c.toUpperCase()}`);
  };
  return norm(a) === norm(b);
}

/** From the lobby or a page where you are not already up: first (oldest) table. */
export function entryTarget(turns, currentPath) {
  if (!turns?.length) return null;
  if (turns.some((t) => samePath(t.path, currentPath))) return null;
  return turns[0];
}

/** After you act: the next table you're up at, excluding the one you just left. */
export function nextTarget(turns, currentPath) {
  return (turns || []).find((t) => !samePath(t.path, currentPath)) || null;
}

export function restCount(turns, currentPath) {
  return (turns || []).filter((t) => !samePath(t.path, currentPath)).length;
}

/** Ready to offer auto-advance once the player just acted, has nothing left here, and cinematics are done. */
export function shouldOfferAdvance({ hadAction, hasAction, blocked, dismissed } = {}) {
  return !!hadAction && !hasAction && !blocked && !dismissed;
}
