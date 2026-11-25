// The Trading Post: offer your bugs for theirs, add cash, or just put money on a bug you want. Everything is decided
// by the server (GET /api/barn/trades): which bugs can go, what is held, what expires. Cash you offer leaves your
// bankroll when you send it and comes back if the offer is declined, cancelled or runs out.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, refreshSession } from '../api.js';
import { money } from '../util.js';
import { TRADE_LORE, loreLine } from '../../../server/engine/lore.js';
import './trades.css';

const left = (ms) => { const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3); return h ? `${h}h` : `${Math.max(1, m)}m`; };
const names = (bugs) => bugs.map((b) => b.name).join(', ');

/** One side of an offer: a row of little bugs, then the cash if any. */
function Side({ bugs, cash, Thumb }) {
  return <span className="tr-side">
    {bugs.map((b) => <span key={b.id} className="tr-bug" title={`${b.name} · Lv ${b.level}`}><Thumb bug={b} /><small>{b.name}</small></span>)}
    {cash > 0 && <b className="tr-cash num">{money(cash)}</b>}
    {!bugs.length && !cash && <small className="muted">nothing</small>}
  </span>;
}

function Offer({ t, meId, Thumb, busy, act, now }) {
  const incoming = t.to === meId, other = incoming ? t.fromName : t.toName;
  // always the proposer's side first: "Gus offers [bugs + cash] for your [bug]" / "You offer [...] for Hank's [...]"
  const lead = t.status === 'open' ? (incoming ? <><b>{other}</b> offers</> : 'You offer') : <><b>{t.word}</b> · {incoming ? `${other} offered` : `you offered ${other}`}</>;
  const tail = incoming ? 'for your' : `for ${other}'s`;
  return <li className={`tr-offer${incoming && t.status === 'open' ? ' in' : ''}${t.fresh ? ' fresh' : ''}`} data-test={t.status !== 'open' ? 'trade-history' : incoming ? 'trade-incoming' : 'trade-outgoing'}>
    <p className="tr-who small">{lead}{t.status === 'open' && <span className="muted num"> · {left(t.expiresAt - now)} left</span>}{t.reason ? <span className="muted"> · {t.reason}</span> : null}</p>
    <div className="tr-swap"><Side bugs={t.give} cash={t.money} Thumb={Thumb} /><span className="tr-for small">{tail}</span><Side bugs={t.want} cash={0} Thumb={Thumb} /></div>
    {t.status === 'open' && <div className="barn-row">
      {incoming ? <>
        <button className="btn primary small" disabled={busy} onClick={() => act('POST', `/barn/trades/${t.id}/accept`, `Done. ${t.give.length ? `${names(t.give)} ${t.give.length === 1 ? 'is' : 'are'} yours` : ''}${t.give.length && t.money ? ', and ' : ''}${t.money ? `${money(t.money)} is in your bankroll` : ''}.`)} data-test="trade-accept">Accept</button>
        <button className="btn ghost small" disabled={busy} onClick={() => act('POST', `/barn/trades/${t.id}/decline`, 'Declined.')} data-test="trade-decline">Decline</button>
      </> : <button className="btn ghost small" disabled={busy} onClick={() => act('DELETE', `/barn/trades/${t.id}`, t.money ? `Offer cancelled. ${money(t.money)} is back.` : 'Offer cancelled.')} data-test="trade-cancel">Cancel{t.money ? ` · ${money(t.money)} back` : ''}</button>}
    </div>}
  </li>;
}

/** Tap bugs in or out. Bugs that can't go right now are greyed with the reason as their title. */
function Picker({ bugs, picked, toggle, Thumb, label }) {
  return <div className="tr-pick" role="group" aria-label={label}>
    {bugs.map((b) => { const on = picked.includes(b.id); return <button key={b.id} type="button" className={`tr-chip${on ? ' on' : ''}`} disabled={!!b.why} title={b.why || `${b.name} · Lv ${b.level}`} aria-pressed={on} onClick={() => toggle(b.id)} data-test="trade-chip">
      <Thumb bug={b} /><small>{b.name}</small><span className="num">Lv {b.level}</span>
    </button>; })}
    {!bugs.length && <p className="small muted">No hatched bugs.</p>}
  </div>;
}

function Compose({ d, Thumb, busy, send, done }) {
  const [who, setWho] = useState(d.players[0]?.id || ''), [give, setGive] = useState([]), [want, setWant] = useState([]), [cash, setCash] = useState('');
  const them = d.players.find((p) => p.id === who);
  const flip = (list, set, max) => (id) => set(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);
  const amount = Number(cash) || 0, ok = (give.length || want.length) && (!amount || want.length) && amount <= (d.bankroll || 0);
  if (!d.players.length) return <p className="small muted">Nobody else has a bug to trade yet.</p>;
  return <form className="tr-new" onSubmit={(e) => { e.preventDefault(); send({ to: who, give, want, money: amount }).then((sent) => { if (sent) done(); }); }} data-test="trade-new">
    <label className="tr-with">Trade with <select value={who} onChange={(e) => { setWho(e.target.value); setWant([]); }} data-test="trade-with">{d.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <p className="tr-h small">You get</p>
    <Picker bugs={them?.bugs || []} picked={want} toggle={flip(want, setWant, d.maxSide)} Thumb={Thumb} label="Their bugs you want" />
    <p className="tr-h small">You give</p>
    <Picker bugs={d.mine} picked={give} toggle={flip(give, setGive, d.maxSide)} Thumb={Thumb} label="Your bugs you offer" />
    <div className="tr-send">
      <label className="tr-money">+ cash $<input type="number" inputMode="decimal" min="0" step="0.01" max={d.bankroll || 0} value={cash} placeholder="0" onChange={(e) => setCash(e.target.value)} data-test="trade-money" /></label>
      <button className="btn primary" type="submit" disabled={busy || !ok} data-test="trade-send">Send offer</button>
    </div>
    <p className="small muted tr-note">{amount > 0 && !want.length ? 'Pick one of their bugs to go with the money.' : amount > 0 ? `${money(amount)} is held until they answer. Back if declined or after 48h.` : 'They have 48 hours to answer.'}</p>
  </form>;
}

export default function Trades({ meId, Thumb, onChange }) {
  const [d, setD] = useState(null), [pane, setPane] = useState('inbox'), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const skew = useRef(0), lore = useMemo(() => loreLine(Math.random(), TRADE_LORE), []);
  const take = (r) => { skew.current = r.serverNow - Date.now(); setD(r); };
  const load = () => api('GET', '/barn/trades?seen=1').then(take).catch((e) => setErr(e.message));
  // the first look marks answered offers read: the Barn's Trade count follows (onChange reloads the Barn)
  useEffect(() => { load().then(() => onChange?.()); const id = setInterval(load, 8000); return () => clearInterval(id); }, []);
  const act = async (method, url, done, body) => {
    setBusy(true); setErr(''); setMsg('');
    try { take(await api(method, url, body)); setMsg(done); await refreshSession(); onChange?.(); return true; } catch (e) { setErr(e.message); return false; } finally { setBusy(false); }
  };
  if (!d) return <div className="tr" data-test="trades"><p className="small muted">{err || 'Opening the trading post…'}</p></div>;
  const now = Date.now() + skew.current, inbox = [...d.incoming, ...d.outgoing];
  const PANES = [['inbox', `Offers${inbox.length ? ` · ${inbox.length}` : ''}`], ['new', 'New offer'], ['history', 'History']];
  return <div className="tr" data-test="trades">
    <div className="barn-tabs" role="tablist" aria-label="Trading post">
      {PANES.map(([id, label]) => <button key={id} role="tab" aria-selected={pane === id} className={pane === id ? 'on' : ''} onClick={() => { setPane(id); setMsg(''); setErr(''); }} data-test={`trade-pane-${id}`}>{label}</button>)}
      <span className="tr-held small num muted">{d.held ? `${money(d.held)} held` : ''}</span>
    </div>
    {(msg || err) && <p className={`small ${err ? 'barn-warn' : 'tr-ok'}`} role={err ? 'alert' : 'status'} data-test="trade-msg">{err || msg}</p>}
    {pane === 'inbox' && (inbox.length
      ? <ul className="tr-list">{inbox.map((t) => <Offer key={t.id} t={t} meId={meId} Thumb={Thumb} busy={busy} act={act} now={now} />)}</ul>
      : <p className="small muted tr-empty">No offers. Make one: a bug for a bug, or cash for one you like.</p>)}
    {pane === 'new' && <Compose d={d} Thumb={Thumb} busy={busy} send={(body) => act('POST', '/barn/trades', body.money ? `Offer sent. ${money(body.money)} held.` : 'Offer sent.', body)} done={() => setPane('inbox')} />}
    {pane === 'history' && (d.history.length
      ? <ul className="tr-list">{d.history.map((t) => <Offer key={t.id} t={t} meId={meId} Thumb={Thumb} busy={busy} act={act} now={now} />)}</ul>
      : <p className="small muted tr-empty">Nothing has changed hands yet.</p>)}
    <p className="tr-lore small" data-test="trade-lore">{lore}</p>
  </div>;
}
