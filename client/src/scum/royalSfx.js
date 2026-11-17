// Synthesized royal-command sounds. Honor the shared table mute (bba.bj.muted).
import { isMuted } from '../bj/sfx.js';

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

export const royalSfx = {
  jig() { [0, 4, 7, 4, 7, 12].forEach((n, i) => tone(392 * 2 ** (n / 12), 392 * 2 ** (n / 12), 0.1, { wave: 'triangle', vol: 0.05, at: i * 0.12 })); },
  bow() { tone(180, 80, 0.45, { wave: 'sine', vol: 0.06 }); },
  milk() { tone(900, 1200, 0.08, { wave: 'triangle', vol: 0.04, at: 0.9 }); tone(1400, 1400, 0.05, { wave: 'sine', vol: 0.03, at: 1.7 }); noise(0.25, { vol: 0.03, at: 2.2, from: 600, to: 200 }); },
  toot() { noise(0.45, { vol: 0.07, from: 180, to: 90 }); tone(90, 60, 0.4, { wave: 'sawtooth', vol: 0.05 }); tone(140, 80, 0.25, { wave: 'square', vol: 0.03, at: 0.15 }); },
  fan() { noise(0.35, { vol: 0.035, from: 900, to: 400 }); noise(0.35, { vol: 0.03, at: 0.4, from: 800, to: 350 }); },
  carpet() { noise(0.8, { vol: 0.04, from: 500, to: 140 }); },
  dunce() { tone(330, 280, 0.2, { wave: 'triangle', vol: 0.05 }); tone(247, 200, 0.35, { wave: 'triangle', vol: 0.05, at: 0.18 }); },
  boots() { tone(1800, 2200, 0.06, { wave: 'sine', vol: 0.03 }); tone(2000, 2400, 0.06, { wave: 'sine', vol: 0.025, at: 0.2 }); tone(1600, 1900, 0.06, { wave: 'sine', vol: 0.025, at: 0.4 }); },
  serenade() { [0, 2, 0.4, 4, -1, 3].forEach((n, i) => tone(440 * 2 ** (n / 12), 440 * 2 ** ((n + (i % 2 ? 0.7 : -0.5)) / 12), 0.28, { wave: 'sine', vol: 0.05, at: i * 0.3 })); },
  train() { noise(0.7, { vol: 0.03, from: 300, to: 120 }); },
  sweep() { noise(0.22, { vol: 0.04, from: 1400, to: 500 }); noise(0.22, { vol: 0.035, at: 0.28, from: 1200, to: 400 }); noise(0.22, { vol: 0.03, at: 0.56, from: 1100, to: 350 }); },
  play(cmd) { try { (this[cmd] || this.jig)(); } catch { /* autoplay / no audio */ } },
};
