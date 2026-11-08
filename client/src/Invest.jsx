import React, { useEffect, useState } from 'react';
import { api, useSession, refreshSession } from './api.js';
import { SignIn } from './Home.jsx';
import { Tabs, useWide } from './ui.jsx';
import { money, price, units as fmtUnits } from './util.js';

const BLURB = {
  DOGE: 'The original joke coin. Your play money rises and falls with the real Dogecoin price.',
  NSKT: 'Nisket Coin, a pump.fun coin on Solana. Tiny, wild, and very likely to swing hard.',
};

export function Sparkline({ series, color }) {
  if (!series || series.length < 2) return <div className="spark muted small" style={{ display: 'grid', placeItems: 'center', border: '1px dashed var(--line)' }}>Price history builds up, one point every 5 minutes.</div>;
  const W = 600, H = 110;
  const xs = series.map((p) => p[0]), ys = series.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (x) => ((x - x0) / (x1 - x0 || 1)) * W;
  const Y = (y) => H - 6 - ((y - y0) / (y1 - y0 || 1)) * (H - 12);
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Price from ${price(ys[0])} to ${price(ys[ys.length - 1])}`}>
      <path className="area" d={`${d} L${W} ${H} L0 ${H} Z`} fill={color} />
      <path className="line" d={d} stroke={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Invest() {
  const { me } = useSession();
  const wide = useWide();
  const [m, setM] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [sym, setSym] = useState('DOGE');
  const load = () => api('GET', '/market').then(setM).catch((e) => setErr(e.message));
  useEffect(() => { document.title = "Invest · Buffalo Bill's Academy"; load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [me?.id]);
  const trade = async (path, body) => {
    setErr(''); setMsg('');
    try {
      const r = await api('POST', `/market/${path}`, body);
      setMsg(path === 'buy' ? `Bought ${fmtUnits(r.units)} ${r.sym} at ${price(r.price)}.` : `Sold ${fmtUnits(r.units)} ${r.sym} for ${money(r.proceeds)} (${money(r.realized, { sign: true })}).`);
      await Promise.all([load(), refreshSession()]);
      return true;
    } catch (e) { setErr(e.message); return false; }
  };
  const syms = wide ? ['DOGE', 'NSKT'] : [sym];
  return (
    <div className="screen invest">
      <div className="page-head">
        <h1 className="display h2">Invest</h1>
        <p className="kicker">Two coins. Real prices. Fake money.</p>
        <span className="disclaimer-strip">Play-money simulation · not financial advice</span>
      </div>
      {!wide && <Tabs label="Coins" value={sym} onChange={setSym} tabs={[['DOGE', 'DOGE'], ['NSKT', 'NSKT']]} />}
      {err && <div className="error" onClick={() => setErr('')} role="alert">{err}</div>}
      {msg && <div className="banner" role="status" onClick={() => setMsg('')}>{msg}</div>}
      {!m ? <p className="muted">Loading prices…</p> : (
        <div className="assets">
          {syms.map((s) => <Asset key={s} q={m.quotes[s]} h={m.portfolio?.holdings?.[s]} bankroll={m.bankroll} signedIn={!!me} onTrade={trade} />)}
        </div>
      )}
      {!me && <SignIn compact next="/invest" />}
      <p className="small muted foot-note">Your holdings move with the live price and count toward net worth. DOGE price from CoinGecko (Coinbase backup). NSKT from Jupiter, DexScreener or the coin's pump.fun bonding curve on Solana. Refreshed at most once a minute; if a source is down, the last known price is used.</p>
    </div>
  );
}

function Asset({ q, h, bankroll, signedIn, onTrade }) {
  const [usd, setUsd] = useState('');
  const [sell, setSell] = useState('');
  const color = q.sym === 'DOGE' ? '#ffb020' : '#ff3b30';
  const first = q.series?.[0]?.[1];
  const chg = first && q.price ? q.price / first - 1 : null;
  const held = h?.units || 0;
  return (
    <div className="asset">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><p className="kicker">{q.name}</p><div className="sym display">{q.sym}</div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="px">{q.available ? price(q.price) : '—'}</div>
          {chg !== null && <div className={`chg ${chg >= 0 ? 'pos' : 'neg'}`}>{chg >= 0 ? '+' : '−'}{Math.abs(chg * 100).toFixed(2)}% <span className="muted">since tracking</span></div>}
          {q.stale && <div className="small amber">Last known price</div>}
        </div>
      </div>
      <p className="muted blurb">{BLURB[q.sym]}</p>
      {q.available ? <Sparkline series={q.series} color={color} /> : (
        <div className="unavail">No price right now. Trading pauses until the price feed is back.</div>
      )}
      {signedIn && (
        <>
          <div className="hold">
            <div><span className="kicker">You own</span><b>{held ? fmtUnits(held) : '0'}</b></div>
            <div><span className="kicker">Value</span><b>{money(h?.value ?? 0)}</b></div>
            <div><span className="kicker">P&L</span><b className={h?.unrealized > 0 ? 'pos' : h?.unrealized < 0 ? 'neg' : ''}>{held ? money(h.unrealized, { sign: true }) : '—'}</b></div>
          </div>
          {q.available && (
            <div className="trade">
              <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await onTrade('buy', { sym: q.sym, usd: Number(usd) })) setUsd(''); }}>
                <input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value.replace(/[^\d.]/g, ''))} placeholder="$ amount" aria-label={`Dollars of ${q.sym} to buy`} />
                <button className="btn primary" disabled={!(Number(usd) > 0)}>Buy</button>
              </form>
              <div className="pills">{[10, 50, 100, 500].map((v) => <button key={v} className="pill" onClick={() => setUsd(String(v))}>${v}</button>)}<button className="pill" onClick={() => setUsd(String(Math.floor((bankroll || 0) * 100) / 100))}>Max</button></div>
              {held > 0 && (
                <>
                  <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await onTrade('sell', { sym: q.sym, units: Number(sell) })) setSell(''); }}>
                    <input inputMode="decimal" value={sell} onChange={(e) => setSell(e.target.value.replace(/[^\d.]/g, ''))} placeholder={`${q.sym} units`} aria-label={`Units of ${q.sym} to sell`} />
                    <button className="btn" disabled={!(Number(sell) > 0)}>Sell</button>
                  </form>
                  <div className="pills">{[0.25, 0.5].map((f) => <button key={f} className="pill" onClick={() => setSell(String(held * f))}>{f * 100}%</button>)}<button className="pill" onClick={() => onTrade('sell', { sym: q.sym, all: true })}>Sell all</button></div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
