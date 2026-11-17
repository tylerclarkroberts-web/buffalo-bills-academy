// EL HALO sound. The background music is Tyler's own track (client/public/elhalo/musica.mp3, re-encoded to 96 kbps),
// looped through WebAudio so its volume works on phones too and it only starts after a tap. Everything else is
// synthesised here: guns, piñatas, the shield, the truck horn and the night things.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
export const MUSIC_URL = '/elhalo/musica.mp3';
export const MUSIC_LEVELS = [['ALTA', 0.5], ['BAJA', 0.18], ['OFF', 0]];

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

  let muted = false, playing = false, level = 0, el = null;
  function ensureEl() {
    if (el || typeof Audio === 'undefined') return el;
    el = new Audio(MUSIC_URL); el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    try { ctx.createMediaElementSource(el).connect(music); } catch { el.volume = 0.5; }
    return el;
  }
  function applyMusic() {
    music.gain.value = MUSIC_LEVELS[level][1];
    const want = playing && !muted && MUSIC_LEVELS[level][1] > 0;
    if (want) { ensureEl(); el.play().catch(() => {}); } else if (el) el.pause();
  }
  const api = {
    ctx,
    resume() { if (ctx.state === 'suspended' && !muted) ctx.resume().catch(() => {}); },
    setMuted(m) { muted = m; if (m) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); applyMusic(); },
    music(on) { if (on === playing) return; playing = on; applyMusic(); },  // call from a tap: browsers block autoplay
    setMusicLevel(i) { level = ((i % MUSIC_LEVELS.length) + MUSIC_LEVELS.length) % MUSIC_LEVELS.length; applyMusic(); return level; },
    get musicLevel() { return level; },
    get musicPlaying() { return !!el && !el.paused; },
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
    // v3: the volador's shout, the big landings, the gordo's huff, a street dog, the elote man's little horn
    aguila() { const t = ctx.currentTime; horn(t, 79, 0.14, 0.2); horn(t + 0.14, 86, 0.5, 0.24); nz(sfx, t, 0.5, { f: 400, f2: 2200, q: 1.2, v: 0.25 }); },
    thud(big) { const t = ctx.currentTime; tone(sfx, t, big ? 0.9 : 0.6, big ? 48 : 70, { f2: 20, v: 1 }); nz(sfx, t, big ? 0.8 : 0.5, { type: 'lowpass', f: big ? 700 : 1100, f2: 80, v: 1 }); },
    huff() { const t = ctx.currentTime; tone(sfx, t, 0.5, 130, { f2: 85, type: 'sawtooth', v: 0.22, a: 0.05 }); nz(sfx, t, 0.4, { type: 'lowpass', f: 400, v: 0.4 }); },
    bark() { const t = ctx.currentTime; for (const k of [0, 0.16]) { tone(sfx, t + k, 0.09, 520, { f2: 300, type: 'square', v: 0.08 }); nz(sfx, t + k, 0.08, { f: 900, q: 2, v: 0.2 }); } },
    elote() { const t = ctx.currentTime; tone(sfx, t, 0.25, 1568, { type: 'triangle', v: 0.12 }); tone(sfx, t + 0.12, 0.35, 2093, { type: 'triangle', v: 0.1 }); },
    bless() { const t = ctx.currentTime; [76, 81, 85].forEach((n, k) => tone(sfx, t + k * 0.06, 0.5, midi(n), { type: 'sine', v: 0.08, a: 0.05 })); },
    hitmark() { tone(sfx, ctx.currentTime, 0.04, 2600, { type: 'triangle', v: 0.06 }); },
    // the new guns
    gun(id) {
      const t = ctx.currentTime;
      switch (id) {
        case 'rifle': return api.rifle();
        case 'pistol': case 'torreta': return id === 'pistol' ? api.pistol() : (nz(sfx, t, 0.07, { f: 1100, q: 0.6, v: 0.6 }), tone(sfx, t, 0.07, 110, { f2: 45, v: 0.6, type: 'square' }));
        case 'rafaga': nz(sfx, t, 0.07, { f: 1700, q: 0.9, v: 0.5 }); return tone(sfx, t, 0.06, 240, { f2: 90, v: 0.35, type: 'square' });
        case 'escopeta': case 'escopetita': nz(sfx, t, 0.35, { type: 'lowpass', f: 2200, f2: 300, v: 1 }); tone(sfx, t, 0.25, 90, { f2: 35, v: 0.9 }); if (id === 'escopeta') nz(sfx, t + 0.42, 0.06, { f: 2400, q: 4, v: 0.3 }); return;
        case 'francotirador': nz(sfx, t, 0.4, { f: 700, q: 0.5, v: 1 }); tone(sfx, t, 0.3, 140, { f2: 35, v: 0.9 }); return nz(sfx, t + 0.05, 0.8, { type: 'highpass', f: 2500, v: 0.18 });
        case 'chispas': return tone(sfx, t, 0.16, 900, { f2: 260, type: 'sawtooth', v: 0.14 });
        case 'agujas': tone(sfx, t, 0.06, 2600, { f2: 1700, type: 'triangle', v: 0.1 }); return tone(sfx, t, 0.05, 3400, { type: 'sine', v: 0.06 });
        case 'cohetes': nz(sfx, t, 0.5, { f: 400, f2: 1400, q: 0.7, v: 0.7 }); return tone(sfx, t, 0.2, 70, { v: 0.6 });
        case 'laser': tone(sfx, t, 0.5, 220, { f2: 1800, type: 'sawtooth', v: 0.2 }); return nz(sfx, t, 0.5, { f: 3000, q: 2, v: 0.3 });
        case 'machete': case 'martillo': return api.whoosh();
        default: return api.rifle();
      }
    },
    charge() { tone(sfx, ctx.currentTime, 0.8, 200, { f2: 1600, type: 'square', v: 0.05, a: 0.05 }); },
    lunge() { nz(sfx, ctx.currentTime, 0.25, { f: 400, f2: 2600, q: 1.5, v: 0.4 }); },
    slash() { const t = ctx.currentTime; tone(sfx, t, 0.2, 1400, { f2: 300, type: 'sawtooth', v: 0.15 }); nz(sfx, t, 0.15, { f: 2600, q: 2, v: 0.4 }); },
    slam() { const t = ctx.currentTime; tone(sfx, t, 0.7, 70, { f2: 25, v: 1 }); nz(sfx, t, 0.6, { type: 'lowpass', f: 900, f2: 100, v: 1 }); tone(sfx, t, 0.5, 500, { f2: 120, type: 'triangle', v: 0.2 }); },
    stick() { const t = ctx.currentTime; tone(sfx, t, 0.08, 500, { type: 'square', v: 0.1 }); tone(sfx, t + 0.09, 0.08, 500, { type: 'square', v: 0.1 }); },
    bounce() { tone(sfx, ctx.currentTime, 0.05, 300, { f2: 200, type: 'triangle', v: 0.15 }); },
    combine() { const t = ctx.currentTime; for (let k = 0; k < 5; k++) tone(sfx, t + k * 0.03, 0.1, 3000 - k * 300, { type: 'triangle', v: 0.1 }); api.boom(); },
    headshot() { const t = ctx.currentTime; tone(sfx, t, 0.07, 2900, { type: 'square', v: 0.09 }); tone(sfx, t + 0.05, 0.16, 4200, { type: 'sine', v: 0.14 }); },
    // the night things
    shriek() { const t = ctx.currentTime; tone(sfx, t, 0.45, 1900, { f2: 3400, type: 'sawtooth', v: 0.09 }); tone(sfx, t, 0.45, 2300, { f2: 1500, type: 'square', v: 0.05 }); nz(sfx, t, 0.4, { f: 3500, q: 3, v: 0.25 }); },
    wail() { const t = ctx.currentTime; tone(sfx, t, 2.2, 520, { f2: 360, type: 'sine', v: 0.16, a: 0.4 }); tone(sfx, t + 0.05, 2.2, 780, { f2: 540, type: 'triangle', v: 0.06, a: 0.5 }); nz(sfx, t, 2.0, { f: 900, q: 6, v: 0.08 }); },
    screech() { const t = ctx.currentTime; tone(sfx, t, 0.6, 2400, { f2: 1200, type: 'sawtooth', v: 0.08 }); nz(sfx, t, 0.6, { f: 2800, q: 4, v: 0.3 }); },
    growl() { const t = ctx.currentTime; tone(sfx, t, 0.9, 70, { f2: 55, type: 'sawtooth', v: 0.25 }); nz(sfx, t, 0.8, { type: 'lowpass', f: 300, v: 0.6 }); },
    howl() { tone(sfx, ctx.currentTime, 1.4, 420, { f2: 760, type: 'triangle', v: 0.15, a: 0.3 }); },
    honk() { const t = ctx.currentTime; for (const k of [0, 0.25]) { tone(sfx, t + k, 0.2, 392, { type: 'square', v: 0.1 }); tone(sfx, t + k, 0.2, 494, { type: 'square', v: 0.08 }); } },
    engine() { tone(sfx, ctx.currentTime, 0.5, 55, { f2: 80, type: 'sawtooth', v: 0.08 }); },
    beep(hi) { tone(sfx, ctx.currentTime, 0.12, hi ? 1320 : 880, { type: 'square', v: 0.08 }); },
    night() { const t = ctx.currentTime; [62, 61, 57, 56].forEach((n, k) => tone(sfx, t + k * 0.35, 0.8, midi(n - 12), { type: 'triangle', v: 0.18, a: 0.1 })); },
    close() { if (el) { el.pause(); el.src = ''; } ctx.close().catch(() => {}); },
  };
  return api;
}
