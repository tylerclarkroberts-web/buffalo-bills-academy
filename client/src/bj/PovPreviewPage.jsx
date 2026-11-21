// Admin-only dealer POV preview. State stays in the browser; the only network call is the admin gate.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, useSession, signInUrl } from '../api.js';
import { navigate } from '../App.jsx';
import { BoScreen, BO_BUTTON } from '../admin/AdminBoundary.jsx';
import { adminGate } from '../admin/gate.js';
import { useMedia } from '../ui.jsx';
import { unlockSfx } from './sfx.js';
import { DealerPov } from './DealerPov.jsx';
import PovErrorBoundary from './PovErrorBoundary.jsx';
import { useDealReveal } from './useDealReveal.js';
import {
  PREVIEW_API, PREVIEW_LABEL, PREVIEW_PATH,
  initialPreviewState, previewStep, previewView, nextCueDelay,
} from './povPreview.js';
import './dealer-pov.css';
import './pov-preview.css';

export default function PovPreviewPage() {
  const { me, loading: sessionLoading } = useSession();
  const [gate, setGate] = useState({ loading: true, data: null, error: null });
  const [st, setSt] = useState(() => initialPreviewState(Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const [povCrashed, setPovCrashed] = useState(false);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');

  useEffect(() => { document.title = `Preview dealer view · Buffalo Bill's Academy`; }, []);
  useEffect(() => {
    let stop = false;
    setGate((g) => ({ ...g, loading: true }));
    api('GET', PREVIEW_API).then(
      (data) => { if (!stop) setGate({ loading: false, data, error: null }); },
      (error) => { if (!stop) setGate({ loading: false, data: null, error }); },
    );
    return () => { stop = true; };
  }, [me?.id]);

  const status = adminGate({ sessionLoading: sessionLoading || gate.loading, me, error: gate.error });
  if (status === 'loading') return <BoScreen testId="bo-loading"><p style={{ margin: 0, opacity: 0.7 }}>Opening the preview…</p></BoScreen>;
  if (status === 'signin') return (
    <BoScreen title="Preview dealer view" testId="bo-signin">
      <p style={{ margin: 0, opacity: 0.85 }}>Sign in with the owner’s Google account to preview the dealer table.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a style={BO_BUTTON} href={signInUrl(PREVIEW_PATH)}>Sign in with Google</a>
        <button style={{ ...BO_BUTTON, background: 'transparent', color: '#fbf4ea', border: '1px solid rgba(251,244,234,.3)' }} onClick={() => navigate('/admin')}>Back to the back office</button>
      </div>
    </BoScreen>
  );
  if (status === 'denied' || !gate.data?.preview) return (
    <BoScreen title="Owner only" testId="bo-denied">
      <p style={{ margin: 0, opacity: 0.85 }}>This preview is only for the Academy’s owner. You’re signed in as <b>{me?.name || 'someone else'}</b>.</p>
      <button style={BO_BUTTON} onClick={() => navigate('/')}>Back to the Academy</button>
    </BoScreen>
  );

  return (
    <LivePreview
      st={st} setSt={setSt} now={now} setNow={setNow}
      reduced={reduced} povCrashed={povCrashed} setPovCrashed={setPovCrashed}
    />
  );
}

function LivePreview({ st, setSt, now, setNow, reduced, povCrashed, setPovCrashed }) {
  const stRef = useRef(st);
  stRef.current = st;
  useEffect(() => {
    let id = 0, stop = false;
    const schedule = () => {
      if (stop) return;
      const s = stRef.current;
      const n = Date.now();
      const tipIn = s.tip?.until != null ? s.tip.until - n : 8000;
      const pitIn = s.pit?.until != null ? s.pit.until - n : 8000;
      const wait = Math.max(80, Math.min(nextCueDelay(s, n), tipIn, pitIn, 2000));
      id = setTimeout(() => {
        const at = Date.now();
        const cur = stRef.current;
        const nxt = previewStep(cur, 'tick', at);
        if (nxt !== cur) { setNow(at); setSt(nxt); }
        else if (cur.tip || cur.pit) setNow(at);
        schedule();
      }, wait);
    };
    schedule();
    return () => { stop = true; clearTimeout(id); };
  }, [setSt, setNow]);

  const act = useCallback((cmd) => {
    try { unlockSfx(); } catch { /* */ }
    const n = Date.now();
    setNow(n);
    setSt((s) => previewStep(s, cmd, n));
  }, [setSt, setNow]);

  const v = useMemo(() => previewView(st, now), [st, now]);
  const r = v.round;
  const showLast = !!(r && r.phase === 'betting' && v.last);
  const { shown, dealing, tap } = useDealReveal(v, { showLast, reduced });
  const dealerCards = showLast ? v.last.dealer : r?.dealer || [];
  const dealerTotal = showLast ? v.last.dealerTotal : r?.dealerTotal;
  const handsOf = (seat) => (showLast
    ? (v.last.hands || []).map((h, i) => ({ ...h, i, total: null, res: v.last.results.find((x) => x.hand === i) })).filter((h) => h.seat === seat)
    : (r?.hands || []).filter((h) => h.seat === seat));
  const turnSeat = r?.phase === 'play' && r.turn != null && r.turn >= 0 ? r.turn : null;
  const fxFor = (seat) => (st.fx?.results || []).filter((x) => x.seat === seat);

  return (
    <div className="screen bj bj-t pov bj-preview" data-test="bj-preview" data-mock="true">
      <div className="bj-preview-banner" data-test="bj-preview-banner" role="status">
        <button className="btn ghost small" onClick={() => navigate('/admin')} data-test="bj-preview-back" type="button">← Back office</button>
        <b data-test="bj-preview-label">{PREVIEW_LABEL}</b>
      </div>
      <div className="panel bj-felt bj-preview-felt">
        {povCrashed ? (
          <p className="error" role="alert">The 3D preview hit a snag. Reload to try again.</p>
        ) : (
          <PovErrorBoundary onError={() => setPovCrashed(true)} fallback={<p className="error" role="alert">The 3D preview hit a snag.</p>}>
            <DealerPov
              v={v}
              dealerCards={dealerCards}
              dealerTotal={dealerTotal}
              handsOf={handsOf}
              turnSeat={turnSeat}
              fxFor={fxFor}
              shown={shown}
              dealing={dealing}
              reduced={reduced}
              now={now}
              tip={v.tip}
              thanks={v.tip?.thanks ? 'Thanks for the tip' : null}
              onAuto={(on) => act(on ? 'auto-on' : 'auto-off')}
              onDeal={(action) => act(action || 'deal')}
              onSay={(text) => act({ t: 'say', text })}
              meId="preview-house"
              kash={null}
              onCatch={null}
              onCrash={() => setPovCrashed(true)}
            />
          </PovErrorBoundary>
        )}
      </div>
      <div className="bj-preview-controls" data-test="bj-preview-controls">
        <button type="button" className="btn" onClick={() => act('next-hand')} data-test="bj-preview-next">Next hand</button>
        <button type="button" className="btn" onClick={() => act('pit')} data-test="bj-preview-pit">Pit boss</button>
        <button type="button" className="btn" onClick={() => act('tip')} data-test="bj-preview-tip">Mock tip</button>
        <button type="button" className={`btn ${v.house.autopilot ? 'primary' : 'ghost'}`} onClick={() => act(v.house.autopilot ? 'auto-off' : 'auto-on')} data-test="bj-preview-auto" aria-pressed={v.house.autopilot}>
          {v.house.autopilot ? 'Autopilot on' : 'Manual deal'}
        </button>
      </div>
    </div>
  );
}
