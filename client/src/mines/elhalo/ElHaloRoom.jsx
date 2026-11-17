import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './elhalo.css';
import { createGame } from './game.js';
import { getLook, saveLook } from './net.js';
import { LOOK, LOOK_KEYS, DEFAULT_LOOK, cleanLook } from './logic.js';
import { MUSIC_LEVELS } from './audio.js';
import { LOOK_SWATCH } from './models.js';

// The EL HALO door in the Hall of Doors: a shared horde match in a sunset box canyon. You wait in the lobby first (pick
// your poncho, sombrero, bigote, bandana and boots; get ready), then everyone drops into the same world: waves of
// luchadores (one in five a high-flying volador), el gordo from wave 3, mariachis, granjeros, padres, chupacabras and worse
// after dark, a supply truck between waves, every building wide open (La Michoacana, the mission, the mansion), street dogs,
// an elote man, and friendly fire very much on. The server
// runs the match (server/elhalo); this folder is its own chunk, loaded when the door opens. Free play: no money.
const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
const ph = (i) => (!i ? '' : i.phase === 'wave' ? `OLEADA ${i.wave}` : i.phase === 'truck' ? `LA TROCA · OLEADA ${i.wave}` : i.phase === 'break' ? (i.wave ? `OLEADA ${i.wave + 1} EN ${i.cd}` : `EMPIEZA EN ${i.cd}`) : i.phase === 'over' ? 'SE ACABÓ' : i.phase === 'lobby' ? 'EN EL LOBBY' : 'VACÍO');
const LOOK_LABEL = { poncho: 'PONCHO', sombrero: 'SOMBRERO', hatColor: 'COLOR', bigote: 'BIGOTE', cuello: 'CUELLO', cuelloColor: 'COLOR', botas: 'BOTAS' };
const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
const DOTS = ['#1aa6a6', '#f2598c', '#ffbf26', '#8c66f2', '#66cc4d', '#ff8026', '#4d8cff', '#f2f2f2'];

// the lobby: who's here and ready, your look with a live turntable preview, and the button that gets you in
function Lobby({ m, info, touch, look, setLookAt, game, note }) {
  const joined = m === 'lobby';
  const running = info && !['lobby', 'idle', undefined].includes(info.phase);
  const roster = info?.roster || [];
  const [busy, setBusy] = useState(false);
  const act = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };
  return (
    <div className="elh-lobby" data-test="elhalo-lobby">
      <div className="elh-lb-head">
        <h2 className="elh-logo elh-lb-logo">EL HALO</h2>
        <p className="elh-sub">HORDA EN EL CAÑÓN</p>
      </div>
      <div className="elh-lb-preview" data-preview data-test="elhalo-preview" aria-label="Your character, turning slowly" role="img" />
      <div className="elh-lb-panel">
        <div className="elh-lb-looks" data-test="elhalo-looks">
          {LOOK_KEYS.map((k, i) => {
            const opts = LOOK[k], v = look[i] ?? 0, o = opts[v];
            const name = typeof o === 'string' ? o : o?.name ?? String(v);
            const sw = LOOK_SWATCH[k]?.[v] || null;
            return (
              <div className="elh-sel" key={k} data-test={`look-${k}`}>
                <small>{LOOK_LABEL[k] || k.toUpperCase()}</small>
                <button type="button" aria-label={`Previous ${LOOK_LABEL[k]}`} onClick={() => setLookAt(i, (v + opts.length - 1) % opts.length)} data-test={`look-${k}-prev`}>‹</button>
                <span>{sw && <i style={{ background: rgb(sw) }} />}{name}</span>
                <button type="button" aria-label={`Next ${LOOK_LABEL[k]}`} onClick={() => setLookAt(i, (v + 1) % opts.length)} data-test={`look-${k}-next`}>›</button>
              </div>
            );
          })}
        </div>
        <ul className="elh-roster" data-test="elhalo-roster" aria-label="Players">
          {roster.length ? roster.map((r) => (
            <li key={r.id} className={`${r.me ? 'me' : ''}${r.ready ? ' ready' : ''}`} data-test="roster-row">
              <i style={{ background: DOTS[r.color % DOTS.length] }} />
              <b>{r.name}</b>{r.host && <em title="Host">★</em>}
              <span>{running ? 'JUGANDO' : r.ready ? '✓ LISTO' : '…'}</span>
            </li>
          )) : <li className="empty">NADIE TODAVÍA</li>}
        </ul>
        <p className="elh-live" data-test="elhalo-live">{info ? (info.players ? `${info.players} EN LA CANCHA · ${ph(info)}` : 'NADIE TODAVÍA · YOU START IT') : 'CONECTANDO…'}</p>
        {note && <p className="elh-note" role="alert">{note}</p>}
        <div className="elh-lb-btns">
          {!joined && <button className="m-btn" onClick={() => act(() => game()?.start())} disabled={m === 'loading' || busy} data-test="elhalo-start">▸ {running ? '¡ENTRAR!' : 'UNIRME'}</button>}
          {joined && <button className={`m-btn${info?.ready ? ' on' : ''}`} onClick={() => act(() => game()?.ready(!info?.ready))} aria-pressed={!!info?.ready} data-test="elhalo-ready">{info?.ready ? '✓ LISTO' : '¿LISTO?'}</button>}
          {joined && info?.host && <button className="m-btn alt" onClick={() => act(() => game()?.begin())} data-test="elhalo-begin">▸ EMPEZAR</button>}
        </div>
        {joined && !info?.host && <p className="elh-keys">{info?.hostName ? `${info.hostName} ★ EMPIEZA` : ''} · TODOS LISTOS Y ARRANCA</p>}
        {!touch && !joined && <p className="elh-keys">WASD · mouse · click fire · right-click zoom · E action · G grenade · T grenade type · F smack · R reload · Q swap · Tab scores</p>}
      </div>
    </div>
  );
}

function Board({ rows, onClose, touch }) {
  return (
    <div className="elh-board" data-test="elhalo-board" role="dialog" aria-label="Scoreboard">
      <table>
        <thead><tr><th>JUGADOR</th><th>PTS</th><th title="Horde kills">✶</th><th title="Player kills">PVP</th><th title="Times downed">↓</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`${r.me ? 'me' : ''}${r.away ? ' away' : ''}`}>
              <td><i style={{ background: `rgb(${r.color.map((v) => Math.round(v * 255)).join(',')})` }} />{r.name}{r.away ? ' (fuera)' : r.downed ? ' ↓' : r.dead ? ' ✝' : ''}</td>
              <td>{r.score.toLocaleString()}</td><td>{r.kills}</td><td>{r.pvp}</td><td>{r.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {touch && <button className="m-link" onClick={onClose} data-test="elhalo-board-close">CERRAR</button>}
    </div>
  );
}

export default function ElHaloRoom({ onExit, elapsedMs }) {
  const canvas = useRef(null), stage = useRef(null), game = useRef(null);
  const [touch] = useState(isTouch);
  const [muted, setMuted] = useState(() => localStorage.getItem('bba.elhalo.muted') === '1');
  const [mode, setMode] = useState({ mode: 'loading' });
  const [info, setInfo] = useState(null);
  const [board, setBoard] = useState(null); // rows while the scoreboard is open
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [music, setMusic] = useState(() => Math.max(0, Math.min(MUSIC_LEVELS.length - 1, +(localStorage.getItem('bba.elhalo.music') || 0) || 0)));
  const saveT = useRef(0);
  const exitRef = useRef(onExit); exitRef.current = onExit;

  useEffect(() => {
    const prevTitle = document.title; document.title = 'EL HALO · HALL OF DOORS';
    let g;
    try {
      g = createGame({ canvas: canvas.current, root: stage.current, touch, muted, musicLevel: music, reduceMotion: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        onMode: (m, extra) => setMode({ mode: m, ...extra }), onInfo: setInfo });
    } catch (err) { setMode({ mode: 'error', msg: String(err?.message || err) }); return () => { document.title = prevTitle; }; }
    game.current = g; window.__elHalo = g;
    getLook().then((l) => { if (l && game.current === g) { const c = cleanLook(l); setLook(c); g.setLook(c); } });
    const onKey = (e) => {
      if (e.key === 'Tab' && g.mode === 'playing') { e.preventDefault(); if (e.type === 'keydown') setBoard(g.board()); else setBoard(null); return; }
      if (e.type !== 'keydown' || e.key !== 'Escape') return;
      if (g.locked() || g.justUnlocked()) return; // that Esc just released the mouse: the menu shows, you stay
      e.preventDefault(); exitRef.current();
    };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); g.dispose(); if (window.__elHalo === g) delete window.__elHalo; game.current = null; document.title = prevTitle; };
  }, []);
  useEffect(() => { localStorage.setItem('bba.elhalo.muted', muted ? '1' : '0'); game.current?.setMuted(muted); }, [muted]);
  useEffect(() => { if (info?.myColor !== null && info?.myColor !== undefined) game.current?.setLook(look, info.myColor); }, [info?.myColor]);
  const setLookAt = (i, v) => {
    setLook((cur) => {
      const next = cur.slice(); next[i] = v; game.current?.setLook(next, info?.myColor ?? undefined);
      clearTimeout(saveT.current); saveT.current = setTimeout(() => saveLook(next), 250); // the server keeps it on your profile
      return next;
    });
  };
  const cycleMusic = () => { const n = (music + 1) % MUSIC_LEVELS.length; setMusic(n); localStorage.setItem('bba.elhalo.music', String(n)); game.current?.setMusicLevel(n); };
  useEffect(() => { // keep an open scoreboard fresh
    if (!board) return undefined;
    const id = setInterval(() => game.current && setBoard(game.current.board()), 500);
    return () => clearInterval(id);
  }, [!!board]);

  const secs = Math.floor(elapsedMs / 1000);
  const host = document.querySelector('.mines') || document.body;
  const m = mode.mode;
  const over = info?.phase === 'over' && info?.joined && info?.last;
  return createPortal(
    <div className={`m-doom m-elh${touch ? ' touch' : ''}`} role="dialog" aria-label="El Halo" data-test="elhalo-room" data-mode={m}>
      <div className="m-doom-bar m-elh-bar">
        <button className="m-btn m-doom-exit" onClick={onExit} data-test="elhalo-exit">◄ BACK TO THE HALL</button>
        <span className="m-elh-name" aria-hidden="true">EL HALO</span>
        <span className="m-dim m-doom-clock" title="Your shift is still on the clock while you're in here">SHIFT {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>
        {touch && m === 'playing' && <button className="m-link" onClick={() => setBoard((b) => (b ? null : game.current.board()))} data-test="elhalo-board-btn">MARCADOR</button>}
        <button className="m-link" onClick={cycleMusic} data-test="elhalo-music" title="Music volume">MÚSICA {MUSIC_LEVELS[music][0]}</button>
        <button className="m-link" onClick={() => setMuted((v) => !v)} aria-pressed={!muted} data-test="elhalo-mute">{muted ? '♪ OFF' : '♪ ON'}<span className="sr-only"> game sound</span></button>
      </div>
      <div className="elh-stage" ref={stage}>
        <canvas ref={canvas} className="elh-canvas" data-test="elhalo-canvas" />
        <div className="elh-hud" aria-hidden={m !== 'playing'}>
          <div className="elh-vig" data-h="vig" />
          <div className="elh-dir" data-h="dir"><span /></div>
          <div className="elh-top">
            <div className="elh-score"><b data-h="score" data-test="elhalo-pts">0</b><small>OLEADA <span data-h="wave">1</span></small><small className="elh-left" data-h="left" /></div>
            <div className="elh-bars" data-h="bars" data-test="elhalo-shield">
              <div className="elh-shield"><i data-h="shield" /></div>
              <div className="elh-health"><i data-h="health" /></div>
              <small className="elh-count" data-h="count" />
            </div>
            <div className="elh-ammo" data-h="ammo">
              <b data-h="mag">32</b><small data-h="reserve">192</small>
              <span className="elh-wname" data-h="wname">RIFLE DE ASALTO</span>
              <span className="elh-slots" data-h="slots" />
              <span className="elh-nades" data-h="nades" aria-label="Grenades: piñatas and stickies">✶2 ◆0</span>
            </div>
          </div>
          <div className="elh-feed" data-h="feed" data-test="elhalo-feed" />
          <div className="elh-scope" data-h="scope" data-test="elhalo-scope" />
          <div className="elh-reticle" data-h="reticle" data-test="elhalo-reticle"><span /></div>
          <div className="elh-hs" data-h="hs" data-test="elhalo-headshot">¡CABEZA!</div>
          <div className="elh-bleed" data-h="bleed" data-test="elhalo-bleed"><i /></div>
          <div className="elh-banner" data-h="banner" role="status" />
          <div className="elh-prompt" data-h="prompt" data-test="elhalo-prompt" />
          <div className="elh-pbar"><i data-h="promptbar" /></div>
          <div className="elh-down" data-h="down" data-test="elhalo-down" />
        </div>
        {touch && (
          <div className="elh-pad" data-test="elhalo-pad" hidden={m !== 'playing'}>
            <div className="elh-look" data-pad="look" />
            <div className="elh-stick" data-pad="stick" data-test="elhalo-stick"><div className="elh-base" data-pad="base"><div className="elh-knob" data-pad="knob" /></div></div>
            <div className="elh-acts">
              <button data-pad-btn="act" className="act" data-h="actbtn" data-test="pad-act">ACCIÓN</button>
              <button data-pad-btn="fire" className="fire" data-test="pad-fire">FIRE</button>
              <button data-pad-btn="grenade" className="nade" data-test="pad-grenade">GRENADE</button>
              <button data-pad-btn="jump" className="jump" data-test="pad-jump">JUMP</button>
              <button data-pad-btn="melee" className="melee" data-test="pad-melee">SMACK</button>
              <button data-pad-btn="reload" className="reload" data-test="pad-reload">RELOAD</button>
              <button data-pad-btn="swap" className="swap" data-test="pad-swap">SWAP</button>
              <button data-pad-btn="nadekind" className="nkind" data-h="nadekind" data-test="pad-nadekind">✶ PIÑATA</button>
              <button data-pad-btn="zoom" className="zoom" data-h="zoombtn" data-test="pad-zoom">ZOOM</button>
            </div>
          </div>
        )}
        {board && m === 'playing' && <Board rows={board} touch={touch} onClose={() => setBoard(null)} />}
        {(m === 'title' || m === 'loading' || m === 'lobby') && (
          <Lobby m={m} info={info} touch={touch} look={look} setLookAt={setLookAt} game={() => game.current} note={mode.note} />
        )}
        {m === 'paused' && !over && (
          <div className="elh-card" data-test="elhalo-paused">
            <h2 className="elh-logo sm">PAUSA</h2>
            <p>The horde doesn't pause. Neither do your friends.</p>
            <button className="m-btn" onClick={() => game.current?.resume()} data-test="elhalo-resume">▸ BACK IN</button>
            <p className="elh-keys">Esc again to go back to the hall</p>
          </div>
        )}
        {over && (m === 'playing' || m === 'paused') && (
          <div className="elh-card elh-dead" data-test="elhalo-over">
            <h2 className="elh-logo sm">SE ACABÓ</h2>
            <p className="elh-final">LLEGARON A LA OLEADA <b>{info.last.wave}</b></p>
            <ol className="elh-top3">{info.last.board.slice(0, 5).map((r) => <li key={r.id}>{r.name} · {r.score.toLocaleString()} · {r.kills}✶{r.pvp ? ` · ${r.pvp} PVP` : ''}</li>)}</ol>
            <p className="elh-keys">OTRA RONDA EN {info.cd}</p>
          </div>
        )}
        {m === 'error' && <div className="elh-card"><p>This door needs WebGL, and this browser said no.</p></div>}
      </div>
    </div>,
    host,
  );
}
