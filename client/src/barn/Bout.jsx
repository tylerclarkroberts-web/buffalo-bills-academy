// The ring. Every bug fight plays here: a Barn bout, a mine battle, or a replay of either. The server decides each
// blow; this stages them (boutFx.js has the timeline and the drawing) with HP bars, callouts and sounds. While a
// fight is live, the panel under the ring lines up your bug's next moves; nothing else here can change a result.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '../util.js';
import { BY_ID } from '../../../server/engine/creatures.js';
import { planBout, locate, drawBout, styleOf, STYLES, EFFECT_COLOR, introLine, verdictLine } from './boutFx.js';
import { isHiResSprite, onSpriteReady } from './sprite.js';
import { voice, sfx, music, announce } from './sfx.js';
import { navigate } from '../App.jsx';
import { TypeChip } from './BugCard.jsx';
import { TYPES, typeOf, edge, perkFor } from '../../../server/engine/bug-types.js';
import SteezeShow from './SteezeShow.jsx';
import './barn.css';

const EXTRA = { pierce: 'pierce', guard: 'guard', venom: 'venom', weaken: 'weaken' };
function landSound({ kind, r }) {
  if (kind === 'tick') return sfx.venom();
  if (kind === 'heal') return sfx.heal();
  if (!r.hit) return sfx.whiff();
  if (r.critical) return sfx.crit();
  sfx.whack(r.tier); if (EXTRA[r.effect]) sfx[EXTRA[r.effect]]();
}
const STATUS = [['guard', 'Guarded'], ['poison', 'Poisoned'], ['weak', 'Weakened']];
const DOES = { strike: 'Strike', guard: 'Hit + guard', venom: 'Hit + poison', pierce: 'Pierce', heal: 'Heal', weaken: 'Hit + weaken' };
const TAG = { guard: 'guard', venom: 'poison', pierce: 'pierce', weaken: 'weaken' };
export const QUEUE_MAX = 3;
const FAST = 3; // a replay's fast-forward: every blow and pause at three times the speed
const pct = (n) => `${Math.round(n * 100)}%`;
const span = ([lo, hi]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
/** A move's odds as the server last worked them out, short for its button and in full under the buttons. */
const brief = (m) => (m.heal !== undefined ? `Heal ${m.heal}` : m.dmg ? `${pct(m.hit)} · ${span(m.dmg)}${TAG[m.effect] ? ` + ${TAG[m.effect]}` : m.venom ? ' + poison' : ''}` : DOES[m.effect]);
function explain(m, them) {
  if (m.heal !== undefined) return `Heals ${m.heal} HP instead of attacking.${m.cooldown ? ` Rests ${m.cooldown} turns after.` : ''}`;
  if (!m.dmg) return m.description;
  return `${pct(m.hit)} to hit for ${span(m.dmg)} damage${
    m.venom ? `, then ${m.venom[0]} poison a turn for ${m.venom[1]} turns` : m.weaken ? `, and takes ${pct(m.weaken)} off ${them}'s next attack` : m.guard ? `, and blocks ${pct(m.guard)} of the next hit on you, even on a miss` : m.effect === 'pierce' ? ', through armour and half a guard' : ''
  }.${m.crit ? ` ${pct(m.crit)} chance to leave ${them} at 1 HP.` : ''}${m.cooldown ? ` Rests ${m.cooldown} turns after.` : ''}`;
}

/** Merge a page of a live fight (the server sends only the blows after `from`) into what the page already holds. */
export const mergeFight = (held, page) => ({ ...page, rounds: [...(held?.id === page.id ? held.rounds : []).slice(0, page.from || 0), ...page.rounds] });

const TOSS = { fly: 600, shake: 1300, after: 1300 }; // ms: the jar in the air, rocking on the bug, and the result on show
/**
 * A wild bug your bug has knocked out: throw a jar before it comes to. The jar flies across the ring and rocks on the
 * bug while the server decides; then it clicks shut or the bug squeezes out. Says what a throw is worth and how many are left.
 */
function Jar({ jar, level, onJar, setToss, reduced }) {
  const [said, setSaid] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (!said) return undefined; const id = setTimeout(() => setSaid(''), 2200); return () => clearTimeout(id); }, [said]);
  const why = !jar.have ? 'No jars to catch it with' : !jar.room ? 'No free stall to keep it in' : '';
  const throwIt = async () => {
    setBusy(true); setToss(reduced ? 'shake' : 'fly'); sfx.whiff?.();
    const rock = reduced ? null : setTimeout(() => setToss('shake'), TOSS.fly);
    const landed = new Promise((done) => setTimeout(done, reduced ? 400 : TOSS.fly + TOSS.shake));
    const out = await onJar(landed); // true (caught), false (it got out) or the server's reason for refusing; the catch is not shown before the jar lands
    if (out !== true && out !== false) { clearTimeout(rock); setToss(null); setSaid(String(out)); setBusy(false); return; }
    await landed;
    setToss(out ? 'held' : 'miss'); if (out) sfx.fanfare?.(); else sfx.nope?.();
    setTimeout(() => setToss(null), TOSS.after);
    setBusy(false);
  };
  return <button className={`btn small bout-jar${why ? '' : ' ready'}`} onClick={throwIt} disabled={busy || !!why} data-test="bout-jar">
    {said || why || `Throw a jar · ${pct(jar.chance)} to hold${jar.keeps < level ? ` · arrives Lv ${jar.keeps}` : ''}`}<small> · {jar.left} {jar.left === 1 ? 'throw' : 'throws'} left{jar.have > 0 ? `, ${jar.have} ${jar.have === 1 ? 'jar' : 'jars'}` : ''}</small>
  </button>;
}
/** The thrown jar, over the ring: `toss` is fly, shake, held or miss. */
function Toss({ toss }) {
  return <div className={`bout-toss ${toss}`} data-test="bout-toss" data-toss={toss}>
    <svg viewBox="0 0 40 54" aria-hidden="true">
      <rect className="lid" x="9" y="2" width="22" height="7" rx="2" fill="#c8a04a" stroke="#5a421c" />
      <path d="M11 9h18v4q6 3 6 10v22q0 6-6 6H11q-6 0-6-6V23q0-7 6-10z" fill="rgba(190,235,255,.4)" stroke="#e8fdff" strokeWidth="1.6" />
      <path d="M11 20v22" stroke="rgba(255,255,255,.75)" strokeWidth="2" strokeLinecap="round" />
    </svg>
    {toss === 'held' && <strong className="bout-stamp end">CAUGHT!</strong>}
    {toss === 'miss' && <strong className="bout-stamp crit">IT GOT OUT!</strong>}
  </div>;
}

/** Under the ring while a fight is live: what your bug does next, and the buttons to decide that for it. */
function Moves({ bout, onLine }) {
  const [mine, setMine] = useState(null); // what you just tapped, until the server answers
  const sent = JSON.stringify(bout.queue || []);
  useEffect(() => { setMine(null); }, [sent]);
  const queue = mine || bout.queue || [], name = (id) => bout.moves.find((m) => m.id === id)?.name || id;
  const latest = useRef(queue); latest.current = queue; // two quick taps both count, even before the first one redraws
  const line = (change) => { const next = change(latest.current); if (!next) return; latest.current = next; setMine(next); onLine(next); };
  // The move spelled out under the buttons: the one you last touched, otherwise the one coming next.
  const [look, setLook] = useState(null);
  const shown = bout.moves.find((m) => m.id === look) || bout.moves.find((m) => m.id === (queue[0] || bout.next));
  const type = typeOf(bout.you.species), perk = perkFor(type);
  return (
    <div className="bout-panel" data-test="bout-panel">
      <div className="bout-queue" aria-live="polite">
        <span className="small muted">{queue.length ? 'Lined up' : `${bout.you.name} will use`}</span>
        {queue.length
          ? queue.map((id, k) => <button key={`${id}${k}`} className="bout-pick" onClick={() => line((q) => q.filter((_, j) => j !== k))} aria-label={`Remove ${name(id)}`} data-test="bout-queued">{k + 1}. {name(id)} <span aria-hidden="true">×</span></button>)
          : <b data-test="bout-next">{name(bout.next)}</b>}
        {!queue.length && <span className="small muted">unless you pick. Up to {QUEUE_MAX}.</span>}
      </div>
      <div className="bout-moves" role="group" aria-label={`${bout.you.name}'s moves`}>
        {bout.moves.map((m) => (
          <button key={m.id} className="bout-move" style={{ '--fx': EFFECT_COLOR[m.effect] }} aria-disabled={queue.length >= QUEUE_MAX} aria-label={`${m.name}. ${explain(m, bout.them.name)}`}
            onClick={() => { setLook(m.id); line((q) => (q.length < QUEUE_MAX ? [...q, m.id] : null)); }} onMouseEnter={() => setLook(m.id)} onFocus={() => setLook(m.id)} data-test={`bout-move-${m.id}`}>
            <b>{m.name}</b><small>{m.readyIn > 0 ? `ready in ${m.readyIn}` : brief(m)}</small>
          </button>
        ))}
      </div>
      {shown && <p className="small bout-detail" data-test="bout-detail"><b>{shown.name}.</b> {explain(shown, bout.them.name)}{shown.readyIn > 0 ? ` Ready in ${shown.readyIn}.` : ''}</p>}
      {bout.trait && <p className="small muted bout-trait"><b>{bout.trait.name}.</b> {bout.trait.description}</p>}
      {perk && <p className="small muted bout-trait" data-test="bout-perk"><b>{TYPES[type].name}: {perk.name}.</b> {perk.description}</p>}
    </div>
  );
}

export default function Bout({ bout, replay = false, reduced, sound, onSound, onClose, onLine, onForfeit, onJar, closeLabel = 'Back to the stall' }) {
  const plan = useMemo(() => planBout(bout), [bout]);
  const ref = useRef(null), dialog = useRef(null), closeButton = useRef(null);
  // The fight's own clock: `vt` advances with the page's frames, `rate` times as fast when fast-forwarding a replay.
  const clock = useRef({ vt: 0, last: 0, rate: 1 });
  const [fast, setFast] = useState(false);
  useEffect(() => { clock.current.rate = fast ? FAST : 1; }, [fast]);
  const now = useRef({ plan, bout }); now.current = { plan, bout };
  const [pos, setPos] = useState(() => (reduced && !plan.open ? { i: plan.beats.length, phase: 'done' } : { i: -1, phase: 'intro' }));
  const [forcedShow, setForcedShow] = useState(null);
  useEffect(() => {
    const tick = () => {
      const v = typeof window !== 'undefined' ? window.__steezeShow || null : null;
      setForcedShow((cur) => (cur === v ? cur : v));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, []);
  const [quit, setQuit] = useState(false);
  const [toss, setToss] = useState(null); // a jar in the air, rocking, shut or burst open
  const done = pos.phase === 'done', live = !!bout.live;
  const fighters = [bout.you, bout.them];
  // the line the fight opened at (your chance): named on the favourite's side, on neither when it is even
  const mine = Math.round((bout.line ?? 0.5) * 100), fav = mine === 50 ? -1 : mine > 50 ? 0 : 1;
  const skip = () => { clock.current.vt = plan.total + 1; };
  useEffect(() => {
    const el = dialog.current; el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => { if (done) closeButton.current?.focus(); }, [done]);
  useEffect(() => {
    const c = ref.current; if (!c) return undefined;
    const fx = { parts: [], fired: new Set() }; let id = 0, drawn = '';
    const ck = clock.current; ck.vt = 0; ck.last = performance.now();
    const frame = (at) => {
      const { plan: p, bout: b } = now.current; // a live fight grows: always the latest plan, on the same clock
      ck.vt += Math.max(0, at - ck.last) * ck.rate; ck.last = at;
      let t = reduced ? p.total + 1 : ck.vt;
      if (p.open && !reduced) {
        if (t > p.end) ck.vt = t = p.end; // nothing new yet: hold the clock where the last blow ended
        const behind = p.beats.length - 2; // opened late or fell behind: jump to the blow before the latest
        if (behind > 0 && t < p.beats[behind].at) ck.vt = t = p.beats[behind].at;
      }
      const loc = locate(p, t);
      setPos((q) => (q.i === loc.i && q.phase === loc.phase ? q : { i: loc.i, phase: loc.phase }));
      const box = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(box.width * dpr)), H = Math.max(1, Math.round(box.height * dpr));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const key = `${W}x${H}:${p.beats.length}:${p.open}`;
      if (!reduced || drawn !== key) { // reduced motion: one still frame, redrawn on resize or a new blow
        drawn = key;
        const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0);
        drawBout(x, { W, H, bout: b, plan: p, t, reduced, fx });
      }
      id = requestAnimationFrame(frame);
    };
    const unsub = onSpriteReady(() => { drawn = ''; });
    id = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(id); unsub(); };
  }, [reduced]);

  const beat = pos.i >= 0 && pos.i < plan.beats.length ? plan.beats[pos.i] : null;
  useEffect(() => {
    if (pos.phase === 'intro') { sfx.intro(); announce('intro'); }
    else if (beat && pos.phase === 'charge') sfx.charge(beat.r.tier);
    else if (beat && pos.phase === 'act' && beat.kind === 'attack') sfx[STYLES[styleOf(fighters[beat.r.by]?.species)].sound]();
    else if (beat && pos.phase === 'land') { landSound(beat); if (beat.r.critical) announce('crit', false); }
    else if (pos.phase === 'finish') { if (plan.ending === 'ko') sfx.ko(); else sfx.bell(); }
    // Music runs from the first blow to the last, and follows the sound switch.
    if (['charge', 'act', 'land'].includes(pos.phase) || (pos.phase === 'wait' && plan.beats.length)) music.start(); else music.stop();
  }, [pos.i, pos.phase]);
  useEffect(() => () => { music.stop(); announce.stop(); }, []);
  useEffect(() => {
    if (!done) return undefined;
    announce(bout.result === 'won' || bout.result === 'lost' ? bout.result : 'draw');
    if (bout.result === 'lost') { sfx.sulk(); return undefined; }
    if (bout.result !== 'won') { sfx.bell(); return undefined; }
    sfx.fanfare(); const id = setTimeout(() => voice(BY_ID[bout.you.species]?.voice), 1100);
    return () => clearTimeout(id);
  }, [done]);

  const maxHp = bout.maxHp || [100, 100];
  const landed = beat ? pos.phase === 'land' : pos.i >= plan.beats.length;
  const shown = beat ? (landed ? beat.r : bout.rounds[pos.i - 1]) : landed ? bout.rounds[bout.rounds.length - 1] : null;
  const hp = shown ? shown.hp : bout.startHp || maxHp;
  const fainted = !replay && (bout.healthAfter === 0 || bout.over?.bug?.fainted);
  const legendary = bout.rarity === 4; // the wild bug in the other corner is one of a kind

  const jarred = bout.over?.reason === 'jarred';
  const status = beat ? (landed ? beat.after : beat.before) : pos.phase === 'wait' && plan.beats.length ? plan.beats[plan.beats.length - 1].after : null;
  const line = shown ? shown.line : introLine(bout);
  const payment = bout.stake > 0 ? bout.result === 'won' ? `${money(bout.payout)} paid · ${money(bout.net, { sign: true })} profit` : bout.result === 'lost' ? `${money(bout.stake)} stake lost` : `${money(bout.stake)} stake refunded` : 'No money at stake.';
  const boutHiRes = fighters.some((f) => isHiResSprite(BY_ID[f?.species], f?.style, f?.level));
  return (
    <dialog ref={dialog} className={`bout${live ? ' live' : ''}${legendary ? ' legendary' : ''}`} data-test="bout" data-kind={bout.kind || 'barn'} data-live={live ? '1' : '0'} data-result={bout.result} data-done={done ? '1' : '0'} aria-label={replay ? 'Bug fight replay' : 'Bug fight'} onCancel={(e) => { e.preventDefault(); if (!live) onClose(); }}>
      <div className="bout-top">
        {fighters.map((c, i) => {
          const hidden = i === 1 && bout.dark && live; // too dark to see how hurt it is
          const pct = hidden ? 100 : Math.max(0, Math.min(100, (hp[i] / maxHp[i]) * 100));
          return (
            <div key={i} className={`bout-side s${i}`}>
              <b>{c.name}</b><span className="small muted">{i === 1 && legendary ? <em className="bout-legend" data-test="bout-legendary">✦ legendary</em> : null}{c.wild ? 'wild · ' : c.stray ? 'stray · ' : ''}{c.owner ? `${c.owner} · ` : ''}Lv {c.level} <TypeChip type={typeOf(c.species)} small /></span>
              <div className={`barn-bar hp ${hidden ? 'dark' : pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}`} role="progressbar" aria-label={hidden ? `${c.name} health: too dark to see` : `${c.name} health`} aria-valuemin={0} aria-valuemax={maxHp[i]} aria-valuenow={hidden ? undefined : hp[i]}>
                <b className="ghost" style={{ width: `${pct}%` }} /><i style={{ width: `${pct}%` }} />
              </div>
              <span className="small num bout-hp">{hidden ? <span data-test="bout-dark">?? / {maxHp[i]} HP · too dark to see</span> : <>{hp[i]} / {maxHp[i]} HP</>}{fav === i && !(bout.dark && live) && <span className="bout-fav" data-test="bout-favoured">favoured {i ? 100 - mine : mine}%</span>}{live && edge(typeOf(c.species), typeOf(fighters[1 - i].species)) > 0 && <em className="bout-chip edge" data-test="bout-edge">type edge</em>}{STATUS.filter(([k]) => status?.[i][k]).map(([k, label]) => <em key={k} className={`bout-chip ${k}`}>{label}</em>)}</span>
            </div>
          );
        })}
      </div>
      <div className="bout-ring">
        <canvas ref={ref} className={`barn-canvas${boutHiRes ? ' hi-res' : ''}`} data-test="bout-canvas" />
        <div className="bout-fx" aria-hidden="true">
          {(() => {
            const forced = forcedShow;
            const move = forced || ((beat?.kind === 'flourish' || beat?.r?.effect === 'flourish') && beat.r.flourish);
            return move && move !== 'pose' ? <SteezeShow key={String(move)} move={move} /> : null;
          })()}
          {pos.phase === 'intro' && (
            <div className="bout-vs">
              {fighters.map((f, i) => <div key={i} className={`bout-plate s${i}`}><b>{f.name}</b><small><span>{BY_ID[f.species]?.name}</span><span>{TYPES[typeOf(f.species)]?.name || STYLES[styleOf(f.species)].name} · Lv {f.level}</span></small></div>)}
              <strong className="bout-vs-mark">VS</strong>
              <strong className="bout-stamp bout-fight">FIGHT!</strong>
            </div>
          )}
          {beat?.special && !landed && <div key={`s${pos.i}`} className={`bout-super s${beat.r.by}${beat.r.tier >= 4 ? ' cap' : ''}${pos.phase === 'act' ? ' go' : ''}`} style={{ '--fx': EFFECT_COLOR[beat.r.effect] }}><small>{fighters[beat.r.by].name}</small><strong>{beat.r.ability}</strong></div>}
          {beat?.r.critical && landed && <strong key={`c${pos.i}`} className="bout-stamp crit">CRITICAL!</strong>}
          {pos.phase === 'finish' && <strong className="bout-stamp end">{jarred ? 'CAUGHT!' : plan.ending === 'ko' ? 'K.O.' : 'TIME!'}</strong>}
        </div>
        {toss && <Toss toss={toss} />}
        {done && bout.jar && onJar && <Jar jar={bout.jar} level={bout.them.level} onJar={onJar} setToss={setToss} reduced={reduced} />}
      </div>
      <div className="bout-line" aria-live="polite" data-test="bout-line">{done ? <>
        <b>{bout.verdict || verdictLine(bout)}</b>
        {bout.stake !== undefined && <p className="bout-payment" data-test="bout-payment">{payment}</p>}
        {bout.spoils?.length > 0 && <p className="bout-payment" data-test="bout-spoils">{bout.spoils.join(' · ')}</p>}
        {bout.xpEarned !== undefined && <p className="bout-xp">{replay ? `This bout awarded ${bout.xpEarned} XP.` : `+${bout.xpEarned} battle XP`}{bout.levelAfter > bout.levelBefore && <> · {replay ? 'Reached' : 'Level up!'} level {bout.levelAfter}</>}</p>}
        {!replay && !fainted && hp[0] > 0 && hp[0] < maxHp[0] && <p className="small muted">{bout.carry != null ? `${bout.you.name} takes ${bout.carry}% health into the next round.` : `${bout.you.name} is back to full HP.`}</p>}
        {bout.pot > 0 && <p className="bout-payment">{money(bout.pot)} pot</p>}
        {replay && <p className="small muted">{bout.you.owner ? 'Seen from the rafters. No XP, no money.' : 'Replay only. No extra XP or money.'}</p>}
      </> : quit ? (bout.wild ? 'Run, and it keeps the tunnel.' : 'There is no running from a bug fight. Giving up counts as a loss.') : line}</div>
      {live && bout.tell && !quit && <p className="bout-tell" role="status" data-test="bout-tell">{bout.tell}</p>}
      {live && bout.moves && !quit && <Moves bout={bout} onLine={onLine} />}
      <div className="bout-acts">
        {onSound && <button className="btn ghost small" onClick={onSound} aria-pressed={!!sound} aria-label="Fight sounds" title="Fight sounds">{sound ? '🔊' : '🔈'}</button>}
        {!done && !live && <button className={`btn small${fast ? ' on' : ' ghost'}`} onClick={() => setFast(!fast)} aria-pressed={fast} data-test="bout-fast">⏩ {FAST}× speed</button>}
        {!done && !live && <button className="btn ghost small" onClick={skip} data-test="bout-skip">Skip to the end</button>}
        {live && !onForfeit && <button className="btn ghost small" onClick={onClose} data-test="bout-leave">Leave it to {bout.you.name}</button>}
        {live && onForfeit && !quit && <button className="btn ghost small" onClick={() => setQuit(true)} data-test="bout-run">Run</button>}
        {live && quit && <><button className="btn small" onClick={() => setQuit(false)}>Fight on</button><button className="btn ghost small" onClick={() => { setQuit(false); onForfeit(); }} data-test="bout-forfeit">Give up</button></>}
        {done && fainted && <button className="btn small bout-center" onClick={() => { onClose(); navigate('/barn/center'); }} data-test="bout-fainted">{bout.you.name} fainted — visit the Bug Center →</button>}
        {done && <button ref={closeButton} className={`btn small${fainted ? ' ghost' : ''}`} onClick={onClose} data-test="bout-close">{fainted ? 'Later' : closeLabel}</button>}
      </div>
    </dialog>
  );
}
