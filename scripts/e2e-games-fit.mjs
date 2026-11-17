// e2e / no-scroll check: on the lobby Games tab, every game card button is fully
// inside the viewport (and not under the header or footer) at iPhone sizes.
// Also writes screenshots for the PR. Fake data. Hides Guntrad and the faun.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || '/workspace/bba-home-elhalo-shots';
const DEMO = path.join(ROOT, 'docs/demo/games-tab-fit');
const PORT = Number(process.env.PORT || 3993);
const B = `http://127.0.0.1:${PORT}`;
const PW = process.env.PLAYWRIGHT_DIR || '/workspace/pw/package.json';
const { chromium } = createRequire(PW)('playwright-core');

const fails = [];
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) fails.push(msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await wait(step);
  }
};

const SIZES = {
  phone: { width: 390, height: 664, mobile: true, label: 'phone 390x664' },
  phoneTall: { width: 390, height: 844, mobile: true, label: 'phone 390x844' },
  small: { width: 375, height: 667, mobile: true, label: 'small phone 375x667' },
  landscape: { width: 844, height: 390, mobile: true, label: 'landscape 844x390' },
  desktop1280: { width: 1280, height: 800, mobile: false, label: 'desktop 1280x800' },
  desktop: { width: 1440, height: 900, mobile: false, label: 'desktop 1440x900' },
};

const HIDE = `
  .dealer-fig, .dl-plate, .dl-img, .dl-face, .dl-head, .dl-body, .dl-glow,
  img[src*="dealer"], img[alt*="Guntrad" i],
  .mq-bill, .neonbill,
  [data-test="fawn"], .fn { display: none !important; visibility: hidden !important; }
`;

const GO = ['bj-go', 'slots-go', 'foff-go', 'scum-go', 'elhalo-go'];

async function startServer(dataDir) {
  const srv = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
      DEV_LOGIN: '1',
      SLACK_BOT_TOKEN: '',
      STATIC_DIR: path.join(ROOT, 'dist'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  const ok = await until(async () => (await fetch(B + '/api/health').catch(() => null))?.ok);
  if (!ok) { srv.kill(); throw new Error('server failed to start'); }
  return srv;
}

async function login(name) {
  const email = `${name.toLowerCase().replace(/\W/g, '')}.${Date.now()}@example.com`;
  const r = await fetch(B + '/auth/dev', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  if (!r.ok) throw new Error(`login ${r.status} ${await r.text()}`);
  const set = r.headers.get('set-cookie') || '';
  const cookie = set.split(';')[0];
  const [cookieName, sid] = cookie.split('=');
  await fetch(B + '/api/me/avatar', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'gen', seed: email }),
  });
  const me = await fetch(B + '/api/me', { headers: { cookie } }).then((x) => x.json());
  return { name, cookie, cookieName, sid, id: me.id };
}

function writeWatched(dataDir, id) {
  const f = path.join(dataDir, 'foff.json');
  const doc = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  doc.watched = { ...(doc.watched || {}), [id]: { at: Date.now() } };
  fs.writeFileSync(f, JSON.stringify(doc));
}

async function openGames(browser, u, size) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: !!size.mobile,
    hasTouch: !!size.mobile,
    deviceScaleFactor: size.mobile ? 2 : 1,
    reducedMotion: 'reduce',
  });
  await ctx.addCookies([{ name: u.cookieName || 'bba_sid', value: u.sid, url: B }]);
  const p = await ctx.newPage();
  await p.addStyleTag({ content: HIDE }).catch(() => {});
  const url = size.mobile ? `${B}/?tab=games` : `${B}/`;
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: HIDE });
  if (size.mobile) await p.waitForSelector('[data-test=lobby-games]', { timeout: 15000 });
  else await p.waitForSelector('.lb-games-col [data-test=elhalo-card], .lb-games-col [data-test=scum-card]', { timeout: 15000 });
  await wait(400);
  return { ctx, p };
}

async function measure(p) {
  return p.evaluate((keys) => {
    const view = { w: window.innerWidth, h: window.innerHeight };
    const header = document.querySelector('header.topbar')?.getBoundingClientRect();
    const footer = document.querySelector('footer.legal')?.getBoundingClientRect();
    const top = header ? header.bottom : 0;
    const bottom = footer ? footer.top : view.h;
    const buttons = keys.map((k) => {
      const el = document.querySelector(`[data-test="${k}"]`);
      if (!el) return { key: k, missing: true };
      const r = el.getBoundingClientRect();
      const inView = r.top >= top - 1
        && r.left >= -1
        && r.right <= view.w + 1
        && r.bottom <= bottom + 1
        && r.width > 0 && r.height > 0;
      return {
        key: k, inView,
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        left: Math.round(r.left), right: Math.round(r.right),
        w: Math.round(r.width), h: Math.round(r.height),
      };
    });
    const promo = document.querySelector('[data-test=lobby-games], .lb-games-col');
    const scrollable = promo && (promo.scrollHeight > promo.clientHeight + 2);
    const skipped = [...document.querySelectorAll('.sp-desc')].map((el) => el.textContent.trim());
    const slotsNote = !!document.querySelector('[data-test=slots-card] .sp-note, .lb-slots .sp-note');
    const banner = getComputedStyle(document.querySelector('.host-banner') || document.body).display;
    const marquee = getComputedStyle(document.querySelector('.marquee5') || document.body).display;
    return {
      view, top, bottom: Math.round(bottom), buttons, scrollable, skipped, slotsNote,
      bannerOn: !!document.querySelector('.host-banner') && banner !== 'none',
      marqueeOn: !!document.querySelector('.marquee5') && marquee !== 'none',
    };
  }, GO);
}

async function snap(p, file) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(DEMO, { recursive: true });
  const dest = path.join(OUT, file);
  await p.screenshot({ path: dest, fullPage: false });
  const demo = path.join(DEMO, file.replace(/\.png$/, '.jpg'));
  // Keep a png in OUT (as requested) and a jpg copy in the repo for the PR body.
  fs.copyFileSync(dest, path.join(DEMO, file));
  console.log('wrote', dest, fs.statSync(dest).size);
  return dest;
}

// Optional jpg via sharp isn't required; GitHub renders png in the PR just fine.
// The previous PR used jpg only to keep the repo smaller. We'll convert if magick or ffmpeg is around.
async function toJpg(pngPath) {
  const jpg = pngPath.replace(/\.png$/, '.jpg');
  const { spawnSync } = await import('node:child_process');
  for (const cmd of [
    ['convert', [pngPath, '-quality', '82', jpg]],
    ['ffmpeg', ['-y', '-i', pngPath, '-q:v', '4', jpg]],
  ]) {
    const r = spawnSync(cmd[0], cmd[1], { stdio: 'ignore' });
    if (r.status === 0 && fs.existsSync(jpg)) {
      console.log('jpg', jpg, fs.statSync(jpg).size);
      return jpg;
    }
  }
  return null;
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-games-fit-'));
  let srv = await startServer(dataDir);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox'],
  });
  try {
    const u = await login('Patch');
    writeWatched(dataDir, u.id);
    // A waiting table would otherwise show the "needs players" strip on the Games tab.
    const created = await fetch(B + '/api/tables', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: u.cookie },
      body: JSON.stringify({
        name: 'Porch Hold\'em',
        visibility: 'private',
        settings: { maxPlayers: 6, buyIn: 200, smallBlind: 1, bigBlind: 2, turnSeconds: 86400, maxRebuys: -1 },
      }),
    });
    if (!created.ok) throw new Error(`create table ${created.status} ${await created.text()}`);
    srv.kill();
    await wait(400);
    srv = await startServer(dataDir);
    const me = await fetch(B + '/api/me', { headers: { cookie: u.cookie } }).then((x) => x.json());
    if (!me.foffWatched) throw new Error('foff unlock failed');

    for (const [name, size] of Object.entries(SIZES)) {
      const { ctx, p } = await openGames(browser, u, size);
      const info = await measure(p);
      console.log(size.label, JSON.stringify(info, null, 2));
      if (size.mobile) {
        check(!info.marqueeOn, `${size.label}: marquee hidden on Games tab`);
        check(!info.bannerOn, `${size.label}: host banner hidden on Games tab`);
      }
      for (const b of info.buttons) {
        check(!b.missing, `${size.label}: ${b.key} is in the DOM`);
        check(!!b.inView, `${size.label}: ${b.key} is fully in the viewport (not under header/footer) ${JSON.stringify(b)}`);
      }
      check(info.buttons.every((b) => b.inView && !b.missing), `${size.label}: all game card buttons are within the viewport`);
      check(!info.scrollable, `${size.label}: game cards do not require scrolling`);
      check(info.skipped.includes("You're skipped!"), `${size.label}: SCUM line is You're skipped!`);
      check(info.skipped.includes('Donde esta la freaking buffadora'), `${size.label}: El Halo blurb is Donde esta la freaking buffadora`);
      check(!info.slotsNote, `${size.label}: no Play money only note on the slots card`);
      await snap(p, `${name}-games.png`);
      await ctx.close();
    }
  } finally {
    await browser.close().catch(() => {});
    try { srv.kill(); } catch { /* already */ }
  }

  // Best-effort jpg copies in the demo folder for a smaller PR embed.
  for (const f of fs.readdirSync(DEMO).filter((x) => x.endsWith('.png'))) {
    const jpg = await toJpg(path.join(DEMO, f));
    if (jpg) fs.unlinkSync(path.join(DEMO, f));
  }

  if (fails.length) {
    console.error('\n' + fails.length + ' checks failed:\n' + fails.map((m) => ' - ' + m).join('\n'));
    process.exit(1);
  }
  console.log('\nall games-fit checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
