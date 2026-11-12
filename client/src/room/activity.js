export const ROOM_LINES = [
  'My throat still hurts from that mine acid. In my defence, it was a lovely colour.',
  'The foreman said hydrate. I assumed the glowing puddle counted.',
  'I came home to relax. Now the furniture is judging my finances.',
  'Apparently a deed to the moon does not include parking.',
  'That rock really ties the room together. Financially, it has ruined me.',
  'I should buy a chair. Standing here is becoming a whole personality.',
  'The bug has a better healthcare plan than I do. Someone mists him.',
  'I washed the mine out of my clothes. The clothes asked for a transfer.',
  'This is not hoarding. It is a museum with no funding.',
  'If anyone asks, the anvil is load-bearing.',
  'I was going to save money. Then the store had a completely ordinary rock.',
  'Quiet evening. Just me and the consequences of several small purchases.',
  'The couch was free. I have not stopped wondering why.',
  'I count the money every day. It is still mostly table.',
];

export const FAUN_LINES = [
  'I only came to borrow sugar. The wagon has made it awkward.',
  'Lovely wardrobe. Mine has a whole geopolitical situation in it.',
  'Please tell the landlord I am a very anxious coat rack.',
  'I brought a parcel. It has been ticking since the mine.',
  'I was told there would be tea. This appears to be a tax situation.',
  'The umbrella is for emotional support. It has never stopped any rain.',
];

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
    this.random = random; this.time = 0; this.lastLine = this.lastFaunLine = -1;
    this.speechUntil = this.faunUntil = this.faunStarted = this.faunSpeechAt = this.faunSpeechUntil = 0;
    this.nextSpeech = this.between(20000, 40000);
    this.nextFaun = this.between(20000, 40000);
  }
  between(min, max) { return min + this.random() * (max - min); }
  lineIndex(count, previous) {
    let index = Math.floor(this.random() * (count - (previous < 0 ? 0 : 1)));
    if (previous >= 0 && index >= previous) index++;
    return index;
  }
  advance(ms) {
    this.time += Math.max(0, ms);
    if (this.time >= this.nextFaun) {
      this.faunStarted = this.time; this.faunUntil = this.time + 18000;
      this.faunSpeechAt = this.time + 4000; this.faunSpeechUntil = this.time + 13000;
      this.lastFaunLine = this.lineIndex(FAUN_LINES.length, this.lastFaunLine);
      this.nextFaun = this.faunUntil + this.between(120000, 240000);
      this.speechUntil = 0;
      this.nextSpeech = Math.max(this.nextSpeech, this.faunUntil + this.between(15000, 30000));
    }
    if (this.time >= this.nextSpeech) {
      this.lastLine = this.lineIndex(ROOM_LINES.length, this.lastLine);
      this.speechUntil = this.time + 9000;
      this.nextSpeech = this.speechUntil + this.between(45000, 90000);
    }
    return this.state();
  }
  state() {
    const faun = this.time < this.faunUntil;
    const faunSpeaking = faun && this.time >= this.faunSpeechAt && this.time < this.faunSpeechUntil;
    return { text: faunSpeaking ? FAUN_LINES[this.lastFaunLine] : !faun && this.time < this.speechUntil ? ROOM_LINES[this.lastLine] : null,
      speaker: faunSpeaking ? 'faun' : 'resident', faun, faunAge: faun ? this.time - this.faunStarted : 0 };
  }
  quiet() {
    this.speechUntil = this.faunUntil = this.faunSpeechAt = this.faunSpeechUntil = 0;
    this.nextSpeech = Math.max(this.nextSpeech, this.time + this.between(20000, 40000));
    this.nextFaun = Math.max(this.nextFaun, this.time + this.between(20000, 40000));
  }
  untilChange() {
    return Math.min(...[this.nextSpeech, this.nextFaun, this.speechUntil, this.faunUntil, this.faunSpeechAt, this.faunSpeechUntil].filter(at => at > this.time)) - this.time;
  }
}
