// The owner's back office: where people play from, where the money comes from, time in the mines, usage, and flags.
// Server-gated (/api/admin/* is 403 for everyone else); this page just shows what the API returns.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, useSession } from '../api.js';
import { navigate } from '../App.jsx';
import { Bars, Diverging, HBars, SRC_COLORS } from './charts.jsx';
import './admin.css';

const TZ = 'America/Denver';
const dtf = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const df = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
export const when = (t) => (t ? dtf.format(new Date(t)) : '—');
export const day = (t) => (t ? df.format(new Date(t)) : '—');
export function ago(t, now = Date.now()) {
  if (!t) return '—';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
export function $(n, { sign = false, cents = false } = {}) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents || Math.abs(v) < 100 ? 2 : 0 });
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}$${s}`;
}
export function dur(ms) {
  const m = Math.round((ms || 0) / 60000);
  if (m < 1) return ms ? `${Math.round(ms / 1000)}s` : '0';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.round(h / 24)}d ${h % 24}h`;
}
const Sg = ({ v, sign = true }) => <span className={`num ${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}`}>{$(v, { sign })}</span>;
const TABS = [['overview', 'Overview'], ['players', 'Players'], ['money', 'Money'], ['mines', 'Acid Mines'], ['usage', 'Usage'], ['anomalies', 'Flags']];
const SRC = { start: 'Starting bankroll', poker: 'Poker', blackjack: 'Blackjack', mines: 'Acid Mines', pvp: 'Mine PvP', fawn: 'Faun gifts', golf: 'Foff golf', slots: 'Slots', store: 'General Store', invest: 'Investing', barn: 'Barn bouts', risk: 'Risk bets', admin: 'Admin / dev', other: 'Other' };
const AREA = { poker: 'Poker', blackjack: 'Blackjack', mines: 'Acid Mines', golf: 'Foff golf', slots: 'Slots', store: 'Store', barn: 'Barn', faun: 'Faun', risk: 'Risk bets', invest: 'Invest', room: 'Bunkhouse', lobby: 'Lobby / profile' };

function useLoad(url, deps = []) {
  const [s, set] = useState({ loading: true, data: null, error: null });
  const load = useCallback(() => {
    set((x) => ({ ...x, loading: true }));
    api('GET', url).then((data) => set({ loading: false, data, error: null }), (e) => set({ loading: false, data: null, error: e }));
  }, [url]);
  useEffect(load, [load, ...deps]);
  return { ...s, reload: load };
}
function Seg({ value, onChange, opts }) {
  return <div className="ad-seg" role="tablist">{opts.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
const Kpi = ({ label, value, sub, tone }) => <div className="ad-kpi"><span className="kicker">{label}</span><b className={`num ${tone || ''}`}>{value}</b>{sub ? <small className="muted">{sub}</small> : null}</div>;
const Panel = ({ title, right, children, className = '' }) => <section className={`ad-panel ${className}`}><header><h3>{title}</h3>{right}</header>{children}</section>;

/** A sortable table. cols: [{ k, label, fmt?, val?, r?, w? }] */
function Grid({ cols, rows, onRow, initial, empty = 'Nothing yet.', rowKey = (r) => r.id, compact }) {
  const [sort, setSort] = useState(initial || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.k === sort.k); const val = c?.val || ((r) => r[sort.k]);
    return [...rows].sort((a, b) => { const x = val(a), y = val(b); const d = typeof x === 'string' || typeof y === 'string' ? String(x ?? '').localeCompare(String(y ?? '')) : (x ?? -Infinity) - (y ?? -Infinity); return sort.dir * d; });
  }, [rows, sort, cols]);
  if (!rows.length) return <p className="muted small ad-empty">{empty}</p>;
  return (
    <div className="ad-grid-wrap">
      <table className={`ad-grid ${compact ? 'compact' : ''}`}>
        <thead><tr>{cols.map((c) => <th key={c.k} className={c.r ? 'r' : ''} style={c.w ? { width: c.w } : null} aria-sort={sort?.k === c.k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
          onClick={() => setSort((s) => ({ k: c.k, dir: s?.k === c.k ? -s.dir : (c.r ? -1 : 1) }))}>{c.label}{sort?.k === c.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
        <tbody>{sorted.map((r, i) => <tr key={rowKey(r) ?? i} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? 'pick' : ''}>{cols.map((c) => <td key={c.k} className={c.r ? 'r num' : ''}>{c.fmt ? c.fmt(r[c.k], r) : r[c.k]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ Overview
function Overview({ data, pick }) {
  const o = data.overview;
  return (
    <div className="ad-tab">
      <div className="ad-kpis">
        <Kpi label="Players" value={o.players} sub={`${o.signedIn} signed in`} />
        <Kpi label="Active" value={`${o.active.today} · ${o.active.d7} · ${o.active.d30}`} sub="today · 7d · 30d" />
        <Kpi label="In circulation" value={$(o.money.circulation)} sub={`${$(o.money.bankroll)} in bankrolls`} tone="amber" />
        <Kpi label="On tables & held" value={$(o.money.chips + o.money.bjChips + o.money.bjBanks + o.money.riskEscrow + o.money.barnEscrow)} sub={`poker ${$(o.money.chips)} · BJ ${$(o.money.bjChips + o.money.bjBanks)}`} />
        <Kpi label="Money created" value={$(o.money.faucets)} sub="start + mines + faun + golf + Guntrad" tone="pos" />
        <Kpi label="Money destroyed" value={$(o.money.sinks)} sub="store + elevator fares" tone="neg" />
      </div>
      <div className="ad-cols">
        <Panel title="Net flow by source" right={<small className="muted">all time</small>}>
          <HBars rows={o.flows.filter((f) => f.source !== 'start').map((f) => ({ key: f.source, label: f.label, value: f.net, color: SRC_COLORS[f.source], sub: `${f.n}×` }))} fmt={(v) => $(v, { sign: true })} />
        </Panel>
        <Panel title="Biggest winners & losers" right={<small className="muted">net worth vs. $1,000 start</small>}>
          <div className="ad-two">
            <div><div className="ad-rank-h">Highest</div><ol className="ad-rank">{o.top.map((r) => <li key={r.id} onClick={() => pick(r.id)}><span className="ell">{r.name}</span><Sg v={r.gain} /></li>)}</ol></div>
            <div><div className="ad-rank-h">Lowest</div><ol className="ad-rank">{o.bottom.map((r) => <li key={r.id} onClick={() => pick(r.id)}><span className="ell">{r.name}</span><Sg v={r.gain} /></li>)}</ol></div>
          </div>
        </Panel>
        <Panel title="Daily active players" right={<small className="muted">14 days</small>}>
          <Bars data={o.dau.map((d) => ({ label: d.day.slice(8), value: d.n }))} height={110} every={2} />
        </Panel>
        <Panel title="Today's movers" right={<small className="muted">Denver day</small>}>
          {o.today.length ? <ol className="ad-rank">{o.today.slice(0, 8).map((r) => <li key={r.id} onClick={() => pick(r.id)}><span className="ell">{r.name}</span><Sg v={r.net} /></li>)}</ol> : <p className="muted small ad-empty">No money moved today.</p>}
        </Panel>
        <Panel title="Latest money" className="ad-wide">
          <ul className="ad-feed">{o.recent.map((x, i) => <li key={i} onClick={() => pick(x.p)}><span className="muted num">{when(x.t)}</span><span className="ell"><b>{x.name}</b> · {SRC[x.source]}: {x.sub}</span><Sg v={x.amt} /></li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Players
function Players({ data, pick, narrow }) {
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('lastSeen');
  const rows = data.players.filter((r) => !q || `${r.name} ${r.username || ''} ${r.location || ''} ${r.lastIp || ''} ${r.device || ''}`.toLowerCase().includes(q.toLowerCase()));
  const cols = [
    { k: 'name', label: 'Player', fmt: (v, r) => <span className="ad-name"><b>{v}</b><small className="muted">{r.username ? `@${r.username}` : r.kind}</small></span> },
    { k: 'bankroll', label: 'Bankroll', r: 1, fmt: (v) => $(v) },
    { k: 'gain', label: 'Net', r: 1, fmt: (v) => <Sg v={v} /> },
    { k: 'lastSeen', label: 'Last seen', r: 1, fmt: (v) => <span title={when(v)}>{ago(v)}</span> },
    { k: 'location', label: 'Last IP · location', val: (r) => r.location || '', fmt: (v, r) => r.lastIp ? <span className="ad-name"><span>{v}</span><small className="muted num">{r.lastIp}{r.isp ? ` · ${r.isp}` : ''}</small></span> : <span className="muted">not seen since tracking</span> },
    { k: 'device', label: 'Device', fmt: (v, r) => v ? <span>{v}{r.devices > 1 ? <small className="muted"> +{r.devices - 1}</small> : null}</span> : '—' },
    { k: 'visits', label: 'Visits', r: 1, fmt: (v, r) => <span title={`${r.logins} sign-ins tracked, ${r.sessions} live sessions`}>{v}</span> },
    { k: 'playMs', label: 'Playtime', r: 1, fmt: (v) => dur(v) },
    { k: 'poker', label: 'Poker', r: 1, val: (r) => r.net.poker, fmt: (v, r) => <Sg v={r.net.poker} /> },
    { k: 'bj', label: 'Blackjack', r: 1, val: (r) => r.bjNet, fmt: (v, r) => <Sg v={r.bjNet} /> },
    { k: 'mine', label: 'Mines', r: 1, val: (r) => r.mines.earned, fmt: (v, r) => <span title={`${r.mines.shifts} shifts, ${dur(r.mines.ms)}`}>{$(r.mines.earned)}</span> },
    { k: 'slots', label: 'Slots', r: 1, val: (r) => r.slotsNet, fmt: (v, r) => <Sg v={r.slotsNet} /> },
  ];
  const sortFn = { lastSeen: (a, b) => b.lastSeen - a.lastSeen, bankroll: (a, b) => b.bankroll - a.bankroll, gain: (a, b) => b.gain - a.gain, playMs: (a, b) => b.playMs - a.playMs, name: (a, b) => a.name.localeCompare(b.name) };
  return (
    <div className="ad-tab ad-fill">
      <div className="ad-toolbar">
        <input className="ad-input" type="search" placeholder="Search name, IP, city, device" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
        {narrow && <select className="ad-input" value={sortKey} onChange={(e) => setSortKey(e.target.value)} aria-label="Sort">
          <option value="lastSeen">Last seen</option><option value="bankroll">Bankroll</option><option value="gain">Net</option><option value="playMs">Playtime</option><option value="name">Name</option></select>}
        <small className="muted">{rows.length} of {data.players.length}</small>
      </div>
      {narrow ? (
        <ul className="ad-plist">{[...rows].sort(sortFn[sortKey]).map((r) => (
          <li key={r.id} onClick={() => pick(r.id)}>
            <div><b className="ell">{r.name}</b><span className="num">{$(r.bankroll)}</span></div>
            <div className="muted small"><span className="ell">{r.location || 'no IP yet'}{r.device ? ` · ${r.device}` : ''}</span><span>{ago(r.lastSeen)}</span></div>
            <div className="small ad-pnets"><span>Poker <Sg v={r.net.poker} /></span><span>BJ <Sg v={r.bjNet} /></span><span>Mines {$(r.mines.earned)}</span><span>{dur(r.playMs)}</span></div>
          </li>))}</ul>
      ) : <Grid cols={cols} rows={rows} onRow={(r) => pick(r.id)} initial={{ k: 'lastSeen', dir: -1 }} />}
    </div>
  );
}

// ------------------------------------------------------------------ Money
function Ledger({ players, fixedPlayer, compact }) {
  const [f, setF] = useState({ player: fixedPlayer || '', source: '', dir: '', rec: '', q: '', from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams(Object.entries({ ...f, offset, limit: compact ? 40 : 60 }).filter(([, v]) => v !== '' && v != null)).toString();
  const { data, loading } = useLoad(`/admin/ledger?${qs}`);
  const set = (k) => (e) => { setOffset(0); setF({ ...f, [k]: e.target.value }); };
  return (
    <div className="ad-ledger">
      <div className="ad-toolbar wrap">
        {!fixedPlayer && <select className="ad-input" value={f.player} onChange={set('player')} aria-label="Player"><option value="">Everyone</option>{players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <select className="ad-input" value={f.source} onChange={set('source')} aria-label="Source"><option value="">All sources</option>{Object.entries(SRC).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="ad-input" value={f.dir} onChange={set('dir')} aria-label="Direction"><option value="">In & out</option><option value="in">Money in</option><option value="out">Money out</option></select>
        <select className="ad-input" value={f.rec} onChange={set('rec')} aria-label="Recorded or reconstructed"><option value="">Recorded + older</option><option value="recorded">Recorded live</option><option value="reconstructed">Older (reconstructed)</option></select>
        {!compact && <><input className="ad-input" type="date" value={f.from} onChange={set('from')} aria-label="From" /><input className="ad-input" type="date" value={f.to} onChange={set('to')} aria-label="To" /></>}
        <input className="ad-input grow" type="search" placeholder="Search notes" value={f.q} onChange={set('q')} aria-label="Search notes" />
      </div>
      {data && <div className="ad-toolbar small muted"><span>{data.total} entries · in <span className="pos num">{$(data.sumIn)}</span> · out <span className="neg num">{$(data.sumOut)}</span></span>
        <span className="grow" /><a className="ad-link" href={`/api/admin/ledger.csv?${qs}`}>CSV</a>
        <button className="ad-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - data.limit))}>‹</button>
        <span className="num">{data.total ? offset + 1 : 0}–{Math.min(data.total, offset + data.limit)}</span>
        <button className="ad-btn" disabled={offset + data.limit >= data.total} onClick={() => setOffset(offset + data.limit)}>›</button></div>}
      {loading && !data ? <p className="muted small ad-empty">Loading…</p> : data && (
        <ul className="ad-feed ad-ledger-rows">{data.rows.map((x, i) => (
          <li key={i} title={x.note}><span className="muted num">{when(x.t)}</span>
            <span className="ell">{!fixedPlayer && <b>{x.name} · </b>}<i className="ad-dot" style={{ background: SRC_COLORS[x.source] }} />{SRC[x.source]}: {x.sub}{x.r ? <small className="muted" title="Reconstructed from the player's own transaction history"> ~</small> : null}<small className="muted"> {x.note}</small></span>
            <span className="r"><Sg v={x.amt} /><small className="muted num"> {x.bal != null ? $(x.bal) : ''}</small></span></li>))}</ul>
      )}
    </div>
  );
}
function Money({ data, pick }) {
  const [sub, setSub] = useState('sources');
  const m = data.money;
  const srcKeys = Object.keys(SRC).filter((k) => k !== 'start' && m.sources.some((s) => s.source === k));
  return (
    <div className="ad-tab ad-fill">
      <Seg value={sub} onChange={setSub} opts={[['sources', 'Sources'], ['players', 'By player'], ['daily', 'Daily'], ['bj', 'Blackjack'], ['ledger', 'Ledger']]} />
      {sub === 'sources' && <div className="ad-cards">{m.sources.map((s) => (
        <Panel key={s.source} title={<><i className="ad-dot" style={{ background: SRC_COLORS[s.source] }} />{s.label}</>} right={<Sg v={s.net} />}>
          <div className="small muted ad-inout">in <span className="pos num">{$(s.in)}</span> · out <span className="neg num">{$(s.out)}</span> · {s.n} moves</div>
          <ul className="ad-subs">{s.subs.map((x) => <li key={x.sub}><span className="ell">{x.sub} <small className="muted">{x.n}×</small></span><Sg v={x.net} /></li>)}</ul>
        </Panel>))}</div>}
      {sub === 'players' && <Grid compact rows={m.matrix} onRow={(r) => pick(r.id)} initial={{ k: 'total', dir: -1 }}
        cols={[{ k: 'name', label: 'Player', fmt: (v) => <b>{v}</b> }, ...srcKeys.map((k) => ({ k, label: SRC[k], r: 1, val: (r) => r.net[k] || 0, fmt: (v, r) => (r.net[k] ? <Sg v={r.net[k]} /> : <span className="muted">·</span>) })), { k: 'total', label: 'Total', r: 1, fmt: (v) => <Sg v={v} /> }]} />}
      {sub === 'daily' && <>
        <Panel title="Money in and out per day, by source" right={<small className="muted">30 days · Denver</small>}>
          <Diverging days={m.daily} sources={srcKeys} fmt={(v) => $(v)} />
          <div className="ad-legend">{srcKeys.map((k) => <span key={k}><i className="ad-dot" style={{ background: SRC_COLORS[k] }} />{SRC[k]}</span>)}</div>
        </Panel>
        <Grid compact rowKey={(r) => r.day} rows={[...m.daily].reverse().filter((d) => srcKeys.some((k) => d[k]))} initial={null}
          cols={[{ k: 'day', label: 'Day' }, ...srcKeys.map((k) => ({ k, label: SRC[k], r: 1, fmt: (v) => (v ? <Sg v={v} /> : <span className="muted">·</span>) })), { k: 'net', label: 'Net', r: 1, val: (r) => srcKeys.reduce((a, k) => a + (r[k] || 0), 0), fmt: (v, r) => <Sg v={srcKeys.reduce((a, k) => a + (r[k] || 0), 0)} /> }]} />
      </>}
      {sub === 'bj' && <>
        <p className="small muted ad-note">From the blackjack table logs (older rounds where logs survive, every round from now on). Sneak bets are counted from now on; older sneak wins are shown without their stake.</p>
        <Grid compact rows={m.blackjack} onRow={(r) => pick(r.id)} initial={{ k: 'lifetime', dir: -1 }} cols={[
          { k: 'name', label: 'Player', fmt: (v) => <b>{v}</b> },
          { k: 'handsN', label: 'Hands', r: 1, fmt: (v, r) => <span title={`${r.wins} W / ${r.losses} L / ${r.pushes} P · ${r.bjs} blackjacks`}>{v}</span> },
          { k: 'hands', label: 'Main bets', r: 1, fmt: (v) => <Sg v={v} /> },
          { k: 'match', label: 'Royal Match', r: 1, fmt: (v) => <Sg v={v} /> },
          { k: 'pairs', label: 'Royal Pairs', r: 1, fmt: (v) => <Sg v={v} /> },
          { k: 'sneakN', label: 'Sneaks', r: 1, fmt: (v, r) => <span title={`staked ${$(r.sneakStaked)}, won ${$(r.sneakWon)}`}>{v ? `${v} (${r.sneakWins} won)` : '·'}</span> },
          { k: 'ins', label: 'Insurance', r: 1, fmt: (v) => (v ? <Sg v={v} /> : '·') },
          { k: 'house', label: 'As the house', r: 1, fmt: (v, r) => (v ? <span title={r.sneakAgainstN ? `${r.sneakAgainstN} sneak bets against them: ${$(r.sneakAgainst, { sign: true })}` : ''}><Sg v={v} /></span> : '·') },
          { k: 'lifetime', label: 'Lifetime (cash-outs)', r: 1, fmt: (v) => <Sg v={v} /> },
        ]} />
      </>}
      {sub === 'ledger' && <Ledger players={data.players} />}
    </div>
  );
}

// ------------------------------------------------------------------ Mines
function Mines({ data, pick }) {
  const [sub, setSub] = useState('summary');
  const m = data.mines; const t = m.totals;
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');
  return (
    <div className="ad-tab ad-fill">
      <Seg value={sub} onChange={setSub} opts={[['summary', 'Summary'], ['miners', 'Miners'], ['pvp', 'PvP & live']]} />
      {sub === 'summary' && <>
        <div className="ad-kpis">
          <Kpi label="Shifts" value={t.shifts.toLocaleString()} sub={`${t.active} underground now`} />
          <Kpi label="Paid out" value={$(t.earned)} tone="pos" />
          <Kpi label="Time in mines" value={dur(t.ms)} sub="timed shifts" />
          <Kpi label="Shift length" value={dur(t.avgMs)} sub={`median ${dur(t.medianMs)}`} />
          <Kpi label="Per hour" value={m.perHourAll != null ? $(m.perHourAll) : '—'} sub="pay ÷ time, all miners" tone="amber" />
          <Kpi label="Tracked since deploy" value={t.recordedEnds} sub={`${t.quits} quit · ${t.full} full · ${t.partial} partial`} />
        </div>
        <div className="ad-cols">
          <Panel title="How long shifts take"><Bars data={m.durations.map((d) => ({ label: d.label, value: d.n }))} height={110} color="#8dff5a" /></Panel>
          <Panel title="Outcomes"><HBars rows={m.outcomes.map((o) => ({ key: o.outcome, label: o.outcome, value: o.n, color: '#8dff5a' }))} fmt={(v) => v} /></Panel>
          <Panel title="Shifts per day" right={<small className="muted">30 days</small>}><Bars data={m.byDay.map((d) => ({ label: d.day.slice(8), value: d.n }))} height={110} every={5} color="#8dff5a" /></Panel>
          <Panel title="Encounters" right={<small className="muted">from {t.recordedStarts} tracked clock-ins</small>}>
            <ul className="ad-subs">
              <li><span>Nosferatu (the visitor)</span><b className="num">{t.scare} · {pct(t.scare, t.recordedStarts)}</b></li>
              <li><span>Faun follows</span><b className="num">{t.faun} · {pct(t.faun, t.recordedStarts)}</b></li>
              <li><span>Other faun skims the cheque</span><b className="num">{t.twin}</b></li>
              <li><span>Cave-ins</span><b className="num">{t.caveIns}</b></li>
              <li><span>Ambushes / bug battles</span><b className="num">{m.raids.length}</b></li>
            </ul>
          </Panel>
        </div>
      </>}
      {sub === 'miners' && <Grid compact rows={m.players} onRow={(r) => pick(r.id)} initial={{ k: 'earned', dir: -1 }} cols={[
        { k: 'name', label: 'Miner', fmt: (v) => <b>{v}</b> },
        { k: 'shifts', label: 'Shifts', r: 1 },
        { k: 'earned', label: 'Earned', r: 1, fmt: (v) => $(v) },
        { k: 'totalMs', label: 'Time', r: 1, fmt: (v) => dur(v) },
        { k: 'avgMs', label: 'Avg shift', r: 1, fmt: (v) => dur(v) },
        { k: 'perHour', label: '$/hour', r: 1, fmt: (v) => (v != null ? $(v) : '—') },
        { k: 'best', label: 'Best', r: 1, fmt: (v) => $(v) },
        { k: 'jackpots', label: 'Jackpots', r: 1 },
        { k: 'pvpw', label: 'PvP W–L', r: 1, val: (r) => r.pvp.won - r.pvp.lost, fmt: (v, r) => `${r.pvp.won}–${r.pvp.lost}` },
        { k: 'pvpc', label: 'PvP $', r: 1, val: (r) => r.pvp.cashWon - r.pvp.cashLost, fmt: (v, r) => <Sg v={r.pvp.cashWon - r.pvp.cashLost} /> },
        { k: 'quits', label: 'Quits', r: 1, val: (r) => r.recorded.quits, fmt: (v, r) => r.recorded.quits },
        { k: 'full', label: 'Full buckets', r: 1, val: (r) => r.recorded.full, fmt: (v, r) => `${r.recorded.full}/${r.recorded.ends}` },
        { k: 'enc', label: 'Nosf. · faun', r: 1, val: (r) => r.recorded.scare + r.recorded.faun, fmt: (v, r) => `${r.recorded.scare} · ${r.recorded.faun}` },
      ]} />}
      {sub === 'pvp' && <div className="ad-cols">
        <Panel title="Underground right now">{m.active.length ? <ul className="ad-feed">{m.active.map((a) => <li key={a.id} onClick={() => pick(a.id)}><span className="muted num">{ago(a.startedAt)}</span><span className="ell"><b>{a.name}</b> · shaft {a.shaft}</span><span className="num">{a.cap ? `${Math.round((100 * a.collected) / a.cap)}%` : ''}</span></li>)}</ul> : <p className="muted small ad-empty">Nobody.</p>}</Panel>
        <Panel title="Ambushes & bug battles" right={<small className="muted">last 30 days</small>}>{m.raids.length ? <ul className="ad-feed">{m.raids.map((x, i) => <li key={i}><span className="muted num">{when(x.at)}</span><span className="ell"><b onClick={() => pick(x.winner)}>{x.winnerName}</b> {x.kind === 'battle' ? 'beat' : 'ambushed'} <b onClick={() => pick(x.loser)}>{x.loserName}</b>{x.acid ? ` · ${x.acid} acid` : ''}{x.tobacco.length ? ` · ${x.tobacco.join(', ')}` : ''}</span><span className="num pos">{$(x.cash)}</span></li>)}</ul> : <p className="muted small ad-empty">No PvP yet.</p>}</Panel>
      </div>}
    </div>
  );
}

// ------------------------------------------------------------------ Usage
function Usage({ data, pick }) {
  const [sub, setSub] = useState('activity');
  const u = data.usage;
  const areaTotal = u.areas.reduce((a, x) => a + x.ms, 0);
  const hl = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
  return (
    <div className="ad-tab ad-fill">
      <Seg value={sub} onChange={setSub} opts={[['activity', 'Activity'], ['time', 'Time by area'], ['devices', 'Devices'], ['visits', 'Visits']]} />
      {sub === 'activity' && <>
        <div className="ad-kpis">
          <Kpi label="Visits tracked" value={u.visits} sub="15 min gap = new visit" />
          <Kpi label="Avg visit" value={dur(u.avgVisitMs)} sub={`median ${dur(u.medianVisitMs)}`} />
          <Kpi label="Sign-ins tracked" value={u.logins} sub={Object.entries(u.loginHow).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'} />
          <Kpi label="Live sessions" value={u.sessionsActive} sub="signed-in cookies" />
        </div>
        <div className="ad-cols">
          <Panel title="Daily active players" right={<small className="muted">30 days</small>}><Bars data={u.dau.map((d) => ({ label: d.day.slice(8), value: d.n, title: `${d.day}: ${d.n} players, ${d.visits} visits` }))} height={120} every={5} /></Panel>
          <Panel title="Busiest hours" right={<small className="muted">Denver time</small>}><Bars data={u.hours.map((v, h) => ({ label: hl(h), value: v }))} height={120} every={3} color="var(--amber)" /></Panel>
          <Panel title="Busiest days"><Bars data={Object.entries(u.dows).map(([k, v]) => ({ label: k, value: v }))} height={100} color="var(--amber)" /></Panel>
        </div>
      </>}
      {sub === 'time' && <div className="ad-cols">
        <Panel title="Where the time goes" right={<small className="muted">{dur(areaTotal)} total</small>}>
          {u.areas.length ? <HBars rows={u.areas.map((a) => ({ key: a.area, label: AREA[a.area] || a.area, value: Math.round(a.ms / 60000), color: 'var(--teal)', sub: areaTotal ? `${Math.round((100 * a.ms) / areaTotal)}%` : '' }))} fmt={(v) => dur(v * 60000)} /> : <p className="muted small ad-empty">Starts filling in after the deploy.</p>}
        </Panel>
        <Panel title="Playtime per player" className="ad-wide">
          <Grid compact rows={u.perPlayer.filter((r) => r.playMs || r.visits)} onRow={(r) => pick(r.id)} initial={{ k: 'playMs', dir: -1 }} empty="No tracked visits yet."
            cols={[{ k: 'name', label: 'Player', fmt: (v) => <b>{v}</b> }, { k: 'visits', label: 'Visits', r: 1 }, { k: 'playMs', label: 'Total', r: 1, fmt: (v) => dur(v) },
              ...['poker', 'blackjack', 'mines', 'slots', 'golf', 'barn', 'store', 'lobby'].map((k) => ({ k, label: AREA[k], r: 1, val: (r) => r.areas[k] || 0, fmt: (v, r) => (r.areas[k] ? dur(r.areas[k]) : <span className="muted">·</span>) })),
              { k: 'lastSeen', label: 'Last seen', r: 1, fmt: (v) => ago(v) }]} />
        </Panel>
      </div>}
      {sub === 'devices' && <Panel title="Devices" right={<small className="muted">{u.devices.filter((d) => d.mobile).reduce((a, d) => a + d.n, 0)} phone · {u.devices.filter((d) => !d.mobile).reduce((a, d) => a + d.n, 0)} other (players per device)</small>}>
        {u.devices.length ? <HBars rows={u.devices.map((d) => ({ key: d.device, label: d.device, value: d.n, color: d.mobile ? 'var(--coral)' : 'var(--teal)' }))} fmt={(v) => v} /> : <p className="muted small ad-empty">Starts filling in after the deploy.</p>}
      </Panel>}
      {sub === 'visits' && (u.recentVisits.length ? <ul className="ad-feed ad-visits">{u.recentVisits.map((v, i) => (
        <li key={i} onClick={() => pick(v.p)}><span className="muted num">{when(v.s)}</span>
          <span className="ell"><b>{v.name}</b> · {dur(v.e - v.s)} · {v.location} <small className="muted num">{v.ip} · {v.dev}</small><small className="muted"> {Object.entries(v.areas || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, ms]) => `${AREA[k] || k} ${dur(ms)}`).join(', ')}</small></span>
          <span className="num muted">{v.n} req</span></li>))}</ul> : <p className="muted small ad-empty">No tracked visits yet: they start with the deploy.</p>)}
    </div>
  );
}

// ------------------------------------------------------------------ Flags
function Flags({ data, pick }) {
  const a = data.anomalies;
  if (!a.length) return <p className="muted ad-empty">Nothing suspicious. Suspiciously.</p>;
  return (
    <div className="ad-tab ad-fill">
      <ul className="ad-flags">{a.map((x, i) => (
        <li key={i} className={`sev-${x.sev}`}><span className="ad-sev">{x.sev === 'med' ? 'watch' : x.sev}</span>
          <span>{x.text}{x.t ? <small className="muted"> · {when(x.t)}</small> : null}</span>
          <span className="ad-flag-who">{x.ids.slice(0, 4).map((id) => <button key={id} className="ad-btn" onClick={() => pick(id)}>{data.players.find((p) => p.id === id)?.name || 'view'}</button>)}</span></li>))}</ul>
    </div>
  );
}

// ------------------------------------------------------------------ Drilldown
function Drill({ id, onClose, players }) {
  const { data: d, error } = useLoad(`/admin/players/${id}`);
  const [sub, setSub] = useState('summary');
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="ad-drill-bg" onClick={onClose}>
      <aside className="ad-drill" onClick={(e) => e.stopPropagation()} aria-label="Player details">
        <header><div><h2>{d?.profile.name || '…'}</h2>{d && <small className="muted">{d.profile.username ? `@${d.profile.username} · ` : ''}{d.profile.kind}{d.profile.email ? ` · ${d.profile.email}` : ''} · joined {day(d.profile.createdAt)}</small>}</div><button className="ad-btn" onClick={onClose} aria-label="Close">✕</button></header>
        {error && <p className="neg">{error.message}</p>}
        {d && <>
          <Seg value={sub} onChange={setSub} opts={[['summary', 'Summary'], ['ips', `IPs (${d.ips.length})`], ['timeline', 'Logins'], ['ledger', 'Money'], ['mines', 'Mines'], ['games', 'Games']]} />
          <div className="ad-drill-body">
            {sub === 'summary' && <>
              <div className="ad-kpis">
                <Kpi label="Bankroll" value={$(d.worth.bankroll)} />
                <Kpi label="Net worth" value={$(d.worth.total)} sub={d.worth.holdings || d.worth.chips ? `holdings ${$(d.worth.holdings)} · chips ${$(d.worth.chips)}` : null} />
                <Kpi label="Last seen" value={ago(d.row.lastSeen)} sub={when(d.row.lastSeen)} />
                <Kpi label="Playtime" value={dur(d.row.playMs)} sub={`${d.row.visits} visits`} />
              </div>
              <Panel title="Where their money came from" right={d.partial ? <small className="muted">older history partial</small> : null}>
                <HBars rows={Object.entries(d.sources).filter(([k]) => k !== 'start').map(([k, v]) => ({ key: k, label: SRC[k], value: v.net, color: SRC_COLORS[k], sub: `${v.n}×` })).sort((a, b) => b.value - a.value)} fmt={(v) => $(v, { sign: true })} />
              </Panel>
              {Object.keys(d.areas).length > 0 && <Panel title="Time by area"><HBars rows={Object.entries(d.areas).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: AREA[k] || k, value: Math.round(v / 60000), color: 'var(--teal)' }))} fmt={(v) => dur(v * 60000)} /></Panel>}
            </>}
            {sub === 'ips' && (d.ips.length ? <Grid compact rowKey={(r) => r.ip} rows={d.ips} initial={{ k: 'last', dir: -1 }} cols={[
              { k: 'ip', label: 'IP', fmt: (v, r) => <span className="ad-name"><span className="num">{v}</span><small className="muted">{r.isp || ''}{r.proxy || r.hosting ? ' · VPN/hosting' : ''}{r.mobile ? ' · cellular' : ''}</small></span> },
              { k: 'location', label: 'Location', fmt: (v, r) => (r.lat != null ? <a className="ad-link" href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=10/${r.lat}/${r.lon}`} target="_blank" rel="noreferrer">{v}</a> : v) },
              { k: 'dev', label: 'Device' }, { k: 'n', label: 'Requests', r: 1 }, { k: 'first', label: 'First', r: 1, fmt: (v) => day(v) }, { k: 'last', label: 'Last', r: 1, fmt: (v) => when(v) }]} />
              : <p className="muted small ad-empty">No IPs yet. IP tracking starts with this deploy; nothing older was ever logged.</p>)}
            {sub === 'timeline' && (d.timeline.length ? <ul className="ad-feed">{d.timeline.map((x, i) => (
              <li key={i}><span className="muted num">{when(x.t)}</span>
                <span className="ell">{x.kind === 'visit' ? <>Visit · {dur(x.end - x.t)} · {x.n} requests <small className="muted">{Object.entries(x.areas || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, ms]) => `${AREA[k] || k} ${dur(ms)}`).join(', ')}</small></> : x.kind === 'login' ? <b>Signed in ({x.how})</b> : x.kind === 'logout' ? 'Signed out' : <>Session started <small className="muted">~</small></>}</span>
                <small className="muted num r">{x.ip || ''}{x.dev ? ` · ${x.dev}` : ''}</small></li>))}</ul> : <p className="muted small ad-empty">Nothing tracked yet.</p>)}
            {sub === 'ledger' && <Ledger players={players} fixedPlayer={id} compact />}
            {sub === 'mines' && <>
              <div className="ad-kpis">
                <Kpi label="Shifts" value={d.mines.shifts} sub={`best ${$(d.mines.best)} · ${d.mines.jackpots} jackpots`} />
                <Kpi label="Earned" value={$(d.mines.earned)} />
                <Kpi label="Time" value={dur(d.mines.totalMs)} sub={`avg ${dur(d.mines.avgMs)}`} />
                <Kpi label="Per hour" value={d.mines.perHour != null ? $(d.mines.perHour) : '—'} />
                <Kpi label="PvP" value={`${d.mines.pvp.won}–${d.mines.pvp.lost}`} sub={`${$(d.mines.pvp.cashWon)} won · ${$(d.mines.pvp.cashLost)} lost`} />
              </div>
              <ul className="ad-feed">{d.mines.list.map((s, i) => <li key={i}><span className="muted num">{when(s.t)}</span>
                <span className="ell">{s.outcome || s.reason || 'shift'}{s.ms ? ` · ${dur(s.ms)}` : ''}{s.cap ? ` · ${s.collected}/${s.cap}` : ''}{s.scare ? ' · Nosferatu' : ''}{s.faun ? ' · faun' : ''}{s.twin ? ` · faun took ${$(s.twin)}` : ''}{s.spill ? ' · cave-in' : ''}{s.r ? <small className="muted"> ~</small> : null}</span>
                <span className="num">{$(s.amt || 0)}</span></li>)}</ul>
            </>}
            {sub === 'games' && <div className="ad-cols">
              <Panel title="Poker"><ul className="ad-subs"><li><span>Hands</span><b className="num">{d.poker.handsPlayed || 0}</b></li><li><span>Won</span><b className="num">{d.poker.handsWon || 0} ({d.poker.handsPlayed ? Math.round((100 * d.poker.handsWon) / d.poker.handsPlayed) : 0}%)</b></li><li><span>Biggest pot</span><b className="num">{$(d.poker.biggestPot || 0)}</b></li><li><span>Net (ledger)</span><Sg v={d.sources.poker?.net || 0} /></li></ul></Panel>
              <Panel title="Blackjack">{d.bj || d.bjSeat ? <ul className="ad-subs">
                {d.bjSeat && <><li><span>Rounds · tables</span><b className="num">{d.bjSeat.rounds} · {d.bjSeat.tables}</b></li><li><span>Wagered → returned</span><b className="num">{$(d.bjSeat.wagered)} → {$(d.bjSeat.won)}</b></li></>}
                {d.bj && <><li><span>Main bets</span><Sg v={d.bj.hands} /></li><li><span>Royal Match / Pairs</span><span><Sg v={d.bj.match} /> / <Sg v={d.bj.pairs} /></span></li>
                  <li><span>Sneak bets</span><b className="num">{d.bj.sneakN} · won {$(d.bj.sneakWon)}</b></li><li><span>Insurance</span><Sg v={d.bj.ins} /></li><li><span>As the house</span><Sg v={d.bj.house} /></li></>}
                <li><span>Lifetime (cash-outs)</span><Sg v={d.bjLifetime} /></li></ul> : <p className="muted small">Never played.</p>}</Panel>
              <Panel title="Slots">{d.slots ? <ul className="ad-subs"><li><span>Spins</span><b className="num">{d.slots.spins}</b></li><li><span>Wagered → won</span><b className="num">{$(d.slots.wagered)} → {$(d.slots.won)}</b></li><li><span>Return</span><b className="num">{d.slots.wagered ? Math.round((100 * d.slots.won) / d.slots.wagered) : 0}%</b></li><li><span>Biggest</span><b className="num">{$(d.slots.biggest)}</b></li></ul> : <p className="muted small">Never played.</p>}</Panel>
              <Panel title="Other"><ul className="ad-subs"><li><span>Faun gifts</span><Sg v={d.sources.fawn?.net || 0} /></li><li><span>Foff golf</span><Sg v={d.sources.golf?.net || 0} /></li><li><span>Store spend</span><Sg v={d.sources.store?.net || 0} /></li><li><span>Investing (realized)</span><Sg v={d.invest.realized || 0} /></li></ul></Panel>
            </div>}
          </div>
        </>}
      </aside>
    </div>
  );
}

export default function AdminPage() {
  const { me, loading: sessionLoading } = useSession();
  const qs = new URLSearchParams(window.location.search);
  const [tab, setTabState] = useState(TABS.some(([k]) => k === qs.get('tab')) ? qs.get('tab') : 'overview');
  const [drill, setDrill] = useState(qs.get('p') || null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => { const mq = window.matchMedia('(max-width: 760px)'); const on = () => setNarrow(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  useEffect(() => { document.title = "Back office · Buffalo Bill's Academy"; }, []);
  const { data, error, loading, reload } = useLoad('/admin/report', [me?.id]);
  const setTab = (k) => { setTabState(k); const u = new URL(window.location.href); u.searchParams.set('tab', k); window.history.replaceState({}, '', u); };
  const pick = (id) => { if (!id) return; setDrill(id); const u = new URL(window.location.href); u.searchParams.set('p', id); window.history.replaceState({}, '', u); };
  const close = useCallback(() => { setDrill(null); const u = new URL(window.location.href); u.searchParams.delete('p'); window.history.replaceState({}, '', u); }, []);

  if (sessionLoading) return <div className="ad-root" />;
  if (error?.status === 403 || error?.status === 401 || (!me && !loading)) return <div className="ad-root ad-locked"><p>Nothing to see here.</p><button className="ad-btn" onClick={() => navigate('/')}>Back to the Academy</button></div>;
  const o = data?.overview;
  return (
    <div className="ad-root">
      <header className="ad-top">
        <button className="ad-home" onClick={() => navigate('/')} aria-label="Back to the Academy">←</button>
        <h1>Back office</h1>
        <nav className="ad-tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'anomalies' && data?.anomalies.length ? <i className="ad-count">{data.anomalies.length}</i> : null}</button>)}</nav>
        <button className="ad-btn ad-refresh" onClick={reload} disabled={loading} aria-label="Refresh">{loading ? '…' : '↻'}</button>
      </header>
      {o && <div className="ad-since small muted">Denver time · tracking since {o.since ? when(o.since) : 'this deploy'}: IPs, devices, visits and shift details exist only from then. Older money is rebuilt from each player's last 200 transactions (marked ~).</div>}
      <main className="ad-main">
        {error && error.status !== 403 && <p className="neg ad-empty">{error.message}</p>}
        {!data && !error && <p className="muted ad-empty">Counting the money…</p>}
        {data && tab === 'overview' && <Overview data={data} pick={pick} />}
        {data && tab === 'players' && <Players data={data} pick={pick} narrow={narrow} />}
        {data && tab === 'money' && <Money data={data} pick={pick} />}
        {data && tab === 'mines' && <Mines data={data} pick={pick} />}
        {data && tab === 'usage' && <Usage data={data} pick={pick} />}
        {data && tab === 'anomalies' && <Flags data={data} pick={pick} />}
      </main>
      {drill && data && <Drill id={drill} onClose={close} players={data.players} />}
    </div>
  );
}
