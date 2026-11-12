// A player's hatched Barn bug, hanging out at their Hold'em or blackjack seat.
// Cool idle (tiny shades, a slow bob and nod). Every 20–45s it climbs to the
// neck for a short massage, unless motion is reduced or the table is busy
// with the viewer's action or a reveal. CSS-only motion; the sprite is painted once.
import React, { useEffect, useRef, useState } from 'react';
import { BY_ID } from '../../../server/engine/creatures.js';
import { spriteCanvas } from '../barn/sprite.js';
import {
  MASSAGE_ANIM_MS, MASSAGE_RETRY_MS, canStartMassage, initialMassageDelay,
  nextMassageDelay, showTableBug,
} from './tableBug.js';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useBugSprite(bug) {
  const [url, setUrl] = useState(null);
  const styleKey = bug?.style ? JSON.stringify(bug.style) : '';
  useEffect(() => {
    if (!bug?.species) { setUrl(null); return undefined; }
    const rec = BY_ID[bug.species];
    if (!rec) { setUrl(null); return undefined; }
    let gone = false, revoke = null;
    const canvas = spriteCanvas(rec, bug.style || null, bug.level);
    const apply = (next) => { if (!gone) setUrl(next); };
    if (typeof canvas.convertToBlob === 'function') {
      canvas.convertToBlob().then((blob) => {
        const next = URL.createObjectURL(blob);
        revoke = next;
        apply(next);
      }).catch(() => apply(null));
    } else if (typeof canvas.toDataURL === 'function') {
      apply(canvas.toDataURL());
    } else apply(null);
    return () => { gone = true; if (revoke) URL.revokeObjectURL(revoke); };
  }, [bug?.species, bug?.level, styleKey]);
  return url;
}

/** Live massage timer. `pose` of 'idle' or 'massage' freezes the pose (tests and screenshots). */
export function useTableBugMassage({
  bug, playerId, reduced, myAction = false, busy = false, pose,
} = {}) {
  const reduce = reduced ?? prefersReducedMotion();
  const [massaging, setMassaging] = useState(pose === 'massage');
  const hold = useRef({ myAction, busy, reduced: reduce });
  hold.current = { myAction, busy, reduced: reduce };

  useEffect(() => {
    if (pose === 'massage') { setMassaging(true); return undefined; }
    if (pose === 'idle') { setMassaging(false); return undefined; }
    if (!showTableBug(bug) || reduce) { setMassaging(false); return undefined; }
    let wait, done;
    const arm = (ms) => { clearTimeout(wait); wait = setTimeout(tick, ms); };
    const tick = () => {
      const { myAction: act, busy: held, reduced: calm } = hold.current;
      if (!canStartMassage({ reduced: calm, myAction: act, busy: held })) {
        arm(MASSAGE_RETRY_MS);
        return;
      }
      setMassaging(true);
      done = setTimeout(() => {
        setMassaging(false);
        arm(nextMassageDelay());
      }, MASSAGE_ANIM_MS);
    };
    arm(initialMassageDelay(playerId));
    return () => { clearTimeout(wait); clearTimeout(done); setMassaging(false); };
  }, [bug?.species, playerId, pose, reduce]);

  useEffect(() => {
    if (pose) return;
    if (massaging && !canStartMassage({ reduced: reduce, myAction, busy })) setMassaging(false);
  }, [massaging, myAction, busy, reduce, pose]);

  return !reduce && massaging;
}

export function TableBugSprite({ bug, massaging = false, reduced = false, size = 28 }) {
  const url = useBugSprite(bug);
  if (!showTableBug(bug)) return null;
  const label = bug.name || bug.speciesName || 'Bug';
  const shades = bug.style?.bugacc?.shape !== 'shades';
  return (
    <div
      className={`tb-bug ${massaging ? 'is-massage' : 'is-idle'} ${reduced ? 'still' : ''}`}
      data-test={massaging ? 'table-bug-massage' : 'table-bug'}
      style={{ '--tb-size': `${size}px` }}
      title={`${label} is hanging out`}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" draggable="false" className="tb-sprite" /> : <span className="tb-sprite tb-ph" />}
      {shades && <span className="tb-shades" />}
    </div>
  );
}

/**
 * Wraps a seat bust and (when the player has a hatched bug) the companion.
 * The massage class lands on this wrapper so the bust can tilt without changing face art.
 */
export function SeatBuddy({
  bug, playerId, size, reduced, myAction, busy, pose, children,
}) {
  const reduce = reduced ?? prefersReducedMotion();
  const massaging = useTableBugMassage({ bug, playerId, reduced: reduce, myAction, busy, pose });
  const child = React.Children.only(children);
  const bust = React.cloneElement(child, { relaxed: !!(child.props.relaxed || massaging) });
  if (!showTableBug(bug)) return bust;
  return (
    <div className={`seat-buddy ${massaging ? 'is-massage' : ''}`} data-test="seat-buddy">
      {bust}
      <TableBugSprite bug={bug} massaging={massaging} reduced={reduce} size={size} />
    </div>
  );
}
