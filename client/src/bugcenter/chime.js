// v75: the Bug Center's healing jingle. Original: a rising six-note arpeggio on a soft square wave with a
// triangle echo, then a two-note "all better" sparkle. WebAudio only, no files, no borrowed tune.
let ac = null;
const ctx = () => {
  if (typeof window === 'undefined') return null;
  if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
  if (ac.state === 'suspended') ac.resume();
  return ac;
};
const semi = (f, n) => f * 2 ** (n / 12);
function note(a, f, at, dur, { wave = 'square', vol = 0.05 } = {}) {
  const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = wave; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
}
/** Semitone steps from A4 (440 Hz): A C# E A, then a little turn up to C# and a held E. */
export const HEAL_TUNE = [[0, 0, 0.16], [4, 0.17, 0.16], [7, 0.34, 0.16], [12, 0.51, 0.22], [11, 0.78, 0.14], [16, 0.95, 0.7]];
export function healChime() {
  const a = ctx(); if (!a) return false;
  for (const [n, at, dur] of HEAL_TUNE) { note(a, semi(440, n), at, dur); note(a, semi(440, n + 12), at + 0.02, dur * 0.8, { wave: 'triangle', vol: 0.025 }); }
  [0, 0.12].forEach((at, i) => note(a, semi(1760, i ? 7 : 4), 1.75 + at, 0.25, { wave: 'sine', vol: 0.04 }));
  return true;
}
/** A soft "pod clicks into the machine" blip. */
export function podBlip() { const a = ctx(); if (!a) return; note(a, 1320, 0, 0.07, { wave: 'square', vol: 0.03 }); note(a, 990, 0.06, 0.08, { wave: 'triangle', vol: 0.03 }); }
