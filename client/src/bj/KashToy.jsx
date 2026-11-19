// Kash Bet back room: a cartoony interrogation-room ragdoll of the caught player. Original art only.
import React, { useEffect, useRef, useState } from 'react';
import { Bust } from '../avatar/Bust.jsx';
import { TOOLS, createToy } from './kashToy.js';

const money = (x) => `$${Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function draw(ctx, snap, shirt) {
  const { bodies: b, fx, bombs, w, h } = snap;
  ctx.clearRect(0, 0, w, h);
  // room
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a1420'); g.addColorStop(1, '#0b0810');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255, 200, 80, 0.06)';
  ctx.beginPath(); ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.15, h); ctx.lineTo(w * 0.85, h); ctx.fill();
  // floor line
  ctx.strokeStyle = 'rgba(255,233,168,.15)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(10, h - 16); ctx.lineTo(w - 10, h - 16); ctx.stroke();
  const limb = (part, fill) => {
    if (!part) return;
    ctx.save(); ctx.translate(part.x, part.y); ctx.rotate(part.rot);
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(0, 0, part.rx, part.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  limb(b.legL, '#2a2433'); limb(b.legR, '#2a2433');
  limb(b.armL, shirt); limb(b.armR, shirt);
  limb(b.torso, shirt);
  // shoes
  for (const p of [b.legL, b.legR]) {
    ctx.save(); ctx.translate(p.x, p.y + p.ry * 0.7); ctx.fillStyle = '#1b1512';
    ctx.beginPath(); ctx.ellipse(0, 0, p.rx * 1.1, p.rx * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (const bomb of bombs) {
    ctx.save(); ctx.translate(bomb.x, bomb.y);
    ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8c14a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(8, -12); ctx.stroke();
    ctx.restore();
  }
  for (const f of fx) {
    const a = Math.max(0, f.life / (f.max || 0.5));
    ctx.globalAlpha = a;
    if (f.kind === 'star') {
      ctx.fillStyle = '#ffe9a8';
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(a * 3);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const ang = (i * 4 * Math.PI) / 5; ctx.lineTo(Math.cos(ang) * 7, Math.sin(ang) * 7); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    } else if (f.kind === 'smoke') {
      ctx.fillStyle = 'rgba(200,200,210,.55)';
      ctx.beginPath(); ctx.arc(f.x, f.y, (f.r || 16) * (1.2 - a * 0.4), 0, Math.PI * 2); ctx.fill();
    } else if (f.kind === 'splat') {
      ctx.fillStyle = '#f4e4c1';
      ctx.beginPath(); ctx.ellipse(f.x, f.y, 28, 16, f.rot || 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(f.x - 16, f.y + 4, 8, 0, Math.PI * 2); ctx.arc(f.x + 14, f.y + 6, 7, 0, Math.PI * 2); ctx.fill();
    } else if (f.kind === 'boom') {
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, 18 + (1 - a) * 24, 0, Math.PI * 2); ctx.stroke();
    } else if (f.kind === 'bonk') {
      ctx.fillStyle = '#ffe9a8'; ctx.font = '700 16px "Newsreader", Georgia, serif';
      ctx.textAlign = 'center'; ctx.fillText(f.text || 'POW', f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}

export function KashToy({ room, onHit, onFinish, onDismiss, reduced }) {
  const box = useRef(null);
  const toy = useRef(null);
  const canvas = useRef(null);
  const [tool, setTool] = useState('punch');
  const [snap, setSnap] = useState(null);
  const [extra, setExtra] = useState(Math.min(300, room?.extraMax || 300));
  const dealer = room?.role === 'dealer';

  useEffect(() => {
    const el = box.current; if (!el) return;
    const size = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(160, Math.floor(r.width)), h = Math.max(160, Math.floor(r.height));
      if (!toy.current) toy.current = createToy(w, h);
      else toy.current.resize(w, h);
      const c = canvas.current; if (c) { c.width = w; c.height = h; }
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);
    let last = performance.now(), raf;
    const loop = (t) => {
      const dt = Math.min(0.033, (t - last) / 1000); last = t;
      if (toy.current && !reduced) toy.current.step(dt);
      else if (toy.current && reduced) toy.current.step(dt * 0.15);
      const s = toy.current?.snapshot();
      if (s) {
        setSnap(s);
        const ctx = canvas.current?.getContext('2d');
        if (ctx) draw(ctx, s, '#3d5a7a');
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [reduced]);

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) / r.width, y: (src.clientY - r.top) / r.height };
  };
  const use = (e) => {
    if (!dealer || !toy.current) return;
    e.preventDefault();
    const p = point(e);
    toy.current.apply(tool, p.x, p.y);
    onHit?.({ tool, x: p.x, y: p.y });
  };

  const head = snap?.bodies?.head;
  const headSize = head ? Math.round(Math.max(36, head.rx * 2.4)) : 64;
  const take = (room?.won || 0) + extra;

  return (
    <div className="kash-room" data-test="bj-kash-room" role="dialog" aria-label="Security room">
      <div className="kash-room-head">
        <b className="western">{dealer ? 'The back room' : 'Security has you'}</b>
        <span className="small dim">{dealer ? `It’s ${room.cheaterName}. Go as long as you want.` : 'The house caught a Kash Bet.'}</span>
      </div>
      <div className="kash-stage" ref={box} data-test="bj-kash-toy">
        <canvas ref={canvas} className="kash-canvas"
          onPointerDown={dealer ? use : undefined}
          style={{ touchAction: 'none' }} />
        {head && (
          <div className="kash-head" style={{
            width: headSize, height: headSize * 1.1,
            left: head.x, top: head.y,
            transform: `translate(-50%, -58%) rotate(${head.rot}rad)`,
          }} data-test="bj-kash-head">
            <Bust id={room.cheaterId} avatar={room.avatar} size={headSize} still={reduced} title={room.cheaterName} />
          </div>
        )}
      </div>
      {dealer ? (
        <>
          <div className="kash-tools" data-test="bj-kash-tools" role="toolbar" aria-label="Tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" className={`kash-tool ${tool === t.id ? 'on' : ''}`}
                data-test={`bj-kash-tool-${t.id}`} aria-pressed={tool === t.id}
                onClick={() => setTool(t.id)}>{t.glyph}<small>{t.label}</small></button>
            ))}
          </div>
          <div className="kash-collect" data-test="bj-kash-collect">
            <span className="small">Kash winnings {money(room.won || 0)} + extra</span>
            <div className="kash-step">
              <button type="button" className="btn small" data-test="bj-kash-extra-minus" onClick={() => setExtra((n) => Math.max(0, n - 25))} aria-label="Less extra">−</button>
              <b className="mono" data-test="bj-kash-extra">{money(extra)}</b>
              <button type="button" className="btn small" data-test="bj-kash-extra-plus" onClick={() => setExtra((n) => Math.min(room.extraMax || 300, n + 25))} aria-label="More extra">+</button>
            </div>
            <button type="button" className="btn primary" data-test="bj-kash-finish" onClick={() => onFinish(extra)}>Collect {money(take)}</button>
          </div>
        </>
      ) : (
        <div className="kash-collect">
          <span className="small dim">You can watch. You cannot reach the tools.</span>
          {onDismiss && <button type="button" className="btn small" onClick={onDismiss}>OK</button>}
        </div>
      )}
    </div>
  );
}
export { TOOLS };
