import React, { useEffect, useRef, useState } from 'react';
import { goToMines } from './App.jsx';
import { money } from './util.js';

// The house host, a grizzled old desert card-room man, on the subject of empty pockets.
export const BROKE_LINES = [
  "The house has noticed your pockets are empty. Rumor has it there's acid in them hills.",
  "Partner, your wallet's quieter than the desert at high noon. The Acid Mines are hiring, and they don't check references.",
  "Can't buy in on charm alone, friend. Grab a pickaxe: the mines pay cash and only occasionally scream.",
  "You've been cleaned out like the buffet at closing time. Head down the shaft and dig yourself a fresh bankroll.",
  "No chips, no chair. Them's the rules. But there's money glowing down in the Acid Mines for anybody brave enough.",
  "Neon Bill says you're flat busted. He also says the mine shaft's open all night. Bring gloves. Maybe two pairs.",
  "Your bankroll rode off into the sunset without you. Win it back the honest way: digging in glowing dirt.",
];
export const pickLine = (rand = Math.random) => BROKE_LINES[Math.floor(rand() * BROKE_LINES.length) % BROKE_LINES.length];

const EVT = 'bba:broke';
/** Ask the shell to show the prompt. reason: 'lobby' | 'join' | 'bust'. */
export function showBroke(reason = 'lobby', detail = {}) { window.dispatchEvent(new CustomEvent(EVT, { detail: { reason, ...detail } })); }
const seenKey = (k) => `bba.broke.${k}`;
/** Show once per browser session for a given key (the lobby, or a table), until it stops being true. */
export function showBrokeOnce(key, reason, detail) {
  try { if (sessionStorage.getItem(seenKey(key))) return; sessionStorage.setItem(seenKey(key), '1'); } catch { /* private mode */ }
  showBroke(reason, detail);
}
export function clearBrokeSeen(key) { try { sessionStorage.removeItem(seenKey(key)); } catch { /* ignore */ } }

const HEADS = { lobby: 'A word from the house', join: "That seat's not free, friend", bust: 'Busted flat' };

export function BrokeHost({ me }) {
  const [state, setState] = useState(null);
  const btn = useRef(null);
  useEffect(() => {
    const on = (e) => setState({ ...e.detail, line: pickLine() });
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  useEffect(() => {
    if (!state) return undefined;
    btn.current?.focus();
    const key = (e) => { if (e.key === 'Escape') setState(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [state]);
  if (!state) return null;
  const close = () => setState(null);
  const need = state.need ?? me?.minBuyIn;
  return (
    <div className="broke-veil" onClick={close}>
      <div className="broke-card" role="dialog" aria-modal="true" aria-labelledby="broke-h" onClick={(e) => e.stopPropagation()}>
        <div className="broke-bulbs" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
        <button className="broke-x" onClick={close} aria-label="Close">×</button>
        <p className="kicker">{HEADS[state.reason] || HEADS.lobby}</p>
        <blockquote className="broke-line">“{state.line}”</blockquote>
        <p className="broke-sig">— The Host, Buffalo Bill's</p>
        {me && <p className="broke-facts small">You have <b className="num">{money(me.bankroll)}</b>{need ? <>; {state.reason === 'lobby' ? 'the cheapest seat in the house is' : 'a seat here costs'} <b className="num">{money(need)}</b></> : null}. One shift down the mine can put you back at the table.</p>}
        <div className="broke-actions">
          <button ref={btn} className="btn primary big" onClick={() => { close(); goToMines(); }}>Go to the Acid Mines <span className="arrow">→</span></button>
          <button className="btn ghost" onClick={close}>Not now</button>
        </div>
      </div>
    </div>
  );
}
