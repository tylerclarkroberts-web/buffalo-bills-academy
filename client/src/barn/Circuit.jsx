// The Tri-County Bug Circuit, the Barn's single-player campaign (server/circuit.js). A trail of stops through the
// area; picking one shows who is there and, when there is a fight, which of your bugs to send in. The fight itself
// plays in the Barn's ring like any other (the Barn page follows it), so this only starts rounds and shows progress.
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../App.jsx';
import { BY_ID } from '../../../server/engine/creatures.js';
import { typeOf, edge } from '../../../server/engine/bug-types.js';
import { TypeChip } from './BugCard.jsx';
import { drawBug } from './sprite.js';

function Thumb({ species, level, style, w = 52, h = 42 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, kind = BY_ID[species]; if (!c || !kind) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    drawBug(x, kind, { w: c.width, h: c.height, still: true, style, level });
  }, [species, level, JSON.stringify(style || null)]);
  return <canvas ref={ref} className="cc-thumb" style={{ width: w, height: h }} aria-hidden="true" />;
}

/** A fair ribbon: a rosette with its number, coloured once won. */
function Rosette({ n, on, size = 30 }) {
  return <svg className={`cc-rosette${on ? ' on' : ''}`} viewBox="0 0 30 40" width={size * 0.75} height={size} role="img" aria-label={on ? `Ribbon ${n}, won` : `Ribbon ${n}, not yet`}>
    <path d="M9 22 L5 39 L11 35 L14 39 L15 24 Z M21 22 L25 39 L19 35 L16 39 L15 24 Z" className="tails" />
    <circle cx="15" cy="14" r="13" className="petals" /><circle cx="15" cy="14" r="8.5" className="eye" />
    <text x="15" y="18" textAnchor="middle">{n}</text>
  </svg>;
}
const Clipboard = () => <svg viewBox="0 0 16 16" width="26" height="26" aria-hidden="true" shapeRendering="crispEdges"><rect x="2" y="2" width="12" height="13" fill="#b8874a" /><rect x="4" y="4" width="8" height="9" fill="#f3ecd2" /><rect x="5" y="1" width="6" height="3" fill="#8a8f9a" /><rect x="5" y="6" width="6" height="1" fill="#8a7a66" /><rect x="5" y="8" width="5" height="1" fill="#8a7a66" /><rect x="5" y="10" width="6" height="1" fill="#8a7a66" /></svg>;
const Cross = () => <svg viewBox="0 0 12 12" width="24" height="24" aria-hidden="true" shapeRendering="crispEdges"><rect x="1" y="1" width="10" height="10" fill="#fff" /><rect x="5" y="2.5" width="2" height="7" fill="#e65d70" /><rect x="2.5" y="5" width="7" height="2" fill="#e65d70" /></svg>;

function Icon({ stop }) {
  if (stop.kind === 'talk') return <Clipboard />;
  if (stop.kind === 'center') return <Cross />;
  const lead = stop.bugs[0];
  return <Thumb species={lead.species} level={lead.level} w={40} h={32} />;
}
const stateOf = (stop, run, tolls) => stop.done ? (stop.kind === 'leader' ? 'Ribbon won' : stop.kind === 'boss' ? 'Card won' : stop.kind === 'talk' ? 'Registered' : tolls?.[stop.id] === 'paid' ? 'Paid' : 'Beaten')
  : !stop.open ? 'Not yet' : run?.stop === stop.id ? `Round ${run.foe + 1} of ${stop.bugs.length}` : stop.kind === 'center' ? 'Open' : 'Up next';

function Say({ who, lines }) {
  return <div className="cc-say">{lines.map((line, k) => <p key={k}>{k === 0 && <b>{who}</b>}{line}</p>)}</div>;
}

/** Which of your bugs goes in. Fainted ones and ones already beaten in this gauntlet sit it out. */
function Pick({ bugs, run, foe, sel, setSel }) {
  return <div className="cc-pick" role="radiogroup" aria-label="Send in">
    {bugs.map((bug) => {
      const out = run?.out.includes(bug.id), hp = run?.hp[bug.id], off = bug.fainted || out, e = edge(typeOf(bug.species), typeOf(foe.species));
      return <button key={bug.id} role="radio" aria-checked={sel === bug.id} className={`cc-bug${sel === bug.id ? ' on' : ''}`} disabled={off} onClick={() => setSel(bug.id)} data-test="circuit-bug">
        <Thumb species={bug.species} level={bug.level} style={bug.style} />
        <span><b>{bug.partner ? '★ ' : ''}{bug.name}</b><small>Lv {bug.level} <TypeChip type={typeOf(bug.species)} small />{hp != null && <> · {hp}% HP</>}</small>
          <small className={off ? 'cc-off' : e > 0 ? 'cc-good' : e < 0 ? 'cc-bad' : ''}>{bug.fainted ? 'Fainted' : out ? 'Out of this one' : e > 0 ? 'Type edge' : e < 0 ? 'Weak to it' : 'Even types'}</small></span>
      </button>;
    })}
  </div>;
}

function Stop({ stop, c, b, busy, act: run0, setC, pin, next, onArea, afterName }) {
  const onward = stop.done && next && next.id !== stop.id ? <button className="btn primary" onClick={() => pin(next.id)} data-test="circuit-next">On to {next.who}</button>
    : stop.done && (stop.kind === 'leader' || stop.kind === 'boss') && onArea ? <button className="btn primary" onClick={onArea} data-test="circuit-next-area">On to {afterName}</button> : null;
  const act = (work) => { pin(stop.id); return run0(work); }; // stay on this stop after acting, so its reply or result is seen
  const run = c.run?.stop === stop.id ? c.run : null;
  const bugs = (b.stable?.bugs || []).filter((bug) => bug.stage === 'creature');
  const foe = stop.bugs?.[run ? run.foe : 0];
  const ready = bugs.filter((bug) => !bug.fainted && !run?.out.includes(bug.id));
  const [sel, setSel] = useState(null), [reply, setReply] = useState(null);
  const chosen = ready.find((bug) => bug.id === sel) || ready.find((bug) => bug.partner) || ready[0] || null;
  useEffect(() => { setReply(null); }, [stop.id]);
  const fight = () => act(async () => setC(await api('POST', '/circuit/fight', { stop: stop.id, bug: chosen.id })));
  const payToll = () => act(async () => { const r = await api('POST', '/circuit/toll', { stop: stop.id }); setReply(r.reply); setC(r); });
  const paid = c.tolls?.[stop.id] === 'paid';
  if (stop.kind === 'center') return <div className="cc-stop" data-test="circuit-stop">
    <h3>{stop.who}</h3><Say who={stop.who} lines={stop.lines} />
    <button className="btn" onClick={() => navigate('/barn/center')} data-test="circuit-center">Go in</button>
  </div>;
  if (stop.kind === 'talk') return <div className="cc-stop" data-test="circuit-stop">
    <h3>{stop.who}</h3>
    {!stop.done ? <>
      <Say who={stop.who} lines={[...stop.lines, stop.ask.q]} />
      <div className="cc-answers">{stop.ask.options.map(([text], k) => <button key={k} className="btn" disabled={busy} onClick={() => act(async () => { const r = await api('POST', '/circuit/talk', { stop: stop.id, answer: k }); setReply(r.reply); setC(r); })} data-test="circuit-answer">{text}</button>)}</div>
    </> : <><Say who={stop.who} lines={[...(reply ? [reply] : [`Conceived: ${c.conceived || 'somewhere'}. It's on file. Somewhere.`]), ...stop.after]} />{onward}</>}
  </div>;
  const leader = stop.kind === 'leader', boss = stop.kind === 'boss', many = stop.bugs?.length > 1;
  return <div className="cc-stop" data-test="circuit-stop">
    <h3>{stop.who}{leader && <small> · {stop.title}</small>}{boss && <small> · Feature presentation</small>}</h3>
    {boss && <p className="cc-poster" data-test="circuit-poster">“{stop.poster}” · one of a kind · no jar will hold it</p>}
    <Say who={stop.who} lines={stop.done ? [paid ? reply || stop.paid : stop.won] : run ? [run.out.length ? stop.sub : run.foe ? stop.next : stop.intro.at(-1)] : stop.intro} />
    <div className="cc-lineup" aria-label={many ? `${stop.who}'s bugs, in order` : `${stop.who}'s bug`}>
      {stop.bugs.map((bug, k) => { const beaten = stop.done || (run && k < run.foe), up = !stop.done && k === (run ? run.foe : 0);
        return <div key={k} className={`cc-foe${beaten ? ' beaten' : ''}${up ? ' up' : ''}`} data-test="circuit-foe">
          <Thumb species={bug.species} level={bug.level} />
          <span><b>{bug.name}</b><small>Lv {bug.level} <TypeChip type={typeOf(bug.species)} small />{up && run?.foeHp < 100 ? ` · ${run.foeHp}% HP` : ''}</small><small>{BY_ID[bug.species]?.name}</small></span>
        </div>; })}
    </div>
    {stop.done ? <><p className="small cc-done">{leader ? `Ribbon ${c.ribbons.filter((r) => r.at).length} of ${c.ribbons.length} is yours.` : boss ? `You hold the “${stop.poster}” card.` : paid ? 'Paid. You are through.' : 'Beaten. They won\'t fight you again.'}</p>{onward}</>
      : !stop.open ? <p className="small muted">Finish the stops before this one first.</p>
      : !bugs.length ? <p className="small muted">You need a hatched bug. The mines sometimes leave an egg behind.</p>
      : <>
        <p className="small muted cc-send">{many && !run ? `${stop.bugs.length} rounds for $${stop.purse} and the ${leader ? 'ribbon' : 'card'}. Health carries over; a beaten bug sits out.` : run ? 'Send in' : `Send in · $${stop.purse} purse${boss ? ' and its card' : ''}`}</p>
        <Pick bugs={bugs} run={run} foe={foe} sel={chosen?.id} setSel={setSel} />
        <div className="barn-row cc-go">
          <button className="btn primary" disabled={busy || !chosen || !!b.live} onClick={fight} data-test="circuit-fight">{!chosen ? 'Nobody fit to fight' : b.live ? 'A fight is on' : `Send in ${chosen.name}`}</button>
          {stop.kind === 'toll' && <button className="btn" disabled={busy || !!b.live || stop.toll > b.bankroll} onClick={payToll} data-test="circuit-toll">{stop.toll > b.bankroll ? `Need $${stop.toll}` : `Pay the $${stop.toll} toll`}</button>}
          {run && <button className="btn ghost" disabled={busy || !!b.live} onClick={() => act(async () => setC(await api('POST', '/circuit/give-up')))} data-test="circuit-giveup">Walk away</button>}
        </div>
        {!ready.length && bugs.some((bug) => bug.fainted) && <p className="small muted">Everyone's out cold. <button className="linklike" onClick={() => navigate('/barn/center')}>Bug Center</button></p>}
      </>}
  </div>;
}

export default function Circuit({ b, busy, act, boutOpen }) {
  const [c, setC] = useState(null), [err, setErr] = useState(''), [sel, setSel] = useState(null), [areaId, setAreaId] = useState(null), detail = useRef(null);
  // On a phone the stop sits under the trail: tapping one brings it up.
  const pick = (id) => { setSel(id); requestAnimationFrame(() => { const el = detail.current; if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }); };
  const load = () => api('GET', '/circuit').then((r) => { setC(r); setErr(''); }).catch((e) => setErr(e.message));
  useEffect(() => { if (!boutOpen) load(); }, [b.live, boutOpen]); // a round just finished: the trail has moved on
  if (!c) return <div className="cc-wrap barn-none">{err ? <><p role="alert">{err}</p><button className="btn" onClick={load}>Try again</button></> : <p className="muted">Unrolling the map…</p>}</div>;
  // The area on show: the one you picked, otherwise the furthest one that is open.
  const reached = c.areas.filter((a) => a.open), area = reached.find((a) => a.id === areaId) || reached.find((a) => a.stops.some((s) => !s.done && s.kind !== 'center' && s.kind !== 'boss')) || reached.at(-1) || c.areas[0];
  const after = c.areas[c.areas.indexOf(area) + 1];
  const next = area.stops.find((s) => s.open && !s.done && s.kind !== 'center') || area.stops.at(-1);
  const stop = area.stops.find((s) => s.id === sel) || next;
  return <div className="cc-wrap" data-test="circuit">
    <div className="cc-top">
      <div><span className="cc-org">Tri-County Invertebrate Athletic Association</span>
        {c.areas.length > 1 && <div className="cc-areas" role="group" aria-label="Areas">{c.areas.map((a) => <button key={a.id} className={`btn small${a.id === area.id ? ' on' : ' ghost'}`} aria-pressed={a.id === area.id} disabled={!a.open} title={a.open ? undefined : a.anyOrder ? 'Win ribbon 2 first' : `Win ribbon ${a.ribbon - 1} first`} onClick={() => { setAreaId(a.id); setSel(null); }} data-test="circuit-area">{a.ribbon}. {a.short || a.name}{a.open ? (c.ribbons[a.ribbon - 1]?.at ? ' ✓' : '') : ' 🔒'}</button>)}</div>}
        <h2>{area.name}</h2><p className="small muted">{area.blurb} · Your bugs top out at level {c.cap}.{area.anyOrder ? ' Areas 3 to 6 can be won in any order; whoever you leave for later trains harder.' : ''}</p></div>
      <div className="cc-won">
        <div className="cc-rack" aria-label="Ribbons">{c.ribbons.map((r) => <Rosette key={r.n} n={r.n} on={!!r.at} />)}</div>
        <div className="cc-cards" aria-label={`Feature presentation cards: ${c.cards.filter((card) => card.at).length} of ${c.cards.length}`} data-test="circuit-cards">{c.cards.map((card) => <span key={card.id} className={`cc-card${card.at ? ' on' : ''}`} title={card.at ? `“${card.poster}”` : 'A feature presentation you have not beaten'}>{card.at ? <Thumb species={card.species} level={10} w={26} h={22} /> : '?'}</span>)}</div>
      </div>
    </div>
    <div className="cc-body">
      <ol className="cc-trail" aria-label={`${area.name} stops`}>
        {area.stops.map((s) => <li key={s.id}>
          <button className={`cc-node${s.id === stop.id ? ' on' : ''}${s.done ? ' done' : ''}${!s.open ? ' locked' : ''}${s.kind === 'leader' ? ' leader' : ''}${s.kind === 'boss' ? ' boss' : ''}`} aria-current={s.id === stop.id ? 'step' : undefined} onClick={() => pick(s.id)} data-test="circuit-node">
            <span className="cc-icon"><Icon stop={s} /></span>
            <span className="cc-label"><b>{s.who}</b><small>{s.title || (s.bugs ? `${s.bugs[0].name} · Lv ${s.bugs[0].level}` : '')}{s.purse && !s.done ? ` · $${s.purse}` : ''}</small></span>
            <span className={`cc-state${s.done ? ' done' : ''}`}>{s.done ? '✓ ' : ''}{stateOf(s, c.run, c.tolls)}</span>
          </button>
        </li>)}
      </ol>
      <div ref={detail} className="cc-detail"><Stop key={stop.id} stop={stop} c={c} b={b} busy={busy} act={act} setC={setC} pin={setSel} next={next} onArea={after?.open && area.stops.find((s) => s.kind === 'leader')?.done ? () => { setAreaId(after.id); setSel(null); } : null} afterName={after?.name} /></div>
    </div>
  </div>;
}
