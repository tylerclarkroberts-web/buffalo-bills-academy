// Admin/dev-only harness: a lit mid-tunnel with the camera already facing the stick insect or STEEZE,
// or a frozen battle / intro, so screenshots do not depend on maze walking.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, useSession, signInUrl } from '../api.js';
import { navigate } from '../App.jsx';
import { BoScreen, BO_BUTTON } from '../admin/AdminBoundary.jsx';
import { adminGate } from '../admin/gate.js';
import StickIntro from './StickIntro.jsx';
import Bout from '../barn/Bout.jsx';
import '../barn/barn.css';
import './mines.css';
import './mine-preview.css';
import {
  MINE_PREVIEW_API, MINE_PREVIEW_LABEL, MINE_PREVIEW_PATH, SHOTS,
  flourishOf, mountMinePreview, previewBout,
} from './minePreview.js';

export default function MinePreviewPage() {
  const { me, loading: sessionLoading } = useSession();
  const [gate, setGate] = useState({ loading: true, data: null, error: null });
  const params = new URLSearchParams(window.location.search);
  const shot = SHOTS.includes(params.get('shot')) ? params.get('shot') : 'stick-wall';
  const battle = shot.includes('battle') || Boolean(flourishOf(shot));
  const canvas = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { document.title = `Preview mines · Buffalo Bill's Academy`; }, []);
  useEffect(() => {
    let stop = false;
    setGate((g) => ({ ...g, loading: true }));
    api('GET', MINE_PREVIEW_API).then(
      (data) => { if (!stop) setGate({ loading: false, data, error: null }); },
      (error) => { if (!stop) setGate({ loading: false, data: null, error }); },
    );
    return () => { stop = true; };
  }, [me?.id]);

  useEffect(() => {
    if (battle || !gate.data?.preview || !canvas.current) return undefined;
    setReady(false);
    return mountMinePreview(canvas.current, { shot, onReady: () => setReady(true) });
  }, [gate.data?.preview, shot, battle]);

  useEffect(() => {
    const tag = flourishOf(shot);
    if (!tag) return undefined;
    const start = setTimeout(() => { window.__steezeShow = tag; setReady(true); }, 2800);
    return () => { clearTimeout(start); window.__steezeShow = null; };
  }, [shot]);

  useEffect(() => {
    if (battle && !flourishOf(shot)) {
      const t = setTimeout(() => setReady(true), 2700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [battle, shot]);

  const bout = useMemo(() => (battle ? previewBout(shot.startsWith('steeze') ? 'steeze' : 'stick') : null), [battle, shot]);

  const status = adminGate({ sessionLoading: sessionLoading || gate.loading, me, error: gate.error });
  if (status === 'loading') return <BoScreen testId="bo-loading"><p style={{ margin: 0, opacity: 0.7 }}>Opening the preview…</p></BoScreen>;
  if (status === 'signin') return (
    <BoScreen title="Preview mines" testId="bo-signin">
      <p style={{ margin: 0, opacity: 0.85 }}>Sign in as the owner (or use the local dev login) to preview the legendary insect and STEEZE.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a style={BO_BUTTON} href={signInUrl(MINE_PREVIEW_PATH)}>Sign in with Google</a>
        <button style={{ ...BO_BUTTON, background: 'transparent', color: '#fbf4ea', border: '1px solid rgba(251,244,234,.3)' }} onClick={() => navigate('/admin')} type="button">Back to the back office</button>
      </div>
    </BoScreen>
  );
  if (status === 'denied' || !gate.data?.preview) return (
    <BoScreen title="Owner only" testId="bo-denied">
      <p style={{ margin: 0, opacity: 0.85 }}>This preview is for the owner and local dev login only.</p>
      <button style={BO_BUTTON} onClick={() => navigate('/')} type="button">Back to the Academy</button>
    </BoScreen>
  );

  return (
    <div
      className={`mine-preview screen${battle ? ' is-battle' : ''}${shot === 'stick-intro' ? ' is-intro' : ''}`}
      data-test="mine-preview"
      data-shot={shot}
      data-ready={ready ? '1' : '0'}
    >
      <div className="mine-preview-banner" data-test="mine-preview-banner" role="status">
        <button className="btn ghost small" type="button" onClick={() => navigate('/admin')} data-test="mine-preview-back">← Back office</button>
        <b data-test="mine-preview-label">{MINE_PREVIEW_LABEL}</b>
        <span className="mine-preview-shot" data-test="mine-preview-shot">{shot}</span>
      </div>
      {battle ? (
        <div className="mine-preview-bout">
          <Bout bout={bout} onClose={() => navigate('/admin')} closeLabel="Leave preview" />
        </div>
      ) : (
        <div className="mine-preview-stage m-play">
          <canvas ref={canvas} className="mine-preview-canvas" data-test="mine-preview-canvas" />
          <header className="m-top">
            <span className="m-brand">ACID MINE CO.<span className="m-dim m-shaft"> · SHAFT 7</span></span>
          </header>
          <div className="m-hud tl">
            <div className="m-tier t4">THE BADLANDS</div>
            <div>SHIFT TIME 00:12</div>
            <div className="m-dim">FIND THE ACID POOL</div>
          </div>
          <div className="m-hud tr">
            <div>ACID ▯▯▯▯▯▯▯▯▯▯</div>
            <div>BUCKET 0 / 100</div>
          </div>
          <div className="m-ticker">{shot.startsWith('steeze')
            ? 'STEEZE IS STANDING IN THE TUNNEL, AS IF HE HAD ALWAYS BEEN THERE.'
            : 'A LEGENDARY LORD HOWE ISLAND STICK INSECT (SHELL), LEVEL 30, IS IN THE TUNNEL.'}</div>
          {shot === 'stick-intro' ? <StickIntro hold onDone={() => {}} /> : null}
        </div>
      )}
    </div>
  );
}
