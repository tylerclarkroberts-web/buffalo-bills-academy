// "Sing me a song": parse the editable public script and time the scene.
// Edit lines in client/public/scum/song/script.txt (not here).
// Optional audio: client/public/scum/song/song.mp3
export const SCRIPT_URL = '/scum/song/script.txt';
export const AUDIO_URL = '/scum/song/song.mp3';
export const SCRIPT_FILE = 'client/public/scum/song/script.txt';
export const AUDIO_FILE = 'client/public/scum/song/song.mp3';

export function parseScript(text) {
  const dialogue = [], lyrics = [];
  let songStart = null, hold = 2200, section = 'dialogue';
  if (typeof text !== 'string') throw new Error('Song script must be text');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const song = line.match(/^SONG(?:\s+(\d+(?:\.\d+)?))?\s*$/i);
    if (song) {
      section = 'lyrics';
      if (song[1] != null) songStart = Math.round(Number(song[1]) * 1000);
      continue;
    }
    const holdM = line.match(/^HOLD(?:\s+(\d+(?:\.\d+)?))\s*$/i);
    if (holdM) { hold = Math.round(Number(holdM[1]) * 1000); continue; }
    const dlg = line.match(/^(\d+(?:\.\d+)?)\s+(KING|SCUM)\s*:\s*(.+)$/i);
    if (dlg && section === 'dialogue') {
      dialogue.push({ at: Math.round(Number(dlg[1]) * 1000), who: dlg[2].toLowerCase(), text: dlg[3].trim() });
      continue;
    }
    const lyr = line.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (lyr && section === 'lyrics') {
      lyrics.push({ at: Math.round(Number(lyr[1]) * 1000), text: lyr[2].trim() });
      continue;
    }
    throw new Error(`Bad song script line: ${raw}`);
  }
  if (!dialogue.length) throw new Error('Song script needs at least one KING:/SCUM: line');
  if (!lyrics.length) throw new Error('Song script needs a SONG line and at least one lyric');
  if (songStart == null) songStart = dialogue.at(-1).at + 3000;
  return { dialogue, lyrics, songStart, hold };
}

let _script = null;
let _loading = null;

export function setScript(script) { _script = script; return script; }
export function getScript() { return _script; }

export async function loadSongScript() {
  if (_loading) return _loading;
  if (typeof fetch !== 'function') return _script;
  _loading = (async () => {
    try {
      const r = await fetch(SCRIPT_URL, { cache: 'no-cache' });
      if (r.ok) _script = parseScript(await r.text());
    } catch { /* keep whatever we had */ }
    _loading = null;
    return _script;
  })();
  return _loading;
}

if (typeof window !== 'undefined') loadSongScript();

export function songDurationMs(script = _script, audioDurationSec = null) {
  const start = script?.songStart ?? 9400;
  const last = script?.lyrics?.at(-1)?.at ?? 15200;
  const hold = script?.hold ?? 2200;
  if (Number.isFinite(audioDurationSec) && audioDurationSec > 0) {
    return start + Math.max(last, audioDurationSec * 1000) + 400;
  }
  return start + last + hold;
}

/** Current dialog line at elapsed ms (from scene start). */
export function dialogAt(ms, script = _script) {
  if (!script) return null;
  let cur = null;
  for (const d of script.dialogue) { if (ms >= d.at && ms < script.songStart) cur = d; }
  return cur;
}

/**
 * Current lyric. If audioSec is a number, it is audio.currentTime (seconds into
 * song.mp3 / the song) and that clock wins. Otherwise elapsed ms from scene start.
 */
export function lyricAt(ms, script = _script, audioSec = null) {
  if (!script) return null;
  let t;
  if (audioSec != null && Number.isFinite(audioSec)) t = audioSec * 1000;
  else {
    if (ms < script.songStart) return null;
    t = ms - script.songStart;
  }
  let cur = null, i = -1;
  for (let k = 0; k < script.lyrics.length; k++) {
    if (t >= script.lyrics[k].at) { cur = script.lyrics[k]; i = k; }
  }
  return cur ? { ...cur, i } : null;
}

export function phaseAt(ms, script = _script) {
  if (!script) return 'talk';
  return ms >= script.songStart ? 'song' : 'talk';
}

// Compatibility names used by tests/e2e when a script has already been set, or
// when callers pass the parsed public file themselves.
export function scriptFields(script = _script) {
  return {
    SONG_DIALOG: script?.dialogue || [],
    SONG_LYRICS: script?.lyrics || [],
    SONG_START: script?.songStart ?? 0,
    SONG_HOLD: script?.hold ?? 2200,
    SONG_MS: songDurationMs(script),
  };
}

// Original flute line (Hz), offsets from the start of the song. Used only when
// song.mp3 is missing. Rising then settling — not a known film theme.
const A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392, A4 = 440, B4 = 493.88, C5 = 523.25, D5 = 587.33;
export const SONG_NOTES = [
  { at: 0, freq: E4, dur: 0.35 }, { at: 0.32, freq: G4, dur: 0.32 }, { at: 0.62, freq: A4, dur: 0.4 },
  { at: 1.05, freq: C5, dur: 0.45 }, { at: 1.5, freq: A4, dur: 0.35 }, { at: 1.85, freq: G4, dur: 0.5 },
  { at: 2.4, freq: G4, dur: 0.32 }, { at: 2.7, freq: A4, dur: 0.32 }, { at: 3.02, freq: B4, dur: 0.4 },
  { at: 3.45, freq: A4, dur: 0.35 }, { at: 3.8, freq: G4, dur: 0.35 }, { at: 4.15, freq: E4, dur: 0.55 },
  { at: 4.8, freq: A4, dur: 0.35 }, { at: 5.15, freq: C5, dur: 0.4 }, { at: 5.55, freq: D5, dur: 0.45 },
  { at: 6.05, freq: C5, dur: 0.35 }, { at: 6.4, freq: A4, dur: 0.7 },
  { at: 7.2, freq: G4, dur: 0.35 }, { at: 7.55, freq: A4, dur: 0.35 }, { at: 7.9, freq: C5, dur: 0.4 },
  { at: 8.35, freq: B4, dur: 0.35 }, { at: 8.7, freq: A4, dur: 0.35 }, { at: 9.05, freq: G4, dur: 0.5 },
  { at: 9.6, freq: E4, dur: 0.5 }, { at: 10.15, freq: A4, dur: 0.9 },
  { at: 11.4, freq: D4, dur: 0.45 }, { at: 11.9, freq: G4, dur: 0.9 },
  { at: 13.2, freq: E4, dur: 0.4 }, { at: 13.65, freq: G4, dur: 0.4 }, { at: 14.1, freq: A4, dur: 0.85 },
  { at: 15.2, freq: E4, dur: 0.45 }, { at: 15.7, freq: C4, dur: 0.5 }, { at: 16.25, freq: A3, dur: 1.3 },
];
