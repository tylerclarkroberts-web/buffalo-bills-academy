// Optional ambience for the mines: a low industrial hum and the odd drip (its own of each for every shaft), a geiger click, and, while the visitor
// is following you, a slow crossfade from the hum to synthesized strings (a tremolo violin cluster over a dissonant
// drone, slowly rising) with a quiet heartbeat. Nothing plays until the player turns sound on; everything runs
// through one master gain, so the sound toggle silences all of it. No stabs or screams: when he arrives the mine
// goes quiet, something tolls once, and the strings come in over the next few seconds.
// The hum, shaft by shaft in elevator order (7, 8, 12, Earl's Level): each one lower and slower than the last,
// with more in it that does not belong. Shaft 7 is an open fifth. Shaft 8 is the same a tone down with a slow beat
// under it. Shaft 12 swaps the fifth for a tritone. Earl's Level adds a note a semitone off the root.
// `voices` are [frequency, wave, level]; `cutoff` is the low-pass; `breath` and `sweep` are how it slowly opens and closes.
const HUMS = [
  { voices: [[55, 'sawtooth', 0.22], [110.6, 'square', 0.05], [82.4, 'triangle', 0.18]], cutoff: 260, breath: 0.18, sweep: 60 },
  { voices: [[49, 'sawtooth', 0.23], [98.7, 'square', 0.05], [73.4, 'triangle', 0.18], [49.7, 'sine', 0.1]], cutoff: 245, breath: 0.15, sweep: 65 },
  { voices: [[43.65, 'sawtooth', 0.25], [87.9, 'square', 0.05], [61.7, 'triangle', 0.18], [44.6, 'sine', 0.13]], cutoff: 230, breath: 0.12, sweep: 75 },
  { voices: [[36.7, 'sawtooth', 0.28], [73.9, 'square', 0.05], [51.9, 'triangle', 0.19], [38.9, 'sawtooth', 0.1], [37.3, 'sine', 0.14]], cutoff: 215, breath: 0.08, sweep: 90 },
];
// A drop landing somewhere off in the dark, shaft by shaft. Shaft 7: a bright plink now and then. Shaft 8 is the
// damp one: lower, wetter, often two at a time, and far more of them. Shaft 12: a heavy drop that hisses where it
// lands. Earl's Level: rare, and it sounds like it fell a long way; the tunnel keeps repeating it.
// `every` is seconds between drips, `pitch` where the note starts and `rise` where it ends up (as a multiple),
// `echo` and `tail` the tunnel's delay and how much of it comes back, `twice` the chance of a second drop.
const DRIPS = [
  { every: [5, 12], pitch: 520, rise: 2.4, len: 0.09, vol: 0.3, echo: 0.19, tail: 0.3, twice: 0.15 },
  { every: [2.5, 7], pitch: 380, rise: 2.2, len: 0.12, vol: 0.32, echo: 0.27, tail: 0.5, twice: 0.6 },
  { every: [6, 13], pitch: 260, rise: 1.7, len: 0.14, vol: 0.34, echo: 0.33, tail: 0.45, twice: 0.1, hiss: 0.5 },
  { every: [9, 20], pitch: 120, rise: 0.6, len: 0.4, vol: 0.5, echo: 0.62, tail: 0.68, twice: 0 },
];

export class MineAudio {
  constructor() { this.ctx = null; this.on = false; this.depth = 0; }
  /** Which shaft the hum is for (0 = Shaft 7 ... 3 = Earl's Level). Takes effect at once if sound is running. */
  setDepth(depth = 0) { this.depth = depth; if (this.ctx && this.hum?.depth !== depth) this.buildHum(); }
  /** Down the shaft: its hum, and its drips for as long as you are below. */
  enter(depth = 0) { this.setDepth(depth); this.below = true; this.nextDrip(); }
  /** Back at the shift office: the Shaft 7 hum, and nothing dripping. */
  leave() { this.below = false; clearTimeout(this.dripTimer); this.setDepth(0); }
  nextDrip() {
    const [a, b] = (DRIPS[this.depth] || DRIPS[0]).every;
    clearTimeout(this.dripTimer);
    this.dripTimer = setTimeout(() => { if (!this.below) return; this.drip(); this.nextDrip(); }, (a + Math.random() * (b - a)) * 1000);
  }
  /** One drip (sometimes two) and what the tunnel does with the sound. */
  drip() {
    if (!this.on || !this.ctx || this.dreadOn) return; // nothing drips while he is here
    const c = this.ctx, p = DRIPS[this.depth] || DRIPS[0];
    if (!this.dripBus) {
      const bus = (this.dripBus = c.createGain()), delay = (this.dripDelay = c.createDelay(1)), back = (this.dripBack = c.createGain());
      const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 1800;
      bus.connect(this.master); bus.connect(delay); delay.connect(damp); damp.connect(back); back.connect(delay); back.connect(this.master);
    }
    this.dripDelay.delayTime.value = p.echo; this.dripBack.gain.value = p.tail;
    for (let k = 0, n = Math.random() < p.twice ? 2 : 1; k < n; k++) {
      const t = c.currentTime + k * (0.16 + Math.random() * 0.1), f = p.pitch * (0.85 + Math.random() * 0.3);
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * p.rise, t + p.len * 0.5);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(p.vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + p.len);
      o.connect(g); g.connect(this.dripBus); o.start(t); o.stop(t + p.len + 0.02);
      if (p.hiss) { // acid on rock
        const buf = c.createBuffer(1, Math.ceil(c.sampleRate * p.hiss), c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
        const s = c.createBufferSource(); s.buffer = buf; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
        const hg = c.createGain(); hg.gain.value = 0.09; s.connect(hp); hp.connect(hg); hg.connect(this.dripBus); s.start(t + 0.03);
      }
    }
  }
  /** (Re)build the hum for the current shaft; the old one fades out under the new. */
  buildHum() {
    const c = this.ctx, t = c.currentTime, h = HUMS[this.depth] || HUMS[0], old = this.hum;
    if (old) {
      old.out.gain.setTargetAtTime(0, t, 0.5);
      setTimeout(() => { try { for (const o of old.oscs) o.stop(); old.out.disconnect(); } catch { /* already closed */ } }, 3000);
    }
    const out = c.createGain(); out.gain.value = old ? 0 : 1; if (old) out.gain.setTargetAtTime(1, t, 0.5); out.connect(this.humBus);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = h.cutoff; lp.connect(out);
    const oscs = h.voices.map(([f, type, v]) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = v; o.connect(g); g.connect(lp); o.start(); return o;
    });
    const lfo = c.createOscillator(); lfo.frequency.value = h.breath; const lg = c.createGain(); lg.gain.value = h.sweep;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); oscs.push(lfo);
    this.hum = { out, oscs, depth: this.depth };
  }
  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
      this.humBus = ctx.createGain(); this.humBus.gain.value = 1; this.humBus.connect(this.master);
      this.buildHum();
    }
    this.ctx.resume();
    this.master.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.4);
    this.on = true;
    if (this.dreadOn) this.dread(true, { fresh: true });
    return true;
  }
  stop() { if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15); this.on = false; }
  /** One geiger click: a couple of milliseconds of noise through a small speaker that rings a little. */
  tick(strength = 1) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx;
    if (!this.clickBuf) {
      const b = (this.clickBuf = c.createBuffer(1, Math.ceil(c.sampleRate * 0.012), c.sampleRate)), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.0015));
    }
    const s = c.createBufferSource(); s.buffer = this.clickBuf; s.playbackRate.value = 0.85 + Math.random() * 0.3;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600 + Math.random() * 900; f.Q.value = 3;
    const g = c.createGain(); g.gain.value = 0.55 * strength;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(c.currentTime);
  }
  chunk() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const buf = c.createBuffer(1, c.sampleRate * 0.12, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900;
    const g = c.createGain(); g.gain.value = 0.5; s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  /** Crossfade the hum to the strings (on) or back (off). Remembered while muted; applied when sound comes on. */
  dread(on, { fresh = false } = {}) {
    const was = this.dreadOn; this.dreadOn = on;
    if (!this.ctx || (!fresh && was === on)) return;
    const c = this.ctx, t = c.currentTime;
    if (on) {
      if (!this.strings) this.buildStrings();
      const S = this.strings;
      // He is here: the hum drops out from under you, something tolls once a long way down, and only then the strings.
      this.humBus.gain.cancelScheduledValues(t); this.humBus.gain.setTargetAtTime(0.05, t, 0.12);
      if (!fresh) this.toll(t + 0.35);
      S.bus.gain.cancelScheduledValues(t); S.bus.gain.setTargetAtTime(2.2, t + (fresh ? 0 : 1.1), 0.9); // as loud as the hum it replaces
      // rising tension over ~30 s: the cluster brightens, slides up a little, the bow trembles faster
      for (const [param, from, to] of [[S.lp.frequency, 700, 2600], [S.detune, 0, 90], [S.trem.frequency, 6.5, 12]]) {
        param.cancelScheduledValues(t); param.setValueAtTime(from, t); param.linearRampToValueAtTime(to, t + 30);
      }
    } else if (this.strings) {
      this.strings.bus.gain.cancelScheduledValues(t); this.strings.bus.gain.setTargetAtTime(0, t, 1.2);
      this.humBus.gain.cancelScheduledValues(t); this.humBus.gain.setTargetAtTime(1, t, 1.2);
    }
  }
  /** One low toll, like a bell far too big for the tunnel: a few partials that do not agree, dying away over seconds. */
  toll(at) {
    const c = this.ctx, out = c.createGain(); out.gain.value = 0.6; out.connect(this.master);
    for (const [ratio, vol, secs] of [[1, 0.5, 6], [2.0, 0.3, 4.5], [2.76, 0.22, 3.2], [5.4, 0.09, 1.6]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 46 * ratio;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + secs);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + secs + 0.1);
    }
  }
  buildStrings() {
    const c = this.ctx;
    const bus = c.createGain(); bus.gain.value = 0; bus.connect(this.master);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.7; lp.connect(bus);
    // violins: a close cluster (D5, Eb5, E5, F5) of slightly detuned saws with a fast tremolo on their level
    const cluster = c.createGain(); cluster.gain.value = 0.5; cluster.connect(lp);
    const trem = c.createOscillator(); trem.frequency.value = 6.5;
    const tremDepth = c.createGain(); tremDepth.gain.value = 0.22; trem.connect(tremDepth); tremDepth.connect(cluster.gain); trem.start();
    const detune = c.createConstantSource ? c.createConstantSource() : null;
    if (detune) { detune.offset.value = 0; detune.start(); }
    for (const f of [587.3, 622.3, 659.3, 698.5]) for (const cents of [-7, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
      if (detune) detune.connect(o.detune);
      const g = c.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(cluster); o.start();
    }
    // cellos and basses: a low tritone drone (D2 against G#2) with a slow swell
    const drone = c.createGain(); drone.gain.value = 0.6; drone.connect(lp);
    const swell = c.createOscillator(); swell.frequency.value = 0.07; const sw = c.createGain(); sw.gain.value = 0.25;
    swell.connect(sw); sw.connect(drone.gain); swell.start();
    for (const [f, v] of [[73.4, 0.16], [103.8, 0.12], [146.8, 0.07]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = v; o.connect(g); g.connect(drone); o.start();
    }
    this.strings = { bus, lp, trem, detune: detune ? detune.offset : c.createGain().gain };
  }
  /** One quiet lub-dub. level 0..1: how close he is. */
  heartbeat(level = 0.5) {
    if (!this.on || !this.ctx || !this.dreadOn) return;
    const c = this.ctx, t = c.currentTime;
    for (const [at, v] of [[0, 1], [0.24, 0.7]]) {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(62, t + at); o.frequency.exponentialRampToValueAtTime(38, t + at + 0.16);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime((0.18 + 0.27 * level) * v, t + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.2);
      o.connect(g); g.connect(this.master); o.start(t + at); o.stop(t + at + 0.25);
    }
  }
  /** A loud goat bleat. Goes through the master gain, so the sound toggle silences it. Louder than a drip. */
  bleat() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 720; bp.Q.value = 3.4;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.18);
    g.gain.setValueAtTime(0.55, t + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    bp.connect(lp); lp.connect(g); g.connect(this.master);
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(340, t);
    o.frequency.exponentialRampToValueAtTime(250, t + 0.1);
    o.frequency.setValueAtTime(300, t + 0.16);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.7);
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 8.5;
    const lg = c.createGain(); lg.gain.value = 22;
    lfo.connect(lg); lg.connect(o.frequency);
    // a second, slightly higher voice makes the "meh-eh-eh" nasal
    const o2 = c.createOscillator(); o2.type = 'square';
    o2.frequency.setValueAtTime(510, t);
    o2.frequency.exponentialRampToValueAtTime(380, t + 0.7);
    const g2 = c.createGain(); g2.gain.value = 0.18;
    o2.connect(g2); g2.connect(bp);
    o.connect(bp);
    o.start(t); o.stop(t + 0.8);
    o2.start(t); o2.stop(t + 0.8);
    lfo.start(t); lfo.stop(t + 0.8);
  }
  dispose() { clearTimeout(this.dripTimer); try { this.ctx?.close(); } catch { /* ignore */ } }
}
