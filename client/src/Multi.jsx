// Play up to 4 tables at once (/multi?t=CODE1,CODE2). Each pane is a full TablePage in "pane" mode with its own
// live stream; only the focused pane takes taps. The look follows how many tables are open (themes/theme-core.js):
// 1 saloon, 2 jade, 3 anime, 4 arcade. "Themes off" keeps the normal look at any count.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TablePage, { MusicButton } from './TablePage.jsx';
import { offerQueue } from './fight/offerQueue.js';
import { api, useSession } from './api.js';
import { navigate } from './App.jsx';
import { Link } from './Shell.jsx';
import { VENUE } from './theme.jsx';
import { formatLeft } from './util.js';
import { useWide, useShortLand } from './ui.jsx';
import * as music from './table/music.js';
import { MAX_TABLES, THEMES, themeForCount, pickTables, nextTurn } from './themes/theme-core.js';
import { setActiveTheme, plainMode, setPlainMode } from './themes/store.js';
import { ConsoleRoom, Petals } from './themes/decor.jsx';

export default function Multi({ wanted = [] }) {
  const { me } = useSession();
  const [mine, setMine] = useState(null);
  const [codes, setCodes] = useState(null);
  const [focus, setFocus] = useState(null);
  const [status, setStatus] = useState({});
  const [plain, setPlain] = useState(plainMode);
  const [pick, setPick] = useState(false);
  const wide = useWide();
  const land = useShortLand();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  // my tables (for the picker); the first load decides what's open
  useEffect(() => {
    if (!me) return undefined;
    let stop = false;
    const load = () => api('GET', '/my-tables').then((t) => {
      if (stop) return;
      setMine(t);
      setCodes((c) => c ?? pickTables(t, wanted));
    }).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { stop = true; clearInterval(id); };
  }, [me?.id]);
  const open = codes || [];
  useEffect(() => { if (codes) navigate(`/multi${codes.length ? `?t=${codes.join(',')}` : ''}`, { replace: true }); }, [codes?.join(',')]);
  useEffect(() => { if (!open.includes(focus)) setFocus(open.find((c) => status[c]?.myTurn) || open[0] || null); }, [open.join(','), focus]);

  // the theme for this many tables; back to the saloon when you leave
  const theme = themeForCount(open.length, { plain });
  useEffect(() => { setActiveTheme(theme); music.setTheme(theme); }, [theme]);
  useEffect(() => () => { setActiveTheme('saloon'); music.setTheme('saloon'); }, []);
  useEffect(() => music.attach(), []);

  const onStatus = useCallback((code, st) => setStatus((s) => ({ ...s, [code]: st })), []);
  // Fight offers: one prompt at a time, oldest first. Its pane comes into focus; the others wait (tabs flag them).
  const offerBook = useRef({ seen: {}, seq: 0 });
  const queue = offerQueue(offerBook.current, open, (c) => status[c]?.offer || null);
  const activeOffer = queue[0] || null;
  useEffect(() => { if (activeOffer) setFocus(activeOffer); }, [activeOffer && `${activeOffer}.${status[activeOffer]?.offer}`]);
  const turns = useMemo(() => Object.fromEntries(open.map((c) => [c, !!status[c]?.myTurn])), [open.join(','), status]);
  const waiting = open.filter((c) => turns[c]).length;
  const next = nextTurn(open, turns, focus);
  useEffect(() => {
    let flip = false;
    const base = `Multi-table · ${VENUE.name}`;
    if (!waiting) { document.title = base; return undefined; }
    document.title = `● Your turn (${waiting}) · ${base}`;
    const id = setInterval(() => { flip = !flip; document.title = flip ? `● Your turn (${waiting}) · ${base}` : `○ ${base}`; }, 1200);
    return () => clearInterval(id);
  }, [waiting]);
  // keyboard: ] or n = next table waiting on you
  useEffect(() => {
    const k = (e) => { if (e.target.closest?.('input, textarea')) return; if ((e.key === ']' || e.key === 'n') && next) setFocus(next); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [next]);

  const seatedTables = (mine || []).filter((t) => t.seated && t.status !== 'closed');
  const toggle = (code) => setCodes((c) => (c.includes(code) ? c.filter((x) => x !== code) : c.length >= MAX_TABLES ? c : [...c, code]));

  // phones: swipe left/right between panes (never while dragging a slider or typing)
  const swipe = useRef(null);
  const onTouchStart = (e) => { if (e.target.closest('input, textarea, .say-box, .fx-screen, .fo-backdrop')) { swipe.current = null; return; } const t = e.touches[0]; swipe.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = swipe.current; swipe.current = null; if (!s) return;
    const t = e.changedTouches[0]; const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 45) return;
    const i = open.indexOf(focus); const j = (i + (dx < 0 ? 1 : -1) + open.length) % open.length;
    setFocus(open[j]);
  };

  if (!me) return <div className="screen center-screen"><p>Sign in to play several tables at once.</p><Link to="/" className="btn small">← Lobby</Link></div>;
  const pager = !wide || land;
  const label = (c) => status[c]?.name || mine?.find((t) => t.code === c)?.name || c;
  return (
    <div className={`screen mt mt-${theme} n${open.length} ${pager ? 'mt-pager' : 'mt-grid'}`}>
      {theme === 'arcade' && <ConsoleRoom />}
      {theme === 'anime' && <Petals />}
      <div className="mt-head">
        <Link to="/?tab=tables" className="btn small ghost" aria-label="Back to the lobby">←</Link>
        <b className="mt-title">{open.length || 'No'} table{open.length === 1 ? '' : 's'}{!plain && open.length > 1 ? <span className="mt-theme"> · {THEMES[theme].name}</span> : null}</b>
        <div className="mt-pick">
          <button className="btn small" onClick={() => setPick(!pick)} aria-expanded={pick}>Tables ▾</button>
          {pick && (
            <div className="mt-pop" role="dialog" aria-label="Pick tables">
              <p className="small muted">Up to {MAX_TABLES} tables you're seated at.</p>
              {seatedTables.length ? seatedTables.map((t) => (
                <label key={t.code} className="row mt-opt">
                  <input type="checkbox" checked={open.includes(t.code)} disabled={!open.includes(t.code) && open.length >= MAX_TABLES} onChange={() => toggle(t.code)} />
                  <span className="ell">{t.name}</span><span className="mono small">{t.code}</span>{t.myTurn && <i className="dot" />}
                </label>
              )) : <p className="small">You're not seated anywhere yet.</p>}
              <button className="btn small ghost" onClick={() => setPick(false)}>Done</button>
            </div>
          )}
        </div>
        <button className={`btn small primary mt-next ${next ? '' : 'idle'}`} disabled={!next} onClick={() => next && setFocus(next)} title="Jump to the next table waiting on you (key: ])">
          Next turn ›{waiting ? <span className="badge">{waiting}</span> : null}
        </button>
        <button className={`btn small ${plain ? '' : 'on'}`} aria-pressed={!plain} onClick={() => { setPlainMode(!plain); setPlain(!plain); }} title="Themes change with the number of tables">{plain ? 'Themes off' : 'Themes on'}</button>
        <MusicButton />
      </div>
      {pager && open.length > 1 && (
        <div className="mt-tabs" role="tablist" aria-label="Tables">
          {open.map((c) => {
            const st = status[c];
            return (
              <button key={c} role="tab" aria-selected={c === focus} className={`mt-tab ${c === focus ? 'on' : ''} ${st?.myTurn ? 'turn' : ''} ${st?.offer ? 'offer' : ''}`} onClick={() => setFocus(c)}>
                {st?.offer && <i className="fo-flag" aria-label="fight offer">⚔</i>}{st?.myTurn && <i className="dot" aria-label="your turn" />}<span className="ell">{label(c)}</span>
                {st?.myTurn && st.deadline && st.deadline - now < 3600000 ? <span className="mono t-left">{formatLeft(st.deadline - now)}</span> : null}
              </button>
            );
          })}
        </div>
      )}
      {codes && !open.length && (
        <div className="mt-empty center-screen">
          <p>Pick the tables to play side by side ({MAX_TABLES} max). You need a seat at each.</p>
          <button className="btn primary" onClick={() => setPick(true)}>Pick tables</button>
          <Link to="/?tab=tables" className="btn small ghost">Find a table</Link>
        </div>
      )}
      {!codes && <p className="muted mt-empty">Loading your tables…</p>}
      <div className="mt-panes" onTouchStart={pager ? onTouchStart : undefined} onTouchEnd={pager ? onTouchEnd : undefined}>
        {open.map((c) => (
          <div key={c} className={`mt-cell ${c === focus ? 'focus' : ''} ${turns[c] ? 'turn' : ''} ${status[c]?.offer ? 'offer' : ''}`} data-offer={status[c]?.offer ? (activeOffer === c ? 'up' : 'queued') : undefined} hidden={pager && c !== focus}>
            <TablePage code={c} pane focused={c === focus || open.length === 1} onFocus={() => setFocus(c)} onStatus={onStatus} offerTurn={activeOffer === c} />
          </div>
        ))}
      </div>
    </div>
  );
}
