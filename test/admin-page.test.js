// Back office page: v78 showed Tyler a blank screen because every element had an `ad-` class and his ad blocker's
// EasyList rules (`##.ad-root`, `##.ad-top`, `##.ad-main`...) hid them all. These tests keep it from coming back,
// and cover the sign-in / not-allowed / crash screens that replaced the old blank states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminGate, AD_LIKE_CLASS } from '../client/src/admin/gate.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const ADMIN_FILES = fs.readdirSync(path.join(root, 'client/src/admin')).filter((f) => /\.(jsx?|css)$/.test(f)).map((f) => `client/src/admin/${f}`);

/** Every class name the back office can put on an element: CSS selectors plus className strings in the JSX. */
function classTokens(src) {
  const out = new Set();
  const noStrings = src.replace(/url\([^)]*\)/g, '');
  for (const m of noStrings.matchAll(/(?:^|[\s,>+~(])\.(-?[A-Za-z_][\w-]*)/gm)) out.add(m[1]); // CSS (and .foo in selectors used from JS)
  for (const m of src.matchAll(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    for (const s of raw.match(/['"`]([^'"`]*)['"`]/g)?.map((x) => x.slice(1, -1)) ?? [raw]) for (const t of s.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^[A-Za-z_][\w-]*$/.test(t)) out.add(t);
  }
  return out;
}

test('no back office class name looks like an ad slot (ad blockers would hide the page)', () => {
  // A sample of EasyList's generic element-hiding rules that matched the v78 dashboard.
  for (const blocked of ['ad-root', 'ad-top', 'ad-main', 'ad-tabs', 'ad-panel', 'ad-grid', 'ad-btn', 'ad-wide', 'ads', 'ad_unit', 'sponsored', 'banner-top', 'top-ad']) {
    assert.match(blocked, AD_LIKE_CLASS, `${blocked} should count as ad-like`);
  }
  for (const fine of ['bo-root', 'bo-top', 'bo-head', 'load', 'pad', 'heading', 'shadow', 'badge', 'muted', 'num', 'kicker']) {
    assert.doesNotMatch(fine, AD_LIKE_CLASS, `${fine} is not ad-like`);
  }
  const bad = [];
  let seen = 0;
  for (const f of ADMIN_FILES) for (const t of classTokens(read(f))) { seen++; if (AD_LIKE_CLASS.test(t)) bad.push(`${f}: .${t}`); }
  assert.ok(seen > 40, `found the dashboard's class names (${seen})`);
  assert.deepEqual(bad, [], `rename these, ad blockers hide them:\n${bad.join('\n')}`);
});

test('the dashboard root and header use the bo- names the stylesheet defines', () => {
  const jsx = read('client/src/admin/AdminPage.jsx'), css = read('client/src/admin/admin.css');
  for (const c of ['bo-root', 'bo-top', 'bo-tabs', 'bo-main', 'bo-tab']) {
    assert.ok(jsx.includes(`"${c}`) || jsx.includes(`'${c}`) || jsx.includes(`\`${c}`), `${c} used in AdminPage`);
    assert.ok(css.includes(`.${c} `) || css.includes(`.${c},`) || css.includes(`.${c}{`), `${c} styled in admin.css`);
  }
});

test('/admin is wrapped in an error boundary, and its fallback screens do not depend on class names', () => {
  const app = read('client/src/App.jsx');
  assert.match(app, /path === '\/admin'\) return <AdminBoundary>\s*<Suspense/);
  const boundary = read('client/src/admin/AdminBoundary.jsx');
  assert.match(boundary, /getDerivedStateFromError/);
  assert.doesNotMatch(boundary, /className=/, 'crash / loading screens use inline styles so nothing can hide them');
  assert.match(boundary, /Reload/);
});

test('adminGate: loading, sign in, owner only, or the dashboard', () => {
  const owner = { id: 'o', name: 'Tyler', signedIn: true };
  assert.equal(adminGate({ sessionLoading: true, me: null, error: null }), 'loading');
  assert.equal(adminGate({ sessionLoading: false, me: null, error: null }), 'signin');
  assert.equal(adminGate({ sessionLoading: false, me: { id: 'g', signedIn: false }, error: null }), 'signin', 'old browser-token player must sign in');
  assert.equal(adminGate({ sessionLoading: false, me: null, error: { status: 401 } }), 'signin');
  assert.equal(adminGate({ sessionLoading: false, me: null, error: { status: 403 } }), 'signin');
  assert.equal(adminGate({ sessionLoading: false, me: { id: 's', name: 'Stranger', signedIn: true }, error: { status: 403 } }), 'denied');
  assert.equal(adminGate({ sessionLoading: false, me: owner, error: null }), 'ok');
  assert.equal(adminGate({ sessionLoading: false, me: owner, error: { status: 500 } }), 'ok', 'server errors show inside the dashboard, not a lock screen');
});
