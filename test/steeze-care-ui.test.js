// STEEZE's barn care row uses his labels; every other species still says Feed, Play and Mist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const barn = fs.readFileSync(path.join(root, 'client/src/barn/Barn.jsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'client/src/barn/barn.css'), 'utf8');

test('the barn care row labels STEEZE through careLabel, and keeps the ordinary ACT map for everyone else', () => {
  assert.match(barn, /import \{ isSteeze, careLabel, steezeCareLine \} from '..\/..\/..\/server\/engine\/steeze.js'/);
  assert.match(barn, /const ACT = \{ feed: \['Feed', 'free'\], play: \['Play', 'free'\], clean: \['Mist', 'free'\] \}/);
  assert.match(barn, /careLabel\(k, pen.species\)/);
  assert.match(barn, /steeze-acts/);
  assert.match(barn, /steezeCareLine\(action, cared.species\)/);
  assert.match(css, /\.barn-acts\.steeze-acts \.btn/);
  assert.match(css, /white-space: normal/);
});
