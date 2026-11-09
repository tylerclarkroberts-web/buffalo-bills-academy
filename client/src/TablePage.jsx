import React, { useCallback, useEffect, useRef, useState } from 'react';
import { guntradSays } from './guntrad.js';

// One Guntrad quip per big blind offer (stable across re-renders).
const QUIPS = new Map();
const offerQuip = (k) => { if (!QUIPS.has(k)) QUIPS.set(k, guntradSays('offer')); return QUIPS.get(k); };
import { api, useSession, refreshSession } from './api.js';
import { navigate, goToMines, rememberTable } from './App.jsx';
import { Card, cardText, EmptyCard } from './Card.jsx';
import { chips, formatDuration, formatLeft, signed, money } from './util.js';
import { ChipStack, VENUE } from './theme.jsx';
import { SignIn } from './Home.jsx';
import { Link } from './Shell.jsx';
import { Bust } from './avatar/Bust.jsx';
import { GagButton } from './table/Gags.jsx';
import { SmokeButton } from './table/Smoke.jsx';
import { Dealer, DealerPlate } from './table/Dealer.jsx';
import { AllInBit } from './table/AllInBit.jsx';
import { Showdown } from './table/Showdown.jsx';
import { useReplay, ReplayLayer } from './table/Replay.jsx';
import { bitEnabled, bitQueue, claimBit } from './table/fx.js';
import * as music from './table/music.js';
import { Paged, Tabs, tableScale, useShortLand, useSize, useWide } from './ui.jsx';
import { showBroke, showBrokeOnce, clearBrokeSeen } from './Broke.jsx';
import { FightScreen, useFightWatchPill } from './fight/FightScreen.jsx';
import { FightOffer } from './fight/FightOffer.jsx';
import { isPracticePhrase } from '../../server/engine/fight.js';
import { useActiveTheme, TEA_NOW } from './themes/store.js';
import { emotesFor, teaDue, THEMES } from './themes/theme-core.js';
import { Emotes, GeishaTea, FeltConsoles } from './themes/decor.jsx';


// pane = one of several tables in the multi-table view (/multi): a compact layout, no side panels, and the page-level
// bits (music, tab title, "last table") are left to the multi view. Only the focused pane takes taps; tapping an
// unfocused pane just focuses it, so a stray tap can never fold the wrong hand.
export default function TablePage({ code, pane = false, focused = true, onFocus, onStatus, offerTurn = true }) {
  const [view, setView] = useState(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState('table');
  const [side, setSide] = useState('players');
  const [sayOpen, setSayOpen] = useState(false);
  const [fightMode, setFightMode] = useState(null); // null | 'play' | 'watch' | 'practice'
  const [resultSeen, setResultSeen] = useState(() => new Set());
  const { me } = useSession();
  const wide = useWide();
  const land = useShortLand();
  const skew = useRef(0);
  const versionRef = useRef(-1);
  const wasMyTurn = useRef(false);

  const load = useCallback(async () => {
    try {
      const v = await api('GET', `/tables/${code}`);
      skew.current = v.serverNow - Date.now();
      versionRef.current = v.version;
      setView(v); setErr('');
    } catch (e) { setErr(e.message); }
  }, [code]);

  useEffect(() => { if (!pane) rememberTable(code); }, [code, pane]);
  useEffect(() => (pane ? undefined : music.attach()), [pane]); // saloon piano: starts on your first tap, only on table screens
  const innerRef = useRef(null);
  useEffect(() => { innerRef.current?.toggleAttribute('inert', pane && !focused); });
  // live updates: Server-Sent Events, with polling as a fallback
  useEffect(() => {
    load();
    let es;
    try {
      es = new EventSource(`/api/tables/${code}/events`);
      es.onmessage = (ev) => { try { const d = JSON.parse(ev.data); if (d.version !== versionRef.current || 'gagsOff' in d || 'smokeOff' in d || d.gag || d.smoke) load(); } catch { /* ignore */ } };
    } catch { /* no SSE */ }
    const poll = setInterval(load, 20000);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { es?.close(); clearInterval(poll); document.removeEventListener('visibilitychange', vis); };
  }, [code, load]);
  useEffect(() => { if (me?.id) load(); }, [me?.id, load]);

  const now = useNow(500) + skew.current;
  const myId = view?.me?.playerId;
  // v49: the cinematic showdown plays once per finished hand for each seated player (the server tracks 'seen', so
  // it also plays the next time they open the table after an async hand), and Replay is always there.
  const [sdPlay, setSdPlay] = useState(null);
  const sdNo = view?.showdown?.number ?? null;
  const tableVisible = pane ? focused : wide || land || tab === 'table';
  const rp = useReplay(code, view, tableVisible && !fightMode && !sdPlay && !sayOpen);
  useEffect(() => {
    if (!tableVisible || !rp.visible || rp.pending || fightMode || sdPlay) return;
    if (!view?.showdown || view.showdownSeen || view.me?.seat === null || view.me?.seat === undefined) return;
    const key = `bba.sd.${code}.${view.showdown.number}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
    setSdPlay(view.showdown);
    api('POST', `/tables/${code}/showdown-seen`, { number: view.showdown.number }).catch(() => {});
  }, [sdNo, view?.showdownSeen, code, tableVisible, rp.visible, rp.pending, fightMode, sdPlay]);
  const watch = useFightWatchPill(view, myId);
  const takeView = useCallback((v) => { skew.current = v.serverNow - Date.now(); versionRef.current = v.version; setView(v); }, []);
  const mySeat = view?.me?.seat;
  const myTurn = !!view?.hand && view.hand.toAct !== null && view.hand.toAct === mySeat;
  useEffect(() => { if (myTurn) setTab('table'); }, [myTurn]);
  // The big blind's fight offer: a centered prompt (FightOffer). Decline is remembered per hand.
  const offer = view?.fightOffer || null;
  const offerKey = offer ? `${code}.${offer.hand}` : '';
  const [passed, setPassed] = useState(() => new Set());
  const offerOpen = !!offer && !passed.has(offerKey) && !fightMode;
  const offerUp = offerOpen && offerTurn && !rp.pending && !sdPlay && tableVisible && rp.visible; // catch-up before prompts
  useEffect(() => { if (pane && view) onStatus?.(code, { myTurn, deadline: myTurn ? view.hand?.deadline ?? null : null, name: view.name, seated: view.me?.seat !== null && view.me?.seat !== undefined, offer: offerOpen ? offerKey : null }); }, [pane, myTurn, view?.hand?.deadline, view?.name, view?.me?.seat, code, offerOpen, offerKey]);
  // Busted out here with nothing left anywhere: the house has a suggestion.
  const bustBroke = !!view?.me?.broke;
  useEffect(() => {
    if (!view) return;
    if (bustBroke) showBrokeOnce(`t.${code}`, 'bust', { need: view.settings.buyIn });
    else clearBrokeSeen(`t.${code}`);
  }, [bustBroke, code, !!view]);

  // tab title + notification when it becomes your turn
  useEffect(() => {
    if (!view || pane) return undefined;
    let flip = false;
    const base = `${view.name} · ${VENUE.name}`;
    if (!myTurn) { document.title = base; wasMyTurn.current = false; return undefined; }
    if (!wasMyTurn.current) {
      wasMyTurn.current = true;
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Your turn at ' + view.name, { body: 'Tap to make your move.', tag: `poker-${code}` }); } catch { /* ignore */ }
      }
    }
    document.title = `● Your turn · ${base}`;
    const id = setInterval(() => { flip = !flip; document.title = flip ? `● Your turn · ${base}` : `○ ${base}`; }, 1200);
    return () => clearInterval(id);
  }, [myTurn, view?.name, view?.hand?.number, code]);

  async function post(path, body) {
    try {
      const v = await api('POST', `/tables/${code}/${path}`, body); skew.current = v.serverNow - Date.now(); versionRef.current = v.version; setView(v); setErr('');
      if (['join', 'rebuy', 'leave'].includes(path)) refreshSession();
      return true;
    } catch (e) {
      if (e.status === 402 && ['join', 'rebuy'].includes(path)) { setErr(''); showBroke('join', { need: view?.settings?.buyIn }); }
      else setErr(e.status === 402 ? { broke: e.message } : e.message);
      load(); return false;
    }
  }
  async function join(seat) {
    if (!me) { setErr('Sign in first, then pick a seat.'); return; }
    await post('join', seat !== undefined ? { seat } : {});
  }
  const inviteUrl = `${window.location.origin}/t/${code}`;
  async function copyInvite() {
    const text = `Pull up a chair at "${view?.name}" at ${VENUE.name}: ${inviteUrl} (room code ${code})`;
    try {
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) await navigator.share({ title: `${VENUE.name} card room`, text, url: inviteUrl });
      else { await navigator.clipboard.writeText(inviteUrl); setToast('Invite link copied!'); setTimeout(() => setToast(''), 2500); }
    } catch { /* cancelled */ }
  }

  const errBox = err && (
    <div className="error float" onClick={() => setErr('')} role="alert">
      {err.broke ? <>{err.broke} <a href="/mines" onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToMines(); }}>Go to the mines →</a></> : err}
    </div>
  );
  if (!view && pane) return <div className="tp tp-pane-mode"><p className="muted pane-loading">{err || 'Loading table…'}</p></div>;
  if (!view) {
    return <div className="screen center-screen">{err ? <div className="error" role="alert">{err}</div> : <p className="muted">Loading table…</p>}<Link to="/?tab=tables" className="btn small">← All tables</Link></div>;
  }
  const seated = mySeat !== null && mySeat !== undefined;
  const hand = view.hand;
  const players = view.seats.filter(Boolean);

  const head = (
    <div className="tp-head">
      <div className="tp-title">
        <p className="kicker"><Link to="/?tab=tables">← Tables</Link> / <span className="mono">{code}</span>{view.bots ? <span className="tp-botlabel"> · 🤖 Bot table · practice chips</span> : view.econ === false ? ' · practice chips' : ''}{(view.settings.skipPreflop || view.settings.autoCheck) && <span className="rule-badges" data-test="rule-badges"><span>Defaults:</span>{view.settings.skipPreflop && <span className="rule-badge" title="Future hands start at the flop; changing this default leaves the current hand unchanged" data-test="badge-skip">Flop start</span>}{view.settings.autoCheck && <span className="rule-badge" title="Future hands default to checking when free; players can override their own setting" data-test="badge-autocheck">Auto-check</span>}</span>}</p>
        <h1 className="display">{view.name}</h1>
        {!view.bots && <p className="small muted">{view.visibility === 'public' ? 'Public · listed in the lobby' : 'Private · anyone with the invite link can join'}</p>}
      </div>
      <p className="meta hide-s">Blinds {chips(view.settings.smallBlind)}/{chips(view.settings.bigBlind)} · Buy-in {money(view.settings.buyIn)} · {formatDuration(view.settings.turnSeconds)} a turn</p>
      {seated && view.status !== 'closed' && (
        <button className={`btn small say-btn ${view.seats[mySeat]?.say ? 'live' : ''}`} onClick={() => setSayOpen(!sayOpen)} aria-expanded={sayOpen} aria-label="Say something (speech bubble)" title="Say something">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          <span className="hide-s">Say</span>
        </button>
      )}
      {seated && view.status !== 'closed' && <GagButton code={code} view={view} myId={myId} onUsed={load} />}
      {seated && view.status !== 'closed' && <SmokeButton code={code} view={view} onDone={load} />}
      {view.showdown && <button type="button" className="btn small sd-replay" onClick={() => setSdPlay({ ...view.showdown, _k: Date.now() })} data-test="sd-replay" title="Replay last showdown" aria-label="Replay last showdown"><span aria-hidden="true">↺</span><span className="hide-s"> Replay last showdown</span></button>}
      <MusicButton />
      {(!view.bots || view.bots.friends) && <button className="btn small" onClick={copyInvite}>Invite</button>}
    </div>
  );
  const stage = (
    <div className="tp-stage">
      {sdPlay && <Showdown key={`${sdPlay.number}:${sdPlay._k || 0}`} sd={sdPlay} avatars={view.avatars} onDone={() => setSdPlay(null)} />}
      <TableFelt code={code} view={view} now={now} rp={rp} hold={!!sdPlay || rp.pending || !tableVisible || !rp.visible || !!fightMode} onSit={!seated && me && view.status !== 'closed' ? join : null} onSay={seated && view.status !== 'closed' ? () => setSayOpen(true) : null} />
      <FightPills view={view} myId={myId} watch={watch} now={now} seen={resultSeen} onSeen={(id) => setResultSeen(new Set([...resultSeen, id]))} onWatch={() => setFightMode('watch')} onForfeit={() => post('fight/forfeit', { id: view.fight.id })} />
      {sayOpen && seated && <SayBox current={view.seats[mySeat]?.say?.text || ''} onClose={() => setSayOpen(false)} onSave={(text) => post('say', { text })} onPractice={() => { setSayOpen(false); setFightMode('practice'); }} />}
      {errBox}
      {toast && <div className="toast">{toast}</div>}
      {offerUp && <FightOffer key={offerKey} refund={offer.refund} stake={offer.stake} quip={offerQuip(offerKey)} armMs={pane ? 700 : 450}
        clock={offerClock(view, mySeat, now)}
        onFight={() => setFightMode('play')}
        onDecline={() => { setPassed(new Set([...passed, offerKey])); post('fight/decline'); }} />}
    </div>
  );
  const bottom = <Bottom blocked={offerUp || !!sdPlay} replaying={rp.pending} view={view} me={me} seated={seated} myTurn={myTurn} now={now} code={code} inviteUrl={inviteUrl} copyInvite={copyInvite} join={join} post={post} players={players} />;
  const panels = {
    players: <Standings view={view} />,
    log: <HandLog view={view} />,
    info: <Info view={view} post={post} seated={seated} code={code} />,
  };
  const sideTabs = [['players', 'Players', players.length], ['log', 'Log'], ['info', seated ? 'You' : 'Info']];

  const fightLayer = fightMode && (fightMode !== 'watch' || view.fight) ? (
    <FightScreen key={`${fightMode}.${fightMode === 'watch' ? view.fight?.id : ''}`} mode={fightMode} code={code} view={view} offer={view.fightOffer} myId={myId} onView={takeView}
      onClose={() => { if (fightMode === 'watch' && view.fight) watch.hide(view.fight.id); setFightMode(null); load(); }} />
  ) : null;
  if (pane) {
    const left = hand?.deadline ? hand.deadline - now : 0;
    return (
      <div className={`tp tp-pane-mode ${focused ? 'focused' : 'unfocused'} ${myTurn ? 'my-turn' : ''}`} data-code={code}>
        <div className="pane-inner" ref={innerRef}>
          <div className="pane-head">
            <b className="pane-name">{view.name}</b><span className="mono pane-code">{code}</span>
            {myTurn ? <span className={`pane-turn ${left < 60000 ? 'urgent' : ''}`}>Your turn · {formatLeft(left)}</span>
              : hand ? <span className="pane-wait">Hand #{hand.number}</span> : <span className="pane-wait">{view.status === 'lobby' ? 'Lobby' : view.status === 'closed' ? 'Closed' : 'Between hands'}</span>}
            {offerOpen && !offerTurn && <span className="pane-offer" title="Guntrad's fight offer is waiting: it opens after the current one">⚔ Fight offer · next</span>}
            {seated && view.status !== 'closed' && <button className="btn small ghost" onClick={() => setSayOpen(!sayOpen)} aria-label="Say something (speech bubble)">Say</button>}
            <Link to={`/t/${code}`} className="btn small ghost" title="Open this table on its own">Open</Link>
          </div>
          {stage}
          {bottom}
        </div>
        {!focused && <button className="pane-cover" onClick={onFocus} aria-label={`Play at ${view.name}${myTurn ? ' (your turn)' : ''}`}><span>{myTurn ? 'Your turn · tap to play' : 'Tap to play here'}</span></button>}
        {fightLayer}
      </div>
    );
  }
  if (land) {
    // Phone on its side: the felt takes the left, and the controls stack on the right where a thumb can reach.
    return (
      <div className="screen tp tp-land">
        <div className="tp-land-felt">{stage}</div>
        <div className="tp-land-side">
          {head}
          <Tabs label="Table views" className="tp-tabs" value={tab} onChange={setTab} tabs={[['table', 'Play'], ...sideTabs]} />
          {tab === 'table' ? <div className="tp-land-bottom">{bottom}</div> : <div className="tp-pane">{panels[tab]}</div>}
        </div>
        {fightLayer}
      </div>
    );
  }
  if (wide) {
    return (
      <div className="screen tp tp-wide">
        <div className="tp-main">{head}{stage}{bottom}</div>
        <aside className="tp-side panel">
          <Tabs label="Table details" value={side} onChange={setSide} tabs={sideTabs} />
          <div className="panel-body">{panels[side]}</div>
        </aside>
        {fightLayer}
      </div>
    );
  }
  return (
    <div className="screen tp tp-narrow">
      {head}
      <Tabs label="Table views" className="tp-tabs" value={tab} onChange={setTab} tabs={[['table', 'Table'], ...sideTabs]} />
      {tab === 'table' ? <>{stage}{bottom}</> : <div className="tp-pane">{panels[tab]}</div>}
      {fightLayer}
    </div>
  );
}

function Bottom({ blocked, replaying, view, me, seated, myTurn, now, code, inviteUrl, copyInvite, join, post, players }) {
  const hand = view.hand;
  const toActSeat = hand?.toAct ?? null;
  const toActName = toActSeat !== null ? view.seats[toActSeat]?.name : null;
  const left = hand?.deadline ? hand.deadline - now : 0;
  const out = [];
  if (view.status === 'closed') out.push(<div key="c" className="bar banner">This table is closed. Final results are under Players.</div>);
  if (!seated && view.status !== 'closed') {
    out.push(
      <div key="j" className="bar joinbar">
        {view.bots && !view.bots.friends && !view.me.isHost ? <p>🤖 A bot practice table: the host is playing the bots. You can watch.</p>
          : players.length >= view.settings.maxPlayers ? <p>This table is full.</p> : view.bots && me ? (
          <><p>🤖 Bot practice table: a <b>{money(view.settings.buyIn)}</b> practice stack, never your bankroll.</p><button className="btn primary" onClick={() => join()}>Deal me in <span className="arrow">→</span></button></>
        ) : !me ? (
          <><p>Sign in to take a seat. Buy-in {money(view.settings.buyIn)}.</p><SignIn compact next={`/t/${code}`} /></>
        ) : (
          <><p>{view.me.afkMoved && <><b>You were moved out after {view.me.afkMoved.turns} missed turns.</b> Your chips went back to your bankroll. Rejoin any time: </>}Buy-in <b>{money(view.settings.buyIn)}</b> of your <b>{money(me.bankroll)}</b>. Tap a seat, or:{hand ? ' (you join next hand)' : ''}</p><button className="btn primary" onClick={() => join()}>Deal me in <span className="arrow">→</span></button></>
        )}
      </div>,
    );
  }
  if (view.status === 'lobby') {
    // Ready = could be dealt in (seated, not away, chips left): the same rule the server uses to start.
    const ready = players.filter((s) => !s.sittingOut && !s.leaving && s.stack > 0).length;
    const can = ready >= 2;
    out.push(view.me.isHost ? (
      <div key="l" className={`bar lobbybar host ${can ? 'go' : 'wait'}`}>
        <div className="lb-call">
          <b>{can ? 'Your table is waiting. Deal them in.' : 'Your table needs one more player.'}</b>
          <span>{can
            ? <>{ready} seated · room code <b className="mono">{code}</b></>
            : <>{ready} seated, need 2+ · share the link or room code <b className="mono">{code}</b></>}</span>
        </div>
        {can ? <>
          <button className="btn small" onClick={copyInvite} title={inviteUrl}>Invite more</button>
          <button className="btn primary lb-start" onClick={() => post('start')}>Start the game <span className="arrow">▶</span></button>
        </> : <button className="btn primary lb-start" onClick={copyInvite} title={inviteUrl}>Share the invite link</button>}
      </div>
    ) : (
      <div key="l" className="bar lobbybar">
        <div className="lb-code"><span className="kicker">Room code</span><b className="mono room-code" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</b></div>
        <span className="muted small hide-s">{players.length} of {view.settings.maxPlayers} seats taken</span>
        <button className="btn small" onClick={copyInvite} title={inviteUrl}>Copy invite link</button>
        <span className="muted small">Waiting for the host to start the game.</span>
      </div>
    ));
  }
  const show = view.me.canShow;
  const offerShow = show && !myTurn;
  if (offerShow) {
    // Won without a showdown: optionally show the table. Takes the turnbar's place, so the layout never grows.
    const left2 = [0, 1].filter((i) => !show.shown.includes(i));
    out.push(
      <div key="s" className="bar showbar" role="group" aria-label="Show your cards">
        <span className="sb-text">You took hand #{show.number} without a showdown. <span className="hide-xs">Show the table?</span></span>
        <div className="sb-btns">
          {left2.length === 2 && <button className="btn small primary" onClick={() => post('show', { which: 'both', handNumber: show.number })}>Show both</button>}
          {left2.map((i) => <button key={i} className="btn small" onClick={() => post('show', { which: i, handNumber: show.number })} aria-label={`Show ${cardText(show.cards[i])} only`}>Show {cardText(show.cards[i])}</button>)}
          <button className="btn small ghost" onClick={() => post('show', { which: 'none', handNumber: show.number })}>{show.shown.length ? 'Done' : 'Keep hidden'}</button>
        </div>
      </div>,
    );
  }
  // v43: per-hand "Check if free" box, right by the buttons (and while you wait); private, resets every hand
  const myP = seated ? view.seats[view.me.seat] : null; // between hands it sets your next hand
  const canPre = !!(myP && !view.seats[view.me.seat]?.bot && (!hand || !myP.inHand || (!myP.folded && !myP.allIn)));
  if (view.status === 'playing' && !offerShow) {
    out.push(
      <div key="t" className={`turnbar ${myTurn ? 'mine' : ''}`} aria-live="polite">
        {myTurn && replaying ? <><b>Your turn · skip replay to act</b> <span className={`clock ${left < 60000 ? 'urgent' : ''}`}>{formatLeft(left)} left</span></> : myTurn ? <><b>Your turn.</b> <span className={`clock ${left < 60000 ? 'urgent' : ''}`}>{formatLeft(left)} left</span></>
          : hand && toActName && view.seats[toActSeat]?.bot ? <>🤖 <b>{toActName}</b> is thinking…</>
          : hand && toActName ? <>Waiting for <b>{toActName}</b> <span className="clock">{formatLeft(left)}</span></>
          : view.nextHandAt ? <>Next hand starting…</>
          : view.bots ? <>The bots are waiting for you: sit back in or rebuy.</>
          : <>Waiting for at least 2 players with chips.</>}
        {canPre && <label className="nt-check pre-check" data-test="my-autocheck" title="Ticked: whenever checking is free this hand, you check automatically. Resets every hand."><input type="checkbox" checked={!!view.me.autoCheck} onChange={(e) => post('autocheck', { on: e.target.checked })} /> Check if free</label>}
      </div>,
    );
  }
  if (myTurn && view.legal && !replaying) out.push(<ActionBar key="a" view={view} onAct={(a) => post('action', { ...a, handNumber: hand.number })} />);
  // while the fight prompt is up, the bottom stays readable (the clock keeps ticking) but can't be tapped
  return <div className="tp-bottom" inert={blocked ? '' : undefined} aria-hidden={blocked || undefined}>{out}</div>;
}

/** The clock line inside the fight prompt, so the poker clock is never out of sight. */
function offerClock(view, mySeat, now) {
  const h = view.hand; if (!h) return null;
  const left = h.deadline ? h.deadline - now : 0;
  if (h.toAct === mySeat) return `Your turn · ${formatLeft(left)} left`;
  const who = h.toAct !== null ? view.seats[h.toAct]?.name : null;
  return who ? `Hand #${h.number} · ${who} to act · ${formatLeft(left)}` : `Hand #${h.number}`;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}

const GAP = 30; // degrees left open at the top, where the dealer stands
/** Seat angle in degrees (screen coords: 90 = bottom, 270 = top). "Me" sits at or next to the bottom. */
function seatDeg(pos, N) {
  if (N === 2) return pos === 0 ? 90 : 270 - GAP - 10; // v50: a little higher so the pill clears the board
  const gap = N > 6 ? GAP - 6 : GAP; // v50: crowded tables use more of the rail so neighbours don't touch
  const span = 360 - 2 * gap;
  const k = (pos + Math.floor(N / 2)) % N;
  return 270 + gap + (span * (k + 0.5)) / N;
}

function TableFelt({ code, view, now, onSit, onSay, hold, rp }) {
  // v42: a quick "✓ auto-check" pop over a seat for checks the table made in the last few seconds
  const autoPops = {};
  for (const e of view.log || []) { const m = / checks \(auto-check\)$/.exec(e.text); if (m && e.t > (view.serverNow || 0) - 3000) autoPops[e.text.slice(0, m.index)] = e.t; }
  const N = view.settings.maxPlayers;
  const hand = view.hand;
  const mySeat = view.me.seat ?? 0;
  const shown = (!hand && view.lastHand?.shown) || {};
  const winners = new Set((!hand && view.lastHand?.winners?.map((w) => w.seat)) || []);
  const button = hand ? hand.buttonSeat : view.buttonSeat;
  const box = useRef(null);
  const { w, h } = useSize(box);
  const tall = w && h ? w / h < 1.25 : false;
  // v50: crowded tables (7+ seats) get smaller busts and tighter pills so neighbouring seats never touch
  const crowd = N > 6;
  const k = tableScale(w, h); // v51: big screens grow the 1080p caps with the felt
  const bust = Math.round(Math.max(24, Math.min(62 * k, w / (tall ? (crowd ? 12 : 9) : (crowd ? 18 : 15)), h / (crowd ? (tall ? 10.5 : 9.5) : 7.2))));
  const cw = Math.round(Math.max(24, Math.min(54 * k, w / (tall ? 12.5 : 15), h / 6.4))); // v50: a bit smaller on phones so side seats clear the board
  const geo = tall ? (N > 6 ? { cx: 50, cy: 58, rx: 42, ry: 38, frx: 38, fry: 31 } : { cx: 50, cy: 57, rx: 41, ry: 32, frx: 40, fry: 30 }) : { cx: 50, cy: 57, rx: 43, ry: 31, frx: 39, fry: 29 };
  // the all-in-loser bit: once per losing all-in, for everyone at the table, unless switched off in Profile
  const [bit, setBit] = useState(null);
  const nowRef = useRef(now); nowRef.current = now;
  const lhKey = view.lastHand ? `${view.lastHand.number}:${view.lastHand.endedAt}` : '';
  useEffect(() => {
    if (bit || hold || !lhKey || !bitEnabled()) return;
    // several busted on one hand: one combined send-off (starring the first), so it stays ~5 seconds
    const fresh = bitQueue(view, nowRef.current).filter((x) => claimBit(code, x.number, x.seat));
    if (fresh.length) setBit({ ...fresh[0], others: fresh.slice(1).map((x) => x.name) });
  }, [lhKey, bit, code, hold]);
  const xy = (seat) => {
    const ang = (seatDeg((seat - mySeat + N) % N, N) * Math.PI) / 180;
    return { x: geo.cx + geo.rx * Math.cos(ang), y: geo.cy + geo.ry * Math.sin(ang) };
  };
  // themes (multi-table view only): anime emotes on the busts, and the geisha's tea every 5 hands
  const theme = useActiveTheme();
  const emotes = theme === 'anime' ? emotesFor(view) : {};
  const [tea, setTea] = useState(null);
  const handNo = hand?.number ?? null;
  useEffect(() => {
    if (theme !== 'anime' || tea || hold) return;
    const force = TEA_NOW;
    const n = force ? `now.${handNo}` : teaDue(handNo) ? handNo : null;
    if (n === null) return;
    const key = `bba.tea.${code}.${n}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* private mode */ }
    setTea(n);
  }, [theme, handNo, code, hold]);
  const lastLine = !hand && view.lastHand ? view.lastHand.winners.map((x) => `${x.name} won ${chips(x.amount)}${x.hand ? ` with ${x.hand}` : ''}`).join(' · ') : '';
  return (
    <div className={`felt-box ${tall ? 'tall' : ''} ${crowd ? 'crowd' : ''}`} ref={box} style={{ '--bust': `${bust}px`, '--cw': `${cw}px`, '--tscale': k.toFixed(3) }}>
      {w > 0 && <>
        {theme === 'arcade' && <FeltConsoles size={Math.max(30, Math.round(bust * 0.95))} />}
        <div className="dealer-spot" style={{ height: `${tall ? 30 : 34}%` }}><Dealer /></div>
        <div className="felt" style={{ left: `${geo.cx - geo.frx}%`, right: `${100 - geo.cx - geo.frx}%`, top: `${geo.cy - geo.fry}%`, bottom: `${100 - geo.cy - geo.fry}%` }}>
          <div className="felt-logo script" aria-hidden="true">{theme === 'anime' ? 'バッファロー・ビル' : theme === 'arcade' ? 'Free Play' : "Buffalo Bill's"}</div>
        </div>
        <DealerPlate style={{ top: `${geo.cy - geo.fry}%` }} />
        <div className="center-area" style={{ top: `${geo.cy + (tall ? 2 : 0)}%` }}>
          <div className="board">
            {[0, 1, 2, 3, 4].map((i) => {
              const board = hand ? hand.board : view.lastHand?.board || [];
              return board[i] ? <Card key={i} card={board[i]} /> : <EmptyCard key={i} />;
            })}
          </div>
          <div className="pot">{hand ? <><ChipStack amount={hand.pot} max={6} /> Pot <b>{chips(hand.pot)}</b></> : view.status === 'lobby' ? 'Waiting to start' : view.lastHand ? <span className="last-line">Hand #{view.lastHand.number}: {lastLine}</span> : ''}</div>
        </div>
        {Array.from({ length: N }, (_, seat) => {
          const pos = (seat - mySeat + N) % N;
          const ang = (seatDeg(pos, N) * Math.PI) / 180;
          const x = geo.cx + geo.rx * Math.cos(ang);
          const y = geo.cy + geo.ry * Math.sin(ang);
          const s = view.seats[seat];
          const style = { left: `${x}%`, top: `${y}%` };
          if (!s) {
            return (
              <div key={seat} className="seat empty" style={style} {...(onSit ? { role: 'button', tabIndex: 0, onClick: () => onSit(seat), onKeyDown: (e) => e.key === 'Enter' && onSit(seat), 'aria-label': `Sit in seat ${seat + 1}` } : {})}>
                <span className="empty-chair" />{onSit ? 'Sit here' : 'Open'}
              </div>
            );
          }
          const isMe = seat === view.me.seat;
          const toAct = hand?.toAct === seat;
          const reveal = shown[seat]?.cards;
          const cards = isMe && s.cards ? s.cards : reveal || null;
          const betX = geo.cx + geo.rx * 0.6 * Math.cos(ang), betY = geo.cy + geo.ry * 0.55 * Math.sin(ang);
          const state = winners.has(seat) ? 'win' : s.folded ? 'folded' : toAct ? 'toact' : '';
          return (
            <React.Fragment key={seat}>
              <div data-pid={s.playerId} className={`seat ${bit && !hold && bit.seat === seat && bit.playerId === s.playerId ? 'in-bit' : ''} ${isMe ? 'me' : ''} ${toAct ? 'toact' : ''} ${s.folded ? 'folded' : ''} ${winners.has(seat) ? 'winner' : ''} ${s.say?.text ? 'has-say' : ''}`} style={style}>
                {s.say?.text && <SayBubble text={s.say.text} name={s.name} below={y < 34} align={x < 24 ? 'l' : x > 76 ? 'r' : 'c'} />}
                <div className="seat-top" {...(isMe && onSay ? { role: 'button', tabIndex: 0, onClick: onSay, onKeyDown: (e) => e.key === 'Enter' && onSay(), 'aria-label': 'Your seat: say something', title: 'Say something' } : {})}>
                  <Bust id={s.playerId} avatar={view.avatars?.[s.playerId]} size={bust} state={state} title={s.name} />
                  <Emotes kinds={emotes[seat]} />
                  <div className="seat-cards">
                    {cards ? cards.map((c) => <Card key={c} card={c} size="sm" />)
                      : s.hasCards ? <><Card faceDown size="sm" /><Card faceDown size="sm" /></> : null}
                  </div>
                  {button === seat && <div className="dealer-btn" title="Dealer button">D</div>}
                </div>
                <div className="seat-plate">
                  <div className="seat-name">{s.name}{isMe && !crowd ? ' · you' : ''}</div>
                  <div className="seat-stack">{s.bot && <span className="bot-tag" title="A bot (always plays strong)">BOT</span>}{chips(s.stack)}</div>
                </div>
                {autoPops[s.name] && <span key={autoPops[s.name]} className="auto-pop" data-test="auto-pop">✓ auto-check</span>}
                <div className="seat-tags">
                  {s.allIn && <span className="tag hot">All-in</span>}
                  {s.folded && <span className="tag fold">Folded</span>}
                  {s.sittingOut && <span className="tag">Away</span>}
                  {s.waiting && <span className="tag">Next hand</span>}
                  {s.leaving && <span className="tag">Leaving</span>}
                  {s.busted && <span className="tag">Out of chips</span>}
                  {toAct && hand?.deadline && <span className="tag gold">{formatLeft(hand.deadline - now)}</span>}
                  {reveal && shown[seat]?.hand && <span className="tag">{shown[seat].hand}</span>}
                </div>
              </div>
              {hand && s.bet > 0 && (
                <div className="bet" style={{ left: `${betX}%`, top: `${betY}%` }}>
                  <ChipStack amount={s.bet} max={4} />
                  {hand.sbSeat === seat && hand.street === 'preflop' && s.bet <= view.settings.smallBlind ? 'SB ' : ''}
                  {hand.bbSeat === seat && hand.street === 'preflop' && s.bet === view.settings.bigBlind ? 'BB ' : ''}
                  {chips(s.bet)}
                </div>
              )}
            </React.Fragment>
          );
        })}
        <ReplayLayer rp={rp} />
        {tea !== null && theme === 'anime' && !hold && (
          <GeishaTea key={String(tea)} stops={view.seats.map((s, i) => (s ? xy(i) : null)).filter(Boolean)} center={{ x: geo.cx, y: geo.cy }} onDone={() => setTea(null)} />
        )}
        {bit && !hold && (() => {
          const seated = view.seats[bit.seat]?.playerId === bit.playerId;
          const loser = { ...bit, ...(seated ? xy(bit.seat) : { x: geo.cx, y: 100 }) };
          const punchers = view.seats.map((s, i) => (s && s.playerId !== bit.playerId ? { playerId: s.playerId, name: s.name, ...xy(i) } : null)).filter(Boolean);
          const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          return <AllInBit key={`${bit.number}:${bit.seat}`} loser={loser} punchers={punchers} stage={{ x: geo.cx, y: geo.cy + geo.fry * 0.72 }} w={w} h={h} size={bust} avatars={view.avatars} reduced={reduced} onDone={() => setBit(null)} />;
        })()}
      </>}
    </div>
  );
}

/** A player's speech bubble over their seat. Two lines; tap to read all of it (max 80 characters). React escapes the text. */
function SayBubble({ text, name, below, align }) {
  const [open, setOpen] = useState(false);
  return (
    // a note, not a control: the full text is in its label; tapping it just un-truncates it on screen
    <div role="note" className={`say-bubble ${below ? 'below' : ''} al-${align} ${open ? 'open' : ''}`} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} aria-label={`${name} says: ${text}`} title={text}>
      <span className="sb-txt" aria-hidden="true">{text}</span>
    </div>
  );
}

const SAY_MAX = 80;
/** Tiny composer for your one bubble: it stays up until your next turn starts. Edit or clear any time. */
// typing the secret phrase (isPracticePhrase) opens a no-money practice fight instead of posting a bubble
function SayBox({ current, onClose, onSave, onPractice }) {
  const [text, setText] = useState(current);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => { const esc = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  const save = async (v) => { setBusy(true); const ok = await onSave(v); setBusy(false); if (ok) onClose(); };
  const left = SAY_MAX - Array.from(text).length;
  return (
    <form className="say-box" role="dialog" aria-label="Say something" onSubmit={(e) => { e.preventDefault(); if (isPracticePhrase(text)) { setText(current); onPractice(); return; } save(text); }}>
      <div className="say-row">
        <input ref={ref} value={text} maxLength={SAY_MAX} onChange={(e) => setText(e.target.value)} placeholder="Say something to the table…" aria-label="Your speech bubble" enterKeyHint="send" />
        <button className="btn small primary" disabled={busy || !text.trim() || left < 0}>Say</button>
        <button type="button" className="btn small ghost say-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="say-meta small muted">
        <span>Stays up until your next turn.</span>
        <span className={left < 10 ? 'warn' : ''}>{left}</span>
        {current && <button type="button" className="linkish" disabled={busy} onClick={() => save('')}>Clear bubble</button>}
      </div>
    </form>
  );
}

function ActionBar({ view, onAct }) {
  const L = view.legal;
  const hand = view.hand;
  const [amount, setAmount] = useState(L.minRaiseTo || 0);
  const [raising, setRaising] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAmount(L.minRaiseTo || 0); setRaising(false); }, [hand.number, hand.street, L.minRaiseTo]);
  const go = async (a) => { setBusy(true); await onAct(a); setBusy(false); };
  const clamp = (v) => Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.round(v)));
  const potAfterCall = hand.pot + L.toCall;
  const presets = L.canRaise ? [
    ['Min', L.minRaiseTo],
    ['½ Pot', clamp(L.currentBet + potAfterCall / 2)],
    ['Pot', clamp(L.currentBet + potAfterCall)],
    ['All-in', L.maxRaiseTo],
  ] : [];
  const verb = L.isBet ? 'Bet' : 'Raise to';
  const allInOnly = L.canRaise && L.minRaiseTo === L.maxRaiseTo;
  const raiseBtn = (
    <button className="btn raise-btn" disabled={busy} onClick={() => go(amount >= L.maxRaiseTo || allInOnly ? { type: 'allin' } : { type: 'raise', amount: clamp(amount) })}>
      {amount >= L.maxRaiseTo || allInOnly ? `All-in ${chips(L.maxRaiseTo)}` : `${verb} ${chips(clamp(amount))}`}
    </button>
  );
  return (
    <div className="actionbar">
      <div className="mycards">{view.seats[view.me.seat].cards?.map((c) => <Card key={c} card={c} size="lg" />)}</div>
      {!raising ? (
        <div className="actions">
          <button className="btn fold" disabled={busy} onClick={() => (L.canCheck && !window.confirm('You can check for free. Fold anyway?') ? null : go({ type: 'fold' }))}>Fold</button>
          {L.canCheck
            ? <button className="btn check" disabled={busy} onClick={() => go({ type: 'check' })}>Check</button>
            : <button className="btn call" disabled={busy} onClick={() => go({ type: 'call' })}>Call {chips(L.toCall)}{L.toCall >= L.stack ? ' (all-in)' : ''}</button>}
          {L.canRaise && (allInOnly ? raiseBtn : <button className="btn raise-btn" disabled={busy} onClick={() => setRaising(true)}>{L.isBet ? 'Bet…' : 'Raise…'}</button>)}
        </div>
      ) : (
        <div className="raise">
          <div className="raise-row">
            {presets.map(([label, v]) => <button key={label} className={`btn small ${amount === v ? 'on' : ''}`} onClick={() => setAmount(v)}>{label}</button>)}
            <input type="number" className="amount" min={L.minRaiseTo} max={L.maxRaiseTo} value={amount} onChange={(e) => setAmount(+e.target.value)} onBlur={() => setAmount(clamp(amount || 0))} aria-label="Raise amount" />
          </div>
          <div className="raise-row">
            <button className="btn small" onClick={() => setRaising(false)} aria-label="Back">←</button>
            <input type="range" min={L.minRaiseTo} max={L.maxRaiseTo} step={1} value={amount} onChange={(e) => setAmount(+e.target.value)} aria-label="Raise slider" />
            {raiseBtn}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ view, post, seated, code }) {
  const s = seated ? view.seats[view.me.seat] : null;
  const [saving, setSaving] = useState(false);
  async function changeSetting(key, on) {
    setSaving(true);
    try { await post('settings', { [key]: on }); }
    finally { setSaving(false); }
  }
  return (
    <div className="info-pane">
      {s && view.status !== 'closed' && (
        <div className="block">
          <h3>You</h3>
          <p>Stack <b className="num">{chips(s.stack)}</b> · Net <b className={`num ${s.net >= 0 ? 'pos' : 'neg'}`}>{signed(s.net)}</b></p>
          <div className="row wrap">
            {view.me.canRebuy && <button className="btn small primary" onClick={() => post('rebuy')}>Rebuy {money(view.settings.buyIn)}</button>}
            {s.sittingOut
              ? <button className="btn small" onClick={() => post('sitout', { sitOut: false })}>I'm back</button>
              : <button className="btn small" onClick={() => post('sitout', { sitOut: true })}>Sit out</button>}
            {!s.leaving && <button className="btn small" onClick={() => window.confirm('Leave the table? Your chips go back to your bankroll (after this hand if you are in it).') && post('leave')}>Leave table</button>}
          </div>
          {s.sittingOut && <p className="muted small">You're sitting out: you won't be dealt in. If it's your turn in a hand, you check or fold right away. Each hand dealt without you counts as a missed turn: after 3 in a row your seat opens up and your chips go back to your bankroll (rejoin any time).</p>}
        </div>
      )}
      <div className="block">
        <h3>Table</h3>
        <p className="small">Room <b className="mono">{code}</b> · Blinds {chips(view.settings.smallBlind)}/{chips(view.settings.bigBlind)} · Buy-in {money(view.settings.buyIn)} · {formatDuration(view.settings.turnSeconds)} a turn</p>
        <p className="small muted info-rules">Rebuys {view.settings.maxRebuys < 0 ? 'unlimited' : view.settings.maxRebuys === 0 ? 'off' : `${view.settings.maxRebuys} each`}. If your time runs out you check when you can, otherwise fold. Miss 3 turns in a row and your seat opens up (rejoin any time).</p>
        {view.me.isHost && view.status !== 'closed' && <fieldset className="host-settings" disabled={saving}>
          <legend>Host settings</legend>
          <label className="nt-check"><input type="checkbox" checked={!!view.settings.autoCheck} onChange={(e) => changeSetting('autoCheck', e.target.checked)} /> Automatically check when free</label>
          <label className="nt-check"><input type="checkbox" checked={!!view.settings.skipPreflop} onChange={(e) => changeSetting('skipPreflop', e.target.checked)} /> Skip first betting round</label>
          <p className="small muted">Applies next hand; players can override their own Check if free.</p>
          <p className="small muted" role="status">{saving ? 'Saving…' : 'Changes save automatically.'}</p>
        </fieldset>}
        <div className="row wrap">
          {'Notification' in window && Notification.permission === 'default' && <button className="btn small" onClick={() => Notification.requestPermission()}>Notify me on my turn</button>}
          {view.me.isHost && view.status !== 'closed' && <button className="btn small" onClick={() => post('gags', { off: !view.gagsOff })} data-test="host-gags">{view.gagsOff ? 'Allow gags (host)' : 'Turn gags off (host)'}</button>}
          {view.me.isHost && view.status !== 'closed' && <button className="btn small" onClick={() => post('tobacco', { off: !view.smokeOff })} data-test="host-smoke">{view.smokeOff ? 'Allow Smoke Shop (host)' : 'Turn Smoke Shop off (host)'}</button>}
          {view.me.isHost && view.status !== 'closed' && <button className="btn small" onClick={() => window.confirm('Close this table for everyone? Any hand in progress is cancelled and bets are returned.') && post('close')}>Close table (host)</button>}
        </div>
      </div>
      {view.lastHand && <LastHand view={view} />}
    </div>
  );
}

function Standings({ view }) {
  return (
    <Paged items={view.standings} rowH={44} className="standings"
      header={<div className="st-row st-head"><span>Name</span><span>Chips</span><span>In</span><span>Net</span></div>}
      render={(p) => (
        <div className={`st-row ${p.seated ? '' : 'muted'}`}>
          <span className="st-name"><Bust id={p.playerId} avatar={view.avatars?.[p.playerId]} size={26} still />{p.name}{p.playerId === view.hostId ? <i className="muted"> · host</i> : ''}{!p.seated ? <i className="muted"> (left)</i> : ''}</span>
          <span className="num">{chips(p.seated ? p.stack : p.cashOut)}</span>
          <span className="num">{chips(p.buyIn)}</span>
          <span className={`num ${p.net >= 0 ? 'pos' : 'neg'}`}>{signed(p.net)}</span>
        </div>
      )} />
  );
}

function HandLog({ view }) {
  const items = view.log.filter((e) => !(e.ev?.k === 'win' && e.ev.showdown)).reverse(); // v43: the silent pot-push event is for the replay only
  return (
    <Paged items={items} rowH={40} className="log" resetKey={view.log.length}
      empty={<p className="muted small">Nothing has happened yet.</p>}
      render={(l) => (
        <div className={`log-row ${l.text.startsWith('---') ? 'sep' : ''}`}>
          <span className="time">{new Date(l.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          <span className="log-text">{l.text}</span>
        </div>
      )} />
  );
}

function LastHand({ view }) {
  const lh = view.lastHand;
  return (
    <div className="lasthand">
      <h3>Hand {lh.number} result</h3>
      <ul>
        {lh.winners.map((w) => <li key={w.seat}><b>{w.name}</b> won {chips(w.amount)}{w.hand ? ` with ${w.hand}` : ''}</li>)}
      </ul>
      {Object.keys(lh.shown || {}).length > 0 && (
        <div className="shown">
          {Object.entries(lh.shown).map(([seat, s]) => (
            <div key={seat} className="shown-row">
              <span className="shown-name">{s.name || view.seats[seat]?.name || `Seat ${+seat + 1}`}</span>
              {s.cards.map((c) => <Card key={c} card={c} size="sm" />)}
              <span className="muted small">{s.hand}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function useMusic() {
  const [st, setSt] = useState(music.state);
  useEffect(() => music.subscribe(setSt), []);
  return st;
}

/** Speaker in the table header: opens a small panel with music on/off, volume and the tune that's playing. */
export function MusicButton() {
  const st = useMusic();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  const label = st.on ? `Music on${st.title ? `: ${st.title}` : ''}` : 'Music off';
  return (
    <div className="music" ref={ref}>
      <button className={`btn small music-btn ${st.on ? 'live' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" aria-label={`${label}. Music settings`} title={label} data-on={st.on}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          {st.on ? <><path d="M16 9.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M18.5 7a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></>
            : <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
        </svg>
      </button>
      {open && (
        <div className="music-pop" role="dialog" aria-label={st.set === 'jp' ? '8-bit Japan' : 'Saloon piano'}>
          <div className="row mp-top">
            <b className="small">{st.set === 'jp' ? '8-bit Japan' : 'Saloon piano'}</b>
            <button className={`btn small ${st.on ? 'on' : ''}`} onClick={() => music.setOn(!st.on)} aria-pressed={st.on}>{st.on ? 'On' : 'Off'}</button>
          </div>
          <input type="range" min="0" max="100" step="5" value={Math.round(st.vol * 100)} aria-label="Music volume"
            onChange={(e) => { music.setVolume(e.target.value / 100); if (!st.on && +e.target.value > 0) music.setOn(true); }} />
          <div className="row mp-now">
            <span className="small muted ell">{st.on ? (st.themeMuted ? 'Muted in this theme' : st.playing && st.title ? `♪ ${st.title} (${st.year})` : 'Starting…') : 'Off on this device'}</span>
            {st.on && st.playing && <button className="btn small ghost" onClick={() => music.next()}>Next ›</button>}
          </div>
          {st.theme !== 'saloon' && (
            <label className="row mp-mute small"><input type="checkbox" checked={st.themeMuted} onChange={(e) => music.setThemeMute(st.theme, e.target.checked)} /> Mute in the {THEMES[st.theme]?.name || st.theme} theme</label>
          )}
        </div>
      )}
    </div>
  );
}

/** Over the felt: "X is fighting Guntrad: Watch", your own unfinished fight, and the latest fight's result. */
function FightPills({ view, myId, watch, now, seen, onSeen, onWatch, onForfeit }) {
  const f = view.fight;
  if (!f) return null;
  if (watch.live) {
    return (
      <div className="fight-pill" role="status">
        <span>⚔ <b>{f.name}</b> is fighting Guntrad!</span>
        <button className="btn small primary" onClick={onWatch}>Watch</button>
        <button className="x" onClick={() => watch.hide(f.id)} aria-label="Dismiss">✕</button>
      </div>
    );
  }
  if (f.status === 'running' && f.playerId === myId) {
    return (
      <div className="fight-pill" role="status">
        <span>Your fight with Guntrad is still on the clock.</span>
        <button className="btn small" onClick={onForfeit}>Forfeit</button>
      </div>
    );
  }
  if ((f.status === 'won' || f.status === 'lost') && f.endedAt && now - f.endedAt < 45000 && !seen.has(f.id)) {
    const who = f.playerId === myId ? 'You' : f.name;
    return (
      <div className="fight-pill done" role="status">
        <span>{f.status === 'won' ? `🏆 ${who} beat Guntrad! Big blind covered.` : `${who === 'You' ? 'You' : who} lost to Guntrad: ${money(f.stake || 0)} ${f.into === 'house' ? 'to the house' : 'dead money in the pot'}.`}</span>
        <button className="x" onClick={() => onSeen(f.id)} aria-label="Dismiss">✕</button>
      </div>
    );
  }
  return null;
}
