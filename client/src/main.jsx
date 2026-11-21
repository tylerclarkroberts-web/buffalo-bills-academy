import React from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted, SIL Open Font License fonts (bundled by Vite from @fontsource)
import '@fontsource/anton/latin-400.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/yellowtail/latin-400.css';
import '@fontsource/rye/latin-400.css';
import '@fontsource/monoton/latin-400.css';
import App from './App.jsx';
import './styles.css';
import './neon.css';
import './themes/themes.css';
import { unlockSfx } from './bj/sfx.js';

// iOS Safari 100vh includes the dynamic toolbar and causes a scrollable page.
// --app-h tracks the visual viewport so the dealer table stays one tight screen.
function bindAppHeight() {
  const set = () => {
    try {
      const h = Math.round(window.visualViewport?.height || window.innerHeight);
      document.documentElement.style.setProperty('--app-h', `${h}px`);
    } catch { /* */ }
  };
  set();
  window.visualViewport?.addEventListener('resize', set);
  window.visualViewport?.addEventListener('scroll', set);
  window.addEventListener('orientationchange', set);
  window.addEventListener('resize', set);
  window.addEventListener('pageshow', set);
}
bindAppHeight();
const unlock = () => { try { unlockSfx(); } catch { /* */ } };
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('touchstart', unlock, { passive: true });
window.addEventListener('keydown', unlock);

createRoot(document.getElementById('root')).render(<App />);
