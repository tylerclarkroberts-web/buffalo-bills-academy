// v44 Blackjack: lobby (/bj) and table (/bj/CODE). One screen each, never scrolls. Play money only.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, useSession, refreshSession } from '../api.js';
import { navigate } from '../App.jsx';
import { SignIn } from '../Home.jsx';
import { useMedia } from '../ui.jsx';
import { sfx, isMuted, setMuted } from './sfx.js';
import { BjArena } from './BjArena.jsx';
import { useDealReveal } from './useDealReveal.js';
import './bj.css';

const money = (x) => (x == null ? '∞' : `$${Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const left = (ms) => { if (ms <= 0) return '0s'; const s = Math.ceil(ms / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.ceil(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const ept = (x) => `${x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(Math.abs(x) < 0.1 ? 2 : 1)}%`;
const TONE = { good: 'good for you', fair: 'fair', poor: 'poor for you' };
/** v46: the house edge, main game + each royal bet + a typical round, color-coded with plain words. */
function EdgeCard({ e, compact }) {
  if (!e) return null;
  const rows = [['main', 'Main game', e.main], ...Object.entries(e.side).map(([k, x]) => [k, x.name, x])];
  return (
    <div className={`bj-edgecard ${compact ? 'compact' : ''}`} data-test="bj-edgecard">
      <div className="bj-edgerows">{rows.map(([k, l, x]) => (
        <div key={k} className={`bj-er t-${x.tone}`} data-test={`bj-er-${k}`}><span>{l}</span><b>{ept(x.edge)}</b><i>{x.edge < 0 ? 'favors players' : TONE[x.tone]}</i></div>))}
        <div className="bj-er t-total" data-test="bj-er-total"><span>Typical round</span><b>{ept(e.total.edge)}</b><i>{money(e.total.take)} of ${e.total.wager}</i></div>
      </div>
      {!compact && <ul className="bj-edgewarn">{rows.filter(([, , x]) => x.tone === 'poor' || x.edge < 0).map(([k, , x]) => <li key={k} data-test={`bj-ew-${k}`}>⚠ {x.text}</li>)}
        {e.grandfathered && <li data-test="bj-grandfathered">⚠ Made before Guntrad's house-edge floor (v46), so it keeps its old settings: {e.problems.join(' ')}</li>}</ul>}
    </div>
  );
}
/** v47: two-way bet bar. Chips add or take off (sign toggle), type the amount, Min / ½ / ×2 / Last, clamped to
 *  table min..min(table max, your chips). Royal bets: − / + steppers over 0 (off), 1, 2, 5, 10, 25, never above the main bet. */
const SIDE_STEPS = [0, 1, 2, 5, 10, 25];
export function BetBar({ min, max, royal, bet, setBet, side, setSide, onBet, onSitout }) {
  const [neg, setNeg] = useState(false); const [typed, setTyped] = useState(null);
  const last = Number(localStorage.getItem('bba.bj.bet')) || min;
  const cl = (x) => Math.max(min, Math.min(max, Math.round(x)));
  const sideCap = (k, b = bet) => Math.min(side[k] || 0, b, 25);
  const stepSide = (k, d) => { const opts = SIDE_STEPS.filter((x) => x <= Math.min(bet, 25)); const cur = sideCap(k); let i = 0; opts.forEach((x, n) => { if (x <= cur) i = n; }); setSide({ ...side, [k]: opts[Math.max(0, Math.min(opts.length - 1, i + d))] }); };
  const steps = [1, 5, 25, 100].filter((x) => x <= Math.max(max, 1));
  const commit = () => { if (typed != null) { const n = Number(typed); if (Number.isFinite(n) && typed !== '') setBet(cl(n)); setTyped(null); } };
  const can = max >= min;
  return (
    <div className="bj-betting" data-test="bj-betting">
      <div className="bj-betrow">
        <label className="bj-betamt"><span>$</span><input data-test="bj-bet-input" inputMode="numeric" aria-label="Bet amount" value={typed ?? bet}
          onChange={(e) => setTyped(e.target.value.replace(/[^\d]/g, ''))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} /></label>
        <button type="button" className={`bj-sign ${neg ? 'neg' : ''}`} onClick={() => setNeg(!neg)} data-test="bj-sign" aria-pressed={neg} title="Switch chips between adding and taking off">{neg ? '− Take off' : '+ Add'}</button>
        {steps.map((x) => <button key={x} type="button" className={`bj-chip ${neg ? 'neg' : ''}`} data-test={`bj-chip-${x}`} disabled={neg ? bet <= min : bet >= max}
          onClick={() => setBet(cl(bet + (neg ? -x : x)))} aria-label={`${neg ? 'take off' : 'add'} ${x}`}>{neg ? '−' : '+'}{x}</button>)}
      </div>
      <div className="bj-betrow bj-quick">
        <button type="button" className="btn small" data-test="bj-bet-min" disabled={bet <= min} onClick={() => setBet(min)} title="Reset to the table minimum">Min ${min}</button>
        <button type="button" className="btn small" data-test="bj-bet-half" disabled={bet <= min} onClick={() => setBet(cl(bet / 2))}>½</button>
        <button type="button" className="btn small" data-test="bj-bet-double" disabled={bet >= max} onClick={() => setBet(cl(bet * 2))}>×2</button>
        <button type="button" className="btn small" data-test="bj-bet-last" disabled={cl(last) === bet} onClick={() => setBet(cl(last))} title="Same as your last bet">Last ${cl(last)}</button>
        <button type="button" className="btn small" data-test="bj-bet-max" disabled={bet >= max} onClick={() => setBet(max)}>Max</button>
      </div>
      <div className="bj-betrow">
        {['match', 'pairs'].filter((k) => royal[k]?.on).map((k) => { const a = sideCap(k); return (
          <span key={k} className={`bj-side ${a ? 'on' : ''}`} data-test={`bj-side-${k}`} title={`house edge ${(royal[k].edge * 100).toFixed(1)}%`}>
            <button type="button" aria-label={`less ${k}`} data-test={`bj-side-${k}-less`} disabled={!a} onClick={() => stepSide(k, -1)}>−</button>
            <b>{k === 'match' ? '♛ Match' : '♚ Pairs'} <em data-test={`bj-side-${k}-amt`}>{a ? `$${a}` : 'off'}</em></b>
            <button type="button" aria-label={`more ${k}`} data-test={`bj-side-${k}-more`} disabled={a >= Math.min(bet, 25)} onClick={() => stepSide(k, 1)}>+</button>
          </span>); })}
        <button className="btn primary" disabled={!can} onClick={() => onBet(bet, { match: sideCap('match'), pairs: sideCap('pairs') })} data-test="bj-deal">Bet ${bet}{sideCap('match') + sideCap('pairs') ? ` +$${sideCap('match') + sideCap('pairs')}` : ''}</button>
        {onSitout && <button className="btn ghost small" onClick={onSitout} data-test="bj-sitout">Sit out</button>}
      </div>
    </div>
  );
}

function SitGate({ v, post, onClose }) {
  const [ok, setOk] = useState(false);
  const e = v.edge;
  return (
    <div className="bj-pop" data-test="bj-sitgate"><div className="panel bj-gate">
      <h3 className="western">Before you sit down</h3>
      <p className="small dim">House edge = what the house keeps over time, with perfect basic strategy (main game) or on each royal bet.</p>
      <EdgeCard e={e} />
      {e.needsAck && <label className="bj-ack" data-test="bj-ack"><input type="checkbox" checked={ok} onChange={(x) => setOk(x.target.checked)} /> <span>I understand this table takes more than usual{e.ackReasons.length > 1 ? " on " + e.ackReasons.length + " bets" : ""}.</span></label>}
      <div className="bj-acts"><button className="btn ghost small" onClick={onClose}>Not now</button><button className="btn primary" disabled={e.needsAck && !ok} onClick={async () => { if (await post('join', { ack: ok })) onClose(); }} data-test="bj-sit-go">Sit down</button></div>
    </div></div>
  );
}
const TURN = { 30: '30 s', 120: '2 min', 600: '10 min', 3600: '1 hour', 86400: '1 day' };

export default function BlackjackPage({ code }) {
  const { me } = useSession();
  useEffect(() => { document.title = "Blackjack · Buffalo Bill's Academy"; }, []);
  if (!me) return <div className="screen bj"><div className="panel bj-empty"><h2 className="western">Blackjack</h2><SignIn compact next={code ? `/bj/${code}` : '/bj'} /></div></div>;
  return code ? <BjTable code={code} me={me} /> : <BjLobby me={me} />;
}

// ---------------------------------------------------------------- lobby + setup
function Seg({ label, value, options, onChange, test, info }) {
  const why = info?.find((o) => o.blocked)?.blocked;
  return (
    <div className="bj-field" data-test={test}><span>{label}</span>
      <div className="bj-seg">{options.map(([v, l]) => { const o = info?.find((x) => x.value === v); return <button key={String(v)} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} disabled={!!o?.blocked && value !== v} title={o ? (o.blocked || `House edge ${ept(o.edge)}`) : undefined} onClick={() => onChange(v)}>{l}{o && <small className="bj-optedge">{ept(o.edge)}</small>}</button>; })}</div>
      {why && <small className="bj-why" data-test={`${test || 'bj'}-why`}>⊘ {why}</small>}
    </div>
  );
}
function Num({ label, value, min, max, cap, step = 0.5, onChange, test }) {
  const top = cap == null ? max : Math.min(max, cap);
  return (
    <label className="bj-field bj-num" data-test={test}><span>{label}</span>
      <span className="bj-numrow"><button type="button" onClick={() => onChange(Math.max(min, value - step))} aria-label="less">−</button><b>{value}:1</b><button type="button" data-test={test && `${test}-more`} disabled={value >= top} title={value >= top && top < max ? `Guntrad's max: more would cut the house edge under 2%` : undefined} onClick={() => onChange(Math.min(top, value + step))} aria-label="more" data-test={test && `${test}-more`}>+</button></span>
      {top < max && <small className="bj-why" data-test={test && `${test}-why`}>max {top}:1 (Guntrad keeps ≥2%)</small>}
    </label>
  );
}

function BjLobby({ me }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('new');
  const [sec, setSec] = useState('quick'); // v51: essentials first
  const [name, setName] = useState(`${me.name}'s table`);
  const [house, setHouse] = useState('guntrad');
  const [rules, setRules] = useState(null);
  const [royal, setRoyal] = useState(null);
  const [money_, setMoney] = useState({ minBet: 5, maxBetX: 20, buyIn: 500, houseBank: 1000, turnSec: 86400, maxSeats: 5, bots: 1, continuous: false }); // v51: one bot by default so Open & deal is one tap
  const [prev, setPrev] = useState(null);
  const narrow = useMedia('(max-width: 899px) and (not ((orientation: landscape) and (max-height: 520px)))');
  useEffect(() => { api('GET', '/bj').then((r) => { setInfo(r); setRules(r.defaults); setRoyal(Object.fromEntries(Object.entries(r.royalEv).map(([k, v]) => [k, { on: v.on, ...Object.fromEntries(r.royal[k].tiers.map((t) => [t.k, v[t.k]])) }]))); if (r.tables.length) setTab('tables'); }).catch((e) => setErr(e.message)); }, []);
  const settings = useMemo(() => ({ house, rules, royal, ...money_ }), [house, rules, royal, money_]);
  useEffect(() => { if (!rules) return undefined; const id = setTimeout(() => api('POST', '/bj/preview', { settings }).then(setPrev).catch(() => {}), 150); return () => clearTimeout(id); }, [settings]);
  if (!info || !rules) return <div className="screen bj"><div className="panel bj-empty">{err || 'Shuffling…'}</div></div>;
  const R = (k, v) => setRules({ ...rules, [k]: v });
  const M = (k, v) => setMoney({ ...money_, [k]: v });
  const create = async ({ deal = false } = {}) => {
    setErr('');
    try {
      const t = await api('POST', '/bj/tables', { name, settings });
      // v51: Open & deal — create then start in one go when Guntrad + bots (or alone is fine).
      if (deal) { try { await api('POST', `/bj/tables/${t.code}/start`); } catch { /* host can start from the table */ } }
      await refreshSession(); navigate(`/bj/${t.code}`);
    } catch (e) { setErr(e.message); }
  };
  // join-by-code removed in v51 (invite links only)
  const tables = (
    <div className="bj-list" data-test="bj-tables">
      {info.tables.length ? info.tables.map((t) => (
        <button key={t.code} className="bj-row" onClick={() => navigate(`/bj/${t.code}`)}>
          <b>{t.name}</b><span className="mono">{t.code} · {t.players}/{t.maxSeats} · house {t.house || '?'}</span>
          {t.edge && <span className="bj-rowedge" data-test="bj-rowedge"><em className={`t-${t.edge.main.tone}`}>Edge {ept(t.edge.main.edge)}</em>{Object.entries(t.edge.side).map(([k, x]) => <em key={k} className={`t-${x.tone}`}>{k === 'match' ? 'RM' : 'RP'} {ept(x.edge)}</em>)}{(t.edge.needsAck || t.edge.grandfathered) && <em className="t-poor">⚠</em>}</span>}
          <span className={`badge ${t.myTurn ? 'hot' : ''}`}>{t.myTurn ? 'Your turn' : t.status === 'lobby' ? 'Not started' : 'Playing'}</span>
        </button>)) : <p className="small dim">No blackjack tables yet.</p>}
    </div>
  );
  const pv = prev?.royal || {};
  const secs = { quick: 'Quick', house: 'House', rules: 'Rules', royal: 'Royal bets', money: 'Money' };
  const form = (
    <div className="bj-setup" data-test="bj-setup">
      <div className="bj-sectabs" role="tablist">{Object.entries(secs).map(([k, l]) => <button key={k} role="tab" aria-selected={sec === k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)} data-test={`bj-sec-${k}`}>{l}</button>)}</div>
      <div className="bj-secbody">
        {sec === 'quick' && <div className="bj-grid2 bj-quicksetup" data-test="bj-quick">
          <p className="small bj-note">Guntrad deals Vegas single-deck (S17, 3:2). One tap opens the table and starts dealing.</p>
          <Seg test="bj-bots" label="Bots at the table" value={money_.bots} onChange={(v) => M('bots', v)} options={[[0, 'None'], [1, '1'], [2, '2'], [3, '3']]} />
          <Seg label="Buy-in" value={money_.buyIn} onChange={(v) => M('buyIn', v)} options={info.limits.buyIns.map((x) => [x, `$${x}`])} />
          <Seg label="Turn clock" value={money_.turnSec} onChange={(v) => M('turnSec', v)} options={info.limits.turnSecs.map((x) => [x, TURN[x]])} />
          <Seg label="Minimum bet" value={money_.minBet} onChange={(v) => M('minBet', v)} options={info.limits.minBets.map((x) => [x, `$${x}`])} />
        </div>}
        {sec === 'house' && <div className="bj-grid2 bj-housegrid">
          <label className="bj-field"><span>Table name</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-test="bj-name" /></label>
          <Seg test="bj-house" label="Who is the house?" value={house} onChange={setHouse} options={[['guntrad', 'Guntrad'], ['me', 'Me'], ['player', 'Another player']]} />
          <p className="small bj-note">{house === 'guntrad' ? 'Guntrad banks it: unlimited money, a big-Vegas single-deck table (S17, 3:2, double after split).' : house === 'me' ? `You put up a ${money(money_.houseBank)} bank and deal; you don't play a seat. If the bank runs dry the game ends.` : 'Pick the house from the players who join, before you start. Their bank comes from their bankroll.'}</p>
          <Seg test="bj-continuous" label="Individual continuous play" value={money_.continuous} onChange={(v) => M('continuous', v)} options={[[false, 'Off'], [true, 'On']]} />
          {house === 'guntrad' && !money_.continuous && <Seg test="bj-bots" label="Basic-strategy bots" value={money_.bots} onChange={(v) => M('bots', v)} options={[[0, 'None'], [1, '1'], [2, '2'], [3, '3']]} />}
          {money_.continuous && <p className="small bj-note" data-test="bj-continuous-note">Everyone plays their own single deck against the house, back to back. Nobody waits.{house !== 'guntrad' ? ' One bank covers every seat at once: a bet waits if the bank cannot cover it.' : ''}</p>}
        </div>}
        {sec === 'rules' && <div className="bj-grid2">
          <Seg test="bj-s17" label="Dealer soft 17" value={rules.s17} info={prev?.options?.s17} onChange={(v) => R('s17', v)} options={[[true, 'Stands (S17)'], [false, 'Hits (H17)']]} />
          <Seg label="Blackjack pays" value={rules.bjPays} info={prev?.options?.bjPays} onChange={(v) => R('bjPays', v)} options={[[1.5, '3:2'], [1.2, '6:5']]} />
          <Seg label="Double on" value={rules.doubleOn} info={prev?.options?.doubleOn} onChange={(v) => R('doubleOn', v)} options={[['any', 'Any 2'], ['9-11', '9–11'], ['10-11', '10–11']]} />
          <Seg label="Double after split" value={rules.das} info={prev?.options?.das} onChange={(v) => R('das', v)} options={[[true, 'Yes'], [false, 'No']]} />
          <Seg label="Split up to" value={rules.maxHands} info={prev?.options?.maxHands} onChange={(v) => R('maxHands', v)} options={[[1, 'No split'], [2, '2'], [3, '3'], [4, '4 hands']]} />
          <Seg label="Resplit aces" value={rules.resplitAces} info={prev?.options?.resplitAces} onChange={(v) => R('resplitAces', v)} options={[[false, 'No'], [true, 'Yes']]} />
          <Seg label="Insurance" value={rules.insurance} info={prev?.options?.insurance} onChange={(v) => R('insurance', v)} options={[[true, 'Offered'], [false, 'Off']]} />
          <Seg label="Late surrender" value={rules.surrender} info={prev?.options?.surrender} onChange={(v) => R('surrender', v)} options={[[false, 'Off'], [true, 'On']]} />
        </div>}
        {sec === 'royal' && <div className="bj-royal">
          {Object.entries(info.royal).map(([k, def]) => (
            <div key={k} className="bj-rb" data-test={`bj-royal-${k}`}>
              <div className="bj-rb-h"><label><input type="checkbox" checked={royal[k].on} onChange={(e) => setRoyal({ ...royal, [k]: { ...royal[k], on: e.target.checked } })} /> <b>{def.name}</b></label>
                {pv[k] && <span className={`bj-edge ${pv[k].edge < 0 ? 'bad' : pv[k].edge < 0.02 ? 'warn' : ''}`} data-test={`bj-edge-${k}`}>House edge {pct(pv[k].edge)} · EV {pct(pv[k].ev)}</span>}</div>
              <div className="bj-rb-t">{def.tiers.map((t) => <Num key={t.k} test={`bj-pay-${k}-${t.k}`} label={`${t.label} (${t.combos}/1326)`} value={royal[k][t.k]} min={t.min} max={t.max} cap={prev?.caps?.[k]?.[t.k]} onChange={(v) => setRoyal({ ...royal, [k]: { ...royal[k], [t.k]: v } })} />)}</div>
              {pv[k]?.warn && <p className="bj-warn" data-test={`bj-warn-${k}`}>⚠ {pv[k].warn}</p>}
            </div>))}
          <p className="small dim bj-note">Side bets on your first two cards, $1 up to your main bet (max $25). Odds from a fresh single deck: 1,326 two-card hands.</p>
        </div>}
        {sec === 'money' && <div className="bj-grid2">
          <Seg label="Minimum bet" value={money_.minBet} onChange={(v) => M('minBet', v)} options={info.limits.minBets.map((x) => [x, `$${x}`])} />
          <Seg label="Maximum bet" value={money_.maxBetX} onChange={(v) => M('maxBetX', v)} options={info.limits.maxBetX.map((x) => [x, `$${Math.min(info.limits.maxBetCap, x * money_.minBet)}`])} />
          <Seg label="Buy-in" value={money_.buyIn} onChange={(v) => M('buyIn', v)} options={info.limits.buyIns.map((x) => [x, `$${x}`])} />
          {house !== 'guntrad' && <Seg label="House bank" value={money_.houseBank} onChange={(v) => M('houseBank', v)} options={info.limits.houseBanks.map((x) => [x, `$${x}`])} />}
          <Seg label="Turn clock" value={money_.turnSec} onChange={(v) => M('turnSec', v)} options={info.limits.turnSecs.map((x) => [x, TURN[x]])} />
          <Seg label="Seats" value={money_.maxSeats} onChange={(v) => M('maxSeats', v)} options={info.limits.maxSeats.map((x) => [x, String(x)])} />
        </div>}
      </div>
      <div className="bj-foot"><EdgeCard e={prev?.edge} compact />
      <div className="bj-create"><span className="small dim">{prev ? `Bets $${prev.settings.minBet}–$${prev.settings.max}${house !== 'guntrad' ? ' (and never over a tenth of the bank)' : ''} · buy-in ${money(prev.settings.buyIn)}${prev.settings.continuous ? ' · continuous' : ''}` : ''}</span>
        <button className="btn ghost small" onClick={() => create()} disabled={!!prev?.problems?.length} data-test="bj-create">Open lobby</button>
        <button className="btn primary" onClick={() => create({ deal: true })} disabled={!!prev?.problems?.length} data-test="bj-create-deal" title="Create and start dealing">Open & deal →</button></div></div>
      {prev?.problems?.length > 0 && <p className="bj-warn" data-test="bj-problems">⊘ {prev.problems[0]}</p>}
    </div>
  );
  return (
    <div className="screen bj">
      <div className="panel bj-lobby">
        <div className="bj-head"><button className="btn ghost small" onClick={() => navigate('/')}>← Lobby</button><h1 className="western">Blackjack</h1><span className="bj-sub">Single deck · Play money only</span></div>
        {err && <p className="error" role="alert">{err}</p>}
        {narrow ? <>
          <div className="bj-sectabs top" role="tablist">{[['new', 'Start a table'], ['tables', `Your tables${info.tables.length ? ` (${info.tables.length})` : ''}`]].map(([k, l]) => <button key={k} data-test={`bj-tab-${k}`} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} data-test={`bj-tab-${k}`}>{l}</button>)}</div>
          {tab === 'new' ? form : tables}
        </> : <div className="bj-cols"><section>{form}</section><section><h3 className="western">Your tables</h3>{tables}</section></div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the table
function useView(code) {
  const [v, setV] = useState(null); const [err, setErr] = useState('');
  const load = async () => { try { setV(await api('GET', `/bj/tables/${code}`)); setErr(''); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(); const id = setInterval(load, 1500); return () => clearInterval(id); }, [code]);
  return [v, setV, err, setErr];
}

function BjTable({ code, me }) {
  const [v, setV, err, setErr] = useView(code);
  const [bet, setBet] = useState(() => Number(localStorage.getItem('bba.bj.bet')) || 0);
  const [side, setSide] = useState({ match: 0, pairs: 0 });
  const [muted, setMute] = useState(isMuted());
  const [show, setShow] = useState(() => (new URLSearchParams(location.search).get('sit') ? 'sit' : null));
  const [fx, setFx] = useState(null);
  const [shuf, setShuf] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const prev = useRef({});
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const r = v?.round;
  const showLast = !!(r && r.phase === 'betting' && v.last);
  const { shown, ready, tap, dealing } = useDealReveal(v, { showLast, reduced });

  useEffect(() => {
    if (!v) return;
    const p = prev.current;
    if (v.last && p.lastNo !== undefined && v.last.no !== p.lastNo) {
      setFx({ no: v.last.no, results: v.last.results }); setTimeout(() => setFx(null), reduced ? 1800 : 2600);
      const mine = v.last.results.filter((x) => v.seats[x.seat]?.me);
      if (mine.some((x) => x.out === 'blackjack')) sfx.bj(); else if (mine.some((x) => x.net > 0)) { sfx.win(); sfx.chip(); } else if (mine.some((x) => x.out === 'bust')) sfx.bust(); else if (mine.length) sfx.lose();
    }
    if (p.shuffles !== undefined && v.shuffles > p.shuffles) { const e = [...v.log].reverse().find((x) => x.ev?.k === 'shuffle'); setShuf(e?.text || 'New deck shuffled.'); setTimeout(() => setShuf(null), 3000); }
    prev.current = { shuffles: v.shuffles, lastNo: v.last?.no ?? null };
  }, [v?.seq, reduced]);
  useEffect(() => { if (v && !bet) setBet(v.limits.min); }, [!!v]);

  if (!v) return <div className="screen bj"><div className="panel bj-empty">{err || 'Shuffling…'}{err && <button className="btn small" onClick={() => navigate('/bj')}>Back</button>}</div></div>;

  const post = async (path, body) => { setErr(''); try { const res = await api('POST', `/bj/tables/${code}/${path}`, body); setV(res); if (['leave', 'close', 'join', 'start'].includes(path)) refreshSession(); return res; } catch (e) { setErr(e.message); return null; } };
  const act = async (action) => {
    if (busy || !ready) return;
    setBusy(true);
    try { await post('act', { action }); } finally { setBusy(false); }
  };

  const mine = v.mySeat >= 0 ? v.seats[v.mySeat] : null;
  const dealerCards = showLast ? v.last.dealer : r?.dealer || [];
  const dealerTotal = showLast ? v.last.dealerTotal : r?.dealerTotal;
  const handsOf = (seat) => (showLast
    ? (v.last.hands || []).map((h, i) => ({ ...h, i, total: null, res: v.last.results.find((x) => x.hand === i) })).filter((h) => h.seat === seat)
    : (r?.hands || []).filter((h) => h.seat === seat));
  const clock = r?.deadline ? left(r.deadline - now) : null;
  const maxNow = Math.min(v.limits.maxNow, mine?.chips ?? 0);
  const clampBet = (x) => Math.max(v.limits.min, Math.min(maxNow, x));
  const myBet = r?.bets?.[v.mySeat];
  const turnSeat = r?.phase === 'play' ? r.hands[r.turn]?.seat : null;
  const status = v.status === 'lobby' ? 'Waiting for the host to start'
    : v.status !== 'playing' ? 'Game over'
    : v.laneOver ? 'Your game is done'
    : !r ? (v.house.isMe ? `You're the house: ${Object.values(v.lanes || {}).filter((l) => l.bet > 0).length} hands in play` : 'Watching')
    : dealing ? 'Dealing…'
    : r.phase === 'betting' ? (myBet ? 'Bet down: waiting for the others' : mine ? 'Place your bet' : 'Betting')
    : r.phase === 'insurance' ? 'Dealer shows an ace: insurance?'
    : r.phase === 'play' ? (r.myTurn ? 'Your move' : `${v.seats[turnSeat]?.name} to act`) : 'Dealer plays';
  const ins = r?.myInsurance;
  const fxFor = (seat) => fx?.results.filter((x) => x.seat === seat) || [];
  const canSit = v.mySeat < 0 && !v.house.isMe && ['lobby', 'playing'].includes(v.status) && v.seats.some((x) => !x);
  const sit = () => (v.edge?.needsAck ? setShow('sit') : post('join', { ack: true }));

  return (
    <div className={`screen bj bj-t ${reduced ? 'rm' : ''}`} data-test="bj-table">
      <div className="panel bj-felt">
        <div className="bj-head">
          <button className="btn ghost small" onClick={() => navigate('/bj')} aria-label="Back">←</button>
          <h1 className="western" title={v.name}>{v.name}</h1>
          <span className="bj-sub mono">{v.code}</span>
          <div className="bj-head-r">
            {mine && <span className="bj-chips" data-test="bj-mychips">{money(mine.chips)}</span>}
            {v.edge && <button className={`btn ghost small bj-edgechip t-${v.edge.needsAck || v.edge.grandfathered ? 'poor' : v.edge.main.tone}`} onClick={() => setShow(show === 'edge' ? null : 'edge')} data-test="bj-edgechip">Edge {ept(v.edge.main.edge)}{v.edge.needsAck ? ' ⚠' : ''}</button>}
            <button className="btn ghost small" onClick={() => setShow(show === 'rules' ? null : 'rules')} data-test="bj-rules">Rules</button>
            {mine && <button className="btn ghost small" onClick={() => setShow(show === 'summary' ? null : 'summary')} data-test="bj-summary-btn">Session</button>}
            <button className="btn ghost small" aria-pressed={muted} onClick={() => { setMuted(!muted); setMute(!muted); }} data-test="bj-mute" title="Sound">{muted ? '🔇' : '♪'}</button>
            {v.isHost ? <button className="btn ghost small" onClick={() => post('close')} data-test="bj-close">Close</button>
              : (mine || v.house.isMe) ? <button className="btn ghost small" onClick={() => post('leave')} data-test="bj-leave">{v.house.isMe ? 'Close bank' : 'Cash out'}</button> : null}
          </div>
        </div>
        <div className="bj-status" data-test="bj-status"><span>{shuf ? <b className="bj-shuf" data-test="bj-shuffle">🂠 {shuf}</b> : status}</span>{clock && v.status === 'playing' && <span className="mono">⏱ {clock}</span>}{r && <span className="mono dim">Round {r.no}</span>}</div>
        <BjArena
          v={v}
          dealerCards={dealerCards}
          dealerTotal={dealerTotal}
          handsOf={handsOf}
          turnSeat={turnSeat}
          fxFor={fxFor}
          shown={shown}
          dealing={dealing}
          onTap={tap}
          reduced={reduced}
          onSit={canSit ? sit : null}
        />
        <div className="bj-bar" data-test="bj-bar">
          {v.status === 'lobby' ? <Lobby v={v} me={me} post={post} onSit={() => setShow('sit')} />
            : v.status !== 'playing' ? <span className="small">Game over. <button className="btn small" onClick={() => navigate('/bj')}>Back to blackjack</button></span>
            : v.laneOver ? <span className="small" data-test="bj-lane-over">{v.laneOver} <button className="btn small" onClick={() => post('leave')}>Cash out</button></span>
            : !mine ? <span className="small dim">{v.house.isMe ? 'You are the house: the cards follow the table rules.' : 'Watching.'} {!v.house.isMe && canSit && <button className="btn small" onClick={sit} data-test="bj-sit">Sit down</button>}</span>
            : ins && ready ? <div className="bj-acts"><span className="small">Insurance costs {money(Math.floor((r.hands.find((h) => h.seat === v.mySeat)?.bet || 0) / 2))}, pays 2:1</span><button className="btn" onClick={() => post('insure', { yes: true })} data-test="bj-ins-yes">Insure</button><button className="btn ghost" onClick={() => post('insure', { yes: false })} data-test="bj-ins-no">No thanks</button></div>
            : r.myTurn && ready ? <div className="bj-acts" data-test="bj-acts">
                <button className="btn primary" disabled={busy} onClick={() => act('hit')} data-test="bj-hit">Hit</button>
                <button className="btn" disabled={busy} onClick={() => act('stand')} data-test="bj-stand">Stand</button>
                <button className={`btn ${r.can?.double ? '' : 'bj-ghosted'}`} disabled={busy || !r.can?.double} onClick={() => act('double')} data-test="bj-double" aria-hidden={!r.can?.double} title="Double down: one more card, then you stand">Double</button>
                <button className={`btn ${r.can?.split ? '' : 'bj-ghosted'}`} disabled={busy || !r.can?.split} onClick={() => act('split')} data-test="bj-split" aria-hidden={!r.can?.split}>Split</button>
                <button className={`btn ghost ${r.can?.surrender ? '' : 'bj-ghosted'}`} disabled={busy || !r.can?.surrender} onClick={() => act('surrender')} data-test="bj-surrender" aria-hidden={!r.can?.surrender}>Surrender</button>
                <Sneak v={v} r={r} post={post} />
              </div>
            : r.phase === 'betting' && !myBet ? <BetBar min={v.limits.min} max={maxNow} royal={v.royal} bet={clampBet(bet)} setBet={(x) => setBet(clampBet(x))} side={side} setSide={setSide}
                onBet={(b, rs) => { localStorage.setItem('bba.bj.bet', String(b)); post('bet', { bet: b, royal: rs }); }} onSitout={v.continuous ? null : () => post('sitout')} />
            : <span className="small dim">{status}… {ready && <Sneak v={v} r={r} post={post} />}</span>}
        </div>
        {err && <p className="error bj-err" role="alert">{err}</p>}
        {show === 'sit' && v.mySeat < 0 && !v.house.isMe && ['lobby', 'playing'].includes(v.status) && <SitGate v={v} post={post} onClose={() => { setShow(null); history.replaceState(null, '', `/bj/${code}`); }} />}
        {show === 'edge' && <div className="bj-pop" data-test="bj-edge-pop" onClick={() => setShow(null)}><div className="panel bj-gate"><h3 className="western">House edge</h3><EdgeCard e={v.edge} /><p className="small dim">{v.edge.total.text}</p><button className="btn small">Close</button></div></div>}
        {show === 'rules' && <div className="bj-pop" data-test="bj-rules-pop" onClick={() => setShow(null)}><div className="panel"><h3 className="western">House rules</h3><ul>{v.ruleText.map((x) => <li key={x}>{x}</li>)}<li>Bets ${v.limits.min}–${v.limits.max}{v.house.mode !== 'guntrad' ? ', never over a tenth of the house bank' : ''}. Royal bets $1 up to your bet (max ${v.limits.royalMax}).</li>{['match', 'pairs'].filter((k) => v.royal[k]?.on).map((k) => <li key={k}>{k === 'match' ? `Royal Match: K-Q suited ${v.royal.match.royal}:1, suited ${v.royal.match.easy}:1` : `Royal Pairs: J/Q/K pair ${v.royal.pairs.royal}:1, other pair ${v.royal.pairs.pair}:1`} (house edge {pct(v.royal[k].edge)})</li>)}{v.continuous ? <li>Individual continuous play: your own single deck against the house, round after round; nobody waits on anyone.{v.house.mode !== 'guntrad' ? ' One bank covers every seat: each open bet holds back what it could win (2× the bet; a royal bet its top payout) and a bet that does not fit waits a hand.' : ''} No move in {TURN[v.turnSec]} stands.</li>
                : <li>Turn clock {TURN[v.turnSec]}: no bet in time sits you out; no move stands.</li>}</ul><button className="btn small">Close</button></div></div>}
        {show === 'summary' && mine && <Summary s={mine} onClose={() => setShow(null)} />}
        {v.final && <Final v={v} />}
      </div>
    </div>
  );
}

/** Easter egg: against a player dealer the royal chips never quite leave the felt. Tap one after you've seen your cards. */
function Sneak({ v, r, post }) {
  const b = r?.bets?.[v.mySeat];
  if (!r?.sneak || !b?.bet) return null;
  const amt = Math.min(v.limits.royalMax, b.bet);
  return ['match', 'pairs'].filter((k) => r.sneak[k]).map((k) => (
    <button key={k} type="button" className="bj-sneak" data-test={`bj-sneak-${k}`} aria-label={`${k === 'match' ? 'Royal Match' : 'Royal Pairs'} $${amt}`}
      onClick={() => post('sneak', { royal: { [k]: amt } })}>{k === 'match' ? '♛' : '♚'}<small>${amt}</small></button>));
}
function Summary({ s, onClose }) {
  const st = s.stats; const net = st.won - st.wagered;
  return (
    <div className="bj-pop" data-test="bj-summary" onClick={onClose}><div className="panel"><h3 className="western">Your session</h3>
      <dl className="bj-dl"><dt>Rounds</dt><dd>{st.rounds}</dd><dt>Wagered</dt><dd>{money(st.wagered)}</dd><dt>Paid back</dt><dd>{money(st.won)}</dd><dt>Net</dt><dd className={net >= 0 ? 'up' : 'down'}>{net >= 0 ? '+' : '−'}{money(Math.abs(net))}</dd><dt>Blackjacks</dt><dd>{st.bj}</dd><dt>Biggest win</dt><dd>{money(st.biggest)}</dd></dl>
      <button className="btn small">Close</button></div></div>
  );
}
function Final({ v }) {
  return (
    <div className="bj-pop final" data-test="bj-final"><div className="panel"><h3 className="western">Final standings</h3><p className="small">{v.final.why}</p>
      <ol className="bj-stand">{v.final.standings.map((x) => <li key={x.seat}><b>{x.name}</b><span className="mono">{money(x.chips)}</span><span className={`mono ${x.net >= 0 ? 'up' : 'down'}`}>{x.net >= 0 ? '+' : '−'}{money(Math.abs(x.net))}</span></li>)}
        {v.final.house && <li className="house"><b>{v.final.house.name} (house)</b><span className="mono">{money(v.final.house.bank)}</span><span className={`mono ${v.final.house.net >= 0 ? 'up' : 'down'}`}>{v.final.house.net >= 0 ? '+' : '−'}{money(Math.abs(v.final.house.net))}</span></li>}</ol>
      <p className="small dim">Chips went back to everyone's bankroll.</p>
      <button className="btn primary small" onClick={() => navigate('/bj')} data-test="bj-final-back">Back to blackjack</button></div></div>
  );
}
function Lobby({ v, me, post, onSit }) {
  const people = v.seats.filter((s) => s && !s.bot);
  // v51: skip the house-edge gate when the table does not need an ack — one tap to sit.
  const sit = () => (v.edge?.needsAck ? onSit() : post('join', { ack: true }));
  return (
    <div className="bj-acts" data-test="bj-lobby">
      <span className="small">Invite <b className="mono" data-test="bj-code">{v.code}</b></span>
      {v.isHost && v.house.mode === 'player' && !v.house.id && <span className="small">House: {people.filter((s) => !s.me).map((s) => <button key={s.i} className="btn small" onClick={() => post('house', { playerId: s.id })}>{s.name}</button>)} or wait</span>}
      {v.isHost ? <button className="btn primary" onClick={() => post('start')} data-test="bj-start">Start dealing</button> : <span className="small dim">Waiting for the host…</span>}
      {v.mySeat < 0 && !v.house.isMe && <button className="btn small" onClick={sit} data-test="bj-sit">Sit down</button>}
      <span className="sr-only">{me.name}</span>
    </div>
  );
}
