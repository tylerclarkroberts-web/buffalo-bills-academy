// "Sing me a song": original dialogue, lyrics and timing for the royal-command scene.
// The lines and melody are original to Buffalo Bill's Academy (not a licensed work).
export const SONG_DIALOG = [
  { at: 0, who: 'king', text: 'Sing me a song.' },
  { at: 2800, who: 'scum', text: 'This table already heard enough of me for one night.' },
  { at: 6200, who: 'king', text: "I didn't ask if you wanted to. Sing." },
];
export const SONG_START = 9400;

// Offset from SONG_START. Paced so each line can be read with the flute.
export const SONG_LYRICS = [
  { at: 0, text: 'The lamps burn low on the last long hand' },
  { at: 2400, text: 'The road is a ribbon of dust and sand' },
  { at: 4800, text: 'Through the canyon and over the rise' },
  { at: 7200, text: 'Until morning opens the eastern skies' },
  { at: 9600, text: 'Smoke and whiskey' },
  { at: 11400, text: 'Wind and rain' },
  { at: 13200, text: 'The night rolls on' },
  { at: 15200, text: 'The night rolls on' },
];

export const SONG_HOLD = 2200;
export const SONG_MS = SONG_START + SONG_LYRICS[SONG_LYRICS.length - 1].at + SONG_HOLD; // 26800

/** Current dialog line at elapsed ms (from scene start). */
export function dialogAt(ms) {
  let cur = null;
  for (const d of SONG_DIALOG) { if (ms >= d.at && ms < SONG_START) cur = d; }
  return cur;
}

/** Current lyric at elapsed ms (from scene start). */
export function lyricAt(ms) {
  if (ms < SONG_START) return null;
  const t = ms - SONG_START;
  let cur = null, i = -1;
  for (let k = 0; k < SONG_LYRICS.length; k++) {
    if (t >= SONG_LYRICS[k].at) { cur = SONG_LYRICS[k]; i = k; }
  }
  return cur ? { ...cur, i } : null;
}

export function phaseAt(ms) { return ms >= SONG_START ? 'song' : 'talk'; }

// Original flute line (Hz), offsets from SONG_START. Rising then settling — not a known film theme.
const A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392, A4 = 440, B4 = 493.88, C5 = 523.25, D5 = 587.33;
export const SONG_NOTES = [
  // The lamps burn low on the last long hand
  { at: 0, freq: E4, dur: 0.35 }, { at: 0.32, freq: G4, dur: 0.32 }, { at: 0.62, freq: A4, dur: 0.4 },
  { at: 1.05, freq: C5, dur: 0.45 }, { at: 1.5, freq: A4, dur: 0.35 }, { at: 1.85, freq: G4, dur: 0.5 },
  // The road is a ribbon of dust and sand
  { at: 2.4, freq: G4, dur: 0.32 }, { at: 2.7, freq: A4, dur: 0.32 }, { at: 3.02, freq: B4, dur: 0.4 },
  { at: 3.45, freq: A4, dur: 0.35 }, { at: 3.8, freq: G4, dur: 0.35 }, { at: 4.15, freq: E4, dur: 0.55 },
  // Through the canyon and over the rise
  { at: 4.8, freq: A4, dur: 0.35 }, { at: 5.15, freq: C5, dur: 0.4 }, { at: 5.55, freq: D5, dur: 0.45 },
  { at: 6.05, freq: C5, dur: 0.35 }, { at: 6.4, freq: A4, dur: 0.7 },
  // Until morning opens the eastern skies
  { at: 7.2, freq: G4, dur: 0.35 }, { at: 7.55, freq: A4, dur: 0.35 }, { at: 7.9, freq: C5, dur: 0.4 },
  { at: 8.35, freq: B4, dur: 0.35 }, { at: 8.7, freq: A4, dur: 0.35 }, { at: 9.05, freq: G4, dur: 0.5 },
  // Smoke and whiskey
  { at: 9.6, freq: E4, dur: 0.5 }, { at: 10.15, freq: A4, dur: 0.9 },
  // Wind and rain
  { at: 11.4, freq: D4, dur: 0.45 }, { at: 11.9, freq: G4, dur: 0.9 },
  // The night rolls on
  { at: 13.2, freq: E4, dur: 0.4 }, { at: 13.65, freq: G4, dur: 0.4 }, { at: 14.1, freq: A4, dur: 0.85 },
  // The night rolls on
  { at: 15.2, freq: E4, dur: 0.45 }, { at: 15.7, freq: C4, dur: 0.5 }, { at: 16.25, freq: A3, dur: 1.3 },
];
