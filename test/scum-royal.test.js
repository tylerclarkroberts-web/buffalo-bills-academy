// Royal commands: the King may order the Scum to do one cosmetic bit of business per round.
// Nothing here changes cards, titles, turns, or bankroll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scum } from '../server/scum/index.js';
import { COMMANDS, byId, caption, court } from '../server/scum/royal.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function svc() {
  const clock = { t: 1_800_000_000_000 };
  const docs = {}; const players = { a: { id: 'a', name: 'Ann', bankroll: 500 }, b: { id: 'b', name: 'Bob', bankroll: 500 }, c: { id: 'c', name: 'Cat', bankroll: 500 }, d: { id: 'd', name: 'Dee', bankroll: 500 } };
  const store = { loadDoc: (n, d) => (docs[n] ||= d), saveDoc: (n, d) => { docs[n] = JSON.parse(JSON.stringify(d)); } };
  let k = 42; const rng = (n) => (k = (k * 1103515245 + 12345) % 2147483648) % n;
  const s = new Scum({ store, getPlayer: (id) => players[id], now: () => clock.t, rng, tickMs: 0, botMs: 1000, payouts: false });
  return { s, clock, docs, P: players };
}
function rig(t, hands, order, turn = order[0]) {
  Object.assign(t.round, { phase: 'play', order, hands, pile: null, owner: null, turn, finished: [], gone: [], exchange: null, passed: [], playOn: false, skipped: null });
}
/** Ann King, Bob Queen, Cat Baby Scum, Dee Scum — then the exchange starts. */
function toTitles(s, P) {
  const v = s.create(P.a, { settings: { bots: 0 } }); s.join(P.b, v.code); s.join(P.c, v.code); s.join(P.d, v.code); s.start(P.a, v.code);
  const t = s.table(v.code);
  rig(t, { 0: ['3h'], 1: ['Kh'], 2: ['4c', '6c'], 3: ['5d', '7d'] }, [0, 1, 2, 3]);
  s.play(P.a, v.code, ['3h']);
  s.play(P.b, v.code, ['Kh']);
  s.pass(P.c, v.code); s.pass(P.d, v.code);
  s.play(P.c, v.code, ['4c']); s.play(P.d, v.code, ['5d']); s.play(P.c, v.code, ['6c']);
  return { s, P, code: v.code, t: s.table(v.code) };
}

test('the catalog has the named bits plus more, and toot needs a target', () => {
  const ids = COMMANDS.map((c) => c.id);
  assert.ok(ids.includes('jig') && ids.includes('bow') && ids.includes('milk') && ids.includes('toot'));
  assert.ok(ids.includes('fan') && ids.includes('carpet') && ids.includes('dunce') && ids.includes('boots'));
  assert.ok(ids.includes('sing') && ids.includes('train') && ids.includes('sweep'));
  assert.ok(!ids.includes('serenade'), 'serenade was replaced by sing');
  assert.equal(byId.sing.label, 'Sing me a song');
  assert.match(caption({ cmd: 'sing' }, { scum: 'Dee', king: 'Ann' }), /Dee sings Ann a song/);
  assert.match(caption({ cmd: 'serenade' }, { scum: 'Dee', king: 'Ann' }), /serenades/, 'old events still caption');
  assert.equal(COMMANDS.length, 11);
  assert.equal(byId.toot.needsTarget, true);
  assert.equal(COMMANDS.filter((c) => c.needsTarget).length, 1);
  assert.match(caption({ cmd: 'jig' }, { scum: 'Dee', king: 'Ann' }), /Dee does a jig/);
});

test('only the King may command, once per round, and nothing about the game moves', () => {
  const { s, P, code, t } = toTitles(...(() => { const x = svc(); return [x.s, x.P]; })());
  const before = {
    hands: JSON.stringify(t.round.hands), titles: { ...t.titles }, bank: { a: P.a.bankroll, d: P.d.bankroll },
    phase: t.round.phase, seq: t.seq, turn: t.round.turn,
  };
  const ann = s.view(P.a, code);
  assert.equal(ann.royal.canCommand, true);
  assert.equal(ann.royal.kingSeat, 0);
  assert.equal(ann.royal.scumSeat, 3);
  assert.equal(ann.seats[0].title, 'king');
  assert.equal(ann.seats[3].title, 'scum');
  assert.throws(() => s.command(P.d, code, { cmd: 'jig' }), /Only the King/);
  assert.throws(() => s.command(P.b, code, { cmd: 'jig' }), /Only the King/);
  const after = s.command(P.a, code, { cmd: 'jig' });
  assert.equal(after.royal.canCommand, false);
  assert.equal(after.royal.issuedThisRound, true);
  assert.equal(after.royal.history.at(-1).cmd, 'jig');
  assert.equal(after.royal.pending, null, 'the King already watched it');
  const dee = s.view(P.d, code);
  assert.equal(dee.royal.pending.cmd, 'jig');
  assert.match(dee.royal.pending.caption, /Dee does a jig/);
  assert.match(dee.log.at(-1).text, /Ann commands Dee: Do a jig/);
  assert.equal(dee.log.at(-1).ev.k, 'royal');
  // gameplay frozen
  assert.equal(JSON.stringify(t.round.hands), before.hands);
  assert.deepEqual(t.titles, before.titles);
  assert.equal(t.round.phase, before.phase);
  assert.equal(P.a.bankroll, before.bank.a);
  assert.equal(P.d.bankroll, before.bank.d);
  assert.throws(() => s.command(P.a, code, { cmd: 'bow' }), /already issued/);
});

test('toot needs another player at the table; a miss or the Scum is refused', () => {
  const x = svc(); const { s, P, code } = toTitles(x.s, x.P);
  assert.throws(() => s.command(P.a, code, { cmd: 'toot' }), /tooting/);
  assert.throws(() => s.command(P.a, code, { cmd: 'toot', targetSeat: 3 }), /tooting/, 'cannot toot with the Scum');
  const v = s.command(P.a, code, { cmd: 'toot', targetSeat: 1 });
  assert.equal(v.royal.history.at(-1).targetSeat, 1);
  assert.equal(v.royal.history.at(-1).targetName, 'Bob');
  assert.match(s.view(P.c, code).royal.pending.caption, /Bob toots in Dee/);
});

test('each player sees the replay once; skip marks it seen; rewatch stays in history', () => {
  const x = svc(); const { s, P, code } = toTitles(x.s, x.P);
  s.command(P.a, code, { cmd: 'milk' });
  const cat = s.view(P.c, code);
  assert.equal(cat.royal.pending.cmd, 'milk');
  const after = s.seenRoyal(P.c, code, { id: cat.royal.pending.id });
  assert.equal(after.royal.pending, null);
  assert.equal(after.royal.history.at(-1).cmd, 'milk');
  const again = s.view(P.c, code);
  assert.equal(again.royal.pending, null);
  const bob = s.view(P.b, code);
  assert.equal(bob.royal.pending.cmd, 'milk', 'Bob has not seen it yet');
});

test('a bot King cannot issue a command; a human King can command a bot Scum', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 2 } });
  s.start(P.a, v.code);
  const t = s.table(v.code);
  // Force titles: Ann commoner-ish, seat 1 bot is King, seat 2 bot is Scum — actually we want Ann as King and a bot as Scum.
  t.titles = { 0: 'king', 1: 'commoner', 2: 'scum' };
  t.lastRound = { no: 1, finish: [{ seat: 0, name: 'Ann', title: 'king' }, { seat: 1, name: t.seats[1].name, title: 'commoner' }, { seat: 2, name: t.seats[2].name, title: 'scum' }] };
  t.status = 'playing';
  const view = s.view(P.a, v.code);
  assert.equal(view.royal.canCommand, true);
  assert.ok(view.seats[2].bot);
  const out = s.command(P.a, v.code, { cmd: 'dunce' });
  assert.equal(out.royal.history.at(-1).cmd, 'dunce');
  assert.equal(out.royal.history.at(-1).scumSeat, 2);
});

test('court helper stays closed until a round has finished', () => {
  const { s, P } = svc();
  const v = s.create(P.a, { settings: { bots: 0 } });
  assert.equal(court(s.table(v.code), 'a').canCommand, false);
  assert.throws(() => s.command(P.a, v.code, { cmd: 'jig' }), /No court yet/);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the picker is compact, the Scum does not press anything, and there is a skip plus rewatch', () => {
  const page = read('client/src/scum/ScumPage.jsx');
  const royal = read('client/src/scum/Royal.jsx');
  const css = read('client/src/scum/scum.css');
  assert.match(page, /RoyalPicker/);
  assert.match(page, /RoyalPlay/);
  assert.match(page, /RoyalRewatch/);
  assert.match(royal, /data-test="scum-royal-picker"/);
  assert.match(royal, /data-test="scum-royal-skip"/);
  assert.match(royal, /data-test="scum-royal-rewatch"/);
  assert.match(royal, /needsTarget \? setStep\('target'\)/);
  assert.doesNotMatch(royal, /data-test="scum-royal-scum-go"/, 'the Scum has no confirm button');
  assert.match(css, /\.sc-royal-pick/);
  assert.match(css, /grid-template-columns: 1fr 1fr/);
  assert.match(css, /overflow: hidden/);
  assert.match(css, /\.sc-seat\.royal-jig/);
  assert.match(css, /\.sc-seat\.royal-toot \.bust/);
  assert.match(css, /sc-royal-green/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*sc-royal-pick/);
});


import { parseScript, songDurationMs, dialogAt, lyricAt, phaseAt, SONG_NOTES, SCRIPT_FILE, AUDIO_FILE, AUDIO_URL, SCRIPT_URL } from '../client/src/scum/songScript.js';

test('Sing me a song is driven by the public script file, with lyrics syncable to audio.currentTime', () => {
  const raw = read(SCRIPT_FILE);
  assert.match(raw, /^# Sing me a song/m);
  assert.match(raw, /client\/public\/scum\/song\/song\.mp3/);
  assert.match(raw, /KING:/);
  const script = parseScript(raw);
  const { dialogue: SONG_DIALOG, lyrics: SONG_LYRICS, songStart: SONG_START } = script;
  const SONG_MS = songDurationMs(script);
  assert.equal(COMMANDS.filter((c) => c.id === 'sing').length, 1);
  assert.ok(SONG_DIALOG.length >= 3, 'at least three spoken lines');
  assert.equal(SONG_DIALOG[0].who, 'king');
  assert.equal(SONG_DIALOG[1].who, 'scum');
  assert.equal(SONG_DIALOG[2].who, 'king');
  assert.ok(SONG_DIALOG.every((d) => d.text.trim().length > 0), 'every spoken line has text from the public script');
  assert.equal(dialogAt(SONG_DIALOG[0].at + 100, script).who, 'king');
  assert.equal(dialogAt(SONG_DIALOG[1].at + 100, script).who, 'scum');
  assert.equal(dialogAt(SONG_DIALOG[2].at + 100, script).who, 'king');
  assert.equal(dialogAt(SONG_START, script), null);
  assert.equal(phaseAt(100, script), 'talk');
  assert.equal(phaseAt(SONG_START, script), 'song');
  assert.ok(SONG_LYRICS.length >= 4, `lyrics ${SONG_LYRICS.length}`);
  assert.ok(SONG_LYRICS.every((l) => l.text.trim().length > 0), 'every lyric comes from the public script');
  assert.equal(lyricAt(SONG_START + SONG_LYRICS[0].at, script).i, 0);
  assert.equal(lyricAt(SONG_START + SONG_LYRICS[3].at + 10, script).i, 3);
  assert.equal(lyricAt(0, script, SONG_LYRICS[0].at / 1000).i, 0, 'audio.currentTime at the first cue shows the first lyric');
  assert.equal(lyricAt(0, script, (SONG_LYRICS[3].at + 10) / 1000).i, 3, 'lyrics follow audio.currentTime even mid-dialogue clock');
  assert.equal(SONG_MS, songDurationMs(script));
  assert.ok(SONG_MS > SONG_START + SONG_LYRICS.at(-1).at, `SONG_MS ${SONG_MS}`);
  assert.ok(songDurationMs(script, 20) >= SONG_START + 20000, 'scene lasts at least as long as song.mp3');
  assert.match(read('client/src/scum/Royal.jsx'), /songDurationMs/);
  assert.ok(SONG_NOTES.length >= 16, 'flute fallback theme is still present');
  const gaps = SONG_DIALOG.slice(1).map((d, i) => d.at - SONG_DIALOG[i].at);
  assert.ok(gaps.every((g) => g >= 2500), 'each spoken line is held long enough to read');
  const lyricGaps = SONG_LYRICS.slice(1).map((d, i) => d.at - SONG_LYRICS[i].at);
  assert.ok(lyricGaps.every((g) => g >= 1600), 'each lyric is held long enough to read');
  assert.equal(AUDIO_FILE, 'client/public/scum/song/song.mp3');
  assert.equal(SCRIPT_URL, '/scum/song/script.txt');
  assert.equal(AUDIO_URL, '/scum/song/song.mp3');
  assert.throws(() => parseScript('0.0 KING: hi\n'), /lyric/i);
  const skipped = parseScript('# just a comment\n0 KING: Hello.\nSONG 1\n0 Hi\n');
  assert.equal(skipped.dialogue[0].text, 'Hello.');
});

test('the King can issue Sing me a song; skip and rewatch still go through seen/history', () => {
  const x = svc(); const { s, P, code } = toTitles(x.s, x.P);
  const out = s.command(P.a, code, { cmd: 'sing' });
  assert.equal(out.royal.history.at(-1).cmd, 'sing');
  assert.match(out.royal.history.at(-1).caption, /Dee sings Ann a song/);
  assert.match(s.view(P.d, code).log.at(-1).text, /Sing me a song/);
  const dee = s.view(P.d, code);
  assert.equal(dee.royal.pending.cmd, 'sing');
  const after = s.seenRoyal(P.d, code, { id: dee.royal.pending.id });
  assert.equal(after.royal.pending, null);
  assert.equal(after.royal.history.at(-1).cmd, 'sing');
});

test('the song scene has bubbles, karaoke, a step-aside, tomatoes, and a mute-aware flute', () => {
  const royal = read('client/src/scum/Royal.jsx');
  const css = read('client/src/scum/scum.css');
  const sfx = read('client/src/scum/royalSfx.js');
  assert.match(royal, /data-test="scum-royal-bubble"/);
  assert.match(royal, /data-test="scum-royal-karaoke"/);
  assert.match(royal, /data-test="scum-royal-tomatoes"/);
  assert.match(royal, /data-phase/);
  assert.match(css, /sc-royal-karaoke/);
  assert.match(css, /sc-royal-bubble/);
  assert.match(css, /sc-tomato-eat/);
  assert.match(css, /sc-tomato-roll/);
  assert.match(css, /royal-king-sing/);
  assert.match(css, /royal-sing/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*sc-royal-karaoke/);
  assert.match(sfx, /function flute/);
  assert.match(sfx, /createOscillator/);
  assert.match(sfx, /isMuted/);
  assert.match(sfx, /SONG_NOTES/);
  assert.match(sfx, /lfo/);
  assert.match(sfx, /AUDIO_URL/);
  assert.match(sfx, /probeSongMp3/);
  assert.match(sfx, /songTime/);
  assert.match(read('client/src/scum/songScript.js'), /script\.txt/);
});
