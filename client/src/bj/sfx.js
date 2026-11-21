// v44 blackjack sounds: synthesized with Web Audio (no files). Mute lives in localStorage and is on the table header.
// iOS Safari keeps AudioContext suspended until a user gesture; unlockSfx() must run from one.
let ac = null;
let unlocked = false;
const KEY = 'bba.bj.muted';
export const isMuted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* private mode */ } };
const Ctor = () => (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
const ctx = () => {
  if (isMuted()) return null;
  const A = Ctor();
  if (!A) return null;
  if (!ac) { try { ac = new A(); } catch { return null; } }
  if (ac.state === 'suspended') { try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* iOS may reject outside a gesture */ } }
  return ac;
};
/** Play a silent buffer from a user gesture so later deal/flip/chip sounds can start on iOS. Safe to call often. */
export function unlockSfx() {
  try {
    const a = ctx();
    if (!a) return false;
    if (a.state === 'suspended') { const p = a.resume(); if (p && p.catch) p.catch(() => {}); }
    if (!unlocked) {
      const buf = a.createBuffer(1, 1, a.sampleRate || 22050);
      const src = a.createBufferSource();
      src.buffer = buf;
      src.connect(a.destination);
      src.start(0);
      unlocked = true;
    }
    return a.state !== 'suspended';
  } catch {
    return false;
  }
}
function tone(f0, f1, dur, { wave = 'square', vol = 0.05, at = 0 } = {}) {
  const a = ctx(); if (!a) return;
  if (a.state === 'suspended') return; // never throw; wait for unlockSfx from a gesture
  const t = a.currentTime + at; const o = a.createOscillator(), g = a.createGain();
  o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  deal() { tone(1400, 700, 0.05, { wave: 'triangle', vol: 0.06 }); },
  flip() { tone(900, 1400, 0.08, { wave: 'triangle', vol: 0.05 }); tone(1600, 900, 0.07, { wave: 'sine', vol: 0.03, at: 0.05 }); },
  snap() { tone(1800, 1100, 0.04, { wave: 'triangle', vol: 0.05 }); },
  shuffle() { [0, 0.07, 0.14, 0.22].forEach((at) => tone(700, 400, 0.05, { wave: 'triangle', vol: 0.03, at })); },
  chip() { tone(2200, 1800, 0.04, { vol: 0.03 }); tone(2600, 2000, 0.04, { vol: 0.025, at: 0.05 }); },
  bust() { tone(220, 90, 0.35, { wave: 'sawtooth', vol: 0.05 }); },
  bj() { [0, 4, 7, 12].forEach((n, i) => tone(523 * 2 ** (n / 12), 523 * 2 ** (n / 12), 0.14, { vol: 0.05, at: i * 0.09 })); },
  win() { [0, 7].forEach((n, i) => tone(659 * 2 ** (n / 12), 659 * 2 ** (n / 12), 0.12, { wave: 'triangle', vol: 0.07, at: i * 0.1 })); },
  lose() { tone(330, 200, 0.2, { wave: 'triangle', vol: 0.05 }); },
  footsteps() {
    [0, 0.18, 0.34, 0.55].forEach((at, i) => tone(110 - i * 6, 70, 0.08, { wave: 'sine', vol: 0.04, at }));
  },
  loom() { tone(90, 60, 0.4, { wave: 'sine', vol: 0.06 }); tone(180, 140, 0.25, { wave: 'triangle', vol: 0.03, at: 0.05 }); },
};
