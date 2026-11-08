// Table background music: our own simplified chiptune arrangements of PUBLIC-DOMAIN tunes (all published
// before 1929; sources are listed in DECISIONS.md). No recordings: these are hand-entered note sequences that
// music.js plays on WebAudio pulse/triangle/noise voices as an oom-pah "honky-tonk" saloon piano.
//
// Format: one string per bar, "Note:beats" tokens ("r" = rest), and a chord per bar ("G7/C" = half a bar each).
// Beats are quarter notes. Melody can be shifted by whole octaves with `oct`.

export const TUNES = [
  {
    id: 'entertainer', title: 'The Entertainer', by: 'Scott Joplin', year: 1902, bpm: 76, bpb: 4,
    bars: [
      ['D4:.25 D#4:.25 E4:.25 C5:.5 E4:.25 C5:.5 E4:.25 C5:1.75', 'C'],
      ['C5:.25 D5:.25 D#5:.25 E5:.25 C5:.25 D5:.25 E5:.5 B4:.25 D5:.5 C5:1.25', 'C/G7'],
      ['D4:.25 D#4:.25 E4:.25 C5:.5 E4:.25 C5:.5 E4:.25 C5:1.75', 'C'],
      ['A4:.25 G4:.25 F#4:.25 A4:.25 C5:.25 E5:.5 D5:.25 C5:.25 A4:.25 D5:1.25 r:.25', 'D7/G7'],
      ['D4:.25 D#4:.25 E4:.25 C5:.5 E4:.25 C5:.5 E4:.25 C5:1.75', 'C'],
      ['C5:.25 D5:.25 D#5:.25 E5:.25 C5:.25 D5:.25 E5:.5 B4:.25 D5:.5 C5:1.25', 'C/G7'],
      ['C5:.25 D5:.25 E5:.25 C5:.25 D5:.25 E5:.5 C5:.25 D5:.25 C5:.25 E5:.25 C5:.25 D5:.5 r:.5', 'F/C'],
      ['C5:.25 D5:.25 E5:.25 C5:.25 D5:.25 E5:.5 B4:.25 D5:.5 C5:1.5', 'G7/C'],
    ],
  },
  {
    id: 'susanna', title: 'Oh! Susanna', by: 'Stephen Foster', year: 1848, bpm: 184, bpb: 4,
    bars: [
      ['r:3 C4:.5 D4:.5', 'C'],
      ['E4:1 G4:1 G4:1.5 A4:.5', 'C'], ['G4:1 E4:1 C4:1.5 D4:.5', 'C'], ['E4:1 E4:1 D4:1 C4:1', 'G7'], ['D4:3 C4:.5 D4:.5', 'G7'],
      ['E4:1 G4:1 G4:1.5 A4:.5', 'C'], ['G4:1 E4:1 C4:1.5 D4:.5', 'C'], ['E4:1 E4:1 D4:1 D4:1', 'G7'], ['C4:4', 'C'],
      ['F4:2 A4:2', 'F'], ['A4:1 G4:1 G4:1 E4:1', 'C'], ['C4:1 D4:2 C4:.5 D4:.5', 'G7'],
      ['E4:1 G4:1 G4:1.5 A4:.5', 'C'], ['G4:1 E4:1 C4:1.5 D4:.5', 'C'], ['E4:1 E4:1 D4:1 D4:1', 'G7'], ['C4:4', 'C'],
    ],
  },
  {
    id: 'camptown', title: 'Camptown Races', by: 'Stephen Foster', year: 1850, bpm: 200, bpb: 4,
    bars: [
      ['r:4', 'C'],
      ['G4:.5 G4:.5 E4:.5 G4:.5 A4:.5 G4:.5 E4:1', 'C'], ['E4:.5 D4:1.5 E4:.5 D4:1.5', 'G7'],
      ['G4:.5 G4:.5 E4:.5 G4:.5 A4:.5 G4:.5 E4:1', 'C'], ['D4:1 E4:.5 D4:.5 C4:2', 'G7/C'],
      ['C4:.75 C4:.25 E4:.5 G4:.5 C5:2', 'C'], ['A4:.75 A4:.25 C5:.5 A4:.5 G4:2', 'F/C'],
      ['G4:.5 G4:.5 E4:.5 E4:.5 G4:.5 G4:.5 E4:1', 'C'], ['D4:.5 E4:.5 F4:.5 E4:.5 D4:.5 D4:.5 C4:1', 'G7/C'],
    ],
  },
  {
    id: 'clementine', title: 'Oh My Darling, Clementine', by: 'Percy Montrose', year: 1884, bpm: 138, bpb: 3,
    bars: [
      ['r:2 C4:.75 C4:.25', 'C'],
      ['C4:1 G3:1 E4:.75 E4:.25', 'C'], ['E4:1 C4:1 C4:.75 E4:.25', 'C'], ['G4:2 F4:.5 E4:.5', 'C'], ['D4:2 D4:.75 E4:.25', 'G7'],
      ['F4:1 F4:1 E4:.75 D4:.25', 'G7'], ['E4:1 C4:1 C4:.75 E4:.25', 'C'], ['D4:1 G3:1 B3:.75 D4:.25', 'G7'], ['C4:3', 'C'],
    ],
  },
  {
    id: 'range', title: 'Home on the Range', by: 'Daniel E. Kelley & Brewster Higley', year: 1872, bpm: 150, bpb: 3,
    bars: [
      ['r:1 G3:1 G3:1', 'C'],
      ['C4:2 D4:1', 'C'], ['E4:2 C4:.5 B3:.5', 'C'], ['A3:1 F4:1 F4:1', 'F'], ['F4:2 E4:.5 F4:.5', 'F'],
      ['G4:2 E4:1', 'C'], ['C4:1 C4:1 C4:1', 'C'], ['C4:1 B3:1 C4:1', 'G7'], ['D4:2 G3:.5 G3:.5', 'G7'],
      ['C4:2 D4:1', 'C'], ['E4:2 C4:.5 B3:.5', 'C'], ['A3:1 F4:1 F4:1', 'F'], ['F4:2 F4:1', 'F'],
      ['E4:1 D4:1 C4:1', 'C'], ['B3:1 A3:1 B3:1', 'G7'], ['C4:3', 'C'],
    ],
  },
  {
    id: 'yankee', title: 'Yankee Doodle', by: 'traditional', year: 1775, bpm: 196, bpb: 4, oct: 1,
    bars: [
      ['C4:.5 C4:.5 D4:.5 E4:.5 C4:.5 E4:.5 D4:.5 G3:.5', 'C/G7'], ['C4:.5 C4:.5 D4:.5 E4:.5 C4:1 B3:1', 'C/G7'],
      ['C4:.5 C4:.5 D4:.5 E4:.5 F4:.5 E4:.5 D4:.5 C4:.5', 'C/F'], ['B3:.5 G3:.5 A3:.5 B3:.5 C4:1 C4:1', 'G7/C'],
      ['A3:.75 B3:.25 A3:.5 G3:.5 A3:.5 B3:.5 C4:1', 'F/C'], ['G3:.75 A3:.25 G3:.5 F3:.5 E3:1 G3:1', 'C/G7'],
      ['A3:.75 B3:.25 A3:.5 G3:.5 A3:.5 B3:.5 C4:.5 A3:.5', 'F/C'], ['G3:.5 C4:.5 B3:.5 D4:.5 C4:1 C4:1', 'G7/C'],
    ],
  },
  {
    id: 'buffalo', title: 'Buffalo Gals', by: 'John Hodges ("Cool White")', year: 1844, bpm: 176, bpb: 4,
    bars: [
      ['r:4', 'C'],
      ['E4:.75 E4:.25 E4:.5 C4:.5 E4:.5 G4:.5 G4:1', 'C'], ['A4:1 A4:.5 G4:.5 E4:2', 'C'],
      ['F4:1 F4:.5 E4:.5 D4:2', 'G7'], ['G4:1 G4:.5 F4:.5 E4:2', 'C'],
      ['E4:.75 E4:.25 E4:.5 C4:.5 E4:.5 G4:.5 G4:1', 'C'], ['A4:1 A4:.5 G4:.5 E4:1 C4:1', 'F/C'],
      ['D4:1 E4:.5 F4:.5 E4:1 D4:1', 'G7'], ['C4:3 r:1', 'C'],
    ],
  },
];

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function midiOf(name) {
  const m = /^([A-G](?:#|b)?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (+m[2] + 1) + PC[m[1]];
}
export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
export function chordTones(sym) {
  const m = /^([A-G](?:#|b)?)(m|7|m7|maj7)?$/.exec(sym);
  if (!m) throw new Error(`bad chord ${sym}`);
  const iv = { undefined: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11] }[m[2]];
  return { root: PC[m[1]], iv };
}

/** Compile a tune into timed events (beats): voice 'lead' | 'bass' | 'stab' | 'hat'. */
export function compile(tune) {
  const ev = [];
  const bpb = tune.bpb;
  tune.bars.forEach(([mel, chords], b) => {
    const t0 = b * bpb;
    let t = t0;
    for (const tok of mel.trim().split(/\s+/)) {
      const [n, d] = tok.split(':'); const dur = +d;
      if (n !== 'r') ev.push({ t, dur, voice: 'lead', midi: midiOf(n) + 12 * (tune.oct || 0) });
      t += dur;
    }
    if (Math.abs(t - t0 - bpb) > 1e-6) throw new Error(`${tune.id} bar ${b + 1} has ${t - t0} beats, expected ${bpb}`);
    const parts = chords.split('/');
    const span = bpb / parts.length;
    for (let beat = 0; beat < bpb; beat++) {
      const at = t0 + beat;
      const { root, iv } = chordTones(parts[Math.floor(beat / span)]);
      // oom-pah: bass on the strong beats (root, then the fifth), chord stabs on the off beats
      const strong = bpb === 3 ? beat === 0 : beat % 2 === 0;
      if (strong) ev.push({ t: at, dur: 0.9, voice: 'bass', midi: 36 + root + (beat === 2 && parts.length === 1 ? 7 : 0) });
      else for (const i of iv) ev.push({ t: at, dur: 0.35, voice: 'stab', midi: 55 + ((root + i + 5) % 12) });
      ev.push({ t: at + 0.5, dur: 0.05, voice: 'hat' });
    }
  });
  ev.sort((a, b) => a.t - b.t);
  return { events: ev, beats: tune.bars.length * bpb };
}

/** Shuffle bag: every tune once before any repeats, and never the same tune twice in a row. */
export function shuffleOrder(n, rnd = Math.random, last = -1) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (n > 1 && a[0] === last) [a[0], a[1]] = [a[1], a[0]];
  return a;
}
