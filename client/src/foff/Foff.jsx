import React, { useEffect, useRef, useState } from 'react';
import { navigate } from '../App.jsx';
import { api } from '../api.js';
import { MATCHES } from './course.js';
import { createGame, loadSave, patchSave } from './game.js';
import { meterX } from './draw.js';
import { TRIP } from './quests.js';
import { setSound } from './sfx.js';
import './foff.css';

// Foff's Bachelor Party: a hidden golf adventure. This is the HUD around the canvas; the game is in game.js.
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* private mode */ } return null; };
const sum = (r) => r.reduce((a, b) => a + b, 0);
const SWING = { aim: 'SWING', power: 'SET POWER', acc: 'SET DIRECTION', fly: '...', foes: 'SKIP' };
// One line for whichever of the three taps is next.
function hint(ui) {
  if (ui.phase === 'aim') return ui.armed ? 'The next one goes dead straight, and far.' : ui.putt && ui.lie === 'green' ? 'Point the line uphill of the hole. The marks run downhill.' : 'Point the line: tap the course or hold ◄ ►. Then SWING.';
  if (ui.phase === 'power') return ui.inReach ? 'The bar is distance. Tap when it reaches the flag.' : 'The flag is out of reach. Tap at the top for all of it.';
  if (ui.phase === 'acc') return 'Now tap when the gold arrow lines up with the dotted one.';
  return ' ';
}

export default function Foff() {
  const canvas = useRef(null), game = useRef(null);
  const [ui, setUi] = useState(null); // null: the title screen
  const [muted, setMuted] = useState(() => store('bba.foff.muted') === '1');
  useEffect(() => { setSound(!muted); store('bba.foff.muted', muted ? '1' : '0'); }, [muted]);
  // Winning the last nine pays out once, on the server: $2,000 and a medal for the wall of My Room. A win while
  // signed out keeps: the claim is tried again whenever this page opens, until it lands.
  const [prize, setPrize] = useState(null), won = ui?.screen === 'end' && ui.result === 'win' && ui.finale;
  useEffect(() => {
    const save = loadSave(), last = MATCHES.at(-1).id;
    if (save.paid || !save.best?.[last]) return;
    api('POST', '/foff/claim').then((r) => { patchSave((s) => { s.paid = true; }); setPrize(r.already ? 'The medal is already on your wall. The $2,000 only came once.' : `$${r.prize.toLocaleString('en-US')} is in your pocket and the medal is in My Room, with the oddities.`); })
      .catch(() => setPrize('Sign in to collect the medal and the $2,000. They will keep.'));
  }, [won]);
  // Side quests pay pocket money, and four leave a keepsake for My Room. Same rule: once each, collected when it can be.
  const [loot, setLoot] = useState(null), qwon = ui?.screen === 'qend' && ui.result === 'win' ? ui.id : null;
  useEffect(() => {
    setLoot(null);
    const save = loadSave(), owed = Object.keys(save.quests || {}).filter((id) => !save.paidQuests?.[id]);
    (async () => {
      for (const id of owed) {
        try {
          const r = await api('POST', '/foff/quest', { id });
          patchSave((s) => { s.paidQuests = { ...s.paidQuests, [id]: true }; });
          if (id === qwon && !r.already) setLoot(`$${r.cash} for your trouble${r.item ? `, and one ${r.item} for a shelf in My Room` : ''}.`);
        } catch { if (id === qwon) setLoot('Sign in to collect what this one pays. It will keep.'); return; }
      }
    })();
  }, [qwon]);
  useEffect(() => {
    const title = document.title; document.title = 'Foff\'s Bachelor Party';
    game.current = createGame(canvas.current, setUi);
    if (!loadSave().seen) game.current.story(); // the first visit opens on how we got here
    return () => { document.title = title; game.current.dispose(); };
  }, []);
  const saved = loadSave(), questing = ui?.screen === 'quest';
  const best = saved.best || {}, upNext = (MATCHES.find((x) => !best[x.id]) || MATCHES.at(-1)).id; // each nine opens when the one before it is won
  const play = ui?.screen === 'play', talking = !!ui?.talk, aiming = play && !talking && ['aim', 'power', 'acc'].includes(ui.phase);
  // Pointer buttons act on press (the meter is about timing) and never take focus; keyboard users get the click.
  const press = (fn) => ({ onPointerDown: (e) => { e.preventDefault(); fn(); }, onClick: (e) => { if (e.detail === 0) fn(); } });
  const hold = (dir) => ({ onPointerDown: (e) => { e.preventDefault(); game.current.turn(dir); }, onPointerUp: () => game.current.turn(0), onPointerLeave: () => game.current.turn(0), onPointerCancel: () => game.current.turn(0), onClick: (e) => { if (e.detail === 0) game.current.nudge(dir); } });
  const aimAt = (e) => { if (e.type === 'pointerdown' || (e.buttons && play)) game.current?.point(e.clientX, e.clientY); };
  // Side quests: a d-pad that moves while it is held, and an action button that knows when it is let go.
  const stop = () => game.current.move(0, 0);
  const dir = (x, y, name) => <button className="foff-btn" aria-label={name} style={{ gridArea: name }} onPointerDown={(e) => { e.preventDefault(); game.current.move(x, y); }} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
    onClick={(e) => { if (e.detail === 0) { game.current.move(x, y); setTimeout(stop, 160); } }}>{{ left: '◄', right: '►', up: '▲', down: '▼' }[name]}</button>;

  return (
    <div className="foff">
      <div className="foff-stage">
        <div className="foff-view">
          <canvas ref={canvas} className="foff-canvas" aria-label="The game" onPointerDown={aimAt} onPointerMove={aimAt} />
          {questing && <div className="foff-hud" data-test="foff-quest"><div>{ui.title.toUpperCase()}</div><div>{ui.status}</div></div>}
          {play && <div className="foff-hud" data-test="foff-hud">
            <div>HOLE {ui.hole} · PAR {ui.par}</div>
            <div>SHOT {ui.shot} · {ui.toPin} · {ui.lie.toUpperCase()}</div>
            <div>WIND {ui.wind.mph ? <><span className="foff-wind" style={{ transform: `rotate(${ui.wind.deg}deg)` }} aria-hidden="true">↑</span> {ui.wind.mph} MPH</> : 'CALM'}</div>
          </div>}
          <div className="foff-corner">
            {ui?.screen === 'scene' && <button className="foff-link" onClick={() => game.current.skip()} data-test="foff-skip">SKIP</button>}
            {(play || questing) && <button className="foff-link" onClick={() => game.current.menu()} data-test="foff-trip">TRIP</button>}
            <button className="foff-link" onClick={() => setMuted((v) => !v)} aria-pressed={!muted}>{muted ? '♪ OFF' : '♪ ON'}<span className="sr-only"> sound</span></button>
            <button className="foff-link" onClick={() => navigate('/')} aria-label="Leave the bachelor party">✕</button>
          </div>
          {aiming && (ui.phase === 'acc'
            ? <div className="foff-ticks" aria-hidden="true"><span style={{ left: `${meterX(0) * 100}%` }}>LEFT</span><b style={{ left: '50%' }}>STRAIGHT</b><span style={{ right: `${100 - meterX(1) * 100}%` }}>RIGHT</span></div>
            : <div className="foff-ticks" aria-hidden="true">{ui.ticks.map((s, i) => <span key={i} style={{ right: `${100 - meterX((i + 1) / 2) * 100}%` }}>{s}</span>)}</div>)}
          {ui?.bark && !talking && (play || questing) && <div className="foff-bark" aria-live="polite"><b>{ui.bark.who}</b> {ui.bark.text}</div>}
          {talking && <button className="foff-talk" onClick={() => game.current.tap()} autoFocus key={ui.talk.text} data-test="foff-talk"><b>{ui.talk.who}</b><span>{ui.talk.text}</span><i aria-hidden="true">▼</i></button>}

          {!ui && <div className="foff-sheet title">
            <h1>Foff&rsquo;s<br />Bachelor Party</h1>
            <p>Monterey, in the timeline where Christmas stayed in December.</p>
            <div className="foff-day"><button className="foff-stop" onClick={() => game.current.story()} data-test="foff-story"><b>How we got here</b><span>The story</span></button></div>
            {TRIP.map(({ day, stops }) => <section className="foff-day" key={day}>
              <h3>{day}</h3>
              <ol className="foff-trip">{stops.map(({ match: x, quest: q }) => {
                const open = x ? x.id === 1 || !!best[x.id - 1] : !q.need || !!best[q.need], done = x ? best[x.id] : saved.quests?.[q.id];
                return (
                  <li key={x ? x.id : q.id}><button className={`foff-stop ${x ? 'golf' : ''}`} disabled={!open} autoFocus={x?.id === upNext} onClick={() => (x ? game.current.start(x.id) : game.current.quest(q.id))} data-test={x ? `foff-match-${x.id}` : `foff-quest-${q.id}`}>
                    <b>{x ? `${x.course} · ${x.nine}` : q.title}</b>
                    <span>{!open ? 'Win more golf first' : x ? `vs ${x.foes.map((f) => f.name).join(' & ')}${done ? ` · won in ${done}` : ''}` : done ? 'Done' : 'Side quest'}</span>
                  </button></li>
                );
              })}</ol>
            </section>)}
            <div className="foff-day"><button className="foff-stop" disabled={!saved.quests?.sfo} onClick={() => game.current.ending()} data-test="foff-ending"><b>How it ended</b><span>{saved.quests?.sfo ? 'The flight home' : 'After the race to SFO'}</span></button></div>
          </div>}
          {ui?.screen === 'qend' && <div className="foff-sheet">
            <h2>{ui.result === 'win' ? ui.title.toUpperCase() : 'NOT THIS TIME'}</h2>
            <p>{ui.line}</p>
            {loot && <p className="foff-prize" role="status" data-test="foff-loot">{loot}</p>}
            {ui.result !== 'win' && <button className="foff-btn go" autoFocus onClick={() => game.current.again()} data-test="foff-again">TRY AGAIN</button>}
            <button className={ui.result === 'win' ? 'foff-btn go' : 'foff-link'} autoFocus={ui.result === 'win'} onClick={() => (ui.id === 'sfo' && ui.result === 'win' && !loadSave().ended ? game.current.ending() : game.current.menu())} data-test="foff-menu">{ui.id === 'sfo' && ui.result === 'win' && !saved.ended ? 'THE FLIGHT HOME' : 'THE TRIP'}</button>
          </div>}
          {ui?.screen === 'card' && <div className="foff-sheet">
            <Card card={ui.card} />
            <button className="foff-btn go" autoFocus onClick={() => game.current.next()} data-test="foff-next">{ui.hole < ui.card.pars.length ? 'NEXT HOLE' : 'SIGN THE CARD'}</button>
          </div>}
          {ui?.screen === 'end' && !talking && <div className="foff-sheet">
            <h2>{ui.result !== 'win' ? (ui.result === 'tie' ? 'A TIE' : 'KEETCH LOSES') : ui.finale ? 'THE PRESIDENTIAL MEDAL OF FREEDOM' : 'KEETCH WINS'}</h2>
            {won && <p>Awarded to Keetch on the eighteenth at Black Horse. For golf.</p>}
            {won && prize && <p className="foff-prize" role="status" data-test="foff-prize">{prize}</p>}
            <Card card={ui.card} />
            <p>{won ? '' : ui.result === 'win' ? ui.next : `He only moves on by beating ${ui.card.names.length > 2 ? 'them both' : ui.card.names[1]}.`}</p>
            {!(ui.result === 'win' && ui.finale) && <button className="foff-btn go" autoFocus onClick={() => game.current.next()} data-test="foff-again">{ui.result === 'win' ? 'NEXT NINE' : 'TRY AGAIN'}</button>}
            <button className={ui.result === 'win' && ui.finale ? 'foff-btn go' : 'foff-link'} onClick={() => game.current.menu()} data-test="foff-menu">THE TRIP</button>
          </div>}
        </div>

        <div className="foff-pad" style={{ visibility: play || questing ? 'visible' : 'hidden' }}>
          {questing && <>
            <div className="foff-row">
              {ui.pad !== 'none' && <div className={`foff-dpad ${ui.pad}`}>{ui.pad === 'dpad' && dir(0, -1, 'up')}{dir(-1, 0, 'left')}{ui.pad === 'dpad' && dir(0, 1, 'down')}{dir(1, 0, 'right')}</div>}
              {ui.action && <button className="foff-btn go big" disabled={talking} onPointerDown={(e) => { e.preventDefault(); game.current.hold(true); }} onPointerUp={() => game.current.hold(false)} onPointerLeave={() => game.current.hold(false)} onPointerCancel={() => game.current.hold(false)}
                onClick={(e) => { if (e.detail === 0) game.current.tap(); }} data-test="foff-action">{ui.action}</button>}
            </div>
            <div className="foff-hint">{talking ? '\u00a0' : ui.hint}</div>
          </>}
          {play && <>
            <div className="foff-row">
              <div className="foff-group"><small>AIM</small>
                <button className="foff-btn" disabled={ui.phase !== 'aim' || talking} aria-label="Aim left" {...hold(-1)}>◄</button>
                <button className="foff-btn" disabled={ui.phase !== 'aim' || talking} aria-label="Aim right" {...hold(1)}>►</button>
              </div>
              <div className="foff-group wide"><small>CLUB</small>
                <button className="foff-btn" disabled={ui.phase !== 'aim' || talking || !ui.canClub} aria-label="Shorter club" {...press(() => game.current.club(-1))}>−</button>
                <span className="foff-club" data-test="foff-club">{ui.club}<small>UP TO {ui.ticks[1]}</small></span>
                <button className="foff-btn" disabled={ui.phase !== 'aim' || talking || !ui.canClub} aria-label="Longer club" {...press(() => game.current.club(1))}>+</button>
              </div>
            </div>
            <div className="foff-row">
              <button className="foff-btn go big" disabled={ui.phase === 'fly' || talking} {...press(() => game.current.tap())} data-test="foff-swing">{SWING[ui.phase]}</button>
              {ui.charge >= 1
                ? <button className={`foff-btn horse ${ui.armed ? 'on' : ''}`} disabled={ui.phase !== 'aim' || talking} aria-pressed={ui.armed} {...press(() => game.current.giddyup())} data-test="foff-giddyup">GIDDYUP</button>
                : ui.charge > 0 && <span className="foff-pips" aria-label={`Chosen One shot ${Math.round(ui.charge * 3)} of 3`}>{'◆'.repeat(Math.round(ui.charge * 3))}{'◇'.repeat(3 - Math.round(ui.charge * 3))}</span>}
            </div>
            <div className="foff-hint">{talking ? ' ' : hint(ui)}</div>
          </>}
        </div>
      </div>
    </div>
  );
}

function Card({ card }) {
  return (
    <table className="foff-card" data-test="foff-card">
      <thead><tr><th scope="col">HOLE</th>{card.pars.map((_, i) => <th scope="col" key={i}>{i + 1}</th>)}<th scope="col">TOT</th></tr></thead>
      <tbody>
        <tr className="foff-dim"><th scope="row">Par</th>{card.pars.map((p, i) => <td key={i}>{p}</td>)}<td>{sum(card.pars)}</td></tr>
        {card.names.map((n, k) => <tr key={n}><th scope="row">{n}</th>{card.pars.map((_, i) => <td key={i}>{card.rows[k][i] ?? '·'}</td>)}<td>{sum(card.rows[k])}</td></tr>)}
      </tbody>
    </table>
  );
}
