// Async Scum: lobby (/scum) and table (/scum/CODE). One screen each, never scrolls. Free to play; title pay (King +$100 … Scum −$10) moves the real bankroll when the payouts flag is on.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, useSession, refreshSession } from '../api.js';
import { navigate, goToMines } from '../App.jsx';
import { SignIn } from '../Home.jsx';
import { useMedia } from '../ui.jsx';
import { Bust } from '../avatar/Bust.jsx';
import { SeatBuddy } from '../table/TableBug.jsx';
import { usePlayerCard } from '../table/PlayerCard.jsx';
import { Card } from '../Card.jsx';
import { sfx, isMuted, setMuted } from '../bj/sfx.js';
import { SkipBlast, CrownBlast } from './Trollface.jsx';
import { TableBugSprite } from '../table/TableBug.jsx';
import { useTurnAdvance, refreshTurns } from '../turns/useTurns.js';
import { NextTablePill } from '../turns/TurnsPill.jsx';
import '../bj/bj.css';
import './scum.css';
import { canDealNow, canStartDeal } from './setup.js';
import { publicTitle } from '../../../server/pageMeta.js';
import { RoyalPicker, RoyalPlay, RoyalRewatch, seatRoyalClass } from './Royal.jsx';

const RK = '23456789TJQKA';
const rk = (c) => RK.indexOf(c[0]) + 2;
/** Auto-organize: your hand always reads low to high (2 … K, aces last), suits in a fixed order (♣ ♦ ♥ ♠). */
export const sortCards = (cards) => cards.slice().sort((a, b) => rk(a) - rk(b) || 'cdhs'.indexOf(a[1]) - 'cdhs'.indexOf(b[1]));
export { canDealNow, canStartDeal } from './setup.js';
const RN = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rn = (r) => (r === 10 ? '10' : RN[r] || String(r));
const SET = ['', 'single', 'pair', 'three', 'four'];
const TITLE = { king: 'King', queen: 'Queen', commoner: 'Commoner', babyScum: 'Baby Scum', scum: 'Scum' };
const CROWN = { king: '♚', queen: '♛', commoner: '', babyScum: '🪣', scum: '🪣' };
const TURN = { 30: '30 s', 120: '2 min', 600: '10 min', 3600: '1 hour', 86400: '1 day' };
const left = (ms) => { if (ms <= 0) return '0s'; const s = Math.ceil(ms / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.ceil(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const setName = (p) => (p ? `${p.count === 1 ? 'a' : SET[p.count] === 'pair' ? 'a pair of' : SET[p.count]} ${rn(p.rank)}${p.count > 1 ? 's' : ''}` : '');
/** Mirrors the server's rule check, for the button state only (the server decides). */
export function playProblem(pile, sel) {
  if (!sel.length) return 'Pick cards';
  if (sel.length > 4 || !sel.every((c) => rk(c) === rk(sel[0]))) return 'Same rank only';
  if (!pile) return null;
  if (pile.rank === 14) return 'Nothing beats an ace';
  if (rk(sel[0]) === 14) return sel.length === pile.count ? null : `Needs ${pile.count} ace${pile.count > 1 ? 's' : ''}`;
  if (sel.length !== pile.count) return `Needs ${pile.count === 1 ? 'a single' : `a ${SET[pile.count]}`}`;
  if (rk(sel[0]) < pile.rank) return `${rn(pile.rank)} or higher`;
  return null;
}
const RULES = [
  'No jokers. 2 is low, K is high, A is trump.',
  'Lead a single, pair, three or four of a kind. Follow with the same number, equal or higher, or pass.',
  'Match the rank just played and the next player who can still play is SKIPPED. A skip only costs that one turn: they stay in and can still play on this pile. Skips jump over anyone who already passed.',
  'If you pass, you are out of this pile until it clears — even if play goes all the way around or someone else plays after you. The pile clears when everyone still holding cards except the last player to play has passed. Skipped players do not count as passed. That last player then leads fresh.',
  'Aces clear the pile: 1 ace on singles, 2 on pairs, 3 on threes, 4 on fours. Nothing goes on an ace; you lead again.',
  'Everyone else passed on your set? Keep playing on it, or pass. If someone was skipped (not passed), they still get a chance on the live pile.',
  'One 52-card deck, always. No jokers, 3–7 players. The King leads every new round.',
  'First out is King, then Queen. Second to last is Baby Scum, last is Scum. (3 players: King, Commoner, Scum.)',
  'Next round Scum gives the King their 2 best cards, Baby Scum gives the Queen their best. Both may beg. The King gives back any 2, the Queen any 1.',
  'The King leads; Scum goes last. Round 1: whoever has the 2♣ leads.',
  'Each round the King may issue one Royal command: the Scum’s avatar acts it out at the table. Purely cosmetic. Anyone who missed it gets a replay the next time they open the table, once, and can skip or rewatch it.',
  'Miss your turn and your bug plays for you. It always plays your highest card (or passes if nothing beats the pile).',
];
/** Title pay is on your real bankroll; listed only while the payouts flag is on. */
const PAY_RULES = [
  'Free to play. Each round’s titles pay: King +$100, Queen +$50, Commoner $0, Baby Scum −$5, Scum −$10.',
  'From Scum straight to King? You also take every King payout the old King collected at this table.',
  'Under $10 you sit out (seat saved) until a shift in the Acid Mines covers the dues.',
];

export default function ScumPage({ code }) {
  const { me } = useSession();
  useEffect(() => { if (!code) document.title = publicTitle('SCUM'); }, [code]);
  if (!me) return <div className="screen bj"><div className="panel bj-empty"><h2 className="western">SCUM</h2><SignIn compact next={code ? `/scum/${code}` : '/scum'} /></div></div>;
  return code ? <ScumTable code={code} me={me} /> : <ScumLobby me={me} />;
}

function Seg({ label, value, options, onChange, test }) {
  return (
    <div className="bj-field" data-test={test}><span>{label}</span>
      <div className="bj-seg">{options.map(([v, l]) => <button key={String(v)} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>
    </div>
  );
}
function RulesPop({ onClose, pay }) {
  return <div className="bj-pop" data-test="scum-rules-pop" onClick={onClose}><div className="panel"><h3 className="western">House rules</h3><ul>{RULES.map((x) => <li key={x}>{x}</li>)}{pay ? PAY_RULES.map((x) => <li key={x}>{x}</li>) : <li>Play for pride. No chips change hands.</li>}</ul><button className="btn small">Close</button></div></div>;
}

// ---------------------------------------------------------------- lobby + setup
function ScumLobby({ me }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('new');
  const [rules, setRules] = useState(false);
  const [name, setName] = useState(`${me.name}'s scum table`);
  const [st, setSt] = useState({ bots: 2, turnSec: 86400, maxSeats: 6 });
  const narrow = useMedia('(max-width: 899px) and (not ((orientation: landscape) and (max-height: 520px)))');
  useEffect(() => { api('GET', '/scum').then((r) => { setInfo(r); if (r.tables.length) setTab('tables'); }).catch((e) => setErr(e.message)); }, []);
  if (!info) return <div className="screen bj"><div className="panel bj-empty">{err || 'Shuffling…'}</div></div>;
  const S = (k, v) => setSt({ ...st, [k]: v, ...(k === 'maxSeats' ? { bots: Math.min(st.bots, v - 1) } : {}) });
  const create = async ({ deal = false } = {}) => {
    setErr('');
    try {
      const t = await api('POST', '/scum/tables', { name, settings: st });
      if (deal) { try { await api('POST', `/scum/tables/${t.code}/start`); } catch { /* host deals from the table */ } }
      await refreshSession(); navigate(`/scum/${t.code}`);
    } catch (e) { setErr(e.message); }
  };
  const tables = (
    <div className="bj-list sc-list" data-test="scum-tables">
      {info.tables.length ? info.tables.map((t) => (
        <button key={t.code} className="bj-row" onClick={() => navigate(`/scum/${t.code}`)}>
          <b>{t.name}</b><span className="mono">{t.code} · {t.players}/{t.maxSeats}{t.round ? ` · round ${t.round}` : ''}{t.title ? ` · ${TITLE[t.title]}` : ''}</span>
          <span className={`badge ${t.myTurn ? 'hot' : ''}`}>{t.turnLabel}</span>
        </button>)) : <p className="small dim">No scum tables yet.</p>}
    </div>
  );
  const canDeal = canDealNow(st.bots);
  const form = (
    <div className="bj-setup sc-setup" data-test="scum-setup">
      <div className="bj-grid2">
        <label className="bj-field"><span>Table name</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-test="scum-name" /></label>
        <Seg test="scum-bots" label="Bots" value={st.bots} onChange={(v) => S('bots', v)} options={[0, 1, 2, 3, 4].filter((x) => x < st.maxSeats).map((x) => [x, x ? String(x) : 'None'])} />
        <Seg label="Turn clock" value={st.turnSec} onChange={(v) => S('turnSec', v)} options={info.limits.turnSecs.map((x) => [x, TURN[x]])} />
        <Seg label="Seats" value={st.maxSeats} onChange={(v) => S('maxSeats', v)} options={info.limits.maxSeats.map((x) => [x, String(x)])} />
      </div>
      {narrow ? <p className="small bj-note sc-pitch">Aces are trump. Match the last card and the next sap is skipped. Finish first, be King. Finish last, hand over your best cards.</p>
        : <div className="sc-howto"><h3 className="western">How it plays</h3><ul className="small">{[...RULES, ...(info.payouts ? PAY_RULES : [])].map((x) => <li key={x}>{x}</li>)}</ul></div>}
      <div className="bj-create"><span className="small dim">3–7 players · invite friends with the link · out of time = pass</span>
        {canDeal
          ? <><button className="btn ghost small" onClick={() => create()} data-test="scum-create">Open lobby</button>
            <button className="btn primary" onClick={() => create({ deal: true })} title="Create and deal with the bots" data-test="scum-create-deal">Open & deal →</button></>
          : <button className="btn primary" onClick={() => create()} title="Create a table and invite friends with the link" data-test="scum-create">Open lobby →</button>}</div>
    </div>
  );
  return (
    <div className="screen bj">
      <div className="panel bj-lobby sc-lobby">
        <div className="bj-head"><button className="btn ghost small" onClick={() => navigate('/')}>← Lobby</button><h1 className="western">SCUM</h1><span className="bj-sub">{info.payouts ? 'Free to play · King +$100 · Scum −$10' : 'Aces are trump · Play for pride'}</span>
          <div className="bj-head-r"><button className="btn ghost small" onClick={() => setRules(true)} data-test="scum-rules">Rules</button></div></div>
        {err && <p className="error" role="alert">{err}</p>}
        {narrow ? <>
          <div className="bj-sectabs top" role="tablist">{[['new', 'Start a table'], ['tables', `Your tables${info.tables.length ? ` (${info.tables.length})` : ''}`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-test={`scum-tab-${k}`}>{l}</button>)}</div>
          {tab === 'new' ? form : tables}
        </> : <div className="bj-cols"><section>{form}</section><section><h3 className="western">Your tables</h3>{tables}</section></div>}
        {rules && <RulesPop pay={info.payouts} onClose={() => setRules(false)} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the table
const SEEN = (code) => `bba.scum.seen.${code}`;
/** Element size through a callback ref (the table mounts after its first fetch, so a plain ref would miss it). */
function useBox() {
  const [el, setEl] = useState(null); const [s, setS] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setS({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setS({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [el]);
  return [setEl, s];
}
function useView(code) {
  const [v, setV] = useState(null); const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      const nv = await api('GET', `/scum/tables/${code}${document.hidden ? '?away' : ''}`);
      setErr('');
      setV((prev) => {
        if (!prev || prev.seq !== nv.seq) return Object.assign(nv, { _at: Date.now() });
        // Same move: keep the same object tree (so flies and badges aren't remounted) and only refresh the clock / presence.
        let dirty = prev.now !== nv.now;
        const seats = prev.seats.map((s, i) => {
          const n = nv.seats[i];
          if (!s || !n) { if (s !== n) dirty = true; return n; }
          if (s.here === n.here) return s;
          dirty = true;
          return { ...s, here: n.here };
        });
        if (!dirty) return prev;
        return { ...prev, now: nv.now, here: nv.here, seats };
      });
    } catch (e) { setErr(e.message); }
  }, [code]);
  useEffect(() => { load(); const id = setInterval(load, 1500); return () => clearInterval(id); }, [load]);
  return [v, setV, err, setErr];
}

/** What the playback steps through: plays, clears, your bug covering a turn, and Scum-to-King. */
const replays = (e) => ['play', 'clear', 's2k', 'pass'].includes(e.ev?.k);
const cash = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
/** Plays new public moves one at a time: cards landing on the pile, clears, and skip blasts. Missed moves replay on return. */
function usePlayback(v, code) {
  const seen = useRef(null); const [queue, setQueue] = useState([]); const [catching, setCatching] = useState(0);
  useEffect(() => {
    if (!v) return;
    if (seen.current == null) {
      const stored = Number(localStorage.getItem(SEEN(code)));
      seen.current = Number.isFinite(stored) && stored > 0 && stored <= v.seq ? stored : v.seq; // first visit: nothing to catch up on
      const missed = v.log.filter((e) => e.seq > seen.current && replays(e)).slice(-16);
      if (missed.length > 1) setCatching(missed.length);
      if (missed.length) setQueue(missed);
    } else {
      const fresh = v.log.filter((e) => e.seq > seen.current && replays(e));
      if (fresh.length) setQueue((q) => [...q, ...fresh].slice(-16));
    }
    seen.current = Math.max(seen.current, v.seq);
    try { localStorage.setItem(SEEN(code), String(seen.current)); } catch { /* private mode */ }
  }, [v?.seq]);
  const skip = () => { setQueue([]); setCatching(0); };
  const next = useCallback(() => setQueue((q) => { const r = q.slice(1); if (!r.length) setCatching(0); return r; }), []);
  return { step: queue[0] || null, pending: queue.length, catching, skip, next };
}

function seatXY(k, n, tall) {
  const ang = ((90 + (360 * k) / n) * Math.PI) / 180;
  const rx = tall ? 40 : 43, ry = tall ? 36 : 37;
  return { x: 50 + rx * Math.cos(ang), y: (tall ? 46 : 48) + ry * Math.sin(ang) };
}

function ScumTable({ code, me }) {
  const [v, setV, err] = useView(code);
  const who = usePlayerCard();
  const [sel, setSel] = useState([]);
  const [beg, setBeg] = useState('');
  const [show, setShow] = useState(null);
  const [busy, setBusy] = useState(false);
  // Errors from your own moves (Deal, Play, Pass...). Kept apart from the 1.5s poll's error, which clears itself on
  // every successful poll and would otherwise wipe a server rejection before anyone could read it.
  const [actErr, setActErr] = useState('');
  useEffect(() => { if (!actErr) return undefined; const id = setTimeout(() => setActErr(''), 10000); return () => clearTimeout(id); }, [actErr]);
  const [blast, setBlast] = useState(null);
  const [crown, setCrown] = useState(null);
  const [bugNote, setBugNote] = useState(null);
  const [muted, setMute] = useState(isMuted());
  const [copied, setCopied] = useState(false);
  const [royalPlay, setRoyalPlay] = useState(null); // { ev, ack: bool } ack=false means rewatch, do not mark seen
  const [royalStep, setRoyalStep] = useState('pick');
  const royalSeen = useRef(new Set());
  const [, tick] = useState(0);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const [arena, { w, h }] = useBox();
  const [handBox, hs] = useBox();
  const tiny = useMedia('(max-width: 520px)');
  const pb = usePlayback(v, code);
  useEffect(() => {
    const pend = v?.royal?.pending;
    if (!pend || royalPlay || pb.pending) return;
    if (royalSeen.current.has(pend.id)) return;
    setRoyalPlay({ ev: pend, ack: true });
  }, [v?.royal?.pending?.id, royalPlay, pb.pending]);
  const seatEls = useRef({});
  const pileRef = useRef(null);
  const handEls = useRef({});
  const handRect = useRef({});
  const flyRef = useRef(null);
  const [fly, setFly] = useState(null);
  const [settled, setSettled] = useState(undefined);
  flyRef.current = fly;
  useLayoutEffect(() => {
    const next = { ...handRect.current };
    for (const [c, el] of Object.entries(handEls.current)) {
      if (el) { const b = el.getBoundingClientRect(); if (b.width) next[c] = b; }
    }
    handRect.current = next;
  });
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { document.title = publicTitle(v?.code ? `SCUM table ${v.code}` : 'SCUM', { myTurn: !!v?.round?.myTurn }); }, [v?.code, v?.round?.myTurn]);
  const r = v?.round;
  const handKey = (r?.hand || []).join(',');
  useEffect(() => { setSel((s) => s.filter((c) => r?.hand?.includes(c))); }, [handKey, r?.phase]);

  // Step through queued moves: cards fly from the seat (or your hand) to the pile; a skip brings out the troll after.
  const step = pb.step;
  useEffect(() => {
    if (!step) return undefined;
    const e = step.ev;
    if (e.bug && v) { const who = v.seats[e.seat]; setBugNote({ seq: step.seq, bug: e.bug, me: !!who?.me, name: who?.name || 'Someone', pass: e.k === 'pass' }); }
    if (e.k === 's2k' && v) {
      setCrown({ seq: step.seq, name: v.seats[e.seat]?.name || 'Somebody', from: v.seats[e.from]?.name || 'the King', amt: e.amt, me: !!v.seats[e.seat]?.me, dethroned: !!v.seats[e.from]?.me, short: !!pb.catching });
      if (!isMuted()) sfx.bj();
      return undefined;
    }
    if (e.k === 'pass') { const id = setTimeout(pb.next, e.bug || pb.catching ? 650 : 380); return () => clearTimeout(id); }
    if (e.k === 'play') {
      if (!isMuted()) sfx.deal();
      setFly({ seq: step.seq, cards: e.cards, seat: e.seat, skip: e.skip, catching: !!pb.catching });
      return undefined; // FlyBatch onDone continues (and may open the skip blast)
    }
    const id = setTimeout(pb.next, pb.catching ? 500 : 380);
    return () => clearTimeout(id);
  }, [step?.seq]);
  const endBlast = useCallback(() => { setBlast(null); pb.next(); }, [pb.next]);
  const endCrown = useCallback(() => { setCrown(null); pb.next(); }, [pb.next]);
  const endFly = useCallback(() => {
    const f = flyRef.current;
    setFly(null);
    if (!f) { pb.next(); return; }
    setSettled({ cards: f.cards, seat: f.seat, key: `${f.seat}-${(f.cards || []).join('')}` });
    if (f.skip != null && v) {
      const skipped = v.seats[f.skip]; const by = v.seats[f.seat];
      setBlast({ seq: f.seq, name: skipped?.name || 'Somebody', by: by?.name, me: skipped?.me, short: !!f.catching });
      if (!isMuted()) { sfx.bust(); setTimeout(() => sfx.lose(), 300); }
      return; // blast onDone moves on
    }
    pb.next();
  }, [pb.next, v]);
  useEffect(() => { if (!bugNote) return undefined; const id = setTimeout(() => setBugNote(null), 2600); return () => clearTimeout(id); }, [bugNote?.seq]);
  // Paint the live pile when we first have a view, and after clears. Do not run while v is still null (that
  // would freeze an empty pile). A newer live pile than the one we have painted waits for the flight to land.
  useEffect(() => {
    if (!v || fly || step?.ev?.k === 'play') return;
    if (step?.ev?.k === 'clear') { setSettled({ cards: null, seat: step.ev.seat, cleared: step.ev.why, key: `clear-${step.seq}` }); return; }
    const pile = v.round?.pile;
    const key = pile ? `${pile.seat}-${pile.cards.join('')}` : 'clear';
    setSettled((prev) => {
      if (prev && prev.key === key) return prev;
      if (prev?.cards?.length && pile && prev.key !== key) return prev;
      return pile ? { cards: pile.cards, seat: pile.seat, key } : { cards: null, seat: v.round?.turn, key };
    });
  }, [v?.seq, step?.seq, fly?.seq]);

  const r0 = v?.round;
  const ex0 = r0?.phase === 'exchange' ? r0.exchange : null;
  const owe0 = ex0?.pairs.find((p) => p.from === v.mySeat);
  const gets0 = ex0?.pairs.find((p) => p.to === v.mySeat);
  const giving0 = !!(gets0 && gets0.paid && !gets0.given);
  const hasAction = !!(v && v.mySeat >= 0 && (r0?.myTurn || (owe0 && !owe0.paid) || giving0));
  const turnAdvance = useTurnAdvance({
    currentPath: `/scum/${String(code).toUpperCase()}`,
    hasAction,
    blocked: !!pb.pending || !!blast || !!crown || !!fly || !!royalPlay,
    enabled: true,
  });
  if (!v) return <div className="screen bj"><div className="panel bj-empty">{err || 'Shuffling…'}{err && <button className="btn small" onClick={() => navigate('/scum')}>Back to scum</button>}</div></div>;
  const post = async (path, body) => {
    setBusy(true); setActErr('');
    try { const nv = await api('POST', `/scum/tables/${code}/${path}`, body); if (nv?.closed) { navigate('/scum'); return null; } setV(nv); refreshTurns(); return nv; } catch (e) { setActErr(e.message || 'Something went wrong. Try again.'); return null; } finally { setBusy(false); }
  };
  const issueRoyal = async (cmd, targetSeat) => {
    const nv = await post('royal', { cmd, ...(targetSeat != null ? { targetSeat } : {}) });
    if (!nv) return;
    setRoyalStep('pick');
    const ev = nv.royal?.history?.at?.(-1) || (nv.royal?.history || []).slice(-1)[0];
    if (ev) { royalSeen.current.add(ev.id); setRoyalPlay({ ev, ack: false }); }
  };
  const endRoyal = async () => {
    const cur = royalPlay;
    setRoyalPlay(null);
    if (cur?.ack && cur.ev?.id) {
      royalSeen.current.add(cur.ev.id);
      try { const nv = await api('POST', `/scum/tables/${code}/royal/seen`, { id: cur.ev.id }); if (nv && !nv.closed) setV(nv); } catch { /* will retry next visit */ }
    }
  };
  const mine = v.mySeat >= 0 ? v.seats[v.mySeat] : null;
  const tall = w && h ? w / h < 1.2 : false;
  // Seats go round the felt in turn order, you at the bottom.
  const order = (r?.order || v.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)).filter((i) => v.seats[i]);
  const extra = v.seats.map((s, i) => (s && !order.includes(i) ? i : -1)).filter((i) => i >= 0);
  const ring = [...order, ...extra];
  const meAt = Math.max(0, ring.indexOf(v.mySeat));
  const disp = [...ring.slice(meAt), ...ring.slice(0, meAt)];
  const N = disp.length;
  const bust = Math.round(Math.max(30, Math.min(64, w / (tall ? 8 : 13), h / (N > 5 ? 8 : 6.5))));
  const pos = Object.fromEntries(disp.map((s, k) => [s, seatXY(k, N, tall)]));

  // Settled pile only: flying cards are a separate overlay, so a poll never remounts and retriggers the land animation.
  const frame = settled !== undefined ? settled
    : (r?.pile ? { cards: r.pile.cards, seat: r.pile.seat } : { cards: null, seat: r?.turn, cleared: null });

  const ex = r?.phase === 'exchange' ? r.exchange : null;
  const owe = ex?.pairs.find((p) => p.from === v.mySeat);
  const gets = ex?.pairs.find((p) => p.to === v.mySeat);
  const giving = gets && gets.paid && !gets.given;
  const myTurn = !!r?.myTurn && !pb.pending;
  const prob = playProblem(r?.pile, sel);
  const tap = (c) => {
    if (giving) { setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c].slice(-gets.n))); return; }
    if (!r?.myTurn) return;
    setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : s.length && rk(s[0]) !== rk(c) ? [c] : [...s, c].slice(0, 4)));
  };
  const play = async () => { if (prob) return; const ok = await post('play', { cards: sel }); if (ok) setSel([]); };
  const turnSeat = fly?.seat ?? (step?.ev?.k === 'play' ? step.ev.seat : r?.turn);
  const turnName = turnSeat != null ? v.seats[turnSeat]?.name : null;
  const flyingTxt = fly?.cards?.length ? `${v.seats[fly.seat]?.name || ''} plays ${setName({ count: fly.cards.length, rank: rk(fly.cards[0]) })}` : '';
  const clockLeft = r?.deadline ? left(r.deadline - (v.now + (Date.now() - (v._at ||= Date.now())))) : null;
  const pileTxt = frame.cards ? `${v.seats[frame.seat]?.name || ''}: ${setName({ count: frame.cards.length, rank: rk(frame.cards[0]) })}` : fly ? (flyingTxt || '') : frame.cleared === 'ace' ? 'Ace! Pile cleared.' : r?.phase === 'play' && !r.pile ? `Pile's clear. ${turnName || ''} leads.` : '';
  const status = v.status === 'lobby' ? `Waiting to deal · ${v.seats.filter(Boolean).length} seated${v.bots ? ` + ${v.bots} bot${v.bots > 1 ? 's' : ''} on deal` : ''}`
    : v.status === 'over' ? 'Game over'
    : v.hold ? 'Waiting on the Acid Mines: not enough players can cover the dues'
    : ex ? 'Royal court in session: cards changing hands'
    : flyingTxt ? flyingTxt
    : r?.myTurn && !fly ? (r.leading ? 'Your lead. Play any set.' : r.playOn ? 'Everyone passed — keep playing or pass to clear' : `Your turn: beat ${setName(r.pile)} or pass.`)
    : mine?.passed && r?.pile && !fly ? (r.playOn && turnName ? `You're out of this pile. ${turnName} can play on or clear` : "You're out of this pile until it clears.")
    : r?.playOn && turnName && !fly ? `Everyone passed. ${turnName} can play on or clear`
    : turnName ? `${turnName}'s turn` : '';
  const readyToDeal = canStartDeal(v.seats.filter(Boolean).length, v.bots);
  const invite = async () => { const url = `${location.origin}/scum/${v.code}`; try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setActErr(url); } };
  const leave = () => { if (v.status === 'playing' && mine && r?.order.includes(v.mySeat) && !r.finished.includes(v.mySeat) && !window.confirm('Walk out? Your cards go with you.')) return; post('leave'); };
  const cw = hs.w < 420 ? 42 : hs.w < 700 ? 50 : 58;
  const hand = sortCards(r?.hand || []);
  const stepX = hand.length > 1 ? Math.max(14, Math.min(cw * 0.82, (hs.w - cw - 8) / (hand.length - 1))) : 0;
  const handX = Math.max(0, (hs.w - (stepX * Math.max(0, hand.length - 1) + cw)) / 2);
  const fresh = new Set(gets?.paid ? gets.tribute || [] : owe?.paid ? owe.gift || [] : []);
  const owed = new Set(owe && !owe.paid ? owe.owe || [] : []);

  return (
    <div className={`screen bj sc ${tall ? 'tall' : ''}`}>
      <div className="panel bj-felt sc-felt" data-test="scum-table">
        <div className="bj-head">
          <button className="btn ghost small" onClick={() => navigate('/scum')} aria-label="Back to scum">←</button>
          <h1 className="western">{v.name}</h1>
          {r && <span className="bj-sub mono">R{r.no}</span>}
          <div className="bj-head-r">
            <button className="btn ghost small" onClick={invite} data-test="scum-invite" title="Copy the invite link" aria-label="Copy the invite link">{copied ? 'Copied!' : tiny ? '🔗' : 'Invite'}</button>
            <button className="btn ghost small" onClick={() => setShow(show === 'log' ? null : 'log')} data-test="scum-log-btn" aria-label="Table log">{tiny ? '☰' : 'Log'}</button>
            <RoyalRewatch history={v.royal?.history} onRewatch={(ev) => setRoyalPlay({ ev, ack: false })} />
            <button className="btn ghost small" onClick={() => setShow(show === 'rules' ? null : 'rules')} data-test="scum-rules" aria-label="Rules">{tiny ? '?' : 'Rules'}</button>
            <button className="btn ghost small" aria-pressed={muted} onClick={() => { setMuted(!muted); setMute(!muted); }} title="Sound">{muted ? '🔇' : '♪'}</button>
            {v.isHost ? <button className="btn ghost small" onClick={() => post('close')} data-test="scum-close">Close</button>
              : mine ? <button className="btn ghost small" onClick={leave} data-test="scum-leave">Leave</button> : null}
          </div>
        </div>
        <div className={`bj-status sc-status ${!fly && r?.myTurn ? 'mine' : ''}`} data-test="scum-status"><span>{status}</span>{clockLeft && v.status === 'playing' && r?.phase === 'play' && <span className="mono">⏱ {clockLeft}</span>}</div>

        <div className="sc-arena" ref={arena} style={{ '--bust': `${bust}px` }} data-test="scum-arena">
          {w > 0 && <>
            <div className="bj-oval sc-oval" style={{ left: `${tall ? 9 : 8}%`, right: `${tall ? 9 : 8}%`, top: `${tall ? 15 : 17}%`, bottom: `${tall ? 23 : 21}%` }} aria-hidden="true"><div className="bj-oval-logo script">Buffalo Bill's</div></div>
            <div className="sc-pile" ref={pileRef} data-test="scum-pile">
              {ex || v.hold ? <Court v={v} /> : <>
                <div className="sc-pile-cards">
                  {frame.cards ? frame.cards.map((c, i) => <span key={c} className="sc-pc" style={{ '--k': i }}><Card card={c} size="md" /></span>)
                    : <span className={`sc-clear ${frame.cleared === 'ace' ? 'ace' : ''}`}>{frame.cleared === 'ace' ? 'A!' : '∅'}</span>}
                </div>
                <div className="sc-pile-txt small">{pileTxt}</div>
                {bugNote && <div className={`sc-bugnote ${bugNote.me ? 'me' : ''}`} key={bugNote.seq} data-test="scum-bugnote" role="status">
        {bugNote.bug.generic ? <span className="sc-bug-ic" aria-hidden="true">🐞</span> : <TableBugSprite bug={bugNote.bug} size={30} reduced={reduced} />}
        <span>{bugNote.me ? 'Your bug played for you' : `${bugNote.name}'s bug played for them`}<small>{bugNote.pass ? 'Nothing beat it: pass' : 'Always the highest card'}</small></span>
      </div>}
              </>}
            </div>
            {disp.map((i) => {
              const s = v.seats[i]; const p = pos[i]; const isTurn = i === turnSeat;
              return (
                <div key={i} ref={(el) => { if (el) seatEls.current[i] = el; else delete seatEls.current[i]; }} className={`bj-rail sc-seat ${s.me ? 'me' : ''} ${isTurn ? 'turn' : ''} ${s.place ? 'out' : ''} ${s.left ? 'gone' : ''} ${s.passed ? 'passed' : ''} ${s.skipped ? 'skipped' : ''} ${p.x > 68 ? 'east' : ''} ${seatRoyalClass(royalPlay?.ev, i)}`} style={{ left: `${p.x}%`, top: `${p.y}%`, '--sx': p.x, '--sy': p.y }} data-test={`scum-seat-${i}`} {...(s.me || s.bot ? {} : who.seat(s.id, s.name))}>
                  {isTurn && <span className="sc-turnlbl" data-test="scum-turn-label">{s.me ? (fly ? 'Playing' : 'Your turn') : `${s.name}'s turn`}</span>}
                  <SeatBuddy bug={s.bug} playerId={s.id || `scum-seat-${i}`} size={Math.round(bust * 0.5)} reduced={reduced} myAction={!!(s.me && s.turn)} busy={false}>
                    <Bust id={s.id || `scum-seat-${i}`} avatar={s.avatar} size={bust} state={s.turn ? 'toact' : ''} still={reduced} title={s.name} />
                  </SeatBuddy>
                  {s.passed && <span className="sc-seatbadge pass" data-test="scum-passed">Out</span>}
                  {s.skipped && <span className="sc-seatbadge skip" data-test="scum-skipped">Skipped</span>}
                  {s.title && <span className={`sc-title t-${s.title}`} data-test="scum-title">{CROWN[s.title]} {TITLE[s.title]}</span>}
                  {v.payouts && s.broke ? <span className="sc-paychip broke" data-test="scum-minechip" title="Off to the Acid Mines">⛏ mines</span>
                    : v.payouts && s.pay ? <span className={`sc-paychip ${s.pay > 0 ? 'up' : 'down'}`} data-test="scum-paychip" title={s.bot ? 'House money (bots never touch a bankroll)' : 'This round’s title pay'}>{cash(s.pay)}</span> : null}
                  {r && !s.me && !s.waiting && !s.left && !s.broke && (s.count > 0 || r.order.includes(i)) && <Fan n={s.count} bust={bust} />}
                  <div className="bj-pill sc-pill">
                    <b>{s.here && <i className="here-dot" data-test="here-dot" title="At the table now" />}{s.bot ? '🤖 ' : ''}{s.name}</b>
                    {r && !s.waiting && !s.left && !s.broke && <span className="mono sc-count" title={`${s.count} cards`}>{s.place ? `out ${['', '1st', '2nd', '3rd'][s.place] || `${s.place}th`}` : s.count}</span>}
                    {s.waiting && <span className="mono dim">next round</span>}{s.left && <span className="mono dim">left</span>}
                  </div>
                </div>
              );
            })}
            {fly && <FlyBatch key={fly.seq} cards={fly.cards} seat={fly.seat} seatEl={seatEls.current[fly.seat]} pileEl={pileRef.current} handRects={handRect.current} mine={fly.seat === v.mySeat} reduced={reduced} onDone={endFly} />}
            {!royalPlay && !pb.pending && <RoyalPicker royal={v.royal} onCommand={issueRoyal} busy={busy} step={royalStep} setStep={setRoyalStep} />}
            {royalPlay && <RoyalPlay key={royalPlay.ev.id} ev={royalPlay.ev} pos={pos} onSkip={endRoyal} onDone={endRoyal} reduced={reduced} />}
          </>}
        </div>

        <NextTablePill advance={turnAdvance} />
        <div className="sc-bar" data-test="scum-bar">
          {v.status === 'lobby' ? <div className="bj-acts" data-test="scum-lobby">
              <span className="small">Invite friends: <b className="mono" data-test="scum-code">{v.code}</b></span>
              {v.isHost ? <button className="btn primary" disabled={busy || !readyToDeal} onClick={() => post('start')} title={readyToDeal ? 'Deal the first hand' : 'Needs 3 players. Invite friends with the link, or add bots.'} data-test="scum-deal">Deal</button> : <span className="small dim">Waiting for {v.hostName} to deal…</span>}
              {!mine && <button className="btn small" onClick={() => post('join')} data-test="scum-sit">Sit down</button>}
            </div>
            : v.status === 'over' ? <span className="small">Game over. <button className="btn small" onClick={() => navigate('/scum')}>Back to scum</button></span>
            : !mine ? <span className="small dim">Watching. <button className="btn small" onClick={() => post('join')} data-test="scum-sit">Sit down</button> (dealt in next round)</span>
            : <>
              {ex && <Exchange v={v} owe={owe} gets={gets} giving={giving} sel={sel} beg={beg} setBeg={setBeg} busy={busy} post={post} onSent={() => { setSel([]); setBeg(''); }} />}
              <div className="sc-hand" ref={handBox} style={{ '--cw': `${cw}px` }} data-test="scum-hand">
                {hand.map((c, k) => (
                  <button key={c} type="button" ref={(el) => { if (el) handEls.current[c] = el; else delete handEls.current[c]; }} className={`sc-hc ${sel.includes(c) ? 'sel' : ''} ${fresh.has(c) ? 'fresh' : ''} ${owed.has(c) ? 'owed' : ''}`} style={{ left: `${handX + k * stepX}px`, zIndex: k }}
                    onClick={() => tap(c)} aria-pressed={sel.includes(c)} disabled={!(myTurn || giving)} data-test={`scum-card-${c}`}><Card card={c} size="md" /></button>))}
                {!hand.length && mine.broke ? <div className="sc-broke" data-test="scum-broke"><span className="sc-broke-ic" aria-hidden="true">⛏</span><span className="small"><b>Broke.</b> You need {cash(v.payouts?.need || 10).slice(1)} to be dealt in (Scum dues). Your seat is saved.</span><button className="btn primary small" onClick={goToMines} data-test="scum-mines">Work a shift →</button></div>
                  : !hand.length && <span className="small dim sc-nohand">{mine.waiting ? 'You get dealt in next round.' : mine.place ? `You're out ${mine.place === 1 ? 'first. Long live the King.' : `#${mine.place}.`}` : ''}</span>}
              </div>
              {r?.phase === 'play' && <div className="bj-acts sc-acts">
                {r.myTurn ? <>
                  <button className="btn primary" disabled={busy || !!prob || !!pb.pending} onClick={play} data-test="scum-play">{prob && sel.length ? prob : sel.length ? `Play ${setName({ count: sel.length, rank: rk(sel[0]) })}` : r.leading ? 'Pick your lead' : 'Pick cards'}</button>
                  <button className="btn" disabled={busy || r.leading || !!pb.pending} onClick={() => post('pass')} data-test="scum-pass">{r.playOn ? 'Pass & clear' : 'Pass'}</button>
                </> : <span className="small dim">{mine.place ? 'Watching the rest fight it out.' : mine.passed ? 'Out of this pile.' : `Waiting on ${turnName || '…'}`}</span>}
              </div>}
            </>}
        </div>
        {(actErr || err) && <p className="error bj-err" role="alert" data-test="scum-error">{actErr || err}</p>}
        {pb.catching > 0 && <button className="sc-catch" onClick={() => { const pile = v.round?.pile; setSettled(pile ? { cards: pile.cards, seat: pile.seat, key: `${pile.seat}-${pile.cards.join('')}` } : { cards: null, seat: v.round?.turn, key: 'clear' }); setFly(null); pb.skip(); }} data-test="scum-catchup">↺ Catching up on {pb.catching} moves · tap to skip</button>}
        {show === 'rules' && <RulesPop pay={!!v.payouts} onClose={() => setShow(null)} />}
        {show === 'log' && <div className="bj-pop" data-test="scum-log" onClick={() => setShow(null)}><div className="panel sc-logp"><h3 className="western">Table log</h3><ol className="sc-log">{v.log.slice(-40).reverse().map((e) => <li key={e.seq} className={e.ev?.skip != null ? 'skip' : ''}>{e.text}</li>)}</ol><button className="btn small">Close</button></div></div>}
        {v.status === 'over' && v.lastRound && <Final v={v} />}
      </div>
      {who.card}
      {crown && <CrownBlast key={crown.seq} {...crown} onDone={endCrown} />}
      {blast && <SkipBlast key={blast.seq} name={blast.name} by={blast.by} me={blast.me} short={blast.short} onDone={endBlast} />}
    </div>
  );
}

/**
 * Opponent's hand as real face-down cards: one back per card, overlapped tighter as the count grows so the fan stays
 * about one avatar wide. Cards they just played lift off toward the pile. Only the count ever reaches the browser.
 */
function Fan({ n, bust }) {
  const cw = Math.max(11, Math.round(bust * 0.3));
  const W = Math.max(48, bust * 1.5);
  const step = n > 1 ? Math.min(cw * 0.55, (W - cw) / (n - 1)) : 0;
  const width = cw + step * Math.max(0, n - 1);
  const tilt = Math.min(2.4, 26 / Math.max(1, n));
  return (
    <div className="sc-fan" style={{ width, height: Math.round(cw * 1.4) + 4, '--cw': `${cw}px` }} data-test="scum-fan" data-n={n} aria-label={`${n} card${n === 1 ? '' : 's'} left`} role="img">
      {Array.from({ length: n }, (_, k) => <i key={k} className="sc-back" style={{ left: k * step, transform: `rotate(${(k - (n - 1) / 2) * tilt}deg)` }} />)}
    </div>
  );
}

/** Face-up cards fly from a seat (or your hand) to the pile. Transform/opacity only; queued by the playback stepper. */
function FlyBatch({ cards, seatEl, pileEl, handRects, mine, reduced, onDone }) {
  const [phase, setPhase] = useState('from');
  const [items, setItems] = useState([]);
  const done = useRef(false);
  useLayoutEffect(() => {
    const pile = pileEl?.getBoundingClientRect();
    const seat = seatEl?.querySelector('.bust')?.getBoundingClientRect() || seatEl?.getBoundingClientRect();
    const tx = pile ? pile.left + pile.width / 2 : window.innerWidth / 2;
    const ty = pile ? pile.top + pile.height / 2 : window.innerHeight * 0.42;
    const list = (cards || []).map((c, i) => {
      const hand = mine ? handRects?.[c] : null;
      const from = hand && hand.width ? hand : seat;
      const x = from ? from.left + from.width / 2 : tx;
      const y = from ? from.top + from.height / 2 : ty;
      return { c, i, x, y, dx: tx - x, dy: ty - y };
    });
    setItems(list);
    if (reduced || !list.length) { done.current = true; onDone(); return undefined; }
    const start = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('to')));
    const hold = typeof window !== 'undefined' && Number(window.__scumFlyMs);
    const ms = (Number.isFinite(hold) && hold > 0 ? hold : 400) + Math.max(0, list.length - 1) * 50;
    const t = setTimeout(() => { if (!done.current) { done.current = true; onDone(); } }, ms);
    return () => { cancelAnimationFrame(start); clearTimeout(t); };
  }, []);
  if (!items.length) return null;
  return (
    <div className="sc-flies" data-test="scum-fly" data-phase={phase} aria-hidden="true">
      {items.map(({ c, i, x, y, dx, dy }) => (
        <span key={c} className={`sc-fly ${phase === 'to' ? 'to' : ''}`} style={{ left: `${x}px`, top: `${y}px`, '--dx': `${dx}px`, '--dy': `${dy}px`, '--k': i }}><Card card={c} size="md" /></span>
      ))}
    </div>
  );
}

/** Center of the felt during the exchange: last round's titles and who still owes whom. */
function Court({ v }) {
  const pairs = v.round?.exchange?.pairs || [];
  return (
    <div className="sc-court" data-test="scum-court">
      <b className="western">Round {v.lastRound?.no} standings</b>
      <ol className="sc-stand">{(v.lastRound?.finish || []).map((x) => <li key={x.seat} className={`t-${x.title}`}><span>{CROWN[x.title]} {TITLE[x.title]}</span><b>{x.name}</b>{v.payouts && <i className={`mono sc-pay ${x.net > 0 ? 'up' : x.net < 0 ? 'down' : ''}`} data-test="scum-standpay" title={x.house ? 'House money' : x.short ? 'Paid what they had' : ''}>{x.net ? cash(x.net) : '$0'}</i>}</li>)}</ol>
      {v.lastRound?.s2k?.amt > 0 && <div className="sc-s2k small" data-test="scum-s2k-line">♚ From Scum to King: {v.lastRound.s2k.name} took {cash(v.lastRound.s2k.amt).slice(1)} of {v.lastRound.s2k.fromName}'s King pay</div>}
      {v.hold && <div className="sc-owes small" data-test="scum-hold">⛏ Waiting for {v.seats.filter((s) => s?.broke).map((s) => s.name).join(' & ') || 'players'} to earn {cash(v.payouts?.need || 10).slice(1)} in the Acid Mines</div>}
      <div className="sc-owes small">{pairs.map((p) => <span key={p.from}>{v.seats[p.from]?.name} → {v.seats[p.to]?.name}: {p.given ? 'done' : p.paid ? `${v.seats[p.to]?.name} picking` : 'owes'}</span>)}</div>
    </div>
  );
}

/** Your part of the exchange: hand over (with a beg), wait, or pick what to give back. */
function Exchange({ v, owe, gets, giving, sel, beg, setBeg, busy, post, onSent }) {
  const nm = (s) => v.seats[s]?.name || 'them';
  if (owe && !owe.paid) return (
    <form className="sc-ex" data-test="scum-beg" onSubmit={async (e) => { e.preventDefault(); if (await post('tribute', { beg })) onSent(); }}>
      <span className="small"><b>{owe.n === 2 ? 'Your 2 best cards' : 'Your best card'}</b> go to {nm(owe.to)}:</span>
      <span className="sc-mini">{(owe.owe || []).map((c) => <Card key={c} card={c} size="sm" />)}</span>
      <input value={beg} onChange={(e) => setBeg(e.target.value.slice(0, 140))} maxLength={140} placeholder={`Beg ${nm(owe.to)} for a card…`} aria-label="Beg for a card" data-test="scum-beg-input" />
      <button className="btn primary" disabled={busy} data-test="scum-tribute">{beg.trim() ? 'Beg & hand over' : 'Hand over'}</button>
    </form>
  );
  if (owe && owe.paid) return <div className="sc-ex small" data-test="scum-waiting-gift">{owe.given ? <>{nm(owe.to)} sent back <span className="sc-mini">{(owe.gift || []).map((c) => <Card key={c} card={c} size="sm" />)}</span></> : <>Handed over. {nm(owe.to)} is picking what you get{owe.beg ? <> · you begged “{owe.beg}”</> : ''}.</>}</div>;
  if (gets && !gets.paid) return <div className="sc-ex small">Waiting for {nm(gets.from)} to hand over {gets.n === 2 ? 'their 2 best' : 'their best'}…</div>;
  if (giving) return (
    <div className="sc-ex" data-test="scum-give">
      {gets.beg ? <span className="sc-begbub" data-test="scum-begbub">{nm(gets.from)}: “{gets.beg}”</span> : <span className="small dim">{nm(gets.from)} didn't even beg.</span>}
      <span className="small">Got <span className="sc-mini">{(gets.tribute || []).map((c) => <Card key={c} card={c} size="sm" />)}</span> Pick {gets.n === 2 ? '2 cards' : '1 card'} for {nm(gets.from)}.</span>
      <button className="btn primary" disabled={busy || sel.length !== gets.n} onClick={async () => { if (await post('give', { cards: sel })) onSent(); }} data-test="scum-give-btn">Give {sel.length}/{gets.n}</button>
    </div>
  );
  if (gets && gets.given) return <div className="sc-ex small">Sent. Waiting on the rest of the court…</div>;
  return <div className="sc-ex small dim">The royal court is trading cards. You keep yours.</div>;
}

function Final({ v }) {
  const rows = v.seats.filter(Boolean).filter((s) => !s.bot || true).sort((a, b) => (b.stats?.king || 0) - (a.stats?.king || 0) || (a.stats?.scum || 0) - (b.stats?.scum || 0));
  return (
    <div className="bj-pop final" data-test="scum-final"><div className="panel"><h3 className="western">Final court</h3>
      <ol className="bj-stand sc-final">{rows.map((s) => <li key={s.i}><b>{s.name}</b><span className="mono">♚ {s.stats?.king || 0}</span><span className="mono">🪣 {s.stats?.scum || 0}</span><span className="mono">skips {s.stats?.skips || 0}</span>{v.payouts && !s.bot && <span className={`mono sc-pay ${(s.stats?.cash || 0) > 0 ? 'up' : (s.stats?.cash || 0) < 0 ? 'down' : ''}`}>{cash(s.stats?.cash || 0)}</span>}</li>)}</ol>
      <button className="btn primary small" onClick={() => navigate('/scum')}>Back to scum</button></div></div>
  );
}
