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
import { DEPARTMENTS, categoriesFor } from './departments.js';
import './store.css';

const money = (n) => `$${Number(n).toLocaleString('en-US')}`;
const TIER = (p) => (p >= 20000 ? 'crazy' : p >= 1500 ? 'expensive' : p >= 300 ? 'medium' : 'cheap');
const lookOf = (x) => (x.look ? { id: x.id, ...x.look } : x.pal ? { id: x.id, pal: x.pal } : x.shape ? { id: x.id, shape: x.shape } : { id: x.id });
const CONSUMABLE = (x) => !!x.use;
const ONCE = (x) => !!x.once; // gags (and tobacco): one at a time, used up when used
const FITTABLE = (x) => x?.kind === 'avatar' && x.slot !== 'skin';
const BUG_LOOK = ['bugskin', 'bughat', 'bugacc'];
const BATTLE_GEAR = ['gear', 'defense']; // one attack item and one defense item, both drawn on the bug
const WORN = [...BUG_LOOK, ...BATTLE_GEAR]; // worn by one bug: each of yours has its own
const DAY = 86400e3;
/** Gym gear on the picked bug: ms left (gear), or what creatine is doing. Lives on the bug, read from /barn. */
const gymOn = (x, pen) => (!x?.gym || !pen ? null : x.gym === 'creatine' ? (pen.gym?.creatine ? 'waiting' : pen.gym?.short ? 'in it' : null) : pen.gym?.gear?.[x.gym] || null);
const gymLabel = (x, pen) => { const o = gymOn(x, pen); return o == null ? null : typeof o === 'string' ? (o === 'waiting' ? 'Scoop waiting' : '12h clock') : `${Math.ceil(o / DAY)}d left`; };
const MONTH = (m) => new Date(2000, m - 1, 15).toLocaleString('en-US', { month: 'long' });

function BugThumb({ species, style, size, level }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; const bug = BY_ID[species]; if (!c || !bug) return;
    const d = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = Math.round(size * d);
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); drawBug(x, bug, { w: c.width, h: c.height, still: true, fill: 0.9, style, level });
  }, [species, JSON.stringify(style), size, level]);
  return <canvas ref={ref} className="st-bug" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** The little picture on a card or on the counter. Avatar items are shown on your own bust. */
function Thumb({ x, me, eqWear, pen, size, fit }) {
  if (x.kind === 'avatar') return <Bust id={me.id} avatar={{ ...me.avatar, wear: { ...eqWear, [x.slot]: { ...lookOf(x), fit: fit?.[x.id] } } }} size={size * 0.86} still />;
  if (BUG_LOOK.includes(x.slot) && pen?.species) return <BugThumb species={pen.species} style={{ ...(pen.style || {}), [x.slot]: lookOf(x) }} size={size} level={pen.level} />;
  if (BATTLE_GEAR.includes(x.slot) && pen?.species) return <BugThumb species={pen.species} style={{ ...(pen.style || {}), [x.slot]: { id: x.id, shape: x.id.slice(5) } }} size={size} level={pen.level} />;
  if (x.pal) return <span className="st-pal">{x.pal.map((c) => <i key={c} style={{ background: c }} />)}</span>;
  if (x.art) return <LowPoly art={x.art} size={size} fallback={x.emoji} className="st-pix" />;
  if (x.pix) return <PixIcon pix={x.pix} size={size} fallback={x.emoji} className="st-pix" />;
  return <span className="st-emoji" style={{ fontSize: size * 0.5 }}>{x.emoji || '🎁'}</span>;
}

export default function Store() {
  const { me } = useSession();
  const [v, setV] = useState(null);
  const [bugs, setBugs] = useState([]); // your living bugs, partner first
  const [bugId, setBugId] = useState(null);
  const pen = bugs.find((b) => b.id === bugId) || bugs[0] || null; // the one being dressed
  const readBugs = (b) => setBugs((b?.stable?.bugs || []).filter((bug) => bug.stage === 'creature'));
  const [departmentId, setDepartmentId] = useState('appearance');
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
    setV(s); readBugs(b);
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
  const department = DEPARTMENTS.find((d) => d.id === departmentId);
  const categories = categoriesFor(department, v?.tabs || []);
  const category = categories.find((t) => t.id === tab) || categories[0];
  const items = useMemo(() => (v ? v.items.filter((x) => x.cat === category?.id) : []), [v, category?.id]);
  const per = fit.cols * fit.rows; const pages = Math.max(1, Math.ceil(items.length / per));
  useEffect(() => { if (pg >= pages) setPg(pages - 1); }, [pages]);
  useEffect(() => { setPg(0); setSel(null); }, [departmentId, category?.id]);
  if (!me) return <div className="screen store"><div className="store-empty panel"><h1 className="western">General Store</h1><p>Sign in to shop.</p><SignIn /></div></div>;
  if (!v) return <div className="screen store"><div className="store-empty muted" role="status">{err || 'Unlocking the front door…'}{err && <p><button className="btn ghost" onClick={() => { setErr(''); load().catch((e) => setErr(e.message)); }}>Try again</button></p>}</div></div>;
  const eqWear = Object.fromEntries(Object.entries(v.eq).map(([slot, id]) => [slot, { ...lookOf(v.items.find((i) => i.id === id) || { id }), fit: fits[id] }]).filter(([s]) => !BUG_LOOK.includes(s)));
  const cur = sel && v.items.find((x) => x.id === sel);
  const shown = items.slice(pg * per, pg * per + per);
  const run = async (fn, ok) => { setErr(''); setMsg(''); try { const r = await fn(); setV(r); if (ok) setMsg(ok); refreshSession(); if (BUG_LOOK.includes(cur?.slot) || cur?.gym || cur?.use || cur?.slot === 'toy' || BATTLE_GEAR.includes(cur?.slot)) readBugs(await api('GET', '/barn').catch(() => null)); } catch (e) { setErr(e.message); } };
  const buy = (x, confirm = false) => {
    if (x.price > v.confirmOver && !confirm) { setAsk(x); return; }
    if (x.gym) { // gym gear goes on the picked bug; the server says what creatine did
      setAsk(null);
      run(async () => { const r = await api('POST', '/shop/buy', { id: x.id, confirm, ...(pen ? { bug: pen.id } : {}) }); const g = r.gymGear;
        setTimeout(() => setMsg(x.gym !== 'creatine' ? `${x.name} is on ${g.name} for ${x.days} days.` : g.note === 'held' ? `${g.name} takes the scoop into its next workout: 12 hour lock after it.` : g.note === 'ready' ? `${g.name} is ready to train now.` : `${g.name}'s lock is 12 hours now.`), 0); return r; });
      return;
    }
    const forBug = WORN.includes(x.slot) && pen, on = forBug ? !v.bugEq?.[pen.id]?.[x.slot] && ` ${pen.name} is wearing it now.` : x.slot && !v.eq[x.slot] && ' Wearing it now.';
    setAsk(null); run(() => api('POST', '/shop/buy', { id: x.id, confirm, ...(forBug ? { bug: pen.id } : {}) }), `Bought: ${x.name}.${on || ''}`);
  };
  const owned = cur ? v.own[cur.id] || 0 : 0;
  // looks and battle gear are per bug: `wears` is about the bug picked; `others` are your bugs with a copy of this on
  const wears = (x) => (WORN.includes(x.slot) ? !!pen && v.bugEq?.[pen.id]?.[x.slot] === x.id : v.eq[x.slot] === x.id);
  const perBug = !!cur && WORN.includes(cur.slot), wearing = !!cur && !!cur.slot && wears(cur);
  const others = perBug ? bugs.filter((b) => b.id !== pen?.id && v.bugEq?.[b.id]?.[cur.slot] === cur.id) : [];
  const spare = owned - others.length - (wearing ? 1 : 0) > 0;
  const bugArg = perBug && pen ? { bug: pen.id } : {};
  const takenBy = cur && !owned ? v.taken?.[cur.id] : null; // one of a kind, and somebody else got there first
  const changeCategory = (id) => { setTab(id); setSel(null); setPg(0); setMsg(''); setErr(''); setFitOpen(false); };
  const changeDepartment = (id) => { setDepartmentId(id); changeCategory(null); };
  return (
    <div className="screen store" data-test="store">
      <div className="store-wrap panel">
        <header className="store-head">
          <h1 className="western">General Store</h1>
          <span className="store-cash" data-test="store-cash">{money(v.bankroll)}</span>
        </header>
        <div className="store-navigation">
          <nav className="store-departments" aria-label="Store departments">
            {DEPARTMENTS.map((d) => <button key={d.id} aria-pressed={departmentId === d.id} className={departmentId === d.id ? 'on' : ''} onClick={() => changeDepartment(d.id)} data-test={`sdept-${d.id}`}>{d.label}</button>)}
          </nav>
          <div className="store-pickers">
            <label>Department<select value={departmentId} onChange={(e) => changeDepartment(e.target.value)}>{DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <label>Category<select value={category?.id || ''} disabled={!categories.length} onChange={(e) => changeCategory(e.target.value)}>{categories.length ? categories.map((t) => <option key={t.id} value={t.id}>{t.label}</option>) : <option value="">Locked</option>}</select></label>
          </div>
        </div>
        <section className="store-shelf">
          <div className="store-browse">
            <nav className="store-subcategories" aria-label={`${department.label} categories`}>
              {categories.length > 1 ? categories.map((t) => <button key={t.id} aria-pressed={category.id === t.id} className={category.id === t.id ? 'on' : ''} onClick={() => changeCategory(t.id)} data-test={`stab-${t.id}`}>{t.label}</button>) : <h2 className="store-category-title">{category?.label || department.label}</h2>}
            </nav>
            {bugs.length > 1 && ['bugstyle', 'gear', 'gymgear'].includes(category?.id) && <div className="store-bugpick" role="group" aria-label="Which bug" data-test="store-bugpick">For
              {bugs.map((b) => <button key={b.id} aria-pressed={pen.id === b.id} className={pen.id === b.id ? 'on' : ''} onClick={() => { setBugId(b.id); setMsg(''); setErr(''); }} data-test="store-bug"><BugThumb species={b.species} style={b.style} size={30} level={b.level} />{b.name}</button>)}
            </div>}
            {category?.id === 'tobacco' && <p className="store-notice" role="note" data-test="store-tobacco-notice"><b>18+</b> {v.tobaccoNotice} Cartoon only; play money only.</p>}
          </div>
          <div className="store-grid" ref={gridRef} style={{ gridTemplateColumns: `repeat(${fit.cols}, 1fr)`, gridTemplateRows: `repeat(${fit.rows}, 1fr)` }} data-test="store-grid">
            {!items.length && <p className="store-no-items muted" role="status" data-test={departmentId === 'bugs' && !v.hatched ? 'store-bug-locked' : 'store-no-items'}>{departmentId === 'bugs' && !v.hatched ? 'Bug supplies unlock when your egg hatches.' : 'Nothing on this shelf right now.'}</p>}
            {shown.map((x) => (
              <button key={x.id} className={`store-card t-${TIER(x.price)} ${sel === x.id ? 'sel' : ''} ${v.own[x.id] ? 'own' : ''}`} onClick={() => { setSel(x.id); setMsg(''); setErr(''); setFitOpen(false); }} data-test="store-item" data-id={x.id}>
                <span className="sc-pic"><Thumb x={x} me={me} eqWear={eqWear} pen={pen} size={64} fit={fits} /></span>
                <span className="sc-name">{x.name}</span>
                {x.adult && <span className="sc-adult" title={v.tobaccoNotice}>18+</span>}
                <span className="sc-price num">{gymLabel(x, pen) ? <span className="sc-gym" data-test="store-gym-on">{gymLabel(x, pen)}</span> : v.own[x.id] && ONCE(x) ? 'In your pocket' : v.own[x.id] && !CONSUMABLE(x) ? (wears(x) ? 'Wearing' : 'Owned') : v.taken?.[x.id] ? 'Taken' : x.retired ? 'Not sold' : money(x.price)}</span>
              </button>
            ))}
          </div>
          {!!items.length && <div className="store-pager">
            <button className="btn ghost small" onClick={() => setPg(Math.max(0, pg - 1))} disabled={pg === 0} aria-label="Previous page" data-test="store-prev">‹</button>
            <span className="small num" data-test="store-count">{pg + 1} / {pages}</span>
            <button className="btn ghost small" onClick={() => setPg(Math.min(pages - 1, pg + 1))} disabled={pg >= pages - 1} aria-label="Next page" data-test="store-next">›</button>
          </div>}
        </section>
        <aside className={`store-counter ${cur ? 'open' : ''}`} data-test="store-detail">
          {cur ? (
            <>
              <button className="store-close btn ghost small" onClick={() => setSel(null)} aria-label="Close">×</button>
              <div className="sd-pic"><Thumb x={cur} me={me} eqWear={eqWear} pen={pen} size={120} fit={fits} /></div>
              <div className="sd-text">
                <h2>{cur.name}</h2>
                <p className="sd-price">{cur.retired ? <b>No longer sold</b> : <><b className="num">{money(cur.price)}</b> <span className={`tier t-${TIER(cur.price)}`}>{TIER(cur.price)}</span></>}{owned ? <span className="muted"> · you have {(CONSUMABLE(cur) && !ONCE(cur)) || owned > 1 ? owned : 'it'}{others.length ? ` · on ${others.map((b) => b.name).join(', ')}` : ''}</span> : null}</p>
                {fitOpen && owned && FITTABLE(cur) ? <><FitControls compact value={fits[cur.id]} onChange={(f) => setFitOf(cur.id, f)} onReset={() => resetFit(cur.id)} /><p className="small muted" data-test="fit-status">{fitStatus || 'Saved as you go; shows at every table.'}</p></> : <p className={`sd-desc ${cur.kind === 'tobacco' ? 'tob' : ''}`}>{cur.desc}</p>}
                {cur.kind === 'absurd' && <p className="small muted">{cur.unique ? 'One of a kind · ' : ''}{cur.month ? `Sold in ${MONTH(cur.month)} only · ` : ''}House decoration · no gameplay bonus.</p>}
                {takenBy && <p data-test="store-taken"><b>{takenBy}</b> has it.</p>}
                {cur.gym && pen && <p className="small sd-gym" data-test="store-gym-status">{gymOn(cur, pen) == null ? `For ${pen.name}${cur.days ? ` · ${cur.days} days` : ' · one scoop'}` : `${pen.name}: ${gymLabel(cur, pen)}`}</p>}
                <div className="sd-acts">
                  {owned > 0 && cur.kind === 'furniture' && <button className="btn ghost" onClick={() => navigate('/room')}>Put it in My House</button>}
                  {owned > 0 && cur.kind === 'absurd' && <button className="btn ghost" onClick={() => navigate('/room')}>Display in My House</button>}
                  {cur.gym ? <button className="btn" onClick={() => buy(cur)} disabled={!pen || gymOn(cur, pen) != null || v.bankroll < cur.price} data-test="store-buy">{gymOn(cur, pen) != null ? (cur.gym === 'creatine' ? 'One scoop at a time' : 'On it already') : v.bankroll < cur.price ? 'Not enough cash' : `Buy for ${pen?.name || 'your bug'} · ${money(cur.price)}`}</button>
                  : !takenBy && !cur.retired && (!owned || (CONSUMABLE(cur) && !ONCE(cur)) || (perBug && bugs.length > 1 && owned < v.bugCopies)) && <button className={`btn ${owned && perBug ? 'ghost' : ''}`} onClick={() => buy(cur)} disabled={v.bankroll < cur.price} data-test="store-buy">{v.bankroll < cur.price ? 'Not enough cash' : `Buy ${owned && perBug ? 'another ' : ''}· ${money(cur.price)}`}</button>}
                  {owned && cur.slot && !wearing && (!perBug || pen) ? <button className="btn ghost" onClick={() => run(() => api('POST', '/shop/equip', { id: cur.id, ...bugArg }), 'On it goes.')} data-test="store-equip">{!perBug || bugs.length < 2 ? 'Wear' : spare ? `Put on ${pen.name}` : `Move from ${others[0].name}`}</button> : null}
                  {owned && wearing ? <button className="btn ghost" onClick={() => run(() => api('POST', '/shop/equip', { id: null, slot: cur.slot, ...bugArg }), 'Taken off.')} data-test="store-unequip">Take off</button> : null}
                  {owned && FITTABLE(cur) ? <button className={`btn ${fitOpen ? '' : 'ghost'}`} onClick={() => setFitOpen(!fitOpen)} aria-pressed={fitOpen} data-test="store-fit">{fitOpen ? 'Done' : 'Adjust fit'}</button> : null}
                  {owned && cur.use && cur.use !== 'jar' ? <button className="btn ghost" onClick={() => run(() => api('POST', '/shop/use', { id: cur.id }), cur.use === 'feeder' ? 'Feeder stocked. Fed, Mood and Clean stay full for a while.' : cur.use === 'food' ? 'Fed. A lunch is packed for its next fight.' : 'Your bug appreciates that.')} data-test="store-use">Use</button> : null}
                </div>
                {cur.kind === 'tobacco' && <p className="small sd-warn" data-test="store-tobacco-item-notice"><b>18+</b> {v.tobaccoNotice}</p>}
                {cur.kind === 'tobacco' && <p className="small muted tob" data-test="store-once">{owned ? 'In your pocket. ' : ''}One-time use: at a table, tap Light up and Guntrad brings the lighter. Everyone watching sees it once. It never changes a hand.</p>}
                {cur.kind === 'spectacle' && <p className="small muted" data-test="store-once">{owned ? 'In your pocket. ' : ''}One-time use: at a table, tap Spectacle and everyone there watches it once, now or when they come back. Hosts and players who turn gags off won't see it. It never changes a hand.</p>}
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
