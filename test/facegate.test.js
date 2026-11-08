// Regression: after the photo step the player lands where they were going, and never loops back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceRedirect, safeNext } from '../client/src/faceGate.js';

const fresh = { id: 'p1', hasAvatar: false };
const done = { id: 'p1', hasAvatar: true };

test('new player without a face is sent to the photo step once, keeping where they were going', () => {
  assert.equal(faceRedirect({ me: fresh, path: '/', loc: '/' }), '/welcome?next=%2F');
  assert.equal(faceRedirect({ me: fresh, path: '/t/ABC123', loc: '/t/ABC123' }), '/welcome?next=%2Ft%2FABC123');
  assert.equal(faceRedirect({ me: fresh, path: '/welcome', loc: '/welcome?next=%2F' }), null, 'already there: no re-redirect');
  assert.equal(faceRedirect({ me: fresh, path: '/mines', loc: '/mines' }), null);
  assert.equal(faceRedirect({ me: null, path: '/', loc: '/' }), null, 'signed out: nothing');
});

test('once the avatar is saved (or skipped) the photo step is never shown again: no loop', () => {
  // The bug: the lobby rendered with a stale "no avatar" session and bounced back. With the live session:
  assert.equal(faceRedirect({ me: done, path: '/', loc: '/' }), null, 'lobby stays put');
  assert.equal(faceRedirect({ me: done, path: '/t/ABC123', loc: '/t/ABC123' }), null);
  // Back button / reload / an old link onto /welcome goes on to the destination instead of the photo step.
  assert.equal(faceRedirect({ me: done, path: '/welcome', loc: '/welcome?next=%2Ft%2FABC123' }), '/t/ABC123');
  assert.equal(faceRedirect({ me: done, path: '/welcome', loc: '/welcome' }), '/');
  assert.equal(faceRedirect({ me: done, path: '/welcome', loc: '/welcome?next=%2Fwelcome%3Fnext%3D%252F' }), '/', 'nested welcome never loops');
  assert.equal(faceRedirect({ me: done, path: '/profile/face', loc: '/profile/face' }), null, 'retake is still allowed');
  // Simulate the whole sequence: welcome -> save -> lobby; following redirects must settle within 1 hop.
  let me = fresh, loc = '/';
  const hops = [];
  for (let i = 0; i < 5; i++) { const to = faceRedirect({ me, path: loc.split('?')[0], loc }); if (!to) break; hops.push(to); loc = to; }
  assert.deepEqual(hops, ['/welcome?next=%2F']);
  me = done; loc = '/'; // saved, navigated to next
  assert.equal(faceRedirect({ me, path: loc, loc }), null);
});

test('safeNext only allows same-site paths and never /welcome', () => {
  assert.equal(safeNext('/t/X'), '/t/X');
  assert.equal(safeNext('https://evil.example'), '/');
  assert.equal(safeNext('//evil.example'), '/');
  assert.equal(safeNext('/welcome?next=/'), '/');
  assert.equal(safeNext(undefined), '/');
});
