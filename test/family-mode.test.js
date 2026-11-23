// Family / Work mode: stable table numbers, sanitizing, and per-device persistence.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  familyTableNumber, familyTableLabel, displayTableName,
  familyMask, familyHandle, familyInitials, familyRoyalLabel, familyRoyalCaption,
  familyNotifyTitle, familyShareText, FAMILY_GAME, FAMILY_TITLES,
} from '../client/src/modes/family.js';
import {
  FAMILY_KEY, WORK_KEY, FAMILY_COOKIE, WORK_COOKIE,
  loadModes, getModes, setFamily, setWork, setModes,
  handleWorkHotkey, isTypingTarget, isElHaloScreen,
} from '../client/src/modes/store.js';

test('familyTableNumber is a stable 4-digit value derived from the table code', () => {
  const n = familyTableNumber('ABCD');
  assert.equal(n, familyTableNumber('ABCD'));
  assert.equal(n, familyTableNumber('abcd'));
  assert.equal(n, familyTableNumber('  abcd  '));
  assert.ok(n >= 0 && n <= 9999);
  assert.notEqual(familyTableNumber('ABCD'), familyTableNumber('ABCE'));
  assert.equal(familyTableLabel('ABCD'), `Table #${String(n).padStart(4, '0')}`);
  assert.match(familyTableLabel('ABCD'), /^Table #\d{4}$/);
  assert.equal(displayTableName('ABCD', 'Dumbass Diner', true), familyTableLabel('ABCD'));
  assert.equal(displayTableName({ code: 'ABCD', name: 'Dumbass Diner' }, null, true), familyTableLabel('ABCD'));
  assert.equal(displayTableName({ code: 'ABCD', name: 'Dumbass Diner' }, null, false), 'Dumbass Diner');
  // A handful of distinct codes should not all collide in 10,000 slots.
  const codes = ['ABCD', 'WXYZ', 'TABLE1', 'QWER', 'SCUM01', 'BJ00', 'HOLD1', 'HOLD2', 'FOFF', 'MINE'];
  const unique = new Set(codes.map(familyTableNumber));
  assert.ok(unique.size >= codes.length - 1, 'codes should almost always get different numbers');
});

test('familyMask and familyHandle hide crude words but leave ordinary names alone', () => {
  assert.equal(familyMask('Nice hand!'), 'Nice hand!');
  assert.equal(familyMask('assistant class grassy'), 'assistant class grassy');
  const masked = familyMask('what the fuck was that shit');
  assert.doesNotMatch(masked, /fuck|shit/i);
  assert.match(masked, /what the •+ was that •+/i);
  assert.equal(familyHandle('Ann Wait'), 'Ann Wait');
  assert.equal(familyHandle('  Fuck  '), 'Player');
  assert.doesNotMatch(familyHandle('Sir Asshole'), /asshole/i);
  assert.match(familyHandle('Sir Asshole'), /Sir •+/);
  assert.equal(familyRoyalLabel('toot', 'Let someone toot in your face'), 'Let someone blow a party horn');
  assert.equal(familyRoyalLabel('jig', 'Do a jig'), 'Do a jig');
  assert.match(familyRoyalCaption({ cmd: 'toot' }, { who: 'Ann', scum: 'Bo' }, 'Ann toots in Bo\'s face'), /party horn/);
  assert.equal(familyInitials('Ann Wait'), 'AW');
  assert.equal(familyInitials('Tyler'), 'TY');
  assert.equal(FAMILY_GAME.scum, 'Palace');
  assert.equal(FAMILY_TITLES.scum, 'Low Seat');
  assert.equal(familyNotifyTitle('ABCD'), `Your turn at ${familyTableLabel('ABCD')}`);
  assert.match(familyShareText('ABCD', 'https://ex/t/ABCD'), /Table #\d{4}/);
});

function installStorage() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const cookies = { value: '' };
  const classList = {
    _on: new Set(),
    toggle(name, on) { if (on) this._on.add(name); else this._on.delete(name); },
  };
  const dataset = {};
  globalThis.window = { localStorage };
  globalThis.localStorage = localStorage;
  globalThis.document = {
    cookie: '',
    documentElement: { classList, dataset },
  };
  Object.defineProperty(globalThis.document, 'cookie', {
    configurable: true,
    get() { return cookies.value; },
    set(v) {
      const [pair] = String(v).split(';');
      const [k, val] = pair.split('=');
      const parts = cookies.value ? cookies.value.split('; ').filter((p) => !p.startsWith(`${k}=`)) : [];
      if (String(v).includes('max-age=0')) cookies.value = parts.join('; ');
      else { parts.push(`${k}=${val}`); cookies.value = parts.join('; '); }
    },
  });
  return { store, classList, dataset, cookies };
}

beforeEach(() => {
  installStorage();
  setModes({ family: false, work: false });
});

test('Family and Work flags persist in localStorage and a cookie, and survive a reload', () => {
  assert.deepEqual(getModes(), { family: false, work: false, safe: false });
  setFamily(true);
  assert.equal(globalThis.localStorage.getItem(FAMILY_KEY), '1');
  assert.match(globalThis.document.cookie, new RegExp(`${FAMILY_COOKIE}=1`));
  assert.equal(globalThis.document.documentElement.classList._on.has('family-mode'), true);
  assert.equal(globalThis.document.documentElement.dataset.family, '1');
  assert.equal(getModes().family, true);
  assert.equal(getModes().work, false);

  setWork(true);
  assert.equal(globalThis.localStorage.getItem(WORK_KEY), '1');
  assert.match(globalThis.document.cookie, new RegExp(`${WORK_COOKIE}=1`));
  assert.equal(getModes().work, true);
  // Both can be on: Work is the layout, Family still sanitizes names inside it.
  assert.deepEqual(getModes(), { family: true, work: true, safe: true });

  // Simulate a later visit on the same device: empty memory, same storage.
  const saved = {
    family: globalThis.localStorage.getItem(FAMILY_KEY),
    work: globalThis.localStorage.getItem(WORK_KEY),
  };
  installStorage();
  globalThis.localStorage.setItem(FAMILY_KEY, saved.family);
  globalThis.localStorage.setItem(WORK_KEY, saved.work);
  const loaded = loadModes();
  assert.deepEqual(loaded, { family: true, work: true, safe: true });
  assert.deepEqual(getModes(), { family: true, work: true, safe: true });

  setFamily(false);
  setWork(false);
  assert.equal(globalThis.localStorage.getItem(FAMILY_KEY), null);
  assert.equal(globalThis.localStorage.getItem(WORK_KEY), null);
  assert.deepEqual(getModes(), { family: false, work: false, safe: false });
});

test('Work Mode alone applies Family sanitizing (safe) without pressing Family', () => {
  setWork(true);
  const m = getModes();
  assert.equal(m.work, true);
  assert.equal(m.family, false);
  assert.equal(m.safe, true);
  assert.equal(globalThis.document.documentElement.classList._on.has('work-mode'), true);
  assert.equal(globalThis.document.documentElement.classList._on.has('kosher-mode'), true);
  assert.equal(globalThis.document.documentElement.classList._on.has('family-mode'), false);
  assert.equal(displayTableName('ABCD', 'Fart Kitchen', m.safe), familyTableLabel('ABCD'));
});

test('modes are viewer-only: toggling them does not call fetch or write a player record', () => {
  const calls = [];
  globalThis.fetch = (...args) => { calls.push(args); return Promise.resolve({ ok: true, json: async () => ({}) }); };
  setFamily(true);
  setWork(true);
  setFamily(false);
  assert.deepEqual(calls, []);
});

function keyEvent(key, { tag = 'BODY', contentEditable = false, ctrl = false, meta = false, alt = false } = {}) {
  const target = {
    nodeType: 1,
    tagName: tag,
    isContentEditable: !!contentEditable,
    getAttribute: (n) => (n === 'contenteditable' ? (contentEditable ? 'true' : null) : null),
    closest: (sel) => {
      const tags = { INPUT: 'input', TEXTAREA: 'textarea', SELECT: 'select' };
      if (tags[tag] && sel.includes(tags[tag])) return target;
      if (contentEditable && sel.includes('contenteditable')) return target;
      return null;
    },
  };
  const ev = {
    key, ctrlKey: ctrl, metaKey: meta, altKey: alt, target,
    defaultPrevented: false,
    preventDefault() { ev.defaultPrevented = true; this.defaultPrevented = true; },
  };
  return ev;
}

test('pressing W turns Work Mode on and never turns it off; fields and modifiers are ignored', () => {
  assert.equal(getModes().work, false);
  assert.equal(handleWorkHotkey(keyEvent('w')), true);
  assert.equal(getModes().work, true);
  assert.equal(globalThis.localStorage.getItem(WORK_KEY), '1');
  assert.match(globalThis.document.cookie, new RegExp(`${WORK_COOKIE}=1`));
  // A second W does not toggle it back off.
  assert.equal(handleWorkHotkey(keyEvent('w')), false);
  assert.equal(handleWorkHotkey(keyEvent('W')), false);
  assert.equal(getModes().work, true);

  setWork(false);
  assert.equal(getModes().work, false);
  // Typing contexts and modifier combinations must not arm the boss key.
  for (const ev of [
    keyEvent('w', { tag: 'INPUT' }),
    keyEvent('w', { tag: 'TEXTAREA' }),
    keyEvent('w', { tag: 'SELECT' }),
    keyEvent('w', { tag: 'DIV', contentEditable: true }),
    keyEvent('w', { ctrl: true }),
    keyEvent('w', { meta: true }),
    keyEvent('w', { alt: true }),
    keyEvent('x'),
  ]) {
    assert.equal(handleWorkHotkey(ev), false, `should ignore ${ev.key} ${ev.target.tagName} ctrl=${ev.ctrlKey} meta=${ev.metaKey} alt=${ev.altKey} ce=${ev.target.isContentEditable}`);
    assert.equal(getModes().work, false);
  }
  // W walks forward in the mine, EL HALO and the golf game: the boss key stays out of it there.
  for (const path of ['/mines', '/mines/', '/elhalo', '/foff']) assert.equal(handleWorkHotkey(keyEvent('w'), path), false, path);
  assert.equal(getModes().work, false);
  assert.equal(isTypingTarget(keyEvent('w', { tag: 'INPUT' }).target), true);
  assert.equal(isTypingTarget(keyEvent('w').target), false);
  // Bare W still works after those ignored presses, and still persists.
  const ev = keyEvent('W');
  assert.equal(handleWorkHotkey(ev), true);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(getModes().work, true);
  assert.equal(globalThis.localStorage.getItem(WORK_KEY), '1');
});

test('pressing W inside El Halo never turns Work Mode on, on any of its screens', () => {
  setWork(false);
  const empty = { querySelector: () => null };
  // The first-class route, with or without a trailing slash, query, or hash.
  for (const path of ['/elhalo', '/elhalo/', '/elhalo?wave=3', '/elhalo#lobby']) {
    assert.equal(isElHaloScreen(path, empty), true, path);
    assert.equal(handleWorkHotkey(keyEvent('w'), path, empty), false, path);
    assert.equal(handleWorkHotkey(keyEvent('W'), path, empty), false, path);
  }
  assert.equal(getModes().work, false);

  // The mounted room (Hall of Doors, or a stale pathname) is enough to keep the boss key out.
  const mounted = { querySelector: (sel) => (String(sel).includes('elhalo-room') ? { test: 'elhalo-room' } : null) };
  assert.equal(isElHaloScreen('/', mounted), true);
  assert.equal(handleWorkHotkey(keyEvent('w'), '/', mounted), false);
  assert.equal(getModes().work, false);

  // Once El Halo is gone, bare W on a normal page still arms Work Mode.
  assert.equal(isElHaloScreen('/', empty), false);
  assert.equal(handleWorkHotkey(keyEvent('w'), '/', empty), true);
  assert.equal(getModes().work, true);
  setWork(false);
});
