import React from 'react';
import { useModes, ModeToggles, ModeRail, useElHaloImmersive } from './Modes.jsx';
import './work.css';

const TITLE = 'How to Optimize Performance Using AI to Drive Shareholder Value';
const DEK = 'A field memo for operators who already know the answer is leadership, and would like that in writing.';
const AUTHOR = 'Lee Ghand E.';
const ROLE = 'Distinguished Fellow in Value Creation';

export default function WorkShell({ children }) {
  const { work } = useModes();
  const elhalo = useElHaloImmersive();

  // FAM / WORK must not wrap El Halo: Work Mode parks the live app in a 1px
  // box (which breaks the WebGL canvas) and Family Mode's rail covers the
  // phone controls. The rest of the site keeps both modes.
  if (elhalo) return children;

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

      <article className="work-article">
        <h1 className="work-hed">{TITLE}</h1>
        <p className="work-dek">{DEK}</p>
        <div className="work-byline">
          <span className="work-author">{AUTHOR}</span>
          <span className="work-role">{ROLE}</span>
          <span className="work-meta">November 2026 · 9 min read</span>
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
        <p>The cadence is, by design, uneventful. Each morning the same questions are asked, and each afternoon the same answers arrive, only slightly improved. This is not inertia. This is discipline. We do not chase novelty; we allow performance to recognize itself, at regular intervals, in a room already furnished with the right people.</p>
        <p>AI's contribution is best understood as a courtesy. It prepares the materials, anticipates the obvious objections, and, when invited, restates the conclusion leadership had reached before the meeting was scheduled. The model does not replace judgment. It documents that judgment was already sound — and it does so at a speed the quarterly cycle can finally respect.</p>
        <blockquote className="work-pull">
          <p>The best operating system is the one that makes yesterday's decision look inevitable.</p>
        </blockquote>
        <p>There will be those who ask what, precisely, has changed. The honest reply is that very little needed to. Targets were already ambitious. Culture was already a competitive advantage. What we have added is only a finer instrument: a way to see, in something close to real time, that value was being created all along. The committee will find this reassuring. It was meant to be.</p>
        <p>That is the whole of the program. It will be reviewed, of course, and then reviewed again, and each review will confirm what this memo has already made plain: the work is underway, the slope is upward, and the committee's confidence is, as ever, well placed.</p>
      </article>
      <footer className="work-close">
        <p>We remain, as always, grateful for the opportunity to exceed — and then to exceed the exceeding. Please circulate this memo to anyone who still requires convincing. They will not.</p>
        <p className="work-signoff">— {AUTHOR}</p>
      </footer>
      {/* Keep the live app mounted but hidden so turning Work Mode off restores it immediately. */}
      <div className="work-exhibit parked" data-test="work-exhibit" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
