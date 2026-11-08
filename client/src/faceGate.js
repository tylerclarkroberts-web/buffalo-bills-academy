// Where the "Add your face" step sends people. Pure function so it can be unit-tested.
// v5 bug: the redirect used a stale copy of the session (React applied the route change before the
// "you now have an avatar" update), bouncing people back to the photo step after saving: a loop.
// Callers now pass the *current* session (from the session store), not a render-time copy.
export function safeNext(next) {
  const n = String(next || '/');
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/welcome') ? n : '/';
}
export function faceRedirect({ me, path, loc }) {
  if (!me) return null;
  const onWelcome = path.startsWith('/welcome');
  if (!me.hasAvatar) {
    if (onWelcome || path.startsWith('/mines') || path.startsWith('/profile/face')) return null;
    return `/welcome?next=${encodeURIComponent(loc)}`;
  }
  // Already has a face: the first-time step is done, never show it again (back button, reloads, old links).
  if (onWelcome) return safeNext(new URLSearchParams(loc.split('?')[1] || '').get('next'));
  return null;
}
