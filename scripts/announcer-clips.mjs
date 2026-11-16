// Makes the ring announcer's clips with ElevenLabs, one mp3 per line in client/src/barn/announcer.js.
// A clip that already exists is kept: delete a file to have that line read again.
//   npm run announcer
// The key is read from ELEVENLABS_API_KEY (.env.local, never committed). ELEVENLABS_VOICE_ID picks another voice
// (the default is David, a Voice Library voice, which needs a paid plan) and ELEVENLABS_MODEL another model.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { LINES } from '../client/src/barn/announcer.js';

const { ELEVENLABS_VOICE_ID: voice = 'DduhIyyKkOosbP8VefhP', ELEVENLABS_MODEL: modelId = 'eleven_v4' } = process.env;
if (!process.env.ELEVENLABS_API_KEY) { console.error('No ELEVENLABS_API_KEY. Run this with `npm run announcer`.'); process.exit(1); }
const client = new ElevenLabsClient();
const dir = new URL('../client/public/barn/announcer/', import.meta.url);
await mkdir(dir, { recursive: true });
for (const [name, lines] of Object.entries(LINES)) {
  for (const [i, text] of lines.entries()) {
    const file = new URL(`${name}-${i + 1}.mp3`, dir);
    if (await access(file).then(() => true, () => false)) continue;
    const audio = await client.textToSpeech.convert(voice, { text, modelId, outputFormat: 'mp3_44100_64' });
    await writeFile(file, Readable.fromWeb(audio));
    console.log(`${name}-${i + 1}.mp3  ${text}`);
  }
}
