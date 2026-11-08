// Anime-theme music (3 tables in the multi-table view): 8-bit arrangements of public-domain Japanese melodies,
// plus two originals written for this app in the same scales. Hand-entered note sequences, no recordings.
// music.js plays them on a thin 12.5% pulse lead, a koto-like pluck, a triangle drone and a small taiko.
//
// Format: one string per bar, "Note:beats" tokens ("r" = rest), plus the drone note for that bar.
// Every melody stays inside the tune's declared scale (checked by test/themes.test.js).
import { midiOf } from './tunes.js';

export const JP_TUNES = [
  {
    id: 'sakura', title: 'Sakura Sakura', by: 'traditional', year: 'Edo period', bpm: 72, bpb: 4,
    scale: ['A', 'B', 'C', 'E', 'F'], // the in (miyako-bushi) scale
    bars: [
      ['A4:1 A4:1 B4:2', 'A2'], ['A4:1 A4:1 B4:2', 'A2'], ['A4:1 B4:1 C5:1 B4:1', 'A2'], ['A4:1 B4:.5 A4:.5 F4:2', 'F2'],
      ['E4:1 C4:1 E4:1 F4:1', 'E2'], ['E4:1 E4:.5 C4:.5 B3:2', 'E2'], ['A4:1 B4:1 C5:1 B4:1', 'A2'], ['A4:1 B4:.5 A4:.5 F4:2', 'F2'],
      ['E4:1 C4:1 E4:1 F4:1', 'E2'], ['E4:1 E4:.5 C4:.5 B3:2', 'E2'], ['A4:1 A4:1 B4:2', 'A2'], ['A4:1 A4:1 B4:2', 'A2'],
      ['E4:1 F4:1 B4:.5 A4:.5 F4:1', 'E2'], ['E4:4', 'E2'],
    ],
  },
  {
    id: 'kojo', title: 'Kōjō no Tsuki', by: 'Rentarō Taki', year: 1901, bpm: 66, bpb: 4,
    scale: ['E', 'F', 'A', 'B', 'C', 'D'],
    bars: [
      ['E4:1 E4:1 A4:1 B4:1', 'A2'], ['C5:1 B4:1 A4:2', 'A2'], ['F4:1 F4:1 E4:1 D4:1', 'D2'], ['E4:4', 'E2'],
      ['E4:1 E4:1 A4:1 B4:1', 'A2'], ['C5:1 B4:1 A4:2', 'A2'], ['F4:1 D4:1 E4:1 E4:1', 'E2'], ['A3:4', 'A2'],
      ['C5:1 C5:1 B4:1 A4:1', 'A2'], ['F4:1 F4:1 E4:2', 'E2'], ['F4:1 F4:1 E4:1 D4:1', 'D2'], ['E4:4', 'E2'],
      ['E4:1 E4:1 A4:1 B4:1', 'A2'], ['C5:1 B4:1 A4:2', 'A2'], ['F4:1 D4:1 E4:1 E4:1', 'E2'], ['A3:4', 'A2'],
    ],
  },
  {
    id: 'warabe', title: 'Temari Steps (warabe-uta style)', by: 'original for this app', year: 2026, bpm: 104, bpb: 4,
    scale: ['D', 'E', 'G', 'A', 'C'], // the min'yō pentatonic of children's songs like Kagome Kagome
    bars: [
      ['A4:1 A4:1 G4:1 A4:1', 'A2'], ['C5:1 A4:1 G4:2', 'G2'], ['A4:1 A4:1 G4:1 E4:1', 'A2'], ['G4:1 A4:.5 A4:.5 A4:2', 'A2'],
      ['C5:1 C5:1 A4:1 G4:1', 'C3'], ['A4:1 G4:1 E4:2', 'A2'], ['G4:1 A4:1 G4:1 E4:1', 'G2'], ['D4:2 E4:2', 'D2'],
    ],
  },
  {
    id: 'dan', title: 'Six Steps (after the dan-mono koto form)', by: 'original for this app', year: 2026, bpm: 60, bpb: 4,
    scale: ['E', 'F', 'A', 'B', 'C'],
    bars: [
      ['E4:2 F4:1 A4:1', 'E2'], ['B4:2 A4:1 F4:1', 'A2'], ['E4:1 F4:1 A4:1 B4:1', 'E2'], ['C5:3 B4:1', 'A2'],
      ['A4:1 B4:.5 A4:.5 F4:1 E4:1', 'A2'], ['F4:2 E4:2', 'E2'], ['B3:1 C4:1 E4:1 F4:1', 'E2'], ['E4:4', 'E2'],
    ],
  },
];

/** Compile into timed events (beats): 'lead8' melody, 'drone' per bar, 'koto' plucks, 'taiko' on the downbeat. */
export function compileJP(tune) {
  const ev = [];
  const bpb = tune.bpb;
  tune.bars.forEach(([mel, drone], b) => {
    const t0 = b * bpb;
    let t = t0;
    for (const tok of mel.trim().split(/\s+/)) {
      const [n, d] = tok.split(':'); const dur = +d;
      if (n !== 'r') ev.push({ t, dur, voice: 'lead8', midi: midiOf(n) });
      t += dur;
    }
    if (Math.abs(t - t0 - bpb) > 1e-6) throw new Error(`${tune.id} bar ${b + 1} has ${t - t0} beats, expected ${bpb}`);
    const root = midiOf(drone);
    ev.push({ t: t0, dur: bpb * 0.98, voice: 'drone', midi: root });
    ev.push({ t: t0, dur: 0.3, voice: 'taiko' });
    // koto: root, fifth, octave on the off beats (all three are in every tune's scale for the drones used)
    [1, 2, 3].forEach((k) => { if (k < bpb) ev.push({ t: t0 + k, dur: 0.6, voice: 'koto', midi: root + 12 + [0, 7, 12][k - 1] }); });
  });
  ev.sort((a, b) => a.t - b.t);
  return { events: ev, beats: tune.bars.length * bpb };
}
