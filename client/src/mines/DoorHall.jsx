import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DoomRoom from './DoomRoom.jsx';
import NanosaurRoom from './NanosaurRoom.jsx';
import PicnicRoom from './PicnicRoom.jsx';
import { HALL_DOORS, LOCKED_LINES } from './doorHall.js';

// EL HALO is our own three.js game; its code is a separate chunk that only downloads when its door opens.
const ElHaloRoom = lazy(() => import('./elhalo/ElHaloRoom.jsx'));

// Behind the mine door (v89): a stone hall with a row of doors. Doom and Nanosaur open into their games (each game's
// files only load once its door opens) and the last door goes outside to the company picnic; the rest are locked for
// now and just rattle. Like the old Doom room, the shift keeps running on the server the whole time and nothing here
// calls the mine API (the picnic talks to its own, server/picnic.js, from its own room).
const EMBLEM = {
  hell: <path d="M12 3c-4 0-7 3-7 7 0 3 1.6 4.6 3 5.4V19h8v-3.6c1.4-.8 3-2.4 3-5.4 0-4-3-7-7-7zM9 11.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM10 19v2m2-2v2m2-2v2" />,
  jungle: <path d="M12 21c-2.5 0-4-1.6-4-3.5S10 13 12 13s4 2.6 4 4.5-1.5 3.5-4 3.5zM6.5 12.5 4 6M12 11V3m5.5 9.5L20 6" />,
  sol: <><ellipse cx="12" cy="5" rx="5" ry="1.6" /><path d="M8.6 15c0-4.2 1.4-6.8 3.4-6.8s3.4 2.6 3.4 6.8" /><ellipse cx="12" cy="15.5" rx="9.5" ry="2.8" /><path d="M5 19.5l1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5" /></>,
  vault: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /><path d="M12 4v5.5M12 14.5V20M4 12h5.5M14.5 12H20" /></>,
  neon: <><rect x="4" y="9" width="16" height="9" rx="2" /><path d="M9 9V5m-1.5 0h3M15 13.5h2M8 13.5h2M9 12.5v2" /></>,
  deep: <><circle cx="12" cy="12" r="7" /><path d="M6 13c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 2.2-1 3-.6" /></>,
  mystery: <path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 18v.5" />,
  gold: <path d="M5 17h14l-1.5-8-3.5 3-2-5-2 5-3.5-3z" />,
  sky: <path d="M7 17h10a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8 9.2 4 4 0 0 0 7 17z" />,
};

function Door({ d, onOpen, onLocked, shake }) {
  return (
    <div className={`m-hall-slot s-${d.style}${d.open ? ' is-open' : ' is-locked'}`}>
      <button className={`m-hall-door${shake ? ' shake' : ''}`} onClick={() => (d.open ? onOpen(d.id) : onLocked(d.id))}
        aria-label={d.open ? `Open the ${d.name} door` : `${d.label || d.name} door, locked. Coming soon`} aria-disabled={d.open ? undefined : 'true'}
        data-test={`hall-door-${d.id}`} data-open={d.open ? '1' : '0'}>
        <span className="m-hall-frame" aria-hidden="true">
          <span className="m-hall-sign">{d.name}</span>
          <span className="m-hall-slab">
            <span className="m-hall-panel p1" /><span className="m-hall-panel p2" />
            <svg className="m-hall-emblem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{EMBLEM[d.style]}</svg>
            <span className="m-hall-knob" />
            {!d.open && <span className="m-hall-lock"><span className="shackle" /><span className="body" /></span>}
          </span>
          <span className="m-hall-spill" />
        </span>
        <span className="m-hall-plaque">{d.open ? '▸ ENTER' : `🔒 ${d.blurb}`}</span>
      </button>
    </div>
  );
}

function ElHaloLoading() {
  return createPortal(<div className="m-doom m-elh-loading" data-test="elhalo-loading"><span>EL HALO · CARGANDO…</span></div>, document.querySelector('.mines') || document.body);
}

export default function DoorHall({ onExit, elapsedMs }) {
  const [inside, setInside] = useState(null); // null | 'doom' | 'nanosaur' | 'elhalo' | 'picnic'
  const [shaking, setShaking] = useState(null);
  const [note, setNote] = useState(null);
  const tries = useRef(0);
  const noteTimer = useRef(null);
  const insideRef = useRef(null); insideRef.current = inside;
  useEffect(() => {
    const prevTitle = document.title; document.title = 'HALL OF DOORS · ACID MINES';
    const onKey = (e) => { if (e.key === 'Escape' && !insideRef.current) { e.preventDefault(); onExit(); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.title = prevTitle; clearTimeout(noteTimer.current); };
  }, []);
  const locked = (id) => {
    const line = LOCKED_LINES[tries.current++ % LOCKED_LINES.length];
    setShaking(null); requestAnimationFrame(() => setShaking(id));
    setNote({ id, line, k: tries.current });
    clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => { setNote(null); setShaking(null); }, 2200);
  };
  const back = () => { const was = insideRef.current; setInside(null); window.focus(); requestAnimationFrame(() => document.querySelector(`[data-test=hall-door-${was}]`)?.focus?.()); };
  const secs = Math.floor(elapsedMs / 1000);
  const host = document.querySelector('.mines') || document.body;
  if (inside === 'doom') return <DoomRoom elapsedMs={elapsedMs} onExit={back} exitLabel="◄ BACK TO THE HALL" />;
  if (inside === 'nanosaur') return <NanosaurRoom elapsedMs={elapsedMs} onExit={back} />;
  if (inside === 'elhalo') return <Suspense fallback={<ElHaloLoading />}><ElHaloRoom elapsedMs={elapsedMs} onExit={back} /></Suspense>;
  if (inside === 'picnic') return <PicnicRoom elapsedMs={elapsedMs} onExit={back} />;
  return createPortal(
    <div className="m-hall" role="dialog" aria-label="Hall of doors" data-test="door-hall">
      <div className="m-doom-bar m-hall-bar">
        <button className="m-btn m-doom-exit" onClick={onExit} data-test="hall-exit">◄ BACK TO THE MINE</button>
        <span className="m-hall-title">THE HALL OF DOORS</span>
        <span className="m-dim m-doom-clock" title="Your shift is still on the clock while you're in here">SHIFT {String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>
      </div>
      <div className="m-hall-room">
        <div className="m-hall-doors" data-test="hall-doors">
          {HALL_DOORS.map((d) => <Door key={d.id} d={d} onOpen={setInside} onLocked={locked} shake={shaking === d.id} />)}
        </div>
        <div className="m-hall-floor" aria-hidden="true" />
        <p className={`m-hall-note${note ? ' on' : ''}`} role="status" aria-live="polite" data-test="hall-note" key={note?.k}>{note ? note.line : 'PICK A DOOR.'}</p>
      </div>
    </div>,
    host,
  );
}
