// Render sample WANTED posters with generated (app) avatars — never Guntrad.
// Usage: node scripts/wanted-poster-sample.mjs [outdir]
import fs from 'node:fs';
import path from 'node:path';
import { sampleWantedPoster, SAMPLE_NAME } from '../server/wantedPoster.js';

const samples = [
  { file: 'cal-hick.png', name: SAMPLE_NAME, seed: 'wanted-sample-cal' },
  { file: 'ann-wait.png', name: 'Ann Wait', seed: 'wanted-sample-ann' },
  { file: 'long-name.png', name: 'Bartholomew J. Winterbottom', seed: 'wanted-sample-long' },
];

const outDir = process.argv[2] || path.resolve('wanted-v2');
fs.mkdirSync(outDir, { recursive: true });
for (const s of samples) {
  const png = sampleWantedPoster({ name: s.name, seed: s.seed });
  const dest = path.join(outDir, s.file);
  fs.writeFileSync(dest, png);
  console.log('wrote', dest, png.length, 'bytes, name=', s.name, 'seed=', s.seed);
}
