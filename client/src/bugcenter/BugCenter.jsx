// v75: the Bug Center, an option inside the Barn (/barn/center). A clinic in the spirit of the handheld classics:
// a reception counter with the nurse behind it, the healing machine, a tiled floor, waiting benches and a PC in the
// corner. Original pixel art (SVG rects), every sign and line in Japanese (訳 shows the English). Talking to Nurse
// Hikari heals a fainted bug to full, free, while its pod lights up the machine to a little WebAudio jingle.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import Dizzy from '../barn/Dizzy.jsx';
import { NURSE, greeting, WAIT, done, NO, OOPS, SIGNS } from './script.js';
import { healChime, podBlip } from './chime.js';
import './bugcenter.css';

const W = 160, H0 = 112; // a portrait phone gets a deeper room (more floor), never a narrower one
const SOUND_KEY = 'bba.centerSound';
const PORTRAIT = '/bugcenter/hikari.webp';

function Sign({ k, en, x, y, H, size = 1, className = '' }) {
  const s = SIGNS[k];
  return (
    <span className={`bc-sign bc-sign-${k} ${className}`} style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, '--s': size }} lang="ja" title={s.en} data-test={`sign-${k}`}>
      {s.rt ? <ruby>{s.ja}<rt>{s.rt}</rt></ruby> : s.ja}
      {en && <small lang="en">{s.en}</small>}
    </span>
  );
}

/** Nurse Hikari as a little sprite behind the counter (the big portrait is for talking). */
function NurseSprite({ bow }) {
  const r = (x, y, w, h, f) => <rect x={x} y={y} width={w} height={h} fill={f} />;
  return (
    <g className={`bc-nurse ${bow ? 'bow' : ''}`}>
      {r(71, 33, 18, 22, '#e9767c')}{/* hair, back */}
      {r(73, 46, 14, 12, '#9fe3c8')}{r(78, 46, 4, 12, '#ffffff')}{r(77, 46, 6, 2, '#ffffff')}{/* uniform */}
      {r(86, 44, 3, 10, '#e9767c')}{r(86, 54, 3, 1, '#ffe37a')}{/* side braid + firefly tie */}
      {r(74, 35, 12, 11, '#ffe2d2')}{/* face */}
      {r(73, 33, 14, 4, '#f08a8e')}{r(73, 37, 2, 5, '#f08a8e')}{r(85, 37, 2, 6, '#f08a8e')}{/* bangs */}
      {r(75, 30, 10, 4, '#ffffff')}{r(79, 31, 2, 2, '#6fcfa8')}{/* cap */}
      {r(76, 27, 1, 3, '#6fcfa8')}{r(83, 27, 1, 3, '#6fcfa8')}{r(75, 26, 2, 2, '#6fcfa8')}{r(83, 26, 2, 2, '#6fcfa8')}{/* antenna ribbons */}
      {r(77, 39, 2, 2, '#4a2a2a')}{r(81, 40, 3, 1, '#4a2a2a')}{/* one eye open, one wink */}
      {r(76, 42, 2, 1, '#f7a3a8')}{r(82, 42, 2, 1, '#f7a3a8')}{r(79, 43, 2, 1, '#c45a64')}
    </g>
  );
}

function Room({ H, lit, pod, bow, en, onNurse }) {
  const by = H - 22, my = H - 8; // benches and the door mat sit at the front of the room
  const r = (x, y, w, h, f, extra = {}) => <rect x={x} y={y} width={w} height={h} fill={f} {...extra} />;
  const slots = [[104, 49], [111, 49], [118, 49], [104, 54], [111, 54], [118, 54]];
  return (
    <>
      <svg className="bc-room" viewBox={`0 0 ${W} ${H}`} shapeRendering="crispEdges" aria-hidden="true">
        <defs>
          <pattern id="bc-tiles" width="16" height="16" patternUnits="userSpaceOnUse">
            {r(0, 0, 16, 16, '#fff3f0')}{r(0, 0, 8, 8, '#f6c6cc')}{r(8, 8, 8, 8, '#f6c6cc')}{r(0, 0, 16, 1, '#ead6d2')}
          </pattern>
        </defs>
        {r(0, 0, W, 58, '#fdebe6')}{r(0, 0, W, 5, '#e65d70')}{r(0, 5, W, 1, '#ffffff')}{r(0, 44, W, 3, '#e65d70')}{r(0, 47, W, 11, '#f7d5cf')}
        {r(0, 58, W, H - 58, 'url(#bc-tiles)')}
        {/* big sign plate */}{r(50, 8, 60, 13, '#ffffff')}{r(50, 8, 60, 1, '#e65d70')}{r(50, 20, 60, 1, '#e65d70')}{r(50, 8, 1, 13, '#e65d70')}{r(109, 8, 1, 13, '#e65d70')}
        {/* clinic emblem: a heart with antennae */}{r(76, 22, 3, 3, '#e65d70')}{r(81, 22, 3, 3, '#e65d70')}{r(77, 25, 6, 2, '#e65d70')}{r(79, 27, 2, 1, '#e65d70')}{r(77, 20, 1, 2, '#6fcfa8')}{r(82, 20, 1, 2, '#6fcfa8')}
        {/* healing machine */}
        <g className={`bc-machine ${lit ? 'lit' : ''}`}>
          {r(98, 36, 27, 23, '#6b7280')}{r(99, 37, 25, 21, '#dfe4ec')}{r(101, 39, 21, 5, '#24384a')}{r(102, 41, 6, 1, '#7dffb0', { className: 'bc-scan' })}
          {slots.map(([x, y], i) => <g key={i}>{r(x - 2, y - 2, 5, 4, '#8a93a0')}{r(x - 1, y - 1, 3, 2, lit ? '#ffe36e' : '#b9c1cc', { className: lit ? `bc-light l${i}` : '' })}</g>)}
          {pod && <g className="bc-pod" data-test="bc-pod">{r(102, 46, 5, 2, '#ff8fa0')}{r(102, 48, 5, 2, '#ffffff')}{r(102, 47, 5, 1, '#3a2a2a')}</g>}
        </g>
        {/* PC corner */}
        {r(4, 63, 26, 3, '#a26a44')}{r(6, 66, 2, 10, '#7a4e30')}{r(26, 66, 2, 10, '#7a4e30')}
        {r(8, 47, 18, 15, '#c9d0d8')}{r(10, 49, 14, 10, '#3d8bea', { className: 'bc-screen' })}{r(15, 62, 4, 1, '#9aa3ad')}{r(9, 62, 16, 1, '#e5e8ec')}
        {/* plants */}
        {r(40, 52, 6, 6, '#c9744a')}{r(39, 44, 8, 8, '#3fa36b')}{r(41, 41, 4, 4, '#57c27f')}
        {r(132, 52, 6, 6, '#c9744a')}{r(131, 44, 8, 8, '#3fa36b')}{r(133, 41, 4, 4, '#57c27f')}
        {/* nurse, then the counter in front of her */}
        <g onClick={onNurse} className="bc-nurse-hit" data-test="bc-nurse">
          <NurseSprite bow={bow} />
          {r(68, 24, 24, 36, 'transparent')}
        </g>
        {r(32, 57, 96, 4, '#ffffff')}{r(34, 61, 92, 12, '#e2545f')}{r(34, 66, 92, 2, '#c03a48')}{r(34, 73, 92, 2, '#a52f3c')}
        {r(56, 55, 8, 2, '#ffe37a')}{r(57, 53, 6, 2, '#fff7c2')}{/* the little bell */}
        {/* waiting benches */}
        {r(8, by + 3, 36, 5, '#4a90c8')}{r(8, by, 36, 3, '#6aaee0')}{r(10, by + 8, 2, 6, '#2f5f86')}{r(40, by + 8, 2, 6, '#2f5f86')}
        {r(116, by + 3, 36, 5, '#4a90c8')}{r(116, by, 36, 3, '#6aaee0')}{r(118, by + 8, 2, 6, '#2f5f86')}{r(148, by + 8, 2, 6, '#2f5f86')}
        {H > 128 && (() => { const cy = Math.round((75 + by) / 2), rx = 34, ry = Math.min(12, Math.round((by - 75) / 2) - 3); return <g aria-hidden="true">{/* the round welcome rug */}
          <ellipse cx={80} cy={cy} rx={rx} ry={ry} fill="#e65d70" /><ellipse cx={80} cy={cy} rx={rx - 4} ry={ry - 2} fill="#ffd6dc" /><ellipse cx={80} cy={cy} rx={rx - 12} ry={Math.max(2, ry - 5)} fill="#9fe3c8" />
          {r(76, cy - 2, 3, 2, '#ffffff')}{r(81, cy - 2, 3, 2, '#ffffff')}{r(76, cy, 8, 1, '#ffffff')}{r(77, cy + 1, 6, 1, '#ffffff')}{r(79, cy + 2, 2, 1, '#ffffff')}{r(77, cy - 4, 1, 2, '#ffffff')}{r(82, cy - 4, 1, 2, '#ffffff')}</g>; })()}
        {H > 160 && <>{r(70, by + 2, 20, 8, '#ffffff')}{r(72, by + 4, 16, 1, '#c9d0d8')}{r(72, by + 6, 12, 1, '#c9d0d8')}{r(66, by + 10, 28, 2, '#d9b7b0')}</>}{/* a magazine table on a deep floor */}
        {/* door mat */}
        {r(62, my, 36, 8, '#e65d70')}{r(64, my + 2, 32, 4, '#f08a96')}
      </svg>
      <Sign H={H} k="title" en={en} x={80} y={14.5} size={1.9} />
      <Sign H={H} k="desk" en={en} x={80} y={67.5} size={0.85} className="on-red" />
      <Sign H={H} k="machine" en={en} x={111.5} y={32} size={0.8} />
      <Sign H={H} k="pc" en={en} x={17} y={43} size={0.75} />
      <Sign H={H} k="wait" en={en} x={26} y={by - 6} size={0.75} />
      <Sign H={H} k="hours" en={en} x={134} y={by - 6} size={0.7} />
      <Sign H={H} k="mat" en={en} x={80} y={my + 4} size={0.6} className="on-red" />
    </>
  );
}

/** Typewriter text: tap once to finish the line, again to go on. */
function useTyped(text, speed = 34) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); }, [text]);
  useEffect(() => {
    if (!text || n >= text.length) return undefined;
    const id = setTimeout(() => setN((k) => k + 1), speed);
    return () => clearTimeout(id);
  }, [text, n]);
  return [text ? text.slice(0, n) : '', !text || n >= text.length, () => setN(text ? text.length : 0)];
}

export default function BugCenter() {
  const [b, setB] = useState(null);
  const [err, setErr] = useState('');
  const [en, setEn] = useState(false);
  const [sound, setSound] = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch { return true; } });
  // talk: null (looking around) | { lines, i, mode: 'talk' | 'ask' | 'heal' }
  const [talk, setTalk] = useState(null);
  const [lit, setLit] = useState(false);
  const [pod, setPod] = useState(false);
  const fit = useRef(null); const [box, setBox] = useState({ w: 0, h: 0, H: H0 });
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { try { localStorage.setItem(SOUND_KEY, sound ? '1' : '0'); } catch { /* private */ } }, [sound]);
  useEffect(() => {
    document.title = "バグセンター · Buffalo Bill's Academy";
    api('GET', '/barn').then(setB).catch((e) => setErr(e.message));
  }, []);
  useLayoutEffect(() => {
    const el = fit.current; if (!el) return undefined;
    const on = () => {
      const cw = el.clientWidth, ch = el.clientHeight; if (!cw || !ch) return;
      const H = Math.round(Math.max(H0, Math.min(176, (W * ch) / cw)));
      const k = Math.min(cw / W, ch / H); setBox({ w: Math.floor(W * k), h: Math.floor(H * k), H });
    };
    on(); const ro = new ResizeObserver(on); ro.observe(el); return () => ro.disconnect();
  }, [b !== null]);
  const pen = b?.pen || null;
  const line = talk ? talk.lines[talk.i] : null;
  const [typed, full, finish] = useTyped(line?.ja || '');
  const start = () => { if (!talk) setTalk({ lines: greeting(pen), i: 0, mode: 'talk' }); };
  const next = () => {
    if (!talk || talk.mode === 'heal') return;
    if (!full) return finish();
    if (line.ask) return; // waiting for はい / いいえ
    if (line.end || talk.i + 1 >= talk.lines.length) { setTalk(null); return; }
    setTalk({ ...talk, i: talk.i + 1 });
  };
  const heal = async () => {
    setTalk({ lines: [WAIT], i: 0, mode: 'heal' });
    setPod(true); if (sound) podBlip();
    const t0 = Date.now();
    let r = null, failed = null;
    const call = api('POST', '/barn/heal').then((x) => { r = x; }).catch((e) => { failed = e; });
    later(() => { setLit(true); if (sound) healChime(); }, 700);
    await call;
    const wait = Math.max(0, 3300 - (Date.now() - t0));
    later(() => {
      setLit(false); setPod(false);
      if (failed) { setTalk({ lines: [OOPS(failed.message)], i: 0, mode: 'talk' }); return; }
      const { healed, cost: _c, ...view } = r; setB(view);
      setTalk({ lines: done(view.pen, healed), i: 0, mode: 'talk' });
    }, wait);
  };
  if (!b) return <div className="screen bc"><div className="bc-loading muted">{err ? <p role="alert">{err}</p> : 'いらっしゃいませ…'}</div></div>;
  const portrait = talk && talk.mode !== 'heal';
  return (
    <div className="screen bc" data-test="bug-center" lang="ja">
      <div className="bc-fit" ref={fit}>
        <div className="bc-scene" style={{ width: box.w, height: box.h, '--u': `${box.w / W}px` }} onClick={talk ? next : undefined}>
          <Room H={box.H} lit={lit} pod={pod} bow={talk?.mode === 'heal'} en={en} onNurse={(e) => { e.stopPropagation(); if (talk) next(); else start(); }} />
          {pen?.stage === 'creature' && pen.fainted && !talk && <div className="bc-status" data-test="bc-status"><Dizzy size={22} label={`${pen.name} fainted`} /> <span>{pen.name}：<b>ひんし</b></span>{en && <small lang="en">fainted</small>}</div>}
          {portrait && <div className="bc-talk" data-test="bc-dialogue">
            <img className="bc-portrait" style={{ height: Math.round(Math.min(box.h * 1.04, (box.w * (box.w / box.h > 1.3 ? 0.5 : 0.98)) / 0.75)) }} src={PORTRAIT} alt={`${NURSE.en}, the Bug Center nurse`} data-test="bc-portrait" draggable="false" />
            <div className="bc-box" role="dialog" aria-label={NURSE.en}>
              <span className="bc-who" title={NURSE.en}><ruby>{NURSE.ja}<rt>{NURSE.kana}</rt></ruby></span>
              <p className="bc-line" aria-live="polite">{typed}{full && !line.ask && <span className="bc-next" aria-hidden="true">▼</span>}</p>
              {en && full && <p className="bc-en" lang="en">{line.en}</p>}
              {line.ask && full && <div className="bc-ask">
                <button className="bc-choice" onClick={(e) => { e.stopPropagation(); heal(); }} data-test="bc-yes" title="Yes">はい</button>
                <button className="bc-choice ghost" onClick={(e) => { e.stopPropagation(); setTalk({ lines: [NO], i: 0, mode: 'talk' }); }} data-test="bc-no" title="No">いいえ</button>
              </div>}
            </div>
          </div>}
          {talk?.mode === 'heal' && <div className="bc-box bc-box-heal" data-test="bc-healing"><p className="bc-line">{typed}</p>{en && <p className="bc-en" lang="en">{line.en}</p>}</div>}
        </div>
      </div>
      <nav className="bc-bar">
        <button className="btn ghost small" onClick={() => navigate('/barn')} title="Back to the Barn" data-test="bc-back">◀ 牧場へ{en && <small lang="en"> Barn</small>}</button>
        <button className="btn" onClick={start} disabled={!!talk} title="Talk to the nurse" data-test="bc-talk">話しかける{en && <small lang="en"> Talk</small>}</button>
        <button className={`btn ghost small ${en ? 'on' : ''}`} onClick={() => setEn(!en)} aria-pressed={en} title="Show English" data-test="bc-en">訳</button>
        <button className="btn ghost small" onClick={() => setSound(!sound)} aria-pressed={sound} title="Jingle on/off">{sound ? '🔊' : '🔈'}</button>
      </nav>
    </div>
  );
}
