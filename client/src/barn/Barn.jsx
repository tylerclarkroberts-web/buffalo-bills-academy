// The Barn (v30): your one egg or bug. Everything shown here comes from the server (GET /api/barn);
// the page only draws it and asks the server to feed, play or clean. Care scrolls on small screens.
// v33: residents are real bugs drawn as pixel sprites, with a paged "Field notes" sheet; neglect warnings; a gravestone.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, refreshSession, useSession } from '../api.js';
import { money } from '../util.js';
import { SignIn } from '../Home.jsx';
import { goToMines } from '../App.jsx';
import { BY_ID } from '../../../server/engine/creatures.js';
import { movesFor, STANCES } from '../../../server/engine/bug-combat.js';
import { drawEgg } from './draw.js';
import { drawBug, drawGrave, youngForm } from './sprite.js';
import { voice, sfx, setSound, soundOn } from './sfx.js';
import Bout from './Bout.jsx';
import './barn.css';

const SOUND_KEY = 'bba.barnSound';
const left = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
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

/** The ring: every bug in the barn, challenges, bouts open to anyone and the recent fights. Anyone can look; fighting needs a bug. */
function Ring({ b, meId, now, busy, unsaved, stake, setStake, post, join, cancel, call, accept, drop, watch }) {
  const { openBout, roster, challenges } = b;
  const mine = b.pen?.stage === 'creature' ? b.pen : null;
  const [calling, setCalling] = useState(null), [callStake, setCallStake] = useState('0');
  const cooldown = mine ? Math.max(0, b.serverNow + mine.boutCoolMs - now) : 0;
  const grown = !!mine?.arena, locked = busy || unsaved || !grown || cooldown > 0;
  const others = roster.filter((bug) => bug.ownerId !== meId), full = challenges.outgoing.length >= challenges.max;
  const listings = (b.bouts || []).filter((entry) => entry.id !== openBout?.id);
  const setup = (fighter) => <details className="barn-opponent-setup"><summary>View fighting setup</summary><p className="small">{STANCES[fighter.battle.stance].name} · Condition {fighter.mood}/100 · Gear +{Math.round((fighter.gear || 0) * 100)}% damage</p><p className="small">{movesFor(fighter.species, fighter.level, fighter.legacyAbilities).filter((move) => fighter.battle.specials.includes(move.id)).map((move) => move.name).join(' · ') || 'Basic attack only'}</p></details>;
  const stakeLabel = (amount) => (Number(amount) > 0 ? ` for ${money(Number(amount))}` : ' for free');
  return <div className="barn-ring" data-test="barn-ring">
    <p className="small barn-ring-note" role="status">{!mine ? 'You need a living bug at level 3 to fight. Watching is free.'
      : !grown ? `Bouts unlock at level ${mine.arenaLevel}. Watching is free.`
      : unsaved ? 'Save or discard your Combat changes before fighting.'
      : cooldown > 0 ? `Icing its ego. Ready in ${left(cooldown)}.`
      : <span className="num">Available: {money(b.bankroll)} · play money</span>}</p>
    <section className="barn-board">
      {challenges.incoming.length > 0 && <>
        <h3>Challenges for you</h3>
        {openBout && <p className="small barn-warn">Cancel your open bout to accept one.</p>}
        <ul className="barn-open-bouts">{challenges.incoming.map((c) => { const bug = roster.find((entry) => entry.ownerId === c.from); return <li key={c.id} data-test="challenge-incoming">
          <div className="barn-listing-title"><b>{bug?.name || 'A bug'}</b><span className="small">{bug ? `Level ${bug.level} · ` : ''}{c.fromName}</span></div>
          <p className="small">{c.stake ? `${money(c.stake * 2)} pot` : 'For the grudge'} · lapses in {left(c.expiresAt - now)}</p>
          <div className="barn-row">
            <button className="btn" onClick={() => accept(c.id)} disabled={locked || !!openBout || c.stake > b.bankroll} data-test="challenge-accept">{c.stake > b.bankroll ? `Need ${money(c.stake)}` : `Accept${c.stake ? stakeLabel(c.stake) : ''}`}</button>
            <button className="btn ghost" onClick={() => drop(c.id)} disabled={busy} data-test="challenge-decline">Decline</button>
          </div>
        </li>; })}</ul>
      </>}
      <h3>Every bug in the barn</h3>
      {grown && <p className="small muted">{full ? `${challenges.max} challenges out. Withdraw one to send another.` : 'Call one out. Nothing is held until its owner accepts.'}</p>}
      {others.length ? <ul className="barn-roster">{others.map((bug) => { const out = challenges.outgoing.find((c) => c.to === bug.ownerId); return <li key={bug.ownerId} data-test="roster-bug">
        <BugThumb bug={bug} />
        <div>
          <div className="barn-listing-title"><b>{bug.name}</b><span className="small">{bug.owner}</span></div>
          <p className="small">Level {bug.level} · {BY_ID[bug.species]?.name} · {bug.record.w}W {bug.record.l}L{bug.record.d ? ` ${bug.record.d}D` : ''}{!bug.fights ? ' · too young to fight' : ''}</p>
        </div>
        {out ? <div className="barn-row"><span className="small">Called out{out.stake ? stakeLabel(out.stake) : ''} · {left(out.expiresAt - now)} left</span><button className="btn ghost" onClick={() => drop(out.id)} disabled={busy} data-test="challenge-withdraw">Withdraw</button></div>
          : calling === bug.ownerId ? <form className="barn-post" onSubmit={(event) => { event.preventDefault(); call(bug.ownerId, Number(callStake)); setCalling(null); }}>
            <label htmlFor="call-stake">Your stake<input id="call-stake" data-test="challenge-stake" type="number" inputMode="decimal" min="0" max={Math.min(b.maxStake, b.bankroll)} step="0.01" required autoFocus value={callStake} onChange={(event) => setCallStake(event.target.value)} /></label>
            <button className="btn" type="submit" disabled={busy || callStake === ''} data-test="challenge-send">Send{stakeLabel(callStake)}</button>
            <button className="btn ghost" type="button" onClick={() => setCalling(null)}>Never mind</button>
          </form>
          : grown && bug.fights && <button className="btn" onClick={() => setCalling(bug.ownerId)} disabled={busy || unsaved || full} data-test="challenge-open">Challenge</button>}
      </li>; })}</ul> : <p className="small muted" data-test="roster-empty">No other bugs yet. Every stall but yours is straw.</p>}
    </section>
    <section className="barn-board">
      <h3>Open to anyone</h3>
      {openBout ? <div className="barn-waiting" data-test="bout-waiting">
        <p className="small"><b>Waiting for a challenger.</b> {money(openBout.stake)} held · {money(openBout.stake * 2)} pot · expires in {left(openBout.expiresAt - now)}</p>
        {setup(openBout.fighter)}
        <p className="small muted">Your setup is saved for this bout. Cancel to change it.</p>
        <button className="btn ghost" onClick={() => cancel(openBout.id)} disabled={busy} data-test="bout-cancel">Cancel{openBout.stake > 0 ? ` & reclaim ${money(openBout.stake)}` : ' bout'}</button>
      </div> : grown && <form className="barn-post" onSubmit={(event) => { event.preventDefault(); if (!locked) post(); }}>
        <label htmlFor="bout-stake">Your stake<input id="bout-stake" data-test="bout-stake" type="number" inputMode="decimal" min="0" max={Math.min(b.maxStake, b.bankroll)} step="0.01" required value={stake} onChange={(event) => setStake(event.target.value)} disabled={locked} /></label>
        <button className="btn" type="submit" disabled={locked || stake === ''} data-test="bout-post">Post bout{stakeLabel(stake)}</button>
        <p className="small muted">Your stake is held for whoever joins first. Refunded if you cancel, or after an hour.</p>
      </form>}
      {listings.length ? <ul className="barn-open-bouts">{listings.map((entry) => <li key={entry.id} data-test="bout-listing">
        <div className="barn-listing-title"><b>{entry.fighter.name}</b><span className="small">Level {entry.fighter.level} · {entry.hostName}</span></div>
        <p className="small">{BY_ID[entry.fighter.species].name} · {money(entry.stake * 2)} pot</p>
        {setup(entry.fighter)}
        {mine && <button className="btn" onClick={() => join(entry.id)} disabled={locked || !!openBout || entry.expiresAt <= now || entry.stake > b.bankroll} data-test="bout-join">{entry.stake > b.bankroll ? `Need ${money(entry.stake)}` : `Join${stakeLabel(entry.stake)}`}</button>}
      </li>)}</ul> : <p className="small muted" data-test="bouts-empty">Nobody waiting. The hay has refused to fight.</p>}
      <h3>Recent fights</h3>
      {b.fights.length ? <ul className="barn-fights">{b.fights.map((fight) => { const [first, second] = fight.sides; return <li key={fight.id} data-test="fight-row">
        <div>
          <b>{fight.winner === null ? `${first.name} and ${second.name} drew` : `${fight.sides[fight.winner].name} beat ${fight.sides[1 - fight.winner].name}`}</b>
          <p className="small muted">{first.owner} v {second.owner}{fight.stake ? ` · ${money(fight.stake * 2)} pot` : ''} · {ago(now - fight.at)}</p>
        </div>
        <button className="btn ghost" onClick={() => watch(fight.id)} disabled={busy} data-test="fight-watch">Watch</button>
      </li>; })}</ul> : <p className="small muted" data-test="fights-empty">No fights yet. The bottle caps are gathering dust.</p>}
      <p className="small muted">Win, lose or draw, both bugs earn {mine?.boutXp ?? 20} XP and rest for an hour. Draws refund both stakes.</p>
    </section>
  </div>;
}

export default function Barn() {
  const { me } = useSession();
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
  const [stake, setStake] = useState('0');
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
    const last = r.pen?.lastBout;
    const id = last?.id || last?.at || null;
    if (seenBout.current !== undefined && id && id !== seenBout.current) { setReplay(false); setBout(last); }
    seenBout.current = id;
    if (wallet.current !== undefined && wallet.current !== r.bankroll) refreshSession();
    wallet.current = r.bankroll;
  };
  const load = () => {
    if (pending.current || loading.current) return;
    loading.current = true;
    const before = mutation.current;
    api('GET', '/barn').then((r) => { if (before === mutation.current) take(r); }).catch((e) => { if (before === mutation.current) setErr(e.message); }).finally(() => { loading.current = false; });
  };
  useEffect(() => {
    document.title = "The Barn · Buffalo Bill's Academy";
    seenBout.current = undefined; wallet.current = undefined; setB(null); setBout(null); setBattleDraft(null); setErr('');
    if (me) load();
    const id = setInterval(() => me && load(), 5000), t = setInterval(() => tick((n) => n + 1), 1000);
    return () => { mutation.current += 1; clearInterval(id); clearInterval(t); };
  }, [me?.id]);
  const pen = b?.pen;
  useEffect(() => { if (b && !ringOpened.current) { ringOpened.current = true; if (b.challenges.incoming.length) setRing(true); } }, [b]);
  const battle = battleDraft || pen?.battle;
  // hatch moment: the egg's countdown ran out on this screen, so ask the server (it decides)
  useEffect(() => { if (pen?.stage === 'egg' && Date.now() + skew.current >= pen.hatchAt) load(); });
  useEffect(() => { if (wasEgg.current && pen?.stage === 'creature') { sfx.hatch(); setMsg(`It hatched! Meet ${pen.name}.`); setTimeout(() => voice(BY_ID[pen.species]?.voice), 900); } wasEgg.current = pen?.stage === 'egg'; }, [pen?.stage]);
  const act = async (work) => {
    if (pending.current || bout) return;
    pending.current = true; mutation.current += 1; setBusy(true);
    setErr(''); setMsg('');
    try { await work(); } catch (e) { sfx.nope(); setErr(e.message); }
    finally { pending.current = false; setBusy(false); load(); }
  };
  const care = (action) => act(async () => {
      const r = await api('POST', '/barn/care', { action }); take(r); setPoke((n) => n + 1);
      if (r.pen.stage === 'egg') { sfx.warm(); setMsg('You keep the egg warm. Something inside kicks back.'); }
      else { sfx[action](); setTimeout(() => voice(BY_ID[r.pen.species]?.voice, r.pen.needs.mood / 100), 700); setMsg({ feed: `${r.pen.name} tucks in.`, play: `${r.pen.name} explores the twig you offered, end to end.`, clean: `A fine mist. ${r.pen.name} grooms its antennae.` }[action]); }
  });
  const bury = () => act(async () => {
    take(await api('POST', '/barn/bury')); setBattleDraft(null); setMsg('Laid to rest under the old cottonwood. The mines may turn up another egg one day.');
  });
  const wager = (method, url, body) => {
    if (battleDraft) return;
    act(async () => { take(await api(method, url, body)); await refreshSession(); });
  };
  const watch = (id) => act(async () => { const fight = await api('GET', `/barn/fights/${id}`); setReplay(true); setBout(fight); });
  const saveBattle = () => act(async () => {
    take(await api('PATCH', '/barn/battle', battleDraft)); setBattleDraft(null); setMsg('Combat setup saved. Your next bout will use it.');
  });
  if (!me) return <div className="screen barn"><div className="barn-empty panel"><h1 className="western">The Barn</h1><p>Sign in to see your barn.</p><SignIn /></div></div>;
  if (!b) return <div className="screen barn"><div className="barn-empty muted">{err ? <><p role="alert">{err}</p><button className="btn" onClick={() => { setErr(''); load(); }}>Try again</button></> : 'Opening the barn doors…'}</div></div>;
  const now = Date.now() + skew.current;
  const nextAbility = pen?.abilities?.find((a) => !a.unlocked);
  return (
    <div className="screen barn" data-test="barn">
      <div className="barn-wrap panel">
        <header className="barn-head">
          <h1 className="western">The Barn</h1>
          <div className="barn-head-acts">
            <button className={`btn small${!ring && b.challenges.incoming.length ? ' primary' : ''}`} onClick={() => setRing(!ring)} data-test="ring-toggle">{ring ? 'Back to the stall' : b.challenges.incoming.length ? `The ring · ${b.challenges.incoming.length} waiting` : 'The ring'}</button>
            <button className="btn small ghost" onClick={() => { const v = !sound; setSnd(v); setSound(v); if (v && pen?.stage === 'creature') voice(BY_ID[pen.species]?.voice); }} aria-pressed={sound} title="Barn sounds">{sound ? '🔊' : '🔈'}</button>
          </div>
        </header>
        {ring && <Ring b={b} meId={me.id} now={now} busy={busy} unsaved={!!battleDraft} stake={stake} setStake={setStake}
          post={() => wager('POST', '/barn/bouts', { stake: Number(stake) })}
          join={(id) => wager('POST', `/barn/bouts/${id}/join`, {})}
          cancel={(id) => act(async () => { take(await api('DELETE', `/barn/bouts/${id}`)); await refreshSession(); setMsg('Bout cancelled. Your stake is back.'); })}
          call={(to, amount) => act(async () => { take(await api('POST', '/barn/challenges', { to, stake: amount })); setMsg('Challenge sent. It stands for a day.'); })}
          accept={(id) => wager('POST', `/barn/challenges/${id}/accept`, {})}
          drop={(id) => act(async () => { take(await api('DELETE', `/barn/challenges/${id}`)); await refreshSession(); })}
          watch={watch} />}
        {!ring && !pen && (
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
            <div className="barn-stage" onClick={() => { setPoke((n) => n + 1); voice(BY_ID[pen.species]?.voice, pen.needs.mood / 100); }}><Stage pen={pen} poke={poke} reduced={reduced} /><span className={`barn-mood m-${pen.mood}`}>{pen.mood}</span></div>
            <div className={`barn-side${tab !== 'notes' ? ' barn-care' : ''}`}>
              <h2 className="barn-name" data-test="creature-name">{pen.name}</h2>
              {pen.title && <span className="small barn-title">{pen.title}</span>}
              <p className="small barn-kind">{pen.speciesName} · <b>Level {pen.level}</b>{pen.feederUntil > b.serverNow && <span className="barn-feeder" data-test="barn-feeder" title="Keeps Fed full, pauses starvation and adds 12 XP at each daily checkpoint while active, outside the care XP cap"> · 🥣 Feeder until {new Date(pen.feederUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}</p>
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
                <p className="small muted barn-xp-limit">Care XP: max 120/day, shared with store care. Resets at midnight UTC; daily, feeder and battle XP are extra.</p>
                <div className="barn-acts">
                  {Object.entries(ACT).map(([k, [label, cost]]) => { const cd = Math.max(0, b.serverNow + pen.cool[k] - now); return <button key={k} className="btn" disabled={busy || cd > 0} onClick={() => care(k)} data-test={`act-${k}`}>{label}<small>{cd > 0 ? left(cd) : cost}</small></button>; })}
                </div>
                <p className="small muted barn-xp-limit">Keep all three needs up for stronger bouts. Visit Combat to choose a stance and special moves.</p>
                </div> : <div className="barn-tab-content" id="barn-panel-combat" role="tabpanel" aria-labelledby="barn-tab-combat">
                  <dl className="barn-combat-stats">
                    <div><dt>Health</dt><dd>{pen.combat.maxHp} HP</dd></div>
                    <div><dt>Level damage</dt><dd>+{Math.round((pen.combat.damageMultiplier - 1) * 100)}%</dd></div>
                    <div><dt>Attack</dt><dd>{pen.combat.stats.atk}/5</dd></div>
                    <div><dt>Defense</dt><dd>{pen.combat.stats.def}/5</dd></div>
                    <div><dt>Speed</dt><dd>{pen.combat.stats.spd}/5</dd></div>
                  </dl>
                  <p className="small muted">Attack increases damage; defense softens hits; speed helps with initiative and dodging. Each level from 3 to 10 adds health and damage.</p>
                  {b.openBout && <p className="small barn-warn">Cancel your waiting bout in the ring to change your setup.</p>}
                  <fieldset className="barn-setup" disabled={busy || !!b.openBout}>
                    <legend>Combat setup</legend>
                    <label className="barn-stance">Stance<select value={battle.stance} onChange={(e) => setBattleDraft({ ...battle, stance: e.target.value })} data-test="battle-stance">{Object.values(STANCES).map((stance) => <option key={stance.id} value={stance.id}>{stance.name}</option>)}</select></label>
                    <p className="small muted">{STANCES[battle.stance].description}</p>
                    <p className="small">Choose up to two specials. Your basic move fills the gaps while specials recover.</p>
                    <ul className="barn-moves">
                      {pen.abilities.map((a) => <li key={a.id} className={!a.unlocked ? 'locked' : ''}>
                        <label>{a.id !== 'basic' && <input type="checkbox" checked={battle.specials.includes(a.id)} disabled={!a.unlocked || !battle.specials.includes(a.id) && battle.specials.length >= 2} onChange={(e) => setBattleDraft({ ...battle, specials: e.target.checked ? [...battle.specials, a.id] : battle.specials.filter((id) => id !== a.id) })} />}<b>{a.name}</b><span className="small muted">{battle.specials.includes(a.id) && `Selected ${battle.specials.indexOf(a.id) + 1} · `}{!a.unlocked ? `Unlocks at level ${a.level}` : a.level > pen.level ? 'Previously learned' : a.id === 'basic' ? 'Basic · always available' : `Level ${a.level} special`}</span></label>
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
        {bout && <Bout key={bout.id || bout.at} bout={bout} replay={replay} reduced={reduced} sound={sound} onSound={() => { setSnd(!sound); setSound(!sound); }} onClose={() => { setBout(null); requestAnimationFrame(() => (replayButton.current || document.getElementById(`barn-tab-${tab}`) || document.querySelector('[data-test="ring-toggle"]'))?.focus()); }} />}
        <div className="barn-msg small" aria-live="polite">{err ? <span className="err" role="alert">{err}</span> : msg}</div>
      </div>
    </div>
  );
}
