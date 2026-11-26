// The FIGHT moment: the bout has started on the server; both bugs slam in from their corners, the word lands, a bell
// rings and (on phones that can) the handset thumps. Then the ring takes over. Reduced motion gets the word, held still.
import React, { useEffect } from 'react';
import { sfx } from './sfx.js';
import { Portrait } from './Ring.jsx';

export const FIGHT_MS = 1150, FIGHT_STILL_MS = 600;

export default function FightFx({ you, them, reduced, Thumb, onDone }) {
  useEffect(() => {
    sfx.bell();
    try { navigator.vibrate?.(reduced ? 20 : [14, 70, 34]); } catch { /* not every phone allows it */ }
    const id = setTimeout(onDone, reduced ? FIGHT_STILL_MS : FIGHT_MS);
    return () => clearTimeout(id);
  }, []);
  return <div className={`rs-fx${reduced ? ' still' : ''}`} role="status" aria-live="assertive" data-test="fight-fx" onClick={onDone}>
    <div className="rs-fx-side you"><Portrait bug={you} reduced Thumb={Thumb} /><b>{you?.name}</b></div>
    <div className="rs-fx-word">Fight!</div>
    <div className="rs-fx-side them"><Portrait bug={them} flip reduced Thumb={Thumb} /><b>{them?.name}</b></div>
  </div>;
}
