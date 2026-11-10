// Barn bouts (v31): replays a bout the server already decided (pen.lastBout). Nothing here can change the result.
import React, { useEffect, useRef, useState } from 'react';
import { BY_ID } from '../../../server/engine/creatures.js';
import { drawBug } from './sprite.js';
import { voice, sfx } from './sfx.js';

const ROUND_MS = 1300;

export default function Bout({ bout, replay = false, reduced, onClose }) {
  const ref = useRef(null);
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const [step, setStep] = useState(reduced ? bout.rounds.length : 0); // rounds shown so far
  const done = step >= bout.rounds.length;
  const skip = () => setStep(bout.rounds.length);
  useEffect(() => {
    const el = dialog.current; el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => { if (done) closeButton.current?.focus(); }, [done]);
  useEffect(() => {
    if (done) { sfx.bell(); if (bout.result === 'won') setTimeout(() => voice(BY_ID[bout.you.species]?.voice), 500); return undefined; }
    const id = setTimeout(() => { const r = bout.rounds[step]; if (r.dmg > 0) sfx.whack(r.tier); else if (!r.hit) sfx.whiff(); setStep((n) => n + 1); }, step === 0 ? 700 : ROUND_MS);
    return () => clearTimeout(id);
  }, [step, done]);
  useEffect(() => {
    const c = ref.current; if (!c) return undefined;
    let id = 0;
    const draw = (now) => {
      const r = c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
      const resized = c.width !== W || c.height !== H;
      if (resized) { c.width = W; c.height = H; }
      if (reduced && !resized && c.dataset.drawn === String(step)) { id = requestAnimationFrame(draw); return; } // still frame; redraw on resize only
      c.dataset.drawn = String(step);
      const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
      const cur = bout.rounds[step - 1];
      const since = reduced ? 9999 : now - (window.__boutStepAt || 0);
      const k = Math.max(0, 1 - since / 450); // 1 just after a move, fading
      [0, 1].forEach((s) => {
        const who = s === 0 ? bout.you : bout.them;
        const loser = done && ((bout.result === 'won' && s === 1) || (bout.result === 'lost' && s === 0));
        let dx = 0, alpha = 1;
        if (cur && !reduced) {
          if (cur.by === s && cur.type !== 'venom' && cur.effect !== 'heal') dx = Math.sin(Math.min(1, since / 300) * Math.PI) * W * 0.06; // lunge toward the middle
          else if (cur.by !== s && cur.dmg > 0) { dx = -Math.sin(since / 25) * k * W * 0.012; alpha = since < 260 && Math.floor(since / 65) % 2 ? 0.45 : 1; }
        }
        // wide ring: side by side. Tall ring (phone upright): you bottom-left, them top-right, so both stay big.
        const tall = H > W * 1.1;
        const bw = tall ? W * 0.78 : W / 2, bh = tall ? H / 2 : H;
        const by = tall && s === 1 ? 0 : H - bh;
        x.save(); x.globalAlpha = alpha;
        if (s === 0) x.translate(dx, by + (loser ? bh * 0.08 : 0)); else { x.translate(W - dx, by + (loser ? bh * 0.08 : 0)); x.scale(-1, 1); }
        if (loser) { x.translate(bw / 2, bh * 0.86); x.rotate(-0.25); x.translate(-bw / 2, -bh * 0.86); }
        if (BY_ID[who.species]) drawBug(x, BY_ID[who.species], { w: bw, h: bh, t: now + s * 700, still: reduced, fill: 0.7, style: who.style, level: who.level });
        x.restore();
      });
      if (cur?.dmg > 0 && k > 0 && !reduced) { // a cartoon impact star where the move lands
        const tall = H > W * 1.1; const cx = cur.by === 0 ? W * (tall ? 0.6 : 0.68) : W * (tall ? 0.4 : 0.32), cy = tall ? (cur.by === 0 ? H * 0.25 : H * 0.72) : H * 0.45, R = (30 + cur.tier * 10) * dpr * (0.6 + k);
        x.save(); x.globalAlpha = k; x.fillStyle = '#ffe27a'; x.strokeStyle = '#3a1a00'; x.lineWidth = 3 * dpr; x.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? R * 0.45 : R; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        x.closePath(); x.fill(); x.stroke(); x.restore();
      }
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [step, done, reduced]);
  useEffect(() => { window.__boutStepAt = performance.now(); }, [step]);
  const maxHp = bout.maxHp || [100, 100];
  const hp = step ? bout.rounds[step - 1].hp : maxHp;
  const line = step ? bout.rounds[step - 1].line : `${bout.you.name} squares up to ${bout.them.name}.`;
  const verdict = { won: `${bout.you.name} wins! A ribbon for the stall.`, lost: `${bout.them.name} wins. ${bout.you.name} will sulk about it.`, draw: 'A draw. Both of them claim victory.' }[bout.result];
  return (
    <dialog ref={dialog} className="bout" data-test="bout" data-result={bout.result} data-done={done ? '1' : '0'} aria-label={replay ? 'Barn bout replay' : 'Barn bout'} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="bout-top">
        {[bout.you, bout.them].map((c, i) => (
          <div key={i} className={`bout-side s${i}`}>
            <b>{c.name}</b><span className="small muted">{c.stray ? 'stray · ' : ''}Lv {c.level}</span>
            <div className="barn-bar hp" role="progressbar" aria-label={`${c.name} health`} aria-valuemin={0} aria-valuemax={maxHp[i]} aria-valuenow={hp[i]}><i style={{ width: `${Math.max(0, Math.min(100, hp[i] / maxHp[i] * 100))}%` }} /></div>
            <span className="small num bout-hp">{hp[i]} / {maxHp[i]} HP</span>
          </div>
        ))}
      </div>
      <div className="bout-ring"><canvas ref={ref} className="barn-canvas" data-test="bout-canvas" /></div>
      <div className="bout-line" aria-live="polite" data-test="bout-line">{done ? <><b>{verdict}</b>{bout.xpEarned !== undefined && <p className="bout-xp">{replay ? `This bout awarded ${bout.xpEarned} XP. Replaying adds no XP.` : `+${bout.xpEarned} battle XP`}{bout.levelAfter > bout.levelBefore && <> · {replay ? 'Reached' : 'Level up!'} level {bout.levelAfter}</>}</p>}</> : line}</div>
      <div className="bout-acts">
        {!done && <button className="btn ghost small" onClick={skip} data-test="bout-skip">Skip to the end</button>}
        {done && <button ref={closeButton} className="btn small" onClick={onClose} data-test="bout-close">Back to the stall</button>}
      </div>
    </dialog>
  );
}
