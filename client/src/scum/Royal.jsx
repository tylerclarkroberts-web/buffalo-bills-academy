// Royal commands: a tight King-only picker and a table-top replay of the Scum (and friends) acting it out.
import { useEffect, useRef, useState } from 'react';
import { royalSfx } from './royalSfx.js';
import { isMuted } from '../bj/sfx.js';
import { dialogAt, lyricAt, phaseAt, loadSongScript, getScript, songDurationMs } from './songScript.js';

export const ROYAL_MS = {
  jig: 2800, bow: 2500, milk: 4200, toot: 3200, fan: 3000, carpet: 3200,
  dunce: 2800, boots: 3200, get sing() { return songDurationMs(); }, serenade: 3200, train: 3400, sweep: 3000,
};

export function durationOf(cmd, audioDurationSec = null) {
  const hold = typeof window !== 'undefined' && Number(window.__scumRoyalMs);
  const base = cmd === 'sing' ? songDurationMs(getScript(), audioDurationSec) : (ROYAL_MS[cmd] || 3000);
  if (Number.isFinite(hold) && hold > 0) return Math.max(base, hold);
  return base;
}

export function RoyalPicker({ royal, onCommand, busy, step, setStep }) {
  if (!royal?.canCommand) return null;
  const catalog = royal.catalog || [];
  if (step === 'target') {
    return (
      <div className="sc-royal-pick" data-test="scum-royal-picker" data-step="target">
        <div className="sc-royal-hd">
          <b>Who toots?</b>
          <button type="button" className="btn ghost tiny" onClick={() => setStep('pick')} data-test="scum-royal-back">Back</button>
        </div>
        <div className="sc-royal-targets" role="group" aria-label="Pick who toots">
          {(royal.targets || []).map((t) => (
            <button key={t.seat} type="button" className="sc-royal-cmd" disabled={busy} data-test={`scum-royal-target-${t.seat}`}
              onClick={() => onCommand('toot', t.seat)}>{t.me ? 'Me' : t.name}{t.bot ? ' 🤖' : ''}</button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="sc-royal-pick" data-test="scum-royal-picker">
      <div className="sc-royal-hd"><b>Royal command</b><span>one this round</span></div>
      <div className="sc-royal-grid" role="group" aria-label="Royal command">
        {catalog.map((c) => (
          <button key={c.id} type="button" className="sc-royal-cmd" disabled={busy} data-test={`scum-royal-cmd-${c.id}`}
            onClick={() => (c.needsTarget ? setStep('target') : onCommand(c.id))}>{c.short || c.label}</button>
        ))}
      </div>
    </div>
  );
}

export function RoyalRewatch({ history, onRewatch }) {
  if (!history?.length) return null;
  const last = history[history.length - 1];
  return (
    <button type="button" className="btn ghost small sc-royal-rewatch" data-test="scum-royal-rewatch"
      title="Rewatch the last royal command" aria-label="Rewatch the last royal command"
      onClick={() => onRewatch(last)}>♛</button>
  );
}

/** Overlay props + skip/dismiss. Seat CSS classes are applied by the table from `ev`. */
function useElapsed(active) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t0 = performance.now();
    let id;
    const tick = () => { setMs(performance.now() - t0); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active]);
  return ms;
}

export function RoyalPlay({ ev, pos, onSkip, onDone, reduced }) {
  const done = useRef(false);
  const elapsed = useElapsed(ev.cmd === 'sing' && !reduced);
  const script = useSongScript(ev.cmd === 'sing');
  const phase = ev.cmd === 'sing' ? (reduced ? 'song' : phaseAt(elapsed, script)) : ev.cmd;
  useEffect(() => {
    done.current = false;
    let t, cancelled = false;
    (async () => {
      let audioDur = null;
      if (ev.cmd === 'sing') {
        await loadSongScript();
        if (cancelled) return;
        if (!reduced) {
          const el = await royalSfx.play('sing');
          if (el && Number.isFinite(el.duration)) audioDur = el.duration;
        }
      } else if (!isMuted() && !reduced) {
        royalSfx.play(ev.cmd);
      }
      if (cancelled) return;
      const ms = reduced ? (ev.cmd === 'sing' ? 1600 : 400) : durationOf(ev.cmd, audioDur);
      t = setTimeout(() => { if (!done.current) { done.current = true; royalSfx.stop?.(); onDone(); } }, ms);
    })();
    return () => { cancelled = true; clearTimeout(t); royalSfx.stop?.(); };
  }, [ev.id, ev.cmd]);
  const skip = () => { if (!done.current) { done.current = true; royalSfx.stop?.(); onSkip(); } };
  const at = (seat, extra = {}) => {
    const p = pos?.[seat];
    if (!p) return { display: 'none' };
    return { left: `${p.x}%`, top: `${p.y}%`, ...extra };
  };
  const cmd = ev.cmd;
  return (
    <div className={`sc-royal-play cmd-${cmd}`} data-test="scum-royal-play" data-cmd={cmd} data-phase={ev.cmd === 'sing' ? phase : undefined} data-id={ev.id} onClick={skip} role="dialog" aria-label={ev.caption}>
      {cmd !== 'sing' && <div className="sc-royal-caption" data-test="scum-royal-caption">{ev.caption}</div>}
      <button type="button" className="btn ghost small sc-royal-skip" data-test="scum-royal-skip" onClick={(e) => { e.stopPropagation(); skip(); }}>Skip</button>
      {cmd === 'milk' && <>
        <span className="sc-royal-prop milk-glass" style={at(ev.scumSeat)} aria-hidden="true">🥛</span>
        <span className="sc-royal-prop milk-sip" style={at(ev.kingSeat)} aria-hidden="true">🥛</span>
      </>}
      {cmd === 'toot' && <>
        <span className="sc-royal-prop toot-cloud" style={at(ev.targetSeat ?? ev.kingSeat)} aria-hidden="true">💨</span>
        <span className="sc-royal-prop toot-hit" style={at(ev.scumSeat)} aria-hidden="true">💚</span>
      </>}
      {cmd === 'fan' && <span className="sc-royal-prop palm" style={at(ev.scumSeat)} aria-hidden="true">🌴</span>}
      {cmd === 'carpet' && <span className="sc-royal-carpet" style={carpetStyle(pos, ev.scumSeat, ev.kingSeat)} aria-hidden="true" />}
      {cmd === 'dunce' && <span className="sc-royal-prop dunce" style={at(ev.scumSeat)} aria-hidden="true">▲</span>}
      {cmd === 'boots' && <span className="sc-royal-prop sparkle" style={at(ev.kingSeat)} aria-hidden="true">✨</span>}
      {cmd === 'serenade' && <span className="sc-royal-prop notes" style={at(ev.scumSeat)} aria-hidden="true">🎵🎶</span>}
      {cmd === 'sing' && <SongScene ev={ev} pos={pos} at={at} reduced={reduced} elapsed={elapsed} script={script} />}
      {cmd === 'train' && <span className="sc-royal-cape" style={at(ev.kingSeat)} aria-hidden="true" />}
      {cmd === 'sweep' && <span className="sc-royal-prop broom" style={at(ev.scumSeat)} aria-hidden="true">🧹</span>}
    </div>
  );
}



function useSongScript(active) {
  const [script, setScript] = useState(() => getScript());
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    loadSongScript().then((s) => { if (live && s) setScript(s); });
    return () => { live = false; };
  }, [active]);
  return script;
}

function SongScene({ ev, pos, at, reduced, elapsed = 0, script }) {
  const [audioSec, setAudioSec] = useState(null);
  useEffect(() => {
    if (reduced) return undefined;
    let id;
    const tick = () => { setAudioSec(royalSfx.songTime?.() ?? null); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  if (!script) return null;
  const t = reduced ? script.songStart + 800 : elapsed;
  const talk = dialogAt(t, script);
  const line = lyricAt(t, script, audioSec);
  const king = ev.kingSeat, scum = ev.scumSeat;
  const bubbleAt = (seat) => {
    const p = pos?.[seat];
    if (!p) return { display: 'none' };
    const y = Math.min(72, Math.max(16, p.y - 12));
    return { left: `${p.x}%`, top: `${y}%` };
  };
  return (
    <>
      {talk && (
        <div className={`sc-royal-bubble who-${talk.who}`} data-test="scum-royal-bubble" data-who={talk.who} data-side={pos?.[talk.who === 'king' ? king : scum]?.x > 62 ? 'east' : pos?.[talk.who === 'king' ? king : scum]?.x < 38 ? 'west' : 'mid'} style={bubbleAt(talk.who === 'king' ? king : scum)}>
          {talk.text}
        </div>
      )}
      {line && (
        <div className="sc-royal-karaoke" data-test="scum-royal-karaoke" data-line={line.i} role="status">
          {line.text}
        </div>
      )}
      {t >= script.songStart && <TomatoMess style={at(king)} />}
    </>
  );
}

function TomatoMess({ style }) {
  return (
    <div className="sc-royal-tomatoes" style={style} data-test="scum-royal-tomatoes" aria-hidden="true">
      <span className="sc-tomato hand">🍅</span>
      <span className="sc-tomato-stain" />
      <span className="sc-splat s1" /><span className="sc-splat s2" /><span className="sc-splat s3" /><span className="sc-splat s4" />
      <span className="sc-tomato roll r1">🍅</span>
      <span className="sc-tomato roll r2">🍅</span>
      <span className="sc-tomato roll r3">🍅</span>
    </div>
  );
}

function carpetStyle(pos, from, to) {
  const a = pos?.[from], b = pos?.[to];
  if (!a || !b) return { display: 'none' };
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.max(8, Math.hypot(dx, dy));
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  return { left: `${a.x}%`, top: `${a.y}%`, width: `${len}%`, '--ang': `${ang}deg`, transformOrigin: '0 50%' };
}

export function seatRoyalClass(ev, seat) {
  if (!ev || seat == null) return '';
  const bits = [];
  if (seat === ev.scumSeat) bits.push('royal-scum', `royal-${ev.cmd}`);
  if (seat === ev.kingSeat) bits.push('royal-king', `royal-king-${ev.cmd}`);
  if (ev.cmd === 'toot' && seat === ev.targetSeat) bits.push('royal-tooter');
  return bits.join(' ');
}
