import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './elhalo.css';
import { createGame } from './game.js';

// The EL HALO door in the Hall of Doors: an original first-person arena shooter in a sunset border town. Alebrijes
// and tin luchador-bots come in waves; you have a shield that recharges, a rifle, a pistol, piñata grenades and a smack.
// Free play only: nothing here touches money or the mine API. This whole folder is its own chunk, loaded when the door opens.
const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;

export default function ElHaloRoom({ onExit, elapsedMs }) {
  const canvas = useRef(null), stage = useRef(null), game = useRef(null);
  const [touch] = useState(isTouch);
  const [muted, setMuted] = useState(() => localStorage.getItem('bba.elhalo.muted') === '1');
  const [mode, setMode] = useState({ mode: 'loading' });
  const exitRef = useRef(onExit); exitRef.current = onExit;

  useEffect(() => {
    const prevTitle = document.title; document.title = 'EL HALO · HALL OF DOORS';
    let g;
    try {
      g = createGame({ canvas: canvas.current, root: stage.current, touch, muted, reduceMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        onMode: (m, info) => setMode({ mode: m, ...info }) });
    } catch (err) { setMode({ mode: 'error', msg: String(err?.message || err) }); return () => { document.title = prevTitle; }; }
    game.current = g; window.__elHalo = g;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (g.locked() || g.justUnlocked()) return; // that Esc just released the mouse: the game pauses, you stay
      e.preventDefault(); exitRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); g.dispose(); if (window.__elHalo === g) delete window.__elHalo; game.current = null; document.title = prevTitle; };
  }, []);
  useEffect(() => { localStorage.setItem('bba.elhalo.muted', muted ? '1' : '0'); game.current?.setMuted(muted); }, [muted]);

  const secs = Math.floor(elapsedMs / 1000);
  const host = document.querySelector('.mines') || document.body;
  const m = mode.mode;
  return createPortal(
    <div className={`m-doom m-elh${touch ? ' touch' : ''}`} role="dialog" aria-label="El Halo" data-test="elhalo-room" data-mode={m}>
      <div className="m-doom-bar m-elh-bar">
        <button className="m-btn m-doom-exit" onClick={onExit} data-test="elhalo-exit">◄ BACK TO THE HALL</button>
        <span className="m-elh-name" aria-hidden="true">EL HALO</span>
        <span className="m-dim m-doom-clock" title="Your shift is still on the clock while you're in here">SHIFT {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>
        <button className="m-link" onClick={() => setMuted((v) => !v)} aria-pressed={!muted} data-test="elhalo-mute">{muted ? '♪ OFF' : '♪ ON'}<span className="sr-only"> game sound</span></button>
      </div>
      <div className="elh-stage" ref={stage}>
        <canvas ref={canvas} className="elh-canvas" data-test="elhalo-canvas" />
        <div className="elh-hud" aria-hidden={m !== 'playing'}>
          <div className="elh-vig" data-h="vig" />
          <div className="elh-dir" data-h="dir"><span /></div>
          <div className="elh-top">
            <div className="elh-score"><b data-h="score">0</b><small>OLEADA <span data-h="wave">1</span></small></div>
            <div className="elh-bars" data-h="bars" data-test="elhalo-shield">
              <div className="elh-shield"><i data-h="shield" /></div>
              <div className="elh-health"><i data-h="health" /></div>
            </div>
            <div className="elh-ammo" data-h="ammo">
              <b data-h="mag">32</b><small data-h="reserve">192</small>
              <span className="elh-wname" data-h="wname">LA CHICHARRA</span>
              <span className="elh-nades" data-h="nades" aria-label="Piñata grenades">✶✶··</span>
            </div>
          </div>
          <div className="elh-reticle" data-h="reticle"><span /></div>
          <div className="elh-banner" data-h="banner" role="status" />
        </div>
        {touch && (
          <div className="elh-pad" data-test="elhalo-pad" hidden={m !== 'playing'}>
            <div className="elh-look" data-pad="look" />
            <div className="elh-stick" data-pad="stick" data-test="elhalo-stick"><div className="elh-base" data-pad="base"><div className="elh-knob" data-pad="knob" /></div></div>
            <div className="elh-acts">
              <button data-pad-btn="fire" className="fire" data-test="pad-fire">FIRE</button>
              <button data-pad-btn="grenade" className="nade" data-test="pad-grenade">GRENADE</button>
              <button data-pad-btn="jump" className="jump" data-test="pad-jump">JUMP</button>
              <button data-pad-btn="melee" className="melee" data-test="pad-melee">SMACK</button>
              <button data-pad-btn="reload" className="reload" data-test="pad-reload">RELOAD</button>
              <button data-pad-btn="swap" className="swap" data-test="pad-swap">SWAP</button>
            </div>
          </div>
        )}
        {(m === 'title' || m === 'loading') && (
          <div className="elh-card elh-title" data-test="elhalo-title">
            <h2 className="elh-logo">EL HALO</h2>
            <p>The alebrijes got out of the mercado again. The tin luchadores are not helping.</p>
            <button className="m-btn" onClick={() => game.current?.start()} disabled={m === 'loading'} data-test="elhalo-start">▸ ¡A DARLE!</button>
            {!touch && <p className="elh-keys">WASD move · mouse aim · click fire · G piñata · F smack · R reload · Q swap · Space jump</p>}
            {mode.best > 0 && <p className="elh-best">BEST {mode.best.toLocaleString()}</p>}
          </div>
        )}
        {m === 'paused' && (
          <div className="elh-card" data-test="elhalo-paused">
            <h2 className="elh-logo sm">PAUSA</h2>
            <button className="m-btn" onClick={() => game.current?.resume()} data-test="elhalo-resume">▸ KEEP GOING</button>
            <p className="elh-keys">Esc again to go back to the hall</p>
          </div>
        )}
        {m === 'dead' && (
          <div className="elh-card elh-dead" data-test="elhalo-dead">
            <h2 className="elh-logo sm">TE TUMBARON</h2>
            <p className="elh-final"><b>{(mode.score || 0).toLocaleString()}</b> · OLEADA {mode.wave} · {mode.kills} DOWN</p>
            {mode.best > 0 && <p className="elh-best">BEST {mode.best.toLocaleString()}</p>}
            <button className="m-btn" onClick={() => game.current?.start()} data-test="elhalo-restart">▸ OTRA VEZ</button>
          </div>
        )}
        {m === 'error' && <div className="elh-card"><p>This door needs WebGL, and this browser said no.</p></div>}
      </div>
    </div>,
    host,
  );
}
