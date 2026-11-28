// STEEZE's fact-card portrait shows his whole figure. Other species keep the wide cover crop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsx = fs.readFileSync(path.join(root, 'client/src/barn/FactCard.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'client/src/barn/factcard.css'), 'utf8');

test('STEEZE gets a contain portrait on the fact card; other photos stay cover', () => {
  const art = jsx.slice(jsx.indexOf('function Art'), jsx.indexOf('export default function FactCard'));
  assert.match(art, /className="bf-window bf-steeze"/);
  assert.match(css, /\.bf-window\.bf-steeze[\s\S]*?\.bf-photo \{[^}]*object-fit:\s*contain/);
  assert.match(css, /\.bf-photo \{[^}]*object-fit:\s*cover/);
  const steezePhoto = css.slice(css.indexOf('.bf-window.bf-steeze .bf-photo'));
  assert.doesNotMatch(steezePhoto.slice(0, 200), /object-fit:\s*cover/);
});
