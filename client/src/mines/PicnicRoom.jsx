import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { createPvpClient } from './pvpClient.js';
import { PicnicScene } from './picnicScene.js';
import { GUNS } from '../../../server/engine/picnic-map.js';

// Behind the mine's second door: the company picnic. Everyone who opens it walks out into the same quarry holding a
// rivet gun, with better things lying about. server/picnic.js keeps score; nothing is at stake and nothing is saved.
// As with the first door, the shift keeps running on the server the whole time, and the mine's own sound switch
// covers the noise.
const IDLE = [
  'COMPANY PICNIC. ATTENDANCE IS MANDATORY. RIVET GUNS ARE PROVIDED.',
  'THE HAT TAKES THREE RIVETS. IT GROWS BACK.',
  'THE POTATO SALAD HAS BEEN OUT SINCE 1966.',
  'REMINDER: THE PUNCH IS ACID. IT HAS ALWAYS BEEN ACID.',
  'FOREMAN: "THIS COUNTS AS YOUR BREAK."',
];
const FOUND = { // said once when you walk over one: the only instructions it gets, so short enough for a phone's ticker
  stapler: 'AN INDUSTRIAL STAPLER. GET CLOSE.',
  surveyor: 'A SURVEYOR. HOLD STILL TO AIM IT.',
  dynamite: 'DYNAMITE. STAND BACK. FURTHER.',
  hat: 'A SECOND HARD HAT. IT GOES ON TOP.',
  salad: 'YOU ATE THE POTATO SALAD. IT HELPED.',
};
const RIVETED = [
  (k, v) => `${k} RIVETED ${v}.`,
  (k, v) => `${k} FILED A GRIEVANCE AGAINST ${v}.`,
  (k, v) => `${v} HAS BEEN LET GO BY ${k}.`,
  (k, v) => `${k} AND ${v} HAD A WORD. ${k} HAD THE RIVET GUN.`,
];
const GARY = [
  (k) => `${k} SHOT THE INTERN. HE IS UNPAID.`,
  (k) => `${k} SHOT GARY. GARY NEEDS THIS FOR SCHOOL CREDIT.`,
  (k) => `GARY IS DOWN. ${k} CALLS IT TEAM BUILDING.`,
];
const feedLine = (f) => (f.own ? `${f.killer} HAS RESIGNED, LOUDLY.`
  : f.intern ? GARY[f.n % GARY.length](f.killer)
  : f.gun === 'stapler' ? `${f.killer} STAPLED ${f.victim}.`
  : f.gun === 'surveyor' ? `${f.killer} SURVEYED ${f.victim} FROM OVER THERE.`
  : f.gun === 'dynamite' ? `${f.victim} WAS MADE REDUNDANT BY ${f.killer}.`
  : RIVETED[f.n % RIVETED.length](f.killer, f.victim)).toUpperCase();
const DID = { rivet: 'RIVETED', stapler: 'STAPLED', surveyor: 'SURVEYED', dynamite: 'BLEW UP' };
const BANG = { rivet: [0.07, 2600, 500, 0.5], stapler: [0.14, 900, 180, 0.8, 'lowpass'], surveyor: [0.22, 4200, 300, 0.7], dynamite: [0.6, 420, 50, 0.95, 'lowpass'] }; // MineAudio.noise arguments
const pulse = (el, cls) => { if (!el) return; el.classList.remove('hit', 'on', 'dent'); void el.offsetWidth; el.classList.add(cls); };

export default function PicnicRoom({ onExit, elapsedMs, audio, Pad }) {
  const canvas = useRef(null), scene = useRef(null), hair = useRef(null), hurt = useRef(null), thumb = useRef(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [locked, setLocked] = useState(false);
  const [note, setNote] = useState(null); // what you just picked up, for a few seconds
  useEffect(() => {
    const c = canvas.current;
    const s = scene.current = new PicnicScene(c, {
      reduceMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      onEvent: (e, gun) => {
        if (e === 'shot' || e === 'hit') audio?.noise(...BANG[gun]);
        if (e === 'hit') { audio?.chunk(); pulse(hair.current, 'hit'); }
        if (e === 'hurt') { audio?.splat(); pulse(hurt.current, 'on'); }
        if (e === 'dent') { audio?.tick(1.3); pulse(hurt.current, 'dent'); } // the hat took it
        if (e === 'shot-far') audio?.tick(0.7);
      },
    });
    window.__picnic = s; // handy for debugging and automated screenshots, like window.__acidMine
    let news = 0; // the newest kill the ticker has shown: a fresh one outranks the label on whatever you picked up
    const beat = createPvpClient({
      path: '/picnic/tick', intervalMs: 120, send: (path, body) => api('POST', path, body), pose: () => s.report(),
      onView: (v) => {
        s.apply(v); setView(v); setError(null);
        const n = v.feed.at(-1)?.n || news; if (n !== news) { news = n; setNote(null); }
        if (v.got) setNote({ text: FOUND[v.got], until: Date.now() + 6000 });
      },
      onError: (e, fails) => { if (e.status === 409) setError(e.message.toUpperCase()); else if (fails >= 4) setError('THE PICNIC IS NOT ANSWERING. STILL KNOCKING.'); },
    });
    const keys = new Set(); let mouse = false, drag = null;
    const sync = () => {
      s.input.f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      s.input.s = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      s.input.t = (keys.has('arrowright') || keys.has('e') ? 1 : 0) - (keys.has('arrowleft') || keys.has('q') ? 1 : 0);
      s.jumping = keys.has(' '); s.firing = mouse || keys.has('f');
    };
    const key = (e) => {
      const k = e.key.toLowerCase(), down = e.type === 'keydown';
      if (down && (k === ' ' || k === 'enter') && e.target.closest?.('button, a')) return; // that key belongs to the button
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      if (down && k === 'x' && !e.repeat) s.swap();
      if (down) keys.add(k); else keys.delete(k);
      sync();
    };
    const held = () => document.pointerLockElement === c;
    const letGo = () => { keys.clear(); mouse = false; drag = null; sync(); };
    // A mouse click takes the pointer (then the mouse aims and the button shoots). Fingers, and a mouse the browser
    // will not hand over, drag the view instead.
    const pd = (e) => {
      if (held()) { if (e.button === 0) { mouse = true; sync(); } return; }
      if (e.pointerType === 'mouse') c.requestPointerLock?.()?.catch?.(() => {});
      drag = { x: e.clientX, y: e.clientY }; c.setPointerCapture?.(e.pointerId);
    };
    const pm = (e) => {
      if (held()) s.look(-e.movementX * 0.0024, -e.movementY * 0.0024);
      else if (drag) { s.look(-(e.clientX - drag.x) * 0.006, -(e.clientY - drag.y) * 0.004); drag = { x: e.clientX, y: e.clientY }; }
    };
    const pu = () => { mouse = false; drag = null; sync(); };
    const onLock = () => { setLocked(held()); if (!held()) pu(); };
    const onResize = () => s.resize();
    window.addEventListener('keydown', key); window.addEventListener('keyup', key); window.addEventListener('blur', letGo); window.addEventListener('resize', onResize);
    document.addEventListener('pointerlockchange', onLock);
    c.addEventListener('pointerdown', pd); c.addEventListener('pointermove', pm); c.addEventListener('pointerup', pu); c.addEventListener('pointercancel', pu);
    const prevTitle = document.title; document.title = 'COMPANY PICNIC · ACID MINES';
    return () => {
      beat.dispose(); api('POST', '/picnic/leave', {}).catch(() => { /* the server forgets you in a few seconds anyway */ });
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); window.removeEventListener('blur', letGo); window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onLock);
      if (held()) document.exitPointerLock();
      s.dispose(); scene.current = null; delete window.__picnic; document.title = prevTitle;
    };
  }, []);
  const steer = (f, t) => { const s = scene.current; if (s) { s.input.f = f; s.input.t = t; s.input.s = 0; } };
  // The fire button (touch): hold to fire, and slide the same thumb to keep aiming.
  const trigger = (on) => (e) => {
    e.preventDefault(); if (on) e.currentTarget.setPointerCapture?.(e.pointerId);
    thumb.current = on ? { x: e.clientX, y: e.clientY } : null; if (scene.current) scene.current.trigger = on;
  };
  const slide = (e) => { const t = thumb.current; if (!t) return; scene.current?.look(-(e.clientX - t.x) * 0.006, -(e.clientY - t.y) * 0.004); thumb.current = { x: e.clientX, y: e.clientY }; };
  const you = view?.you, secs = Math.floor(elapsedMs / 1000);
  const bars = you ? Math.ceil(you.hp / 20) : 0, hats = you ? Math.ceil(you.hat / 20) : 0;
  const extra = you?.gun, held = extra && scene.current?.held === extra.kind ? extra.kind : 'rivet'; // what is in your hand
  const scores = you ? [{ id: you.id, name: 'You', kills: you.kills, me: true }, ...view.others].sort((a, b) => b.kills - a.kills).slice(0, 6) : [];
  const last = view?.feed.at(-1);
  const message = error ? error
    : !you ? 'WALKING OUT INTO THE SUN…'
    : you.hp <= 0 ? `${you.by ? `${you.by.name.toUpperCase()} ${DID[you.by.gun]} YOU` : 'THAT WAS YOUR OWN DYNAMITE'}. BACK IN ${Math.ceil(you.backIn / 1000)}.`
    : !locked && window.matchMedia?.('(pointer: fine)').matches ? 'CLICK TO AIM, CLICK TO SHOOT (OR F) · WASD · SPACE JUMPS' : null;
  const host = document.querySelector('.mines') || document.body; // above the mine header and the CRT overlay
  return createPortal(
    <div className="m-doom m-picnic" role="dialog" aria-label="The company picnic" data-test="picnic-room">
      <div className="m-doom-bar">
        <button className="m-btn m-doom-exit" onClick={onExit} data-test="picnic-exit">◄ BACK TO THE MINE</button>
        <span className="m-dim m-doom-clock" title="Your shift is still on the clock while you're out here">SHIFT {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')} · STILL RUNNING</span>
      </div>
      <div className="m-picnic-view">
        <canvas ref={canvas} className="m-canvas" aria-label="First-person view of the company picnic" />
        <div ref={hurt} className="m-picnic-hurt" aria-hidden="true" />
        {you?.hp > 0 && <div ref={hair} className="m-picnic-hair" aria-hidden="true">+</div>}
        {you && <div className="m-hud tl" data-test="picnic-hp">
          <div role="img" aria-label={`Hard hat ${Math.round(you.hat)} of 60`}>HAT {'▮'.repeat(hats)}{'▯'.repeat(Math.max(0, 3 - hats))}</div>
          <div role="img" aria-label={`Health ${you.hp} of 100`}>HP {'▮'.repeat(bars)}{'▯'.repeat(5 - bars)}</div>
          <div data-test="picnic-gun">{GUNS[held].name.toUpperCase()}{held === 'rivet' ? '' : ` ${extra.ammo}`}</div>
          {extra && <div className="m-dim m-picnic-key">X SWAPS</div>}
        </div>}
        {you && <ol className="m-hud tr m-picnic-scores" aria-label="Rivets landed" data-test="picnic-scores">
          {scores.map((p) => <li key={p.id} className={p.me ? 'me' : ''}>{p.name.toUpperCase()} {p.kills}</li>)}
        </ol>}
        {message && <div className="m-picnic-msg" role={error ? 'alert' : 'status'} data-test="picnic-msg">{message}</div>}
        <div className="m-ticker" aria-live="polite">{note && Date.now() < note.until ? note.text : last ? feedLine(last) : view?.others.length === 1 ? 'NOBODY ELSE CAME. GARY CAME. GARY ALWAYS COMES.' : IDLE[Math.floor(secs / 10) % IDLE.length]}</div>
        <div className="m-movement"><Pad apply={steer} /></div>
        {extra && <button type="button" className="m-btn m-picnic-swap" data-test="picnic-swap" onClick={() => scene.current?.swap()}>{held === 'rivet' ? GUNS[extra.kind].name.toUpperCase() : 'RIVET GUN'}</button>}
        <button type="button" className="m-btn m-picnic-fire" data-test="picnic-fire" onPointerDown={trigger(true)} onPointerMove={slide} onPointerUp={trigger(false)} onPointerCancel={trigger(false)} onLostPointerCapture={trigger(false)} onContextMenu={(e) => e.preventDefault()}>{GUNS[held].verb}</button>
      </div>
    </div>,
    host,
  );
}
