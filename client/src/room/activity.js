import { ROOM_LINES, CLICK_LINES, REPEAT_CLICK_LINES, VISITOR_LINES, REARRANGE_LINES, roomContextLines } from './dialogue.js';
import { FAUN_EXCHANGES } from './faun-dialogue.js';

/** Peek around cover, hesitate, then slip back out of sight. */
export function faunPose(seconds) {
  const outward = Math.min(1, Math.max(0, seconds / 3));
  const homeward = Math.min(1, Math.max(0, (seconds - 14) / 4));
  const ease = value => value * value * (3 - 2 * value);
  const peek = ease(outward) - ease(homeward);
  const walking = seconds > 0 && seconds < 3 || seconds > 14 && seconds < 18;
  const step = walking ? Math.sin(Math.PI * (seconds < 3 ? outward : homeward)) : 0;
  return { peek, lean: -0.07 * peek, turn: step * (seconds < 3 ? 0.2 : -0.3),
    glance: Math.sin(seconds * 0.85) * 0.2 * peek, stride: Math.sin(seconds * 6) * 0.18 * step };
}

/** A stroll to something in the room (`errand` counts them), a while there (`act`), then back home. */
export function residentPose(seconds) {
  const phase = seconds % 34;
  const outward = Math.min(1, Math.max(0, (phase - 7) / 4));
  const homeward = Math.min(1, Math.max(0, (phase - 19) / 4));
  const ease = value => value * value * (3 - 2 * value);
  const walking = phase > 7 && phase < 11 || phase > 19 && phase < 23;
  const stride = walking ? Math.sin(seconds * 5.5) * 0.24 * Math.sin(Math.PI * (phase < 19 ? outward : homeward)) : 0;
  return { offset: ease(outward) - ease(homeward), stride, facing: walking ? Math.sin(Math.PI * (phase < 19 ? outward : homeward)) * (phase < 19 ? 1 : -1) : 0,
    phase, errand: Math.floor(seconds / 34), act: ease(Math.min(1, Math.max(0, phase - 11), Math.max(0, 19 - phase))),
    glance: Math.sin(seconds * 0.37) * 0.22, wave: phase > 26 && phase < 30 ? Math.sin((phase - 26) / 4 * Math.PI) : 0 };
}

/** Only active viewing time advances these cosmetic events; nothing is saved or awarded. */
export class RoomActivity {
  constructor(random = Math.random) {
    this.random = random; this.time = 0;
    this.recent = []; this.context = []; this.visitor = false;
    this.lastTap = this.lastRemark = -Infinity;
    this.speechUntil = this.faunUntil = this.faunStarted = 0;
    this.nextSpeech = this.between(20000, 40000);
    this.nextFaun = this.between(20000, 40000);
  }
  between(min, max) { return min + this.random() * (max - min); }
  pick(lines) {
    const fresh = lines.filter(line => !this.recent.includes(line));
    const line = fresh.length ? fresh[Math.floor(this.random() * fresh.length)] : this.recent.find(old => lines.includes(old));
    this.recent = [...this.recent.filter(old => old !== line), line].slice(-20);
    return line;
  }
  setContext(view, visitor) {
    const context = roomContextLines(view, visitor);
    if (visitor !== this.visitor) this.quiet();
    else if (this.context.includes(this.line) && !context.includes(this.line)) this.speechUntil = 0;
    this.context = context; this.visitor = visitor;
  }
  say(lines) {
    this.line = this.pick(lines); this.lastRemark = this.time;
    this.speechUntil = this.time + 9000;
    this.nextSpeech = this.speechUntil + this.between(45000, 90000);
    this.nextFaun = Math.max(this.nextFaun, this.speechUntil + 6000);
    return this.line;
  }
  talk(now = this.time) {
    const elapsed = now - this.lastTap;
    if (elapsed < 9000) return null;
    this.lastTap = now;
    // Let the player get a word in; the faun can stay for the rest of his visit.
    this.exchange = null;
    return this.say(elapsed < 30000 ? REPEAT_CLICK_LINES : this.visitor ? VISITOR_LINES : CLICK_LINES);
  }
  rearranged() {
    this.remarkOnLayout = true;
    this.nextSpeech = Math.min(this.nextSpeech, Math.max(this.time + 1200, this.lastRemark + 45000));
  }
  advance(ms) {
    this.time += Math.max(0, ms);
    if (this.time >= this.nextFaun) {
      this.faunStarted = this.time; this.faunUntil = this.time + 18000;
      this.exchange = this.pick(FAUN_EXCHANGES);
      this.nextFaun = this.faunUntil + this.between(120000, 240000);
      this.speechUntil = 0;
      this.nextSpeech = Math.max(this.nextSpeech, this.faunUntil + this.between(15000, 30000));
    }
    if (this.time >= this.nextSpeech) {
      if (this.remarkOnLayout) this.say(REARRANGE_LINES);
      else if (this.visitor && this.random() < 0.2) this.say(VISITOR_LINES);
      else this.say(this.context.length && this.random() < 0.6 ? this.context : ROOM_LINES);
      this.remarkOnLayout = false;
    }
    return this.state();
  }
  state() {
    const faun = this.time < this.faunUntil, faunAge = faun ? this.time - this.faunStarted : 0;
    if (faun && this.exchange && faunAge >= 4000 && faunAge < 13000) {
      const opener = faunAge < 8500;
      return { text: this.exchange[opener ? 0 : 1], speaker: opener ? 'faun' : 'resident', faun, faunAge };
    }
    return { text: this.time < this.speechUntil ? this.line : null, speaker: 'resident', faun, faunAge };
  }
  quiet() {
    this.speechUntil = this.faunUntil = 0; this.remarkOnLayout = false;
    this.lastTap = -Infinity;
    this.nextSpeech = Math.max(this.nextSpeech, this.time + this.between(20000, 40000));
    this.nextFaun = Math.max(this.nextFaun, this.time + this.between(20000, 40000));
  }
  untilChange() {
    const times = [this.nextSpeech, this.nextFaun, this.speechUntil, this.faunUntil];
    if (this.exchange && this.time < this.faunUntil) {
      for (const age of [4000, 8500, 13000]) times.push(this.faunStarted + age);
    }
    return Math.min(...times.filter(at => at > this.time)) - this.time;
  }
}
