// Bug battles on the leaderboard: everyone's win % (all fights, or one kind), and one player's fights in detail.
// Totals come from server/battles.js: older records frozen at the first boot plus every fight logged since.
import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { navigate } from './App.jsx';
import { Bust } from './avatar/Bust.jsx';
import { Paged, Tabs, useWide, useMedia } from './ui.jsx';
import { money } from './util.js';
import { useModes } from './modes/Modes.jsx';
import { familyHandle } from './modes/family.js';
import { rankBattles, RANK_MIN } from './battleRank.js';

export const BATTLE_KINDS = [['bout', 'Bouts', 'Barn bout'], ['wild', 'Wild', 'Wild bug'], ['raid', 'Raids', 'Mine battle'], ['circuit', 'Circuit', 'Circuit']];
const KIND = Object.fromEntries(BATTLE_KINDS.map(([k, , one]) => [k, one]));
const pctOf = (r) => (r.pct == null ? '—' : `${Math.round(r.pct * 100)}%`);
const wl = (r) => `${r.w}–${r.l}${r.d ? `–${r.d}` : ''}`;
const day = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dayOnly = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

export function BoardTabs({ value }) {
  return <Tabs label="Leaderboard" value={value} onChange={(k) => navigate(k === 'battles' ? '/leaderboard/battles' : '/leaderboard')} tabs={[['money', 'Money'], ['battles', 'Bug battles']]} />;
}

function Coverage({ coverage }) {
  return (
    <details className="board-help">
      <summary>What counts?</summary>
      <div>
        <p>Every finished bug fight: Barn bouts, wild bugs and other miners down the mine, and the Bug Circuit. Win % leaves out draws. A circuit draw goes to the home corner, so it is a loss.</p>
        <p>Fight-by-fight logging began {coverage?.liveSince ? dayOnly(coverage.liveSince) : 'with this update'}. Older totals come from each bug's own record: Barn bouts and mine fights for bugs still kept (a traded bug took its record with it; graves keep none), and every mine battle against another miner. Circuit fights were never counted before, so they start then.</p>
        <p>Older fights with details: the last 20 Barn bouts and mine battles against miners{coverage?.oldestDetail ? ` since ${dayOnly(coverage.oldestDetail)}` : ''}. Older wild-bug fights have totals only.</p>
      </div>
    </details>
  );
}

export function BattleBoard() {
  const { safe: family } = useModes();
  const handle = (n) => (family ? familyHandle(n) : n);
  const wide = useWide();
  const shortLand = useMedia('(orientation: landscape) and (max-height: 520px) and (min-width: 600px)');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('all');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    document.title = "Bug battles · Buffalo Bill's Academy";
    let current = true;
    setErr('');
    api('GET', '/battles').then((data) => { if (current) setD(data); }).catch((e) => { if (current) setErr(e.message); });
    return () => { current = false; };
  }, [retry]);
  const rows = d ? rankBattles(d.rows, kind) : [];
  return (
    <div className="screen leaderboard battles" data-test="battle-board">
      <div className="page-head battle-head"><h1 className="display h2">Leader<span className="script neon-pink">board</span></h1><Coverage coverage={d?.coverage} /></div>
      <BoardTabs value="battles" />
      <div className="seg battle-kinds" role="tablist" aria-label="Kind of fight">
        {[['all', 'All'], ...BATTLE_KINDS].map(([k, label]) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} data-test={`battle-kind-${k}`} onClick={() => setKind(k)}>{label}</button>)}
      </div>
      {err ? <div className="row wrap"><p className="error" role="alert">{err}</p><button className="btn small" onClick={() => setRetry((n) => n + 1)}>Retry</button></div> : !d ? <p className="muted" role="status">Loading…</p> : (
        <Paged items={rows} rowH={wide || shortLand ? 58 : 60} gap={4} className="board-list battle-list" resetKey={kind}
          empty={<p className="muted" data-test="battle-board-empty">No bug fights {kind === 'all' ? 'yet' : `of this kind yet`}.</p>}
          render={(r, i) => {
            const rec = kind === 'all' ? r.total : r.by[kind];
            const sub = kind === 'all'
              ? BATTLE_KINDS.filter(([k]) => r.by[k].n).map(([k, label]) => `${label} ${wl(r.by[k])}`).join(' · ')
              : `${rec.n} fight${rec.n === 1 ? '' : 's'}${rec.w + rec.l < RANK_MIN ? ' · not ranked yet' : ''}`;
            return <button className={`brow battle-row ${r.id === d.me ? 'me' : ''}`} data-test={`battle-row-${i}`} onClick={() => navigate(`/leaderboard/battles/${r.id}`)}>
              <span className="rank">{String(i + 1).padStart(2, '0')}</span>
              <Bust id={r.id} avatar={r.avatar} size={wide ? 44 : 32} still={!wide} />
              <span className="who-cell"><span className="nm">{handle(r.name)}</span><span className="brk">{sub}</span></span>
              <span className="battle-score"><span className="worth">{pctOf(rec)}</span><span className="battle-wl">{wl(rec)}</span></span>
            </button>;
          }} />
      )}
    </div>
  );
}

function Rewards({ b }) {
  const bits = [];
  if (b.cash) bits.push(<b key="c" className={b.cash > 0 ? 'pos' : 'neg'}>{money(b.cash, { sign: true })}</b>);
  if (b.xp) bits.push(<b key="x" className="xp">+{b.xp} XP</b>);
  if (b.pot && !b.cash) bits.push(<span key="p">pot {money(b.pot)}</span>);
  return bits.length ? <span className="bt-rew">{bits}</span> : null;
}

export function BattleDetail({ id }) {
  const { safe: family } = useModes();
  const handle = (n) => (family ? familyHandle(n) : n);
  const wide = useWide();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('all');
  useEffect(() => {
    let current = true;
    setD(null); setErr('');
    api('GET', `/battles/${encodeURIComponent(id)}`).then((data) => { if (current) { setD(data); document.title = `${data.name}'s bug fights · Buffalo Bill's Academy`; } })
      .catch((e) => { if (current) setErr(e.message); });
    return () => { current = false; };
  }, [id]);
  const history = d ? (kind === 'all' ? d.history : d.history.filter((b) => b.type === kind)) : [];
  const foe = (b) => (b.them.id ? `${handle(b.them.name)}'s ${b.them.bug?.name || 'bug'}` : b.them.bug?.name && !b.them.name.includes(b.them.bug.name) ? `${b.them.name} · ${b.them.bug.name}` : b.them.name);
  const lv = (bug) => (bug?.level ? ` Lv ${bug.level}` : '');
  return (
    <div className="screen leaderboard battles battle-detail" data-test="battle-detail">
      <div className="bd-head">
        <button className="linkish bd-back" onClick={() => navigate('/leaderboard/battles')}>‹ Bug battles</button>
        {d && <button className="linkish bd-profile" onClick={() => navigate(d.self ? '/profile' : `/players/${d.id}`)}>Profile ›</button>}
      </div>
      {err ? <p className="error" role="alert">{err}</p> : !d ? <p className="muted" role="status">Loading…</p> : (
        <>
          <div className="bd-who">
            <Bust id={d.id} avatar={d.avatar} size={wide ? 56 : 44} still={!wide} />
            <div className="bd-name"><h1 className="display h2">{handle(d.name)}</h1><span className="brk mono">{wl(d.total)} · {d.total.n} fight{d.total.n === 1 ? '' : 's'}</span></div>
            <span className="worth bd-pct" data-test="battle-detail-pct">{pctOf(d.total)}</span>
          </div>
          <div className="bd-kinds" role="tablist" aria-label="Kind of fight">
            {BATTLE_KINDS.map(([k, label]) => {
              const r = d.by[k];
              return <button key={k} role="tab" aria-selected={kind === k} className={`bd-kind ${kind === k ? 'on' : ''}`} data-test={`battle-detail-kind-${k}`} onClick={() => setKind(kind === k ? 'all' : k)}>
                <span className="label">{label}</span><span className="value">{pctOf(r)}</span><span className="sub">{wl(r)}</span>
              </button>;
            })}
          </div>
          <Paged items={history} rowH={wide ? 52 : 56} gap={0} className="bd-list" resetKey={kind}
            header={<div className="bd-list-head"><span>{kind === 'all' ? 'Fights' : KIND[kind]}</span><span className="muted">{history.length ? `${history.length} with details` : ''}</span></div>}
            empty={<p className="muted small" data-test="battle-detail-empty">{d.total.n ? 'No fight-by-fight details for these yet. New fights show up here.' : 'No bug fights yet.'}</p>}
            render={(b) => (
              <div className={`bt-row ${b.result}`} data-test="battle-history-row">
                <span className={`bt-res ${b.result}`} aria-label={b.result}>{b.result === 'won' ? 'W' : b.result === 'lost' ? 'L' : 'D'}</span>
                <span className="bt-main">
                  <span className="bt-line"><b>{b.bug?.name || 'No bug'}</b>{lv(b.bug)} <span className="muted">vs</span> {foe(b)}{lv(b.them.bug)}</span>
                  <span className="bt-meta">{KIND[b.type]}{b.note ? ` · ${b.note}` : ''} · {day(b.at)}{b.reason ? ` · ${b.reason === 'roid rage' ? 'roid rage' : 'walked off'}` : ''}</span>
                </span>
                <Rewards b={b} />
              </div>
            )} />
        </>
      )}
    </div>
  );
}
