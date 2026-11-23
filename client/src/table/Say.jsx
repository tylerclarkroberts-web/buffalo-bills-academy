// Shared speech bubble + composer. Used at Hold'em and SCUM tables.
// A seated player's one short message stays up until their next turn starts.
import React, { useEffect, useRef, useState } from 'react';
import { isPracticePhrase } from '../../../server/engine/fight.js';

export const SAY_MAX = 80;

/** A player's speech bubble over their seat. Two lines; tap to read all of it (max 80 characters). React escapes the text. */
export function SayBubble({ text, name, below, align }) {
  const [open, setOpen] = useState(false);
  return (
    // a note, not a control: the full text is in its label; tapping it just un-truncates it on screen
    <div role="note" data-test="say-bubble" className={`say-bubble ${below ? 'below' : ''} al-${align} ${open ? 'open' : ''}`} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} aria-label={`${name} says: ${text}`} title={text}>
      <span className="sb-txt" aria-hidden="true">{text}</span>
    </div>
  );
}

/** Tiny composer for your one bubble: it stays up until your next turn starts. Edit or clear any time. */
// typing the secret phrase (isPracticePhrase) opens a no-money practice fight instead of posting a bubble, when onPractice is passed
export function SayBox({ current, onClose, onSave, onPractice }) {
  const [text, setText] = useState(current);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => { const esc = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  const save = async (v) => { setBusy(true); const ok = await onSave(v); setBusy(false); if (ok) onClose(); };
  const left = SAY_MAX - Array.from(text).length;
  return (
    <form className="say-box" role="dialog" aria-label="Say something" data-test="say-box" onSubmit={(e) => { e.preventDefault(); if (onPractice && isPracticePhrase(text)) { setText(current); onPractice(); return; } save(text); }}>
      <div className="say-row">
        <input ref={ref} value={text} maxLength={SAY_MAX} onChange={(e) => setText(e.target.value)} placeholder="Say something to the table…" aria-label="Your speech bubble" enterKeyHint="send" />
        <button className="btn small primary" disabled={busy || !text.trim() || left < 0}>Say</button>
        <button type="button" className="btn small ghost say-x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="say-meta small muted">
        <span>Stays up until your next turn.</span>
        <span className={left < 10 ? 'warn' : ''}>{left}</span>
        {current && <button type="button" className="linkish" disabled={busy} onClick={() => save('')}>Clear bubble</button>}
      </div>
    </form>
  );
}
