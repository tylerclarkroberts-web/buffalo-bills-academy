// v51 daily faun. Peeks left, peeks right, then asks to talk. Yes → jig + wooden box (server rolls the gift once
// a day). No → he leaves. ♪-aware little bleats; reduced-motion skips the dance.
// Character art is the exact uploaded Tumnus photo (client/public/fawn/tumnus.png) — not a redrawn SVG.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, refreshSession, useSession } from '../api.js';
import { reducedMotion } from '../themes/store.js';
import './fawn.css';

const KEY = 'bba.fawn.dismiss';
const FAUN = '/fawn/tumnus.png';
const today = () => new Date().toISOString().slice(0, 10);

function bleat(on) {
  if (!on) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(420, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.28);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.35);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.4);
    setTimeout(() => ac.close().catch(() => {}), 600);
  } catch { /* ignore */ }
}

/** Exact uploaded faun photo. Peek crops to head/shoulders; moon shows rear/lower crop bent over. */
function FaunPhoto({ pose = 'idle', className }) {
  const moon = pose === 'moon';
  return (
    <div className={`fn-photo ${pose} ${className || ''}`} aria-hidden="true">
      <img
        className="fn-img"
        src={FAUN}
        alt=""
        draggable={false}
        style={moon ? { objectPosition: 'center 85%' } : undefined}
      />
    </div>
  );
}

function Box({ open, onOpen }) {
  return (
    <button type="button" className={`fn-box ${open ? 'open' : ''}`} onClick={onOpen} data-test="fawn-box" aria-label="Open the wooden box">
      <svg viewBox="0 0 100 80" aria-hidden="true">
        <rect className="fn-box-body" x="10" y="28" width="80" height="46" rx="3" fill="#a67c4a" stroke="#5a3a1e" strokeWidth="2" />
        <rect className="fn-box-lid" x="8" y="14" width="84" height="18" rx="2" fill="#c4965a" stroke="#5a3a1e" strokeWidth="2" />
        <rect x="44" y="18" width="12" height="10" rx="1" fill="#e6c25a" stroke="#5a3a1e" strokeWidth="1" />
        <path d="M10 40h80" stroke="#5a3a1e" strokeWidth="1.2" opacity=".5" />
      </svg>
      {!open && <span>Tap to open</span>}
    </button>
  );
}

export default function Fawn() {
  const { me } = useSession();
  const still = useMemo(() => reducedMotion(), []);
  const sound = true;
  const [phase, setPhase] = useState('idle'); // idle|peekL|peekR|ask|jig|box|reveal|moon|gone
  const [side, setSide] = useState('left');
  const [gift, setGift] = useState(null);
  const [err, setErr] = useState('');
  const timer = useRef([]);
  const clear = () => { timer.current.forEach(clearTimeout); timer.current = []; };
  const later = (fn, ms) => { timer.current.push(setTimeout(fn, ms)); };

  useEffect(() => {
    if (!me) return undefined;
    let alive = true;
    (async () => {
      try {
        if (sessionStorage.getItem(KEY) === today()) return;
        const st = await api('GET', '/fawn');
        if (!alive || !st.available) return;
        later(() => { setSide('left'); setPhase('peekL'); bleat(sound && !still); }, 1200);
        later(() => setPhase('idle'), still ? 1800 : 2800);
        later(() => { setSide('right'); setPhase('peekR'); bleat(sound && !still); }, still ? 2400 : 4000);
        later(() => setPhase('ask'), still ? 3400 : 5600);
      } catch { /* signed-out race */ }
    })();
    return () => { alive = false; clear(); };
  }, [me?.id]);

  const dismiss = () => {
    try { sessionStorage.setItem(KEY, today()); } catch { /* */ }
    setPhase('gone'); clear();
  };
  const refuse = () => { setPhase('gone'); bleat(sound); later(dismiss, 900); };
  const talk = async () => {
    setPhase('jig'); bleat(sound && !still);
    later(async () => {
      try {
        const r = await api('POST', '/fawn/claim');
        setGift(r.gift); refreshSession();
        setPhase(r.gift.kind === 'moon' ? 'moon' : 'box');
      } catch (e) { setErr(e.message); setPhase('ask'); }
    }, still ? 600 : 2800);
  };
  const openBox = () => setPhase('reveal');

  if (!me || phase === 'idle' || phase === 'gone') return null;
  const peeking = phase === 'peekL' || phase === 'peekR';
  return (
    <div className={`fn ${phase} side-${side} ${still ? 'still' : ''}`} data-test="fawn" role="dialog" aria-label="A faun has appeared">
      {(peeking || phase === 'jig' || phase === 'moon' || phase === 'ask' || phase === 'box' || phase === 'reveal') && (
        <div className="fn-stage" aria-hidden={phase === 'ask' || phase === 'box' || phase === 'reveal' ? 'false' : 'true'}>
          <FaunPhoto pose={phase === 'jig' ? 'jig' : phase === 'moon' ? 'moon' : peeking ? 'peek' : 'idle'} />
        </div>
      )}
      {phase === 'ask' && (
        <div className="fn-card" data-test="fawn-ask">
          <p className="fn-kick">A faun has appeared</p>
          <h2 className="display fn-title">Talk to him?</h2>
          <p className="small muted">He is holding a wooden box and looking very pleased with himself.</p>
          <div className="fn-acts">
            <button type="button" className="btn primary" data-test="fawn-yes" onClick={talk}>Yes</button>
            <button type="button" className="btn ghost" data-test="fawn-no" onClick={refuse}>No</button>
          </div>
          {err && <p className="error">{err}</p>}
        </div>
      )}
      {phase === 'box' && (
        <div className="fn-card" data-test="fawn-present">
          <p className="fn-kick">A gift</p>
          <h2 className="display fn-title">He hands you a wooden box</h2>
          <Box open={false} onOpen={openBox} />
        </div>
      )}
      {phase === 'reveal' && gift && (
        <div className="fn-card" data-test="fawn-gift">
          <p className="fn-kick">{gift.rarity === 'jackpot' ? 'JACKPOT' : gift.rarity === 'rare' ? 'Rare find' : 'Inside'}</p>
          {gift.kind === 'cash' && <h2 className="display fn-title fn-cash">+${gift.amount}</h2>}
          {gift.kind === 'cig' && <h2 className="display fn-title">A filtered cigarette</h2>}
          <p className="small muted">{gift.kind === 'cash' ? 'Straight into your bankroll.' : 'Added to your Smoke Shop stash (one at a time).'}</p>
          <button type="button" className="btn primary" data-test="fawn-done" onClick={dismiss}>Nice</button>
        </div>
      )}
      {phase === 'moon' && (
        <div className="fn-card" data-test="fawn-moon">
          <p className="fn-kick">Hmm…</p>
          <h2 className="display fn-title">“Oh — maybe it is right over here…”</h2>
          <p className="small muted">He bends over, moons you with his goat butt, and bleats.</p>
          <button type="button" className="btn primary" data-test="fawn-done" onClick={dismiss}>Alright then</button>
        </div>
      )}
    </div>
  );
}
