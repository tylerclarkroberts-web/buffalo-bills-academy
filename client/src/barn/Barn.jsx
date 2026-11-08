// The Barn (v30): your one egg or bug. Everything shown here comes from the server (GET /api/barn);
// the page only draws it and asks the server to feed, play or clean. Fits one screen, no scrolling.
// v33: residents are real bugs drawn as pixel sprites, with a paged "Field notes" sheet; neglect warnings; a gravestone.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, useSession } from '../api.js';
import { SignIn } from '../Home.jsx';
import { goToMines } from '../App.jsx';
import { BY_ID } from '../../../server/engine/creatures.js';
import { drawEgg } from './draw.js';
import { drawBug, drawGrave } from './sprite.js';
import { voice, sfx, setSound, soundOn } from './sfx.js';
import Bout from './Bout.jsx';
import './barn.css';

const SOUND_KEY = 'bba.barnSound';
const left = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
const NEED = { hunger: 'Fed', mood: 'Mood', clean: 'Clean' };
const ACT = { feed: ['Feed', 'free'], play: ['Play', 'free'], clean: ['Mist', 'free'] };
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
    <div className="barn-notes" data-test="barn-notes">
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
      else if (BY_ID[pen.species]) drawBug(x, BY_ID[pen.species], { w: W, h: H, t: now, still: reduced, poke: pk, style: pen.style });
      id = requestAnimationFrame(draw);
    };
    if (ref.current) delete ref.current.dataset.drawn;
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [pen.stage, pen.species, reduced, poke, JSON.stringify(pen.style || null)]);
  return <canvas ref={ref} className="barn-canvas" data-test="barn-canvas" aria-label={pen.stage === 'egg' ? 'A speckled egg in a straw nest' : pen.stage === 'dead' ? `A small headstone for ${pen.name}` : `${pen.name}, a ${pen.speciesName}`} />;
}

export default function Barn() {
  const { me } = useSession();
  const [b, setB] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [poke, setPoke] = useState(0);
  const [bout, setBout] = useState(null);
  const [tab, setTab] = useState('care');
  const [sound, setSnd] = useState(() => { try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; } });
  const [, tick] = useState(0);
  const skew = useRef(0);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const wasEgg = useRef(null);
  useEffect(() => { setSound(sound); try { localStorage.setItem(SOUND_KEY, sound ? '1' : '0'); } catch { /* private */ } }, [sound]);
  const take = (r) => { skew.current = r.serverNow - Date.now(); setB(r); };
  const load = () => api('GET', '/barn').then(take).catch((e) => setErr(e.message));
  useEffect(() => { document.title = "The Barn · Buffalo Bill's Academy"; if (me) load(); const id = setInterval(() => me && load(), 60000); const t = setInterval(() => tick((n) => n + 1), 1000); return () => { clearInterval(id); clearInterval(t); }; }, [me?.id]);
  const pen = b?.pen;
  // hatch moment: the egg's countdown ran out on this screen, so ask the server (it decides)
  useEffect(() => { if (pen?.stage === 'egg' && Date.now() + skew.current >= pen.hatchAt) load(); });
  useEffect(() => { if (wasEgg.current && pen?.stage === 'creature') { sfx.hatch(); setMsg(`It hatched! Meet ${pen.name}.`); setTimeout(() => voice(BY_ID[pen.species]?.voice), 900); } wasEgg.current = pen?.stage === 'egg'; }, [pen?.stage]);
  const care = async (action) => {
    setErr(''); setMsg('');
    try {
      const r = await api('POST', '/barn/care', { action }); take(r); setPoke((n) => n + 1);
      if (r.pen.stage === 'egg') { sfx.warm(); setMsg('You keep the egg warm. Something inside kicks back.'); }
      else { sfx[action](); setTimeout(() => voice(BY_ID[r.pen.species]?.voice, r.pen.needs.mood / 100), 700); setMsg({ feed: `${r.pen.name} tucks in.`, play: `${r.pen.name} explores the twig you offered, end to end.`, clean: `A fine mist. ${r.pen.name} grooms its antennae.` }[action]); }
    } catch (e) { sfx.nope(); setErr(e.message); }
  };
  const bury = async () => {
    setErr(''); setMsg('');
    try { take(await api('POST', '/barn/bury')); setMsg('Laid to rest under the old cottonwood. The mines may turn up another egg one day.'); } catch (e) { setErr(e.message); }
  };
  const fight = async () => {
    setErr(''); setMsg('');
    try { const r = await api('POST', '/barn/bout'); take(r); sfx.bell(); setBout(r.pen.lastBout); } catch (e) { sfx.nope(); setErr(e.message); }
  };
  if (!me) return <div className="screen barn"><div className="barn-empty panel"><h1 className="western">The Barn</h1><p>Sign in to see your barn.</p><SignIn /></div></div>;
  if (!b) return <div className="screen barn"><div className="barn-empty muted">Opening the barn doors…</div></div>;
  const now = Date.now() + skew.current;
  return (
    <div className="screen barn" data-test="barn">
      <div className="barn-wrap panel">
        <header className="barn-head">
          <h1 className="western">The Barn</h1>
          <button className="btn small ghost" onClick={() => { const v = !sound; setSnd(v); setSound(v); if (v && pen?.stage === 'creature') voice(BY_ID[pen.species]?.voice); }} aria-pressed={sound} title="Barn sounds">{sound ? '🔊' : '🔈'}</button>
        </header>
        {!pen && (
          <div className="barn-none" data-test="barn-empty">
            <div className="barn-stall" aria-hidden="true"><span>EMPTY STALL</span></div>
            <p>Nothing lives here yet. Old miners say the tunnels sometimes leave something behind.</p>
            <button className="mines-btn" onClick={goToMines}>Acid Mines</button>
          </div>
        )}
        {pen?.stage === 'egg' && (
          <div className="barn-body" data-test="barn-egg">
            <div className="barn-stage"><Stage pen={pen} poke={poke} reduced={reduced} /></div>
            <div className="barn-side">
              <h2 className="barn-name">An egg from the mines</h2>
              <p className="muted small">Warm, speckled and slightly too heavy. Something in there taps back when you knock.</p>
              <div className="barn-hatch"><span className="small muted">Hatches in</span><b className="num" data-test="hatch-left">{left(pen.hatchAt - now)}</b></div>
              <div className="barn-bar"><i style={{ width: `${Math.min(100, ((now - pen.eggAt) / (pen.hatchAt - pen.eggAt)) * 100)}%` }} /></div>
              <div className="barn-acts">
                <button className="btn" onClick={() => care('play')} disabled={pen.warmCoolMs > 0 && now < b.serverNow + pen.warmCoolMs} data-test="act-warm">Keep it warm</button>
                <button className="btn ghost" onClick={() => { sfx.egg(); setPoke((n) => n + 1); setMsg('Knock knock. Knock knock knock. It knows a joke you don\'t.'); }}>Knock</button>
              </div>
            </div>
          </div>
        )}
        {pen?.stage === 'dead' && (
          <div className="barn-body" data-test="barn-dead">
            <div className="barn-stage grave"><Stage pen={pen} poke={0} reduced={reduced} /></div>
            <div className="barn-side barn-rip">
              <h2 className="barn-name" data-test="creature-name">{pen.name}</h2>
              <p className="small barn-kind">{pen.speciesName} · Level {pen.level} · {pen.record.w}W {pen.record.l}L</p>
              <p className="small">It went without food for three weeks and quietly passed on {new Date(pen.diedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.</p>
              <p className="small muted">Bugs live fast. When you are ready, lay it to rest; another egg may turn up in the mines.</p>
              <div className="barn-acts"><button className="btn" onClick={bury} data-test="bury">Lay to rest</button></div>
            </div>
          </div>
        )}
        {pen?.stage === 'creature' && (
          <div className="barn-body" data-test="barn-creature" data-species={pen.species}>
            <div className="barn-stage" onClick={() => { setPoke((n) => n + 1); voice(BY_ID[pen.species]?.voice, pen.needs.mood / 100); }}><Stage pen={pen} poke={poke} reduced={reduced} /><span className={`barn-mood m-${pen.mood}`}>{pen.mood}</span></div>
            <div className="barn-side">
              <h2 className="barn-name" data-test="creature-name">{pen.name}</h2>
              <p className="small barn-kind">{pen.speciesName} · <b>Level {pen.level}</b>{pen.feederUntil > b.serverNow && <span className="barn-feeder" data-test="barn-feeder" title="The automatic feeder keeps the bowl full and the hunger clock paused"> · 🥣 Feeder until {new Date(pen.feederUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}</p>
              {pen.starving > 0 && <p className={`barn-warn w${pen.starving} small`} role="status" data-test="barn-warn">{pen.name} {WARN[pen.starving]}</p>}
              <div className="barn-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'care'} className={tab === 'care' ? 'on' : ''} onClick={() => setTab('care')} data-test="tab-care">Care</button>
                <button role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')} data-test="tab-notes">Field notes</button>
              </div>
              {tab === 'notes' ? <Notes key={pen.species} bug={BY_ID[pen.species]} /> : (<>
                <div className="barn-needs">
                  {Object.entries(NEED).map(([k, label]) => <div key={k} className="barn-need"><span className="small">{label}</span><div className={`barn-bar ${pen.needs[k] < 30 ? 'low' : ''}`}><i style={{ width: `${pen.needs[k]}%` }} /></div></div>)}
                  <div className="barn-need"><span className="small">XP</span><div className="barn-bar xp"><i style={{ width: `${pen.xpNext ? ((pen.xp - pen.xpThis) / (pen.xpNext - pen.xpThis)) * 100 : 100}%` }} /></div></div>
                </div>
                <div className="barn-acts">
                  {Object.entries(ACT).map(([k, [label, cost]]) => { const cd = Math.max(0, b.serverNow + pen.cool[k] - now); return <button key={k} className="btn" disabled={cd > 0} onClick={() => care(k)} data-test={`act-${k}`}>{label}<small>{cd > 0 ? left(cd) : cost}</small></button>; })}
                </div>
                <ul className="barn-abil">
                  {pen.abilities.map((a) => <li key={a.name} className={a.unlocked ? 'on' : ''}>{a.unlocked ? '★' : '🔒'} {a.name}{!a.unlocked && <span className="muted"> · Lv {a.level}</span>}</li>)}
                </ul>
                {pen.arena ? (
                  <div className="barn-bouts" data-test="barn-bouts">
                    <button className="btn" onClick={fight} disabled={b.serverNow + pen.boutCoolMs > now} data-test="bout-start">Barn bout<small>{b.serverNow + pen.boutCoolMs > now ? left(b.serverNow + pen.boutCoolMs - now) : 'just for show'}</small></button>
                    <span className="small" data-test="bout-record">{pen.record.w}W · {pen.record.l}L{pen.record.d ? ` · ${pen.record.d}D` : ''}</span>
                    {pen.lastBout && <button className="btn ghost small" onClick={() => setBout(pen.lastBout)} data-test="bout-replay">Replay last</button>}
                  </div>
                ) : <p className="small muted barn-arena">At level 5 it can enter barn bouts (just for show).</p>}
              </>)}
            </div>
          </div>
        )}
        {bout && <Bout key={bout.at} bout={bout} reduced={reduced} onClose={() => setBout(null)} />}
        <div className="barn-msg small" aria-live="polite">{err ? <span className="err">{err}</span> : msg}</div>
      </div>
    </div>
  );
}
