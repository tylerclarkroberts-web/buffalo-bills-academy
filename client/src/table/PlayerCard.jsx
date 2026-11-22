// Tap another player's seat at a table: their name, a way to their house and their profile.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, useSession } from '../api.js';
import { navigate } from '../App.jsx';
import { useModes } from '../modes/Modes.jsx';
import { familyHandle } from '../modes/family.js';

/** `seat(id, name)` gives the props that make a seat open the card; render `card` once anywhere in the component. */
export function usePlayerCard() {
  const { family } = useModes();
  const [open, setOpen] = useState(null);
  const seat = (id, name) => {
    if (!id) return {};
    const shown = family ? familyHandle(name) : name;
    const show = (e) => setOpen({ id, name: shown, from: e.currentTarget });
    return {
      role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog', 'aria-label': `${shown}: visit their house or see their profile`,
      onClick: show, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(e); } },
    };
  };
  return { seat, card: open && <PlayerCard key={open.id} {...open} onClose={() => setOpen(null)} /> };
}

function PlayerCard({ id, name, from, onClose }) {
  const { me } = useSession();
  const [house, setHouse] = useState(null); // null while asking
  const [at, setAt] = useState(null);
  const box = useRef(null), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    let live = true;
    api('GET', `/players/${id}/profile`).then((p) => live && setHouse(!!p.roomVisitAvailable), () => live && setHouse(false));
    return () => { live = false; };
  }, [id]);
  useEffect(() => {
    const away = (e) => { if (!box.current?.contains(e.target)) close.current(); };
    const key = (e) => { if (e.key === 'Escape') { close.current(); from.focus?.(); } };
    const gone = () => close.current();
    document.addEventListener('pointerdown', away); window.addEventListener('keydown', key); window.addEventListener('resize', gone);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key); window.removeEventListener('resize', gone); };
  }, [from]);
  // Beside the seat on the felt's side, so it never covers the action bar under the table; never off the edge of a phone.
  useLayoutEffect(() => {
    const seat = (from.closest('.seat') || from).getBoundingClientRect(), card = box.current.getBoundingClientRect(); // clear of a poker seat's name plate
    const top = seat.top + seat.height / 2 < window.innerHeight / 2 ? seat.bottom + 6 : seat.top - 6 - card.height;
    const within = (value, size, limit) => Math.max(8, Math.min(limit - size - 8, value));
    setAt({ left: within(seat.left + seat.width / 2 - card.width / 2, card.width, window.innerWidth), top: within(top, card.height, window.innerHeight) });
  }, [from, house]);
  useEffect(() => { if (at) box.current?.focus(); }, [!!at]);
  const go = (path) => { onClose(); navigate(path); };
  return createPortal(
    <div ref={box} className="player-card panel" role="dialog" aria-label={name} tabIndex={-1} style={at || { visibility: 'hidden' }} data-test="player-card">
      <b className="ell">{name}</b>
      {house === false
        ? <p className="small muted">{me?.signedIn ? 'No house to visit.' : 'Sign in to visit houses.'}</p>
        : <button className="btn small" disabled={house === null} onClick={() => go(`/rooms/${id}?from=${encodeURIComponent(window.location.pathname)}`)} data-test="player-card-visit">Visit house</button>}
      <button className="btn small ghost" onClick={() => go(`/players/${id}`)}>Profile</button>
    </div>, document.body); // a portal: seats are transformed, which would throw off position: fixed
}
