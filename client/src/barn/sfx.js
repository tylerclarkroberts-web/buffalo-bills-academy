// The Barn (v30): synthesized sounds only (Web Audio, no files). Each creature has a voice from its roster entry.
let ac = null, on = false;
const ctx = () => { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); } if (ac.state === 'suspended') ac.resume(); return ac; };
export const setSound = (v) => { on = !!v; };
export const soundOn = () => on;
function tone(f0, f1, dur, { wave = 'sine', vol = 0.12, at = 0 } = {}) {
  const a = on && ctx(); if (!a) return;
  const t = a.currentTime + at; const o = a.createOscillator(), g = a.createGain();
  o.type = wave; o.frequency.setValueAtTime(Math.max(20, f0), t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.1, at = 0, lp = 2000 } = {}) {
  const a = on && ctx(); if (!a) return;
  const t = a.currentTime + at; const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const g = a.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
const semi = (f, n) => f * 2 ** (n / 12);
/** The creature's call: its roster voice (waveform, pitch, glide, a little melody), gargled. */
export function voice(v, mood = 1) {
  if (!v) return;
  v.pattern.forEach((n, i) => { const f = semi(v.base, n) * (0.9 + mood * 0.1); tone(f, Math.max(30, f + v.glide), 0.16, { wave: v.wave, vol: 0.07, at: i * 0.13 }); tone(f * 1.01, f * 0.5, 0.12, { wave: 'sine', vol: 0.03, at: i * 0.13 + 0.02 }); });
  noise(0.08 * v.pattern.length, { vol: 0.03, lp: 600 }); // the wet gurgle under it
}
export const sfx = {
  feed() { for (let i = 0; i < 4; i++) { noise(0.06, { vol: 0.12, at: i * 0.12, lp: 900 }); tone(180, 90, 0.08, { wave: 'square', vol: 0.04, at: i * 0.12 }); } tone(90, 50, 0.4, { wave: 'sawtooth', vol: 0.06, at: 0.55 }); }, // chomp x4, then a burp
  play() { tone(300, 900, 0.18, { wave: 'triangle', vol: 0.08 }); tone(900, 300, 0.18, { wave: 'triangle', vol: 0.08, at: 0.2 }); tone(500, 1400, 0.12, { wave: 'sine', vol: 0.06, at: 0.42 }); }, // boing-boing-squeak
  clean() { noise(0.9, { vol: 0.08, lp: 5000 }); for (let i = 0; i < 5; i++) tone(1200 + i * 200, 2400, 0.05, { vol: 0.03, at: 0.1 + i * 0.14 }); }, // hose + bubbles
  warm() { tone(120, 160, 0.6, { wave: 'sine', vol: 0.06 }); noise(0.5, { vol: 0.03, lp: 400 }); },
  egg() { tone(220, 200, 0.12, { wave: 'triangle', vol: 0.06 }); tone(240, 210, 0.1, { wave: 'triangle', vol: 0.05, at: 0.18 }); }, // knock knock
  hatch() { for (let i = 0; i < 6; i++) noise(0.04, { vol: 0.14, at: i * 0.09, lp: 3000 }); tone(200, 800, 0.5, { wave: 'square', vol: 0.06, at: 0.6 }); },
  pickup() { tone(400, 600, 0.12, { wave: 'triangle', vol: 0.08 }); tone(600, 900, 0.12, { wave: 'triangle', vol: 0.06, at: 0.12 }); },
  whack(tier = 0) { noise(0.12 + tier * 0.05, { vol: 0.16, lp: 1800 }); tone(240 - tier * 40, 60, 0.22, { wave: 'square', vol: 0.07 }); }, // bonk, bigger for bigger moves
  whiff() { noise(0.25, { vol: 0.05, lp: 7000 }); tone(900, 400, 0.2, { wave: 'sine', vol: 0.03 }); },
  bell() { [0, 0.35].forEach((at) => { tone(1320, 1300, 0.9, { wave: 'sine', vol: 0.08, at }); tone(2640, 2600, 0.6, { wave: 'sine', vol: 0.03, at }); }); }, // ding ding
  nope() { tone(160, 120, 0.2, { wave: 'square', vol: 0.05 }); },
};
