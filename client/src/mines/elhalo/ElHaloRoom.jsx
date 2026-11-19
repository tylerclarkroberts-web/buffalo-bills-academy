import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './elhalo.css';
import { createGame } from './game.js';
import { isCoarse, watchCoarse, needsRotatePrompt, loadSettings, saveSettings, DEFAULT_SETTINGS } from './controls.js';
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
const coarseNow = () => isCoarse();
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

export default function ElHaloRoom({ onExit, elapsedMs, exitLabel = '◄ BACK TO THE HALL', showShift = true }) {
  const canvas = useRef(null), stage = useRef(null), game = useRef(null), hostRef = useRef(null);
  const [touch, setTouch] = useState(coarseNow);
  const [muted, setMuted] = useState(() => localStorage.getItem('bba.elhalo.muted') === '1');
  const [mode, setMode] = useState({ mode: 'loading' });
  const [info, setInfo] = useState(null);
  const [board, setBoard] = useState(null); // rows while the scoreboard is open
  const [look, setLook] = useState(DEFAULT_LOOK);
  const [music, setMusic] = useState(() => Math.max(0, Math.min(MUSIC_LEVELS.length - 1, +(localStorage.getItem('bba.elhalo.music') || 0) || 0)));
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(() => loadSettings());
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [rotateOk, setRotateOk] = useState(false);
  const saveT = useRef(0);
  const exitRef = useRef(onExit); exitRef.current = onExit;
  const fsOnce = useRef(false);

  useEffect(() => watchCoarse(setTouch), []);
  useEffect(() => {
    const go = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', go);
    window.visualViewport?.addEventListener('resize', go);
    screen.orientation?.addEventListener?.('change', go);
    return () => {
      window.removeEventListener('resize', go);
      window.visualViewport?.removeEventListener('resize', go);
      screen.orientation?.removeEventListener?.('change', go);
    };
  }, []);
  const tall = needsRotatePrompt(vp.w, vp.h);
  useEffect(() => { if (!tall) setRotateOk(false); }, [tall]);

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
  useEffect(() => { game.current?.setPadMode(touch); }, [touch]);
  const setLookAt = (i, v) => {
    setLook((cur) => {
      const next = cur.slice(); next[i] = v; game.current?.setLook(next, info?.myColor ?? undefined);
      clearTimeout(saveT.current); saveT.current = setTimeout(() => saveLook(next), 250); // the server keeps it on your profile
      return next;
    });
  };
  const cycleMusic = () => { const n = (music + 1) % MUSIC_LEVELS.length; setMusic(n); localStorage.setItem('bba.elhalo.music', String(n)); game.current?.setMusicLevel(n); };
  const changeControls = (partial) => { const next = saveSettings({ ...settings, ...partial }); setSettings(next); game.current?.setControls(next); };
  const goFs = () => {
    if (fsOnce.current) return;
    const el = document.querySelector('.m-elh');
    if (!el || document.fullscreenElement || document.webkitFullscreenElement) return;
    fsOnce.current = true;
    try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => { fsOnce.current = false; }); } catch { fsOnce.current = false; }
  };
  useEffect(() => { // keep an open scoreboard fresh
    if (!board) return undefined;
    const id = setInterval(() => game.current && setBoard(game.current.board()), 500);
    return () => clearInterval(id);
  }, [!!board]);
  useEffect(() => { // pinch-zoom off while you're in a match (two thumbs are move + look, not a zoom)
    const inMatch = mode.mode === 'playing' || mode.mode === 'paused';
    if (!inMatch) return undefined;
    const meta = document.querySelector('meta[name="viewport"]');
    const prev = meta?.getAttribute('content') || '';
    meta?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    const block = (e) => e.preventDefault();
    document.addEventListener('gesturestart', block, { passive: false });
    document.addEventListener('gesturechange', block, { passive: false });
    document.addEventListener('gestureend', block, { passive: false });
    return () => {
      if (meta && prev) meta.setAttribute('content', prev);
      document.removeEventListener('gesturestart', block);
      document.removeEventListener('gesturechange', block);
      document.removeEventListener('gestureend', block);
    };
  }, [mode.mode]);

  const secs = Math.floor(elapsedMs / 1000);
  // Pin the portal host on first render. On /elhalo the .mines wrapper is not in the document yet
  // (its child is still rendering), so the first lookup falls through to document.body; a later
  // lookup would find .mines and remount the canvas, leaving the WebGL context on a detached node.
  if (!hostRef.current) hostRef.current = document.querySelector('.mines') || document.body;
  const host = hostRef.current;
  const m = mode.mode;
  const over = info?.phase === 'over' && info?.joined && info?.last;
  const inMatch = m === 'playing' || m === 'paused';
  const collapseBar = touch && inMatch;
  const showRotate = tall && !rotateOk;
  const compactExit = touch ? '◄ SALIR' : exitLabel;
  const openBoard = () => setBoard((b) => (b ? null : game.current.board()));
  const menuBits = (
    <>
      <button type="button" className="m-btn m-doom-exit" onClick={onExit} data-test="elhalo-exit">{collapseBar ? exitLabel : compactExit}</button>
      <button type="button" className="m-link" onClick={() => { openBoard(); setMenu(false); }} data-test="elhalo-board-btn">MARCADOR</button>
      <button type="button" className="m-link" onClick={cycleMusic} data-test="elhalo-music" title="Music volume">MÚSICA {MUSIC_LEVELS[music][0]}</button>
      <button type="button" className="m-link" onClick={() => setMuted((v) => !v)} aria-pressed={!muted} data-test="elhalo-mute">{muted ? '♪ OFF' : '♪ ON'}<span className="sr-only"> game sound</span></button>
    </>
  );
  return createPortal(
    <div className={`m-doom m-elh${touch ? ' touch' : ''}${inMatch ? ' elh-inmatch' : ''}${touch && vp.w * vp.h >= 700 * 800 ? ' elh-large' : ''}`} role="dialog" aria-label="El Halo" data-test="elhalo-room" data-mode={m} onPointerDown={goFs}>
      {!collapseBar && (
        <div className="m-doom-bar m-elh-bar">
          <button className="m-btn m-doom-exit" onClick={onExit} data-test="elhalo-exit">{compactExit}</button>
          <span className="m-elh-name" aria-hidden="true">EL HALO</span>
          {showShift && <span className="m-dim m-doom-clock" title="Your shift is still on the clock while you're in here">SHIFT {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>}
          {touch && m === 'playing' && <button className="m-link" onClick={openBoard} data-test="elhalo-board-btn">MARCADOR</button>}
          <button className="m-link" onClick={cycleMusic} data-test="elhalo-music" title="Music volume">MÚSICA {MUSIC_LEVELS[music][0]}</button>
          <button className="m-link" onClick={() => setMuted((v) => !v)} aria-pressed={!muted} data-test="elhalo-mute">{muted ? '♪ OFF' : '♪ ON'}<span className="sr-only"> game sound</span></button>
        </div>
      )}
      {collapseBar && (
        <button type="button" className="elh-pause" data-test="elhalo-pause" aria-label="Menu" onClick={() => setMenu((v) => !v)}>{menu ? '✕' : '☰'}</button>
      )}
      {collapseBar && menu && (
        <div className="elh-menu" data-test="elhalo-menu">
          {menuBits}
          <ControlSettings settings={settings} onChange={changeControls} />
          {m === 'paused' && !over && <button type="button" className="m-btn" onClick={() => { setMenu(false); game.current?.resume(); }} data-test="elhalo-resume">▸ BACK IN</button>}
        </div>
      )}
      <div className="elh-stage" ref={stage}>
        <canvas ref={canvas} className="elh-canvas" data-test="elhalo-canvas" />
        <div className={`elh-hud${over ? ' is-over' : ''}`} aria-hidden={m !== 'playing' || over}>
          <div className="elh-vig" data-h="vig" />
          <div className="elh-dir" data-h="dir"><span /></div>
          <div className="elh-top">
            <div className="elh-score"><b data-h="score" data-test="elhalo-pts">0</b><small>OLEADA <span data-h="wave">1</span></small><small className="elh-left" data-h="left" /></div>
            <div className="elh-bars" data-h="bars" data-test="elhalo-shield">
              <div className="elh-shield"><i data-h="shield" /></div>
              <div className="elh-health"><i data-h="health" /></div>
              <small className="elh-count" data-h="count" />
            </div>
            <div className="elh-ammo" data-h="ammo" data-test="elhalo-ammo-hud">
              <span className="elh-wmeta">
                <i className="elh-wicon" data-h="wicon" data-w="rifle" aria-hidden="true" />
                <span className="elh-wname" data-h="wname">RIFLE DE ASALTO</span>
              </span>
              <b className="elh-ammo-read" data-h="magread" data-test="elhalo-ammo">32 / 192</b>
              <span hidden data-h="mag">32</span><span hidden data-h="reserve">192</span>
              <div className="elh-ammo-toast" data-h="ammotoast" data-test="elhalo-ammo-toast" />
              <span className="elh-ammo-hint" data-h="ammohint" data-test="elhalo-ammo-hint" />
              <i className="elh-reload" data-h="reloadbar"><em data-h="reloadfill" /></i>
              <span className="elh-slots" data-h="slots" />
              <span className="elh-nades" data-h="nades" aria-label="Grenades: piñatas and stickies">✶2 ◆0</span>
            </div>
          </div>
          <div className="elh-feed" data-h="feed" data-test="elhalo-feed" />
          <div className="elh-scope" data-h="scope" data-test="elhalo-scope" />
          <div className="elh-reticle" data-h="reticle" data-test="elhalo-reticle"><span /></div>
          <div className="elh-hs" data-h="hs" data-test="elhalo-headshot">¡CABEZA!</div>
          <div className="elh-bleed" data-h="bleed" data-test="elhalo-bleed"><i /></div>
          <div className="elh-chile" data-h="chile" data-test="elhalo-chile-timer">
            <span className="elh-chilename" data-h="chilename" />
            <span className="elh-chiletime" data-h="chiletime" data-test="elhalo-chile-time" />
            <i className="elh-chilebar"><em data-h="chilebar" /></i>
          </div>
          <div className="elh-banner" data-h="banner" role="status" />
          <div className="elh-schnuttin" data-h="schnuttin" data-test="elhalo-schnuttin" role="status" />
          <div className="elh-prompt" data-h="prompt" data-test="elhalo-prompt" />
          <div className="elh-pbar" data-h="pbar"><i data-h="promptbar" /></div>
          <div className="elh-down" data-h="down" data-test="elhalo-down" />
        </div>
        {touch && (
          <div className="elh-pad" data-test="elhalo-pad" hidden={m !== 'playing' || over}>
            <div className="elh-look" data-pad="look" />
            <div className="elh-stick" data-pad="stick" data-test="elhalo-stick"><div className="elh-base" data-pad="base"><div className="elh-knob" data-pad="knob" /></div></div>
            <div className="elh-acts">
              <button type="button" data-pad-btn="act" className="act" data-h="actbtn" data-test="pad-act">ACCIÓN</button>
              <button type="button" data-pad-btn="fire" className="fire" data-test="pad-fire">FIRE</button>
              <button type="button" data-pad-btn="jump" className="jump" data-test="pad-jump">JUMP</button>
              <button type="button" data-pad-btn="crouch" className="crouch" data-test="pad-crouch">CROUCH</button>
              <button type="button" data-pad-btn="reload" className="reload" data-test="pad-reload">RELOAD</button>
              <button type="button" data-pad-btn="swap" className="swap" data-test="pad-swap">SWAP</button>
              <button type="button" data-pad-btn="ads" className="ads" data-h="zoombtn" data-test="pad-ads">ADS</button>
              <div className="elh-more">
                <button type="button" data-pad-btn="more" className="more" data-test="pad-more">MÁS</button>
                <div className="elh-more-pop">
                  <button type="button" data-pad-btn="grenade" className="nade" data-test="pad-grenade">GRENADE</button>
                  <button type="button" data-pad-btn="melee" className="melee" data-test="pad-melee">SMACK</button>
                  <button type="button" data-pad-btn="nadekind" className="nkind" data-h="nadekind" data-test="pad-nadekind">✶ PIÑATA</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {showRotate && (
          <div className={`elh-rotate${inMatch ? '' : ' slim'}`} data-test="elhalo-rotate">
            <p>Gira el teléfono de lado para mover y apuntar al mismo tiempo.</p>
            <button type="button" data-test="elhalo-rotate-dismiss" onClick={() => setRotateOk(true)}>JUGAR ASÍ</button>
          </div>
        )}
        {board && m === 'playing' && <Board rows={board} touch={touch} onClose={() => setBoard(null)} />}
        {(m === 'title' || m === 'loading' || m === 'lobby') && (
          <Lobby m={m} info={info} touch={touch} look={look} setLookAt={setLookAt} game={() => game.current} note={mode.note} />
        )}
        {m === 'paused' && !over && !collapseBar && (
          <div className="elh-card" data-test="elhalo-paused">
            <h2 className="elh-logo sm">PAUSA</h2>
            <p>The horde doesn't pause. Neither do your friends.</p>
            <ControlSettings settings={settings} onChange={changeControls} />
            <button className="m-btn" onClick={() => game.current?.resume()} data-test="elhalo-resume">▸ BACK IN</button>
            <p className="elh-keys">Esc again to go back to the hall</p>
          </div>
        )}
        {over && (m === 'playing' || m === 'paused') && (
          <div className="elh-card elh-over" data-test="elhalo-over">
            <h2 className="elh-logo sm">SE ACABÓ</h2>
            <p className="elh-final">OLEADA <b data-test="elhalo-over-wave">{info.last.wave}</b></p>
            <table className="elh-overboard" data-test="elhalo-leaderboard">
              <thead>
                <tr>
                  <th>JUGADOR</th>
                  <th title="Horde kills">✶</th>
                  <th title="Revives">↑</th>
                  <th title="Times downed">↓</th>
                </tr>
              </thead>
              <tbody>
                {(info.last.board || []).map((row) => (
                  <tr key={row.id} className={[row.id === info.myId || row.me ? 'me' : '', row.topKiller ? 'top-killer' : '', row.topReviver ? 'top-reviver' : ''].filter(Boolean).join(' ')} data-test={`elhalo-row-${row.id}`}>
                    <td>
                      <span className="elh-overname">{row.name}</span>
                      {row.topKiller && <span className="elh-crown" title="Most kills" data-test="elhalo-top-killer">✶</span>}
                      {row.topReviver && <span className="elh-crown up" title="Most revives" data-test="elhalo-top-reviver">↑</span>}
                      {!!row.badges?.length && (
                        <span className="elh-badges">
                          {row.badges.map((b) => <i key={b.id} data-test={`elhalo-badge-${b.id}`} title={b.name}>{b.name}</i>)}
                        </span>
                      )}
                    </td>
                    <td>{row.kills}</td>
                    <td>{row.revives || 0}</td>
                    <td>{row.deaths || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="elh-overacts">
              <button type="button" className="m-btn" onClick={() => game.current?.again()} data-test="elhalo-again">▸ OTRA RONDA</button>
              <button type="button" className="m-btn alt" onClick={() => game.current?.leaveLobby()} data-test="elhalo-over-back">SALIR</button>
            </div>
            <p className="elh-keys">NUEVA RONDA EN {info.cd}</p>
          </div>
        )}
        {m === 'error' && <div className="elh-card"><p>This door needs WebGL, and this browser said no.</p></div>}
      </div>
    </div>,
    host,
  );
}

function ControlSettings({ settings, onChange }) {
  const s = settings || DEFAULT_SETTINGS;
  return (
    <div className="elh-settings" data-test="elhalo-settings">
      <label>MIRAR<input type="range" min="0.4" max="2.4" step="0.05" value={s.hipSens} onChange={(e) => onChange({ hipSens: +e.target.value })} data-test="elhalo-hip-sens" /></label>
      <label>MIRA (ADS)<input type="range" min="0.4" max="2.4" step="0.05" value={s.adsSens} onChange={(e) => onChange({ adsSens: +e.target.value })} data-test="elhalo-ads-sens" /></label>
      <label className="check"><input type="checkbox" checked={!!s.autoFire} onChange={(e) => onChange({ autoFire: e.target.checked })} data-test="elhalo-autofire" /> AUTO-FIRE</label>
      <label className="check"><input type="checkbox" checked={!!s.invert} onChange={(e) => onChange({ invert: e.target.checked })} data-test="elhalo-invert" /> INVERTIR</label>
    </div>
  );
}
