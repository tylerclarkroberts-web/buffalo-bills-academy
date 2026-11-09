import React, { useEffect, useRef, useState } from 'react';
import { KingRat } from './slots/art.jsx';
import { Paged, Tabs, useWide } from './ui.jsx';
import { showBrokeOnce, clearBrokeSeen } from './Broke.jsx';
import { api, useSession, currentSession, signInUrl, guestSignIn, devSignIn, passwordSignIn, register } from './api.js';
import { navigate, rememberTable } from './App.jsx';
import { formatLeft, money } from './util.js';
import { Marquee, TABLE_NAMES, VENUE } from './theme.jsx';

const TURN_OPTIONS = [
  [30, '30 sec (quick)'], [60, '1 minute'], [300, '5 minutes'], [3600, '1 hour'],
  [12 * 3600, '12 hours'], [24 * 3600, '24 hours (best)'], [48 * 3600, '48 hours'],
];
const BLINDS = [[1, 2], [2, 5], [5, 10], [10, 20], [25, 50]];
const BUYINS = [100, 200, 500, 1000];

export function SignIn({ compact = false, next }) {
  const { config } = useSession();
  const [mode, setMode] = useState('in'); // in | new | guest
  const [f, setF] = useState({ username: '', password: '', email: '', name: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'guest') await guestSignIn(f.name.trim());
      else if (mode === 'new') await register({ username: f.username.trim(), password: f.password, email: f.email.trim() || undefined });
      else await passwordSignIn(f.username.trim(), f.password);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const guestOk = config.guest && !config.google;
  return (
    <form className={`signin-box ${compact ? 'compact' : ''}`} onSubmit={submit}>
      {config.google && <>
        <a className="btn google big" href={signInUrl(next)}><GoogleG /> Continue with Google</a>
        <div className="or"><span>or use a username</span></div>
      </>}
      <div className="seg auth-seg" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => { setMode('in'); setErr(''); }}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === 'new'} className={mode === 'new' ? 'on' : ''} onClick={() => { setMode('new'); setErr(''); }}>Create account</button>
        {guestOk && <button type="button" role="tab" aria-selected={mode === 'guest'} className={mode === 'guest' ? 'on' : ''} onClick={() => { setMode('guest'); setErr(''); }}>Guest</button>}
      </div>
      {mode === 'guest' ? (
        <label className="field"><span>Your name</span><input value={f.name} onChange={set('name')} maxLength={20} placeholder="e.g. Tyler" autoComplete="nickname" /></label>
      ) : <>
        <div className="auth-row">
          <label className="field"><span>{mode === 'new' ? 'Username' : 'Username or email'}</span><input value={f.username} onChange={set('username')} maxLength={mode === 'new' ? 20 : 254} autoComplete="username" autoCapitalize="none" spellCheck={false} required /></label>
          <label className="field"><span>Password</span><input type="password" value={f.password} onChange={set('password')} maxLength={128} minLength={mode === 'new' ? 8 : undefined} autoComplete={mode === 'new' ? 'new-password' : 'current-password'} required /></label>
        </div>
        {mode === 'new' && <label className="field"><span>Email (optional)</span><input type="email" value={f.email} onChange={set('email')} maxLength={254} autoComplete="email" placeholder="Lets you sign in with it too" /></label>}
      </>}
      <div className="auth-go">
        <button className="btn primary" disabled={busy || (mode === 'guest' ? !f.name.trim() : !f.username.trim() || !f.password)}>
          {mode === 'new' ? 'Create account' : mode === 'guest' ? 'Play' : 'Sign in'} <span className="arrow">→</span>
        </button>
        {mode === 'new' && <span className="tiny muted">8+ characters. A short phrase works well.</span>}
        {config.dev && <button type="button" className="btn small" onClick={() => devSignIn(f.username.trim() || 'Dev', `${(f.username.trim() || 'dev').toLowerCase()}@example.com`)}>Dev</button>}
      </div>
      {err && <div className="error" role="alert">{err}</div>}
      <p className="legal-links">By signing in you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy</a> notes.</p>
    </form>
  );
}
function GoogleG() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" /><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z" /></svg>;
}


const EMPTY_TABLES = { tables: [], loading: true, loaded: false, pending: false, error: '' };
function useTables(me, path) {
  const owner = me?.id;
  const [state, setState] = useState(EMPTY_TABLES);
  const reload = useRef(null);
  useEffect(() => {
    if (!owner) return undefined;
    let stop = false, inFlight = false;
    setState({ ...EMPTY_TABLES, owner, path });
    const load = async () => {
      if (stop || inFlight) return;
      inFlight = true;
      setState((s) => ({ ...s, pending: true }));
      try {
        const tables = await api('GET', path);
        if (!stop) setState({ owner, path, tables, loading: false, loaded: true, pending: false, error: '' });
      } catch {
        if (!stop) setState((s) => ({ ...s, loading: false, pending: false, error: 'Could not load tables. Retrying shortly.' }));
      } finally { inFlight = false; }
    };
    const resume = () => { if (!document.hidden) load(); };
    reload.current = load;
    load();
    const id = setInterval(load, 15000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      stop = true; reload.current = null; clearInterval(id);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [owner, path]);
  return { ...(owner && state.owner === owner && state.path === path ? state : EMPTY_TABLES), retry: () => reload.current?.() };
}

function useBrokeNudge(me) {
  useEffect(() => {
    if (!me) return;
    if (me.broke) showBrokeOnce('lobby', 'lobby');
    else clearBrokeSeen('lobby');
  }, [me?.id, me?.broke]);
}

function Facts({ me, open, myTurn }) {
  const items = me
    ? [[money(me.bankroll), 'Bankroll'], [String(open ?? '—'), 'Open tables'], [String(myTurn ?? '—'), 'Your turn']]
    : [['24h', 'Per turn'], ['$1,000', 'To start'], ['2–9', 'Players']];
  return <div className="mq-facts">{items.map(([b, l]) => <div key={l}><b className="num">{b}</b><span>{l}</span></div>)}</div>;
}

export default function Home({ tab: tabProp }) {
  const { me, loading } = useSession();
  const wide = useWide();
  const personalTables = useTables(me, '/my-tables');
  const { tables } = personalTables;
  const publicTables = useTables(me, '/public-tables');
  const [visibility, setVisibility] = useState('private');
  const [tableFilter, setTableFilter] = useState('open');
  const [, setAfkTick] = useState(0); // re-render after dismissing the moved-out banner
  const [err, setErr] = useState(new URLSearchParams(window.location.search).get('signin') === 'failed' ? 'Google sign-in did not finish. Please try again.' : '');
  useEffect(() => { document.title = `${VENUE.name} · Texas Hold'em with friends`; }, []);
  useBrokeNudge(me);
  const open = tables.filter((t) => t.status !== 'closed');
  const myTurn = tables.filter((t) => t.myTurn).length;
  const tab = tabProp || (me && (!personalTables.loaded || tables.length) ? 'tables' : 'new');
  const setTab = (k) => {
    navigate(`/?tab=${k}`, { replace: true });
    if (wide && k === 'new') document.getElementById('nt-name')?.focus();
  };
  const errBox = err && <div className="error" onClick={() => setErr('')} role="alert">{err}</div>;
  const out = !loading && !me;
  const hostOn = !!me && tables.some((t) => t.isHost && t.status === 'lobby');
  const afkT = me && !hostOn ? afkPick(tables) : null; // one banner at a time: the host's Start banner wins
  const hb = hostOn || afkT ? 'has-banner' : '';

  const [vs, setVs] = useState('friends'); // v38: Friends / Play bots (in the card header on wide screens)
  const [form, setForm] = useState({ name: '', maxPlayers: 6, buyIn: 200, blinds: 0, turnSeconds: 86400, maxRebuys: -1, bots: 3, friends: false, skipPreflop: false, autoCheck: false });
  const [suggest] = useState(() => [...TABLE_NAMES].sort(() => Math.random() - 0.5).slice(0, 3));
  const [creating, setCreating] = useState(false);
  const createPending = useRef(false);
  const setOpponent = (value) => {
    if (value === vs) return;
    setVs(value);
    setForm((f) => ({ ...f, turnSeconds: value === 'bots' && +f.turnSeconds === 86400 ? 300 : value === 'friends' && +f.turnSeconds === 300 ? 86400 : f.turnSeconds }));
  };
  const newTable = <NewTable setErr={setErr} vs={vs} setVs={setOpponent} inHeader={wide} visibility={visibility} setVisibility={setVisibility} form={form} setForm={setForm} suggest={suggest} busy={creating} setBusy={setCreating} pending={createPending} />;
  const startPublic = () => { setVisibility('public'); setOpponent('friends'); setTab('new'); };
  const lobby = <LobbyPanel personalTables={personalTables} publicTables={publicTables} tab={tab} setTab={setTab} wide={wide} newTable={newTable} startPublic={startPublic} tableFilter={tableFilter} setTableFilter={setTableFilter} />;
  const sign = <Marquee aside={wide ? <Facts me={me} open={personalTables.loaded ? open.length : null} myTurn={personalTables.loaded ? myTurn : null} /> : null} />;
  if (!wide) {
    return (
      <div className={`screen lobby5 narrow ${out ? 'out' : `tab-${tab}`} ${hb}`}>
        {sign}{errBox}
        {loading ? null : out ? (
          <div className="panel"><div className="panel-head"><span className="western">Pull up a chair</span></div><div className="panel-body"><SignIn compact next="/" /></div></div>
        ) : <><AfkBanner t={afkT} setErr={setErr} onHide={() => setAfkTick((x) => x + 1)} /><HostBanner tables={tables} setErr={setErr} />{lobby}</>}
      </div>
    );
  }
  return (
    <div className={`screen lobby5 wide ${out ? 'out' : ''} ${hb}`}>
      {sign}{errBox}
      {me && <AfkBanner t={afkT} setErr={setErr} onHide={() => setAfkTick((x) => x + 1)} />}{me && <HostBanner tables={tables} setErr={setErr} />}
      <div className="lb-grid">
        {out ? (
          <Card title="Pull up a chair" sub="Sign in to take a seat"><SignIn compact next="/" /></Card>
        ) : (
          lobby
        )}
        {me ? <Card title="Start a table" className="create-card" sub={<VsSwitch vs={vs} setVs={setOpponent} />}>{newTable}</Card> : <Card title="How it plays" sub="House rules"><HouseRules /></Card>}
        {me ? (
          <div className="lb-col lb-games-col">
            <div className="lb-games"><BlackjackCard /><SlotsCard /></div>
          </div>
        ) : <Card title="How to join" sub="Invite link"><p className="small muted">Got an invite link? Just open it. Buy-ins come out of your bankroll; when you leave, your chips go back in.</p></Card>}
      </div>
    </div>
  );
}

function Card({ title, sub, children, className = '' }) {
  return (
    <section className={`panel lb-card ${className}`}>
      <div className="panel-head"><span className="western">{title}</span>{sub && <span className="ph-sub">{sub}</span>}</div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** v44: the blackjack card, directly above the slots card. */
function BlackjackCard() {
  return (
    <section className="panel lb-card lb-slots lb-bj" data-test="bj-card">
      <div className="panel-head"><span className="western">Blackjack</span><span className="ph-sub">Single deck · Royal bets</span></div>
      <div className="panel-body"><BlackjackPromo bare /></div>
    </section>
  );
}
function BlackjackPromo({ bare = false }) {
  return (
    <div className={`slots-promo bj-promo ${bare ? 'bare' : ''}`} data-test={bare ? undefined : 'bj-card'}>
      <span className="bj-promo-art" aria-hidden="true"><i>A♠</i><i className="red">K♥</i></span>
      <div className="sp-txt">
        {!bare && <b className="western">Blackjack</b>}
        <span className="small sp-desc">Guntrad deals, or you do. 3:2.</span>
        <button className="btn small sp-go" onClick={() => navigate('/bj')} data-test="bj-go">Play blackjack <span className="arrow">→</span></button>
      </div>
    </div>
  );
}
/** v39/v51: slots card under blackjack on the lobby Games strip. */
function SlotsCard() {
  return (
    <section className="panel lb-card lb-slots" data-test="slots-card">
      <div className="panel-head"><span className="western">Slots</span><span className="ph-sub">Three Lil' Squatches</span></div>
      <div className="panel-body"><SlotsPromo bare /></div>
    </section>
  );
}
function SlotsPromo({ bare = false }) {
  return (
    <div className={`slots-promo ${bare ? 'bare' : ''}`} data-test={bare ? undefined : 'slots-card'}>
      <svg viewBox="0 0 100 100" className="sp-art" aria-hidden="true"><KingRat /></svg>
      <div className="sp-txt">
        {!bare && <b className="western">Three Lil' Squatches</b>}
        <span className="small sp-desc">Tootin Weenies. Bets $1–$100.</span>
        <button className="btn small sp-go" onClick={() => navigate('/slots')} data-test="slots-go">Play the slots <span className="arrow">→</span></button>
        <span className="sp-note">Play money only</span>
      </div>
    </div>
  );
}

function HouseRules() {
  return (
    <ul className="house-rules">
      <li><b>One move at a time.</b> Everyone gets up to a day per turn, so play whenever you have a minute.</li>
      <li><b>$1,000 to start.</b> Buy-ins come out of your bankroll; cash out when you leave.</li>
      <li><b>Invite friends</b> with a link. Two to nine players.</li>
      <li><b>Play money only.</b> Nothing to buy, nothing to cash out.</li>
    </ul>
  );
}

const TURN_STATES = {
  acted: 'Waiting on this betting round', folded: 'Folded · waiting for next hand',
  'all-in': 'All-in · waiting for result', 'sitting-out': 'Sitting out',
  leaving: 'Leaving after this hand', 'next-hand': 'Joining next hand',
  'not-seated': 'Not seated', 'out-of-chips': 'Out of chips', 'between-hands': 'Between hands',
};
function TableList({ tables, loaded, loading, error, pending, retry, setTab, filter, setFilter }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const open = tables.filter((t) => t.status !== 'closed');
  const closed = tables.filter((t) => t.status === 'closed');
  const shown = filter === 'open' ? open : filter === 'closed' ? closed : tables;
  const seated = open.filter((t) => t.seated);
  const multi = seated.length >= 2 ? (
    <button className="btn small multi-btn" onClick={() => navigate(`/multi?t=${seated.slice(0, 4).map((t) => t.code).join(',')}`)}>
      ▦ Play {Math.min(4, seated.length)} tables at once{seated.filter((t) => t.myTurn).length ? ` · ${seated.filter((t) => t.myTurn).length} waiting` : ''}
    </button>
  ) : null;
  const header = <>
    <div className="seg table-filters" role="group" aria-label="Filter your tables">
      {[['open', 'Open', open.length], ['closed', 'Closed', closed.length], ['all', 'All', tables.length]].map(([value, label, count]) => (
        <button key={value} type="button" className={filter === value ? 'on' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} ({loaded ? count : '—'})</button>
      ))}
    </div>
    {filter !== 'closed' && multi}
    {error && <div className="table-load-error">
      <p role="alert">{loaded ? 'Couldn’t refresh. Showing last loaded tables.' : 'Couldn’t load your tables.'}</p>
      <button className="btn small" onClick={retry} disabled={pending}>{pending ? 'Retrying…' : 'Retry'}</button>
    </div>}
    {loaded && shown.some((t) => t.status === 'playing') && <p className="small muted turn-help">Position is for this betting round. Raises, folds, and automatic actions can change it.</p>}
  </>;
  if (!loaded) return <div className="tables-loading">{header}{loading && <p className="small muted" role="status">Loading your tables…</p>}</div>;
  return (
    <Paged items={shown} rowH={88} gap={6} className="tables personal-tables" header={header} resetKey={filter}
      empty={<div className="empty">
        <p>{filter === 'open' ? 'No open tables.' : filter === 'closed' ? 'No closed tables yet.' : "No tables yet. Start one, or open a friend's invite link."}</p>
        <div className="row wrap">
          {filter === 'open' && <button className="btn small" onClick={() => setFilter('closed')}>View closed tables</button>}
          {filter !== 'closed' && setTab && <button className="btn primary small" onClick={() => setTab('new')}>Start a table</button>}
        </div>
      </div>}
      render={(t) => {
        const turn = t.turn;
        const left = (deadline) => `${formatLeft(deadline - now)} left`;
        const status = t.status === 'closed' ? 'Closed'
          : t.myTurn ? `Your turn${t.deadline ? ` · ${left(t.deadline)}` : ''}`
          : t.status === 'lobby' ? t.isHost && readyOf(t) >= 2 ? 'Ready to start' : 'Not started'
          : turn?.state === 'pending' && turn.ahead > 0 ? turn.ahead === 1 ? 'You’re next' : `${turn.ahead} players ahead`
          : TURN_STATES[turn?.state] || 'Waiting on this betting round';
        return (
        <button className={`trow ${t.myTurn ? 'myturn' : ''}`} onClick={() => { rememberTable(t.code); navigate(`/t/${t.code}`); }}>
          <span className="t-name">{t.name}</span>
          <span className="t-meta mono">{t.bots ? '🤖 Bots · ' : ''}{t.code} · {t.players}/{t.maxPlayers}{t.isHost ? ' · host' : ''}{t.handNumber ? ` · Hand ${t.handNumber}` : ''}</span>
          <span className={`badge ${t.status === 'closed' ? 'dim' : t.myTurn ? 'hot' : t.status === 'lobby' && t.isHost && readyOf(t) >= 2 ? 'gold' : ''}`}>{status}</span>
          {!t.myTurn && turn?.actorName && <span className="t-actor"><span className="ell">{turn.actorName}</span><span>to act{turn.deadline ? ` · ${left(turn.deadline)}` : ''}</span></span>}
        </button>
      ); }} />
  );
}

function PublicTableList({ tables, loading, error, startPublic }) {
  if (loading) return <p className="small muted" role="status">Loading public tables…</p>;
  if (error) return <p className="error" role="alert">{error}</p>;
  return (
    <Paged items={tables} rowH={128} gap={6} className="tables public-tables"
      empty={<div className="empty"><p>No public tables with open seats.</p><button className="btn primary small" onClick={startPublic}>Start a public table</button></div>}
      render={(t) => (
        <button className="trow public-trow" aria-label={`View table ${t.name}`} onClick={() => { rememberTable(t.code); navigate(`/t/${t.code}`); }}>
          <span className="t-name">{t.name}</span>
          <span className="t-meta">{t.players}/{t.maxPlayers} seats · Hosted by {t.hostName}</span>
          <span className="t-meta">{money(t.buyIn)} buy-in · {t.smallBlind}/{t.bigBlind} blinds</span>
          <span className="t-meta">{turnShort(t.turnSeconds)} per turn · {t.status === 'lobby' ? 'Waiting to start' : 'In progress'}</span>
          <span className="public-table-action">View table →</span>
        </button>
      )} />
  );
}

function LobbyPanel({ personalTables, publicTables, tab, setTab, wide, newTable, startPublic, tableFilter, setTableFilter }) {
  const mine = personalTables.loaded ? personalTables.tables.length || null : '—';
  // v51: Join-by-code gone; Games tab holds blackjack + slots.
  // v51d: do NOT stack Games under Your tables — that ate the Paged height so table cards
  // clipped to a pink sliver with an empty gap (pager 1/N, no tappable rows).
  const tabKey = wide ? (tab === 'public' ? 'public' : 'tables') : tab === 'join' ? 'tables' : tab;
  return (
    <div className={`panel lobby-panel${wide ? ' lb-card' : ''}`} data-test="lobby-panel">
      <Tabs label="Lobby" value={tabKey} onChange={setTab} tabs={[['tables', 'Your tables', mine], ['public', 'Public tables'], ...(!wide ? [['new', 'Start a table'], ['games', 'Games']] : [])]} />
      <div className={`panel-body ${['tables', 'public'].includes(tabKey) ? 'tables-tab' : ''}`}>
        {tabKey === 'public' ? <PublicTableList {...publicTables} startPublic={startPublic} />
          : tabKey === 'new' ? newTable
          : tabKey === 'games' ? <div className="promo-pair" data-test="lobby-games"><BlackjackPromo /><SlotsPromo /></div>
          : <TableList {...personalTables} setTab={setTab} filter={tableFilter} setFilter={setTableFilter} />}
      </div>
    </div>
  );
}

function Seg({ value, options, onChange, label }) {
  return (
    <div className="field"><span>{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => <button type="button" key={v} role="radio" aria-checked={String(value) === String(v)} className={String(value) === String(v) ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

const REBUYS = [[-1, 'Unlimited'], [0, 'None'], [1, '1 each'], [3, '3 each']];
const turnShort = (sec) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${sec / 60} min` : `${sec / 3600}h`);

function VsSwitch({ vs, setVs }) {
  return (
    <span className="seg mini nt-vs" role="radiogroup" aria-label="Play against">
      {[['friends', 'Friends'], ['bots', '🤖 Play bots']].map(([v, l]) => <button type="button" key={v} role="radio" aria-checked={vs === v} className={vs === v ? 'on' : ''} onClick={() => setVs(v)}>{l}</button>)}
    </span>
  );
}

function NewTable({ setErr, vs, setVs, inHeader, visibility, setVisibility, form, setForm, suggest, busy, setBusy, pending }) {
  const set = (k) => (v) => setForm({ ...form, [k]: v?.target ? v.target.value : v });
  const bots = vs === 'bots';
  async function create(e) {
    e.preventDefault();
    if (pending.current) return;
    const owner = currentSession().me?.id;
    pending.current = true; setErr(''); setBusy(true);
    try {
      const [smallBlind, bigBlind] = BLINDS[form.blinds];
      const r = await api('POST', '/tables', {
        name: form.name || (bots ? 'Bot practice' : suggest[0]),
        visibility: bots ? 'private' : visibility,
        settings: { maxPlayers: bots ? +form.bots + (form.friends ? 3 : 1) : +form.maxPlayers, buyIn: +form.buyIn, smallBlind, bigBlind, turnSeconds: +form.turnSeconds, maxRebuys: bots ? -1 : +form.maxRebuys, skipPreflop: !!form.skipPreflop, autoCheck: !!form.autoCheck },
        ...(bots ? { bots: { count: +form.bots, friends: !!form.friends } } : {}),
      });
      if (currentSession().me?.id !== owner) return;
      rememberTable(r.code);
      navigate(`/t/${r.code}`);
    } catch (e2) { setErr(e2.message); } finally { pending.current = false; setBusy(false); }
  }
  const nameField = (
    <div className="field nt-namefield">
      <div className="nt-label">
        <label htmlFor="nt-name">Table name</label>
        {!inHeader && <VsSwitch vs={vs} setVs={setVs} />}
      </div>
      <input id="nt-name" value={form.name} onChange={set('name')} placeholder={bots ? 'Bot practice' : suggest[0]} maxLength={40} />
    </div>
  );
  const speedField = ( // v42: two speed-ups, both off unless the host ticks them
    <fieldset className="field nt-speed" data-test="nt-speed"><legend>Speed-ups</legend>
      <label className="nt-check"><input type="checkbox" data-test="nt-skip" checked={form.skipPreflop} onChange={(e) => setForm({ ...form, skipPreflop: e.target.checked })} /> Skip first betting round <small>(blinds go in, deal starts at the flop)</small></label>
      <label className="nt-check"><input type="checkbox" data-test="nt-autocheck" checked={form.autoCheck} onChange={(e) => setForm({ ...form, autoCheck: e.target.checked })} /> Auto-check <small>("Check if free" starts ticked each hand)</small></label>
    </fieldset>
  );
  const turnField = (
    <label className="field"><span>Per turn</span>
      <select value={form.turnSeconds} onChange={set('turnSeconds')}>{TURN_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </label>
  );
  return (
    <form onSubmit={create} className={`newtable${bots ? ' vs-bots' : ''}`}>
      <div className="nt-body">
        {nameField}
        {bots ? <>
          <Seg label="Bots · always strong" value={form.bots} onChange={set('bots')} options={[1, 2, 3, 4, 5].map((n) => [n, String(n)])} />
          <Seg label="Practice stack (not your bankroll)" value={form.buyIn} onChange={set('buyIn')} options={BUYINS.map((v) => [v, `$${v.toLocaleString()}`])} />
        </> : <>
          <div className="pills">{suggest.map((n) => <button type="button" key={n} className={`pill ${form.name === n ? 'on' : ''}`} onClick={() => setForm({ ...form, name: n })}>{n}</button>)}</div>
          <div className="nt-visibility">
            <Seg label="Visibility" value={visibility} onChange={setVisibility} options={[['private', 'Private · invite link'], ['public', 'Public']]} />
            <p className="small muted">{visibility === 'public' ? 'Listed in Public tables. Other players can join.' : 'Unlisted. Anyone with the invite link can join.'}</p>
          </div>
          <Seg label="Buy-in" value={form.buyIn} onChange={set('buyIn')} options={BUYINS.map((v) => [v, `$${v.toLocaleString()}`])} />
        </>}
        <Seg label="Blinds" value={form.blinds} onChange={set('blinds')} options={BLINDS.map(([s, b], i) => [i, `${s}/${b}`])} />
        {bots ? <>
          <div className="form-grid">
            {turnField}
            <label className="field nt-friends"><span>Friends</span>
              <span className="nt-check"><input type="checkbox" checked={form.friends} onChange={(e) => setForm({ ...form, friends: e.target.checked })} /> Let friends join too</span>
            </label>
          </div>
        </> : <>
          <div className="form-grid">
            <label className="field"><span>Seats</span>
              <select value={form.maxPlayers} onChange={set('maxPlayers')}>{[2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n} players</option>)}</select>
            </label>
            {turnField}
          </div>
          <Seg label="Rebuys" value={form.maxRebuys} onChange={set('maxRebuys')} options={REBUYS} />
        </>}
        {speedField}
      </div>
      <div className="nt-foot">
        <button className="btn primary nt-create" disabled={busy}>{busy ? 'Shuffling…' : bots ? 'Deal the bots in' : 'Open the table'} <span className="arrow">→</span></button>
      </div>
    </form>
  );
}

// ---- moved out for missing turns: a one-time heads-up with a Rejoin button (dismissed per table, per move) ----
const afkKey = (t) => `afk:${t.code}:${t.afkMoved.at}`;
const afkSeen = (t) => { try { return !!localStorage.getItem(afkKey(t)); } catch { return false; } };
export const afkPick = (tables) => tables.filter((x) => x.afkMoved && !afkSeen(x)).sort((a, b) => b.afkMoved.at - a.afkMoved.at)[0] || null;
function AfkBanner({ t, onHide, setErr }) {
  if (!t) return null;
  const open = () => { rememberTable(t.code); navigate(`/t/${t.code}`); };
  const rejoin = async () => { // take a seat straight away (same buy-in as Deal me in); if that fails, open the table
    try { await api('POST', `/tables/${t.code}/join`); } catch (e) { setErr?.(e.message); }
    open();
  };
  const hide = () => { try { localStorage.setItem(afkKey(t), '1'); } catch { /* private mode */ } onHide(); };
  return (
    <div className="host-banner wait afk-banner" role="status">
      <button type="button" className="hb-text" onClick={open} title="Open the table">
        <b>Your seat opened up.</b>
        <span>You were moved out of <i className="hb-name">{t.name}</i> after {t.afkMoved.turns} missed turns. Rejoin any time.</span>
      </button>
      <button type="button" className="btn hb-share" onClick={rejoin}>Rejoin</button>
      <button type="button" className="btn afk-x" onClick={hide} aria-label="Dismiss">✕</button>
    </div>
  );
}

// ---- the host's nudge: a table you opened is still waiting for you to deal ----
const readyOf = (t) => t.ready ?? t.players;
function HostBanner({ tables, setErr }) {
  const waiting = tables.filter((t) => t.isHost && t.status === 'lobby')
    .sort((a, b) => readyOf(b) - readyOf(a) || b.createdAt - a.createdAt);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  if (!waiting.length) return null;
  const t = waiting[0]; const n = readyOf(t); const can = n >= 2;
  const more = waiting.length - 1;
  const open = () => { rememberTable(t.code); navigate(`/t/${t.code}`); };
  async function start() {
    setBusy(t.code); setErr('');
    try { await api('POST', `/tables/${t.code}/start`); open(); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  }
  async function copy() {
    const url = `${window.location.origin}/t/${t.code}`;
    try {
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) await navigator.share({ title: `${VENUE.name} card room`, text: `Pull up a chair at "${t.name}": ${url}`, url });
      else { await navigator.clipboard.writeText(url); setCopied(t.code); setTimeout(() => setCopied(''), 2500); }
    } catch { /* cancelled */ }
  }
  return (
    <div className={`host-banner ${can ? 'go' : 'wait'}`} role="status">
      <button type="button" className="hb-text" onClick={open} title="Open the table">
        <b>{can ? 'Your table is waiting.' : 'Your table needs players.'}</b>
        <span><i className="hb-name">{t.name}</i> · {n} seated{can ? '' : ', need 2+'}{more ? ` · +${more} more` : ''}</span>
      </button>
      {can
        ? <button type="button" className="btn primary hb-start" disabled={!!busy} onClick={start}>{busy ? 'Dealing…' : 'Start the game'} <span className="arrow">▶</span></button>
        : <button type="button" className="btn hb-share" onClick={copy}>{copied ? 'Link copied!' : 'Share the link'}</button>}
    </div>
  );
}

