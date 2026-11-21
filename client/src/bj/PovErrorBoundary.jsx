// Any render exception inside the 3D dealer POV falls back to the classic felt
// so the house can keep dealing. Error boundaries do not catch event-handler or
// rAF failures; those call onError from the scene separately.
import React from 'react';

export default class PovErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    try { console.error('[dealer-pov] crashed:', error, info?.componentStack); } catch { /* */ }
    try { this.props.onError?.(error); } catch { /* */ }
  }
  render() {
    if (this.state.error) return this.props.fallback || null;
    return this.props.children;
  }
}
