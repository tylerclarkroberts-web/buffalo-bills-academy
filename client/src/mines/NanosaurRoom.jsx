import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The Nanosaur door in the Hall of Doors (v89): an iframe running the unmodified Nanosaur WebAssembly build
// (Pangea Software 1998, source port by Iliyas Jorio, WASM port by Lachlan Wright; CC BY-NC-SA 4.0). Its ~20 MB of
// files only load once this door opens; leaving removes the frame, which ends the game. No mine API calls in here.
export default function NanosaurRoom({ onExit, elapsedMs }) {
  const frame = useRef(null);
  const [muted, setMuted] = useState(() => localStorage.getItem('bba.nano.muted') === '1');
  const tell = (msg) => frame.current?.contentWindow?.postMessage({ src: 'bba-mine', ...msg }, location.origin);
  const mutedRef = useRef(muted); mutedRef.current = muted;
  useEffect(() => {
    const onMsg = (ev) => {
      if (ev.origin !== location.origin || ev.data?.src !== 'bba-nanosaur') return;
      if (ev.data.type === 'ready' || ev.data.type === 'started') tell({ type: 'mute', muted: mutedRef.current });
    };
    window.addEventListener('message', onMsg);
    const prevTitle = document.title; document.title = 'NANOSAUR · HALL OF DOORS';
    return () => { window.removeEventListener('message', onMsg); document.title = prevTitle; };
  }, []);
  useEffect(() => { localStorage.setItem('bba.nano.muted', muted ? '1' : '0'); tell({ type: 'mute', muted }); }, [muted]);
  const secs = Math.floor(elapsedMs / 1000);
  const host = document.querySelector('.mines') || document.body;
  return createPortal(
    <div className="m-doom m-nano" role="dialog" aria-label="Nanosaur" data-test="nano-room">
      <div className="m-doom-bar m-nano-bar">
        <button className="m-btn m-doom-exit" onClick={onExit} data-test="nano-exit">◄ BACK TO THE HALL</button>
        <span className="m-dim m-doom-clock" title="Your shift is still on the clock while you're in here">SHIFT {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')} · STILL RUNNING</span>
        <button className="m-link" onClick={() => setMuted((m) => !m)} aria-pressed={!muted} data-test="nano-mute">{muted ? '♪ OFF' : '♪ ON'}<span className="sr-only"> game sound</span></button>
      </div>
      <iframe ref={frame} className="m-doom-frame" src="/nanosaur/index.html?v=1" title="Nanosaur" allow="autoplay; fullscreen"
        onLoad={() => tell({ type: 'mute', muted: mutedRef.current })} />
    </div>,
    host,
  );
}
