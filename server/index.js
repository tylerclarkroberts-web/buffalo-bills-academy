import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const staticDir = process.env.STATIC_DIR || path.join(root, 'dist');

const { app, shutdown } = createApp({ dataDir, staticDir });
const server = app.listen(port, () => {
  console.log(`\n  Async Poker is running:  http://localhost:${port}\n  (data saved in ${dataDir})\n`);
});
const stop = () => { shutdown(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
