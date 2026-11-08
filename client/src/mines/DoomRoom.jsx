import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Behind the mine door (v27, v27b): a side room that runs the GPL Chocolate Doom WebAssembly build with the free
// Freedoom data, straight into the first map. Everything heavy lives under /doom/ and only loads when the door
// opens (the frame starts loading at once, with a small progress bar). Closing this room removes the frame, which ends the game.
// The shift keeps running on the server the whole time: nothing here calls the mine API.
export default function DoomRoom({ onExit, elapsedMs }) {
  const frame = useRef(null);
  const [muted, setMuted] = useState(() => localStorage.getItem('bba.doom.muted') === '1');
  const [running, setRunning] = useState(false);
  const tell = (msg) => frame.current?.contentWindow?.postMessage({ src: 'bba-mine', ...msg }, location.origin);
  useEffect(() => {
    const onMsg = (ev) => {
      if (ev.origin !== location.origin || ev.data?.src !== 'bba-doom') return;
      if (ev.data.type === 'ready') tell({ type: 'mute', muted });
      if (ev.data.type === 'started') { setRunning(true); tell({ type: 'mute', muted }); }
    };
    window.addEventListener('message', onMsg);
    const prevTitle = document.title; document.title = 'BEHIND THE DOOR · ACID MINES';
    return () => { window.removeEventListener('message', onMsg); document.title = prevTitle; };
  }, []);
  useEffect(() => { localStorage.setItem('bba.doom.muted', muted ? '1' : '0'); tell({ type: 'mute', muted }); }, [muted]);
  const secs = Math.floor(elapsedMs / 1000);
  const host = document.querySelector('.mines') || document.body; // above the mine header and the CRT overlay
  return createPortal(
    <div className="m-doom" role="dialog" aria-label="Behind the door" data-test="doom-room">
      <div className="m-doom-bar">
        <button className="m-btn m-doom-exit" onClick={onExit} data-test="doom-exit">◄ EXIT TO THE MINE</button>
        <span className="m-dim m-doom-clock" title="Your shift is still on the clock while you're in here">SHIFT {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')} · STILL RUNNING</span>
        <button className="m-link" onClick={() => setMuted((m) => !m)} aria-pressed={!muted} data-test="doom-mute">{muted ? '♪ OFF' : '♪ ON'}<span className="sr-only"> game sound</span></button>
      </div>
      <iframe ref={frame} className="m-doom-frame" src="/doom/index.html?v=32" title="Freedoom (Doom engine)" allow="autoplay; fullscreen"
        onLoad={() => { tell({ type: 'mute', muted }); if (running) tell({ type: 'focus' }); }} />
    </div>,
    host,
  );
}
