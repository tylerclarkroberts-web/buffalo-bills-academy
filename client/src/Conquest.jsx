import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, refreshSession, useSession } from './api.js';
import { SignIn } from './Home.jsx';
import { money } from './util.js';
import './conquest.css';

const cash = (cents) => money(cents / 100);
const status = { pending: 'Confirming — stake held', accepted: 'Bet placed', won: 'Won', lost: 'Lost', void: 'Voided — stake refunded', rejected: 'Not placed — stake refunded' };
const when = (t) => new Date(t).toLocaleString();

function countdown(deadline, now) {
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Market({ market, now, link, canBet, busy, ownBet, onQuote }) {
  const self = market.participants.some((p) => p.userId === link?.conquestUserId);
  const choices = market.outcomes.filter((p) => !self || p.userId === link?.conquestUserId);
  const [outcome, setOutcome] = useState(choices[0]?.userId || '');
  const [stake, setStake] = useState('10');
  const selected = choices.find((p) => p.userId === outcome) || choices[0];
  const open = market.status === 'open' && Date.parse(market.closesAt) > now;
  const submit = (e) => { e.preventDefault(); onQuote({ marketId: market.id, outcomeUserId: selected?.userId, stakeCents: Math.round(Number(stake) * 100) }); };
  return <article className="risk-market">
    <div className="risk-market-head"><div><h2>{market.gameName}</h2><a href={market.gameUrl}>Open match in ConquestK ↗</a></div><span className="risk-clock">{open ? `Closes in ${countdown(market.closesAt, now)}` : market.terminal ? 'Finished' : 'Betting closed'}</span></div>
    <div className="risk-outcomes" aria-label="Fixed odds">
      {market.outcomes.map((p) => <div key={p.userId}><span>{p.name}<small>CR {p.rating}</small></span><b>{p.oddsHundredths ? `${(p.oddsHundredths / 100).toFixed(2)}×` : 'Unavailable'}</b></div>)}
    </div>
    {ownBet ? <p className="risk-notice">{status[ownBet.state]} · {ownBet.outcomeName} · {cash(ownBet.stakeCents)}</p>
      : open && canBet && link?.active ? <form className="risk-slip" onSubmit={submit}>
        <label>Back to win<select value={selected?.userId || ''} onChange={(e) => setOutcome(e.target.value)}>{choices.map((p) => <option key={p.userId} value={p.userId} disabled={!p.oddsHundredths}>{p.name}{!p.oddsHundredths ? ' — unavailable' : ''}</option>)}</select></label>
        <label>Play-money stake<input type="number" min="1" max={(selected?.maxStakeCents || 0) / 100} step="0.01" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} required /></label>
        <button className="btn light" disabled={busy || !selected?.oddsHundredths}>Review bet</button>
        <p className="small muted">{self ? 'You can only back yourself. ' : ''}Maximum {cash(selected?.maxStakeCents || 0)} for this outcome. One bet, with no changes or cancellation after placing.</p>
      </form> : null}
  </article>;
}

export default function Conquest() {
  const { me, loading } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => new URLSearchParams(window.location.search).has('linked') ? 'Your accounts are linked.' : '');
  const [quote, setQuote] = useState(null);
  const reviewBox = useRef(null);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    const result = await api('GET', '/conquest'); setData(result);
    setOffset(Date.parse(result.serverTime) - Date.now());
  }, []);
  useEffect(() => {
    document.title = "Risk bets · Buffalo Bill's Academy";
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => { refresh().catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, [refresh, me?.id]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now() + offset), 1000); return () => clearInterval(timer); }, [offset]);
  useEffect(() => { if (quote) { reviewBox.current?.focus(); reviewBox.current?.scrollIntoView({ block: 'nearest' }); } }, [quote]);
  useEffect(() => { if (Number.isFinite(data?.bankroll) && me && data.bankroll !== me.bankroll) refreshSession().catch(() => {}); }, [data?.bankroll, me?.bankroll]);
  useEffect(() => { if (new URLSearchParams(window.location.search).has('linkError')) setError('The account link could not be completed. Sign in to both sites and try linking again.'); }, []);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const review = (body) => run(async () => { const r = await api('POST', '/conquest/quotes', body); setQuote(r.quote); });
  const place = () => run(async () => {
    const r = await api('POST', '/conquest/bets', { quoteId: quote.id }); setQuote(null);
    setNotice(r.bet.state === 'pending' ? 'Your stake is held while ConquestK confirms the bet. It will appear below; do not place it again.' : status[r.bet.state]);
    await Promise.all([refresh(), refreshSession()]);
  });
  const link = () => run(async () => { const r = await api('POST', '/conquest/link', {}); window.location.assign(r.authorizeUrl); });
  const unlink = () => run(async () => { await api('POST', '/conquest/unlink', {}); setNotice('Your accounts are unlinked.'); await refresh(); });
  const eligible = data?.markets.filter((m) => m.status === 'open' || m.status === 'closed' || m.status === 'started') || [];
  return <div className="screen risk-page">
    <div className="risk-heading"><div><p className="kicker">The Academy sportsbook · Play money only</p><h1 className="display h2">Conquest<span className="script neon-pink">K</span></h1><p>Back a winner before the first turn.</p></div><a className="btn light" href={data?.conquestUrl || 'https://conquestk.com'}>Play ConquestK ↗</a></div>
    {error && <div className="error" role="alert">{error}</div>}
    {notice && <div className="risk-notice" role="status">{notice}</div>}
    {!data ? <p>Loading matches…</p> : <>
      {!data.connected && <p className="risk-notice">Risk betting is temporarily unavailable. Existing bets stay recorded and will update when the connection returns.</p>}
      <section className="risk-account" aria-label="Your betting account">
        {!loading && !me?.signedIn ? <><p>Sign in with an Academy account, then link your ConquestK account to place bets.</p><SignIn next="/conquest" /></>
          : me ? <><div><b>{me.name}</b><p>{money(data.bankroll ?? me.bankroll)} spendable · {money(data.escrow)} in unsettled Risk stakes</p><p>{data.link?.active ? `Linked to ${data.link.conquestName}` : 'Your game accounts stay separate; linking proves they both belong to you.'}</p></div>
            <button className="btn" disabled={busy || !data.connected} onClick={data.link?.active ? unlink : link}>{data.link?.active ? 'Unlink accounts' : 'Link ConquestK account'}</button><p className="small muted">Link and bet history is retained. Account removal afterward requires operator-assisted anonymization.</p></> : null}
        {me?.signedIn && !data.canBet && data.connected && <p className="small muted">New bets are not available for this account right now. Existing bets will still settle.</p>}
      </section>
      {quote && <section ref={reviewBox} className="risk-confirm" aria-label="Review your bet" tabIndex={-1}>
        <h2>Review your bet</h2><p><b>{quote.outcomeName}</b> to win {quote.gameName}</p>
        <dl><div><dt>Stake</dt><dd>{cash(quote.stakeCents)}</dd></div><div><dt>Fixed odds</dt><dd>{(quote.oddsHundredths / 100).toFixed(2)}×</dd></div><div><dt>Total return if you win</dt><dd>{cash(quote.grossCents)}</dd></div><div><dt>Net profit if you win</dt><dd>{cash(quote.grossCents - quote.stakeCents)}</dd></div></dl>
        <p className="small">Total return includes your stake. A loss returns $0; a void refunds the stake. No changes or cancellation after placing. This quote expires in {countdown(quote.expiresAt, now)}.</p>
        <div className="row"><button className="btn light" disabled={busy || Date.parse(quote.expiresAt) <= now} onClick={place}>{busy ? 'Placing…' : `Place ${cash(quote.stakeCents)} bet`}</button><button className="btn ghost" disabled={busy} onClick={() => setQuote(null)}>Back</button></div>
      </section>}
      <section aria-label="Matches"><h2>Matches</h2>{eligible.length ? <div className="risk-markets">{eligible.map((m) => <Market key={m.id} market={m} now={now} link={data.link} canBet={data.canBet && data.connected} busy={busy} ownBet={data.bets.find((b) => b.marketId === m.id && b.state !== 'rejected')} onQuote={review} />)}</div>
        : <p className="muted">No matches are taking bets. A two-minute betting window opens when an eligible public Classic match fills with human players.</p>}</section>
      <section aria-label="Your bet history"><h2>Your bets</h2>{data.bets.length ? <div className="risk-history">{data.bets.map((b) => <article key={b.id}><div><b>{b.gameName}</b><p>{b.outcomeName} · {cash(b.stakeCents)} at {(b.oddsHundredths / 100).toFixed(2)}×</p><small>{when(b.createdAt)}</small></div><div><strong>{status[b.state]}</strong><p>{b.state === 'won' ? `${cash(b.grossCents)} returned` : ['void', 'rejected'].includes(b.state) ? `${cash(b.stakeCents)} refunded` : ['pending', 'accepted'].includes(b.state) ? `${cash(b.grossCents)} possible total return` : '$0 returned'}</p><a href={b.gameUrl}>Open match ↗</a></div></article>)}</div> : <p className="muted">Your bets will appear here. Other players cannot see your bet history.</p>}</section>
      <details className="risk-rules"><summary>How the odds and limits work</summary><p>Odds use the players’ Conquest Rankings when the market opens. They are estimates, not proven win probabilities. Fair returns receive a 5% haircut and are rounded down; odds are capped at 20×. Outcomes below 1.01× are unavailable.</p><p>Stake $1–$100 once per match, with a maximum $1,000 total return. House limits may reduce availability. Players may only back themselves; spectators may back any listed player. Bets close before play and never change the match or its rating.</p><p>Changed rosters or settings, cancelled or invalid matches, failed starts, and games without a valid winner within 30 days are voided. Connection delays do not cancel a bet. No purchases, transfers, or cash withdrawals; all balances are play money.</p></details>
    </>}
  </div>;
}
