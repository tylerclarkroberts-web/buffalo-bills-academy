// Optional ambience for the mines: a low industrial hum and a geiger-style proximity tick, and, while the visitor
// is following you, a slow crossfade from the hum to synthesized strings (a tremolo violin cluster over a dissonant
// drone, slowly rising) with a quiet heartbeat. Nothing plays until the player turns sound on; everything runs
// through one master gain, so the sound toggle silences all of it. No stabs or screams: it creeps in over seconds.
export class MineAudio {
  constructor() { this.ctx = null; this.on = false; }
  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
      this.humBus = ctx.createGain(); this.humBus.gain.value = 1; this.humBus.connect(this.master);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(this.humBus);
      for (const [f, type, v] of [[55, 'sawtooth', 0.22], [110.6, 'square', 0.05], [82.4, 'triangle', 0.18]]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = v; o.connect(g); g.connect(lp); o.start();
      }
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18; const lg = ctx.createGain(); lg.gain.value = 60;
      lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    }
    this.ctx.resume();
    this.master.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.4);
    this.on = true;
    if (this.dreadOn) this.dread(true, { fresh: true });
    return true;
  }
  stop() { if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15); this.on = false; }
  tick(strength = 1) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1800 + Math.random() * 600;
    const g = c.createGain(); g.gain.setValueAtTime(0.05 * strength, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.04);
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
      S.bus.gain.cancelScheduledValues(t); S.bus.gain.setTargetAtTime(1, t, 1.6);
      this.humBus.gain.cancelScheduledValues(t); this.humBus.gain.setTargetAtTime(0.18, t, 1.4);
      // rising tension over ~30 s: the cluster brightens, slides up a little, the bow trembles faster
      for (const [param, from, to] of [[S.lp.frequency, 700, 2600], [S.detune, 0, 90], [S.trem.frequency, 6.5, 12]]) {
        param.cancelScheduledValues(t); param.setValueAtTime(from, t); param.linearRampToValueAtTime(to, t + 30);
      }
    } else if (this.strings) {
      this.strings.bus.gain.cancelScheduledValues(t); this.strings.bus.gain.setTargetAtTime(0, t, 1.2);
      this.humBus.gain.cancelScheduledValues(t); this.humBus.gain.setTargetAtTime(1, t, 1.2);
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
  dispose() { try { this.ctx?.close(); } catch { /* ignore */ } }
}
