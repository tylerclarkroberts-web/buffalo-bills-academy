// Barn bouts (v35): replays a bout the server already decided (pen.lastBout) as a staged fight. The timeline and
// the ring live in boutFx.js; this is the dialog, HP bars, callouts and sounds. Nothing here can change the result.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '../util.js';
import { BY_ID } from '../../../server/engine/creatures.js';
import { planBout, locate, drawBout, styleOf, STYLES, EFFECT_COLOR, introLine, verdictLine } from './boutFx.js';
import { voice, sfx, music } from './sfx.js';

const EXTRA = { pierce: 'pierce', guard: 'guard', venom: 'venom', weaken: 'weaken' };
function landSound({ kind, r }) {
  if (kind === 'tick') return sfx.venom();
  if (kind === 'heal') return sfx.heal();
  if (!r.hit) return sfx.whiff();
  if (r.critical) return sfx.crit();
  sfx.whack(r.tier); if (EXTRA[r.effect]) sfx[EXTRA[r.effect]]();
}
const STATUS = [['guard', 'Guarded'], ['poison', 'Poisoned'], ['weak', 'Weakened']];

export default function Bout({ bout, replay = false, reduced, sound, onSound, onClose }) {
  const plan = useMemo(() => planBout(bout), [bout]);
  const ref = useRef(null), dialog = useRef(null), closeButton = useRef(null);
  const clock = useRef({ t0: 0, skip: 0 });
  const [pos, setPos] = useState(() => (reduced ? { i: plan.beats.length, phase: 'done' } : { i: -1, phase: 'intro' }));
  const done = pos.phase === 'done';
  const fighters = [bout.you, bout.them];
  const skip = () => { clock.current.skip = plan.total + 1 - (performance.now() - clock.current.t0); };
  useEffect(() => {
    const el = dialog.current; el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => { if (done) closeButton.current?.focus(); }, [done]);
  useEffect(() => {
    const c = ref.current; if (!c) return undefined;
    const fx = { parts: [], fired: new Set() }; let id = 0, drawn = '';
    clock.current.t0 = performance.now();
    const frame = (now) => {
      const t = reduced ? plan.total + 1 : now - clock.current.t0 + clock.current.skip, loc = locate(plan, t);
      setPos((p) => (p.i === loc.i && p.phase === loc.phase ? p : { i: loc.i, phase: loc.phase }));
      const box = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(box.width * dpr)), H = Math.max(1, Math.round(box.height * dpr));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      if (!reduced || drawn !== `${W}x${H}`) { // reduced motion: one still frame, redrawn only on resize
        drawn = `${W}x${H}`;
        const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0);
        drawBout(x, { W, H, bout, plan, t, reduced, fx });
      }
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [plan, reduced]);

  const beat = pos.i >= 0 && pos.i < plan.beats.length ? plan.beats[pos.i] : null;
  useEffect(() => {
    if (pos.phase === 'intro') sfx.intro();
    else if (beat && pos.phase === 'charge') sfx.charge(beat.r.tier);
    else if (beat && pos.phase === 'act' && beat.kind === 'attack') sfx[STYLES[styleOf(fighters[beat.r.by]?.species)].sound]();
    else if (beat && pos.phase === 'land') landSound(beat);
    else if (pos.phase === 'finish') { if (plan.ending === 'ko') sfx.ko(); else sfx.bell(); }
    // Music runs from the first blow to the last, and follows the sound switch.
    if (['charge', 'act', 'land'].includes(pos.phase)) music.start(); else music.stop();
  }, [pos.i, pos.phase]);
  useEffect(() => () => music.stop(), []);
  useEffect(() => {
    if (!done) return undefined;
    if (bout.result === 'lost') { sfx.sulk(); return undefined; }
    if (bout.result !== 'won') { sfx.bell(); return undefined; }
    sfx.fanfare(); const id = setTimeout(() => voice(BY_ID[bout.you.species]?.voice), 1100);
    return () => clearTimeout(id);
  }, [done]);

  const maxHp = bout.maxHp || [100, 100];
  const landed = beat ? pos.phase === 'land' : pos.i >= plan.beats.length;
  const shown = beat ? (landed ? beat.r : bout.rounds[pos.i - 1]) : landed ? bout.rounds[bout.rounds.length - 1] : null;
  const hp = shown ? shown.hp : maxHp;
  const status = beat ? (landed ? beat.after : beat.before) : null;
  const line = shown ? shown.line : introLine(bout);
  const payment = bout.stake > 0 ? bout.result === 'won' ? `${money(bout.payout)} paid · ${money(bout.net, { sign: true })} profit` : bout.result === 'lost' ? `${money(bout.stake)} stake lost` : `${money(bout.stake)} stake refunded` : 'No money at stake.';
  return (
    <dialog ref={dialog} className="bout" data-test="bout" data-result={bout.result} data-done={done ? '1' : '0'} aria-label={replay ? 'Barn bout replay' : 'Barn bout'} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="bout-top">
        {fighters.map((c, i) => {
          const pct = Math.max(0, Math.min(100, (hp[i] / maxHp[i]) * 100));
          return (
            <div key={i} className={`bout-side s${i}`}>
              <b>{c.name}</b><span className="small muted">{c.stray ? 'stray · ' : ''}{c.owner ? `${c.owner} · ` : ''}Lv {c.level}</span>
              <div className={`barn-bar hp ${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}`} role="progressbar" aria-label={`${c.name} health`} aria-valuemin={0} aria-valuemax={maxHp[i]} aria-valuenow={hp[i]}>
                <b className="ghost" style={{ width: `${pct}%` }} /><i style={{ width: `${pct}%` }} />
              </div>
              <span className="small num bout-hp">{hp[i]} / {maxHp[i]} HP{STATUS.filter(([k]) => status?.[i][k]).map(([k, label]) => <em key={k} className={`bout-chip ${k}`}>{label}</em>)}</span>
            </div>
          );
        })}
      </div>
      <div className="bout-ring">
        <canvas ref={ref} className="barn-canvas" data-test="bout-canvas" />
        <div className="bout-fx" aria-hidden="true">
          {pos.phase === 'intro' && (
            <div className="bout-vs">
              {fighters.map((f, i) => <div key={i} className={`bout-plate s${i}`}><b>{f.name}</b><small><span>{BY_ID[f.species]?.name}</span><span>{STYLES[styleOf(f.species)].name} · Lv {f.level}</span></small></div>)}
              <strong className="bout-vs-mark">VS</strong>
              <strong className="bout-stamp bout-fight">FIGHT!</strong>
            </div>
          )}
          {beat?.special && !landed && <div key={`s${pos.i}`} className={`bout-super s${beat.r.by}${beat.r.tier >= 4 ? ' cap' : ''}${pos.phase === 'act' ? ' go' : ''}`} style={{ '--fx': EFFECT_COLOR[beat.r.effect] }}><small>{fighters[beat.r.by].name}</small><strong>{beat.r.ability}</strong></div>}
          {beat?.r.critical && landed && <strong key={`c${pos.i}`} className="bout-stamp crit">CRITICAL!</strong>}
          {pos.phase === 'finish' && <strong className="bout-stamp end">{plan.ending === 'ko' ? 'K.O.' : 'TIME!'}</strong>}
        </div>
      </div>
      <div className="bout-line" aria-live="polite" data-test="bout-line">{done ? <><b>{verdictLine(bout)}</b>{bout.stake !== undefined && <p className="bout-payment" data-test="bout-payment">{payment}</p>}{bout.xpEarned !== undefined && <p className="bout-xp">{replay ? `This bout awarded ${bout.xpEarned} XP.` : `+${bout.xpEarned} battle XP`}{bout.levelAfter > bout.levelBefore && <> · {replay ? 'Reached' : 'Level up!'} level {bout.levelAfter}</>}</p>}{bout.pot > 0 && <p className="bout-payment">{money(bout.pot)} pot</p>}{replay && <p className="small muted">{bout.you.owner ? 'Seen from the rafters. No XP, no money.' : 'Replay only. No extra XP or money.'}</p>}</> : line}</div>
      <div className="bout-acts">
        {onSound && <button className="btn ghost small" onClick={onSound} aria-pressed={!!sound} aria-label="Bout sounds" title="Bout sounds">{sound ? '🔊' : '🔈'}</button>}
        {!done && <button className="btn ghost small" onClick={skip} data-test="bout-skip">Skip to the end</button>}
        {done && <button ref={closeButton} className="btn small" onClick={onClose} data-test="bout-close">Back to the stall</button>}
      </div>
    </dialog>
  );
}
