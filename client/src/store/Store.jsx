// v34: the General Store. Play money only. Item pages fit the shelf; the counter scrolls when its description,
// try-on and buttons need more space.
// The server decides everything (prices, what you own, what you can afford); this page only shows it.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, useSession, refreshSession } from '../api.js';
import { SignIn } from '../Home.jsx';
import { navigate } from '../App.jsx';
import { Bust } from '../avatar/Bust.jsx';
import { BY_ID } from '../../../server/engine/creatures.js';
import { drawBug } from '../barn/sprite.js';
import { PixIcon, LowPoly } from './PixIcon.jsx';
import { FitControls, useFitSaver } from '../avatar/FitEditor.jsx';
import './store.css';

const money = (n) => `$${Number(n).toLocaleString('en-US')}`;
const TIER = (p) => (p >= 20000 ? 'crazy' : p >= 1500 ? 'expensive' : p >= 300 ? 'medium' : 'cheap');
const lookOf = (x) => (x.look ? { id: x.id, ...x.look } : x.pal ? { id: x.id, pal: x.pal } : x.shape ? { id: x.id, shape: x.shape } : { id: x.id });
const CONSUMABLE = (x) => !!x.use;
const ONCE = (x) => !!x.once; // gags (and tobacco): one at a time, used up when used
const FITTABLE = (x) => x?.kind === 'avatar' && x.slot !== 'skin';
const BUG_LOOK = ['bugskin', 'bughat', 'bugacc'];
const MONTH = (m) => new Date(2000, m - 1, 15).toLocaleString('en-US', { month: 'long' });

function BugThumb({ species, style, size }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; const bug = BY_ID[species]; if (!c || !bug) return;
    const d = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = Math.round(size * d);
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); drawBug(x, bug, { w: c.width, h: c.height, still: true, fill: 0.9, style });
  }, [species, JSON.stringify(style), size]);
  return <canvas ref={ref} className="st-bug" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** The little picture on a card or on the counter. Avatar items are shown on your own bust. */
function Thumb({ x, me, eqWear, pen, size, fit }) {
  if (x.kind === 'avatar') return <Bust id={me.id} avatar={{ ...me.avatar, wear: { ...eqWear, [x.slot]: { ...lookOf(x), fit: fit?.[x.id] } } }} size={size * 0.86} still />;
  if (BUG_LOOK.includes(x.slot) && pen?.species) return <BugThumb species={pen.species} style={{ ...(pen.style || {}), [x.slot]: lookOf(x) }} size={size} />;
  if (x.pal) return <span className="st-pal">{x.pal.map((c) => <i key={c} style={{ background: c }} />)}</span>;
  if (x.art) return <LowPoly art={x.art} size={size} fallback={x.emoji} className="st-pix" />;
  if (x.pix) return <PixIcon pix={x.pix} size={size} fallback={x.emoji} className="st-pix" />;
  return <span className="st-emoji" style={{ fontSize: size * 0.5 }}>{x.emoji || '🎁'}</span>;
}

export default function Store() {
  const { me } = useSession();
  const [v, setV] = useState(null);
  const [pen, setPen] = useState(null);
  const [tab, setTab] = useState('hats');
  const [pg, setPg] = useState(0);
  const [sel, setSel] = useState(null);
  const [ask, setAsk] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [fit, setFit] = useState({ cols: 3, rows: 3 });
  const gridRef = useRef(null);
  const [fitOpen, setFitOpen] = useState(false);
  const [fits, setFitOf, resetFit, fitStatus] = useFitSaver(v?.fit, (r) => setV(r));
  const load = async () => {
    const [s, b] = await Promise.all([api('GET', '/shop'), api('GET', '/barn').catch(() => null)]);
    setV(s); setPen(b?.pen?.stage === 'creature' ? b.pen : null);
  };
  useEffect(() => { document.title = "General Store · Buffalo Bill's Academy"; if (me) load().catch((e) => setErr(e.message)); }, [me?.id]);
  // how many cards fit: measured, so the page never scrolls at any size
  useLayoutEffect(() => {
    const el = gridRef.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect(); const small = r.width < 420;
      const cw = small ? 104 : 132, ch = small ? 100 : 118;
      setFit({ cols: Math.max(2, Math.floor((r.width + 8) / (cw + 8))), rows: Math.max(1, Math.floor((r.height + 8) / (ch + 8))) });
    });
    ro.observe(el); return () => ro.disconnect();
  }, [!!v]);
  const items = useMemo(() => (v ? v.items.filter((x) => x.cat === tab) : []), [v, tab]);
  const per = fit.cols * fit.rows; const pages = Math.max(1, Math.ceil(items.length / per));
  useEffect(() => { if (pg >= pages) setPg(pages - 1); }, [pages]);
  useEffect(() => { setPg(0); }, [tab]);
  if (!me) return <div className="screen store"><div className="store-empty panel"><h1 className="western">General Store</h1><p>Sign in to shop.</p><SignIn /></div></div>;
  if (!v) return <div className="screen store"><div className="store-empty muted">{err || 'Unlocking the front door…'}</div></div>;
  const eqWear = Object.fromEntries(Object.entries(v.eq).map(([slot, id]) => [slot, { ...lookOf(v.items.find((i) => i.id === id) || { id }), fit: fits[id] }]).filter(([s]) => !BUG_LOOK.includes(s)));
  const cur = sel && v.items.find((x) => x.id === sel);
  const shown = items.slice(pg * per, pg * per + per);
  const run = async (fn, ok) => { setErr(''); setMsg(''); try { const r = await fn(); setV(r); if (ok) setMsg(ok); refreshSession(); if (BUG_LOOK.includes(cur?.slot) || cur?.use || cur?.slot === 'toy' || cur?.slot === 'gear') { const b = await api('GET', '/barn').catch(() => null); setPen(b?.pen?.stage === 'creature' ? b.pen : null); } } catch (e) { setErr(e.message); } };
  const buy = (x, confirm = false) => {
    if (x.price > v.confirmOver && !confirm) { setAsk(x); return; }
    setAsk(null); run(() => api('POST', '/shop/buy', { id: x.id, confirm }), `Bought: ${x.name}.${x.slot && !v.eq[x.slot] ? ' Wearing it now.' : ''}`);
  };
  const owned = cur ? v.own[cur.id] || 0 : 0;
  const wearing = cur && cur.slot && v.eq[cur.slot] === cur.id;
  const takenBy = cur && !owned ? v.taken?.[cur.id] : null; // one of a kind, and somebody else got there first
  return (
    <div className="screen store" data-test="store">
      <div className="store-wrap panel">
        <header className="store-head">
          <h1 className="western">General Store</h1>
          <span className="store-cash" data-test="store-cash">{money(v.bankroll)}</span>
        </header>
        <nav className="store-tabs" role="tablist" aria-label="Departments">
          {v.tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setSel(null); }} data-test={`stab-${t.id}`}>{t.label}</button>)}
          {!v.hatched && <span className="store-locked muted" data-test="store-bug-locked">Bug supplies unlock when your egg hatches.</span>}
        </nav>
        <section className="store-shelf">
          {tab === 'tobacco' && <p className="store-notice" role="note" data-test="store-tobacco-notice"><b>18+</b> {v.tobaccoNotice} Cartoon only; play money only.</p>}
          <div className="store-grid" ref={gridRef} style={{ gridTemplateColumns: `repeat(${fit.cols}, 1fr)`, gridTemplateRows: `repeat(${fit.rows}, 1fr)` }} data-test="store-grid">
            {shown.map((x) => (
              <button key={x.id} className={`store-card t-${TIER(x.price)} ${sel === x.id ? 'sel' : ''} ${v.own[x.id] ? 'own' : ''}`} onClick={() => { setSel(x.id); setMsg(''); setErr(''); setFitOpen(false); }} data-test="store-item" data-id={x.id}>
                <span className="sc-pic"><Thumb x={x} me={me} eqWear={eqWear} pen={pen} size={64} fit={fits} /></span>
                <span className="sc-name">{x.name}</span>
                {x.adult && <span className="sc-adult" title={v.tobaccoNotice}>18+</span>}
                <span className="sc-price num">{v.own[x.id] && ONCE(x) ? 'In your pocket' : v.own[x.id] && !CONSUMABLE(x) ? (v.eq[x.slot] === x.id ? 'Wearing' : 'Owned') : v.taken?.[x.id] ? 'Taken' : money(x.price)}</span>
              </button>
            ))}
          </div>
          <div className="store-pager">
            <button className="btn ghost small" onClick={() => setPg(Math.max(0, pg - 1))} disabled={pg === 0} aria-label="Previous page" data-test="store-prev">‹</button>
            <span className="small num" data-test="store-count">{pg + 1} / {pages}</span>
            <button className="btn ghost small" onClick={() => setPg(Math.min(pages - 1, pg + 1))} disabled={pg >= pages - 1} aria-label="Next page" data-test="store-next">›</button>
          </div>
        </section>
        <aside className={`store-counter ${cur ? 'open' : ''}`} data-test="store-detail">
          {cur ? (
            <>
              <button className="store-close btn ghost small" onClick={() => setSel(null)} aria-label="Close">×</button>
              <div className="sd-pic"><Thumb x={cur} me={me} eqWear={eqWear} pen={pen} size={120} fit={fits} /></div>
              <div className="sd-text">
                <h2>{cur.name}</h2>
                <p className="sd-price"><b className="num">{money(cur.price)}</b> <span className={`tier t-${TIER(cur.price)}`}>{TIER(cur.price)}</span>{owned ? <span className="muted"> · you have {CONSUMABLE(cur) && !ONCE(cur) ? owned : 'it'}</span> : null}</p>
                {fitOpen && owned && FITTABLE(cur) ? <><FitControls compact value={fits[cur.id]} onChange={(f) => setFitOf(cur.id, f)} onReset={() => resetFit(cur.id)} /><p className="small muted" data-test="fit-status">{fitStatus || 'Saved as you go; shows at every table.'}</p></> : <p className={`sd-desc ${cur.kind === 'tobacco' ? 'tob' : ''}`}>{cur.desc}</p>}
                {cur.kind === 'absurd' && <p className="small muted">{cur.unique ? 'One of a kind · ' : ''}{cur.month ? `Sold in ${MONTH(cur.month)} only · ` : ''}Room decoration · no gameplay bonus.</p>}
                {takenBy && <p data-test="store-taken"><b>{takenBy}</b> has it.</p>}
                <div className="sd-acts">
                  {owned && cur.kind === 'absurd' && <button className="btn ghost" onClick={() => navigate('/room')}>Display in My Room</button>}
                  {!takenBy && (!owned || (CONSUMABLE(cur) && !ONCE(cur))) && <button className="btn" onClick={() => buy(cur)} disabled={v.bankroll < cur.price} data-test="store-buy">{v.bankroll < cur.price ? 'Not enough cash' : `Buy · ${money(cur.price)}`}</button>}
                  {owned && cur.slot && !wearing ? <button className="btn ghost" onClick={() => run(() => api('POST', '/shop/equip', { id: cur.id }), 'On it goes.')} data-test="store-equip">Wear</button> : null}
                  {owned && wearing ? <button className="btn ghost" onClick={() => run(() => api('POST', '/shop/equip', { id: null, slot: cur.slot }), 'Taken off.')} data-test="store-unequip">Take off</button> : null}
                  {owned && FITTABLE(cur) ? <button className={`btn ${fitOpen ? '' : 'ghost'}`} onClick={() => setFitOpen(!fitOpen)} aria-pressed={fitOpen} data-test="store-fit">{fitOpen ? 'Done' : 'Adjust fit'}</button> : null}
                  {owned && cur.use ? <button className="btn ghost" onClick={() => run(() => api('POST', '/shop/use', { id: cur.id }), cur.use === 'feeder' ? 'Feeder stocked. Your bug won\'t go hungry for a while.' : 'Your bug appreciates that.')} data-test="store-use">Use</button> : null}
                </div>
                {cur.kind === 'tobacco' && <p className="small sd-warn" data-test="store-tobacco-item-notice"><b>18+</b> {v.tobaccoNotice}</p>}
                {cur.kind === 'tobacco' && <p className="small muted tob" data-test="store-once">{owned ? 'In your pocket. ' : ''}One-time use: at a table, tap Light up and Guntrad brings the lighter. Everyone watching sees it once. It never changes a hand.</p>}
                {cur.kind === 'gag' && <p className="small muted" data-test="store-once">{owned ? 'In your pocket. ' : ''}One-time use: fire it at a table (Gag button), then buy another. You can hold one of each. Harmless; it never changes a hand.</p>}
              </div>
            </>
          ) : (
            <div className="sd-hello">
              <Bust id={me.id} avatar={me.avatar} size={96} still />
              <p>Pick anything to try it on. Everything here is play money and changes nothing about your cards.</p>
            </div>
          )}
          <p className="store-msg" role="status">{err ? <span className="err">{err}</span> : msg}</p>
        </aside>
      </div>
      {ask && (
        <div className="store-ask" role="dialog" aria-modal="true" data-test="store-confirm">
          <div className="panel">
            <h2>Big purchase</h2>
            {ask.adult && <p className="small sd-warn"><b>18+</b> {v.tobaccoNotice}</p>}
            <p>{ask.name} costs <b className="num">{money(ask.price)}</b> of play money. You'll have {money(v.bankroll - ask.price)} left.</p>
            <div className="sd-acts"><button className="btn" onClick={() => buy(ask, true)} data-test="store-confirm-yes">Buy it</button><button className="btn ghost" onClick={() => setAsk(null)}>Never mind</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
