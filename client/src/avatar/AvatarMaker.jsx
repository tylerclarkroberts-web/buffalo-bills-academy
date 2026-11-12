// Selfies stay local while framing and correcting the cutout; only the finished drawing is uploaded.
import React, { useEffect, useRef, useState } from 'react';
import { api, refreshSession, useSession } from '../api.js';
import { navigate } from '../App.jsx';
import { Bust } from './Bust.jsx';
import { stylize, detectFace, OUT_W, OUT_H } from './facepoly.js';
import { headMask, headPath } from './head-mask.js';
import { frameCrop } from './frame-crop.js';
import { segmentHead } from './head-segmenter.js';
import CutoutEditor from './CutoutEditor.jsx';
import { mountRelief } from './relief.js';

const PRIVACY = 'Your original photo stays on this device while you edit. Background removal runs here too. Only the finished drawing is uploaded when you save. Your local photo is cleared when you save, cancel, or leave this page.';
const MAX_SRC = 1280;

export default function AvatarMaker({ next = '/', retake = false }) {
  const { me } = useSession();
  const [stage, setStage] = useState('choose');
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null), [cutout, setCutout] = useState(null), [framing, setFraming] = useState(null);
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 10));
  const src = useRef(null), cutCanvas = useRef(null), pending = useRef(null), alive = useRef(true), fileRef = useRef(null), heading = useRef(null);
  function stopCutout() { pending.current?.abort(); pending.current = null; }
  function wipe() {
    stopCutout();
    for (const c of [src.current, cutCanvas.current]) if (c) c.width = c.height = 0;
    src.current = cutCanvas.current = null;
  }
  useEffect(() => {
    alive.current = true; document.title = "Add your face · Buffalo Bill's Academy";
    heading.current?.focus();
    return () => { alive.current = false; wipe(); };
  }, []);
  function discard() { wipe(); setResult(null); setCutout(null); setFraming(null); setBusy(false); setStage('choose'); }

  async function fromFile(file) {
    if (!file) return;
    setErr(''); setBusy(true);
    const url = URL.createObjectURL(file), img = new Image();
    try {
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Could not read that image.')); img.src = url; });
      if (!alive.current) return;
      const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      wipe(); src.current = c; setFraming(null); setStage('crop');
    } catch (error) { if (alive.current) setErr(error.message); }
    finally {
      URL.revokeObjectURL(url); img.src = '';
      if (fileRef.current) fileRef.current.value = '';
      if (alive.current) setBusy(false);
    }
  }
  const startCamera = () => {
    if (!navigator.mediaDevices?.getUserMedia) { fileRef.current?.setAttribute('capture', 'user'); fileRef.current?.click(); return; }
    setErr(''); setStage('camera');
  };
  async function finishCrop(crop, position) {
    setErr(''); setFraming(position); setBusy('segment');
    const c = document.createElement('canvas'); c.width = OUT_W; c.height = OUT_H;
    c.getContext('2d').drawImage(src.current, crop.x, crop.y, crop.w, crop.h, 0, 0, OUT_W, OUT_H);
    if (cutCanvas.current) cutCanvas.current.width = cutCanvas.current.height = 0;
    cutCanvas.current = c;
    const initialAlpha = headMask(OUT_W, OUT_H);
    setCutout({ canvas: c, alpha: initialAlpha, initialAlpha, message: 'Removing the background on this device… First use downloads about 28 MB.' }); setStage('cutout');
    const controller = new AbortController(); pending.current = controller;
    try {
      const detected = await segmentHead(c, { signal: controller.signal });
      if (!alive.current || pending.current !== controller) return;
      const alpha = headMask(OUT_W, OUT_H, detected);
      if (!alpha.some((a) => a)) throw new Error('No head found');
      setCutout({ canvas: c, alpha, initialAlpha: alpha, message: 'Review your head. Restore missing hair or ears with Keep; remove remaining background with Erase.' });
    } catch (error) {
      if (alive.current && pending.current === controller && error.name !== 'AbortError') setCutout((p) => ({ ...p, message: 'Automatic cutout is unavailable. Use Erase to remove the background, or go back and choose another photo.' }));
    } finally {
      if (alive.current && pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }
  function manualCutout() {
    stopCutout(); setBusy(false);
    setCutout((p) => ({ ...p, message: 'Use Erase to remove the background and Keep to restore hair or ears. Dimmed areas will be removed.' }));
  }
  function adjustFraming() { stopCutout(); setBusy(false); setResult(null); setStage('crop'); }
  async function buildHead() {
    const controller = new AbortController(); pending.current = controller;
    setBusy('build'); setErr('');
    await new Promise((r) => setTimeout(r, 30));
    if (!alive.current || pending.current !== controller) return;
    try {
      const r = stylize(cutout.canvas, { x: 0, y: 0, w: OUT_W, h: OUT_H }, cutout.alpha);
      setResult(r); setStage('preview');
    } catch { setErr('Something went wrong making your avatar. Try adjusting the cutout.'); }
    if (alive.current && pending.current === controller) { pending.current = null; setBusy(false); }
  }
  async function save(body) {
    setBusy(true); setErr('');
    try {
      await api('POST', '/me/avatar', body);
      if (!alive.current) return;
      wipe(); setResult(null); setCutout(null); await refreshSession();
      if (alive.current) navigate(next, { replace: true });
    } catch (error) { if (alive.current) { setErr(error.message); setBusy(false); } }
  }
  const skip = () => save({ kind: 'gen', seed: me?.id || seed });
  return (
    <div className={'welcome screen st-' + stage}>
      <div className="wl-copy">
        <p className="kicker">{retake ? 'Your avatar' : 'Step 2 of 2 · Sign in'}</p>
        <h1 ref={heading} tabIndex={-1} className="display wl-title">Add your <span className="script">face</span></h1>
        <p className="wl-lede">Take a selfie or pick a photo. Remove its background, then make a low-poly head for the card table.</p>
        {err && <div className="error" role="alert" onClick={() => setErr('')}>{err}</div>}
        {stage === 'choose' && <div className="wl-actions">
          <button className="btn primary big" disabled={busy} onClick={startCamera}>Take a selfie</button>
          <button className="btn big" disabled={busy} onClick={() => { fileRef.current?.removeAttribute('capture'); fileRef.current?.click(); }}>{busy ? 'Reading photo…' : 'Upload a photo'}</button>
          <button className="btn ghost" disabled={busy} onClick={() => setStage('gen')}>No photo, make me one →</button>
        </div>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
        <p className="privacy"><b>Private by design.</b> {PRIVACY}</p>
        {!retake && stage === 'choose' && <button className="btn ghost small" onClick={skip} disabled={busy}>Skip for now</button>}
        {retake && stage === 'choose' && <button className="btn ghost small" disabled={busy} onClick={() => navigate('/profile')}>← Back to profile</button>}
      </div>
      <div className="wl-stage">
        {stage === 'choose' && <ChoosePreview me={me} />}
        {stage === 'camera' && <Camera onSnap={(c) => { src.current = c; setFraming(null); setStage('crop'); }} onCancel={discard} onError={(m) => { setErr(m); setStage('choose'); }} />}
        {stage === 'crop' && src.current && <Cropper source={src.current} initial={framing} busy={busy} onDone={finishCrop} onCancel={discard} />}
        {stage === 'cutout' && cutout && <div className="wl-cutout">
          <p className="small wl-cutout-status" role="status">{cutout.message}</p>
          <CutoutEditor source={cutout.canvas} alpha={cutout.alpha} busy={!!busy}
            onChange={(alpha) => setCutout((p) => ({ ...p, alpha }))}
            onReset={() => setCutout((p) => ({ ...p, alpha: new Uint8ClampedArray(p.initialAlpha) }))} />
          <div className="row wrap wl-edit-actions">
            {busy === 'segment' ? <button className="btn" onClick={manualCutout}>Use manual cutout</button> : <button className="btn primary" disabled={!!busy || !cutout.alpha.some((a) => a)} onClick={buildHead}>{busy ? 'Building your head…' : 'Make it low-poly'}</button>}
            <button className="btn" onClick={adjustFraming}>Adjust framing</button>
            <button className="btn ghost" onClick={discard}>Cancel</button>
          </div>
        </div>}
        {stage === 'preview' && result && <div className="wl-preview">
          <div className="wl-pair"><Relief result={result} /><div className="wl-seat"><Bust id={me?.id} avatar={{ kind: 'photo' }} src={result.png} size={110} /><span className="kicker">At the table</span></div></div>
          <p className="small muted">Anything kept in this drawing will be visible in your avatar.</p>
          <div className="row wrap">
            <button className="btn primary" disabled={busy} onClick={() => save({ kind: 'photo', png: result.png })}>Looks good, save it</button>
            <button className="btn" disabled={busy} onClick={() => setStage('cutout')}>Edit cutout</button>
            <button className="btn" disabled={busy} onClick={adjustFraming}>Adjust framing</button>
            <button className="btn ghost" disabled={busy} onClick={discard}>Retake</button>
          </div>
        </div>}
        {stage === 'gen' && <div className="wl-preview">
          <div className="wl-gen"><Bust id={seed} avatar={{ kind: 'gen', seed }} size={150} /></div>
          <div className="row wrap">
            <button className="btn primary" disabled={busy} onClick={() => save({ kind: 'gen', seed })}>Use this one</button>
            <button className="btn" disabled={busy} onClick={() => setSeed(Math.random().toString(36).slice(2, 10))}>Shuffle</button>
            <button className="btn ghost" disabled={busy} onClick={() => setStage('choose')}>← Back</button>
          </div>
        </div>}
      </div>
    </div>
  );
}

function HeadGuide() {
  const d = headPath(OUT_W, OUT_H);
  return <svg className="wl-guide" viewBox={'0 0 ' + OUT_W + ' ' + OUT_H} aria-hidden="true">
    <path className="wl-guide-shade" d={'M0 0H240V300H0Z ' + d} fillRule="evenodd" />
    <path className="wl-guide-outline" d={d} />
  </svg>;
}

function Cropper({ source, initial, busy, onDone, onCancel }) {
  const view = useRef(null), box = useRef(null), adjusted = useRef(false);
  const [st, setSt] = useState(() => initial || { zoom: 1.25, cx: source.width / 2, cy: source.height * 0.42 });
  const [dim, setDim] = useState({ w: 240, h: 300 });
  useEffect(() => {
    let active = true;
    if (!initial) detectFace(source).then((b) => {
      if (!active || adjusted.current || !b) return;
      const base = Math.max(OUT_W / source.width, OUT_H / source.height);
      setSt({ zoom: Math.max(1, Math.min(4, OUT_W * 0.72 / b.width / base)), cx: b.x + b.width / 2, cy: b.y + b.height * 0.48 });
    });
    const ro = new ResizeObserver(() => { const r = box.current.getBoundingClientRect(); setDim({ w: r.width, h: r.height }); });
    ro.observe(box.current);
    return () => { active = false; ro.disconnect(); };
  }, []);
  const crop = frameCrop(source.width, source.height, st);
  useEffect(() => {
    const c = view.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(dim.w * dpr); c.height = Math.round(dim.h * dpr);
    c.getContext('2d').drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
  }, [st, dim]);
  const drag = useRef(null);
  const change = (fn) => { adjusted.current = true; setSt(fn); };
  const onDown = (e) => { if (busy || e.button !== 0) return; drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => {
    if (!drag.current || busy) return;
    const scale = dim.w / crop.w, dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    change((p) => ({ ...p, cx: p.cx - dx / scale, cy: p.cy - dy / scale }));
  };
  const zoom = (n) => change((p) => ({ ...p, zoom: Math.max(1, Math.min(4, n)) }));
  return <div className="wl-cam">
    <div className="wl-frame" ref={box} tabIndex={0} role="group" aria-label="Position photo. Drag or use arrow keys."
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={(e) => {
        const delta = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
        if (!delta || busy) return; e.preventDefault();
        change((p) => ({ ...p, cx: p.cx + delta[0] * crop.w / 30, cy: p.cy + delta[1] * crop.h / 30 }));
      }}
      onWheel={(e) => { if (!busy) zoom(st.zoom * (e.deltaY < 0 ? 1.08 : 0.93)); }}>
      <canvas ref={view} /><HeadGuide /><span className="wl-hint">Drag to move · fit your head inside the outline</span>
    </div>
    <label className="row wl-zoom"><span className="kicker">Zoom</span><input type="range" min="1" max="4" step="0.01" value={st.zoom} disabled={busy} onChange={(e) => zoom(Number(e.target.value))} aria-label="Zoom" /></label>
    <div className="row"><button className="btn primary" disabled={busy} onClick={() => onDone(crop, st)}>Remove background</button><button className="btn" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </div>;
}
function ChoosePreview({ me }) {
  return (
    <div className="wl-demo" aria-hidden="true">
      <div className="wl-oval"><svg viewBox="0 0 100 125"><ellipse cx="50" cy="58" rx="36" ry="48" /></svg><span>Your face here</span></div>
      <div className="wl-demo-row">{['a1', 'b7', 'c3'].map((s, i) => <Bust key={s} id={s} avatar={{ kind: 'gen', seed: s + (me?.id || '') }} size={54} phase={i / 3} />)}</div>
    </div>
  );
}

function Camera({ onSnap, onCancel, onError }) {
  const video = useRef(null);
  const stream = useRef(null);
  useEffect(() => {
    let alive = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false })
      .then((s) => { if (!alive) { s.getTracks().forEach((t) => t.stop()); return; } stream.current = s; video.current.srcObject = s; video.current.play().catch(() => {}); })
      .catch(() => { if (alive) onError('No camera access. You can upload a photo instead.'); });
    return () => { alive = false; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);
  const snap = () => {
    const v = video.current; if (!v?.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(v, 0, 0);
    stream.current?.getTracks().forEach((t) => t.stop());
    onSnap(c);
  };
  return (
    <div className="wl-cam">
      <div className="wl-frame"><video ref={video} playsInline muted className="mirror" /><HeadGuide /></div>
      <div className="row"><button className="btn primary" onClick={snap}>Snap</button><button className="btn" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function Relief({ result }) {
  const c = useRef(null);
  useEffect(() => {
    try { return mountRelief(c.current, result); } catch { return undefined; }
  }, [result]);
  return <div className="wl-relief"><canvas ref={c} aria-label="Your low-poly 3D head" /></div>;
}
