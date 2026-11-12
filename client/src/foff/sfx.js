// Foff's Bachelor Party: synthesized sounds only (Web Audio, no files), like the other rooms.
let ac = null, on = true;
const ctx = () => { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); } if (ac.state === 'suspended') ac.resume(); return ac; };
export const setSound = (v) => { on = !!v; };
function tone(f0, f1, dur, { wave = 'sine', vol = 0.1, at = 0 } = {}) {
  const a = on && ctx(); if (!a) return;
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = wave; o.frequency.setValueAtTime(Math.max(20, f0), t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.1, at = 0, lp = 2000 } = {}) {
  const a = on && ctx(); if (!a) return;
  const t = a.currentTime + at, b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
export const sfx = {
  tick() { tone(660, 660, 0.04, { wave: 'square', vol: 0.03 }); },
  thwack(big) { noise(0.09, { vol: 0.2, lp: 5000 }); tone(big ? 520 : 380, 90, 0.14, { wave: 'triangle', vol: 0.12 }); },
  putt() { tone(900, 700, 0.05, { wave: 'triangle', vol: 0.08 }); },
  thud() { noise(0.1, { vol: 0.1, lp: 500 }); },
  sand() { noise(0.3, { vol: 0.1, lp: 1400 }); },
  splash() { noise(0.5, { vol: 0.14, lp: 2600 }); tone(500, 120, 0.3, { vol: 0.05 }); },
  timber() { noise(0.12, { vol: 0.12, lp: 900 }); tone(180, 90, 0.2, { wave: 'square', vol: 0.05, at: 0.05 }); },
  cup() { tone(700, 500, 0.06, { wave: 'triangle', vol: 0.1 }); tone(520, 380, 0.08, { wave: 'triangle', vol: 0.1, at: 0.07 }); [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, { wave: 'square', vol: 0.05, at: 0.25 + i * 0.1 })); },
  wow() { [392, 494, 587].forEach((f, i) => tone(f, f * 1.02, 0.2, { wave: 'triangle', vol: 0.06, at: i * 0.07 })); },
  gallop() { for (let i = 0; i < 6; i++) noise(0.05, { vol: 0.14, at: i * 0.11 + (i % 3 === 2 ? 0.04 : 0), lp: 700 }); tone(300, 1200, 0.5, { wave: 'sawtooth', vol: 0.04, at: 0.1 }); },
  win() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.2, { wave: 'square', vol: 0.06, at: i * 0.13 })); },
  nope() { tone(220, 110, 0.4, { wave: 'sawtooth', vol: 0.05 }); },
};
