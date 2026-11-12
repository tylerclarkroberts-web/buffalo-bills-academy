import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The Dockerfile ships only server/ and the built dist/, so anything the server imports has to live under server/.
// Shared code goes in server/ and the client reaches in, never the other way round.
test('server code imports nothing from outside server/', () => {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server');
  const files = fs.readdirSync(serverDir, { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join(serverDir, f));
  const escapes = [];
  for (const file of files) {
    for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), spec);
      if (path.relative(serverDir, target).startsWith('..')) escapes.push(`${path.relative(serverDir, file)} -> ${spec}`);
    }
  }
  assert.deepEqual(escapes, []);
});
