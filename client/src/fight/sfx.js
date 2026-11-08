// Tiny synthesized fight sounds (thwacks, blocks, the KO gong). Off with one tap; remembered.
const KEY = 'bba.fightSound';
let ctx = null;
export const soundOn = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setSound = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } };
function ac() { if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); } if (ctx.state === 'suspended') ctx.resume(); return ctx; }
function tone(f0, f1, dur, type = 'square', vol = 0.12) {
  const c = ac(); if (!c) return; const t = c.currentTime;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.18, freq = 900) {
  const c = ac(); if (!c) return; const t = c.currentTime;
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
}
export function play(e) {
  if (!soundOn()) return;
  try {
    if (e.k === 'hit') { noise(0.09, e.who === 'p' ? 0.28 : 0.2, e.who === 'p' ? 500 : 1400); tone(e.who === 'p' ? 140 : 220 + Math.min(12, e.n || 1) * 30, 60, 0.12, 'triangle', 0.16); }
    else if (e.k === 'block') tone(1200, 900, 0.05, 'square', 0.05);
    else if (e.k === 'swing') noise(0.05, 0.05, 2500);
    else if (e.k === 'breaker') tone(300, 1200, 0.25, 'sawtooth', 0.1);
    else if (e.k === 'fight' || e.k === 'finishhim') { tone(330, 330, 0.18, 'square', 0.09); setTimeout(() => tone(495, 495, 0.3, 'square', 0.09), 160); }
    else if (e.k === 'finished') { tone(392, 784, 0.5, 'square', 0.1); setTimeout(() => tone(523, 1046, 0.6, 'square', 0.1), 220); }
    else if (e.k === 'rip') { noise(0.35, 0.3, 3200); setTimeout(() => tone(90, 45, 0.6, 'sawtooth', 0.14), 120); }
    else if (e.k === 'thrustcue') tone(180, 260, 0.18, 'triangle', 0.1);
    else if (e.k === 'thrust') { tone(70, 35, 0.4, 'sine', 0.3); noise(0.25, 0.22, 400); setTimeout(() => tone(880, 660, 0.12, 'square', 0.05), 80); }
    else if (e.k === 'ko' || e.k === 'time') tone(220, 55, 0.9, 'sawtooth', 0.12);
  } catch { /* audio is optional */ }
}

/** The KO ending's synthesized sounds (fatal.js): wet squelch, blade slash, bass thump, heartbeat. No voices. */
export function gore(name) {
  if (!soundOn()) return;
  try {
    if (name === 'squelch') { noise(0.22, 0.32, 380); tone(160, 50, 0.22, 'sine', 0.22); setTimeout(() => noise(0.12, 0.2, 700), 70); }
    else if (name === 'rip') { noise(0.3, 0.26, 2200); tone(120, 60, 0.3, 'sawtooth', 0.08); }
    else if (name === 'slash') { noise(0.18, 0.3, 6000); tone(1800, 300, 0.2, 'sawtooth', 0.07); }
    else if (name === 'thump') { tone(75, 32, 0.38, 'sine', 0.42); noise(0.08, 0.16, 250); }
    else if (name === 'crunch') { noise(0.14, 0.34, 1600); tone(240, 70, 0.12, 'square', 0.1); }
    else if (name === 'beat') { tone(60, 40, 0.14, 'sine', 0.5); setTimeout(() => tone(55, 38, 0.16, 'sine', 0.42), 170); }
    else if (name === 'slurp') { tone(220, 520, 0.26, 'triangle', 0.08); noise(0.2, 0.1, 900); }
    else if (name === 'fatality') { tone(110, 110, 0.9, 'sawtooth', 0.09); tone(165, 165, 0.9, 'sawtooth', 0.07); tone(55, 40, 1.1, 'sine', 0.3); }
    else if (name === 'finish') { tone(98, 49, 1.0, 'sawtooth', 0.12); noise(0.4, 0.12, 300); }
    else if (name === 'ko') { tone(330, 110, 0.6, 'triangle', 0.12); setTimeout(() => tone(660, 990, 0.25, 'square', 0.05), 400); }
  } catch { /* audio is optional */ }
}

/** v29: the finisher gags' sounds, all synthesized (no samples): applause, air horn, boing, kazoo, scratch, whistles. */
function glide(f0, f1, dur, type, vol, delay = 0, vib = 0) {
  const c = ac(); if (!c) return; const t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (vib) { const l = c.createOscillator(); l.frequency.value = vib; const lg = c.createGain(); lg.gain.value = f0 * 0.04; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.02); }
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function burstNoise(dur, vol, type, freq, q = 1, delay = 0) {
  const c = ac(); if (!c) return; const t = c.currentTime + delay;
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  return { f, t };
}
export function gag(name) {
  if (!soundOn()) return;
  try {
    if (name === 'applause') { for (let i = 0; i < 46; i++) burstNoise(0.05, 0.05 + Math.random() * 0.05, 'bandpass', 1200 + Math.random() * 1800, 1.2, Math.random() * 1.7); }
    else if (name === 'airhorn') { for (const f of [233, 294, 349]) glide(f, f * 0.98, 0.7, 'sawtooth', 0.05); }
    else if (name === 'smash') { tone(70, 30, 0.45, 'sine', 0.45); burstNoise(0.3, 0.3, 'lowpass', 900); setTimeout(() => gag('airhorn'), 120); }
    else if (name === 'boing') { glide(140, 520, 0.18, 'triangle', 0.16, 0, 18); glide(520, 260, 0.3, 'triangle', 0.1, 0.18, 22); }
    else if (name === 'whistle') glide(500, 1700, 0.4, 'sine', 0.09);
    else if (name === 'drop') glide(1900, 300, 0.7, 'sine', 0.08);
    else if (name === 'scratch') { const r = burstNoise(0.28, 0.32, 'bandpass', 600, 3); if (r) { r.f.frequency.setValueAtTime(400, r.t); r.f.frequency.linearRampToValueAtTime(2600, r.t + 0.1); r.f.frequency.linearRampToValueAtTime(500, r.t + 0.26); } }
    else if (name === 'whoosh') { const r = burstNoise(0.45, 0.22, 'bandpass', 500, 0.8); if (r) r.f.frequency.exponentialRampToValueAtTime(3000, r.t + 0.4); }
    else if (name === 'bonk') { glide(520, 160, 0.16, 'square', 0.1); tone(90, 45, 0.3, 'sine', 0.4); }
    else if (name === 'rumble') { tone(45, 30, 0.5, 'sawtooth', 0.12); burstNoise(0.5, 0.12, 'lowpass', 200); }
    else if (name === 'chips') { tone(60, 30, 0.5, 'sine', 0.45); burstNoise(0.35, 0.3, 'lowpass', 1600); for (let i = 0; i < 26; i++) glide(2400 + Math.random() * 1800, 2200, 0.03, 'square', 0.025, 0.25 + Math.random() * 1.1); }
    else if (name === 'inflate') glide(180, 720, 1.0, 'sawtooth', 0.035, 0, 30);
    else if (name === 'kazoo') { [392, 440, 392, 330, 294].forEach((f, i) => glide(f, f, 0.2, 'sawtooth', 0.05, i * 0.22, 7)); }
    else if (name === 'boom') { tone(110, 40, 0.3, 'sine', 0.35); burstNoise(0.25, 0.25, 'lowpass', 2400); }
    else if (name === 'pop') { burstNoise(0.12, 0.5, 'highpass', 900); tone(300, 60, 0.12, 'square', 0.1); }
    else if (name === 'thump') { tone(75, 32, 0.38, 'sine', 0.42); burstNoise(0.08, 0.16, 'lowpass', 250); }
    else if (name === 'prompt') { tone(110, 110, 0.5, 'sawtooth', 0.08); setTimeout(() => tone(98, 49, 0.6, 'sawtooth', 0.1), 260); }
    else if (name === 'tada') { glide(523, 523, 0.14, 'square', 0.06); glide(659, 659, 0.14, 'square', 0.06, 0.14); glide(784, 784, 0.4, 'square', 0.07, 0.28); }
  } catch { /* audio is optional */ }
}
