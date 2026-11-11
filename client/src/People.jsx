import { voiceOn, setVoiceOn } from './table/Smoke.jsx';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, useSession, rename, signOut, changePassword, changeUsername, linkGoogleUrl, refreshSession } from './api.js';
import { navigate, goToMines } from './App.jsx';
import { SignIn } from './Home.jsx';
import { Link } from './Shell.jsx';
import { Bust } from './avatar/Bust.jsx';
import { FitDialog } from './avatar/FitEditor.jsx';
import { Paged, Tabs, useWide, useMedia } from './ui.jsx';
import { money, pct, chips } from './util.js';
import { bitEnabled, goreEnabled, setGoreEnabled, setBitEnabled } from './table/fx.js';
import { REPLAY_ON, replayEnabled, setReplayEnabled } from './table/replay.js';
import * as music from './table/music.js';

const OUTCOME = { motherlode: 'Motherlode', aliens: 'Alien skeletons', diamonds: 'Diamond well', dud: 'Mostly mud', normal: 'Shift' };
const TX = { start: 'Start', buyin: 'Buy-in', cashout: 'Cash-out', mine: 'Mines', 'invest-buy': 'Bought', 'invest-sell': 'Sold', risk_stake: 'Risk stake', risk_win: 'Risk win', risk_refund: 'Risk refund' };
const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function Profile({ id }) {
  const { me, loading } = useSession();
  const wide = useWide();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameStatus, setRenameStatus] = useState('');
  const renamePending = useRef(false), renameInput = useRef(null), renameButton = useRef(null), restoreRenameFocus = useRef(false);
  const [fitShop, setFitShop] = useState(null); // v36: the accessory fit editor (needs the shop view)
  const [name, setName] = useState('');
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get('link') ? 'account' : 'overview'));
  const self = !id || id === me?.id;
  useEffect(() => {
    if (loading) return;
    if (self && !me) return;
    api('GET', self ? '/profile' : `/players/${id}/profile`).then(setP).catch((e) => setErr(e.message));
  }, [id, me?.id, me?.bankroll, me?.avatar?.v, loading]);
  useEffect(() => { document.title = `${p?.name || 'Profile'} · Buffalo Bill's Academy`; }, [p?.name]);
  useLayoutEffect(() => {
    if (editing && !renaming) renameInput.current?.focus();
    else if (!editing && restoreRenameFocus.current) { renameButton.current?.focus(); restoreRenameFocus.current = false; }
  }, [editing, renaming, renameError]);
  function cancelRename() {
    if (renamePending.current) return;
    setRenameError(''); setName(p.name); restoreRenameFocus.current = true; setEditing(false);
  }
  async function saveName(e) {
    e.preventDefault();
    if (renamePending.current) return;
    if (!name.trim()) { setRenameError('Please enter a name.'); renameInput.current?.focus(); return; }
    renamePending.current = true; setRenaming(true); setRenameError('');
    try {
      const saved = await rename(name);
      setP((current) => ({ ...current, name: saved.name }));
      setRenameStatus('Display name saved.'); restoreRenameFocus.current = true; setEditing(false);
    } catch (error) { setRenameError(error.message); }
    finally { renamePending.current = false; setRenaming(false); }
  }

  if (!loading && self && !me) return <div className="screen center-screen"><h1 className="display h2">Sign in</h1><p className="lede">Sign in to see your bankroll, results and stats.</p><SignIn next="/profile" /></div>;
  if (err) return <div className="screen center-screen"><div className="error">{err}</div></div>;
  if (!p) return <div className="screen center-screen muted">Loading…</div>;
  const w = p.worth;
  const pk = p.poker;
  const tabs = [['overview', 'Overview'], ['games', 'Games', pk.games.length || null], ['mines', 'Mines'], ['coins', 'Coins']];
  if (p.txns) tabs.push(['money', 'Money']);
  if (self && me) tabs.push(['alerts', 'Settings'], ['account', 'Account']);
  const stats = [
    ['Net worth', money(w.total), `${money(w.bankroll)} cash · ${money(w.holdings)} coins · ${money(w.chips)} on tables${w.riskEscrow ? ` · ${money(w.riskEscrow)} Risk stakes` : ''}${w.barnEscrow ? ` · ${money(w.barnEscrow)} Barn stakes` : ''}`],
    ['Bankroll', money(w.bankroll), 'Spendable play money'],
    ['Poker, lifetime', money(pk.lifetimeNet, { sign: true }), `${pk.gamesPlayed ?? pk.games.length} game${(pk.gamesPlayed ?? pk.games.length) === 1 ? '' : 's'}`, cls(pk.lifetimeNet)],
    ['Hands played', chips(pk.handsPlayed), `${chips(pk.handsWon)} won`],
    ['Win rate', pk.handsPlayed ? pct(pk.winRate) : '—', 'Hands won ÷ played'],
    ['Biggest pot', money(pk.biggestPot), 'Largest pot you won'],
    ['Mining earnings', money(p.mining.earned), `${p.mining.shifts} shift${p.mining.shifts === 1 ? '' : 's'} · ${p.mining.jackpots} jackpot${p.mining.jackpots === 1 ? '' : 's'}`],
    ['Investing P&L', money(p.invest.pnl, { sign: true }), `${money(p.invest.realized, { sign: true })} realized`, cls(p.invest.pnl)],
  ];
  return (
    <div className="screen profile">
      <div className="pf-head">
        {self && me ? <button type="button" className="btn ghost pf-avatar" aria-label="Change avatar" onClick={() => navigate('/profile/face')}>
          <span aria-hidden="true"><Bust id={p.id} avatar={p.avatar} size={wide ? 84 : 58} /></span>
          <span>Change avatar</span>
        </button> : <Bust id={p.id} avatar={p.avatar} size={wide ? 84 : 58} />}
        <div className="pf-id">
          <p className="kicker">{self ? 'Your profile' : 'Player'} · since {new Date(p.since).toLocaleDateString([], { month: 'short', year: 'numeric' })}</p>
          {editing ? (
            <form className="pf-rename" onSubmit={saveName} aria-busy={renaming} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancelRename(); } }}>
              <div className="row wrap">
                <input ref={renameInput} value={name} onChange={(e) => { setName(e.target.value); setRenameError(''); }} maxLength={20} readOnly={renaming} aria-label="Display name" aria-invalid={!!renameError} aria-describedby={renameError ? 'rename-error' : undefined} />
                <button className="btn small light" disabled={renaming}>{renaming ? 'Saving…' : 'Save'}</button>
                <button type="button" className="btn small ghost" disabled={renaming} onClick={cancelRename}>Cancel</button>
              </div>
              {renameError && <p className="error small" id="rename-error" role="alert">{renameError}</p>}
            </form>
          ) : <h1 className="display pf-name">{p.name}</h1>}
          <p className="small ok" role="status">{renameStatus}</p>
          {self && p.email && <p className="small muted hide-s">{p.email}</p>}
        </div>
        {self && !editing && (
          <div className="pf-actions">
            <button className="btn small" onClick={() => navigate('/room')}>My Room</button>
            {me?.avatar?.wear && <button className="btn small" onClick={() => api('GET', '/shop').then(setFitShop).catch((e) => setErr(e.message))} data-test="profile-fit">Fit accessories</button>}
            <button ref={renameButton} className="btn small" onClick={() => { setName(p.name); setRenameError(''); setRenameStatus(''); setEditing(true); }}>Rename</button>
            <button className="btn small ghost" onClick={() => signOut().then(() => navigate('/'))}>Sign out</button>
          </div>
        )}
        {!self && p.roomVisitAvailable && <Link className="btn small" to={`/rooms/${p.id}`}>Visit room</Link>}
      </div>
      {fitShop && me && <FitDialog me={me} shop={fitShop} onClose={() => setFitShop(null)} onSaved={setFitShop} />}
      <Tabs label="Profile" value={tab} onChange={setTab} tabs={tabs} />
      <div className="pf-body">
        {tab === 'account' && me && <Account me={me} />}
        {tab === 'alerts' && me && <div className="pf-settings"><TableFun /><SlackAlerts me={me} /></div>}
        {tab === 'overview' && (
          <Paged items={stats} rowH={wide ? 92 : 64} gap={8} cols={wide ? 4 : 2} className={`stats ${wide ? 'grid4' : 'grid2'}`}
            render={([label, value, sub, c]) => <div className="stat"><div className="label">{label}</div><div className={`value ${c || ''}`}>{value}</div><div className="sub">{sub}</div></div>} />
        )}
        {tab === 'games' && (
          <Paged items={pk.games} rowH={48} className="dt"
            empty={<p className="muted">{self ? <>No games yet. <Link to="/?tab=new">Open a table →</Link></> : 'No public games to show.'}</p>}
            header={<div className="dt-row dt-head g"><span>Table</span><span className="hide-s">Status</span><span className="r">Hands</span><span className="r hide-s">In</span><span className="r hide-s">Out</span><span className="r">Net</span></div>}
            render={(g) => (
              <button className="dt-row g click" onClick={() => navigate(`/t/${g.code}`)}>
                <span className="ell"><b>{g.name}</b> <span className="muted mono small">{g.code}</span>{!g.economy && <span className="muted small"> · practice</span>}</span>
                <span className="muted hide-s">{g.status === 'closed' ? 'Closed' : g.status === 'lobby' ? 'Not started' : 'Playing'}</span>
                <span className="r num">{g.hands}</span><span className="r num hide-s">{chips(g.buyIn)}</span><span className="r num hide-s">{chips(g.cashOut + g.onTable)}</span>
                <span className={`r num ${cls(g.net)}`}>{g.net > 0 ? '+' : ''}{chips(g.net)}</span>
              </button>
            )} />
        )}
        {tab === 'mines' && (
          <Paged items={p.mining.history} rowH={40} className="dt"
            empty={<p className="muted">Never set foot in the mines. {self && <a href="/mines" onClick={(e) => { e.preventDefault(); goToMines(); }}>Go to the mines →</a>}</p>}
            render={(h) => <div className="dt-row m"><span>{OUTCOME[h.outcome]}</span><span className="muted small">{when(h.t)}</span><span className={`r num ${h.amount >= 10000 ? 'amber' : ''}`}>{money(h.amount)}</span></div>} />
        )}
        {tab === 'coins' && (
          <div className="coins-pane">
            <Paged items={Object.entries(p.invest.holdings)} rowH={44} className="dt"
              header={<div className="dt-row c dt-head"><span>Coin</span><span className="r">Units</span><span className="r">Cost</span><span className="r">Value</span><span className="r">P&L</span></div>}
              render={([sym, h]) => <div className="dt-row c"><span><b>{sym}</b></span><span className="r num">{h.units ? Number(h.units.toPrecision(6)).toLocaleString() : 0}</span><span className="r num">{money(h.cost)}</span><span className="r num">{money(h.value)}</span><span className={`r num ${cls(h.unrealized)}`}>{h.units ? money(h.unrealized, { sign: true }) : '—'}</span></div>} />
            {self && <p className="small"><Link to="/invest">Trade →</Link></p>}
          </div>
        )}
        {tab === 'money' && p.txns && (
          <Paged items={p.txns} rowH={44} className="dt"
            header={<div className="dt-row t dt-head"><span>When</span><span>What</span><span className="r">Amount</span><span className="r">Balance</span></div>}
            render={(t) => <div className="dt-row t"><span className="muted small mono">{when(t.t)}</span><span className="ell">{TX[t.type] || t.type} <span className="muted small">{t.note}</span></span><span className={`r num ${cls(t.amount)}`}>{money(t.amount, { sign: true })}</span><span className="r num">{money(t.balance)}</span></div>} />
        )}
      </div>
    </div>
  );
}

const EARNING_SOURCES = [['mining', 'Mines'], ['poker', 'Poker'], ['blackjack', 'Blackjack'], ['slots', 'Slots'], ['investing', 'Investing']];
const BOARD_METRICS = [['wealth', 'Net worth'], ['earnings', 'Recorded earnings'], ...EARNING_SOURCES];

export function Leaderboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState('wealth');
  const [direction, setDirection] = useState('desc');
  const [sources, setSources] = useState(false);
  const [retry, setRetry] = useState(0);
  const wide = useWide();
  const shortLand = useMedia('(orientation: landscape) and (max-height: 520px) and (min-width: 600px)');
  useEffect(() => {
    document.title = "Leaderboard · Buffalo Bill's Academy";
    let current = true;
    setD(null); setErr('');
    api('GET', `/leaderboard?sort=${sort}&direction=${direction}`)
      .then((data) => { if (current) setD(data); })
      .catch((e) => { if (current) setErr(e.message); });
    return () => { current = false; };
  }, [sort, direction, retry]);
  return (
    <div className="screen leaderboard">
      <div className="page-head">
        <h1 className="display h2">Leader<span className="script neon-pink">board</span></h1>
      </div>
      <div className="board-controls">
        <label className="field"><span>Rank by</span><select value={sort} onChange={(e) => setSort(e.target.value)}>{BOARD_METRICS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="field"><span>Order</span><select value={direction} onChange={(e) => setDirection(e.target.value)}><option value="desc">Highest first</option><option value="asc">Lowest first</option></select></label>
        <label className="board-sources-toggle"><input type="checkbox" checked={sources} onChange={(e) => setSources(e.target.checked)} />Show sources</label>
        <details className="board-help">
          <summary>What counts?</summary>
          <div>
            <p>Net worth is cash, coins, poker chips and unsettled Risk and barn stakes.</p>
            <p>Recorded earnings add these five sources. Bets and buy-ins are deducted; losses count too.</p>
            <p>Mines: completed shifts. Poker: bankroll-backed table net, including chips still in play and fight stakes paid into pots. Blackjack: cashed-out sessions, including playing the house. Slots: payouts minus bets. Investing: profit or loss on sold coins.</p>
            <p>Starting money, gifts, Foreman bonuses, direct Guntrad payments, other bets and shop spending are excluded. Active blackjack sessions count after cash-out.</p>
          </div>
        </details>
      </div>
      {err ? <div className="row wrap"><p className="error" role="alert">{err}</p><button className="btn small" onClick={() => setRetry((n) => n + 1)}>Retry</button></div> : !d ? <p className="muted" role="status">Loading…</p> : (
        <Paged items={d.rows} rowH={sources ? (wide || shortLand ? 108 : 150) : (wide || shortLand ? 62 : 74)} gap={4} className={`board-list ${sources ? 'with-sources' : ''}`} resetKey={`${sort}:${direction}:${sources}`}
          empty={<p className="muted">Nobody has played yet.</p>}
          render={(r, i) => {
            const value = sort === 'wealth' ? r.total : r.earnings[sort === 'earnings' ? 'total' : sort];
            return <button className={`brow ${r.id === d.me ? 'me' : ''}`} onClick={() => navigate(r.id === d.me ? '/profile' : `/players/${r.id}`)}>
              <span className="rank">{String(i + 1).padStart(2, '0')}</span>
              <Bust id={r.id} avatar={r.avatar} size={wide ? 44 : 32} still={!wide} />
              <span className="who-cell"><span className="nm">{r.name}</span><span className="brk">{sort === 'wealth' ? `${money(r.bankroll)} cash · ${money(r.holdings)} coins${r.chips ? ` · ${money(r.chips)} chips` : ''}` : `${money(r.total)} net worth`}</span></span>
              <span className={`worth ${sort === 'wealth' ? '' : cls(value)}`}>{money(value, { sign: sort !== 'wealth' })}</span>
              {sources && <span className="board-sources">{EARNING_SOURCES.map(([key, label]) => <span key={key}><span>{label}</span><b className={cls(r.earnings[key])}>{money(r.earnings[key], { sign: true })}</b></span>)}</span>}
            </button>;
          }} />
      )}
    </div>
  );
}


/** Login handle (@username). Separate from display name. Google sign-in stays on Google; password login uses the new handle. */
function UsernameHandle({ me }) {
  const [u, setU] = useState(me.username || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setU(me.username || ''); }, [me.username]);
  const dirty = u.trim().toLowerCase() !== (me.username || '');
  const run = async (fn, done) => {
    setErr(''); setMsg(''); setBusy(true);
    try { await fn(); setMsg(done); } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };
  const save = (e) => { e?.preventDefault?.(); run(() => changeUsername(u), 'Handle saved.'); };
  // Tables show the display name. It follows the handle until you pick a different one; after that, offer to match them.
  const differs = !!me.username && me.name.trim().toLowerCase() !== me.username;
  return (
    <form className="account handle-card" data-test="settings-username" onSubmit={save}>
      <h2 className="display sl-title">Username handle</h2>
      <p className="small muted">3–20 characters: letters, numbers, dots, dashes or underscores. This is how you sign in with a password; Google sign-in is unchanged.</p>
      <label className="field"><span>Handle</span>
        <input value={u} onChange={(e) => setU(e.target.value)} maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          autoComplete="username" placeholder="yourhandle" data-test="settings-username-input" aria-label="Username handle" />
      </label>
      <div className="row gap">
        <button className="btn small light" disabled={busy || !u.trim() || !dirty} data-test="settings-username-save">{busy ? 'Saving…' : 'Save handle'}</button>
        {msg && <span className="small ok" role="status" data-test="settings-username-ok">{msg}</span>}
        {err && <span className="error small" role="alert">{err}</span>}
      </div>
      <p className="small muted handle-shown" data-test="settings-shown-as">
        At tables you appear as <b>{me.name}</b>.{' '}
        {differs
          ? <button type="button" className="linkish" disabled={busy} onClick={() => run(() => rename(me.username), 'Table name updated.')} data-test="settings-use-handle">Use {me.username} instead</button>
          : me.username ? 'Changing your handle changes this name too.' : null}
      </p>
    </form>
  );
}

function Account({ me }) {
  const { config } = useSession();
  const linkMsg = { ok: 'Google is linked. You can now sign in either way.', taken: 'That Google account already has its own player here, so it was not linked.', failed: 'Linking did not finish. Try again.' }[new URLSearchParams(window.location.search).get('link')];
  const [cur, setCur] = useState(''); const [nxt, setNxt] = useState('');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  return (
    <div className="account pf-account">
      {linkMsg && <p className="notice">{linkMsg}</p>}
      <UsernameHandle me={me} />
      <div className="acct-rows">
        <div className="acct-row"><span className="label">Google</span>
          {me.googleLinked ? <b>Linked{me.email ? ` · ${me.email}` : ''}</b>
            : me.hasPassword && config.google ? <a className="btn small" href={linkGoogleUrl()}>Link Google</a> : <span className="muted">Not linked</span>}
        </div>
      </div>
      {me.hasPassword && (
        <form id="acct-pw-form" className="acct-pw" onSubmit={async (e) => { e.preventDefault(); setErr(''); setMsg(''); try { await changePassword(cur, nxt); setCur(''); setNxt(''); setMsg('Password changed.'); } catch (e2) { setErr(e2.message); } }}>
          <label className="field"><span>Current password</span><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required /></label>
          <label className="field"><span>New password</span><input type="password" value={nxt} onChange={(e) => setNxt(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
          {msg && <span className="small ok">{msg}</span>}{err && <span className="error small">{err}</span>}
        </form>
      )}
      {/* one row for both, so neither falls below the fold on a short phone */}
      <div className="acct-foot">
        {me.hasPassword && <button form="acct-pw-form" className="btn small light">Change password</button>}
        <DeleteAccount me={me} />
      </div>
    </div>
  );
}

function DeleteAccount({ me }) {
  const [open, setOpen] = useState(false); const [pw, setPw] = useState(''); const [word, setWord] = useState(''); const [err, setErr] = useState('');
  if (!open) return <button className="btn small ghost acct-del-open" onClick={() => setOpen(true)}>Delete my account…</button>;
  return (
    <form className="acct-del" onSubmit={async (e) => {
      e.preventDefault(); setErr('');
      try { await api('DELETE', '/me', { confirm: word.trim().toUpperCase(), password: pw }); await signOut(); window.location.assign('/'); } catch (e2) { setErr(e2.message); }
    }}>
      <p className="small">This removes your player, bankroll and avatar for good. Leave your tables first. Accounts with Risk link or bet history require operator-assisted anonymization to retain their ledger. Type <b>DELETE</b> to confirm.</p>
      <label className="field"><span>Type DELETE</span><input value={word} onChange={(e) => setWord(e.target.value)} autoCapitalize="characters" required /></label>
      {me.hasPassword && <label className="field"><span>Password</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>}
      <button className="btn small danger" disabled={word.trim().toUpperCase() !== 'DELETE'}>Delete account</button>
      <button type="button" className="btn small ghost" onClick={() => setOpen(false)}>Cancel</button>
      {err && <span className="error small">{err}</span>}
    </form>
  );
}

/** Table fun: the all-in "busted" animation and the saloon piano. Saved on this device. */
function TableFun() {
  const [bit, setBit] = useState(bitEnabled);
  const [rpl, setRpl] = useState(replayEnabled);
  const [gore, setGore] = useState(goreEnabled);
  const [m, setM] = useState(music.state);
  useEffect(() => music.subscribe(setM), []);
  const [pr, setPr] = useState(null); // gags allowed? (server-side opt-out; v40: only here, no longer in the General Store)
  const [sm, setSm] = useState(null); // v37: show tobacco moments (server-side, default on)
  const [vo, setVo] = useState(voiceOn);
  useEffect(() => { api('GET', '/shop').then((v) => { setPr(!v.noGags); setSm(!v.noSmoke); }).catch(() => {}); }, []);
  return (
    <div className="account fun-card">
      <h2 className="display sl-title">At the table</h2>
      {REPLAY_ON && <label className="fun-row"><input type="checkbox" data-test="settings-replay" checked={rpl} onChange={(e) => { setReplayEnabled(e.target.checked); setRpl(e.target.checked); }} /><span><b>Table replay</b> <span className="muted small hide-s">Catch up on missed actions, smokes, gags and conversation</span></span></label>}
      <label className="fun-row"><input type="checkbox" checked={bit} onChange={(e) => { setBitEnabled(e.target.checked); setBit(e.target.checked); }} /><span><b>All-in bust animation</b> <span className="muted small hide-s">When someone shoves and loses, the table gives them a cartoon send-off.</span></span></label>
      <label className="fun-row"><input type="checkbox" data-test="gore" checked={gore} onChange={(e) => { setGoreEnabled(e.target.checked); setGore(e.target.checked); }} /><span><b>Fight gore</b> <span className="muted small">Cartoon blood and Guntrad's finishing moves. Off: a plain knock-out.</span></span></label>
      <label className="fun-row"><input type="checkbox" checked={m.on} onChange={(e) => music.setOn(e.target.checked)} /><span><b>Saloon piano music</b> <span className="muted small">{Math.round(m.vol * 100)}% · change it from the speaker on any table</span></span></label>
      {pr !== null && <label className="fun-row"><input type="checkbox" data-test="settings-gags" checked={pr} onChange={(e) => { const on = e.target.checked; setPr(on); api('POST', '/me/gags', { optOut: !on }).catch(() => setPr(!on)); }} /><span><b>Allow Gags?</b> <span className="muted small">Squirt guns, pies, confetti and dry noodles from the General Store, plus table spectacles like fireworks and stampedes. Harmless, and they never show your cards.</span></span></label>}
      {sm !== null && <label className="fun-row"><input type="checkbox" data-test="settings-smoke" checked={sm} onChange={(e) => { const on = e.target.checked; setSm(on); api('POST', '/me/smoke', { optOut: !on }).catch(() => setSm(!on)); }} /><span><b>Show Smoke Shop moments at tables</b> <span className="muted small">When a player lights up (cartoon only), Guntrad comes over with the lighter. Off: you won't see them.</span></span></label>}
      <label className="fun-row"><input type="checkbox" data-test="settings-voice" checked={vo} onChange={(e) => { setVoiceOn(e.target.checked); setVo(e.target.checked); }} /><span><b>Guntrad's voice</b> <span className="muted small">His "hell yeah" and the lighter sound.</span></span></label>
    </div>
  );
}

/**
 * Slack turn alerts: Guntrad the Pit Boss (the Slack bot) DMs you when it's your turn (poker, and since v48 blackjack), and once more ~4 hours before your clock runs out.
 * You're matched to Slack by your account email automatically; "Slack email" overrides it; the switch turns alerts off.
 */
function SlackAlerts({ me }) {
  const [st, setSt] = useState(me.slack || { enabled: false });
  const [email, setEmail] = useState(me.slack?.override || '');
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { if (me.slack?.enabled && me.slack?.on && me.slack?.email && me.slack?.matched == null) api('GET', '/me/slack?check=1').then(setSt).catch(() => {}); }, []);
  const run = async (fn, ok) => { setBusy(true); setErr(''); setMsg(''); try { const r = await fn(); if (r && 'enabled' in r) setSt(r); await refreshSession(); setMsg(ok); setEdit(false); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const status = !st.email ? 'Add the email you use in Slack to get alerts.'
    : st.matched === true ? `Matched · ${st.email}`
    : st.matched === false ? `No Slack account for ${st.email}`
    : `Will match ${st.email} on your next turn`;
  return (
    <div className="account slack-card">
      <div className="sl-head">
        <span className="sl-mark" aria-hidden="true">#</span>
        <div><h2 className="display sl-title">Slack alerts</h2><p className="small muted">Guntrad the Pit Boss messages you on Slack when it's your turn at poker or blackjack (your bet, your hand, an insurance call), with a link to the table. One reminder if about 4 hours are left, and a nudge if your table is waiting for you to start it. Never your cards.</p></div>
      </div>
      {!st.enabled ? <p className="muted small">Slack alerts aren't switched on yet. Check back soon.</p> : (
        <>
          <label className="fun-row sl-on"><input type="checkbox" checked={!!st.on} disabled={busy} onChange={(e) => { const on = e.target.checked; run(() => api('POST', '/me/slack/prefs', { on }), on ? 'Slack alerts on.' : 'Slack alerts off. Guntrad won\'t message you.'); }} />
            <span><b>Turn alerts on Slack</b> <span className="muted small">{st.on ? (st.source === 'manual' ? 'using your Slack email' : st.email ? 'using your account email' : '') : 'off'}</span></span></label>
          {st.on && !(edit || !st.email || st.matched === false) && <div className="acct-row sl-status"><span className="label">Slack</span><b className="ell">{status}</b></div>}
          {st.on && (edit || !st.email || st.matched === false ? (
            <form className="sl-form" onSubmit={(e) => { e.preventDefault(); run(() => api('POST', '/me/slack', { email }), 'Saved. Guntrad just sent you a hello on Slack.'); }}>
              <label className="field"><span className="ell">{st.matched === false && !edit ? `No Slack match for ${st.email}. Slack email?` : `Email you use in Slack${st.accountEmail ? ' (if different)' : ''}`}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required maxLength={200} /></label>
              <button className="btn small primary" disabled={busy}>{busy ? 'Checking…' : 'Save'}</button>
            </form>
          ) : (
            <div className="row sl-btns">
              {st.matched && <button className="btn small" disabled={busy} onClick={() => run(() => api('POST', '/me/slack/test'), 'Sent. Check your Slack messages from Guntrad.')}>Send test</button>}
              <button className="btn small ghost" disabled={busy} onClick={() => { setEmail(st.override || ''); setEdit(true); }}>Different Slack email</button>
              {st.source === 'manual' && st.accountEmail && <button className="btn small ghost" disabled={busy} onClick={() => run(() => api('DELETE', '/me/slack'), 'Back to your account email.')}>Use account email</button>}
            </div>
          ))}
        </>
      )}
      {msg && <p className="small ok" role="status">{msg}</p>}{err && <p className="error small" role="alert">{err}</p>}
    </div>
  );
}
