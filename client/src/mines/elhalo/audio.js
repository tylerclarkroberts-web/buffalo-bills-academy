// EL HALO sound: everything is synthesised here with WebAudio, no recordings. An original loop: a two-trumpet
// melody in thirds (sawtooth "horns" with vibrato), a guitarrón-style bass doing oom-pah, vihuela-ish offbeat stabs,
// and a heavy kick/clap beat. Plus little sfx for guns, piñatas, the shield and the critters.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// D major, eight bars of eighths. null = rest, '-' = hold. Lead voice; the second horn plays a diatonic third below.
const LEAD = [
  69, '-', 66, 69, 74, '-', '-', '-',   74, 73, 71, '-', 67, '-', 71, '-',
  69, '-', 73, 76, 73, '-', 69, '-',    74, '-', '-', '-', null, null, 69, 71,
  78, '-', 76, 74, 76, '-', 78, '-',    79, '-', '-', 78, 76, '-', 74, '-',
  73, '-', 76, '-', 79, '-', 76, 73,    74, '-', '-', '-', null, null, null, null,
];
const SCALE = [62, 64, 66, 67, 69, 71, 73]; // D E F# G A B C#
function thirdBelow(n) {
  const pc = ((n - 62) % 12 + 12) % 12, oct = Math.floor((n - 62) / 12);
  const i = SCALE.findIndex((s) => (s - 62) === pc); if (i < 0) return n - 4;
  const j = i - 2; return j >= 0 ? SCALE[j] + oct * 12 : SCALE[j + 7] + (oct - 1) * 12;
}
const CHORDS = ['D', 'G', 'A', 'D', 'D', 'G', 'A7', 'D'];
const ROOT = { D: 50, G: 43, A: 45, A7: 45 };
const TRIAD = { D: [62, 66, 69], G: [62, 67, 71], A: [61, 64, 69], A7: [61, 64, 67] };

export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  const music = ctx.createGain(); music.gain.value = 0.22; music.connect(master);
  const sfx = ctx.createGain(); sfx.gain.value = 0.55; sfx.connect(master);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const nz = (dest, t, dur, { type = 'bandpass', f = 1200, q = 1, v = 0.5, f2 } = {}) => {
    const s = ctx.createBufferSource(); s.buffer = noise; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  };
  const tone = (dest, t, dur, f, { type = 'sine', v = 0.3, f2, a = 0.004 } = {}) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
  };
  const horn = (t, n, dur, v) => {
    const f = midi(n), out = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.05); lp.frequency.linearRampToValueAtTime(1700, t + dur);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(v, t + 0.03); out.gain.setValueAtTime(v * 0.85, t + dur - 0.04); out.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.06);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.6; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.009, t + Math.min(0.25, dur));
    vib.connect(vg);
    for (const [type, det] of [['sawtooth', -6], ['sawtooth', 5], ['square', 0]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; vg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = type === 'square' ? 0.25 : 0.5; o.connect(g).connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
    vib.start(t); vib.stop(t + dur + 0.1); lp.connect(out).connect(music);
  };

  let muted = false, playing = false, timer = 0, step = 0, nextT = 0;
  const BPM = 116, E = 60 / BPM / 2; // an eighth
  function schedule(t, s) {
    const bar = Math.floor(s / 8) % 8, e = s % 8, ch = CHORDS[bar];
    // beat: kick on 1 and 3 and the "and" of 4, clap on 2 and 4, shaker on every eighth
    if (e === 0 || e === 4 || e === 7) tone(music, t, 0.22, 130, { f2: 42, v: 0.9 });
    if (e === 2 || e === 6) { nz(music, t, 0.16, { f: 1800, q: 0.8, v: 0.5 }); nz(music, t + 0.012, 0.1, { f: 2400, q: 1, v: 0.3 }); }
    nz(music, t, 0.04, { type: 'highpass', f: 7000, v: e % 2 ? 0.12 : 0.2 });
    // guitarrón oom (root, fifth) and vihuela pah on the offbeats
    if (e === 0 || e === 4) { const r = ROOT[ch] + (e === 4 ? 7 : 0); tone(music, t, 0.35, midi(r - 12), { type: 'triangle', v: 0.55, a: 0.006 }); tone(music, t, 0.2, midi(r), { type: 'sawtooth', v: 0.06 }); }
    if (e % 2 === 1) for (const n of TRIAD[ch]) tone(music, t + (n % 3) * 0.006, 0.09, midi(n), { type: 'square', v: 0.035 });
    // horns
    const i = (bar * 8 + e) % LEAD.length, n = LEAD[i];
    if (typeof n === 'number') {
      let len = 1; while (LEAD[(i + len) % LEAD.length] === '-' && len < 8) len++;
      const dur = len * E * 0.92;
      horn(t, n, dur, 0.16); horn(t + 0.004, thirdBelow(n), dur, 0.12);
    }
  }
  function pump() {
    while (nextT < ctx.currentTime + 0.15) { schedule(nextT, step); step = (step + 1) % 64; nextT += E; }
  }
  const api = {
    ctx,
    resume() { if (ctx.state === 'suspended' && !muted) ctx.resume().catch(() => {}); },
    setMuted(m) { muted = m; if (m) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); },
    music(on) {
      if (on === playing) return; playing = on;
      if (on) { step = 0; nextT = ctx.currentTime + 0.08; pump(); timer = setInterval(pump, 30); } else clearInterval(timer);
    },
    rifle() { const t = ctx.currentTime; nz(sfx, t, 0.09, { f: 1500, q: 0.7, v: 0.55 }); tone(sfx, t, 0.08, 160, { f2: 60, v: 0.5, type: 'square' }); },
    pistol() { const t = ctx.currentTime; nz(sfx, t, 0.18, { f: 900, q: 0.6, v: 0.8 }); tone(sfx, t, 0.16, 120, { f2: 40, v: 0.7 }); nz(sfx, t + 0.02, 0.25, { type: 'highpass', f: 3000, v: 0.12 }); },
    empty() { tone(sfx, ctx.currentTime, 0.04, 1800, { type: 'square', v: 0.12 }); },
    reload() { const t = ctx.currentTime; nz(sfx, t, 0.05, { f: 3000, q: 4, v: 0.3 }); nz(sfx, t + 0.55, 0.06, { f: 2200, q: 4, v: 0.35 }); nz(sfx, t + 0.9, 0.05, { f: 3500, q: 5, v: 0.35 }); },
    swap() { nz(sfx, ctx.currentTime, 0.08, { f: 2500, q: 3, v: 0.25 }); },
    throw() { nz(sfx, ctx.currentTime, 0.2, { f: 600, f2: 2000, q: 1, v: 0.25 }); },
    boom() { const t = ctx.currentTime; tone(sfx, t, 0.6, 90, { f2: 30, v: 1 }); nz(sfx, t, 0.7, { type: 'lowpass', f: 2500, f2: 200, v: 0.9 }); for (let k = 0; k < 6; k++) tone(sfx, t + 0.05 + k * 0.04, 0.12, 900 + k * 260, { type: 'triangle', v: 0.08 }); },
    smack() { const t = ctx.currentTime; nz(sfx, t, 0.12, { f: 400, q: 1, v: 0.8 }); tone(sfx, t, 0.1, 200, { f2: 80, v: 0.5 }); },
    whoosh() { nz(sfx, ctx.currentTime, 0.18, { f: 500, f2: 1800, q: 2, v: 0.2 }); },
    hitBeast() { tone(sfx, ctx.currentTime, 0.08, 700 + Math.random() * 300, { f2: 400, type: 'triangle', v: 0.18 }); },
    hitBot() { const t = ctx.currentTime; tone(sfx, t, 0.12, 1300 + Math.random() * 400, { type: 'square', v: 0.07 }); tone(sfx, t, 0.15, 2100, { type: 'triangle', v: 0.06 }); },
    die(kind) { const t = ctx.currentTime; if (kind === 'luchabot') { for (let k = 0; k < 4; k++) tone(sfx, t + k * 0.05, 0.15, 1600 - k * 300, { type: 'square', v: 0.08 }); nz(sfx, t, 0.3, { f: 3000, q: 2, v: 0.25 }); } else { tone(sfx, t, 0.3, 900, { f2: 1500, type: 'triangle', v: 0.25 }); nz(sfx, t + 0.05, 0.3, { type: 'highpass', f: 4000, v: 0.2 }); } },
    bolt() { tone(sfx, ctx.currentTime, 0.18, 600, { f2: 1400, type: 'sawtooth', v: 0.06 }); },
    shieldHit() { tone(sfx, ctx.currentTime, 0.12, 1900, { f2: 1200, type: 'sine', v: 0.22 }); },
    hurt() { nz(sfx, ctx.currentTime, 0.12, { f: 300, q: 1, v: 0.5 }); },
    shieldDown() { const t = ctx.currentTime; for (let k = 0; k < 3; k++) tone(sfx, t + k * 0.16, 0.1, 880, { type: 'square', v: 0.12 }); },
    alarm() { tone(sfx, ctx.currentTime, 0.08, 1100, { type: 'square', v: 0.07 }); },
    recharge() { tone(sfx, ctx.currentTime, 1.1, 300, { f2: 1600, type: 'sine', v: 0.18, a: 0.08 }); },
    pickup() { const t = ctx.currentTime; tone(sfx, t, 0.08, 1320, { type: 'triangle', v: 0.2 }); tone(sfx, t + 0.07, 0.12, 1760, { type: 'triangle', v: 0.2 }); },
    wave() { const t = ctx.currentTime; [74, 78, 81, 86].forEach((n, k) => horn(t + k * 0.12, n, 0.14 + (k === 3 ? 0.4 : 0), 0.22)); },
    death() { const t = ctx.currentTime; [74, 73, 72, 71].forEach((n, k) => horn(t + k * 0.28, n - 12, 0.3 + (k === 3 ? 0.6 : 0), 0.22)); },
    hammer() { const t = ctx.currentTime; nz(sfx, t, 0.05, { f: 1800, q: 3, v: 0.5 }); tone(sfx, t, 0.06, 420, { f2: 200, type: 'square', v: 0.12 }); },
    crack() { const t = ctx.currentTime; nz(sfx, t, 0.16, { f: 700, q: 1.5, v: 0.6 }); nz(sfx, t + 0.05, 0.12, { f: 2400, q: 2, v: 0.25 }); },
    bless() { const t = ctx.currentTime; [76, 81, 85].forEach((n, k) => tone(sfx, t + k * 0.06, 0.5, midi(n), { type: 'sine', v: 0.08, a: 0.05 })); },
    hitmark() { tone(sfx, ctx.currentTime, 0.04, 2600, { type: 'triangle', v: 0.06 }); },
    close() { clearInterval(timer); ctx.close().catch(() => {}); },
  };
  return api;
}
