// "Add your face": selfie or upload -> frame it -> turned into a low-poly 3D-style head, right in the browser.
// Only the finished low-poly picture is uploaded. The photo itself never leaves the device and is wiped after.
import React, { useEffect, useRef, useState } from 'react';
import { api, refreshSession, useSession } from '../api.js';
import { navigate } from '../App.jsx';
import { Bust } from './Bust.jsx';
import { stylize, detectFace } from './facepoly.js';
import { mountRelief } from './relief.js';

const PRIVACY = 'Your photo never leaves this device. It is turned into a low-poly drawing right here in your browser; only that drawing (about 240×300 pixels) is uploaded, and the photo is thrown away straight after.';
const MAX_SRC = 1280;

export default function AvatarMaker({ next = '/', retake = false }) {
  const { me } = useSession();
  const [stage, setStage] = useState('choose'); // choose | camera | crop | preview | gen
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 10));
  const src = useRef(null); // canvas holding the photo while framing (wiped afterwards)
  const fileRef = useRef(null);
  useEffect(() => { document.title = "Add your face · Buffalo Bill's Academy"; return () => wipe(); }, []);
  function wipe() { if (src.current) { src.current.width = 0; src.current.height = 0; src.current = null; } }

  async function fromFile(file) {
    if (!file) return;
    setErr('');
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = url; });
      const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); img.src = '';
      if (fileRef.current) fileRef.current.value = '';
      src.current = c; setStage('crop');
    } catch (e) { setErr(e.message); }
  }
  const startCamera = () => {
    if (!navigator.mediaDevices?.getUserMedia) { fileRef.current?.setAttribute('capture', 'user'); fileRef.current?.click(); return; }
    setErr(''); setStage('camera');
  };
  async function finishCrop(crop) {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try { const r = stylize(src.current, crop); wipe(); setResult(r); setStage('preview'); } catch (e) { setErr('Something went wrong making your avatar. Try another photo.'); }
    setBusy(false);
  }
  async function save(body) {
    setBusy(true); setErr('');
    try {
      await api('POST', '/me/avatar', body); setResult(null); await refreshSession();
      navigate(next, { replace: true }); // replace: Back must not land on the photo step again
      return;
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const skip = () => save({ kind: 'gen', seed: me?.id || seed });

  return (
    <div className={`welcome screen st-${stage}`}>
      <div className="wl-copy">
        <p className="kicker">{retake ? 'Your avatar' : 'Step 2 of 2 · Sign in'}</p>
        <h1 className="display wl-title">Add your <span className="script">face</span></h1>
        <p className="wl-lede">Take a selfie or pick a photo. We turn it into a low-poly 3D head that sits at the card table with you, nodding along.</p>
        {err && <div className="error" role="alert" onClick={() => setErr('')}>{err}</div>}
        {stage === 'choose' && (
          <div className="wl-actions">
            <button className="btn primary big" onClick={startCamera}>Take a selfie</button>
            <button className="btn big" onClick={() => { fileRef.current?.removeAttribute('capture'); fileRef.current?.click(); }}>Upload a photo</button>
            <button className="btn ghost" onClick={() => setStage('gen')}>No photo, make me one →</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
        <p className="privacy"><b>Private by design.</b> {PRIVACY}</p>
        {!retake && stage === 'choose' && <button className="btn ghost small" onClick={skip} disabled={busy}>Skip for now</button>}
        {retake && stage === 'choose' && <button className="btn ghost small" onClick={() => navigate('/profile')}>← Back to profile</button>}
      </div>
      <div className="wl-stage">
        {stage === 'choose' && <ChoosePreview me={me} />}
        {stage === 'camera' && <Camera onSnap={(c) => { src.current = c; setStage('crop'); }} onCancel={() => setStage('choose')} onError={(m) => { setErr(m); setStage('choose'); }} />}
        {stage === 'crop' && src.current && <Cropper source={src.current} busy={busy} onDone={finishCrop} onCancel={() => { wipe(); setStage('choose'); }} />}
        {stage === 'preview' && result && (
          <div className="wl-preview">
            <div className="wl-pair">
              <Relief result={result} />
              <div className="wl-seat"><Bust id={me?.id} avatar={{ kind: 'photo' }} src={result.png} size={110} /><span className="kicker">At the table</span></div>
            </div>
            <div className="row wrap">
              <button className="btn primary" disabled={busy} onClick={() => save({ kind: 'photo', png: result.png })}>Looks good, save it</button>
              <button className="btn" disabled={busy} onClick={() => { setResult(null); setStage('choose'); }}>Retake</button>
            </div>
          </div>
        )}
        {stage === 'gen' && (
          <div className="wl-preview">
            <div className="wl-gen"><Bust id={seed} avatar={{ kind: 'gen', seed }} size={150} /></div>
            <div className="row wrap">
              <button className="btn primary" disabled={busy} onClick={() => save({ kind: 'gen', seed })}>Use this one</button>
              <button className="btn" onClick={() => setSeed(Math.random().toString(36).slice(2, 10))}>Shuffle</button>
              <button className="btn ghost" onClick={() => setStage('choose')}>← Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
      .catch(() => onError('No camera access. You can upload a photo instead.'));
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
      <div className="wl-frame"><video ref={video} playsInline muted className="mirror" /><div className="wl-guide" /></div>
      <div className="row"><button className="btn primary" onClick={snap}>Snap</button><button className="btn" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function Cropper({ source, busy, onDone, onCancel }) {
  const view = useRef(null);
  const box = useRef(null);
  const [st, setSt] = useState({ zoom: 1.25, cx: source.width / 2, cy: source.height * 0.42 });
  const [dim, setDim] = useState({ w: 240, h: 300 });
  useEffect(() => {
    detectFace(source).then((b) => {
      if (!b) return;
      const fw = b.width / 0.6; // face fills ~60% of the frame width
      const base = Math.max(240 / source.width, 300 / source.height);
      setSt({ zoom: Math.max(1, Math.min(4, 240 / fw / base)), cx: b.x + b.width / 2, cy: b.y + b.height * 0.46 });
    });
    const ro = new ResizeObserver(() => { const r = box.current.getBoundingClientRect(); setDim({ w: r.width, h: r.height }); });
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const crop = () => {
    const base = Math.max(dim.w / source.width, dim.h / source.height);
    const s = base * st.zoom;
    const w = dim.w / s, h = dim.h / s;
    const x = Math.max(0, Math.min(source.width - w, st.cx - w / 2)), y = Math.max(0, Math.min(source.height - h, st.cy - h / 2));
    return { x, y, w, h, s };
  };
  useEffect(() => {
    const c = view.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(dim.w * dpr); c.height = Math.round(dim.h * dpr);
    const { x, y, w, h } = crop();
    c.getContext('2d').drawImage(source, x, y, w, h, 0, 0, c.width, c.height);
  }, [st, dim]);
  const drag = useRef(null);
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => {
    if (!drag.current) return;
    const { s } = crop();
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY };
    setSt((p) => ({ ...p, cx: p.cx - dx / s, cy: p.cy - dy / s }));
  };
  const onUp = () => { drag.current = null; };
  return (
    <div className="wl-cam">
      <div className="wl-frame" ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onWheel={(e) => setSt((p) => ({ ...p, zoom: Math.max(1, Math.min(4, p.zoom * (e.deltaY < 0 ? 1.08 : 0.93))) }))}>
        <canvas ref={view} />
        <div className="wl-guide" />
        <span className="wl-hint">Drag to move · fit your face in the oval</span>
      </div>
      <label className="row wl-zoom"><span className="kicker">Zoom</span><input type="range" min="1" max="4" step="0.01" value={st.zoom} onChange={(e) => setSt({ ...st, zoom: +e.target.value })} aria-label="Zoom" /></label>
      <div className="row"><button className="btn primary" disabled={busy} onClick={() => onDone(crop())}>{busy ? 'Building your head…' : 'Make it low-poly'}</button><button className="btn" onClick={onCancel}>Cancel</button></div>
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
