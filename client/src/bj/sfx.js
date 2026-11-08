// v44 blackjack sounds: synthesized with Web Audio (no files). Mute lives in localStorage and is on the table header.
let ac = null;
const KEY = 'bba.bj.muted';
export const isMuted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* private mode */ } };
const ctx = () => { if (isMuted()) return null; if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); } if (ac.state === 'suspended') ac.resume(); return ac; };
function tone(f0, f1, dur, { wave = 'square', vol = 0.05, at = 0 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at; const o = a.createOscillator(), g = a.createGain();
  o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  deal() { tone(1400, 700, 0.05, { wave: 'triangle', vol: 0.06 }); },
  chip() { tone(2200, 1800, 0.04, { vol: 0.03 }); tone(2600, 2000, 0.04, { vol: 0.025, at: 0.05 }); },
  bust() { tone(220, 90, 0.35, { wave: 'sawtooth', vol: 0.05 }); },
  bj() { [0, 4, 7, 12].forEach((n, i) => tone(523 * 2 ** (n / 12), 523 * 2 ** (n / 12), 0.14, { vol: 0.05, at: i * 0.09 })); },
  win() { [0, 7].forEach((n, i) => tone(659 * 2 ** (n / 12), 659 * 2 ** (n / 12), 0.12, { wave: 'triangle', vol: 0.07, at: i * 0.1 })); },
  lose() { tone(330, 200, 0.2, { wave: 'triangle', vol: 0.05 }); },
};
