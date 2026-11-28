// The Barn: your stalls of eggs and bugs, one of them your partner. Everything shown here comes from the server (GET /api/barn);
// the page only draws it and asks the server to feed, play or clean. Care scrolls on small screens.
// v33: residents are real bugs drawn as pixel sprites, with a paged "Field notes" sheet; neglect warnings; a gravestone.
import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, refreshSession, useSession } from '../api.js';
import { money } from '../util.js';
import { SignIn } from '../Home.jsx';
import { goToMines } from '../App.jsx';
import { BY_ID, formOf } from '../../../server/engine/creatures.js';
import { movesFor, STANCES } from '../../../server/engine/bug-combat.js';
import { drawEgg } from './draw.js';
import { drawBug, drawGrave, youngForm } from './sprite.js';
import { voice, sfx, setSound, soundOn } from './sfx.js';
import Bout, { mergeFight } from './Bout.jsx';
import Ring from './Ring.jsx';
import FightFx from './FightFx.jsx';
import BugCard, { TypeChip, STAGES, VarietyNote } from './BugCard.jsx';
import FactCard from './FactCard.jsx';
import { varietyFor } from '../../../server/engine/variety.js';
import { TYPES, RARITY, typeOf, rarityOf } from '../../../server/engine/bug-types.js';
import { DEX_ORDER, DEX_TIERS } from './dexOrder.js';
import Dizzy from './Dizzy.jsx';
import Circuit from './Circuit.jsx';
import Gym from './Gym.jsx';
import Trades from './Trades.jsx';
import { LORE, loreLine } from '../../../server/engine/lore.js';
import { isSteeze, careLabel, steezeCareLine } from '../../../server/engine/steeze.js';
import { navigate } from '../App.jsx';
import './barn.css';

const BugCenter = lazy(() => import('../bugcenter/BugCenter.jsx'));

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
    <div className="barn-notes" id="barn-panel-notes" role="tabpanel" aria-labelledby="barn-tab-notes" data-test="barn-notes">
      <p className="barn-ledger-kicker small" data-test="bug-ledger-kicker">Bug Ledger{rarityOf(bug.id) === 4 ? ' · Legendary' : ''}</p>
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

/** HP on the bug, Game Boy style. */
function HpTag({ pen }) {
  const pct = Math.max(0, Math.min(100, pen.health ?? 100));
  return <span className={`barn-hp${pen.fainted ? ' low' : ''}`} data-test="barn-hp" role="meter" aria-label={`${pen.name} health`} aria-valuemin={0} aria-valuemax={pen.maxHp} aria-valuenow={pen.hp}>
    <b>HP</b><span className="barn-hp-bar"><i style={{ width: `${pct}%` }} /></span><span className="num">{pen.hp}/{pen.maxHp}</span>
  </span>;
}

function SteezePic({ className, label }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <div className={`${className} steeze-missing`} aria-label={label}>STEEZE</div>;
  return <img className={`${className} steeze-art`} src="/api/steeze.png" alt={label || ''} onError={() => setOk(false)} />;
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
  const label = pen.stage === 'egg' ? 'A speckled egg in a straw nest' : pen.stage === 'dead' ? `A small headstone for ${pen.name}` : `${pen.name}, a ${pen.speciesName}`;
  if (pen.stage === 'creature' && pen.species === 'steeze') {
    return <div className="barn-canvas steeze-art-wrap" data-test="barn-canvas"><SteezePic className="steeze-art" label={label} /></div>;
  }
  return <canvas ref={ref} className="barn-canvas" data-test="barn-canvas" aria-label={label} />;
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
  if (bug.species === 'steeze') return <SteezePic className="barn-thumb" label="" />;
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
    <button className={`barn-stall-pick farm${sel === 'farm' ? ' on' : ''}`} aria-pressed={sel === 'farm'} onClick={() => onPick('farm')} data-test="stall-farm"><span className="barn-stall-glyph" aria-hidden="true">🌾</span><span className="small">GFR Farms · {stable.farm?.length || 0}</span></button>
  </div>;
}

const FARM_LINES = [
  'Out past the tailings pond. Clover to the knees, a heated barn, and a farmhand named Gus who sings to them.',
  'Nothing ages at GFR Farms. Nobody gets hungry, nobody gets sick, nobody levels up. They just wait, fat and happy.',
  'Gus says the old foreman kept every bug he ever caught out here. Gus says a lot of things.',
];
/** GFR Farms: every bug you keep beyond your stalls, frozen in time. Bring one back to a free stall, or swap it for a stall bug. */
function Farm({ stable, busy, act, take, setMsg }) {
  const out = stable.bugs.filter((bug) => bug.farmable), [swap, setSwap] = useState(out[0]?.id ?? null), full = !stable.room;
  const pickOut = out.some((bug) => bug.id === swap) ? swap : out[0]?.id ?? null;
  const back = (bug) => act(async () => { take(await api('POST', '/barn/farm/back', { bug: bug.id, ...(full ? { swap: pickOut } : {}) }));
    const gone = full && out.find((x) => x.id === pickOut); setMsg(gone ? `${bug.name} is back in the barn. ${gone.name} rides out to GFR Farms.` : `${bug.name} is back in the barn, exactly as it left.`); });
  const line = FARM_LINES[(stable.farm?.length || 0) % FARM_LINES.length];
  return <div className="farm" data-test="farm">
    <p className="farm-lead"><b className="western">GFR Farms</b> <span className="small muted">{line}</span></p>
    <p className="small farm-rule">Bugs here keep forever: no XP, no hunger, no harm, no fights. {stable.stalls} stalls are active in the barn.</p>
    {full && stable.farm?.length > 0 && (out.length
      ? <label className="small farm-swap">Stalls full. Send out <select value={pickOut ?? ''} onChange={(e) => setSwap(Number(e.target.value))} data-test="farm-swap-out">{out.map((bug) => <option key={bug.id} value={bug.id}>{bug.name} · Lv {bug.level}</option>)}</select></label>
      : <p className="small muted farm-swap">Stalls full, and none of your stall bugs can travel right now.</p>)}
    {stable.farm?.length ? <ul className="farm-list">
      {stable.farm.map((bug) => <li key={bug.id} className="farm-row" data-test="farm-bug">
        <BugThumb bug={bug} />
        <span className="farm-name"><b>{bug.name}</b><span className="small muted">Lv {bug.level} · {bug.speciesName}{bug.evo ? ` · Stage ${bug.evo === 2 ? 'III' : 'II'}` : ''}</span></span>
        <button className="btn small" onClick={() => back(bug)} disabled={busy || (full && pickOut == null)} data-test="farm-back">{full ? 'Swap in' : 'Bring back'}</button>
      </li>)}
    </ul> : <p className="small muted farm-empty">Nobody out here yet. When every stall is taken, new bugs come here. Or send one from its stall.</p>}
  </div>;
}

/** What the ? button says in each room: the rules the screens themselves no longer spell out. */
const HELP = {
  stalls: ['Feed, Play and Mist are free, each on its own cooldown. Each gives 9 XP up to level 5, then less every level, down to 2 XP from level 10.', 'Needs count in a fight: the lowest one is its condition.', 'Your partner (★) comes to the mine and lives in your terrarium. Bugs in their stalls live five times slower but still need care.', 'A bug that faints needs the Bug Center: free after an hour\'s rest, or $50 now.', 'Release lets a bug go. It wanders into the mines as a stray, where anyone can catch it, you included.','Stance is how it fights when you leave the moves to it. Attack adds damage, defense softens hits, speed helps it go first and dodge.', 'Up to six stalls are active. Bugs you gain with every stall taken go to GFR Farms, frozen in time: no XP, no hunger, no harm, no fights. Swap them in from the 🌾 GFR Farms tab.'],
  gym: ['Cardio and sparring are honest: a little power for good, no side effects.', 'A Double Shift builds power faster but drains mood and adds strain. Strain makes a bug unruly.', 'Roids make a bug far stronger and wreck its mood. The power fades as the roid load wears off.', 'Unruly bugs drag their feet in the mines and balk. A juiced bug may go into a roid rage and kill a wild bug it knocks out before you can jar it.', 'Cool Down & Stretch flushes roid load and strain faster. Both fade on their own, slowly.'],
  ring: ['Accept a challenge, challenge someone, or post a bout.', 'One fight at a time. A challenge waits if they are already in the ring.', 'The winner takes the pot. A knockout goes to the Bug Center.'],
  circuit: ['Beat the stops in order. A win pays XP and a one-time purse; a loss pays nothing.', 'Legendary bugs turn up in the mine a few times a year, one of each in the whole Academy.', 'Circuit bugs are drilled: tougher than a barn bug of the same level. Bring a type edge or a level or two.', 'Every ribbon raises the top level your bugs can reach by one.', 'After eight ribbons come the Fairgrounds: four judges, then the Grand Champion. The champion is a copy of the bug that last won the circuit. Take the rosette and yours defends it.', 'A stop marked ! is an errand: somebody wants something. Bring it and they pay. None of them are needed.', 'Your first ribbon and your first card each put something on the wall of My House.', 'Some stops hold a rare wild bug. Knock it out and you get three throws of a jar, as in the mine.', 'Every leader hands over a prize with the ribbon. Prizes work in circuit fights only.', 'Each area has a feature presentation after its ribbon: a one-of-a-kind bug with its own trick. Beat it for its card. You never have to.', 'After ribbon 2, the next four areas can be won in any order. Each ribbon you hold makes the ones you left tougher.', 'Leaders field their bugs one after another. Health carries over between rounds, and a bug that loses sits out the rest.', 'When a leader gives their tell, their big move is next: line up a guard.'],
  dex: ['A bug goes in the Bugdex once you have kept one, been in a fight with one, or spotted one down the mine.', 'II and III are its evolved stages. Each stays a question mark until you have kept or fought one that far along.', 'Watching somebody else\'s fight does not count. The bug has to have seen you too.'],
};

/** The Bugdex: every species, rarest first (dexOrder.js) under a divider for each tier, each with its two evolved stages beside it. A form you have met (`b.dex`:
 * kept, fought, or spotted down the mine) shows its face and opens its card; the rest are a question mark. How rare a
 * bug is and its type are posted either way. */
const FORMS = DEX_ORDER.flatMap(({ bug, no }) => STAGES.map((_, evo) => ({ bug, evo, key: formOf(bug.id, evo), no: String(no).padStart(2, '0') }))); // in Bugdex order, so ‹ › flip that way too
const FORM = new Map(FORMS.map((form) => [form.key, form]));
function Bugdex({ seen }) {
  const met = FORMS.filter((form) => seen.includes(form.key)), [open, setOpen] = useState(null), dialog = useRef(null), shut = useRef(null), on = FORMS.find((form) => form.key === open);
  useEffect(() => { const el = dialog.current; if (el && !el.open) { el.showModal(); shut.current.focus({ preventScroll: true }); } }, [open]); // Close, not the first arrow, so Enter does the safe thing
  const flip = (step) => setOpen(met[(met.indexOf(on) + step + met.length) % met.length].key);
  const tile = ({ bug, evo, key, no }) => {
    const rarity = rarityOf(bug.id), type = TYPES[typeOf(bug.id)]?.name, kind = !evo && <small className={`dex-kind r${rarity}`} aria-hidden={!seen.includes(key)}><b aria-hidden="true">{RARITY[rarity].mark}</b> {RARITY[rarity].name} <span>{type}</span></small>;
    return seen.includes(key)
      ? <button key={key} className={`dex-tile${evo ? ' evo' : ''}`} onClick={() => setOpen(key)} aria-label={evo ? `${bug.name}, ${STAGES[evo]}` : undefined} data-test="dex-met">
        <span className="num">{evo ? STAGES[evo].slice(6) : no}</span><BugThumb bug={{ species: bug.id, level: 10, style: evo === 1 ? { evo, variety: varietyFor(bug.id, bug.id) } : evo ? { evo } : null }} />{!evo && <b>{bug.name}</b>}{kind}
      </button>
      : <span key={key} role="img" className={`dex-tile unmet${evo ? ' evo' : ''}`} aria-label={`Number ${no}${evo ? `, ${STAGES[evo]}` : ''}: not met yet. ${RARITY[rarity].name} ${type}.`} data-test="dex-unmet"><span className="num">{evo ? STAGES[evo].slice(6) : no}</span><i aria-hidden="true">?</i>{kind}</span>;
  };
  return <div className="dex" data-test="bugdex">
    <p className="small dex-count" data-test="dex-count"><b className="num">{met.length} of {FORMS.length}</b> met{!met.length ? '. They turn up in fights and down the mine.' : met.length === FORMS.length ? '. That is all of them. They would like some privacy now.' : ''}</p>
    <p className="small barn-lore" data-test="dex-lore">{met.length === FORMS.length ? 'Every page full. Listen. Can you hear the kneeling?' : loreLine(`dex:${met.length}`, LORE)}</p>
    <ol className="dex-grid">
      {DEX_TIERS.flatMap((tier) => [
        <li key={`tier-${tier.rarity}`} className={`dex-tier r${tier.rarity}`} data-test="dex-tier"><span aria-hidden="true">{tier.mark}</span> {tier.name} <i className="num">{tier.bugs.length}</i></li>,
        ...tier.bugs.map(({ bug }) => <li key={bug.id} className="dex-fam" style={{ '--tc': TYPES[typeOf(bug.id)]?.color }} data-test="dex-fam" data-species={bug.id}>{tile(FORM.get(formOf(bug.id, 0)))}<div className="dex-evos">{tile(FORM.get(formOf(bug.id, 1)))}{tile(FORM.get(formOf(bug.id, 2)))}</div></li>),
      ])}
    </ol>
    {on && <dialog ref={dialog} className="dex-card" aria-label={`${on.bug.name}${on.evo ? `, ${STAGES[on.evo]}` : ''}: card`} onClose={() => setOpen(null)} onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      onKeyDown={(e) => { if (met.length > 1 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) flip(e.key === 'ArrowLeft' ? -1 : 1); }} data-test="dex-card">
      <BugCard key={open} species={on.bug.id} evo={on.evo} />
      <div className="barn-row">
        {met.length > 1 && <button className="btn" onClick={() => flip(-1)} aria-label="Previous bug" data-test="dex-prev">‹</button>}
        <button ref={shut} className="btn" onClick={() => dialog.current.close()} data-test="dex-close">Close</button>
        {met.length > 1 && <button className="btn" onClick={() => flip(1)} aria-label="Next bug" data-test="dex-next">›</button>}
      </div>
    </dialog>}
  </div>;
}

const PANES = [['card', 'Card'], ['combat', 'Combat'], ['notes', 'Bug Ledger']];
const WHERE = { ring: 'in the ring', circuit: 'on the circuit', mines: 'in the mines' };

/** Combat: its numbers, the stance it fights with when left to itself, and its moves. Type, trait and perk are on the card. */
function CombatPane({ pen, battle, draft, setDraft, save, busy, locked }) {
  const c = pen.combat;
  return <div className="bs-pane bs-combat" id="barn-panel-combat" role="tabpanel" aria-labelledby="barn-tab-combat">
    <dl className="bs-stats">
      {[['HP', c.maxHp], ['Damage', `+${Math.round((c.damageMultiplier - 1) * 100)}%`], ['Attack', `${c.stats.atk}/5`], ['Defense', `${c.stats.def}/5`], ['Speed', `${c.stats.spd}/5`]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}
    </dl>
    <fieldset className="bs-stance" disabled={busy || locked}>
      <label>Left to itself<select value={battle.stance} onChange={(e) => setDraft({ ...battle, stance: e.target.value })} data-test="battle-stance">{Object.values(STANCES).map((stance) => <option key={stance.id} value={stance.id}>{stance.name}</option>)}</select></label>
      <p className="small muted">{STANCES[battle.stance].description}</p>
      {draft && <div className="barn-row"><button className="btn small primary" onClick={save} data-test="battle-save">Save</button><button className="btn small ghost" onClick={() => setDraft(null)}>Discard</button></div>}
      {locked && <p className="small muted">Cancel your posted bout to change this.</p>}
    </fieldset>
    <ul className="bs-moves">
      {pen.abilities.map((a) => <li key={a.id} className={!a.unlocked ? 'locked' : ''}>
        <b>{a.name}</b>
        <span className="small num">{!a.unlocked ? `at level ${a.level}` : a.heal ? `heals ${a.heal}` : `${a.power} power · ${Math.round(a.accuracy * 100)}%`}{a.cooldown > 0 ? ` · rests ${a.cooldown}` : ''}</span>
        <small>{a.description}</small>
      </li>)}
    </ul>
  </div>;
}

/** One living bug: what it is and its record up top; the bug, its card (or combat, or field notes) and its care side by side. */
function Creature({ pen, b, stable, now, busy, care, makePartner, release, toFarm, poke, setPoke, reduced, tab, setTab, battle, draft, setDraft, save, toRing, replayLast, replayButton }) {
  const type = typeOf(pen.species), next = pen.abilities?.find((a) => !a.unlocked);
  const [letGo, setLetGo] = useState(false); // Release asks once, in place
  const [facts, setFacts] = useState(false);
  const keys = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const ids = PANES.map(([id]) => id), at = ids.indexOf(tab);
    const k = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length;
    setTab(ids[k]); e.currentTarget.querySelectorAll('[role="tab"]')[k].focus();
  };
  return <div className={`bs${tab === 'notes' ? ' bs-ledger' : ''}`} data-test="barn-creature" data-species={pen.species}>
    <div className="bs-top">
      <h2 className="barn-name" data-test="creature-name">{pen.name}</h2>
      <span className="bs-kind">{pen.speciesName}{youngForm(BY_ID[pen.species], pen.level) ? ' (larva)' : ''} · <b>Lv {pen.level}</b> <TypeChip type={type} small /></span>
      <span className="bs-rec num" data-test="bout-record" title="Ring record">{pen.record.w}W {pen.record.l}L{pen.record.d ? ` ${pen.record.d}D` : ''}</span>
      {pen.title && <span className="small barn-title">{pen.title}</span>}
      {pen.style?.evo === 1 && pen.style?.variety && <VarietyNote variety={pen.style.variety} short bare={!pen.botched && pen.species !== 'steeze'} />}
      {pen.gym?.juiced ? <span className="bs-gym" data-test="barn-juiced" title={`Unruly ${pen.gym.unruly} · mine pace ${Math.round(pen.gym.mineSpeed * 100)}% · roid rage ${Math.round(pen.gym.rage * 100)}%`}>💉 JUICED · RAGE {Math.round(pen.gym.rage * 100)}%</span>
        : pen.gym?.strain >= 40 ? <span className="bs-gym strain" data-test="barn-overworked">OVERWORKED</span> : null}
      {pen.evo > 0 && <span className="small barn-title" data-test="barn-evo">{pen.evo === 2 ? 'Stage III' : 'Stage II'}{pen.botched ? `, more or less · ${pen.botched}` : ''}</span>}
      {stable.bugs.length > 1 && (pen.partner ? <span className="bs-partner small" data-test="barn-partner">★ Partner</span>
        : <button className="btn small ghost" onClick={makePartner} disabled={busy || !!b.live} data-test="make-partner">Make partner</button>)}
    </div>
    {pen.sick && <p className="barn-warn small" role="status" data-test="barn-sick">{pen.name} drank something purple in the mines. Feeding it will not help. The <button className="linklike" onClick={() => navigate('/barn/center')}>Bug Center</button> might.</p>}
    {pen.taken && <p className="barn-warn small" role="status" data-test="barn-taken">{pen.name} left with someone at the mine lift. There is a ticket in its stall. Take it to the <button className="linklike" onClick={() => navigate('/barn/center')}>Bug Center</button>.</p>}
    {pen.fainted && !pen.sick && !pen.taken && <p className="barn-warn small" role="status" data-test="barn-fainted">Fainted {WHERE[pen.faintedIn] || 'in the mines'}{pen.faintedBy ? `, beaten by ${pen.faintedBy}` : ''}. The <button className="linklike" onClick={() => navigate('/barn/center')}>Bug Center</button> fixes it free in an hour, or now for ${pen.healCost}.</p>}
    {pen.heesheeHeld && <p className="barn-warn small" role="status" data-test="barn-heeshee-held">Your bug is nowhere to be found. The Heeshee Mazode took it.</p>}
    {pen.starving > 0 && <p className={`barn-warn w${pen.starving} small`} role="status" data-test="barn-warn">{pen.name} {WARN[pen.starving]}</p>}
    <div className="bs-grid">
      <div className={`barn-stage bs-stage${pen.fainted ? ' fainted' : ''}${pen.sick ? ' sick' : ''}${pen.taken ? ' taken' : ''}`} onClick={() => { setPoke((n) => n + 1); if (!pen.fainted) voice(BY_ID[pen.species]?.voice, pen.needs.mood / 100); }}>
        <Stage pen={pen} poke={poke} reduced={reduced} />
        {pen.heesheeHeld ? <span className="barn-mood m-fainted" data-test="barn-heeshee-chip">missing</span> : pen.taken ? <span className="barn-mood m-fainted" data-test="barn-taken-chip">ticket no. 2</span> : pen.fainted ? <><span className="barn-mood m-fainted" data-test="barn-fainted-chip">{pen.sick ? 'not well' : 'fainted'}</span><Dizzy size={64} className="barn-dizzy" label={`${pen.name} fainted`} /></> : <span className={`barn-mood m-${pen.mood}`}>{pen.mood}</span>}
        {pen.maxHp > 0 && <HpTag pen={pen} />}
      </div>
      <div className="bs-care" data-test="barn-progress">
        <div className="barn-needs">
          {Object.entries(NEED).map(([k, label]) => <div key={k} className={`barn-need${k === 'mood' && pen.gym?.juiced ? ' juiced' : ''}`} data-test={`need-${k}`}><span className="small">{label}</span><div className={`barn-bar ${pen.needs[k] < 30 ? 'low' : ''}`}><i style={{ width: `${pen.needs[k]}%` }} /></div></div>)}
        </div>
        <div className={`barn-acts${isSteeze(pen.species) ? ' steeze-acts' : ''}`}>
          {Object.keys(ACT).map((k) => { const cd = Math.max(0, b.serverNow + pen.cool[k] - now); return <button key={k} className="btn" disabled={busy || cd > 0 || pen.sick || pen.taken || pen.heesheeHeld} onClick={() => care(k)} data-test={`act-${k}`}>{careLabel(k, pen.species)}<small>{cd > 0 ? left(cd) : `+${pen.careXp} XP`}</small></button>; })}
        </div>
        <div className="bs-xp">
          <span className="small num">{pen.xp.toLocaleString()} XP{pen.xpNext ? ` · ${(pen.xpNext - pen.xp).toLocaleString()} to level ${pen.level + 1}` : ' · top level, for now'}</span>
          <div className="barn-bar xp" role="progressbar" aria-label={`Level ${pen.level} progress`} aria-valuemin={0} aria-valuemax={pen.xpNext ? pen.xpNext - pen.xpThis : 1} aria-valuenow={pen.xpNext ? pen.xp - pen.xpThis : 1}><i style={{ width: `${pen.xpNext ? ((pen.xp - pen.xpThis) / (pen.xpNext - pen.xpThis)) * 100 : 100}%` }} /></div>
          {next && <span className="small muted">Learns {next.name} at level {next.level}</span>}
        </div>
        {(pen.feederUntil > b.serverNow || pen.lunch) && <p className="small barn-supplies">
          {pen.feederUntil > b.serverNow && <span className="barn-feeder" data-test="barn-feeder">🥣 Feeder until {new Date(pen.feederUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
          {pen.lunch && <span className="barn-feeder" data-test="barn-lunch">🍱 {pen.lunch.name}, +{pen.lunch.heal} HP</span>}
        </p>}
        {letGo ? <div className="bs-letgo" role="group" aria-label={`Release ${pen.name}`}>
          <p className="small">Let {pen.name} go? It wanders off into the mines, where anyone can jar it. You included.</p>
          <div className="barn-row"><button className="btn small" onClick={release} disabled={busy || !!b.live} data-test="release-confirm">Release {pen.name}</button><button className="btn small ghost" onClick={() => setLetGo(false)}>Keep it</button></div>
        </div> : <div className="barn-row bs-more">
          <button className="btn small" onClick={toRing}>Find a bout</button>
          <button className="btn small ghost" onClick={() => setFacts(true)} data-test="bug-facts">Facts</button>
          {pen.lastBout && <button ref={replayButton} className="btn small ghost" disabled={busy} onClick={replayLast} data-test="bout-replay">Replay last fight</button>}
          {rarityOf(pen.species) === 4 ? <span className="small muted" data-test="no-release">Legendary: it can't be released.</span>
            : pen.species === 'steeze' ? <span className="small muted" data-test="no-release">STEEZE? Leave? He just unpacked his golf bag. The stall is his now.</span>
            : <button className="btn small ghost" onClick={() => setLetGo(true)} data-test="release">Release</button>}
          {pen.farmable && <button className="btn small ghost" onClick={toFarm} disabled={busy || !!b.live} data-test="to-farm">To GFR Farms</button>}
        </div>}
      </div>
      <div className="bs-info">
        <div className="barn-tabs" role="tablist" aria-label="Bug details" onKeyDown={keys}>
          {PANES.map(([id, name]) => <button key={id} id={`barn-tab-${id}`} role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`barn-panel-${id}`} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} data-test={`tab-${id}`}>{name}</button>)}
        </div>
        {tab === 'notes' ? <Notes key={pen.species} bug={BY_ID[pen.species]} />
          : tab === 'combat' ? <CombatPane pen={pen} battle={battle} draft={draft} setDraft={setDraft} save={save} busy={busy} locked={!!b.openBout} />
          : <div className="bs-pane bs-cardpane" id="barn-panel-card" role="tabpanel" aria-labelledby="barn-tab-card"><BugCard species={pen.species} bug={pen} /></div>}
      </div>
    </div>
    {facts && <FactCard species={pen.species} bug={pen} onClose={() => setFacts(false)} reduced={reduced} />}
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
  const [fx, setFx] = useState(null); // the FIGHT moment between joining a bout and the ring opening
  const [battleDraft, setBattleDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mutation = useRef(0);
  const [tab, setTab] = useState('card');
  const [help, setHelp] = useState(false);
  // The Barn's rooms: your stalls, the ring, the circuit, the gym, the Bugdex. /barn?room=circuit (or gym, or dex) opens on that one.
  const [view, setView] = useState(() => { const room = new URLSearchParams(window.location.search).get('room'); return ['circuit', 'gym', 'dex', 'trade'].includes(room) ? room : 'stalls'; });
  const ring = view === 'ring', stalls = view === 'stalls';
  const setRing = (on) => setView(on ? 'ring' : 'stalls');
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
  const stable = b?.stable, pen = sel === 'build' || sel === 'farm' ? null : stable?.bugs.find((bug) => bug.id === sel) || b?.pen;
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
  /** A jar at the wild bug your bug has just knocked out on the circuit. `landed` resolves when the thrown jar has finished rocking. */
  const circuitJar = async (landed) => {
    try { const r = await api('POST', '/circuit/jar', { fight: held.current?.id, have: held.current?.rounds.length || 0 }); Promise.resolve(landed).then(() => { held.current = mergeFight(held.current, r.fight); setBout(held.current); }); return r.held; } catch (e) { return e.message; }
  };
  const lineUp = async (moves) => {
    try { const { fight } = await api('POST', `/barn/fight/${liveId}/moves`, { moves, have: held.current?.rounds.length || 0 }); held.current = mergeFight(held.current, fight); setBout(held.current); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { if (b && !ringOpened.current) { ringOpened.current = true; if (b.challenges.incoming.length) setRing(true); } }, [b]);
  const battle = battleDraft || pen?.battle;
  // hatch moment: the egg's countdown ran out on this screen, so ask the server (it decides)
  useEffect(() => { if (pen?.stage === 'egg' && Date.now() + skew.current >= pen.hatchAt) load(); });
  useEffect(() => { if (wasEgg.current && wasEgg.current === pen?.id && pen.stage === 'creature') { sfx.hatch(); setMsg(`It hatched! Meet ${pen.name}.`); setTimeout(() => voice(BY_ID[pen.species]?.voice), 900); } wasEgg.current = pen?.stage === 'egg' ? pen.id : null; }, [pen?.stage, pen?.id]);
  const act = async (work) => {
    if (pending.current || bout) return false;
    pending.current = true; mutation.current += 1; setBusy(true);
    setErr(''); setMsg('');
    try { await work(); return true; } catch (e) { sfx.nope(); setErr(e.message); return false; }
    finally { pending.current = false; setBusy(false); load(); }
  };
  const care = (action) => act(async () => {
      const r = await api('POST', '/barn/care', { action, bug: pen.id }); take(r); setPoke((n) => n + 1);
      const cared = r.stable.bugs.find((bug) => bug.id === pen.id) || r.pen;
      if (cared.stage === 'egg') { sfx.warm(); setMsg('You keep the egg warm. Something inside kicks back.'); }
      else { sfx[action](); setTimeout(() => voice(BY_ID[cared.species]?.voice, cared.needs.mood / 100), 700); setMsg(steezeCareLine(action, cared.species) || { feed: `${cared.name} tucks in.`, play: `${cared.name} explores the twig you offered, end to end.`, clean: `A fine mist. ${cared.name} grooms its antennae.` }[action]); }
  });
  const bury = () => act(async () => {
    take(await api('POST', '/barn/bury', { bug: pen.id })); setSel(null); setBattleDraft(null); setMsg('Laid to rest under the old cottonwood.');
  });
  const wager = (method, url, body) => {
    if (battleDraft) return Promise.resolve(false);
    return act(async () => { take(await api(method, url, body)); await refreshSession(); });
  };
  const watch = (id) => act(async () => { const fight = await api('GET', `/barn/fights/${id}`); setReplay(true); setBout(fight); });
  const saveBattle = () => act(async () => {
    take(await api('PATCH', '/barn/battle', { stance: battleDraft.stance, bug: pen.id })); setBattleDraft(null); setMsg('Stance saved.');
  });
  const release = () => act(async () => { const name = pen.name; take(await api('POST', '/barn/release', { bug: pen.id })); setSel(null); setMsg(`${name} scuttles off toward the mines. Somebody might jar it someday.`); });
  const toFarm = () => act(async () => { const name = pen.name; take(await api('POST', '/barn/farm', { bug: pen.id })); setSel('farm'); setMsg(`${name} rides out to GFR Farms. Gus waves from the gate.`); });
  const makePartner = () => act(async () => { take(await api('POST', '/barn/partner', { bug: pen.id })); setMsg(`${pen.name} is coming with you now.`); });
  const build = () => act(async () => { take(await api('POST', '/barn/stalls')); await refreshSession(); setSel(null); setMsg('One new stall. It smells of sawdust and ambition.'); });
  if (!me) return <div className="screen barn"><div className="barn-empty panel"><h1 className="western">The Barn</h1><p>Sign in to see your barn.</p><SignIn /></div></div>;
  if (!b) return <div className="screen barn"><div className="barn-empty muted">{err ? <><p role="alert">{err}</p><button className="btn" onClick={() => { setErr(''); load(); }}>Try again</button></> : <>Opening the barn doors…<p className="small barn-lore">{loreLine(Math.floor(Date.now() / 60e3))}</p></>}</div></div>;
  const now = Date.now() + skew.current;
    const waiting = b.challenges.incoming.length + b.bouts.filter((x) => x.hostId !== me.id).length;
  return (
    <div className="screen barn" data-test="barn">
      <div className="barn-wrap panel">
        <header className="barn-head">
          <h1 className="western">The Barn</h1>
          <div className="barn-head-acts">
            {stable?.bugs.some((bug) => bug.stage === 'creature') && <CenterDoor urgent={stable.bugs.some((bug) => bug.fainted) || !!b.evoNews} />}
            <div className="barn-rooms" role="group" aria-label="Barn">
              {[['stalls', 'Stalls'], ['ring', waiting ? `Ring · ${waiting}` : 'Ring'], ['circuit', 'Circuit'], ['gym', 'Gym'], ['trade', b.tradeWaiting ? `Trade · ${b.tradeWaiting}` : 'Trade'], ['dex', 'Bugdex']].map(([id, label]) => <button key={id} className={`btn small${view === id ? ' on' : ' ghost'}${(id === 'ring' && waiting && !ring) || (id === 'trade' && b.tradeWaiting && view !== 'trade') ? ' waiting' : ''}`} aria-pressed={view === id} onClick={() => setView(id)} data-test={id === 'ring' ? 'ring-toggle' : `room-${id}`}>{label}</button>)}
            </div>
            <button className="btn small ghost barn-help-btn" onClick={() => setHelp(!help)} aria-expanded={help} aria-controls="barn-help" title="How the Barn works" data-test="barn-help">?</button>
            <button className="btn small ghost" onClick={() => { const v = !sound; setSnd(v); setSound(v); if (v && pen?.stage === 'creature') voice(BY_ID[pen.species]?.voice); }} aria-pressed={sound} title="Barn sounds">{sound ? '🔊' : '🔈'}</button>
          </div>
          {b.evoNews && <p className="barn-warn barn-news" role="status" data-test="barn-evo-news">Nurse Hikari left word at the Bug Center — important news about {b.evoNews.name}.</p>}
          {b.foremanNote && (
            <p className="barn-warn barn-news barn-foreman-note" role="status" data-test="foreman-note">
              {b.foremanNote.text}
              {' '}
              <button type="button" className="linklike" data-test="foreman-note-ack" onClick={() => act(async () => { await api('POST', '/barn/foreman-note/ack', { id: b.foremanNote.id }); await refreshSession(); take(await api('GET', '/barn')); })}>Got it</button>
            </p>
          )}
        </header>
        {help && <aside id="barn-help" className="barn-help" data-test="barn-help-panel"><ul>{HELP[view].map((line) => <li key={line}>{line}</li>)}</ul><button className="btn small ghost" onClick={() => setHelp(false)}>Got it</button></aside>}
        {ring && <Ring b={b} meId={me.id} now={now} busy={busy} unsaved={!!battleDraft} reduced={reduced} Thumb={BugThumb}
          post={(bug, amount) => wager('POST', '/barn/bouts', { stake: amount, bug })}
          join={(id, bug, risk) => wager('POST', `/barn/bouts/${id}/join`, { bug, risk })}
          cancel={(id) => act(async () => { take(await api('DELETE', `/barn/bouts/${id}`)); await refreshSession(); setMsg('Bout cancelled. Your stake is back.'); })}
          call={(to, their, amount, bug) => act(async () => { take(await api('POST', '/barn/challenges', { to, their, stake: amount, bug })); setMsg('Challenge sent. It stands for a day.'); })}
          accept={(id, risk) => wager('POST', `/barn/challenges/${id}/accept`, { risk })}
          drop={(id) => act(async () => { take(await api('DELETE', `/barn/challenges/${id}`)); await refreshSession(); })}
          watch={watch} onFight={(you, them) => setFx({ you, them })} />}
        {fx && <FightFx you={fx.you} them={fx.them} reduced={reduced} Thumb={BugThumb} onDone={() => setFx(null)} />}
        {view === 'circuit' && <Circuit b={b} busy={busy} act={act} boutOpen={!!bout} />}
        {view === 'gym' && <Gym b={b} sel={pen?.id} busy={busy} act={act} take={take} now={now} />}
        {view === 'dex' && <Bugdex seen={b.dex || []} />}
        {view === 'trade' && <Trades meId={me.id} Thumb={BugThumb} onChange={load} />}
        {stalls && (stable?.bugs.length > 0 || stable?.farm?.length > 0) && <Stalls stable={stable} sel={sel === 'build' || sel === 'farm' ? sel : pen?.id} onPick={pick} />}
        {stalls && sel === 'farm' && stable && <Farm stable={stable} busy={busy} act={act} take={take} setMsg={setMsg} />}
        {stalls && sel === 'build' && stable?.nextStall != null && (
          <div className="barn-none" data-test="barn-build">
            <div className="barn-stall" aria-hidden="true"><span>STALL {stable.stalls + 1}</span></div>
            <p>Room for one more bug. The carpenter wants {money(stable.nextStall)} and will not discuss it.</p>
            <button className="btn" onClick={build} disabled={busy || stable.nextStall > b.bankroll} data-test="stall-build">{stable.nextStall > b.bankroll ? `Need ${money(stable.nextStall)}` : `Build it · ${money(stable.nextStall)}`}</button>
          </div>
        )}
        {stalls && !pen && sel !== 'build' && sel !== 'farm' && (
          <div className="barn-none" data-test="barn-empty">
            <div className="barn-stall" aria-hidden="true"><span>EMPTY STALL</span></div>
            <p>Nothing lives here yet. Old miners say the tunnels sometimes leave something behind.</p>
            <button className="mines-btn" onClick={goToMines}>Acid Mines</button>
          </div>
        )}
        {stalls && pen?.stage === 'egg' && (
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
        {stalls && pen?.stage === 'dead' && (
          <div className="barn-body" data-test="barn-dead">
            <div className="barn-stage grave"><Stage pen={pen} poke={0} reduced={reduced} /></div>
            <div className="barn-side barn-rip">
              <h2 className="barn-name" data-test="creature-name">{pen.name}</h2>
              <p className="small barn-kind">{pen.speciesName} · Level {pen.level} · {pen.record.w}W {pen.record.l}L</p>
              <p className="small">It went without food for three weeks and quietly passed on {new Date(pen.diedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.</p>
              <p className="small muted">Bugs live fast. Lay it to rest when you're ready.</p>
              <div className="barn-acts"><button className="btn" onClick={bury} disabled={busy} data-test="bury">Lay to rest</button></div>
            </div>
          </div>
        )}
        {stalls && pen?.stage === 'creature' && <Creature key={pen.id} pen={pen} b={b} stable={stable} now={now} busy={busy} care={care} makePartner={makePartner} release={release} toFarm={toFarm} poke={poke} setPoke={setPoke} reduced={reduced}
          tab={tab} setTab={setTab} battle={battle} draft={battleDraft} setDraft={setBattleDraft} save={saveBattle} toRing={() => setRing(true)}
          replayLast={() => { setReplay(true); setBout(pen.lastBout); }} replayButton={replayButton} />}
        {bout && !fx && <Bout key={bout.id || bout.at} bout={bout} onLine={lineUp} onJar={bout.kind === 'circuit' && bout.jar ? circuitJar : undefined} closeLabel={bout.kind === 'circuit' ? 'Back to the circuit' : undefined} replay={replay} reduced={reduced} sound={sound} onSound={() => { setSnd(!sound); setSound(!sound); }} onClose={() => { if (bout.live) setWalkedOut(bout.id); setBout(null); requestAnimationFrame(() => (replayButton.current || document.getElementById(`barn-tab-${tab}`) || document.querySelector('[data-test="ring-toggle"]'))?.focus()); }} />}
        <div className="barn-msg small" aria-live="polite">{err ? <span className="err" role="alert">{err}</span> : msg}</div>
      </div>
    </div>
  );
}
