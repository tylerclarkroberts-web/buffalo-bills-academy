// v71: a bug battle, Game Boy style. Four greens, two HP bars, a text box and four moves. The server
// rolls everything; this only plays back the events it sends, one line at a time, and sends your pick.
import React, { useEffect, useRef, useState } from 'react';
import { BY_ID } from '../../../server/engine/creatures.js';
import { spriteCanvas } from '../barn/sprite.js';

const GB = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];
const LINE_MS = 900;
const up = (s) => String(s || '').toUpperCase();

/** The bug's barn sprite, repainted in the four Game Boy greens (the player's own faces away from you). */
function GbSprite({ species, back, label }) {
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
  return <canvas ref={ref} width={64} height={64} className={`gb-sprite ${back ? 'back' : ''}`} role="img" aria-label={label} />;
}

function HpBar({ hp, max }) {
  const f = max ? Math.max(0, hp) / max : 0;
  return <div className="gb-hp" role="meter" aria-label="HP" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp}><b>HP:</b><span><i style={{ width: `${f * 100}%` }} className={f < 0.2 ? 'low' : f < 0.5 ? 'mid' : ''} /></span></div>;
}

export function BugBattle({ battle, onMove, onForfeit, onDone }) {
  const [shown, setShown] = useState(() => (battle.turns?.length ? battle.turns[battle.turns.length - 1].turn : 0));
  const [queue, setQueue] = useState([]);
  const [text, setText] = useState(() => (battle.turns?.length ? '' : `${up(battle.foe.ownerName)} WANTS TO FIGHT!\n${up(battle.foe.ownerName)} SENT OUT ${up(battle.foe.name)}!`));
  const [hp, setHp] = useState({ you: battle.you.hp, foe: battle.foe.hp });
  const [pick, setPick] = useState(0);
  const [run, setRun] = useState(0); // 0 menu, 1 "no running", 2 confirm forfeit
  const [sending, setSending] = useState(false);
  // queue the lines of any turns we have not played yet
  useEffect(() => {
    const fresh = (battle.turns || []).filter((t) => t.turn > shown);
    if (fresh.length) { setShown(fresh[fresh.length - 1].turn); setQueue((q) => [...q, ...fresh.flatMap((t) => t.events)]); }
  }, [battle.turns]);
  useEffect(() => {
    if (!queue.length) { if (!battle.over) setHp({ you: battle.you.hp, foe: battle.foe.hp }); return; }
    const [e, ...rest] = queue;
    if (e.t === 'hp') { setHp((h) => ({ ...h, [e.side === battle.side ? 'you' : 'foe']: e.hp })); setQueue(rest); return; }
    setText(e.s);
    const id = setTimeout(() => setQueue(rest), LINE_MS);
    return () => clearTimeout(id);
  }, [queue, battle.you.hp, battle.foe.hp]);
  const playing = queue.length > 0;
  const choose = async (i) => {
    if (sending || battle.chosen || battle.over || playing) return;
    setSending(true); try { await onMove(i); } finally { setSending(false); }
  };
  const moves = battle.you.moves || [];
  const m = moves[pick];
  const secs = Math.ceil((battle.msLeft || 0) / 1000);
  const over = battle.over && !playing;
  const raid = battle.over?.raid;
  let menu;
  if (over) {
    const why = battle.over.reason === 'forfeit' ? (battle.over.won ? `${up(battle.foe.ownerName)} RAN FOR THE ELEVATOR.` : 'YOU THREW IN THE TOWEL.')
      : battle.over.reason === 'disconnect' ? (battle.over.won ? `${up(battle.foe.ownerName)} WENT QUIET. THAT COUNTS.` : 'YOU WENT QUIET TOO LONG.')
        : battle.over.reason === 'abandoned' ? 'NOBODY WAS LEFT TO WIN.' : '';
    menu = (
      <div className="gb-over" data-test="battle-over">
        <p className="gb-big">{battle.over.won ? 'YOU WON!' : battle.over.reason === 'abandoned' ? 'NO CONTEST' : 'YOU BLACKED OUT!'}</p>
        {why && <p>{why}</p>}
        {raid && <p>{battle.over.won ? 'TOOK' : 'LOST'} ${raid.cash}{raid.cashCapped ? ' (DAILY LOSS CAP)' : ''} · {Math.floor(raid.acid)} ACID{raid.tobacco?.length ? ` · ${raid.tobacco.map(up).join(', ')}` : ''}{raid.smoked?.length ? ` (SMOKED ${raid.smoked.length} DUPLICATE${raid.smoked.length > 1 ? 'S' : ''})` : ''}</p>}
        <button className="gb-btn" onClick={onDone} data-test="battle-done">{battle.over.won ? '▶ BACK TO MINING' : '▶ CONTINUE'}</button>
      </div>
    );
  } else if (run === 1) {
    menu = <div className="gb-over"><p>NO! THERE'S NO RUNNING FROM A BUG BATTLE!</p><div className="gb-row"><button className="gb-btn" onClick={() => setRun(0)}>▶ FIGHT ON</button><button className="gb-btn ghost" onClick={() => setRun(2)}>GIVE UP…</button></div></div>;
  } else if (run === 2) {
    menu = <div className="gb-over"><p>GIVING UP COUNTS AS A LOSS. THEY TAKE YOUR ACID, CASH AND SMOKES.</p><div className="gb-row"><button className="gb-btn" onClick={() => setRun(0)}>▶ NO, FIGHT</button><button className="gb-btn ghost" data-test="battle-forfeit" onClick={() => { setRun(0); onForfeit(); }}>FORFEIT</button></div></div>;
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
  const status = playing ? text : over ? text : battle.chosen ? `WAITING FOR ${up(battle.foe.ownerName)}…` : run ? text : (text && !battle.turns?.length ? text : `WHAT WILL ${up(battle.you.name)} DO?`);
  return (
    <div className="gb" role="dialog" aria-modal="true" aria-label="Bug battle" data-test="bug-battle">
      <div className="gb-screen">
        <div className="gb-field">
          <div className="gb-card foe">
            <div className="gb-name">{up(battle.foe.name)}</div>
            <div className="gb-lv">:L{battle.foe.level} {battle.foe.poisoned ? 'PSN' : battle.foe.type}</div>
            <HpBar hp={hp.foe} max={battle.foe.maxHp} />
            <div className="gb-owner">{up(battle.foe.ownerName)}</div>
          </div>
          <GbSprite species={battle.foe.species} label={`${battle.foe.name}, their bug`} />
          <GbSprite species={battle.you.species} back label={`${battle.you.name}, your bug`} />
          <div className="gb-card you">
            <div className="gb-name">{up(battle.you.name)}</div>
            <div className="gb-lv">:L{battle.you.level} {battle.you.poisoned ? 'PSN' : battle.you.type}</div>
            <HpBar hp={hp.you} max={battle.you.maxHp} />
            <div className="gb-num">{Math.max(0, hp.you)}/ {battle.you.maxHp}</div>
          </div>
        </div>
        <div className="gb-text" aria-live="polite" data-test="battle-text">{status}</div>
        {menu}
      </div>
    </div>
  );
}
