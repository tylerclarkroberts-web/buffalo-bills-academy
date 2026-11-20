// Kash Bet back room: the cheater's own avatar head on a stick-figure ragdoll. Original art only.
import React, { useEffect, useRef, useState } from 'react';
import { Bust } from '../avatar/Bust.jsx';
import { looks, shade } from '../avatar/genbust.js';
import { shirtOf } from '../avatar/wear.js';
import { TOOLS, createToy, toyPalette } from './kashToy.js';

const money = (x) => `$${Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function paletteFor(avatar, id) {
  const seed = avatar?.seed || id || 'toy';
  const L = looks(seed, avatar?.skinTone);
  return { ...toyPalette(avatar, id), skin: L.skin, shirt: shirtOf(avatar?.wear, L.shirt) };
}


function limb(ctx, ax, ay, bx, by, w0, w1, fill) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d;
  ctx.beginPath();
  ctx.moveTo(ax + nx * w0, ay + ny * w0);
  ctx.quadraticCurveTo((ax + bx) / 2 + nx * ((w0 + w1) / 2), (ay + by) / 2 + ny * ((w0 + w1) / 2), bx + nx * w1, by + ny * w1);
  ctx.lineTo(bx - nx * w1, by - ny * w1);
  ctx.quadraticCurveTo((ax + bx) / 2 - nx * ((w0 + w1) / 2), (ay + by) / 2 - ny * ((w0 + w1) / 2), ax - nx * w0, ay - ny * w0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function joint(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function draw(ctx, snap, pal) {
  const { points: p, fx, bombs, tears, w, h, floor, s, squash } = snap;
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1a1420'); bg.addColorStop(1, '#0b0810');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255, 200, 80, 0.06)';
  ctx.beginPath(); ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.15, h); ctx.lineTo(w * 0.85, h); ctx.fill();
  ctx.strokeStyle = 'rgba(255,233,168,.15)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(10, floor); ctx.lineTo(w - 10, floor); ctx.stroke();

  if (!p?.hip) return;
  const q = 1 - (squash || 0) * 0.08;
  ctx.save();
  ctx.translate(p.hip.x, floor);
  ctx.scale(1 + (squash || 0) * 0.06, q);
  ctx.translate(-p.hip.x, -floor);

  // Contact shadow
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse((p.aL.x + p.aR.x) / 2, floor - 2, 36 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill();

  const skin = pal.skin, shirt = pal.shirt, pants = pal.pants, shoe = pal.shoe;
  const skinD = shade(typeof skin === 'string' && skin.startsWith('#') ? skin : '#c98962', -0.12);
  const shirtD = shade(typeof shirt === 'string' && shirt.startsWith('#') ? shirt : '#3d5a7a', -0.2);

  // Legs then torso then arms (back to front)
  limb(ctx, p.hL.x, p.hL.y, p.kL.x, p.kL.y, 9 * s, 7 * s, pants);
  limb(ctx, p.kL.x, p.kL.y, p.aL.x, p.aL.y, 7 * s, 5 * s, pants);
  limb(ctx, p.hR.x, p.hR.y, p.kR.x, p.kR.y, 9 * s, 7 * s, pants);
  limb(ctx, p.kR.x, p.kR.y, p.aR.x, p.aR.y, 7 * s, 5 * s, pants);
  // shoes
  for (const f of [p.aL, p.aR]) {
    ctx.fillStyle = shoe;
    ctx.beginPath(); ctx.ellipse(f.x + 3 * s, f.y + 2 * s, 9 * s, 4.5 * s, 0.1, 0, Math.PI * 2); ctx.fill();
  }
  // torso: neck to hip, shoulders as a shirt
  limb(ctx, p.neck.x, p.neck.y, p.hip.x, p.hip.y, 13 * s, 16 * s, shirt);
  limb(ctx, p.sL.x, p.sL.y, p.sR.x, p.sR.y, 10 * s, 10 * s, shirtD);
  // arms
  limb(ctx, p.sL.x, p.sL.y, p.eL.x, p.eL.y, 7 * s, 5.5 * s, shirt);
  limb(ctx, p.eL.x, p.eL.y, p.wL.x, p.wL.y, 5.5 * s, 4 * s, skin);
  limb(ctx, p.sR.x, p.sR.y, p.eR.x, p.eR.y, 7 * s, 5.5 * s, shirt);
  limb(ctx, p.eR.x, p.eR.y, p.wR.x, p.wR.y, 5.5 * s, 4 * s, skin);
  // neck
  limb(ctx, p.neck.x, p.neck.y, p.head.x, p.head.y + 10 * s, 5 * s, 6.5 * s, skinD);
  joint(ctx, p.sL.x, p.sL.y, 5 * s, shirtD);
  joint(ctx, p.sR.x, p.sR.y, 5 * s, shirtD);
  joint(ctx, p.eL.x, p.eL.y, 4 * s, skin);
  joint(ctx, p.eR.x, p.eR.y, 4 * s, skin);
  joint(ctx, p.hip.x, p.hip.y, 6 * s, shirtD);
  joint(ctx, p.kL.x, p.kL.y, 4.5 * s, pants);
  joint(ctx, p.kR.x, p.kR.y, 4.5 * s, pants);
  // hands
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(p.wL.x, p.wL.y, 5 * s, 0, Math.PI * 2); ctx.arc(p.wR.x, p.wR.y, 5 * s, 0, Math.PI * 2); ctx.fill();

  for (const t of tears || []) {
    const a = Math.max(0, t.life / 2.8);
    ctx.globalAlpha = a;
    ctx.save(); ctx.translate(t.at || p[t.a]?.x || 0, t.y || p[t.a]?.y || 0); ctx.rotate(t.rot || 0);
    ctx.fillStyle = shade(typeof shirt === 'string' && shirt.startsWith('#') ? shirt : '#3d5a7a', 0.25);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(8 * s, 4 * s, 4 * s, 14 * s); ctx.quadraticCurveTo(0, 8 * s, -3 * s, 12 * s); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  ctx.restore();

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
    } else if (f.kind === 'smoke' || f.kind === 'dust') {
      ctx.fillStyle = f.kind === 'dust' ? 'rgba(180,160,130,.45)' : 'rgba(200,200,210,.55)';
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
    } else if (f.kind === 'tear') {
      ctx.fillStyle = '#ffe9a8'; ctx.font = '700 13px "Newsreader", Georgia, serif';
      ctx.textAlign = 'center'; ctx.fillText('RIP', f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}

export function KashToy({ room, onHit, onFinish, onDismiss, reduced }) {
  const box = useRef(null);
  const toy = useRef(null);
  const canvas = useRef(null);
  const headEl = useRef(null);
  const dragging = useRef(false);
  const moved = useRef(false);
  const pal = useRef(paletteFor(room?.avatar, room?.cheaterId));
  const [tool, setTool] = useState('punch');
  const [extra, setExtra] = useState(Math.min(300, room?.extraMax || 300));
  const dealer = room?.role === 'dealer';

  useEffect(() => { pal.current = paletteFor(room?.avatar, room?.cheaterId); }, [room?.avatar, room?.cheaterId]);

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
      if (toy.current) toy.current.step(reduced ? dt * 0.15 : dt);
      const snap = toy.current?.snapshot();
      const ctx = canvas.current?.getContext('2d');
      if (ctx && snap) draw(ctx, snap, pal.current);
      const head = snap?.points?.head;
      if (head && headEl.current) {
        const sizePx = Math.round(Math.max(40, (snap.headR || 24) * 2.5));
        headEl.current.style.width = `${sizePx}px`;
        headEl.current.style.height = `${Math.round(sizePx * 1.1)}px`;
        headEl.current.style.left = `${head.x}px`;
        headEl.current.style.top = `${head.y}px`;
        headEl.current.style.transform = `translate(-50%, -58%) rotate(${snap.rot || 0}rad)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [reduced]);

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    return { x: src.clientX - r.left, y: src.clientY - r.top, nx: (src.clientX - r.left) / r.width, ny: (src.clientY - r.top) / r.height };
  };
  const down = (e) => {
    if (!dealer || !toy.current) return;
    e.preventDefault();
    const p = point(e);
    dragging.current = !!toy.current.grab(p.x, p.y);
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!dealer || !dragging.current || !toy.current) return;
    const p = point(e);
    toy.current.drag(p.x, p.y);
    moved.current = true;
  };
  const up = (e) => {
    if (!dealer || !toy.current) return;
    const p = point(e);
    const wasDrag = dragging.current && moved.current;
    toy.current.release();
    dragging.current = false;
    if (!wasDrag) {
      toy.current.apply(tool, p.nx, p.ny);
      onHit?.({ tool, x: p.nx, y: p.ny });
    }
  };

  const take = (room?.won || 0) + extra;

  return (
    <div className="kash-room" data-test="bj-kash-room" role="dialog" aria-label="Security room">
      <div className="kash-room-head">
        <b className="western">{dealer ? 'The back room' : 'Security has you'}</b>
        <span className="small dim">{dealer ? `It’s ${room.cheaterName}. Drag them around, or use a tool.` : 'The house caught a Kash Bet.'}</span>
      </div>
      <div className="kash-stage" ref={box} data-test="bj-kash-toy">
        <canvas ref={canvas} className="kash-canvas"
          onPointerDown={dealer ? down : undefined}
          onPointerMove={dealer ? move : undefined}
          onPointerUp={dealer ? up : undefined}
          onPointerCancel={dealer ? up : undefined}
          style={{ touchAction: 'none' }} />
        <div className="kash-head" ref={headEl} data-test="bj-kash-head">
          <Bust id={room.cheaterId} avatar={room.avatar} size={72} still={reduced} title={room.cheaterName} />
        </div>
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
