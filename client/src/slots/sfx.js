// v39 slot sounds: synthesized with Web Audio (no files). Muted state lives in localStorage.
let ac = null;
const KEY = 'bba.slots.muted';
export const isMuted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* private mode */ } };
const ctx = () => { if (isMuted()) return null; if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); } if (ac.state === 'suspended') ac.resume(); return ac; };
function tone(f0, f1, dur, { wave = 'sine', vol = 0.1, at = 0 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at; const o = a.createOscillator(), g = a.createGain();
  o.type = wave; o.frequency.setValueAtTime(Math.max(20, f0), t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.1, at = 0, lp = 1200 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at; const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
  const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const g = a.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
/** A long, wobbly, cartoon toot: a low buzzing reed (sawtooth with flutter) over a muffled noise puff. */
function fart({ at = 0, len = 1.1, pitch = 1 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(); o.type = 'sawtooth';
  const lfo = a.createOscillator(); lfo.frequency.value = 23; const lg = a.createGain(); lg.gain.value = 18 * pitch; lfo.connect(lg).connect(o.frequency);
  o.frequency.setValueAtTime(95 * pitch, t); o.frequency.linearRampToValueAtTime(70 * pitch, t + len * 0.6); o.frequency.linearRampToValueAtTime(120 * pitch, t + len);
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650; f.Q.value = 6;
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
  for (let i = 1; i < 8; i++) g.gain.setValueAtTime(0.12 + 0.1 * Math.random(), t + (len * i) / 8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(f).connect(g).connect(a.destination); o.start(t); lfo.start(t); o.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
  noise(len * 0.9, { vol: 0.18, at, lp: 380 });
}
export const sfx = {
  spin() { for (let i = 0; i < 6; i++) tone(500 + i * 40, 420, 0.04, { wave: 'square', vol: 0.025, at: i * 0.07 }); },
  stop(i = 0) { tone(160 - i * 8, 70, 0.08, { wave: 'triangle', vol: 0.12 }); noise(0.05, { vol: 0.05, lp: 1800 }); },
  win(x = 1) { const n = x >= 5 ? 5 : 3; for (let i = 0; i < n; i++) tone(660 * 2 ** (i * 4 / 12), 660 * 2 ** (i * 4 / 12), 0.14, { wave: 'triangle', vol: 0.08, at: i * 0.1 }); },
  big() { [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => tone(392 * 2 ** (n / 12), 392 * 2 ** (n / 12), 0.2, { wave: 'square', vol: 0.05, at: i * 0.14 })); },
  waddle() { for (let i = 0; i < 6; i++) tone(120, 80, 0.07, { wave: 'triangle', vol: 0.09, at: i * 0.22 }); },
  drop() { tone(900, 200, 0.25, { wave: 'sine', vol: 0.07 }); tone(120, 60, 0.12, { wave: 'triangle', vol: 0.12, at: 0.24 }); },
  toot() { fart({ len: 1.3 }); fart({ at: 1.35, len: 0.35, pitch: 1.4 }); },
  smallToot() { fart({ len: 0.45, pitch: 1.25 }); },
  crash() { noise(0.6, { vol: 0.22, lp: 2600 }); for (let i = 0; i < 5; i++) tone(300 + Math.random() * 400, 80, 0.12, { wave: 'square', vol: 0.03, at: i * 0.08 }); },
  acorn() { tone(1200, 1800, 0.08, { wave: 'sine', vol: 0.08 }); tone(1800, 2400, 0.08, { wave: 'sine', vol: 0.05, at: 0.07 }); },
  level() { [0, 5, 9, 12].forEach((n, i) => tone(523 * 2 ** (n / 12), 523 * 2 ** (n / 12), 0.16, { wave: 'triangle', vol: 0.08, at: i * 0.1 })); },
};
