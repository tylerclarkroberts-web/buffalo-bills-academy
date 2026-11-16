// Keeps the back office from ever going blank. Anything that throws while loading or drawing the dashboard
// (a lazy-chunk that failed to download, a render crash on odd data) shows a message and a reload button.
// Inline styles on purpose: these screens must show even if a stylesheet (or an ad blocker's element-hiding
// list) takes out the dashboard's own classes.
import React from 'react';

export const BO_SCREEN = { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
  padding: 24, background: '#170812', color: '#fbf4ea', textAlign: 'center', font: '400 15px/1.45 Inter, system-ui, sans-serif' };
export const BO_BUTTON = { background: '#ffb547', color: '#170812', border: 0, borderRadius: 999, padding: '8px 16px', font: '600 14px Inter, system-ui, sans-serif', cursor: 'pointer', textDecoration: 'none' };

/** A full-screen message: the loading, signed-out, not-allowed and error states all use it. */
export function BoScreen({ title, children, testId }) {
  return (
    <div style={BO_SCREEN} data-testid={testId} role="status">
      {title ? <h1 style={{ margin: 0, font: '400 22px/1.2 Anton, Impact, sans-serif', textTransform: 'uppercase', color: '#ffb547' }}>{title}</h1> : null}
      {children}
    </div>
  );
}

export default class AdminBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[back office] crashed:', error, info?.componentStack); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Importing a module script failed|preload/i.test(String(error?.message || ''));
    return (
      <BoScreen title="Back office hit a snag" testId="bo-crash">
        <p style={{ margin: 0, maxWidth: 520, opacity: 0.85 }}>{chunk ? 'The dashboard didn’t finish downloading (usually right after an update).' : 'Something on this page broke while drawing it.'} Reloading usually fixes it.</p>
        <code style={{ fontSize: 12, opacity: 0.6, maxWidth: 560, overflowWrap: 'anywhere' }}>{String(error?.message || error)}</code>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={BO_BUTTON} onClick={() => window.location.reload()}>Reload</button>
          <a style={{ ...BO_BUTTON, background: 'transparent', color: '#fbf4ea', border: '1px solid rgba(251,244,234,.3)' }} href="/">Back to the Academy</a>
        </div>
      </BoScreen>
    );
  }
}
