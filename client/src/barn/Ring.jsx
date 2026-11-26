// The ring, rebuilt for thumbs: your corner up top, everyone you could fight in one list (open bouts first, since they
// start the moment you join), and a tap on anyone opens the tale of the tape: both bugs, the line, the money, and one
// big button. The server still checks and decides everything; ringModel.js arranges what GET /api/barn sent.
import React, { useEffect, useRef, useState } from 'react';
import { money } from '../util.js';
import { BY_ID } from '../../../server/engine/creatures.js';
import { TYPES, typeOf } from '../../../server/engine/bug-types.js';
import { drawBug } from './sprite.js';
import { TypeChip } from './BugCard.jsx';
import { navigate } from '../App.jsx';
import { fightersOf, pickMine, opponents, incoming, stakeChips, openingStake, cleanStake, stakeCap, termsFor, blocker, edgeNote, pct } from './ringModel.js';
import './ring-start.css';

const left = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`; };
const ago = (ms) => { const m = Math.floor(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
const HEESHEE_NO_BATTLE = "You can't battle a bug, your bug is lost.";
const TITLE = { bout: 'Open bout', accept: 'You were called out', call: 'Call out', post: 'Post a bout' };

/** A bug, big, for the tale of the tape. Idles unless motion is reduced; the far corner faces in. */
export function Portrait({ bug, flip, reduced, Thumb }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, kind = bug && BY_ID[bug.species]; if (!c || !kind) return undefined;
    let id = 0;
    const draw = (t) => {
      const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
      drawBug(x, kind, { w: W, h: H, t, still: reduced, flip, fill: 0.9, style: bug.style, level: bug.level });
      if (!reduced) id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [bug?.species, bug?.level, flip, reduced, JSON.stringify(bug?.style || null)]);
  if (!bug || !BY_ID[bug.species]) return <div className="rs-portrait rs-anyone" aria-hidden="true">?</div>;
  if (bug.species === 'steeze') return <div className="rs-portrait"><Thumb bug={bug} /></div>;
  return <canvas ref={ref} className="rs-portrait" aria-hidden="true" />;
}

/** One corner of the tape: name, owner, type and level, record. */
function Corner({ bug, owner, side, reduced, Thumb }) {
  const rec = bug?.record;
  return <div className={`rs-corner-card ${side}`} data-test={`matchup-${side}`}>
    <Portrait bug={bug} flip={side === 'them'} reduced={reduced} Thumb={Thumb} />
    <b className="rs-name">{bug ? bug.name : 'Anyone'}</b>
    <span className="rs-owner small">{owner}</span>
    {bug && <span className="rs-meta small">{TYPES[typeOf(bug.species)] && <TypeChip type={typeOf(bug.species)} small />} <span className="num">Lv {bug.level}</span>{rec ? <span className="num muted"> · {rec.w}–{rec.l}</span> : null}</span>}
  </div>;
}

/** The line between two bugs as a tug-of-war bar: your share on the left. */
function Line({ win, note }) {
  if (win == null) return <p className="rs-line-none small muted" data-test="matchup-odds">{note}</p>;
  const you = pct(win);
  return <div className="rs-line" data-test="matchup-odds" role="img" aria-label={`Your chance ${you}%, theirs ${100 - you}%${note ? `. ${note}` : ''}`}>
    <div className="rs-line-nums"><b className="num">{you}%</b><span className="small">{note || (you >= 45 && you <= 55 ? 'Close fight' : you > 55 ? 'You are favoured' : you >= 25 ? 'Underdog' : 'Long shot')}</span><b className="num">{100 - you}%</b></div>
    <div className="rs-line-bar" aria-hidden="true"><i style={{ '--w': `${you}%` }} /></div>
  </div>;
}

/** The ring. `go` handlers resolve true once the server took it. `onFight` plays the FIGHT moment. */
export default function Ring({ b, meId, now, busy, unsaved, reduced, Thumb, post, join, cancel, call, accept, drop, watch, onFight }) {
  const fighters = fightersOf(b), [withId, setWithId] = useState(null);
  const mine = pickMine(fighters, withId);
  const rows = opponents({ b, meId, mine }), calls = incoming(b);
  const [pane, setPane] = useState('fight'), [step, setStep] = useState(null), [stamp, setStamp] = useState('');
  const [stakeRaw, setStakeRaw] = useState(null), [other, setOther] = useState(false);
  const lost = (b.stable?.bugs || []).some((bug) => bug.heesheeHeld);
  const sheet = useRef(null), opener = useRef(null);

  // The open step, looked up fresh every poll so odds and stakes stay current. A listing that vanished closes it.
  const row = step && (step.kind === 'bout' || step.kind === 'call') ? rows.find((r) => r.key === step.key) : null;
  const challenge = step?.kind === 'accept' ? calls.find((c) => c.id === step.id) : null;
  const gone = step && !stamp && ((step.kind === 'bout' || step.kind === 'call') ? !row : step.kind === 'accept' ? !challenge : false);
  useEffect(() => { if (gone) setStep(null); }, [gone]);
  const open = (next, from) => { opener.current = from || document.activeElement; setStep(next); setStakeRaw(null); setOther(false); setStamp(''); };
  const close = () => { setStep(null); setStamp(''); requestAnimationFrame(() => opener.current?.focus?.()); };
  useEffect(() => {
    if (!step) return undefined;
    sheet.current?.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [step?.kind, step?.key, step?.id]);

  const kind = step?.kind;
  const named = kind === 'call' || kind === 'post';
  const stake = named ? (stakeRaw === null ? openingStake(b) : cleanStake(stakeRaw, b)) : 0;
  const me = kind === 'accept' ? fighters.find((bug) => bug.id === challenge?.toBug) || null : mine;
  const them = kind === 'accept' ? (b.roster.find((r) => r.ownerId === challenge?.from && r.id === challenge?.fromBug) || { name: challenge?.fromBugName, species: null }) : row?.bug || null;
  const win = kind === 'accept' ? challenge?.win : row?.win ?? null;
  const terms = step ? termsFor(kind, { stake: named ? stake ?? 0 : kind === 'accept' ? challenge?.stake : row?.stake, risk: kind === 'accept' ? challenge?.risk : row?.risk, win }) : null;
  const why = step ? (named && stake === null ? `Pick a stake in steps of ${money(b.stakeStep || 10)}.` : named && stake > stakeCap(b) ? `You can put up ${money(stakeCap(b))} at most.` : blocker({ mine: me || mine, b, unsaved, kind, row, call: challenge, stake })) : '';
  const sent = kind === 'call' ? row?.sent : null;
  const owner = kind === 'accept' ? challenge?.fromName : row?.owner;

  const fight = async () => {
    if (why || busy) return;
    if (kind === 'bout' || kind === 'accept') {
      const ok = kind === 'bout' ? await join(row.id, mine.id, row.risk) : await accept(challenge.id, challenge.risk);
      if (ok) { setStep(null); onFight?.(me, them); }
      return;
    }
    const ok = kind === 'call' ? await call(row.ownerId, row.bug.id, stake, mine.id) : await post(mine.id, stake);
    if (ok) { setStamp(kind === 'call' ? 'Called out' : 'Posted'); navigator.vibrate?.(15); setTimeout(close, reduced ? 500 : 950); }
  };
  const decline = async () => { if (await drop(challenge.id)) close(); };
  const withdraw = async () => { if (await drop(sent.id)) close(); };

  const note = !mine ? 'You need a hatched bug to fight. Watching is free.'
    : lost ? HEESHEE_NO_BATTLE
    : !mine.arena ? `Bouts unlock at level ${mine.arenaLevel}.`
    : mine.fainted ? <>{mine.name} fainted. <button className="linklike" onClick={() => navigate('/barn/center')}>Bug Center</button></>
    : unsaved ? 'Save or discard your Combat changes first.' : '';
  const fightCount = rows.filter((r) => r.can).length;

  return <div className="barn-ring rs" data-test="barn-ring">
    <section className="rs-corner" aria-label="Your corner">
      <div className="rs-corner-head"><span className="rs-kicker">Your corner</span><span className="small num muted">{money(b.bankroll)} to play with</span></div>
      {fighters.length > 0 && <div className="rs-mine" role="radiogroup" aria-label="Fight with">
        {fighters.map((bug) => <button key={bug.id} role="radio" aria-checked={bug.id === mine?.id} className={`rs-pick${bug.id === mine?.id ? ' on' : ''}${bug.fainted ? ' out' : ''}`} onClick={() => setWithId(bug.id)} data-test="ring-with">
          <Thumb bug={bug} /><span><b>{bug.name}</b><small className="num">Lv {bug.level}{bug.fainted ? ' · fainted' : ''}</small></span>
        </button>)}
      </div>}
      {note && <p className="small barn-ring-note" role="status" data-test={lost ? 'barn-heeshee-no-battle' : 'ring-note'}>{note}</p>}
    </section>
    {calls.length > 0 && <section className="rs-calls" aria-label="Challenges for you">
      {calls.map((c) => <button key={c.id} className="rs-call" onClick={(e) => open({ kind: 'accept', id: c.id }, e.currentTarget)} data-test="challenge-incoming">
        <span className="rs-call-flag">Called out</span>
        <span className="rs-call-text"><b>{c.fromName}</b>’s {c.fromBugName} wants {c.toBugName}<small className="num">{c.win != null ? `${pct(c.win)}% to win · ` : ''}{c.stake ? `risk ${money(c.risk)}` : 'for the grudge'}{c.wait ? ' · waiting' : ''}</small></span>
        <span className="rs-chev" aria-hidden="true">›</span>
      </button>)}
    </section>}
    {b.openBout && <div className="rs-posted" data-test="bout-waiting">
      <span><b>Your bout is up.</b> <span className="small num muted">{money(b.openBout.stake)} held · {left(b.openBout.expiresAt - now)} left</span></span>
      <button className="btn ghost small" onClick={() => cancel(b.openBout.id)} disabled={busy} data-test="bout-cancel">Cancel{b.openBout.stake > 0 ? ` · ${money(b.openBout.stake)} back` : ''}</button>
    </div>}
    <div className="barn-tabs ring-tabs" role="tablist" aria-label="The ring">
      <button role="tab" aria-selected={pane === 'fight'} className={pane === 'fight' ? 'on' : ''} onClick={() => setPane('fight')} data-test="ring-pane-fight">Fight · {fightCount}</button>
      <button role="tab" aria-selected={pane === 'fights'} className={pane === 'fights' ? 'on' : ''} onClick={() => setPane('fights')} data-test="ring-pane-fights">Watch</button>
    </div>
    {pane === 'fight' && <div className="rs-pane" role="tabpanel">
      {rows.length ? <ul className="rs-list" data-test="ring-list">{rows.map((r) => <li key={r.key}>
        <button className={`rs-row${r.kind === 'bout' ? ' now' : ''}`} onClick={(e) => open({ kind: r.kind, key: r.key }, e.currentTarget)} disabled={!r.can && !r.sent} data-test={r.kind === 'bout' ? 'bout-listing' : 'roster-bug'} aria-label={`${r.bug.name}, ${r.owner}'s level ${r.bug.level} ${BY_ID[r.bug.species]?.name || 'bug'}${r.win != null ? `, your chance ${pct(r.win)}%` : ''}`}>
          <Thumb bug={r.bug} />
          <span className="rs-who"><b>{r.bug.name}</b><small><span className="num">Lv {r.bug.level}</span> · {r.owner}</small>
            <small className={`rs-tag${r.kind === 'bout' ? ' hot' : ''}`}>{r.kind === 'bout' ? `Fights now · ${r.stake ? `${money(r.stake)} up` : 'free'}` : r.sent ? `Called out · ${left(r.sent.expiresAt - now)}` : !r.can ? r.why : r.busy ? 'In the ring' : 'Call out'}</small></span>
          {r.win != null ? <span className="rs-win" data-test="roster-line"><b className="num">{pct(r.win)}%</b><i aria-hidden="true"><s style={{ width: `${pct(r.win)}%` }} /></i></span> : <span className="rs-win" />}
        </button>
      </li>)}</ul> : <p className="small muted rs-empty" data-test="roster-empty">No other bugs yet. Every stall but yours is straw.</p>}
      {mine && !b.openBout && <button className="btn ghost rs-post-open" onClick={(e) => open({ kind: 'post' }, e.currentTarget)} data-test="bout-post-open">Post a bout for anyone</button>}
    </div>}
    {pane === 'fights' && (b.fights.length ? <ul className="barn-fights rs-fights" role="tabpanel">{b.fights.map((fight) => { const [first, second] = fight.sides; return <li key={fight.id} data-test="fight-row">
      <div>
        <b>{fight.winner === null ? `${first.name} and ${second.name} drew` : `${fight.sides[fight.winner].name} beat ${fight.sides[1 - fight.winner].name}`}</b>
        <p className="small muted">{first.owner} v {second.owner}{fight.pot ? ` · ${money(fight.pot)} pot` : ''} · {ago(now - fight.at)}</p>
      </div>
      <button className="btn ghost small" onClick={() => watch(fight.id)} disabled={busy} data-test="fight-watch">Watch</button>
    </li>; })}</ul> : <p className="small muted rs-empty" data-test="fights-empty">No fights yet. The bottle caps are gathering dust.</p>)}

    {step && !gone && <div className="rs-sheet-wrap" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={sheet} className={`rs-sheet${stamp ? ' stamped' : ''}`} role="dialog" aria-modal="true" aria-label={TITLE[kind]} data-test="matchup" data-kind={kind}>
        <div className="rs-top">
          <button className="btn ghost rs-back" onClick={close} data-test="ring-back" aria-label="Back to the ring">‹ Ring</button>
          <span className="rs-kicker">{TITLE[kind]}</span>
          {kind === 'bout' && row && <span className="small num muted">{left(row.expiresAt - now)} left</span>}
          {kind === 'accept' && challenge && <span className="small num muted">{left(challenge.expiresAt - now)} left</span>}
        </div>
        <div className="rs-tape">
          <Corner bug={me || mine} owner="You" side="you" reduced={reduced} Thumb={Thumb} />
          <span className="rs-vs" aria-hidden="true">vs</span>
          <Corner bug={kind === 'post' ? null : them} owner={kind === 'post' ? 'Whoever answers' : owner} side="them" reduced={reduced} Thumb={Thumb} />
        </div>
        <Line win={kind === 'post' ? null : win} note={kind === 'post' ? 'Anyone can join. The line sets what they put up.' : them?.species ? edgeNote((me || mine)?.species, them.species) : ''} />
        {kind !== 'accept' && fighters.length > 1 && !sent && <div className="rs-swap" role="radiogroup" aria-label="Fight with">
          {fighters.map((bug) => <button key={bug.id} role="radio" aria-checked={bug.id === mine?.id} className={`rs-swap-pick${bug.id === mine?.id ? ' on' : ''}`} onClick={() => setWithId(bug.id)} disabled={bug.fainted} data-test="matchup-swap" aria-label={`Fight with ${bug.name}`}><Thumb bug={bug} /><small>{bug.name}</small></button>)}
        </div>}
        {named && !sent && <div className="rs-stake" role="group" aria-label="Your stake">
          {stakeChips(b).map((v) => <button key={v} className={`rs-chip${!other && stake === v ? ' on' : ''}`} aria-pressed={!other && stake === v} onClick={() => { setOther(false); setStakeRaw(String(v)); }} data-test="stake-chip">{v ? money(v) : 'Free'}</button>)}
          {other ? <input className="rs-chip rs-other" type="number" inputMode="numeric" min="0" max={stakeCap(b)} step={b.stakeStep || 10} aria-label="Your stake" autoFocus enterKeyHint="go" value={stakeRaw ?? ''} onChange={(e) => setStakeRaw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); fight(); } }} data-test={kind === 'call' ? 'challenge-stake' : 'bout-stake'} />
            : <button className="rs-chip" onClick={() => { setOther(true); setStakeRaw(String(stake ?? '')); }} data-test="stake-other">Other</button>}
        </div>}
        <p className="rs-terms num" data-test="matchup-terms">{sent ? `Called out${sent.stake ? ` for ${money(sent.stake)}` : ''}. ${owner} has ${left(sent.expiresAt - now)} to answer.`
          : kind === 'post' ? (terms.you ? `You put up ${money(terms.you)}. Winner takes the pot.` : 'Nothing on it but pride.')
          : !terms.you && !terms.them ? 'No money on it. Just the grudge.'
          : `You put up ${money(terms.you)} · ${owner} puts up ${money(terms.them)} · winner takes ${money(terms.you + terms.them)}`}</p>
        {why && !sent && !stamp && <p className="rs-why small" role="status" data-test="matchup-why">{why}</p>}
        <div className="rs-go">
          {sent ? <button className="btn rs-big ghost" onClick={withdraw} disabled={busy} data-test="challenge-withdraw" data-autofocus>Withdraw the challenge</button>
            : <button className={`btn rs-big${kind === 'bout' || kind === 'accept' ? ' fight' : ''}`} onClick={fight} disabled={busy || !!why || !!stamp} data-autofocus
              data-test={{ bout: 'bout-join', accept: 'challenge-accept', call: 'challenge-send', post: 'bout-post' }[kind]}>
              {busy ? 'One moment…' : kind === 'bout' || kind === 'accept' ? <><span className="rs-fight-word">Fight!</span>{terms.you ? <small className="num">risk {money(terms.you)}</small> : null}</>
                : kind === 'call' ? <>Call out {row?.bug.name}{stake ? <small className="num">{money(stake)}</small> : <small>free</small>}</>
                : <>Post the bout{stake ? <small className="num">{money(stake)}</small> : <small>free</small>}</>}
            </button>}
          {kind === 'accept' && <button className="btn ghost rs-small" onClick={decline} disabled={busy || !!stamp} data-test="challenge-decline">Decline</button>}
        </div>
        {stamp && <div className="rs-stamp" role="status" data-test="matchup-stamp"><span>{stamp}</span></div>}
      </div>
    </div>}
  </div>;
}
