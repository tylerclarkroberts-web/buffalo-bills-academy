// v71: a bug battle, Game Boy style. Four greens, two HP bars, a text box and four moves. The server
// rolls everything; this only plays back the events it sends, one line at a time, and sends your pick.
// v75: the cartridge treatment. A flash and a striped wipe, a versus screen with both bugs and their miners, the
// "wants to battle!" text box, then the fight; at the end the loser's bar runs out, it faints, and both sides get
// an unmistakable WIN/LOSS stamp, the XP (with the win bonus) and the spoils. Original pixel art and styling only.
import React, { useEffect, useRef, useState } from 'react';
import { BY_ID } from '../../../server/engine/creatures.js';
import { spriteCanvas } from '../barn/sprite.js';
import Dizzy from '../barn/Dizzy.jsx';
import { INTRO, introLines, outroEvents, spoilsLines, up } from './battleScript.js';

const GB = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];
const LINE_MS = 900;
const seenKey = (id) => `bba.gbIntro.${id}`;
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The bug's barn sprite, repainted in the four Game Boy greens (the player's own faces away from you). */
function GbSprite({ species, back, label, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; const bug = BY_ID[species]; if (!c || !bug) return;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 64, 64); ctx.imageSmoothingEnabled = false;
    ctx.save(); if (back) { ctx.translate(64, 0); ctx.scale(-1, 1); } ctx.drawImage(spriteCanvas(bug, null), 0, 0, 64, 64); ctx.restore();
    const img = ctx.getImageData(0, 0, 64, 64), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) { d[i + 3] = 0; continue; }
      const l = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
      const hex = GB[Math.min(3, Math.floor(l * (back ? 3.2 : 3.6)))], n = parseInt(hex.slice(1), 16);
      d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [species, back]);
  return <canvas ref={ref} width={64} height={64} className={`gb-sprite ${back ? 'back' : ''} ${className}`} role="img" aria-label={label} />;
}

function HpBar({ hp, max }) {
  const f = max ? Math.max(0, hp) / max : 0;
  return <div className="gb-hp" role="meter" aria-label="HP" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp}><b>HP:</b><span><i style={{ width: `${f * 100}%` }} className={f < 0.2 ? 'low' : f < 0.5 ? 'mid' : ''} /></span></div>;
}
function XpBar({ bar }) {
  if (!bar) return null;
  const f = bar.to == null ? 1 : Math.max(0, Math.min(1, (bar.xp - bar.from) / Math.max(1, bar.to - bar.from)));
  return <div className="gb-xp" role="meter" aria-label="XP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} data-test="battle-xp"><b>XP</b><span><i style={{ width: `${f * 100}%` }} /></span></div>;
}

/** The versus screen: two diagonal bands slide in, one bug and miner each, and a big VS between them. */
function Versus({ battle }) {
  return (
    <div className="gb-vs" data-test="battle-versus" aria-label={`${battle.foe.ownerName} versus you`}>
      <div className="gb-vs-band foe">
        <GbSprite species={battle.foe.species} label={battle.foe.name} className="vs" />
        <div className="gb-vs-who"><b>{up(battle.foe.ownerName)}</b><span>{up(battle.foe.name)} :L{battle.foe.level}</span></div>
      </div>
      <div className="gb-vs-mark" aria-hidden="true">VS</div>
      <div className="gb-vs-band you">
        <div className="gb-vs-who"><b>YOU</b><span>{up(battle.you.name)} :L{battle.you.level}</span></div>
        <GbSprite species={battle.you.species} label={battle.you.name} className="vs" />
      </div>
    </div>
  );
}

export function BugBattle({ battle, onMove, onForfeit, onDone }) {
  const resumed = useRef(!!battle.turns?.length || (() => { try { return sessionStorage.getItem(seenKey(battle.id)) === '1'; } catch { return false; } })()).current;
  const reduce = useRef(reducedMotion()).current;
  // intro phases: flash -> versus -> appear (text box lines) -> fight
  const [phase, setPhase] = useState(resumed ? 'fight' : reduce ? 'versus' : 'flash');
  const [introAt, setIntroAt] = useState(0);
  const intro = useRef(introLines(battle)).current;
  const [shown, setShown] = useState(() => (battle.turns?.length ? battle.turns[battle.turns.length - 1].turn : 0));
  const [queue, setQueue] = useState([]);
  const [text, setText] = useState('');
  const [hp, setHp] = useState({ you: battle.you.hp, foe: battle.foe.hp });
  const [fainted, setFainted] = useState({});
  const [outro, setOutro] = useState(false); // the end lines have been queued
  const [banner, setBanner] = useState(false);
  const [xpBar, setXpBar] = useState(battle.you.xpBar || null);
  const [pick, setPick] = useState(0);
  const [run, setRun] = useState(0); // 0 menu, 1 "no running", 2 confirm forfeit
  const [sending, setSending] = useState(false);
  const skipIntro = () => { setPhase('fight'); try { sessionStorage.setItem(seenKey(battle.id), '1'); } catch { /* private mode */ } };
  // the intro clock
  useEffect(() => {
    if (phase === 'fight') return undefined;
    const ms = phase === 'flash' ? INTRO.flash : phase === 'versus' ? (reduce ? 1200 : INTRO.versus) : INTRO.line;
    const id = setTimeout(() => {
      if (phase === 'flash') setPhase('versus');
      else if (phase === 'versus') { setPhase('appear'); setIntroAt(0); }
      else if (introAt + 1 < intro.length) setIntroAt(introAt + 1);
      else skipIntro();
    }, ms);
    return () => clearTimeout(id);
  }, [phase, introAt]);
  // queue the lines of any turns we have not played yet
  useEffect(() => {
    const fresh = (battle.turns || []).filter((t) => t.turn > shown);
    if (fresh.length) { setShown(fresh[fresh.length - 1].turn); setQueue((q) => [...q, ...fresh.flatMap((t) => t.events)]); }
  }, [battle.turns]);
  const fighting = phase === 'fight';
  // once the last turn has played and the server says it's over: the outro
  useEffect(() => {
    if (!fighting || outro || queue.length || !battle.over) return;
    setOutro(true); setQueue(outroEvents(battle, fainted));
  }, [fighting, outro, queue.length, battle.over]);
  useEffect(() => {
    if (!fighting) return undefined;
    if (!queue.length) { if (!battle.over) setHp({ you: battle.you.hp, foe: battle.foe.hp }); return undefined; }
    const [e, ...rest] = queue;
    if (e.t === 'hp') {
      const who = e.who || (e.side === battle.side ? 'you' : 'foe');
      setHp((h) => ({ ...h, [who]: e.hp })); setQueue(rest); return undefined;
    }
    if (e.t === 'banner') { setBanner(true); const id = setTimeout(() => setQueue(rest), 500); return () => clearTimeout(id); }
    if (e.faint) setFainted((f) => ({ ...f, [e.faint === 'you' || e.faint === 'foe' ? e.faint : e.faint === battle.side ? 'you' : 'foe']: true }));
    if (e.t === 'xp' && battle.over?.bug?.xpBar) setXpBar(battle.over.bug.xpBar);
    setText(e.s);
    const id = setTimeout(() => setQueue(rest), e.t === 'xp' ? LINE_MS + 500 : LINE_MS);
    return () => clearTimeout(id);
  }, [fighting, queue, battle.you.hp, battle.foe.hp]);
  const playing = queue.length > 0;
  const choose = async (i) => {
    if (sending || battle.chosen || battle.over || playing || !fighting) return;
    setSending(true); try { await onMove(i); } finally { setSending(false); }
  };
  const moves = battle.you.moves || [];
  const m = moves[pick];
  const secs = Math.ceil((battle.msLeft || 0) / 1000);
  const over = battle.over && outro && !playing;
  const won = !!battle.over?.won, noContest = battle.over?.reason === 'abandoned';
  const spoils = battle.over ? spoilsLines(battle) : [];

  if (phase === 'flash' || phase === 'versus') {
    return (
      <div className="gb" role="dialog" aria-modal="true" aria-label="Bug battle" data-test="bug-battle" data-phase={phase} onClick={skipIntro}>
        <div className="gb-screen gb-intro">
          {phase === 'flash' ? <div className="gb-flash" data-test="battle-flash" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div> : <Versus battle={battle} />}
          <p className="gb-skip" aria-hidden="true">TAP TO SKIP</p>
        </div>
      </div>
    );
  }

  let menu;
  if (over) {
    menu = (
      <div className="gb-over" data-test="battle-over" data-result={noContest ? 'none' : won ? 'won' : 'lost'}>
        <p className={`gb-big ${won ? 'win' : 'loss'}`}>{won ? 'YOU WON!' : noContest ? 'NO CONTEST' : 'YOU LOST!'}</p>
        {spoils.length > 0 && <ul className="gb-spoils" data-test="battle-spoils" aria-label={won ? 'You took' : 'You lost'}>
          <li className="gb-spoils-h">{won ? 'YOU TOOK' : 'THEY TOOK'}</li>
          {spoils.map((s) => <li key={s}>{s}</li>)}
        </ul>}
        <button className="gb-btn" onClick={onDone} data-test="battle-done">{won ? '▶ BACK TO MINING' : '▶ CONTINUE'}</button>
      </div>
    );
  } else if (!fighting || battle.over) {
    menu = <div className="gb-menu gb-menu-wait" aria-hidden="true" />;
  } else if (run === 1) {
    menu = <div className="gb-over"><p>NO! THERE'S NO RUNNING FROM A BUG BATTLE!</p><div className="gb-row"><button className="gb-btn" onClick={() => setRun(0)}>▶ FIGHT ON</button><button className="gb-btn ghost" onClick={() => setRun(2)}>GIVE UP…</button></div></div>;
  } else if (run === 2) {
    menu = <div className="gb-over"><p>GIVING UP COUNTS AS A LOSS. YOUR BUG FAINTS AND THEY TAKE YOUR ACID, CASH AND SMOKES.</p><div className="gb-row"><button className="gb-btn" onClick={() => setRun(0)}>▶ NO, FIGHT</button><button className="gb-btn ghost" data-test="battle-forfeit" onClick={() => { setRun(0); onForfeit(); }}>FORFEIT</button></div></div>;
  } else {
    menu = (
      <div className="gb-menu">
        <div className="gb-moves" role="group" aria-label="Moves">
          {moves.map((mv, i) => (
            <button key={mv.id} className={`gb-move ${pick === i ? 'on' : ''}`} disabled={!mv.pp || battle.chosen || playing || sending}
              onPointerEnter={() => setPick(i)} onFocus={() => setPick(i)} onClick={() => choose(i)} data-test={`battle-move-${i}`}>
              {pick === i ? '▶' : ' '}{up(mv.name)}
            </button>
          ))}
        </div>
        <div className="gb-info">
          {m && <span>TYPE/{m.type}<br />PP {m.pp}/{m.maxPp}</span>}
          <span className={secs <= 5 ? 'gb-blink' : ''}>{battle.chosen ? 'WAITING…' : `${secs}s`}</span>
          <button className="gb-btn ghost small" onClick={() => setRun(1)} data-test="battle-run">RUN</button>
        </div>
      </div>
    );
  }
  const appearing = phase === 'appear';
  const status = appearing ? intro[introAt] : playing || over || battle.over ? text : battle.chosen ? `WAITING FOR ${up(battle.foe.ownerName)}…` : run ? text : `WHAT WILL ${up(battle.you.name)} DO?`;
  const stamp = (side) => (!banner || noContest ? null : <span className={`gb-stamp ${(side === 'you') === won ? 'win' : 'loss'}`} data-test={`stamp-${side}`}>{(side === 'you') === won ? 'WIN' : 'LOSE'}</span>);
  return (
    <div className="gb" role="dialog" aria-modal="true" aria-label="Bug battle" data-test="bug-battle" data-phase={appearing ? 'appear' : over ? 'over' : 'fight'}>
      <div className="gb-screen">
        <div className={`gb-field ${appearing ? 'entering' : ''}`} onClick={appearing ? skipIntro : undefined}>
          <div className="gb-card foe">
            <div className="gb-name">{up(battle.foe.name)}</div>
            <div className="gb-lv">:L{battle.foe.level} {fainted.foe ? 'FNT' : battle.foe.poisoned ? 'PSN' : battle.foe.type}</div>
            <HpBar hp={hp.foe} max={battle.foe.maxHp} />
            <div className="gb-owner">{up(battle.foe.ownerName)}</div>
            {stamp('foe')}
          </div>
          <div className={`gb-mon foe ${fainted.foe ? 'down' : ''}`}>
            <GbSprite species={battle.foe.species} label={`${battle.foe.name}, their bug`} />
            {fainted.foe && <Dizzy size={34} className="gb-dizzy" label={`${battle.foe.name} fainted`} />}
          </div>
          <div className={`gb-mon you ${fainted.you ? 'down' : ''}`}>
            <GbSprite species={battle.you.species} back label={`${battle.you.name}, your bug`} />
            {fainted.you && <Dizzy size={34} className="gb-dizzy" label={`${battle.you.name} fainted`} />}
          </div>
          <div className="gb-card you">
            <div className="gb-name">{up(battle.you.name)}</div>
            <div className="gb-lv">:L{xpBar?.level ?? battle.you.level} {fainted.you ? 'FNT' : battle.you.poisoned ? 'PSN' : battle.you.type}</div>
            <HpBar hp={hp.you} max={battle.you.maxHp} />
            <div className="gb-num">{Math.max(0, hp.you)}/ {battle.you.maxHp}</div>
            <XpBar bar={xpBar} />
            {stamp('you')}
          </div>
          {banner && !noContest && <div className={`gb-banner ${won ? 'win' : 'loss'}`} data-test="battle-banner" role="status">{won ? 'YOU WIN!' : 'YOU LOSE'}</div>}
        </div>
        <div className="gb-text" aria-live="polite" data-test="battle-text">{status}{appearing && <span className="gb-caret" aria-hidden="true">▼</span>}</div>
        {menu}
      </div>
    </div>
  );
}
