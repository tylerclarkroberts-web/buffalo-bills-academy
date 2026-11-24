// The Bug Gym: a room of the Barn. Pick a standing bug, read its condition, pick a path. The server decides every
// number (POST /api/barn/gym, server/engine/gym.js); this page only draws them. One screen, no scrolling, on a phone:
// after a session its result takes the place of the machines (Back to gym brings them back), so the two never share the space.
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { money } from '../util.js';
import { BY_ID } from '../../../server/engine/creatures.js';
import { PATHS, PATH_IDS, ROID_POWER, GEAR } from '../../../server/engine/gym.js';
import { drawBug } from './sprite.js';
import { GymPix } from './GymPix.jsx';
import { sfx } from './sfx.js';
import './gym.css';

const pct = (v) => `${Math.round(v * 100)}%`;
const plusPct = (v) => `+${+(v * 100).toFixed(1)}%`;
/** The daily lock's countdown: "17h 42m", then "41m 09s" in the last hour, then "9s". */
const until = (ms) => {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  const m = Math.ceil(s / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
const lockOf = (x, b, now) => Math.max(0, b.serverNow + (x.gym?.readyIn || 0) - now);
const mins = (ms) => { const m = Math.ceil(ms / 60e3); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
/** What each machine does, in one line: the numbers are the server's (engine/gym.js), so the page cannot drift from them. */
const EFFECT = {
  clean: () => `${plusPct(PATHS.clean.fit)} power · mood ${sign(PATHS.clean.needs.mood)}`,
  spar: () => `${plusPct(PATHS.spar.rough.fit)}–${plusPct(PATHS.spar.sharp.fit).slice(1)} power · ${PATHS.spar.rough.xp}–${PATHS.spar.sharp.xp} XP`,
  overwork: () => `${plusPct(PATHS.overwork.fit)} power · mood ${sign(PATHS.overwork.needs.mood)} · strain +${PATHS.overwork.strain}`,
  roids: () => `${plusPct(PATHS.roids.roid * ROID_POWER)} power · MOOD ${sign(PATHS.roids.needs.mood)}`,
  cooldown: () => `roid ${sign(PATHS.cooldown.roid)} · strain ${sign(PATHS.cooldown.strain)}`,
};
const TONE = { clean: 'ok', spar: 'ok', overwork: 'warn', roids: 'bad', cooldown: 'calm' };
/** The coach, when nothing has happened yet. */
const COACH = ['The coach is eating a raw egg. He nods at the machines.', 'Somebody has written NO PAIN on the mirror. Somebody else has added "please".', 'A rope hangs from the rafters. Nobody has ever climbed it.'];
const LINES = {
  clean: (n) => `${n} does laps of the water trough. Nobody claps. It feels good anyway.`,
  sharp: (n) => `${n} boxes a woodlouse for three rounds and wins all of them on points. Crisp.`,
  rough: (n) => `${n} and a woodlouse roll around in the sawdust. Nobody is sure who won. Lessons were learned.`,
  overwork: (n) => `${n} does a second shift on the bench. Then a third. Its antennae are shaking.`,
  roids: (n) => `${n} drinks the vial. Its shell bulges. It looks at you like it has never met you.`,
  cooldown: (n) => `${n} sits in an ice bath and talks about its childhood. The edge comes off.`,
};

export const canTrain = (bug) => bug?.stage === 'creature' && !bug.fainted && !bug.sick && !bug.taken && !bug.heesheeHeld;

function Sprite({ bug }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, kind = BY_ID[bug.species]; if (!c || !kind) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = 120 * dpr; c.height = 96 * dpr;
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    drawBug(x, kind, { w: c.width, h: c.height, still: true, style: bug.style, level: bug.level });
  }, [bug.species, bug.level, JSON.stringify(bug.style || null)]);
  if (bug.species === 'steeze') return <img className="gym-sprite" src="/api/steeze.png" alt="" />;
  return <canvas ref={ref} className="gym-sprite" aria-hidden="true" />;
}

function Meter({ label, value, max = 100, tone = '', from, text, test }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100)), was = from != null ? Math.max(0, Math.min(100, (from / max) * 100)) : null;
  return <div className={`gym-meter ${tone}`} data-test={test}>
    <span className="gym-meter-label">{label}</span>
    <div className="gym-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      {was != null && was > w && <b className="gym-bar-lost" style={{ left: `${w}%`, width: `${was - w}%` }} />}
      <i style={{ width: `${w}%` }} />
    </div>
    <span className="gym-meter-val num">{text ?? Math.round(value)}</span>
  </div>;
}

/** The session that just happened: what it did, with the mood change as big as it deserves. */
function Result({ r, onClose }) {
  const back = useRef(null);
  useEffect(() => { back.current?.focus({ preventScroll: true }); }, [r]);
  const mood = r.delta.mood, power = r.change.power, tanked = mood <= -25;
  const line = (LINES[r.outcome || r.path] || LINES.clean)(r.bugName);
  return <div className={`gym-result ${TONE[r.path]}${tanked ? ' tanked' : ''}`} role="status" data-test="gym-result" data-path={r.path}>
    <div className="gym-result-top"><p className="gym-result-line">{line}</p><button className="btn small ghost gym-result-x" onClick={onClose} aria-label="Back to gym" data-test="gym-result-x">✕</button></div>
    <div className="gym-deltas">
      <span className={`gym-delta mood${mood < 0 ? ' down' : ' up'}`} data-test="gym-mood-delta"><small>Mood</small><b>{sign(mood)}</b><em className="num">{r.before.needs.mood} → {r.after.needs.mood}</em></span>
      <span className={`gym-delta power${power > 0 ? ' up' : power < 0 ? ' down' : ''}`} data-test="gym-power-delta"><small>Power</small><b>{power >= 0 ? '+' : '−'}{Math.abs(+(power * 100).toFixed(1))}%</b><em className="num">{plusPct(r.after.power)} dmg</em></span>
      {r.after.rage > 0 || r.before.rage > 0 ? <span className={`gym-delta rage${r.after.rage > r.before.rage ? ' down' : ' up'}`} data-test="gym-rage-delta"><small>Rage</small><b>{pct(r.after.rage)}</b><em className="num">was {pct(r.before.rage)}</em></span>
        : <span className="gym-delta xp up"><small>XP</small><b>+{r.xp}</b><em className="num">{r.cost ? money(r.cost) : 'free'}</em></span>}
    </div>
    {!!r.helped?.length && <p className="gym-result-gear" data-test="gym-result-gear">{r.helped.map((h) => <span key={h.id}><GymPix name={h.id} size={16} /> {h.name}: {h.what}</span>)}</p>}
    {r.path === 'roids' && <p className="gym-result-warn" data-test="gym-roid-warn">Roid rage {pct(r.after.rage)}: it may kill what it knocks out in the mines before you can jar it. Mine pace {pct(r.after.mineSpeed)}.</p>}
    <button ref={back} className="btn primary gym-back" onClick={onClose} data-test="gym-back">Back to gym</button>
  </div>;
}

export default function Gym({ b, sel, busy, act, take, now }) {
  const bugs = (b.stable?.bugs || []).filter(canTrain);
  const [pick, setPick] = useState(() => (bugs.some((bug) => bug.id === sel) ? sel : bugs[0]?.id ?? null));
  const [result, setResult] = useState(null);
  const [coach] = useState(() => COACH[Math.floor(Math.random() * COACH.length)]);
  const bug = bugs.find((x) => x.id === pick) || bugs[0] || null;
  if (!bug) return <div className="gym gym-empty" data-test="gym"><p className="gym-sign" aria-hidden="true">GYM</p><p>Nobody fit to train. A bug has to be hatched, standing and here.</p></div>;
  const g = bug.gym || { power: 0, fit: 0, roid: 0, strain: 0, unruly: 0, mineSpeed: 1, rage: 0, cool: {} };
  const fresh = result && result.bug === bug.id ? result : null;
  const train = (path) => act(async () => {
    const r = await api('POST', '/barn/gym', { path, bug: bug.id });
    take(r); setResult(r.gym);
    if (path === 'roids') sfx.nope?.(); else sfx.play?.();
  });
  const cdLeft = (id) => Math.max(0, b.serverNow + (g.cool?.[id] || 0) - now);
  const lock = lockOf(bug, b, now);
  // gym gear on this bug: tiny icons with days left (and a creatine scoop waiting, or the 12h clock it set)
  const gear = [...Object.entries(g.gear || {}).filter(([id, ms]) => GEAR[id] && b.serverNow + ms > now).map(([id, ms]) => [id, GEAR[id].name, `${Math.max(1, Math.ceil((b.serverNow + ms - now) / 86400e3))}d`]),
    ...(g.creatine ? [['creatine', 'Creatine: in its next workout', 'next']] : g.short ? [['creatine', 'Creatine: 12 hour lock', '12h']] : [])]; // one workout a day, any of the five: everything waits for this
  return <div className={`gym${g.juiced ? ' juiced' : ''}${fresh ? ' showing' : ''}${gear.length ? ' geared' : ''}`} data-test="gym">
    {bugs.length > 1 && <div className="gym-pick" role="group" aria-label="Who trains">
      {bugs.map((x) => <button key={x.id} className={`gym-chip${x.id === bug.id ? ' on' : ''}${x.gym?.juiced ? ' juiced' : ''}`} aria-pressed={x.id === bug.id} onClick={() => { setPick(x.id); setResult(null); }} data-test="gym-pick">
        {x.partner ? '★ ' : ''}{x.name}<small> Lv {x.level}</small>{x.gym?.juiced ? <i className="gym-chip-dot" aria-label="juiced" title="Juiced" /> : null}{lockOf(x, b, now) > 0 ? <i className="gym-chip-rest" aria-label="trained today" title="Trained today" data-test="gym-chip-rest" /> : null}
      </button>)}
    </div>}
    <section className="gym-bug" data-test="gym-bug">
      <div className="gym-portrait">
        <Sprite bug={bug} />
        {g.juiced && <span className="gym-badge roid" data-test="gym-juiced"><GymPix name="roids" size={16} /> JUICED</span>}
        {!g.juiced && g.strain >= 40 && <span className="gym-badge strain">OVERWORKED</span>}
      </div>
      <div className="gym-id">
        <h2 className="gym-name" data-test="gym-name">{bug.name}</h2>
        <p className="gym-kind small">{bug.speciesName} · <b>Lv {bug.level}</b>{bug.evo ? ` · Stage ${bug.evo === 2 ? 'III' : 'II'}` : ''}</p>
        {gear.length > 0 && <p className="gym-gear" aria-label="Gym gear" data-test="gym-gear">{gear.map(([id, name, left]) => <span key={id} title={name} aria-label={`${name}: ${left}`} data-test="gym-gear-item"><GymPix name={id} size={16} />{left}</span>)}</p>}
        <p className="gym-power" data-test="gym-power"><b className="num">{plusPct(g.power)}</b><small> damage{g.bulk ? ` · ${plusPct(g.bulk)} HP` : ''}</small></p>
      </div>
      <div className="gym-meters">
        <Meter label="Mood" value={bug.needs.mood} from={fresh?.before.needs.mood} tone={bug.needs.mood < 30 ? 'low' : ''} test="gym-mood" />
        <Meter label="Unruly" value={g.unruly} tone={g.unruly >= 50 ? 'bad' : g.unruly > 0 ? 'warn' : 'calm'} test="gym-unruly" />
        <div className="gym-stats">
          <span data-test="gym-pace"><small>Mine pace</small><b className={`num${g.mineSpeed < 1 ? ' warn' : ''}`}>{pct(g.mineSpeed)}</b></span>
          <span data-test="gym-strain"><small>Strain</small><b className={`num${g.strain >= 40 ? ' warn' : ''}`}>{g.strain}</b></span>
          <span data-test="gym-rage" className={g.rage >= 0.3 ? 'rage-hot' : ''}><small>Roid rage</small><b className={`num${g.rage > 0 ? ' bad' : ''}`}>{pct(g.rage)}</b></span>
        </div>
      </div>
    </section>
    {fresh ? <Result r={fresh} onClose={() => setResult(null)} /> : <>
    {lock > 0
      ? <p className="gym-lock" data-test="gym-lock"><span>Next workout in <b className="num">{until(lock)}</b></span><small>one a day</small></p>
      : <p className="gym-coach small muted">{coach}</p>}
    <div className={`gym-paths${lock > 0 ? ' locked' : ''}`} role="group" aria-label="Training" aria-disabled={lock > 0 || undefined} data-test="gym-paths">
      {PATH_IDS.map((id) => { const p = PATHS[id], cd = cdLeft(id), poor = p.cost > (b.bankroll ?? 0);
        return <button key={id} className={`gym-path ${TONE[id]}`} disabled={busy || lock > 0 || cd > 0 || poor} onClick={() => train(id)} data-test={`gym-${id}`}>
          <b><GymPix name={id} size={16} />{p.name}</b>
          <span className="gym-path-fx">{EFFECT[id]()}</span>
          <small>{lock > 0 ? (p.cost ? money(p.cost) : 'free') : cd > 0 ? `rests ${mins(cd)}` : poor ? `need ${money(p.cost)}` : p.cost ? money(p.cost) : 'free'}</small>
        </button>; })}
    </div>
    </>}
  </div>;
}
