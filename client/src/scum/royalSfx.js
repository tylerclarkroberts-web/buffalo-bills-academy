// Synthesized royal-command sounds. Honor the shared table mute (bba.bj.muted).
import { isMuted } from '../bj/sfx.js';
import { SONG_NOTES, AUDIO_URL, getScript, loadSongScript } from './songScript.js';

let ac = null;
const ctx = () => {
  if (isMuted()) return null;
  if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
  if (ac.state === 'suspended') ac.resume();
  return ac;
};
function tone(f0, f1, dur, { wave = 'square', vol = 0.05, at = 0 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at; const o = a.createOscillator(), g = a.createGain();
  o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.04, at = 0, from = 1200, to = 400 } = {}) {
  const a = ctx(); if (!a) return;
  const n = a.sampleRate, len = Math.max(1, Math.floor(n * dur));
  const buf = a.createBuffer(1, len, n), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const t = a.currentTime + at, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + dur + 0.02);
}


/** Breathy pan-flute: sine core, light octave air, noise breath, slow vibrato. */
function flute(freq, dur, { at = 0, vol = 0.055 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), air = a.createOscillator(), lfo = a.createOscillator();
  const g = a.createGain(), airG = a.createGain(), lfoG = a.createGain();
  o.type = 'sine'; air.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  air.frequency.setValueAtTime(freq * 2.01, t);
  lfo.type = 'sine'; lfo.frequency.setValueAtTime(5.1, t);
  lfoG.gain.setValueAtTime(freq * 0.014, t);
  lfo.connect(lfoG).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.07);
  g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.1, dur - 0.14));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  airG.gain.setValueAtTime(0.0001, t);
  airG.gain.exponentialRampToValueAtTime(vol * 0.14, t + 0.08);
  airG.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  air.connect(airG).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.04);
  air.start(t); air.stop(t + dur + 0.04);
  lfo.start(t); lfo.stop(t + dur + 0.04);
  noise(Math.min(dur, 0.28), { vol: vol * 0.12, at, from: Math.min(1800, freq * 3), to: freq });
}


let songEl = null, songTimer = null, songGen = 0;

async function songMp3Exists() {
  // Missing files are served as the SPA shell (200 HTML), so sniff type/bytes, not status.
  try {
    const r = await fetch(AUDIO_URL, { method: 'GET', headers: { Range: 'bytes=0-2' }, cache: 'no-cache' });
    if (!r.ok && r.status !== 206) return false;
    const type = (r.headers.get('content-type') || '').toLowerCase();
    if (type.includes('html') || type.includes('json') || type.includes('text/plain')) return false;
    if (type.includes('audio') || type.includes('mpeg') || type.includes('mp3')) return true;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // ID3
    if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true; // MPEG frame
    return false;
  } catch { return false; }
}

/** Resolve with a loaded Audio element if song.mp3 exists, else null. */
async function probeSongMp3() {
  if (typeof Audio === 'undefined' || !(await songMp3Exists())) return null;
  return new Promise((resolve) => {
    const el = new Audio(AUDIO_URL);
    el.preload = 'auto';
    const done = (ok) => { clearTimeout(t); el.onloadedmetadata = el.onerror = null; resolve(ok ? el : null); };
    const t = setTimeout(() => done(false), 2500);
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0);
    el.onerror = () => done(false);
    try { el.load(); } catch { done(false); }
  });
}

function haltSong() {
  if (songTimer) { clearTimeout(songTimer); songTimer = null; }
  if (songEl) {
    try { songEl.pause(); songEl.removeAttribute('src'); songEl.load(); } catch { /* already stopped */ }
    songEl = null;
  }
  if (ac) { try { ac.close(); } catch { /* already closed */ } ac = null; }
}

export const royalSfx = {
  jig() { [0, 4, 7, 4, 7, 12].forEach((n, i) => tone(392 * 2 ** (n / 12), 392 * 2 ** (n / 12), 0.1, { wave: 'triangle', vol: 0.05, at: i * 0.12 })); },
  bow() { tone(180, 80, 0.45, { wave: 'sine', vol: 0.06 }); },
  milk() { tone(900, 1200, 0.08, { wave: 'triangle', vol: 0.04, at: 0.9 }); tone(1400, 1400, 0.05, { wave: 'sine', vol: 0.03, at: 1.7 }); noise(0.25, { vol: 0.03, at: 2.2, from: 600, to: 200 }); },
  toot() { noise(0.45, { vol: 0.07, from: 180, to: 90 }); tone(90, 60, 0.4, { wave: 'sawtooth', vol: 0.05 }); tone(140, 80, 0.25, { wave: 'square', vol: 0.03, at: 0.15 }); },
  fan() { noise(0.35, { vol: 0.035, from: 900, to: 400 }); noise(0.35, { vol: 0.03, at: 0.4, from: 800, to: 350 }); },
  carpet() { noise(0.8, { vol: 0.04, from: 500, to: 140 }); },
  dunce() { tone(330, 280, 0.2, { wave: 'triangle', vol: 0.05 }); tone(247, 200, 0.35, { wave: 'triangle', vol: 0.05, at: 0.18 }); },
  boots() { tone(1800, 2200, 0.06, { wave: 'sine', vol: 0.03 }); tone(2000, 2400, 0.06, { wave: 'sine', vol: 0.025, at: 0.2 }); tone(1600, 1900, 0.06, { wave: 'sine', vol: 0.025, at: 0.4 }); },
  async sing() {
    const my = ++songGen;
    haltSong();
    const script = getScript() || await loadSongScript();
    if (my !== songGen) return null;
    const lead = (script?.songStart ?? 9400);
    const el = await probeSongMp3();
    if (my !== songGen) return null;
    if (el) {
      songEl = el;
      el.muted = isMuted();
      el.volume = 0.85;
      songTimer = setTimeout(() => {
        if (songEl !== el || my !== songGen) return;
        el.muted = isMuted();
        el.play().catch(() => {});
      }, lead);
      return el;
    }
    if (isMuted()) return null;
    SONG_NOTES.forEach((n) => flute(n.freq, n.dur, { at: lead / 1000 + n.at, vol: 0.05 }));
    return null;
  },
  serenade() { return this.sing(); },
  train() { noise(0.7, { vol: 0.03, from: 300, to: 120 }); },
  sweep() { noise(0.22, { vol: 0.04, from: 1400, to: 500 }); noise(0.22, { vol: 0.035, at: 0.28, from: 1200, to: 400 }); noise(0.22, { vol: 0.03, at: 0.56, from: 1100, to: 350 }); },
  play(cmd) { try { return (this[cmd] || this.jig).call(this); } catch { /* autoplay / no audio */ } },
  /** Seconds into song.mp3, or null if the file isn't playing yet / isn't present. */
  songTime() {
    if (!songEl || !Number.isFinite(songEl.currentTime)) return null;
    if (songEl.paused && songEl.currentTime === 0) return null;
    return songEl.currentTime;
  },
  stop() { songGen += 1; haltSong(); },
};

