// STEEZE is a catchable mines 'bug': a private photo, not a unique legendary.
// The portrait is served from server/assets/steeze.png (private overlay, not in git).
export const STEEZE_ID = 'steeze';
export const STEEZE_LEVEL = 5;
/** One Mountain-time day in five, any tier, own seed — not coupled to payouts or the stick roll. */
export const STEEZE_DAYS = 5;
export const STEEZE_JAR_CHANCE = 0.9;
export const STEEZE_JAR_SIDES = 10000;
export const STEEZE_PHOTO = '/api/steeze.png';
export const isSteeze = (id) => id === STEEZE_ID;
/** Once he is in a stall, he stays. Shown in the UI and returned as a 409 from /barn/release. */
export const STEEZE_STUCK = 'STEEZE? Leave? He just unpacked his golf bag. The stall is his now.';

/** Care pills and reactions for STEEZE only. Mechanics stay on the usual feed / play / clean actions. */
export const STEEZE_CARE = {
  feed: {
    label: 'Read him a book',
    lines: [
      "I've read better menus.",
      "If that's the climax, keep it to yourself.",
      'A touching story about a man who should have been golfing.',
      'You skipped the good part. I was skimming.',
      "That's enough culture for one fiscal quarter.",
    ],
  },
  play: {
    label: 'Rub his back',
    lines: [
      'A little to the left. No, my left. Hopeless.',
      "I've had caddies with a surer touch.",
      "Don't wrinkle the shirt. It's older than your taste.",
      'Fine. But this never happened.',
      "You're mistaking me for someone who asked.",
    ],
  },
  clean: {
    label: 'Discuss politics',
    lines: [
      'Both of those people should take up golf.',
      "I didn't come here to be briefed.",
      'The only platform I trust is a tee box.',
      'Fascinating. Now, the weather.',
      "If I wanted a filibuster I'd watch the group ahead of us.",
      'We could talk about literally anything else.',
    ],
  },
};

const DEFAULT_CARE_LABELS = { feed: 'Feed', play: 'Play', clean: 'Mist' };

/** The label on a care pill: STEEZE's wording, or the ordinary one. */
export function careLabel(action, species) {
  if (isSteeze(species) && STEEZE_CARE[action]?.label) return STEEZE_CARE[action].label;
  return DEFAULT_CARE_LABELS[action] || action;
}

/** One snarky line after a STEEZE care action, or null for any other species. */
export function steezeCareLine(action, species, pick = Math.random) {
  if (!isSteeze(species)) return null;
  const lines = STEEZE_CARE[action]?.lines;
  if (!lines?.length) return null;
  const n = typeof pick === 'function' ? pick() : pick;
  const i = Math.min(lines.length - 1, Math.max(0, Math.floor(n * lines.length)));
  return lines[i];
}
