// Public chrome for games and rooms: tab titles, Open Graph, and share text.
// Custom table/room names stay in the game UI only — never in the URL, <title>,
// document.title, og/twitter title, or share text.

export const ACADEMY = "Buffalo Bill's Academy";

const HOLD_CODE = /^\/t\/([A-Za-z0-9]{4,8})\/?$/i;
const SCUM_CODE = /^\/scum\/([A-Za-z0-9]{4,8})\/?$/i;
const BJ_CODE = /^\/bj\/([A-Za-z0-9]{4,8})\/?$/i;
const HOUSE = /^\/rooms\/[\w-]+\/?$/;

/** Neutral label for a path, using only the game and its code/id. Null keeps the default site title. */
export function labelForPath(pathname) {
  const p = String(pathname || '/').split('?')[0];
  let m = p.match(HOLD_CODE);
  if (m) return `Hold'em table ${m[1].toUpperCase()}`;
  m = p.match(SCUM_CODE);
  if (m) return `SCUM table ${m[1].toUpperCase()}`;
  m = p.match(BJ_CODE);
  if (m) return `Blackjack table ${m[1].toUpperCase()}`;
  if (p === '/scum' || p === '/scum/') return 'SCUM';
  if (p === '/bj' || p === '/bj/') return 'Blackjack';
  if (p === '/room' || p === '/room/' || HOUSE.test(p)) return 'My House';
  return null;
}

export function publicTitle(label, { myTurn = false, waiting = 0, blink = false } = {}) {
  const base = `${label} · ${ACADEMY}`;
  if (!myTurn) return base;
  if (waiting) return blink ? `○ ${base}` : `● Your turn (${waiting}) · ${base}`;
  return blink ? `○ ${base}` : `● Your turn · ${base}`;
}

export function holdemShareText(code, url) {
  return `Pull up a chair at Hold'em table ${code}: ${url}`;
}

export function holdemNotifyTitle(code) {
  return `Your turn at Hold'em table ${code}`;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Rewrite <title>, og:title, and twitter:title on the spa shell. Leaves unknown routes alone. */
export function applyHtmlMeta(html, pathname) {
  const label = labelForPath(pathname);
  if (!label || typeof html !== 'string') return html;
  const title = publicTitle(label);
  const safe = escapeAttr(title);
  let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${safe}</title>`);
  out = out.replace(/(property="og:title"\s+content=")[^"]*"/i, `$1${safe}"`);
  out = out.replace(/(name="twitter:title"\s+content=")[^"]*"/i, `$1${safe}"`);
  return out;
}
