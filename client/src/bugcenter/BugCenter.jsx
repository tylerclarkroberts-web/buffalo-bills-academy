// v75: the Bug Center, an option inside the Barn (/barn/center). A clinic in the spirit of the handheld classics:
// a reception counter with the nurse behind it, the healing machine, a tiled floor, waiting benches and a PC in the
// corner. Original pixel art (SVG rects), every sign and line in Japanese (訳 shows the English). Talking to Nurse
// Hikari heals a fainted bug to full while its pod lights up the machine to a little WebAudio jingle.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, refreshSession } from '../api.js';
import { navigate } from '../App.jsx';
import Dizzy from '../barn/Dizzy.jsx';
import { NURSE, greeting, WAIT, done, NO, REST, OOPS, SIGNS, PANELS, PANELS2, PICK, RECEIPT, BACK, STAGE, after } from './script.js';
import { healChime, podBlip, drill } from './chime.js';
import { drawBug } from '../barn/sprite.js';
import { BY_ID } from '../../../server/engine/creatures.js';
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

const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const INK = '#0b0810', LAMP = '#fff3c4', NIGHT = '#14101c';
const PANEL_ART = [
  // The door, swung in, with the light across the floor and two boots standing in it.
  (r) => <>{r(0, 0, 120, 80, '#1b1526')}{r(0, 58, 120, 22, '#120e1a')}{r(0, 56, 120, 2, '#2a2233')}
    {r(0, 44, 30, 14, '#241c30')}{r(0, 43, 32, 2, '#32283f')}{r(12, 40, 5, 3, '#3a3046')}{r(13, 39, 3, 1, '#4a3d5c')}
    {r(70, 8, 34, 50, '#3a3046')}{r(72, 10, 30, 48, LAMP)}{r(72, 10, 2, 48, '#ffffff')}
    {r(84, 10, 18, 48, '#4a3d5c')}{r(87, 14, 12, 16, '#3a3046')}{r(87, 34, 12, 18, '#3a3046')}{r(85, 34, 2, 3, '#ffd76a')}
    {r(64, 58, 22, 4, '#ffe9a8')}{r(54, 62, 34, 4, '#f2d98c')}{r(42, 66, 48, 5, '#d9bf70')}{r(28, 71, 64, 9, '#b89e55')}
    {r(75, 38, 4, 20, INK)}{r(80, 38, 4, 20, INK)}{r(73, 56, 6, 2, INK)}{r(80, 56, 6, 2, INK)}
    {r(60, 60, 16, 2, '#4a3d1e')}{r(46, 64, 24, 2, '#4a3d1e')}{r(30, 68, 36, 3, '#4a3d1e')}{r(10, 73, 50, 4, '#4a3d1e')}</>,
  // Somebody, in a welding mask, with a case.
  (r) => <>{r(0, 0, 120, 80, NIGHT)}{r(26, 0, 68, 80, '#d9bf70')}{r(30, 0, 60, 80, LAMP)}
    {r(48, 11, 24, 16, INK)}{r(50, 9, 20, 3, INK)}{r(53, 16, 14, 5, '#2a2233')}{r(61, 17, 5, 2, '#b455ff')}{r(55, 17, 2, 1, '#e7d0ff')}{r(52, 27, 16, 2, INK)}
    {r(56, 28, 8, 4, INK)}{r(40, 31, 40, 11, INK)}{r(43, 41, 34, 24, INK)}{r(40, 63, 40, 11, INK)}{r(38, 70, 44, 4, INK)}
    {r(46, 73, 10, 7, INK)}{r(64, 73, 10, 7, INK)}{r(35, 34, 7, 28, INK)}{r(34, 60, 7, 5, INK)}{r(78, 34, 7, 24, INK)}
    {r(79, 56, 7, 2, INK)}{r(73, 58, 20, 13, INK)}{r(82, 62, 2, 3, '#ffd76a')}{r(75, 60, 16, 1, '#2a2233')}
    {r(50, 44, 20, 1, '#2a2233')}{r(50, 44, 1, 20, '#2a2233')}{r(69, 44, 1, 20, '#2a2233')}{r(57, 50, 6, 5, '#2a2233')}</>,
  // The tray. One of these is not a surgical instrument, and one of them is the arm.
  (r) => <>{r(0, 0, 120, 80, NIGHT)}{r(8, 16, 104, 54, '#22384a')}{r(8, 16, 104, 2, '#2e4a60')}
    {r(12, 21, 96, 44, '#aab3bd')}{r(13, 22, 94, 42, '#e5e8ec')}{r(13, 61, 94, 3, '#c9d0d8')}
    {r(20, 27, 2, 11, '#8a93a0')}{r(21, 27, 1, 9, '#ffffff')}{r(20, 38, 2, 18, '#3d444d')}
    {r(28, 32, 3, 24, '#7c8690')}{r(26, 26, 7, 7, '#7c8690')}{r(28, 26, 3, 4, '#e5e8ec')}{r(28, 33, 1, 22, '#c9d0d8')}
    {r(36, 31, 11, 14, '#e2545f')}{r(36, 31, 11, 2, '#f08a96')}{r(38, 45, 6, 11, '#a52f3c')}{r(40, 24, 2, 7, '#3d444d')}{r(35, 47, 3, 3, '#3a2a2a')}{r(44, 35, 2, 6, '#3a2a2a')}
    {r(52, 27, 4, 24, '#aab3bd')}{r(52, 27, 1, 24, '#e8eef4')}{[0, 1, 2, 3, 4, 5].map((i) => r(56, 28 + i * 4, 2, 2, '#7c8690', { key: i }))}{r(51, 50, 6, 8, '#c9744a')}{r(51, 50, 6, 1, '#e09a6c')}
    {r(64, 44, 2, 12, '#3d444d')}{r(62, 28, 1, 16, '#8a93a0')}{r(64, 27, 2, 17, '#8a93a0')}{r(67, 28, 1, 16, '#8a93a0')}{r(63, 27, 4, 1, '#8a93a0')}{r(62, 43, 6, 1, '#8a93a0')}
    {r(73, 27, 5, 8, '#8a93a0')}{r(74, 28, 2, 4, '#e8eef4')}{r(75, 35, 1, 21, '#8a93a0')}
    {r(83, 31, 6, 9, '#9aa5b1')}{r(84, 31, 1, 9, '#e8eef4')}{r(82, 40, 8, 4, '#ffb347')}{r(83, 44, 6, 12, '#9aa5b1')}{r(84, 44, 1, 12, '#e8eef4')}{r(82, 25, 2, 6, '#2b3138')}{r(88, 25, 2, 6, '#2b3138')}{r(85, 27, 2, 4, '#2b3138')}{r(87, 46, 1, 8, '#b455ff')}
    {r(96, 29, 2, 2, '#5a626c')}{r(100, 35, 2, 2, '#5a626c')}{r(95, 42, 2, 2, '#5a626c')}{r(101, 47, 2, 2, '#5a626c')}{r(94, 53, 11, 5, LAMP)}{r(96, 55, 7, 1, '#8a2a3a')}</>,
  // The curtain round the machine, lit from inside: the specialist, the table, the bug, and an arm that was not there before.
  (r) => <>{r(0, 0, 120, 80, NIGHT)}{r(0, 72, 120, 8, '#120e1a')}{r(26, 72, 68, 2, '#5a2a8a')}
    {r(16, 8, 88, 2, '#8a93a0')}{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => r(18 + i * 8, 10, 2, 2, '#5a626c', { key: i }))}
    {r(18, 12, 84, 60, '#e65d70')}{r(32, 12, 56, 60, '#f08a96')}{r(44, 12, 32, 60, '#f7a3a8')}
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => <g key={i}>{r(18 + i * 7, 12, 2, 60, '#c03a48')}{r(20 + i * 7, 12, 1, 60, '#ffb3bd')}</g>)}
    <g opacity="0.72">{r(38, 24, 11, 10, '#5a1626')}{r(36, 26, 15, 6, '#5a1626')}{r(41, 34, 5, 2, '#5a1626')}{r(35, 36, 17, 30, '#5a1626')}{r(33, 60, 21, 8, '#5a1626')}
      {r(52, 38, 10, 3, '#5a1626')}{r(61, 31, 3, 11, '#5a1626')}{r(60, 29, 5, 3, '#5a1626')}
      {r(58, 56, 34, 3, '#5a1626')}{r(62, 59, 3, 11, '#5a1626')}{r(85, 59, 3, 11, '#5a1626')}
      {r(66, 46, 18, 10, '#5a1626')}{r(64, 49, 2, 5, '#5a1626')}{r(68, 41, 1, 5, '#5a1626')}{r(71, 42, 1, 4, '#5a1626')}
      {r(82, 36, 3, 12, '#5a1626')}{r(80, 32, 2, 5, '#5a1626')}{r(85, 32, 2, 5, '#5a1626')}{r(82, 34, 3, 2, '#5a1626')}</g>
    {r(18, 70, 84, 2, '#b455ff')}
    {r(65, 27, 2, 2, '#ffe36e', { className: 'bc-spark' })}{r(68, 24, 1, 1, '#fff7c2', { className: 'bc-spark' })}{r(59, 25, 1, 1, '#fff7c2', { className: 'bc-spark' })}{r(69, 30, 2, 1, '#ffe36e', { className: 'bc-spark' })}{r(86, 29, 2, 2, '#e7d0ff', { className: 'bc-spark' })}</>,
];
/** One story panel: the illustration if it has loaded, the pixel stand-in otherwise. */
function Panel({ i }) {
  const [drawn, setDrawn] = useState(false);
  return (
    <>
      <img className="bc-panel" src={`/bugcenter/evo-${i + 1}.webp`} alt="" hidden={!drawn} onLoad={() => setDrawn(true)} draggable="false" data-test="bc-panel-art" />
      {!drawn && <svg className="bc-panel" viewBox="0 0 120 80" shapeRendering="crispEdges" aria-hidden="true">{PANEL_ART[i](rect)}</svg>}
    </>
  );
}
const rect = (x, y, w, h, f, extra = {}) => <rect x={x} y={y} width={w} height={h} fill={f} {...extra} />;

function Receipt({ evolved }) {
  if (evolved.donor) { // paid in parts: no money moved, and the receipt says whose
    const Line = ({ k, v, className = '' }) => <div className={`bc-rrow ${className}`}><span><span lang="ja">{RECEIPT[k].ja}</span> <small>{RECEIPT[k].en}</small></span><b>{v}</b></div>;
    return (
      <div className="bc-receipt" data-test="bc-receipt" lang="en">
        <h2><span lang="ja">{RECEIPT.title.ja}</span> <small>{RECEIPT.title.en}</small></h2>
        <Line k="body" v={RECEIPT.included.en} /><Line k="labour" v={RECEIPT.included.en} />
        {evolved.botched && <Line k="wrong" v={RECEIPT.free.en} />}
        <Line k="parts" v={evolved.donor.name} className="total" />
        <p className="bc-rfoot"><span lang="ja">{RECEIPT.foot.ja}</span> {RECEIPT.foot.en}</p>
      </div>
    );
  }
  const { had, took, left } = evolved.bill, arm = Math.round(took * 40) / 100, labour = Math.round(took * 35) / 100, hush = Math.round((took - arm - labour) * 100) / 100;
  const Row = ({ k, v, className = '' }) => <div className={`bc-rrow ${className}`}><span><span lang="ja">{RECEIPT[k].ja}</span> <small>{RECEIPT[k].en}</small></span><b>{v}</b></div>;
  return (
    <div className="bc-receipt" data-test="bc-receipt" lang="en">
      <h2><span lang="ja">{RECEIPT.title.ja}</span> <small>{RECEIPT.title.en}</small></h2>
      <Row k={evolved.stage === 2 ? 'body' : 'arm'} v={money(arm)} /><Row k="labour" v={money(labour)} /><Row k="hush" v={money(hush)} />
      {evolved.botched && <Row k="wrong" v={RECEIPT.free.en} />}
      <Row k="total" v={money(took)} className="total" />
      <Row k="had" v={money(had)} /><Row k="left" v={money(left)} />
      <p className="bc-rfoot"><span lang="ja">{RECEIPT.foot.ja}</span> {RECEIPT.foot.en}</p>
    </div>
  );
}

function Reveal({ evolved, pen, en }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, bug = BY_ID[evolved.species]; if (!c || !bug) return;
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    drawBug(x, bug, { w: c.width, h: c.height, still: true, fill: 0.9, style: pen?.style, level: evolved.levelAfter });
  }, [evolved, pen]);
  const back = BACK(evolved.name), stage = STAGE(evolved.botched, evolved.stage);
  return (
    <div className="bc-reveal" data-test="bc-reveal">
      <canvas ref={ref} width={192} height={192} role="img" aria-label={`${evolved.name}, rebuilt`} />
      <p className="bc-cap">{back.ja}{en && <small lang="en">{back.en}</small>}</p>
      <p className="bc-stage" data-test="bc-stage">{stage.ja} · Lv {evolved.levelBefore} → {evolved.levelAfter}{en && <small lang="en">{stage.en}</small>}</p>
    </div>
  );
}

/** The specialist's visit: four still panels, the receipt, then the curtain opens. Tap (or Enter) to go on. */
function Operation({ op, pen, en, onNext }) {
  const P = op.panels, evolved = op.r?.evolved, shown = op.r ? op.step : Math.min(op.step, P.length - 1);
  const newPen = op.r?.stable?.bugs.find((bug) => bug.id === evolved?.id) || pen;
  const cap = P[shown];
  return (
    <div className="bc-op" data-test="bc-op" data-step={shown} role="button" tabIndex={0} aria-label="Next"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNext(); } }}>
      {shown < P.length && <>
        <Panel key={shown} i={cap.art ?? shown} />
        <p className="bc-cap" aria-live="polite">{cap.ja}{en && <small lang="en">{cap.en}</small>}</p>
      </>}
      {shown === P.length && evolved && <Receipt evolved={evolved} />}
      {shown > P.length && evolved && <Reveal evolved={evolved} pen={newPen} en={en} />}
      <span className="bc-next bc-op-next" aria-hidden="true">{op.waiting ? '…' : '▼'}</span>
    </div>
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
  const [op, setOp] = useState(null); // the specialist's visit: { step, r (the server's answer, once billed), waiting }
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
  const bugs = b?.stable?.bugs || [];
  const pen = bugs.find((bug) => bug.sick) || bugs.find((bug) => bug.taken) || bugs.find((bug) => bug.fainted) || b?.pen || null;
  const line = talk ? talk.lines[talk.i] : null;
  const [typed, full, finish] = useTyped(line?.ja || '');
  const start = () => { if (!talk) setTalk({ lines: greeting(pen), i: 0, mode: 'talk' }); };
  const next = () => {
    if (!talk || talk.mode === 'heal') return;
    if (!full) return finish();
    if (line.ask || line.pick) return; // waiting for an answer
    if (line.call) { setTalk(null); setOp({ step: 0, r: null, panels: pen?.taken ? PANELS2 : PANELS }); return; }
    if (line.end || talk.i + 1 >= talk.lines.length) { setTalk(null); return; }
    setTalk({ ...talk, i: talk.i + 1 });
  };
  // The bug is rebuilt and the bill taken only as the last panel is passed, so leaving before then changes nothing.
  const opNext = () => {
    if (!op || op.waiting) return;
    const P = op.panels;
    if (op.step < P.length - 1) { if (sound && op.step >= 1) drill(); setOp({ ...op, step: op.step + 1 }); return; }
    if (!op.r) {
      setOp({ ...op, waiting: true });
      api('POST', '/barn/heal', { bug: pen?.id, ...(op.donor ? { donor: op.donor } : {}) }).then((r) => { setOp({ ...op, step: P.length, r, waiting: false }); refreshSession(); })
        .catch((e) => { setOp(null); setTalk({ lines: [OOPS(e.message)], i: 0, mode: 'talk' }); });
      return;
    }
    if (op.step === P.length) { if (sound) healChime(); setOp({ ...op, step: op.step + 1 }); return; }
    const { healed: _h, cost: _c, evolved, ...view } = op.r;
    setB(view); setOp(null); setTalk({ lines: after(evolved), i: 0, mode: 'talk' });
  };
  const heal = async (pay) => {
    setTalk({ lines: [WAIT], i: 0, mode: 'heal' });
    setPod(true); if (sound) podBlip();
    const t0 = Date.now();
    let r = null, failed = null;
    const call = api('POST', '/barn/heal', { ...(pay ? { pay: true } : {}), bug: pen?.id }).then((x) => { r = x; }).catch((e) => { failed = e; });
    later(() => { setLit(true); if (sound) healChime(); }, 700);
    await call;
    const wait = Math.max(0, 3300 - (Date.now() - t0));
    later(() => {
      setLit(false); setPod(false);
      if (failed) { setTalk({ lines: [OOPS(failed.message)], i: 0, mode: 'talk' }); return; }
      const { healed, cost, ...view } = r; setB(view);
      setTalk({ lines: done(view.stable?.bugs.find((bug) => bug.id === pen?.id) || view.pen, healed, cost), i: 0, mode: 'talk' });
    }, wait);
  };
  if (!b) return <div className="screen bc"><div className="bc-loading muted">{err ? <p role="alert">{err}</p> : 'いらっしゃいませ…'}</div></div>;
  const portrait = talk && talk.mode !== 'heal';
  return (
    <div className="screen bc" data-test="bug-center" lang="ja">
      <div className="bc-fit" ref={fit}>
        <div className={`bc-scene${op ? ' bc-dark' : ''}`} style={{ width: box.w, height: box.h, '--u': `${box.w / W}px`, '--sh': `${box.h}px` }} onClick={talk ? next : op ? opNext : undefined}>
          <Room H={box.H} lit={lit} pod={pod} bow={talk?.mode === 'heal'} en={en} onNurse={(e) => { e.stopPropagation(); if (talk) next(); else start(); }} />
          {pen?.stage === 'creature' && pen.fainted && !talk && !op && <div className="bc-status" data-test="bc-status"><Dizzy size={22} label={`${pen.name} ${pen.sick ? 'is not well' : 'fainted'}`} /> <span>{pen.name}：<b>{pen.sick ? 'むらさき' : pen.taken ? 'おあずかり' : 'ひんし'}</b></span>{en && <small lang="en">{pen.sick ? 'purple' : pen.taken ? 'collected' : 'fainted'}</small>}</div>}
          {op && <Operation op={op} pen={pen} en={en} onNext={opNext} />}
          {portrait && <div className="bc-talk" data-test="bc-dialogue">
            <img className="bc-portrait" style={{ height: Math.round(Math.min(box.h * 1.04, (box.w * (box.w / box.h > 1.3 ? 0.5 : 0.98)) / 0.75)) }} src={PORTRAIT} alt={`${NURSE.en}, the Bug Center nurse`} data-test="bc-portrait" draggable="false" />
            <div className="bc-box" role="dialog" aria-label={NURSE.en}>
              <span className="bc-who" title={NURSE.en}><ruby>{NURSE.ja}<rt>{NURSE.kana}</rt></ruby></span>
              <p className="bc-line" aria-live="polite">{typed}{full && !line.ask && !line.pick && <span className="bc-next" aria-hidden="true">▼</span>}</p>
              {en && full && <p className="bc-en" lang="en">{line.en}</p>}
              {line.pick && full && <div className="bc-ask bc-pick" data-test="bc-pick">
                {pen.donors.map((d) => <button key={d.id} className="bc-choice" lang="en" onClick={(e) => { e.stopPropagation(); setTalk(null); setOp({ step: 0, r: null, panels: PANELS2, donor: d.id }); }} data-test="bc-donor">{d.name} · Lv {d.level}</button>)}
                <button className="bc-choice ghost" onClick={(e) => { e.stopPropagation(); setTalk({ lines: [NO], i: 0, mode: 'talk' }); }} data-test="bc-pick-no" title={PICK.not.en}>{PICK.not.ja}</button>
                <p className="bc-pick-warn"><span lang="ja">{PICK.warn.ja}</span> <span lang="en">{PICK.warn.en}</span></p>
              </div>}
              {line.ask && full && <div className="bc-ask">
                <button className="bc-choice" onClick={(e) => { e.stopPropagation(); heal(line.pay); }} data-test="bc-yes" title="Yes">はい</button>
                <button className="bc-choice ghost" onClick={(e) => { e.stopPropagation(); setTalk({ lines: [line.pay ? REST : NO], i: 0, mode: 'talk' }); }} data-test="bc-no" title="No">いいえ</button>
              </div>}
            </div>
          </div>}
          {talk?.mode === 'heal' && <div className="bc-box bc-box-heal" data-test="bc-healing"><p className="bc-line">{typed}</p>{en && <p className="bc-en" lang="en">{line.en}</p>}</div>}
        </div>
      </div>
      <nav className="bc-bar">
        <button className="btn ghost small" onClick={() => navigate('/barn')} title="Back to the Barn" data-test="bc-back">◀ 牧場へ{en && <small lang="en"> Barn</small>}</button>
        <button className="btn" onClick={start} disabled={!!talk || !!op} title="Talk to the nurse" data-test="bc-talk">話しかける{en && <small lang="en"> Talk</small>}</button>
        <button className={`btn ghost small ${en ? 'on' : ''}`} onClick={() => setEn(!en)} aria-pressed={en} title="Show English" data-test="bc-en">訳</button>
        <button className="btn ghost small" onClick={() => setSound(!sound)} aria-pressed={sound} title="Jingle on/off">{sound ? '🔊' : '🔈'}</button>
      </nav>
    </div>
  );
}
