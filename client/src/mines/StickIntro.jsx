import React, { useEffect, useRef, useState } from 'react';

const SEEN_KEY = 'bba.stick-intro';
export const stickIntroSeen = () => {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
};
export const markStickIntroSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ } };

const LONG = [
  { at: 0, text: 'The lantern flutters.' },
  { at: 900, text: 'Something scratches the rock, above you.' },
  { at: 2200, text: 'It is too large to be a moth.' },
  { at: 3600, title: true },
];
const SHORT = [{ at: 0, title: true }];

/**
 * A skippable pre-battle beat for the Lord Howe Island stick insect. First meeting is a few seconds
 * of flicker and scratching; later meetings jump to the title card. Tight on a phone.
 */
export default function StickIntro({ short = false, hold = false, onDone, onScratch, onFlicker }) {
  const beats = hold ? [{ at: 0, title: true }] : short ? SHORT : LONG;
  const endAt = hold ? null : short ? 1400 : 5600;
  const [text, setText] = useState('');
  const [title, setTitle] = useState(false);
  const done = useRef(false);
  const finish = (how) => {
    if (done.current) return;
    done.current = true;
    markStickIntroSeen();
    onDone?.(how);
  };

  useEffect(() => {
    const timers = [];
    onFlicker?.(true);
    onScratch?.();
    for (const beat of beats) {
      timers.push(setTimeout(() => {
        if (beat.title) { setTitle(true); setText(''); }
        else setText(beat.text);
      }, beat.at));
    }
    if (endAt != null) timers.push(setTimeout(() => finish('end'), endAt));
    return () => { timers.forEach(clearTimeout); if (!hold) onFlicker?.(false); };
  }, []);

  return (
    <div className={`m-stick-intro${hold ? ' is-hold' : ''}`} role="dialog" aria-label="A legendary insect" data-test="stick-intro">
      <div className="m-stick-flicker" aria-hidden="true" />
      {text ? <p className="m-stick-line" data-test="stick-intro-line">{text}</p> : null}
      {title ? (
        <div className="m-stick-title" data-test="stick-intro-title">
          <p className="m-stick-kicker">✦ Legendary</p>
          <h2>Lord Howe Island Stick Insect</h2>
          <p className="m-stick-sci"><i>Dryococelus australis</i> · the tree lobster</p>
        </div>
      ) : null}
      <button type="button" className="m-stick-skip" data-test="stick-intro-skip" onClick={() => finish('skip')}>Skip</button>
    </div>
  );
}
