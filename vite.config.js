import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';

// The Hall of Doors' Nanosaur build is big: gzip it once at build time (streamed, so the build box's memory stays
// flat) and let the server stream the .gz straight from disk (server/app.js, /nanosaur/:file).
export const NANO_PRECOMPRESS = ['Nanosaur.data', 'Nanosaur.wasm', 'Nanosaur.js'];
function precompressNanosaur() {
  let outDir = '';
  return {
    name: 'bba-precompress-nanosaur',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    async closeBundle() {
      for (const f of NANO_PRECOMPRESS) {
        const src = path.join(outDir, 'nanosaur', f);
        if (!fs.existsSync(src)) continue;
        await pipeline(fs.createReadStream(src), zlib.createGzip({ level: 9 }), fs.createWriteStream(`${src}.gz`));
      }
    },
  };
}

export default defineConfig({
  root: 'client',
  plugins: [react(), precompressNanosaur()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
