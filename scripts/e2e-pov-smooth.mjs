// High-frame-rate capture of the admin dealer POV preview for smoothness work.
// TAG=before|after PLAYWRIGHT_DIR=... CHROME=/usr/bin/google-chrome node scripts/e2e-pov-smooth.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'node:module';
import { previewAdminEnv, PREVIEW_ADMIN_EMAIL, PREVIEW_OUT } from './lib-pov-preview-e2e.mjs';

const req = createRequire(process.env.PLAYWRIGHT_DIR ? path.join(process.env.PLAYWRIGHT_DIR, 'x.js') : import.meta.url);
const { chromium, webkit, devices } = req('playwright-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TAG = process.env.TAG || 'before';
const OUT = process.env.SMOOTH_OUT || path.join('/workspace/bba-dealer-pov-shots/smooth', TAG);
const PORT = 4350 + Math.floor(Math.random() * 9);
const B = `http://localhost:${PORT}`;
const RECORD_MS = Number(process.env.RECORD_MS || 42000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bba-pov-smooth-'));
const srv = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: previewAdminEnv({ ...process.env, PORT: String(PORT), DATA_DIR: dir, DEV_LOGIN: '1', SLACK_BOT_TOKEN: '', BJ_TICK_MS: '0' }, dir),
  stdio: ['ignore', 'ignore', 'inherit'],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function stats(dts) {
  const ms = (dts || []).map(Number).filter((d) => d > 0 && d < 2000);
  if (!ms.length) return { n: 0, p50: 0, p95: 0, max: 0, over50: 0 };
  const sorted = ms.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
  const over50 = sorted.filter((d) => d > 50).length;
  return {
    n: sorted.length,
    p50: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    max: +sorted[sorted.length - 1].toFixed(2),
    over50,
    mean: +(sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2),
    fpsP50: +(1000 / at(0.5)).toFixed(1),
    fpsP95: +(1000 / at(0.95)).toFixed(1),
  };
}

async function login(name, email) {
  const r = await fetch(B + '/auth/dev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return { name, cookie, sid: cookie.split('=')[1] };
}
async function api(me, method, path, body) {
  const r = await fetch(B + '/api' + path, { method, headers: { 'content-type': 'application/json', cookie: me.cookie }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${text}`);
  return data;
}

async function shooFaun(p) {
  try {
    const no = p.locator('[data-test=fawn-no], [data-test="fawn-no"]');
    if (await no.count()) { await no.click({ force: true }); await wait(200); }
  } catch { /* */ }
}

function transcode(video, destBase) {
  if (!video || !fs.existsSync(video)) return { mp4: null, gif: null };
  const mp4 = `${destBase}.mp4`;
  const gif = `${destBase}.gif`;
  try {
    execFileSync('ffmpeg', ['-y', '-i', video, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-an', mp4], { stdio: 'ignore' });
  } catch (e) { console.warn('mp4 failed', e.message); }
  try {
    const pal = `${destBase}-pal.png`;
    execFileSync('ffmpeg', ['-y', '-t', '18', '-i', video, '-vf', 'fps=8,scale=390:-1:flags=lanczos,palettegen=stats_mode=diff', pal], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-y', '-t', '18', '-i', video, '-i', pal, '-lavfi', 'fps=8,scale=390:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer', '-loop', '0', gif], { stdio: 'ignore' });
    try { fs.unlinkSync(pal); } catch { /* */ }
  } catch (e) { console.warn('gif failed', e.message); }
  return { mp4: fs.existsSync(mp4) ? mp4 : null, gif: fs.existsSync(gif) ? gif : null };
}

async function recordOne({ browser, kind, device, viewport, admin }) {
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), `bba-vid-${kind}-`));
  const size = viewport || (device && { width: device.viewport.width, height: device.viewport.height }) || { width: 390, height: 844 };
  const ctx = await browser.newContext({
    ...(device || {}),
    viewport: size,
    reducedMotion: 'no-preference',
    recordVideo: { dir: videoDir, size },
  });
  await ctx.addCookies([{ name: 'bba_sid', value: admin.sid, url: B }]);
  await ctx.addInitScript(() => {
    const css = '[data-test="fawn"], .fn, .fn-card, .fn-stage, .fn-photo, .dealer-spot[title="Guntrad"], [data-test=bj-guntrad] { display: none !important; }';
    const inject = () => {
      if (document.getElementById('e2e-hide-faun')) return;
      const s = document.createElement('style'); s.id = 'e2e-hide-faun'; s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    inject();
    document.addEventListener('DOMContentLoaded', inject);
    window.__SMOOTH = { frames: [], last: 0 };
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) {
      return orig.call(window, function (t) {
        const s = window.__SMOOTH;
        if (!s._hooked && !s.ignore) {
          if (s.last) s.frames.push(Math.round((t - s.last) * 100) / 100);
          s.last = t;
          if (s.frames.length > 20000) s.frames.shift();
        }
        cb(t);
      });
    };
  });
  const p = await ctx.newPage();
  await p.goto(`${B}/admin/bj-preview`);
  await shooFaun(p);
  await p.locator('[data-test=bj-dealer-pov]').waitFor({ timeout: 20000 });
  await p.evaluate(() => {
    if (!window.__SMOOTH) window.__SMOOTH = { frames: [], last: 0 };
    if (window.__SMOOTH._hooked) return;
    window.__SMOOTH._hooked = true;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => orig((t) => {
      const s = window.__SMOOTH;
      if (!s.ignore) {
        if (s.last) s.frames.push(Math.round((t - s.last) * 100) / 100);
        s.last = t;
        if (s.frames.length > 20000) s.frames.shift();
      }
      cb(t);
    });
  });
  await wait(1800);
  await p.evaluate(() => {
    if (window.__SMOOTH) { window.__SMOOTH.frames = []; window.__SMOOTH.last = performance.now(); window.__SMOOTH.ignore = false; }
  });
  const still = async (name) => {
    await p.evaluate(() => { if (window.__SMOOTH) window.__SMOOTH.ignore = true; });
    await p.screenshot({ path: path.join(OUT, `${kind}-${name}.png`), fullPage: false });
    await p.evaluate(() => { if (window.__SMOOTH) { window.__SMOOTH.ignore = false; window.__SMOOTH.last = performance.now(); } });
  };
  // Clean metrics window first: no screenshots. Trigger pit + tip during the run.
  await wait(2000);
  await p.locator('[data-test=bj-preview-pit]').click({ force: true }).catch(() => {});
  await wait(900);
  await p.locator('[data-test=bj-preview-tip]').click({ force: true }).catch(() => {});
  const remain = Math.max(4000, RECORD_MS - 2900);
  await wait(remain);
  const metrics = await p.evaluate(() => ({
    frames: (window.__SMOOTH && window.__SMOOTH.frames) || [],
    fps: Number(document.querySelector('[data-test=bj-dealer-pov]')?.getAttribute('data-fps') || 0),
    engine: document.querySelector('[data-test=bj-dealer-pov]')?.getAttribute('data-engine') || '',
    hitches: (typeof window.__POV_HITCHES === 'function' && window.__POV_HITCHES()) || [],
  }));
  // Stills after metrics so Playwright's capture cannot pad the hitch count.
  await p.locator('[data-test=bj-preview-pit]').click({ force: true }).catch(() => {});
  await wait(2600);
  await still('pit');
  await wait(3200);
  await p.locator('[data-test=bj-preview-tip]').click({ force: true }).catch(() => {});
  await wait(700);
  await still('tip');
  await still('mid');
  await still('start');
  await still('end');
  await p.close();
  await ctx.close();
  const saved = fs.readdirSync(videoDir).map((n) => path.join(videoDir, n)).find((f) => /\.(webm|mp4)$/.test(f));
  const destVid = path.join(OUT, `${kind}.webm`);
  if (saved) {
    fs.copyFileSync(saved, destVid);
    try { fs.rmSync(videoDir, { recursive: true, force: true }); } catch { /* */ }
  }
  const media = process.env.METRICS_ONLY ? { skipped: true } : transcode(saved && fs.existsSync(destVid) ? destVid : saved, path.join(OUT, kind));
  const st = stats(metrics.frames);
  const report = { tag: TAG, kind, engine: metrics.engine, reportedFps: metrics.fps, viewport: size, stats: st, hitches: metrics.hitches || [], media, stills: fs.readdirSync(OUT).filter((n) => n.startsWith(`${kind}-`) && n.endsWith('.png')) };
  fs.writeFileSync(path.join(OUT, `${kind}-metrics.json`), JSON.stringify(report, null, 2));
  console.log(kind, JSON.stringify(st), 'engine', metrics.engine, 'media', media);
  return report;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r, j) => {
    const t0 = Date.now();
    const ping = () => fetch(B + '/api/health').then(() => r()).catch(() => (Date.now() - t0 > 20000 ? j(new Error('server did not start')) : setTimeout(ping, 200)));
    ping();
  });
  const admin = await login('Tyler', PREVIEW_ADMIN_EMAIL);
  await api(admin, 'POST', '/me/avatar', { kind: 'gen', seed: 'tyler-preview' });
  const reports = [];
  {
    const browser = await webkit.launch({ headless: true });
    for (const [kind, name] of [
      ['webkit-iphone-13', 'iPhone 13'],
      ['webkit-iphone-15', 'iPhone 15'],
      ['webkit-iphone-15-landscape', 'iPhone 15 landscape'],
    ]) {
      const device = devices[name];
      if (!device) throw new Error(`missing Playwright device ${name}`);
      reports.push(await recordOne({ browser, kind, device, admin }));
    }
    await browser.close();
  }
  {
    const browser = await chromium.launch({
      executablePath: process.env.CHROME || '/usr/bin/google-chrome',
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    reports.push(await recordOne({
      browser,
      kind: 'chrome-mobile',
      device: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36' },
      admin,
    }));
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ tag: TAG, at: new Date().toISOString(), reports }, null, 2));
  try { srv.kill('SIGTERM'); } catch { /* */ }
  console.log('SMOOTH OK', TAG, OUT);
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { srv.kill('SIGTERM'); } catch { /* */ }
  process.exit(1);
});
