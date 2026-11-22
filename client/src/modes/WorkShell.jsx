import React, { useEffect, useRef, useState } from 'react';
import { useModes, ModeToggles, ModeRail } from './Modes.jsx';
import './work.css';

const TITLE = 'How to Optimize Performance Using AI to Drive Shareholder Value';
const DEK = 'A field memo for operators who already know the answer is leadership, and would like that in writing.';
const AUTHOR = 'Lee Ghand E.';
const ROLE = 'Distinguished Fellow in Value Creation';

function Chart() {
  // Modest upward slope: the only shape a steering committee truly trusts.
  const pts = [
    [0, 78], [16, 72], [32, 68], [48, 58], [64, 49], [80, 38], [100, 22],
  ];
  const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ');
  const area = `${d} L 100 100 L 0 100 Z`;
  return (
    <figure className="work-chart" data-test="work-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Illustrative chart of AI-attributed productivity rising from FY24 to FY26">
        <line x1="0" y1="25" x2="100" y2="25" className="work-grid" />
        <line x1="0" y1="50" x2="100" y2="50" className="work-grid" />
        <line x1="0" y1="75" x2="100" y2="75" className="work-grid" />
        <path d={area} className="work-area" />
        <path d={d} className="work-line" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.6" className="work-dot" />)}
      </svg>
      <div className="work-chart-axis" aria-hidden="true"><span>FY24</span><span>FY25</span><span>FY26</span></div>
      <figcaption>Figure 1. AI-attributed productivity, FY24–FY26 (illustrative). The slope is intentional.</figcaption>
    </figure>
  );
}

export default function WorkShell({ children }) {
  const { work } = useModes();
  const [open, setOpen] = useState(true);
  const exhibit = useRef(null);
  // On a game route, collapse the memo so the exhibit stays usable.
  useEffect(() => {
    const sync = () => {
      const path = window.location.pathname;
      const inGame = /^\/(t|scum|bj|multi|mines|elhalo|barn|slots|foff|room|rooms)\b/.test(path);
      setOpen(!inGame);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [work]);


  useEffect(() => {
    if (!work) return undefined;
    const el = exhibit.current;
    if (!el) return undefined;
    const set = () => {
      const h = Math.max(240, Math.round(el.clientHeight));
      el.style.setProperty('--app-h', `${h}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener('resize', set);
    return () => { ro.disconnect(); window.removeEventListener('resize', set); };
  }, [work, open]);

  if (!work) {
    return (
      <>
        {children}
        <ModeRail />
      </>
    );
  }

  return (
    <div className="work-root" data-test="work-article">
      <header className="work-mast">
        <div className="work-mast-inner">
          <p className="work-kicker">The Quarterly Memo</p>
          <p className="work-mast-title">Value, properly instrumented</p>
        </div>
        <div className="work-mast-tools">
          <ModeToggles compact />
        </div>
      </header>

      <div className={`work-lede ${open ? 'open' : 'shut'}`}>
        <button type="button" className="work-fold" data-test="work-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide memo' : 'Read the memo'}
        </button>
        {open && (
          <article className="work-article">
            <h1 className="work-hed">{TITLE}</h1>
            <p className="work-dek">{DEK}</p>
            <div className="work-byline">
              <span className="work-author">{AUTHOR}</span>
              <span className="work-role">{ROLE}</span>
              <span className="work-meta">November 2026 · 7 min read</span>
              <button type="button" className="work-sub" data-test="work-subscribe" onClick={(e) => e.currentTarget.classList.toggle('on')}>
                Subscribe
              </button>
            </div>
            <p>In moments of genuine leadership, one notices that the organization was already performing — and that what it required was not a new strategy so much as the courage to recognize the one already in the room. This is that recognition.</p>
            <p>The modern enterprise does not merely adopt AI. It invites AI to sit at the table, to listen, and, with appropriate humility, to confirm what leadership has known all along: that excellence, properly instrumented, compounds. Our mandate is simple. We will optimize performance. We will use AI. We will provide more shareholder value. Not as a slogan, but as an operating system.</p>
            <blockquote className="work-pull">
              <p>Shareholder value is not extracted. It is cultivated — preferably on a slide with a modest upward slope.</p>
            </blockquote>
            <p>It would be immodest to credit any single architect of this agenda. It would also be inaccurate not to. The vision is, as ever, top-down in the best sense: clear, generous, and already working. What follows is the live operating cadence, rendered for the steering committee.</p>
          </article>
        )}
      </div>

      <figure className="work-exhibit" data-test="work-exhibit">
        <figcaption className="work-exhibit-cap">
          Figure 2. Real-time value-creation cockpit. Interactive.
        </figcaption>
        <div className="work-exhibit-frame" ref={exhibit}>
          {children}
        </div>
      </figure>

      {open && (
        <footer className="work-close">
          <Chart />
          <p>We remain, as always, grateful for the opportunity to exceed — and then to exceed the exceeding. Please circulate this memo to anyone who still requires convincing. They will not.</p>
          <p className="work-signoff">— {AUTHOR}</p>
        </footer>
      )}
    </div>
  );
}
