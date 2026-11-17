// The Barn: your stalls of eggs and bugs, one of them your partner. Everything shown here comes from the server (GET /api/barn);
// the page only draws it and asks the server to feed, play or clean. Care scrolls on small screens.
// v33: residents are real bugs drawn as pixel sprites, with a paged "Field notes" sheet; neglect warnings; a gravestone.
import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, refreshSession, useSession } from '../api.js';
import { money } from '../util.js';
import { SignIn } from '../Home.jsx';
import { goToMines } from '../App.jsx';
import { BY_ID } from '../../../server/engine/creatures.js';
import { movesFor, STANCES, riskFor } from '../../../server/engine/bug-combat.js';
import { drawEgg } from './draw.js';
import { drawBug, drawGrave, youngForm } from './sprite.js';
import { voice, sfx, setSound, soundOn } from './sfx.js';
import Bout, { mergeFight } from './Bout.jsx';
import Dizzy from './Dizzy.jsx';
import { navigate } from '../App.jsx';
import './barn.css';

const BugCenter = lazy(() => import('../bugcenter/BugCenter.jsx'));

const SOUND_KEY = 'bba.barnSound';
const left = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
/** A bug's chance by the line, as the board says it. */
const chance = (name, p) => (Math.round(p * 100) === 50 ? 'even fight' : `${name} ${Math.round(p * 100)}% to win`);
const NEED = { hunger: 'Fed', mood: 'Mood', clean: 'Clean' };
const ACT = { feed: ['Feed', 'free'], play: ['Play', 'free'], clean: ['Mist', 'free'] };
const TABS = ['care', 'combat', 'notes'];
const WARN = ['', 'is hungry. It has not been fed in a week.', 'is getting weak from hunger. Feed it soon.', 'is close to starving. Feed it today.'];
const SHEET = [['range', 'Where'], ['size', 'Size'], ['diet', 'Eats'], ['life', 'Life cycle'], ['conservation', 'Status']];
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
/** The bug's field notes, in pages that always fit (no scrolling): the sheet, then the facts two at a time. */
/** Field notes: the sheet rows, the facts and the sources, packed into pages that fit the space actually there
 * (measured, so long entries on a short phone-sideways screen get more pages instead of being clipped). */
function Notes({ bug }) {
  const [pg, setPg] = useState(0);
  const items = [...SHEET.filter(([k]) => bug[k]).map(([k, l]) => ({ t: 's', k, l })), ...bug.facts.map((f, i) => ({ t: 'f', f, i })), { t: 'src' }];
  const box = useRef(null); const meas = useRef(null);
  const [pages, setPages] = useState(null);
  useLayoutEffect(() => {
    const el = box.current; const m = meas.current; if (!el || !m) return undefined;
    const pack = () => {
      const H = el.clientHeight; if (!H) return;
      const hs = [...m.children].map((c) => c.getBoundingClientRect().height); const gap = 5;
      const out = []; let cur = []; let used = 0;
      hs.forEach((h, i) => { const need = (cur.length ? gap : 0) + h; if (cur.length && used + need > H) { out.push(cur); cur = []; used = 0; } used += (cur.length ? gap : 0) + h; cur.push(i); });
      if (cur.length) out.push(cur);
      setPages((old) => (JSON.stringify(old) === JSON.stringify(out) ? old : out));
    };
    pack(); const ro = new ResizeObserver(pack); ro.observe(el); return () => ro.disconnect();
  }, [bug.id]);
  const list = pages || [items.map((_, i) => i)];
  const cur = list[Math.min(pg, list.length - 1)] || [];
  const one = (it, key) => it.t === 's' ? <dl key={key}><dt>{it.l}</dt><dd>{bug[it.k]}</dd></dl>
    : it.t === 'f' ? <ol key={key} start={it.i + 1}><li>{it.f}</li></ol>
    : <p key={key} className="barn-src muted">Sources: {bug.sources.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{host(u)}</a>)}</p>;
  return (
    <div className="barn-notes" id="barn-panel-notes" role="tabpanel" aria-labelledby="barn-tab-notes" data-test="barn-notes">
      <p className="barn-sci small"><i>{bug.sci}</i>{bug.genus ? ' (genus)' : ''} · {bug.order}</p>
      <div className="barn-page" ref={box} data-test="notes-page">
        {cur.map((i) => one(items[i], i))}
      </div>
      <div className="barn-measure-wrap" aria-hidden="true"><div className="barn-page barn-measure" ref={meas}>{items.map((it, i) => one(it, i))}</div></div>
      <div className="barn-pager">
        <button className="btn ghost small" onClick={() => setPg(Math.max(0, pg - 1))} disabled={pg === 0} aria-label="Previous page" data-test="notes-prev">‹</button>
        <span className="small num" data-test="notes-count">{Math.min(pg, list.length - 1) + 1} / {list.length}</span>
        <button className="btn ghost small" onClick={() => setPg(Math.min(list.length - 1, pg + 1))} disabled={pg >= list.length - 1} aria-label="Next page" data-test="notes-next">›</button>
      </div>
    </div>
  );
}

/** v75: the Bug Center door, an option inside the barn. Lit up when your bug needs it. */
function CenterDoor({ urgent }) {
  return <button className={`btn small ${urgent ? '' : 'ghost'} barn-center-door`} onClick={() => navigate('/barn/center')} title="Bug Center" data-test="barn-center" lang="ja">
    <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges"><rect x="1" y="3" width="10" height="8" fill="#fff" /><rect x="0" y="2" width="12" height="2" fill="#e65d70" /><rect x="5" y="5" width="2" height="5" fill="#e65d70" /><rect x="3.5" y="6.5" width="5" height="2" fill="#e65d70" /></svg>
    バグセンター</button>;
}

/** v76: HP on the bug, Game Boy style. It only refills at the Bug Center. */
function HpTag({ pen }) {
  const pct = Math.max(0, Math.min(100, pen.health ?? 100));
  return <span className={`barn-hp${pct <= 25 ? ' low' : pct < 100 ? ' mid' : ''}`} data-test="barn-hp" role="meter" aria-label={`${pen.name} health`} aria-valuemin={0} aria-valuemax={pen.maxHp} aria-valuenow={pen.hp}>
    <b>HP</b><span className="barn-hp-bar"><i style={{ width: `${pct}%` }} /></span><span className="num">{pen.hp}/{pen.maxHp}</span>
  </span>;
}

function Stage({ pen, poke, reduced }) {
  const ref = useRef(null);
  const pokeAt = useRef(-1e9); // not 0: performance.now() starts near 0, which read as a fresh poke on load
  useEffect(() => { if (poke) pokeAt.current = performance.now(); }, [poke]);
  useEffect(() => {
    const c = ref.current; if (!c) return undefined;
    let id = 0;
    const draw = (now) => {
      const r = c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
      const resized = c.width !== W || c.height !== H;
      if (resized) { c.width = W; c.height = H; }
      const pk = Math.max(0, 1 - (now - pokeAt.current) / 600);
      // reduced motion: one still frame, redrawn only if the canvas is resized (or poked)
      if (reduced && !resized && pk <= 0 && c.dataset.drawn === 'rest') { id = requestAnimationFrame(draw); return; }
      c.dataset.drawn = pk > 0 ? 'poke' : 'rest';
      const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
      if (pen.stage === 'egg') drawEgg(x, { w: W, h: H, t: now, p: Math.min(1, (Date.now() - pen.eggAt) / Math.max(1, pen.hatchAt - pen.eggAt)), still: reduced, poke: pk });
      else if (pen.stage === 'dead') drawGrave(x, { w: W, h: H });
      else if (BY_ID[pen.species]) drawBug(x, BY_ID[pen.species], { w: W, h: H, t: now, still: reduced, poke: pk, style: pen.style, level: pen.level });
      id = requestAnimationFrame(draw);
    };
    if (ref.current) delete ref.current.dataset.drawn;
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [pen.stage, pen.species, pen.level, reduced, poke, JSON.stringify(pen.style || null)]);
  return <canvas ref={ref} className="barn-canvas" data-test="barn-canvas" aria-label={pen.stage === 'egg' ? 'A speckled egg in a straw nest' : pen.stage === 'dead' ? `A small headstone for ${pen.name}` : `${pen.name}, a ${pen.speciesName}`} />;
}

const ago = (ms) => { const m = Math.floor(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };

function BugThumb({ bug }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, kind = BY_ID[bug.species]; if (!c || !kind) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = 56 * dpr; c.height = 46 * dpr;
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    drawBug(x, kind, { w: c.width, h: c.height, still: true, style: bug.style, level: bug.level });
  }, [bug.species, bug.level, JSON.stringify(bug.style || null)]);
  return <canvas ref={ref} className="barn-thumb" aria-hidden="true" />;
}

/** Your stalls: every bug you keep, the partner starred. Picking one shows it below; the last slot builds another. */
function Stalls({ stable, sel, onPick }) {
  return <div className="barn-stalls" role="group" aria-label="Your stalls" data-test="barn-stalls">
    {stable.bugs.map((bug) => <button key={bug.id} className={`barn-stall-pick${bug.id === sel ? ' on' : ''}`} aria-pressed={bug.id === sel} onClick={() => onPick(bug.id)} data-test="stall">
      {bug.stage === 'creature' ? <BugThumb bug={bug} /> : <span className="barn-stall-glyph" aria-hidden="true">{bug.stage === 'egg' ? '🥚' : '🪦'}</span>}
      <span className="small">{bug.partner && <b aria-label="Partner">★ </b>}{bug.stage === 'egg' ? 'Egg' : bug.name}</span>
    </button>)}
    {Array.from({ length: Math.max(0, stable.stalls - stable.bugs.length) }, (_, i) => <span key={i} className="barn-stall-pick empty small muted" data-test="stall-empty">Empty</span>)}
    {stable.nextStall != null && <button className={`barn-stall-pick add${sel === 'build' ? ' on' : ''}`} aria-pressed={sel === 'build'} onClick={() => onPick('build')} data-test="stall-add"><span className="small">＋ Stall</span></button>}
  </div>;
}

/** The ring: every bug in the barn, challenges, bouts open to anyone and the recent fights. Anyone can look; fighting needs a bug. */
function Ring({ b, meId, now, busy, unsaved, stake, setStake, post, join, cancel, call, accept, drop, watch }) {
  const { openBout, roster, challenges } = b;
  // Any of your hatched bugs can fight: the partner unless you choose another, or the first one standing.
  const fighters = (b.stable?.bugs || []).filter((bug) => bug.stage === 'creature'), [withId, setWithId] = useState(null);
  const mine = fighters.find((bug) => bug.id === withId) || fighters.find((bug) => !bug.fainted) || fighters[0] || null;
  // A stake box opens on $100 (or the most this owner can cover) and moves in tens. Until its owner types, it shows that.
  const step = b.stakeStep || 10, opening = String(Math.max(0, Math.min(100, Math.floor(Math.min(b.maxStake, b.bankroll ?? 0) / step) * step)));
  const [calling, setCalling] = useState(null), [typedCall, setCallStake] = useState(null), callStake = typedCall ?? opening, posting = stake ?? opening;
  const grown = !!mine?.arena, fainted = !!mine?.fainted, locked = busy || unsaved || !grown || fainted;
  const others = roster.filter((bug) => bug.ownerId !== meId);
  const listings = (b.bouts || []).filter((entry) => entry.id !== openBout?.id);
  const setup = (fighter) => <details className="barn-opponent-setup"><summary>View fighting setup</summary><p className="small">{STANCES[fighter.battle.stance].name} · Condition {fighter.mood}/100 · Gear +{Math.round((fighter.gear || 0) * 100)}% damage</p></details>;
  const stakeLabel = (amount) => (Number(amount) > 0 ? ` for ${money(Number(amount))}` : ' for free');
  return <div className="barn-ring" data-test="barn-ring">
    <p className="small barn-ring-note" role="status">{!mine ? 'You need a living bug to fight. Watching is free.'
      : !grown ? `Bouts unlock at level ${mine.arenaLevel}. Watching is free.`
      : mine.fainted ? <>{mine.name} fainted. The <button className="linklike" onClick={() => navigate('/barn/center')}>Bug Center</button> has a bed for it.</>
      : unsaved ? 'Save or discard your Combat changes before fighting.'
      : <span className="num">Available: {money(b.bankroll)} · play money</span>}
      {fighters.length > 1 && <label className="barn-with"> Fight with <select value={mine.id} onChange={(event) => setWithId(Number(event.target.value))} data-test="ring-with">{fighters.map((bug) => <option key={bug.id} value={bug.id}>{bug.name} · Lv {bug.level}{bug.fainted ? ' · fainted' : ''}</option>)}</select></label>}</p>
    <section className="barn-board">
      {challenges.incoming.length > 0 && <>
        <h3>Challenges for you</h3>
        {openBout && <p className="small barn-warn">Cancel your open bout to accept one.</p>}
        <ul className="barn-open-bouts">{challenges.incoming.map((c) => { const bug = roster.find((entry) => entry.ownerId === c.from && entry.id === c.fromBug), called = fighters.find((entry) => entry.id === c.toBug), risk = c.risk ?? c.stake; return <li key={c.id} data-test="challenge-incoming">
          <div className="barn-listing-title"><b>{c.fromBugName}</b><span className="small">{bug ? `Level ${bug.level} · ` : ''}{c.fromName}</span></div>
          <p className="small" data-test="challenge-terms">{fighters.length > 1 ? `Calls out ${c.toBugName} · ` : ''}{c.line ? `${chance(c.toBugName, 1 - c.line)} · ` : ''}{c.stake ? `risk ${money(risk)} to win ${money(c.stake)}` : 'for the grudge'} · lapses in {left(c.expiresAt - now)}</p>
          <div className="barn-row">
            <button className="btn" onClick={() => accept(c.id, c.risk)} disabled={busy || unsaved || !called || called.fainted || !!openBout || risk > b.bankroll} data-test="challenge-accept">{risk > b.bankroll ? `Need ${money(risk)}` : `Accept${c.stake ? stakeLabel(risk) : ''}`}</button>
            <button className="btn ghost" onClick={() => drop(c.id)} disabled={busy} data-test="challenge-decline">Decline</button>
          </div>
        </li>; })}</ul>
      </>}
      <h3>Every bug in the barn</h3>
      {grown && <p className="small muted">Call one out. Nothing is held until its owner accepts.</p>}
      {others.length ? <ul className="barn-roster">{others.map((bug) => { const key = `${bug.ownerId}:${bug.id}`, out = challenges.outgoing.find((c) => c.to === bug.ownerId && c.toBug === bug.id); return <li key={key} data-test="roster-bug">
        <BugThumb bug={bug} />
        <div>
          <div className="barn-listing-title"><b>{bug.name}</b><span className="small">{bug.owner}</span></div>
          <p className="small">Level {bug.level} · {BY_ID[bug.species]?.name} · {bug.record.w}W {bug.record.l}L{bug.record.d ? ` ${bug.record.d}D` : ''}{!bug.fights ? ' · too young to fight' : bug.fainted ? ' · fainted' : bug.health < 100 ? ` · ${bug.health}% HP` : ''}{mine && bug.line?.[mine.id] ? <span data-test="roster-line"> · {chance(mine.name, bug.line[mine.id])}</span> : null}</p>
        </div>
        {out ? <div className="barn-row"><span className="small">Called out{out.stake ? stakeLabel(out.stake) : ''} · {left(out.expiresAt - now)} left</span><button className="btn ghost" onClick={() => drop(out.id)} disabled={busy} data-test="challenge-withdraw">Withdraw</button></div>
          : calling === key ? <form className="barn-post" onSubmit={(event) => { event.preventDefault(); call(bug.ownerId, bug.id, Number(callStake), mine?.id); setCalling(null); }}>
            <label htmlFor="call-stake">Your stake<input id="call-stake" data-test="challenge-stake" type="number" inputMode="numeric" min="0" max={Math.min(b.maxStake, b.bankroll)} step={step} required autoFocus value={callStake} onChange={(event) => setCallStake(event.target.value)} /></label>
            <button className="btn" type="submit" disabled={busy || callStake === ''} data-test="challenge-send">Send{stakeLabel(callStake)}</button>
            <button className="btn ghost" type="button" onClick={() => setCalling(null)}>Never mind</button>
            {Number(callStake) > 0 && bug.line?.[mine?.id] && <p className="small muted" data-test="call-terms">By the line, {bug.owner} puts up {money(riskFor(Number(callStake), bug.line[mine.id]))} against it.</p>}
          </form>
          : grown && bug.fights && <button className="btn" onClick={() => setCalling(key)} disabled={busy || unsaved || fainted} data-test="challenge-open">Challenge</button>}
      </li>; })}</ul> : <p className="small muted" data-test="roster-empty">No other bugs yet. Every stall but yours is straw.</p>}
    </section>
    <section className="barn-board">
      <h3>Open to anyone</h3>
      {openBout ? <div className="barn-waiting" data-test="bout-waiting">
        <p className="small"><b>Waiting for a challenger.</b> {money(openBout.stake)} held · expires in {left(openBout.expiresAt - now)}</p>
        {setup(openBout.fighter)}
        <p className="small muted">Your setup is saved for this bout. Cancel to change it.</p>
        <button className="btn ghost" onClick={() => cancel(openBout.id)} disabled={busy} data-test="bout-cancel">Cancel{openBout.stake > 0 ? ` & reclaim ${money(openBout.stake)}` : ' bout'}</button>
      </div> : grown && <form className="barn-post" onSubmit={(event) => { event.preventDefault(); if (!locked) post(mine?.id, Number(posting)); }}>
        <label htmlFor="bout-stake">Your stake<input id="bout-stake" data-test="bout-stake" type="number" inputMode="numeric" min="0" max={Math.min(b.maxStake, b.bankroll)} step={step} required value={posting} onChange={(event) => setStake(event.target.value)} disabled={locked} /></label>
        <button className="btn" type="submit" disabled={locked || posting === ''} data-test="bout-post">Post bout{stakeLabel(posting)}</button>
        <p className="small muted">Your stake is held for whoever joins first. Theirs follows the line, so a favourite puts up more. Refunded if you cancel, or after an hour.</p>
      </form>}
      {listings.length ? <ul className="barn-open-bouts">{listings.map((entry) => { const t = mine && entry.terms?.[mine.id], risk = t ? t.risk : entry.stake; return <li key={entry.id} data-test="bout-listing">
        <div className="barn-listing-title"><b>{entry.fighter.name}</b><span className="small">Level {entry.fighter.level} · {entry.hostName}</span></div>
        <p className="small" data-test="bout-terms">{BY_ID[entry.fighter.species].name}{t ? ` · ${chance(mine.name, t.win)}` : ''} · {!entry.stake ? 'no money on it' : t ? `risk ${money(risk)} to win ${money(entry.stake)}` : `${money(entry.stake)} posted`}</p>
        {setup(entry.fighter)}
        {mine && <button className="btn" onClick={() => join(entry.id, mine.id, t?.risk)} disabled={locked || !!openBout || entry.expiresAt <= now || risk > b.bankroll} data-test="bout-join">{risk > b.bankroll ? `Need ${money(risk)}` : `Join${stakeLabel(risk)}`}</button>}
      </li>; })}</ul> : <p className="small muted" data-test="bouts-empty">Nobody waiting. The hay has refused to fight.</p>}
      <h3>Recent fights</h3>
      {b.fights.length ? <ul className="barn-fights">{b.fights.map((fight) => { const [first, second] = fight.sides; return <li key={fight.id} data-test="fight-row">
        <div>
          <b>{fight.winner === null ? `${first.name} and ${second.name} drew` : `${fight.sides[fight.winner].name} beat ${fight.sides[1 - fight.winner].name}`}</b>
          <p className="small muted">{first.owner} v {second.owner}{fight.pot ? ` · ${money(fight.pot)} pot` : ''} · {ago(now - fight.at)}</p>
        </div>
        <button className="btn ghost" onClick={() => watch(fight.id)} disabled={busy} data-test="fight-watch">Watch</button>
      </li>; })}</ul> : <p className="small muted" data-test="fights-empty">No fights yet. The bottle caps are gathering dust.</p>}
      <p className="small muted">Both bugs earn {mine?.boutXp ?? 20} XP, and the winner more: most for an upset. The loser faints. Draws refund both stakes.</p>
    </section>
  </div>;
}

export default function Barn() {
  const { me } = useSession();
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => { const on = () => setPath(window.location.pathname); window.addEventListener('popstate', on); return () => window.removeEventListener('popstate', on); }, []);
  if (path.replace(/\/$/, '') === '/barn/center') return me ? <Suspense fallback={<div className="screen" />}><BugCenter /></Suspense> : <div className="screen barn"><div className="barn-empty panel"><h1 className="western">バグセンター</h1><p>Sign in to visit the Bug Center.</p><SignIn /></div></div>;
  return <BarnHome me={me} />;
}

function BarnHome({ me }) {
  const [b, setB] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [poke, setPoke] = useState(0);
  const [bout, setBout] = useState(null);
  const [replay, setReplay] = useState(false);
  const replayButton = useRef(null);
  const seenBout = useRef(undefined);
  const wallet = useRef(undefined);
  const loading = useRef(false);
  const [stake, setStake] = useState(null); // null until its owner types: the ring shows its opening stake
  const [battleDraft, setBattleDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mutation = useRef(0);
  const [tab, setTab] = useState('care');
  const [ring, setRing] = useState(false);
  const ringOpened = useRef(false);
  const [sound, setSnd] = useState(() => { try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; } });
  const [, tick] = useState(0);
  const skew = useRef(0);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const wasEgg = useRef(null);
  useEffect(() => { setSound(sound); try { localStorage.setItem(SOUND_KEY, sound ? '1' : '0'); } catch { /* private */ } }, [sound]);
  const take = (r) => {
    skew.current = r.serverNow - Date.now(); setB(r);
    const last = r.lastBout ?? r.pen?.lastBout; // the newest fight of any of your bugs
    const id = last?.id || last?.at || null;
    // A new fight since the last look, or one decided while you were away (the Barn button was counting it).
    if (id && (r.unseenBout || (seenBout.current !== undefined && id !== seenBout.current))) { setReplay(false); setBout(last); }
    if (r.unseenBout) refreshSession();
    seenBout.current = id;
    if (wallet.current !== undefined && wallet.current !== r.bankroll) refreshSession();
    wallet.current = r.bankroll;
  };
  const load = () => {
    if (pending.current || loading.current) return;
    loading.current = true;
    const before = mutation.current;
    api('GET', '/barn?seen=1').then((r) => { if (before === mutation.current) take(r); }).catch((e) => { if (before === mutation.current) setErr(e.message); }).finally(() => { loading.current = false; });
  };
  useEffect(() => {
    document.title = "The Barn · Buffalo Bill's Academy";
    seenBout.current = undefined; wallet.current = undefined; setB(null); setBout(null); setBattleDraft(null); setErr('');
    if (me) load();
    const id = setInterval(() => me && load(), 5000), t = setInterval(() => tick((n) => n + 1), 1000);
    return () => { mutation.current += 1; clearInterval(id); clearInterval(t); };
  }, [me?.id]);
  // The stall on show: the one you picked ('build' is the slot that sells another), otherwise your partner.
  const [sel, setSel] = useState(null);
  const stable = b?.stable, pen = sel === 'build' ? null : stable?.bugs.find((bug) => bug.id === sel) || b?.pen;
  const pick = (id) => { setSel(id); setBattleDraft(null); setMsg(''); setErr(''); };
  // Your bug is in the ring right now: follow it blow by blow. When it ends, the next look at the Barn (take) swaps
  // in the finished bout, with its payout and XP, on the same ring. Walking away leaves the bug to its own picks.
  const [walkedOut, setWalkedOut] = useState(null); // the live fight you closed (not `left`: that's the clock formatter)
  const liveId = b?.live && b.live !== walkedOut ? b.live : null, held = useRef(null);
  useEffect(() => {
    if (!liveId) return undefined;
    let off = false; held.current = null;
    const pull = async () => {
      try {
        const { fight } = await api('GET', `/barn/fight?id=${encodeURIComponent(liveId)}&have=${held.current?.rounds.length || 0}`);
        if (off || !fight) return;
        held.current = mergeFight(held.current, fight); setReplay(false); setBout(held.current);
        if (!fight.live) { off = true; load(); }
      } catch { /* the next beat tries again */ }
    };
    pull(); const id = setInterval(pull, 1000);
    return () => { off = true; clearInterval(id); };
  }, [liveId]);
  const lineUp = async (moves) => {
    try { const { fight } = await api('POST', `/barn/fight/${liveId}/moves`, { moves, have: held.current?.rounds.length || 0 }); held.current = mergeFight(held.current, fight); setBout(held.current); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { if (b && !ringOpened.current) { ringOpened.current = true; if (b.challenges.incoming.length) setRing(true); } }, [b]);
  const battle = battleDraft || pen?.battle;
  // hatch moment: the egg's countdown ran out on this screen, so ask the server (it decides)
  useEffect(() => { if (pen?.stage === 'egg' && Date.now() + skew.current >= pen.hatchAt) load(); });
  useEffect(() => { if (wasEgg.current && wasEgg.current === pen?.id && pen.stage === 'creature') { sfx.hatch(); setMsg(`It hatched! Meet ${pen.name}.`); setTimeout(() => voice(BY_ID[pen.species]?.voice), 900); } wasEgg.current = pen?.stage === 'egg' ? pen.id : null; }, [pen?.stage, pen?.id]);
  const act = async (work) => {
    if (pending.current || bout) return;
    pending.current = true; mutation.current += 1; setBusy(true);
    setErr(''); setMsg('');
    try { await work(); } catch (e) { sfx.nope(); setErr(e.message); }
    finally { pending.current = false; setBusy(false); load(); }
  };
  const care = (action) => act(async () => {
      const r = await api('POST', '/barn/care', { action, bug: pen.id }); take(r); setPoke((n) => n + 1);
      const cared = r.stable.bugs.find((bug) => bug.id === pen.id) || r.pen;
      if (cared.stage === 'egg') { sfx.warm(); setMsg('You keep the egg warm. Something inside kicks back.'); }
      else { sfx[action](); setTimeout(() => voice(BY_ID[cared.species]?.voice, cared.needs.mood / 100), 700); setMsg({ feed: `${cared.name} tucks in.`, play: `${cared.name} explores the twig you offered, end to end.`, clean: `A fine mist. ${cared.name} grooms its antennae.` }[action]); }
  });
  const bury = () => act(async () => {
    take(await api('POST', '/barn/bury', { bug: pen.id })); setSel(null); setBattleDraft(null); setMsg('Laid to rest under the old cottonwood. The mines may turn up another egg one day.');
  });
  const wager = (method, url, body) => {
    if (battleDraft) return;
    act(async () => { take(await api(method, url, body)); await refreshSession(); });
  };
  const watch = (id) => act(async () => { const fight = await api('GET', `/barn/fights/${id}`); setReplay(true); setBout(fight); });
  const saveBattle = () => act(async () => {
    take(await api('PATCH', '/barn/battle', { stance: battleDraft.stance, bug: pen.id })); setBattleDraft(null); setMsg('Stance saved.');
  });
  const makePartner = () => act(async () => { take(await api('POST', '/barn/partner', { bug: pen.id })); setMsg(`${pen.name} is coming with you now.`); });
  const build = () => act(async () => { take(await api('POST', '/barn/stalls')); await refreshSession(); setSel(null); setMsg('One new stall. It smells of sawdust and ambition.'); });
  if (!me) return <div className="screen barn"><div className="barn-empty panel"><h1 className="western">The Barn</h1><p>Sign in to see your barn.</p><SignIn /></div></div>;
  if (!b) return <div className="screen barn"><div className="barn-empty muted">{err ? <><p role="alert">{err}</p><button className="btn" onClick={() => { setErr(''); load(); }}>Try again</button></> : 'Opening the barn doors…'}</div></div>;
  const now = Date.now() + skew.current;
  const nextAbility = pen?.abilities?.find((a) => !a.unlocked);
  const waiting = b.challenges.incoming.length + b.bouts.filter((x) => x.hostId !== me.id).length;
  return (
    <div className="screen barn" data-test="barn">
      <div className="barn-wrap panel">
        <header className="barn-head">
          <h1 className="western">The Barn</h1>
          <div className="barn-head-acts">
            {stable?.bugs.some((bug) => bug.stage === 'creature') && <CenterDoor urgent={stable.bugs.some((bug) => bug.fainted || bug.hurt)} />}
            <button className={`btn small${!ring && waiting ? ' primary' : ''}`} onClick={() => setRing(!ring)} data-test="ring-toggle">{ring ? 'Back to the stall' : waiting ? `The ring · ${waiting} waiting` : 'The ring'}</button>
            <button className="btn small ghost" onClick={() => { const v = !sound; setSnd(v); setSound(v); if (v && pen?.stage === 'creature') voice(BY_ID[pen.species]?.voice); }} aria-pressed={sound} title="Barn sounds">{sound ? '🔊' : '🔈'}</button>
          </div>
        </header>
        {ring && <Ring b={b} meId={me.id} now={now} busy={busy} unsaved={!!battleDraft} stake={stake} setStake={setStake}
          post={(bug, amount) => wager('POST', '/barn/bouts', { stake: amount, bug })}
          join={(id, bug, risk) => wager('POST', `/barn/bouts/${id}/join`, { bug, risk })}
          cancel={(id) => act(async () => { take(await api('DELETE', `/barn/bouts/${id}`)); await refreshSession(); setMsg('Bout cancelled. Your stake is back.'); })}
          call={(to, their, amount, bug) => act(async () => { take(await api('POST', '/barn/challenges', { to, their, stake: amount, bug })); setMsg('Challenge sent. It stands for a day.'); })}
          accept={(id, risk) => wager('POST', `/barn/challenges/${id}/accept`, { risk })}
          drop={(id) => act(async () => { take(await api('DELETE', `/barn/challenges/${id}`)); await refreshSession(); })}
          watch={watch} />}
        {!ring && stable?.bugs.length > 0 && <Stalls stable={stable} sel={sel === 'build' ? sel : pen?.id} onPick={pick} />}
        {!ring && sel === 'build' && stable?.nextStall != null && (
          <div className="barn-none" data-test="barn-build">
            <div className="barn-stall" aria-hidden="true"><span>STALL {stable.stalls + 1}</span></div>
            <p>Room for one more bug. The carpenter wants {money(stable.nextStall)} and will not discuss it.</p>
            <button className="btn" onClick={build} disabled={busy || stable.nextStall > b.bankroll} data-test="stall-build">{stable.nextStall > b.bankroll ? `Need ${money(stable.nextStall)}` : `Build it · ${money(stable.nextStall)}`}</button>
          </div>
        )}
        {!ring && !pen && sel !== 'build' && (
          <div className="barn-none" data-test="barn-empty">
            <div className="barn-stall" aria-hidden="true"><span>EMPTY STALL</span></div>
            <p>Nothing lives here yet. Old miners say the tunnels sometimes leave something behind.</p>
            <button className="mines-btn" onClick={goToMines}>Acid Mines</button>
          </div>
        )}
        {!ring && pen?.stage === 'egg' && (
          <div className="barn-body" data-test="barn-egg">
            <div className="barn-stage"><Stage pen={pen} poke={poke} reduced={reduced} /></div>
            <div className="barn-side">
              <h2 className="barn-name">An egg from the mines</h2>
              <p className="muted small">Warm, speckled and slightly too heavy. Something in there taps back when you knock.</p>
              <div className="barn-hatch"><span className="small muted">Hatches in</span><b className="num" data-test="hatch-left">{left(pen.hatchAt - now)}</b></div>
              <div className="barn-bar"><i style={{ width: `${Math.min(100, ((now - pen.eggAt) / (pen.hatchAt - pen.eggAt)) * 100)}%` }} /></div>
              <div className="barn-acts">
                <button className="btn" onClick={() => care('play')} disabled={busy || pen.warmCoolMs > 0 && now < b.serverNow + pen.warmCoolMs} data-test="act-warm">Keep it warm</button>
                <button className="btn ghost" onClick={() => { sfx.egg(); setPoke((n) => n + 1); setMsg('Knock knock. Knock knock knock. It knows a joke you don\'t.'); }}>Knock</button>
              </div>
            </div>
          </div>
        )}
        {!ring && pen?.stage === 'dead' && (
          <div className="barn-body" data-test="barn-dead">
            <div className="barn-stage grave"><Stage pen={pen} poke={0} reduced={reduced} /></div>
            <div className="barn-side barn-rip">
              <h2 className="barn-name" data-test="creature-name">{pen.name}</h2>
              <p className="small barn-kind">{pen.speciesName} · Level {pen.level} · {pen.record.w}W {pen.record.l}L</p>
              <p className="small">It went without food for three weeks and quietly passed on {new Date(pen.diedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.</p>
              <p className="small muted">Bugs live fast. When you are ready, lay it to rest; another egg may turn up in the mines.</p>
              <div className="barn-acts"><button className="btn" onClick={bury} disabled={busy} data-test="bury">Lay to rest</button></div>
            </div>
          </div>
        )}
        {!ring && pen?.stage === 'creature' && (
          <div className="barn-body" data-test="barn-creature" data-species={pen.species}>
            <div className={`barn-stage${pen.fainted ? ' fainted' : ''}`} onClick={() => { setPoke((n) => n + 1); if (!pen.fainted) voice(BY_ID[pen.species]?.voice, pen.needs.mood / 100); }}><Stage pen={pen} poke={poke} reduced={reduced} />{pen.fainted ? <><span className="barn-mood m-fainted" data-test="barn-fainted-chip">fainted</span><Dizzy size={64} className="barn-dizzy" label={`${pen.name} fainted`} /></> : <span className={`barn-mood m-${pen.mood}`}>{pen.mood}</span>}{pen.maxHp > 0 && <HpTag pen={pen} />}</div>
            <div className={`barn-side${tab !== 'notes' ? ' barn-care' : ''}`}>
              <h2 className="barn-name" data-test="creature-name">{pen.name}</h2>
              {pen.title && <span className="small barn-title">{pen.title}</span>}
              <p className="small barn-kind">{pen.speciesName} · <b>Level {pen.level}</b>{pen.feederUntil > b.serverNow && <span className="barn-feeder" data-test="barn-feeder" title="Keeps Fed full, pauses starvation and adds 12 XP at each daily checkpoint while active"> · 🥣 Feeder until {new Date(pen.feederUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}</p>
              {stable.bugs.length > 1 && (pen.partner
                ? <p className="small muted" data-test="barn-partner">★ Your partner: with you in the mine and the terrarium.</p>
                : <p className="small barn-stalled" data-test="barn-stalled"><span className="muted">In its stall, where needs drop {stable.slow}× slower.</span> <button className="btn small" onClick={makePartner} disabled={busy || !!b.live} data-test="make-partner">Make partner</button></p>)}
              {pen.fainted && <p className="barn-warn barn-faint small" role="status" data-test="barn-fainted">{pen.name} fainted {pen.faintedIn === 'ring' ? 'in the ring' : 'in the mines'}{pen.faintedBy ? ` (beaten by ${pen.faintedBy})` : ''}. No battles, bouts or guiding until the nurse at the <button className="linklike" onClick={() => navigate('/barn/center')}>Bug Center</button> heals it: free after an hour's rest, or ${pen.healCost} now.</p>}
              {!pen.fainted && pen.hurt && <button className="barn-hurt small" onClick={() => navigate('/barn/center')} data-test="barn-hurt">Your bug is hurt — visit the Bug Center →</button>}
              {pen.starving > 0 && <p className={`barn-warn w${pen.starving} small`} role="status" data-test="barn-warn">{pen.name} {WARN[pen.starving]}</p>}
              {youngForm(BY_ID[pen.species], pen.level) && <p className="small muted">Larva · adult form at level 3.</p>}
              <div className="barn-tabs" role="tablist" aria-label="Bug details" onKeyDown={(e) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                e.preventDefault();
                const index = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (TABS.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
                setTab(TABS[index]); e.currentTarget.querySelectorAll('[role="tab"]')[index].focus();
              }}>
                {TABS.map((name) => <button key={name} id={`barn-tab-${name}`} role="tab" tabIndex={tab === name ? 0 : -1} aria-selected={tab === name} aria-controls={`barn-panel-${name}`} className={tab === name ? 'on' : ''} onClick={() => setTab(name)} data-test={`tab-${name}`}>{name === 'notes' ? 'Field notes' : name === 'combat' ? 'Combat' : 'Care'}</button>)}
              </div>
              {tab === 'notes' ? <Notes key={pen.species} bug={BY_ID[pen.species]} /> : (<>
                <div className="barn-progress" data-test="barn-progress">
                  <span className="small num">{pen.xp.toLocaleString()} XP · {pen.xpNext ? `${(pen.xpNext - pen.xp).toLocaleString()} to level ${pen.level + 1}` : 'Maximum level 10'}</span>
                  <div className="barn-bar xp" role="progressbar" aria-label={`Level ${pen.level} progress`} aria-valuemin={0} aria-valuemax={pen.xpNext ? pen.xpNext - pen.xpThis : 1} aria-valuenow={pen.xpNext ? pen.xp - pen.xpThis : 1}><i style={{ width: `${pen.xpNext ? ((pen.xp - pen.xpThis) / (pen.xpNext - pen.xpThis)) * 100 : 100}%` }} /></div>
                  {nextAbility && <span className="small muted">Next move: {nextAbility.name} at level {nextAbility.level}.</span>}
                </div>
                {tab === 'care' ? <div className="barn-tab-content" id="barn-panel-care" role="tabpanel" aria-labelledby="barn-tab-care">
                <div className="barn-needs">
                  {Object.entries(NEED).map(([k, label]) => <div key={k} className="barn-need"><span className="small">{label}</span><div className={`barn-bar ${pen.needs[k] < 30 ? 'low' : ''}`}><i style={{ width: `${pen.needs[k]}%` }} /></div></div>)}
                </div>
                <div className="barn-acts">
                  {Object.entries(ACT).map(([k, [label, cost]]) => { const cd = Math.max(0, b.serverNow + pen.cool[k] - now); return <button key={k} className="btn" disabled={busy || cd > 0} onClick={() => care(k)} data-test={`act-${k}`}>{label}<small>{cd > 0 ? left(cd) : cost}</small></button>; })}
                </div>
                <p className="small muted barn-xp-limit">Keep all three needs up for stronger bouts. Visit Combat for its stance, moves and trait.</p>
                </div> : <div className="barn-tab-content" id="barn-panel-combat" role="tabpanel" aria-labelledby="barn-tab-combat">
                  <dl className="barn-combat-stats">
                    <div><dt>Health</dt><dd>{pen.combat.maxHp} HP</dd></div>
                    <div><dt>Level damage</dt><dd>+{Math.round((pen.combat.damageMultiplier - 1) * 100)}%</dd></div>
                    <div><dt>Attack</dt><dd>{pen.combat.stats.atk}/5</dd></div>
                    <div><dt>Defense</dt><dd>{pen.combat.stats.def}/5</dd></div>
                    <div><dt>Speed</dt><dd>{pen.combat.stats.spd}/5</dd></div>
                  </dl>
                  <p className="small muted">Attack increases damage; defense softens hits; speed helps with initiative and dodging. Each level from 3 to 10 adds health and damage.</p>
                  {pen.trait && <p className="small" data-test="barn-trait"><b>{pen.trait.name}.</b> {pen.trait.description}</p>}
                  {b.openBout && <p className="small barn-warn">Cancel your waiting bout in the ring to change your setup.</p>}
                  <fieldset className="barn-setup" disabled={busy || !!b.openBout}>
                    <legend>Combat setup</legend>
                    <label className="barn-stance">Stance<select value={battle.stance} onChange={(e) => setBattleDraft({ ...battle, stance: e.target.value })} data-test="battle-stance">{Object.values(STANCES).map((stance) => <option key={stance.id} value={stance.id}>{stance.name}</option>)}</select></label>
                    <p className="small muted">{STANCES[battle.stance].description}</p>
                    <p className="small">In the ring you choose its moves. The stance is how it fights when you leave it to it.</p>
                    <ul className="barn-moves">
                      {pen.abilities.map((a) => <li key={a.id} className={!a.unlocked ? 'locked' : ''}>
                        <b>{a.name}</b> <span className="small muted">{!a.unlocked ? `Unlocks at level ${a.level}` : a.id === 'basic' ? 'Plain strike' : 'Special'}</span>
                        <p className="small muted">{a.heal ? `Base healing: ${a.heal} HP` : `Power ${a.power} · Base accuracy ${Math.round(a.accuracy * 100)}%`}{a.venom ? ` · Venom: ${a.venom} base damage × ${a.duration} turns` : ''}</p>
                        <p className="small">{a.description}{a.cooldown > 0 ? ` Cooldown: ${a.cooldown} own turns.` : ''}</p>
                      </li>)}
                    </ul>
                    <div className="barn-setup-actions"><button className="btn small" onClick={saveBattle} disabled={!battleDraft} data-test="battle-save">{busy ? 'Please wait…' : 'Save setup'}</button>{battleDraft && <button className="btn small ghost" onClick={() => setBattleDraft(null)}>Discard changes</button>}</div>
                  </fieldset>
                </div>}
                  <div className="barn-bouts">
                    <span className="small" data-test="bout-record">{pen.record.w}W · {pen.record.l}L{pen.record.d ? ` · ${pen.record.d}D` : ''}</span>
                    {tab === 'care' && <button className="btn ghost small" onClick={() => setRing(true)}>Find a bout</button>}
                    {pen.lastBout && <button ref={replayButton} className="btn ghost small" disabled={busy} onClick={() => { setReplay(true); setBout(pen.lastBout); }} data-test="bout-replay">Replay last</button>}
                  </div>
              </>)}
            </div>
          </div>
        )}
        {bout && <Bout key={bout.id || bout.at} bout={bout} onLine={lineUp} replay={replay} reduced={reduced} sound={sound} onSound={() => { setSnd(!sound); setSound(!sound); }} onClose={() => { if (bout.live) setWalkedOut(bout.id); setBout(null); requestAnimationFrame(() => (replayButton.current || document.getElementById(`barn-tab-${tab}`) || document.querySelector('[data-test="ring-toggle"]'))?.focus()); }} />}
        <div className="barn-msg small" aria-live="polite">{err ? <span className="err" role="alert">{err}</span> : msg}</div>
      </div>
    </div>
  );
}
