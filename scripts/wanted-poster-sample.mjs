// Render the sample WANTED poster (test avatar, not a real person) to a PNG.
// Usage: node scripts/wanted-poster-sample.mjs [outfile]
import fs from 'node:fs';
import path from 'node:path';
import { sampleWantedPoster, SAMPLE_NAME } from '../server/wantedPoster.js';

const out = process.argv[2] || path.resolve('wanted-sample.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
const png = sampleWantedPoster({ name: SAMPLE_NAME });
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes, name=', SAMPLE_NAME);
