// Which screen the back office shows before the dashboard itself. Plain JS so node's test runner can import it.
//   'loading'  session still loading
//   'signin'   nobody signed in (or only an old browser-token player): offer Google sign-in
//   'denied'   signed in, but not the owner (the API said 403)
//   'ok'       draw the dashboard
export function adminGate({ sessionLoading, me, error }) {
  if (error?.status === 401) return 'signin';
  if (error?.status === 403) return me?.signedIn ? 'denied' : 'signin';
  if (sessionLoading) return 'loading';
  if (!me || !me.signedIn) return 'signin';
  return 'ok';
}

// Ad blockers (uBlock Origin, AdBlock, AdGuard, Brave...) ship EasyList, which hides any element whose class
// is on a long generic list: `.ad-root`, `.ad-top`, `.ad-main`, `.ad-panel`, `.ad-grid`, `.ad-btn`... The first
// version of this dashboard used an `ad-` class prefix, so for anyone with a blocker the whole page was
// display:none (a blank screen). Class names here must never look like ad slots. test/admin-page.test.js checks it.
export const AD_LIKE_CLASS = /^(ad|ads|adv|advert\w*|adbox|adunit|adslot|adsense|sponsor\w*|banner\w*)([-_\d]|$)|[-_](ad|ads|advert|sponsor|banner)([-_\d]|$)/i;
