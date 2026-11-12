import React, { useEffect, useRef, useState } from 'react';
import { navigate, goToMines } from './App.jsx';
import Fawn from './fawn/Fawn.jsx';
import { useSession, signInUrl, signOut } from './api.js';
import { Mark, VENUE, TOANA } from './theme.jsx';
import { Bust } from './avatar/Bust.jsx';
import { BrokeHost } from './Broke.jsx';
import { money } from './util.js';
import { useMedia } from './ui.jsx';

export function Link({ to, className = '', children, ...rest }) {
  return <a href={to} className={className} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); navigate(to); }} {...rest}>{children}</a>;
}

const I = {
  tables: <><ellipse cx="12" cy="12" rx="9" ry="6" /><ellipse cx="12" cy="12" rx="5" ry="2.8" /></>,
  fist: <path d="M7 11V7.5a1.5 1.5 0 0 1 3 0V10m0-3a1.5 1.5 0 0 1 3 0v3m0-2.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.5A5.5 5.5 0 0 1 5 14.5V12a1.5 1.5 0 0 1 2-1" />,
  invest: <path d="M3 18 L9 12 L13 15 L21 6 M16 6 H21 V11" />,
  board: <path d="M4 20 V13 H9 V20 M10 20 V8 H15 V20 M16 20 V11 H21 V20" />,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21 C5 15 19 15 20 21" /></>,
  out: <path d="M14 4 H20 V20 H14 M10 8 L6 12 L10 16 M6 12 H16" />,
  store: <path d="M3 10 L5 4 H19 L21 10 M3 10 H21 M3 10 Q3 13 6 13 Q9 13 9 10 Q9 13 12 13 Q15 13 15 10 Q15 13 18 13 Q21 13 21 10 M5 13 V21 H19 V13 M10 21 V16 H14 V21" />,
  barn: <path d="M3 21 V10 L12 4 L21 10 V21 Z M8 21 V14 H16 V21 M8 14 L16 21 M16 14 L8 21" />,
  pick: <path d="M4 20 L14 10 M9 5 C13 3 18 4 21 8 C17 7 14 7 11 9 Z" />,
};
const Ico = ({ k }) => <svg viewBox="0 0 24 24" aria-hidden="true" className="ico">{I[k]}</svg>;

function AccountMenu({ me }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', off);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', off); window.removeEventListener('keydown', key); };
  }, [open]);
  const go = (to) => { setOpen(false); navigate(to); };
  return (
    <div className="acct" ref={box}>
      <button className={`acct-chip ${open ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} title="Your account">
        <span className="acct-face"><Bust id={me.id} avatar={me.avatar} size={28} still /></span>
        <b className="num">{money(me.bankroll)}</b>
        <span className="caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="am-head">
            <b className="ell">{me.name}</b>
            <span className="small muted">Net worth <b className="num amber">{money(me.worth.total)}</b></span>
          </div>
          <button role="menuitem" onClick={() => go('/?tab=tables')}><Ico k="tables" />Your tables</button>
          <button role="menuitem" onClick={() => go('/profile')}><Ico k="profile" />Profile</button>
          <button role="menuitem" onClick={() => go('/profile/face')}><Ico k="profile" />Change avatar</button>
          <button role="menuitem" onClick={() => go('/room')}><Ico k="barn" />My Room</button>
          <button role="menuitem" onClick={() => go('/leaderboard')}><Ico k="board" />Leaderboard</button>
          <button role="menuitem" onClick={() => go('/invest')}><Ico k="invest" />Invest</button>
          <button role="menuitem" onClick={() => go('/conquest')}><Ico k="board" />Risk bets</button>
          <button role="menuitem" className="am-out" onClick={async () => { setOpen(false); await signOut(); navigate('/'); }}><Ico k="out" />Sign out</button>
        </div>
      )}
    </div>
  );
}

function GamesMenu({ me }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const outside = (e) => { if (!box.current?.contains(e.target)) close(); };
    const key = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); close(); trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', key);
    window.addEventListener('popstate', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', key);
      window.removeEventListener('popstate', close);
    };
  }, [open]);
  return (
    <div className="games-nav" ref={box} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button type="button" ref={trigger} className="btn small games-toggle" aria-expanded={open} aria-controls="games-navigation" onClick={() => setOpen(!open)}>
        Games <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <nav id="games-navigation" className="acct-menu games-menu" aria-label="Games" onClick={() => setOpen(false)}>
          <Link to="/conquest"><Ico k="board" />Risk bets</Link>
          <button type="button" onClick={goToMines}><Ico k="pick" />Acid Mines</button>
          {me && <Link to="/barn" data-test="barn-btn"><Ico k="barn" />Barn</Link>}
          {me && <Link to="/store" data-test="store-btn"><Ico k="store" />General Store</Link>}
        </nav>
      )}
    </div>
  );
}

export function Shell({ path, children }) {
  const { me, config } = useSession();
  const compactNav = !useMedia('(min-width: 1100px)');
  return (
    <div className="app">
      <a href="#main" className="sr-only">Skip to content</a>
      <header className="topbar">
        {!compactNav && <Link to="/" className="wordmark" aria-label={`${VENUE.name}, the card room`}><Mark size={24} /><b className="script">{VENUE.short}</b><span className="hide-xs">Academy</span></Link>}
        {compactNav && <Link to="/?tab=tables" className="btn small tables-link"><Ico k="tables" />Tables</Link>}
        <div className="tb-right">
          {compactNav ? <GamesMenu me={me} /> : <>
          <Link to="/conquest" className="barn-btn" title="ConquestK and play-money Risk bets"><Ico k="board" /><span>Risk bets</span></Link>
          <button className="mines-btn" onClick={goToMines} title="Work a shift in the Acid Mines"><Ico k="pick" /><span>Acid Mines</span></button>
          {me && <Link to="/barn" className="barn-btn" title="Your barn" data-test="barn-btn"><Ico k="barn" /><span>Barn</span></Link>}
          {me && <Link to="/store" className="barn-btn store-btn" title="The General Store (play money)" aria-label="General Store" data-test="store-btn"><Ico k="store" /><span>General Store</span></Link>}
          </>}
          {me ? <AccountMenu me={me} /> : (config.google ? <a className="btn small light" href={signInUrl()}>Sign in</a> : <Link to="/" className="btn small light">Sign in</Link>)}
        </div>
      </header>
      <main id="main" className="stage">{children}<Fawn /></main>
      <footer className="legal">
        {/* The course name is a door. It is not supposed to look like one. */}
        <span className="toana">{TOANA.split('Toana Vista')[0]}<button type="button" className="toana-door" onClick={() => navigate('/foff')}>Toana Vista</button>.</span><span className="dot hide-s">·</span>
        <span>Play money only. Not affiliated with any casino, resort or golf course.</span>
        <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
      </footer>
      <BrokeHost me={me} />
    </div>
  );
}
