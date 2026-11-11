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
function noise(dur, { vol = 0.1, at = 0, lp = 2000, swell = false } = {}) {
  const a = on && ctx(); if (!a) return;
  const t = a.currentTime + at; const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (swell ? Math.sin((Math.PI * i) / d.length) : 1 - i / d.length);
  const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; const g = a.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
const semi = (f, n) => f * 2 ** (n / 12);
/** Wings: a sawtooth with its volume shaken by a fast LFO. */
function flutter(f, dur, { vol = 0.05, at = 0, rate = 42 } = {}) {
  const a = on && ctx(); if (!a) return;
  const t = a.currentTime + at, o = a.createOscillator(), l = a.createOscillator(), depth = a.createGain(), am = a.createGain(), env = a.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.3, t + dur);
  l.frequency.value = rate; depth.gain.value = 0.5; am.gain.value = 0.5; l.connect(depth).connect(am.gain);
  env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(vol, t + 0.05); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(am).connect(env).connect(a.destination); o.start(t); l.start(t); o.stop(t + dur + 0.02); l.stop(t + dur + 0.02);
}
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
  // v35 bouts: a drumroll and gong for the intro, a wind-up for specials, each fighting style's move and each effect.
  intro() { for (let i = 0; i < 16; i++) noise(0.05, { vol: 0.04 + i * 0.006, at: 0.25 + i * 0.075 * (1 - i / 40), lp: 700 }); tone(98, 92, 1.4, { wave: 'sine', vol: 0.13, at: 1.75 }); tone(196, 184, 1.1, { wave: 'triangle', vol: 0.05, at: 1.75 }); noise(1.3, { vol: 0.05, at: 1.8, lp: 1500, swell: true }); },
  charge(tier = 1) { tone(110, 480 + tier * 120, 0.55 + tier * 0.08, { wave: 'sawtooth', vol: 0.04 }); noise(0.5, { vol: 0.04, lp: 2500, swell: true }); },
  buzz() { flutter(150, 0.5); },
  hop() { tone(180, 520, 0.16, { wave: 'sine', vol: 0.08 }); },
  dash() { noise(0.32, { vol: 0.07, lp: 1100, swell: true }); tone(90, 60, 0.25, { wave: 'triangle', vol: 0.05, at: 0.12 }); },
  snap() { tone(2200, 700, 0.05, { wave: 'square', vol: 0.05, at: 0.22 }); noise(0.04, { vol: 0.1, lp: 6000, at: 0.22 }); },
  spray() { for (let i = 0; i < 3; i++) { noise(0.09, { vol: 0.12, at: 0.28 + i * 0.1, lp: 3500 }); tone(600, 200, 0.08, { wave: 'square', vol: 0.03, at: 0.28 + i * 0.1 }); } }, // pop pop pop
  roll() { noise(0.45, { vol: 0.08, lp: 320 }); tone(70, 110, 0.4, { wave: 'triangle', vol: 0.05 }); },
  wriggle() { tone(160, 260, 0.14, { wave: 'sine', vol: 0.06 }); tone(260, 140, 0.18, { wave: 'sine', vol: 0.06, at: 0.14 }); },
  pierce() { tone(1900, 420, 0.16, { wave: 'square', vol: 0.05 }); noise(0.12, { vol: 0.1, lp: 8000 }); },
  guard() { tone(720, 700, 0.18, { wave: 'triangle', vol: 0.08 }); tone(1080, 1060, 0.22, { wave: 'triangle', vol: 0.05, at: 0.02 }); noise(0.06, { vol: 0.08, lp: 5000 }); }, // clank
  venom() { [0, 0.09, 0.2].forEach((at, i) => tone(320 - i * 50, 110, 0.12, { wave: 'sine', vol: 0.08, at })); }, // glug
  heal() { [0, 4, 7, 12].forEach((n, i) => tone(semi(523, n), semi(523, n), 0.22, { wave: 'triangle', vol: 0.06, at: i * 0.07 })); },
  weaken() { tone(420, 150, 0.45, { wave: 'sawtooth', vol: 0.04 }); tone(300, 110, 0.5, { wave: 'sawtooth', vol: 0.03, at: 0.08 }); },
  crit() { noise(0.35, { vol: 0.22, lp: 2600 }); tone(220, 40, 0.4, { wave: 'square', vol: 0.09 }); noise(0.25, { vol: 0.07, at: 0.18, lp: 1200 }); },
  ko() { tone(640, 70, 0.7, { wave: 'square', vol: 0.06 }); noise(0.2, { vol: 0.18, at: 0.62, lp: 600 }); tone(70, 40, 0.3, { wave: 'sine', vol: 0.14, at: 0.62 }); noise(1.4, { vol: 0.06, at: 0.7, lp: 1600, swell: true }); },
  fanfare() { [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36], [7, 0.6], [12, 0.72]].forEach(([n, at], i) => tone(semi(392, n), semi(392, n), i > 4 ? 0.5 : 0.14, { wave: 'square', vol: 0.045, at })); },
  sulk() { [0, -1, -2, -3].forEach((n, i) => tone(semi(233, n), semi(233, n) * (i === 3 ? 0.92 : 0.99), i === 3 ? 0.8 : 0.3, { wave: 'sawtooth', vol: 0.045, at: i * 0.32 })); }, // wah wah wah waaah
};
