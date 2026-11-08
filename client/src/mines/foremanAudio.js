// v45: the Foreman's sound. A happy, annoying 8-bit loop (square lead + triangle bass + noise hat, scheduled ahead on
// the Web Audio clock) and synthesized grunts (a sawtooth "hrm" with a falling pitch through a vowel-ish bandpass)
// in place of a voice. No speech, no samples. Nothing is created until the mines ♪ toggle is on; turning it off
// mid-scene stops it.
const N = (s) => 440 * 2 ** ((s - 69) / 12);
// C major bounce, 16 eighth-notes per bar, 2 bars. 0 = rest.
const LEAD = [72, 76, 79, 76, 72, 76, 79, 84, 81, 79, 76, 79, 77, 74, 71, 74, 72, 76, 79, 76, 72, 76, 79, 84, 86, 84, 81, 79, 77, 76, 74, 72];
const BASS = [48, 0, 55, 0, 48, 0, 55, 0, 53, 0, 57, 0, 55, 0, 50, 0, 48, 0, 55, 0, 48, 0, 55, 0, 53, 0, 55, 0, 43, 0, 48, 0];
export class ForemanAudio {
  constructor() { this.ctx = null; this.timer = null; }
  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.05; this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }
  blip(type, f, t, dur, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  music(on) {
    if (!on) { clearInterval(this.timer); this.timer = null; return; }
    const c = this.ensure(); if (!c || this.timer) return; c.resume();
    const step = 60 / 168 / 2; let i = 0, next = c.currentTime + 0.05;
    const tick = () => {
      while (next < c.currentTime + 0.25) {
        const k = i % LEAD.length;
        if (LEAD[k]) this.blip('square', N(LEAD[k]), next, step * 0.8, 0.07);
        if (BASS[k]) this.blip('triangle', N(BASS[k]), next, step * 1.8, 0.16);
        if (k % 2 === 1) { const s = c.createBufferSource(), g = c.createGain(); s.buffer = this.noise; g.gain.value = 0.05; s.connect(g); g.connect(this.master); s.start(next); }
        next += step; i++;
      }
    };
    tick(); this.timer = setInterval(tick, 60);
  }
  /** One grunt. `big` = a yell (louder, longer, lower). Returns its length in ms so the mouth can flap with it. */
  grunt(big = false) {
    const c = this.ensure(); if (!c) return 0; c.resume();
    const t = c.currentTime, dur = big ? 0.42 : 0.16 + Math.random() * 0.1, f0 = (big ? 120 : 150) + Math.random() * 40;
    const o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + dur);
    bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(big ? 700 : 500 + Math.random() * 400, t); bp.frequency.linearRampToValueAtTime(350, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(big ? 0.9 : 0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(bp); bp.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    return dur * 1000;
  }
  dispose() { this.music(false); try { this.ctx?.close(); } catch {} this.ctx = null; }
}
