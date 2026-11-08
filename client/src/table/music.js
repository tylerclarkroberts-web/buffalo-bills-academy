// Saloon piano for the card room: plays tunes.js on WebAudio pulse (lead + chord stabs), triangle (bass)
// and noise (brushed hi-hat). Only the table screen uses it; it never starts until a tap (browser autoplay
// rules), pauses while the tab is hidden, and remembers on/off + volume in localStorage.
import { TUNES, compile, hz, shuffleOrder } from './tunes.js';
import { JP_TUNES, compileJP } from './tunes-jp.js';
// Which tune list plays follows the look: the anime theme gets 8-bit Japanese tunes, every other theme the piano.
// Each theme can also be muted on its own ("per-theme mute"), on top of the main on/off switch.
let theme = 'saloon', set = 'saloon';
const list = () => (set === 'jp' ? JP_TUNES : TUNES);
const muted = () => !!prefs.mute[theme];

const KEY = 'bba.music';
const listeners = new Set();
let prefs = load();
let ctx = null, master = null, pulse = null, pulse8 = null, noise = null;
let attached = 0, timer = null, playing = false, order = [], pos = 0, cur = null, rep = 0, nextIdx = 0, t0 = 0, spb = 0.5, last = -1;

function load() {
  try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); return { on: p.on !== false, vol: typeof p.vol === 'number' ? Math.min(1, Math.max(0, p.vol)) : 0.25, mute: p.mute && typeof p.mute === 'object' ? p.mute : {} }; } catch { return { on: true, vol: 0.25, mute: {} }; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ } }
function emit() { const s = state(); listeners.forEach((f) => f(s)); }

export function state() { return { on: prefs.on, vol: prefs.vol, theme, themeMuted: muted(), set, playing, title: cur?.tune.title || '', by: cur?.tune.by || '', year: cur?.tune.year || null }; }
export function subscribe(fn) { listeners.add(fn); fn(state()); return () => listeners.delete(fn); }

function ensureCtx() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
  master = ctx.createGain(); master.gain.value = level();
  master.connect(lp).connect(ctx.destination);
  // 25% pulse wave: the classic NES-ish lead
  const N = 32, re = new Float32Array(N), im = new Float32Array(N);
  for (let k = 1; k < N; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
  pulse = ctx.createPeriodicWave(re, im);
  const re8 = new Float32Array(N), im8 = new Float32Array(N); // 12.5% pulse: thinner, more "8-bit"
  for (let k = 1; k < N; k++) im8[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.125);
  pulse8 = ctx.createPeriodicWave(re8, im8);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}
const level = () => prefs.vol * 0.5; // 25% (the default) is quiet background

function tone(at, dur, f, { type, wave, gain, detune = 0, decay = 0.9 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  if (wave) o.setPeriodicWave(wave); else o.type = type;
  o.frequency.value = f; o.detune.value = detune;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(gain * 0.25, at + Math.max(0.05, dur * decay));
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(g).connect(master); o.start(at); o.stop(at + dur + 0.02);
}
function hat(at) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; f.type = 'highpass'; f.frequency.value = 7000;
  g.gain.setValueAtTime(0.05, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
  s.connect(f).connect(g).connect(master); s.start(at); s.stop(at + 0.05);
}
function taiko(at) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(110, at); o.frequency.exponentialRampToValueAtTime(48, at + 0.18);
  g.gain.setValueAtTime(0.32, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.28);
  o.connect(g).connect(master); o.start(at); o.stop(at + 0.3);
}
function play(e, at) {
  const dur = e.dur * spb;
  if (e.voice === 'lead') {
    // two slightly detuned pulses: the out-of-tune upright in the corner
    tone(at, dur * 0.95, hz(e.midi), { wave: pulse, gain: 0.11, detune: -7 });
    tone(at, dur * 0.95, hz(e.midi), { wave: pulse, gain: 0.08, detune: 9 });
  } else if (e.voice === 'bass') tone(at, dur, hz(e.midi), { type: 'triangle', gain: 0.32, decay: 0.7 });
  else if (e.voice === 'stab') tone(at, dur, hz(e.midi), { type: 'square', gain: 0.022, decay: 0.5 });
  else if (e.voice === 'lead8') { tone(at, dur * 0.92, hz(e.midi), { wave: pulse8, gain: 0.12, decay: 0.75 }); tone(at, dur * 0.9, hz(e.midi + 12), { type: 'triangle', gain: 0.03, decay: 0.6 }); }
  else if (e.voice === 'koto') tone(at, dur, hz(e.midi), { type: 'square', gain: 0.028, decay: 0.18 });
  else if (e.voice === 'drone') tone(at, dur, hz(e.midi), { type: 'triangle', gain: 0.2, decay: 0.95 });
  else if (e.voice === 'taiko') taiko(at);
  else hat(at);
}

function startTune() {
  if (pos >= order.length) { order = shuffleOrder(list().length, Math.random, last); pos = 0; }
  const idx = order[pos++]; last = idx;
  const tune = list()[idx];
  cur = { tune, ...(set === 'jp' ? compileJP(tune) : compile(tune)) }; rep = 0; nextIdx = 0;
  spb = 60 / tune.bpm; t0 = ctx.currentTime + 0.15;
  emit();
}
function tick() {
  if (!playing || !ctx) return;
  const ahead = ctx.currentTime + 0.25;
  for (;;) {
    if (nextIdx >= cur.events.length) {
      rep += 1;
      const end = t0 + cur.beats * spb;
      if (rep < 2) { t0 = end; nextIdx = 0; continue; } // each tune plays twice
      if (end + 1.2 > ahead) return; // a short breath between tunes
      startTune(); t0 = Math.max(t0, end + 1.2); continue;
    }
    const e = cur.events[nextIdx];
    const at = t0 + e.t * spb;
    if (at > ahead) return;
    if (at >= ctx.currentTime - 0.02) play(e, Math.max(at, ctx.currentTime));
    nextIdx += 1;
  }
}

/** Begin playing (call from a user gesture). No-op when switched off. */
export function start() {
  if (!prefs.on || muted() || playing || !attached) return; // only ever on a table screen
  if (!ensureCtx()) return;
  ctx.resume?.();
  playing = true;
  if (!cur) startTune(); else { t0 = ctx.currentTime + 0.15; nextIdx = 0; rep = 0; }
  clearInterval(timer); timer = setInterval(tick, 40); tick();
  emit();
}
export function stop() {
  playing = false; clearInterval(timer); timer = null;
  if (ctx && ctx.state === 'running') ctx.suspend?.();
  emit();
}
export function next() { if (!ctx) return; pos = Math.min(pos, order.length); master.gain.value = level(); startTune(); }
export function setOn(on) { prefs.on = !!on; save(); if (on) start(); else stop(); emit(); }
export function setVolume(v) {
  prefs.vol = Math.min(1, Math.max(0, +v)); save();
  if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
  emit();
}

/** Switch the look the music follows (saloon, jade, anime, arcade). Swaps tune lists and applies that theme's mute. */
export function setTheme(name) {
  const want = name === 'anime' ? 'jp' : 'saloon';
  theme = name;
  if (want !== set) { set = want; order = []; pos = 0; last = -1; cur = null; if (playing && ctx) startTune(); }
  if (muted() && playing) stop();
  else if (!muted() && prefs.on && !playing && ctx && attached) start();
  emit();
}
/** Mute (or unmute) the music for one theme only. */
export function setThemeMute(name, on) {
  prefs.mute = { ...prefs.mute, [name]: !!on }; if (!on) delete prefs.mute[name]; save();
  if (name === theme) { if (on) stop(); else if (prefs.on) start(); }
  emit();
}

/** Table-screen hook glue: start on the first tap, pause when the tab hides, stop on leave. */
export function attach() {
  attached += 1;
  const first = () => { start(); };
  const vis = () => { if (document.hidden) { if (playing) { stop(); resumeOnShow = true; } } else if (resumeOnShow) { resumeOnShow = false; start(); } };
  let resumeOnShow = false;
  window.addEventListener('pointerdown', first, { capture: true, once: true });
  window.addEventListener('keydown', first, { capture: true, once: true });
  document.addEventListener('visibilitychange', vis);
  return () => {
    window.removeEventListener('pointerdown', first, { capture: true });
    window.removeEventListener('keydown', first, { capture: true });
    document.removeEventListener('visibilitychange', vis);
    attached -= 1;
    stop(); cur = null;
  };
}
