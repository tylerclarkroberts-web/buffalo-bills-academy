// v39: "Three Lil' Squatches" slots. Play money only. The server decides every spin (crypto RNG) and sends the whole
// result; this page only replays it: reels, the King Rat's Great Toot, the Acorn Stash respins and the Mansion Upgrade
// free spins. No scrolling at any size; Skip, mute and reduced motion; a session summary and the server's break rules.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, useSession, refreshSession } from '../api.js';
import { navigate } from '../App.jsx';
import { SignIn } from '../Home.jsx';
import { useMedia } from '../ui.jsx';
import { Sym, KingRat, Cloud } from './art.jsx';
import { sfx, isMuted, setMuted } from './sfx.js';
import './slots.css';

const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const FILL = ['acorn', 'shroom', 'cone', 'berry', 'straw', 'sticks', 'stone', 'pip', 'bramble', 'boulder', 'W', 'G', 'S'];
const rand = () => FILL[Math.floor(Math.random() * FILL.length)];
const START = ['acorn', 'pip', 'straw', 'shroom', 'bramble', 'sticks', 'cone', 'W', 'stone', 'berry', 'boulder', 'acorn', 'shroom', 'pip', 'straw'];
const HOUSES = ['straw', 'sticks', 'stone'];
const LEVEL_NAME = ['', 'Huts', 'Stone lodges', "Bramble's place", 'MANSIONS'];
const NAMES = { acorn: 'Acorn', shroom: 'Toadstool', cone: 'Pinecone', berry: 'Frankfurter', straw: 'Straw hut', sticks: 'Stick cabin', stone: 'Stone lodge', pip: 'Pip', bramble: 'Bramble', boulder: 'Boulder' };

/** Cells that are part of a win (for the glow). */
function winCells(grid, wins) {
  const on = new Set();
  for (const w of wins || []) for (let r = 0; r < w.n; r++) for (let k = 0; k < 3; k++) { const s = grid[r * 3 + k]; if (s === w.sym || s === 'W') on.add(r * 3 + k); }
  return on;
}
function bigLabel(x) { return x >= 100 ? 'EPIC WIN' : x >= 50 ? 'MEGA WIN' : x >= 25 ? 'HUGE WIN' : x >= 10 ? 'BIG WIN' : null; }

export default function SlotsPage() {
  const { me } = useSession();
  const [v, setV] = useState(null);
  const [err, setErr] = useState('');
  const [bet, setBet] = useState(() => Number(localStorage.getItem('bba.slots.bet')) || 1);
  const [grid, setGrid] = useState(START);
  const [vals, setVals] = useState(Array(15).fill(null));
  const [spinning, setSpinning] = useState([]); // reels still spinning
  const [busy, setBusy] = useState(false);
  const [glow, setGlow] = useState(new Set());
  const [fx, setFx] = useState({}); // per-cell classes: drop | broken | reveal | held | new | up
  const [rat, setRat] = useState(null); // null | 'in' | 'toot' | 'out'
  const [cloud, setCloud] = useState(false);
  const [banner, setBanner] = useState(null);
  const [hud, setHud] = useState(null); // feature counters
  const [win, setWin] = useState(null); // { amount, label }
  const [cash, setCash] = useState(null);
  const [muted, setMute] = useState(isMuted());
  const [modal, setModal] = useState(null); // { kind: 'summary'|'reality'|'break'|'pays', data }
  const [now, setNow] = useState(Date.now());
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const skip = useRef(false);
  const stageRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => { // the stage only exists once the view has loaded, so observe it then
    const el = stageRef.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect();
  }, [!!v, !!me]);

  const load = async () => { const r = await api('GET', '/slots'); setV(r); setCash(r.bankroll); if (r.breakUntil) setModal({ kind: 'break', data: { until: r.breakUntil, summary: null } }); };
  useEffect(() => { document.title = "Three Lil' Squatches · Buffalo Bill's Academy"; if (me) load().catch((e) => setErr(e.message)); }, [me?.id]);
  useEffect(() => { if (v && bet > v.maxBet && v.maxBet) setBet(v.bets.filter((b) => b <= v.maxBet).at(-1)); }, [v?.maxBet]);
  useEffect(() => { localStorage.setItem('bba.slots.bet', String(bet)); }, [bet]);
  useEffect(() => { if (modal?.kind !== 'break') return undefined; const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, [modal?.kind]);
  // spinning reels flicker random symbols
  const [, tick] = useState(0);
  useEffect(() => { if (!spinning.length || reduced) return undefined; const i = setInterval(() => tick((x) => x + 1), 70); return () => clearInterval(i); }, [spinning.length, reduced]);
  useEffect(() => {
    const k = (e) => { if (e.code === 'Space' && !e.target.closest('input,textarea,select,button')) { e.preventDefault(); if (busy) skip.current = true; else doSpin(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  const wait = (ms) => new Promise((res) => { if (skip.current) return res(); const t0 = Date.now(); const step = () => { if (skip.current || Date.now() - t0 >= ms) res(); else setTimeout(step, 30); }; step(); });
  const pace = reduced ? 0.6 : 1;
  const W = (ms) => wait(ms * pace);
  const play = (f, ...a) => { if (!skip.current) f(...a); };

  async function spinReels(final, finalVals, { fast = false, keep = null } = {}) {
    setGlow(new Set()); setFx(keep ? Object.fromEntries([...keep].map((i) => [i, 'held'])) : {});
    play(sfx.spin);
    setSpinning([0, 1, 2, 3, 4]);
    await W(fast ? 260 : 520);
    for (let r = 0; r < 5; r++) {
      setGrid((g) => g.map((s, i) => (Math.floor(i / 3) === r ? final[i] : s)));
      setVals((vv) => vv.map((s, i) => (Math.floor(i / 3) === r ? finalVals[i] : s)));
      setSpinning((sp) => sp.filter((x) => x !== r)); play(sfx.stop, r);
      await W(fast ? 70 : 150);
    }
    setSpinning([]); setGrid(final); setVals(finalVals);
  }

  async function doSpin() {
    if (busy || !v || modal) return;
    setErr(''); setWin(null); setBanner(null); setHud(null);
    let r;
    try { r = await api('POST', '/slots/spin', { bet }); } catch (e) {
      setErr(e.message);
      if (e.status === 429 || e.status === 402) load().catch(() => {});
      return;
    }
    skip.current = false; setBusy(true); setCash((c) => (c == null ? c : Math.round((c - bet) * 100) / 100));
    const res = r.result; const amt = (x) => Math.round(x * bet * 100) / 100;
    try {
      await spinReels(res.grid, res.vals);
      let running = 0;
      if (res.toot) {
        const t = res.toot;
        setBanner({ title: 'Rat King Rampage!', sub: 'The King Rat waddles in…', kind: 'rat' }); setRat('in'); play(sfx.waddle); await W(1100);
        setBanner({ title: 'Rat King Rampage!', sub: 'He drops houses everywhere', kind: 'rat' });
        setGrid(t.withHouses); setVals(t.withHouses.map(() => null)); setFx(Object.fromEntries(t.dropped.map((i) => [i, 'drop']))); play(sfx.drop); await W(900);
        setRat('toot'); setBanner({ title: 'The Great Toot!', sub: 'PFFFRRRRT!', kind: 'toot' }); setCloud(true); play(sfx.toot); await W(900);
        setFx(Object.fromEntries(t.blown.map((i) => [i, 'broken']))); play(sfx.crash); await W(800);
        setGrid(t.grid); setFx(Object.fromEntries(t.blown.map((i) => [i, 'reveal']))); await W(700);
        setCloud(false); setRat('out'); setBanner({ title: 'The Great Toot!', sub: 'The houses are gone. The squatches are left standing.', kind: 'toot' });
        setGlow(winCells(t.grid, t.wins)); running = t.x; if (t.x > 0) play(sfx.win, t.x); await W(1100); setRat(null);
      } else {
        setGlow(winCells(res.grid, res.wins)); running = res.baseX; if (res.baseX > 0) { play(sfx.win, res.baseX); setWin({ amount: amt(running) }); await W(600); }
      }
      if (res.stash) {
        const s = res.stash; const held = s.start.slice();
        setBanner({ title: 'Acorn Stash!', sub: 'Golden acorns stick. 3 respins.', kind: 'stash' }); setHud({ kind: 'stash', left: 3, total: held.reduce((a, x) => a + (x == null ? 0 : typeof x === 'number' ? x : v.jackpots[x]), 0) });
        let vv = held.slice();
        setGrid(vv.map((x) => (x != null ? 'G' : '·'))); setVals(vv);
        setFx(Object.fromEntries(held.map((x, i) => [i, x != null ? 'held' : '']).filter(([, c]) => c))); await W(1000);
        for (const st of s.steps) {
          const keep = new Set(vv.map((x, i) => (x != null ? i : -1)).filter((i) => i >= 0));
          const nextV = vv.slice(); for (const a of st.add) nextV[a.cell] = a.v;
          await spinReels(nextV.map((x) => (x != null ? 'G' : '·')), nextV, { fast: true, keep });
          vv = nextV;
          if (st.add.length) { play(sfx.acorn); setFx(Object.fromEntries([...keep].map((i) => [i, 'held']).concat(st.add.map((a) => [a.cell, 'new'])))); }
          else setFx(Object.fromEntries([...keep].map((i) => [i, 'held'])));
          setHud({ kind: 'stash', left: st.left, total: vv.reduce((a, x) => a + (x == null ? 0 : typeof x === 'number' ? x : v.jackpots[x]), 0) });
          await W(st.add.length ? 700 : 400);
        }
        if (s.full) { setBanner({ title: 'GRAND!', sub: 'Every cell is a golden acorn!', kind: 'stash' }); play(sfx.big); await W(1400); }
        running += s.x; setHud({ kind: 'stash', left: 0, total: s.x }); setWin({ amount: amt(running) }); await W(700);
      }
      if (res.free) {
        const f = res.free;
        setBanner({ title: 'Mansion Upgrade!', sub: `${8 + (f.deeds - 3) * 2} free spins · fill the meter with houses`, kind: 'free' }); play(sfx.level);
        let tot = 0; setHud({ kind: 'free', left: 8 + (f.deeds - 3) * 2, level: 1, meter: 0, total: 0 }); await W(1400); setBanner(null);
        let level = 1;
        for (const s of f.spins) {
          await spinReels(s.shown, Array(15).fill(null), { fast: true });
          tot += s.x; setGlow(winCells(s.shown, s.wins)); if (s.x > 0) play(sfx.win, s.x);
          setHud({ kind: 'free', left: s.left, level, meter: s.meter, total: tot });
          await W(s.x > 0 ? 650 : 330);
          if (s.up) {
            level = s.level; setRat('in'); play(sfx.smallToot); setCloud(true);
            setBanner({ title: `Level ${level}: ${LEVEL_NAME[level]}!`, sub: level === 4 ? 'Mansions pay as Boulder and go wild on the middle reel' : `The King Rat toots every house up a level · +${2 * s.up} spins`, kind: 'free' });
            setHud({ kind: 'free', left: s.left, level, meter: s.meter, total: tot }); play(sfx.level); await W(1300); setCloud(false); setRat(null); setBanner(null);
          }
        }
        running += f.x; setWin({ amount: amt(running) }); await W(500);
      }
      const total = r.win; const label = bigLabel(r.x);
      setWin({ amount: total, label });
      if (label) { play(sfx.big); setBanner({ title: label, sub: `${money(total)} · ${Math.round(r.x * 10) / 10}x your bet`, kind: 'big' }); skip.current = false; await W(2200); setBanner(null); }
    } finally {
      skip.current = false; setBusy(false); setCloud(false); setRat(null); setHud(null);
      setCash(r.bankroll); setV((x) => ({ ...x, bankroll: r.bankroll, maxBet: r.maxBet, session: r.session, breakUntil: r.breakUntil }));
      setWin({ amount: r.win, label: bigLabel(r.x) });
      refreshSession();
      if (r.breakUntil) setModal({ kind: 'break', data: { until: r.breakUntil, summary: r.reality } });
      else if (r.reality) setModal({ kind: 'reality', data: r.reality });
    }
  }
  async function endSession() {
    if (busy) return;
    try { const r = await api('POST', '/slots/end'); setModal({ kind: 'summary', data: r.summary }); setV((x) => ({ ...x, session: null })); } catch (e) { setErr(e.message); }
  }

  // fit the 5x3 machine into the stage
  const cell = useMemo(() => {
    const w = size.w - 20, h = size.h - 22; if (w <= 0 || h <= 0) return 0;
    return Math.max(30, Math.min(170, Math.floor(Math.min((w - 4 * 6) / 5, (h - 2 * 6) / 3))));
  }, [size.w, size.h]);

  if (!me) return <div className="screen slots"><div className="sl-empty panel"><h1 className="western">Three Lil' Squatches</h1><p>Sign in to play the slots (play money only).</p><SignIn /></div></div>;
  if (!v) return <div className="screen slots"><div className="sl-empty muted">{err || 'Warming up the reels…'}</div></div>;
  const allowed = v.bets.filter((b) => b <= v.maxBet);
  const bi = v.bets.indexOf(bet);
  const s = v.session;
  const breakLeft = modal?.kind === 'break' ? Math.max(0, modal.data.until - now) : 0;
  return (
    <div className={`screen slots ${reduced ? 'rm' : ''}`} data-test="slots">
      <div className="sl-wrap panel">
        <header className="sl-head">
          <div className="sl-title"><h1 className="western">Three Lil' Squatches</h1><span className="sl-sub">&amp; the King Rat</span></div>
          <div className="sl-head-r">
            <span className="sl-cash num" data-test="slots-cash" title="Your bankroll (play money)">{money(cash ?? v.bankroll)}</span>
            <button className="btn ghost small" onClick={() => { const m = !muted; setMuted(m); setMute(m); }} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} data-test="slots-mute">{muted ? '🔇' : '🔊'}</button>
            <button className="btn ghost small" onClick={() => setModal({ kind: 'pays' })} disabled={busy} aria-label="How it pays" data-test="slots-pays">?</button>
            <button className="btn ghost small sl-end" onClick={endSession} disabled={busy || !s} data-test="slots-end">End session</button>
          </div>
        </header>
        <div className="sl-stage" ref={stageRef}>
          <div className={`sl-machine ${hud?.kind === 'free' ? 'free' : ''}`} style={{ '--cell': `${cell}px`, visibility: cell ? 'visible' : 'hidden' }} data-test="slots-machine">
            {[0, 1, 2, 3, 4].map((r) => (
              <div key={r} className={`sl-reel ${spinning.includes(r) ? 'spin' : ''}`}>
                {[0, 1, 2].map((k) => {
                  const i = r * 3 + k; const spinNow = spinning.includes(r) && fx[i] !== 'held';
                  const sym = spinNow ? (reduced ? grid[i] : rand()) : grid[i];
                  return <div key={k} className={`sl-cell ${glow.has(i) ? 'glow' : ''} ${fx[i] || ''} s-${sym}`} data-sym={sym} data-cell={i}><Sym s={sym} v={spinNow ? null : vals[i]} broken={fx[i] === 'broken'} /></div>;
                })}
              </div>
            ))}
            {cloud && <div className="toot-cloud" data-test="toot-cloud"><Cloud /></div>}
            {rat && <div className={`big-rat ${rat}`} data-test="king-rat"><svg viewBox="0 0 100 100"><KingRat pose={rat} /></svg></div>}
            {banner && <div className={`sl-banner b-${banner.kind}`} role="status" data-test="slots-banner"><b className="western">{banner.title}</b>{banner.sub && <span>{banner.sub}</span>}</div>}
            {hud && <div className="sl-hud" data-test="slots-hud">{hud.kind === 'stash' ? <>Respins <b className="num">{hud.left}</b> · Stash <b className="num">{money(Math.round(hud.total * bet * 100) / 100)}</b></> : <>Free spins <b className="num">{hud.left}</b> · {LEVEL_NAME[hud.level]} <span className="meter"><i style={{ width: `${Math.min(100, (hud.meter / 24) * 100)}%` }} /></span> · <b className="num">{money(Math.round(hud.total * bet * 100) / 100)}</b></>}</div>}
          </div>
        </div>
        <div className="sl-controls">
          <div className="sl-bet" aria-label="Bet">
            <button className="btn ghost small" onClick={() => setBet(v.bets[Math.max(0, bi - 1)])} disabled={busy || bi <= 0} aria-label="Lower bet" data-test="bet-down">−</button>
            <span className="sl-betv num" data-test="slots-bet">Bet {money(bet)}</span>
            <button className="btn ghost small" onClick={() => setBet(v.bets[Math.min(v.bets.length - 1, bi + 1)])} disabled={busy || !allowed.includes(v.bets[bi + 1])} aria-label="Raise bet" data-test="bet-up">+</button>
          </div>
          {busy ? <button className="btn sl-spin skip" onClick={() => { skip.current = true; }} data-test="slots-skip">Skip ›</button>
            : <button className="btn sl-spin" onClick={doSpin} disabled={!v.maxBet || bet > v.maxBet || !!modal} data-test="slots-spin">Spin</button>}
          <div className="sl-win" role="status" data-test="slots-win">{err ? <span className="err">{err}</span> : win ? (win.amount > 0 ? <><span className="muted">Win</span> <b className="num">{money(win.amount)}</b></> : <span className="muted">No win</span>) : <span className="muted">Max bet {money(v.maxBet)}</span>}</div>
          <div className="sl-sess small muted" data-test="slots-session">{s ? <>Session: <span className="num">{s.spins}</span> spins · net <span className={`num ${s.net >= 0 ? 'pos' : 'neg'}`}>{s.net >= 0 ? '+' : '−'}{money(Math.abs(s.net))}</span></> : 'New session'}</div>
        </div>
        <p className="sl-note" data-test="slots-note"><b>Play money only.</b> No real money in or out. Bets $1–$100, never more than a tenth of your balance. Breaks every 300 spins / 45 min.</p>
      </div>
      {modal && modal.kind !== 'pays' && (
        <div className="sl-modal" role="dialog" aria-modal="true" data-test={`slots-${modal.kind}`}>
          <div className="panel">
            {modal.kind === 'break' ? <><h2 className="western">Stretch break</h2><p>You've been spinning a while. The machine takes a {v.limits.breakMin}-minute nap so you can too.</p><p className="num sl-count">{Math.floor(breakLeft / 60000)}:{String(Math.floor(breakLeft / 1000) % 60).padStart(2, '0')}</p></>
              : modal.kind === 'reality' ? <><h2 className="western">Reality check</h2><p>You've spun {modal.data.spins} times in {modal.data.minutes} minutes.</p></>
              : <><h2 className="western">Session summary</h2>{!modal.data && <p>No spins this session.</p>}</>}
            {(modal.kind === 'break' ? modal.data.summary : modal.data) && <Summary s={modal.kind === 'break' ? modal.data.summary : modal.data} />}
            <p className="small muted">Play money only. Nothing here is ever real money.</p>
            <div className="sl-acts">
              {modal.kind === 'reality' && <button className="btn" onClick={() => setModal(null)} data-test="reality-keep">Keep playing</button>}
              {modal.kind === 'reality' && <button className="btn ghost" onClick={() => { setModal(null); endSession(); }}>End session</button>}
              {modal.kind === 'summary' && <button className="btn" onClick={() => setModal(null)} data-test="summary-close">Play again</button>}
              {modal.kind === 'break' && <button className="btn" onClick={() => { if (breakLeft <= 0) setModal(null); }} disabled={breakLeft > 0} data-test="break-done">{breakLeft > 0 ? 'Resting…' : 'Back to the reels'}</button>}
              <button className="btn ghost" onClick={() => navigate('/')}>Back to the lobby</button>
            </div>
          </div>
        </div>
      )}
      {modal?.kind === 'pays' && <Pays v={v} close={() => setModal(null)} />}
    </div>
  );
}

function Summary({ s }) {
  return (<dl className="sl-sum" data-test="slots-summary">
    <div><dt>Spins</dt><dd className="num">{s.spins}</dd></div>
    <div><dt>Time</dt><dd className="num">{s.minutes} min</dd></div>
    <div><dt>Wagered</dt><dd className="num">{money(s.wagered)}</dd></div>
    <div><dt>Won</dt><dd className="num">{money(s.won)}</dd></div>
    <div><dt>Net</dt><dd className={`num ${s.net >= 0 ? 'pos' : 'neg'}`}>{s.net >= 0 ? '+' : '−'}{money(Math.abs(s.net))}</dd></div>
    <div><dt>Biggest win</dt><dd className="num">{money(s.biggest)}{s.biggestX ? ` (${s.biggestX}x)` : ''}</dd></div>
    <div><dt>Features</dt><dd className="num">{s.features.toot} toots · {s.features.stash} stashes · {s.features.free} mansions</dd></div>
    <div><dt>Balance</dt><dd className="num">{money(s.balance)}</dd></div>
  </dl>);
}

function Pays({ v, close }) {
  const order = ['boulder', 'bramble', 'pip', 'stone', 'sticks', 'straw', 'berry', 'cone', 'shroom', 'acorn'];
  return (
    <div className="sl-modal" role="dialog" aria-modal="true" data-test="slots-paytable" onClick={close}>
      <div className="panel sl-pays" onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost small sl-x" onClick={close} aria-label="Close">×</button>
        <h2 className="western">How it pays</h2>
        <p className="small">243 ways: matching symbols on neighbouring reels from the left, any row. Pays per way, times your bet (3 / 4 / 5 of a kind). King Rat is wild on reels 2–4. Return to player about 95% over the long run; max win {v.maxWinX.toLocaleString()}x.</p>
        <div className="sl-ptab">{order.map((k) => <div key={k}><span className="pt-ic"><Sym s={k} /></span><span className="pt-n">{NAMES[k]}</span><span className="num">{v.paytable[k].map((x) => x.toFixed(2).replace(/\.?0+$/, '')).join(' / ')}</span></div>)}</div>
        <ul className="sl-feat small">
          <li><b>Rat King Rampage</b> (any spin, about 1 in 160): the King Rat waddles in, drops houses, then lets rip <i>The Great Toot</i>. Every house is farted apart and the squatch inside is left standing.</li>
          <li><b>Acorn Stash</b>: 6+ golden acorns stick for 3 respins (each new acorn resets them). Mini {v.jackpots.MINI}x, Minor {v.jackpots.MINOR}x, Major {v.jackpots.MAJOR}x; fill all 15 for the Grand ({v.jackpots.GRAND}x).</li>
          <li><b>Mansion Upgrade</b>: 3+ deeds = 8 free spins. Houses fill the meter; each level the rat toots them up: stone lodges, Bramble's place, then Mansions.</li>
        </ul>
        <p className="small muted">{v.note}</p>
      </div>
    </div>
  );
}
